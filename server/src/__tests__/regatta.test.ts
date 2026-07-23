// Regatta Hoist personal-hue assignment (game/regatta.ts) + the join-option
// sanitizer (rooms/roomOptions.ts sanitizeColorPref). Pure functions — the full
// FCFS / nearest-free / random-free / exhaustion matrix (Eric ruling 2026-07-23),
// plus the plumbing sanitizer. Deterministic: the no-preference path draws off a
// seeded mulberry32 (no Math.random).

import { describe, it, expect } from 'vitest';
import { REGATTA_HUES, mulberry32 } from '@salvo/shared';
import { assignHue } from '../game/regatta.js';
import { sanitizeColorPref } from '../rooms/roomOptions.js';

const WHEEL = REGATTA_HUES.length; // 20
const rng = () => mulberry32(0x1234);

describe('assignHue — FCFS personal-hue assignment', () => {
  it('grants a FREE preference verbatim', () => {
    expect(assignHue(new Set([1, 2, 3]), 7, rng())).toBe(7);
    expect(assignHue(new Set(), 0, rng())).toBe(0);
    expect(assignHue(new Set(), 19, rng())).toBe(19);
  });

  it('a TAKEN preference falls to the nearest free hue, ties resolving CLOCKWISE (ascending)', () => {
    // pref 7 taken; 6 + 8 also taken; 5 and 9 both free at distance 2 → 9 wins (7+2).
    expect(assignHue(new Set([6, 7, 8]), 7, rng())).toBe(9);
  });

  it('nearest-free picks the strictly closer side when there is no tie', () => {
    // pref 7 taken, 8 free (distance 1) beats 5 (distance 2).
    expect(assignHue(new Set([6, 7]), 7, rng())).toBe(8);
    // pref 7 taken, 8 taken, 6 free (distance 1) — the only distance-1 free hue.
    expect(assignHue(new Set([7, 8]), 7, rng())).toBe(6);
  });

  it('nearest-free wraps around the wheel ends', () => {
    // pref 0 taken, 1 taken, 19 free (distance 1, wrapping) beats 2 (distance 2).
    expect(assignHue(new Set([0, 1]), 0, rng())).toBe(19);
  });

  it('NO preference draws a uniformly-random FREE hue off the seeded stream (deterministic)', () => {
    const used = new Set([0, 1, 2]);
    const a = assignHue(used, undefined, rng());
    const b = assignHue(used, undefined, rng()); // same seed → same draw
    expect(a).toBe(b);
    expect(used.has(a)).toBe(false); // never a taken hue
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(WHEEL);
  });

  it('the no-preference draw only ever lands on free hues (100 draws, distinct seeds)', () => {
    const used = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // half the wheel taken
    for (let s = 0; s < 100; s++) {
      const hue = assignHue(used, undefined, mulberry32(s));
      expect(used.has(hue)).toBe(false);
      expect(hue).toBeGreaterThanOrEqual(10);
    }
  });

  it('defensively survives a full wheel (unreachable at cap 20): returns pref ?? 0, never throws', () => {
    const full = new Set(Array.from({ length: WHEEL }, (_, i) => i));
    expect(assignHue(full, 5, rng())).toBe(5); // pref ?? 0
    expect(assignHue(full, undefined, rng())).toBe(0);
  });

  it('sequential FCFS joins (no preference) never collide — 20 distinct hues fill the wheel', () => {
    const stream = mulberry32(0xabc);
    const used = new Set<number>();
    for (let i = 0; i < WHEEL; i++) {
      const hue = assignHue(used, undefined, stream);
      expect(used.has(hue)).toBe(false); // fresh every time
      used.add(hue);
    }
    expect(used.size).toBe(WHEEL); // the whole wheel, uniquely
  });

  it('an earlier join holds a contended preference; the later one flies the nearest free hue', () => {
    const used = new Set<number>();
    const first = assignHue(used, 7, rng()); // free → 7
    used.add(first);
    const second = assignHue(used, 7, rng()); // 7 taken → nearest free (8, distance 1)
    used.add(second);
    expect(first).toBe(7);
    expect(second).toBe(8);
    expect(first).not.toBe(second);
  });
});

describe('sanitizeColorPref — join-option plumbing (never dev-gated)', () => {
  it('accepts every valid wheel index 0..19', () => {
    for (let i = 0; i < WHEEL; i++) expect(sanitizeColorPref(i)).toBe(i);
  });

  it('rejects out-of-range / fractional / non-number / absent → undefined', () => {
    expect(sanitizeColorPref(20)).toBeUndefined(); // == WHEEL, out of range
    expect(sanitizeColorPref(-1)).toBeUndefined();
    expect(sanitizeColorPref(3.5)).toBeUndefined();
    expect(sanitizeColorPref('7')).toBeUndefined();
    expect(sanitizeColorPref(NaN)).toBeUndefined();
    expect(sanitizeColorPref(null)).toBeUndefined();
    expect(sanitizeColorPref(undefined)).toBeUndefined();
    expect(sanitizeColorPref({})).toBeUndefined();
  });
});
