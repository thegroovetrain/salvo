// Slot-based equipment loadout — the shared spine every fitted system builds
// on (Story 1.2). A ship's loadout IS its equipment runtime: 4 slots (gun,
// two specials, one extra), each either empty or holding one equipment id +
// its state. The fit is per-hull (Stories 1.6–1.8): the Torpedo Boat carries
// [gun, torpedo, speedBoost, empty], the Battleship carries
// [gun, broadside, starShells, empty], the Mine Layer carries
// [gun, mine, radarBuoy, empty] (Story 7-5 wave 2), while every drone keeps the
// universal fit [gun, torpedo, mine, empty]. speedBoost is the ONLY non-weapon
// (instant-activation) special left. Pure, zero I/O.

import type { HullId } from '../constants.js';
import type { EffectiveStats } from './stats.js';

/** Equipment ids fittable into a loadout slot (weapons + activated abilities). */
export type EquipmentId =
  | 'gun'
  | 'torpedo'
  | 'mine'
  | 'speedBoost'
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
  torpedo: true,
  // Story 2.8 (amendment 45): the mine is a click-aimed WEAPON again — prime,
  // aim within the rear arc (CONFIG.mine.offset ± placeHalfArcDeg), click
  // places at the clicked point up to placeRange. Supersedes the 1.8
  // instant-activate stern drop.
  mine: true,
  speedBoost: false,
  // Story 7-5 wave 2: the BROADSIDE BARRAGE — prime, aim into ONE of the two
  // beam sectors (sim/arcs.ts 'twin-sector'), click fires that side's whole
  // barrage at the clicked point's RANGE. A click outside both sectors is
  // denied out-of-arc.
  broadside: true,
  starShells: true, // Story 1.7: prime-then-click skillshot (spawns a lit zone at burst)
  // Story 7-5 wave 2 (R2.7): the RADAR BUOY is CLICK-PLACED like the mine — it
  // shares the mine's rear sector and placeRange — so it is a WEAPON now,
  // where the decoy buoy it replaces was an un-aimed stern-drop ABILITY.
  radarBuoy: true,
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
    broadside: stats.broadside.maxAmmo,
    starShells: stats.starShells.maxAmmo,
    radarBuoy: stats.radarBuoy.maxAmmo,
  }[id];
}

/** The effective reload (ms) for a piece of equipment. */
export function equipmentReloadMs(stats: EffectiveStats, id: EquipmentId): number {
  return {
    gun: stats.gun.reloadMs,
    torpedo: stats.torpedo.reloadMs,
    mine: stats.mine.reloadMs,
    speedBoost: stats.boost.reloadMs,
    broadside: stats.broadside.reloadMs,
    starShells: stats.starShells.reloadMs,
    radarBuoy: stats.radarBuoy.reloadMs,
  }[id];
}

/** The two specials (slots 1–2) each hull id fits: torpedo + speedBoost for the
 *  Torpedo Boat (1.6), broadside + starShells for the Battleship (7-5 wave 2),
 *  mine + radarBuoy for the Mine Layer (7-5 wave 2).
 *
 *  PvE FLEET HULLS FIT NOTHING (Story 5.6, epic-5 amendment 34). They used to
 *  fall through this function's catch-all and inherit the universal
 *  torpedo + mine — so every drone afloat carried loaded tubes and a mine rack
 *  it could never use, with both reload timers ticking every tick forever.
 *  Eric's ruling is *"each has a gun to defend itself"*, singular, so the
 *  specials are gone and the gun in slot 0 is the whole fit. */
function specialsFor(hullId: HullId): [EquipmentId | null, EquipmentId | null] {
  if (hullId === 'torpedoBoat') return ['torpedo', 'speedBoost'];
  if (hullId === 'battleship') return ['broadside', 'starShells'];
  if (hullId === 'mineLayer') return ['mine', 'radarBuoy'];
  return [null, null]; // PvE fleet hulls: gun only
}

/**
 * The loadout a given hull id spawns with (per-hull, Stories 1.6–1.8, 5.6). The
 * Torpedo Boat fits [gun, torpedo, speedBoost, empty]; the Battleship fits
 * [gun, broadside, starShells, empty]; the Mine Layer fits
 * [gun, mine, radarBuoy, empty] (Story 7-5 wave 2); a PvE fleet hull fits
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
