// Star-shell fire control — the starShells Equipment row (Story 1.7, the
// Battleship's slot-2 special). A gun-pattern skillshot that is DAMAGELESS as
// of Story 2.8 (amendment 39 — CONFIG.starShells.damage is structurally gone):
// the flare spawns with damage 0 / contactDamage 0, so a burst hurts nobody
// and an interception does 0 — and the flare STILL lights: the shell carries
// the server-internal `lit` tag, so the World spawns a {litRadius,
// litDurationMs} zone at the burst point OR the interception stop point
// (World.resolveShell) — firer-only truesight parity inside it lives in
// signals.ts/perception.ts, never here. Lit numbers come from the OWNER's
// effective stats (the SLOW-BURN/WIDE BURST ladders); the INCENDIARY doctrine
// (stats.starShells.mode) shrinks the zone by CONFIG.starShells.
// incendiaryRadiusFactor — its DoT, and DAZZLE's sight reduction, are World/
// perception concerns keyed off the zone's mode, never this row's. Same fire
// flow as the gun (360°, clamp at the system's effective range,
// muzzle-or-target spawn, makeBallistic with D1 fireT); range = the gun's
// BASE range (stats.starShells.rangeU, radar-derived). Pure over a
// ShipRecord's input + pose + slot pool; the World owns shell storage, zone
// spawn, and event emission.

import { CONFIG, EQUIPMENT_IS_WEAPON, type EquipmentState, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';
import { burstPoint, muzzleOrTarget } from './guns.js';

/**
 * Star-shell fire control against one slot pool: 0 or 1 flare. The ONLY
 * denial is an empty pool ('no-ammo' — the 20s cooldown); there is no arc.
 * The flare's hit rule IS the lit circle: burstRadius = the effective lit
 * radius (× the incendiary shrink when that doctrine is held), so an
 * interceptor already inside the would-be lit circle still bursts the flare
 * at its target (zone where aimed); damage is HARDCODED ZERO everywhere
 * (amendment 39).
 */
function fireStarShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  const stars = ship.stats.starShells;
  if (!consume(pool, stars.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, stars.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.starShells.shellRadius);
  const litRadius =
    stars.litRadius * (stars.mode === 'incendiary' ? CONFIG.starShells.incendiaryRadiusFactor : 1);
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.starShells.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.starShells.shellRadius,
    damage: 0, // amendment 39: the flare deals zero damage, structurally
    hitRadius: CONFIG.starShells.shellRadius,
    kind: 'shell', // rides the existing shell wire kind (first-sight reveal, constant-free shape)
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: litRadius, // the burst IS the lit circle
    contactDamage: 0, // interception does 0 — and still lights (World.resolveShell)
    lit: { radius: litRadius, durationMs: stars.litDurationMs },
  });
  return { shell, denial: null };
}

/** The starShells Equipment row. Pool size + reload come from the ship's
 *  cached effective stats (pure CONFIG.starShells pass-throughs — maxAmmo
 *  pinned to 1, the single-shot cooldown). Slot state is non-null by the
 *  loadout invariant (see index.ts). */
export const starShellsEquipment: Equipment = {
  id: 'starShells',
  isWeapon: EQUIPMENT_IS_WEAPON.starShells, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.starShells.maxAmmo, ship.stats.starShells.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated flare is then
    // pre-stepped by the World to where it belongs this tick.
    const { shell, denial } = fireStarShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
