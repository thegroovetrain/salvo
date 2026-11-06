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
// arc, never denied for bearing, aimed to the clicked point); the three
// torpedoes declare `launcher` (Story 10.6, R6 — the union of the deck
// launchers the ship holds, `launcherSectors`); as of Story 2.8 (amendment 45) the MINE and
// (Story 8.16) the old DECOY BUOY declared their rear placement `sector` (since
// Story 10.9 the four BUOYS declare `full` — 360°, ruling 9 — on the same leash); the
// BROADSIDE BARRAGE declares `twin-sector`, two mirrored beam sectors at
// `heading ± 90°` each 60° wide; the boost aims nothing (`none`). Callers
// derive the id from the own loadout (main.ts's slotIdsFor / shared loadoutFor).
//
// STORY 7-5 WAVE 2 RETIRED the `stern-drop` branch: the old decoy buoy was that
// shape's only user, and every buoy since (the radar buoy, deleted in Story
// 8.16, the 8.16 DECOY BUOY and the 10.9 four buoys) is click-placed on the mine's
// leash. Nothing here may re-add a branch for it.
//
// STORY 8.13 TOOK THE ID EQUALITIES OUT. Three mine LINES now share the rear
// placement grammar (naval/captive/fouling) and the torpedo lines share one
// family (since Story 10.6 one `launcher` arc — the fixed beam / bow sectors
// are retired), so every predicate below is keyed on the shared `arcFor` descriptor
// or on an explicit, pinned id SET, never on `id === 'navalMines'` /
// `id === 'heavyTorpedo'`. Since Story 10.5 (2026-11-05, epic-10 amendment 11)
// every id is an `EquipmentId` again: the supercav, FLASH SHELLS and the
// FOULING SHELL are slot weapons, and the buoys are gone.

import {
  CONFIG,
  arcFor,
  gunReachU,
  inArc,
  isMineEquipment,
  launcherArcHolds,
  launcherSectors,
  launcherStation,
  pointInLitZone,
  twinSectorSide,
  wrapAngle,
  type EffectiveStats,
  type LitCircle,
  type EquipmentId,
  type HullId,
  type Vec2,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/**
 * THE THREE MINE LINES (Story 8.13) — RE-EXPORTED FROM `shared/sim/arcs.ts`,
 * where the list lives. One hull may fit naval, captive and fouling mines at
 * once, so every id-keyed branch that used to read `'navalMines'` asks "is this
 * A mine?" instead — the placement leash, the rear wedge's placement grammar,
 * the own rings and the drop preview.
 *
 * The list, the guard and the two kind maps were briefly a CLIENT-LOCAL
 * restatement of a shared fact, held to the shared `isMineChassis` by a
 * cross-check pin. They are one declaration now: the rear placement sector is
 * what makes these ids one family, so `sim/arcs.ts` is their home and both
 * sides import them. The cross-check in __tests__/weaponArc.test.ts is kept —
 * trivially true today, and still the thing that fails when a FOURTH mine kind
 * declares the placement sector without joining the list.
 */
export {
  MINE_EQUIPMENT_IDS,
  isMineEquipment,
  mineEquipmentFor,
  mineKindOf,
  type MineEquipmentId,
} from '@salvo/shared';

/** Pure: is this id CLICK-PLACED on the mine's leash (`CONFIG.mine.placeRange`)
 *  — the three mine lines (the buoys left with Story 10.5)? The one predicate
 *  the placement leash (range denial), the true-radius placement shape and the
 *  amber placement tint read. */
export function isPlacedItem(id: EquipmentId | null): boolean {
  return isMineEquipment(id);
}

/**
 * THE TORPEDO FAMILY — the three torpedo lines (the `Q` slot's family since
 * Story 10.5). Every fish
 * shares the family's identity on screen: the cool-green arc, reticle and
 * preview tint, and the torpedo glyph.
 */
export const TORPEDO_ITEM_IDS = ['lightTorpedo', 'heavyTorpedo', 'supercavTorpedo'] as const satisfies
  readonly EquipmentId[];

/** One of the three torpedo ids. */
export type TorpedoItemId = (typeof TORPEDO_ITEM_IDS)[number];

/** Pure: is this slot content a TORPEDO of any line? */
export function isTorpedoItem(id: EquipmentId | null): id is TorpedoItemId {
  return id !== null && (TORPEDO_ITEM_IDS as readonly string[]).includes(id);
}

/**
 * The firing-arc behavior class of a fitted equipment id. Drives every id-keyed
 * branch in firing.ts's marker/reticle rendering and weaponArcHit below:
 * - `gunLike` — a `full` (360°) descriptor: aimed to the clicked point,
 *   range-clamped, no arc sector drawn.
 * - `sector`  — a `sector` descriptor: an AIM-GATED weapon that draws its wedge
 *   (the torpedo's bow arc; the mine's and the decoy buoy's rear placement arc as of
 *   Story 2.8 — PIN FLIPPED from 'none' knowingly, amendment 45).
 * - `twin`    — a `twin-sector` descriptor (the BROADSIDE BARRAGE, R2.1): TWO
 *   mirrored aim-gated wedges at `heading ± offset`. A click inside EITHER is
 *   legal and fires THAT side (R2.2); a click in neither — the bow and stern
 *   dead zones — is denied exactly like a `sector` miss.
 * - `launcher` — a TORPEDO (Story 10.6, R6 / R28): the union of the firing
 *   bands of the deck launchers the ship holds
 *   (`launcherSectors(stats.torpedoLaunchers)`) — each launcher fires on both
 *   sides from `CONFIG.launcher.deadDeg` to `trainDeg` off its own end.
 * - `none`    — the `none` descriptor (the speed boost) or an empty slot: not
 *   an aimed weapon, no marker, no reticle.
 */
export type FireArcKind = 'gunLike' | 'sector' | 'twin' | 'launcher' | 'none';

/** Pure: classify a fitted slot's content (or null empty slot) by firing-arc
 *  kind — a straight projection of the shared arcFor descriptor (the SUPERCAV
 *  TORPEDO's bow ±15° `sector`, FLASH SHELLS' and the FOULING SHELL's `full`). */
export function fireArcKind(id: EquipmentId | null): FireArcKind {
  if (id === null) return 'none'; // an unfitted weapon slot / defensive null
  const arc = arcFor(id);
  if (arc.kind === 'full') return 'gunLike'; // the guns / star, phosphor, fouling, flash shells
  if (arc.kind === 'sector') return 'sector'; // torpedo bow arc / the mines' rear arc
  if (arc.kind === 'twin-sector') return 'twin'; // broadside beams
  if (arc.kind === 'launcher') return 'launcher'; // the torpedoes' deck launchers (Story 10.6)
  return 'none'; // none (boost)
}

/**
 * Does `aim` (world bearing) fall within the fitted weapon `id`'s firing arc,
 * given the hull's `heading`? Driven by the shared arcFor descriptor: a `full`
 * arc is always true; a `sector` checks heading + offset ± halfArc via shared
 * `inArc` (the exact server gate — the torpedo's bow sector, and the mine's and
 * decoy buoy's rear placement sector); a `twin-sector` is in arc when EITHER
 * mirrored beam contains the aim (the broadside, R2.1/R2.2); a `launcher` (a
 * torpedo, Story 10.6) when ANY of the ship's `launchers` held launchers bears
 * (`launcherArcHolds` — parallax-free, from the hull centre; the ENFORCED
 * verdict is the shared `pickTube`, which main.ts asks for the click). An
 * instant ability (`none`) or the empty slot is NOT a firing weapon, so it is
 * never "in arc".
 *
 * NOTE: this is the BEARING gate only. The mine additionally requires the
 * clicked point to lie within CONFIG.mine.placeRange — an out-of-range click
 * is denied by the server exactly like an out-of-arc one (see weaponRangeU,
 * which supplies that ring to the firing UX).
 */
export function weaponArcHit(heading: number, aim: number, id: EquipmentId | null, launchers = 1, hullId: HullId | null = null): boolean {
  if (id === null) return false;
  const arc = arcFor(id);
  if (arc.kind === 'full') return true; // 360° — never out of arc
  if (arc.kind === 'sector') {
    return inArc(aim, wrapAngle(heading + arc.offset), arc.halfArc);
  }
  if (arc.kind === 'twin-sector') return twinSectorSide(heading, aim, arc) !== null;
  // R30: the bands are per hull — no hull named, no band to hold the aim.
  if (arc.kind === 'launcher') return hullId !== null && launcherArcHolds(hullId, launchers, heading, aim);
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
 * The effective range (u) at which an AIMED weapon's shot lands / clamps. Since
 * Story 9.8 (ruling 125) EVERY weapon's reach is its own TIERED dial on the
 * twelfths ruler — `CONFIG.<weapon>.rangeU` is the Tier I value and each of the
 * line's four cards adds its step through `effectiveStats()` — so each gun row
 * reads its OWN folded `stats.equipment.<w>.rangeU`, never radar and never the
 * cannon's by assumption. FLASH SHELLS and the FOULING SHELL read their own
 * rows too (slot weapons since Story 10.5). The MINE lines read the ratified
 * CONFIG.mine.placeRange: their placement reach is a fixed short leash and no
 * boon moves it.
 *
 * CONTRACT — MEANINGFUL FOR `gunLike` IDS, THE BROADSIDE, THE FOULING SHELL AND
 * THE PLACED IDS ONLY. For a torpedo / ability / empty slot there is NO range
 * ring, and this returns `stats.equipment.gun.rangeU` purely as a non-crashing
 * fallback — it is NOT that weapon's range (a torpedo runs to the map edge). Do
 * NOT consult this for those ids; gate on the id first, as firing.ts's markers
 * do.
 */
export function weaponRangeU(stats: EffectiveStats, id: EquipmentId | null): number {
  if (id === 'broadside') return stats.equipment.broadside.rangeU;
  if (id === 'starShells') return stats.equipment.starShells.rangeU;
  // STORY 8.17: PHOSPHOR SHELLS reads its own row; since Story 10.5 so do
  // FLASH SHELLS and the FOULING SHELL (both rows carry the shared reach).
  if (id === 'phosphorShells') return stats.equipment.phosphorShells.rangeU;
  if (id === 'foulingShell' || id === 'dazzleShells') return stats.equipment[id].rangeU;
  // THE TWO PICKABLE GUNS (Story 8.15) read their OWN row (ruling 125).
  if (id === 'machineGun') return stats.equipment.machineGun.rangeU;
  if (id === 'flak') return stats.equipment.flak.rangeU;
  // STORY 10.4: the MAIN BATTERY reads its own folded row (RANGE scales it).
  if (id === 'mainBattery') return stats.equipment.mainBattery.rangeU;
  // ALL THREE MINE LINES share the ONE leash (Story 8.13) — the naval chassis
  // is shared, not duplicated (`CONFIG.captiveMines`/`CONFIG.foulingMines` restate
  // no placement field), so an id-equality test on `navalMines` would have given
  // a captive or fouling drop the cannon's range.
  if (isPlacedItem(id)) return CONFIG.mine.placeRange;
  return stats.equipment.gun.rangeU; // the cannon's own tiered dial — and the default
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
 * THE DECK GUNS (amendment 114) — the slot-0 gun rows that fire into the
 * shooter's own lit-up area: the cannon (`gun`), the MACHINE GUN, the FLAK
 * GUN and (Story 10.4) the captain's MAIN BATTERY, whose server fire path calls
 * the same `gunReachU` (measured there from the firing turret's station; this
 * client read measures from the hull centre). An explicit, pinned id SET (never an id equality), mirroring the server,
 * where exactly these three rows call `gunReachU`.
 */
const DECK_GUNS: ReadonlySet<EquipmentId> = new Set<EquipmentId>(['gun', 'machineGun', 'flak', 'mainBattery']);

/**
 * THE STAR-SHELL GUN REACH (Story 7-5 wave 2, R2.15; amendment 114): the reach
 * the primed system actually has FOR THIS AIM, which is `weaponRangeU` except
 * where the flare extension applies.
 *
 * A DECK-GUN click whose target point lies inside a LIVE lit zone the clicking
 * player OWNS is legal beyond that gun's own row `rangeU` — you can shell what
 * your own flare is lighting. Eric ruling 2026-09-29 (amendment 114): every
 * deck gun — cannon, machine gun, flak — gets it, exactly as the cannon did.
 *
 * THE RULE ITSELF IS NOT WRITTEN HERE. Both sides CALL the promoted shared
 * `gunReachU` (sim/aim.ts), the same promotion `blockedWater` and
 * `burstPointAlong` already made. All that survives on this side is the part
 * that is genuinely the client's:
 *
 *  - THE ID GATE. Deck guns ONLY (`DECK_GUNS`) — never the broadside (its reach
 *    is a weapon identity, not a horizon), never the star shell itself,
 *    never the torpedo, never the mine. It lives HERE rather than at the call
 *    sites so nothing can forget it and quietly widen another weapon; on the
 *    server the same clause is structural (only the three deck-gun rows call
 *    the predicate at all).
 *  - THE BASE RANGE, resolved per id through `weaponRangeU` (each gun's OWN row).
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
  id: EquipmentId | null,
  ship: Vec2,
  aim: number,
  aimDist: number,
  mapRadius: number,
  ownLitZones: readonly LitCircle[],
): number {
  const base = weaponRangeU(stats, id);
  if (id === null || !DECK_GUNS.has(id)) return base; // deck guns only — every other id keeps its own range
  return gunReachU(ship, aim, aimDist, base, mapRadius, ownLitZones);
}


/**
 * Pure: is the CLICKED POINT within a hard range DENIAL gate? Only the CLICK-
 * PLACED ids have one (Story 2.8, amendment 45; the four BUOYS share the mine's
 * since Story 10.9): a click past CONFIG.mine.placeRange is refused
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
export function weaponRangeHit(aimDist: number, id: EquipmentId | null): boolean {
  // ONE leash for every click-placed id: the four BUOY rows reuse
  // CONFIG.mine.placeRange verbatim (Story 10.9, ruling 9 — the range is
  // unchanged, only the arc opened) and the captive/fouling rows read the naval chassis's
  // `placeRange` too (Story 8.13), so the client must refuse at exactly the same
  // distance or a long placement click silently consumes the prime for a drop
  // the server will deny.
  if (!isPlacedItem(id)) return true;
  return aimDist <= CONFIG.mine.placeRange;
}

/**
 * THE CLICK GATE over a slot's CONTENT — the one predicate main.ts's click
 * prediction asks (review patch P8): the bearing gate and the range gate of
 * the fitted weapon's own descriptor. (The consumable carve-outs left with the
 * kit — Story 10.5.) `launchers` = the held torpedo launchers (Story 10.6) —
 * main.ts asks the shared `pickTube` for a TORPEDO click instead, measured
 * from each launcher's station; this parallax-free read is the fallback.
 */
export function clickInArc(heading: number, aim: number, aimDist: number, id: EquipmentId | null, launchers = 1, hullId: HullId | null = null): boolean {
  return weaponArcHit(heading, aim, id, launchers, hullId) && weaponRangeHit(aimDist, id);
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

/**
 * One torpedo firing wedge in the HULL-LOCAL frame (bow along +x): it springs
 * from its launcher's `origin` (the shared `launcherStation` — the same point
 * `pickTube` measures from), spans `offset ± halfArc` and runs `r` units.
 */
export interface LauncherWedge {
  origin: Vec2;
  offset: number;
  halfArc: number;
  r: number;
}

/**
 * Pure: THE TORPEDO WEDGES (Story 10.6, R28 / R30) — one per firing band of
 * each held launcher (two per launcher, fore first: the order of the shared
 * `launcherSectors`), each from ITS launcher's station on `hullId`, at that
 * launcher's own band angles, `lengthU` long.
 */
export function launcherWedges(hullId: HullId, launchers: number, lengthU: number): LauncherWedge[] {
  return launcherSectors(hullId, launchers).map((s, k) => ({
    origin: launcherStation(hullId, Math.floor(k / 2)),
    offset: s.offset,
    halfArc: s.halfArc,
    r: lengthU,
  }));
}

/** u — the wedge length: `CLIENT_CONFIG.launcherWedge.lengthMult` × the indicative radius (no torpedo run figure exists — Eric). */
export function launcherWedgeLengthU(indicativeRadiusU: number): number {
  return indicativeRadiusU * CLIENT_CONFIG.launcherWedge.lengthMult;
}

/** Pure: the wedge's alpha multiplier at `frac` of its length — 1 out to `fadeStartFrac`, then a smoothstep down to 0 at the end (and beyond). */
export function wedgeFade(frac: number): number {
  if (frac >= 1) return 0;
  const start = CLIENT_CONFIG.launcherWedge.fadeStartFrac;
  if (frac <= start) return 1;
  const t = (frac - start) / (1 - start);
  return 1 - t * t * (3 - 2 * t);
}

/** One wedge's alpha multiplier at a hull-local point (0 outside it). */
function wedgeAlpha(w: LauncherWedge, x: number, y: number): number {
  const dx = x - w.origin.x;
  const dy = y - w.origin.y;
  const d = Math.hypot(dx, dy);
  if (d > w.r || Math.abs(wrapAngle(Math.atan2(dy, dx) - w.offset)) > w.halfArc) return 0;
  return wedgeFade(d / w.r);
}

/**
 * Pure: the COMPOSITE alpha multiplier of the wedges at a hull-local point,
 * as the renderer stacks them — each wedge its own fill, normal
 * over-compositing, so an overlap reads brighter (Eric: "they should overlap
 * as a brighter patch").
 */
export function launcherWedgeAlphaAt(wedges: readonly LauncherWedge[], x: number, y: number): number {
  let clear = 1;
  for (const w of wedges) clear *= 1 - wedgeAlpha(w, x, y);
  return 1 - clear;
}

/** One angular span of a wedge, hull-relative radians, `from < to`. */
export interface ArcSpan {
  from: number;
  to: number;
}

const TAU = 2 * Math.PI;

/**
 * Pure: the UNION of hull-relative sectors (`offset ± halfArc`) as the fewest
 * spans to fill — or `'full'` when together they cover every bearing. The
 * torpedo wedge is drawn from this (Story 10.6, R6 / R28): each launcher is
 * two side bands; the fore and the aft launcher's bands overlap on each beam
 * and merge into ONE span per side, never two overlapping fills
 * double-shading their overlap.
 */
export function arcUnion(sectors: readonly { offset: number; halfArc: number }[]): ArcSpan[] | 'full' {
  const spans: ArcSpan[] = [];
  for (const s of sectors) {
    if (2 * s.halfArc >= TAU) return 'full';
    const from = (((s.offset - s.halfArc) % TAU) + TAU) % TAU;
    spans.push({ from, to: from + 2 * s.halfArc });
  }
  spans.sort((a, b) => a.from - b.from);
  const out: ArcSpan[] = [];
  for (const s of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return closeWrap(out);
}

/** Fold the first span into the last when the last runs past a full turn onto
 *  it; a span a whole turn long is the full circle. */
function closeWrap(out: ArcSpan[]): ArcSpan[] | 'full' {
  if (out.length > 1 && out[out.length - 1].to - TAU >= out[0].from) {
    const first = out.shift()!;
    const last = out[out.length - 1];
    last.to = Math.max(last.to, first.to + TAU);
  }
  return out.some((s) => s.to - s.from >= TAU) ? 'full' : out;
}
