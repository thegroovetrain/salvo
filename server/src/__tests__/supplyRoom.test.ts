// THE SUPPLY-DROP CHART ON THE PUBLIC PLANE (Story 12.4, Eric 2026-11-19,
// epic-12 amendment 5(f)/(g); the radio beacons' Story 10.8 mirror, renamed —
// ported from beaconRoom.test.ts): `ArenaRoom.syncSupplyDrops` mirrors
// `World.supplyChart` onto flat schema scalars — the cycle, the count and each
// live slot's position — state-derived every step with guarded assigns, so a
// late joiner reads the same set and a patch goes out only when something
// public actually changed. The landing time is derived, never a field.
//
// Harness: the reconnect / joiningGuard idiom — a bare `new ArenaRoom()` never
// runs @colyseus/core's __init(), so the test injects the World and a real
// ArenaState and drives the private sync by name.

import { describe, it, expect } from 'vitest';
import { CONFIG, SUPPLY_WIRE_SLOTS, supplyCountFor, supplyCycleStartMs } from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { ArenaState } from '../rooms/schema/ArenaState.js';
import type { SanitizedRoomOptions } from '../rooms/roomOptions.js';
import type { World } from '../game/world.js';
import { DT, bareWorld, captain, openCycle, run } from './worldFixture.js';

const S = CONFIG.supplyDrops;

interface BareRoom {
  world: World;
  state: ArenaState;
  syncSupplyDrops(): void;
  buildWorld(seed: number, sanitized: SanitizedRoomOptions): World;
}

type Slots = Record<string, number>;

/** A room around `w` whose schema state records every write to a supply field. */
function roomFor(w: World): { room: BareRoom; state: ArenaState; writes: string[] } {
  const writes: string[] = [];
  const state = new ArenaState();
  const room = new ArenaRoom() as unknown as BareRoom;
  room.world = w;
  room.state = new Proxy(state, {
    set(target, key, value): boolean {
      if (typeof key === 'string' && key.startsWith('sup')) writes.push(key);
      (target as unknown as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  });
  return { room, state, writes };
}

/** The live slots of a schema state, as the client reads them. */
function slotsOf(state: ArenaState): { x: number; y: number }[] {
  const s = state as unknown as Slots;
  return Array.from({ length: state.supplyCount }, (_, i) => ({ x: s[`sup${i}X`], y: s[`sup${i}Y`] }));
}

describe('ArenaState — the supply-drop fields', () => {
  it('defaults to NO spots, and carries one x / y pair per chart slot — no sink time', () => {
    const state = new ArenaState() as unknown as Slots;
    expect(state.supplyCycle).toBe(-1);
    expect(state.supplyCount).toBe(0);
    for (let i = 0; i < SUPPLY_WIRE_SLOTS; i += 1) {
      expect([state[`sup${i}X`], state[`sup${i}Y`]]).toEqual([0, 0]);
      expect(state[`sup${i}SinkT`]).toBeUndefined();
    }
    expect(state[`sup${SUPPLY_WIRE_SLOTS}X`]).toBeUndefined();
    for (const k of Object.keys(state)) expect(k.startsWith('bcn') || k.startsWith('beacon'), k).toBe(false);
    // The chart can carry every cycle's set.
    for (let c = 0; c < S.counts.length; c += 1) expect(supplyCountFor(c)).toBeLessThanOrEqual(SUPPLY_WIRE_SLOTS);
  });
});

describe('ArenaRoom.syncSupplyDrops — the chart on the schema', () => {
  it('mirrors the cycle, the count and every slot — and a state that joins late reads the same set', () => {
    const w = bareWorld(8000);
    const { room, state } = roomFor(w);
    room.syncSupplyDrops();
    expect([state.supplyCycle, state.supplyCount]).toEqual([-1, 0]); // before the zone clock
    openCycle(w, 0);
    room.syncSupplyDrops();
    const chart = w.supplyChart;
    expect(chart.length).toBeGreaterThan(0);
    expect(state.supplyCycle).toBe(chart[0].cycle);
    expect(state.supplyCount).toBe(chart.length);
    expect(slotsOf(state)).toEqual(chart.map((r) => ({ x: r.x, y: r.y })));
    // The client's clock for this set is derivable from what the schema already carries.
    for (const r of chart) expect(r.cycleStartT).toBe(supplyCycleStartMs(w.zoneStartMs, state.supplyCycle));
    // LATE JOINER: a fresh state synced mid-cycle is the same public set.
    run(w, 40);
    const late = roomFor(w);
    late.room.syncSupplyDrops();
    expect([late.state.supplyCycle, slotsOf(late.state)]).toEqual([state.supplyCycle, slotsOf(state)]);
  });

  it('GUARDED: a step that changes nothing public writes nothing — through the landing instant too', () => {
    const w = bareWorld(8001);
    const { room, writes } = roomFor(w);
    openCycle(w, S.surfaceMs - 3 * DT);
    room.syncSupplyDrops();
    expect(writes.length).toBeGreaterThan(0);
    writes.length = 0;
    const before = w.drops.size;
    for (let i = 0; i < 8; i += 1) {
      w.step();
      room.syncSupplyDrops();
    }
    expect(w.drops.size).toBeGreaterThan(before); // the crates landed in that window...
    expect(writes).toEqual([]); // ...and the schema did not move: the landing is the clock's business
  });

  it('a cycle with no drops CLEARS the chart: cycle -1, count 0', () => {
    const w = bareWorld(8003);
    const { room, state } = roomFor(w);
    openCycle(w, supplyCycleStartMs(0, 1) - DT, S.counts.length - 1); // the last tick of the last cycle with drops
    room.syncSupplyDrops();
    // Placed on that cycle's LAST tick, the ring has closed: the spacing rule
    // may fit fewer than the cycle's count (Story 11.7) — but some are charted.
    expect(state.supplyCount).toBeGreaterThan(0);
    w.step();
    room.syncSupplyDrops();
    expect([state.supplyCycle, state.supplyCount]).toEqual([-1, 0]);
  });
});

describe('ArenaRoom.buildWorld — the supply stream reaches the World', () => {
  const buildWorld = (seed: number, sanitized: SanitizedRoomOptions = {}): World =>
    (new ArenaRoom() as unknown as BareRoom).buildWorld(seed, sanitized);
  const placed = (w: World): { x: number; y: number }[] => {
    openCycle(w, 0);
    return w.supplyChart.map((r) => ({ x: r.x, y: r.y }));
  };

  it("two rooms on the SAME map seed chart DIFFERENT sets (the stream rides the room's private entropy)", () => {
    const a = buildWorld(1234);
    const b = buildWorld(1234);
    expect(a.map).toEqual(b.map);
    const setA = placed(a);
    expect(setA).toHaveLength(supplyCountFor(0));
    expect(placed(b)).not.toEqual(setA);
  });

  it('`matchOverride.supplyDrops: false` (already past the dev gate) switches them off; absent leaves them on', () => {
    expect(placed(buildWorld(77, { matchOverride: { supplyDrops: false } }))).toEqual([]);
    expect(placed(buildWorld(77, { matchOverride: { sandbox: true } })).length).toBe(supplyCountFor(0));
  });

  it('`matchOverride.statRoll: false` rolls nothing on a level; absent rolls', () => {
    const bonusAfterLevels = (sanitized: SanitizedRoomOptions): number => {
      const w = buildWorld(77, sanitized);
      const ship = captain(w, 'a', 0, 0);
      w.grantXp(ship, 60);
      return CONFIG.xp.statRoll.indices.reduce((n, k) => n + ship.indexBonus[k], 0);
    };
    expect(bonusAfterLevels({ matchOverride: { statRoll: false } })).toBe(0);
    expect(bonusAfterLevels({ matchOverride: { sandbox: true } })).toBeGreaterThan(0);
    // only the boolean false disables: junk leaves the shipped die
    expect(bonusAfterLevels({ matchOverride: { statRoll: 'false' as never } })).toBeGreaterThan(0);
  });
});
