// HULL REPAIR (catalog-v3 R13; Eric rulings 2026-08-04, moved onto a card by
// epic-8 amendment 46) + THE OUT-OF-COMBAT REGEN (amendments 46-48) — the
// CONFIG pins for the game's two heal channels, plus the NFR6 arithmetic the
// collapse ceiling rests on. Pure pins, the damageGuardrail idiom: they fail
// the moment a retune or a refactor drifts across a ruled line — an amount
// moving, the pool's rate leaving its ruled 0.01 hp/ms, the belt's authored
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
  stormDpsFor,
} from '../index.js';

describe('CONFIG.hullRepair — the paid heal, flat on every hull (Eric rulings 2026-08-04)', () => {
  it('all three tunables are finite and positive', () => {
    const { instantHp, regenHp, regenMs } = CONFIG.hullRepair;
    for (const v of [instantHp, regenHp, regenMs]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('the pool pays at EXACTLY 0.01 hp/ms — one fixed rate; a re-press REPLACES the pool, never accelerates it', () => {
    // THE OLD STACKING LAW ("pools ADD, the rate never changes") IS SUPERSEDED
    // (Eric 2026-09-29, epic-8 amendment 141): a re-press REPLACES the pool —
    // `repairHp = regenHp`, whatever was still owed is discarded, and a fresh
    // 50 hp pays over a fresh 5 s. The replace itself is server behaviour
    // (World.applyRepair) and is pinned in the server suite; this file pins the
    // rate, which is unchanged either way. The rate itself was
    // ruled as 5 hp/s at regenHp 25 (Eric 2026-08-04) and balance cycle 1
    // doubled the AMOUNT with hull hp while regenMs stayed 5000, so the shipped
    // pool pays 50 hp over 5 s. That doubling is deliberate: hull hp doubled in
    // the same pass, and a pool left at 5 hp/s would have healed half as fast
    // RELATIVE to a hull — the same silent repricing the flat-amount problem
    // caused for the pool's size.
    expect(CONFIG.hullRepair.regenHp / CONFIG.hullRepair.regenMs).toBe(0.01);
  });
});

describe('CONFIG.regen — the out-of-combat regen (Eric ruling 2026-09-17, amendments 46-48)', () => {
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

describe('HULL REPAIR is a LIVE consumable; one of the seven is still a stub', () => {
  it('hullRepair is dealt, and so are the SUPERCAV TORPEDO, SHIELD BLOCK, COUNTERMEASURE, DECOY BUOY and FOULING SHELL — DEPTH CHARGE is not', () => {
    // Story 8.13 made SUPERCAV TORPEDO the second live consumable line (Eric
    // ruling 2026-09-19, epic-8 amendment 74) and added one more stub,
    // DEPTH CHARGE (amendment 83). Story 8.16 flipped SHIELD BLOCK and DECOY
    // BUOY live (amendments 116–124); Story 8.17 moved FLASH SHELLS
    // (`dazzleShells`) in from the add-on space, live (amendment 132); Story
    // 8.18 flipped SMOKE SCREEN live (amendments 138-145). DEPTH CHARGE stays.
    // CHAFF retired in Story 9.2 (epic-9 amendment 31); SMOKE SCREEN became
    // the COUNTERMEASURE line in Story 9.3, and FLASH SHELLS the FOULING SHELL
    // in Story 9.4.
    const LIVE: readonly string[] = [
      'hullRepair', 'supercavTorpedo', 'shieldBlock', 'countermeasure', 'decoyBuoy', 'foulingShell',
    ];
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

  it('the collapse ceiling is (max hull + heal bound + shield bound) / the fully-closed storm rung — the storm always wins in the end', () => {
    // MAX HULL IS DERIVED, never typed: the HULL POINTS ladder (R8 as re-cut
    // by epic-9 amendment 28 / Story 9.6: +50 max hp per tier, cap 5; was
    // ARMOR +25 ×4) run to its own cap on whichever hull starts highest — the
    // dreadnought at 350 + 5 × 50 = 600 today.
    const hullCards = Array.from({ length: CATALOG.hullPoints.cap }, () => 'hullPoints');
    const maxHull = Math.max(
      ...SHIP_CLASS_IDS.map((hull) => effectiveStats(CONFIG.shipClasses[hull], hullCards).maxHp),
    );
    const topBase = Math.max(...SHIP_CLASS_IDS.map((hull) => CONFIG.shipClasses[hull].hp));
    expect(maxHull).toBe(topBase + CATALOG.hullPoints.cap * 50);

    const healBound = CATALOG.hullRepair.cap * HEAL_PER_COPY;
    // THE SHIELD BUDGET (epic-8 amendment 125, Eric 2026-09-29): SHIELD BLOCK
    // absorbs EVERY source, storm bites included (amendment 118), so the
    // ceiling counts the line's cap × its face value beside the heal budget.
    // Face value is the conservative bound: a shield lasts only
    // CONFIG.shieldBlock.durationMs, so storm alone drains far less of each
    // copy. The five-shield captain is Eric's "very lucky" lottery ticket —
    // the real ceiling in play is far lower than this pin.
    const shieldBound = CATALOG.shieldBlock.cap * CONFIG.shieldBlock.hp;
    // THE RAMP (Story 9.1, 2026-10-07): once the storm has fully closed the
    // rate is the ladder's LAST rung — the only rate that matters for the
    // ceiling, since the collapse is where the last hull must drown. The
    // ceiling's VALUE is Eric's numbers and is not pinned; the contract is
    // that it is finite and positive, i.e. the storm ends every match.
    const closedDps = stormDpsFor({ phase: 'closed', groupIndex: 0 }, CONFIG.zone);
    expect(closedDps).toBeGreaterThan(0);
    const ceilingS = (maxHull + healBound + shieldBound) / closedDps;
    expect(Number.isFinite(ceilingS)).toBe(true);
    expect(ceilingS).toBeGreaterThan(0);
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
// client's slot pre-denial mirrors it — one predicate, three callers.
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
