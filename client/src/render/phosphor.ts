// Pure phosphor + sweep math (no Pixi import — unit-tested). Blip decay is
// timestamp math against serverNow(), fully decoupled from the sweep graphic:
// alpha runs 1 → 0 across one sweep period (the blip dies exactly as the beam
// comes back around), and the tint cools bright → dark phosphor green over the
// first ~30% of that life. The sweep wedge rotates at exactly 2π/sweepPeriod,
// extrapolated from the latest server frame so it is smooth at 60fps while
// 20Hz frames keep it snapped to the authoritative angle.

import { wrapPositive } from '@salvo/shared';
import { clamp01 } from '../util/math.js';

const TAU = Math.PI * 2;

/** Fresh-paint phosphor color. */
export const BLIP_BRIGHT = 0x66ffaa;
/** Fully-cooled phosphor color (still faintly readable until alpha hits 0). */
export const BLIP_DARK = 0x0a3d20;
/** Fraction of a sweep period over which the tint cools bright → dark. */
export const TINT_FADE_FRACTION = 0.3;

/** Per-channel linear interpolation between two 0xRRGGBB colors. */
export function lerpColor(c0: number, c1: number, t: number): number {
  const k = clamp01(t);
  const ch = (shift: number) =>
    Math.round(((c0 >> shift) & 0xff) * (1 - k) + ((c1 >> shift) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Blip alpha at `ageMs` since paint: 1 → 0 linearly across one sweep period. */
export function blipAlpha(ageMs: number, periodMs: number): number {
  return clamp01(1 - ageMs / periodMs);
}

/** Blip tint at `ageMs`: bright → dark green over the first ~30% of a period. */
export function blipTint(ageMs: number, periodMs: number): number {
  return lerpColor(BLIP_BRIGHT, BLIP_DARK, ageMs / (periodMs * TINT_FADE_FRACTION));
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
