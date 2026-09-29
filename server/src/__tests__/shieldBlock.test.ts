// SHIELD BLOCK (Story 8.16, catalog-v3 R37, epic-8 amendments 100, 116–118).
//
// The consumable row arms the ship's shield seat through the World's
// `setShield` capability; the damage gate's existing `absorbShield` (after the
// DAMAGE CUT, before the hull decrement) is the whole absorb path. This file
// pins the I/O matrix's shield rows end to end through the real belt press and
// the real gate, and the self-private `OwnShip.shield` wire field.

import { describe, it, expect } from 'vitest';
import { CONFIG, CONSUMABLE_SLOTS, type DamageEvent, type GameEvent, type Target, type TargetKind } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { flatRaster } from './islandFixture.js';

const BELT = CONSUMABLE_SLOTS[0];

type Src = 'shell' | 'burst' | 'torpedo' | 'mine' | 'burn' | 'storm' | 'contact';

/** The private seams a directed test drives by name (the world.test idiom). */
interface Inner {
  applyDamage(victim: ShipRecord, amount: number, src: Src, byId: string | undefined): void;
  resolveShell(shell: unknown, outcome: unknown, hulls: readonly Target[]): void;
  hitTargets(mask: readonly TargetKind[]): readonly Target[];
  pending: GameEvent[];
}
const inner = (w: World): Inner => w as unknown as Inner;

function bareWorld(seed = 816): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x = 0, y = 0, hull: 'torpedoBoat' | 'battleship' = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', hull, undefined, undefined);
  rec.state = { x, y, heading: 0, speed: 0 };
  return rec;
}

/** Stock `n` SHIELD BLOCK copies and press the belt once through the gate. */
function stockAndFire(w: World, ship: ShipRecord, n = 1): ReturnType<World['sinkingActivationGate']> {
  for (let i = 0; i < n; i++) w.applyCard(ship, 'shieldBlock');
  expect(ship.loadout[BELT].equipmentId).toBe('shieldBlock');
  return w.sinkingActivationGate(ship, BELT);
}

const dmgOf = (w: World): DamageEvent[] => inner(w).pending.filter((e): e is DamageEvent => e.k === 'dmg');

describe('SHIELD BLOCK — the row (Story 8.16)', () => {
  it('a press arms a FRESH 100 hp / 10 s shield and spends ONE copy', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.shield).toBeNull();
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    expect(a.shield).toEqual({ hpLeft: CONFIG.shieldBlock.hp, until: w.now + CONFIG.shieldBlock.durationMs });
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null }); // the one copy spent, slot cleared
    expect(a.cards).not.toContain('shieldBlock');
  });

  it('SECOND SHIELD REPLACES: 40 hp / 3 s left, press again -> 100 / a fresh 10 s, one copy spent', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(stockAndFire(w, a, 2)).toEqual({ ok: true });
    a.shield = { hpLeft: 40, until: w.now + 3000 };
    for (let i = 0; i < 4; i++) w.step(); // time moves: the fresh window is measured from the new press
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: true });
    expect(a.shield).toEqual({ hpLeft: CONFIG.shieldBlock.hp, until: w.now + CONFIG.shieldBlock.durationMs });
    expect(a.loadout[BELT]).toEqual({ equipmentId: null, state: null }); // exactly two presses, two copies
  });

  it('a FULL hull still buys a shield (never refused while afloat)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(a.hp).toBe(a.stats.maxHp);
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    expect(a.shield).not.toBeNull();
  });

  it('a SINKING hull is refused (blocked) and NOTHING is spent', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.applyCard(a, 'shieldBlock');
    w.sinkShip('a', 'b');
    expect(a.lifecycle.kind).toBe('sinking');
    expect(w.sinkingActivationGate(a, BELT)).toEqual({ ok: false, reason: 'blocked' });
    expect(a.shield).toBeNull();
  });
});

describe('SHIELD BLOCK — the gate (I/O matrix, amendments 100/118)', () => {
  it('CUT THEN SHIELD: a Battleship with the cut up takes a 55 hp mine -> 27 reaches the shield, 73 left, hull untouched, dmg 0, combat clock unmoved', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0, 'battleship');
    place(w, 'b', 400, 0);
    a.damageCutUntil = w.now + CONFIG.damageCut.durationMs;
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    a.lastDamagedAt = w.now - 12_345; // a stale combat clock the absorbed hit must NOT refresh
    const clock = a.lastDamagedAt;
    inner(w).applyDamage(a, 55, 'mine', 'b');
    expect(a.shield?.hpLeft).toBe(CONFIG.shieldBlock.hp - 27);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgOf(w).map((e) => e.amount)).toEqual([0]); // FR55: the victim's dmg reads 0
    expect(a.lastDamagedAt).toBe(clock); // amendment 47: a fully absorbed hit is not "taking damage"
  });

  it('STORM and BURN are absorbed too (amendment 118): 0.2 + 0.25 -> 99.55 left, hull untouched', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    inner(w).applyDamage(a, 0.2, 'storm', undefined);
    inner(w).applyDamage(a, 0.25, 'burn', 'b');
    expect(a.shield?.hpLeft).toBeCloseTo(99.55, 12);
    expect(a.hp).toBe(a.stats.maxHp);
  });

  it('OVERFLOW: shield 10, a 15 hp shell -> shield spent and nulled, hull -5, dmg 5', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    a.shield = { hpLeft: 10, until: w.now + 5000 };
    inner(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.shield).toBeNull();
    expect(a.hp).toBe(a.stats.maxHp - 5);
    expect(dmgOf(w).map((e) => e.amount)).toEqual([5]);
  });

  it('EXPIRY: past `until`, a 15 hp shell passes through in full and the seat is nulled', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    a.shield = { hpLeft: 100, until: w.now };
    inner(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.shield).toBeNull();
    expect(a.hp).toBe(a.stats.maxHp - 15);
  });

  it('a FULLY absorbed shell still fires the SHOOTER\'s hit call (FR55 / amendment 117)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    a.shield = { hpLeft: 100, until: w.now + 5000 };
    const shell = {
      id: 's1', ownerId: 'b', x: 0, y: 0, vx: 0, vy: 0, distLeft: 0, bornAt: w.now,
      kind: 'shell', family: 'cannon', damage: CONFIG.gun.damage, hitRadius: CONFIG.gun.shellRadius,
      targetX: null, targetY: null, burstRadius: 0,
      contactDamage: CONFIG.gun.contactDamage, hits: CONFIG.gun.hits,
    };
    inner(w).resolveShell(shell, { kind: 'hitShip', victimId: 'a', x: 0, y: 0 }, inner(w).hitTargets(CONFIG.gun.hits));
    expect(inner(w).pending.some((e) => e.k === 'hc' && e.id === 'b')).toBe(true);
    expect(dmgOf(w).map((e) => e.amount)).toEqual([0]);
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.shield?.hpLeft).toBe(100 - CONFIG.gun.contactDamage);
  });
});

describe('SHIELD BLOCK — the wire (OwnShip.shield, self-private)', () => {
  it('the OWN frame carries `shield: {hp, until}` while it is up; NO other frame ever does', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 100, 0); // a sighted neighbour
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    const own = buildFrame(w, 'a');
    expect(own.you?.shield).toEqual({ hp: CONFIG.shieldBlock.hp, until: w.now + CONFIG.shieldBlock.durationMs });
    const other = buildFrame(w, 'b');
    expect(other.you).toBeDefined();
    expect('shield' in other.you!).toBe(false);
    expect(JSON.stringify({ ...other, you: undefined })).not.toContain('"shield"');
    expect(JSON.stringify({ ...own, you: undefined })).not.toContain('"shield"');
  });

  it('the key is ABSENT (never undefined) with no shield, once it is spent, and once it has lapsed', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect('shield' in buildFrame(w, 'a').you!).toBe(false);
    a.shield = { hpLeft: 30, until: w.now - 1 }; // lapsed but not yet nulled by a hit
    expect('shield' in buildFrame(w, 'a').you!).toBe(false);
    a.shield = { hpLeft: 0, until: w.now + 5000 }; // spent
    expect('shield' in buildFrame(w, 'a').you!).toBe(false);
  });

  it('the seat dies at the life boundary: a sunk captain respawns with no shield on the wire', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    expect(stockAndFire(w, a)).toEqual({ ok: true });
    w.sinkShip('a', 'b');
    expect(a.shield).toBeNull();
  });
});
