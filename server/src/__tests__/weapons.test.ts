// Torpedoes + mines: single-round pool reload, arc gating, island block, mine
// arm delay, silhouette-proximity trigger (not center), owner immunity, the
// Story 1.8 BLAST rework (multi-victim owner-excluded blasts, owner-only
// armed-only gun-burst detonation, no chains), oldest-despawn at cap, the
// WeaponAmmo[] wire array, and the structural guarantee that a torpedo can
// NEVER be radar-painted (only ships paint).

import { describe, it, expect } from 'vitest';
import {
  isAfloat,
  CONFIG,
  effectiveStats,
  hullSilhouette,
  paintCoverage,
  transformPolygon,
  type BlipEvent,
  type FrameMsg,
  type InputMsg,
  type MineKind,
  type Target,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { fitClassWeapons } from './classWeapons.js';
import { buildFrame } from '../game/frames.js';
import {
  addMine,
  checkMineTriggers,
  fireTorpedo,
  mineBlastVictims,
  slotAmmo,
  type MineState,
} from '../game/equipment/index.js';
import { CONSUMABLES } from '../game/equipment/consumables.js';
import { circleIsland, flatRaster } from './islandFixture.js';

// NINE FIXED-ROLE SLOTS (Story 8.5): [gun, boost, weapon x3, consumable x4] on
// every captain. A hull's class weapon is no longer hardware — it arrives as
// the SPAWN SEED's card and lands in the FIRST weapon slot (2): the Torpedo
// Boat's `heavyTorpedo` and the Mine Layer's `navalMines` both sit there.
const SLOT_GUN = 0;
const SLOT_TORPEDO = 2;
const SLOT_MINE_ML = 2;

const HALF_PI = Math.PI / 2;
let idSeq = 0;
const mkId = (): string => `t${++idSeq}`;

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** Place a ship at an exact pose with a torpedo-firing input over the bow. */
function torpShip(w: World, id: string, x: number, y: number, heading: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), undefined, undefined, undefined, undefined);
  // THE TUBES ARE A CARD NOW (Story 8.10, amendment 62): the interim spawn
  // seed is deleted and a hull comes up with gun + Shift and an EMPTY weapon
  // row, so this fixture fits the torpedo explicitly through the same
  // applyCard path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  rec.state = { x, y, heading, speed: 0 };
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: heading, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  rec.input = input;
  return rec;
}

const windowAround = (me: ShipRecord, brg: number, h = 0.02): void => {
  me.prevSweepAngle = ((brg - h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  me.sweepAngle = ((brg + h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
};
// Radar paints — the identity-free coverage footprint (the one grammar).
const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

describe('torpedoes — single-round pool reload', () => {
  it('one launch drains the pool; a second is denied until it reloads', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0); // aim over the bow (heading 0)
    const t1 = fireTorpedo(ship, 0, mkId);
    const t2 = fireTorpedo(ship, 0, mkId);
    expect(t1).not.toBeNull();
    expect(t2).toBeNull(); // pool empty, now reloading
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs });
    expect(t1!.kind).toBe('torp');
    expect(t1!.damage).toBe(CONFIG.torpedo.damage);
    expect(t1!.hitRadius).toBe(CONFIG.torpedo.hitRadius); // own value, not gun's
    expect(t1!.distLeft).toBe(Number.POSITIVE_INFINITY); // A3: runs until impact
    // Fish leaves the bow at torpedo speed straight ahead (+x).
    expect(t1!.vx).toBeCloseTo(CONFIG.torpedo.speed, 6);
  });

  it('the pool refills once its reload elapses', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0);
    ship.loadout[SLOT_TORPEDO].state = { n: 0, reloadMsLeft: 200 }; // almost ready, empty
    expect(fireTorpedo(ship, 0, mkId)).toBeNull(); // still empty
    ship.loadout[SLOT_TORPEDO].state = { n: 1, reloadMsLeft: 0 }; // reloaded
    expect(fireTorpedo(ship, 0, mkId)).not.toBeNull(); // now fires
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: 0, reloadMsLeft: CONFIG.torpedo.reloadMs });
  });
});

describe('torpedoes — bow arc gating', () => {
  it('launches within the ±30° bow arc and refuses outside it', () => {
    const w = bareWorld();
    const inArcShip = torpShip(w, 'a', 0, 0, 0);
    inArcShip.input = { ...inArcShip.input, aim: CONFIG.torpedo.halfArc - 0.01 };
    expect(fireTorpedo(inArcShip, 0, mkId)).not.toBeNull();

    const abeam = torpShip(w, 'b', 0, 0, 0);
    abeam.input = { ...abeam.input, aim: HALF_PI }; // 90° off the bow
    expect(fireTorpedo(abeam, 0, mkId)).toBeNull();
    expect(abeam.loadout[SLOT_TORPEDO].state).toEqual({ n: 1, reloadMsLeft: 0 }); // pool not drained
  });
});

describe('torpedoes — island block + ship hit', () => {
  it('an island on the run blocks the torpedo (no damage, splash on the rock)', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI); // bow points +y
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 160, heading: 0, speed: 0 };
    w.map.islands.push(circleIsland(0, 70, 30)); // squarely on the run
    const events = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      events.push(...w.tickEvents);
    }
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true);
  });

  it('a torpedo that reaches an enemy deals its 50 damage (CONFIG.torpedo.damage)', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI);
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 150, heading: 0, speed: 0 };
    for (let i = 0; i < 80 && b.hp === CONFIG.shipClasses.torpedoBoat.hp; i++) w.step();
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.torpedo.damage);
  });
});

describe('A4 CONFIG constants', () => {
  it('torpedoes carry their own collision value (no longer gun-borrowed)', () => {
    expect(CONFIG.torpedo.hitRadius).toBe(2);
  });
  // RETIRED (Story 8.4, FR57/AR48): there is no global mine cap any more — the
  // pin is inverted so `globalCap` can never quietly come back.
  it('MINES HAVE NO CAPS: neither a per-player nor a room ceiling exists', () => {
    expect('globalCap' in CONFIG.mine).toBe(false);
    expect('maxLive' in CONFIG.mine).toBe(false);
  });
});

describe('torpedoes — infinite range + map-edge splash (A3)', () => {
  it('a torpedo travels past the retired 700u range to strike a distant enemy', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI); // bow +y
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 750, heading: 0, speed: 0 }; // 750u away (> old 700 cap)
    for (let i = 0; i < 400 && b.hp === CONFIG.shipClasses.torpedoBoat.hp; i++) w.step();
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.torpedo.damage);
  });

  it('a torpedo with no target splashes at the map edge (boom, no victim)', () => {
    const w = bareWorld();
    const edge = w.map.radius;
    // Near the +x edge, bow pointed out — far enough in that the boundary
    // clamp (radius - hull max radius) leaves the pose alone and the fish
    // spawns inside the water disk (bow clearance is 58u for a torpedoBoat).
    const a = torpShip(w, 'a', edge - 80, 0, 0);
    a.input = { ...a.input, aim: 0 };
    const events = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      events.push(...w.tickEvents);
    }
    const splash = events.find((e) => e.k === 'boom' && e.hit === undefined);
    expect(splash).toBeDefined();
    if (splash && splash.k === 'boom') expect(Math.hypot(splash.x, splash.y)).toBeCloseTo(edge, 0);
  });
});

describe('mines — arm delay, silhouette trigger, owner immunity', () => {
  // World-posed torpedoBoat silhouette (length 100: bow +50 / stern -50).
  function hull(id: string, x: number, y: number, heading: number): Target {
    return { id, kind: 'hull', poly: transformPolygon(hullSilhouette('torpedoBoat'), x, y, heading) };
  }
  function mineAt(
    ownerId: string,
    x: number,
    y: number,
    armedAt: number,
    kind: MineKind = 'naval',
  ): Map<string, MineState> {
    const m = new Map<string, MineState>();
    m.set('m1', { id: 'm1', ownerId, x, y, armedAt, kind });
    return m;
  }

  it('does not trigger before it arms', () => {
    const mines = mineAt('a', 0, 0, 3000);
    const enemy = [hull('b', 0, 20, HALF_PI)]; // silhouette covers the mine
    expect(checkMineTriggers(mines, () => enemy, 2999)).toEqual([]);
    expect(checkMineTriggers(mines, () => enemy, 3000)).toHaveLength(1);
  });

  it('triggers on the HULL silhouette, not the ship center', () => {
    const mines = mineAt('a', 0, 0, 0);
    // Center 40u away (> triggerRadius 32) but the stern reaches over the mine
    // (bow +y: the 100u hull spans y in [-10, 90] — the mine sits inside it).
    const reaching = [hull('b', 0, 40, HALF_PI)];
    const triggers = checkMineTriggers(mines, () => reaching, 10);
    expect(triggers.map((t) => t.victimId)).toEqual(['b']);
    // A hull whose whole silhouette stays beyond triggerRadius does not trip it
    // (center 90: stern at y=40, 40 > 32 from the mine).
    const clear = [hull('b', 0, 90, HALF_PI)];
    expect(checkMineTriggers(mineAt('a', 0, 0, 0), () => clear, 10)).toEqual([]);
  });

  it('the owner never trips its own mine', () => {
    const mines = mineAt('a', 0, 0, 0);
    const own = [hull('a', 0, 10, HALF_PI)]; // right on top of it
    expect(checkMineTriggers(mines, () => own, 10)).toEqual([]);
  });
});

// REWRITTEN TO THE NEW RULE (Story 8.4, FR57/AR48). The two cases here used to
// prove the per-player cap and its silent oldest-eviction; both are DELETED, so
// the block now proves the opposite — nothing is ever evicted — rather than
// disappearing, which would leave the old behaviour unpinned in either
// direction.
describe('mines — NO CAP: a laid mine stays laid', () => {
  it('a sixth, a sixtieth and a hundredth drop all stay live; nothing is evicted', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= 100; i++) addMine(mines, 'a', i, 0, 0, `m${i}`);
    expect(mines.size).toBe(100);
    expect(mines.has('m1')).toBe(true); // the OLDEST is still on the water
    expect(mines.has('m6')).toBe(true); // past the retired per-player cap of 5
    expect(mines.has('m100')).toBe(true); // past the retired room ceiling of 60
  });

  it('one owner\'s field never disturbs another\'s', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= 10; i++) addMine(mines, 'a', i, 0, 0, `a${i}`);
    addMine(mines, 'b', 1, 0, 0, 'b1');
    expect(mines.has('a1')).toBe(true);
    expect(mines.size).toBe(11);
  });
});

describe('World — mine placement + trigger end-to-end (Story 2.8: aimed rear-arc click, blast trip)', () => {
  it('a click-placed mine lands AT the clicked point, arms, then sinks an enemy that sails onto it — the nearby OWNER takes 0', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'mineLayer', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Mines are an aimed WEAPON (amendment 45): a click astern places one.
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 40, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
    w.step(); // places one mine at the clicked point (40u astern, -x)
    expect(w.mines.size).toBe(1);
    const mine = [...w.mines.values()][0];
    expect(mine.x).toBeCloseTo(-40, 6); // AT the click, not a stern-rack offset
    expect(mine.y).toBeCloseTo(0, 6);
    // The close placement leaves the owner's own hull inside the 48u blast
    // radius — the built-in owner-exclusion geometry this test also pins below.
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: mine.x, y: mine.y, heading: 0, speed: 0 };
    b.hp = CONFIG.mine.damage; // one blast sinks it
    for (let i = 0; i < CONFIG.mine.armDelay / CONFIG.tick.simDtMs + 2; i++) w.step();
    expect(w.mines.size).toBe(0); // detonated + despawned
    expect(isAfloat(b.lifecycle)).toBe(false);
    expect(a.kills).toBe(1);
    expect(a.hp).toBe(a.stats.maxHp); // owner EXCLUDED from its own blast, even in radius
  });
});

describe('mines — Story 1.8 blast resolution (multi-victim, owner-excluded, no chains)', () => {
  /** Bare world with a far-away Mine Layer owner `o` and an armed mine of
   *  theirs at the origin. */
  function minefield(): { w: World; o: ShipRecord } {
    const w = bareWorld(11);
    const o = w.addShip('o', 'O', 'captain', 'mineLayer', undefined, undefined);
    o.state = { x: 600, y: 600, heading: 0, speed: 0 }; // far from the blast
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0, kind: 'naval' });
    return { w, o };
  }

  it('a trip blasts EVERY non-owner hull within blastRadius for full damage; outside the radius is untouched', () => {
    const { w, o } = minefield();
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined); // trips it (silhouette over the mine)
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const c = w.addShip('c', 'C', undefined, undefined, undefined, undefined); // second victim: hull well inside 48u
    c.state = { x: 0, y: -40, heading: 0, speed: 0 };
    const d = w.addShip('d', 'D', undefined, undefined, undefined, undefined); // bystander: whole silhouette beyond 48u
    d.state = { x: 0, y: 200, heading: 0, speed: 0 };
    w.step();
    expect(w.mines.size).toBe(0);
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage); // full 45
    expect(c.hp).toBe(c.stats.maxHp - CONFIG.mine.damage); // full 45 — same blast
    expect(d.hp).toBe(d.stats.maxHp); // outside the blast
    expect(o.hp).toBe(o.stats.maxHp); // owner far away AND excluded by rule
    // One boom at the mine point, victim = the tripping ship.
    const booms = w.tickEvents.filter((e) => e.k === 'boom');
    expect(booms).toEqual([{ k: 'boom', id: 'm1', hit: 'b', x: 0, y: 0 }]);
  });

  it('the OWNER inside its own blast radius takes 0 while the tripping enemy takes 45', () => {
    const { w, o } = minefield();
    o.state = { x: 0, y: -40, heading: 0, speed: 0 }; // owner hull well inside 48u
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips it
    w.step();
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage);
    expect(o.hp).toBe(o.stats.maxHp); // owner-excluded blast (universal AoE convention)
  });

  it('DRONES are valid blast victims (enemies AND drones — no special-casing)', () => {
    // A LARGE drone (75hp) survives the 55-damage mine, so this still measures
    // that the FULL damage lands rather than only that the hull died. The small
    // hull is one-shot at its new 45hp and is covered by the case below.
    const { w } = minefield();
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined); // human trips it
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const dr = w.addShip('dr', 'DR', 'fleet', 'droneLarge', undefined, undefined); // drone inside the blast
    dr.state = { x: 0, y: -30, heading: 0, speed: 0 };
    const hpBefore = dr.stats.maxHp;
    w.step();
    expect(dr.hp).toBeCloseTo(hpBefore - CONFIG.mine.damage, 5); // full damage (drone may drift a hair pre-blast)
  });

  it('a BASE mine one-shots a small drone — the Mine Layer fleet-farm (Eric ruling 2026-08-16)', () => {
    // *"if you wanna spend mines to clear drones, do it. My players actually
    // found that the minelayer is a fleet-killing machine, and it being able to
    // aggro and mine pve ships can secure it an XP bonus to rely on in fights."*
    // At the old 60hp small drone the base mine (55) fell just short and only a
    // STACKED mine cleared it; at 45 it clears at base. Ratified, not incidental.
    expect(CONFIG.mine.damage).toBeGreaterThanOrEqual(CONFIG.drones.small.hp);
    const { w } = minefield();
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined); // human trips it
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const dr = w.addShip('dr', 'DR', 'fleet', 'droneSmall', undefined, undefined);
    dr.state = { x: 0, y: -30, heading: 0, speed: 0 };
    w.step();
    expect(dr.hp).toBeLessThanOrEqual(0);
    expect(dr.lifecycle.kind).not.toBe('alive');
  });

  it('mineBlastVictims: silhouette-in-radius membership, owner excluded (the shared burstVictims rule)', () => {
    const mine: MineState = { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0, kind: 'naval' };
    const hull = (id: string, x: number, y: number): Target => ({
      id,
      kind: 'hull',
      poly: transformPolygon(hullSilhouette('torpedoBoat'), x, y, HALF_PI),
    });
    // Hull edge within 48 (center 90: stern at y=40, 40 ≤ 48); owner's own hull
    // ON the mine excluded; a hull whose closest point is beyond 48 excluded.
    // Story 8.4: mineBlastVictims returns TARGETS (the caller dispatches on kind).
    expect(
      mineBlastVictims(mine, [hull('in', 0, 90), hull('o', 0, 0), hull('out', 0, 110)]).map((t) => t.id),
    ).toEqual(['in']);
  });

  // Story 2.8 (amendment 46) flipped the 1.8 no-chain pins; Story 8.4
  // (Eric ruling 2026-09-15, epic-8 amendment 18) flips the OWNERSHIP half of
  // them in turn: a detonation now cascades into EVERY ARMED non-captive mine
  // in blast range, WHOEVER LAID IT. Unarmed mines still never chain, and a
  // captive field neither receives nor propagates (R2.18).

  it('CHAIN: a trip cascades to another ARMED mine in blast range; an unarmed mine survives', () => {
    const { w } = minefield();
    // 45u from m1: inside m1's 48u blast, OUTSIDE the tripping hull's reach —
    // pre-2.8 this survived ("blast ≠ trigger"); the chain now takes it.
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 0, y: -45, armedAt: 0, kind: 'naval' });
    w.mines.set('m3', { id: 'm3', ownerId: 'x', x: -20, y: 0, armedAt: 999_999, kind: 'naval' }); // someone else's, UNARMED
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips only m1
    w.step();
    expect(w.mines.has('m2')).toBe(false); // chained same-tick
    // m3 survives on the ARM delay alone now — amendment 18 deleted the
    // same-owner condition, so ownership is no longer what saves it.
    expect(w.mines.has('m3')).toBe(true);
    expect(w.mines.size).toBe(1);
    // The chained mine's boom carries NO victim id (only the tripped mine's does).
    const booms = w.tickEvents.filter((e) => e.k === 'boom');
    expect(booms).toEqual([
      { k: 'boom', id: 'm1', hit: 'b', x: 0, y: 0 },
      { k: 'boom', id: 'm2', x: 0, y: -45 },
    ]);
  });

  // FLIPPED, NOT DELETED (Story 8.4, amendment 18). The old version of this
  // case asserted `mEnemy` SURVIVED — "the chain never crosses owners". Eric
  // ruled the opposite on 2026-09-15: a minefield is water, not property, so a
  // blast sets off everything armed in range. Only the ARM delay still saves a
  // mine (and the captive carve-out, pinned separately below).
  it('the chain CASCADES down a daisy line (bounded by the visited set) ACROSS OWNERS, but never into an arming mine', () => {
    const { w } = minefield();
    // m1 (0,0) → m2 at 45u → m3 at 90u (inside m2's blast, outside m1's) —
    // and an ENEMY armed mine at 70u, which amendment 18 now takes with them.
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 0, y: -45, armedAt: 0, kind: 'naval' });
    w.mines.set('m3', { id: 'm3', ownerId: 'o', x: 0, y: -90, armedAt: 0, kind: 'naval' });
    w.mines.set('mEnemy', { id: 'mEnemy', ownerId: 'x', x: 0, y: -70, armedAt: 0, kind: 'naval' });
    w.mines.set('mCold', { id: 'mCold', ownerId: 'o', x: 0, y: -120, armedAt: 999_999, kind: 'naval' });
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips only m1
    w.step();
    expect(w.mines.has('m2')).toBe(false);
    expect(w.mines.has('m3')).toBe(false);
    expect(w.mines.has('mEnemy')).toBe(false); // amendment 18: chains cross owners
    expect(w.mines.has('mCold')).toBe(true); // an arming mine is still immune
    expect(w.mines.size).toBe(1);
  });
});

describe('mines — gun-burst detonation (armed-only, ANY owner since amendment 16)', () => {
  /** ML `a` at the origin with an enemy `b` parked near a remote minefield:
   *  b's hull (y ∈ [35..55]) is OUTSIDE the gun's 30u burst at (300,0) but
   *  INSIDE the mine's 48u blast — any damage b takes is the MINE's. */
  function board(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = bareWorld(13);
    const a = w.addShip('a', 'A', 'captain', 'mineLayer', undefined, undefined);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 300, y: 45, heading: 0, speed: 0 };
    return { w, a, b };
  }

  /** Click a's gun at (dist, 0) and step until the burst resolves. */
  function shootAt(w: World, dist: number): void {
    w.submitInput('a', { seq: 9, throttle: 0, rudder: 0, aim: 0, fireSeq: 9, aimDist: dist, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    for (let i = 0; i < 60; i++) {
      w.step();
      if (w.tickEvents.some((e) => e.k === 'burst')) return;
    }
    throw new Error('no burst within the tick budget');
  }

  it('the owner’s burst detonates its ARMED mine under the click: mine gone, blast damages the nearby enemy', () => {
    const { w, a, b } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval' }); // armed, at the click point
    shootAt(w, 300);
    expect(w.mines.size).toBe(0); // detonated by the owner's burst
    // b's hull is outside the 30u gun burst but inside the mine's 48u blast:
    // exactly one full mine damage, nothing from the shell.
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage);
    expect(a.hp).toBe(a.stats.maxHp); // owner excluded from both
    // The detonation's own boom carries NO victim id (no tripping ship).
    const boom = w.tickEvents.find((e) => e.k === 'boom' && e.id === 'm1');
    expect(boom).toEqual({ k: 'boom', id: 'm1', x: 300, y: 0 });
    expect(boom && 'hit' in boom).toBe(false);
  });

  it('an UNARMED own mine under the burst survives (armDelay keeps its anti-instant-bomb role)', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 999_999, kind: 'naval' }); // still arming
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(true); // immune while unarmed
  });

  // FLIPPED, NOT DELETED (Story 8.4, Eric ruling 2026-09-15, amendment 16).
  // The old version of this case asserted that only the mine's OWN owner could
  // set it off with a burst — the shipped click-your-own-minefield rule. Eric
  // ruled that a shell or burst detonates ANY armed non-captive mine, so the
  // pin now proves the opposite, and the ONE thing that still saves a mine
  // (the arm delay) keeps its own case above.
  it('ANY burst detonates ANY armed mine — an enemy field included (amendment 16)', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: 300, y: 0, armedAt: 0, kind: 'naval' }); // someone ELSE's armed mine
    shootAt(w, 300); // a's burst covers it
    expect(w.mines.has('m1')).toBe(false);
  });

  // A CAPTIVE MINE CANNOT BE SELF-DETONATED (Story 7-5 wave 2, R2.18 — Eric
  // ruling 2026-08-19). The burst passes over it and the mine PERSISTS, armed
  // and waiting: it neither blasts NOR launches, because R2.12 already made the
  // torpedo its only attack and this was the last path by which a captive mine
  // could produce a blast centred on its own casing.
  //
  // The board is deliberately EMPTY of hostiles: a captive field's trip ring is
  // 144u at base (the swap-and-triple transform), so `board()`'s enemy parked
  // 45u off the mine would TRIP it and mask the thing under test. What is being
  // asserted here is the BURST path alone.
  function lonely(): { w: World; a: ShipRecord } {
    const w = bareWorld(17);
    const a = w.addShip('a', 'A', 'captain', 'mineLayer', undefined, undefined);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    return { w, a };
  }

  /**
   * THE CAPTIVE CHASSIS IS THE MINE'S OWN KIND NOW (Story 8.13, epic-8
   * amendment 76). `captive` was a DOCTRINE FLAG on the naval stat row until
   * this cycle — first a card (`mineCaptive`), then a base flag on the
   * still-stubbed v3 line — and every pin below had to forge it onto the
   * owner. With three racks fittable at once the owner can no longer say which
   * kind a given mine is, so the kind is STAMPED AT DROP and a captive mine is
   * laid simply by asking for one. `makeCaptive` is deleted with the flag it
   * forged; the BEHAVIOUR it guarded is pinned unchanged below.
   */

  it('R2.18: an ARMED CAPTIVE mine under the owner’s own burst survives, un-fired', () => {
    const { w } = lonely();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'captive' }); // armed, at the click point
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(true); // NOT detonated — the burst passed over it
    expect(w.tickEvents.some((e) => e.k === 'boom' && e.id === 'm1')).toBe(false);
    // And it did not LAUNCH either: no torpedo ever left the casing.
    expect([...w.shells.values()].some((sh) => sh.kind === 'torp')).toBe(false);
  });

  it('R2.18 is CAPTIVE-ONLY: the very same burst still detonates an ORDINARY mine', () => {
    const { w } = lonely(); // no captive chassis — everything else identical
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval' });
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // detonated exactly as it always has
    expect(w.tickEvents.some((e) => e.k === 'boom' && e.id === 'm1')).toBe(true);
  });

  it('R2.18: a CAPTIVE field never chains either — a whole cluster survives one burst', () => {
    const { w } = lonely();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'captive' }); // under the click
    w.mines.set('m2', { id: 'm2', ownerId: 'a', x: 340, y: 0, armedAt: 0, kind: 'captive' }); // the chain neighbour
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(true);
    expect(w.mines.has('m2')).toBe(true);
  });

  it('CHAIN THROUGH THE BURST (Story 2.8 flip of the 1.8 no-cascade pin): the burst-detonated mine chains its own neighbour outside the shell burst', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval' }); // under the click (30u burst)
    // 40u from m1: inside m1's 48u blast, OUTSIDE the 30u shell burst — the
    // burst never reaches it, but m1's detonation now cascades same-owner
    // (amendment 46; pre-2.8 this survived as "blast is damage-only").
    w.mines.set('m2', { id: 'm2', ownerId: 'a', x: 340, y: 0, armedAt: 0, kind: 'naval' });
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // burst-detonated
    expect(w.mines.has('m2')).toBe(false); // chained off m1's blast
  });
});

describe('one shot per click — torpedoes and mines (world level)', () => {
  it('one click launches exactly one torpedo over 20 ticks of the same input', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    fitClassWeapons(w, a); // the tubes are a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    let torps = 0;
    for (let i = 0; i < 20; i++) {
      w.step();
      torps += w.tickEvents.filter((e) => e.k === 'torp').length;
    }
    expect(torps).toBe(1);
  });

  it('one CLICK places exactly one mine (fireSeq — Story 2.8 aimed weapon), even applied past the drop cooldown; a second click places another', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'mineLayer', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 40, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    // Under hold-to-fire this input would re-place every reload; a click must not.
    const ticks = CONFIG.mine.reloadMs / CONFIG.tick.simDtMs + 20;
    for (let i = 0; i < ticks; i++) w.step();
    expect(w.mines.size).toBe(1);
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 2, aimDist: 60, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(2);
  });

  it('a PRESS (actSeq) on the ML mine slot is inert — mines JOINED the fire-control channel (Story 2.8 flip of the 1.8 pin)', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'mineLayer', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 0, aimDist: 40, slot: 0, fireT: 0, actSeq: 1, actSlot: SLOT_MINE_ML, hornSeq: 0 });
    w.step();
    expect(w.mines.size).toBe(0); // the ability-only press wall refuses weapons
    expect(a.loadout[SLOT_MINE_ML].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 }); // charge intact
    expect(a.lastActSeq).toBe(1); // the press was still consumed
  });
});

describe('ammo wire array is SLOT-ALIGNED (WeaponAmmo | null)[]', () => {
  it('mirrors the ship pools as a defensive copy, null for every empty slot', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    ship.loadout[0].state = { n: 1, reloadMsLeft: 1200 };
    ship.loadout[1].state = { n: 0, reloadMsLeft: 6000 };
    ship.loadout[2].state = { n: 0, reloadMsLeft: 8000 };
    const wire = slotAmmo(ship);
    expect(wire).toEqual([
      { n: 1, reloadMsLeft: 1200 },
      { n: 0, reloadMsLeft: 6000 },
      { n: 0, reloadMsLeft: 8000 },
      // The six empty slots ride the wire as null (slot alignment, length 9).
      null, null, null, null, null, null,
    ]);
    // A copy, not the live pool objects (mutating the wire must not affect state).
    expect(wire[0]).not.toBe(ship.loadout[0].state);
  });

  it('a fresh hull spawns with full pools; one click empties the single-shot gun pool', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: CONFIG.gun.maxAmmo, reloadMsLeft: 0 });
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fireSeq: 1, aimDist: 1000, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
    w.step(); // one click -> one shell, pool 1 -> 0, the 3s cooldown starts
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: CONFIG.gun.maxAmmo - 1, reloadMsLeft: CONFIG.gun.reloadMs });
  });
});

describe('torpedoes are NEVER radar-painted (only ships paint)', () => {
  it('a torpedo in the radar annulus produces no blip; a ship there does', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Enemy ship in the annulus (proves the beam window is right).
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 400, y: 0, heading: 0, speed: 0 };
    // A torpedo flying through the same annulus.
    w.shells.set('trp', {
      id: 'trp',
      ownerId: 'b',
      x: 400,
      y: 8,
      vx: 0,
      vy: CONFIG.torpedo.speed,
      distLeft: Number.POSITIVE_INFINITY,
      bornAt: w.now,
      kind: 'torp',
      damage: CONFIG.torpedo.damage,
      hitRadius: CONFIG.torpedo.hitRadius,
      targetX: null,
      targetY: null,
      burstRadius: 0,
      contactDamage: CONFIG.torpedo.damage,
      hits: CONFIG.torpedo.hits,
    });
    windowAround(a, 0); // beam across bearing 0 (toward x+)
    const blips = blipsOf(buildFrame(w, 'a'));
    // The ship, and ONLY the ship: one footprint, and it is b's own raster
    // (the torpedo entity never paints — its 3/8 detect gate is a different
    // channel entirely).
    expect(blips).toHaveLength(1);
    const ship = w.ships.get('b')!;
    expect({ gx: blips[0].gx, gy: blips[0].gy, w: blips[0].w, h: blips[0].h, bits: blips[0].bits }).toEqual(
      paintCoverage(ship.hullId, ship.state.x, ship.state.y, ship.state.heading, CONFIG.vision.radarCellU, w.now),
    );
  });
});

// ---------------------------------------------------------------------------
// STORY 8.13 — THE LIGHT TORPEDO AND THE SUPERCAV CONSUMABLE
// ---------------------------------------------------------------------------

/** A captain holding `n` copies of `line`, aimed at `aim`, with the named slot
 *  selected. Everything real: production catalog, production registry, the
 *  same `applyCard` path a pick takes. */
function carrier(w: World, id: string, line: string, n: number, aim: number, slot: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  for (let i = 0; i < n; i += 1) w.applyCard(rec, line);
  rec.input = { seq: 1, throttle: 0, rudder: 0, aim, fireSeq: 1, aimDist: 0, slot, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0 };
  return rec;
}

const SLOT_WEAPON_1 = 2;
const SLOT_BELT_1 = 5;

describe('LIGHT TORPEDO — the twin beam sectors (catalog-v3 R18, Story 8.13)', () => {
  // THE ARC IS THE WHOLE POINT OF THIS LINE. The heavy fires into a ±30° bow
  // cone; the light fires into ±45° about EITHER BEAM, which leaves 90°-wide
  // DEAD ZONES dead ahead and dead astern. Those dead zones are what a fixture
  // written against the heavy would never catch.
  it('fires ABEAM (90°) and is denied dead ahead (0°) and dead astern (180°) — nothing spent on the denial', () => {
    const w = bareWorld(31);
    const abeam = carrier(w, 'a', 'lightTorpedo', 1, Math.PI / 2, SLOT_WEAPON_1);
    const fish = fireTorpedo(abeam, 0, mkId, 'lightTorpedo');
    expect(fish).not.toBeNull();
    expect(fish!.kind).toBe('torp');
    expect(fish!.damage).toBe(CONFIG.lightTorpedo.damage);
    // It heads toward the CLICK, not at some fixed side-mount bearing.
    expect(fish!.vy).toBeCloseTo(CONFIG.lightTorpedo.speed, 6);
    expect(fish!.vx).toBeCloseTo(0, 6);

    for (const deadZone of [0, Math.PI]) {
      const denied = carrier(w, `d${deadZone}`, 'lightTorpedo', 1, deadZone, SLOT_WEAPON_1);
      expect(fireTorpedo(denied, 0, mkId, 'lightTorpedo')).toBeNull();
      expect(denied.loadout[SLOT_WEAPON_1].state).toEqual({ n: 1, reloadMsLeft: 0 }); // pool untouched
    }
  });

  // A STRAIGHT-RUNNER AT TIER I, A HOMER FROM TIER II (epic-8 amendment 80).
  // The structural half matters more than the number: at rate 0 the fish
  // carries NO `homing` tag at all, so sim/shell.ts never steers it, perception
  // never emits a `torpU` for it, and it carries no die-distance.
  it('tier I gets NO homing and infinite range; tier II DOES home, at the row\'s rate, with the family die-distance', () => {
    const w = bareWorld(32);
    const one = carrier(w, 'a', 'lightTorpedo', 1, Math.PI / 2, SLOT_WEAPON_1);
    const t1 = fireTorpedo(one, 0, mkId, 'lightTorpedo')!;
    expect(t1.homing).toBeUndefined();
    expect(t1.distLeft).toBe(Number.POSITIVE_INFINITY);

    const two = carrier(w, 'b', 'lightTorpedo', 2, Math.PI / 2, SLOT_WEAPON_1);
    const rate = two.stats.equipment.lightTorpedo.homingTurnRate;
    expect(rate).toBeCloseTo(0.125, 9); // the tier-II rung
    const t2 = fireTorpedo(two, 0, mkId, 'lightTorpedo')!;
    expect(t2.homing).toEqual({ turnRate: rate, acquireRange: CONFIG.torpedo.homingAcquireRange });
    expect(t2.distLeft).toBe(CONFIG.torpedo.homingMaxRangeU);
  });

  it('tubes step with the tier: 1 at I and II, 2 at III (the +0.5 step, floored once)', () => {
    const w = bareWorld(33);
    expect(carrier(w, 'a', 'lightTorpedo', 1, 0, SLOT_WEAPON_1).stats.equipment.lightTorpedo.maxAmmo).toBe(1);
    expect(carrier(w, 'b', 'lightTorpedo', 2, 0, SLOT_WEAPON_1).stats.equipment.lightTorpedo.maxAmmo).toBe(1);
    expect(carrier(w, 'c', 'lightTorpedo', 3, 0, SLOT_WEAPON_1).stats.equipment.lightTorpedo.maxAmmo).toBe(2);
  });

  it('the LIGHT line reads ITS OWN row — the heavy\'s numbers never leak into it', () => {
    const w = bareWorld(34);
    const ship = carrier(w, 'a', 'lightTorpedo', 1, Math.PI / 2, SLOT_WEAPON_1);
    const fish = fireTorpedo(ship, 0, mkId, 'lightTorpedo')!;
    expect(fish.damage).toBe(CONFIG.lightTorpedo.damage);
    expect(fish.damage).not.toBe(CONFIG.torpedo.damage);
    expect(Math.hypot(fish.vx, fish.vy)).toBeCloseTo(CONFIG.lightTorpedo.speed, 6);
    expect(ship.loadout[SLOT_WEAPON_1].state).toEqual({ n: 0, reloadMsLeft: CONFIG.lightTorpedo.reloadMs });
  });
});

describe('SUPERCAV TORPEDO — the belt\'s click-aimed consumable (epic-8 amendment 74)', () => {
  it('a click inside the bow ±15° sector fires one fish, takes ONE copy off the stack and out of `cards`', () => {
    const w = bareWorld(35);
    const ship = carrier(w, 'a', 'supercavTorpedo', 2, 0, SLOT_BELT_1);
    expect(ship.loadout[SLOT_BELT_1].equipmentId).toBe('supercavTorpedo');
    expect(w.sinkingActivationGate(ship, SLOT_BELT_1)).toEqual({ ok: true });
    const fish = [...w.shells.values()].find((sh) => sh.kind === 'torp')!;
    expect(fish.damage).toBe(CONFIG.supercavTorpedo.damage);
    expect(Math.hypot(fish.vx, fish.vy)).toBeCloseTo(CONFIG.supercavTorpedo.speed, 6);
    // IT NEVER HOMES, whatever the captain's torpedo tiers say.
    expect(fish.homing).toBeUndefined();
    expect(fish.distLeft).toBe(Number.POSITIVE_INFINITY);
    // ONE SPEND LAW: the copy leaves the stack AND the deck-held build together.
    expect(ship.loadout[SLOT_BELT_1].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(ship.cards.filter((c) => c === 'supercavTorpedo')).toHaveLength(1);
  });

  // FAIL-FIRST REGRESSION (Story 8.13): an out-of-arc click on a belt weapon
  // must cost NOTHING. The copy is the scarce thing — a consumable never
  // reloads — so a denial that took one would be unrecoverable, and the arc
  // check therefore runs BEFORE the row factory's spend.
  it('a click OUTSIDE the bow sector is denied and spends NOTHING — no copy, no card', () => {
    const w = bareWorld(36);
    const ship = carrier(w, 'a', 'supercavTorpedo', 2, Math.PI / 2, SLOT_BELT_1); // 90° abeam
    expect(w.sinkingActivationGate(ship, SLOT_BELT_1)).toEqual({ ok: false, reason: 'out-of-arc' });
    expect([...w.shells.values()].some((sh) => sh.kind === 'torp')).toBe(false);
    expect(ship.loadout[SLOT_BELT_1].state).toEqual({ n: 2, reloadMsLeft: 0 }); // stack untouched
    expect(ship.cards.filter((c) => c === 'supercavTorpedo')).toHaveLength(2);
  });

  it('an empty stack answers no-ammo, and the row NEVER reloads (a stack is copies, not ammo)', () => {
    const w = bareWorld(37);
    const ship = carrier(w, 'a', 'supercavTorpedo', 1, 0, SLOT_BELT_1);
    expect(w.sinkingActivationGate(ship, SLOT_BELT_1)).toEqual({ ok: true });
    // The slot clears at zero (the World's gate owns that), so drive a
    // hand-built empty stack through the row directly for the backstop.
    const row = CONSUMABLES.supercavTorpedo!;
    const empty = { equipmentId: 'supercavTorpedo' as const, state: { n: 0, reloadMsLeft: 0 } };
    row.tick(ship, empty, 5000);
    expect(empty.state.reloadMsLeft).toBe(0); // no reload, ever
  });
});
