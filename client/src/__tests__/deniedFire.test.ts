// Denied-fire feedback (render/deniedFire.ts): pure predicate covering
// cooldown / arc gates, plus the rate-limited pulse. Deliberately NOT gated on
// the waiting/countdown "weapons safe" phase — the server fires all weapons
// in those phases too (only damage is suppressed), so a weapons-safe hold
// must NOT pulse "denied" while shells are visibly leaving the tube.

import { describe, it, expect } from 'vitest';
import {
  isFireDenied,
  firePressEdge,
  isPressEdgeNotReady,
  DeniedPulse,
  PULSE_DURATION_MS,
  PULSE_RATE_MS,
} from '../render/deniedFire.js';

const READY_IN_ARC = { fireHeld: true, ready: 1, inArc: true };

describe('isFireDenied', () => {
  it('is never denied when fire is not held, regardless of other gates', () => {
    expect(isFireDenied({ fireHeld: false, ready: 0, inArc: false })).toBe(false);
  });

  it('is not denied when held, ready, and in-arc', () => {
    expect(isFireDenied(READY_IN_ARC)).toBe(false);
  });

  it('is NOT denied by a bare cooldown (ready < 1) while in-arc — ' +
    'this is the sustained hold-to-fire case; the reload bars already communicate it', () => {
    expect(isFireDenied({ ...READY_IN_ARC, ready: 0.99 })).toBe(false);
    expect(isFireDenied({ ...READY_IN_ARC, ready: 0 })).toBe(false);
  });

  it('is denied when aim is outside the selected weapon arc, even when ready', () => {
    expect(isFireDenied({ ...READY_IN_ARC, inArc: false })).toBe(true);
  });

  it('is denied when out of arc even mid-cooldown', () => {
    expect(isFireDenied({ ...READY_IN_ARC, inArc: false, ready: 0.2 })).toBe(true);
  });

  it('a weapons-safe hold (fire held, ready, in-arc) does NOT pulse denied — ' +
    'the server fires in waiting/countdown too, only damage is suppressed', () => {
    expect(isFireDenied(READY_IN_ARC)).toBe(false);
  });
});

describe('firePressEdge', () => {
  it('is true only on the off->on transition', () => {
    expect(firePressEdge(false, true)).toBe(true);
    expect(firePressEdge(true, true)).toBe(false);
    expect(firePressEdge(false, false)).toBe(false);
    expect(firePressEdge(true, false)).toBe(false);
  });
});

describe('isPressEdgeNotReady', () => {
  it('blips once on a fresh press while on cooldown, in-arc', () => {
    expect(isPressEdgeNotReady({ ...READY_IN_ARC, ready: 0.4 }, false)).toBe(true);
  });

  it('does NOT blip on a sustained hold (no edge) even while on cooldown', () => {
    expect(isPressEdgeNotReady({ ...READY_IN_ARC, ready: 0.4 }, true)).toBe(false);
  });

  it('does not blip when already ready — nothing to warn about', () => {
    expect(isPressEdgeNotReady({ ...READY_IN_ARC, ready: 1 }, false)).toBe(false);
  });

  it('defers to isFireDenied when out-of-arc (no double signal)', () => {
    expect(isPressEdgeNotReady({ ...READY_IN_ARC, ready: 0.4, inArc: false }, false)).toBe(false);
  });
});

describe('isFireDenied + isPressEdgeNotReady together — the sustained-fire scenario', () => {
  it('holding fire through a full reload cycle in-arc never denies', () => {
    const prevFireHeld = true; // fire was already held before this simulated window
    for (const ready of [1, 0.75, 0.5, 0.25, 0, 0.25, 0.5, 0.75, 1]) {
      const p = { fireHeld: true, ready, inArc: true };
      expect(isFireDenied(p) || isPressEdgeNotReady(p, prevFireHeld)).toBe(false);
    }
  });

  it('a fresh press while out of arc denies immediately', () => {
    const p = { fireHeld: true, ready: 1, inArc: false };
    expect(isFireDenied(p) || isPressEdgeNotReady(p, false)).toBe(true);
  });

  it('holding fire through the weapons-safe phase (waiting/countdown) never denies — ' +
    'the server fires there too, so this is not a fire-denial gate', () => {
    const prevFireHeld = true;
    const p = { fireHeld: true, ready: 1, inArc: true };
    expect(isFireDenied(p) || isPressEdgeNotReady(p, prevFireHeld)).toBe(false);
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
