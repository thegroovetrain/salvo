// Pure-math camera. Owns the world<->screen mapping, a fixed zoom derived from
// the radar range, a follow-with-lead target smoother, and a shake offset hook.
// No Pixi import: render code reads `zoom`, `center`, `shake`, `screenCenter`
// and applies the transform to the world/chart containers. Fully unit-testable.

import { expDecay } from '../util/math.js';

/** Anything with a position + kinematics the camera can follow. */
export interface Followable {
  x: number;
  y: number;
  heading: number; // rad
  speed: number; // u/s (signed)
}

export interface Point {
  x: number;
  y: number;
}

export interface CameraOptions {
  /** Radar range (u) that must fit the screen's short axis at this zoom.
   *  Upgradeable at runtime via setRadarRange() (Stage D radarRange stacks). */
  radarRange: number;
  /** Exponential follow rate (1/s). */
  followRate: number;
  /** Look-ahead time (s): lead distance = |speed| * leadSeconds, capped. */
  leadSeconds: number;
  /** Maximum lead distance (u). */
  leadMax: number;
}

/** Spectator zoom-out bounds: zoomFactor is clamped to [MIN, MAX]. */
export const SPECTATE_ZOOM_MIN = 0.5;
export const SPECTATE_ZOOM_MAX = 1;

/** Alive user-zoom bounds (Story 2.1, Eric ruling 2026-07-24): the userZoom
 *  factor over the base radar-fit framing is clamped to [MIN, MAX]. Values
 *  mirror CLIENT_CONFIG.zoom.min/max (authored there; pinned here so this
 *  module stays pure math with zero imports beyond util/math). */
export const USER_ZOOM_MIN = 0.5;
export const USER_ZOOM_MAX = 1.5;

/**
 * THE alive-only gate for user zoom (X/Z + wheel), pure so it is testable apart
 * from main.ts's bootstrap glue. Zoom applies ONLY to a genuinely-alive captain:
 * spectators use the separate spectate zoom-out path, and a MISSING own ship
 * (`alive` undefined — pre-join, pre-first-frame, between lives) is treated as
 * NOT alive. Checking `alive === false` instead would let zoom (and the fog
 * re-bake it schedules) run before the first frame ever arrives.
 */
export function canUserZoom(spectating: boolean, alive: boolean | undefined): boolean {
  return !spectating && alive === true;
}

export class Camera {
  /** World-space point the camera is centered on. */
  readonly center: Point = { x: 0, y: 0 };
  /** Screen-space shake offset (px), added on top of the transform. */
  readonly shake: Point = { x: 0, y: 0 };

  private baseZoom = 1;
  private zoomFactorValue = 1;
  private userZoomValue = 1;
  private viewW = 1;
  private viewH = 1;

  constructor(private readonly opts: CameraOptions) {}

  /** Pixels per world unit: viewport-derived base × the spectator zoom factor
   *  × the alive user-zoom factor. The two factors never overlap in practice —
   *  userZoom is reset to 1 on spectate entry and zoomFactor is 1 while alive. */
  get zoom(): number {
    return this.baseZoom * this.zoomFactorValue * this.userZoomValue;
  }

  /** Spectator zoom-out multiplier, 1 (normal) down to SPECTATE_ZOOM_MIN. */
  get zoomFactor(): number {
    return this.zoomFactorValue;
  }

  /** Set the spectator zoom factor, clamped to [0.5, 1]. Spectators only. */
  setZoomFactor(f: number): void {
    this.zoomFactorValue = Math.min(SPECTATE_ZOOM_MAX, Math.max(SPECTATE_ZOOM_MIN, f));
  }

  /** Back to normal zoom (respawn / rejoin). */
  resetZoomFactor(): void {
    this.zoomFactorValue = 1;
  }

  /** Alive user-zoom factor over the base framing, clamped [0.5, 1.5]. */
  get userZoom(): number {
    return this.userZoomValue;
  }

  /** Set the alive user-zoom factor (X/Z keys + wheel), clamped [0.5, 1.5].
   *  Callers that change the zoom must re-bake the fog (main.ts debounces).
   *  A non-finite input is IGNORED: Math.min/max pass NaN straight through, and
   *  a NaN factor would permanently poison the composed zoom (every later
   *  clamp of NaN is NaN) — a rogue wheel deltaY must not brick the camera. */
  setUserZoom(f: number): void {
    if (!Number.isFinite(f)) return;
    this.userZoomValue = Math.min(USER_ZOOM_MAX, Math.max(USER_ZOOM_MIN, f));
  }

  /** Back to the base framing (spectate entry — the spectate factor owns the
   *  zoom there; the spectate code path itself is untouched by user zoom). */
  resetUserZoom(): void {
    this.userZoomValue = 1;
  }

  /** Screen-space center (px). */
  get screenCenter(): Point {
    return { x: this.viewW / 2, y: this.viewH / 2 };
  }

  /**
   * Set the viewport size (px) and recompute the base zoom so the full radar
   * diameter (2 * radarRange) fits the screen's short axis. Call on init and
   * resize.
   */
  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.recomputeBaseZoom();
  }

  /**
   * Adopt a new (effective) radar range and recompute the base zoom against the
   * current viewport — a radarRange upgrade zooms the camera out so the full
   * radar diameter keeps fitting the short axis ("your world grows"). Callers
   * must re-bake the fog (fog.rebake) after this, same as the resize path.
   */
  setRadarRange(radarRange: number): void {
    this.opts.radarRange = radarRange;
    this.recomputeBaseZoom();
  }

  private recomputeBaseZoom(): void {
    const shortAxis = Math.min(this.viewW, this.viewH);
    this.baseZoom = shortAxis / (2 * this.opts.radarRange);
  }

  /** Jump the camera center directly to a point (no smoothing). */
  snapTo(p: Point): void {
    this.center.x = p.x;
    this.center.y = p.y;
  }

  /** Nudge the camera center by a world-space delta (spectator free pan). */
  pan(dx: number, dy: number): void {
    this.center.x += dx;
    this.center.y += dy;
  }

  /** World point -> screen point (px), including shake. */
  worldToScreen(p: Point): Point {
    const c = this.screenCenter;
    return {
      x: (p.x - this.center.x) * this.zoom + c.x + this.shake.x,
      y: (p.y - this.center.y) * this.zoom + c.y + this.shake.y,
    };
  }

  /** Screen point (px) -> world point (inverse of worldToScreen). */
  screenToWorld(p: Point): Point {
    const c = this.screenCenter;
    return {
      x: (p.x - c.x - this.shake.x) / this.zoom + this.center.x,
      y: (p.y - c.y - this.shake.y) / this.zoom + this.center.y,
    };
  }

  /** Lead offset (world units) ahead of the ship along its travel direction. */
  private leadOffset(ship: Followable): Point {
    // velocity direction = heading, signed by speed (reverse leads astern)
    const dirX = Math.cos(ship.heading) * Math.sign(ship.speed);
    const dirY = Math.sin(ship.heading) * Math.sign(ship.speed);
    const mag = Math.min(Math.abs(ship.speed) * this.opts.leadSeconds, this.opts.leadMax);
    return { x: dirX * mag, y: dirY * mag };
  }

  /**
   * Advance the follow smoother by `dt` seconds toward the ship + its lead
   * offset. Deterministic given (dt, ship): exponential approach at followRate.
   */
  update(dt: number, ship: Followable): void {
    const lead = this.leadOffset(ship);
    const targetX = ship.x + lead.x;
    const targetY = ship.y + lead.y;
    this.center.x = expDecay(this.center.x, targetX, this.opts.followRate, dt);
    this.center.y = expDecay(this.center.y, targetY, this.opts.followRate, dt);
  }
}
