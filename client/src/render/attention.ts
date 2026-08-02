// THE ATTENTION SEAM (Story 3.2, amendment 16) — the first consumer of
// EXPERIENCE.md's attention-priority table, kept deliberately minimal.
//
// The table arbitrates the HUD's animated channels in three tiers:
//   Tier 1 — THREAT   (denied pulses, the low-HP rail pulse, later the listening
//                      ring): always animates, rate-capped, owns the eye.
//   Tier 2 — MATCH    (the in-storm vignette, later the ring countdown):
//                      animates UNLESS a Tier-1 channel is active — then it
//                      holds steady at its LIT keyframe.
//   Tier 3 — ECONOMY  (bank chip, toasts, XP rail): freezes at the DIM keyframe
//                      under any higher tier. NOT implemented here.
//
// This module ships exactly the Tier-1 → Tier-2 edge the storm vignette needs.
// Story 4-8 owns the generalized three-tier system; when it lands, the channel
// list below grows and everything else about this seam stays put.
//
// PURE, and dependency-light by design: no Pixi, no state, no clock of its own —
// it only COMPOSES the predicates their owning modules export (the HP rail's
// pulse gate from render/hud.ts, the denied pulse's liveness from
// render/deniedFire.ts), so a new Tier-1 channel is one more input, not a
// rewrite.

import { railPulsing } from './hud.js';

/** The Tier-1 channels, as this story knows them. */
export interface Tier1Input {
  /**
   * Own hull fraction in [0,1], or null when there is no own hull this frame
   * (spectating, the respawn gap). NULL IS NOT ZERO: a missing hull is not a
   * critical one, and must not pin the vignette lit forever.
   */
  hpFrac: number | null;
  /** A denied-fire pulse is live this frame (DeniedPulse.liveAt). */
  deniedLive: boolean;
}

/**
 * Pure: is any Tier-1 (threat) channel animating right now?
 *
 * The HP condition is the HP rail's OWN pulse gate (`railPulsing`) rather than a
 * second threshold declared here — "Tier 1 is active when the rail is actually
 * breathing" is the honest reading, and it cannot drift from what the rail does.
 * (EXPERIENCE.md's tier table words it as "<25%"; the shipped rail breathes
 * below 50% — amendment 16 defines the seam against the rail's existing
 * threshold, so the rail stays the single source of that number.)
 */
export function tier1Active(i: Tier1Input): boolean {
  if (i.deniedLive) return true;
  return i.hpFrac !== null && Number.isFinite(i.hpFrac) && railPulsing(i.hpFrac);
}

/**
 * Pure: should a Tier-2 channel hold at its LIT (max-alpha) keyframe this frame?
 * Trivial today by construction — it is the tier table's rule, named, so the
 * rule lives in one place and the vignette's call site reads as what it is.
 */
export function holdAtLitKeyframe(tier1: boolean): boolean {
  return tier1;
}
