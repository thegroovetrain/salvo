// THE SLOT TOOLTIP's own suite (Story 8.7, ruling 13) — the pins that moved out
// of hotbar.test.ts with the module, plus the two facts 8.7 put on the panel.
//
// The SPLIT is bookkeeping: `render/slotTooltip.ts` owns the hover dwell, the
// model, the container-fit arithmetic and the placement; `render/hotbar.ts`
// keeps the squares and the Pixi shell that paints both. Nothing about the
// panel's width, type or notch moved (epic-8 amendment 42) — what moved is
// where the code lives, and what changed is the CONTENT of one row:
//
//   • a WEAPON slot's interaction line carries its LINE's tier;
//   • a BELT slot's carries the consumable's activation shape and its stock.
//
// The belt is EMPTY in production all through 8.7 (amendment 41 — every
// consumable stub stays set), so the belt cases below run against a hand-built
// test catalog entry rather than against a shipped line. That is the point: the
// path is built and pinned now so Story 8.8 flips one flag and finds it working.

import { describe, it, expect } from 'vitest';
import {
  CATALOG,
  CONFIG,
  CONSUMABLE_SLOTS,
  SLOT_BOOST,
  SLOT_COUNT,
  SLOT_GUN,
  WEAPON_SLOTS,
  effectiveStats,
  type CatalogLine,
  type EffectiveStats,
} from '@salvo/shared';
import {
  NO_HOVER,
  SHIP_DIVIDER_ROW,
  TIP_TYPE,
  TOOLTIP_MAX_PANEL_H,
  boonBlockText,
  boonRows,
  fitBoonRows,
  headingHeight,
  hoverReady,
  interactionLines,
  moreBoonsRow,
  nextHover,
  shouldShowTooltip,
  slotBoonIds,
  tooltipFrame,
  tooltipInnerWidth,
  tooltipMetrics,
  tooltipModel,
  tooltipPlacement,
  tooltipRenderGeom,
  trimmedBoonRows,
  type TooltipBoonRow,
} from '../render/slotTooltip.js';
import { hudBarLayout } from '../render/hudBar.js';
import { interactionLine } from '../render/equipmentInfo.js';
import { CLIENT_CONFIG } from '../config.js';

const STATS: EffectiveStats = effectiveStats(CONFIG.shipClasses.torpedoBoat);
const [Q, E] = WEAPON_SLOTS;
const [BELT_1, BELT_2] = CONSUMABLE_SLOTS;

// --- the moved pins ------------------------------------------------------------

describe('the hover dwell (moved verbatim from render/hotbar.ts)', () => {
  it('restarts the clock whenever the slot changes, and keeps it when it does not', () => {
    const a = nextHover(NO_HOVER, Q, 1000);
    expect(a).toEqual({ slot: Q, since: 1000 });
    expect(nextHover(a, Q, 1400)).toBe(a); // same slot: the SAME object, clock intact
    expect(nextHover(a, E, 1400)).toEqual({ slot: E, since: 1400 });
    expect(nextHover(a, null, 1400)).toEqual({ slot: null, since: 1400 });
  });

  it('opens only after the dwell, never under the refit lockout, never without a model', () => {
    const delay = CLIENT_CONFIG.hotbar.tooltip.delayMs;
    const h = nextHover(NO_HOVER, Q, 0);
    expect(hoverReady(h, delay - 1)).toBe(false);
    expect(hoverReady(h, delay)).toBe(true);
    expect(shouldShowTooltip(h, delay, false, true)).toBe(true);
    expect(shouldShowTooltip(h, delay, true, true)).toBe(false); // refit lockout
    expect(shouldShowTooltip(h, delay, false, false)).toBe(false); // nothing to describe
    expect(shouldShowTooltip(NO_HOVER, delay, false, true)).toBe(false);
  });
});

describe('the model, the fit and the placement (moved verbatim)', () => {
  it('describes a fitted slot and nothing at all for an empty one', () => {
    expect(tooltipModel(Q, null, STATS)).toBeNull();
    const m = tooltipModel(Q, 'heavyTorpedo', STATS);
    expect(m?.name).toBe(m?.name.toUpperCase());
    expect(m?.description.length).toBeGreaterThan(0);
  });

  it('collapses stacked copies into one accrued row, and keeps the SHIP divider', () => {
    const rows = boonRows('gun', ['deckGunBarrel', 'deckGunBarrel', 'armor'], STATS);
    expect(rows.filter((r) => !r.divider)).toHaveLength(2); // one per LINE, not per copy
    expect(rows.some((r) => r.label === SHIP_DIVIDER_ROW)).toBe(true);
  });

  it('trims to a +n MORE marker that counts REAL lines, never a divider', () => {
    const rows = [
      { label: '◆ A', effect: 'a', divider: false },
      { label: SHIP_DIVIDER_ROW, effect: '', divider: true },
      { label: '◆ B', effect: 'b', divider: false },
      { label: '◆ C', effect: 'c', divider: false },
    ];
    const kept = trimmedBoonRows(rows, 2);
    // The trailing divider is popped, and the marker stands in for B and C only.
    expect(kept.map((r) => r.label)).toEqual(['◆ A', moreBoonsRow(2).label]);
  });

  it('renders the boons block as the exact string the panel paints', () => {
    expect(boonBlockText([
      { label: '◆ A', effect: 'a', divider: false },
      { label: SHIP_DIVIDER_ROW, effect: '', divider: true },
    ])).toBe(`◆ A\na\n${SHIP_DIVIDER_ROW}`);
  });

  it('keeps every panel inside the design floor, and returns [] when nothing fits', () => {
    const model = tooltipModel(Q, 'heavyTorpedo', STATS, ['heavyTorpedo', 'acousticHoming'])!;
    expect(tooltipMetrics(model).overflow).toBeLessThanOrEqual(0);
    expect(fitBoonRows(model, 0)).toEqual([]); // no budget at all: the trim bottoms out
    expect(tooltipMetrics(model).innerW).toBe(tooltipInnerWidth());
  });

  it('hangs the panel ABOVE the hovered square and clamps it inside the viewport', () => {
    const square = { x: 600, y: 500, w: 44, h: 44 };
    const p = tooltipPlacement(square, 200, 1366, 768);
    expect(p.y + 200).toBeLessThanOrEqual(square.y);
    expect(p.x).toBeGreaterThanOrEqual(CLIENT_CONFIG.hotbar.tooltip.margin);
    // The notch tips down at the square's centre, pulled inside the panel's ends.
    expect(p.notchX).toBeGreaterThan(p.x);
    expect(p.notchX).toBeLessThan(p.x + CLIENT_CONFIG.hotbar.tooltip.width);
  });

  it('re-trims against the room ABOVE the square, not against the whole screen', () => {
    const model = tooltipModel(SLOT_GUN, 'gun', STATS, ['armor', 'speed', 'turning', 'radarSweep', 'reload'])!;
    const tight = tooltipRenderGeom(model, 0, 80); // only 80px of water
    const roomy = tooltipRenderGeom(model, 0, TOOLTIP_MAX_PANEL_H);
    // The rows are what the budget buys, so a tighter budget keeps fewer of
    // them. (The panel has a floor — padding, the heading block and the
    // description — that no trim can go under; the placement's own clamps are
    // what cover that residue.)
    expect(tight.boons.length).toBeLessThan(roomy.boons.length);
    expect(tight.panelH).toBeLessThan(roomy.panelH);
  });

  it('composes geometry and placement in one call', () => {
    const model = tooltipModel(Q, 'heavyTorpedo', STATS)!;
    const { geom, place } = tooltipFrame(model, 0, { x: 600, y: 500, w: 44, h: 44 }, 1366, 768);
    expect(geom.panelH).toBeGreaterThan(0);
    expect(place.y + geom.panelH).toBeLessThanOrEqual(500);
  });
});

// --- what Story 8.7 put ON the panel -------------------------------------------

describe('the interaction line carries a WEAPON slot\'s TIER (ruling 13)', () => {
  it('prints the line\'s tier beside the switch-to grammar', () => {
    expect(interactionLine(Q, 'heavyTorpedo', ['heavyTorpedo', 'heavyTorpedo'])).toBe(
      'WEAPON · Q · SWITCH-TO · TIER II',
    );
    expect(interactionLine(Q, 'heavyTorpedo', ['heavyTorpedo'])).toBe('WEAPON · Q · SWITCH-TO · TIER I');
  });

  it('prints NO tier where the build has not climbed the line, or has no line at all', () => {
    // Fitted but no copies recorded (a caller with no build): honest silence
    // rather than a fabricated Tier I.
    expect(interactionLine(Q, 'heavyTorpedo', [])).toBe('WEAPON · Q · SWITCH-TO');
    // STORY 8.12 (amendment 70). The deck gun's rung lives ONLY in the fold —
    // `stats.equipment.gun.tier` — so a caller handing over cards and no stats
    // still gets silence here. It is not that the gun has no tier; it is that
    // this caller cannot know it, and guessing `1 + copies` a second time is
    // exactly the drift the ruling forbids.
    expect(interactionLine(SLOT_GUN, 'gun', ['deckGun', 'deckGun'])).toBe('WEAPON · ALWAYS SELECTED');
    // REVIEW GATE, CYCLE 147: the exact same call, WITH stats, prints the rung —
    // pinning that the silence above is a missing-stats fact, not a missing-tier
    // one. `lineForEquipment('gun')` resolves to `'deckGun'` (a real map entry),
    // so without this pin a future edit could read the RAW copy count off it
    // (2, one short of the fold's `1 + copies` = 3) and never notice.
    expect(
      interactionLine(SLOT_GUN, 'gun', ['deckGun', 'deckGun'], 0, effectiveStats(CONFIG.shipClasses.torpedoBoat, ['deckGun', 'deckGun'])),
    ).toBe('WEAPON · ALWAYS SELECTED · TIER III');
  });

  // STORY 8.12, ERIC RULING 2026-09-18 (epic-8 amendment 70). The DECK GUN is a
  // BASE-TIER line: the hull sails with it fitted, so TIER I is the truth at
  // spawn and the header owes the player that word. The numeral is the SERVER'S
  // — `applyLineTier` wrote `1 + DECK GUN copies` onto `equipment.gun.tier`, the
  // same number the reload step is priced off — so the bar, the header and the
  // sim cannot disagree.
  it('carries the DECK GUN\'s own rung on the keyless header, read off the fold', () => {
    expect(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat'))).toBe(
      'WEAPON · ALWAYS SELECTED · TIER I',
    );
    expect(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat', { deckGun: 2 }))).toBe(
      'WEAPON · ALWAYS SELECTED · TIER III',
    );
    // At the cap, and past a cap the server should never have granted: V, never VI.
    expect(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat', { deckGun: 4 }))).toBe(
      'WEAPON · ALWAYS SELECTED · TIER V',
    );
    expect(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat', { deckGun: 9 }))).toBe(
      'WEAPON · ALWAYS SELECTED · TIER V',
    );
    // The gun's OWN family climbs the gun, but only the DECK GUN line is its
    // ladder: a barrel card buys a barrel, not a rung.
    expect(interactionLine(SLOT_GUN, 'gun', [], 0, statsFor('torpedoBoat', { deckGunBarrel: 2 }))).toBe(
      'WEAPON · ALWAYS SELECTED · TIER I',
    );
  });

  it('leaves the ABILITY grammar untouched — an ability has no tier to print', () => {
    expect(interactionLine(1, 'boost', ['armor'])).toBe('ABILITY · Shift · ACTIVATES');
  });

  it('reaches the tooltip model, not just the helper', () => {
    const m = tooltipModel(Q, 'heavyTorpedo', STATS, ['heavyTorpedo', 'heavyTorpedo']);
    expect(m?.interaction).toContain('TIER II');
  });
});

describe('the interaction line carries a BELT slot\'s SHAPE and STOCK (ruling 13)', () => {
  it('reads KEY FIRES for an instant consumable, with its stock', () => {
    expect(interactionLine(BELT_1, 'hullRepair', [], 2)).toBe('CONSUMABLE · 1 · KEY FIRES · ×2');
    expect(interactionLine(BELT_2, 'smokeScreen', [], 1)).toBe('CONSUMABLE · 2 · KEY FIRES · ×1');
  });

  it('reads KEY PRIMES · CLICK FIRES for the click-aimed ones', () => {
    // TWO `CONSUMABLE_IS_WEAPON` lines since Story 8.13 (catalog-v3 R1 / D21
    // plus epic-8 amendment 74's SUPERCAV TORPEDO), and the shape is the thing
    // a player cannot guess — so it is stated, once, where they hover.
    expect(interactionLine(BELT_1, 'decoyBuoy', [], 3)).toBe(
      'CONSUMABLE · 1 · KEY PRIMES · CLICK FIRES · ×3',
    );
    expect(interactionLine(BELT_2, 'supercavTorpedo', [], 2)).toBe(
      'CONSUMABLE · 2 · KEY PRIMES · CLICK FIRES · ×2',
    );
  });

  // THE BELT'S FIRST FISH (amendment 74/75). Its name comes from the copy layer
  // (a consumable has no equipment row to read one off), it is the SHORTENED
  // display name Eric ruled, and the whole model is built without a stats row.
  it('builds the SUPERCAV TORPEDO\'s model off the copy layer, under its ruled name', () => {
    const m = tooltipModel(BELT_2, 'supercavTorpedo', STATS, [], 2);
    expect(m?.name).toBe('SUPERCAV TORPEDO');
    expect(m?.name).not.toContain('SUPERCAVITATING');
    expect(m?.interaction).toBe('CONSUMABLE · 2 · KEY PRIMES · CLICK FIRES · ×2');
    expect(m?.boons).toEqual([]);
  });

  it('never prints a negative or fractional stock', () => {
    expect(interactionLine(BELT_1, 'hullRepair', [], -4)).toContain('×0');
    expect(interactionLine(BELT_1, 'hullRepair', [], 2.7)).toContain('×2');
  });

  it('builds the WHOLE model for a stocked belt slot — no equipment row needed', () => {
    const m = tooltipModel(BELT_1, 'hullRepair', STATS, ['hullRepair', 'hullRepair'], 2);
    expect(m).not.toBeNull();
    expect(m?.name).toBe('HULL REPAIR');
    expect(m?.interaction).toBe('CONSUMABLE · 1 · KEY FIRES · ×2');
    // A consumable addresses no equipment, so it owns NO accrued rows — its
    // stock is on the interaction line instead.
    expect(m?.boons).toEqual([]);
    expect(slotBoonIds('hullRepair', ['hullRepair', 'armor'])).toEqual([]);
  });

  it('carries the LIVE consumable\'s explanation, and none for a stub', () => {
    // STORY 8.8 wrote HULL REPAIR's line — the first consumable with a
    // mechanism to explain. The other four are still stubs, and an unwritten
    // explanation still fails open to '' exactly as it does for an unbuilt
    // weapon (amendment 41).
    const live = tooltipModel(BELT_1, 'hullRepair', STATS, [], 1)?.description ?? '';
    expect(live.length).toBeGreaterThan(0);
    expect(live).toContain('number key');
    // ...and it carries NO amounts: the card face prints those, live from
    // CONFIG, and a number written twice can disagree with itself.
    expect(live).not.toMatch(/\d/);
    expect(tooltipModel(BELT_1, 'smokeScreen', STATS, [], 1)?.description).toBe('');
  });
});

describe('the panel absorbs the longer row without changing its box (amendment 42)', () => {
  it('keeps the shipped width and type', () => {
    expect(CLIENT_CONFIG.hotbar.tooltip.width).toBe(320);
    expect(TIP_TYPE.nameSize).toBe(17);
    expect(TIP_TYPE.interactionSize).toBe(14);
    expect(TIP_TYPE.descSize).toBe(18);
  });

  it('wraps the longest belt line to two lines and MODELS that wrap', () => {
    const longest = interactionLine(BELT_1, 'decoyBuoy', [], 5);
    expect(interactionLines(longest)).toBe(2);
    expect(headingHeight(longest)).toBe(TIP_TYPE.headLineHeight * 3);
    const m = tooltipModel(BELT_1, 'decoyBuoy', STATS, [], 5)!;
    expect(tooltipMetrics(m).interactionLines).toBe(2);
    expect(tooltipMetrics(m).overflow).toBeLessThanOrEqual(0);
  });

  it('pushes the description down by the wrap, so the two can never overlap', () => {
    const short = tooltipRenderGeom({ name: 'X', interaction: 'WEAPON · Q', description: 'd', boons: [] }, 0, 500);
    const long = tooltipRenderGeom(
      { name: 'X', interaction: interactionLine(BELT_1, 'decoyBuoy', [], 5), description: 'd', boons: [] },
      0,
      500,
    );
    expect(long.descDy - short.descDy).toBe(TIP_TYPE.headLineHeight);
  });
});

// --- MOVED FROM hotbar.test.ts, VERBATIM (Story 8.7, ruling 13) -----------------
//
// These are the ratified 2.2-8.6 tooltip pins. Not one assertion changed in the
// move — what changed is which module they import from, which is the whole
// point: `render/slotTooltip.ts` owns the panel, so the panel's pins live here.
// (The two interaction-line expectations gained the TIER suffix, because the
// line itself gained it; that is 8.7's content re-cut, pinned above.)

/** The hotbar's chrome register and the bar's, as the moved blocks read them. */
const H = CLIENT_CONFIG.hotbar;
const B = CLIENT_CONFIG.hudBar;
const R = WEAPON_SLOTS[2];

/** Own effective stats for a class, optionally with `n` copies of some lines
 *  folded in — the fixture the moved blocks were written against. */
function statsFor(cls: 'torpedoBoat' | 'battleship' | 'mineLayer', held: Record<string, number> = {}): EffectiveStats {
  const cards = Object.entries(held).flatMap(([id, n]) => Array<string>(n).fill(id));
  return effectiveStats(CONFIG.shipClasses[cls], cards);
}
describe('hover dwell — the tooltip waits out a short delay', () => {
  it('restarts the clock whenever the hovered slot changes', () => {
    let h = nextHover(NO_HOVER, 1, 1000);
    expect(hoverReady(h, 1000)).toBe(false);
    expect(hoverReady(h, 1000 + H.tooltip.delayMs)).toBe(true);
    h = nextHover(h, 2, 1200); // moved to another slot
    expect(hoverReady(h, 1400)).toBe(false);
    expect(hoverReady(h, 1200 + H.tooltip.delayMs)).toBe(true);
  });

  it('never shows with nothing hovered', () => {
    expect(hoverReady(nextHover(NO_HOVER, null, 5000), 99999)).toBe(false);
  });
});

describe('tooltip gating — dwell, pointer presence, and the modal lockout', () => {
  const dwelled = nextHover(NO_HOVER, 1, 0);

  it('shows only once the dwell elapsed, with a model to show', () => {
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, false, true)).toBe(true);
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs - 1, false, true)).toBe(false);
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, false, false)).toBe(false); // unfitted slot
  });

  it('never shows while the refit modal holds the lockout (no ghost under the modal)', () => {
    expect(shouldShowTooltip(dwelled, H.tooltip.delayMs, true, true)).toBe(false);
  });

  it('never shows with the pointer OUT of the window (a null cursor hovers nothing)', () => {
    // main.ts feeds the hotbar `mouse.pointerInside ? screenPos : null`, and a
    // null cursor resolves the hover to "no slot" — which can never be ready.
    const gone = nextHover(dwelled, null, 10);
    expect(hoverReady(gone, 99999)).toBe(false);
    expect(shouldShowTooltip(gone, 99999, false, true)).toBe(false);
  });
});

describe('tooltip model — name, interaction class, description, and NO boons', () => {
  const stats = statsFor('torpedoBoat');

  it('gives the keyless gun its always-selected interaction line, with its tier', () => {
    const t = tooltipModel(0, 'gun', stats);
    expect(t).not.toBeNull();
    expect(t?.name).toBe('DECK GUN');
    // STORY 8.12 (amendment 70): the model has the fold, so the header states
    // the rung the hull is actually standing on — I at spawn.
    expect(t?.interaction).toBe('WEAPON · ALWAYS SELECTED · TIER I');
    expect(tooltipModel(0, 'gun', statsFor('torpedoBoat', { deckGun: 2 }))?.interaction).toBe(
      'WEAPON · ALWAYS SELECTED · TIER III',
    );
    expect(t?.description.length).toBeGreaterThan(20);
  });

  it('labels a weapon slot SWITCH-TO and an ability slot ACTIVATES, with its key', () => {
    expect(tooltipModel(Q, 'heavyTorpedo', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
    expect(tooltipModel(E, 'starShells', stats)?.interaction).toBe('WEAPON · E · SWITCH-TO');
    // The boost's key is spelled `Shift` (amendment 33), and the line reads it
    // out of SLOT_KEY_GLYPHS — interactionLine knows nothing about a boost.
    expect(tooltipModel(SLOT_BOOST, 'boost', stats)?.interaction).toBe('ABILITY · Shift · ACTIVATES');
    // PIN FLIPPED (Story 2.8, amendment 45): the mine primes on its slot key
    // and places on a click, exactly like the torpedo.
    expect(interactionLine(R, 'navalMines')).toBe('WEAPON · R · SWITCH-TO');
    expect(tooltipModel(Q, 'navalMines', stats)?.interaction).toBe('WEAPON · Q · SWITCH-TO');
  });

  it('renders boons as ABSENCE — the list is empty, so no divider and no rows are drawn', () => {
    for (const id of ['gun', 'heavyTorpedo', 'navalMines', 'boost', 'broadside', 'starShells', 'radarBuoy'] as const) {
      expect(tooltipModel(Q, id, stats)?.boons).toEqual([]);
    }
  });

  it('has nothing to describe for an unfitted slot — weapon row or belt', () => {
    expect(tooltipModel(R, null, stats)).toBeNull();
    expect(tooltipModel(8, null, stats)).toBeNull(); // a belt slot, empty all story
  });
});

describe('tooltip placement — ABOVE the hovered square, never off the screen', () => {
  const layout = hudBarLayout(1366, 768);

  it('hangs directly over the square, centred on it', () => {
    // ABOVE, not flanking (Story 8.6). The old stack lived at the screen's left
    // edge, so a panel could flank it over open water; the bar is CENTRED at the
    // foot, where a flanking panel would cover the globes or the belt — the HUD
    // hiding the HUD. The space over the bar is empty by construction.
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
});

// --- REVIEW GATE, CYCLE 141: THE PANEL NEVER REACHES THE BAR -------------------
//
// `tooltipRenderGeom` trimmed the panel against the SCREEN (`screenH - 2*margin`)
// and `tooltipPlacement` then clamped it to the top margin — so at the 1280x614
// floor the tallest build's 570px panel was placed at y 8 and ran to 578, over
// the hovered square, all nine slots and both globes. The budget the trim spends
// is the ROOM ABOVE THE SQUARE, not the room on the screen.

describe('the slot tooltip never paints over the bar it points at', () => {
  const stats = statsFor('torpedoBoat');
  /** The tallest panel in the game: the gun slot holding every gun + shipwide
   *  line it can (the same build the amendment-47 walk uses). */
  const tallest = tooltipModel(
    0,
    'gun',
    stats,
    (Object.values(CATALOG) as CatalogLine[])
      .filter((d) => d.kind === 'ladder')
      .flatMap((d) => Array<string>(d.cap).fill(d.id)),
  )!;

  it('fits between the top margin and the square it hangs over, on EVERY slot at the 1280x614 floor', () => {
    const layout = hudBarLayout(1280, 614);
    const screenH = layout.bar.y + layout.bar.h + B.floor;
    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      const sq = layout.squares[slot];
      const { geom, place } = tooltipFrame(tallest, 0, sq, 1280, screenH);
      expect(place.y, `slot ${slot} top`).toBeGreaterThanOrEqual(H.tooltip.margin);
      expect(place.y + geom.panelH, `slot ${slot} bottom`).toBeLessThanOrEqual(sq.y - H.tooltip.gap);
      // The notch still tips down at the square: the panel shrank, it did not move.
      expect(place.notchX, `slot ${slot} notch`).toBeGreaterThanOrEqual(place.x);
      expect(place.notchX, `slot ${slot} notch`).toBeLessThanOrEqual(place.x + H.tooltip.width);
    }
  });

  it('spends the lost height on the `+n MORE` trim, never on dropping the count', () => {
    const layout = hudBarLayout(1280, 614);
    const screenH = layout.bar.y + layout.bar.h + B.floor;
    const { geom } = tooltipFrame(tallest, 0, layout.squares[0], 1280, screenH);
    const all = tallest.boons.filter((r) => !r.divider).length;
    const shown = geom.boons.filter((r) => !r.divider).length;
    expect(shown).toBeLessThan(all); // it really did have to trim here
    expect(shown + markerCount(geom.boons)).toBe(all);
  });
});
describe('the tooltip lists the ACCRUED build (the 2.2 absence, filled)', () => {
  const stats = statsFor('torpedoBoat');

  it('gives every held line a ◆ name row, and a live effect line where there is one', () => {
    const t = tooltipModel(0, 'gun', stats, ['deckGunBarrel', 'deckGunTurret'])!;
    expect(t.boons.map((r) => r.label)).toEqual(['◆ DECK GUN BARREL', '◆ DECK GUN TURRET']);
    expect(t.boons[0].effect).toMatch(/^Shells per shot: \d/);
    expect(t.boons[1].effect).toMatch(/^Gun rounds ready: \d/);
  });

  // PIN FLIPPED (2.9 review): the row carried a `×n` suffix beside a name that
  // ALREADY names the rung. Every stackable ladder in the catalog is
  // position-aware (Mk I/II/III...), so `×3` next to `Mk III` said the same
  // thing twice — and the lines with no rung name are the single-copy ones,
  // where there is nothing to count. The suffix is gone; the row's contract
  // ("only when needed") is now trivially satisfied.
  it('COLLAPSES a stack into ONE row that names the LINE — and nothing else', () => {
    const held = ['deckGunBarrel', 'deckGunBarrel'];
    const rows = boonRows('gun', held, statsFor('torpedoBoat', { deckGunBarrel: 2 }));
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('◆ DECK GUN BARREL');
    expect(rows[0].label).not.toContain('×');
  });

  it('prints a doctrine row with its behavior text, not a number', () => {
    // STORY 8.13 TOOK BOTH MINE VERBS AWAY (epic-8 amendments 76/80/81):
    // CAPTIVE MINES and FOULING MINES are equipment LINES now, and ACOUSTIC
    // HOMING is deleted, so no add-on bolts onto a mine or a torpedo any more.
    // The claim under test is unchanged and is made on a surviving verb: a
    // doctrine row prints BEHAVIOUR, never a stat readout.
    const t = tooltipModel(1, 'starShells', stats, ['phosphorShells'])!;
    expect(t.boons[0].label).toBe('◆ PHOSPHOR SHELLS');
    expect(t.boons[0].effect).toContain('burn');
    expect(t.boons[0].effect).not.toContain('→');
  });

  // ...and a mine slot's accrued rows are now its own LINE's copies, which is
  // what replaced the verb: the tier IS the upgrade.
  it('prints a mine slot\'s own LINE copies, with no verb row left to print', () => {
    const t = tooltipModel(1, 'foulingMines', stats, ['foulingMines', 'foulingMines'])!;
    expect(t.boons.map((r) => r.label)).toEqual(['◆ FOULING MINES']);
  });

  it('hosts the SHIPWIDE ladders under the — SHIP — divider, in the gun tooltip only', () => {
    // RELOAD, RADAR SWEEP and SPEED address no equipment at all, so they belong
    // BELOW the divider — the gun's own row here is DECK GUN BARREL, which is
    // what puts a side on each of the separator.
    const held = ['deckGunBarrel', 'reload', 'radarSweep', 'speed'];
    const gun = tooltipModel(0, 'gun', stats, held)!;
    expect(gun.boons.map((r) => r.label)).toEqual([
      '◆ DECK GUN BARREL',
      SHIP_DIVIDER_ROW,
      '◆ RELOAD',
      '◆ RADAR SWEEP',
      '◆ SPEED',
    ]);
    expect(gun.boons[1].divider).toBe(true);
    expect(gun.boons[1].effect).toBe('');
    expect(tooltipModel(1, 'heavyTorpedo', stats, held)!.boons).toEqual([]);
  });

  it('still renders ABSENCE for a slot with nothing fitted', () => {
    expect(tooltipModel(1, 'heavyTorpedo', stats, ['deckGunBarrel'])!.boons).toEqual([]);
    expect(tooltipModel(1, 'heavyTorpedo', stats)!.boons).toEqual([]);
  });

  it('reports the LIVE value, so the row moves with the stack', () => {
    const one = tooltipModel(0, 'gun', statsFor('torpedoBoat', { deckGunBarrel: 1 }), ['deckGunBarrel'])!;
    const two = tooltipModel(0, 'gun', statsFor('torpedoBoat', { deckGunBarrel: 2 }), Array(2).fill('deckGunBarrel'))!;
    expect(one.boons[0].effect).not.toBe(two.boons[0].effect);
  });
});

// --- STORY 2.9 REVIEW: the tooltip tells the truth about what it CANNOT show --

/** A row list shaped by hand — the trim's edge cases are shapes, not builds. */
const row = (label: string): TooltipBoonRow => ({ label: `◆ ${label}`, effect: 'x', divider: false });
const divider = (label = SHIP_DIVIDER_ROW): TooltipBoonRow => ({ label, effect: '', divider: true });
/** The `+n` a marker row is claiming (0 when the list ends in a real row). */
function markerCount(rows: readonly TooltipBoonRow[]): number {
  return Number(/\+(\d+) MORE/.exec(rows[rows.length - 1]?.label ?? '')?.[1] ?? 0);
}

describe('trimmedBoonRows — the +n MORE marker counts BOONS, not furniture', () => {
  it('never counts a divider as a hidden line', () => {
    // [own, — SHIP —, ship1, ship2] cut to two: the kept divider goes (see
    // below) and TWO real lines are hidden — not three, which is what counting
    // the separator as a boon claimed.
    const rows = [row('OWN'), divider(), row('SHIP1'), row('SHIP2')];
    expect(markerCount(trimmedBoonRows(rows, 2))).toBe(2);
  });

  it('pops a kept divider that would sit directly above the marker', () => {
    const rows = [row('OWN'), divider(), row('SHIP1'), row('SHIP2')];
    const out = trimmedBoonRows(rows, 2);
    expect(out.map((r) => r.label)).toEqual(['◆ OWN', '◆ +2 MORE']);
  });

  it('pops a trailing divider even when nothing is hidden', () => {
    const rows = [row('OWN'), divider()];
    expect(trimmedBoonRows(rows, 2).map((r) => r.label)).toEqual(['◆ OWN']);
  });

  it('FOLDS an earlier trim into its own count (a second pass never forgets)', () => {
    const rows = [row('A'), row('B'), row('C'), row('D')];
    const once = trimmedBoonRows(rows, 3); // A, B, C, +1 MORE
    expect(markerCount(once)).toBe(1);
    // Trimming THAT again (the render's viewport clamp) must fold the earlier
    // count in: B and C plus the D the first pass already hid.
    const twice = trimmedBoonRows(once, 1);
    expect(twice.map((r) => r.label)).toEqual(['◆ A', '◆ +3 MORE']);
  });
});

describe('tooltipRenderGeom — the model reconciled with the room it has', () => {
  const stats = statsFor('torpedoBoat');
  /** The gun slot holding every gun + shipwide line it can (the tallest panel). */
  const maxedGunBuild = Object.values(CATALOG)
    .filter((d) => d.kind === 'ladder')
    .flatMap((d) => Array<string>(d.cap).fill(d.id));

  it('places the boons block below the MEASURED description, never under it', () => {
    const model = tooltipModel(0, 'gun', stats, ['deckGunBarrel', 'reload'])!;
    const modelled = tooltipRenderGeom(model, 0, 1080);
    // Pixi wrapped the description taller than the mono model predicted (the
    // model is an upper bound on WIDTH, a nominal on height). The block below it
    // has to move, or the description renders straight through the build list.
    const measured = tooltipRenderGeom(model, 400, 1080);
    expect(measured.boonsDy - measured.descDy).toBeGreaterThanOrEqual(400);
    expect(measured.boonsDy).toBeGreaterThan(modelled.boonsDy);
    expect(measured.panelH).toBeGreaterThan(modelled.panelH);
  });

  it('never shrinks below the model — the fit pin stays the authority', () => {
    const model = tooltipModel(0, 'gun', stats, ['deckGunBarrel'])!;
    const under = tooltipRenderGeom(model, 1, 1080); // a measurement smaller than modelled
    expect(under.panelH).toBe(tooltipRenderGeom(model, 0, 1080).panelH);
  });

  it('re-trims against a SPACE shorter than the design floor', () => {
    // The third argument is the ROOM ABOVE THE HOVERED SQUARE (review gate,
    // cycle 141) — it used to be the viewport height, which is a budget the
    // panel does not actually get to spend, since it hangs above the square.
    const model = tooltipModel(0, 'gun', stats, maxedGunBuild)!;
    const roomy = tooltipRenderGeom(model, 0, 1080);
    const cramped = tooltipRenderGeom(model, 0, 404);
    expect(roomy.panelH).toBeLessThanOrEqual(TOOLTIP_MAX_PANEL_H);
    // 404px of room is well under the 602px the model was fitted to: rows come
    // off until the panel fits the space it is actually in. It used to read
    // 500px; cycle 119's INTEL RANGE deletion took a whole LINE out of the
    // gun+shipwide build, and the shorter panel now fits 500px without dropping
    // a row — so the pin moved to a budget where trimming still bites rather
    // than asserting a trim that no longer has to happen.
    expect(cramped.boons.length).toBeLessThan(roomy.boons.length);
    expect(cramped.panelH).toBeLessThanOrEqual(404);
  });

  it('still accounts for every accrued line it dropped, at any viewport', () => {
    const model = tooltipModel(0, 'gun', stats, maxedGunBuild)!;
    const all = boonRows('gun', maxedGunBuild, stats).filter((r) => !r.divider).length;
    for (const room of [1080, 700, 500, 404]) {
      const geom = tooltipRenderGeom(model, 0, room);
      const shown = geom.boons.filter((r) => !r.divider).length;
      expect(shown + markerCount(geom.boons), `${room}px`).toBe(all);
    }
  });

  it('keeps the description block where the model says it starts', () => {
    const model = tooltipModel(0, 'gun', stats, [])!;
    const geom = tooltipRenderGeom(model, 0, 1080);
    // THREE head lines since Story 8.12: the name, and the two the gun's header
    // wraps to now that it carries ` · TIER I`. That wrap is not new grammar —
    // `WEAPON · Q · SWITCH-TO · TIER II` and the longest belt line have both
    // wrapped to two since 8.7, and the geometry has always been measured, not
    // assumed. What this pins is that the description still starts BELOW the
    // measured head, whatever the head grew to.
    expect(interactionLines(model.interaction)).toBe(2);
    expect(geom.descDy).toBe(H.tooltip.pad + TIP_TYPE.headLineHeight * 3 + TIP_TYPE.nameGap + TIP_TYPE.descGap);
  });
});

