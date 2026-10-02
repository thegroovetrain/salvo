// MINES HAVE HIT POINTS (Eric rulings 2026-10-01, epic-8 amendments 200/201).
//
// Every mine carries CONFIG.mine.hp = 10, server-side only. A DECK GUN shell
// (cannon, flak, machine gun — the three masks carrying `mine`) that LANDS
// within CONFIG.mine.hitRadiusU of a mine's centre deals its full damage to
// it; at 0 a naval/fouling mine detonates and a captive is destroyed (a boom,
// no blast, no fish). A burst merely covering a mine does nothing; broadside
// and phosphor never touch one; only naval mines chain, both ways.
//
// This file drives every row of the cycle-160 spec's I/O matrix through the
// REAL fire paths: a cannon click through the gun module, a flak click, a
// held machine-gun stream, a broadside barrage, a phosphor shell.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  type BoomEvent,
  type BurstEvent,
  type GameEvent,
  type InputMsg,
  type MineKind,
  pointPolygonDistance,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { hullFor } from '../game/equipment/index.js';
import { fitClassWeapons } from './classWeapons.js';
import { flatRaster } from './islandFixture.js';

const SLOT_GUN = 0;
const SLOT_BROADSIDE = 2; // the Battleship's first class-weapon card lands here

function bareWorld(seed = 160): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

/** A captain at (x, y) bow along `heading`, mounting `gun` in slot 0 (the
 *  seat's pick; undefined = the default cannon). */
function captain(
  w: World,
  id: string,
  x: number,
  y: number,
  opts: { heading?: number; hull?: 'torpedoBoat' | 'battleship' | 'mineLayer'; gun?: 'machineGun' | 'flak' } = {},
): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', opts.hull ?? 'torpedoBoat', undefined, undefined, opts.gun);
  rec.state = { x, y, heading: opts.heading ?? 0, speed: 0 };
  return rec;
}

/** One mine straight into world state (armed at 0 unless told otherwise), at
 *  full hp — the store's own shape. */
function lay(w: World, id: string, ownerId: string, x: number, y: number, kind: MineKind = 'naval', armedAt = 0): void {
  w.mines.set(id, { id, ownerId, x, y, armedAt, kind, hp: CONFIG.mine.hp });
}

function input(patch: Partial<InputMsg>): InputMsg {
  return {
    seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN,
    fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch,
  };
}

const gunShellsInFlight = (w: World): boolean => [...w.shells.values()].some((s) => s.kind === 'shell');

/** Click `slot` at (aim, dist) and step until every gun-family shell has
 *  resolved; returns every event of the shot's life. */
function click(w: World, id: string, dist: number, opts: { aim?: number; slot?: number } = {}): GameEvent[] {
  w.submitInput(id, input({ seq: 2, fireSeq: 2, aimDist: dist, aim: opts.aim ?? 0, slot: opts.slot ?? SLOT_GUN }));
  const log: GameEvent[] = [];
  for (let i = 0; i < 80; i += 1) {
    w.step();
    log.push(...w.tickEvents);
    if (i > 0 && !gunShellsInFlight(w)) return log;
  }
  throw new Error('the shot never resolved');
}

/** The cursor point's every possible spelling (amendment 202): never a KEY in
 *  any frame. A recursive key walk — perception.test's hasForbiddenKey shape. */
const CURSOR_KEYS = ['cursor', 'cursorX', 'cursorY'] as const;
function hasKey(value: unknown, keys: readonly string[]): boolean {
  if (Array.isArray(value)) return value.some((v) => hasKey(v, keys));
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(([k, v]) => keys.includes(k) || hasKey(v, keys));
}

const mineBooms = (log: readonly GameEvent[], id: string): BoomEvent[] =>
  log.filter((e): e is BoomEvent => e.k === 'boom' && e.id === id);
const count = (log: readonly GameEvent[], k: string): number => log.filter((e) => e.k === k).length;

describe('CONFIG — the two numbers (amendments 200/201)', () => {
  it('10 hp, a 10 u "on the mine" disc, and a fresh mine is laid at full hp', () => {
    expect(CONFIG.mine.hp).toBe(10);
    expect(CONFIG.mine.hitRadiusU).toBe(10);
    // Laid through the real rack: a Mine Layer dropping astern.
    const w = bareWorld();
    const ml = captain(w, 'ml', 0, 0, { hull: 'mineLayer' });
    fitClassWeapons(w, ml);
    w.submitInput('ml', input({ seq: 2, fireSeq: 2, aim: Math.PI, aimDist: 100, slot: 2 }));
    w.step();
    const [m] = [...w.mines.values()];
    expect(m).toBeDefined();
    expect(m.hp).toBe(CONFIG.mine.hp);
  });
});

describe('the CANNON — one click on the mine pops it (15 >= 10)', () => {
  it('cannon click on an armed naval mine: boom, blast, and the shooter gets `sp` (no hull victim)', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    expect(a.stats.equipment.gun.damage).toBe(15);
    lay(w, 'm1', 'x', 300, 0);
    const log = click(w, 'a', 300);
    expect(w.mines.has('m1')).toBe(false);
    expect(mineBooms(log, 'm1')).toEqual([{ k: 'boom', id: 'm1', x: 300, y: 0 }]);
    expect(count(log, 'sp')).toBe(1);
    expect(count(log, 'hc')).toBe(0);
  });

  it('a click past the gun reach is clamped short: the shell lands 40 u off a mine at 700 u, which is untouched', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    expect(a.stats.equipment.gun.rangeU).toBe(660);
    lay(w, 'm1', 'x', 700, 0);
    const log = click(w, 'a', 700);
    const burst = log.find((e): e is BurstEvent => e.k === 'burst')!;
    expect(burst.x).toBeCloseTo(660, 3);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });

  it('THE CURSOR DECIDES (amendment 202): a click at 700 u clamps to 660 u and lands dead on a mine there — untouched, the cursor was 40 u off', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    lay(w, 'm1', 'x', 660, 0);
    const log = click(w, 'a', 700);
    const burst = log.find((e): e is BurstEvent => e.k === 'burst')!;
    expect(Math.hypot(burst.x - 660, burst.y)).toBeLessThan(1e-6); // landed ON the mine
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });

  it('the honest boundary of the two-disc rule: a click just past reach pops a mine that lies under BOTH the cursor and the landing', () => {
    // Click 6 u past reach (666 u); the shell lands at 660 u.
    for (const [mineX, cursorOff, landOff] of [
      [658, 8, 2], // a mine 2 u INSIDE reach: cursor 8 u off, landing 2 u off
      [663, 3, 3], // a mine 3 u PAST reach: cursor 3 u off one way, landing 3 u off the other
    ] as const) {
      const w = bareWorld();
      captain(w, 'a', 0, 0);
      lay(w, 'm1', 'x', mineX, 0);
      expect(666 - mineX).toBe(cursorOff);
      expect(mineX - 660).toBe(mineX > 660 ? landOff : -landOff);
      expect(Math.max(cursorOff, landOff)).toBeLessThanOrEqual(CONFIG.mine.hitRadiusU);
      const log = click(w, 'a', 666);
      expect(w.mines.has('m1')).toBe(false);
      expect(mineBooms(log, 'm1')).toHaveLength(1);
    }
  });

  it('the cursor point never rides a frame: live deck-gun shells carry it, no frame (shooter or watcher) does', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    captain(w, 'b', 400, 60, { hull: 'battleship' }); // a watcher with the shell in sight
    lay(w, 'm1', 'x', 700, 0);
    w.submitInput('a', input({ seq: 2, fireSeq: 2, aimDist: 700 }));
    let carried = 0;
    let reveals = 0;
    for (let i = 0; i < 80; i += 1) {
      w.step();
      for (const s of w.shells.values()) if (s.kind === 'shell' && s.cursor !== undefined) carried += 1;
      for (const id of ['a', 'b']) {
        const f = buildFrame(w, id);
        expect(hasKey(f, CURSOR_KEYS)).toBe(false);
        reveals += f.events.filter((e) => e.k === 'shell').length;
      }
      if (i > 0 && !gunShellsInFlight(w)) break;
    }
    expect(carried).toBeGreaterThan(0); // not vacuous: the shell did carry it
    expect(reveals).toBeGreaterThan(0); // and its reveal did ride a frame
  });

  it("the shooter's OWN mine pops too (the standing friendly-fire exception)", () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    lay(w, 'own', 'a', 300, 0);
    click(w, 'a', 300);
    expect(w.mines.has('own')).toBe(false);
  });

  it('an ARMING mine (laid 1 s ago, arm 3 s) takes the damage and pops — with its blast', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    // A bystander hull inside the mine's 48 u blast, outside the 15 u shell burst.
    const b = captain(w, 'b', 300, 40, { hull: 'battleship' });
    lay(w, 'm1', 'x', 300, 0, 'naval', w.now + CONFIG.mine.armDelay - 1000);
    expect(w.now).toBeLessThan(w.mines.get('m1')!.armedAt);
    const hp0 = b.hp;
    const log = click(w, 'a', 300);
    expect(w.mines.has('m1')).toBe(false);
    expect(mineBooms(log, 'm1')).toHaveLength(1);
    expect(hp0 - b.hp).toBe(CONFIG.mine.damage); // the mine's own blast, not the shell
  });

  it('a CAPTIVE mine clicked is consumed: a `boom` with no `hit`, no blast, no fish', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    // The shooter's OWN captive: its owner never trips it, so the only thing
    // that can take it off the water here is the shell.
    lay(w, 'cap', 'a', 300, 0, 'captive');
    const log = click(w, 'a', 300);
    expect(w.mines.has('cap')).toBe(false);
    expect(mineBooms(log, 'cap')).toEqual([{ k: 'boom', id: 'cap', x: 300, y: 0 }]);
    expect([...w.shells.values()].some((s) => s.kind === 'torp')).toBe(false);
    expect(count(log, 'torp')).toBe(0);
    expect(count(log, 'dmg')).toBe(0); // no blast — nothing anywhere took damage
  });

  it('a captive destroyed by gunfire deals NO blast to a hull beside it', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    const b = captain(w, 'b', 300, 40, { hull: 'battleship' });
    // The hull's nearest point sits inside the captive's 32 u burst and
    // outside the cannon's 15 u one — a blast here would show.
    const edge = pointPolygonDistance({ x: 300, y: 0 }, hullFor(b).poly);
    expect(edge).toBeGreaterThan(CONFIG.gun.burstRadius);
    expect(edge).toBeLessThan(CONFIG.captiveMines.blastRadius);
    // An enemy hull this close would TRIP the captive (144 u ring) — make the
    // bystander the LAYER, so it can never trip its own mine.
    lay(w, 'cap', 'b', 300, 0, 'captive');
    const hp0 = b.hp;
    const log = click(w, 'a', 300);
    expect(w.mines.has('cap')).toBe(false);
    expect(mineBooms(log, 'cap')).toEqual([{ k: 'boom', id: 'cap', x: 300, y: 0 }]);
    expect(b.hp).toBe(hp0);
    expect(count(log, 'torp')).toBe(0);
  });

  it('TWIN MOUNT: a centred click lands both shells 6 u off the mine; the first pops it, the second is a no-op', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0);
    // ONE deckGun card is the twin mount since Eric's 2026-10-02 ladder
    // (barrels 1/2/2/3/3, epic-8 amendment 232) — the ±6 u geometry below
    // is the two-barrel straddle.
    w.applyCard(a, 'deckGun');
    expect(a.stats.equipment.gun.barrels).toBe(2);
    lay(w, 'm1', 'x', 300, 0);
    const log = click(w, 'a', 300);
    const bursts = log.filter((e): e is BurstEvent => e.k === 'burst');
    expect(bursts).toHaveLength(2);
    for (const b of bursts) {
      const off = Math.hypot(b.x - 300, b.y - 0);
      expect(off).toBeCloseTo(CONFIG.gun.barrelSpacingU / 2, 3);
      expect(off).toBeLessThan(CONFIG.mine.hitRadiusU); // both land ON the mine
    }
    expect(w.mines.has('m1')).toBe(false);
    expect(mineBooms(log, 'm1')).toHaveLength(1); // popped once, never twice
  });
});

describe('the FLAK GUN — 12 >= 10, but only ON the mine', () => {
  it('a flak click on a mine pops it in one', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { gun: 'flak' });
    expect(a.stats.equipment.flak.damage).toBe(12);
    lay(w, 'm1', 'x', 300, 0);
    const log = click(w, 'a', 300);
    expect(w.mines.has('m1')).toBe(false);
    expect(mineBooms(log, 'm1')).toHaveLength(1);
  });

  it('a flak burst merely COVERING a mine (30 u off the click, inside the 50 u blast) leaves it at 10 hp', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0, { gun: 'flak' });
    lay(w, 'm1', 'x', 300, 30);
    const log = click(w, 'a', 300);
    expect(count(log, 'burst')).toBe(1);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });
});

describe('the MACHINE GUN — 5 a shell, two shells to pop one at tier I', () => {
  /** Hold the trigger with the aim on (dist, 0) until `shellsResolved` shells
   *  have resolved, recording the mine's hp after every resolving tick. */
  function stream(w: World, id: string, dist: number, mineId: string, shellsResolved: number) {
    const log: GameEvent[] = [];
    const hpAfter: (number | null)[] = [];
    let resolved = 0;
    let seq = 1;
    for (let i = 0; i < 200 && resolved < shellsResolved; i += 1) {
      seq += 1;
      w.submitInput(id, input({ seq, held: true, aimDist: dist }));
      const before = new Set([...w.shells.keys()]);
      w.step();
      log.push(...w.tickEvents);
      const gone = [...before].filter((sid) => !w.shells.has(sid)).length;
      for (let k = 0; k < gone; k += 1) hpAfter.push(w.mines.get(mineId)?.hp ?? null);
      resolved += gone;
    }
    w.submitInput(id, input({ seq: seq + 1, held: false, aimDist: dist })); // release
    return { log, hpAfter };
  }

  it('held on the mine: hp 10 -> 5 -> pops on the SECOND shell; the first is an `sp` with no boom', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { gun: 'machineGun' });
    expect(a.stats.equipment.machineGun.damage).toBe(5);
    lay(w, 'm1', 'x', 300, 0);
    const { log, hpAfter } = stream(w, 'a', 300, 'm1', 2);
    expect(hpAfter).toEqual([5, null]);
    expect(mineBooms(log, 'm1')).toEqual([{ k: 'boom', id: 'm1', x: 300, y: 0 }]);
    expect(count(log, 'sp')).toBe(2); // every shell reached the water: fall of shot each
    expect(count(log, 'hc')).toBe(0);
    expect(count(log, 'burst')).toBe(0); // a direct shell never bursts
  });

  it('one shell is not enough: the mine survives at 5 hp', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0, { gun: 'machineGun' });
    lay(w, 'm1', 'x', 300, 0);
    const { log, hpAfter } = stream(w, 'a', 300, 'm1', 1);
    expect(hpAfter).toEqual([5]);
    expect(w.mines.get('m1')!.hp).toBe(5);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });

  it('tier II (6 a shell) pops one in two', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { gun: 'machineGun' });
    w.applyCard(a, 'machineGun');
    expect(a.stats.equipment.machineGun.damage).toBe(6);
    lay(w, 'm1', 'x', 300, 0);
    const { hpAfter } = stream(w, 'a', 300, 'm1', 2);
    expect(hpAfter).toEqual([4, null]);
  });

  it('a hull in the stream\'s path takes the hit; the mine behind it is untouched', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0, { gun: 'machineGun' });
    const b = captain(w, 'b', 150, 0, { hull: 'battleship', heading: Math.PI / 2 }); // squarely across the line of fire
    lay(w, 'm1', 'x', 300, 0);
    const hp0 = b.hp;
    const { log } = stream(w, 'a', 300, 'm1', 3);
    expect(b.hp).toBe(hp0 - 3 * CONFIG.machineGun.damage);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(count(log, 'hc')).toBe(3);
  });

  it('THE CURSOR IS READ PER SHELL (amendment 202): shell 1 on the mine leaves it at 5; shell 2, cursor 40 u past reach, lands at the 660 u clamp and leaves it at 5; shell 3, cursor back on, pops it', () => {
    // REDESIGNED (cycle 166): two tier-I shells pop a mine now (5 + 5), so
    // the off-cursor shell sits BETWEEN two on-cursor ones — the mine must
    // survive shell 1, shrug off shell 2, and pop only on shell 3.
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { gun: 'machineGun' });
    expect(a.stats.equipment.machineGun.rangeU).toBe(660);
    lay(w, 'm1', 'x', 660, 0);
    const fired = new Set<string>();
    const hpAfter: (number | null)[] = [];
    let seq = 1;
    for (let i = 0; i < 200 && hpAfter.length < 3; i += 1) {
      seq += 1;
      // Shell 1 on the mine; shell 2 with the cursor at 700 u; shell 3 back on it.
      w.submitInput('a', input({ seq, held: true, aimDist: fired.size === 1 ? 700 : 660 }));
      const before = new Set([...w.shells.keys()]);
      w.step();
      for (const [sid, sh] of w.shells) if (sh.family === 'mg' && fired.size < 3) fired.add(sid);
      const gone = [...before].filter((sid) => !w.shells.has(sid)).length;
      for (let k = 0; k < gone; k += 1) hpAfter.push(w.mines.get('m1')?.hp ?? null);
    }
    expect(hpAfter.slice(0, 3)).toEqual([5, 5, null]);
    expect(w.mines.has('m1')).toBe(false);
  });

  it('a stream aimed 12 u off the mine never scratches it', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0, { gun: 'machineGun' });
    lay(w, 'm1', 'x', 300, 12);
    const { hpAfter } = stream(w, 'a', 300, 'm1', 3);
    expect(hpAfter).toEqual([10, 10, 10]);
  });
});

describe('NOTHING ELSE damages a mine — broadside and phosphor lost the bit', () => {
  it('a broadside barrage onto a mine leaves it at 10 hp', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { hull: 'battleship' });
    fitClassWeapons(w, a);
    expect(a.loadout[SLOT_BROADSIDE].equipmentId).toBe('broadside');
    lay(w, 'm1', 'x', 0, 300);
    const log = click(w, 'a', 300, { aim: Math.PI / 2, slot: SLOT_BROADSIDE });
    expect(count(log, 'burst')).toBeGreaterThan(0);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });

  it('a phosphor shell landing dead on a mine leaves it at 10 hp', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 0, 0, { hull: 'battleship' });
    w.applyCard(a, 'phosphorShells');
    const slot = a.loadout.findIndex((s) => s.equipmentId === 'phosphorShells');
    expect(slot).toBeGreaterThanOrEqual(0);
    lay(w, 'm1', 'x', 400, 0);
    const log = click(w, 'a', 400, { slot });
    expect(count(log, 'burst')).toBe(1);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
    expect(mineBooms(log, 'm1')).toEqual([]);
  });
});

describe('CHAINS — naval mines only, both ways', () => {
  it('a naval pop chains a naval neighbour; fouling and captive bystanders in its blast are untouched', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    lay(w, 'A', 'x', 300, 0); // the one the shell lands on
    lay(w, 'B', 'y', 300, 40); // naval, inside A's 48 u blast — another owner
    lay(w, 'C', 'x', 340, 0, 'fouling'); // fouling, inside A's blast
    lay(w, 'D', 'a', 300, -40, 'captive'); // captive (the shooter's own, so nothing trips it), inside A's blast
    const log = click(w, 'a', 300);
    expect(w.mines.has('A')).toBe(false);
    expect(w.mines.has('B')).toBe(false); // chained
    expect(w.mines.get('C')!.hp).toBe(CONFIG.mine.hp); // fouling never receives
    expect(w.mines.get('D')!.hp).toBe(CONFIG.mine.hp); // captive never receives
    expect(mineBooms(log, 'C')).toEqual([]);
    expect(mineBooms(log, 'D')).toEqual([]);
  });

  it('a FOULING mine that trips never propagates: the naval mine inside its blast stays', () => {
    const w = bareWorld();
    captain(w, 'o', 900, 900, { hull: 'mineLayer' }); // the layer, far away
    lay(w, 'F', 'o', 0, 0, 'fouling');
    lay(w, 'N', 'o', 0, 60); // inside the fouling 72 u blast, outside any hull's trip reach
    captain(w, 'v', 0, -20, { hull: 'battleship' }); // trips F (48 u ring)
    for (let i = 0; i < 3 && w.mines.has('F'); i += 1) w.step();
    expect(w.mines.has('F')).toBe(false); // tripped and detonated
    expect(w.mines.has('N')).toBe(true); // a fouling blast never chains
  });

  it('a FOULING mine shot to 0 pops alone: the naval mine inside its blast stays (fouling never propagates)', () => {
    const w = bareWorld();
    captain(w, 'a', 0, 0);
    lay(w, 'F', 'x', 300, 0, 'fouling'); // the one the shell lands on
    lay(w, 'N', 'x', 300, 40); // naval, inside the fouling blast
    const log = click(w, 'a', 300);
    expect(w.mines.has('F')).toBe(false);
    expect(mineBooms(log, 'F')).toHaveLength(1);
    expect(w.mines.has('N')).toBe(true); // fouling never propagates
  });
});
