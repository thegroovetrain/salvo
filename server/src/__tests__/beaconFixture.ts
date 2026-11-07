// TEST FIXTURE (Story 10.8): a World with RADIO BEACONS at known places and a
// known point in their life, without stepping a real minute to get there.
//
// Two ways in:
//   * `openCycle` — the REAL path: the zone clock is anchored in the past so
//     the next step's `placeBeacons` row places the cycle's set by the
//     production rule (private stream, live ring, keep-out discs);
//   * `seatBeacons` — the DIRECTED path: the field's own `replace` is called
//     with a pick that hands out the test's positions, so a beacon sits
//     exactly where a case needs it. The cycle clock is still the zone clock,
//     so every row of the tick reads the same lifecycle production does.
// Every time below is read off CONFIG.beacons / CONFIG.zone.

import { CONFIG, beaconCycleStartMs, type InputMsg, type ShipClassId, type Vec2, type ZoneTimeline } from '@salvo/shared';
import { World, type ShipRecord, type WorldOptions } from '../game/world.js';
import type { BeaconRecord } from '../game/beacons.js';
import { flatRaster } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';

export const DT = CONFIG.tick.simDtMs;
export const B = CONFIG.beacons;
/** ms into a cycle: the surface instant, the natural sink start, the end. */
export const SURFACE_MS = B.surfaceMs;
export const SINK_MS = B.surfaceMs + B.floatMs;
export const GONE_MS = B.surfaceMs + B.floatMs + B.sinkMs;

/** Open water: no islands, flat raster (nothing shadows, nothing blocks) —
 *  and NO PvE FLEET: these cases anchor the zone clock in the past, which is
 *  also the wave scheduler's clock, and a drone wandering into a beacon would
 *  be a second hull in a case that counts hulls. */
export function bareWorld(seed = 1008, opts?: WorldOptions, zoneCfg: ZoneTimeline = CONFIG.zone): World {
  const w = new World(seed, CONFIG.map.playerCap, zoneCfg, { fleetWaves: false, ...opts });
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
 * `intoMs` into ring cycle `cycle`, then take that step — `placeBeacons`
 * places the set by the production rule. (`startZone` is idempotent, so call
 * this once per World.)
 */
export function openCycle(w: World, intoMs: number, cycle = 0, zoneCfg: ZoneTimeline = CONFIG.zone): void {
  // The shared model's own cycle start: cycle c begins `c` ring groups in.
  w.startZone(w.now + DT - intoMs - beaconCycleStartMs(0, cycle, zoneCfg));
  w.step();
}

/** Positions for the beacons a directed case does not care about: 3000 u and
 *  more from the origin and far from each other, so they never touch a case
 *  that keeps its hulls within ~2000 u of the origin. */
function farAway(i: number): Vec2 {
  const ring = 3000 + (i % 2) * 600;
  const a = (i * Math.PI * 2) / 8;
  return { x: Math.cos(a) * ring, y: Math.sin(a) * ring };
}

/**
 * THE DIRECTED PATH: cycle 0's set with its FIRST beacons at `at` (the rest
 * far away), the world `intoMs` into the cycle right now. Returns the seated
 * beacons in `at` order. No step is taken.
 */
export function seatBeacons(w: World, intoMs: number, at: readonly Vec2[]): BeaconRecord[] {
  const t0 = w.now - intoMs;
  w.startZone(t0);
  w.beacons.replace(0, t0, (_rng, taken) => {
    const p = at[taken.length] ?? farAway(taken.length);
    return { x: p.x, y: p.y, fallback: false };
  });
  return w.beacons.records.slice(0, at.length);
}

/** One beacon at `at`, `intoMs` into its cycle. */
export function seatBeacon(w: World, intoMs: number, at: Vec2 = { x: 0, y: 0 }): BeaconRecord {
  return seatBeacons(w, intoMs, [at])[0];
}

/** Step `n` ticks. */
export function run(w: World, n: number): void {
  for (let i = 0; i < n; i += 1) w.step();
}

/** A hull's whole XP in ms (levels banked + progress). */
export function xpMsOf(rec: ShipRecord): number {
  return rec.level * CONFIG.xp.levelMs + rec.xpMs;
}
