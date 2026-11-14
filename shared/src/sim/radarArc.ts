// THE ARC (Story 11.3, Eric 2026-11-13, R1–R4): a far radar contact is sharp
// in range and wide in bearing. `smearArc` smears a sharp coverage mask about
// its OBSERVER: each lit cell centre at polar (r, θ) contributes the annular
// sector [r ± pulse/2] × [θ ± beam/2], CENTERED on its true bearing (R2); the
// output is their union on the same absolute lattice, plus every sharp cell
// (output ⊇ sharp). The fuzz (`fuzzCoverage`) runs after it, unchanged.
//
// ALGORITHM (the server's per-(observer, paint) budget):
//   1. Polar-convert the sharp cells in a frame rotated to the bearing φ0 of
//      the sharp rect's centre: relative bearings are atan2(v, u) near 0, so
//      the ±π wrap never splits an arc.
//   2. Sort them by bearing and sweep them into range bins (cell/4 wide) over
//      [rMin − pulse/2, rMax + pulse/2]; a bin keeps merged bearing spans —
//      bearings under one beam apart merge EXACTLY (their widened intervals
//      touch). Past `MAX_SPANS` the last span stretches (a superset).
//   3. Walk the union's bounding box (the enclosing annular sector ∪ the sharp
//      rect), each row only inside the ring [rLo, rHi]: a cell is lit when its
//      range bin holds its bearing. Range binning over-includes by < cell/4;
//      bearing is exact. When every widened bearing is in the forward half-
//      plane (always, past a few cells) spans are stored as tangents and the
//      test is v/u — no per-cell atan2.
//   4. OR the sharp cells back in; crop tight; pack.
//
// DEGRADE, NEVER THROW (radarRaster.ts's per-tick contract): a non-finite
// observer or lattice, or an observer within one cell of the sharp rect,
// returns `sharp` itself; a non-finite / non-positive beam or pulse leaves
// that axis unsmeared. Scratch buffers are module-level, grown on demand;
// only the output mask is fresh.

import { COVERAGE_WORD, coverageHas, type HullCoverage } from './radarRaster.js';

/** Bearing spans kept per range bin before the last one is stretched. */
const MAX_SPANS = 4;
/** Range-bin width as a fraction of one cell. */
const BIN_PER_CELL = 4;

let CELL_R = new Float64Array(0);
let CELL_T = new Float64Array(0);
let ORDER = new Uint32Array(0);
let SPAN_N = new Uint8Array(0);
let SPAN_LO = new Float64Array(0);
let SPAN_HI = new Float64Array(0);
let GRID = new Uint8Array(0);

/** The observer-relative polar frame for one smear. */
interface ArcFrame {
  ox: number;
  oy: number;
  cos: number;
  sin: number;
  cellU: number;
  beam: number;
  pulse: number;
}

/** Bins built from the sharp cells (see step 2). */
interface Bins {
  rLo: number;
  binU: number;
  count: number;
  tMin: number;
  tMax: number;
}

/** A finite positive number, else 0 ("that axis unsmeared"). */
function axis(v: number): number {
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Distance from (x, y) to the world rect of the sharp mask (0 inside). */
function rectGap(sharp: HullCoverage, x: number, y: number, cellU: number): number {
  const x0 = sharp.gx * cellU;
  const y0 = sharp.gy * cellU;
  const dx = Math.max(x0 - x, 0, x - (x0 + sharp.w * cellU));
  const dy = Math.max(y0 - y, 0, y - (y0 + sharp.h * cellU));
  return Math.hypot(dx, dy);
}

/** The polar frame, or null when the smear must not run (degrade ladder). */
function arcFrame(sharp: HullCoverage, ox: number, oy: number, cellU: number, beam: number, pulse: number): ArcFrame | null {
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null;
  if (!(cellU > 0 && cellU < Infinity) || (beam === 0 && pulse === 0)) return null;
  if (!(sharp.w > 0 && sharp.h > 0) || rectGap(sharp, ox, oy, cellU) < cellU) return null;
  const phi = Math.atan2((sharp.gy + sharp.h / 2) * cellU - oy, (sharp.gx + sharp.w / 2) * cellU - ox);
  return { ox, oy, cos: Math.cos(phi), sin: Math.sin(phi), cellU, beam, pulse };
}

/** Grow a scratch buffer to at least n slots. */
function ensure(n: number): void {
  if (CELL_R.length >= n) return;
  CELL_R = new Float64Array(n);
  CELL_T = new Float64Array(n);
  ORDER = new Uint32Array(n);
}

/** Step 1: polar-convert every lit sharp cell; returns how many. */
function collectCells(sharp: HullCoverage, f: ArcFrame): number {
  ensure(sharp.w * sharp.h);
  let n = 0;
  for (let row = 0; row < sharp.h; row++) {
    const dy = (sharp.gy + row + 0.5) * f.cellU - f.oy;
    for (let col = 0; col < sharp.w; col++) {
      if (!coverageHas(sharp, col, row)) continue;
      const dx = (sharp.gx + col + 0.5) * f.cellU - f.ox;
      CELL_R[n] = Math.sqrt(dx * dx + dy * dy);
      CELL_T[n] = Math.atan2(dy * f.cos - dx * f.sin, dx * f.cos + dy * f.sin);
      ORDER[n] = n;
      n++;
    }
  }
  return n;
}

/** Add one bearing (arriving in ascending order) to bin k's spans. */
function addSpan(k: number, t: number, beam: number): void {
  const base = k * MAX_SPANS;
  const n = SPAN_N[k];
  if (n > 0 && (t - SPAN_HI[base + n - 1] <= beam || n === MAX_SPANS)) {
    SPAN_HI[base + n - 1] = t;
    return;
  }
  SPAN_LO[base + n] = t;
  SPAN_HI[base + n] = t;
  SPAN_N[k] = n + 1;
}

/** Step 2: sort by bearing, sweep into range bins of merged bearing spans. */
function buildBins(n: number, f: ArcFrame): Bins {
  const order = ORDER.subarray(0, n).sort((a, b) => CELL_T[a] - CELL_T[b]);
  let rMin = Infinity;
  let rMax = -Infinity;
  for (let i = 0; i < n; i++) {
    rMin = Math.min(rMin, CELL_R[i]);
    rMax = Math.max(rMax, CELL_R[i]);
  }
  const half = f.pulse / 2;
  const binU = f.cellU / BIN_PER_CELL;
  const rLo = Math.max(0, rMin - half);
  const count = Math.floor((rMax + half - rLo) / binU) + 1;
  if (SPAN_N.length < count) {
    SPAN_N = new Uint8Array(count);
    SPAN_LO = new Float64Array(count * MAX_SPANS);
    SPAN_HI = new Float64Array(count * MAX_SPANS);
  }
  SPAN_N.fill(0, 0, count);
  for (const i of order) {
    const k0 = Math.max(0, Math.floor((CELL_R[i] - half - rLo) / binU));
    const k1 = Math.min(count - 1, Math.floor((CELL_R[i] + half - rLo) / binU));
    for (let k = k0; k <= k1; k++) addSpan(k, CELL_T[i], f.beam);
  }
  return { rLo, binU, count, tMin: CELL_T[order[0]], tMax: CELL_T[order[n - 1]] };
}

/** Grow a [minX, minY, maxX, maxY] box to hold the world point at (r, rel θ). */
function boxAdd(box: number[], f: ArcFrame, r: number, t: number): void {
  const c = Math.cos(t);
  const s = Math.sin(t);
  const x = f.ox + r * (c * f.cos - s * f.sin);
  const y = f.oy + r * (s * f.cos + c * f.sin);
  box[0] = Math.min(box[0], x);
  box[1] = Math.min(box[1], y);
  box[2] = Math.max(box[2], x);
  box[3] = Math.max(box[3], y);
}

/** Step 3's box: the annular sector holding every per-cell sector, in cells,
 *  unioned with the sharp rect → [gx, gy, w, h]. */
function sectorBox(sharp: HullCoverage, f: ArcFrame, b: Bins): [number, number, number, number] {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  const tLo = b.tMin - f.beam / 2;
  const tHi = b.tMax + f.beam / 2;
  const rHi = b.rLo + b.count * b.binU;
  for (const r of [b.rLo, rHi]) {
    boxAdd(box, f, r, tLo);
    boxAdd(box, f, r, tHi);
  }
  const phi = Math.atan2(f.sin, f.cos);
  for (let q = -4; q <= 4; q++) {
    const t = (q * Math.PI) / 2 - phi;
    if (t >= tLo && t <= tHi) boxAdd(box, f, rHi, t);
  }
  const gx = Math.min(sharp.gx, Math.floor(box[0] / f.cellU));
  const gy = Math.min(sharp.gy, Math.floor(box[1] / f.cellU));
  const w = Math.max(sharp.gx + sharp.w, Math.floor(box[2] / f.cellU) + 1) - gx;
  const h = Math.max(sharp.gy + sharp.h, Math.floor(box[3] / f.cellU) + 1) - gy;
  return [gx, gy, w, h];
}

/** True iff x lies inside one of bin k's (already widened) spans. */
function binHolds(k: number, x: number): boolean {
  for (let j = 0, base = k * MAX_SPANS; j < SPAN_N[k]; j++) {
    if (x >= SPAN_LO[base + j] && x <= SPAN_HI[base + j]) return true;
  }
  return false;
}

/** The fast path applies when every widened bearing stays inside the
 *  forward half-plane (|θ| < π/2 with margin): bearing order is then tangent
 *  order, so the per-cell test needs one division instead of an atan2. */
function tangentSafe(f: ArcFrame, b: Bins): boolean {
  const lim = Math.PI / 2 - 0.01;
  return b.tMin - f.beam / 2 > -lim && b.tMax + f.beam / 2 < lim;
}

/** Widen every span by half a beam; on the fast path store it as tangents. */
function widenSpans(f: ArcFrame, b: Bins, tan: boolean): void {
  const hb = f.beam / 2;
  for (let k = 0; k < b.count; k++) {
    for (let j = 0, i = k * MAX_SPANS; j < SPAN_N[k]; j++, i++) {
      SPAN_LO[i] = tan ? Math.tan(SPAN_LO[i] - hb) : SPAN_LO[i] - hb;
      SPAN_HI[i] = tan ? Math.tan(SPAN_HI[i] + hb) : SPAN_HI[i] + hb;
    }
  }
}

/** One cell's verdict: its range bin holds its relative bearing (a tangent
 *  on the fast path; behind the observer that is NaN, which nothing holds). */
function cellLit(dx: number, dy: number, f: ArcFrame, b: Bins, tan: boolean): boolean {
  const k = Math.floor((Math.sqrt(dx * dx + dy * dy) - b.rLo) / b.binU);
  if (k < 0 || k >= b.count || SPAN_N[k] === 0) return false;
  const u = dx * f.cos + dy * f.sin;
  const v = dy * f.cos - dx * f.sin;
  return binHolds(k, !tan ? Math.atan2(v, u) : u > 0 ? v / u : NaN);
}

/** Light the cells of one row whose centres' dx lies in [xa, xb]. */
function fillRun(grid: Uint8Array, gx: number, w: number, row: number, dy: number, xa: number, xb: number, f: ArcFrame, b: Bins, tan: boolean): void {
  const c0 = Math.max(0, Math.ceil((f.ox + xa) / f.cellU - 0.5) - gx);
  const c1 = Math.min(w - 1, Math.floor((f.ox + xb) / f.cellU - 0.5) - gx);
  for (let col = c0; col <= c1; col++) {
    if (cellLit((gx + col + 0.5) * f.cellU - f.ox, dy, f, b, tan)) grid[row * w + col] = 1;
  }
}

/** Step 3: light every box cell whose range bin holds its bearing. Each row
 *  visits only the cells inside the ring [rLo, rHi] (one or two runs). */
function fillGrid(grid: Uint8Array, gx: number, gy: number, w: number, h: number, f: ArcFrame, b: Bins): void {
  const tan = tangentSafe(f, b);
  widenSpans(f, b, tan);
  const rHi = b.rLo + b.count * b.binU;
  for (let row = 0; row < h; row++) {
    const dy = (gy + row + 0.5) * f.cellU - f.oy;
    const outer = rHi * rHi - dy * dy;
    if (outer < 0) continue;
    const xb = Math.sqrt(outer);
    const xa = Math.sqrt(Math.max(0, b.rLo * b.rLo - dy * dy));
    if (xa === 0) {
      fillRun(grid, gx, w, row, dy, -xb, xb, f, b, tan);
      continue;
    }
    fillRun(grid, gx, w, row, dy, -xb, -xa, f, b, tan);
    fillRun(grid, gx, w, row, dy, xa, xb, f, b, tan);
  }
}

/** Step 4a: OR the sharp mask back in (output ⊇ sharp). */
function orSharp(grid: Uint8Array, gx: number, gy: number, w: number, sharp: HullCoverage): void {
  for (let row = 0; row < sharp.h; row++) {
    for (let col = 0; col < sharp.w; col++) {
      if (coverageHas(sharp, col, row)) grid[(sharp.gy - gy + row) * w + (sharp.gx - gx + col)] = 1;
    }
  }
}

/** The grid's tight lit bounds [c0, r0, c1, r1] (never empty: sharp is in it). */
function litBounds(grid: Uint8Array, w: number, h: number): [number, number, number, number] {
  let c0 = w;
  let r0 = h;
  let c1 = -1;
  let r1 = -1;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (grid[row * w + col] === 0) continue;
      if (col < c0) c0 = col;
      if (col > c1) c1 = col;
      if (row < r0) r0 = row;
      r1 = row;
    }
  }
  return [c0, r0, c1, r1];
}

/** Step 4b: crop to the lit cells and pack into a fresh wire mask. */
function packCropped(grid: Uint8Array, gx: number, gy: number, w: number, h: number): HullCoverage {
  const [c0, r0, c1, r1] = litBounds(grid, w, h);
  const ow = c1 - c0 + 1;
  const oh = r1 - r0 + 1;
  const bits = new Array<number>(Math.ceil((ow * oh) / COVERAGE_WORD)).fill(0);
  for (let row = 0; row < oh; row++) {
    for (let col = 0; col < ow; col++) {
      const i = row * ow + col;
      if (grid[(r0 + row) * w + c0 + col] === 1) bits[i >>> 5] |= 1 << (i & 31);
    }
  }
  return { gx: gx + c0, gy: gy + r0, w: ow, h: oh, bits };
}

/**
 * SMEAR A SHARP RADAR MASK INTO AN ARC about the observer at (ox, oy): beam
 * `beamRad` (full width, radians) in bearing, pulse `pulseU` (full depth, u)
 * in range — see the file header for the law and the algorithm. Pure and
 * deterministic in its inputs; the output is a fresh tight-cropped mask on
 * the same absolute lattice that always contains `sharp`.
 */
export function smearArc(sharp: HullCoverage, ox: number, oy: number, cellU: number, beamRad: number, pulseU: number): HullCoverage {
  const f = arcFrame(sharp, ox, oy, cellU, axis(beamRad), axis(pulseU));
  if (f === null) return sharp;
  const n = collectCells(sharp, f);
  if (n === 0) return sharp;
  const bins = buildBins(n, f);
  const [gx, gy, w, h] = sectorBox(sharp, f, bins);
  if (GRID.length < w * h) GRID = new Uint8Array(w * h);
  const grid = GRID.subarray(0, w * h).fill(0);
  fillGrid(grid, gx, gy, w, h, f, bins);
  orSharp(grid, gx, gy, w, sharp);
  return packCropped(grid, gx, gy, w, h);
}
