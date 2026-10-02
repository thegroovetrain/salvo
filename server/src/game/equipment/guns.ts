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
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  angleDiff,
  burstPointAlong as sharedBurstPointAlong,
  gunReachU as sharedGunReachU,
  muzzleOrTarget as sharedMuzzleOrTarget,
  parallelOffsets,
  wrapAngle,
  type EquipmentState,
  type ShellState,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationContext, ActivationDenial, Equipment } from './index.js';
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
 * The clicked burst point for ANY point-burst system (gun / broadside / star
 * shells — those rows reuse the gun's exact flow): along the aim
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
 * THE CURSOR POINT (Eric 2026-10-01, epic-8 amendment 202 — "the cursor
 * decides"): where the shooter's cursor sat when a deck gun fired — ship
 * CENTRE + `aimDist` along `dir`, with NO reach clamp and NO map clamp. The one
 * helper the cannon, the flak gun and the machine gun all call, so the three
 * cannot disagree about where the click was. The only clamp that applies is
 * the input sanitizer's (inputs.ts `sanitizeAimDist`: finite-checked, then
 * clamped to [0, AIM_DIST_MAX]). Server-internal: it rides `ShellState.cursor`
 * for the mine landing test and never the wire.
 */
export function rawAimPoint(ship: ShipRecord, dir: number): Vec2 {
  const d = ship.input.aimDist;
  return { x: ship.state.x + Math.cos(dir) * d, y: ship.state.y + Math.sin(dir) * d };
}

/**
 * The gun's clicked burst point: burstPoint at the ship's EFFECTIVE max gun
 * range (stats.equipment.gun.rangeU — the gunRange upgrade; base = CONFIG.vision.radar).
 * Exported for tests.
 */
export function gunTarget(ship: ShipRecord, mapRadius: number): Vec2 {
  return burstPoint(ship, mapRadius, ship.stats.equipment.gun.rangeU);
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
 * the broadside/star-shell rows).
 */
export function muzzleOrTarget(ship: ShipRecord, dir: number, target: Vec2, shellRadius: number): Vec2 {
  return sharedMuzzleOrTarget(ship.state, ship.hullId, dir, target, shellRadius);
}

/**
 * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15; amendment 114) — the
 * ShipRecord-shaped wrapper around the SHARED predicate (`sim/aim.ts`
 * `gunReachU`, where the full rationale lives). A deck-gun click normally
 * clamps to its row's `rangeU`; a click whose burst point lies inside a LIVE
 * lit zone the CLICKING PLAYER owns is legal past it, and the shell flies the
 * whole way.
 *
 * THE RULE ITSELF IS NOT WRITTEN HERE. It is promoted into `shared/` exactly
 * as `blockedWater` and `burstPointAlong` were, so the previewed reach and the
 * enforced reach are one function. Nothing in this file may re-derive it.
 *
 * What stays server-side is the two things `shared/` may not see:
 *   * DECK GUNS ONLY — the cannon (`gun`), the MACHINE GUN and the FLAK GUN
 *     (Eric ruling 2026-09-29, amendment 114: every deck gun fires into the
 *     shooter's own lit-up area) call this, each passing its OWN row's
 *     `rangeU`. The broadside, the star shell and the torpedo keep their own
 *     reach.
 *   * OWN FLARES ONLY — `ctx.ownLitZones()` is keyed on the ACTIVATING ship, so
 *     an enemy's flare hanging over your target lights the water for THEM and
 *     buys you nothing.
 * SERVER-AUTHORITATIVE: this IS the legality answer; the client's preview is
 * never asked.
 */
export function gunReachU(ctx: ActivationContext, rangeU: number): number {
  const ship = ctx.ship;
  return sharedGunReachU(ship.state, ship.input.aim, ship.input.aimDist, rangeU, ctx.mapRadius, ctx.ownLitZones());
}

/**
 * Gun fire control against one slot pool: `stats.equipment.gun.barrels` shells (1..3
 * — the CANNON rungs to tiers II and IV each add one, Eric 2026-10-02, epic-8
 * amendment 232; the 1..3 clamp is now reached exactly)
 * for ONE consumed round, each a REAL shell
 * bursting at its OWN point. The ONLY denial is an empty pool ('no-ammo' — the
 * shot cooldown; single-consume, so the denial mapping is unchanged from the
 * single-barrel era); there is no arc.
 *
 * BARREL FIRES PARALLEL, AND STRADDLES (Story 7-5 wave 2, R2.16). The extra
 * shells no longer FAN 3° apart — they fly on PARALLEL TRACKS
 * `CONFIG.gun.barrelSpacingU` apart, so the volley covers a constant-width band
 * at EVERY range instead of one that widens with distance. The offsets come
 * from the SHARED straddle law (sim/spread.ts `parallelOffsets`) — the exact
 * call the client's aim preview makes — so an ODD barrel count puts one shell
 * exactly on the click and an EVEN count straddles it with none on it, and the
 * previewed circles ARE where the shells burst. Re-deriving the geometry on
 * either side is forbidden: two derivations of one volley is precisely the
 * desync class effectiveStats() exists to prevent, and until this landed the
 * server FANNED while the client already PREVIEWED parallel.
 *
 * The lateral offset is added to BOTH the muzzle and the target, which is what
 * makes the tracks parallel; every shell therefore keeps the SAME bearing
 * (`ship.input.aim`) and the SAME flight length. A single barrel gets the single
 * zero offset, so the one-shell case is byte-identical to the pre-wave-2
 * geometry.
 *
 * SIGNALS DO NOT MOVE. A multi-barrel gun salvo still collapses to ONE `mz`
 * (Story 4.3, amendments 19/20 — per-shell flashes would leak the barrel
 * count). `perShellFlash` is the BROADSIDE BARRAGE's declared opt-out (R2.5) and
 * this row deliberately does not take it.
 *
 * EVERY BARREL IS A REAL SHELL THAT DEALS FULL DAMAGE (Eric ruling 2026-08-05):
 * parallel tracks 12u apart against a 15u burst radius still OVERLAP, at every
 * range rather than only close in, and a hull standing inside two or three of
 * them takes two or three applications. That is the point of the mount cards,
 * not a bug in them: "everything that connects should
 * deal damage." The one-hit-kill guardrail governs a single SHELL, not a single
 * CLICK — the Story 2.8 review's same-click salvo ledger (a server-internal tag
 * holding a victim to ONE application per click) was an orchestrator invention
 * that has been DELETED, tag and all. It was mandatory under the pre-rebalance
 * numbers (gun 25, lightest hull 70 — base 3 × 25 = 75 breached the floor with
 * no upgrades at all); the cycle-44 rebalance (gun 15, lightest hull 80) removed
 * that premise. The accepted consequence: every shell of a multi-barrel click
 * lands; the reachable max is the CANNON's tier-V triple mount (3 barrels × 21 =
 * 63; 3 × 18 = 54 at tier IV — Eric 2026-10-02, amendment 232). No PLAYER hull
 * can be one-clicked — the lightest class hull is 250 hp; the 45 hp small and
 * 60 hp medium drone one-clicks at tier V are ACCEPTED consequences (Eric
 * 2026-10-02, amendment 232; the 75 hp large drone still takes two).
 *
 * Every shell carries the gun's hit rule off the OWNER's effective stats:
 * target point + burstRadius + damage/contactDamage (Story 2.8 — stats, never
 * CONFIG, so the HEAVY SHELLS ladder lands). distLeft is the spawn→target
 * distance plus a shellRadius of slack — the shell stops AT its target
 * (stepShell), so the slack only guards float drift from ever expiring it a
 * hair short of the burst. It is the SAME length for every shell of the volley,
 * because parallel tracks are equal-length by construction.
 */
function fireGunShells(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  reachU: number,
  mapRadius: number,
  mkId: () => string,
): { shells: ShellState[]; denial: ActivationDenial | null } {
  if (!consume(pool, ship.stats.equipment.gun.reloadMs)) return { shells: [], denial: 'no-ammo' }; // pool empty
  const gun = ship.stats.equipment.gun;
  const dir = ship.input.aim;
  const center = burstPointAlong(ship, mapRadius, reachU, dir);
  // Every barrel carries the ONE unclamped click centre (amendment 202): the
  // multi-barrel mount's straddle offsets move where each shell lands, not the cursor.
  const cursor = rawAimPoint(ship, dir);
  const muzzle = muzzleOrTarget(ship, dir, center, CONFIG.gun.shellRadius);
  const range = Math.hypot(center.x - muzzle.x, center.y - muzzle.y) + CONFIG.gun.shellRadius;
  const shells: ShellState[] = [];
  for (const off of parallelOffsets(dir, gun.barrels, CONFIG.gun.barrelSpacingU)) {
    shells.push(
      makeBallistic(mkId(), ship, dir, now, {
        speed: CONFIG.gun.shellSpeed,
        range,
        damage: gun.damage,
        hitRadius: CONFIG.gun.shellRadius,
        kind: 'shell',
        origin: { x: muzzle.x + off.x, y: muzzle.y + off.y },
        targetX: center.x + off.x,
        targetY: center.y + off.y,
        burstRadius: gun.burstRadius,
        contactDamage: gun.contactDamage,
        hits: CONFIG.gun.hits, // AR44 target mask
        family: 'cannon', // Story 8.15: the reveal's `w`
        cursor, // amendment 202: the mine landing test's cursor point
      }),
    );
  }
  return { shells, denial: null };
}

/** The gun Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (base maxAmmo 1; the CANNON ladder's tier-III rung raises
 *  it to 2 — amendment 197).
 *  Slot state is non-null by the loadout invariant (see index.ts). */
export const gunEquipment: Equipment = {
  id: 'gun',
  isWeapon: EQUIPMENT_IS_WEAPON.gun, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.equipment.gun.maxAmmo, ship.stats.equipment.gun.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated shell is then
    // pre-stepped by the World to where it belongs this tick.
    // R2.15: an own LIVE lit zone over the clicked point extends the reach.
    const reachU = gunReachU(ctx, ctx.ship.stats.equipment.gun.rangeU);
    const { shells, denial } = fireGunShells(ctx.ship, slot.state!, ctx.fireT, reachU, ctx.mapRadius, ctx.mkId);
    for (const shell of shells) ctx.spawnBallistic(shell);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
