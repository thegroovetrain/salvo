// Torpedoes + mines: single-tube reload, arc gating, island block, mine arm
// delay, capsule-proximity trigger (not center), owner immunity, oldest-despawn
// at cap, the per-mount cooldowns[][] wire array, and the structural guarantee
// that a torpedo can NEVER be radar-painted (only ships paint).

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
  const input: InputMsg = { seq: 1, throttle: 0, rudder: 0, aim: heading, fireSeq: 1, aimDist: 0, weapon: WEAPON.torpedo };
  rec.input = input;
  return rec;
}

const windowAround = (me: ShipRecord, brg: number, h = 0.02): void => {
  me.prevSweepAngle = ((brg - h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  me.sweepAngle = ((brg + h) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
};
const blipsOf = (f: FrameMsg): BlipEvent[] => f.events.filter((e): e is BlipEvent => e.k === 'blip');

describe('torpedoes — single-tube reload', () => {
  it('one launch consumes the tube; a second is denied until it reloads', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0); // aim over the bow (heading 0)
    const t1 = fireTorpedo(ship, 0, mkId);
    const t2 = fireTorpedo(ship, 0, mkId);
    expect(t1).not.toBeNull();
    expect(t2).toBeNull(); // the single tube is now reloading
    expect(ship.torpedoCooldowns).toEqual([CONFIG.torpedo.reload]);
    expect(t1!.kind).toBe('torp');
    expect(t1!.damage).toBe(CONFIG.torpedo.damage);
    expect(t1!.hitRadius).toBe(CONFIG.torpedo.hitRadius); // own value, not gun's
    expect(t1!.graceMs).toBe(CONFIG.torpedo.selfHitGrace); // own value, not gun's
    expect(t1!.distLeft).toBe(Number.POSITIVE_INFINITY); // A3: runs until impact
    // Fish leaves the bow at torpedo speed straight ahead (+x).
    expect(t1!.vx).toBeCloseTo(CONFIG.torpedo.speed, 6);
  });

  it('the tube becomes available again once its reload elapses', () => {
    const w = bareWorld();
    const ship = torpShip(w, 'a', 0, 0, 0);
    ship.torpedoCooldowns = [200]; // almost ready
    expect(fireTorpedo(ship, 0, mkId)).toBeNull(); // still 200ms out
    ship.torpedoCooldowns[0] = 0;
    expect(fireTorpedo(ship, 0, mkId)).not.toBeNull(); // now fires
    expect(ship.torpedoCooldowns).toEqual([CONFIG.torpedo.reload]);
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
    expect(abeam.torpedoCooldowns).toEqual([0]); // tube not consumed
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
    expect(b.hp).toBe(CONFIG.ship.hp);
    expect(events.some((e) => e.k === 'boom' && e.hit === undefined)).toBe(true);
  });

  it('a torpedo that reaches an enemy deals its 55 damage', () => {
    const w = bareWorld();
    const a = torpShip(w, 'a', 0, 0, HALF_PI);
    a.input = { ...a.input, aim: HALF_PI };
    const b = w.addShip('b', 'B');
    b.state = { x: 0, y: 150, heading: 0, speed: 0 };
    for (let i = 0; i < 80 && b.hp === CONFIG.ship.hp; i++) w.step();
    expect(b.hp).toBe(CONFIG.ship.hp - CONFIG.torpedo.damage);
  });
});

describe('A4 CONFIG constants', () => {
  it('torpedoes carry their own collision + grace values (no longer gun-borrowed)', () => {
    expect(CONFIG.torpedo.hitRadius).toBe(2);
    expect(CONFIG.torpedo.selfHitGrace).toBe(100);
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
    for (let i = 0; i < 400 && b.hp === CONFIG.ship.hp; i++) w.step();
    expect(b.hp).toBe(CONFIG.ship.hp - CONFIG.torpedo.damage);
  });

  it('a torpedo with no target splashes at the map edge (boom, no victim)', () => {
    const w = bareWorld();
    const edge = w.map.radius;
    const a = torpShip(w, 'a', edge - 40, 0, 0); // near the +x edge, bow pointed out
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
    a.input = { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, weapon: WEAPON.mine };
    w.step(); // drops one mine astern of a (behind -x)
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

describe('one shot per click — torpedoes and mines (world level)', () => {
  it('one click launches exactly one torpedo over 20 ticks of the same input', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, weapon: WEAPON.torpedo });
    let torps = 0;
    for (let i = 0; i < 20; i++) {
      w.step();
      torps += w.tickEvents.filter((e) => e.k === 'torp').length;
    }
    expect(torps).toBe(1);
  });

  it('one click drops exactly one mine, even applied past the drop cooldown; a second click drops another', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A');
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    w.submitInput('a', { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 1, aimDist: 0, weapon: WEAPON.mine });
    // Under hold-to-fire this input would re-drop every dropCooldown; a click must not.
    const ticks = CONFIG.mine.dropCooldown / CONFIG.tick.simDtMs + 20;
    for (let i = 0; i < ticks; i++) w.step();
    expect(w.mines.size).toBe(1);
    w.submitInput('a', { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 2, aimDist: 0, weapon: WEAPON.mine });
    w.step();
    expect(w.mines.size).toBe(2);
  });
});

describe('cooldowns wire array is per-mount number[][]', () => {
  it('is [[port,stbd], [tube], [mineDrop]] raw remaining-ms', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A');
    ship.gunCooldowns = [3000, 1200];
    ship.torpedoCooldowns = [6000];
    ship.mineCooldown = 8000;
    expect(weaponCooldowns(ship)).toEqual([[3000, 1200], [6000], [8000]]);
  });

  it('carries BOTH broadside mounts verbatim (aim-relevant collapse is client-side)', () => {
    const w = bareWorld();
    const ship = w.addShip('a', 'A');
    ship.state = { x: 0, y: 0, heading: 0, speed: 0 };
    const portCenter = HALF_PI; // heading(0) + gun.mounts[0] ('port') offset (+90deg)
    ship.input = { seq: 1, throttle: 0, rudder: 0, aim: portCenter, fireSeq: 1, aimDist: 1000, weapon: WEAPON.gun };
    w.step(); // fires the port mount only — starboard's arc (-90+/-60) doesn't cover this aim
    expect(ship.gunCooldowns[0]).toBe(CONFIG.gun.reload);
    expect(ship.gunCooldowns[1]).toBe(0);
    // The wire mirrors the raw per-mount array unchanged — no aim-aware server
    // logic (that moved client-side, where aim is instant): the reloading port
    // mount and the ready starboard mount are BOTH present regardless of aim.
    expect(weaponCooldowns(ship)[WEAPON.gun]).toEqual([CONFIG.gun.reload, 0]);
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
    });
    windowAround(a, 0); // beam across bearing 0 (toward x+)
    const blips = blipsOf(buildFrame(w, 'a'));
    expect(blips.map((e) => e.id)).toEqual(['b']); // the ship, and ONLY the ship
    expect(blips.some((e) => e.id === 'trp')).toBe(false);
  });
});
