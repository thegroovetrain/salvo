// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2). A ship's loadout IS its equipment runtime: 4 slots (gun,
// two specials, one extra), each either empty or holding one equipment id +
// its state. The fit is now per-hull (Story 1.6): the Torpedo Boat carries
// [gun, torpedo, speedBoost, empty], while every other hull — Battleship,
// Mine Layer, and all drones — keeps the universal fit [gun, torpedo, mine,
// empty] until Stories 1.7/1.8. speedBoost is the first non-weapon special.
// Pure, zero I/O.

import type { HullId } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/** Equipment ids fittable into a loadout slot (weapons + the speed-boost ability). */
export type EquipmentId = 'gun' | 'torpedo' | 'mine' | 'speedBoost';

/**
 * THE single source of the weapon/ability split: true iff a piece of equipment
 * is a weapon (aimed, primed, fired at a target). A `false` entry is an
 * instant-activation ABILITY that emits nothing spatial. Server equipment rows
 * and the client activation path both read this map — nothing re-derives the
 * split ad hoc. Compile-forced to cover every EquipmentId.
 */
export const EQUIPMENT_IS_WEAPON: Record<EquipmentId, boolean> = {
  gun: true,
  torpedo: true,
  mine: true,
  speedBoost: false,
};

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

/** Slot index of the gun — the permanently-selected default weapon. */
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

/** The effective pool size for a piece of equipment. */
export function equipmentMaxAmmo(stats: EffectiveStats, id: EquipmentId): number {
  return {
    gun: stats.gun.maxAmmo,
    torpedo: stats.torpedo.maxAmmo,
    mine: stats.mine.maxAmmo,
    speedBoost: stats.boost.maxAmmo,
  }[id];
}

/** The effective reload (ms) for a piece of equipment. */
export function equipmentReloadMs(stats: EffectiveStats, id: EquipmentId): number {
  return {
    gun: stats.gun.reloadMs,
    torpedo: stats.torpedo.reloadMs,
    mine: stats.mine.reloadMs,
    speedBoost: stats.boost.reloadMs,
  }[id];
}

/** The slot-2 special each hull id fits: speedBoost for the Torpedo Boat, mine for all others. */
function slotTwoEquipment(hullId: HullId): EquipmentId {
  return hullId === 'torpedoBoat' ? 'speedBoost' : 'mine';
}

/**
 * The loadout a given hull id spawns with (Story 1.6, per-hull). The Torpedo
 * Boat fits [gun, torpedo, speedBoost, empty]; every other hull id — Battleship,
 * Mine Layer, and all drone sizes — keeps the universal fit
 * [gun, torpedo, mine, empty]. Fitted slots start with a full pool and an idle
 * reload timer — exactly matching server `freshAmmo(equipmentMaxAmmo(stats, id))`
 * semantics. Further per-class variation is deferred to Stories 1.7-1.9.
 */
export function loadoutFor(hullId: HullId, stats: EffectiveStats): LoadoutSlot[] {
  const fittedSlot = (equipmentId: EquipmentId): LoadoutSlot => ({
    equipmentId,
    state: { n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 },
  });
  return [
    fittedSlot('gun'),
    fittedSlot('torpedo'),
    fittedSlot(slotTwoEquipment(hullId)),
    { equipmentId: null, state: null },
  ];
}
