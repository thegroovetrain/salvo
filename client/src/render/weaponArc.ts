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
// torpedo declares its bow `sector` and — as of Story 2.8 (amendment 45) — the
// MINE declares its rear placement `sector`; the decoy's stern drop and the
// speedBoost aim nothing (`stern-drop`/`none` → not an aimed weapon). Callers
// derive the id from the own loadout (main.ts's slotIdsFor / shared loadoutFor).

import { CONFIG, arcFor, inArc, wrapAngle, type EffectiveStats, type EquipmentId } from '@salvo/shared';

/**
 * The firing-arc behavior class of a fitted equipment id. Drives every id-keyed
 * branch in firing.ts's marker/reticle rendering and weaponArcHit below:
 * - `gunLike` — a `full` (360°) descriptor: aimed to the clicked point,
 *   range-clamped, no arc sector drawn.
 * - `sector`  — a `sector` descriptor: an AIM-GATED weapon that draws its wedge
 *   (the torpedo's bow arc; the mine's rear placement arc as of Story 2.8 —
 *   PIN FLIPPED from 'none' knowingly, amendment 45).
 * - `none`    — `stern-drop`/`none` descriptors (the decoy rack, the speed
 *   boost) or the empty slot: not an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'sector' | 'none';

/** Pure: classify a fitted equipment id (or null empty slot) by firing-arc
 *  kind — a straight projection of the shared arcFor descriptor. */
export function fireArcKind(id: EquipmentId | null): FireArcKind {
  if (id === null) return 'none'; // empty slot 3 / defensive null
  const arc = arcFor(id);
  if (arc.kind === 'full') return 'gunLike'; // gun / cannon / starShells
  if (arc.kind === 'sector') return 'sector'; // torpedo bow arc / mine rear arc
  return 'none'; // stern-drop (decoyBuoy) + none (speedBoost)
}

/**
 * Does `aim` (world bearing) fall within the fitted weapon `id`'s firing arc,
 * given the hull's `heading`? Driven by the shared arcFor descriptor: a `full`
 * arc is always true; a `sector` checks heading + offset ± halfArc via shared
 * `inArc` (the exact server gate — the torpedo's bow sector, and the mine's
 * rear placement sector as of Story 2.8). An instant ability (stern-drop /
 * none) or the empty slot is NOT a firing weapon, so it is never "in arc".
 *
 * NOTE: this is the BEARING gate only. The mine additionally requires the
 * clicked point to lie within CONFIG.mine.placeRange — an out-of-range click
 * is denied by the server exactly like an out-of-arc one (see weaponRangeU,
 * which supplies that ring to the firing UX).
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
 * The effective range (u) at which an AIMED weapon's shot lands / clamps. The
 * gun family reads its OWN stats block — and as of Story 2.8 all three ride the
 * folded radarRange (Intel is a stealth offense category), so an intelRadar
 * stack grows every one of them together. The MINE reads the ratified
 * CONFIG.mine.placeRange: its placement reach is a fixed short leash, NOT radar
 * range, and no boon moves it.
 *
 * CONTRACT — MEANINGFUL FOR `gunLike` IDS AND THE MINE ONLY. For a torpedo /
 * ability / empty slot there is NO range ring, and this returns
 * `stats.gun.rangeU` purely as a non-crashing fallback — it is NOT that
 * weapon's range (a torpedo runs to the map edge). Do NOT consult this for
 * those ids; gate on the id first, as firing.ts's markers do.
 */
export function weaponRangeU(stats: EffectiveStats, id: EquipmentId | null): number {
  if (id === 'cannon') return stats.cannon.rangeU;
  if (id === 'starShells') return stats.starShells.rangeU;
  if (id === 'mine') return CONFIG.mine.placeRange;
  return stats.gun.rangeU; // gun (radar-derived) — and the default
}

/**
 * Pure: is the CLICKED POINT within a hard range DENIAL gate? Only the mine has
 * one (Story 2.8, amendment 45): a click past CONFIG.mine.placeRange is refused
 * outright, exactly like a click outside its rear arc — nothing is consumed and
 * the denial register fires. Every other id answers true, because none of them
 * denies on distance: the gun family CLAMPS the aim point to rangeU and fires
 * anyway (the range-clamp marker is that clamp made visible), and a torpedo
 * runs until it hits something or leaves the map.
 *
 * Paired with weaponArcHit at every predicted-fire gate so the client's verdict
 * matches the server's on BOTH halves of the mine's placement rule — otherwise
 * an out-of-range click would silently consume the prime (reverting to the gun)
 * for a placement the server refused.
 */
export function weaponRangeHit(aimDist: number, id: EquipmentId | null): boolean {
  return id !== 'mine' || aimDist <= CONFIG.mine.placeRange;
}
