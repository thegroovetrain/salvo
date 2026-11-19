// Story 12.3 Part A — the plate stacked on the corner bracket: the zoom-only
// name size (and the switch to the 5×7 pixel font under the floor), the pixel
// font's layout, the A2 hull bar, and the contact store's `hb`. Every
// expectation reads CONFIG / CLIENT_CONFIG; no value here is Eric's intent.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Graphics, type Container } from 'pixi.js';
import { CONFIG, SHIP_CLASS_IDS, type Contact } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { NAME_MAX } from '../util/text.js';
import { bracketHalfPx } from '../render/brackets.js';
import { NameplateLayer, PLATE_FONT_PX, nameFitAt, nameFitForHalf, plateStack } from '../render/nameplates.js';
import {
  CELL_W,
  GLYPH_H,
  GLYPH_W,
  foldName,
  pixelCells,
  pixelFontCovers,
  pixelRing,
  pixelTextWidth,
} from '../render/pixelFont.js';
import { drawHullBar, hullBarBlock, hullBarColor, hullBarWidthPx } from '../render/hullBars.js';
import { ContactStore } from '../net/snapshots.js';

const NP = CLIENT_CONFIG.nameplate;
const HB = CLIENT_CONFIG.hullBar;
const C = CLIENT_CONFIG.colors;
const BLOCKS = CONFIG.hullBar.blocks;

// jsdom has no canvas text metrics: swap ONLY Text for a stub that records its
// style writes (the nameplate tests' pattern).
const texts = vi.hoisted(() => [] as Array<{ text: string; style: Record<string, unknown>; visible: boolean }>);
vi.mock('pixi.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('pixi.js')>();
  class StubText {
    text: string;
    style: Record<string, unknown>;
    alpha = 1;
    visible = true;
    position = { x: 0, y: 0, set(x: number, y: number): void { this.x = x; this.y = y; } };
    anchor = { set(): void {} };
    constructor(o: { text: string; style: Record<string, unknown> }) {
      this.text = o.text;
      this.style = { ...o.style };
      texts.push(this);
    }
    destroy(): void {}
  }
  return { ...actual, Text: StubText };
});

/** A stub plate layer recording what is added to it. */
const recordingLayer = (): { layer: Container; added: unknown[] } => {
  const added: unknown[] = [];
  return { layer: { addChild: (c: unknown) => void added.push(c) } as unknown as Container, added };
};

beforeEach(() => {
  texts.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** The shortest hull class's length — the bracket every name fits. */
const REF_U = Math.min(...SHIP_CLASS_IDS.map((id) => CONFIG.shipClasses[id].hull.length));

describe('the name size — one size per zoom, from a NAME_MAX name fitting the bracket', () => {
  it('two names of different length at one zoom get the same size', () => {
    const { layer } = recordingLayer();
    const plates = new NameplateLayer(layer);
    plates.set('a', 'BO', 0x1);
    plates.set('b', 'BLACKWATER_SUE', 0x1);
    for (const zoom of [1.2, 2, 6]) {
      const look = { halfPx: 0, zoom, blocks: null };
      plates.place('a', 0, 0, 1, look);
      plates.place('b', 0, 0, 1, look);
      expect(texts[0].style.fontSize).toBe(texts[1].style.fontSize);
      expect(texts[0].style.fontSize).toBe(nameFitAt(zoom).px);
    }
  });

  it('is capped at the hud-micro size and snapped down to sizeQuantPx, never above the fit', () => {
    expect(nameFitForHalf(10_000)).toEqual({ pixel: false, px: PLATE_FONT_PX });
    const track = Number.parseFloat(CLIENT_CONFIG.type.registers.hudMicro.tracking);
    for (const half of [60, 75.5, 90]) {
      const fit = nameFitForHalf(half);
      if (fit.pixel) continue;
      expect(fit.px / NP.sizeQuantPx).toBeCloseTo(Math.round(fit.px / NP.sizeQuantPx), 9);
      expect(fit.px * NAME_MAX * (NP.advanceEm + track)).toBeLessThanOrEqual(2 * half + 1e-9);
      if (fit.px < PLATE_FONT_PX) expect((fit.px + NP.sizeQuantPx) * NAME_MAX * (NP.advanceEm + track)).toBeGreaterThan(2 * half);
    }
  });

  it('below the floor every name switches to the 5×7 pixel font together; at or above it, the mono', () => {
    expect(nameFitForHalf(CLIENT_CONFIG.chartMarks.bracketHalfPx).pixel).toBe(true);
    // the smallest bracket whose fit reaches the floor
    const track = Number.parseFloat(CLIENT_CONFIG.type.registers.hudMicro.tracking);
    const halfAtFloor = (NP.floorPx * NAME_MAX * (NP.advanceEm + track)) / 2;
    expect(nameFitForHalf(halfAtFloor)).toEqual({ pixel: false, px: NP.floorPx });
    expect(nameFitForHalf(halfAtFloor - 0.01).pixel).toBe(true);
    expect(nameFitAt(1e-3).pixel).toBe(true);
  });

  it('depends on the zoom through the shortest hull class bracket', () => {
    for (const zoom of [0.5, 1, 1.5, 3]) expect(nameFitAt(zoom)).toEqual(nameFitForHalf(bracketHalfPx(REF_U * zoom)));
  });
});

describe('the plate at the pixel-font floor', () => {
  const PIXEL_ZOOM = 0.05;
  it('premise: the zoom draws the pixel font', () => expect(nameFitAt(PIXEL_ZOOM).pixel).toBe(true));

  it('a table name hides its Text and shows its pixel Graphics, built ONCE at latch (no re-draw per frame)', () => {
    const { layer, added } = recordingLayer();
    const plates = new NameplateLayer(layer);
    plates.set('a', 'ÉRIC', 0x1);
    const pixel = added.find((c): c is Graphics => c instanceof Graphics && c.context.instructions.length > 0);
    expect(pixel).toBeDefined();
    const clear = vi.spyOn(Graphics.prototype, 'clear');
    for (let i = 0; i < 5; i++) plates.place('a', 10.4, 20.6, 1, { halfPx: 16, zoom: PIXEL_ZOOM, blocks: null });
    expect(clear).not.toHaveBeenCalled();
    expect(texts[0].visible).toBe(false);
    expect(pixel!.visible).toBe(true);
    expect([pixel!.position.x, pixel!.position.y]).toEqual([10, Math.round(plateStack(20.6).nameBottom)]); // whole screen px — no smoothing
  });

  it('a name with a character outside the table stays in the mono at the floor size, and never hides', () => {
    const { layer } = recordingLayer();
    const plates = new NameplateLayer(layer);
    plates.set('a', 'SHIP🚢', 0x1);
    plates.place('a', 0, 0, 1, { halfPx: 16, zoom: PIXEL_ZOOM, blocks: null });
    expect(texts[0].visible).toBe(true);
    expect(texts[0].style.fontSize).toBe(NP.floorPx);
  });
});

describe('pixelFont — the 5×7 layout', () => {
  it('cells are CELL_W apart with the last gap dropped', () => {
    expect(pixelTextWidth(1)).toBe(GLYPH_W);
    expect(pixelTextWidth(14)).toBe(14 * CELL_W - (CELL_W - GLYPH_W));
    expect(pixelTextWidth(0)).toBe(0);
  });

  it('each glyph lies in its 5×7 box, the next one CELL_W to the right', () => {
    const one = pixelCells('A');
    const two = pixelCells('AA');
    expect(two.length).toBe(2 * one.length);
    for (let i = 0; i < one.length; i += 2) {
      expect(one[i]).toBeGreaterThanOrEqual(0);
      expect(one[i]).toBeLessThan(GLYPH_W);
      expect(one[i + 1]).toBeLessThan(GLYPH_H);
      expect(two[one.length + i]).toBe(one[i] + CELL_W);
    }
  });

  it('folds accents to the base letter; anything still outside the table is not covered', () => {
    expect(foldName('Éric Ñúñez')).toBe('ERIC NUNEZ');
    expect(pixelCells('É')).toEqual(pixelCells('E'));
    expect(pixelFontCovers('Éric_7-B')).toBe(true);
    for (const s of ['🚢', '東郷', 'A+B']) expect(pixelFontCovers(s)).toBe(false);
  });

  it('a glow ring never covers a lit pixel and stays within its reach', () => {
    const cells = pixelCells('I');
    const lit = new Set<string>();
    for (let i = 0; i < cells.length; i += 2) lit.add(`${cells[i]},${cells[i + 1]}`);
    const ring = pixelRing(cells, 2, 1);
    expect(ring.length).toBeGreaterThan(0);
    for (let i = 0; i < ring.length; i += 2) {
      expect(lit.has(`${ring[i]},${ring[i + 1]}`)).toBe(false);
      let d = Infinity;
      for (let j = 0; j < cells.length; j += 2) d = Math.min(d, Math.max(Math.abs(ring[i] - cells[j]), Math.abs(ring[i + 1] - cells[j + 1])));
      expect(d).toBe(2); // outside the inner ring, inside the reach
    }
  });
});

describe('the hull bar (A2)', () => {
  it('is the bracket width up to the cap', () => {
    expect(hullBarWidthPx(HB.capPx / 4)).toBe(HB.capPx / 2);
    expect(hullBarWidthPx(HB.capPx)).toBe(HB.capPx);
    expect(hullBarWidthPx(HB.capPx * 10)).toBe(HB.capPx);
  });

  it('blocks fill the width with gapPx between them', () => {
    const w = HB.capPx;
    const first = hullBarBlock(w, 0);
    const last = hullBarBlock(w, BLOCKS - 1);
    expect(first.x).toBeCloseTo(-w / 2, 9);
    expect(last.x + last.w).toBeCloseTo(w / 2, 9);
    expect(hullBarBlock(w, 1).x - (first.x + first.w)).toBeCloseTo(HB.gapPx, 9);
  });

  it('colors: pale while healthy, amber at 2, the critical red at 1', () => {
    for (let b = HB.paleAtBlocks; b <= BLOCKS; b++) expect(hullBarColor(b)).toBe(C.hullBarPale);
    expect(hullBarColor(2)).toBe(C.amber);
    expect(hullBarColor(1)).toBe(C.hullBarCritical);
  });

  it('draws the lit blocks solid in their color and the lost ones as faint outlines', () => {
    for (let lit = 1; lit <= BLOCKS; lit++) {
      const g = new Graphics();
      drawHullBar(g, HB.capPx, lit);
      const ins = g.context.instructions as { action: string; data: { style?: { color?: number; alpha?: number } } }[];
      const solid = ins.filter((i) => i.action === 'fill' && i.data.style?.alpha === 1);
      expect(solid.map((i) => i.data.style?.color)).toEqual([hullBarColor(lit)]);
      const outlines = ins.filter((i) => i.action === 'stroke');
      expect(outlines.map((i) => i.data.style?.alpha)).toEqual(lit < BLOCKS ? [HB.lostAlpha] : []);
      g.destroy();
    }
  });

  it('the plate draws the bar only with blocks known, redraws it only on a width or count change', () => {
    const { layer, added } = recordingLayer();
    const plates = new NameplateLayer(layer);
    plates.set('a', 'ACE', 0x1);
    const bar = added.find((c): c is Graphics => c instanceof Graphics) as Graphics;
    plates.place('a', 0, 100, 1, { halfPx: 30, zoom: 1, blocks: null });
    expect(bar.visible).toBe(false);
    const clear = vi.spyOn(Graphics.prototype, 'clear');
    plates.place('a', 0, 100, 1, { halfPx: 30, zoom: 1, blocks: 3 });
    expect(bar.visible).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) plates.place('a', 5 * i, 100, 0.5, { halfPx: 30, zoom: 1, blocks: 3 });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(bar.alpha).toBe(0.5);
    plates.place('a', 0, 100, 1, { halfPx: 30, zoom: 1, blocks: 2 });
    expect(clear).toHaveBeenCalledTimes(2);
    plates.place('a', 0, 100, 0, { halfPx: 30, zoom: 1, blocks: 2 });
    expect(bar.visible, 'the bar follows the plate').toBe(false);
  });
});

describe('ContactStore.hullBlocksOf — the sighted row\'s `hb`', () => {
  const row = (hb: unknown): Contact => ({ id: 'e', x: 0, y: 0, heading: 0, speed: 0, cls: SHIP_CLASS_IDS[0], hb } as Contact);
  it('keeps a valid step, drops anything else, forgets it on prune', () => {
    const s = new ContactStore();
    s.pushFrame(0, [row(BLOCKS)]);
    expect(s.hullBlocksOf('e')).toBe(BLOCKS);
    for (const bad of [undefined, 0, BLOCKS + 1, 1.5, '2']) {
      s.pushFrame(0, [row(bad)]);
      expect(s.hullBlocksOf('e')).toBeUndefined();
    }
    s.pushFrame(0, [row(1)]);
    s.prune(1e9, 1);
    expect(s.hullBlocksOf('e')).toBeUndefined();
  });
});
