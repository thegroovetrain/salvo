// Spawn-ring placement. Candidates are evenly spaced points on the spawn ring
// (randomly phase-offset via the world's seeded rng); islands are excluded and
// the candidate farthest from every existing ship wins (max-min-distance).
// Mapgen keeps island edges at least SPAWN_MARGIN (64u) off the ring; the
// per-hull clearance here is the LARGEST hull bounding radius (≈62.29u for the
// battleship, whose stern corners reach past length/2). With one candidate per
// player slot a valid one normally remains; when none do (a pathological map)
// the VALIDATED fallback sweeps a finer ring, then smaller circles toward the
// map center — which mapgen keeps island-free (INNER_FRACTION) — so the
// returned point is ALWAYS island-clear, never a best-effort overlapping one.

import {
  CONFIG,
  HULL_IDS,
  dist,
  hullSilhouette,
  islandDistance,
  polygonMaxRadius,
  type Island,
  type MapShape,
  type Rng,
  type Vec2,
} from '@salvo/shared';

const TAU = Math.PI * 2;

/**
 * Evenly spaced candidate points sampled on the spawn ring — ONE PER PLAYER
 * SLOT (Eric ruling 2026-08-16: *"no reason to have 32 potential start slots in
 * a game meant for 20 players"*). DERIVED, never a literal: the count IS
 * `CONFIG.map.playerCap`, so the lattice a full lobby is drawn from has exactly
 * as many slots as there are captains to fill it.
 *
 * The lattice's even spacing is 2·spawnRing·sin(π/playerCap) = 700.8u, clear of
 * the 660u radar range, where the retired literal 32 gave 439u — INSIDE radar,
 * so two captains could start the match already painting each other. That
 * inequality is pinned as a constraint test in spawn.test.ts so retuning the
 * cap, the map radius, the spawn fraction or radar range fails the build.
 *
 * THE COUNT IS ONLY HALF OF IT — the phase is the other half, and both are
 * required. `pickSpawn` used to re-roll its `offset` on EVERY call, so each
 * hull came off its own independently rotated lattice and a full lobby never
 * shared one; the count alone moved measured min pairwise separation from
 * 359-475u (32 candidates) to only 352-483u (20), inside radar on every one of
 * 60 seeds either way. The `phase` parameter below is what closes that: World
 * draws ONE lattice phase per match and passes it at all three placement edges,
 * which is what actually delivers Eric's ruled outcome — *"No participants
 * should start so close to each other that they can see each other, let alone
 * radar scan each other."*
 */
export const SPAWN_CANDIDATES = CONFIG.map.playerCap;

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

/**
 * Signed clearance from `p` to the nearest island COASTLINE (negative =
 * ashore). EXPORTED (Story 5.6) so the fleet-wave spawner scatters its nine
 * hulls against THE SAME clearance math the spawn ring uses — the one place
 * "is this water deep enough for a hull" is answered.
 *
 * `islandDistance` carries the mandatory bounding-circle broadphase
 * itself: past `r + ISLAND_DIST_SLACK` (128u) it returns the cheap
 * conservative lower bound `dist - r` without touching an edge, and that slack
 * comfortably exceeds SPAWN_ISLAND_CLEARANCE (≈62.29u) so the bound is
 * decision-equivalent here. That matters: bestOnCircle runs this 256
 * candidates × 9 rings × every island.
 */
export function islandClearance(p: Vec2, islands: readonly Island[]): number {
  let min = Infinity;
  for (const isle of islands) {
    const gap = islandDistance(p, isle);
    if (gap < min) min = gap;
  }
  return min;
}

function clearOfIslands(p: Vec2, islands: readonly Island[]): boolean {
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

function ringPoint(map: MapShape, angle: number): Vec2 {
  return { x: Math.cos(angle) * map.spawnRing, y: Math.sin(angle) * map.spawnRing };
}

/** Best island-clear point on a circle of radius `r`, or null if none clears.
 *  256 candidates × every island — islandClearance's broadphase is what keeps
 *  this affordable now that clearance is polygon-exact. */
function bestOnCircle(r: number, occupied: readonly Vec2[], islands: readonly Island[], offset: number): Vec2 | null {
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

function fallbackSpawn(map: MapShape, occupied: readonly Vec2[], offset: number): Vec2 {
  for (let k = 0; k <= FALLBACK_RINGS; k++) {
    const r = (map.spawnRing * (FALLBACK_RINGS - k)) / FALLBACK_RINGS;
    const p = bestOnCircle(r, occupied, map.islands, offset);
    if (p) return p;
  }
  return { x: 0, y: 0 }; // mapgen INNER_FRACTION guarantee — island-free by construction
}

// ---------------------------------------------------------------------------
// FLEET ANCHORS (Story 5.6, amendment 37) — the SIBLING placement path.
// ---------------------------------------------------------------------------

/** Samples drawn per anchor request. One pass, one tick; the retry budget
 *  (CONFIG.fleet.spawnRetryTicks) is what turns this into a real search. */
const FLEET_ANCHOR_SAMPLES = 256;

/** One captain's intel disc — the region a fleet anchor must avoid. */
export interface IntelDisc {
  x: number;
  y: number;
  /** The captain's EFFECTIVE radar range (stats.radarRange — boon-widened). */
  r: number;
}

/** An anchor answer. `fallback` = no sampled point cleared every intel disc,
 *  so this is the plain max-min point instead (the caller decides whether to
 *  accept it now or retry next tick, and LOGS it when it does — the wave
 *  always arrives, and degrades visibly rather than silently). */
export interface FleetAnchor {
  x: number;
  y: number;
  fallback: boolean;
}

/** Is `p` inside ANY captain's intel disc? EXPORTED (Story 5.6, review gate)
 *  so the per-hull scatter rejects the same region the anchor does — one
 *  predicate, one place, no second derivation of "already in someone's
 *  intel". */
export function insideIntelDisc(p: Vec2, discs: readonly IntelDisc[]): boolean {
  for (const d of discs) {
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    if (dx * dx + dy * dy <= d.r * d.r) return true;
  }
  return false;
}

/**
 * Pick a fleet anchor inside the live ring (Story 5.6, amendment 37).
 *
 * NOT a variant of pickSpawn: that places ONE hull on the spawn RING at match
 * start with no hard constraint at all (`occupied` only scores). This is the
 * first placement in the codebase with a HARD constraint — *outside EVERY
 * captain's intel disc* — over a region (a disc about the live ring's centre,
 * which is offset and shrinking) rather than a circle, and it must be able to
 * report infeasibility rather than silently returning a bad point.
 *
 * Uniform over the disc (sqrt radius), island-clear at the SAME clearance the
 * spawn ring demands, scored max-min against `occupied` exactly as pickSpawn
 * scores. Two bests are tracked in ONE pass: the best point that clears every
 * intel disc, and the best island-clear point regardless — the latter is the
 * ratified fallback, returned with `fallback: true`.
 */
export function pickFleetAnchor(
  center: Vec2,
  maxRadius: number,
  islands: readonly Island[],
  occupied: readonly Vec2[],
  denied: readonly IntelDisc[],
  rng: Rng,
): FleetAnchor {
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  let alt: Vec2 | null = null;
  let altScore = -Infinity;
  for (let i = 0; i < FLEET_ANCHOR_SAMPLES; i++) {
    const a = rng.float(0, TAU);
    const r = Math.sqrt(rng.next()) * maxRadius; // sqrt => uniform over the disc
    const p = { x: center.x + Math.cos(a) * r, y: center.y + Math.sin(a) * r };
    if (islandClearance(p, islands) <= SPAWN_ISLAND_CLEARANCE) continue;
    const score = minDistTo(p, occupied);
    if (score > altScore) {
      alt = p;
      altScore = score;
    }
    if (insideIntelDisc(p, denied)) continue;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  if (best) return { x: best.x, y: best.y, fallback: false };
  // Nothing cleared the discs. The max-min point is the ratified degradation;
  // a map whose every sample is ashore falls back to the ring centre (the
  // pickWaypoint precedent — push-out is survivable, no placement is not).
  if (alt) return { x: alt.x, y: alt.y, fallback: true };
  return { x: center.x, y: center.y, fallback: true };
}

/**
 * Pick a spawn point on the map's spawn ring: not inside (or hugging) any
 * island, maximizing the minimum distance to `occupied` ship positions.
 * With no occupied ships the phase offset makes the pick uniformly random —
 * per CALL without a shared phase, per MATCH with one (under a shared lattice
 * the first hull always takes the same slot, and it is the lattice's rotation
 * that carries the randomness; relative geometry is therefore fixed by
 * placement order, which is what makes the first two hulls exactly antipodal).
 * A validated finer sweep covers the pathological map (see fallbackSpawn).
 *
 * `phase` (Eric ruling 2026-08-16) rotates the candidate lattice. OMIT IT and
 * the behavior is exactly what shipped — one fresh `rng.float(0, TAU)` drawn
 * per call, i.e. a lattice rotated independently for every hull. PASS IT and
 * every caller sharing that value draws from ONE lattice, which is what makes a
 * full lobby land on distinct, evenly spaced slots instead of wherever each
 * hull's private lattice happened to fall. `World` owns the shared value; the
 * optional form keeps the several direct test callers untouched. Note the
 * `??`: a supplied phase short-circuits the draw, so a shared lattice consumes
 * NO rng — the phase cannot drift with the number of hulls placed.
 */
export function pickSpawn(map: MapShape, occupied: readonly Vec2[], rng: Rng, phase?: number): Vec2 {
  const offset = phase ?? rng.float(0, TAU);
  let best: Vec2 | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < SPAWN_CANDIDATES; i++) {
    const p = ringPoint(map, offset + (i * TAU) / SPAWN_CANDIDATES);
    if (!clearOfIslands(p, map.islands)) continue;
    const score = minDistTo(p, occupied);
    // AN OCCUPIED SLOT IS NOT A FREE SLOT. Without this a shared lattice can
    // STACK hulls: once every island-clear candidate is taken, the max-min
    // score of a taken one is 0 — still greater than the -Infinity seed — so
    // the next hull would be placed exactly on top of an existing one, and
    // resolveShipPose treats the spawn pose as valid by induction, so an
    // overlapping spawn poisons every subsequent tick. Skipping instead leaves
    // `best` null and hands the case to the validated fallback ladder, which is
    // already the "no coarse candidate works" path. Inert on the per-call phase
    // (an exact 0 needs a continuous-random coincidence), so the shipped
    // behavior does not move.
    if (score <= 0) continue;
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best ?? fallbackSpawn(map, occupied, offset);
}
