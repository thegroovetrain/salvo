// Denied-click feedback (render/deniedFire.ts): one pure predicate — a fresh
// click that is out of arc OR not ready blips red — plus the rate-limited
// pulse. Click-on-cooldown DOES blip now (the old hold-to-fire suppression is
// void under one-shot-per-click). Still deliberately NOT gated on the
// waiting/countdown "weapons safe" phase — the server fires all weapons in
// those phases too (only damage is suppressed), so a weapons-safe click must
// NOT pulse "denied" while a shell visibly leaves the tube.

import { describe, it, expect } from 'vitest';
import {
  isClickDenied,
  DeniedPulse,
  PULSE_DURATION_MS,
  PULSE_RATE_MS,
} from '../render/deniedFire.js';

describe('isClickDenied — truth table', () => {
  it('no click never denies, whatever the gates say', () => {
    expect(isClickDenied({ clicked: false, ready: false, inArc: false })).toBe(false);
    expect(isClickDenied({ clicked: false, ready: true, inArc: false })).toBe(false);
    expect(isClickDenied({ clicked: false, ready: false, inArc: true })).toBe(false);
    expect(isClickDenied({ clicked: false, ready: true, inArc: true })).toBe(false);
  });

  it('a successful click (ready + in-arc) does not blip', () => {
    expect(isClickDenied({ clicked: true, ready: true, inArc: true })).toBe(false);
  });

  it('a click on cooldown blips (hold-suppression rationale is void under click-to-fire)', () => {
    expect(isClickDenied({ clicked: true, ready: false, inArc: true })).toBe(true);
  });

  it('a click out of arc blips, even when ready', () => {
    expect(isClickDenied({ clicked: true, ready: true, inArc: false })).toBe(true);
  });

  it('a click out of arc AND not ready blips (one signal, not two)', () => {
    expect(isClickDenied({ clicked: true, ready: false, inArc: false })).toBe(true);
  });

  it('a weapons-safe click (ready, in-arc) does NOT blip — the server fires in ' +
    'waiting/countdown too, only damage is suppressed', () => {
    expect(isClickDenied({ clicked: true, ready: true, inArc: true })).toBe(false);
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

  it('rate-limits: repeated denial does not re-trigger before PULSE_RATE_MS elapses', () => {
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
    p.update(false, 50); // no denied click mid-window
    expect(p.update(true, 100)).toBe(false); // still within PULSE_RATE_MS of the last trigger
  });
});
