// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2, re-cut in Story 8.5). A ship's loadout IS its equipment
// runtime: NINE FIXED-ROLE SLOTS, identical for every captain hull —
// [gun, boost, weapon, weapon, weapon, consumable ×4] — each either empty or
// holding one equipment id + its state.
//
// THE PER-HULL FIT IS GONE (Story 8.5, epic-8 amendments 21–24). There is no
// `specialsFor` and no `SLOT_EXTRA`: every captain sails with the SAME shape,
// and class identity lives in the DECK (the cards a hull draws), not in the
// hardware. A hull's shipped class weapons are seeded at spawn AS CARDS
// (`SPAWN_SEED` in sim/catalog.ts) until Story 8.10's level-zero offer
// replaces that seed, and they land in the weapon row like any other card.
//
// Slot 1 holds the LEGACY `speedBoost` module on every captain — the boost
// stopped being a Torpedo Boat privilege here (amendment 23) at its shipped
// numbers; Story 8.9 renames the id to the universal `boost`.
//
// PvE FLEET HULLS FIT THE GUN AND NOTHING ELSE (epic-5 amendment 34, epic-8
// amendment 24): Eric's ruling is "each has a gun to defend itself", singular.
// They used to inherit a universal torpedo + mine fit — loaded tubes they
// could never use, with both reload timers ticking forever.
//
// Pure, zero I/O.

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

/** Total slots in a loadout: gun, boost, three weapons, four consumables. */
export const SLOT_COUNT = 9;

/** Slot index of the gun — the permanently-selected default weapon. */
export const SLOT_GUN = 0;

/** Slot index of the boost — the universal Shift ability (amendment 23). */
export const SLOT_BOOST = 1;

/** The three WEAPON slots (Q/E/R), in fill order: a `slotFill` card takes the
 *  first of these that is still empty (sim/boons.ts applySlotEffect). */
export const WEAPON_SLOTS = [2, 3, 4] as const;

/** The four CONSUMABLE slots (the `1`–`4` belt). Empty all of Story 8.5 —
 *  Story 8.7 builds the rack that stocks them. */
export const CONSUMABLE_SLOTS = [5, 6, 7, 8] as const;

/** The role a slot plays in the grammar. */
export type SlotRole = 'gun' | 'boost' | 'weapon' | 'consumable';

/** Slot-role grammar, in slot order (index = slot index). Fixed for every
 *  hull: the roles are the grammar, the contents are the build. */
export const SLOT_ROLES: readonly [
  SlotRole, SlotRole, SlotRole, SlotRole, SlotRole, SlotRole, SlotRole, SlotRole, SlotRole,
] = ['gun', 'boost', 'weapon', 'weapon', 'weapon', 'consumable', 'consumable', 'consumable', 'consumable'];

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

/**
 * The loadout a ship spawns with — THE SAME NINE-SLOT SHAPE FOR EVERY CAPTAIN
 * HULL (Story 8.5). A captain fits the gun in slot 0 and the boost in slot 1,
 * both with a full pool and an idle reload timer (exactly the server's
 * `freshAmmo(equipmentMaxAmmo(stats, id))` semantics); slots 2–8 start empty
 * and are filled by CARDS (the spawn seed first, then the offers).
 *
 * `fleet === true` is the PvE drone fit: the gun in slot 0 and eight empties,
 * nothing else (epic-5 amendment 34, epic-8 amendment 24).
 *
 * No hull parameter: which weapons a hull ends up carrying is a fact about its
 * deck and its picks, never about its hardware.
 */
export function loadoutFor(stats: EffectiveStats, fleet = false): LoadoutSlot[] {
  const fitted = (equipmentId: EquipmentId): LoadoutSlot => ({
    equipmentId,
    state: { n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 },
  });
  const out: LoadoutSlot[] = [fitted('gun')];
  if (!fleet) out.push(fitted('speedBoost'));
  while (out.length < SLOT_COUNT) out.push({ equipmentId: null, state: null });
  return out;
}
