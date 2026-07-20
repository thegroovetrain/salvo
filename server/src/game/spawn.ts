// Spawn-ring placement. Candidates are evenly spaced points on the spawn ring
// (randomly phase-offset via the world's seeded rng); islands are excluded and
// the candidate farthest from every existing ship wins (max-min-distance).
// Mapgen keeps island edges at least SPAWN_MARGIN (64u) off the ring; the
// per-hull clearance here is the LARGEST hull bounding radius (≈62.29u for the
// battleship, whose stern corners reach past length/2). With 32 candidates on
// the ring a valid one normally remains; when none do (a pathological map) the
// VALIDATED fallback sweeps a finer ring, then smaller circles toward the map
// center — which mapgen keeps island-free (INNER_FRACTION) — so the returned
// point is ALWAYS island-clear, never a best-effort overlapping one.

import {
  HULL_IDS,
  dist,
  hullSilhouette,
  polygonMaxRadius,
  type Circle,
  type GameMap,
  type Rng,
  type Vec2,
} from '@salvo/shared';

const TAU = Math.PI * 2;

/** Evenly spaced candidate points sampled on the spawn ring. */
export const SPAWN_CANDIDATES = 32;

/** Finer deterministic ring sweep for the validated fallback. */
const FALLBACK_CANDIDATES = 256;

// Min clearance between a spawn point and any island edge: the LARGEST hull
// bounding radius (max distance from ship origin to any silhouette vert) over
// EVERY hull id — player classes AND drone envelopes (drones spawn on the same
// ring). Using the true silhouette radius (not length/2) covers hulls whose
// stern corners reach past half-length, so any hull spawns fully island-clear.
const MAX_HULL_RADIUS = Math.max(...HULL_IDS.map((id) => polygonMaxRadius(hullSilhouette(id))));

/** Min clearance between a spawn point and any island edge (max hull radius). */
export const SPAWN_ISLAND_CLEARANCE = MAX_HULL_RADIUS;

/** Signed clearance from `p` to the nearest island edge (negative = inside). */
function islandClearance(p: Vec2, islands: readonly Circle[]): number {
  let min = Infinity;
  for (const c of islands) {
    const gap = dist(p, c) - c.r;
    if (gap < min) min = gap;
  }
  return min;
}

function clearOfIslands(p: Vec2, islands: readonly Circle[]): boolean {
  return islandClearance(p, islands) > SPAWN_ISLAND_CLEARANCE;
}

function minDistTo(p: Vec2, others: readonly Vec2[]): number {
  let min = Infinity;
  for (const o of others) {
    const d = dist(p, o);
    if (d < min) min = d;
  }
  return min;
}

function ringPoint(map: GameMap, angle: number): Vec2 {
  return { x: Math.cos(angle) * map.spawnRing, y: Math.sin(angle) * map.spawnRing };
}

/** Best island-clear point on a circle of radius `r`, or null if none clears. */
function bestOnCircle(r: number, occupied: readonly Vec2[], islands: readonly Circle[], offset: number): Vec2 | null {
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < FALLBACK_CANDIDATES; i++) {
    const a = offset + (i * TAU) / FALLBACK_CANDIDATES;
    const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
    if (islandClearance(p, islands) <= SPAWN_ISLAND_CLEARANCE) continue;
    const score = minDistTo(p, occupied);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Validated fallback: no coarse candidate cleared the islands. Sweep a finer
 * ring, then progressively smaller circles toward the map center, returning the
 * first circle's island-clear point farthest from existing ships. The ladder
 * ALWAYS terminates island-clear: mapgen keeps island edges outside
 * INNER_FRACTION (0.15) of the map radius, so the center disc is island-free by
 * construction (≥ ~246u clearance at real map sizes ≫ SPAWN_ISLAND_CLEARANCE)
 * and the final rung — the exact center — can never overlap. This matters
 * because resolveShipPose's rollback treats the spawn pose as valid by
 * induction: an overlapping spawn would poison every subsequent tick.
 */
const FALLBACK_RINGS = 8;

function fallbackSpawn(map: GameMap, occupied: readonly Vec2[], offset: number): Vec2 {
  for (let k = 0; k <= FALLBACK_RINGS; k++) {
    const r = (map.spawnRing * (FALLBACK_RINGS - k)) / FALLBACK_RINGS;
    const p = bestOnCircle(r, occupied, map.islands, offset);
    if (p) return p;
  }
  return { x: 0, y: 0 }; // mapgen INNER_FRACTION guarantee — island-free by construction
}

/**
 * Pick a spawn point on the map's spawn ring: not inside (or hugging) any
 * island, maximizing the minimum distance to `occupied` ship positions.
 * With no occupied ships the phase offset makes the pick uniformly random.
 * A validated finer sweep covers the pathological map (see fallbackSpawn).
 */
export function pickSpawn(map: GameMap, occupied: readonly Vec2[], rng: Rng): Vec2 {
  const offset = rng.float(0, TAU);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    const p = ringPoint(map, offset + (i * TAU) / SPAWN_CANDIDATES);
    if (!clearOfIslands(p, map.islands)) continue;
    const score = minDistTo(p, occupied);
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ?? fallbackSpawn(map, occupied, offset);
}
