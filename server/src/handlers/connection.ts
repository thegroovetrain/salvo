import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions } from '../emitters.js';
import { handlePlayerExit } from '../gameFlow.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerConnectionHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();
  const guestSessions = getGuestSessions();

  socket.on('leave-game', () => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const gameId = connections.getGameId(playerId);
    if (!gameId) return;

    const game = lobby.getGame(gameId);
    if (!game || game.phase !== 'lobby') return;

    // Unbind guest from game
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (guestId) guestSessions.unbindFromGame(guestId);

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

    // Unbind guest from game
    const guestId = guestSessions.getGuestIdBySocket(socket.id);
    if (guestId) guestSessions.unbindFromGame(guestId);

    // Remove connection FIRST to cancel disconnect timer (prevents double-fire race)
    connections.remove(playerId);
    handlePlayerExit(game, playerId, gameId);
    socket.leave(gameId);
    socket.emit('surrender-ack');
  });
}
