// THE ABILITIES (Story 10.5, Eric 2026-11-05, epic-10 amendment 11) — the
// three instant, un-aimed presses every captain has: the seat's SHIFT (slot 1,
// unchanged — its pool and reload are an equipment row), and the two UNIVERSAL
// COOLDOWN ABILITIES that replaced the consumable kit: HULL REPAIR on `C` and
// SMOKE on `V`. The two hold NO loadout slot, need no card and are READY AT
// SPAWN.
//
// THE COOLDOWN LAW (R1–R3), the whole of it:
//   - a SUCCESSFUL press at server time `t` stamps `readyAt = t + cooldownMs`;
//   - the ability is ready again when `now >= readyAt`;
//   - `cooldownMs` is THE SHIP'S OWN: `stats.repair.cooldownMs` or
//     `stats.smoke.cooldownMs` (Story 10.6, Eric 2026-11-05, R8 / R9 — the
//     HULL REPAIR and SMOKE SCREEN ladders shorten it, 75 s / 60 s with no
//     card, through the haste law over each ability's own score of 100 + 5 a
//     card; sim/abilityStats.ts). The ship's RELOAD index, `cooldownScale`
//     and INSTANT RELOAD never touch it (R3, kept). Until 10.6 it was a
//     fixed CONFIG read here;
//   - a REFUSED press stamps nothing (a HULL REPAIR press on a full hull does
//     not start the cooldown).
//
// Both sides call these: the server is the authority (it stamps `readyAt` and
// sends it self-privately as `OwnShip.repairReadyAt` / `smokeReadyAt`), the
// client pre-denies a press and draws the hotbar wipe from the same functions
// against its server-clock estimate. Nothing here reads a clock — the caller
// passes `now`.
//
// Pure, deterministic, zero I/O.

import type { DenialReason } from '../types.js';
import { hullIsFull } from './hull.js';
import { SLOT_BOOST } from './loadout.js';

/**
 * Every ability, IN WIRE-CODE ORDER: `InputMsg.act` carries the INDEX into
 * this list — 0 the Shift, 1 HULL REPAIR, 2 SMOKE. Append only; the order is
 * wire contract.
 */
export const ABILITY_IDS = ['shift', 'repair', 'smoke'] as const;

/** One of the three abilities. */
export type AbilityId = (typeof ABILITY_IDS)[number];

/** The two abilities that run on the fixed cooldown law (not the Shift, whose
 *  pool and reload are its equipment row's). */
export type CooldownAbilityId = Exclude<AbilityId, 'shift'>;

/** The wire code of an ability (`InputMsg.act`, `DeniedView.act`). */
export function abilityCode(id: AbilityId): number {
  return ABILITY_IDS.indexOf(id);
}

/**
 * The ability a wire code names, or `null` for anything that is not one — a
 * non-integer, a negative, a code past the list, a non-number. THE validator
 * `game/inputs.ts` runs on `InputMsg.act` (a `null` drops the message, like
 * every malformed field). Never throws.
 */
export function abilityFromCode(code: unknown): AbilityId | null {
  if (typeof code !== 'number' || !Number.isInteger(code)) return null;
  return ABILITY_IDS[code] ?? null;
}

/** `DeniedView.slot` for a denied press of an ability that holds no loadout
 *  slot (`C` / `V`). Never a valid slot index. */
export const NO_SLOT = -1;

/** The loadout slot an ability lives in: `SLOT_BOOST` for the Shift, `NO_SLOT`
 *  for the two cooldown abilities. */
export function abilitySlot(id: AbilityId): number {
  return id === 'shift' ? SLOT_BOOST : NO_SLOT;
}

/** The slice of `EffectiveStats` the cooldown law reads — the two abilities'
 *  folded cooldowns (a full `EffectiveStats` fits). */
export interface AbilityCooldowns {
  readonly repair: { readonly cooldownMs: number };
  readonly smoke: { readonly cooldownMs: number };
}

/** ms — a cooldown ability's cooldown on THIS ship (Story 10.6, R8 / R9): the
 *  folded `stats.repair` / `stats.smoke` value, never a CONFIG read. */
export function abilityCooldownMs(stats: AbilityCooldowns, id: CooldownAbilityId): number {
  return id === 'repair' ? stats.repair.cooldownMs : stats.smoke.cooldownMs;
}

/**
 * Is the ability ready at `now`? `readyAt` is the stamp of its last successful
 * press (`abilityReadyAt`); 0 — the spawn value, and what an OMITTED wire
 * field reads as — is "never pressed", ready. FAIL CLOSED: a non-finite clock
 * or stamp reads NOT ready.
 */
export function abilityReady(now: number, readyAt = 0): boolean {
  return now >= readyAt;
}

/** The `readyAt` stamp a successful press at `pressedAt` writes — the cooldown
 *  counts FROM THE PRESS (R2), whatever the effect's own duration, at the
 *  pressing ship's cooldown then. */
export function abilityReadyAt(pressedAt: number, stats: AbilityCooldowns, id: CooldownAbilityId): number {
  return pressedAt + abilityCooldownMs(stats, id);
}

/**
 * 0..1 — how much of the cooldown is still to run at `now`: 1 at the press,
 * falling linearly to 0 when the ability is ready (and 0 for a never-pressed
 * one), measured against the ship's CURRENT cooldown. The hotbar's cooldown
 * wipe reads THIS. Clamped; a non-finite input reads 1 (the `abilityReady`
 * fail-closed posture: unreadable = not ready).
 */
export function abilityCooldownFraction(now: number, readyAt: number, stats: AbilityCooldowns, id: CooldownAbilityId): number {
  const left = readyAt - now;
  if (Number.isNaN(left)) return 1;
  if (left <= 0) return 0;
  return Math.min(1, left / abilityCooldownMs(stats, id));
}

/**
 * WHY A HULL REPAIR PRESS IS REFUSED, or `null` when it goes through — the one
 * predicate both sides run, so the client's pre-denial and the server's
 * refusal can never disagree on the same hull:
 *   - `'cooling'` — still inside the cooldown;
 *   - `'blocked'` — the hull is FULL (`hullIsFull`: under 1 hp missing, epic-8
 *     amendment 53). NOTHING HAPPENS AND THE COOLDOWN IS NOT STARTED: the
 *     caller stamps `abilityReadyAt` only on a `null`. `'blocked'` is the wire
 *     word the full-hull refusal has always used (no new reason).
 * A SINKING hull cannot press at all; that is a lifecycle gate the caller
 * applies first (it is not a wire denial — a dead press is client-predictable).
 */
export function repairRefusal(hp: number, maxHp: number, now: number, readyAt = 0): DenialReason | null {
  if (!abilityReady(now, readyAt)) return 'cooling';
  return hullIsFull(hp, maxHp) ? 'blocked' : null;
}

/** WHY A SMOKE PRESS IS REFUSED, or `null`: only ever `'cooling'`. A press
 *  never refuses for a cloud already on the water — each press makes its own. */
export function smokeRefusal(now: number, readyAt = 0): DenialReason | null {
  return abilityReady(now, readyAt) ? null : 'cooling';
}
