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
  DenialDedup,
  DEDUP_KEY_CAP,
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

describe('DenialDedup — exactly one feedback per denied press (Story 1.10)', () => {
  it('a predicted denial suppresses the matching server echo (never two)', () => {
    const d = new DenialDedup();
    d.markPredicted(1, 4); // predicted denial fed back instantly at press time
    expect(d.serverDenied(1, 4)).toBe(false); // the ~RTT-later echo is silent
  });

  it('an UNPREDICTED server denial fires the feedback (never zero — the silent cases)', () => {
    const d = new DenialDedup();
    expect(d.serverDenied(2, 7)).toBe(true); // within-RTT double press / staleness race
    // …and even a duplicate server denial for the same press cannot double it.
    expect(d.serverDenied(2, 7)).toBe(false);
  });

  it('keys are (slot, seq) — same seq on another slot is a DIFFERENT press', () => {
    const d = new DenialDedup();
    d.markPredicted(0, 3);
    expect(d.serverDenied(1, 3)).toBe(true); // different slot: unpredicted
    expect(d.serverDenied(0, 3)).toBe(false); // the predicted one stays suppressed
  });

  it('weapon fireSeq and ability actSeq streams coexist without collisions across slots', () => {
    const d = new DenialDedup();
    d.markPredicted(1, 5); // torpedo click, fireSeq 5
    d.markPredicted(2, 5); // boost press, actSeq 5 — same number, different slot
    expect(d.serverDenied(1, 5)).toBe(false);
    expect(d.serverDenied(2, 5)).toBe(false);
  });

  it('evicts FIFO past DEDUP_KEY_CAP (bounded memory, oldest keys forgotten)', () => {
    const d = new DenialDedup();
    d.markPredicted(0, 0); // the key that will be evicted
    for (let i = 1; i <= DEDUP_KEY_CAP; i++) d.markPredicted(0, i);
    // Key (0,0) fell off the FIFO — a server denial for it would fire again
    // (harmless: real echoes land within ~RTT, ages before 64 newer presses).
    expect(d.serverDenied(0, 0)).toBe(true);
    // The newest keys are all still present.
    expect(d.serverDenied(0, DEDUP_KEY_CAP)).toBe(false);
  });

  it('marking the same predicted key twice does not grow the FIFO (idempotent)', () => {
    const d = new DenialDedup();
    for (let i = 0; i < 10; i++) d.markPredicted(3, 9);
    expect(d.serverDenied(3, 9)).toBe(false);
  });

  it('clear() at an activation-clear boundary lets a reused (slot, seq) fire again', () => {
    // The activation queue drops queued presses WITHOUT advancing actCount, so
    // the next press reuses an actSeq. Without a paired clear() the stale mark
    // would suppress a genuine later server denial as an echo (silent denial).
    const d = new DenialDedup();
    d.markPredicted(2, 3); // a press marked in the prior life
    d.clear(); // own sunk / respawn / spectate / reconnect boundary
    // The reused (2, 3) is now a fresh press: a server denial for it MUST fire.
    expect(d.serverDenied(2, 3)).toBe(true);
  });
});
