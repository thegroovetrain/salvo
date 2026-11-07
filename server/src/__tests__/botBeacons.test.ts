// THE BEACON FARM (Story 10.8, Eric 2026-11-06 "bots sail to and farm
// beacons") — the bots' half: the port's chart view, the pick, the standoff,
// the hold, the release, the combat override, and on a real World that a
// bot farms without ever touching (or targeting) the beacon's body.
//
// Every distance is read off CONFIG.beacons and the ai/beacons.ts knob; no
// number of Eric's is pinned here.

import { describe, expect, it } from 'vitest';
import { CONFIG, beaconInRange, beaconStateAt, mulberry32, type HullId, type Vec2 } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN } from '../game/ai/tactics.js';
import {
  BEACON_STANDOFF_FRAC,
  beaconGoalOf,
  beaconStandoffU,
  onStation,
  pickBeacon,
  standoffPoint,
} from '../game/ai/beacons.js';
import { hullLengthU } from '../game/ai/navigate.js';
import type { BotBeacon, BotMind, BotProfileId, BotWorldPort, RememberedContact } from '../game/ai/types.js';
import { GONE_MS, SURFACE_MS, bareWorld, run, seatBeacon, seatBeacons } from './beaconFixture.js';

const B = CONFIG.beacons;
const EPS = 1e-6;

// --- fixtures -----------------------------------------------------------------

function portOf(w: World): BotWorldPort {
  // The port the BotController actually holds (private on the controller).
  return (w.bots as unknown as { port: BotWorldPort }).port;
}

/** A hand-built port (botTactics.test's shape) with a settable chart. */
function fakePort(w: World, beacons: BotBeacon[]): BotWorldPort {
  const live = { cx: 0, cy: 0, r: w.map.radius };
  return {
    now: 100000,
    map: w.map,
    zoneLiveRing: live,
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    zoneNextRing: () => null,
    zonePhase: () => ({ phase: 'idle', closesInMs: null }),
    zoneSafeDisc: () => live,
    beacons: () => beacons,
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

function openWorld(seed: number): World {
  const w = new World(seed, 8, CONFIG.zone, { fleetWaves: false });
  w.map.islands.length = 0;
  return w;
}

function mkBot(w: World, x: number, y: number, heading = 0, hull: HullId = 'bismarck'): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', hull, undefined, { x, y });
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** An ENROLLED bot on a real World (the controller drives it), at a pose. */
function realBot(w: World, x: number, y: number, heading: number): ShipRecord {
  const rec = w.addBot('bismarck', 'forager');
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

const afloat = (x: number, y: number): BotBeacon => ({ x, y, phase: 'afloat', rate01: 1 });

// --- the port -------------------------------------------------------------------

describe('BotWorldPort.beacons — the public chart, nothing more', () => {
  it('is empty when there is no set', () => {
    const w = bareWorld();
    expect(portOf(w).beacons!()).toEqual([]);
  });

  it('equals the schema chart run through the shared lifecycle, through every phase', () => {
    const w = bareWorld();
    const port = portOf(w);
    const recs = seatBeacons(w, SURFACE_MS - 1000, [{ x: 100, y: 200 }, { x: -300, y: 50 }]);
    const derived = (): BotBeacon[] => {
      const chart = w.beaconChart;
      return chart.beacons.map((b) => {
        const s = beaconStateAt(w.now, chart.cycleStartT, b.sinkT);
        return { x: b.x, y: b.y, phase: s.phase, rate01: s.rate01 };
      });
    };
    const phases = new Set<string>();
    const check = (): void => {
      const view = port.beacons!();
      expect(view).toEqual(derived());
      for (const b of view) phases.add(b.phase);
    };
    check(); // charted
    run(w, 1000 / CONFIG.tick.simDtMs + 1);
    check(); // afloat
    w.beacons.sink(recs[0], w.now); // an EARLY sink is public (R9)
    run(w, 1);
    check();
    expect(port.beacons!()[0].phase).toBe('sinking');
    run(w, B.sinkMs / CONFIG.tick.simDtMs + 1);
    check();
    expect(port.beacons!()[0].phase).toBe('gone');
    expect([...phases].sort()).toEqual(['afloat', 'charted', 'gone', 'sinking']);
  });

  it('reuses one array between calls (read it, never keep it)', () => {
    const w = bareWorld();
    seatBeacon(w, SURFACE_MS);
    const port = portOf(w);
    expect(port.beacons!()).toBe(port.beacons!());
  });

  it('carries no server-private beacon fact', () => {
    const w = bareWorld();
    seatBeacon(w, SURFACE_MS);
    expect(Object.keys(portOf(w).beacons!()[0]).sort()).toEqual(['phase', 'rate01', 'x', 'y']);
  });
});

// --- the pick and the standoff ---------------------------------------------------

describe('ai/beacons — pick, standoff, station', () => {
  const disc = { cx: 0, cy: 0, r: 2000 };
  const pos = { x: 0, y: 0 };

  it('picks the NEAREST beacon worth farming (charted or paying) inside the disc', () => {
    const far = afloat(900, 0);
    const near: BotBeacon = { x: 0, y: 600, phase: 'charted', rate01: 0 };
    const gone: BotBeacon = { x: 100, y: 0, phase: 'gone', rate01: 0 };
    const outside = afloat(2500, 0);
    expect(pickBeacon([far, near, gone, outside], disc, pos)).toBe(near);
    expect(pickBeacon([far, gone, outside], disc, pos)).toBe(far);
    expect(pickBeacon([gone, outside], disc, pos)).toBeNull();
    expect(pickBeacon([], disc, pos)).toBeNull();
  });

  it('a sinking beacon still paying is worth farming; one paying nothing is not', () => {
    expect(pickBeacon([{ x: 10, y: 0, phase: 'sinking', rate01: 0.3 }], disc, pos)).not.toBeNull();
    expect(pickBeacon([{ x: 10, y: 0, phase: 'sinking', rate01: 0 }], disc, pos)).toBeNull();
  });

  it('the standoff lies on the bot\'s side, the configured fraction of the range out', () => {
    const at = { x: 300, y: -200 };
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      const bot = { x: at.x + Math.cos(a) * 1500, y: at.y + Math.sin(a) * 1500 };
      const s = standoffPoint(at, bot);
      expect(Math.hypot(s.x - at.x, s.y - at.y)).toBeCloseTo(BEACON_STANDOFF_FRAC * B.rangeU, 6);
      // Collinear and between: the standoff is on the segment beacon → bot.
      const toBot = { x: bot.x - at.x, y: bot.y - at.y };
      const toS = { x: s.x - at.x, y: s.y - at.y };
      expect(Math.abs(toBot.x * toS.y - toBot.y * toS.x)).toBeLessThan(EPS * 1e6);
      expect(toBot.x * toS.x + toBot.y * toS.y).toBeGreaterThan(0);
      expect(beaconInRange(at.x, at.y, s.x, s.y)).toBe(true);
    }
  });

  it('keeps the standoff while the goal is the same beacon, and re-fixes it for another', () => {
    const b = afloat(500, 0);
    const g1 = beaconGoalOf([b], disc, { x: 0, y: 0 }, null)!;
    const g2 = beaconGoalOf([b], disc, { x: 500, y: 900 }, g1)!;
    expect(g2).toBe(g1);
    const other = afloat(-500, 0);
    const g3 = beaconGoalOf([other], disc, { x: 0, y: 0 }, g1)!;
    expect([g3.x, g3.y]).toEqual([other.x, other.y]);
  });

  it('on station = inside the range and within the standoff distance (or at the standoff)', () => {
    const g = { x: 0, y: 0, standoff: { x: beaconStandoffU(), y: 0 } };
    expect(onStation(g, { x: beaconStandoffU() - 1, y: 0 }, 0)).toBe(true);
    expect(onStation(g, { x: 0, y: beaconStandoffU() + 1 }, 0)).toBe(false);
    expect(onStation(g, { x: beaconStandoffU() + 5, y: 0 }, 10)).toBe(true);
    expect(onStation(g, { x: B.rangeU + 1, y: 0 }, B.rangeU)).toBe(false);
  });
});

// --- the brain -------------------------------------------------------------------

describe('COMBAT_BRAIN — the beacon farm', () => {
  it('with no target it FARMS: sails full ahead for the standoff, never the centre', () => {
    const w = openWorld(1081);
    const beacon = afloat(1200, 0);
    const port = fakePort(w, [beacon]);
    const rec = mkBot(w, 0, 0, Math.PI / 2); // bow due north, beacon due east
    const mind = mkMind('forager');
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('farm');
    expect(mind.beaconGoal).not.toBeNull();
    const s = mind.beaconGoal!.standoff;
    expect(Math.hypot(s.x - beacon.x, s.y - beacon.y)).toBeCloseTo(beaconStandoffU(), 6);
    expect(d.throttle).toBe(1);
    expect(d.rudder).toBeLessThan(0); // starboard: a north bow turns east
    expect(d.fireSlot).toBeNull();
  });

  it('every profile farms (the cover-holders included)', () => {
    const w = openWorld(1082);
    for (const profile of CONFIG.bots.profiles) {
      const port = fakePort(w, [afloat(1200, 0)]);
      const mind = mkMind(profile as BotProfileId);
      COMBAT_BRAIN.decide(mkBot(w, 0, 0), mind, port);
      expect(mind.posture, profile).toBe('farm');
    }
  });

  it('on station it HOLDS dead in the water', () => {
    const w = openWorld(1083);
    const port = fakePort(w, [afloat(beaconStandoffU() - 20, 0)]);
    const rec = mkBot(w, 0, 0);
    rec.state.speed = 5;
    const mind = mkMind('forager');
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('farm');
    expect(d.throttle).toBe(0);
    expect(d.rudder).toBe(0);
  });

  it('RELEASES the beacon once it is gone, and patrols', () => {
    const w = openWorld(1084);
    const beacons = [afloat(800, 0)];
    const port = fakePort(w, beacons);
    const rec = mkBot(w, 0, 0);
    const mind = mkMind('forager');
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('farm');
    beacons[0] = { ...beacons[0], phase: 'gone', rate01: 0 };
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.beaconGoal).toBeNull();
    expect(mind.posture).toBe('reposition');
    expect(mind.patrolWaypoint).toBeTruthy();
    expect(d.throttle).toBeGreaterThan(0);
  });

  it('ignores a beacon outside the disc it would patrol', () => {
    const w = openWorld(1085);
    const port = fakePort(w, [afloat(w.map.radius + 500, 0)]);
    const mind = mkMind('forager');
    COMBAT_BRAIN.decide(mkBot(w, 0, 0), mind, port);
    expect(mind.posture).not.toBe('farm');
  });

  it('a TARGET overrides the farm (combat postures exactly as before)', () => {
    const w = openWorld(1086);
    const port = fakePort(w, [afloat(1200, 0)]);
    const rec = mkBot(w, 0, 0);
    const mind = mkMind('bulwark');
    const now = port.now;
    const t: RememberedContact = {
      id: 'tgt', x: 0, y: 300, heading: 0, speed: 0, seenAt: now, live: true, sunk: false,
      cls: 'bismarck', fleet: false, firstSeenAt: now - CONFIG.bots.reactionMs * 4, hits: 0,
      vx: null, vy: null, vAt: -1, vSrc: null, paintX: 0, paintY: 300, paintAt: -1, missSweptAt: -1,
    };
    mind.contacts.set('tgt', t);
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.targetKey).toBe('tgt');
    expect(mind.posture).not.toBe('farm');
    expect(mind.posture).not.toBe('reposition');
  });
});

// --- a real World ----------------------------------------------------------------

describe('a real World — the bot farms and never touches the body', () => {
  const START_U = 1000;

  it.each(Array.from({ length: 8 }, (_, k) => k))('approach from bearing %i × 45°: on station, paid, never in the body', (k) => {
    const w = bareWorld(1090 + k);
    const at: Vec2 = { x: 0, y: 0 };
    const beacon = seatBeacon(w, SURFACE_MS, at);
    const a = (k * Math.PI) / 4;
    // Bow pointed AWAY from the beacon: the bot must turn round to farm.
    const rec = realBot(w, Math.cos(a) * START_U, Math.sin(a) * START_U, a);
    const bodyClear = B.bodyRadiusU + hullLengthU(rec.hullId);
    let minD = Infinity;
    const ticks = Math.min((GONE_MS - SURFACE_MS - B.sinkMs) / CONFIG.tick.simDtMs, 1100);
    for (let i = 0; i < ticks; i += 1) {
      w.step();
      minD = Math.min(minD, Math.hypot(rec.state.x - at.x, rec.state.y - at.y));
    }
    expect(minD).toBeGreaterThan(bodyClear);
    expect(rec.contactDamageTaken).toBe(0);
    expect(beacon.hp).toBe(B.hp);
    expect(beaconInRange(at.x, at.y, rec.state.x, rec.state.y)).toBe(true);
    expect(Math.abs(rec.state.speed)).toBeLessThan(1);
    expect(rec.beaconXpMs).toBeGreaterThan(0);
  });

  it('a beacon is never a bot\'s target, never shot at', () => {
    const w = bareWorld(1099);
    const beacon = seatBeacon(w, SURFACE_MS, { x: 0, y: 0 });
    const rec = realBot(w, 400, 0, Math.PI);
    const fire0 = rec.lastFireSeq;
    const mind = (w.bots as unknown as { minds: Map<string, BotMind> }).minds.get(rec.id)!;
    expect(mind).toBeDefined();
    for (let i = 0; i < 400; i += 1) {
      w.step();
      expect(mind.targetKey).toBeNull();
    }
    expect(rec.lastFireSeq).toBe(fire0);
    expect(beacon.hp).toBe(B.hp);
  });
});
