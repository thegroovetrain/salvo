// THE SUPPLY-DROP MARK ON THE CHART (Story 12.4, epic-12 amendments 5(g) and
// 6(c); the radio beacons' chart layer until then). Fed every frame from
// sim/supplyChart.ts's rows — public facts plus the SHARED landing clock; this
// file derives nothing about a drop's life on its own.
//
// WHAT IT IS (Eric 2026-11-19: "I want their locations marked on the map
// before they drop … It disappears when the crates land, it should fade out
// over 10 sec or something"): the APPROVED bench's style B — a DASHED ring at
// the scatter radius (`CONFIG.supplyDrops.scatterU`, the circle the crates
// land inside) and a translucent fill of that circle, both in the XP gauge's
// color (`drops.kindColors.xp`). NO icon (Eric 2026-11-20, epic-12 amendment
// 9: "I don't want players confusing it for something they can collect. The
// circle itself is enough."). On EVERY captain's chart (fog-immune, the
// `supplyChart` layer) from charting.
//
// THE FADE: full strength until the crates land (`landT`); from the landing,
// ring + fill fade TOGETHER, LINEARLY, to nothing over
// `CLIENT_CONFIG.supplyDrops.fadeMs`; then the mark is gone. Information,
// not motion: the motion setting never touches it. No text, no timer.
//
// SHAPE (fire.ts's): a PURE core (no Pixi; unit-tested in
// __tests__/supplyChart.test.ts) — the fade and the ring's geometry — and a
// thin adapter that pools one ring per wire slot, re-strokes it only on a
// zoom change, and per frame touches only position, alpha and visibility (no
// allocation).

import { Container, Graphics } from 'pixi.js';
import { CONFIG } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { clamp01, dashArcs, strokeWorldWidth } from '../util/math.js';
import type { SupplyChartRow } from '../sim/supplyChart.js';

const S = CLIENT_CONFIG.supplyDrops;

/** The bench's ring: each of the `ringDashes` slices half lit, half gap. */
const DASH_DUTY = 0.5;

/** The mark's one color — the XP crate's (the XP gauge's token). */
export function supplyMarkColor(): number {
  return CLIENT_CONFIG.drops.kindColors.xp;
}

/**
 * Pure: the mark's presence at `nowMs` — 1 until `landT`, then falling
 * LINEARLY to 0 at `landT + fadeMs`, 0 after (gone). A non-finite clock or
 * landing reads 0 (never a NaN sprite); a non-positive fade is a hard cut at
 * the landing.
 */
export function supplyMarkAlpha(nowMs: number, landT: number, fadeMs: number = S.fadeMs): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(landT)) return 0;
  if (nowMs < landT) return 1;
  if (!(fadeMs > 0)) return 0;
  return 1 - clamp01((nowMs - landT) / fadeMs);
}

/** Pure: the ring's radius (u) — the shared scatter radius, exactly. */
export function supplyRingRadiusU(): number {
  return CONFIG.supplyDrops.scatterU;
}

/** Pure: does a ring stroked at `drawnZoom` need re-stroking at `zoom`? */
export function supplyNeedsRestroke(drawnZoom: number, zoom: number): boolean {
  if (!(drawnZoom > 0)) return true;
  return Math.abs(zoom - drawnZoom) > drawnZoom * S.redrawZoomFrac;
}

/** THE RING + FILL, in world units at (0, 0), the ring's width in screen px
 *  at `zoom`: the translucent fill of the circle, then the dashed ring. */
export function drawSupplyRing(g: Graphics, zoom: number): void {
  g.clear();
  const r = supplyRingRadiusU();
  const color = supplyMarkColor();
  g.circle(0, 0, r).fill({ color, alpha: S.fillAlpha });
  for (const [a0, a1] of dashArcs(S.ringDashes, DASH_DUTY)) {
    g.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    g.arc(0, 0, r, a0, a1);
  }
  g.stroke({ width: strokeWorldWidth(S.ringWidthPx, zoom), color, alpha: S.ringAlpha });
}

/** One wire slot's pooled sprites. */
interface SupplySprite {
  ring: Graphics;
  /** The zoom the ring was stroked for (0 = never). */
  drawnZoom: number;
}

export class SupplyDrops {
  private readonly sprites: SupplySprite[] = [];

  /** `layer` = the fog-free chart (`stage.layers.supplyChart`). */
  constructor(private readonly layer: Container) {}

  /**
   * Per render frame: draw `rows` (this frame's charted drops) at camera
   * `zoom` (px per u) against the server clock `nowMs`. A slot absent from
   * `rows`, or whose mark has faded out, hides.
   */
  render(rows: readonly SupplyChartRow[], nowMs: number, zoom: number): void {
    for (const s of this.sprites) {
      if (s === undefined) continue; // a hole: a lower slot was never charted
      s.ring.visible = false;
    }
    for (const row of rows) {
      const a = supplyMarkAlpha(nowMs, row.landT);
      if (a > 0) this.show(this.spriteFor(row.slot), row, a, zoom);
    }
  }

  /** Is a slot's mark showing, and at what alpha (test seam)? 0 when hidden. */
  alphaAt(slot: number): number {
    const s = this.sprites[slot];
    return s !== undefined && s.ring.visible ? s.ring.alpha : 0;
  }

  private show(s: SupplySprite, row: SupplyChartRow, a: number, zoom: number): void {
    if (supplyNeedsRestroke(s.drawnZoom, zoom)) {
      drawSupplyRing(s.ring, zoom);
      s.drawnZoom = zoom;
    }
    s.ring.visible = true;
    s.ring.alpha = a;
    s.ring.position.set(row.x, row.y);
  }

  private spriteFor(slot: number): SupplySprite {
    let s = this.sprites[slot];
    if (s === undefined) {
      const ring = new Graphics();
      this.layer.addChild(ring);
      s = { ring, drawnZoom: 0 };
      this.sprites[slot] = s;
    }
    return s;
  }
}
