// THE AIRDROPS ON THE WATER (Story 10.9, epic-10 amendment 18, Eric's R3/R4
// of 2026-11-08 and his crate rulings of the same day). Fed every frame from
// FrameMsg.drops (contact-like, sight-gated per observer, sanitized
// fail-closed by sim/dropView.ts before it lands here).
//
// WHAT IS DRAWN: inside sight, a crate shows its KIND and nothing else — NO
// numerals. ONE body — the 15 u pickup disc's inscribed square
// (`CONFIG.drops.radiusU`, R4, so what you see is the water you must touch) —
// with the kind's glyph inside (`drawEquipmentIcon`): since Story 12.4
// (epic-12 amendments 5(a) and 6(a)) every airdrop is an XP crate wearing the
// "+XP" linework (`'xp'`), and the WRECK crate keeps its own salvage glyph
// (`'wreck'`). On radar a drop is a plain anonymous blip — no art here (R3).
//
// COLOR: outline and glyph both in the KIND's color
// (`CLIENT_CONFIG.drops.kindColors`: the XP gauge's color, the wreck's white) at the mine
// marker's alpha, over a SMALL GLOW in the same color (Eric: "give all of
// them a small glow effect in their color") — the projectile tracer's
// underlay technique (render/projectiles.ts: a wider, low-alpha stroke under
// the line; no filter), two passes so it fades outward. No relation color (a
// drop has no owner), no alert tint (not a hazard), no motion.
//
// SHAPE (the fire.ts pattern): a PURE core — `crateStyleFor` (no Pixi) and
// `drawCrate` (one Graphics, world units, centered at 0,0) — and the thin
// `Drops` adapter: one Graphics per id, add/remove reconcile exactly like
// `Mines.sync` (the shared `reconcileLitZones` diff), placed once at spawn (a
// drop never moves).
//
// STORY 11.8 — THE CHART ICON (Eric 2026-11-15, render/chartMarks.ts). Zoomed
// out, while the crate's true square would draw under 10 px, the SAME crate
// (glow, square, glyph, in its kind's color) is drawn at a fixed 10 px
// (`drawCrateIcon`, screen size, created on first need), cross-fading with
// the true-size crate over the shared 30 % band — the salvage wreck too.

import { Graphics, type Container } from 'pixi.js';
import { CONFIG, type DropKind, type DropView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { reconcileLitZones } from './litZones.js';
import { drawEquipmentIcon } from './equipmentIcons.js';
import { chartIconAlpha, screenScale } from './chartMarks.js';

/** What a kind of crate is drawn with: its color and the glyph id
 *  `drawEquipmentIcon` answers (`'xp'` or `'wreck'`). */
export interface CrateKindStyle {
  color: number;
  glyphId: string;
}

/** Pure: a kind's color + glyph, read off CLIENT_CONFIG. */
export function crateStyleFor(kind: DropKind): CrateKindStyle {
  return { color: CLIENT_CONFIG.drops.kindColors[kind], glyphId: kind };
}

/** u — linework width (the mine marker's 1.5 u). */
const LINE_W = 1.5;

/** The glyph box: 70 % of the disc's inscribed square. */
const GLYPH_FRAC = 0.7;

/** u — the crate's true square side (the pickup disc's inscribed square). */
export const CRATE_SIDE_U = CONFIG.drops.radiusU * Math.SQRT2;

/** Paint a crate `side` across with `lineW` linework, its glow reach scaled
 *  by `glowScale` (1 = the world-unit glow), centered at (0, 0). */
function paintCrate(g: Graphics, kind: DropKind, side: number, lineW: number, glowScale: number, alpha: number): void {
  const { color, glyphId } = crateStyleFor(kind);
  const stroke = { width: lineW, color, alpha };
  const glow = CLIENT_CONFIG.drops.glow;
  g.clear();
  // The glow: the full reach at half alpha, then half the reach at full alpha.
  for (const [reach, a] of [[glow.widthU, glow.alpha / 2], [glow.widthU / 2, glow.alpha]] as const) {
    g.rect(-side / 2, -side / 2, side, side).stroke({ width: lineW + 2 * reach * glowScale, color, alpha: a });
  }
  g.rect(-side / 2, -side / 2, side, side).stroke(stroke);
  drawEquipmentIcon(g, glyphId, 0, 0, side * GLYPH_FRAC, stroke);
}

/** Draw a crate of `kind` onto `g` (cleared first) at (0, 0) in WORLD units:
 *  the glow under the square, then the square body and the kind's glyph, all
 *  in the kind's color. */
export function drawCrate(g: Graphics, kind: DropKind, alpha: number = CLIENT_CONFIG.drops.glyphAlpha): void {
  paintCrate(g, kind, CRATE_SIDE_U, LINE_W, 1, alpha);
}

/** THE CHART ICON (Story 11.8): the same crate in SCREEN px — `px` across
 *  (`chartMarks.iconPx` by default; the supply-drop mark passes its own),
 *  `iconLinePx` linework, the glow shrunk in proportion — for a Graphics
 *  scaled `1 / zoom`. */
export function drawCrateIcon(
  g: Graphics,
  kind: DropKind,
  alpha: number = CLIENT_CONFIG.drops.glyphAlpha,
  px: number = CLIENT_CONFIG.chartMarks.iconPx,
): void {
  paintCrate(g, kind, px, CLIENT_CONFIG.chartMarks.iconLinePx, px / CRATE_SIDE_U, alpha);
}

/** One crate's sprites: the true-size crate and its chart icon (lazy). */
interface CrateSprite {
  g: Graphics;
  kind: DropKind;
  icon: Graphics | null;
}

/** The thin adapter: one crate per drop id on the fogged `dropWorld` layer. */
export class Drops {
  private readonly sprites = new Map<string, CrateSprite>();

  constructor(private readonly layer: Container) {}

  /** Reconcile against this frame's (sanitized) drops: add new ids, remove
   *  vanished ones, leave survivors untouched — a drop never moves or changes. */
  sync(views: readonly DropView[]): void {
    const { add, remove } = reconcileLitZones(new Set(this.sprites.keys()), views);
    for (const id of remove) this.despawn(id);
    for (const v of add) this.spawn(v);
  }

  /** Per render frame. A crate has no motion and no tint; kept for the
   *  renderer contract. */
  render(_nowSec: number): void {}

  /**
   * Per render frame (Story 11.8): the chart-icon handover at `zoom` px per
   * u — the true crate wears `1 − a`, the 10 px icon `a`.
   */
  renderIcons(zoom: number): void {
    const a = chartIconAlpha(CRATE_SIDE_U * zoom);
    const scale = screenScale(zoom);
    for (const s of this.sprites.values()) {
      s.g.alpha = 1 - a;
      s.g.visible = a < 1;
      if (a > 0) this.showIcon(s, a, scale);
      else if (s.icon !== null) s.icon.visible = false;
    }
  }

  /** The sprite held for an id (test seam), or null. */
  spriteOf(id: string): Graphics | null {
    return this.sprites.get(id)?.g ?? null;
  }

  /** The chart icon's alpha for an id (0 while none shows; test seam), or
   *  null for an id we hold no sprite for. */
  iconAlphaAt(id: string): number | null {
    const s = this.sprites.get(id);
    if (!s) return null;
    return s.icon?.visible ? s.icon.alpha : 0;
  }

  private showIcon(s: CrateSprite, a: number, scale: number): void {
    if (s.icon === null) {
      s.icon = new Graphics();
      drawCrateIcon(s.icon, s.kind);
      s.icon.position.copyFrom(s.g.position);
      this.layer.addChild(s.icon);
    }
    s.icon.visible = true;
    s.icon.alpha = a;
    s.icon.scale.set(scale);
  }

  destroy(): void {
    for (const id of [...this.sprites.keys()]) this.despawn(id);
  }

  private spawn(v: DropView): void {
    if (this.sprites.has(v.id)) return; // a duplicate id in one frame draws once
    const g = new Graphics();
    drawCrate(g, v.c);
    g.position.set(v.x, v.y);
    this.layer.addChild(g);
    this.sprites.set(v.id, { g, kind: v.c, icon: null });
  }

  private despawn(id: string): void {
    const s = this.sprites.get(id);
    if (!s) return;
    s.g.destroy();
    s.icon?.destroy();
    this.sprites.delete(id);
  }
}
