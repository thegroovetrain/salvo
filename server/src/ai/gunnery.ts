import type { Game, AiDifficulty, Ship } from '@salvo/shared';
import { isShipSunk, isPlayerAlive, playerShotCount } from '@salvo/shared';
import { parseHex } from '@salvo/shared/hex';
import { selectDoctrine, getDoctrineWeights } from './doctrine.js';
import type { WeightConfig } from './doctrine.js';
import { probabilityMap } from './probability.js';
import {
  shuffled, getOwnShipCells, getTeammateShipCells,
  getActiveHits, getAdjacentCoords, getUnshotCoords,
  type RNG,
} from './helpers.js';

// ============================================================
// Gunnery — Salvo Optimization Layer
//
// Scores every unshot cell and selects the best k-shot salvo.
// Multi-hit aware: cells can have ships from multiple players.
// ============================================================

const DEBUG = typeof process !== 'undefined' && process.env.DEBUG_AI === '1';

function debugLog(...args: unknown[]): void {
  if (DEBUG) console.debug('[AI]', ...args);
}

// --- Cell Info for Scoring ---

interface CellInfo {
  enemyProbability: number;
  hasSelfShip: boolean;
  hasTeammateShip: boolean;
  isAdjacentToHit: boolean;
  matchesHuntPattern: boolean;
  canSinkEnemy: boolean;
  canSinkWithTeammateDamage: boolean;
}

// --- Hex Pattern Check ---

function isHuntPatternCell(coord: string): boolean {
  const h = parseHex(coord);
  return h ? ((h.q - h.r) % 3 + 3) % 3 === 0 : false;
}

// --- Score a Single Cell ---

function scoreCell(info: CellInfo, weights: WeightConfig, difficulty: AiDifficulty): number {
  let score = weights.enemyHitValue * info.enemyProbability;
  if (info.canSinkEnemy) score += weights.killBonus + weights.shotsRemovedBonus;
  if (info.hasSelfShip) score -= weights.selfPenalty;
  score += scoreTeammatePenalty(info, weights, difficulty);
  if (info.isAdjacentToHit) score += weights.adjacencyBonus;
  if (info.matchesHuntPattern) score += weights.huntPatternBonus;
  return score;
}

function scoreTeammatePenalty(info: CellInfo, weights: WeightConfig, difficulty: AiDifficulty): number {
  if (!info.hasTeammateShip) return 0;
  // Hard filter: only allow teammate damage when kill is confirmed
  if (difficulty === 'easy' || difficulty === 'medium') return -Infinity;
  if (info.canSinkEnemy) return -weights.teammatePenalty;
  return -Infinity; // No kill confirmed = never fire at teammate
}

// --- Enemy Ship Detection (Impossible only — reads actual positions) ---

function detectEnemyAtCell(
  coord: string, game: Game, botId: string,
  shotsSet: Set<string>, sinksSet: Set<string>,
  hasTeammateShip: boolean,
): { found: boolean; canSink: boolean; canSinkWithTm: boolean } {
  let found = false, canSink = false, canSinkWithTm = false;
  for (const [pid, player] of game.players) {
    if (pid === botId || !isPlayerAlive(player)) continue;
    if (game.teamsEnabled && game.teams.get(pid) === game.teams.get(botId)) continue;
    const result = checkPlayerShips(coord, pid, player.ships, shotsSet, sinksSet);
    if (result.hit) found = true;
    if (result.sink) { canSink = true; if (hasTeammateShip) canSinkWithTm = true; }
  }
  return { found, canSink, canSinkWithTm };
}

function checkPlayerShips(
  coord: string, pid: string, ships: Ship[],
  shotsSet: Set<string>, sinksSet: Set<string>,
): { hit: boolean; sink: boolean } {
  for (const ship of ships) {
    if (isShipSunk(ship)) continue;
    const shipKey = `${pid}:${ship.cells.join(',')}`;
    if (sinksSet.has(shipKey)) continue;
    if (!ship.cells.includes(coord)) continue;
    if (ship.hits.has(coord) || shotsSet.has(coord)) continue;
    const unhit = ship.cells.filter(c => !ship.hits.has(c) && !shotsSet.has(c));
    return { hit: true, sink: unhit.length === 1 && unhit[0] === coord };
  }
  return { hit: false, sink: false };
}

// --- Build Cell Info for Medium/Hard ---

function buildCellInfo(
  coord: string, ownCells: Set<string>, teammateCells: Set<string>,
  activeHitSet: Set<string>, probMap: Map<string, number> | null,
  difficulty: AiDifficulty, rings: number,
): CellInfo {
  const hasSelfShip = ownCells.has(coord);
  const hasTeammateShip = teammateCells.has(coord);
  let enemyProbability = 0;

  if (probMap) {
    enemyProbability = probMap.get(coord) ?? 0;
  } else if (!hasSelfShip && !hasTeammateShip) {
    enemyProbability = 1; // Medium: uniform prior for non-friendly cells
  }

  const adj = getAdjacentCoords(coord, rings);
  return {
    enemyProbability, hasSelfShip, hasTeammateShip,
    isAdjacentToHit: adj.some(a => activeHitSet.has(a)),
    matchesHuntPattern: isHuntPatternCell(coord),
    canSinkEnemy: false, canSinkWithTeammateDamage: false,
  };
}

// --- Build Cell Info for Impossible (with simulation state) ---

function buildCellInfoImpossible(
  coord: string, game: Game, botId: string,
  ownCells: Set<string>, teammateCells: Set<string>,
  activeHitSet: Set<string>, simShots: Set<string>, simSinks: Set<string>,
): CellInfo {
  const hasSelfShip = ownCells.has(coord);
  const hasTeammateShip = teammateCells.has(coord);
  const enemy = detectEnemyAtCell(coord, game, botId, simShots, simSinks, hasTeammateShip);
  const adj = getAdjacentCoords(coord, game.rings);

  return {
    enemyProbability: enemy.found ? 1 : 0,
    hasSelfShip, hasTeammateShip,
    isAdjacentToHit: adj.some(a => activeHitSet.has(a)),
    matchesHuntPattern: false,
    canSinkEnemy: enemy.canSink,
    canSinkWithTeammateDamage: enemy.canSinkWithTm,
  };
}

// ============================================================
// Per-Tier Salvo Selection
// ============================================================

function chooseEasy(unshot: string[], count: number, rng: RNG): string[] {
  return shuffled(unshot, rng).slice(0, count);
}

function chooseScoredSalvo(
  game: Game, botId: string, unshot: string[], count: number,
  difficulty: AiDifficulty, rng: RNG,
): string[] {
  const ownCells = getOwnShipCells(game, botId);
  const teammateCells = getTeammateShipCells(game, botId);
  const activeHitSet = new Set(getActiveHits(game, botId));
  const doctrine = selectDoctrine(game, botId, difficulty);
  const weights = getDoctrineWeights(difficulty, doctrine, game, botId);
  const probMap = difficulty === 'hard' ? probabilityMap(game, botId) : null;

  debugLog(`${botId} difficulty=${difficulty} doctrine=${doctrine}`);

  const scored = unshot.map(coord => ({
    coord,
    score: scoreCell(
      buildCellInfo(coord, ownCells, teammateCells, activeHitSet, probMap, difficulty, game.rings),
      weights, difficulty,
    ),
  }));

  const shuffledScored = shuffled(scored, rng);
  shuffledScored.sort((a, b) => b.score - a.score);

  if (DEBUG) {
    const top = shuffledScored.slice(0, 3);
    debugLog(`top cells: ${top.map(t => `${t.coord}=${t.score.toFixed(1)}`).join(', ')}`);
  }

  return shuffledScored.slice(0, count).map(s => s.coord);
}

function chooseImpossible(
  game: Game, botId: string, unshot: string[], count: number, rng: RNG,
): string[] {
  const ctx = prepareImpossibleContext(game, botId);
  const targets: string[] = [];

  for (let i = 0; i < count; i++) {
    const remaining = unshot.filter(c => !ctx.simShots.has(c));
    if (remaining.length === 0) break;
    const best = pickBestCell(remaining, game, botId, ctx, rng);
    if (!best) break;
    targets.push(best);
    ctx.simShots.add(best);
    simulateSink(best, game, targets, ctx);
  }

  if (DEBUG) debugLog(`impossible targets: ${targets.join(', ')}`);
  return targets;
}

interface ImpossibleCtx {
  ownCells: Set<string>;
  teammateCells: Set<string>;
  activeHitSet: Set<string>;
  weights: WeightConfig;
  simShots: Set<string>;
  simSinks: Set<string>;
}

function prepareImpossibleContext(game: Game, botId: string): ImpossibleCtx {
  const doctrine = selectDoctrine(game, botId, 'impossible');
  return {
    ownCells: getOwnShipCells(game, botId),
    teammateCells: getTeammateShipCells(game, botId),
    activeHitSet: new Set(getActiveHits(game, botId)),
    weights: getDoctrineWeights('impossible', doctrine, game, botId),
    simShots: new Set(game.shots),
    simSinks: new Set<string>(),
  };
}

function pickBestCell(
  remaining: string[], game: Game, botId: string, ctx: ImpossibleCtx, rng: RNG,
): string | null {
  let bestCoord = '';
  let bestScore = -Infinity;
  for (const coord of remaining) {
    const info = buildCellInfoImpossible(
      coord, game, botId, ctx.ownCells, ctx.teammateCells,
      ctx.activeHitSet, ctx.simShots, ctx.simSinks,
    );
    const s = scoreCell(info, ctx.weights, 'impossible') + rng() * 0.01;
    if (s > bestScore) { bestScore = s; bestCoord = coord; }
  }
  return bestCoord || null;
}

function simulateSink(
  coord: string, game: Game, targets: string[], ctx: ImpossibleCtx,
): void {
  for (const [pid, player] of game.players) {
    for (const ship of player.ships) {
      if (isShipSunk(ship) || !ship.cells.includes(coord)) continue;
      const shipKey = `${pid}:${ship.cells.join(',')}`;
      if (ctx.simSinks.has(shipKey)) continue;
      const wouldSink = ship.cells.every(c =>
        c === coord || ship.hits.has(c) || targets.includes(c),
      );
      if (wouldSink) ctx.simSinks.add(shipKey);
    }
  }
}

// ============================================================
// Public API
// ============================================================

export function chooseSalvo(
  game: Game, botId: string, difficulty: AiDifficulty, rng: RNG = Math.random,
): string[] {
  const bot = game.players.get(botId);
  if (!bot) return [];
  const shotCount = playerShotCount(bot);
  if (shotCount === 0) return [];

  const unshot = getUnshotCoords(game);
  if (unshot.length === 0) return [];
  const count = Math.min(shotCount, unshot.length);

  switch (difficulty) {
    case 'easy': return chooseEasy(unshot, count, rng);
    case 'medium':
    case 'hard': return chooseScoredSalvo(game, botId, unshot, count, difficulty, rng);
    case 'impossible': return chooseImpossible(game, botId, unshot, count, rng);
  }
}

export function getBotDelay(difficulty: AiDifficulty): number {
  switch (difficulty) {
    case 'easy':       return 500 + Math.random() * 500;
    case 'medium':     return 800 + Math.random() * 700;
    case 'hard':       return 1000 + Math.random() * 1000;
    case 'impossible': return 1200 + Math.random() * 800;
  }
}
