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

import {
  BARREL_FAN_STEP_RAD,
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  angleDiff,
  burstPointAlong as sharedBurstPointAlong,
  muzzleOrTarget as sharedMuzzleOrTarget,
  wrapAngle,
  type EquipmentState,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';

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
 * The clicked burst point for ANY point-burst system (gun / cannon / star
 * shells — the Story 1.7 rows reuse the gun's exact flow): along the aim
 * bearing at the clicked distance (input.aimDist), clamped to the system's
 * EFFECTIVE max range `rangeU` AND to the water disk (an in-range rim shot
 * still bursts in-bounds instead of expiring at the map edge). BOTH distances
 * are measured from the ship CENTER.
 */
export function burstPoint(ship: ShipRecord, mapRadius: number, rangeU: number): Vec2 {
  return burstPointAlong(ship, mapRadius, rangeU, ship.input.aim);
}

/** burstPoint generalized over an explicit bearing (Story 2.8) — the
 *  ShipRecord-shaped wrapper around the shared `burstPointAlong` (sim/aim.ts,
 *  where the full rationale + the map clamp live): the multi-barrel fan aims
 *  each shell at its OWN range-preserved burst point along its own fanned
 *  bearing. Promoted to shared so the client's blast-radius preview circle
 *  sits at the exact point the shell will burst at. */
export function burstPointAlong(
  ship: ShipRecord,
  mapRadius: number,
  rangeU: number,
  dir: number,
  minU = 0,
): Vec2 {
  return sharedBurstPointAlong(ship.state, ship.input.aimDist, mapRadius, rangeU, dir, minU);
}

/**
 * The gun's clicked burst point: burstPoint at the ship's EFFECTIVE max gun
 * range (stats.gun.rangeU — the gunRange upgrade; base = CONFIG.vision.radar).
 * Exported for tests.
 */
export function gunTarget(ship: ShipRecord, mapRadius: number): Vec2 {
  return burstPoint(ship, mapRadius, ship.stats.gun.rangeU);
}

/**
 * Where the shell spawns: normally the hull-silhouette muzzle edge along the
 * aim bearing (muzzleSpawn — no dead ring). But a point-blank click INSIDE the
 * muzzle (target no farther from the ship center than the muzzle-spawn distance
 * + shellRadius) would otherwise spawn the shell PAST its own target, flying
 * outward to a splash — a new INNER dead ring (up to ~64u on a battleship bow).
 * Spawn AT the target instead, so next tick's stepShell bursts there
 * immediately (distToTarget 0). Eric ruling 2026-07-21: no dead ring, inner or
 * outer. `shellRadius` is the firing system's collision radius (shared with
 * the cannon/star-shell rows, Story 1.7).
 */
export function muzzleOrTarget(ship: ShipRecord, dir: number, target: Vec2, shellRadius: number): Vec2 {
  return sharedMuzzleOrTarget(ship.state, ship.hullId, dir, target, shellRadius);
}

/**
 * Gun fire control against one slot pool: `stats.gun.barrels` shells (1..3 —
 * TWIN/TRIPLE MOUNT, Story 2.8) for ONE consumed round, fanned
 * BARREL_FAN_STEP_RAD apart centered on the aim bearing, each a REAL shell
 * flying to its OWN range-preserved burst point along its own bearing. The
 * ONLY denial is an empty pool ('no-ammo' — the shot cooldown; single-consume,
 * so the denial mapping is unchanged from the single-barrel era); there is no
 * arc.
 *
 * THE SAME-CLICK SALVO SINGLE-HIT RULE (Story 2.8 review, P1): a multi-barrel
 * click tags every shell it spawns with ONE server-internal salvo id (the
 * first shell's id — no extra id consumed, never on the wire) so the World can
 * hold a victim to at most ONE damage application per salvo. Without it the
 * fanned bursts overlap at practical ranges and one hull eats 3× damage
 * (max-stacked 3 × 40 = 120 > the 80hp lightest hull; at the original 70hp
 * floor even base 3 × 25 = 75 breached), breaching the ratified
 * no-one-click-kill guardrail. A SINGLE-barrel click is untagged: a salvo of
 * one satisfies the rule trivially, so the base path stays allocation-free.
 *
 * Every shell carries the gun's hit rule off the OWNER's effective stats:
 * target point + burstRadius + damage/contactDamage (Story 2.8 — stats, never
 * CONFIG, so the HEAVY SHELLS ladder lands). distLeft is the spawn→target
 * distance plus a shellRadius of slack — the shell stops AT its target
 * (stepShell), so the slack only guards float drift from ever expiring it a
 * hair short of the burst.
 */
function fireGunShells(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mapRadius: number,
  mkId: () => string,
): { shells: ShellState[]; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.gun.reloadMs)) return { shells: [], denial: 'no-ammo' }; // pool empty
  const gun = ship.stats.gun;
  const shells: ShellState[] = [];
  for (let b = 0; b < gun.barrels; b += 1) {
    const dir = ship.input.aim + (b - (gun.barrels - 1) / 2) * BARREL_FAN_STEP_RAD;
    const target = burstPointAlong(ship, mapRadius, gun.rangeU, dir);
    const origin = muzzleOrTarget(ship, dir, target, CONFIG.gun.shellRadius);
    shells.push(
      makeBallistic(mkId(), ship, dir, now, {
        speed: CONFIG.gun.shellSpeed,
        range: Math.hypot(target.x - origin.x, target.y - origin.y) + CONFIG.gun.shellRadius,
        damage: gun.damage,
        hitRadius: CONFIG.gun.shellRadius,
        kind: 'shell',
        origin,
        targetX: target.x,
        targetY: target.y,
        burstRadius: gun.burstRadius,
        contactDamage: gun.contactDamage,
      }),
    );
  }
  // One salvo id per multi-barrel click (the first shell's own id).
  if (shells.length > 1) for (const s of shells) s.salvo = shells[0].id;
  return { shells, denial: null };
}

/** The gun Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (base maxAmmo 1; AFT TURRET may raise it — Story 2.8).
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
    const { shells, denial } = fireGunShells(ctx.ship, slot.state!, ctx.fireT, ctx.mapRadius, ctx.mkId);
    for (const shell of shells) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
