import { clearPlacementTimer } from './placement.js';
import { clearTurnTimer } from './turn.js';
import { clearForfeitTimer } from './forfeit.js';
import { getLobby } from '../emitters.js';

// Timer state Maps — shared across all timer modules
export const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const placementTimers = new Map<string, ReturnType<typeof setTimeout>>();
export const forfeitTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function clearGameTimers(gameId: string): void {
  clearPlacementTimer(gameId);
  const game = getLobby().getGame(gameId);
  if (game) {
    for (const playerId of game.players.keys()) {
      clearForfeitTimer(playerId);
    }
  }
  clearTurnTimer(gameId);
}

export { startPlacementTimer, clearPlacementTimer, handlePlacementTimeout } from './placement.js';
export { startTurnTimer, clearTurnTimer, handleTurnTimeout } from './turn.js';
export { startForfeitTimer, clearForfeitTimer, handleForfeitTimeout } from './forfeit.js';
