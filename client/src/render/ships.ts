// Procedural ship hull view, now driven by the SHARED silhouette polygon
// (sim/silhouette.ts — the silhouette IS the hitbox). One code path keyed by
// hull id: the three pickable classes render their ratified board silhouettes;
// drone hull ids render the legacy chevron (exactly what hullSilhouette returns
// for a drone id). Own ship renders as a filled tactical-green hull (DESIGN.md
// tier-1: 30% fill + solid stroke); remote contacts as hollow amber outlines.
//
// The render polygon is the shared local-frame silhouette VERBATIM (bow at +x,
// origin-centered, world units) — no independent geometry, so what you see is
// the collision/hit-test hull. The view is added to a camera-transformed layer,
// so world heading == sprite rotation (no y-flip — see camera.ts).

import { Graphics } from 'pixi.js';
import { hullSilhouette, type HullId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

export interface ShipStyle {
  /** Hull fill color. */
  color: number;
  /** true = hollow outline (contacts), false = filled 30% (own ship). */
  hollow: boolean;
}

/** Own-ship style: tactical green, filled (legacy own-hull → 1.12 Regatta hue). */
export const OWN_STYLE: ShipStyle = { color: CLIENT_CONFIG.colors.legacy.ownHull, hollow: false };
/** Contact style: amber alert, hollow (legacy enemy-hull → 1.12 Regatta hue). */
export const CONTACT_STYLE: ShipStyle = { color: CLIENT_CONFIG.colors.legacy.enemyHull, hollow: true };

/** Trace the shared silhouette polygon (local frame, bow at +x, closed). */
function tracePolygon(g: Graphics, poly: readonly Vec2[]): void {
  g.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) g.lineTo(poly[i].x, poly[i].y);
  g.closePath();
}

export class ShipView {
  readonly gfx: Graphics;
  private downed = false;
  private flashUntil = 0;
  private fade = 1; // sight fade multiplier (contacts fade in/out over 150ms)
  private hullId: HullId;

  constructor(private readonly style: ShipStyle, hullId: HullId = 'torpedoBoat') {
    this.gfx = new Graphics();
    this.hullId = hullId;
    this.draw();
  }

  /** Re-draw for a new hull id (own ship only; contacts know their hull at
   *  creation). Preserves position/rotation/tint applied by update(). */
  setHullId(hullId: HullId): void {
    this.hullId = hullId;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    tracePolygon(g, hullSilhouette(this.hullId));
    if (!this.style.hollow) {
      // DESIGN.md tier-1: 30% fill + full-strength hull stroke + silver inner
      // stroke for contrast against dark ocean / crimson hits.
      g.fill({ color: this.style.color, alpha: 0.3 });
      g.stroke({ width: 1.5, color: this.style.color, alpha: 1 });
    } else {
      g.stroke({ width: 1.5, color: this.style.color, alpha: 1 });
    }
  }

  /** Fade + tint the hull as sunk (true) or restore it on (re)spawn (false). */
  setDowned(v: boolean): void {
    this.downed = v;
  }

  /** Brief bright flash (took a hit). */
  flash(): void {
    this.flashUntil = performance.now() + CLIENT_CONFIG.ship.flashMs;
  }

  /** Sight-fade multiplier [0,1] applied on top of tint/alpha state. */
  setFade(alpha: number): void {
    this.fade = alpha;
    this.applyLook();
  }

  /** Position + orient the hull from a world pose, applying tint/alpha state. */
  update(x: number, y: number, heading: number): void {
    this.gfx.position.set(x, y);
    this.gfx.rotation = heading;
    this.applyLook();
  }

  private applyLook(): void {
    if (performance.now() < this.flashUntil) {
      this.gfx.tint = CLIENT_CONFIG.colors.white;
      this.gfx.alpha = this.fade;
    } else if (this.downed) {
      this.gfx.tint = CLIENT_CONFIG.ship.sunkTint;
      this.gfx.alpha = 0.4 * this.fade;
    } else {
      this.gfx.tint = CLIENT_CONFIG.colors.white;
      this.gfx.alpha = this.fade;
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
