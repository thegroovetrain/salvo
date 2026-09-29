// THE FLAK GUN (Story 8.15, Eric rulings 2026-09-28, epic-8 amendments 96(f),
// 105 and 106) — the I/O matrix's flak rows through World.step():
//   * one shell per click to the clicked point, bursting in a 50 u blast for
//     12 hp per hull inside it (`hc`), reload 6 s, one round;
//   * a hull crossing the path takes the 4 hp bodyblock and stops the shell;
//   * the ORDNANCE side effect (amendment 105): an ENEMY torpedo inside the
//     blast is REMOVED — no boom, no damage, no `hc` — and the shooter's OWN
//     fish are immune; removal re-checks the fish's LIVE point;
//   * a burst chains into armed non-captive mines like any burst;
//   * the reveal carries `w: 'flak'`; a click while reloading is `cooling`.

import { describe, it, expect, vi } from 'vitest';
import { CONFIG, type GameEvent, type InputMsg, type ShellState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const FLAK = CONFIG.flak;
const SLOT_GUN = 0;

function bareWorld(seed = 16): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function flakker(w: World, id: string, x = 0, y = 0, heading = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined, 'flak');
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function hull(w: World, id: string, x: number, y: number, heading = Math.PI / 2): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'battleship', undefined, undefined);
  rec.state = { x, y, heading, speed: 0 };
  return rec;
}

function makeInput(patch: Partial<InputMsg>): InputMsg {
  return { seq: 1, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: SLOT_GUN, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Click at `dist` along `aim`, then run until the shell resolves. */
function click(w: World, id: string, dist: number, aim = 0, seq = 1): GameEvent[] {
  w.submitInput(id, makeInput({ seq, fireSeq: seq, aimDist: dist, aim }));
  const log: GameEvent[] = [];
  for (let i = 0; i < 60; i++) {
    w.step();
    log.push(...w.tickEvents);
    if (i > 0 && ![...w.shells.values()].some((s) => s.kind === 'shell')) break;
  }
  return log;
}

/** A live torpedo parked at (x, y), running +y slowly, owned by `ownerId`. */
function fish(w: World, id: string, ownerId: string, x: number, y: number): ShellState {
  const s: ShellState = {
    id, ownerId, x, y, vx: 0, vy: 1, distLeft: 5000, bornAt: w.now, kind: 'torp', family: null,
    damage: CONFIG.torpedo.damage, hitRadius: CONFIG.torpedo.hitRadius, targetX: null, targetY: null,
    burstRadius: 0, contactDamage: CONFIG.torpedo.damage, hits: CONFIG.torpedo.hits,
  };
  w.shells.set(id, s);
  return s;
}

const count = (log: readonly GameEvent[], k: string): number => log.filter((e) => e.k === k).length;

describe('the flak gun — a cannon-pattern burst gun with Eric\'s numbers (amendment 105)', () => {
  it('mounts the flak module in slot 0: one round, 6 s reload, 660 u range, the AR44 mask', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    expect(a.loadout[SLOT_GUN].equipmentId).toBe('flak');
    expect(a.loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
    expect(a.stats.equipment.flak).toMatchObject({ maxAmmo: 1, reloadMs: 6000, damage: 12, burstRadius: 50, contactDamage: 4 });
    expect(a.stats.equipment.flak.rangeU).toBe(a.stats.radarRange);
    expect(FLAK.hits).toEqual(['hull', 'mine', 'decoy', 'ordnance']);
  });

  it('a click at 300 u: the shell bursts AT the click, 12 hp to a hull 30 u off the point, one `hc`, `w: flak`', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    const b = hull(w, 'b', 300, 92); // broadside-on, its bow tip 30 u off the burst point: inside r50, clear of the shell's path
    const log = click(w, 'a', 300);
    expect(count(log, 'burst')).toBe(1);
    const burst = log.find((e) => e.k === 'burst') as { x: number; y: number };
    expect(burst.x).toBeCloseTo(300, 3);
    expect(burst.y).toBeCloseTo(0, 3);
    expect(b.hp).toBe(b.stats.maxHp - 12);
    expect(count(log, 'hc')).toBe(1);
    expect(count(log, 'sp')).toBe(0);
    expect(a.damageDealt).toBe(12);
    for (const e of log) if (e.k === 'shell') expect(e.w).toBe('flak');
    expect(count(log, 'mz')).toBe(1);
    // One round: the pool is now reloading the full 6 s.
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
  });

  it('a second click while reloading is refused `cooling` on the wire; no arc denial exists for any gun', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    click(w, 'a', 300);
    w.submitInput('a', makeInput({ seq: 2, fireSeq: 2, aimDist: 300, aim: Math.PI })); // dead astern: still legal
    w.step();
    expect(w.denialsFor('a')).toEqual([{ slot: SLOT_GUN, reason: 'cooling', seq: 2 }]);
    expect(a.loadout[SLOT_GUN].state!.n).toBe(0);
  });

  it('BODYBLOCK: a hull crossing the shell\'s path takes the 4 hp contact hit, one `hc`, and the shell is consumed (no burst)', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    const b = hull(w, 'b', 200, 0); // broadside-on ACROSS the line of fire, 200 u short of the 400 u click
    const log = click(w, 'a', 400);
    expect(b.hp).toBe(b.stats.maxHp - 4);
    expect(count(log, 'hc')).toBe(1);
    expect(count(log, 'burst')).toBe(0);
    expect(count(log, 'boom')).toBe(1);
  });

  it('a burst over open water is fall of shot: one `sp`, no `hc`', () => {
    const w = bareWorld();
    flakker(w, 'a');
    const log = click(w, 'a', 300);
    expect(count(log, 'burst')).toBe(1);
    expect(count(log, 'sp')).toBe(1);
    expect(count(log, 'hc')).toBe(0);
  });
});

// EVERY DECK GUN FIRES INTO ITS OWN LIT-UP AREA (Eric ruling 2026-09-29,
// amendment 114): R2.15's reach extension applies to the flak gun exactly as
// to the cannon — own live zone over the far point = the clicked distance; an
// ENEMY's flare, or none, clamps to the 660 u rung.
describe('the lit-zone reach — the flak gun fires into its own flare (amendment 114)', () => {
  function litClick(owner: string | null): { w: World; a: ShipRecord } {
    const w = bareWorld();
    const a = flakker(w, 'a');
    if (owner !== null) {
      w.litZones.set('z1', {
        id: 'z1', ownerId: owner, x: 800, y: 0, r: 120, until: 10 * 60 * 1000, phosphor: false, dazzle: false,
      });
    }
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, aimDist: 800 }));
    w.step();
    return { w, a };
  }

  it('a click at 800 u into an OWN live lit zone lands the shell at 800 u', () => {
    const { w, a } = litClick('a');
    expect(a.stats.equipment.flak.rangeU).toBe(660);
    const shells = [...w.shells.values()];
    expect(shells).toHaveLength(1);
    expect(shells[0].targetX).toBeCloseTo(800, 6);
  });

  it('the same click into an ENEMY zone, or with no zone, clamps to 660 u', () => {
    for (const owner of ['b', null]) {
      const { w } = litClick(owner);
      const shells = [...w.shells.values()];
      expect(shells, `owner=${owner}`).toHaveLength(1);
      expect(shells[0].targetX, `owner=${owner}`).toBeCloseTo(660, 6);
    }
  });
});

describe('the ORDNANCE side effect (amendment 105) — a burst removes ENEMY fish, never the shooter\'s own', () => {
  it('an enemy torpedo 20 u off the burst point is REMOVED: no boom, no damage, no `hc`, its water orphaned', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    hull(w, 'b', 2000, 2000); // the fish's owner, far away
    const f = fish(w, 'enemy-fish', 'b', 300, 20);
    const log = click(w, 'a', 300);
    expect(w.shells.has('enemy-fish')).toBe(false);
    expect(count(log, 'burst')).toBe(1);
    // ONE boom in the whole run: the flak shell's own. The fish left silently.
    expect(log.filter((e) => e.k === 'boom').map((e) => (e as { id: string }).id)).toEqual([]);
    expect(count(log, 'hc')).toBe(0);
    expect(count(log, 'sp')).toBe(1); // a burst that resolved no HULL is fall of shot
    expect(count(log, 'dmg')).toBe(0);
    expect(a.damageDealt).toBe(0);
    expect(f.ownerId).toBe('b'); // (the record is simply gone from flight)
    for (const s of w.ships.values()) expect(s.seenBallistics.has('enemy-fish')).toBe(false);
  });

  it('the shooter\'s OWN fish inside the blast is untouched — and a hull in the same blast still takes 12', () => {
    const w = bareWorld();
    const a = flakker(w, 'a');
    const b = hull(w, 'b', 300, 92); // bow tip 30 u off the point (see above)
    fish(w, 'own-fish', 'a', 300, -20);
    fish(w, 'enemy-fish', 'b', 300, -25);
    const log = click(w, 'a', 300);
    expect(w.shells.has('own-fish')).toBe(true); // immune: the owner's own ordnance
    expect(w.shells.has('enemy-fish')).toBe(false); // removed
    expect(b.hp).toBe(b.stats.maxHp - 12);
    expect(count(log, 'hc')).toBe(1); // the hull, not the fish, earns the mark
  });

  it('a fish OUTSIDE the 50 u blast survives; a fish inside is gone the same tick and never steps again', () => {
    const w = bareWorld();
    flakker(w, 'a');
    hull(w, 'b', 2000, 2000);
    fish(w, 'far', 'b', 300, 60); // 60 u off: outside r50
    fish(w, 'near', 'b', 300, 40); // 40 u off: inside
    click(w, 'a', 300);
    expect(w.shells.has('far')).toBe(true);
    expect(w.shells.has('near')).toBe(false);
    expect(w.torpWakes.has('near')).toBe(false); // its ribbon detached into the orphan store
  });

  it('a fish never reaches the burst DAMAGE loop: no hitBuoy call for it, and a fish-only blast is `sp`, not `hc`', () => {
    const w = bareWorld();
    flakker(w, 'a');
    hull(w, 'b', 2000, 2000);
    fish(w, 'enemy-fish', 'b', 300, 20);
    const spy = vi.spyOn(w as unknown as { hitBuoy: (id: string, n: number) => boolean }, 'hitBuoy');
    const log = click(w, 'a', 300);
    expect(w.shells.has('enemy-fish')).toBe(false); // still removed, by the ordnance loop
    expect(spy.mock.calls.some(([id]) => id === 'enemy-fish')).toBe(false);
    expect(count(log, 'sp')).toBe(1);
    expect(count(log, 'hc')).toBe(0);
  });

  it('removal re-checks the fish\'s LIVE point: a fish 49 u off at memo time that steps to 52 u before the burst resolves SURVIVES', () => {
    const w = bareWorld();
    flakker(w, 'a', 0, -400); // X: a flak shell in flight this tick (aimed far), built first in the Map
    flakker(w, 'c', 0, 0); //     Y: the resolving flak shell, launched AFTER the fish
    hull(w, 'b', 2000, 2000);
    w.submitInput('a', makeInput({ seq: 1, fireSeq: 1, aimDist: 600, aim: 0 }));
    w.step(); // X launched
    const f = fish(w, 'enemy-fish', 'b', 300, 49); // Map order: X, fish, (Y)
    f.vy = 0.001; // parked (speed must be > 0 to stay in flight)
    w.submitInput('c', makeInput({ seq: 1, fireSeq: 1, aimDist: 300, aim: 0 }));
    w.step(); // Y launched
    const y = [...w.shells.values()].find((s) => s.ownerId === 'c' && s.kind === 'shell')!;
    expect(y).toBeDefined();
    let resolved = false;
    for (let i = 0; i < 40 && !resolved; i++) {
      const step = FLAK.shellSpeed * (CONFIG.tick.simDtMs / 1000);
      const left = Math.hypot(y.targetX! - y.x, y.targetY! - y.y);
      if (left <= step) {
        // Y resolves THIS tick: X steps first (memoizing the fish at 49 u),
        // then the fish runs 3 u (60 u/s) out to 52 u, then Y bursts.
        f.x = 300;
        f.y = 49;
        f.vy = 60;
        resolved = true;
      }
      w.step();
    }
    expect(resolved).toBe(true);
    expect(w.shells.has(y.id)).toBe(false); // Y burst
    expect([...w.shells.values()].some((s) => s.ownerId === 'a' && s.kind === 'shell')).toBe(true); // X still flying: it memoized
    expect(f.y).toBeCloseTo(52, 6);
    expect(w.shells.has('enemy-fish')).toBe(true); // outside the blast when it went off
  });

  it('a burst chains into an armed non-captive mine inside the blast like any burst (amendments 16/18/20)', () => {
    const w = bareWorld();
    flakker(w, 'a');
    w.mines.set('m1', { id: 'm1', ownerId: 'b', x: 300, y: 30, armedAt: 0, kind: 'naval' });
    const log = click(w, 'a', 300);
    expect(w.mines.has('m1')).toBe(false);
    expect(count(log, 'burst')).toBe(1);
    expect(log.some((e) => e.k === 'boom' && (e as { id: string }).id === 'm1')).toBe(true); // the mine's own blast
  });
});
