// FOG BANKS — the server store and its coverage controller (Story 9.10; Eric
// rulings 2026-10-14/15, epic-9 amendments 149–150 and 162–168).
//
// Contracts only, on synthetic worlds: the pre-start world never grows fog;
// a live controller spawns on water inside the live ring, never past
// maxBanks, never past the band by more than one bank; the room-private fog
// stream is deterministic per (seed, pseudonymSeed); the storm kill shortens a
// bank's life WITHOUT a scale jump and never extends it; expiry is exact; a
// check with no water sample spawns nothing; resetForMatchStart clears the
// store. No ring radius or bank coordinate is pinned against a literal
// (epic-9 amendment 8) — every expectation is derived from the live ring,
// the map and CONFIG.fog.

import { describe, it, expect } from 'vitest';
import { CONFIG, fogScale, isOutside, landCoverage, pointInIsland, type FogBankRecord } from '@salvo/shared';
import { World } from '../game/world.js';
import { circleIsland } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const SEED = 4242;

function liveWorld(pseudonymSeed: number, seed = SEED): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed });
  w.startZone(0);
  return w;
}

/**
 * One fog-only tick: advance the clock exactly as World.step's prologue does
 * and run ONLY the `stepFog` row. The controller's contracts do not depend on
 * any other row (it reads the clock, the live ring, the map and its own
 * stream), and running the full step — fleet waves, bots — for ten simulated
 * minutes costs minutes of wall time. One describe below runs the REAL
 * World.step to prove the row is wired.
 */
function fogTick(w: World): void {
  w.now += DT;
  (w as unknown as { stepFog(): void }).stepFog();
}

/** The world's water share, re-derived from the map (the controller's denominator). */
function waterShare(w: World): number {
  return Math.max(0.05, 1 - landCoverage(w.map));
}

/** Full-size bank area (Σ π R²) of banks whose centre is inside the live ring. */
function areaInside(w: World, banks: readonly FogBankRecord[]): number {
  const ring = w.zoneLiveRing;
  let a = 0;
  for (const b of banks) if (!isOutside(b, ring.cx, ring.cy, ring.r)) a += Math.PI * b.R * b.R;
  return a;
}

type Born = Pick<FogBankRecord, 'id' | 'x' | 'y' | 'R' | 'bornAt'>;

/** Run `ticks` steps and return every bank in birth order (as first seen). */
function birthLog(w: World, ticks: number): Born[] {
  const seen = new Map<string, Born>();
  for (let i = 0; i < ticks; i++) {
    fogTick(w);
    for (const b of w.fogBankRecords) {
      if (!seen.has(b.id)) seen.set(b.id, { id: b.id, x: b.x, y: b.y, R: b.R, bornAt: b.bornAt });
    }
  }
  return [...seen.values()];
}

describe('fog banks — the pre-start world is inert (spec: Pre-start world)', () => {
  it('a world whose zone never starts runs 300 ticks and holds zero banks', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 7 });
    for (let i = 0; i < 300; i++) {
      w.step();
      expect(w.fogBankCount).toBe(0);
    }
    expect(w.fogBankRecords).toEqual([]);
  });
});

describe('fog banks — the live coverage controller (spec: Controller band)', () => {
  it('over ~10 simulated minutes: spawns on water inside the live ring, never past maxBanks, never past the band by more than one bank', () => {
    const w = liveWorld(11);
    const cfg = CONFIG.fog;
    const maxBankArea = Math.PI * cfg.radiusMaxU * cfg.radiusMaxU;
    const known = new Set<string>();
    let prev: readonly FogBankRecord[] = [];
    let spawned = 0;
    const ticks = (10 * 60 * 1000) / DT;
    for (let i = 0; i < ticks; i++) {
      fogTick(w);
      const banks = w.fogBankRecords;
      expect(banks.length).toBeLessThanOrEqual(cfg.maxBanks);
      const ring = w.zoneLiveRing;
      const fresh = banks.filter((b) => !known.has(b.id));
      expect(fresh.length).toBeLessThanOrEqual(1); // one bank per check at most
      for (const b of fresh) {
        known.add(b.id);
        spawned += 1;
        expect(isOutside(b, ring.cx, ring.cy, ring.r)).toBe(false);
        expect(w.map.islands.some((isle) => pointInIsland(b, isle))).toBe(false);
        expect(b.R).toBeGreaterThanOrEqual(cfg.radiusMinU);
        expect(b.R).toBeLessThanOrEqual(cfg.radiusMaxU);
        expect(b.bornAt).toBe(w.now);
        expect(b.until).toBe(w.now + cfg.lifeMs);
        // A spawn happens only while the PRE-spawn coverage was under a target
        // that is at most coverageMax, so after it the full-size coverage is
        // at most the band's top plus the one bank just added.
        const water = Math.PI * ring.r * ring.r * waterShare(w);
        expect(areaInside(w, prev)).toBeLessThan(cfg.coverageMax * water);
        expect(areaInside(w, banks)).toBeLessThanOrEqual(cfg.coverageMax * water + maxBankArea);
      }
      // The storm-kill invariant, every tick: no bank whose centre is outside
      // the live ring still has more than one fade of life left.
      for (const b of banks) {
        if (isOutside(b, ring.cx, ring.cy, ring.r)) expect(b.until - w.now).toBeLessThanOrEqual(cfg.fadeMs);
      }
      prev = banks;
    }
    expect(spawned).toBeGreaterThan(0); // the controller actually ran
  });

  it('the stepFog row is wired into World.step: a live world grows its first bank within the first checks', () => {
    const w = liveWorld(12);
    for (let i = 0; i < (3 * CONFIG.fog.spawnCheckMs) / DT; i++) w.step();
    expect(w.fogBankCount).toBeGreaterThan(0);
  });
});

describe('fog banks — determinism of the room-private fog stream', () => {
  it('the same (seed, pseudonymSeed) reproduces the bank sequence; a different pseudonymSeed does not', () => {
    const ticks = (3 * 60 * 1000) / DT;
    const a = birthLog(liveWorld(99), ticks);
    const b = birthLog(liveWorld(99), ticks);
    const c = birthLog(liveWorld(100), ticks);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });
});

/** A mature bank (scale 1 at the next step) seeded `dx` outside the live ring. */
function seedOutside(w: World, id: string, bornAt: number, until: number): FogBankRecord {
  const ring = w.zoneLiveRing;
  const bank: FogBankRecord = { id, x: ring.cx + ring.r + 500, y: ring.cy, R: CONFIG.fog.radiusMinU, bornAt, until };
  w.seedFogBank(bank);
  return bank;
}

describe('fog banks — storm kill without a jump (spec: Storm kill / Storm kill mid-fade)', () => {
  const { growMs, fadeMs, lifeMs } = CONFIG.fog;

  it('a mature bank whose centre is outside the live ring fades over fadeMs from scale 1, linearly, and is removed at until', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 3 });
    const t = w.now + DT; // the next step's clock
    seedOutside(w, 'fgT', t - growMs - 1000, t + lifeMs);
    w.step();
    const bank = w.fogBanks.get('fgT')!;
    expect(bank.until).toBe(w.now + fadeMs);
    expect(fogScale(bank, w.now, CONFIG.fog)).toBe(1);
    const until = bank.until;
    let last = 1;
    while (w.now + DT < until) {
      w.step();
      const s = fogScale(w.fogBanks.get('fgT')!, w.now, CONFIG.fog);
      expect(s).toBeCloseTo((until - w.now) / fadeMs, 12);
      expect(s).toBeLessThan(last);
      expect(w.fogBanks.get('fgT')!.until).toBe(until); // never re-cut while fading
      last = s;
    }
    w.step();
    expect(w.now).toBeGreaterThanOrEqual(until);
    expect(w.fogBanks.has('fgT')).toBe(false);
  });

  it('a GROWING bank at scale 0.4 gets until = now + 0.4 × fadeMs — its scale does not jump', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 3 });
    const t = w.now + DT;
    const before = seedOutside(w, 'fgG', t - 0.4 * growMs, t + lifeMs);
    const sBefore = fogScale(before, t, CONFIG.fog);
    expect(sBefore).toBeCloseTo(0.4, 12);
    w.step();
    const bank = w.fogBanks.get('fgG')!;
    expect(bank.until).toBeCloseTo(w.now + sBefore * fadeMs, 9);
    expect(fogScale(bank, w.now, CONFIG.fog)).toBeCloseTo(sBefore, 9); // no jump
  });

  it('a bank ALREADY fading (scale 0.4 on its own fade) keeps its until — never extended, never re-cut', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 3 });
    const t = w.now + DT;
    seedOutside(w, 'fgF', t - lifeMs, t + 0.4 * fadeMs);
    w.step();
    expect(w.fogBanks.get('fgF')!.until).toBe(t + 0.4 * fadeMs);
  });

  it('a bank whose centre is INSIDE the live ring is untouched', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 3 });
    const ring = w.zoneLiveRing;
    const t = w.now + DT;
    w.seedFogBank({ id: 'fgI', x: ring.cx, y: ring.cy, R: CONFIG.fog.radiusMinU, bornAt: t - growMs, until: t + lifeMs });
    w.step();
    expect(w.fogBanks.get('fgI')!.until).toBe(t + lifeMs);
  });
});

describe('fog banks — expiry', () => {
  it('a bank is present the tick before until and gone the tick now >= until', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 5 });
    const ring = w.zoneLiveRing;
    const until = w.now + 10 * DT;
    w.seedFogBank({ id: 'fgE', x: ring.cx, y: ring.cy, R: CONFIG.fog.radiusMinU, bornAt: w.now, until });
    while (w.now + DT < until) {
      w.step();
      expect(w.fogBanks.has('fgE')).toBe(true);
    }
    w.step();
    expect(w.now).toBe(until);
    expect(w.fogBanks.has('fgE')).toBe(false);
  });
});

describe('fog banks — spawn rejection (spec: Spawn rejection)', () => {
  it('when every sample lands on land, a check spawns nothing; the next check tries again', () => {
    const w = liveWorld(21);
    const saved = w.map.islands.splice(0);
    // One island covering the whole ocean: every sample is on land.
    w.map.islands.push(circleIsland(0, 0, w.map.radius * 2));
    const checks = 5;
    for (let i = 0; i < (checks * CONFIG.fog.spawnCheckMs) / DT; i++) fogTick(w);
    expect(w.fogBankCount).toBe(0);
    // Open the water again: the very next check spawns.
    w.map.islands.splice(0, w.map.islands.length, ...saved);
    for (let i = 0; i < CONFIG.fog.spawnCheckMs / DT; i++) fogTick(w);
    expect(w.fogBankCount).toBe(1);
  });

  it('with spawnTries 1 the controller still never places a bank on land (restored after)', () => {
    const tries = CONFIG.fog.spawnTries;
    (CONFIG.fog as { spawnTries: number }).spawnTries = 1;
    try {
      const w = liveWorld(22);
      for (let i = 0; i < (60 * 1000) / DT; i++) {
        fogTick(w);
        for (const b of w.fogBankRecords) expect(w.map.islands.some((isle) => pointInIsland(b, isle))).toBe(false);
      }
    } finally {
      (CONFIG.fog as { spawnTries: number }).spawnTries = tries;
    }
  });
});

describe('fog banks — resetForMatchStart and the test seams', () => {
  it('resetForMatchStart clears the store', () => {
    const w = liveWorld(31);
    for (let i = 0; i < (10 * CONFIG.fog.spawnCheckMs) / DT; i++) fogTick(w);
    w.seedFogBank({ id: 'fgX', x: 0, y: 0, R: CONFIG.fog.radiusMinU, bornAt: w.now, until: w.now + CONFIG.fog.lifeMs });
    expect(w.fogBankCount).toBeGreaterThan(0);
    w.resetForMatchStart();
    expect(w.fogBankCount).toBe(0);
    expect(w.fogBankRecords).toEqual([]);
  });

  it('seedFogBank stores a copy; fogBankRecords is a fresh snapshot; clearFogBanks empties', () => {
    const w = new World(SEED, CONFIG.map.playerCap, CONFIG.zone, { pseudonymSeed: 1 });
    const rec: FogBankRecord = { id: 'fgS', x: 1, y: 2, R: 200, bornAt: 0, until: 1000 };
    w.seedFogBank(rec);
    rec.x = 999;
    expect(w.fogBanks.get('fgS')!.x).toBe(1);
    const snap = w.fogBankRecords as FogBankRecord[];
    snap.length = 0;
    expect(w.fogBankCount).toBe(1);
    w.clearFogBanks();
    expect(w.fogBankCount).toBe(0);
  });
});
