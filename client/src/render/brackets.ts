// CORNER BRACKETS (Story 11.8, Eric 2026-11-15, the markers bench's
// candidate D; Story 12.3, Eric 2026-11-18). Four corner ticks of a half-box
// framing the hull — SCREEN size at every zoom, axis-aligned (they never turn
// with the hull), centered on it, in its relation stroke (own cyan, everyone
// else red), line 1.5 px.
//
// STORY 12.3 — EVERY ZOOM, THE WHOLE HULL: the zoom-out fade is gone. The
// half-box is `max(bracketHalfPx, onScreenHullLength / 2 + bracketHullPadPx)`
// (zoomed out today's 32 px square; zoomed in it grows with the hull) and the
// tick arms `max(bracketTickPx, bracketTickGrowth × half)`, capped at half (the
// bench's rule). A slight glow in the bracket's own color sits underneath
// (`chartMarks.glowPx` — the drops.ts precedent of wider, low-alpha passes; no
// filter). The brackets wear the hull's own alpha (sight fade, the sinking
// settle, the rain dissolve), so a fading hull's frame fades with it.
//
// THE OWN HULL AND EVERY IN-SIGHT HULL — nothing else. A radar paint is not a
// hull view and never reaches here; a minimum hull size was rejected (Eric).
//
// ONE POOL, RE-STROKED ONLY ON A SIZE CHANGE: each pooled frame is drawn in
// white px units, given the relation color as its TINT and `1 / zoom` as its
// scale inside the camera-transformed `chartMark` layer, and remembers the
// snapped half it was stroked at (`bracketQuantPx`): at a steady zoom nothing
// re-tessellates; a zoom step re-strokes only the frames whose snapped size moved.

import { Container, Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { screenScale } from './chartMarks.js';
import type { BracketSource, ShipView } from './ships.js';

const M = CLIENT_CONFIG.chartMarks;

/** Pure: the bracket's half-box (screen px) for a hull drawing `lengthPx`
 *  long on screen — never under `bracketHalfPx`, else the hull's half length
 *  plus the pad — snapped to `bracketQuantPx`. A non-finite length reads as
 *  the smallest box. */
export function bracketHalfPx(lengthPx: number): number {
  const raw = Number.isFinite(lengthPx) ? Math.max(M.bracketHalfPx, lengthPx / 2 + M.bracketHullPadPx) : M.bracketHalfPx;
  const q = M.bracketQuantPx;
  return q > 0 ? Math.round(raw / q) * q : raw;
}

/** Pure: a tick arm's length for a `half` px half-box — `bracketTickPx` at the
 *  least, growing at `bracketTickGrowth × half`, never longer than `half`. */
export function bracketTickLenPx(half: number): number {
  return Math.min(half, Math.max(M.bracketTickPx, M.bracketTickGrowth * half));
}

/** Pure: the glow's underlay passes as [reach a side (px), alpha] — the full
 *  reach (glowPx / 2) at half the alpha, then half the reach at the full alpha
 *  (render/drops.ts's crate glow). Shared by every Graphics mark that glows. */
export function glowPasses(): ReadonlyArray<readonly [number, number]> {
  const reach = M.glowPx / 2;
  return [
    [reach, M.glowAlpha / 2],
    [reach / 2, M.glowAlpha],
  ];
}

/** Pure: the four corner ticks of a half-box `half` px with `tick` px arms,
 *  centered on (0, 0) — each a polyline [arm end, corner, arm end] as flat
 *  [x0, y0, x1, y1, x2, y2]. */
export function bracketTicks(half: number = M.bracketHalfPx, tick: number = bracketTickLenPx(half)): number[][] {
  const t = Math.min(tick, half);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([dx, dy]) => {
    const cx = dx * half;
    const cy = dy * half;
    return [cx - dx * t, cy, cx, cy, cx, cy - dy * t];
  });
}

/** Draw the bracket frame for a `half` px half-box (white, px units,
 *  centered) onto `g`: the glow passes underneath, then the line. */
export function drawBracket(g: Graphics, half: number = M.bracketHalfPx): void {
  g.clear();
  const ticks = bracketTicks(half);
  const white = CLIENT_CONFIG.colors.white;
  for (const [reach, alpha] of glowPasses()) {
    for (const [x0, y0, x1, y1, x2, y2] of ticks) g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2);
    g.stroke({ width: M.bracketLinePx + 2 * reach, color: white, alpha, cap: 'square', join: 'miter' });
  }
  for (const [x0, y0, x1, y1, x2, y2] of ticks) g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2);
  g.stroke({ width: M.bracketLinePx, color: white, alpha: 1, cap: 'square', join: 'miter' });
}

/** A pooled bracket Graphics and the half it was last stroked at. */
interface Frame {
  g: Graphics;
  half: number;
}

export class HullBrackets {
  private readonly pool: Frame[] = [];
  private readonly src: BracketSource = { x: 0, y: 0, lengthU: 0, color: 0, alpha: 0 };
  private used = 0;
  private strokes = 0;

  constructor(private readonly layer: Container) {}

  /** How many brackets are showing this frame (tests/debug). */
  get shown(): number {
    return this.used;
  }

  /** How many times any pooled frame has been (re-)stroked (tests/perf). */
  get strokeCount(): number {
    return this.strokes;
  }

  /** Per render frame, after every hull has this frame's pose: bracket the
   *  own hull and each `others` hull at `zoom` px per u. */
  render(own: ShipView, others: Iterable<ShipView>, zoom: number): void {
    this.used = 0;
    const scale = screenScale(zoom);
    this.mark(own, zoom, scale);
    for (const v of others) this.mark(v, zoom, scale);
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].g.visible = false;
  }

  private mark(view: ShipView, zoom: number, scale: number): void {
    if (!view.bracketSource(this.src)) return;
    const a = this.src.alpha;
    if (!(a > 0)) return;
    const f = this.next();
    const half = bracketHalfPx(this.src.lengthU * zoom);
    if (half !== f.half) {
      drawBracket(f.g, half);
      f.half = half;
      this.strokes++;
    }
    const g = f.g;
    g.visible = true;
    g.position.set(this.src.x, this.src.y);
    g.scale.set(scale);
    g.tint = this.src.color;
    g.alpha = a;
  }

  /** Release every pooled bracket Graphics (Story 11.8 review) — the session
   *  teardown (main.ts's disposers). Idempotent. */
  destroy(): void {
    for (const f of this.pool) f.g.destroy();
    this.pool.length = 0;
    this.used = 0;
  }

  private next(): Frame {
    let f = this.pool[this.used];
    if (f === undefined) {
      f = { g: new Graphics(), half: Number.NaN };
      this.layer.addChild(f.g);
      this.pool.push(f);
    }
    this.used++;
    return f;
  }
}
