// Pure-math camera. Owns the world<->screen mapping, a zoom expressed as
// ABSOLUTE world spans across the viewport's short axis (Story 9.8, epic-9
// amendments 127/128 — never a factor over radar), a follow-with-lead target
// smoother, the centre slide toward the storm ring, and a shake offset hook.
// No Pixi import: render code reads `zoom`, `center`, `shake`, `screenCenter`
// and applies the transform to the world/chart containers. Fully unit-testable.

import { expDecay, clamp, clamp01, lerp } from '../util/math.js';

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
  /** World units across the screen's SHORT axis at the DEFAULT framing
   *  (CLIENT_CONFIG.zoom.defaultSpanU, ruling 127). `baseZoom` = shortAxis /
   *  this, and every zoom factor below is relative to it. */
  defaultSpanU: number;
  /** World units across the short axis at the zoom-IN limit
   *  (CLIENT_CONFIG.zoom.closeSpanU, ruling 127). */
  closeSpanU: number;
  /** Fit margin (> 1) of the ring-fit zoom-OUT limit: the live ring's diameter
   *  × this spans the short axis (CLIENT_CONFIG.reveal.mapFitMargin — the
   *  reveal's own border, so both whole-disc framings read alike). */
  ringFitMargin: number;
  /** Exponential follow rate (1/s). */
  followRate: number;
  /** Look-ahead time (s): lead distance = |speed| * leadSeconds, capped. */
  leadSeconds: number;
  /** Maximum lead distance (u). */
  leadMax: number;
  /** How far (u) inside every view edge the own hull point is held while the
   *  centre slides toward the ring (Story 9.8 review gate, F2 —
   *  CLIENT_CONFIG.camera.keepInViewPadU). Omitted = 0 (the hull point itself
   *  stays on screen). */
  keepInViewPadU?: number;
}

/**
 * How close to the reveal target counts as ARRIVED. An exponential approach
 * never exactly lands, and a factor that keeps twitching in its sixth decimal
 * forever would re-trip every zoom-keyed invalidation downstream (the charted
 * terrain layer re-tessellates on a zoom change, CLIENT_CONFIG.terrain
 * .redrawZoomFrac) for motion no one can see.
 */
const REVEAL_SETTLE_EPS = 1e-4;

/**
 * The zoom FACTOR (over the default framing) that shows `spanU` world units
 * across the short axis: defaultSpanU / spanU. The one conversion every
 * absolute framing in this module goes through. A degenerate input returns 1
 * (the plain default framing) rather than a NaN/Infinity factor, which would
 * permanently poison the composed zoom.
 */
export function spanFactor(defaultSpanU: number, spanU: number): number {
  if (!Number.isFinite(defaultSpanU) || defaultSpanU <= 0) return 1;
  if (!Number.isFinite(spanU) || spanU <= 0) return 1;
  return defaultSpanU / spanU;
}

/**
 * THE REVEAL FRAMING FACTOR (Story 5.3, epic-5 amendment 25) — the zoomFactor
 * that frames the WHOLE OCEAN, for the omniscient reveal at your own founder.
 *
 * ABSOLUTE SINCE STORY 9.8 (ruling 127): the reveal shows 2 × mapRadius ×
 * margin world units across the short axis — shortAxis / (2 × mapRadius ×
 * margin) px per u — written directly. As a factor over the default framing
 * that is defaultSpanU / (2 × mapRadius × margin), the same number the old
 * radar-diameter derivation gave while the default framing was 2 × 660 u.
 *
 * `margin` (> 1) is breathing room: it fits a slightly LARGER disc than the map
 * so the ocean's edge is not flush with the short axis. The map radius is the
 * Game's live, roster-dynamic one (Story 6.2), so no literal lives here. A
 * degenerate input returns 1 (the default framing), never NaN.
 */
export function revealZoomFactor(defaultSpanU: number, mapRadius: number, margin: number): number {
  return spanFactor(defaultSpanU, 2 * mapRadius * margin);
}

/**
 * THE RING-FIT SPAN (ruling 127): the live ring's diameter × the fit margin, in
 * world units across the short axis. NaN when the ring is unusable (non-finite
 * or negative radius, or a degenerate margin) — the caller then falls back to
 * the default framing. A radius of exactly 0 (the final ring closed onto its
 * point) is a legitimate span of 0; `userZoomLimits` holds the out limit at
 * the default framing for any fit under it, so r → 0 is continuous.
 */
export function ringFitSpanU(ringRadius: number, margin: number): number {
  if (!Number.isFinite(ringRadius) || ringRadius < 0) return NaN;
  if (!Number.isFinite(margin) || margin <= 0) return NaN;
  return 2 * ringRadius * margin;
}

/**
 * THE USER-ZOOM LIMITS as factors over the default framing (ruling 127):
 * `max` (zoomed fully IN) = defaultSpanU / closeSpanU; `min` (zoomed fully OUT)
 * = defaultSpanU / ringFitSpan.
 *
 * THE RING FIT IS A ZOOM-OUT LIMIT ONLY (Story 9.8 review gate, F3): `min` is
 * never above 1, so the default framing is always reachable. Once the live
 * ring's fitted span drops under the default framing (the final close), the
 * out limit simply stops AT the default framing — it never forces a captain
 * parked there in toward the close framing. A ring of radius 0 is the same
 * case (the out limit equals the default framing, never the close one). An
 * unusable ring (NaN span) falls back to the default framing too.
 */
export function userZoomLimits(
  defaultSpanU: number,
  closeSpanU: number,
  ringSpanU: number,
): { min: number; max: number } {
  const max = spanFactor(defaultSpanU, closeSpanU);
  const fit = Number.isNaN(ringSpanU) || ringSpanU <= 0 ? 1 : defaultSpanU / ringSpanU;
  return { min: Math.min(1, max, fit), max };
}

/**
 * THE CENTRE SLIDE (ruling 128): how far the camera centre has travelled from
 * the own ship toward the ring centre, 0..1. `spanU` is the CURRENT user span
 * across the short axis; at and inside the default framing t = 0 (the ship is
 * centred), at the ring-fit span t = 1 (the ring centre is). Linear in span
 * between them. A ring no wider than the default framing, or an unusable one,
 * never slides.
 */
export function centreSlideT(spanU: number, defaultSpanU: number, ringSpanU: number): number {
  const room = ringSpanU - defaultSpanU;
  if (!Number.isFinite(room) || room <= 0) return 0;
  if (!Number.isFinite(spanU)) return 0;
  return clamp01((spanU - defaultSpanU) / room);
}

/**
 * THE KEY / WHEEL ZOOM STEP (Story 9.8, ruling 127). MULTIPLICATIVE in the
 * factor: `amount` is the logarithmic step, so next = f × e^amount. The X/Z
 * keys pass ±keyStep (0.1), the wheel −deltaY × wheelRate (0.0008/unit).
 *
 * Why not today's additive step: the range now runs from the close framing
 * (1.5×) down to a ring fit near 0.2× on a big ocean, and a fixed +0.1 is a
 * ~10 % step at the default framing but a ~50 % jolt at the ring fit. A log
 * step is the same PERCEIVED step everywhere, and at today's framings it is
 * today's feel: around the default framing e^±0.1 = ×1.105 / ×0.905 against
 * the old ±0.1, and one 100-unit wheel notch e^−0.08 = ×0.923 against the old
 * −0.08. A non-finite amount returns the factor unchanged.
 */
export function stepZoom(factor: number, amount: number): number {
  if (!Number.isFinite(amount)) return factor;
  return factor * Math.exp(amount);
}

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

/** The world rectangle the screen shows this frame, shake included (see
 *  `Camera.screenWorldRect`) — what a masked layer's filter pass is clipped to
 *  (Story 9.8 perf gate: Pixi's mask filter does not clip to the viewport). */
export interface ScreenWorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Camera {
  /** World-space point the camera is centered on. */
  readonly center: Point = { x: 0, y: 0 };
  /** Screen-space shake offset (px), added on top of the transform. */
  readonly shake: Point = { x: 0, y: 0 };

  /** The smoothed ship-follow point (ship + lead, eased at followRate). The
   *  centre is this point slid toward the ring centre (ruling 128); follow and
   *  lead apply to this term ONLY. */
  private readonly follow: Point = { x: 0, y: 0 };
  private baseZoom = 1;
  private zoomFactorValue = 1;
  private userZoomValue = 1;
  private viewW = 1;
  private viewH = 1;
  /** The live storm ring (ruling 127/128), fed every alive frame by setRing().
   *  NaN span until the first feed = no ring known: the zoom-out limit is the
   *  default framing and nothing slides. */
  private readonly ring: Point = { x: 0, y: 0 };
  private ringSpanValue = NaN;
  /** Live reveal framing target (Story 5.3), or null when the mode is off.
   *  While non-null the zoom factor is animated toward it by tickZoom() and is
   *  EXEMPT from the spectate clamp (amendment 25). */
  private revealTargetValue: number | null = null;
  /** Exponential approach rate (1/s) for the reveal, handed in at kickoff so
   *  this module keeps its zero-config-imports purity. */
  private revealRateValue = 0;

  constructor(private readonly opts: CameraOptions) {}

  /** Pixels per world unit: viewport-derived base × the spectator zoom factor
   *  × the alive user-zoom factor. The two factors never overlap in practice —
   *  userZoom is reset to 1 on spectate entry and zoomFactor is 1 while alive. */
  get zoom(): number {
    return this.baseZoom * this.zoomFactorValue * this.userZoomValue;
  }

  /** Spectator zoom multiplier over the default framing — or BELOW its clamp
   *  while the reveal framing owns the camera (amendment 25). */
  get zoomFactor(): number {
    return this.zoomFactorValue;
  }

  /** The spectate clamp as factors over the default framing. SINCE ERIC'S
   *  2026-10-14 RULING ("The full zoom-out needs to apply to spectate mode, as
   *  well") it IS the alive range — the close framing in, the live ring fit
   *  out (never tighter than the default framing) — one derivation, so the two
   *  can never drift. The old fixed 2,640–1,320 u spectate spans are gone. */
  get spectateZoomLimits(): { min: number; max: number } {
    return this.userZoomLimits;
  }

  /**
   * Set the spectator zoom factor, clamped to the spectate limits (= the alive
   * limits, ruling 2026-10-14). Spectators only. A non-finite input is IGNORED (same NaN hazard as setUserZoom).
   *
   * This is the MANUAL (wheel) path, and taking manual control RELEASES the
   * reveal framing — after which the clamp governs again, exactly as it always
   * has. THE RESULTING POP IS LEDGERED AND ACCEPTED (amendment 25): the reveal
   * is the ENTRY state at the whole-map framing, so the first wheel notch jumps
   * into the clamp and the view roughly doubles in scale. Eric anticipated it in
   * the same breath he ruled the mode in (*"we might revisit the clamp
   * later"*), so it is recorded rather than engineered around — do not add an
   * easing bridge here without a ruling.
   */
  setZoomFactor(f: number): void {
    if (!Number.isFinite(f)) return;
    this.clearRevealTarget();
    const lim = this.spectateZoomLimits;
    this.zoomFactorValue = clamp(f, lim.min, lim.max);
  }

  /**
   * ZOOM AT THE CURSOR (spectators — Eric 2026-10-14: *"the zoom in/out should
   * be localized around my mouse cursor (since my ship has sunk/is otherwise
   * nonexistent)"*). Sets the spectator zoom factor exactly as setZoomFactor
   * does (clamped, reveal released, non-finite ignored), then moves the centre
   * so the world point that was under screen point (screenX, screenY) is still
   * under it: `worldToScreen(p)` is unchanged. A non-finite screen point
   * anchors at the screen centre (a plain zoom about the centre).
   *
   * The follow point moves with the centre, exactly as `pan` moves it, so a
   * spectator FOLLOWING a hull keeps the cursor anchor for this frame and the
   * eased follow then carries on from the new centre back toward its target.
   * The alive camera never calls this — its zoom stays own-ship-anchored.
   */
  zoomAbout(screenX: number, screenY: number, newZoom: number): void {
    const sc = this.screenCenter;
    const s = Number.isFinite(screenX) && Number.isFinite(screenY) ? { x: screenX, y: screenY } : sc;
    const p = this.screenToWorld(s);
    this.setZoomFactor(newZoom);
    const z = this.zoom;
    const dx = p.x - (s.x - sc.x - this.shake.x) / z - this.center.x;
    const dy = p.y - (s.y - sc.y - this.shake.y) / z - this.center.y;
    this.follow.x += dx;
    this.follow.y += dy;
    this.center.x += dx;
    this.center.y += dy;
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
   * frame — 2 × mapRadius × margin across the short axis (ruling 127, absolute).
   * Feed `margin` and `rate` from CLIENT_CONFIG.reveal (this module imports no
   * config by design).
   */
  beginReveal(mapRadius: number, margin: number, rate: number): void {
    this.setRevealTarget(revealZoomFactor(this.opts.defaultSpanU, mapRadius, margin), rate);
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

  /** Alive user-zoom factor over the default framing, within userZoomLimits. */
  get userZoom(): number {
    return this.userZoomValue;
  }

  /** The live alive-zoom limits (ruling 127): the close framing in, the live
   *  ring fit out (the default framing until a ring has been fed). */
  get userZoomLimits(): { min: number; max: number } {
    return userZoomLimits(this.opts.defaultSpanU, this.opts.closeSpanU, this.ringSpanValue);
  }

  /** The current ring-fit span (u across the short axis), NaN before a ring. */
  get ringSpanU(): number {
    return this.ringSpanValue;
  }

  /** The alive user span (u across the short axis) — defaultSpanU / userZoom. */
  get userSpanU(): number {
    return this.opts.defaultSpanU / this.userZoomValue;
  }

  /** This instant's centre slide toward the ring centre, 0..1 (ruling 128). */
  get slideT(): number {
    return centreSlideT(this.userSpanU, this.opts.defaultSpanU, this.ringSpanValue);
  }

  /** Set the alive user-zoom factor (X/Z keys + wheel), clamped to the live
   *  limits. Callers that change the zoom must re-bake the fog (main.ts
   *  debounces). A non-finite input is IGNORED: Math.min/max pass NaN straight
   *  through, and a NaN factor would permanently poison the composed zoom (every
   *  later clamp of NaN is NaN) — a rogue wheel deltaY must not brick the
   *  camera. */
  setUserZoom(f: number): void {
    if (!Number.isFinite(f)) return;
    const lim = this.userZoomLimits;
    this.userZoomValue = clamp(f, lim.min, lim.max);
  }

  /** Back to the default framing (spectate entry — the spectate factor owns the
   *  zoom there; the spectate code path itself is untouched by user zoom). Set
   *  RAW to 1: the alive limits re-clamp it on the next setRing() after a
   *  respawn, while spectate needs the composed zoom to be the pure spectate
   *  product. */
  resetUserZoom(): void {
    this.userZoomValue = 1;
  }

  /**
   * Feed the LIVE storm ring (centre + radius), every alive AND spectate frame
   * (ruling 127; spectate since Eric's 2026-10-14 ruling):
   * the zoom-out limit re-fits to it and the centre slide aims at its centre
   * (ruling 128). The current user zoom is re-clamped into the new limits, so a
   * captain sitting at the out limit STAYS fitted as the ring closes (the limit
   * only ever tightens within a match). Returns whether the user zoom moved, so
   * the caller can decide on a fog re-bake (with its own hysteresis).
   */
  setRing(cx: number, cy: number, r: number): boolean {
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      this.ring.x = cx;
      this.ring.y = cy;
    }
    this.ringSpanValue = ringFitSpanU(r, this.opts.ringFitMargin);
    const before = this.userZoomValue;
    const lim = this.userZoomLimits;
    this.userZoomValue = clamp(before, lim.min, lim.max);
    // THE SPECTATE FACTOR RIDES THE SAME FEED (Eric 2026-10-14): a spectator at
    // the out limit stays fitted as the ring closes. Never while the reveal
    // framing owns the factor (amendment 25: it is exempt from the clamp), and
    // a no-op while alive (the factor is 1 there, always inside the limits).
    const beforeF = this.zoomFactorValue;
    if (!this.revealing) this.zoomFactorValue = clamp(beforeF, lim.min, lim.max);
    return this.userZoomValue !== before || this.zoomFactorValue !== beforeF;
  }

  /** Screen-space center (px). */
  get screenCenter(): Point {
    return { x: this.viewW / 2, y: this.viewH / 2 };
  }

  /**
   * THE WORLD RECTANGLE CURRENTLY ON SCREEN: the camera centre plus half-extents
   * in world units (screen px ÷ 2 ÷ zoom). Composed from the live `zoom`, so it
   * answers correctly under the default framing, a spectator zoom-out and an
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
   * Set the viewport size (px) and recompute the base zoom so the default span
   * (CameraOptions.defaultSpanU) fits the screen's short axis. Call on init and
   * resize.
   */
  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.baseZoom = Math.min(width, height) / this.opts.defaultSpanU;
  }

  /** Jump the camera center directly to a point (no smoothing). */
  snapTo(p: Point): void {
    this.follow.x = p.x;
    this.follow.y = p.y;
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
    this.follow.x += dx;
    this.follow.y += dy;
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

  /** The world rectangle the screen shows this frame, SHAKE INCLUDED — the
   *  exact inverse image of the viewport (unlike `worldView`, which omits
   *  shake). The countermeasure clips its mask pass to it (Story 9.8). */
  get screenWorldRect(): ScreenWorldRect {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: this.viewW, y: this.viewH });
    return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y };
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
   * offset (exponential approach at followRate, deterministic given dt and
   * ship), then place the centre on the slide (ruling 128): lerp(follow point,
   * ring centre, slideT). At and inside the default framing slideT is 0 and the
   * centre IS the follow point, exactly as before Story 9.8. The slide itself
   * is not smoothed: it is a pure function of the zoom, which the player moves
   * directly. While the slide is engaged the own hull is then kept on screen
   * (`keepShipInView`).
   */
  update(dt: number, ship: Followable): void {
    const lead = this.leadOffset(ship);
    this.follow.x = expDecay(this.follow.x, ship.x + lead.x, this.opts.followRate, dt);
    this.follow.y = expDecay(this.follow.y, ship.y + lead.y, this.opts.followRate, dt);
    const t = this.slideT;
    this.center.x = lerp(this.follow.x, this.ring.x, t);
    this.center.y = lerp(this.follow.y, this.ring.y, t);
    if (t > 0) this.keepShipInView(ship);
  }

  /**
   * THE OWN HULL STAYS ON SCREEN (Story 9.8 review gate, F2). At the zoom-out
   * limit the centre is the ring centre (ruling 128), so a captain outside the
   * ring in the storm — farther from the ring centre than the view's half
   * extent — would be off screen with nothing pulling the camera back. Clamp
   * the centre, per axis of the VIEW RECT (not a circle), so the hull point
   * stays `keepInViewPadU` inside every edge. A captain inside the ring never
   * reaches the clamp, so their centre is exactly the slide's. Only while the
   * slide is engaged: at and inside the default framing the centre is the
   * follow point, untouched.
   */
  private keepShipInView(ship: Point): void {
    const v = this.worldView;
    const pad = this.opts.keepInViewPadU ?? 0;
    const hw = Math.max(0, v.halfW - pad);
    const hh = Math.max(0, v.halfH - pad);
    this.center.x = clamp(this.center.x, ship.x - hw, ship.x + hw);
    this.center.y = clamp(this.center.y, ship.y - hh, ship.y + hh);
  }
}
