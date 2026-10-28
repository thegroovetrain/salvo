// THE SLOT TOOLTIP's own suite (Story 8.7, ruling 13; re-cut in cycle 158).
//
// `render/slotTooltip.ts` owns the hover dwell, the model, the container-fit
// arithmetic and the placement; `render/hotbar.ts` keeps the squares and the
// Pixi shell that paints both. Nothing about the panel's width, type or notch
// moved (epic-8 amendment 42).
//
// CYCLE 158 (Eric rulings 2026-09-30, epic-8 amendments 185/186): the panel is
// the heading over the hovered thing's LIVE stat table, one `LABEL value` per
// line — no prose, no accrued build list — and the HP globe opens a SHIP panel
// with the ship stats (six since Story 9.6).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  effectiveStats,
  type EffectiveStats,
} from '@salvo/shared';
import {
  NO_HOVER,
  SHIP_INTERACTION,
  TIP_TYPE,
  headingHeight,
  hoverReady,
  interactionLines,
  nextHover,
  shipTooltipModel,
  shouldShowTooltip,
  statLabelWidth,
  tooltipFrame,
  tooltipInnerWidth,
  tooltipMetrics,
  tooltipModel,
  tooltipPlacement,
  tooltipRenderGeom,
  tooltipRoomAbove,
} from '../render/slotTooltip.js';
import { hotbarPress, hoverAnchor, hoverTargetAt, tipCacheHit, type TooltipCache } from '../render/hotbar.js';
import { hudBarLayout } from '../render/hudBar.js';
import { EQUIPMENT_NAME, interactionLine } from '../render/equipmentInfo.js';
import { boonName, consumableStatRows, equipmentStatRows, shipStatRows } from '../ui/boonCopy.js';
import { CLASS_DISPLAY_NAMES } from '../ui/classNames.js';
import { romanTier } from '../ui/tierRamp.js';
import { CLIENT_CONFIG } from '../config.js';

const STATS: EffectiveStats = effectiveStats(CONFIG.shipClasses.torpedoBoat);
const [Q, E] = WEAPON_SLOTS;
const [BELT_1, BELT_2] = CONSUMABLE_SLOTS;
const H = CLIENT_CONFIG.hotbar;
const R = WEAPON_SLOTS[2];

/** Own effective stats for a class, optionally with `n` copies of some lines
 *  folded in. */
function statsFor(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', held: Record<string, number> = {}): EffectiveStats {
  const cards = Object.entries(held).flatMap(([id, n]) => Array<string>(n).fill(id));
  return effectiveStats(CONFIG.shipClasses[cls], cards);
}

/** The rung an interaction line names — its last token, the Roman numeral. */
function rungOf(line: string | undefined): string | undefined {
  return line?.split(' ').at(-1);
}

// --- the hover dwell -----------------------------------------------------------

describe('the hover dwell — keyed on the TARGET (a slot or the HP globe)', () => {
  it('restarts the clock whenever the target changes, and keeps it when it does not', () => {
    const a = nextHover(NO_HOVER, Q, 1000);
    expect(a).toEqual({ target: Q, since: 1000 });
    expect(nextHover(a, Q, 1400)).toBe(a); // same slot: the SAME object, clock intact
    expect(nextHover(a, E, 1400)).toEqual({ target: E, since: 1400 });
    expect(nextHover(a, 'ship', 1400)).toEqual({ target: 'ship', since: 1400 });
    expect(nextHover(a, null, 1400)).toEqual({ target: null, since: 1400 });
  });

  it('opens only after the dwell, never under the refit lockout, never without a model', () => {
    const delay = H.tooltip.delayMs;
    for (const target of [Q, 'ship'] as const) {
      const h = nextHover(NO_HOVER, target, 0);
      expect(hoverReady(h, delay - 1)).toBe(false);
      expect(hoverReady(h, delay)).toBe(true);
      expect(shouldShowTooltip(h, delay, false, true)).toBe(true);
      expect(shouldShowTooltip(h, delay, true, true)).toBe(false); // refit lockout
      expect(shouldShowTooltip(h, delay, false, false)).toBe(false); // nothing to describe
    }
    expect(shouldShowTooltip(NO_HOVER, delay, false, true)).toBe(false);
    // A null cursor hovers nothing, which can never be ready.
    expect(hoverReady(nextHover(nextHover(NO_HOVER, Q, 0), null, 10), 99999)).toBe(false);
  });
});

// --- THE STAT LINES (amendment 185) ---------------------------------------------

describe('the slot tooltip prints the LIVE stat table, one number per line (amendment 185)', () => {
  it('has the heading and the stat rows — and no prose, no build list', () => {
    const m = tooltipModel(Q, 'heavyTorpedo', STATS)!;
    expect(Object.keys(m).sort()).toEqual(['interaction', 'name', 'stats']);
    expect(m.name).toBe(m.name.toUpperCase());
    expect(m.stats.every((r) => r.cur === null)).toBe(true); // absolute rows, never an arrow
  });

  // THE HEADING IS THE CATALOG LINE'S NAME (Eric 2026-09-30, review gate P9):
  // where a line fits the equipment the hover names it as the card did; the
  // three Shifts have no line and keep EQUIPMENT_NAME.
  it('the heading is the LINE\'s name where one fits, EQUIPMENT_NAME for the Shifts', () => {
    // equipment id → the catalog line that fits it (the gun's is the CANNON ladder, `deckGun`).
    const lineOf: Record<string, string> = {
      heavyTorpedo: 'heavyTorpedo',
      lightTorpedo: 'lightTorpedo',
      navalMines: 'navalMines',
      captiveMines: 'captiveMines',
      foulingMines: 'foulingMines',
      broadside: 'broadside',
      starShells: 'starShells',
      phosphorShells: 'phosphorShells',
      gun: 'deckGun',
      machineGun: 'machineGun',
      flak: 'flak',
    };
    for (const [id, line] of Object.entries(lineOf)) {
      expect(tooltipModel(Q, id as never, STATS)!.name, id).toBe(boonName(line).toUpperCase());
    }
    for (const id of ['boost', 'instantReload', 'hunker'] as const) {
      expect(tooltipModel(Q, id, STATS)!.name, id).toBe(EQUIPMENT_NAME[id].toUpperCase());
    }
  });

  it('prints a weapon\'s stat table off the live fold, and the rows move with the build', () => {
    const stats = statsFor('torpedoBoat', { heavyTorpedo: 2 });
    const m = tooltipModel(Q, 'heavyTorpedo', stats, ['heavyTorpedo', 'heavyTorpedo'])!;
    expect(m.stats).toEqual(equipmentStatRows('heavyTorpedo', stats));
    // The rows MOVE with the build: a tier-I fold prints a different table.
    expect(tooltipModel(Q, 'heavyTorpedo', statsFor('torpedoBoat', { heavyTorpedo: 1 }))!.stats).not.toEqual(m.stats);
  });

  it('prints the cannon\'s whole table on the gun slot, off the live fold, at its rung', () => {
    const stats = statsFor('torpedoBoat', { deckGun: 1 });
    const m = tooltipModel(SLOT_GUN, 'gun', stats, ['deckGun'])!;
    expect(m.stats).toEqual(equipmentStatRows('gun', stats));
    expect(rungOf(m.interaction)).toBe(romanTier(2));
  });

  it('prints each Shift\'s own stat table on the Shift slot, on any hull', () => {
    for (const [id, cls] of [['boost', 'torpedoBoat'], ['instantReload', 'mineLayer'], ['hunker', 'battleship']] as const) {
      const stats = statsFor(cls);
      expect(tooltipModel(SLOT_BOOST, id, stats)!.stats, id).toEqual(equipmentStatRows(id, stats));
    }
  });

  it('prints a belt slot\'s CONSUMABLE_ROWS — the card face\'s own rows', () => {
    const m = tooltipModel(BELT_1, 'hullRepair', STATS, [], 2)!;
    expect(m.interaction).toBe('');
    expect(m.stats).toEqual(consumableStatRows('hullRepair'));
    expect(tooltipModel(BELT_2, 'countermeasure', STATS, [], 3)!.stats).toEqual(consumableStatRows('countermeasure'));
    // The one stub left (DEPTH CHARGE) has no mechanism, so no rows.
    expect(tooltipModel(BELT_1, 'depthCharge', STATS, [], 1)!.stats).toEqual([]);
  });

  it('has nothing to describe for an unfitted slot — weapon row or belt', () => {
    expect(tooltipModel(Q, null, STATS)).toBeNull();
    expect(tooltipModel(8, null, STATS)).toBeNull();
  });

  it('prints no line for a weapon without a build, and none for an ability (amendment 203)', () => {
    expect(tooltipModel(Q, 'heavyTorpedo', STATS)?.interaction).toBe('');
    expect(tooltipModel(E, 'starShells', STATS)?.interaction).toBe('');
    expect(tooltipModel(SLOT_BOOST, 'boost', STATS)?.interaction).toBe('');
  });
});

// --- THE SHIP PANEL ON THE HP GLOBE (amendment 186) ------------------------------

describe('the HP globe opens a SHIP panel with the eight ship stats (amendment 186)', () => {
  it('names the hull over SHIP and the eight ladders\' live values', () => {
    const m = shipTooltipModel('torpedoBoat', STATS)!;
    expect(m.name).toBe(CLASS_DISPLAY_NAMES.torpedoBoat);
    expect(m.interaction).toBe(SHIP_INTERACTION);
    expect(m.stats).toHaveLength(8);
    expect(m.stats).toEqual(shipStatRows(STATS));
  });

  it('moves with the build, and has no panel for a hull it cannot name', () => {
    const armored = statsFor('torpedoBoat', { hullPoints: 1 });
    expect(shipTooltipModel('torpedoBoat', armored)!.stats[0]!.next).toBe(String(armored.maxHp));
    expect(armored.maxHp).toBeGreaterThan(STATS.maxHp);
    expect(shipTooltipModel(undefined, STATS)).toBeNull();
    expect(shipTooltipModel('dreadnought' as never, STATS)).toBeNull();
  });

  it('hit-tests the globe CIRCLE: a slot first, then the HP globe, never the helm globe', () => {
    const layout = hudBarLayout(1366, 768);
    const g = layout.hpGlobe;
    expect(hoverTargetAt({ x: g.cx, y: g.cy }, layout)).toBe('ship');
    expect(hoverTargetAt({ x: g.cx + g.r - 1, y: g.cy }, layout)).toBe('ship');
    // The bounding square's corner is OUTSIDE the circle: water.
    expect(hoverTargetAt({ x: g.cx - g.r + 2, y: g.cy - g.r + 2 }, layout)).toBeNull();
    // The helm globe stays silent.
    const helm = layout.helmGlobe;
    expect(hoverTargetAt({ x: helm.cx, y: helm.cy }, layout)).toBeNull();
    // A slot square still answers as the slot.
    const sq = layout.squares[Q];
    expect(hoverTargetAt({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }, layout)).toBe(Q);
    expect(hoverTargetAt({ x: g.cx, y: g.cy }, null)).toBeNull();
  });

  // THE GLOBE IS CHROME TO A PRESS TOO (Eric 2026-09-30, review gate P11).
  it('a PRESS inside the HP globe is swallowed with no slot action; water beside it falls through; a square still acts', () => {
    const layout = hudBarLayout(1366, 768);
    const g = layout.hpGlobe;
    const acted: number[] = [];
    const act = (slot: number): void => { acted.push(slot); };
    expect(hotbarPress({ x: g.cx, y: g.cy }, layout, act)).toBe(true); // consumed: never a shot, never a hold
    expect(hotbarPress({ x: g.cx + g.r - 1, y: g.cy }, layout, act)).toBe(true);
    expect(acted).toEqual([]); // ...and no slot selected or fired
    // Water beside the globe (outside the circle, inside its bounding square) fires as before.
    expect(hotbarPress({ x: g.cx - g.r + 2, y: g.cy - g.r + 2 }, layout, act)).toBe(false);
    // The helm globe stays water.
    expect(hotbarPress({ x: layout.helmGlobe.cx, y: layout.helmGlobe.cy }, layout, act)).toBe(false);
    // Amendment 11 stands: a square swallows AND acts.
    const sq = layout.squares[Q];
    expect(hotbarPress({ x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 }, layout, act)).toBe(true);
    expect(acted).toEqual([Q]);
    // A hidden bar routes nothing.
    expect(hotbarPress({ x: g.cx, y: g.cy }, null, act)).toBe(false);
  });

  it('anchors on the globe\'s bounding square, centred above the globe', () => {
    const layout = hudBarLayout(1366, 768);
    const g = layout.hpGlobe;
    const anchor = hoverAnchor('ship', layout);
    expect(anchor).toEqual({ x: g.cx - g.r, y: g.cy - g.r, w: 2 * g.r, h: 2 * g.r });
    expect(hoverAnchor(Q, layout)).toBe(layout.squares[Q]);
    const screenH = layout.bar.y + layout.bar.h + CLIENT_CONFIG.hudBar.floor;
    const { geom, place } = tooltipFrame(shipTooltipModel('battleship', statsFor('battleship'))!, anchor, 1366, screenH);
    expect(place.y + geom.panelH).toBeLessThanOrEqual(anchor.y - H.tooltip.gap);
    expect(place.notchX).toBeCloseTo(g.cx, 6);
  });
});

describe('the model cache is keyed on the TARGET', () => {
  const stats = STATS;
  const boons: readonly string[] = [];
  const slotEntry: TooltipCache = { target: Q, id: 'heavyTorpedo', stats, boons, n: 1, model: null };
  const shipEntry: TooltipCache = { target: 'ship', id: null, cls: 'torpedoBoat', stats, boons, n: 0, model: null };

  it('hits only for the same target and inputs', () => {
    expect(tipCacheHit(slotEntry, Q, 'heavyTorpedo', stats, boons, 1)).toBe(true);
    expect(tipCacheHit(slotEntry, 'ship', null, stats, boons, 0)).toBe(false);
    expect(tipCacheHit(shipEntry, 'ship', null, stats, boons, 0, 'torpedoBoat')).toBe(true);
    expect(tipCacheHit(shipEntry, Q, 'heavyTorpedo', stats, boons, 1)).toBe(false);
    // A different hull is a different panel.
    expect(tipCacheHit(shipEntry, 'ship', null, stats, boons, 0, 'battleship')).toBe(false);
    // New stats (a fold) or a moved stock re-build.
    expect(tipCacheHit(slotEntry, Q, 'heavyTorpedo', statsFor('torpedoBoat', { hullPoints: 1 }), boons, 1)).toBe(false);
    expect(tipCacheHit(slotEntry, Q, 'heavyTorpedo', stats, boons, 2)).toBe(false);
    expect(tipCacheHit(null, Q, 'heavyTorpedo', stats, boons, 1)).toBe(false);
  });
});

// --- the fit arithmetic -----------------------------------------------------------

describe('the height model is the render: heading + one line per stat', () => {
  it('sums padding, the heading block, the two gaps and n line boxes', () => {
    const m = tooltipModel(Q, 'heavyTorpedo', STATS)!;
    const met = tooltipMetrics(m);
    expect(met.statLines).toBe(m.stats.length);
    expect(met.height).toBe(
      H.tooltip.pad * 2 + headingHeight(m.interaction) + TIP_TYPE.nameGap + TIP_TYPE.descGap + m.stats.length * TIP_TYPE.boonLineHeight,
    );
    expect(met.innerW).toBe(tooltipInnerWidth());
    expect(met.overflow).toBeLessThanOrEqual(0);
  });

  it('starts the value column statColGap past the widest label', () => {
    const m = tooltipModel(SLOT_GUN, 'gun', STATS)!;
    const geom = tooltipRenderGeom(m);
    expect(geom.valueDx).toBe(statLabelWidth(m.stats) + TIP_TYPE.statColGap);
    expect(geom.statsDy).toBe(H.tooltip.pad + headingHeight(m.interaction) + TIP_TYPE.nameGap + TIP_TYPE.descGap);
    expect(geom.panelH).toBe(tooltipMetrics(m).height);
  });

  it('measures the room above an anchor as the clear water under the top margin', () => {
    expect(tooltipRoomAbove({ x: 0, y: 500, w: 44, h: 44 })).toBe(500 - H.tooltip.gap - H.tooltip.margin);
  });
});

// --- what Story 8.7 put ON the panel -------------------------------------------

describe('the interaction line carries a WEAPON slot\'s TIER (ruling 13)', () => {
  it('prints the line\'s tier alone — no kind, key or switch-to (amendment 203)', () => {
    expect(rungOf(interactionLine(Q, 'heavyTorpedo', ['heavyTorpedo', 'heavyTorpedo']))).toBe(romanTier(2));
    expect(rungOf(interactionLine(Q, 'heavyTorpedo', ['heavyTorpedo']))).toBe(romanTier(1));
  });

  it('prints NO tier where the build has not climbed the line, or has no line at all', () => {
    // Fitted but no copies recorded (a caller with no build): honest silence
    // rather than a fabricated Tier I.
    expect(interactionLine(Q, 'heavyTorpedo', [])).toBe('');
    // STORY 8.12 (amendment 70). The deck gun's rung lives ONLY in the fold —
    // `stats.equipment.gun.tier` — so a caller handing over cards and no stats
    // still gets silence here. It is not that the gun has no tier; it is that
    // this caller cannot know it, and guessing `1 + copies` a second time is
    // exactly the drift the ruling forbids.
    expect(interactionLine(SLOT_GUN, 'gun', ['deckGun', 'deckGun'])).toBe('');
    // REVIEW GATE, CYCLE 147: the exact same call, WITH stats, prints the rung —
    // pinning that the silence above is a missing-stats fact, not a missing-tier
    // one. `lineForEquipment('gun')` resolves to `'deckGun'` (a real map entry),
    // so without this pin a future edit could read the RAW copy count off it
    // (2, one short of the fold's `1 + copies` = 3) and never notice.
    expect(rungOf(
      interactionLine(SLOT_GUN, 'gun', ['deckGun', 'deckGun'], 0, effectiveStats(CONFIG.shipClasses.torpedoBoat, ['deckGun', 'deckGun'])),
    )).toBe(romanTier(3));
  });

  // STORY 8.12, ERIC RULING 2026-09-18 (epic-8 amendment 70). The DECK GUN is a
  // BASE-TIER line: the hull sails with it fitted, so TIER I is the truth at
  // spawn and the header owes the player that word. The numeral is the SERVER'S
  // — `applyLineTier` wrote `1 + DECK GUN copies` onto `equipment.gun.tier`, the
  // same number the reload step is priced off — so the bar, the header and the
  // sim cannot disagree.
  it('carries the DECK GUN\'s own rung on the keyless header, read off the fold', () => {
    const gunRung = (held: Record<string, number>) =>
      rungOf(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat', held)));
    expect(gunRung({})).toBe(romanTier(1));
    expect(gunRung({ deckGun: 2 })).toBe(romanTier(3));
    // At the cap, and past a cap the server should never have granted: V, never VI.
    expect(gunRung({ deckGun: 4 })).toBe(romanTier(5));
    expect(gunRung({ deckGun: 9 })).toBe(romanTier(5));
    // Only the CANNON line is the deck gun's ladder: another gun's ladder (FLAK)
    // climbs ITS gun, never this one. (This pinned the DECK GUN BARREL card
    // until it folded into the CANNON ladder, amendment 197.)
    expect(gunRung({ flak: 2 })).toBe(romanTier(1));
  });

  it('leaves the ABILITY grammar untouched — an ability has no tier to print', () => {
    expect(interactionLine(1, 'boost', ['hullPoints'])).toBe('');
  });

  it('reaches the tooltip model, not just the helper', () => {
    const m = tooltipModel(Q, 'heavyTorpedo', STATS, ['heavyTorpedo', 'heavyTorpedo']);
    expect(m?.interaction).toBe(interactionLine(Q, 'heavyTorpedo', ['heavyTorpedo', 'heavyTorpedo']));
    expect(m?.interaction).not.toBe('');
  });
});

describe('a BELT slot has NO interaction line (amendment 203)', () => {
  it('prints nothing for any consumable, whatever its shape or stock', () => {
    expect(interactionLine(BELT_1, 'hullRepair', [], 2)).toBe('');
    expect(interactionLine(BELT_2, 'countermeasure', [], 1)).toBe('');
    expect(interactionLine(BELT_1, 'radarBuoy', [], 3)).toBe('');
    expect(interactionLine(BELT_2, 'supercavTorpedo', [], 2)).toBe('');
  });

  // THE BELT'S TORPEDO (amendment 74/75). Its name comes from the copy layer
  // (a consumable has no equipment row to read one off), and the whole model
  // is built without a stats row.
  it('builds the SUPERCAV TORPEDO\'s model off the copy layer', () => {
    const m = tooltipModel(BELT_2, 'supercavTorpedo', STATS, [], 2);
    expect(m?.name).toBe(boonName('supercavTorpedo').toUpperCase());
    expect(m?.interaction).toBe('');
    // Its rows are the card face's own CONSUMABLE_ROWS, off CONFIG.
    expect(m?.stats).toEqual(consumableStatRows('supercavTorpedo'));
  });

  it('builds the WHOLE model for a stocked belt slot — no equipment row needed', () => {
    const m = tooltipModel(BELT_1, 'hullRepair', STATS, ['hullRepair', 'hullRepair'], 2);
    expect(m).not.toBeNull();
    expect(m?.name).toBe(boonName('hullRepair').toUpperCase());
    expect(m?.interaction).toBe('');
  });
});

describe('the panel keeps its box (amendment 42)', () => {
  it('owns NO heading row for an empty interaction line, one for a tier line', () => {
    expect(interactionLines('')).toBe(0);
    expect(headingHeight('')).toBe(TIP_TYPE.headLineHeight);
    expect(interactionLines('TIER II')).toBe(1);
    expect(headingHeight('TIER II')).toBe(TIP_TYPE.headLineHeight * 2);
    const m = tooltipModel(BELT_1, 'radarBuoy', STATS, [], 5)!;
    expect(tooltipMetrics(m).interactionLines).toBe(0);
    expect(tooltipMetrics(m).overflow).toBeLessThanOrEqual(0);
  });

  it('pushes the stat rows down by the wrap, so the two can never overlap', () => {
    const none = tooltipRenderGeom({ name: 'X', interaction: '', stats: [] });
    const one = tooltipRenderGeom({ name: 'X', interaction: 'TIER II', stats: [] });
    expect(one.statsDy - none.statsDy).toBe(TIP_TYPE.headLineHeight);
  });
});

describe('tooltip placement — ABOVE the hovered square, never off the screen', () => {
  const layout = hudBarLayout(1366, 768);

  it('hangs directly over the square, centred on it', () => {
    const sq = layout.squares[2];
    const p = tooltipPlacement(sq, 200, 1366, 768);
    expect(p.y + 200).toBe(sq.y - H.tooltip.gap);
    expect(p.x + H.tooltip.width / 2).toBeCloseTo(sq.x + sq.w / 2, 6);
    expect(p.notchX).toBeCloseTo(sq.x + sq.w / 2, 6);
  });

  it('never covers the square it describes, on any slot', () => {
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const sq = layout.squares[slot];
      const p = tooltipPlacement(sq, 220, 1366, 768);
      expect(p.y + 220, String(slot)).toBeLessThanOrEqual(sq.y);
    }
  });

  it('clamps a tall panel inside the top edge, keeping the notch on the panel', () => {
    const p = tooltipPlacement(layout.squares[0], 700, 1366, 768);
    expect(p.y).toBeGreaterThanOrEqual(H.tooltip.margin);
    expect(p.notchX).toBeGreaterThanOrEqual(p.x);
    expect(p.notchX).toBeLessThanOrEqual(p.x + H.tooltip.width);
  });

  it('clamps sideways rather than running off a narrow screen', () => {
    const p = tooltipPlacement(layout.squares[8], 120, 700, 768);
    expect(p.x).toBeGreaterThanOrEqual(H.tooltip.margin);
    expect(p.x + H.tooltip.width).toBeLessThanOrEqual(700 - H.tooltip.margin);
    expect(p.notchX).toBeLessThanOrEqual(p.x + H.tooltip.width);
  });

  it('composes geometry and placement in one call', () => {
    const model = tooltipModel(Q, 'heavyTorpedo', STATS)!;
    const { geom, place } = tooltipFrame(model, { x: 600, y: 500, w: 44, h: 44 }, 1366, 768);
    expect(geom.panelH).toBeGreaterThan(0);
    expect(place.y + geom.panelH).toBeLessThanOrEqual(500);
  });
});
