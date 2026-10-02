// THE BELT'S ROW FACTORY (Story 8.7; split out of consumables.ts in Story 8.8)
// — the consumable half of the Equipment interface. A CONSUMABLE is not a
// module: it is a STACK of copies sitting in one of the four belt slots (5–8),
// each copy one use, with NO reload ever (catalog-v3 R40 — the only way to get
// another copy is another card). So a consumable row is the equipment row with
// its reload machinery removed:
//
//   tick      — a NO-OP. `tickReload` is never called on a belt slot, which is
//               what keeps `reloadMsLeft` 0 for the stack's whole life (and the
//               client's cooldown wipe off the belt square).
//   activate  — run the line's EFFECT, and spend ONE copy (`n -= 1`) only if it
//               SUCCEEDED. An empty or already-cleared stack answers 'no-ammo'
//               exactly as a dry weapon does; `consume()` is never called
//               either (it would arm a reload).
//
// ONE SPEND LAW (review patch P2): a copy leaves the stack and a copy leaves
// `ship.cards` on the SAME condition — `result.ok` — because the gate runs
// `spendStock` only on success. Decrementing before the effect would break that
// pair on every denial: an `{ n: 0 }` zombie stack whose card is still held,
// handed straight back by the next respawn replay. A DENIED effect therefore
// costs NOTHING and the copy is still there to try again with.
//
// WHAT THIS MODULE DOES NOT DO: remove the spent copy from `ship.cards` and
// clear a stack that hit zero. Both live in World.sinkingActivationGate — the
// ONE call path to activate() — so "the copy leaves the deck-held build and the
// slot empties in the SAME tick" has exactly one home and no row mutates its
// own slot (spec ruling 4).
//
// WHY THIS FILE EXISTS SEPARATELY (Story 8.8). The production registry
// (consumables.ts) must IMPORT the rows it holds, and a row is built by calling
// `consumableRow`. Leaving the factory in consumables.ts would make every row
// module import the very module that imports it — a runtime ES-module cycle
// that survives today only by function hoisting, and would break the day
// someone rewrote `consumableRow` as a `const` arrow. The factory needs nothing
// from the registry, so it lives one level down and both sides import DOWNWARD.
//
// Pure adapter, like every other row: no World reference, no CONFIG read, no
// I/O. `slotRow` (equipment/index.ts) is what resolves an id to either registry.

import { CONSUMABLE_IS_WEAPON, type ConsumableId, type LoadoutSlot } from '@salvo/shared';
import type { ShipRecord } from '../../world.js';
import type { ActivationContext, ActivationResult, Equipment } from '../index.js';

/** One consumable's Equipment row. Narrower than `Equipment` in exactly one
 *  place — its `id` is a ConsumableId — which is what makes the registry
 *  keyable by ConsumableId without a cast. */
export interface ConsumableRow extends Equipment {
  readonly id: ConsumableId;
}

/**
 * WHAT A COPY DOES when it is spent. Runs while the copy is still ON the stack
 * (`slot.state.n` counts it), and the copy is taken only if the effect answers
 * `ok` — see ONE SPEND LAW above. The line's own story writes it; Story 8.8
 * ships the first one (HULL REPAIR).
 */
export type ConsumableEffect = (ctx: ActivationContext, slot: LoadoutSlot) => ActivationResult;

/**
 * Build one consumable's row. The weapon/ability split is READ from the shared
 * single source (`CONSUMABLE_IS_WEAPON`, sim/loadout.ts) — never a literal —
 * so the row and the two dispatch channels (`isWeaponItem`) can never disagree
 * about which channel a line rides.
 */
export function consumableRow(id: ConsumableId, effect: ConsumableEffect): ConsumableRow {
  return {
    id,
    isWeapon: CONSUMABLE_IS_WEAPON[id],
    // A STACK NEVER RELOADS. Deliberately empty rather than absent: every
    // fitted slot is ticked every tick (fireControl walks the whole loadout),
    // and this row is what that walk finds on a belt slot.
    tick(_ship: ShipRecord, _slot: LoadoutSlot, _dtMs: number): void {},
    activate(ctx: ActivationContext, slot: LoadoutSlot): ActivationResult {
      const state = slot.state;
      // A cleared slot never reaches here (the gate answers 'empty-slot'
      // first) and a zero stack is cleared the tick it empties — this is the
      // fail-closed backstop for both, and the honest answer for a directed
      // caller that drives a hand-built stack down to nothing.
      if (state === null || state.n <= 0) return { ok: false, reason: 'no-ammo' };
      const result = effect(ctx, slot);
      // THE ONE SPEND: on success only, and in lockstep with the gate's removal
      // of the copy from `ship.cards`.
      if (result.ok) state.n -= 1;
      return result;
    },
  };
}

/** The consumable half of the dispatch registry — PARTIAL over ConsumableId,
 *  exactly as `EQUIPMENT` is partial over EquipmentId: it holds only the lines
 *  whose effects are BUILT. */
export type ConsumableRegistry = Readonly<Partial<Record<ConsumableId, ConsumableRow>>>;

/**
 * Freeze a registry AND every row in it — the `EQUIPMENT` / `SIGNAL_REGISTRY`
 * discipline: a shallow freeze on the map alone would leave rows mutable.
 * Keyed by each row's own `id`, so a registry can never hold a row under the
 * wrong key.
 */
export function buildConsumableRegistry(rows: readonly ConsumableRow[]): ConsumableRegistry {
  const out: Partial<Record<ConsumableId, ConsumableRow>> = {};
  for (const row of rows) out[row.id] = Object.freeze(row);
  return Object.freeze(out);
}
