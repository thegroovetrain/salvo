// Pure-math camera. Owns the world<->screen mapping, a zoom expressed as
// ABSOLUTE world spans across the viewport's short axis (Story 9.8, epic-9
// amendments 127/128 — never a factor over radar), a follow-with-lead target
// smoother, the centre slide toward the storm ring (held until the intel
// waypoint, amendment 208), and a shake offset hook.
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
  /** THE INTEL WAYPOINT's radius (u, epic-9 amendment 208): main.ts feeds
   *  CONFIG.vision.radar, the radar sweep disc. The alive zoom stops where that
   *  disc × `ringFitMargin` plus the maximum follow lead (`leadMax`, ruling 9),
   *  around the own ship, has its bottom edge on the HUD bar's top edge
   *  (`setBottomInset`) at any speed and heading, and the centre slide toward
   *  the ring starts there. Omitted = no intel waypoint (the intel span is the
   *  default framing: the pre-208 behavior). */
  intelRadiusU?: number;
  /** EASED CENTER JUMPS (Eric 2026-10-19, amendment 208 ruling 10): the rate
   *  (1/s) at which a center jump caused by an EVENT — the ring feed, a
   *  viewport resize, a UI-scale change — decays, so the center glides to its
   *  new spot over about half a second (CLIENT_CONFIG.camera.slideEaseRate).
   *  The player's own zoom stays direct. Omitted = no easing (the jump lands
   *  at once, the pre-ruling behavior). */
  slideEaseRate?: number;
}

/** Below this (u) an easing jump counts as finished and is dropped, so the
 *  decaying tail never keeps the own-hull clamp armed forever. */
const JUMP_SETTLE_EPS = 1e-3;

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
 * = defaultSpanU / outSpanU — the whole-map fit since amendment 142
 * (`zoomOutSpanU`; it was the live ring fit in Story 9.8).
 *
 * THE OUT SPAN IS A ZOOM-OUT LIMIT ONLY (Story 9.8 review gate, F3): `min` is
 * never above 1, so the default framing is always reachable. An out span
 * under the default framing stops the out limit AT the default framing — it
 * never forces a captain in toward the close framing. A span of 0 is the same
 * case, and an unusable one (NaN) falls back to the default framing too.
 */
export function userZoomLimits(
  defaultSpanU: number,
  closeSpanU: number,
  outSpanU: number,
): { min: number; max: number } {
  const max = spanFactor(defaultSpanU, closeSpanU);
  const fit = Number.isNaN(outSpanU) || outSpanU <= 0 ? 1 : defaultSpanU / outSpanU;
  return { min: Math.min(1, max, fit), max };
}

/** A span (u) that can frame anything: finite and positive. */
function usableSpan(spanU: number): boolean {
  return Number.isFinite(spanU) && spanU > 0;
}

/** Every input finite and positive. */
function allUsable(...xs: number[]): boolean {
  return xs.every(usableSpan);
}

/**
 * THE INTEL FIT SPAN (Eric 2026-10-19, epic-9 amendment 208: *"insert a
 * 'waypoint' in between them that keeps the camera centered until I have
 * zoomed out to my entire intel area, which should have a bit of clearance
 * around it so that the hotbar isn't covering it up."*), in world units across
 * the short axis.
 *
 * The own ship sits at the exact screen center (H/2) at rest; under way the
 * camera centers on the ship + its follow lead, so the ship sits up to `leadU`
 * off center in any direction (Eric 2026-10-19, ruling 9: LEAD IN THE FIT).
 * The fit therefore covers an effective radius E = R·m + lead (m = the fit
 * margin, the clearance): the disc's bottom edge clears the bar's top edge
 * when H/2 + E·z ≤ H − inset, its sides when W/2 ≥ E·z (the top is symmetric
 * with the bottom, so implied), at any speed and heading. The widest zoom that
 * holds both is z = min(H/2 − inset, W/2) / E px per u, i.e. a span of
 * min(W, H) / z. Everything in REAL px: `bottomInsetPx` is the bar's logical
 * inset × the UI scale. NaN when unusable (no room above the bar, a missing
 * radius or margin, a negative or non-finite lead, a degenerate viewport or
 * inset) — the caller then falls back to the default framing.
 */
export function intelFitSpanU(
  viewW: number,
  viewH: number,
  bottomInsetPx: number,
  radiusU: number,
  margin: number,
  leadU = 0,
): number {
  if (!allUsable(viewW, viewH, radiusU, margin)) return NaN;
  if (!Number.isFinite(bottomInsetPx) || !(Number.isFinite(leadU) && leadU >= 0)) return NaN;
  const room = Math.min(viewH / 2 - Math.max(0, bottomInsetPx), viewW / 2);
  if (!(room > 0)) return NaN;
  return (Math.min(viewW, viewH) * (radiusU * margin + leadU)) / room;
}

/**
 * THE ZOOM-OUT SPAN (Eric 2026-10-14, amendment 142: *"Maybe we shouldn't cap
 * the zoom out to the current ring. Instead lets set the current ring as a sort
 * of 'waypoint' and from there you could zoom out to the entire map, even the
 * stormed-out bits."*): the WHOLE MAP fit (2 × mapRadius × margin, the reveal's
 * own framing), storm and all. Never tighter than the live ring fit (the ring
 * never outgrows the map, but a junk feed must not put the waypoint past the
 * limit). Before the map radius is known it falls back to the ring fit; NaN
 * when neither is usable (`userZoomLimits` then holds the default framing).
 */
export function zoomOutSpanU(mapSpanU: number, ringSpanU: number): number {
  const m = Math.max(usableSpan(mapSpanU) ? mapSpanU : 0, usableSpan(ringSpanU) ? ringSpanU : 0);
  return m > 0 ? m : NaN;
}

/**
 * THE RING WAYPOINT (amendment 142) as a span: the live ring fit, never
 * tighter than the floor span (so after the final close, or before any ring,
 * the waypoint IS the floor). Every zoom step that would cross it lands exactly
 * on it (`stepZoom`); the next step continues past it. The spectate camera
 * floors it at the default framing; the alive camera at the intel waypoint
 * (amendment 208), so a ring fit at or inside the intel span merges into it.
 */
export function detentSpanU(defaultSpanU: number, ringSpanU: number): number {
  return usableSpan(ringSpanU) ? Math.max(defaultSpanU, ringSpanU) : defaultSpanU;
}

/**
 * THE CENTRE SLIDE (ruling 128): how far the camera centre has travelled from
 * the own ship toward the ring centre, 0..1. `spanU` is the CURRENT user span
 * across the short axis; at and inside the start span (the second argument)
 * t = 0 (the ship is centered), at the ring-fit span t = 1 (the ring centre
 * is). Linear in span between them. A ring no wider than the start span, or an
 * unusable one, never slides. The alive camera starts it at the intel waypoint
 * since amendment 208 (it was the default framing).
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
 *
 * `detents` (amendment 142; a list since amendment 208) are the waypoints as
 * factors: the spectate ring waypoint (Camera.zoomDetent) or the alive pair
 * [intel, ring] (Camera.aliveZoomDetents). A step that would CROSS any of them
 * from either side lands exactly on the FIRST one crossed (the one nearest the
 * starting factor) and the rest of the step is dropped (a wheel event's whole
 * delta is one step); a step that STARTS on one moves on. Omitted or unusable
 * = a free step.
 */
export function stepZoom(factor: number, amount: number, detents?: number | readonly number[]): number {
  if (!Number.isFinite(amount)) return factor;
  const next = factor * Math.exp(amount);
  return firstCrossed(factor, next, detentList(detents)) ?? next;
}

/** The detent argument of `stepZoom` as a list. */
function detentList(detents: number | readonly number[] | undefined): readonly number[] {
  if (detents === undefined) return [];
  return typeof detents === 'number' ? [detents] : detents;
}

/** Among the usable detents strictly crossed by from → to, the one nearest
 *  `from`; undefined when none is crossed. */
function firstCrossed(from: number, to: number, detents: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const d of detents) {
    if (!usableSpan(d) || (from - d) * (to - d) >= 0) continue;
    if (best === undefined || Math.abs(d - from) < Math.abs(best - from)) best = d;
  }
  return best;
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

/** What a re-clamp moves: a user zoom equal to `alive` goes to the alive
 *  waypoint named by `aliveTo`, a spectate factor equal to `spectate` to the
 *  spectate ring waypoint. NaN = nothing rides. */
interface Rides {
  alive: number;
  aliveTo: 'ring' | 'intel';
  spectate: number;
}

const NO_RIDE: Rides = { alive: NaN, aliveTo: 'ring', spectate: NaN };

export class Camera {
  /** World-space point the camera is centered on. */
  readonly center: Point = { x: 0, y: 0 };
  /** Screen-space shake offset (px), added on top of the transform. */
  readonly shake: Point = { x: 0, y: 0 };

  /** The smoothed ship-follow point (ship + lead, eased at followRate). The
   *  centre is this point slid toward the ring centre (ruling 128); follow and
   *  lead apply to this term ONLY. */
  private readonly follow: Point = { x: 0, y: 0 };
  /** The decaying offset (u) between the eased center and the pure slide
   *  target (ruling 10): an event that moves the target (ring feed, resize, UI
   *  scale) adds the move here, and `update` decays it at `slideEaseRate`.
   *  Always 0 without that option. */
  private readonly jump: Point = { x: 0, y: 0 };
  private baseZoom = 1;
  private zoomFactorValue = 1;
  private userZoomValue = 1;
  private viewW = 1;
  private viewH = 1;
  /** The HUD bar's top inset from the viewport floor in REAL px (amendment
   *  208), fed by setBottomInset(). 0 until fed. */
  private bottomInsetValue = 0;
  /** The live storm ring (ruling 127/128), fed every alive frame by setRing().
   *  NaN span until the first feed = no ring known: the zoom-out limit is the
   *  default framing and nothing slides. */
  private readonly ring: Point = { x: 0, y: 0 };
  private ringSpanValue = NaN;
  /** The whole-map fit span (amendment 142), set once per match by
   *  setMapRadius(). NaN until then: the out limit falls back to the ring. */
  private mapSpanValue = NaN;
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
   *  well") it IS the alive range — the close framing in, the whole-map fit
   *  out (amendment 142; the ring fit is a waypoint on the way) — one derivation, so the two
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
    this.clearJump();
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

  /** The live alive-zoom limits (ruling 127, amendment 142): the close framing
   *  in, the whole-map fit out (the ring fit until the map radius is fed, the
   *  default framing until either is). */
  get userZoomLimits(): { min: number; max: number } {
    const out = zoomOutSpanU(this.mapSpanValue, this.ringSpanValue);
    return userZoomLimits(this.opts.defaultSpanU, this.opts.closeSpanU, out);
  }

  /** The current ring-fit span (u across the short axis), NaN before a ring. */
  get ringSpanU(): number {
    return this.ringSpanValue;
  }

  /** The whole-map fit span (u across the short axis), NaN before setMapRadius. */
  get mapSpanU(): number {
    return this.mapSpanValue;
  }

  /** The ring waypoint as a span (amendment 142): see `detentSpanU`. */
  get detentSpanU(): number {
    return detentSpanU(this.opts.defaultSpanU, this.ringSpanValue);
  }

  /** The SPECTATE ring waypoint as a zoom FACTOR (floored at the default
   *  framing) — what main.ts hands `stepZoom` / `wheelZoom` for the spectate
   *  factor. The alive zoom uses `aliveZoomDetents` (amendment 208). */
  get zoomDetent(): number {
    return spanFactor(this.opts.defaultSpanU, this.detentSpanU);
  }

  /**
   * THE INTEL WAYPOINT as a span (amendment 208): the intel fit
   * (`intelFitSpanU`) of the LIVE viewport and bar inset — a getter, never a
   * cached value, so a resize or a UI-scale change re-fits it — never tighter
   * than the default framing, and never wider than the whole-map fit once that
   * is known (so the stop stays reachable on a very short viewport). The fit
   * includes the maximum follow lead (`leadMax`, ruling 9). Without
   * `intelRadiusU`, or with an unusable fit, it IS the default framing (the
   * pre-208 camera).
   */
  get intelSpanU(): number {
    const d = this.opts.defaultSpanU;
    const r = this.opts.intelRadiusU ?? NaN;
    const fit = intelFitSpanU(this.viewW, this.viewH, this.bottomInsetValue, r, this.opts.ringFitMargin, this.opts.leadMax);
    if (!usableSpan(fit)) return d;
    const capped = usableSpan(this.mapSpanValue) ? Math.min(fit, this.mapSpanValue) : fit;
    return Math.max(d, capped);
  }

  /** Whether the intel waypoint is a stop of its own (wider than the default
   *  framing). False without the option, with an unusable fit (the fallback),
   *  or when the map fit caps it at or under the default framing. */
  private get hasIntelStop(): boolean {
    return this.intelSpanU > this.opts.defaultSpanU;
  }

  /** The ALIVE ring waypoint as a span: the ring fit floored at the intel
   *  waypoint (amendment 208), so a ring fit ≤ intel merges into one stop. */
  get aliveDetentSpanU(): number {
    return detentSpanU(this.intelSpanU, this.ringSpanValue);
  }

  /** The alive ring waypoint as a zoom FACTOR. */
  private get aliveRingFactor(): number {
    return spanFactor(this.opts.defaultSpanU, this.aliveDetentSpanU);
  }

  /** The alive waypoints as zoom FACTORS, [intel, ring] — what main.ts hands
   *  `stepZoom` for the alive user zoom. A merged pair repeats one value.
   *  Without a real intel stop (the option omitted, or the fallback) it is the
   *  single ring waypoint, exactly the pre-208 detent: no stop appears at the
   *  spawn framing. */
  get aliveZoomDetents(): number[] {
    if (!this.hasIntelStop) return [this.aliveRingFactor];
    return [spanFactor(this.opts.defaultSpanU, this.intelSpanU), this.aliveRingFactor];
  }

  /**
   * The ring waypoint (`detent`, a factor) a value PARKED on it rides as the
   * ring closes, or NaN when there is none to ride: only a real ring fit,
   * wider than `floorSpanU` (the spectate default framing, or the alive intel
   * waypoint) and strictly inside the out limit (at the first ring the fit IS
   * the map fit, and a captain zoomed fully out must stay on the whole map).
   */
  private rideableDetent(floorSpanU: number, detent: number): number {
    const ring = this.ringSpanValue;
    if (!usableSpan(ring) || ring <= floorSpanU) return NaN;
    if (ring >= zoomOutSpanU(this.mapSpanValue, ring)) return NaN;
    return detent;
  }

  /** The intel waypoint (a factor) a user zoom PARKED on it rides through a
   *  resize or a UI-scale change (amendment 208), or NaN when it is not a stop
   *  of its own (no wider than the default framing: the spawn framing never
   *  rides). */
  private rideableIntel(): number {
    return this.hasIntelStop ? spanFactor(this.opts.defaultSpanU, this.intelSpanU) : NaN;
  }

  /** The alive user span (u across the short axis) — defaultSpanU / userZoom. */
  get userSpanU(): number {
    return this.opts.defaultSpanU / this.userZoomValue;
  }

  /** This instant's centre slide toward the ring centre, 0..1 (ruling 128),
   *  starting at the intel waypoint (amendment 208). */
  get slideT(): number {
    return centreSlideT(this.userSpanU, this.intelSpanU, this.ringSpanValue);
  }

  /** The SECOND slide (amendment 142), 0..1: ring centre → map centre (the
   *  origin) from the alive ring waypoint out to the whole-map fit. With the
   *  waypoints merged (ring ≤ intel) the first slide never engages, so this
   *  one runs from the follow point straight to the map centre. */
  get mapSlideT(): number {
    return centreSlideT(this.userSpanU, this.aliveDetentSpanU, this.mapSpanValue);
  }

  /**
   * Feed the MAP RADIUS once per match (amendment 142): the zoom-out limit
   * becomes the whole-map fit, 2 × r × the fit margin (the reveal's framing).
   * An unusable radius clears it (the out limit falls back to the ring fit).
   */
  setMapRadius(r: number): void {
    this.mapSpanValue = ringFitSpanU(r, this.opts.ringFitMargin);
    this.reclamp(NO_RIDE);
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
    this.clearJump(); // a hard boundary: no easing center jump survives it
  }

  /**
   * Feed the LIVE storm ring (centre + radius), every alive AND spectate frame
   * (ruling 127; spectate since Eric's 2026-10-14 ruling):
   * the ring WAYPOINT re-fits to it (amendment 142) and the centre slide aims
   * at its centre (ruling 128). A zoom parked ON the waypoint rides it as the
   * ring closes; everything else is only re-clamped. Returns whether either
   * zoom moved, so the caller can decide on a fog re-bake (with its own
   * hysteresis). The center's move this causes (the ring's own motion, the
   * merge when a parked ring stop drops onto the intel stop) eases (ruling 10).
   */
  setRing(cx: number, cy: number, r: number): boolean {
    const before = this.slideTarget();
    if (Number.isFinite(cx) && Number.isFinite(cy)) {
      this.ring.x = cx;
      this.ring.y = cy;
    }
    const ride: Rides = {
      alive: this.rideableDetent(this.intelSpanU, this.aliveRingFactor),
      aliveTo: 'ring',
      spectate: this.rideableDetent(this.opts.defaultSpanU, this.zoomDetent),
    };
    this.ringSpanValue = ringFitSpanU(r, this.opts.ringFitMargin);
    const moved = this.reclamp(ride);
    this.addJump(before);
    return moved;
  }

  /**
   * Re-clamp both zoom values into the live limits. A value PARKED on an old
   * waypoint (`ride`; NaN = none) moves to the re-fitted one first, so a
   * captain who stopped at the ring fit stays fitted to the ring as it closes
   * (amendment 142), and one parked on the intel waypoint stays on it through
   * a resize (amendment 208). The alive user zoom rides the alive waypoints;
   * THE SPECTATE FACTOR rides its own ring waypoint on the same feed (Eric
   * 2026-10-14), never while the reveal framing owns it (amendment 25: exempt
   * from the clamp); a no-op while alive (the factor is 1 there). Returns
   * whether either moved.
   */
  private reclamp(ride: Rides): boolean {
    const lim = this.userZoomLimits;
    const aliveTo = ride.aliveTo === 'ring' ? this.aliveRingFactor : spanFactor(this.opts.defaultSpanU, this.intelSpanU);
    const settle = (v: number, from: number, to: number): number => clamp(v === from ? to : v, lim.min, lim.max);
    const before = this.userZoomValue;
    const beforeF = this.zoomFactorValue;
    this.userZoomValue = settle(before, ride.alive, aliveTo);
    if (!this.revealing) this.zoomFactorValue = settle(beforeF, ride.spectate, this.zoomDetent);
    return this.userZoomValue !== before || this.zoomFactorValue !== beforeF;
  }

  /**
   * Feed the HUD bar's top inset from the viewport floor in REAL px
   * (`hudBarTopInset()` × the UI scale; amendment 208). The intel waypoint
   * keeps the radar disc above it, and the own-hull clamp treats it as the
   * view's bottom edge. A non-finite or negative value is ignored. A user zoom
   * parked on the intel or the alive ring waypoint rides to the re-fitted one
   * (`refit`). Returns whether the user zoom moved, like `setRing`, so a
   * caller can schedule a fog re-bake.
   */
  setBottomInset(px: number): boolean {
    if (!Number.isFinite(px) || px < 0) return false;
    return this.refit(() => {
      this.bottomInsetValue = px;
    });
  }

  /**
   * Apply `mutate` (a viewport or bar-inset change, both of which re-fit the
   * intel waypoint) with the two rides and the eased center jump. A user zoom
   * parked on the intel waypoint rides to the re-fitted one, so the disc never
   * lands back under the bar; one parked on the alive ring waypoint rides it
   * too (intel may lift over it, merging the two). When the re-fit is the
   * fallback (no usable fit, so no intel stop) NOTHING rides: a transient
   * degenerate viewport must not throw a parked zoom back to the spawn
   * framing. Returns whether the user zoom moved.
   */
  private refit(mutate: () => void): boolean {
    const before = this.slideTarget();
    const intel = this.rideableIntel();
    const ring = this.rideableDetent(this.intelSpanU, this.aliveRingFactor);
    mutate();
    let moved = false;
    if (this.hasIntelStop) {
      moved = this.reclamp({ alive: intel, aliveTo: 'intel', spectate: NaN });
      moved = this.reclamp({ alive: ring, aliveTo: 'ring', spectate: NaN }) || moved;
    }
    this.addJump(before);
    return moved;
  }

  /** The HUD bar's top inset (real px) the camera currently holds. */
  get bottomInsetPx(): number {
    return this.bottomInsetValue;
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
   * resize. A zoom parked on a waypoint rides the re-fit (`refit`, amendment
   * 208).
   */
  setViewport(width: number, height: number): void {
    this.refit(() => {
      this.viewW = width;
      this.viewH = height;
      this.baseZoom = Math.min(width, height) / this.opts.defaultSpanU;
    });
  }

  /** Jump the camera center directly to a point (no smoothing, and any easing
   *  center jump dropped). */
  snapTo(p: Point): void {
    this.follow.x = p.x;
    this.follow.y = p.y;
    this.center.x = p.x;
    this.center.y = p.y;
    this.clearJump();
  }

  /** THE PURE SLIDE TARGET (ruling 128, amendment 142) over the stored
   *  follow point: lerp(lerp(follow, ring center, slideT), map center, mapSlideT).
   *  A pure function of the zoom, the ring, the map and the follow point. */
  private slideTarget(): Point {
    const t = this.slideT;
    const m = this.mapSlideT; // the map center is the origin (amendment 142)
    return {
      x: lerp(lerp(this.follow.x, this.ring.x, t), 0, m),
      y: lerp(lerp(this.follow.y, this.ring.y, t), 0, m),
    };
  }

  /** Whether event-driven center jumps ease (ruling 10): `slideEaseRate` set,
   *  finite and positive. */
  private get easesSlide(): boolean {
    const r = this.opts.slideEaseRate;
    return r !== undefined && Number.isFinite(r) && r > 0;
  }

  /** Fold an EVENT's move of the slide target (`before` → now) into the jump,
   *  so the center stays put this instant and glides from there (ruling 10).
   *  A no-op without easing, or when either target is non-finite. */
  private addJump(before: Point): void {
    if (!this.easesSlide) return;
    const after = this.slideTarget();
    const dx = before.x - after.x;
    const dy = before.y - after.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.jump.x += dx;
    this.jump.y += dy;
  }

  /** Decay the jump toward 0 by `dt` seconds at `slideEaseRate`; a tail under
   *  JUMP_SETTLE_EPS is dropped. */
  private decayJump(dt: number): void {
    const rate = this.opts.slideEaseRate;
    if (rate === undefined || !this.easesSlide) return;
    this.jump.x = expDecay(this.jump.x, 0, rate, dt);
    this.jump.y = expDecay(this.jump.y, 0, rate, dt);
    if (Math.hypot(this.jump.x, this.jump.y) < JUMP_SETTLE_EPS) this.clearJump();
  }

  private clearJump(): void {
    this.jump.x = 0;
    this.jump.y = 0;
  }

  /** Whether the center may sit off the follow point this frame: the slide is
   *  engaged, or an event jump is still easing out. */
  private get offFollow(): boolean {
    return this.slideT > 0 || this.mapSlideT > 0 || this.jump.x !== 0 || this.jump.y !== 0;
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
   * centre IS the follow point, exactly as before Story 9.8 — out to the intel
   * waypoint since amendment 208. The slide itself is not smoothed: it is a
   * pure function of the zoom, which the player moves directly. What IS eased
   * is a jump of that target caused by an EVENT (ring feed, resize, UI scale —
   * Eric 2026-10-19, ruling 10): center = slide target + a jump offset that
   * decays at `slideEaseRate`, so the center glides over about half a second.
   * While the slide is engaged or a jump is easing out, the own hull is then
   * kept on screen (`keepShipInView`) on the final center.
   */
  update(dt: number, ship: Followable): void {
    const lead = this.leadOffset(ship);
    this.follow.x = expDecay(this.follow.x, ship.x + lead.x, this.opts.followRate, dt);
    this.follow.y = expDecay(this.follow.y, ship.y + lead.y, this.opts.followRate, dt);
    this.decayJump(dt);
    const target = this.slideTarget();
    this.center.x = target.x + this.jump.x;
    this.center.y = target.y + this.jump.y;
    if (this.offFollow) this.keepShipInView(ship);
  }

  /**
   * THE OWN HULL STAYS ON SCREEN (Story 9.8 review gate, F2). At the waypoint
   * the centre is the ring centre (ruling 128), at the out limit the map centre
   * (amendment 142), so a captain in the storm — farther from that centre than the view's half
   * extent — would be off screen with nothing pulling the camera back. Clamp
   * the centre, per axis of the VIEW RECT (not a circle), so the hull point
   * stays `keepInViewPadU` inside every edge. The BOTTOM edge is the HUD bar's
   * top edge across the whole width (amendment 208; conservative outside the
   * bar's column, never wrong), so the hull never sits under the bar. A
   * captain inside the ring never reaches the clamp, so their centre is
   * exactly the slide's. Only while the slide is engaged (or an event jump is
   * easing out): at and inside the intel waypoint the centre is the follow
   * point, untouched (the ship is above the bar there by construction, lead
   * included — ruling 9).
   *
   * A VIEWPORT TOO SHORT FOR THE BAR (review gate, Codex): the bottom
   * half-extent is NOT floored at 0, so with the lower half exhausted the bar
   * edge still wins; if the bar-edge bound then passes the top bound, the bar
   * edge is preferred outright.
   */
  private keepShipInView(ship: Point): void {
    const v = this.worldView;
    const pad = this.opts.keepInViewPadU ?? 0;
    const hw = Math.max(0, v.halfW - pad);
    const hh = Math.max(0, v.halfH - pad);
    const lower = ship.y - (v.halfH - this.bottomInsetValue / this.zoom - pad);
    const upper = ship.y + hh;
    this.center.x = clamp(this.center.x, ship.x - hw, ship.x + hw);
    this.center.y = lower > upper ? lower : clamp(this.center.y, lower, upper);
  }
}
