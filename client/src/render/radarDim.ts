// THE NEAR-RANGE DIM CURVE (amendment 181, re-anchored to TRUESIGHT this cycle)
// — the pure rule behind the radial mask render/radar.ts hangs on `blipLayer`
// and render/textures.ts bakes. No Pixi, no state: distance in, displayed
// fraction of the painted opacity out.
//
// WHY IT MOVED. Amendment 181 is a LEGIBILITY ruling, and Eric stated its reason
// twice in the same breath: *"radar is most effective outside of truesight range
// (LOS)"* and *"I want my radar results to be visible but less prominent in the
// near sight range where i am going to aim based on LOS rather than radar
// ghosts."* Both sentences describe THE SIGHT BUBBLE. The shipped ramp ran 1/8 →
// 5/8 of intel range, which reached full strength at 412.5u while the bubble ends
// at 330u — so the scope stood at 80% of full opacity at the very EDGE of the
// bubble (40% halfway out), over exactly the water where hull silhouettes and
// radar paint were fighting each other. The floor now holds across the WHOLE
// bubble and climbs only outside it.
//
// BOTH RADII STILL COME OFF THE LADDER (amendment 113; twelfths of intel range
// since Story 9.8, epic-9 amendment 103), never off literals:
//   • INNER = 4/12, `CONFIG.vision.sight` — the bubble itself. Anywhere inside
//     it the eye is the primary sensor and the scope is a second opinion.
//   • OUTER = 6/12, `CONFIG.vision.muzzleFlash` — the flash rung. On the eighths
//     ladder this was 5/8, the very next rung out; the twelfths ladder keeps the
//     same NAMED rung (the flash/smoke reach), now two twelfths past the bubble,
//     rather than inventing a 5/12 anchor nobody ruled on.
// The ratio between them (1.5; 1.25 on the eighths ladder) is what this module actually carries, because the
// mask is OBSERVER-SCALED: sight is not the base constant (it is a boon-widened
// constant per build; no boon widens radar range any more), so the ramp is expressed against the
// observer's EFFECTIVE truesight and rides the bubble the player actually has.
// Radar.sightHoleU — i.e. `fogHoleRadiusU`, the same number the fog hole is baked
// at and the same one the server's `sightOf` gates contacts with — is the sole
// input, so the quiet region and the visible bubble cannot drift apart.
//
// THE 0.2 FLOOR IS ERIC'S RATIFIED NUMBER (amendment 181: *"painted at 20% its
// usual opacity"*) and is deliberately NOT touched here. Re-anchoring the radii
// is the change; moving the floor would be a second knob nobody asked for.
//
// THE RAMP SLIDES ON A FOGGED BEARING (epic-9 amendment 210, Eric 2026-10-21:
// the dim look stays "pretty much entirely", but "when my vision is reduced by
// fog, or when I am detecting something in the fog that I would otherwise have
// seen visually, the returns are NOT muted (or at least muted less)"). Both
// cases are one rule: on each bearing the ramp TRANSLATES inward to where the
// observer's fog-tolled EYE actually ends on that bearing (shared sim/fog.ts
// `fogEyeReach`, ≤ sight, = sight with no fog), scaled by Eric's staging dial
// `dim.fogLift`:
//     scale(θ, d) = radial(d + (sight − reach(θ)) × fogLift)
// where `radial` is the curve above. The ramp's WIDTH never changes, only where
// it starts; the floor and the two factors are untouched. With no fog (every
// reach = sight) or fogLift 0 the expression IS today's curve, so the radial
// bake is the no-fog case rather than a second look.

import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** The ramp's two radii (u) for an observer whose EFFECTIVE truesight is
 *  `sightU` — the boon-widened bubble, never the base constant.
 *  A non-positive or non-finite bubble collapses both to 0, which reads as "no
 *  bubble, no quieting" (see `dimScaleAt`). */
export function dimRadii(sightU: number): { innerU: number; outerU: number } {
  if (!(sightU > 0) || !Number.isFinite(sightU)) return { innerU: 0, outerU: 0 };
  const { innerFactor, outerFactor } = CLIENT_CONFIG.blip.heatmap.dim;
  return { innerU: sightU * innerFactor, outerU: sightU * outerFactor };
}

/**
 * The displayed fraction of a return's painted opacity at `distU` from own hull,
 * for an observer with `sightU` of effective truesight: flat at `minScale`
 * across the whole bubble, linear to 1 at the flash rung (6/12), flat at 1 beyond.
 * `reachU` (default `sightU` = no fog) is where the fog-tolled eye ends on this
 * bearing: the whole curve slides inward by `dimSlideU(sightU, reachU)`.
 *
 * IT FAILS TOWARD A FULLY VISIBLE SCOPE, and that is this file's inherited rule
 * rather than a new one: `Radar.updateDimMask` already DETACHES the mask on a
 * non-finite own pose, because "an UNDIMMED scope is strictly better than a
 * HIDDEN one — the dim is a legibility ruling while the returns are the
 * instrument." A NaN distance, a NaN bubble or a collapsed bubble therefore all
 * read as 1 (full painted opacity), never as the floor.
 */
export function dimScaleAt(distU: number, sightU: number, reachU: number = sightU): number {
  const { innerU, outerU } = dimRadii(sightU);
  if (outerU <= innerU) return 1; // no bubble (or a degenerate one): nothing to quiet
  if (!Number.isFinite(distU)) return 1;
  const floor = CLIENT_CONFIG.blip.heatmap.dim.minScale;
  const d = distU + dimSlideU(sightU, reachU);
  if (d <= innerU) return floor;
  if (d >= outerU) return 1;
  return floor + (1 - floor) * ((d - innerU) / (outerU - innerU));
}

/** `dim.fogLift` clamped to [0, 1]; anything non-finite reads as 0 (no slide —
 *  today's radial mask, the conservative look). */
function fogLift(): number {
  const f = CLIENT_CONFIG.blip.heatmap.dim.fogLift;
  return Number.isFinite(f) ? Math.max(0, Math.min(1, f)) : 0;
}

/**
 * How far (u) the ramp slides INWARD on a bearing whose fog-tolled eye ends at
 * `reachU`, for an observer with `sightU` of effective truesight:
 * `(sightU − reachU) × fogLift`. A reach that is non-finite, negative or not
 * below the bubble (at float32 precision — the fan's storage — so a clear
 * bearing of a non-dyadic sight is clear) reads as `sightU` — no slide — so a bad fan fails toward
 * today's radial mask, never toward an unmuted scope.
 */
export function dimSlideU(sightU: number, reachU: number): number {
  if (!(sightU > 0) || !Number.isFinite(sightU)) return 0;
  // The fan is a Float32Array holding `fround(sight)` on a clear bearing; a sight that is not
  // float32-representable must still read that bearing as clear, or every cadence re-bakes.
  const clearU = Math.min(sightU, Math.fround(sightU));
  if (!Number.isFinite(reachU) || reachU < 0 || reachU >= clearU) return 0;
  return (sightU - reachU) * fogLift();
}

/** Does any bearing of the fan `reach` actually move the ramp? False for an
 *  all-sight fan (no fog near the observer) and for `fogLift` 0 — the cases
 *  whose bake IS the radial mask (render/textures.ts takes that path for them,
 *  and render/radar.ts does not re-bake for them). */
export function dimFanSlides(reach: Float32Array, sightU: number): boolean {
  for (let k = 0; k < reach.length; k++) if (dimSlideU(sightU, reach[k]) > 0) return true;
  return false;
}

/**
 * The ramp's two radii (u) on ONE bearing whose eye ends at `reachU` — the
 * observer's `dimRadii` translated inward by `dimSlideU`, so the width
 * (outer − inner) never changes. Written into `out` (the bake calls it once per
 * wedge; no allocation). The inner radius may come out NEGATIVE when the slide
 * outruns the bubble's inner factor: the bake then starts its gradient at the
 * centre and reads the centre's level off `dimScaleAt`.
 */
export function dimRampU(
  sightU: number,
  reachU: number,
  out: { innerU: number; outerU: number },
): { innerU: number; outerU: number } {
  if (!(sightU > 0) || !Number.isFinite(sightU)) {
    // no bubble: a zero ramp, never NaN radii into the bake's createRadialGradient
    out.innerU = 0;
    out.outerU = 0;
    return out;
  }
  const { innerU, outerU } = dimRadii(sightU);
  const slide = dimSlideU(sightU, reachU);
  out.innerU = innerU - slide;
  out.outerU = outerU - slide;
  return out;
}

/** The base-hull radii, for documentation and for tests that want the shipped
 *  rungs by name rather than by arithmetic. */
export const BASE_DIM_RADII = dimRadii(CONFIG.vision.sight);
