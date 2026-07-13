// Torpedo fire control — the torpedoes WeaponSystem (WeaponId 1). Two bow tubes,
// each on an independent 12s reload; a launch consumes the SOONEST-ready tube
// (both ready => staggered by construction, since firing the min-cooldown tube
// leaves the other loaded). A torpedo is just a slow, long-legged, hard-hitting
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

/** Fresh per-tube cooldown state (all tubes loaded). */
export function freshTorpedoCooldowns(): number[] {
  return new Array<number>(CONFIG.torpedo.tubes).fill(0);
}

/** Soonest-ready tube cooldown (ms) — surfaced in OwnShip.cooldowns[1]. */
export function soonestTorpedoCooldown(cooldowns: number[]): number {
  return cooldowns.length === 0 ? 0 : Math.min(...cooldowns);
}

// Same muzzle-clear pattern as the guns: spawn the fish ahead of the bow so it
// starts outside the firer's own capsule (hull half-length + collision radius).
const TUBE_OFFSET = CONFIG.ship.length / 2 + CONFIG.gun.shellRadius;

function makeTorpedo(id: string, ship: ShipRecord, dir: number, now: number): ShellState {
  return {
    id,
    ownerId: ship.id,
    x: ship.state.x + Math.cos(dir) * TUBE_OFFSET,
    y: ship.state.y + Math.sin(dir) * TUBE_OFFSET,
    vx: Math.cos(dir) * CONFIG.torpedo.speed,
    vy: Math.sin(dir) * CONFIG.torpedo.speed,
    distLeft: CONFIG.torpedo.range,
    bornAt: now,
    kind: 'torp',
    damage: CONFIG.torpedo.damage,
    hitRadius: CONFIG.gun.shellRadius,
    graceMs: CONFIG.gun.selfHitGrace,
  };
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
 * Launch one torpedo from the soonest-ready bow tube this tick, or null if no
 * tube is ready or the aim is out of the bow arc. Resets the firing tube.
 * Exported for tests (tube stagger/reload, arc gating).
 */
export function fireTorpedo(ship: ShipRecord, now: number, mkId: () => string): ShellState | null {
  if (!ship.alive || !ship.input.fire || ship.input.weapon !== WEAPON.torpedo) return null;
  const tube = soonestTube(ship.torpedoCooldowns);
  if (ship.torpedoCooldowns[tube] > 0) return null; // no tube loaded
  const center = wrapAngle(ship.state.heading + CONFIG.torpedo.offset); // bow-centered
  if (!inArc(ship.input.aim, center, CONFIG.torpedo.halfArc)) return null;
  const dir = clampToArc(ship.input.aim, center, CONFIG.torpedo.halfArc);
  ship.torpedoCooldowns[tube] = CONFIG.torpedo.reload;
  return makeTorpedo(mkId(), ship, dir, now);
}

/** The torpedoes weapon system (WeaponId 1). */
export const torpedoSystem: WeaponSystem = {
  id: WEAPON.torpedo,
  tick(ship: ShipRecord, dtMs: number): void {
    for (let i = 0; i < ship.torpedoCooldowns.length; i++) {
      ship.torpedoCooldowns[i] = Math.max(0, ship.torpedoCooldowns[i] - dtMs);
    }
  },
  soonest(ship: ShipRecord): number {
    return soonestTorpedoCooldown(ship.torpedoCooldowns);
  },
  fire(ctx: FireContext): void {
    const torp = fireTorpedo(ctx.ship, ctx.now, ctx.mkId);
    if (torp) ctx.spawnBallistic(torp);
  },
};
