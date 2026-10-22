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
  it('SPEED-capped hulls boost by factor × their LADDERED cap — the ladder enlarges the boost', () => {
    // The SPEED copies raise the rated cap first; the boost then adds `factor`
    // OF THAT, not a flat bonus sized off the base hull.
    const capped = new Array<LineId>(CATALOG.speed.cap).fill('speed');
    for (const id of SHIP_CLASS_IDS) {
      const base = effectiveStats(CONFIG.shipClasses[id], []).kinematics.maxSpeed;
      const laddered = effectiveStats(CONFIG.shipClasses[id], capped).kinematics.maxSpeed;
      expect(laddered, id).toBeGreaterThan(base);
      expect(boostedCap(id, capped), id).toBeCloseTo(laddered + laddered * FACTOR, 9);
      expect(boostedCap(id, capped) - laddered, id).toBeGreaterThan(boostedCap(id) - base);
    }
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
    expect(stats.kinematics.maxSpeed).toBe(CONFIG.shipClasses.torpedoBoat.kinematics.maxSpeed); // rated, un-boosted
  });
});

describe('the boost ROW — pool, window, and the one cooldownScale multiply (R40)', () => {
  it('base: CONFIG.boost verbatim, with no speed field to fold', () => {
    const row = effectiveStats(CONFIG.shipClasses.torpedoBoat, []).equipment.boost;
    expect(row).toEqual({
      tier: 1,
      reloadMs: CONFIG.boost.reloadMs,
      maxAmmo: CONFIG.boost.maxAmmo,
      durationMs: CONFIG.boost.durationMs,
    });
  });

  it('capped RELOAD copies scale the boost reload by cooldownScale and leave the window unscaled', () => {
    const stats = effectiveStats(
      CONFIG.shipClasses.torpedoBoat,
      new Array<LineId>(CATALOG.reload.cap).fill('reload'),
    );
    expect(stats.cooldownScale).toBeLessThan(1);
    expect(stats.equipment.boost.reloadMs).toBeCloseTo(CONFIG.boost.reloadMs * stats.cooldownScale, 9);
    expect(stats.equipment.boost.durationMs).toBe(CONFIG.boost.durationMs); // the window is NOT scaled
    expect(stats.equipment.boost.maxAmmo).toBe(CONFIG.boost.maxAmmo);
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
