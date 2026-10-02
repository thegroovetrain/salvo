// SUPERCAV TORPEDO — the belt's FIRST click-aimed consumable (Story 8.13,
// Eric ruling 2026-09-19, epic-8 amendment 74, verbatim: *"I have decided that
// Supercavitating Torpedos should be a consumable item, rather than a weapon
// line."*).
//
// The digit PRIMES the belt slot and a CLICK inside the bow +/-15 deg sector
// FIRES one fish per copy at 195 u/s for 50 damage. It is a STRAIGHT-RUNNER at
// every build, whatever the captain's torpedo tiers say: homing is a TIER stat
// on the light and heavy LINES (amendment 80) and a consumable line has no
// tiers, so the core is handed `homingTurnRate: 0` as a literal and the fish
// carries no steering and no die-distance.
//
// NO RELOAD, NO ROW, NO POOL (catalog-v3 R40 / Story 8.7): a stack is copies,
// not ammo. `CONFIG.supercavTorpedo` is read directly here because
// `supercavTorpedo` carries no `EffectiveStats` row at all — that is the
// consumable law, not a shortcut.
//
// THE SPEND ORDER IS THE ONE SPEND LAW (consumables/row.ts). The factory
// refuses an empty stack ('no-ammo') BEFORE this effect runs, and takes the
// copy only when this effect answers `ok` — so an OUT-OF-ARC click spends
// NOTHING: no copy off the belt, no card out of `ship.cards`, and the fish is
// still there to try again with. That is why this module never touches
// `slot.state.n` itself and hands the core a no-op `spend`.
//
// Pure adapter: the launch geometry and the whole ShellState live in
// equipment/torpedoCore.ts, shared byte-for-byte with the two torpedo lines.

import { CONFIG, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { launchTorpedo } from '../torpedoCore.js';
import { consumableRow, type ConsumableRow } from './row.js';

/** Fire ONE supercav fish, or refuse the click without cost. */
function supercavTorpedoEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const { torp, denial } = launchTorpedo({ fireT: ctx.fireT, mkId: ctx.mkId }, ctx.ship, {
    id: 'supercavTorpedo',
    row: {
      speed: CONFIG.supercavTorpedo.speed,
      damage: CONFIG.supercavTorpedo.damage,
      // NEVER HOMES (amendment 74) — a literal zero, not a row read.
      homingTurnRate: 0,
    },
    hits: CONFIG.supercavTorpedo.hits, // AR44: this line's OWN target mask
    // The copy is taken by the row factory on `ok`, never here — one spend,
    // one condition (row.ts's ONE SPEND LAW).
    spend: () => true,
  });
  if (torp === null) return { ok: false, reason: denial ?? 'out-of-arc' };
  ctx.spawnBallistic(torp);
  return { ok: true };
}

export const supercavTorpedoRow: ConsumableRow = consumableRow('supercavTorpedo', supercavTorpedoEffect);
