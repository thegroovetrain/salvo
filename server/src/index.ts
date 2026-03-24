import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClientToServerEvents, ServerToClientEvents, ChatMessage,
  TimerConfig, ShipPlacement, AiDifficulty, QuickPlayMode, ChatChannel,
} from '@salvo/shared';
import { isPlayerAlive, playerShotCount, toGameMode, toQuickPlayMode, getTeammates, MODE_RINGS } from '@salvo/shared';
import {
  createGame, addPlayer, addBot, removeBot, removePlayer, canStartGame, startGame, updateGameOptions,
  placeShips, allShipsPlaced, beginPlaying,
  getCurrentTurnPlayerId, validateSalvo, fireSalvo,
  advanceTurn, checkGameOver, forfeitPlayer,
  toClientView, resetForRematch,
} from './game.js';
import { chooseSalvo, generatePlacement, getBotDelay } from './ai.js';
import { ConnectionManager } from './connections.js';
import { LobbyManager } from './lobby.js';
import crypto from 'node:crypto';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: '*' },
});

const lobby = new LobbyManager();
const connections = new ConnectionManager();

// Turn timers: gameId → timeout handle
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Placement timers: gameId → timeout handle
const placementTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Forfeit timers (disconnected player's turn): gameId → timeout handle
const forfeitTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ============================================================
// Quick Play Queue State
//
//   LOBBY ──quickplay-join──► QUEUED ──match──► IN_GAME
//     ▲                         │                  │
//     │                         │                  │
//     └──quickplay-leave────────┘                  │
//     └──disconnect─────────────┘                  │
//     └──rematch-requeue───────────────────────────┘
// ============================================================

const queueEntries = new Map<string, { playerName: string; mode: QuickPlayMode }>();

function getQueueRoomName(mode: QuickPlayMode): string {
  return `quickplay-${mode}`;
}

function getQueueSize(roomName: string): number {
  return io.sockets.adapter.rooms.get(roomName)?.size ?? 0;
}

function broadcastOnlineCount(): void {
  io.emit('online-count', { count: io.sockets.sockets.size });
}

/** Try to create a match from players in a queue room. Called from join handler and requeue. */
function getTargetSize(mode: QuickPlayMode): number {
  switch (mode) {
    case '1v1': return 2;
    case '2v2': return 4;
    case '3v3': return 6;
    case '3ffa': return 3;
    case '6ffa': return 6;
    case '2v2v2': return 6;
  }
}

function isTeamMode(mode: QuickPlayMode): boolean {
  return mode === '2v2' || mode === '3v3' || mode === '2v2v2';
}

function tryMatchRoom(roomName: string, mode: QuickPlayMode): void {
  const target = getTargetSize(mode);
  const size = getQueueSize(roomName);
  if (size < target) return;

  const roomSockets = io.sockets.adapter.rooms.get(roomName);
  if (!roomSockets) return;

  const matchedSocketIds = [...roomSockets].slice(0, target);
  const gameMode = toGameMode(mode);

  // Create the game with the first player as host
  const firstEntry = queueEntries.get(matchedSocketIds[0]);
  const hostId = crypto.randomUUID();
  const game = createGame(
    hostId,
    firstEntry?.playerName ?? 'Player',
    { enabled: true, seconds: 60 },
    gameMode,
    isTeamMode(mode),
    MODE_RINGS[gameMode],
  );

  const code = lobby.generateUniqueCode();
  lobby.addGame(game, code);
  lobby.registerPlayer(hostId, game.id);
  connections.register(hostId, matchedSocketIds[0], game.id);

  const firstSocket = io.sockets.sockets.get(matchedSocketIds[0]);
  if (firstSocket) {
    firstSocket.leave(roomName);
    firstSocket.join(game.id);
  }
  queueEntries.delete(matchedSocketIds[0]);

  io.to(matchedSocketIds[0]).emit('quickplay-matched', { playerId: hostId, gameId: game.id });

  // Collect all player IDs for team assignment
  const allPlayerIds: string[] = [hostId];

  // Add remaining players
  for (let i = 1; i < matchedSocketIds.length; i++) {
    const sid = matchedSocketIds[i];
    const entry = queueEntries.get(sid);
    const playerId = crypto.randomUUID();
    addPlayer(game, playerId, entry?.playerName ?? 'Player');
    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, sid, game.id);

    const playerSocket = io.sockets.sockets.get(sid);
    if (playerSocket) {
      playerSocket.leave(roomName);
      playerSocket.join(game.id);
    }
    queueEntries.delete(sid);

    io.to(sid).emit('quickplay-matched', { playerId, gameId: game.id });
    allPlayerIds.push(playerId);
  }

  // Assign teams for team modes
  if (isTeamMode(mode)) {
    // Shuffle allPlayerIds for random team assignment
    for (let i = allPlayerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPlayerIds[i], allPlayerIds[j]] = [allPlayerIds[j], allPlayerIds[i]];
    }
    game.teamsEnabled = true;

    if (mode === '2v2') {
      // 2 teams of 2
      game.teams.set(allPlayerIds[0], 'alpha');
      game.teams.set(allPlayerIds[1], 'alpha');
      game.teams.set(allPlayerIds[2], 'bravo');
      game.teams.set(allPlayerIds[3], 'bravo');
    } else if (mode === '3v3') {
      // 2 teams of 3
      game.teams.set(allPlayerIds[0], 'alpha');
      game.teams.set(allPlayerIds[1], 'alpha');
      game.teams.set(allPlayerIds[2], 'alpha');
      game.teams.set(allPlayerIds[3], 'bravo');
      game.teams.set(allPlayerIds[4], 'bravo');
      game.teams.set(allPlayerIds[5], 'bravo');
    } else if (mode === '2v2v2') {
      // 3 teams of 2
      game.teams.set(allPlayerIds[0], 'alpha');
      game.teams.set(allPlayerIds[1], 'alpha');
      game.teams.set(allPlayerIds[2], 'bravo');
      game.teams.set(allPlayerIds[3], 'bravo');
      game.teams.set(allPlayerIds[4], 'charlie');
      game.teams.set(allPlayerIds[5], 'charlie');
    }
  }

  // Start the game immediately (skip lobby phase)
  startGame(game);

  // Emit placement phase to all players
  const qpPlacementDeadline = game.timerConfig.enabled
    ? Date.now() + game.timerConfig.seconds * 1000
    : undefined;
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid), placementDeadline: qpPlacementDeadline });
  }

  // Start placement timer for Quick Play games
  startPlacementTimer(game.id);

  broadcastOnlineCount();
}

// ============================================================
// Helpers
// ============================================================

/** Auto-assign a player to the team with fewer members (alpha first, then bravo). */
/** Assign player to the team with fewest members. Ties break: alpha → bravo → charlie. */
function autoAssignTeam(game: import('@salvo/shared').Game, playerId: string): void {
  // Deterministic team names from host's game type choice
  const teamNames = game.gameType === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];

  const counts = new Map<string, number>();
  for (const name of teamNames) counts.set(name, 0);
  for (const teamId of game.teams.values()) {
    if (counts.has(teamId)) counts.set(teamId, counts.get(teamId)! + 1);
  }

  // Pick team with fewest players (ties favor earlier in order)
  let minTeam = teamNames[0];
  let minCount = counts.get(minTeam) ?? 0;
  for (const name of teamNames) {
    const c = counts.get(name) ?? 0;
    if (c < minCount) {
      minTeam = name;
      minCount = c;
    }
  }
  game.teams.set(playerId, minTeam);
}

function emitToPlayer(playerId: string, event: string, data: unknown): void {
  // Buffer if disconnected, otherwise emit directly
  if (connections.bufferEvent(playerId, event, data)) return;

  const socketId = connections.getSocketId(playerId);
  if (socketId) {
    io.to(socketId).emit(event as any, data as any);
  }
}

function emitGameState(gameId: string): void {
  const game = lobby.getGame(gameId);
  if (!game) return;

  for (const playerId of game.players.keys()) {
    const view = toClientView(game, playerId);
    emitToPlayer(playerId, 'game-state', { game: view });
  }
}

function broadcastToGame(gameId: string, event: string, data: unknown): void {
  const game = lobby.getGame(gameId);
  if (!game) return;

  for (const playerId of game.players.keys()) {
    emitToPlayer(playerId, event, data);
  }
}

// ============================================================
// Placement Timer
// ============================================================

function startPlacementTimer(gameId: string): void {
  const game = lobby.getGame(gameId);
  if (!game) return;
  if (!game.timerConfig.enabled) return;

  clearPlacementTimer(gameId);

  const timer = setTimeout(() => {
    handlePlacementTimeout(gameId);
  }, game.timerConfig.seconds * 1000);

  placementTimers.set(gameId, timer);
}

function clearPlacementTimer(gameId: string): void {
  const timer = placementTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    placementTimers.delete(gameId);
  }
}

function handlePlacementTimeout(gameId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || game.phase !== 'placement') return;

  // Auto-place ships for all unready players
  for (const player of game.players.values()) {
    if (player.ships.length === 0) {
      const placement = generatePlacement('easy', game.rings, game.islands);
      const err = placeShips(game, player.id, placement);
      if (err) {
        console.warn(`Auto-placement failed for ${player.id}: ${err}`);
      }
    }
  }

  if (allShipsPlaced(game)) {
    beginPlaying(game);
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'all-ready', { game: toClientView(game, pid) });
    }
    emitNextTurn(game.id);
  }
}

// ============================================================
// Turn Timer
// ============================================================

function startTurnTimer(gameId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || !game.timerConfig.enabled) return;

  clearTurnTimer(gameId);

  const currentPlayerId = getCurrentTurnPlayerId(game);
  if (!currentPlayerId) return;

  const timer = setTimeout(() => {
    handleTurnTimeout(gameId, currentPlayerId);
  }, game.timerConfig.seconds * 1000);

  turnTimers.set(gameId, timer);
}

function clearTurnTimer(gameId: string): void {
  const timer = turnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(gameId);
  }
}

function handleTurnTimeout(gameId: string, playerId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Only timeout if it's still this player's turn
  if (getCurrentTurnPlayerId(game) !== playerId) return;

  broadcastToGame(gameId, 'turn-timeout', { playerId });

  // Skip to next player
  advanceTurn(game);
  emitNextTurn(gameId);
}

// ============================================================
// Forfeit Timer (disconnected player's turn)
// ============================================================

function startForfeitTimer(gameId: string, playerId: string): void {
  clearForfeitTimer(playerId);

  const game = lobby.getGame(gameId);
  const seconds = game?.timerConfig.enabled ? game.timerConfig.seconds : 60;

  const timer = setTimeout(() => {
    handleForfeitTimeout(gameId, playerId);
  }, seconds * 1000);

  forfeitTimers.set(playerId, timer);
}

function clearForfeitTimer(playerId: string): void {
  const timer = forfeitTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(playerId);
  }
}

function clearGameTimers(gameId: string): void {
  clearPlacementTimer(gameId);
  const game = lobby.getGame(gameId);
  if (game) {
    for (const playerId of game.players.keys()) {
      clearForfeitTimer(playerId);
    }
  }
  clearTurnTimer(gameId);
}

function handleForfeitTimeout(gameId: string, playerId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Only forfeit if it's still this player's turn and they're still disconnected
  if (getCurrentTurnPlayerId(game) !== playerId) return;
  if (!connections.isDisconnected(playerId)) return;

  forfeitPlayer(game, playerId);
  const player = game.players.get(playerId);

  broadcastToGame(gameId, 'player-eliminated', {
    playerId,
    playerName: player?.name ?? 'Unknown',
    reason: 'forfeit' as const,
  });

  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearTurnTimer(gameId);
    clearForfeitTimer(playerId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  advanceTurn(game);
  emitNextTurn(gameId);
}

// ============================================================
// Turn Emission
// ============================================================

function emitNextTurn(gameId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  const currentPlayerId = getCurrentTurnPlayerId(game);
  if (!currentPlayerId) return;

  const player = game.players.get(currentPlayerId);
  if (!player) return;

  // Send updated game state to everyone
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'game-state', { game: toClientView(game, pid) });
  }

  // If it's a bot's turn, auto-fire after a delay
  if (player.isBot && player.aiDifficulty) {
    const delay = getBotDelay(player.aiDifficulty);
    setTimeout(() => {
      executeBotTurn(gameId, currentPlayerId);
    }, delay);
    return; // don't emit your-turn or start timer for bots
  }

  // If the current turn player is disconnected, start forfeit timer
  if (connections.isDisconnected(currentPlayerId)) {
    startForfeitTimer(gameId, currentPlayerId);
    // Do NOT emit 'your-turn' to the disconnected player
    return;
  }

  emitToPlayer(currentPlayerId, 'your-turn', {
    shotCount: playerShotCount(player),
    timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
  });

  startTurnTimer(gameId);
}

function executeBotTurn(gameId: string, botId: string): void {
  const game = lobby.getGame(gameId);
  if (!game || game.phase !== 'playing') return;
  if (getCurrentTurnPlayerId(game) !== botId) return; // turn may have changed

  const bot = game.players.get(botId);
  if (!bot || !bot.aiDifficulty) return;

  const coords = chooseSalvo(game, botId, bot.aiDifficulty);
  if (coords.length === 0) return;

  const err = validateSalvo(game, botId, coords);
  if (err) {
    // Bot produced invalid salvo — skip turn (shouldn't happen, but be safe)
    advanceTurn(game);
    emitNextTurn(gameId);
    return;
  }

  const alreadyDead = new Set(
    [...game.players.values()].filter(p => !isPlayerAlive(p)).map(p => p.id)
  );

  const results = fireSalvo(game, botId, coords);

  // Broadcast shot results to all players
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'shot-results', {
      shooterId: botId,
      shooterName: bot.name,
      shots: results,
      game: toClientView(game, pid),
    });
  }

  // Check for eliminations (only newly dead players)
  for (const player of game.players.values()) {
    if (!isPlayerAlive(player) && !alreadyDead.has(player.id)) {
      broadcastToGame(gameId, 'player-eliminated', {
        playerId: player.id,
        playerName: player.name,
        reason: 'sunk' as const,
      });
    }
  }

  // Check game over
  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearTurnTimer(gameId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  // Advance turn
  advanceTurn(game);
  emitNextTurn(gameId);
}

// ============================================================
// Shared Player Exit Logic
// ============================================================

function handlePlayerExit(game: ReturnType<typeof lobby.getGame> & {}, playerId: string, gameId: string): void {
  if (game.phase !== 'playing') {
    const player = game.players.get(playerId);
    broadcastToGame(gameId, 'player-eliminated', {
      playerId,
      playerName: player?.name ?? 'Unknown',
      reason: 'forfeit' as const,
    });
    removePlayer(game, playerId);
    lobby.registerPlayer(playerId, '');

    const remainingHumans = [...game.players.values()].filter(p => !p.isBot);
    if (remainingHumans.length === 0) {
      clearGameTimers(gameId);
      lobby.removeGame(gameId);
      broadcastOnlineCount();
    } else if (remainingHumans.length < 2 && game.phase !== 'finished') {
      // Fewer than 2 humans in placement/lobby — destroy the game
      for (const p of remainingHumans) {
        emitToPlayer(p.id, 'error', { message: 'Game ended — not enough players' });
      }
      clearGameTimers(gameId);
      lobby.removeGame(gameId);
      broadcastOnlineCount();
    }
    return;
  }

  // Playing phase
  const wasTurn = getCurrentTurnPlayerId(game) === playerId;
  if (wasTurn) {
    clearTurnTimer(gameId);
    clearForfeitTimer(playerId);
  }

  forfeitPlayer(game, playerId);
  const player = game.players.get(playerId);

  broadcastToGame(gameId, 'player-eliminated', {
    playerId,
    playerName: player?.name ?? 'Unknown',
    reason: 'forfeit' as const,
  });

  const gameOver = checkGameOver(game);
  if (gameOver) {
    clearTurnTimer(gameId);
    clearForfeitTimer(playerId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  if (wasTurn) {
    advanceTurn(game);
    emitNextTurn(gameId);
  }
}

// ============================================================
// Socket Event Handlers
// ============================================================

io.on('connection', (socket) => {
  // Broadcast updated online count (nextTick ensures the new socket's listeners are ready)
  process.nextTick(() => broadcastOnlineCount());

  socket.on('create-game', ({ playerName }: { playerName: string }) => {
    const playerId = crypto.randomUUID();
    // Defaults: FFA, 60s timer, 5 rings
    const game = createGame(playerId, playerName);

    const code = lobby.generateUniqueCode();

    lobby.addGame(game, code);
    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, socket.id, game.id);
    socket.join(game.id);

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

    emitGameState(game.id);
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

    socket.emit('game-created', { code: code.toUpperCase(), playerId, gameId: game.id });

    // Broadcast updated state to all players
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'player-joined', { game: toClientView(game, pid) });
    }
  });

  socket.on('add-bot', ({ difficulty, team }: { difficulty: AiDifficulty; team?: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.hostId !== playerId) {
      socket.emit('error', { message: 'Only the host can add bots' });
      return;
    }

    const result = addBot(game, difficulty);
    if ('error' in result) {
      socket.emit('error', { message: result.error });
      return;
    }

    // Auto-assign bot to team in team games
    if (game.teamsEnabled && 'botId' in result) {
      // If a valid team was specified and that team has room, assign there
      if (team === 'alpha' || team === 'bravo' || team === 'charlie') {
        let teamCount = 0;
        for (const t of game.teams.values()) {
          if (t === team) teamCount++;
        }
        if (teamCount < 2) {
          game.teams.set(result.botId, team);
        } else {
          autoAssignTeam(game, result.botId);
        }
      } else {
        autoAssignTeam(game, result.botId);
      }
    }

    // Broadcast updated state
    for (const pid of game.players.keys()) {
      if (!game.players.get(pid)?.isBot) {
        emitToPlayer(pid, 'player-joined', { game: toClientView(game, pid) });
      }
    }
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

    // Broadcast updated state
    for (const pid of game.players.keys()) {
      if (!game.players.get(pid)?.isBot) {
        emitToPlayer(pid, 'player-joined', { game: toClientView(game, pid) });
      }
    }
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

    // Auto-place ships for all bots
    for (const player of game.players.values()) {
      if (player.isBot && player.aiDifficulty) {
        const placement = generatePlacement(player.aiDifficulty, game.rings, game.islands);
        placeShips(game, player.id, placement);
      }
    }

    const startPlacementDeadline = game.timerConfig.enabled
      ? Date.now() + game.timerConfig.seconds * 1000
      : undefined;
    for (const pid of game.players.keys()) {
      if (!game.players.get(pid)?.isBot) {
        emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid), placementDeadline: startPlacementDeadline });
      }
    }

    // Start placement timer if enabled
    if (game.timerConfig.enabled) {
      startPlacementTimer(game.id);
    }

    // If all ships are now placed (only bots, or solo with bots), start playing
    if (allShipsPlaced(game)) {
      clearPlacementTimer(game.id);
      beginPlaying(game);
      for (const pid of game.players.keys()) {
        if (!game.players.get(pid)?.isBot) {
          emitToPlayer(pid, 'all-ready', { game: toClientView(game, pid) });
        }
      }
      emitNextTurn(game.id);
    }
  });

  socket.on('place-ships', ({ ships }: { ships: ShipPlacement[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = placeShips(game, playerId, ships);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    if (allShipsPlaced(game)) {
      clearPlacementTimer(game.id);
      beginPlaying(game);

      for (const pid of game.players.keys()) {
        emitToPlayer(pid, 'all-ready', { game: toClientView(game, pid) });
      }

      // Emit first turn
      emitNextTurn(game.id);
    } else {
      // Update state for everyone (shows who has placed)
      for (const pid of game.players.keys()) {
        emitToPlayer(pid, 'game-state', { game: toClientView(game, pid) });
      }
    }
  });

  socket.on('fire', ({ coords }: { coords: string[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = validateSalvo(game, playerId, coords);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    clearTurnTimer(game.id);

    const alreadyDead = new Set(
      [...game.players.values()].filter(p => !isPlayerAlive(p)).map(p => p.id)
    );

    const results = fireSalvo(game, playerId, coords);
    const shooter = game.players.get(playerId)!;

    // Broadcast shot results to all players
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'shot-results', {
        shooterId: playerId,
        shooterName: shooter.name,
        shots: results,
        game: toClientView(game, pid),
      });
    }

    // Check for eliminations (only newly dead players)
    for (const player of game.players.values()) {
      if (!isPlayerAlive(player) && !alreadyDead.has(player.id)) {
        broadcastToGame(game.id, 'player-eliminated', {
          playerId: player.id,
          playerName: player.name,
          reason: 'sunk' as const,
        });
      }
    }

    // Check game over
    const gameOver = checkGameOver(game);
    if (gameOver) {
      clearTurnTimer(game.id);
      broadcastToGame(game.id, 'game-over', gameOver);
      broadcastOnlineCount();
      return;
    }

    // Advance turn
    advanceTurn(game);
    emitNextTurn(game.id);
  });

  // ============================================================
  // Chat — channel routing
  // ============================================================

  socket.on('chat-message', ({ text, channel: rawChannel }: { text: string; channel?: ChatChannel }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const player = game.players.get(playerId);
    if (!player) return;

    const channel: ChatChannel = rawChannel ?? 'global';

    const message: ChatMessage = {
      playerId,
      playerName: player.name,
      text: text.slice(0, 200), // limit message length
      timestamp: Date.now(),
      channel,
    };

    if (channel === 'team' && game.teamsEnabled) {
      // Team chat: emit to sender + all teammates
      emitToPlayer(playerId, 'chat-message', message);
      for (const teammateId of getTeammates(game, playerId)) {
        emitToPlayer(teammateId, 'chat-message', message);
      }
    } else {
      // Global chat (or team channel with teams disabled — fall back to global)
      if (channel === 'team' && !game.teamsEnabled) {
        message.channel = 'global';
      }
      broadcastToGame(game.id, 'chat-message', message);
    }
  });

  // ============================================================
  // Swap Team (lobby phase, host only)
  // ============================================================

  socket.on('swap-team', ({ targetPlayerId }: { targetPlayerId: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    // Validate: game in lobby phase, requester is host OR moving self
    if (game.phase !== 'lobby') return;
    if (game.hostId !== playerId && targetPlayerId !== playerId) return;

    // Get the target player — must be in the game
    const targetPlayer = game.players.get(targetPlayerId);
    if (!targetPlayer) return;

    // Get their current team and cycle
    const currentTeam = game.teams.get(targetPlayerId);
    if (!currentTeam) {
      game.teams.set(targetPlayerId, 'alpha');
    } else if (currentTeam === 'alpha') {
      game.teams.set(targetPlayerId, 'bravo');
    } else {
      game.teams.set(targetPlayerId, 'alpha');
    }

    // Broadcast updated game state to all players
    emitGameState(game.id);
  });

  // ============================================================
  // Swap Players (lobby phase, host only — atomic team swap)
  // ============================================================

  socket.on('swap-players', ({ playerA, playerB }: { playerA: string; playerB: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.phase !== 'lobby') return;
    if (game.hostId !== playerId) return;
    if (playerA === playerB) return;

    const pA = game.players.get(playerA);
    const pB = game.players.get(playerB);
    if (!pA || !pB) return;

    const teamA = game.teams.get(playerA);
    const teamB = game.teams.get(playerB);
    if (!teamA || !teamB || teamA === teamB) return;

    // Atomic swap
    game.teams.set(playerA, teamB);
    game.teams.set(playerB, teamA);

    emitGameState(game.id);
  });

  // ============================================================
  // Placement Preview (team mode)
  // ============================================================

  socket.on('placement-preview', ({ ships }: { ships: ShipPlacement[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    // Validate: placement phase and teams enabled
    if (game.phase !== 'placement') return;
    if (!game.teamsEnabled) return;

    // Validate preview payload
    if (!Array.isArray(ships) || ships.length > 4) return;
    const coordPattern = /^-?\d+,-?\d+$/; // hex axial format "q,r"
    for (const ship of ships) {
      if (typeof ship.length !== 'number' || ship.length < 1 || ship.length > 4) return;
      if (!Array.isArray(ship.cells)) return;
      for (const cell of ship.cells) {
        if (typeof cell !== 'string' || !coordPattern.test(cell)) return;
      }
    }

    for (const teammateId of getTeammates(game, playerId)) {
      emitToPlayer(teammateId, 'teammate-placement-preview', { ships });
    }
  });

  // ============================================================
  // Rejoin
  // ============================================================

  socket.on('rejoin', ({ playerId, gameId }: { playerId: string; gameId: string }) => {
    const result = connections.handleReconnect(playerId, socket.id);
    if (!result) {
      socket.emit('error', { message: 'Cannot rejoin — game not found or reconnect expired' });
      return;
    }

    socket.join(result.gameId);

    // Send current game state
    const game = lobby.getGame(result.gameId);
    if (game) {
      socket.emit('game-state', { game: toClientView(game, playerId) });

      // Notify others
      const player = game.players.get(playerId);
      if (player) {
        broadcastToGame(result.gameId, 'player-reconnected', {
          playerId,
          playerName: player.name,
        });
      }

      // Replay buffered events
      for (const buffered of result.bufferedEvents) {
        socket.emit(buffered.event as any, buffered.data as any);
      }

      // If it's this player's turn, cancel forfeit timer and emit your-turn with remaining time
      if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === playerId) {
        clearForfeitTimer(playerId);
        const p = game.players.get(playerId)!;
        socket.emit('your-turn', {
          shotCount: playerShotCount(p),
          timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
        });
        startTurnTimer(game.id);
      }
    }
  });

  // ============================================================
  // Surrender & Rejoin
  // ============================================================

  socket.on('leave-game', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const gameId = connections.getGameId(playerId);
    if (!gameId) return;

    const game = lobby.getGame(gameId);
    if (!game || game.phase !== 'lobby') return;

    connections.remove(playerId);
    handlePlayerExit(game, playerId, gameId);
    socket.leave(gameId);
    socket.emit('left-game');
  });

  socket.on('surrender', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const gameId = connections.getGameId(playerId);
    if (!gameId) return;

    const game = lobby.getGame(gameId);
    if (!game || game.phase === 'finished') return;

    // Remove connection FIRST to cancel disconnect timer (prevents double-fire race)
    connections.remove(playerId);
    handlePlayerExit(game, playerId, gameId);
    socket.leave(gameId);
    socket.emit('surrender-ack');
  });

  socket.on('decline-rejoin', ({ playerId, gameId }: { playerId: string; gameId: string }) => {
    // Player loaded page, saw rejoin modal, chose to leave.
    // They haven't reconnected — old socketId is in connections.
    const timeRemaining = connections.getDisconnectTimeRemaining(playerId);
    if (timeRemaining === null) return; // already expired or not found

    // Remove connection FIRST to cancel disconnect timer (prevents double-fire race)
    connections.remove(playerId);

    const game = lobby.getGame(gameId);
    if (!game) return;

    handlePlayerExit(game, playerId, gameId);
  });

  socket.on('check-rejoin', ({ playerId, gameId }: { playerId: string; gameId: string }) => {
    const timeRemaining = connections.getDisconnectTimeRemaining(playerId);
    const game = lobby.getGame(gameId);
    socket.emit('check-rejoin-response', {
      valid: timeRemaining !== null && timeRemaining > 0 && game !== undefined,
      timeRemaining: timeRemaining ?? 0,
    });
  });

  // ============================================================
  // Quick Play Queue
  // ============================================================

  socket.on('quickplay-join', ({ playerName, mode }: { playerName: string; mode: QuickPlayMode }) => {
    // Validate mode
    const validModes: QuickPlayMode[] = ['1v1', '2v2', '3v3', '3ffa', '6ffa', '2v2v2'];
    if (!validModes.includes(mode)) return;

    const trimmedName = playerName?.trim()?.slice(0, 20) ?? '';
    if (!trimmedName) {
      socket.emit('error', { message: 'Enter your name before joining Quick Play' });
      return;
    }

    // Queue switch: if already in a different queue, leave it first
    const existing = queueEntries.get(socket.id);
    if (existing) {
      if (existing.mode === mode) return; // already in this queue
      const oldRoom = getQueueRoomName(existing.mode);
      socket.leave(oldRoom);
      queueEntries.delete(socket.id);
      const oldSize = getQueueSize(oldRoom);
      io.to(oldRoom).emit('quickplay-queue-update', { size: oldSize });
    }

    const roomName = getQueueRoomName(mode);
    socket.join(roomName);
    queueEntries.set(socket.id, { playerName: trimmedName, mode });

    // Broadcast queue size to room members
    const size = getQueueSize(roomName);
    io.to(roomName).emit('quickplay-queue-update', { size });
    broadcastOnlineCount();

    // Check if match is ready
    tryMatchRoom(roomName, mode);
  });

  socket.on('quickplay-leave', () => {
    const entry = queueEntries.get(socket.id);
    if (!entry) return;

    const roomName = getQueueRoomName(entry.mode);
    socket.leave(roomName);
    queueEntries.delete(socket.id);

    const size = getQueueSize(roomName);
    io.to(roomName).emit('quickplay-queue-update', { size });
    broadcastOnlineCount();
  });

  // Rematch
  socket.on('rematch-request', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'finished') return;

    game.rematchAccepted.add(playerId);
    // Bots auto-accept
    for (const p of game.players.values()) {
      if (p.isBot) game.rematchAccepted.add(p.id);
    }

    const humanPlayers = [...game.players.values()].filter(p => !p.isBot);
    const allAccepted = humanPlayers.every(p => game.rematchAccepted.has(p.id));

    if (allAccepted) {
      // Quick-play rematch: destroy game + requeue all humans
      if (game.mode !== 'private') {
        const qpMode = toQuickPlayMode(game.mode);
        if (!qpMode) return; // private game — shouldn't reach here
        const roomName = getQueueRoomName(qpMode);

        // Requeue each human player
        for (const p of humanPlayers) {
          const socketId = connections.getSocketId(p.id);
          if (!socketId) continue;

          const playerSocket = io.sockets.sockets.get(socketId);
          if (playerSocket) {
            playerSocket.leave(game.id);
            playerSocket.join(roomName);
          }
          queueEntries.set(socketId, { playerName: p.name, mode: qpMode });
          connections.remove(p.id);
        }

        // Clean up the game (removeGame also cleans playerToGame entries)
        clearGameTimers(game.id);
        lobby.removeGame(game.id);

        // Broadcast queue updates
        const size = getQueueSize(roomName);
        io.to(roomName).emit('quickplay-queue-update', { size });
        broadcastOnlineCount();

        // Check if the requeue fills the room — call tryMatchRoom directly
        tryMatchRoom(roomName, qpMode);
        return;
      }

      // Private game rematch: in-place reset
      resetForRematch(game);

      // Auto-place bot ships
      for (const p of game.players.values()) {
        if (p.isBot && p.aiDifficulty) {
          const placement = generatePlacement(p.aiDifficulty, game.rings, game.islands);
          placeShips(game, p.id, placement);
        }
      }

      const rematchPlacementDeadline = game.timerConfig.enabled
        ? Date.now() + game.timerConfig.seconds * 1000
        : undefined;
      for (const pid of game.players.keys()) {
        if (!game.players.get(pid)?.isBot) {
          emitToPlayer(pid, 'rematch-starting', { game: toClientView(game, pid), placementDeadline: rematchPlacementDeadline });
        }
      }

      // Start placement timer if enabled
      if (game.timerConfig.enabled) {
        startPlacementTimer(game.id);
      }

      // If only bots + 1 human and human places ships, check allShipsPlaced
      if (allShipsPlaced(game)) {
        clearPlacementTimer(game.id);
        beginPlaying(game);
        for (const pid of game.players.keys()) {
          if (!game.players.get(pid)?.isBot) {
            emitToPlayer(pid, 'all-ready', { game: toClientView(game, pid) });
          }
        }
        emitNextTurn(game.id);
      }
    } else {
      // Broadcast pending status to all humans
      for (const p of humanPlayers) {
        emitToPlayer(p.id, 'rematch-pending', {
          acceptedIds: [...game.rematchAccepted],
          totalHumans: humanPlayers.length,
        });
      }
    }
  });

  socket.on('rematch-decline', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game || game.phase !== 'finished') return;

    const decliningPlayer = game.players.get(playerId);
    const decliningName = decliningPlayer?.name ?? 'Unknown';

    // Remove the declining player
    removePlayer(game, playerId);
    lobby.registerPlayer(playerId, ''); // unregister from game
    connections.remove(playerId);

    // If no humans left, clean up
    const remainingHumans = [...game.players.values()].filter(p => !p.isBot);
    if (remainingHumans.length === 0) {
      clearGameTimers(game.id);
      lobby.removeGame(game.id);
      broadcastOnlineCount();
      return;
    }

    // Quick-play decline: remaining humans go back to queue
    if (game.mode !== 'private') {
      const qpMode = toQuickPlayMode(game.mode);
      if (!qpMode) return; // private game — shouldn't reach here
      const roomName = getQueueRoomName(qpMode);

      for (const p of remainingHumans) {
        const socketId = connections.getSocketId(p.id);
        if (!socketId) continue;

        const playerSocket = io.sockets.sockets.get(socketId);
        if (playerSocket) {
          playerSocket.leave(game.id);
          playerSocket.join(roomName);
        }
        queueEntries.set(socketId, { playerName: p.name, mode: qpMode });
        connections.remove(p.id);
      }

      // removeGame cleans up playerToGame entries
      clearGameTimers(game.id);
      lobby.removeGame(game.id);

      const size = getQueueSize(roomName);
      io.to(roomName).emit('quickplay-queue-update', { size });
      broadcastOnlineCount();

      // Check if requeue fills the room
      tryMatchRoom(roomName, qpMode);
      return;
    }

    // Private game decline: move remaining to a new lobby
    game.phase = 'lobby';
    game.shots = new Set();
    game.turnOrder = [];
    game.currentTurnIndex = 0;
    game.rematchAccepted = new Set();
    for (const p of game.players.values()) {
      p.ships = [];
    }

    // Generate new join code for the lobby
    const oldCode = lobby.getCodeForGame(game.id);
    const newCode = lobby.generateUniqueCode();
    if (oldCode) {
      // Remove old code mapping and add new one
      clearGameTimers(game.id);
      lobby.removeGame(game.id);
      lobby.addGame(game, newCode);
      // Re-register remaining players
      for (const pid of game.players.keys()) {
        lobby.registerPlayer(pid, game.id);
      }
    }

    // Notify remaining players
    for (const pid of game.players.keys()) {
      if (!game.players.get(pid)?.isBot) {
        emitToPlayer(pid, 'rematch-declined', {
          playerName: decliningName,
          code: newCode,
          game: toClientView(game, pid),
        });
      }
    }

    game.lastActivity = Date.now();
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    // Clean up queue state if player was queued
    const queueEntry = queueEntries.get(socket.id);
    if (queueEntry) {
      const roomName = getQueueRoomName(queueEntry.mode);
      queueEntries.delete(socket.id);
      // socket.io auto-removes from rooms on disconnect
      const size = getQueueSize(roomName);
      io.to(roomName).emit('quickplay-queue-update', { size });
      broadcastOnlineCount();
    }

    const result = connections.handleDisconnect(socket.id);

    if (result) {
      const game = lobby.getGame(result.gameId);
      if (game) {
        const player = game.players.get(result.playerId);
        broadcastToGame(result.gameId, 'player-disconnected', {
          playerId: result.playerId,
          playerName: player?.name ?? 'Unknown',
        });

        // If it was the disconnected player's turn, the forfeit timer
        // will be started by emitNextTurn when it detects the disconnection.
        // We just need to clear the existing turn timer.
        if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === result.playerId) {
          clearTurnTimer(game.id);
          // Start forfeit timer — gives them the reconnect window
          startForfeitTimer(game.id, result.playerId);
        }
      }
    }

    // Update online count for remaining clients
    broadcastOnlineCount();
  });
});

// ============================================================
// Static Files (production)
// ============================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, '../../client/dist');
const repoRoot = path.resolve(__dirname, '../..');

// Serve CHANGELOG.md from repo root
app.get('/CHANGELOG.md', (_req, res) => {
  res.sendFile(path.join(repoRoot, 'CHANGELOG.md'));
});

app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// ============================================================
// Server Start
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3000', 10);

lobby.startCleanup();

httpServer.listen(PORT, () => {
  console.log(`Salvo server listening on port ${PORT}`);
});

export { app, httpServer, io, lobby, connections };
