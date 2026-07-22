// Torpedoes + mines: single-round pool reload, arc gating, island block, mine
// arm delay, silhouette-proximity trigger (not center), owner immunity, the
// Story 1.8 BLAST rework (multi-victim owner-excluded blasts, owner-only
// armed-only gun-burst detonation, no chains), oldest-despawn at cap, the
// WeaponAmmo[] wire array, and the structural guarantee that a torpedo can
// NEVER be radar-painted (only ships paint).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  hullSilhouette,
  transformPolygon,
  type BlipEvent,
  type FrameMsg,
  type InputMsg,
  type HullTarget,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import {
  addMine,
  checkMineTriggers,
  fireTorpedo,
  mineBlastVictims,
  slotAmmo,
  type MineState,
} from '../game/equipment/index.js';

// Slot indices under the universal fit (loadout order: gun / torpedo / mine).
const SLOT_GUN = 0;
const SLOT_TORPEDO = 1;
const SLOT_MINE = 2;
// The Mine Layer fits its mine in SLOT 1 (Story 1.8: [gun, mine, decoyBuoy]).
const SLOT_MINE_ML = 1;

const HALF_PI = Math.PI / 2;
let idSeq = 0;
const mkId = (): string => `t${++idSeq}`;

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  return w;
}

/** Place a ship at an exact pose with a torpedo-firing input over the bow. */
function torpShip(w: World, id: string, x: number, y: number, heading: number): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase());
  rec.state = { x, y, heading, speed: 0 };
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: heading, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0 };
  rec.input = input;
  return rec;
}

const windowAround = (me: ShipRecord, brg: number, h = 0.02): void => {
  me.prevSweepAngle = ((brg - h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  me.sweepAngle = ((brg + h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
};
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
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 160, heading: 0, speed: 0 };
    w.map.islands.push({ x: 0, y: 70, r: 30 }); // squarely on the run
    const events = [];
    for (let i = 0; i < 60; i++) {
      w.step();
      events.push(...w.tickEvents);
    }
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp);
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true);
  });

  it('a torpedo that reaches an enemy deals its 55 damage', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI);
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 150, heading: 0, speed: 0 };
    for (let i = 0; i < 80 && b.hp === CONFIG.shipClasses.torpedoBoat.hp; i++) w.step();
    expect(b.hp).toBe(CONFIG.shipClasses.torpedoBoat.hp - CONFIG.torpedo.damage);
  });
});

describe('A4 CONFIG constants', () => {
  it('torpedoes carry their own collision value (no longer gun-borrowed)', () => {
    expect(CONFIG.torpedo.hitRadius).toBe(2);
  });
  it('the global mine cap lives on CONFIG.mine', () => {
    expect(CONFIG.mine.globalCap).toBe(60);
  });
});

describe('torpedoes — infinite range + map-edge splash (A3)', () => {
  it('a torpedo travels past the retired 700u range to strike a distant enemy', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI); // bow +y
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B');
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
  function hull(id: string, x: number, y: number, heading: number): HullTarget {
    return { id, poly: transformPolygon(hullSilhouette('torpedoBoat'), x, y, heading) };
  }
  function mineAt(ownerId: string, x: number, y: number, armedAt: number): Map<string, MineState> {
    const m = new Map<string, MineState>();
    m.set('m1', { id: 'm1', ownerId, x, y, armedAt });
    return m;
  }

  it('does not trigger before it arms', () => {
    const mines = mineAt('a', 0, 0, 3000);
    const enemy = [hull('b', 0, 20, HALF_PI)]; // silhouette covers the mine
    expect(checkMineTriggers(mines, enemy, 2999)).toEqual([]);
    expect(checkMineTriggers(mines, enemy, 3000)).toHaveLength(1);
  });

  it('triggers on the HULL silhouette, not the ship center', () => {
    const mines = mineAt('a', 0, 0, 0);
    // Center 40u away (> triggerRadius 32) but the stern reaches over the mine
    // (bow +y: the 100u hull spans y in [-10, 90] — the mine sits inside it).
    const reaching = [hull('b', 0, 40, HALF_PI)];
    const triggers = checkMineTriggers(mines, reaching, 10);
    expect(triggers.map((t) => t.victimId)).toEqual(['b']);
    // A hull whose whole silhouette stays beyond triggerRadius does not trip it
    // (center 90: stern at y=40, 40 > 32 from the mine).
    const clear = [hull('b', 0, 90, HALF_PI)];
    expect(checkMineTriggers(mineAt('a', 0, 0, 0), clear, 10)).toEqual([]);
  });

  it('the owner never trips its own mine', () => {
    const mines = mineAt('a', 0, 0, 0);
    const own = [hull('a', 0, 10, HALF_PI)]; // right on top of it
    expect(checkMineTriggers(mines, own, 10)).toEqual([]);
  });
});

describe('mines — per-player cap despawns the oldest', () => {
  it('a 6th drop (base cap 5) silently despawns the player’s oldest mine', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= CONFIG.mine.maxLive; i++) addMine(mines, 'a', i, 0, 0, `m${i}`);
    expect(mines.size).toBe(CONFIG.mine.maxLive); // 5 live (Story 1.8 base cap)
    addMine(mines, 'a', 99, 0, 0, 'm6'); // the 6th
    expect(mines.size).toBe(CONFIG.mine.maxLive); // still capped
    expect(mines.has('m1')).toBe(false); // oldest gone — silently (no boom)
    expect(mines.has('m6')).toBe(true); // newest kept
  });

  it('the cap is per-player (another owner is unaffected)', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= CONFIG.mine.maxLive; i++) addMine(mines, 'a', i, 0, 0, `a${i}`);
    addMine(mines, 'b', 1, 0, 0, 'b1');
    expect(mines.has('a1')).toBe(true); // a still at cap, b's drop didn't evict it
    expect(mines.size).toBe(CONFIG.mine.maxLive + 1);
  });
});

describe('World — mine drop + trigger end-to-end (Story 1.8: ability drop, blast trip)', () => {
  it('an actSeq-dropped mine arms, then sinks an enemy that sails onto it — the nearby OWNER takes 0', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', false, 'mineLayer'); // mine at slot 1 (Story 1.8: [gun, mine, decoyBuoy])
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Mines are an ABILITY now: a press (actSeq advance) drops one, no click.
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: SLOT_MINE_ML };
    w.step(); // drops one mine astern of a (behind -x)
    expect(w.mines.size).toBe(1);
    const mine = [...w.mines.values()][0];
    // The stern drop leaves the owner's own hull inside the 48u blast radius —
    // the built-in owner-exclusion geometry this test also pins below.
    const b = w.addShip('b', 'B');
    b.state = { x: mine.x, y: mine.y, heading: 0, speed: 0 };
    b.hp = CONFIG.mine.damage; // one blast sinks it
    for (let i = 0; i < CONFIG.mine.armDelay / CONFIG.tick.simDtMs + 2; i++) w.step();
    expect(w.mines.size).toBe(0); // detonated + despawned
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
    expect(a.hp).toBe(a.stats.maxHp); // owner EXCLUDED from its own blast, even in radius
  });
});

describe('mines — Story 1.8 blast resolution (multi-victim, owner-excluded, no chains)', () => {
  /** Bare world with a far-away Mine Layer owner `o` and an armed mine of
   *  theirs at the origin. */
  function minefield(): { w: World; o: ShipRecord } {
    const w = bareWorld(11);
    const o = w.addShip('o', 'O', false, 'mineLayer');
    o.state = { x: 600, y: 600, heading: 0, speed: 0 }; // far from the blast
    w.mines.set('m1', { id: 'm1', ownerId: 'o', x: 0, y: 0, armedAt: 0 });
    return { w, o };
  }

  it('a trip blasts EVERY non-owner hull within blastRadius for full damage; outside the radius is untouched', () => {
    const { w, o } = minefield();
    const b = w.addShip('b', 'B'); // trips it (silhouette over the mine)
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const c = w.addShip('c', 'C'); // second victim: hull well inside 48u
    c.state = { x: 0, y: -40, heading: 0, speed: 0 };
    const d = w.addShip('d', 'D'); // bystander: whole silhouette beyond 48u
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
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips it
    w.step();
    expect(b.hp).toBe(b.stats.maxHp - CONFIG.mine.damage);
    expect(o.hp).toBe(o.stats.maxHp); // owner-excluded blast (universal AoE convention)
  });

  it('DRONES are valid blast victims (enemies AND drones — no special-casing)', () => {
    const { w } = minefield();
    const b = w.addShip('b', 'B'); // human trips it
    b.state = { x: 0, y: 10, heading: 0, speed: 0 };
    const dr = w.addShip('dr', 'DR', true, 'droneSmall'); // drone inside the blast
    dr.state = { x: 0, y: -30, heading: 0, speed: 0 };
    const hpBefore = dr.stats.maxHp;
    w.step();
    expect(dr.hp).toBeCloseTo(hpBefore - CONFIG.mine.damage, 5); // full 45 (drone may drift a hair pre-blast)
  });

  it('mineBlastVictims: silhouette-in-radius membership, owner excluded (the shared burstVictims rule)', () => {
    const mine: MineState = { id: 'm', ownerId: 'o', x: 0, y: 0, armedAt: 0 };
    const hull = (id: string, x: number, y: number): HullTarget => ({
      id,
      poly: transformPolygon(hullSilhouette('torpedoBoat'), x, y, HALF_PI),
    });
    // Hull edge within 48 (center 90: stern at y=40, 40 ≤ 48); owner's own hull
    // ON the mine excluded; a hull whose closest point is beyond 48 excluded.
    expect(mineBlastVictims(mine, [hull('in', 0, 90), hull('o', 0, 0), hull('out', 0, 110)])).toEqual(['in']);
  });

  it('NO CHAINS: a second mine inside the blast survives (armed or not)', () => {
    const { w } = minefield();
    w.mines.set('m2', { id: 'm2', ownerId: 'o', x: 20, y: 0, armedAt: 0 }); // armed, 20u from m1
    w.mines.set('m3', { id: 'm3', ownerId: 'x', x: -20, y: 0, armedAt: 999_999 }); // someone else's, unarmed
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips m1 (and m2 — both under the hull)
    w.step();
    // m1 and m2 both TRIPPED on the hull pass-over (independent trips, not a
    // chain); m3 — unarmed, un-tripped, inside both blasts — SURVIVES.
    expect(w.mines.has('m3')).toBe(true);
    expect(w.mines.size).toBe(1);
  });

  it('a mine blast never detonates a neighbouring mine OUTSIDE trip range (blast ≠ trigger)', () => {
    const { w } = minefield();
    // 45u from m1: inside m1's 48u blast, outside the tripping hull's 32u reach.
    w.mines.set('far', { id: 'far', ownerId: 'o', x: 0, y: -45, armedAt: 0 });
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 10, heading: 0, speed: 0 }; // trips only m1
    w.step();
    expect(w.mines.has('far')).toBe(true); // no chain — the blast is damage-only
    expect(w.mines.size).toBe(1);
  });
});

describe('mines — owner gun-burst detonation (armed-only, owner-only, no cascade)', () => {
  /** ML `a` at the origin with an enemy `b` parked near a remote minefield:
   *  b's hull (y ∈ [35..55]) is OUTSIDE the gun's 30u burst at (300,0) but
   *  INSIDE the mine's 48u blast — any damage b takes is the MINE's. */
  function board(): { w: World; a: ShipRecord; b: ShipRecord } {
    const w = bareWorld(13);
    const a = w.addShip('a', 'A', false, 'mineLayer');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const b = w.addShip('b', 'B');
    b.state = { x: 300, y: 45, heading: 0, speed: 0 };
    return { w, a, b };
  }

  /** Click a's gun at (dist, 0) and step until the burst resolves. */
  function shootAt(w: World, dist: number): void {
    w.submitInput('a', { seq: 9, throttle: 0, rudder: 0, aim: 0, fireSeq: 9, aimDist: dist, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0 });
    for (let i = 0; i < 60; i++) {
      w.step();
      if (w.tickEvents.some((e) => e.k === 'burst')) return;
    }
    throw new Error('no burst within the tick budget');
  }

  it('the owner’s burst detonates its ARMED mine under the click: mine gone, blast damages the nearby enemy', () => {
    const { w, a, b } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0 }); // armed, at the click point
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
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 999_999 }); // still arming
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(true); // immune while unarmed
  });

  it('an ENEMY’s burst never detonates the owner’s mines', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'x', x: 300, y: 0, armedAt: 0 }); // someone ELSE's armed mine
    shootAt(w, 300); // a's burst covers it
    expect(w.mines.has('m1')).toBe(true); // only the OWNER's bursts detonate
  });

  it('NO CASCADE: a detonation’s blast never sets off a further mine outside the shell burst', () => {
    const { w } = board();
    w.mines.set('m1', { id: 'm1', ownerId: 'a', x: 300, y: 0, armedAt: 0 }); // under the click (30u burst)
    // 40u from m1: inside m1's 48u blast, OUTSIDE the 30u shell burst.
    w.mines.set('m2', { id: 'm2', ownerId: 'a', x: 340, y: 0, armedAt: 0 });
    shootAt(w, 300);
    expect(w.mines.has('m1')).toBe(false); // burst-detonated
    expect(w.mines.has('m2')).toBe(true); // m1's blast is damage-only — never a detonator
  });
});

describe('one shot per click — torpedoes and mines (world level)', () => {
  it('one click launches exactly one torpedo over 20 ticks of the same input', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_TORPEDO, fireT: 0, actSeq: 0, actSlot: 0 });
    let torps = 0;
    for (let i = 0; i < 20; i++) {
      w.step();
      torps += w.tickEvents.filter((e) => e.k === 'torp').length;
    }
    expect(torps).toBe(1);
  });

  it('one PRESS drops exactly one mine (actSeq — Story 1.8), even applied past the drop cooldown; a second press drops another', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', false, 'mineLayer'); // mine at slot 1 (Story 1.8: [gun, mine, decoyBuoy])
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 1, actSlot: SLOT_MINE_ML });
    // Under hold-to-activate this input would re-drop every reload; a press must not.
    const ticks = CONFIG.mine.reloadMs / CONFIG.tick.simDtMs + 20;
    for (let i = 0; i < ticks; i++) w.step();
    expect(w.mines.size).toBe(1);
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 2, actSlot: SLOT_MINE_ML });
    w.step();
    expect(w.mines.size).toBe(2);
  });

  it('a CLICK (fireSeq) on the ML mine slot is inert — mines left the fire-control channel (Story 1.8)', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', false, 'mineLayer');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, slot: SLOT_MINE_ML, fireT: 0, actSeq: 0, actSlot: 0 });
    w.step();
    expect(w.mines.size).toBe(0); // the weapon-only click wall refuses abilities
    expect(a.loadout[SLOT_MINE_ML].state).toEqual({ n: CONFIG.mine.maxAmmo, reloadMsLeft: 0 }); // charge intact
    expect(a.lastFireSeq).toBe(1); // the click was still consumed
  });
});

describe('ammo wire array is SLOT-ALIGNED (WeaponAmmo | null)[]', () => {
  it('mirrors the ship pools as a defensive copy, null for the empty extra slot', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A');
    ship.loadout[0].state = { n: 1, reloadMsLeft: 1200 };
    ship.loadout[1].state = { n: 0, reloadMsLeft: 6000 };
    ship.loadout[2].state = { n: 0, reloadMsLeft: 8000 };
    const wire = slotAmmo(ship);
    expect(wire).toEqual([
      { n: 1, reloadMsLeft: 1200 },
      { n: 0, reloadMsLeft: 6000 },
      { n: 0, reloadMsLeft: 8000 },
      null, // empty extra slot rides the wire as null (slot alignment)
    ]);
    // A copy, not the live pool objects (mutating the wire must not affect state).
    expect(wire[0]).not.toBe(ship.loadout[0].state);
  });

  it('a fresh hull spawns with full pools; one click empties the single-shot gun pool', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A');
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: CONFIG.gun.maxAmmo, reloadMsLeft: 0 });
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: HALF_PI, fireSeq: 1, aimDist: 1000, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0 };
    w.step(); // one click -> one shell, pool 1 -> 0, the 3s cooldown starts
    expect(slotAmmo(ship)[SLOT_GUN]).toEqual({ n: CONFIG.gun.maxAmmo - 1, reloadMsLeft: CONFIG.gun.reloadMs });
  });
});

describe('torpedoes are NEVER radar-painted (only ships paint)', () => {
  it('a torpedo in the radar annulus produces no blip; a ship there does', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    // Enemy ship in the annulus (proves the beam window is right).
    const b = w.addShip('b', 'B');
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
    });
    windowAround(a, 0); // beam across bearing 0 (toward x+)
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips.map((e) => e.id)).toEqual(['b']); // the ship, and ONLY the ship
    expect(blips.some((e) => e.id === 'trp')).toBe(false);
  });
});
