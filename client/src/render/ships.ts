// Procedural ship hull view, now driven by the SHARED silhouette polygon
// (sim/silhouette.ts — the silhouette IS the hitbox). One code path keyed by
// hull id: the three pickable classes render their ratified board silhouettes;
// drone hull ids render the legacy chevron (exactly what hullSilhouette returns
// for a drone id).
//
// Story 1.12 (Regatta Hoist): every combatant hull — own AND contact — draws as
// a 1.5px stroke in the pilot's BRIGHT personal hue over a SOLID interior in that
// hue's darker ~45%-value fill. Drones (roster sentinel 255) wear the drone greys.
// A roster-miss / pre-roster hull falls back to an amber hollow outline (the old
// contact look). The style is per-view and swappable (setColors) so the own hull
// can boot on the fallback and recolor the instant its roster hue is known.
//
// The render polygon is the shared local-frame silhouette VERBATIM (bow at +x,
// origin-centered, world units) — no independent geometry, so what you see is
// the collision/hit-test hull. The view is added to a camera-transformed layer,
// so world heading == sprite rotation (no y-flip — see camera.ts).

import { Graphics } from 'pixi.js';
import { REGATTA_HUES, hullSilhouette, type HullId, type Vec2 } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';

const C = CLIENT_CONFIG.colors;

/** Bright outline hue by Regatta wheel index (REGATTA_HUES order). */
export const PLAYER_HUES: readonly number[] = REGATTA_HUES.map((n) => C.players[n]);
/** Darker interior fill by Regatta wheel index (REGATTA_HUES order). */
export const PLAYER_FILLS: readonly number[] = REGATTA_HUES.map((n) => C.playerFills[n]);

export interface ShipStyle {
  /** Hull outline (stroke) color. */
  stroke: number;
  /** Solid interior fill color, or null for a hollow outline (the fallback). */
  fill: number | null;
}

/** Roster-miss / pre-roster fallback: amber hollow outline. */
export const FALLBACK_STYLE: ShipStyle = { stroke: C.amber, fill: null };
/** Drone hull style (roster sentinel 255): grey outline + solid grey interior. */
export const DRONE_STYLE: ShipStyle = { stroke: C.droneOutline, fill: C.droneFill };

/**
 * Personal-hue style for a Regatta wheel index — bright stroke + darker fill —
 * or the amber-hollow fallback when the index is null (roster miss / not yet
 * assigned) or out of range. Drones never route here (they use DRONE_STYLE via
 * their hull id).
 */
export function hullStyle(index: number | null): ShipStyle {
  if (index === null || index < 0 || index >= PLAYER_HUES.length) return FALLBACK_STYLE;
  return { stroke: PLAYER_HUES[index], fill: PLAYER_FILLS[index] };
}

/** Style for a contact, given its hull id and resolved roster hue index. A drone
 *  hull id wins (greys); otherwise the personal-hue style (or fallback). */
export function contactStyle(hullId: HullId, index: number | null): ShipStyle {
  return isDroneHull(hullId) ? DRONE_STYLE : hullStyle(index);
}

/** True for the three drone hull ids (which never carry a personal hue). */
export function isDroneHull(hullId: HullId): boolean {
  return hullId === 'droneSmall' || hullId === 'droneMedium' || hullId === 'droneLarge';
}

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
  private style: ShipStyle;

  constructor(style: ShipStyle, hullId: HullId = 'torpedoBoat') {
    this.gfx = new Graphics();
    this.style = style;
    this.hullId = hullId;
    this.draw();
  }

  /** Re-draw for a new hull id (own ship only; contacts know their hull at
   *  creation). Preserves position/rotation/tint applied by update(). */
  setHullId(hullId: HullId): void {
    this.hullId = hullId;
    this.draw();
  }

  /** Swap the hull colors (Story 1.12): stroke = bright personal hue, fill =
   *  its darker interior (null = hollow fallback). Redraws in place. */
  setColors(stroke: number, fill: number | null): void {
    this.style = { stroke, fill };
    this.draw();
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    tracePolygon(g, hullSilhouette(this.hullId));
    // Solid personal-hue interior (the darker ~45%-value fill) under the bright
    // outline; a null fill leaves a hollow outline (the roster-miss fallback).
    if (this.style.fill !== null) g.fill({ color: this.style.fill, alpha: 1 });
    g.stroke({ width: 1.5, color: this.style.stroke, alpha: 1 });
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
