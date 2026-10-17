// STORY 9.13 FIX WAVE — one regression per review finding (Blind Hunter,
// Edge Case Hunter, Codex), each written red against the wave-3 code and
// cited in its title. Contracts, not geometry pins: the numbers are the
// findings' own probes or read from CONFIG.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  cellOf,
  droneHullOf,
  effectiveStats,
  flowDirection,
  isWater,
  hullEnvelope,
  mulberry32,
  pointOf,
  snapToWater,
  type ShipClassId,
  type Vec2,
  type ZoneRing,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN, situationOf } from '../game/ai/tactics.js';
import { navOf, patrolBearing, steerToward, stormArrivalMs, turnRadiusU, type NavCtx } from '../game/ai/navigate.js';
import { NavCache, navCacheFor } from '../game/navCache.js';
import { circleIsland } from './islandFixture.js';
import { profileOf } from '../game/ai/profiles.js';
import { choosePosture, foldView, ringDeadband, type BotSituation } from '../game/ai/utility.js';
import { BotController } from '../game/ai/botDriver.js';
import { nextStillSweeps } from '../game/ai/plot.js';
import type { PerceptionView } from '../game/perception.js';
import type {
  BotMind,
  BotPosture,
  BotProfileId,
  BotTickEntry,
  BotWorldPort,
  BotZonePhase,
  RememberedContact,
} from '../game/ai/types.js';

// ---------------------------------------------------------------------------
// Shared fixtures (the botPosture / botNavigate shapes)
// ---------------------------------------------------------------------------

const NOW = 50000;

function mkMind(profile: BotProfileId = 'bulwark', seed = 7): BotMind {
  return {
    rng: mulberry32(seed), spendRng: mulberry32(seed + 1), seq: 0, fireSeq: 0, actSeq: 0, profile, phase: 0,
    view: null, viewAt: -1, contacts: new Map(), wakeCells: [], lastSweep: -1, targetKey: null,
    posture: 'reposition', stuckMs: 0, unbeachUntil: 0,
  };
}

function situation(over: Partial<BotSituation> = {}): BotSituation {
  const st = over.stats ?? effectiveStats(hullEnvelope('battleship'));
  return {
    now: NOW, x: 0, y: 0, hp: st.maxHp, maxHp: st.maxHp, stats: st, speed: 0, heading: 0,
    profile: profileOf('siege'), ring: { cx: 0, cy: 0, r: 3000 }, islands: [], hullId: 'battleship', ...over,
  };
}

interface FakePort extends BotWorldPort {
  now: number;
  zoneLiveRing: ZoneRing;
  next: ZoneRing | null;
  safe: ZoneRing;
  zone: BotZonePhase;
}

function fakePort(w: World, live: ZoneRing): FakePort {
  return {
    now: w.now, map: w.map, zoneLiveRing: live, zoneEndgameReached: false, helmEnabled: true,
    submitInput: () => true, spendPoint: () => true, next: null, safe: live,
    zone: { phase: 'idle', closesInMs: null },
    zoneNextRing() { return this.next; },
    zonePhase() { return this.zone; },
    zoneSafeDisc() { return this.safe; },
  };
}

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

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

// ---------------------------------------------------------------------------

describe('P1 (Blind Hunter): the storm-arrival clock follows the closing ring centre', () => {
  it('a drifting close reaches the far-side bot at the interpolated rim, not the radius-only rate', () => {
    const live: ZoneRing = { cx: 0, cy: 0, r: 4000 };
    const next: ZoneRing = { cx: 2000, cy: 0, r: 2000 };
    const zone = { phase: 'closing' as const, closesInMs: 30000 };
    // |pos − c(f)| = 3500 + 2000f ≥ r(f) = 4000 − 2000f at f = 1/8.
    expect(stormArrivalMs({ x: -3500, y: 0 }, live, next, zone)).toBeCloseTo(3750, 3);
  });

  it('a centred close keeps the radius-only value', () => {
    const live: ZoneRing = { cx: 0, cy: 0, r: 4000 };
    const next: ZoneRing = { cx: 0, cy: 0, r: 2000 };
    const zone = { phase: 'closing' as const, closesInMs: 30000 };
    expect(stormArrivalMs({ x: -3500, y: 0 }, live, next, zone)).toBeCloseTo(7500, 3);
    expect(stormArrivalMs({ x: -4100, y: 0 }, live, next, zone)).toBe(0);
  });
});

describe('P2 (Blind Hunter + Edge Case Hunter): a cover point outside the revealed next ring is stale', () => {
  const next: ZoneRing = { cx: -1000, cy: 0, r: 1500 };
  const insideNext = (sit: BotSituation, p: Vec2): boolean =>
    dist(p, { x: next.cx, y: next.cy }) <= next.r - ringDeadband(sit.stats, sit.speed);

  it('a siege holding at cover inside live but outside next stops holding once the ring is revealed (no cover to be had)', () => {
    const sit = situation({ x: 1500, y: 0 });
    const m = mkMind('siege');
    m.coverPoint = { x: 1500, y: 0 };
    m.fogAt = (x) => (x > 1000 ? 1 : 0);
    expect(choosePosture(sit, null, 'hold', { mind: m })).toBe('hold'); // pre-reveal: lying in wait
    const after = choosePosture(sit, null, 'hold', { mind: m, nextRing: next });
    expect(after).toBe('reposition');
    expect(m.coverPoint === null || m.coverPoint === undefined || insideNext(sit, m.coverPoint)).toBe(true);
  });

  it('the cover is re-found INSIDE the next ring when one exists', () => {
    const sit = situation({ x: 800, y: 0 });
    const m = mkMind('siege');
    m.coverPoint = { x: 800, y: 0 };
    m.fogAt = () => 1;
    choosePosture(sit, null, 'hold', { mind: m, nextRing: next });
    expect(m.coverPoint).toBeTruthy();
    expect(insideNext(sit, m.coverPoint!)).toBe(true);
  });

  it('the helm does not steer a holder outward to a stale cover point between deliberations', () => {
    const w = openWorld(91301);
    const port = fakePort(w, { cx: 0, cy: 0, r: 3000 });
    port.next = { cx: -500, cy: 0, r: 1500 };
    const rec = mkBot(w, 'battleship', 0, 0, Math.PI / 2); // inside the next ring, bow north
    const m = mkMind('siege');
    m.coverPoint = { x: 1500, y: 0 }; // east, outside the next ring
    const d = COMBAT_BRAIN.decide(rec, m, port, false);
    expect(d.rudder).toBeGreaterThan(0); // toward the next ring's west-lying patrol, not the stale east cover
  });
});

describe('P3 (Codex + Blind Hunter): a failed (empty) route is not cached forever', () => {
  const map = { radius: 3000, islands: [circleIsland(0, 0, 300)] };
  const goal = { x: 700, y: 0 };
  const ctxAt = (m: BotMind, pos: Vec2, now: number): NavCtx => ({
    pos, mind: m, nav: navCacheFor(map), now, hullU: 60, deliberate: true,
  });

  it('re-plans once the bot has moved routeReplanGoalMoveU from where the failed route was built', () => {
    const m = mkMind();
    const from = { x: -700, y: 0 };
    m.route = { goal: { ...goal }, waypoints: [], builtAt: NOW, builtFrom: { ...from } };
    // Not moved, inside the retry window: the failure stands (no per-tick thrash).
    steerToward(ctxAt(m, from, NOW + 50), goal);
    expect(m.route?.waypoints.length).toBe(0);
    const moved = { x: from.x, y: from.y + CONFIG.bots.nav.routeReplanGoalMoveU + 1 };
    steerToward(ctxAt(m, moved, NOW + 100), goal);
    expect(m.route?.waypoints.length).toBeGreaterThan(0);
  });

  it('re-plans after CONFIG.bots.nav.routeRetryMs even without moving', () => {
    const m = mkMind();
    const from = { x: -700, y: 0 };
    m.route = { goal: { ...goal }, waypoints: [], builtAt: NOW, builtFrom: { ...from } };
    steerToward(ctxAt(m, from, NOW + CONFIG.bots.nav.routeRetryMs), goal);
    expect(m.route?.waypoints.length).toBeGreaterThan(0);
  });
});

describe('P4 (Codex): a ring centred deep inside land still has a goal set', () => {
  const map = { radius: 2000, islands: [circleIsland(0, 0, 400)] };
  for (const r of [0, 300]) {
    it(`a ring of r ${r} centred 200 u inside a 400 u island: the field is finite on the water and flowDirection is non-null nearby`, () => {
      const nav = new NavCache(map);
      const ring: ZoneRing = { cx: 200, cy: 0, r };
      const field = nav.fieldFor(ring);
      const bot = { x: 700, y: 0 };
      const idx = cellOf(nav.grid, bot.x, bot.y);
      expect(isWater(nav.grid, idx)).toBe(true);
      expect(field.dist[idx]).toBeLessThan(Infinity);
      expect(flowDirection(field, nav.grid, bot.x, bot.y)).not.toBeNull();
    });
  }
});

describe('P5 (Codex + Edge Case Hunter): the patrol never picks land, and a zero safe disc patrols the live ring', () => {
  const pick = (w: World, port: FakePort, rec: ShipRecord, m: BotMind, n: number): (Vec2 | null)[] => {
    const out: (Vec2 | null)[] = [];
    const sit = situationOf(rec, m, port);
    for (let i = 0; i < n; i += 1) {
      m.patrolWaypoint = null;
      const ctx: NavCtx = { pos: rec.state, mind: m, nav: navOf(port), now: port.now, hullU: 60, deliberate: true };
      expect(Number.isFinite(patrolBearing(ctx, port, sit, 1))).toBe(true);
      out.push(m.patrolWaypoint ?? null);
    }
    return out;
  };

  it('safe disc r 0 (before the 2000 → 1000 close): waypoints are drawn across the live ring, all water', () => {
    const w = openWorld(91305);
    const live: ZoneRing = { cx: 0, cy: 0, r: 1500 };
    const port = fakePort(w, live);
    port.safe = { cx: 0, cy: 0, r: 0 };
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    const m = mkMind('forager');
    const wps = pick(w, port, rec, m, 40);
    const grid = navOf(port).grid;
    let far = 0;
    for (const p of wps) {
      expect(p).not.toBeNull();
      expect(isWater(grid, cellOf(grid, p!.x, p!.y))).toBe(true);
      expect(dist(p!, { x: 0, y: 0 })).toBeLessThanOrEqual(live.r);
      far = Math.max(far, dist(p!, { x: 0, y: 0 }));
    }
    expect(far).toBeGreaterThan(turnRadiusU(rec.stats));
  });

  it('a patrol disc centred on land yields only water waypoints (or none), never the land centre', () => {
    const w = openWorld(91306);
    w.map.islands.push(circleIsland(0, 0, 700));
    const port = fakePort(w, { cx: 0, cy: 0, r: 2500 });
    port.next = { cx: 0, cy: 0, r: 450 }; // all of it ashore
    const rec = mkBot(w, 'battleship', 1200, 0, Math.PI);
    const m = mkMind('forager');
    const grid = navOf(port).grid;
    for (const p of pick(w, port, rec, m, 20)) {
      if (p !== null) expect(isWater(grid, cellOf(grid, p.x, p.y))).toBe(true);
    }
  });
});

describe('P6 (Codex + Blind Hunter): the hit ledger is released with the life', () => {
  it('after releasePerLifeState both ledger maps are empty', () => {
    const ctl = new BotController({} as BotWorldPort, 15);
    ctl.enroll('bot-p6');
    const m = (ctl as unknown as { minds: Map<string, BotMind> }).minds.get('bot-p6')!;
    m.hitVolleyAt?.set('e1', 1234);
    expect(m.hitVolleyAt?.size).toBe(1);
    ctl.tick([{ id: 'bot-p6', afloat: false } as unknown as BotTickEntry]);
    expect(m.hitVolleyAt?.size).toBe(0);
  });
});

describe('P7 (Codex + Blind Hunter): hits are credited per VOLLEY window, not keyed on the current fireSeq', () => {
  const pv = (events: PerceptionView['events'] = [], contacts: PerceptionView['contacts'] = []): PerceptionView => ({
    contacts, events, mines: [], litZones: [], burnZones: [], foulZones: [], decoys: [], clouds: [],
  });
  const seed = (): BotMind => {
    const m = mkMind();
    foldView(m, pv([], [{ id: 'e1', x: 200, y: 0, heading: 0, speed: 0, cls: 'battleship' }]), 1000);
    return m;
  };
  const hc = (m: BotMind, at: number): void => foldView(m, pv([{ k: 'hc', id: 'me', x: 200, y: 0 }]), at);

  it('two hc rows 50 ms apart on one track count one hit', () => {
    const m = seed();
    hc(m, 2000);
    hc(m, 2050);
    expect(m.contacts.get('e1')!.hits).toBe(1);
  });

  it('two hc rows 300 ms apart (the machine-gun stream) count two', () => {
    const m = seed();
    hc(m, 2000);
    hc(m, 2300);
    expect(m.contacts.get('e1')!.hits).toBe(2);
  });

  it('an intervening click does not split one volley', () => {
    const m = seed();
    hc(m, 2000);
    m.fireSeq += 1;
    hc(m, 2050);
    expect(m.contacts.get('e1')!.hits).toBe(1);
  });
});

describe('P8 (Codex): the next ring\'s flow field is built in the zone hook at the reveal, not in a random bot\'s tick', () => {
  it('on the first tick the next ring is revealed, the cache already holds its field (no bot has asked)', () => {
    const cfg = { ...CONFIG.zone, beatMs: 400 };
    const w = new World(7, CONFIG.map.playerCap, cfg);
    // An AI hull with no controller mind: nothing on it can build the field lazily.
    w.addShip('ai-hull', 'B', 'bot', 'battleship', undefined, { x: 0, y: 0 });
    w.startZone();
    let next: ZoneRing | null = null;
    for (let t = 0; t < 2000 && next === null; t += 1) {
      w.step();
      next = w.zoneRevealedNextRing;
    }
    expect(next).not.toBeNull();
    expect(w.nav.has(next!)).toBe(true);
  });
});

describe('P9 (Codex): the fleet waypoint fallback is water, and a fleet re-picks at most once per decision cadence', () => {
  type FleetSeam = { waypoint: Vec2 | null; ashore: boolean };
  type DroneSeams = { fleets: Map<number, FleetSeam>; pickWaypoint(f: FleetSeam): void };
  const fleetWorld = (ring: ZoneRing, at: readonly Vec2[]): { w: World; ctl: DroneSeams } => {
    const w = openWorld(91309, CONFIG.map.playerCap);
    w.map.islands.push(circleIsland(0, 0, 850));
    Object.defineProperty(w, 'zoneLiveRing', { get: () => ring });
    at.forEach((p, i) => {
      const id = `f${i}`;
      w.addShip(id, 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, p);
      w.drones.add(id, 'medium', 1, { x: 0, y: 0 });
    });
    return { w, ctl: w.drones as unknown as DroneSeams };
  };

  it('a live ring whose sample disc is all ashore falls back to its centre SNAPPED to water', () => {
    // Centre 40 u inside the coast, a sample disc of 16 u: every draw is ashore.
    const { w, ctl } = fleetWorld({ cx: 0, cy: 810, r: 20 }, [{ x: 0, y: 1000 }]);
    const fleet = ctl.fleets.get(1)!;
    ctl.pickWaypoint(fleet);
    const grid = w.nav.grid;
    expect(fleet.waypoint).not.toBeNull();
    expect(isWater(grid, cellOf(grid, fleet.waypoint!.x, fleet.waypoint!.y))).toBe(true);
    expect(fleet.ashore).toBe(false);
  });

  it('an unsnappable (deep-ashore) fallback is re-picked at most once per CONFIG.bots.decisionCadenceMs, not per hull evaluation', () => {
    const { w, ctl } = fleetWorld({ cx: 0, cy: 0, r: 1000 }, [{ x: 950, y: 0 }, { x: -950, y: 0 }, { x: 0, y: 950 }]);
    let picks = 0;
    const orig = ctl.pickWaypoint.bind(ctl);
    ctl.pickWaypoint = (f) => {
      picks += 1;
      orig(f);
    };
    const ticks = 20;
    for (let t = 0; t < ticks; t += 1) w.step();
    expect(picks).toBeGreaterThan(0);
    expect(picks).toBeLessThanOrEqual(Math.ceil((ticks * CONFIG.tick.simDtMs) / CONFIG.bots.decisionCadenceMs) + 1);
  });
});

describe('P12 (Edge Case Hunter): the fleet route is re-based when the lead member changes', () => {
  it('the lead sinks mid-route: the new lead (already past the first route point) is not sent back to it', () => {
    const w = openWorld(91312, CONFIG.map.playerCap);
    w.map.islands.push(circleIsland(0, 0, 350));
    w.addShip('f0', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: -900, y: 0 });
    w.drones.add('f0', 'medium', 1, { x: 0, y: 0 });
    w.addShip('f1', 'DRONE', 'fleet', droneHullOf('medium'), DEFAULT_HORN_ID, { x: -900, y: 200 });
    w.drones.add('f1', 'medium', 1, { x: 0, y: 200 });
    type Seams = { fleets: Map<number, { waypoint: Vec2 | null; ashore: boolean; bestDist: number; progressAt: number; route: Vec2[] | null; pickedAt: number }>; routeFleet(f: unknown, wp: Vec2): void };
    const ctl = w.drones as unknown as Seams;
    const fleet = ctl.fleets.get(1)!;
    const wp = { x: 900, y: 0 };
    fleet.waypoint = wp;
    fleet.ashore = false;
    fleet.bestDist = Infinity;
    fleet.progressAt = w.now;
    fleet.pickedAt = w.now;
    ctl.routeFleet(fleet, wp);
    const route = fleet.route!;
    expect(route.length).toBeGreaterThanOrEqual(2);
    const first = { ...route[0] };
    // The second member stands halfway down the route's first leg: past its first point.
    const f1 = w.ships.get('f1')!;
    f1.state.x = (route[0].x + route[1].x) / 2;
    f1.state.y = (route[0].y + route[1].y) / 2;
    f1.prevPose = { ...f1.state };
    expect(dist(f1.state, first)).toBeGreaterThan(120);
    w.sinkShip('f0');
    w.step();
    const now = fleet.route;
    expect(now === null || dist(now[0], first) > 1).toBe(true);
  });
});

describe('P11 (Edge Case Hunter): an odds-gate verdict is HELD for CONFIG.bots.gateHoldMs', () => {
  const tb = effectiveStats(hullEnvelope('torpedoBoat'));
  // A shorter gun than the battleship's: closing -> declined, opening -> shadowed.
  const shorter = { ...tb, equipment: { ...tb.equipment, gun: { ...tb.equipment.gun, rangeU: tb.equipment.gun.rangeU * 0.7 } } };
  const at = shorter.equipment.gun.rangeU + 200;
  const tgt = (closing: boolean, over: Partial<RememberedContact> = {}): RememberedContact => ({
    id: 'e1', x: at, y: 0, heading: closing ? Math.PI : 0, speed: 20, seenAt: NOW, live: true, sunk: false,
    cls: 'battleship', fleet: false, firstSeenAt: 0, hits: 0, vx: null, vy: null, vAt: -1, vSrc: null,
    paintX: 0, paintY: 0, paintAt: -1, missSweptAt: -1, ...over,
  });
  const sitAt = (now: number): BotSituation =>
    situation({ now, stats: shorter, hullId: 'torpedoBoat', profile: profileOf('bulwark'), ring: { cx: 0, cy: 0, r: 100000 } });
  const deliberate = (m: BotMind, now: number, t: RememberedContact, key = 'e1', prev: BotPosture = 'pursue'): BotPosture => {
    m.contacts.clear();
    m.contacts.set(key, { ...t, seenAt: now });
    return choosePosture(sitAt(now), m.contacts.get(key)!, prev, { mind: m, targetKey: key });
  };

  it('a target whose closing sign flips every deliberation keeps one verdict for the hold window', () => {
    const m = mkMind('bulwark');
    m.fogAt = () => 0;
    const step = CONFIG.bots.decisionCadenceMs;
    const first = deliberate(m, NOW, tgt(true));
    expect(first).toBe('disengage'); // declined: closing with the longer gun, no cover
    let prev = first;
    for (let k = 1; k * step < CONFIG.bots.gateHoldMs; k += 1) {
      prev = deliberate(m, NOW + k * step, tgt(k % 2 === 0), 'e1', prev);
      expect(prev).toBe(first);
    }
    // The hold runs out: the opening contact is shadowed.
    expect(deliberate(m, NOW + CONFIG.bots.gateHoldMs, tgt(false), 'e1', prev)).toBe('kite');
  });

  it('the hold breaks at once on a new target key or when the target enters own reach', () => {
    const m = mkMind('bulwark');
    m.fogAt = () => 0;
    expect(deliberate(m, NOW, tgt(true))).toBe('disengage');
    expect(deliberate(m, NOW + 250, tgt(false), 'e2')).toBe('kite');
    const m2 = mkMind('bulwark');
    m2.fogAt = () => 0;
    expect(deliberate(m2, NOW, tgt(true))).toBe('disengage');
    expect(deliberate(m2, NOW + 250, tgt(true, { x: shorter.equipment.gun.rangeU - 50 }))).toBe('engage');
    expect(deliberate(m2, NOW + 500, tgt(false))).toBe('kite'); // engage cleared the hold
  });
});

describe('P14 (Edge Case Hunter): a goal on land is reached at its snapped anchor — no spin', () => {
  it('within one hull length of the snapped anchor the helm holds its heading instead of circling the anchor', () => {
    const map = { radius: 2000, islands: [circleIsland(0, 0, 300)] };
    const nav = navCacheFor(map);
    const goal = { x: 0, y: 280 }; // ashore, 20 u inside the north coast
    expect(isWater(nav.grid, cellOf(nav.grid, goal.x, goal.y))).toBe(false);
    const anchorIdx = snapToWater(nav.grid, goal);
    expect(anchorIdx).toBeGreaterThanOrEqual(0);
    const anchor = pointOf(nav.grid, anchorIdx);
    const pos = { x: anchor.x + 5, y: anchor.y, heading: 0.4 };
    const m = mkMind();
    const ctx: NavCtx = { pos, heading: pos.heading, mind: m, nav, now: NOW, hullU: 60, deliberate: true };
    expect(steerToward(ctx, goal)).toBeCloseTo(0.4, 9);
  });
});

describe('P16 (Blind Hunter): the departure rule is evaluated once per bot per tick', () => {
  it('a fresh-view tick (ingest + decide both read the situation) prices the departure once', () => {
    const w = openWorld(91316);
    const port = fakePort(w, { cx: 0, cy: 0, r: 4000 });
    port.next = { cx: -2000, cy: 0, r: 1000 };
    port.zone = { phase: 'reveal', closesInMs: 600000 }; // far off: never departing, never a ring run
    const real = navCacheFor(w.map);
    let fieldReads = 0;
    const counting = Object.create(real) as NavCache;
    counting.fieldFor = (ring: ZoneRing, margin?: number) => {
      fieldReads += 1;
      return real.fieldFor(ring, margin);
    };
    (port as { nav?: NavCache }).nav = counting;
    const rec = mkBot(w, 'battleship', 1500, 0, Math.PI / 2); // outside the next ring
    const m = mkMind('bulwark');
    for (let t = 0; t < 3; t += 1) {
      port.now = NOW + t * 50;
      m.view = { contacts: [], events: [], mines: [], litZones: [], burnZones: [], foulZones: [], decoys: [], clouds: [] };
      m.viewAt = port.now;
      fieldReads = 0;
      COMBAT_BRAIN.decide(rec, m, port, t === 0);
      expect(fieldReads, `tick ${t}`).toBe(1);
    }
  });
});

describe('P17 (Blind Hunter): the stillness cue is a speed floor, not an exact-zero float test', () => {
  it('a 1 u/s paint-to-paint jitter still counts as still; 10 u/s resets; no measurement keeps the run', () => {
    expect(nextStillSweeps(1, { vx: 1, vy: 0 })).toBe(2);
    expect(nextStillSweeps(1, { vx: 0.6, vy: -0.8 })).toBe(2);
    expect(nextStillSweeps(3, { vx: 10, vy: 0 })).toBe(0);
    expect(nextStillSweeps(2, null)).toBe(2);
    expect(nextStillSweeps(undefined, { vx: 0, vy: 0 })).toBe(1);
  });
});

describe('P20 (grounding investigation, orchestrator reading under amendment 192): entry damping beside a coast', () => {
  const setup = (withCoast: boolean): number => {
    const w = openWorld(91321);
    // A coast 60 u off the bow (inside one battleship turn radius) when present.
    if (withCoast) w.map.islands.push(circleIsland(360, 0, 300));
    const port = fakePort(w, { cx: 0, cy: 0, r: w.map.radius * 4 });
    port.safe = { cx: -1500, cy: 0, r: 400 }; // the patrol lies astern: a turn of more than 90°
    const rec = mkBot(w, 'battleship', 0, 0, 0);
    rec.state.speed = rec.stats.kinematics.maxSpeed;
    return COMBAT_BRAIN.decide(rec, mkMind('forager'), port, true).throttle;
  };

  it('a hull turning more than 90° with a ray blocked inside one turn radius turns at cruise, not full ahead', () => {
    expect(setup(true)).toBeCloseTo(0.6, 9);
  });

  it('the same turn in open water keeps full ahead', () => {
    expect(setup(false)).toBe(1);
  });
});
