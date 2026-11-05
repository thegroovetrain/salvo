// THE BOT TACTIC REGISTRY — the one place the rows are assembled into the
// TOTAL table tactics.ts reads, and the one lookup for a fitted slot.
//
// It sits at the TOP of the one-way import chain (tacticKit <- equipment /
// shift <- this file <- tactics), because the total EQUIPMENT_TACTICS needs
// the Shift rows while the Shift rows need the kit — a two-way import would
// read a `const` row before it exists.
//
// TOTALITY IS A COMPILE-TIME FACT: the table below is a `Record` over the
// whole EquipmentId union with no `Partial` and no cast, so a new EquipmentId
// without a bot row fails to type-check. The runtime pins in
// botTactics.test.ts assert the same by key and by row id. (The consumable
// half of the registry left with the belt, Story 10.5; HULL REPAIR and SMOKE
// hold no slot and live in ai/abilities.ts.)

import type { EquipmentId } from '@salvo/shared';
import type { BotProfile } from './profiles.js';
import { WEAPON_TACTICS } from './equipment.js';
import { SHIFT_ROWS } from './shift.js';
import { appetiteFor, deepFreezeRows, type EquipmentTactic, type SlotTactic } from './tacticKit.js';

export { SHIFT_ROWS } from './shift.js';

/** Every equipment id's tactic: the weapon rows plus the three Shift rows.
 *  TOTAL over EquipmentId, deep-frozen. */
export const EQUIPMENT_TACTICS: Readonly<Record<EquipmentId, EquipmentTactic>> = deepFreezeRows({
  ...WEAPON_TACTICS,
  ...SHIFT_ROWS,
});

/** How eager this profile is about whatever a slot holds — the one resolver
 *  `rankedSlots` reads. */
export function slotAppetite(profile: BotProfile, id: EquipmentId): number {
  return appetiteFor(profile, id);
}

/** THE ONE TACTIC LOOKUP FOR A FITTED SLOT — `slotRow`'s bot-side twin. The
 *  registry is total at COMPILE time, so every well-typed id has a row; the
 *  `undefined` answer is the RUNTIME fail-closed path for an id it does not
 *  know (a corrupt or future loadout entry): every caller skips that slot
 *  rather than throwing. Own keys only, so a prototype name ('constructor',
 *  'toString') never resolves to a row. */
export function tacticFor(id: EquipmentId): SlotTactic | undefined {
  return Object.hasOwn(EQUIPMENT_TACTICS, id) ? EQUIPMENT_TACTICS[id] : undefined;
}
