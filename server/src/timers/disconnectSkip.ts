// ============================================================
// Disconnect-Skip Timer
// When a disconnected player's turn arrives in an UNTIMED game,
// this 10-second timer fires zero shots and advances the turn.
// (Timed games use the normal turn timer for this.)
//
// Replaces the old forfeit timer — disconnect no longer eliminates.
// ============================================================

import { disconnectSkipTimers } from './index.js';
import { getLobby, getConnections } from '../emitters.js';
import { getCurrentTurnPlayerId, advanceTurn } from '../game.js';
import { emitNextTurn } from '../gameFlow.js';

const DISCONNECT_SKIP_SECONDS = 10;

export function startDisconnectSkipTimer(gameId: string, playerId: string): void {
  clearDisconnectSkipTimer(playerId);

  const timer = setTimeout(() => {
    handleDisconnectSkipTimeout(gameId, playerId);
  }, DISCONNECT_SKIP_SECONDS * 1000);

  disconnectSkipTimers.set(playerId, timer);
}

export function clearDisconnectSkipTimer(playerId: string): void {
  const timer = disconnectSkipTimers.get(playerId);
  if (timer) {
    clearTimeout(timer);
    disconnectSkipTimers.delete(playerId);
  }
}

export function handleDisconnectSkipTimeout(gameId: string, playerId: string): void {
  const game = getLobby().getGame(gameId);
  if (!game || game.phase !== 'playing') return;

  // Only skip if it's still this player's turn and they're still disconnected
  if (getCurrentTurnPlayerId(game) !== playerId) return;
  if (!getConnections().isDisconnected(playerId)) return;

  // Fire zero shots — just advance the turn
  advanceTurn(game);
  emitNextTurn(gameId);
}
