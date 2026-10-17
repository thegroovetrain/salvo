// THE WHOLE BLAST LANDS ON MINES (Eric 2026-10-16, Story 9.12, epic-9
// amendment 184(i) — verbatim: "We will attenuate the mine landings too.
// We'll also use the shell's entire blast radius for damage calculation
// against mines (so flak goes back to being able to clear a few, and maybe
// cannon too to some extent since its 2 shells)"; the cursor clause of
// amendment 202 RETIRES).
//
// The contract: a deck-gun shell that lands at `at` deals
// `settleBlow(damage × atten(flown))` to EVERY mine whose centre lies within
// `burstRadius + CONFIG.mine.hitRadiusU` of `at` — no cursor term, no rim term.
// The machine gun (no blast) keeps "within 10 u of where it arrived".
// Every number is derived from CONFIG and the shared functions.

import { describe, it, expect } from 'vitest';
import { CONFIG, rangeAttenuation, settleBlow, type GameEvent, type InputMsg, type ShellState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

function bareWorld(seed = 1912): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function captain(w: World, id: string, gun?: 'machineGun' | 'flak'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, { x: 0, y: 0 }, gun);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return rec;
}

function lay(w: World, id: string, x: number, y: number, hp: number = CONFIG.mine.hp): void {
  w.mines.set(id, { id, ownerId: 'x', x, y, armedAt: 0, kind: 'naval', hp });
}

function input(patch: Partial<InputMsg>): InputMsg {
  return { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0, hornSeq: 0, held: false, ...patch };
}

/** Fire along +x at `dist` (one machine-gun shell, or one click) and step
 *  until every shell resolves; returns the launched shells as first seen. */
function fire(w: World, id: string, dist: number): { log: GameEvent[]; shells: ShellState[] } {
  const stream = w.ships.get(id)!.loadout[0].equipmentId === 'machineGun';
  w.submitInput(id, input({ fireSeq: 2, aimDist: dist, held: stream }));
  const log: GameEvent[] = [];
  const seen = new Map<string, ShellState>();
  for (let i = 0; i < 120; i += 1) {
    w.step();
    log.push(...w.tickEvents);
    for (const s of w.shells.values()) if (s.ownerId === id && !seen.has(s.id)) seen.set(s.id, { ...s });
    if (stream && seen.size > 0) w.submitInput(id, input({ seq: 3, fireSeq: 2, aimDist: dist, held: false }));
    if (seen.size > 0 && ![...w.shells.values()].some((s) => s.ownerId === id)) return { log, shells: [...seen.values()] };
  }
  throw new Error('the shot never resolved');
}

const landAtten = (s: ShellState): number =>
  rangeAttenuation(Math.hypot(s.targetX! - s.originX!, s.targetY! - s.originY!), s.attenRangeU!, CONFIG.gunAttenuation);

describe('the flak burst clears a cluster', () => {
  it('pops two mines 40 u apart, each 20 u off the burst point — neither is under the click', () => {
    const w = bareWorld();
    captain(w, 'a', 'flak');
    expect(20).toBeGreaterThan(CONFIG.mine.hitRadiusU); // off the 10 u marker: the old "on the mine" test would miss both
    expect(20).toBeLessThanOrEqual(CONFIG.flak.burstRadius + CONFIG.mine.hitRadiusU);
    lay(w, 'm1', 280, 0);
    lay(w, 'm2', 320, 0);
    const { shells } = fire(w, 'a', 300);
    expect(settleBlow(CONFIG.flak.damage * landAtten(shells[0]))).toBeGreaterThanOrEqual(CONFIG.mine.hp);
    expect(w.mines.has('m1')).toBe(false);
    expect(w.mines.has('m2')).toBe(false);
  });

  it('a mine just outside the blast-plus-marker reach is untouched', () => {
    const w = bareWorld();
    captain(w, 'a', 'flak');
    const reach = CONFIG.flak.burstRadius + CONFIG.mine.hitRadiusU;
    lay(w, 'm1', 300 + reach + 1, 0);
    fire(w, 'a', 300);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp);
  });
});

describe('the cannon — two shells, two blows', () => {
  it('a Tier I click on a mine lands BOTH shells\' bursts on it: D + D pops a mine one shell could not', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    expect(a.stats.equipment.gun.barrels).toBe(CONFIG.gun.barrels);
    expect(CONFIG.gun.damage).toBeLessThan(CONFIG.mine.hp); // one shell alone does not pop it
    expect(CONFIG.gun.barrels * CONFIG.gun.damage).toBeGreaterThanOrEqual(CONFIG.mine.hp);
    lay(w, 'm1', 300, 0);
    const { log, shells } = fire(w, 'a', 300);
    expect(shells).toHaveLength(CONFIG.gun.barrels);
    for (const s of shells) expect(landAtten(s)).toBe(1);
    expect(w.mines.has('m1')).toBe(false);
    expect(log.filter((e) => e.k === 'boom' && e.id === 'm1')).toHaveLength(1);
  });

  it('a max-range landing deals the ATTENUATED blow per shell', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const R = a.stats.equipment.gun.rangeU;
    const tough = 100; // a mine that survives, so the hp spent can be read
    lay(w, 'm1', R, 0, tough);
    const { shells } = fire(w, 'a', R);
    const per = settleBlow(CONFIG.gun.damage * landAtten(shells[0]));
    expect(per).toBeLessThan(CONFIG.gun.damage);
    expect(tough - w.mines.get('m1')!.hp).toBe(shells.length * per);
  });
});

describe('the machine gun — no blast, within 10 u of where it arrived', () => {
  it('hurts a mine 9 u off its arrival point and leaves one 12 u off', () => {
    const w = bareWorld();
    captain(w, 'a', 'machineGun');
    lay(w, 'near', 300, 9);
    lay(w, 'off', 300, -12);
    const { shells } = fire(w, 'a', 300);
    expect(shells).toHaveLength(1);
    expect(landAtten(shells[0])).toBe(1);
    expect(w.mines.get('near')!.hp).toBe(CONFIG.mine.hp - CONFIG.machineGun.damage);
    expect(w.mines.get('off')!.hp).toBe(CONFIG.mine.hp);
  });

  it('at max range the mine takes the attenuated blow', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 'machineGun');
    const R = a.stats.equipment.machineGun.rangeU;
    lay(w, 'm1', R, 0);
    const { shells } = fire(w, 'a', R);
    const blow = settleBlow(CONFIG.machineGun.damage * landAtten(shells[0]));
    expect(blow).toBeLessThan(CONFIG.machineGun.damage);
    expect(w.mines.get('m1')!.hp).toBe(CONFIG.mine.hp - blow);
  });
});
