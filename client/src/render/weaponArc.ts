// Pure firing-arc + range math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact same
// gate off shared `inArc`.
//
// Keyed by the fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: the
// slot-index == equipment coupling died when the fit went per-hull (BB slot 1 is
// the cannon, TB slot 1 is the torpedo), so a slot-number branch would light the
// wrong marker. The gun FAMILY (gun / cannon / star shells) is 360° — always in
// arc, never denied for bearing, aimed to the clicked point. The torpedo fires in
// a bow arc. Instant ABILITIES (the TB's speedBoost, and — Story 1.8 — the Mine
// Layer's mine + decoyBuoy) never prime and never aim, so they classify as
// `none`. Callers derive the id from the own loadout (main.ts's slotIdsFor /
// shared loadoutFor).

import { CONFIG, inArc, wrapAngle, type EffectiveStats, type EquipmentId } from '@salvo/shared';

/**
 * The firing-arc behavior class of a fitted equipment id. Drives every id-keyed
 * branch in firing.ts's marker/reticle rendering and weaponArcHit below:
 * - `gunLike` — the gun, the cannon, and the star shells: 360°, aimed to the
 *   clicked point, range-clamped, no arc sector drawn.
 * - `torpedo` — a bow-arc skillshot (the one aim-gated marker).
 * - `none`    — an instant ability (speedBoost, and Story 1.8's mine +
 *   decoyBuoy) or the empty slot: not an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'torpedo' | 'none';

/** Pure: classify a fitted equipment id (or null empty slot) by firing-arc kind. */
export function fireArcKind(id: EquipmentId | null): FireArcKind {
  if (id === 'gun' || id === 'cannon' || id === 'starShells') return 'gunLike';
  if (id === 'torpedo') return 'torpedo';
  return 'none'; // speedBoost / mine / decoyBuoy (abilities) / empty slot 3
}

/**
 * Does `aim` (world bearing) fall within the fitted weapon `id`'s firing arc,
 * given the hull's `heading`? The gun family (360°) is always true; the torpedo
 * checks its bow arc. An instant ability (speedBoost / mine / decoyBuoy) or the
 * empty slot is NOT a firing weapon, so it is never "in arc" (false).
 *
 * ABILITY ids (Story 1.6's speedBoost; Story 1.8's mine + decoyBuoy) never reach
 * this function: keyboard.ts's ability path activates WITHOUT priming, and only
 * the primed slot flows into the arc/firing/prime-consumption code, so the `none`
 * result here only ever applies to the empty slot / a defensive null.
 */
export function weaponArcHit(heading: number, aim: number, id: EquipmentId | null): boolean {
  const kind = fireArcKind(id);
  if (kind === 'gunLike') return true; // 360° — never out of arc
  if (kind === 'torpedo') {
    return inArc(aim, wrapAngle(heading + CONFIG.torpedo.offset), CONFIG.torpedo.halfArc);
  }
  return false; // ability / empty slot: not a weapon, never in arc
}

/**
 * The effective range (u) at which a gun-family weapon's shell bursts / clamps —
 * each gun-like id reads its OWN stats block: the gun stacks gunRange upgrades,
 * while the cannon / star shells stay pinned at the radar-derived base (Story
 * 1.7 — no upgrade multiplies them).
 *
 * CONTRACT — MEANINGFUL FOR `gunLike` IDS ONLY. For a torpedo / mine / ability /
 * empty slot there is NO range ring, and this returns `stats.gun.rangeU` purely
 * as a non-crashing fallback — it is NOT that weapon's range (a torpedo runs to
 * the map edge; a mine has none). Do NOT consult this for a non-gun-like id; gate
 * on `fireArcKind(id) === 'gunLike'` first (firing.ts's range-clamp marker does).
 */
export function weaponRangeU(stats: EffectiveStats, id: EquipmentId | null): number {
  if (id === 'cannon') return stats.cannon.rangeU;
  if (id === 'starShells') return stats.starShells.rangeU;
  return stats.gun.rangeU; // gun (with its upgrade stacks) — and the default
}
