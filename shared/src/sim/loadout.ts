// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2). A ship's loadout IS its equipment runtime: 4 slots (gun,
// two specials, one extra), each either empty or holding one equipment id +
// its state. The fit is per-hull (Stories 1.6–1.8): the Torpedo Boat carries
// [gun, torpedo, speedBoost, empty], the Battleship carries
// [gun, cannon, starShells, empty], the Mine Layer carries
// [gun, mine, decoyBuoy, empty] (Story 1.8), while every drone keeps the
// universal fit [gun, torpedo, mine, empty]. speedBoost, mine (as of 1.8), and
// decoyBuoy are the non-weapon (instant-activation) specials. Pure, zero I/O.

import type { HullId } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/** Equipment ids fittable into a loadout slot (weapons + activated abilities). */
export type EquipmentId =
  | 'gun'
  | 'torpedo'
  | 'mine'
  | 'speedBoost'
  | 'cannon'
  | 'starShells'
  | 'decoyBuoy';

/**
 * THE single source of the weapon/ability split: true iff a piece of equipment
 * is a WEAPON in the mechanical sense — aimed, primed, fired at a clicked
 * target. A `false` entry is an instant, non-aimed ACTIVATION (boost precedent)
 * that rides the actSeq ability channel. This is the mechanical aimed-click vs
 * instant split, NOT the design notion of "weapon": mines still DEAL DAMAGE
 * (Eric ruling 2026-07-22: mines are activateable, not a skillshot — drop
 * astern, arm, enemy pass-over trips a blast), they just no longer fly to a
 * click. Server equipment rows and the client activation path both read this
 * map — nothing re-derives the split ad hoc. Compile-forced to cover every
 * EquipmentId.
 */
export const EQUIPMENT_IS_WEAPON: Record<EquipmentId, boolean> = {
  gun: true,
  torpedo: true,
  mine: false, // Story 1.8: activateable (drop astern, no aim), not a click skillshot
  speedBoost: false,
  cannon: true, // Story 1.7: prime-then-click burst skillshot (gun pattern)
  starShells: true, // Story 1.7: prime-then-click skillshot (spawns a lit zone at burst)
  decoyBuoy: false, // Story 1.8: activated ability — drops a stationary radar-double
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
    cannon: stats.cannon.maxAmmo,
    starShells: stats.starShells.maxAmmo,
    decoyBuoy: stats.decoyBuoy.maxAmmo,
  }[id];
}

/** The effective reload (ms) for a piece of equipment. */
export function equipmentReloadMs(stats: EffectiveStats, id: EquipmentId): number {
  return {
    gun: stats.gun.reloadMs,
    torpedo: stats.torpedo.reloadMs,
    mine: stats.mine.reloadMs,
    speedBoost: stats.boost.reloadMs,
    cannon: stats.cannon.reloadMs,
    starShells: stats.starShells.reloadMs,
    decoyBuoy: stats.decoyBuoy.reloadMs,
  }[id];
}

/** The two specials (slots 1–2) each hull id fits: torpedo + speedBoost for the
 *  Torpedo Boat (1.6), cannon + starShells for the Battleship (1.7), mine +
 *  decoyBuoy for the Mine Layer (1.8); every drone keeps the universal
 *  torpedo + mine (the interregnum fit, unchanged). */
function specialsFor(hullId: HullId): [EquipmentId, EquipmentId] {
  if (hullId === 'torpedoBoat') return ['torpedo', 'speedBoost'];
  if (hullId === 'battleship') return ['cannon', 'starShells'];
  if (hullId === 'mineLayer') return ['mine', 'decoyBuoy'];
  return ['torpedo', 'mine'];
}

/**
 * The loadout a given hull id spawns with (per-hull, Stories 1.6–1.8). The
 * Torpedo Boat fits [gun, torpedo, speedBoost, empty]; the Battleship fits
 * [gun, cannon, starShells, empty]; the Mine Layer fits
 * [gun, mine, decoyBuoy, empty] (Story 1.8); every drone size keeps the
 * universal fit [gun, torpedo, mine, empty]. Fitted slots start with a full
 * pool and an idle reload timer — exactly matching server
 * `freshAmmo(equipmentMaxAmmo(stats, id))` semantics.
 */
export function loadoutFor(hullId: HullId, stats: EffectiveStats): LoadoutSlot[] {
  const fittedSlot = (equipmentId: EquipmentId): LoadoutSlot => ({
    equipmentId,
    state: { n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 },
  });
  const [slotOne, slotTwo] = specialsFor(hullId);
  return [
    fittedSlot('gun'),
    fittedSlot(slotOne),
    fittedSlot(slotTwo),
    { equipmentId: null, state: null },
  ];
}
