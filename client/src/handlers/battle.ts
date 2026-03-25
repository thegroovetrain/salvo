import { state } from '../state.js';
import { render } from '../rendering/render.js';

export function handleTargetClick(coord: string): void {
  if (!state.isMyTurn || !state.game || !state.playerId) return;

  // Can't select already-shot coordinates
  if (state.game.shots.includes(coord)) return;

  const myPlayer = state.game.players[state.playerId];
  if (!myPlayer) return;
  const maxShots = myPlayer.shotCount;

  const idx = state.selectedTargets.indexOf(coord);
  if (idx !== -1) {
    // Deselect
    state.selectedTargets.splice(idx, 1);
  } else if (state.selectedTargets.length < maxShots) {
    // Select
    state.selectedTargets.push(coord);
  }
  render();
}
