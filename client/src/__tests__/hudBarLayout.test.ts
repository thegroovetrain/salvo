// THE HUD BAR'S SPINE (render/console/layout.ts, Story 12.3 Part B, AC 27–35 /
// 40; epic-12 amendments 3 / 4). Contracts only: the bar stays on screen and
// on its side, the sections stack without overlap, the TIER MARK column and
// the key-chip slot share one x on every row, every refill bar has ONE fixed
// rect, Space-home and the offer group centre on the open water for both
// sides, and a press / hover routes to the element under it.

import { describe, it, expect } from 'vitest';
import { EQUIPMENT_NAME } from '../render/equipmentInfo.js';
import { CLIENT_CONFIG } from '../config.js';
import { monoTextWidth } from '../util/monoMeasure.js';
import {
  ABILITY_KINDS,
  BAR_MIN_H,
  WEAPON_ROW_KINDS,
  barHover,
  barLayout,
  consoleHit,
  consoleLayout,
  inRect,
  markColumn,
  offerLayout,
  openWater,
  openWaterOffset,
  refillRect,
  rowSlot,
  type BarLayout,
  type Rect,
} from '../render/console/layout.js';
import { consoleChipWidth } from '../render/console/skins.js';
import { ABILITY_READY_WORD, clockNumeral } from '../render/console/readouts.js';
import { HUD_SIDES, type HudSide } from '../settings/store.js';

const K = CLIENT_CONFIG.console;
const B = K.bar;

/** Logical viewports: the reference, the floor laptop at the 0.75 clamp, the
 *  125 % tier at 1080p, a 1440p screen, and a short window. */
const VIEWPORTS = [
  { w: 1920, h: 1080 },
  { w: 1821, h: 1024 },
  { w: 1536, h: 864 },
  { w: 2560, h: 1440 },
  { w: 1707, h: 819 },
];

const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inside = (a: Rect, b: Rect): boolean => a.x >= b.x - 1e-9 && a.y >= b.y - 1e-9 && a.x + a.w <= b.x + b.w + 1e-9 && a.y + a.h <= b.y + b.h + 1e-9;
const apart = (a: Rect, b: Rect): boolean => a.y + a.h <= b.y + 1e-9 || b.y + b.h <= a.y + 1e-9;

function beds(l: BarLayout): Rect[] {
  return [l.weapons.bed, l.abilities.bed, l.ship.bed, l.footer.bed];
}

function every<T>(fn: (vp: { w: number; h: number }, side: HudSide) => T): void {
  for (const vp of VIEWPORTS) for (const side of HUD_SIDES) fn(vp, side);
}

describe('the bar — one column on the player`s side', () => {
  it('is the bar`s width, its edge from its own side, inside the screen, every section on its bed in order', () => {
    every((vp, side) => {
      const l = barLayout(vp.w, vp.h, side);
      const screen = { x: 0, y: 0, w: vp.w, h: vp.h };
      expect(l.frame.w).toBe(B.w);
      expect(side === 'left' ? l.frame.x : vp.w - (l.frame.x + l.frame.w)).toBe(B.edge);
      expect(vp.h - (l.frame.y + l.frame.h)).toBe(B.bottom);
      const bs = beds(l);
      const fits = vp.h >= BAR_MIN_H + B.bottom;
      for (const b of bs) expect((!fits || inside(b, screen)) && inside(b, l.frame), `${vp.w}x${vp.h} ${side}`).toBe(true);
      for (let i = 1; i < bs.length; i++) {
        expect(bs[i].y).toBeGreaterThanOrEqual(bs[i - 1].y + bs[i - 1].h);
        expect(apart(bs[i], bs[i - 1])).toBe(true);
      }
    });
  });

  it('starts at the configured top wherever the viewport holds it, rises only when it cannot, and never overlaps itself', () => {
    every((vp, side) => {
      const l = barLayout(vp.w, vp.h, side);
      expect(l.frame.y).toBeLessThanOrEqual(B.top);
      if (vp.h >= BAR_MIN_H + B.bottom) expect(l.frame.y).toBeGreaterThanOrEqual(0);
    });
    expect(barLayout(1920, 1080).frame.y).toBe(B.top);
  });

  it('pins the footer to the bottom of the bar', () => {
    every((vp, side) => {
      const l = barLayout(vp.w, vp.h, side);
      expect(l.footer.bed.y + l.footer.bed.h).toBeCloseTo(l.frame.y + l.frame.h, 9);
    });
  });

  it('every tile, row and gauge sits inside its own bed; tiles never overlap', () => {
    every((vp, side) => {
      const l = barLayout(vp.w, vp.h, side);
      const groups: [Rect, Rect[]][] = [
        [l.weapons.bed, l.weapons.tiles],
        [l.abilities.bed, l.abilities.tiles],
        [l.ship.bed, l.ship.rows],
        [l.footer.bed, [l.footer.hull.gauge, l.footer.throttle.gauge, l.footer.level.gauge, l.footer.hull.value, l.footer.level.value]],
      ];
      for (const [bed, items] of groups) {
        for (const r of items) expect(inside(r, bed)).toBe(true);
        for (let i = 1; i < items.length && items !== groups[3][1]; i++) expect(apart(items[i], items[i - 1])).toBe(true);
      }
    });
  });

  it('the weapon tiles and the ability tiles run in the ruled order', () => {
    const l = barLayout(1920, 1080);
    expect(l.weapons.tiles.map((t) => t.kind)).toEqual([...WEAPON_ROW_KINDS]);
    expect(l.abilities.tiles.map((t) => t.kind)).toEqual([...ABILITY_KINDS]);
  });
});

describe('THE TIER MARK column (AC 40) — one x on every row from MAIN BATTERY to INTEL', () => {
  it('every weapon tile, ability tile and ship row puts the mark and the chip slot at the same x and width', () => {
    every((vp, side) => {
      const l = barLayout(vp.w, vp.h, side);
      const rows = [...l.weapons.tiles, ...l.abilities.tiles, ...l.ship.rows];
      for (const r of rows) {
        expect(r.tierMark.x).toBe(rows[0].tierMark.x);
        expect(r.tierMark.w).toBe(rows[0].tierMark.w);
        expect(r.chipSlot.x).toBe(rows[0].chipSlot.x);
        expect(r.chipSlot.w).toBe(rows[0].chipSlot.w);
        // the mark sits directly left of the chip slot, inside the row
        expect(r.tierMark.x + r.tierMark.w).toBeLessThanOrEqual(r.chipSlot.x);
        expect(inside(r.chipSlot, r)).toBe(true);
      }
    });
  });

  it('the column is a function of the row`s right edge alone', () => {
    expect(markColumn(500, 10).tierMark.x).toBe(markColumn(500, 300).tierMark.x);
    expect(markColumn(500, 10).chipSlot.x - markColumn(400, 10).chipSlot.x).toBe(100);
  });

  it('the five dots and the widest numeral (and its hover arrow form) fit the mark', () => {
    const M = B.tierMark;
    const dots = M.dots * M.dot + (M.dots - 1) * M.dotGap;
    expect(monoTextWidth('III', K.type.tier) + M.gap + dots).toBeLessThanOrEqual(M.w);
  });

  it('every key chip fits its fixed slot', () => {
    for (const glyph of ['LMB', 'RMB', 'Q', 'E', 'R', 'C', 'V', 'Shift']) expect(consoleChipWidth(glyph)).toBeLessThanOrEqual(B.chipSlotW);
  });

  it('the longest weapon name fits line 1 left of the mark', () => {
    const l = barLayout(1920, 1080);
    const t = l.weapons.tiles[0];
    const room = t.tierMark.x - t.line1.x;
    const longest = Math.max(...Object.values(EQUIPMENT_NAME).map((n) => monoTextWidth(n.toUpperCase(), K.type.name)));
    expect(longest).toBeLessThanOrEqual(room);
  });
});

describe('THE REFILL BARS never change size (Eric 2026-11-19)', () => {
  it('a refill bar is a function of its body alone — one rect for every state it can show', () => {
    const l = barLayout(1920, 1080);
    const bodies = [l.weapons.tiles.find((t) => t.kind === 'special')!, ...l.abilities.tiles];
    for (const t of bodies) {
      expect(t.refill).toEqual(refillRect(t.body));
      // the bar and its readout slot never overlap and stay inside the body
      expect(t.refill.track.x + t.refill.track.w).toBeLessThanOrEqual(t.refill.state.x);
      expect(inside(t.refill.track, t.body) && inside(t.refill.state, t.body)).toBe(true);
    }
  });

  it('every abilities` and the special`s bar shares one width — the same body, the same slot', () => {
    const l = barLayout(1920, 1080);
    const bars = [l.weapons.tiles.find((t) => t.kind === 'special')!.refill.track, ...l.abilities.tiles.map((t) => t.refill.track)];
    for (const b of bars) expect(b.w).toBe(bars[0].w);
  });

  it('the readout slot holds the widest readout it can ever show: READY, a tenths, a 1-digit and a 3-digit countdown', () => {
    const readouts = [ABILITY_READY_WORD, clockNumeral(1500), clockNumeral(7000), clockNumeral(999_000)];
    for (const text of readouts) expect(monoTextWidth(text, K.type.state), text).toBeLessThanOrEqual(B.stateW);
  });
});

describe('SPACE-HOME and the open water (AC 28)', () => {
  it('the home offset points into the open water by half the bar plus its edge', () => {
    expect(openWaterOffset('left')).toBeGreaterThan(0);
    expect(openWaterOffset('right')).toBeLessThan(0);
    expect(Math.abs(openWaterOffset('left'))).toBe((B.w + B.edge) / 2);
    expect(openWaterOffset('right')).toBe(-openWaterOffset('left'));
  });

  it('the screen centre plus the offset IS the centre of the open water beside the bar', () => {
    every((vp, side) => {
      const water = openWater(vp.w, vp.h, side);
      expect(vp.w / 2 + openWaterOffset(side)).toBeCloseTo(water.x + water.w / 2, 9);
      const bar = barLayout(vp.w, vp.h, side).frame;
      expect(water.x >= bar.x + bar.w || water.x + water.w <= bar.x).toBe(true);
    });
  });
});

describe('THE OFFER GROUP along the bottom (AC 35)', () => {
  it('centres its cards in the open water beside the bar, for both sides, clear of the bar', () => {
    every((vp, side) => {
      for (const countdown of [false, true]) {
        const o = offerLayout(vp.w, vp.h, side, countdown);
        const water = openWater(vp.w, vp.h, side);
        const items = [...o.cards, ...(o.redraw === null ? [] : [o.redraw])];
        const left = Math.min(...items.map((r) => r.x));
        const right = Math.max(...items.map((r) => r.x + r.w));
        expect((left + right) / 2).toBeCloseTo(water.x + water.w / 2, 9);
        const bar = barLayout(vp.w, vp.h, side).frame;
        for (const r of items) expect(r.x >= bar.x + bar.w || r.x + r.w <= bar.x, `${vp.w} ${side}`).toBe(true);
        expect(o.band.y + o.band.h).toBe(vp.h);
        for (const r of [o.header, ...items]) expect(inside(r, o.band)).toBe(true);
      }
    });
  });

  it('lays the four cards in one row, left to right, REDRAW only at the countdown', () => {
    const o = offerLayout(1920, 1080, 'left');
    expect(o.cards).toHaveLength(4);
    for (let i = 1; i < 4; i++) {
      expect(o.cards[i].y).toBe(o.cards[0].y);
      expect(o.cards[i].x).toBeGreaterThanOrEqual(o.cards[i - 1].x + o.cards[i - 1].w);
    }
    expect(o.redraw).toBeNull();
    expect(offerLayout(1920, 1080, 'left', true).redraw).not.toBeNull();
  });
});

describe('hit testing — a press routes to the element under it', () => {
  it('a tile returns its slot, an ability tile its ability, a bed swallows, the water is null', () => {
    every((vp, side) => {
      const l = consoleLayout(vp.w, vp.h, { side });
      for (const t of l.bar.weapons.tiles) expect(consoleHit(l, centre(t))).toEqual({ kind: 'slot', row: t.kind, slot: rowSlot(t.kind) });
      for (const a of l.bar.abilities.tiles) expect(consoleHit(l, centre(a))).toEqual({ kind: 'ability', ability: a.kind });
      expect(consoleHit(l, centre(l.bar.ship.rows[0]))).toEqual({ kind: 'ship' });
      expect(consoleHit(l, centre(l.bar.footer.bed))).toEqual({ kind: 'ship' });
      expect(consoleHit(l, { x: vp.w / 2, y: vp.h / 2 })).toBeNull();
    });
  });

  it('only weapon and ability tiles open the flyout; a ship row opens nothing (AC 32 / 34)', () => {
    const l = barLayout(1920, 1080);
    for (const t of l.weapons.tiles) expect(barHover(l, centre(t))).toEqual({ kind: 'weapon', row: t.kind });
    for (const a of l.abilities.tiles) expect(barHover(l, centre(a))).toEqual({ kind: 'ability', ability: a.kind });
    for (const r of l.ship.rows) expect(barHover(l, centre(r))).toBeNull();
  });

  it('inRect is inclusive top-left, exclusive bottom-right', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(inRect({ x: 0, y: 0 }, r)).toBe(true);
    expect(inRect({ x: 10, y: 5 }, r)).toBe(false);
  });
});
