// THE BOT TACTIC REGISTRY — the one place the rows are assembled into the
// TOTAL tables tactics.ts reads, and the one lookup for a fitted slot.
//
// It sits at the TOP of the one-way import chain (tacticKit <- equipment /
// shift / consumables <- this file <- tactics), because the total
// EQUIPMENT_TACTICS needs the Shift rows while the Shift and belt rows need the
// kit — a two-way import would read a `const` row before it exists.
//
// TOTALITY IS A COMPILE-TIME FACT: every table below is a `Record` over its
// whole id union with no `Partial` and no cast, so a new EquipmentId,
// ConsumableId or ShipClassId without a bot row fails to type-check. The
// runtime pins in botTactics.test.ts assert the same by key and by row id.

import { isConsumableId, type EquipmentId, type SlotItemId } from '@salvo/shared';
import type { BotProfile } from './profiles.js';
import { WEAPON_TACTICS } from './equipment.js';
import { SHIFT_ROWS } from './shift.js';
import { CONSUMABLE_TACTICS, consumableAppetite } from './consumables.js';
import { appetiteFor, deepFreezeRows, type EquipmentTactic, type SlotTactic } from './tacticKit.js';

export { CONSUMABLE_TACTICS } from './consumables.js';
export { SHIFT_TACTICS } from './shift.js';

/** Every equipment id's tactic: the weapon rows plus the three Shift rows.
 *  TOTAL over EquipmentId, deep-frozen. */
export const EQUIPMENT_TACTICS: Readonly<Record<EquipmentId, EquipmentTactic>> = deepFreezeRows({
  ...WEAPON_TACTICS,
  ...SHIFT_ROWS,
});

/** How eager this profile is about whatever a slot holds — the one resolver
 *  `rankedSlots` reads, spanning both id spaces through the shared guard. */
export function slotAppetite(profile: BotProfile, id: SlotItemId): number {
  return isConsumableId(id) ? consumableAppetite(id) : appetiteFor(profile, id);
}

/** THE ONE TACTIC LOOKUP FOR A FITTED SLOT — `slotRow`'s bot-side twin.
 *  Narrows through the shared guard (never a cast) and answers with whichever
 *  registry owns the id. Both registries are total at COMPILE time, so every
 *  well-typed id has a row; the `undefined` answer is the RUNTIME fail-closed
 *  path for an id neither registry knows (a corrupt or future loadout entry):
 *  every caller skips that slot rather than throwing. Own keys only, so a
 *  prototype name ('constructor', 'toString') never resolves to a row. */
export function tacticFor(id: SlotItemId): SlotTactic | undefined {
  if (isConsumableId(id)) return Object.hasOwn(CONSUMABLE_TACTICS, id) ? CONSUMABLE_TACTICS[id] : undefined;
  return Object.hasOwn(EQUIPMENT_TACTICS, id) ? EQUIPMENT_TACTICS[id] : undefined;
}
