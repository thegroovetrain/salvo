// HULL REPAIR (catalog-v3 R13; Eric rulings 2026-08-04, moved onto a card by
// epic-8 amendment 46) — THE ONE HEAL since Story 10.3 (Eric 2026-11-04,
// epic-10 amendment 8, ruling 7: the out-of-combat regen of amendments 46–48
// and its PASSIVE HEALING ladder are DELETED) — its CONFIG shape, plus the
// NFR6 arithmetic the collapse ceiling rests on. Relations only (Story 9.14):
// the pool pays its whole amount over its whole window, the heal is a fixed
// fraction of the one 1000 hp hull, the storm always wins in the end.
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

  it('the pool pays its whole regenHp over its whole regenMs — one fixed rate, a whole number of sim ticks; a re-press REPLACES the pool, never accelerates it', () => {
    // THE OLD STACKING LAW ("pools ADD, the rate never changes") IS SUPERSEDED
    // (Eric 2026-09-29, epic-8 amendment 141): a re-press REPLACES the pool —
    // `repairHp = regenHp`, whatever was still owed is discarded, and a fresh
    // pool pays over a fresh window. The replace itself is server behaviour
    // (World.applyRepair) and is pinned in the server suite; this file pins
    // the shape: the rate is regenHp / regenMs and nothing else, and the
    // window is tickable. (The literal 0.01 hp/ms pin went with Story 10.3's
    // 100 + 100 — a ruled number is not a contract, Story 9.14.)
    const rate = CONFIG.hullRepair.regenHp / CONFIG.hullRepair.regenMs;
    expect(Number.isFinite(rate) && rate > 0).toBe(true);
    expect(rate * CONFIG.hullRepair.regenMs).toBeCloseTo(CONFIG.hullRepair.regenHp, 9);
    expect(CONFIG.hullRepair.regenMs % CONFIG.tick.simDtMs).toBe(0);
  });

  it('is the ONE heal (Story 10.3, ruling 7): the block carries exactly its three dials and there is no CONFIG.regen', () => {
    expect(Object.keys(CONFIG.hullRepair).sort()).toEqual(['instantHp', 'regenHp', 'regenMs']);
    expect('regen' in CONFIG).toBe(false);
  });

  it('one copy heals a fixed FRACTION of the one hull, the same on every class (amounts are FLAT by ruling)', () => {
    const heal = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp;
    for (const hull of SHIP_CLASS_IDS) {
      const maxHp = effectiveStats(CONFIG.shipClasses[hull]).maxHp;
      expect(heal / maxHp, hull).toBe(heal / effectiveStats(CONFIG.shipClasses.iowa).maxHp);
      expect(heal, hull).toBeLessThan(maxHp); // a heal is a fraction, never a full hull
    }
  });
});

describe('HULL REPAIR is a LIVE consumable; one of the seven is still a stub', () => {
  it('hullRepair is dealt, and so is every other consumable but DEPTH CHARGE (the one stub)', () => {
    // Story 8.13 made SUPERCAV TORPEDO the second live consumable line (Eric
    // ruling 2026-09-19, epic-8 amendment 74) and added one more stub,
    // DEPTH CHARGE (amendment 83). Story 8.16 flipped SHIELD BLOCK and DECOY
    // BUOY live (amendments 116–124); Story 8.17 moved FLASH SHELLS
    // (`dazzleShells`) in from the add-on space, live (amendment 132); Story
    // 8.18 flipped SMOKE SCREEN live (amendments 138-145). DEPTH CHARGE stays.
    // CHAFF retired in Story 9.2 (epic-9 amendment 31); SMOKE SCREEN became
    // the COUNTERMEASURE line in Story 9.3, and FLASH SHELLS the FOULING SHELL
    // in Story 9.4. Story 10.9 deleted the DECOY BUOY and added FLASH SHELLS
    // back plus the four buoys, all live — DEPTH CHARGE is still the one stub.
    const STUBS: readonly string[] = ['depthCharge'];
    for (const id of CONSUMABLE_IDS) {
      expect(isStubLine(id), id).toBe(STUBS.includes(id));
    }
  });
});

// --- NFR6: the authored heal budget the collapse ceiling rests on -------------
//
// The sudden-death collapse must be able to sink the toughest possible hull,
// which means the storm has to out-damage every hp a captain can ADD to it. The
// bound is arithmetic, not a measurement, and it is derived here from the same
// CONFIG/CATALOG numbers the sim uses, so a retune of any of them fails this pin
// instead of quietly lengthening the endgame. There is no passive regen to
// enter it since Story 10.3 (it never did: a storm bite was landed damage and
// reset the clock, amendment 47).
describe('NFR6 — the authored heal budget and the collapse ceiling', () => {
  const HEAL_PER_COPY = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp;

  it('the collapse ceiling is (max hull + heal bound + shield bound) / the fully-closed storm rung — the storm always wins in the end', () => {
    // MAX HULL IS DERIVED, never typed: the fold's maxHp on whichever hull
    // starts highest. The HULL POINTS ladder that once raised it (+50 ×5) was
    // DELETED by Story 10.3 (Eric 2026-11-04, epic-10 amendment 8), so no card
    // moves it and the fold's maxHp IS the class base.
    const maxHull = Math.max(
      ...SHIP_CLASS_IDS.map((hull) => effectiveStats(CONFIG.shipClasses[hull]).maxHp),
    );
    const topBase = Math.max(...SHIP_CLASS_IDS.map((hull) => CONFIG.shipClasses[hull].hp));
    expect(maxHull).toBe(topBase);

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
// whole (amendment 39), and the healing buoy's trickle closes MISSING
// geometrically, so a hull can sit a fraction under full for minutes.
// `hp >= maxHp` as the test would spend a whole scarce HULL REPAIR copy for
// under 1 hp. Under 1 hp missing IS full: the row refuses on it, the buoy
// snaps on it, and the client's slot pre-denial mirrors it — one predicate,
// three callers.
// ---------------------------------------------------------------------------
describe('hullIsFull — under 1 hp missing is FULL (amendment 53)', () => {
  const MAX = effectiveStats(CONFIG.shipClasses.yamato).maxHp;

  it('a whole point short is NOT full — a whole point of weapon damage is worth a copy', () => {
    expect(hullIsFull(MAX - 1, MAX)).toBe(false);
  });

  it('under a point short IS full — the fractional remainder a storm bite leaves', () => {
    expect(hullIsFull(MAX - 0.99, MAX)).toBe(true);
  });

  it('exactly full is full, and an overshoot is too', () => {
    expect(hullIsFull(MAX, MAX)).toBe(true);
    expect(hullIsFull(MAX + 0.5, MAX)).toBe(true);
  });
});
