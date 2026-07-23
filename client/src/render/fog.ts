// Screen-space fog overlay. The pre-baked fog texture (dark fill + feathered
// sight hole at its center) is positioned every frame so the hole tracks the
// own ship's SCREEN position; it is re-baked only on resize (zoom is derived
// from the viewport, so resize covers zoom too). Fog is cosmetic and MOSTLY
// redundant — the server culls almost everything outside sight — it just sells
// the reveal. The ONE exception (Story 1.7): the server reveals enemy
// ships/mines/ballistics inside the firer's own star-shell lit zones (truesight
// parity), and those render in worldRoot BENEATH this overlay. So owned lit
// zones punch extra holes here (updateHoles) via an INVERSE geometry mask on the
// fog sprite — the fog simply is not drawn inside those circles, revealing the
// unfogged world under them (an alpha 'erase' would only blacken the
// already-composited world, not reveal it). Enemy zones never clear your fog
// (you gain no vision from them — their amber circle stays a marker only).
//
// Z-order (verified against stage.ts): worldRoot (ships/shells, fogged) →
// fogSprite (this) → chartRoot (islands/blips/sweep, fog-immune) → hudRoot.
// Thin Pixi adapter (not unit tested); the hole participation + fade math it
// consumes are the pure functions in render/litZones.ts.

import { Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { bakeFogTexture } from './textures.js';

/** One fog-clearing hole in SCREEN space: center + (fade-scaled) radius, px. */
export interface FogHole {
  sx: number;
  sy: number;
  sr: number;
}

/**
 * Extra bake margin (px) beyond camera lead: shake headroom (step 11) + slack.
 * Exported so render/shake.ts can clamp its peak magnitude to the same budget
 * — the fog overlay must never expose a screen edge, however hard the hit.
 */
export const EXTRA_MARGIN_PX = 64;

export class Fog {
  private readonly sprite: Sprite;
  /** Inverse mask that punches star-shell lit-zone holes in the fog sprite —
   *  its filled circles become the CLEARED regions (setMask inverse). Empty when
   *  no owned zone is active, in which case the mask is detached so the fog
   *  renders normally everywhere. Screen-space sibling of the fog sprite. */
  private readonly holeMask = new Graphics();
  private holesActive = false;
  /** Effective sight radius (u) the hole is baked at — swapped by the
   *  sightRange upgrade via setSightRange(); base = CONFIG.vision.sight. */
  private sightRange: number = CONFIG.vision.sight;

  constructor(layer: Container) {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5); // hole is baked at the texture center
    layer.addChild(this.sprite);
    layer.addChild(this.holeMask); // in the scene graph so its transform resolves
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

  /**
   * Redraw the owned-lit-zone fog holes (Story 1.7). Each `FogHole` is a
   * SCREEN-space circle (its radius already fade-scaled by the caller) that the
   * inverse mask clears from the fog. With no holes the mask is detached so the
   * fog renders normally — an empty inverse mask is avoided as an edge case.
   * Enemy zones are never passed here (fog stays over them — marker only).
   */
  updateHoles(holes: readonly FogHole[]): void {
    const g = this.holeMask;
    g.clear();
    for (const h of holes) g.circle(h.sx, h.sy, h.sr).fill({ color: CLIENT_CONFIG.colors.white, alpha: 1 });
    const want = holes.length > 0;
    if (want !== this.holesActive) {
      this.sprite.setMask(want ? { mask: g, inverse: true } : { mask: null });
      this.holesActive = want;
    }
  }

  /** Hide/show the whole overlay (hidden while spectating — spec frames are unfogged). */
  setVisible(visible: boolean): void {
    this.sprite.visible = visible;
  }
}
