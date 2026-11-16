// ai/hitChance.ts (Story 11.9, Eric 2026-11-16, R1–R4) — the per-shell hit
// chance a bot clicks its main battery on. Contracts only: the chance is a
// probability, it never grows with range, a larger outline never lowers it,
// the blip model IS the smallest hull side-on, the deterministic lattice
// agrees with a seeded Monte Carlo of the real samplers (`dispersedPoint` +
// `scatterOffset`), and `barRangeU` is where the chance crosses the bar.

import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  dispersedPoint,
  effectiveStats,
  hmToU,
  hullEnvelope,
  hullSilhouette,
  mulberry32,
  pointInPolygon,
  polygonArea,
  transformPolygon,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import {
  RANGE_BUCKET_U,
  SIDE_ON,
  barRangeU,
  classHitChance,
  hitChance,
  shotHitChance,
} from '../game/ai/hitChance.js';
import { scatterOffset } from '../game/ai/tacticKit.js';

const reachOf = (id: HullId): number => effectiveStats(hullEnvelope(id)).equipment.mainBattery.rangeU;
const maxReach = Math.max(...SHIP_CLASS_IDS.map(reachOf));
const smallest = [...SHIP_CLASS_IDS].sort(
  (a, b) => Math.abs(polygonArea(hullSilhouette(a))) - Math.abs(polygonArea(hullSilhouette(b))),
)[0];

/** The real samplers, many times: the bot's wobble disc, then one shell's dispersed landing. */
function monteCarlo(cls: HullId, rangeU: number, aspect: number, n: number, seed: number): number {
  const rng = mulberry32(seed);
  const poly = transformPolygon(hullSilhouette(cls), rangeU, 0, aspect); // line of fire along +x
  let hit = 0;
  for (let i = 0; i < n; i += 1) {
    const o = scatterOffset(rangeU, rng, CONFIG.bots.gunAimScatterU);
    const p = dispersedPoint(0, 0, rangeU + o.x, o.y, (rng.next() * 2 ** 32) >>> 0);
    if (pointInPolygon(p, poly)) hit += 1;
  }
  return hit / n;
}

describe('hitChance — one main-battery shell inside the target outline', () => {
  it('is a probability in [0, 1] at every range and aspect; a degenerate input reads 0 (hold), zero range stays finite', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (let r = 0; r <= maxReach; r += maxReach / 16) {
        for (const a of [0, 0.4, SIDE_ON, 2.5, -1]) {
          const c = hitChance(r, hullSilhouette(id), a);
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
      expect(Number.isFinite(hitChance(0, hullSilhouette(id), 0))).toBe(true);
    }
    for (const bad of [Number.NaN, Infinity, -1]) expect(hitChance(bad, hullSilhouette('iowa'), 0)).toBe(0);
    expect(hitChance(1000, hullSilhouette('iowa'), Number.NaN)).toBe(0);
    expect(shotHitChance({ cls: 'iowa', heading: 0 }, 0, Number.NaN)).toBe(0);
  });

  it('never grows with range (every class side-on and end-on, and the blip model, on the memo grid to the longest reach)', () => {
    for (const cls of [...SHIP_CLASS_IDS, null]) {
      for (const aspect of [SIDE_ON, 0]) {
        let prev = Infinity;
        for (let k = 0; k * RANGE_BUCKET_U <= maxReach; k += 1) {
          const c = classHitChance(cls, k * RANGE_BUCKET_U, aspect);
          expect(c, `${cls} aspect ${aspect} bucket ${k}`).toBeLessThanOrEqual(prev);
          prev = c;
        }
      }
    }
  });

  // End-on beats side-on at the ranges a gun duel is fought at; it is NOT a
  // law at every range: the wobble disc is flat-topped and isotropic, so far
  // out (from ~110 hm for the shortest hull, ~160 hm for the longest —
  // measured against the seeded Monte Carlo too) a hull lying ALONG the long
  // dispersion axis loses its ends off the pattern and side-on edges ahead by
  // about one point.
  it('end-on is at least side-on at the same range (every class, 20 to 100 hm)', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (let hm = 20; hm <= 100; hm += 10) {
        const r = hmToU(hm);
        expect(classHitChance(id, r, 0), `${id} at ${hm} hm`).toBeGreaterThanOrEqual(classHitChance(id, r, SIDE_ON));
      }
    }
  });

  it('a larger outline (the same hull grown 1.5x) never scores lower', () => {
    for (const id of SHIP_CLASS_IDS) {
      const big: Vec2[] = hullSilhouette(id).map((p) => ({ x: p.x * 1.5, y: p.y * 1.5 }));
      for (const r of [hmToU(30), hmToU(95), hmToU(200)]) {
        for (const a of [0, 0.7, SIDE_ON]) {
          expect(hitChance(r, big, a)).toBeGreaterThanOrEqual(hitChance(r, hullSilhouette(id), a));
        }
      }
    }
  });

  it('a radar blip (no class, or no heading) is judged as the smallest hull SIDE-ON (R3)', () => {
    for (const r of [hmToU(50), hmToU(140), hmToU(300)]) {
      const model = classHitChance(smallest, r, SIDE_ON);
      expect(shotHitChance({ cls: null, heading: null }, 1.2, r)).toBe(model);
      expect(shotHitChance({ cls: null, heading: 0.3 }, 1.2, r)).toBe(model);
      for (const id of SHIP_CLASS_IDS) expect(shotHitChance({ cls: id, heading: null }, 1.2, r)).toBe(model);
    }
  });

  it('reads the target heading RELATIVE to the line of fire', () => {
    const r = hmToU(95);
    expect(shotHitChance({ cls: 'iowa', heading: 1.0 + SIDE_ON }, 1.0, r)).toBe(classHitChance('iowa', r, SIDE_ON));
    expect(shotHitChance({ cls: 'iowa', heading: 2.0 }, 2.0, r)).toBe(classHitChance('iowa', r, 0));
  });

  it('matches a seeded Monte Carlo of the real samplers (dispersedPoint + scatterOffset) within ±0.03', () => {
    const TOL = 0.03;
    const cases: [HullId, number][] = [
      ['iowa', SIDE_ON],
      ['iowa', 0],
      [smallest, SIDE_ON],
      ['yamato', 0.6],
    ];
    let seed = 11;
    for (const [id, aspect] of cases) {
      for (const hm of [20, 95, 190]) {
        const r = hmToU(hm);
        const mc = monteCarlo(id, r, aspect, 20000, (seed += 1));
        expect(Math.abs(hitChance(r, hullSilhouette(id), aspect) - mc), `${id} ${aspect} ${hm} hm`).toBeLessThanOrEqual(TOL);
      }
    }
  });
});

describe('barRangeU — where the side-on chance crosses the bar', () => {
  it('the chance clears the bar AT the bar range and not one memo bucket beyond it', () => {
    for (const cls of [...SHIP_CLASS_IDS, null]) {
      const reach = cls === null ? maxReach : reachOf(cls);
      const b = barRangeU(cls, reach);
      expect(b).toBeGreaterThan(0);
      expect(b).toBeLessThanOrEqual(reach);
      expect(classHitChance(cls, b, SIDE_ON)).toBeGreaterThanOrEqual(CONFIG.bots.hitBar);
      if (b < reach) expect(classHitChance(cls, b + RANGE_BUCKET_U, SIDE_ON)).toBeLessThan(CONFIG.bots.hitBar);
    }
  });

  it('is the reach itself when the whole reach clears the bar, and 0 (no NaN) when not even point blank does', () => {
    expect(barRangeU('iowa', reachOf('iowa'), 0)).toBe(reachOf('iowa'));
    const short = barRangeU('iowa', reachOf('iowa')) / 2;
    expect(barRangeU('iowa', short)).toBe(short);
    expect(barRangeU('iowa', reachOf('iowa'), 1.01)).toBe(0);
    expect(barRangeU('iowa', Number.NaN)).toBe(0);
    expect(barRangeU('iowa', 0)).toBe(0);
  });
});
