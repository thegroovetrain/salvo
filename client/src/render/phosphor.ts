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
// decision for the in-game scope.
//
// `blipTint` — bright → dark phosphor GREEN — SETS the color, so it may only
// drive a mark that has NO other color to carry. CORRECTED cycle 126: it has
// NO production consumer at all. This comment used to claim the pre-join
// ambient dots were its one caller, but render/ambient.ts builds the ordinary
// `Radar` and feeds it real coverage footprints, so it runs the same quantized
// band path as the live scope. `blipTint`, `BLIP_BRIGHT`, `BLIP_DARK` and the
// `blip-fresh`/`blip-faded` tokens behind them are referenced only by this
// module and its test. Retiring them is a code decision, so it is ledgered in
// deferred-work.md rather than taken here. (The hue-preserving grey
// `blipCool` multiplier died with the `silhouette` grammar in cycle 105 — the
// in-game scope is a quantized bitmap whose age rides `blipAlpha` and whose
// strength rides the band colors, so there is no per-mark tint left to cool.)

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
 *  file header). */
export function blipTint(ageMs: number, lifeMs: number): number {
  return lerpColor(BLIP_BRIGHT, BLIP_DARK, ageMs / (lifeMs * TINT_FADE_FRACTION));
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
