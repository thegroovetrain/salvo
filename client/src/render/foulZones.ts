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
// family's firer-hue identity glow (litZones' `drawZoneGlow` — whose zone it
// is) and carries Eric's pick of three rendered candidates, "MURK AND NET"
// (amendment 69): a NORMAL-blend murk disc that DARKENS the water (lit and
// burn zones only ever add light), under a diagonal mesh of straight lines in
// the firer's hue, clipped analytically to the murk disc. Nothing animates —
// fouled water does not breathe; the only motion is the lit zone's expiry fade
// (`litZoneFade`, timestamp math off `until − serverNow`; no client timers).

import { Container, Graphics } from 'pixi.js';
import type { FoulZoneView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { resolveHue, retryHue, type HueFor, type HueState } from './hueLatch.js';
import { drawZoneGlow, litZoneFade, reconcileLitZones } from './litZones.js';

const Z = CLIENT_CONFIG.foulZone;
const MURK_COLOR = CLIENT_CONFIG.colors.foulMurk;

/** One straight net segment in zone-local coordinates. */
export interface NetSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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

/** Draw the murk: a NORMAL-blend disc at `murkFrac × r` plus a soft rim (an
 *  annulus out to `r` at half alpha — one stroke, no overlap, no gradient). */
function drawMurk(m: Graphics, r: number): void {
  const inner = r * Z.murkFrac;
  m.blendMode = 'normal';
  m.circle(0, 0, inner).fill({ color: MURK_COLOR, alpha: Z.murkAlpha });
  const rimW = r - inner;
  if (rimW > 0) m.circle(0, 0, inner + rimW / 2).stroke({ width: rimW, color: MURK_COLOR, alpha: Z.murkAlpha / 2 });
}

/** Draw the net in the firer's hue (clearing prior geometry — the recolor path
 *  redraws in place). */
function drawNet(net: Graphics, r: number, color: number): void {
  net.clear();
  net.blendMode = 'normal';
  const segs = netSegments(r * Z.murkFrac, Z.netSpacingU);
  if (segs.length === 0) return;
  for (const s of segs) net.moveTo(s.x1, s.y1).lineTo(s.x2, s.y2);
  net.stroke({ width: Z.netWidth, color, alpha: Z.netAlpha });
}

interface FoulSprite extends HueState {
  /** The zone root: its alpha carries the expiry fade, whole. */
  root: Container;
  glow: Graphics;
  net: Graphics;
  until: number; // server-clock expiry — drives the render() fade
  r: number; // zone radius (u) — needed to redraw on a firer-hue recolor
}

export class FoulZones {
  private readonly sprites = new Map<string, FoulSprite>();

  /** `layer` = chartRoot's litZone layer (fog-immune, above the base map) —
   *  the same layer the lit and burning zones draw in. */
  constructor(private readonly layer: Container) {}

  /**
   * Reconcile sprites against this observer's foul-zone list for the tick.
   * `hueFor` resolves each zone's firer id (`by`) to its personal hue — the
   * burning-zone precedent, retry and latch included. The caller passes
   * `f.foulZones ?? []` (frames omit the key when the observer sees none).
   */
  sync(zones: readonly FoulZoneView[], hueFor: HueFor): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), zones);
    for (const id of remove) this.despawn(id);
    for (const z of add) this.spawn(z, hueFor);
    for (const s of this.sprites.values()) retryHue(s, hueFor, (color) => this.paintHue(s, color));
  }

  /** Per render frame: fade each zone by its timestamp (until − serverNow).
   *  Nothing else moves. */
  render(serverNow: number): void {
    for (const { root, until } of this.sprites.values()) root.alpha = litZoneFade(until - serverNow);
  }

  /** How many foul zones are held (test seam). */
  get size(): number {
    return this.sprites.size;
  }

  private paintHue(s: FoulSprite, color: number): void {
    drawZoneGlow(s.glow, s.r, color);
    drawNet(s.net, s.r, color);
  }

  private spawn(z: FoulZoneView, hueFor: HueFor): void {
    const { color, colored, rev } = resolveHue(z.by, hueFor);
    const root = new Container();
    root.position.set(z.x, z.y);
    // Murk UNDER the identity glow so the firer-hue ring stays crisp on top of
    // the darkened water; the net last, over both.
    const murk = new Graphics();
    drawMurk(murk, z.r);
    const glow = new Graphics();
    const net = new Graphics();
    root.addChild(murk, glow, net);
    const s: FoulSprite = { root, glow, net, until: z.until, r: z.r, by: z.by, colored, rev };
    this.paintHue(s, color);
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
