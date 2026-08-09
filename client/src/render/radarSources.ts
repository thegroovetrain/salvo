// THE TWO WEATHER-ISH MATERIALS (Story 4.10, amendments 128 + 130; folded into
// the field by cycle 62, amendment 138): SEA CLUTTER and the STORM WALL. Pure
// math, no Pixi, no state.
//
// WHAT CYCLE 62 CHANGED HERE, AND WHAT IT DID NOT. These were independent PAINT
// KINDS: each opened its own arc-gated record, baked or stamped its own cells and
// carried its own occluder handling. The beam march retires that primitive
// wholesale (amendment 138), so what is left is what these two things ARE — a
// coefficient, a geometry class and a shape — answered per point through
// render/radarField.ts's one seam. The march does the rest: it paints them when
// the beam crosses them, freezes them into a slice, and decays them, under
// exactly the same rules terrain and hulls answer to.
//
// Everything the grammar guarantees still applies to them, and none of it is
// re-argued here: a paint is a historical record (amendment 83 — the field
// freezes the observer and the ring, and a slice freezes the samples); nothing
// viewport-derived reaches creation or retirement (amendment 97 — not one
// function in this file takes a camera, a zoom or a viewport); the sweep is the
// only thing that paints; and colour is intensity, never category (amendment 105
// — neither material has a colour, only a coefficient).
//
// WHY THE STORM PAINTS ITS WALL AND NOT ITS AREA (amendment 128). The volume
// return falls off as 1/d^2, which is shallow enough to stay legible clear across
// the map: an AREA return would own roughly half the scope at full strength
// late-match and bury every contact inside it, against the epic's own guardrail
// that "information noise must never bury the hunt". So the return is the closing
// WALL — a fixed-thickness band on the live ring. Both the whole outside-the-ring
// region and deferring the storm entirely were put to Eric and REJECTED. It
// discloses nothing: ring geometry is on the wire from its reveal beat (Story
// 3.1). AND ONLY THE LIVE RING — the dashed next-ring telegraph is a chart
// annotation, not a physical object, and there is nothing out there yet to
// reflect off; the field's `ring` is the live one alone.
//
// WHY CLUTTER CAN NEVER MASK ANYTHING (amendments 130 + 133 + 136). Sea clutter
// is TEXTURE AND NOTHING ELSE, and its coefficient carries THREE bounds, every
// one of them stated at the noise envelope's most favourable draw — and cycle 62
// re-derived all three, because amendment 143 replaced the flat +/-30% jitter
// those bounds were proved against and amendment 135 binds: A BOUND PROVED AT
// NOMINAL IS NOT PROVED. It STRADDLES `bands[0].at` so the speckle exists at all,
// it stays below `bands[1].at` so it is green at every range, and it stays below
// the faintest legitimate echo's worst draw so it cannot outrank a real return
// under `writeCell`'s max-wins rule — which matters because the winner takes the
// cell's alpha as well as its intensity, so a clutter cell that won would also
// re-age a decaying echo. All three are asserted at the shipped envelope in
// __tests__/radarHeatmap.test.ts. Clutter strong enough to swallow weak returns
// close in was put to Eric as a real mechanic and DECLINED; raising the
// coefficient past the blue threshold is a DESIGN change, not a tuning change.
//
// AND IT IS SEA CLUTTER, SO IT PAINTS ONLY ON SEA — now STRUCTURALLY. The field
// answers ONE material per point and terrain outranks clutter, so the haze cannot
// light a land cell at all. The frozen occluder shortlist that used to enforce
// half of this is gone with every other occlusion test (amendment 140) and
// nothing was lost with it: what it bought beyond the land test was cross-island
// LOS, which Story 4.11 owns wholesale and will do against the height raster.

import { WAKE_AGE_BUCKETS, type Vec2 } from '@salvo/shared';
import { SURFACE, VOLUME } from './radarFalloff.js';
import type { FieldSample } from './radarField.js';
import type { ReturnModelOpts } from './radarHeatmap.js';

/** The live storm ring, structurally — the `ZoneView.cur` fields this needs and
 *  nothing else, so this module never imports the zone layer. */
export interface StormRing {
  cx: number;
  cy: number;
  r: number;
}

/** Fraction of full strength the storm wall keeps at the seaward/landward EDGE
 *  of its band, so the wall reads as a wall with soft shoulders rather than as a
 *  drawn line. The spine (the live ring radius exactly) is full strength. */
const STORM_EDGE = 0.35;

/**
 * THE STORM WALL AT A POINT: the storm coefficient on the VOLUME curve, shaped
 * across the band so the spine is strongest, or null off the band.
 *
 * A fixed thickness is the whole of amendment 128 — the wall is a physical object
 * of its own size, not a region whose extent grows as the ring closes. A ring the
 * client cannot describe (non-finite centre or radius) answers null everywhere
 * rather than propagating a NaN into a cell write.
 */
export function stormSample(
  ring: StormRing,
  x: number,
  y: number,
  m: ReturnModelOpts,
): FieldSample | null {
  const half = m.stormBandU / 2;
  if (!(half > 0) || !(ring.r > 0) || !Number.isFinite(ring.r + ring.cx + ring.cy)) return null;
  const off = Math.abs(Math.hypot(x - ring.cx, y - ring.cy) - ring.r) / half;
  if (!(off <= 1)) return null;
  return {
    refl: m.storm * (1 - (1 - STORM_EDGE) * off * off),
    geom: VOLUME,
    ref: m.volumeRef,
    floor: m.floor,
    min: 0,
    terrainQ: 0, // weather, not ground — masked at mast height like every column
  };
}

/**
 * SEA CLUTTER AT A POINT: the tiny surface coefficient on the SURFACE curve
 * against the haze's OWN reference range, or null outside the compute bound.
 *
 * `clutterRef` is much shorter than the coastline's reference, and that pairing is
 * what makes the near-ship CONCENTRATION and the fade at the haze's edge both
 * fall out of the curve (amendment 130) rather than out of a hand-placed radius:
 * on the shared `surfaceRef` the return was still at 99.7% of peak at the compute
 * bound, so the speckle density stepped from a quarter of the cells straight to
 * zero at a drawn circle. `clutterRangeU` is therefore a PURE COMPUTE BOUND with
 * nothing visible at it — the march simply stops paying for cells the falloff has
 * already taken under the transparency threshold.
 *
 * Note the reflectivity is flat inside the disc: the RANGE term is the march's
 * job, exactly as it is for terrain and hulls. That is the point of the field
 * seam — no material carries its own attenuation.
 */
export function clutterSample(
  obs: Vec2,
  x: number,
  y: number,
  m: ReturnModelOpts,
): FieldSample | null {
  const reach = m.clutterRangeU;
  if (!(reach > 0)) return null;
  const dx = x - obs.x;
  const dy = y - obs.y;
  if (dx * dx + dy * dy > reach * reach) return null;
  // `terrainQ: 0` — sea state stands ON the water, at the antenna's own height.
  return { refl: m.clutter, geom: SURFACE, ref: m.clutterRef, floor: m.floor, min: 0, terrainQ: 0 };
}

// --- DISTURBED WATER: the wake, and the chop that hangs off it -------------------
//
// TWO MATERIALS, ONE PHENOMENON (Story 4.12, amendments 194-206). A hull under
// way leaves a TRACK — a turbulent core at roughly its own beam, server-owned and
// rasterized onto the shared radar lattice exactly as the hull itself is — and it
// PUSHES water aside around that track. The track carries information (course and
// recency of a hull you may not otherwise hold) and therefore comes off the wire,
// gated; the chop carries NONE and is synthesized here, client-side, at paint
// creation (amendment 202).
//
// CAMOUFLAGE IS BY STRUCTURE, NOT BY STRENGTH (amendment 198 — Eric's ruling
// against a bound he has now declined twice). Both are GREEN, at the SAME
// `bandAlpha`, and neither has a brightness channel of any kind. What separates
// them is CONTINUITY: the wake's corridor is calibrated so every draw lights,
// while chop rides sea clutter's ratified STRADDLE and lights a scattered
// minority. The player picks a coherent LINE out of random dots, and no
// information is ever suppressed — chop may never outrank, overwrite or hide any
// return, and may never reach blue.
//
// TWO CLOCKS, AND CONFUSING THEM WOULD BE A BRIGHTNESS RAMP. Amendment 161 is
// untouched: PHOSPHOR alpha carries paint age and only paint age. What lives here
// is the WATER's own age, and it moves INTENSITY — so an old paint of fresh water
// is faint-but-long while a fresh paint of old water is full-opacity-but-short.
// Length is the recency channel (amendment 203); there is no ramp anywhere.

/**
 * The Kelvin wedge's half-angle, as its SINE — exactly 1/3, a genuine constant
 * of deep-water ship waves and INDEPENDENT OF SPEED (amendment 205: *"use it for
 * the hull-side displaced water rather than inventing a spread"*). 19.47°.
 *
 * Stated as the sine because that is the exact form, because the two quantities
 * the chop geometry needs both fall out of it without a transcendental
 * (`tan θ = 1/(2√2)`), and because a degrees literal would invite someone to
 * round it into a tuning knob. It is neither.
 */
export const KELVIN_SIN = 1 / 3;

/**
 * THE CHOP ENVELOPE'S HALF-WIDTH AT THE RIBBON'S HEAD, as a multiple of the
 * turbulent core's own half-width — `1/sin θ` = 3, taken from the wedge constant
 * rather than invented (amendment 205: the core *"runs at roughly the hull's beam
 * widening to a small multiple of it"*).
 *
 * SO CHOP SCALES WITH THE HULL, WHICH IS WHAT MAKES A TORPEDO STAY NAKED. A
 * battleship's 32u beam pushes a real patch of disturbed water; a torpedo's
 * one-cell ribbon pushes barely a cell of it — amendment 197's accepted
 * consequence (*"a torpedo wake running through empty ocean far from any hull is
 * UNCAMOUFLAGED and reads plainly"*) holding BY CONSTRUCTION, with no identity on
 * the wire to branch on and no special case to write. If Eric ever wants more
 * camouflage, THIS multiple is the lever — not the coefficient, which carries
 * three ratified bounds.
 */
export const CHOP_HEAD_MULTIPLE = 1 / KELVIN_SIN;

/**
 * A wake segment's MATERIAL, scaled by its water-age bucket.
 *
 * The scale runs LINEARLY from 1 at the freshest bucket to `m.wakeAgeFloor` at
 * the oldest, and the floor is derived so that end-of-life water reads exactly as
 * fresh water does at the material's own reach — age and range spend the same
 * coin, so the visible track walks from the 5/8 rung down to nothing across the
 * buckets and SHORTENS as it ages (amendment 203). A single-bucket wire
 * (`WAKE_AGE_BUCKETS = 1`) degrades to "always freshest" rather than dividing by
 * zero, and an out-of-range or non-finite bucket clamps to the oldest — fail
 * toward "about to be gone", the same direction `wakeAgeBucket` fails in.
 *
 * NO `min` FLOOR, AND A `shadowFloor` ONLY WHEN THE SERVER DISCLOSED IT. `min`
 * is applied in `returnStrength`, BEFORE the range term, so a `min` here would
 * freeze the track at full length and full life forever — the reach and the age
 * ladder are the two things this material exists to express, and amendment 127's
 * *"anything the server blips paints at least a speck"* is a promise about a
 * CONTACT, not about water. What a disclosed segment does need is that the
 * client's own (deliberately more generous) shadow walk cannot delete a segment
 * the server's gate passed, and that rides `shadowFloor` — applied after the
 * shadow and nowhere else. See `FieldSample.shadowFloor` and `wakeLitFloor`.
 */
export function wakeSample(m: ReturnModelOpts, bucket: number, shadowFloor = 0): FieldSample {
  return {
    refl: m.wake * wakeAgeScale(m, bucket),
    geom: SURFACE,
    ref: m.wakeRef,
    floor: m.floor,
    min: 0,
    // 0 is "NOT TERRAIN", never "sea level" (cycle 69's `FieldSample.terrainQ`).
    // Water is AFLOAT, so a wake takes the mast-height instance of the
    // illumination rule — the same one `visibilityTo` gates the segment with on
    // the server. Handing it the terrain step would mask the paint with a rule
    // the disclosure never used.
    terrainQ: 0,
    shadowFloor,
    grain: m.wakeGrain,
  };
}

/**
 * THE INTENSITY AT WHICH DISTURBED WATER STILL LIGHTS EVERY CELL — the floor a
 * DISCLOSED segment may be attenuated to and no further (amendment 190).
 *
 * It is `m.wake × m.wakeAgeFloor` and that is not a coincidence: the oldest
 * bucket's scale is DERIVED as the intensity whose unluckiest draw lands exactly
 * on the transparency threshold, so the end of the age ladder and the still-lit
 * floor are the same number by construction and cannot drift apart.
 */
export function wakeLitFloor(m: ReturnModelOpts): number {
  return m.wake * m.wakeAgeFloor;
}

/** The water-age intensity scale for a bucket — 1 at the freshest,
 *  `m.wakeAgeFloor` at the oldest, linear between. */
export function wakeAgeScale(m: ReturnModelOpts, bucket: number): number {
  const last = WAKE_AGE_BUCKETS - 1;
  if (!(last > 0)) return 1;
  const b = Number.isFinite(bucket) ? Math.min(last, Math.max(0, Math.floor(bucket))) : last;
  return 1 - (b / last) * (1 - m.wakeAgeFloor);
}

/**
 * THE FRACTION OF ITS CORE CELLS A BUCKET ACTUALLY LAYS (cycle 71, amendment
 * 214) — 1 at the freshest, `m.wakeTailKeep` at the oldest, linear between.
 *
 * THE SECOND RECENCY CHANNEL, and the one that reads CLOSE IN. `wakeAgeScale`
 * is the first, but it is derived out of the wake corridor and the corridor left
 * it ~3% of range to work in (see `wakeTailKeep` in config.ts) — so inside the
 * material's reach, where every draw clears the threshold comfortably, it does
 * nothing at all and the track is a uniform bar with a square end. This one is
 * a COUNT rather than a brightness, so it reads at every range.
 *
 * It cannot disturb the calibration. Every bound the wake material is held to —
 * lights on its unluckiest draw, never outranks `minPeak`'s worst draw, never
 * blue — is a statement about what ONE cell may do, and this changes only WHICH
 * cells exist. The cells that do lay are byte-identical to before.
 *
 * DEGRADES TOWARD "ABOUT TO BE GONE", the direction every wake-age path fails
 * in (`wakeAgeBucket`, `wakeAgeScale`): a garbage bucket keeps the OLDEST
 * fraction, so a malformed wire frame thins a track rather than solidifying one.
 */
export function wakeKeepFraction(m: ReturnModelOpts, bucket: number): number {
  const last = WAKE_AGE_BUCKETS - 1;
  if (!(last > 0)) return 1;
  const keep = Number.isFinite(m.wakeTailKeep) ? Math.min(1, Math.max(0, m.wakeTailKeep)) : 1;
  const b = Number.isFinite(bucket) ? Math.min(last, Math.max(0, Math.floor(bucket))) : last;
  return 1 - (b / last) * (1 - keep);
}

/**
 * SHIP-DISPLACEMENT CHOP'S MATERIAL — sea clutter's coefficient VERBATIM
 * (amendment 202), at the AMBIENT grain, on the wake's own reference range.
 *
 * Reusing the coefficient rather than minting a new one is the whole reason this
 * needs no calibration of its own: clutter's three ratified bounds (straddle,
 * never blue, never outranks `minPeak`'s worst draw) are statements about the
 * COEFFICIENT at its peak, and attenuation is ≤ 1 everywhere, so they hold at
 * every range and on any reference. What the reference decides is only where the
 * speckle FADES OUT, and it must be the wake's: on `clutterRef` every chop cell
 * would fall under the threshold ~72u from the OBSERVER, which is the one region
 * (inside truesight, under the near-range dim mask) where camouflage is not
 * wanted at all.
 *
 * AMBIENT GRAIN IS THE POINT, not an oversight. Chop is genuinely incoherent
 * scatter and the straddle is what speckles it; handing it the wake's reduced
 * grain would turn the dots into a second continuous line and delete amendment
 * 198's whole mechanism.
 */
export function chopSample(m: ReturnModelOpts): FieldSample {
  return { refl: m.clutter, geom: SURFACE, ref: m.wakeRef, floor: m.floor, min: 0, terrainQ: 0 };
}
