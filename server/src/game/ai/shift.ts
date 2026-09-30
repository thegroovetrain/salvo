// THE CLASS SHIFTS — the three hull specials, each FIXED on slot 1 by its hull
// (`CONFIG.shipClasses.<id>.shift`, Story 8.15, amendment 89(c)): SPEED BOOST
// on the Torpedo Boat, INSTANT RELOAD on the Mine Layer, DAMAGE CUT on the
// Battleship. All three are abilities on the actSeq channel (chooseAct).
//
// `SHIFT_TACTICS` is TOTAL over ShipClassId — a new hull cannot land without a
// bot row for its Shift (the compiler refuses the record) — and botTactics
// pins that each hull's row is the Shift its CONFIG entry names. The registry
// (ai/tacticRegistry.ts) also files the three rows under their own equipment
// ids in the total EQUIPMENT_TACTICS, which is what a fitted slot resolves
// through.

import {
  SLOT_GUN,
  WEAPON_SLOTS,
  classShift,
  isConsumableId,
  type EffectiveStats,
  type ShiftId,
  type ShipClassId,
} from '@salvo/shared';
import type { BotSelf } from './types.js';
import { engagementBand } from './profiles.js';
import {
  APPETITE_NEUTRAL,
  appetiteFor,
  damageCutCues,
  deepFreezeRows,
  distTo,
  type EquipmentTactic,
  type TacticContext,
} from './tacticKit.js';

// ---------------------------------------------------------------------------
// SPEED BOOST (the Torpedo Boat's Shift): +25 % of the ladder-raised cap for
// 10 s on a 25 s reload (Story 8.9).
// ---------------------------------------------------------------------------

/** CHARGING IN (Eric ruling R7, 2026-09-30): the bot is attacking — posture
 *  `pursue` or `engage` — a target that lies beyond the FAR edge of its
 *  engagement band, so the boost closes the gap to fighting range. */
function chargingIn(ctx: TacticContext): boolean {
  const t = ctx.target;
  if (t === null) return false;
  // R13 (Eric, 2026-09-30): real fights only — `farm` (PvE fleet hunting) never boosts in.
  if (ctx.posture !== 'pursue' && ctx.posture !== 'engage') return false;
  return distTo(ctx.sit, t) > engagementBand(ctx.sit.profile, ctx.sit.stats).max;
}

/** The boost is pressed on the way OUT (the `disengage` posture) and on the
 *  way IN (chargingIn), by any captain whose appetite for it is at least
 *  neutral. */
function boostWant(ctx: TacticContext): boolean {
  if (appetiteFor(ctx.sit.profile, 'boost') < APPETITE_NEUTRAL) return false;
  return ctx.posture === 'disengage' || chargingIn(ctx);
}

const boostTactic: EquipmentTactic = {
  id: 'boost',
  kind: 'ability',
  reachU: () => 0,
  want: boostWant,
  solve: () => null,
};

// ---------------------------------------------------------------------------
// INSTANT RELOAD (the Mine Layer's Shift).
// ---------------------------------------------------------------------------

/** The mounted gun's reach — "in range" for the INSTANT RELOAD rule. All three
 *  guns sit on the radar rung today; reading the mounted row keeps the rule
 *  honest if a ladder ever moves one. */
function mountedGunReachU(self: BotSelf, stats: EffectiveStats): number {
  const id = self.loadout[SLOT_GUN]?.equipmentId;
  if (id === 'machineGun' || id === 'flak') return stats.equipment[id].rangeU;
  return stats.equipment.gun.rangeU;
}

/** The slots INSTANT RELOAD serves (amendment 98): the mounted gun and the
 *  Q/E/R weapon row — never the Shift slot, never the belt. */
const RELOADABLE_SLOTS: readonly number[] = [SLOT_GUN, ...WEAPON_SLOTS];

/** Is any weapon INSTANT RELOAD would serve reloading right now? */
function weaponReloading(self: BotSelf): boolean {
  for (const i of RELOADABLE_SLOTS) {
    const slot = self.loadout[i];
    if (slot === undefined || slot.equipmentId === null || slot.state === null) continue;
    if (!isConsumableId(slot.equipmentId) && slot.state.reloadMsLeft > 0) return true;
  }
  return false;
}

/** Pressed when the target is in the mounted gun's reach AND a weapon it would
 *  serve is reloading. */
const instantReloadTactic: EquipmentTactic = {
  id: 'instantReload',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) =>
    ctx.target !== null &&
    appetiteFor(ctx.sit.profile, 'instantReload') >= APPETITE_NEUTRAL &&
    distTo(ctx.sit, ctx.target) <= mountedGunReachU(ctx.self, ctx.sit.stats) &&
    weaponReloading(ctx.self),
  solve: () => null,
};

// ---------------------------------------------------------------------------
// DAMAGE CUT (the Battleship's Shift).
// ---------------------------------------------------------------------------

/**
 * PROACTIVE — Eric, 2026-09-29, amendment 115: pressed on the DAMAGE CUT cues
 * (engaged with a target, or a seen fish inbound within 150 u; tacticKit.ts
 * damageCutCues). NEVER as a reaction to damage already taken.
 */
const damageCutTactic: EquipmentTactic = {
  id: 'damageCut',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) => appetiteFor(ctx.sit.profile, 'damageCut') >= APPETITE_NEUTRAL && damageCutCues(ctx),
  solve: () => null,
};

// ---------------------------------------------------------------------------
// THE TABLES
// ---------------------------------------------------------------------------

/** The three Shift rows under their own equipment ids — the registry's slice
 *  of EQUIPMENT_TACTICS. TOTAL over ShiftId. */
export const SHIFT_ROWS: Readonly<Record<ShiftId, EquipmentTactic>> = deepFreezeRows({
  boost: boostTactic,
  instantReload: instantReloadTactic,
  damageCut: damageCutTactic,
});

/** A hull's Shift row, read through the shared hull->Shift source of truth
 *  (`classShift`, i.e. `CONFIG.shipClasses.<id>.shift`) — never a second,
 *  hand-written hull->Shift map that could drift from it. */
function shiftRowOf(hull: ShipClassId): EquipmentTactic {
  return SHIFT_ROWS[classShift(hull)];
}

/** Each hull's Shift tactic. TOTAL over ShipClassId (the object literal names
 *  every hull, so a new one fails to type-check), deep-frozen. */
export const SHIFT_TACTICS: Readonly<Record<ShipClassId, EquipmentTactic>> = Object.freeze({
  torpedoBoat: shiftRowOf('torpedoBoat'),
  mineLayer: shiftRowOf('mineLayer'),
  battleship: shiftRowOf('battleship'),
});
