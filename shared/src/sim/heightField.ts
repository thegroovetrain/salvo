// THE HEIGHT FIELD (cycle 59) — domain-warped fBm + ridged multifractal +
// region term, minus a radial falloff and the keep-clear masks. ONE field: sea
// level and every elevation contour are isolines of it, so island SHAPE and
// island ELEVATION stop being two systems.
//
// This module owns three things:
//   1. `TERRAIN_PARAMS` — the single tuning panel for map generation.
//   2. `buildField()`   — the continuous field on a regular grid (Float32).
//   3. `buildHeightRaster()` — the RETAINED, quantized Uint8 height raster plus
//      its max-height pyramid, which is the substrate a future cycle raymarches
//      for radar shadows (Eric ruling 2026-08-06).
//
// COST STRUCTURE. Noise is ~17ns a sample, so WHERE each term is evaluated is
// the whole performance story. Three separate economies are at work:
//
//  1. The domain warp and the region term have wavelengths of 420-2400u, so
//     they ride a grid `coarseFactor` times coarser and are bilinearly
//     upsampled — 16x fewer samples for terms an order of magnitude away from
//     their own Nyquist limit.
//  2. `refine` (on by default) evaluates the WHOLE field on a half-resolution
//     grid first, then pays full resolution only inside a band around the
//     isolines that will actually be extracted. Every value the generator ever
//     compares against a level is a true full-resolution sample; the flat
//     interior of a landmass and the empty middle of the ocean — which is most
//     of the disc — are interpolated, because nothing reads them.
//  3. The morphology and the blur run only inside that same band. A min/max
//     filter far from every isoline cannot change any mask bit.
//
// Everything is evaluated only INSIDE the map disc (78% of the bounding square).
//
// DETERMINISM: no transcendental call appears anywhere in this file (no sin,
// cos, tan, pow, exp, log, hypot, atan2) and no unseeded randomness. That is
// what makes the ocean byte-identical across V8 and JavaScriptCore.
// `shared/src/__tests__/heightField.test.ts` reads this file and enforces it.

import { CONFIG } from '../constants.js';
import { fbm, makeLayer, perlin, ridged } from './noise.js';

// ============================================================================
// THE TUNING PANEL. Everything the owner would adjust by eye lives here, and
// ONLY here — map generation must not grow a second parameter module.
// Lengths are WORLD UNITS (u); the production map disc is radius 2400.
// Values are the tuned prototype set (tmp-fbm/params.mjs), approved by eye;
// changing a number changes the ocean.
// ============================================================================

/** Every generation tunable. See `TERRAIN_PARAMS` for the ratified values. */
export interface TerrainParams {
  // --- Sampling -------------------------------------------------------------
  /** Height-field sample spacing (u). THE cost/quality dial: cost is O(1/cell^2)
   *  and it also sets the minimum coastline feature size (with morphOpen/Close). */
  cell: number;
  /** Low-frequency terms (warp, region) are evaluated on a grid this many times
   *  coarser and bilinearly upsampled. 4 => 16x fewer samples for those terms. */
  coarseFactor: number;
  /** Evaluate the field coarsely first and pay full resolution only in a band
   *  around the isolines. false = brute-force full resolution everywhere. */
  refine: boolean;
  /** Band half-width in COARSE cells around every isoline that gets extracted. */
  refineBand: number;
  /** Opening radius in CELLS: erases LAND spits thinner than ~2*cell. */
  morphOpen: number;
  /** Closing radius in CELLS: erases WATER inlets thinner than ~2*cell.
   *  Larger than the opening because a thin water gap is what pinches the
   *  interpolated isoline into a needle, and any channel below ~47u is
   *  unnavigable anyway (navClear 23.5). */
  morphClose: number;
  /** Binomial blur passes after the morphology (removes its axis-aligned steps). */
  smoothPasses: number;

  // --- Domain warp (the single biggest quality lever) ------------------------
  warpWavelength: number;
  warpOctaves: number;
  /** How far the sample point is displaced (u) at the long scale. */
  warpAmount: number;
  /** Second, shorter warp: puts the kinks and hooks into headlands. */
  warp2Wavelength: number;
  warp2Amount: number;

  // --- Field composition ----------------------------------------------------
  /** Ridged multifractal — SPINES, ARMS and HOOKS. */
  ridgeWavelength: number;
  ridgeOctaves: number;
  ridgeWeight: number;
  ridgePersistence: number;
  /** Plain fBm — the ROUNDED LOBES that make up the body of a landmass. */
  lobeWavelength: number;
  lobeOctaves: number;
  lobeWeight: number;
  lobePersistence: number;
  /** Coastal detail — headlands and coves at the scale a captain sails past. */
  detailWavelength: number;
  detailOctaves: number;
  detailPersistence: number;
  detailWeight: number;
  /** Very-low-frequency region term: decides WHERE land clusters, so the ocean
   *  gets real empty quarters instead of an even sprinkle. */
  regionWavelength: number;
  regionOctaves: number;
  regionWeight: number;

  // --- Falloff / masks (fractions of map radius unless noted) ---------------
  /** Land thins to nothing between these radii. */
  edgeStart: number;
  edgeEnd: number;
  edgePenalty: number;
  /** Open water kept around the map centre. */
  centerRadius: number;
  centerFeather: number;
  centerPenalty: number;
  /** Spawn-ring keep-clear annulus half-width in WORLD UNITS. Must comfortably
   *  exceed spawnMargin (64u) after coastline interpolation. */
  ringHalfWidth: number;
  ringPenalty: number;

  // --- Sea level ------------------------------------------------------------
  /** Land coverage target as a fraction of the map disc (band is [0.02, 0.03]). */
  coverTarget: number;
  coverMin: number;
  coverMax: number;

  // --- Coastline extraction (consumed by sim/map.ts) ------------------------
  /** Visvalingam effective-area tolerance (u^2): detail floor. */
  simplifyArea: number;
  /** Target coastline vertex SPACING (u). THE vertex-budget dial. */
  vertSpacing: number;
  /** Nothing may exceed this many verts, however big the landmass. */
  vertHardCap: number;
  minVerts: number;
  /** Islands smaller than this (u^2) are dropped as sub-rock specks. */
  minIslandArea: number;

  // --- Elevation contours (CLIENT-ONLY: the server never builds these) ------
  /** Build contour isolines at all. false => the refinement band is the
   *  coastline alone, which is most of the server/client cost difference. */
  contours: boolean;
  /** Isolines ABOVE sea level (3 => 4 bands, the ratified cap). */
  contourLevels: number;
  /** Field step between contour levels, as a fraction of (fieldMax - seaLevel). */
  contourStep: number;
  contourSimplifyArea: number;
  contourMaxVerts: number;
  contourMinArea: number;

  // --- Navigability (consumed by sim/map.ts; mirrors MAP_RULES) -------------
  /** WIDEST_BEAM/2 + NAV_MARGIN = 35/2 + 6. */
  navClear: number;
  /** Extra cells of clearance the closure demands, because its distance is
   *  measured to land SAMPLES while the sim collides with the interpolated
   *  isoline up to a cell nearer the water. */
  navPadCells: number;
  /** Repair iterations against the ratified 32u navigability check. */
  navRepairAttempts: number;
  /** Radius (u) of the land dome welded onto an offending nav cell. */
  navRepairRadius: number;
  spawnMargin: number;
}

/** The ratified, eye-approved generation parameters. */
export const TERRAIN_PARAMS: TerrainParams = {
  cell: 14,
  coarseFactor: 4,
  refine: true,
  refineBand: 2,
  morphOpen: 1,
  morphClose: 2,
  smoothPasses: 1,

  warpWavelength: 1500,
  warpOctaves: 2,
  warpAmount: 240,
  warp2Wavelength: 420,
  warp2Amount: 140,

  ridgeWavelength: 1100,
  ridgeOctaves: 4,
  ridgeWeight: 0.24,
  ridgePersistence: 0.5,
  lobeWavelength: 820,
  lobeOctaves: 5,
  lobeWeight: 0.76,
  lobePersistence: 0.68,
  detailWavelength: 250,
  detailOctaves: 3,
  detailPersistence: 0.5,
  detailWeight: 0.11,
  // The macro land-clustering term. UNLIKE every other wavelength here this
  // one is a statement about the BOARD, not about a feature size: it is sized
  // to span the map disc roughly once, so the field reads as one coherent
  // gradient (this side of the ocean is islandier than that side) rather than
  // as a repeating pattern. It therefore TRACKS THE MAP RADIUS — when Story
  // 5.6 grew the board 2400 → 2800 (epic-5 amendment 42), leaving this at the
  // old literal would have started repeating the region term across the map.
  // Every other wavelength above is a real feature scale and deliberately does
  // NOT scale with the board.
  regionWavelength: CONFIG.map.baseRadius,
  regionOctaves: 2,
  regionWeight: 0.05,

  edgeStart: 0.86,
  edgeEnd: 0.97,
  edgePenalty: 0.85,
  centerRadius: 0.08,
  centerFeather: 0.1,
  centerPenalty: 0.25,
  ringHalfWidth: 150,
  ringPenalty: 0.9,

  coverTarget: 0.025,
  coverMin: 0.02,
  coverMax: 0.03,

  simplifyArea: 8,
  vertSpacing: 14,
  vertHardCap: 92,
  minVerts: 7,
  minIslandArea: 1200,

  contours: true,
  contourLevels: 3,
  contourStep: 0.3,
  contourSimplifyArea: 70,
  contourMaxVerts: 44,
  contourMinArea: 900,

  navClear: 23.5,
  navPadCells: 1,
  navRepairAttempts: 4,
  navRepairRadius: 26,
  spawnMargin: 64,
};

// ============================================================================
// The field
// ============================================================================

/** A height field on a regular grid: `v[j*n+i]` at `(x0+i*cell, y0+j*cell)`. */
export interface HeightField {
  readonly n: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly v: Float32Array;
}

/** Grid geometry shared by every pass. */
interface GridSpec {
  readonly n: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly radius: number;
}

type EvalAt = (x: number, y: number) => number;

/** fine cells per coarse cell in the refinement pass (n-1 is even by construction). */
const REFINE_STEP = 2;

/** Smoothstep on t in [0,1] (polynomial — no transcendentals). */
function smooth01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/**
 * Sample `fn` on a grid `step` apart covering [x0, x0+span] and return a
 * bilinear sampler in WORLD coordinates.
 */
function coarseLayer(x0: number, y0: number, span: number, step: number, fn: EvalAt): EvalAt {
  const cn = Math.ceil(span / step) + 2;
  const g = new Float64Array(cn * cn);
  for (let j = 0; j < cn; j++) {
    const y = y0 + j * step;
    for (let i = 0; i < cn; i++) g[j * cn + i] = fn(x0 + i * step, y);
  }
  const inv = 1 / step;
  return (x: number, y: number): number => {
    const ci = (x - x0) * inv;
    const cj = (y - y0) * inv;
    const i0 = Math.min(cn - 2, Math.max(0, ci | 0));
    const j0 = Math.min(cn - 2, Math.max(0, cj | 0));
    const tx = ci - i0;
    const ty = cj - j0;
    const a = g[j0 * cn + i0];
    const b = g[j0 * cn + i0 + 1];
    const c = g[(j0 + 1) * cn + i0];
    const d = g[(j0 + 1) * cn + i0 + 1];
    const t = a + (b - a) * tx;
    const u = c + (d - c) * tx;
    return t + (u - t) * ty;
  };
}

/** The eight independent noise layers, decorrelated off one map seed. */
function makeLayers(seed: number): Record<string, Uint8Array> {
  return {
    warpX: makeLayer((seed ^ 0x1b873593) | 0),
    warpY: makeLayer((seed ^ 0xcc9e2d51) | 0),
    warp2X: makeLayer((seed ^ 0x7feb352d) | 0),
    warp2Y: makeLayer((seed ^ 0x846ca68b) | 0),
    ridge: makeLayer((seed ^ 0x2545f491) | 0),
    lobe: makeLayer((seed ^ 0x9e3779b1) | 0),
    detail: makeLayer((seed ^ 0xc2b2ae35) | 0),
    region: makeLayer((seed ^ 0x51afd7ed) | 0),
  };
}

/** The two coarse-grid samplers: the two-scale domain warp and the region term. */
function makeCoarseTerms(
  L: Record<string, Uint8Array>,
  P: TerrainParams,
  gs: GridSpec,
  span: number,
): { warpX: EvalAt; warpY: EvalAt; region: EvalAt } {
  const iWarp = 1 / P.warpWavelength;
  const iWarp2 = 1 / P.warp2Wavelength;
  const iRegion = 1 / P.regionWavelength;
  const step = P.cell * P.coarseFactor;
  const { x0, y0 } = gs;
  return {
    warpX: coarseLayer(x0, y0, span, step, (x, y) =>
      fbm(x * iWarp, y * iWarp, L.warpX, P.warpOctaves, 0.5) * P.warpAmount +
      perlin(x * iWarp2, y * iWarp2, L.warp2X) * P.warp2Amount),
    warpY: coarseLayer(x0, y0, span, step, (x, y) =>
      fbm(x * iWarp, y * iWarp, L.warpY, P.warpOctaves, 0.5) * P.warpAmount +
      perlin(x * iWarp2, y * iWarp2, L.warp2Y) * P.warp2Amount),
    region: coarseLayer(x0, y0, span, step, (x, y) =>
      fbm(x * iRegion, y * iRegion, L.region, P.regionOctaves, 0.5)),
  };
}

/** Everything a point evaluation needs: noise layers, reciprocals, samplers. */
function makeEvaluator(seed: number, spawnRing: number, P: TerrainParams, gs: GridSpec, span: number): EvalAt {
  const L = makeLayers(seed);
  const { warpX, warpY, region } = makeCoarseTerms(L, P, gs, span);

  const iRidge = 1 / P.ridgeWavelength;
  const iLobe = 1 / P.lobeWavelength;
  const iDetail = 1 / P.detailWavelength;
  const invR = 1 / gs.radius;
  const edgeSpan = 1 / (P.edgeEnd - P.edgeStart);
  const invFeather = 1 / P.centerFeather;
  const invRing = 1 / P.ringHalfWidth;

  return function evalAt(x: number, y: number): number {
    const px = x + warpX(x, y);
    const py = y + warpY(x, y);
    const rg = ridged(px * iRidge, py * iRidge, L.ridge, P.ridgeOctaves, P.ridgePersistence);
    const lb = 0.5 + 0.5 * fbm(px * iLobe, py * iLobe, L.lobe, P.lobeOctaves, P.lobePersistence);
    let h = P.ridgeWeight * rg + P.lobeWeight * lb + P.regionWeight * region(x, y);
    // Coastal detail: short-wavelength power that only ever moves the isoline,
    // never the gross landmass. This is what turns a smooth oval into headlands
    // and coves at the 80-250u scale a captain actually sails.
    if (P.detailWeight > 0) {
      h += P.detailWeight * fbm(px * iDetail, py * iDetail, L.detail, P.detailOctaves, P.detailPersistence);
    }
    const d = Math.sqrt(x * x + y * y) * invR;
    h -= P.edgePenalty * smooth01((d - P.edgeStart) * edgeSpan);
    h -= P.centerPenalty * smooth01((P.centerRadius + P.centerFeather - d) * invFeather);
    const dr = d * gs.radius - spawnRing;
    h -= P.ringPenalty * smooth01((P.ringHalfWidth - (dr < 0 ? -dr : dr)) * invRing);
    return h;
  };
}

/** Rank-select the value with `cover` of the (in-disc) samples above it. */
function levelAtRank(vals: Float64Array, count: number, cover: number, bins = 2048): { level: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = vals[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const hist = new Int32Array(bins);
  const scale = (bins - 1) / (max - min);
  for (let i = 0; i < count; i++) hist[((vals[i] - min) * scale) | 0]++;
  const want = Math.round(cover * count);
  let acc = 0;
  for (let b = bins - 1; b >= 0; b--) {
    acc += hist[b];
    if (acc >= want) return { level: min + b / scale, max };
  }
  return { level: min, max };
}

/** Brute-force path: a true sample at every grid point inside the disc. */
function fullResolution(v: Float32Array, gs: GridSpec, evalAt: EvalAt): void {
  const { n, cell, x0, y0 } = gs;
  const r2 = gs.radius * gs.radius;
  for (let j = 0; j < n; j++) {
    const y = y0 + j * cell;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * cell;
      v[j * n + i] = x * x + y * y > r2 ? -1 : evalAt(x, y);
    }
  }
}

/**
 * Build the height field on a regular grid covering the map disc.
 * Values outside the disc are pushed deep negative.
 */
export function buildField(
  seed: number,
  radius: number,
  spawnRing: number,
  P: TerrainParams = TERRAIN_PARAMS,
): HeightField {
  const cell = P.cell;
  const half = Math.ceil((radius + cell * 2) / cell);
  const n = half * 2 + 1;
  const x0 = -half * cell;
  const gs: GridSpec = { n, cell, x0, y0: x0, radius };
  const span = (n - 1) * cell;
  const evalAt = makeEvaluator(seed, spawnRing, P, gs, span);
  const v = new Float32Array(n * n);

  let band: Uint8Array | null = null;
  if (P.refine === false) fullResolution(v, gs, evalAt);
  else band = coarseThenRefine(v, gs, evalAt, P);

  conditionField(v, n, band, P);
  return { n, cell, x0, y0: x0, v };
}

/**
 * MINIMUM FEATURE SIZE. A thresholded field can put its isoline anywhere inside
 * a cell, so nothing stops it carving a water inlet 0.3u wide or a land spit
 * thinner than one tick of ship motion. Both are fatal: the spit breaks
 * nearest-boundary push-out (penetration would exceed the local reach) and the
 * inlet renders as a needle. A greyscale morphological OPENING (min then max)
 * erases land features thinner than the structuring element and the CLOSING
 * that follows erases water features thinner than it — one cheap pair that
 * bounds the local feature size from BOTH sides at ~1 cell, and does it on the
 * FIELD, so the isoline stays a smooth interpolated curve instead of a
 * staircase off a hacked-about mask.
 *
 * The square structuring element leaves axis-aligned steps on the isoline; one
 * binomial blur pass removes them without touching any feature the morphology
 * was meant to keep. Do NOT drop that pass.
 */
function conditionField(v: Float32Array, n: number, band: Uint8Array | null, P: TerrainParams): void {
  const scratch = new Float32Array(n * n);
  if (P.morphOpen > 0) {
    boxFilter(v, scratch, n, P.morphOpen, band, false); // erode land
    boxFilter(v, scratch, n, P.morphOpen, band, true); //  dilate back => OPENING
  }
  if (P.morphClose > 0) {
    boxFilter(v, scratch, n, P.morphClose, band, true); // dilate
    boxFilter(v, scratch, n, P.morphClose, band, false); // erode back => CLOSING
  }
  for (let p = 0; p < P.smoothPasses; p++) blur3(v, scratch, n, band);
}

/**
 * Evaluate the field on a half-resolution grid, upsample it, then pay full
 * resolution only where an isoline can land. Returns the fine-grid band mask.
 *
 * The band is built on the COARSE grid — every coarse cell whose corners
 * straddle any level the generator will extract (sea level plus the contour
 * levels) — and then dilated by `refineBand` coarse cells. The dilation is what
 * makes it safe: an isoline can only move by the refinement's own correction,
 * which is bounded by the local field variation over one coarse cell, and the
 * band is several coarse cells wider than that on both sides.
 */
function coarseThenRefine(v: Float32Array, gs: GridSpec, evalAt: EvalAt, P: TerrainParams): Uint8Array {
  const { cn, vc, vals, m } = sampleCoarse(gs, evalAt);
  const levels = provisionalLevels(vals, m, P);
  const mark = dilate(markStraddling(vc, cn, levels), cn, P.refineBand);
  upsampleCoarse(v, gs, vc, cn);
  return refineBand(v, gs, evalAt, mark, cn);
}

/** The half-resolution pass: the whole disc, `REFINE_STEP` cells apart. */
function sampleCoarse(
  gs: GridSpec,
  evalAt: EvalAt,
): { cn: number; vc: Float64Array; vals: Float64Array; m: number } {
  const cn = (gs.n - 1) / REFINE_STEP + 1;
  const ccell = gs.cell * REFINE_STEP;
  const vc = new Float64Array(cn * cn);
  const vals = new Float64Array(cn * cn);
  const r2 = gs.radius * gs.radius;
  let m = 0;
  for (let j = 0; j < cn; j++) {
    const y = gs.y0 + j * ccell;
    for (let i = 0; i < cn; i++) {
      const x = gs.x0 + i * ccell;
      if (x * x + y * y > r2) {
        vc[j * cn + i] = -1;
        continue;
      }
      const h = evalAt(x, y);
      vc[j * cn + i] = h;
      vals[m++] = h;
    }
  }
  return { cn, vc, vals, m };
}

/**
 * Provisional levels from the coarse field: sea level plus the contours.
 * Contour isolines only need full resolution when contours are actually built.
 * The SERVER never builds them, so its band is the coastline alone — which is
 * most of the difference between the server's cost and the client's.
 */
function provisionalLevels(vals: Float64Array, m: number, P: TerrainParams): number[] {
  const { level: sea, max } = levelAtRank(vals, m, P.coverTarget);
  const levels = [sea];
  if (P.contours !== false) {
    for (let k = 1; k <= P.contourLevels; k++) levels.push(sea + (max - sea) * P.contourStep * k);
  }
  return levels;
}

/** True iff the coarse cell at `k` has any of `levels` between its corner min and max. */
function straddles(vc: Float64Array, k: number, cn: number, levels: readonly number[]): boolean {
  const a = vc[k];
  const b = vc[k + 1];
  const c = vc[k + cn];
  const d = vc[k + cn + 1];
  const lo = Math.min(a, b, c, d);
  const hi = Math.max(a, b, c, d);
  for (const L of levels) {
    if (lo <= L && hi >= L) return true;
  }
  return false;
}

/** Coarse cells straddling any extracted level. */
function markStraddling(vc: Float64Array, cn: number, levels: readonly number[]): Uint8Array {
  const mark = new Uint8Array(cn * cn);
  for (let j = 0; j < cn - 1; j++) {
    for (let i = 0; i < cn - 1; i++) {
      const k = j * cn + i;
      if (straddles(vc, k, cn, levels)) mark[k] = 1;
    }
  }
  return mark;
}

/** Bilinearly upsample the coarse field over the whole fine grid. */
function upsampleCoarse(v: Float32Array, gs: GridSpec, vc: Float64Array, cn: number): void {
  const { n, cell, x0, y0 } = gs;
  const r2 = gs.radius * gs.radius;
  for (let j = 0; j < n; j++) {
    const cj = j / REFINE_STEP;
    const j0 = Math.min(cn - 2, cj | 0);
    const ty = cj - j0;
    const y = y0 + j * cell;
    for (let i = 0; i < n; i++) {
      const ci = i / REFINE_STEP;
      const i0 = Math.min(cn - 2, ci | 0);
      const tx = ci - i0;
      const a = vc[j0 * cn + i0];
      const b = vc[j0 * cn + i0 + 1];
      const c = vc[(j0 + 1) * cn + i0];
      const d = vc[(j0 + 1) * cn + i0 + 1];
      const t = a + (b - a) * tx;
      const u = c + (d - c) * tx;
      const x = x0 + i * cell;
      v[j * n + i] = x * x + y * y > r2 ? -1 : t + (u - t) * ty;
    }
  }
}

/** Overwrite the marked band with true full-resolution samples; return the mask. */
function refineBand(v: Float32Array, gs: GridSpec, evalAt: EvalAt, mark: Uint8Array, cn: number): Uint8Array {
  const { n, cell, x0, y0 } = gs;
  const r2 = gs.radius * gs.radius;
  const band = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    const cj = Math.min(cn - 1, (j / REFINE_STEP) | 0);
    const y = y0 + j * cell;
    for (let i = 0; i < n; i++) {
      const ci = Math.min(cn - 1, (i / REFINE_STEP) | 0);
      if (!mark[cj * cn + ci]) continue;
      const x = x0 + i * cell;
      if (x * x + y * y > r2) continue;
      band[j * n + i] = 1;
      v[j * n + i] = evalAt(x, y);
    }
  }
  return band;
}

/** Dilate a boolean mask by `r` cells (chessboard), r passes of 8-neighbour. */
function dilate(mask: Uint8Array, n: number, r: number): Uint8Array {
  let cur = mask;
  for (let p = 0; p < r; p++) {
    const out = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!cur[j * n + i]) continue;
        const j1 = Math.max(0, j - 1);
        const j2 = Math.min(n - 1, j + 1);
        const i1 = Math.max(0, i - 1);
        const i2 = Math.min(n - 1, i + 1);
        for (let b = j1; b <= j2; b++) for (let a = i1; a <= i2; a++) out[b * n + a] = 1;
      }
    }
    cur = out;
  }
  return cur;
}

/** Min or max over the [i1,i2]x[j1,j2] window of `src`. */
function windowExtreme(
  src: Float32Array,
  n: number,
  i1: number,
  i2: number,
  j1: number,
  j2: number,
  wantMax: boolean,
): number {
  let m = src[j1 * n + i1];
  for (let b = j1; b <= j2; b++) {
    const row = b * n;
    for (let a = i1; a <= i2; a++) {
      const w = src[row + a];
      if (wantMax ? w > m : w < m) m = w;
    }
  }
  return m;
}

/**
 * Non-separable square min/max filter of radius `r`, restricted to `band`
 * (null = whole grid). Non-separable because the banded form has no contiguous
 * runs to exploit, and at r = 1 that is 9 reads against a separable pair's 6
 * plus a full-grid intermediate — the band restriction is worth an order of
 * magnitude more than separability.
 */
function boxFilter(
  v: Float32Array,
  tmp: Float32Array,
  n: number,
  r: number,
  band: Uint8Array | null,
  wantMax: boolean,
): void {
  tmp.set(v);
  for (let j = 0; j < n; j++) {
    const j1 = Math.max(0, j - r);
    const j2 = Math.min(n - 1, j + r);
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (band !== null && !band[k]) continue;
      v[k] = windowExtreme(tmp, n, Math.max(0, i - r), Math.min(n - 1, i + r), j1, j2, wantMax);
    }
  }
}

/** 3x3 binomial blur restricted to `band` (null = whole grid). */
function blur3(v: Float32Array, tmp: Float32Array, n: number, band: Uint8Array | null): void {
  tmp.set(v);
  for (let j = 0; j < n; j++) {
    const jm = Math.max(0, j - 1) * n;
    const jc = j * n;
    const jp = Math.min(n - 1, j + 1) * n;
    for (let i = 0; i < n; i++) {
      if (band !== null && !band[jc + i]) continue;
      const im = Math.max(0, i - 1);
      const ip = Math.min(n - 1, i + 1);
      v[jc + i] =
        (tmp[jm + im] + 2 * tmp[jm + i] + tmp[jm + ip] +
          2 * (tmp[jc + im] + 2 * tmp[jc + i] + tmp[jc + ip]) +
          tmp[jp + im] + 2 * tmp[jp + i] + tmp[jp + ip]) / 16;
    }
  }
}

// ============================================================================
// The retained height raster + max-height pyramid
//
// WHY THIS EXISTS (Eric ruling 2026-08-06). Elevation is NOT gameplay-
// authoritative this cycle — nothing reads what follows yet. It is built now
// because a future cycle computes RADAR SHADOWS as a hierarchical raymarch
// against exactly this data, and retrofitting the storage later is the
// expensive path. The contour polygons the client draws are a RENDERING
// artifact and are not the authority on height.
//
// The intended consumer: march the sightline observer -> target in world steps;
// at each step ask `tileCeiling(raster, level, ti, tj)` at a coarse level first.
// If the tile's ceiling is below the sightline's height there, the whole tile is
// transparent and the march skips it in ONE test — open water costs almost
// nothing. Only where the ceiling rises above the ray does the march descend a
// level, ending at `sampleHeight()`, an O(1) array read. Both sides rebuild the
// raster from the seed; it never travels on the wire (~118KB at 14u cells,
// ~40KB more for the pyramid).
// ============================================================================

/** One pyramid level: `cells[j*n+i]` is the max height of its <=2x2 children. */
export interface PyramidLevel {
  readonly n: number;
  readonly cells: Uint8Array;
}

/** The retained, quantized height raster and its max-height pyramid. */
export interface HeightRaster {
  readonly n: number;
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  /** Field value that quantizes to 0. */
  readonly seaLevel: number;
  /** Field value that quantizes to 255. */
  readonly peak: number;
  /** Level-0 heights, 0 = sea level, 255 = `peak`. Aliases `pyramid[0].cells`. */
  readonly height: Uint8Array;
  /** `pyramid[0]` is the raster itself; each level above is the max of its children. */
  readonly pyramid: readonly PyramidLevel[];
}

/** Quantized height of a point at or below sea level. */
export const SEA_HEIGHT = 0;

/** Max over the <=2x2 children of coarse cell (i,j) in `lv`. */
function maxOfChildren(lv: PyramidLevel, i: number, j: number): number {
  const n = lv.n;
  const i1 = Math.min(i * 2 + 1, n - 1);
  const j1 = Math.min(j * 2 + 1, n - 1);
  let m = 0;
  for (let b = j * 2; b <= j1; b++) {
    for (let a = i * 2; a <= i1; a++) {
      const w = lv.cells[b * n + a];
      if (w > m) m = w;
    }
  }
  return m;
}

/** Build the max-height pyramid over `base` (level 0), halving to a 1x1 root. */
function buildPyramid(base: Uint8Array, n: number): PyramidLevel[] {
  const levels: PyramidLevel[] = [{ n, cells: base }];
  let cur = levels[0];
  while (cur.n > 1) {
    const m = (cur.n + 1) >> 1;
    const cells = new Uint8Array(m * m);
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < m; i++) cells[j * m + i] = maxOfChildren(cur, i, j);
    }
    cur = { n: m, cells };
    levels.push(cur);
  }
  return levels;
}

/** Highest field value on the grid (out-of-disc cells sit deep negative). */
function fieldPeak(v: Float32Array): number {
  let max = -Infinity;
  for (let i = 0; i < v.length; i++) {
    if (v[i] > max) max = v[i];
  }
  return max;
}

/**
 * Quantize `field` to Uint8 above `seaLevel` and build the max-height pyramid.
 * Call this AFTER sea level is chosen and after any generation-time repair to
 * the field, so the raster agrees with the coastline that shipped.
 *
 * `land` (optional, 0/1 per sample) is the shipped LAND MASK — the raster's
 * land/water authority. The lagoon-closure pass flips unreachable water to
 * land in the MASK only (islandShape.ts closeUnreachableWater), deliberately
 * leaving the FIELD untouched (raising the field would feed back into every
 * later re-extraction and move real coastline crossings). Quantizing the raw
 * field therefore reads a closure-sealed lagoon — solid land on the shipped
 * coastline — as height 0, transparent sea, and a future radar-shadow
 * raymarch would see water inside land. Stamping every masked land sample to
 * the MINIMUM land height (1) restores the exact invariant
 * `height[i] > 0 ⟺ the shipped mask says LAND`: closure fill is a topology
 * REPAIR whose elevation the field never defined, so barely-above-sea is the
 * honest value — solid, but low. (Water samples can never read > 0: the mask
 * calls a sample WATER precisely when its field value is below sea level.)
 */
export function buildHeightRaster(
  field: HeightField,
  seaLevel: number,
  peak?: number,
  land?: Uint8Array,
): HeightRaster {
  const { n, cell, x0, y0, v } = field;
  const top = peak ?? fieldPeak(v);
  const span = top > seaLevel ? top - seaLevel : 1;
  const scale = 255 / span;
  const height = new Uint8Array(n * n);
  for (let i = 0; i < height.length; i++) {
    const q = Math.round((v[i] - seaLevel) * scale);
    let h = Math.min(255, Math.max(0, q));
    if (h === 0 && land !== undefined && land[i] !== 0) h = 1; // closure-sealed land
    height[i] = h;
  }
  return { n, cell, x0, y0, seaLevel, peak: seaLevel + span, height, pyramid: buildPyramid(height, n) };
}

/** Grid index of the sample nearest world coordinate `w` along an axis. */
function indexOf(w: number, origin: number, cell: number): number {
  return Math.round((w - origin) / cell);
}

/** O(1) quantized height at a world point. Off-raster reads clamp to sea level. */
export function sampleHeight(r: HeightRaster, x: number, y: number): number {
  const i = indexOf(x, r.x0, r.cell);
  const j = indexOf(y, r.y0, r.cell);
  if (i < 0 || j < 0 || i >= r.n || j >= r.n) return SEA_HEIGHT;
  return r.height[j * r.n + i];
}

/** Convert a quantized height back to a field value. */
export function fieldValueOf(r: HeightRaster, q: number): number {
  return r.seaLevel + (q / 255) * (r.peak - r.seaLevel);
}

/** World size of one tile at pyramid `level` (level 0 = one grid cell). */
export function tileSize(r: HeightRaster, level: number): number {
  return r.cell * (1 << level);
}

/** Tile index along x/y for a world coordinate at pyramid `level`. */
export function tileIndexX(r: HeightRaster, level: number, x: number): number {
  return indexOf(x, r.x0, r.cell) >> level;
}
export function tileIndexY(r: HeightRaster, level: number, y: number): number {
  return indexOf(y, r.y0, r.cell) >> level;
}

/**
 * Ceiling of tile (ti, tj) at pyramid `level`: the tallest quantized height of
 * any sample inside it. Out-of-range tiles (and levels) read as sea level.
 */
export function tileCeiling(r: HeightRaster, level: number, ti: number, tj: number): number {
  if (level < 0 || level >= r.pyramid.length) return SEA_HEIGHT;
  const lv = r.pyramid[level];
  if (ti < 0 || tj < 0 || ti >= lv.n || tj >= lv.n) return SEA_HEIGHT;
  return lv.cells[tj * lv.n + ti];
}

/** Ceiling of the tile containing a world point, at pyramid `level`. */
export function tileCeilingAt(r: HeightRaster, level: number, x: number, y: number): number {
  return tileCeiling(r, level, tileIndexX(r, level, x), tileIndexY(r, level, y));
}
