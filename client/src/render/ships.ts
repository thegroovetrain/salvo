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
import { motionIntensity, settings } from '../settings/store.js';

const C = CLIENT_CONFIG.colors;

/** The full 20-hue Regatta wheel (bright outline / darker fill), wheel order. */
const REGATTA_OUTLINES: readonly number[] = REGATTA_HUES.map((n) => C.players[n]);
const REGATTA_FILLS: readonly number[] = REGATTA_HUES.map((n) => C.playerFills[n]);

/** The eight colorblind-assist families (config key order IS family order). */
const CVD_OUTLINES: readonly number[] = Object.values(C.cvd);
const CVD_FILLS: readonly number[] = Object.values(C.cvdFills);

/**
 * Pure: the assist FAMILY index a Regatta wheel index collapses onto
 * (amendment 18). Modulo keeps the 20 wheel indices evenly spread over the 8
 * families — adjacent wheel entries (which are adjacent HUES, the pairs the
 * assist exists to separate) always land on different families.
 */
export function cvdFamilyIndex(wheelIndex: number, families = CVD_OUTLINES.length): number {
  return ((wheelIndex % families) + families) % families;
}

/**
 * Bright outline hue by Regatta wheel index. LIVE binding: `setColorblindAssist`
 * swaps the whole table at this ONE chokepoint, and every consumer (hulls,
 * nameplates, wake, kill feed, ordnance tint) reads through it, so the assist
 * needs no per-consumer wiring. ESM live bindings mean importers see the swap.
 */
export let PLAYER_HUES: readonly number[] = REGATTA_OUTLINES;
/** Darker interior fill by Regatta wheel index — swapped with PLAYER_HUES. */
export let PLAYER_FILLS: readonly number[] = REGATTA_FILLS;

/** Bumped every time the hue tables are swapped, so latched consumers (own hull
 *  color, contact styles, nameplates) know to re-resolve. */
let revision = 0;
let assistOn = false;

/** The current hue-table revision (see `revision` above). */
export function hueRevision(): number {
  return revision;
}

/** Is the colorblind-assist remap currently applied? */
export function colorblindAssist(): boolean {
  return assistOn;
}

/**
 * THE colorblind-assist chokepoint: project the 20-hue wheel onto the eight
 * separated families (on) or restore the ratified Regatta wheel (off). Cheap
 * and idempotent — a no-op call leaves the revision untouched.
 */
export function setColorblindAssist(on: boolean): void {
  if (on === assistOn) return;
  assistOn = on;
  PLAYER_HUES = on ? REGATTA_OUTLINES.map((_, i) => CVD_OUTLINES[cvdFamilyIndex(i)]) : REGATTA_OUTLINES;
  PLAYER_FILLS = on ? REGATTA_FILLS.map((_, i) => CVD_FILLS[cvdFamilyIndex(i)]) : REGATTA_FILLS;
  revision += 1;
}

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

/** Pure: per-channel linear blend of two packed 0xRRGGBB colors (t=0 → a, 1 → b). */
function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number): number =>
    Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t) << shift;
  return ch(16) | ch(8) | ch(0);
}

/** A hull's rendered tint + alpha for one frame. */
export interface HullLook {
  tint: number;
  alpha: number;
}

/**
 * Pure: the hull look for a frame. `flash` is the hit-flash INTENSITY in [0,1],
 * NOT a duration — Story 2.3 / amendment: `reduced` motion halves the flash's
 * STRENGTH while keeping its full duration (a shorter flash is easier to MISS,
 * which is the opposite of an accessibility affordance), and `off` passes 0 so
 * no flash is applied at all. The hp bar, damage markers and kill feed carry the
 * information statically at every level.
 */
export function hullLook(flash: number, downed: boolean, fade: number): HullLook {
  const baseTint = downed ? CLIENT_CONFIG.ship.sunkTint : C.white;
  const baseAlpha = downed ? 0.4 : 1;
  const t = Math.min(1, Math.max(0, flash));
  return {
    tint: t <= 0 ? baseTint : mixColor(baseTint, C.white, t),
    alpha: (baseAlpha + (1 - baseAlpha) * t) * fade,
  };
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
  /** Hit-flash INTENSITY in [0,1] for the window ending at flashUntil (the
   *  motion level's multiplier — `reduced` = a half-strength flash, full length). */
  private flashAmount = 1;
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

  /**
   * Brief bright flash (took a hit). MOTION-GATED (Story 2.3): `reduced` halves
   * the flash's INTENSITY — never its duration, which stays the full flashMs so
   * the cue is just as easy to CATCH — and `off` suppresses it entirely. The hp
   * bar, damage markers and kill feed still carry the information statically.
   */
  flash(): void {
    const amount = motionIntensity(settings.current.motion);
    if (amount <= 0) return;
    this.flashAmount = amount;
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
    const flash = performance.now() < this.flashUntil ? this.flashAmount : 0;
    const look = hullLook(flash, this.downed, this.fade);
    this.gfx.tint = look.tint;
    this.gfx.alpha = look.alpha;
  }

  destroy(): void {
    this.gfx.destroy();
  }
}
