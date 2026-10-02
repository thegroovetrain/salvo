// THE CONTAINER-FIT PIN for the hotbar SLOT TOOLTIP (amendment 47: "nothing
// anywhere in the game may render larger than its container"). The refit card's
// sibling, and its mirror image: the card is a FIXED box holding growing text,
// the tooltip is a GROWING panel inside a fixed viewport.
//
// CYCLE 158 (amendments 185/186) re-cut the panel to the hovered thing's LIVE
// stat table, one row per line, with no trim at all — so this walk is the whole
// of the fit story. It walks
//   • EVERY equipment id × EVERY class × {bare, its own lines maxed, the whole
//     catalog fitted}, each in the slot(s) that equipment can occupy,
//   • EVERY consumable on EVERY belt square,
//   • the HP globe's SHIP panel per class (bare and every ladder maxed),
// and asserts each panel fits the room ABOVE its anchor at the 1280×614 floor
// (the cycle-141 law: the panel hangs above the thing it points at, so that
// clearance is its container), and that no row is wider than the panel.

import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_IDS,
  CONSUMABLE_SLOTS,
  EQUIPMENT_IDS as SHARED_EQUIPMENT_IDS,
  SLOT_BOOST,
  SLOT_GUN,
  WEAPON_SLOTS,
  effectiveStats,
  type EquipmentId,
  type ShipClassId,
  type SlotItemId,
} from '@salvo/shared';
import {
  TIP_TYPE,
  TOOLTIP_MAX_PANEL_H,
  headingHeight,
  interactionLines,
  shipTooltipModel,
  tooltipInnerWidth,
  tooltipMetrics,
  tooltipModel,
  tooltipRoomAbove,
  type TooltipModel,
} from '../render/slotTooltip.js';
import { hoverAnchor } from '../render/hotbar.js';
import { hudBarLayout, type Rect } from '../render/hudBar.js';
import { cardEquipmentIds } from '../render/equipmentInfo.js';
import { monoTextWidth } from '../ui/refitCardFit.js';

const CLASSES = Object.keys(CONFIG.shipClasses) as ShipClassId[];
const LINES = Object.values(CATALOG);
const EQUIPMENT_IDS = [...SHARED_EQUIPMENT_IDS];
const FLOOR = hudBarLayout(1280, 614);

/** Every copy of every line that ADDRESSES `id` — its maxed build. */
function maxedFor(id: EquipmentId): string[] {
  return LINES.filter((d) => cardEquipmentIds(d.id).includes(id)).flatMap((d) => Array<string>(d.cap).fill(d.id));
}

/** The whole catalog at cap. */
const WHOLE_CATALOG = LINES.flatMap((d) => Array<string>(d.cap).fill(d.id));
/** Every ladder at cap — the SHIP panel's maxed build. */
const LADDERS_MAXED = LINES.filter((d) => d.kind === 'ladder').flatMap((d) => Array<string>(d.cap).fill(d.id));

const GUNS: readonly EquipmentId[] = ['gun', 'machineGun', 'flak'];
const SHIFTS: readonly EquipmentId[] = ['boost', 'instantReload', 'damageCut'];

/** The slots a piece of equipment can sit in. */
function slotsFor(id: EquipmentId): readonly number[] {
  if (GUNS.includes(id)) return [SLOT_GUN];
  if (SHIFTS.includes(id)) return [SLOT_BOOST];
  return WEAPON_SLOTS;
}

interface Case {
  label: string;
  model: TooltipModel;
  anchor: Rect;
}

const SLOT_CASES: Case[] = EQUIPMENT_IDS.flatMap((id) =>
  CLASSES.flatMap((cls) =>
    [
      { b: 'bare', cards: [] as string[] },
      { b: 'own maxed', cards: maxedFor(id) },
      { b: 'whole catalog', cards: WHOLE_CATALOG },
    ].flatMap(({ b, cards }) =>
      slotsFor(id).map((slot) => ({
        label: `${id}/${cls}/${b}/slot ${slot}`,
        model: tooltipModel(slot, id as SlotItemId, effectiveStats(CONFIG.shipClasses[cls], cards), cards)!,
        anchor: FLOOR.squares[slot],
      })),
    ),
  ),
);

const BELT_CASES: Case[] = CONSUMABLE_IDS.flatMap((id) =>
  CONSUMABLE_SLOTS.map((slot) => ({
    label: `${id}/belt ${slot}`,
    // The deepest stock the belt can print (the line's cap) — the longest `×n`.
    model: tooltipModel(slot, id, effectiveStats(CONFIG.shipClasses.torpedoBoat), [], CATALOG[id].cap)!,
    anchor: FLOOR.squares[slot],
  })),
);

const SHIP_CASES: Case[] = CLASSES.flatMap((cls) =>
  [
    { b: 'bare', cards: [] as string[] },
    { b: 'every ladder maxed', cards: LADDERS_MAXED },
  ].map(({ b, cards }) => ({
    label: `SHIP/${cls}/${b}`,
    model: shipTooltipModel(cls, effectiveStats(CONFIG.shipClasses[cls], cards))!,
    anchor: hoverAnchor('ship', FLOOR),
  })),
);

const CASES = [...SLOT_CASES, ...BELT_CASES, ...SHIP_CASES];

describe('slot tooltip container fit (amendment 47)', () => {
  it('covers every equipment id × class × build, every belt line, and the SHIP panel per class', () => {
    const slotCount = EQUIPMENT_IDS.reduce((n, id) => n + slotsFor(id).length, 0);
    expect(SLOT_CASES.length).toBe(slotCount * CLASSES.length * 3);
    expect(BELT_CASES.length).toBe(CONSUMABLE_IDS.length * CONSUMABLE_SLOTS.length);
    expect(SHIP_CASES.length).toBe(CLASSES.length * 2);
    expect(CASES.every((c) => c.model !== null)).toBe(true);
  });

  it('EVERY panel fits the room ABOVE its anchor at the 1280×614 floor', () => {
    const over = CASES.map((c) => ({ c, m: tooltipMetrics(c.model, tooltipRoomAbove(c.anchor)) }))
      .filter((r) => r.m.overflow > 0)
      .map((r) => `${r.c.label}: ${r.m.height}px > ${tooltipRoomAbove(r.c.anchor)}px (${r.m.statLines} rows)`);
    expect(over).toEqual([]);
  });

  it('and therefore fits the floor viewport', () => {
    const worst = Math.max(...CASES.map((c) => tooltipMetrics(c.model).height));
    expect(worst).toBeLessThanOrEqual(TOOLTIP_MAX_PANEL_H);
  });

  it('never lets a stat row run wider than the panel (label column + gap + value)', () => {
    const inner = tooltipInnerWidth();
    const wide = CASES.filter((c) => tooltipMetrics(c.model).rowW > inner).map(
      (c) => `${c.label}: ${tooltipMetrics(c.model).rowW}px`,
    );
    expect(wide).toEqual([]);
  });

  // THE NAME owns ONE line — it is the panel's heading. The INTERACTION row
  // wraps (Story 8.7, ruling 13), and the height model measures the wrap.
  it('keeps the NAME on one line, and MODELS however many the interaction row takes', () => {
    const inner = tooltipInnerWidth();
    for (const c of CASES) {
      const m = c.model;
      expect(monoTextWidth(m.name, TIP_TYPE.nameSize, TIP_TYPE.nameLetterSpacing), m.name).toBeLessThanOrEqual(inner);
      const lines = interactionLines(m.interaction);
      expect(lines, m.interaction).toBeLessThanOrEqual(2);
      expect(tooltipMetrics(m).interactionLines, m.interaction).toBe(lines);
      expect(headingHeight(m.interaction)).toBe(TIP_TYPE.headLineHeight * (1 + lines));
    }
  });

  it('every fitted weapon and the SHIP panel print at least one stat row', () => {
    const silent = [...SLOT_CASES, ...SHIP_CASES].filter((c) => c.model.stats.length === 0).map((c) => c.label);
    expect(silent).toEqual([]);
  });

  it('grows the panel by exactly one line box per stat row', () => {
    const one = { name: 'X', interaction: 'TIER I', stats: [{ label: 'A', cur: null, next: '1' }] };
    const two = { ...one, stats: [...one.stats, { label: 'B', cur: null, next: '2' }] };
    expect(tooltipMetrics(two).height - tooltipMetrics(one).height).toBe(TIP_TYPE.boonLineHeight);
  });
});
