// THE SHIP CONSOLE (render/console/shipConsole.ts, Story 10.10 — plan O6 + R20 /
// R21 / R24, the hover preview R18). The pure part (the preview's value text)
// is unit-tested; the Pixi composition is built for real under
// jsdom with no renderer, as the globe / strip suites did: it shows, reads the
// hull and the indices off the view model, marks a hovered card's changes in
// amber and nothing else, and drops its breath on a real hide only.

import { describe, it, expect } from 'vitest';
import { Container, Graphics, Text } from 'pixi.js';
import { CONFIG, DEFAULT_CLASS_ID, DEFAULT_SHIFT, INDEX_IDS, effectiveStats } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { consoleLayout } from '../render/console/layout.js';
import { hoverPreview, shipReadouts, type PreviewMark, type ReadoutShip } from '../render/console/readouts.js';
import {
  PREVIEW_ARROW,
  ShipConsole,
  indexValueText,
  type ShipConsoleView,
} from '../render/console/shipConsole.js';
import { HelmGlyphStore } from '../render/helmGlyphs.js';

const C = CLIENT_CONFIG.colors;
const YOU: ReadoutShip = { cls: DEFAULT_CLASS_ID, cards: [], ib: {}, shift: DEFAULT_SHIFT };
const LAYOUT = consoleLayout(1920, 1080).ship;
const MAX_HP = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]).maxHp;

function view(over: Partial<ShipConsoleView> = {}): ShipConsoleView {
  return {
    hp: MAX_HP,
    maxHp: MAX_HP,
    repairHp: 0,
    hullHold: false,
    readouts: shipReadouts(YOU)!,
    preview: null,
    headingRad: 0,
    speed: 0,
    orderedDetent: 4,
    rudder: 0,
    kin: { maxSpeed: 10, reverseSpeed: 4 },
    lvl: 1,
    xp: 0.5,
    pts: 0,
    freeze: false,
    nowSec: 10,
    nowMs: 10_000,
    uiScale: 1,
    ...over,
  };
}

function build(): ShipConsole {
  return new ShipConsole(new Container(), new HelmGlyphStore({ ws: 0, ad: 0 }));
}

describe('indexValueText — the hover preview in place of a value (R18)', () => {
  const mark = (direction: 'up' | 'down'): PreviewMark => ({ key: 'index.armor', value: '120', raw: 120, from: 100, direction });

  it('prints the plain value with no mark, and the incoming value + its arrow under one', () => {
    expect(indexValueText(100, undefined)).toBe('100');
    expect(indexValueText(100, mark('up'))).toBe(`120${PREVIEW_ARROW.up}`);
    expect(indexValueText(100, mark('down'))).toBe(`120${PREVIEW_ARROW.down}`);
  });
});

describe('ShipConsole — the bed and the text rule (R21 / R23 / R24)', () => {
  function built(): Container {
    const layer = new Container();
    new ShipConsole(layer, new HelmGlyphStore({ ws: 0, ad: 0 })).update(view({ pts: 2 }), LAYOUT);
    return layer.children[0] as Container;
  }

  it('draws the dark-glass bed over the layout`s bed rect, first (beneath everything)', () => {
    const bed = built().children[0] as Graphics;
    const raw = bed.context.instructions as { action: string; data: { style?: { color?: number }; path?: { instructions: { action: string; data: number[] }[] } } }[];
    const fills = raw.filter((i) => i.action === 'fill' && i.data.style?.color === C.cardScrim).flatMap((i) => (i.data.path?.instructions ?? []).filter((q) => q.action === 'rect').map((q) => q.data.slice(0, 4)));
    const b = LAYOUT.bed;
    expect(fills).toContainEqual([b.x, b.y, b.w, b.h]);
  });

  it('draws every text at ≥ 14 px (labels) and every value ≥ 17 px / 600, at scale 1', () => {
    const texts = built().children.filter((c): c is Text => c instanceof Text);
    for (const t of texts) {
      expect(t.style.fontSize, t.text).toBeGreaterThanOrEqual(14);
      expect(t.scale.x, t.text).toBe(1);
      if (t.style.fontWeight === '600') expect(t.style.fontSize, t.text).toBeGreaterThanOrEqual(17);
    }
  });
});

describe('ShipConsole — the Pixi composition', () => {
  it('keeps the last heading on an unreadable one (no re-assign, no NaN on the glass)', () => {
    const c = build();
    c.update(view({ headingRad: 0 }), LAYOUT);
    const shown = c.headingReadout;
    c.update(view({ headingRad: Number.NaN }), LAYOUT);
    expect(c.headingReadout).toBe(shown);
  });

  it('starts hidden and shows on its first frame, with the hull percent off the view', () => {
    const c = build();
    expect(c.visible).toBe(false);
    c.update(view({ hp: Math.round(MAX_HP * 0.72) }), LAYOUT);
    expect(c.visible).toBe(true);
    expect(c.hullText).toBe('72%');
  });

  it('prints every index from the readouts, in phosphor, with no hover', () => {
    const c = build();
    c.update(view(), LAYOUT);
    const stats = effectiveStats(CONFIG.shipClasses[DEFAULT_CLASS_ID]);
    INDEX_IDS.forEach((id, i) => {
      expect(c.indexValueText(i)).toBe(String(stats[id]));
      expect(c.indexValueColor(i)).toBe(C.phosphor);
    });
  });

  it('turns EXACTLY the indices a hovered card changes amber, with the incoming value', () => {
    const c = build();
    const preview = hoverPreview(YOU, 'armor');
    c.update(view({ preview }), LAYOUT);
    const armor = INDEX_IDS.indexOf('armor');
    INDEX_IDS.forEach((id, i) => {
      const mark = preview?.get(`index.${id}`);
      expect(c.indexValueColor(i), id).toBe(mark === undefined ? C.phosphor : C.amber);
    });
    expect(c.indexValueColor(armor)).toBe(C.amber);
    expect(c.indexValueText(armor).endsWith(PREVIEW_ARROW.up)).toBe(true);
    // ...and the hover ends: back to phosphor, the plain value.
    c.update(view(), LAYOUT);
    expect(c.indexValueColor(armor)).toBe(C.phosphor);
  });

  it('shows the bank chip only while a level is banked', () => {
    const c = build();
    c.update(view({ pts: 0 }), LAYOUT);
    expect(c.chipVisible).toBe(false);
    c.update(view({ pts: 2, nowSec: 11 }), LAYOUT);
    expect(c.chipVisible).toBe(true);
  });

  it('breathes the hull fill below the amber line, and holds it steady above', () => {
    const c = build();
    c.update(view(), LAYOUT);
    const steady = c.hullFillAlpha;
    expect(steady).toBe(CLIENT_CONFIG.console.hull.fillAlpha);
    const low = Math.round(MAX_HP * 0.2);
    c.update(view({ hp: low, nowSec: 10 }), LAYOUT);
    c.update(view({ hp: low, nowSec: 10.2 }), LAYOUT);
    expect(c.hullFillAlpha).not.toBe(steady);
  });

  it('hideTransient keeps the console\'s state; hide drops it', () => {
    const c = build();
    c.update(view({ pts: 1 }), LAYOUT);
    c.hideTransient();
    expect(c.visible).toBe(false);
    c.update(view({ pts: 1, nowSec: 10.1 }), LAYOUT);
    expect(c.visible).toBe(true);
    c.hide();
    expect(c.visible).toBe(false);
  });
});
