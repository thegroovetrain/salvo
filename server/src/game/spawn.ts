// Spawn-ring placement. Candidates are evenly spaced points on the spawn ring
// (randomly phase-offset via the world's seeded rng); islands are excluded and
// the candidate farthest from every existing ship wins (max-min-distance).
// Mapgen guarantees the ring clears island edges by SPAWN_MARGIN (40u), which
// exceeds the half-hull clearance used here, so a valid candidate always exists.

import { CONFIG, dist, type Circle, type GameMap, type Rng, type Vec2 } from '@salvo/shared';

const TAU = Math.PI * 2;

/** Evenly spaced candidate points sampled on the spawn ring. */
export const SPAWN_CANDIDATES = 32;

/** Min clearance between a spawn point and any island edge (half hull length). */
export const SPAWN_ISLAND_CLEARANCE = CONFIG.ship.length / 2;

function clearOfIslands(p: Vec2, islands: readonly Circle[]): boolean {
  return islands.every((c) => dist(p, c) > c.r + SPAWN_ISLAND_CLEARANCE);
}

function minDistTo(p: Vec2, others: readonly Vec2[]): number {
  let min = Infinity;
  for (const o of others) {
    const d = dist(p, o);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Pick a spawn point on the map's spawn ring: not inside (or hugging) any
 * island, maximizing the minimum distance to `occupied` ship positions.
 * With no occupied ships the phase offset makes the pick uniformly random.
 */
export function pickSpawn(map: GameMap, occupied: readonly Vec2[], rng: Rng): Vec2 {
  const offset = rng.float(0, TAU);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    const a = offset + (i * TAU) / SPAWN_CANDIDATES;
    const p = { x: Math.cos(a) * map.spawnRing, y: Math.sin(a) * map.spawnRing };
    if (!clearOfIslands(p, map.islands)) continue;
    const score = minDistTo(p, occupied);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  // Unreachable by mapgen's spawn-ring guarantee; kept as a hard fallback.
  return best ?? { x: map.spawnRing, y: 0 };
}
