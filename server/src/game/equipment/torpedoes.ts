// Torpedo fire control — the torpedo Equipment row. A single bow tube on a 12s
// reload (owner play test 2026-07-13: two tubes fired both fish within ~2
// ticks of one click, hiding the reload; one fish per click + a real reload is
// the intended commitment-spike feel). The bow tube is now just the slot's
// one-deep ammo pool (equipment/ammo.ts) — a launch consumes the round +
// starts the reload if idle. A torpedo is just a slow, long-legged,
// hard-hitting ballistic: it reuses the shared stepShell machinery (islands
// block it, swept-capsule hull hits, owner self-hit grace) via ShellState's
// weapon-param fields. Bow arc heading±30°; aim clamped into the arc, else no
// launch.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import { CONFIG, WEAPON, inArc, wrapAngle, type EquipmentState, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { ActivationDenial, Equipment } from './index.js';
import { clampToArc } from './guns.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';

/**
 * Torpedo launch against one slot pool, checks in TODAY'S order: bow arc first
 * (arc-miss does NOT spend a round), then the pool (empty denies). The denial
 * reason reports whichever check failed first; `null` means a fish launched.
 * Direction-only: a torpedo runs until impact, so it deliberately never reads
 * input.aimDist.
 */
function launchTorpedo(
  ship: ShipRecord,
  pool: EquipmentState,
  now: number,
  mkId: () => string,
): { torp: ShellState | null; denial: ActivationDenial | null } {
  const center = wrapAngle(ship.state.heading + CONFIG.torpedo.offset); // bow-centered
  if (!inArc(ship.input.aim, center, CONFIG.torpedo.halfArc)) return { torp: null, denial: 'out-of-arc' };
  if (!consume(pool, ship.stats.torpedo.reloadMs)) return { torp: null, denial: 'no-ammo' }; // pool empty
  const dir = clampToArc(ship.input.aim, center, CONFIG.torpedo.halfArc);
  const torp = makeBallistic(mkId(), ship, dir, now, {
    speed: ship.stats.torpedo.speed, // effective launch speed (torpedoSpeed upgrade)
    range: Number.POSITIVE_INFINITY, // A3: run until impact / map edge
    damage: CONFIG.torpedo.damage,
    hitRadius: CONFIG.torpedo.hitRadius, // A4: own value, no longer gun.shellRadius
    graceMs: CONFIG.torpedo.selfHitGrace, // A4: own value
    spawnClearance: CONFIG.torpedo.spawnClearance, // real spawn margin — self-hit fix
    kind: 'torp',
  });
  return { torp, denial: null };
}

/**
 * Launch one torpedo from the bow tube (the World routes at most one click here
 * per fireSeq increment) against the torpedo slot's pool, or null if the pool
 * is empty or the aim is out of the bow arc. The alive + weapon guards are kept
 * for direct test callers; the click gate itself lives in World.fireControl.
 * Exported for tests (pool reload, arc gating).
 */
export function fireTorpedo(ship: ShipRecord, now: number, mkId: () => string): ShellState | null {
  if (!ship.alive || ship.input.weapon !== WEAPON.torpedo) return null;
  // Loadout invariant: the torpedo slot (index == WEAPON.torpedo today) is
  // always fitted, so state is set.
  return launchTorpedo(ship, ship.loadout[WEAPON.torpedo].state!, now, mkId).torp;
}

/** The torpedo Equipment row. Pool size + reload come from the ship's cached
 *  effective stats (Stage D upgrades). Slot state is non-null by the loadout
 *  invariant (see index.ts). */
export const torpedoEquipment: Equipment = {
  id: 'torpedo',
  isWeapon: true,
  tick(ship, slot, dtMs): void {
    tickReload(slot.state!, ship.stats.torpedo.maxAmmo, ship.stats.torpedo.reloadMs, dtMs);
  },
  activate(ctx, slot) {
    const { torp, denial } = launchTorpedo(ctx.ship, slot.state!, ctx.now, ctx.mkId);
    if (torp) ctx.spawnBallistic(torp);
    return denial === null ? { ok: true } : { ok: false, reason: denial };
  },
};
