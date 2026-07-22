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

import { CONFIG, EQUIPMENT_IS_WEAPON, angleDiff, segCircleExit, wrapAngle, type EquipmentState, type ShellState, type Vec2 } from '@salvo/shared';
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

/** The water disk is centered at the world origin (the boundary clamp too). */
const MAP_ORIGIN: Vec2 = { x: 0, y: 0 };
/** Keep a clamped burst point this far inside the water disk (u) so a rim shot
 *  bursts at a legitimate in-water point rather than expiring at the map edge. */
const MAP_EDGE_EPSILON = 1;

/**
 * Pull `target` back inside the water disk along the ship→target ray: if that
 * segment exits the map circle, clamp to the exit crossing minus a small
 * epsilon. Built on the shared segCircleExit primitive — no hand-rolled root
 * solving. A target already inside the disk is returned unchanged. Guards a rim
 * ship firing outward: a map-edge crossing must not beat the burst at an
 * otherwise in-range point (the shell would silently expire at the edge).
 */
function clampInsideMap(center: Vec2, target: Vec2, mapRadius: number): Vec2 {
  const t = segCircleExit(center, target, MAP_ORIGIN, mapRadius);
  if (t === null) return target; // the ray never leaves the disk
  // Defense-in-depth (unreachable for a live ship — the boundary clamp keeps
  // every center polyMax inside the rim): a degenerate exit at the segment
  // start would collapse the target onto the ship center; keep the range-
  // clamped target instead (pre-clamp behavior: the shell expires at the edge).
  if (t <= 0) return target;
  const len = Math.hypot(target.x - center.x, target.y - center.y);
  const back = len <= 0 ? 0 : Math.max(0, t - MAP_EDGE_EPSILON / len);
  return { x: center.x + (target.x - center.x) * back, y: center.y + (target.y - center.y) * back };
}

/**
 * The clicked burst point: along the aim bearing at the clicked distance
 * (input.aimDist), clamped to the ship's EFFECTIVE max gun range
 * (stats.gun.rangeU — the gunRange upgrade; base = CONFIG.vision.radar) AND to
 * the water disk (an in-range rim shot still bursts in-bounds instead of
 * expiring at the map edge). BOTH distances are measured from the ship CENTER.
 * Exported for tests.
 */
export function gunTarget(ship: ShipRecord, mapRadius: number): Vec2 {
  const dist = Math.min(Math.max(ship.input.aimDist, 0), ship.stats.gun.rangeU);
  const target = {
    x: ship.state.x + Math.cos(ship.input.aim) * dist,
    y: ship.state.y + Math.sin(ship.input.aim) * dist,
  };
  return clampInsideMap(ship.state, target, mapRadius);
}

/**
 * Where the shell spawns: normally the hull-silhouette muzzle edge along the
 * aim bearing (muzzleSpawn — no dead ring). But a point-blank click INSIDE the
 * muzzle (target no farther from the ship center than the muzzle-spawn distance
 * + shellRadius) would otherwise spawn the shell PAST its own target, flying
 * outward to a splash — a new INNER dead ring (up to ~64u on a battleship bow).
 * Spawn AT the target instead, so next tick's stepShell bursts there
 * immediately (distToTarget 0). Eric ruling 2026-07-21: no dead ring, inner or
 * outer.
 */
function muzzleOrTarget(ship: ShipRecord, dir: number, target: Vec2): Vec2 {
  const muzzle = muzzleSpawn(ship, dir, CONFIG.gun.shellRadius);
  const targetDist = Math.hypot(target.x - ship.state.x, target.y - ship.state.y);
  const muzzleDist = Math.hypot(muzzle.x - ship.state.x, muzzle.y - ship.state.y);
  return targetDist <= muzzleDist + CONFIG.gun.shellRadius ? { x: target.x, y: target.y } : muzzle;
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
  mapRadius: number,
  mkId: () => string,
): { shell: ShellState | null; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.gun.reloadMs)) return { shell: null, denial: 'no-ammo' }; // pool empty
  const dir = ship.input.aim;
  const target = gunTarget(ship, mapRadius);
  const origin = muzzleOrTarget(ship, dir, target);
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
  isWeapon: EQUIPMENT_IS_WEAPON.gun, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.gun.maxAmmo, ship.stats.gun.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated shell is then
    // pre-stepped by the World to where it belongs this tick.
    const { shell, denial } = fireGunShell(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    if (shell) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
