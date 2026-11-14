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
// A ZERO BEAM (Story 11.3 review, P7a) smears in range only: each sharp cell
// lights the cells its own ray crosses over [r ± pulse/2] (`radialSmear`) —
// a zero-width bearing span would otherwise light only cells a ray hits
// exactly.
//
// DEGRADE, NEVER THROW (radarRaster.ts's per-tick contract): a non-finite
// observer or lattice, a rect that is not finite integers, or an observer
// within one cell of the sharp rect, returns `sharp` itself; so does an arc
// whose box would exceed `arcAreaCap` (an observer absurdly far — the cap is
// derived from the radar's reach × the beam + the pulse, generously). A
// non-finite / non-positive beam or pulse leaves that axis unsmeared.
// Scratch buffers are module-level, grown on demand; only the output mask is
// fresh.

import { CONFIG } from '../constants.js';
import { COVERAGE_WORD, coverageCellCount, coverageHas, type HullCoverage } from './radarRaster.js';

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

/** A rect of finite integer cells, non-empty (the only shape we index). */
function validRect(c: HullCoverage): boolean {
  return Number.isInteger(c.gx) && Number.isInteger(c.gy) && Number.isInteger(c.w) && Number.isInteger(c.h) && c.w > 0 && c.h > 0;
}

/** The polar frame, or null when the smear must not run (degrade ladder). */
function arcFrame(sharp: HullCoverage, ox: number, oy: number, cellU: number, beam: number, pulse: number): ArcFrame | null {
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return null;
  if (!(cellU > 0 && cellU < Infinity) || (beam === 0 && pulse === 0)) return null;
  if (!validRect(sharp) || !(rectGap(sharp, ox, oy, cellU) >= cellU)) return null;
  const phi = Math.atan2((sharp.gy + sharp.h / 2) * cellU - oy, (sharp.gx + sharp.w / 2) * cellU - ox);
  return { ox, oy, cos: Math.cos(phi), sin: Math.sin(phi), cellU, beam, pulse };
}

/**
 * THE SANITY CAP on a smear's working box, in cells (P7b): the box of a paint
 * at the radar's full reach is at most its beam chord plus the pulse plus the
 * target's own diagonal, a side; this allows twice that, squared. Above it
 * the observer is absurdly far (or the inputs absurd) and the smear returns
 * the sharp mask rather than allocate.
 */
function arcAreaCap(sharp: HullCoverage, f: ArcFrame): number {
  const d = Math.hypot(sharp.w, sharp.h) * f.cellU;
  const side = (2 * ((CONFIG.vision.radar + d) * Math.min(f.beam, Math.PI) + f.pulse + d)) / f.cellU + 4;
  return side * side;
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

/** The cell columns [c0, c1] (box-relative) of one row whose centres' dx
 *  lies in [xa, xb]. */
function runCols(gx: number, w: number, xa: number, xb: number, f: ArcFrame): [number, number] {
  const c0 = Math.max(0, Math.ceil((f.ox + xa) / f.cellU - 0.5) - gx);
  const c1 = Math.min(w - 1, Math.floor((f.ox + xb) / f.cellU - 0.5) - gx);
  return [c0, c1];
}

/** The dx runs of one row (centre offset `dy`) inside the ring [rLo, rHi]:
 *  one run [−xb, xb] when the row misses the inner circle, else two; null
 *  when the row misses the ring. */
function rowRuns(dy: number, b: Bins): [number, number][] | null {
  const rHi = b.rLo + b.count * b.binU;
  const outer = rHi * rHi - dy * dy;
  if (outer < 0) return null;
  const xb = Math.sqrt(outer);
  const xa = Math.sqrt(Math.max(0, b.rLo * b.rLo - dy * dy));
  return xa === 0 ? [[-xb, xb]] : [[-xb, -xa], [xa, xb]];
}

/** Step 3: light every box cell whose range bin holds its bearing. Each row
 *  visits only the cells inside the ring [rLo, rHi] (one or two runs). */
function fillGrid(grid: Uint8Array, gx: number, gy: number, w: number, h: number, f: ArcFrame, b: Bins): void {
  const tan = tangentSafe(f, b);
  widenSpans(f, b, tan);
  for (let row = 0; row < h; row++) {
    const dy = (gy + row + 0.5) * f.cellU - f.oy;
    const runs = rowRuns(dy, b);
    if (runs === null) continue;
    for (const [xa, xb] of runs) {
      const [c0, c1] = runCols(gx, w, xa, xb, f);
      for (let col = c0; col <= c1; col++) {
        if (cellLit((gx + col + 0.5) * f.cellU - f.ox, dy, f, b, tan)) grid[row * w + col] = 1;
      }
    }
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

/** The grid's tight lit bounds [c0, r0, c1, r1] (never empty: sharp is in
 *  it). Each row is scanned in from both ends only. */
function litBounds(grid: Uint8Array, w: number, h: number): [number, number, number, number] {
  let c0 = w;
  let r0 = h;
  let c1 = -1;
  let r1 = -1;
  for (let row = 0; row < h; row++) {
    const base = row * w;
    let first = 0;
    while (first < w && grid[base + first] === 0) first++;
    if (first === w) continue;
    let last = w - 1;
    while (grid[base + last] === 0) last--;
    if (first < c0) c0 = first;
    if (last > c1) c1 = last;
    if (row < r0) r0 = row;
    r1 = row;
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
  if (f.beam === 0) return radialSmear(sharp, f);
  const n = collectCells(sharp, f);
  if (n === 0) return sharp;
  const bins = buildBins(n, f);
  const [gx, gy, w, h] = sectorBox(sharp, f, bins);
  if (!(w * h <= arcAreaCap(sharp, f))) return sharp;
  const grid = scratchGrid(w * h);
  fillGrid(grid, gx, gy, w, h, f, bins);
  orSharp(grid, gx, gy, w, sharp);
  return packCropped(grid, gx, gy, w, h);
}

/** The zeroed scratch grid, grown on demand. */
function scratchGrid(n: number): Uint8Array {
  if (GRID.length < n) GRID = new Uint8Array(n);
  return GRID.subarray(0, n).fill(0);
}

/**
 * THE ZERO-BEAM SMEAR (P7a): every sharp cell lights the cells its own ray
 * (observer → cell centre) crosses over [r − pulse/2, r + pulse/2], sampled
 * every quarter cell — the pulse in range, nothing sideways. The box is the
 * sharp rect padded by the pulse's half-depth plus a cell.
 */
function radialSmear(sharp: HullCoverage, f: ArcFrame): HullCoverage {
  const pad = Math.ceil(f.pulse / 2 / f.cellU) + 1;
  const [gx, gy, w, h] = [sharp.gx - pad, sharp.gy - pad, sharp.w + 2 * pad, sharp.h + 2 * pad];
  if (!(w * h <= arcAreaCap(sharp, f))) return sharp;
  const grid = scratchGrid(w * h);
  const steps = Math.ceil((f.pulse * BIN_PER_CELL) / f.cellU);
  for (let row = 0; row < sharp.h; row++) {
    for (let col = 0; col < sharp.w; col++) {
      if (coverageHas(sharp, col, row)) walkRay(grid, gx, gy, w, sharp.gx + col, sharp.gy + row, steps, f);
    }
  }
  orSharp(grid, gx, gy, w, sharp);
  return packCropped(grid, gx, gy, w, h);
}

/** Light the cells the ray through cell (cx, cy)'s centre crosses within
 *  half a pulse of that centre's range (`steps` + 1 samples). */
function walkRay(grid: Uint8Array, gx: number, gy: number, w: number, cx: number, cy: number, steps: number, f: ArcFrame): void {
  const dx = (cx + 0.5) * f.cellU - f.ox;
  const dy = (cy + 0.5) * f.cellU - f.oy;
  const r = Math.sqrt(dx * dx + dy * dy);
  for (let i = 0; i <= steps; i++) {
    const k = (r + f.pulse * (i / steps - 0.5)) / r;
    if (k < 0) continue;
    const col = Math.floor((f.ox + dx * k) / f.cellU) - gx;
    const row = Math.floor((f.oy + dy * k) / f.cellU) - gy;
    grid[row * w + col] = 1;
  }
}

/**
 * A SHARP MASK AND ITS CORE, SMEARED IN ONE PASS (Story 11.3 review, P5): the
 * wake paint needs the ribbon's arc AND which of its cells lie in the SPINE's
 * own arc (the glint's never-dropped core). Smearing both costs two full
 * smears a segment; here the ribbon is smeared once, and the core is tested
 * only on the arc's LIT cells, against the spine's own range bins — the very
 * test `smearArc(core, …)` would run (same frame, same bins, same box and
 * ring runs, same fast path), so `out.core` holds exactly the cells of
 * `smearArc(core, …)` that the arc lights, re-seated on the arc's rect.
 * `core` must share `sharp`'s rect (the wake's spine does); otherwise, and
 * whenever the arc degrades, the two are smeared separately as before.
 */
export function smearArcWithCore(
  sharp: HullCoverage,
  core: HullCoverage,
  ox: number,
  oy: number,
  cellU: number,
  beamRad: number,
  pulseU: number,
): { arc: HullCoverage; core: HullCoverage } {
  const arc = smearArc(sharp, ox, oy, cellU, beamRad, pulseU);
  if (arc === sharp) return { arc, core };
  const test = sameRect(core, sharp) ? coreTester(core, ox, oy, cellU, beamRad, pulseU) : null;
  if (test === null) return { arc, core: onRect(smearArc(core, ox, oy, cellU, beamRad, pulseU), arc) };
  return { arc, core: litWhere(arc, test) };
}

/** Do two masks share one rect? */
function sameRect(a: HullCoverage, b: HullCoverage): boolean {
  return a.gx === b.gx && a.gy === b.gy && a.w === b.w && a.h === b.h;
}

/** The cells of `arc` lit AND passing `test` (absolute cell indices), on
 *  `arc`'s rect. */
function litWhere(arc: HullCoverage, test: (cx: number, cy: number) => boolean): HullCoverage {
  const bits = new Array<number>(arc.bits.length).fill(0);
  const n = arc.w * arc.h;
  for (let word = 0; word < arc.bits.length; word++) {
    for (let rest = arc.bits[word] | 0; rest !== 0; rest &= rest - 1) {
      const i = word * 32 + 31 - Math.clz32(rest & -rest);
      if (i >= n) break;
      const row = (i / arc.w) | 0;
      if (test(arc.gx + i - row * arc.w, arc.gy + row)) bits[word] |= 1 << (i & 31);
    }
  }
  return { gx: arc.gx, gy: arc.gy, w: arc.w, h: arc.h, bits };
}

/** `src`'s lit cells re-seated on `onto`'s rect (cells outside it dropped). */
function onRect(src: HullCoverage, onto: HullCoverage): HullCoverage {
  const bits = new Array<number>(onto.bits.length).fill(0);
  for (let row = 0; row < src.h; row++) {
    for (let col = 0; col < src.w; col++) {
      const c = src.gx - onto.gx + col;
      const r = src.gy - onto.gy + row;
      if (c < 0 || r < 0 || c >= onto.w || r >= onto.h || !coverageHas(src, col, row)) continue;
      const i = r * onto.w + c;
      bits[i >>> 5] |= 1 << (i & 31);
    }
  }
  return { gx: onto.gx, gy: onto.gy, w: onto.w, h: onto.h, bits };
}

/**
 * The predicate "`smearArc(core, …)` lights absolute cell (cx, cy)" — steps
 * 1–3 of the smear run on `core` (bins, box, widened spans), then each query
 * replays exactly the box / ring-run / bin test `fillGrid` runs, plus step
 * 4a's sharp OR. Null when the smear would return `core` itself (no cells,
 * or a box over the cap) — the caller then smears it whole.
 */
function coreTester(core: HullCoverage, ox: number, oy: number, cellU: number, beamRad: number, pulseU: number): ((cx: number, cy: number) => boolean) | null {
  const f = arcFrame(core, ox, oy, cellU, axis(beamRad), axis(pulseU));
  if (f === null || f.beam === 0) return null;
  const n = collectCells(core, f);
  if (n === 0) return null;
  const b = buildBins(n, f);
  const [gx, gy, w, h] = sectorBox(core, f, b);
  if (!(w * h <= arcAreaCap(core, f))) return null;
  const tan = tangentSafe(f, b);
  widenSpans(f, b, tan);
  const cols = runTable(gx, gy, w, h, f, b);
  return (cx, cy) => {
    if (coverageHas(core, cx - core.gx, cy - core.gy)) return true;
    const col = cx - gx;
    const row = cy - gy;
    if (col < 0 || row < 0 || col >= w || row >= h) return false;
    const k = row * 4;
    if (!((col >= cols[k] && col <= cols[k + 1]) || (col >= cols[k + 2] && col <= cols[k + 3]))) return false;
    return cellLit((gx + col + 0.5) * f.cellU - f.ox, (gy + row + 0.5) * f.cellU - f.oy, f, b, tan);
  };
}

/** Per box row, the (up to two) column runs `fillGrid` visits — [c0, c1,
 *  c0', c1'], an empty run as [0, −1] — computed exactly as `fillGrid` does
 *  (`rowRuns` → `runCols`). */
function runTable(gx: number, gy: number, w: number, h: number, f: ArcFrame, b: Bins): Int32Array {
  const cols = new Int32Array(h * 4);
  for (let row = 0; row < h; row++) {
    cols.set([0, -1, 0, -1], row * 4);
    const runs = rowRuns((gy + row + 0.5) * f.cellU - f.oy, b);
    if (runs === null) continue;
    runs.forEach(([xa, xb], j) => cols.set(runCols(gx, w, xa, xb, f), row * 4 + 2 * j));
  }
  return cols;
}

// ---------------------------------------------------------------------------
// THE ARC'S INVERSE (Story 11.3 review, P1/P2/P4): what a reader who knows the
// observer, the beam and the pulse can recover of the TARGET's size from an
// arc'd mask — the bots' crate filter (server ai/plot.ts) and the client's
// chop halo (render/radarField.ts) both read it.
// ---------------------------------------------------------------------------

/** One lit cell in the observer's polar frame: range `r` and the sine bounds
 *  of its bearing ± half a beam, relative to the mask's centroid bearing. */
interface PolarCell {
  r: number;
  sLo: number;
  sHi: number;
}

/** The sine range over the bearing interval [a − h, a + h] (a in (−π, π]). */
function sineBounds(a: number, h: number): [number, number] {
  const s1 = Math.sin(a - h);
  const s2 = Math.sin(a + h);
  const lo = a - h < -Math.PI / 2 && a + h > -Math.PI / 2 ? -1 : Math.min(s1, s2);
  const hi = a - h < Math.PI / 2 && a + h > Math.PI / 2 ? 1 : Math.max(s1, s2);
  return [lo, hi];
}

/** `a − b` wrapped into (−π, π]. */
function wrapDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** The lit cells about (ox, oy), zero bearing at the lit-cell centroid's
 *  bearing `phi` (returned alongside). */
function polarCells(cov: HullCoverage, ox: number, oy: number, cellU: number, halfBeam: number): { cells: PolarCell[]; phi: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      sx += (cov.gx + col + 0.5) * cellU;
      sy += (cov.gy + row + 0.5) * cellU;
      n++;
    }
  }
  const phi = Math.atan2(sy / n - oy, sx / n - ox);
  const cells: PolarCell[] = [];
  for (let row = 0; row < cov.h; row++) {
    const dy = (cov.gy + row + 0.5) * cellU - oy;
    for (let col = 0; col < cov.w; col++) {
      if (!coverageHas(cov, col, row)) continue;
      const dx = (cov.gx + col + 0.5) * cellU - ox;
      const [sLo, sHi] = sineBounds(wrapDiff(Math.atan2(dy, dx), phi), halfBeam);
      cells.push({ r: Math.sqrt(dx * dx + dy * dy), sLo, sHi });
    }
  }
  return { cells, phi };
}

/**
 * The target's extent along one direction `psi` (relative to the centroid
 * bearing). In the chart (ρ = range, λ = ρ·sin(bearing)) a lit cell at
 * (r, a) can only have come from a source in the reverse sector ρ ∈
 * [r ± pulse/2], bearing ∈ [a ± beam/2]; the projection ρ·(cos ψ +
 * sin(bearing)·sin ψ) is extremal at that sector's corners. Some source
 * reaches at least every cell's LOWEST possible projection and some source at
 * most every cell's HIGHEST, so the target's extent is ≥ max(low) −
 * min(high) (0 when they cross). Exact in range (no sag at the beam's
 * edges); near the observer the pulse's sideways drift (a cell pushed out
 * along its own ray) comes off too.
 */
function extentAlong(cells: readonly PolarCell[], psi: number, halfPulse: number): number {
  const cp = Math.cos(psi);
  const sp = Math.sin(psi);
  let hi = -Infinity;
  let lo = Infinity;
  for (const c of cells) {
    const r1 = Math.max(0, c.r - halfPulse);
    const r2 = c.r + halfPulse;
    const gLo = cp + (sp >= 0 ? c.sLo : c.sHi) * sp;
    const gHi = cp + (sp >= 0 ? c.sHi : c.sLo) * sp;
    hi = Math.max(hi, Math.min(r1 * gLo, r2 * gLo));
    lo = Math.min(lo, Math.max(r1 * gHi, r2 * gHi));
  }
  return Math.max(0, hi - lo);
}

/**
 * THE DE-SMEARED EXTENTS of an arc'd mask seen from (ox, oy): the target's
 * extent in u (between lit-cell CENTRES — no +1 cell) along each of `n`
 * world directions kπ/n (k = 0 … n−1; k = 0 is the lattice x axis, k = n/2
 * the y axis), with a beam of `beamRad` and a pulse of `pulseU` taken off
 * every lit cell at its own range (`extentAlong`). Lattice-anchored because
 * the fuzz's dilation and stretch run along the lattice. Pure; an empty
 * mask, a non-finite observer or `n < 1` answers zeros.
 */
export function desmearedExtents(cov: HullCoverage, ox: number, oy: number, cellU: number, beamRad: number, pulseU: number, n: number): number[] {
  const count = Number.isInteger(n) && n > 0 ? n : 0;
  const out = new Array<number>(count).fill(0);
  if (!Number.isFinite(ox) || !Number.isFinite(oy) || coverageCellCount(cov) === 0) return out;
  const { cells, phi } = polarCells(cov, ox, oy, cellU, axis(beamRad) / 2);
  for (let k = 0; k < count; k++) out[k] = extentAlong(cells, (k * Math.PI) / count - phi, axis(pulseU) / 2);
  return out;
}
