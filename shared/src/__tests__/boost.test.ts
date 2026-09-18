// Pins THE SHIFT BOOST (Story 1.6, re-cut universal and proportional in Story
// 8.9 — Eric rulings 2026-09-18, epic-8 amendments 54–55). Two halves:
//
//  1. `boostedKinematics`, THE one shared per-tick hook both sim sides call —
//     identity (same reference) when inactive or factor 0; the forward maxSpeed
//     cap raised by `factor` OF ITSELF when active; the input never mutated;
//     every other field, reverseSpeed above all, carried through untouched.
//  2. THE NUMBERS: `CONFIG.boost` itself, the per-class boosted caps at base
//     and at the SPEED cap (the ladder is INSIDE the bonus), the reload's trip
//     through the one `cooldownScale` multiply, and the fit — slot 1 on every
//     captain hull, nothing on a fleet drone.
//
// Pure CONFIG/sim pins, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  SHIP_CLASS_IDS,
  SLOT_BOOST,
  boostedKinematics,
  effectiveStats,
  loadoutFor,
  type LineId,
  type ShipClassId,
  type ShipConfig,
} from '../index.js';

/** A representative Torpedo Boat kinematics block to boost. */
function tbKinematics(): ShipConfig {
  return { ...CONFIG.shipClasses.torpedoBoat.kinematics };
}

const FACTOR = CONFIG.boost.factor;

/** The forward cap a hull of `cls` reaches under the boost, holding `cards`. */
function boostedCap(cls: ShipClassId, cards: LineId[] = []): number {
  const stats = effectiveStats(CONFIG.shipClasses[cls], cards);
  return boostedKinematics(stats.kinematics, FACTOR, true).maxSpeed;
}

describe('CONFIG.boost — Eric ruling 2026-09-18 (amendment 54)', () => {
  it('is exactly { factor 0.25, durationMs 10000, maxAmmo 1, reloadMs 25000 }', () => {
    // Eric, verbatim: *"Build as-written, except 25s reload."* — R9's 20 s is
    // superseded. The legacy flat block (+10 u/s, 6 s, 18 s) is DELETED.
    expect(CONFIG.boost).toEqual({ factor: 0.25, durationMs: 10000, maxAmmo: 1, reloadMs: 25000 });
  });

  it('honours `reloadMs >= durationMs` — an active window ALWAYS implies a cooling pool', () => {
    // The design invariant that makes re-activation while active impossible by
    // construction. The batch-sim override validator enforces it on the
    // finished CONFIG against `--tune` (server) — `--set` never reaches
    // `boost.*`, it is refused at the family gate; this pin is the authored
    // side of it.
    expect(CONFIG.boost.reloadMs).toBeGreaterThanOrEqual(CONFIG.boost.durationMs);
  });
});

describe('boostedKinematics — inactive is an identity', () => {
  it('returns the SAME reference when inactive (allocation-free path)', () => {
    const kin = tbKinematics();
    expect(boostedKinematics(kin, FACTOR, false)).toBe(kin);
  });

  it('returns the SAME reference when the factor is 0, even if active', () => {
    const kin = tbKinematics();
    expect(boostedKinematics(kin, 0, true)).toBe(kin);
  });
});

describe('boostedKinematics — active raises the forward cap only, PROPORTIONALLY', () => {
  it('adds `factor × maxSpeed` and nothing else', () => {
    const kin = tbKinematics();
    const boosted = boostedKinematics(kin, FACTOR, true);
    expect(boosted.maxSpeed).toBe(kin.maxSpeed + kin.maxSpeed * FACTOR);
    expect(boosted.maxSpeed).toBe(56.25); // base TB 45 × 1.25
  });

  it('leaves reverseSpeed and every other field untouched', () => {
    const kin = tbKinematics();
    const boosted = boostedKinematics(kin, FACTOR, true);
    expect(boosted.reverseSpeed).toBe(kin.reverseSpeed);
    expect(boosted.accel).toBe(kin.accel);
    expect(boosted.decel).toBe(kin.decel);
    expect(boosted.turnRate).toBe(kin.turnRate);
    expect(boosted.steerageSpeed).toBe(kin.steerageSpeed);
  });

  it('returns a FRESH object — never mutates its input', () => {
    const kin = tbKinematics();
    const before = { ...kin };
    const boosted = boostedKinematics(kin, FACTOR, true);
    expect(boosted).not.toBe(kin);
    expect(kin).toEqual(before); // input untouched
  });
});

describe('the SPEED ladder is INSIDE the bonus (amendment 55)', () => {
  it('base hulls boost to 56.25 / 50 / 43.75', () => {
    expect(boostedCap('torpedoBoat')).toBe(56.25);
    expect(boostedCap('mineLayer')).toBe(50);
    expect(boostedCap('battleship')).toBe(43.75);
  });

  it('SPEED-capped hulls boost to 68.75 / 62.5 / 56.25 — the ladder enlarges the boost', () => {
    // Four SPEED copies (+2.5 each, catalog-v3 R10) raise 45/40/35 to
    // 55/50/45; the boost then adds a quarter OF THAT, not a flat +10.
    const capped = new Array<LineId>(CATALOG.speed.cap).fill('speed');
    expect(boostedCap('torpedoBoat', capped)).toBe(68.75);
    expect(boostedCap('mineLayer', capped)).toBe(62.5);
    expect(boostedCap('battleship', capped)).toBe(56.25);
  });

  it('reverseSpeed never sees the boost, ladder or no ladder', () => {
    const capped = new Array<LineId>(CATALOG.speed.cap).fill('speed');
    for (const id of SHIP_CLASS_IDS) {
      const stats = effectiveStats(CONFIG.shipClasses[id], capped);
      const boosted = boostedKinematics(stats.kinematics, FACTOR, true);
      expect(boosted.reverseSpeed, id).toBe(stats.kinematics.reverseSpeed);
    }
  });

  it('the bonus is NEVER folded into EffectiveStats.kinematics (the bots read the RATED cap)', () => {
    const stats = effectiveStats(CONFIG.shipClasses.torpedoBoat, []);
    expect(stats.kinematics.maxSpeed).toBe(45); // rated, un-boosted
  });
});

describe('the boost ROW — pool, window, and the one cooldownScale multiply (R40)', () => {
  it('base: CONFIG.boost verbatim, with no speed field to fold', () => {
    const row = effectiveStats(CONFIG.shipClasses.torpedoBoat, []).equipment.boost;
    expect(row).toEqual({ tier: 1, reloadMs: 25000, maxAmmo: 1, durationMs: 10000 });
  });

  it('five RELOAD copies scale the reload to 18750 and leave the window at 10000', () => {
    const stats = effectiveStats(
      CONFIG.shipClasses.torpedoBoat,
      new Array<LineId>(CATALOG.reload.cap).fill('reload'),
    );
    expect(stats.cooldownScale).toBe(0.75); // −0.05 × 5 (catalog-v3 R40)
    expect(stats.equipment.boost.reloadMs).toBe(18750); // 25000 × 0.75
    expect(stats.equipment.boost.durationMs).toBe(10000); // the window is NOT scaled
    expect(stats.equipment.boost.maxAmmo).toBe(1);
  });

  it('no card addresses the boost: the legacy flat-bonus row and its id are gone', () => {
    const rows = effectiveStats(CONFIG.shipClasses.torpedoBoat, []).equipment as unknown as Record<string, unknown>;
    expect(Object.hasOwn(rows, 'speedBoost')).toBe(false);
    expect(Object.hasOwn(rows.boost as object, 'speedBonus')).toBe(false);
  });
});

describe('the FIT — slot 1 on every captain, nothing on a fleet drone', () => {
  it('every captain hull fits `boost` in slot 1 with a full single-charge pool', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = effectiveStats(CONFIG.shipClasses[id], []);
      const loadout = loadoutFor(stats);
      expect(loadout[SLOT_BOOST].equipmentId, id).toBe('boost');
      expect(loadout[SLOT_BOOST].state, id).toEqual({ n: CONFIG.boost.maxAmmo, reloadMsLeft: 0 });
    }
  });

  it('a PvE fleet hull fits the gun and nothing else — slot 1 stays empty (amendment 24)', () => {
    const loadout = loadoutFor(effectiveStats(CONFIG.shipClasses.torpedoBoat, []), true);
    expect(loadout[SLOT_BOOST]).toEqual({ equipmentId: null, state: null });
  });
});
