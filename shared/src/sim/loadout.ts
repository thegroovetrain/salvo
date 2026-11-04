// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2, re-cut in Story 8.5). A ship's loadout IS its equipment
// runtime: NINE FIXED-ROLE SLOTS, identical in SHAPE for every captain hull —
// [gun, boost, weapon, weapon, weapon, consumable ×4] — each either empty or
// holding one equipment id + its state. Since Story 9.2 (epic-9 amendments 21
// and 31) the consumable slots are not a packed belt: EACH KIND OWNS ONE
// FIXED SLOT and one fixed key. From 9.2 to Story 10.1 that was a GLOBAL
// six-long key row (`CONSUMABLE_KEY_ORDER`, slots 5..10, keys 1–6).
//
// STORY 10.1 (Eric 2026-10-25/27, epic-10 amendments 1(c) and 3): the key row
// is PER SHIP — a `ConsumableKit` of exactly FOUR distinct non-stub consumable
// lines the captain picks on the port screen (bots roll a random four), keys
// back to 1–4, slots 5..8. `CONSUMABLE_KEY_ORDER` is DELETED; every kind →
// slot question takes the ship's kit (`consumableSlotFor(kit, id)`,
// `consumableKindAt(kit, slot)`), and a consumable outside the kit has NO slot
// — which is the one gate (sim/boons.ts pickRefusal) that keeps the draw and
// the drone drops inside the captain's four.
//
// THE PER-HULL FIT IS GONE (Story 8.5, epic-8 amendments 21–24). There is no
// `specialsFor` and no `SLOT_EXTRA`: every captain sails with the SAME shape,
// and class identity lives in the CARDS a hull is dealt and its envelope, not
// in the hardware. THE INTERIM SPAWN SEED IS GONE TOO (Story 8.10, amendment 62):
// every hull now spawns with THE GUN AND THE SHIFT BOOST ONLY, and the weapon
// row starts empty. The captain's first weapon comes from the LEVEL-ZERO OFFER
// granted at countdown start — the opening — and lands in the row as a card
// like every card after it.
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

import { CONSUMABLE_IDS, type ConsumableId } from './effects.js';
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
 * The legacy `radarBuoy` id is GONE (Story 8.16): the RADAR BUOY was deleted
 * end to end in favour of the DECOY BUOY consumable (catalog-v3 R1). The legacy flat-bonus boost id is GONE (Story 8.9): the v3
 * `boost` id IS the speed boost, the Torpedo Boat's Shift since 8.15.
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
  | 'mainBattery';

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
};

/**
 * THE SHIFT ids (Story 8.15, Eric rulings 2026-09-21/28, epic-8 amendments
 * 89(c) and 97–102) — the three non-weapon abilities slot 1 may hold. THE
 * SEAT'S PICK since Story 10.4 (Eric 2026-11-04, R7, epic-10 amendment 9): any
 * hull, chosen at ship select and frozen on the seat, in the place the retired
 * deck-gun pick held. Each is its own `EquipmentId` rather than one module
 * dispatching on hull, so the stat row (and with it RELOAD's `cooldownScale`),
 * the server registry, the bot tactic rows and the HUD glyph table all key on
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

/**
 * WHAT A SLOT MAY HOLD (Story 8.7): a piece of EQUIPMENT (slots 0–4) or a
 * CONSUMABLE line (its kit slot — four per ship since Story 10.1, six fixed
 * since Story 9.2). The two id spaces stay DISJOINT —
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
 * and fired at a clicked point, false iff it is an instant activation off its
 * fixed number key. SEVEN are click-aimed since Story 10.9: the SUPERCAV
 * TORPEDO (epic-8 amendment 74), the FOULING SHELL (Story 9.4), FLASH SHELLS
 * (Story 8.17 amendment 132, restored by 10.9) and the FOUR BUOYS (Story 10.9,
 * click-placed at any bearing — the deleted DECOY BUOY was click-placed too).
 * Compile-forced to cover every ConsumableId.
 */
export const CONSUMABLE_IS_WEAPON: Readonly<Record<ConsumableId, boolean>> = {
  hullRepair: false,
  shieldBlock: false,
  countermeasure: false, // an instant key activation (Story 9.3)
  // DEPTH CHARGE (amendment 83) — STUB: Eric's line, mechanism a later story.
  // Declared NON-aimed until he rules; a stub is never dealt, so nothing can
  // reach either channel with it today.
  depthCharge: false,
  // SUPERCAV TORPEDO (amendment 74) — the ONE consumable that is a WEAPON in
  // the mechanical sense besides the decoy: the digit primes, a click inside
  // the bow ±15° sector fires one fish (`KEY PRIMES · CLICK FIRES`).
  supercavTorpedo: true,
  // FOULING SHELL (Story 9.4, Eric 2026-10-11, epic-9 amendments 61–68;
  // replaces FLASH SHELLS): the digit primes, a click fires one 360° shell to
  // the radar rung whose burst leaves a stationary slowing zone.
  foulingShell: true,
  // FLASH SHELLS (Story 10.9, restoring epic-8 amendment 132): the digit
  // primes, a click fires one 360° shell on the fouling shell's path (same
  // reach) whose burst dazzles every non-owner hull inside it.
  dazzleShells: true,
  // THE FOUR BUOYS (Story 10.9, Eric 2026-10-28 ruling 9): the digit primes, a
  // click PLACES the buoy at any bearing out to `CONFIG.mine.placeRange`.
  radarBuoy: true,
  healingBuoy: true,
  shieldBuoy: true,
  speedBuoy: true,
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
 *
 * A CONSUMABLE STACK (Story 8.7) uses the same shape with `n` = COPIES HELD and
 * `reloadMsLeft` 0 FOREVER: a stack never reloads (catalog-v3 R40 — every copy
 * of the line is one use, and the only way to get another is another card), so
 * the server's reload tick and the client's cooldown wipe both skip the
 * consumable slots.
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
 * weapon slots (0–4), and a CONSUMABLE line id in that kind's OWN fixed slot
 * (5–8 by the ship's kit since Story 10.1; 5–10 by the global key row from
 * Story 9.2; a packed belt 5–8 from Story 8.7 until then).
 * The FIELD NAME is unchanged — it rides every mirror, view model and test on
 * both sides — but a reader that indexes an EquipmentId-keyed record with it
 * must narrow through `isConsumableId` first (never a cast).
 */
export interface LoadoutSlot {
  equipmentId: SlotItemId | null;
  state: EquipmentState | null;
}

/**
 * THE KIT (Story 10.1, Eric 2026-10-25/27, epic-10 amendments 1(c) and 3): the
 * FOUR consumable lines a ship carries, in KEY ORDER — key `1` is index 0,
 * slot `FIRST_CONSUMABLE_SLOT + i` holds `kit[i]` and nothing else, for the
 * whole match. A captain picks the four on the port screen (saved like the
 * callsign); a bot rolls four at spawn (`rollKit`, sim/boons.ts). The kit is
 * a SEAT value like the gun: it rides the join, lives on the server's ship
 * record and comes back self-privately on `OwnShip.kit`, which is what both
 * sides derive every kind → slot answer from. Nothing global remains: the 9.2
 * key row (`CONSUMABLE_KEY_ORDER`, six fixed keys) is DELETED, not aliased.
 *
 * INVARIANTS (`isConsumableKit`, sim/boons.ts — the ONE validator both sides
 * call; it needs the catalog, which this leaf module may not import):
 * length exactly `KIT_SIZE`, every entry distinct, every entry a NON-STUB
 * consumable line (the DEPTH CHARGE stub can never be carried). The helpers
 * here are pure index arithmetic over whatever kit they are handed and
 * fail closed on a malformed one (an entry past `KIT_SIZE` has no slot).
 */
export type ConsumableKit = readonly ConsumableId[];

/** How many consumable lines a ship carries — four (Eric 2026-10-25). The
 *  structural number behind the slot count, the key row and the port picker;
 *  NOT a CONFIG tunable. */
export const KIT_SIZE = 4;

/**
 * The kit a FRESH BROWSER sails with (Eric 2026-10-27, Story 10.1 ruling 5):
 * `1` HULL REPAIR · `2` SHIELD BLOCK · `3` SMOKE SCREEN (the `countermeasure`
 * line, renamed back player-side by the same ruling; id untouched) · `4`
 * FOULING SHELL — the first four of the retired 9.2 key row. Also what the
 * server falls back to when a join carries no valid kit (fail-open, like the
 * gun).
 */
export const DEFAULT_KIT: ConsumableKit = Object.freeze([
  'hullRepair',
  'shieldBlock',
  'countermeasure',
  'foulingShell',
] as const);

/** Slot index of the first consumable slot (key `1`). */
const FIRST_CONSUMABLE_SLOT = 5;

/** Total slots in a loadout: gun, boost, three weapons, one per carried
 *  consumable (four since Story 10.1; six from 9.2; a four-wide belt from
 *  8.5). */
export const SLOT_COUNT = FIRST_CONSUMABLE_SLOT + KIT_SIZE;

/** Slot index of the gun — the permanently-selected default weapon: THE MAIN
 *  BATTERY on a captain (Story 10.4), the `gun` module on a PvE drone. */
export const SLOT_GUN = 0;

/** Slot index of the seat's Shift (the boost, instant reload or hunker —
 *  Story 8.15; the captain's pick since 10.4). The name predates the split
 *  and is kept. */
export const SLOT_BOOST = 1;

/** The three WEAPON slots (Q/E/R), in fill order: a `slotFill` card takes the
 *  first of these that is still empty (sim/boons.ts applySlotEffect). */
export const WEAPON_SLOTS = [2, 3, 4] as const;

/** The CONSUMABLE slots, in key order: slot `5 + i` is bound to `kit[i]` of
 *  whichever kit the ship sails with (Story 10.1). Derived from `KIT_SIZE`,
 *  never a second list. */
export const CONSUMABLE_SLOTS: readonly number[] = Object.freeze(
  Array.from({ length: KIT_SIZE }, (_, i) => FIRST_CONSUMABLE_SLOT + i),
);

/** THE slot of a consumable kind under `kit`, or `null` for a kind the ship
 *  does not carry (which since Story 10.1 includes every stub — a stub can
 *  never pass `isConsumableKit`). Fail-closed on a malformed kit: an entry
 *  past `KIT_SIZE` has no slot. */
export function consumableSlotFor(kit: ConsumableKit, id: ConsumableId): number | null {
  const i = kit.indexOf(id);
  return i < 0 || i >= KIT_SIZE ? null : FIRST_CONSUMABLE_SLOT + i;
}

/** THE kind a consumable slot is bound to under `kit`, or `null` for any slot
 *  that is not a consumable slot (gun, Shift, weapon row, out of range,
 *  non-integer) or for a slot a short kit leaves unbound. The client reads a
 *  zero-stock slot's kind through this — a `null` slot content still belongs
 *  to its kind. */
export function consumableKindAt(kit: ConsumableKit, slot: number): ConsumableId | null {
  const i = slot - FIRST_CONSUMABLE_SLOT;
  if (!Number.isInteger(i) || i < 0 || i >= KIT_SIZE) return null;
  return kit[i] ?? null;
}

/** The role a slot plays in the grammar. */
export type SlotRole = 'gun' | 'boost' | 'weapon' | 'consumable';

/** Slot-role grammar, in slot order (index = slot index), length SLOT_COUNT.
 *  Fixed for every hull: the roles are the grammar, the contents are the
 *  build. */
export const SLOT_ROLES: readonly SlotRole[] = Object.freeze([
  'gun',
  'boost',
  'weapon',
  'weapon',
  'weapon',
  ...CONSUMABLE_SLOTS.map((): SlotRole => 'consumable'),
]);

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
 * The loadout a ship spawns with — THE SAME SLOT SHAPE FOR EVERY CAPTAIN HULL
 * (Story 8.5; nine slots since Story 10.1, eleven from 9.2). A captain fits
 * the main battery in slot 0 and the seat's Shift in slot 1, both with a full pool and an idle
 * reload timer (exactly the server's `freshAmmo(equipmentMaxAmmo(stats, id))`
 * semantics); slots 2–8 start empty and are filled by CARDS — the level-zero
 * offer at the start line first (Story 8.10), then every offer after it.
 *
 * THE KIT IS NOT A PARAMETER HERE (Story 10.1): the consumable slots start
 * EMPTY whatever the ship carries, so the fit is kit-independent by
 * construction. Which kind a slot is BOUND to is a question for
 * `consumableKindAt(kit, slot)`, and the stock path (`stockSlotFor`,
 * `slotsWithCards` — sim/boons.ts) is where the kit enters.
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
