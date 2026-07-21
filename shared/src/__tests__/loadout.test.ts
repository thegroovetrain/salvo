// Pins the shared loadout spine: the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and the per-hull fit (Story 1.6).
// loadoutFor builds from a REAL effectiveStats() so pool sizes match what the
// server writes on spawn/respawn/redeploy: the Torpedo Boat fits
// [gun, torpedo, speedBoost, empty]; every other hull id keeps the universal
// [gun, torpedo, mine, empty]. Also pins the EQUIPMENT_IS_WEAPON split — the
// single source server rows and the client activation path read. Pure, zero I/O.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HULL_IDS,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  SLOT_GUN,
  SLOT_EXTRA,
  SLOT_ROLES,
  EQUIPMENT_IS_WEAPON,
  effectiveStats,
  equipmentMaxAmmo,
  equipmentReloadMs,
  hullEnvelope,
  loadoutFor,
  zeroUpgrades,
  type EffectiveStats,
  type EquipmentId,
  type HullId,
  type LoadoutSlot,
} from '../index.js';

/** Fresh effective stats for any hull id at zero upgrades. */
function statsFor(id: HullId): EffectiveStats {
  return effectiveStats(hullEnvelope(id), zeroUpgrades());
}

/** The slot-2 special each hull id fits under the Story 1.6 per-hull rule. */
function expectedSlotTwo(id: HullId): EquipmentId {
  return id === 'torpedoBoat' ? 'speedBoost' : 'mine';
}

describe('slot-grammar constants', () => {
  it('SLOT_COUNT is 4, SLOT_GUN 0, SLOT_EXTRA 3', () => {
    expect(SLOT_COUNT).toBe(4);
    expect(SLOT_GUN).toBe(0);
    expect(SLOT_EXTRA).toBe(3);
  });

  it('SLOT_ROLES is [gun, special, special, extra] and its length matches SLOT_COUNT', () => {
    expect(SLOT_ROLES).toEqual(['gun', 'special', 'special', 'extra']);
    expect(SLOT_ROLES).toHaveLength(SLOT_COUNT);
    expect(SLOT_ROLES[SLOT_GUN]).toBe('gun');
    expect(SLOT_ROLES[SLOT_EXTRA]).toBe('extra');
  });
});

describe('EQUIPMENT_IS_WEAPON — the weapon/ability split', () => {
  it('marks the three weapons true and the speed boost false', () => {
    expect(EQUIPMENT_IS_WEAPON).toEqual({
      gun: true,
      torpedo: true,
      mine: true,
      speedBoost: false,
    });
  });

  it('every value is a boolean (runtime completeness over EquipmentId)', () => {
    for (const value of Object.values(EQUIPMENT_IS_WEAPON)) {
      expect(typeof value).toBe('boolean');
    }
  });
});

describe('loadoutFor — the per-hull fit (Story 1.6)', () => {
  it('the Torpedo Boat fits [gun, torpedo, speedBoost, empty]', () => {
    const stats = statsFor('torpedoBoat');
    const loadout = loadoutFor('torpedoBoat', stats);
    expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'speedBoost', null]);
    expect(loadout[2].state).toEqual({ n: equipmentMaxAmmo(stats, 'speedBoost'), reloadMsLeft: 0 });
    expect(loadout[2].state).toEqual({ n: CONFIG.speedBoost.maxAmmo, reloadMsLeft: 0 });
  });

  it('every non-TB hull id (BB / ML / drones) keeps the universal [gun, torpedo, mine, empty]', () => {
    for (const id of HULL_IDS) {
      if (id === 'torpedoBoat') continue;
      const loadout = loadoutFor(id, statsFor(id));
      expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'mine', null]);
    }
  });

  it('slot 2 is speedBoost for the TB, mine for everyone else — with class-correct pools', () => {
    for (const id of HULL_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      const slotTwo = expectedSlotTwo(id);
      expect(loadout[2].equipmentId).toBe(slotTwo);
      expect(loadout[2].state!.n).toBe(equipmentMaxAmmo(stats, slotTwo));
    }
  });

  it('is 4 slots, gun single-shot pool, empty extra, on every hull id', () => {
    for (const id of HULL_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      expect(loadout).toHaveLength(SLOT_COUNT);
      expect(loadout[SLOT_GUN].equipmentId).toBe('gun');
      expect(loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
      expect(loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
    }
  });

  it('fitted weapon/ability slots start with a full pool from equipmentMaxAmmo', () => {
    for (const id of SHIP_CLASS_IDS) {
      const stats = statsFor(id);
      const loadout = loadoutFor(id, stats);
      for (let i = 0; i < SLOT_EXTRA; i++) {
        const equipmentId = loadout[i].equipmentId!;
        expect(loadout[i].state).toEqual({ n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 });
      }
    }
  });
});

describe('equipmentMaxAmmo / equipmentReloadMs cover speedBoost (from stats.boost)', () => {
  it('speedBoost pool + reload come from CONFIG.speedBoost', () => {
    const stats = statsFor('torpedoBoat');
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(stats.boost.maxAmmo);
    expect(equipmentMaxAmmo(stats, 'speedBoost')).toBe(CONFIG.speedBoost.maxAmmo);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(stats.boost.reloadMs);
    expect(equipmentReloadMs(stats, 'speedBoost')).toBe(CONFIG.speedBoost.reloadMs);
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every hull id', () => {
    for (const id of HULL_IDS) {
      const loadout: LoadoutSlot[] = loadoutFor(id, statsFor(id));
      for (const slot of loadout) {
        expect(slot.state === null).toBe(slot.equipmentId === null);
      }
    }
  });
});
