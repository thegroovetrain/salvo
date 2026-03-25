import type { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getCurrentTurnPlayerId } from './game.js';
import { getConnections, getLobby, broadcastToGame } from './emitters.js';
import { clearTurnTimer, startForfeitTimer } from './timers/index.js';
import { queueEntries, getQueueRoomName, getQueueSize, broadcastOnlineCount } from './queue/index.js';
import {
  registerLobbyHandlers,
  registerPlayingHandlers,
  registerSocialHandlers,
  registerConnectionHandlers,
  registerRematchHandlers,
} from './handlers/index.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function setupSocket(io: IO): void {
  io.on('connection', (socket) => {
    // Broadcast updated online count (nextTick ensures the new socket's listeners are ready)
    process.nextTick(() => broadcastOnlineCount());

    registerLobbyHandlers(io, socket);
    registerPlayingHandlers(io, socket);
    registerSocialHandlers(io, socket);
    registerConnectionHandlers(io, socket);
    registerRematchHandlers(io, socket);

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
}
