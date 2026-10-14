// THE DAMAGE GATE (Story 8.4, AR47 / D28 / placement rule 12).
//
// Hull hp has ONE door: `World.applyDamage(victim, amount, src, byId)`. Before
// Story 8.4 there were three writers — `applyStorm`, `hitShip`, `burnShip` —
// each with its own inner order, which is why the shield (8.16), the decoy
// (8.16) and "no friendly fire" would have needed three copies of one rule.
//
// This file pins the gate from two directions:
//   * BEHAVIOUR — the fixed inner order, the friendly-fire refusal for every
//     source, the shield read, and what each source emits;
//   * TEXT — world.ts is read as a string and asserted to contain exactly one
//     `victim.hp -=`, with none in the three old writers. That half is
//     complementary to the ESLint `no-restricted-syntax` rule in
//     eslint.config.js, which covers every OTHER server file but cannot be
//     scoped inside one.
//
// Also here: the hp-INCREASE whitelist (AR47's "payRepair is the only regen
// path", read as a pinned list of the legitimate `hp =` sites — since Story
// 8.8 that list is payRepair, tickRegen and applyRepair plus the life-boundary
// resets), and `tickRepairs`' weapons-safe-room decision
// (`deferred-work.md:564`).

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG, damageMultiplierFor, type DamageEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';

const WORLD_SRC = readFileSync(fileURLToPath(new URL('../game/world.ts', import.meta.url)), 'utf8');

/** Every DamageSource the union declares — the AR47 list, in AR47's order. */
const SOURCES = ['shell', 'burst', 'torpedo', 'mine', 'burn', 'storm', 'contact'] as const; // 'missile' DELETED (Story 8.15, amendment 89e)
type Src = (typeof SOURCES)[number];

/** The gate, reached directly. It is private by design (the only callers are
 *  inside world.ts); a test drives it by name, the world.test.ts idiom. */
interface Gate {
  applyDamage(victim: ShipRecord, amount: number, src: Src, byId: string | undefined): void;
}

function bareWorld(seed = 3): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x = 0, y = 0): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), 'captain', 'torpedoBoat', undefined, undefined);
  rec.state = { x, y, heading: 0, speed: 0 };
  return rec;
}

const gate = (w: World): Gate => w as unknown as Gate;
/** The events queued so far THIS tick. The gate is driven directly here (no
 *  `step()`), so `tickEvents` — last completed tick — would always be empty. */
const pend = (w: World): GameEvent[] => (w as unknown as { pending: GameEvent[] }).pending;
/** Drop the join-time `spawn` rows `addShip` queues, so a board's own setup
 *  does not read as damage output. */
const combatEvents = (w: World): GameEvent[] => pend(w).filter((e) => e.k !== 'spawn');
const dmgEvents = (w: World): DamageEvent[] =>
  pend(w).filter((e: GameEvent): e is DamageEvent => e.k === 'dmg');

// ---------------------------------------------------------------------------
// (a) NO FRIENDLY FIRE — structural, for every source
// ---------------------------------------------------------------------------

describe('applyDamage — (a) the friendly-fire refusal', () => {
  it('refuses every DamageSource whose attacker IS the victim: no hp, no ledger, no event', () => {
    for (const src of SOURCES) {
      const w = bareWorld();
      const a = place(w, 'a');
      const hp0 = a.hp;
      const dealt0 = a.damageDealt;
      gate(w).applyDamage(a, 40, src, 'a');
      expect(a.hp, src).toBe(hp0);
      expect(a.damageDealt, src).toBe(dealt0);
      expect(combatEvents(w).length, src).toBe(0);
      expect(a.lifecycle.kind, src).toBe('alive');
    }
  });

  it('a lethal self-hit cannot sink the owner — the refusal is BEFORE the sink check', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    gate(w).applyDamage(a, a.hp * 10, 'burst', 'a');
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.lifecycle.kind).toBe('alive');
  });

  it('an attacker who is NOT the victim is let through (the refusal is identity, not a blanket)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    gate(w).applyDamage(b, 10, 'shell', a.id);
    expect(b.hp).toBe(b.stats.maxHp - 10);
  });
});

// ---------------------------------------------------------------------------
// (b) the phase and sinking guards
// ---------------------------------------------------------------------------

describe('applyDamage — (b) the phase and sinking guards', () => {
  it('a weapons-safe room loses no hp, from any source', () => {
    for (const src of SOURCES) {
      const w = bareWorld();
      w.damageEnabled = false;
      const a = place(w, 'a');
      gate(w).applyDamage(a, 25, src, 'b');
      expect(a.hp, src).toBe(a.stats.maxHp);
      expect(combatEvents(w).length, src).toBe(0);
    }
  });

  it('a hull inside the sinking window cannot be finished off (amendment 12)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    w.sinkShip('a', 'b');
    expect(a.lifecycle.kind).toBe('sinking');
    const before = pend(w).length;
    gate(w).applyDamage(a, 999, 'burst', 'b');
    expect(a.hp).toBe(0);
    expect(pend(w).length).toBe(before); // no dmg, no second sunk
  });
});

// ---------------------------------------------------------------------------
// (c) the shield step
// ---------------------------------------------------------------------------

describe('applyDamage — (c) the shield (Story 8.16 arms it; the gate READS it)', () => {
  it('is null on a fresh hull, and ONLY the SHIELD BLOCK row ever sets it (Story 8.16)', () => {
    const w = bareWorld();
    expect(place(w, 'a').shield).toBeNull();
    // The gate is the one reader. Every write in world.ts assigns `null` — two
    // expiries inside absorbShield plus the three LIFE BOUNDARIES (sinkShip,
    // redeployShip, respawn) that P5 added — EXCEPT the ONE grant: the
    // `setShield` capability inside activationContext (Story 8.16).
    const writes = WORLD_SRC.match(/\.shield = .*/g) ?? [];
    expect(writes).toHaveLength(6);
    expect(writes.filter((w2) => w2 === '.shield = null;')).toHaveLength(5);
    const grants = writes.filter((w2) => w2 !== '.shield = null;');
    expect(grants).toEqual(['.shield = { hpLeft: shield.hpLeft, until: shield.until };']);
    expect(methodBody('activationContext')).toContain('setShield: (shield) => {');
    expect(methodBody('activationContext')).toContain(grants[0]);
    // ...and the capability has exactly ONE caller in the whole game: the
    // SHIELD BLOCK consumable row.
    const gameDir = resolve(dirname(fileURLToPath(import.meta.url)), '../game');
    const callers = readdirSync(gameDir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts'))
      .filter((f) => /\bsetShield\(/.test(readFileSync(join(gameDir, f), 'utf8')));
    expect(callers).toEqual([join('equipment', 'consumables', 'shieldBlock.ts')]);
  });

  it('DIES AT EVERY LIFE BOUNDARY: sinkShip, redeployShip and respawn all null it (P5)', () => {
    // An absorbing pool is economy, and a fresh life inherits no economy. The
    // reset is written while nothing GRANTS a shield precisely because the
    // boundary becomes invisible once Story 8.16 arms it.
    const inner = (w: World): {
      redeployShip(ship: ShipRecord, placed: { x: number; y: number }[], hold?: boolean): void;
      respawn(ship: ShipRecord): void;
    } => w as never;

    const sunk = bareWorld();
    const s = place(sunk, 'a');
    s.shield = { hpLeft: 40, until: sunk.now + 5000 };
    sunk.sinkShip('a', 'b');
    expect(s.shield).toBeNull();

    const red = bareWorld();
    const r = place(red, 'a');
    r.shield = { hpLeft: 40, until: red.now + 5000 };
    inner(red).redeployShip(r, [{ x: 0, y: 0 }]);
    expect(r.shield).toBeNull();

    const res = bareWorld();
    const p = place(res, 'a');
    res.sinkShip('a', 'b');
    p.shield = { hpLeft: 40, until: res.now + 5000 }; // granted mid-death window
    inner(res).respawn(p);
    expect(p.shield).toBeNull();
  });

  it('absorbs first, and a partly-absorbed hit puts only the REMAINDER on the hull', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 20, until: w.now + 5000 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toBeNull(); // spent
    expect(a.hp).toBe(a.stats.maxHp - 10);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([10]); // the event reports the remainder
  });

  it('a FULLY absorbed hit still runs the gate to the end (AR47): shield drops, hp untouched, dmg 0', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 50, until: w.now + 5000 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toEqual({ hpLeft: 20, until: w.now + 5000 });
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([0]);
  });

  it('expires at `until` and absorbs nothing after it', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.shield = { hpLeft: 50, until: w.now - 1 };
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toBeNull();
    expect(a.hp).toBe(a.stats.maxHp - 30);
  });

  it('absorbs from EVERY source, storm and burn included (Eric)', () => {
    for (const src of ['storm', 'burn', 'mine', 'torpedo'] as const) {
      const w = bareWorld();
      const a = place(w, 'a');
      a.shield = { hpLeft: 100, until: w.now + 5000 };
      gate(w).applyDamage(a, 30, src, src === 'storm' ? undefined : 'b');
      expect(a.hp, src).toBe(a.stats.maxHp);
      expect(a.shield?.hpLeft, src).toBe(70);
    }
  });
});

// ---------------------------------------------------------------------------
// (b′) THE DAMAGE CUT — Story 8.15, the Battleship's Shift (amendments 99–102).
// Re-based by Story 9.7 (epic-9 amendments 86–88 / 110–117): the cut is no
// longer a flat factor but +armorBonus temporary Armor inside K / (K + armor);
// every hull here is at Tier 0, so the cut reads Armor 5 → ×0.5 and today's
// numbers hold.
// ---------------------------------------------------------------------------

describe('applyDamage — (b′) the DAMAGE CUT, before the shield (Story 8.15)', () => {
  /** A Battleship with its cut open for the full window. */
  function cutShip(w: World, id = 'a'): ShipRecord {
    const rec = w.addShip(id, id.toUpperCase(), 'captain', 'battleship', undefined, undefined);
    rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
    rec.damageCutUntil = w.now + CONFIG.damageCut.durationMs;
    return rec;
  }

  it('a 15 hp shell deals 7, a 55 hp mine 27 (Tier 0 under the cut: Armor 5 → ×0.5, ROUNDED DOWN — amendment 102), and the tally reads the post-cut amount', () => {
    const w = bareWorld();
    const a = cutShip(w);
    const b = place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 7);
    gate(w).applyDamage(a, 55, 'mine', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 7 - 27);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([7, 27]); // the report is what landed
    expect(b.damageDealt).toBe(34); // the attacker's tally is what landed, never the nominal blow
    expect(a.lastDamagedAt).toBe(w.now); // the combat clock still stamps
  });

  it('a PHOSPHOR burn tick takes Armor 5 → ×0.5 EXACTLY (0.25 -> 0.125), never floored to nothing', () => {
    const w = bareWorld();
    const a = cutShip(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 0.25, 'burn', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.125, 12);
  });

  it('a STORM bite lands in FULL while the cut is up (amendment 101)', () => {
    const w = bareWorld();
    const a = cutShip(w);
    gate(w).applyDamage(a, 10, 'storm', undefined);
    expect(a.hp).toBe(a.stats.maxHp - 10);
  });

  it('every WEAPON source is cut (Armor 5 → ×0.5): shell, burst, torpedo, mine, contact floor; burn exact', () => {
    for (const src of SOURCES) {
      if (src === 'storm' || src === 'burn') continue;
      const w = bareWorld();
      const a = cutShip(w);
      place(w, 'b', 400, 0);
      gate(w).applyDamage(a, 25, src, 'b');
      expect(a.hp, src).toBe(a.stats.maxHp - 12); // 25 × 0.5 = 12.5 -> 12
    }
    const w = bareWorld();
    const a = cutShip(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 25, 'burn', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 12.5, 12); // a burn tick keeps its half
  });

  it('THE CUT COMES BEFORE THE SHIELD (amendment 100): shield 100, a 30 hp torpedo -> 15 reaches the shield, 85 left, 0 dealt', () => {
    const w = bareWorld();
    const a = cutShip(w);
    place(w, 'b', 400, 0);
    a.shield = { hpLeft: 100, until: w.now + 5000 }; // a stubbed block (8.16 arms the real one)
    gate(w).applyDamage(a, 30, 'torpedo', 'b');
    expect(a.shield).toEqual({ hpLeft: 85, until: w.now + 5000 });
    expect(a.hp).toBe(a.stats.maxHp);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([0]);
  });

  it('after the window closes the blow lands in full again — the boundary is `now < damageCutUntil`', () => {
    const w = bareWorld();
    const a = cutShip(w);
    place(w, 'b', 400, 0);
    a.damageCutUntil = w.now; // exactly at the deadline: closed
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 15);
  });

  it('a hull with no cut opened (damageCutUntil 0) takes full damage', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    expect(a.damageCutUntil).toBe(0);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 15);
  });

  it('DIES AT EVERY LIFE BOUNDARY beside boostUntil: founder, redeployShip and respawn zero it', () => {
    const inner = (w: World): {
      redeployShip(ship: ShipRecord, placed: { x: number; y: number }[], hold?: boolean): void;
      respawn(ship: ShipRecord): void;
    } => w as never;

    const sunk = bareWorld();
    sunk.respawnEnabled = false;
    const s = cutShip(sunk);
    sunk.sinkShip('a', 'b');
    sunk.step(CONFIG.ship.sinkingWindowMs); // the founder edge
    expect(s.lifecycle.kind).toBe('sunk');
    expect(s.damageCutUntil).toBe(0);

    const red = bareWorld();
    const r = cutShip(red);
    inner(red).redeployShip(r, [{ x: 0, y: 0 }]);
    expect(r.damageCutUntil).toBe(0);

    const res = bareWorld();
    const p = cutShip(res);
    res.sinkShip('a', 'b');
    p.damageCutUntil = res.now + 8000; // opened mid-death window
    inner(res).respawn(p);
    expect(p.damageCutUntil).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (b′) THE ARMOR MULTIPLY — Story 9.7 (Eric 2026-10-13, epic-9 amendments
// 86–88 / 110–117; the floor / fraction / storm rules from epic-8 amendments
// 100–102). Every source but the storm × damageMultiplierFor(armor + the
// cut's bonus while open), before the shield; blows floor, burn/grind exact.
// ---------------------------------------------------------------------------

describe('applyDamage — (b′) ARMOR, before the shield (Story 9.7)', () => {
  /** The gate with the full DamageSource union, 'grind' included. */
  interface FullGate {
    applyDamage(victim: ShipRecord, amount: number, src: Src | 'grind', byId: string | undefined): void;
  }
  const fullGate = (w: World): FullGate => w as unknown as FullGate;

  /** Fit `n` ARMOR cards through the real pick path. */
  function armored(w: World, rec: ShipRecord, n: number): ShipRecord {
    for (let i = 0; i < n; i++) w.applyCard(rec, 'armor');
    return rec;
  }

  /** A Battleship at ARMOR Tier V with its cut open. */
  function cutTierV(w: World): ShipRecord {
    const rec = w.addShip('a', 'A', 'captain', 'battleship', undefined, undefined);
    rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
    armored(w, rec, 5);
    rec.damageCutUntil = w.now + CONFIG.damageCut.durationMs;
    return rec;
  }

  it('the helper and the fold agree: damageMultiplierFor(stats.armor) === stats.damageMultiplier at every tier', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    for (let n = 0; n <= 5; n++) {
      expect(a.stats.armor, `tier ${n}`).toBe(n);
      expect(damageMultiplierFor(a.stats.armor), `tier ${n}`).toBe(a.stats.damageMultiplier);
      if (n < 5) w.applyCard(a, 'armor');
    }
  });

  it.each([
    [0, 15],
    [1, 12],
    [2, 10],
    [3, 9],
    [4, 8],
    [5, 7],
  ])('ARMOR %i: a 15 hp shell deals floor(15 × 5/(5+n)) = %i, and the dmg report matches', (n, expected) => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), n);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - expected);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([expected]);
  });

  it('at Tier V the dmg report and the attacker tally read the POST-multiply figure (15 -> 7)', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    const b = place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([7]);
    expect(b.damageDealt).toBe(7);
  });

  it('the cut at Tier 0 is Armor 5 → ×0.5: a 15 hp shell deals 7', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'battleship', undefined, undefined);
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    a.damageCutUntil = w.now + CONFIG.damageCut.durationMs;
    place(w, 'b', 400, 0);
    expect(a.stats.armor).toBe(0);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 7);
  });

  it('the cut STACKS on the ladder additively: Tier V + cut is Armor 10 → a 50 hp torpedo deals 16', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 50, 'torpedo', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 16);
  });

  // THE EXACT RATIO (review gate 2026-10-13, epic-9 amendment 120(a)): a
  // rounded multiplier (0.833 for 5/6, 0.333 for 1/3) floored every blow whose
  // exact product is whole a point low. Each row below fails under round3.
  it('EXACT RATIO: a 6 hp shell at Armor 1 deals 5 (6 × 5/6), not 4', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 6, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 5);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([5]);
  });

  it('EXACT RATIO: a 15 hp shell on a Battleship at Tier V with the cut open (Armor 10) deals 5 (15 × 1/3), not 4', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    place(w, 'b', 400, 0);
    expect(a.stats.armor + CONFIG.damageCut.armorBonus).toBe(10);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 5);
  });

  it('EXACT RATIO: a 12 hp burst at Armor 1 deals 10 (12 × 5/6), not 9', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 12, 'burst', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 10);
  });

  // THE FLOOR OF ONE (epic-9 amendment 119, Eric 2026-10-13 at the 9.7 review
  // gate): a whole blow that was at least 1 hp lands at least 1 — the PvE
  // drones' 1 hp shells and a slow ram bump no longer floor to a silent 0.
  it('FLOOR OF ONE: a 1 hp shell at Armor 1 deals 1, reports dmg 1 and stamps the combat clock', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    a.lastDamagedAt = -1; // addShip seeds it to now; clear it so the stamp is visible
    gate(w).applyDamage(a, 1, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 1);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([1]);
    expect(a.lastDamagedAt).toBe(w.now);
  });

  it('FLOOR OF ONE: a 1 hp contact at Tier V with the cut open (Armor 10) deals 1', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 1, 'contact', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 1);
  });

  it('FLOOR OF ONE is for WHOLE blows only: a 0.5 hp burn tick at Armor 1 deals exactly 0.5 × 5/6, never raised to 1', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 0.5, 'burn', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.5 * (5 / 6), 12);
  });

  it('FLOOR OF ONE is a no-op at ×1: a 1 hp shell at Armor 0 with no cut deals 1', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    expect(a.stats.armor).toBe(0);
    gate(w).applyDamage(a, 1, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 1);
  });

  it('a 0.5 hp BURN tick at Tier V applies 0.25 exactly — never floored', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 0.5, 'burn', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.25, 12);
  });

  it('a 0.2 hp GRIND tick at Armor 2 applies the exact product — never floored', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 2);
    place(w, 'b', 400, 0);
    fullGate(w).applyDamage(a, 0.2, 'grind', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.2 * damageMultiplierFor(2), 12);
    expect(a.stats.maxHp - a.hp).toBeGreaterThan(0);
  });

  it('a 3 hp STORM bite at Tier V with the cut open lands in full', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    gate(w).applyDamage(a, 3, 'storm', undefined);
    expect(a.hp).toBe(a.stats.maxHp - 3);
  });

  it('the SHIELD absorbs the POST-multiply amount: shield 20, a 30 hp shell at Tier V -> 15 absorbed, hp and combat clock untouched', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    place(w, 'b', 400, 0);
    a.shield = { hpLeft: 20, until: w.now + 5000 };
    const clock0 = a.lastDamagedAt;
    gate(w).applyDamage(a, 30, 'shell', 'b');
    expect(a.shield).toEqual({ hpLeft: 5, until: w.now + 5000 });
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.lastDamagedAt).toBe(clock0);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([0]);
  });

  it('OVERKILL at Tier V: 1 hp left, a 50 hp blow -> 25 post-multiply, 1 dealt; the assist share is 1, the results tally 25', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    const b = place(w, 'b', 400, 0);
    a.hp = 1;
    const ledger = vi.spyOn(a.damageFrom, 'set'); // the sink clears the ledger, so watch the write
    gate(w).applyDamage(a, 50, 'shell', 'b');
    expect(a.hp).toBe(0);
    expect(ledger.mock.calls.map(([by, row]) => [by, row.amount])).toEqual([['b', 1]]); // what the hull could absorb (Eric 2026-08-22)
    expect(b.damageDealt).toBe(25); // the results tally: post-multiply, pre-clamp (the OVERKILL test above)
  });

  it('a SELF-HIT is refused before the multiply: no hp, no shield, no event, armored or not', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    a.shield = { hpLeft: 20, until: w.now + 5000 };
    gate(w).applyDamage(a, 30, 'shell', 'a');
    expect(a.hp).toBe(a.stats.maxHp);
    expect(a.shield).toEqual({ hpLeft: 20, until: w.now + 5000 });
    expect(combatEvents(w)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (d)-(g) the rest of the fixed order
// ---------------------------------------------------------------------------

describe('applyDamage — (d)-(g) hp, ledger, sink and the per-source report', () => {
  it('OVERKILL NEVER PAYS: the assist share is clamped to what the hull could absorb', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    b.hp = 5;
    gate(w).applyDamage(b, 50, 'burst', 'a');
    // The results-screen tally still counts the NOMINAL blow...
    expect(a.damageDealt).toBe(50);
    // ...while the hull floors at 0 rather than dipping negative, and sinks.
    expect(b.hp).toBe(0);
    expect(b.lifecycle.kind).toBe('sinking');
  });

  it("STORM: hp falls, NO dmg event, NO assist credit, and the sink has no killer", () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    a.hp = 2;
    gate(w).applyDamage(a, 10, 'storm', undefined);
    expect(a.hp).toBe(0);
    expect(dmgEvents(w)).toHaveLength(0);
    expect(b.damageDealt).toBe(0);
    const sunk = pend(w).find((e) => e.k === 'sunk');
    expect(sunk).toEqual({ k: 'sunk', id: 'a', by: undefined });
  });

  it('BURN banks into the DoT window instead of emitting per tick, and flushes BEFORE the sink', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 3, 'burn', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 3);
    expect(dmgEvents(w)).toHaveLength(0); // windowed, not per tick
    a.hp = 1;
    gate(w).applyDamage(a, 5, 'burn', 'b');
    const kinds = combatEvents(w).map((e) => e.k);
    expect(kinds.indexOf('dmg')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('dmg')).toBeLessThan(kinds.indexOf('sunk')); // dmg BEFORE sunk
  });

  it('every other source emits the immediate victim-private dmg, then sinks', () => {
    for (const src of ['shell', 'burst', 'torpedo', 'mine', 'contact'] as const) {
      const w = bareWorld();
      const a = place(w, 'a');
      place(w, 'b', 400, 0);
      a.hp = 1;
      gate(w).applyDamage(a, 7, src, 'b');
      const kinds = combatEvents(w).map((e) => e.k);
      expect(kinds[0], src).toBe('dmg');
      expect(kinds, src).toContain('sunk');
    }
  });
});

// ---------------------------------------------------------------------------
// THE TEXT PINS
// ---------------------------------------------------------------------------

/** The body of a named private method in world.ts, brace-matched from its
 *  signature — enough to assert "this function contains no hp decrement". */
function methodBody(name: string): string {
  const start = WORLD_SRC.indexOf(`private ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = WORLD_SRC.indexOf('{', start); i < WORLD_SRC.length; i += 1) {
    if (WORLD_SRC[i] === '{') depth += 1;
    else if (WORLD_SRC[i] === '}') {
      depth -= 1;
      if (depth === 0) return WORLD_SRC.slice(start, i + 1);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

describe('the grep pin — exactly one hull-hp decrement', () => {
  it('world.ts contains exactly ONE `victim.hp -=`, and it is inside applyDamage', () => {
    // Only the CODE line counts; the doc comment above the gate names it too.
    const code = WORLD_SRC.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    const decrements = code.filter((l) => /victim\.hp\s*-=/.test(l));
    expect(decrements).toHaveLength(1);
    expect(methodBody('applyDamage')).toContain('victim.hp -= dealt');
  });

  it('the three old writers contain NO hp decrement of any kind', () => {
    for (const name of ['applyStorm', 'hitShip', 'burnShip']) {
      expect(methodBody(name), name).not.toMatch(/\.hp\s*-=/);
    }
  });

  it('`decoy.hp -=` and `mine.hp -=` are the TWO non-hull decrements, exactly one of each (Story 8.16; amendment 200)', () => {
    const code = WORLD_SRC.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    expect(code.filter((l) => /\.hp\s*-=/.test(l)).map((l) => l.trim())).toEqual([
      'victim.hp -= dealt; // (d) THE ONE HULL-HP DECREMENT IN THE GAME',
      'mine.hp -= amount;',
      'decoy.hp -= amount;',
    ]);
    expect(methodBody('damageDecoy')).toContain('decoy.hp -= amount;');
    expect(methodBody('damageMine')).toContain('mine.hp -= amount;');
  });
});

describe('the hp-INCREASE whitelist (AR47 read as "the only REGEN path")', () => {
  it('every `ship.hp =` / `+=` in world.ts is one of the pinned sites', () => {
    const code = WORLD_SRC.split('\n')
      .map((l) => l.trim())
      .filter((l) => !l.startsWith('*') && !l.startsWith('//'))
      .filter((l) => /\b(ship|victim)\.hp\s*(\+?)=[^=]/.test(l));
    expect(code).toEqual([
      // redeployShip — the match boundary resets the hull outright.
      'ship.hp = ship.stats.maxHp;',
      // sinkShip — the wreck is zeroed.
      'ship.hp = 0;',
      // applyCard — heal-on-grant, then the post-fold clamp to the new maxHp.
      'ship.hp = Math.min(ship.hp + delta, ship.stats.maxHp);',
      'ship.hp = Math.min(ship.hp, ship.stats.maxHp);',
      // payRepair — the PAID HULL REPAIR pool's drain.
      'ship.hp = Math.min(ship.hp + paid, ship.stats.maxHp);',
      // tickRegen — the OUT-OF-COMBAT regen (amendment 46): the snap to full
      // on the SHARED full-hull predicate (amendment 53 — under 1 hp missing,
      // the same word the HULL REPAIR row refuses on), then the hull's own
      // %-of-missing-per-second trickle (stats.regen, Story 9.6).
      'if (hullIsFull(ship.hp, maxHp)) ship.hp = maxHp;',
      'else ship.hp += missing * ship.stats.regen.missingPctPerS * (dtMs / 1000);',
      // applyRepair — HULL REPAIR's instant half, reached ONLY through
      // ActivationContext.applyRepair (Story 8.8).
      'ship.hp = Math.min(ship.hp + instantHp, ship.stats.maxHp);',
      // respawn — the second full reset.
      'ship.hp = ship.stats.maxHp;',
    ]);
  });

  it('payRepair never runs inside the gate', () => {
    expect(methodBody('applyDamage')).not.toContain('payRepair');
  });
});

// ---------------------------------------------------------------------------
// tickRepairs in the weapons-safe room (`deferred-work.md:564`) — DECIDED HERE
// ---------------------------------------------------------------------------

describe('tickRepairs stays UN-gated on damageEnabled (Story 8.4 decision, ledgered)', () => {
  it('a damage-control pool still drains in a weapons-safe room — and there is nothing there to heal FROM', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = place(w, 'a');
    a.hp = a.stats.maxHp - 20;
    a.repairHp = 20;
    w.step(CONFIG.tick.simDtMs);
    // It heals. That is the pinned decision, not an oversight: nothing can
    // damage a hull while damageEnabled is false (the gate's own step (b)), so
    // an open pool in the ready room can only be one a captain paid for
    // BEFORE the phase changed, and gating it would put a phase read on the
    // one repair path. (The OUT-OF-COMBAT regen reaches the same room on the
    // same reasoning — nothing there can have hurt anyone.)
    expect(a.hp).toBeGreaterThan(a.stats.maxHp - 20);
    expect(a.repairHp).toBeLessThan(20);
  });

  it('and the gate really does refuse damage in that same room, so the two can never disagree', () => {
    const w = bareWorld();
    w.damageEnabled = false;
    const a = place(w, 'a');
    gate(w).applyDamage(a, 50, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp);
  });
});
