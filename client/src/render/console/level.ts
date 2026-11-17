// THE LEVEL BLOCK'S PURE CORE (Story 10.10, O6 (4)) — the ship console's
// `LV 4` tag, its XP track and the banked-level chip.
//
// MOVED, NOT REWRITTEN: the XP strip's pure core (render/xpStrip.ts, which W3
// deletes) — the tag, the chip label, the chip's arm → decay-to-static →
// re-arm breath and the Tier-3 freeze at its dim keyframe. The breath's timing
// is `CLIENT_CONFIG.console.chip` (the `xpRail` block's numbers, unchanged).
//
// DEAD WITH THE BAND: the strip's `TAB TO REFIT` cue (R3 — Tab opens nothing
// now; the offer group's own arrival is the cue, R10) and its `refitable`
// gate. `rearm` stays on the state machine as a plain parameter: no caller is
// obliged to use it.
//
// Server-authoritative: `lvl` / `xp` / `pts` are read VERBATIM off `you`.

import { CLIENT_CONFIG } from '../../config.js';

const X = CLIENT_CONFIG.console.chip;

/** Pure: the track's fill — the server's `xp`, clamped; non-finite reads 0. */
export function xpFillFraction(xp: number): number {
  if (!Number.isFinite(xp) || xp <= 0) return 0;
  return xp > 1 ? 1 : xp;
}

/** Pure: the LV tag (`LV 0` is a real state — the held start line). */
export function levelTag(lvl: number): string {
  const n = Number.isFinite(lvl) ? Math.max(0, Math.floor(lvl)) : 0;
  return `LV ${n}`;
}

/** Pure: the bank chip's label — '' hides it; the bare count; `+` past 9. */
export function chipLabel(pts: number): string {
  if (pts <= 0) return '';
  return pts > 9 ? '+' : `${pts}`;
}

/** The chip's breathing rate (Hz): one cycle per `breathSec`, hard-clamped by
 *  the shared photosensitivity ceiling. */
export const CHIP_PULSE_HZ = Math.min(1 / X.breathSec, CLIENT_CONFIG.settings.pulseCapHz);

/** The chip's state: the bank it last saw and when its window armed. */
export interface XpChipState {
  pts: number;
  armedAt: number | null;
}

export const XP_CHIP_IDLE: XpChipState = { pts: 0, armedAt: null };

/** Pure: advance the chip one frame — hidden at zero (dropping any window), a
 *  NEW bank / `rearm` / an unarmed positive (re)arms at `nowSec`, else carry. */
export function nextChipState(prev: XpChipState, pts: number, nowSec: number, rearm = false): XpChipState {
  if (pts <= 0) return XP_CHIP_IDLE;
  if (pts > prev.pts || rearm || prev.armedAt === null) return { pts, armedAt: nowSec };
  return { pts, armedAt: prev.armedAt };
}

/** Pure: is the chip inside its breathing window (then it decays to static)? */
export function chipBreathing(state: XpChipState, nowSec: number): boolean {
  if (state.pts <= 0 || state.armedAt === null) return false;
  return nowSec - state.armedAt < X.unspentSec;
}

/** Pure: the chip's alpha — the base (information) plus the motion-scaled
 *  `amp` breath, phase from the arm instant (starts at the base). */
export function chipAlpha(state: XpChipState, nowSec: number, amp: number = X.pulseAmp): number {
  if (!chipBreathing(state, nowSec)) return X.chipAlpha;
  const phase = (nowSec - state.armedAt!) * CHIP_PULSE_HZ * Math.PI * 2;
  return X.chipAlpha + amp * Math.sin(phase);
}

/** Pure: the chip's DIM keyframe — where Tier 3 freezes it (dim, never off);
 *  a decayed chip's dim keyframe is its steady alpha. */
export function chipDimKeyframe(state: XpChipState, nowSec: number, amp: number = X.pulseAmp): number {
  return chipBreathing(state, nowSec) ? X.chipAlpha - amp : X.chipAlpha;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Pure: the alpha drawn — breathing mixed toward the dim keyframe by the
 *  eased Tier-3 `freeze` blend (0 breathing, 1 frozen). */
export function chipHeld(state: XpChipState, nowSec: number, amp: number, freeze: number): number {
  const breathing = chipAlpha(state, nowSec, amp);
  const dim = chipDimKeyframe(state, nowSec, amp);
  return breathing + (dim - breathing) * clamp01(freeze);
}
