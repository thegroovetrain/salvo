// THE NAV HELM (Story 9.13 wave 2, Eric rulings 2026-10-17, epic-9
// amendments 191, 192, 200, 202) — contracts, never geometry pins: every
// number below is read from CONFIG or measured off the fixture, and the
// fixtures are built from synthetic polygon islands (islandFixture.ts) so the
// assertions say "around the land, into the ring, onto water", not "this
// bearing".

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  buildNavGrid,
  cellOf,
  droneHullOf,
  isWater,
  lineClear,
  mulberry32,
  pointPolygonDistance,
  type HullId,
  type InputMsg,
  type ShipClassId,
  type ZoneRing,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN, situationOf } from '../game/ai/tactics.js';
import {
  departureDue,
  kiteBearing,
  navOf,
  pickPatrolWaypoint,
} from '../game/ai/navigate.js';
import { ringEscaping, scoreTrack } from '../game/ai/utility.js';
import { navCacheFor } from '../game/navCache.js';
import type { BotDecision, BotMind, BotProfileId, BotWorldPort, BotZonePhase, RememberedContact } from '../game/ai/types.js';

const DT = CONFIG.tick.simDtMs;
const CADENCE = Math.max(1, Math.round(CONFIG.bots.decisionCadenceMs / DT));

interface FakePort extends BotWorldPort {
  now: number;
  zoneLiveRing: ZoneRing;
  next: ZoneRing | null;
  safe: ZoneRing;
  zone: BotZonePhase;
}

function fakePort(w: World, live: ZoneRing): FakePort {
  return {
    now: w.now,
    map: w.map,
    zoneLiveRing: live,
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    next: null,
    safe: live,
    zone: { phase: 'idle', closesInMs: null },
    zoneNextRing() {
      return this.next;
    },
    zonePhase() {
      return this.zone;
    },
    zoneSafeDisc() {
      return this.safe;
    },
  };
}

function mkMind(profile: BotProfileId, seed = 7): BotMind {
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

/** An empty ocean (the islands are the test's own). */
function openWorld(seed: number, cap = 16): World {
  const w = new World(seed, cap);
  w.map.islands.length = 0;
  return w;
}

function mkBot(w: World, hullId: ShipClassId, x: number, y: number, heading: number): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hullId, undefined, { x, y });
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = heading;
  rec.state.speed = 0;
  rec.prevPose = { ...rec.state };
  return rec;
}

function track(now: number, over: Partial<RememberedContact> = {}): RememberedContact {
  return {
    id: 'tgt', x: 0, y: 0, heading: 0, speed: 0, seenAt: now, live: true, sunk: false,
    cls: 'torpedoBoat' as HullId, fleet: false, firstSeenAt: now - CONFIG.bots.reactionMs * 4,
    hits: 0, vx: null, vy: null, vAt: -1, vSrc: null, paintX: 0, paintY: 0, paintAt: -1, missSweptAt: -1,
    ...over,
  };
}

/** The brain's helm as a plain input — no trigger, no ability (the nav
 *  contracts are about where the hull goes). */
function inputOf(d: BotDecision, seq: number): InputMsg {
  return {
    seq, throttle: d.throttle, rudder: d.rudder, aim: 0, fireSeq: 0, aimDist: 0, slot: 0,
    fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false,
  };
}

/** Drive one bot record through the REAL sim for `ticks`, its brain on the
 *  decision cadence; stops early when `until` holds. Returns the per-tick
 *  land-contact count and the ticks run. */
function drive(
  w: World,
  rec: ShipRecord,
  mind: BotMind,
  port: FakePort,
  ticks: number,
  until: () => boolean = () => false,
): { landTicks: number; ran: number } {
  let landTicks = 0;
  let ran = 0;
  for (let t = 0; t < ticks && !until(); t += 1) {
    port.now = w.now;
    const d = COMBAT_BRAIN.decide(rec, mind, port, t % CADENCE === 0);
    w.submitInput(rec.id, inputOf(d, t + 1));
    w.step();
    if (rec.landContact) landTicks += 1;
    ran += 1;
  }
  return { landTicks, ran };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('the ring run — down the flow field around the land (amendments 192(a), 200)', () => {
  it('a bot 800 u outside the live ring with a large island on the radial gets inside without touching land', () => {
    const w = openWorld(9131);
    const live: ZoneRing = { cx: 0, cy: 0, r: 1500 };
    const isleR = 300;
    // The island sits ON the radial between the bot and the ring: the
    // straight line to the centre runs through it.
    const isle = circleIsland(live.r + 400, 0, isleR);
    w.map.islands.push(isle);
    const port = fakePort(w, live);
    const rec = mkBot(w, 'battleship', live.r + 800, 0, Math.PI); // bow at the centre, i.e. at the island
    const grid = navCacheFor(w.map).grid;
    expect(lineClear(grid, rec.state, { x: live.cx, y: live.cy })).toBe(false);
    const mind = mkMind('bulwark');
    // Budget: twice the straight-line run at rated speed — the detour costs
    // something, never a lap.
    const budget = Math.ceil(((2 * 800) / rec.stats.kinematics.maxSpeed) * 1000 / DT) + 200;
    const res = drive(w, rec, mind, port, budget, () => dist(rec.state, { x: live.cx, y: live.cy }) < live.r);
    expect(dist(rec.state, { x: live.cx, y: live.cy })).toBeLessThan(live.r);
    expect(res.landTicks).toBe(0);
    expect(pointPolygonDistance(rec.state, isle.poly)).toBeGreaterThan(0);
  });

  it('THE DEPARTURE RULE arms ring escape with ringLeaveMarginMs to spare on the geodesic (amendment 200(1))', () => {
    const w = openWorld(9132);
    const live: ZoneRing = { cx: 0, cy: 0, r: 3000 };
    const next: ZoneRing = { cx: 0, cy: 0, r: 1000 };
    const port = fakePort(w, live);
    port.next = next;
    const rec = mkBot(w, 'mineLayer', 2500, 0, Math.PI);
    const nav = navOf(port);
    const sit = { x: rec.state.x, y: rec.state.y, stats: rec.stats, speed: 0 };
    // The water-route time the rule reads: the field's geodesic over rated speed.
    const geo = (() => {
      const f = nav.fieldFor(next);
      const idx = cellOf(nav.grid, sit.x, sit.y);
      return f.len[idx] * nav.grid.cellU;
    })();
    const runMs = (geo / rec.stats.kinematics.maxSpeed) * 1000;
    const margin = CONFIG.bots.ringLeaveMarginMs;
    const at = (closesInMs: number): boolean => {
      port.zone = { phase: 'reveal', closesInMs };
      return departureDue(sit, port, nav);
    };
    expect(at(runMs + margin + 5000)).toBe(false); // time to spare: stay
    expect(at(runMs + margin - 50)).toBe(true); // inside the margin: leave now
    expect(at(runMs + margin / 2)).toBe(true); // the margin is what arms it
    // The situation carries it and ring escape arms on it, inside the live ring.
    port.zone = { phase: 'reveal', closesInMs: runMs + margin / 2 };
    const full = situationOf(rec, mkMind('forager'), port);
    expect(full.departing).toBe(true);
    expect(ringEscaping(full, false)).toBe(true);
    // A bot already inside the next ring never departs.
    const inside = { ...sit, x: 0, y: 0 };
    expect(departureDue(inside, port, nav)).toBe(false);
    // No close coming (no next ring): nothing to leave for.
    port.next = null;
    expect(departureDue(sit, port, nav)).toBe(false);
  });
});

describe('goal steering — routed when the line is blocked (amendment 192(b))', () => {
  it('a pursue whose target lies behind an island builds a route whose first waypoint is in clear view', () => {
    const w = openWorld(9133);
    w.map.islands.push(circleIsland(0, 0, 300));
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius * 4 });
    const rec = mkBot(w, 'torpedoBoat', -700, 0, 0);
    const mind = mkMind('raider');
    mind.contacts.set('tgt', track(port.now, { x: 700, y: 0 }));
    COMBAT_BRAIN.decide(rec, mind, port, true);
    expect(mind.posture).toBe('pursue');
    const grid = navCacheFor(w.map).grid;
    expect(lineClear(grid, rec.state, { x: 700, y: 0 })).toBe(false);
    const route = mind.route;
    expect(route).toBeTruthy();
    expect(route!.waypoints.length).toBeGreaterThan(0);
    expect(lineClear(grid, rec.state, route!.waypoints[0])).toBe(true);
    // Between deliberations the route is kept, not rebuilt.
    const built = route!.builtAt;
    port.now += DT;
    COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(mind.route?.builtAt).toBe(built);
  });
});

describe('idle — the always-safe disc and the routed, cover-weighted patrol (amendments 200(3), 202)', () => {
  it('before the reveal an idle bot drifts INTO the always-safe disc and patrols inside it', () => {
    const w = openWorld(9134);
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius });
    port.safe = { cx: 1800, cy: 0, r: 500 };
    const rec = mkBot(w, 'torpedoBoat', -1200, 0, 0);
    const mind = mkMind('forager');
    const centre = { x: port.safe.cx, y: port.safe.cy };
    const start = dist(rec.state, centre);
    const budget = Math.ceil(((2 * start) / rec.stats.kinematics.maxSpeed) * 1000 / DT);
    drive(w, rec, mind, port, budget, () => dist(rec.state, centre) < port.safe.r);
    expect(dist(rec.state, centre)).toBeLessThan(port.safe.r);
    // ...and every waypoint it then picks lies inside the disc.
    for (let k = 0; k < 4; k += 1) {
      drive(w, rec, mind, port, 200);
      expect(mind.patrolWaypoint).toBeTruthy();
      expect(dist(mind.patrolWaypoint!, centre)).toBeLessThanOrEqual(port.safe.r);
    }
  });

  it('a patrol waypoint is never on land, and solid fog is preferred when there is some', () => {
    const map = { radius: 2000, islands: [circleIsland(0, 0, 700)] };
    const grid = buildNavGrid(map);
    const disc: ZoneRing = { cx: 0, cy: 0, r: 1200 };
    const mind = mkMind('forager', 99);
    // Fog solid over the x > 0 half (public weather — the bot's fogAt thunk).
    mind.fogAt = (x) => (x > 0 ? 1 : 0);
    let inFog = 0;
    const N = 200;
    for (let i = 0; i < N; i += 1) {
      const p = pickPatrolWaypoint(mind, grid, disc, []);
      expect(isWater(grid, cellOf(grid, p.x, p.y))).toBe(true);
      if (p.x > 0) inFog += 1;
    }
    // Eight samples per pick: the fog half wins almost every time.
    expect(inFog / N).toBeGreaterThan(0.9);
    // Without fog the same draw is a plain uniform water pick: about half.
    const plain = mkMind('forager', 99);
    let east = 0;
    for (let i = 0; i < N; i += 1) if (pickPatrolWaypoint(plain, grid, disc, []).x > 0) east += 1;
    expect(east / N).toBeLessThan(0.8);
  });
});

describe('the new postures at the helm (amendments 193, 199)', () => {
  it('KITE holds the plot at CONFIG.bots.kiteHoldFrac × own reach: opens inside it, closes past own reach, orbits between', () => {
    const pos = { x: 0, y: 0, heading: 0, speed: 0 } as Parameters<typeof kiteBearing>[0];
    const reach = 1000;
    const toward = 0; // the plot sits due east
    const at = (d: number): number => kiteBearing(pos, { x: d, y: 0 }, reach);
    expect(Math.abs(at(reach * 0.5))).toBeCloseTo(Math.PI, 6); // too close: open
    expect(at(reach * 1.2)).toBeCloseTo(toward, 6); // too far: close
    expect(Math.abs(at(reach * ((CONFIG.bots.kiteHoldFrac + 1) / 2)))).toBeCloseTo(Math.PI / 2, 6); // in the band: beam-on
  });

  it('HOLD sits dead in the water — throttle 0, rudder 0 (no wake)', () => {
    const w = openWorld(9135);
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius * 4 });
    const rec = mkBot(w, 'battleship', 0, 0, 0.7);
    const mind = mkMind('siege');
    mind.posture = 'hold';
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(d.throttle).toBe(0);
    expect(d.rudder).toBe(0);
  });
});

describe('hide at cover (orchestrator reading under amendment 199)', () => {
  it('a HIDE that has reached its cover point sits still; short of it, it steers there at full ahead', () => {
    const w = openWorld(9139);
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius * 4 });
    const rec = mkBot(w, 'torpedoBoat', 0, 0, 0.3);
    const mind = mkMind('raider');
    mind.posture = 'hide';
    mind.coverPoint = { x: 5, y: 0 }; // within one own hull length
    const still = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(still.throttle).toBe(0);
    expect(still.rudder).toBe(0);
    expect(mind.posture).toBe('hide');
    mind.coverPoint = { x: 0, y: 800 };
    const away = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(away.throttle).toBe(1);
    expect(away.rudder).toBeGreaterThan(0); // the cover lies to port
  });
});

describe('the fleet routes over the public map (amendments 191, 192)', () => {
  it('a fleet waypoint behind an island is reached by routing, with no grounding', () => {
    const w = new World(9136, CONFIG.map.playerCap);
    w.map.islands.length = 0;
    const isle = circleIsland(0, 0, 350);
    w.map.islands.push(isle);
    const id = 'f';
    const rec = w.addShip(id, 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: -900, y: 0 });
    w.drones.add(id, 'medium', 1, { x: 0, y: 0 });
    w.step(); // the controller picks its own first waypoint
    // Hand the fleet a waypoint dead behind the island (the controller's own
    // pick + route seams, reached by a typed cast — the test wants geometry).
    type Seams = { fleets: Map<number, { waypoint: { x: number; y: number } | null; ashore: boolean; bestDist: number; progressAt: number; route: unknown }>; routeFleet(f: unknown, wp: unknown): void };
    const ctl = w.drones as unknown as Seams;
    const fleet = ctl.fleets.get(1)!;
    const wp = { x: 900, y: 0 };
    fleet.waypoint = wp;
    fleet.ashore = false;
    fleet.bestDist = Infinity;
    fleet.progressAt = w.now;
    ctl.routeFleet(fleet, wp);
    const route = w.drones.routeOf(id);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(0);
    let land = 0;
    let reached = false;
    // Budget: twice the routed length at HALF the hull's rated speed (a fleet
    // cruises below full ahead) — a detour, never a lap.
    let len = 0;
    let prev = { x: rec.state.x, y: rec.state.y };
    for (const p of route!) {
      len += dist(prev, p);
      prev = p;
    }
    const budget = Math.ceil(((2 * len) / (0.5 * rec.stats.kinematics.maxSpeed)) * 1000 / DT);
    for (let t = 0; t < budget && !reached; t += 1) {
      if (dist(rec.state, wp) < 121) reached = true;
      w.step();
      if (rec.landContact) land += 1;
    }
    expect(reached).toBe(true);
    expect(land).toBe(0);
    expect(pointPolygonDistance(rec.state, isle.poly)).toBeGreaterThan(0);
  });
});

describe('the wave-1 wiring at the helm', () => {
  it('a target inside the bot\'s OWN live lit zone scores × CONFIG.bots.litTargetBonus; someone else\'s light is no bonus (amendment 204)', () => {
    const w = openWorld(9138);
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius * 4 });
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const mind = mkMind('siege');
    const t = track(port.now, { x: 1200, y: 0, live: false });
    const zone = { id: 'z', x: 1200, y: 0, r: 200, until: port.now + 5000, by: rec.id };
    const dark = situationOf(rec, mind, port);
    mind.view = { contacts: [], events: [], mines: [], litZones: [zone], burnZones: [], foulZones: [], decoys: [], clouds: [] };
    const lit = situationOf(rec, mind, port);
    expect(lit.ownLitZones).toHaveLength(1);
    expect(scoreTrack(t, lit, [t]) / scoreTrack(t, dark, [t])).toBeCloseTo(CONFIG.bots.litTargetBonus, 9);
    mind.view = { ...mind.view, litZones: [{ ...zone, by: 'someone-else' }] };
    const theirs = situationOf(rec, mind, port);
    expect(scoreTrack(t, theirs, [t])).toBeCloseTo(scoreTrack(t, dark, [t]), 9);
  });
});

describe('determinism', () => {
  it('two worlds on one seed produce identical bot inputs over 200 ticks', () => {
    const run = (): string => {
      const w = new World(9137, 8);
      const ids: string[] = [];
      for (let i = 0; i < 4; i += 1) ids.push(w.addBot(undefined, undefined).id);
      const out: number[] = [];
      for (let t = 0; t < 200; t += 1) {
        w.step();
        for (const id of ids) {
          const s = w.ships.get(id)!;
          out.push(s.input.throttle, s.input.rudder, s.state.x, s.state.y);
        }
      }
      return JSON.stringify(out);
    };
    expect(run()).toBe(run());
  });
});
