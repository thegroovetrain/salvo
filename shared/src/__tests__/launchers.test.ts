// THE TORPEDO LAUNCHERS (Story 10.6, Eric 2026-11-05, R6 / R13 / R14 / R16) —
// sim/launchers.ts as a set of laws over CONFIG, never literal tables:
//
//   (1) geometry: stations on the centerline inside the hull, FORE ahead of
//       the forward turrets and AFT abaft the aft turrets;
//   (2) the arc: trains rest ± its OWN trainDeg (per hull, per launcher —
//       R30, CONFIG.shipClasses.<id>.launchers); NO TRAVERSE (Story 11.1,
//       R16): the angle is derived — at the aim inside its firing band, at
//       rest outside it;
//   (3) THE FIRING BAND (R28): deadDeg ≤ |offset from rest| ≤ trainDeg, both
//       sides — per side from the bow: fore only, then both, then aft only;
//   (4) THE PICK (R16 + R28): no launcher's band holds the aim → `out-of-arc`,
//       nothing spent; the fore-most loaded launcher whose band holds it fires
//       at the aim point on the first click tick; band holds but no tube
//       loaded → `cooling`; one click, one torpedo;
//   (4) each tube its own clock;
//   (5) the torpedo leaves from the launcher's station along its bearing,
//       clear of the own hull;
//   (6) lifecycle: create loaded, resize arrives loaded with running clocks
//       untouched, rescale by new ÷ old, INSTANT RELOAD loads every tube, the
//       slot summary, the whole-degree contact codec.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
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
  MAX_TUBES_PER_LAUNCHER,
  launcherAimPoint,
  launcherAngle,
  launcherArcHolds,
  launcherBears,
  launcherDeadRad,
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
const DEG = Math.PI / 180;
/** rad — launcher `i`'s band on `hull`, READ off its CONFIG row (R30: per hull, per launcher). */
const band = (hull: ShipClassId, i: number): { dead: number; train: number } => {
  const l = hullEnvelope(hull).launchers!;
  const row = i === 0 ? l.fore : l.aft;
  return { dead: row.deadDeg * DEG, train: row.trainDeg * DEG };
};
const BEAM = Math.PI / 2;
const FAR = 1e6; // u — far enough that station parallax is nothing
const HULL: ShipClassId = 'iowa';
const POSE: AimPose = { x: 40, y: -25, heading: 0.7 };
/** The test hull's two bands: DEAD is the FORE launcher's. */
const FORE = band(HULL, 0);
const AFT = band(HULL, 1);
const DEAD = FORE.dead;

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

  it('every torpedo id declares the launcher arc; the sectors are the two firing bands of each launcher held', () => {
    for (const id of ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const) {
      expect(arcFor(id)).toEqual({ kind: 'launcher' });
    }
    for (const hull of SHIP_CLASS_IDS) {
      for (const i of [0, 1]) {
        expect(launcherTrainRad(hull, i)).toBeCloseTo(band(hull, i).train, 12);
        expect(launcherDeadRad(hull, i)).toBeCloseTo(band(hull, i).dead, 12);
      }
      expect(launcherSectors(hull, 0)).toEqual([]);
      for (const n of [1, 2]) {
        const secs = launcherSectors(hull, n);
        expect(secs).toHaveLength(2 * n);
        secs.forEach((sec, k) => {
          const i = Math.floor(k / 2);
          const off = Math.abs(wrapAngle(sec.offset - launcherRest(i)));
          // Each sector runs from THAT launcher's dead to its train off its end, one per side.
          expect(off - sec.halfArc, `${hull} ${k}`).toBeCloseTo(band(hull, i).dead, 12);
          expect(off + sec.halfArc, `${hull} ${k}`).toBeCloseTo(band(hull, i).train, 12);
        });
        // One sector per side of the ship for each launcher.
        expect(secs.filter((sec) => Math.sin(sec.offset) > 0)).toHaveLength(n);
      }
    }
  });
});

describe('the arc and the derived angle', () => {
  it.each(SHIP_CLASS_IDS)('%s: each launcher fires from ITS dead to ITS train off its own end, on both sides, and nowhere else (R30)', (hull) => {
    for (const i of [0, 1]) {
      const { dead, train } = band(hull, i);
      const rest = launcherRest(i);
      for (const side of [1, -1]) {
        const off = (d: number): Vec2 => at(POSE, rest + side * d);
        const tag = `${hull} launcher ${i} side ${side}`;
        expect(launcherBears(hull, i, POSE, off(dead - DEG)), `${tag} dead-1`).toBe(false);
        expect(launcherBears(hull, i, POSE, off(dead + DEG)), `${tag} dead+1`).toBe(true);
        expect(launcherBears(hull, i, POSE, off(train - DEG)), `${tag} train-1`).toBe(true);
        expect(launcherBears(hull, i, POSE, off(train + DEG)), `${tag} train+1`).toBe(false);
        expect(launcherBears(hull, i, POSE, off(0)), `${tag} end`).toBe(false);
      }
    }
  });

  it('launcherArcHolds (no parallax) agrees with the per-launcher test at long range', () => {
    const rnd = mulberry32(106);
    const edges = [FORE.dead, FORE.train, Math.PI - AFT.train, Math.PI - AFT.dead];
    for (let k = 0; k < 400; k += 1) {
      const rel = (rnd.next() * 2 - 1) * Math.PI;
      if (edges.some((e) => Math.abs(Math.abs(rel) - e) < 1e-3)) continue;
      const aim = at(POSE, rel);
      const bearing = POSE.heading + rel;
      expect(launcherArcHolds(HULL, 1, POSE.heading, bearing)).toBe(launcherBears(HULL, 0, POSE, aim));
      expect(launcherArcHolds(HULL, 2, POSE.heading, bearing)).toBe(
        launcherBears(HULL, 0, POSE, aim) || launcherBears(HULL, 1, POSE, aim),
      );
    }
    expect(launcherArcHolds(HULL, 0, POSE.heading, POSE.heading)).toBe(false);
  });

  it('NO TRAVERSE (R16): one step points a launcher at an aim inside its firing band, whichever side it was on', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    for (const rel of [BEAM, -BEAM, BEAM, 1.0]) {
      const aim = at(POSE, rel);
      stepLaunchers(ls, HULL, POSE, aim, DT);
      ls.forEach((l, i) => expect(l.a, `${rel}/${i}`).toBe(launcherAngle(HULL, i, POSE, aim)));
      expect(ls[0].a).toBeCloseTo(rel, 3); // the aim is at a hull-relative `rel` from the CENTRE; the station's parallax at 1e6 u is ~3e-5
    }
  });

  it('RESTS when the aim leaves its firing band (dead wedge or blind sector); keeps its angle with no aim at all', () => {
    const ls = initialLaunchers(HULL, counts(1, 1));
    stepLaunchers(ls, HULL, POSE, at(POSE, 1.2), DT);
    expect(ls[0].a).not.toBe(launcherRest(0));
    stepLaunchers(ls, HULL, POSE, at(POSE, Math.PI), DT); // dead astern: the fore launcher's blind wedge
    expect(ls[0].a).toBe(launcherRest(0));
    stepLaunchers(ls, HULL, POSE, at(POSE, 1.2), DT);
    stepLaunchers(ls, HULL, POSE, at(POSE, DEAD / 2), DT); // inside its dead wedge
    expect(ls[0].a).toBe(launcherRest(0));
    stepLaunchers(ls, HULL, POSE, at(POSE, 1.2), DT);
    const held = ls[0].a;
    stepLaunchers(ls, HULL, POSE, null, DT);
    expect(ls[0].a).toBe(held);
    expect(launcherAngle(HULL, 0, POSE, null)).toBe(launcherRest(0));
  });

  it('PROPERTY: after every step each launcher sits at launcherAngle — at the aim inside its band, at rest outside it — never outside its train interval', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const rnd = mulberry32(7);
    let aim = at(POSE, 2.3);
    let aimed = 0;
    let rested = 0;
    for (let t = 0; t < 4000; t += 1) {
      if (t % 37 === 0) aim = at(POSE, (rnd.next() * 2 - 1) * Math.PI, 50 + rnd.next() * 2000);
      stepLaunchers(ls, HULL, POSE, aim, DT);
      ls.forEach((l, i) => {
        expect(l.a).toBe(launcherAngle(HULL, i, POSE, aim));
        if (launcherBears(HULL, i, POSE, aim)) aimed += 1;
        else {
          rested += 1;
          expect(l.a).toBe(launcherRest(i));
        }
        expect(Math.abs(l.a - launcherRest(i))).toBeLessThanOrEqual(band(HULL, i).train + 1e-9);
      });
    }
    expect(aimed).toBeGreaterThan(0);
    expect(rested).toBeGreaterThan(0);
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

describe('the pick (R16, no traverse)', () => {
  it.each([0, Math.PI])('both launchers held, aim %f off the bow (an end): out-of-arc, nothing spent', (rel) => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    const aim = at(POSE, rel);
    settle(ls, HULL, POSE, aim);
    const snapshot = JSON.stringify(ls);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'out-of-arc' });
    expect(JSON.stringify(ls)).toBe(snapshot);
  });

  it('FIRST CLICK TICK: a loaded launcher whose band holds the aim fires AT the aim point at once, wherever it pointed before (rest, the other side, its wedge)', () => {
    for (const before of [0, -BEAM, DEAD / 2]) {
      const ls = initialLaunchers(HULL, counts(1, 1));
      ls[0].a = before;
      const aim = at(POSE, BEAM);
      const pick = pickTube(ls, HULL, POSE, aim);
      expect(pick, `${before}`).toMatchObject({ verdict: 'fire', launcher: 0, tube: 0 });
      if (pick.verdict !== 'fire') return;
      const st = launcherStationWorld(HULL, 0, POSE);
      expect(pick.station).toEqual(st);
      expect(wrapAngle(pick.bearing - Math.atan2(aim.y - st.y, aim.x - st.x))).toBeCloseTo(0, 9);
    }
  });

  it('FORE FIRST: both launchers bear and are loaded — the fore launcher fires; once it is empty, the aft', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const aim = at(POSE, Math.PI / 2);
    expect(pickTube(ls, HULL, POSE, aim)).toMatchObject({ verdict: 'fire', launcher: 0 });
    fireTube(ls, 0, 0, 9000);
    const pick = pickTube(ls, HULL, POSE, aim);
    expect(pick).toMatchObject({ verdict: 'fire', launcher: 1 });
    if (pick.verdict !== 'fire') return;
    const st = launcherStationWorld(HULL, 1, POSE);
    expect(wrapAngle(pick.bearing - Math.atan2(aim.y - st.y, aim.x - st.x))).toBeCloseTo(0, 9);
  });

  it('an aim inside a launcher\'s dead wedge never fires it (out-of-arc when no other band holds it)', () => {
    const ls = initialLaunchers(HULL, counts(1, 1));
    expect(pickTube(ls, HULL, POSE, at(POSE, DEAD / 2))).toEqual({ verdict: 'out-of-arc' });
  });

  it('fore-only, aim astern: out-of-arc, nothing spent', () => {
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
    const pick = pickTube(ls, HULL, POSE, aim);
    expect(pick.verdict).toBe('fire');
    if (pick.verdict !== 'fire') return;
    expect(loadedTubes(ls)).toBe(4); // the pick is pure
    fireTube(ls, pick.launcher, pick.tube, 25000);
    expect(loadedTubes(ls)).toBe(3);
    expect(ls[pick.launcher].tubes[pick.tube]).toBe(25000);
  });

  it('a launcher whose arc does not hold the aim NEVER fires, however ready it is', () => {
    const ls = initialLaunchers(HULL, counts(2, 2));
    const aim = at(POSE, Math.PI - AFT.dead - DEG); // the aft quarter: only the aft launcher's band holds it
    for (let k = 0; k < 2; k += 1) {
      const pick = pickTube(ls, HULL, POSE, aim);
      expect(pick).toMatchObject({ verdict: 'fire', launcher: 1 });
      if (pick.verdict === 'fire') fireTube(ls, pick.launcher, pick.tube, 30000);
    }
    // The aft tubes are spent; the fore launcher is loaded but cannot point there.
    expect(ls[0].tubes.every((t) => t <= 0)).toBe(true);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'cooling' });
  });

  it('arc holds but every tube is reloading: cooling', () => {
    const ls = initialLaunchers(HULL, counts(1, 2));
    const aim = at(POSE, 1.0);
    fireTube(ls, 0, 0, 20000);
    fireTube(ls, 0, 1, 20000);
    expect(pickTube(ls, HULL, POSE, aim)).toEqual({ verdict: 'cooling' });
  });

  it('a bearing launcher with no loaded tube yields to a bearing one that has one', () => {
    const ls = initialLaunchers(HULL, counts(2, 1));
    const aim = at(POSE, Math.PI / 2);
    fireTube(ls, 0, 0, 20000);
    expect(pickTube(ls, HULL, POSE, aim)).toMatchObject({ verdict: 'fire', launcher: 1, tube: 0 });
  });
});

describe('tube count is bounded', () => {
  it('a huge tubesPerLauncher clamps to MAX_TUBES_PER_LAUNCHER on every launcher', () => {
    const ls = initialLaunchers(HULL, counts(2, 1e12));
    expect(ls.map((l) => l.tubes.length)).toEqual([MAX_TUBES_PER_LAUNCHER, MAX_TUBES_PER_LAUNCHER]);
    expect(MAX_TUBES_PER_LAUNCHER).toBe(2);
    expect(resizeLaunchers(ls, HULL, counts(2, Infinity)).every((l) => l.tubes.length === 1)).toBe(true); // non-finite -> the floor of 1
  });
});

describe('tubes', () => {
  it('each tube has its own clock', () => {
    const ls = initialLaunchers(HULL, counts(1, 2));
    const aim = at(POSE, BEAM);
    settle(ls, HULL, POSE, aim);
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
      const bearing = POSE.heading + launcherRest(i) + (rnd.next() * 2 - 1) * band(hull, i).train;
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
      expect(Math.abs(decodeLauncherAngle(HULL, i, wire[i]) - l.a)).toBeLessThanOrEqual(Math.PI / 360 + 1e-12);
    });
  });

  it('a malformed entry can never draw a launcher through its blind wedge', () => {
    for (const i of [0, 1]) {
      for (const q of [Number.NaN, 1e9, -1e9, Number.POSITIVE_INFINITY]) {
        expect(Math.abs(decodeLauncherAngle(HULL, i, q) - launcherRest(i))).toBeLessThanOrEqual(band(HULL, i).train + 1e-12);
      }
    }
  });
});
