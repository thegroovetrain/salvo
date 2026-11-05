// HULL REPAIR (catalog-v3 R13; Eric rulings 2026-08-04) — the `C` cooldown
// ability since Story 10.5 (Eric 2026-11-05, epic-10 amendment 11): its CONFIG
// shape. Relations only (Story 9.14): the pool pays its whole amount over its
// whole window, the heal is a fixed fraction of the one 1000 hp hull. The
// cooldown law and the full-hull refusal are abilities.test.ts; the passive
// regen that came back beside it (R8) is regen.test.ts. The collapse-ceiling
// arithmetic that lived here summed a STOCK of heal and shield copies (cap ×
// face value); the stock is gone with the kit, so the block went with it.
//
// WAS the damage-control pin file. Gone with the rename: the sentinel pins (the
// constant left the wire in PV 53 — `SpendMsg.choice` is an offer index and
// nothing else) and the free per-level auto-heal's dials.

import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_CLASS_IDS, effectiveStats, hullIsFull } from '../index.js';

describe('CONFIG.hullRepair — the paid heal, flat on every hull (Eric rulings 2026-08-04)', () => {
  it('every tunable is finite and positive', () => {
    for (const v of Object.values(CONFIG.hullRepair)) {
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

  it('one press heals a fixed FRACTION of the one hull, the same on every class (amounts are FLAT by ruling)', () => {
    const heal = CONFIG.hullRepair.instantHp + CONFIG.hullRepair.regenHp;
    for (const hull of SHIP_CLASS_IDS) {
      const maxHp = effectiveStats(CONFIG.shipClasses[hull]).maxHp;
      expect(heal / maxHp, hull).toBe(heal / effectiveStats(CONFIG.shipClasses.iowa).maxHp);
      expect(heal, hull).toBeLessThan(maxHp); // a heal is a fraction, never a full hull
    }
  });
});

// ---------------------------------------------------------------------------
// hullIsFull — THE ONE DEFINITION OF "FULL HULL" (epic-8 amendment 53).
//
// Storm bites and burn ticks land FRACTIONAL damage while weapon damage is
// whole (amendment 39), and the passive regen closes MISSING geometrically, so
// a hull can sit a fraction under full for minutes. `hp >= maxHp` as the test
// would spend a whole HULL REPAIR cooldown for under 1 hp. Under 1 hp missing
// IS full: `repairRefusal` refuses on it on both sides and `regenGain` snaps
// on it — one predicate.
// ---------------------------------------------------------------------------
describe('hullIsFull — under 1 hp missing is FULL (amendment 53)', () => {
  const MAX = effectiveStats(CONFIG.shipClasses.yamato).maxHp;

  it('a whole point short is NOT full — a whole point of weapon damage is worth a press', () => {
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
