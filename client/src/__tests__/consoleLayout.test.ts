// THE CONSOLE LAYOUT SPINE (Story 10.10, plan O2–O6 + epic-10 amendment 18's
// R21–R27, plan F2–F6 + round 3's C1/C2) — the relations the two consoles and
// the offer group must hold: nothing overlaps, everything sits on screen, the
// offer goes where the player's OFFER POSITION puts it (or falls back to the
// bottom row where its stack cannot clear), the weapons console is ONE uniform two-column box whose clocks
// never wrap, the ship console is compact (its height the sum of its parts,
// whatever the viewport), and every console register meets the text rule.
// Relations only — no px literal stands in for a contract.

import { describe, it, expect } from 'vitest';
import { CLIENT_CONFIG } from '../config.js';
import { monoTextWidth } from '../util/monoMeasure.js';
import { OFFER_POSITIONS, scaleTierEnabled, type OfferPos } from '../settings/store.js';
import {
  ABILITY_KINDS,
  CELL_H,
  CELL_INNER_W,
  MAX_CLOCKS,
  OFFER_TOP,
  SHIP_CONSOLE_H,
  WEAPON_ROW_KINDS,
  bedOf,
  consoleHit,
  consoleLayout,
  rowSlot,
  type ConsoleLayout,
  type Rect,
} from '../render/console/layout.js';

const K = CLIENT_CONFIG.console;
const V = K.viewport;
const TIERS = CLIENT_CONFIG.settings.scaleTiers;

/** Plan F1's viewport factor, computed here from its formula (not imported, so
 *  the spine's contracts do not lean on the code that scales the layer). */
function factor(w: number, h: number): number {
  return Math.min(V.max, Math.max(V.min, Math.min(w / V.refW, h / V.refH)));
}

/** The LOGICAL viewport a physical screen lays out in at a UI tier (%). */
function logical(phys: { w: number; h: number }, tier = 100): { w: number; h: number } {
  const f = factor(phys.w, phys.h) * (tier / 100);
  return { w: phys.w / f, h: phys.h / f };
}

/** F6's three physical screens: the reference, the 13" MacBook Pro default,
 *  the 1366×768 floor. */
const PHYSICAL = [{ w: 1920, h: 1080 }, { w: 1440, h: 900 }, { w: 1366, h: 768 }];
/** Their logical viewports at the 100 % tier, plus 1728×1080 (the 1440×900
 *  screen under a height-only factor of 0.8333), so the contract holds whichever
 *  side of the factor's min binds. */
const AT_100 = [...PHYSICAL.map((p) => logical(p)), { w: 1728, h: 1080 }];
const REFERENCE = logical(PHYSICAL[0]);

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inside(r: Rect, w: number, h: number): boolean {
  return r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;
}

function contains(outer: Rect, r: Rect): boolean {
  return r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w + 1e-9 && r.y + r.h <= outer.y + outer.h + 1e-9;
}

function bottom(r: Rect): number {
  return r.y + r.h;
}

function right(r: Rect): number {
  return r.x + r.w;
}

/** Every rect the spine hands out, flattened. */
function allRects(l: ConsoleLayout): Rect[] {
  const s = l.ship;
  return [
    s.bed, s.frame, s.hullLine, s.hullBar, ...s.segments, s.helmReadout, s.ladder, s.rudder, s.levelRow, s.bankChip, s.track,
    ...s.indices.flatMap((r) => [r, r.label, r.value, r.ladder, ...r.bars]),
    l.weapons.bed, l.weapons.frame, ...l.weapons.rows.flatMap((r) => [r, r.header, r.mounts, ...r.statLines]),
    ...l.abilities,
    l.offer.bed, l.offer.frame, l.offer.header, ...l.offer.cards, ...(l.offer.redraw === null ? [] : [l.offer.redraw]),
  ];
}

/** The three surfaces' beds (what the player sees as boxes). */
function beds(l: ConsoleLayout): Rect[] {
  return [l.offer.bed, l.weapons.bed, l.ship.bed];
}

function noBedOverlaps(l: ConsoleLayout): void {
  const b = beds(l);
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) expect(overlaps(b[i], b[j]), `${i}/${j}`).toBe(false);
}

const tag = (vp: { w: number; h: number }, countdown: boolean, pos: OfferPos = 'right'): string =>
  `${vp.w.toFixed(0)}×${vp.h.toFixed(0)} countdown=${countdown} offer=${pos}`;

/** Does `a` keep at least `gap` of water to `b`? */
function keepsClear(a: Rect, b: Rect, gap: number): boolean {
  return right(a) + gap <= b.x || right(b) + gap <= a.x || bottom(a) + gap <= b.y || bottom(b) + gap <= a.y;
}

/** The offer bed keeps the ruled gap to both consoles' beds. */
function offerClear(l: ConsoleLayout): void {
  for (const c of [l.ship.bed, l.weapons.bed]) expect(keepsClear(l.offer.bed, c, K.offer.clearGap), JSON.stringify(l.offer.bed)).toBe(true);
}

describe('F6 — the placement contract at the three physical screens (100 % tier), every OFFER POSITION', () => {
  for (const vp of AT_100) {
    for (const countdown of [false, true]) {
      for (const offerPos of OFFER_POSITIONS) {
        const l = consoleLayout(vp.w, vp.h, { countdown, offerPos });

        it(`${tag(vp, countdown, offerPos)}: every rect, every bed, is inside the frame; nothing overlaps; the offer keeps the gap`, () => {
          for (const r of allRects(l)) expect(inside(r, vp.w, vp.h), JSON.stringify(r)).toBe(true);
          noBedOverlaps(l);
          offerClear(l);
        });

        it(`${tag(vp, countdown, offerPos)}: the offer sits where the player put it, or falls back to the bottom row`, () => {
          expect([offerPos, 'bottom']).toContain(l.offerPlacement);
          if (offerPos !== 'right') expect(l.offerPlacement).toBe(offerPos); // LEFT and BOTTOM hold at 100 %
        });
      }

      const l = consoleLayout(vp.w, vp.h, { countdown });

      it(`${tag(vp, countdown)}: RIGHT is the default; on the right edge it stacks under the kill feed, flush with the weapons console`, () => {
        expect(consoleLayout(vp.w, vp.h, { countdown, offerPos: 'right' })).toEqual(l);
        if (l.offerPlacement !== 'right') return;
        expect(right(l.offer.bed)).toBe(right(l.weapons.bed));
        expect(right(l.offer.bed)).toBe(vp.w - K.sideInset);
        expect(l.offer.bed.y).toBeGreaterThanOrEqual(OFFER_TOP);
        expect(bottom(l.offer.bed) + K.offer.clearGap).toBeLessThanOrEqual(l.weapons.bed.y);
      });

      it(`${tag(vp, countdown)}: LEFT stacks on the left edge under the chrome bar, above the ship console`, () => {
        const o = consoleLayout(vp.w, vp.h, { countdown, offerPos: 'left' });
        expect(o.offer.bed.x).toBe(K.sideInset);
        expect(o.offer.bed.y).toBe(K.ship.topClearance);
        expect(bottom(o.offer.bed) + K.offer.clearGap).toBeLessThanOrEqual(o.ship.bed.y);
      });

      it(`${tag(vp, countdown)}: BOTTOM lays one row on the bottom inset, between the two consoles`, () => {
        const o = consoleLayout(vp.w, vp.h, { countdown, offerPos: 'bottom' });
        expect(bottom(o.offer.bed)).toBeCloseTo(vp.h - K.bottomInset, 9);
        for (const c of o.offer.cards) expect(c.y).toBe(o.offer.cards[0].y);
        for (let i = 1; i < 4; i++) expect(o.offer.cards[i].x - right(o.offer.cards[i - 1])).toBe(K.offer.gap);
        expect(o.offer.bed.x - K.offer.clearGap).toBeGreaterThanOrEqual(right(o.ship.bed));
        expect(right(o.offer.bed) + K.offer.clearGap).toBeLessThanOrEqual(o.weapons.bed.x);
      });

      it(`${tag(vp, countdown)}: the centre clear is reported, bed to bed, and holds the ruled width`, () => {
        expect(l.centerClear).toBe(l.weapons.bed.x - right(l.ship.bed));
        expect(l.centerClear).toBeGreaterThanOrEqual(K.centerClearMin);
      });

      it(`${tag(vp, countdown)}: both consoles stay below the chrome bar`, () => {
        expect(l.ship.bed.y).toBeGreaterThanOrEqual(K.ship.topClearance);
        expect(l.weapons.bed.y).toBeGreaterThanOrEqual(K.ship.topClearance);
      });
    }
  }

  it('bottom-anchors both consoles` beds on the insets', () => {
    for (const vp of AT_100) {
      const l = consoleLayout(vp.w, vp.h);
      expect(bottom(l.ship.bed)).toBe(vp.h - K.bottomInset);
      expect(l.ship.bed.x).toBe(K.sideInset);
      expect(bottom(l.weapons.bed)).toBeCloseTo(vp.h - K.bottomInset, 9);
      expect(right(l.weapons.bed)).toBeCloseTo(vp.w - K.sideInset, 9);
    }
  });
});

/** The water the bottom row has between the two consoles' beds, less the
 *  ruled gap on both sides, and the row's own bed width. */
function rowRoom(vp: { w: number; h: number }, countdown: boolean): { room: number; need: number } {
  const l = consoleLayout(vp.w, vp.h, { countdown, offerPos: 'bottom' });
  return { room: l.weapons.bed.x - right(l.ship.bed) - 2 * K.offer.clearGap, need: l.offer.bed.w };
}

describe('the fallback is the BOTTOM ROW (round 3) — short and reachable 125 % screens', () => {
  /** Every physical screen the 125 % tier is SELECTABLE on (its width gate),
   *  a 1280×720 screen at 100 %, and the ratified 1280×614 floor. */
  const TIER_125 = PHYSICAL.filter((p) => scaleTierEnabled(Math.max(...TIERS), p.w)).map((p) => logical(p, Math.max(...TIERS)));
  const SHORT = [...TIER_125, logical({ w: 1280, h: 720 }), logical({ w: 1280, h: 614 })];

  for (const vp of SHORT) {
    for (const countdown of [false, true]) {
      for (const offerPos of OFFER_POSITIONS) {
        const l = consoleLayout(vp.w, vp.h, { countdown, offerPos });

        it(`${tag(vp, countdown, offerPos)}: the chosen place or the bottom row, on screen, clear of both consoles`, () => {
          expect([offerPos, 'bottom']).toContain(l.offerPlacement);
          for (const r of allRects(l)) expect(inside(r, vp.w, vp.h), JSON.stringify(r)).toBe(true);
          noBedOverlaps(l);
          offerClear(l);
        });
      }
    }
  }

  it('a stack that cannot clear its console falls back to the row, and only then', () => {
    for (const vp of [...AT_100, ...SHORT]) {
      for (const countdown of [false, true]) {
        for (const offerPos of ['right', 'left'] as const) {
          const l = consoleLayout(vp.w, vp.h, { countdown, offerPos });
          const stack = bedOf(consoleLayout(vp.w, 4000, { countdown, offerPos }).offer.frame);
          const under = offerPos === 'right' ? l.weapons.bed : l.ship.bed;
          const clears = bottom(stack) + K.offer.clearGap <= under.y;
          expect(l.offerPlacement, tag(vp, countdown, offerPos)).toBe(clears ? offerPos : 'bottom');
        }
      }
    }
  });

  it('the row has room at every 100 % reference screen, 1280×720 and the 1280×614 floor', () => {
    const all = [...AT_100, logical({ w: 1280, h: 720 }), logical({ w: 1280, h: 614 })];
    for (const vp of all) {
      for (const countdown of [false, true]) {
        const { room, need } = rowRoom(vp, countdown);
        expect(need, tag(vp, countdown)).toBeLessThanOrEqual(room);
      }
    }
  });

  it('the countdown row is COMPACT (REDRAW under the header) at 1536×864 and clears both consoles by 12 px; WIDE at 1920×1080 and 1920×1200', () => {
    const small = { w: 1536, h: 864 };
    const c = consoleLayout(small.w, small.h, { countdown: true, offerPos: 'bottom' });
    expect(c.offer.redrawBelowHeader).toBe(true);
    expect(c.offer.bed.x - right(c.ship.bed)).toBeGreaterThanOrEqual(K.offer.clearGap);
    expect(c.weapons.bed.x - right(c.offer.bed)).toBeGreaterThanOrEqual(K.offer.clearGap);
    expect(c.offer.redraw!.y).toBeGreaterThanOrEqual(c.offer.header.y + c.offer.header.h);
    for (const vp of [{ w: 1920, h: 1080 }, { w: 1920, h: 1200 }]) {
      const w = consoleLayout(vp.w, vp.h, { countdown: true, offerPos: 'bottom' });
      expect(w.offer.redrawBelowHeader, tag(vp, true)).toBe(false);
      expect(w.offer.redraw!.x).toBeGreaterThanOrEqual(right(w.offer.cards[3]));
    }
    for (const vp of [small, ...[{ w: 1920, h: 1080 }, { w: 1920, h: 1200 }]]) {
      const l = consoleLayout(vp.w, vp.h, { countdown: true, offerPos: 'bottom' });
      for (const r of allRects(l)) expect(inside(r, vp.w, vp.h), JSON.stringify(r)).toBe(true);
      noBedOverlaps(l);
      offerClear(l);
    }
  });

  it('a short viewport falls back (the fallback is reachable)', () => {
    const vp = logical({ w: 1280, h: 720 });
    expect(consoleLayout(vp.w, vp.h, { countdown: true }).offerPlacement).toBe('bottom');
  });
});

describe('the weapons console — ONE uniform two-column box (R23)', () => {
  const l = consoleLayout(REFERENCE.w, REFERENCE.h);
  const rows = new Map(l.weapons.rows.map((r) => [r.kind, r]));
  const leftCol = ['mainBattery', 'secondaries'].map((k) => rows.get(k as never)!);
  const rightCol = ['torpedo', 'mines', 'special'].map((k) => rows.get(k as never)!);

  it('carries every weapon in the ruled order, Main Battery over Secondaries left, Q / E / R right', () => {
    expect(l.weapons.rows.map((r) => r.kind)).toEqual([...WEAPON_ROW_KINDS]);
    for (const c of leftCol) expect(c.x).toBe(l.weapons.frame.x);
    for (const c of rightCol) expect(right(c)).toBe(right(l.weapons.frame));
    for (const col of [leftCol, rightCol]) for (let i = 1; i < col.length; i++) expect(col[i].y).toBeGreaterThan(bottom(col[i - 1]));
  });

  it('every cell is one width; the box is two cells and the column gap', () => {
    for (const c of l.weapons.rows) expect(c.w).toBe(K.cell.w);
    expect(l.weapons.frame.w).toBe(2 * K.cell.w + K.cell.colGap);
    expect(rightCol[0].x - right(leftCol[0])).toBe(K.cell.colGap);
  });

  it('cells in a column are one height, and both columns share one top and one bottom', () => {
    for (const col of [leftCol, rightCol]) for (const c of col) expect(c.h).toBe(col[0].h);
    expect(leftCol[0].y).toBe(rightCol[0].y);
    expect(bottom(leftCol[leftCol.length - 1])).toBeCloseTo(bottom(rightCol[rightCol.length - 1]), 9);
    for (const col of [leftCol, rightCol]) for (let i = 1; i < col.length; i++) expect(col[i].y - bottom(col[i - 1])).toBeCloseTo(K.cell.rowGap, 9);
  });

  it('H is derived from a cell`s fullest content: line 1, the mount line and every stat line fit inside it, in order', () => {
    expect(rightCol[0].h).toBe(CELL_H);
    expect(CELL_H).toBe(2 * K.cell.padY + K.cell.headerH + K.cell.mountH + K.cell.statLines * K.cell.statLineH);
    for (const c of rightCol) expect(c.statLines).toHaveLength(K.cell.statLines);
    for (const c of leftCol) expect(c.statLines).toHaveLength(K.cell.leftStatLines);
    expect(K.cell.leftStatLines).toBeLessThanOrEqual(K.cell.statLines);
    for (const c of l.weapons.rows) {
      const order = [c.header, c.mounts, ...c.statLines];
      for (const r of order) expect(contains(c, r), `${c.kind} ${JSON.stringify(r)}`).toBe(true);
      for (let i = 1; i < order.length; i++) expect(order[i].y).toBeGreaterThanOrEqual(bottom(order[i - 1]));
      expect(c.mounts.h).toBeGreaterThanOrEqual(K.cell.clock);
      expect(c.header.h).toBeGreaterThanOrEqual(K.cell.keyChip);
    }
  });

  it('a stat line is tall enough for its value register (one stat per line, never crammed)', () => {
    expect(K.cell.statLineH).toBeGreaterThanOrEqual(K.type.statValue);
    expect(K.cell.headerH).toBeGreaterThanOrEqual(K.type.name);
  });

  it('R27 — FOUR rings and their gaps fit ONE mount line, inside the cell`s inner width; the line is a ring tall', () => {
    expect(MAX_CLOCKS).toBeGreaterThanOrEqual(4);
    expect(4 * K.cell.clock + 3 * K.cell.clockGap).toBeLessThanOrEqual(CELL_INNER_W);
    expect(K.cell.mountH).toBeGreaterThanOrEqual(K.cell.clock);
    for (const c of l.weapons.rows) expect(c.mounts.w).toBe(CELL_INNER_W);
  });

  it('R27 — a three-character numeral at the clock register, tracked, fits the ring`s inner chord at its own height', () => {
    // The ring's inner radius (inside the hairline) and the chord across it
    // at half the numeral's height off the centre.
    const rIn = K.cell.clock / 2 - K.lineW;
    const chord = 2 * Math.sqrt(rIn * rIn - (K.type.clock / 2) ** 2);
    expect(monoTextWidth('1.8', K.type.clock, K.cell.clockTracking)).toBeLessThanOrEqual(chord);
    expect(monoTextWidth('99', K.type.clock)).toBeLessThanOrEqual(chord);
    expect(K.type.clock).toBeGreaterThanOrEqual(17); // never shrunk to fit
  });

  it('a mines rack — its ring and a four-pip column beside it — twice, fits the line', () => {
    const P = K.cell.rackPip;
    const rack = K.cell.clock + K.cell.rackGap + P.w;
    expect(2 * rack + K.cell.clockGap).toBeLessThanOrEqual(CELL_INNER_W);
    expect(4 * P.h + 3 * P.gap).toBeLessThanOrEqual(K.cell.mountH);
  });

  it('lays the three ability buttons beneath both columns, equal widths, spanning the box', () => {
    expect(l.abilities.map((a) => a.kind)).toEqual([...ABILITY_KINDS]);
    expect(l.abilities[0].x).toBe(l.weapons.frame.x);
    expect(right(l.abilities[2])).toBeCloseTo(right(l.weapons.frame), 9);
    for (const a of l.abilities) {
      expect(a.w).toBeCloseTo(l.abilities[0].w, 9);
      expect(a.y).toBeGreaterThan(Math.max(...l.weapons.rows.map(bottom)));
      expect(contains(l.weapons.frame, a)).toBe(true);
    }
    for (let i = 1; i < l.abilities.length; i++) expect(l.abilities[i].x - right(l.abilities[i - 1])).toBeCloseTo(K.abilities.gap, 9);
  });

  it('sits on its bed, the bed padding past the content on every side', () => {
    expect(l.weapons.bed).toEqual(bedOf(l.weapons.frame));
    expect(l.weapons.frame.x - l.weapons.bed.x).toBe(K.bedPad);
    for (const r of [...l.weapons.rows, ...l.abilities]) expect(contains(l.weapons.frame, r)).toBe(true);
  });
});

describe('the ship console is COMPACT (R21)', () => {
  it('is the same height on every viewport — the sum of its parts, never stretched to fill', () => {
    const heights = [...AT_100, { w: 1280, h: 614 }, { w: 2560, h: 1440 }].map((vp) => consoleLayout(vp.w, vp.h).ship.frame.h);
    for (const h of heights) expect(h).toBe(SHIP_CONSOLE_H);
  });

  it('leaves the water above it: bottom-anchored, its top well under the chrome bar on a tall screen', () => {
    const l = consoleLayout(REFERENCE.w, REFERENCE.h);
    expect(bottom(l.ship.bed)).toBe(REFERENCE.h - K.bottomInset);
    expect(l.ship.bed.y).toBeGreaterThan(K.ship.topClearance);
  });

  it('stacks hull, indices, helm and level top to bottom on fixed seams, inside its frame', () => {
    for (const vp of AT_100) {
      const s = consoleLayout(vp.w, vp.h).ship;
      const order = [s.hullLine, s.hullBar, ...s.indices, s.helmReadout, s.ladder, s.rudder, s.levelRow, s.track];
      for (let i = 1; i < order.length; i++) expect(order[i].y).toBeGreaterThanOrEqual(bottom(order[i - 1]));
      for (const r of order) expect(contains(s.frame, r)).toBe(true);
      expect(bottom(s.track)).toBe(bottom(s.frame));
      expect(s.indices[0].y - bottom(s.hullBar)).toBe(K.ship.sectionGap);
      const seams = s.indices.slice(1).map((r, i) => r.y - bottom(s.indices[i]));
      for (const seam of seams) expect(seam).toBe(K.ship.indexRowGap);
    }
  });

  it('right-aligns each index row`s five-bar tier ladder, clear of its value, the value wide enough for a hover mark', () => {
    for (const row of consoleLayout(REFERENCE.w, REFERENCE.h).ship.indices) {
      expect(row.bars).toHaveLength(K.ship.tierBars);
      expect(right(row.bars[row.bars.length - 1])).toBe(right(row));
      for (let i = 1; i < row.bars.length; i++) expect(row.bars[i].x - right(row.bars[i - 1])).toBe(K.ship.tierBar.gap);
      expect(right(row.value)).toBeLessThanOrEqual(row.ladder.x);
      expect(right(row.label)).toBeLessThanOrEqual(row.value.x);
      expect(monoTextWidth('999▲', K.type.indexValue)).toBeLessThanOrEqual(row.value.w);
      expect(row.h).toBeGreaterThanOrEqual(K.type.indexValue);
    }
  });

  it('gives every index word its label column', () => {
    const row = consoleLayout(REFERENCE.w, REFERENCE.h).ship.indices[0];
    for (const word of ['ARMOR', 'POWER', 'RELOAD', 'ENGINES', 'INTEL', 'RANGE']) {
      expect(monoTextWidth(word, K.type.indexLabel, K.type.indexLabel * 0.12)).toBeLessThanOrEqual(row.label.w);
    }
  });

  it('cuts the hull bar into its segments, edge to edge with equal gaps', () => {
    const s = consoleLayout(REFERENCE.w, REFERENCE.h).ship;
    expect(s.segments).toHaveLength(K.ship.segments);
    expect(s.segments[0].x).toBe(s.hullBar.x);
    expect(right(s.segments[s.segments.length - 1])).toBeCloseTo(right(s.hullBar), 9);
  });
});

describe('the offer group — a narrow VERTICAL STACK (R22 / R26) or one ROW (BOTTOM)', () => {
  /** The 13" MacBook's logical viewport, where RIGHT and LEFT both stack. */
  const MAC = logical(PHYSICAL[1]);
  for (const countdown of [false, true]) {
    for (const offerPos of ['right', 'left'] as const) {
      const l = consoleLayout(MAC.w, MAC.h, { countdown, offerPos });
      const o = l.offer;

      it(`${tag(MAC, countdown, offerPos)}: four card-width cards in ONE column under the header, a gap apart, inside the frame`, () => {
        expect(l.offerPlacement).toBe(offerPos);
        expect(o.cards).toHaveLength(4);
        for (const c of o.cards) {
          expect(c.x).toBe(o.frame.x);
          expect(c.w).toBe(K.offer.cardW);
          expect(c.h).toBe(K.offer.cardH);
          expect(contains(o.frame, c)).toBe(true);
          expect(c.y).toBeGreaterThanOrEqual(bottom(o.header));
        }
        for (let i = 1; i < 4; i++) expect(o.cards[i].y - bottom(o.cards[i - 1])).toBe(K.offer.gap);
        expect(bottom(o.cards[3])).toBe(bottom(o.frame));
        expect(o.bed).toEqual(bedOf(o.frame));
      });
    }
  }

  it('the stack carries REDRAW only at the countdown, on its own full-width line under the header, clear of the cards', () => {
    expect(consoleLayout(MAC.w, MAC.h).offer.redraw).toBeNull();
    const o = consoleLayout(MAC.w, MAC.h, { countdown: true }).offer;
    const redraw = o.redraw!;
    expect(redraw.x).toBe(o.header.x);
    expect(redraw.w).toBe(o.header.w);
    expect(redraw.y).toBeGreaterThanOrEqual(bottom(o.header));
    for (const c of o.cards) {
      expect(overlaps(redraw, c)).toBe(false);
      expect(c.y).toBeGreaterThan(redraw.y);
    }
  });

  it('the row: the header slot at its left, REDRAW at its right at the countdown, nothing overlapping, one bed', () => {
    for (const countdown of [false, true]) {
      const o = consoleLayout(REFERENCE.w, REFERENCE.h, { countdown, offerPos: 'bottom' }).offer;
      expect(o.header.x).toBe(o.frame.x);
      expect(o.cards[0].x).toBeGreaterThan(right(o.header));
      for (const c of o.cards) expect(contains(o.frame, c)).toBe(true);
      expect(o.bed).toEqual(bedOf(o.frame));
      if (!countdown) expect(o.redraw).toBeNull();
      else {
        expect(o.redraw!.x).toBeGreaterThan(right(o.cards[3]));
        expect(right(o.redraw!)).toBe(right(o.frame));
      }
    }
  });

  it('the header holds its widest count at the text rule in every arrangement', () => {
    const tracking = K.type.offerHeader * 0.18;
    const widest = monoTextWidth('10 LEVELS', K.type.offerHeader, tracking);
    expect(widest).toBeLessThanOrEqual(K.offer.cardW);
    expect(widest).toBeLessThanOrEqual(K.offer.bar.headW);
  });
});

describe('THE TEXT RULE (R23) — every console register at or above its floor', () => {
  // Eric 2026-11-10: values ≥ 17 px (600), labels ≥ 14 px, chips and tier
  // numerals ≥ 12 px, authored at the 1920×1080 reference.
  const RULE = { value: 17, label: 14, chip: 12 } as const;
  const CLASS: Readonly<Record<keyof typeof K.type, keyof typeof RULE>> = {
    statValue: 'value', clock: 'value', abilityState: 'value', abilityNumeral: 'value', hull: 'value', hullUnit: 'value',
    indexValue: 'value', hdg: 'value', kts: 'value', lv: 'value', bankCount: 'value',
    name: 'label', statLabel: 'label', abilityName: 'label', label: 'label', indexLabel: 'label',
    offerHeader: 'label', offerName: 'label', offerTier: 'label', redraw: 'label',
    tier: 'chip', keyChip: 'chip', offerChip: 'chip',
  };

  it('classifies every register (a new one cannot dodge the rule)', () => {
    expect(Object.keys(K.type).sort()).toEqual(Object.keys(CLASS).sort());
  });

  for (const [key, cls] of Object.entries(CLASS)) {
    it(`${key} (${cls}) ≥ ${RULE[cls]} px`, () => {
      expect(K.type[key as keyof typeof K.type]).toBeGreaterThanOrEqual(RULE[cls]);
    });
  }

  it('every LABEL / VALUE register clears the mono floor at the smallest HUD factor (nothing needs counter-scaling)', () => {
    const smallest = V.min * (Math.min(...TIERS) / 100);
    for (const [key, cls] of Object.entries(CLASS)) {
      if (cls === 'chip') continue;
      expect(K.type[key as keyof typeof K.type] * smallest, key).toBeGreaterThanOrEqual(CLIENT_CONFIG.settings.monoFloorPx);
    }
  });
});

describe('consoleHit — a press routes by the layout rects', () => {
  const l = consoleLayout(REFERENCE.w, REFERENCE.h);
  const centre = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  it('a cell press carries the cell and its loadout slot', () => {
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

  it('the beds swallow (the ship console, the gap between two cells); the water does not', () => {
    expect(consoleHit(l, centre(l.ship.frame))).toEqual({ kind: 'ship' });
    const left = l.weapons.rows[0];
    expect(consoleHit(l, { x: right(left) + K.cell.colGap / 2, y: left.y + 1 })).toEqual({ kind: 'ship' });
    expect(consoleHit(l, { x: l.weapons.bed.x + 1, y: l.weapons.bed.y + 1 })).toEqual({ kind: 'ship' });
    expect(consoleHit(l, { x: REFERENCE.w / 2, y: REFERENCE.h / 2 })).toBeNull();
  });
});
