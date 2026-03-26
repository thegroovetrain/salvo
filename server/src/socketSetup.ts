import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { playerShotCount } from '@salvo/shared';
import { getCurrentTurnPlayerId, toClientView } from './game.js';
import { getConnections, getLobby, getGuestSessions, broadcastToGame } from './emitters.js';
import {
  clearTurnTimer, startTurnTimer,
  startDisconnectSkipTimer, clearDisconnectSkipTimer,
  startAllDisconnectedTimer, clearAllDisconnectedTimer,
} from './timers/index.js';
import { queueEntries, getQueueRoomName, getQueueSize, broadcastOnlineCount } from './queue/index.js';
import {
  registerLobbyHandlers,
  registerPlayingHandlers,
  registerSocialHandlers,
  registerConnectionHandlers,
  registerRematchHandlers,
} from './handlers/index.js';
import { isValidGuestId } from './guestSessions.js';
import crypto from 'node:crypto';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

// ============================================================
// Connection Flow
//
//   1. Client connects with auth: { guestId }
//   2. Validate guestId (generate if missing/invalid)
//   3. GuestSessionManager.handleConnect() — evict old socket if needed
//   4. If active game → auto-reattach (fresh game-state snapshot)
//   5. If no game → normal fresh connection
//
// Disconnect Flow
//
//   1. GuestSessionManager.handleDisconnect() — keep session
//   2. ConnectionManager.handleDisconnect() — mark disconnected
//   3. If their turn: start turn timer (timed) or skip timer (untimed)
//   4. If all players DC: start 30s all-disconnected timer
// ============================================================

function handleEviction(io: IO, guestSessions: ReturnType<typeof getGuestSessions>, evictedSocketId: string, newSocketId: string): void {
  const evictedSocket = io.sockets.sockets.get(evictedSocketId);

  // Migrate queue entry BEFORE disconnecting old socket (prevents TOCTOU race)
  const queueEntry = queueEntries.get(evictedSocketId);
  if (queueEntry) {
    queueEntries.delete(evictedSocketId);
    queueEntries.set(newSocketId, queueEntry);
    // New socket needs to join the queue room
    const newSocket = io.sockets.sockets.get(newSocketId);
    const roomName = getQueueRoomName(queueEntry.mode);
    if (newSocket) {
      newSocket.join(roomName);
    }
  }

  if (evictedSocket) {
    evictedSocket.emit('tab-evicted');
    evictedSocket.disconnect(true);
  }
}

function autoReattach(io: IO, socket: TypedSocket, playerId: string, gameId: string): void {
  const connections = getConnections();
  const lobby = getLobby();
  const game = lobby.getGame(gameId);

  if (!game) {
    // Game no longer exists — send info to client
    socket.emit('error', { message: 'Game no longer available' });
    return;
  }

  // Reconnect via ConnectionManager
  const result = connections.handleReconnect(playerId, socket.id);
  if (!result) {
    // Player not in ConnectionManager (game may have ended for them)
    socket.emit('error', { message: 'Game no longer available' });
    getGuestSessions().unbindFromGame(
      getGuestSessions().getGuestIdBySocket(socket.id) ?? ''
    );
    return;
  }

  socket.join(gameId);

  // Cancel all-disconnected timer since someone reconnected
  clearAllDisconnectedTimer(gameId);

  // Send current game state
  socket.emit('game-state', { game: toClientView(game, playerId) });

  // Notify others
  const player = game.players.get(playerId);
  if (player) {
    broadcastToGame(gameId, 'player-reconnected', {
      playerId,
      playerName: player.name,
    });
  }

  // If it's this player's turn, cancel disconnect-skip and re-emit your-turn
  if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === playerId) {
    clearDisconnectSkipTimer(playerId);
    clearTurnTimer(gameId);
    const p = game.players.get(playerId)!;
    socket.emit('your-turn', {
      shotCount: playerShotCount(p),
      timerSeconds: game.timerConfig.enabled ? game.timerConfig.seconds : null,
    });
    startTurnTimer(gameId);
  }
}

export function setupSocket(io: IO): void {
  io.on('connection', (socket) => {
    const guestSessions = getGuestSessions();

    // ── Step 1: Resolve guestId ──
    let guestId = socket.handshake.auth?.guestId;
    if (!isValidGuestId(guestId)) {
      guestId = crypto.randomUUID();
      socket.emit('guest-id-assigned', { guestId });
    }

    // ── Step 2: Register guest session (evict old socket if needed) ──
    const { evictedSocketId, activeGame } = guestSessions.handleConnect(guestId, socket.id);

    if (evictedSocketId) {
      handleEviction(io, guestSessions, evictedSocketId, socket.id);
    }

    // ── Step 3: Auto-reattach or fresh connection ──
    if (activeGame) {
      autoReattach(io, socket, activeGame.playerId, activeGame.gameId);
    }

    // Broadcast updated online count
    process.nextTick(() => broadcastOnlineCount());

    // ── Register event handlers ──
    registerLobbyHandlers(io, socket);
    registerPlayingHandlers(io, socket);
    registerSocialHandlers(io, socket);
    registerConnectionHandlers(io, socket);
    registerRematchHandlers(io, socket);

    // ── Handle disconnect ──
    socket.on('disconnect', () => {
      // Update guest session (keep session, clear socket)
      guestSessions.handleDisconnect(socket.id);

      // Clean up queue state if player was queued (and not migrated by eviction)
      const queueEntry = queueEntries.get(socket.id);
      if (queueEntry) {
        const roomName = getQueueRoomName(queueEntry.mode);
        queueEntries.delete(socket.id);
        const size = getQueueSize(roomName);
        io.to(roomName).emit('quickplay-queue-update', { size });
      }

      const connections = getConnections();
      const lobby = getLobby();
      const result = connections.handleDisconnect(socket.id);

      if (result) {
        const game = lobby.getGame(result.gameId);
        if (game) {
          const player = game.players.get(result.playerId);
          broadcastToGame(result.gameId, 'player-disconnected', {
            playerId: result.playerId,
            playerName: player?.name ?? 'Unknown',
          });

          // If it was the disconnected player's turn:
          // Timed games → turn timer handles it (or start one)
          // Untimed games → start 10s disconnect-skip timer
          if (game.phase === 'playing' && getCurrentTurnPlayerId(game) === result.playerId) {
            clearTurnTimer(game.id);
            if (game.timerConfig.enabled) {
              startTurnTimer(game.id);
            } else {
              startDisconnectSkipTimer(game.id, result.playerId);
            }
          }

          // Check if all human players are now disconnected
          if (guestSessions.areAllDisconnected(game.id)) {
            startAllDisconnectedTimer(game.id);
          }
        }
      }

      // Update online count for remaining clients
      broadcastOnlineCount();
    });
  });
}
