// THE CONSOLE LAYOUT SPINE (Story 10.10, epic-10 amendments 16 / 17; plan
// O2–O6, the ship console's sizes per Eric's R20) — ONE pure function from the
// logical viewport to every rect the two battle consoles and the offer group
// draw in, plus the hit test that routes a press on them.
//
//   ┌ kill feed (DOM) ┐                                   top-right
//   │                 │
//   ├ OFFER GROUP ────┤  178 = 16 + 150 + 12
//   │ header · 2×2    │
//   │                 │
//   SHIP    (center: water, ship, world — nothing of ours)   WEAPONS
//   console                                                  console
//   (left, bottom-anchored)                       (right, bottom-anchored)
//
// LOGICAL px: the HUD layer is scaled by the UI-scale setting, so a caller
// passes `screen / uiScale` exactly as it did for the bar's `hudBarLayout`.
// Every size comes from `CLIENT_CONFIG.console`; this module mints none.
//
// MEASURED GROWTH: a weapon row is 58 px, or 66 when its stats line does not
// fit one line. The spine stays pure by taking that verdict as an input
// (`opts.statsTwoLine`, one flag per row) — `statsNeedTwoLines` below is the
// one measure, on the mono model (util/monoMeasure.ts), that callers use to
// produce it.
//
// THE OFFER'S CLEARANCE is a REPORTED fact, never a throw: `offerClear` says
// whether `offer.bottom + clearGap ≤ weapons.top` held. The tests pin it true
// at 1366×768 and 1920×1080; a viewport the HUD cannot fit (the 125 % UI tier
// on a 768 px screen leaves 614 logical px) must still render, not crash.

import { INDEX_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { monoTextWidth } from '../../util/monoMeasure.js';

const K = CLIENT_CONFIG.console;
const ROW = K.row;
const SHIP = K.ship;
const OFFER = K.offer;
const AB = K.abilities;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The five weapon rows, top to bottom — the ruled order (R17). */
export const WEAPON_ROW_KINDS = ['mainBattery', 'secondaries', 'torpedo', 'mines', 'special'] as const;
export type WeaponRowKind = (typeof WEAPON_ROW_KINDS)[number];

/** The three ability buttons, left to right (O5). */
export const ABILITY_KINDS = ['repair', 'smoke', 'shift'] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

/** One weapon row-button and its three lines (O4). */
export interface WeaponRowRect extends Rect {
  kind: WeaponRowKind;
  /** Line 1: name · state word · tier · key chip. */
  line1: Rect;
  /** Line 2: the per-mount clocks (or the secondaries' heat bar). */
  line2: Rect;
  /** Line 3: the stats line — one 9 px line, or two when `twoLine`. */
  stats: Rect;
  twoLine: boolean;
}

export interface WeaponsConsoleLayout {
  frame: Rect;
  rows: WeaponRowRect[];
}

/** One ability button, tagged with what it presses. */
export interface AbilityRect extends Rect {
  kind: AbilityKind;
}

/** One index row: the label, the value, and the five-bar tier ladder (R20). */
export interface IndexRowRect extends Rect {
  label: Rect;
  value: Rect;
  ladder: Rect;
  bars: Rect[];
}

export interface ShipConsoleLayout {
  frame: Rect;
  /** The percent numeral line (`72 %` + `HULL`). */
  hullLine: Rect;
  /** The 10-segment bar and its segments, left to right. */
  hullBar: Rect;
  segments: Rect[];
  indices: IndexRowRect[];
  /** HDG / KTS readout line. */
  helmReadout: Rect;
  /** The 200 px horizontal telegraph (astern LEFT, ahead RIGHT). */
  ladder: Rect;
  /** The rudder track (centered under the ladder). */
  rudder: Rect;
  /** LV tag line, the bank chip at its right end, the track under both. */
  levelRow: Rect;
  bankChip: Rect;
  track: Rect;
}

export interface OfferLayout {
  frame: Rect;
  /** The header line (`2 LEVELS`), and — at the countdown — REDRAW at its right. */
  header: Rect;
  cards: Rect[];
  /** The REDRAW button, or null outside the countdown. */
  redraw: Rect | null;
}

export interface ConsoleLayout {
  screen: { w: number; h: number };
  ship: ShipConsoleLayout;
  weapons: WeaponsConsoleLayout;
  abilities: AbilityRect[];
  offer: OfferLayout;
  /** `offer.bottom + clearGap ≤ weapons.top` held (see the header). */
  offerClear: boolean;
  /** The clear water between the two consoles (px). */
  centerClear: number;
}

export interface ConsoleLayoutOpts {
  /** The countdown: the offer group carries REDRAW. */
  countdown?: boolean;
  /** Per weapon row (ruled order): its stats line needs two lines. */
  statsTwoLine?: readonly boolean[];
}

// --- the measure ------------------------------------------------------------------

/** The width a stats line has: the row less its side padding. */
export const STATS_LINE_W = K.width - 2 * ROW.padX;

/** Pure: does this stats-line text overflow one line at the 9 px register? */
export function statsNeedTwoLines(text: string): boolean {
  return monoTextWidth(text, K.type.stats, K.type.statsTracking) > STATS_LINE_W;
}

// --- the weapons console -------------------------------------------------------

function rowHeight(twoLine: boolean): number {
  return twoLine ? ROW.grownH : ROW.h;
}

/** The weapons console's height for a set of row growth flags (rows + abilities). */
export function weaponsConsoleHeight(statsTwoLine: readonly boolean[] = []): number {
  let h = 0;
  WEAPON_ROW_KINDS.forEach((_, i) => {
    h += rowHeight(statsTwoLine[i] === true) + (i > 0 ? ROW.gap : 0);
  });
  return h + AB.topGap + AB.h;
}

function weaponRow(kind: WeaponRowKind, x: number, y: number, twoLine: boolean): WeaponRowRect {
  const innerX = x + ROW.padX;
  const innerW = K.width - 2 * ROW.padX;
  return {
    kind,
    x,
    y,
    w: K.width,
    h: rowHeight(twoLine),
    line1: { x: innerX, y: y + ROW.line1Y, w: innerW, h: ROW.line1H },
    line2: { x: innerX, y: y + ROW.line2Y, w: innerW, h: ROW.line2H },
    stats: { x: innerX, y: y + ROW.statsY, w: innerW, h: ROW.statsLineH * (twoLine ? 2 : 1) },
    twoLine,
  };
}

function weaponsLayout(screenW: number, screenH: number, statsTwoLine: readonly boolean[]): {
  weapons: WeaponsConsoleLayout;
  abilities: AbilityRect[];
} {
  const x = screenW - K.sideInset - K.width;
  const h = weaponsConsoleHeight(statsTwoLine);
  const top = screenH - K.bottomInset - h;
  const rows: WeaponRowRect[] = [];
  let y = top;
  WEAPON_ROW_KINDS.forEach((kind, i) => {
    const row = weaponRow(kind, x, y, statsTwoLine[i] === true);
    rows.push(row);
    y += row.h + ROW.gap;
  });
  const abTop = rows[rows.length - 1].y + rows[rows.length - 1].h + AB.topGap;
  const abilities = ABILITY_KINDS.map((kind, i) => ({ kind, x: x + i * (AB.w + AB.gap), y: abTop, w: AB.w, h: AB.h }));
  return { weapons: { frame: { x, y: top, w: K.width, h }, rows }, abilities };
}

// --- the ship console ----------------------------------------------------------

/** One row per index — the shared `INDEX_IDS` (ARMOR … RANGE). */
const INDEX_COUNT = INDEX_IDS.length;

/** The gaps the R20 fill grows evenly: three section seams + the index seams. */
const GROWN_GAPS = 3 + (INDEX_COUNT - 1);

const HULL_BLOCK = SHIP.hullLine + SHIP.hullBarGap + SHIP.hullBarH;
const HELM_BLOCK = SHIP.helmReadoutH + SHIP.helmGap + SHIP.ladderH + SHIP.helmGap + SHIP.rudderRowH;
const LEVEL_BLOCK = SHIP.levelRowH + SHIP.trackGap + SHIP.trackH;
const INDEX_BLOCK_MIN = INDEX_COUNT * SHIP.indexRowH + (INDEX_COUNT - 1) * SHIP.indexRowGap;

/** The ship console at its MINIMUM gaps. */
export const SHIP_CONSOLE_MIN_H = HULL_BLOCK + INDEX_BLOCK_MIN + HELM_BLOCK + LEVEL_BLOCK + 3 * K.sectionGap;

/**
 * Pure: the ship console's height on a viewport `screenH` tall — the floor
 * viewport's available column (R20: "use the full height the floor viewport
 * allows"), never taller than THIS viewport's column, never shorter than its
 * minimum. A taller viewport keeps the floor's height (bottom-anchored, air above).
 */
export function shipConsoleHeight(screenH: number): number {
  const floorCol = SHIP.floorH - K.bottomInset - SHIP.topClearance;
  const col = screenH - K.bottomInset - SHIP.topClearance;
  return Math.max(SHIP_CONSOLE_MIN_H, Math.min(floorCol, col));
}

/** The extra px each grown gap takes at a console height. */
function gapGrowth(height: number): number {
  return Math.max(0, height - SHIP_CONSOLE_MIN_H) / GROWN_GAPS;
}

/** Five ladder bars, right-aligned in a row. */
function tierBars(right: number, cy: number): { ladder: Rect; bars: Rect[] } {
  const b = SHIP.tierBar;
  const w = SHIP.tierBars * b.w + (SHIP.tierBars - 1) * b.gap;
  const x = right - w;
  const y = cy - b.h / 2;
  const bars = Array.from({ length: SHIP.tierBars }, (_, i) => ({ x: x + i * (b.w + b.gap), y, w: b.w, h: b.h }));
  return { ladder: { x, y, w, h: b.h }, bars };
}

function indexRow(x: number, y: number): IndexRowRect {
  const h = SHIP.indexRowH;
  const { ladder, bars } = tierBars(x + K.width, y + h / 2);
  return {
    x,
    y,
    w: K.width,
    h,
    label: { x, y, w: SHIP.indexLabelW, h },
    value: { x: x + SHIP.indexLabelW, y, w: ladder.x - (x + SHIP.indexLabelW), h },
    ladder,
    bars,
  };
}

function hullSegments(bar: Rect): Rect[] {
  const n = SHIP.segments;
  const w = (bar.w - (n - 1) * SHIP.segmentGap) / n;
  return Array.from({ length: n }, (_, i) => ({ x: bar.x + i * (w + SHIP.segmentGap), y: bar.y, w, h: bar.h }));
}

function helmBlock(x: number, y: number): Pick<ShipConsoleLayout, 'helmReadout' | 'ladder' | 'rudder'> {
  const ladderX = x + (K.width - SHIP.ladderW) / 2;
  const ladderY = y + SHIP.helmReadoutH + SHIP.helmGap;
  const rudderY = ladderY + SHIP.ladderH + SHIP.helmGap;
  return {
    helmReadout: { x, y, w: K.width, h: SHIP.helmReadoutH },
    ladder: { x: ladderX, y: ladderY, w: SHIP.ladderW, h: SHIP.ladderH },
    rudder: { x: x + (K.width - SHIP.rudderTrack) / 2, y: rudderY, w: SHIP.rudderTrack, h: SHIP.rudderRowH },
  };
}

function levelBlock(x: number, y: number): Pick<ShipConsoleLayout, 'levelRow' | 'bankChip' | 'track'> {
  const levelRow = { x, y, w: K.width, h: SHIP.levelRowH };
  const bankChip = { x: x + K.width - SHIP.bankChip, y: y + (SHIP.levelRowH - SHIP.bankChip) / 2, w: SHIP.bankChip, h: SHIP.bankChip };
  const track = { x, y: y + SHIP.levelRowH + SHIP.trackGap, w: K.width, h: SHIP.trackH };
  return { levelRow, bankChip, track };
}

/** Pure: the ship console, bottom-anchored on the left edge (O6 + R20). */
export function shipLayout(screenH: number): ShipConsoleLayout {
  const x = K.sideInset;
  const h = shipConsoleHeight(screenH);
  const grow = gapGrowth(h);
  const top = screenH - K.bottomInset - h;
  const hullLine = { x, y: top, w: K.width, h: SHIP.hullLine };
  const hullBar = { x, y: top + SHIP.hullLine + SHIP.hullBarGap, w: K.width, h: SHIP.hullBarH };
  let y = top + HULL_BLOCK + K.sectionGap + grow;
  const indices: IndexRowRect[] = [];
  for (let i = 0; i < INDEX_COUNT; i++) {
    indices.push(indexRow(x, y));
    y += SHIP.indexRowH + SHIP.indexRowGap + grow;
  }
  // The loop added one row seam too many; the section seam replaces it.
  y += K.sectionGap - SHIP.indexRowGap;
  const helm = helmBlock(x, y);
  y += HELM_BLOCK + K.sectionGap + grow;
  return {
    frame: { x, y: top, w: K.width, h },
    hullLine,
    hullBar,
    segments: hullSegments(hullBar),
    indices,
    ...helm,
    ...levelBlock(x, y),
  };
}

// --- the offer group -----------------------------------------------------------

/** The offer group's top edge: under the kill feed's clearance (O2). */
export const OFFER_TOP = K.killFeed.top + K.killFeed.clearance + K.killFeed.gap;

/**
 * Pure: the offer group (O3). At the countdown REDRAW sits at the RIGHT END OF
 * THE HEADER LINE, which grows to the button's height — R10's "REDRAW beside
 * it". (O3 drew it as a footer under the grid; at 1366×768 that footer cannot
 * clear the weapons console by the ruled 12 px: 178 + 192 + 12 = 382 > 376.)
 */
export function offerLayout(screenW: number, countdown: boolean): OfferLayout {
  const x = screenW - K.sideInset - K.width;
  const headerH = countdown ? OFFER.redrawH : OFFER.header;
  const header = { x, y: OFFER_TOP, w: K.width, h: headerH };
  const gridY = OFFER_TOP + headerH;
  const cards: Rect[] = [];
  for (let i = 0; i < 4; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    cards.push({ x: x + col * (OFFER.cardW + OFFER.gap), y: gridY + row * (OFFER.cardH + OFFER.gap), w: OFFER.cardW, h: OFFER.cardH });
  }
  const redraw = countdown ? { x: x + K.width - OFFER.redrawW, y: OFFER_TOP, w: OFFER.redrawW, h: OFFER.redrawH } : null;
  const h = headerH + 2 * OFFER.cardH + OFFER.gap;
  return { frame: { x, y: OFFER_TOP, w: K.width, h }, header, cards, redraw };
}

// --- the whole spine -----------------------------------------------------------

/** Pure: every console rect for a logical viewport. */
export function consoleLayout(screenW: number, screenH: number, opts: ConsoleLayoutOpts = {}): ConsoleLayout {
  const { weapons, abilities } = weaponsLayout(screenW, screenH, opts.statsTwoLine ?? []);
  const ship = shipLayout(screenH);
  const offer = offerLayout(screenW, opts.countdown === true);
  return {
    screen: { w: screenW, h: screenH },
    ship,
    weapons,
    abilities,
    offer,
    offerClear: offer.frame.y + offer.frame.h + OFFER.clearGap <= weapons.frame.y,
    centerClear: weapons.frame.x - (ship.frame.x + ship.frame.w),
  };
}

// --- hit testing ---------------------------------------------------------------

/** What a press on a console landed on. A weapon row carries its loadout slot
 *  (`null` for the slotless secondaries) and its kind — O9: a press on the
 *  LMB / RMB rows does nothing but is still swallowed. */
export type ConsoleHit =
  | { kind: 'slot'; row: WeaponRowKind; slot: number | null }
  | { kind: 'ability'; ability: AbilityKind }
  | { kind: 'ship' };

/** The loadout slot each row presses (shared SLOT_GUN 0, the Q / E / R
 *  family slots 2 / 3 / 4 — `FAMILY_SLOT`), null for the secondaries. */
const ROW_SLOT: Readonly<Record<WeaponRowKind, number | null>> = {
  mainBattery: 0,
  secondaries: null,
  torpedo: 2,
  mines: 3,
  special: 4,
};

/** Pure: the slot a weapon row presses. */
export function rowSlot(kind: WeaponRowKind): number | null {
  return ROW_SLOT[kind];
}

/** Pure: is a point inside a rect (edges inclusive on the top-left, exclusive bottom-right)? */
export function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Pure: the console element under a LOGICAL point, or null (the water). The
 *  ship console swallows as `ship` with no action, as the HP globe did. */
export function consoleHit(layout: ConsoleLayout, p: { x: number; y: number }): ConsoleHit | null {
  const row = layout.weapons.rows.find((r) => inRect(p, r));
  if (row !== undefined) return { kind: 'slot', row: row.kind, slot: rowSlot(row.kind) };
  const ab = layout.abilities.find((r) => inRect(p, r));
  if (ab !== undefined) return { kind: 'ability', ability: ab.kind };
  return inRect(p, layout.ship.frame) ? { kind: 'ship' } : null;
}
