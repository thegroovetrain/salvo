// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2, re-cut in Story 8.5 and again in Story 10.5). A ship's
// loadout IS its equipment runtime: FIVE FIXED-ROLE SLOTS, identical in SHAPE
// for every captain hull — [battery, Shift, torpedo, mine, special shell] —
// each either empty or holding one equipment id + its state.
//
// STORY 10.5 (Eric 2026-11-05, epic-10 amendment 11): THE KIT IS RETIRED. The
// four consumable slots, the per-ship `ConsumableKit` and the whole consumable
// id space are deleted; the three weapon slots become FAMILY SLOTS — `Q`
// torpedo, `E` mine, `R` special shell — ONE KIND PER SLOT FOR THE MATCH
// (`EQUIPMENT_FAMILY` / `familySlotFor` below). A first card of a family fills
// THAT family's slot whatever order the cards arrive in; a second kind of a
// filled family has nowhere to go (sim/boons.ts `pickRefusal`, sim/draw.ts).
// HULL REPAIR (`C`) and SMOKE (`V`) are cooldown ABILITIES that occupy no
// slot (sim/abilities.ts).
//
// THE PER-HULL FIT IS GONE (Story 8.5, epic-8 amendments 21–24). There is no
// `specialsFor` and no `SLOT_EXTRA`: every captain sails with the SAME shape,
// and class identity lives in the CARDS a hull is dealt and its envelope, not
// in the hardware. THE INTERIM SPAWN SEED IS GONE TOO (Story 8.10, amendment 62):
// every hull now spawns with THE GUN AND THE SHIFT ONLY, and the weapon
// row starts empty. The captain's first weapon comes from the LEVEL-ZERO OFFER
// granted at countdown start — the opening — and lands in its family slot as a
// card like every card after it.
//
// Slot 0 holds THE MAIN BATTERY on a captain's hull (Story 10.4, Eric
// 2026-11-04, epic-10 amendments 7 and 9): the `mainBattery` module, whose
// per-turret truth lives in sim/turrets.ts. The seat-gun pick (deck gun /
// machine gun / flak) is GONE with the three scaffold classes.
//
// Slot 1 holds the SEAT'S SHIFT — an ability no card can address, PICKED by
// the captain at ship select in the retired gun pick's place (Story 10.4,
// R7; default SPEED BOOST). From Story 8.15 to 10.4 it was fixed per class
// (`CONFIG.shipClasses.<id>.shift`, epic-8 amendments 89(c) and 97–102);
// that field and `classShift()` are gone.
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
 * WIDENED to catalog v3 (Story 8.1, Eric ruling 2026-09-15 amendment 6).
 *
 * STORY 8.15 RE-CUT IT (Eric rulings 2026-09-21/28, epic-8 amendments 89 and
 * 97–106): `missile` and `monitor` are CUT for good (amendment 89(e)); the
 * two new SHIFT ids `instantReload` and `hunker` join `boost` as the three
 * non-weapon class abilities slot 1 may hold; `machineGun` and `flak` stop
 * being stubs and become the two MOUNTABLE GUNS slot 0 may hold beside `gun`
 * (the cannon).
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
 * STORY 8.17 ADDED ONE (Eric ruling 2026-09-29, epic-8 amendment 131):
 * `phosphorShells` ARRIVED from the add-on space — PHOSPHOR SHELLS is its own
 * tiered 360° weapon line now, not a star-shell verb (the locked id is kept).
 *
 * The legacy flat-bonus boost id is GONE (Story 8.9): the v3 `boost` id IS the
 * speed boost.
 *
 * STORY 10.5 BROUGHT THREE BACK (Eric 2026-11-05, epic-10 amendment 11):
 * `supercavTorpedo`, `dazzleShells` (FLASH SHELLS — the locked id is kept) and
 * `foulingShell` are RELOADING SLOT WEAPONS again, with a stat row and five
 * tiers each; the consumable id space they sat in from 8.13 / 8.17 / 9.4 is
 * deleted with the kit. Appended LAST, after `mainBattery`, so every
 * pre-existing id keeps its place in `EQUIPMENT_IDS`.
 */
export type EquipmentId =
  | 'gun'
  | 'boost'
  | 'lightTorpedo'
  | 'heavyTorpedo'
  | 'navalMines'
  | 'captiveMines'
  | 'foulingMines'
  | 'machineGun'
  | 'flak'
  | 'broadside'
  | 'starShells'
  | 'phosphorShells'
  | 'instantReload'
  | 'hunker'
  | 'mainBattery'
  | 'supercavTorpedo'
  | 'dazzleShells'
  | 'foulingShell';

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
  // THE SPEED BOOST (Story 8.9) — the Torpedo Boat's class Shift since 8.15
  // (amendment 89(c)): an instant activation off the Shift edge, aimed at
  // nothing.
  boost: false,
  lightTorpedo: true,
  // Story 2.8 (amendment 45) and the v3 rename: the mine is a click-aimed
  // WEAPON — prime, aim within the rear arc, click places at the clicked point
  // up to placeRange.
  heavyTorpedo: true,
  navalMines: true,
  captiveMines: true,
  foulingMines: true,
  // THE TWO PICKABLE GUNS (Story 8.15, amendments 103–106): mounted in slot 0
  // from the seat's `gun`, 360° like the cannon. The MACHINE GUN fires off the
  // held LEVEL (`InputMsg.held`), never a click; the FLAK GUN fires one
  // air-bursting shell per click like the cannon.
  machineGun: true,
  flak: true,
  // Story 7-5 wave 2: the BROADSIDE BARRAGE — prime, aim into ONE of the two
  // beam sectors (sim/arcs.ts 'twin-sector'), click fires that side's whole
  // barrage at the clicked point's RANGE. A click outside both sectors is
  // denied out-of-arc.
  broadside: true,
  starShells: true, // Story 1.7: prime-then-click skillshot (spawns a lit zone at burst)
  // PHOSPHOR SHELLS (Story 8.17, amendment 131): prime, click fires one 360°
  // shell that bursts into a burning zone.
  phosphorShells: true,
  // THE TWO NEW CLASS SHIFTS (Story 8.15): INSTANT RELOAD (the Mine Layer's,
  // amendments 97–98) and HUNKER (the Battleship's, amendments 99–102).
  // Both are instant activations off the Shift edge, aimed at nothing — the
  // boost's grammar exactly.
  instantReload: false,
  hunker: false,
  // THE MAIN BATTERY (Story 10.4): a captain's slot 0 — click-aimed, one
  // turret per click (sim/turrets.ts). Appended LAST so every pre-existing
  // id keeps its place in `EQUIPMENT_IDS`.
  mainBattery: true,
  // THE THREE MOVED WEAPONS (Story 10.5): ready the slot, click fires — the
  // supercav from its launchers (Story 10.6), the flash and fouling shells at any bearing.
  supercavTorpedo: true,
  dazzleShells: true,
  foulingShell: true,
};

/**
 * THE SHIFT ids (Story 8.15, Eric rulings 2026-09-21/28, epic-8 amendments
 * 89(c) and 97–102) — the three non-weapon abilities slot 1 may hold. THE
 * SEAT'S PICK since Story 10.4 (Eric 2026-11-04, R7, epic-10 amendment 9): any
 * hull, chosen at ship select and frozen on the seat, in the place the retired
 * deck-gun pick held. Each is its own `EquipmentId` rather than one module
 * dispatching on hull, so the stat row, the server registry, the bot tactic rows and the HUD glyph table all key on
 * the id with no hull special case.
 */
export type ShiftId = 'boost' | 'instantReload' | 'hunker';

/** Every ShiftId, in pick order. */
export const SHIFT_IDS: readonly ShiftId[] = Object.freeze(['boost', 'instantReload', 'hunker'] as const);

/** The Shift a seat carries when the pick is missing, unknown or malformed — SPEED BOOST (R7). */
export const DEFAULT_SHIFT: ShiftId = 'boost';

const SHIFT_ID_SET: ReadonlySet<string> = new Set<string>(SHIFT_IDS);

/** Is `x` one of the three Shifts? Fail-closed: anything else is not. */
export function isShiftId(x: unknown): x is ShiftId {
  return typeof x === 'string' && SHIFT_ID_SET.has(x);
}

/**
 * Coerce arbitrary (wire / localStorage / join-option) input to a valid Shift,
 * default `DEFAULT_SHIFT`. Never throws — the same fail-open contract as
 * `sanitizeClassId`.
 */
export function sanitizeShiftId(raw: unknown): ShiftId {
  return isShiftId(raw) ? raw : DEFAULT_SHIFT;
}

/** Every EquipmentId, in declaration order — the totality spine the equipment
 *  stat record and the catalog's slotFill validation both key on. */
export const EQUIPMENT_IDS: readonly EquipmentId[] = Object.freeze(
  Object.keys(EQUIPMENT_IS_WEAPON) as EquipmentId[],
);

// THE SEAT-GUN API IS GONE (2026-11-04, Story 10.4, epic-10 amendment 9):
// `GunId`, `GUN_IDS`, `DEFAULT_GUN`, `isGunId` and `MOUNTED_GUN` named the
// captain's deck-gun pick (Story 8.14/8.15). A captain mounts `mainBattery`
// now and picks a SHIFT instead; the CANNON / MACHINE GUN / FLAK modules stay
// as equipment ids for reference and for the PvE fleet, which mounts `gun`
// directly (`loadoutFor(stats, true)`).

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

/** Total slots in a loadout: battery, Shift, torpedo, mine, special shell
 *  (five since Story 10.5; nine with the kit from 10.1; eleven from 9.2). */
export const SLOT_COUNT = 5;

/** Slot index of the gun — the permanently-selected default weapon: THE MAIN
 *  BATTERY on a captain (Story 10.4), the `gun` module on a PvE drone. */
export const SLOT_GUN = 0;

/** Slot index of the seat's Shift (the boost, instant reload or hunker —
 *  Story 8.15; the captain's pick since 10.4). The name predates the split
 *  and is kept. */
export const SLOT_BOOST = 1;

/** The three WEAPON slots (Q/E/R), in key order. Since Story 10.5 each is a
 *  FAMILY slot: index k here is `SLOT_FAMILIES[k]`'s. */
export const WEAPON_SLOTS = [2, 3, 4] as const;

/**
 * THE THREE SLOT FAMILIES (Story 10.5, Eric 2026-11-05, epic-10 amendment 11),
 * in slot order: `Q` holds a TORPEDO, `E` a MINE, `R` a SPECIAL SHELL. A slot
 * holds ONE KIND of its family for the whole match — the first card of the
 * family picks it, later copies of that kind tier it up, and no other kind of
 * the family can ever be fitted or offered.
 */
export type SlotFamily = 'torpedo' | 'mine' | 'shell';

/** Every family, in slot order: `SLOT_FAMILIES[k]` owns `WEAPON_SLOTS[k]`. */
export const SLOT_FAMILIES: readonly SlotFamily[] = Object.freeze(['torpedo', 'mine', 'shell'] as const);

/** The fixed slot of each family (2 / 3 / 4 — the Q / E / R keys). */
export const FAMILY_SLOT: Readonly<Record<SlotFamily, number>> = Object.freeze({
  torpedo: WEAPON_SLOTS[0],
  mine: WEAPON_SLOTS[1],
  shell: WEAPON_SLOTS[2],
});

/**
 * THE FAMILY OF EVERY EQUIPMENT ID — `null` for anything that fits no family
 * slot: the mounted guns and the Shifts (slots 0 and 1, never a card fit) and
 * BROADSIDE, which LEFT THE DEAL (Eric 2026-11-05, Story 10.5, R6: "Leaves
 * the deal") and so has no slot to go to. Compile-forced to cover every
 * EquipmentId: a new weapon cannot ship without declaring its family.
 */
export const EQUIPMENT_FAMILY: Readonly<Record<EquipmentId, SlotFamily | null>> = Object.freeze({
  gun: null,
  boost: null,
  lightTorpedo: 'torpedo',
  heavyTorpedo: 'torpedo',
  navalMines: 'mine',
  captiveMines: 'mine',
  foulingMines: 'mine',
  machineGun: null,
  flak: null,
  broadside: null,
  starShells: 'shell',
  phosphorShells: 'shell',
  instantReload: null,
  hunker: null,
  mainBattery: null,
  supercavTorpedo: 'torpedo',
  dazzleShells: 'shell',
  foulingShell: 'shell',
});

/** The slot `id` is fitted into, or `null` for equipment no family slot holds
 *  (see `EQUIPMENT_FAMILY`) — and for an id outside that table (own keys
 *  only, so a prototype key is outside too). THE one kind → slot answer on
 *  both sides. */
export function familySlotFor(id: EquipmentId): number | null {
  const family = Object.hasOwn(EQUIPMENT_FAMILY, id) ? EQUIPMENT_FAMILY[id] : null;
  return family === null ? null : FAMILY_SLOT[family];
}

/** The family a slot index belongs to, or `null` for the battery, the Shift,
 *  an out-of-range or a non-integer slot. */
export function slotFamilyAt(slot: number): SlotFamily | null {
  const k = (WEAPON_SLOTS as readonly number[]).indexOf(slot);
  return k < 0 ? null : SLOT_FAMILIES[k];
}

/** Every equipment id of a family, in `EQUIPMENT_IDS` order — the kinds that
 *  compete for that family's one slot. */
export function familyMembers(family: SlotFamily): EquipmentId[] {
  return EQUIPMENT_IDS.filter((id) => EQUIPMENT_FAMILY[id] === family);
}

/** The role a slot plays in the grammar. */
export type SlotRole = 'gun' | 'boost' | 'weapon';

/** Slot-role grammar, in slot order (index = slot index), length SLOT_COUNT.
 *  Fixed for every hull: the roles are the grammar, the contents are the
 *  build. */
export const SLOT_ROLES: readonly SlotRole[] = Object.freeze([
  'gun',
  'boost',
  'weapon',
  'weapon',
  'weapon',
]);

/** The effective pool size for a piece of equipment — a record lookup since
 *  Story 8.1 made `EffectiveStats.equipment` TOTAL over EquipmentId. */
export function equipmentMaxAmmo(stats: EffectiveStats, id: EquipmentId): number {
  return stats.equipment[id].maxAmmo;
}

/** The effective reload (ms) for a piece of equipment. Every row carries
 *  `reloadMs` (Story 8.1), post-tier-step — and post-cooldownScale on every
 *  row but the Shifts (Story 10.5, R10 / R11: `RELOAD_UNSCALED_ROWS` in
 *  sim/stats.ts). */
export function equipmentReloadMs(stats: EffectiveStats, id: EquipmentId): number {
  return stats.equipment[id].reloadMs;
}

/**
 * The loadout a ship spawns with — THE SAME SLOT SHAPE FOR EVERY CAPTAIN HULL
 * (Story 8.5; five slots since Story 10.5). A captain fits the main battery
 * in slot 0 and the seat's Shift in slot 1, both with a full pool and an idle
 * reload timer (exactly the server's `freshAmmo(equipmentMaxAmmo(stats, id))`
 * semantics); the three family slots start empty and are filled by CARDS —
 * the level-zero offer at the start line first (Story 8.10), then every offer
 * after it.
 *
 * `fleet === true` is the PvE drone fit: the `gun` module in slot 0 and
 * empties, nothing else (epic-5 amendment 34, epic-8 amendment 24) — a drone
 * has no seat, no battery and no Shift; its weaker envelope gun rides the
 * `gun` row (Story 5.6).
 *
 * SLOT 0 IS THE MAIN BATTERY on a captain (Story 10.4). Its slot state is the
 * HOTBAR SUMMARY only — `n` = turrets ready (fitted full: every turret
 * loaded), `reloadMsLeft` = the soonest turret's remaining reload; the
 * per-turret truth is the `TurretState[]` beside the ship (sim/turrets.ts
 * `batterySummary` writes this pair from it).
 *
 * SLOT 1 IS THE SEAT'S SHIFT (Story 10.4): `shift` is the captain's pick,
 * passed in already sanitized (`sanitizeShiftId`). A fleet drone ignores it.
 *
 * No hull parameter: which weapons a hull ends up carrying is a fact about its
 * picks, never about its hardware (the turret count rides `stats`).
 */
export function loadoutFor(stats: EffectiveStats, fleet = false, shift: ShiftId = DEFAULT_SHIFT): LoadoutSlot[] {
  const fitted = (equipmentId: EquipmentId): LoadoutSlot => ({
    equipmentId,
    state: { n: equipmentMaxAmmo(stats, equipmentId), reloadMsLeft: 0 },
  });
  const out: LoadoutSlot[] = [fitted(fleet ? 'gun' : 'mainBattery')];
  if (!fleet) out.push(fitted(shift));
  while (out.length < SLOT_COUNT) out.push({ equipmentId: null, state: null });
  return out;
}
