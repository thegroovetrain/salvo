// THE RAIN FIELD on the server (Story 11.6, Eric 2026-11-14 — "the eye of a
// closing hurricane"; it replaced Story 9.10's fog banks, their coverage cut
// and the free own bank).
//
// Contracts only, on synthetic worlds: the pre-start world has no rain; once
// the zone starts `stepFog` is THE EPOCH REFRESH — every `refreshMs` the
// World's frame is the shared `fogFrameAt` at that clock on the live ring
// center AS A CLIENT HOLDS IT (the float32 schema mirror), all the way
// through the closing beats and the collapse; the field is public weather
// (nothing room-private moves it); the server's optical depth is an EXACT
// cell walk over the memoized density lattice that agrees with the shared
// midpoint march (the reference the client runs) inside the oracle's dead
// band and is deterministic (a repeated ray touches no new cell); rays are
// clipped to the lattice; there is no own-bank exemption;
// resetForMatchStart restores no rain. No ring size, density or coverage
// literal is pinned — every expectation is derived from CONFIG.fog, the live
// rings and the shared field functions.

import { describe, it, expect } from 'vitest';
import { CONFIG, fogDensityAt, fogDepthAlong, fogFrameAt, mulberry32, zoneGroups, zoneLiveState, ZONE_BEATS_PER_GROUP, type FogFrame, type ZoneRing } from '@salvo/shared';
import { World } from '../game/world.js';
import { observe } from '../game/perception.js';
import { RAIN_T, rainDepthOracle, stormFrame, uniformRainFrame } from './rainFixture.js';

const DT = CONFIG.tick.simDtMs;
const SEED = 4242;
const TICKS_PER_REFRESH = Math.floor(CONFIG.fog.refreshMs / DT);

/** The private rain seams the contracts read (never written here). */
interface FogInternals {
  stepFog(): void;
  fogEpoch: number;
}

const internals = (w: World): FogInternals => w as unknown as FogInternals;

function liveWorld(pseudonymSeed: number, seed = SEED): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed });
  w.startZone(0);
  return w;
}

/**
 * One rain-only tick: advance the clock exactly as World.step's prologue does
 * and run ONLY the `stepFog` row. The refresh's contracts do not depend on
 * any other row (it reads the clock, the zone timeline and the field), and
 * running the full step — bots — for a whole zone timeline costs minutes of
 * wall time. One case below runs the REAL World.step to prove the row is
 * wired.
 */
function fogTick(w: World): void {
  w.now += DT;
  internals(w).stepFog();
}

/** Seeded points on the ocean's disc. */
function oceanPoints(w: World, n: number, salt: number): Array<{ x: number; y: number }> {
  const rng = mulberry32(salt);
  const out: Array<{ x: number; y: number }> = [];
  while (out.length < n) {
    const x = (rng.next() * 2 - 1) * w.map.radius;
    const y = (rng.next() * 2 - 1) * w.map.radius;
    if (x * x + y * y <= w.map.radius * w.map.radius) out.push({ x, y });
  }
  return out;
}

/** A ring as a client holds it: every field through the schema's float32. */
function wire(ring: ZoneRing): ZoneRing {
  const f = new Float32Array([ring.cx, ring.cy, ring.r]);
  return { cx: f[0], cy: f[1], r: f[2] };
}

/** The frame an honest client builds at the server's epoch clock: the shared
 *  live-ring derivation over the schema's float32 rings (a next ring of
 *  radius 0 is the wire's "unrevealed"), then the shared `fogFrameAt`. */
function clientFrame(w: World): FogFrame {
  const cur = wire(w.zoneCurrentRing);
  const next = w.zoneRevealedNextRing === null ? null : wire(w.zoneRevealedNextRing);
  const live = zoneLiveState(w.fogEpochT, 0, cur, next !== null && next.r > 0 ? next : null, CONFIG.zone).current;
  return fogFrameAt(w.fogFieldForTest(), w.fogEpochT, 0, live.cx, live.cy, CONFIG.zone);
}

describe('rain field — the pre-start world has no rain (spec: Pre-zone / idle)', () => {
  it('a world whose zone never starts runs 300 ticks dry: density 0 everywhere, every ray admitted, no walk started, no memo cell evaluated', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    for (let i = 0; i < 300; i++) fogTick(w);
    expect(w.fogLive).toBe(false);
    for (const p of oceanPoints(w, 50, 1)) expect(w.fogDensityAt(p.x, p.y)).toBe(0);
    expect(w.fogDepthAlong(-3000, 0, 3000, 0)).toBe(0);
    expect(w.fogSightAdmits(-3000, 0, 3000, 0)).toBe(true);
    expect(w.fogHullAdmits(-3000, 0, 3000, 0, 0, 120, 18)).toBe(true);
    expect(w.fogWalks).toBe(0);
    expect(w.fogCellEvals).toBe(0);
  });
});

describe('rain field — stepFog is the epoch refresh on the live ring', () => {
  it('refreshes on the first live tick and then exactly every refreshMs: the epoch clock is held between refreshes and never lags the clock by refreshMs or more', () => {
    const w = liveWorld(1);
    fogTick(w);
    expect(w.fogLive).toBe(true);
    expect(w.fogEpochT).toBe(w.now); // the first live tick refreshes at once
    let refreshes = 0;
    let last = w.fogEpochT;
    for (let i = 0; i < TICKS_PER_REFRESH * 20; i++) {
      fogTick(w);
      expect(w.now - w.fogEpochT).toBeLessThan(CONFIG.fog.refreshMs);
      if (w.fogEpochT !== last) {
        expect(w.fogEpochT - last).toBe(CONFIG.fog.refreshMs);
        expect(w.fogEpochT).toBe(w.now);
        refreshes += 1;
        last = w.fogEpochT;
      }
    }
    expect(refreshes).toBe(20);
  });

  it('over the WHOLE zone timeline — every beat, every close, the collapse — each epoch\'s field is bit-identical to the frame an honest client builds from the float32 schema rings at that clock; the eye follows the live ring off the ocean center through the closes', () => {
    const w = liveWorld(1);
    const pts = oceanPoints(w, 12, 2);
    const totalMs = (zoneGroups(CONFIG.zone) * ZONE_BEATS_PER_GROUP + 1) * CONFIG.zone.beatMs;
    let epochs = 0;
    let rained = 0;
    let midClose = 0; // epochs whose eye sat strictly between two rings' centers
    let last = -1;
    while (w.now < totalMs) {
      fogTick(w);
      if (w.fogEpochT === last) continue;
      last = w.fogEpochT;
      epochs += 1;
      const ref = clientFrame(w);
      for (const p of pts) {
        const d = w.fogDensityAt(p.x, p.y);
        expect(d).toBe(fogDensityAt(ref, p.x, p.y));
        if (d > 0) rained += 1;
      }
      const eye = w.fogFrameForTest();
      const cur = wire(w.zoneCurrentRing);
      if (eye.cx !== cur.cx || eye.cy !== cur.cy) midClose += 1;
    }
    expect(epochs).toBeGreaterThan(zoneGroups(CONFIG.zone) * ZONE_BEATS_PER_GROUP); // many epochs in every beat
    expect(rained).toBeGreaterThan(0);
    expect(midClose).toBeGreaterThan(0);
    // Past the collapse the ring has no radius and the frame is still finite weather.
    expect(w.zoneLiveRing.r).toBe(0);
    for (const p of pts) expect(Number.isFinite(w.fogDensityAt(p.x, p.y))).toBe(true);
  });

  it('the stepFog row is wired into World.step: a live world rains after its first step', () => {
    const w = liveWorld(1);
    expect(w.fogLive).toBe(false);
    w.step();
    expect(w.fogLive).toBe(true);
    expect(w.fogEpochT).toBe(w.now);
  });
});

describe('rain field — public weather, deterministic from the map seed', () => {
  it('the same seed reproduces the densities whatever the room-private seed; a different map seed moves the field', () => {
    const run = (pseudonymSeed: number, seed: number): number[] => {
      const w = liveWorld(pseudonymSeed, seed);
      // Hold the eye where every run has it: pin the frame at one clock on the ocean center.
      w.setFogFrameForTest(stormFrame(w));
      return oceanPoints(w, 200, 3).map((p) => w.fogDensityAt(p.x, p.y));
    };
    const a = run(1, SEED);
    expect(run(1, SEED)).toEqual(a);
    expect(run(999, SEED)).toEqual(a); // no room-private stream reaches the rain
    expect(run(1, SEED + 1)).not.toEqual(a);
    expect(a.some((d) => d > 0)).toBe(true);
    expect(a.some((d) => d === 0)).toBe(true);
  });
});

describe('rain field — the memoized cell walk agrees with the shared midpoint march (the reference)', () => {
  function stormWorld(): World {
    const w = new World(SEED, CONFIG.map.playerCap);
    w.setFogFrameForTest(stormFrame(w));
    return w;
  }

  it('2,000 seeded rays up to the longest eye reach: the walk\'s τ is within the oracle\'s dead band of the fine re-integration AND of the shared `fogDepthAlong` march, and rays through rain and through clear water both occur', () => {
    const w = stormWorld();
    const frame = w.fogFrameForTest();
    const R = w.map.radius;
    const rng = mulberry32(0xbeef);
    let wet = 0;
    let dry = 0;
    for (let n = 0; n < 2000; n++) {
      const ax = (rng.next() * 2 - 1) * R * 0.7;
      const ay = (rng.next() * 2 - 1) * R * 0.7;
      const ang = rng.next() * 6.283185307179586;
      const len = n % 3 === 0 ? 20 + rng.next() * 500 : 500 + rng.next() * (CONFIG.vision.hullSight - 500);
      const b = { x: ax + Math.cos(ang) * len, y: ay + Math.sin(ang) * len };
      const walk = w.fogDepthAlong(ax, ay, b.x, b.y);
      const oracle = rainDepthOracle(frame, { x: ax, y: ay }, b);
      expect(Math.abs(walk - oracle.tau), `ray ${n} vs the fine integration`).toBeLessThanOrEqual(oracle.slack);
      // The shared march is one more Riemann sum of the same profile at production's own step.
      expect(Math.abs(walk - fogDepthAlong(frame, ax, ay, b.x, b.y)), `ray ${n} vs the shared march`).toBeLessThanOrEqual(2 * oracle.slack);
      if (walk > 0) wet += 1;
      else dry += 1;
      if (!oracle.touched) expect(walk).toBe(0); // clear water is exactly clear
    }
    expect(wet).toBeGreaterThan(0);
    expect(dry).toBeGreaterThan(0);
  });

  it('is deterministic: the same ray twice returns the identical τ and the second call touches no new cell; a new epoch re-evaluates', () => {
    const w = stormWorld();
    const first = w.fogDepthAlong(-2500, 300, 2600, -400);
    const cells = w.fogCellEvals;
    expect(cells).toBeGreaterThan(0);
    expect(w.fogDepthAlong(-2500, 300, 2600, -400)).toBe(first);
    expect(w.fogCellEvals).toBe(cells);
    w.setFogFrameForTest(stormFrame(w)); // the same weather, a new epoch
    expect(w.fogDepthAlong(-2500, 300, 2600, -400)).toBe(first);
    expect(w.fogCellEvals).toBeGreaterThan(cells);
  });

  it('is the same from either end (no own-bank exemption makes a ray directional), to float dust', () => {
    const w = stormWorld();
    const rng = mulberry32(0x51de);
    let wet = 0;
    for (let n = 0; n < 200; n++) {
      const a = { x: (rng.next() * 2 - 1) * 3000, y: (rng.next() * 2 - 1) * 3000 };
      const b = { x: (rng.next() * 2 - 1) * 3000, y: (rng.next() * 2 - 1) * 3000 };
      const ab = w.fogDepthAlong(a.x, a.y, b.x, b.y);
      expect(w.fogDepthAlong(b.x, b.y, a.x, a.y)).toBeCloseTo(ab, 6);
      if (ab > 0) wet += 1;
    }
    expect(wet).toBeGreaterThan(0);
  });

  it('uniform rain: τ is exactly density × the length on the ocean — from the observer\'s own position on (no free run), and only the inside part of a ray that starts past the rim', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    const R = w.map.radius;
    for (const density of [1, 0.5]) {
      w.setFogFrameForTest(uniformRainFrame(w, density));
      expect(w.fogDepthAlong(-700, 40, 900, 40)).toBeCloseTo(density * 1600, 6);
      expect(w.fogDepthAlong(120, -80, 120, -80 + 37)).toBeCloseTo(density * 37, 6);
      // From 400 u past the rim straight in to the center: the rain starts at the rim (to a memo cell).
      const inside = w.fogDepthAlong(R + 400, 0, 0, 0);
      expect(Math.abs(inside - density * R)).toBeLessThanOrEqual(density * 2 * CONFIG.fog.marchStepU);
    }
  });

  it('rays are CLIPPED to the memo lattice (the ocean square + margin): wholly outside reads 0 and evaluates nothing', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    w.setFogFrameForTest(uniformRainFrame(w, 1));
    const far = w.map.radius * 2;
    const cells = w.fogCellEvals;
    expect(w.fogDepthAlong(far, -500, far, 500)).toBe(0);
    expect(w.fogDepthAlong(far, far, far + 900, far + 900)).toBe(0);
    expect(w.fogCellEvals).toBe(cells);
  });
});

describe('rain field — the memo lattice is the OCEAN, and a question is walked once (Story 11.2 review gate, F2)', () => {
  it('the lattice spans the ocean\'s bounding square and at most a cell or two beyond it — its size follows the map, never a sight reach', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    expect(w.fogMemoSpanU).toBeGreaterThanOrEqual(2 * w.map.radius);
    expect(w.fogMemoSpanU).toBeLessThanOrEqual(2 * w.map.radius + 4 * CONFIG.fog.marchStepU);
  });

  it('a ray that leaves the ocean at the LONGEST eye reach is read exactly: the walk agrees with the fine re-integration wherever the far end lies (rain is 0 past the rim, so the clipped part owes nothing)', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    w.setFogFrameForTest(stormFrame(w));
    const frame = w.fogFrameForTest();
    const R = w.map.radius;
    const reach = Math.max(CONFIG.vision.hullSight, CONFIG.vision.muzzleFlash, CONFIG.vision.splashSight);
    const rng = mulberry32(0x0cea);
    let left = 0;
    for (let n = 0; n < 300; n++) {
      const ang = rng.next() * 6.283185307179586;
      const a = { x: Math.cos(ang) * R * 0.8, y: Math.sin(ang) * R * 0.8 };
      const out = ang + (rng.next() - 0.5); // roughly outward, across the rim
      const b = { x: a.x + Math.cos(out) * reach, y: a.y + Math.sin(out) * reach };
      if (Math.hypot(b.x, b.y) > R) left += 1;
      const oracle = rainDepthOracle(frame, a, b);
      expect(Math.abs(w.fogDepthAlong(a.x, a.y, b.x, b.y) - oracle.tau), `ray ${n}`).toBeLessThanOrEqual(oracle.slack);
    }
    expect(left).toBeGreaterThan(0);
  });

  it('the same ray asked again in the same epoch walks NOTHING; another ray or a new epoch walks', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    w.setFogFrameForTest(uniformRainFrame(w, 1));
    const far = RAIN_T * 2; // long enough that the rain can decide
    const before = w.fogWalks;
    const first = w.fogSightAdmits(0, 0, far, 0);
    expect(w.fogWalks).toBe(before + 1);
    expect(w.fogSightAdmits(0, 0, far, 0)).toBe(first);
    expect(w.fogWalks).toBe(before + 1);
    w.fogSightAdmits(0, 0, 0, far);
    expect(w.fogWalks).toBe(before + 2);
    w.setFogFrameForTest(uniformRainFrame(w, 1));
    w.fogSightAdmits(0, 0, 0, far);
    expect(w.fogWalks).toBe(before + 3);
  });

  it('one observe() pass answers an observer → hull pair ONCE whichever eye tier the hull is in: a hull the rain hides costs at most one walk per grid point, though the contact row and the plain row both ask', () => {
    const grid = CONFIG.fog.hullGridCols * CONFIG.fog.hullGridRows;
    for (const tier of ['inner', 'outer'] as const) {
      const w = new World(SEED, CONFIG.map.playerCap);
      const me = w.addShip('me', 'ME', 'captain', undefined, undefined, undefined);
      const other = w.addShip('other', 'OTHER', 'captain', undefined, undefined, undefined);
      w.map.islands.length = 0; // open water: the rays are the rain's alone
      const d = tier === 'inner' ? me.stats.sightRange / 2 : (me.stats.sightRange + me.stats.hullSightRange) / 2;
      expect(d).toBeGreaterThan(RAIN_T * 2); // premise: uniform rain hides it in either tier
      Object.assign(me.state, { x: -d / 2, y: 0, heading: 0, speed: 0 });
      Object.assign(other.state, { x: d / 2, y: 0, heading: 1, speed: 0 });
      w.setFogFrameForTest(uniformRainFrame(w, 1));
      const before = w.fogWalks;
      const view = observe(w, 'me');
      expect(view.contacts).toEqual([]);
      expect(view.plain).toEqual([]);
      const cost = w.fogWalks - before;
      expect(cost, tier).toBeGreaterThan(0);
      expect(cost, tier).toBeLessThanOrEqual(grid);
    }
  });
});

describe('rain field — resetForMatchStart and the test seam', () => {
  it('resetForMatchStart restores no rain, and a world whose zone has not started stays dry', () => {
    const w = new World(SEED, CONFIG.map.playerCap);
    w.setFogFrameForTest(uniformRainFrame(w, 1));
    expect(w.fogLive).toBe(true);
    w.resetForMatchStart();
    expect(w.fogLive).toBe(false);
    for (let i = 0; i < TICKS_PER_REFRESH * 3; i++) fogTick(w);
    expect(w.fogLive).toBe(false);
    expect(w.fogDensityAt(100, 100)).toBe(0);
  });

  it('setFogFrameForTest pins the frame through steps (the refresh leaves it alone) and starts an epoch; null unpins to no rain, and a live zone then rains again on its own frame at the next tick', () => {
    const w = liveWorld(1);
    const pinned = uniformRainFrame(w, 1);
    const epoch = internals(w).fogEpoch;
    w.setFogFrameForTest(pinned);
    expect(internals(w).fogEpoch).toBeGreaterThan(epoch);
    for (let i = 0; i < TICKS_PER_REFRESH * 3; i++) fogTick(w);
    expect(w.fogFrameForTest()).toBe(pinned);
    expect(w.fogDensityAt(100, 100)).toBe(1);
    w.setFogFrameForTest(null);
    expect(w.fogLive).toBe(false);
    expect(w.fogFrameForTest()).not.toBe(pinned);
    fogTick(w);
    expect(w.fogLive).toBe(true); // the zone is live: the World's own frame is back
    expect(w.fogEpochT).toBe(w.now);
  });
});
