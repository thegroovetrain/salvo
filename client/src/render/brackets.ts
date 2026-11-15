// CORNER BRACKETS (Story 11.8, Eric 2026-11-15, the markers bench's
// candidate D). Zoomed out, a hull shorter than 24 px on screen is framed by
// four corner ticks of a 16 px half-box (a 32 px square: 24 / 2 + 4), ticks
// 6 px, line 1.5 px — SCREEN size at every zoom, axis-aligned (they never
// turn with the hull), centered on it, in its relation stroke (own cyan,
// everyone else red). Fading linearly across a band of 30 % of 24 centered on
// it: full at ≤ 20.4 px, gone at ≥ 27.6 px (`bracketAlpha`). The true-size
// hull still draws inside; the brackets wear the hull's own alpha (sight
// fade, the sinking settle, the rain dissolve), so a fading hull's frame
// fades with it.
//
// THE OWN HULL AND EVERY IN-SIGHT HULL — nothing else. A radar paint is not a
// hull view and never reaches here; a minimum hull size was rejected (Eric).
//
// ONE POOL, NO RE-STROKE: each frame is drawn once in white px units and
// given the relation color as its TINT and `1 / zoom` as its scale inside the
// camera-transformed `chartMark` layer.

import { Container, Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { bracketAlpha, screenScale } from './chartMarks.js';
import type { BracketSource, ShipView } from './ships.js';

const M = CLIENT_CONFIG.chartMarks;

/** Pure: the four corner ticks of a half-box `half` px with `tick` px arms,
 *  centered on (0, 0) — each a polyline [arm end, corner, arm end] as flat
 *  [x0, y0, x1, y1, x2, y2]. */
export function bracketTicks(half: number = M.bracketHalfPx, tick: number = M.bracketTickPx): number[][] {
  const t = Math.min(tick, half);
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([dx, dy]) => {
    const cx = dx * half;
    const cy = dy * half;
    return [cx - dx * t, cy, cx, cy, cx, cy - dy * t];
  });
}

/** Draw the bracket frame (white, px units, centered) onto `g`. */
export function drawBracket(g: Graphics): void {
  g.clear();
  for (const [x0, y0, x1, y1, x2, y2] of bracketTicks()) g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2);
  g.stroke({ width: M.bracketLinePx, color: CLIENT_CONFIG.colors.white, alpha: 1, cap: 'square', join: 'miter' });
}

export class HullBrackets {
  private readonly pool: Graphics[] = [];
  private readonly src: BracketSource = { x: 0, y: 0, lengthU: 0, color: 0, alpha: 0 };
  private used = 0;

  constructor(private readonly layer: Container) {}

  /** How many brackets are showing this frame (tests/debug). */
  get shown(): number {
    return this.used;
  }

  /** Per render frame, after every hull has this frame's pose: bracket the
   *  own hull and each `others` hull drawing small at `zoom` px per u. */
  render(own: ShipView, others: Iterable<ShipView>, zoom: number): void {
    this.used = 0;
    const scale = screenScale(zoom);
    this.mark(own, zoom, scale);
    for (const v of others) this.mark(v, zoom, scale);
    for (let i = this.used; i < this.pool.length; i++) this.pool[i].visible = false;
  }

  private mark(view: ShipView, zoom: number, scale: number): void {
    if (!view.bracketSource(this.src)) return;
    const a = bracketAlpha(this.src.lengthU * zoom) * this.src.alpha;
    if (!(a > 0)) return;
    const g = this.next();
    g.visible = true;
    g.position.set(this.src.x, this.src.y);
    g.scale.set(scale);
    g.tint = this.src.color;
    g.alpha = a;
  }

  private next(): Graphics {
    let g = this.pool[this.used];
    if (g === undefined) {
      g = new Graphics();
      drawBracket(g);
      this.layer.addChild(g);
      this.pool.push(g);
    }
    this.used++;
    return g;
  }
}
