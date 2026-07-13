// Procedural ship hull view. One class, color-parameterized: own ship renders
// as a filled tactical-green chevron (DESIGN.md tier-1: 30% fill + solid
// stroke), remote contacts as hollow amber outlines. Only the own ship is
// instantiated at the offline-drive step; the class is built generic so the
// netcode step can spawn contacts without new render code.
//
// Geometry is in world units (~40 long x 12 beam), bow at +x. The view is added
// to a camera-transformed layer, so world heading == sprite rotation (the world
// axes map straight to screen with no y-flip — see camera.ts).

import { Graphics } from 'pixi.js';
import { CONFIG, type Hull } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

/** Default hull dims until the class is known (cruiser, corrected by 1st frame). */
const DEFAULT_HULL: Hull = CONFIG.shipClasses.cruiser.hull;

export interface ShipStyle {
  /** Hull fill color. */
  color: number;
  /** true = hollow outline (contacts), false = filled 30% (own ship). */
  hollow: boolean;
}

/** Own-ship style: tactical green, filled. */
export const OWN_STYLE: ShipStyle = { color: 0x00ff88, hollow: false };
/** Contact style: amber alert, hollow. */
export const CONTACT_STYLE: ShipStyle = { color: 0xffb800, hollow: true };

/**
 * Chevron/capsule hull outline, bow at +x, centered at origin (world units).
 * The chevron shoulders are proportional fractions of the hull length so every
 * class keeps the same silhouette (visually identical to the old 40×12 cruiser:
 * shoulder at 0.3·halfLen, stern inset 0.1·halfLen).
 */
function traceHull(g: Graphics, length: number, beam: number): void {
  const hl = length / 2; // u — bow/stern from center
  const hb = beam / 2; // u — port/starboard from center
  const shoulder = hl * 0.3; // where the beam reaches full width, near the bow
  const stern = -hl + hl * 0.1; // slight stern inset
  g.moveTo(hl, 0) // bow tip
    .lineTo(shoulder, -hb)
    .lineTo(stern, -hb)
    .lineTo(-hl, 0) // stern center
    .lineTo(stern, hb)
    .lineTo(shoulder, hb)
    .closePath();
}

export class ShipView {
  readonly gfx: Graphics;
  private downed = false;
  private flashUntil = 0;
  private fade = 1; // sight fade multiplier (contacts fade in/out over 150ms)
  private hull: Hull;

  constructor(private readonly style: ShipStyle, hull: Hull = DEFAULT_HULL) {
    this.gfx = new Graphics();
    this.hull = hull;
    this.draw();
  }

  /** Re-trace the hull for a new class (own ship only; contacts know their class
   *  at creation). Preserves position/rotation/tint applied by update(). */
  setHull(hull: Hull): void {
    this.hull = hull;
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    traceHull(g, this.hull.length, this.hull.beam);
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
      this.gfx.tint = 0xffffff;
      this.gfx.alpha = this.fade;
    } else if (this.downed) {
      this.gfx.tint = CLIENT_CONFIG.ship.sunkTint;
      this.gfx.alpha = 0.4 * this.fade;
    } else {
      this.gfx.tint = 0xffffff;
      this.gfx.alpha = this.fade;
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
