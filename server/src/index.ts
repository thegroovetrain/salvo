import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ClientToServerEvents, ServerToClientEvents, ChatMessage,
  TimerConfig, ShipPlacement, AiDifficulty,
} from '@salvo/shared';
import { isPlayerAlive, playerShotCount } from '@salvo/shared';
import {
  createGame, addPlayer, addBot, removeBot, removePlayer, canStartGame, startGame,
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

// ============================================================
// Helpers
// ============================================================

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

  // Check for eliminations
  for (const player of game.players.values()) {
    if (!isPlayerAlive(player)) {
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
    return;
  }

  // Advance turn
  advanceTurn(game);
  emitNextTurn(gameId);
}

// ============================================================
// Socket Event Handlers
// ============================================================

io.on('connection', (socket) => {
  socket.on('create-game', ({ playerName, timerConfig }: { playerName: string; timerConfig?: TimerConfig }) => {
    const playerId = crypto.randomUUID();
    const timer = timerConfig ?? { enabled: false, seconds: 60 };
    const game = createGame(playerId, playerName, timer);
    const code = lobby.generateUniqueCode();

    lobby.addGame(game, code);
    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, socket.id, game.id);
    socket.join(game.id);

    socket.emit('game-created', { code, playerId, gameId: game.id });
    socket.emit('game-state', { game: toClientView(game, playerId) });
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

    lobby.registerPlayer(playerId, game.id);
    connections.register(playerId, socket.id, game.id);
    socket.join(game.id);

    socket.emit('game-created', { code: code.toUpperCase(), playerId, gameId: game.id });

    // Broadcast updated state to all players
    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'player-joined', { game: toClientView(game, pid) });
    }
  });

  socket.on('add-bot', ({ difficulty }: { difficulty: AiDifficulty }) => {
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
        const placement = generatePlacement(player.aiDifficulty);
        placeShips(game, player.id, placement);
      }
    }

    for (const pid of game.players.keys()) {
      if (!game.players.get(pid)?.isBot) {
        emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid) });
      }
    }

    // If all ships are now placed (only bots, or solo with bots), start playing
    if (allShipsPlaced(game)) {
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

    // Check for eliminations
    for (const player of game.players.values()) {
      if (!isPlayerAlive(player)) {
        // Check if this is newly eliminated (had ships before this salvo)
        // For simplicity, broadcast elimination for anyone who's dead
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
      return;
    }

    // Advance turn
    advanceTurn(game);
    emitNextTurn(game.id);
  });

  socket.on('chat-message', ({ text }: { text: string }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const player = game.players.get(playerId);
    if (!player) return;

    const message: ChatMessage = {
      playerId,
      playerName: player.name,
      text: text.slice(0, 200), // limit message length
      timestamp: Date.now(),
    };

    broadcastToGame(game.id, 'chat-message', message);
  });

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

      // If it's this player's turn, emit your-turn
      if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === playerId) {
        const p = game.players.get(playerId)!;
        socket.emit('your-turn', {
          shotCount: playerShotCount(p),
          timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
        });
        startTurnTimer(game.id);
      }
    }
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
      // Everyone accepted — start rematch
      resetForRematch(game);

      // Auto-place bot ships
      for (const p of game.players.values()) {
        if (p.isBot && p.aiDifficulty) {
          const placement = generatePlacement(p.aiDifficulty);
          placeShips(game, p.id, placement);
        }
      }

      for (const pid of game.players.keys()) {
        if (!game.players.get(pid)?.isBot) {
          emitToPlayer(pid, 'rematch-starting', { game: toClientView(game, pid) });
        }
      }

      // If only bots + 1 human and human places ships, check allShipsPlaced
      if (allShipsPlaced(game)) {
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
      lobby.removeGame(game.id);
      return;
    }

    // Move remaining players to a new lobby with a fresh join code
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
    const result = connections.handleDisconnect(socket.id, (playerId, gameId) => {
      // Timeout callback — forfeit the player
      const game = lobby.getGame(gameId);
      if (!game) return;

      forfeitPlayer(game, playerId);
      const player = game.players.get(playerId);

      broadcastToGame(gameId, 'player-eliminated', {
        playerId,
        playerName: player?.name ?? 'Unknown',
        reason: 'forfeit' as const,
      });

      // Check game over after forfeit
      const gameOver = checkGameOver(game);
      if (gameOver) {
        clearTurnTimer(gameId);
        broadcastToGame(gameId, 'game-over', gameOver);
        return;
      }

      // If it was this player's turn, advance
      if (getCurrentTurnPlayerId(game) === playerId) {
        advanceTurn(game);
        emitNextTurn(gameId);
      }
    });

    if (result) {
      const game = lobby.getGame(result.gameId);
      if (game) {
        const player = game.players.get(result.playerId);
        const remaining = connections.getDisconnectTimeRemaining(result.playerId);
        broadcastToGame(result.gameId, 'player-disconnected', {
          playerId: result.playerId,
          playerName: player?.name ?? 'Unknown',
          timeoutSeconds: remaining ?? 60,
        });

        // If it was the disconnected player's turn, skip after a short delay
        if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === result.playerId) {
          clearTurnTimer(game.id);
          // Give them 5 seconds to reconnect before skipping
          setTimeout(() => {
            if (connections.isDisconnected(result.playerId)) {
              const g = lobby.getGame(result.gameId);
              if (g && g.phase === 'playing' && getCurrentTurnPlayerId(g) === result.playerId) {
                advanceTurn(g);
                emitNextTurn(result.gameId);
              }
            }
          }, 5000);
        }
      }
    }
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
