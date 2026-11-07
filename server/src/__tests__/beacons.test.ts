// THE RADIO BEACONS — placement and payout (Story 10.8, Eric rulings R2–R4,
// R10, 2026-11-06, epic-10 amendment 14).
//
// What is pinned here is the MECHANISM, read through CONFIG.beacons and the
// shared model (shared/src/sim/beacons.ts) — never one of Eric's numbers:
//   * PLACEMENT: at each ring cycle's start the set is replaced by
//     `beaconCountFor(cycle)` picks on the fleet-anchor rule — inside the live
//     ring less the edge margin, clear of land, outside every captain's
//     keep-out disc, each pick entering the next one's `occupied` — on a
//     ROOM-PRIVATE stream; a cycle with none clears the set.
//   * PAYOUT: nothing while charted; the pot at the shared rate split evenly
//     in integer ms among the afloat hulls in range, the remainder carried;
//     an empty circle accrues nothing; the sink minute falls; gone pays
//     nothing; a sinking hull is not a receiver.
// Damage, the early sink and the kill split live in beaconDamage.test.ts; the
// perception invariants in beaconPerception.test.ts; the schema mirror in
// beaconRoom.test.ts.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  beaconCountFor,
  beaconCycleStartMs,
  beaconStateAt,
  beaconXpMsPerMs,
  type Vec2,
} from '@salvo/shared';
import { World } from '../game/world.js';
import { BeaconField, BEACON_CHART_SLOTS } from '../game/beacons.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance } from '../game/spawn.js';
import { B, DT, GONE_MS, SINK_MS, SURFACE_MS, bareWorld, captain, moveTo, openCycle, run, seatBeacon, xpMsOf } from './beaconFixture.js';

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
/** The first ring cycle with NO beacons (the sudden-death cycle, R2). */
const EMPTY_CYCLE = B.counts.length;
/** XP ms one tick accrues at the full rate (the whole pot). */
const TICK_POT = beaconXpMsPerMs(1) * DT;

// ---------------------------------------------------------------------------
// PLACEMENT
// ---------------------------------------------------------------------------

describe('radio beacons — placement at each ring cycle (R2, R10)', () => {
  it('each cycle with beacons places its CONFIG count inside the live ring less the margin, clear of land and of every keep-out disc', () => {
    for (let cycle = 0; cycle < EMPTY_CYCLE; cycle += 1) {
      const w = new World(4100 + cycle); // the REAL map: land is part of the rule
      const a = w.addShip('a', 'A', 'captain', 'bismarck', undefined, undefined);
      const b = w.addShip('b', 'B', 'captain', 'yamato', undefined, undefined);
      openCycle(w, 0, cycle);
      const chart = w.beaconChart;
      expect(chart.cycle, `cycle ${cycle}`).toBe(cycle);
      expect(chart.cycleStartT).toBe(beaconCycleStartMs(w.zoneStartMs, cycle));
      expect(chart.beacons).toHaveLength(beaconCountFor(cycle));
      const ring = w.zoneLiveRing;
      for (const p of chart.beacons) {
        // The whole paying circle lies inside the ring (R10).
        expect(dist(p, { x: ring.cx, y: ring.cy })).toBeLessThanOrEqual(ring.r - B.edgeMarginU + 1e-6);
        expect(islandClearance(p, w.map.islands)).toBeGreaterThan(SPAWN_ISLAND_CLEARANCE);
        for (const hull of [a, b]) expect(dist(p, hull.state)).toBeGreaterThan(CONFIG.vision.dropout.startU);
        expect(p.sinkT).toBe(0);
      }
    }
  });

  it('a cycle with no beacons CLEARS the set — entered cold, and stepped into from the last cycle that had some', () => {
    const cold = bareWorld(4200);
    openCycle(cold, 0, EMPTY_CYCLE);
    expect(cold.beaconChart).toEqual({ cycle: -1, cycleStartT: 0, beacons: [] });

    const w = bareWorld(4201);
    const cycleMs = beaconCycleStartMs(0, 1);
    openCycle(w, cycleMs - 2 * DT, EMPTY_CYCLE - 1); // two ticks before the boundary
    expect(w.beaconChart.beacons.length).toBeGreaterThan(0);
    run(w, 2);
    expect(w.beaconChart.cycle).toBe(-1);
    expect(w.beaconChart.beacons).toHaveLength(0);
    expect(w.beacons.records).toHaveLength(0);
  });

  it('nothing is placed before the zone clock starts, while XP is off, or with the dev switch off', () => {
    const idle = bareWorld(4300);
    run(idle, 3);
    expect(idle.beaconChart.cycle).toBe(-1);

    const safe = bareWorld(4301);
    safe.xpEnabled = false;
    openCycle(safe, SURFACE_MS + DT);
    expect(safe.beaconChart.beacons).toHaveLength(0);

    const off = bareWorld(4302, { beacons: false });
    const a = captain(off, 'a', 0, 0);
    openCycle(off, SURFACE_MS + DT);
    run(off, 5);
    expect(off.beaconChart).toEqual({ cycle: -1, cycleStartT: 0, beacons: [] });
    expect(a.beaconXpMs).toBe(0);
  });

  it('the stream is ROOM-PRIVATE: one public map seed, two private seeds → two different sets; the same private seed → the same set', () => {
    const place = (pseudonymSeed: number): readonly Vec2[] => {
      const w = bareWorld(4400, { pseudonymSeed });
      openCycle(w, 0);
      return w.beaconChart.beacons.map((p) => ({ x: p.x, y: p.y }));
    };
    const one = place(11);
    expect(place(11)).toEqual(one);
    expect(place(12)).not.toEqual(one);
  });
});

describe('BeaconField.replace — the placement loop', () => {
  const pickFrom = (seen: Vec2[][]) => (rng: { next(): number }, taken: readonly Vec2[]) => {
    seen.push(taken.map((p) => ({ ...p })));
    return { x: rng.next() * 1000, y: rng.next() * 1000, fallback: false };
  };

  it('every pick is handed the beacons ALREADY picked this cycle (each pick enters the next one\'s occupied set)', () => {
    const field = new BeaconField(7);
    const seen: Vec2[][] = [];
    field.replace(0, 1000, pickFrom(seen));
    const placed = field.records.map((b) => ({ x: b.x, y: b.y }));
    expect(placed).toHaveLength(beaconCountFor(0));
    seen.forEach((taken, i) => expect(taken).toEqual(placed.slice(0, i)));
  });

  it('each cycle draws from its OWN stream of the private seed, and a replace drops the previous set whole', () => {
    const field = new BeaconField(7);
    field.replace(0, 0, pickFrom([]));
    const first = field.chart;
    field.replace(1, 5000, pickFrom([]));
    expect(field.chart.cycle).toBe(1);
    expect(field.chart.cycleStartT).toBe(5000);
    expect(field.records).toHaveLength(beaconCountFor(1));
    for (const b of first.beacons) expect(field.chart.beacons).not.toContainEqual(b);
    // The cycle stream is a pure function of (seed, cycle).
    const again = new BeaconField(7);
    again.replace(1, 5000, pickFrom([]));
    expect(again.chart).toEqual(field.chart);
    const other = new BeaconField(8);
    other.replace(1, 5000, pickFrom([]));
    expect(other.chart).not.toEqual(field.chart);
    // ...and never more than the chart can carry.
    expect(field.records.length).toBeLessThanOrEqual(BEACON_CHART_SLOTS);
  });
});

// ---------------------------------------------------------------------------
// PAYOUT
// ---------------------------------------------------------------------------

describe('radio beacons — payout (R3, R4)', () => {
  it('CHARTED pays nothing: a hull parked on a charted beacon earns exactly what a hull far away earns', () => {
    const w = bareWorld(5000);
    const near = captain(w, 'near', 100, 0);
    const far = captain(w, 'far', 0, 1500);
    seatBeacon(w, SURFACE_MS - 40 * DT);
    run(w, 30);
    expect(near.beaconXpMs).toBe(0);
    expect(xpMsOf(near)).toBe(xpMsOf(far));
  });

  it('AFLOAT, ALONE: the one hull in range is paid the whole pot at the shared rate, on top of its passive XP', () => {
    const w = bareWorld(5001);
    const a = captain(w, 'a', B.rangeU - 1, 0); // just inside (the range is inclusive of the centre)
    const out = captain(w, 'out', 0, B.rangeU + 1); // just outside
    seatBeacon(w, SURFACE_MS + 10 * DT);
    const n = 40;
    run(w, n);
    expect(a.beaconXpMs).toBe(Math.floor(n * TICK_POT));
    expect(out.beaconXpMs).toBe(0);
    expect(xpMsOf(a) - xpMsOf(out)).toBe(a.beaconXpMs);
  });

  it('SHARED: n hulls split evenly in whole ms and nothing is lost — paid + carried equals accrued, every tick', () => {
    const w = bareWorld(5002);
    const n = 7; // a count the per-tick pot does not divide by
    const hulls = Array.from({ length: n }, (_, i) => {
      const ang = (i * Math.PI * 2) / n;
      return captain(w, `h${i}`, Math.cos(ang) * 300, Math.sin(ang) * 300, ang);
    });
    const beacon = seatBeacon(w, SURFACE_MS + 10 * DT);
    for (let tick = 1; tick <= 60; tick += 1) {
      w.step();
      const paid = hulls.reduce((sum, h) => sum + h.beaconXpMs, 0);
      expect(paid + beacon.potMs).toBeCloseTo(tick * TICK_POT, 6);
      expect(beacon.potMs).toBeLessThan(n); // only the indivisible remainder waits
      for (const h of hulls) {
        expect(Number.isInteger(h.beaconXpMs)).toBe(true);
        expect(h.beaconXpMs).toBe(hulls[0].beaconXpMs);
      }
    }
    expect(hulls[0].beaconXpMs).toBeGreaterThan(0);
  });

  it('an EMPTY circle accrues nothing — the first arrival gets one tick\'s pot, never a jackpot — and LEAVING keeps what was banked', () => {
    const w = bareWorld(5003);
    const a = captain(w, 'a', 0, 1500);
    const beacon = seatBeacon(w, SURFACE_MS + 10 * DT);
    run(w, 100); // afloat and paying nobody
    expect(beacon.potMs).toBe(0);
    moveTo(a, 200, 0);
    w.step();
    expect(a.beaconXpMs).toBe(Math.floor(TICK_POT));
    run(w, 9);
    const banked = a.beaconXpMs;
    expect(banked).toBe(Math.floor(10 * TICK_POT));
    moveTo(a, 0, 1500);
    const before = xpMsOf(a);
    run(w, 10);
    expect(a.beaconXpMs).toBe(banked);
    expect(xpMsOf(a) - before).toBe(10 * DT); // passive only
    expect(beacon.potMs).toBe(0); // and the circle is empty again
  });

  it('the SINK MINUTE falls to nothing and GONE pays nothing: one hull through a whole natural life is paid the shared model\'s integral', () => {
    const w = bareWorld(5004);
    const a = captain(w, 'a', 150, 0);
    const seatedAt = SURFACE_MS - 5 * DT;
    seatBeacon(w, seatedAt);
    /** [ms into the cycle, XP ms paid that tick] */
    const gains: [number, number][] = [];
    let last = 0;
    for (let into = seatedAt + DT; into <= GONE_MS + 20 * DT; into += DT) {
      w.step();
      gains.push([into, a.beaconXpMs - last]);
      last = a.beaconXpMs;
    }
    // Once the sink has begun the per-tick pay only falls (+1: the carried
    // sub-ms fraction can land a whole ms late), and after it there is none.
    const sinking = gains.filter(([into]) => into > SINK_MS && into <= GONE_MS).map(([, g]) => g);
    sinking.forEach((g, i) => expect(g).toBeLessThanOrEqual((sinking[i - 1] ?? Math.ceil(TICK_POT)) + 1));
    expect(sinking[sinking.length - 1]).toBeLessThan(sinking[0]);
    expect(gains.filter(([into]) => into > GONE_MS).every(([, g]) => g === 0)).toBe(true);
    // The whole life: the full rate over the float, half of it over the linear sink.
    const natural = beaconXpMsPerMs(1) * (B.floatMs + B.sinkMs / 2);
    expect(a.beaconXpMs).toBeGreaterThan(natural - 1);
    expect(a.beaconXpMs).toBeLessThanOrEqual(natural);
    // ...and the rate it was paid at is the shared model's, mid-sink included.
    const mid = SINK_MS + B.sinkMs / 2;
    expect(beaconStateAt(mid, 0, 0).rate01).toBeCloseTo(0.5, 9);
  });

  it('a SINKING hull is not a receiver: it is paid nothing, and the afloat hull beside it takes the whole pot', () => {
    const w = bareWorld(5005);
    const a = captain(w, 'a', 200, 0);
    const b = captain(w, 'b', -200, 0);
    seatBeacon(w, SURFACE_MS + 10 * DT);
    run(w, 10);
    expect(a.beaconXpMs).toBe(b.beaconXpMs);
    const [aBefore, bBefore] = [a.beaconXpMs, b.beaconXpMs];
    w.sinkShip('b');
    run(w, 10);
    expect(b.beaconXpMs).toBe(bBefore);
    expect(a.beaconXpMs - aBefore).toBeGreaterThanOrEqual(Math.floor(10 * TICK_POT) - 1);
  });

  it('a level a beacon banks behaves as a passive one: the level rises and the hull\'s own `pt` fires', () => {
    const w = bareWorld(5006);
    const a = captain(w, 'a', 200, 0);
    seatBeacon(w, SURFACE_MS + 10 * DT);
    a.xpMs = CONFIG.xp.levelMs - Math.floor(TICK_POT); // one beacon tick short of a level it would not reach passively this tick
    expect(DT).toBeLessThan(Math.floor(TICK_POT));
    w.step();
    expect(a.level).toBe(1);
    expect(w.tickEvents.filter((e) => e.k === 'pt')).toEqual([{ k: 'pt', id: 'a' }]);
  });

  it('HARNESS: hulls-in-range is counted per beacon per paying tick, and never while charted', () => {
    const w = bareWorld(5007);
    captain(w, 'a', 200, 0);
    captain(w, 'b', -200, 0);
    const beacon = seatBeacon(w, SURFACE_MS - 5 * DT);
    run(w, 5); // still charted (the tick ON the surface instant accrued over a charted interval)
    expect(beacon.inRangeTicks).toEqual([]);
    run(w, 12);
    expect(beacon.inRange).toBe(2);
    expect(beacon.inRangeTicks[2]).toBe(12);
    // The field's own tally is every beacon's: the far ones had nobody.
    expect(w.beacons.inRangeTicks[2]).toBe(12);
    expect(w.beacons.inRangeTicks[0]).toBe(12 * (w.beacons.records.length - 1));
  });
});
