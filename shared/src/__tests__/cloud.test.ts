// MULTI-SPECTRAL COUNTERMEASURE cloud (Story 9.3; Eric rulings 2026-10-11,
// epic-9 amendments 40–47) — the shared pixel function both sides run. These
// assert CONTRACTS read from CONFIG (determinism, bounds, decay, the blocking
// predicate) and the no-transcendentals posture that keeps every engine
// bit-identical. Wounded smoke (`CONFIG.smoke`) is a different block and is
// checked untouched so the two are never conflated.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  cloudBase,
  cloudBlocks,
  cloudOutlineRadius,
  cloudScale,
  cloudSeed,
  forEachLivingPixel,
  livingPixelCount,
  pixelAlive,
  pointInCloud,
} from '../index.js';

const C = CONFIG.countermeasure;
const SRC = readFileSync(fileURLToPath(new URL('../sim/cloud.ts', import.meta.url)), 'utf8');

describe('cloudSeed / cloudBase — a pure function of the id', () => {
  it('the same id gives bit-identical offsets and death ages on two calls', () => {
    expect(cloudSeed('cl7')).toBe(cloudSeed('cl7'));
    const a = cloudBase('cl7');
    const b = cloudBase('cl7');
    expect(Array.from(a.ox)).toEqual(Array.from(b.ox));
    expect(Array.from(a.oy)).toEqual(Array.from(b.oy));
    expect(Array.from(a.dieAt)).toEqual(Array.from(b.dieAt));
  });

  it('two different ids give different clouds', () => {
    expect(cloudSeed('cl1')).not.toBe(cloudSeed('cl2'));
    expect(Array.from(cloudBase('cl1').ox)).not.toEqual(Array.from(cloudBase('cl2').ox));
  });

  it('the seed is a uint32', () => {
    for (const id of ['cl1', 'cl99', 'cl123456']) {
      const s = cloudSeed(id);
      expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff, id).toBe(true);
    }
  });

  it('has `pixels` entries, every offset inside r0 and every death age in [dieMinMs, dieMaxMs)', () => {
    for (const id of ['cl1', 'cl2', 'cl77']) {
      const { ox, oy, dieAt } = cloudBase(id);
      expect(ox.length).toBe(C.pixels);
      expect(oy.length).toBe(C.pixels);
      expect(dieAt.length).toBe(C.pixels);
      for (let i = 0; i < C.pixels; i++) {
        expect(ox[i] * ox[i] + oy[i] * oy[i] <= C.r0 * C.r0, `${id} #${i}`).toBe(true);
        expect(dieAt[i] >= C.dieMinMs && dieAt[i] < C.dieMaxMs, `${id} #${i}`).toBe(true);
      }
    }
  });
});

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

describe('living pixels — the decay is the fade', () => {
  const base = cloudBase('cl3');

  it('all pixels live at birth, none at or past dieMaxMs, and the count never rises', () => {
    expect(livingPixelCount(base, 0)).toBe(C.pixels);
    expect(livingPixelCount(base, C.dieMaxMs)).toBe(0);
    expect(livingPixelCount(base, C.lifeMs)).toBe(0);
    let prev = Infinity;
    for (let age = 0; age <= C.dieMaxMs; age += 100) {
      const n = livingPixelCount(base, age);
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });

  it('forEachLivingPixel yields exactly the living pixels, at centre + offset × scale', () => {
    const age = (C.dieMinMs + C.dieMaxMs) / 2;
    const s = cloudScale(age);
    const seen: number[] = [];
    forEachLivingPixel(base, 100, -50, age, (x, y, i) => {
      seen.push(i);
      expect(pixelAlive(base, i, age)).toBe(true);
      expect(x).toBe(100 + base.ox[i] * s);
      expect(y).toBe(-50 + base.oy[i] * s);
    });
    expect(seen.length).toBe(livingPixelCount(base, age));
    for (let i = 0; i < C.pixels; i++) expect(seen.includes(i)).toBe(pixelAlive(base, i, age));
  });
});

describe('pointInCloud — inside the outline', () => {
  const cloud = { x: 0, y: 0, bornAt: 1000 };

  it('the outline boundary is inside; just past it is not', () => {
    const r = cloudOutlineRadius(0);
    expect(pointInCloud({ x: r, y: 0 }, cloud, 1000)).toBe(true);
    expect(pointInCloud({ x: r + 0.01, y: 0 }, cloud, 1000)).toBe(false);
    const late = C.lifeMs / 2;
    const rl = cloudOutlineRadius(late);
    expect(pointInCloud({ x: 0, y: rl }, cloud, 1000 + late)).toBe(true);
    expect(pointInCloud({ x: 0, y: rl + 0.01 }, cloud, 1000 + late)).toBe(false);
  });
});

describe('cloudBlocks — a living pixel footprint on the segment', () => {
  const cloud = { x: 0, y: 0, bornAt: 5000 };
  const base = cloudBase('cl11');

  it('a segment straight through a fresh cloud centre is blocked', () => {
    expect(cloudBlocks({ x: -C.r1, y: 0 }, { x: C.r1, y: 0 }, cloud, base, 5000)).toBe(true);
  });

  it('a segment missing the outline by more than the footprint is not blocked', () => {
    const off = cloudOutlineRadius(0) + C.footprintU + 1;
    expect(cloudBlocks({ x: -1000, y: off }, { x: 1000, y: off }, cloud, base, 5000)).toBe(false);
  });

  it('a dead cloud (age ≥ lifeMs) blocks nothing', () => {
    expect(cloudBlocks({ x: -C.r1, y: 0 }, { x: C.r1, y: 0 }, cloud, base, 5000 + C.lifeMs)).toBe(false);
  });

  it('agrees with a brute-force check over the living pixels', () => {
    const age = 9000;
    for (let k = 0; k < 40; k++) {
      const yy = -C.r1 + (k * 2 * C.r1) / 40;
      const a = { x: -2 * C.r1, y: yy };
      const b = { x: 2 * C.r1, y: -yy / 2 };
      let brute = false;
      forEachLivingPixel(base, cloud.x, cloud.y, age, (x, y) => {
        // perpendicular distance from (x,y) to segment a→b, squared
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
        const px = a.x + t * dx - x;
        const py = a.y + t * dy - y;
        if (px * px + py * py <= C.footprintU * C.footprintU) brute = true;
      });
      expect(cloudBlocks(a, b, cloud, base, cloud.bornAt + age), `line ${k}`).toBe(brute);
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

  it('leaves WOUNDED smoke (CONFIG.smoke) untouched at its 250 ms cadence', () => {
    expect(CONFIG.smoke.puffIntervalMs).toBe(250);
  });
});
