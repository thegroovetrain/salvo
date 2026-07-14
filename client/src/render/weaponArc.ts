// Pure firing-arc math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact
// same gate off shared `inArc`.

import { CONFIG, WEAPON, inArc, wrapAngle, type WeaponId } from '@salvo/shared';

const MOUNTS = CONFIG.gun.mounts;

/**
 * Does `aim` (world bearing) fall within the selected weapon's firing arc,
 * given the hull's `heading`? Mines drop astern regardless of aim, so
 * they're always "in arc".
 */
export function weaponArcHit(heading: number, aim: number, weapon: WeaponId): boolean {
  if (weapon === WEAPON.mine) return true;
  if (weapon === WEAPON.torpedo) {
    return inArc(aim, wrapAngle(heading + CONFIG.torpedo.offset), CONFIG.torpedo.halfArc);
  }
  return MOUNTS.some((m) => inArc(aim, wrapAngle(heading + m.offset), m.halfArc));
}

/**
 * Index of the gun mount (0 = port, 1 = starboard) whose arc bears on `aim`
 * given `heading`, or -1 if the aim is over the bow/stern where neither broadside
 * covers. Same per-mount arc test fireGuns uses server-side — the HUD reads it to
 * highlight the mount that would actually fire, and to pick the aim-relevant
 * cooldown for the denied-fire gate.
 */
export function bearingGunMount(heading: number, aim: number): number {
  return MOUNTS.findIndex((m) => inArc(aim, wrapAngle(heading + m.offset), m.halfArc));
}
