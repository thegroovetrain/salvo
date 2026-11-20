// THE LANE NUDGE (Story 10.9 "Airdrops", epic-10 amendment 18; spec
// Boundaries "Bots") — a bot takes a SIGHTED crate lying on the line it
// already sails, in the non-combat bearings only (idle / patrol / a supply
// run in transit, Story 12.4); never while engaged, never off a supply spot
// it is waiting on for the landing.
//
// Every distance is read off CONFIG.bots / CONFIG.drops / CONFIG.supplyDrops;
// no number of Eric's is pinned here.

import { describe, expect, it } from 'vitest';
import { CONFIG, bearing, mulberry32, type DropView, type HullId, type Vec2 } from '@salvo/shared';
import type { PerceptionView } from '../game/perception.js';
import { World, type ShipRecord } from '../game/world.js';
import { COMBAT_BRAIN } from '../game/ai/tactics.js';
import { laneDrop } from '../game/ai/drops.js';
import { atSupplySpot } from '../game/ai/supplyDrops.js';
import { hullLengthU } from '../game/ai/navigate.js';
import type { BotMind, BotProfileId, BotSupplyDrop, BotWorldPort, RememberedContact } from '../game/ai/types.js';
import { bareWorld, run, seatSupply } from './worldFixture.js';

const AHEAD = CONFIG.bots.dropAheadU;
const LANE = CONFIG.bots.dropLaneU;

const crate = (id: string, x: number, y: number): DropView => ({ id, x, y, c: 'xp' });

/** The point `along` ahead of `from` on `b`, offset `side` to its left. */
function inLane(from: Vec2, b: number, along: number, side: number): Vec2 {
  return {
    x: from.x + Math.cos(b) * along - Math.sin(b) * side,
    y: from.y + Math.sin(b) * along + Math.cos(b) * side,
  };
}

// --- the pure lane rule --------------------------------------------------------

describe('laneDrop — the nearest crate in the lane of the goal bearing', () => {
  const self = { x: 100, y: -50, heading: 0 };
  const b = 0.7;
  const at = (id: string, along: number, side: number): DropView => {
    const p = inLane(self, b, along, side);
    return crate(id, p.x, p.y);
  };

  it('picks the NEAREST in-lane crate', () => {
    const near = at('near', AHEAD * 0.3, LANE * 0.9);
    const far = at('far', AHEAD * 0.6, 0);
    expect(laneDrop(self, b, [far, near])).toBe(near);
    expect(laneDrop(self, b, [near, far])).toBe(near);
  });

  it('ignores a crate behind, one beyond the lane length, one outside the lane width', () => {
    const behind = at('behind', -AHEAD * 0.3, 0);
    const beyond = at('beyond', AHEAD * 1.05, 0);
    const wide = at('wide', AHEAD * 0.5, -LANE * 1.1);
    expect(laneDrop(self, b, [behind, beyond, wide])).toBeNull();
    expect(laneDrop(self, b, [])).toBeNull();
  });

  it('honours the dials it is handed', () => {
    const c = at('c', AHEAD * 0.5, LANE * 1.5);
    expect(laneDrop(self, b, [c])).toBeNull();
    expect(laneDrop(self, b, [c], { dropAheadU: AHEAD, dropLaneU: LANE * 2 })).toBe(c);
  });
});

// --- the brain, one decision ----------------------------------------------------

/** A hand-built port with a settable supply chart. */
function fakePort(w: World, supply: BotSupplyDrop[]): BotWorldPort {
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
    supplyDrops: () => supply,
  };
}

/** A fresh mind whose view holds only `drops` (viewAt -1: nothing is folded,
 *  the lane nudge reads the view's sighted crates). */
function mkMind(profile: BotProfileId, drops: DropView[], seed = 7): BotMind {
  return {
    rng: mulberry32(seed),
    spendRng: mulberry32(seed + 1),
    seq: 0,
    fireSeq: 0,
    actSeq: 0,
    profile,
    phase: 0,
    view: { drops, mines: [] } as unknown as PerceptionView,
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

/** A charted spot still to land (its landing a minute after the fake
 *  port's clock). */
const charted = (x: number, y: number): BotSupplyDrop => ({ x, y, landT: 100000 + CONFIG.supplyDrops.surfaceMs });

/** The supply run's "on the spot" slack (ai/tactics.ts supplySlackU). */
const slackOf = (rec: ShipRecord): number => 2 * hullLengthU(rec.hullId);

describe('COMBAT_BRAIN — the lane nudge', () => {
  it('a bot on a supply run in transit turns for a crate in its lane (and not without one)', () => {
    const w = openWorld(1901);
    const port = fakePort(w, [charted(1200, 0)]); // dead ahead, bow on
    const rec = mkBot(w, 0, 0, 0);
    const c = crate('c', AHEAD * 0.5, LANE * 0.8); // ahead, to port of the line
    const plain = COMBAT_BRAIN.decide(rec, mkMind('raider', []), port);
    const mind = mkMind('raider', [c]);
    const nudged = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('reposition');
    expect(mind.supplyGoal).toBeTruthy();
    expect(nudged.throttle).toBe(plain.throttle);
    expect(nudged.rudder).toBeGreaterThan(plain.rudder); // turns toward +y
  });

  it('a TARGET in sight: the crate changes nothing (combat keeps priority)', () => {
    const w = openWorld(1902);
    const port = fakePort(w, [charted(1200, 0)]);
    const rec = mkBot(w, 0, 0, 0);
    const now = port.now;
    const hostile = (): RememberedContact => ({
      id: 'tgt', x: 0, y: 500, heading: 0, speed: 0, seenAt: now, live: true, sunk: false,
      cls: 'bismarck', firstSeenAt: now - CONFIG.bots.reactionMs * 4, hits: 0,
      vx: null, vy: null, vAt: -1, vSrc: null, paintX: 0, paintY: 500, paintAt: -1, missSweptAt: -1,
    });
    const c = crate('c', AHEAD * 0.5, LANE * 0.8);
    const decideWith = (drops: DropView[]): { d: ReturnType<typeof COMBAT_BRAIN.decide>; mind: BotMind } => {
      const mind = mkMind('duelist', drops); // a supply SEEKER (Story 12.4): the target pulls it off
      mind.contacts.set('tgt', hostile());
      return { d: COMBAT_BRAIN.decide(rec, mind, port), mind };
    };
    const plain = decideWith([]);
    const withCrate = decideWith([c]);
    expect(withCrate.mind.targetKey).toBe('tgt');
    expect(withCrate.d.rudder).toBe(plain.d.rudder);
    expect(withCrate.d.throttle).toBe(plain.d.throttle);
  });

  it('a bot WAITING on a charted spot for the landing does not leave it for a crate in front of its bow', () => {
    const w = openWorld(1903);
    const rec = mkBot(w, 0, 0, Math.PI);
    const port = fakePort(w, [charted(slackOf(rec) / 2, 0)]);
    const c = crate('c', -AHEAD * 0.4, 0); // dead ahead of the bow
    const mind = mkMind('raider', [c]);
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.posture).toBe('reposition');
    expect(d.throttle).toBe(0);
    expect(d.rudder).toBe(0);
  });
});

// --- a real World ----------------------------------------------------------------

/** An ENROLLED bot on a real World (the controller drives it), at a pose. */
function realBot(w: World, x: number, y: number, heading: number, profile: BotProfileId = 'bulwark'): ShipRecord {
  const rec = w.addBot('bismarck', profile);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function mindOf(w: World, rec: ShipRecord): BotMind {
  return (w.bots as unknown as { minds: Map<string, BotMind> }).minds.get(rec.id)!;
}

/** Clear of a straight run: the lateral offset beats the crate disc + the
 *  hull's half-beam, so only a turn takes it. */
const SIDE = LANE * 0.8;

describe('a real World — the bot takes a crate on its line', () => {
  it('in transit to a charted supply drop: the crate off its line is collected on the way, and the bot still makes the spot', () => {
    const w = bareWorld(1910, { drops: false }); // no scheduled scatter: only the test's crate
    const at: Vec2 = { x: 0, y: 0 };
    seatSupply(w, 0, [at]);
    const start: Vec2 = { x: -1600, y: 0 };
    const rec = realBot(w, start.x, start.y, 0, 'raider');
    expect(SIDE).toBeGreaterThan(CONFIG.drops.radiusU + hullLengthU(rec.hullId) / 4);
    const p = inLane(start, bearing(start, at), AHEAD * 0.6, SIDE);
    w.drops.set('lane', { id: 'lane', x: p.x, y: p.y, kind: 'xp' });
    const landTicks = Math.floor(CONFIG.supplyDrops.surfaceMs / CONFIG.tick.simDtMs);
    let tookAt = -1;
    let i = 0;
    for (; i < landTicks && tookAt < 0; i += 1) {
      w.step();
      if (!w.drops.has('lane')) tookAt = i;
    }
    expect(tookAt).toBeGreaterThanOrEqual(0);
    expect(rec.dropsTaken).toBe(1);
    const goal = mindOf(w, rec).supplyGoal!;
    expect(goal).toBeTruthy();
    // ...and it reaches the spot BEFORE the crates land.
    for (; i < landTicks - 1 && !atSupplySpot(goal, rec.state, slackOf(rec)); i += 1) w.step();
    expect(atSupplySpot(goal, rec.state, slackOf(rec))).toBe(true);
  });

  it('on patrol: a crate ahead in the lane of its waypoint is collected', () => {
    const w = bareWorld(1911, { drops: false });
    const rec = realBot(w, 0, 0, 0);
    const mind = mindOf(w, rec);
    run(w, 10);
    const wp = mind.patrolWaypoint;
    expect(wp).toBeTruthy();
    const from = { x: rec.state.x, y: rec.state.y };
    const p = inLane(from, bearing(from, wp!), Math.min(AHEAD * 0.6, Math.hypot(wp!.x - from.x, wp!.y - from.y) * 0.5), SIDE);
    w.drops.set('lane', { id: 'lane', x: p.x, y: p.y, kind: 'xp' });
    for (let i = 0; i < 600 && w.drops.has('lane'); i += 1) w.step();
    expect(w.drops.has('lane')).toBe(false);
    expect(rec.dropsTaken).toBe(1);
  });

  it('waiting on a charted spot: a crate off its lane does not pull it off the spot before the landing', () => {
    const w = bareWorld(1912, { drops: false });
    const at: Vec2 = { x: 0, y: 0 };
    seatSupply(w, 0, [at]);
    const rec = realBot(w, at.x, at.y, Math.PI, 'raider');
    run(w, 200); // settle on the spot
    const goal = mindOf(w, rec).supplyGoal!;
    const slack = slackOf(rec);
    expect(goal).toBeTruthy();
    expect(atSupplySpot(goal, rec.state, slack)).toBe(true);
    const off = 300;
    w.drops.set('off', { id: 'off', x: rec.state.x - off * 0.6, y: rec.state.y + off * 0.8, kind: 'xp' });
    // Well short of the landing (surfaceMs after the seat), the hull holds.
    const ticks = Math.min(400, Math.floor(CONFIG.supplyDrops.surfaceMs / CONFIG.tick.simDtMs) - 250);
    expect(ticks).toBeGreaterThan(0);
    for (let i = 0; i < ticks; i += 1) {
      w.step();
      expect(atSupplySpot(goal, rec.state, slack)).toBe(true);
    }
    expect(w.drops.has('off')).toBe(true);
    expect(rec.dropsTaken).toBe(0);
  });
});
