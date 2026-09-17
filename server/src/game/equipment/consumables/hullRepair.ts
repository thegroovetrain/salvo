// HULL REPAIR — the FIRST live consumable line (Story 8.8, catalog-v3 R13).
//
// The paid heal that used to be an always-available menu spend (the DAMAGE
// CONTROL rail on the `5` key, `HEAL_CHOICE`) is now a CARD you draw, stock in
// a belt slot and fire like any other consumable. The body is unchanged, only
// its trigger moved: `instantHp` lands at once and `regenHp` goes into the
// ship's paid pool, which pays out over `regenMs` — 50 hp now and 50 hp over
// 5 s as shipped (epic-8 amendment 51; the "5 hp/s" in R13 / FR47 / the 8.8 AC
// is a stale figure from before balance cycle 1 doubled both amounts).
//
// AFLOAT-ONLY, REFUSED BY THIS ROW (FR47 / AR39). The sinking-activation gate
// deliberately lets a SINKING hull through to its rows — amendment 10's fitment
// rule ("a doomed captain still fights") — so "no hp comes back to a hull in
// the window" cannot live at the gate. It lives here, which is also the one
// place the FULL-HULL refusal can sit: both are the row's own two guards and
// both answer `blocked`.
//
// A HEAL DURING THE SUDDEN-DEATH COLLAPSE IS ALLOWED (Eric 2026-09-11). The
// fully closed zone bites every tick, but nothing about the collapse refuses a
// repair — the storm simply out-damages it. There is no zone read here, and
// there must never be one.
//
// WHY 'blocked' AND NOT A NEW REASON: it is the existing wire reason for "the
// action cannot happen here, and nothing was consumed" (the stern rack's drop
// ashore). Adding a `DenialReason` would be a protocol change for a refusal the
// client already pre-denies locally. Because the row answers `{ ok: false }`,
// the ONE SPEND LAW keeps the copy on the stack and in `ship.cards`.
//
// WHY THE WORLD OWNS THE hp WRITE (`ctx.applyRepair`): repairs must stay
// World-owned hp-INCREASE paths (the 8.4 gate pins whitelist every one of
// them), and the self-private `heal` cue needs the pending queue. The row keeps
// only its two guards.

import { CONFIG, isAfloat, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { consumableRow, type ConsumableRow } from './row.js';

/** The two guards, then the World's repair capability. Checked BEFORE anything
 *  is consumed — a denied press costs no copy (ONE SPEND LAW). */
function hullRepairEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const ship = ctx.ship;
  // Sinking or sunk: no hp ever comes back (amendment 10). Reachable — the
  // gate passes a sinking hull's presses straight to this row.
  if (!isAfloat(ship.lifecycle)) return { ok: false, reason: 'blocked' };
  // A FULL HULL BUYS NOTHING and pays nothing: the pool would drain into the
  // maxHp clamp and the copy would be gone for it.
  if (ship.hp >= ship.stats.maxHp) return { ok: false, reason: 'blocked' };
  ctx.applyRepair(CONFIG.hullRepair.instantHp, CONFIG.hullRepair.regenHp);
  return { ok: true };
}

export const hullRepairRow: ConsumableRow = consumableRow('hullRepair', hullRepairEffect);
