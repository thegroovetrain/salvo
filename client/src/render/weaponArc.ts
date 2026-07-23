// Pure firing-arc + range math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact same
// gate off shared `inArc`.
//
// Keyed by the fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: the
// slot-index == equipment coupling died when the fit went per-hull (BB slot 1 is
// the cannon, TB slot 1 is the torpedo), so a slot-number branch would light the
// wrong marker. As of Story 1.10 the classification DERIVES from the shared
// arcFor descriptor (sim/arcs.ts — the single arc-shape source both sides
// consume), so the rendered arc and the server's enforced arc can never
// diverge: the gun FAMILY (gun / cannon / star shells) declares `full` (360° —
// always in arc, never denied for bearing, aimed to the clicked point); the
// torpedo declares its bow `sector`; the stern drops (mine / decoyBuoy) and the
// speedBoost aim nothing (`stern-drop`/`none` → not an aimed weapon). Callers
// derive the id from the own loadout (main.ts's slotIdsFor / shared loadoutFor).

import { arcFor, inArc, wrapAngle, type EffectiveStats, type EquipmentId } from '@salvo/shared';

/**
 * The firing-arc behavior class of a fitted equipment id. Drives every id-keyed
 * branch in firing.ts's marker/reticle rendering and weaponArcHit below:
 * - `gunLike` — a `full` (360°) descriptor: aimed to the clicked point,
 *   range-clamped, no arc sector drawn.
 * - `torpedo` — a `sector` descriptor: the bow-arc skillshot (the one
 *   aim-gated marker).
 * - `none`    — `stern-drop`/`none` descriptors (abilities) or the empty
 *   slot: not an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'torpedo' | 'none';

/** Pure: classify a fitted equipment id (or null empty slot) by firing-arc
 *  kind — a straight projection of the shared arcFor descriptor. */
export function fireArcKind(id: EquipmentId | null): FireArcKind {
  if (id === null) return 'none'; // empty slot 3 / defensive null
  const arc = arcFor(id);
  if (arc.kind === 'full') return 'gunLike'; // gun / cannon / starShells
  if (arc.kind === 'sector') return 'torpedo';
  return 'none'; // stern-drop (mine / decoyBuoy) + none (speedBoost)
}

/**
 * Does `aim` (world bearing) fall within the fitted weapon `id`'s firing arc,
 * given the hull's `heading`? Driven by the shared arcFor descriptor: a `full`
 * arc is always true; a `sector` checks heading + offset ± halfArc via shared
 * `inArc` (the exact server gate). An instant ability (stern-drop / none) or
 * the empty slot is NOT a firing weapon, so it is never "in arc" (false).
 *
 * ABILITY ids (Story 1.6's speedBoost; Story 1.8's mine + decoyBuoy) never reach
 * this function: keyboard.ts's ability path activates WITHOUT priming, and only
 * the primed slot flows into the arc/firing/prime-consumption code, so the false
 * result here only ever applies to the empty slot / a defensive null.
 */
export function weaponArcHit(heading: number, aim: number, id: EquipmentId | null): boolean {
  if (id === null) return false;
  const arc = arcFor(id);
  if (arc.kind === 'full') return true; // 360° — never out of arc
  if (arc.kind === 'sector') {
    return inArc(aim, wrapAngle(heading + arc.offset), arc.halfArc);
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
