import { forfeitTimers } from './index.js';
import { getLobby, getConnections, emitGameState, broadcastToGame } from '../emitters.js';
import { getCurrentTurnPlayerId, forfeitPlayer, checkGameOver, advanceTurn } from '../game.js';
import { clearTurnTimer } from './turn.js';
import { emitNextTurn } from '../gameFlow.js';
import { broadcastOnlineCount } from '../queue/index.js';

export function startForfeitTimer(gameId: string, playerId: string): void {
  clearForfeitTimer(playerId);

  const game = getLobby().getGame(gameId);
  const seconds = game?.timerConfig.enabled ? game.timerConfig.seconds : 60;

  const timer = setTimeout(() => {
    handleForfeitTimeout(gameId, playerId);
  }, seconds * 1000);

  forfeitTimers.set(playerId, timer);
}

export function clearForfeitTimer(playerId: string): void {
  const timer = forfeitTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    forfeitTimers.delete(playerId);
  }
}

export function handleForfeitTimeout(gameId: string, playerId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Only forfeit if it's still this player's turn and they're still disconnected
  if (getCurrentTurnPlayerId(game) !== playerId) return;
  if (!getConnections().isDisconnected(playerId)) return;

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
    emitGameState(gameId);
    broadcastToGame(gameId, 'game-over', gameOver);
    broadcastOnlineCount();
    return;
  }

  advanceTurn(game);
  emitNextTurn(gameId);
}
