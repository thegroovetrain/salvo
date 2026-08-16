// PvE FLEET CONTROLLER (game/drones.ts) + the wave scheduler (world.ts) +
// the match-side rules that changed with them (Story 5.6, epic-5 amendments
// 33-41, all Eric rulings 2026-08-14).
//
// What this suite pins, in the order the story rules it:
//   * inputs are STILL the only interface — but the hulls are ARMED now, so
//     the retired controller's "fireSeq can never advance" guarantee is
//     replaced by explicit coverage of WHEN it may advance and when it may not
//     (no target => never; acquired but blind => never);
//   * WAVES: timing off the ZONE clock, exact composition (1 large + 2 medium
//     + 3 small = the 6-hull spawn group; its XP value is DERIVED by
//     fleetLevels() and is deliberately never asserted as a literal — epic-6
//     amendment 24), and the anchor rule —
//     outside every captain's intel disc, retried, then a LOGGED max-min
//     fallback so the wave always arrives (amendment 37);
//   * SELF-DEFENCE: a hit acquires the attacker, the witness sweep is
//     evaluated ONCE at that instant (a hull that gains LOS later never
//     joins), a MINE never aggros, memory expires at CONFIG.fleet.memoryMs,
//     and fleet ships never damage each other (amendments 35/36);
//   * ACCOUNTING: a PvE kill pays XP and fires `sunk`, but advances no tally
//     and never moves the throne (amendment 38);
//   * THE FILL IS GONE: a match activates with nothing but its captains
//     (amendment 41), and drones still cannot win.
//
// The self-private `Contact.aggro` mark (amendment 40) is covered in
// perception.test.ts, beside the invariant oracles it must not widen.

import { describe, it, expect, vi } from 'vitest';
import {
  CONFIG,
  DEFAULT_HORN_ID,
  dist,
  droneHullOf,
  fleetHullIds,
  fleetLevels,
  isAfloat,
  isSinking,
  pointPolygonDistance,
  type DroneSizeId,
  type ZoneTimeline,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { Match, type MatchHooks, type MatchTimings } from '../game/match.js';
import { isFleetHull } from '../game/participants.js';
import { circleIsland } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
// One sinking window in ticks: since the amendment-17 REVERSAL (Eric veto
// 2026-08-12) a terminal captain SINK holds the match open for the dying
// hull's window, so the sunk-out finishes below step a window before their
// finish assertions. Fleet sinks never hold — that stays pinned here.
const SINK_TICKS = CONFIG.ship.sinkingWindowMs / DT;

/** A bare, island-free world unless the test adds islands back. */
function bareWorld(seed = 1, zone: ZoneTimeline = CONFIG.zone): World {
  const w = new World(seed, CONFIG.map.playerCap, zone);
  w.map.islands.length = 0;
  return w;
}

/**
 * Register ONE fleet hull by hand at an exact position — the public seam the
 * wave spawner itself uses (World.addShip with `at`, then
 * FleetController.add). Behaviour tests want a pinned geometry, not a rolled
 * anchor; the wave tests below drive the real scheduler instead.
 */
function fleetShip(w: World, id: string, size: DroneSizeId, x: number, y: number, fleetId = 1): ShipRecord {
  const rec = w.addShip(id, 'DRONE', 'fleet', droneHullOf(size), DEFAULT_HORN_ID, { x, y });
  w.drones.add(id, size, fleetId, { x: 0, y: 0 });
  return rec;
}

function captain(w: World, id: string, x = 0, y = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', DEFAULT_HORN_ID, { x, y });
  return rec;
}

function centerDist(s: ShipRecord): number {
  return Math.hypot(s.state.x, s.state.y);
}

/** Every fleet hull currently in the world. */
function fleetHulls(w: World): ShipRecord[] {
  return [...w.ships.values()].filter((s) => isFleetHull(s));
}

describe('fleet hulls — inputs are the only interface', () => {
  it('a hull with NO target never clicks, and aims at nothing, over 1000 ticks', () => {
    const w = bareWorld(7);
    const ids = ['f1', 'f2', 'f3'];
    ids.forEach((id, i) => fleetShip(w, id, 'medium', i * 200, 0));
    for (let t = 0; t < 1000; t++) {
      w.step();
      for (const id of ids) {
        const inp = w.inputs.get(id);
        expect(inp).toBeDefined();
        expect(inp!.fireSeq).toBe(0); // wantsShot() is the ONLY trigger, and it needs a target
        expect(inp!.aimDist).toBe(0);
        expect(inp!.aim).toBe(0);
        expect(inp!.slot).toBe(0); // the gun — the only weapon a fleet hull fits
      }
    }
    // Structural corollary: an un-aggroed fleet spawns no ordnance at all.
    expect(w.shells.size).toBe(0);
    expect(w.mines.size).toBe(0);
  });

  it('never activates an ability or honks — actSeq/actSlot/hornSeq are structurally constant', () => {
    const w = bareWorld(7);
    const f1 = fleetShip(w, 'f1', 'large', 0, 0);
    captain(w, 'cap', 100, 0);
    shellHit(w, f1, 'cap'); // aggro it, so the hull is in its BUSIEST state
    for (let t = 0; t < 50; t++) {
      w.step();
      const inp = w.inputs.get('f1')!;
      expect(inp.actSeq).toBe(0);
      expect(inp.actSlot).toBe(0);
      expect(inp.hornSeq).toBe(0);
      expect(inp.fireT).toBe(0); // the no-claim sentinel: a server shooter never back-dates
    }
  });

  it('drives ships through submitInput (ack seq advances, ship actually moves)', () => {
    const w = bareWorld(3);
    const d = fleetShip(w, 'f', 'medium', 0, 0);
    const start = { x: d.state.x, y: d.state.y };
    for (let t = 0; t < 40; t++) w.step();
    expect(d.lastAckSeq).toBeGreaterThan(0);
    expect(dist(d.state, start)).toBeGreaterThan(10); // it sailed somewhere
  });

  it('a dead fleet hull submits no input (idles until removed)', () => {
    const w = bareWorld(5);
    fleetShip(w, 'f', 'small', 0, 0);
    w.step();
    const seqAlive = w.inputs.get('f')!.seq;
    w.sinkShip('f');
    for (let t = 0; t < 3; t++) w.step();
    expect(w.inputs.get('f')!.seq).toBe(seqAlive);
  });
});

describe('fleet hulls — roving', () => {
  it('reaches its fleet waypoint neighbourhood and retargets to a new one', () => {
    const w = bareWorld(11);
    fleetShip(w, 'f', 'medium', 0, 0);
    const d = w.ships.get('f')!;
    w.step(); // controller picks the first waypoint
    expect(w.drones.waypointOf('f')).not.toBeNull();

    let retargeted = false;
    let closedToReach = false;
    for (let t = 0; t < 6000 && !retargeted; t++) {
      const before = w.drones.waypointOf('f')!;
      // The controller's own reach threshold is 120u, and it is measured
      // inside the step — so the last pre-step sample is the one that proves
      // the hull actually closed rather than being handed a nearer waypoint.
      if (dist(d.state, before) < 121) closedToReach = true;
      w.step();
      const after = w.drones.waypointOf('f')!;
      if (after.x !== before.x || after.y !== before.y) retargeted = true;
    }
    expect(closedToReach).toBe(true);
    expect(retargeted).toBe(true);
  });

  it('never picks a waypoint that sits inside an island', () => {
    const w = bareWorld(21);
    w.map.islands.push(circleIsland(120, 0, 80), circleIsland(-200, 150, 60));
    const ids = ['a', 'b', 'c', 'd'];
    ids.forEach((id, i) => fleetShip(w, id, 'small', -600 + i * 100, -600));
    for (let t = 0; t < 500; t++) {
      w.step();
      for (const id of ids) {
        const wp = w.drones.waypointOf(id);
        if (!wp) continue;
        for (const isle of w.map.islands) {
          expect(pointPolygonDistance(wp, isle.poly)).toBeGreaterThan(0);
        }
      }
    }
  });

  it('one fleet shares ONE waypoint stream; two fleets do not (amendment 35 — they travel together)', () => {
    const w = bareWorld(13);
    fleetShip(w, 'a1', 'small', 0, 0, 1);
    fleetShip(w, 'a2', 'small', 60, 0, 1);
    fleetShip(w, 'b1', 'small', -800, 0, 2);
    w.step();
    expect(w.drones.waypointOf('a1')).toEqual(w.drones.waypointOf('a2'));
    expect(w.drones.waypointOf('b1')).not.toEqual(w.drones.waypointOf('a1'));
  });

  it('never ends a tick inside an island (property over several seeds)', () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const w = bareWorld(seed);
      w.map.islands.push(circleIsland(100, 0, 70), circleIsland(-120, -80, 55));
      const ids = ['a', 'b', 'c', 'd', 'e'];
      ids.forEach((id, i) => fleetShip(w, id, 'medium', -500 + i * 120, 400));
      for (let t = 0; t < 400; t++) {
        w.step();
        for (const id of ids) {
          const s = w.ships.get(id)!;
          for (const isle of w.map.islands) {
            expect(pointPolygonDistance(s.state, isle.poly)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('stays inside the map boundary while free-sailing', () => {
    const w = bareWorld(33);
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    ids.forEach((id, i) => fleetShip(w, id, 'large', i * 90, 0));
    for (let t = 0; t < 800; t++) {
      w.step();
      for (const id of ids) {
        expect(centerDist(w.ships.get(id)!)).toBeLessThanOrEqual(w.map.radius + 1e-6);
      }
    }
  });

  it('heads for the LIVE ring centre when caught outside the safe ring', () => {
    const w = bareWorld(9, { beatMs: 1, ringSteps: [1 / 3, 2 / 3], offsetCap: 1, terminalSightFactor: 1 });
    const d = fleetShip(w, 'f', 'medium', 0, 0);
    w.startZone();
    for (let t = 0; t < 10; t++) w.step();
    const ring = w.zoneLiveRing;
    const ringDist = (s: ShipRecord): number => Math.hypot(s.state.x - ring.cx, s.state.y - ring.cy);
    d.state.x = ring.cx + w.map.radius * 0.5;
    d.state.y = ring.cy;
    d.state.heading = 0;
    d.state.speed = 0;
    expect(ringDist(d)).toBeGreaterThan(ring.r);
    const before = ringDist(d);
    for (let t = 0; t < 300; t++) w.step();
    expect(ringDist(d)).toBeLessThan(before - 100);
  });
});

// --- SELF-DEFENCE (amendments 35/36) -----------------------------------------

/** The World's ONE damage choke. It is private by design (every in-sim caller
 *  is inside world.ts), and it is exactly the seam the aggro rule hangs off —
 *  so these tests reach it the way perception.test.ts reaches `events`, with
 *  a typed cast rather than by widening the production API. */
type DamageChoke = { hitShip(v: ShipRecord, amount: number, byId: string, fromMine: boolean): void };

/** Damage `victim` as if `by` SHELLED it (`fromMine: false`). */
function shellHit(w: World, victim: ShipRecord, by: string, amount = 5): void {
  (w as unknown as DamageChoke).hitShip(victim, amount, by, false);
}

/** Damage `victim` as if a MINE blast caught it (`fromMine: true`) —
 *  amendment 36: a mine gives no bearing worth chasing. */
function mineHit(w: World, victim: ShipRecord, by: string, amount = 5): void {
  (w as unknown as DamageChoke).hitShip(victim, amount, by, true);
}

describe('fleet self-defence — acquisition, the ONE-SHOT witness sweep, memory', () => {
  it('being shelled acquires the attacker', () => {
    const w = bareWorld(2);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'cap', 200, 0);
    expect(w.drones.targetOf('f')).toBeNull();
    shellHit(w, f, 'cap');
    expect(w.drones.targetOf('f')).toBe('cap');
  });

  it('a MINE hit causes NO aggro (amendment 36) — the same damage, the other ordnance', () => {
    const w = bareWorld(2);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'cap', 200, 0);
    mineHit(w, f, 'cap');
    expect(w.drones.targetOf('f')).toBeNull();
    // ...and the hull DID take the damage: this is an aggro rule, not a damage one.
    expect(f.hp).toBeLessThan(f.stats.maxHp);
    // The identical hit from a shell does acquire, which is what makes the
    // mine case a real distinction rather than a broken damage path.
    shellHit(w, f, 'cap');
    expect(w.drones.targetOf('f')).toBe('cap');
  });

  it('the witness sweep is evaluated ONCE, at the instant of the hit', () => {
    const w = bareWorld(4);
    const victim = fleetShip(w, 'victim', 'medium', 0, 0);
    fleetShip(w, 'near', 'medium', 100, 0); // sees both
    fleetShip(w, 'far', 'medium', 2000, 0); // sees neither
    captain(w, 'cap', 150, 0);
    shellHit(w, victim, 'cap');
    expect(w.drones.targetOf('victim')).toBe('cap');
    expect(w.drones.targetOf('near')).toBe('cap'); // witnessed it
    expect(w.drones.targetOf('far')).toBeNull(); // out of sight of both
  });

  it('a hull that gains LOS LATER never joins that fight (the ONE-SHOT rule)', () => {
    const w = bareWorld(4);
    const victim = fleetShip(w, 'victim', 'medium', 0, 0);
    const late = fleetShip(w, 'late', 'medium', 2000, 0);
    captain(w, 'cap', 150, 0);
    shellHit(w, victim, 'cap');
    expect(w.drones.targetOf('late')).toBeNull();
    // Now teleport `late` into perfect view of BOTH — the exact geometry that
    // would have made it a witness a moment ago — and run the sim on. Under a
    // CONTINUOUS witness rule it would join here; under the ratified one-shot
    // rule it never can, because the sweep already happened.
    late.state.x = 80;
    late.state.y = 80;
    for (let t = 0; t < 40; t++) w.step();
    expect(w.drones.targetOf('late')).toBeNull();
  });

  it('a witness with a target of its OWN is never re-pointed', () => {
    const w = bareWorld(4);
    const busy = fleetShip(w, 'busy', 'medium', 100, 0);
    const victim = fleetShip(w, 'victim', 'medium', 0, 0);
    // `first` is parked well beyond `victim`'s sight, so the FIRST hit's
    // witness sweep cannot reach `victim` and the two hulls start the second
    // exchange in genuinely different states: busy holding, victim free.
    captain(w, 'first', 1400, 0);
    captain(w, 'second', 150, -60);
    shellHit(w, busy, 'first'); // busy locks onto `first`
    expect(w.drones.targetOf('busy')).toBe('first');
    expect(w.drones.targetOf('victim')).toBeNull();
    shellHit(w, victim, 'second'); // busy WITNESSES this but already has a target
    expect(w.drones.targetOf('victim')).toBe('second');
    expect(w.drones.targetOf('busy')).toBe('first'); // held, never traded
  });

  it('a NEW attacker never steals a held target (amendment 36 — third-party rescue is a real play)', () => {
    const w = bareWorld(4);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'prey', 150, 0);
    captain(w, 'rescuer', -150, 0);
    shellHit(w, f, 'prey');
    expect(w.drones.targetOf('f')).toBe('prey');
    // The rescuer shells it hard and repeatedly. Under an unguarded
    // acquisition this pulls the hull off its prey; under the ruling it
    // cannot, and the prey stays hunted.
    for (let i = 0; i < 5; i++) shellHit(w, f, 'rescuer', 1);
    expect(w.drones.targetOf('f')).toBe('prey');
  });

  it('an island between the witness and the fight keeps it out of it', () => {
    const w = bareWorld(4);
    // The island sits ON the segment from the witness to both the victim and
    // the attacker, so the LOS term — not the range term — is what excludes it.
    w.map.islands.push(circleIsland(0, 150, 90));
    const victim = fleetShip(w, 'victim', 'medium', 0, 0);
    fleetShip(w, 'blind', 'medium', 0, 300);
    captain(w, 'cap', 20, 60);
    shellHit(w, victim, 'cap');
    expect(w.drones.targetOf('victim')).toBe('cap');
    expect(w.drones.targetOf('blind')).toBeNull();
  });

  it('fleet ships never aggro each other', () => {
    const w = bareWorld(4);
    const a = fleetShip(w, 'a', 'medium', 0, 0);
    fleetShip(w, 'b', 'medium', 120, 0);
    shellHit(w, a, 'b');
    expect(w.drones.targetOf('a')).toBeNull();
    expect(w.drones.targetOf('b')).toBeNull();
  });

  it('memory expires CONFIG.fleet.memoryMs after the last contact, not before', () => {
    const w = bareWorld(6);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    const cap = captain(w, 'cap', 200, 0);
    shellHit(w, f, 'cap');
    expect(w.drones.targetOf('f')).toBe('cap');
    // Break contact hard: park the captain far outside sight AND freeze the
    // fleet hull where it is, so nothing can re-establish LOS.
    cap.state.x = 20000;
    const ticks = Math.ceil(CONFIG.fleet.memoryMs / DT);
    for (let t = 0; t < ticks - 2; t++) {
      f.state.x = 0;
      f.state.y = 0;
      w.step();
    }
    expect(w.drones.targetOf('f')).toBe('cap'); // still remembered
    for (let t = 0; t < 6; t++) {
      f.state.x = 0;
      f.state.y = 0;
      w.step();
    }
    expect(w.drones.targetOf('f')).toBeNull(); // forgotten
  });

  it('a hit REFRESHES memory even from outside sight — the sniper keeps the hunt alive', () => {
    const w = bareWorld(6);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'sniper', 600, 0); // well outside the fleet hull's 330u sight
    shellHit(w, f, 'sniper');
    expect(w.drones.targetOf('f')).toBe('sniper');
    const ticks = Math.ceil(CONFIG.fleet.memoryMs / DT);
    for (let t = 0; t < ticks * 3; t++) {
      f.state.x = 0;
      f.state.y = 0;
      w.step();
      if (t % 10 === 0) shellHit(w, f, 'sniper', 0.001); // keep shelling
    }
    expect(w.drones.targetOf('f')).toBe('sniper');
  });

  it('the target dies -> the hull forgets it immediately', () => {
    const w = bareWorld(6);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    captain(w, 'cap', 200, 0);
    shellHit(w, f, 'cap');
    w.sinkShip('cap');
    w.step();
    expect(w.drones.targetOf('f')).toBeNull();
  });

  it('a SINKING hull drops its target — the aggro mark never outlives the threat', () => {
    // The review-gate finding: tick() skips a non-afloat hull, so refreshTarget
    // stopped running and isTargeting() stayed true for the whole 5s window,
    // marking a hull that is structurally unable to steer or fire.
    const w = bareWorld(8);
    const f = fleetShip(w, 'f', 'medium', 0, 0);
    const cap = captain(w, 'cap', 200, 0);
    shellHit(w, f, 'cap');
    w.step();
    expect(w.drones.isTargeting('f', cap.id)).toBe(true);
    w.sinkShip('f', 'cap'); // the hull is now SINKING, not yet sunk
    expect(isSinking(f.lifecycle)).toBe(true);
    w.step();
    expect(w.drones.targetOf('f')).toBeNull();
    expect(w.drones.isTargeting('f', cap.id)).toBe(false);
    // ...and it stays false for the rest of the window (nothing re-acquires).
    for (let t = 0; t < SINK_TICKS - 2; t++) w.step();
    expect(w.drones.isTargeting('f', cap.id)).toBe(false);
  });
});

describe('fleet gunnery — the one trigger', () => {
  it('an acquired hull WITH line of sight fires; a blind one holds', () => {
    const w = bareWorld(8);
    const f = fleetShip(w, 'f', 'large', 0, 0);
    const cap = captain(w, 'cap', 150, 0);
    shellHit(w, f, 'cap');
    let sawShot = false;
    for (let t = 0; t < 60 && !sawShot; t++) {
      w.step();
      if (w.inputs.get('f')!.fireSeq > 0) sawShot = true;
      cap.state.x = 150; // hold the captain in view
      cap.state.y = 0;
      f.state.x = 0;
      f.state.y = 0;
    }
    expect(sawShot).toBe(true);

    const w2 = bareWorld(8);
    const f2 = fleetShip(w2, 'f', 'large', 0, 0);
    const sniper = captain(w2, 'cap', 3000, 0); // acquired, never visible
    shellHit(w2, f2, 'cap');
    for (let t = 0; t < 60; t++) {
      sniper.state.x = 3000;
      f2.state.x = 0;
      f2.state.y = 0;
      w2.step();
    }
    expect(w2.inputs.get('f')!.fireSeq).toBe(0);
  });

  it('a fleet shell never damages another fleet hull (amendment 36)', () => {
    const w = bareWorld(8);
    const shooter = fleetShip(w, 'shooter', 'large', 0, 0);
    const friend = fleetShip(w, 'friend', 'large', 120, 0);
    const cap = captain(w, 'cap', 300, 0); // dead astern of `friend` from the shooter
    shellHit(w, shooter, 'cap');
    const friendHp = friend.hp;
    for (let t = 0; t < 300; t++) {
      // Freeze the geometry: the friendly hull sits ON the firing line.
      shooter.state.x = 0;
      shooter.state.y = 0;
      friend.state.x = 120;
      friend.state.y = 0;
      cap.state.x = 300;
      cap.state.y = 0;
      w.step();
    }
    expect(friend.hp).toBe(friendHp); // never scratched, and never intercepted the shell
    expect(cap.hp).toBeLessThan(cap.stats.maxHp); // the captain, meanwhile, got hit
  });
});

// --- WAVES (amendments 33/37) -------------------------------------------------

/** Fast-forward the wave clock so `atMs` lands on the very next step. */
function armWaveClock(w: World, atMs: number): void {
  w.startZone(w.now - atMs);
}

describe('fleet waves — timing and exact composition (amendment 33)', () => {
  it('nothing spawns before the first beat, and the first wave lands every group at once', () => {
    const w = bareWorld(17);
    w.startZone();
    const firstBeat = CONFIG.fleet.waves[0].atMs;
    for (let t = 0; t < firstBeat / DT - 1; t++) w.step();
    expect(w.now).toBeLessThan(firstBeat);
    expect(fleetHulls(w)).toHaveLength(0); // not one hull before the beat
    w.step(); // the tick the beat lands on
    expect(w.now).toBe(firstBeat);
    expect(fleetHulls(w)).toHaveLength(CONFIG.fleet.waves[0].fleets * fleetHullIds().length);
  });

  it('each group is 1 large + 2 medium + 3 small, and its XP value is DERIVED, never declared', () => {
    const w = bareWorld(17);
    armWaveClock(w, CONFIG.fleet.waves[0].atMs);
    w.step();
    const hulls = fleetHulls(w);
    const perFleet = fleetHullIds().length;
    expect(hulls).toHaveLength(CONFIG.fleet.waves[0].fleets * perFleet);
    const byHull = new Map<string, number>();
    for (const s of hulls) byHull.set(s.hullId, (byHull.get(s.hullId) ?? 0) + 1);
    const fleets = CONFIG.fleet.waves[0].fleets;
    // Counts come from CONFIG.fleet.composition, so a composition retune moves
    // the expectation with the config rather than needing a literal re-solve.
    expect(byHull.get('droneLarge')).toBe(CONFIG.fleet.composition.large * fleets);
    expect(byHull.get('droneMedium')).toBe(CONFIG.fleet.composition.medium * fleets);
    expect(byHull.get('droneSmall')).toBe(CONFIG.fleet.composition.small * fleets);
    // NO HARDCODED TOTAL (Eric ruling 2026-08-16, epic-6 amendment 24). What is
    // pinned is that the payout is the SUM OF THE PARTS — i.e. that
    // fleetLevels() really does read the composition rather than a constant.
    const byParts =
      CONFIG.fleet.composition.large * CONFIG.xp.droneTierLevels.droneLarge +
      CONFIG.fleet.composition.medium * CONFIG.xp.droneTierLevels.droneMedium +
      CONFIG.fleet.composition.small * CONFIG.xp.droneTierLevels.droneSmall;
    expect(fleetLevels()).toBe(byParts);
  });

  it('the whole schedule lands every wave cumulatively (amendment 24: 8/4/2 groups of six)', () => {
    const w = bareWorld(19);
    w.startZone();
    const perFleet = fleetHullIds().length;
    let expected = 0;
    for (const wave of CONFIG.fleet.waves) {
      while (w.now < wave.atMs) w.step();
      w.step();
      expected += wave.fleets * perFleet;
      expect(fleetHulls(w)).toHaveLength(expected);
    }
    // Cumulative hull count is DERIVED from the schedule, never a literal —
    // the wave sizes are a ratio (~1 twelve-hull fleet per 5 captains) and the
    // totals are their consequence (epic-6 amendment 24).
    const totalFleets = CONFIG.fleet.waves.reduce((n, wv) => n + wv.fleets, 0);
    expect(expected).toBe(totalFleets * perFleet);
    // The match payout is likewise derived; assert it is exact, not that it
    // equals any particular number.
    expect(Number.isInteger(totalFleets * fleetLevels() * 1024)).toBe(true);
    expect(totalFleets * fleetLevels()).toBeGreaterThan(0);
  });

  it('a wave fires only while the match is live (zone anchored AND damage enabled)', () => {
    const w = bareWorld(17);
    w.damageEnabled = false;
    armWaveClock(w, CONFIG.fleet.waves[0].atMs);
    for (let t = 0; t < 10; t++) w.step();
    expect(fleetHulls(w)).toHaveLength(0); // the ready room stays empty
    w.damageEnabled = true;
    w.step();
    expect(fleetHulls(w).length).toBeGreaterThan(0);
  });

  it('an unanchored zone never fires a wave, however long the world runs', () => {
    const w = bareWorld(17);
    for (let t = 0; t < CONFIG.fleet.waves[0].atMs / DT + 40; t++) w.step();
    expect(fleetHulls(w)).toHaveLength(0);
  });

  it('every spawned hull is registered with the controller and gets an input', () => {
    const w = bareWorld(23);
    armWaveClock(w, CONFIG.fleet.waves[0].atMs);
    w.step();
    const hulls = fleetHulls(w);
    expect(hulls.length).toBeGreaterThan(0);
    w.step();
    for (const s of hulls) expect(w.inputs.get(s.id)).toBeDefined();
    expect(w.drones.size).toBe(hulls.length);
  });

  it('every spawned hull pushes a `spawn` event at its own position', () => {
    const w = bareWorld(23);
    armWaveClock(w, CONFIG.fleet.waves[0].atMs);
    w.step();
    const spawns = w.tickEvents.filter((e) => e.k === 'spawn') as { k: 'spawn'; id: string; x: number; y: number }[];
    const hulls = fleetHulls(w);
    expect(spawns).toHaveLength(hulls.length);
    for (const s of hulls) {
      const ev = spawns.find((e) => e.id === s.id)!;
      expect(ev.x).toBeCloseTo(s.state.x, 6);
      expect(ev.y).toBeCloseTo(s.state.y, 6);
    }
  });

  it('the six hulls of one group spawn within the ratified spread of their anchor', () => {
    const w = bareWorld(29);
    armWaveClock(w, CONFIG.fleet.waves[2].atMs); // the 9:00 beat...
    w.step();
    // ...and arming the clock at 9:00 means every earlier beat is already due,
    // so every group lands together. Group by fleet through the shared
    // waypoint the controller gives each one (one more tick, since a hull
    // spawned at the end of a tick has not run its controller yet).
    w.step();
    const hulls = fleetHulls(w);
    const groups = new Map<string, ShipRecord[]>();
    for (const s of hulls) {
      const key = JSON.stringify(w.drones.waypointOf(s.id));
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    for (const group of groups.values()) {
      expect(group.length).toBe(fleetHullIds().length);
      // Every pair inside a fleet is within twice the spread radius of the other.
      for (const a of group) {
        for (const b of group) expect(dist(a.state, b.state)).toBeLessThanOrEqual(CONFIG.fleet.spreadU * 2 + 1e-6);
      }
    }
  });
});

describe('fleet waves — the anchor rule (amendment 37)', () => {
  it('the anchor lands OUTSIDE every captain intel disc, and inside the live ring', () => {
    const w = bareWorld(31);
    // A ring of captains, none of whom may see the arrival.
    const caps: ShipRecord[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      caps.push(captain(w, `cap-${i}`, Math.cos(a) * 1400, Math.sin(a) * 1400));
    }
    armWaveClock(w, CONFIG.fleet.waves[0].atMs);
    w.step();
    const hulls = fleetHulls(w);
    expect(hulls.length).toBeGreaterThan(0);
    // The ANCHOR is what the rule constrains, and it is not stored — but every
    // hull sits within spreadU of it, so a hull deep inside a captain's disc
    // would have to have come from an anchor inside it too. Assert the strong,
    // checkable consequence: no hull within (radar - spread) of a captain.
    const slack = CONFIG.fleet.spreadU;
    for (const s of hulls) {
      for (const c of caps) {
        expect(dist(s.state, c.state)).toBeGreaterThan(c.stats.radarRange - slack);
      }
    }
    const ring = w.zoneLiveRing;
    for (const s of hulls) {
      expect(Math.hypot(s.state.x - ring.cx, s.state.y - ring.cy)).toBeLessThanOrEqual(ring.r);
    }
  });

  // REGRESSION, epic-6 amendment 24. Ring containment used to be an ARITHMETIC
  // COINCIDENCE between two unrelated constants: fleetAnchor samples within
  // `max(ring.r - spreadU, ring.r * FLEET_ANCHOR_MIN_FRACTION)`, and the second
  // term wins whenever `ring.r < spreadU / (1 - 0.35)` — below 615u at the old
  // spreadU 400, below 769u at the current 500. At the 660u terminal ring that
  // permits an anchor at 231u scattering a full 500u, i.e. 731u from centre:
  // OUTSIDE the ring, in the storm. `fleetOffset` now tests containment per
  // hull, so the property holds for ANY spreadU rather than by luck.
  //
  // Arming at full closure also makes every wave due at once, so this lands the
  // whole match's hull count into the smallest ring the timeline ever has —
  // the hardest placement case that exists.
  it('NO hull lands in the storm, even when the ring is small enough that the anchor floor governs', () => {
    const smallRing: ZoneTimeline = {
      beatMs: 60000,
      ringSteps: [1 / 3, 2 / 3],
      offsetCap: 1.0,
      terminalSightFactor: 2, // terminal ring = 2 × sight = 660u
    };
    const w = bareWorld(41, smallRing);
    // Full closure for a three-group timeline: every wave beat has passed, so
    // all of them land together into the terminal ring.
    armWaveClock(w, smallRing.beatMs * 4 * (smallRing.ringSteps.length + 1));
    w.step();

    const ring = w.zoneLiveRing;
    // Guard the guard: this test is only meaningful while the floor actually
    // governs. If the ring ever grows past spreadU/(1-fraction) this stops
    // exercising the bug and must be re-tuned rather than silently passing.
    expect(ring.r).toBeLessThan(CONFIG.fleet.spreadU / 0.65);

    const hulls = fleetHulls(w);
    const totalFleets = CONFIG.fleet.waves.reduce((n, wv) => n + wv.fleets, 0);
    expect(hulls).toHaveLength(totalFleets * fleetHullIds().length);
    for (const s of hulls) {
      expect(Math.hypot(s.state.x - ring.cx, s.state.y - ring.cy)).toBeLessThanOrEqual(ring.r);
    }
  });

  it('no feasible anchor: the wave RETRIES, then arrives anyway at the max-min point AND LOGS', () => {
    const w = bareWorld(37);
    const cap = captain(w, 'cap', 0, 0);
    // One captain whose intel disc swallows the entire ocean: every sampled
    // anchor is denied, forever. The wave must still arrive.
    cap.stats = { ...cap.stats, radarRange: w.map.radius * 10 };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      armWaveClock(w, CONFIG.fleet.waves[0].atMs);
      w.step();
      expect(fleetHulls(w)).toHaveLength(0); // held back on the first tick...
      for (let t = 0; t < CONFIG.fleet.spawnRetryTicks - 2; t++) w.step();
      expect(fleetHulls(w)).toHaveLength(0); // ...and through the whole retry budget
      for (let t = 0; t < 3; t++) w.step();
      expect(fleetHulls(w)).toHaveLength(CONFIG.fleet.waves[0].fleets * fleetHullIds().length);
      const lines = log.mock.calls.map((c) => String(c[0]));
      expect(lines.filter((l) => l.includes('fleet.spawnFallback'))).toHaveLength(CONFIG.fleet.waves[0].fleets);
    } finally {
      log.mockRestore();
    }
  });

  it('a captain whose intel range the SPREAD DISC overlaps still never receives a hull inside it', () => {
    // The review-gate finding: amendment 37 constrains the ANCHOR, but the nine
    // hulls then scatter up to spreadU (400u) from it — worst case one
    // materialized 260u from a captain, inside the 330u sight bubble. The fix
    // is per hull, so the formation deforms instead of the wave failing.
    //
    // The geometry here FORCES the overlap rather than hoping for it: one
    // captain at the ring centre with an intel disc covering 90% of the anchor
    // sampling radius, so every feasible anchor sits in a thin outer annulus
    // and a large share of its 400u spread points back inside the disc.
    for (const seed of [53, 59, 61, 67]) {
      const w = bareWorld(seed);
      const ring = w.zoneLiveRing;
      const cap = captain(w, 'cap', ring.cx, ring.cy);
      const sampleMax = ring.r - CONFIG.fleet.spreadU;
      cap.stats = { ...cap.stats, radarRange: sampleMax * 0.9 };
      armWaveClock(w, CONFIG.fleet.waves[0].atMs);
      w.step();
      const hulls = fleetHulls(w);
      expect(hulls.length).toBe(CONFIG.fleet.waves[0].fleets * fleetHullIds().length);
      let nearest = Infinity;
      for (const s of hulls) {
        const d = dist(s.state, cap.state);
        expect(d).toBeGreaterThan(cap.stats.radarRange); // the whole point
        nearest = Math.min(nearest, d);
      }
      // NON-VACUITY: the spread disc really does reach into the intel disc —
      // some hull ends up hard against its edge, which is exactly where the
      // pre-fix scatter would have crossed it.
      expect(nearest).toBeLessThan(cap.stats.radarRange + CONFIG.fleet.spreadU);
    }
  });

  it('a wave whose anchor frees up mid-retry spawns WITHOUT the fallback log', () => {
    const w = bareWorld(41);
    const cap = captain(w, 'cap', 0, 0);
    cap.stats = { ...cap.stats, radarRange: w.map.radius * 10 };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      armWaveClock(w, CONFIG.fleet.waves[0].atMs);
      w.step();
      expect(fleetHulls(w)).toHaveLength(0);
      cap.stats = { ...cap.stats, radarRange: CONFIG.vision.radar }; // the sky clears
      w.step();
      expect(fleetHulls(w)).toHaveLength(CONFIG.fleet.waves[0].fleets * fleetHullIds().length);
      expect(log.mock.calls.map((c) => String(c[0])).some((l) => l.includes('fleet.spawnFallback'))).toBe(false);
    } finally {
      log.mockRestore();
    }
  });
});

// --- ACCOUNTING (amendment 38) ------------------------------------------------

describe('a PvE kill counts nowhere, but still pays and still announces', () => {
  it('no tally, no throne — but XP and a `sunk` event both fire', () => {
    const w = bareWorld(43);
    const cap = captain(w, 'cap', 0, 0);
    const f = fleetShip(w, 'f', 'large', 200, 0);
    const killsBefore = cap.kills;
    const xpBefore = cap.xpMs;
    w.sinkShip(f.id, 'cap');
    expect(cap.kills).toBe(killsBefore); // the tally does NOT move
    expect(w.bountyId).toBe(''); // and the throne stays vacant
    expect(cap.xpMs).toBeGreaterThan(xpBefore); // the XP does
    w.step();
    const sunk = w.tickEvents.filter((e) => e.k === 'sunk') as { k: 'sunk'; id: string; by?: string }[];
    expect(sunk.map((e) => e.id)).toContain('f');
    expect(sunk.find((e) => e.id === 'f')!.by).toBe('cap');
  });

  it('a CAPTAIN kill still advances the tally and the throne', () => {
    const w = bareWorld(43);
    const cap = captain(w, 'cap', 0, 0);
    captain(w, 'rival', 200, 0);
    w.sinkShip('rival', 'cap');
    expect(cap.kills).toBe(1);
    expect(w.bountyId).toBe('cap');
  });

  it('...but the DATA is kept: pveKills counts per victim size while `kills` stays at zero (amendment 44)', () => {
    const w = bareWorld(47);
    const cap = captain(w, 'cap', 0, 0);
    for (const [i, size] of (['small', 'medium', 'large'] as DroneSizeId[]).entries()) {
      fleetShip(w, `f${i}`, size, 200, 0);
      w.sinkShip(`f${i}`, 'cap');
    }
    fleetShip(w, 'f3', 'small', 200, 0); // a second small, to prove it counts up
    w.sinkShip('f3', 'cap');
    expect(cap.pveKills).toEqual({
      [droneHullOf('small')]: 2,
      [droneHullOf('medium')]: 1,
      [droneHullOf('large')]: 1,
    });
    // THE PAIR, pinned together against future drift: the presentation tally
    // stays empty (amendment 38) while the telemetry sibling fills.
    expect(cap.kills).toBe(0);
    expect(w.bountyId).toBe('');
  });

  it('the PvE counter zeroes at the match boundary, exactly like `kills`', () => {
    const w = bareWorld(47);
    const cap = captain(w, 'cap', 0, 0);
    fleetShip(w, 'f', 'medium', 200, 0);
    w.sinkShip('f', 'cap');
    expect(Object.values(cap.pveKills)).toEqual([1]);
    w.resetForMatchStart(); // countdown -> active: redeployShip runs
    expect(cap.pveKills).toEqual({});
  });

  it('the size tier still sets the XP: large > medium > small', () => {
    const paid = (size: DroneSizeId): number => {
      const w = bareWorld(43);
      const cap = captain(w, 'cap', 0, 0);
      fleetShip(w, 'f', size, 200, 0);
      w.sinkShip('f', 'cap');
      return cap.xpMs + cap.level * CONFIG.xp.levelMs;
    };
    expect(paid('large')).toBeGreaterThan(paid('medium'));
    expect(paid('medium')).toBeGreaterThan(paid('small'));
  });
});

// --- THE FILL IS GONE (amendment 41) ------------------------------------------

interface MatchCtx {
  w: World;
  m: Match;
  calls: string[];
  results: unknown[];
}

/**
 * DEV-ONLY timings that let a SOLO captain start the countdown. `minHumans: 1`
 * is unreachable in production — CONFIG.match.minHumans is 2 and
 * sanitizeRoomOptions gates matchOverride behind HC_DEV_OPTIONS — which is
 * precisely the premise amendment 4 rests on.
 */
const SOLO_TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0, minHumans: 1 };

/** Production timings: the countdown needs CONFIG.match.minHumans (2) captains. */
const DUO_TIMINGS: MatchTimings = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 };

/** Inert hooks. THERE IS NO FILL HOOK ANY MORE (amendment 41) — the interface
 *  itself no longer carries one, so a re-added fill cannot compile. */
function inertHooks(calls: string[], results: unknown[]): MatchHooks {
  return {
    lock: () => calls.push('lock'),
    unlock: () => calls.push('unlock'),
    broadcastResults: (msg) => results.push(msg),
    requeue: () => calls.push('requeue'),
    disconnect: () => calls.push('disconnect'),
  };
}

function buildMatch(ids: string[], timings: MatchTimings, seed: number): MatchCtx {
  const w = bareWorld(seed);
  const calls: string[] = [];
  const results: unknown[] = [];
  const m = new Match(w, timings, inertHooks(calls, results));
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    m.notifyRosterChanged();
  }
  return { w, m, calls, results };
}

const soloMatch = (seed = 1): MatchCtx => buildMatch(['human'], SOLO_TIMINGS, seed);
const duoMatch = (seed = 1): MatchCtx => buildMatch(['human', 'rival'], DUO_TIMINGS, seed);

function step(ctx: MatchCtx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

function runCountdown(ctx: MatchCtx): void {
  for (let i = 0; i < 100 && ctx.m.phase === 'countdown'; i++) step(ctx);
  expect(ctx.m.phase).not.toBe('countdown');
}

function activate(ctx: MatchCtx): void {
  runCountdown(ctx);
  expect(ctx.m.phase).toBe('active');
}

describe('match — the match-start drone fill is DELETED (amendment 41)', () => {
  it('activation adds nothing: the world is exactly its captains', () => {
    const ctx = duoMatch();
    activate(ctx);
    expect(ctx.w.ships.size).toBe(2);
    expect(fleetHulls(ctx.w)).toHaveLength(0);
    step(ctx, 20);
    expect(ctx.w.ships.size).toBe(2);
  });

  it('a solo captain wins immediately — with an EMPTY ocean, not a full one', () => {
    const ctx = soloMatch();
    runCountdown(ctx);
    expect(fleetHulls(ctx.w)).toHaveLength(0);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human');
    const msg = ctx.results[0] as { rows: { id: string }[] };
    expect(msg.rows.map((r) => r.id)).toEqual(['human']);
  });

  it('two afloat captains keep fighting; a fleet that arrives mid-match never gates the win', () => {
    const ctx = duoMatch();
    activate(ctx);
    // The 1:00 wave lands into a live match. The wave clock is the ZONE
    // clock, which anchors at activation — not at world creation.
    while (ctx.w.now - ctx.w.zoneStartMs < CONFIG.fleet.waves[0].atMs) step(ctx);
    expect(fleetHulls(ctx.w).length).toBeGreaterThan(0);
    expect(ctx.m.phase).toBe('active');
    ctx.w.sinkShip('rival', 'human');
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('human');
    // Fleet hulls hold NO placement and NO results row.
    for (const s of fleetHulls(ctx.w)) expect(ctx.m.placements.get(s.id)).toBeUndefined();
    const msg = ctx.results[0] as { rows: { id: string }[] };
    expect(msg.rows.map((r) => r.id)).toEqual(['human', 'rival']);
  });

  it('a fleet hull can never win — a same-tick captain wipe is a DRAW (amendment 14)', () => {
    const ctx = duoMatch();
    activate(ctx);
    fleetShip(ctx.w, 'f', 'medium', 500, 500);
    ctx.w.sinkShip('rival');
    ctx.w.sinkShip('human');
    step(ctx, SINK_TICKS + 1);
    expect(ctx.m.phase).toBe('finished');
    expect(ctx.m.winnerId).toBe('');
    expect(ctx.m.placements.get('human')).toBe(1);
    expect(fleetHulls(ctx.w).filter((s) => isAfloat(s.lifecycle)).length).toBeGreaterThan(0);
  });
});
