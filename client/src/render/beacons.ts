// THE RADIO BEACONS ON THE CHART AND ON THE WATER (Story 10.8, Eric rulings
// R1–R13, epic-10 amendment 14). Fed every frame from sim/beaconView.ts's views
// — public facts plus the SHARED lifecycle; this file derives nothing about a
// beacon's life on its own.
//
// TWO LAYERS, THE MINES' SPLIT (render/mines.ts):
//   • CHART (`beaconChart`, fog-immune) — the broadcast signal, on every
//     captain's chart from the cycle's 0:00, at every zoom up to the whole-ring
//     intel view: the marker and the 500 u range ring (`CONFIG.beacons.rangeU`).
//     DASHED while only charted (nothing in the water yet), SOLID once it is
//     afloat, fading through the sink — an EARLY sink fades early for every
//     captain (R9). Gone = hidden.
//   • WATER (`beaconWorld`, under the fog composite, like an enemy mine) — the
//     body at its TRUE size (the shared `beaconPolygon`, the very octagon the
//     server's hull row and ordnance collide against), from surfacing, settling
//     and fading across the sink minute: the sinking hull IS the timer.
//
// NO TEXT. No label, number, timer, health bar or tooltip — a readout must earn
// its place, and HP is not on the wire (R11): damage shows as the anonymous
// smoke/fire rows render/smoke.ts and render/fire.ts already draw.
//
// MOTION IS DECORATION ONLY (the house rule quoted in render/fire.ts's header):
// presence, phase, the dash style and the sink fade are motion-blind; only the
// transmission pulse scales with the motion intensity and is absent at `off`.
//
// This file copies fire.ts's SHAPE: a PURE core (no Pixi needed, unit-tested in
// __tests__/beacons.test.ts) — alpha, scale, radius and dash as functions of
// the view and the zoom — and a thin adapter that pools one sprite set per wire
// slot, re-strokes only on a style or zoom change, and per frame touches
// position, alpha, scale and the pulse.

import { Container, Graphics } from 'pixi.js';
import { CONFIG, beaconPolygon, type BeaconPhase } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs, strokeWorldWidth } from '../util/math.js';
import type { BeaconView } from '../sim/beaconView.js';

const B = CLIENT_CONFIG.beacons;
const C = CLIENT_CONFIG.colors;

/** The one linework color of a beacon (DESIGN.md `silver`). */
export const BEACON_COLOR = C.silver;
/** The body's interior (DESIGN.md `panel-deep`) — the hull hides what it covers. */
const BODY_FILL = C.panelDeep;

/** A marker / body design under review (see `CLIENT_CONFIG.beacons.glyph`). */
export type BeaconGlyph = 'station' | 'transmitter';

/** Pure: is this phase drawn DASHED (charted — a signal, nothing in the water)? */
export function beaconDashed(phase: BeaconPhase): boolean {
  return phase === 'charted';
}

/** Pure: the presence multiplier of everything a beacon draws — 1 charted
 *  and afloat, falling linearly to 0 across the sink (`sink01`), 0 gone.
 *  Motion-blind: this is information. */
export function beaconFade(v: Pick<BeaconView, 'phase' | 'sink01'>): number {
  if (v.phase === 'gone') return 0;
  if (v.phase === 'sinking') return 1 - clamp01(v.sink01);
  return 1;
}

/** Pure: the marker's stroke alpha for a phase (charted dimmer than live). */
export function markerAlpha(phase: BeaconPhase): number {
  return beaconDashed(phase) ? B.markerChartedAlpha : B.markerLiveAlpha;
}

/** Pure: the range ring's stroke alpha for a phase. */
export function ringAlpha(phase: BeaconPhase): number {
  return beaconDashed(phase) ? B.ringChartedAlpha : B.ringLiveAlpha;
}

/** Pure: the range ring's radius (u) — the shared paying range, exactly. */
export function beaconRingRadiusU(): number {
  return CONFIG.beacons.rangeU;
}

/** Pure: the marker's radius in world u at `zoom` (px per u) — a constant
 *  screen size, never tighter than `bodyClearance` × the body radius. */
export function markerRadiusU(zoom: number, bodyRadiusU: number = CONFIG.beacons.bodyRadiusU): number {
  return Math.max(strokeWorldWidth(B.markerPx, zoom), bodyRadiusU * B.bodyClearance);
}

/** The body's look for a frame. */
export interface BeaconBodyLook {
  visible: boolean;
  alpha: number;
  /** 1 afloat, settling to the ship wreck scale (`CLIENT_CONFIG.ship.sunkScale`)
   *  across the sink — "lower in the water" in a top-down chart's one channel. */
  scale: number;
}

/** Pure: the body on the water — absent while only charted and once gone;
 *  full afloat; settling and fading with `sink01` while it sinks. */
export function beaconBodyLook(v: Pick<BeaconView, 'phase' | 'sink01'>): BeaconBodyLook {
  if (v.phase === 'charted' || v.phase === 'gone') return { visible: false, alpha: 0, scale: 1 };
  const s = v.phase === 'sinking' ? clamp01(v.sink01) : 0;
  return { visible: true, alpha: 1 - s, scale: 1 + (CLIENT_CONFIG.ship.sunkScale - 1) * s };
}

/** The decorative pulse for a frame: how far past the marker it has grown
 *  (screen px) and its alpha. */
export interface BeaconPulse {
  px: number;
  alpha: number;
}

const NO_PULSE: BeaconPulse = { px: 0, alpha: 0 };

/**
 * Pure: the transmission pulse — DECORATION, so it scales with the motion
 * `intensity` and is absent at 0, and absent while only charted (nothing is
 * transmitting yet). Grows from the marker out by `pulseGrowPx` every
 * `pulsePeriodMs`, fading as it grows, under the beacon's own fade.
 */
export function beaconPulse(nowMs: number, v: Pick<BeaconView, 'phase' | 'sink01'>, intensity: number): BeaconPulse {
  if (!(intensity > 0) || beaconDashed(v.phase) || v.phase === 'gone' || !Number.isFinite(nowMs)) return NO_PULSE;
  const period = B.pulsePeriodMs;
  const t = period > 0 ? (((nowMs % period) + period) % period) / period : 0;
  return { px: B.pulseGrowPx * t, alpha: B.pulseAlpha * (1 - t) * Math.min(1, intensity) * beaconFade(v) };
}

/** Pure: does a sprite drawn at `drawnZoom` need re-stroking at `zoom`? */
export function beaconNeedsRestroke(drawnZoom: number, zoom: number): boolean {
  if (!(drawnZoom > 0)) return true;
  return Math.abs(zoom - drawnZoom) > drawnZoom * B.redrawZoomFrac;
}

// --- drawing (Graphics in the sprite's LOCAL frame, centred on the beacon) ---

/** A circle, solid or dashed (`segments` dashes). */
function circleStroke(g: Graphics, r: number, dashed: boolean, segments: number, stroke: { width: number; color: number; alpha: number }): void {
  if (!dashed) {
    g.circle(0, 0, r).stroke(stroke);
    return;
  }
  for (const [a0, a1] of dashArcs(segments, B.dashDuty)) {
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
  }
  g.stroke(stroke);
}

/** Broadcast arcs either side of the centre: `(( · ))`. */
function waveArcs(g: Graphics, r: number, stroke: { width: number; color: number; alpha: number }): void {
  const half = Math.PI / 5;
  for (const k of [1, 1.6]) {
    for (const mid of [0, Math.PI]) {
      g.moveTo(Math.cos(mid - half) * r * k, Math.sin(mid - half) * r * k);
      g.arc(0, 0, r * k, mid - half, mid + half);
    }
  }
  g.stroke(stroke);
}

/** THE CHART MARKER + RANGE RING — re-stroked on a style or zoom change only. */
export function drawBeaconChart(g: Graphics, phase: BeaconPhase, zoom: number, glyph: BeaconGlyph): void {
  g.clear();
  const dashed = beaconDashed(phase);
  const ring = { width: strokeWorldWidth(B.ringStrokePx, zoom), color: BEACON_COLOR, alpha: ringAlpha(phase) };
  circleStroke(g, beaconRingRadiusU(), dashed, B.ringDashes, ring);
  const mark = { width: strokeWorldWidth(B.markerStrokePx, zoom), color: BEACON_COLOR, alpha: markerAlpha(phase) };
  const r = markerRadiusU(zoom);
  if (glyph === 'station') circleStroke(g, r, dashed, B.markerDashes, mark);
  else waveArcs(g, r, mark);
  g.circle(0, 0, strokeWorldWidth(B.dotPx, zoom)).fill({ color: BEACON_COLOR, alpha: markerAlpha(phase) });
}

/** THE BODY — the shared octagon at true size (local frame), dark interior
 *  under one silver line; the 'transmitter' design adds four guy-line spokes. */
export function drawBeaconBody(g: Graphics, zoom: number, glyph: BeaconGlyph): void {
  g.clear();
  const poly = beaconPolygon(0, 0);
  g.poly(poly.flatMap((p) => [p.x, p.y]), true).fill({ color: BODY_FILL, alpha: 1 });
  const line = { width: strokeWorldWidth(B.bodyStrokePx, zoom), color: BEACON_COLOR, alpha: 1 };
  g.poly(poly.flatMap((p) => [p.x, p.y]), true).stroke(line);
  if (glyph !== 'transmitter') return;
  for (let i = 1; i < poly.length; i += 2) {
    g.moveTo(0, 0);
    g.lineTo(poly[i].x, poly[i].y);
  }
  g.stroke({ ...line, width: line.width * 0.66 });
}

/** One wire slot's pooled sprites. */
interface BeaconSprite {
  chart: Container;
  marks: Graphics;
  pulse: Graphics;
  body: Graphics;
  /** What `marks` / `body` were stroked for (0 = never). */
  drawnZoom: number;
  drawnDashed: boolean | null;
  drawnGlyph: BeaconGlyph | null;
}

export class Beacons {
  private readonly sprites: BeaconSprite[] = [];
  /** The design drawn (`CLIENT_CONFIG.beacons.glyph`; the review page flips it). */
  glyph: BeaconGlyph = B.glyph;

  /** `chartLayer` = the fog-immune chart; `worldLayer` = the fogged water. */
  constructor(
    private readonly chartLayer: Container,
    private readonly worldLayer: Container,
  ) {}

  /**
   * Per render frame: draw `views` (this frame's live beacons) at camera
   * `zoom` (px per u). `nowMs` drives only the decorative pulse, scaled by the
   * motion `intensity` (0 at motion off). A slot absent from `views` hides.
   */
  render(views: readonly BeaconView[], nowMs: number, zoom: number, intensity: number): void {
    for (const s of this.sprites) {
      s.chart.visible = false;
      s.body.visible = false;
    }
    for (const v of views) this.show(this.spriteFor(v.slot), v, nowMs, zoom, intensity);
  }

  /** Force a re-stroke on the next frame (the review page's design / size dials). */
  invalidate(): void {
    for (const s of this.sprites) s.drawnZoom = 0;
  }

  private show(s: BeaconSprite, v: BeaconView, nowMs: number, zoom: number, intensity: number): void {
    this.restroke(s, v.phase, zoom);
    const fade = beaconFade(v);
    s.chart.visible = fade > 0;
    s.chart.position.set(v.x, v.y);
    s.chart.alpha = fade;
    const look = beaconBodyLook(v);
    s.body.visible = look.visible && look.alpha > 0;
    s.body.position.set(v.x, v.y);
    s.body.alpha = look.alpha;
    s.body.scale.set(look.scale);
    this.drawPulse(s, beaconPulse(nowMs, v, intensity), zoom, fade);
  }

  /** Re-stroke the marks and the body only when the style, design or zoom moved. */
  private restroke(s: BeaconSprite, phase: BeaconPhase, zoom: number): void {
    const dashed = beaconDashed(phase);
    const stale = beaconNeedsRestroke(s.drawnZoom, zoom) || s.drawnGlyph !== this.glyph;
    if (!stale && s.drawnDashed === dashed) return;
    drawBeaconChart(s.marks, phase, zoom, this.glyph);
    if (stale) drawBeaconBody(s.body, zoom, this.glyph);
    s.drawnZoom = zoom;
    s.drawnDashed = dashed;
    s.drawnGlyph = this.glyph;
  }

  /** The pulse ring — re-stroked per frame while it shows (≤ one circle per
   *  beacon), its alpha already carrying the beacon's fade. */
  private drawPulse(s: BeaconSprite, p: BeaconPulse, zoom: number, fade: number): void {
    s.pulse.clear();
    if (!(p.alpha > 0) || !(fade > 0)) return;
    const w = strokeWorldWidth(B.markerStrokePx, zoom);
    // The chart container already carries `fade`; the pulse's own alpha does
    // too, so divide it back out rather than fading the pulse twice.
    s.pulse.circle(0, 0, markerRadiusU(zoom) + strokeWorldWidth(p.px, zoom)).stroke({ width: w, color: BEACON_COLOR, alpha: p.alpha / fade });
  }

  private spriteFor(slot: number): BeaconSprite {
    let s = this.sprites[slot];
    if (s === undefined) {
      const chart = new Container();
      const marks = new Graphics();
      const pulse = new Graphics();
      chart.addChild(marks, pulse);
      const body = new Graphics();
      this.chartLayer.addChild(chart);
      this.worldLayer.addChild(body);
      s = { chart, marks, pulse, body, drawnZoom: 0, drawnDashed: null, drawnGlyph: null };
      this.sprites[slot] = s;
    }
    return s;
  }
}
