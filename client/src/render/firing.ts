// Firing UX, split across two camera-transformed layers (see render/stage.ts
// for the full z-order rationale):
//   - The torpedo bow arc goes in the `ship` layer (worldRoot, fogged) — it
//     rotates with the own ship and sits inside the sight bubble, so fog over it
//     is plan-correct. The gun FAMILY (gun / cannon / star shells) draws NO arc
//     sector: it is 360° and fires to the clicked point (Eric ruling
//     2026-07-21), so a broadside wedge would lie. Instant abilities (speedBoost,
//     and — Story 1.8 — the Mine Layer's mine + decoyBuoy) never prime and draw
//     no marker at all: the torpedo is the one aim-gated skillshot left here.
//   - The crosshair + bearing line go in the `aim` layer (chartRoot, fog-immune)
//     because gun range (radar range, 650u) exceeds sight range (220u): aiming
//     at a radar blip beyond sight must not put the reticle under the fog. Amber
//     when the aim is in the primed weapon's arc AND it is ready, else dim. The
//     bearing line still originates at the own ship's world position — chartRoot
//     shares worldRoot's camera transform, so it lines up exactly with the hull.
// Behavior is keyed on the fitted EQUIPMENT ID (Story 1.7 — slot identity is now
// hull-dependent), never on a slot-index literal. Pure Pixi adapter (not unit
// tested); the id classification + in-arc test reuse render/weaponArc.ts.

import { Container, Graphics } from 'pixi.js';
import { CONFIG, arcFor, inArc, wrapAngle, type EquipmentId } from '@salvo/shared';
import { fireArcKind, weaponArcHit } from './weaponArc.js';

const AMBER = 0xffb800;
const TORP_TINT = 0x3fbf8f; // cool green — torpedo bow arc
const DIM = 0x5a6478;
const DENIED_RED = 0xff3b3b; // DESIGN.md invalid-placement red
const ARC_R = 72; // u — sector indicator radius
const RETICLE_R = 7; // u — crosshair size
const IMPACT_R = 4; // u — range-clamped impact marker ring

export interface FiringPose {
  x: number;
  y: number;
  heading: number;
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

export class FiringUX {
  private readonly arcs = new Graphics();
  private readonly reticle = new Graphics();
  /** Effective max range (u) of the primed weapon, fed each frame by update();
   *  base = radar range. Drives the gun-family range-clamp burst marker. */
  private rangeU: number = CONFIG.vision.radar;

  /**
   * `shipLayer` (worldRoot's `ship`) hosts the torpedo/mine markers; `aimLayer`
   * (chartRoot's `aim`, fog-immune) hosts the crosshair + bearing line.
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
   * range-clamp burst marker. The gun family draws no arc sector (360°).
   */
  update(
    pose: FiringPose,
    aim: number,
    id: EquipmentId | null,
    ammo: FiringAmmo,
    cursor: { x: number; y: number },
    denied = false,
    rangeU: number = CONFIG.vision.radar,
  ): void {
    this.rangeU = rangeU;
    const kind = fireArcKind(id);
    this.arcs.clear();
    this.arcs.position.set(pose.x, pose.y);
    this.arcs.rotation = pose.heading;
    // Only the torpedo draws an arc sector; the gun family is 360° (no wedge)
    // and instant abilities (speedBoost / mine / decoyBuoy) draw no marker.
    if (kind === 'torpedo') this.drawBowArc(aim, pose.heading, ammo, denied);
    this.drawReticle(pose, aim, id, ammo.hasAmmo, cursor);
  }

  private drawBowArc(aim: number, heading: number, ammo: FiringAmmo, denied: boolean): void {
    // The wedge geometry comes from the shared arcFor descriptor (Story 1.10 —
    // the single arc-shape source), so the drawn sector IS the enforced one.
    const t = arcFor('torpedo');
    if (t.kind !== 'sector') return; // descriptor law: only a sector draws a wedge
    const lit = inArc(aim, wrapAngle(heading + t.offset), t.halfArc) && ammo.hasAmmo;
    this.sector(t.offset, t.halfArc, denied ? DENIED_RED : TORP_TINT, denied || lit, ammo.reloadFrac);
  }

  /** One sector fill (+ reload sweep-back), in the arcs graphic's local frame. */
  private sector(offset: number, halfArc: number, color: number, lit: boolean, reloadFrac: number): void {
    const g = this.arcs;
    g.moveTo(0, 0);
    g.arc(0, 0, ARC_R, offset - halfArc, offset + halfArc);
    g.lineTo(0, 0);
    g.fill({ color: lit ? color : DIM, alpha: lit ? 0.5 : 0.14 });
    if (reloadFrac > 0 && reloadFrac < 1) {
      g.moveTo(0, 0);
      g.arc(0, 0, ARC_R * 0.5, offset - halfArc, offset + halfArc);
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
    if (kind !== 'gunLike' && kind !== 'torpedo') return; // mines / abilities don't aim — no reticle
    const color = this.reticleColor(pose.heading, aim, id, hasAmmo);
    g.moveTo(pose.x, pose.y).lineTo(cursor.x, cursor.y).stroke({ width: 1, color, alpha: 0.25 });
    g.circle(cursor.x, cursor.y, RETICLE_R).stroke({ width: 1.5, color, alpha: 0.8 });
    g.moveTo(cursor.x - RETICLE_R - 3, cursor.y).lineTo(cursor.x + RETICLE_R + 3, cursor.y);
    g.moveTo(cursor.x, cursor.y - RETICLE_R - 3).lineTo(cursor.x, cursor.y + RETICLE_R + 3);
    g.stroke({ width: 1, color, alpha: 0.6 });
    if (kind === 'gunLike') this.drawRangeClampMarker(pose, aim, cursor, color);
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

  /** Reticle tint: bright when the aim is in the primed weapon's arc + has ammo. */
  private reticleColor(heading: number, aim: number, id: EquipmentId | null, hasAmmo: boolean): number {
    if (!(weaponArcHit(heading, aim, id) && hasAmmo)) return DIM;
    return fireArcKind(id) === 'torpedo' ? TORP_TINT : AMBER;
  }
}
