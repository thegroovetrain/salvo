// Screen-space fog overlay. The pre-baked fog texture (dark fill + feathered
// sight hole at its center) is positioned every frame so the hole tracks the
// own ship's SCREEN position; it is re-baked only on resize (zoom is derived
// from the viewport, so resize covers zoom too). Fog is cosmetic — the server
// already culls everything outside sight — it just sells the reveal.
//
// Z-order (verified against stage.ts): worldRoot (ships/shells, fogged) →
// fogSprite (this) → chartRoot (islands/blips/sweep, fog-immune) → hudRoot.
// Thin Pixi adapter (not unit tested).

import { Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { bakeFogTexture } from './textures.js';

/**
 * Extra bake margin (px) beyond camera lead: shake headroom (step 11) + slack.
 * Exported so render/shake.ts can clamp its peak magnitude to the same budget
 * — the fog overlay must never expose a screen edge, however hard the hit.
 */
export const EXTRA_MARGIN_PX = 64;

export class Fog {
  private readonly sprite: Sprite;
  /** Effective sight radius (u) the hole is baked at — swapped by the
   *  sightRange upgrade via setSightRange(); base = CONFIG.vision.sight. */
  private sightRange: number = CONFIG.vision.sight;

  constructor(layer: Container) {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5); // hole is baked at the texture center
    layer.addChild(this.sprite);
  }

  /** Adopt a new (effective) sight radius. Callers must rebake() after —
   *  same path as a resize — so the baked hole matches the server's fog. */
  setSightRange(sightRange: number): void {
    this.sightRange = sightRange;
  }

  /** (Re)bake for a viewport + zoom. Call at boot, on every resize, and after
   *  a sight/radar (zoom) stat change. */
  rebake(viewW: number, viewH: number, zoom: number): void {
    const old = this.sprite.texture;
    const margin = CLIENT_CONFIG.camera.leadMax * zoom + EXTRA_MARGIN_PX;
    this.sprite.texture = bakeFogTexture(viewW, viewH, this.sightRange * zoom, margin);
    if (old !== Texture.EMPTY) old.destroy(true);
  }

  /** Track the own ship: place the baked hole on its screen position. */
  update(holeScreenX: number, holeScreenY: number): void {
    this.sprite.position.set(holeScreenX, holeScreenY);
  }

  /** Hide/show the whole overlay (hidden while spectating — spec frames are unfogged). */
  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
  }
}
