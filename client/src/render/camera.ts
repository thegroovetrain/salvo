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

/** Spectator zoom-out bounds: the MANUAL (wheel) zoomFactor is clamped to
 *  [MIN, MAX]. Ratified by epic-2 amendment 8 and DELIBERATELY not moved by
 *  Story 5.3: epic-5 amendment 25 gives the reveal its OWN framing mode that is
 *  exempt from this clamp rather than lowering the floor, because a ~0.27 floor
 *  would hand every spectator a permanent whole-map view — a different feature.
 *  (Eric: *"Reveal gets its own framing, we might revisit the clamp later."*) */
export const SPECTATE_ZOOM_MIN = 0.5;
export const SPECTATE_ZOOM_MAX = 1;

/**
 * How close to the reveal target counts as ARRIVED. An exponential approach
 * never exactly lands, and a factor that keeps twitching in its sixth decimal
 * forever would re-trip every zoom-keyed invalidation downstream (the charted
 * terrain layer re-tessellates on a zoom change, CLIENT_CONFIG.terrain
 * .redrawZoomFrac) for motion no one can see.
 */
const REVEAL_SETTLE_EPS = 1e-4;

/**
 * THE REVEAL FRAMING FACTOR (Story 5.3, epic-5 amendment 25) — the zoomFactor
 * that frames the WHOLE OCEAN, for the omniscient reveal at your own founder.
 *
 * DERIVED, NEVER A LITERAL. `baseZoom` fits the radar DIAMETER (2 × radarRange)
 * to the screen's short axis; the map is 2 × mapRadius across. So the factor
 * that swaps one fit for the other is (2 × radarRange) / (2 × mapRadius ×
 * margin) — the twos cancel. At the shipped radar 660u and map radius 2400u
 * that is ~0.275 at margin 1, well under SPECTATE_ZOOM_MIN, which is exactly
 * why amendment 25 exempts this mode from that clamp.
 *
 * Both inputs are already derived quantities (the camera's live radarRange,
 * which follows a radarRange upgrade; and the Game's mapRadius, itself derived
 * from shared CONFIG.map), so a map-size or sensor retune moves the reveal with
 * it. Story 6.2 makes map sizing roster-dynamic — this must not need touching
 * then.
 *
 * `margin` (> 1) is breathing room: it fits a slightly LARGER disc than the map
 * so the ocean's edge is not flush with the short axis.
 *
 * A degenerate input returns 1 (the plain base framing) rather than a
 * NaN/Infinity factor, which would permanently poison the composed zoom.
 */
export function revealZoomFactor(radarRange: number, mapRadius: number, margin: number): number {
  const fit = mapRadius * margin;
  if (!Number.isFinite(radarRange) || radarRange <= 0) return 1;
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  return radarRange / fit;
}

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
  /** Live reveal framing target (Story 5.3), or null when the mode is off.
   *  While non-null the zoom factor is animated toward it by tickZoom() and is
   *  EXEMPT from the spectate clamp (amendment 25). */
  private revealTargetValue: number | null = null;
  /** Exponential approach rate (1/s) for the reveal, handed in at kickoff so
   *  this module keeps its zero-config-imports purity (same reason
   *  USER_ZOOM_MIN/MAX are mirrored here rather than imported). */
  private revealRateValue = 0;

  constructor(private readonly opts: CameraOptions) {}

  /** Pixels per world unit: viewport-derived base × the spectator zoom factor
   *  × the alive user-zoom factor. The two factors never overlap in practice —
   *  userZoom is reset to 1 on spectate entry and zoomFactor is 1 while alive. */
  get zoom(): number {
    return this.baseZoom * this.zoomFactorValue * this.userZoomValue;
  }

  /** Spectator zoom-out multiplier, 1 (normal) down to SPECTATE_ZOOM_MIN —
   *  or BELOW it while the reveal framing owns the camera (amendment 25). */
  get zoomFactor(): number {
    return this.zoomFactorValue;
  }

  /**
   * Set the spectator zoom factor, clamped to [0.5, 1]. Spectators only.
   *
   * This is the MANUAL (wheel) path, and taking manual control RELEASES the
   * reveal framing — after which the clamp governs again, exactly as it always
   * has. THE RESULTING POP IS LEDGERED AND ACCEPTED (amendment 25): the reveal
   * is the ENTRY state at ~0.275×, so the first wheel notch jumps into
   * [0.5, 1.0] and the view roughly doubles in scale. Eric anticipated it in
   * the same breath he ruled the mode in (*"we might revisit the clamp
   * later"*), so it is recorded rather than engineered around — do not add an
   * easing bridge here without a ruling.
   */
  setZoomFactor(f: number): void {
    this.clearRevealTarget();
    this.zoomFactorValue = Math.min(SPECTATE_ZOOM_MAX, Math.max(SPECTATE_ZOOM_MIN, f));
  }

  /** Back to normal zoom (respawn / rejoin) — and out of the reveal framing:
   *  a new life is a hard boundary, same as the rest of the spectate teardown. */
  resetZoomFactor(): void {
    this.clearRevealTarget();
    this.zoomFactorValue = 1;
  }

  /** Whether the reveal framing currently owns the zoom factor. */
  get revealing(): boolean {
    return this.revealTargetValue !== null;
  }

  /**
   * Enter the REVEAL framing (Story 5.3): pull back until the whole ocean is in
   * frame. The factor is computed from the camera's OWN live radarRange, so a
   * radarRange upgrade or a map-size retune moves the framing with it and no
   * caller has to re-derive anything. Feed `margin` and `rate` from
   * CLIENT_CONFIG.reveal (this module imports no config by design).
   */
  beginReveal(mapRadius: number, margin: number, rate: number): void {
    this.setRevealTarget(revealZoomFactor(this.opts.radarRange, mapRadius, margin), rate);
  }

  /**
   * The primitive under beginReveal(): animate the zoom factor toward `factor`
   * at `rate` (1/s), EXEMPT from the spectate clamp. Nothing moves until
   * tickZoom() runs, which is what makes the motion:off snap land on the first
   * rendered frame rather than at kickoff.
   *
   * A non-finite or non-positive target/rate is IGNORED (the camera keeps
   * whatever framing it had): a poisoned factor would take the composed zoom
   * with it forever, same hazard setUserZoom() guards against.
   */
  setRevealTarget(factor: number, rate: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (!Number.isFinite(rate) || rate <= 0) return;
    this.revealTargetValue = factor;
    this.revealRateValue = rate;
  }

  /** Leave the reveal framing, keeping whatever factor is currently reached.
   *  Called by every MANUAL camera action (wheel zoom, free pan) — see the
   *  ledgered pop on setZoomFactor(). */
  clearRevealTarget(): void {
    this.revealTargetValue = null;
    this.revealRateValue = 0;
  }

  /**
   * Advance the REVEAL zoom animation by `dtMs` — the game's first animated
   * zoom (every other zoom in the client is instantaneous; only the camera
   * CENTRE has ever been smoothed). Exponential approach at the kickoff rate,
   * the same expDecay the follow smoother uses, so the module has one easing
   * vocabulary. A no-op while the reveal mode is off.
   *
   * MOTION SETTING (amendment 26, which closed UX open question #25 as NOT
   * EXEMPT): `motionScale` is the level's intensity multiplier —
   * motionIntensity() → {full: 1, reduced: 0.5, off: 0} — passed IN rather than
   * read from settings/store.js, which would be this module's first non-math
   * import. It scales the DURATION, never the destination: rate = base /
   * scale, so `reduced` covers the same travel in half the time and `off`
   * SNAPS to the identical framing on the first frame. That is the mechanical
   * form of the setting's own standing law (settings/store.ts:17-18, *"off
   * removes motion, never information"*) — an accessibility setting must never
   * cost a player the content, only the travel.
   */
  tickZoom(dtMs: number, motionScale: number): void {
    const target = this.revealTargetValue;
    if (target === null) return;
    // motion: off (or any degenerate scale) — arrive, do not travel.
    if (!Number.isFinite(motionScale) || motionScale <= 0) {
      this.zoomFactorValue = target;
      return;
    }
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) / 1000 : 0;
    const next = expDecay(this.zoomFactorValue, target, this.revealRateValue / motionScale, dt);
    this.zoomFactorValue = Math.abs(next - target) < REVEAL_SETTLE_EPS ? target : next;
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
   * THE WORLD RECTANGLE CURRENTLY ON SCREEN: the camera centre plus half-extents
   * in world units (screen px ÷ 2 ÷ zoom). Composed from the live `zoom`, so it
   * answers correctly under the base radar fit, a spectator zoom-out and an
   * alive user zoom alike.
   *
   * Its consumer is the radar heatmap buffer (render/radar.ts, amendment 96),
   * which is sized and centred on this rect and on nothing else. SHAKE IS
   * DELIBERATELY EXCLUDED: it is a few screen pixels of transient offset, the
   * buffer carries whole cells of slack past this rect, and folding a jittering
   * term into a buffer extent would churn allocations every frame for something
   * no one can see.
   */
  get worldView(): { x: number; y: number; halfW: number; halfH: number } {
    const z = this.zoom;
    return {
      x: this.center.x,
      y: this.center.y,
      halfW: this.viewW / 2 / z,
      halfH: this.viewH / 2 / z,
    };
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

  /** Nudge the camera center by a world-space delta (spectator free pan).
   *  The OTHER manual camera action, so it releases the reveal framing too
   *  (amendment 25): once the player has taken the camera, the normal clamped
   *  spectate path owns it. The factor itself is left where the animation had
   *  reached — a pan is not a zoom, so nothing jumps until the wheel is used. */
  pan(dx: number, dy: number): void {
    this.clearRevealTarget();
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
