// THE ARC OPENING AND THE HELM AROUND IT (Story 10.12, Eric 2026-11-11, R2
// "always angle off" + the helm half of R4).
//
// Unit: ai/arcs.ts `openArcBearing` against the shared `turretBears` — the
// answer bears every turret, is the wanted bearing when that already does,
// is no further round than the search's own resolution, and lies on the bow's
// side of the target line.
//
// Integration: COMBAT_BRAIN.decide on the fake port. The helm cases put the
// hull's heading ON the bearing the posture wants, so the track term is zero
// and a zero rudder means "the posture's bearing was left alone".
//
// No ruled number is pinned: every distance is read off the hull's own stats
// or CONFIG, every expectation is the mechanism's.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  SLOT_GUN,
  angleDiff,
  batteryAimPoint,
  bearing,
  fireTurret,
  hullBumper,
  hullEnvelope,
  pickTurret,
  stepTurrets,
  turretBears,
  turretMounts,
  wrapAngle,
  type ShipClassId,
  type Vec2,
} from '@salvo/shared';
import { circleIsland } from './islandFixture.js';
import { ARC_OPEN_MARGIN_RAD, ARC_OPEN_TOLERANCE_RAD, allTurretsBear, bowSide, openArcBearing } from '../game/ai/arcs.js';
import { COMBAT_BRAIN, readyShotReaches, situationOf } from '../game/ai/tactics.js';
import { avoidBeacons, avoidHulls, avoidReachU } from '../game/ai/navigate.js';
import { beaconStandoffU } from '../game/ai/beacons.js';
import { ownReachU, pullBand } from '../game/ai/utility.js';
import { gunBand } from '../game/ai/doctrine.js';
import { leadPoint } from '../game/ai/tacticKit.js';
import { profileOf } from '../game/ai/profiles.js';
import { navCacheFor } from '../game/navCache.js';
import type { BotBeacon, BotPosture, RememberedContact } from '../game/ai/types.js';
import type { ShipRecord } from '../game/world.js';
import { fakePort, holdTarget, mkBot, mkMind, ocean, sail, track, trainOn, type FakePort } from './botHelmFixture.js';

const HULLS: readonly ShipClassId[] = SHIP_CLASS_IDS;
/** u — the fixture island's radius, and the shore band the nav grid keeps
 *  round it (a few cells): an island this far beyond the avoidance fan casts
 *  no avoidance term. */
const ISLE_R = 60;
const SHORE_U = 4 * CONFIG.bots.nav.cellU;
const ORIGIN: Vec2 = { x: 0, y: 0 };

/** The point `d` out on world bearing `a` from the origin. */
function at(a: number, d: number): Vec2 {
  return { x: Math.cos(a) * d, y: Math.sin(a) * d };
}

/** u — a hull's own length, the unit the ranges below are spread in. */
function lengthOf(hullId: ShipClassId): number {
  return hullEnvelope(hullId).hull.length;
}

describe('ai/arcs.ts — openArcBearing (unit, over the shared turretBears)', () => {
  const TARGET_BEARINGS = [0, 0.7, Math.PI / 2, 2.4, -3, -1.1];
  /** The wanted bearing as an offset from the bearing to the target: dead
   *  on, a little either side, abeam, and running (dead away, either side). */
  const WANT_OFFSETS = [0, 0.2, -0.2, 0.45, Math.PI / 2, -Math.PI / 2, Math.PI, Math.PI - 0.2, -(Math.PI - 0.2)];
  /** The bow's own offset from the target line (the side input). */
  const BOW_OFFSETS = [0.3, -0.3, 2.9, -2.9];

  /** Every case of the spread for one hull at one range. */
  function eachCase(hullId: ShipClassId, range: number, run: (c: { target: Vec2; brg: number; want: number; heading: number }) => void): void {
    for (const brg of TARGET_BEARINGS) {
      const target = at(brg, range);
      for (const w of WANT_OFFSETS) {
        for (const b of BOW_OFFSETS) run({ target, brg, want: wrapAngle(brg + w), heading: wrapAngle(brg + b) });
      }
    }
  }

  for (const hullId of HULLS) {
    const ranges = [2 * lengthOf(hullId), 5 * lengthOf(hullId), 20 * lengthOf(hullId)];

    it(`${hullId}: the answer bears EVERY turret, by the shared arc test from each station`, () => {
      for (const range of ranges) {
        eachCase(hullId, range, ({ target, want, heading }) => {
          const out = openArcBearing(hullId, ORIGIN, target, want, heading);
          const pose = { x: 0, y: 0, heading: out };
          turretMounts(hullId).forEach((_m, i) => expect(turretBears(hullId, i, pose, target)).toBe(true));
        });
      }
    });

    it(`${hullId}: a wanted bearing that already bears everything comes back UNCHANGED; a masked one is moved`, () => {
      let open = 0;
      let masked = 0;
      for (const range of ranges) {
        eachCase(hullId, range, ({ target, want, heading }) => {
          const out = openArcBearing(hullId, ORIGIN, target, want, heading);
          if (allTurretsBear(hullId, ORIGIN, want, target)) {
            open += 1;
            expect(out).toBe(want);
          } else {
            masked += 1;
            expect(out).not.toBe(want);
          }
        });
      }
      // The spread exercises both branches (beam-on is open, dead-on is masked).
      expect(open).toBeGreaterThan(0);
      expect(masked).toBeGreaterThan(0);
    });

    it(`${hullId}: NO FURTHER ROUND THAN NEEDED — the settle margin and a hair back toward the wanted bearing masks a turret again`, () => {
      const hair = ARC_OPEN_MARGIN_RAD + 1.5 * ARC_OPEN_TOLERANCE_RAD;
      for (const range of ranges) {
        eachCase(hullId, range, ({ target, brg, want, heading }) => {
          const out = openArcBearing(hullId, ORIGIN, target, want, heading);
          if (out === want) return;
          const side = bowSide(ORIGIN, target, heading);
          const thetaOut = Math.abs(angleDiff(brg, out));
          const thetaWant = Math.abs(angleDiff(brg, want));
          const back = thetaOut + Math.sign(thetaWant - thetaOut) * hair;
          expect(allTurretsBear(hullId, ORIGIN, wrapAngle(brg + side * back), target)).toBe(false);
          // ... and the margin never carries the answer past the beam.
          expect(Math.sign(Math.PI / 2 - thetaOut)).toBe(Math.sign(thetaOut - thetaWant));
        });
      }
    });

    it(`${hullId}: THE SIDE FOLLOWS THE BOW — the opened bearing lies on the bow's side of the target line`, () => {
      for (const range of ranges) {
        eachCase(hullId, range, ({ target, brg, want, heading }) => {
          const out = openArcBearing(hullId, ORIGIN, target, want, heading);
          if (out === want) return;
          expect(Math.sign(angleDiff(brg, out))).toBe(bowSide(ORIGIN, target, heading));
        });
      }
    });
  }

  it('the bow EXACTLY on the target line takes one fixed side, every time', () => {
    for (const hullId of HULLS) {
      const target = at(0.4, 10 * lengthOf(hullId));
      const a = openArcBearing(hullId, ORIGIN, target, 0.4, 0.4);
      const b = openArcBearing(hullId, ORIGIN, target, 0.4, 0.4);
      expect(a).toBe(b);
      expect(a).not.toBe(0.4);
      expect(Math.sign(angleDiff(0.4, a))).toBe(bowSide(ORIGIN, target, 0.4));
    }
  });

  it('a target alongside the hull (no heading opens every arc) leaves the wanted bearing alone', () => {
    for (const hullId of HULLS) {
      const target = { x: 0, y: 1 }; // a unit off the centreline, between the end turrets
      expect(allTurretsBear(hullId, ORIGIN, 0, target)).toBe(false); // beam-on to it, and still masked
      expect(openArcBearing(hullId, ORIGIN, target, 0, 0)).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// THE BRAIN
// ---------------------------------------------------------------------------

interface Rig {
  rec: ShipRecord;
  port: FakePort;
}

function rigFor(hullId: ShipClassId, seed: number, heading = 0): Rig {
  const w = ocean(seed);
  return { rec: mkBot(w, hullId, 0, 0, heading), port: fakePort(w) };
}

/** u — a range inside own main-battery reach, clear of the hull bumper. */
function inReach(rec: ShipRecord, port: FakePort, frac = 0.6): number {
  const reach = ownReachU(situationOf(rec, mkMind('raider'), port));
  expect(reach * frac).toBeGreaterThan(hullBumper(rec.hullId, 'bismarck'));
  return reach * frac;
}

/** One non-deliberating decision with `posture` held on a parked target. */
function rudderOn(rig: Rig, target: Vec2, posture: BotPosture, prep: (mind: ReturnType<typeof mkMind>) => void = () => {}): number {
  const mind = mkMind('raider');
  holdTarget(mind, track(rig.port.now, target), posture);
  prep(mind);
  return COMBAT_BRAIN.decide(rig.rec, mind, rig.port, false).rudder;
}

/** The posture's bearing was left alone (the hull is already on it). */
function expectUntouched(rudder: number): void {
  expect(Math.abs(rudder)).toBeLessThan(1e-9);
}

/** The helm is turning — by more than float fuzz. */
function expectTurning(rudder: number): void {
  expect(Math.abs(rudder)).toBeGreaterThan(0.01);
}

describe('COMBAT_BRAIN — the arc opening on the posture bearing (R2)', () => {
  for (const hullId of HULLS) {
    it(`${hullId} CHASE IN RANGE: pursuing a target dead ahead, the hull turns until every turret bears — and stays there`, () => {
      const rig = rigFor(hullId, 1201);
      const { rec, port } = rig;
      const target = { x: inReach(rec, port), y: 0 };
      expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(false); // nose-on masks the aft turrets
      const mind = mkMind('raider');
      holdTarget(mind, track(port.now, target), 'pursue');
      // The turn budget: a quarter turn at the hull's own rate, twice over.
      const ticks = Math.ceil((Math.PI / rec.stats.kinematics.turnRate / CONFIG.tick.simDtMs) * 1000);
      let firstOpen = -1;
      for (let i = 0; i < ticks; i += 1) {
        sail(rec, port, COMBAT_BRAIN.decide(rec, mind, port, false));
        const open = allTurretsBear(rec.hullId, rec.state, rec.state.heading, target);
        if (open && firstOpen < 0) firstOpen = i;
        // Once open it never closes again (the side cannot flap).
        if (firstOpen >= 0 && i > firstOpen + 1) expect(open).toBe(true);
      }
      expect(firstOpen).toBeGreaterThanOrEqual(0);
      expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(true);
      // It is still CLOSING: the bow is inside the beam of the target line.
      expect(Math.abs(angleDiff(bearing(rec.state, target), rec.state.heading))).toBeLessThan(Math.PI / 2);
    });

    it(`${hullId} RUN IN RANGE: disengaging on the reciprocal, the hull turns off its stern until every turret bears`, () => {
      const rig = rigFor(hullId, 1202, Math.PI); // bow dead away from the threat
      const { rec, port } = rig;
      const target = { x: inReach(rec, port), y: 0 };
      expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(false); // stern-on masks the forward turrets
      const mind = mkMind('raider');
      holdTarget(mind, track(port.now, target), 'disengage');
      const ticks = Math.ceil((Math.PI / rec.stats.kinematics.turnRate / CONFIG.tick.simDtMs) * 1000);
      for (let i = 0; i < ticks; i += 1) sail(rec, port, COMBAT_BRAIN.decide(rec, mind, port, false));
      expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(true);
      // It is still OPENING: the bow is abaft the beam of the target line.
      expect(Math.abs(angleDiff(bearing(rec.state, target), rec.state.heading))).toBeGreaterThan(Math.PI / 2);
    });
  }

  it('the turn goes to the side the bow already lies on', () => {
    const port0 = rigFor('iowa', 1203);
    const d = inReach(port0.rec, port0.port);
    const lean = 0.1;
    const toPort = rigFor('iowa', 1203, lean); // bow a little to port of the line
    const toStbd = rigFor('iowa', 1203, -lean);
    expect(rudderOn(toPort, { x: d, y: 0 }, 'pursue')).toBeGreaterThan(0);
    expect(rudderOn(toStbd, { x: d, y: 0 }, 'pursue')).toBeLessThan(0);
  });

  it('BEYOND REACH the bearing is untouched; inside it the same chase turns', () => {
    const rig = rigFor('bismarck', 1204);
    const reach = inReach(rig.rec, rig.port, 1);
    expectUntouched(rudderOn(rig, { x: reach * 1.1, y: 0 }, 'pursue'));
    expectTurning(rudderOn(rig, { x: reach * 0.6, y: 0 }, 'pursue'));
  });

  it('a LINE OF FIRE BLOCKED BY LAND leaves the bearing untouched', () => {
    // The island stands beyond the avoidance fan, between hull and target.
    const probe = rigFor('bismarck', 1205);
    const d = inReach(probe.rec, probe.port, 0.9);
    const fan = avoidReachU(probe.rec.stats);
    const isle = circleIsland((fan + d) / 2, 0, ISLE_R);
    expect(isle.x - ISLE_R - SHORE_U).toBeGreaterThan(fan);
    const w = ocean(1205, [isle]);
    const rig = { rec: mkBot(w, 'bismarck', 0, 0, 0), port: fakePort(w) };
    expectUntouched(rudderOn(rig, { x: d, y: 0 }, 'pursue'));
    expectTurning(rudderOn(probe, { x: d, y: 0 }, 'pursue')); // the control: open water turns
  });

  it('FOLLOWING A ROUTE round land the bearing is the route\'s; the same geometry steering straight turns', () => {
    // The chart the route layer reads has land on the line; the line of FIRE
    // (the map's islands) is clear — so only the route clause can hold the
    // bearing. The hull already points at its waypoint, a bearing that masks
    // the aft turrets.
    const rig = rigFor('warspite', 1206, 0.15);
    const { rec, port } = rig;
    const d = inReach(rec, port, 0.9);
    const target = { x: d, y: 0 };
    const fan = avoidReachU(rec.stats);
    const charted = ocean(1206, [circleIsland((fan + d) / 2, 0, ISLE_R)]);
    expect((fan + d) / 2 - ISLE_R - SHORE_U).toBeGreaterThan(fan);
    const waypoint = { x: Math.cos(0.15) * d, y: Math.sin(0.15) * d };
    expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(false);
    const routed = rudderOn({ rec, port: { ...port, nav: navCacheFor(charted.map) } }, target, 'pursue', (mind) => {
      mind.route = { goal: { ...target }, waypoints: [waypoint], builtAt: port.now };
    });
    expectUntouched(routed);
    expect(rudderOn(rig, target, 'pursue')).toBeGreaterThan(0.01); // no route: the arcs open, further to port
  });

  it('BREAKING OFF FOR A COVER POINT the bearing is the cover\'s; on the plain reciprocal it turns', () => {
    const rig = rigFor('yamato', 1207, Math.PI - 0.15); // running, a little off dead away
    const { rec, port } = rig;
    const d = inReach(rec, port);
    const target = { x: d, y: 0 };
    const cover = { x: Math.cos(rec.state.heading) * d, y: Math.sin(rec.state.heading) * d }; // dead ahead of the bow
    expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, target)).toBe(false);
    expectUntouched(rudderOn(rig, target, 'disengage', (mind) => (mind.coverPoint = cover)));
    expectUntouched(rudderOn(rig, target, 'hide', (mind) => (mind.coverPoint = cover)));
    expectTurning(rudderOn(rig, target, 'disengage'));
    expectTurning(rudderOn(rig, target, 'hide'));
  });

  it('BEAM-ON IN THE BAND is already open: kite and engage orbit exactly as before', () => {
    const rig = rigFor('iowa', 1208, -Math.PI / 2); // the target due east is dead abeam
    const { rec, port } = rig;
    const sit = situationOf(rec, mkMind('raider'), port);
    const reach = ownReachU(sit);
    expectUntouched(rudderOn(rig, { x: (reach * (1 + CONFIG.bots.kiteHoldFrac)) / 2, y: 0 }, 'kite'));
    const band = pullBand(gunBand(profileOf('raider'), rec.stats, sit.gunId), readyShotReaches(rec, rec.stats));
    expect(band.max).toBeGreaterThan(band.min);
    expectUntouched(rudderOn(rig, { x: (band.min + band.max) / 2, y: 0 }, 'engage'));
  });

  it('THE ARCS OPEN ON THE LEAD POINT, NOT THE PLOT (Story 10.12 review gate): a plot abeam whose lead lies near the bow turns the hull', () => {
    const rig = rigFor('iowa', 1208, -Math.PI / 2); // the plot due east is dead abeam
    const { rec, port } = rig;
    const sit = situationOf(rec, mkMind('raider'), port);
    const band = pullBand(gunBand(profileOf('raider'), rec.stats, sit.gunId), readyShotReaches(rec, rec.stats));
    const plot = { x: (band.min + band.max) / 2, y: 0 };
    // A crossing course along the bow's own direction, fast enough that the
    // lead solve lands near the bow (the slowest of a few that masks a turret).
    const crossingAt = (f: number): RememberedContact => track(port.now, { ...plot, heading: rec.state.heading, speed: CONFIG.mainBattery.shellSpeed * f });
    const masked = (f: number): boolean =>
      !allTurretsBear(rec.hullId, rec.state, rec.state.heading, leadPoint(sit, crossingAt(f), CONFIG.mainBattery.shellSpeed));
    const f = [0.5, 0.8, 0.95, 1.2, 1.5].find(masked);
    expect(f).toBeDefined(); // the lead is masked
    const crossing = crossingAt(f!);
    expect(allTurretsBear(rec.hullId, rec.state, rec.state.heading, plot)).toBe(true); // the plot alone opens nothing
    expectUntouched(rudderOn(rig, plot, 'engage')); // the control: a parked plot, nothing to open
    expectTurning(rudderOn(rig, crossing, 'engage'));
  });

  it('a KITE opening from inside its hold line runs on the reciprocal — and angles off it', () => {
    const rig = rigFor('bismarck', 1209, Math.PI); // bow dead away
    const reach = inReach(rig.rec, rig.port, 1);
    expectTurning(rudderOn(rig, { x: reach * CONFIG.bots.kiteHoldFrac * 0.5, y: 0 }, 'kite'));
  });

  it('RAM never angles off: a target dead ahead is steered AT', () => {
    const rig = rigFor('yamato', 1210);
    expectUntouched(rudderOn(rig, { x: inReach(rig.rec, rig.port), y: 0 }, 'ram'));
  });

  it('a hull with NO BATTERY has no arcs to open', () => {
    const rig = rigFor('bismarck', 1211);
    const d = inReach(rig.rec, rig.port);
    rig.rec.turrets.length = 0;
    expectUntouched(rudderOn(rig, { x: d, y: 0 }, 'pursue'));
  });

  it('EVERY CLICK ON THE WAY ROUND IS ON TARGET AT THE SERVER: stepped as the server steps (hull, then turrets, then the pick)', () => {
    const rig = rigFor('bismarck', 1212);
    const { rec, port } = rig;
    const target = { x: inReach(rec, port), y: 0 };
    const mind = mkMind('raider');
    holdTarget(mind, track(port.now, target), 'pursue');
    const reloadMs = rec.stats.equipment.mainBattery.reloadMs;
    let clicks = 0;
    let turning = 0;
    let clicksInTheTurn = 0;
    for (let i = 0; i < 200; i += 1) {
      const before = rec.state.heading;
      const d = COMBAT_BRAIN.decide(rec, mind, port, false);
      // The brain's prediction IS the pose the hull takes (open water).
      const predicted = mind.nextPose;
      sail(rec, port, d);
      expect(predicted).toMatchObject({ x: rec.state.x, y: rec.state.y, heading: rec.state.heading, speed: rec.state.speed });
      const turned = rec.state.heading !== before;
      if (turned) turning += 1;
      // The server's own order: the aim point off the POST-MOVE pose, the
      // turret step, then the pick.
      const p = batteryAimPoint(rec.state, d.aim, d.aimDist);
      stepTurrets(rec.turrets, rec.hullId, rec.state, p, CONFIG.tick.simDtMs);
      if (d.fireSlot !== SLOT_GUN || p === null) continue;
      const pick = pickTurret(rec.turrets, rec.hullId, rec.state, p);
      expect(pick).not.toBeNull(); // a click only when a ready turret bears (no traverse, Story 11.1)
      fireTurret(rec.turrets, pick!.index, reloadMs);
      clicks += 1;
      if (turned) clicksInTheTurn += 1;
    }
    expect(turning).toBeGreaterThan(0); // the run really did include the turn
    expect(clicksInTheTurn).toBeGreaterThan(0); // ... and clicks made while the hull was swinging
    // Every turret got its salvo away: the aft ones only could once the arcs opened.
    expect(clicks).toBeGreaterThanOrEqual(turretMounts(rec.hullId).length);
  });
});

// ---------------------------------------------------------------------------
// FARM WITH A TARGET (the helm half of R4)
// ---------------------------------------------------------------------------

describe('COMBAT_BRAIN — a beacon farmer with a target (R4, the helm half)', () => {
  /** A hull ON STATION at a beacon at the origin (its standoff point). */
  function stationed(hullId: ShipClassId, seed: number): Rig & { mind: ReturnType<typeof mkMind> } {
    const w = ocean(seed);
    const r = beaconStandoffU();
    const rec = mkBot(w, hullId, r, 0, 0);
    rec.state.speed = 0;
    const mind = mkMind('siege');
    mind.beaconGoal = { x: 0, y: 0, bearing: 0, standoff: { x: r, y: 0 }, centerSide: false, paying: true };
    return { rec, port: fakePort(w), mind };
  }

  it('ON STATION with a target in reach: dead in the water (no lane nudge, no arc opening) — and it still CLICKS when a turret is on target', () => {
    const { rec, port, mind } = stationed('iowa', 1220);
    const reach = ownReachU(situationOf(rec, mind, port));
    const target = { x: rec.state.x + reach * 0.6, y: 0 }; // dead ahead: the aft turrets are masked
    holdTarget(mind, track(port.now, target), 'farm');
    trainOn(rec, target.x, target.y);
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect(d.throttle).toBe(0);
    expect(d.rudder).toBe(0);
    expect(d.fireSlot).toBe(SLOT_GUN);
    expect(Math.abs(angleDiff(bearing(rec.state, target), d.aim))).toBeLessThan(0.1);
  });

  it('ON STATION with every turret reloading: still parked, the aim HELD on the target', () => {
    const { rec, port, mind } = stationed('yamato', 1221);
    const reach = ownReachU(situationOf(rec, mind, port));
    const target = { x: rec.state.x, y: reach * 0.6 };
    holdTarget(mind, track(port.now, target), 'farm');
    for (const t of rec.turrets) t.reloadMsLeft = rec.stats.equipment.mainBattery.reloadMs;
    const d = COMBAT_BRAIN.decide(rec, mind, port, false);
    expect([d.throttle, d.rudder, d.fireSlot]).toEqual([0, 0, null]);
    expect(d.aimDist).toBeGreaterThan(0);
    expect(Math.abs(angleDiff(bearing(rec.state, target), d.aim))).toBeLessThan(0.1);
  });

  it('IN TRANSIT with a target in reach: it sails for the STANDOFF at the transit throttle, the bearing left alone', () => {
    const w = ocean(1222);
    const port = fakePort(w);
    const rec = mkBot(w, 'bismarck', 0, 0, 0); // bow due east, at the standoff far ahead
    const reach = ownReachU(situationOf(rec, mkMind('siege'), port));
    const far = CONFIG.beacons.rangeU * 4;
    const withTarget = mkMind('siege');
    withTarget.beaconGoal = { x: far + beaconStandoffU(), y: 0, bearing: Math.PI, standoff: { x: far, y: 0 }, centerSide: false, paying: true };
    holdTarget(withTarget, track(port.now, { x: 0, y: -reach * 0.5 }), 'farm'); // a target off the starboard beam... not on the line
    const alone = mkMind('siege');
    alone.beaconGoal = withTarget.beaconGoal;
    alone.posture = 'farm';
    const a = COMBAT_BRAIN.decide(rec, withTarget, port, false);
    const b = COMBAT_BRAIN.decide(rec, alone, port, false);
    expectUntouched(a.rudder);
    expect([a.throttle, a.rudder]).toEqual([b.throttle, b.rudder]); // the target changes nothing about the helm
    expect(a.throttle).toBeGreaterThan(0);
  });

  it('`farm` with NO beacon goal falls back as before: a target is band-held, nothing sits still', () => {
    const rig = rigFor('iowa', 1223, Math.PI);
    const reach = inReach(rig.rec, rig.port, 1);
    const mind = mkMind('siege');
    holdTarget(mind, track(rig.port.now, { x: reach * 0.9, y: 0 }), 'farm');
    expect(COMBAT_BRAIN.decide(rig.rec, mind, rig.port, false).throttle).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// BEACON BODIES
// ---------------------------------------------------------------------------

describe('beacon bodies — an avoidance term in every posture', () => {
  const beacon = (phase: BotBeacon['phase'], x: number, y: number): BotBeacon => ({ x, y, phase, rate01: phase === 'afloat' ? 1 : 0 });
  const chart = (list: readonly BotBeacon[]) => ({ beacons: () => list });
  /** A point ahead of the bow, a little to port, well inside every point lookahead. */
  const AHEAD = { x: CONFIG.bots.hullLookaheadU / 2, y: CONFIG.bots.hullLookaheadU / 8 };

  it('a SOLID beacon (afloat or sinking) ahead takes the hull kernel\'s own bias; charted and gone ones are not there', () => {
    const { rec } = rigFor('bismarck', 1230);
    const mind = mkMind('raider');
    mind.contacts.set('stranger', track(0, { id: 'stranger', ...AHEAD }));
    const asHull = avoidHulls(rec, mind, 'reposition');
    expect(asHull).not.toBe(0);
    expect(avoidBeacons(rec, chart([beacon('afloat', AHEAD.x, AHEAD.y)]))).toBe(asHull);
    expect(avoidBeacons(rec, chart([beacon('sinking', AHEAD.x, AHEAD.y)]))).toBe(asHull);
    expect(avoidBeacons(rec, chart([beacon('charted', AHEAD.x, AHEAD.y)]))).toBe(0);
    expect(avoidBeacons(rec, chart([beacon('gone', AHEAD.x, AHEAD.y)]))).toBe(0);
  });

  it('the sign law is the point kernel\'s: to port → steer starboard, mirrored → port; astern and far ahead → nothing', () => {
    const { rec } = rigFor('iowa', 1231);
    const port = avoidBeacons(rec, chart([beacon('afloat', AHEAD.x, AHEAD.y)]));
    const stbd = avoidBeacons(rec, chart([beacon('afloat', AHEAD.x, -AHEAD.y)]));
    expect(port).toBeLessThan(0);
    expect(stbd).toBe(-port);
    expect(avoidBeacons(rec, chart([beacon('afloat', -AHEAD.x, AHEAD.y)]))).toBe(0);
    const far = (CONFIG.bots.hullLookaheadU + CONFIG.beacons.bodyRadiusU) * 2;
    expect(avoidBeacons(rec, chart([beacon('afloat', far, 0)]))).toBe(0);
    expect(avoidBeacons(rec, {})).toBe(0); // a port with no chart
  });

  it('the brain steers round it in every posture that is under way', () => {
    const postures: readonly BotPosture[] = ['reposition', 'pursue', 'engage', 'kite', 'disengage', 'hide', 'ram', 'farm'];
    for (const posture of postures) {
      const rig = rigFor('bismarck', 1232);
      const target = { x: 0, y: inReach(rig.rec, rig.port) };
      const clear = rudderOn(rig, target, posture);
      // The body goes on the side the helm is NOT already hard over to, so
      // its push can show on a clamped rudder.
      const side = clear > 0 ? 1 : -1;
      const solid = { ...rig, port: { ...rig.port, beacons: () => [beacon('afloat', AHEAD.x, side * AHEAD.y)] } };
      const bent = rudderOn(solid, target, posture);
      expect((clear - bent) * side, posture).toBeGreaterThan(0.01); // pushed away from the body's side
    }
  });
});
