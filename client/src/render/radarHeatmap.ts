// The `return` grammar's BUFFER: a world-anchored quantized intensity bitmap,
// the seeds and grain that texture it, and the stamp that puts one marched slice
// into it. Pure math, no Pixi — the adapter (render/radar.ts) only anchors the
// grid, uploads the bytes and positions one sprite, the same seam blipMarks.ts
// holds for the `silhouette` grammar.
//
// THE PRIMITIVE THIS FILE SERVES CHANGED IN CYCLE 62 (amendment 138). It used to
// hold both halves of the grammar: the buffer AND a set of per-object bakes that
// asked each island and each hull what it looked like. That second half is GONE —
// the coverage bake, the near-face terminator, the depth-solidity term, the
// occluder shortlist, the ellipse kernel, both paint records and the surf branch
// were all deleted, not ported. Radar now asks each BEARING
// what is out there: render/radarMarch.ts walks rays through
// render/radarField.ts and emits SLICES, and this file's only remaining job on
// the paint side is `stampSlice` — a flat copy of frozen cells into the buffer.
//
// WHY DELETION RATHER THAN CORRECTION, recorded because it will be asked again.
// The retired near-face criterion scored a point about the island's
// BOUNDING-CIRCLE centre, which makes it the exact near-face rule FOR A DISC. On
// an elongated polygon a point at a LATERAL extremity — side-on to the observer,
// not on the far side at all — has no projection toward the observer, so it
// scored well below the terminator ramp and clamped hard to zero. Every long tail
// and lateral tip of every fractal island was suppressed regardless of facing;
// amendment 139 carries the arithmetic in full. The math was right for the cycle-51 capsule islands it was
// written against and was invalidated by the cycle-59 generator without failing
// loudly. And under amendment 140 NOTHING OCCLUDES ANYTHING this cycle anyway, so
// there was nothing left for a corrected criterion to do.
//
// THE GOVERNING INVARIANT — A PAINT IS A HISTORICAL RECORD (cycle 55, amendment
// 83). Everything about a paint — its position, its intensity, which band a cell
// lands in, and WHETHER A GIVEN CELL PAINTS AT ALL — is decided ONCE, at paint
// creation, from the observer's state at that moment. The ONLY property that
// changes afterward is alpha, via time-based phosphor decay. Nothing may EVER be
// re-evaluated against live state: not the live observer position, not the live
// beam angle, not the live grid anchor. THE RADAR SWEEP IS THE ONLY THING THAT
// PAINTS. This is the first thing to check whenever a new radar behaviour is
// added, and it is the rule cycle 54 broke by gating cells against the LIVE grid
// anchor, so a receding sight bubble lit coastline no beam had swept (amendment
// 84). Staleness is not a bug here — staleness is the whole contract. Under the
// march it holds STRUCTURALLY rather than by inspection: a slice is a frozen
// array of cell indices and intensities, and there is nothing in it left to
// re-evaluate.
//
// THE RULINGS THIS FILE STILL IMPLEMENTS:
//
//   • R1 — HISTORY LIVES IN A PAINT LIST, NOT IN THE BUFFER. Nothing here ever
//     decays a persistent buffer in place: the observer moves, so an in-place
//     decay would smear or drag old paints along with the camera. `rasterize`
//     clears, then re-stamps every LIVE slice from its own record each frame. The
//     buffer is a pure function of (slice list, now) — phosphor persistence falls
//     out for free and a paint can never be half-erased.
//
//   • R2 — THE BUFFER IS WORLD-ANCHORED. `anchorGrid` snaps the origin to a whole
//     cell (`Math.floor(worldX / cellU)`), so the pixel lattice belongs to the
//     WORLD, not to the ship. Without the snap every cell's world position would
//     slide with the observer and a static coastline would shimmer as you steamed
//     past it.
//
//   • R8 — AND IT IS SIZED TO THE VIEWPORT, NOT TO THE RADAR RING (cycle 58,
//     amendments 95-99). The buffer is a SCRATCH SURFACE, not storage: R1 already
//     put every byte of history in the paint list and re-rasterizes the whole list
//     every frame, so the buffer only ever needs to cover WHAT IS ON SCREEN.
//     Anything off-screen is not visible, so not rasterizing it costs nothing and
//     it reappears the moment it scrolls back into view. Cycle 57 was REVERTED
//     from production for losing the world lock while chasing this: it re-centred
//     a paint-driven sub-rect every frame and placed the sprite at that moving
//     origin, so islands drifted with the boat.
//
//     NOTHING VIEWPORT-DERIVED MAY EVER REACH PAINT CREATION OR RETIREMENT
//     (amendment 97). The camera decides ONE thing: which rectangle of world is
//     drawn this frame. Creation stays gated only by the sweep and radar range;
//     retirement stays gated only by time; the slice list is never culled by
//     visibility. A slice may be skipped by `stampSlice` when its bounding box is
//     off the buffer — that is a RASTERIZATION shortcut whose only effect is not
//     writing cells that would have been rejected one line later — but nothing may
//     remove it from the list. That is what makes Eric's stated requirement hold
//     for free: *"if I am zoomed in when it paints and then I zoom out, it still
//     shows me everything that would have been there."*
//
//   • R3 — INTENSITY IS TEXTURED BY GRAIN SEEDED ON THE ABSOLUTE WORLD CELL, so
//     the ragged band boundaries are stable for a paint's entire decay AND as the
//     observer moves. What changed in cycle 62 is the AMPLITUDE: it is no longer
//     flat. `noiseAmplitude` (render/radarFalloff.ts) makes the grain largest at
//     the detection floor and zero at saturation, so a landmass interior is rock
//     steady and its fringe breaks up into a speckle (amendment 143) — the flat
//     jitter put static in the one place a real scope is solid, and smeared
//     intensity off the iso-height lines the colour bands are supposed to land on.
//
//     THAT SPECKLE DOES NOT SCINTILLATE, and the distinction is worth stating
//     because earlier prose in this cycle claimed it did. The march uses ONE
//     seed for the whole match (`MARCH_SEED`, render/radarMarch.ts), so the grain
//     is a fixed spatial stencil: a given world cell draws the same multiplier on
//     every revolution and a fringe HOLDS STILL between paints. That is required,
//     not incidental — independent per-paint seeds re-create amendment 136's
//     solid-disc bug, because three revolutions of overlapping slices under
//     max-wins would each light a different lucky quarter and the union would
//     light nearly all of it. The grain varies intensity across PLACE and never
//     across time, which is `cellNoise`'s own design rationale.
//
// WHAT IS NOT HERE, AND MUST NOT COME BACK: any occlusion test (amendment 140 —
// no terminator, no cross-island segment test, no clutter occluder mask, no ship
// shadowing), any contour polygon (amendment 142 — elevation comes from the
// raster via `sampleHeight`, continuously), and any comparison against a vision
// range constant (the eighths ladder's 7/8 rung is a curve-FIT input, read once
// where the client tunables are defined and never on a paint path).

import { clamp01 } from '../util/math.js';
import { blipAlpha } from './phosphor.js';
import type { NoiseEnvelope } from './radarFalloff.js';
// TYPE-ONLY, and that is what keeps the dependency one-way. render/radarMarch.ts
// and render/radarField.ts import this module's grid primitives at RUNTIME; this
// module needs only the SHAPE of the record it stamps and of the march's own
// tunables, so both imports erase at compile time and there is no module cycle.
import type { MarchOpts, MarchSlice } from './radarMarch.js';

const TAU = Math.PI * 2;

// Hash constants for `paintSeed`/`cellNoise`, written in DECIMAL on purpose
// (comments too): the token guard (tokens.test.ts) reports every 6/8-digit hex
// literal anywhere in client/src as a color escaping the token source, and these
// are mixing constants, not colors. Values are the standard 32-bit FNV-1a offset
// basis and prime, plus the two multipliers from the murmur3 finalizer.
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const TIME_MIX = 668265261;
const AVALANCHE_MIX = 2246822507;
/** 2^32 — the divisor that turns a u32 avalanche into a [0,1) float. */
const U32 = 4294967296;

// --- 1. the quantization contract -------------------------------------------

/**
 * One band of the quantized scale. EXACTLY THREE of these ship (amendment 77),
 * ordered ASCENDING by `at`, and a pixel below `bands[0].at` is fully
 * transparent. There is no fourth state and no interpolation anywhere: a pixel
 * is one of these colors or it is nothing.
 */
export interface HeatBand {
  /** Lowest per-pixel intensity that paints this band (ascending). */
  at: number;
  /** The band's color — used VERBATIM, never lerped toward a neighbour. */
  color: number;
  /** Peak opacity of a FRESH pixel in this band (age scales it down). */
  alpha: number;
}

/**
 * Which band a per-pixel intensity falls in, or -1 for fully transparent.
 *
 * THE HARD-QUANTIZATION GUARANTEE. This is the only function that maps
 * intensity to color, it returns an INDEX, and every caller reads
 * `bands[i].color` unmodified — so no output of the heatmap can ever be a blend
 * of two bands, at any input. A non-finite intensity answers -1 (the negated
 * compare below catches NaN), which paints nothing rather than a garbage color.
 */
export function bandIndex(intensity: number, bands: readonly HeatBand[]): number {
  if (!(intensity > 0)) return -1;
  let idx = -1;
  for (let i = 0; i < bands.length; i++) {
    if (intensity < bands[i].at) break;
    idx = i;
  }
  return idx;
}

// --- 2. the world-anchored grid ----------------------------------------------

/**
 * The intensity buffer. Two parallel per-cell channels, and they carry DIFFERENT
 * quantities on purpose:
 *
 *   • `w` — intensity, the quantization input. Geometry and material only:
 *     reflectivity, range attenuation, grain. NEVER age.
 *   • `a` — the age opacity of whichever paint won that cell's intensity.
 *
 * WHY AGE IS NOT FOLDED INTO `w` (a deliberate deviation from the letter of
 * ruling R1's "age-derived weight", recorded here because it is load-bearing):
 * intensity decides COLOR, so an age term in it would make one object drift red
 * → blue → green as it decayed. That is amendment 76's complaint — "a single
 * object could potentially have bits that are red, blue, or green" — re-created
 * along the time axis instead of the aspect axis. Color therefore means
 * certainty and only certainty, and age keeps the alpha channel it has held
 * since Story 4.2 (amendment 64's three-channel split, intact).
 */
export interface HeatGrid {
  /** World units per cell. */
  cellU: number;
  cols: number;
  rows: number;
  /** ABSOLUTE world cell index of column 0 / row 0 (see `anchorGrid`). */
  baseGx: number;
  baseGy: number;
  /** World coordinate of the grid's top-left corner (= baseG* × cellU). */
  originX: number;
  originY: number;
  /** Per-cell intensity — the quantization input. */
  w: Float32Array;
  /** Per-cell age opacity of the paint that won that cell. */
  a: Float32Array;
}

/**
 * Cell quantum for a buffer span (ruling R8). Spans are rounded UP to a multiple
 * of this, so a continuously-varying viewport (a wheel zoom, a window drag) does
 * not reallocate the texture on every intermediate value — and the rounding is
 * always slack, never a crop.
 */
export const GRID_QUANTUM = 16;

/**
 * Cells needed to cover `2 × halfU` at `cellU` resolution: the exact span, plus
 * two cells of slack so a snapped origin can never leave the far edge short,
 * rounded up to `GRID_QUANTUM`. A non-finite or non-positive input answers the
 * quantum rather than NaN — a rogue viewport must not size a buffer to garbage.
 */
export function gridSpan(halfU: number, cellU: number): number {
  if (!(halfU > 0) || !(cellU > 0)) return GRID_QUANTUM;
  const need = Math.ceil((2 * halfU) / cellU) + 2;
  return Math.max(GRID_QUANTUM, Math.ceil(need / GRID_QUANTUM) * GRID_QUANTUM);
}

/**
 * Allocate a buffer covering `2 × halfWU` by `2 × halfHU` (rulings R2 + R8) at
 * `cellU` resolution.
 *
 * THE BUFFER IS A SCRATCH SURFACE, NOT STORAGE (ruling R8, amendment 96). Its
 * extent is a rendering decision and nothing else: history lives in the slice
 * list, which is re-rasterized in full every frame, so a region the buffer does
 * not cover this frame is simply not DRAWN this frame — never forgotten, and
 * back the instant it is covered again.
 */
export function makeGrid(halfWU: number, halfHU: number, cellU: number): HeatGrid {
  const cols = gridSpan(halfWU, cellU);
  const rows = gridSpan(halfHU, cellU);
  const n = cols * rows;
  return {
    cellU,
    cols,
    rows,
    baseGx: 0,
    baseGy: 0,
    originX: 0,
    originY: 0,
    w: new Float32Array(n),
    a: new Float32Array(n),
  };
}

/**
 * Re-centre the grid on (cx, cy) and clear it.
 *
 * THE SNAP IS THE POINT (ruling R2). The origin is floored to a whole cell, so
 * cell (gx, gy) always covers the same world square no matter where the
 * observer stands — which is what makes `cellNoise(seed, gx, gy)` a stable
 * property of a place rather than a flicker that re-rolls every frame.
 *
 * THE GRID CARRIES NO OBSERVER (amendment 85). It is a window onto the world,
 * nothing more: where it is centred decides only which cells are IN BOUNDS this
 * frame. Every judgement about a paint — including whether a cell paints at all —
 * belongs to the paint, taken at its own creation. Cycle 54's `obsX`/`obsY`/
 * `sightR2` lived here and were re-read every frame, which is precisely how a
 * receding sight bubble came to paint coastline no beam had swept.
 *
 * WHAT IT IS CENTRED ON IS THE CAMERA (ruling R8, amendment 96), and that changes
 * NOTHING here: the centre has always been a pure windowing input, and the floor
 * below is what keeps the lattice world-locked no matter what is handed in. A
 * centre that is not snapped would slide every cell's world square under the
 * paints — the exact regression cycle 57 shipped.
 */
export function anchorGrid(g: HeatGrid, cx: number, cy: number): void {
  g.baseGx = Math.floor((cx - (g.cols * g.cellU) / 2) / g.cellU);
  g.baseGy = Math.floor((cy - (g.rows * g.cellU) / 2) / g.cellU);
  g.originX = g.baseGx * g.cellU;
  g.originY = g.baseGy * g.cellU;
  clearGrid(g);
}

/** Blank every cell, leaving the anchor alone. Used on the frames that draw
 *  nothing at all, so a hidden buffer can never answer with last frame's cells. */
export function clearGrid(g: HeatGrid): void {
  g.w.fill(0);
  g.a.fill(0);
}

/** World cell index containing world coordinate `v`. */
export function cellOf(v: number, cellU: number): number {
  return Math.floor(v / cellU);
}

/** Centre of world cell `gx` on one axis. */
export function cellCentre(gx: number, cellU: number): number {
  return (gx + 0.5) * cellU;
}

/**
 * Write one cell, MAX-WINS. Overlapping paints never sum: additive accumulation
 * would let two weak ghosts of one contact fabricate a red core that neither
 * return earned, which is the same "color is lying about strength" failure from
 * the other direction. Out-of-grid writes are dropped silently — a slice at the
 * rim legitimately overhangs the buffer.
 *
 * NO GATE LIVES HERE (amendment 85, and nothing may put one back). A write
 * chokepoint is the wrong home for any judgement about a paint, because it runs
 * every frame while the paint was born once: whatever it consults is by
 * construction LIVE state.
 */
export function writeCell(g: HeatGrid, gx: number, gy: number, intensity: number, alpha: number): void {
  const cx = gx - g.baseGx;
  const cy = gy - g.baseGy;
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return;
  const i = cy * g.cols + cx;
  if (!(intensity > g.w[i])) return;
  g.w[i] = intensity;
  g.a[i] = alpha;
}

/** Read one cell by world position (test/observation seam). */
export function sampleGrid(g: HeatGrid, x: number, y: number): { w: number; a: number } {
  const cx = cellOf(x, g.cellU) - g.baseGx;
  const cy = cellOf(y, g.cellU) - g.baseGy;
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return { w: 0, a: 0 };
  const i = cy * g.cols + cx;
  return { w: g.w[i], a: g.a[i] };
}

/**
 * Quantize the whole buffer into RGBA bytes (straight alpha — the texture source
 * premultiplies on upload).
 *
 * Every lit pixel takes its band color VERBATIM. The only continuous quantity
 * that survives to the screen is opacity, which carries age exactly as it has
 * since Story 4.2 — never a hue.
 *
 * BLANK FIRST, THEN WRITE ONLY WHAT IS LIT. Output is identical to clearing each
 * transparent pixel in the loop, but a viewport-sized buffer (ruling R8) is
 * mostly empty most of the time — a screen at min zoom is ~350k cells of which a
 * few thousand carry a return — so a single typed-array `fill` plus a scalar
 * reject beats four byte stores and a band lookup per dead cell. Measured at
 * roughly half the per-frame cost of the buffer at min zoom.
 */
export function quantizeInto(g: HeatGrid, bands: readonly HeatBand[], out: Uint8Array): void {
  out.fill(0);
  for (let i = 0, n = g.cols * g.rows; i < n; i++) {
    const w = g.w[i];
    if (!(w > 0)) continue; // the overwhelming majority: already blank
    const b = bandIndex(w, bands);
    if (b < 0) continue;
    const o = i * 4;
    const band = bands[b];
    out[o] = (band.color >> 16) & 0xff;
    out[o + 1] = (band.color >> 8) & 0xff;
    out[o + 2] = band.color & 0xff;
    out[o + 3] = Math.round(255 * clamp01(band.alpha * g.a[i]));
  }
}

// --- 3. seeds and grain -------------------------------------------------------

/**
 * The seed for one paint: a 32-bit avalanche of (track key, paint time). Carried
 * forward verbatim from the retired `returnMarks.blobSeed`.
 *
 * THE TIME INPUT IS NO LONGER USED TO MAKE SUCCESSIVE PAINTS DIFFER, and the old
 * comment here saying so described a contract cycle 62 retired. The march's only
 * caller freezes this at `paintSeed('march', 0)` — one seed for the whole match —
 * precisely so that stacked revolutions are IDEMPOTENT under `writeCell`'s
 * max-wins rule (amendment 136 found the alternative: independent seeds turn a
 * speckled haze into a solid disc). The hash still mixes `paintT` because that is
 * what makes it a general-purpose seed function; what varies a march's grain is
 * the world CELL, never the time.
 */
export function paintSeed(key: string, paintT: number): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), FNV_PRIME);
  }
  h = Math.imul(h ^ (paintT | 0), TIME_MIX);
  h = Math.imul(h ^ (h >>> 15), AVALANCHE_MIX);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * Deterministic [0,1) noise for (seed, ABSOLUTE world cell) — ruling R3.
 *
 * Absolute world cell, not buffer cell: the grid re-anchors every frame as the
 * observer moves, so hashing the buffer index would re-roll the whole texture
 * every time the ship crossed a cell boundary. Hashing the world cell makes the
 * grain a property of the PLACE, so a paint's ragged edges are frozen for its
 * entire decay and the scope stops boiling — and it is why the march can use ONE
 * stable seed and have three revolutions of overlapping slices agree cell for
 * cell instead of each rolling its own lucky quarter.
 */
export function cellNoise(seed: number, gx: number, gy: number): number {
  let h = Math.imul(seed ^ FNV_OFFSET, FNV_PRIME);
  h = Math.imul(h ^ (gx | 0), TIME_MIX);
  h = Math.imul(h ^ (gy | 0), FNV_PRIME);
  h = Math.imul(h ^ (h >>> 15), AVALANCHE_MIX);
  return ((h ^ (h >>> 13)) >>> 0) / U32;
}

/**
 * The grain MULTIPLIER for a cell: 1 ± `amount`.
 *
 * This is what makes the three bands INTERLEAVE at their boundaries instead of
 * forming three clean concentric rings — the difference between "a radar return"
 * and "a target reticle". `amount <= 0` is an exact 1 (a clean-edge debug mode
 * and the deterministic path the geometry tests use), which is also what a
 * SATURATED return now gets for free: the amplitude handed in comes from
 * `noiseAmplitude`, which falls to zero as intensity rises (amendment 143).
 */
export function noiseMul(seed: number, gx: number, gy: number, amount: number): number {
  if (!(amount > 0)) return 1;
  return 1 + amount * (2 * cellNoise(seed, gx, gy) - 1);
}

// --- 4. the return model's tuning ----------------------------------------------

/**
 * THE PHYSICAL RETURN MODEL's tuning (Story 4.10, amendments 105-106; re-shaped
 * by cycle 62) — per-material coefficients, the four reference ranges, and the
 * two world-space extents the weather materials need. The MATH is
 * render/radarFalloff.ts; every material composes
 * `coefficient × falloff(geometry) × grain` through it, and no material carries a
 * private attenuation formula.
 *
 * THE THREE SURVIVORS OF THE RETIRED SHIP KERNEL LIVE HERE NOW, and they are
 * model parameters rather than kernel knobs: `pointFloor` is the POINT curve's
 * asymptote, `strongExtent` is the normalizer the red→blue crossover is FITTED
 * against (amendment 118), and `minPeak` is the floor that makes radar range mean
 * one number for every hull (amendment 127 — dropping it so signature becomes
 * stealth is a ruled-out design). The rest of the kernel — `minExtent`,
 * `depthFrac`, `minDepth`, `strongExtent`'s old home, and the whole island block
 * (`depthFullU`, `minLand`, `gain`, `terminator`, `maxCells`, `surfMaxCells`,
 * `paintsPerIsland`) — went with the bakes.
 */
export interface ReturnModelOpts {
  /** Steel broadside — the coefficient table's 1.0 anchor (POINT geometry). */
  ship: number;
  /** Terrain at or above `refHeight` (SURFACE). */
  landSteep: number;
  /** Terrain at sea level (SURFACE) — amendment 129's other end. */
  landFlat: number;
  /** Breaking surf (SURFACE) — a weak coastal fringe, restored as a field
   *  material by the cycle-62 review gate; two-sided bound, see the config
   *  comment. */
  surf: number;
  /** Sea clutter (SURFACE) — three bounds, see the config comment. */
  clutter: number;
  /** The storm wall (VOLUME). */
  storm: number;
  /** Reference range (u) of the POINT curve — FITTED, never typed in. */
  pointRef: number;
  /** Reference range (u) of the SURFACE curve (coastline). */
  surfaceRef: number;
  /** Reference range (u) of the SURFACE curve for SEA CLUTTER — shorter, so the
   *  haze's near-field concentration and its fade both fall out of the curve. */
  clutterRef: number;
  /** Reference range (u) of the VOLUME curve. */
  volumeRef: number;
  /** Asymptotic floor shared by the SURFACE and VOLUME curves. */
  floor: number;
  /** Asymptotic floor of the POINT curve (the fit is solved against it). */
  pointFloor: number;
  /** Attenuated ACROSS extent (u) that reads as a full-strength hull core. */
  strongExtent: number;
  /** Floor on a hull's intensity, so the weakest legitimate echo still paints. */
  minPeak: number;
  /** Quantized raster height (0-255) at which `landSteep` is reached. */
  refHeight: number;
  /** How far seaward of a coastline surf paints (u) — a pyramid TILE SIZE
   *  target, not a radius; see the config comment and `surfPyramidLevel`
   *  (render/radarField.ts). */
  surfBandU: number;
  /** Compute bound (u) on the clutter disc — not its visual extent. */
  clutterRangeU: number;
  /** Full thickness (u) of the storm wall band. */
  stormBandU: number;
}

/** Everything the march and the rasterizer need from CLIENT_CONFIG. */
export interface HeatmapOpts {
  cellU: number;
  bands: readonly HeatBand[];
  noise: NoiseEnvelope;
  march: MarchOpts;
  model: ReturnModelOpts;
}

// --- 5. stamping a marched slice ------------------------------------------------

/** Per-frame inputs the rasterizer needs beyond the slice list itself.
 *
 *  NOTE WHAT IS NOT HERE: any live observer state at all. The rasterizer consults
 *  none, which is amendment 83 holding structurally rather than by inspection. */
export interface RasterCtx {
  now: number;
  lifeMs: number;
  /** Colorblind-assist alpha floor (`blipAlpha`'s minAlpha). */
  alphaFloor: number;
}

/** Does a slice's world bounding box touch the buffer at all? */
function onBuffer(g: HeatGrid, s: MarchSlice): boolean {
  const x1 = g.originX + g.cols * g.cellU;
  const y1 = g.originY + g.rows * g.cellU;
  return s.maxX >= g.originX && s.minX <= x1 && s.maxY >= g.originY && s.minY <= y1;
}

/**
 * Stamp ONE marched slice: its frozen cells at its current age opacity.
 *
 * Nothing is judged here. A slice is a finished record — absolute world cell
 * indices and the intensities the beam froze into them — so this is a flat copy
 * under `writeCell`'s max-wins rule, and it produces the identical buffer at
 * every later observer position and every later camera. The bounding-box reject
 * is a pure RASTERIZATION shortcut (amendment 97): every cell it skips would have
 * been dropped by `writeCell`'s own bounds test one line later, and the slice
 * stays in the list either way.
 */
export function stampSlice(g: HeatGrid, s: MarchSlice, alpha: number): void {
  if (!onBuffer(g, s)) return;
  for (let k = 0; k < s.n; k++) {
    writeCell(g, s.cells[k * 2], s.cells[k * 2 + 1], s.w[k], alpha);
  }
}

/**
 * RE-RASTERIZE THE WHOLE BUFFER FROM THE SLICE LIST (ruling R1).
 *
 * The caller has already anchored (and therefore cleared) the grid. Nothing
 * decays in place; a slice's only per-frame state is its age, which becomes the
 * alpha channel of every cell it wins. Dead slices (alpha 0) are skipped here and
 * pruned by the caller.
 */
export function rasterize(g: HeatGrid, slices: readonly MarchSlice[], ctx: RasterCtx): void {
  for (const s of slices) {
    const alpha = blipAlpha(ctx.now - s.t, ctx.lifeMs, ctx.alphaFloor);
    if (alpha <= 0) continue;
    stampSlice(g, s, alpha);
  }
}

// --- 6. sweep bookkeeping -------------------------------------------------------

/**
 * Full turn (rad) — exported so the adapter can size a revolution in slices.
 *
 * IT IS ALL THAT IS LEFT OF THE SWEEP BOOKKEEPING. `sweepCrossed` — the half-open
 * `(from, to]` crossing test every per-object paint answered to — went with the
 * objects: under the beam march the question "has the beam reached this thing?"
 * is not asked at all, because the march walks bearings rather than consulting
 * them. Its semantics survive intact one level down, in `sliceCount`
 * (render/radarMarch.ts), which is half-open in the same direction and answers
 * nothing for a zero-width advance for the same reason.
 */
export const FULL_TURN = TAU;
