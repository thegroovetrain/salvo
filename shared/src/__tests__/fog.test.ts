// Story 11.6 RAIN — the storm-eye rain field and its optical depth
// (sim/fog.ts + sim/fogDepth.ts; Eric 2026-11-14 on the rain-sight bench
// page). Contracts of the pure functions only: the ladder radius matches the
// zone's own, determinism and the coin flip, no rain before zone start / past
// the rim, the onset ramp, the clear eye, the coverage profile by ρ (measured
// against the module's own coverage function and CONFIG's dials — relations,
// never bare numbers), continuity across every beat edge / morph reset / the
// collapse, τ's identities (additive, monotone, symmetric — no own bank), the
// reach inverting τ, the hull grid, fail-open on non-finite input, and the
// no-transcendentals source guard.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FOG_SOLID_DENSITY, fogCoverageAt, fogDensityAt, fogDepthAlong, fogDepthReach, fogDepthReachFan, fogRingStepAt,
  fogFrameAt, fogHullGrid, fogSinCos, makeFogField, type FogField, type FogFrame,
} from '../sim/fog.js';
import { fogMaxDepth, fogVisibility } from '../sim/fogDepth.js';
import { CONFIG, mapRadius } from '../constants.js';
import {
  rollZoneRings, zoneClosedAtMs, zoneLadderRadiusAt, zoneRingRadii, zoneStateAt, ZONE_BEATS_PER_GROUP, type ZoneTimeline,
} from '../sim/zone.js';

const SRC = readFileSync(fileURLToPath(new URL('../sim/fog.ts', import.meta.url)), 'utf8');

const CFG = CONFIG.fog;
const ZONE: ZoneTimeline = CONFIG.zone;
const OCEAN_R = mapRadius(CONFIG.map.playerCap);
const RINGS = rollZoneRings(OCEAN_R, ZONE, [101, 202, 303, 404, 505]);
const Z0 = 7000; // ms — the match clock at zone start (arbitrary, non-zero)
const BEAT = ZONE.beatMs;
const GROUP = ZONE_BEATS_PER_GROUP * BEAT;
const CLOSED = zoneClosedAtMs(ZONE);
const T_MAX = fogMaxDepth(CFG);

/** The frame at zone-relative `e` ms on RINGS (the live center from the zone's own derivation). */
function frameAt(field: FogField, e: number, rings = RINGS): FogFrame {
  const cur = zoneStateAt(Z0 + e, Z0, rings, ZONE).current;
  return fogFrameAt(field, Z0 + e, Z0, cur.cx, cur.cy, ZONE);
}

/** Lattice points over the ocean (cell `cellU`). */
function lattice(cellU: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = -OCEAN_R + cellU / 2; y < OCEAN_R; y += cellU) {
    for (let x = -OCEAN_R + cellU / 2; x < OCEAN_R; x += cellU) if (x * x + y * y <= OCEAN_R * OCEAN_R) out.push({ x, y });
  }
  return out;
}

const COARSE = lattice(250);
const FINE = lattice(60);
const field = makeFogField(12345, CFG, OCEAN_R);

describe('zoneLadderRadiusAt (the public R(τ) the spin integrates)', () => {
  it('equals zoneStateAt\'s live radius exactly across the whole timeline, collapse included, and with sudden death off', () => {
    for (const cfg of [ZONE, { ...ZONE, suddenDeath: false }]) {
      const rings = rollZoneRings(OCEAN_R, cfg, [9, 8, 7, 6]);
      const radii = zoneRingRadii(OCEAN_R, cfg);
      const end = zoneClosedAtMs(cfg) + 2 * BEAT;
      const ts = [-1000, 0];
      for (let t = 0; t <= end; t += 997) ts.push(t);
      for (let k = 0; k * BEAT <= end; k++) ts.push(k * BEAT - 1, k * BEAT, k * BEAT + 1);
      for (const t of ts) expect(zoneLadderRadiusAt(t, radii, cfg), `t ${t}`).toBe(zoneStateAt(Z0 + t, Z0, rings, cfg).current.r);
    }
  });
});

describe('makeFogField', () => {
  it('is deterministic per seed: identical layers, table, coin flip and density', () => {
    const a = makeFogField(777, CFG, OCEAN_R);
    const b = makeFogField(777, CFG, OCEAN_R);
    expect(Array.from(a.layerA)).toEqual(Array.from(b.layerA));
    expect(Array.from(a.layerB)).toEqual(Array.from(b.layerB));
    expect(Array.from(a.quant)).toEqual(Array.from(b.quant));
    expect(a.spinSign).toBe(b.spinSign);
    const fa = frameAt(a, 5 * BEAT + 1234);
    const fb = frameAt(b, 5 * BEAT + 1234);
    for (const p of COARSE) expect(fogDensityAt(fa, p.x, p.y)).toBe(fogDensityAt(fb, p.x, p.y));
  });

  it('a different seed is different weather', () => {
    const fa = frameAt(makeFogField(777, CFG, OCEAN_R), 5 * BEAT);
    const fb = frameAt(makeFogField(778, CFG, OCEAN_R), 5 * BEAT);
    expect(COARSE.some((p) => fogDensityAt(fa, p.x, p.y) !== fogDensityAt(fb, p.x, p.y))).toBe(true);
  });

  it('the spin direction is a per-seed coin flip: both faces come up, and flipping it negates every twist', () => {
    const signs = new Set<number>();
    for (let seed = 1; seed <= 64; seed++) signs.add(makeFogField(seed, CFG, OCEAN_R).spinSign);
    expect(signs).toEqual(new Set([1, -1]));
    const flipped: FogField = { ...field, spinSign: field.spinSign === 1 ? -1 : 1 };
    const e = 6 * BEAT + 4321;
    const f = frameAt(field, e);
    const g = frameAt(flipped, e);
    expect(f.twistA.some((v) => v !== 0)).toBe(true);
    for (let k = 0; k < f.twistA.length; k++) {
      expect(g.twistA[k]).toBe(-f.twistA[k]);
      expect(g.twistB[k]).toBe(-f.twistB[k]);
    }
  });
});

describe('fogFrameAt / fogDensityAt — where it rains', () => {
  it('no rain before zone start: a null zoneStartT, or a clock before it, is density 0 everywhere', () => {
    const none = fogFrameAt(field, Z0 + 5 * BEAT, null, 0, 0, ZONE);
    const early = fogFrameAt(field, Z0 - 1, Z0, 0, 0, ZONE);
    expect(none.on).toBe(false);
    expect(early.on).toBe(false);
    for (const p of COARSE) {
      expect(fogDensityAt(none, p.x, p.y)).toBe(0);
      expect(fogDensityAt(early, p.x, p.y)).toBe(0);
    }
  });

  it('density lies in [0, 1], and is 0 beyond the ocean rim even in the outer storm', () => {
    const f = frameAt(field, CLOSED + BEAT); // collapsed: the whole map is storm
    let solid = 0;
    for (const p of FINE) {
      const d = fogDensityAt(f, p.x, p.y);
      expect(d >= 0 && d <= 1).toBe(true);
      if (d >= FOG_SOLID_DENSITY) solid++;
    }
    expect(solid).toBeGreaterThan(0);
    for (let k = 0; k < 64; k++) {
      const a = (k * 2 * Math.PI) / 64;
      expect(fogDensityAt(f, Math.cos(a) * OCEAN_R * 1.001, Math.sin(a) * OCEAN_R * 1.001)).toBe(0);
    }
    const dry = makeFogField(12345, CFG, 0);
    expect(frameAt(dry, CLOSED + BEAT).on).toBe(false);
  });

  it('rolls in over onsetMs: density is the unramped density × (t − zoneStartT) / onsetMs', () => {
    const unramped = makeFogField(12345, { ...CFG, onsetMs: 0 }, OCEAN_R);
    for (const frac of [0.25, 0.5, 0.9]) {
      const e = CFG.onsetMs * frac;
      const f = frameAt(field, e);
      const g = frameAt(unramped, e);
      for (const p of COARSE) expect(Math.abs(fogDensityAt(f, p.x, p.y) - fogDensityAt(g, p.x, p.y) * frac)).toBeLessThan(1e-12);
    }
  });

  it('THE EYE IS CLEAR: density is 0 wherever ρ = distance / live R is inside the LIVE eye fraction (the ring\'s eyeRadiusFracByRing step)', () => {
    for (const e of [CFG.onsetMs + 1, GROUP + BEAT / 2, 2 * GROUP + 3.5 * BEAT, 3 * GROUP + BEAT]) {
      const f = frameAt(field, e);
      const eye = fogRingStepAt(CFG.eyeRadiusFracByRing, e, ZONE);
      expect(f.eyeFrac).toBe(eye);
      let inEye = 0;
      for (const p of FINE) {
        if (Math.sqrt((p.x - f.cx) ** 2 + (p.y - f.cy) ** 2) / f.R >= eye) continue;
        inEye++;
        expect(fogDensityAt(f, p.x, p.y)).toBe(0);
      }
      expect(inEye).toBeGreaterThan(0);
    }
  });
});

/** Solid share and the module's expected coverage, per ρ bin, pooled over seeds. */
function profile(e: number, bins: readonly [number, number][], seeds: readonly number[]): { got: number; want: number; n: number }[] {
  const acc = bins.map(() => ({ solid: 0, want: 0, n: 0 }));
  for (const seed of seeds) {
    const f = frameAt(makeFogField(seed, CFG, OCEAN_R), e);
    for (const p of FINE) {
      const rho = f.R > 0 ? Math.sqrt((p.x - f.cx) ** 2 + (p.y - f.cy) ** 2) / f.R : Infinity; // R 0 = collapsed: everywhere is outside
      const b = bins.findIndex(([lo, hi]) => rho >= lo && (rho < hi || hi === Infinity));
      if (b < 0) continue;
      acc[b].n++;
      acc[b].want += fogCoverageAt(CFG, f.eyeFrac, f.edgeCov, rho);
      if (fogDensityAt(f, p.x, p.y) >= FOG_SOLID_DENSITY) acc[b].solid++;
    }
  }
  return acc.map((a) => ({ got: a.solid / a.n, want: a.want / a.n, n: a.n }));
}

describe('the coverage profile by ρ (solid share = density ≥ ½)', () => {
  const SEEDS = [1, 2, 3, 4];

  it('rises from the eye to the ring edge, each band near the module\'s coverage there (ring 0 held)', () => {
    const eye = fogRingStepAt(CFG.eyeRadiusFracByRing, BEAT + BEAT / 2, ZONE);
    const w = (1 - eye) / 4;
    const bins: [number, number][] = [0, 1, 2, 3].map((i) => [eye + i * w, eye + (i + 1) * w]);
    const prof = profile(BEAT + BEAT / 2, bins, SEEDS);
    for (let i = 0; i < prof.length; i++) {
      expect(prof[i].n).toBeGreaterThan(100);
      expect(Math.abs(prof[i].got - prof[i].want), `bin ${i}`).toBeLessThan(0.1);
      if (i > 0) expect(prof[i].got).toBeGreaterThan(prof[i - 1].got);
    }
  });

  it('out in the storm (ρ past the soft edge) the share matches outsideCoverage', () => {
    const [out] = profile(3 * GROUP + BEAT / 2, [[1 + CFG.edgeSoftFrac, Infinity]], SEEDS);
    expect(out.n).toBeGreaterThan(1000);
    expect(Math.abs(out.got - CFG.outsideCoverage)).toBeLessThan(0.08);
  });

  it('once collapsed (R = 0) the whole ocean is at outsideCoverage and stays finite', () => {
    const f = frameAt(field, CLOSED + 1000);
    expect(f.R).toBe(0);
    const [all] = profile(CLOSED + 1000, [[0, Infinity]], SEEDS);
    expect(Math.abs(all.got - CFG.outsideCoverage)).toBeLessThan(0.08);
  });

  it('a per-ring dial (edge coverage, eye radius) reads each group\'s entry while held, blends through the closing beat by its progress, and holds the last entry through the collapse and after', () => {
    for (const tab of [CFG.edgeCoverageByRing, CFG.eyeRadiusFracByRing]) {
      const top = tab.length - 1;
      for (let g = 0; g < 4; g++) {
        const a = tab[Math.min(g, top)];
        const b = tab[Math.min(g + 1, top)];
        expect(fogRingStepAt(tab, g * GROUP + BEAT / 2, ZONE)).toBe(a);
        for (const f of [0.25, 0.5, 0.75]) {
          expect(Math.abs(fogRingStepAt(tab, g * GROUP + (3 + f) * BEAT, ZONE) - (a + (b - a) * f))).toBeLessThan(1e-12);
        }
      }
      expect(fogRingStepAt(tab, CLOSED, ZONE)).toBe(tab[top]);
      expect(fogRingStepAt(tab, CLOSED + 10 * BEAT, ZONE)).toBe(tab[top]);
    }
  });

  it('a per-ring table LONGER than the zone has groups never blends toward an entry no group reaches: the last group\'s closing beat holds its own entry right up to the closed value (no ramp, no snap)', () => {
    const groups = Math.round(CLOSED / GROUP);
    const tab = Array.from({ length: groups + 3 }, (_, i) => (i + 1) / (groups + 4)); // strictly rising, three entries past the last group
    const lastGroup = tab[groups - 1];
    expect(fogRingStepAt(tab, CLOSED, ZONE)).toBe(lastGroup); // the closed value is the last GROUP's entry
    for (const f of [0, 0.25, 0.5, 0.75, 0.999]) {
      expect(fogRingStepAt(tab, (groups - 1) * GROUP + (3 + f) * BEAT, ZONE), `closing beat progress ${f}`).toBe(lastGroup);
    }
    // ...while an earlier group's closing beat still blends toward the next group's entry.
    if (groups >= 2) {
      expect(fogRingStepAt(tab, (groups - 2) * GROUP + 3.5 * BEAT, ZONE)).toBeCloseTo((tab[groups - 2] + tab[groups - 1]) / 2, 12);
    }
  });

  it('THE TWIST INTEGRAL ALWAYS RETURNS: a beat that cannot advance a huge clock, and a morph window thousands of beats long, both build a finite frame', () => {
    const finite = (f: { on: boolean; twistA: Float64Array; twistB: Float64Array }): boolean =>
      f.on && f.twistA.every((v) => Number.isFinite(v)) && f.twistB.every((v) => Number.isFinite(v));
    // (1) A non-integer beat under a clock so large that the next beat
    // boundary rounds back onto the clock itself: (floor(a / beat) + 1) × beat <= a.
    const tiny: ZoneTimeline = { ...ZONE, beatMs: 0.1 };
    const huge = 1e17 + 70000;
    const stuck = Math.floor(huge / CFG.morphMs) * CFG.morphMs; // where layer B's integral starts
    expect((Math.floor(stuck / tiny.beatMs) + 1) * tiny.beatMs).toBeLessThanOrEqual(stuck); // premise: that boundary does not advance
    expect(finite(fogFrameAt(field, huge, 0, 0, 0, tiny))).toBe(true);
    // (2) A morph window of a billion one-millisecond beats (a tuning arm or a
    // dev zone override can set either dial): bounded work, not a billion segments.
    const longMorph = makeFogField(12345, { ...CFG, morphMs: 1e9 }, OCEAN_R);
    const fast: ZoneTimeline = { ...ZONE, beatMs: 1 };
    const f = fogFrameAt(longMorph, 0.9e9, 0, 0, 0, fast);
    expect(finite(f)).toBe(true);
    expect(Number.isFinite(fogDensityAt(f, OCEAN_R * 0.3, OCEAN_R * 0.2))).toBe(true);
  });
});

describe('continuity — no density pop', () => {
  it('max |Δdensity| over 10 ms is tiny at every beat edge, morph reset, zone start and the collapse (the stepped eye and edge dials included)', () => {
    const P = CFG.morphMs;
    const instants = [0, CLOSED];
    for (let k = 1; k * BEAT <= CLOSED; k++) instants.push(k * BEAT);
    for (let k = 1; (k * P) / 2 <= CLOSED + P; k++) instants.push((k * P) / 2);
    let worst = 0;
    let seenSolid = false;
    for (const t of instants) {
      const a = frameAt(field, t - 5);
      const b = frameAt(field, t + 5);
      if (a.on && b.on) { // zone start: the frame before it is the no-rain frame (the onset ramp carries continuity there)
        expect(Math.abs(a.eyeFrac - b.eyeFrac)).toBeLessThan(1e-3);
        expect(Math.abs(a.edgeCov - b.edgeCov)).toBeLessThan(1e-3);
      }
      for (const p of COARSE) {
        const da = fogDensityAt(a, p.x, p.y);
        const db = fogDensityAt(b, p.x, p.y);
        if (db >= FOG_SOLID_DENSITY) seenSolid = true;
        worst = Math.max(worst, Math.abs(da - db));
      }
    }
    expect(seenSolid).toBe(true);
    expect(worst).toBeLessThan(0.02);
  });
});

/** A rainy frame (late in the match) and a point standing in solid rain on it. */
const RAINY = frameAt(field, 3 * GROUP + BEAT / 2);
const IN_RAIN = FINE.find((p) => fogDensityAt(RAINY, p.x, p.y) >= 0.9) as { x: number; y: number };

describe('fogDepthAlong — optical depth', () => {
  const step = CFG.marchStepU;

  it('is 0 with no rain, for a zero-length ray, and inside the clear eye', () => {
    const none = fogFrameAt(field, Z0, null, 0, 0, ZONE);
    expect(fogDepthAlong(none, -2000, 0, 2000, 0)).toBe(0);
    expect(fogDepthAlong(RAINY, IN_RAIN.x, IN_RAIN.y, IN_RAIN.x, IN_RAIN.y)).toBe(0);
    const f = frameAt(field, BEAT);
    const r = f.eyeFrac * f.R * 0.9;
    expect(fogDepthAlong(f, f.cx - r, f.cy, f.cx + r, f.cy)).toBe(0);
  });

  it('NO OWN BANK: an observer standing in solid rain pays for it, and the ray costs the same both ways', () => {
    const bx = IN_RAIN.x + 40 * step;
    const there = fogDepthAlong(RAINY, IN_RAIN.x, IN_RAIN.y, bx, IN_RAIN.y);
    const back = fogDepthAlong(RAINY, bx, IN_RAIN.y, IN_RAIN.x, IN_RAIN.y);
    expect(there).toBeGreaterThan(0);
    expect(fogDepthAlong(RAINY, IN_RAIN.x, IN_RAIN.y, IN_RAIN.x + step, IN_RAIN.y)).toBeGreaterThan(0.9 * step * 0.5);
    expect(Math.abs(there - back)).toBeLessThan(1e-9 * (1 + there));
  });

  it('is symmetric A ↔ B on whole-step rays across the field', () => {
    for (let i = 0; i < 40; i++) {
      const ax = ((i * 739) % 6000) - 3000;
      const ay = ((i * 421) % 6000) - 3000;
      const n = 20 + ((i * 7) % 60);
      const ang = i * 0.37;
      const bx = ax + Math.cos(ang) * n * step;
      const by = ay + Math.sin(ang) * n * step;
      const there = fogDepthAlong(RAINY, ax, ay, bx, by);
      expect(Math.abs(there - fogDepthAlong(RAINY, bx, by, ax, ay))).toBeLessThan(1e-6 * (1 + there));
    }
  });

  it('is additive over a split at a whole step, and monotone non-decreasing in length', () => {
    const ax = IN_RAIN.x - 300;
    const ay = IN_RAIN.y - 200;
    const ux = 0.6;
    const uy = 0.8;
    for (const k of [7, 30, 55]) {
      const bx = ax + ux * k * step;
      const by = ay + uy * k * step;
      const cx = ax + ux * 90 * step;
      const cy = ay + uy * 90 * step;
      const whole = fogDepthAlong(RAINY, ax, ay, cx, cy);
      expect(Math.abs(whole - (fogDepthAlong(RAINY, ax, ay, bx, by) + fogDepthAlong(RAINY, bx, by, cx, cy)))).toBeLessThan(1e-6 * (1 + whole));
    }
    let prev = 0;
    for (let d = 1; d < 1500; d += 3.7) {
      const t = fogDepthAlong(RAINY, ax, ay, ax + ux * d, ay + uy * d);
      expect(t).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = t;
    }
    expect(prev).toBeGreaterThan(0);
  });

  it('a non-finite input fails open to 0, and the result is always finite and non-negative', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(fogDepthAlong(RAINY, bad, 0, 100, 0)).toBe(0);
      expect(fogDepthAlong(RAINY, 0, 0, 100, bad)).toBe(0);
    }
    for (const p of COARSE) {
      const t = fogDepthAlong(RAINY, 0, 0, p.x, p.y);
      expect(Number.isFinite(t) && t >= 0).toBe(true);
    }
  });
});

describe('fogDepthReach / fogDepthReachFan — the eye\'s reach per bearing', () => {
  const RANGE = 3000;
  const SC = { s: 0, c: 0 };

  it('inverts fogDepthAlong: a shortened reach is where τ hits fogMaxDepth; a full reach never exceeds it', () => {
    let shortened = 0;
    for (const o of [IN_RAIN, { x: 0, y: 0 }, { x: -2500, y: 1800 }, { x: RAINY.cx, y: RAINY.cy }]) {
      for (let k = 0; k < 24; k++) {
        const ang = (k * 2 * Math.PI) / 24 + 0.01;
        fogSinCos(ang, SC);
        const reach = fogDepthReach(RAINY, o.x, o.y, ang, RANGE, T_MAX);
        expect(reach).toBeLessThanOrEqual(RANGE);
        const tau = fogDepthAlong(RAINY, o.x, o.y, o.x + SC.c * reach, o.y + SC.s * reach);
        if (reach < RANGE) {
          shortened++;
          expect(Math.abs(tau - T_MAX)).toBeLessThan(1e-6 * T_MAX);
        } else {
          expect(tau).toBeLessThanOrEqual(T_MAX + 1e-9);
        }
      }
    }
    expect(shortened).toBeGreaterThan(0);
  });

  it('is monotone non-decreasing in range and never exceeds it', () => {
    for (let k = 0; k < 12; k++) {
      let prev = 0;
      for (let r = 5; r < 2500; r += 17.3) {
        const reach = fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, k * 0.52, r, T_MAX);
        expect(reach).toBeLessThanOrEqual(r);
        expect(reach).toBeGreaterThanOrEqual(prev);
        prev = reach;
      }
    }
  });

  it('fails open: no rain, a NaN depth or a non-finite pose reach the full range; range ≤ 0 reaches 0; a non-finite range returns itself', () => {
    const none = fogFrameAt(field, Z0, null, 0, 0, ZONE);
    expect(fogDepthReach(none, IN_RAIN.x, IN_RAIN.y, 0, RANGE, T_MAX)).toBe(RANGE);
    expect(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, 0, RANGE, NaN)).toBe(RANGE);
    expect(fogDepthReach(RAINY, NaN, IN_RAIN.y, 0, RANGE, T_MAX)).toBe(RANGE);
    expect(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, NaN, RANGE, T_MAX)).toBe(RANGE);
    expect(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, 0, 0, T_MAX)).toBe(0);
    expect(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, 0, -5, T_MAX)).toBe(0);
    expect(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, 0, Infinity, T_MAX)).toBe(Infinity);
  });

  it('the fan fills every slot of `out` at k × 2π / length and returns the same array', () => {
    const out = new Float32Array(36);
    expect(fogDepthReachFan(RAINY, IN_RAIN.x, IN_RAIN.y, RANGE, T_MAX, out)).toBe(out);
    for (let k = 0; k < out.length; k++) {
      expect(out[k]).toBe(Math.fround(fogDepthReach(RAINY, IN_RAIN.x, IN_RAIN.y, (k * 2 * Math.PI) / out.length, RANGE, T_MAX)));
    }
  });
});

describe('fogMaxDepth / fogVisibility (sim/fogDepth.ts)', () => {
  it('visibility at the max depth is the cutoff; clear water is 1; deeper is dimmer', () => {
    expect(Math.abs(fogVisibility(T_MAX, CFG) - CFG.sightCutoffV)).toBeLessThan(1e-12);
    expect(fogVisibility(0, CFG)).toBe(1);
    expect(fogVisibility(NaN, CFG)).toBe(1);
    expect(fogVisibility(T_MAX * 2, CFG)).toBeLessThan(CFG.sightCutoffV);
  });

  it('degenerate dials fail open', () => {
    expect(fogMaxDepth({ extinctionPerU: 0, sightCutoffV: 0.05 })).toBe(Infinity);
    expect(fogMaxDepth({ extinctionPerU: NaN, sightCutoffV: 0.05 })).toBe(Infinity);
    expect(fogMaxDepth({ extinctionPerU: 0.01, sightCutoffV: 0 })).toBe(Infinity);
    expect(fogMaxDepth({ extinctionPerU: 0.01, sightCutoffV: 1 })).toBe(0);
  });
});

describe('fogHullGrid', () => {
  it('lays cols × rows cell centers over the hull rectangle, bow along the heading, centered on the hull', () => {
    const cols = CFG.hullGridCols;
    const rows = CFG.hullGridRows;
    const L = 180;
    const B = 24;
    for (const h of [0, 0.7, Math.PI / 2, 2.5, -2]) {
      const out = new Float64Array(2 * cols * rows);
      expect(fogHullGrid(100, -50, h, L, B, cols, rows, out)).toBe(cols * rows);
      const fx = Math.cos(h);
      const fy = Math.sin(h);
      let mx = 0;
      let my = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = 2 * (r * cols + c);
          const dx = out[i] - 100;
          const dy = out[i + 1] + 50;
          mx += dx;
          my += dy;
          const along = dx * fx + dy * fy;
          const across = -dx * fy + dy * fx;
          expect(Math.abs(along)).toBeLessThan(L / 2);
          expect(Math.abs(across)).toBeLessThan(B / 2);
          if (c > 0) expect(along - ((out[i - 2] - 100) * fx + (out[i - 1] + 50) * fy)).toBeCloseTo(L / cols, 4); // stern → bow (fogSinCos is good to 1e-6)
          if (r > 0) {
            const j = i - 2 * cols;
            expect(across - (-(out[j] - 100) * fy + (out[j + 1] + 50) * fx)).toBeCloseTo(B / rows, 4);
          }
        }
      }
      expect(Math.abs(mx / (cols * rows))).toBeLessThan(1e-6);
      expect(Math.abs(my / (cols * rows))).toBeLessThan(1e-6);
    }
  });

  it('a non-positive count writes nothing', () => {
    expect(fogHullGrid(0, 0, 0, 10, 5, 0, 2, [])).toBe(0);
  });
});

describe('non-finite input fails open', () => {
  it('a NaN clock, start or eye center is a no-rain frame; a NaN point reads 0', () => {
    expect(fogFrameAt(field, NaN, Z0, 0, 0, ZONE).on).toBe(false);
    expect(fogFrameAt(field, Z0 + BEAT, NaN, 0, 0, ZONE).on).toBe(false);
    expect(fogFrameAt(field, Z0 + BEAT, Z0, NaN, 0, ZONE).on).toBe(false);
    expect(fogDensityAt(RAINY, NaN, 0)).toBe(0);
    expect(fogDensityAt(RAINY, 0, Infinity)).toBe(0);
  });
});

// NOTE: this guard is duplicated from noise.test.ts rather than shared,
// because importing one vitest file from another re-registers its suites.
const FORBIDDEN_MATH = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'pow', 'exp', 'expm1', 'log', 'log2', 'log10', 'log1p',
  'hypot', 'cbrt', 'random',
];

describe('sim/fog.ts source guard', () => {
  it('uses no transcendental, no unseeded randomness and no clock — and reaches the transcendental sight math only through sim/fogDepth.ts', () => {
    for (const fn of FORBIDDEN_MATH) {
      expect(new RegExp(`Math\\.${fn}\\s*\\(`).test(SRC), `Math.${fn}( is forbidden`).toBe(false);
    }
    expect(/Date\.now\s*\(/.test(SRC), 'Date.now( is forbidden').toBe(false);
    expect(/\bnew Date\b/.test(SRC), 'new Date is forbidden').toBe(false);
    expect(/performance\.now\s*\(/.test(SRC), 'performance.now( is forbidden').toBe(false);
    expect(/\bMath\.PI\b/.test(SRC), 'Math.PI is forbidden').toBe(false);
    expect(/\*\*/.test(SRC.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'the ** operator is forbidden').toBe(false);
    expect(/from '\.\/fogDepth\.js'/.test(SRC), 'fog.ts must not import fogDepth.ts').toBe(false);
  });

  it('fogSinCos matches Math.sin / Math.cos within 1e-6 across the folds and at match-scale angles', () => {
    const out = { s: 0, c: 0 };
    for (let i = 0; i < 2000; i++) {
      const a = (i - 1000) * 0.0123457;
      fogSinCos(a, out);
      expect(Math.abs(out.s - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(out.c - Math.cos(a))).toBeLessThan(1e-6);
    }
    for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI, 1e4 + 0.1, -1e4 - 0.1]) {
      fogSinCos(a, out);
      expect(Math.abs(out.s - Math.sin(a))).toBeLessThan(1e-6);
      expect(Math.abs(out.c - Math.cos(a))).toBeLessThan(1e-6);
    }
  });
});
