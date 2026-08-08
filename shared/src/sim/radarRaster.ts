// THE SERVER-SIDE HULL RASTER (cycle 63, Eric ruling 2026-08-07, amendments
// 151-157) — the ONE pipeline that projects a true hull polygon onto the
// low-resolution radar grid and then FUZZES it into a radar return. It lives
// in shared/ because BOTH sides run it:
//
//   • the SERVER runs it in the `return`-grammar blip shaper (game/signals.ts)
//     to build the coverage footprint that goes on the wire — a fogged hull is
//     disclosed as "there is metal in these world cells" and NOTHING else
//     (no id, no class, no heading, no extent scalar; amendment 152);
//   • the CLIENT runs it on every sighted `Contact` (render/radarField.ts) so
//     the inside-truesight echo is built by the IDENTICAL code from the
//     identical inputs — two paint sources, one appearance (amendment 154).
//
// ONE CODE PATH IS THE INDISTINGUISHABILITY LAW (amendment 11): the decoy
// buoy's counter-intel paint is rasterized by this same pipeline from its
// frozen drop-time pose, so a lie is byte-for-byte a genuine footprint by
// construction rather than by parallel maintenance.
//
// THE MASK IS FUZZY BY RULING (cycle-63 review gate, amendments 156-157). The
// sharp rasterization made ship class FREE TO READ — at the shipped lattice
// all six hull envelopes (three captain classes + three drone sizes) had
// pairwise-distinct cell dimensions, a lookup table where amendment 68 ruled
// class must be "learnable ... because it should not be easy". Eric's ruling
// keeps the architecture and adds the RESOLUTION LOSS he had already described
// ("its not exact (the resolution is lower and radar is a bit fuzzy)"), as
// three physical mechanisms, applied in `fuzzCoverage`:
//   1. a coarser lattice (`CONFIG.vision.radarCellU`) — the set's real
//      range/azimuth resolution;
//   2. DILATION — the beam-width/pulse-length smear: a return is the target
//      convolved with the beam, always larger and blunter than the hull;
//   3. per-paint edge GLINT — a real echo scintillates, so the same hull
//      returns a slightly different shape sweep to sweep. Seeded PER PAINT,
//      NEVER PER SHIP (amendment 157): a stable per-ship jitter would hand
//      back the cross-sweep correlation handle amendment 152 removed with
//      `id`.
// Size and orientation still read — that is what the cycle exists to deliver
// (amendments 66 + 151) — and the calibration proving both lives in
// shared/src/__tests__/radarRaster.test.ts.
//
// GEOMETRY ONLY. No intensity, no falloff, no reflectivity, no observer: the
// footprint is a pure function of (hull id, pose, cell size, paint seed),
// which is what makes it world-anchored — every observer painting this hull
// this tick receives the identical mask, and moving the observer moves
// nothing.
//
// THE CELL SIZE IS `CONFIG.vision.radarCellU`, the shared radar grid
// resolution. It is gameplay-authoritative (it decides what the wire says),
// which is why it was promoted out of the client config; the client references
// it and never forks a second constant.

import { CONFIG, type HullId } from '../constants.js';
import { mulberry32 } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import { hullSilhouette, pointInPolygon, transformPolygon } from './silhouette.js';

/**
 * A hull's coverage footprint on the radar grid — the `return`-grammar wire
 * payload's spatial half (ReturnBlipEvent carries these five fields plus the
 * paint time).
 *
 * `gx`/`gy` are ABSOLUTE world cell indices of the rect's min corner
 * (`Math.floor(worldU / cellU)` — the same lattice the client's heatmap is
 * anchored to), so the footprint survives every client-side grid re-anchor.
 * `bits` is a packed row-major mask: cell (col, row) of the `w × h` rect is
 * bit `row * w + col`, 32 bits per word (SIGNED int32 — `|=` packing means a
 * word with bit 31 set serializes negative), LSB first. A fuzzed battleship
 * broadside at the shipped 9u cells is ~16×6 cells ≈ 3 words packed.
 */
export interface HullCoverage {
  /** Absolute world cell index (x axis) of the rect's min corner. */
  gx: number;
  /** Absolute world cell index (y axis) of the rect's min corner. */
  gy: number;
  /** Rect width in cells (≥ 1). */
  w: number;
  /** Rect height in cells (≥ 1). */
  h: number;
  /** Packed row-major coverage mask (bit `row * w + col`, 32/word, LSB-first). */
  bits: number[];
}

/** Bits per packed mask word. */
export const COVERAGE_WORD = 32;

/** Read one mask bit. Out-of-rect coordinates answer false (uncovered). */
export function coverageHas(c: HullCoverage, col: number, row: number): boolean {
  if (col < 0 || row < 0 || col >= c.w || row >= c.h) return false;
  const i = row * c.w + col;
  return ((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1;
}

/** Set one mask bit (builder-side helper; no bounds check — callers index
 *  inside the rect by construction). */
function setBit(bits: number[], i: number): void {
  bits[i >>> 5] |= 1 << (i & 31);
}

/** How many cells the mask covers (tests/diagnostics). */
export function coverageCellCount(c: HullCoverage): number {
  let n = 0;
  for (let i = 0, total = c.w * c.h; i < total; i++) {
    if (((c.bits[i >>> 5] >>> (i & 31)) & 1) === 1) n++;
  }
  return n;
}

/** Scratch polygon for the pose transform — consumed synchronously inside
 *  `rasterizeHullCoverage`, never retained, so the 20Hz server scan and the
 *  per-frame client stamp both stay allocation-light (the mask itself must be
 *  a fresh array: it goes on the wire / into a frozen paint). */
const POSE_SCRATCH: Vec2[] = [];

/** A 1×1 mask of the cell containing (x, y) — the fail-safe footprint. */
function centreCellCoverage(x: number, y: number, cellU: number): HullCoverage {
  return { gx: Math.floor(x / cellU), gy: Math.floor(y / cellU), w: 1, h: 1, bits: [1] };
}

/**
 * Project the true hull polygon onto the radar grid: every cell of the
 * polygon's bounding rect whose CENTRE lies inside the posed silhouette, plus
 * every cell the hull's bow→stern CENTRE-LINE passes through, plus — always —
 * the cell containing the hull's own centre. The centre-cell fail-safe is the
 * same rule the retired client stamp carried: a torpedo boat seen end-on is
 * narrower than a cell, and a return always lights the cell it is in, so a
 * mask can never be empty.
 *
 * THE SPINE RULE exists because centre-sampling alone fails thin hulls at the
 * cycle-63 lattice: a torpedo boat's 9u beam is exactly one 9u cell, so at
 * the lattice phase where the hull straddles a row boundary NO cell centre
 * falls inside it and a 100u hull collapsed to a 3-5 cell scatter — which is
 * amendment 151's complaint (a fogged hull that doesn't point where it is
 * moving) reintroduced by quantization. The bow→stern segment always
 * rasterizes the hull's long axis, at any phase, so orientation reads for
 * every hull the way the ruling requires; physically it is the statement
 * that the hull's structure returns regardless of where the range gate falls.
 *
 * THE SILHOUETTE IS THE FOOTPRINT (amendment 141, now server-side): the SHARED
 * polygon — the same one the hull renderer draws and the server hit-tests —
 * posed through the shared `transformPolygon` and tested with the shared
 * `pointInPolygon`. No polygon math is re-implemented here.
 *
 * An unknown hull id (impossible from a conforming caller — `HullId` is a
 * closed union) degrades to the centre-cell mask rather than throwing: this
 * runs inside the per-tick perception scan, where an exception would take the
 * whole frame down. A non-positive/non-finite `cellU` also degrades the same
 * way (a mask must never be built on a divide-by-zero lattice), and so does a
 * NON-FINITE POSE — the "never throws" contract used to stop one guard short:
 * a NaN/Infinity coordinate made `emptyRectFor` compute `w*h = Infinity` and
 * `new Array(Infinity)` raised inside the per-tick scan (cycle-63 review
 * gate). A non-finite x/y has no meaningful cell, so it degrades to the
 * origin's cell; a non-finite heading keeps the position and drops the pose.
 */
export function rasterizeHullCoverage(
  cls: HullId,
  x: number,
  y: number,
  heading: number,
  cellU: number,
): HullCoverage {
  const local = hullSilhouette(cls);
  const grid = cellU > 0 && cellU < Infinity ? cellU : 0;
  const degenerate = degenerateCoverage(local, x, y, heading, grid);
  if (degenerate !== null) return degenerate;
  const poly = transformPolygon(local!, x, y, heading, POSE_SCRATCH);
  const cover = emptyRectFor(poly, grid);
  fillCoverage(cover, poly, grid);
  fillSpine(cover, local!, x, y, heading, grid);
  // The fail-safe: the hull's own cell always lights. It is inside the rect by
  // construction TODAY (the origin sits inside the silhouette's bounding box),
  // but that invariant is unstated in the silhouette registry — a future
  // offset silhouette would index NEGATIVE here, wrap through `>>> 5` to a
  // ~134M word index, and put a 134-million-slot array on the wire. The bounds
  // check makes that unrepresentable (cycle-63 review gate): an out-of-rect
  // centre simply doesn't set the fail-safe bit, and `fillCoverage` has
  // already covered whatever the polygon truly covers.
  setBitInRect(cover, Math.floor(x / grid) - cover.gx, Math.floor(y / grid) - cover.gy);
  return cover;
}

/** The degrade ladder (see the main doc): a fail-soft single-cell mask for a
 *  degenerate lattice, an unknown hull, or a non-finite pose — or null when
 *  the inputs are healthy and the real rasterization should run. */
function degenerateCoverage(
  local: readonly Vec2[] | undefined,
  x: number,
  y: number,
  heading: number,
  grid: number,
): HullCoverage | null {
  const cell = grid === 0 ? 1 : grid;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return centreCellCoverage(0, 0, cell);
  if (local === undefined || grid === 0 || !Number.isFinite(heading)) return centreCellCoverage(x, y, cell);
  return null;
}

/** Set one mask bit iff (col, row) lies inside the rect. */
function setBitInRect(cover: HullCoverage, col: number, row: number): void {
  if (col >= 0 && row >= 0 && col < cover.w && row < cover.h) setBit(cover.bits, row * cover.w + col);
}

/** The polygon's cell-space bounding rect, with an all-zero mask. */
function emptyRectFor(poly: readonly Vec2[], cellU: number): HullCoverage {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const gx = Math.floor(minX / cellU);
  const gy = Math.floor(minY / cellU);
  const w = Math.floor(maxX / cellU) - gx + 1;
  const h = Math.floor(maxY / cellU) - gy + 1;
  return { gx, gy, w, h, bits: new Array<number>(Math.ceil((w * h) / COVERAGE_WORD)).fill(0) };
}

/** Mark every cell of the rect whose CENTRE lies inside the polygon. */
function fillCoverage(cover: HullCoverage, poly: readonly Vec2[], cellU: number): void {
  const probe = { x: 0, y: 0 };
  for (let row = 0; row < cover.h; row++) {
    probe.y = (cover.gy + row + 0.5) * cellU;
    for (let col = 0; col < cover.w; col++) {
      probe.x = (cover.gx + col + 0.5) * cellU;
      if (pointInPolygon(probe, poly)) setBit(cover.bits, row * cover.w + col);
    }
  }
}

/**
 * Rasterize the hull's bow→stern centre-line (the SPINE — see the
 * `rasterizeHullCoverage` doc for why): endpoints are the local silhouette's
 * ±x extremes on the symmetry axis, posed to world, walked in quarter-cell
 * steps (a step strictly under half a cell cannot skip a cell the segment
 * passes through on either axis). Every visited cell inside the rect is set;
 * the endpoints are inside the polygon's bounding rect by construction, so
 * the bounds check only trims float dust at the rim.
 */
function fillSpine(cover: HullCoverage, local: readonly Vec2[], x: number, y: number, heading: number, cellU: number): void {
  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of local) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const steps = Math.max(1, Math.ceil(((maxX - minX) / cellU) * 4));
  for (let i = 0; i <= steps; i++) {
    const lx = minX + ((maxX - minX) * i) / steps;
    const col = Math.floor((x + c * lx) / cellU) - cover.gx;
    const row = Math.floor((y + s * lx) / cellU) - cover.gy;
    if (col >= 0 && row >= 0 && col < cover.w && row < cover.h) setBit(cover.bits, row * cover.w + col);
  }
}

// ---------------------------------------------------------------------------
// THE FUZZ (cycle-63 review gate, amendments 156-157): dilation + per-paint
// edge glint, applied to the sharp geometric mask before anything consumes it.
// ---------------------------------------------------------------------------

/** Reused float-bits view for `paintSeed` — the hash reads the exact IEEE-754
 *  words of its inputs, so two poses a femto-unit apart seed differently. */
const SEED_F64 = new Float64Array(4);
const SEED_U32 = new Uint32Array(SEED_F64.buffer);

/**
 * THE PER-PAINT GLINT SEED (amendment 157): a hash of (paint time, exact pose).
 *
 * PER PAINT, NEVER PER SHIP — no ship id, track id or any other stable
 * identity enters the hash, so the jitter can never be a cross-sweep
 * correlation handle (the exact thing amendment 152 removed by dropping `id`
 * from the wire). Time is in the hash, so even a STATIONARY hull — or a decoy
 * buoy — draws a fresh glint every paint; and because the inputs are the EXACT
 * float pose while the wire carries only cell-quantized coverage, a modified
 * client cannot reconstruct the seed to invert the jitter and template-fit the
 * sharp mask back out.
 *
 * DETERMINISTIC AND OBSERVER-FREE by construction: every observer painting
 * this hull this tick derives the identical seed, so the wire mask stays
 * observer-independent (and per-(ship, tick) caching stays sound).
 */
export function paintSeed(t: number, x: number, y: number, heading: number): number {
  SEED_F64[0] = t;
  SEED_F64[1] = x;
  SEED_F64[2] = y;
  SEED_F64[3] = heading;
  let h = 0x9e3779b9;
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ SEED_U32[i], 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

/** The knobs `fuzzCoverage` runs on — `CONFIG.vision.radarFuzz` in production;
 *  a parameter so the calibration suite can probe the mechanism directly. */
export interface RadarFuzz {
  /** Per-side probability of one extra cell of smear (pulse-length spread). */
  stretchP: number;
  /** Per-cell drop probability on the smear fringe (glint erosion). */
  glintP: number;
}

/** Scratch grids for `fuzzCoverage` — consumed synchronously, never retained
 *  (the output mask is always freshly packed: it goes on the wire / into a
 *  frozen paint). Sized on demand; reused across calls. */
let FUZZ_CORE = new Uint8Array(0);
let FUZZ_WORK = new Uint8Array(0);

/**
 * FUZZ ONE COVERAGE MASK into a radar return (amendments 156-157). The
 * pipeline, in order — this exact sequence (including the RNG draw order) is
 * the wire contract the perception oracle reimplements:
 *
 *   1. Pad the rect by 2 cells per side; the input mask is the CORE and is
 *      never removed (so the mask can never be empty, the hull's own cell
 *      stays lit, and amendment 127's `minPeak` floor keeps a footprint to
 *      land on).
 *   2. DILATE by one cell, 8-neighbourhood — the beam-width smear. A return
 *      is the target convolved with the beam: always larger, always blunter.
 *   3. STRETCH: four draws in fixed order (−x, +x, −y, +y); each side that
 *      draws under `stretchP` shifts the DILATED mask one further cell that
 *      way (pulse-length scintillation of the envelope — this is what makes
 *      the mask's cell DIMENSIONS a per-paint random variable rather than a
 *      constant the lattice merely offsets).
 *   4. GLINT: row-major over the padded rect, every covered NON-CORE cell of
 *      that snapshot draws once and is dropped under `glintP` — the sweep-to-
 *      sweep facet shimmer that actually defeats template-fitting (dilation
 *      and the lattice only SHIFT the templates; erosion blurs them together).
 *   5. BRIDGE REPAIR, to a fixed point: any 2×2 block holding exactly one
 *      diagonal pair of covered cells gains a bridging cell, so the final
 *      mask is 4-CONNECTED BY CONSTRUCTION. This deliberately re-establishes
 *      the cycle-62 diagonal-bridging guarantee that was deleted with
 *      `stampEcho` (cycle-63 review gate): a thin hull on a diagonal heading
 *      rasterizes to a corner-connected staircase, and glint can re-open any
 *      corner dilation closed — without the repair, a march ray at ~45° falls
 *      through the gap and leaves pinholes in the paint.
 *   6. Crop to the tight bounding rect of what survived.
 */
export function fuzzCoverage(cov: HullCoverage, seed: number, fuzz: RadarFuzz): HullCoverage {
  const w = cov.w + 4;
  const h = cov.h + 4;
  if (FUZZ_CORE.length < w * h) {
    FUZZ_CORE = new Uint8Array(w * h);
    FUZZ_WORK = new Uint8Array(w * h);
  }
  const core = FUZZ_CORE.subarray(0, w * h).fill(0);
  const work = FUZZ_WORK.subarray(0, w * h).fill(0);
  for (let row = 0; row < cov.h; row++) {
    for (let col = 0; col < cov.w; col++) {
      if (coverageHas(cov, col, row)) core[(row + 2) * w + col + 2] = 1;
    }
  }
  dilate8(core, work, w, h);
  const rng = mulberry32(seed);
  stretchSides(work, w, h, rng.next() < fuzz.stretchP, rng.next() < fuzz.stretchP, rng.next() < fuzz.stretchP, rng.next() < fuzz.stretchP);
  glintErode(work, core, w, h, fuzz.glintP, rng);
  bridgeDiagonals(work, w, h);
  return cropToCoverage(work, w, h, cov.gx - 2, cov.gy - 2);
}

/** work = core dilated by one cell, 8-neighbourhood. Border cells of the
 *  padded rect are never core (2-cell pad), so no bounds checks are needed on
 *  the ±1 reads beyond clamping to the rect. */
function dilate8(core: Uint8Array, work: Uint8Array, w: number, h: number): void {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (core[row * w + col] === 0) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) work[(row + dy) * w + col + dx] = 1;
      }
    }
  }
}

/** Union each flagged side's one-cell shift of the dilated mask (the shifts
 *  read the PRE-stretch snapshot, so the four sides compose independently).
 *  The 2-cell pad guarantees the shifted cells stay inside the rect. */
function stretchSides(work: Uint8Array, w: number, h: number, negX: boolean, posX: boolean, negY: boolean, posY: boolean): void {
  const snap = work.slice();
  for (let row = 1; row < h - 1; row++) {
    for (let col = 1; col < w - 1; col++) {
      if (snap[row * w + col] === 0) continue;
      if (negX) work[row * w + col - 1] = 1;
      if (posX) work[row * w + col + 1] = 1;
      if (negY) work[(row - 1) * w + col] = 1;
      if (posY) work[(row + 1) * w + col] = 1;
    }
  }
}

/** Drop each covered non-core cell of the pre-erosion snapshot with
 *  probability `glintP`, in row-major order (the draw order is part of the
 *  contract — the oracle replays it). */
function glintErode(work: Uint8Array, core: Uint8Array, w: number, h: number, glintP: number, rng: { next(): number }): void {
  const snap = work.slice();
  for (let i = 0; i < w * h; i++) {
    if (snap[i] === 0 || core[i] === 1) continue;
    if (rng.next() < glintP) work[i] = 0;
  }
}

/** Close every diagonal-only adjacency: a 2×2 block with exactly one covered
 *  diagonal pair gains the block's top-right/top-left bridge cell. Repeats to
 *  a fixed point (each pass only ADDS cells, so it terminates; in practice one
 *  or two passes suffice on a hull-sized mask). */
function bridgeDiagonals(work: Uint8Array, w: number, h: number): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = 0; row < h - 1; row++) {
      for (let col = 0; col < w - 1; col++) {
        if (bridgeBlock(work, w, row * w + col)) changed = true;
      }
    }
  }
}

/** One 2×2 block: `i` is its top-left index. Returns true when a bridge cell
 *  was added. The `\` diagonal bridges through the top-right cell, the `/`
 *  diagonal through the top-left — a fixed, deterministic choice. */
function bridgeBlock(work: Uint8Array, w: number, i: number): boolean {
  const back = work[i] + work[i + w + 1]; // the `\` diagonal
  const fore = work[i + 1] + work[i + w]; // the `/` diagonal
  if (back === 2 && fore === 0) {
    work[i + 1] = 1;
    return true;
  }
  if (fore === 2 && back === 0) {
    work[i] = 1;
    return true;
  }
  return false;
}

/** Pack the surviving cells into a tight HullCoverage (fresh arrays — the
 *  result goes on the wire / into a frozen paint). The core is never eroded,
 *  so the mask is non-empty by construction. */
function cropToCoverage(work: Uint8Array, w: number, h: number, gx0: number, gy0: number): HullCoverage {
  const [minC, minR, maxC, maxR] = coveredBounds(work, w, h);
  const cw = maxC - minC + 1;
  const ch = maxR - minR + 1;
  const bits = new Array<number>(Math.ceil((cw * ch) / COVERAGE_WORD)).fill(0);
  for (let row = 0; row < ch; row++) {
    for (let col = 0; col < cw; col++) {
      if (work[(row + minR) * w + col + minC] === 1) setBit(bits, row * cw + col);
    }
  }
  return { gx: gx0 + minC, gy: gy0 + minR, w: cw, h: ch, bits };
}

/** [minCol, minRow, maxCol, maxRow] of the covered cells of a boolean grid. */
function coveredBounds(work: Uint8Array, w: number, h: number): [number, number, number, number] {
  let minC = w;
  let minR = h;
  let maxC = -1;
  let maxR = -1;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (work[row * w + col] === 0) continue;
      if (col < minC) minC = col;
      if (col > maxC) maxC = col;
      if (row < minR) minR = row;
      if (row > maxR) maxR = row;
    }
  }
  return [minC, minR, maxC, maxR];
}

/**
 * THE PAINT PIPELINE, whole: sharp rasterization → per-paint fuzz at the
 * shipped `CONFIG.vision.radarFuzz`, seeded from (paint time, exact pose).
 * This is the function BOTH paint sources call — the server's `return`-grammar
 * blip shaper with `t = world.now`, and the client's sighted-`Contact` stamp
 * with its per-revolution seed time — so a wire footprint and a synthesized
 * one are the same artifact by construction (amendments 11 + 154).
 */
export function paintCoverage(
  cls: HullId,
  x: number,
  y: number,
  heading: number,
  cellU: number,
  t: number,
): HullCoverage {
  const sharp = rasterizeHullCoverage(cls, x, y, heading, cellU);
  return fuzzCoverage(sharp, paintSeed(t, x, y, heading), CONFIG.vision.radarFuzz);
}
