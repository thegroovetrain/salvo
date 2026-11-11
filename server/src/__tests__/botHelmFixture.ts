// TEST FIXTURE (Story 10.12): the fake-port rig the bot helm / gunnery cases
// share — botTactics.test.ts's harness, lifted so botArcs.test.ts and
// botSweep.test.ts do not each carry a copy. The ShipRecord is REAL (built
// through World.addShip), so hull envelopes, effective stats, turrets and the
// secondaries are the shipped ones; the port is hand-built so a case can put
// the clock, the ring and the chart exactly where it wants them.

import { CONFIG, desiredTurretAngle, mulberry32, stepShip, type HullId, type Island, type MineKind, type ShipClassId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import type { BotDecision, BotMind, BotPosture, BotProfileId, BotWorldPort, RememberedContact } from '../game/ai/types.js';

/** s — one sim tick. */
export const DT_S = CONFIG.tick.simDtMs / 1000;

/** A mutable stand-in for the narrow world port. */
export interface FakePort extends BotWorldPort {
  now: number;
  zoneLiveRing: { cx: number; cy: number; r: number };
}

export function fakePort(w: World): FakePort {
  return {
    now: 100000,
    map: w.map,
    // A ring so large nothing is ever outside it.
    zoneLiveRing: { cx: 0, cy: 0, r: w.map.radius * 4 },
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    zoneNextRing: () => null,
    zonePhase: () => ({ phase: 'idle', closesInMs: null }),
    zoneSafeDisc() {
      return this.zoneLiveRing;
    },
  };
}

export function mkMind(profile: BotProfileId, seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
    spendRng: mulberry32(seed + 1),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: null,
    viewAt: -1,
    contacts: new Map(),
    wakeCells: [],
    lastSweep: -1,
    targetKey: null,
    posture: 'reposition',
    stuckMs: 0,
    unbeachUntil: 0,
  };
}

/** An ocean with no islands — or exactly the ones handed in. */
export function ocean(seed: number, islands: readonly Island[] = []): World {
  const w = new World(seed, 8);
  w.map.islands.length = 0;
  w.map.islands.push(...islands);
  return w;
}

/** A bot hull at an exact pose, under way at half its rated speed, with the
 *  spawn fit (main battery + Shift, an EMPTY weapon row). */
export function mkBot(w: World, hullId: ShipClassId, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hullId, undefined, { x, y }, 'boost');
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = rec.stats.kinematics.maxSpeed * 0.5;
  return rec;
}

/** A plotted LIVE track the reaction gate passes, parked (no course). */
export function track(now: number, over: Partial<RememberedContact> = {}): RememberedContact {
  return {
    id: 'tgt',
    x: 0,
    y: 0,
    heading: null,
    speed: 0,
    seenAt: now,
    live: true,
    sunk: false,
    cls: 'bismarck' as HullId,
    firstSeenAt: now - CONFIG.bots.reactionMs * 4,
    hits: 0,
    vx: null,
    vy: null,
    vAt: -1,
    vSrc: null,
    paintX: 0,
    paintY: 0,
    paintAt: -1,
    missSweptAt: -1,
    ...over,
  };
}

/** Plot `t` and HOLD it as the target under `posture` — the cached
 *  deliberation a `deliberate: false` decision then acts on. */
export function holdTarget(mind: BotMind, t: RememberedContact, posture: BotPosture): void {
  const key = t.id ?? 'tgt';
  mind.contacts.set(key, t);
  mind.targetKey = key;
  mind.posture = posture;
}

/** Pre-train every turret onto a world point from the hull's current pose. */
export function trainOn(rec: ShipRecord, x: number, y: number): void {
  rec.turrets.forEach((t, i) => (t.a = desiredTurretAngle(rec.hullId, i, rec.state, { x, y })));
}

/** Hand the brain a view holding exactly these mines (nothing else sighted).
 *  `viewAt` is left stale, so the fold does not run — the cases here read the
 *  view's mines, not contact memory. */
export function sightMines(mind: BotMind, mines: readonly { x: number; y: number; own: boolean; c?: MineKind }[]): void {
  mind.view = {
    contacts: [],
    events: [],
    mines: mines.map((m, i) => ({ id: `m${i}`, x: m.x, y: m.y, by: m.own ? 'me' : 'enemy', own: m.own, ...(m.c === undefined ? {} : { c: m.c }) })),
    litZones: [],
    burnZones: [],
    foulZones: [],
    clouds: [],
    drops: [],
  };
}

/** Sail the hull one tick under a decision's helm — the shared `stepShip` at
 *  the hull's own kinematics, as the server's `stepShips` row does in open
 *  water — and advance the port's clock. */
export function sail(rec: ShipRecord, port: FakePort, d: Pick<BotDecision, 'throttle' | 'rudder'>): void {
  stepShip(rec.state, d, rec.stats.kinematics, DT_S);
  port.now += CONFIG.tick.simDtMs;
}
