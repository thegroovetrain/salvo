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
// eroded by widest-hull half-beam + margin, flood-filled from the spawn
// ring) proves every water cell reachable — one deterministic check that
// delivers no-lagoons, no-unreachable-pockets, and no-sub-Battleship
// channels at once. Rejected maps reroll from the SAME rng stream; on
// exhaustion the landmass COUNT is relaxed, never the invariants.

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

/** Flood-fill navigable cells (4-connected) from a cell on the spawn ring. */
function floodFromSpawnRing(grid: NavGrid, radius: number, spawnRing: number): Uint8Array {
  const reached = new Uint8Array(grid.n * grid.n);
  const stack: number[] = [];
  const seed = spawnRingSeed(grid, radius, spawnRing);
  if (seed >= 0) {
    reached[seed] = 1;
    stack.push(seed);
  }
  const n = grid.n;
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    const cx = idx % n;
    const neighbors = [idx - n, idx + n];
    if (cx > 0) neighbors.push(idx - 1);
    if (cx < n - 1) neighbors.push(idx + 1);
    for (const nb of neighbors) {
      if (nb >= 0 && nb < n * n && grid.cells[nb] === 3 && !reached[nb]) {
        reached[nb] = 1;
        stack.push(nb);
      }
    }
  }
  return reached;
}

function hasReachedNeighbor(grid: NavGrid, reached: Uint8Array, idx: number): boolean {
  const n = grid.n;
  const cx = idx % n;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (cx + dx < 0 || cx + dx >= n) continue;
      const nb = idx + dy * n + dx;
      if (nb >= 0 && nb < n * n && reached[nb]) return true;
    }
  }
  return false;
}

/**
 * The single navigability check (deterministic — same accept/reject on server
 * and client): every non-land water cell must be reached by the spawn-ring
 * flood or adjacent to a reached navigable cell. Rejects enclosed lagoons,
 * unreachable pockets, and channels narrower than the widest hull + margin.
 */
function navigable(islands: readonly Island[], radius: number, spawnRing: number): boolean {
  const grid = buildNavGrid(islands, radius);
  const reached = floodFromSpawnRing(grid, radius, spawnRing);
  for (let idx = 0; idx < grid.cells.length; idx++) {
    const c = grid.cells[idx];
    if (c !== 2 && c !== 3) continue;
    if (reached[idx]) continue;
    if (!hasReachedNeighbor(grid, reached, idx)) return false;
  }
  return true;
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

/**
 * Generate the map for `seed` and `playerCap`. Deterministic: identical
 * (seed, playerCap) always yields a deep-equal map — vertex for vertex — on
 * every platform (one mulberry32 stream, fixed consumption order, no
 * unordered iteration). Rejected candidates reroll from the same stream; on
 * exhaustion the landmass COUNT is relaxed (islands dropped last-placed
 * first), never the navigability invariant.
 */
export function generateMap(seed: number, playerCap: number = CONFIG.map.playerCap): GameMap {
  const radius = mapRadius(playerCap);
  const spawnRing = radius * CONFIG.map.spawnFraction;
  const rng = mulberry32(seed);
  for (let attempt = 0; attempt < MAP_ATTEMPTS; attempt++) {
    const islands = rollIslands(rng, radius, spawnRing, attemptTarget(attempt));
    const map = { radius, spawnRing, islands };
    if (islands.length >= 1 && validateMap(map)) return map;
  }
  // Exhaustion: relax landmass COUNT, never the invariants — drop landmasses
  // (last-placed first) until the remainder is navigable.
  const islands = rollIslands(rng, radius, spawnRing, 0.032);
  while (islands.length > 0 && !navigable(islands, radius, spawnRing)) islands.pop();
  return { radius, spawnRing, islands };
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
