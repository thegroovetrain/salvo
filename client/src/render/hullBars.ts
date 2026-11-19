// THE HULL HEALTH BAR (Story 12.3, Eric 2026-11-18 — "Segmented bar is
// smart", "80px cap. Still A2"): `CONFIG.hullBar.blocks` blocks floated just
// above the corner bracket of every hull in sight, the own hull's included,
// under the name. It is `min(2 × half, capPx)` wide, centered on the hull,
// `heightPx` tall with `gapPx` between blocks.
//
// A2 COLORS: the filled blocks are pale while healthy (`paleAtBlocks` or more),
// amber at 2, the bright critical red at 1; a lost block is a 1 px pale outline
// at `lostAlpha`. The filled blocks carry the slight glow in their own color
// (brackets.ts `glowPasses`); lost outlines do not glow. The bar carries no words.
//
// The count is shared `hullBlocks()` — `Contact.hb` for a sighted hull, the own
// hull's from `OwnShip.hp` — so its steps land exactly where wounded smoke and
// fire start. Drawn once per (width, count) change; per frame only its
// position and alpha move (render/nameplates.ts owns the Graphics).

import type { Graphics } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { glowPasses } from './brackets.js';

const B = CLIENT_CONFIG.hullBar;
const C = CLIENT_CONFIG.colors;

/** Pure: the bar's width (screen px) above a `half` px bracket. */
export function hullBarWidthPx(half: number): number {
  return Math.min(2 * half, B.capPx);
}

/** Pure: the filled blocks' color for `blocks` lit (A2). */
export function hullBarColor(blocks: number): number {
  if (blocks >= B.paleAtBlocks) return C.hullBarPale;
  return blocks > 1 ? C.amber : C.hullBarCritical;
}

/** Pure: block `i`'s left edge and the block width, for a bar `width` px wide
 *  centered on x = 0 — `CONFIG.hullBar.blocks` equal blocks, `gapPx` apart. */
export function hullBarBlock(width: number, i: number): { x: number; w: number } {
  const n = CONFIG.hullBar.blocks;
  const w = (width - (n - 1) * B.gapPx) / n;
  return { x: -width / 2 + i * (w + B.gapPx), w };
}

/** Draw the bar (px units; x centered on 0, y from 0 down to `heightPx`) with
 *  `blocks` lit onto `g`: the glow under the lit blocks, the lit blocks, then
 *  the lost blocks' outlines. */
export function drawHullBar(g: Graphics, width: number, blocks: number): void {
  g.clear();
  const n = CONFIG.hullBar.blocks;
  const lit = Math.max(0, Math.min(n, blocks));
  const color = hullBarColor(lit);
  const h = B.heightPx;
  for (const [reach, alpha] of glowPasses()) {
    for (let i = 0; i < lit; i++) {
      const b = hullBarBlock(width, i);
      g.rect(b.x - reach, -reach, b.w + 2 * reach, h + 2 * reach);
    }
    if (lit > 0) g.fill({ color, alpha });
  }
  for (let i = 0; i < lit; i++) {
    const b = hullBarBlock(width, i);
    g.rect(b.x, 0, b.w, h);
  }
  if (lit > 0) g.fill({ color, alpha: 1 });
  const lw = B.lostLinePx;
  for (let i = lit; i < n; i++) {
    const b = hullBarBlock(width, i);
    g.rect(b.x + lw / 2, lw / 2, b.w - lw, h - lw);
  }
  if (lit < n) g.stroke({ width: lw, color: C.hullBarPale, alpha: B.lostAlpha });
}
