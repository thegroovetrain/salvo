// Pure firing-arc math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact
// same gate off shared `inArc`.
//
// Keyed by loadout SLOT (Eric ruling 2026-07-21): the gun (slot 0) is 360° —
// ALWAYS in arc, never denied for bearing. Torpedoes (slot 1) fire in a bow
// arc; mines (slot 2) drop astern regardless of aim (always "in arc"). The
// slot-index == interregnum-equipment coupling (dies in Epic 2) mirrors
// input/keyboard.ts's PRIME_KEYS.

import { CONFIG, SLOT_GUN, inArc, wrapAngle } from '@salvo/shared';

/** Interregnum slot index of the bow-tube torpedo (Epic 2 rebuilds the loadout). */
export const SLOT_TORPEDO = 1;
/** Interregnum slot index of the astern mine layer. */
export const SLOT_MINE = 2;

/**
 * Does `aim` (world bearing) fall within the primed slot's firing arc, given
 * the hull's `heading`? Explicit per-slot mapping: the gun (0) is 360° (always
 * true); the torpedo (1) checks its bow arc; mines (2) drop astern regardless
 * (always true). ANY OTHER slot — the empty slot 3, or an out-of-range index —
 * is NOT a firing weapon, so it is never "in arc" (false): nothing to fire.
 */
export function weaponArcHit(heading: number, aim: number, slot: number): boolean {
  if (slot === SLOT_GUN) return true; // 360° — never out of arc
  if (slot === SLOT_TORPEDO) {
    return inArc(aim, wrapAngle(heading + CONFIG.torpedo.offset), CONFIG.torpedo.halfArc);
  }
  if (slot === SLOT_MINE) return true; // astern drop, no aim gate
  return false; // empty slot 3 / out-of-range: not a weapon, never in arc
}
