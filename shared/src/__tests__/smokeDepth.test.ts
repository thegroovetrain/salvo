// Story 11.6 SMOKE SIGHT — the optical depth a set of SMOKE SCREEN clouds
// adds to an eye line (sim/smokeDepth.ts; Eric 2026-11-14: smoke occludes
// sight like rain, the owner blinded too). Contracts of the pure function
// only, as relations — never a bare number: a hard disc pays chord length ×
// thickness, a miss pays nothing, clouds add, the soft rim only ever thins,
// the depth is the same from either end, a segment pays only for the part of
// the chord it covers (no observer exemption), the soft quadrature tracks the
// true integral of the documented profile, non-finite input fails open, and
// the no-transcendentals source guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SMOKE_CHORD_SAMPLES, smokeDepthAlong, type SmokeDisc, type SmokeSightConfig } from '../sim/smokeDepth.js';
import { CONFIG } from '../constants.js';
import { mulberry32 } from '../math/rng.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/smokeDepth.ts', import.meta.url)), 'utf8');

/** The shipped dials, and the same thickness on a hard disc. */
const SHIPPED: SmokeSightConfig = { thickness: CONFIG.countermeasure.sightThickness, softFrac: CONFIG.countermeasure.sightSoftFrac };
const HARD: SmokeSightConfig = { thickness: SHIPPED.thickness, softFrac: 0 };

const R = CONFIG.countermeasure.r1;
const CLOUD: SmokeDisc = { x: 40, y: -25, r: R };

/** A segment through `c`'s center along bearing `brg`, reaching `reach` past the center each way. */
function through(c: SmokeDisc, brg: number, reach: number): [number, number, number, number] {
  const ux = Math.cos(brg);
  const uy = Math.sin(brg);
  return [c.x - ux * reach, c.y - uy * reach, c.x + ux * reach, c.y + uy * reach];
}

/** The documented edge profile, integrated along A → B at a fine step — the reference the 8-point chord rule approximates. */
function fineDepth(c: SmokeDisc, ax: number, ay: number, bx: number, by: number, cfg: SmokeSightConfig): number {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(len / 0.05);
  const w = c.r * cfg.softFrac;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const d = Math.hypot(ax + (bx - ax) * t - c.x, ay + (by - ay) * t - c.y);
    if (d >= c.r) continue;
    const u = w > 0 ? Math.min(1, (c.r - d) / w) : 1;
    sum += u * u * (3 - 2 * u);
  }
  return (sum * len * cfg.thickness) / n;
}

describe('smokeDepthAlong — a hard disc pays its chord', () => {
  it('a segment through the center, end to end outside the disc, pays 2r × thickness on every bearing', () => {
    for (const brg of [0, 0.7, 1.5707963, 2.9, 4.4]) {
      expect(smokeDepthAlong([CLOUD], ...through(CLOUD, brg, R * 2), HARD)).toBeCloseTo(2 * R * HARD.thickness, 6);
    }
  });

  it('an off-center chord pays 2 √(r² − offset²) × thickness', () => {
    for (const frac of [0.2, 0.5, 0.9]) {
      const off = R * frac;
      const got = smokeDepthAlong([CLOUD], CLOUD.x - R * 3, CLOUD.y + off, CLOUD.x + R * 3, CLOUD.y + off, HARD);
      expect(got).toBeCloseTo(2 * Math.sqrt(R * R - off * off) * HARD.thickness, 6);
    }
  });

  it('the depth scales with the thickness dial', () => {
    const seg = through(CLOUD, 0.3, R * 2);
    const one = smokeDepthAlong([CLOUD], ...seg, { thickness: 1, softFrac: SHIPPED.softFrac });
    expect(one).toBeGreaterThan(0);
    expect(smokeDepthAlong([CLOUD], ...seg, { thickness: 2.5, softFrac: SHIPPED.softFrac })).toBeCloseTo(2.5 * one, 6);
  });
});

describe('smokeDepthAlong — a miss pays nothing', () => {
  it('a line that passes outside the disc, a tangent, and a segment that stops short of the disc all read exactly 0, hard or soft', () => {
    for (const cfg of [HARD, SHIPPED]) {
      expect(smokeDepthAlong([CLOUD], CLOUD.x - R * 3, CLOUD.y + R * 1.01, CLOUD.x + R * 3, CLOUD.y + R * 1.01, cfg)).toBe(0);
      expect(smokeDepthAlong([CLOUD], CLOUD.x - R * 3, CLOUD.y + R, CLOUD.x + R * 3, CLOUD.y + R, cfg)).toBe(0); // tangent
      expect(smokeDepthAlong([CLOUD], CLOUD.x - R * 3, CLOUD.y, CLOUD.x - R * 1.01, CLOUD.y, cfg)).toBe(0); // on the line, short of the rim
      expect(smokeDepthAlong([CLOUD], CLOUD.x + R * 1.01, CLOUD.y, CLOUD.x + R * 3, CLOUD.y, cfg)).toBe(0); // past it, heading away
      expect(smokeDepthAlong([], ...through(CLOUD, 0, R * 2), cfg)).toBe(0); // no cloud at all
    }
  });
});

describe('smokeDepthAlong — clouds add', () => {
  it('the depth of a set is the sum of each cloud alone — apart, overlapping, and in any order', () => {
    const rng = mulberry32(0x5310c3);
    for (let n = 0; n < 200; n++) {
      const clouds: SmokeDisc[] = Array.from({ length: 1 + Math.floor(rng.next() * 4) }, () => ({
        x: (rng.next() * 2 - 1) * R * 2,
        y: (rng.next() * 2 - 1) * R * 2,
        r: R * (0.3 + rng.next()),
      }));
      const seg: [number, number, number, number] = [(rng.next() * 2 - 1) * R * 4, (rng.next() * 2 - 1) * R * 4, (rng.next() * 2 - 1) * R * 4, (rng.next() * 2 - 1) * R * 4];
      const each = clouds.reduce((sum, c) => sum + smokeDepthAlong([c], ...seg, SHIPPED), 0);
      expect(smokeDepthAlong(clouds, ...seg, SHIPPED)).toBeCloseTo(each, 6);
      expect(smokeDepthAlong([...clouds].reverse(), ...seg, SHIPPED)).toBeCloseTo(each, 6);
    }
  });

  it('the same disc twice is twice as thick', () => {
    const seg = through(CLOUD, 1.1, R * 2);
    expect(smokeDepthAlong([CLOUD, CLOUD], ...seg, SHIPPED)).toBeCloseTo(2 * smokeDepthAlong([CLOUD], ...seg, SHIPPED), 6);
  });
});

describe('smokeDepthAlong — the soft rim only thins', () => {
  it('on any chord the depth never grows as softFrac grows from a hard disc to soft all the way in, and a softer disc is strictly thinner through the center', () => {
    const softs = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1];
    for (const off of [0, R * 0.4, R * 0.8, R * 0.97]) {
      const depths = softs.map((softFrac) =>
        smokeDepthAlong([CLOUD], CLOUD.x - R * 2, CLOUD.y + off, CLOUD.x + R * 2, CLOUD.y + off, { thickness: SHIPPED.thickness, softFrac }),
      );
      for (let i = 1; i < depths.length; i++) expect(depths[i], `offset ${off}, softFrac ${softs[i]}`).toBeLessThanOrEqual(depths[i - 1]);
      expect(depths[depths.length - 1]).toBeGreaterThan(0); // soft to the center is still smoke
    }
    const center = softs.map((softFrac) => smokeDepthAlong([CLOUD], ...through(CLOUD, 0, R * 2), { thickness: SHIPPED.thickness, softFrac }));
    expect(center[center.length - 1]).toBeLessThan(center[0]);
  });

  it('a softFrac past 1 reads as 1 (soft to the center, never further)', () => {
    const seg = through(CLOUD, 0.4, R * 2);
    expect(smokeDepthAlong([CLOUD], ...seg, { thickness: 1, softFrac: 7 })).toBe(smokeDepthAlong([CLOUD], ...seg, { thickness: 1, softFrac: 1 }));
  });

  it(`the ${SMOKE_CHORD_SAMPLES}-point chord rule tracks the true integral of the documented profile: within 5 % at the shipped dials on seeded chords long enough to matter`, () => {
    const rng = mulberry32(0xc402d);
    let checked = 0;
    for (let n = 0; n < 400; n++) {
      const c: SmokeDisc = { x: 0, y: 0, r: CONFIG.countermeasure.r0 + rng.next() * (R - CONFIG.countermeasure.r0) };
      const seg: [number, number, number, number] = [(rng.next() * 2 - 1) * R * 2, (rng.next() * 2 - 1) * R * 2, (rng.next() * 2 - 1) * R * 2, (rng.next() * 2 - 1) * R * 2];
      const want = fineDepth(c, ...seg, SHIPPED);
      if (want < c.r * SHIPPED.thickness * 0.25) continue; // a sliver of rim: an absolute error, not a relative one
      const got = smokeDepthAlong([c], ...seg, SHIPPED);
      expect(Math.abs(got - want) / want, `chord ${n}`).toBeLessThan(0.05);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('smokeDepthAlong — the same from either end', () => {
  it('A → B and B → A read the same depth, through any number of clouds', () => {
    const rng = mulberry32(0x5e77e);
    let touched = 0;
    for (let n = 0; n < 300; n++) {
      const clouds: SmokeDisc[] = Array.from({ length: 1 + Math.floor(rng.next() * 3) }, () => ({
        x: (rng.next() * 2 - 1) * R * 2,
        y: (rng.next() * 2 - 1) * R * 2,
        r: R * (0.3 + rng.next()),
      }));
      const [ax, ay, bx, by] = [(rng.next() * 2 - 1) * R * 3, (rng.next() * 2 - 1) * R * 3, (rng.next() * 2 - 1) * R * 3, (rng.next() * 2 - 1) * R * 3];
      const fwd = smokeDepthAlong(clouds, ax, ay, bx, by, SHIPPED);
      expect(smokeDepthAlong(clouds, bx, by, ax, ay, SHIPPED)).toBeCloseTo(fwd, 6);
      if (fwd > 0) touched += 1;
    }
    expect(touched).toBeGreaterThan(0);
  });
});

describe('smokeDepthAlong — a segment pays only for the chord it covers', () => {
  it('NO OBSERVER EXEMPTION: from the center of a hard disc out past the rim pays r × thickness — the smoke the eye stands in counts', () => {
    expect(smokeDepthAlong([CLOUD], CLOUD.x, CLOUD.y, CLOUD.x + R * 3, CLOUD.y, HARD)).toBeCloseTo(R * HARD.thickness, 6);
    expect(smokeDepthAlong([CLOUD], CLOUD.x, CLOUD.y, CLOUD.x + R * 3, CLOUD.y, SHIPPED)).toBeGreaterThan(0);
  });

  it('a segment wholly inside a hard disc pays its own length × thickness', () => {
    const [ax, ay, bx, by] = [CLOUD.x - R * 0.3, CLOUD.y + R * 0.2, CLOUD.x + R * 0.4, CLOUD.y - R * 0.1];
    expect(smokeDepthAlong([CLOUD], ax, ay, bx, by, HARD)).toBeCloseTo(Math.hypot(bx - ax, by - ay) * HARD.thickness, 6);
  });

  it('a segment that ends inside pays from the rim to its end, and splitting a hard chord anywhere adds back to the whole', () => {
    const [ax, ay, bx, by] = through(CLOUD, 0.6, R * 2);
    const whole = smokeDepthAlong([CLOUD], ax, ay, bx, by, HARD);
    for (const t of [0.1, 0.3, 0.5, 0.62, 0.9]) {
      const mx = ax + (bx - ax) * t;
      const my = ay + (by - ay) * t;
      const near = smokeDepthAlong([CLOUD], ax, ay, mx, my, HARD);
      const far = smokeDepthAlong([CLOUD], mx, my, bx, by, HARD);
      expect(near + far).toBeCloseTo(whole, 6);
      expect(near).toBeLessThanOrEqual(whole);
    }
  });

  it('extending a segment through a hard disc never reduces its depth, and reaches the whole chord', () => {
    const [ax, ay, bx, by] = through(CLOUD, 2.2, R * 2);
    let prev = 0;
    for (let k = 1; k <= 40; k++) {
      const t = k / 40;
      const hard = smokeDepthAlong([CLOUD], ax, ay, ax + (bx - ax) * t, ay + (by - ay) * t, HARD);
      expect(hard).toBeGreaterThanOrEqual(prev - 1e-9); // float dust once the whole chord is covered
      prev = hard;
    }
    expect(prev).toBeCloseTo(2 * R * HARD.thickness, 6);
  });
});

describe('smokeDepthAlong — fails open', () => {
  const seg = through(CLOUD, 0, R * 2);

  it('a non-finite endpoint, a zero-length segment and a non-positive or non-finite thickness add 0', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (let i = 0; i < 4; i++) {
        const s = [...seg] as [number, number, number, number];
        s[i] = bad;
        expect(smokeDepthAlong([CLOUD], ...s, SHIPPED), `endpoint ${i} = ${bad}`).toBe(0);
      }
    }
    expect(smokeDepthAlong([CLOUD], CLOUD.x, CLOUD.y, CLOUD.x, CLOUD.y, SHIPPED)).toBe(0);
    for (const thickness of [0, -1, NaN]) expect(smokeDepthAlong([CLOUD], ...seg, { thickness, softFrac: SHIPPED.softFrac })).toBe(0);
  });

  it('a cloud with a non-finite or non-positive radius or a non-finite center is skipped — the others still count', () => {
    const alone = smokeDepthAlong([CLOUD], ...seg, SHIPPED);
    const junk: SmokeDisc[] = [
      { x: CLOUD.x, y: CLOUD.y, r: NaN },
      { x: CLOUD.x, y: CLOUD.y, r: 0 },
      { x: CLOUD.x, y: CLOUD.y, r: -R },
      { x: CLOUD.x, y: CLOUD.y, r: Infinity },
      { x: NaN, y: CLOUD.y, r: R },
      { x: CLOUD.x, y: Infinity, r: R },
    ];
    expect(smokeDepthAlong(junk, ...seg, SHIPPED)).toBe(0);
    expect(smokeDepthAlong([...junk, CLOUD], ...seg, SHIPPED)).toBe(alone);
    expect(alone).toBeGreaterThan(0);
  });

  it('the answer is always finite and never negative', () => {
    const rng = mulberry32(0xf1217e);
    for (let n = 0; n < 300; n++) {
      const c: SmokeDisc = { x: (rng.next() * 2 - 1) * 1e4, y: (rng.next() * 2 - 1) * 1e4, r: rng.next() * 1e4 };
      const got = smokeDepthAlong([c], (rng.next() * 2 - 1) * 1e4, (rng.next() * 2 - 1) * 1e4, (rng.next() * 2 - 1) * 1e4, (rng.next() * 2 - 1) * 1e4, { thickness: rng.next() * 10, softFrac: rng.next() * 1.5 });
      expect(Number.isFinite(got)).toBe(true);
      expect(got).toBeGreaterThanOrEqual(0);
    }
  });
});

const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'expm1', 'log', 'log2', 'log10', 'log1p', 'pow', 'hypot', 'cbrt', 'random',
];

describe('sim/smokeDepth.ts source guard', () => {
  it('uses no transcendental, no unseeded randomness and no clock (Math.sqrt is the one root it may take)', () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const fn of FORBIDDEN_MATH) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(code), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(code), 'Date.now( is forbidden').toBe(false);
    expect(/\bnew Date\b/.test(code), 'new Date is forbidden').toBe(false);
    expect(/performance\.now\s*\(/.test(code), 'performance.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(code), 'Math.PI is forbidden').toBe(false);
    expect(/\*\*/.test(code), 'the ** operator is forbidden').toBe(false);
  });
});
