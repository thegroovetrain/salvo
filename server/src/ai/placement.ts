import type { ShipPlacement, AiDifficulty } from '@salvo/shared';
import { SHIP_LENGTHS } from '@salvo/shared';
import { allHexes, parseHex, hexLinear, hexDistance } from '@salvo/shared/hex';
import { pickRandom, type RNG } from './helpers.js';

// ============================================================
// Ship Placement — Per-Difficulty Strategies
//
// Easy:       Fully random
// Medium:     Random (unchanged from Easy for now)
// Hard:       Spread ships apart, center-biased, avoid outer ring
// Impossible: Maximum spread, avoid hunt patterns, center-biased
// ============================================================

function shouldSkipOuterRing(difficulty: AiDifficulty, q: number, r: number, rings: number, rng: RNG): boolean {
  if (difficulty !== 'hard' && difficulty !== 'impossible') return false;
  const dist = hexDistance({ q: 0, r: 0 }, { q, r });
  return dist >= rings - 1 && rng() < 0.7;
}

/** For Hard/Impossible: penalize cells close to already-placed ships */
function isSpreadEnough(cells: string[], occupied: Set<string>, difficulty: AiDifficulty): boolean {
  if (difficulty !== 'hard' && difficulty !== 'impossible') return true;
  const minDist = difficulty === 'impossible' ? 3 : 2;
  for (const cell of cells) {
    const h = parseHex(cell);
    if (!h) continue;
    for (const occ of occupied) {
      const oh = parseHex(occ);
      if (!oh) continue;
      if (hexDistance(h, oh) < minDist) return false;
    }
  }
  return true;
}

/** For Impossible: avoid cells that match hex 3-coloring pattern */
function avoidsHuntPattern(cells: string[], difficulty: AiDifficulty): boolean {
  if (difficulty !== 'impossible') return true;
  // Prefer placements where at least half the cells DON'T match color-0
  const color0Count = cells.filter(c => {
    const h = parseHex(c);
    return h && ((h.q - h.r) % 3 + 3) % 3 === 0;
  }).length;
  return color0Count <= Math.ceil(cells.length / 2);
}

function tryPlaceShip(
  length: number, difficulty: AiDifficulty, rings: number,
  allValidHexes: string[], occupied: Set<string>, islands: Set<string>,
  rng: RNG,
): ShipPlacement | null {
  const maxAttempts = difficulty === 'hard' || difficulty === 'impossible' ? 400 : 200;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const anchor = pickRandom(allValidHexes, rng);
    const h = parseHex(anchor)!;

    if (shouldSkipOuterRing(difficulty, h.q, h.r, rings, rng)) continue;

    const dir = Math.floor(rng() * 6);
    const cells = hexLinear(h.q, h.r, dir, length, rings);
    if (!cells) continue;
    if (cells.some(c => occupied.has(c) || islands.has(c))) continue;

    // Smart placement checks
    if (!isSpreadEnough(cells, occupied, difficulty)) continue;
    if (!avoidsHuntPattern(cells, difficulty)) continue;

    cells.forEach(c => occupied.add(c));
    return { length, cells };
  }
  return null;
}

export function generatePlacement(
  difficulty: AiDifficulty, rings: number = 5, islands: Set<string> = new Set(),
  rng: RNG = Math.random,
): ShipPlacement[] {
  const occupied = new Set<string>();
  const ships: ShipPlacement[] = [];
  const lengths = [...SHIP_LENGTHS].sort((a, b) => b - a);
  const allValidHexes = allHexes(rings).filter(c => !islands.has(c));

  for (const length of lengths) {
    const placed = tryPlaceShip(length, difficulty, rings, allValidHexes, occupied, islands, rng);
    if (!placed) {
      // Retry entire placement
      return generatePlacement(difficulty, rings, islands, rng);
    }
    ships.push(placed);
  }

  return ships;
}
