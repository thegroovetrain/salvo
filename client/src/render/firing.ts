// Firing UX, split across two camera-transformed layers (see render/stage.ts
// for the full z-order rationale):
//   - The AIM-GATED sector arcs go in the `ship` layer — which since this cycle
//     lives in chartRoot, above the fog and above the radar paint, along with
//     every hull it draws behind (render/stage.ts). Nothing about the arcs
//     changes with the lift: they rotate with the own ship and sit inside the
//     sight bubble, where the fog was already clear. Three ids draw one: the
//     torpedo's BOW arc; (Story 2.8, amendment 45) the mine's REAR PLACEMENT
//     arc, drawn at its true CONFIG.mine.placeRange radius so the wedge IS the
//     reachable water; and (Story 7-5 wave 2, R2.1) the BROADSIDE BARRAGE, whose
//     two mirrored BEAM sectors are now thin OUTLINES marking the deny boundary
//     while ONE SMALL WEDGE PER TURRET carries the aiming information (Eric
//     ruling 2026-08-27) — exactly the side containing the aim lights.
//     The gun FAMILY (gun / star shells) draws NO arc sector: it is 360° and
//     fires to the clicked point (Eric ruling 2026-07-21), so a wedge would lie.
//     The remaining instant ability (speedBoost) never primes and draws no
//     marker at all.
//   - The crosshair + bearing line go in the `aim` layer (chartRoot, fog-immune)
//     because gun range (radar range, 660u) exceeds sight range (330u): aiming
//     at a radar blip beyond sight must not put the reticle under the fog. Amber
//     when the aim is in the primed weapon's arc AND it is ready, else dim. The
//     bearing line still originates at the own ship's world position — chartRoot
//     shares worldRoot's camera transform, so it lines up exactly with the hull.
// Behavior is keyed on the fitted EQUIPMENT ID (Story 1.7 — slot identity is now
// hull-dependent), never on a slot-index literal. Pure Pixi adapter (not unit
// tested); the id classification + in-arc test reuse render/weaponArc.ts.

import { Container, Graphics } from 'pixi.js';
import {
  CONFIG,
  arcFor,
  inArc,
  turretMountBearings,
  turretMuzzles,
  wrapAngle,
  type EquipmentId,
  type HullId,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { fireArcKind, sectorOutline, twinSectorSide, weaponArcHit } from './weaponArc.js';

const AMBER = CLIENT_CONFIG.colors.amber;
const TORP_TINT = CLIENT_CONFIG.colors.legacy.torpGlow; // cool green — torpedo bow arc (legacy tone)
const DIM = CLIENT_CONFIG.colors.textMuted;
const DENIED_RED = CLIENT_CONFIG.colors.denied; // the single denied red
const EDGE = CLIENT_CONFIG.aimPreview.placementEdge;
const BW = CLIENT_CONFIG.broadsideArcs;
const ARC_R = 72; // u — sector indicator radius (the torpedo's indicative wedge)
const RETICLE_R = 7; // u — crosshair size
const IMPACT_R = 4; // u — range-clamped impact marker ring
/** The `arcs` Graphics is HULL-LOCAL (position = pose, rotation = heading), so
 *  the shared turret helpers are called at the identity pose and their answers
 *  ARE local coordinates. This is the whole reason the render can reuse the
 *  sim's geometry instead of re-deriving spacing. */
const IDENTITY_POSE = { x: 0, y: 0, heading: 0 };

export interface FiringPose {
  x: number;
  y: number;
  heading: number;
}

/**
 * Everything the BROADSIDE's per-turret arc display needs, straight off the
 * owner's effective stats (never CONFIG): the hull whose muzzle positions the
 * wedges spring from, how many guns there are, and the SPREAD rung's two derived
 * half-angles. Omitted for every other weapon — and omitted safely: without it
 * the twin sector still draws its legal outline, just no wedges.
 */
export interface BroadsideArcs {
  hullId: HullId;
  turrets: number;
  traverseRad: number;
  mountSpreadRad: number;
}

/**
 * The primed weapon's ammo state for the firing UX: `hasAmmo` gates whether an
 * arc/marker lights (a round is loadable); `reloadFrac` in [0,1) drives the
 * reload sweep-back wedge (0 = idle/just-fired, → 1 = round nearly ready). For
 * the single-shot gun this is a pure cooldown (n is 0 or 1 under the hood).
 */
export interface FiringAmmo {
  hasAmmo: boolean;
  reloadFrac: number;
}

/** One turret's drawn arc, in the HULL-LOCAL frame the `arcs` Graphics uses. */
export interface TurretWedge {
  apex: { x: number; y: number };
  from: number;
  to: number;
  r: number;
}

/**
 * PURE: the per-turret arc display's geometry for one beam (Eric ruling
 * 2026-08-27, ruling 4). Apex at that gun's own muzzle, swept from its own mount
 * bearing ± its own traverse, at the indicative display radius.
 *
 * IT IS THE SIM'S OWN ANSWER, at an identity pose. `turretMuzzles` and
 * `turretMountBearings` are the same functions `turretAimPoints` calls, so the
 * wedge the player aims by and the arc the fire path tests against cannot drift
 * — re-deriving spacing here (an even fan, a hand-rolled straddle) is exactly
 * the desync class this project keeps one geometry source to prevent. Split out
 * of the Pixi adapter so it is directly assertable.
 */
export function turretWedges(side: 1 | -1, bs: BroadsideArcs): TurretWedge[] {
  const muzzles = turretMuzzles(IDENTITY_POSE, bs.hullId, bs.turrets, side);
  const mounts = turretMountBearings(0, bs.turrets, side, bs.mountSpreadRad);
  return mounts.map((m, i) => ({
    apex: muzzles[i],
    from: m - bs.traverseRad,
    to: m + bs.traverseRad,
    r: BW.wedgeRadius,
  }));
}

export class FiringUX {
  private readonly arcs = new Graphics();
  private readonly reticle = new Graphics();
  /** Effective max range (u) of the primed weapon FOR THIS AIM, fed each frame
   *  by update(); base = radar range. Drives the gun-family range-clamp burst
   *  marker AND the mine's placement-arc radius. weaponArc.weaponReachU is the
   *  one source, and it is the SAME number the aim preview bursts at — including
   *  the star-shell lift (R2.15), where a gun click inside one of our own live
   *  lit zones raises the reach to the click and the clamp marker correctly
   *  stops drawing. */
  private rangeU: number = CONFIG.vision.radar;

  /**
   * `shipLayer` (chartRoot's `ship` — the hull layer) hosts the torpedo/mine
   * markers; `aimLayer` (chartRoot's `aim`, one layer up) hosts the crosshair +
   * bearing line. Both are fog-immune; `aim` stays above `ship` so the reticle is
   * never occluded by a hull.
   */
  constructor(shipLayer: Container, aimLayer: Container) {
    shipLayer.addChild(this.arcs);
    aimLayer.addChild(this.reticle);
  }

  /** Clear both graphics (own ship sunk — no arcs/reticle). */
  hide(): void {
    this.arcs.clear();
    this.reticle.clear();
  }

  /**
   * Redraw for this frame. `aim` is the world bearing to the cursor, `id` is the
   * primed slot's fitted equipment id (drives which marker/reticle shows), `ammo`
   * is that slot's pool state ({hasAmmo, reloadFrac}). `cursor` is the world
   * point. `denied` (default false) briefly overrides the marker to a red pulse —
   * driven by render/deniedFire.ts's rate-limited predicate. `rangeU` is the
   * primed weapon's EFFECTIVE range (weaponArc.weaponRangeU) for the gun-family
   * range-clamp burst marker — since Story 7-5 wave 2 that is weaponReachU, so
   * the marker lifts with the gun inside our own flare. The gun family draws no
   * arc sector (360°).
   */
  update(
    pose: FiringPose,
    aim: number,
    id: EquipmentId | null,
    ammo: FiringAmmo,
    cursor: { x: number; y: number },
    denied = false,
    rangeU: number = CONFIG.vision.radar,
    broadside: BroadsideArcs | null = null,
  ): void {
    this.rangeU = rangeU;
    const kind = fireArcKind(id);
    this.arcs.clear();
    this.arcs.position.set(pose.x, pose.y);
    this.arcs.rotation = pose.heading;
    // Only an AIM-GATED weapon draws a wedge — the torpedo's bow arc and the
    // mine's rear placement arc (Story 2.8), or the broadside's twin beams
    // (Story 7-5 wave 2). The gun family is 360° (no wedge) and the remaining
    // ability (speedBoost) draws no marker.
    if (kind === 'sector' && id !== null) this.drawSectorArc(id, aim, pose.heading, ammo, denied);
    if (kind === 'twin' && id !== null) this.drawTwinArcs(id, aim, pose.heading, ammo, denied, broadside);
    this.drawReticle(pose, aim, id, ammo.hasAmmo, cursor);
  }

  /**
   * The aim-gated wedge for a SECTOR weapon. Geometry comes from the shared
   * arcFor descriptor (Story 1.10 — the single arc-shape source), so the drawn
   * sector IS the enforced one. The MINE draws at its true placement reach
   * (this.rangeU = CONFIG.mine.placeRange) because for it the wedge is the
   * reachable water, not an indicator; the torpedo keeps the fixed indicative
   * ARC_R (its fish runs to the map edge, so a radius would be a lie).
   */
  private drawSectorArc(
    id: EquipmentId,
    aim: number,
    heading: number,
    ammo: FiringAmmo,
    denied: boolean,
  ): void {
    const t = arcFor(id);
    if (t.kind !== 'sector') return; // descriptor law: only a sector draws a wedge
    const lit = inArc(aim, wrapAngle(heading + t.offset), t.halfArc) && ammo.hasAmmo;
    // A PLACEMENT weapon's wedge IS the reachable water (Eric 2026-08-20:
    // *"with this rear facing, place-in-short-range arc style weapon, its
    // important that I as a captain can clearly see where I can place my
    // stuff"*). Both click-placed ids share the ONE leash (CONFIG.mine.placeRange
    // — see weaponRangeU) so they must share the whole grammar: true radius,
    // armed amber, and a stroked boundary that is a real line on the chart.
    //
    // THE RADAR BUOY USED TO FALL TO THE ELSE and was drawn as a TORPEDO —
    // indicative ARC_R (72u, less than half its real 150u reach), torpedo green,
    // no boundary. That is Eric's "the buoy's targeting range indicator isn't
    // correct": it was not the buoy's range at all.
    const placement = id === 'mine' || id === 'radarBuoy';
    const tint = placement ? AMBER : TORP_TINT;
    const radius = placement ? this.rangeU : ARC_R;
    const color = denied ? DENIED_RED : tint;
    this.sector(t.offset, t.halfArc, color, denied || lit, ammo.reloadFrac, radius, placement);
    // The torpedo's ARC_R is indicative — outlining it would draw a hard border
    // around a distance that means nothing.
    if (placement) this.sectorEdge(t.offset, t.halfArc, radius, color, denied || lit);
  }

  /**
   * The BROADSIDE BARRAGE's twin beams (R2.1): both mirrored sectors are drawn
   * every frame — the pair IS the information ("you can fire to either side,
   * and not fore or aft") — but only the one CONTAINING the aim lights, which
   * is the client's reading of R2.2's "the side whose sector contains the click
   * is the side that fires". A denied press reddens BOTH, because an out-of-arc
   * broadside click missed both beams and neither would have fired.
   *
   * WHAT THE SECTOR MEANS CHANGED (Eric ruling 2026-08-27, ruling 4). Under the
   * zero-overlap ladder the guns cover only narrow slivers of the ±60° sector,
   * so a big filled wedge would promise water no gun can reach. The sector drops
   * to a THIN OUTLINE and means exactly one thing — the deny boundary — while
   * the aiming information becomes ONE WEDGE PER GUN, drawn from that gun's own
   * muzzle over its own arc. The gaps between the wedges are the design.
   *
   * Everything stays INDICATIVE at ARC_R / wedgeRadius rather than the true 5/8
   * reach, exactly as the torpedo's wedge is: a 412.5u wedge on each beam would
   * bury the chart, and the reach is already told honestly twice — by the
   * range-clamp marker and by the aim preview's per-shell burst circles.
   */
  private drawTwinArcs(
    id: EquipmentId,
    aim: number,
    heading: number,
    ammo: FiringAmmo,
    denied: boolean,
    bs: BroadsideArcs | null,
  ): void {
    const t = arcFor(id);
    if (t.kind !== 'twin-sector') return; // descriptor law: only twin sectors draw a pair
    const firing = twinSectorSide(heading, aim, t);
    const color = denied ? DENIED_RED : AMBER;
    for (const side of [1, -1] as const) {
      const lit = denied || (firing === side && ammo.hasAmmo);
      this.drawLegalOutline(side * t.offset, t.halfArc, color, lit, ammo.reloadFrac);
      if (bs !== null) this.drawTurretWedges(side, color, lit, bs);
    }
  }

  /**
   * One small filled wedge per TURRET, in the arcs graphic's hull-local frame.
   * The geometry comes from the pure `turretWedges` below — the SHARED sim
   * answer at an identity pose, never re-derived here, so the wedge a captain
   * aims by and the arc the server tests against are one thing.
   *
   * All wedges on a side go into ONE fill: they share a verdict (lit / dim /
   * denied), and a single path keeps the draw cheap at six guns.
   */
  private drawTurretWedges(side: 1 | -1, color: number, lit: boolean, bs: BroadsideArcs): void {
    const wedges = turretWedges(side, bs);
    if (wedges.length === 0) return;
    const g = this.arcs;
    for (const w of wedges) {
      g.moveTo(w.apex.x, w.apex.y);
      g.arc(w.apex.x, w.apex.y, w.r, w.from, w.to);
      g.lineTo(w.apex.x, w.apex.y);
    }
    g.fill({ color: lit ? color : DIM, alpha: lit ? BW.litAlpha : BW.dimAlpha });
  }

  /**
   * The ±60° legal sector as a hairline boundary (no fill), plus the reload
   * sweep-back it now hosts. The outline geometry is weaponArc.sectorOutline —
   * the same pure helper the mine's placement edge uses — and the sweep-back is
   * the shipped `sector()` tail, moved here byte-for-byte when the fill it used
   * to ride was deleted.
   */
  private drawLegalOutline(
    offset: number,
    halfArc: number,
    color: number,
    lit: boolean,
    reloadFrac: number,
  ): void {
    const { rays, arc } = sectorOutline(offset, halfArc, ARC_R);
    const g = this.arcs;
    g.moveTo(0, 0).lineTo(rays[0].x, rays[0].y);
    g.arc(0, 0, arc.r, arc.from, arc.to);
    g.lineTo(0, 0);
    g.stroke({ width: BW.legalEdge.width, color, alpha: lit ? BW.legalEdge.alpha : BW.legalEdge.dimAlpha });
    if (!(reloadFrac > 0 && reloadFrac < 1)) return;
    g.moveTo(0, 0);
    g.arc(0, 0, ARC_R * BW.reloadRadiusFactor, offset - halfArc, offset + halfArc);
    g.lineTo(0, 0);
    g.fill({ color: DIM, alpha: BW.reloadAlphaBase + BW.reloadAlphaSpan * reloadFrac });
  }

  /**
   * The mine placement wedge's crisp BOUNDARY, stroked over the fill: the two
   * side rays plus the closing range arc (geometry from weaponArc.sectorOutline
   * — pure, unit-tested, the same descriptor the fill uses). Where the fill is a
   * soft wash that fades into the water, this says "the rack reaches EXACTLY
   * here, in EXACTLY this sector", which is what a captain seeding a field
   * actually needs to see.
   *
   * STATIC — no pulse, so it reads identically at motion=off — and it carries
   * NO new state: it takes the wedge's own color and its lit/dim/denied verdict
   * and only chooses an alpha from them, so the dim wedge stays as quiet as it
   * is today and the denied red stays the denial register's alone.
   */
  private sectorEdge(
    offset: number,
    halfArc: number,
    radius: number,
    color: number,
    lit: boolean,
  ): void {
    const { rays, arc } = sectorOutline(offset, halfArc, radius);
    const g = this.arcs;
    g.moveTo(0, 0).lineTo(rays[0].x, rays[0].y);
    g.arc(0, 0, arc.r, arc.from, arc.to);
    g.lineTo(0, 0);
    g.stroke({ width: EDGE.width, color, alpha: lit ? EDGE.alpha : EDGE.dimAlpha });
  }

  /** One sector fill (+ reload sweep-back), in the arcs graphic's local frame. */
  private sector(
    offset: number,
    halfArc: number,
    color: number,
    lit: boolean,
    reloadFrac: number,
    radius: number = ARC_R,
    placement = false,
  ): void {
    const g = this.arcs;
    const reloading = reloadFrac > 0 && reloadFrac < 1;
    g.moveTo(0, 0);
    g.arc(0, 0, radius, offset - halfArc, offset + halfArc);
    g.lineTo(0, 0);
    // A PLACEMENT wedge carries its reload in the ONE wedge's own fill, never as
    // a second shape (Eric 2026-08-20: *"the mine's targeting indicator seems to
    // show two stacked indicators?"*). It did: the sweep-back below drew a
    // SECOND wedge at HALF the radius, which on the torpedo's indicative 72u arc
    // reads as a reload hint but on a TRUE-RADIUS placement wedge reads as a
    // second placement boundary — 75u of "you can place here" inside 150u of the
    // same thing, while reloading only, which is why it looked intermittent.
    // Exactly one boundary may ever be on screen for a placement weapon.
    const fillAlpha = lit ? 0.5 : 0.14;
    g.fill({ color: lit ? color : DIM, alpha: placement && reloading ? fillAlpha * 0.45 : fillAlpha });
    if (reloading && !placement) {
      g.moveTo(0, 0);
      g.arc(0, 0, radius * 0.5, offset - halfArc, offset + halfArc);
      g.lineTo(0, 0);
      g.fill({ color: DIM, alpha: 0.1 + 0.2 * reloadFrac });
    }
  }

  private drawReticle(
    pose: FiringPose,
    aim: number,
    id: EquipmentId | null,
    hasAmmo: boolean,
    cursor: { x: number; y: number },
  ): void {
    const g = this.reticle;
    g.clear();
    const kind = fireArcKind(id);
    if (kind === 'none') return; // abilities don't aim — no reticle
    const color = this.reticleColor(pose.heading, aim, id, hasAmmo);
    g.moveTo(pose.x, pose.y).lineTo(cursor.x, cursor.y).stroke({ width: 1, color, alpha: 0.25 });
    g.circle(cursor.x, cursor.y, RETICLE_R).stroke({ width: 1.5, color, alpha: 0.8 });
    g.moveTo(cursor.x - RETICLE_R - 3, cursor.y).lineTo(cursor.x + RETICLE_R + 3, cursor.y);
    g.moveTo(cursor.x, cursor.y - RETICLE_R - 3).lineTo(cursor.x, cursor.y + RETICLE_R + 3);
    g.stroke({ width: 1, color, alpha: 0.6 });
    // The gun family AND the broadside clamp the aim point to rangeU and fire
    // anyway, so both owe the player the true burst distance. The broadside is
    // the one that needs it most: its 5/8 reach is 247.5u shorter than the radar
    // horizon every other gun-family weapon runs to.
    if (kind === 'gunLike' || kind === 'twin') this.drawRangeClampMarker(pose, aim, cursor, color);
  }

  /**
   * A gun-family shell bursts AT the clicked point, clamped to max range
   * (measured from the ship CENTER — the server clamps aimDist to rangeU from
   * center): when the cursor sits beyond it, mark where the shell will actually
   * burst — a small ring + tick on the aim bearing at the clamped distance. The
   * crosshair stays at the cursor; this marker is the truth about the burst point.
   */
  private drawRangeClampMarker(
    pose: FiringPose,
    aim: number,
    cursor: { x: number; y: number },
    color: number,
  ): void {
    if (Math.hypot(cursor.x - pose.x, cursor.y - pose.y) <= this.rangeU) return;
    const g = this.reticle;
    const ix = pose.x + Math.cos(aim) * this.rangeU;
    const iy = pose.y + Math.sin(aim) * this.rangeU;
    g.circle(ix, iy, IMPACT_R).stroke({ width: 1.5, color, alpha: 0.9 });
    // A short cross-bearing tick: "the shell stops on this line".
    const tx = Math.cos(aim + Math.PI / 2) * (IMPACT_R + 4);
    const ty = Math.sin(aim + Math.PI / 2) * (IMPACT_R + 4);
    g.moveTo(ix - tx, iy - ty).lineTo(ix + tx, iy + ty).stroke({ width: 1, color, alpha: 0.6 });
  }

  /** Reticle tint: bright when the aim is in the primed weapon's arc + has ammo.
   *  The torpedo keeps its cool-green identity; everything else (gun family, the
   *  broadside's beams, the mine's rear placement) is amber. */
  private reticleColor(heading: number, aim: number, id: EquipmentId | null, hasAmmo: boolean): number {
    if (!(weaponArcHit(heading, aim, id) && hasAmmo)) return DIM;
    return id === 'torpedo' ? TORP_TINT : AMBER;
  }
}
