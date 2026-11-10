// THE AIRDROPS ON THE WATER (Story 10.9, epic-10 amendment 18, Eric's R3/R4
// of 2026-11-08 and his crate rulings of the same day). Fed every frame from
// FrameMsg.drops (contact-like, sight-gated per observer, sanitized
// fail-closed by sim/dropView.ts before it lands here).
//
// WHAT IS DRAWN: inside sight, a crate shows its KIND and nothing else — the
// bonus is rolled AT PICKUP (Eric: "I only need to know that it's there, and
// what type of upgrade it is (icon + color)"), so there are NO numerals. ONE
// body — the 15 u pickup disc's inscribed square (`CONFIG.drops.radiusU`, R4,
// so what you see is the water you must touch) — with the kind's glyph inside:
// an index stat wears its ladder's own hotbar/card linework
// (`drawEquipmentIcon`), the WRECK crate its own unique glyph (`'wreck'`). On
// radar a drop is a plain anonymous blip — no art here (R3).
//
// COLOR: outline and glyph both in the KIND's color
// (`CLIENT_CONFIG.drops.kindColors`, Eric's 2026-11-09 ruling) at the mine
// marker's alpha, over a SMALL GLOW in the same color (Eric: "give all of
// them a small glow effect in their color") — the projectile tracer's
// underlay technique (render/projectiles.ts: a wider, low-alpha stroke under
// the line; no filter), two passes so it fades outward. No relation color (a
// drop has no owner), no alert tint (not a hazard), no motion.
//
// SHAPE (render/beacons.ts's): a PURE core — `crateStyleFor` (no Pixi) and
// `drawCrate` (one Graphics, world units, centered at 0,0) — and the thin
// `Drops` adapter: one Graphics per id, add/remove reconcile exactly like
// `Mines.sync` (the shared `reconcileLitZones` diff), placed once at spawn (a
// drop never moves).

import { Graphics, type Container } from 'pixi.js';
import { CONFIG, type DropKind, type DropView } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { reconcileLitZones } from './litZones.js';
import { drawEquipmentIcon } from './equipmentIcons.js';

/** What a kind of crate is drawn with: its color and the glyph id
 *  `drawEquipmentIcon` answers (an index stat's own line id, or `'wreck'`). */
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

/** Draw a crate of `kind` onto `g` (cleared first) at (0, 0) in WORLD units:
 *  the glow under the square, then the square body and the kind's glyph, all
 *  in the kind's color. */
export function drawCrate(g: Graphics, kind: DropKind, alpha: number = CLIENT_CONFIG.drops.glyphAlpha): void {
  const { color, glyphId } = crateStyleFor(kind);
  const stroke = { width: LINE_W, color, alpha };
  const side = CONFIG.drops.radiusU * Math.SQRT2;
  const glow = CLIENT_CONFIG.drops.glow;
  g.clear();
  // The glow: the full reach at half alpha, then half the reach at full alpha.
  for (const [reach, a] of [[glow.widthU, glow.alpha / 2], [glow.widthU / 2, glow.alpha]] as const) {
    g.rect(-side / 2, -side / 2, side, side).stroke({ width: LINE_W + 2 * reach, color, alpha: a });
  }
  g.rect(-side / 2, -side / 2, side, side).stroke(stroke);
  drawEquipmentIcon(g, glyphId, 0, 0, side * GLYPH_FRAC, stroke);
}

/** The thin adapter: one crate per drop id on the fogged `dropWorld` layer. */
export class Drops {
  private readonly sprites = new Map<string, Graphics>();

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

  /** The sprite held for an id (test seam), or null. */
  spriteOf(id: string): Graphics | null {
    return this.sprites.get(id) ?? null;
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
    this.sprites.set(v.id, g);
  }

  private despawn(id: string): void {
    const g = this.sprites.get(id);
    if (!g) return;
    g.destroy();
    this.sprites.delete(id);
  }
}
