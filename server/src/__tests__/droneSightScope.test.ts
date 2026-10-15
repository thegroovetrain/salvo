// PvE DRONE SIGHT SCOPE (Eric ruling 2026-10-14, verbatim): *"Drones have no
// radar and can only 'see' within the standard sight range, so there's no
// need to check 8000u away. There's no need to check against anything it
// can't see."* — plus the constraint that rides with it: *"The drones also do
// try and move in the direction they were shot from for a little bit in order
// to try and acquire a target."* Being SHOT is information a drone has without
// seeing, so the hit-driven chase is not a scan and is never sight-filtered.
//
// What this suite pins:
//   * hull avoidance evaluates ONLY hulls inside the drone's own sight — a
//     hull 2,000 u off is never handed to the kernel, and in a crowded
//     112-hull scene the evaluated pairs are exactly the in-sight neighbours;
//   * the cut is EXACT inside sight: a drone's inputs are identical whether
//     its sight is 500 u or effectively unbounded, when everything is close;
//   * a fleet waypoint's "ashore" test runs when it is PICKED, never per tick
//     (the ring-centre fallback that lands ashore is still re-picked on the
//     next read, exactly as before);
//   * a drone shelled from 1,500 u (three times its sight) still acquires the
//     shooter and turns onto its bearing.

import { describe, it, expect } from 'vitest';
import { CONFIG, DEFAULT_HORN_ID, angleDiff, bearing, droneHullOf, type DroneSizeId } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { sightOf } from '../game/signals.js';
import { circleIsland } from './islandFixture.js';

function bareWorld(seed = 1): World {
  const w = new World(seed, CONFIG.map.playerCap, CONFIG.zone);
  w.map.islands.length = 0;
  return w;
}

function fleetShip(w: World, id: string, size: DroneSizeId, x: number, y: number, fleetId = 1): ShipRecord {
  const rec = w.addShip(id, 'DRONE', 'fleet', droneHullOf(size), DEFAULT_HORN_ID, { x, y });
  w.drones.add(id, size, fleetId, { x: 0, y: 0 });
  return rec;
}

function captain(w: World, id: string, x: number, y: number): ShipRecord {
  return w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', DEFAULT_HORN_ID, { x, y });
}

type DamageChoke = { hitShip(v: ShipRecord, amount: number, byId: string, fromMine: boolean): void };
function shellHit(w: World, victim: ShipRecord, by: string): void {
  (w as unknown as DamageChoke).hitShip(victim, 5, by, false);
}

describe('drone sight scope — hull avoidance reads only what the drone can see', () => {
  it('a hull 2,000 u away is never evaluated', () => {
    const w = bareWorld(3);
    const d = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'far', 2000, 0);
    expect(sightOf(d)).toBeLessThan(2000);
    for (let t = 0; t < 20; t++) w.step();
    expect(w.drones.probe.hullPairs).toBe(0);
  });

  it('in a 112-hull scene the evaluated pairs are exactly the in-sight neighbours', () => {
    const w = bareWorld(5);
    const fleet: ShipRecord[] = [];
    // 96 drones in 16 fleets of six + 16 captains on a 350 u lattice over a
    // ~3,900 u square: every drone has neighbours, none sees the whole field.
    for (let i = 0; i < 112; i++) {
      const x = -1925 + (i % 12) * 350;
      const y = -1600 + Math.floor(i / 12) * 350;
      if (i < 96) fleet.push(fleetShip(w, `f${i}`, 'small', x, y, 1 + Math.floor(i / 6)));
      else captain(w, `c${i}`, x, y);
    }
    const all = [...w.ships.values()];
    let expected = 0;
    for (const d of fleet) {
      const s = sightOf(d);
      for (const o of all) {
        if (o !== d && (o.state.x - d.state.x) ** 2 + (o.state.y - d.state.y) ** 2 <= s * s) expected++;
      }
    }
    w.step();
    expect(w.drones.probe.hullPairs).toBe(expected);
    expect(expected).toBeLessThan(96 * 111 / 4); // a fraction of the old every-hull scan
  });

  it('is exact inside sight: inputs match an effectively unbounded sight tick for tick', () => {
    const run = (sight: number): number[] => {
      const w = bareWorld(9);
      w.map.islands.push(circleIsland(220, 60, 50));
      const ds = [fleetShip(w, 'a', 'large', 0, 0), fleetShip(w, 'b', 'small', 90, 40), fleetShip(w, 'c', 'medium', -60, 110, 2)];
      captain(w, 'cap', 160, -80);
      for (const d of ds) d.stats.sightRange = sight;
      const rudders: number[] = [];
      for (let t = 0; t < 120; t++) {
        w.step();
        for (const d of ds) rudders.push(w.inputs.get(d.id)!.rudder, d.state.heading, d.state.x);
      }
      return rudders;
    };
    expect(run(CONFIG.vision.sight)).toEqual(run(1e9));
  });
});

describe('drone sight scope — the fleet waypoint is vetted once, when picked', () => {
  it('an afloat waypoint is never re-tested for land on later ticks', () => {
    const w = bareWorld(11);
    w.map.islands.push(circleIsland(300, 300, 80));
    fleetShip(w, 'f', 'medium', 0, 0);
    w.step();
    const wp = w.drones.waypointOf('f')!;
    const tests = w.drones.probe.ashoreTests;
    expect(tests).toBeGreaterThan(0);
    for (let t = 0; t < 20; t++) w.step();
    expect(w.drones.waypointOf('f')).toEqual(wp); // not reached in 1 s
    expect(w.drones.probe.ashoreTests).toBe(tests);
  });

  it('a ring-centre fallback that lands ashore is still re-picked on the next read', () => {
    const w = bareWorld(13);
    // One island swallowing the whole waypoint disc: all 16 draws fail and the
    // fallback (the ring centre) sits ashore.
    w.map.islands.push(circleIsland(w.zoneLiveRing.cx, w.zoneLiveRing.cy, w.zoneLiveRing.r * 1.2));
    fleetShip(w, 'f', 'medium', w.zoneLiveRing.cx + w.zoneLiveRing.r * 0.5, w.zoneLiveRing.cy);
    w.step();
    const after1 = w.drones.probe.ashoreTests;
    w.step();
    // 16 rejected draws + the fallback's own test, again, on the next tick.
    expect(w.drones.probe.ashoreTests - after1).toBe(17);
  });
});

describe('drone sight scope — being shot is not a sight scan', () => {
  it('a drone shelled from 1,500 u acquires the shooter and turns onto its bearing', () => {
    const w = bareWorld(17);
    const d = fleetShip(w, 'f', 'medium', 0, 0);
    d.state.heading = Math.PI / 2; // broadside-on to the shooter
    captain(w, 'cap', 1500, 0);
    expect(sightOf(d)).toBeLessThan(1500);
    shellHit(w, d, 'cap');
    expect(w.drones.targetOf('f')).toBe('cap');
    const err0 = Math.abs(angleDiff(d.state.heading, bearing(d.state, { x: 1500, y: 0 })));
    const headings: number[] = [];
    for (let t = 0; t < 55; t++) {
      w.step(); // 2.75 s, inside the 3 s memory
      headings.push(d.state.heading);
    }
    if (process.env.HC_PRINT_HEADINGS) console.log('HEADINGS', JSON.stringify(headings));
    const err1 = Math.abs(angleDiff(d.state.heading, bearing(d.state, { x: 1500, y: 0 })));
    expect(w.drones.targetOf('f')).toBe('cap');
    expect(err0).toBeGreaterThan(1.5);
    expect(err1).toBeLessThan(0.25);
    // ...and it never "looked" at the shooter to do it.
    expect(w.drones.probe.hullPairs).toBe(0);
  });
});

// ---------- Story 9.10: PvE drones are FOGGED by the same rule (amendment 168) ----
//
// `shipSees` — the drones' one eye (target refresh, the witness rule, the
// shot test) — now pays the fog toll through the same `withinSight` a
// captain's contact row uses, so a drone loses what fog hides. Being SHOT is
// still not sight (amendment 139): the shot-from chase acquires and turns
// the drone with the bank in place; it simply cannot refresh or fire on a
// target it cannot see, and forgets it once `memoryMs` runs out.

/** A mature bank (scale 1, its whole hold ahead) through the test seam. */
function matureBank(w: World, id: string, x: number, y: number, R: number): void {
  const bornAt = w.now - CONFIG.fog.growMs - 1000;
  w.seedFogBank({ id, x, y, R, bornAt, until: bornAt + CONFIG.fog.lifeMs });
}

describe('drone sight scope — fog banks blind a drone exactly as they blind a captain (Story 9.10, amendment 168)', () => {
  const MEMORY_TICKS = Math.ceil(CONFIG.fleet.memoryMs / CONFIG.tick.simDtMs) + 2;
  // The captain sits at 450 u (inside the 500 u sight) in the CENTRE of a
  // mature R 400 bank: the drone's ray pays 2 × its length inside the disc,
  // so the target stays hidden until the drone is within ~200 u — farther
  // than 40 u/s carries it inside the 3 s memory window.
  const CAP_X = 450;

  function arena(seed: number, fogged: boolean): { w: World; d: ShipRecord; g: ShipRecord } {
    const w = bareWorld(seed);
    const d = fleetShip(w, 'f', 'medium', 0, 0);
    d.state.heading = Math.PI / 2; // broadside-on to the shooter
    // A would-be witness in the same fleet, 200 u astern — outside the bank
    // (its ray to f never enters the disc), its ray to the captain ~492 u
    // long with ~400 u of it inside the bank, and far enough off f that hull
    // avoidance does not lean on f's turn.
    const g = fleetShip(w, 'g', 'medium', 0, -200);
    captain(w, 'cap', CAP_X, 0);
    if (fogged) matureBank(w, 'bank', CAP_X, 0, 400);
    return { w, d, g };
  }

  it('shot from inside a bank: the drone acquires the shooter and turns onto its bearing (shot-from aggro is untouched)...', () => {
    const { w, d } = arena(21, true);
    shellHit(w, d, 'cap');
    expect(w.drones.targetOf('f')).toBe('cap');
    const err0 = Math.abs(angleDiff(d.state.heading, bearing(d.state, { x: CAP_X, y: 0 })));
    for (let t = 0; t < 55; t++) w.step(); // 2.75 s, inside the 3 s memory (the 1,500 u case's window)
    const err1 = Math.abs(angleDiff(d.state.heading, bearing(d.state, { x: CAP_X, y: 0 })));
    expect(err0).toBeGreaterThan(1.5);
    expect(err1).toBeLessThan(0.25);
  });

  it('...but never FIRES at it and FORGETS it once memory runs out — while the same drone with the bank gone fires and keeps the target', () => {
    const shotsBy = (w: World, id: string): number => [...w.shells.values()].filter((s) => s.ownerId === id).length;
    const fogged = arena(23, true);
    shellHit(fogged.w, fogged.d, 'cap');
    let fired = 0;
    for (let t = 0; t < MEMORY_TICKS; t++) {
      fogged.w.step();
      fired += shotsBy(fogged.w, 'f');
    }
    expect(fired).toBe(0);
    expect(fogged.w.drones.targetOf('f')).toBeNull(); // forgotten: no refresh through the fog

    const clear = arena(23, false);
    shellHit(clear.w, clear.d, 'cap');
    let firedClear = 0;
    for (let t = 0; t < MEMORY_TICKS; t++) {
      clear.w.step();
      firedClear += shotsBy(clear.w, 'f');
    }
    expect(firedClear).toBeGreaterThan(0);
    expect(clear.w.drones.targetOf('f')).toBe('cap'); // refreshed every tick it was seen
  });

  it('the witness rule is fogged too: a fleet-mate that cannot see the shooter through the bank does not join; with the bank gone it does', () => {
    const fogged = arena(25, true);
    shellHit(fogged.w, fogged.d, 'cap');
    expect(fogged.w.drones.targetOf('g')).toBeNull();

    const clear = arena(25, false);
    shellHit(clear.w, clear.d, 'cap');
    expect(clear.w.drones.targetOf('g')).toBe('cap');
  });
});
