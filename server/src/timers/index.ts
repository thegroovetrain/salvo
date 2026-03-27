import { clearPlacementTimer } from './placement.js';
import { clearTurnTimer } from './turn.js';
import { clearDisconnectSkipTimer } from './disconnectSkip.js';
import { clearAllDisconnectedTimer } from './allDisconnected.js';
import { getLobby } from '../emitters.js';

// Timer state Maps — shared across all timer modules
export const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const placementTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const disconnectSkipTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const allDisconnectedTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Extra cleanup callbacks registered at runtime (avoids circular imports)
const extraCleanup: ((gameId: string) => void)[] = [];
export function registerGameCleanup(fn: (gameId: string) => void): void { extraCleanup.push(fn); }

export function clearGameTimers(gameId: string): void {
  clearPlacementTimer(gameId);
  clearAllDisconnectedTimer(gameId);
  for (const fn of extraCleanup) fn(gameId);
  const game = getLobby().getGame(gameId);
  if (game) {
    for (const playerId of game.players.keys()) {
      clearDisconnectSkipTimer(playerId);
    }
  }
  clearTurnTimer(gameId);
}

export { startPlacementTimer, clearPlacementTimer, handlePlacementTimeout } from './placement.js';
export { startTurnTimer, clearTurnTimer, handleTurnTimeout } from './turn.js';
export { startDisconnectSkipTimer, clearDisconnectSkipTimer, handleDisconnectSkipTimeout } from './disconnectSkip.js';
export { startAllDisconnectedTimer, clearAllDisconnectedTimer } from './allDisconnected.js';
