import { turnTimers } from './index.js';
import { getLobby } from '../emitters.js';
import { broadcastToGame } from '../emitters.js';
import { getCurrentTurnPlayerId, advanceTurn } from '../game.js';
import { emitNextTurn } from '../gameFlow.js';

export function startTurnTimer(gameId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || !game.timerConfig.enabled) return;

  clearTurnTimer(gameId);

  const currentPlayerId = getCurrentTurnPlayerId(game);
  if (!currentPlayerId) return;

  const timer = setTimeout(() => {
    handleTurnTimeout(gameId, currentPlayerId);
  }, game.timerConfig.seconds * 1000);

  turnTimers.set(gameId, timer);
}

export function clearTurnTimer(gameId: string): void {
  const timer = turnTimers.get(gameId);
  if (timer) {
    clearTimeout(timer);
    turnTimers.delete(gameId);
  }
}

export function handleTurnTimeout(gameId: string, playerId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Only timeout if it's still this player's turn
  if (getCurrentTurnPlayerId(game) !== playerId) return;

  broadcastToGame(gameId, 'turn-timeout', { playerId });

  // Skip to next player
  advanceTurn(game);
  emitNextTurn(gameId);
}
