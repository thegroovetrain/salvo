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
  /** Radar range (u) that must fit the screen's short axis at this zoom. */
  radarRange: number;
  /** Exponential follow rate (1/s). */
  followRate: number;
  /** Look-ahead time (s): lead distance = |speed| * leadSeconds, capped. */
  leadSeconds: number;
  /** Maximum lead distance (u). */
  leadMax: number;
}

export class Camera {
  /** World-space point the camera is centered on. */
  readonly center: Point = { x: 0, y: 0 };
  /** Screen-space shake offset (px), added on top of the transform. */
  readonly shake: Point = { x: 0, y: 0 };
  /** Pixels per world unit. */
  zoom = 1;

  private viewW = 1;
  private viewH = 1;

  constructor(private readonly opts: CameraOptions) {}

  /** Screen-space center (px). */
  get screenCenter(): Point {
    return { x: this.viewW / 2, y: this.viewH / 2 };
  }

  /**
   * Set the viewport size (px) and recompute zoom so the full radar diameter
   * (2 * radarRange) fits the screen's short axis. Call on init and resize.
   */
  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    const shortAxis = Math.min(width, height);
    this.zoom = shortAxis / (2 * this.opts.radarRange);
  }

  /** Jump the camera center directly to a point (no smoothing). */
  snapTo(p: Point): void {
    this.center.x = p.x;
    this.center.y = p.y;
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
