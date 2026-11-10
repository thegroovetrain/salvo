// THE CONSOLE LAYOUT SPINE (Story 10.10, epic-10 amendments 16 / 17 / 18) —
// ONE pure function from the logical viewport to every rect the two battle
// consoles and the offer group draw in, plus the hit test that routes a press
// on them.
//
//                                              ┌ kill feed (DOM) ┐  top-right
//                                              │ OFFER (RIGHT)   │  bed top 178 = 16 + 150 + 12
//                                              │ n LEVELS        │  four 136 × 64 cards,
//                                              │ [card]…[card]   │  stacked (R22 / R26)
//   SHIP           (center: water, ship, world)     ┌ WEAPONS ─────────────┐
//   console                                         │ MAIN BATTERY │ Q     │
//   (left, compact,                                 │              │ E     │
//    bottom-anchored)                               │ SECONDARIES  │ R     │
//                  [n LEVELS][c1][c2][c3][c4][REDRAW]  C  ·  V  ·  Shift   │
//                   OFFER (BOTTOM)                  └──────────────────────┘
//
// LOGICAL px: the HUD layer is scaled by the HUD factor (viewport × UI tier),
// so a caller passes `screen / factor`. Every size comes from
// `CLIENT_CONFIG.console`; this module mints none.
//
// EVERY SURFACE SITS ON A BED (R24): `frame` is a surface's content box and
// `bed` that box grown by `bedPad` on every side. The BED's outer edge sits on
// the insets (18 px from the side and bottom edges; the offer's at the kill
// feed's clearance), so the visible box is where the inset says.
//
// R21 — the ship console is COMPACT: fixed spacing, its height the sum of its
// parts, bottom-anchored with the water above. R23 — the weapons console is ONE
// uniform two-column box: MAIN BATTERY over SECONDARIES on the left, Q / E / R
// on the right, both columns sharing one top and one bottom, every cell one
// width; the three ability buttons span the full width beneath. The cell
// height H is DERIVED from the right-column cell's content (header, mount line,
// the stat lines one per line), never a number that could clip.
//
// THE OFFER'S PLACEMENT (R26 — the player's OFFER POSITION; plan O15): RIGHT
// stacks on the right edge under the kill feed, LEFT stacks on the left edge
// under the chrome bar, BOTTOM lays the four cards in one row centred along the
// bottom edge. When the chosen stack cannot keep `clearGap` of water to the
// console under it — a short logical viewport — the SAME stack goes BESIDE
// THE WEAPONS BOX ('rightBeside'): `clearGap` left of its bed, top-aligned with
// it (the stack is always shorter than the weapons box). The BOTTOM row is
// only ever the player's pick, never a fallback (Eric 2026-11-10: RIGHT stays
// on the right). `offerPlacement` reports where it went.
//
// THE CELL (R26 / R27): line 1 NAME · tier · key chip, the MOUNT line (rings
// with the seconds INSIDE, four to the line, nothing else on it), then the
// stat lines one per line — every height fixed, so no cell grows at runtime.

import { INDEX_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { OfferPos } from '../../settings/store.js';

const K = CLIENT_CONFIG.console;
const CELL = K.cell;
const SHIP = K.ship;
const OFFER = K.offer;
const AB = K.abilities;
const PAD = K.bedPad;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The five weapon cells — the ruled order (R17); the first two are the left
 *  column, the last three the right (R23). */
export const WEAPON_ROW_KINDS = ['mainBattery', 'secondaries', 'torpedo', 'mines', 'special'] as const;
export type WeaponRowKind = (typeof WEAPON_ROW_KINDS)[number];

/** The left column's cells, top to bottom (R23). */
const LEFT_KINDS: readonly WeaponRowKind[] = ['mainBattery', 'secondaries'];
/** The right column's cells, top to bottom (R23). */
const RIGHT_KINDS: readonly WeaponRowKind[] = ['torpedo', 'mines', 'special'];

/** The three ability buttons, left to right (O5). */
export const ABILITY_KINDS = ['repair', 'smoke', 'shift'] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

/** One weapon cell-button and its lines (R23 / R27). */
export interface WeaponRowRect extends Rect {
  kind: WeaponRowKind;
  /** Line 1: NAME · tier · key chip. */
  header: Rect;
  /** The MOUNT line: the per-mount clocks (or the secondaries' heat bar) —
   *  nothing else on it. */
  mounts: Rect;
  /** One rect per stat line — LABEL left, value right (R23: one per line);
   *  four on a right cell, three on a left cell. */
  statLines: Rect[];
}

export interface WeaponsConsoleLayout {
  frame: Rect;
  bed: Rect;
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
  bed: Rect;
  /** The percent numeral line (`72 %` + `HULL`). */
  hullLine: Rect;
  /** The 10-segment bar and its segments, left to right. */
  hullBar: Rect;
  segments: Rect[];
  indices: IndexRowRect[];
  /** HDG / KTS readout line. */
  helmReadout: Rect;
  /** The horizontal telegraph (astern LEFT, ahead RIGHT). */
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
  /** The dark-glass bed behind the header and the cards (drawn in CSS). */
  bed: Rect;
  /** The header (`2 LEVELS`): a line above the stack, or the row's left slot. */
  header: Rect;
  /** The four cards: stacked top to bottom (R22), or one row left to right
   *  (BOTTOM, R26). */
  cards: Rect[];
  /** The REDRAW button, or null outside the countdown. */
  redraw: Rect | null;
  /** True where the countdown BOTTOM row is in its COMPACT form: REDRAW sits
   *  under the header text in the left slot, not beside the cards. */
  redrawBelowHeader: boolean;
}

export interface ConsoleLayout {
  screen: { w: number; h: number };
  ship: ShipConsoleLayout;
  weapons: WeaponsConsoleLayout;
  abilities: AbilityRect[];
  offer: OfferLayout;
  /** Where the offer group went (see the header): the chosen position, or
   *  beside the weapons box where the chosen stack cannot clear its console. */
  offerPlacement: OfferPlacement;
  /** The clear water between the two consoles' beds (px). */
  centerClear: number;
}

/** The player's OFFER POSITION, or the stack beside the weapons box (the fallback). */
export type OfferPlacement = OfferPos | 'rightBeside';

export interface ConsoleLayoutOpts {
  /** The countdown: the offer group carries REDRAW. */
  countdown?: boolean;
  /** The player's OFFER POSITION (R26); RIGHT when absent. */
  offerPos?: OfferPos;
}

/** Pure: a content box grown by the bed padding on every side. */
export function bedOf(frame: Rect): Rect {
  return { x: frame.x - PAD, y: frame.y - PAD, w: frame.w + 2 * PAD, h: frame.h + 2 * PAD };
}

// --- the weapons console -------------------------------------------------------

/** One cell's width — every cell is this wide (R23: uniform). */
export const CELL_W = CELL.w;

/** The weapons box's content width: two cells and the column gap. */
export const WEAPONS_W = 2 * CELL_W + CELL.colGap;

/** The y offsets inside a cell, from its top edge — fixed lines (R27). */
const HEADER_Y = CELL.padY;
const MOUNTS_Y = HEADER_Y + CELL.headerH;
const STATS_Y = MOUNTS_Y + CELL.mountH;

/** A cell's inner width (inside the side padding). */
export const CELL_INNER_W = CELL_W - 2 * CELL.padX;

/** R27: the most rings the mount line holds — `clock` px rings `clockGap`
 *  apart inside the inner width (four). Nothing ever wraps past it. */
export const MAX_CLOCKS = Math.floor((CELL_INNER_W + CELL.clockGap) / (CELL.clock + CELL.clockGap));

/**
 * H — a right-column cell's height, DERIVED from its fullest content (R27):
 * line 1, the mount line and `statLines` stat lines, inside the padding.
 */
export const CELL_H = STATS_Y + CELL.statLines * CELL.statLineH + CELL.padY;

/** The two columns' shared height: three right cells and their two gaps. */
export const COLUMN_H = RIGHT_KINDS.length * CELL_H + (RIGHT_KINDS.length - 1) * CELL.rowGap;

/** A left cell's height: two of them and one gap make the right column's
 *  height, so both columns end level (R23). */
export const LEFT_CELL_H = (COLUMN_H - (LEFT_KINDS.length - 1) * CELL.rowGap) / LEFT_KINDS.length;

/** The weapons console's content height: the columns, then C · V · Shift. */
export const WEAPONS_H = COLUMN_H + AB.topGap + AB.h;

function weaponCell(kind: WeaponRowKind, x: number, y: number, h: number, lines: number): WeaponRowRect {
  const innerX = x + CELL.padX;
  const innerW = CELL_INNER_W;
  const statLines = Array.from({ length: lines }, (_, k) => ({ x: innerX, y: y + STATS_Y + k * CELL.statLineH, w: innerW, h: CELL.statLineH }));
  return {
    kind,
    x,
    y,
    w: CELL_W,
    h,
    header: { x: innerX, y: y + HEADER_Y, w: innerW, h: CELL.headerH },
    mounts: { x: innerX, y: y + MOUNTS_Y, w: innerW, h: CELL.mountH },
    statLines,
  };
}

function column(kinds: readonly WeaponRowKind[], x: number, top: number, h: number, lines: number): WeaponRowRect[] {
  return kinds.map((kind, i) => weaponCell(kind, x, top + i * (h + CELL.rowGap), h, lines));
}

function weaponsLayout(screenW: number, screenH: number): { weapons: WeaponsConsoleLayout; abilities: AbilityRect[] } {
  const x = screenW - K.sideInset - PAD - WEAPONS_W;
  const top = screenH - K.bottomInset - PAD - WEAPONS_H;
  const left = column(LEFT_KINDS, x, top, LEFT_CELL_H, CELL.leftStatLines);
  const right = column(RIGHT_KINDS, x + CELL_W + CELL.colGap, top, CELL_H, CELL.statLines);
  const byKind = new Map([...left, ...right].map((r) => [r.kind, r]));
  const rows = WEAPON_ROW_KINDS.map((k) => byKind.get(k)!);
  const abTop = top + COLUMN_H + AB.topGap;
  const abW = (WEAPONS_W - (ABILITY_KINDS.length - 1) * AB.gap) / ABILITY_KINDS.length;
  const abilities = ABILITY_KINDS.map((kind, i) => ({ kind, x: x + i * (abW + AB.gap), y: abTop, w: abW, h: AB.h }));
  const frame = { x, y: top, w: WEAPONS_W, h: WEAPONS_H };
  return { weapons: { frame, bed: bedOf(frame), rows }, abilities };
}

// --- the ship console ----------------------------------------------------------

/** One row per index — the shared `INDEX_IDS` (ARMOR … RANGE). */
const INDEX_COUNT = INDEX_IDS.length;

const HULL_BLOCK = SHIP.hullLine + SHIP.hullBarGap + SHIP.hullBarH;
const INDEX_BLOCK = INDEX_COUNT * SHIP.indexRowH + (INDEX_COUNT - 1) * SHIP.indexRowGap;
const HELM_BLOCK = SHIP.helmReadoutH + SHIP.helmGap + SHIP.ladderH + SHIP.helmGap + SHIP.rudderRowH;
const LEVEL_BLOCK = SHIP.levelRowH + SHIP.trackGap + SHIP.trackH;

/** The ship console's content height — the sum of its parts, fixed spacing (R21). */
export const SHIP_CONSOLE_H = HULL_BLOCK + INDEX_BLOCK + HELM_BLOCK + LEVEL_BLOCK + 3 * SHIP.sectionGap;

/** Five ladder bars, right-aligned in a row. */
function tierBars(right: number, cy: number): { ladder: Rect; bars: Rect[] } {
  const B = SHIP.tierBar;
  const w = SHIP.tierBars * B.w + (SHIP.tierBars - 1) * B.gap;
  const x = right - w;
  const y = cy - B.h / 2;
  const bars = Array.from({ length: SHIP.tierBars }, (_, i) => ({ x: x + i * (B.w + B.gap), y, w: B.w, h: B.h }));
  return { ladder: { x, y, w, h: B.h }, bars };
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
  const ladderY = y + SHIP.helmReadoutH + SHIP.helmGap;
  const rudderY = ladderY + SHIP.ladderH + SHIP.helmGap;
  return {
    helmReadout: { x, y, w: K.width, h: SHIP.helmReadoutH },
    ladder: { x: x + (K.width - SHIP.ladderW) / 2, y: ladderY, w: SHIP.ladderW, h: SHIP.ladderH },
    rudder: { x: x + (K.width - SHIP.rudderTrack) / 2, y: rudderY, w: SHIP.rudderTrack, h: SHIP.rudderRowH },
  };
}

function levelBlock(x: number, y: number): Pick<ShipConsoleLayout, 'levelRow' | 'bankChip' | 'track'> {
  const levelRow = { x, y, w: K.width, h: SHIP.levelRowH };
  const bankChip = { x: x + K.width - SHIP.bankChip, y: y + (SHIP.levelRowH - SHIP.bankChip) / 2, w: SHIP.bankChip, h: SHIP.bankChip };
  const track = { x, y: y + SHIP.levelRowH + SHIP.trackGap, w: K.width, h: SHIP.trackH };
  return { levelRow, bankChip, track };
}

/** Pure: the ship console, compact and bottom-anchored on the left edge (R21). */
export function shipLayout(screenH: number): ShipConsoleLayout {
  const x = K.sideInset + PAD;
  const top = screenH - K.bottomInset - PAD - SHIP_CONSOLE_H;
  const hullLine = { x, y: top, w: K.width, h: SHIP.hullLine };
  const hullBar = { x, y: top + SHIP.hullLine + SHIP.hullBarGap, w: K.width, h: SHIP.hullBarH };
  let y = hullBar.y + hullBar.h + SHIP.sectionGap;
  const indices: IndexRowRect[] = [];
  for (let i = 0; i < INDEX_COUNT; i++) {
    indices.push(indexRow(x, y));
    y += SHIP.indexRowH + (i < INDEX_COUNT - 1 ? SHIP.indexRowGap : SHIP.sectionGap);
  }
  const helm = helmBlock(x, y);
  const frame = { x, y: top, w: K.width, h: SHIP_CONSOLE_H };
  return {
    frame,
    bed: bedOf(frame),
    hullLine,
    hullBar,
    segments: hullSegments(hullBar),
    indices,
    ...helm,
    ...levelBlock(x, y + HELM_BLOCK + SHIP.sectionGap),
  };
}

// --- the offer group -----------------------------------------------------------

/** The offer group's BED top edge on the RIGHT: under the kill feed's clearance (O2). */
export const OFFER_TOP = K.killFeed.top + K.killFeed.clearance + K.killFeed.gap;

/** The four cards, stacked from `y` (R22). */
function stackCards(x: number, y: number): Rect[] {
  return Array.from({ length: 4 }, (_, i) => ({ x, y: y + i * (OFFER.cardH + OFFER.gap), w: OFFER.cardW, h: OFFER.cardH }));
}

function finish(frame: Rect, header: Rect, cards: Rect[], redraw: Rect | null, redrawBelowHeader = false): OfferLayout {
  return { frame, bed: bedOf(frame), header, cards, redraw, redrawBelowHeader };
}

/**
 * Pure: the STACK (R22 / R26) with its content box's top-left at (x, top) —
 * the header line, then the four cards in ONE column. At the countdown REDRAW
 * takes its own full-width line under the header (136 px cannot hold the
 * count and the button side by side).
 */
function stackLayout(x: number, top: number, countdown: boolean): OfferLayout {
  const header = { x, y: top, w: OFFER.cardW, h: OFFER.header };
  let cardsTop = top + OFFER.header + OFFER.headerGap;
  let redraw: Rect | null = null;
  if (countdown) {
    redraw = { x, y: cardsTop, w: OFFER.cardW, h: OFFER.redrawH };
    cardsTop += OFFER.redrawH + OFFER.headerGap;
  }
  const cards = stackCards(x, cardsTop);
  return finish({ x, y: top, w: OFFER.cardW, h: cardsTop + 4 * OFFER.cardH + 3 * OFFER.gap - top }, header, cards, redraw);
}

/** Pure: the row's x — centred on the screen; where that would crowd a
 *  console's bed (the weapons console is the wider), centred in the water
 *  between the two beds instead. */
function rowX(screenW: number, w: number): number {
  const shipRight = K.sideInset + 2 * PAD + K.width;
  const weaponsLeft = screenW - K.sideInset - 2 * PAD - WEAPONS_W;
  const centred = (screenW - w) / 2;
  const clears = centred - PAD - OFFER.clearGap >= shipRight && centred + w + PAD + OFFER.clearGap <= weaponsLeft;
  return clears ? centred : (shipRight + weaponsLeft - w) / 2;
}

/**
 * Pure: the ROW (BOTTOM, R26) — the header slot, the four cards left to
 * right, REDRAW at the countdown; centred along the bottom edge (`rowX`), its
 * bed on the bottom inset.
 */
function rowLayout(screenW: number, screenH: number, countdown: boolean): OfferLayout {
  const B = OFFER.bar;
  const rowW = 4 * OFFER.cardW + 3 * OFFER.gap;
  const y = screenH - K.bottomInset - PAD - OFFER.cardH;
  const wideW = B.headW + B.gapIn + rowW + B.gapIn + OFFER.redrawW;
  const water = screenW - K.sideInset - 2 * PAD - WEAPONS_W - (K.sideInset + 2 * PAD + K.width) - 2 * OFFER.clearGap;
  // Compact: the wide row (REDRAW beside the cards) does not fit between the
  // consoles, so REDRAW goes under the header text in a 112-wide left slot.
  const compact = countdown && wideW + 2 * PAD > water;
  const headW = compact ? OFFER.redrawW : B.headW;
  const w = headW + B.gapIn + rowW + (countdown && !compact ? B.gapIn + OFFER.redrawW : 0);
  const x = rowX(screenW, w);
  const header = { x, y, w: headW, h: compact ? OFFER.cardH - OFFER.redrawH : OFFER.cardH };
  const cx = x + headW + B.gapIn;
  const cards = Array.from({ length: 4 }, (_, i) => ({ x: cx + i * (OFFER.cardW + OFFER.gap), y, w: OFFER.cardW, h: OFFER.cardH }));
  let redraw: Rect | null = null;
  if (compact) redraw = { x, y: y + OFFER.cardH - OFFER.redrawH, w: OFFER.redrawW, h: OFFER.redrawH };
  else if (countdown) redraw = { x: cx + rowW + B.gapIn, y: y + (OFFER.cardH - OFFER.redrawH) / 2, w: OFFER.redrawW, h: OFFER.redrawH };
  return finish({ x, y, w, h: OFFER.cardH }, header, cards, redraw, compact);
}

/** Pure: the offer group at a placement (no clearance check — see `offerPlacement`). */
export function offerLayout(screenW: number, screenH: number, countdown: boolean, placement: OfferPlacement = 'right'): OfferLayout {
  if (placement === 'bottom') return rowLayout(screenW, screenH, countdown);
  if (placement === 'left') return stackLayout(K.sideInset + PAD, K.ship.topClearance + PAD, countdown);
  if (placement === 'rightBeside') {
    // The stack's bed `clearGap` left of the weapons bed, top-aligned with it.
    const wb = weaponsLayout(screenW, screenH).weapons.bed;
    return stackLayout(wb.x - OFFER.clearGap - PAD - OFFER.cardW, wb.y + PAD, countdown);
  }
  return stackLayout(screenW - K.sideInset - PAD - OFFER.cardW, OFFER_TOP + PAD, countdown);
}

/** Pure: does `a` keep at least `gap` of water to `b` (or sit apart from it)? */
function keepsClear(a: Rect, b: Rect, gap: number): boolean {
  return a.x + a.w + gap <= b.x || b.x + b.w + gap <= a.x || a.y + a.h + gap <= b.y || b.y + b.h + gap <= a.y;
}

/** Pure: is a bed on screen and `clearGap` clear of both consoles' beds? */
function offerFits(bed: Rect, screenW: number, screenH: number, consoles: readonly Rect[]): boolean {
  const onScreen = bed.x >= 0 && bed.y >= 0 && bed.x + bed.w <= screenW && bed.y + bed.h <= screenH;
  return onScreen && consoles.every((c) => keepsClear(bed, c, OFFER.clearGap));
}

/** Pure: R26 — the chosen stack where its bed clears both consoles' beds by
 *  the ruled gap, else the same stack BESIDE THE WEAPONS BOX (Eric 2026-11-10:
 *  RIGHT stays on the right; LEFT falls there too). BOTTOM is always the row,
 *  and is never a fallback — save the last-resort guard for a screen too
 *  small to hold even the beside stack (no ruled viewport reaches it). */
export function offerPlacement(screenW: number, screenH: number, countdown: boolean, pos: OfferPos = 'right'): OfferPlacement {
  if (pos === 'bottom') return 'bottom';
  const consoles = [shipLayout(screenH).bed, weaponsLayout(screenW, screenH).weapons.bed];
  const fits = (p: OfferPlacement): boolean => offerFits(offerLayout(screenW, screenH, countdown, p).bed, screenW, screenH, consoles);
  if (fits(pos)) return pos;
  return fits('rightBeside') ? 'rightBeside' : 'bottom';
}

// --- the whole spine -----------------------------------------------------------

/** Pure: every console rect for a logical viewport. */
export function consoleLayout(screenW: number, screenH: number, opts: ConsoleLayoutOpts = {}): ConsoleLayout {
  const countdown = opts.countdown === true;
  const { weapons, abilities } = weaponsLayout(screenW, screenH);
  const placement = offerPlacement(screenW, screenH, countdown, opts.offerPos ?? 'right');
  const ship = shipLayout(screenH);
  return {
    screen: { w: screenW, h: screenH },
    ship,
    weapons,
    abilities,
    offer: offerLayout(screenW, screenH, countdown, placement),
    offerPlacement: placement,
    centerClear: weapons.bed.x - (ship.bed.x + ship.bed.w),
  };
}

// --- hit testing ---------------------------------------------------------------

/** What a press on a console landed on. A weapon cell carries its loadout slot
 *  (`null` for the slotless secondaries) and its kind — O9: a press on the
 *  LMB / RMB cells does nothing but is still swallowed. `ship` is a press on a
 *  console's bed between its buttons (or anywhere on the ship console): it is
 *  swallowed and acts on nothing, as the HP globe did. */
export type ConsoleHit =
  | { kind: 'slot'; row: WeaponRowKind; slot: number | null }
  | { kind: 'ability'; ability: AbilityKind }
  | { kind: 'ship' };

/** The loadout slot each cell presses (shared SLOT_GUN 0, the Q / E / R
 *  family slots 2 / 3 / 4 — `FAMILY_SLOT`), null for the secondaries. */
const ROW_SLOT: Readonly<Record<WeaponRowKind, number | null>> = {
  mainBattery: 0,
  secondaries: null,
  torpedo: 2,
  mines: 3,
  special: 4,
};

/** Pure: the slot a weapon cell presses. */
export function rowSlot(kind: WeaponRowKind): number | null {
  return ROW_SLOT[kind];
}

/** Pure: is a point inside a rect (edges inclusive on the top-left, exclusive bottom-right)? */
export function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Pure: the console element under a LOGICAL point, or null (the water). */
export function consoleHit(layout: ConsoleLayout, p: { x: number; y: number }): ConsoleHit | null {
  const row = layout.weapons.rows.find((r) => inRect(p, r));
  if (row !== undefined) return { kind: 'slot', row: row.kind, slot: rowSlot(row.kind) };
  const ab = layout.abilities.find((r) => inRect(p, r));
  if (ab !== undefined) return { kind: 'ability', ability: ab.kind };
  return inRect(p, layout.ship.bed) || inRect(p, layout.weapons.bed) ? { kind: 'ship' } : null;
}
