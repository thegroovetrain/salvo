// THE HAZE HALO (Story 9.3 session 5) — the pure rule behind the mask
// render/countermeasure.ts hangs on the `cloud` layer and render/textures.ts
// bakes. No Pixi, no state: distance in, displayed fraction of the haze out.
//
// WHY (Eric 2026-10-12, on 0.18.42): *"The smoke is visible outside of 5/8
// intel range. Why? … That's the range in which I can see smoke effects. I can
// see enemy ships that are smoking or on fire up to that far away, or at least
// I can see the smoke, not the ship. I cannot see the smoke outside of that
// range, I can only infer it from radar returns."* The countermeasure's grey
// haze is a SMOKE EFFECT, so it obeys the same rung wounded smoke does — the
// server's `sm` row gates a plume at `radarRange × muzzleFlashFactor`
// (server/src/game/signals.ts `muzzleFlashReach`, observer-scaled). The cloud
// itself still has to be DELIVERED past that rung (the radar paints it), so
// the eye's limit is applied here, at display time, off the very same
// derivation. Beyond it the cloud exists only as radar returns.
//
// THE RADIUS IS NOT A KNOB: it is the shared 5/8 rung. Only the soft edge is
// client feel (`CLIENT_CONFIG.countermeasure.haloFeatherU`).

import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** The 5/8 rung for a viewer whose live derived intel range is `radarRangeU` —
 *  the SAME derivation as the server's wounded-smoke reach. */
export function hazeHaloU(radarRangeU: number): number {
  return radarRangeU * CONFIG.vision.muzzleFlashFactor;
}

/** The halo at the BASE intel range — what the mask holds before the first
 *  derived stats arrive. */
export const BASE_HAZE_HALO_U = hazeHaloU(CONFIG.vision.radar);

/** World half-width (u) the mask sprite must cover for a halo of `haloU`: the
 *  halo, its feather, and one more feather of zero margin (a sprite mask hides
 *  everything outside its own bounds, which is exactly "beyond" anyway). */
export function haloSpanU(haloU: number): number {
  return haloU + 2 * CLIENT_CONFIG.countermeasure.haloFeatherU;
}

/**
 * The displayed fraction of the haze at `distU` from own hull: 1 out to
 * `haloU`, LINEAR to 0 across the feather, 0 beyond. Linear on purpose — a
 * canvas radial gradient between two stops draws exactly this, so the bake and
 * the stated rule cannot drift.
 */
export function haloAlphaAt(distU: number, haloU: number): number {
  const f = CLIENT_CONFIG.countermeasure.haloFeatherU;
  if (!(distU > haloU)) return 1; // NaN reads as inside — the radarDim rule
  if (distU >= haloU + f) return 0;
  return 1 - (distU - haloU) / f;
}
