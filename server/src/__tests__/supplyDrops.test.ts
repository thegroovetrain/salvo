// THE SUPPLY DROPS — charting, landing and the scatter (Story 12.4, Eric
// 2026-11-19, epic-12 amendment 5(f); the placement half ported from Story
// 10.8 / 11.7's beacons.test.ts — "Same spawn characteristics").
//
// What is pinned here is the MECHANISM, read through CONFIG.supplyDrops and
// the shared timing model (shared/src/sim/supplyDrops.ts) — never one of
// Eric's numbers:
//   * CHARTING (random since Eric 2026-11-15, Story 11.7): at each ring
//     cycle's start the chart is replaced by `supplyCountFor(cycle)` uniformly
//     random picks (`pickSupplySpot`) — inside the live ring less the edge
//     margin, clear of land, `minSpacingFrac` × the radius apart (hard rules),
//     outside every captain's keep-out disc (soft: relaxed, then skipped, both
//     logged) — on a ROOM-PRIVATE stream; a skipped pick keeps slots dense; a
//     cycle with none clears the chart.
//   * LANDING: at cycleStart + surfaceMs every charted spot drops `crates`
//     ordinary XP crates within `scatterU` of it, clear of land, never
//     overlapping, on a private per-(cycle, spot) stream; a crate with no
//     room is skipped and logged.
// The schema mirror lives in supplyRoom.test.ts; the perception invariants in
// supplyPerception.test.ts.

import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  SUPPLY_WIRE_SLOTS,
  mulberry32,
  supplyCountFor,
  supplyCycleStartMs,
  supplyLandMs,
  type Rng,
  type Vec2,
} from '@salvo/shared';
import { World } from '../game/world.js';
import { SupplyField, scatterSupplyCrates, type SupplyChartRow } from '../game/supplyDrops.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance, pickSupplySpot } from '../game/spawn.js';
import { circleIsland } from './islandFixture.js';
import { DT, bareWorld, openCycle, run, seatSupply } from './worldFixture.js';
import { offlineDispersionKey } from '../game/dispersionKey.js';

const S = CONFIG.supplyDrops;
/** A distinct 32-byte room key per `n` (the offline derivation — any fixed bytes would do). */
const key = (n: number): Buffer => offlineDispersionKey(0, n);
const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
/** The first ring cycle with NO drops (the sudden-death cycle). */
const EMPTY_CYCLE = S.counts.length;
/** The supply crates on the water (ids `sup-<cycle>-<spot>-<n>`). */
const supplyCrates = (w: World) => [...w.drops.values()].filter((d) => d.id.startsWith('sup-'));

// ---------------------------------------------------------------------------
// CHARTING
// ---------------------------------------------------------------------------

describe('supply drops — charting at each ring cycle (the beacon placement, kept)', () => {
  it('each cycle with drops charts its CONFIG count inside the live ring less the margin, clear of land and of every keep-out disc', () => {
    for (let cycle = 0; cycle < EMPTY_CYCLE; cycle += 1) {
      const w = new World(4100 + cycle); // the REAL map: land is part of the rule
      const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
      const b = w.addShip('b', 'B', 'captain', 'yamato', undefined, undefined);
      openCycle(w, 0, cycle);
      const chart = w.supplyChart;
      expect(chart, `cycle ${cycle}`).toHaveLength(supplyCountFor(cycle));
      const ring = w.zoneLiveRing;
      chart.forEach((p, i) => {
        expect(p.cycle).toBe(cycle);
        expect(p.spot).toBe(i);
        expect(p.cycleStartT).toBe(supplyCycleStartMs(w.zoneStartMs, cycle));
        expect(dist(p, { x: ring.cx, y: ring.cy })).toBeLessThanOrEqual(ring.r - S.edgeMarginU + 1e-6);
        expect(islandClearance(p, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
        for (const hull of [a, b]) expect(dist(p, hull.state)).toBeGreaterThan(S.keepOutU);
        for (const q of chart.slice(i + 1)) expect(dist(p, q)).toBeGreaterThanOrEqual((ring.r - S.edgeMarginU) * S.minSpacingFrac);
      });
    }
  });

  it('a FULL lobby at cycle 0 on the real map gets its whole count, every rule held (Story 11.7)', () => {
    for (const seed of [4200, 4201, 4202]) {
      const w = new World(seed);
      const hulls = Array.from({ length: CONFIG.map.playerCap }, (_, i) =>
        w.addShip(`c${i}`, `C${i}`, 'captain', i % 2 === 0 ? 'bismarck' : 'yamato', undefined, undefined),
      );
      openCycle(w, 0, 0);
      const chart = w.supplyChart;
      expect(chart, `seed ${seed}`).toHaveLength(supplyCountFor(0));
      const ring = w.zoneLiveRing;
      chart.forEach((p, i) => {
        expect(dist(p, { x: ring.cx, y: ring.cy })).toBeLessThanOrEqual(ring.r - S.edgeMarginU);
        expect(islandClearance(p, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
        for (const h of hulls) expect(dist(p, h.state)).toBeGreaterThan(S.keepOutU);
        for (const q of chart.slice(i + 1)) expect(dist(p, q)).toBeGreaterThanOrEqual((ring.r - S.edgeMarginU) * S.minSpacingFrac);
      });
    }
  });

  it('a cycle with no drops CLEARS the chart — entered cold, and stepped into from the last cycle that had some', () => {
    const cold = bareWorld(4200);
    openCycle(cold, 0, EMPTY_CYCLE);
    expect(cold.supplyChart).toEqual([]);

    const w = bareWorld(4201);
    openCycle(w, supplyCycleStartMs(0, 1) - 2 * DT, EMPTY_CYCLE - 1); // two ticks before the boundary
    expect(w.supplyChart.length).toBeGreaterThan(0);
    run(w, 2);
    expect(w.supplyChart).toEqual([]);
  });

  it('nothing is charted before the zone clock starts, while XP is off, or with the switch off', () => {
    const idle = bareWorld(4300);
    run(idle, 3);
    expect(idle.supplyChart).toEqual([]);

    const safe = bareWorld(4301);
    safe.xpEnabled = false;
    openCycle(safe, S.surfaceMs + DT);
    expect(safe.supplyChart).toEqual([]);
    expect(supplyCrates(safe)).toEqual([]);

    const off = bareWorld(4302, { supplyDrops: false });
    openCycle(off, S.surfaceMs + DT);
    run(off, 5);
    expect(off.supplyChart).toEqual([]);
    expect(supplyCrates(off)).toEqual([]);
  });

  it('the stream is ROOM-PRIVATE: one public map seed, two private seeds → two different charts; the same private seed → the same chart', () => {
    const place = (pseudonymSeed: number): readonly Vec2[] => {
      const w = bareWorld(4400, { pseudonymSeed });
      openCycle(w, 0);
      return w.supplyChart.map((p) => ({ x: p.x, y: p.y }));
    };
    const one = place(11);
    expect(place(11)).toEqual(one);
    expect(place(12)).not.toEqual(one);
  });

  it('the chart is KEYED by the room key, not by the pseudonym material: same map seed + same pseudonym seed, another dispersion key → another chart', () => {
    const place = (dispersionKey: Buffer): readonly Vec2[] => {
      const w = bareWorld(4400, { pseudonymSeed: 11, dispersionKey });
      openCycle(w, 0);
      return w.supplyChart.map((p) => ({ x: p.x, y: p.y }));
    };
    const one = place(key(1));
    expect(one.length).toBeGreaterThan(0);
    expect(place(key(1))).toEqual(one);
    expect(place(key(2))).not.toEqual(one);
  });
});

describe('pickSupplySpot — one random spot (Story 11.7)', () => {
  /** A stream that hands out `draws` in order, then repeats the last one. */
  const scripted = (draws: readonly number[]): Rng => {
    let i = 0;
    const next = (): number => draws[Math.min(i++, draws.length - 1)];
    return { next, float: (lo, hi) => lo + next() * (hi - lo), int: (lo) => lo, pick: (arr) => arr[0] };
  };
  /** The (r, angle) draws that land a spot at polar (frac of radius, turns). */
  const at = (frac: number, turns: number): number[] => [frac * frac, turns];
  const SPACING = 1000; // the picker takes an absolute spacing (World scales `minSpacingFrac` by the radius)
  const cfg = { keepOutU: S.keepOutU, minSpacingU: SPACING, placeAttempts: S.placeAttempts };
  const R = 4 * (S.keepOutU + SPACING); // a disc with room for every case below
  const O = { x: 0, y: 0 };

  it('happy path: the first draw clearing every rule wins, float32-exact, inside the disc', () => {
    const spot = pickSupplySpot(O, R, [], [], [], cfg, mulberry32(5));
    expect(spot).not.toBeNull();
    expect(spot!.keepOutRelaxed).toBe(false);
    expect([spot!.x, spot!.y]).toEqual([Math.fround(spot!.x), Math.fround(spot!.y)]);
    expect(dist(spot!, O)).toBeLessThanOrEqual(R + 1e-3);
  });

  it('skips draws on land, inside a captain disc, and short of the spacing, and takes the next good one', () => {
    const land = { x: R / 2, y: 0 };
    const captain = { x: -R / 2, y: 0 };
    const taken = { x: 0, y: R / 2 };
    const rng = scripted([...at(0.5, 0), ...at(0.5, 0.5), ...at(0.5, 0.25), ...at(0.5, 0.75)]);
    const spot = pickSupplySpot(O, R, [circleIsland(land.x, land.y, 40)], [taken], [captain], cfg, rng);
    expect(spot!.keepOutRelaxed).toBe(false);
    expect(spot!.x).toBeCloseTo(0, 3);
    expect(spot!.y).toBeCloseTo(-R / 2, 3);
  });

  it('spacing is a floor: a spot exactly the spacing from a taken one is allowed', () => {
    const taken = { x: 0, y: 0 };
    const spot = pickSupplySpot(O, SPACING, [], [taken], [], cfg, scripted(at(1, 0)));
    expect(spot).not.toBeNull();
    expect(dist(spot!, taken)).toBeGreaterThanOrEqual(SPACING - 1e-3);
  });

  it('captains crowd the disc: the FIRST draw that met the hard rules is taken, flagged relaxed', () => {
    const r = S.keepOutU / 2;
    const rng = scripted([...at(0.25, 0), ...at(0.5, 0.5)]);
    const spot = pickSupplySpot(O, r, [], [], [O], cfg, rng);
    expect(spot!.keepOutRelaxed).toBe(true);
    expect(spot!.x).toBeCloseTo(r * 0.25, 3);
    expect(spot!.y).toBeCloseTo(0, 3);
  });

  it('no draw meets the hard rules (the spacing fills the disc): null, never a bad spot', () => {
    expect(pickSupplySpot(O, SPACING / 2, [], [O], [], cfg, mulberry32(9))).toBeNull();
  });

  it('a domain radius at or below zero is null at once, never a throw', () => {
    expect(pickSupplySpot(O, 0, [], [], [], cfg, mulberry32(1))).toBeNull();
    expect(pickSupplySpot(O, -S.edgeMarginU, [], [], [], cfg, mulberry32(1))).toBeNull();
  });

  it('draws only `placeAttempts` times before giving up', () => {
    let draws = 0;
    const rng = mulberry32(3);
    const counted: Rng = { ...rng, next: () => (draws++, rng.next()) };
    pickSupplySpot(O, SPACING / 2, [], [O], [], cfg, counted);
    expect(draws).toBe(2 * S.placeAttempts);
  });
});

describe('SupplyField.replace — the charting loop', () => {
  const pickFrom = (seen: Vec2[][]) => (rng: { next(): number }, taken: readonly Vec2[]) => {
    seen.push(taken.map((p) => ({ ...p })));
    return { x: rng.next() * 1000, y: rng.next() * 1000 };
  };

  it('a null pick is SKIPPED: the chart is shorter and the slots stay dense', () => {
    const field = new SupplyField(key(7));
    let n = 0;
    field.replace(0, 1000, (rng, taken) => (n++ === 1 ? null : pickFrom([])(rng, taken)));
    expect(field.chart).toHaveLength(supplyCountFor(0) - 1);
    field.chart.forEach((r, i) => expect([r.cycle, r.spot, r.cycleStartT]).toEqual([0, i, 1000]));
  });

  it("every pick is handed the spots ALREADY picked this cycle (each pick enters the next one's occupied set)", () => {
    const field = new SupplyField(key(7));
    const seen: Vec2[][] = [];
    field.replace(0, 1000, pickFrom(seen));
    const placed = field.chart.map((r) => ({ x: r.x, y: r.y }));
    expect(placed).toHaveLength(supplyCountFor(0));
    seen.forEach((taken, i) => expect(taken).toEqual(placed.slice(0, i)));
  });

  it('every charted coordinate is FLOAT32-EXACT (the schema carries float32)', () => {
    const field = new SupplyField(key(7));
    field.replace(0, 1000, pickFrom([]));
    expect(field.chart.length).toBeGreaterThan(0);
    for (const r of field.chart) expect([r.x, r.y]).toEqual([Math.fround(r.x), Math.fround(r.y)]);
  });

  it('a runtime count past the wire capacity is clamped to SUPPLY_WIRE_SLOTS LOUDLY (a warn line), never silently', () => {
    const cfg = { ...S, counts: [SUPPLY_WIRE_SLOTS + 2] };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const field = new SupplyField(key(7), cfg);
      field.replace(0, 1000, pickFrom([]));
      expect(field.chart).toHaveLength(SUPPLY_WIRE_SLOTS);
      expect(log.mock.calls.some(([line]) => String(line).includes('supplyDrops.count_clamped'))).toBe(true);
    } finally {
      log.mockRestore();
    }
  });

  it('each cycle draws from its OWN stream of the private seed, and a replace drops the previous chart whole', () => {
    const field = new SupplyField(key(7));
    field.replace(0, 0, pickFrom([]));
    const first = field.chart;
    field.replace(1, 5000, pickFrom([]));
    expect(field.cycle).toBe(1);
    expect(field.chart).toHaveLength(supplyCountFor(1));
    for (const r of field.chart) expect([r.cycle, r.cycleStartT]).toEqual([1, 5000]);
    for (const r of first) expect(field.chart.some((q) => q.x === r.x && q.y === r.y)).toBe(false);
    // The cycle stream is a pure function of (seed, cycle).
    const again = new SupplyField(key(7));
    again.replace(1, 5000, pickFrom([]));
    expect(again.chart).toEqual(field.chart);
    const other = new SupplyField(key(8));
    other.replace(1, 5000, pickFrom([]));
    expect(other.chart).not.toEqual(field.chart);
  });
});

// ---------------------------------------------------------------------------
// THE LANDING SCATTER
// ---------------------------------------------------------------------------

describe('scatterSupplyCrates — the landing scatter (AC 21)', () => {
  const row: SupplyChartRow = { cycle: 1, spot: 2, x: Math.fround(123.5), y: Math.fround(-321.25), cycleStartT: 0 };
  const R = CONFIG.drops.radiusU;

  it('drops `crates` points within `scatterU` of the spot, float32-exact, never overlapping, with ids sup-<cycle>-<spot>-<n>', () => {
    const crates = scatterSupplyCrates(key(11), row, []);
    expect(crates).toHaveLength(S.crates);
    crates.forEach((c, i) => {
      expect(c.id).toBe(`sup-${row.cycle}-${row.spot}-${i}`);
      expect([c.x, c.y]).toEqual([Math.fround(c.x), Math.fround(c.y)]);
      expect(dist(c, row)).toBeLessThanOrEqual(S.scatterU);
      for (const d of crates.slice(i + 1)) expect(dist(c, d)).toBeGreaterThanOrEqual(2 * R);
    });
  });

  it('follows its dials: another crate count and another radius', () => {
    const cfg = { ...S, crates: 3, scatterU: 60 };
    const crates = scatterSupplyCrates(key(11), row, [], cfg);
    expect(crates).toHaveLength(3);
    for (const c of crates) expect(dist(c, row)).toBeLessThanOrEqual(60);
  });

  it('never lands on land: a spot beside an island keeps every crate clear of it', () => {
    const island = circleIsland(row.x + S.scatterU / 2, row.y, S.scatterU / 3);
    const crates = scatterSupplyCrates(key(11), row, [island]);
    expect(crates.length).toBeGreaterThan(0);
    for (const c of crates) expect(islandClearance(c, [island])).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
  });

  it('a crate with no room is SKIPPED and LOGGED after `placeAttempts`, never thrown', () => {
    const island = circleIsland(row.x, row.y, S.scatterU * 3); // the whole disc is land
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(scatterSupplyCrates(key(11), row, [island])).toEqual([]);
      const skips = log.mock.calls.filter(([line]) => String(line).includes('supplyDrops.crateSkipped'));
      expect(skips).toHaveLength(S.crates);
    } finally {
      log.mockRestore();
    }
  });

  it('is deterministic per (seed, cycle, spot), and each key has its own stream', () => {
    const one = scatterSupplyCrates(key(11), row, []);
    expect(scatterSupplyCrates(key(11), row, [])).toEqual(one);
    const pos = (cs: { x: number; y: number }[]) => cs.map((c) => [c.x - row.x, c.y - row.y]);
    expect(pos(scatterSupplyCrates(key(12), row, []))).not.toEqual(pos(one));
    expect(pos(scatterSupplyCrates(key(11), { ...row, spot: 3 }, []))).not.toEqual(pos(one));
    expect(pos(scatterSupplyCrates(key(11), { ...row, cycle: 2 }, []))).not.toEqual(pos(one));
  });

  it('never overlaps a crate already on the water (`occupied`)', () => {
    // A ring of occupied crates hemming the spot: every new crate keeps 2 × radiusU from each.
    const occupied = Array.from({ length: 12 }, (_, i) => ({
      x: row.x + Math.cos(i) * S.scatterU * 0.6,
      y: row.y + Math.sin(i) * S.scatterU * 0.6,
    }));
    occupied.push({ x: row.x, y: row.y });
    const crates = scatterSupplyCrates(key(11), row, [], S, R, occupied);
    expect(crates.length).toBeGreaterThan(0);
    for (const c of crates) for (const o of occupied) expect(dist(c, o)).toBeGreaterThanOrEqual(2 * R);
  });
});

describe('SupplyField.land — no two crate centres closer than 2 × radiusU (AC 21)', () => {
  it('two spots with OVERLAPPING scatter circles plus crates already on the water: every pair of centres keeps 2 × radiusU', () => {
    const R = CONFIG.drops.radiusU;
    const field = new SupplyField(key(5));
    const spots = [
      { x: 0, y: 0 },
      { x: S.scatterU * 0.5, y: 0 }, // the two scatter discs overlap over most of their area
    ];
    field.replace(0, 0, (_rng, taken) => spots[taken.length] ?? null);
    expect(field.chart).toHaveLength(2);
    // Crates on the water inside both discs (minute crates, a wreck, an earlier set).
    const onWater = Array.from({ length: 10 }, (_, i) => ({
      x: S.scatterU * 0.25 + Math.cos(i * 0.7) * S.scatterU * 0.5,
      y: Math.sin(i * 0.7) * S.scatterU * 0.5,
    }));
    const landed: Vec2[] = [];
    expect(field.land(supplyLandMs(0), [], onWater, (c) => landed.push(c))).toBe(true);
    expect(landed.length).toBeGreaterThan(S.crates); // both spots placed crates
    const all = [...onWater, ...landed];
    for (const c of landed) {
      for (const o of all) if (o !== c) expect(dist(c, o)).toBeGreaterThanOrEqual(2 * R);
    }
  });
});

describe('supply drops — the chart lifecycle in the World', () => {
  it('charted at the cycle start, nothing on the water until cycleStart + surfaceMs, then `crates` XP crates per spot — once', () => {
    const w = bareWorld(4500, { drops: false });
    openCycle(w, 0);
    const chart = w.supplyChart;
    expect(chart.length).toBeGreaterThan(0);
    const landT = supplyLandMs(chart[0].cycleStartT);
    while (w.now + DT < landT) {
      w.step();
      expect(supplyCrates(w)).toEqual([]);
    }
    w.step(); // the landing tick
    expect(w.now).toBe(landT);
    const crates = supplyCrates(w);
    expect(crates).toHaveLength(chart.length * S.crates);
    for (const c of crates) expect(c.kind).toBe('xp');
    for (const spot of chart) {
      const mine = crates.filter((c) => c.id.startsWith(`sup-${spot.cycle}-${spot.spot}-`));
      expect(mine).toHaveLength(S.crates);
      for (const c of mine) expect(dist(c, spot)).toBeLessThanOrEqual(S.scatterU);
    }
    expect(w.supplyChart).toBe(chart); // the chart stays until the next cycle (the mark's fade is the client's)
    run(w, 5);
    expect(supplyCrates(w)).toHaveLength(crates.length); // a set lands once
  });

  it('a directed spot lands its crates exactly around it', () => {
    const w = bareWorld(4501, { drops: false });
    const spot = { x: 600, y: -200 };
    seatSupply(w, S.surfaceMs - DT, [spot]);
    w.step();
    const crates = supplyCrates(w);
    expect(crates).toHaveLength(S.crates);
    for (const c of crates) expect(dist(c, spot)).toBeLessThanOrEqual(S.scatterU);
  });
});
