// FLASH SHELLS — the belt's prime-and-click blinding round (Story 8.17, Eric
// ruling 2026-09-29, epic-8 amendments 132 and 135(d)). The catalog id stays
// `dazzleShells` (the display name is FLASH SHELLS); it left the star shell's
// add-on verbs for the consumable id space: cap 5, no reload, no tiers,
// `CONSUMABLE_IS_WEAPON` true — the digit PRIMES the belt slot and a CLICK
// fires ONE 360° gun-pattern shell to the click, clamped at the STAR SHELL'S
// reach (`ship.stats.radarRange`, the radar rung — so no arc denial is ever
// possible and the only refusal is an empty stack). It bursts ONCE in
// `CONFIG.flashShells.radius`: every non-friendly afloat hull whose CENTRE is
// inside gets `dazzledUntil = now + durationMs` (World.applyFlash — a later
// expiry always wins, never stacks, never shortens). NO lingering zone, no
// light, no reveal, no damage: `damage 0` / `contactDamage 0`, the star
// shell's `hull | decoy` mask (a flash never detonates a mine), and the
// server-internal `flash` tag beside `lit` — an interception en route flashes
// at the stop point exactly as a flare lights there, and a burst that resolves
// no victim emits `sp` (amendment 135(d)).
//
// NO RELOAD, NO ROW, NO POOL (catalog-v3 R40 / Story 8.7): a stack is copies,
// not ammo. `CONFIG.flashShells` is read directly here because a consumable
// line carries no `EffectiveStats` row — the consumable law, not a shortcut.
//
// THE SPEND ORDER IS THE ONE SPEND LAW (consumables/row.ts): the factory
// refuses an empty stack ('no-ammo') BEFORE this effect runs and takes the
// copy only when the effect answers `ok` — this effect can only answer `ok`,
// so every accepted click costs exactly one copy.
//
// Pure adapter: the fire geometry is the star shell's (burstPoint /
// muzzleOrTarget / makeBallistic with D1 fireT); the World owns shell storage,
// the dazzle mark and event emission.

import { CONFIG, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { makeBallistic } from '../ballistics.js';
import { burstPoint, muzzleOrTarget } from '../guns.js';
import { consumableRow, type ConsumableRow } from './row.js';

/** Fire ONE flash shell to the click (clamped at the radar rung). */
function dazzleShellsEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const ship = ctx.ship;
  const dir = ship.input.aim;
  const target = burstPoint(ship, ctx.mapRadius, ship.stats.radarRange); // the star shell's reach
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.flashShells.shellRadius);
  const shell = makeBallistic(ctx.mkId(), ship, dir, ctx.fireT, {
    speed: CONFIG.flashShells.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.flashShells.shellRadius,
    damage: 0, // no damage, ever (amendment 132)
    hitRadius: CONFIG.flashShells.shellRadius,
    kind: 'shell', // rides the existing shell wire kind
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: CONFIG.flashShells.radius, // the one-time r150 burst
    contactDamage: 0, // an interception does 0 — and still flashes there (World.resolveInterception)
    hits: CONFIG.flashShells.hits, // the star shell's mask — never a mine (135(d))
    family: 'cannon', // a gun-pattern shell — `w: 'cannon'`
    flash: { radius: CONFIG.flashShells.radius, durationMs: CONFIG.flashShells.durationMs },
  });
  ctx.spawnBallistic(shell);
  return { ok: true };
}

export const dazzleShellsRow: ConsumableRow = consumableRow('dazzleShells', dazzleShellsEffect);
