// Denied-fire feedback (render/deniedFire.ts): pure predicate covering
// cooldown / arc / weapons-safe-phase gates, plus the rate-limited pulse.

import { describe, it, expect } from 'vitest';
import { isFireDenied, DeniedPulse, PULSE_DURATION_MS, PULSE_RATE_MS } from '../render/deniedFire.js';

const READY_IN_ARC = { fireHeld: true, weaponsSafe: false, ready: 1, inArc: true };

describe('isFireDenied', () => {
  it('is never denied when fire is not held, regardless of other gates', () => {
    expect(isFireDenied({ fireHeld: false, weaponsSafe: true, ready: 0, inArc: false })).toBe(false);
  });

  it('is not denied when held, ready, in-arc, and weapons are live', () => {
    expect(isFireDenied(READY_IN_ARC)).toBe(false);
  });

  it('is denied during the weapons-safe phase even if ready + in arc', () => {
    expect(isFireDenied({ ...READY_IN_ARC, weaponsSafe: true })).toBe(true);
  });

  it('is denied while on cooldown (ready < 1), in-arc and weapons live', () => {
    expect(isFireDenied({ ...READY_IN_ARC, ready: 0.99 })).toBe(true);
    expect(isFireDenied({ ...READY_IN_ARC, ready: 0 })).toBe(true);
  });

  it('is denied when aim is outside the selected weapon arc, ready and weapons live', () => {
    expect(isFireDenied({ ...READY_IN_ARC, inArc: false })).toBe(true);
  });

  it('weapons-safe gate short-circuits before checking cooldown/arc', () => {
    // Even ready=0 AND out-of-arc, weaponsSafe alone determines denial — no
    // double-counting concern since the predicate is a plain boolean.
    expect(isFireDenied({ fireHeld: true, weaponsSafe: true, ready: 0, inArc: false })).toBe(true);
  });
});

describe('DeniedPulse', () => {
  it('is inactive when the predicate is false', () => {
    const p = new DeniedPulse();
    expect(p.update(false, 1000)).toBe(false);
  });

  it('activates for PULSE_DURATION_MS on the first denied frame', () => {
    const p = new DeniedPulse();
    expect(p.update(true, 1000)).toBe(true);
    expect(p.update(true, 1000 + PULSE_DURATION_MS - 1)).toBe(true);
    expect(p.update(true, 1000 + PULSE_DURATION_MS)).toBe(false);
  });

  it('rate-limits: held denial does not re-trigger before PULSE_RATE_MS elapses', () => {
    const p = new DeniedPulse();
    p.update(true, 0);
    // Well past the pulse duration but before the rate-limit window — should
    // stay inactive (no strobing) rather than re-triggering immediately.
    expect(p.update(true, PULSE_DURATION_MS + 1)).toBe(false);
    expect(p.update(true, PULSE_RATE_MS - 1)).toBe(false);
  });

  it('re-triggers once the rate-limit window has elapsed', () => {
    const p = new DeniedPulse();
    p.update(true, 0);
    expect(p.update(true, PULSE_RATE_MS)).toBe(true);
  });

  it('a denied->not-denied->denied cycle inside the rate window does not re-trigger early', () => {
    const p = new DeniedPulse();
    p.update(true, 0);
    p.update(false, 50); // fire released mid-pulse-window
    expect(p.update(true, 100)).toBe(false); // still within PULSE_RATE_MS of the last trigger
  });
});
