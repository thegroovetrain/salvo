// THE WHOLE BLAST LANDS ON MINES (Eric 2026-10-16, Story 9.12, epic-9
// amendment 184(i) — verbatim: "We will attenuate the mine landings too.
// We'll also use the shell's entire blast radius for damage calculation
// against mines (so flak goes back to being able to clear a few, and maybe
// cannon too to some extent since its 2 shells)"; the cursor clause of
// amendment 202 RETIRES).
//
// The contract: a deck-gun shell that lands at `at` deals `settleBlow(damage)`
// to EVERY mine whose centre lies within `burstRadius + CONFIG.mine.hitRadiusU`
// of `at` — no cursor term, no rim term, and since Story 11.1 (2026-11-12) no
// range term either: the "attenuate the mine landings" half of 184(i) retired
// with range attenuation.
// The machine gun (no blast) keeps "within 10 u of where it arrived".
// Every number is derived from CONFIG and the shared functions.

import { describe, it, expect } from 'vitest';
import { CONFIG, settleBlow, type GameEvent, type InputMsg, type ShellState } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';
import { mountDeckGun, neutralize } from './deckGunFixture.js';

function bareWorld(seed = 1912): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function captain(w: World, id: string, gun: 'gun' | 'machineGun' | 'flak' = 'gun'): ShipRecord {
  // NEUTRAL index + the deck-gun row under test (deckGunFixture; the cannon by default).
  const rec = mountDeckGun(neutralize(w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, { x: 0, y: 0 })), gun);
  rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
  return rec;
}

function lay(w: World, id: string, x: number, y: number, hp: number = CONFIG.mine.hp): void {
  w.mines.set(id, { id, ownerId: 'x', x, y, armedAt: 0, kind: 'naval', hp });
}

function input(patch: Partial<InputMsg>): InputMsg {
  return { seq: 2, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, act: 0, hornSeq: 0, held: false, sec: false, ...patch };
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

describe('the flak burst clears a cluster', () => {
  it('pops two mines 40 u apart, each 20 u off the burst point — neither is under the click', () => {
    const w = bareWorld();
    captain(w, 'a', 'flak');
    expect(20).toBeGreaterThan(CONFIG.mine.hitRadiusU); // off the 10 u marker: the old "on the mine" test would miss both
    expect(20).toBeLessThanOrEqual(CONFIG.flak.burstRadius + CONFIG.mine.hitRadiusU);
    lay(w, 'm1', 280, 0);
    lay(w, 'm2', 320, 0);
    fire(w, 'a', 300);
    expect(settleBlow(CONFIG.flak.damage)).toBeGreaterThanOrEqual(CONFIG.mine.hp);
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

describe('the cannon — every barrel, one blow each', () => {
  // 2026-11-04 (Story 10.3): the cannon's ×3 placeholder damage (24, Eric
  // ruling 10) pops the 10 hp mine with ONE shell, so "one shell could not"
  // is no longer a fact of the tables; the contract kept is that a Tier I
  // click lands every barrel on the mine and the summed blows pop it once.
  it('a Tier I click on a mine lands EVERY barrel\'s burst on it: the summed blows pop it, one boom', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    expect(a.stats.equipment.gun.barrels).toBe(CONFIG.gun.barrels);
    expect(CONFIG.gun.barrels * CONFIG.gun.damage).toBeGreaterThanOrEqual(CONFIG.mine.hp);
    lay(w, 'm1', 300, 0);
    const { log, shells } = fire(w, 'a', 300);
    expect(shells).toHaveLength(CONFIG.gun.barrels);
    expect(w.mines.has('m1')).toBe(false);
    expect(log.filter((e) => e.k === 'boom' && e.id === 'm1')).toHaveLength(1);
  });

  it('a max-range landing deals the FULL blow per shell (flat with range, Story 11.1)', () => {
    const w = bareWorld();
    const a = captain(w, 'a');
    const R = a.stats.equipment.gun.rangeU;
    const tough = 100; // a mine that survives, so the hp spent can be read
    lay(w, 'm1', R, 0, tough);
    const { shells } = fire(w, 'a', R);
    expect(tough - w.mines.get('m1')!.hp).toBe(shells.length * settleBlow(CONFIG.gun.damage));
  });
});

describe('the machine gun — no blast, within 10 u of where it arrived', () => {
  it('hurts a mine 9 u off its arrival point and leaves one 12 u off', () => {
    // Two worlds, one mine each (Story 10.3): the ×3 placeholder MG now POPS
    // the near mine, and its naval blast would chain the off mine — which
    // measures the chain, not the shell's 10 u reach.
    const w = bareWorld();
    captain(w, 'a', 'machineGun');
    lay(w, 'near', 300, 9);
    const { shells } = fire(w, 'a', 300);
    expect(shells).toHaveLength(1);
    // The near mine takes ONE whole blow: popped if the blow reaches its hp,
    // else hp − D.
    const left = CONFIG.mine.hp - CONFIG.machineGun.damage;
    expect(w.mines.get('near')?.hp ?? 0).toBe(Math.max(0, left));
    expect(w.mines.has('near')).toBe(left > 0);
    const w2 = bareWorld();
    captain(w2, 'a', 'machineGun');
    lay(w2, 'off', 300, -12);
    fire(w2, 'a', 300);
    expect(w2.mines.get('off')!.hp).toBe(CONFIG.mine.hp);
  });

  it('at max range the mine takes the FULL blow (flat with range, Story 11.1)', () => {
    const w = bareWorld();
    const a = captain(w, 'a', 'machineGun');
    const R = a.stats.equipment.machineGun.rangeU;
    const tough = 100; // a mine that survives, so the hp spent can be read
    lay(w, 'm1', R, 0, tough);
    fire(w, 'a', R);
    expect(w.mines.get('m1')!.hp).toBe(tough - settleBlow(CONFIG.machineGun.damage));
  });
});
