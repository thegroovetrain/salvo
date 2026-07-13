// Torpedoes + mines: tube stagger/reload, arc gating, island block, mine arm
// delay, capsule-proximity trigger (not center), owner immunity, oldest-despawn
// at cap, the cooldowns[] wire array, and the structural guarantee that a
// torpedo can NEVER be radar-painted (only ships paint).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  WEAPON,
  hullEndpoints,
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
  weaponCooldowns,
  type MineState,
} from '../game/weapons/index.js';

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
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: heading, fire: true, weapon: WEAPON.torpedo };
  rec.input = input;
  return rec;
}

const windowAround = (me: ShipRecord, brg: number, h = 0.02): void => {
  me.prevSweepAngle = ((brg - h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  me.sweepAngle = ((brg + h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
};
const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

describe('torpedoes — tube stagger + reload', () => {
  it('two consecutive launches consume both tubes, a third is denied', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0); // aim over the bow (heading 0)
    const t1 = fireTorpedo(ship, 0, mkId);
    const t2 = fireTorpedo(ship, 0, mkId);
    const t3 = fireTorpedo(ship, 0, mkId);
    expect(t1).not.toBeNull();
    expect(t2).not.toBeNull();
    expect(t3).toBeNull(); // both tubes now reloading
    expect(ship.torpedoCooldowns).toEqual([CONFIG.torpedo.reload, CONFIG.torpedo.reload]);
    expect(t1!.kind).toBe('torp');
    expect(t1!.damage).toBe(CONFIG.torpedo.damage);
    // Fish leaves the bow at torpedo speed straight ahead (+x).
    expect(t1!.vx).toBeCloseTo(CONFIG.torpedo.speed, 6);
  });

  it('a tube reloads independently and becomes available again', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0);
    ship.torpedoCooldowns = [CONFIG.torpedo.reload, 200]; // tube 1 almost ready
    expect(fireTorpedo(ship, 0, mkId)).toBeNull(); // soonest tube (1) still 200ms out
    ship.torpedoCooldowns[1] = 0;
    expect(fireTorpedo(ship, 0, mkId)).not.toBeNull(); // tube 1 now fires
    expect(ship.torpedoCooldowns).toEqual([CONFIG.torpedo.reload, CONFIG.torpedo.reload]);
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
    expect(abeam.torpedoCooldowns).toEqual([0, 0]); // no tube consumed
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
      a.input = { ...a.input, seq: a.input.seq + 1, fire: false }; // one salvo only
    }
    expect(b.hp).toBe(CONFIG.ship.hp);
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true);
  });

  it('a torpedo that reaches an enemy deals its 55 damage', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI);
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 150, heading: 0, speed: 0 };
    for (let i = 0; i < 80 && b.hp === CONFIG.ship.hp; i++) {
      w.step();
      a.input = { ...a.input, seq: a.input.seq + 1, fire: false };
    }
    expect(b.hp).toBe(CONFIG.ship.hp - CONFIG.torpedo.damage);
  });
});

describe('mines — arm delay, capsule trigger, owner immunity', () => {
  function hull(id: string, x: number, y: number, heading: number): HullTarget {
    const h = hullEndpoints(x, y, heading);
    h.id = id;
    return h;
  }
  function mineAt(ownerId: string, x: number, y: number, armedAt: number): Map<string, MineState> {
    const m = new Map<string, MineState>();
    m.set('m1', { id: 'm1', ownerId, x, y, armedAt });
    return m;
  }

  it('does not trigger before it arms', () => {
    const mines = mineAt('a', 0, 0, 3000);
    const enemy = [hull('b', 0, 20, HALF_PI)]; // capsule reaches the mine
    expect(checkMineTriggers(mines, enemy, 2999)).toEqual([]);
    expect(checkMineTriggers(mines, enemy, 3000)).toHaveLength(1);
  });

  it('triggers on the HULL capsule, not the ship center', () => {
    const mines = mineAt('a', 0, 0, 0);
    // Center 40u away (> triggerRadius+beam/2 = 31) but the stern reaches 26u in.
    const reaching = [hull('b', 0, 40, HALF_PI)];
    const triggers = checkMineTriggers(mines, reaching, 10);
    expect(triggers.map((t) => t.victimId)).toEqual(['b']);
    // A hull whose whole capsule stays beyond range does not trip it.
    const clear = [hull('b', 0, 80, HALF_PI)];
    expect(checkMineTriggers(mineAt('a', 0, 0, 0), clear, 10)).toEqual([]);
  });

  it('the owner never trips its own mine', () => {
    const mines = mineAt('a', 0, 0, 0);
    const own = [hull('a', 0, 10, HALF_PI)]; // right on top of it
    expect(checkMineTriggers(mines, own, 10)).toEqual([]);
  });
});

describe('mines — per-player cap despawns the oldest', () => {
  it('a 4th drop silently despawns the player’s oldest mine', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= CONFIG.mine.maxLive; i++) addMine(mines, 'a', i, 0, 0, `m${i}`);
    expect(mines.size).toBe(CONFIG.mine.maxLive);
    addMine(mines, 'a', 99, 0, 0, 'm4'); // the 4th
    expect(mines.size).toBe(CONFIG.mine.maxLive); // still capped
    expect(mines.has('m1')).toBe(false); // oldest gone
    expect(mines.has('m4')).toBe(true); // newest kept
  });

  it('the cap is per-player (another owner is unaffected)', () => {
    const mines = new Map<string, MineState>();
    for (let i = 1; i <= CONFIG.mine.maxLive; i++) addMine(mines, 'a', i, 0, 0, `a${i}`);
    addMine(mines, 'b', 1, 0, 0, 'b1');
    expect(mines.has('a1')).toBe(true); // a still at cap, b's drop didn't evict it
    expect(mines.size).toBe(CONFIG.mine.maxLive + 1);
  });
});

describe('World — mine drop + trigger end-to-end', () => {
  it('a dropped mine arms, then sinks an enemy that sails onto it', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fire: true, weapon: WEAPON.mine };
    w.step(); // drops one mine astern of a (behind -x)
    a.input = { ...a.input, seq: 2, fire: false };
    expect(w.mines.size).toBe(1);
    const mine = [...w.mines.values()][0];
    // Sail b straight onto the mine after it arms.
    const b = w.addShip('b', 'B');
    b.state = { x: mine.x, y: mine.y, heading: 0, speed: 0 };
    b.hp = CONFIG.mine.damage; // one blast sinks it
    for (let i = 0; i < CONFIG.mine.armDelay / CONFIG.tick.simDtMs + 2; i++) w.step();
    expect(w.mines.size).toBe(0); // detonated + despawned
    expect(b.alive).toBe(false);
    expect(a.kills).toBe(1);
  });
});

describe('cooldowns wire array', () => {
  it('is [gun, torpedo, mine] soonest-ready, in ms', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A');
    ship.gunCooldowns = [3000, 1200];
    ship.torpedoCooldowns = [12000, 6000];
    ship.mineCooldown = 8000;
    expect(weaponCooldowns(ship)).toEqual([1200, 6000, 8000]);
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
      distLeft: CONFIG.torpedo.range,
      bornAt: w.now,
      kind: 'torp',
      damage: CONFIG.torpedo.damage,
    });
    windowAround(a, 0); // beam across bearing 0 (toward x+)
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips.map((e) => e.id)).toEqual(['b']); // the ship, and ONLY the ship
    expect(blips.some((e) => e.id === 'trp')).toBe(false);
  });
});
