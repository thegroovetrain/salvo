// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2, re-cut in Story 8.5). A ship's loadout IS its equipment
// runtime: NINE FIXED-ROLE SLOTS, identical for every captain hull —
// [gun, boost, weapon, weapon, weapon, consumable ×4] — each either empty or
// holding one equipment id + its state.
//
// THE PER-HULL FIT IS GONE (Story 8.5, epic-8 amendments 21–24). There is no
// `specialsFor` and no `SLOT_EXTRA`: every captain sails with the SAME shape,
// and class identity lives in the DECK (the cards a hull draws), not in the
// hardware. THE INTERIM SPAWN SEED IS GONE TOO (Story 8.10, amendment 62):
// every hull now spawns with THE GUN AND THE SHIFT BOOST ONLY, and the weapon
// row starts empty. The captain's first weapon comes from the LEVEL-ZERO OFFER
// granted at countdown start — the opening — and lands in the row as a card
// like every card after it.
//
// Slot 1 holds the `boost` module on every captain — THE SHIFT BOOST, a
// universal ability no card can address (Story 8.9, epic-8 amendments 54–55).
// The boost stopped being a Torpedo Boat privilege in Story 8.5 (amendment 23);
// 8.9 deleted the legacy flat-bonus id it wore until then.
//
// PvE FLEET HULLS FIT THE GUN AND NOTHING ELSE (epic-5 amendment 34, epic-8
// amendment 24): Eric's ruling is "each has a gun to defend itself", singular.
// They used to inherit a universal torpedo + mine fit — loaded tubes they
// could never use, with both reload timers ticking forever.
//
// Pure, zero I/O.

import { CONSUMABLE_IDS, type ConsumableId } from './effects.js';
import type { EffectiveStats } from './stats.js';

/**
 * Equipment ids fittable into a loadout slot (weapons + activated abilities) —
 * WIDENED to catalog v3 (Story 8.1, Eric ruling 2026-09-15 amendment 6). The
 * thirteen v3 ids plus the two LEGACY ids no v3 card can address.
 *
 * THE LEGACY RENAME: the shipped `torpedo` IS `heavyTorpedo` and the shipped
 * `mine` IS `navalMines` — same module, same numbers, v3 name (8.13 adds the
 * LIGHT torpedo and the CAPTIVE and FOULING mines as NEW modules beside them).
 *
 * STORY 8.13 SWAPPED ONE ID FOR ANOTHER (Eric rulings 2026-09-19, epic-8
 * amendments 74/81, both locked strings kept): `supercavTorpedo` LEFT for the
 * consumable id space — it is a prime-and-click belt fish with no reload, no
 * tiers and therefore no stat row — and `foulingMines` ARRIVED from the add-on
 * space, because FOULING MINES became its own tiered equipment line and the
 * add-on card was deleted.
 *
 * `radarBuoy` is the ONE legacy id left with a live module and no card behind
 * it: Story 8.15 deletes it in favour of the DECOY BUOY consumable (catalog-v3
 * R1), and until then its row keeps its shipped numbers so the fit is
 * unchanged. The legacy flat-bonus boost id is GONE (Story 8.9): the v3
 * `boost` id IS the Shift boost, universal in slot 1 on every captain hull.
 */
export type EquipmentId =
  | 'gun'
  | 'boost'
  | 'lightTorpedo'
  | 'heavyTorpedo'
  | 'navalMines'
  | 'captiveMines'
  | 'foulingMines'
  | 'missile'
  | 'machineGun'
  | 'flak'
  | 'monitor'
  | 'broadside'
  | 'starShells'
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
  // THE SHIFT BOOST (Story 8.9) — universal ability, slot 1 on every captain
  // hull: an instant activation off the Shift edge, aimed at nothing.
  boost: false,
  lightTorpedo: true,
  // Story 2.8 (amendment 45) and the v3 rename: the mine is a click-aimed
  // WEAPON — prime, aim within the rear arc, click places at the clicked point
  // up to placeRange.
  heavyTorpedo: true,
  navalMines: true,
  captiveMines: true,
  foulingMines: true,
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
  // Story 7-5 wave 2 (R2.7): the RADAR BUOY is CLICK-PLACED like the mine — it
  // shares the mine's rear sector and placeRange — so it is a WEAPON.
  radarBuoy: true,
};

/**
 * WHAT A SLOT MAY HOLD (Story 8.7): a piece of EQUIPMENT (slots 0–4) or a
 * CONSUMABLE line (the four belt slots). The two id spaces stay DISJOINT —
 * `EquipmentId` is never widened — because five records are keyed by
 * EquipmentId (`EquipmentRows`, `EQUIPMENT_STAT_FIELDS`, `EQUIPMENT_IS_WEAPON`,
 * the server's equipment registry, the client's glyph table) and every
 * consumable entry in them would be a lie: a stack has no stat row, no reload
 * and no module. The union lives at the ONE place that holds either — the slot
 * — which forces a narrowing guard (`isConsumableId`) at each read instead of
 * a cast.
 */
export type SlotItemId = EquipmentId | ConsumableId;

/**
 * The consumable half of the weapon/ability split (D21) — the same law
 * `EQUIPMENT_IS_WEAPON` states for equipment: true iff the consumable is AIMED
 * and fired at a clicked point, false iff it is an instant activation off the
 * `1`–`4` rail. TWO are click-aimed: the DECOY BUOY (catalog-v3 R1, the buoy
 * it replaces was too) and the SUPERCAV TORPEDO (epic-8 amendment 74).
 * Compile-forced to cover every ConsumableId.
 */
export const CONSUMABLE_IS_WEAPON: Readonly<Record<ConsumableId, boolean>> = {
  hullRepair: false,
  shieldBlock: false,
  smokeScreen: false,
  chaff: false,
  decoyBuoy: true,
  // DEPTH CHARGE (amendment 83) — STUB: Eric's line, mechanism a later story.
  // Declared NON-aimed until he rules; a stub is never dealt, so nothing can
  // reach either channel with it today.
  depthCharge: false,
  // SUPERCAV TORPEDO (amendment 74) — the ONE consumable that is a WEAPON in
  // the mechanical sense besides the decoy: the digit primes, a click inside
  // the bow ±15° sector fires one fish (`KEY PRIMES · CLICK FIRES`).
  supercavTorpedo: true,
};

/** Membership over the ONE consumable id list (sim/effects.ts) — never a second
 *  copy of it. */
const CONSUMABLE_ITEM_SET: ReadonlySet<string> = new Set(CONSUMABLE_IDS);

/**
 * THE narrowing guard. Every site that reads an EquipmentId-keyed record with a
 * slot's content runs this first; the `false` branch narrows to `EquipmentId`
 * because the two unions are disjoint, so no cast is ever needed.
 */
export function isConsumableId(id: string): id is ConsumableId {
  return CONSUMABLE_ITEM_SET.has(id);
}

/** The weapon/ability split over EITHER kind of slot content — the ONE
 *  predicate both dispatch channels (the aimed fireSeq path and the instant
 *  actSeq path) call, on the server and on the client. */
export function isWeaponItem(id: SlotItemId): boolean {
  return isConsumableId(id) ? CONSUMABLE_IS_WEAPON[id] : EQUIPMENT_IS_WEAPON[id];
}

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
 *
 * A CONSUMABLE STACK (Story 8.7) uses the same shape with `n` = COPIES HELD and
 * `reloadMsLeft` 0 FOREVER: a stack never reloads (catalog-v3 R40 — every copy
 * of the line is one use, and the only way to get another is another card), so
 * the server's reload tick and the client's cooldown wipe both skip the belt.
 */
export interface EquipmentState {
  n: number; // charges/rounds ready (0 = empty)
  reloadMsLeft: number; // ms until the next charge tops up the pool (0 = idle)
}

/**
 * One loadout slot. INVARIANT: `state` is null iff `equipmentId` is null — an
 * empty slot carries no state to dereference; a fitted slot always has state.
 *
 * `equipmentId` holds a `SlotItemId`: an EquipmentId in the gun, boost and
 * weapon slots (0–4), and a CONSUMABLE line id in a BELT slot (5–8, Story 8.7).
 * The FIELD NAME is unchanged — it rides every mirror, view model and test on
 * both sides — but a reader that indexes an EquipmentId-keyed record with it
 * must narrow through `isConsumableId` first (never a cast).
 */
export interface LoadoutSlot {
  equipmentId: SlotItemId | null;
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
 *  Story 8.1 made `EffectiveStats.equipment` TOTAL over EquipmentId. A SLOT's
 *  content may be a consumable instead, which has no stats row: `slotMaxAmmo`
 *  (sim/boons.ts) routes either kind and is what slot-facing code calls. */
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
 * and are filled by CARDS — the level-zero offer at the start line first
 * (Story 8.10), then every offer after it.
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
  if (!fleet) out.push(fitted('boost'));
  while (out.length < SLOT_COUNT) out.push({ equipmentId: null, state: null });
  return out;
}
