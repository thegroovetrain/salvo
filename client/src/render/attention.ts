// THE ATTENTION SEAM (Story 3.2 / amendment 16, generalized by Story 4.8) — the
// one place EXPERIENCE.md's attention-priority table is named in code.
//
// THE TIER TABLE, as it actually ships:
//   Tier 1 — THREAT   Denied-fire pulses (ALL of them: the on-water arc/marker
//                     pulse AND the per-slot hotbar pulses — the table says
//                     "denied pulses" plural), plus the HP rail's pulse in its
//                     CRIMSON band (<25%, amendment 239). Always animates,
//                     rate-capped, owns the eye.
//                     The LISTENING RING is DEFERRED (amendment 1) and is
//                     deliberately NOT a channel here: nothing may list it as a
//                     Tier-1 input until it exists.
//   Tier 2 — MATCH    The chrome bar's final-10s ring pulse and the in-storm
//                     vignette. They animate UNLESS a Tier-1 channel is active —
//                     then they hold steady at their LIT keyframe. A Tier-2
//                     channel does NOT hold under another Tier 2 (the table's
//                     rule is scoped to Tier 1; amendment 243 reads it literally).
//   Tier 3 — ECONOMY  The XP bank-chip breath. Freezes at its DIM keyframe under
//                     ANY higher tier — including Tier 2 alone. The asymmetry
//                     between the Tier-2 and Tier-3 rules is deliberate in the
//                     ratified table and is implemented literally (amendment 243).
//                     Of the three channels the table names under Tier 3, only
//                     the bank chip actually breathes: toasts fade on a TTL and
//                     the XP rail does not animate, so they have nothing to
//                     freeze rather than an invented animation.
//
// THE AMBER COROLLARY. Two amber channels can be live at once — the ring's
// final-10s pulse (Tier 2) and the rail's amber band (25-50%, untiered by
// amendment 239). Only the highest-tier active amber pulses, so the ring wins
// and the amber rail holds lit (`amberPulseWinner`).
//
// WORLD EFFECTS ARE NOT TIERED (amendment 241). On-water one-shots — muzzle
// flashes, sparks, splashes, hull hit flashes — are diegetic information, not
// chrome competing for the eye; "hold at your lit keyframe" is a meaningless
// instruction for a 120ms flash at a world position. They answer to
// render/flashBudget.ts instead, which every channel including this one's
// consumers is subject to.
//
// PURE, and dependency-light by design: no Pixi, no state, no clock of its own —
// it only COMPOSES the predicates their owning modules export (the HP rail's
// gates from render/hud.ts, the denied pulse's liveness from
// render/deniedFire.ts, the ring's urgency flag from ui/chromeBar.ts), so a new
// channel is one more input, not a rewrite, and no threshold is ever declared
// twice.

import { CLIENT_CONFIG } from '../config.js';
import { railCritical } from './hud.js';

/** The Tier-1 (threat) channels, as this story knows them. */
export interface Tier1Input {
  /**
   * Own hull fraction in [0,1], or null when there is no own hull this frame
   * (spectating, the respawn gap). NULL IS NOT ZERO: a missing hull is not a
   * critical one, and must not pin the vignette lit forever.
   */
  hpFrac: number | null;
  /**
   * ANY denied-fire pulse is live this frame — the on-water pulse OR any of the
   * per-slot hotbar pulses, OR'd by the caller (main.ts owns those instances).
   * The table's "denied pulses" is plural; one boolean carries all of them
   * because the tier question is "is a threat channel animating", not "which".
   */
  deniedLive: boolean;
}

/** The Tier-2 (match) channels. */
export interface Tier2Input {
  /** The own hull is outside the storm ring — the vignette is breathing. */
  inStorm: boolean;
  /** The chrome bar's ring segment is inside its final-10s amber window. */
  ringUrgent: boolean;
}

/** The amber channels the corollary ranks (CLIENT_CONFIG.attention.amberRank). */
export type AmberChannel = 'ring' | 'hpRail';

/**
 * Pure: is any Tier-1 (threat) channel animating right now?
 *
 * The HP condition is the CRIMSON band — the rail's own `railCritical` gate
 * (<25%), never a threshold declared here. Amendment 239: `<25%` is the critical
 * `damage-marker` band and 25-50% is the AMBER WARNING band, and a warning is
 * not a threat. The rail's DISPLAY grammar is untouched — it still breathes
 * below 50% at the same ramp (`railPulsing`); only when it claims the threat
 * tier changed. That is what makes the amber corollary implementable at all: an
 * amber rail that was Tier 1 would outrank the final-10s ring in every wounded
 * endgame, which is the exact opposite of the corollary's purpose.
 */
export function tier1Active(i: Tier1Input): boolean {
  if (i.deniedLive) return true;
  return i.hpFrac !== null && Number.isFinite(i.hpFrac) && railCritical(i.hpFrac);
}

/** Pure: is any Tier-2 (match) channel animating right now? */
export function tier2Active(i: Tier2Input): boolean {
  return i.inStorm || i.ringUrgent;
}

/**
 * Pure: should a Tier-2 channel hold at its LIT (max-alpha) keyframe this frame?
 * Trivial BY CONSTRUCTION — it exists so the tier table's rule is NAMED in one
 * place and every Tier-2 call site reads as what it is, rather than each one
 * re-inlining `tier1 ? 1 : 0`.
 */
export function holdAtLitKeyframe(tier1: boolean): boolean {
  return tier1;
}

/**
 * Pure: should a Tier-3 (economy) channel freeze at its DIM keyframe this frame?
 *
 * "Any higher tier" is read LITERALLY (amendment 243), so Tier 2 ALONE freezes
 * the chip: the ratified table's Tier-2 rule is scoped to Tier 1 ("unless a
 * Tier 1 channel is active") while its Tier-3 rule is not, and the asymmetry is
 * deliberate. Freezing is a keyframe hold, never a removal — the chip, its
 * count and its cue line are information and stay fully present.
 */
export function freezeAtDimKeyframe(tier1: boolean, tier2: boolean): boolean {
  return tier1 || tier2;
}

/**
 * Pure: which amber channel may pulse this frame, if any — the amber corollary's
 * resolver. The rank is `CLIENT_CONFIG.attention.amberRank` (ring, then hpRail).
 *
 * Read as design: at 40% hull with the storm closing in 8 seconds, the STORM is
 * what kills you, so the ring pulses and the amber rail holds lit. Below 25% the
 * rail turns crimson — it stops being an amber channel at all and becomes
 * Tier 1, under which BOTH ambers hold lit. Amber therefore keeps meaning "look
 * here" at the climax, which is the corollary's stated purpose.
 */
export function amberPulseWinner(active: { ring: boolean; hpRail: boolean }): AmberChannel | null {
  for (const channel of CLIENT_CONFIG.attention.amberRank) {
    if (active[channel]) return channel;
  }
  return null;
}
