import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents, ServerToClientEvents, ChatMessage,
  TimerConfig, ShipPlacement,
} from '@salvo/shared';
import { isPlayerAlive, playerShotCount } from '@salvo/shared';
import {
  createGame, addPlayer, canStartGame, startGame,
  placeShips, allShipsPlaced, beginPlaying,
  getCurrentTurnPlayerId, validateSalvo, fireSalvo,
  advanceTurn, checkGameOver, forfeitPlayer,
  toClientView, resetForRematch,
} from './game.js';
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

  emitToPlayer(currentPlayerId, 'your-turn', {
    shotCount: playerShotCount(player),
    timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
  });

  // Send updated game state to everyone
  for (const pid of game.players.keys()) {
    emitToPlayer(pid, 'game-state', { game: toClientView(game, pid) });
  }

  startTurnTimer(gameId);
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

    for (const pid of game.players.keys()) {
      emitToPlayer(pid, 'placement-phase', { game: toClientView(game, pid) });
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
// Server Start
// ============================================================

const PORT = parseInt(process.env.PORT ?? '3000', 10);

lobby.startCleanup();

httpServer.listen(PORT, () => {
  console.log(`Salvo server listening on port ${PORT}`);
});

export { app, httpServer, io, lobby, connections };
