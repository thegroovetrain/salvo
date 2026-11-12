// Torpedoes + mines: single-round pool reload, arc gating, island block, mine
// arm delay, silhouette-proximity trigger (not center), owner immunity, the
// Story 1.8 BLAST rework (multi-victim owner-excluded blasts, owner-only
// armed-only gun-burst detonation, no chains), oldest-despawn at cap, the
// WeaponAmmo[] wire array, and the structural guarantee that a torpedo can
// NEVER be radar-painted (only ships paint).

import { describe, it, expect } from 'vitest';
import {
  familySlotFor,
  SLOT_COUNT,
  isAfloat,
  CONFIG,
  damageMultiplierFor,
  effectiveStats,
  equipmentReloadMs,
  hullSilhouette,
  launcherAimPoint,
  launcherStation,
  launcherStationWorld,
  launcherDeadRad,
  launcherTrainRad,
  DEFAULT_CLASS_ID,
  paintCoverage,
  transformPolygon,
  type BlipEvent,
  type DamageEvent,
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
  stepShipLaunchers,
  mineBlastVictims,
  slotAmmo,
  type MineState,
} from '../game/equipment/index.js';
import { circleIsland, flatRaster } from './islandFixture.js';

// FIVE FIXED-ROLE SLOTS (Story 10.5): [gun, boost, torpedo, mine, shell] on
// every captain. A hull's class weapon arrives as a card and lands in its
// FAMILY slot: the torpedo in 2, the mine rack in 3.
const SLOT_GUN = 0;
const SLOT_TORPEDO = familySlotFor('heavyTorpedo')!;
const SLOT_MINE_ML = familySlotFor('navalMines')!;

const HALF_PI = Math.PI / 2;
/** u — a torpedo click's aim distance: any positive distance names the
 *  bearing (Story 10.6 — a click with no aim distance names no area). */
const TORP_DIST = 600;
/** rad — the launcher's firing band, off its own end (R28). */
const TRAIN = launcherTrainRad(DEFAULT_CLASS_ID, 0); // the fixtures' hull, its FORE launcher (R30: per hull, per launcher)
const DEAD = launcherDeadRad(DEFAULT_CLASS_ID, 0);
/** u — a click so far out that the bearing from a launcher's station IS the
 *  click's bearing from the hull centre (station parallax below 1e-5 rad). */
const FAR_DIST = 1e7;
let idSeq = 0;
const mkId = (): string => `t${++idSeq}`;

/** What the damage gate LANDS for a raw blow `raw` from `by` on `victim` —
 *  the one armor curve (× damageMultiplierFor(victim ARMOR − attacker POWER),
 *  floored, never below 1). No shipped hull sits at index 100 since Story
 *  10.4, so every expectation reads it rather than the raw row number. */
const blow = (raw: number, victim: ShipRecord, by: ShipRecord): number =>
  raw > 0 ? Math.max(1, Math.floor(raw * damageMultiplierFor(victim.stats.armor - by.stats.power))) : 0;

/** Islands cleared AND the raster flattened (Story 4.11): real terrain must
 *  not radar-shadow a world the test built as empty water. */
function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/**
 * A torpedo shooter whose FORE LAUNCHER sits at (x, y) and fires along the
 * world bearing `brg` (R28: the launchers fire across the beam, never dead
 * ahead): the hull lies BROADSIDE to the run (heading `brg − π/2`), every
 * launcher is already trained onto the starboard beam, and the click is so far
 * out that the run leaves the fore launcher exactly along `brg`.
 */
function torpShip(w: World, id: string, x: number, y: number, brg: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), undefined, undefined, undefined, undefined);
  // THE TUBES ARE A CARD NOW (Story 8.10, amendment 62): the interim spawn
  // seed is deleted and a hull comes up with gun + Shift and an EMPTY weapon
  // row, so this fixture fits the torpedo explicitly through the same
  // applyCard path a real pick takes. Every case below keeps its subject.
  fitClassWeapons(w, rec);
  const heading = brg - HALF_PI;
  const off = launcherStation(rec.hullId, 0).x;
  rec.state = { x: x - Math.cos(heading) * off, y: y - Math.sin(heading) * off, heading, speed: 0 };
  for (const l of rec.launchers) l.a = HALF_PI; // trained on the starboard beam
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: brg, fireSeq: 1, aimDist: FAR_DIST, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
  rec.input = input;
  return rec;
}

/** Point a ship's launchers at its CURRENT input aim through the shared
 *  stepper the World's `stepLaunchers` row runs — one step, no traverse since
 *  Story 11.1 (R16). The tube clocks run too, so call it before emptying a
 *  tube. */
function trainLaunchers(rec: ShipRecord): void {
  stepShipLaunchers(rec, CONFIG.tick.simDtMs);
}

const windowAround = (me: ShipRecord, brg: number, h = 0.02): void => {
  me.prevSweepAngle = ((brg - h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  me.sweepAngle = ((brg + h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
};
// Radar paints — the identity-free coverage footprint (the one grammar).
const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

describe('torpedoes — one tube, its own reload (Story 10.6, R6)', () => {
  it('one launch empties the tube; a second is refused until it reloads', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0); // the run: +x, across the beam
    const t1 = fireTorpedo(ship, 0, mkId);
    const t2 = fireTorpedo(ship, 0, mkId);
    expect(t1).not.toBeNull();
    expect(t2).toBeNull(); // the one tube is reloading
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: 0, reloadMsLeft: equipmentReloadMs(ship.stats, 'heavyTorpedo') });
    expect(t1!.kind).toBe('torp');
    expect(t1!.damage).toBe(CONFIG.torpedo.damage);
    expect(t1!.hitRadius).toBe(CONFIG.torpedo.hitRadius); // own value, not gun's
    expect(t1!.distLeft).toBe(Number.POSITIVE_INFINITY); // A3: runs until impact
    // It leaves the fore launcher at torpedo speed along the run (+x).
    expect(t1!.vx).toBeCloseTo(CONFIG.torpedo.speed, 6);
  });

  it('the tube fires again once its reload elapses', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0);
    ship.launchers[0].tubes[0] = 200; // almost loaded
    expect(fireTorpedo(ship, 0, mkId)).toBeNull(); // still reloading
    ship.launchers[0].tubes[0] = 0; // loaded
    expect(fireTorpedo(ship, 0, mkId)).not.toBeNull(); // now fires
    expect(ship.loadout[SLOT_TORPEDO].state).toEqual({ n: 0, reloadMsLeft: equipmentReloadMs(ship.stats, 'heavyTorpedo') });
  });
});

describe('torpedoes — the FORE launcher\'s firing band (Story 10.6, R6 / R16 / R28)', () => {
  /** A fore-only shooter at the origin heading 0, aimed `rel` off the bow, its launcher trained there. */
  const aimedOff = (w: World, id: string, rel: number): ShipRecord => {
    const rec = torpShip(w, id, 0, 0, HALF_PI);
    rec.state = { ...rec.state, x: 0, y: 0, heading: 0 };
    rec.input = { ...rec.input, aim: rel };
    trainLaunchers(rec);
    return rec;
  };
  const refused = (rec: ShipRecord): void => {
    expect(fireTorpedo(rec, 0, mkId)).toBeNull();
    expect(rec.launchers[0].tubes).toEqual([0]); // nothing spent
    expect(rec.loadout[SLOT_TORPEDO].state).toEqual({ n: 1, reloadMsLeft: 0 });
  };

  it('launches inside the band on either beam and refuses dead ahead and dead astern, nothing spent', () => {
    const w = bareWorld();
    expect(fireTorpedo(aimedOff(w, 'a', HALF_PI), 0, mkId)).not.toBeNull();
    expect(fireTorpedo(aimedOff(w, 'b', -HALF_PI), 0, mkId)).not.toBeNull();
    refused(aimedOff(w, 'c', 0)); // dead ahead: the fore launcher's own dead wedge
    refused(aimedOff(w, 'd', Math.PI)); // dead astern: beyond its train
  });

  it('the band edges: a degree inside fires, a degree outside is refused', () => {
    const w = bareWorld();
    const DEG = Math.PI / 180;
    expect(fireTorpedo(aimedOff(w, 'a', DEAD + DEG), 0, mkId)).not.toBeNull();
    expect(fireTorpedo(aimedOff(w, 'b', -(TRAIN - DEG)), 0, mkId)).not.toBeNull();
    refused(aimedOff(w, 'c', DEAD - DEG));
    refused(aimedOff(w, 'd', -(TRAIN + DEG)));
  });

  it('NO TRAVERSE (Story 11.1, R16): a launcher at rest, pointed dead ahead, fires on the FIRST click at an aim in its band — along the bearing to the aim', () => {
    const w = bareWorld();
    const rec = torpShip(w, 'a', 0, 0, HALF_PI);
    rec.state = { ...rec.state, x: 0, y: 0, heading: 0 };
    rec.input = { ...rec.input, aim: HALF_PI };
    rec.launchers[0].a = 0; // at rest, pointed dead ahead
    expect(w.sinkingActivationGate(rec, SLOT_TORPEDO)).toEqual({ ok: true });
    expect(rec.launchers[0].tubes[0]).toBeGreaterThan(0);
    const torp = [...w.shells.values()].find((sh) => sh.kind === 'torp')!;
    const st = launcherStationWorld(rec.hullId, 0, rec.state);
    const aimPt = launcherAimPoint(rec.state, rec.hullId, rec.input.aim, rec.input.aimDist)!;
    expect(Math.atan2(torp.vy, torp.vx)).toBeCloseTo(Math.atan2(aimPt.y - st.y, aimPt.x - st.x), 9);
  });
});

describe('torpedoes — island block + ship hit', () => {
  it('an island on the run blocks the torpedo (no damage, splash on the rock)', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI); // the run: +y
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 160, heading: 0, speed: 0 };
    w.map.islands.push(circleIsland(0, 70, 30)); // squarely on the run
    const events = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      events.push(...w.tickEvents);
    }
    expect(b.hp).toBe(CONFIG.shipClasses.bismarck.hp);
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true);
  });

  it('a torpedo that reaches an enemy deals its full CONFIG.torpedo.damage', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI);
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 150, heading: 0, speed: 0 };
    for (let i = 0; i < 80 && b.hp === b.stats.maxHp; i++) w.step();
    expect(b.hp).toBe(b.stats.maxHp - blow(CONFIG.torpedo.damage, b, a));
  });
});

describe('A4 CONFIG constants', () => {
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
    const a = torpShip(w, 'a', 0, 0, HALF_PI); // the run: +y
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 0, y: 750, heading: 0, speed: 0 }; // 750u away (> old 700 cap)
    for (let i = 0; i < 400 && b.hp === b.stats.maxHp; i++) w.step();
    expect(b.hp).toBe(b.stats.maxHp - blow(CONFIG.torpedo.damage, b, a));
  });

  it('a torpedo with no target splashes at the map edge (boom, no victim)', () => {
    const w = bareWorld();
    const edge = w.map.radius;
    // Near the +x edge, the run pointed out — far enough in that the boundary
    // clamp (radius - hull max radius) leaves the pose alone and the fish
    // spawns inside the water disk.
    const a = torpShip(w, 'a', edge - 80, 0, 0);
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
    return { id, kind: 'hull', poly: transformPolygon(hullSilhouette('bismarck'), x, y, heading) };
  }
  function mineAt(
    ownerId: string,
    x: number,
    y: number,
    armedAt: number,
    kind: MineKind = 'naval',
  ): Map<string, MineState> {
    const m = new Map<string, MineState>();
    m.set('m1', { id: 'm1', ownerId, x, y, armedAt, kind, hp: 10 });
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
    const a = w.addShip('a', 'A', 'captain', 'warspite', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Mines are an aimed WEAPON (amendment 45): a click astern places one.
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 40, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
    w.step(); // places one mine at the clicked point (40u astern, -x)
    expect(w.mines.size).toBe(1);
    const mine = [...w.mines.values()][0];
    expect(mine.x).toBeCloseTo(-40, 6); // AT the click, not a stern-rack offset
    expect(mine.y).toBeCloseTo(0, 6);
    // The close placement leaves the owner's own hull inside the 48u blast
    // radius — the built-in owner-exclusion geometry this test also pins below.
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: mine.x, y: mine.y, heading: 0, speed: 0 };
    b.hp = 1; // any landed blow (floored at 1) sinks it
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
    const o = w.addShip('o', 'O', 'captain', 'warspite', undefined, undefined);
    o.state = { x: 600, y: 600, heading: 0, speed: 0 }; // far from the blast
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0, kind: 'naval', hp: 10 });
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
    expect(b.hp).toBe(b.stats.maxHp - blow(CONFIG.mine.damage, b, o)); // the full blast
    expect(c.hp).toBe(c.stats.maxHp - blow(CONFIG.mine.damage, c, o)); // the full blast — same blast
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
    expect(b.hp).toBe(b.stats.maxHp - blow(CONFIG.mine.damage, b, o));
    expect(o.hp).toBe(o.stats.maxHp); // owner-excluded blast (universal AoE convention)
  });

  it('a SECOND hull inside the blast is a victim too (every non-owner hull, no special-casing)', () => {
    // The FULL amount is read off its `dmg` event rather than off an hp
    // raised past the hull's own max (an unreachable state — review gate);
    // whether it survives is a fact of the tables, not the contract.
    const { w } = minefield();
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined); // human trips it
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const dr = w.addShip('dr', 'DR', 'captain', 'yamato', undefined, undefined); // a bystander inside the blast
    dr.state = { x: 0, y: -30, heading: 0, speed: 0 };
    expect(dr.hp).toBe(dr.stats.maxHp);
    w.step();
    const hits = w.tickEvents.filter((e): e is DamageEvent => e.k === 'dmg' && e.id === 'dr');
    expect(hits.map((h) => h.amount)).toEqual([blow(CONFIG.mine.damage, dr, w.ships.get('o')!)]); // the full gated blow, once
    expect(dr.hp).toBe(Math.max(0, dr.stats.maxHp - blow(CONFIG.mine.damage, dr, w.ships.get('o')!)));
  });

  it('mineBlastVictims: silhouette-in-radius membership, owner excluded (the shared burstVictims rule)', () => {
    const mine: MineState = { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0, kind: 'naval', hp: 10 };
    const hull = (id: string, x: number, y: number): Target => ({
      id,
      kind: 'hull',
      poly: transformPolygon(hullSilhouette('bismarck'), x, y, HALF_PI),
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
  // them in turn: a NAVAL detonation cascades into EVERY ARMED NAVAL mine in
  // blast range, WHOEVER LAID IT. Unarmed mines still never chain, and since
  // amendment 200 (Eric 2026-10-01) fouling and captive mines neither receive
  // nor propagate (naval only, both ways).

  it('CHAIN: a trip cascades to another ARMED mine in blast range; an unarmed mine survives', () => {
    const { w } = minefield();
    // 45u from m1: inside m1's 48u blast, OUTSIDE the tripping hull's reach —
    // pre-2.8 this survived ("blast ≠ trigger"); the chain now takes it.
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 0, y: -45, armedAt: 0, kind: 'naval', hp: 10 });
    w.mines.set('m3', { id: 'm3', ownerId: 'x', x: -20, y: 0, armedAt: 999_999, kind: 'naval', hp: 10 }); // someone else's, UNARMED
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
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 0, y: -45, armedAt: 0, kind: 'naval', hp: 10 });
    w.mines.set('m3', { id: 'm3', ownerId: 'o', x: 0, y: -90, armedAt: 0, kind: 'naval', hp: 10 });
    w.mines.set('mEnemy', { id: 'mEnemy', ownerId: 'x', x: 0, y: -70, armedAt: 0, kind: 'naval', hp: 10 });
    w.mines.set('mCold', { id: 'mCold', ownerId: 'o', x: 0, y: -120, armedAt: 999_999, kind: 'naval', hp: 10 });
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

describe('mines — a deck-gun shell LANDING on a mine (any mine, any owner, arming included — amendment 200)', () => {
  /** THE DECK GUN ON THE BENCH (Story 10.4): a captain's slot 0 is the MAIN
   *  BATTERY now, whose mask has NO mine bit (R3). The cannon row survives as
   *  the PvE drones' gun and still carries the mine bit (orchestrator ruling,
   *  wave-1 gate), so these amendment-200 pins mount THAT row into slot 0 —
   *  the slot a drone carries it in — and keep their subject. */
  function mountDeckGun(a: ShipRecord): void {
    a.loadout[SLOT_GUN] = { equipmentId: 'gun', state: { n: a.stats.equipment.gun.maxAmmo, reloadMsLeft: 0 } };
  }

  /** ML `a` at the origin with an enemy `b` parked near a remote minefield:
   *  b's hull (y ∈ [35..55]) is OUTSIDE the gun's 30u burst at (300,0) but
   *  INSIDE the mine's 48u blast — any damage b takes is the MINE's. */
  function board(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = bareWorld(13);
    const a = w.addShip('a', 'A', 'captain', 'warspite', undefined, undefined);
    mountDeckGun(a);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 300, y: 45, heading: 0, speed: 0 };
    return { w, a, b };
  }

  /** Click a's gun at (dist, 0) and step until the burst resolves. */
  function shootAt(w: World, dist: number): void {
    w.submitInput('a', { seq: 9, throttle: 0, rudder: 0, aim: 0, fireSeq: 9, aimDist: dist, slot: SLOT_GUN, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    for (let i = 0; i < 60; i++) {
      w.step();
      if (w.tickEvents.some((e) => e.k === 'burst')) return;
    }
    throw new Error('no burst within the tick budget');
  }

  it('the owner’s shell landing on its ARMED mine pops it: mine gone, blast damages the nearby enemy', () => {
    const { w, a, b } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval', hp: 10 }); // armed, at the click point
    shootAt(w, 300);
    expect(w.mines.size).toBe(0); // popped by the owner's shell (16 dmg >= 10 hp)
    // b's hull is outside the 30u gun burst but inside the mine's 48u blast:
    // exactly one full mine damage, nothing from the shell.
    expect(b.hp).toBe(b.stats.maxHp - blow(CONFIG.mine.damage, b, a));
    expect(a.hp).toBe(a.stats.maxHp); // owner excluded from both
    // The detonation's own boom carries NO victim id (no tripping ship).
    const boom = w.tickEvents.find((e) => e.k === 'boom' && e.id === 'm1');
    expect(boom).toEqual({ k: 'boom', id: 'm1', x: 300, y: 0 });
    expect(boom && 'hit' in boom).toBe(false);
  });

  // FLIPPED AGAIN (amendment 200, Eric 2026-10-01: "An arming mine can be set
  // off."). The arm delay keeps its anti-instant-bomb role for the TRIP only;
  // a deck-gun shell landing on an arming mine takes its hp like any other.
  it('an UNARMED own mine the shell lands on takes the damage and pops (amendment 200)', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 999_999, kind: 'naval', hp: 10 }); // still arming
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false);
  });

  // FLIPPED, NOT DELETED (Story 8.4, Eric ruling 2026-09-15, amendment 16).
  // The old version of this case asserted that only the mine's OWN owner could
  // set it off — the shipped click-your-own-minefield rule. Any owner's mine is
  // fair game, and since amendment 200 the trigger is the shell LANDING on it.
  it('ANY deck-gun shell landing on ANY mine pops it — an enemy field included (amendments 16/200)', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: 300, y: 0, armedAt: 0, kind: 'naval', hp: 10 }); // someone ELSE's armed mine
    shootAt(w, 300); // a's shell lands on it
    expect(w.mines.has('m1')).toBe(false);
  });

  // A CAPTIVE MINE CAN BE DESTROYED BY A DECK GUN (amendment 200, Eric
  // 2026-10-01: "A captive mine can be destroyed by a deck gun too.") —
  // superseding R2.18's immunity. At 0 hp it is taken off the water with a
  // boom and NOTHING else: no blast centred on its casing and no launch (only
  // a TRIP fires its fish).
  //
  // The board is deliberately EMPTY of hostiles: a captive field's trip ring is
  // 144u at base (the swap-and-triple transform), so `board()`'s enemy parked
  // 45u off the mine would TRIP it and mask the thing under test. What is being
  // asserted here is the BURST path alone.
  function lonely(): { w: World; a: ShipRecord } {
    const w = bareWorld(17);
    const a = w.addShip('a', 'A', 'captain', 'warspite', undefined, undefined);
    mountDeckGun(a);
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

  it('an ARMED CAPTIVE mine the owner’s own shell lands on is DESTROYED: a boom, no blast, no fish (amendment 200)', () => {
    const { w } = lonely();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'captive', hp: 10 }); // armed, at the click point
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false);
    // The boom carries no `hit` — nobody tripped it.
    expect(w.tickEvents.filter((e) => e.k === 'boom' && e.id === 'm1')).toEqual([
      { k: 'boom', id: 'm1', x: 300, y: 0 },
    ]);
    // And it did not LAUNCH: no torpedo ever left the casing.
    expect([...w.shells.values()].some((sh) => sh.kind === 'torp')).toBe(false);
    // The shell itself resolved no hull, so the shooter's mark is fall of shot.
    expect(w.tickEvents.some((e) => e.k === 'sp')).toBe(true);
    expect(w.tickEvents.some((e) => e.k === 'hc')).toBe(false);
  });

  it('the CONTROL: the very same click detonates an ORDINARY mine with its blast', () => {
    const { w } = lonely(); // no captive chassis — everything else identical
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval', hp: 10 });
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // detonated exactly as it always has
    expect(w.tickEvents.some((e) => e.k === 'boom' && e.id === 'm1')).toBe(true);
  });

  it('a CAPTIVE field never chains — destroying one captive leaves its neighbour standing (amendment 200)', () => {
    const { w } = lonely();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'captive', hp: 10 }); // under the click
    w.mines.set('m2', { id: 'm2', ownerId: 'a', x: 340, y: 0, armedAt: 0, kind: 'captive', hp: 10 }); // the chain neighbour
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // destroyed
    expect(w.mines.has('m2')).toBe(true); // 40u off the landing point, and no chain
    expect(w.mines.get('m2')!.hp).toBe(CONFIG.mine.hp);
  });

  it('CHAIN THROUGH THE POP (Story 2.8 flip of the 1.8 no-cascade pin): the shot-down naval mine chains its naval neighbour off the landing point', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0, kind: 'naval', hp: 10 }); // under the click
    // 40u from m1: inside m1's 48u blast, far outside the 10u landing disc —
    // the shell never touches it, but m1's detonation cascades into it
    // (amendments 18/200: naval into naval, any owner).
    w.mines.set('m2', { id: 'm2', ownerId: 'a', x: 340, y: 0, armedAt: 0, kind: 'naval', hp: 10 });
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // popped by the landing shell
    expect(w.mines.has('m2')).toBe(false); // chained off m1's blast
  });
});

describe('one shot per click — torpedoes and mines (world level)', () => {
  it('one click launches exactly one torpedo over 20 ticks of the same input', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    fitClassWeapons(w, a); // the tubes are a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    a.launchers[0].a = HALF_PI; // trained on the beam (R28: never dead ahead)
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fireSeq: 1, aimDist: TORP_DIST, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    let torps = 0;
    for (let i = 0; i < 20; i++) {
      w.step();
      torps += w.tickEvents.filter((e) => e.k === 'torp').length;
    }
    expect(torps).toBe(1);
  });

  it('one CLICK places exactly one mine (fireSeq — Story 2.8 aimed weapon), even applied past the drop cooldown; a second click places another', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'warspite', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 1, aimDist: 40, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    // Under hold-to-fire this input would re-place every reload; a click must not.
    const ticks = CONFIG.mine.reloadMs / CONFIG.tick.simDtMs + 20;
    for (let i = 0; i < ticks; i++) w.step();
    expect(w.mines.size).toBe(1);
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 2, aimDist: 60, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false });
    w.step();
    expect(w.mines.size).toBe(2);
  });

  it('a PRESS (actSeq) never reaches the mine slot — mines JOINED the fire-control channel (Story 2.8 flip of the 1.8 pin; the press names an ability since Story 10.5)', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'warspite', undefined, undefined);
    fitClassWeapons(w, a); // the rack is a CARD now (Story 8.10) — slot 2
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: Math.PI, fireSeq: 0, aimDist: 40, slot: 0, fireT: 0, actSeq: 1, act: 0, hornSeq: 0, held: false, sec: false });
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
      // Every empty slot rides the wire as null (slot alignment, length SLOT_COUNT).
      ...new Array<null>(SLOT_COUNT - 3).fill(null),
    ]);
    // A copy, not the live pool objects (mutating the wire must not affect state).
    expect(wire[0]).not.toBe(ship.loadout[0].state);
  });

  it('a fresh hull spawns with every turret loaded; one click fires ONE turret and slot 0 reads the battery summary', () => {
    // Story 10.4: slot 0 is the MAIN BATTERY — its pair is DERIVED from the
    // turrets (n = turrets ready, reloadMsLeft = the soonest running reload).
    const w = bareWorld();
    const ship = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const row = ship.stats.equipment.mainBattery;
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: row.maxAmmo, reloadMsLeft: 0 });
    expect(row.maxAmmo).toBe(ship.turrets.length);
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fireSeq: 1, aimDist: 1000, slot: SLOT_GUN, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
    w.step(); // one click -> one turret's salvo; only that turret's reload starts
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: row.maxAmmo - 1, reloadMsLeft: row.reloadMs });
    expect(ship.turrets.filter((t) => t.reloadMsLeft > 0)).toHaveLength(1);
  });
});

describe('torpedoes are NEVER radar-painted (only ships paint)', () => {
  it('a torpedo in the radar annulus produces no blip; a ship there does', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', undefined, undefined, undefined, undefined);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Enemy ship in the annulus (proves the beam window is right).
    const b = w.addShip('b', 'B', undefined, undefined, undefined, undefined);
    b.state = { x: 700, y: 0, heading: 0, speed: 0 }; // (sight, dropout start] on the twelfths ladder (Story 9.8)
    // A torpedo flying through the same annulus.
    w.shells.set('trp', {
      id: 'trp',
      ownerId: 'b',
      x: 700,
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
      family: null,
    });
    windowAround(a, 0); // beam across bearing 0 (toward x+)
    const blips = blipsOf(buildFrame(w, 'a'));
    // The ship, and ONLY the ship: one footprint, and it is b's own raster
    // (the torpedo entity never paints — its detect gate is a different
    // channel entirely).
    expect(blips).toHaveLength(1);
    const ship = w.ships.get('b')!;
    expect({ gx: blips[0].gx, gy: blips[0].gy, w: blips[0].w, h: blips[0].h, bits: blips[0].bits }).toEqual(
      paintCoverage(ship.hullId, ship.state.x, ship.state.y, ship.state.heading, CONFIG.vision.radarCellU, w.now),
    );
  });
});

// ---------------------------------------------------------------------------
// STORY 8.13 — THE LIGHT TORPEDO; STORY 10.5 — THE SUPERCAV AS A SLOT WEAPON
// ---------------------------------------------------------------------------

/** A captain holding `n` copies of `line`, aimed at `aim`, with the named slot
 *  selected. Everything real: production catalog, production registry, the
 *  same `applyCard` path a pick takes. */
function carrier(w: World, id: string, line: string, n: number, aim: number, slot: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  for (let i = 0; i < n; i += 1) w.applyCard(rec, line);
  rec.input = { seq: 1, throttle: 0, rudder: 0, aim, fireSeq: 1, aimDist: TORP_DIST, slot, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false };
  trainLaunchers(rec); // the launchers chase the aim (R13) before the click
  return rec;
}

const SLOT_WEAPON_1 = familySlotFor('lightTorpedo')!;
/** The SUPERCAV's slot: the TORPEDO family slot (Story 10.5). */
const SLOT_SUPERCAV = familySlotFor('supercavTorpedo')!;

describe('LIGHT TORPEDO — the launcher, not a sector (Story 10.6, R6)', () => {
  // THE FIXED BEAM SECTORS ARE GONE: every torpedo leaves the deck launchers,
  // so the light fires wherever its FORE launcher's band holds the click
  // (R28: across the beam) and is refused dead ahead and dead astern.
  it('fires abeam toward the click; refused dead ahead and dead astern with nothing spent', () => {
    const w = bareWorld(31);
    const abeam = carrier(w, 'a', 'lightTorpedo', 1, Math.PI / 2, SLOT_WEAPON_1);
    const fish = fireTorpedo(abeam, 0, mkId, 'lightTorpedo');
    expect(fish).not.toBeNull();
    expect(fish!.kind).toBe('torp');
    expect(fish!.damage).toBe(CONFIG.lightTorpedo.damage);
    expect(Math.hypot(fish!.vx, fish!.vy)).toBeCloseTo(CONFIG.lightTorpedo.speed, 6);
    expect(fish!.vy).toBeGreaterThan(0); // toward the click, abeam to port

    const ahead = carrier(w, 'b', 'lightTorpedo', 1, 0, SLOT_WEAPON_1);
    expect(fireTorpedo(ahead, 0, mkId, 'lightTorpedo')).toBeNull();
    expect(ahead.loadout[SLOT_WEAPON_1].state).toEqual({ n: 1, reloadMsLeft: 0 }); // tube untouched

    const astern = carrier(w, 'c', 'lightTorpedo', 1, Math.PI, SLOT_WEAPON_1);
    expect(fireTorpedo(astern, 0, mkId, 'lightTorpedo')).toBeNull();
    expect(astern.loadout[SLOT_WEAPON_1].state).toEqual({ n: 1, reloadMsLeft: 0 }); // tube untouched
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
    expect(rate).toBeGreaterThan(0); // tier II homes (amendment 80)
    const t2 = fireTorpedo(two, 0, mkId, 'lightTorpedo')!;
    expect(t2.homing).toEqual({ turnRate: rate, acquireRange: CONFIG.torpedo.homingAcquireRange });
    expect(t2.distLeft).toBe(CONFIG.torpedo.homingMaxRangeU);
  });

  it('tier copies never add a tube (Story 10.6, R4: capacity left the tiers)', () => {
    const w = bareWorld(33);
    for (let n = 1; n <= 3; n += 1) {
      const rec = carrier(w, `t${n}`, 'lightTorpedo', n, 0, SLOT_WEAPON_1);
      expect(rec.launchers.map((l) => l.tubes.length)).toEqual([1]);
    }
  });

  it('the LIGHT line reads ITS OWN row — the heavy\'s numbers never leak into it', () => {
    const w = bareWorld(34);
    const ship = carrier(w, 'a', 'lightTorpedo', 1, Math.PI / 2, SLOT_WEAPON_1);
    const fish = fireTorpedo(ship, 0, mkId, 'lightTorpedo')!;
    expect(fish.damage).toBe(CONFIG.lightTorpedo.damage);
    expect(fish.damage).not.toBe(CONFIG.torpedo.damage);
    expect(Math.hypot(fish.vx, fish.vy)).toBeCloseTo(CONFIG.lightTorpedo.speed, 6);
    expect(ship.loadout[SLOT_WEAPON_1].state).toEqual({ n: 0, reloadMsLeft: equipmentReloadMs(ship.stats, 'lightTorpedo') });
  });
});

describe('SUPERCAV TORPEDO — a torpedo-slot weapon on the reload pool (Story 10.5, R4, amendment 8(e))', () => {
  it('fills the TORPEDO family slot, loaded at its row\'s maxAmmo', () => {
    const w = bareWorld(35);
    const ship = carrier(w, 'a', 'supercavTorpedo', 1, 0, SLOT_SUPERCAV);
    expect(SLOT_SUPERCAV).toBe(SLOT_TORPEDO); // one family, one slot
    expect(ship.loadout[SLOT_SUPERCAV]).toEqual({
      equipmentId: 'supercavTorpedo',
      state: { n: ship.stats.equipment.supercavTorpedo.maxAmmo, reloadMsLeft: 0 },
    });
  });

  it('a click inside the launcher\'s arc fires ONE torpedo off its effective row and starts the row\'s reload; the card stays', () => {
    const w = bareWorld(35);
    const ship = carrier(w, 'a', 'supercavTorpedo', 1, HALF_PI, SLOT_SUPERCAV);
    const row = ship.stats.equipment.supercavTorpedo;
    expect(w.sinkingActivationGate(ship, SLOT_SUPERCAV)).toEqual({ ok: true });
    const fish = [...w.shells.values()].find((sh) => sh.kind === 'torp')!;
    expect(fish.damage).toBe(row.damage);
    expect(Math.hypot(fish.vx, fish.vy)).toBeCloseTo(row.speed, 6);
    // IT NEVER HOMES, at any tier (amendment 74).
    expect(fish.homing).toBeUndefined();
    expect(fish.distLeft).toBe(Number.POSITIVE_INFINITY);
    expect(ship.loadout[SLOT_SUPERCAV].state).toEqual({ n: row.maxAmmo - 1, reloadMsLeft: row.reloadMs });
    expect(ship.cards).toEqual(['supercavTorpedo']);
  });

  it('a click OUTSIDE the launcher\'s arc is denied out-of-arc and spends nothing', () => {
    const w = bareWorld(36);
    const ship = carrier(w, 'a', 'supercavTorpedo', 1, Math.PI, SLOT_SUPERCAV); // dead astern
    expect(w.sinkingActivationGate(carrier(w, 'b', 'supercavTorpedo', 1, 0, SLOT_SUPERCAV), SLOT_SUPERCAV)).toEqual({ ok: false, reason: 'out-of-arc' }); // dead ahead too
    expect(w.sinkingActivationGate(ship, SLOT_SUPERCAV)).toEqual({ ok: false, reason: 'out-of-arc' });
    expect([...w.shells.values()].some((sh) => sh.kind === 'torp')).toBe(false);
    expect(ship.loadout[SLOT_SUPERCAV].state).toEqual({ n: ship.stats.equipment.supercavTorpedo.maxAmmo, reloadMsLeft: 0 });
  });

  it('an empty pool answers no-ammo, and the round comes back on the row\'s reload clock', () => {
    const w = bareWorld(37);
    const ship = carrier(w, 'a', 'supercavTorpedo', 1, HALF_PI, SLOT_SUPERCAV);
    const row = ship.stats.equipment.supercavTorpedo;
    expect(w.sinkingActivationGate(ship, SLOT_SUPERCAV)).toEqual({ ok: true });
    expect(w.sinkingActivationGate(ship, SLOT_SUPERCAV)).toEqual({ ok: false, reason: 'no-ammo' });
    const ticks = Math.ceil(row.reloadMs / CONFIG.tick.simDtMs);
    for (let i = 0; i < ticks; i += 1) w.step();
    expect(ship.loadout[SLOT_SUPERCAV].state!.n).toBe(row.maxAmmo);
  });

  it('its TIER raises the fish\'s damage (amendment 8(e)); speed and reload follow the row', () => {
    const w = bareWorld(38);
    const one = carrier(w, 'a', 'supercavTorpedo', 1, HALF_PI, SLOT_SUPERCAV);
    const two = carrier(w, 'b', 'supercavTorpedo', 2, HALF_PI, SLOT_SUPERCAV);
    expect(two.stats.equipment.supercavTorpedo.damage).toBeGreaterThan(one.stats.equipment.supercavTorpedo.damage);
    expect(w.sinkingActivationGate(two, SLOT_SUPERCAV)).toEqual({ ok: true });
    const fish = [...w.shells.values()].find((sh) => sh.kind === 'torp' && sh.ownerId === 'b')!;
    expect(fish.damage).toBe(two.stats.equipment.supercavTorpedo.damage);
  });
});

