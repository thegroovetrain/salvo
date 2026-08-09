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
// AND SINCE STORY 4.11 THE RAY CARRIES A SHADOW (amendments 176-180) — the term
// cycle 62 promised when amendment 140 deleted the binary occlusion tests. There
// is still no terminator, no segment test and no per-object occluder list. There
// is ONE running scalar: `beginShadowWalk` (shared/sim/radarShadow.ts) folds
// every LAND raster cell the ray crosses and answers, at each sample distance,
// how high the grazing ray stands there. That answer masks the sample, so a
// shadowed return walks red → blue → green → gone instead of cutting at a line
// (amendment 104's soft edge, and colour still means intensity — amendment 105
// obeyed, not bent).
//
// TWO INSTANCES OF ONE RULE, AND WHICH ONE A SAMPLE GETS DEPENDS ON WHAT IT IS
// (cycle 69, Eric on 0.17.68: *"i assumed that more of the islands would get
// painted? like, if im looking at a side of an island and there's a mountain, my
// radar should pick up all the way to the peak on that side, right, and then the
// shadow lives on the other side?"*). He is right, and the defect was that EVERY
// sample was masked with the SHIP answer:
//
//   • A HULL, a wave crest, a clutter speck, the storm wall — everything afloat —
//     is a COLUMN from the waterline to the masthead, genuinely masked from the
//     bottom up. `visibilityAt` (= `illuminatedFraction` at mast height) is that
//     instance, it is what the server gate calls, and it is what amendment 104's
//     PROPORTIONAL soft edge was written about. Unchanged here.
//   • A TERRAIN SAMPLE IS A POINT ON A SURFACE. It is above the grazing ray or it
//     is below it; a mountainside that sticks out over the ray is fully lit and
//     returns per its material, because you are looking UP at it. So terrain is a
//     SOFT STEP at the ray (`terrainIllumination`), not a fraction — and it is
//     masked by ITS OWN height, never by the mast's. Feeding the mast answer to
//     terrain stopped every near slope at roughly mast height and hid the summit
//     behind it, which is the reported defect in one line.
//
// AND THE REACH IS A SHIP-ONLY STOPPING RULE (cycle 69). The walk's `reach()` is
// where a MAST-HEIGHT target goes dark; past it `requiredHeightAt` keeps rising
// but stays finite, so a mountain out there legitimately paints. The march used
// to stop asking the walk anything past the reach and mark the rest of the
// bearing NO-DATA — which suppressed exactly the peaks this cycle exists to
// paint, and (worse) froze the accumulator, so terrain further out would have
// been measured against a stale ray. The early-out is gone; nothing here reads
// `reach()` any more.
//
// A SHADOW IS UNPAINTED WATER, NOT A GREY WASH (cycle 69 — Eric: *"i don't like
// the grey showing radar shadow, i think its better to just leave it uncolored
// and infer there's a shadow there because you can't see behind it and half the
// island is cut off."*). THIS REVERSES AMENDMENT 180, which was Eric's own
// earlier call — made at a question gate, before he had seen it on the water. The
// NO-DATA channel is DELETED, not disabled: no `nd` array, no grey token, no
// config block, nothing to "restore". A bearing that learned nothing simply
// stores nothing, and the shadow reads as a shadow because the far half of the
// island is missing from the scope. Do not re-add it.
//
// EXCEPT ON A DISCLOSED FIELD, WHERE THE SHADOW MAY ATTENUATE BUT NEVER SUPPRESS
// (`RadarField.disclosed`, review gate). A wire echo has already been through the
// server's gate, so the ray scales it by the same fraction and then FLOORS the
// result at the material's own guarantee (`shade`, `model.minPeak`) rather than
// letting it reach zero. That is how amendment 127 ("anything the server blips
// paints at least a speck") and the story's fade criterion are held at once;
// `shipOnlyField` carries the argument.
//
// THE MODEL IS SHARED WITH THE SERVER'S BLIP GATE, ON PURPOSE, AND THE TWO SIDES
// DELIBERATELY DO NOT AGREE CELL FOR CELL. The WALK owns the folding cadence, not
// the caller, so both sides fold the same cells at the same distances — but the
// CLIENT queries visibility BEFORE folding each sample (amendment 187: advancing
// first makes a tall island paint nothing at all), while the server's one-shot
// `visibilityTo` folds the target's own cell before querying. So at a shadow's
// leading edge the client's accumulator lags the server's by up to one heat cell
// plus one step (~13u at the shipped 9u/4u pair). THE DIRECTION IS THE SAFE ONE
// AND THAT IS THE POINT: the client can only ever paint at least as much as the
// server discloses, never more, so no lag here can leak anything (amendment 179).
//
// AND THE WALK ADVANCES TO THE SAMPLE'S OWN CELL ENTRY, NOT TO THE SAMPLE
// (cycle 69, `ShadowWalk.cellEntryAt`). A terrain sample stands ON land, i.e. it
// is a query point inside a raster cell, and the module's standing rule is that a
// cell never occludes a query point inside it — at either end of the ray. The
// server's one-shot gets that for free (`visibilityTo` folds only up to the
// target's cell entry); an incremental march has to ask. Advancing to `d` instead
// folds a cell before the second sample inside it is queried, and `required`
// there is then exactly that cell's OWN height, so a continuously visible slope
// paints in stripes at the 14u raster pitch. MEASURED BOTH WAYS: 11 lit runs
// with 29 dark samples on a seed-3 island, and on the unit fixture (a smooth
// 200u cone) a slope that paints as one 21-row run comes apart into 8 runs with
// 7 dark rows the moment the walk advances to `d`.
//
// QUERY BEFORE FOLD, AND THE ORDER IS LOAD-BEARING (amendment 178). A sample is
// evaluated against the accumulator as it stood BEFORE that sample was folded
// in, so an obstacle's own near face paints at full strength and only what is
// BEHIND it is masked — a coastline reads as a bright seaward rim with the
// interior dark, which is what a real marine set draws. Reversing the two lines
// makes hard cover (`h >= radarMastQ`) shadow ITSELF: `vis` at the obstacle is
// `1 - h/H <= 0`, so every land cell would evaluate to zero and a tall island
// would paint NOTHING AT ALL. The lag is bounded by one queried sample plus one
// step (~13u at the shipped 9u cell / 4u step), so the fold is at most that late
// and NEVER early — which is the direction that can only over-paint, never
// under-paint, and therefore never leak.
//
// A SLICE IS A HISTORICAL RECORD (amendment 83). Its cells and their intensities
// are decided ONCE, here, and afterwards only alpha moves, via phosphor decay.
// Nothing in a slice is ever re-evaluated: not against the live observer, not
// against the live beam, not against the live grid anchor. Cycles 54, 55 and 57
// each shipped a bug on exactly this rule.
//
// THE FREEZE IS AT **FRAME** GRANULARITY, NOT BEAM GRANULARITY, and stating that
// precisely is the point (cycle 62 review gate). One frame can owe several
// quanta — up to `catchUpArc`, ~0.35 rad at the shipped knobs — and EVERY slice
// it emits is marched against THAT FRAME'S field: the current own pose, the
// current contact poses, the current ring radius. So a slice's samples are the
// world as it was at the frame that emitted it, which lags the moment the beam
// actually crossed that bearing by up to the catch-up bound (~93ms at 15rpm, and
// only on a frame that owes more than one quantum). THE SKEW IS ACCEPTED — it is
// bounded, it is invisible at any playable frame rate, and the alternative is a
// per-quantum field rebuild that would cost a full re-stamp of every hull for
// each one. WHAT IS NOT ACCEPTED is re-evaluating a slice AFTER it is frozen,
// which is what amendment 83 actually forbids and what this file still holds
// absolutely.
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

import { beginShadowWalk, sampleHeight, wrapPositive, type HeightRaster, type Vec2 } from '@salvo/shared';
import { clamp01 } from '../util/math.js';
import { attenuation, noiseAmplitude, type NoiseEnvelope } from './radarFalloff.js';
import { FULL_TURN, cellOf, noiseMul, paintSeed, type HeatmapOpts } from './radarHeatmap.js';
import { cellKey, type FieldSample, type RadarField } from './radarField.js';

/** A scalar that may bound a loop: finite AND positive. NEGATED comparisons, so
 *  NaN is rejected rather than propagated — a non-finite `radarRange` would make
 *  `marchRay`'s `d <= toU` loop never terminate and freeze the tab. */
function finitePositive(v: number): boolean {
  return v > 0 && v < Infinity;
}

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
 * SO THE GRAIN DOES NOT SCINTILLATE, AND THAT IS THE DESIGN. The speckle is a
 * fixed spatial stencil: the same world cell draws the same multiplier on every
 * revolution, for the whole match. A fringe therefore does not shimmer between
 * paints — it holds still and the SHAPE it makes is a property of the place, in
 * exactly the sense `cellNoise` was written for. (Earlier prose in this cycle
 * said the fringe "crawls"; the implementation cannot produce that and must not,
 * per the paragraph below. The comments were corrected at the cycle-62 review
 * gate, not the behaviour.)
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
  /**
   * Frozen per-cell intensity, parallel to `cells`. A slice records ONLY what
   * some ray returned something from: a shadowed cell is absent from the record
   * entirely (cycle 69 — see the module header on the retired NO-DATA channel),
   * never present at intensity 0.
   *
   * ONE MERGE RULE, MAX-WINS, and it is the only one left now that the third
   * channel is gone: a slice's rays are close enough to share cells for their
   * whole length (~6u apart at the rim against a 9u lattice), and where two
   * adjacent bearings disagree about whether terrain is in the way, the cell
   * keeps the strongest reading any of them got. So the shadow's edge can be up
   * to one cell narrower than the truth and never wider — the safe direction,
   * since blanking a cell a bearing did return from would be a rendering rule
   * hiding a real echo.
   */
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

/**
 * RUNAWAY BACKSTOP: the most slices ONE FRAME may ever march, whatever the
 * tunables say. NOT a tuning knob — at the shipped numbers a frame owes at most
 * 7, so this sits an order of magnitude above anything real and can only ever be
 * reached by a degenerate retune. A near-zero `sliceRad` would otherwise ask for
 * `catchUpRad / sliceRad` marches inside one frame and stall the render thread,
 * which is a hang rather than a visual defect.
 */
export const MAX_SLICES_PER_FRAME = 64;

/**
 * THE ARC ONE FRAME MAY MARCH — the catch-up bound rounded UP to whole quanta
 * (and down to the backstop above).
 *
 * IT IS BOTH THE EMISSION CAP AND THE CURSOR RESET, and that identity is the fix
 * for the cycle-62 review gate's second finding. Those used to be two different
 * arcs: `sliceCount` capped the EMISSION at `floor(catchUpRad / sliceRad)` = 7
 * quanta = 0.354 rad, while the adapter reset the CURSOR whenever the advance
 * passed `catchUpRad` = 0.4 rad. A frame landing between them advanced past arc
 * it was not allowed to paint, the deficit accumulated, and the reset then
 * discarded it — up to 0.4 rad of scope silently unpainted on a recurring
 * cadence, at any frame rate that happened to land in that window.
 *
 * ROUNDING UP is what closes it: the frame may emit `ceil(catchUpRad / sliceRad)`
 * quanta, which is ≥ `catchUpRad`, so every advance INSIDE the bound is fully
 * paintable and any remainder is carried rather than dropped. Only an advance
 * past this arc is skipped, which is the ruled behaviour and is now the only
 * place arc is ever lost.
 */
export function catchUpArc(o: MarchOpts): number {
  if (!finitePositive(o.sliceRad)) return 0;
  const limit = finitePositive(o.catchUpRad) ? Math.min(o.catchUpRad, FULL_TURN) : 0;
  const n = Math.max(0, Math.min(MAX_SLICES_PER_FRAME, Math.ceil(limit / o.sliceRad - 1e-9)));
  return n * o.sliceRad;
}

/** How many whole slices the beam has earned across an arc. Pure, so slice
 *  cadence is testable without a clock. */
export function sliceCount(from: number, to: number, o: MarchOpts): number {
  if (!finitePositive(o.sliceRad)) return 0;
  const span = Math.min(wrapPositive(to - from), catchUpArc(o));
  // The epsilon is load-bearing, not decoration: the caller advances its cursor
  // by exactly `sliceRad` per slice, so an arc of N quanta accumulates N rounds
  // of float dust and lands a hair under N — and a bare `floor` would owe N−1
  // forever, leaving one quantum of the scope permanently unpainted at every
  // frame rate but the ones that happen to land on the boundary.
  return Math.min(MAX_SLICES_PER_FRAME, Math.floor(span / o.sliceRad + 1e-9));
}

/**
 * THE FRAME'S MARCH PLAN: where the cursor starts and how many whole slices it
 * owes. Pure, and the ONLY place the catch-up rule lives — the adapter used to
 * carry half of it, which is how the cycle-62 gate's worst defect got in.
 *
 * THREE REGIMES, AND THE MIDDLE ONE IS THE BUG THAT WAS SHIPPED:
 *
 *   • A NORMAL ADVANCE (under `catchUpArc`) keeps the cursor and owes whatever
 *     whole quanta it has earned. A frame that advances less than one quantum
 *     emits nothing and LOSES nothing — the remainder is still owed.
 *
 *   • A LATE FRAME (over `catchUpArc`) resumes at `rot − catchUpArc`, NOT at the
 *     live beam. Resuming at the live beam is what the adapter did, and it meant
 *     a frame advancing past the bound emitted NOTHING AT ALL: the cursor jumped
 *     to `rot`, `owed` computed to 0, and if EVERY frame did that — sustained
 *     below ~3.9fps at base 15rpm, or ~7.9fps at the boon-scaled `sweepRpmMax`
 *     of 30 — no slice was ever created again, the existing ones decayed out in
 *     ~12s, and the player watched a bare sweep line rotate over an empty scope.
 *     Backing off by exactly the arc the frame is allowed to paint keeps the
 *     trailing wedge painting at ANY frame rate; only the arc BEYOND the bound is
 *     skipped, which is the ruled behaviour (a tab backgrounded for a minute must
 *     not stamp fifteen revolutions into one frame, and every paint it would have
 *     made is older than the phosphor life anyway).
 *
 *   • A NON-POSITIVE ADVANCE re-anchors and emits nothing. A fresh `lastSweep`
 *     sample or a server-clock correction can legitimately put the live beam a
 *     little BEHIND the cursor; `wrapPositive` reads that as ~2π, which would
 *     otherwise trip the catch-up path and re-march arc the beam already swept as
 *     duplicate FRESH slices — re-aging a wedge of the scope on every correction.
 *     The backward window is the catch-up bound mirrored about the full turn, so
 *     there is exactly one knob. A forward frame slow enough to land in it (more
 *     than ~94% of a revolution in one frame — under 0.3fps at 15rpm) is read as
 *     a correction and re-anchors, which is precisely what the shipped code did
 *     for that regime anyway.
 */
export function planMarch(from: number, rot: number, o: MarchOpts): { from: number; owed: number } {
  if (!Number.isFinite(from) || !Number.isFinite(rot)) return { from: rot, owed: 0 };
  const arc = catchUpArc(o);
  const adv = wrapPositive(rot - from);
  if (!(adv > 0) || adv > FULL_TURN - Math.min(FULL_TURN / 2, arc)) return { from: rot, owed: 0 };
  const start = adv > arc ? wrapPositive(rot - arc) : from;
  return { from: start, owed: sliceCount(start, rot, o) };
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
 * the pre-grain intensity, so a saturated core is rock steady while a marginal
 * fringe breaks up into a stable speckle (amendment 143). STABLE, not crawling:
 * one seed for the whole match means the stencil never re-rolls, so what the
 * grain varies is intensity ACROSS PLACE and never across time (see
 * `MARCH_SEED`).
 *
 * THE AMPLITUDE IS SCALED BY THE MATERIAL (Story 4.12, amendment 203). Grain
 * models the scintillation of incoherent scatter, and a wake is an organized
 * surface feature rather than random roughness, so it carries a reduced scale
 * (`FieldSample.grain`, absent = 1 = ambient). Note the STENCIL is unchanged: the
 * same `cellNoise` draw at the same world cell, only its amplitude differs — so
 * two materials meeting in one cell still agree about which way that cell's
 * grain leans, and the speckle stays a property of the PLACE.
 */
function sampleIntensity(
  s: FieldSample,
  dist: number,
  gx: number,
  gy: number,
  env: NoiseEnvelope,
): number {
  const raw = returnStrength(s, dist);
  return raw * noiseMul(MARCH_SEED, gx, gy, noiseAmplitude(raw, env, s.grain ?? 1));
}

/**
 * APPLY THE RAY'S ILLUMINATED FRACTION TO ONE SAMPLE, FLOORED AT THE MATERIAL'S
 * OWN GUARANTEE (Story 4.11, corrected at the review gate).
 *
 * `min` is `FieldSample.shadowFloor ?? FieldSample.min`: `model.minPeak` for a
 * hull, the still-lit intensity for a DISCLOSED wake segment (Story 4.12), 0 for
 * everything else. So for terrain, surf, clutter and the storm wall this is
 * exactly `raw × vis`, bit for bit — a landmass still goes fully dark, and a
 * fully dark cell is simply not stored.
 *
 * `vis` here is whichever INSTANCE of the illumination rule the sample earned
 * (module header): the mast fraction for anything afloat, the soft step against
 * its own height for terrain. This function does not care which — it only holds
 * the floor. A WAKE IS AFLOAT AND TAKES THE MAST FRACTION, not the terrain step,
 * and that is load-bearing rather than incidental: the server gates a wake
 * segment with `visibilityTo`, the ship query, so the paint must be masked with
 * the same instance the gate used or the two sides disagree about what was
 * disclosed. Its `terrainQ` is 0, which cycle 69 defines as "not terrain" rather
 * than "sea level" for exactly this reason.
 *
 * FOR A HULL IT IS THE WHOLE OF AMENDMENT 127 UNDER OCCLUSION. Shadow may only
 * ever WEAKEN a hull's mark, never brighten it and never erase it:
 *
 *   • `Math.min(raw, min)` is the floor — the material's guarantee, or the
 *     sample's own unshadowed reading when that is already below it (a rim echo
 *     whose grain drew under `minPeak`). Clamping to the SMALLER of the two is
 *     what stops a shadow from making a faint echo BRIGHTER than it was.
 *   • The floor cannot be dropped by the store threshold: `returnStrength`
 *     floors a hull at `minPeak` = 0.2 BEFORE the grain, and the grain's worst
 *     draw there is 0.136 — above `bands[0].at` = 0.12. A disclosed echo
 *     therefore paints at least a green speck at any shadow depth, which is the
 *     property `raster: null` used to buy by refusing to attenuate at all.
 *
 * A partially shadowed hull reads weaker (`raw × vis` while that is above the
 * floor, so it walks red → blue → green exactly as the AC asks) and then holds
 * at the floor instead of cutting out.
 */
export function shade(raw: number, vis: number, min: number): number {
  return Math.max(raw * vis, Math.min(raw, min));
}

/**
 * THE TERRAIN INSTANCE OF THE ILLUMINATION RULE (cycle 69) — a SOFT STEP at the
 * grazing ray, and the one place it is written down.
 *
 * `hq` is the sample's OWN quantized raster height (`FieldSample.terrainQ`, > 0
 * by construction on terrain and 0 on everything else) and `requiredQ` is the
 * grazing ray's height there (`ShadowWalk.requiredHeightAt`). A point on a
 * surface is above the ray or below it — it has no waterline-to-masthead column
 * to be masked from the bottom up — so the answer is 1 above, 0 below, with a
 * `softQ`-wide ramp across the crossing so the shadow's edge is soft rather than
 * a hard line.
 *
 * WHY NOT `illuminatedFraction`, which is RIGHT THERE and shares the rule.
 * Because the honest fraction `(h − required)/h` is the COLUMN answer, and on a
 * real upper slope it measures 0.02-0.15 — so using it as an intensity
 * multiplier would render the newly-painted mountainside at ~3% and the fix
 * would look like nothing had changed. The fraction is the correct occlusion
 * answer for a ship and the wrong intensity for a surface.
 *
 * THE RAMP IS NEVER WIDER THAN THE SAMPLE'S OWN HEIGHT, and that clamp is
 * load-bearing rather than defensive: on a clear bearing `requiredQ` is 0, so a
 * fixed `softQ` would dim every low coastal flat that has never been shadowed by
 * anything (a q5 mudflat would paint at 5/16 of its material). With the clamp,
 * clear ground always answers exactly 1, and for terrain shorter than the band
 * this degenerates to `illuminatedFraction(hq, requiredQ)` — the shared rule,
 * unchanged, at the only heights where the column reading is also right.
 *
 * A non-terrain sample (`hq <= 0`) answers 0 rather than failing open: water has
 * no height of its own to clear the ray with, and feeding its 0 in here would
 * erase the shadow it is standing in. Callers must hand water, surf, clutter,
 * storm and hulls to the MAST instance (`ShadowWalk.visibilityAt`) instead.
 *
 * A non-positive `softQ` is the HARD STEP — lit or dark, no ramp at all. It is
 * the documented value of the knob, not a degenerate input.
 */
export function terrainIllumination(hq: number, requiredQ: number, softQ: number): number {
  if (!(hq > 0)) return 0;
  if (!(softQ > 0)) return hq > requiredQ ? 1 : 0;
  return clamp01((hq - requiredQ) / Math.min(softQ, hq));
}

/** Everything one march run needs beyond the arc it is walking. */
interface RunCtx {
  obs: Vec2;
  field: RadarField;
  /** `RadarField.disclosed` — TRUE for the wire-echo field, whose contents the
   *  server already disclosed. On such a ray the shadow attenuates (floored by
   *  `shade`) and never suppresses. */
  disclosed: boolean;
  /** The field's OWN height raster (`RadarField.raster`) — one land answer, one
   *  source. Null on a field with no terrain, which makes the shadow walk fail
   *  open and the march byte-identical to the pre-4.11 one. */
  raster: HeightRaster | null;
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

/**
 * March ONE bearing, accumulating cells into the scratch (max-wins, so two rays
 * crossing a cell keep the stronger reading — the same rule `writeCell` uses one
 * level down). Consecutive samples that land in the same cell are priced once:
 * the step is deliberately finer than a cell so a ray cannot skip one, and the
 * key compare is what stops that oversampling costing a field query.
 *
 * AND IT CARRIES THE SHADOW (Story 4.11, corrected in cycle 69). One walk per
 * ray. At every queried sample BOTH readings of the accumulator are taken BEFORE
 * anything at that sample's own distance is folded (see the module header — the
 * reverse order makes hard cover shadow itself): the mast fraction for whatever
 * is afloat there, and the grazing ray's own height for whatever terrain is. The
 * walk is then advanced to the sample's own CELL ENTRY rather than to the sample,
 * which is the far-end half of "a cell never occludes a query point inside it"
 * and the difference between a slope painting continuously and painting in
 * stripes at raster pitch.
 *
 * The walk's own DDA decides which cells fold and at what distance, independent
 * of `stepU` — that is what keeps the client's fold cadence the SAME as the
 * server gate's, though not its query order: the client is up to one sample plus
 * one step plus (since cycle 69) one raster cell behind at a shadow's leading
 * edge. All three are the OVER-painting direction, which is the only one that
 * cannot leak (module header, amendment 187).
 */
function marchRay(bearing: number, c: RunCtx): void {
  const cellU = c.o.cellU;
  const dx = Math.cos(bearing);
  const dy = Math.sin(bearing);
  // CLAMPED TO HALF A CELL, so the no-skip claim above survives ANY `cellU`
  // retune rather than depending on the shipped pairing (stepU 4, cellU 6). With
  // the step at most half a cell, consecutive samples land in the same cell or an
  // adjacent one on each axis — never two cells apart — so a ray cannot step over
  // a cell it passes squarely through. (A ray clipping a cell CORNER can still
  // miss it, which no fixed-step march can avoid and no consumer depends on.)
  const step = Math.min(c.o.march.stepU, cellU * 0.5);
  const walk = beginShadowWalk(c.raster, c.obs.x, c.obs.y, dx, dy);
  // A RADIAL WINDOW IS A COMPUTE BOUND, NEVER A SHADOW ONE: a ray clipped to a
  // slab still crossed everything between the antenna and that slab, so the walk
  // is advanced to the window's start before the FIRST query rather than being
  // handed its whole history one sample late. `fromU` is 0 on the beam march and
  // `advanceTo(0)` folds nothing (the observer's own cell never occludes), so
  // this is inert there and only ever bites on the wire-echo slab.
  walk.advanceTo(c.fromU);
  let lastKey = Number.NaN;
  for (let d = c.fromU; d <= c.toU; d += step) {
    const x = c.obs.x + dx * d;
    const y = c.obs.y + dy * d;
    const gx = cellOf(x, cellU);
    const gy = cellOf(y, cellU);
    const key = cellKey(gx, gy);
    if (key === lastKey) continue; // consecutive samples in one cell: price it once
    lastKey = key;
    // QUERY, then fold — see the module header. NOTHING SHORT-CIRCUITS ON THE
    // REACH any more (cycle 69): past it a mast-height target is dark, but the
    // grazing ray keeps rising and terrain that stands over it still paints, so
    // the accumulator must keep advancing or a far peak would be measured
    // against a stale ray.
    paintSample(c, x, y, d, gx, gy, key, walk.visibilityAt(d), walk.requiredHeightAt(d));
    walk.advanceTo(walk.cellEntryAt(d));
  }
}

/**
 * Record ONE sample: the shadow's verdict, then the field's answer through the
 * model, then the store threshold.
 *
 * `vis` is the MAST instance of the illumination rule and `req` the grazing ray's
 * own height, both read from the accumulator as it stood before this sample's own
 * cell folded. Which one masks the sample is decided by WHAT THE FIELD ANSWERED
 * WITH, not by what the ray guessed: `FieldSample.terrainQ` is non-zero on
 * exactly the terrain layer, so a hull hugging a coastline is still masked as a
 * hull even though its cell is land (module header).
 *
 * THE DARK BRANCH SKIPS THE FIELD QUERY, AND THAT IS WHERE THE COST SAVING LIVES,
 * but it may only skip a sample that can return NOTHING. Two ways to be dark:
 * the mast answer is 0 AND no terrain stands over the ray here. The second test
 * is one `Uint8Array` read against the field's own raster — far cheaper than the
 * five-layer field query it avoids, and it is the whole reason a summit behind a
 * shadowed foreslope reaches the scope at all.
 *
 * On a DISCLOSED field (the wire echo) the server has already answered that
 * bearing, so the sample is always priced and merely attenuated: `shade` floors
 * it at the material's guarantee, so it fades and never cuts.
 */
function paintSample(
  c: RunCtx,
  x: number,
  y: number,
  d: number,
  gx: number,
  gy: number,
  key: number,
  vis: number,
  req: number,
): void {
  if (!(vis > 0) && !c.disclosed && !terrainOverRay(c, x, y, req)) return;
  const s = c.field.sampleAt(x, y, d);
  if (s === null) return;
  const lit = s.terrainQ > 0 ? terrainIllumination(s.terrainQ, req, c.o.terrainSoftQ) : vis;
  if (!(lit > 0) && !c.disclosed) return; // a surface below the grazing ray
  // `shadowFloor ?? min` — the two floors are different promises and only one
  // material distinguishes them (see `FieldSample.shadowFloor`); everything that
  // predates Story 4.12 leaves it absent and reads exactly as it did. A disclosed
  // wake segment reaches here with `lit === 0` and survives on that floor alone,
  // which is amendment 190: suppression is forbidden, attenuation is not.
  const i = shade(sampleIntensity(s, d, gx, gy, c.o.noise), lit, s.shadowFloor ?? s.min);
  if (!(i >= c.minStore)) return; // NaN-safe: a non-finite sample stores nothing
  pushCell(key, gx, gy, i);
}

/** Is there terrain at this point standing OVER the grazing ray? The cheap
 *  pre-test that lets a fully shadowed bearing skip the field query without
 *  skipping the mountain past the shadow (`paintSample`). Reads the SAME raster
 *  the field's own land test reads (`RadarField.raster`), so the two can never
 *  disagree about where a coastline is. */
function terrainOverRay(c: RunCtx, x: number, y: number, req: number): boolean {
  if (c.raster === null) return false;
  const h = sampleHeight(c.raster, x, y);
  return h > 0 && h > req; // `h > 0` IS the land test — water has no height
}

/**
 * Freeze the accumulator into a slice record, or null when nothing painted.
 *
 * A FULLY SHADOWED QUANTUM IS NOW LEGITIMATELY NOTHING (cycle 69). While the
 * NO-DATA channel existed, such a slice still had cells in it and returning null
 * would have made a hard-cover shadow vanish instead of drawing grey. With the
 * channel deleted a bearing that learned nothing records nothing, `sN` is 0, and
 * both call sites correctly drop the slice — there is no record to keep.
 */
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

/**
 * CONCATENATE SLICES OF THE SAME AGE INTO ONE RECORD (Story 4.12).
 *
 * A slice is a bag of frozen cells with one timestamp — nothing about it requires
 * its cells to be contiguous in bearing, and `stampSlice` is a flat copy under
 * `writeCell`'s arbitration. So N records sharing a `t` are exactly equivalent to
 * one record holding all their cells, and the merged form costs one bounding-box
 * reject and one loop instead of N.
 *
 * IT EXISTS BECAUSE THE WAKE ROW IS PER SEGMENT. A ribbon discloses one row per
 * ~12u of track, so a busy room emits roughly an order of magnitude more wake
 * rows than hull echoes; enrolling one slice apiece would push the live list past
 * `maxSlices()` and turn a runaway BACKSTOP into a silent trim on legitimate
 * history. The merge is where that is prevented, and it changes no cell's
 * reading: duplicate cells across the inputs are arbitrated by exactly the same
 * `writeCell` rule they would have met one frame later.
 *
 * `t` is taken from the FIRST input and the caller is expected to group by it;
 * mixing ages here would silently re-date paints, so callers group rather than
 * this function averaging. Returns the single input unchanged when there is one,
 * and null for an empty list.
 */
export function mergeSlices(slices: readonly MarchSlice[]): MarchSlice | null {
  if (slices.length === 0) return null;
  if (slices.length === 1) return slices[0];
  let n = 0;
  for (const s of slices) n += s.n;
  const out: MarchSlice = {
    kind: 'slice',
    cells: new Int32Array(n * 2),
    w: new Float32Array(n),
    n,
    t: slices[0].t,
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let k = 0;
  for (const s of slices) {
    out.cells.set(s.cells.subarray(0, s.n * 2), k * 2);
    out.w.set(s.w.subarray(0, s.n), k);
    k += s.n;
    out.minX = Math.min(out.minX, s.minX);
    out.minY = Math.min(out.minY, s.minY);
    out.maxX = Math.max(out.maxX, s.maxX);
    out.maxY = Math.max(out.maxY, s.maxY);
  }
  return out;
}

/**
 * EVERY EXTERNALLY-SUPPLIED SCALAR THAT BOUNDS A LOOP, CHECKED FOR FINITENESS —
 * not merely for sign. `radarRange = Infinity` passes `> 0` and then `marchRay`'s
 * `d <= toU` never terminates, which freezes the tab rather than drawing
 * something wrong; a zero `cellU` divides every sample's cell index to Infinity.
 * These are inputs from a config object and a stats broadcast, so "no shipped
 * caller does that" is not the same as "cannot happen".
 */
function marchable(obs: Vec2, span: number, radarRange: number, o: HeatmapOpts): boolean {
  return (
    span > 0
    && finitePositive(radarRange)
    && finitePositive(o.march.stepU)
    && finitePositive(o.cellU)
    && Number.isFinite(obs.x + obs.y)
  );
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
 * Returns null for a slice that recorded nothing at all — no return AND no
 * shadow (open water, the ordinary case) — and for every degenerate input — a non-finite observer or range, a zero-width
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
  // A FULL TURN IS A FULL TURN, not zero. `wrapPositive(2π)` folds to 0, so an
  // echo close enough to subtend its own reach — `echoArc` answers `half = π`
  // there — used to ask for the whole circle and paint nothing at all.
  const raw = to - from;
  const span = raw >= FULL_TURN ? FULL_TURN : wrapPositive(raw);
  if (!marchable(obs, span, radarRange, o)) return null;
  const w = resolveWindow(radarRange, win);
  const dTheta = rayStep(radarRange, o.march);
  if (w === null || !finitePositive(dTheta)) return null;
  const ctx: RunCtx = {
    obs,
    field,
    disclosed: field.disclosed,
    raster: field.raster,
    fromU: w.fromU,
    toU: w.toU,
    o,
    minStore: o.bands[0]?.at ?? 0,
  };
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
 *
 * AN ECHO INSIDE ITS OWN REACH SUBTENDS EVERYTHING (`half = π`), which is a
 * legitimate answer and not a degenerate one — `marchSlice` recognises the
 * resulting full turn explicitly rather than letting `wrapPositive` fold 2π back
 * to zero and paint nothing.
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
