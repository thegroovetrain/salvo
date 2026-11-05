// THE SHIFTS — the three slot-1 specials: SPEED BOOST, INSTANT RELOAD and
// HUNKER (was DAMAGE CUT until Story 9.9). Since Story 10.4 the Shift is the
// SEAT's pick (a bot's is dealt by the room), never the hull's, so the rows
// are keyed by `ShiftId` alone (`SHIFT_ROWS`, TOTAL over ShiftId — a new Shift
// cannot land without a bot row). All three are abilities on the actSeq
// channel (chooseAct). The registry (ai/tacticRegistry.ts) files the rows
// under their own equipment ids in the total EQUIPMENT_TACTICS, which is what
// a fitted slot resolves through.

import {
  SLOT_GUN,
  WEAPON_SLOTS,
  isConsumableId,
  type EffectiveStats,
  type LoadoutSlot,
  type ShiftId,
} from '@salvo/shared';
import type { BotPosture, BotSelf } from './types.js';
import { gunRangeU, mountedBandOf, mountedGun } from './doctrine.js';
import {
  APPETITE_NEUTRAL,
  appetiteFor,
  hunkerCues,
  deepFreezeRows,
  distTo,
  type EquipmentTactic,
  type TacticContext,
} from './tacticKit.js';

// ---------------------------------------------------------------------------
// SPEED BOOST: +25 % of the ladder-raised cap for
// 10 s on a 25 s reload (Story 8.9).
// ---------------------------------------------------------------------------

/** CHARGING IN (Eric ruling R7, 2026-09-30; narrowed by epic-9 amendment 194,
 *  2026-10-17): the bot is CLOSING — posture `pursue`, which the odds gate
 *  only grants when closing is ruled — on a target beyond the FAR edge of its
 *  mounted gun's doctrine band (ai/doctrine.ts), so the boost closes the gap
 *  to fighting range. Never in `engage`, `kite`, `hold`, `hide` or `farm`
 *  (R13: PvE fleet hunting never boosts in). */
function chargingIn(ctx: TacticContext): boolean {
  const t = ctx.target;
  if (t === null || ctx.posture !== 'pursue') return false;
  return distTo(ctx.sit, t) > mountedBandOf(ctx).max;
}

/** The postures a boost is always pressed in on the way OUT (amendment 194:
 *  "always when fleeing") — breaking off and hiding. */
const FLEE_POSTURES: readonly BotPosture[] = ['disengage', 'hide'];

/** The boost is pressed on the way OUT (FLEE_POSTURES) and on the way IN
 *  (chargingIn), by any captain whose appetite for it is at least neutral. */
function boostWant(ctx: TacticContext): boolean {
  if (appetiteFor(ctx.sit.profile, 'boost') < APPETITE_NEUTRAL) return false;
  return FLEE_POSTURES.includes(ctx.posture) || chargingIn(ctx);
}

const boostTactic: EquipmentTactic = {
  id: 'boost',
  kind: 'ability',
  reachU: () => 0,
  want: boostWant,
  solve: () => null,
};

// ---------------------------------------------------------------------------
// INSTANT RELOAD (Story 10.4: on a captain it finishes every turret).
// ---------------------------------------------------------------------------

/** The mounted gun's reach — "in range" for the INSTANT RELOAD rule (the main
 *  battery's folded reach on a captain), read through the doctrine's one
 *  resolver (ai/doctrine.ts). */
function mountedGunReachU(self: BotSelf, stats: EffectiveStats): number {
  return gunRangeU(stats, mountedGun(self.loadout[SLOT_GUN]?.equipmentId));
}

/** The slots INSTANT RELOAD serves (amendment 98): the mounted gun and the
 *  Q/E/R weapon row — never the Shift slot, never the belt. */
const RELOADABLE_SLOTS: readonly number[] = [SLOT_GUN, ...WEAPON_SLOTS];

/** Does this fitted slot want a reload? THE MAIN BATTERY (Story 10.4 gate S3)
 *  only when NO turret is ready (summary `n === 0`): its summary
 *  `reloadMsLeft` is the soonest running turret reload, positive as soon as
 *  ONE turret fired. Every other row: its timer is running. */
function slotWantsReload(slot: LoadoutSlot): boolean {
  if (slot.equipmentId === null || slot.state === null || isConsumableId(slot.equipmentId)) return false;
  if (slot.equipmentId === 'mainBattery') return slot.state.n === 0;
  return slot.state.reloadMsLeft > 0;
}

/** Is any weapon INSTANT RELOAD would serve reloading right now? */
function weaponReloading(self: BotSelf): boolean {
  for (const i of RELOADABLE_SLOTS) {
    const slot = self.loadout[i];
    if (slot !== undefined && slotWantsReload(slot)) return true;
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
// HUNKER.
// ---------------------------------------------------------------------------

/**
 * PROACTIVE — Eric, 2026-09-29, amendment 115: pressed on the HUNKER cues
 * (engaged with a target, or a seen fish inbound within 150 u; extended by
 * epic-9 amendment 199 to pursuing / kiting / fleeing / hiding with a hostile
 * in weapon reach and the last seconds before a ram; tacticKit.ts
 * hunkerCues). NEVER as a reaction to damage already taken.
 */
const hunkerTactic: EquipmentTactic = {
  id: 'hunker',
  kind: 'ability',
  reachU: () => 0,
  want: (ctx) => appetiteFor(ctx.sit.profile, 'hunker') >= APPETITE_NEUTRAL && hunkerCues(ctx),
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
  hunker: hunkerTactic,
});
