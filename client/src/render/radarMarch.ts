// THE BEAM MARCH (cycle 62, amendments 138-143) — pure, no Pixi, no config
// import. Given an observer, an arc the beam has just swept, and the world field
// (render/radarField.ts), this emits the SLICE RECORDS that are the whole of the
// `return` grammar's paint list.
//
// ERIC, ON THE SHIPPED 4.10 BUILD, and this file is that sentence:
//
//   *"You're basically supposed to be raycasting or ray something, im not sure
//   the proper term. but as the sweep line sweeps, you're supposed to be radar
//   painting that entire line from the ship to the terminus according to how its
//   supposed to show up on radar."*
//
// SO THE PRIMITIVE IS INVERTED. Nothing here knows what an island is, what a
// hull is, or what weather is. It walks bearings, marches each one from own hull
// to the radar terminus, asks the field what is at each sample, and multiplies:
//
//     intensity = reflectivity x falloff(distance, GEOMETRY) x SNR grain
//
// That is amendments 105/106 in one line, with amendment 143's envelope as the
// third term. The retired per-object bakes could not express what the story asked
// for: its near-face criterion was the right rule FOR A DISC, and on an elongated
// polygon a point at a LATERAL tip scored below the terminator ramp and clamped
// to zero, so every long tail and side extremity of every stretched island was
// suppressed regardless of facing (amendment 139 carries the arithmetic).
//
// NOTHING OCCLUDES ANYTHING (amendment 140). A ray paints EVERY sample along its
// length, near side and far side alike, and an island behind an island paints
// too. There is no terminator, no segment test and no shadow term in this file.
// Story 4.11 reintroduces occlusion exactly once, as a height-derived shadow
// LENGTH along this same ray, which is both the better answer and the cheaper
// one — this module is the thing it contributes a term to.
//
// A SLICE IS A HISTORICAL RECORD (amendment 83). Its cells and their intensities
// are decided ONCE, here, from the observer and the field as they were at the
// moment the beam crossed that arc. Afterwards only alpha moves, via phosphor
// decay. Nothing in a slice is ever re-evaluated: not against the live observer,
// not against the live beam, not against the live grid anchor. Cycles 54, 55 and
// 57 each shipped a bug on exactly this rule.
//
// SLICES ARE EMITTED PER ANGULAR QUANTUM, NOT PER FRAME. `sliceCount` and
// `sliceArc` are pure functions of the swept arc, so how many records exist at a
// given moment depends on the SWEEP RATE and the persistence depth and not at all
// on the frame rate — a 144Hz machine and a 30Hz machine hold the same list.
// Cells live in flat typed arrays; a slice carries its own world bounding box so
// the rasterizer can skip one that is off-screen. THAT BOX IS A RASTERIZATION
// SHORTCUT AND NOTHING ELSE (amendment 97): a slice may never be culled from the
// LIST by anything viewport-derived, which is what makes a paint recorded
// off-screen at 1.5x appear on zoom-out.

import { wrapPositive, type Vec2 } from '@salvo/shared';
import { clamp01 } from '../util/math.js';
import { attenuation, noiseAmplitude, type NoiseEnvelope } from './radarFalloff.js';
import { cellOf, noiseMul, paintSeed, type HeatmapOpts } from './radarHeatmap.js';
import { cellKey, type FieldSample, type RadarField } from './radarField.js';

/** Tunables for the march itself (CLIENT_CONFIG.blip.heatmap.march). */
export interface MarchOpts {
  /** Arc length (u) between adjacent rays AT THE TERMINUS — the angular quantum
   *  is derived from it and the radar range, so the fan never opens gaps at the
   *  rim on a boon-scaled scope. */
  raySpacingU: number;
  /** Bounds on the derived angular spacing (rad), so a degenerate range can
   *  neither fan the scope into stripes nor ask for a million rays. */
  minRayRad: number;
  maxRayRad: number;
  /** How far a ray advances between samples (u). */
  stepU: number;
  /** The angular quantum ONE SLICE covers (rad). */
  sliceRad: number;
  /** The most beam (rad) one frame may catch up on. A stalled tab resumes at the
   *  live beam rather than replaying a revolution of crossings into one frame. */
  catchUpRad: number;
}

/**
 * ONE STABLE SEED FOR EVERY MARCH — a module constant, deliberately not a
 * per-slice roll.
 *
 * The speckle is a property of the PLACE (`cellNoise` hashes the ABSOLUTE world
 * cell, which is its own stated design), and under `writeCell`'s max-wins rule
 * three revolutions of slices lie on top of each other. With independent seeds
 * each revolution rolls a fresh set of lucky cells, so the union lights far more
 * of a haze or a fringe than one pass does and the grain stops meaning anything —
 * amendment 136 found exactly that with three live clutter hazes and fixed it the
 * same way. One seed makes stacking IDEMPOTENT: N passes light exactly the cells
 * one pass lights.
 *
 * Written as the grammar's own `paintSeed` frozen at t = 0 rather than as a
 * literal, exactly as the retired clutter seed was: it stays on the same hash the
 * rest of the module uses, and the token guard (tokens.test.ts) reads an 8-digit
 * hex literal anywhere in client/src as a colour escaping the token source.
 */
const MARCH_SEED = paintSeed('march', 0);

/**
 * One swept slice of the scope: the cells the beam painted across one angular
 * quantum, with their intensities FROZEN at creation.
 *
 * Flat typed arrays rather than an array of objects: a slice is written once and
 * then read every frame for its whole ~12s life, and the list holds a few hundred
 * of them.
 */
export interface MarchSlice {
  kind: 'slice';
  /** Absolute world cell indices, interleaved [gx0, gy0, gx1, gy1, ...]. */
  cells: Int32Array;
  /** Frozen per-cell intensity, parallel to `cells`. */
  w: Float32Array;
  /** How many cells are actually used (the arrays may be over-allocated). */
  n: number;
  /** Server paint time (ms) — the age channel, and the ONLY thing that retires
   *  a slice. */
  t: number;
  /** World bounding box of the painted cells (rasterization shortcut only). */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How many whole slices the beam has earned across an arc, and where the arc
 *  the caller should keep starts. Pure, so slice cadence is testable without a
 *  clock. */
export function sliceCount(from: number, to: number, o: MarchOpts): number {
  if (!(o.sliceRad > 0)) return 0;
  const span = Math.min(wrapPositive(to - from), Math.max(0, o.catchUpRad));
  // The epsilon is load-bearing, not decoration: the caller advances its cursor
  // by exactly `sliceRad` per slice, so an arc of N quanta accumulates N rounds
  // of float dust and lands a hair under N — and a bare `floor` would owe N−1
  // forever, leaving one quantum of the scope permanently unpainted at every
  // frame rate but the ones that happen to land on the boundary.
  return Math.floor(span / o.sliceRad + 1e-9);
}

/**
 * The angular spacing between adjacent rays for a given radar range.
 *
 * DERIVED, not typed in: `raySpacingU / radarRange` puts adjacent rays about one
 * cell apart AT THE TERMINUS, which is the coarsest place on the ray and
 * therefore the only place that can open a gap. A fixed angle would leave a fan
 * of unpainted wedges at the rim of a boon-scaled scope (radar range reaches
 * ~2.01x base) while wasting rays on a small one. Note this is a SAMPLING
 * resolution, not an intensity channel — amendment 134 retired the live radar
 * range from the intensity model and it stays retired; nothing here scales what a
 * return READS.
 */
export function rayStep(radarRange: number, o: MarchOpts): number {
  if (!(radarRange > 0) || !(o.raySpacingU > 0)) return o.maxRayRad;
  return Math.min(o.maxRayRad, Math.max(o.minRayRad, o.raySpacingU / radarRange));
}

/**
 * PER-MARCH SCRATCH, reused across every slice so a whole revolution allocates
 * nothing but the finished records.
 *
 * `SEEN` maps a cell key to its index in the parallel arrays, which is what makes
 * the accumulator MAX-WINS without ever decoding a key back into a coordinate:
 * two rays crossing one cell keep the stronger reading, the same rule `writeCell`
 * applies one level down. The arrays start comfortably above a full slice's cell
 * count and grow by doubling if a retune ever needs more.
 */
const SEEN = new Map<number, number>();
let sGx = new Int32Array(4096);
let sGy = new Int32Array(4096);
let sW = new Float32Array(4096);
let sN = 0;

/** Double the scratch arrays, preserving what is in them. */
function growScratch(): void {
  const gx = new Int32Array(sGx.length * 2);
  const gy = new Int32Array(sGy.length * 2);
  const w = new Float32Array(sW.length * 2);
  gx.set(sGx);
  gy.set(sGy);
  w.set(sW);
  sGx = gx;
  sGy = gy;
  sW = w;
}

/** Record one cell's intensity, keeping the stronger of two readings. */
function pushCell(key: number, gx: number, gy: number, i: number): void {
  const at = SEEN.get(key);
  if (at !== undefined) {
    if (i > sW[at]) sW[at] = i;
    return;
  }
  if (sN === sGx.length) growScratch();
  sGx[sN] = gx;
  sGy[sN] = gy;
  sW[sN] = i;
  SEEN.set(key, sN);
  sN++;
}

/**
 * THE RETURN, before grain: the field's own material and geometry through the ONE
 * curve, floored where the material demands it.
 *
 * This is the whole of amendment 106 as an expression — `reflectivity ×
 * falloff(distance, GEOMETRY)` — and it is exported because it is the seam the
 * calibration is judged at (radarFalloff.test.ts): the red→blue crossover has to
 * be readable without rasterizing anything.
 */
export function returnStrength(s: FieldSample, dist: number): number {
  return clamp01(Math.max(s.min, s.refl * attenuation(dist, s.ref, s.geom, s.floor)));
}

/**
 * Intensity of one sample: the return, grained by the SNR envelope.
 *
 * The grain is applied LAST and is seeded on the ABSOLUTE world cell, so it is a
 * property of the place rather than of the frame — and its amplitude comes from
 * the pre-grain intensity, so a saturated core is rock steady and a marginal
 * fringe crawls (amendment 143).
 */
function sampleIntensity(
  s: FieldSample,
  dist: number,
  gx: number,
  gy: number,
  env: NoiseEnvelope,
): number {
  const raw = returnStrength(s, dist);
  return raw * noiseMul(MARCH_SEED, gx, gy, noiseAmplitude(raw, env));
}

/** Everything one march run needs beyond the arc it is walking. */
interface RunCtx {
  obs: Vec2;
  field: RadarField;
  /** Where the ray starts and stops (u from the observer). */
  fromU: number;
  toU: number;
  o: HeatmapOpts;
  /** Cells below this intensity are DROPPED: they are transparent by
   *  construction (`bands[0].at`), so storing them would only ever cost memory
   *  and stamping time. Never a visibility decision — a dropped cell could not
   *  have lit a pixel at any alpha. */
  minStore: number;
}

/** March ONE bearing, accumulating cells into the scratch (max-wins, so two rays
 *  crossing a cell keep the stronger reading — the same rule `writeCell` uses one
 *  level down). Consecutive samples that land in the same cell are priced once:
 *  the step is deliberately finer than a cell so a ray cannot skip one, and the
 *  key compare is what stops that oversampling costing a field query. */
function marchRay(bearing: number, c: RunCtx): void {
  const cellU = c.o.cellU;
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  const step = c.o.march.stepU;
  let lastKey = Number.NaN;
  for (let d = c.fromU; d <= c.toU; d += step) {
    const x = c.obs.x + dx * d;
    const y = c.obs.y + dy * d;
    const gx = cellOf(x, cellU);
    const gy = cellOf(y, cellU);
    const key = cellKey(gx, gy);
    if (key === lastKey) continue; // consecutive samples in one cell: price it once
    lastKey = key;
    const s = c.field.sampleAt(x, y);
    if (s === null) continue;
    const i = sampleIntensity(s, d, gx, gy, c.o.noise);
    if (!(i >= c.minStore)) continue; // NaN-safe: a non-finite sample stores nothing
    pushCell(key, gx, gy, i);
  }
}

/** Freeze the accumulator into a slice record, or null when nothing painted. */
function freeze(t: number, cellU: number): MarchSlice | null {
  if (sN === 0) return null;
  const cells = new Int32Array(sN * 2);
  const w = new Float32Array(sW.subarray(0, sN));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < sN; k++) {
    const gx = sGx[k];
    const gy = sGy[k];
    cells[k * 2] = gx;
    cells[k * 2 + 1] = gy;
    minX = Math.min(minX, gx * cellU);
    minY = Math.min(minY, gy * cellU);
    maxX = Math.max(maxX, (gx + 1) * cellU);
    maxY = Math.max(maxY, (gy + 1) * cellU);
  }
  return { kind: 'slice', cells, w, n: sN, t, minX, minY, maxX, maxY };
}

/** The radial window a march walks, defaulting to "own hull to the terminus". */
export interface MarchWindow {
  fromU?: number;
  toU?: number;
}

/** Resolve the radial window against the radar range, or null when it is empty.
 *  A window is only ever a COMPUTE bound — clipping a ray to the neighbourhood a
 *  known footprint lives in — and it can never reach past the terminus. */
function resolveWindow(radarRange: number, win: MarchWindow): { fromU: number; toU: number } | null {
  const toU = Math.min(win.toU ?? radarRange, radarRange);
  const fromU = Math.max(0, win.fromU ?? 0);
  return toU > fromU ? { fromU, toU } : null;
}

/**
 * MARCH ONE SLICE: every bearing in `(from, to]`, from own hull to the radar
 * terminus, painting every sample the field answers for.
 *
 * Returns null for a slice that painted nothing (open water, the ordinary case)
 * and for every degenerate input — a non-finite observer or range, a zero-width
 * arc, a stalled clock — rather than a record full of NaN. `writeCell` is
 * max-wins, so one NaN would compare false against every later paint while one
 * Infinity would win every cell it touched; keeping both out of a slice at
 * creation is the cheapest place to hold that line.
 */
export function marchSlice(
  obs: Vec2,
  from: number,
  to: number,
  field: RadarField,
  radarRange: number,
  t: number,
  o: HeatmapOpts,
  win: MarchWindow = {},
): MarchSlice | null {
  const span = wrapPositive(to - from);
  if (!(span > 0) || !(radarRange > 0) || !Number.isFinite(obs.x + obs.y)) return null;
  const w = resolveWindow(radarRange, win);
  if (w === null || !(o.march.stepU > 0)) return null;
  const dTheta = rayStep(radarRange, o.march);
  const ctx: RunCtx = { obs, field, fromU: w.fromU, toU: w.toU, o, minStore: o.bands[0]?.at ?? 0 };
  SEEN.clear();
  sN = 0;
  // HALF-OPEN, `(from, to]`, and evenly spaced so the last ray lands EXACTLY on
  // `to`: adjacent slices then meet with no unpainted seam between them, and a
  // bearing on a quantum boundary is marched once rather than twice.
  const rays = Math.max(1, Math.ceil(span / dTheta));
  const d = span / rays;
  for (let k = 1; k <= rays; k++) marchRay(from + k * d, ctx);
  const slice = freeze(t, o.cellU);
  SEEN.clear();
  sN = 0;
  return slice;
}

/**
 * The bearing window a footprint at (x, y) subtends from `obs`, plus the range it
 * sits at — the arc AND the radial slab a wire echo's own march has to cover.
 *
 * Both are pure COMPUTE bounds: they decide which rays are worth firing and how
 * much of each one is worth walking, and every sample inside them is still priced
 * by the same field and the same model. A slack answer costs time and never
 * correctness; a tight one would clip the footprint, which is why the radial slab
 * carries the extent's own half-width and not merely a cell.
 */
export function echoArc(
  obs: Vec2,
  x: number,
  y: number,
  ext: number,
): { centre: number; half: number; dist: number; reach: number } {
  const dx = x - obs.x;
  const dy = y - obs.y;
  const d = Math.hypot(dx, dy);
  const reach = Math.max(1, ext) / 2;
  return {
    centre: Math.atan2(dy, dx),
    half: d > reach ? Math.asin(Math.min(1, reach / d)) : Math.PI,
    dist: d,
    reach,
  };
}
