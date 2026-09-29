// Star-shell fire control — the starShells Equipment row (Story 1.7, the
// Battleship's slot-2 special). A gun-pattern skillshot whose burst IS its
// lit circle. Since Story 8.17 (Eric ruling 2026-09-29, epic-8 amendment 130)
// the flare is a TIERED WEAPON: it deals the row's `damage` (10 / 12 / 15 /
// 17 / 20, tier I–V) to EVERY non-owner hull whose silhouette is inside the
// WHOLE lit circle at burst — `burstRadius` stays `= litRadius`, so the water
// it hurts is exactly the water it lights — and an interceptor en route takes
// the same number as `contactDamage` (the broadside precedent) while the
// flare STILL lights where it stopped: the shell carries the server-internal
// `lit` tag, so the World spawns a {litRadius, litDurationMs} zone at the
// burst point OR the interception stop point (World.resolveShell) —
// firer-only truesight parity inside it lives in signals.ts/perception.ts,
// never here. Amendment 39's "structurally damageless" flare is SUPERSEDED.
//
// The old PHOSPHOR and DAZZLE doctrine verbs are DELETED (amendment 134): a
// lit zone only ever LIGHTS. PHOSPHOR SHELLS is its own weapon row
// (equipment/phosphorShells.ts) and FLASH SHELLS a belt consumable
// (equipment/consumables/dazzleShells.ts). Same fire flow as the gun (360°,
// clamp at the system's effective range, muzzle-or-target spawn,
// makeBallistic with D1 fireT); range = the gun's BASE range
// (stats.equipment.starShells.rangeU, radar-derived). Pure over a ShipRecord's
// input + pose + slot pool; the World owns shell storage, zone spawn, and
// event emission.

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
 * radius, so an interceptor already inside the would-be lit circle still
 * bursts the flare at its target (zone where aimed); damage is the tier's
 * number from the OWNER's effective row (amendment 130).
 */
function fireStarShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  const stars = ship.stats.equipment.starShells;
  if (!consume(pool, stars.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = burstPoint(ship, mapRadius, stars.rangeU);
  const origin = muzzleOrTarget(ship, dir, target, CONFIG.starShells.shellRadius);
  const litRadius = stars.litRadius;
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.starShells.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.starShells.shellRadius,
    damage: stars.damage, // amendment 130: the tier's number to every hull inside the whole lit circle
    hitRadius: CONFIG.starShells.shellRadius,
    kind: 'shell', // rides the existing shell wire kind (first-sight reveal, constant-free shape)
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: litRadius, // the burst IS the lit circle
    contactDamage: stars.damage, // an interceptor takes the tier damage (the broadside precedent) — and it still lights (World.resolveShell)
    hits: CONFIG.starShells.hits, // AR44 target mask — no mine bit: lighting never clears a minefield
    family: 'cannon', // Story 8.15: a flare flies a gun-pattern shell — `w: 'cannon'`
    lit: { radius: litRadius, durationMs: stars.litDurationMs },
  });
  return { shell, denial: null };
}

/** The starShells Equipment row. Pool size + reload come from the ship's
 *  cached effective stats (CONFIG.starShells pass-throughs folded by the
 *  STAR SHELLS ladder — maxAmmo 1 → 3, the single-shot cooldown). Slot state
 *  is non-null by the loadout invariant (see index.ts). */
export const starShellsEquipment: Equipment = {
  id: 'starShells',
  isWeapon: EQUIPMENT_IS_WEAPON.starShells, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.equipment.starShells.maxAmmo, ship.stats.equipment.starShells.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated flare is then
    // pre-stepped by the World to where it belongs this tick.
    const { shell, denial } = fireStarShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
