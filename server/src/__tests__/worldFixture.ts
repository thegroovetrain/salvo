// TEST FIXTURE (Story 12.4 — the generic half of Story 10.8's beaconFixture,
// moved when the radio beacons were deleted): a World on open water with
// captains at exact poses, and the zone clock anchored where a case needs it,
// without stepping real minutes to get there.
//
// Two ways into a ring cycle:
//   * `openCycle` — the REAL path: the zone clock is anchored in the past so
//     the next step's `placeSupplyDrops` row charts the cycle's set by the
//     production rule (private stream, live ring, keep-out discs);
//   * `seatSupply` — the DIRECTED path: the field's own `replace` is called
//     with a pick that hands out the test's positions, so a spot sits exactly
//     where a case needs it. The cycle clock is still the zone clock, so the
//     landing row reads the same timing production does.
// Every time below is read off CONFIG.supplyDrops / CONFIG.zone.

import { CONFIG, supplyCycleStartMs, type InputMsg, type ShipClassId, type Vec2, type ZoneTimeline } from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import type { SupplyChart } from '../game/supplyDrops.js';
import { flatRaster } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';

export const DT = CONFIG.tick.simDtMs;

/** Open water: no islands, flat raster (nothing shadows, nothing blocks). */
export function bareWorld(seed = 1008, opts?: WorldOptions, zoneCfg: ZoneTimeline = CONFIG.zone): World {
  const w = new World(seed, CONFIG.map.playerCap, zoneCfg, opts);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A captain on the NEUTRAL index (every index at the base — the gate's
 *  arithmetic reads exact figures), parked at an exact pose. */
export function captain(w: World, id: string, x: number, y: number, heading = 0, hull?: ShipClassId): ShipRecord {
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined));
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** Teleport a hull (speed 0, heading kept). */
export function moveTo(rec: ShipRecord, x: number, y: number): void {
  rec.state = { x, y, heading: rec.state.heading, speed: 0 };
}

/** One well-formed input; `seq` must rise per ship. */
export function inp(seq: number, o: Partial<InputMsg> = {}): InputMsg {
  return { seq, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...o };
}

/**
 * THE REAL PATH: anchor the zone clock so that AFTER ONE STEP the world is
 * `intoMs` into ring cycle `cycle`, then take that step — `placeSupplyDrops`
 * charts the set by the production rule. (`startZone` is idempotent, so call
 * this once per World.)
 */
export function openCycle(w: World, intoMs: number, cycle = 0, zoneCfg: ZoneTimeline = CONFIG.zone): void {
  // The shared model's own cycle start: cycle c begins `c` ring groups in.
  w.startZone(w.now + DT - intoMs - supplyCycleStartMs(0, cycle, zoneCfg));
  w.step();
}

/**
 * THE DIRECTED PATH: cycle 0's chart with its spots at `at`, the world
 * `intoMs` into the cycle right now (the zone clock anchored to match). No
 * step is taken. Returns the chart.
 */
export function seatSupply(w: World, intoMs: number, at: readonly Vec2[]): SupplyChart {
  const t0 = w.now - intoMs;
  w.startZone(t0);
  w.supply.replace(0, t0, (_rng, taken) => at[taken.length] ?? null);
  return w.supplyChart;
}

/** Step `n` ticks. */
export function run(w: World, n: number): void {
  for (let i = 0; i < n; i += 1) w.step();
}

/** A hull's whole XP in ms (levels banked + progress). */
export function xpMsOf(rec: ShipRecord): number {
  return rec.level * CONFIG.xp.levelMs + rec.xpMs;
}
