import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@salvo/shared';
import { playerShotCount } from '@salvo/shared';
import { getLobby, getConnections, broadcastToGame } from '../emitters.js';
import { getCurrentTurnPlayerId, toClientView } from '../game.js';
import { clearForfeitTimer, startTurnTimer } from '../timers/index.js';
import { handlePlayerExit } from '../gameFlow.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerConnectionHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();

  socket.on('rejoin', ({ playerId, gameId: _gameId }: { playerId: string; gameId: string }) => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}
