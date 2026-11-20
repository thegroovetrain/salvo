// Story 12.4 — the supply-drop chart reader (sim/supplyChart.ts) and the mark
// (render/supplyDrops.ts): rows off the public schema with the SHARED landing
// clock, the stale boundaries, and the mark's fade (full strength until the
// landing, linear to nothing over `fadeMs`, then gone). Numbers come from
// CONFIG / CLIENT_CONFIG, never pinned.

import { describe, expect, it } from 'vitest';
import { Container, Graphics } from 'pixi.js';
import { CONFIG, SUPPLY_WIRE_SLOTS, supplyCycleStartMs, supplyLandMs } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { supplyChartFrom, type SupplyChartRow, type SupplyPlane } from '../sim/supplyChart.js';
import {
  SupplyDrops,
  drawSupplyRing,
  supplyMarkAlpha,
  supplyMarkColor,
  supplyNeedsRestroke,
  supplyRingRadiusU,
} from '../render/supplyDrops.js';

const S = CLIENT_CONFIG.supplyDrops;
const ZONE_START = 100_000;

/** A plane with `count` live slots of cycle `cycle` at (10·i, 20·i). */
function plane(cycle: number, count: number, over: Partial<Record<string, number>> = {}): SupplyPlane {
  const p: Record<string, number> = { zoneStartT: ZONE_START, supplyCycle: cycle, supplyCount: count };
  for (let i = 0; i < SUPPLY_WIRE_SLOTS; i++) {
    p[`sup${i}X`] = 10 * i;
    p[`sup${i}Y`] = 20 * i;
  }
  return { ...p, ...over } as SupplyPlane;
}

const landOf = (cycle: number): number => supplyLandMs(supplyCycleStartMs(ZONE_START, cycle));

describe('supplyChartFrom — the rows', () => {
  it('reads every live slot with the shared landing time of its cycle', () => {
    const now = supplyCycleStartMs(ZONE_START, 1) + 1;
    const rows = supplyChartFrom(plane(1, 3), now);
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(rows[2]).toEqual({ slot: 2, x: 20, y: 40, landT: landOf(1) });
    for (const r of rows) expect(r.landT).toBe(supplyCycleStartMs(ZONE_START, 1) + CONFIG.supplyDrops.surfaceMs);
  });

  it('keeps a landed set (the mark fades; the cue reads it) until the zone clock leaves the cycle', () => {
    expect(supplyChartFrom(plane(0, 2), landOf(0) + 1)).toHaveLength(2);
    expect(supplyChartFrom(plane(0, 2), supplyCycleStartMs(ZONE_START, 1))).toEqual([]);
  });

  it('a slot at or past the live count is stale and never read; the count is clamped to the wire', () => {
    const now = ZONE_START + 1;
    expect(supplyChartFrom(plane(0, 1), now)).toHaveLength(1);
    expect(supplyChartFrom(plane(0, SUPPLY_WIRE_SLOTS + 5), now)).toHaveLength(SUPPLY_WIRE_SLOTS);
  });

  it('fails closed: no set, no zone clock, a junk count or a junk coordinate', () => {
    const now = ZONE_START + 1;
    expect(supplyChartFrom(plane(-1, 3), now)).toEqual([]);
    expect(supplyChartFrom(plane(0, 3, { zoneStartT: 0 }), now)).toEqual([]);
    expect(supplyChartFrom(plane(0, 1.5), now)).toEqual([]);
    expect(supplyChartFrom({} as SupplyPlane, now)).toEqual([]);
    expect(supplyChartFrom(plane(0, 2, { sup0X: Number.NaN }), now).map((r) => r.slot)).toEqual([1]);
  });

  it('reuses the caller`s array and rows (no per-frame allocation after the first)', () => {
    const out: SupplyChartRow[] = [];
    const now = ZONE_START + 1;
    const first = supplyChartFrom(plane(0, 2), now, out);
    const row0 = first[0];
    const again = supplyChartFrom(plane(0, 2), now + 1, out);
    expect(again).toBe(out);
    expect(again[0]).toBe(row0);
    expect(supplyChartFrom(plane(-1, 0), now, out)).toHaveLength(0);
  });
});

describe('supplyMarkAlpha — the fade', () => {
  const LAND = 500_000;
  it('is full strength from charting until the landing', () => {
    expect(supplyMarkAlpha(LAND - CONFIG.supplyDrops.surfaceMs, LAND)).toBe(1);
    expect(supplyMarkAlpha(LAND - 1, LAND)).toBe(1);
  });

  it('falls LINEARLY from the landing to nothing at landing + fadeMs, and is gone after', () => {
    expect(supplyMarkAlpha(LAND, LAND)).toBe(1);
    expect(supplyMarkAlpha(LAND + S.fadeMs / 4, LAND)).toBeCloseTo(0.75, 9);
    expect(supplyMarkAlpha(LAND + S.fadeMs / 2, LAND)).toBeCloseTo(0.5, 9);
    expect(supplyMarkAlpha(LAND + S.fadeMs, LAND)).toBe(0);
    expect(supplyMarkAlpha(LAND + S.fadeMs * 3, LAND)).toBe(0);
  });

  it('follows the fade dial; a junk clock or a non-positive fade never draws a NaN', () => {
    expect(supplyMarkAlpha(LAND + 100, LAND, 400)).toBeCloseTo(0.75, 9);
    expect(supplyMarkAlpha(LAND, LAND, 0)).toBe(0);
    expect(supplyMarkAlpha(Number.NaN, LAND)).toBe(0);
    expect(supplyMarkAlpha(LAND, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('the mark`s geometry', () => {
  it('rings the shared scatter radius, in the XP crate`s color', () => {
    expect(supplyRingRadiusU()).toBe(CONFIG.supplyDrops.scatterU);
    expect(supplyMarkColor()).toBe(CLIENT_CONFIG.drops.kindColors.xp);
  });

  it('draws the fill, then ringDashes dashes in one stroke at the configured screen width, alpha and color', () => {
    const g = new Graphics();
    const fills: { color: number; alpha: number }[] = [];
    const strokes: { width: number; color: number; alpha: number }[] = [];
    let moves = 0;
    const fill = g.fill.bind(g);
    const stroke = g.stroke.bind(g);
    const moveTo = g.moveTo.bind(g);
    g.fill = ((f: { color: number; alpha: number }) => (fills.push(f), fill(f))) as typeof g.fill;
    g.stroke = ((s: { width: number; color: number; alpha: number }) => (strokes.push(s), stroke(s))) as typeof g.stroke;
    g.moveTo = ((x: number, y: number) => (moves++, moveTo(x, y))) as typeof g.moveTo;
    const zoom = 0.25;
    drawSupplyRing(g, zoom);
    expect(fills).toEqual([{ color: supplyMarkColor(), alpha: S.fillAlpha }]);
    expect(strokes).toEqual([{ width: S.ringWidthPx / zoom, color: supplyMarkColor(), alpha: S.ringAlpha }]);
    expect(moves).toBe(S.ringDashes);
  });

  it('re-strokes only past the zoom throttle', () => {
    expect(supplyNeedsRestroke(0, 1)).toBe(true);
    expect(supplyNeedsRestroke(1, 1)).toBe(false);
    expect(supplyNeedsRestroke(1, 1 + S.redrawZoomFrac / 2)).toBe(false);
    expect(supplyNeedsRestroke(1, 1 + S.redrawZoomFrac * 2)).toBe(true);
  });
});

describe('SupplyDrops — the pooled adapter', () => {
  const LAND = 500_000;
  const row = (slot: number): SupplyChartRow => ({ slot, x: 5 * slot, y: 7, landT: LAND });

  it('shows the ring (no icon) at the spot at full strength before the landing, fading after', () => {
    const layer = new Container();
    const m = new SupplyDrops(layer);
    m.render([row(0), row(1)], LAND - 1, 0.5);
    expect(layer.children).toHaveLength(2); // one ring per slot, no icon (epic-12 amendment 9)
    expect(m.alphaAt(0)).toBe(1);
    expect(layer.children[0].position).toMatchObject({ x: 0, y: 7 });
    m.render([row(0), row(1)], LAND + S.fadeMs / 2, 0.5);
    expect(m.alphaAt(1)).toBeCloseTo(0.5, 9);
  });

  it('survives a hole in the slot pool (only slot 1 charted), render after render', () => {
    const layer = new Container();
    const m = new SupplyDrops(layer);
    expect(() => {
      m.render([row(1)], LAND - 1, 1);
      m.render([row(1)], LAND - 1, 1);
      m.render([], LAND - 1, 1);
    }).not.toThrow();
    expect(m.alphaAt(0)).toBe(0);
    expect(m.alphaAt(1)).toBe(0);
  });

  it('hides a faded-out mark and a slot absent from the rows, and reuses its sprites', () => {
    const layer = new Container();
    const m = new SupplyDrops(layer);
    m.render([row(0)], LAND, 1);
    m.render([row(0)], LAND + S.fadeMs, 1);
    expect(m.alphaAt(0)).toBe(0);
    expect(layer.children.every((c) => !c.visible)).toBe(true);
    m.render([row(0)], LAND - 1, 1);
    expect(m.alphaAt(0)).toBe(1);
    m.render([], LAND - 1, 1);
    expect(m.alphaAt(0)).toBe(0);
    expect(layer.children).toHaveLength(1); // the one slot's ring, reused
  });
});
