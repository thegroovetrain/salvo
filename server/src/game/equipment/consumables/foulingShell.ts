// FOULING SHELL — the prime-and-click prop-fouling round (Story 9.4, Eric
// ruling 2026-10-11, epic-9 amendments 61–68). It REPLACED FLASH SHELLS (id
// `dazzleShells`, Story 8.17) on key `4`: same seat, same fire flow, a
// different payload. Cap 5, no reload, no tiers, `CONSUMABLE_IS_WEAPON` true —
// the digit PRIMES the slot and a CLICK fires ONE 360° gun-pattern shell to
// the click, clamped at its OWN reach dial (`CONFIG.foulingShell.rangeU`,
// fixed at the 8/12 rung — Story 9.8, ruling 125; it was the star shell's
// radar-rung reach before) — 360°, so no arc denial is ever possible and the
// only refusal is an empty stack. It deals NO damage and hits nothing: `damage 0` /
// `contactDamage 0`, the star shell's `hull | decoy` mask (it never detonates
// a mine), and the server-internal `foul` tag beside `lit` / `burn`. Where it
// STOPS — its burst point, or an interception's stop point, exactly as a flare
// lights there — the World spawns a stationary FOUL ZONE (World.spawnFoulZone,
// `CONFIG.foulingShell.radius` for `durationMs`) that slows every afloat hull
// whose OUTLINE touches it, the firer's included (World.applyFoulZones). A
// burst that resolves no victim emits `sp`; no light, no reveal.
//
// NO RELOAD, NO ROW, NO POOL (catalog-v3 R40 / Story 8.7): a stack is copies,
// not ammo. `CONFIG.foulingShell` is read directly here because a consumable
// line carries no `EffectiveStats` row — the consumable law, not a shortcut.
//
// THE SPEND ORDER IS THE ONE SPEND LAW (consumables/row.ts): the factory
// refuses an empty stack ('no-ammo') BEFORE this effect runs and takes the
// copy only when the effect answers `ok` — this effect can only answer `ok`,
// so every accepted click costs exactly one copy.
//
// Pure adapter: the fire geometry is the star shell's (burstPoint /
// muzzleOrTarget / makeBallistic with D1 fireT); the World owns shell storage,
// the zone store, the per-tick outline stamp and event emission.

import { CONFIG, type LoadoutSlot } from '@salvo/shared';
import type { ActivationContext, ActivationResult } from '../index.js';
import { makeBallistic } from '../ballistics.js';
import { burstPoint, muzzleOrTarget } from '../guns.js';
import { consumableRow, type ConsumableRow } from './row.js';

/** Fire ONE fouling shell to the click (clamped at its reach dial). */
function foulingShellEffect(ctx: ActivationContext, _slot: LoadoutSlot): ActivationResult {
  const ship = ctx.ship;
  const dir = ship.input.aim;
  const target = burstPoint(ship, ctx.mapRadius, CONFIG.foulingShell.rangeU); // its own reach dial (ruling 125)
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.foulingShell.shellRadius);
  const shell = makeBallistic(ctx.mkId(), ship, dir, ctx.fireT, {
    speed: CONFIG.foulingShell.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.foulingShell.shellRadius,
    damage: 0, // no damage, ever (a slow is not damage — Eric)
    hitRadius: CONFIG.foulingShell.shellRadius,
    kind: 'shell', // rides the existing shell wire kind
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: CONFIG.foulingShell.radius, // the one-time burst — the same circle the zone takes
    contactDamage: 0, // an interception does 0 — and still fouls the water there (World.resolveInterception)
    hits: CONFIG.foulingShell.hits, // the star shell's mask — never a mine
    family: 'cannon', // a gun-pattern shell — `w: 'cannon'`
    foul: { radius: CONFIG.foulingShell.radius, durationMs: CONFIG.foulingShell.durationMs },
  });
  ctx.spawnBallistic(shell);
  return { ok: true };
}

export const foulingShellRow: ConsumableRow = consumableRow('foulingShell', foulingShellEffect);
