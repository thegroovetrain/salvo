// Torpedo fire control — the torpedoes WeaponSystem (WeaponId 1). A single bow
// tube on a 12s reload (owner play test 2026-07-13: two tubes fired both fish
// within ~2 ticks of one click, hiding the reload; one fish per click + a real
// reload is the intended commitment-spike feel). The code stays tube-count
// generic off CONFIG.torpedo.tubes — a launch consumes the soonest-ready tube —
// so restoring extra tubes is a one-line config change. A torpedo is just a
// slow, long-legged, hard-hitting ballistic: it reuses the shared stepShell
// machinery (islands block it, swept-capsule hull hits, owner self-hit grace)
// via ShellState's weapon-param fields. Bow arc heading±30°; aim clamped into
// the arc, else no launch.
//
// Torpedoes are NEVER radar-painted — structurally, because perception's paint
// loop iterates ships only. Their per-observer reveal rides the SAME first-sight
// ballistic machinery as shells (sight + LOS), so a torpedo materializes at your
// fog boundary, never at its launch point (see perception.ts / BallisticEvent).

import { CONFIG, WEAPON, inArc, wrapAngle, type ShellState } from '@salvo/shared';
import type { ShipRecord } from '../world.js';
import type { FireContext, WeaponSystem } from './index.js';
import { clampToArc } from './guns.js';
import { makeBallistic } from './ballistics.js';

/** Fresh per-tube cooldown state (all tubes loaded). */
export function freshTorpedoCooldowns(): number[] {
  return new Array<number>(CONFIG.torpedo.tubes).fill(0);
}

/** Index of the soonest-ready tube (the one a launch consumes). */
function soonestTube(cooldowns: number[]): number {
  let idx = 0;
  for (let i = 1; i < cooldowns.length; i++) {
    if (cooldowns[i] < cooldowns[idx]) idx = i;
  }
  return idx;
}

/**
 * Launch one torpedo from the soonest-ready bow tube (the World routes at most
 * one click here per fireSeq increment), or null if no tube is ready or the
 * aim is out of the bow arc. Resets the firing tube. Direction-only: a torpedo
 * runs until impact, so it deliberately never reads input.aimDist. The alive +
 * weapon guards are kept for direct test callers; the click gate itself lives
 * in World.fireControl. Exported for tests (tube stagger/reload, arc gating).
 */
export function fireTorpedo(ship: ShipRecord, now: number, mkId: () => string): ShellState | null {
  if (!ship.alive || ship.input.weapon !== WEAPON.torpedo) return null;
  const tube = soonestTube(ship.torpedoCooldowns);
  if (ship.torpedoCooldowns[tube] > 0) return null; // no tube loaded
  const center = wrapAngle(ship.state.heading + CONFIG.torpedo.offset); // bow-centered
  if (!inArc(ship.input.aim, center, CONFIG.torpedo.halfArc)) return null;
  const dir = clampToArc(ship.input.aim, center, CONFIG.torpedo.halfArc);
  ship.torpedoCooldowns[tube] = CONFIG.torpedo.reload;
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
  tick(ship: ShipRecord, dtMs: number): void {
    for (let i = 0; i < ship.torpedoCooldowns.length; i++) {
      ship.torpedoCooldowns[i] = Math.max(0, ship.torpedoCooldowns[i] - dtMs);
    }
  },
  mountCooldowns(ship: ShipRecord): number[] {
    return [...ship.torpedoCooldowns];
  },
  fire(ctx: FireContext): void {
    const torp = fireTorpedo(ctx.ship, ctx.now, ctx.mkId);
    if (torp) ctx.spawnBallistic(torp);
  },
};
