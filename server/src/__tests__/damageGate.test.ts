// THE DAMAGE GATE (Story 8.4, AR47 / D28 / placement rule 12).
//
// Hull hp has ONE door: `World.applyDamage(victim, amount, src, byId)`. Before
// Story 8.4 there were three writers — `applyStorm`, `hitShip`, `burnShip` —
// each with its own inner order, which is why the shield (8.16), the decoy
// (8.16) and "no friendly fire" would have needed three copies of one rule.
//
// This file pins the gate from two directions:
//   * BEHAVIOUR — the fixed inner order, the friendly-fire refusal for every
//     source, and what each source emits;
//   * TEXT — world.ts is read as a string and asserted to contain exactly one
//     `victim.hp -=`, with none in the three old writers. That half is
//     complementary to the ESLint `no-restricted-syntax` rule in
//     eslint.config.js, which covers every OTHER server file but cannot be
//     scoped inside one.
//
// 2026-11-05 (Story 10.5, epic-10 amendment 11): the SHIELD BLOCK and the
// SHIELD BUOY are DELETED, so the gate's (c) shield step and every shield pin
// left this file; the decoy's non-hull decrement left with the decoy. The
// passive regen is BACK (R8) — its contract lives in regen.test.ts, and its
// one hp write joins the whitelist below.
//
// Also here: the hp-INCREASE whitelist (AR47's "payRepair is the only regen
// path", read as a pinned list of the legitimate `hp =` sites — since Story
// 8.8 that list is payRepair, tickRegen and applyRepair plus the life-boundary
// resets — tickRegen renamed tickHeal by Story 10.3), and `tickRepairs`'
// weapons-safe-room decision (`deferred-work.md:564`).
//
// 2026-11-04 (Story 10.3, Eric, epic-10 amendment 8 — "passive healing
// dies"): `regen.test.ts` (the OUT-OF-COMBAT regen's wait, shape, combat-clock
// reset, per-hull ladder, who-regens and silence pins) is DELETED with the
// regen itself and `CONFIG.regen`. What survives of it lives here: the combat
// clock stamp (the (d) step pins below), "tickRepairs stays UN-gated" for the
// HULL REPAIR pool, and the new "no out-of-combat regen" pin; the healing
// buoy's term is pinned in buoyEffects.test.ts.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CONFIG, damageMultiplierFor, type DamageEvent, type GameEvent } from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { flatRaster } from './islandFixture.js';
import { neutralize } from './deckGunFixture.js';

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
  // NEUTRAL index (deckGunFixture, Story 10.4): the gate's arithmetic reads exact figures.
  const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', 'bismarck', undefined, undefined));
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
// (b′) THE HUNKER (was DAMAGE CUT until Story 9.9) — Story 8.15, the Battleship's Shift (amendments 99–102).
// Re-based by Story 9.7 (epic-9 amendments 86–88 / 110–117): the cut is no
// longer a flat factor but +armorBonus temporary Armor inside K / (K + armor);
// every hull here is at Tier 0, so the cut reads Armor 5 → ×0.5 and today's
// numbers hold. Rescaled by Story 9.9 (epic-9 amendment 144): K 100, HUNKER
// +100 — E 100 → still ×0.5, every number below unchanged.
// ---------------------------------------------------------------------------

describe('applyDamage — (b′) the HUNKER (Story 8.15)', () => {
  /** A Battleship with its cut open for the full window. */
  function cutShip(w: World, id = 'a'): ShipRecord {
    const rec = neutralize(w.addShip(id, id.toUpperCase(), 'captain', 'yamato', undefined, undefined));
    rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
    rec.hunkerUntil = w.now + CONFIG.hunker.durationMs;
    return rec;
  }

  it('a 15 hp shell deals 7, a 55 hp mine 27 (Tier 0 under the cut: E 100 → ×0.5, ROUNDED DOWN — amendments 102 / 144), and the tally reads the post-cut amount', () => {
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

  it('a PHOSPHOR burn tick takes E 100 → ×0.5 EXACTLY (0.25 -> 0.125), never floored to nothing', () => {
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

  it('every WEAPON source is cut (E 100 → ×0.5, amendment 144): shell, burst, torpedo, mine, contact floor; burn exact', () => {
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

  it('after the window closes the blow lands in full again — the boundary is `now < hunkerUntil`', () => {
    const w = bareWorld();
    const a = cutShip(w);
    place(w, 'b', 400, 0);
    a.hunkerUntil = w.now; // exactly at the deadline: closed
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 15);
  });

  it('a hull with no cut opened (hunkerUntil 0) takes full damage', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    place(w, 'b', 400, 0);
    expect(a.hunkerUntil).toBe(0);
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
    expect(s.hunkerUntil).toBe(0);

    const red = bareWorld();
    const r = cutShip(red);
    inner(red).redeployShip(r, [{ x: 0, y: 0 }]);
    expect(r.hunkerUntil).toBe(0);

    const res = bareWorld();
    const p = cutShip(res);
    res.sinkShip('a', 'b');
    p.hunkerUntil = res.now + 8000; // opened mid-death window
    inner(res).respawn(p);
    expect(p.hunkerUntil).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (b′) THE ARMOR MULTIPLY — Story 9.7 (Eric 2026-10-13, epic-9 amendments
// 86–88 / 110–117; the floor / fraction / storm rules from epic-8 amendments
// 100–102). Every source but the storm × damageMultiplierFor(armor + the
// cut's bonus while open), blows floor, burn/grind exact.
// Rescaled by Story 9.9 (epic-9 amendment 144): K 100, +20 per ARMOR card,
// HUNKER +100 — 100/(100+20n) = 5/(5+n), so every 9.7 number below is
// reproduced exactly; only the Armor VALUES the rows name moved (×20).
// ---------------------------------------------------------------------------

describe('applyDamage — (b′) ARMOR (Story 9.7)', () => {
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
    const rec = neutralize(w.addShip('a', 'A', 'captain', 'yamato', undefined, undefined));
    rec.state = { x: 0, y: 0, heading: 0, speed: 0 };
    armored(w, rec, 5);
    rec.hunkerUntil = w.now + CONFIG.hunker.durationMs;
    return rec;
  }

  it('the helper and the fold agree: damageMultiplierFor(armor − base) === stats.damageMultiplier at every tier (the published, average-attacker number)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const seed = a.stats.armor;
    for (let n = 0; n <= 5; n++) {
      expect(a.stats.armor - seed, `tier ${n}`).toBe(20 * n); // +20 per card (amendment 144; ruling 4)
      expect(damageMultiplierFor(a.stats.armor - CONFIG.index.base), `tier ${n}`).toBe(a.stats.damageMultiplier);
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
  ])('ARMOR Tier %i: a 15 hp shell deals floor(15 × K/(K+20n)) = %i — 9.7\'s number reproduced (amendment 144) — and the dmg report matches', (n, expected) => {
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

  it('the cut STACKS on the ladder additively: Tier V + cut is E 200 → a 50 hp torpedo deals 16 (amendment 144)', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 50, 'torpedo', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 16);
  });

  // THE EXACT RATIO (review gate 2026-10-13, epic-9 amendment 120(a)): a
  // rounded multiplier (0.833 for 5/6, 0.333 for 1/3) floored every blow whose
  // exact product is whole a point low. Each row below fails under round3.
  it('EXACT RATIO: a 6 hp shell at ARMOR Tier I (Armor 20) deals 5 (6 × 5/6), not 4', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 6, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 5);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([5]);
  });

  it('EXACT RATIO: a 15 hp shell on a Battleship at Tier V with the cut open (E 200) deals 5 (15 × 1/3), not 4', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    const b = place(w, 'b', 400, 0);
    // Tier V +100 over the attacker's POWER + HUNKER 100 (amendment 144; the
    // indices since Story 10.3 — E is victim ARMOR + bonus − attacker POWER).
    expect(a.stats.armor + CONFIG.hunker.armorBonus - b.stats.power).toBe(200);
    gate(w).applyDamage(a, 15, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 5);
  });

  it('EXACT RATIO: a 12 hp burst at ARMOR Tier I (Armor 20) deals 10 (12 × 5/6), not 9', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 12, 'burst', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 10);
  });

  // THE FLOOR OF ONE (epic-9 amendment 119, Eric 2026-10-13 at the 9.7 review
  // gate): a whole blow that was at least 1 hp lands at least 1 — the PvE
  // drones' 1 hp shells and a slow ram bump no longer floor to a silent 0.
  it('FLOOR OF ONE: a 1 hp shell at ARMOR Tier I deals 1, reports dmg 1 and stamps the combat clock', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    a.lastDamagedAt = -1; // addShip seeds it to now; clear it so the stamp is visible
    gate(w).applyDamage(a, 1, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 1);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([1]);
    expect(a.lastDamagedAt).toBe(w.now);
  });

  it('FLOOR OF ONE: a 1 hp contact at Tier V with the cut open (E 200) deals 1', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 1, 'contact', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 1);
  });

  it('FLOOR OF ONE is for WHOLE blows only: a 0.5 hp burn tick at ARMOR Tier I deals exactly 0.5 × 5/6, never raised to 1', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 1);
    place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 0.5, 'burn', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.5 * (5 / 6), 12);
  });

  it('FLOOR OF ONE is a no-op at ×1: a 1 hp shell at E 0 (victim ARMOR = attacker POWER) with no cut deals 1', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    expect(a.stats.armor - b.stats.power).toBe(0);
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

  it('a 0.2 hp GRIND tick at ARMOR Tier II applies the exact product — never floored', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 2);
    const b = place(w, 'b', 400, 0);
    fullGate(w).applyDamage(a, 0.2, 'grind', 'b');
    expect(a.hp).toBeCloseTo(a.stats.maxHp - 0.2 * damageMultiplierFor(a.stats.armor - b.stats.power), 12);
    expect(a.stats.maxHp - a.hp).toBeGreaterThan(0);
  });

  it('a 3 hp STORM bite at Tier V with the cut open lands in full', () => {
    const w = bareWorld();
    const a = cutTierV(w);
    gate(w).applyDamage(a, 3, 'storm', undefined);
    expect(a.hp).toBe(a.stats.maxHp - 3);
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

  it('a SELF-HIT is refused before the multiply: no hp, no event, armored or not', () => {
    const w = bareWorld();
    const a = armored(w, place(w, 'a'), 5);
    gate(w).applyDamage(a, 30, 'shell', 'a');
    expect(a.hp).toBe(a.stats.maxHp);
    expect(combatEvents(w)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b′) ARMOR PIERCING — Story 9.9 (Eric 2026-10-14/15, epic-9 amendments
// 144–147 / 156). E = victim Armor + HUNKER bonus − the ATTACKER's
// power (`armorPiercing` until Story 10.3), read LIVE at impact from the `byId` record; the curve's
// negative branch (K − 2E)/(K − E) amplifies, bounded under ×2. Every source
// but the storm; the coast, a wreck and a departed owner read AP 0.
// ---------------------------------------------------------------------------

describe('applyDamage — (b′) POWER (was ARMOR PIERCING), the attacker read live (Stories 9.9 / 10.3)', () => {
  interface FullGate {
    applyDamage(victim: ShipRecord, amount: number, src: Src | 'grind', byId: string | undefined): void;
  }
  const fullGate = (w: World): FullGate => w as unknown as FullGate;

  /** Fit `n` cards of `line` through the real pick path. */
  function carded(w: World, rec: ShipRecord, line: 'armor' | 'power', n: number): ShipRecord {
    for (let i = 0; i < n; i++) w.applyCard(rec, line);
    return rec;
  }

  it('a POWER-capped attacker on a BARE hull: E −100, a 12 hp shell lands 18 (×1.5); the dmg report and the attacker tally read 18 (amendments 113 / 146)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = carded(w, place(w, 'b', 400, 0), 'power', 5);
    expect(a.stats.armor - b.stats.power).toBe(-100); // five +20 POWER cards over an equal seed
    gate(w).applyDamage(a, 12, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 18);
    expect(dmgEvents(w).map((e) => e.amount)).toEqual([18]);
    expect(b.damageDealt).toBe(18);
  });

  it('ONE card of piercing on a bare hull: a 12 hp shell lands exactly 14 (12 × 7/6 — the whole product, amendment 120(a))', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    carded(w, place(w, 'b', 400, 0), 'power', 1);
    gate(w).applyDamage(a, 12, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 14);
  });

  it('CANCELLED OUT: three ARMOR cards vs three POWER cards is E 0 — a 12 hp shell lands 12', () => {
    const w = bareWorld();
    const a = carded(w, place(w, 'a'), 'armor', 3);
    const b = carded(w, place(w, 'b', 400, 0), 'power', 3);
    expect(a.stats.armor - b.stats.power).toBe(0);
    gate(w).applyDamage(a, 12, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 12);
  });

  it('a pierced HUNKER: Tier V + HUNKER (200) vs AP 100 is E 100 — a 12 hp shell lands 6', () => {
    const w = bareWorld();
    const a = neutralize(w.addShip('a', 'A', 'captain', 'yamato', undefined, undefined));
    a.state = { x: 0, y: 0, heading: 0, speed: 0 };
    carded(w, a, 'armor', 5);
    a.hunkerUntil = w.now + CONFIG.hunker.durationMs;
    carded(w, place(w, 'b', 400, 0), 'power', 5);
    gate(w).applyDamage(a, 12, 'shell', 'b');
    expect(a.hp).toBe(a.stats.maxHp - 6);
  });

  it('every WEAPON source carries the piercing (amendment 147): shell, burst, torpedo, mine, contact at E −100 → 12 × 1.5', () => {
    for (const src of SOURCES) {
      if (src === 'storm' || src === 'burn') continue;
      const w = bareWorld();
      const a = place(w, 'a');
      carded(w, place(w, 'b', 400, 0), 'power', 5);
      gate(w).applyDamage(a, 12, src, 'b');
      expect(a.stats.maxHp - a.hp, src).toBe(18);
    }
  });

  it('a 0.5 hp BURN tick at E −100 lands 0.75 EXACTLY and banks into the DoT window (no immediate dmg)', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    carded(w, place(w, 'b', 400, 0), 'power', 5);
    gate(w).applyDamage(a, 0.5, 'burn', 'b');
    expect(a.stats.maxHp - a.hp).toBe(0.75);
    expect(dmgEvents(w)).toEqual([]); // banked, not emitted per tick
    const buckets = (w as unknown as { dotBuckets: Map<string, { amount: number }> }).dotBuckets;
    expect([...buckets.values()].map((bk) => bk.amount)).toEqual([0.75]);
  });

  it('a 0.2 hp GRIND tick at E −20 applies the exact 7/6 product — never floored, never raised to 1', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    carded(w, place(w, 'b', 400, 0), 'power', 1);
    fullGate(w).applyDamage(a, 0.2, 'grind', 'b');
    expect(a.stats.maxHp - a.hp).toBeCloseTo(0.2 * (7 / 6), 12);
    expect(a.stats.maxHp - a.hp).toBeCloseTo(0.2 * damageMultiplierFor(-20), 12);
  });

  it('the STORM is exempt at any armor and piercing (amendment 101): a 3 hp bite lands 3, even named against a piercer', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    carded(w, place(w, 'b', 400, 0), 'power', 5);
    gate(w).applyDamage(a, 3, 'storm', undefined);
    gate(w).applyDamage(a, 3, 'storm', 'b'); // the early return precedes the attacker read
    expect(a.stats.maxHp - a.hp).toBe(6);
    const v = carded(w, place(w, 'v', 0, 400), 'armor', 5);
    gate(w).applyDamage(v, 3, 'storm', undefined);
    expect(v.stats.maxHp - v.hp).toBe(3);
  });

  it('LIVE at impact (amendment 156): a card bought between two blows from the same attacker changes the second', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    const b = place(w, 'b', 400, 0);
    gate(w).applyDamage(a, 12, 'torpedo', 'b');
    expect(a.stats.maxHp - a.hp).toBe(12);
    w.applyCard(b, 'power'); // bought while the next one swims
    gate(w).applyDamage(a, 12, 'torpedo', 'b');
    expect(a.stats.maxHp - a.hp).toBe(12 + 14);
  });

  it('an owner who LEFT the room (removeShip) reads the AVERAGE POWER (CONFIG.index.base, Story 10.3) — no throw, its cards gone with it', () => {
    const w = bareWorld();
    const a = carded(w, place(w, 'a'), 'armor', 1);
    carded(w, place(w, 'b', 400, 0), 'power', 5);
    w.removeShip('b');
    expect(() => gate(w).applyDamage(a, 12, 'mine', 'b')).not.toThrow();
    const e = a.stats.armor - CONFIG.index.base;
    expect(a.stats.maxHp - a.hp).toBe(Math.floor(12 * damageMultiplierFor(e)));
  });

  it('a SUNK owner keeps its record until it leaves, so its ordnance still carries its piercing (amendment 156)', () => {
    const w = bareWorld();
    w.respawnEnabled = false;
    const a = place(w, 'a');
    const b = carded(w, place(w, 'b', 400, 0), 'power', 5);
    w.sinkShip('b', 'a');
    w.step(CONFIG.ship.sinkingWindowMs); // past the founder edge
    expect(b.lifecycle.kind).toBe('sunk');
    const before = a.hp;
    gate(w).applyDamage(a, 12, 'torpedo', 'b');
    expect(before - a.hp).toBe(18);
  });

  it('the COAST and a WRECK (byId undefined) read the AVERAGE POWER, CONFIG.index.base (Story 10.3): E = victim ARMOR − base', () => {
    const w = bareWorld();
    const a = carded(w, place(w, 'a'), 'armor', 1);
    gate(w).applyDamage(a, 12, 'contact', undefined);
    expect(a.stats.maxHp - a.hp).toBe(Math.floor(12 * damageMultiplierFor(a.stats.armor - CONFIG.index.base)));
  });

  it('a coast strike against a BASE hull (ARMOR = CONFIG.index.base) lands ×1 — the missing attacker is an average one', () => {
    const w = bareWorld();
    const a = place(w, 'a');
    a.stats.armor = CONFIG.index.base; // an average hull, whatever the scaffold seeds
    gate(w).applyDamage(a, 12, 'contact', undefined);
    expect(a.stats.maxHp - a.hp).toBe(12);
  });

  it('a SELF-HIT is refused before the attacker read, piercing or not', () => {
    const w = bareWorld();
    const a = carded(w, place(w, 'a'), 'power', 5);
    gate(w).applyDamage(a, 12, 'shell', 'a');
    expect(a.hp).toBe(a.stats.maxHp);
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

  it('the TWO non-hull decrements are `mine.hp -=` (amendment 200) and `beacon.hp -=` (Story 10.8), each inside its own door', () => {
    // One hull door, one mine door, one RADIO BEACON door (World.damageBeacon,
    // Story 10.8 — a beacon is not a ship: no `dmg`, no feed line, it never
    // enters applyDamage). The decoy's decrement left with Story 10.5.
    const code = WORLD_SRC.split('\n').filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'));
    expect(code.filter((l) => /\.hp\s*-=/.test(l)).map((l) => l.trim())).toEqual([
      'victim.hp -= dealt; // (d) THE ONE HULL-HP DECREMENT IN THE GAME',
      'beacon.hp -= dealt; // THE ONE BEACON-HP DECREMENT IN THE GAME',
      'mine.hp -= amount;',
    ]);
    expect(methodBody('damageMine')).toContain('mine.hp -= amount;');
    const door = WORLD_SRC.indexOf('  damageBeacon(id: string');
    expect(door).toBeGreaterThan(-1);
    expect(WORLD_SRC.slice(door, WORLD_SRC.indexOf('\n  }\n', door))).toContain('beacon.hp -= dealt;');
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
      // refoldCards — the post-fold clamp to the new maxHp, shared by
      // applyCard and the exhausted hull's convertBank (Story 10.7, R5; the
      // heal-on-grant line left with HULL POINTS, Story 10.3, Eric
      // 2026-11-04, epic-10 amendment 7).
      'ship.hp = Math.min(ship.hp, ship.stats.maxHp);',
      // tickRepairs — the R8 PASSIVE REGEN (Story 10.5, epic-10 amendment
      // 11): the shared `regenGain` law (2 % of missing per second, the last
      // point snapping on `hullIsFull`) once `regenDue` holds, participants
      // only (World.regenerates — never a PvE fleet drone). No clamp at
      // the site: `regenGain` never answers more than the missing hp.
      'if (World.regenerates(ship, this.now)) ship.hp += regenGain(ship.hp, ship.stats.maxHp, dtMs / 1000);',
      // payRepair — the PAID HULL REPAIR pool's drain.
      'ship.hp = Math.min(ship.hp + paid, ship.stats.maxHp);',
      // applyRepair — HULL REPAIR's instant half, reached ONLY from the `C`
      // press (pressCooldownAbility, Story 10.5).
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
    a.repairRate = a.stats.repair.regenHp / a.stats.repair.regenMs; // the rate a press stamps (Story 10.6)
    w.step(CONFIG.tick.simDtMs);
    // It heals. That is the pinned decision, not an oversight: nothing can
    // damage a hull while damageEnabled is false (the gate's own step (b)), so
    // an open pool in the ready room can only be one a captain paid for
    // BEFORE the phase changed, and gating it would put a phase read on the
    // one repair path. (The passive regen reaches the same room on the same
    // reasoning — nothing there can have hurt anyone.)
    expect(a.hp).toBeGreaterThan(a.stats.maxHp - 20);
    expect(a.repairHp).toBeLessThan(20);
  });
});

// (The Story 10.3 "no out-of-combat regen" pin is SUPERSEDED by R8 — Story
// 10.5 brought the passive regen back; see regen.test.ts.)
