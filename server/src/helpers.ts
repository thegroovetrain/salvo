import type { Game, QuickPlayMode } from '@salvo/shared';
import { SLOT_COLORS, TEAM_COLOR_POOLS } from '@salvo/shared';
import { assignPlayerColor } from './game.js';

/** Auto-assign a player to the team with fewest members. Ties break: alpha -> bravo -> charlie. */
export function autoAssignTeam(game: Game, playerId: string): void {
  // Deterministic team names from host's game type choice
  const teamNames = game.gameType === '3-team'
    ? ['alpha', 'bravo', 'charlie']
    : ['alpha', 'bravo'];

  const counts = new Map<string, number>();
  for (const name of teamNames) counts.set(name, 0);
  for (const teamId of game.teams.values()) {
    if (counts.has(teamId)) counts.set(teamId, counts.get(teamId)! + 1);
  }

  // Pick team with fewest players (ties favor earlier in order)
  let minTeam = teamNames[0];
  let minCount = counts.get(minTeam) ?? 0;
  for (const name of teamNames) {
    const c = counts.get(name) ?? 0;
    if (c < minCount) {
      minTeam = name;
      minCount = c;
    }
  }
  game.teams.set(playerId, minTeam);
}

/** Shuffle an array in place (Fisher-Yates) */
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Assign random player colors for Quick Play games */
export function assignQuickPlayColors(game: Game, _mode: QuickPlayMode): void {
  if (!game.teamsEnabled) {
    // FFA: shuffle all colors and assign by player order
    const colors = shuffle([...SLOT_COLORS]);
    let i = 0;
    for (const player of game.players.values()) {
      assignPlayerColor(game, player.id, colors[i++]);
    }
    return;
  }

  // Team modes: shuffle within each team's color pool
  const gameType = game.gameType;
  const pools = TEAM_COLOR_POOLS[gameType];
  if (!pools) return;

  // Group players by team
  const teamPlayers = new Map<string, string[]>();
  for (const [playerId, teamId] of game.teams) {
    if (!teamPlayers.has(teamId)) teamPlayers.set(teamId, []);
    teamPlayers.get(teamId)!.push(playerId);
  }

  // Assign shuffled colors from each team's pool
  for (const [teamId, playerIds] of teamPlayers) {
    const pool = pools[teamId];
    if (!pool) continue;
    const shuffled = shuffle([...pool]);
    for (let i = 0; i < playerIds.length; i++) {
      assignPlayerColor(game, playerIds[i], shuffled[i % shuffled.length]);
    }
  }
}
