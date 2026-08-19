// Pure firing-arc + range math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact same
// gate off shared `inArc`.
//
// Keyed by the fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: the
// slot-index == equipment coupling died when the fit went per-hull (BB slot 1 is
// the broadside, TB slot 1 is the torpedo), so a slot-number branch would light the
// wrong marker. As of Story 1.10 the classification DERIVES from the shared
// arcFor descriptor (sim/arcs.ts — the single arc-shape source both sides
// consume), so the rendered arc and the server's enforced arc can never
// diverge: the gun FAMILY (gun / star shells) declares `full` (360° — always in
// arc, never denied for bearing, aimed to the clicked point); the torpedo
// declares its bow `sector` and — as of Story 2.8 (amendment 45) — the MINE and
// (Story 7-5 wave 2) the RADAR BUOY declare their rear placement `sector`; the
// BROADSIDE BARRAGE declares `twin-sector`, two mirrored beam sectors at
// `heading ± 90°` each 60° wide; the speedBoost aims nothing (`none`). Callers
// derive the id from the own loadout (main.ts's slotIdsFor / shared loadoutFor).
//
// STORY 7-5 WAVE 2 RETIRED the `stern-drop` branch: the decoy buoy was that
// shape's only user, and the radar buoy replacing it is click-placed in the
// mine's rear SECTOR. Nothing here may re-add a branch for it.

import {
  CONFIG,
  arcFor,
  burstPointAlong,
  inArc,
  pointInCircle,
  wrapAngle,
  type EffectiveStats,
  type EquipmentId,
  type Vec2,
} from '@salvo/shared';

/**
 * The firing-arc behavior class of a fitted equipment id. Drives every id-keyed
 * branch in firing.ts's marker/reticle rendering and weaponArcHit below:
 * - `gunLike` — a `full` (360°) descriptor: aimed to the clicked point,
 *   range-clamped, no arc sector drawn.
 * - `sector`  — a `sector` descriptor: an AIM-GATED weapon that draws its wedge
 *   (the torpedo's bow arc; the mine's and radar buoy's rear placement arc as of
 *   Story 2.8 — PIN FLIPPED from 'none' knowingly, amendment 45).
 * - `twin`    — a `twin-sector` descriptor (the BROADSIDE BARRAGE, R2.1): TWO
 *   mirrored aim-gated wedges at `heading ± offset`. A click inside EITHER is
 *   legal and fires THAT side (R2.2); a click in neither — the bow and stern
 *   dead zones — is denied exactly like a `sector` miss.
 * - `none`    — the `none` descriptor (the speed boost) or the empty slot: not
 *   an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'sector' | 'twin' | 'none';

/** Pure: classify a fitted equipment id (or null empty slot) by firing-arc
 *  kind — a straight projection of the shared arcFor descriptor. */
export function fireArcKind(id: EquipmentId | null): FireArcKind {
  if (id === null) return 'none'; // empty slot 3 / defensive null
  const arc = arcFor(id);
  if (arc.kind === 'full') return 'gunLike'; // gun / starShells
  if (arc.kind === 'sector') return 'sector'; // torpedo bow arc / mine + buoy rear arc
  if (arc.kind === 'twin-sector') return 'twin'; // broadside beams
  return 'none'; // none (speedBoost)
}

/**
 * Does `aim` (world bearing) fall within the fitted weapon `id`'s firing arc,
 * given the hull's `heading`? Driven by the shared arcFor descriptor: a `full`
 * arc is always true; a `sector` checks heading + offset ± halfArc via shared
 * `inArc` (the exact server gate — the torpedo's bow sector, and the mine's and
 * radar buoy's rear placement sector); a `twin-sector` is in arc when EITHER
 * mirrored beam contains the aim (the broadside, R2.1/R2.2). An instant ability
 * (`none`) or the empty slot is NOT a firing weapon, so it is never "in arc".
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
  if (arc.kind === 'twin-sector') return twinSectorSide(heading, aim, arc) !== null;
  return false; // ability / empty slot: not a weapon, never in arc
}

/**
 * Pure: WHICH beam of a `twin-sector` descriptor contains `aim` — `+1` for the
 * `heading + offset` sector, `-1` for the mirrored `heading - offset` one, and
 * `null` when the aim falls in neither (the bow/stern dead zones, which are
 * DENIED — R2.1).
 *
 * This is the client's reading of R2.2 ("the side whose sector contains the
 * click is the side that fires"), used by the firing UX to light exactly one
 * wedge. The two sectors cannot overlap at the ratified 90°/60° geometry, and
 * the `+` side is tested first so a hypothetical retune that made them overlap
 * would still resolve to ONE side rather than an ambiguous both.
 */
export function twinSectorSide(
  heading: number,
  aim: number,
  arc: { offset: number; halfArc: number },
): 1 | -1 | null {
  if (inArc(aim, wrapAngle(heading + arc.offset), arc.halfArc)) return 1;
  if (inArc(aim, wrapAngle(heading - arc.offset), arc.halfArc)) return -1;
  return null;
}

/**
 * The effective range (u) at which an AIMED weapon's shot lands / clamps. The
 * gun family reads its OWN stats block — and as of Story 2.8 all of them ride
 * the folded radarRange (Intel is a stealth offense category), so an intelRange
 * stack grows every one together. The BROADSIDE reads `stats.broadside.rangeU`,
 * THE 5/8 RUNG (R2.4) — the one weapon that does not reach the radar horizon,
 * so the shared gun-range fallback would over-promise it by 247.5u. The MINE
 * reads the ratified
 * CONFIG.mine.placeRange: its placement reach is a fixed short leash, NOT radar
 * range, and no boon moves it.
 *
 * CONTRACT — MEANINGFUL FOR `gunLike` IDS, THE BROADSIDE AND THE MINE ONLY.
 * For a torpedo / ability / empty slot there is NO range ring, and this returns
 * `stats.gun.rangeU` purely as a non-crashing fallback — it is NOT that
 * weapon's range (a torpedo runs to the map edge). Do NOT consult this for
 * those ids; gate on the id first, as firing.ts's markers do.
 */
export function weaponRangeU(stats: EffectiveStats, id: EquipmentId | null): number {
  if (id === 'broadside') return stats.broadside.rangeU;
  if (id === 'starShells') return stats.starShells.rangeU;
  if (id === 'mine') return CONFIG.mine.placeRange;
  return stats.gun.rangeU; // gun (radar-derived) — and the default
}

/**
 * A LIVE lit zone the local player OWNS, as the star-shell reach gate reads it:
 * centre + lit radius. Built by render/litZones.ts `ownActiveZones`, which is
 * where both halves of "live" and "owned" are enforced (`by === ownId` and
 * `until > serverNow`) — an ENEMY's flare never reaches this list, so no test
 * here can accidentally lend you their light.
 */
export interface LitCircle {
  x: number;
  y: number;
  r: number;
}

/**
 * Pure: does a clicked point lie inside ANY of the player's own live lit zones?
 *
 * Uses the shared `pointInCircle` primitive rather than a hand-rolled distance
 * test, and INCLUSIVELY (`d² ≤ r²`), because this is one half of a
 * server-authoritative legality gate: the server refuses or accepts the click,
 * and if the two sides disagree on the boundary case the preview lies about a
 * shot the player is about to take.
 */
export function pointInLitZone(p: Vec2, zones: readonly LitCircle[]): boolean {
  for (const z of zones) {
    if (pointInCircle(p, z, z.r)) return true;
  }
  return false;
}

/**
 * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15): the reach the primed
 * system actually has FOR THIS AIM, which is `weaponRangeU` except where the
 * flare extension applies.
 *
 * A GUN click whose target point lies inside a LIVE lit zone the clicking
 * player OWNS is legal beyond `stats.gun.rangeU` — you can shell what your own
 * flare is lighting. Everything else is unchanged, and deliberately so:
 *
 *  - GUN ONLY. Never the broadside (its 5/8 rung is a weapon identity, not a
 *    horizon), never the star shell itself, never the torpedo, never the mine.
 *    The id gate lives HERE rather than at the call sites so nothing can forget
 *    it and quietly widen a second weapon.
 *  - OWN FLARES ONLY. The gate never sees an enemy zone (see LitCircle).
 *  - The clamp only ever LIFTS to the click's own distance, never past it, so a
 *    click 40u inside your flare does not silently become a map-edge shot.
 *
 * This is the number BOTH the range-clamp marker (render/firing.ts) and the aim
 * preview's burst point (render/aimPreview.ts) are driven from — ONE evaluation
 * in main.ts feeding both — because the project's guarantee is that the
 * previewed circle IS where the shell bursts. A marker that says "clamped here"
 * beside a preview that bursts somewhere else is the same defect as a preview
 * that disagrees with the server.
 *
 * SERVER PARITY: the server owns the legality gate; this is the client's mirror
 * of it. The predicate is deliberately trivial (own + live + `d² ≤ r²` + gun)
 * so the two implementations cannot drift on anything but the zone list, which
 * the server itself supplies. It belongs in `shared/` the moment that workspace
 * unfreezes — see the report — exactly as `blockedWater` was promoted.
 */
export function weaponReachU(
  stats: EffectiveStats,
  id: EquipmentId | null,
  ship: Vec2,
  aim: number,
  aimDist: number,
  mapRadius: number,
  ownLitZones: readonly LitCircle[],
): number {
  const base = weaponRangeU(stats, id);
  // `!(aimDist > base)` rather than `aimDist <= base`, matching the server
  // literally: a NaN-ish aimDist takes the unchanged-range branch on both sides.
  if (id !== 'gun' || !(aimDist > base)) return base;
  // The point tested is the MAP-CLAMPED one, not the raw cursor — the server
  // tests `burstPointAlong(ship, mapRadius, want, aim)`, and at the rim a click
  // out over the edge and its clamped burst point are different water. Testing
  // the cursor instead would license a shot the server refuses on exactly the
  // clicks a player makes when they are pinned against the boundary.
  const far = burstPointAlong(ship, aimDist, mapRadius, aimDist, aim);
  return pointInLitZone(far, ownLitZones) ? aimDist : base;
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

/** A sector wedge's BOUNDARY, in the arc graphic's local (hull-relative) frame:
 *  the two side rays out of the apex, plus the range arc that closes them. */
export interface SectorOutline {
  /** The far endpoint of each side ray (the apex is the local origin), in
   *  drawing order: the `offset - halfArc` edge first. */
  rays: [{ x: number; y: number }, { x: number; y: number }];
  /** The closing range arc: sweep bearings and the radius they run at. */
  arc: { from: number; to: number; r: number };
}

/**
 * Pure: the boundary geometry of the sector `offset ± halfArc` at `radius`.
 *
 * The mine's rear placement wedge is the one sector whose radius is REAL — it
 * is the reachable water, not an indicator (render/firing.ts) — so its edge is
 * information: a filled gradient-ish wash tells you roughly where the rack can
 * reach, a stroked boundary tells you exactly. Factored out here, beside the
 * arc predicates it belongs with, so the drawn boundary is unit-testable and
 * firing.ts stays a thin Pixi adapter.
 */
export function sectorOutline(offset: number, halfArc: number, radius: number): SectorOutline {
  const from = offset - halfArc;
  const to = offset + halfArc;
  return {
    rays: [
      { x: Math.cos(from) * radius, y: Math.sin(from) * radius },
      { x: Math.cos(to) * radius, y: Math.sin(to) * radius },
    ],
    arc: { from, to, r: radius },
  };
}
