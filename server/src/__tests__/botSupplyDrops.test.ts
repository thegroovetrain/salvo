// THE SUPPLY RUN (Story 12.4, Eric 2026-11-19 "Head for charted drops",
// epic-12 amendment 5(h)) — the bots' half: the port's chart view, the pick
// (who seeks, which drop), the steering to the spot, the wait for the
// landing, the release, and on a real World that a seeking bot is on the
// spot around the landing and takes crates afterwards.
//
// Every time and distance is read off CONFIG and the shared supply clock; no
// number of Eric's is pinned here.

import { describe, expect, it } from 'vitest';
import { CONFIG, mulberry32, supplyLandMs, type DropView, type Vec2 } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import type { PerceptionView } from '../game/perception.js';
import { makeBotPort, supplyRowsOf, type BotPortSource } from '../game/botPort.js';
import type { SupplyChart, SupplyChartRow } from '../game/supplyDrops.js';
import { COMBAT_BRAIN } from '../game/ai/tactics.js';
import {
  AHEAD_STEPS,
  atSupplySpot,
  crateApproachThrottle,
  insideTurnCircle,
  noteSupplyCrates,
  pickSupplyDrop,
  routeFailedToward,
  supplyBarsOf,
  supplyCrateOf,
  supplyGoalOf,
  supplySteerPoint,
  stepTurnRadiusU,
  waitingForSupply,
} from '../game/ai/supplyDrops.js';
import { hullLengthU } from '../game/ai/navigate.js';
import type { BotMind, BotProfileId, BotRememberedCrate, BotSupplyDrop, BotWorldPort, RememberedContact } from '../game/ai/types.js';
import { circleIsland, flatRaster } from './islandFixture.js';
import { navCacheFor } from '../game/navCache.js';

const DT = CONFIG.tick.simDtMs;
const SURFACE_MS = CONFIG.supplyDrops.surfaceMs;
const NOW = 100000;

/** Every in-game personality (Eric 2026-11-19, "Every bot"). */
const PROFILES = CONFIG.bots.profiles as readonly BotProfileId[];
const SCATTER_U = CONFIG.supplyDrops.scatterU;

// --- fixtures -----------------------------------------------------------------

function openWorld(seed: number): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A hand-built port (botTactics.test's shape) with a settable chart. */
function fakePort(w: World, drops: BotSupplyDrop[], now = NOW): BotWorldPort {
  const live = { cx: 0, cy: 0, r: w.map.radius };
  return {
    now,
    map: w.map,
    zoneLiveRing: live,
    zoneEndgameReached: false,
    helmEnabled: true,
    submitInput: () => true,
    spendPoint: () => true,
    zoneNextRing: () => null,
    zonePhase: () => ({ phase: 'idle', closesInMs: null }),
    zoneSafeDisc: () => live,
    supplyDrops: () => drops,
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

function mkBot(w: World, x: number, y: number, heading = 0): ShipRecord {
  const rec = w.addShip(`b-${w.ships.size + 1}`, 'TESTER', 'bot', 'bismarck', undefined, { x, y });
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

/** A pending drop (lands `inMs` after NOW). */
const pending = (x: number, y: number, inMs = SURFACE_MS / 2): BotSupplyDrop => ({ x, y, landT: NOW + inMs });

/** The station slack the helm uses (two own hull lengths). */
const slackOf = (rec: ShipRecord): number => 2 * hullLengthU(rec.hullId);

function row(spot: number, x: number, y: number, cycleStartT: number): SupplyChartRow {
  return { cycle: 0, spot, x, y, cycleStartT };
}

// --- the port -------------------------------------------------------------------

describe('BotWorldPort.supplyDrops — the public chart, nothing more', () => {
  /** A minimal adapter source over a settable chart. */
  function source(chart: SupplyChart): BotPortSource {
    const w = openWorld(1300);
    return {
      now: NOW,
      map: w.map,
      zoneLiveRing: { cx: 0, cy: 0, r: w.map.radius },
      zoneCurrentRing: { cx: 0, cy: 0, r: w.map.radius },
      zoneRevealedNextRing: null,
      zoneStartMs: 0,
      zonePhase: 'idle',
      zoneEndgameReached: false,
      helmEnabled: true,
      supplyChart: chart,
      submitInput: () => true,
      spendPoint: () => true,
    };
  }

  it('is empty when nothing is charted', () => {
    expect(makeBotPort(source([]), CONFIG.zone).supplyDrops!()).toEqual([]);
  });

  it('maps each chart row to its spot and the shared landing time', () => {
    const chart = [row(0, 100, 200, 5000), row(1, -300, 50, 5000)];
    const view = makeBotPort(source(chart), CONFIG.zone).supplyDrops!();
    expect(view).toEqual(chart.map((r) => ({ x: r.x, y: r.y, landT: supplyLandMs(r.cycleStartT) })));
  });

  it('reuses one array between calls, trimmed to the chart (read it, never keep it)', () => {
    const out: BotSupplyDrop[] = [];
    const a = supplyRowsOf([row(0, 1, 2, 0), row(1, 3, 4, 0)], out);
    expect(a).toBe(out);
    expect(supplyRowsOf([row(0, 5, 6, 0)], out)).toBe(out);
    expect(out).toHaveLength(1);
  });

  it('carries no fact beyond the spot and the landing', () => {
    const view = makeBotPort(source([row(0, 100, 200, 5000)]), CONFIG.zone).supplyDrops!();
    expect(Object.keys(view[0]).sort()).toEqual(['landT', 'x', 'y']);
  });

  it('a real World\'s port reads World.supplyChart through the shared landing time', () => {
    const w = openWorld(1301);
    const port = (w.bots as unknown as { port: BotWorldPort }).port;
    expect(port.supplyDrops!()).toEqual([]);
    seatDrops(w, 0, [{ x: 400, y: -200 }]);
    expect(port.supplyDrops!()).toEqual(w.supplyChart.map((r) => ({ x: r.x, y: r.y, landT: supplyLandMs(r.cycleStartT) })));
  });
});

// --- the pick and the goal -------------------------------------------------------

describe('ai/supplyDrops — pick, keep, release', () => {
  const disc = { cx: 0, cy: 0, r: 2000 };
  const pos = { x: 0, y: 0 };

  it('picks the NEAREST drop still to land inside the disc', () => {
    const far = pending(900, 0);
    const near = pending(0, 600);
    const landed: BotSupplyDrop = { x: 100, y: 0, landT: NOW };
    const outside = pending(2500, 0);
    expect(pickSupplyDrop([far, near, landed, outside], disc, pos, NOW)).toBe(near);
    expect(pickSupplyDrop([far, landed, outside], disc, pos, NOW)).toBe(far);
    expect(pickSupplyDrop([landed, outside], disc, pos, NOW)).toBeNull();
    expect(pickSupplyDrop([], disc, pos, NOW)).toBeNull();
  });

  /** The bot's reading for supplyGoalOf. */
  const SLACK = 50;
  const at = (p: Vec2, now: number, sighted: readonly Vec2[] = []) => ({ pos: p, now, sighted, slackU: SLACK });

  it('the goal is a copy of the row, and is KEPT (same object) while due', () => {
    const rows = [pending(500, 0)];
    const g1 = supplyGoalOf(rows, disc, at(pos, NOW), null)!;
    expect(g1).toEqual(rows[0]);
    expect(g1).not.toBe(rows[0]);
    expect(supplyGoalOf(rows, disc, at({ x: 100, y: 0 }, NOW + 1000), g1)).toBe(g1);
  });

  it('after the landing: kept on the way in and while a SIGHTED crate lies in the circle; released ON the spot with none', () => {
    const d = pending(500, 0);
    const g = supplyGoalOf([d], disc, at(pos, NOW), null)!;
    const after = d.landT + 1;
    const spot = { x: d.x, y: d.y };
    const inCircle = { x: d.x + SCATTER_U / 2, y: 0 };
    const outCircle = { x: d.x + SCATTER_U * 2, y: 0 };
    expect(supplyGoalOf([d], disc, at({ x: d.x - 2 * SCATTER_U, y: 0 }, after), g)).toBe(g); // still on its way (outside the circle)
    expect(supplyGoalOf([d], disc, at(spot, after, [inCircle]), g)).toBe(g); // crates left to take
    expect(supplyGoalOf([d], disc, at(spot, after, [outCircle]), g)).toBeNull(); // a crate outside the circle is not this drop's
    expect(supplyGoalOf([d], disc, at(spot, after), g)).toBeNull(); // cleared
    expect(supplyGoalOf([d], disc, at(inCircle, after), g)).toBe(g); // off the spot: back to it first
  });

  it('the crate to collect is the nearest SIGHTED one inside the circle', () => {
    const spot = { x: 0, y: 0 };
    const near = { x: SCATTER_U / 4, y: 0 };
    const far = { x: -SCATTER_U / 2, y: 0 };
    const outside = { x: SCATTER_U + 1, y: 0 };
    expect(supplyCrateOf(spot, [far, near, outside], spot)).toBe(near);
    expect(supplyCrateOf(spot, [far, outside], { x: outside.x, y: 0 })).toBe(far); // outside never counts, however close
    expect(supplyCrateOf(spot, [outside], spot)).toBeNull();
    expect(supplyCrateOf(spot, [], spot)).toBeNull();
  });

  it('a goal that left the chart or the disc is dropped for the next pick', () => {
    const a = pending(500, 0);
    const b = pending(-800, 0);
    const g = supplyGoalOf([a, b], disc, at(pos, NOW), null)!;
    expect([g.x, g.y]).toEqual([a.x, a.y]);
    const g2 = supplyGoalOf([b], disc, at(pos, NOW), g)!; // a's row is gone
    expect([g2.x, g2.y]).toEqual([b.x, b.y]);
    const shrunk = { cx: -1000, cy: 0, r: 1200 }; // a's spot outside it
    const g3 = supplyGoalOf([a, b], shrunk, at(pos, NOW), g)!;
    expect([g3.x, g3.y]).toEqual([b.x, b.y]);
  });

  it('waiting = on the spot with the crates not yet down', () => {
    const g = pending(0, 0);
    expect(atSupplySpot(g, { x: SLACK, y: 0 }, SLACK)).toBe(true);
    expect(waitingForSupply(g, { x: SLACK, y: 0 }, NOW, SLACK)).toBe(true);
    expect(waitingForSupply(g, { x: SLACK + 1, y: 0 }, NOW, SLACK)).toBe(false);
    expect(waitingForSupply(g, { x: 0, y: 0 }, g.landT, SLACK)).toBe(false);
  });

  it('HELD ASHORE of a spot (at its snapped anchor, navigate.ts reachedAshoreGoal) counts as ON it: it waits there, and releases there once cleared', () => {
    const g = pending(0, 0);
    const far = { x: 10 * SLACK, y: 0 };
    expect(waitingForSupply(g, far, NOW, SLACK, true)).toBe(true);
    expect(waitingForSupply(g, far, g.landT, SLACK, true)).toBe(false);
    const after = g.landT + 1;
    const held = { ...at(far, after), heldAshore: () => true };
    expect(supplyGoalOf([g], disc, held, g)).toBeNull(); // cleared at the anchor, not held for the cycle
    expect(supplyGoalOf([g], disc, at(far, after), g)).toBe(g); // without it: still sailing for the spot
  });

  it('routeFailedToward: only a FAILED (empty) cached route aimed at the spot or into its circle', () => {
    const g = pending(500, 0);
    const failed = (goal: Vec2) => ({ goal, waypoints: [], builtAt: NOW });
    expect(routeFailedToward(failed({ x: 500, y: 0 }), g)).toBe(true);
    expect(routeFailedToward(failed({ x: 500 + SCATTER_U / 2, y: 0 }), g)).toBe(true); // toward a crate in the circle
    expect(routeFailedToward({ ...failed({ x: 500, y: 0 }), waypoints: [{ x: 500, y: 0 }] }, g)).toBe(false); // a live route
    expect(routeFailedToward(failed({ x: -2000, y: 0 }), g)).toBe(false); // some other goal
    expect(routeFailedToward(null, g)).toBe(false);
  });

  it('a drop the ROUTER failed on is RELEASED and BARRED (not picked) for the router retry clock, then may be tried again', () => {
    const a = pending(500, 0);
    const b = pending(-900, 0);
    const g = supplyGoalOf([a, b], disc, at(pos, NOW), null)!;
    expect([g.x, g.y]).toEqual([a.x, a.y]);
    const retry = CONFIG.bots.nav.routeRetryMs;
    const failedOnA = { now: NOW, routeFailed: (d: BotSupplyDrop) => d.x === a.x };
    const bars = supplyBarsOf([a, b], [], g, failedOnA);
    expect(bars).toEqual([{ x: a.x, y: a.y, landT: a.landT, until: NOW + retry }]);
    const next = supplyGoalOf([a, b], disc, { ...at(pos, NOW), bars }, g)!;
    expect([next.x, next.y]).toEqual([b.x, b.y]); // released, the next one picked
    expect(supplyGoalOf([a], disc, { ...at(pos, NOW), bars }, null)).toBeNull(); // never picked while barred
    // The bar lapses on the router's retry clock, or with the row.
    const later = NOW + retry;
    expect(supplyBarsOf([a, b], bars, null, { now: later })).toEqual([]);
    expect(supplyBarsOf([b], bars, null, { now: NOW })).toEqual([]);
    expect(supplyGoalOf([a], disc, { ...at(pos, later), bars: supplyBarsOf([a], bars, null, { now: later }) }, null)).toEqual(a);
  });
});

// --- the memory ------------------------------------------------------------------

describe('ai/supplyDrops — the remembered crates (Eric 2026-11-19, remember if not expensive)', () => {
  const EYE = CONFIG.vision.hullSight; // the nominal reach the `drop` row holds a crate to (epic-12 amendment 10)
  const CAP = CONFIG.supplyDrops.crates;
  const goal = pending(0, 0);
  const after = goal.landT + 1;
  const crate = (id: string, x: number, y: number): BotRememberedCrate => ({ id, x, y });
  /** A point in the circle the eye at the spot cannot cover when the scatter
   *  outreaches the eye (else the circle's rim). */
  const farX = Math.min(SCATTER_U, EYE * 1.5);

  it('a crate seen in the circle is remembered (a copy), one outside it is not, never twice and never past the cap', () => {
    const memory: BotRememberedCrate[] = [];
    const a = crate('a', SCATTER_U / 2, 0);
    noteSupplyCrates(goal, memory, [a, crate('out', SCATTER_U * 2, 0)], { x: 0, y: 0 });
    expect(memory).toEqual([a]);
    expect(memory[0]).not.toBe(a);
    noteSupplyCrates(goal, memory, [a], { x: 0, y: 0 });
    expect(memory).toHaveLength(1);
    const many = Array.from({ length: CAP + 3 }, (_, i) => crate(`m${i}`, 0, (i * SCATTER_U) / (CAP + 3)));
    noteSupplyCrates(goal, memory, many, { x: 0, y: 0 });
    expect(memory).toHaveLength(CAP);
  });

  it('a remembered crate is KEPT while out of sight (the eye does not cover its spot)', () => {
    const memory: BotRememberedCrate[] = [];
    const far = crate('far', farX, 0);
    noteSupplyCrates(goal, memory, [far], { x: farX, y: 0 }); // seen from beside it
    noteSupplyCrates(goal, memory, [], { x: farX - EYE - 1, y: 0 }); // backed off past the eye
    expect(memory).toEqual([far]);
  });

  it('a remembered crate is FORGOTTEN when the eye covers its spot and it is not sighted (taken or gone)', () => {
    const memory: BotRememberedCrate[] = [];
    const a = crate('a', farX, 0);
    const b = crate('b', -farX, 0);
    noteSupplyCrates(goal, memory, [a, b], { x: 0, y: 0 });
    noteSupplyCrates(goal, memory, [b], { x: farX, y: 0 }); // on a's spot, a absent; b still sighted
    expect(memory).toEqual([b]);
    noteSupplyCrates(goal, memory, [], { x: -farX + EYE, y: 0 }); // b's spot on the eye's rim, b absent
    expect(memory).toEqual([]);
  });

  it('the steer point and the release count the remembered crates', () => {
    const far = crate('far', farX, 0);
    expect(supplySteerPoint(goal, [], { x: 0, y: 0 }, after, [far])).toBe(far);
    expect(supplySteerPoint(goal, [], { x: 0, y: 0 }, after, [])).toBe(goal);
    const disc = { cx: 0, cy: 0, r: 4 * SCATTER_U };
    const onSpot = { pos: { x: 0, y: 0 }, now: after, sighted: [], slackU: 50 };
    expect(supplyGoalOf([goal], disc, { ...onSpot, remembered: [far] }, goal)).toBe(goal); // kept: a remembered crate left
    expect(supplyGoalOf([goal], disc, { ...onSpot, remembered: [] }, goal)).toBeNull(); // released
  });
});

// --- the crate approach (the orbit fix) --------------------------------------------

describe('ai/supplyDrops — the crate approach (a crate inside the turning circle)', () => {
  const kin = { maxSpeed: 30, turnRate: 0.5, steerageSpeed: 6 }; // a fixture hull, not a CONFIG row
  const pose = { x: 0, y: 0, heading: 0 }; // bow due east
  const fullR = stepTurnRadiusU(kin, AHEAD_STEPS[0]);

  it('the turning radius follows the shared turn model: speed over turn rate, floored at steerage', () => {
    expect(stepTurnRadiusU(kin, 1)).toBeCloseTo(kin.maxSpeed / kin.turnRate);
    expect(stepTurnRadiusU(kin, 0.1)).toBeCloseTo(kin.steerageSpeed / kin.turnRate);
  });

  it('a point abeam inside either circle is inside; one dead ahead or beyond the diameter is not', () => {
    expect(insideTurnCircle(pose, { x: 0, y: fullR }, fullR)).toBe(true); // port circle's centre
    expect(insideTurnCircle(pose, { x: 0, y: -fullR }, fullR)).toBe(true); // starboard
    expect(insideTurnCircle(pose, { x: fullR, y: 0 }, fullR)).toBe(false); // dead ahead
    expect(insideTurnCircle(pose, { x: 0, y: 2 * fullR + 1 }, fullR)).toBe(false);
  });

  it('full ahead for a crate it can turn onto; the fastest step that clears it otherwise; the slowest when none does', () => {
    expect(crateApproachThrottle(pose, { x: 3 * fullR, y: 0 }, kin)).toBe(AHEAD_STEPS[0]);
    const abeam = { x: 0, y: -fullR }; // the full-ahead circle's centre
    const step = crateApproachThrottle(pose, abeam, kin);
    expect(step).toBeLessThan(AHEAD_STEPS[0]);
    expect(insideTurnCircle(pose, abeam, stepTurnRadiusU(kin, step))).toBe(false);
    for (const faster of AHEAD_STEPS.filter((t) => t > step)) expect(insideTurnCircle(pose, abeam, stepTurnRadiusU(kin, faster))).toBe(true);
    const slowest = AHEAD_STEPS[AHEAD_STEPS.length - 1];
    const tight = { x: 0, y: -stepTurnRadiusU(kin, slowest) }; // inside even the slowest circle
    expect(crateApproachThrottle(pose, tight, kin)).toBe(slowest);
  });
});

// --- the brain -------------------------------------------------------------------

describe('COMBAT_BRAIN — the supply run', () => {
  it('EVERY personality with no target sails full ahead for the charted spot', () => {
    const w = openWorld(1310);
    const drop = pending(1200, 0);
    const port = fakePort(w, [drop]);
    expect(PROFILES.length).toBeGreaterThan(1);
    for (const id of PROFILES) {
      const rec = mkBot(w, 0, 0, Math.PI / 2); // bow due north, drop due east
      const mind = mkMind(id);
      const d = COMBAT_BRAIN.decide(rec, mind, port);
      expect(mind.supplyGoal, id).toEqual(drop);
      expect(mind.posture, id).toBe('reposition');
      expect(d.throttle, id).toBe(1);
      expect(d.rudder, id).toBeLessThan(0); // starboard: a north bow turns east
      expect(d.fireSlot, id).toBeNull();
    }
  });

  it('on the spot before the landing it WAITS dead in the water', () => {
    const w = openWorld(1312);
    const rec = mkBot(w, 0, 0);
    rec.state.speed = 5;
    const port = fakePort(w, [pending(slackOf(rec) / 2, 0)]);
    const mind = mkMind('trapper');
    const d = COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.supplyGoal).not.toBeNull();
    expect([d.throttle, d.rudder]).toEqual([0, 0]);
  });

  it('on the spot once landed with NO crate sighted in the circle it RELEASES the goal and patrols on', () => {
    const w = openWorld(1313);
    const rec = mkBot(w, 0, 0);
    const drop = pending(slackOf(rec) / 2, 0);
    const mind = mkMind('siege');
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop]));
    expect(mind.supplyGoal).not.toBeNull();
    const d = COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop], drop.landT));
    expect(mind.supplyGoal).toBeNull();
    expect(mind.posture).toBe('reposition');
    expect(d.throttle).toBeGreaterThan(0);
  });

  it('on the spot once landed with a crate sighted in the circle it KEEPS the goal and steers for the crate', () => {
    const w = openWorld(1316);
    const rec = mkBot(w, 0, 0, 0); // bow due east
    const drop = pending(0, 0);
    const mind = mkMind('bulwark');
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop]));
    const crate: DropView = { id: 'c1', x: 0, y: -SCATTER_U / 2, c: 'xp' }; // due south, abeam to starboard
    mind.view = { drops: [crate], mines: [] } as unknown as PerceptionView;
    const d = COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop], drop.landT));
    expect(mind.supplyGoal).toEqual(drop);
    expect(d.throttle).toBe(1);
    expect(d.rudder).toBeLessThan(0); // starboard: an east bow turns south toward the crate
  });

  // 2026-11-20 (epic-12 amendment 10): the bot's nominal eye is now the hull
  // sight, which covers the whole scatter circle from anywhere in it — so a
  // remembered crate the bot does not see is forgotten on the spot, and the
  // "steers for a remembered crate it no longer sees" half of this test has no
  // seat inside a circle (the steer-point rule itself is pinned above, pure).
  it('steers for a crate in the circle it sees and remembers, and forgets it when the goal is released', () => {
    const w = openWorld(1318);
    const rec = mkBot(w, 0, 0, 0); // bow due east
    const drop = pending(0, 0);
    const mind = mkMind('bulwark');
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop]));
    const crate: DropView = { id: 'c1', x: 0, y: -SCATTER_U, c: 'xp' }; // due south, on the circle's rim
    mind.supplyCrates = [{ id: 'c1', x: crate.x, y: crate.y }];
    mind.view = { drops: [crate], mines: [] } as unknown as PerceptionView;
    const d = COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop], drop.landT));
    expect(mind.supplyGoal).toEqual(drop);
    expect(mind.supplyCrates).toHaveLength(1);
    expect(d.throttle).toBe(1);
    expect(d.rudder).toBeLessThan(0); // starboard: an east bow turns south toward the crate
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [], drop.landT)); // the drop leaves the chart
    expect(mind.supplyGoal ?? null).toBeNull();
    expect(mind.supplyCrates).toEqual([]);
  });

  it('THE ORBIT FIX: a crate inside its turning circle slows it to a step that can reach it; one outside keeps full ahead', () => {
    const w = openWorld(1319);
    const rec = mkBot(w, 0, 0, 0); // bow due east
    const drop = pending(0, 0);
    const mind = mkMind('siege');
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop]));
    const kin = rec.stats.kinematics;
    rec.state.speed = kin.maxSpeed;
    const fullR = stepTurnRadiusU(kin, AHEAD_STEPS[0]);
    expect(fullR).toBeLessThan(SCATTER_U); // the circle fits in the drop's scatter
    const abeam: DropView = { id: 'c1', x: 0, y: -fullR, c: 'xp' }; // the starboard circle's centre
    mind.view = { drops: [abeam], mines: [] } as unknown as PerceptionView;
    const slow = COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop], drop.landT));
    expect(mind.supplyGoal).toEqual(drop);
    expect(slow.throttle).toBeLessThan(1);
    expect(AHEAD_STEPS).toContain(slow.throttle);
    const ahead: DropView = { id: 'c2', x: fullR, y: 0, c: 'xp' }; // dead ahead: reachable
    mind.view = { drops: [ahead], mines: [] } as unknown as PerceptionView;
    expect(COMBAT_BRAIN.decide(rec, mind, fakePort(w, [drop], drop.landT)).throttle).toBe(1);
  });

  it('a sighted crate in its lane on the way is taken (the lane nudge rides the supply run)', () => {
    const w = openWorld(1314);
    const rec = mkBot(w, 0, 0, 0); // bow due east, drop due east
    const port = fakePort(w, [pending(2000, 0)]);
    const crate: DropView = { id: 'c1', x: CONFIG.bots.dropAheadU / 2, y: CONFIG.bots.dropLaneU / 2, c: 'xp' };
    const plain = mkMind('trapper');
    plain.view = { drops: [], mines: [] } as unknown as PerceptionView;
    const straight = COMBAT_BRAIN.decide(rec, plain, port);
    const withCrate = mkMind('trapper');
    withCrate.view = { drops: [crate], mines: [] } as unknown as PerceptionView;
    const nudged = COMBAT_BRAIN.decide(rec, withCrate, port);
    expect(withCrate.supplyGoal).not.toBeNull();
    expect(nudged.throttle).toBe(straight.throttle);
    expect(nudged.rudder).toBeGreaterThan(straight.rudder); // the crate lies to port of the line
  });

  it('a spot the ROUTER cannot reach is released on the next deliberation and the reachable one is sought instead', () => {
    const w = openWorld(1317);
    const blocked = pending(1200, 0);
    const open = pending(-1500, 0);
    // The blocked spot sits deep inside an island, beyond the router's shore snap.
    w.map.islands.push(circleIsland(blocked.x, blocked.y, 700));
    expect(navCacheFor(w.map).routeTo({ x: 0, y: 0 }, blocked)).toBeNull();
    const rec = mkBot(w, 0, 0);
    const mind = mkMind('trapper');
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [blocked, open]));
    expect(mind.supplyGoal).toEqual(blocked); // nearest: picked, and the router tried
    COMBAT_BRAIN.decide(rec, mind, fakePort(w, [blocked, open], NOW + DT));
    expect(mind.supplyGoal).toEqual(open);
    expect(mind.supplyBars?.map((b) => [b.x, b.y])).toEqual([[blocked.x, blocked.y]]);
  });

  it('a TARGET outranks the drop: the helm is the target\'s, never the spot\'s', () => {
    const w = openWorld(1315);
    const port = fakePort(w, [pending(1200, 0)]);
    const rec = mkBot(w, 0, 0);
    const mind = mkMind('trapper');
    const t: RememberedContact = {
      id: 'tgt', x: 0, y: 300, heading: 0, speed: 0, seenAt: NOW, live: true, sunk: false,
      cls: 'bismarck', firstSeenAt: NOW - CONFIG.bots.reactionMs * 4, hits: 0,
      vx: null, vy: null, vAt: -1, vSrc: null, paintX: 0, paintY: 300, paintAt: -1, missSweptAt: -1,
    };
    mind.contacts.set('tgt', t);
    COMBAT_BRAIN.decide(rec, mind, port);
    expect(mind.targetKey).toBe('tgt');
    expect(mind.posture).not.toBe('reposition');
  });
});

// --- a real World ----------------------------------------------------------------

/** cycle 0's set with its spots at `at`, `intoMs` into the cycle now (the
 *  field's own `replace`, the directed pick). */
function seatDrops(w: World, intoMs: number, at: readonly Vec2[]): void {
  const t0 = w.now - intoMs;
  w.startZone(t0);
  w.supply.replace(0, t0, (_rng, taken) => at[taken.length] ?? null);
}

describe('a real World — a bot is on the spot for the landing and clears the crates', () => {
  // 1334 laid a crate inside the battleship's turning circle: before the
  // crate approach it orbited that crate at full ahead for the whole cycle.
  it.each([1320, 1334])('seed %i: arrives before the landing, waits there, takes the crates of the drop it sees, then releases on the spot', (seed) => {
    const w = openWorld(seed);
    const at: Vec2 = { x: 0, y: 0 };
    seatDrops(w, 0, [at]);
    const landT = supplyLandMs(w.supplyChart[0].cycleStartT);
    const rec = w.addBot('bismarck', 'siege'); // a cover-holder: every personality seeks
    rec.state = { x: 1500, y: 0, heading: 0, speed: 0 }; // bow pointed AWAY
    const mind = (w.bots as unknown as { minds: Map<string, BotMind> }).minds.get(rec.id)!;
    const slack = slackOf(rec);
    let onSpotAtLanding = false;
    while (w.now < landT) {
      w.step();
      onSpotAtLanding = Math.hypot(rec.state.x - at.x, rec.state.y - at.y) <= slack;
    }
    expect(onSpotAtLanding).toBe(true);
    expect(Math.abs(rec.state.speed)).toBeLessThan(1);
    w.step(); // the landing tick
    const inCircle = (c: Vec2): boolean => Math.hypot(c.x - at.x, c.y - at.y) <= SCATTER_U;
    const circleCrates = (): string[] => [...w.drops.entries()].filter(([, c]) => inCircle(c)).map(([id]) => id);
    const landed = circleCrates();
    expect(landed.length).toBeGreaterThan(0);
    const taken0 = rec.dropsTaken;
    const seen = new Set<string>();
    const noteSeen = (): void => {
      for (const c of mind.view?.drops ?? []) if (landed.includes(c.id)) seen.add(c.id);
    };
    noteSeen();
    for (let i = 0; i < (2 * SURFACE_MS) / DT && (mind.supplyGoal ?? null) !== null; i += 1) {
      w.step();
      noteSeen();
    }
    expect(mind.supplyGoal ?? null).toBeNull(); // released
    expect(mind.supplyCrates ?? []).toEqual([]); // forgotten on the release
    // At the release no crate in the circle is in its sight ...
    expect((mind.view?.drops ?? []).filter(inCircle)).toEqual([]);
    // ... and it released ON the spot, having taken the crates that are gone.
    expect(atSupplySpot(at, rec.state, slack)).toBe(true);
    // (Only the crates that were there at the landing: a minute airdrop may
    // drop into the circle meanwhile.)
    const left = circleCrates().filter((id) => landed.includes(id));
    expect(left.length).toBeLessThan(landed.length);
    // Every landed crate gone is its own take (it may also take a minute airdrop crate).
    expect(rec.dropsTaken - taken0).toBeGreaterThanOrEqual(landed.length - left.length);
    // Every crate of the drop it EVER saw is taken (Eric 2026-11-19,
    // remember if not expensive), not only the ones still in sight.
    expect(seen.size).toBeGreaterThan(0);
    expect([...seen].filter((id) => w.drops.has(id))).toEqual([]);
  });
});
