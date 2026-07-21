// Gun fire control — the gun Equipment row. The UNIVERSAL STANDARD GUN (Eric
// rulings 2026-07-21): the permanently-selected default weapon. 360° — there
// is NO arc check (the gun is never out-of-arc); a click is denied only by an
// empty pool (the 3s single-shot cooldown, a 1-round pool in ammo terms). The
// shell flies to the CLICKED POINT — target = ship center + unit(aim) ×
// min(aimDist, effective gun range), range measured from the ship CENTER (the
// muzzle offset never extends reach) — and BURSTS there in CONFIG.gun.
// burstRadius (the per-projectile hit rule rides ShellState; resolution lives
// in shared stepShell/burstVictims, damage application in the World). Shells
// spawn at the hull SILHOUETTE edge along the aim bearing (no dead ring — see
// ballistics.muzzleSpawn). Pure over a ShipRecord's input + pose + slot pool;
// the World owns shell storage + event emission.

import { CONFIG, angleDiff, wrapAngle, type EquipmentState, type ShellState, type Vec2 } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic, muzzleSpawn } from './ballistics.js';

/**
 * Clamp `angle` into the arc `[center - halfArc, center + halfArc]`. Returns the
 * nearest in-arc bearing (equal to `angle`, wrapped, when already inside).
 * The 360° gun no longer uses it — torpedoes clamp into their bow arc with it.
 */
export function clampToArc(angle: number, center: number, halfArc: number): number {
  const d = angleDiff(center, angle); // shortest signed offset from center
  if (d > halfArc) return wrapAngle(center + halfArc);
  if (d < -halfArc) return wrapAngle(center - halfArc);
  return wrapAngle(angle);
}

/**
 * The clicked burst point: along the aim bearing at the clicked distance
 * (input.aimDist), clamped to the ship's EFFECTIVE max gun range
 * (stats.gun.rangeU — the gunRange upgrade; base = CONFIG.vision.radar).
 * BOTH distances are measured from the ship CENTER. Exported for tests.
 */
export function gunTarget(ship: ShipRecord): Vec2 {
  const dist = Math.min(Math.max(ship.input.aimDist, 0), ship.stats.gun.rangeU);
  return {
    x: ship.state.x + Math.cos(ship.input.aim) * dist,
    y: ship.state.y + Math.sin(ship.input.aim) * dist,
  };
}

/**
 * Gun fire control against one slot pool: 0 or 1 shell. The ONLY denial is an
 * empty pool ('no-ammo' — the shot cooldown); there is no arc. The shell
 * carries the gun's hit rule: target point + burstRadius + contactDamage.
 * distLeft is the spawn→target distance plus a shellRadius of slack — the
 * shell stops AT its target (stepShell), so the slack only guards float drift
 * from ever expiring it a hair short of the burst.
 */
function fireGunShell(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.gun.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = gunTarget(ship);
  const origin = muzzleSpawn(ship, dir, CONFIG.gun.shellRadius);
  const shell = makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.gun.shellSpeed,
    range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.gun.shellRadius,
    damage: CONFIG.gun.damage,
    hitRadius: CONFIG.gun.shellRadius,
    kind: 'shell',
    origin,
    targetX: target.x,
    targetY: target.y,
    burstRadius: CONFIG.gun.burstRadius,
    contactDamage: CONFIG.gun.contactDamage,
  });
  return { shell, denial: null };
}

/** The gun Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (maxAmmo is pinned to 1 — the single-shot cooldown).
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const gunEquipment: Equipment = {
  id: 'gun',
  isWeapon: true,
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.gun.maxAmmo, ship.stats.gun.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    const { shell, denial } = fireGunShell(ctx.ship, slot.state!, ctx.now, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
