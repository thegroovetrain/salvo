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
 * The lattice's even spacing is 2·spawnRing·sin(π/playerCap). Since Story 9.8
 * (Eric 2026-10-13: *"16 captains on a 10,000 u ocean"* — R 5000, cap 16) that
 * is ≈1,560.7u against 1,500u of radar, so NO pair starts inside radar; it was
 * 700.8u against 660u at cap 20 on the 2800u ocean, where the retired literal
 * 32 gave 439u — INSIDE radar, so two captains could start the match already
 * painting each other. That inequality is pinned as a constraint test in
 * spawn.test.ts (every term live CONFIG) so retuning the cap, the map radius,
 * the spawn fraction or radar range fails the build.
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

/**
 * HARNESS-ONLY SPAWN LAYOUT (Epic 9 tuning pass, Story 9.1 instrument,
 * 2026-10-06). The shipped game places on ONE ring (`map.spawnRing`,
 * `playerCap` slots). A balance arm may ask for several rings — Eric's first
 * candidate is outer 12 at 0.8 R + inner 8 at 0.4 R — by installing a layout
 * here. `null` (the default, and the only value production ever sees) is the
 * shipped single-ring path, candidate for candidate. Fractions are of the MAP
 * RADIUS. Installed only by batchSim (`--spawn-rings`); no production code
 * path calls the setter, so this is a measurement dial, not a mechanic — the
 * mechanic, if Eric rules it in, is Story 9.1's to promote into CONFIG.
 * KNOWN LIMIT: mapgen keeps its coastline keep-clear band only around the
 * shipped ring, so an inner slot may sit near land and be skipped (island
 * clearance is still enforced; the hull takes the next clear slot or the
 * validated fallback ladder). The harness reports how often that happened.
 */
export interface SpawnRing {
  /** Ring radius as a fraction of the map radius. */
  fraction: number;
  /** Evenly spaced candidate slots on this ring. */
  slots: number;
}

export interface SpawnLayout {
  rings: readonly SpawnRing[];
}

let spawnLayout: SpawnLayout | null = null;

export function setSpawnLayout(layout: SpawnLayout | null): void {
  spawnLayout = layout;
}

export function getSpawnLayout(): SpawnLayout | null {
  return spawnLayout;
}

/** Ring radii the candidate lattice sits on under the installed layout (or the
 *  shipped ring) — the harness classifies a placed hull as on-lattice or a
 *  fallback by distance to these. */
export function spawnRingRadii(map: MapShape): number[] {
  if (spawnLayout === null) return [map.spawnRing];
  return spawnLayout.rings.map((ring) => ring.fraction * map.radius);
}

/** The coarse candidate lattice at phase `offset`: the shipped ring when no
 *  layout is installed, else every ring of the layout, all sharing the phase. */
function spawnCandidates(map: MapShape, offset: number): Vec2[] {
  const out: Vec2[] = [];
  if (spawnLayout === null) {
    for (let i = 0; i < SPAWN_CANDIDATES; i++) out.push(ringPoint(map, offset + (i * TAU) / SPAWN_CANDIDATES));
    return out;
  }
  for (const ring of spawnLayout.rings) {
    const r = ring.fraction * map.radius;
    for (let i = 0; i < ring.slots; i++) {
      const a = offset + (i * TAU) / ring.slots;
      out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
  }
  return out;
}

// Min clearance between a spawn point and any island edge: the LARGEST hull
// bounding radius (max distance from ship origin to any silhouette vert) over
// EVERY hull id. Using the true silhouette radius (not length/2) covers hulls whose
// stern corners reach past half-length, so any hull spawns fully island-clear.
const MAX_HULL_RADIUS = Math.max(...HULL_IDS.map((id) => polygonMaxRadius(hullSilhouette(id))));

/** Min clearance between a spawn point and any island edge (max hull radius). */
export const SPAWN_ISLAND_CLEARANCE = MAX_HULL_RADIUS;

/**
 * Signed clearance from `p` to the nearest island COASTLINE (negative =
 * ashore). EXPORTED (Story 5.6) so every other placement — today the
 * airdrops and the supply-drop spots and crates — reads THE SAME clearance
 * math the spawn ring uses — the one
 * place "is this water deep enough for a hull" is answered.
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

/**
 * IS THIS A POINT A HULL MAY BE PLACED AT (Story 9.15 review gate)? Inside the
 * map disc by a full hull's clearance AND island-clear by the very test the
 * spawn lattice applies (`clearOfIslands` at SPAWN_ISLAND_CLEARANCE) — one
 * predicate, so a dev pose is judged by the same water the picker would accept.
 * `World.placement` gates every dev pose through here; a point that fails falls
 * back to the shipped pick, which keeps the edges' "island-clear by
 * construction" claim (and resolveShipPose's induction base) true.
 */
export function isSpawnClear(map: MapShape, p: Vec2): boolean {
  return Math.hypot(p.x, p.y) <= map.radius - SPAWN_ISLAND_CLEARANCE && clearOfIslands(p, map.islands);
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
// SUPPLY-DROP SPOTS (Eric 2026-11-15, Story 11.7, for the radio beacons;
// kept for the supply drops that replaced them, Eric 2026-11-19, Story 12.4,
// epic-12 amendment 5(f): "Same spawn characteristics") — random open water.
// The fleet-anchor max-min rule that placed beacons since Story 10.8 is
// retired: it put every match's spots in the same regular pattern, pushed
// away from the players.
// ---------------------------------------------------------------------------

/** The placement knobs `pickSupplySpot` reads (`CONFIG.supplyDrops` in play). */
export interface SupplySpotConfig {
  /** Radius of each captain's keep-out disc — the SOFT rule. */
  readonly keepOutU: number;
  /** Least distance to every spot already placed this cycle — a HARD rule. */
  readonly minSpacingU: number;
  /** Uniform draws tried before the spot is given up. */
  readonly placeAttempts: number;
}

/** A supply-drop spot. `keepOutRelaxed` = no draw cleared every captain's disc,
 *  so this is the first draw that met the hard rules (the caller logs it). */
export interface SupplySpot {
  x: number;
  y: number;
  keepOutRelaxed: boolean;
}

/** Is `p` within `r` (inclusive) of any point of `pts`? */
function withinAny(p: Vec2, pts: readonly Vec2[], r: number): boolean {
  const r2 = r * r;
  for (const q of pts) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

/** Does `p` meet the hard rules: off land, and at least `minSpacingU` from
 *  every spot already taken this cycle? */
function supplySpotHardOk(p: Vec2, islands: readonly Island[], taken: readonly Vec2[], minSpacingU: number): boolean {
  if (islandClearance(p, islands) <= SPAWN_ISLAND_CLEARANCE) return false;
  const s2 = minSpacingU * minSpacingU;
  for (const q of taken) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx * dx + dy * dy < s2) return false;
  }
  return true;
}

/**
 * Pick one supply-drop spot (Eric 2026-11-15, Story 11.7 — for the radio
 * beacons; the supply drops keep it, Story 12.4). Each draw is
 * uniform over the disc of `radius` about `center` (sqrt radius), FLOAT32-
 * exact like the wire value, so every distance test below is the one the
 * placed spot really has.
 *
 * Hard rules, never broken: inside that disc; clear of land at the spawn
 * ring's clearance; at least `cfg.minSpacingU` from every point of `taken`.
 * Soft rule: farther than `cfg.keepOutU` from every point of `captains`.
 *
 * Degradation (the placement always happens when it can, and degrades
 * visibly): the first draw meeting hard + soft wins; else the first draw
 * that met the hard rules, with `keepOutRelaxed: true`; else null (no
 * drop for this slot). A `radius` ≤ 0 is null at once. Never throws.
 */
export function pickSupplySpot(
  center: Vec2,
  radius: number,
  islands: readonly Island[],
  taken: readonly Vec2[],
  captains: readonly Vec2[],
  cfg: SupplySpotConfig,
  rng: Rng,
): SupplySpot | null {
  if (!(radius > 0)) return null;
  let relaxed: Vec2 | null = null;
  for (let i = 0; i < cfg.placeAttempts; i += 1) {
    const r = radius * Math.sqrt(rng.next()); // sqrt => uniform over the disc
    const a = rng.next() * TAU;
    const p = { x: Math.fround(center.x + Math.cos(a) * r), y: Math.fround(center.y + Math.sin(a) * r) };
    // The float32 rounding can push a rim draw a hair outside the disc.
    if (Math.hypot(p.x - center.x, p.y - center.y) > radius) continue;
    if (!supplySpotHardOk(p, islands, taken, cfg.minSpacingU)) continue;
    if (!withinAny(p, captains, cfg.keepOutU)) return { x: p.x, y: p.y, keepOutRelaxed: false };
    relaxed ??= p;
  }
  return relaxed === null ? null : { x: relaxed.x, y: relaxed.y, keepOutRelaxed: true };
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
  for (const p of spawnCandidates(map, offset)) {
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
