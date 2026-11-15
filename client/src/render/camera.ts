// Pure-math camera. Owns the world<->screen mapping, a zoom expressed as
// ABSOLUTE world spans across the viewport's short axis (Story 9.8, epic-9
// amendments 127/128 — never a factor over radar), and a shake offset hook.
//
// THE STRATEGIC ZOOM (Story 11.8, Eric 2026-11-15: *"Supreme Commander-esque
// Strategic Zoom"*). The camera has two modes over one ANCHOR point:
//   FOLLOW — the anchor IS the followed hull's true position every frame (the
//            own ship alive, the watched ship spectating): no lead, no follow
//            easing, no keep-in-view clamp;
//   PANNED — the anchor is a point on the water the player moved it to
//            (middle drag, held arrows, spectate WASD, a cursor zoom-in); the
//            hull may sail off screen. `home()` (Space) snaps back to FOLLOW.
// The DRAWN center is a pure function of the anchor and the zoom span
// (render/cameraSlide.ts `slideCenter`): the anchor until half the ring
// waypoint — never inside the waypoint's floor (intel alive, the default
// framing spectating), so the ship stays dead center late in a match — then a
// glide to the ring center and on to the board center at full zoom-out (once
// the ring has closed inside the floor, straight to the board center). Zoom OUT is about the anchor; zoom IN heads for the cursor through
// the slide's inverse. Event-driven moves of that center (the ring feed, a
// resize — amendment 208 ruling 10) still ease over about half a second.
// No Pixi import: render code reads `zoom`, `center`, `shake`, `screenCenter`
// and applies the transform to the world/chart containers. Fully unit-testable.

import { expDecay, clamp } from '../util/math.js';
import { anchorGlideT, anchorWeight, boardGlideT, clampToDisc, slideAnchor, slideCenter, WEIGHT_EPS, type SlideFrame } from './cameraSlide.js';
import {
  detentSpanU,
  intelFitSpanU,
  revealZoomFactor,
  ringFitSpanU,
  spanFactor,
  usableSpan,
  userZoomLimits,
  zoomOutSpanU,
} from './cameraZoom.js';

export {
  canUserZoom,
  detentSpanU,
  intelFitSpanU,
  revealZoomFactor,
  ringFitSpanU,
  spanFactor,
  stepZoom,
  userZoomLimits,
  zoomOutSpanU,
} from './cameraZoom.js';
export { anchorWeight, slideAnchor, slideCenter, type SlideFrame } from './cameraSlide.js';

/** FOLLOW (the anchor rides the followed hull) or PANNED (the anchor holds). */
export type CameraMode = 'follow' | 'panned';

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
  /** THE HOME RADIUS (px, Story 11.8 — Eric: 16): a zoom-IN in FOLLOW with the
   *  cursor within this of the followed hull's screen position stays FOLLOW
   *  and zooms about the hull (CLIENT_CONFIG.camera.homeRadiusPx). Omitted = 0
   *  (only a cursor exactly on the hull keeps FOLLOW). */
  homeRadiusPx?: number;
  /** THE INTEL WAYPOINT's radius (u, epic-9 amendment 208): main.ts feeds
   *  CONFIG.vision.radar, the radar sweep disc. The alive zoom stops where that
   *  disc × `ringFitMargin` around the own ship has its bottom edge on the HUD
   *  bar's top edge (`setBottomInset`). Omitted = no intel waypoint (the intel
   *  span is the default framing: the pre-208 behavior). Story 11.8 retired the
   *  follow lead, so the fit no longer carries one (ruling 9 went with it). */
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
 *  decaying tail never lingers in the sixth decimal forever. */
const JUMP_SETTLE_EPS = 1e-3;

/**
 * How close to the reveal target counts as ARRIVED. An exponential approach
 * never exactly lands, and a factor that keeps twitching in its sixth decimal
 * forever would re-trip every zoom-keyed invalidation downstream (the charted
 * terrain layer re-tessellates on a zoom change, CLIENT_CONFIG.terrain
 * .redrawZoomFrac) for motion no one can see.
 */
const REVEAL_SETTLE_EPS = 1e-4;

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

  /** THE ANCHOR (Story 11.8): the followed hull's position in FOLLOW, the
   *  panned point in PANNED. The drawn center is `slideCenter(anchor, span)`. */
  private readonly anchor: Point = { x: 0, y: 0 };
  private modeValue: CameraMode = 'follow';
  /** The spectate phase drives the zoom (`setSpectating`). */
  private spectatingValue = false;
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
   * THE SPECTATE ZOOM AT THE CURSOR (Eric 2026-10-14; the strategic-zoom rules
   * since Story 11.8): sets the spectator zoom factor exactly as setZoomFactor
   * does (clamped, reveal released, non-finite ignored) under `zoomWith`'s
   * rules — OUT about the anchor, IN toward the screen point (screenX,
   * screenY). A non-finite screen point is the screen centre.
   */
  zoomAbout(screenX: number, screenY: number, newZoom: number): void {
    this.zoomWith(screenX, screenY, () => this.setZoomFactor(newZoom));
  }

  /** THE ALIVE ZOOM AT THE CURSOR (Story 11.8): `setUserZoom(next)` under
   *  `zoomWith`'s rules. */
  zoomUserAbout(screenX: number, screenY: number, next: number): void {
    this.zoomWith(screenX, screenY, () => this.setUserZoom(next));
  }

  /**
   * THE STRATEGIC ZOOM RULES (Story 11.8, Eric 2026-11-15). `apply` moves the
   * zoom (clamped by its own setter). Zoom OUT is about the anchor: the mode
   * and the anchor stay (FOLLOW stays FOLLOW). Zoom IN heads for the cursor:
   * the world point under (screenX, screenY) stays under it — the new anchor
   * solved through the slide's inverse (exact while the anchor still has a say;
   * on the ring → board leg, where it has none, the anchor is that world point
   * so continued zooming heads there) and clamped to the board fit — and the
   * camera is PANNED. The exception: in FOLLOW with the cursor within
   * `homeRadiusPx` of the followed hull — or no cursor position known at all —
   * the zoom stays FOLLOW about the hull.
   */
  private zoomWith(screenX: number, screenY: number, apply: () => void): void {
    const known = Number.isFinite(screenX) && Number.isFinite(screenY);
    const s = known ? { x: screenX, y: screenY } : this.screenCenter;
    const p = this.screenToWorld(s);
    // No cursor known (a key zoom before the pointer ever moved): FOLLOW
    // zooms about the anchor and stays FOLLOW (Story 11.8 review).
    const home = this.modeValue === 'follow' && (!known || this.withinHome(s));
    const before = this.zoom;
    apply();
    if (this.zoom > before && !home) this.aimAt(p, s);
    this.placeCenter();
  }

  /** Is screen point `s` within the home radius of the anchor's screen spot? */
  private withinHome(s: Point): boolean {
    const a = this.worldToScreen(this.anchor);
    return Math.hypot(s.x - a.x, s.y - a.y) <= (this.opts.homeRadiusPx ?? 0);
  }

  /** PANNED, with the anchor that draws world point `p` under screen point `s`
   *  at the current zoom (see `zoomWith`). */
  private aimAt(p: Point, s: Point): void {
    const sc = this.screenCenter;
    const z = this.zoom;
    const want = {
      x: p.x - (s.x - sc.x - this.shake.x) / z - this.jump.x,
      y: p.y - (s.y - sc.y - this.shake.y) / z - this.jump.y,
    };
    const a = slideAnchor(want, this.spanU, this.slideFrame()) ?? { x: p.x, y: p.y };
    this.setAnchor(a);
    this.modeValue = 'panned';
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
   * the same expDecay the eased center jumps use, so the module has one
   * easing vocabulary. A no-op while the reveal mode is off.
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
    this.zoomFactorValue = this.revealStep(target, dtMs, motionScale);
    // The drawn center follows this frame's zoom at once (Story 11.8 review):
    // a center placed at the old zoom would draw one stale frame — at motion:
    // off a cropped first frame of the reveal.
    this.placeCenter();
  }

  /** The reveal factor after `dtMs` toward `target` (see tickZoom). */
  private revealStep(target: number, dtMs: number, motionScale: number): number {
    // motion: off (or any degenerate scale) — arrive, do not travel.
    if (!Number.isFinite(motionScale) || motionScale <= 0) return target;
    const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) / 1000 : 0;
    const next = expDecay(this.zoomFactorValue, target, this.revealRateValue / motionScale, dt);
    return Math.abs(next - target) < REVEAL_SETTLE_EPS ? target : next;
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
   * than the default framing. Without
   * `intelRadiusU`, with an unusable fit, or with a fit at or past the
   * whole-map fit (Story 11.2), it IS the default framing (the pre-208 camera).
   */
  get intelSpanU(): number {
    const d = this.opts.defaultSpanU;
    const r = this.opts.intelRadiusU ?? NaN;
    const fit = intelFitSpanU(this.viewW, this.viewH, this.bottomInsetValue, r, this.opts.ringFitMargin);
    if (!usableSpan(fit)) return d;
    // AN INTEL DISC AS WIDE AS THE BOARD IS NO STOP (Story 11.2, R11): at the
    // 400 hm radar the intel fit reaches the whole-map fit, and a stop AT the
    // map fit left both centre slides no room, so the
    // fully-zoomed-out camera stayed on the ship instead of the board centre.
    // At or past the map fit the waypoint is the default framing — the
    // pre-208 camera, whose slides run to the ring and then the map centre.
    // [reading: Story 11.2 — the smallest fix that restores the whole-board view]
    if (usableSpan(this.mapSpanValue) && fit >= this.mapSpanValue) return d;
    return Math.max(d, fit);
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

  /** The COMPOSED span (u across the short axis) the screen shows: the
   *  default framing over both zoom factors (only one is ever off 1). */
  get spanU(): number {
    return this.opts.defaultSpanU / (this.zoomFactorValue * this.userZoomValue);
  }

  /** The composed zoom factor over the default framing (spectate × alive). */
  get composedFactor(): number {
    return this.zoomFactorValue * this.userZoomValue;
  }

  /**
   * Which phase's ring waypoint the slide reads (Story 11.8): the spectate one
   * (floored at the default framing) once `setSpectating(true)`, else the
   * alive one (floored at the intel waypoint) — R is "the ring waypoint" of
   * whichever zoom is driving. main.ts flips it at spectate entry.
   */
  setSpectating(on: boolean): void {
    this.spectatingValue = on;
  }

  /**
   * What the slide reads (Story 11.8): R = the ring waypoint of the driving
   * zoom (`setSpectating`), the board fit, the live ring center (null before
   * the first ring feed) and F = the floor that waypoint is floored at (the
   * slide never starts inside it — the endgame-centering ruling).
   */
  private slideFrame(): SlideFrame {
    return {
      ringSpanU: this.spectatingValue ? this.detentSpanU : this.aliveDetentSpanU,
      boardSpanU: this.mapSpanValue,
      ring: Number.isNaN(this.ringSpanValue) ? null : this.ring,
      floorSpanU: this.spectatingValue ? this.opts.defaultSpanU : this.intelSpanU,
    };
  }

  /** This instant's first glide (anchor → ring center), 0..1 (Story 11.8). */
  get slideT(): number {
    return anchorGlideT(this.spanU, this.slideFrame());
  }

  /** This instant's second glide (ring center → board center), 0..1. */
  get mapSlideT(): number {
    return boardGlideT(this.spanU, this.slideFrame());
  }

  /** FOLLOW or PANNED (Story 11.8). */
  get mode(): CameraMode {
    return this.modeValue;
  }

  /** The anchor (a copy): the followed hull in FOLLOW, the panned point else. */
  get anchorPoint(): Point {
    return { x: this.anchor.x, y: this.anchor.y };
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
   * keeps the radar disc above it. A non-finite or negative value is ignored. A user zoom
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

  /** Put the anchor (and the drawn center) on a point at once, any easing
   *  center jump dropped. The mode is unchanged. */
  snapTo(p: Point): void {
    this.anchor.x = p.x;
    this.anchor.y = p.y;
    this.clearJump();
    this.placeCenter();
  }

  /**
   * THE FOLLOWED HULL CHANGED (Story 11.8 review: the spectate target switched
   * — the killer sank or left the contacts): in FOLLOW the anchor moves to `p`
   * but the drawn center GLIDES there over the same eased jump the ring feed
   * uses (amendment 208 ruling 10) instead of cutting. PANNED (the anchor is
   * the player's) or a non-finite point: a no-op.
   */
  followEased(p: Point): void {
    if (this.modeValue !== 'follow' || !Number.isFinite(p.x + p.y)) return;
    const before = this.slideTarget();
    this.anchor.x = p.x;
    this.anchor.y = p.y;
    this.addJump(before);
    this.placeCenter();
  }

  /**
   * CAMERA HOME (Space, Story 11.8): back to FOLLOW at the same zoom. The snap
   * is instant — any easing center jump is dropped — and the anchor lands on
   * the followed hull at the next `update`.
   */
  home(): void {
    this.modeValue = 'follow';
    this.clearJump();
  }

  /** A SPAWN or a reconnect's re-seat (Story 11.8 review): FOLLOW, snapped onto
   *  the new hull at once — `snapTo` alone would keep a PANNED anchor. */
  respawnAt(p: Point): void {
    this.home();
    this.snapTo(p);
  }

  /** The anchor, clamped inside the board fit (radius = the whole-map fit
   *  span / 2 = map radius × the fit margin; no clamp before the map is known). */
  private setAnchor(p: Point): void {
    const a = clampToDisc({ x: p.x, y: p.y }, this.mapSpanValue / 2);
    this.anchor.x = a.x;
    this.anchor.y = a.y;
  }

  /** THE PURE SLIDE TARGET (Story 11.8): `slideCenter(anchor, span, frame)`. */
  private slideTarget(): Point {
    return slideCenter(this.anchor, this.spanU, this.slideFrame());
  }

  /** The drawn center: the slide target plus the easing event jump. */
  private placeCenter(): void {
    const t = this.slideTarget();
    this.center.x = t.x + this.jump.x;
    this.center.y = t.y + this.jump.y;
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

  /**
   * PAN the view by a world-space delta (dx, dy) of the DRAWN center (Story
   * 11.8: held arrows, spectate WASD; `panScreen` for the middle drag). Enters
   * PANNED. The anchor moves by Δ / its weight in the slide (`anchorWeight`,
   * 1 − t) so the view tracks the hand, clamped inside the board fit; on the
   * anchor glide's far end (weight ≤ WEIGHT_EPS, full zoom-out) the anchor has
   * no say and the pan is a no-op: it returns before touching the mode or the
   * reveal framing. A pan that moves releases the reveal framing (amendment
   * 25), a manual camera action. A non-finite or zero delta is ignored.
   */
  pan(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    const w = anchorWeight(this.spanU, this.slideFrame());
    if (!(w > WEIGHT_EPS)) return;
    this.clearRevealTarget();
    this.modeValue = 'panned';
    this.setAnchor({ x: this.anchor.x + dx / w, y: this.anchor.y + dy / w });
    this.placeCenter();
  }

  /** THE MIDDLE DRAG (Story 11.8): the pointer moved (dxPx, dyPx) screen px
   *  with the button held — the water under it follows the hand 1:1. */
  panScreen(dxPx: number, dyPx: number): void {
    const z = this.zoom;
    this.pan(-dxPx / z, -dyPx / z);
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

  /** The world rectangle the screen shows WITHOUT the shake offset — the
   *  steady view an on/off-screen test reads, so a shake jitter is never a
   *  crossing (Story 11.8 review). */
  get steadyWorldRect(): ScreenWorldRect {
    const v = this.worldView;
    return { x: v.x - v.halfW, y: v.y - v.halfH, w: 2 * v.halfW, h: 2 * v.halfH };
  }

  /** Screen point (px) -> world point (inverse of worldToScreen). */
  screenToWorld(p: Point): Point {
    const c = this.screenCenter;
    return {
      x: (p.x - c.x - this.shake.x) / this.zoom + this.center.x,
      y: (p.y - c.y - this.shake.y) / this.zoom + this.center.y,
    };
  }

  /**
   * Advance one render frame. In FOLLOW the anchor is `target` — the followed
   * hull's true position, no lead, no easing (Story 11.8); in PANNED, or with
   * no target (a spectator with nobody to watch), the anchor holds. The drawn
   * center is then the slide of the anchor (a pure function of the zoom, which
   * the player moves directly) plus an event jump (ring feed, resize, UI scale
   * — Eric 2026-10-19, ruling 10) that decays at `slideEaseRate`, so an
   * event-driven move glides over about half a second.
   */
  update(dt: number, target: Point | null): void {
    if (this.modeValue === 'follow' && target !== null && Number.isFinite(target.x + target.y)) {
      this.anchor.x = target.x;
      this.anchor.y = target.y;
    }
    this.decayJump(dt);
    this.placeCenter();
  }
}
