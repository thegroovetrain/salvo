// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2). A ship's loadout IS its equipment runtime: 4 slots (gun,
// two specials, one extra), each either empty or holding one equipment id +
// its state. Today every class gets the same universal fit — [gun, torpedo,
// mine, empty] — matching the old positional weapon selection 1:1; per-class
// variation and non-weapon specials arrive in stories 1.6-1.9. Pure, zero I/O.

import type { WeaponId } from '../types.js';
import { weaponMaxAmmo, type EffectiveStats } from './stats.js';

/** Equipment ids fittable into a loadout slot (weapons only, for now). */
export type EquipmentId = 'gun' | 'torpedo' | 'mine';

/**
 * One piece of equipment's runtime state: a pool of `n` charges/rounds and a
 * single `reloadMsLeft` timer. Structurally identical to the wire `WeaponAmmo`
 * shape today (so wire derivation from slot state is identity), but defined
 * fresh here — loadout state is a shared-sim concept, not the wire contract.
 */
export interface EquipmentState {
  n: number; // charges/rounds ready (0 = empty)
  reloadMsLeft: number; // ms until the next charge tops up the pool (0 = idle)
}

/**
 * One loadout slot. INVARIANT: `state` is null iff `equipmentId` is null — an
 * empty slot carries no state to dereference; a fitted slot always has state.
 */
export interface LoadoutSlot {
  equipmentId: EquipmentId | null;
  state: EquipmentState | null;
}

/** Total slots in a loadout: gun, two specials, one extra. */
export const SLOT_COUNT = 4;

/** Slot index of the gun (also input.weapon === 0). */
export const SLOT_GUN = 0;

/** Slot index of the extra slot (empty in the universal fit today). */
export const SLOT_EXTRA = 3;

/** The role a slot plays in the grammar. */
export type SlotRole = 'gun' | 'special' | 'extra';

/** Slot-role grammar, in slot order (index = slot index). */
export const SLOT_ROLES: readonly [SlotRole, SlotRole, SlotRole, SlotRole] = [
  'gun',
  'special',
  'special',
  'extra',
];

/**
 * The universal loadout every ship class gets today: gun / torpedo / mine /
 * empty extra. Weapon slots start with a full pool and an idle reload timer —
 * exactly matching server `freshAmmo(weaponMaxAmmo(stats, weapon))` semantics.
 * Per-class variation is deferred to stories 1.6-1.9.
 */
export function defaultLoadout(stats: EffectiveStats): LoadoutSlot[] {
  const weaponSlot = (equipmentId: EquipmentId, weapon: WeaponId): LoadoutSlot => ({
    equipmentId,
    state: { n: weaponMaxAmmo(stats, weapon), reloadMsLeft: 0 },
  });
  return [
    weaponSlot('gun', 0),
    weaponSlot('torpedo', 1),
    weaponSlot('mine', 2),
    { equipmentId: null, state: null },
  ];
}
