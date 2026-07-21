// RttEstimator (server/src/game/rtt.ts) — the sliding-window minimum feeding
// the D1 fire-time clamp. Pure over (sample, timestamp) pairs; no Colyseus.

import { describe, it, expect } from 'vitest';
import { RttEstimator } from '../game/rtt.js';

const WINDOW = 10_000;

describe('RttEstimator — windowed minimum', () => {
  it('returns null when empty (never measured)', () => {
    const e = new RttEstimator(WINDOW);
    expect(e.minMs(0)).toBeNull();
    expect(e.minMs(999_999)).toBeNull();
  });

  it('a single sample is the minimum', () => {
    const e = new RttEstimator(WINDOW);
    e.addSample(42, 1000);
    expect(e.minMs(1000)).toBe(42);
  });

  it('tracks the MIN over multiple samples, regardless of arrival order', () => {
    const e = new RttEstimator(WINDOW);
    e.addSample(80, 1000);
    e.addSample(35, 2000);
    e.addSample(120, 3000);
    expect(e.minMs(3000)).toBe(35);
  });

  it('expires samples older than the window (strictly: age > windowMs)', () => {
    const e = new RttEstimator(WINDOW);
    e.addSample(35, 1000);
    expect(e.minMs(1000 + WINDOW)).toBe(35); // exactly at the edge: still live
    expect(e.minMs(1001 + WINDOW)).toBeNull(); // one ms past: expired
  });

  it('the min recomputes after the old best expires', () => {
    const e = new RttEstimator(WINDOW);
    e.addSample(35, 1000); // the early best-case
    e.addSample(90, 9000); // a later, worse sample
    expect(e.minMs(9000)).toBe(35);
    // 35's timestamp ages out; only the 90 survives.
    expect(e.minMs(1001 + WINDOW)).toBe(90);
    // Eventually everything expires back to null.
    expect(e.minMs(9001 + WINDOW)).toBeNull();
  });

  it('addSample prunes as it goes (the store stays bounded by the window)', () => {
    const e = new RttEstimator(WINDOW);
    for (let t = 0; t < 100_000; t += 1000) e.addSample(50 + (t % 7), t);
    // Only samples within the last WINDOW ms of t=99000 can remain.
    expect(e.size).toBeLessThanOrEqual(WINDOW / 1000 + 1);
    expect(e.minMs(99_000)).not.toBeNull();
  });
});
