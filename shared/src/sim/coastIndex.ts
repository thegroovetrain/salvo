// THE COASTLINE INDEX — a per-island uniform grid over the coastline's edges,
// built once per island polygon (islands never move or change) and used by the
// ship-vs-island overlap predicate in sim/collision.ts.
//
// WHY (fix 2026-10-14, Eric on staging: "performance is completely tanked").
// After the fleet wave a room holds 112 hulls; every hull inside an island's
// BOUNDING CIRCLE ran the exact hull-vs-coastline test against EVERY coastline
// edge (segPolygonHit: a pointInPolygon sweep plus one allocating
// segSegClosest per coastline edge, per hull edge, twice per tick) — 16 ms of
// a 27 ms server tick. The index answers the same two questions touching only
// the edges that can possibly matter.
//
// EXACTNESS (byte-identical poses — the predictor and the server must never
// diverge, and no resolved pose may move): both queries are EXACT
// re-statements of the brute-force predicates, never approximations.
//   - `coastContains` is pointInPolygon's crossing-parity rule evaluated over
//     only the edges that STRADDLE p.y (an edge that does not straddle never
//     toggles parity). Edges are banded by the same monotone float expression
//     the query uses, so every straddling edge is in the query's band; each
//     edge appears once per band, and the parity toggle per edge is the
//     original formula with the original operand order — XOR is order-free.
//   - `coastSegNear` is segPolygonHit's "any edge within `radius`" over only
//     the edges whose bounding box comes within PAD of the query segment's —
//     PAD (1e-3 u) is six orders of magnitude above the 2e-9 threshold plus
//     segSegClosest's float dust, so no qualifying edge is ever pruned. Same
//     segSegClosest call, same operand order, same threshold.
// Pure, deterministic, allocation-free per query; the cache is a WeakMap keyed
// by the polygon array, so a regenerated map simply builds fresh indexes.

import type { Vec2 } from '../math/vec.js';
import { segSegClosest } from '../math/geom.js';

/** Grid cell edge (u). ~a hull beam: a hull edge touches a handful of cells. */
const CELL = 16;
/** Conservative bounding-box pad (u) — see the header's exactness note. */
const PAD = 1e-3;
/** closestPointOnPolygon's degenerate-edge threshold (silhouette.ts EPS). */
const SEG_LEN_EPS = 1e-9;

interface CoastIndex {
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** Edge ids (edge k runs poly[k-1 wrapped] -> poly[k]) per cell, row-major. */
  cells: Int32Array[];
  /** Edge ids per horizontal band (row), for the parity test. */
  bands: Int32Array[];
  /** Per-edge visit stamp so an edge spanning cells is tested once per query. */
  stamp: Int32Array;
  query: number;
}

const INDEXES = new WeakMap<readonly Vec2[], CoastIndex>();

function cellOf(v: number, origin: number, n: number): number {
  const c = Math.floor((v - origin) / CELL);
  return c < 0 ? 0 : c >= n ? n - 1 : c;
}

function prevIndex(k: number, n: number): number {
  return k === 0 ? n - 1 : k - 1;
}

function buildIndex(poly: readonly Vec2[]): CoastIndex {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const x0 = minX - PAD;
  const y0 = minY - PAD;
  const cols = Math.max(1, Math.floor((maxX + PAD - x0) / CELL) + 1);
  const rows = Math.max(1, Math.floor((maxY + PAD - y0) / CELL) + 1);
  const cellLists: number[][] = Array.from({ length: cols * rows }, () => []);
  const bandLists: number[][] = Array.from({ length: rows }, () => []);
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const a = poly[k];
    const b = poly[prevIndex(k, n)];
    const lo = Math.min(a.y, b.y);
    const hi = Math.max(a.y, b.y);
    // Bands: the UNPADDED y-range through the query's own expression.
    for (let r = cellOf(lo, y0, rows); r <= cellOf(hi, y0, rows); r++) bandLists[r].push(k);
    const c0 = cellOf(Math.min(a.x, b.x) - PAD, x0, cols);
    const c1 = cellOf(Math.max(a.x, b.x) + PAD, x0, cols);
    for (let r = cellOf(lo - PAD, y0, rows); r <= cellOf(hi + PAD, y0, rows); r++) {
      for (let c = c0; c <= c1; c++) cellLists[r * cols + c].push(k);
    }
  }
  return {
    x0, y0, cols, rows,
    cells: cellLists.map((l) => Int32Array.from(l)),
    bands: bandLists.map((l) => Int32Array.from(l)),
    stamp: new Int32Array(n),
    query: 0,
  };
}

/** A fresh visit stamp; on the (astronomically distant) wrap back to the
 *  stamps' initial 0 the table is cleared so no edge is ever skipped. */
function nextQuery(idx: CoastIndex): number {
  idx.query = (idx.query + 1) | 0;
  if (idx.query === 0) {
    idx.stamp.fill(0);
    idx.query = 1;
  }
  return idx.query;
}

function indexOf(poly: readonly Vec2[]): CoastIndex {
  let idx = INDEXES.get(poly);
  if (idx === undefined) {
    idx = buildIndex(poly);
    INDEXES.set(poly, idx);
  }
  return idx;
}

/**
 * Exactly `pointInPolygon(p, poly)` (sim/silhouette.ts) for a STATIC polygon —
 * the same crossing-parity rule over only the edges in p.y's band.
 */
export function coastContains(p: Vec2, poly: readonly Vec2[]): boolean {
  const idx = indexOf(poly);
  const r = Math.floor((p.y - idx.y0) / CELL);
  // Outside every band: no edge's y-range can contain p.y (monotone floor).
  if (r < 0 || r >= idx.rows) return false;
  const n = poly.length;
  let inside = false;
  for (const k of idx.bands[r]) {
    const a = poly[k];
    const b = poly[prevIndex(k, n)];
    const crosses = a.y > p.y !== b.y > p.y;
    if (crosses && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * True iff some coastline edge comes within `radius` of segment a0->a1 —
 * exactly segPolygonHit's edge clause (`segSegClosest(a0, a1, poly[j],
 * poly[i]).dist <= radius`) for a STATIC polygon, over only the edges whose
 * padded box meets the segment's. `radius` must be tiny (≪ PAD).
 */
export function coastSegNear(a0: Vec2, a1: Vec2, poly: readonly Vec2[], radius: number): boolean {
  const idx = indexOf(poly);
  const minX = Math.min(a0.x, a1.x) - PAD;
  const maxX = Math.max(a0.x, a1.x) + PAD;
  const minY = Math.min(a0.y, a1.y) - PAD;
  const maxY = Math.max(a0.y, a1.y) + PAD;
  if (maxX < idx.x0 || maxY < idx.y0) return false;
  if (minX > idx.x0 + idx.cols * CELL || minY > idx.y0 + idx.rows * CELL) return false;
  const q = nextQuery(idx);
  const c0 = cellOf(minX, idx.x0, idx.cols);
  const c1 = cellOf(maxX, idx.x0, idx.cols);
  const r1 = cellOf(maxY, idx.y0, idx.rows);
  const n = poly.length;
  for (let r = cellOf(minY, idx.y0, idx.rows); r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      for (const k of idx.cells[r * idx.cols + c]) {
        if (idx.stamp[k] === q) continue;
        idx.stamp[k] = q;
        if (segSegClosest(a0, a1, poly[prevIndex(k, n)], poly[k]).dist <= radius) return true;
      }
    }
  }
  return false;
}

/** Margin (u) a ring bound must beat the best distance by before the search
 *  stops — far above any float dust in the per-edge distance. */
const RING_MARGIN = 1e-3;

/** Min point-to-edge distance over one cell's edges (closestPointOnPolygon's
 *  per-edge formula, verbatim), folded into `best`. */
function cellMin(idx: CoastIndex, poly: readonly Vec2[], p: Vec2, cell: number, q: number, best: number): number {
  const n = poly.length;
  for (const k of idx.cells[cell]) {
    if (idx.stamp[k] === q) continue;
    idx.stamp[k] = q;
    const a = poly[prevIndex(k, n)];
    const b = poly[k];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > SEG_LEN_EPS ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const ddx = p.x - (a.x + dx * t);
    const ddy = p.y - (a.y + dy * t);
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d < best) best = d;
  }
  return best;
}

/** Fold every in-grid cell on Chebyshev ring `k` around (cx, cy) into `best`. */
function ringMin(idx: CoastIndex, poly: readonly Vec2[], p: Vec2, cx: number, cy: number, k: number, q: number, best: number): number {
  const r0 = Math.max(0, cy - k);
  const r1 = Math.min(idx.rows - 1, cy + k);
  for (let r = r0; r <= r1; r++) {
    const edgeRow = r === cy - k || r === cy + k;
    const step = edgeRow ? 1 : 2 * k;
    for (let c = cx - k; c <= cx + k; c += step) {
      if (c >= 0 && c < idx.cols) best = cellMin(idx, poly, p, r * idx.cols + c, q, best);
    }
  }
  return best;
}

/**
 * Exactly `closestPointOnPolygon(p, poly).dist` (sim/silhouette.ts) for a
 * STATIC polygon: the same per-edge distance, minimised over cells in
 * expanding Chebyshev rings around p's (possibly off-grid) cell. Every edge
 * not yet visited lies wholly in cells of ring ≥ k + 1, at least k·CELL from
 * p, so once the best distance beats that bound by RING_MARGIN no unvisited
 * edge can lower the minimum — and a min of identical floats is identical.
 */
export function coastDistance(p: Vec2, poly: readonly Vec2[]): number {
  const idx = indexOf(poly);
  const cx = Math.floor((p.x - idx.x0) / CELL);
  const cy = Math.floor((p.y - idx.y0) / CELL);
  // The ring that covers the whole grid: past it every edge has been visited.
  const last = Math.max(cx, idx.cols - 1 - cx, cy, idx.rows - 1 - cy);
  const q = nextQuery(idx);
  let best = Infinity;
  for (let k = 0; k <= last; k++) {
    best = ringMin(idx, poly, p, cx, cy, k, q, best);
    if (best + RING_MARGIN <= k * CELL) break;
  }
  return best;
}
