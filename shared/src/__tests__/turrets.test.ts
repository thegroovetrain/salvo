// THE MAIN BATTERY'S TURRETS (Story 10.4, Eric 2026-11-04, epic-10 amendments
// 7 and 9) — sim/turrets.ts as a set of contracts:
//
//   (1) geometry: stations on the centreline inside the hull, bow to stern;
//       rest bearings; every hull at rest is inside its train limits;
//   (2) GUNS BEARING by bearing (the acceptance criterion's function) — bow =
//       the forward turrets' guns, stern = the aft turrets', a broadside =
//       every gun — and EQUAL BROADSIDE across the four hulls (R2), both read
//       off CONFIG, never a literal;
//   (3) traverse: never faster than the rate, never outside the train limits,
//       arrives exactly; the blind sector parks at the NEARER stop and the far
//       side is reached the LONG WAY ROUND; deterministic;
//   (4) THE R4 PICK: on-target shot, two candidates, early click, nothing
//       ready — and the fire solution (reach clamp, parallel barrels, muzzle
//       clear of the own hull);
//   (5) reload bookkeeping, the hotbar summary and the contact wire codec;
//   (6) a hull with no battery (a PvE drone) degrades to the empty answer.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  DRONE_HULL_IDS,
  SHIP_CLASS_IDS,
  aimPointOf,
  batterySummary,
  copyTurrets,
  decodeTurretAngle,
  desiredTurretAngle,
  effectiveStats,
  encodeTurretAngles,
  fireTurret,
  gunsBearing,
  hullEnvelope,
  hullSilhouette,
  initialTurrets,
  mulberry32,
  muzzleSpawn,
  muzzleSpawnFrom,
  pickTurret,
  pointInPolygon,
  reloadAllTurrets,
  stepTurrets,
  transformPolygon,
  turretBears,
  turretMounts,
  turretRest,
  turretSalvo,
  turretStation,
  turretStationWorld,
  turretTrainRad,
  wrapAngle,
  type AimPose,
  type ShipClassId,
  type TurretState,
  type Vec2,
} from '../index.js';

const DT = CONFIG.tick.simDtMs;
const RATE = (CONFIG.mainBattery.traverseDegPerS * Math.PI) / 180; // rad/s
const STEP = (RATE * DT) / 1000; // rad per tick
const TOL = (CONFIG.mainBattery.onTargetDeg * Math.PI) / 180;
const MAP_R = 1e6; // far outside every case here — the map clamp never bites
const FAR = 5000; // u — far enough that parallax between stations is a fraction of a degree

const POSE: AimPose = { x: 300, y: -120, heading: 0.9 };

/** A point `dist` from the pose's centre on a HULL-RELATIVE bearing (0 = dead ahead). */
const aimAt = (pose: AimPose, rel: number, dist: number): Vec2 => aimPointOf(pose, pose.heading + rel, dist);

/** Step until no turret moves any more (bounded) — every turret is where it wants to be. */
function settle(states: TurretState[], id: ShipClassId, pose: AimPose, aim: Vec2): number {
  for (let t = 1; t <= 400; t += 1) {
    const before = states.map((s) => s.a);
    stepTurrets(states, id, pose, aim, DT);
    if (states.every((s, i) => s.a === before[i])) return t - 1;
  }
  throw new Error('turrets never settled');
}

const offRest = (id: ShipClassId, i: number, a: number): number => a - turretRest(turretMounts(id)[i]);

describe('turret geometry', () => {
  it.each(SHIP_CLASS_IDS)('%s: stations sit on the centreline, inside the hull, bow to stern', (id) => {
    const { hull, battery } = CONFIG.shipClasses[id];
    const poly = hullSilhouette(id);
    let prevX = Infinity;
    battery.turrets.forEach((m, i) => {
      const st = turretStation(id, i);
      expect(st.y).toBe(0);
      expect(st.x).toBeCloseTo((0.5 - m.frac) * hull.length, 9); // frac is measured from the BOW (+x)
      expect(pointInPolygon(st, poly), `${id} turret ${i}`).toBe(true);
      expect(st.x).toBeLessThan(prevX);
      prevX = st.x;
    });
  });

  it('the world station is the local station carried by the pose', () => {
    for (const id of SHIP_CLASS_IDS) {
      turretMounts(id).forEach((_, i) => {
        const local = turretStation(id, i);
        const world = turretStationWorld(id, i, POSE);
        expect(world.x).toBeCloseTo(POSE.x + Math.cos(POSE.heading) * local.x, 9);
        expect(world.y).toBeCloseTo(POSE.y + Math.sin(POSE.heading) * local.x, 9);
      });
    }
  });

  it('every hull spawns with one loaded turret per mount, at rest, inside its train limits', () => {
    for (const id of SHIP_CLASS_IDS) {
      const states = initialTurrets(id);
      const mounts = turretMounts(id);
      const train = turretTrainRad(id);
      expect(states).toHaveLength(mounts.length);
      expect(train).toBeGreaterThan(0);
      expect(train).toBeLessThan(Math.PI); // a blind sector exists
      states.forEach((s, i) => {
        expect(s.reloadMsLeft).toBe(0);
        expect(s.a).toBe(mounts[i].facing === 'fwd' ? 0 : Math.PI);
        expect(Math.abs(offRest(id, i, s.a))).toBeLessThanOrEqual(train);
      });
      expect(batterySummary(states)).toEqual({ n: mounts.length, reloadMsLeft: 0 });
    }
  });
});

describe('gunsBearing — how many guns bear on a hull-relative bearing', () => {
  const sum = (id: ShipClassId, pred: (facing: 'fwd' | 'aft') => boolean): number =>
    turretMounts(id).reduce((n, m) => n + (pred(m.facing) ? m.guns : 0), 0);

  it.each(SHIP_CLASS_IDS)('%s: bow = the forward guns, stern = the aft guns, either broadside = every gun', (id) => {
    const all = sum(id, () => true);
    expect(gunsBearing(id, 0)).toBe(sum(id, (f) => f === 'fwd'));
    expect(gunsBearing(id, Math.PI)).toBe(sum(id, (f) => f === 'aft'));
    expect(gunsBearing(id, -Math.PI)).toBe(sum(id, (f) => f === 'aft'));
    expect(gunsBearing(id, Math.PI / 2)).toBe(all);
    expect(gunsBearing(id, -Math.PI / 2)).toBe(all);
    // Fewer guns bear end-on than on the beam, both ends.
    expect(gunsBearing(id, 0)).toBeLessThan(all);
    expect(gunsBearing(id, Math.PI)).toBeLessThan(all);
    expect(gunsBearing(id, 0)).toBeGreaterThan(0);
    expect(gunsBearing(id, Math.PI)).toBeGreaterThan(0);
  });

  it('is mirror-symmetric port / starboard, invariant under a full turn, and never zero (no bearing is uncovered)', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (let k = 0; k <= 360; k += 1) {
        const b = (k * Math.PI) / 180;
        expect(gunsBearing(id, b), `${id} ${k}°`).toBe(gunsBearing(id, -b));
        expect(gunsBearing(id, b + 2 * Math.PI), `${id} ${k}°`).toBe(gunsBearing(id, b));
        expect(gunsBearing(id, b), `${id} ${k}°`).toBeGreaterThan(0);
      }
    }
  });

  it('the arc edge is the train limit: a turret bears at its stop and not a degree past it', () => {
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      const all = turretMounts(id).reduce((n, m) => n + m.guns, 0);
      const aft = gunsBearing(id, Math.PI);
      // Just inside the forward turrets' stop every gun bears; just past it only the aft ones do.
      expect(gunsBearing(id, train)).toBe(all);
      expect(gunsBearing(id, train + Math.PI / 180)).toBe(aft);
    }
  });

  it('EQUAL BROADSIDE (R2): guns × shell damage sums to the same broadside on every hull', () => {
    const broadside = (id: ShipClassId): number =>
      turretMounts(id).reduce((n, m) => n + m.guns, 0) * CONFIG.shipClasses[id].battery.shellDamage;
    const first = broadside(SHIP_CLASS_IDS[0]);
    expect(first).toBeGreaterThan(0);
    for (const id of SHIP_CLASS_IDS) expect(broadside(id), id).toBe(first);
    // …and the stats row carries the hull's own shell.
    for (const id of SHIP_CLASS_IDS) {
      expect(effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.damage, id)
        .toBe(CONFIG.shipClasses[id].battery.shellDamage);
    }
  });
});

describe('desiredTurretAngle — clamped to the train limits, the blind sector parks at the NEARER stop', () => {
  it.each(SHIP_CLASS_IDS)('%s: an aim point inside the arc is wanted exactly; one in the blind sector is wanted at the nearer stop', (id) => {
    const train = turretTrainRad(id);
    turretMounts(id).forEach((m, i) => {
      const rest = turretRest(m);
      const station = turretStationWorld(id, i, POSE);
      for (let k = -179; k <= 179; k += 7) {
        const off = (k * Math.PI) / 180; // where the aim sits off this turret's rest bearing
        const aim = { x: station.x + Math.cos(POSE.heading + rest + off) * 700, y: station.y + Math.sin(POSE.heading + rest + off) * 700 };
        const want = desiredTurretAngle(id, i, POSE, aim) - rest;
        const inside = Math.abs(off) <= train;
        expect(turretBears(id, i, POSE, aim), `${id}/${i}/${k}`).toBe(inside);
        if (inside) expect(want, `${id}/${i}/${k}`).toBeCloseTo(off, 9);
        else expect(want, `${id}/${i}/${k}`).toBeCloseTo(Math.sign(off) * train, 9); // the stop on the aim's own side
      }
    });
  });

  it('every turret measures from its OWN station: close in they converge on the one aim point', () => {
    const id = SHIP_CLASS_IDS[0];
    const aim = aimAt(POSE, Math.PI / 2, 150); // 150 u off the beam
    const mounts = turretMounts(id);
    const world = mounts.map((_, i) => POSE.heading + desiredTurretAngle(id, i, POSE, aim));
    mounts.forEach((_, i) => {
      const st = turretStationWorld(id, i, POSE);
      expect(wrapAngle(world[i] - Math.atan2(aim.y - st.y, aim.x - st.x))).toBeCloseTo(0, 9);
    });
    // The bow-most and stern-most turrets do not want the same bearing.
    expect(Math.abs(wrapAngle(world[0] - world[world.length - 1]))).toBeGreaterThan(0.1);
  });
});

describe('stepTurrets — traverse at the rate, hard stops, never through the blind sector', () => {
  it('arrives exactly on the wanted angle and stays there (no overshoot, no hunting)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const states = initialTurrets(id);
      const aim = aimAt(POSE, Math.PI / 2, 900);
      settle(states, id, POSE, aim);
      states.forEach((s, i) => expect(s.a, `${id}/${i}`).toBe(desiredTurretAngle(id, i, POSE, aim)));
      const frozen = states.map((s) => s.a);
      stepTurrets(states, id, POSE, aim, DT);
      expect(states.map((s) => s.a)).toEqual(frozen);
    }
  });

  it('takes (angle to travel) / rate, to the tick', () => {
    const id = SHIP_CLASS_IDS[0];
    const states = initialTurrets(id);
    const aim = aimAt(POSE, Math.PI / 2, FAR);
    const farthest = Math.max(...states.map((s, i) => Math.abs(desiredTurretAngle(id, i, POSE, aim) - s.a)));
    expect(settle(states, id, POSE, aim)).toBe(Math.ceil(farthest / STEP - 1e-9));
  });

  it('THE LONG WAY ROUND: a target across the blind sector is reached through the rest bearing, never across the gap', () => {
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      const mounts = turretMounts(id);
      const i = mounts.findIndex((m) => m.facing === 'aft');
      const blindSide = (sign: number): Vec2 => aimAt(POSE, sign * 0.05, FAR); // just off the bow: an aft turret's blind sector
      const states = initialTurrets(id);
      settle(states, id, POSE, blindSide(1));
      expect(offRest(id, i, states[i].a)).toBeCloseTo(-train, 6); // parked at the nearer stop (the aim's own side)
      // Swing the aim across the bow: the nearer stop is now the OTHER one.
      const path: number[] = [];
      for (let t = 0; t < 400; t += 1) {
        stepTurrets(states, id, POSE, blindSide(-1), DT);
        path.push(offRest(id, i, states[i].a));
      }
      expect(path[path.length - 1]).toBeCloseTo(train, 6);
      // It swept the whole arc: through rest (0), never past either stop.
      expect(path.some((o) => Math.abs(o) < STEP)).toBe(true);
      for (const o of path) expect(Math.abs(o)).toBeLessThanOrEqual(train + 1e-12);
      // …and it took the long way's time: two train limits at the rate.
      const arrived = path.findIndex((o) => Math.abs(o - train) < 1e-9);
      expect(arrived + 1).toBe(Math.ceil((2 * train) / STEP - 1e-9));
    }
  });

  it('PROPERTY: over random poses and aims no turret ever turns faster than the rate or leaves its train limits', () => {
    const rng = mulberry32(0x104_7a7e);
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      const states = initialTurrets(id);
      const pose: AimPose = { x: 0, y: 0, heading: 0 };
      let aim: Vec2 = { x: 500, y: 0 };
      for (let t = 0; t < 3000; t += 1) {
        // The ship turns and sails, and the aim jumps anywhere every few ticks — close in and far out.
        pose.heading = wrapAngle(pose.heading + rng.float(-0.03, 0.03));
        pose.x += Math.cos(pose.heading) * 1.5;
        pose.y += Math.sin(pose.heading) * 1.5;
        if (t % 7 === 0) aim = aimPointOf(pose, rng.float(-Math.PI, Math.PI), rng.float(0, 1500));
        const before = states.map((s) => s.a);
        stepTurrets(states, id, pose, aim, DT);
        states.forEach((s, i) => {
          expect(Math.abs(s.a - before[i]), `${id}/${i} tick ${t}`).toBeLessThanOrEqual(STEP + 1e-12);
          expect(Math.abs(offRest(id, i, s.a)), `${id}/${i} tick ${t}`).toBeLessThanOrEqual(train + 1e-12);
          expect(s.reloadMsLeft).toBeGreaterThanOrEqual(0);
        });
      }
    }
  });

  it('is deterministic: the same inputs give the same states, tick for tick', () => {
    const run = (): TurretState[] => {
      const rng = mulberry32(7);
      const states = initialTurrets('iowa');
      for (let t = 0; t < 500; t += 1) {
        const aim = aimPointOf(POSE, rng.float(-Math.PI, Math.PI), rng.float(0, 1200));
        stepTurrets(states, 'iowa', POSE, aim, DT);
        if (t % 40 === 0) fireTurret(states, t % states.length, 8000);
      }
      return states;
    };
    expect(run()).toEqual(run());
  });

  it('a null aim holds every angle and still runs the reloads; a state outside its interval is pulled to the nearer stop', () => {
    const id = SHIP_CLASS_IDS[0];
    const states = initialTurrets(id);
    settle(states, id, POSE, aimAt(POSE, 1, 600));
    fireTurret(states, 0, 500);
    const held = states.map((s) => s.a);
    stepTurrets(states, id, POSE, null, DT);
    expect(states.map((s) => s.a)).toEqual(held);
    expect(states[0].reloadMsLeft).toBe(500 - DT);
    // A corrupt write far outside the interval can never be carried through the blind sector.
    states[0].a = turretRest(turretMounts(id)[0]) + 3.1;
    stepTurrets(states, id, POSE, aimAt(POSE, 1, 600), DT);
    expect(Math.abs(offRest(id, 0, states[0].a))).toBeLessThanOrEqual(turretTrainRad(id));
  });
});

describe('pickTurret — THE R4 PICK', () => {
  const id: ShipClassId = 'bismarck';
  const reach = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.rangeU;
  const reloadMs = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.reloadMs;
  const abeam = aimAt(POSE, Math.PI / 2, 600);

  it('ON-TARGET SHOT: a ready turret on the aim point fires AT the aim point, and only its own reload starts', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    const pick = pickTurret(states, id, POSE, abeam)!;
    expect(pick.index).toBe(0); // every turret is on target: the lowest index (bow first)
    expect(pick.onTarget).toBe(true);
    expect(pick.guns).toBe(turretMounts(id)[0].guns);
    expect(pick.station).toEqual(turretStationWorld(id, 0, POSE));
    const salvo = turretSalvo(pick, id, POSE, reach, MAP_R);
    expect(salvo.center.x).toBeCloseTo(abeam.x, 6);
    expect(salvo.center.y).toBeCloseTo(abeam.y, 6);
    fireTurret(states, pick.index, reloadMs);
    expect(states.map((s) => s.reloadMsLeft)).toEqual([reloadMs, ...states.slice(1).map(() => 0)]);
    // The next click takes the next ready turret on target.
    expect(pickTurret(states, id, POSE, abeam)!.index).toBe(1);
  });

  it('"on target" is a tolerance: inside it the turret fires at the aim point, just outside it does not count', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    states[0].a += TOL * 0.9;
    expect(pickTurret(states, id, POSE, abeam)).toMatchObject({ index: 0, onTarget: true });
    states[0].a += TOL * 0.2; // 1.1 tolerances off now
    expect(pickTurret(states, id, POSE, abeam)).toMatchObject({ index: 1, onTarget: true });
  });

  it('TWO CANDIDATES: a ready turret ON target wins over a lower-index ready turret that is off target', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    states[0].a = turretRest(turretMounts(id)[0]); // A: ready, still pointing at the bow
    const pick = pickTurret(states, id, POSE, abeam)!;
    expect(pick.index).toBe(1);
    expect(pick.onTarget).toBe(true);
  });

  it('EARLY CLICK: with no ready turret on target, the ready turret with the smallest error fires along its CURRENT bearing at the aim distance', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    // Knock every turret off target by a different amount; turret 2 is the closest.
    const errs = [0.6, 0.4, 0.1, 0.3];
    states.forEach((s, i) => { s.a -= errs[i]; });
    const pick = pickTurret(states, id, POSE, abeam)!;
    expect(pick.index).toBe(2);
    expect(pick.onTarget).toBe(false);
    expect(pick.bearing).toBeCloseTo(POSE.heading + states[2].a, 12); // where it is pointing, not where the aim is
    const salvo = turretSalvo(pick, id, POSE, reach, MAP_R);
    const st = turretStationWorld(id, 2, POSE);
    expect(Math.hypot(salvo.center.x - st.x, salvo.center.y - st.y)).toBeCloseTo(Math.hypot(abeam.x - st.x, abeam.y - st.y), 6);
    expect(Math.atan2(salvo.center.y - st.y, salvo.center.x - st.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
    expect(Math.hypot(salvo.center.x - abeam.x, salvo.center.y - abeam.y)).toBeGreaterThan(1); // it missed the aim point
    // A reloading turret is not a candidate, however well it points.
    fireTurret(states, 2, reloadMs);
    expect(pickTurret(states, id, POSE, abeam)).toMatchObject({ index: 3, onTarget: false });
  });

  it('EARLY CLICK into a blind sector: a turret parked at its stop is not "on target", and still fires along the stop', () => {
    const states = initialTurrets(id);
    const ahead = aimAt(POSE, 0.02, FAR);
    settle(states, id, POSE, ahead);
    for (let i = 0; i < 2; i += 1) fireTurret(states, i, reloadMs); // the forward turrets (which bear) are reloading
    const pick = pickTurret(states, id, POSE, ahead)!;
    expect(turretMounts(id)[pick.index].facing).toBe('aft');
    expect(pick.onTarget).toBe(false);
    expect(Math.abs(offRest(id, pick.index, states[pick.index].a))).toBeCloseTo(turretTrainRad(id), 9);
    expect(pick.bearing).toBeCloseTo(POSE.heading + states[pick.index].a, 12);
  });

  it('NOTHING READY: every turret reloading picks nothing', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    states.forEach((_, i) => fireTurret(states, i, reloadMs));
    expect(pickTurret(states, id, POSE, abeam)).toBeNull();
    expect(batterySummary(states)).toEqual({ n: 0, reloadMsLeft: reloadMs });
  });

  it('a click ALWAYS fires while any turret is ready, wherever the aim is', () => {
    const rng = mulberry32(99);
    for (const hull of SHIP_CLASS_IDS) {
      const states = initialTurrets(hull);
      for (let k = 0; k < 200; k += 1) {
        const aim = aimPointOf(POSE, rng.float(-Math.PI, Math.PI), rng.float(0, 2000));
        expect(pickTurret(states, hull, POSE, aim), `${hull} ${k}`).not.toBeNull();
      }
    }
  });
});

describe('turretSalvo — the fire solution', () => {
  const id: ShipClassId = 'yamato';
  const reach = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.rangeU;

  const solve = (aim: Vec2, hull: ShipClassId = id) => {
    const states = initialTurrets(hull);
    settle(states, hull, POSE, aim);
    const pick = pickTurret(states, hull, POSE, aim)!;
    return { pick, salvo: turretSalvo(pick, hull, POSE, reach, MAP_R) };
  };

  it('the landing point is clamped to the reach FROM THE STATION, along the bearing', () => {
    const { pick, salvo } = solve(aimAt(POSE, Math.PI / 2, reach * 3));
    const d = Math.hypot(salvo.center.x - pick.station.x, salvo.center.y - pick.station.y);
    expect(d).toBeCloseTo(reach, 6);
    expect(pick.aimDistU).toBeGreaterThan(reach); // the pick reports the UNCLAMPED distance
    expect(Math.atan2(salvo.center.y - pick.station.y, salvo.center.x - pick.station.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
  });

  it('one shell per gun on PARALLEL tracks the barrel spacing apart, straddling the landing point', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const { pick, salvo } = solve(aimAt(POSE, -Math.PI / 2, 700), hull);
      expect(salvo.shells).toHaveLength(pick.guns);
      // Every shell flies the same bearing and the same length.
      const len = (sh: { origin: Vec2; target: Vec2 }): number => Math.hypot(sh.target.x - sh.origin.x, sh.target.y - sh.origin.y);
      for (const sh of salvo.shells) {
        expect(Math.atan2(sh.target.y - sh.origin.y, sh.target.x - sh.origin.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
        expect(len(sh)).toBeCloseTo(len(salvo.shells[0]), 9);
      }
      // Adjacent landing points are one spacing apart, and their mean is the centre.
      for (let k = 1; k < salvo.shells.length; k += 1) {
        const a = salvo.shells[k - 1].target;
        const b = salvo.shells[k].target;
        expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(CONFIG.mainBattery.barrelSpacingU, 9);
      }
      const mean = salvo.shells.reduce((m, sh) => ({ x: m.x + sh.target.x / pick.guns, y: m.y + sh.target.y / pick.guns }), { x: 0, y: 0 });
      expect(mean.x).toBeCloseTo(salvo.center.x, 6);
      expect(mean.y).toBeCloseTo(salvo.center.y, 6);
      // An ODD gun count puts one shell exactly on the landing point.
      const onCentre = salvo.shells.some((sh) => Math.hypot(sh.target.x - salvo.center.x, sh.target.y - salvo.center.y) < 1e-9);
      expect(onCentre, hull).toBe(pick.guns % 2 === 1);
    }
  });

  it('the salvo leaves from OUTSIDE the own hull, on the fire bearing from the station', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const poly = transformPolygon(hullSilhouette(hull), POSE.x, POSE.y, POSE.heading);
      for (const rel of [0.3, Math.PI / 2, 2.4, -1.1]) {
        const { pick, salvo } = solve(aimAt(POSE, rel, 800), hull);
        const mid = salvo.shells.reduce((m, sh) => ({ x: m.x + sh.origin.x / pick.guns, y: m.y + sh.origin.y / pick.guns }), { x: 0, y: 0 });
        expect(pointInPolygon(mid, poly), `${hull} ${rel}`).toBe(false);
        expect(Math.atan2(mid.y - pick.station.y, mid.x - pick.station.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
        // …and no farther out than the hull is long.
        expect(Math.hypot(mid.x - pick.station.x, mid.y - pick.station.y)).toBeLessThan(hullEnvelope(hull).hull.length);
      }
    }
  });

  it('a point-blank click inside the muzzle spawns the shells AT their targets (no inner dead ring)', () => {
    const states = initialTurrets(id);
    const station = turretStationWorld(id, 0, POSE);
    const aim = { x: station.x + Math.cos(POSE.heading + 1.2) * 2, y: station.y + Math.sin(POSE.heading + 1.2) * 2 };
    settle(states, id, POSE, aim);
    const salvo = turretSalvo(pickTurret(states, id, POSE, aim)!, id, POSE, reach, MAP_R);
    for (const sh of salvo.shells) expect(sh.origin).toEqual(sh.target);
  });

  it('muzzleSpawnFrom from the ship centre IS muzzleSpawn', () => {
    for (const hull of SHIP_CLASS_IDS) {
      for (const dir of [0, 0.7, 2, -2.9]) {
        expect(muzzleSpawnFrom(POSE, POSE, hull, dir, 2)).toEqual(muzzleSpawn(POSE, hull, dir, 2));
      }
    }
  });
});

describe('reloads, the hotbar summary and the wire codec', () => {
  const id = SHIP_CLASS_IDS[0];

  it('a fired turret is ready again after exactly its reload, and not a tick sooner', () => {
    const reloadMs = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.reloadMs;
    const states = initialTurrets(id);
    fireTurret(states, 1, reloadMs);
    const ticks = Math.ceil(reloadMs / DT);
    for (let t = 1; t < ticks; t += 1) {
      stepTurrets(states, id, POSE, null, DT);
      expect(states[1].reloadMsLeft, `tick ${t}`).toBeGreaterThan(0);
    }
    stepTurrets(states, id, POSE, null, DT);
    expect(states[1].reloadMsLeft).toBe(0);
  });

  it('batterySummary counts the ready turrets and reports the SOONEST remaining reload', () => {
    const states = initialTurrets(id);
    fireTurret(states, 0, 9000);
    fireTurret(states, 1, 4000);
    expect(batterySummary(states)).toEqual({ n: states.length - 2, reloadMsLeft: 4000 });
    reloadAllTurrets(states); // INSTANT RELOAD
    expect(batterySummary(states)).toEqual({ n: states.length, reloadMsLeft: 0 });
  });

  it('reloadAllTurrets never moves a turret', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, aimAt(POSE, 1.3, 700));
    const angles = states.map((s) => s.a);
    states.forEach((_, i) => fireTurret(states, i, 5000));
    reloadAllTurrets(states);
    expect(states.map((s) => s.a)).toEqual(angles);
  });

  it('copyTurrets overwrites in place (the client correction) without sharing state objects', () => {
    const wire = initialTurrets(id);
    wire[0].a = 0.4;
    wire[0].reloadMsLeft = 1234;
    const local: TurretState[] = [{ a: 9, reloadMsLeft: 9 }];
    const first = local[0];
    expect(copyTurrets(local, wire)).toBe(local);
    expect(local).toEqual(wire);
    expect(local[0]).toBe(first); // reused, not reallocated
    expect(local[1]).not.toBe(wire[1]);
  });

  it('the contact codec carries ANGLES ONLY, as whole degrees off rest, and round-trips inside half a degree', () => {
    const rng = mulberry32(5);
    for (const hull of SHIP_CLASS_IDS) {
      const states = initialTurrets(hull);
      for (let k = 0; k < 40; k += 1) {
        settle(states, hull, POSE, aimPointOf(POSE, rng.float(-Math.PI, Math.PI), rng.float(50, 1500)));
        states.forEach((_, i) => fireTurret(states, i, rng.float(0, 9000))); // reload state must not reach the wire
        const wire = encodeTurretAngles(states, hull);
        expect(wire).toHaveLength(states.length);
        wire.forEach((q, i) => {
          expect(Number.isInteger(q), `${hull}/${i}`).toBe(true);
          expect(Math.abs(q)).toBeLessThanOrEqual(CONFIG.shipClasses[hull].battery.trainDeg);
          expect(Math.abs(decodeTurretAngle(hull, i, q) - states[i].a)).toBeLessThanOrEqual(Math.PI / 360 + 1e-12);
        });
        // Same angles, different reloads -> the same wire.
        reloadAllTurrets(states);
        expect(encodeTurretAngles(states, hull)).toEqual(wire);
      }
    }
  });

  it('decodeTurretAngle fails safe: junk or out-of-range entries land inside the train interval', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const train = turretTrainRad(hull);
      for (const q of [NaN, Infinity, -Infinity, 9999, -9999]) {
        expect(Math.abs(offRest(hull, 0, decodeTurretAngle(hull, 0, q))), `${hull} ${q}`).toBeLessThanOrEqual(train);
      }
      expect(decodeTurretAngle(hull, 99, 10)).toBe(0); // no such turret
    }
  });
});

describe('a hull with no battery (a PvE drone) has no turrets', () => {
  it('every function degrades to the empty answer', () => {
    for (const hull of DRONE_HULL_IDS) {
      expect(turretMounts(hull)).toEqual([]);
      expect(initialTurrets(hull)).toEqual([]);
      expect(turretTrainRad(hull)).toBe(0);
      expect(gunsBearing(hull, 0)).toBe(0);
      expect(pickTurret([], hull, POSE, { x: 0, y: 0 })).toBeNull();
      expect(encodeTurretAngles([], hull)).toEqual([]);
      expect(turretBears(hull, 0, POSE, { x: 0, y: 0 })).toBe(false);
      const stray: TurretState[] = [{ a: 1, reloadMsLeft: 100 }];
      stepTurrets(stray, hull, POSE, { x: 0, y: 0 }, DT);
      expect(stray).toEqual([{ a: 1, reloadMsLeft: 100 }]); // no mount, nothing stepped
    }
  });
});
