// HULL REPAIR (catalog-v3 R13; Eric rulings 2026-08-04, moved onto a card by
// epic-8 amendment 46) + THE OUT-OF-COMBAT REGEN (amendments 46-48) — the
// CONFIG pins for the game's two heal channels, plus the NFR6 arithmetic the
// collapse ceiling rests on. Pure pins, the damageGuardrail idiom: they fail
// the moment a retune or a refactor drifts across a ruled line — an amount
// moving, the pool's rate leaving its ruled stacking law, the belt's authored
// heal budget growing, or the four-card draw thinning.
//
// WAS the damage-control pin file. Gone with the rename: the sentinel pins (the
// constant left the wire in PV 53 — `SpendMsg.choice` is an offer index and
// nothing else) and the free per-level auto-heal's dials.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  SHIP_CLASS_IDS,
  effectiveStats,
  hullIsFull,
  isStubLine,
} from '../index.js';

describe('CONFIG.hullRepair — the paid heal, flat on every hull (Eric rulings 2026-08-04)', () => {
  it('all three tunables are finite and positive', () => {
    const { instantHp, regenHp, regenMs } = CONFIG.hullRepair;
    for (const v of [instantHp, regenHp, regenMs]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('the pool pays at EXACTLY 0.01 hp/ms — one fixed rate, pools ADD and never accelerate', () => {
    // THE RULED INVARIANT IS THE STACKING LAW, not the scalar: two copies run
    // twice as long at this rate, never twice as fast. The rate itself was
    // ruled as 5 hp/s at regenHp 25 (Eric 2026-08-04) and balance cycle 1
    // doubled the AMOUNT with hull hp while regenMs stayed 5000, so the shipped
    // pool pays 50 hp over 5 s. That doubling is deliberate: hull hp doubled in
    // the same pass, and a pool left at 5 hp/s would have healed half as fast
    // RELATIVE to a hull — the same silent repricing the flat-amount problem
    // caused for the pool's size.
    expect(CONFIG.hullRepair.regenHp / CONFIG.hullRepair.regenMs).toBe(0.01);
  });

  it('pins the amounts: 50 instant + 50 pooled over 5000ms', () => {
    expect(CONFIG.hullRepair.instantHp).toBe(50);
    expect(CONFIG.hullRepair.regenHp).toBe(50);
    expect(CONFIG.hullRepair.regenMs).toBe(5000);
  });

  it('a heal is worth the SAME FRACTION of every hull it was before the doubling', () => {
    // The whole reason these amounts ever moved. They are flat by ruling, so
    // hull hp doubling without them would have cut a heal's relative value by
    // half on every hull — measured as bots burning levels on heals instead of
    // boons, worst on the highest-hp hull.
    const heal = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp;
    const before = { torpedoBoat: 125, battleship: 350 / 2, mineLayer: 150 };
    for (const [hull, oldHp] of Object.entries(before)) {
      const nowFrac = heal / CONFIG.shipClasses[hull as keyof typeof CONFIG.shipClasses].hp;
      expect(nowFrac).toBeCloseTo(50 / oldHp, 10);
    }
  });
});

describe('CONFIG.regen — the out-of-combat regen (Eric ruling 2026-09-17, amendments 46-48)', () => {
  it('restores 1 % of MISSING hull per second', () => {
    // A fraction of MISSING, never of max and never a flat amount: worth most
    // when nearly dead, asymptotic near full, and it needs NO repricing when
    // hull hp next moves (the repricing the paid heal above had to absorb).
    expect(CONFIG.regen.missingPctPerS).toBe(0.01);
  });

  it('waits 30 s since the last landed damage', () => {
    expect(CONFIG.regen.outOfCombatMs).toBe(30000);
  });

  it('both dials are finite and positive, and the clock is a whole number of sim ticks', () => {
    for (const v of [CONFIG.regen.missingPctPerS, CONFIG.regen.outOfCombatMs]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
    expect(CONFIG.regen.outOfCombatMs % CONFIG.tick.simDtMs).toBe(0);
  });

  it('is a SECOND channel, not a pool: it shares no dial with the paid heal', () => {
    // The shape pin. The per-level auto-heal that lived INSIDE the paid block
    // (its own missing-fraction and its own duration dial, cycle 129) is what
    // amendment 46 deleted; a dial reappearing on either side fails by key.
    expect(Object.keys(CONFIG.hullRepair).sort()).toEqual(['instantHp', 'regenHp', 'regenMs']);
    expect(Object.keys(CONFIG.regen).sort()).toEqual(['missingPctPerS', 'outOfCombatMs']);
  });
});

describe('HULL REPAIR is a LIVE consumable; four of the seven are still stubs', () => {
  it('hullRepair is dealt, and so is the SUPERCAV TORPEDO — the rest are not', () => {
    // Story 8.13 made SUPERCAV TORPEDO the second live consumable line (Eric
    // ruling 2026-09-19, epic-8 amendment 74) and added one more stub,
    // DEPTH CHARGE (amendment 83).
    const LIVE: readonly string[] = ['hullRepair', 'supercavTorpedo'];
    for (const id of CONSUMABLE_IDS) {
      expect(isStubLine(id), id).toBe(!LIVE.includes(id));
    }
  });
});

// --- NFR6: the authored heal budget the collapse ceiling rests on -------------
//
// The sudden-death collapse must be able to sink the toughest possible hull,
// which means the storm has to out-damage every hp a captain can ADD to it. The
// bound is arithmetic, not a measurement, and it is derived here from the same
// CONFIG/CATALOG numbers the sim uses, so a retune of any of them fails this pin
// instead of quietly lengthening the endgame. The out-of-combat regen does NOT
// enter it: a storm bite is landed damage and resets the clock (amendment 47),
// so nobody regens inside the storm.
describe('NFR6 — the authored heal budget and the collapse ceiling', () => {
  const HEAL_PER_COPY = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp;

  it('one HULL REPAIR copy is worth exactly 100 hp', () => {
    expect(HEAL_PER_COPY).toBe(100);
  });

  it('the line caps at 5 copies — THE one heal bound now that decks are gone', () => {
    // Story 8.14 (epic-8 amendment 89a): there is no deck and no match pool, so
    // there is no AUTHORED copy budget under the cap any more. The common pool
    // holds every line with unlimited copies, and `cap` alone bounds the heal.
    expect(CATALOG.hullRepair.cap).toBe(5);
  });

  it('a captain can heal at most 500 hp in a match — the CATALOG bound is the whole bound', () => {
    expect(CATALOG.hullRepair.cap * HEAL_PER_COPY).toBe(500);
  });

  it('the collapse ceiling is 237.5 s — (max hull 450 + heal bound 500) / stormDps', () => {
    // MAX HULL IS DERIVED, never typed: the ARMOR ladder (R8, +25 max hp per
    // tier) run to its own cap on whichever hull starts highest. That is the
    // battleship at 350 + 4 × 25 = 450.
    const armorCards = Array.from({ length: CATALOG.armor.cap }, () => 'armor');
    const maxHull = Math.max(
      ...SHIP_CLASS_IDS.map((hull) => effectiveStats(CONFIG.shipClasses[hull], armorCards).maxHp),
    );
    expect(maxHull).toBe(450);

    const healBound = CATALOG.hullRepair.cap * HEAL_PER_COPY;
    const ceilingS = (maxHull + healBound) / CONFIG.zone.stormDps;
    // 950 hp at 4 hp/s = 237.5 s of continuous storm to sink the most healed,
    // most armoured hull in the game: the storm always wins in the end.
    expect(ceilingS).toBe(237.5);
    expect(ceilingS).toBe((maxHull + healBound) / CONFIG.zone.stormDps);
  });
});

describe('the four-card draw is untouched (regression pin)', () => {
  it('CONFIG.offer.size is still 4 — this cycle must not have thinned the draw', () => {
    expect(CONFIG.offer.size).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// hullIsFull — THE ONE DEFINITION OF "FULL HULL" (epic-8 amendment 53).
//
// Storm bites and burn ticks land FRACTIONAL damage while weapon damage is
// whole (amendment 39), and the out-of-combat regen closes MISSING
// geometrically, so a hull sits at 349.x of 350 for minutes. `hp >= maxHp` as
// the test would spend a whole scarce HULL REPAIR copy for under 1 hp. Under
// 1 hp missing IS full: the row refuses on it, the regen snaps on it, and the
// client's belt pre-denial mirrors it — one predicate, three callers.
// ---------------------------------------------------------------------------
describe('hullIsFull — under 1 hp missing is FULL (amendment 53)', () => {
  it('349.0 of 350 is NOT full — a whole point of weapon damage is worth a copy', () => {
    expect(hullIsFull(349, 350)).toBe(false);
  });

  it('349.01 of 350 IS full — the fractional remainder a storm bite leaves', () => {
    expect(hullIsFull(349.01, 350)).toBe(true);
  });

  it('exactly full is full, and an overshoot is too', () => {
    expect(hullIsFull(350, 350)).toBe(true);
    expect(hullIsFull(350.5, 350)).toBe(true);
  });
});
