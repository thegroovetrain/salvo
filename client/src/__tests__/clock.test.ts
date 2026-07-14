import { describe, it, expect } from 'vitest';
import { ServerClock } from '../net/clock.js';

// Deterministic pseudo-random for jitter (mulberry32-style, local to the test).
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ServerClock', () => {
  it('is not ready before the first sample and returns 0', () => {
    const clock = new ServerClock(() => 1000);
    expect(clock.ready).toBe(false);
    expect(clock.serverNow()).toBe(0);
  });

  it('snaps to the first sample immediately (welcome seeds the clock)', () => {
    const clock = new ServerClock();
    // Server t=500 received at client time 10_000 with 30ms transit.
    clock.addSample(500, 10_030);
    expect(clock.ready).toBe(true);
    // serverNow at client 10_030 should be ~500 (only transit bias off).
    expect(clock.serverNow(10_030)).toBeCloseTo(500, 6);
  });

  it('converges to the minimum-transit offset under jitter', () => {
    const clock = new ServerClock();
    const rand = rng(7);
    const trueOffset = 123_456; // client clock is this far ahead of server t
    let serverT = 0;
    let clientT = trueOffset;
    const MIN_TRANSIT = 20;
    for (let i = 0; i < 200; i++) {
      serverT += 50;
      clientT += 50;
      const transit = MIN_TRANSIT + rand() * 60; // 20..80ms jitter
      clock.addSample(serverT, clientT + transit);
    }
    // Estimated offset should sit near trueOffset + minTransit (min-bias),
    // never dragged upward by the jittery samples.
    expect(clock.offset).not.toBeNull();
    expect(clock.offset!).toBeGreaterThanOrEqual(trueOffset + MIN_TRANSIT - 1);
    expect(clock.offset!).toBeLessThan(trueOffset + MIN_TRANSIT + 15);
  });

  it('ignores a single huge jitter spike', () => {
    const clock = new ServerClock();
    for (let i = 1; i <= 50; i++) clock.addSample(i * 50, i * 50 + 1000 + 25);
    const before = clock.offset!;
    clock.addSample(51 * 50, 51 * 50 + 1000 + 500); // 500ms spike
    // Rolling min is unaffected; the slew can only move toward the min.
    expect(clock.offset!).toBeCloseTo(before, 6);
  });

  it('serverNow is monotonic across an offset correction', () => {
    const clock = new ServerClock();
    // Early samples with high transit, so the estimate starts biased high
    // (serverNow reads low), then a fast sample arrives and pulls it down.
    clock.addSample(1000, 2000 + 200); // offset sample 1200
    const t1 = clock.serverNow(2300);
    clock.addSample(1400, 2400 + 5); // offset sample 1005 -> snap (>250ms)
    const t2 = clock.serverNow(2400);
    const t3 = clock.serverNow(2450);
    expect(t2).toBeGreaterThanOrEqual(t1);
    expect(t3).toBeGreaterThanOrEqual(t2);
  });

  it('serverNow advances with the client clock between samples', () => {
    const clock = new ServerClock();
    clock.addSample(0, 5000);
    const a = clock.serverNow(5100);
    const b = clock.serverNow(5250);
    expect(b - a).toBeCloseTo(150, 6);
  });
});
