// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2). A ship's loadout IS its equipment runtime: 4 slots (gun,
// two specials, one extra), each either empty or holding one equipment id +
// its state. The fit is per-hull (Stories 1.6–1.8): the Torpedo Boat carries
// [gun, heavyTorpedo, speedBoost, empty], the Battleship carries
// [gun, broadside, starShells, empty], the Mine Layer carries
// [gun, navalMines, radarBuoy, empty] (Story 7-5 wave 2), while every drone keeps the
// universal fit [gun, heavyTorpedo, navalMines, empty]. speedBoost is the ONLY non-weapon
// (instant-activation) special left. Pure, zero I/O.

import type { HullId } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/**
 * Equipment ids fittable into a loadout slot (weapons + activated abilities) —
 * WIDENED to catalog v3 (Story 8.1, Eric ruling 2026-09-15 amendment 6). The
 * thirteen v3 ids plus the two LEGACY ids no v3 card can address.
 *
 * THE LEGACY RENAME: the shipped `torpedo` IS `heavyTorpedo` and the shipped
 * `mine` IS `navalMines` — same module, same numbers, v3 name (8.13 adds the
 * light/supercavitating torpedoes and the captive mine as NEW modules beside
 * them).
 *
 * `speedBoost` and `radarBuoy` survive as LEGACY ids with live modules and no
 * card behind them: Story 8.9 turns the boost into the universal Shift ability
 * (which is what the v3 `boost` id is reserved for) and Story 8.15 deletes the
 * radar buoy in favour of the DECOY BUOY consumable (catalog-v3 R1). Until
 * then their rows keep their shipped numbers so the fit is unchanged.
 */
export type EquipmentId =
  | 'gun'
  | 'boost'
  | 'lightTorpedo'
  | 'heavyTorpedo'
  | 'supercavTorpedo'
  | 'navalMines'
  | 'captiveMines'
  | 'missile'
  | 'machineGun'
  | 'flak'
  | 'monitor'
  | 'broadside'
  | 'starShells'
  | 'speedBoost'
  | 'radarBuoy';

/**
 * THE single source of the weapon/ability split: true iff a piece of equipment
 * is a WEAPON in the mechanical sense — aimed, primed, fired at a clicked
 * target. A `false` entry is an instant, non-aimed ACTIVATION (boost precedent)
 * that rides the actSeq ability channel. Server equipment rows and the client
 * activation path both read this map — nothing re-derives the split ad hoc.
 * Compile-forced to cover every EquipmentId.
 */
export const EQUIPMENT_IS_WEAPON: Record<EquipmentId, boolean> = {
  gun: true,
  // Story 8.9 builds the Shift boost; the row exists so the equipment record
  // stays TOTAL over EquipmentId. Not fittable, not aimed.
  boost: false,
  lightTorpedo: true,
  // Story 2.8 (amendment 45) and the v3 rename: the mine is a click-aimed
  // WEAPON — prime, aim within the rear arc, click places at the clicked point
  // up to placeRange.
  heavyTorpedo: true,
  supercavTorpedo: true,
  navalMines: true,
  captiveMines: true,
  missile: true,
  machineGun: true,
  flak: true,
  monitor: true,
  // Story 7-5 wave 2: the BROADSIDE BARRAGE — prime, aim into ONE of the two
  // beam sectors (sim/arcs.ts 'twin-sector'), click fires that side's whole
  // barrage at the clicked point's RANGE. A click outside both sectors is
  // denied out-of-arc.
  broadside: true,
  starShells: true, // Story 1.7: prime-then-click skillshot (spawns a lit zone at burst)
  speedBoost: false, // legacy instant-activation ability (Story 8.9 replaces it)
  // Story 7-5 wave 2 (R2.7): the RADAR BUOY is CLICK-PLACED like the mine — it
  // shares the mine's rear sector and placeRange — so it is a WEAPON.
  radarBuoy: true,
};

/** Every EquipmentId, in declaration order — the totality spine the equipment
 *  stat record and the catalog's slotFill validation both key on. */
export const EQUIPMENT_IDS: readonly EquipmentId[] = Object.freeze(
  Object.keys(EQUIPMENT_IS_WEAPON) as EquipmentId[],
);

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

/** The effective pool size for a piece of equipment — a record lookup since
 *  Story 8.1 made `EffectiveStats.equipment` TOTAL over EquipmentId. */
export function equipmentMaxAmmo(stats: EffectiveStats, id: EquipmentId): number {
  return stats.equipment[id].maxAmmo;
}

/** The effective reload (ms) for a piece of equipment. Every row carries
 *  `reloadMs` (Story 8.1), post-tier-step and post-cooldownScale. */
export function equipmentReloadMs(stats: EffectiveStats, id: EquipmentId): number {
  return stats.equipment[id].reloadMs;
}

/** The two specials (slots 1–2) each hull id fits: heavyTorpedo + speedBoost for the
 *  Torpedo Boat (1.6), broadside + starShells for the Battleship (7-5 wave 2),
 *  navalMines + radarBuoy for the Mine Layer (7-5 wave 2).
 *
 *  PvE FLEET HULLS FIT NOTHING (Story 5.6, epic-5 amendment 34). They used to
 *  fall through this function's catch-all and inherit the universal
 *  heavy torpedo + naval mine — so every drone afloat carried loaded tubes and a mine rack
 *  it could never use, with both reload timers ticking every tick forever.
 *  Eric's ruling is *"each has a gun to defend itself"*, singular, so the
 *  specials are gone and the gun in slot 0 is the whole fit. */
function specialsFor(hullId: HullId): [EquipmentId | null, EquipmentId | null] {
  if (hullId === 'torpedoBoat') return ['heavyTorpedo', 'speedBoost'];
  if (hullId === 'battleship') return ['broadside', 'starShells'];
  if (hullId === 'mineLayer') return ['navalMines', 'radarBuoy'];
  return [null, null]; // PvE fleet hulls: gun only
}

/**
 * The loadout a given hull id spawns with (per-hull, Stories 1.6–1.8, 5.6). The
 * Torpedo Boat fits [gun, heavyTorpedo, speedBoost, empty]; the Battleship fits
 * [gun, broadside, starShells, empty]; the Mine Layer fits
 * [gun, navalMines, radarBuoy, empty] (Story 7-5 wave 2); a PvE fleet hull fits
 * [gun, empty, empty, empty] (Story 5.6). Fitted slots start with a full
 * pool and an idle reload timer — exactly matching server
 * `freshAmmo(equipmentMaxAmmo(stats, id))` semantics.
 */
export function loadoutFor(hullId: HullId, stats: EffectiveStats): LoadoutSlot[] {
  const slot = (equipmentId: EquipmentId | null): LoadoutSlot =>
    equipmentId === null
      ? { equipmentId: null, state: null }
      : { equipmentId, state: { n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 } };
  const [slotOne, slotTwo] = specialsFor(hullId);
  return [slot('gun'), slot(slotOne), slot(slotTwo), slot(null)];
}
