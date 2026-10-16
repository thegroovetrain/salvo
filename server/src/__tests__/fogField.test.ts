// THE FOG FIELD on the server (Story 9.10; Eric 2026-10-14/15 — "no discs",
// a rolling fractal-noise field, "make it performant", "roll in over ~1 min"
// (≈ 15 s since amendment 177, 2026-10-16 "faster"), "hold the last cut";
// epic-9 amendments 149–150, 163–164, 167–170, 172–173, 177–178).
//
// Contracts only, on synthetic worlds: the pre-start world has no fog; the
// live coverage controller ROLLS the fog in from the lattice maximum (density
// 0 everywhere on the first refresh, the cut slewing down at `cutRatePerS`),
// then tracks its wandering target and never slews faster than the rate; a
// goal of "no fog" snaps; a collapsed ring HOLDS the cut; the cut sequence is
// deterministic per (seed, pseudonymSeed); the server toll is an EXACT cell
// walk over the memoized density lattice that agrees with the shared midpoint
// march (the reference) to one cell's quantization per end and is
// deterministic (a repeated ray touches no new cell); rays are clipped to the
// lattice; resetForMatchStart restores no fog. No ring size, cut value or
// coverage literal is pinned (epic-9 amendment 8) — every expectation is
// derived from CONFIG.fog, the live ring and the shared field functions.

import { describe, it, expect } from 'vitest';
import { CONFIG, FOG_NO_CUT, FOG_SOLID_DENSITY, fogCutForTarget, fogDensityAt, fogLattice, fogTollAlong, mulberry32, type ZoneRing } from '@salvo/shared';
import { World } from '../game/world.js';

const DT = CONFIG.tick.simDtMs;
const SEED = 4242;
const TICKS_PER_REFRESH = Math.floor(CONFIG.fog.refreshMs / DT);

/** The private fog seams the contracts read (never written here). */
interface FogInternals {
  stepFog(): void;
  fogTarget: number;
  fogEpoch: number;
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

/** Run fog ticks until the cut moves (one refresh), returning the ticks spent. */
function untilRefresh(w: World): number {
  const before = w.fogCut;
  for (let i = 1; i <= TICKS_PER_REFRESH + 1; i++) {
    fogTick(w);
    if (w.fogCut !== before) return i;
  }
  return -1;
}

/** Sample points across the arena (a coarse lattice), for "density everywhere" checks. */
function samplePoints(w: World): { x: number; y: number }[] {
  return fogLattice(0, 0, w.map.radius, 12);
}

/** The controller's own lattice for `ring` (the radius floor of the final close applied; kept to the ocean, amendment 179). */
function controllerLattice(w: World, ring: ZoneRing = w.zoneLiveRing): { x: number; y: number }[] {
  const R2 = w.map.radius * w.map.radius;
  return fogLattice(ring.cx, ring.cy, Math.max(ring.r, CONFIG.fog.wavelengthU), CONFIG.fog.quantileLattice).filter((p) => p.x * p.x + p.y * p.y <= R2);
}

/** Run `fn` with the coverage band pinned to [lo, hi) (restored after). */
function withBand<T>(lo: number, hi: number, fn: () => T): T {
  const cfg = CONFIG.fog as { coverageMin: number; coverageMax: number };
  const saved = { lo: cfg.coverageMin, hi: cfg.coverageMax };
  cfg.coverageMin = lo;
  cfg.coverageMax = hi;
  try {
    return fn();
  } finally {
    cfg.coverageMin = saved.lo;
    cfg.coverageMax = saved.hi;
  }
}

describe('fog field — the pre-start world has no fog (spec: Pre-start world)', () => {
  it('a world whose zone never starts runs 300 ticks at FOG_NO_CUT: density 0 everywhere, toll 0 on every ray, no memo cell evaluated', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 7 });
    const pts = samplePoints(w);
    for (let i = 0; i < 300; i++) {
      w.step();
      expect(w.fogCut).toBe(FOG_NO_CUT);
      expect(w.fogCoverageEstimate).toBe(0);
    }
    for (const p of pts) expect(w.fogDensityAt(p.x, p.y)).toBe(0);
    for (let i = 1; i < pts.length; i++) expect(w.fogTollAlong(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y)).toBe(0);
    expect(w.fogCellEvals).toBe(0);
  });
});

describe('fog field — the live coverage controller (Eric 2026-10-15: roll in over ~1 min, hold the last cut)', () => {
  it('THE ONSET: the first live refresh cuts at the lattice maximum (density 0 at every lattice point), then the cut strictly DECREASES at most cutRatePerS per refresh until it reaches the goal', () => {
    const w = liveWorld(11);
    const cfg = CONFIG.fog;
    fogTick(w); // the first live tick refreshes immediately (the clock reads 0)
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    const field = w.fogFieldForTest();
    for (const p of controllerLattice(w)) expect(fogDensityAt(field, p.x, p.y, w.fogEpochT, w.fogCut)).toBe(0);
    expect(w.fogCoverageEstimate).toBe(0);
    const target = internals(w).fogTarget;
    expect(target).toBeGreaterThanOrEqual(cfg.coverageMin);
    expect(target).toBeLessThan(cfg.coverageMax);
    // The roll-in: every refresh steps DOWN by exactly the slew until the goal is reached.
    const maxStep = (cfg.cutRatePerS * cfg.refreshMs) / 1000;
    let prev = w.fogCut;
    let reached = false;
    for (let refresh = 0; refresh < 120 && !reached; refresh++) {
      expect(untilRefresh(w)).toBe(TICKS_PER_REFRESH);
      expect(w.fogCut).toBeLessThan(prev);
      expect(prev - w.fogCut).toBeLessThanOrEqual(maxStep + 1e-12);
      const goal = fogCutForTarget(field, w.fogEpochT, controllerLattice(w), internals(w).fogTarget);
      if (w.fogCut === goal) reached = true;
      prev = w.fogCut;
    }
    expect(reached).toBe(true);
    expect(Math.abs(w.fogCoverageEstimate - internals(w).fogTarget)).toBeLessThanOrEqual(0.01);
    // ≈ 15 s from a max near 1.0 to a 20–25 % solid cut at 0.04/s (was ~35 s to a 5 % cut at 0.02/s) — well inside two minutes.
    expect(w.now).toBeLessThan(2 * 60 * 1000);
  });

  it('over ~10 simulated minutes: the cut never moves faster than cutRatePerS between refreshes, and the coverage tracks the target within ±1.5 points whenever the slew was not the limit', () => {
    const w = liveWorld(12);
    const cfg = CONFIG.fog;
    const maxStep = (cfg.cutRatePerS * cfg.refreshMs) / 1000;
    fogTick(w); // the onset
    let prevCut = w.fogCut;
    let prevAt = w.now;
    let refreshes = 0;
    let unclamped = 0;
    const targets = new Set<number>();
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
  });

  it('FOG OFF SNAPS: a target of 0 (the band pinned to [0, 0]) puts the cut at FOG_NO_CUT on the next refresh — never a crawl toward 9', () => {
    withBand(0, 0, () => {
      const w = liveWorld(14);
      fogTick(w);
      expect(internals(w).fogTarget).toBe(0);
      expect(w.fogCut).toBe(FOG_NO_CUT);
      expect(w.fogCoverageEstimate).toBe(0);
    });
    // ...and from LIVE fog too: pin a cut, lift the pin by hand, drive the band to 0 → one refresh clears.
    const w = liveWorld(15);
    for (let i = 0; i < 3 * TICKS_PER_REFRESH; i++) fogTick(w);
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    withBand(0, 0, () => {
      (w as unknown as { fogNextTargetAt: number }).fogNextTargetAt = 0; // redraw the target on the next refresh
      untilRefresh(w);
      expect(w.fogCut).toBe(FOG_NO_CUT);
    });
  });

  it('THE FINAL CLOSE HOLDS THE CUT: with the live ring collapsed to r 0 the cut keeps its last value across refreshes while the epoch still advances', () => {
    const w = liveWorld(16);
    for (let i = 0; i < 5 * TICKS_PER_REFRESH; i++) fogTick(w);
    const held = w.fogCut;
    expect(held).toBeLessThan(FOG_NO_CUT);
    Object.defineProperty(w, 'zoneLiveRing', { get: () => ({ cx: 0, cy: 0, r: 0 }), configurable: true });
    const epoch0 = internals(w).fogEpoch;
    for (let i = 0; i < 5 * TICKS_PER_REFRESH; i++) {
      fogTick(w);
      expect(w.fogCut).toBe(held);
    }
    expect(internals(w).fogEpoch).toBeGreaterThan(epoch0); // the field keeps rolling under the held cut
    // Just under half a bank's size holds too; at half a bank the controller runs on the floored lattice.
    Object.defineProperty(w, 'zoneLiveRing', { get: () => ({ cx: 0, cy: 0, r: CONFIG.fog.wavelengthU / 2 - 1 }), configurable: true });
    untilRefresh(w);
    expect(w.fogCut).toBe(held);
  });

  it('A SMALL RING AT THE RIM (amendment 179, the cycle-194 gate): with the live ring one bank wide and centered 300 u inside the ocean\'s edge, the lattice overhangs the rim — the controller keeps only ocean points, so the realized solid share still tracks the target', () => {
    const w = liveWorld(16);
    const R = w.map.radius;
    const ring = { cx: R - 300, cy: 0, r: CONFIG.fog.wavelengthU };
    Object.defineProperty(w, 'zoneLiveRing', { get: () => ring, configurable: true });
    withBand(0.22, 0.22, () => {
      for (let i = 0; i < 90 * TICKS_PER_REFRESH; i++) fogTick(w); // 45 s: past the onset slew (≈ 0.04/s over a ≈ 1.2 range)
    });
    // every controller point is on the ocean...
    for (const p of controllerLattice(w, ring)) expect(p.x * p.x + p.y * p.y).toBeLessThanOrEqual(R * R);
    // ...a good share of the unfiltered disc is NOT (the case is not vacuous)...
    const whole = fogLattice(ring.cx, ring.cy, ring.r, CONFIG.fog.quantileLattice);
    expect(controllerLattice(w, ring).length).toBeLessThan(whole.length * 0.9);
    // ...and the measured solid share is the target (it under-read by the overhang's share before the filter)
    expect(Math.abs(w.fogCoverageEstimate - 0.22)).toBeLessThanOrEqual(0.015);
  });

  it('the stepFog row is wired into World.step: a live world is cut on its first step', () => {
    const w = liveWorld(13);
    w.step();
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
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
// THE MEMOIZED CELL WALK IS THE TOLL (the review gate's exact design).
// ---------------------------------------------------------------------------

/** A pinned world at ~`share` coverage over the arena lattice. */
function pinnedWorld(pseudonymSeed: number, share: number): World {
  const w = liveWorld(pseudonymSeed);
  w.setFogCutForTest(fogCutForTarget(w.fogFieldForTest(), w.now, controllerLattice(w), share));
  return w;
}

/**
 * The own-bank rule's FRAGILE rays (amendment 179). The walk (cell centres,
 * up to 7 u off the ray) and the march (on-ray midpoints every 10 u) decide
 * where the observer's free run ENDS from different samples, and a run that
 * ends in a different place moves a whole bank's worth of toll — so where
 * the ½ contour comes within a cell of the ray anywhere along the run, or a
 * dip below ½ is thin enough for one sampling to miss, the two legitimately
 * disagree by more than a cell. Classified by a 1 u oracle with a CROSS
 * SECTION at every sample (the ray point and every 2 u out to ±8 u
 * perpendicular — a cell centre's reach): a sample is SOLID (all nine ≥ ½),
 * CLEAR (all < ½) or MIXED. Sampling, not a proof: the pinned seed is a regression, and the
 * walk-vs-march agreement it asserts is what the own-bank rule promises. A run is robust when, from the observer on, it is solid, then
 * mixed for at most one cell (the ordinary crossing of a steep edge), then
 * clear for at least five cells (both samplings have surely ended it) or to
 * the end; anything else — a graze, a shallow crossing, a thin dip, an
 * observer standing on the ½ line itself (whose own cell is free but whose
 * SECOND cell may begin a few units in) — is fragile. Rays whose observer
 * stands in clear water have no run and are never fragile.
 */
function fragileRun(w: World, ax: number, ay: number, bx: number, by: number): boolean {
  const field = w.fogFieldForTest();
  if (fogDensityAt(field, ax, ay, w.fogEpochT, w.fogCut) < FOG_SOLID_DENSITY) return false;
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.ceil(len);
  const step = len / n;
  const cell = CONFIG.fog.marchStepU;
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const kind = (i: number): 'solid' | 'clear' | 'mixed' => {
    const t = (i + 0.5) / n;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of [-8, -6, -4, -2, 0, 2, 4, 6, 8]) {
      const d = fogDensityAt(field, x - uy * s, y + ux * s, w.fogEpochT, w.fogCut);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    return lo >= FOG_SOLID_DENSITY ? 'solid' : hi < FOG_SOLID_DENSITY ? 'clear' : 'mixed';
  };
  let i = 0;
  while (i < n && kind(i) === 'solid') i += 1;
  if (i >= n) return false; // the whole ray is the own bank
  const mixedStart = i;
  while (i < n && kind(i) !== 'clear') i += 1;
  if ((i - mixedStart) * step > cell) return true; // a shallow crossing, a graze or a thin dip
  const clearStart = i;
  while (i < n && kind(i) === 'clear') i += 1;
  return i < n && (i - clearStart) * step < 5 * cell; // clear water too short to end the run for certain
}

describe('fog field — the memoized cell walk agrees with the shared midpoint march (the reference)', () => {
  const TOLERANCE = CONFIG.fog.sightCostPerU * 2 * CONFIG.fog.marchStepU; // one cell's quantization at each end

  it('2,000 random rays ≤ 750 u at ~8 % coverage: |walk − march| ≤ sightCostPerU × 2 × marchStepU on every non-fragile ray, the walk pays wherever the march pays, and fragile rays (the own-bank run ending from different samples) are few', () => {
    const w = pinnedWorld(21, 0.08);
    expect(Math.abs(w.fogCoverageEstimate - 0.08)).toBeLessThanOrEqual(0.01);
    const field = w.fogFieldForTest();
    const g = mulberry32(0xf0e);
    const R = w.map.radius; // a ray starts anywhere on the ocean; its ≤ 750 u stays inside the lattice's margin
    let worst = 0;
    let paying = 0;
    let fragile = 0;
    let ownBank = 0;
    const diffs: number[] = [];
    for (let k = 0; k < 2000; k++) {
      const ax = g.float(-R, R);
      const ay = g.float(-R, R);
      const ang = g.float(0, 2 * Math.PI);
      const len = g.float(1, 750);
      const bx = ax + Math.cos(ang) * len;
      const by = ay + Math.sin(ang) * len;
      const walk = w.fogTollAlong(ax, ay, bx, by);
      const march = fogTollAlong(field, ax, ay, bx, by, w.fogEpochT, w.fogCut);
      if (fogDensityAt(field, ax, ay, w.fogEpochT, w.fogCut) >= FOG_SOLID_DENSITY) ownBank += 1;
      if (fragileRun(w, ax, ay, bx, by)) {
        fragile += 1;
        continue;
      }
      worst = Math.max(worst, Math.abs(walk - march));
      diffs.push(Math.abs(walk - march));
      expect(Math.abs(walk - march), `ray ${k}`).toBeLessThanOrEqual(TOLERANCE);
      if (march > TOLERANCE) {
        paying += 1;
        expect(walk, `ray ${k} pays`).toBeGreaterThan(0); // no "reject" exists: a tolled ray is never read as free
      }
    }
    diffs.sort((a, b) => a - b);
    if (process.env.HC_PERF_LOG) console.log(`fog walk vs march: worst |Δ| ${worst.toFixed(3)} u (tolerance ${TOLERANCE}), mean ${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(3)}, p95 ${diffs[Math.floor(0.95 * diffs.length)].toFixed(3)}, p99 ${diffs[Math.floor(0.99 * diffs.length)].toFixed(3)}, paying rays ${paying} / 2000, own-bank rays ${ownBank}, fragile ${fragile}, cells evaluated ${w.fogCellEvals}`);
    expect(paying).toBeGreaterThan(100); // the comparison is not vacuous
    expect(ownBank).toBeGreaterThan(50); // ...nor is the own-bank rule: observers DO stand in banks here
    expect(fragile).toBeLessThan(ownBank / 2); // and most own-bank rays are compared exactly
  });

  it('is deterministic: the same ray twice returns the identical toll and the second call touches no new cell; a new epoch re-evaluates; the own-bank memo follows the epoch', () => {
    const w = pinnedWorld(22, 0.08);
    const first = w.fogTollAlong(-300, 120, 400, -200);
    const evals = w.fogCellEvals;
    expect(evals).toBeGreaterThan(0);
    expect(w.fogTollAlong(-300, 120, 400, -200)).toBe(first);
    expect(w.fogCellEvals).toBe(evals);
    w.setFogCutForTest(w.fogCut); // a new epoch at the same cut: the cells are stale and re-evaluated
    expect(w.fogTollAlong(-300, 120, 400, -200)).toBeCloseTo(first, 6);
    expect(w.fogCellEvals).toBeGreaterThan(evals);
  });

  it('is symmetric A ↔ B when neither end stands in solid fog, and DIRECTIONAL when one does (amendment 179)', () => {
    const w = pinnedWorld(22, 0.25);
    const g = mulberry32(0xd1);
    let symmetric = 0;
    let directional = 0;
    for (let k = 0; k < 400 && (symmetric < 20 || directional < 5); k++) {
      const ax = g.float(-2000, 2000), ay = g.float(-2000, 2000), bx = ax + g.float(-600, 600), by = ay + g.float(-600, 600);
      const aIn = w.fogDensityAt(ax, ay) >= FOG_SOLID_DENSITY;
      const bIn = w.fogDensityAt(bx, by) >= FOG_SOLID_DENSITY;
      const ab = w.fogTollAlong(ax, ay, bx, by);
      const ba = w.fogTollAlong(bx, by, ax, ay);
      if (!aIn && !bIn) {
        expect(ab).toBeCloseTo(ba, 6); // the same cells either way (a corner tie may graze one extra, at zero length)
        symmetric += 1;
      } else if (aIn !== bIn && ab !== ba) {
        // the end that stands in fog is the one that pays less: its own bank is free
        expect(aIn ? ab : ba).toBeLessThan(aIn ? ba : ab);
        directional += 1;
      }
    }
    expect(symmetric).toBeGreaterThanOrEqual(20);
    expect(directional).toBeGreaterThanOrEqual(5);
  });

  it('density 1 everywhere (cut −2): an observer ON the ocean pays nothing anywhere (the whole ocean is one bank, amendment 179); from just past the rim the walk is exactly sightCostPerU × the length inside, to a cell', () => {
    const w = liveWorld(23);
    w.setFogCutForTest(-2);
    expect(w.fogTollAlong(0, 0, 300, 0)).toBe(0);
    expect(w.fogTollAlong(-123.4, 56.7, 210.9, -333.3)).toBe(0);
    const R = w.map.radius;
    const toll = w.fogTollAlong(R + 10, 0, R - 300, 0);
    expect(toll).toBeGreaterThanOrEqual((300 - CONFIG.fog.marchStepU) * CONFIG.fog.sightCostPerU);
    expect(toll).toBeLessThanOrEqual((300 + CONFIG.fog.marchStepU) * CONFIG.fog.sightCostPerU);
    expect(w.fogTollAlong(R - 300, 0, R + 10, 0)).toBe(0); // and out of the bank is free
  });

  it('rays are CLIPPED to the memo lattice (the ocean square + margin): wholly outside pays 0, a ray entering the square pays only its inside part, and nothing past the rim', () => {
    const w = liveWorld(24);
    w.setFogCutForTest(-2);
    const far = w.map.radius + 2000; // past the lattice's margin (the longest sight ray)
    expect(w.fogTollAlong(far, 0, far + 500, 0)).toBe(0);
    const inside = w.fogTollAlong(far, 0, w.map.radius - 50, 0);
    expect(inside).toBeGreaterThan(0);
    expect(inside).toBeLessThanOrEqual((50 + CONFIG.fog.marchStepU) * CONFIG.fog.sightCostPerU); // only the 50 u on the ocean pays (amendment 179: no fog past the rim)
    expect(w.fogTollAlong(NaN, 0, 100, 0)).toBe(0);
    expect(w.fogTollAlong(0, 0, 0, 0)).toBe(0);
  });
});

describe('fog field — resetForMatchStart and the test seams', () => {
  it('resetForMatchStart restores no fog (the cut, the share) and the pre-start world stays that way', () => {
    const w = liveWorld(41);
    for (let i = 0; i < 2 * TICKS_PER_REFRESH; i++) fogTick(w);
    expect(w.fogCut).toBeLessThan(FOG_NO_CUT);
    w.resetForMatchStart();
    expect(w.fogCut).toBe(FOG_NO_CUT);
    expect(w.fogCoverageEstimate).toBe(0);
    expect(w.fogTollAlong(0, 0, 500, 0)).toBe(0);
  });

  it('setFogCutForTest pins the cut through steps (−2 = density 1 everywhere, FOG_NO_CUT = none), bumps the epoch, and resetForMatchStart lifts the pin', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 1 });
    const epoch0 = internals(w).fogEpoch;
    w.setFogCutForTest(-2);
    expect(internals(w).fogEpoch).toBe(epoch0 + 1);
    for (let i = 0; i < 5; i++) w.step();
    expect(w.fogCut).toBe(-2);
    for (const p of samplePoints(w)) expect(w.fogDensityAt(p.x, p.y)).toBe(1);
    expect(w.fogDensityAt(w.map.radius + 1, 0)).toBe(0); // amendment 179: nothing past the rim
    expect(w.fogTollAlong(w.map.radius + 10, 0, w.map.radius - 290, 0)).toBeGreaterThan(280 * CONFIG.fog.sightCostPerU);
    expect(w.fogTollAlong(0, 0, 300, 0)).toBe(0); // the observer's own bank (amendment 179)
    expect(w.fogCoverageEstimate).toBe(1);
    w.setFogCutForTest(FOG_NO_CUT);
    expect(w.fogTollAlong(0, 0, 300, 0)).toBe(0);
    w.setFogCutForTest(-2);
    w.resetForMatchStart();
    w.step();
    expect(w.fogCut).toBe(FOG_NO_CUT); // the pin is gone: the pre-start tick cleared it
  });
});
