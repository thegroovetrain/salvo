// Torpedo fire control — the torpedoes WeaponSystem (WeaponId 1). A single bow
// tube on a 12s reload (owner play test 2026-07-13: two tubes fired both fish
// within ~2 ticks of one click, hiding the reload; one fish per click + a real
// reload is the intended commitment-spike feel). The bow tube is now just the
// one-deep ammo pool (weapons/ammo.ts) — a launch consumes the round + starts
// the reload if idle. A torpedo is just a slow, long-legged, hard-hitting
// ballistic: it reuses the shared stepShell machinery (islands block it,
// swept-capsule hull hits, owner self-hit grace) via ShellState's weapon-param
// fields. Bow arc heading±30°; aim clamped into the arc, else no launch.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import { CONFIG, WEAPON, inArc, wrapAngle, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { FireContext, WeaponSystem } from './index.js';
import { clampToArc } from './guns.js';
import { consume, tickReload } from './ammo.js';
import { makeBallistic } from './ballistics.js';

/**
 * Launch one torpedo from the bow tube (the World routes at most one click here
 * per fireSeq increment), or null if the pool is empty or the aim is out of the
 * bow arc. Consumes one round (arc-miss does NOT spend a round). Direction-only:
 * a torpedo runs until impact, so it deliberately never reads input.aimDist. The
 * alive + weapon guards are kept for direct test callers; the click gate itself
 * lives in World.fireControl. Exported for tests (pool reload, arc gating).
 */
export function fireTorpedo(ship: ShipRecord, now: number, mkId: () => string): ShellState | null {
  if (!ship.alive || ship.input.weapon !== WEAPON.torpedo) return null;
  const center = wrapAngle(ship.state.heading + CONFIG.torpedo.offset); // bow-centered
  if (!inArc(ship.input.aim, center, CONFIG.torpedo.halfArc)) return null;
  if (!consume(ship.ammo[WEAPON.torpedo], CONFIG.torpedo.reloadMs)) return null; // pool empty
  const dir = clampToArc(ship.input.aim, center, CONFIG.torpedo.halfArc);
  return makeBallistic(mkId(), ship, dir, now, {
    speed: CONFIG.torpedo.speed,
    range: Number.POSITIVE_INFINITY, // A3: run until impact / map edge
    damage: CONFIG.torpedo.damage,
    hitRadius: CONFIG.torpedo.hitRadius, // A4: own value, no longer gun.shellRadius
    graceMs: CONFIG.torpedo.selfHitGrace, // A4: own value
    kind: 'torp',
  });
}

/** The torpedoes weapon system (WeaponId 1). */
export const torpedoSystem: WeaponSystem = {
  id: WEAPON.torpedo,
  maxAmmo: CONFIG.torpedo.maxAmmo,
  reloadMs: CONFIG.torpedo.reloadMs,
  tick(ship: ShipRecord, dtMs: number): void {
    tickReload(ship.ammo[WEAPON.torpedo], CONFIG.torpedo.maxAmmo, CONFIG.torpedo.reloadMs, dtMs);
  },
  fire(ctx: FireContext): void {
    const torp = fireTorpedo(ctx.ship, ctx.now, ctx.mkId);
    if (torp) ctx.spawnBallistic(torp);
  },
};
