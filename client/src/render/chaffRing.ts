// THE CHAFF OWNER'S RING (cycle 158, Eric 2026-09-30, epic-8 amendment 191).
//
// *"I don't want to see the false radar information the chaff is creating, but
// i do want *SOME* indication that chaff has been used in an area."* — then
// (AskUserQuestion) "Dashed ring on the water".
//
// The owner's OWN frame carries a self-private `you.chaff = { x, y, until }`
// (the burst point and the cloud's expiry — the `shield` precedent: it rides
// `you`, so no other observer ever receives it and the fakes stay withheld from
// the owner). This draws one dim phosphor DASHED circle of `CONFIG.chaff.radius`
// around that point on the fog-immune `chaff` chart layer (above the smoke
// screen — Eric 2026-10-01: *"Radar returns should never be below the smoke
// screen."*), its alpha falling linearly to 0 at
// `until`. A re-fire simply moves it (the server replaces the source); after
// `until` the key is absent and the ring is hidden.
//
// MOTION: nothing here animates. The fade is a pure function of SERVER TIME
// (`until − serverNow`), not of accumulated dt, and nothing pulses or moves —
// so there is no motion-intensity branch to take: the ring reads identically
// at every motion level, the static-dash vocabulary of the own-mine rings.

import { Graphics, type Container } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs } from '../util/math.js';

const K = CLIENT_CONFIG.chaffRing;

/** The ring's radius (u) — the cloud's own scatter radius, never a copy. */
export const CHAFF_RING_RADIUS = CONFIG.chaff.radius;

/** The own chaff cloud as the frame carries it (`OwnShip.chaff`). */
export interface OwnChaff {
  x: number;
  y: number;
  until: number;
}

/**
 * Pure: the ring's alpha at server time `now` — the base alpha on a fresh cloud,
 * falling linearly to 0 at `until`, clamped to [0, base]. Any non-finite input
 * (or a non-positive duration) reads as no ring.
 */
export function chaffRingAlpha(until: number, now: number, durationMs: number = CONFIG.chaff.durationMs): number {
  if (!Number.isFinite(until) || !Number.isFinite(now) || !(durationMs > 0)) return 0;
  return clamp01((until - now) / durationMs) * K.alpha;
}

/** The fallback dash count — the floor, and the whole answer for a bad knob. */
const MIN_DASHES = 8;

/** Pure: the dash count around the ring — the `dash + gap` pitch along the
 *  circumference, at least 8 so a mis-set knob still reads as dashed. A
 *  non-positive (or non-finite) pitch or radius returns a fixed 8: dividing by
 *  a zero pitch would hand `dashArcs` an Infinity and loop forever. */
export function chaffDashSegments(radius: number = CHAFF_RING_RADIUS, dash: number = K.dash, gap: number = K.gap): number {
  const pitch = dash + gap;
  const n = (2 * Math.PI * radius) / pitch;
  if (!(pitch > 0) || !Number.isFinite(n)) return MIN_DASHES;
  return Math.max(MIN_DASHES, Math.round(n));
}

/** Pure: the dash's share of one pitch (0.5 for a non-positive pitch). */
export function chaffDashFraction(dash: number = K.dash, gap: number = K.gap): number {
  const pitch = dash + gap;
  return pitch > 0 && Number.isFinite(pitch) ? clamp01(dash / pitch) : 0.5;
}

/** The one ring, drawn once at the origin and moved/faded per frame. */
export class ChaffRing {
  private readonly g = new Graphics();

  /** `layer` = the fog-immune `chaff` chart layer, above `smoke` (world
   *  coordinates): the ring marks a point on the water that may sit outside
   *  the sight bubble. */
  constructor(layer: Container) {
    const stroke = { width: K.width, color: CLIENT_CONFIG.colors.phosphor, alpha: 1 };
    const r = CHAFF_RING_RADIUS;
    for (const [a0, a1] of dashArcs(chaffDashSegments(r), chaffDashFraction())) {
      this.g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
      this.g.arc(0, 0, r, a0, a1);
    }
    this.g.stroke(stroke);
    this.g.visible = false;
    layer.addChild(this.g);
  }

  /** Per render frame: show the ring at the own cloud (or hide it). `chaff` is
   *  `net.you?.chaff`; `now` is the server-clock estimate (ms). */
  render(chaff: OwnChaff | null | undefined, now: number): void {
    const a = chaff ? chaffRingAlpha(chaff.until, now) : 0;
    if (!chaff || a <= 0 || !Number.isFinite(chaff.x) || !Number.isFinite(chaff.y)) {
      this.g.visible = false;
      return;
    }
    this.g.position.set(chaff.x, chaff.y);
    this.g.alpha = a;
    this.g.visible = true;
  }

  /** Test seams. */
  get visible(): boolean {
    return this.g.visible;
  }

  get alpha(): number {
    return this.g.alpha;
  }

  get position(): { x: number; y: number } {
    return { x: this.g.position.x, y: this.g.position.y };
  }
}
