// THE RADIO BEACONS ON THE PUBLIC PLANE (Story 10.8, Eric 2026-11-06, R2 / R9,
// epic-10 amendment 14): `ArenaRoom.syncBeacons` mirrors `World.beaconChart`
// onto flat schema scalars — the cycle, the count, and each live slot's
// position and EARLY sink time — state-derived every step with guarded
// assigns, so a late joiner reads the same set and a patch goes out only when
// something public actually changed.
//
// Harness: the reconnect / joiningGuard idiom — a bare `new ArenaRoom()` never
// runs @colyseus/core's __init(), so the test injects the World and a real
// ArenaState and drives the private sync by name.

import { describe, it, expect } from 'vitest';
import { BEACON_WIRE_SLOTS, beaconCountFor, beaconCycleStartMs } from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { ArenaState } from '../rooms/schema/ArenaState.js';
import type { SanitizedRoomOptions } from '../rooms/roomOptions.js';
import type { World } from '../game/world.js';
import { B, DT, SINK_MS, SURFACE_MS, bareWorld, openCycle, run } from './beaconFixture.js';

interface BareRoom {
  world: World;
  state: ArenaState;
  syncBeacons(): void;
  buildWorld(seed: number, sanitized: SanitizedRoomOptions): World;
}

type Slots = Record<string, number>;

/** A room around `w` whose schema state records every write to a beacon field. */
function roomFor(w: World): { room: BareRoom; state: ArenaState; writes: string[] } {
  const writes: string[] = [];
  const state = new ArenaState();
  const room = new ArenaRoom() as unknown as BareRoom;
  room.world = w;
  room.state = new Proxy(state, {
    set(target, key, value): boolean {
      if (typeof key === 'string' && (key.startsWith('bcn') || key.startsWith('beacon'))) writes.push(key);
      (target as unknown as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  });
  return { room, state, writes };
}

/** The live slots of a schema state, as the client reads them. */
function slotsOf(state: ArenaState): { x: number; y: number; sinkT: number }[] {
  const s = state as unknown as Slots;
  return Array.from({ length: state.beaconCount }, (_, i) => ({ x: s[`bcn${i}X`], y: s[`bcn${i}Y`], sinkT: s[`bcn${i}SinkT`] }));
}

describe('ArenaState — the beacon fields', () => {
  it('defaults to NO beacons, and carries one x / y / sinkT triple per chart slot', () => {
    const state = new ArenaState() as unknown as Slots;
    expect(state.beaconCycle).toBe(-1);
    expect(state.beaconCount).toBe(0);
    for (let i = 0; i < BEACON_WIRE_SLOTS; i += 1) {
      expect([state[`bcn${i}X`], state[`bcn${i}Y`], state[`bcn${i}SinkT`]]).toEqual([0, 0, 0]);
    }
    expect(state[`bcn${BEACON_WIRE_SLOTS}X`]).toBeUndefined();
    // The chart can carry every cycle's set.
    for (let c = 0; c < B.counts.length; c += 1) expect(beaconCountFor(c)).toBeLessThanOrEqual(BEACON_WIRE_SLOTS);
  });
});

describe('ArenaRoom.syncBeacons — the chart on the schema', () => {
  it('mirrors the cycle, the count and every slot — and a state that joins late reads the same set', () => {
    const w = bareWorld(8000);
    const { room, state } = roomFor(w);
    room.syncBeacons();
    expect([state.beaconCycle, state.beaconCount]).toEqual([-1, 0]); // before the zone clock
    openCycle(w, 0);
    room.syncBeacons();
    const chart = w.beaconChart;
    expect(state.beaconCycle).toBe(chart.cycle);
    expect(state.beaconCount).toBe(chart.beacons.length);
    expect(slotsOf(state)).toEqual(chart.beacons.map((b) => ({ x: b.x, y: b.y, sinkT: 0 })));
    // The client's clock for this set is derivable from what the schema already carries.
    expect(chart.cycleStartT).toBe(beaconCycleStartMs(w.zoneStartMs, state.beaconCycle));
    // LATE JOINER: a fresh state synced mid-cycle is the same public set.
    run(w, 40);
    const late = roomFor(w);
    late.room.syncBeacons();
    expect([late.state.beaconCycle, slotsOf(late.state)]).toEqual([state.beaconCycle, slotsOf(state)]);
  });

  it('GUARDED: a step that changes nothing public writes nothing — through the surface instant and the natural sink alike', () => {
    const w = bareWorld(8001);
    const { room, writes } = roomFor(w);
    openCycle(w, SURFACE_MS - 3 * DT);
    room.syncBeacons();
    expect(writes.length).toBeGreaterThan(0);
    writes.length = 0;
    for (let i = 0; i < 8; i += 1) {
      w.step();
      room.syncBeacons();
    }
    expect(w.beacons.phaseOf(w.beacons.records[0], w.now)).toBe('afloat');
    expect(writes).toEqual([]);
    // ...and the natural sink is the clock's business, not a schema write: sinkT stays 0.
    run(w, (SINK_MS - SURFACE_MS) / DT);
    room.syncBeacons();
    expect(w.beacons.phaseOf(w.beacons.records[0], w.now)).toBe('sinking');
    expect(writes).toEqual([]);
  });

  it('an EARLY sink is public (R9): destroying a beacon writes that slot\'s sink time, and only it', () => {
    const w = bareWorld(8002);
    const { room, state, writes } = roomFor(w);
    openCycle(w, SURFACE_MS + DT);
    room.syncBeacons();
    writes.length = 0;
    const victim = w.beacons.records[2];
    w.damageBeacon(victim.id, B.hp * 10, 'shell', undefined);
    expect(victim.sinkT).toBe(w.now);
    room.syncBeacons();
    expect(writes).toEqual([`bcn${victim.slot}SinkT`]);
    expect(slotsOf(state).map((s) => s.sinkT)).toEqual(w.beacons.records.map((b) => (b === victim ? w.now : 0)));
  });

  it('a cycle with no beacons CLEARS the chart: cycle -1, count 0', () => {
    const w = bareWorld(8003);
    const { room, state } = roomFor(w);
    openCycle(w, beaconCycleStartMs(0, 1) - DT, B.counts.length - 1); // the last tick of the last cycle with beacons
    room.syncBeacons();
    expect(state.beaconCount).toBe(beaconCountFor(B.counts.length - 1));
    w.step();
    room.syncBeacons();
    expect([state.beaconCycle, state.beaconCount]).toEqual([-1, 0]);
  });
});

describe('ArenaRoom.buildWorld — the beacon stream and the dev switch reach the World', () => {
  const buildWorld = (seed: number, sanitized: SanitizedRoomOptions = {}): World =>
    (new ArenaRoom() as unknown as BareRoom).buildWorld(seed, sanitized);
  const placed = (w: World): { x: number; y: number }[] => {
    openCycle(w, 0);
    return w.beaconChart.beacons.map((b) => ({ x: b.x, y: b.y }));
  };

  it('two rooms on the SAME map seed place DIFFERENT sets (the stream rides the room\'s private entropy)', () => {
    const a = buildWorld(1234);
    const b = buildWorld(1234);
    expect(a.map).toEqual(b.map);
    const setA = placed(a);
    expect(setA).toHaveLength(beaconCountFor(0));
    expect(placed(b)).not.toEqual(setA);
  });

  it('`matchOverride.beacons: false` (already past the dev gate) switches them off; absent leaves them on', () => {
    expect(placed(buildWorld(77, { matchOverride: { beacons: false } }))).toEqual([]);
    expect(placed(buildWorld(77, { matchOverride: { sandbox: true } })).length).toBe(beaconCountFor(0));
  });
});
