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

import { type Vec2 } from '@salvo/shared';
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
