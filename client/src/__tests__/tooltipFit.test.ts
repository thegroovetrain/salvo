// THE CONTAINER-FIT PIN for the hotbar SLOT TOOLTIP (amendment 47: "nothing
// anywhere in the game may render larger than its container"). The refit card's
// sibling, and its mirror image: the card is a FIXED box holding growing text,
// the tooltip is a GROWING panel inside a fixed viewport. Story 2.9 turned its
// BOONS block from deliberate absence into a live list of the whole build, which
// is exactly the shape that overflows silently.
//
// It walks EVERY equipment id against EVERY reachable accrued build —
//   • the empty build (the pre-2.9 panel, which must not have grown),
//   • each subdeck fully stacked (every line of the slot's category at its full
//     copy count, both rival doctrines' worst case),
//   • the GUN slot with the shipwide INTEL/SHIP lines it hosts on top,
//   • every ship class (class stats move the printed values)
// — and asserts the modelled panel fits the floor viewport, that what survives
// is still a useful list (the fix may not be "trim everything"), and that the
// `◆n` quick-info compression stays inside the hotbar's label column.

import { describe, expect, it } from 'vitest';
import {
  BOON_CATALOG,
  CONFIG,
  EQUIPMENT_CATEGORY,
  effectiveStats,
  resolveBoons,
  type EquipmentId,
  type ShipClassId,
} from '@salvo/shared';
import {
  SHIP_DIVIDER_ROW,
  TOOLTIP_MAX_PANEL_H,
  boonMark,
  boonRows,
  quickInfoLine,
  slotBoonIds,
  tooltipInnerWidth,
  tooltipMetrics,
  tooltipModel,
} from '../render/hotbar.js';
import { equipmentInfo, SHIPWIDE_CATEGORIES } from '../render/equipmentInfo.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { CLIENT_CONFIG } from '../config.js';

const H = CLIENT_CONFIG.hotbar;
const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];
const LINES = Object.values(BOON_CATALOG);
const EQUIPMENT_IDS = Object.keys(EQUIPMENT_CATEGORY) as EquipmentId[];

/** Every copy of every line in a set of categories — the MAXIMUM accrued build
 *  a slot's tooltip can ever be asked to render. Doctrines are mutually
 *  exclusive per weapon, but including BOTH is the strictly harsher case (and
 *  the panel must fit whatever the wire hands it). */
function maxedFor(categories: readonly string[]): string[] {
  return LINES.filter((d) => categories.includes(d.category)).flatMap((d) => Array<string>(d.copies).fill(d.id));
}

/** The accrued builds each equipment's tooltip is measured against. */
function buildsFor(id: EquipmentId): { label: string; boons: string[] }[] {
  const own = EQUIPMENT_CATEGORY[id];
  const wanted = id === 'gun' ? [own, ...SHIPWIDE_CATEGORIES] : [own];
  return [
    { label: 'bare', boons: [] },
    { label: 'subdeck maxed', boons: maxedFor([own]) },
    { label: 'everything this slot can show', boons: maxedFor(wanted) },
    // Plus the whole catalog: the filter, not the panel, is what keeps another
    // slot's lines out — so prove the filter under the worst possible input.
    { label: 'whole catalog fitted', boons: maxedFor(Object.keys(EQUIPMENT_CATEGORY).map((e) => EQUIPMENT_CATEGORY[e as EquipmentId]).concat(SHIPWIDE_CATEGORIES)) },
  ];
}

interface Case {
  label: string;
  id: EquipmentId;
  cls: ShipClassId;
  boons: string[];
}

const CASES: Case[] = EQUIPMENT_IDS.flatMap((id) =>
  CLASSES.flatMap((cls) => buildsFor(id).map((b) => ({ label: `${id}/${cls}/${b.label}`, id, cls, boons: b.boons }))),
);

function statsFor(c: Case) {
  return effectiveStats(CONFIG.shipClasses[c.cls], resolveBoons(c.boons));
}

function modelFor(c: Case) {
  return tooltipModel(c.id === 'gun' ? 0 : 1, c.id, statsFor(c), c.boons)!;
}

describe('slot tooltip container fit (amendment 47)', () => {
  it('covers every equipment id, class and accrued build', () => {
    expect(CASES.length).toBe(EQUIPMENT_IDS.length * CLASSES.length * 4);
  });

  it('NO tooltip panel renders taller than the floor viewport allows', () => {
    const over = CASES.map((c) => ({ c, m: tooltipMetrics(modelFor(c)) }))
      .filter((r) => r.m.overflow > 0)
      .map((r) => `${r.c.label}: ${r.m.height}px > ${TOOLTIP_MAX_PANEL_H}px (${r.m.boonLines} boon lines)`);
    expect(over).toEqual([]);
  });

  it('keeps the two heading rows at ONE line each (the height model assumes it)', () => {
    const inner = tooltipInnerWidth();
    for (const c of CASES) {
      const m = modelFor(c);
      expect(monoTextWidth(m.name, 17, 1.1), m.name).toBeLessThanOrEqual(inner);
      expect(monoTextWidth(m.interaction, 14, 1.6), m.interaction).toBeLessThanOrEqual(inner);
    }
  });

  it('leaves real headroom on the worst panel — the pin is not on the boundary', () => {
    const worst = Math.max(...CASES.map((c) => tooltipMetrics(modelFor(c)).height));
    expect(worst).toBeLessThanOrEqual(TOOLTIP_MAX_PANEL_H);
    // Documents the fit budget: whoever spends the last of it has to look here.
    expect(TOOLTIP_MAX_PANEL_H - worst).toBeGreaterThanOrEqual(2);
  });

  it('the panel GROWS with the build (the rows are really rendered, not dropped)', () => {
    const bare = tooltipMetrics(modelFor({ label: '', id: 'gun', cls: 'battleship', boons: [] })).height;
    const fitted = tooltipMetrics(
      modelFor({ label: '', id: 'gun', cls: 'battleship', boons: ['gunDamage', 'gunBarrel'] }),
    ).height;
    expect(fitted).toBeGreaterThan(bare);
  });
});

describe('the laws that constrain the fix', () => {
  it('never trims a real build down to nothing — a fitted slot always lists rows', () => {
    const empty = CASES.filter((c) => c.boons.length > 0 && slotBoonIds(c.id, c.boons).length > 0)
      .filter((c) => modelFor(c).boons.length === 0)
      .map((c) => c.label);
    expect(empty).toEqual([]);
  });

  it('keeps at least six rows on every slot before it starts trimming', () => {
    const thin = CASES.filter((c) => slotBoonIds(c.id, c.boons).length > 0)
      .map((c) => ({ c, shown: modelFor(c).boons, all: boonRows(c.id, c.boons, statsFor(c)) }))
      .filter((r) => r.shown.length < Math.min(6, r.all.length))
      .map((r) => `${r.c.label}: ${r.shown.length} of ${r.all.length}`);
    expect(thin).toEqual([]);
  });

  it('says so when it trims: the last row becomes the +n MORE marker', () => {
    for (const c of CASES) {
      const all = boonRows(c.id, c.boons, statsFor(c));
      const shown = modelFor(c).boons;
      if (shown.length === all.length) continue;
      expect(shown[shown.length - 1].label).toMatch(/^◆ \+\d+ MORE$/);
    }
  });

  it('every accrued row carries BOTH a ◆ name and a non-empty effect line', () => {
    const bad: string[] = [];
    for (const c of CASES) {
      for (const row of modelFor(c).boons) {
        if (row.divider) continue;
        if (!row.label.startsWith('◆ ') || row.effect.trim() === '') bad.push(`${c.label}: ${row.label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('hosts the shipwide lines under the SHIP divider — in the GUN slot only', () => {
    const shipwide = maxedFor(SHIPWIDE_CATEGORIES);
    const gun = modelFor({ label: '', id: 'gun', cls: 'torpedoBoat', boons: shipwide });
    expect(gun.boons.some((r) => r.label === SHIP_DIVIDER_ROW)).toBe(true);
    for (const id of EQUIPMENT_IDS.filter((e) => e !== 'gun')) {
      expect(modelFor({ label: '', id, cls: 'torpedoBoat', boons: shipwide }).boons).toEqual([]);
    }
  });

  it('never lets a row carry an unbreakable token wider than the panel', () => {
    const inner = tooltipInnerWidth();
    const tooWide: string[] = [];
    for (const c of CASES) {
      for (const row of modelFor(c).boons) {
        for (const word of `${row.label} ${row.effect}`.split(/\s+/)) {
          if (monoTextWidth(word, 14, 0.6) > inner) tooWide.push(word);
        }
      }
    }
    expect(tooWide).toEqual([]);
  });
});

describe('the ◆n quick-info compression fits the label column', () => {
  it('stays inside the hotbar label width for every slot, build and window', () => {
    const over: string[] = [];
    for (const c of CASES) {
      const stats = statsFor(c);
      const info = equipmentInfo(stats, c.id);
      const n = slotBoonIds(c.id, c.boons).length;
      // Worst case per row: a live reload countdown AND — for the two pieces of
      // equipment that HAVE a window — that window at its longest fitted
      // duration, AND the accrued mark, all on the line at once.
      const window = { speedBoost: stats.boost.durationMs, decoyBuoy: stats.decoyBuoy.durationMs }[
        c.id as 'speedBoost' | 'decoyBuoy'
      ];
      for (const active of [0, window ?? 0]) {
        const line = quickInfoLine(info, info.reloadMs, active, n);
        const w = monoTextWidth(line, 16, 0.8);
        if (w > H.labelWidth) over.push(`${c.label}: "${line}" ${w.toFixed(1)}px > ${H.labelWidth}px`);
      }
    }
    expect(over).toEqual([]);
  });

  it('clamps the mark at 9+ and shows nothing at zero', () => {
    expect(boonMark(0)).toBe('');
    expect(boonMark(3)).toBe(' ◆3');
    expect(boonMark(9)).toBe(' ◆9');
    expect(boonMark(10)).toBe(' ◆9+');
    expect(boonMark(37)).toBe(' ◆9+');
  });
});
