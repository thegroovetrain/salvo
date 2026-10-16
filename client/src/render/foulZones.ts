// FOULING SHELL foul-zone rendering from FrameMsg.foulZones (Story 9.4, Eric
// ruling 2026-10-11, epic-9 amendments 61–69). Contact-like per-observer state,
// not events — recomputed per frame exactly like the burning zones
// (render/burnZones.ts), and drawn in the same fog-immune chartRoot layer.
//
// A HAZARD ONLY. A foul zone reveals nothing, extends no gun's reach and is not
// a lit zone, so nothing here feeds the fog holes, the projectile cull-keep or
// the flare reach. The slow it causes is the SERVER's call, adopted from the
// victim-private `you.fouledUntil` (sim/prediction.ts) — this module only
// draws the water so every observer who can see the zone can steer clear.
//
// THE ZONE READS AS ITS OWN KIND AT A GLANCE (ruling 68). It keeps the zone
// family's glow (litZones' `drawZoneGlow` — whose zone it is) and carries Eric's "WEED AND NET" (round-3 pick "bold", 2026-10-12). His
// words on staging: "The net is visible but the murk is not. I wanted them
// combined." then "There was one instance with little squiggle lines. I liked
// that, and wanted that combined with the net. Also, the net itself (and those
// squiggles) need to be more visible, because it's not readable right now."
// The sea is drawn near-black, so the old darkening murk was invisible: the
// SLICK is now a faint LIGHTER body, and the squiggles and the net carry the
// read. Layers, bottom → top: slick (normal), glow (the family ring, additive),
// net (clipped analytically to the slick), weed (seeded from the zone id so
// every observer sees the same squiggles).
//
// STORY 9.11 — THE GLOW AND THE NET ARE AN ALERT (Eric 2026-10-14/16, epic-9
// amendment 153 + ruling (d): "zone fill and foul net FOLLOW THE RING"). The
// firer's hue is gone: glow and net are drawn ONCE in white, and per frame both
// take one tint — own (`by === ownId`) white, anybody else's the shared
// yellow↔orange alert blend (render/alertBlend.ts; steady orange at motion
// off). The slick and the weed are never tinted and never redrawn.
//
// Motion: the weed layer as a whole sways a few units on an INTEGRATED phase
// (the hud.ts pulse idiom), motion-gated — at motion=off it holds still, the
// drawn strokes being the information. The zone root's alpha carries the lit
// zone's expiry fade whole (`litZoneFade`, timestamp math off
// `until − serverNow`; no client timers).

import { Container, Graphics } from 'pixi.js';
import { hashSeedText, mulberry32, type FoulZoneView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { OWN_TINT } from './alertBlend.js';
import { drawZoneGlow, litZoneFade, reconcileLitZones, zoneAlertTint } from './litZones.js';

const Z = CLIENT_CONFIG.foulZone;
const SLICK_COLOR = CLIENT_CONFIG.colors.foulSlick;
const WEED_COLOR = CLIENT_CONFIG.colors.foulWeed;
/** The net is DRAWN white; ownership is its per-frame tint. */
const NET_COLOR = CLIENT_CONFIG.colors.white;
const TAU = Math.PI * 2;
/** Points per weed polyline (8 segments along `weedLenU`). */
const WEED_POINTS = 9;
/** Largest frame gap (s) the weed-sway phase integrator advances across (the
 *  alertBlend / hud.ts precedent: a backgrounded tab must not jump the sway). */
const MAX_WEED_DT = 0.5;

/** One straight net segment in zone-local coordinates. */
export interface NetSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** One weed squiggle in zone-local coordinates: its midpoint, its heading
 *  (radians) and the phase (radians) of its sideways wave. */
export interface WeedStroke {
  x: number;
  y: number;
  heading: number;
  phase: number;
}

/**
 * Pure: the net's segments — straight lines at +45° and −45°, `spacing` apart,
 * each CLIPPED ANALYTICALLY to the disc of radius `R` centered on the origin.
 * A line at perpendicular offset `d` from the center meets the circle in a
 * chord of half-length √(R² − d²), so each segment is exactly that chord; no
 * mask, no per-frame work. Offsets step outward from 0 so the mesh is centered.
 */
export function netSegments(R: number, spacing: number): NetSegment[] {
  const out: NetSegment[] = [];
  if (!(R > 0) || !(spacing > 0)) return out;
  const k = Math.SQRT1_2;
  const n = Math.floor(R / spacing);
  for (let i = -n; i <= n; i++) {
    const d = i * spacing;
    const h = Math.sqrt(Math.max(0, R * R - d * d));
    if (h === 0) continue;
    // +45°: direction (k, k), normal (−k, k).
    out.push({ x1: -d * k - h * k, y1: d * k - h * k, x2: -d * k + h * k, y2: d * k + h * k });
    // −45°: direction (k, −k), normal (k, k).
    out.push({ x1: d * k - h * k, y1: d * k + h * k, x2: d * k + h * k, y2: d * k - h * k });
  }
  return out;
}

/**
 * Pure: the zone's weed layout, SEEDED from the zone id (mulberry32 over
 * hashSeedText) so every observer draws the same squiggles. `weedCount`
 * strokes, each midpoint uniform over the disc of radius
 * `slickFrac × r − weedLenU / 2` (polar with √u, so a whole stroke stays
 * inside the slick), a heading and a wave phase each uniform in [0, 2π).
 */
export function weedStrokes(id: string, r: number): WeedStroke[] {
  const rng = mulberry32(hashSeedText(id));
  const reach = Math.max(0, r * Z.slickFrac - Z.weedLenU / 2);
  const out: WeedStroke[] = [];
  for (let i = 0; i < Z.weedCount; i++) {
    const rad = reach * Math.sqrt(rng.next());
    const ang = rng.next() * TAU;
    out.push({ x: rad * Math.cos(ang), y: rad * Math.sin(ang), heading: rng.next() * TAU, phase: rng.next() * TAU });
  }
  return out;
}

/** Pure: advance the weed sway's PHASE (radians) by one frame at `weedHz` —
 *  INTEGRATED, never derived from absolute time (alertBlend's advanceAlertPhase). */
export function advanceWeedPhase(phase: number, dtSec: number): number {
  const step = Math.min(MAX_WEED_DT, Math.max(0, dtSec));
  return (phase + Z.weedHz * step * TAU) % TAU;
}

/** Draw the slick: a NORMAL-blend disc at `slickFrac × r` plus a soft rim (an
 *  annulus out to `r` at half alpha — one stroke, no overlap, no gradient). */
function drawSlick(g: Graphics, r: number): void {
  const inner = r * Z.slickFrac;
  g.blendMode = 'normal';
  g.circle(0, 0, inner).fill({ color: SLICK_COLOR, alpha: Z.slickAlpha });
  const rimW = r - inner;
  if (rimW > 0) g.circle(0, 0, inner + rimW / 2).stroke({ width: rimW, color: SLICK_COLOR, alpha: Z.slickAlpha / 2 });
}

/** Draw the net once, in white (ownership is the per-frame tint). */
function drawNet(net: Graphics, r: number): void {
  net.blendMode = 'normal';
  const segs = netSegments(r * Z.slickFrac, Z.netSpacingU);
  if (segs.length === 0) return;
  for (const s of segs) net.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2);
  net.stroke({ width: Z.netWidth, color: NET_COLOR, alpha: Z.netAlpha });
}

/** Trace one squiggle: `WEED_POINTS` points along its heading over
 *  `weedLenU`, offset sideways by `weedAmpU × sin(k·2π + phase)` (k = 0..1 —
 *  one hump each way, a squiggle). */
function traceWeed(g: Graphics, w: WeedStroke): void {
  const dx = Math.cos(w.heading);
  const dy = Math.sin(w.heading);
  for (let i = 0; i < WEED_POINTS; i++) {
    const k = i / (WEED_POINTS - 1);
    const along = (k - 0.5) * Z.weedLenU;
    const side = Z.weedAmpU * Math.sin(k * TAU + w.phase);
    const x = w.x + along * dx - side * dy;
    const y = w.y + along * dy + side * dx;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
}

/** Draw the weed layer once at spawn (it never recolors). */
function drawWeed(g: Graphics, id: string, r: number): void {
  g.blendMode = 'normal';
  const strokes = weedStrokes(id, r);
  if (strokes.length === 0) return;
  for (const w of strokes) traceWeed(g, w);
  g.stroke({ width: Z.weedWidth, color: WEED_COLOR, alpha: Z.weedAlpha, cap: 'round', join: 'round' });
}

interface FoulSprite {
  /** The zone root: its alpha carries the expiry fade, whole. */
  root: Container;
  glow: Graphics;
  net: Graphics;
  /** The weed squiggles: drawn once at spawn, swayed by position each frame. */
  weed: Graphics;
  until: number; // server-clock expiry — drives the render() fade
  /** Is this OUR zone (`by === ownId` at spawn)? Own = white, else the blend. */
  own: boolean;
}

/** The ownership tint lands on the glow and the net ONLY — never the slick or
 *  the weed (ruling (d): the fill and net follow the ring; the weed is
 *  unchanged). */
function paintTint(s: Pick<FoulSprite, 'glow' | 'net'>, tint: number): void {
  s.glow.tint = tint;
  s.net.tint = tint;
}

export class FoulZones {
  private readonly sprites = new Map<string, FoulSprite>();
  /** INTEGRATED weed-sway phase + the clock it last advanced at (the hud.ts
   *  pulse precedent — accumulated per frame, never derived from absolute time). */
  private weedPhase = 0;
  private lastWeedSec: number | null = null;

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map) —
   *  the same layer the lit and burning zones draw in. */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's foul-zone list for the tick.
   * `ownId` = this observer's session id; a sunk captain keeps it while
   * spectating, so their own zone stays white (their mines do too, by the
   * server's `own` flag); only a viewer with NO id (undefined) owns nothing.
   * The caller passes `f.foulZones ?? []` (frames omit the key
   * when the observer sees none).
   */
  sync(zones: readonly FoulZoneView[], ownId: string | undefined): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, ownId);
  }

  /**
   * Per render frame: fade each zone by its timestamp (until − serverNow),
   * tint its glow + net (own white / another's by the shared alert clock) and
   * sway the weed on its integrated phase. `nowSec` is the server-clock
   * estimate in SECONDS; omitting it holds the weed at offset 0 (exactly what
   * motion=off does) and does not advance the alert clock.
   */
  render(serverNow: number, nowSec?: number): void {
    const tint = zoneAlertTint(nowSec);
    const [ox, oy] = this.advanceWeed(nowSec);
    for (const s of this.sprites.values()) {
      s.root.alpha = litZoneFade(s.until - serverNow);
      paintTint(s, s.own ? OWN_TINT : tint);
      s.weed.position.set(ox, oy);
    }
  }

  /** Advance the weed phase to `nowSec` and return this frame's sway offset
   *  (motion-gated amplitude; the strokes themselves are information). */
  private advanceWeed(nowSec: number | undefined): [number, number] {
    if (nowSec === undefined) return [0, 0];
    const dt = this.lastWeedSec === null ? 0 : nowSec - this.lastWeedSec;
    this.lastWeedSec = nowSec;
    this.weedPhase = advanceWeedPhase(this.weedPhase, dt);
    const amp = motionScaled(Z.weedDriftU, settings.current.motion);
    return [amp * Math.sin(this.weedPhase), amp * Math.cos(this.weedPhase * 0.7)];
  }

  /** How many foul zones are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private spawn(z: FoulZoneView, ownId: string | undefined): void {
    const root = new Container();
    root.position.set(z.x, z.y);
    // Slick UNDER the glow so the ring stays crisp on top; the net over both;
    // the weed last, on top of everything.
    const slick = new Graphics();
    drawSlick(slick, z.r);
    const glow = new Graphics();
    drawZoneGlow(glow, z.r);
    const net = new Graphics();
    drawNet(net, z.r);
    const weed = new Graphics();
    drawWeed(weed, z.id, z.r);
    root.addChild(slick, glow, net, weed);
    const own = ownId !== undefined && z.by === ownId;
    const s: FoulSprite = { root, glow, net, weed, until: z.until, own };
    paintTint(s, own ? OWN_TINT : zoneAlertTint(undefined)); // right from the first draw
    this.layer.addChild(root);
    this.sprites.set(z.id, s);
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.root.destroy({ children: true });
    this.sprites.delete(id);
  }
}
