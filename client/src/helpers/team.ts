import { state } from '../state.js';

export function getTeammateId(): string | null {
  if (!state.game || !state.playerId || !state.game.teamsEnabled) return null;
  const myTeam = state.game.teams[state.playerId];
  if (!myTeam) return null;
  for (const [pid, team] of Object.entries(state.game.teams)) {
    if (pid !== state.playerId && team === myTeam) return pid;
  }
  return null;
}

export function getHitCountAtCoord(coord: string): number {
  let count = 0;
  for (const entry of state.shotLog) {
    for (const shot of entry.shots) {
      if (shot.coord === coord) {
        count += shot.hits.length;
      }
    }
  }
  return count;
}
