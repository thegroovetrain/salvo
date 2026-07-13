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

const HALF_LEN = 20; // u — bow/stern from center
const HALF_BEAM = 6; // u — port/starboard from center

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

/** Chevron/capsule hull outline, bow at +x, centered at origin (world units). */
function traceHull(g: Graphics): void {
  g.moveTo(HALF_LEN, 0) // bow tip
    .lineTo(6, -HALF_BEAM)
    .lineTo(-HALF_LEN + 2, -HALF_BEAM)
    .lineTo(-HALF_LEN, 0) // stern center
    .lineTo(-HALF_LEN + 2, HALF_BEAM)
    .lineTo(6, HALF_BEAM)
    .closePath();
}

const SUNK_TINT = 0x8b0000; // DESIGN.md dark crimson
const FLASH_MS = 130;

export class ShipView {
  readonly gfx: Graphics;
  private downed = false;
  private flashUntil = 0;

  constructor(style: ShipStyle) {
    const g = new Graphics();
    traceHull(g);
    if (!style.hollow) {
      // DESIGN.md tier-1: 30% fill + full-strength hull stroke + silver inner
      // stroke for contrast against dark ocean / crimson hits.
      g.fill({ color: style.color, alpha: 0.3 });
      g.stroke({ width: 1.5, color: style.color, alpha: 1 });
    } else {
      g.stroke({ width: 1.5, color: style.color, alpha: 1 });
    }
    this.gfx = g;
  }

  /** Fade + tint the hull as sunk (true) or restore it on (re)spawn (false). */
  setDowned(v: boolean): void {
    this.downed = v;
  }

  /** Brief bright flash (took a hit). */
  flash(): void {
    this.flashUntil = performance.now() + FLASH_MS;
  }

  /** Position + orient the hull from a world pose, applying tint/alpha state. */
  update(x: number, y: number, heading: number): void {
    this.gfx.position.set(x, y);
    this.gfx.rotation = heading;
    if (performance.now() < this.flashUntil) {
      this.gfx.tint = 0xffffff;
      this.gfx.alpha = 1;
    } else if (this.downed) {
      this.gfx.tint = SUNK_TINT;
      this.gfx.alpha = 0.4;
    } else {
      this.gfx.tint = 0xffffff;
      this.gfx.alpha = 1;
    }
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
