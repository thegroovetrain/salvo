import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, AiDifficulty } from '@salvo/shared';
import crypto from 'node:crypto';
import { getLobby, getConnections, getGuestSessions, getPartyManager, getIO, emitToPlayer, emitGameState } from '../emitters.js';
import {
  createGame, addPlayer, addBot, removeBot, canStartGame, startGame,
  placeShips, allShipsPlaced, beginPlaying, updateGameOptions, toClientView,
  removePlayer, resetGameToLobby,
} from '../game.js';
import { getLobbyCapabilities } from '../capabilities.js';
import { generatePlacement } from '../ai/index.js';
import { autoAssignTeam } from '../helpers.js';
import { startPlacementTimer, clearPlacementTimer, registerGameCleanup } from '../timers/index.js';
import { emitNextTurn } from '../gameFlow.js';
import { broadcastOnlineCount, isInQueue, getTicketByGuest, dissolveTicket } from '../queue/index.js';
import { generateGloballyUniqueCode, resolveJoinCode } from '../joinCode.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

function fillPartyMembersIntoLobby(
  io: ReturnType<typeof getIO>,
  game: ReturnType<typeof createGame>,
  memberGuestIds: string[],
  code: string,
): void {
  const connections = getConnections();
  const guestSessions = getGuestSessions();

  for (const memberGuestId of memberGuestIds) {
    const memberSocketId = guestSessions.getSocketId(memberGuestId);
    if (!memberSocketId) continue; // disconnected — auto-reattach on reconnect

    // Skip members already in a game
    const session = guestSessions.getSession(memberGuestId);
    if (session?.gameId) continue;

    const memberName = guestSessions.getName(memberGuestId) ?? 'Player';
    const memberId = crypto.randomUUID();

    const err = addPlayer(game, memberId, memberName);
    if (err) continue; // game full or other issue

    connections.register(memberId, memberSocketId, game.id);
    guestSessions.bindToGame(memberGuestId, memberId, game.id);

    const memberSocket = io.sockets.sockets.get(memberSocketId);
    if (memberSocket) {
      memberSocket.join(game.id);
      memberSocket.emit('game-created', { code, playerId: memberId, gameId: game.id });
    }
  }

  // Broadcast final state with capabilities to all players
  emitGameState(game.id);
}

function assignBotToTeam(game: ReturnType<typeof createGame>, botId: string, team?: string): void {
  if (!game.teamsEnabled) return;

  if (team === 'alpha' || team === 'bravo' || team === 'charlie') {
    let teamCount = 0;
    for (const t of game.teams.values()) {
      if (t === team) teamCount++;
    }
    if (teamCount < 2) {
      game.teams.set(botId, team);
      return;
    }
  }
  autoAssignTeam(game, botId);
}

function broadcastToHumans(game: ReturnType<typeof createGame>, event: string, viewBuilder: (pid: string) => unknown): void {
  for (const pid of game.players.keys()) {
    if (!game.players.get(pid)?.isBot) {
      emitToPlayer(pid, event, viewBuilder(pid));
    }
  }
}

// ============================================================
// Lobby Countdown Timers
// ============================================================

const countdownTimers = new Map<string, NodeJS.Timeout>();

function startLobbyCountdown(game: ReturnType<typeof createGame>): void {
  if (countdownTimers.has(game.id)) return; // already counting down

  const deadline = Date.now() + 5000;
  broadcastToHumans(game, 'start-countdown', () => ({ deadline }));

  const timer = setTimeout(() => {
    countdownTimers.delete(game.id);
    launchGame(game);
  }, 5000);

  countdownTimers.set(game.id, timer);
}

function cancelLobbyCountdown(game: ReturnType<typeof createGame>): void {
  const timer = countdownTimers.get(game.id);
  if (timer) {
    clearTimeout(timer);
    countdownTimers.delete(game.id);
    broadcastToHumans(game, 'start-countdown-cancelled', () => undefined);
  }
}

export function clearLobbyCountdown(gameId: string): void {
  const timer = countdownTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    countdownTimers.delete(gameId);
  }
}

export function hasLobbyCountdown(gameId: string): boolean {
  return countdownTimers.has(gameId);
}

// Register lobby countdown cleanup with game timer system
registerGameCleanup(clearLobbyCountdown);

function launchGame(game: ReturnType<typeof createGame>): void {
  startGame(game);
  autoPlaceBotShips(game);

  const startPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  broadcastToHumans(game, 'placement-phase', (pid) => ({ game: toClientView(game, pid), placementDeadline: startPlacementDeadline }));

  if (game.timerConfig.enabled) {
    startPlacementTimer(game.id);
  }

  if (allShipsPlaced(game)) {
    clearPlacementTimer(game.id);
    beginPlaying(game);
    broadcastToHumans(game, 'all-ready', (pid) => ({ game: toClientView(game, pid) }));
    emitNextTurn(game.id);
  }
}

function autoPlaceBotShips(game: ReturnType<typeof createGame>): void {
  for (const player of game.players.values()) {
    if (player.isBot && player.aiDifficulty) {
      const placement = generatePlacement(player.aiDifficulty, game.rings, game.islands);
      placeShips(game, player.id, placement);
    }
  }
}

function kickHumanPlayer(game: ReturnType<typeof createGame>, targetPlayerId: string): void {
  const connections = getConnections();
  const guestSessions = getGuestSessions();
  const lobby = getLobby();

  emitToPlayer(targetPlayerId, 'player-kicked', { reason: 'You were removed from the game' });
  removePlayer(game, targetPlayerId);
  lobby.unregisterPlayer(targetPlayerId);

  const kickedGuestId = guestSessions.getGuestIdByPlayer(targetPlayerId);
  if (kickedGuestId) guestSessions.unbindFromGame(kickedGuestId);

  const kickedSocketId = connections.getSocketId(targetPlayerId);
  if (kickedSocketId) {
    const kickedSocket = getIO().sockets.sockets.get(kickedSocketId);
    if (kickedSocket) kickedSocket.leave(game.id);
  }
  connections.remove(targetPlayerId);
}

function isPartyQueued(partyManager: ReturnType<typeof getPartyManager>, code: string): boolean {
  const targetParty = partyManager.getPartyByCode(code);
  if (!targetParty) return false;
  for (const memberId of targetParty.members.keys()) {
    if (isInQueue(memberId)) return true;
  }
  return false;
}

function dissolveJoinerTicket(guestId: string): void {
  if (!isInQueue(guestId)) return;
  const ticket = getTicketByGuest(guestId);
  if (ticket) dissolveTicket(ticket.id);
}

function broadcastPartyUpdate(party: { members: Map<string, unknown> }, payload: unknown, excludeGuestId: string): void {
  const guestSessions = getGuestSessions();
  for (const memberId of party.members.keys()) {
    if (memberId !== excludeGuestId) {
      const memberSocketId = guestSessions.getSocketId(memberId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (memberSocketId) getIO().to(memberSocketId).emit('party-updated' as any, payload as any);
    }
  }
}

/** Handle a join-game code that resolved to a party. Returns true if handled. */
function handleJoinPartyViaCode(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  code: string,
  playerName: string,
  partyId: string,
): boolean {
  const guestSessions = getGuestSessions();
  const partyManager = getPartyManager();

  const guestId = guestSessions.getGuestIdBySocket(socket.id);
  if (!guestId) { socket.emit('error', { message: 'Session not found' }); return true; }

  if (isPartyQueued(partyManager, code)) { socket.emit('party-error', { reason: 'target-party-queued' }); return true; }

  const existing = partyManager.getPartyByGuest(guestId);
  if (existing && existing.partyId !== partyId) { socket.emit('party-error', { reason: 'already-in-party' }); return true; }
  if (existing && existing.partyId === partyId) return true;

  dissolveJoinerTicket(guestId);
  guestSessions.setName(guestId, playerName);
  const result = partyManager.joinParty(guestId, code);
  if (!result.ok) { socket.emit('party-error', { reason: result.reason }); return true; }

  const payload = partyManager.toPayload(result.party);
  socket.emit('party-joined', payload);
  broadcastPartyUpdate(result.party, payload, guestId);
  return true;
}

export function registerLobbyHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();

  socket.on('create-game', ({ playerName }: { playerName: string }) => {
    const io = getIO();
    const partyManager = getPartyManager();
    const playerId = crypto.randomUUID();
    // Defaults: FFA, 60s timer, 5 rings
    const game = createGame(playerId, playerName);

    const code = generateGloballyUniqueCode(partyManager, lobby);

    lobby.addGame(game, code);
    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, socket.id, game.id);
    socket.join(game.id);

    // Bind guest session to game + persist name
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (guestId) {
      guestSessions.bindToGame(guestId, playerId, game.id);
      guestSessions.setName(guestId, playerName);
    }

    socket.emit('game-created', { code, playerId, gameId: game.id });
    socket.emit('game-state', { game: toClientView(game, playerId), capabilities: getLobbyCapabilities(game, playerId) });

    // Party → lobby bridge: auto-fill party members
    if (guestId) {
      const party = partyManager.getPartyByGuest(guestId);
      if (party) {
        // Collect member guestIds before dissolving
        const memberGuestIds = [...party.members.keys()].filter(id => id !== guestId);
        // Dissolve party BEFORE binding members to game (avoids members-in-game check)
        partyManager.disbandParty(party.partyId, guestId);
        fillPartyMembersIntoLobby(io, game, memberGuestIds, code);
      }
    }

    broadcastOnlineCount();
  });

  socket.on('update-game-options', (data: { gameType?: 'ffa' | '2-team' | '3-team'; timerSeconds?: number | null; rings?: number; turnMode?: 'sequential' | 'simultaneous' }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = updateGameOptions(game, playerId, data);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    if (countdownTimers.has(game.id)) cancelLobbyCountdown(game);
    emitGameState(game.id);
  });

  socket.on('join-game', ({ code, playerName }: { code: string; playerName: string }) => {
    const partyManager = getPartyManager();

    // Unified code resolution: party codes take precedence
    const resolved = resolveJoinCode(code, partyManager, lobby);
    if (resolved.type === 'party') {
      handleJoinPartyViaCode(socket, code, playerName, resolved.party.partyId);
      return;
    }

    if (resolved.type === 'invalid') {
      socket.emit('error', { message: 'Invalid code' });
      return;
    }

    // resolved.type === 'game'
    const game = resolved.game;
    const playerId = crypto.randomUUID();
    const err = addPlayer(game, playerId, playerName);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    // Auto-assign to team with fewer members in team games
    if (game.teamsEnabled) {
      autoAssignTeam(game, playerId);
    }

    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, socket.id, game.id);
    socket.join(game.id);

    // Bind guest session to game + persist name
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (guestId) {
      guestSessions.bindToGame(guestId, playerId, game.id);
      guestSessions.setName(guestId, playerName);
    }

    socket.emit('game-created', { code: code.toUpperCase(), playerId, gameId: game.id });

    // Cancel countdown if active (lobby state changed)
    if (countdownTimers.has(game.id)) cancelLobbyCountdown(game);

    // Broadcast updated state to all players (includes capabilities for lobby)
    for (const pid of game.players.keys()) {
      const view = toClientView(game, pid);
      const capabilities = game.phase === 'lobby' ? getLobbyCapabilities(game, pid) : undefined;
      emitToPlayer(pid, 'player-joined', { game: view, capabilities });
    }
  });

  socket.on('add-bot', ({ difficulty, team, slotIndex }: { difficulty: AiDifficulty; team?: string; slotIndex?: number }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.hostId !== playerId) {
      socket.emit('error', { message: 'Only the host can add bots' });
      return;
    }

    const result = addBot(game, difficulty, slotIndex);
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    assignBotToTeam(game, result.botId, team);

    broadcastToHumans(game, 'player-joined', (pid) => ({ game: toClientView(game, pid) }));
  });

  socket.on('remove-bot', ({ botId }: { botId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.hostId !== playerId) {
      socket.emit('error', { message: 'Only the host can remove bots' });
      return;
    }

    const err = removeBot(game, botId);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    broadcastToHumans(game, 'player-joined', (pid) => ({ game: toClientView(game, pid) }));
  });

  socket.on('start-game', (data?: { force?: boolean }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = canStartGame(game, playerId);
    if (err) { socket.emit('error', { message: err }); return; }

    const caps = getLobbyCapabilities(game, playerId);
    if (!caps.canStart) { socket.emit('error', { message: 'You must be ready to start the game' }); return; }

    // Green path: all ready → 5s countdown (unless force skips)
    if (caps.allPlayersReady && !data?.force) { startLobbyCountdown(game); return; }
    // Amber path: must explicitly confirm with force
    if (!data?.force) { socket.emit('error', { message: 'Not all players are ready' }); return; }

    launchGame(game);
  });

  // ============================================================
  // Toggle Ready (all human players)
  // ============================================================

  socket.on('toggle-ready', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;

    const player = game.players.get(playerId);
    if (!player || player.isBot) return;

    const current = game.readyStates.get(playerId) ?? false;
    game.readyStates.set(playerId, !current);

    // Any player un-readying during countdown cancels it
    if (current && countdownTimers.has(game.id)) {
      cancelLobbyCountdown(game);
    }

    emitGameState(game.id);
  });

  // ============================================================
  // Kick Player/Bot (host only, replaces remove-bot)
  // ============================================================

  socket.on('kick-player', ({ targetPlayerId }: { targetPlayerId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;
    if (game.hostId !== playerId) {
      socket.emit('error', { message: 'Only the host can kick players' });
      return;
    }
    if (targetPlayerId === playerId) return; // can't kick yourself

    const target = game.players.get(targetPlayerId);
    if (!target) return;

    if (target.isBot) {
      removeBot(game, targetPlayerId);
    } else {
      kickHumanPlayer(game, targetPlayerId);
    }

    if (countdownTimers.has(game.id)) cancelLobbyCountdown(game);
    emitGameState(game.id);
  });

  // ============================================================
  // Transfer Host (manual)
  // ============================================================

  socket.on('transfer-host', ({ targetPlayerId }: { targetPlayerId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'lobby') return;
    if (game.hostId !== playerId) return;

    const target = game.players.get(targetPlayerId);
    if (!target || target.isBot || targetPlayerId === playerId) return;
    // Don't transfer to a disconnected player
    if (!connections.getSocketId(targetPlayerId)) return;

    game.hostId = targetPlayerId;

    // Cancel countdown if active (host changed)
    if (countdownTimers.has(game.id)) {
      cancelLobbyCountdown(game);
    }

    emitGameState(game.id);
  });

  // ============================================================
  // Return to Lobby (custom games, after game-over)
  // ============================================================

  socket.on('return-to-lobby', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;
    if (game.phase !== 'finished') return;
    if (game.mode !== 'private') return; // only custom games

    resetGameToLobby(game);
    emitGameState(game.id);
  });
}
