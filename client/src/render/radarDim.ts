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
// BOTH RADII STILL COME OFF THE EIGHTHS LADDER (amendment 113), never off
// literals, and the choice of rungs is forced rather than tuned:
//   • INNER = 4/8, `CONFIG.vision.sight` — the bubble itself. Anywhere inside it
//     the eye is the primary sensor and the scope is a second opinion.
//   • OUTER = 5/8, `CONFIG.vision.muzzleFlash` — the very next rung out, and the
//     first radius at which radar is the SOLE sensor. Reaching full strength at
//     the first rung past the bubble is the shortest ramp the ladder can express;
//     anything further out would mute returns in water where nothing else sees.
// The ratio between them (1.25) is what this module actually carries, because the
// mask is OBSERVER-SCALED: sight is not a constant (a dazzle burst shrinks it at
// read time; no boon widens radar range any more), so the ramp is expressed against the
// observer's EFFECTIVE truesight and rides the bubble the player actually has.
// Radar.sightHoleU — i.e. `fogHoleRadiusU`, the same number the fog hole is baked
// at and the same one the server's `sightOf` gates contacts with — is the sole
// input, so the quiet region and the visible bubble cannot drift apart.
//
// THE 0.2 FLOOR IS ERIC'S RATIFIED NUMBER (amendment 181: *"painted at 20% its
// usual opacity"*) and is deliberately NOT touched here. Re-anchoring the radii
// is the change; moving the floor would be a second knob nobody asked for.

import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** The ramp's two radii (u) for an observer whose EFFECTIVE truesight is
 *  `sightU` — the dazzle-scaled / boon-widened bubble, never the base constant.
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
 * across the whole bubble, linear to 1 at the 5/8 rung, flat at 1 beyond.
 *
 * IT FAILS TOWARD A FULLY VISIBLE SCOPE, and that is this file's inherited rule
 * rather than a new one: `Radar.updateDimMask` already DETACHES the mask on a
 * non-finite own pose, because "an UNDIMMED scope is strictly better than a
 * HIDDEN one — the dim is a legibility ruling while the returns are the
 * instrument." A NaN distance, a NaN bubble or a collapsed bubble therefore all
 * read as 1 (full painted opacity), never as the floor.
 */
export function dimScaleAt(distU: number, sightU: number): number {
  const { innerU, outerU } = dimRadii(sightU);
  if (outerU <= innerU) return 1; // no bubble (or a degenerate one): nothing to quiet
  if (!Number.isFinite(distU)) return 1;
  const floor = CLIENT_CONFIG.blip.heatmap.dim.minScale;
  if (distU <= innerU) return floor;
  if (distU >= outerU) return 1;
  return floor + (1 - floor) * ((distU - innerU) / (outerU - innerU));
}

/** The base-hull radii, for documentation and for tests that want the shipped
 *  rungs by name rather than by arithmetic. */
export const BASE_DIM_RADII = dimRadii(CONFIG.vision.sight);
