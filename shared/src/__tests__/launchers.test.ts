// THE TORPEDO LAUNCHERS (Story 10.6, Eric 2026-11-05, R6 / R13 / R14 / R16) —
// sim/launchers.ts as a set of laws over CONFIG, never literal tables:
//
//   (1) geometry: stations on the centerline inside the hull, FORE ahead of
//       the forward turrets and AFT abaft the aft turrets; a drone has none;
//   (2) the arc: rest ± CONFIG.launcher.trainDeg; traverse at the BATTERY's
//       rate; HOLD outside the arc; never through the blind wedge;
//   (3) THE PICK (R16): no launcher's arc holds the aim → `out-of-arc`,
//       nothing spent; on-target first, else the nearest fires early along its
//       CURRENT bearing; arc holds but no tube loaded → `cooling`; one click,
//       one torpedo;
//   (4) each tube its own clock;
//   (5) the torpedo leaves from the launcher's station along its bearing,
//       clear of the own hull;
//   (6) lifecycle: create loaded, resize arrives loaded with running clocks
//       untouched, rescale by new ÷ old, INSTANT RELOAD loads every tube, the
//       slot summary, the whole-degree contact codec.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DRONE_HULL_IDS,
  SHIP_CLASS_IDS,
  arcFor,
  copyLaunchers,
  decodeLauncherAngle,
  effectiveStats,
  encodeLauncherAngles,
  fireTube,
  hullEnvelope,
  hullSilhouette,
  initialLaunchers,
  launcherAimPoint,
  launcherArcHolds,
  launcherBears,
  launcherRest,
  launcherSectors,
  launcherStation,
  launcherStationWorld,
  launcherSummary,
  launcherTrainRad,
  mulberry32,
  pickTube,
  pointInPolygon,
  pointPolygonDistance,
  reloadAllTubes,
  rescaleTubeReloads,
  resizeLaunchers,
  stepLaunchers,
  torpedoLaunchPoint,
  transformPolygon,
  turretMounts,
  turretStation,
  wrapAngle,
  type AimPose,
  type LauncherState,
  type ShipClassId,
  type Vec2,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const RATE = (CONFIG.mainBattery.traverseDegPerS * Math.PI) / 180; // rad/s — the turrets' rate, READ
const STEP = (RATE * DT) / 1000;
const TOL = (CONFIG.mainBattery.onTargetDeg * Math.PI) / 180;
const TRAIN = (CONFIG.launcher.trainDeg * Math.PI) / 180;
const FAR = 1e6; // u — far enough that station parallax is nothing
const HULL: ShipClassId = 'iowa';
const POSE: AimPose = { x: 40, y: -25, heading: 0.7 };

const counts = (torpedoLaunchers: number, tubesPerLauncher: number) => ({ torpedoLaunchers, tubesPerLauncher });
/** A world point at a HULL-RELATIVE bearing from the ship centre. */
const at = (pose: AimPose, rel: number, dist = FAR): Vec2 => ({
  x: pose.x + Math.cos(pose.heading + rel) * dist,
  y: pose.y + Math.sin(pose.heading + rel) * dist,
});
const settle = (states: LauncherState[], hull: ShipClassId, pose: AimPose, aim: Vec2, ticks = 200): void => {
  for (let i = 0; i < ticks; i += 1) stepLaunchers(states, hull, pose, aim, DT);
};
const loadedTubes = (states: readonly LauncherState[]): number =>
  states.reduce((n, l) => n + l.tubes.filter((t) => t <= 0).length, 0);

describe('launcher geometry', () => {
  it.each(SHIP_CLASS_IDS)('%s: both stations sit inside the hull, outboard of the end turrets', (hull) => {
    const poly = hullSilhouette(hull);
    const fore = launcherStation(hull, 0);
    const aft = launcherStation(hull, 1);
    for (const st of [fore, aft]) {
      expect(st.y).toBe(0);
      expect(pointInPolygon(st, poly)).toBe(true);
    }
    const turretXs = turretMounts(hull).map((_, i) => turretStation(hull, i).x);
    expect(fore.x).toBeGreaterThan(Math.max(...turretXs)); // ahead of every turret
    expect(aft.x).toBeLessThan(Math.min(...turretXs)); // abaft every turret
  });

  it('rests dead ahead (fore) and dead astern (aft)', () => {
    expect(launcherRest(0)).toBe(0);
    expect(launcherRest(1)).toBe(Math.PI);
    const ls = initialLaunchers(HULL, counts(2, 1));
    expect(ls.map((l) => l.a)).toEqual([0, Math.PI]);
  });

  it('the world station rides the pose', () => {
    const local = launcherStation(HULL, 0);
    const w = launcherStationWorld(HULL, 0, POSE);
    expect(w.x).toBeCloseTo(POSE.x + Math.cos(POSE.heading) * local.x, 9);
    expect(w.y).toBeCloseTo(POSE.y + Math.sin(POSE.heading) * local.x, 9);
  });

  it.each(DRONE_HULL_IDS)('%s mounts no launcher whatever the counts say', (hull) => {
    const ls = initialLaunchers(hull, counts(2, 2));
    expect(ls).toEqual([]);
    expect(pickTube(ls, hull, POSE, at(POSE, 0)).verdict).toBe('out-of-arc');
    expect(launcherSummary(ls)).toEqual({ n: 0, reloadMsLeft: 0 });
  });

  it('every torpedo id declares the launcher arc; the union is one sector per launcher held', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'launcher' });
    }
    expect(launcherTrainRad()).toBeCloseTo(TRAIN, 12);
    expect(launcherSectors(1)).toEqual([{ kind: 'sector', offset: 0, halfArc: launcherTrainRad() }]);
    expect(launcherSectors(2)).toEqual([
      { kind: 'sector', offset: 0, halfArc: launcherTrainRad() },
      { kind: 'sector', offset: Math.PI, halfArc: launcherTrainRad() },
    ]);
  });
});

describe('the arc and the traverse', () => {
  it('a launcher bears inside rest ± train and not outside it', () => {
    const eps = 1e-3;
    expect(launcherBears(HULL, 0, POSE, at(POSE, TRAIN - eps))).toBe(true);
    expect(launcherBears(HULL, 0, POSE, at(POSE, -(TRAIN - eps)))).toBe(true);
    expect(launcherBears(HULL, 0, POSE, at(POSE, TRAIN + eps))).toBe(false);
    expect(launcherBears(HULL, 0, POSE, at(POSE, Math.PI))).toBe(false);
    expect(launcherBears(HULL, 1, POSE, at(POSE, Math.PI))).toBe(true);
    expect(launcherBears(HULL, 1, POSE, at(POSE, 0))).toBe(false);
  });

  it('launcherArcHolds (no parallax) agrees with the per-launcher test at long range', () => {
    const rnd = mulberry32(106);
    for (let k = 0; k < 400; k += 1) {
      const rel = (rnd.next() * 2 - 1) * Math.PI;
      if (Math.abs(Math.abs(rel) - TRAIN) < 1e-3 || Math.abs(Math.abs(rel) - (Math.PI - TRAIN)) < 1e-3) continue;
      const aim = at(POSE, rel);
      const bearing = POSE.heading + rel;
      expect(launcherArcHolds(1, POSE.heading, bearing)).toBe(launcherBears(HULL, 0, POSE, aim));
      expect(launcherArcHolds(2, POSE.heading, bearing)).toBe(
        launcherBears(HULL, 0, POSE, aim) || launcherBears(HULL, 1, POSE, aim),
      );
    }
    expect(launcherArcHolds(0, POSE.heading, POSE.heading)).toBe(false);
  });

  it('traverses at the battery rate, arrives exactly and never overshoots', () => {
    const ls = initialLaunchers(HULL, counts(1, 1));
    const aim = at(POSE, 1.0);
    stepLaunchers(ls, HULL, POSE, aim, DT);
    expect(ls[0].a).toBeCloseTo(STEP, 12);
    settle(ls, HULL, POSE, aim);
    expect(ls[0].a).toBeCloseTo(1.0, 3); // the aim is at a hull-relative 1.0 rad from the CENTRE; the station's parallax at 1e6 u is ~3e-5
    const before = ls[0].a;
    stepLaunchers(ls, HULL, POSE, aim, DT);
    expect(ls[0].a).toBe(before);
  });

  it('HOLDS its angle when the aim leaves the arc, and with no aim at all', () => {
    const ls = initialLaunchers(HULL, counts(1, 1));
    settle(ls, HULL, POSE, at(POSE, 1.2));
    const held = ls[0].a;
    settle(ls, HULL, POSE, at(POSE, Math.PI), 40); // dead astern: the fore launcher's blind wedge
    expect(ls[0].a).toBe(held);
    stepLaunchers(ls, HULL, POSE, null, DT);
    expect(ls[0].a).toBe(held);
  });

  it('never leaves its train interval and reaches the far side through rest', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const rnd = mulberry32(7);
    let aim = at(POSE, 2.3);
    for (let t = 0; t < 4000; t += 1) {
      if (t % 37 === 0) aim = at(POSE, (rnd.next() * 2 - 1) * Math.PI, 50 + rnd.next() * 2000);
      const prev = ls.map((l) => l.a);
      stepLaunchers(ls, HULL, POSE, aim, DT);
      ls.forEach((l, i) => {
        expect(Math.abs(l.a - launcherRest(i))).toBeLessThanOrEqual(TRAIN + 1e-9);
        expect(Math.abs(l.a - prev[i])).toBeLessThanOrEqual(STEP + 1e-12);
      });
    }
  });

  it('the aim point: none for a neutral input; a close-in cursor keeps its bearing', () => {
    expect(launcherAimPoint(POSE, HULL, 1, 0)).toBeNull();
    expect(launcherAimPoint(POSE, HULL, Number.NaN, 300)).toBeNull();
    expect(launcherAimPoint(POSE, HULL, 1, Number.POSITIVE_INFINITY)).toBeNull();
    const far = launcherAimPoint(POSE, HULL, 2.1, 900) as Vec2;
    expect(far.x).toBeCloseTo(POSE.x + Math.cos(2.1) * 900, 9);
    expect(far.y).toBeCloseTo(POSE.y + Math.sin(2.1) * 900, 9);
    // A cursor on the own deck: same bearing from the centre, pushed clear of the hull.
    const near = launcherAimPoint(POSE, HULL, 2.1, 3) as Vec2;
    expect(Math.atan2(near.y - POSE.y, near.x - POSE.x)).toBeCloseTo(2.1, 9);
    const poly = transformPolygon(hullSilhouette(HULL), POSE.x, POSE.y, POSE.heading);
    expect(pointInPolygon(near, poly)).toBe(false);
    for (const i of [0, 1]) {
      const st = launcherStationWorld(HULL, i, POSE);
      expect(Math.hypot(near.x - st.x, near.y - st.y)).toBeGreaterThan(1);
    }
  });
});

describe('the pick (R16)', () => {
  it('fore-only, aim astern: out-of-arc, nothing spent, the launcher holds', () => {
    const ls = initialLaunchers(HULL, counts(1, 2));
    const aim = at(POSE, Math.PI);
    stepLaunchers(ls, HULL, POSE, aim, DT);
    const snapshot = JSON.stringify(ls);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'out-of-arc' });
    expect(JSON.stringify(ls)).toBe(snapshot);
    expect(pickTube(ls, HULL, POSE, null)).toEqual({ verdict: 'out-of-arc' }); // no aim names no area
  });

  it('both launchers bear, four tubes loaded: exactly ONE torpedo per click', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    const aim = at(POSE, Math.PI / 2); // the beam: inside both arcs
    settle(ls, HULL, POSE, aim);
    const pick = pickTube(ls, HULL, POSE, aim);
    expect(pick.verdict).toBe('fire');
    if (pick.verdict !== 'fire') return;
    expect(loadedTubes(ls)).toBe(4); // the pick is pure
    fireTube(ls, pick.launcher, pick.tube, 25000);
    expect(loadedTubes(ls)).toBe(3);
    expect(ls[pick.launcher].tubes[pick.tube]).toBe(25000);
  });

  it('on-target first: an on-target aft launcher beats an off-target fore one', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const aim = at(POSE, Math.PI / 2);
    settle(ls, HULL, POSE, aim);
    ls[0].a -= 0.4; // the fore launcher is knocked off the aim; aft stays on it
    const pick = pickTube(ls, HULL, POSE, aim);
    expect(pick).toMatchObject({ verdict: 'fire', launcher: 1, onTarget: true });
    if (pick.verdict !== 'fire') return;
    const st = launcherStationWorld(HULL, 1, POSE);
    expect(wrapAngle(pick.bearing - Math.atan2(aim.y - st.y, aim.x - st.x))).toBeCloseTo(0, 9);
    expect(pick.station).toEqual(st);
  });

  it('nobody on target: the smallest error fires EARLY along its current bearing', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const aim = at(POSE, Math.PI / 2);
    settle(ls, HULL, POSE, aim);
    ls[0].a -= 0.5;
    ls[1].a += 0.2; // nearer than the fore launcher, still beyond the tolerance
    expect(0.2).toBeGreaterThan(TOL);
    const pick = pickTube(ls, HULL, POSE, aim);
    expect(pick).toMatchObject({ verdict: 'fire', launcher: 1, onTarget: false });
    if (pick.verdict !== 'fire') return;
    expect(pick.bearing).toBe(POSE.heading + ls[1].a);
  });

  it('a launcher whose arc does not hold the aim NEVER fires, however ready it is', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    const aim = at(POSE, Math.PI); // dead astern: only the aft launcher can point there
    settle(ls, HULL, POSE, aim);
    for (let k = 0; k < 2; k += 1) {
      const pick = pickTube(ls, HULL, POSE, aim);
      expect(pick).toMatchObject({ verdict: 'fire', launcher: 1 });
      if (pick.verdict === 'fire') fireTube(ls, pick.launcher, pick.tube, 30000);
    }
    // The aft tubes are spent; the fore launcher is loaded but cannot point astern.
    expect(ls[0].tubes.every((t) => t <= 0)).toBe(true);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'cooling' });
  });

  it('arc holds but every tube is reloading: cooling', () => {
    const ls = initialLaunchers(HULL, counts(1, 2));
    const aim = at(POSE, 0.3);
    settle(ls, HULL, POSE, aim);
    fireTube(ls, 0, 0, 20000);
    fireTube(ls, 0, 1, 20000);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'cooling' });
  });

  it('a bearing launcher with no loaded tube yields to a bearing one that has one', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const aim = at(POSE, Math.PI / 2);
    settle(ls, HULL, POSE, aim);
    fireTube(ls, 0, 0, 20000);
    expect(pickTube(ls, HULL, POSE, aim)).toMatchObject({ verdict: 'fire', launcher: 1, tube: 0 });
  });
});

describe('tubes', () => {
  it('each tube has its own clock', () => {
    const ls = initialLaunchers(HULL, counts(1, 2));
    const aim = at(POSE, 0);
    const first = pickTube(ls, HULL, POSE, aim);
    expect(first).toMatchObject({ verdict: 'fire', tube: 0 });
    fireTube(ls, 0, 0, 1000);
    stepLaunchers(ls, HULL, POSE, aim, DT);
    expect(ls[0].tubes).toEqual([1000 - DT, 0]);
    expect(pickTube(ls, HULL, POSE, aim)).toMatchObject({ verdict: 'fire', tube: 1 });
    fireTube(ls, 0, 1, 1000);
    for (let t = 0; t < 1000 / DT - 1; t += 1) stepLaunchers(ls, HULL, POSE, aim, DT);
    expect(ls[0].tubes).toEqual([0, DT]); // the first tube is back one tick before the second
    stepLaunchers(ls, HULL, POSE, aim, DT);
    expect(ls[0].tubes).toEqual([0, 0]);
  });

  it('the slot summary counts loaded tubes and reports the soonest reload', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    expect(launcherSummary(ls)).toEqual({ n: 4, reloadMsLeft: 0 });
    fireTube(ls, 0, 1, 9000);
    fireTube(ls, 1, 0, 4000);
    expect(launcherSummary(ls)).toEqual({ n: 2, reloadMsLeft: 4000 });
  });
});

describe('the launch point', () => {
  it.each(SHIP_CLASS_IDS)('%s: on the bearing from the station, clear of the own hull', (hull) => {
    const poly = transformPolygon(hullSilhouette(hull), POSE.x, POSE.y, POSE.heading).map((v) => ({ ...v }));
    const rnd = mulberry32(11);
    for (let k = 0; k < 60; k += 1) {
      const i = k % 2;
      const bearing = POSE.heading + launcherRest(i) + (rnd.next() * 2 - 1) * TRAIN;
      const station = launcherStationWorld(hull, i, POSE);
      const p = torpedoLaunchPoint(station, POSE, hull, bearing);
      expect(wrapAngle(Math.atan2(p.y - station.y, p.x - station.x) - bearing)).toBeCloseTo(0, 6);
      expect(pointInPolygon(p, poly)).toBe(false);
      expect(pointPolygonDistance(p, poly)).toBeGreaterThanOrEqual(CONFIG.torpedo.hitRadius);
    }
  });
});

describe('lifecycle', () => {
  it('follows the folded counts: the cards mount launchers and tubes, in either order', () => {
    const cls = hullEnvelope(HULL);
    const shape = (cards: string[]): number[] => initialLaunchers(HULL, effectiveStats(cls, cards)).map((l) => l.tubes.length);
    expect(shape(['heavyTorpedo'])).toEqual([1]);
    expect(shape(['heavyTorpedo', 'aftTorpedoLauncher'])).toEqual([1, 1]);
    expect(shape(['heavyTorpedo', 'secondLauncherTube'])).toEqual([2]);
    expect(shape(['heavyTorpedo', 'secondLauncherTube', 'aftTorpedoLauncher'])).toEqual([2, 2]);
    expect(shape(['heavyTorpedo', 'aftTorpedoLauncher', 'secondLauncherTube'])).toEqual([2, 2]);
  });

  it('everything arrives loaded', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    expect(ls.every((l) => l.tubes.every((t) => t === 0))).toBe(true);
  });

  it('resize: a new launcher and a new tube arrive loaded; running clocks and angles are untouched', () => {
    const ls = initialLaunchers(HULL, counts(1, 1));
    settle(ls, HULL, POSE, at(POSE, 0.9));
    fireTube(ls, 0, 0, 12345);
    const a0 = ls[0].a;
    resizeLaunchers(ls, HULL, counts(1, 2)); // SECOND LAUNCHER TUBE
    expect(ls).toEqual([{ a: a0, tubes: [12345, 0] }]);
    resizeLaunchers(ls, HULL, counts(2, 2)); // AFT TORPEDO LAUNCHER — arrives with two tubes
    expect(ls).toEqual([
      { a: a0, tubes: [12345, 0] },
      { a: Math.PI, tubes: [0, 0] },
    ]);
    resizeLaunchers(ls, HULL, counts(2, 2)); // idempotent
    expect(ls[0].tubes).toEqual([12345, 0]);
  });

  it('rescale keeps the progress fraction per tube and gives nothing away', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    fireTube(ls, 0, 0, 10000);
    fireTube(ls, 1, 1, 4000);
    rescaleTubeReloads(ls, 0.5);
    expect(ls.map((l) => l.tubes)).toEqual([
      [5000, 0],
      [0, 2000],
    ]);
  });

  it('INSTANT RELOAD loads every tube and moves no launcher (R14)', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    settle(ls, HULL, POSE, at(POSE, Math.PI / 2));
    const angles = ls.map((l) => l.a);
    for (const l of ls) l.tubes.fill(7000);
    reloadAllTubes(ls);
    expect(loadedTubes(ls)).toBe(4);
    expect(ls.map((l) => l.a)).toEqual(angles);
  });

  it('copyLaunchers overwrites and resizes without sharing arrays', () => {
    const from: LauncherState[] = [
      { a: 0.3, tubes: [0, 500] },
      { a: 3, tubes: [9, 0] },
    ];
    const into: LauncherState[] = [{ a: 1, tubes: [1] }];
    expect(copyLaunchers(into, from)).toBe(into);
    expect(into).toEqual(from);
    expect(into[0].tubes).not.toBe(from[0].tubes);
    expect(copyLaunchers(into, [])).toEqual([]);
  });
});

describe('the contact codec', () => {
  it('round-trips a launcher angle to within half a degree, per launcher', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    settle(ls, HULL, POSE, at(POSE, 1.9));
    const wire = encodeLauncherAngles(ls);
    expect(wire.every((q) => Number.isInteger(q))).toBe(true);
    ls.forEach((l, i) => {
      expect(Math.abs(decodeLauncherAngle(i, wire[i]) - l.a)).toBeLessThanOrEqual(Math.PI / 360 + 1e-12);
    });
  });

  it('a malformed entry can never draw a launcher through its blind wedge', () => {
    for (const i of [0, 1]) {
      for (const q of [Number.NaN, 1e9, -1e9, Number.POSITIVE_INFINITY]) {
        expect(Math.abs(decodeLauncherAngle(i, q) - launcherRest(i))).toBeLessThanOrEqual(TRAIN + 1e-12);
      }
    }
  });
});
