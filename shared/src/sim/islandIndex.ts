// The island BROADPHASE INDEX (Story 11.2 follow-up) — a static spatial index
// over one map's islands, so a long ray or a short shell step asks only the
// islands it can touch instead of all of them.
//
// WHY: at Story 11.2's reaches an eye ray is up to ~8,000 u long on a board of
// ~130 islands, and every sight gate of every observer asks "does any island
// block this segment?" for every hull and every shell in reach, every tick.
// The reference (`islandBlocksSegment` per island) is exact but pays one
// bounding-circle test per island and a full edge scan per circle the ray
// clips.
//
// EXACTNESS IS THE CONTRACT. Line of sight is the anti-cheat chokepoint: an
// answer that over-blocks hides a contact the observer has earned, one that
// under-blocks leaks a contact behind land. Everything here only SKIPS work
// whose answer is already decided, and every deciding test is the reference's
// own primitive:
//   - the grid is a superset filter: an island is filed under every cell
//     that, grown by GRID_PAD, may hold some of its LAND (`landMayTouchCell`),
//     and the walk visits the cells the segment crosses (a monotone staircase
//     from the cell of `a` to the cell of `b`). Float error can move that
//     staircase by a sliver at a cell corner — many orders below GRID_PAD —
//     so every island whose land the segment meets (its coastline within EPS,
//     its core disc, or the segment's own start) is in some visited cell; an
//     island met by none of them is "clear" in the reference too;
//   - each candidate then takes the reference's own `segCircleHit` broadphase
//     and `core` early-out, and the exact edge test through
//     `segPolygonBlocked` (silhouette.ts: the reference's edge test behind
//     per-chunk boxes that only skip edges provably out of reach);
//   - a segment with an end outside the grid (or non-finite) takes the
//     reference loop.
// `islandIndex.test.ts` holds both queries equal to the reference on
// generated maps.
//
// The index is DERIVED state: build it from an island list and rebuild it
// when the list changes (`isCurrent`). It never travels anywhere.

import { segCircleHit } from '../math/geom.js';
import type { Vec2 } from '../math/vec.js';
import type { Island } from '../types.js';
import { islandBlocksSegment, islandSegHit } from './island.js';
import { boxMayTouch, buildPolyChunks, pointInPolygon, pointMayBeInside, segPolygonEdgeBlocked, type PolyChunks } from './silhouette.js';

/** Grid cell size (u): a few cells per large island, a few tens along the longest eye ray. */
const GRID_CELL_U = 250;

/** Slack (u) each cell is grown by when the islands are filed into it — see the header. */
const GRID_PAD = 1;

/** The grid never exceeds this many cells a side (a degenerate island list cannot allocate the heap). */
const GRID_MAX_SIDE = 512;

/** Bearing sectors a `LosHints` memory is cut into (a diamond-angle fan about the eye). */
const HINT_SECTORS = 32;

/** Blockers remembered per sector (most recent first). */
const HINT_SLOTS = 2;

/**
 * A caller-owned memory of the islands that most recently BLOCKED its rays,
 * by bearing sector from the eye (`HINT_SLOTS` island positions per sector,
 * most recent first; -1 = empty). Rays from one eye toward one side are
 * blocked by the same nearby island over and over — so `losClear` asks that
 * sector's remembered islands first, with the same exact per-island test,
 * and a blocked ray usually ends there without walking the grid. Purely an
 * ORDER of asking: any island that blocks makes the answer "blocked",
 * whichever is asked first. Keep one per observer (`newLosHints`).
 */
export type LosHints = Int32Array;

/** An empty hint memory. */
export function newLosHints(): LosHints {
  return new Int32Array(HINT_SECTORS * HINT_SLOTS).fill(-1);
}

/** The hint sector of direction (dx, dy): its diamond angle (no trig) cut
 *  into HINT_SECTORS; 0 for a zero or non-finite direction. */
function hintSector(dx: number, dy: number): number {
  const sum = Math.abs(dx) + Math.abs(dy);
  if (!(sum > 0) || !Number.isFinite(sum)) return 0;
  const p = dy / sum;
  const quarter = dx >= 0 ? (dy >= 0 ? p : 4 + p) : 2 - p; // [0, 4)
  return Math.min(HINT_SECTORS - 1, Math.floor(quarter * (HINT_SECTORS / 4)));
}

/** Put island `i` at the front of sector `sector`'s slots. */
function remember(hints: LosHints, sector: number, i: number): void {
  const base = sector * HINT_SLOTS;
  if (hints[base] === i) return;
  for (let k = HINT_SLOTS - 1; k > 0; k--) hints[base + k] = hints[base + k - 1];
  hints[base] = i;
}

/** One axis of the cell walk (Amanatides–Woo): the step, the parametric cell width and the next crossing. */
interface WalkAxis {
  step: number;
  tDelta: number;
  tMax: number;
  left: number;
}

function walkAxis(origin: number, cell: number, from: number, to: number, a: number, d: number): WalkAxis {
  const left = Math.abs(to - from);
  if (d === 0 || left === 0) return { step: 0, tDelta: Infinity, tMax: Infinity, left: 0 };
  const step = d > 0 ? 1 : -1;
  const edge = origin + (from + (step > 0 ? 1 : 0)) * cell;
  return { step, tDelta: cell / Math.abs(d), tMax: (edge - a) / d, left };
}

/**
 * A static spatial index over one island list. `narrowTests` counts the
 * candidates that passed their bounding circle and went on to the core /
 * edge test (the work accounting a guard test bounds — never a gameplay
 * input).
 */
export class IslandIndex {
  /** Islands that reached the core / edge test since construction. */
  narrowTests = 0;

  private readonly islands: readonly Island[];
  private readonly snapshot: readonly Island[];
  private readonly polys: readonly (readonly Vec2[])[];
  private readonly chunks: readonly PolyChunks[];
  private readonly ox: number;
  private readonly oy: number;
  private readonly side: number;
  private readonly cellStart: Uint32Array;
  private readonly cellItems: Uint32Array;
  private readonly stamp: Uint32Array;
  private readonly found: Uint32Array;
  private query = 0;
  // "Is the ray's ORIGIN inside island i?" — one ray-cast per (origin, island),
  // remembered while the origin stays put (an observer's rays share it).
  private originX = NaN;
  private originY = NaN;
  private originStamp = 0;
  private readonly insideStamp: Uint32Array;
  private readonly insideIs: Uint8Array;

  constructor(islands: readonly Island[]) {
    this.islands = islands;
    this.snapshot = [...islands];
    this.polys = islands.map((isle) => isle.poly);
    this.chunks = islands.map((isle) => buildPolyChunks(isle.poly));
    this.stamp = new Uint32Array(islands.length);
    this.found = new Uint32Array(islands.length);
    this.insideStamp = new Uint32Array(islands.length);
    this.insideIs = new Uint8Array(islands.length);
    const ext = gridExtent(islands);
    this.ox = ext.ox;
    this.oy = ext.oy;
    this.side = ext.side;
    const filed = fileIslands(islands, ext);
    this.cellStart = filed.cellStart;
    this.cellItems = filed.cellItems;
  }

  /**
   * Is this index still the index of `islands`? Same array, same islands in
   * the same order, each with the polygon it was built from. Cheap enough to
   * ask once per pass (never per ray). Tests rewrite `map.islands` in place;
   * a production map never changes. (An island whose FIELDS are rewritten in
   * place is not detected — replace the island object instead.)
   */
  isCurrent(islands: readonly Island[]): boolean {
    if (islands !== this.islands || islands.length !== this.snapshot.length) return false;
    for (let i = 0; i < islands.length; i++) {
      if (islands[i] !== this.snapshot[i] || islands[i].poly !== this.polys[i]) return false;
    }
    return true;
  }

  /**
   * True iff segment a->b crosses no island — exactly
   * `islands.every((isle) => !islandBlocksSegment(a, b, isle))`. `hints`
   * (optional, the caller's own — see `LosHints`) only changes which islands
   * are asked first.
   */
  losClear(a: Vec2, b: Vec2, hints?: LosHints): boolean {
    if (this.islands.length === 0) return true;
    this.setOrigin(a);
    const q = this.nextQuery();
    const sector = hints === undefined ? 0 : hintSector(b.x - a.x, b.y - a.y);
    if (hints !== undefined && this.hintBlocks(a, b, hints, sector, q)) return false;
    const n = this.candidates(a, b, q);
    if (n < 0) return this.losClearReference(a, b);
    for (let k = 0; k < n; k++) {
      const i = this.found[k];
      if (!this.blocks(i, a, b)) continue;
      if (hints !== undefined) remember(hints, sector, i);
      return false;
    }
    return true;
  }

  /** Does one of the islands the caller remembers for this bearing block
   *  a->b? Each one asked is stamped with `q`, so the grid walk does not ask
   *  it again. */
  private hintBlocks(a: Vec2, b: Vec2, hints: LosHints, sector: number, q: number): boolean {
    const base = sector * HINT_SLOTS;
    for (let k = 0; k < HINT_SLOTS; k++) {
      const i = hints[base + k];
      if (!(i >= 0 && i < this.islands.length) || this.stamp[i] === q) continue; // empty, from an older index, or a repeat
      this.stamp[i] = q;
      if (!this.blocks(i, a, b)) continue;
      remember(hints, sector, i);
      return true;
    }
    return false;
  }

  /**
   * Earliest coastline hit along a->b: `{ t, island }` with `t` the
   * `islandSegHit` fraction, or null — exactly the reference scan over the
   * whole list (the smallest fraction; on an exact tie the island EARLIEST in
   * the list, as a first-wins scan in list order picks).
   */
  earliestHit(a: Vec2, b: Vec2): { t: number; island: Island } | null {
    const n = this.islands.length === 0 ? 0 : this.candidates(a, b, this.nextQuery());
    if (n < 0) return earliestHitReference(a, b, this.islands);
    let bestT = Infinity;
    let bestI = -1;
    for (let k = 0; k < n; k++) {
      const i = this.found[k];
      const t = islandSegHit(a, b, this.islands[i]);
      if (t === null) continue;
      if (t < bestT || (t === bestT && i < bestI)) {
        bestT = t;
        bestI = i;
      }
    }
    return bestI < 0 ? null : { t: bestT, island: this.islands[bestI] };
  }

  /** The reference loop — taken when a segment end is outside the grid. */
  private losClearReference(a: Vec2, b: Vec2): boolean {
    for (const isle of this.islands) {
      if (islandBlocksSegment(a, b, isle)) return false;
    }
    return true;
  }

  /** `islandBlocksSegment` for island `i`: the reference's bounding circle
   *  and core tests, then its edge test as "a inside, or an edge within EPS"
   *  — the inside half remembered per origin, the edge half through the
   *  island's chunk boxes. */
  private blocks(i: number, a: Vec2, b: Vec2): boolean {
    const isle = this.islands[i];
    if (segCircleHit(a, b, isle, isle.r) === null) return false;
    this.narrowTests += 1;
    if (isle.core > 0 && segCircleHit(a, b, isle.pole, isle.core) !== null) return true;
    return this.originInside(i, a) || segPolygonEdgeBlocked(a, b, isle.poly, this.chunks[i]);
  }

  /** Start a query from origin `a`: a new origin forgets the inside answers. */
  private setOrigin(a: Vec2): void {
    if (a.x === this.originX && a.y === this.originY) return;
    this.originX = a.x;
    this.originY = a.y;
    this.originStamp += 1;
    if (this.originStamp >= 0xffffffff) {
      this.insideStamp.fill(0);
      this.originStamp = 1;
    }
  }

  /** `pointInPolygon(a, island i)` for the current origin `a` (see `setOrigin`). */
  private originInside(i: number, a: Vec2): boolean {
    if (!pointMayBeInside(this.chunks[i], a)) return false;
    if (this.insideStamp[i] !== this.originStamp) {
      this.insideStamp[i] = this.originStamp;
      this.insideIs[i] = pointInPolygon(a, this.islands[i].poly) ? 1 : 0;
    }
    return this.insideIs[i] === 1;
  }

  /** The cell index of `v` on an axis from `origin`, or -1 when outside the grid (NaN included). */
  private cellOf(origin: number, v: number): number {
    const i = Math.floor((v - origin) / GRID_CELL_U);
    return i >= 0 && i < this.side ? i : -1;
  }

  /**
   * Fill `found` with every island filed under a cell the segment a->b
   * crosses (each once) and return how many — or -1 when an end lies outside
   * the grid, so the caller takes the reference loop.
   */
  private candidates(a: Vec2, b: Vec2, q: number): number {
    let i = this.cellOf(this.ox, a.x);
    let j = this.cellOf(this.oy, a.y);
    const ib = this.cellOf(this.ox, b.x);
    const jb = this.cellOf(this.oy, b.y);
    if (i < 0 || j < 0 || ib < 0 || jb < 0) return -1;
    const X = walkAxis(this.ox, GRID_CELL_U, i, ib, a.x, b.x - a.x);
    const Y = walkAxis(this.oy, GRID_CELL_U, j, jb, a.y, b.y - a.y);
    let n = this.collect(i, j, q, 0);
    while (X.left > 0 || Y.left > 0) {
      // Step the axis whose next cell wall comes first — but never an axis
      // that has no cells left, so the walk always ends in the cell of `b`.
      if (Y.left === 0 || (X.left > 0 && X.tMax < Y.tMax)) {
        X.tMax += X.tDelta;
        X.left -= 1;
        i += X.step;
      } else {
        Y.tMax += Y.tDelta;
        Y.left -= 1;
        j += Y.step;
      }
      n = this.collect(i, j, q, n);
    }
    return n;
  }

  /** A fresh query stamp (the stamps are wiped if the counter ever wraps). */
  private nextQuery(): number {
    this.query += 1;
    if (this.query >= 0xffffffff) {
      this.stamp.fill(0);
      this.query = 1;
    }
    return this.query;
  }

  /** Append cell (i, j)'s islands not yet stamped by query `q` to `found`; returns the new count. */
  private collect(i: number, j: number, q: number, n: number): number {
    const c = j * this.side + i;
    let count = n;
    for (let k = this.cellStart[c]; k < this.cellStart[c + 1]; k++) {
      const isle = this.cellItems[k];
      if (this.stamp[isle] === q) continue;
      this.stamp[isle] = q;
      this.found[count] = isle;
      count += 1;
    }
    return count;
  }
}

/**
 * THE REFERENCE earliest-hit scan (the pre-index `earliestIsland` loop, kept
 * verbatim): every island in list order, the first strictly smaller fraction
 * wins. The index answers the same; this is its fallback and its oracle.
 */
export function earliestHitReference(a: Vec2, b: Vec2, islands: readonly Island[]): { t: number; island: Island } | null {
  let best: { t: number; island: Island } | null = null;
  for (const isle of islands) {
    const t = islandSegHit(a, b, isle);
    if (t !== null && (best === null || t < best.t)) best = { t, island: isle };
  }
  return best;
}

interface GridExtent {
  ox: number;
  oy: number;
  side: number;
}

/** The grid square: the islands' bounding circles, padded, as whole cells from (ox, oy). */
function gridExtent(islands: readonly Island[]): GridExtent {
  let lo = Infinity;
  let hi = -Infinity;
  for (const isle of islands) {
    lo = Math.min(lo, isle.x - isle.r, isle.y - isle.r);
    hi = Math.max(hi, isle.x + isle.r, isle.y + isle.r);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { ox: 0, oy: 0, side: 1 };
  // A generated map is centred on the origin, so a square symmetric about it
  // covers the whole ocean the islands span; one extra cell each side keeps
  // every padded bounding circle inside the grid.
  const half = Math.max(Math.abs(lo), Math.abs(hi)) + GRID_PAD + GRID_CELL_U;
  const side = Math.min(GRID_MAX_SIDE, Math.max(1, Math.ceil((2 * half) / GRID_CELL_U)));
  return { ox: -half, oy: -half, side };
}

/** The clamped cell range [lo, hi] an interval [min, max] covers on an axis. */
function cellRange(origin: number, side: number, min: number, max: number): [number, number] {
  const lo = Math.max(0, Math.floor((min - origin) / GRID_CELL_U));
  const hi = Math.min(side - 1, Math.floor((max - origin) / GRID_CELL_U));
  return [lo, hi];
}

/** A cell's rectangle grown by GRID_PAD, as [x0, y0, x1, y1]. */
type Rect = readonly [number, number, number, number];

function paddedCell(ext: GridExtent, i: number, j: number): Rect {
  const x0 = ext.ox + i * GRID_CELL_U;
  const y0 = ext.oy + j * GRID_CELL_U;
  return [x0 - GRID_PAD, y0 - GRID_PAD, x0 + GRID_CELL_U + GRID_PAD, y0 + GRID_CELL_U + GRID_PAD];
}

/** Could the edge p->q touch the rectangle? (`boxMayTouch`: false only when
 *  their boxes are disjoint or the rectangle lies wholly on one side of the
 *  edge's line.) */
function edgeMayTouchRect(p: Vec2, q: Vec2, r: Rect): boolean {
  return boxMayTouch(r[0], r[1], r[2], r[3], p, q);
}

/**
 * Could any LAND of the island lie in the padded cell? Yes when a coastline
 * edge may touch the rectangle, or — no edge near it — when the rectangle's
 * centre is on the land (the cell is then wholly inland). A cell this rejects
 * holds no point of the island's polygon, so a segment whose every visited
 * cell rejects the island can meet neither its coastline nor its core, nor
 * start on its land: the reference's answer for that island is "clear".
 */
function landMayTouchCell(isle: Island, r: Rect): boolean {
  const poly = isle.poly;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (edgeMayTouchRect(poly[j], poly[i], r)) return true;
  }
  return pointInPolygon({ x: (r[0] + r[2]) / 2, y: (r[1] + r[3]) / 2 }, poly);
}

/**
 * The cells an island is filed under: every cell (padded by GRID_PAD) that
 * may hold some of its LAND, inside the range its bounding circle spans. The
 * bounding circle alone would be a correct superset too, but a long thin
 * island's circle covers many times its land, and every extra cell is an
 * island a passing ray must test and dismiss.
 */
function cellsOf(isle: Island, ext: GridExtent): number[] {
  const reach = isle.r + GRID_PAD;
  const [i0, i1] = cellRange(ext.ox, ext.side, isle.x - reach, isle.x + reach);
  const [j0, j1] = cellRange(ext.oy, ext.side, isle.y - reach, isle.y + reach);
  const out: number[] = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      if (landMayTouchCell(isle, paddedCell(ext, i, j))) out.push(j * ext.side + i);
    }
  }
  return out;
}

/** File every island under its cells, as a compact start / items pair. */
function fileIslands(islands: readonly Island[], ext: GridExtent): { cellStart: Uint32Array; cellItems: Uint32Array } {
  const cells = islands.map((isle) => cellsOf(isle, ext));
  const cellStart = new Uint32Array(ext.side * ext.side + 1);
  for (const list of cells) for (const c of list) cellStart[c + 1] += 1;
  for (let c = 0; c < ext.side * ext.side; c++) cellStart[c + 1] += cellStart[c];
  const cellItems = new Uint32Array(cellStart[ext.side * ext.side]);
  const next = cellStart.slice(0, ext.side * ext.side);
  cells.forEach((list, isle) => {
    for (const c of list) {
      cellItems[next[c]] = isle;
      next[c] += 1;
    }
  });
  return { cellStart, cellItems };
}

/**
 * The current index of `islands`: `prev` when it still describes the list
 * (`isCurrent`), else a fresh one. Call once per pass and hand the result to
 * the queries of that pass.
 */
export function islandIndexFor(prev: IslandIndex | undefined, islands: readonly Island[]): IslandIndex {
  return prev !== undefined && prev.isCurrent(islands) ? prev : new IslandIndex(islands);
}

const SHARED_INDEXES = new WeakMap<readonly Island[], IslandIndex>();

/**
 * The current index of `islands`, cached per list (a WeakMap on the array's
 * identity, so every map keeps its own and a dropped map takes its index with
 * it) and re-validated on EVERY call (`isCurrent` — one identity pass over
 * the list), so a list rewritten in place gets a fresh index. For callers
 * with no pass of their own to hold an index across (the bots' line tests);
 * a hot loop should take `islandIndexFor` once instead.
 */
export function sharedIslandIndex(islands: readonly Island[]): IslandIndex {
  const cur = islandIndexFor(SHARED_INDEXES.get(islands), islands);
  SHARED_INDEXES.set(islands, cur);
  return cur;
}
