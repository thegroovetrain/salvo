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
//       arrives exactly; HOLD OUTSIDE THE ARC (Eric 2026-11-05, epic-10
//       amendment 10) — a turret whose arc does not hold the aim does not move,
//       resumes from where it was left, and reaches the far side through rest,
//       never through the blind sector; deterministic;
//   (4) THE ARC-ONLY PICK (Eric 2026-11-05, epic-10 amendment 10): on-target
//       shot, two candidates, early click, nothing ready, a turret whose arc
//       does not hold the aim point is never picked — and the fire solution
//       (reach clamp, parallel barrels, muzzle clear of the own hull);
//   (5) reload bookkeeping, the hotbar summary and the contact wire codec;
//   (6) [retired with the PvE drones, Story 10.8 — no hull id lacks a battery];
//   (7) the review-gate patches: an aim with no bearing — zero distance, or on
//       a turret's own station — holds (P4).

import { describe, it, expect } from 'vitest';
import {
  AIM_STATION_EPS_U,
  CONFIG,
  SHIP_CLASS_IDS,
  U_PER_M,
  aimPointOf,
  batteryAimPoint,
  batterySummary,
  copyTurrets,
  decodeTurretAngle,
  desiredTurretAngle,
  desiredTurretAngleFrom,
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

describe('desiredTurretAngle — the stateless clamped want (display / tests; the stepper holds outside the arc)', () => {
  it.each(SHIP_CLASS_IDS)('%s: an aim point inside the arc is wanted exactly; one in the blind sector is clamped to the nearer stop', (id) => {
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

  it('PROPERTY: over random poses and aim paths a turret moves ONLY on ticks its arc holds the aim, never faster than the rate, never outside its train limits', () => {
    const rng = mulberry32(0x104_7a7e);
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      const states = initialTurrets(id);
      const pose: AimPose = { x: 0, y: 0, heading: 0 };
      let aim: Vec2 = { x: 500, y: 0 };
      let moved = 0;
      let held = 0;
      for (let t = 0; t < 3000; t += 1) {
        // The ship turns and sails, and the aim jumps anywhere every few ticks — close in and far out.
        pose.heading = wrapAngle(pose.heading + rng.float(-0.03, 0.03));
        pose.x += Math.cos(pose.heading) * 1.5;
        pose.y += Math.sin(pose.heading) * 1.5;
        if (t % 7 === 0) aim = aimPointOf(pose, rng.float(-Math.PI, Math.PI), rng.float(0, 1500));
        const before = states.map((s) => s.a);
        stepTurrets(states, id, pose, aim, DT);
        states.forEach((s, i) => {
          const bears = turretBears(id, i, pose, aim);
          if (s.a !== before[i]) moved += 1;
          if (!bears) {
            held += 1;
            expect(s.a, `${id}/${i} tick ${t}: moved with the aim outside its arc`).toBe(before[i]);
          }
          expect(Math.abs(s.a - before[i]), `${id}/${i} tick ${t}`).toBeLessThanOrEqual(STEP + 1e-12);
          expect(Math.abs(offRest(id, i, s.a)), `${id}/${i} tick ${t}`).toBeLessThanOrEqual(train + 1e-12);
          expect(s.reloadMsLeft).toBeGreaterThanOrEqual(0);
        });
      }
      expect(moved, id).toBeGreaterThan(0); // the property is not vacuous: turrets did move…
      expect(held, id).toBeGreaterThan(0); // …and the aim did leave their arcs
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

describe('pickTurret — THE ARC-ONLY PICK', () => {
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

  it('ARC-ONLY: aim dead ahead, the forward turrets reloading, the aft turrets ready (held, the aim in their blind sector) — nothing fires', () => {
    const states = initialTurrets(id);
    const ahead = aimAt(POSE, 0.02, FAR);
    settle(states, id, POSE, ahead);
    turretMounts(id).forEach((m, i) => {
      expect(turretBears(id, i, POSE, ahead), `${i}`).toBe(m.facing === 'fwd'); // the premise
      if (m.facing === 'fwd') fireTurret(states, i, reloadMs);
    });
    expect(batterySummary(states).n).toBeGreaterThan(0); // turrets ARE ready…
    expect(pickTurret(states, id, POSE, ahead)).toBeNull(); // …but none of them can bear
  });

  it('NOTHING READY: every turret reloading picks nothing', () => {
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    states.forEach((_, i) => fireTurret(states, i, reloadMs));
    expect(pickTurret(states, id, POSE, abeam)).toBeNull();
    expect(batterySummary(states)).toEqual({ n: 0, reloadMsLeft: reloadMs });
  });

  it('PROPERTY: over random poses, aims and turret states the pick is always a READY turret that BEARS, and there is a pick whenever one exists', () => {
    const rng = mulberry32(99);
    for (const hull of SHIP_CLASS_IDS) {
      const mounts = turretMounts(hull);
      const train = turretTrainRad(hull);
      for (let k = 0; k < 400; k += 1) {
        const pose: AimPose = { x: rng.float(-3000, 3000), y: rng.float(-3000, 3000), heading: rng.float(-Math.PI, Math.PI) };
        const aim = aimPointOf(pose, rng.float(-Math.PI, Math.PI), rng.float(1, 2000));
        const states: TurretState[] = mounts.map((m) => ({
          a: turretRest(m) + rng.float(-train, train),
          reloadMsLeft: rng.float(0, 1) < 0.5 ? 0 : rng.float(1, 10000),
        }));
        const candidates = mounts.flatMap((_, i) => (states[i].reloadMsLeft <= 0 && turretBears(hull, i, pose, aim) ? [i] : []));
        const pick = pickTurret(states, hull, pose, aim);
        if (pick === null) {
          expect(candidates, `${hull} ${k}`).toEqual([]);
          continue;
        }
        expect(candidates, `${hull} ${k}`).toContain(pick.index);
      }
    }
  });

  it.each(SHIP_CLASS_IDS)('%s: COVERAGE — at long range every bearing around the compass is inside at least one turret\'s arc (so "no ready turret bears" means "the bearing ones are reloading")', (hull) => {
    for (const pose of [POSE, { x: -800, y: 1500, heading: -2.4 }]) {
      for (let k = 0; k < 720; k += 1) {
        const aim = aimAt(pose, (k * Math.PI) / 360, FAR);
        const bearing = turretMounts(hull).filter((_, i) => turretBears(hull, i, pose, aim));
        expect(bearing.length, `${hull} ${k / 2}°`).toBeGreaterThan(0);
        // …and a fresh battery (every turret ready) always has a pick there.
        expect(pickTurret(initialTurrets(hull), hull, pose, aim), `${hull} ${k / 2}°`).not.toBeNull();
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

describe('THE EARLY-CLICK PICK ranks only turrets that BEAR (arc-only fire, Eric 2026-11-05, epic-10 amendment 10)', () => {
  const id: ShipClassId = 'bismarck';
  const DEG = Math.PI / 180;
  const mounts = turretMounts(id);
  const fwd = mounts.flatMap((m, i) => (m.facing === 'fwd' ? [i] : []));
  const aft = mounts.flatMap((m, i) => (m.facing === 'aft' ? [i] : []));
  const blind = Math.PI - turretTrainRad(id); // how wide of the bow an aft turret left on its stop points

  /** Every turret settled on an aim dead ahead: the forward turrets on it, the aft turrets HELD at rest (it is in their blind sector). */
  const settledAhead = (aim: Vec2): TurretState[] => {
    const states = initialTurrets(id);
    settle(states, id, POSE, aim);
    for (const i of aft) expect(states[i].a).toBe(turretRest(mounts[i]));
    return states;
  };

  it('aim dead ahead, a forward turret ready and a degree short, the aft turrets ready: the FORWARD turret fires', () => {
    const ahead = aimAt(POSE, 0, FAR);
    const states = settledAhead(ahead);
    expect(1 * DEG).toBeGreaterThan(TOL); // the premise: a degree short is not "on target"
    fwd.forEach((i, k) => { states[i].a += (1 + k) * DEG; }); // the bow turret 1° short, the next 2°
    const pick = pickTurret(states, id, POSE, ahead)!;
    expect(pick.onTarget).toBe(false);
    expect(pick.index).toBe(fwd[0]);
    expect(Math.abs(wrapAngle(pick.bearing - POSE.heading))).toBeCloseTo(1 * DEG, 9);
  });

  it('aim dead ahead, a forward turret ready but MID-TRAVERSE (pointing wider than an aft turret left on a stop), the aft turrets ready: the FORWARD turret fires along its current bearing, whichever side of the centreline', () => {
    for (const side of [-1, 1]) {
      const ahead = aimAt(POSE, side * 1e-4, FAR);
      for (const sign of [-1, 1]) {
        const states = settledAhead(ahead);
        for (const i of aft) states[i].a = turretRest(mounts[i]) + sign * turretTrainRad(id); // left on EITHER stop (pointing 35° off the bow)
        fwd.forEach((i) => { states[i].a = blind * 1.5; }); // still swinging in from the beam: wider than the aft turrets
        const pick = pickTurret(states, id, POSE, ahead)!;
        expect(fwd, `${side}/${sign}`).toContain(pick.index);
        expect(pick.onTarget).toBe(false);
        expect(pick.bearing).toBeCloseTo(POSE.heading + states[pick.index].a, 12); // early: where it points, not the aim
      }
    }
  });

  it('broadside aim, every turret ready, none on target: the bearing turret with the SMALLEST error fires early', () => {
    const abeam = aimAt(POSE, Math.PI / 2, FAR);
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    mounts.forEach((_, i) => expect(turretBears(id, i, POSE, abeam), `${i}`).toBe(true)); // the premise: a broadside brings every turret
    const errs = [0.5, 0.3, 0.2, 0.4]; // rad off target; turret 2 nearest
    states.forEach((s, i) => { s.a -= errs[i]; });
    const pick = pickTurret(states, id, POSE, abeam)!;
    expect(pick).toMatchObject({ index: 2, onTarget: false });
    expect(pick.bearing).toBeCloseTo(POSE.heading + states[2].a, 12);
  });

  it('the on-target test is unchanged: inside the arc and inside the tolerance still fires at the aim point', () => {
    const abeam = aimAt(POSE, Math.PI / 2, 600);
    const states = initialTurrets(id);
    settle(states, id, POSE, abeam);
    states[0].a += TOL * 0.9;
    expect(pickTurret(states, id, POSE, abeam)).toMatchObject({ index: 0, onTarget: true });
  });
});

describe('HOLD OUTSIDE THE ARC (Eric 2026-11-05, epic-10 amendment 10)', () => {
  const DEG = Math.PI / 180;
  /** A FAR aim point `off` rad off turret `i`'s rest bearing, measured from its own station. */
  const offAim = (id: ShipClassId, i: number, off: number): Vec2 => {
    const st = turretStationWorld(id, i, POSE);
    const brg = POSE.heading + turretRest(turretMounts(id)[i]) + off;
    return { x: st.x + Math.cos(brg) * FAR, y: st.y + Math.sin(brg) * FAR };
  };

  it.each(SHIP_CLASS_IDS)('%s: the aim leaves a forward turret\'s arc (dead astern) — the turret stays exactly where the aim left it, not at a stop', (id) => {
    const states = initialTurrets(id);
    const port = aimAt(POSE, Math.PI / 2, FAR);
    // Mid-traverse toward the beam: a few ticks, so it is neither at rest nor at a stop.
    for (let t = 0; t < 5; t += 1) stepTurrets(states, id, POSE, port, DT);
    const left = states[0].a;
    expect(Math.abs(offRest(id, 0, left))).toBeGreaterThan(0);
    expect(Math.abs(offRest(id, 0, left))).toBeLessThan(turretTrainRad(id));
    const astern = aimAt(POSE, Math.PI, FAR);
    expect(turretBears(id, 0, POSE, astern)).toBe(false); // the premise
    for (let t = 0; t < 60; t += 1) {
      stepTurrets(states, id, POSE, astern, DT);
      expect(states[0].a, `tick ${t}`).toBe(left);
    }
  });

  it.each(SHIP_CLASS_IDS)('%s: TWO FRONTS — trained on A, the aim in the blind sector for 2 s, back on A: on target the first tick with zero traverse, and picked on target', (id) => {
    const states = initialTurrets(id);
    const A = aimAt(POSE, Math.PI / 2, FAR); // broadside port: every turret bears
    settle(states, id, POSE, A);
    const trained = states.map((s) => s.a);
    const astern = aimAt(POSE, Math.PI, FAR); // the forward turrets' blind sector
    for (let t = 0; t < 2000 / DT; t += 1) stepTurrets(states, id, POSE, astern, DT);
    turretMounts(id).forEach((m, i) => {
      if (m.facing === 'fwd') expect(states[i].a, `fwd ${i} held`).toBe(trained[i]);
    });
    stepTurrets(states, id, POSE, A, DT);
    turretMounts(id).forEach((m, i) => {
      if (m.facing === 'fwd') expect(states[i].a, `fwd ${i}: zero traverse`).toBe(trained[i]);
    });
    expect(pickTurret(states, id, POSE, A)).toMatchObject({ index: 0, onTarget: true });
  });

  it.each(SHIP_CLASS_IDS)('%s: leaving and re-entering on the FAR side — it resumes from the held angle and reaches the new aim through rest in exactly |Δoffset| / rate ticks', (id) => {
    const train = turretTrainRad(id);
    const states = initialTurrets(id);
    const startOff = 80 * DEG;
    settle(states, id, POSE, offAim(id, 0, startOff));
    expect(offRest(id, 0, states[0].a)).toBeCloseTo(startOff, 9);
    // Into the blind sector on the SAME side, a while: held.
    for (let t = 0; t < 30; t += 1) stepTurrets(states, id, POSE, offAim(id, 0, (train + Math.PI) / 2), DT);
    expect(offRest(id, 0, states[0].a)).toBeCloseTo(startOff, 9);
    // Back in on the far side, just inside the other train limit.
    const target = -(train - 0.05);
    const far = offAim(id, 0, target);
    expect(turretBears(id, 0, POSE, far)).toBe(true);
    const path: number[] = [];
    for (let t = 0; t < 400; t += 1) {
      stepTurrets(states, id, POSE, far, DT);
      path.push(offRest(id, 0, states[0].a));
    }
    expect(path[path.length - 1]).toBeCloseTo(target, 6);
    expect(path.some((o) => Math.abs(o) < STEP)).toBe(true); // through rest
    for (const o of path) expect(Math.abs(o)).toBeLessThanOrEqual(train + 1e-12); // never past a stop
    for (let k = 1; k < path.length; k += 1) expect(path[k]).toBeLessThanOrEqual(path[k - 1]); // one direction
    const arrived = path.findIndex((o) => Math.abs(o - target) < 1e-6);
    expect(arrived + 1).toBe(Math.ceil((startOff - target) / STEP - 1e-9));
  });

  it.each(SHIP_CLASS_IDS)('%s: a turret held outside its arc still counts its reload down', (id) => {
    const states = initialTurrets(id);
    const astern = aimAt(POSE, Math.PI, FAR);
    fireTurret(states, 0, 1000);
    const angle = states[0].a;
    for (let t = 0; t < 1000 / DT; t += 1) stepTurrets(states, id, POSE, astern, DT);
    expect(states[0].a).toBe(angle);
    expect(states[0].reloadMsLeft).toBe(0);
  });

  it.each(SHIP_CLASS_IDS)('%s: an aim on the centreline with float jitter (dead astern of a forward turret, dead ahead of an aft one) never moves either', (id) => {
    const mounts = turretMounts(id);
    const fwd = mounts.findIndex((m) => m.facing === 'fwd');
    const aft = mounts.findIndex((m) => m.facing === 'aft');
    for (const start of [0, 0.4, -0.4]) {
      const states = initialTurrets(id);
      states[fwd].a = turretRest(mounts[fwd]) + start;
      states[aft].a = turretRest(mounts[aft]) + start;
      for (let t = 0; t < 100; t += 1) {
        const jitter = t % 2 === 0 ? 1e-6 : -1e-6;
        stepTurrets(states, id, POSE, aimAt(POSE, Math.PI + jitter, FAR), DT);
        expect(offRest(id, fwd, states[fwd].a), `fwd tick ${t}`).toBe(start);
      }
      // (dead astern IS inside the aft turret's arc, so it trained meanwhile:
      // what must not move from here on is wherever that left it.)
      states[aft].a = turretRest(mounts[aft]) + start;
      const aftAt = states[aft].a;
      for (let t = 0; t < 100; t += 1) {
        const jitter = t % 2 === 0 ? 1e-6 : -1e-6;
        stepTurrets(states, id, POSE, aimAt(POSE, jitter, FAR), DT);
        expect(states[aft].a, `aft tick ${t}`).toBe(aftAt);
      }
    }
  });

  it('desiredTurretAngleFrom: inside the arc it is desiredTurretAngle whatever the turret points at; outside the arc it is where the turret already is', () => {
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      turretMounts(id).forEach((m, i) => {
        const rest = turretRest(m);
        const station = turretStationWorld(id, i, POSE);
        const at = (off: number): Vec2 => ({ x: station.x + Math.cos(POSE.heading + rest + off) * 700, y: station.y + Math.sin(POSE.heading + rest + off) * 700 });
        for (const cur of [rest - train, rest - 0.2, rest, rest + 0.4, rest + train]) {
          for (const side of [-1, 1]) {
            expect(desiredTurretAngleFrom(id, i, POSE, at(side * (train + Math.PI) / 2), cur), `${id}/${i}`).toBe(cur);
          }
          for (const off of [-train * 0.9, -0.3, 0, 0.7, train * 0.9]) {
            expect(desiredTurretAngleFrom(id, i, POSE, at(off), cur)).toBeCloseTo(desiredTurretAngle(id, i, POSE, at(off)), 12);
          }
        }
      });
    }
  });
});

describe('AN AIM WITH NO BEARING holds the turrets (review-gate patch P4)', () => {
  it('batteryAimPoint: no aim (null) for a distance that is not a finite number above zero; aimPointOf for any real distance, however short', () => {
    for (const dist of [0, -0, -5, Number.NaN, Infinity, -Infinity]) {
      expect(batteryAimPoint(POSE, 0.4, dist), `${dist}`).toBeNull();
    }
    expect(batteryAimPoint(POSE, Number.NaN, 300)).toBeNull();
    for (const dist of [AIM_STATION_EPS_U / 10, 0.5, 40, 900, 5000]) {
      expect(batteryAimPoint(POSE, 0.4, dist), `${dist}`).toEqual(aimPointOf(POSE, 0.4, dist));
    }
  });

  it.each(SHIP_CLASS_IDS)('%s: a zero aim distance leaves every turret where it is — a neutral input never slews the battery to its stops', (id) => {
    const states = initialTurrets(id);
    settle(states, id, POSE, aimAt(POSE, 0.8, 900));
    const before = states.map((s) => s.a);
    fireTurret(states, 0, 1000);
    for (let t = 0; t < 100; t += 1) stepTurrets(states, id, POSE, batteryAimPoint(POSE, 0.8, 0), DT);
    expect(states.map((s) => s.a)).toEqual(before);
    expect(states[0].reloadMsLeft).toBe(0); // the reloads still ran
    // …and from the spawn state too: nothing leaves rest.
    const fresh = initialTurrets(id);
    for (let t = 0; t < 100; t += 1) stepTurrets(fresh, id, POSE, batteryAimPoint(POSE, 0, 0), DT);
    expect(fresh).toEqual(initialTurrets(id));
  });

  it("stepTurrets: an aim point ON a turret's own station holds THAT turret for the step; the others still traverse", () => {
    for (const id of SHIP_CLASS_IDS) {
      turretMounts(id).forEach((_, i) => {
        const pose: AimPose = { x: 40, y: -70, heading: 2.2 }; // a heading where atan2(0, 0) = 0 is NOT where turret i points
        const station = turretStationWorld(id, i, pose);
        for (const aim of [station, { x: station.x + AIM_STATION_EPS_U / 4, y: station.y - AIM_STATION_EPS_U / 4 }]) {
          const states = initialTurrets(id);
          const before = states.map((s) => s.a);
          for (let t = 0; t < 100; t += 1) stepTurrets(states, id, pose, aim, DT);
          expect(states[i].a, `${id}/${i}`).toBe(before[i]);
          // Every other turret has a real bearing to that point and is free to chase it.
          states.forEach((s, k) => {
            if (k !== i) expect(s.a, `${id}/${i}/${k}`).toBe(desiredTurretAngleFrom(id, k, pose, aim, s.a));
          });
          expect(desiredTurretAngleFrom(id, i, pose, aim, before[i])).toBe(before[i]);
        }
      });
    }
  });

  it('stepTurrets: a point that is not finite moves nothing and writes no NaN', () => {
    const id = SHIP_CLASS_IDS[0];
    const states = initialTurrets(id);
    stepTurrets(states, id, POSE, { x: Number.NaN, y: 0 }, DT);
    expect(states).toEqual(initialTurrets(id));
  });

  it("pickTurret: a turret with the aim point on its own station does not bear and is never picked; the pick's numbers are always finite", () => {
    const id: ShipClassId = 'bismarck';
    const pose: AimPose = { x: 10, y: 20, heading: 0 }; // heading 0 + turret 0 at rest = the bearing atan2(0, 0) reads
    const aim = turretStationWorld(id, 0, pose);
    const states = initialTurrets(id);
    const pick = pickTurret(states, id, pose, aim)!;
    expect(pick.index).not.toBe(0); // a turret with a real bearing that bears is picked instead
    expect(turretBears(id, pick.index, pose, aim)).toBe(true);
    for (const v of [pick.bearing, pick.aimDistU, pick.station.x, pick.station.y]) expect(Number.isFinite(v)).toBe(true);
    // Only turret 0 ready: it has no bearing to its own station, so nothing fires.
    states.forEach((_, i) => { if (i !== 0) fireTurret(states, i, 5000); });
    expect(pickTurret(states, id, pose, aim)).toBeNull();
    // A junk point bears from no turret: nothing fires.
    expect(pickTurret(initialTurrets(id), id, pose, { x: Number.NaN, y: Number.NaN })).toBeNull();
  });
});

describe('the hull scale is exported (review-gate patch P6)', () => {
  it('U_PER_M is the one scale every battleship hull was authored at: length and beam are whole decimetres of a real ship', () => {
    expect(U_PER_M).toBeGreaterThan(0);
    for (const id of SHIP_CLASS_IDS) {
      const { length, beam } = hullEnvelope(id).hull;
      for (const u of [length, beam]) {
        const dm = (u / U_PER_M) * 10;
        expect(Math.abs(dm - Math.round(dm)), `${id} ${u}`).toBeLessThan(1e-6);
      }
    }
  });
});
