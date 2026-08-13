// Screen-space fog overlay. The pre-baked fog texture (dark fill + feathered
// sight hole at its center) is positioned every frame so the hole tracks the
// own ship's SCREEN position; it is re-baked whenever the baked hole radius
// goes stale — on resize, and (Story 2.1) on an alive USER ZOOM change, since
// the hole radius is derived from the composed zoom. main.ts debounces both to
// the trailing edge of a burst. Fog is cosmetic and MOSTLY
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
// Z-order (verified against stage.ts): worldRoot (shells/wake/mines, fogged) →
// fogSprite (this) → chartRoot (islands/blips/HULLS/sweep, fog-immune) → hudRoot.
// HULLS ARE NO LONGER UNDER THIS OVERLAY (this cycle): they moved into chartRoot
// so radar paint stops covering the ships it represents, which means the sight-
// boundary softening this composite used to give them for free is now applied
// per hull by `hullSightSoftness` below — same feather, same numbers, different
// channel. Thin Pixi adapter (not unit tested); the hole participation + fade
// math it consumes are the pure functions in render/litZones.ts.

import { Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { FOG_FILL_ALPHA, HOLE_FEATHER_START, bakeFogTexture } from './textures.js';

/**
 * Pure: the world-space radius (u) the fog's sight hole is baked at — the
 * effective sight range, cut by the ratified DAZZLE factor while an enemy DAZZLE
 * BURST holds this ship (Story 2.8). It is the SAME factor the server's
 * perception applies to a dazzled observer's sight (CONFIG.starShells —
 * one source), which is the whole point: an un-shrunk hole would draw clear
 * water where the server reveals nothing, i.e. the fog circle would LIE.
 */
export function fogHoleRadiusU(sightRange: number, dazzled: boolean): number {
  return dazzled ? sightRange * CONFIG.starShells.dazzleSightFactor : sightRange;
}

/**
 * Pure: the alpha multiplier a HULL wears at `distU` from own hull, mirroring
 * the softening the fog composite used to give it (this cycle).
 *
 * WHY IT EXISTS. Hulls now render ABOVE the fog (render/stage.ts), so radar
 * paint can no longer cover the ship it represents. What that lifted them out of
 * is the fog texture's feathered hole: a contact used to dim smoothly as it
 * approached the edge of the bubble and then hand off to its blip. Above the fog
 * it would instead read at FULL strength right to the boundary and then vanish,
 * which is a harder edge than the one the fog draws.
 *
 * IT IS THE FOG'S OWN CURVE, NOT A NEW ONE. Under the composite a hull's
 * remaining contribution is `1 − fogAlpha × feather`, where `feather` ramps 0 → 1
 * across `HOLE_FEATHER_START × sight` → `sight` — so this reproduces exactly
 * that, from exactly those constants (render/textures.ts, one source). The fog
 * fill is near-black (`fogBase` = a hair above void), so the alpha term is the
 * whole of the effect and the reproduction is faithful rather than approximate:
 * 1 through the clear centre, 0.15 at the rim.
 *
 * IT NEVER REACHES 0. The 150ms sight fade (render/fade.ts) is what takes a hull
 * off the water when the server stops sending it; this is a softening, and a
 * softening that hit zero would delete a contact the observer legitimately holds
 * — including one revealed beyond the bubble by an owned star shell, which the
 * caller exempts outright (main.ts `hullSoftnessFor`). A non-finite input reads
 * as 1: fail toward the hull being VISIBLE, the same direction every other
 * unwired path in the render layer fails.
 */
export function hullSightSoftness(distU: number, sightU: number): number {
  if (!Number.isFinite(distU) || !(sightU > 0) || !Number.isFinite(sightU)) return 1;
  const start = sightU * HOLE_FEATHER_START;
  if (distU <= start) return 1;
  const feather = distU >= sightU ? 1 : (distU - start) / (sightU - start);
  return 1 - FOG_FILL_ALPHA * feather;
}

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
  /** Effective sight radius (u) the hole is baked at — swapped by an intel
   *  (truesight) boon via setSightRange(); base = CONFIG.vision.sight. */
  private sightRange: number = CONFIG.vision.sight;
  /** Is the own ship inside an enemy DAZZLE BURST zone right now (Story 2.8 —
   *  the victim-private you.dazzledUntil)? While true the baked hole shrinks by
   *  CONFIG.starShells.dazzleSightFactor, because the SERVER is already
   *  perceiving this ship that way: an un-shrunk hole would draw clear water
   *  where the server reveals nothing, i.e. the fog circle would lie. */
  private dazzled = false;

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

  /**
   * Adopt the DAZZLE state (Story 2.8). Returns TRUE when the baked hole went
   * stale (the state actually flipped) so the caller can rebake on exactly the
   * two frames per dazzle event that need it — never per frame. Deliberately
   * un-animated: the hole simply IS smaller while the dazzle holds, with no
   * flash, throb or transition (motion/accessibility — the information is
   * carried by the radius, not by movement).
   */
  setDazzled(dazzled: boolean): boolean {
    if (dazzled === this.dazzled) return false;
    this.dazzled = dazzled;
    return true;
  }

  /** The radius (u) this instance's hole is baked at (the pure rule above). */
  private holeRadiusU(): number {
    return fogHoleRadiusU(this.sightRange, this.dazzled);
  }

  /** Is the dazzle currently held? Test/observation seam. */
  get isDazzled(): boolean {
    return this.dazzled;
  }

  /** (Re)bake for a viewport + zoom. Call at boot, on every resize, and after
   *  a sight/radar (zoom) stat change. */
  rebake(viewW: number, viewH: number, zoom: number): void {
    const old = this.sprite.texture;
    const margin = CLIENT_CONFIG.camera.leadMax * zoom + EXTRA_MARGIN_PX;
    this.sprite.texture = bakeFogTexture(viewW, viewH, this.holeRadiusU() * zoom, margin);
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
