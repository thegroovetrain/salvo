// Pins the shared loadout spine (Story 1.2): the slot grammar constants, the
// state-null-iff-equipmentId-null invariant, and defaultLoadout's universal
// fit — [gun, torpedo, mine, empty] — built from a REAL effectiveStats() so
// the pool sizes match what the server writes on spawn/respawn/redeploy. Pure,
// zero I/O, like the rest of the shared suite.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  SHIP_CLASS_IDS,
  SLOT_COUNT,
  SLOT_GUN,
  SLOT_EXTRA,
  SLOT_ROLES,
  defaultLoadout,
  effectiveStats,
  equipmentMaxAmmo,
  zeroUpgrades,
  type EffectiveStats,
  type EquipmentId,
  type LoadoutSlot,
} from '../index.js';

/** Fresh effective stats for a ship class at zero upgrades. */
function statsFor(classId: (typeof SHIP_CLASS_IDS)[number]): EffectiveStats {
  return effectiveStats(CONFIG.shipClasses[classId], zeroUpgrades());
}

/** Slot index (0/1/2) -> equipment id under today's universal fit. */
const EQUIPMENT_IDS: readonly EquipmentId[] = ['gun', 'torpedo', 'mine'];

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

describe('defaultLoadout — the universal fit', () => {
  it('is 4 slots: gun / torpedo / mine + one empty extra, pools from equipmentMaxAmmo', () => {
    const stats = statsFor('battleship');
    const loadout = defaultLoadout(stats);
    expect(loadout).toHaveLength(SLOT_COUNT);
    for (let i = 0; i < SLOT_EXTRA; i++) {
      expect(loadout[i].equipmentId).toBe(EQUIPMENT_IDS[i]);
      expect(loadout[i].state).toEqual({ n: equipmentMaxAmmo(stats, EQUIPMENT_IDS[i]), reloadMsLeft: 0 });
    }
    expect(loadout[SLOT_EXTRA]).toEqual({ equipmentId: null, state: null });
  });

  it('the gun slot is a single-shot 1-round pool on every class (universal standard gun)', () => {
    for (const classId of SHIP_CLASS_IDS) {
      const loadout = defaultLoadout(statsFor(classId));
      expect(loadout[SLOT_GUN].equipmentId).toBe('gun');
      expect(loadout[SLOT_GUN].state).toEqual({ n: 1, reloadMsLeft: 0 });
    }
  });

  it('the extra slot is empty (equipmentId null, state null)', () => {
    const loadout = defaultLoadout(statsFor('torpedoBoat'));
    expect(loadout[SLOT_EXTRA].equipmentId).toBeNull();
    expect(loadout[SLOT_EXTRA].state).toBeNull();
  });

  it('every class produces the same universal fit shape with class-correct pools', () => {
    for (const classId of SHIP_CLASS_IDS) {
      const stats = statsFor(classId);
      const loadout = defaultLoadout(stats);
      expect(loadout.map((s) => s.equipmentId)).toEqual(['gun', 'torpedo', 'mine', null]);
      for (let i = 0; i < SLOT_EXTRA; i++) {
        expect(loadout[i].state!.n).toBe(equipmentMaxAmmo(stats, EQUIPMENT_IDS[i]));
      }
    }
  });
});

describe('LoadoutSlot invariant — state is null iff equipmentId is null', () => {
  it('holds for every slot across every ship class', () => {
    for (const classId of SHIP_CLASS_IDS) {
      const loadout: LoadoutSlot[] = defaultLoadout(statsFor(classId));
      for (const slot of loadout) {
        expect(slot.state === null).toBe(slot.equipmentId === null);
      }
    }
  });
});
