// Screen shake on taking damage (render/shake.ts): pure decay math + the
// fog-safe clamp, plus the stateful driver's per-frame offset.

import { describe, it, expect } from 'vitest';
import {
  shakeMagnitude,
  shakeDecay,
  triggerShake,
  advanceShake,
  shakeCurrentMagnitude,
  IDLE_SHAKE,
  SHAKE_MAX_PX,
  DECAY_RATE,
  ShakeDriver,
} from '../render/shake.js';
import { EXTRA_MARGIN_PX } from '../render/fog.js';

describe('shakeMagnitude', () => {
  it('is subtle at gun damage (15hp) and heavy at torpedo damage (55hp)', () => {
    expect(shakeMagnitude(15)).toBeCloseTo(4, 6);
    expect(shakeMagnitude(55)).toBeCloseTo(16, 6);
  });

  it('interpolates linearly between the anchors (mine damage lands in between)', () => {
    const mid = shakeMagnitude(35); // halfway between 15 and 55
    expect(mid).toBeCloseTo((4 + 16) / 2, 6);
  });

  it('never drops below the subtle anchor or exceeds the fog-safe cap', () => {
    expect(shakeMagnitude(0)).toBe(4); // storm/unknown tiny damage never below subtle
    expect(shakeMagnitude(1000)).toBeLessThanOrEqual(SHAKE_MAX_PX); // absurd damage stays fog-safe
    expect(shakeMagnitude(1000)).toBeCloseTo(16, 6); // saturates at the heavy anchor, not beyond
  });

  it('never exceeds the fog bake margin (EXTRA_MARGIN_PX) — the whole point of the clamp', () => {
    expect(SHAKE_MAX_PX).toBeLessThan(EXTRA_MARGIN_PX);
    expect(shakeMagnitude(9999)).toBeLessThan(EXTRA_MARGIN_PX);
  });
});

describe('shakeDecay', () => {
  it('is the peak at t=0 and decays exponentially at DECAY_RATE', () => {
    expect(shakeDecay(16, 0)).toBe(16);
    expect(shakeDecay(16, 1 / DECAY_RATE)).toBeCloseTo(16 * Math.exp(-1), 10);
  });

  it('approaches zero for large t', () => {
    expect(shakeDecay(16, 5)).toBeLessThan(0.01);
  });
});

describe('triggerShake / advanceShake', () => {
  it('a fresh trigger sets peak = shakeMagnitude(damage) and resets the clock', () => {
    const s = triggerShake(IDLE_SHAKE, 15);
    expect(s.peak).toBeCloseTo(4, 6);
    expect(s.t).toBe(0);
  });

  it('a stronger hit mid-shake raises the peak', () => {
    let s = triggerShake(IDLE_SHAKE, 15); // subtle
    s = triggerShake(s, 55); // heavy arrives immediately after
    expect(s.peak).toBeCloseTo(16, 6);
  });

  it('a weaker hit mid-shake does not downgrade the decaying peak', () => {
    let s = triggerShake(IDLE_SHAKE, 55); // heavy, peak 16
    s = advanceShake(s, 0.05); // barely decayed
    const before = shakeCurrentMagnitude(s);
    s = triggerShake(s, 15); // subtle follow-up
    // peak stays at (decayed) heavy magnitude, not reset down to subtle's 4px
    expect(s.peak).toBeCloseTo(before, 6);
    expect(s.peak).toBeGreaterThan(4);
  });

  it('advanceShake accumulates elapsed time without touching peak', () => {
    const s = advanceShake(advanceShake({ peak: 10, t: 0 }, 0.1), 0.1);
    expect(s.peak).toBe(10);
    expect(s.t).toBeCloseTo(0.2, 10);
  });
});

describe('shakeCurrentMagnitude', () => {
  it('matches shakeDecay, clamped to [0, SHAKE_MAX_PX]', () => {
    const s = { peak: 16, t: 0.1 };
    expect(shakeCurrentMagnitude(s)).toBeCloseTo(shakeDecay(16, 0.1), 10);
  });

  it('is 0 for the idle state', () => {
    expect(shakeCurrentMagnitude(IDLE_SHAKE)).toBe(0);
  });
});

describe('ShakeDriver', () => {
  it('is at rest (zero offset) before any trigger', () => {
    const d = new ShakeDriver(() => 0);
    expect(d.update(0.016)).toEqual({ x: 0, y: 0 });
  });

  it('offset magnitude matches the decayed peak, direction from the injected rng', () => {
    const d = new ShakeDriver(() => 0); // angle 0 -> +x direction
    d.trigger(55); // heavy hit, peak 16
    const off = d.update(0); // dt=0, no decay yet this frame beyond trigger reset
    expect(off.x).toBeCloseTo(16, 4);
    expect(off.y).toBeCloseTo(0, 6);
  });

  it('decays toward zero and eventually rests at {0,0} (offset clamps, magnitude vanishes)', () => {
    const d = new ShakeDriver(() => 0.25); // angle = pi/2 -> +y direction
    d.trigger(15); // subtle hit, peak 4
    for (let i = 0; i < 200; i++) d.update(0.05); // 10s, far past decay
    expect(d.update(0.05)).toEqual({ x: 0, y: 0 });
    expect(d.magnitude).toBeLessThan(1e-10); // asymptotic decay, not exactly 0
  });

  it('re-randomizes direction every frame (trembles rather than swinging smoothly)', () => {
    let n = 0;
    const angles = [0, 0.25, 0.5]; // 0, pi/2, pi turns of the unit circle
    const d = new ShakeDriver(() => angles[n++ % angles.length]);
    d.trigger(55);
    const a = d.update(0);
    const b = d.update(0.001);
    const c = d.update(0.001);
    // Same decayed magnitude family, different directions each call.
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
  });
});
