// Pure firing-arc + range math (no Pixi import — unit tested), shared by
// render/firing.ts (arc sector rendering + reticle tint) and
// render/deniedFire.ts's predicate (via main.ts), so both read the exact same
// gate off shared `inArc`.
//
// Keyed by the fitted EQUIPMENT ID (Story 1.7), NOT the loadout slot index: the
// slot-index == equipment coupling died when the fit went per-hull, and Story
// 8.5 buried it for good — the three weapon slots are GENERIC, so whatever a
// captain drew sits in whichever of Q/E/R was empty first, and a slot-number branch would light the
// wrong marker. As of Story 1.10 the classification DERIVES from the shared
// arcFor descriptor (sim/arcs.ts — the single arc-shape source both sides
// consume), so the rendered arc and the server's enforced arc can never
// diverge: the gun FAMILY (gun / star shells) declares `full` (360° — always in
// arc, never denied for bearing, aimed to the clicked point); the torpedo
// declares its bow `sector` and — as of Story 2.8 (amendment 45) — the MINE and
// (Story 7-5 wave 2) the RADAR BUOY declare their rear placement `sector`; the
// BROADSIDE BARRAGE declares `twin-sector`, two mirrored beam sectors at
// `heading ± 90°` each 60° wide; the boost aims nothing (`none`). Callers
// derive the id from the own loadout (main.ts's slotIdsFor / shared loadoutFor).
//
// STORY 7-5 WAVE 2 RETIRED the `stern-drop` branch: the decoy buoy was that
// shape's only user, and the radar buoy replacing it is click-placed in the
// mine's rear SECTOR. Nothing here may re-add a branch for it.
//
// STORY 8.13 TOOK THE ID EQUALITIES OUT. Three mine LINES now share the rear
// placement grammar (naval/captive/fouling), the LIGHT TORPEDO declares a
// TWIN sector on both beams, and the SUPERCAV TORPEDO — a belt CONSUMABLE —
// declares the bow ±15° sector, so every predicate below is keyed on the
// shared `arcFor` descriptor or on an explicit, pinned id SET, never on
// `id === 'navalMines'` / `id === 'heavyTorpedo'`. The signatures widened from
// `EquipmentId` to `SlotItemId` for the same reason `arcFor` did.

import {
  CONFIG,
  arcFor,
  gunReachU,
  inArc,
  isConsumableId,
  isWeaponItem,
  pointInLitZone,
  twinSectorSide,
  wrapAngle,
  type EffectiveStats,
  type EquipmentId,
  type LitCircle,
  type MineKind,
  type SlotItemId,
  type Vec2,
} from '@salvo/shared';

/**
 * THE THREE MINE LINES (Story 8.13). One hull may now fit naval, captive and
 * fouling mines at once, and every id-keyed branch that used to read
 * `'navalMines'` has to ask "is this A mine?" instead — the placement leash,
 * the rear wedge's placement grammar, the own rings and the drop preview.
 *
 * IT IS A CLIENT-LOCAL RESTATEMENT of a shared fact, and deliberately a
 * CHECKED one: `sim/arcs.ts` keeps its own `isMineChassis` (the three ids plus
 * the legacy radar buoy) PRIVATE, so there is nothing to import. The pin in
 * __tests__/weaponArc.test.ts closes the loop from the other end — every id
 * here must declare the mine's rear placement sector, and every EquipmentId
 * that declares that sector must be here or be the buoy — so a fourth mine
 * kind cannot ship without joining this list.
 */
export const MINE_EQUIPMENT_IDS = ['navalMines', 'captiveMines', 'foulingMines'] as const satisfies
  readonly EquipmentId[];

/** One of the three mine LINES (never the radar buoy, which shares their arc
 *  and their leash but lays nothing). */
export type MineEquipmentId = (typeof MINE_EQUIPMENT_IDS)[number];

/** Pure: is this slot content one of the three MINE lines? */
export function isMineEquipment(id: SlotItemId | null): id is MineEquipmentId {
  return id !== null && (MINE_EQUIPMENT_IDS as readonly string[]).includes(id);
}

/** Pure: does this id share the mine's REAR PLACEMENT grammar — the three mine
 *  lines plus the legacy click-placed radar buoy (R2.7)? The one predicate the
 *  placement leash, the true-radius wedge and the amber placement tint read. */
export function isPlacedItem(id: SlotItemId | null): boolean {
  return isMineEquipment(id) || id === 'radarBuoy';
}

/** The MINE LINE ↔ the `MineKind` that rides an own mine's wire view
 *  (`MineView.c`, epic-8 amendment 76). Two tiny total maps rather than a
 *  string prefix trick, so a new kind fails to compile on both sides. */
const MINE_KIND_OF: Readonly<Record<MineEquipmentId, MineKind>> = {
  navalMines: 'naval',
  captiveMines: 'captive',
  foulingMines: 'fouling',
};

const MINE_ID_OF: Readonly<Record<MineKind, MineEquipmentId>> = {
  naval: 'navalMines',
  captive: 'captiveMines',
  fouling: 'foulingMines',
};

/** Pure: the wire kind an own mine laid from this line carries. */
export function mineKindOf(id: MineEquipmentId): MineKind {
  return MINE_KIND_OF[id];
}

/** Pure: the equipment row a mine of this kind reads its rings and its damage
 *  off — the OWNER's own stats row for that line, never `navalMines` standing
 *  in for all three (epic-8 amendment 76). */
export function mineEquipmentFor(kind: MineKind): MineEquipmentId {
  return MINE_ID_OF[kind];
}

/**
 * THE TORPEDO FAMILY — the two equipment LINES plus the belt's SUPERCAV
 * TORPEDO (a click-aimed consumable since epic-8 amendment 74). Every fish
 * shares the family's identity on screen: the cool-green arc, reticle and
 * preview tint, and the torpedo glyph.
 */
export const TORPEDO_ITEM_IDS = ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const satisfies
  readonly SlotItemId[];

/** One of the three torpedo ids (two lines + the belt consumable). */
export type TorpedoItemId = (typeof TORPEDO_ITEM_IDS)[number];

/** Pure: is this slot content a TORPEDO of any line? */
export function isTorpedoItem(id: SlotItemId | null): id is TorpedoItemId {
  return id !== null && (TORPEDO_ITEM_IDS as readonly string[]).includes(id);
}

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
 * - `none`    — the `none` descriptor (the speed boost) or an empty slot: not
 *   an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'sector' | 'twin' | 'none';

/** Pure: classify a fitted slot's content (or null empty slot) by firing-arc
 *  kind — a straight projection of the shared arcFor descriptor.
 *
 *  IT TAKES A `SlotItemId` SINCE STORY 8.13, because `arcFor` does: the
 *  SUPERCAV TORPEDO is a click-aimed BELT consumable (epic-8 amendment 74) and
 *  declares the bow ±15° sector, so it must classify as a `sector` weapon and
 *  draw its wedge like any other aimed launch. Every consumable that aims
 *  nothing still answers `none`, exactly as before. */
export function fireArcKind(id: SlotItemId | null): FireArcKind {
  if (id === null) return 'none'; // an unfitted weapon slot / defensive null
  const arc = arcFor(id);
  if (arc.kind === 'full') return 'gunLike'; // gun / starShells
  if (arc.kind === 'sector') return 'sector'; // torpedo bow arc / mine + buoy rear arc
  if (arc.kind === 'twin-sector') return 'twin'; // broadside beams
  return 'none'; // none (boost)
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
export function weaponArcHit(heading: number, aim: number, id: SlotItemId | null): boolean {
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
 * R2.2's "the side whose sector contains the click is the side that fires",
 * RE-EXPORTED from `shared/` (sim/arcs.ts) rather than implemented here.
 *
 * It lived in this file until Eric's 2026-08-19 turret correction, which gave
 * the side a GEOMETRIC consequence — the broadside's muzzle points sit on the
 * firing beam — so the server now needs the same answer to place them. Two
 * copies of one rule is the desync class `shared/` exists to prevent, so the
 * implementation moved and this export stays for the client callers (firing.ts's
 * wedge lighting, the aim preview) that already read it by this name.
 */
export { twinSectorSide };

/**
 * The effective range (u) at which an AIMED weapon's shot lands / clamps. The
 * gun family reads its OWN stats block — and as of Story 2.8 all of them ride
 * the folded radarRange, so they move together with it (no boon writes
 * `radarRange` today, but the derivation seam is what keeps them one number).
 * The BROADSIDE reads `stats.equipment.broadside.rangeU`,
 * THE 5/8 RUNG (R2.4) — the one weapon that does not reach the radar horizon,
 * so the shared gun-range fallback would over-promise it by 247.5u. The MINE and
 * — since Story 7-5 wave 2 — the RADAR BUOY read the ratified
 * CONFIG.mine.placeRange: their placement reach is a fixed short leash, NOT radar
 * range, and no boon moves it. (The buoy's OWN 330u radar set is a different
 * number entirely and never belongs here: that is the circle it watches once
 * dropped, not how far you can throw it.)
 *
 * CONTRACT — MEANINGFUL FOR `gunLike` IDS, THE BROADSIDE AND THE PLACED IDS ONLY.
 * For a torpedo / ability / empty slot there is NO range ring, and this returns
 * `stats.equipment.gun.rangeU` purely as a non-crashing fallback — it is NOT that
 * weapon's range (a torpedo runs to the map edge). Do NOT consult this for
 * those ids; gate on the id first, as firing.ts's markers do.
 */
export function weaponRangeU(stats: EffectiveStats, id: SlotItemId | null): number {
  if (id === 'broadside') return stats.equipment.broadside.rangeU;
  if (id === 'starShells') return stats.equipment.starShells.rangeU;
  // ALL THREE MINE LINES share the ONE leash (Story 8.13) — the naval chassis
  // is shared, not duplicated (`CONFIG.captiveMines`/`CONFIG.foulingMines` restate
  // no placement field), so an id-equality test on `navalMines` would have given
  // a captive or fouling drop the gun's radar-derived range.
  if (isPlacedItem(id)) return CONFIG.mine.placeRange;
  return stats.equipment.gun.rangeU; // gun (radar-derived) — and the default
}

/**
 * A LIVE lit zone the local player OWNS, as the star-shell reach gate reads it:
 * centre + lit radius. RE-EXPORTED FROM `shared/` — the type and the containment
 * predicate below both belong to the promoted `gunReachU` (sim/aim.ts) now, and
 * this file keeps no copy of either. Built by render/litZones.ts
 * `ownActiveZones`, which is where both halves of "live" and "owned" are
 * enforced (`by === ownId` and `until > serverNow`) — an ENEMY's flare never
 * reaches this list, so no test here can accidentally lend you their light.
 */
export type { LitCircle };

/**
 * Pure: does a clicked point lie inside ANY of the player's own live lit zones?
 * The SHARED predicate, re-exported so existing callers/tests keep one import
 * site — there is exactly one implementation, in `shared/src/sim/aim.ts`.
 */
export { pointInLitZone };

/**
 * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15): the reach the primed
 * system actually has FOR THIS AIM, which is `weaponRangeU` except where the
 * flare extension applies.
 *
 * A GUN click whose target point lies inside a LIVE lit zone the clicking
 * player OWNS is legal beyond `stats.equipment.gun.rangeU` — you can shell what your own
 * flare is lighting.
 *
 * THE RULE ITSELF IS NOT WRITTEN HERE ANY MORE. It used to be, mirrored line
 * for line off the server's legality gate; both sides now CALL the promoted
 * shared `gunReachU` (sim/aim.ts), the same promotion `blockedWater` and
 * `burstPointAlong` already made. All that survives on this side is the part
 * that is genuinely the client's:
 *
 *  - THE ID GATE. Gun ONLY — never the broadside (its 5/8 rung is a weapon
 *    identity, not a horizon), never the star shell itself, never the torpedo,
 *    never the mine. It lives HERE rather than at the call sites so nothing can
 *    forget it and quietly widen a second weapon; on the server the same clause
 *    is structural (only the gun row calls the predicate at all).
 *  - THE BASE RANGE, resolved per id through `weaponRangeU`.
 *  - THE ZONE LIST, already filtered to own + live by `ownActiveZones`.
 *
 * This is the number BOTH the range-clamp marker (render/firing.ts) and the aim
 * preview's burst point (render/aimPreview.ts) are driven from — ONE evaluation
 * in main.ts feeding both — because the project's guarantee is that the
 * previewed circle IS where the shell bursts. A marker that says "clamped here"
 * beside a preview that bursts somewhere else is the same defect as a preview
 * that disagrees with the server.
 */
export function weaponReachU(
  stats: EffectiveStats,
  id: SlotItemId | null,
  ship: Vec2,
  aim: number,
  aimDist: number,
  mapRadius: number,
  ownLitZones: readonly LitCircle[],
): number {
  const base = weaponRangeU(stats, id);
  if (id !== 'gun') return base; // gun only — every other id keeps its own range
  return gunReachU(ship, aim, aimDist, base, mapRadius, ownLitZones);
}


/**
 * Pure: is the CLICKED POINT within a hard range DENIAL gate? Only the CLICK-
 * PLACED ids have one (Story 2.8, amendment 45; the RADAR BUOY joined the mine
 * on it in Story 7-5 wave 2): a click past CONFIG.mine.placeRange is refused
 * outright, exactly like a click outside the rear arc — nothing is consumed and
 * the denial register fires. Every other id answers true, because none of them
 * denies on distance: the gun family CLAMPS the aim point to rangeU and fires
 * anyway (the range-clamp marker is that clamp made visible), and a torpedo
 * runs until it hits something or leaves the map.
 *
 * Paired with weaponArcHit at every predicted-fire gate so the client's verdict
 * matches the server's on BOTH halves of the placement rule — otherwise an
 * out-of-range click would silently consume the prime (reverting to the gun)
 * for a placement the server refused.
 */
export function weaponRangeHit(aimDist: number, id: SlotItemId | null): boolean {
  // ONE leash for every click-placed id: server/src/game/equipment/radarBuoy.ts
  // reuses CONFIG.mine.placeRange verbatim (R2.7 — "the mine's rear sector at
  // placeRange 150u") and the captive/fouling rows read the naval chassis's
  // `placeRange` too (Story 8.13), so the client must refuse at exactly the same
  // distance or a long placement click silently consumes the prime for a drop
  // the server will deny.
  if (!isPlacedItem(id)) return true;
  return aimDist <= CONFIG.mine.placeRange;
}

/**
 * THE CLICK GATE over a slot's CONTENT — the one predicate main.ts's click
 * prediction asks (review patch P8).
 *
 * A click-placed CONSUMABLE (the decoy buoy, Story 8.15) is an `isWeapon` item
 * with no equipment row, so `arcFor` and the placement leash know nothing about
 * it and both answer "no". That answer is worse than useless here: the client
 * would paint a predicted DENIED pulse, keep the prime and suppress the
 * server's real verdict, while the server placed the buoy. There is no client
 * geometry for a consumable and there is not going to be one, so the client
 * TRUSTS THE SERVER'S ARC for it — no sector test, no range clamp, and the
 * prime is consumed exactly as a normal weapon click consumes it.
 *
 * A KEY-FIRES consumable answers false: a click on an ability square fires
 * nothing on either side.
 *
 * STORY 8.13 CARVED ONE CONSUMABLE BACK OUT of that trust: the SUPERCAV
 * TORPEDO DOES declare geometry — the bow ±15° sector of `CONFIG.supercavTorpedo`
 * (epic-8 amendment 74) — so `arcFor` knows it and the client gates it exactly
 * like a fitted weapon. The test is the DESCRIPTOR, not the id: anything that
 * declares an arc is gated by it, and anything that declares `none` (the decoy
 * buoy, 8.15) keeps trusting the server as before.
 */
export function clickInArc(heading: number, aim: number, aimDist: number, id: SlotItemId | null): boolean {
  if (id !== null && isConsumableId(id) && arcFor(id).kind === 'none') return isWeaponItem(id);
  return weaponArcHit(heading, aim, id) && weaponRangeHit(aimDist, id);
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
