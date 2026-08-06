// Deterministic FRACTAL map generation (cycle 51, Eric ruling 2026-08-05) —
// the ORCHESTRATOR: landmass budget, archetype rolls, placement, and
// navigability validation. The landmass shape builder (skeleton -> capsule ->
// periodic-midpoint-displacement coastline) lives in sim/islandShape.ts.
//
// From a seed + player cap, produces the map radius, a spawn ring, and
// polygon-coastline landmasses (Island). The client regenerates the identical
// map from `mapSeed`, so island geometry never travels on the wire.
//
// Archetypes: blob (1-pt skeleton), ridge (2-3 pt skeleton), and archipelago
// — a GROUP concept, not a shape: 2-4 separate landmasses around a common
// anchor with inter-member gaps in [CHANNEL_MIN, CHANNEL_MIN*3]. Channels
// come from gaps between polygons, never from a concavity in one polygon.
// Half-widths follow a power-law-ish distribution (many small rocks, some
// mid, a few large masses) capped by the remaining coverage headroom.
//
// A generated map is only accepted when the shoelace land coverage sits in
// [COVER_MIN, COVER_MAX] of the disc AND the navigability grid (32u cells,
// eroded by widest-hull half-beam + margin, flood-filled 4-CONNECTED from the
// spawn ring) proves every water cell reachable — one deterministic check that
// delivers no-lagoons, no-unreachable-pockets, and no-sub-Battleship channels
// at once. Rejected maps reroll from the SAME rng stream; late attempts also
// relax the landmass COUNT. The invariants are NEVER relaxed: every returned
// map has passed the full `validateMap`, and a ladder that cannot produce one
// throws `MapGenerationError` rather than silently widening the band.

import { mapRadius, CONFIG } from '../constants.js';
import { mulberry32, type Rng } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { closestPointOnPolygon, pointInPolygon } from './silhouette.js';
import {
  buildShape,
  polygonArea,
  M_MIN,
  M_MAX,
  MAX_CONCAVITY,
  ROUGHNESS,
  type Shape,
} from './islandShape.js';

// Re-exported shape-builder surface (tests + consumer fixtures import via here).
export { fractalOffsets, polygonArea, polygonIsSimple, islandFromPolygon } from './islandShape.js';

const TAU = Math.PI * 2;

// --- Ratified constants (MAP_RULES) -----------------------------------------

const INNER_FRACTION = 0.15; // no islands within this fraction of center
const OUTER_FRACTION = 0.9; // islands stay inside this fraction of radius
const SPAWN_MARGIN = 64; // u — min clearance from the spawn ring (>= max hull bounding radius 62.29)
const CHANNEL_MIN = 48; // u — min bounding-circle gap between landmasses (> every hull beam; widest is 35)
const COVER_MIN = 0.03; // shoelace land area / map disc area, lower bound
const COVER_MAX = 0.05; // upper bound
const COVER_TARGET = 0.04; // the budget loop stops once realized cover crosses this
const HW_MIN = 25; // u — smallest landmass half-width (single rocks)
const HW_MAX = 260; // u — largest landmass half-width
const HW_POWER = 2.2; // power-law skew: many small, some mid, few large

/** Widest hull beam across ship classes AND drones (order-independent max). */
const WIDEST_BEAM = Math.max(
  ...Object.values(CONFIG.shipClasses).map((c) => c.hull.beam),
  ...Object.values(CONFIG.drones).map((d) => d.hull.beam),
);

const NAV_CELL = 32; // u — navigability raster cell size
const NAV_MARGIN = 6; // u — hull half-beam slack in the navigability erosion
/** Erosion radius: a cell is navigable iff its centre clears every polygon by
 *  this. Must stay <= CHANNEL_MIN / 2 so a CHANNEL_MIN channel's centerline
 *  stays navigable (pinned by tests). */
const NAV_CLEAR = WIDEST_BEAM / 2 + NAV_MARGIN;

const PLACE_ATTEMPTS = 12; // placement retries per landmass
const MAP_ATTEMPTS = 10; // whole-map rerolls before count relaxation
const GROUP_FAIL_LIMIT = 20; // consecutive group failures before giving up an attempt

/** A generated map: radius, spawn ring radius, and island landmasses. */
export interface GameMap {
  radius: number; // u
  spawnRing: number; // u — radius of the ship spawn ring
  islands: Island[];
}

// --- Placement ---------------------------------------------------------------

function ringBandBlocked(d: number, rLocal: number, spawnRing: number): boolean {
  return Math.abs(d - spawnRing) < rLocal + SPAWN_MARGIN;
}

/** Draw a centre position honoring inner/outer fractions + the spawn-ring band. */
function drawPlacement(rng: Rng, rLocal: number, radius: number, spawnRing: number): Vec2 | null {
  const lo = radius * INNER_FRACTION + rLocal;
  const hi = radius * OUTER_FRACTION - rLocal;
  const bandLo = spawnRing - rLocal - SPAWN_MARGIN;
  const bandHi = spawnRing + rLocal + SPAWN_MARGIN;
  const len1 = Math.max(0, Math.min(hi, bandLo) - lo);
  const len2 = Math.max(0, hi - Math.max(lo, bandHi));
  if (len1 + len2 <= 0) return null;
  const u = rng.float(0, len1 + len2);
  const d = u < len1 ? lo + u : Math.max(lo, bandHi) + (u - len1);
  const ang = rng.float(0, TAU);
  return { x: Math.cos(ang) * d, y: Math.sin(ang) * d };
}

/** Bounding-circle gap >= CHANNEL_MIN against every placed island. */
function clearsAll(pos: Vec2, rLocal: number, islands: readonly Island[]): boolean {
  return islands.every(
    (isle) => Math.hypot(pos.x - isle.x, pos.y - isle.y) >= rLocal + isle.r + CHANNEL_MIN,
  );
}

function toWorldIsland(shape: Shape, pos: Vec2): Island {
  return {
    x: pos.x,
    y: pos.y,
    r: shape.rLocal,
    poly: shape.poly.map((p) => ({ x: p.x + pos.x, y: p.y + pos.y })),
    skeleton: shape.skel.map((p) => ({ x: p.x + pos.x, y: p.y + pos.y })),
    core: shape.core,
  };
}

function placeShape(
  rng: Rng,
  shape: Shape,
  islands: readonly Island[],
  radius: number,
  spawnRing: number,
): Island | null {
  for (let a = 0; a < PLACE_ATTEMPTS; a++) {
    const pos = drawPlacement(rng, shape.rLocal, radius, spawnRing);
    if (!pos) return null;
    if (clearsAll(pos, shape.rLocal, islands)) return toWorldIsland(shape, pos);
  }
  return null;
}

function fitsBoard(pos: Vec2, rLocal: number, radius: number, spawnRing: number): boolean {
  const d = Math.hypot(pos.x, pos.y);
  return (
    d - rLocal >= radius * INNER_FRACTION &&
    d + rLocal <= radius * OUTER_FRACTION &&
    !ringBandBlocked(d, rLocal, spawnRing)
  );
}

/** Place an archipelago member next to an already-placed group member. */
function placeMemberNear(
  rng: Rng,
  shape: Shape,
  group: readonly Island[],
  islands: readonly Island[],
  radius: number,
  spawnRing: number,
): Island | null {
  for (let a = 0; a < PLACE_ATTEMPTS; a++) {
    const anchor = rng.pick(group);
    const gap = rng.float(CHANNEL_MIN, CHANNEL_MIN * 3);
    const ang = rng.float(0, TAU);
    const d = anchor.r + shape.rLocal + gap;
    const pos = { x: anchor.x + Math.cos(ang) * d, y: anchor.y + Math.sin(ang) * d };
    if (!fitsBoard(pos, shape.rLocal, radius, spawnRing)) continue;
    if (clearsAll(pos, shape.rLocal, islands)) return toWorldIsland(shape, pos);
  }
  return null;
}

// --- The landmass budget ------------------------------------------------------

/** Power-law half-width draw, capped by the remaining coverage headroom. */
function drawHalfWidth(rng: Rng, headroom: number, radius: number): number | null {
  const byHeadroom = Math.sqrt((0.8 * headroom) / Math.PI);
  const cap = Math.min(HW_MAX, byHeadroom, radius * 0.15);
  if (cap < HW_MIN) return null;
  const u = rng.next();
  const hw = HW_MIN * (HW_MAX / HW_MIN) ** (u ** HW_POWER);
  return Math.min(hw, cap);
}

/** Roll + place one archipelago GROUP (2-4 members, drop a member on exhaustion). */
function rollArchipelago(
  rng: Rng,
  hw: number,
  islands: Island[],
  radius: number,
  spawnRing: number,
  capArea: number,
  covered: number,
): number {
  const members = rng.int(2, 4);
  const group: Island[] = [];
  let added = 0;
  for (let i = 0; i < members; i++) {
    const mhw = Math.max(HW_MIN, hw * rng.float(0.35, 0.75));
    const kind = rng.next() < 0.75 ? 'blob' : 'ridge';
    const shape = buildShape(rng, kind === 'ridge' ? Math.max(HW_MIN, mhw * 0.6) : mhw, kind);
    if (!shape || covered + added + shape.area > capArea) continue;
    const isle =
      group.length === 0
        ? placeShape(rng, shape, islands, radius, spawnRing)
        : placeMemberNear(rng, shape, group, islands, radius, spawnRing);
    if (!isle) continue;
    group.push(isle);
    islands.push(isle);
    added += shape.area;
  }
  return added;
}

/** Roll + place one landmass group; returns the shoelace area actually added. */
function rollOneGroup(
  rng: Rng,
  islands: Island[],
  radius: number,
  spawnRing: number,
  capArea: number,
  covered: number,
): number {
  const hw = drawHalfWidth(rng, capArea - covered, radius);
  if (hw === null) return 0;
  const roll = rng.next();
  if (roll >= 0.8) {
    return rollArchipelago(rng, hw, islands, radius, spawnRing, capArea, covered);
  }
  const kind = roll < 0.5 ? 'blob' : 'ridge';
  const shape = buildShape(rng, kind === 'ridge' ? Math.max(HW_MIN, hw * 0.6) : hw, kind);
  if (!shape || covered + shape.area > capArea) return 0;
  const isle = placeShape(rng, shape, islands, radius, spawnRing);
  if (!isle) return 0;
  islands.push(isle);
  return shape.area;
}

/** Place landmasses until realized shoelace cover crosses `targetCover`. */
function rollIslands(rng: Rng, radius: number, spawnRing: number, targetCover: number): Island[] {
  const discArea = Math.PI * radius * radius;
  const target = targetCover * discArea;
  const capArea = COVER_MAX * 0.96 * discArea;
  const islands: Island[] = [];
  let covered = 0;
  let failures = 0;
  while (covered < target && failures < GROUP_FAIL_LIMIT) {
    const added = rollOneGroup(rng, islands, radius, spawnRing, capArea, covered);
    if (added > 0) {
      covered += added;
      failures = 0;
    } else {
      failures++;
    }
  }
  return islands;
}

// --- Navigability validation --------------------------------------------------

interface NavGrid {
  n: number; // cells per side
  cells: Uint8Array; // 0 = outside disc, 1 = land, 2 = water (non-navigable), 3 = navigable
}

/** 1 = land, 2 = water too close to a coast, 3 = navigable water. */
function classifyCell(x: number, y: number, islands: readonly Island[]): 1 | 2 | 3 {
  let tight = false;
  for (const isle of islands) {
    const dx = x - isle.x;
    const dy = y - isle.y;
    const reach = isle.r + NAV_CLEAR;
    if (dx * dx + dy * dy >= reach * reach) continue;
    const p = { x, y };
    if (pointInPolygon(p, isle.poly)) return 1;
    if (closestPointOnPolygon(p, isle.poly).dist < NAV_CLEAR) tight = true;
  }
  return tight ? 2 : 3;
}

function buildNavGrid(islands: readonly Island[], radius: number): NavGrid {
  const n = Math.ceil((radius * 2) / NAV_CELL);
  const cells = new Uint8Array(n * n);
  const r2 = radius * radius;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = -radius + (cx + 0.5) * NAV_CELL;
      const y = -radius + (cy + 0.5) * NAV_CELL;
      if (x * x + y * y > r2) continue;
      cells[cy * n + cx] = classifyCell(x, y, islands);
    }
  }
  return { n, cells };
}

function cellIndexAt(grid: NavGrid, radius: number, x: number, y: number): number {
  const cx = Math.floor((x + radius) / NAV_CELL);
  const cy = Math.floor((y + radius) / NAV_CELL);
  if (cx < 0 || cy < 0 || cx >= grid.n || cy >= grid.n) return -1;
  return cy * grid.n + cx;
}

/** First navigable cell on the spawn ring (64 deterministic probe angles), or -1. */
function spawnRingSeed(grid: NavGrid, radius: number, spawnRing: number): number {
  for (let k = 0; k < 64; k++) {
    const ang = (TAU * k) / 64;
    const idx = cellIndexAt(grid, radius, Math.cos(ang) * spawnRing, Math.sin(ang) * spawnRing);
    if (idx >= 0 && grid.cells[idx] === 3) return idx;
  }
  return -1;
}

/**
 * THE definition of grid adjacency: the four ORTHOGONAL in-bounds neighbours
 * of `idx`. A hull cannot squeeze through a corner touch, so 4-connectivity is
 * the navigable semantics — and BOTH the flood (`floodFromSpawnRing`) and the
 * reachability acceptance (`hasReachedNeighbor`) call this one function, so
 * they can never again disagree about what "adjacent" means.
 */
function orthoNeighbors(n: number, idx: number): number[] {
  const cx = idx % n;
  const out: number[] = [];
  if (idx - n >= 0) out.push(idx - n);
  if (idx + n < n * n) out.push(idx + n);
  if (cx > 0) out.push(idx - 1);
  if (cx < n - 1) out.push(idx + 1);
  return out;
}

/** Flood-fill navigable cells (4-connected) from a cell on the spawn ring. */
function floodFromSpawnRing(grid: NavGrid, radius: number, spawnRing: number): Uint8Array {
  const reached = new Uint8Array(grid.n * grid.n);
  const stack: number[] = [];
  const seed = spawnRingSeed(grid, radius, spawnRing);
  if (seed >= 0) {
    reached[seed] = 1;
    stack.push(seed);
  }
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    for (const nb of orthoNeighbors(grid.n, idx)) {
      if (grid.cells[nb] === 3 && !reached[nb]) {
        reached[nb] = 1;
        stack.push(nb);
      }
    }
  }
  return reached;
}

/**
 * True iff every TIGHT-water cell (2) is 4-connected THROUGH tight water to
 * the reached ocean — i.e. it is shore, a cove, or an inlet continuous with
 * the sea rather than a puddle sealed off from it. Seeded from the reached
 * navigable cells and spread with the same `orthoNeighbors` the flood uses.
 *
 * A one-hop test cannot express this: at 32u cells a perfectly ordinary
 * coastal nook is two or three tight cells deep, and requiring each of them to
 * touch open water directly rejected 81% of otherwise-valid candidate maps
 * (measured over 425 candidates). Transitivity is what makes 4-connectivity
 * affordable here; it does not weaken anything, because the sub-beam-pinch
 * case is caught by the STRICT navigable-cell rule in `navigable` below,
 * before this ever runs.
 */
function shoreConnected(grid: NavGrid, reached: Uint8Array): boolean {
  const open = Uint8Array.from(reached);
  const stack: number[] = [];
  for (let idx = 0; idx < open.length; idx++) if (open[idx] === 1) stack.push(idx);
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    for (const nb of orthoNeighbors(grid.n, idx)) {
      if (grid.cells[nb] === 2 && open[nb] === 0) {
        open[nb] = 1;
        stack.push(nb);
      }
    }
  }
  for (let idx = 0; idx < grid.cells.length; idx++) {
    if (grid.cells[idx] === 2 && open[idx] === 0) return false;
  }
  return true;
}

/**
 * The single navigability check (deterministic — same accept/reject on server
 * and client), in two clauses, both 4-CONNECTED:
 *
 *  1. Every NAVIGABLE cell (3) must be REACHED by the spawn-ring flood. No
 *     leniency at all: an unreached navigable cell is either an enclosed
 *     lagoon or a bay behind a channel too narrow for the widest hull.
 *  2. Every TIGHT-water cell (2) must be shore-connected to that reached
 *     ocean (`shoreConnected`).
 *
 * Clause 1 replaces a one-hop "or adjacent to a reached cell" test that
 * accepted all EIGHT neighbours while the flood spread over only FOUR. A hull
 * cannot squeeze through a corner touch, so that mismatch let a water cell
 * touching the ocean only DIAGONALLY count as reachable, and `validateMap`
 * accepted enclosed pockets and sub-beam diagonal pinches — defeating the
 * ratified no-enclosed-lagoons invariant. Both clauses now spread with the
 * same `orthoNeighbors`, so the flood and the acceptance cannot disagree.
 */
function navigable(islands: readonly Island[], radius: number, spawnRing: number): boolean {
  const grid = buildNavGrid(islands, radius);
  const reached = floodFromSpawnRing(grid, radius, spawnRing);
  for (let idx = 0; idx < grid.cells.length; idx++) {
    if (grid.cells[idx] === 3 && reached[idx] === 0) return false;
  }
  return shoreConnected(grid, reached);
}

/** Shoelace land cover as a fraction of the map disc area. */
export function landCoverage(map: GameMap): number {
  const land = map.islands.reduce((s, isle) => s + Math.abs(polygonArea(isle.poly)), 0);
  return land / (Math.PI * map.radius * map.radius);
}

/**
 * Full acceptance check for a generated map: coverage band + navigability.
 * Exposed for tests; generateMap uses the same pieces internally.
 */
export function validateMap(map: GameMap): boolean {
  const cover = landCoverage(map);
  if (cover < COVER_MIN || cover > COVER_MAX) return false;
  return navigable(map.islands, map.radius, map.spawnRing);
}

// --- The generator ------------------------------------------------------------

/** Per-attempt coverage target: relaxes toward COVER_MIN (never below the band). */
function attemptTarget(attempt: number): number {
  if (attempt < 4) return COVER_TARGET;
  if (attempt < 7) return 0.036;
  return 0.032;
}

/** Attempts from which a candidate may also DROP landmasses to reach validity. */
const DROP_FROM = 4;

/**
 * Thrown when the ladder cannot produce a map satisfying EVERY invariant.
 * Deterministic like the generator itself, so server and client fail
 * identically on the same (seed, playerCap) — never one of them silently
 * sailing a different ocean.
 */
export class MapGenerationError extends Error {
  constructor(
    readonly seed: number,
    readonly playerCap: number,
    readonly attempts: number,
  ) {
    super(
      `generateMap: no map satisfying all invariants for seed=${seed} ` +
        `playerCap=${playerCap} after ${attempts} attempts ` +
        `(coverage band [${COVER_MIN}, ${COVER_MAX}] + navigability + >=1 landmass)`,
    );
    this.name = 'MapGenerationError';
  }
}

/**
 * One candidate map. `drop` relaxes the landmass COUNT (last-placed first)
 * to recover from a single badly-placed mass — but the candidate is then
 * re-checked in FULL: dropping used to return immediately on navigability
 * alone, which could hand back a map below COVER_MIN or with zero landmasses.
 * Every acceptance in this file goes through `validateMap`.
 */
function attemptMap(
  rng: Rng,
  radius: number,
  spawnRing: number,
  target: number,
  drop: boolean,
): GameMap | null {
  const islands = rollIslands(rng, radius, spawnRing, target);
  if (drop) {
    while (islands.length > 0 && !navigable(islands, radius, spawnRing)) islands.pop();
  }
  const map = { radius, spawnRing, islands };
  return islands.length >= 1 && validateMap(map) ? map : null;
}

/**
 * Generate the map for `seed` and `playerCap`. Deterministic: identical
 * (seed, playerCap) always yields a deep-equal map — vertex for vertex — on
 * every platform (one mulberry32 stream, fixed consumption order, no
 * unordered iteration). Rejected candidates reroll from the same stream; late
 * attempts additionally relax the landmass COUNT, never the invariants.
 *
 * The map this returns has passed `validateMap` — coverage band, >=1 landmass,
 * and navigability — with NO exceptions: the single `return` is guarded by it
 * and every other exit throws `MapGenerationError`. Silently widening the band
 * is what the spec's Block-If forbids, and a map that violates the invariants
 * the rest of shared/ assumes is worse than a loud refusal: the throw is
 * deterministic, so a client cannot fail where the server succeeded (they
 * would both refuse the same seed), and a failed join is recoverable where an
 * unnavigable ocean is not. The `never throws in practice` half of the
 * guarantee is a measurement, pinned by the seed-sweep test.
 */
export function generateMap(seed: number, playerCap: number = CONFIG.map.playerCap): GameMap {
  return generateMapBounded(seed, playerCap, MAP_ATTEMPTS);
}

/**
 * `generateMap` with an explicit attempt budget. Exported ONLY so the
 * exhaustion path is directly testable (a real budget can't be starved from
 * outside); production always calls `generateMap`.
 */
export function generateMapBounded(seed: number, playerCap: number, attempts: number): GameMap {
  const radius = mapRadius(playerCap);
  const spawnRing = radius * CONFIG.map.spawnFraction;
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const map = attemptMap(rng, radius, spawnRing, attemptTarget(attempt), attempt >= DROP_FROM);
    if (map) return map;
  }
  throw new MapGenerationError(seed, playerCap, attempts);
}

/** Constants describing island generation constraints (exposed for tests). */
export const MAP_RULES = {
  INNER_FRACTION,
  OUTER_FRACTION,
  SPAWN_MARGIN,
  CHANNEL_MIN,
  COVER_MIN,
  COVER_MAX,
  MAX_CONCAVITY,
  M_MIN,
  M_MAX,
  HW_MIN,
  HW_MAX,
  ROUGHNESS,
  WIDEST_BEAM,
  NAV_CELL,
  NAV_MARGIN,
  NAV_CLEAR,
} as const;
