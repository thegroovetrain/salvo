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
//   - `cooldownMs` is `CONFIG.hullRepair.cooldownMs` (90 s) or
//     `CONFIG.countermeasure.cooldownMs` (60 s) and NOTHING ELSE — FIXED FOR
//     EVERY SHIP: no RELOAD index, no card, no `cooldownScale`, no INSTANT
//     RELOAD touches it (R3). That is why it lives here and not on an
//     `EffectiveStats` row, where the one reload multiply would reach it;
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

import { CONFIG } from '../constants.js';
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

/** ms — the FIXED cooldown of a cooldown ability (R1: 90 s, R2: 60 s). The
 *  one read of the two CONFIG dials; no stat is ever an input (R3). */
export function abilityCooldownMs(id: CooldownAbilityId): number {
  return id === 'repair' ? CONFIG.hullRepair.cooldownMs : CONFIG.countermeasure.cooldownMs;
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
 *  counts FROM THE PRESS (R2), whatever the effect's own duration. */
export function abilityReadyAt(pressedAt: number, id: CooldownAbilityId): number {
  return pressedAt + abilityCooldownMs(id);
}

/**
 * 0..1 — how much of the cooldown is still to run at `now`: 1 at the press,
 * falling linearly to 0 when the ability is ready (and 0 for a never-pressed
 * one). The hotbar's cooldown wipe reads THIS. Clamped; a non-finite input
 * reads 1 (the `abilityReady` fail-closed posture: unreadable = not ready).
 */
export function abilityCooldownFraction(now: number, readyAt: number, id: CooldownAbilityId): number {
  const left = readyAt - now;
  if (Number.isNaN(left)) return 1;
  if (left <= 0) return 0;
  return Math.min(1, left / abilityCooldownMs(id));
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
