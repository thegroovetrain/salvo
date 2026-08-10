// THE `denied` CUE's two accessibility rules (the twin walk, amendment 60,
// epic-4-context-amendments.md), extracted purely so a test file can pin them
// without touching main.ts — the SAME rationale hpSting.ts already states:
// main.ts is the Pixi/DOM bootstrap that runs `main()` unconditionally at
// module load (no test touches it), so before this extraction both call
// sites were unpinned even though the pieces they compose were covered.
//
// FIX A — THE TONE'S ONLY TWIN CAN BE HIDDEN. The predicted ability-press
// denial (main.ts's handleAbilityPress) and the FIFO-full denial
// (onAbilityCapped) play the `denied` tone whenever the press is denied, with
// no regard for whether the per-slot hotbar chip — the tone's only visual
// twin — can render at all. updateHotbar hides the whole hotbar whenever
// `!status.alive`, the no-pose render gap hides it directly, and
// enterSpectateVisuals hides it on the spectate transition — so a press after
// death plays the tone into a completely blank HUD. The SERVER-denial path
// (handleServerDenial) already guards this exact case; the predicted paths
// never got the same guard, because the keyboard layer deliberately does not
// gate on life itself (input/keyboard.ts's onFoghorn doc: "alive, spectating,
// cooldown — is main.ts's call").
//
// FIX B — THE TONE IS UNBOUNDED WHILE ITS TWIN IS CAPPED. render/deniedFire.ts's
// DeniedPulse accepts a new VISUAL trigger only once PULSE_RATE_MS (300ms) has
// elapsed since the last one; Audio.play() has no floor of its own, and all
// four `denied` call sites in main.ts play unbounded. A denied click landing
// 80-300ms after the previous one — ~73% of the pulse's own rate window —
// plays the tone with the earlier pulse already expired and the limiter
// refusing a new one: many tones, few visuals, the inverse of the ratified
// aggregation grammar (amendment 37's "many visuals, one tone"). The fix
// reuses PULSE_RATE_MS itself (amendment 37: no new tunable when one already
// answers the question) and the existing ToneFloor class
// (render/gunneryFeed.ts, the hitCallToneFloor()/hpStingFloor() precedent) —
// ONE shared floor across all four call sites, since it is one cue from the
// player's perspective regardless of which slot or click triggered it.

import { PULSE_RATE_MS } from '../render/deniedFire.js';
import { ToneFloor } from '../render/gunneryFeed.js';

/**
 * True while there is no live surface for the `denied` tone's chip-flash
 * twin to render on: the hull is sunk (`alive === false`), or the client has
 * moved into spectate. Every PREDICTED denial path must check this before
 * firing the tone, mirroring the guard handleServerDenial already runs for
 * the identical reason (Story 1.10's server-denial path) — `alive` is
 * `undefined` pre-first-frame, which reads as "has a twin" exactly like the
 * server-denial guard's `=== false` check does (a missing frame is not yet
 * known to be dead).
 */
export function deniedFeedbackHasNoTwin(spectating: boolean, alive: boolean | undefined): boolean {
  return spectating || alive === false;
}

/** The `denied` cue's tone floor, on the SAME rate the visual pulse already
 *  enforces — never a second, independently-tunable number. */
export function deniedToneFloor(): ToneFloor {
  return new ToneFloor(PULSE_RATE_MS);
}
