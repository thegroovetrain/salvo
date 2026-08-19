// Procedural equipment icons (Story 2.2) — Pixi Graphics LINEWORK only, one
// glyph per EquipmentId, drawn into a ~28px box centered on a hotbar slot and
// tinted by the slot's state (the mock's inline `currentColor` vectors). No
// image assets, no fills that would read as a panel: a hotbar slot is a
// floating outline with water showing through it.
//
// Each glyph builds paths in an (cx, cy, r) frame — r is HALF the icon box — and
// the single drawEquipmentIcon() wrapper strokes them all in one call, so the
// tint/alpha decision lives with the slot state, never inside a glyph.

import type { Graphics, StrokeInput } from 'pixi.js';
import type { EquipmentId } from '@salvo/shared';

type Glyph = (g: Graphics, cx: number, cy: number, r: number) => void;

/** Deck gun: breech block, angled barrel, a shell dot leaving the muzzle. */
const gun: Glyph = (g, cx, cy, r) => {
  const bx = cx - r * 0.7;
  const by = cy + r * 0.55;
  g.moveTo(bx, by).lineTo(bx + r * 0.55, by).lineTo(bx + r * 0.55, by - r * 0.5).lineTo(bx, by - r * 0.5).lineTo(bx, by);
  // barrel (two parallel rails) angled up-right
  g.moveTo(bx + r * 0.25, by - r * 0.5).lineTo(cx + r * 0.65, cy - r * 0.75);
  g.moveTo(bx + r * 0.55, by - r * 0.25).lineTo(cx + r * 0.95, cy - r * 0.5);
  g.circle(cx + r * 0.62, cy - r * 0.95, r * 0.14);
};

/** Torpedo: elongated body with a pointed nose, tail fins, wake ticks. */
const torpedo: Glyph = (g, cx, cy, r) => {
  const h = r * 0.34;
  g.moveTo(cx - r * 0.85, cy - h).lineTo(cx + r * 0.5, cy - h).lineTo(cx + r * 0.95, cy).lineTo(cx + r * 0.5, cy + h).lineTo(cx - r * 0.85, cy + h).lineTo(cx - r * 0.85, cy - h);
  g.moveTo(cx - r * 0.85, cy - h).lineTo(cx - r * 1.0, cy - r * 0.62);
  g.moveTo(cx - r * 0.85, cy + h).lineTo(cx - r * 1.0, cy + r * 0.62);
  g.moveTo(cx - r * 0.35, cy - h).lineTo(cx - r * 0.35, cy + h);
};

/** Mine: spiked sphere. */
const mine: Glyph = (g, cx, cy, r) => {
  const rr = r * 0.52;
  g.circle(cx, cy, rr);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92);
  }
};

/** Speed boost: a double chevron. */
const speedBoost: Glyph = (g, cx, cy, r) => {
  for (const dx of [-r * 0.5, r * 0.05]) {
    g.moveTo(cx + dx, cy - r * 0.7).lineTo(cx + dx + r * 0.55, cy).lineTo(cx + dx, cy + r * 0.7);
  }
};

/** Broadside barrage: twin barrels over a turret block. */
const broadside: Glyph = (g, cx, cy, r) => {
  const by = cy + r * 0.6;
  g.moveTo(cx - r * 0.7, by).lineTo(cx + r * 0.7, by).lineTo(cx + r * 0.5, by - r * 0.55).lineTo(cx - r * 0.5, by - r * 0.55).lineTo(cx - r * 0.7, by);
  g.moveTo(cx - r * 0.32, by - r * 0.55).lineTo(cx - r * 0.32, cy - r * 0.95);
  g.moveTo(cx + r * 0.32, by - r * 0.55).lineTo(cx + r * 0.32, cy - r * 0.95);
};

/** Star shells: a burst — eight rays around a small core. */
const starShells: Glyph = (g, cx, cy, r) => {
  g.circle(cx, cy, r * 0.22);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const inner = i % 2 === 0 ? 0.4 : 0.36;
    const outer = i % 2 === 0 ? 0.95 : 0.68;
    g.moveTo(cx + Math.cos(a) * r * inner, cy + Math.sin(a) * r * inner);
    g.lineTo(cx + Math.cos(a) * r * outer, cy + Math.sin(a) * r * outer);
  }
};

/** Decoy buoy: an anchored float with a masthead reflector. */
const decoyBuoy: Glyph = (g, cx, cy, r) => {
  g.circle(cx, cy + r * 0.25, r * 0.38);
  g.moveTo(cx, cy - r * 0.13).lineTo(cx, cy - r * 0.9);
  g.moveTo(cx, cy - r * 0.9).lineTo(cx + r * 0.5, cy - r * 0.62).lineTo(cx, cy - r * 0.38);
  g.moveTo(cx - r * 0.75, cy + r * 0.85).lineTo(cx + r * 0.75, cy + r * 0.85);
};

const GLYPHS: Record<EquipmentId, Glyph> = {
  gun,
  torpedo,
  mine,
  speedBoost,
  broadside,
  starShells,
  radarBuoy,
};

/** The empty (offer) slot's centered `+` — the same linework family. */
export function drawPlusGlyph(g: Graphics, cx: number, cy: number, size: number, style: StrokeInput): void {
  const r = size / 2;
  g.moveTo(cx - r, cy).lineTo(cx + r, cy);
  g.moveTo(cx, cy - r).lineTo(cx, cy + r);
  g.stroke(style);
}

/** Draw one equipment glyph centered at (cx, cy) inside a `size`-px box. */
export function drawEquipmentIcon(
  g: Graphics,
  id: EquipmentId,
  cx: number,
  cy: number,
  size: number,
  style: StrokeInput,
): void {
  GLYPHS[id](g, cx, cy, size / 2);
  g.stroke(style);
}
