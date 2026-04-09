import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, ShipPlacement } from '@salvo/shared';
import { isPlayerAlive } from '@salvo/shared';
import { getLobby, getConnections, getGuestSessions, emitToPlayer, emitGameState, broadcastToGame } from '../emitters.js';
import {
  placeShips, allShipsPlaced, beginPlaying,
  validateSalvo, fireSalvo, advanceTurn, checkGameOver,
  toClientView, checkNewEliminations,
  validateSimultaneousSalvo, lockPlayerSalvo,
} from '../game.js';
import { clearPlacementTimer, clearTurnTimer } from '../timers/index.js';
import { emitNextTurn, checkAndResolveRound } from '../gameFlow.js';
import { broadcastOnlineCount } from '../queue/index.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;

export function registerPlayingHandlers(io: IO, socket: Socket<ClientToServerEvents, ServerToClientEvents>): void {
  const lobby = getLobby();
  const connections = getConnections();

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

  socket.on('lock-salvo', ({ coords }: { coords: string[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    const err = validateSimultaneousSalvo(game, playerId, coords);
    if (err) {
      socket.emit('error', { message: err });
      return;
    }

    lockPlayerSalvo(game, playerId, coords);
    broadcastToGame(game.id, 'player-locked', { playerId });
    checkAndResolveRound(game.id);
  });

  socket.on('fire', ({ coords }: { coords: string[] }) => {
    const playerId = connections.getPlayerIdBySocket(socket.id);
    if (!playerId) return;

    const game = lobby.getGameByPlayer(playerId);
    if (!game) return;

    if (game.turnMode === 'simultaneous') {
      socket.emit('error', { message: 'Use lock-salvo in simultaneous mode' });
      return;
    }

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
    for (const elim of checkNewEliminations(game, alreadyDead)) {
      broadcastToGame(game.id, 'player-eliminated', {
        playerId: elim.playerId,
        playerName: elim.playerName,
        reason: 'sunk' as const,
      });
    }

    // Check game over
    const gameOver = checkGameOver(game);
    if (gameOver) {
      clearTurnTimer(game.id);
      getGuestSessions().unbindAllFromGame(game.id);
      // Send updated game state with phase='finished' so clients see all ship cells
      emitGameState(game.id);
      broadcastToGame(game.id, 'game-over', gameOver);
      broadcastOnlineCount();
      return;
    }

    // Advance turn
    advanceTurn(game);
    emitNextTurn(game.id);
  });
}
