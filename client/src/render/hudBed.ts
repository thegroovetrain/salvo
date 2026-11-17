// THE HUD BED (epic-10 amendment 18 R24) — the dark-glass bed every HUD area
// outside the consoles sits on so it reads over the radar returns: the
// `cardScrim` token at `hudBed.alpha`, a 1 px `hairline` edge, square corners
// (DESIGN.md Elevation & Depth §2's dark-glass register; R24 supersedes the
// Afterimage "no filled panels" rule for these surfaces). ONE definition for
// both media: Pixi `Graphics` (the chrome bar) and CSS (the offer group, the
// kill feed).

import type { Graphics } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex, cssRgba } from '../util/color.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBed;

/** A bed's rect, in the surface's own (logical) px. */
export interface BedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Pure: the CSS declarations of the bed (background + hairline edge, square). */
export function hudBedCss(): string {
  return [
    `background-color:${cssRgba(C.cardScrim, B.alpha)}`,
    `border:${B.edgeW}px solid ${cssHex(C.hairline)}`,
    'border-radius:0',
    'box-sizing:border-box',
  ].join(';');
}

/** Redraw `g` as the bed over `r` (cleared first; the edge sits inside the rect). */
export function drawHudBed(g: Graphics, r: BedRect): void {
  g.clear();
  const e = B.edgeW;
  g.rect(r.x, r.y, r.w, r.h).fill({ color: C.cardScrim, alpha: B.alpha });
  g.rect(r.x + e / 2, r.y + e / 2, r.w - e, r.h - e).stroke({ width: e, color: C.hairline });
}
