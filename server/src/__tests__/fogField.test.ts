// THE FOG FIELD on the server (Story 9.10; Eric 2026-10-14/15 — "no discs",
// a rolling fractal-noise field, "make it performant"; epic-9 amendments
// 149–150, 163–164, 167–170, 172–173).
//
// Contracts only, on synthetic worlds: the pre-start world has no fog; the
// live coverage controller cuts the field so the realized fogged share of the
// live ring tracks its wandering target and never slews the cut faster than
// `cutRatePerS`; the cut sequence is deterministic per (seed, pseudonymSeed);
// the QUICK-REJECT RASTER is conservative (a seeded sweep across whole
// refresh intervals — a rejected ray never pays real toll); the raster build
// is sliced across ticks inside one refresh and cheap per tick;
// resetForMatchStart restores no fog. No ring size, cut value or coverage
// literal is pinned (epic-9 amendment 8) — every expectation is derived from
// CONFIG.fog, the live ring and the shared field functions.

import { describe, it, expect } from 'vitest';
import { CONFIG, FOG_NO_CUT, fogCutForTarget, fogLattice, fogTollAlong, mulberry32 } from '@salvo/shared';
import { World } from '../game/world.js';

const DT = CONFIG.tick.simDtMs;
const SEED = 4242;
const TICKS_PER_REFRESH = Math.floor(CONFIG.fog.refreshMs / DT);

/** The private fog seams the contracts read (never written here). */
interface FogInternals {
  stepFog(): void;
  fogTarget: number;
  fogRaster: { rows: number } | null;
  fogRasterBack: { rows: number } | null;
  fogRasterRowsBuilt: number;
  fogRasterRowsPerTick: number;
}

const internals = (w: World): FogInternals => w as unknown as FogInternals;

function liveWorld(pseudonymSeed: number, seed = SEED): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed });
  w.startZone(0);
  return w;
}

/**
 * One fog-only tick: advance the clock exactly as World.step's prologue does
 * and run ONLY the `stepFog` row. The controller's contracts do not depend on
 * any other row (it reads the clock, the live ring, the field and its own
 * stream), and running the full step — fleet waves, bots — for ten simulated
 * minutes costs minutes of wall time. One case below runs the REAL World.step
 * to prove the row is wired.
 */
function fogTick(w: World): void {
  w.now += DT;
  internals(w).stepFog();
}

/** Sample points across the arena (a coarse lattice), for "density everywhere" checks. */
function samplePoints(w: World): { x: number; y: number }[] {
  return fogLattice(0, 0, w.map.radius, 12);
}

describe('fog field — the pre-start world has no fog (spec: Pre-start world)', () => {
  it('a world whose zone never starts runs 300 ticks at FOG_NO_CUT: density 0 everywhere, toll 0 on every ray', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 7 });
    const pts = samplePoints(w);
    for (let i = 0; i < 300; i++) {
      w.step();
      expect(w.fogCut).toBe(FOG_NO_CUT);
      expect(w.fogCoverageEstimate).toBe(0);
    }
    for (const p of pts) expect(w.fogDensityAt(p.x, p.y)).toBe(0);
    for (let i = 1; i < pts.length; i++) expect(w.fogTollAlong(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)).toBe(0);
  });
});

describe('fog field — the live coverage controller (spec: the cut + the band)', () => {
  it('the first live refresh snaps the cut to its goal: the realized coverage is within ±1 point of the target', () => {
    const w = liveWorld(11);
    fogTick(w); // the first live tick refreshes immediately (the clock reads 0)
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    const target = internals(w).fogTarget;
    expect(target).toBeGreaterThanOrEqual(CONFIG.fog.coverageMin);
    expect(target).toBeLessThan(CONFIG.fog.coverageMax);
    expect(Math.abs(w.fogCoverageEstimate - target)).toBeLessThanOrEqual(0.01);
    // ...and the estimate is what the shared quantile promises over the same lattice.
    const ring = w.zoneLiveRing;
    const lattice = fogLattice(ring.cx, ring.cy, ring.r, CONFIG.fog.quantileLattice);
    expect(w.fogCut).toBe(fogCutForTarget(w.fogFieldForTest(), w.now, lattice, target));
  });

  it('over ~10 simulated minutes: the cut never moves faster than cutRatePerS between refreshes, and the coverage tracks the target within ±1.5 points whenever the slew was not the limit', () => {
    const w = liveWorld(12);
    const cfg = CONFIG.fog;
    const maxStep = (cfg.cutRatePerS * cfg.refreshMs) / 1000;
    fogTick(w); // the snap
    let prevCut = w.fogCut;
    let prevAt = w.now;
    let refreshes = 0;
    let unclamped = 0;
    let targets = new Set<number>();
    const ticks = (10 * 60 * 1000) / DT;
    for (let i = 0; i < ticks; i++) {
      fogTick(w);
      if (w.fogCut === prevCut) continue;
      // The cut moved: that is a refresh, at most once per refreshMs, by at most the slew.
      const elapsedS = (w.now - prevAt) / 1000;
      expect(w.now - prevAt).toBeGreaterThanOrEqual(cfg.refreshMs);
      expect(Math.abs(w.fogCut - prevCut)).toBeLessThanOrEqual(cfg.cutRatePerS * elapsedS + 1e-12);
      refreshes += 1;
      targets.add(internals(w).fogTarget);
      if (Math.abs(w.fogCut - prevCut) < maxStep - 1e-12) {
        unclamped += 1;
        expect(Math.abs(w.fogCoverageEstimate - internals(w).fogTarget)).toBeLessThanOrEqual(0.015);
      }
      prevCut = w.fogCut;
      prevAt = w.now;
    }
    expect(refreshes).toBeGreaterThan(100); // the field rolls, so the goal moves nearly every second
    expect(unclamped / refreshes).toBeGreaterThan(0.5); // the slew is the exception, not the rule
    expect(targets.size).toBeGreaterThanOrEqual(2); // the target wandered at least once in ten minutes
    for (const t of targets) {
      expect(t).toBeGreaterThanOrEqual(cfg.coverageMin);
      expect(t).toBeLessThan(cfg.coverageMax);
    }
    targets = new Set();
  });

  it('the stepFog row is wired into World.step: a live world is cut on its first step', () => {
    const w = liveWorld(13);
    w.step();
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    expect(w.fogCoverageEstimate).toBeGreaterThan(0);
  });
});

describe('fog field — determinism from the seed and the room-private target stream', () => {
  it('the same (seed, pseudonymSeed) reproduces the cut sequence and the densities; a different pseudonymSeed moves the target, a different seed moves the field', () => {
    const run = (pseudonymSeed: number, seed = SEED): { cuts: number[]; dens: number[] } => {
      const w = liveWorld(pseudonymSeed, seed);
      const cuts: number[] = [];
      for (let i = 0; i < (90 * 1000) / DT; i++) {
        fogTick(w);
        cuts.push(w.fogCut);
      }
      const dens = samplePoints(w).map((p) => w.fogDensityAt(p.x, p.y));
      return { cuts, dens };
    };
    const a = run(99);
    const b = run(99);
    expect(b).toEqual(a);
    expect(a.dens.some((d) => d > 0)).toBe(true); // the field is not empty
    expect(run(100).cuts).not.toEqual(a.cuts);
    expect(run(99, SEED + 1).dens).not.toEqual(a.dens);
    // The seed on the welcome is a pure function of the map seed (public weather).
    const seedOf = (seed: number): number => new World(seed, CONFIG.map.playerCap, CONFIG.zone).fogSeed;
    expect(seedOf(SEED)).toBe(seedOf(SEED));
    expect(seedOf(SEED + 1)).not.toBe(seedOf(SEED));
  });
});

// ---------------------------------------------------------------------------
// THE QUICK-REJECT RASTER IS CONSERVATIVE (the proof the heuristic rests on).
// ---------------------------------------------------------------------------

interface Sweep {
  rays: number;
  rejected: number;
  misses: number;
  worstMiss: number;
}

/** `rays` random rays ≤ 750 u inside the arena per tick, over `ticks` ticks:
 *  the World's toll (raster-gated) against the shared march at the same clock
 *  and cut. A MISS is a ray the raster rejected (toll 0) whose true toll
 *  exceeds 0.5 u. */
function sweep(w: World, seed: number, ticks: number, raysPerTick: number): Sweep {
  const g = mulberry32(seed);
  const field = w.fogFieldForTest();
  const R = w.map.radius * 0.95;
  const out: Sweep = { rays: 0, rejected: 0, misses: 0, worstMiss: 0 };
  for (let t = 0; t < ticks; t++) {
    fogTick(w);
    for (let k = 0; k < raysPerTick; k++) {
      const ax = g.float(-R, R);
      const ay = g.float(-R, R);
      const ang = g.float(0, 2 * Math.PI);
      const len = g.float(1, 750);
      const bx = ax + Math.cos(ang) * len;
      const by = ay + Math.sin(ang) * len;
      const got = w.fogTollAlong(ax, ay, bx, by);
      const truth = fogTollAlong(field, ax, ay, bx, by, w.now, w.fogCut);
      out.rays += 1;
      if (got !== 0) {
        expect(got).toBe(truth); // not rejected: the exact shared march
        continue;
      }
      out.rejected += 1;
      if (truth > 0.5) {
        out.misses += 1;
        out.worstMiss = Math.max(out.worstMiss, truth);
      }
    }
  }
  return out;
}

describe('fog field — the quick-reject raster never rejects a ray that pays (spec: the raster is proved conservative)', () => {
  it('20,000 random rays at ~8 % coverage across ten refresh intervals (the raster stale between them): zero misses, and most rays are rejected', () => {
    const w = liveWorld(21);
    const ring = w.zoneLiveRing;
    const lattice = fogLattice(ring.cx, ring.cy, ring.r, CONFIG.fog.quantileLattice);
    w.setFogCutForTest(fogCutForTarget(w.fogFieldForTest(), w.now, lattice, 0.08));
    expect(Math.abs(w.fogCoverageEstimate - 0.08)).toBeLessThanOrEqual(0.01);
    const s = sweep(w, 0xf09, 10 * TICKS_PER_REFRESH, Math.ceil(20_000 / (10 * TICKS_PER_REFRESH)));
    if (process.env.HC_PERF_LOG) console.log(`fog raster sweep (pinned 8 %): ${JSON.stringify(s)}`);
    expect(s.rays).toBeGreaterThanOrEqual(20_000);
    expect(s.misses).toBe(0);
    expect(s.rejected / s.rays).toBeGreaterThan(0.5);
  });

  it('20,000 random rays on the LIVE controller (the cut slewing, the target wandering): zero misses', () => {
    const w = liveWorld(22);
    for (let i = 0; i <= TICKS_PER_REFRESH; i++) fogTick(w); // the snap + the first raster
    expect(internals(w).fogRaster).not.toBeNull();
    const s = sweep(w, 0xf0a, 10 * TICKS_PER_REFRESH, Math.ceil(20_000 / (10 * TICKS_PER_REFRESH)));
    if (process.env.HC_PERF_LOG) console.log(`fog raster sweep (live): ${JSON.stringify(s)}`);
    expect(s.rays).toBeGreaterThanOrEqual(20_000);
    expect(s.misses).toBe(0);
    expect(s.rejected).toBeGreaterThan(0);
  });

  it('a ray with an endpoint off the raster, or before the first raster exists, is never rejected — it marches', () => {
    const w = liveWorld(23);
    fogTick(w); // the snap: a build is in flight, no front raster yet
    expect(internals(w).fogRaster).toBeNull();
    const field = w.fogFieldForTest();
    const R = w.map.radius;
    expect(w.fogTollAlong(0, 0, 300, 0)).toBe(fogTollAlong(field, 0, 0, 300, 0, w.now, w.fogCut));
    for (let i = 0; i < TICKS_PER_REFRESH; i++) fogTick(w);
    expect(internals(w).fogRaster).not.toBeNull();
    // Off the square (beyond the ring's bounding box): the exact march, not a reject.
    expect(w.fogTollAlong(R + 50, 0, R + 400, 0)).toBe(fogTollAlong(field, R + 50, 0, R + 400, 0, w.now, w.fogCut));
  });
});

describe('fog field — the sliced raster build (spec: Performance)', () => {
  it('a refresh begins a build that completes within one refresh period of ticks, the front raster swapping in whole', () => {
    const w = liveWorld(31);
    fogTick(w); // the snap — the first build starts this tick
    const i = internals(w);
    expect(i.fogRasterBack).not.toBeNull();
    const rows = i.fogRasterBack!.rows;
    expect(i.fogRasterRowsPerTick).toBe(Math.ceil(rows / TICKS_PER_REFRESH));
    expect(i.fogRasterRowsBuilt).toBe(i.fogRasterRowsPerTick);
    let ticksToSwap = 0;
    while (i.fogRaster === null) {
      fogTick(w);
      ticksToSwap += 1;
      expect(ticksToSwap).toBeLessThanOrEqual(TICKS_PER_REFRESH);
    }
    expect(i.fogRaster!.rows).toBe(rows);
    expect(ticksToSwap + 1).toBeLessThanOrEqual(TICKS_PER_REFRESH);
  });

  it('one sliced tick costs under 2 ms and one whole rebuild fits a tick (best-of-5; ~0.5 ms / ~10 ms on a quiet box, printed under HC_PERF_LOG=1)', () => {
    const w = liveWorld(32);
    fogTick(w); // the snap: a build is in flight
    let bestSlice = Infinity;
    let bestWhole = Infinity;
    for (let run = 0; run < 5; run++) {
      // A slice: each tick after the refresh builds exactly one slice (no quantile, no cut).
      expect(internals(w).fogRasterBack).not.toBeNull();
      const t0 = performance.now();
      fogTick(w);
      bestSlice = Math.min(bestSlice, performance.now() - t0);
    }
    const cut = w.fogCut;
    for (let run = 0; run < 5; run++) {
      const t1 = performance.now();
      w.setFogCutForTest(cut); // a whole synchronous rebuild for the live ring
      bestWhole = Math.min(bestWhole, performance.now() - t1);
    }
    if (process.env.HC_PERF_LOG) console.log(`fog raster: slice best-of-5 ${bestSlice.toFixed(3)} ms | whole rebuild best-of-5 ${bestWhole.toFixed(3)} ms (${internals(w).fogRaster!.rows}² cells)`);
    expect(bestSlice).toBeLessThan(2);
    expect(bestWhole).toBeLessThan(CONFIG.tick.simDtMs); // the whole rebuild is a test-seam cost; production slices it
  });
});

describe('fog field — resetForMatchStart and the test seams', () => {
  it('resetForMatchStart restores no fog (the cut, the share, the raster) and the pre-start world stays that way', () => {
    const w = liveWorld(41);
    for (let i = 0; i < 2 * TICKS_PER_REFRESH; i++) fogTick(w);
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    expect(internals(w).fogRaster).not.toBeNull();
    w.resetForMatchStart();
    expect(w.fogCut).toBe(FOG_NO_CUT);
    expect(w.fogCoverageEstimate).toBe(0);
    expect(internals(w).fogRaster).toBeNull();
    expect(w.fogTollAlong(0, 0, 500, 0)).toBe(0);
  });

  it('setFogCutForTest pins the cut through steps (−2 = density 1 everywhere, FOG_NO_CUT = none) and resetForMatchStart lifts the pin', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 1 });
    w.setFogCutForTest(-2);
    for (let i = 0; i < 5; i++) w.step();
    expect(w.fogCut).toBe(-2);
    for (const p of samplePoints(w)) expect(w.fogDensityAt(p.x, p.y)).toBe(1);
    expect(w.fogTollAlong(0, 0, 300, 0)).toBeCloseTo(300 * CONFIG.fog.sightCostPerU, 9);
    expect(w.fogCoverageEstimate).toBe(1);
    w.setFogCutForTest(FOG_NO_CUT);
    expect(w.fogTollAlong(0, 0, 300, 0)).toBe(0);
    w.setFogCutForTest(-2);
    w.resetForMatchStart();
    w.step();
    expect(w.fogCut).toBe(FOG_NO_CUT); // the pin is gone: the pre-start tick cleared it
  });
});
