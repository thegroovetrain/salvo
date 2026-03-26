import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, AiDifficulty } from '@salvo/shared';
import crypto from 'node:crypto';
import { getLobby, getConnections, getGuestSessions, emitToPlayer } from '../emitters.js';
import {
  createGame, addPlayer, addBot, removeBot, canStartGame, startGame,
  placeShips, allShipsPlaced, beginPlaying, updateGameOptions, toClientView,
} from '../game.js';
import { generatePlacement } from '../ai/index.js';
import { autoAssignTeam } from '../helpers.js';
import { startPlacementTimer, clearPlacementTimer } from '../timers/index.js';
import { emitNextTurn } from '../gameFlow.js';
import { broadcastOnlineCount } from '../queue/index.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

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

function autoPlaceBotShips(game: ReturnType<typeof createGame>): void {
  for (const player of game.players.values()) {
    if (player.isBot && player.aiDifficulty) {
      const placement = generatePlacement(player.aiDifficulty, game.rings, game.islands);
      placeShips(game, player.id, placement);
    }
  }
}

export function registerLobbyHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();

  socket.on('create-game', ({ playerName }: { playerName: string }) => {
    const playerId = crypto.randomUUID();
    // Defaults: FFA, 60s timer, 5 rings
    const game = createGame(playerId, playerName);

    const code = lobby.generateUniqueCode();

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
    socket.emit('game-state', { game: toClientView(game, playerId) });
    broadcastOnlineCount();
  });

  socket.on('update-game-options', (data: { gameType?: 'ffa' | '2-team' | '3-team'; timerSeconds?: number | null; rings?: number }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = updateGameOptions(game, playerId, data);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    // Emit game state to all players
    for (const pid of game.players.keys()) {
      const view = toClientView(game, pid);
      emitToPlayer(pid, 'game-state', { game: view });
    }
  });

  socket.on('join-game', ({ code, playerName }: { code: string; playerName: string }) => {
    const game = lobby.getGameByCode(code);
    if (!game) {
      socket.emit('error', { message: 'Invalid game code' });
      return;
    }

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

    // Broadcast updated state to all players
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'player-joined', { game: toClientView(game, pid) });
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

  socket.on('start-game', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = canStartGame(game, playerId);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

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
  });
}
