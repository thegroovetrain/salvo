import type { Game, AiDifficulty } from '@salvo/shared';
import { isPlayerAlive, playerShotCount } from '@salvo/shared';
import { getActiveHits } from './helpers.js';

// ============================================================
// Doctrine Selection — Commander Layer
//
// DOCTRINE PRIORITY: cleanup > desperation > kill > trade-up > protect-lead > hunt
// Each tier has access to a subset of doctrines:
//   Easy:       none (always hunt)
//   Medium:     hunt, kill, desperation
//   Hard:       all 6
//   Impossible: all 6
// ============================================================

export type Doctrine = 'hunt' | 'kill' | 'trade-up' | 'protect-lead' | 'desperation' | 'cleanup';

export interface WeightConfig {
  enemyHitValue: number;
  killBonus: number;
  shotsRemovedBonus: number;
  selfPenalty: number;
  teammatePenalty: number;
  adjacencyBonus: number;
  huntPatternBonus: number;
}

// --- Weight Tables ---

const MEDIUM_WEIGHTS: Record<string, WeightConfig> = {
  hunt:        { enemyHitValue: 5, killBonus: 0,  shotsRemovedBonus: 0, selfPenalty: 3,   teammatePenalty: 5, adjacencyBonus: 2, huntPatternBonus: 1 },
  kill:        { enemyHitValue: 8, killBonus: 10, shotsRemovedBonus: 0, selfPenalty: 3,   teammatePenalty: 5, adjacencyBonus: 4, huntPatternBonus: 0 },
  desperation: { enemyHitValue: 8, killBonus: 10, shotsRemovedBonus: 0, selfPenalty: 0.5, teammatePenalty: 2, adjacencyBonus: 4, huntPatternBonus: 0 },
};

const HARD_HUNT: WeightConfig = {
  enemyHitValue: 8, killBonus: 12, shotsRemovedBonus: 3, selfPenalty: 4,
  teammatePenalty: 6, adjacencyBonus: 3, huntPatternBonus: 2,
};

const HARD_WEIGHTS: Record<string, WeightConfig> = {
  hunt:         HARD_HUNT,
  kill:         { ...HARD_HUNT, killBonus: 15, adjacencyBonus: 5 },
  'trade-up':   { ...HARD_HUNT, enemyHitValue: 6, killBonus: 15, shotsRemovedBonus: 5, selfPenalty: 1, teammatePenalty: 3, adjacencyBonus: 2, huntPatternBonus: 0 },
  'protect-lead': { ...HARD_HUNT, selfPenalty: 8 },
  desperation:  { ...HARD_HUNT, selfPenalty: 1, teammatePenalty: 1 },
  cleanup:      { ...HARD_HUNT, enemyHitValue: 12, killBonus: 18 },
};

const IMPOSSIBLE_BASE: WeightConfig = {
  enemyHitValue: 10, killBonus: 20, shotsRemovedBonus: 8, selfPenalty: 6,
  teammatePenalty: 2, adjacencyBonus: 0, huntPatternBonus: 0,
};

/** Get dynamic self-penalty for Impossible based on remaining health ratio */
function impossibleSelfPenalty(game: Game, botId: string): number {
  const bot = game.players.get(botId);
  if (!bot) return 6;
  const totalCells = bot.ships.reduce((sum, s) => sum + s.cells.length, 0);
  const remainingCells = bot.ships.reduce((sum, s) => sum + s.cells.length - s.hits.size, 0);
  return (remainingCells / Math.max(totalCells, 1)) * 6;
}

export function getDoctrineWeights(
  difficulty: AiDifficulty, doctrine: Doctrine, game?: Game, botId?: string,
): WeightConfig {
  switch (difficulty) {
    case 'easy': return MEDIUM_WEIGHTS.hunt; // Easy doesn't use scoring, but fallback
    case 'medium': return MEDIUM_WEIGHTS[doctrine] ?? MEDIUM_WEIGHTS.hunt;
    case 'hard': return HARD_WEIGHTS[doctrine] ?? HARD_HUNT;
    case 'impossible': {
      const selfPenalty = (game && botId) ? impossibleSelfPenalty(game, botId) : 6;
      return { ...IMPOSSIBLE_BASE, selfPenalty };
    }
  }
}

// --- Doctrine Selection ---

function countAliveEnemies(game: Game, botId: string): { count: number; maxShips: number } {
  let count = 0;
  let maxShips = 0;
  for (const [pid, player] of game.players) {
    if (pid === botId) continue;
    if (game.teamsEnabled && game.teams.get(pid) === game.teams.get(botId)) continue;
    if (!isPlayerAlive(player)) continue;
    count++;
    maxShips = Math.max(maxShips, playerShotCount(player));
  }
  return { count, maxShips };
}

export function selectDoctrine(game: Game, botId: string, difficulty: AiDifficulty): Doctrine {
  if (difficulty === 'easy') return 'hunt';
  const bot = game.players.get(botId);
  if (!bot) return 'hunt';

  const botSurviving = playerShotCount(bot);
  const { count: enemyCount, maxShips } = countAliveEnemies(game, botId);

  if (enemyCount <= 1) return 'cleanup';
  if (botSurviving <= 2) return 'desperation';
  if (getActiveHits(game, botId).length > 0) return 'kill';
  if ((difficulty === 'hard' || difficulty === 'impossible') && botSurviving > maxShips) return 'protect-lead';
  return 'hunt';
}
