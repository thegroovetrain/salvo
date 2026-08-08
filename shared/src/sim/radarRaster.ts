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
// SEGMENT COVERAGE (Story 4.12, amendment 194): the wake ribbon's sibling of
// `rasterizeHullCoverage` — one segment of disturbed water projected onto the
// same lattice, in the same `HullCoverage` shape.
// ---------------------------------------------------------------------------

/** Scratch quad for the segment's core rectangle — consumed synchronously
 *  inside `rasterizeSegmentCoverage` (the POSE_SCRATCH pattern). */
const CAPSULE_SCRATCH: Vec2[] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
];

/**
 * Project one wake segment onto the radar grid: every cell whose CENTRE lies
 * inside the segment's width-`widthU` core rectangle (square caps — extended
 * `widthU/2` past each endpoint along the axis, so consecutive ribbon
 * segments overlap at a turn instead of leaving a notch), plus every cell the
 * segment's CENTRE-LINE passes through. Same lattice, same `HullCoverage`
 * shape as the hull's mask.
 *
 * DELIBERATELY NOT ROUTED THROUGH `fuzzCoverage` (spec ruling): dilation +
 * glint is the HULL's beam-smear model (amendments 156-158) — it exists to
 * blur six distinct hull templates together, and applied here it would smear
 * a one-cell torpedo ribbon into a blob. A wake segment carries no class to
 * hide; its geometry goes on the lattice sharp.
 *
 * THE CENTRE-LINE WALK IS `fillSpine`'s LESSON APPLIED: a ribbon thinner than
 * a cell (a torpedo's, or a torpedo boat's 9u beam) at the straddling lattice
 * phase would otherwise collapse to a scatter exactly as the cycle-63 hull
 * spine bug did — so the walk visits the segment at quarter-cell steps, and
 * bridges any diagonal step so the spine is 4-connected as it is laid. A
 * final bridge pass (`bridgeCoverageDiagonals`) closes any diagonal-only
 * adjacency the width fill introduces at the rounded flanks, so the whole
 * mask is 4-connected by construction — a march ray at ~45° never falls
 * through a corner gap (the cycle-62 guarantee, kept).
 *
 * DEGRADE, NEVER THROW (the per-tick-scan contract `rasterizeHullCoverage`
 * carries, amendment 193's lesson): a non-finite endpoint drops that endpoint
 * (the segment collapses to its finite end); both endpoints non-finite, or a
 * degenerate lattice, degrade to a single-cell mask. A non-finite or
 * non-positive `widthU` rasterizes the centre-line only. All bit writes are
 * bounds-checked (`setBitInRect`) — the `>>> 5` word-index safety the
 * cycle-63 gate added holds here too.
 */
export function rasterizeSegmentCoverage(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  widthU: number,
  cellU: number,
): HullCoverage {
  const grid = cellU > 0 && cellU < Infinity ? cellU : 0;
  const degenerate = degenerateSegment(ax, ay, bx, by, grid);
  if (degenerate !== null) return degenerate;
  // At least one endpoint is finite here; a non-finite one collapses onto it.
  const [sx, sy] = finitePoint(ax, ay) ? [ax, ay] : [bx, by];
  const [ex, ey] = finitePoint(bx, by) ? [bx, by] : [ax, ay];
  const halfW = coreHalfWidth(widthU);
  const poly = capsuleQuad(sx, sy, ex, ey, halfW);
  const cover = emptyRectFor(poly, grid);
  if (halfW > 0) fillCoverage(cover, poly, grid);
  walkSegmentCells(cover, sx, sy, ex, ey, grid);
  bridgeCoverageDiagonals(cover);
  return cover;
}

/** True iff both coordinates are finite. */
function finitePoint(x: number, y: number): boolean {
  return Number.isFinite(x) && Number.isFinite(y);
}

/** Clamp a core width to a usable half-width: non-finite or non-positive
 *  widths degrade to 0 (centre-line only), never throw. */
function coreHalfWidth(widthU: number): number {
  return Number.isFinite(widthU) && widthU > 0 ? widthU / 2 : 0;
}

/** The segment degrade ladder: a fail-soft single-cell mask when both
 *  endpoints are non-finite (origin cell) or the lattice is degenerate (the
 *  finite endpoint's cell) — or null when the real rasterization should run. */
function degenerateSegment(ax: number, ay: number, bx: number, by: number, grid: number): HullCoverage | null {
  const cell = grid === 0 ? 1 : grid;
  const aOk = finitePoint(ax, ay);
  if (!aOk && !finitePoint(bx, by)) return centreCellCoverage(0, 0, cell);
  if (grid === 0) return centreCellCoverage(aOk ? ax : bx, aOk ? ay : by, cell);
  return null;
}

/** The segment's core rectangle with square caps: the segment Minkowski-grown
 *  by `halfW` along both its axis and its normal. A zero-length segment
 *  (axis degenerates to +x) becomes an axis-aligned square; a zero `halfW`
 *  collapses to the bare segment (zero-area quad — `emptyRectFor` still
 *  reads its bbox, `fillCoverage` marks nothing, the spine walk covers it). */
function capsuleQuad(ax: number, ay: number, bx: number, by: number, halfW: number): readonly Vec2[] {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len > 0 ? dx / len : 1;
  const uy = len > 0 ? dy / len : 0;
  const exx = ux * halfW; // axial cap extension
  const exy = uy * halfW;
  const nx = -uy * halfW; // normal half-width
  const ny = ux * halfW;
  const p = CAPSULE_SCRATCH;
  p[0].x = ax - exx + nx;
  p[0].y = ay - exy + ny;
  p[1].x = bx + exx + nx;
  p[1].y = by + exy + ny;
  p[2].x = bx + exx - nx;
  p[2].y = by + exy - ny;
  p[3].x = ax - exx - nx;
  p[3].y = ay - exy - ny;
  return p;
}

/** Walk the segment at quarter-cell steps setting every visited cell — the
 *  `fillSpine` cadence (a step strictly under half a cell cannot skip a cell
 *  on either axis), plus in-walk diagonal bridging: when one step crosses
 *  both a column and a row boundary, the corner cell `(pcol, row)` is set so
 *  the laid spine is 4-connected, deterministically. */
function walkSegmentCells(cover: HullCoverage, ax: number, ay: number, bx: number, by: number, cellU: number): void {
  const dx = bx - ax;
  const dy = by - ay;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil((span / cellU) * 4));
  let pcol = Math.floor(ax / cellU) - cover.gx;
  let prow = Math.floor(ay / cellU) - cover.gy;
  setBitInRect(cover, pcol, prow);
  for (let i = 1; i <= steps; i++) {
    const col = Math.floor((ax + (dx * i) / steps) / cellU) - cover.gx;
    const row = Math.floor((ay + (dy * i) / steps) / cellU) - cover.gy;
    if (col !== pcol && row !== prow) setBitInRect(cover, pcol, row);
    setBitInRect(cover, col, row);
    pcol = col;
    prow = row;
  }
}

/** Close every diagonal-only adjacency in a packed mask, to a fixed point —
 *  `bridgeDiagonals`' rule (the `\` diagonal bridges through the top-right
 *  cell, the `/` through the top-left) applied to a `HullCoverage` directly:
 *  segment masks are a handful of cells, so the packed-bit reads cost less
 *  than staging through the fuzz scratch grids. Each pass only ADDS cells,
 *  so it terminates. */
function bridgeCoverageDiagonals(cover: HullCoverage): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let row = 0; row < cover.h - 1; row++) {
      for (let col = 0; col < cover.w - 1; col++) {
        if (bridgeCoverageBlock(cover, col, row)) changed = true;
      }
    }
  }
}

/** One 2×2 block of a packed mask: bridge an exactly-diagonal covered pair.
 *  Returns true when a bridge cell was added. */
function bridgeCoverageBlock(cover: HullCoverage, col: number, row: number): boolean {
  const a = coverageHas(cover, col, row);
  const b = coverageHas(cover, col + 1, row);
  const c = coverageHas(cover, col, row + 1);
  const d = coverageHas(cover, col + 1, row + 1);
  if (a && d && !b && !c) {
    setBitInRect(cover, col + 1, row);
    return true;
  }
  if (b && c && !a && !d) {
    setBitInRect(cover, col, row);
    return true;
  }
  return false;
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
