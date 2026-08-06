// Deterministic HEIGHT-FIELD map generation (cycle 59, Eric ruling 2026-08-06)
// — the ORCHESTRATOR: sea level, coverage control, lagoon closure, extraction,
// navigability repair, contours, and the retained height raster. The field
// itself lives in sim/heightField.ts (+ sim/noise.ts); the mask/trace/closure
// machinery in sim/islandShape.ts. This replaces the cycle-51 capsule
// generator's budget/placement/reroll loop wholesale.
//
// From a seed + player cap, produces the map radius, a spawn ring, polygon
// coastline landmasses (Island — with pole of inaccessibility, pole-centred
// core, and render-only elevation contours), and the quantized height raster
// plus max-height pyramid (the future radar-shadow substrate — Eric ruling
// 2026-08-06: raster + pyramid, never contour polygons, is the elevation
// authority). The client regenerates the identical map from `mapSeed`, so
// none of it travels on the wire.
//
// Pipeline: field -> sea level by histogram RANK SELECTION (coverage on
// target by construction — no reroll loop) -> lagoon closure (fill water no
// hull can reach) -> marching squares -> per-island vertex budget
// (Visvalingam-Whyatt, perimeter-proportional) -> pole/core -> the RATIFIED
// 32u navigability check, REPAIRED (offending cells sealed with smooth land
// domes) rather than rerolled -> contours -> height raster. The raster is
// built LAST, after sea level is chosen and after every repair, so it agrees
// with the shipped coastline byte for byte.
//
// DETERMINISM IS ABSOLUTE: no unseeded randomness, no clock, and no
// transcendental on the generation path (Math.sqrt is IEEE-exact and allowed;
// PI below is the pi double inlined as a literal so the source-scanning guard
// in map.test.ts stays uniform with noise.ts/heightField.ts). Identical
// (seed, playerCap) yields a deep-equal map — vertex, pole, contour and
// height cell — on every engine.

import { CONFIG, mapRadius } from '../constants.js';
import type { Vec2 } from '../math/vec.js';
import type { Contour, Island } from '../types.js';
import {
  buildField,
  buildHeightRaster,
  TERRAIN_PARAMS,
  type HeightField,
  type HeightRaster,
} from './heightField.js';
import {
  buildMask,
  closeUnreachableWater,
  forceLandDisc,
  makeGrid,
  poleOfInaccessibility,
  ringProbes,
  traceLoops,
  type ExtractionGrid,
} from './islandShape.js';
import {
  closestPointOnPolygon,
  pointInPolygon,
  polygonArea,
  polygonIsSimple,
  simplifyLoop,
} from './silhouette.js';

const P = TERRAIN_PARAMS;

/** The pi double verbatim — a literal, so the source guard stays uniform. */
const PI = 3.141592653589793;
/** The sqrt(2) double verbatim — same rule. */
const SQRT2 = 1.4142135623730951;

// --- Ratified constants (MAP_RULES) -----------------------------------------

/** Widest hull beam across ship classes AND drones (order-independent max). */
const WIDEST_BEAM = Math.max(
  ...Object.values(CONFIG.shipClasses).map((c) => c.hull.beam),
  ...Object.values(CONFIG.drones).map((d) => d.hull.beam),
);

const NAV_CELL = 32; // u — ratified navigability raster cell size
const NAV_MARGIN = 6; // u — hull half-beam slack in the navigability erosion
/** Erosion radius: a cell is navigable iff its centre clears every polygon by this. */
const NAV_CLEAR = WIDEST_BEAM / 2 + NAV_MARGIN;
const SPAWN_MARGIN = P.spawnMargin; // u — min coastline clearance from the spawn ring

/**
 * Minimum local coastline feature size (u): the marching-squares corner clamp
 * (t in [0.25, 0.75]) bounds any two crossings on edges meeting at a grid
 * corner to at least 0.25·√2·cell apart (~4.9u at cell 14) — what makes
 * nearest-boundary push-out safe against needle features.
 */
const MIN_FEATURE = 0.25 * SQRT2 * P.cell;

/** A generated map: radius, spawn ring, islands, and the retained elevation. */
export interface GameMap {
  radius: number; // u
  spawnRing: number; // u — radius of the ship spawn ring
  islands: Island[];
  /**
   * The RETAINED quantized height raster + max-height pyramid (cycle 59, Eric
   * ruling 2026-08-06): the substrate a future cycle raymarches for radar
   * shadows. Built AFTER sea level and every navigability repair, so it
   * agrees with the shipped coastline. Rebuilt from the seed on both sides;
   * never on the wire. Nothing reads it yet.
   */
  heightRaster: HeightRaster;
}

/** The subset of GameMap the validators need (fixture maps skip the raster). */
export type MapShape = Pick<GameMap, 'radius' | 'spawnRing' | 'islands'>;

// --- Sea level ---------------------------------------------------------------

/**
 * Select the field level that puts `cover` of the disc above it, by histogram
 * RANK SELECTION over the in-disc samples. This is the whole coverage control
 * system: two linear passes, no reroll loop, on target by construction. The
 * retired generator instead placed landmasses until a running area budget was
 * met and threw the whole map away when it missed the band.
 */
function levelForCover(g: ExtractionGrid, cover: number, bins = 4096): number {
  const v = g.field.v;
  const list = g.idxList;
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < list.length; k++) {
    const val = v[list[k]];
    if (val < min) min = val;
    if (val > max) max = val;
  }
  const hist = new Int32Array(bins);
  const scale = (bins - 1) / (max - min);
  for (let k = 0; k < list.length; k++) hist[((v[list[k]] - min) * scale) | 0]++;
  const want = Math.round(cover * list.length);
  let acc = 0;
  for (let b = bins - 1; b >= 0; b--) {
    acc += hist[b];
    if (acc >= want) return min + b / scale;
  }
  return min;
}

/** Highest field value inside the disc (out-of-disc cells sit deep negative). */
function fieldMax(g: ExtractionGrid): number {
  const v = g.field.v;
  let max = -Infinity;
  for (let k = 0; k < g.idxList.length; k++) {
    const val = v[g.idxList[k]];
    if (val > max) max = val;
  }
  return max;
}

// --- Island extraction --------------------------------------------------------

/** Perimeter of a closed loop (u). */
function loopPerimeter(loop: readonly Vec2[]): number {
  let per = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const dx = loop[i].x - loop[j].x;
    const dy = loop[i].y - loop[j].y;
    per += Math.sqrt(dx * dx + dy * dy);
  }
  return per;
}

/**
 * The vertex budget is proportional to PERIMETER at a fixed target vertex
 * SPACING, clamped to [minVerts, hardCap]: LOS, collision and the client's
 * radar bake all pay for every vertex on the board, and a 60u rock does not
 * need what a 700u landmass needs.
 */
function vertCapFor(loop: readonly Vec2[], hardCap: number, minVerts: number): number {
  const cap = Math.round(loopPerimeter(loop) / P.vertSpacing);
  return Math.max(minVerts, Math.min(hardCap, cap));
}

/**
 * Simplify a raw coastline loop to its vertex budget. simplifyLoop's
 * self-intersection guard keeps a simple input simple, so the explicit check
 * is a belt-and-braces drop, not a retry loop.
 */
function simplifyIsland(loop: readonly Vec2[]): Vec2[] | null {
  const s = simplifyLoop(loop, vertCapFor(loop, P.vertHardCap, P.minVerts));
  if (s.length < 4 || !polygonIsSimple(s)) return null;
  return polygonArea(s) < 0 ? s.reverse() : s;
}

/**
 * Assemble an Island from a WORLD-SPACE CCW polygon: bounding circle about
 * the vertex centroid, pole of inaccessibility, pole-centred core. Contours
 * are attached by the generator afterwards ([] here). Exported for consumer
 * test fixtures — the cycle-51 skeleton parameter is retired.
 */
export function islandFromPolygon(poly: readonly Vec2[]): Island {
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  cx /= poly.length;
  cy /= poly.length;
  let r = 0;
  for (const p of poly) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > r) r = d;
  }
  const pole = poleOfInaccessibility(poly);
  return {
    x: cx,
    y: cy,
    r,
    poly: poly.map((p) => ({ x: p.x, y: p.y })),
    pole: { x: pole.x, y: pole.y },
    core: pole.r,
    contours: [],
  };
}

/** One extraction pass: mask -> closure -> trace -> simplify -> Island[]. */
function extractIslands(g: ExtractionGrid, level: number, spawnRing: number): Island[] {
  buildMask(g, level);
  closeUnreachableWater(g, spawnRing, P.navClear);
  const islands: Island[] = [];
  for (const loop of traceLoops(g, level)) {
    const a = polygonArea(loop);
    if (a <= 0 || a < P.minIslandArea) continue; // holes and sub-rock specks
    const s = simplifyIsland(loop);
    if (!s || polygonArea(s) < P.minIslandArea) continue;
    islands.push(islandFromPolygon(s));
  }
  return islands;
}

/** Total shoelace land area of a set of islands (u²). */
function totalLandArea(islands: readonly Island[]): number {
  let area = 0;
  for (const isle of islands) {
    const a = polygonArea(isle.poly);
    area += a < 0 ? -a : a;
  }
  return area;
}

/**
 * Re-pick sea level from the SAME field (no re-noise, no reroll) until the
 * realized polygon coverage lands in [coverMin, coverMax] — up to two extra
 * passes; the histogram target is already on the money almost always.
 */
function retargetCover(
  g: ExtractionGrid,
  spawnRing: number,
  level0: number,
  islands0: Island[],
): { level: number; islands: Island[] } {
  const discArea = PI * g.radius * g.radius;
  let level = level0;
  let islands = islands0;
  let cover = P.coverTarget;
  for (let pass = 0; pass < 2; pass++) {
    const realized = totalLandArea(islands) / discArea;
    if (realized >= P.coverMin && realized <= P.coverMax) break;
    cover *= realized > 0 ? Math.min(1.6, Math.max(0.6, P.coverTarget / realized)) : 1.4;
    level = levelForCover(g, cover);
    islands = extractIslands(g, level, spawnRing);
  }
  return { level, islands };
}

// --- The RATIFIED navigability check (32u lattice, 4-connected) ---------------

interface NavGrid {
  n: number; // cells per side
  cells: Uint8Array; // 0 = outside disc, 1 = land, 2 = tight water, 3 = navigable
}

/** Downgrade the cells inside one island's grown bounding box. */
function downgradeCells(grid: NavGrid, isle: Island, radius: number): void {
  const { n, cells } = grid;
  const reach = isle.r + NAV_CLEAR;
  const lo = Math.max(0, Math.floor((isle.x - reach + radius) / NAV_CELL));
  const hi = Math.min(n - 1, Math.ceil((isle.x + reach + radius) / NAV_CELL));
  const lo2 = Math.max(0, Math.floor((isle.y - reach + radius) / NAV_CELL));
  const hi2 = Math.min(n - 1, Math.ceil((isle.y + reach + radius) / NAV_CELL));
  const reach2 = reach * reach;
  for (let cy = lo2; cy <= hi2; cy++) {
    const y = -radius + (cy + 0.5) * NAV_CELL;
    for (let cx = lo; cx <= hi; cx++) {
      const idx = cy * n + cx;
      if (cells[idx] === 0 || cells[idx] === 1) continue;
      const x = -radius + (cx + 0.5) * NAV_CELL;
      const dx = x - isle.x;
      const dy = y - isle.y;
      if (dx * dx + dy * dy >= reach2) continue;
      const p = { x, y };
      if (pointInPolygon(p, isle.poly)) cells[idx] = 1;
      else if (closestPointOnPolygon(p, isle.poly).dist < NAV_CLEAR) cells[idx] = 2;
    }
  }
}

/**
 * Same classification as the retired generator's `classifyCell`, with the
 * loop INVERTED: start every in-disc cell at 3 (navigable) and let each
 * island downgrade only the cells inside its own bounding box, grown by
 * NAV_CLEAR. Identical output, measured ~7x faster in the prototype — which
 * is what makes running the check INSIDE the generator (and repairing)
 * affordable.
 */
function buildNavGrid(islands: readonly Island[], radius: number): NavGrid {
  const n = Math.ceil((radius * 2) / NAV_CELL);
  const cells = new Uint8Array(n * n);
  const r2 = radius * radius;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const x = -radius + (cx + 0.5) * NAV_CELL;
      const y = -radius + (cy + 0.5) * NAV_CELL;
      if (x * x + y * y <= r2) cells[cy * n + cx] = 3;
    }
  }
  const grid = { n, cells };
  for (const isle of islands) downgradeCells(grid, isle, radius);
  return grid;
}

/**
 * THE definition of grid adjacency: the four ORTHOGONAL in-bounds neighbours.
 * A hull cannot squeeze through a corner touch, so 4-connectivity is the
 * navigable semantics — BOTH the flood and the shore spread use this one
 * function, so they can never disagree about what "adjacent" means.
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

/** First navigable cell under the deterministic spawn-ring probes, or -1. */
function spawnRingSeed(grid: NavGrid, radius: number, spawnRing: number): number {
  for (const p of ringProbes(spawnRing, 128)) {
    const cx = Math.floor((p.x + radius) / NAV_CELL);
    const cy = Math.floor((p.y + radius) / NAV_CELL);
    if (cx < 0 || cy < 0 || cx >= grid.n || cy >= grid.n) continue;
    const idx = cy * grid.n + cx;
    if (grid.cells[idx] === 3) return idx;
  }
  return -1;
}

/** Flood-fill cells matching `kind` (4-connected) from the stacked seeds. */
function floodCells(grid: NavGrid, reached: Uint8Array, stack: number[], kind: number): void {
  while (stack.length > 0) {
    const idx = stack.pop() as number;
    for (const nb of orthoNeighbors(grid.n, idx)) {
      if (grid.cells[nb] === kind && !reached[nb]) {
        reached[nb] = 1;
        stack.push(nb);
      }
    }
  }
}

/** World centre of a nav cell. */
function cellCentre(grid: NavGrid, radius: number, idx: number): Vec2 {
  const cx = idx % grid.n;
  const cy = (idx - cx) / grid.n;
  return { x: -radius + (cx + 0.5) * NAV_CELL, y: -radius + (cy + 0.5) * NAV_CELL };
}

/**
 * The single navigability check (deterministic — same accept/reject on server
 * and client), in two clauses, both 4-CONNECTED via `orthoNeighbors`:
 *
 *  1. Every NAVIGABLE cell (3) must be REACHED by the spawn-ring flood — an
 *     unreached navigable cell is an enclosed lagoon or a bay behind a
 *     channel too narrow for the widest hull.
 *  2. Every TIGHT-water cell (2) must be shore-connected to that reached
 *     ocean (transitively through tight water — a coastal nook several cells
 *     deep is continuous with the sea, not a sealed puddle).
 *
 * Returns the offending cells' WORLD positions — what the generator's repair
 * loop seals with land domes.
 */
function navigableCheck(
  islands: readonly Island[],
  radius: number,
  spawnRing: number,
): { ok: boolean; offenders: Vec2[] } {
  const grid = buildNavGrid(islands, radius);
  const reached = new Uint8Array(grid.n * grid.n);
  const seed = spawnRingSeed(grid, radius, spawnRing);
  if (seed >= 0) {
    reached[seed] = 1;
    floodCells(grid, reached, [seed], 3);
  }
  const offenders: Vec2[] = [];
  for (let idx = 0; idx < grid.cells.length; idx++) {
    if (grid.cells[idx] === 3 && reached[idx] === 0) {
      offenders.push(cellCentre(grid, radius, idx));
    }
  }
  const shore = Uint8Array.from(reached);
  const seeds: number[] = [];
  for (let idx = 0; idx < shore.length; idx++) if (shore[idx] === 1) seeds.push(idx);
  floodCells(grid, shore, seeds, 2);
  for (let idx = 0; idx < grid.cells.length; idx++) {
    if (grid.cells[idx] === 2 && shore[idx] === 0) offenders.push(cellCentre(grid, radius, idx));
  }
  return { ok: offenders.length === 0, offenders };
}

/**
 * ENFORCE the ratified acceptance test, don't just hope to pass it. The 14u
 * closure already guarantees every water body is hull-reachable at ITS
 * resolution, but the ratified check reasons on a 32u lattice with a
 * 4-connected flood, and a cove throat can be threadable at 14u while having
 * no orthogonally adjacent chain of 32u navigable cell centres. That is a
 * false positive of the test rather than a real enclosed lagoon — but the
 * test is the ratified invariant, so the generator satisfies it by sealing
 * the offending cells and re-extracting, instead of rerolling the whole map.
 * Land only ever grows, so the loop is monotone and terminates.
 */
function repairNavigability(
  g: ExtractionGrid,
  level: number,
  spawnRing: number,
  islands0: Island[],
): Island[] {
  let islands = islands0;
  for (let attempt = 0; attempt < P.navRepairAttempts; attempt++) {
    const nv = navigableCheck(islands, g.radius, spawnRing);
    if (nv.ok) break;
    for (const o of nv.offenders) forceLandDisc(g, o.x, o.y, P.navRepairRadius, level);
    islands = extractIslands(g, level, spawnRing);
  }
  return islands;
}

// --- Contours (render-only elevation bands) -----------------------------------

/** Simplify a contour loop to its perimeter-proportional budget. */
function simplifyContour(loop: readonly Vec2[]): Vec2[] | null {
  const s = simplifyLoop(loop, vertCapFor(loop, P.contourMaxVerts, 5));
  if (s.length < 3 || !polygonIsSimple(s)) return null;
  return polygonArea(s) < 0 ? s.reverse() : s;
}

/** True iff every vertex of `loop` lies inside `poly`. */
function loopInside(loop: readonly Vec2[], poly: readonly Vec2[]): boolean {
  for (const p of loop) {
    if (!pointInPolygon(p, poly)) return false;
  }
  return true;
}

/** The island whose coastline strictly contains `loop`, or null. */
function findParentIsland(islands: readonly Island[], loop: readonly Vec2[]): Island | null {
  const p0 = loop[0];
  for (const isle of islands) {
    const dx = p0.x - isle.x;
    const dy = p0.y - isle.y;
    if (dx * dx + dy * dy > isle.r * isle.r) continue; // broadphase
    if (loopInside(loop, isle.poly)) return isle;
  }
  return null;
}

/** True iff `loop` sits wholly inside ONE poly of the island's level-k band. */
function insideParentBand(isle: Island, level: number, loop: readonly Vec2[]): boolean {
  const parent = isle.contours.find((c) => c.level === level);
  if (!parent) return false;
  return parent.polys.some((poly) => loopInside(loop, poly));
}

/** The island's contour entry for `level`, created on first use. */
function contourEntry(isle: Island, level: number): Contour {
  let entry = isle.contours.find((c) => c.level === level);
  if (!entry) {
    entry = { level, polys: [] };
    isle.contours.push(entry);
  }
  return entry;
}

/** Place one simplified contour loop on its parent island, or drop it. */
function attachLoop(islands: readonly Island[], level: number, loop: readonly Vec2[]): void {
  const a = polygonArea(loop);
  if (a <= 0 || a < P.contourMinArea) return; // holes (craters) and specks dropped
  const s = simplifyContour(loop);
  if (!s) return;
  const isle = findParentIsland(islands, s);
  if (!isle) return; // strict containment is the invariant; orphans are dropped
  if (level > 1 && !insideParentBand(isle, level - 1, s)) return;
  contourEntry(isle, level).polys.push(s);
}

/**
 * Isolines above sea level, from THE SAME field the coastline was cut from —
 * up to `contourLevels` bands (3 => 4 visual bands with the base coastline,
 * the ratified cap). A band may split into multiple peak polys (desired).
 * RENDER-ONLY: contours are never collided and never LOS-tested; the height
 * raster is the elevation authority.
 *
 * Both sides build them (deliberately — see generateMap: the refinement band
 * and therefore the raster bytes depend on the contour levels, and the map
 * must be deep-equal on server and client).
 */
function attachContours(g: ExtractionGrid, seaLevel: number, islands: readonly Island[]): void {
  const span = fieldMax(g) - seaLevel;
  for (let k = 1; k <= P.contourLevels; k++) {
    const lvl = seaLevel + span * P.contourStep * k;
    buildMask(g, lvl);
    for (const loop of traceLoops(g, lvl)) attachLoop(islands, k, loop);
  }
}

// --- Coverage + validation ----------------------------------------------------

/** Shoelace land cover as a fraction of the map disc area. */
export function landCoverage(map: MapShape): number {
  return totalLandArea(map.islands) / (PI * map.radius * map.radius);
}

/**
 * Full acceptance check for a generated map: coverage band + the ratified
 * navigability invariant. Exposed for tests; generateMap enforces the same
 * pieces internally (by construction + repair rather than reroll).
 */
export function validateMap(map: MapShape): boolean {
  const cover = landCoverage(map);
  if (cover < P.coverMin || cover > P.coverMax) return false;
  return navigableCheck(map.islands, map.radius, map.spawnRing).ok;
}

/**
 * Thrown when generation cannot satisfy EVERY invariant (coverage band,
 * >=1 landmass, navigability after repair). Deterministic like the generator
 * itself, so server and client fail identically on the same (seed, playerCap)
 * — never one of them silently sailing a different ocean. Measured never to
 * fire across the test sweeps; the throw is the guarantee's teeth.
 */
export class MapGenerationError extends Error {
  constructor(
    readonly seed: number,
    readonly playerCap: number,
    readonly attempts: number,
  ) {
    super(
      `generateMap: no map satisfying all invariants for seed=${seed} ` +
        `playerCap=${playerCap} after ${attempts} repair attempts ` +
        `(coverage band [${P.coverMin}, ${P.coverMax}] + navigability + >=1 landmass)`,
    );
    this.name = 'MapGenerationError';
  }
}

// --- The generator ------------------------------------------------------------

/** Throw (deterministically) unless every invariant holds on the final map. */
function assertValid(seed: number, playerCap: number, map: MapShape): void {
  if (map.islands.length >= 1 && validateMap(map)) return;
  throw new MapGenerationError(seed, playerCap, P.navRepairAttempts);
}

/**
 * Generate the map for `seed` and `playerCap`. Deterministic: identical
 * (seed, playerCap) always yields a deep-equal map — vertex, pole, contour
 * and height cell — on every platform (integer-hashed noise, fixed pass
 * order, no transcendentals, no unordered iteration).
 *
 * Contours are ALWAYS built, on the server too: the field's refinement band
 * includes the contour isolines, so skipping them would change which cells
 * hold true samples and the height raster — the future radar-shadow authority
 * — would differ between the two sides. (~5ms of the budget; the deep-equal
 * guarantee is worth more.)
 */
export function generateMap(seed: number, playerCap: number = CONFIG.map.playerCap): GameMap {
  const radius = mapRadius(playerCap);
  const spawnRing = radius * CONFIG.map.spawnFraction;
  const field: HeightField = buildField(seed, radius, spawnRing, P);
  const g = makeGrid(field, radius);
  g.navPad = P.navPadCells;

  let level = levelForCover(g, P.coverTarget);
  let islands = extractIslands(g, level, spawnRing);
  ({ level, islands } = retargetCover(g, spawnRing, level, islands));
  islands = repairNavigability(g, level, spawnRing, islands);
  assertValid(seed, playerCap, { radius, spawnRing, islands });

  islands.sort((a, b) => a.x - b.x || a.y - b.y);
  attachContours(g, level, islands);
  // LAST: quantize the (possibly repaired) field, so raster == shipped coast.
  return { radius, spawnRing, islands, heightRaster: buildHeightRaster(field, level) };
}

/** Constants describing island generation constraints (exposed for tests). */
export const MAP_RULES = {
  COVER_MIN: P.coverMin,
  COVER_MAX: P.coverMax,
  SPAWN_MARGIN,
  WIDEST_BEAM,
  NAV_CELL,
  NAV_MARGIN,
  NAV_CLEAR,
  MIN_FEATURE,
  MIN_ISLAND_AREA: P.minIslandArea,
  VERT_HARD_CAP: P.vertHardCap,
  CONTOUR_LEVELS: P.contourLevels,
} as const;
