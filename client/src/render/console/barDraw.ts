// THE BAR'S DRAWING IDIOMS (Story 12.3 Part B) — the small Pixi helpers every
// bar painter shares: a mono Text, change-only writes, a tile outline with its
// glow, the key chip, a dashed polygon, the section bed. Carried over from
// Story 10.10's consoles (one blurred glow layer under one linework Graphics,
// `.text` written only on change, the readied amber chip).

import { Graphics, Text, type TextStyleFontWeight } from 'pixi.js';
import { CLIENT_CONFIG } from '../../config.js';
import { traceDashed, type PolyPoint } from '../../util/poly.js';
import { drawHudBed } from '../hudBed.js';
import { keyChipGlyphColor } from '../keyChip.js';
import { consoleChipWidth, floorScale, type ConsoleSkin, type TierMarkModel } from './skins.js';
import type { Rect } from './layout.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const T = K.type;
const MONO = CLIENT_CONFIG.type.mono;

/** A mono Text anchored at (`anchorX`, 0.5). */
export function monoText(size: number, weight: TextStyleFontWeight, fill: number, anchorX = 0, letterSpacing = 0): Text {
  const t = new Text({ text: '', style: { fontFamily: MONO, fontSize: size, fontWeight: weight, fill, letterSpacing } });
  t.anchor.set(anchorX, 0.5);
  return t;
}

/** A countdown numeral: the clock register with its dark outline (AC 30). */
export function clockText(): Text {
  const t = new Text({
    text: '',
    style: { fontFamily: MONO, fontSize: T.clock, fontWeight: '600', fill: C.textPrimary, stroke: { color: C.void, width: T.clockStroke, join: 'round' } },
  });
  t.anchor.set(0.5, 0.5);
  return t;
}

export function setText(t: Text, value: string): void {
  if (t.text !== value) t.text = value;
}

export function setFill(t: Text, color: number): void {
  if (t.style.fill !== color) t.style.fill = color;
}

/** Place a Text (hidden when empty); its scale holds it on the mono floor. */
export function place(t: Text, value: string, x: number, y: number, uiScale: number): void {
  t.visible = value !== '';
  setText(t, value);
  t.position.set(x, y);
  t.scale.set(floorScale(t.style.fontSize, uiScale));
}

/** The bar's section bed (AC 27): the HUD bed at the bar's `cardScrim` alpha,
 *  the 1 px hairline. */
export function drawBed(g: Graphics, r: Rect): void {
  drawHudBed(g, r, K.bar.bedAlpha);
}

/** A closed polygon's outline, dashed at the bar's dash period. */
export function dashedPoly(g: Graphics, pts: readonly PolyPoint[]): void {
  traceDashed(g, pts, K.bar.dash);
}

/** A tile's outline (`skin`) on `gfx`, its glow ring on `glow`; `wash` adds
 *  the hover tint inside. */
export function drawBox(gfx: Graphics, glow: Graphics, r: Rect, skin: ConsoleSkin, wash = 0): void {
  const washAlpha = Math.max(skin.washAlpha, wash);
  if (washAlpha > 0) gfx.rect(r.x, r.y, r.w, r.h).fill({ color: wash > skin.washAlpha ? C.amber : skin.border, alpha: washAlpha });
  const corners = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
  if (skin.dashed) dashedPoly(gfx, corners);
  else gfx.rect(r.x, r.y, r.w, r.h);
  gfx.stroke({ width: skin.width, color: skin.border, alpha: skin.borderAlpha });
  if (skin.glowPx <= 0 || skin.glowAlpha <= 0) return;
  const pad = skin.glowPx / 2;
  glow.rect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2).fill({ color: skin.border, alpha: skin.glowAlpha }).rect(r.x, r.y, r.w, r.h).cut();
}

/** The key chip right-aligned at `right`: filled amber when ARMED, a denied
 *  hairline while denied, the phosphor hairline otherwise. Returns its left x. */
export function drawChip(g: Graphics, t: Text, glyph: string, right: number, cy: number, opts: { armed: boolean; denied: boolean; uiScale: number }): number {
  const w = consoleChipWidth(glyph, floorScale(T.keyChip, opts.uiScale));
  const h = K.bar.keyChip;
  const x = right - w;
  const y = cy - h / 2;
  if (opts.armed) g.rect(x, y, w, h).fill({ color: C.amber, alpha: 1 });
  else g.rect(x, y, w, h).stroke({ width: K.lineW, color: opts.denied ? C.denied : C.phosphor, alpha: opts.denied ? 1 : 0.55 });
  setFill(t, keyChipGlyphColor(opts.armed));
  place(t, glyph, x + w / 2, cy, opts.uiScale);
  return x;
}

/** A Text pool grown on first need (a fit can add tubes mid-match). */
export function pooled(pool: Text[], k: number, make: () => Text, add: (t: Text) => void): Text {
  while (pool.length <= k) {
    const t = make();
    add(t);
    pool.push(t);
  }
  const t = pool[k];
  t.visible = true;
  return t;
}

/** A dot's outline alpha (the bench's .6) and the amber glow's. */
const DOT_EDGE = 0.6;
const DOT_GLOW = 0.35;

/**
 * THE TIER MARK (AC 40) in its column `r`: the five dots flush right, the
 * numeral right-aligned `gap` before them. A null model (an untiered line)
 * leaves the slot empty.
 */
export function drawTierMark(g: Graphics, t: Text, r: Rect, m: TierMarkModel | null, uiScale: number): void {
  const M = K.bar.tierMark;
  const cy = r.y + r.h / 2;
  if (m === null) {
    t.visible = false;
    return;
  }
  const dotsW = m.dots.length * M.dot + (m.dots.length - 1) * M.dotGap;
  const x0 = r.x + r.w - dotsW;
  setFill(t, m.color);
  place(t, m.numeral, x0 - M.gap, cy, uiScale);
  const rad = M.dot / 2;
  m.dots.forEach((d, k) => {
    const cx = x0 + k * (M.dot + M.dotGap) + rad;
    if (d === 'on') g.circle(cx, cy, rad).fill({ color: C.phosphor, alpha: 1 });
    else if (d === 'next') {
      g.circle(cx, cy, rad + 2).fill({ color: C.amber, alpha: DOT_GLOW });
      g.circle(cx, cy, rad - 0.5).stroke({ width: K.lineW, color: C.amber, alpha: 1 });
    } else g.circle(cx, cy, rad - 0.5).stroke({ width: K.lineW, color: C.silver, alpha: DOT_EDGE });
  });
}

/** A refill bar (AC 29 / 31): silver outline, phosphor fill to `frac` (full
 *  and bright when ready, dimmer while it refills), READY / the seconds at its
 *  right end. */
export function drawRefill(g: Graphics, t: Text, r: { track: Rect; state: Rect }, frac: number, ready: boolean, text: string, uiScale: number): void {
  const tr = r.track;
  g.rect(tr.x, tr.y, tr.w, tr.h).stroke({ width: K.lineW, color: C.silver, alpha: 1 });
  const p = ready ? 1 : Math.min(1, Math.max(0, Number.isFinite(frac) ? frac : 0));
  if (p > 0) g.rect(tr.x, tr.y, tr.w * p, tr.h).fill({ color: C.phosphor, alpha: ready ? REFILL_READY : REFILL_LOADING });
  setFill(t, ready ? C.phosphor : C.textPrimary);
  place(t, text, r.state.x + r.state.w, r.state.y + r.state.h / 2, uiScale);
}

/** The refill bar's fill alphas: ready, and refilling (the bench's .45). */
const REFILL_READY = 0.85;
const REFILL_LOADING = 0.45;
