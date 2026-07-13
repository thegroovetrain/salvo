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
