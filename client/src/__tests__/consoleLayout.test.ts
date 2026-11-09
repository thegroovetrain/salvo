// THE CONSOLE LAYOUT SPINE (Story 10.10, plan O2–O6 + Eric's R20) — the
// relations the two consoles and the offer group must hold on the supported
// viewports: nothing overlaps, everything is on screen, the centre stays
// clear, the offer clears the weapons console, and the ship console fills the
// floor viewport's column (R20) while staying bottom-anchored on a taller one.

import { describe, it, expect } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import { monoCharWidth } from '../util/monoMeasure.js';
import {
  STATS_LINE_W,
  WEAPON_ROW_KINDS,
  ABILITY_KINDS,
  consoleHit,
  consoleLayout,
  rowSlot,
  shipConsoleHeight,
  shipFill,
  statsNeedTwoLines,
  SHIP_CONSOLE_MIN_H,
  type ConsoleLayout,
  type Rect,
} from '../render/console/layout.js';

const K = CLIENT_CONFIG.console;
const FLOOR = { w: 1366, h: 768 };
const REFERENCE = { w: 1920, h: 1080 };
const VIEWPORTS = [FLOOR, REFERENCE];

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(r: Rect, w: number, h: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
}

function bottom(r: Rect): number {
  return r.y + r.h;
}

/** Every rect the spine hands out, flattened. */
function allRects(l: ConsoleLayout): Rect[] {
  const s = l.ship;
  return [
    s.frame, s.hullLine, s.hullBar, ...s.segments, s.helmReadout, s.ladder, s.rudder, s.levelRow, s.bankChip, s.track,
    ...s.indices.flatMap((r) => [r, r.label, r.value, r.ladder, ...r.bars]),
    l.weapons.frame, ...l.weapons.rows.flatMap((r) => [r, r.line1, r.line2, r.stats]),
    ...l.abilities,
    l.offer.frame, l.offer.header, ...l.offer.cards, ...(l.offer.redraw === null ? [] : [l.offer.redraw]),
  ];
}

/** The whole weapons console including its ability buttons. */
function weaponsBlock(l: ConsoleLayout): Rect {
  const last = l.abilities[0];
  return { x: l.weapons.frame.x, y: l.weapons.frame.y, w: l.weapons.frame.w, h: bottom(last) - l.weapons.frame.y };
}

/** The growth cases the tests walk: none, the main battery only (the realistic
 *  countdown — no family weapon is fitted before the level-zero pick), and
 *  every row that can carry a long stats line. */
const GROWTH = {
  none: [],
  mainBattery: [true],
  everyGrowable: WEAPON_ROW_KINDS.map((k) => k !== 'secondaries'),
};

describe('consoleLayout — on screen, nothing overlapping (O2, O14)', () => {
  for (const vp of VIEWPORTS) {
    for (const countdown of [false, true]) {
      const growth = countdown ? [GROWTH.none, GROWTH.mainBattery] : Object.values(GROWTH);
      for (const statsTwoLine of growth) {
        const tag = `${vp.w}×${vp.h} countdown=${countdown} grown=${statsTwoLine.filter(Boolean).length}`;
        const l = consoleLayout(vp.w, vp.h, { countdown, statsTwoLine });

        it(`${tag}: every rect is inside the frame`, () => {
          for (const r of allRects(l)) expect(inside(r, vp.w, vp.h), JSON.stringify(r)).toBe(true);
        });

        it(`${tag}: the offer group, the weapons console and the ship console never overlap`, () => {
          const blocks = [l.offer.frame, weaponsBlock(l), l.ship.frame];
          for (let i = 0; i < blocks.length; i++) {
            for (let j = i + 1; j < blocks.length; j++) expect(overlaps(blocks[i], blocks[j])).toBe(false);
          }
        });

        it(`${tag}: the offer clears the weapons console by the ruled gap`, () => {
          expect(l.offerClear).toBe(true);
          expect(bottom(l.offer.frame) + K.offer.clearGap).toBeLessThanOrEqual(l.weapons.frame.y);
        });
      }
    }
  }

  it('keeps the screen centre clear by at least the ruled width at the floor', () => {
    const l = consoleLayout(FLOOR.w, FLOOR.h);
    expect(l.centerClear).toBeGreaterThanOrEqual(K.centerClearMin);
    expect(l.centerClear).toBe(l.weapons.frame.x - bottomRight(l.ship.frame));
  });

  it('bottom-anchors both consoles on the same inset', () => {
    for (const vp of VIEWPORTS) {
      const l = consoleLayout(vp.w, vp.h);
      expect(bottom(l.ship.frame)).toBe(vp.h - K.bottomInset);
      expect(bottom(l.abilities[0])).toBe(vp.h - K.bottomInset);
    }
  });

  it('reports — never throws — a viewport the offer cannot clear', () => {
    const l = consoleLayout(1366 / 1.25, 768 / 1.25, { countdown: true });
    expect(typeof l.offerClear).toBe('boolean');
  });
});

function bottomRight(r: Rect): number {
  return r.x + r.w;
}

describe('the weapons console — five row-buttons, then C · V · Shift (O4, O5)', () => {
  const l = consoleLayout(REFERENCE.w, REFERENCE.h, { statsTwoLine: [false, false, true] });

  it('stacks the rows top to bottom in the ruled order, one gap apart', () => {
    expect(l.weapons.rows.map((r) => r.kind)).toEqual([...WEAPON_ROW_KINDS]);
    for (let i = 1; i < l.weapons.rows.length; i++) {
      expect(l.weapons.rows[i].y - bottom(l.weapons.rows[i - 1])).toBe(K.row.gap);
    }
  });

  it('grows exactly the row whose stats line takes two lines', () => {
    const plain = consoleLayout(REFERENCE.w, REFERENCE.h);
    l.weapons.rows.forEach((r, i) => {
      expect(r.twoLine).toBe(i === 2);
      expect(r.h - plain.weapons.rows[i].h).toBe(i === 2 ? K.row.grownH - K.row.h : 0);
      expect(bottom(r.stats)).toBeLessThanOrEqual(bottom(r));
      expect(r.line2.y).toBeGreaterThanOrEqual(bottom(r.line1));
      expect(r.stats.y).toBeGreaterThanOrEqual(bottom(r.line2));
    });
  });

  it('lays the three ability buttons edge to edge across the console width', () => {
    expect(l.abilities.map((a) => a.kind)).toEqual([...ABILITY_KINDS]);
    expect(l.abilities[0].x).toBe(l.weapons.frame.x);
    expect(bottomRight(l.abilities[2])).toBe(bottomRight(l.weapons.frame));
    expect(l.abilities[0].y).toBeGreaterThan(bottom(l.weapons.rows[4]));
  });
});

describe('the offer group (O3)', () => {
  it('sits under the kill feed clearance on the right edge', () => {
    const l = consoleLayout(REFERENCE.w, REFERENCE.h);
    expect(l.offer.frame.y).toBe(K.killFeed.top + K.killFeed.clearance + K.killFeed.gap);
    expect(bottomRight(l.offer.frame)).toBe(bottomRight(l.weapons.frame));
  });

  it('lays four cards in a 2×2 grid inside its frame, none overlapping', () => {
    const l = consoleLayout(REFERENCE.w, REFERENCE.h, { countdown: true });
    expect(l.offer.cards).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) expect(overlaps(l.offer.cards[i], l.offer.cards[j])).toBe(false);
    }
    expect(bottom(l.offer.cards[3])).toBe(bottom(l.offer.frame));
  });

  it('carries REDRAW only at the countdown, beside the header and clear of the cards', () => {
    expect(consoleLayout(REFERENCE.w, REFERENCE.h).offer.redraw).toBeNull();
    const l = consoleLayout(FLOOR.w, FLOOR.h, { countdown: true });
    const redraw = l.offer.redraw!;
    expect(redraw).not.toBeNull();
    for (const c of l.offer.cards) expect(overlaps(redraw, c)).toBe(false);
    expect(overlaps(redraw, l.offer.header)).toBe(true);
  });
});

describe('the ship console fills the floor column (R20)', () => {
  it('reaches the chrome bar clearance at the floor viewport — no hole at the top', () => {
    const l = consoleLayout(FLOOR.w, FLOOR.h);
    expect(l.ship.frame.y).toBe(K.ship.topClearance);
  });

  it('keeps the floor height on a taller viewport, bottom-anchored with air above', () => {
    const floor = consoleLayout(FLOOR.w, FLOOR.h).ship.frame;
    const tall = consoleLayout(REFERENCE.w, REFERENCE.h).ship.frame;
    expect(tall.h).toBe(floor.h);
    expect(tall.y).toBeGreaterThan(K.ship.topClearance);
  });

  it('never shrinks below its minimum on a short viewport, never taller than its column', () => {
    expect(shipConsoleHeight(400)).toBe(SHIP_CONSOLE_MIN_H);
    for (const h of [600, 700, 768, 900]) expect(shipConsoleHeight(h)).toBeLessThanOrEqual(Math.max(SHIP_CONSOLE_MIN_H, h - K.bottomInset - K.ship.topClearance));
  });

  it('stacks hull, indices, helm and level top to bottom without overlap', () => {
    for (const vp of VIEWPORTS) {
      const s = consoleLayout(vp.w, vp.h).ship;
      const order = [s.hullLine, s.hullBar, ...s.indices, s.helmReadout, s.ladder, s.rudder, s.levelRow, s.track];
      for (let i = 1; i < order.length; i++) expect(order[i].y).toBeGreaterThanOrEqual(bottom(order[i - 1]));
      expect(bottom(s.track)).toBe(bottom(s.frame));
    }
  });

  it('spreads the index rows evenly (one seam, repeated)', () => {
    const rows = consoleLayout(FLOOR.w, FLOOR.h).ship.indices;
    const seams = rows.slice(1).map((r, i) => r.y - bottom(rows[i]));
    for (const s of seams) expect(s).toBeCloseTo(seams[0], 9);
  });

  it('right-aligns each index row`s five-bar tier ladder, clear of its value', () => {
    for (const row of consoleLayout(FLOOR.w, FLOOR.h).ship.indices) {
      expect(row.bars).toHaveLength(K.ship.tierBars);
      expect(bottomRight(row.bars[row.bars.length - 1])).toBe(bottomRight(row));
      for (let i = 1; i < row.bars.length; i++) expect(row.bars[i].x - bottomRight(row.bars[i - 1])).toBe(K.ship.tierBar.gap);
      expect(bottomRight(row.value)).toBeLessThanOrEqual(row.ladder.x);
      expect(bottomRight(row.label)).toBeLessThanOrEqual(row.value.x);
    }
  });

  it('cuts the hull bar into its segments, edge to edge with equal gaps', () => {
    const s = consoleLayout(FLOOR.w, FLOOR.h).ship;
    expect(s.segments).toHaveLength(K.ship.segments);
    expect(s.segments[0].x).toBe(s.hullBar.x);
    expect(bottomRight(s.segments[s.segments.length - 1])).toBeCloseTo(bottomRight(s.hullBar), 9);
  });
});

describe('the ship console spends its slack on the ELEMENTS first (R20, corrected)', () => {
  const G = K.ship.grow;
  const min = shipFill(SHIP_CONSOLE_MIN_H);
  const floor = consoleLayout(FLOOR.w, FLOOR.h).ship;

  it('grows no seam while any element is still short of its max', () => {
    // A height a few px over the minimum: the elements take all of it.
    const f = shipFill(SHIP_CONSOLE_MIN_H + 20);
    expect(f.grow).toBeGreaterThan(0);
    expect(f.grow).toBeLessThan(1);
    expect(f.sectionGap).toBe(min.sectionGap);
    expect(f.rowGap).toBe(min.rowGap);
    expect(f.indexRowH).toBeGreaterThan(min.indexRowH);
  });

  it('draws every element at its max at the floor viewport', () => {
    const f = floor.fill;
    expect(f.grow).toBe(1);
    expect(floor.indices[0].h).toBe(G.indexRowH);
    expect(f.indexValuePx).toBe(G.indexValue);
    expect(floor.indices[0].bars[0].w).toBe(G.tierBar.w);
    expect(floor.indices[0].bars[0].h).toBe(G.tierBar.h);
    expect(floor.hullBar.h).toBe(G.hullBarH);
    expect(floor.ladder.w).toBe(G.ladderW);
    expect(floor.ladder.h).toBe(G.ladderH);
    expect(floor.track.h).toBe(G.trackH);
  });

  it('grows the seams only once the elements are maxed, and still fills the column', () => {
    const f = floor.fill;
    expect(f.sectionGap).toBeGreaterThanOrEqual(G.sectionGap);
    expect(f.rowGap).toBeGreaterThanOrEqual(G.indexRowGap);
    // Every index row sits one seam below the last: the console is full height.
    expect(floor.indices[1].y - (floor.indices[0].y + floor.indices[0].h)).toBeCloseTo(f.rowGap, 9);
    expect(floor.frame.y).toBe(K.ship.topClearance);
  });
});

describe('statsNeedTwoLines — the measured growth hook', () => {
  const glyph = monoCharWidth(K.type.stats, K.type.statsTracking);
  const fit = Math.floor(STATS_LINE_W / glyph);

  it('keeps a line that fits the row on one line, and grows the first glyph over', () => {
    expect(statsNeedTwoLines('X'.repeat(fit))).toBe(false);
    expect(statsNeedTwoLines('X'.repeat(fit + 1))).toBe(true);
  });
});

describe('consoleHit — a press routes by the layout rects', () => {
  const l = consoleLayout(FLOOR.w, FLOOR.h);
  const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it('a row press carries the row and its loadout slot', () => {
    for (const row of l.weapons.rows) {
      expect(consoleHit(l, centre(row))).toEqual({ kind: 'slot', row: row.kind, slot: rowSlot(row.kind) });
    }
    expect(rowSlot('secondaries')).toBeNull();
    const slots = WEAPON_ROW_KINDS.map(rowSlot).filter((s) => s !== null);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it('an ability button press carries its ability', () => {
    for (const a of l.abilities) expect(consoleHit(l, centre(a))).toEqual({ kind: 'ability', ability: a.kind });
  });

  it('the ship console swallows, the water does not', () => {
    expect(consoleHit(l, centre(l.ship.frame))).toEqual({ kind: 'ship' });
    expect(consoleHit(l, { x: FLOOR.w / 2, y: FLOOR.h / 2 })).toBeNull();
  });
});
