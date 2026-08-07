// Storm-circle renderer (Story 3.2 — the amendment 14/15/17 grammar). Two pieces:
//   1. The CHARTED storm plane (chartRoot, fog-immune), all camera-transformed
//      world geometry drawn at the ring's OFFSET center (Story 3.1: rings are no
//      longer concentric to the map):
//        • a FULL-AREA storm fill — everything outside the live ring, out to
//          whatever radius covers the whole screen from that ring's center
//          (amendment 15; the 3.1 70u annulus band is retired, and with it the
//          open water that used to sit beyond it);
//        • the live ring's SOLID storm-readout edge on top of it;
//        • the revealed next ring as a DASHED storm-readout telegraph at ~50%
//          alpha, landing with a brief motion-gated flash-then-settle at the
//          reveal beat (amendment 17).
//      SOLID-vs-DASHED is the non-color channel that separates the live boundary
//      from the telegraph, so the pair never depends on hue to be told apart;
//      both are violet, which is what retires the 3.1 phosphor-green "safe ring"
//      (UX-DR5's edge clause — the `storm` fill is 2.87:1, below the 3:1 graphics
//      threshold, so the EDGE, never the fill, carries the legibility).
//      Both strokes are SCREEN-LOCKED: the world-space width is divided by the
//      camera zoom, so a 2px edge stays 2px across the shipped 0.5×–1.5× range
//      instead of thinning to a hairline when the player zooms out.
//   2. SCREEN vignette (hudRoot): a pre-baked dimensional-purple radial-gradient
//      sprite whose alpha pulses while the own ship is out of the zone — and
//      which HOLDS at its lit (max-alpha) keyframe while a Tier-1 threat channel
//      is active (amendment 16; render/attention.ts owns the predicate).
//
// The live ring is DERIVED on the client from the schema's revealed rings +
// zoneStartT + CONFIG via the shared zoneLiveState() (see ArenaState JSDoc) so
// it is smooth at 60fps; this module just draws whatever geometry it is handed.
// Charted redraws are throttled to meaningful radius OR zoom changes (recenters
// are a cheap position set) — the vignette is the only per-frame cost.
// Thin Pixi adapter except the pure, unit-tested mappings below (vignetteAlpha
// + its easeHold/vignetteHeld hold blend, strokeWorldWidth, fillOuterRadius,
// needsRedraw, dashSpans, the reveal one-shot).

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ZonePhase, ZoneRing } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { strokeWorldWidth } from '../util/math.js';
import { bakeVignetteTexture } from './textures.js';

const Z = CLIENT_CONFIG.zone;
/** BOTH on-water edges (live ring + telegraph) read at readout brightness —
 *  amendment 14 retires the phosphor "safe ring", so no green enters this file. */
export const EDGE_COLOR = CLIENT_CONFIG.colors.stormReadout;
/** The full-area storm fill (never a legibility surface — see the header). */
export const FILL_COLOR = CLIENT_CONFIG.colors.storm;

/** Zone display state ('idle' hides the charted plane). */
export type ZoneDisplay = ZonePhase;

/**
 * The screen-locked stroke, authored here for the storm plane's edges and
 * PROMOTED to util/math.ts in cycle 59 when the charted terrain layer became
 * the second consumer (this note used to say it stayed local until one
 * existed). Re-exported so zone.ts remains the storm plane's single import
 * surface — there is still exactly one implementation.
 */
export { strokeWorldWidth };

/** The geometry the storm fill's extent depends on — the subset of a ZoneFrame
 *  `fillOuterRadius` reads (ZoneFrame extends it, so a frame IS a FillView). */
export interface FillView {
  /** The live ring — the fill disc is drawn about ITS center. */
  cur: { cx: number; cy: number };
  /** Camera world center (Camera.center) — the middle of what is on screen. */
  camX: number;
  camY: number;
  /** Camera px-per-world-unit. */
  zoom: number;
  screenW: number;
  screenH: number;
  mapRadius: number;
}

/**
 * Pure: the outer radius of the storm fill disc, in world units.
 *
 * The disc is centered on the LIVE RING while the VIEWPORT is centered on the
 * camera, so the disc must reach from the ring's center to the farthest visible
 * screen corner:
 *
 *   needed = dist(camera center, ring center) + halfDiagonal(screen) / zoom
 *
 * This is EXACT rather than a constant multiple of the map radius, because no
 * constant covers it: a short-wide viewport at min zoom with a maxed radar
 * stack already exceeds `fillOuterFactor × mapRadius`, and spectate free-pan is
 * unclamped (the camera can sit arbitrarily far from every ring). Cheapness
 * comes from BUCKETING the answer up to a `fillBucketU` step instead of from a
 * loose constant — ordinary play never leaves its bucket, so the disc is not
 * re-tessellated, and a panning spectator crosses a step every few seconds.
 * `fillOuterFactor × mapRadius` stays as the floor.
 *
 * A degenerate camera (non-finite/non-positive zoom or viewport) falls back to
 * that floor rather than producing an Infinity/NaN radius.
 */
export function fillOuterRadius(v: FillView): number {
  const floor = Math.max(1, Number.isFinite(v.mapRadius) ? v.mapRadius : 0) * Z.fillOuterFactor;
  return bucketUp(Math.max(floor, coverRadius(v)));
}

/** World-space distance from the ring center to the farthest visible corner
 *  (0 when the camera state is degenerate — the floor then wins). */
function coverRadius(v: FillView): number {
  const parts = [v.cur.cx, v.cur.cy, v.camX, v.camY, v.zoom, v.screenW, v.screenH];
  if (!parts.every(Number.isFinite) || v.zoom <= 0) return 0;
  const halfDiag = Math.hypot(v.screenW, v.screenH) / 2;
  return Math.hypot(v.camX - v.cur.cx, v.camY - v.cur.cy) + (halfDiag + Z.fillMarginPx) / v.zoom;
}

/** Round a radius UP to the next `fillBucketU` step (the re-tessellation guard). */
function bucketUp(r: number): number {
  return Math.ceil(r / Z.fillBucketU) * Z.fillBucketU;
}

/**
 * Pure: does the charted geometry need re-stroking? The 3.1 throttle keyed on
 * radius alone; the screen-locked stroke makes the CAMERA ZOOM part of the
 * drawn geometry, so it joins the key (relative, since `zoom` is px-per-unit
 * and its scale depends on the viewport). `lastR < 0` is the never-drawn
 * sentinel.
 */
export function needsRedraw(lastR: number, lastZoom: number, r: number, zoom: number): boolean {
  if (lastR < 0) return true;
  if (Math.abs(r - lastR) > Z.redrawEpsU) return true;
  return Math.abs(zoom - lastZoom) > Math.abs(lastZoom) * Z.redrawZoomFrac;
}

/** Duty clamp — a dash must be VISIBLE and must leave a GAP, or the telegraph
 *  stops being the dashed half of the amendment-14 grammar (0 draws nothing,
 *  1 draws the solid circle that is the LIVE edge's mark). */
const DUTY_MIN = 0.05;
const DUTY_MAX = 0.95;

/**
 * Pure: the [start, end] angles (rad) of each dash around a dashed circle —
 * `segments` evenly spaced spans, each lit for `duty` of its step.
 *
 * Both inputs are CLAMPED rather than trusted: they are config today, but a
 * degenerate pair is a silent information loss (no spans = no telegraph; a
 * full duty = a solid circle indistinguishable from the live edge), and a
 * fractional/zero/negative/NaN segment count would otherwise produce an empty
 * list or an Infinity step.
 */
export function dashSpans(segments: number, duty: number): [number, number][] {
  const n = Math.max(1, Math.floor(Number.isFinite(segments) ? segments : 1));
  const d = Math.min(DUTY_MAX, Math.max(DUTY_MIN, Number.isFinite(duty) ? duty : DUTY_MIN));
  const step = (Math.PI * 2) / n;
  const spans: [number, number][] = [];
  for (let i = 0; i < n; i++) spans.push([i * step, i * step + step * d]);
  return spans;
}

/**
 * Pure: identity of a revealed ring, for the one-shot's "same group" test.
 * Rounded because a revealed ring's geometry arrives verbatim off the schema
 * (never interpolated), so integer world units are exact for this purpose.
 */
export function ringKey(ring: ZoneRing | null): string | null {
  return ring ? `${Math.round(ring.cx)}:${Math.round(ring.cy)}:${Math.round(ring.r)}` : null;
}

/**
 * Pure: the reveal one-shot's ADDED alpha `elapsedMs` after it fired — a single
 * linear decay from `amp` to 0 across `CLIENT_CONFIG.zone.revealMs`, i.e. one
 * flash that settles, never a repeating blink. Outside the envelope (including
 * a never-fired -Infinity elapsed) it is exactly 0.
 */
export function revealFlashAlpha(elapsedMs: number, amp: number): number {
  if (!(elapsedMs >= 0) || elapsedMs >= Z.revealMs) return 0;
  return amp * (1 - elapsedMs / Z.revealMs);
}

/**
 * The reveal one-shot (amendment 17), pure state + timing (no Pixi).
 *
 * Fires when a ring becomes public — the rising edge of the CLIENT's view, which
 * is latency-honest: the flash means "you now know", which is exactly what the
 * reveal beat is. Two guards make it a one-shot rather than a strobe:
 *   • it fires ONCE PER RING IDENTITY, so the zoneView stale-boundary guard
 *     re-deriving `next` (non-null → null → non-null for the SAME ring as the
 *     server-clock estimate jitters across a group boundary) can never retrigger
 *     it — the null→non-null edge alone would;
 *   • a `revealFloorMs` floor between fires, structurally guaranteeing the
 *     ratified ≥300ms one-shot spacing even if two rings ever arrived together.
 * The motion level enters as the AMPLITUDE (`motionScaled` at the callsite):
 * at `off` the flash amplitude is 0, so the telegraph simply appears — and
 * because the key is still recorded, toggling motion back on later cannot
 * resurrect a flash for a ring the player already saw.
 */
export class RevealOneShot {
  private firedKey: string | null = null;
  private firedAt = -Infinity;
  private firedAmp = 0;

  /** Feed the currently revealed ring (or null) each frame with a monotonic
   *  clock; returns the extra alpha the telegraph carries THIS frame. */
  update(next: ZoneRing | null, nowMs: number, amp: number): number {
    const key = ringKey(next);
    if (key !== null && key !== this.firedKey && nowMs - this.firedAt >= Z.revealFloorMs) {
      this.firedKey = key;
      this.firedAt = nowMs;
      this.firedAmp = amp;
    }
    // The latched amplitude, CLAMPED to this frame's: the latch exists so a
    // motion level raised after the fact cannot resurrect a flash, but it must
    // not work the other way either — a player who drops motion to `off` (or
    // `reduced`) DURING the 80ms envelope has to see it stop immediately, rather
    // than sit through a flourish they just switched off. At `off` amp is 0, so
    // the residual flash dies on the very next frame.
    return revealFlashAlpha(nowMs - this.firedAt, Math.min(this.firedAmp, amp));
  }
}

/**
 * Out-of-zone vignette alpha (pure). 0 when safely inside; otherwise a gentle
 * sinusoidal pulse in [base−amp, base+amp] driven by wall-clock seconds. Kept
 * pure so the state→alpha mapping is unit-tested without Pixi.
 *
 * The pulse RATE is not a local number: the vignette breathes AT the shared
 * photosensitivity ceiling, `CLIENT_CONFIG.settings.pulseCapHz` — ONE value
 * governing both this and the HP rail's accelerating ramp. Nothing on screen may
 * pulse faster.
 *
 * MOTION-GATED (Story 2.3): `amp` is the motion-scaled pulse amplitude — halved
 * at `reduced`, zero at `off`, where the vignette holds its steady base alpha.
 * The hazard stays fully visible at every level; only the pulse is motion.
 *
 * TIER-GATED (Story 3.2, amendment 16): `holdLit` selects the attention seam's
 * two ENDPOINTS — the breathing value, and the lit (max-alpha) keyframe this
 * Tier-2 channel holds at while a Tier-1 threat channel owns the player's eye.
 * The renderer does not switch between them discontinuously; it eases (see
 * easeHold/vignetteHeld below). At motion=off (amp 0) the lit keyframe IS the
 * base alpha, so the hold is a no-op there rather than a hidden motion
 * exception.
 */
export function vignetteAlpha(
  inStorm: boolean,
  tSec: number,
  amp: number = Z.vignetteAmp,
  holdLit = false,
): number {
  if (!inStorm) return 0;
  if (holdLit) return Z.vignetteBase + amp;
  return Z.vignetteBase + amp * Math.sin(tSec * CLIENT_CONFIG.settings.pulseCapHz * Math.PI * 2);
}

/** Clamp to [0,1] (a blend factor, or a caller's degenerate input). */
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Pure: the Tier-1 HOLD BLEND, eased one frame of `dtMs` toward `target`
 * (1 while a Tier-1 channel is live, 0 otherwise) with time constant `tauMs`.
 *
 * THE RECONCILIATION (amendment 16 vs the ratified photosensitivity floor).
 * Amendment 16 says a Tier-1 channel moves the vignette to — and holds it at —
 * its lit keyframe. Taken as an instantaneous switch, that breaks the floor the
 * same story pins: an accepted denied-fire click owns Tier 1 for 80ms and the
 * spam register allows one every 300ms, so in-storm click-spam would square-wave
 * a FULL-SCREEN wash up to 3.3 times a second (the floor is ≤1.1Hz pulsing and
 * ≤3 flashes/s in any region). The accessibility floor is the superior law, so
 * the hold is a first-order approach instead of a step: the SEMANTICS are
 * untouched (Tier-1 active → move to and hold the lit keyframe; clear → return
 * to breathing), only the discontinuity is gone. An 80ms blip becomes a swell of
 * ~28% of the delta; a sustained hold arrives and stays.
 *
 * Blending the two ENDPOINTS (rather than low-passing the alpha itself) is what
 * keeps the breathing waveform intact at hold 0 — a filter over the alpha would
 * quietly attenuate the ratified pulse amplitude.
 */
export function easeHold(
  current: number,
  target: number,
  dtMs: number,
  tauMs: number = Z.holdEaseMs,
): number {
  const from = clamp01(current);
  const to = clamp01(target);
  if (!Number.isFinite(dtMs) || dtMs <= 0) return from;
  if (!(tauMs > 0)) return to; // a zero time constant IS the old snap
  return from + (to - from) * (1 - Math.exp(-dtMs / tauMs));
}

/**
 * Pure: the vignette alpha actually drawn — the breathing value and the lit
 * keyframe mixed by the eased `hold` blend (0 = breathing, 1 = held lit).
 *
 * At motion=off the two endpoints are the SAME number (amp 0), so the blend is
 * a literal no-op: the hold can never introduce motion at a level that asked
 * for none.
 */
export function vignetteHeld(
  inStorm: boolean,
  tSec: number,
  amp: number,
  hold: number,
): number {
  const breathing = vignetteAlpha(inStorm, tSec, amp, false);
  const lit = vignetteAlpha(inStorm, tSec, amp, true);
  return breathing + (lit - breathing) * clamp01(hold);
}

/** What the charted plane shows this frame. */
export interface ZoneVisibility {
  /** The storm fill + the solid live edge. */
  plane: boolean;
  /** The dashed next-ring telegraph. */
  telegraph: boolean;
}

/**
 * Pure: the plane's visibility rules, all of them.
 *   • 'idle' draws nothing (pre-match / fail-safe);
 *   • a degenerate live ring (the r=0 sentinel) also draws nothing — a zero
 *     radius would otherwise cut no hole and paint the whole world storm;
 *   • the telegraph appears ONLY for a genuinely revealed next ring, so before
 *     the reveal beat there is nothing to draw and nothing to leak.
 */
export function planeVisibility(
  state: ZoneDisplay,
  cur: ZoneRing,
  next: ZoneRing | null,
): ZoneVisibility {
  const plane = state !== 'idle' && cur.r > 0;
  return { plane, telegraph: plane && next !== null && next.r > 0 };
}

/** Draw a dashed circle into `g` as many arc subpaths; caller strokes. */
function dashedCircle(g: Graphics, r: number): void {
  for (const [a0, a1] of dashSpans(Z.telegraphDashes, Z.telegraphDuty)) {
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
  }
}

/** Everything the zone plane needs for one frame. An object rather than a
 *  positional list: the frame carries camera + attention state now, and a
 *  ten-argument call is where render bugs come from. */
export interface ZoneFrame extends FillView {
  /** The LIVE ring (offset center + radius), derived via zoneLiveState(). */
  cur: ZoneRing;
  /** The REVEALED next ring, or null while none is public. */
  next: ZoneRing | null;
  /** Zone phase ('idle' hides the charted plane). */
  state: ZoneDisplay;
  /** Own ship currently outside the live ring. */
  inStorm: boolean;
  /** A Tier-1 threat channel is live (render/attention.ts) — the vignette holds
   *  at its lit keyframe instead of breathing. */
  tier1: boolean;
  /** Server-clock seconds — drives the vignette's breathing pulse. */
  nowSec: number;
  /** MONOTONIC ms (performance.now()) — drives the reveal one-shot envelope, so
   *  a server-clock resync can never stretch or rewind an 80ms flash. */
  nowMs: number;
  /** Camera px-per-world-unit (chartRoot's scale) — the screen-lock divisor,
   *  and (with the viewport) half of the fill's containment bound. */
  zoom: number;
  /** Camera world center (Camera.center) — the fill disc is drawn about the
   *  RING's center, so how far the camera has travelled from it is exactly how
   *  far the disc must reach to still cover the screen. */
  camX: number;
  camY: number;
  /** Map radius (u) — the FLOOR under the fill's dynamic outer radius. */
  mapRadius: number;
  /** Viewport (positions + stretches the screen-space vignette; also feeds the
   *  fill's visible-diagonal term). */
  screenW: number;
  screenH: number;
}

export class Zone {
  /** Full-area storm fill + the solid live edge (one path, redrawn on change). */
  private readonly storm = new Graphics();
  /** Dashed revealed-next-ring telegraph. */
  private readonly target = new Graphics();
  private readonly vignette: Sprite;
  private readonly reveal = new RevealOneShot();
  private lastR = -1;
  private lastZoom = -1;
  private lastFillR = -1;
  private lastTargetR = -1;
  private lastTargetZoom = -1;
  /** The eased Tier-1 hold blend (0 breathing → 1 held lit) + the frame clock
   *  it was last advanced on (-1 = never; the first frame eases by nothing). */
  private holdBlend = 0;
  private lastVigMs = -1;

  constructor(chartLayer: Container, vignetteLayer: Container) {
    chartLayer.addChild(this.storm);
    chartLayer.addChild(this.target);
    this.target.visible = false;

    this.vignette = new Sprite(bakeVignetteTexture());
    this.vignette.anchor.set(0.5);
    this.vignette.alpha = 0;
    vignetteLayer.addChild(this.vignette);
  }

  /**
   * Re-stroke the storm plane for a new radius/zoom (throttled by the caller).
   * Drawn about the local origin — the graphic's POSITION carries the ring
   * center. The fill is ONE path: a disc of `fillR` (sized to cover the whole
   * screen from this ring's center — see fillOuterRadius) with the live ring cut
   * out of it, so the storm is everywhere the safe circle is not.
   */
  private drawStorm(radius: number, zoom: number, fillR: number): void {
    const g = this.storm;
    g.clear();
    g.circle(0, 0, fillR).fill({ color: FILL_COLOR, alpha: Z.fillAlpha });
    g.circle(0, 0, radius).cut(); // the safe side is a hole in the storm, not a band
    g.circle(0, 0, radius).stroke({
      width: strokeWorldWidth(Z.edgePx, zoom),
      color: EDGE_COLOR,
      alpha: Z.edgeAlpha,
    });
  }

  /**
   * Storm plane for this frame: re-stroke only on a meaningful radius / zoom
   * change, or when the containment bound outgrows what is drawn, then carry
   * the offset center as a cheap position set.
   *
   * The fill radius is GROW-ONLY: a bucket that shrinks (the spectator pans
   * back toward the ring) keeps the bigger disc, because an oversized fill is
   * invisible — it only ever covers water the screen cannot see — while a
   * shrink would buy a re-tessellation for nothing.
   */
  private updateStorm(f: ZoneFrame): void {
    const fillR = Math.max(this.lastFillR, fillOuterRadius(f));
    if (needsRedraw(this.lastR, this.lastZoom, f.cur.r, f.zoom) || fillR > this.lastFillR) {
      this.drawStorm(f.cur.r, f.zoom, fillR);
      this.lastR = f.cur.r;
      this.lastZoom = f.zoom;
      this.lastFillR = fillR;
    }
    this.storm.position.set(f.cur.cx, f.cur.cy);
  }

  /** The dashed telegraph for the revealed next ring (throttled like the storm
   *  plane). The dash is stroked at full alpha and the CONTAINER carries the
   *  settled ~50% alpha plus the reveal flash, so the one-shot costs nothing
   *  per frame beyond an alpha write. */
  private updateTarget(next: ZoneRing, zoom: number, flash: number): void {
    if (needsRedraw(this.lastTargetR, this.lastTargetZoom, next.r, zoom)) {
      this.target.clear();
      dashedCircle(this.target, next.r);
      this.target.stroke({ width: strokeWorldWidth(Z.telegraphPx, zoom), color: EDGE_COLOR });
      this.lastTargetR = next.r;
      this.lastTargetZoom = zoom;
    }
    this.target.position.set(next.cx, next.cy);
    this.target.alpha = Math.min(1, Z.telegraphAlpha + flash);
  }

  /** Screen-space vignette: stretched to the viewport, alpha from the pure
   *  mappings (motion-scaled amplitude, EASED Tier-1 hold). The hold blend is
   *  advanced on the frame's monotonic clock — the same instant the denied
   *  pulse that may own Tier-1 was driven with (main.ts samples it once). */
  private updateVignette(f: ZoneFrame, active: boolean): void {
    this.vignette.position.set(f.screenW / 2, f.screenH / 2);
    this.vignette.width = f.screenW;
    this.vignette.height = f.screenH;
    const dtMs = this.lastVigMs < 0 ? 0 : f.nowMs - this.lastVigMs;
    this.lastVigMs = f.nowMs;
    this.holdBlend = easeHold(this.holdBlend, f.tier1 ? 1 : 0, dtMs);
    const amp = motionScaled(Z.vignetteAmp, settings.current.motion);
    this.vignette.alpha = active ? vignetteHeld(f.inStorm, f.nowSec, amp, this.holdBlend) : 0;
  }

  /** Update the zone visuals for this frame. */
  update(f: ZoneFrame): void {
    const vis = planeVisibility(f.state, f.cur, f.next);
    this.storm.visible = vis.plane;
    this.target.visible = vis.telegraph;
    if (vis.plane) this.updateStorm(f);
    const flash = this.reveal.update(
      vis.telegraph ? f.next : null,
      f.nowMs,
      motionScaled(Z.revealAmp, settings.current.motion),
    );
    if (vis.telegraph && f.next) this.updateTarget(f.next, f.zoom, flash);
    this.updateVignette(f, vis.plane);
  }

  destroy(): void {
    const tex = this.vignette.texture;
    this.vignette.destroy();
    if (tex !== Texture.EMPTY) tex.destroy(true);
    this.storm.destroy();
    this.target.destroy();
  }
}
