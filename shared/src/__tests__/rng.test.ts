import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../math/rng.js';

describe('mulberry32', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a.next()).not.toBe(b.next());
  });

  it('emits floats in [0, 1)', () => {
    const r = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('float() stays within [min, max)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = r.float(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it('int() stays within [min, max] inclusive and hits both ends', () => {
    const r = mulberry32(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 4);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(4);
      seen.add(v);
    }
    expect(seen.has(1)).toBe(true);
    expect(seen.has(4)).toBe(true);
  });

  it('pick() returns an element of the array', () => {
    const r = mulberry32(42);
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(r.pick(arr));
    }
  });
});
