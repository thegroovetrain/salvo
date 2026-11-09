// THE HULL GAUGE'S PURE CORE (Story 10.10, O6 (1)) — the ship console's
// percent numeral + 10-segment bar.
//
// MOVED, NOT REWRITTEN: every gate and the whole breathing envelope are the HP
// globe's (render/hpGlobe.ts, which W3 deletes), renamed from `rail*` to
// `hull*` because the globe they were named for is gone. The thresholds are
// `CLIENT_CONFIG.console.hull`, which references shared `CONFIG.damageBands`
// exactly as `vitals` did — one set of band numbers in the codebase.
//
// NEW HERE: `hullSegments` — the bar's per-segment fill, a pure function of
// the same fraction the globe painted as a waterline, and the pooled HULL
// REPAIR band as the lighter part of a segment above the live fill.

import { CLIENT_CONFIG } from '../../config.js';
import { hullPercent } from '../../util/hullPercent.js';

const C = CLIENT_CONFIG.colors;
const H = CLIENT_CONFIG.console.hull;

export { hullPercent };

/** The band a hull fraction reads in (O6: phosphor / amber / crimson marker). */
export type HullBand = 'healthy' | 'warning' | 'critical';

/** Pure: the band. EXCLUSIVE lower bounds for the better band: exactly 50 %
 *  still reads healthy, exactly 25 % still reads warning. */
export function hullBand(frac: number): HullBand {
  if (frac >= H.amberBelow) return 'healthy';
  if (frac >= H.criticalBelow) return 'warning';
  return 'critical';
}

/** Pure: the band's color token (the globe's `hpColor`). */
export function hullColor(frac: number): number {
  const band = hullBand(frac);
  if (band === 'healthy') return C.phosphor;
  return band === 'warning' ? C.amber : C.damageMarker;
}

/** Pure: does the gauge BREATHE at this fraction (below the amber line)? */
export function hullPulsing(frac: number): boolean {
  return frac < H.amberBelow;
}

/** Pure: THE TIER-1 GATE — the critical (crimson) band, < 25 % (amendment 239).
 *  render/attention.ts composes this; it declares no threshold of its own. */
export function hullCritical(frac: number): boolean {
  return frac < H.criticalBelow;
}

/** Pure: the AMBER COROLLARY's HP input — breathing but not yet critical. */
export function hullAmberChannel(frac: number): boolean {
  return hullPulsing(frac) && !hullCritical(frac);
}

/**
 * Pure: does the gauge HOLD at its lit keyframe — an amber channel that LOST
 * the corollary's ranking? `hullWins` is the caller's
 * `amberPulseWinner(...) === <this channel>` (render/attention.ts owns the
 * rank and the channel key; this module only composes the band gate).
 */
export function hullHoldsLit(frac: number, hullWins: boolean): boolean {
  return hullAmberChannel(frac) && !hullWins;
}

/** Pure: the remaining fraction, clamped to [0,1]; a missing/zero
 *  denominator reads 0 (NULL-vs-ZERO is the caller's distinction). */
export function hullFraction(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
}

/** Pure: HULL REPAIR's still-draining pool as a fraction of the hull, CLIPPED
 *  at full (the server clamps the payout at maxHp). */
export function repairFraction(hp: number, repairHp: number, maxHp: number): number {
  if (maxHp <= 0 || repairHp <= 0) return 0;
  const filled = Math.max(0, Math.min(1, hp / maxHp));
  return Math.max(0, Math.min(1 - filled, repairHp / maxHp));
}

/** Pure: the breathing RATE (Hz) — a linear ramp from `pulseMinHz` at the
 *  amber line to the shared `settings.pulseCapHz` at `pulseFloorFrac` and
 *  below, CLAMPED at both ends (never above the photosensitivity ceiling). */
export function hullPulseHz(frac: number): number {
  const f = Math.min(H.amberBelow, Math.max(H.pulseFloorFrac, frac));
  const t = (H.amberBelow - f) / (H.amberBelow - H.pulseFloorFrac);
  return H.pulseMinHz + t * (CLIENT_CONFIG.settings.pulseCapHz - H.pulseMinHz);
}

/** Largest frame gap (s) the pulse integrator will advance across. */
const MAX_PULSE_DT = 0.5;

/** Pure: advance the INTEGRATED pulse phase (radians) one frame — never
 *  `sin(t · hz)`, which jumps phase whenever the rate changes. Holds at 0
 *  above the band; `dt` clamped to [0, 0.5]. */
export function advancePulsePhase(phase: number, frac: number, dt: number): number {
  if (!hullPulsing(frac)) return 0;
  const step = Math.min(MAX_PULSE_DT, Math.max(0, dt));
  return (phase + hullPulseHz(frac) * step * Math.PI * 2) % (Math.PI * 2);
}

/** Pure: the fill alpha at a phase — the base (INFORMATION, held at
 *  motion=off) plus the motion-scaled breath `amp`, only below the amber line. */
export function hullFillAlpha(frac: number, phase: number, amp: number = H.pulseAmp): number {
  if (frac >= H.amberBelow) return H.fillAlpha;
  return H.fillAlpha + amp * Math.sin(phase);
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Pure: the alpha drawn — breathing mixed toward the LIT keyframe by the
 *  eased `hold` blend (0 breathing, 1 held lit). Never dimmer than breathing. */
export function hullFillHeld(frac: number, phase: number, amp: number, hold: number): number {
  const breathing = hullFillAlpha(frac, phase, amp);
  const lit = hullFillAlpha(frac, Math.PI / 2, amp);
  return breathing + (lit - breathing) * clamp01(hold);
}

/** One bar segment: how much of it the live hull fills, and how much of the
 *  rest the pooled repair will fill (both 0..1 of the segment). */
export interface HullSegment {
  fill: number;
  pending: number;
}

/**
 * Pure: the bar's segments, left to right. Segment i covers [i/n, (i+1)/n] of
 * the hull; it is filled by the live fraction and, above that, lit lighter by
 * the pool. Continuous (a segment fills smoothly, never in whole steps), and
 * fill + pending never exceeds the segment.
 */
export function hullSegments(frac: number, pending: number, n: number = CLIENT_CONFIG.console.ship.segments): HullSegment[] {
  const f = clamp01(frac);
  const top = clamp01(f + Math.max(0, pending));
  return Array.from({ length: n }, (_, i) => {
    const fill = clamp01(f * n - i);
    return { fill, pending: clamp01(top * n - i) - fill };
  });
}

/** Pure: the redraw signature — the quantized fraction plus the exact band
 *  and pulse gate (quantizing alone would hide a band change at 0.4996). */
export function hullSig(frac: number, pending = 0): string {
  return `${frac.toFixed(3)}|${hullBand(frac)}|${hullPulsing(frac) ? 1 : 0}|${pending.toFixed(3)}`;
}
