// Pure phosphor + sweep math (no Pixi import — unit-tested). Blip decay is
// timestamp math against serverNow(), fully decoupled from the sweep graphic:
// alpha runs 1 → 0 across a paint's LIFE, and a cooling ramp dims it over the
// first ~30% of that life. The sweep wedge rotates at exactly 2π/sweepPeriodMs,
// extrapolated from the latest server frame so it is smooth at 60fps while
// 20Hz frames keep it snapped to the authoritative angle.
//
// THE DECAY CONTRACT CHANGED IN STORY 4.2 (amendment 9). It used to be "a blip
// dies exactly as the beam comes back around" — one sweep period, so a contact
// showed one paint and no history. It is now `blip.persistSweeps` periods (the
// live paint plus 2 decaying ghosts, ~12s of track at 15rpm), because
// long-persistence phosphor is how course and speed are actually plotted off a
// scope. `blipAlpha`'s own contract is UNCHANGED and takes the LIFE, not the
// period: the caller decides how long a paint lives, and `blipLifeMs` is that
// decision for the in-game scope. The pre-join ambient scope (render/ambient.ts)
// deliberately keeps one-period life and the green `blipTint` ramp — its dots
// have no owner and no class, so nothing there needs the longer track.
//
// Two cooling ramps therefore coexist, and they are not interchangeable:
//   • `blipTint`  — bright → dark phosphor GREEN. The original ramp; it SETS the
//                   color, so it may only drive a mark that has NO other color
//                   to carry. Exactly one caller is left: the pre-join ambient
//                   dots (render/ambient.ts), which have no owner, no class and
//                   no strength.
//   • `blipCool`  — a neutral-grey MULTIPLIER, and the ramp EVERY in-game scope
//                   mark uses. Wherever a blip's color is an information channel
//                   its cooling has to preserve hue: greyscale multiplies every
//                   channel equally and leaves the hue exact. That is now BOTH
//                   grammars — `silhouette`'s owner hue / drone grey, and (cycle
//                   50, amendment 74) the `return` echo's Garmin strength ramp.
//                   The `return` grammar briefly used `blipTint` while its
//                   echoes were monochrome (amendment 65); the moment hue became
//                   a channel there, that wiring became the same bug Story 4.2
//                   found the first time, and it moved here.

import { wrapPositive } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01 } from '../util/math.js';

const TAU = Math.PI * 2;

/** Fresh-paint phosphor color (blip decay ramp). */
export const BLIP_BRIGHT = CLIENT_CONFIG.colors.blipFresh;
/** Fully-cooled phosphor color (still faintly readable until alpha hits 0). */
export const BLIP_DARK = CLIENT_CONFIG.colors.blipFaded;
/** Fraction of a paint's LIFE over which its cooling ramp runs (both ramps). */
export const TINT_FADE_FRACTION = 0.3;

/** Per-channel linear interpolation between two 0xRRGGBB colors. */
export function lerpColor(c0: number, c1: number, t: number): number {
  const k = clamp01(t);
  const ch = (shift: number) =>
    Math.round(((c0 >> shift) & 0xff) * (1 - k) + ((c1 >> shift) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/**
 * Blip alpha at `ageMs` since paint: 1 → 0 linearly across the paint's LIFE.
 *
 * `lifeMs` is the caller's decision (see the file header): one sweep period for
 * the ambient scope, `blipLifeMs()` = persistSweeps periods for the in-game one.
 *
 * `minAlpha` (Story 2.3, amendment 18) is the FLOOR a still-living blip may
 * decay to — 0 in the base grammar (a blip fades all the way out), raised by the
 * colorblind assist so a cooling contact never sinks to near-invisible against
 * the fog. The blip still DIES at a full life (age >= life ⇒ 0), so the floor
 * extends visibility, never the blip's life.
 */
export function blipAlpha(ageMs: number, lifeMs: number, minAlpha = 0): number {
  if (ageMs >= lifeMs) return 0;
  return Math.max(minAlpha, clamp01(1 - ageMs / lifeMs));
}

/**
 * How long an in-game paint lives: `persistSweeps` sweep periods (amendment 9).
 * Derived from the OBSERVER's effective sweep period, so an upgraded sweep
 * shortens the track on the upgraded beat — the same rule the one-period
 * grammar followed, just multiplied.
 */
export function blipLifeMs(
  periodMs: number,
  persistSweeps: number = CLIENT_CONFIG.blip.persistSweeps,
): number {
  return periodMs * persistSweeps;
}

/** Blip tint at `ageMs`: bright → dark green over the first ~30% of its life.
 *  SETS the color, so it belongs to the colorless ambient dots only (see the
 *  file header); EVERY in-game scope mark uses `blipCool`, in both grammars. */
export function blipTint(ageMs: number, lifeMs: number): number {
  return lerpColor(BLIP_BRIGHT, BLIP_DARK, ageMs / (lifeMs * TINT_FADE_FRACTION));
}

/**
 * Hue-PRESERVING cooling multiplier at `ageMs`: white (fresh) → a neutral grey
 * at `CLIENT_CONFIG.blip.coolFloor`, over the first ~30% of the paint's life,
 * then held. Applied as a Pixi tint over a hue-stroked blip, so every channel
 * scales by the same factor and the mark's hue survives intact — the owner's
 * personal color under `silhouette`, the Garmin strength color under `return`.
 *
 * Why it exists at all: across a 3-sweep (~12s) linear alpha ramp a 1s-old paint
 * still sits at ~0.92 alpha, so alpha alone cannot say "this one is FRESH". The
 * cooling ramp is what makes the newest paint of a track pop out of its ghosts.
 *
 * `floor` is a parameter because the colorblind assist needs a SHALLOWER ramp:
 * this multiplier stacks on top of the luminance floor already baked into the
 * stroke color, so the base floor would pull a lifted dark hue back under the
 * assist's own threshold for most of the paint's life.
 */
export function blipCool(
  ageMs: number,
  lifeMs: number,
  floor: number = CLIENT_CONFIG.blip.coolFloor,
): number {
  const k = clamp01(ageMs / (lifeMs * TINT_FADE_FRACTION));
  const level = Math.round(255 * (1 - k * (1 - floor)));
  return (level << 16) | (level << 8) | level;
}

/**
 * Sweep wedge rotation at `serverNow`, extrapolated from the latest frame's
 * authoritative angle at the known rate 2π/period. Every new frame re-anchors
 * the extrapolation, so drift can never exceed one frame before it snaps back
 * (and consecutive frames advance by exactly the extrapolation rate, so the
 * re-anchor is seamless). Clamped so a late clock can never run it backward.
 */
export function sweepRotation(
  frameSweep: number,
  frameT: number,
  serverNow: number,
  periodMs: number,
): number {
  const dtMs = Math.max(0, serverNow - frameT);
  return wrapPositive(frameSweep + (TAU * dtMs) / periodMs);
}
