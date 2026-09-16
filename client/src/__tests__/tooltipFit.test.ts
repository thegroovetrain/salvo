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
// — and asserts the modelled panel fits the floor viewport and that what
// survives is still a useful list (the fix may not be "trim everything").
//
// STORY 8.6 took the LABEL COLUMN with the bottom-left stack, so the quick-info
// compression suite that used to close this file is gone with the box it was
// measured against (deferred-work ledger :1966). The tooltip is now the ONLY
// place a slot's name, interaction line and build are read, which makes this
// file's own pins the whole of the container-fit story for the surface.

import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  CONFIG,
  EQUIPMENT_IDS as SHARED_EQUIPMENT_IDS,
  effectiveStats,
  type EquipmentId,
  type ShipClassId,
} from '@salvo/shared';
import {
  SHIP_DIVIDER_ROW,
  TOOLTIP_MAX_PANEL_H,
  boonRows,
  slotBoonIds,
  tooltipInnerWidth,
  tooltipMetrics,
  tooltipModel,
} from '../render/hotbar.js';
import { cardEquipmentIds, isShipwideCard } from '../render/equipmentInfo.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { boonName } from '../ui/boonCopy.js';

const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];
const LINES = Object.values(CATALOG);
const EQUIPMENT_IDS = [...SHARED_EQUIPMENT_IDS];

/** Every copy of every line that ADDRESSES one of `ids` — the MAXIMUM accrued
 *  build a slot's tooltip can ever be asked to render. Story 8.1: the v2
 *  categories are deleted, so a line's slot comes from the equipment it
 *  addresses (render/equipmentInfo.cardEquipmentIds). */
function maxedFor(ids: readonly EquipmentId[]): string[] {
  return LINES.filter((d) => cardEquipmentIds(d.id).some((e) => ids.includes(e)))
    .flatMap((d) => Array<string>(d.cap).fill(d.id));
}

/** Every copy of every SHIPWIDE line (the five universal ladders) — the gun
 *  slot hosts these under the `— SHIP —` divider. */
const SHIPWIDE_CARDS = LINES.filter((d) => isShipwideCard(d.id) && d.kind === 'ladder')
  .flatMap((d) => Array<string>(d.cap).fill(d.id));

/** The whole catalog at cap — the filter, not the panel, is what keeps another
 *  slot's lines out, so the worst possible input proves the filter. */
const WHOLE_CATALOG = LINES.flatMap((d) => Array<string>(d.cap).fill(d.id));

/** The accrued builds each equipment's tooltip is measured against. */
function buildsFor(id: EquipmentId): { label: string; boons: string[] }[] {
  const own = maxedFor([id]);
  return [
    { label: 'bare', boons: [] },
    { label: 'own lines maxed', boons: own },
    { label: 'everything this slot can show', boons: id === 'gun' ? [...own, ...SHIPWIDE_CARDS] : own },
    { label: 'whole catalog fitted', boons: WHOLE_CATALOG },
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
  return effectiveStats(CONFIG.shipClasses[c.cls], c.boons);
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
      modelFor({ label: '', id: 'gun', cls: 'battleship', boons: ['deckGunBarrel', 'deckGunTurret'] }),
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

  // Since catalog v3 (Story 8.1) an EQUIPMENT line has no holding line to print
  // — copy 1 fits the weapon and tiers II–V are unauthored until Stories
  // 8.12–8.16 — so the row is its `◆ NAME` alone, which is the honest readout.
  // Every row still carries the diamond, and every LADDER/ADD-ON row still
  // carries a real effect line.
  it('every accrued row carries a ◆ name, and an effect line wherever there is one', () => {
    const bad: string[] = [];
    for (const c of CASES) {
      for (const row of modelFor(c).boons) {
        if (row.divider) continue;
        if (!row.label.startsWith('◆ ')) bad.push(`${c.label}: ${row.label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  // HEAT SEEKING is the one add-on with no holding line: its verb rides the
  // HORIZONTAL MISSILE, whose module is Story 8.14, and writing copy for a
  // weapon nobody has played is what the naming law forbids.
  it('a LADDER or ADD-ON row always reports a live effect line', () => {
    const chatty = LINES.filter((d) => (d.kind === 'ladder' || d.kind === 'addon') && d.id !== 'heatSeeking')
      .map((d) => d.id);
    const bad: string[] = [];
    for (const c of CASES) {
      for (const row of boonRows(c.id, c.boons, statsFor(c))) {
        if (row.divider) continue;
        const id = chatty.find((x) => row.label === `◆ ${boonName(x)}`);
        if (id !== undefined && row.effect.trim() === '') bad.push(`${c.label}: ${row.label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('hosts the shipwide lines under the SHIP divider — in the GUN slot only', () => {
    const shipwide = SHIPWIDE_CARDS;
    // The divider SEPARATES, so it needs the gun's own lines above it...
    const mixed = modelFor({ label: '', id: 'gun', cls: 'torpedoBoat', boons: ['deckGunBarrel', ...shipwide] });
    expect(mixed.boons.some((r) => r.label === SHIP_DIVIDER_ROW)).toBe(true);
    // ...and a gun holding ONLY shipwide lines lists them bare (2.9 review): a
    // heading over the whole list separates it from nothing and spends a row of
    // the panel's fit budget saying so.
    const shipOnly = modelFor({ label: '', id: 'gun', cls: 'torpedoBoat', boons: shipwide });
    expect(shipOnly.boons.some((r) => r.label === SHIP_DIVIDER_ROW)).toBe(false);
    expect(shipOnly.boons.length).toBeGreaterThan(0);
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
