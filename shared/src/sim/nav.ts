// THE NAVIGATION LAYER (Story 9.13, epic-9 amendment 192, Eric 2026-10-17) —
// pure functions over the generator's RATIFIED 32 u navigability grid. The
// grid construction moved here from map.ts (which now delegates to it), so
// the bots route on the very raster every map is validated against and one
// implementation is pinned by both the map tests and the nav tests.
//
// On top of the grid: a chamfer distance-to-land (the clearance cost), a
// multi-source Dijkstra FLOW FIELD (one "downhill to safety" field per ring,
// O(1) per hull per tick), and a budgeted A* ROUTE with string-pulling for the
// rare per-bot goal whose straight line is blocked.
//
// DETERMINISM: no randomness, no clock, no transcendental (Math.sqrt is
// IEEE-exact and allowed). Every priority queue breaks ties by CELL INDEX, so
// expansion order — and therefore every field and path — is identical on
// every engine. A NavGrid is immutable after build and safe to cache per map.

import { CONFIG } from '../constants.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { closestPointOnPolygon, pointInPolygon } from './silhouette.js';

/** The sqrt(2) double verbatim (a literal, like map.ts — no transcendental). */
const SQRT2 = 1.4142135623730951;

// --- Ratified constants (re-exported by map.ts as MAP_RULES) -----------------

/** Widest hull beam across ship classes AND drones (order-independent max). */
const WIDEST_BEAM = Math.max(
  ...Object.values(CONFIG.shipClasses).map((c) => c.hull.beam),
  ...Object.values(CONFIG.drones).map((d) => d.hull.beam),
);
const NAV_CELL = 32; // u — ratified navigability raster cell size
const NAV_MARGIN = 6; // u — hull half-beam slack in the navigability erosion
/** Erosion radius: a cell is navigable iff its centre clears every polygon by this. */
const NAV_CLEAR = WIDEST_BEAM / 2 + NAV_MARGIN;

/** The generator's ratified navigability constants (map.ts MAP_RULES mirrors them). */
export const NAV_RULES = { WIDEST_BEAM, NAV_CELL, NAV_MARGIN, NAV_CLEAR } as const;

/** Cell classes: 0 = outside the disc, 1 = land, 2 = tight water, 3 = navigable. */
export const NAV_KIND = { OUTSIDE: 0, LAND: 1, TIGHT: 2, WATER: 3 } as const;

/**
 * How far (cells) a point standing on a non-navigable cell (tight water, a
 * beached hull) is snapped to the nearest navigable cell before routing.
 * Algorithmic, not gameplay: a tight cell sits within NAV_CLEAR (< one cell)
 * of a coast, so three cells covers any hull that is touching water.
 */
const SNAP_CELLS = 3;

/** The 32 u navigability raster. Immutable after build; cache per map. */
export interface NavGrid {
  readonly n: number; // cells per side
  readonly cellU: number; // u per cell (NAV_CELL)
  readonly radius: number; // map radius (u); cell (0,0) has its corner at (-radius, -radius)
  readonly cells: Uint8Array; // NAV_KIND per cell, row-major (idx = cy * n + cx)
}

/** What the grid is built from — any map (generated or a test fixture). */
export interface NavSource {
  readonly radius: number;
  readonly islands: readonly Island[];
}

// --- Grid construction (moved verbatim from map.ts) ---------------------------

/** Downgrade the cells inside one island's grown bounding box. */
function downgradeCells(grid: NavGrid, isle: Island): void {
  const { n, cells, radius } = grid;
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
 * affordable. Exported so bots route on the raster the map is validated on.
 */
export function buildNavGrid(map: NavSource): NavGrid {
  const radius = map.radius;
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
  const grid: NavGrid = { n, cellU: NAV_CELL, radius, cells };
  for (const isle of map.islands) downgradeCells(grid, isle);
  return Object.freeze(grid);
}

/**
 * THE definition of grid adjacency for the navigability CHECK: the four
 * ORTHOGONAL in-bounds neighbours. A hull cannot squeeze through a corner
 * touch, so 4-connectivity is the navigable semantics — BOTH the flood and
 * the shore spread use this one function, so they can never disagree about
 * what "adjacent" means. (Routing below is 8-connected with corner cuts
 * forbidden, which connects exactly the same cell sets.)
 */
export function orthoNeighbors(n: number, idx: number): number[] {
  const cx = idx % n;
  const out: number[] = [];
  if (idx - n >= 0) out.push(idx - n);
  if (idx + n < n * n) out.push(idx + n);
  if (cx > 0) out.push(idx - 1);
  if (cx < n - 1) out.push(idx + 1);
  return out;
}

/** Flood-fill cells matching `kind` (4-connected) from the stacked seeds, marking `reached`. */
export function floodCells(grid: NavGrid, reached: Uint8Array, stack: number[], kind: number): void {
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

// --- Cell addressing ---------------------------------------------------------

/** Cell index under a world point, or -1 off the raster. */
export function cellOf(grid: NavGrid, x: number, y: number): number {
  const cx = Math.floor((x + grid.radius) / grid.cellU);
  const cy = Math.floor((y + grid.radius) / grid.cellU);
  if (cx < 0 || cy < 0 || cx >= grid.n || cy >= grid.n) return -1;
  return cy * grid.n + cx;
}

/** World centre of a cell. */
export function pointOf(grid: NavGrid, idx: number): Vec2 {
  const cx = idx % grid.n;
  const cy = (idx - cx) / grid.n;
  return { x: -grid.radius + (cx + 0.5) * grid.cellU, y: -grid.radius + (cy + 0.5) * grid.cellU };
}

/** True when `idx` is a NAVIGABLE cell (kind 3) — the only cells routes use. */
export function isWater(grid: NavGrid, idx: number): boolean {
  return idx >= 0 && idx < grid.cells.length && grid.cells[idx] === NAV_KIND.WATER;
}

function waterAt(grid: NavGrid, cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= grid.n || cy >= grid.n) return false;
  return grid.cells[cy * grid.n + cx] === NAV_KIND.WATER;
}

// --- Distance to land (two-pass 3-4 chamfer) ---------------------------------

function chamferForward(d: Int32Array, m: number): void {
  for (let y = 1; y < m - 1; y++) {
    for (let x = 1; x < m - 1; x++) {
      const i = y * m + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], d[i - 1] + 3, d[i - m] + 3, d[i - m - 1] + 4, d[i - m + 1] + 4);
    }
  }
}

function chamferBackward(d: Int32Array, m: number): void {
  for (let y = m - 2; y >= 1; y--) {
    for (let x = m - 2; x >= 1; x--) {
      const i = y * m + x;
      if (d[i] === 0) continue;
      d[i] = Math.min(d[i], d[i + 1] + 3, d[i + m] + 3, d[i + m + 1] + 4, d[i + m - 1] + 4);
    }
  }
}

/**
 * Clearance in CELLS from each navigable cell to the nearest non-navigable one
 * (land, tight water, outside the disc, or off the raster), by a two-pass 3-4
 * chamfer: 0 on a navigable cell orthogonally next to a non-navigable one,
 * growing by ~1 per cell inward; 0 on every non-navigable cell. A fresh array.
 */
export function distanceToLand(grid: NavGrid): Float32Array {
  const { n, cells } = grid;
  const m = n + 2; // one-cell non-water border so every neighbour is in bounds
  const d = new Int32Array(m * m);
  const far = 3 * m * 4;
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      if (cells[cy * n + cx] === NAV_KIND.WATER) d[(cy + 1) * m + cx + 1] = far;
    }
  }
  chamferForward(d, m);
  chamferBackward(d, m);
  const out = new Float32Array(n * n);
  for (let cy = 0; cy < n; cy++) {
    for (let cx = 0; cx < n; cx++) {
      const v = d[(cy + 1) * m + cx + 1];
      out[cy * n + cx] = v > 0 ? (v - 3) / 3 : 0;
    }
  }
  return out;
}

const dtlCache = new WeakMap<NavGrid, Float32Array>();

/** Cached distanceToLand — internal (the grid is immutable, so the field is too). */
function dtlOf(grid: NavGrid): Float32Array {
  let d = dtlCache.get(grid);
  if (!d) {
    d = distanceToLand(grid);
    dtlCache.set(grid, d);
  }
  return d;
}

// --- 8-connected step graph (corner cuts forbidden) --------------------------

const DX = [1, -1, 0, 0, 1, 1, -1, -1] as const;
const DY = [0, 0, 1, -1, 1, -1, 1, -1] as const;

/**
 * Neighbour index reached by step `k` from (cx, cy), or -1 when the step is
 * illegal: the target must be navigable and, for a diagonal, BOTH orthogonal
 * cells it cuts between must be navigable too (a hull cannot squeeze a corner).
 */
function stepTo(grid: NavGrid, cx: number, cy: number, k: number): number {
  const nx = cx + DX[k];
  const ny = cy + DY[k];
  if (!waterAt(grid, nx, ny)) return -1;
  if (k >= 4 && !(waterAt(grid, nx, cy) && waterAt(grid, cx, ny))) return -1;
  return ny * grid.n + nx;
}

/** Cost of entering `nb` by step `k`: length plus the shore-band clearance penalty. */
function stepCost(dtl: Float32Array, nb: number, k: number, penalty: number): number {
  const len = k < 4 ? 1 : SQRT2;
  const near = 1 - dtl[nb];
  return near > 0 ? len + penalty * near : len;
}

// --- Binary min-heap keyed (cost, then cell index) ---------------------------

class MinHeap {
  private keys = new Float64Array(256);
  private ids = new Int32Array(256);
  size = 0;

  clear(): void {
    this.size = 0;
  }

  private less(i: number, j: number): boolean {
    const a = this.keys[i];
    const b = this.keys[j];
    return a < b || (a === b && this.ids[i] < this.ids[j]);
  }

  private swap(i: number, j: number): void {
    const k = this.keys[i];
    this.keys[i] = this.keys[j];
    this.keys[j] = k;
    const d = this.ids[i];
    this.ids[i] = this.ids[j];
    this.ids[j] = d;
  }

  private grow(): void {
    const keys = new Float64Array(this.keys.length * 2);
    keys.set(this.keys);
    const ids = new Int32Array(this.ids.length * 2);
    ids.set(this.ids);
    this.keys = keys;
    this.ids = ids;
  }

  push(key: number, id: number): void {
    if (this.size === this.keys.length) this.grow();
    let i = this.size++;
    this.keys[i] = key;
    this.ids[i] = id;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Key of the top entry (call only when size > 0). */
  topKey(): number {
    return this.keys[0];
  }

  /** Pop the top entry's id (call only when size > 0). */
  pop(): number {
    const top = this.ids[0];
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size];
      this.ids[0] = this.ids[this.size];
      this.siftDown();
    }
    return top;
  }

  private siftDown(): void {
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < this.size && this.less(l, m)) m = l;
      if (r < this.size && this.less(r, m)) m = r;
      if (m === i) return;
      this.swap(i, m);
      i = m;
    }
  }
}

// --- Flow field (multi-source Dijkstra) --------------------------------------

/** A "downhill to the goal" field over every navigable cell. */
export interface FlowField {
  /** Cost-distance to the nearest goal (cells, clearance penalty included); Infinity where unreachable. */
  readonly dist: Float32Array;
  /** Geometric length (cells) of that cheapest path; Infinity where unreachable. */
  readonly len: Float32Array;
  /** Index of the downhill neighbour; -1 at a goal or where unreachable. */
  readonly next: Int32Array;
}

export interface FlowOptions {
  /** Extra cost on the shore band (defaults to CONFIG.bots.nav.clearancePenalty). */
  clearancePenalty?: number;
}

interface FlowWork {
  grid: NavGrid;
  dtl: Float32Array;
  penalty: number;
  cost: Float64Array;
  len: Float64Array;
  next: Int32Array;
  heap: MinHeap;
}

function relaxFlow(w: FlowWork, cur: number): void {
  const cx = cur % w.grid.n;
  const cy = (cur - cx) / w.grid.n;
  for (let k = 0; k < 8; k++) {
    const nb = stepTo(w.grid, cx, cy, k);
    if (nb < 0) continue;
    const c = w.cost[cur] + stepCost(w.dtl, nb, k, w.penalty);
    if (c < w.cost[nb]) {
      w.cost[nb] = c;
      w.len[nb] = w.len[cur] + (k < 4 ? 1 : SQRT2);
      w.next[nb] = cur;
      w.heap.push(c, nb);
    }
  }
}

/**
 * Multi-source Dijkstra from every navigable goal cell (non-navigable goals
 * are ignored; no goals gives an all-Infinity field). 8-connected, corner
 * cuts forbidden, the shore-band penalty from distanceToLand. Ties break by
 * cell index, so the field is identical on every engine.
 */
export function flowField(grid: NavGrid, goalCells: Iterable<number>, opts: FlowOptions = {}): FlowField {
  const N = grid.n * grid.n;
  const w: FlowWork = {
    grid,
    dtl: dtlOf(grid),
    penalty: opts.clearancePenalty ?? CONFIG.bots.nav.clearancePenalty,
    cost: new Float64Array(N).fill(Infinity),
    len: new Float64Array(N).fill(Infinity),
    next: new Int32Array(N).fill(-1),
    heap: new MinHeap(),
  };
  for (const g of goalCells) {
    if (!isWater(grid, g) || w.cost[g] === 0) continue;
    w.cost[g] = 0;
    w.len[g] = 0;
    w.heap.push(0, g);
  }
  while (w.heap.size > 0) {
    const key = w.heap.topKey();
    const cur = w.heap.pop();
    if (key > w.cost[cur]) continue; // stale entry
    relaxFlow(w, cur);
  }
  return { dist: Float32Array.from(w.cost), len: Float32Array.from(w.len), next: w.next };
}

/** The running answers of one snap: the raw nearest navigable centre and
 *  the nearest one reachable without crossing a LAND cell. */
interface SnapPick {
  best: number;
  bestD: number;
  side: number;
  sideD: number;
}

/**
 * The navigable cell a world point "stands on" for routing: its own cell when
 * navigable, else the nearest navigable cell centre within SNAP_CELLS whose
 * segment from the point crosses no LAND cell (Story 9.13 fix wave P13: a
 * hull on the shore band beside a one-cell spit snaps to ITS side, not the
 * nearer cell over the spit), falling back to the raw nearest; ties by cell
 * index; -1 when none.
 */
export function snapToWater(grid: NavGrid, p: Vec2): number {
  const idx = cellOf(grid, p.x, p.y);
  if (isWater(grid, idx)) return idx;
  const cx = Math.floor((p.x + grid.radius) / grid.cellU);
  const cy = Math.floor((p.y + grid.radius) / grid.cellU);
  const pick: SnapPick = { best: -1, bestD: Infinity, side: -1, sideD: Infinity };
  for (let y = cy - SNAP_CELLS; y <= cy + SNAP_CELLS; y++) {
    for (let x = cx - SNAP_CELLS; x <= cx + SNAP_CELLS; x++) {
      if (waterAt(grid, x, y)) considerSnap(grid, p, y * grid.n + x, pick);
    }
  }
  return pick.side >= 0 ? pick.side : pick.best;
}

function considerSnap(grid: NavGrid, p: Vec2, i: number, pick: SnapPick): void {
  const c = pointOf(grid, i);
  const d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
  if (d < pick.bestD) {
    pick.bestD = d;
    pick.best = i;
  }
  if (d < pick.sideD && !crossesLand(grid, p, c)) {
    pick.sideD = d;
    pick.side = i;
  }
}

/** Does the segment p→c touch a LAND cell beyond p's own cell (sampled at a
 *  quarter cell; the shore band and the map's outside do not count)? */
function crossesLand(grid: NavGrid, p: Vec2, c: Vec2): boolean {
  const start = cellOf(grid, p.x, p.y);
  const len = Math.hypot(c.x - p.x, c.y - p.y);
  const steps = Math.max(1, Math.ceil(len / (grid.cellU / 4)));
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const i = cellOf(grid, p.x + (c.x - p.x) * t, p.y + (c.y - p.y) * t);
    if (i >= 0 && i !== start && grid.cells[i] === NAV_KIND.LAND) return true;
  }
  return false;
}

/** The cell a field lookup at a world point uses, or -1 (off water / unreachable). */
function fieldCell(field: FlowField, grid: NavGrid, x: number, y: number): number {
  const idx = snapToWater(grid, { x, y });
  return idx >= 0 && field.dist[idx] < Infinity ? idx : -1;
}

/**
 * Unit vector from (x, y) toward the next downhill cell centre (toward the
 * snapped cell itself when the point stands off navigable water), or null at a
 * goal, where unreachable, or when the point already sits on that centre.
 */
export function flowDirection(field: FlowField, grid: NavGrid, x: number, y: number): { dx: number; dy: number } | null {
  const idx = fieldCell(field, grid, x, y);
  if (idx < 0) return null;
  const onCell = cellOf(grid, x, y) === idx;
  const target = onCell ? field.next[idx] : idx;
  if (target < 0) return null;
  const c = pointOf(grid, target);
  const dx = c.x - x;
  const dy = c.y - y;
  const m = Math.sqrt(dx * dx + dy * dy);
  return m > 0 ? { dx: dx / m, dy: dy / m } : null;
}

/** Geometric along-water distance (u) from (x, y) to the field's goal; Infinity when unreachable. */
export function geodesicU(field: FlowField, grid: NavGrid, x: number, y: number): number {
  const idx = fieldCell(field, grid, x, y);
  return idx < 0 ? Infinity : field.len[idx] * grid.cellU;
}

/** Every navigable cell whose centre lies inside the disc (cx, cy, r), ascending index. */
export function goalCellsInsideDisc(grid: NavGrid, cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  if (!(r > 0)) return out;
  const lo = Math.max(0, Math.floor((cx - r + grid.radius) / grid.cellU));
  const hi = Math.min(grid.n - 1, Math.floor((cx + r + grid.radius) / grid.cellU));
  const lo2 = Math.max(0, Math.floor((cy - r + grid.radius) / grid.cellU));
  const hi2 = Math.min(grid.n - 1, Math.floor((cy + r + grid.radius) / grid.cellU));
  const r2 = r * r;
  for (let y = lo2; y <= hi2; y++) {
    for (let x = lo; x <= hi; x++) {
      const i = y * grid.n + x;
      if (grid.cells[i] !== NAV_KIND.WATER) continue;
      const c = pointOf(grid, i);
      if ((c.x - cx) * (c.x - cx) + (c.y - cy) * (c.y - cy) < r2) out.push(i);
    }
  }
  return out;
}

// --- Line test (exact grid traversal) ----------------------------------------

interface Axis {
  step: number;
  tDelta: number;
  tMax: number;
}

function axisInit(g0: number, g1: number, c: number): Axis {
  const d = g1 - g0;
  if (d > 0) return { step: 1, tDelta: 1 / d, tMax: (c + 1 - g0) / d };
  if (d < 0) return { step: -1, tDelta: -1 / d, tMax: (g0 - c) / -d };
  return { step: 0, tDelta: Infinity, tMax: Infinity };
}

interface Walk {
  cx: number;
  cy: number;
  ax: Axis;
  ay: Axis;
}

/** Advance the walk one cell boundary; false when it enters a non-navigable cell. */
function walkStep(grid: NavGrid, w: Walk): boolean {
  if (w.ax.tMax < w.ay.tMax) {
    w.cx += w.ax.step;
    w.ax.tMax += w.ax.tDelta;
  } else if (w.ay.tMax < w.ax.tMax) {
    w.cy += w.ay.step;
    w.ay.tMax += w.ay.tDelta;
  } else {
    // exact corner crossing: both cells it touches must be water (no corner squeeze)
    if (!waterAt(grid, w.cx + w.ax.step, w.cy) || !waterAt(grid, w.cx, w.cy + w.ay.step)) return false;
    w.cx += w.ax.step;
    w.cy += w.ay.step;
    w.ax.tMax += w.ax.tDelta;
    w.ay.tMax += w.ay.tDelta;
  }
  return waterAt(grid, w.cx, w.cy);
}

/**
 * True when the segment a→b touches ONLY navigable cells: an exact
 * (supercover-style) traversal of every cell the segment crosses, with a
 * corner crossing requiring both cells it grazes — the same no-corner-squeeze
 * rule the step graph uses, so a string-pulled shortcut is never worse.
 */
export function lineClear(grid: NavGrid, a: Vec2, b: Vec2): boolean {
  const gx0 = (a.x + grid.radius) / grid.cellU;
  const gy0 = (a.y + grid.radius) / grid.cellU;
  const gx1 = (b.x + grid.radius) / grid.cellU;
  const gy1 = (b.y + grid.radius) / grid.cellU;
  const w: Walk = { cx: Math.floor(gx0), cy: Math.floor(gy0), ax: axisInit(gx0, gx1, Math.floor(gx0)), ay: axisInit(gy0, gy1, Math.floor(gy0)) };
  if (!waterAt(grid, w.cx, w.cy)) return false;
  const ex = Math.floor(gx1);
  const ey = Math.floor(gy1);
  const maxSteps = Math.abs(ex - w.cx) + Math.abs(ey - w.cy);
  for (let i = 0; i < maxSteps && (w.cx !== ex || w.cy !== ey); i++) {
    if (!walkStep(grid, w)) return false;
  }
  return true;
}

// --- A* route ----------------------------------------------------------------

export interface RouteOptions {
  /** Max expanded nodes before giving up (defaults to CONFIG.bots.nav.routeBudgetNodes). */
  budgetNodes?: number;
  /** Extra cost on the shore band (defaults to CONFIG.bots.nav.clearancePenalty). */
  clearancePenalty?: number;
}

interface AStarScratch {
  g: Float64Array;
  parent: Int32Array;
  seen: Uint32Array; // stamp: g/parent valid this search
  closed: Uint32Array; // stamp: expanded this search
  gen: number;
  heap: MinHeap;
}

const scratchCache = new WeakMap<NavGrid, AStarScratch>();

function scratchFor(grid: NavGrid): AStarScratch {
  let s = scratchCache.get(grid);
  const N = grid.n * grid.n;
  if (!s) {
    s = { g: new Float64Array(N), parent: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N), gen: 0, heap: new MinHeap() };
    scratchCache.set(grid, s);
  }
  if (s.gen === 0xffffffff) {
    s.seen.fill(0);
    s.closed.fill(0);
    s.gen = 0;
  }
  s.gen++;
  s.heap.clear();
  return s;
}

/** Octile distance (cells) — admissible: every step costs at least its length. */
function octile(n: number, a: number, b: number): number {
  const ax = a % n;
  const bx = b % n;
  const dx = Math.abs(ax - bx);
  const dy = Math.abs((a - ax) / n - (b - bx) / n);
  return dx > dy ? dx - dy + SQRT2 * dy : dy - dx + SQRT2 * dx;
}

interface AStarWork {
  grid: NavGrid;
  dtl: Float32Array;
  penalty: number;
  goal: number;
  s: AStarScratch;
}

function relaxAStar(w: AStarWork, cur: number): void {
  const { grid, s } = w;
  const cx = cur % grid.n;
  const cy = (cur - cx) / grid.n;
  for (let k = 0; k < 8; k++) {
    const nb = stepTo(grid, cx, cy, k);
    if (nb < 0 || s.closed[nb] === s.gen) continue;
    const g = s.g[cur] + stepCost(w.dtl, nb, k, w.penalty);
    if (s.seen[nb] === s.gen && g >= s.g[nb]) continue;
    s.seen[nb] = s.gen;
    s.g[nb] = g;
    s.parent[nb] = cur;
    s.heap.push(g + octile(grid.n, nb, w.goal), nb);
  }
}

/** A* from `start` to `goal`; the cell path (start..goal) or null over budget / unreachable. */
function aStar(w: AStarWork, start: number, budget: number): number[] | null {
  const { s } = w;
  s.seen[start] = s.gen;
  s.g[start] = 0;
  s.parent[start] = -1;
  s.heap.push(octile(w.grid.n, start, w.goal), start);
  let expanded = 0;
  while (s.heap.size > 0) {
    const cur = s.heap.pop();
    if (s.closed[cur] === s.gen) continue;
    if (cur === w.goal) return tracePath(s, cur);
    if (++expanded > budget) return null;
    s.closed[cur] = s.gen;
    relaxAStar(w, cur);
  }
  return null;
}

function tracePath(s: AStarScratch, end: number): number[] {
  const out: number[] = [];
  for (let c = end; c >= 0; c = s.parent[c]) out.push(c);
  return out.reverse();
}

/**
 * String-pull the chain [start, centres of cells[1..k-1], end] into the few
 * waypoints a hull steers between: skip a point whenever the anchor already
 * sees the one after it. Consecutive chain points are always line-clear (the
 * step graph forbids corner cuts), so the pull always progresses.
 */
function stringPull(grid: NavGrid, start: Vec2, cells: readonly number[], end: Vec2): Vec2[] {
  const pts: Vec2[] = [];
  for (let i = 1; i < cells.length - 1; i++) pts.push(pointOf(grid, cells[i]));
  pts.push(end);
  const out: Vec2[] = [];
  let anchor = start;
  for (let i = 0; i < pts.length; i++) {
    if (i + 1 < pts.length && lineClear(grid, anchor, pts[i + 1])) continue;
    out.push(pts[i]);
    anchor = pts[i];
  }
  return out;
}

/** The point a route actually starts/ends at: the given point on navigable water, else the snapped cell centre. */
function anchorPoint(grid: NavGrid, p: Vec2, idx: number): Vec2 {
  return cellOf(grid, p.x, p.y) === idx ? { x: p.x, y: p.y } : pointOf(grid, idx);
}

/**
 * A budgeted A* route over navigable water from `from` to `to`, string-pulled
 * into waypoints (the first leg runs from `from`; the last waypoint is the
 * destination). Off-water endpoints snap to the nearest navigable cell within
 * a few cells (the snapped centre then stands in for that endpoint). Null when
 * either end has no water nearby, the goal is unreachable, or the expansion
 * budget runs out. Deterministic (heap ties by cell index).
 */
export function routeTo(grid: NavGrid, from: Vec2, to: Vec2, opts: RouteOptions = {}): Vec2[] | null {
  const start = snapToWater(grid, from);
  const goal = snapToWater(grid, to);
  if (start < 0 || goal < 0) return null;
  const end = anchorPoint(grid, to, goal);
  if (start === goal) return [end];
  const w: AStarWork = {
    grid,
    dtl: dtlOf(grid),
    penalty: opts.clearancePenalty ?? CONFIG.bots.nav.clearancePenalty,
    goal,
    s: scratchFor(grid),
  };
  const cells = aStar(w, start, opts.budgetNodes ?? CONFIG.bots.nav.routeBudgetNodes);
  if (!cells) return null;
  return stringPull(grid, anchorPoint(grid, from, start), cells, end);
}
