// Torpedo fire control — the torpedo Equipment row. A single bow tube on a 12s
// reload (owner play test 2026-07-13: two tubes fired both fish within ~2
// ticks of one click, hiding the reload; one fish per click + a real reload is
// the intended commitment-spike feel). The bow tube is now just the slot's
// one-deep ammo pool (equipment/ammo.ts) — a launch consumes the round +
// starts the reload if idle. A torpedo is just a slow, long-legged,
// hard-hitting ballistic: it reuses the shared stepShell machinery (islands
// block it, swept-silhouette hull hits, permanent owner immunity) via ShellState's
// weapon-param fields. Bow arc heading±30°; aim clamped into the arc, else no
// launch.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import {
  CONFIG,
  EQUIPMENT_IS_WEAPON,
  inArc,
  isAfloat,
  minCommandDistance as sharedMinCommandDistance,
  sectorArcFor,
  wrapAngle,
  type EquipmentState,
  type ShellState,
} from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { burstPointAlong, clampToArc } from './guns.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';

// The bow sector's ratified shape (Story 1.10): the shared arcFor family is
// the single arc-shape source — the same descriptor the client's weaponArc
// classification renders, so the enforced arc and the drawn arc can never
// diverge (byte-identical to CONFIG.torpedo.offset/halfArc). Resolved at
// module load; a non-sector torpedo arc is an authoring error, failed loudly
// (sectorArcFor throws), never mid-tick.
const BOW_SECTOR = sectorArcFor('torpedo');

/** The nearest legal commanded burst distance from the ship CENTER — the
 *  ShipRecord-shaped wrapper around the shared `minCommandDistance`
 *  (sim/aim.ts, where the full rationale lives): the fish's own spawn offset
 *  along the bearing plus a small epsilon, so the commanded burst point is
 *  always AHEAD of the spawn point. Promoted to shared so the client's command
 *  aim preview honors the same floor. */
function minCommandDistance(ship: ShipRecord): number {
  return sharedMinCommandDistance(ship.cls.hull.length);
}

/**
 * Torpedo launch against one slot pool, checks in TODAY'S order: bow arc first
 * (arc-miss does NOT spend a round), then the pool (empty denies). The denial
 * reason reports whichever check failed first; `null` means a fish launched.
 * Direction-only in 'standard'/'homing' modes: the fish runs until impact and
 * never reads input.aimDist. DOCTRINE MODES (Story 2.8, stats.torpedo.mode):
 * 'homing' (ACOUSTIC HOMING) launches with the per-tick steering params
 * (CONFIG.torpedo.homingTurnRate/homingAcquireRange — sim/shell.ts steers
 * toward the nearest non-owner HULL; decoys never attract it) AND a finite
 * CONFIG.torpedo.homingMaxRangeU travel budget (an orbiting fish must die);
 * 'command' (COMMAND DETONATION) is a point-detonation at the click — target =
 * burstPointAlong the launch bearing, capped by the OWNER's effective RADAR
 * range (the ratified reach) and floored at minCommandDistance (the point can
 * never sit behind the spawned fish), blast =
 * CONFIG.torpedo.commandBurstRadius — while a contact hit en route stays an
 * ordinary full-damage torpedo hit (contactDamage = damage).
 */
function launchTorpedo(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mkId: () => string,
  mapRadius: number,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const center = wrapAngle(ship.state.heading + BOW_SECTOR.offset); // bow-centered
  if (!inArc(ship.input.aim, center, BOW_SECTOR.halfArc)) return { torp: null, denial: 'out-of-arc' };
  if (!consume(pool, ship.stats.torpedo.reloadMs)) return { torp: null, denial: 'no-ammo' }; // pool empty
  const t = ship.stats.torpedo;
  const dir = clampToArc(ship.input.aim, center, BOW_SECTOR.halfArc);
  // COMMAND DETONATION's commanded point: the gun-family burstPoint (clicked
  // distance along the aim, clamped to the water disk) with reach capped by
  // the owner's effective radarRange. In-arc aim ≡ the launch bearing, so the
  // point always lies on the fish's actual track.
  const command =
    t.mode === 'command'
      ? burstPointAlong(ship, mapRadius, ship.stats.radarRange, dir, minCommandDistance(ship))
      : null;
  const torp = makeBallistic(mkId(), ship, dir, now, {
    speed: t.speed, // effective launch speed (the HIGH-SPEED SETTING ladder)
    // A3: run until impact / map edge — EXCEPT a homing fish, which carries a
    // finite total-travel budget (Story 2.8 review, P8: a steering fish can
    // orbit a slow target forever otherwise). Budget exhausted = a normal
    // torpedo expiry (splash boom, no burst).
    range: t.mode === 'homing' ? CONFIG.torpedo.homingMaxRangeU : Number.POSITIVE_INFINITY,
    damage: t.damage, // effective damage (the HEAVY WARHEAD ladder) — never raw CONFIG
    hitRadius: CONFIG.torpedo.hitRadius, // A4: own value, no longer gun.shellRadius
    spawnClearance: CONFIG.torpedo.spawnClearance, // real spawn margin (clean spawn geometry)
    kind: 'torp',
    // Contact-only hit rule unless command-moded: no target point, no blast,
    // an interceptor takes the full torpedo damage.
    targetX: command === null ? null : command.x,
    targetY: command === null ? null : command.y,
    burstRadius: command === null ? 0 : CONFIG.torpedo.commandBurstRadius,
    contactDamage: t.damage,
    ...(t.mode === 'homing'
      ? { homing: { turnRate: CONFIG.torpedo.homingTurnRate, acquireRange: CONFIG.torpedo.homingAcquireRange } }
      : {}),
  });
  return { torp, denial: null };
}

/**
 * Launch one torpedo from the bow tube (the World routes at most one click here
 * per fireSeq increment) against the torpedo slot's pool, or null if the pool
 * is empty or the aim is out of the bow arc. The alive + selected-slot guards
 * are kept for direct test callers (re-keyed from the retired WEAPON selector
 * to the loadout slot fitting 'torpedo'); the click gate itself lives in
 * World.fireControl. Exported for tests (pool reload, arc gating). `mapRadius`
 * matters only to a command-moded fish's clicked point (Infinity = no water-
 * disk clamp — the standard/homing paths never read it).
 */
export function fireTorpedo(
  ship: ShipRecord,
  now: number,
  mkId: () => string,
  mapRadius: number = Number.POSITIVE_INFINITY,
): ShellState | null {
  const slotIndex = ship.loadout.findIndex((s) => s.equipmentId === 'torpedo');
  if (!isAfloat(ship.lifecycle) || slotIndex < 0 || ship.input.slot !== slotIndex) return null;
  // Loadout invariant: a fitted slot always has state.
  return launchTorpedo(ship, ship.loadout[slotIndex].state!, now, mkId, mapRadius).torp;
}

/** The torpedo Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (Stage D upgrades). Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const torpedoEquipment: Equipment = {
  id: 'torpedo',
  isWeapon: EQUIPMENT_IS_WEAPON.torpedo, // shared weapon/ability split — single source
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.torpedo.maxAmmo, ship.stats.torpedo.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    // bornAt = the VALIDATED fire time (D1): a back-dated fish is then
    // pre-stepped by the World to where it belongs this tick.
    const { torp, denial } = launchTorpedo(ctx.ship, slot.state!, ctx.fireT, ctx.mkId, ctx.mapRadius);
    if (torp) ctx.spawnBallistic(torp);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
