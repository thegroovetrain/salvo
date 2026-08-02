// Storm-circle renderer (Story 3.2 — the amendment 14/15/17 grammar). Two pieces:
//   1. The CHARTED storm plane (chartRoot, fog-immune), all camera-transformed
//      world geometry drawn at the ring's OFFSET center (Story 3.1: rings are no
//      longer concentric to the map):
//        • a FULL-AREA storm fill — everything outside the live ring, out past
//          the map edge (amendment 15; the 3.1 70u annulus band is retired, and
//          with it the open water that used to sit beyond it);
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
// Thin Pixi adapter except the pure, unit-tested mappings below (vignetteAlpha,
// strokeWorldWidth, needsRedraw, dashSpans, the reveal one-shot).

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { ZonePhase, ZoneRing } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
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
 * Pure: the WORLD-space width a stroke must be drawn at to land on screen at
 * `px` pixels, given the camera's px-per-world-unit `zoom` (chartRoot is scaled
 * by exactly that). This is the codebase's first screen-locked stroke; it stays
 * local to zone.ts until a second consumer exists (the blip 1px retrofit is 4.x
 * scope). A non-finite or non-positive zoom falls back to the raw px so a
 * degenerate camera can never produce a NaN/Infinity stroke width.
 */
export function strokeWorldWidth(px: number, zoom: number): number {
  return Number.isFinite(zoom) && zoom > 0 ? px / zoom : px;
}

/** Pure: outer radius of the storm fill disc — well beyond the map edge, so
 *  there is no open water outside the live ring at any zoom. */
export function fillOuterRadius(mapRadius: number): number {
  return Math.max(1, mapRadius) * Z.fillOuterFactor;
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

/** Pure: the [start, end] angles (rad) of each dash around a dashed circle —
 *  `segments` evenly spaced spans, each lit for `duty` of its step. */
export function dashSpans(segments: number, duty: number): [number, number][] {
  const step = (Math.PI * 2) / segments;
  const spans: [number, number][] = [];
  for (let i = 0; i < segments; i++) spans.push([i * step, i * step + step * duty]);
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
    return revealFlashAlpha(nowMs - this.firedAt, this.firedAmp);
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
 * TIER-GATED (Story 3.2, amendment 16): `holdLit` is the attention seam — while
 * a Tier-1 threat channel owns the player's eye, this Tier-2 channel stops
 * breathing and HOLDS at its lit (max-alpha) keyframe, resuming when the channel
 * clears. At motion=off (amp 0) the lit keyframe IS the base alpha, so the hold
 * is a no-op there rather than a hidden motion exception.
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
export interface ZoneFrame {
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
  /** Camera px-per-world-unit (chartRoot's scale) — the screen-lock divisor. */
  zoom: number;
  /** Map radius (u) — sets how far past the edge the storm fill reaches. */
  mapRadius: number;
  /** Viewport (positions + stretches the screen-space vignette). */
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
  private lastMapR = -1;
  private lastTargetR = -1;
  private lastTargetZoom = -1;

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
   * center. The fill is ONE path: a disc out past the map edge with the live
   * ring cut out of it, so the storm is everywhere the safe circle is not.
   */
  private drawStorm(radius: number, zoom: number, mapRadius: number): void {
    const g = this.storm;
    g.clear();
    g.circle(0, 0, fillOuterRadius(mapRadius)).fill({ color: FILL_COLOR, alpha: Z.fillAlpha });
    g.circle(0, 0, radius).cut(); // the safe side is a hole in the storm, not a band
    g.circle(0, 0, radius).stroke({
      width: strokeWorldWidth(Z.edgePx, zoom),
      color: EDGE_COLOR,
      alpha: Z.edgeAlpha,
    });
  }

  /** Storm plane for this frame: re-stroke only on a meaningful radius / zoom /
   *  map change, then carry the offset center as a cheap position set. */
  private updateStorm(f: ZoneFrame): void {
    if (needsRedraw(this.lastR, this.lastZoom, f.cur.r, f.zoom) || this.lastMapR !== f.mapRadius) {
      this.drawStorm(f.cur.r, f.zoom, f.mapRadius);
      this.lastR = f.cur.r;
      this.lastZoom = f.zoom;
      this.lastMapR = f.mapRadius;
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
   *  mapping (motion-scaled amplitude, Tier-1 hold). */
  private updateVignette(f: ZoneFrame, active: boolean): void {
    this.vignette.position.set(f.screenW / 2, f.screenH / 2);
    this.vignette.width = f.screenW;
    this.vignette.height = f.screenH;
    const amp = motionScaled(Z.vignetteAmp, settings.current.motion);
    this.vignette.alpha = active ? vignetteAlpha(f.inStorm, f.nowSec, amp, f.tier1) : 0;
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
