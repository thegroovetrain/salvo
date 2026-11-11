// THE BEACON FARM (Story 10.8, Eric 2026-11-06 "bots sail to and farm
// beacons") — the bots' half: the port's chart view, the pick, the standoff,
// the hold, the release, the combat override, and on a real World that a
// bot farms without ever touching (or targeting) the beacon's body.
//
// Every distance is read off CONFIG.beacons and the ai/beacons.ts knob; no
// number of Eric's is pinned here.

import { describe, expect, it } from 'vitest';
import { CONFIG, beaconInRange, beaconStateAt, buildNavGrid, mulberry32, type HullId, type Vec2 } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN } from '../game/ai/tactics.js';
import {
  beaconGoalOf,
  beaconStandoffU,
  farmableIn,
  onStation,
  pickBeacon,
  standoffPoint,
  waterStandoff,
} from '../game/ai/beacons.js';
import { hullLengthU } from '../game/ai/navigate.js';
import { profileOf } from '../game/ai/profiles.js';
import type { BotBeacon, BotMind, BotPosture, BotProfileId, BotWorldPort, RememberedContact } from '../game/ai/types.js';
import { GONE_MS, SURFACE_MS, bareWorld, run, seatBeacon, seatBeacons } from './beaconFixture.js';
import { circleIsland } from './islandFixture.js';

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
  const w = new World(seed, 8, CONFIG.zone);
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
  const rec = w.addBot('bismarck', 'bulwark');
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
      expect(Math.hypot(s.x - at.x, s.y - at.y)).toBeCloseTo(CONFIG.bots.beaconStandoffFrac * B.rangeU, 6);
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

  it('eligibility is a FARMING POINT inside the disc, not the centre (Story 10.12)', () => {
    const s = beaconStandoffU();
    // Centre outside the rim, a farming point inside it: eligible.
    const overRim = afloat(disc.r + s / 2, 0);
    expect(farmableIn(overRim, disc)).toBe(true);
    expect(pickBeacon([overRim], disc, pos)).toBe(overRim);
    // Every farming point outside the rim: not.
    const beyond = afloat(disc.r + s + 1, 0);
    expect(farmableIn(beyond, disc)).toBe(false);
    expect(pickBeacon([beyond], disc, pos)).toBeNull();
    // Centre inside a disc too small to hold any farming point: not.
    const tiny = { cx: 0, cy: 0, r: s / 2 };
    expect(farmableIn(afloat(0, 0), tiny)).toBe(false);
    expect(pickBeacon([afloat(0, 0)], tiny, pos)).toBeNull();
  });

  it('a bot-side standoff OUTSIDE the disc is fixed on the disc-centre side, inside it', () => {
    const s = beaconStandoffU();
    const b = afloat(disc.r + s / 2, 0);
    const bot = { x: disc.r + 3 * s, y: 0 }; // beyond the beacon, outside the disc
    const g = beaconGoalOf([b], disc, bot, null)!;
    expect(Math.hypot(g.standoff.x - b.x, g.standoff.y - b.y)).toBeCloseTo(s, 6);
    expect(Math.hypot(g.standoff.x - disc.cx, g.standoff.y - disc.cy)).toBeLessThanOrEqual(disc.r);
    expect(g.standoff.x).toBeLessThan(b.x); // toward the centre, not toward the bot
    // Kept while the bot stays out there (no re-fix churn).
    expect(beaconGoalOf([b], disc, { x: bot.x, y: bot.y + 50 }, g)).toBe(g);
  });

  it('a bot-side standoff inside the disc stays on the bot\'s side', () => {
    const b = afloat(500, 0);
    const bot = { x: 500, y: 900 };
    const g = beaconGoalOf([b], disc, bot, null)!;
    const toBot = { x: bot.x - b.x, y: bot.y - b.y };
    const toS = { x: g.standoff.x - b.x, y: g.standoff.y - b.y };
    expect(toBot.x * toS.x + toBot.y * toS.y).toBeGreaterThan(0);
  });

  it('THE REVEAL: a disc that shrinks to a ring holding none of the beacon\'s farming points releases the goal', () => {
    const s = beaconStandoffU();
    const b = afloat(800, 0);
    const g = beaconGoalOf([b], disc, pos, null)!;
    expect(g).not.toBeNull();
    // The revealed next ring becomes the disc: centred away from the beacon,
    // its rim short of the nearest farming point.
    const revealed = { cx: -1000, cy: 0, r: 1800 - s - 1 };
    expect(farmableIn(b, revealed)).toBe(false);
    expect(beaconGoalOf([b], revealed, pos, g)).toBeNull();
  });

  it('a kept goal whose standoff the shrunk disc left out is RE-FIXED inside it', () => {
    const s = beaconStandoffU();
    const b = afloat(800, 0);
    const g = beaconGoalOf([b], disc, { x: 2000, y: 0 }, null)!; // fixed on the east side
    expect(g.standoff.x).toBeGreaterThan(b.x);
    const shrunk = { cx: 0, cy: 0, r: 800 }; // the beacon's own centre on the rim
    const g2 = beaconGoalOf([b], shrunk, { x: 2000, y: 0 }, g)!;
    expect(g2).not.toBe(g);
    expect(Math.hypot(g2.standoff.x, g2.standoff.y)).toBeLessThanOrEqual(shrunk.r);
    expect(Math.hypot(g2.standoff.x - b.x, g2.standoff.y - b.y)).toBeCloseTo(s, 6);
  });

  it('on station = inside the range and within the standoff distance (or at the standoff)', () => {
    const g = { x: 0, y: 0, bearing: 0, standoff: { x: beaconStandoffU(), y: 0 }, centerSide: false, paying: true };
    expect(onStation(g, { x: beaconStandoffU() - 1, y: 0 }, 0)).toBe(true);
    expect(onStation(g, { x: 0, y: beaconStandoffU() + 1 }, 0)).toBe(false);
    expect(onStation(g, { x: beaconStandoffU() + 5, y: 0 }, 10)).toBe(true);
    expect(onStation(g, { x: B.rangeU + 1, y: 0 }, B.rangeU)).toBe(false);
  });

  it('a DISC-CENTRE-SIDE goal is on station only at its standoff point, never merely near the centre (Story 10.12 review gate)', () => {
    const s = beaconStandoffU();
    const b = afloat(disc.r + s / 2, 0);
    const g = beaconGoalOf([b], disc, { x: disc.r + 3 * s, y: 0 }, null)!; // the bot's side is outside the disc
    expect(g.centerSide).toBe(true);
    // Inside the standoff distance of the centre, on the far (outside-the-disc) side.
    const beyond = { x: b.x + s / 2, y: 0 };
    expect(Math.hypot(beyond.x - disc.cx, beyond.y - disc.cy)).toBeGreaterThan(disc.r);
    expect(onStation(g, beyond, 1)).toBe(false);
    expect(onStation({ ...g, centerSide: false }, beyond, 1)).toBe(true); // the bot-side reading would park it there
    expect(onStation(g, g.standoff, 1)).toBe(true);
    // A bot-side goal keeps the broad reading.
    expect(beaconGoalOf([afloat(500, 0)], disc, { x: 500, y: 900 }, null)!.centerSide).toBe(false);
  });

  it('a standoff the WATER MOVE carries out of the disc yields no goal on that beacon; the next-nearest eligible beacon is taken (Story 10.12 review gate)', () => {
    const s = beaconStandoffU();
    const tight = { cx: 0, cy: 0, r: 1500 + s + 20 };
    const bot = { x: 3000, y: 0 };
    const near = afloat(1500, 0);
    const raw = standoffPoint(near, bot); // bot side, just inside the rim
    // Land over the raw standoff, deeper on the disc side: the nearest water is outward.
    const grid = buildNavGrid({ radius: 4000, islands: [circleIsland(raw.x - 60, 0, 90)] });
    const moved = waterStandoff(grid, near, raw);
    expect(Math.hypot(raw.x - tight.cx, raw.y - tight.cy)).toBeLessThanOrEqual(tight.r); // fixture guard
    expect(Math.hypot(moved.x - tight.cx, moved.y - tight.cy)).toBeGreaterThan(tight.r); // fixture guard
    expect(beaconGoalOf([near], tight, bot, null, grid)).toBeNull();
    const far = afloat(-1500, 0);
    expect(pickBeacon([near, far], tight, bot)).toBe(near);
    const g = beaconGoalOf([near, far], tight, bot, null, grid)!;
    expect([g.x, g.y]).toEqual([far.x, far.y]);
    expect(Math.hypot(g.standoff.x - tight.cx, g.standoff.y - tight.cy)).toBeLessThanOrEqual(tight.r);
  });

  it('a kept goal whose STORED standoff has left the disc is re-fixed (Story 10.12 review gate)', () => {
    const b = afloat(500, 0);
    const g = beaconGoalOf([b], disc, { x: 500, y: 900 }, null)!;
    const stray = { ...g, standoff: { x: disc.r + 10, y: 0 } }; // as if the water move had carried it out
    const g2 = beaconGoalOf([b], disc, { x: 500, y: 900 }, stray)!;
    expect(g2).not.toBe(stray);
    expect(Math.hypot(g2.standoff.x - disc.cx, g2.standoff.y - disc.cy)).toBeLessThanOrEqual(disc.r);
  });

  it('`paying` is re-read off the chart every deliberation, the kept goal (and its standoff) included', () => {
    const at = { x: 500, y: 0 };
    const bot = { x: 500, y: 900 };
    const charted = beaconGoalOf([{ ...at, phase: 'charted', rate01: 0 }], disc, bot, null)!;
    expect(charted.paying).toBe(false);
    const afloatNow = beaconGoalOf([afloat(at.x, at.y)], disc, bot, charted)!;
    expect(afloatNow.paying).toBe(true);
    expect(afloatNow.standoff).toEqual(charted.standoff); // kept, not re-fixed
    expect(beaconGoalOf([afloat(at.x, at.y)], disc, bot, afloatNow)).toBe(afloatNow); // unchanged: the same object
    const sinking = beaconGoalOf([{ ...at, phase: 'sinking', rate01: 0.5 }], disc, bot, afloatNow)!;
    expect(sinking.paying).toBe(true);
  });
});

// --- the brain -------------------------------------------------------------------

describe('COMBAT_BRAIN — the beacon farm', () => {
  it('with no target it FARMS: sails full ahead for the standoff, never the centre', () => {
    const w = openWorld(1081);
    const beacon = afloat(1200, 0);
    const port = fakePort(w, [beacon]);
    const rec = mkBot(w, 0, 0, Math.PI / 2); // bow due north, beacon due east
    const mind = mkMind('bulwark');
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
    const mind = mkMind('bulwark');
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
    const mind = mkMind('bulwark');
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
    const mind = mkMind('bulwark');
    COMBAT_BRAIN.decide(mkBot(w, 0, 0), mind, port);
    expect(mind.posture).not.toBe('farm');
  });

  /** One deliberation of `profile` with a beacon on the chart and a live
   *  sighted target in reach, coming from posture `prev` (default: already
   *  farming). */
  const withTarget = (profile: BotProfileId, prev: BotPosture = 'farm'): ReturnType<typeof mkMind> => {
    const w = openWorld(1086);
    const port = fakePort(w, [afloat(1200, 0)]);
    // PARKED: inside the beacon's paying circle (the stay is for a bot that
    // is collecting, not one still on its way).
    const bx = 1200 - beaconStandoffU();
    const rec = mkBot(w, bx, 0);
    const mind = mkMind(profile);
    mind.posture = prev;
    const now = port.now;
    const t: RememberedContact = {
      id: 'tgt', x: bx, y: 300, heading: 0, speed: 0, seenAt: now, live: true, sunk: false,
      cls: 'bismarck', firstSeenAt: now - CONFIG.bots.reactionMs * 4, hits: 0,
      vx: null, vy: null, vAt: -1, vSrc: null, paintX: bx, paintY: 300, paintAt: -1, missSweptAt: -1,
    };
    mind.contacts.set('tgt', t);
    COMBAT_BRAIN.decide(rec, mind, port);
    return mind;
  };

  it('a TARGET pulls a CONTESTING profile off the farm (Story 10.12, R4: the chain as before)', () => {
    const contesters = CONFIG.bots.profiles.filter((id) => profileOf(id).contestsBeacon);
    expect(contesters.length).toBeGreaterThan(0);
    for (const id of contesters) {
      const mind = withTarget(id);
      expect(mind.targetKey, id).toBe('tgt');
      expect(mind.posture, id).not.toBe('farm');
      expect(mind.posture, id).not.toBe('reposition');
    }
  });

  it('a NON-CONTESTING profile keeps the target AND the farm (Story 10.12, R4: it stays parked)', () => {
    const stayers = CONFIG.bots.profiles.filter((id) => !profileOf(id).contestsBeacon);
    expect(stayers.length).toBeGreaterThan(0);
    for (const id of stayers) {
      const mind = withTarget(id);
      expect(mind.targetKey, id).toBe('tgt');
      expect(mind.beaconGoal, id).not.toBeNull(); // refreshed with a target on the scope
      expect(mind.posture, id).toBe('farm');
      // The same parked stayer coming in ALREADY FIGHTING is not pulled out of its fight.
      expect(withTarget(id, 'engage').posture, `${id} from engage`).not.toBe('farm');
    }
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

// --- review gate: a standoff ashore --------------------------------------------

describe('a real World — a standoff that falls ON LAND (review gate)', () => {
  it('the bot stations on water within range and HOLDS (throttle 0), never circling ashore or touching land', () => {
    const w = bareWorld(1201);
    const at: Vec2 = { x: 0, y: 0 };
    // An island east of the beacon whose land swallows the east standoff point
    // deep — further in than the nav layer's shore snap reaches — its shore
    // a third of the standoff distance short of the standoff.
    const sU = beaconStandoffU();
    const shoreX = sU - sU / 3;
    const isleR = 2.5 * sU;
    w.map.islands.push(circleIsland(shoreX + isleR, 0, isleR));
    // Charted now: the whole charted + afloat span to get round the island.
    const beacon = seatBeacon(w, 0, at);
    // The bot starts EAST, beyond the island: its standoff bearing is east.
    const rec = realBot(w, shoreX + 2 * isleR + B.rangeU, 0, 0);
    let arrivedAt = -1;
    let fullAheadAfter = 0;
    const ticks = (SURFACE_MS + B.floatMs) / CONFIG.tick.simDtMs;
    for (let i = 0; i < ticks; i += 1) {
      w.step();
      expect(rec.landContact).toBe(false);
      if (arrivedAt < 0 && beaconInRange(at.x, at.y, rec.state.x, rec.state.y) && Math.abs(rec.state.speed) < 1) arrivedAt = i;
      if (arrivedAt >= 0 && rec.input.throttle === 1) fullAheadAfter += 1;
    }
    expect(arrivedAt).toBeGreaterThanOrEqual(0);
    // Holding, not circling: (almost) never full ahead once on station.
    expect(fullAheadAfter).toBeLessThanOrEqual(20);
    expect(beaconInRange(at.x, at.y, rec.state.x, rec.state.y)).toBe(true);
    expect(Math.abs(rec.state.speed)).toBeLessThan(1);
    expect(rec.landDamageTaken).toBe(0);
    expect(rec.beaconXpMs).toBeGreaterThan(0);
    expect(beacon.hp).toBe(B.hp);
  });
});

// --- review gate: a stale standoff after a swing round the beacon ---------------

describe('a real World — the standoff is re-fixed after a swing round the beacon (review gate)', () => {
  it('picked from the EAST, then put WEST of the beacon: the standoff moves west and the path never enters the body', () => {
    const w = bareWorld(1202);
    const at: Vec2 = { x: 0, y: 0 };
    const beacon = seatBeacon(w, SURFACE_MS, at);
    const rec = realBot(w, 1000, 0, 0);
    const mind = (w.bots as unknown as { minds: Map<string, BotMind> }).minds.get(rec.id)!;
    for (let i = 0; i < 40 && (mind.beaconGoal ?? null) === null; i += 1) w.step();
    expect(mind.beaconGoal!.standoff.x).toBeGreaterThan(at.x); // fixed on the east side
    // The far side, bow pointed east AT the beacon (no target anywhere).
    rec.state = { x: -1000, y: 0, heading: 0, speed: 0 };
    const bodyClear = B.bodyRadiusU + hullLengthU(rec.hullId);
    let minD = Infinity;
    for (let i = 0; i < 1100; i += 1) {
      w.step();
      minD = Math.min(minD, Math.hypot(rec.state.x - at.x, rec.state.y - at.y));
    }
    expect(mind.beaconGoal!.standoff.x).toBeLessThan(at.x); // re-fixed on the west side
    expect(minD).toBeGreaterThan(bodyClear);
    expect(rec.contactDamageTaken).toBe(0);
    expect(beacon.hp).toBe(B.hp);
    expect(beaconInRange(at.x, at.y, rec.state.x, rec.state.y)).toBe(true);
  });
});
