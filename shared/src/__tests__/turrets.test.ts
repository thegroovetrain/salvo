// THE MAIN BATTERY'S TURRETS (Story 10.4, Eric 2026-11-04, epic-10 amendments
// 7 and 9) — sim/turrets.ts as a set of contracts:
//
//   (1) geometry: stations on the centreline inside the hull, bow to stern;
//       rest bearings; every hull at rest is inside its train limits;
//   (2) GUNS BEARING by bearing (the acceptance criterion's function) — bow =
//       the forward turrets' guns, stern = the aft turrets', a broadside =
//       every gun — and EQUAL BROADSIDE across the four hulls (R2), both read
//       off CONFIG, never a literal;
//   (3) NO TRAVERSE (Eric 2026-11-12, Story 11.1, R16): the angle is DERIVED —
//       at the aim inside the arc, at rest outside it — set in one step;
//       deterministic; the reloads still count down;
//   (4) THE ARC-ONLY PICK, BOW FIRST (amendment 10 + R16): the lowest-index
//       ready turret that bears fires at the aim point on the first click
//       tick, a turret whose arc does not hold the aim point is never picked —
//       and the fire solution (reach clamp, CONVERGE (R13): every barrel from
//       its own muzzle at the one center, muzzle clear of the own hull);
//   (5) reload bookkeeping, the hotbar summary and the contact wire codec;
//   (6) [retired with the PvE drones, Story 10.8 — no hull id lacks a battery];
//   (7) the review-gate patches: an aim with no bearing — zero distance (the
//       angles stay), or on a turret's own station (that turret rests) (P4).

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
  turretAngle,
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
const MAP_R = 1e6; // far outside every case here — the map clamp never bites
const FAR = 5000; // u — far enough that parallax between stations is a fraction of a degree

const POSE: AimPose = { x: 300, y: -120, heading: 0.9 };

/** A point `dist` from the pose's centre on a HULL-RELATIVE bearing (0 = dead ahead). */
const aimAt = (pose: AimPose, rel: number, dist: number): Vec2 => aimPointOf(pose, pose.heading + rel, dist);

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

describe('desiredTurretAngle / turretAngle — the stateless angles', () => {
  it.each(SHIP_CLASS_IDS)('%s: an aim point inside the arc is wanted exactly; one in the blind sector is clamped to the nearer stop by desiredTurretAngle and RESTS under turretAngle', (id) => {
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
        if (inside) {
          expect(want, `${id}/${i}/${k}`).toBeCloseTo(off, 9);
          expect(turretAngle(id, i, POSE, aim), `${id}/${i}/${k}`).toBe(desiredTurretAngle(id, i, POSE, aim));
        } else {
          expect(want, `${id}/${i}/${k}`).toBeCloseTo(Math.sign(off) * train, 9); // the stop on the aim's own side
          expect(turretAngle(id, i, POSE, aim), `${id}/${i}/${k}`).toBe(rest); // R16: outside its arc a turret rests
        }
      }
      expect(turretAngle(id, i, POSE, null)).toBe(rest); // no aim: rest
    });
  });

  it('every turret measures from its OWN station: close in they converge on the one aim point', () => {
    const id = SHIP_CLASS_IDS[0];
    const aim = aimAt(POSE, Math.PI / 2, 150); // 150 u off the beam
    const mounts = turretMounts(id);
    const world = mounts.map((_, i) => POSE.heading + turretAngle(id, i, POSE, aim));
    mounts.forEach((_, i) => {
      const st = turretStationWorld(id, i, POSE);
      expect(wrapAngle(world[i] - Math.atan2(aim.y - st.y, aim.x - st.x))).toBeCloseTo(0, 9);
    });
    // The bow-most and stern-most turrets do not want the same bearing.
    expect(Math.abs(wrapAngle(world[0] - world[world.length - 1]))).toBeGreaterThan(0.1);
  });
});

describe('stepTurrets — NO TRAVERSE (Eric 2026-11-12, Story 11.1, R16): the angle is derived, the reloads count down', () => {
  it('ONE step puts every turret at its derived angle, however far it has to point — no traverse time', () => {
    for (const id of SHIP_CLASS_IDS) {
      for (const rel of [Math.PI / 2, -Math.PI / 2, 0.1, Math.PI - 0.1]) {
        const states = initialTurrets(id);
        const aim = aimAt(POSE, rel, 900);
        stepTurrets(states, id, POSE, aim, DT);
        states.forEach((s, i) => expect(s.a, `${id}/${i}/${rel}`).toBe(turretAngle(id, i, POSE, aim)));
      }
    }
  });

  it('PROPERTY: over random poses and aim paths every turret sits at turretAngle after every step — at the aim inside its arc, at rest outside it, never outside its train limits', () => {
    const rng = mulberry32(0x104_7a7e);
    for (const id of SHIP_CLASS_IDS) {
      const train = turretTrainRad(id);
      const states = initialTurrets(id);
      const pose: AimPose = { x: 0, y: 0, heading: 0 };
      let aim: Vec2 = { x: 500, y: 0 };
      let aimed = 0;
      let rested = 0;
      for (let t = 0; t < 3000; t += 1) {
        pose.heading = wrapAngle(pose.heading + rng.float(-0.03, 0.03));
        pose.x += Math.cos(pose.heading) * 1.5;
        pose.y += Math.sin(pose.heading) * 1.5;
        if (t % 7 === 0) aim = aimPointOf(pose, rng.float(-Math.PI, Math.PI), rng.float(0, 1500));
        stepTurrets(states, id, pose, aim, DT);
        states.forEach((s, i) => {
          if (turretBears(id, i, pose, aim)) {
            aimed += 1;
            expect(s.a, `${id}/${i} tick ${t}`).toBeCloseTo(desiredTurretAngle(id, i, pose, aim), 12);
          } else {
            rested += 1;
            expect(s.a, `${id}/${i} tick ${t}`).toBe(turretRest(turretMounts(id)[i]));
          }
          expect(Math.abs(offRest(id, i, s.a)), `${id}/${i} tick ${t}`).toBeLessThanOrEqual(train + 1e-12);
          expect(s.reloadMsLeft).toBeGreaterThanOrEqual(0);
        });
      }
      expect(aimed, id).toBeGreaterThan(0); // the property is not vacuous: turrets did point at the aim…
      expect(rested, id).toBeGreaterThan(0); // …and the aim did leave their arcs
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

  it('a null aim leaves every angle where it is and still runs the reloads', () => {
    const id = SHIP_CLASS_IDS[0];
    const states = initialTurrets(id);
    stepTurrets(states, id, POSE, aimAt(POSE, 1, 600), DT);
    fireTurret(states, 0, 500);
    const held = states.map((s) => s.a);
    stepTurrets(states, id, POSE, null, DT);
    expect(states.map((s) => s.a)).toEqual(held);
    expect(states[0].reloadMsLeft).toBe(500 - DT);
  });

  it('a turret whose arc does not hold the aim still counts its reload down (and rests)', () => {
    for (const id of SHIP_CLASS_IDS) {
      const states = initialTurrets(id);
      const astern = aimAt(POSE, Math.PI, FAR);
      expect(turretBears(id, 0, POSE, astern)).toBe(false); // the premise
      fireTurret(states, 0, 1000);
      for (let t = 0; t < 1000 / DT; t += 1) stepTurrets(states, id, POSE, astern, DT);
      expect(states[0].a).toBe(turretRest(turretMounts(id)[0]));
      expect(states[0].reloadMsLeft).toBe(0);
    }
  });
});

describe('pickTurret — ARC-ONLY, BOW FIRST, NO TRAVERSE (R16)', () => {
  const id: ShipClassId = 'bismarck';
  const reach = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.rangeU;
  const reloadMs = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.reloadMs;
  const abeam = aimAt(POSE, Math.PI / 2, 600);

  it('FIRST CLICK TICK: a ready turret whose arc holds the aim fires AT the aim point at once — wherever it pointed before — and only its own reload starts', () => {
    const states = initialTurrets(id); // every turret at rest, pointing fore / aft — far off the beam
    const pick = pickTurret(states, id, POSE, abeam)!;
    expect(pick.index).toBe(0); // every turret bears: the lowest index (bow first)
    expect(pick.guns).toBe(turretMounts(id)[0].guns);
    expect(pick.station).toEqual(turretStationWorld(id, 0, POSE));
    expect(pick.bearing).toBeCloseTo(Math.atan2(abeam.y - pick.station.y, abeam.x - pick.station.x), 12); // AT the aim point
    expect(pick.aimDistU).toBeCloseTo(Math.hypot(abeam.x - pick.station.x, abeam.y - pick.station.y), 9);
    const salvo = turretSalvo(pick, id, POSE, reach, MAP_R);
    expect(salvo.center.x).toBeCloseTo(abeam.x, 6);
    expect(salvo.center.y).toBeCloseTo(abeam.y, 6);
    fireTurret(states, pick.index, reloadMs);
    expect(states.map((s) => s.reloadMsLeft)).toEqual([reloadMs, ...states.slice(1).map(() => 0)]);
    // The next click takes the next ready turret that bears.
    expect(pickTurret(states, id, POSE, abeam)!.index).toBe(1);
  });

  it('a turret\'s current angle plays no part: any angles, the same pick', () => {
    const rng = mulberry32(3);
    const base = pickTurret(initialTurrets(id), id, POSE, abeam);
    for (let k = 0; k < 50; k += 1) {
      const states = initialTurrets(id).map((s, i) => ({ ...s, a: turretRest(turretMounts(id)[i]) + rng.float(-turretTrainRad(id), turretTrainRad(id)) }));
      expect(pickTurret(states, id, POSE, abeam)).toEqual(base);
    }
  });

  it('ARC-ONLY: aim dead ahead, the forward turrets reloading, the aft turrets ready (the aim in their blind sector) — nothing fires, however long you wait', () => {
    const states = initialTurrets(id);
    const ahead = aimAt(POSE, 0.02, FAR);
    turretMounts(id).forEach((m, i) => {
      expect(turretBears(id, i, POSE, ahead), `${i}`).toBe(m.facing === 'fwd'); // the premise
      if (m.facing === 'fwd') fireTurret(states, i, reloadMs);
    });
    for (let t = 0; t < 40; t += 1) {
      stepTurrets(states, id, POSE, ahead, DT);
      expect(batterySummary(states).n).toBeGreaterThan(0); // turrets ARE ready…
      expect(pickTurret(states, id, POSE, ahead), `tick ${t}`).toBeNull(); // …but none of them can bear
    }
  });

  it('BOW FIRST: aim dead ahead, every turret ready — the bow-most forward turret fires', () => {
    const ahead = aimAt(POSE, 0, FAR);
    const fwd = turretMounts(id).flatMap((m, i) => (m.facing === 'fwd' ? [i] : []));
    expect(pickTurret(initialTurrets(id), id, POSE, ahead)!.index).toBe(fwd[0]);
  });

  it('NOTHING READY: every turret reloading picks nothing', () => {
    const states = initialTurrets(id);
    states.forEach((_, i) => fireTurret(states, i, reloadMs));
    expect(pickTurret(states, id, POSE, abeam)).toBeNull();
    expect(batterySummary(states)).toEqual({ n: 0, reloadMsLeft: reloadMs });
  });

  it('PROPERTY: over random poses, aims and turret states the pick is always the LOWEST-INDEX READY turret that BEARS, and there is a pick whenever one exists', () => {
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
        expect(pick.index, `${hull} ${k}`).toBe(candidates[0]);
        const st = turretStationWorld(hull, pick.index, pose);
        expect(wrapAngle(pick.bearing - Math.atan2(aim.y - st.y, aim.x - st.x)), `${hull} ${k}`).toBeCloseTo(0, 9);
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

describe('turretSalvo — the fire solution (CONVERGE, R13)', () => {
  const id: ShipClassId = 'yamato';
  const reach = effectiveStats(CONFIG.shipClasses[id]).equipment.mainBattery.rangeU;

  const solve = (aim: Vec2, hull: ShipClassId = id) => {
    const pick = pickTurret(initialTurrets(hull), hull, POSE, aim)!;
    return { pick, salvo: turretSalvo(pick, hull, POSE, reach, MAP_R) };
  };

  it('the salvo center is clamped to the reach FROM THE STATION, along the bearing', () => {
    const { pick, salvo } = solve(aimAt(POSE, Math.PI / 2, reach * 3));
    const d = Math.hypot(salvo.center.x - pick.station.x, salvo.center.y - pick.station.y);
    expect(d).toBeCloseTo(reach, 6);
    expect(pick.aimDistU).toBeGreaterThan(reach); // the pick reports the UNCLAMPED distance
    expect(Math.atan2(salvo.center.y - pick.station.y, salvo.center.x - pick.station.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
  });

  it('one shell per gun, every one from the ONE muzzle point on the line of fire, every shell aimed at the ONE center', () => {
    for (const hull of SHIP_CLASS_IDS) {
      const { pick, salvo } = solve(aimAt(POSE, -Math.PI / 2, 700), hull);
      expect(salvo.shells).toHaveLength(pick.guns);
      for (const sh of salvo.shells) {
        expect(sh.target).toEqual(salvo.center); // converge on the one center
        expect(sh.origin).toEqual(salvo.shells[0].origin); // the muzzle line's point on the salvo axis — the server places the shells
      }
      const o = salvo.shells[0].origin;
      expect(Math.atan2(o.y - pick.station.y, o.x - pick.station.x)).toBeCloseTo(wrapAngle(pick.bearing), 9);
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

  it('a point-blank click inside the muzzle spawns every shell AT the center (no inner dead ring)', () => {
    const station = turretStationWorld(id, 0, POSE);
    const aim = { x: station.x + Math.cos(POSE.heading + 1.2) * 2, y: station.y + Math.sin(POSE.heading + 1.2) * 2 };
    const salvo = turretSalvo(pickTurret(initialTurrets(id), id, POSE, aim)!, id, POSE, reach, MAP_R);
    for (const sh of salvo.shells) {
      expect(sh.origin).toEqual(sh.target);
      expect(sh.target).toEqual(salvo.center);
    }
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
    stepTurrets(states, id, POSE, aimAt(POSE, 1.3, 700), DT);
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
        stepTurrets(states, hull, POSE, aimPointOf(POSE, rng.float(-Math.PI, Math.PI), rng.float(50, 1500)), DT);
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

describe('AN AIM WITH NO BEARING (review-gate patch P4)', () => {
  it('batteryAimPoint: no aim (null) for a distance that is not a finite number above zero; aimPointOf for any real distance, however short', () => {
    for (const dist of [0, -0, -5, Number.NaN, Infinity, -Infinity]) {
      expect(batteryAimPoint(POSE, 0.4, dist), `${dist}`).toBeNull();
    }
    expect(batteryAimPoint(POSE, Number.NaN, 300)).toBeNull();
    for (const dist of [AIM_STATION_EPS_U / 10, 0.5, 40, 900, 5000]) {
      expect(batteryAimPoint(POSE, 0.4, dist), `${dist}`).toEqual(aimPointOf(POSE, 0.4, dist));
    }
  });

  it.each(SHIP_CLASS_IDS)('%s: a zero aim distance leaves every turret where it is — a neutral input never moves the battery', (id) => {
    const states = initialTurrets(id);
    stepTurrets(states, id, POSE, aimAt(POSE, 0.8, 900), DT);
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

  it("stepTurrets: an aim point ON a turret's own station rests THAT turret; the others point at it", () => {
    for (const id of SHIP_CLASS_IDS) {
      turretMounts(id).forEach((m, i) => {
        const pose: AimPose = { x: 40, y: -70, heading: 2.2 };
        const station = turretStationWorld(id, i, pose);
        for (const aim of [station, { x: station.x + AIM_STATION_EPS_U / 4, y: station.y - AIM_STATION_EPS_U / 4 }]) {
          const states = initialTurrets(id);
          stepTurrets(states, id, pose, aim, DT);
          expect(states[i].a, `${id}/${i}`).toBe(turretRest(m));
          states.forEach((s, k) => expect(s.a, `${id}/${i}/${k}`).toBe(turretAngle(id, k, pose, aim)));
        }
      });
    }
  });

  it('stepTurrets: a point that is not finite rests every turret and writes no NaN', () => {
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
