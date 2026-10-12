// MULTI-SPECTRAL COUNTERMEASURE cloud (Story 9.3; session 2, Eric 2026-10-12:
// a client overlay) — the spray-disc geometry both sides read. These assert
// CONTRACTS read from CONFIG (the disc grows r0 → r1 over lifeMs, clamped)
// and the no-transcendentals posture.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG, cloudOutlineRadius, cloudScale } from '../index.js';

const C = CONFIG.countermeasure;
const SRC = readFileSync(fileURLToPath(new URL('../sim/cloud.ts', import.meta.url)), 'utf8');

describe('cloudScale / cloudOutlineRadius — outward growth r0 → r1 over lifeMs', () => {
  it('scale is 1 at birth, r1/r0 at lifeMs, and clamped on both sides', () => {
    expect(cloudScale(0)).toBe(1);
    expect(cloudScale(-500)).toBe(1);
    expect(cloudScale(C.lifeMs)).toBe(C.r1 / C.r0);
    expect(cloudScale(C.lifeMs * 2)).toBe(C.r1 / C.r0);
  });

  it('the outline runs r0 → r1 and never shrinks', () => {
    expect(cloudOutlineRadius(0)).toBe(C.r0);
    expect(cloudOutlineRadius(C.lifeMs)).toBe(C.r1);
    let prev = -Infinity;
    for (let age = 0; age <= C.lifeMs + 1000; age += 250) {
      const r = cloudOutlineRadius(age);
      expect(r).toBeGreaterThanOrEqual(prev);
      prev = r;
    }
  });
});

describe('cloud.ts — no transcendentals (bit-identical on every engine)', () => {
  it('calls no transcendental Math function, no Math.random, no Date.now', () => {
    for (const fn of ['sin', 'cos', 'tan', 'atan', 'atan2', 'exp', 'log', 'pow', 'sqrt', 'random']) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(SRC), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(SRC), 'Date.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(SRC), 'Math.PI is forbidden').toBe(false);
  });
});
