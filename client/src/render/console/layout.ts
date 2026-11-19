// THE HUD BAR'S LAYOUT SPINE (Story 12.3 Part B, epic-12 amendment 3; the
// approved bench v2) — ONE pure function from the logical viewport and the
// player's HUD SIDE to every rect the bar, its flyout anchor and the offer group
// draw in, plus the hit tests that route a press or a hover on them.
//
//   ┌ bar (left or right edge) ┐
//   │ WEAPONS   five tiles     │  132 px below the top edge
//   │ ABILITIES C · V · Shift  │
//   │ SHIP      five index rows│
//   │           (water)        │
//   │ HULL · THROTTLE · LEVEL  │  the footer, pinned 18 px above the bottom
//   └──────────────────────────┘      [n LEVELS  TAB + 1–4]
//                                      [card][card][card][card]  ← open water
//
// LOGICAL px: the HUD layer is scaled by the HUD factor (viewport × UI tier),
// so a caller passes `screen / factor`. Every size comes from
// `CLIENT_CONFIG.console`; this module mints none.
//
// A SHORT LOGICAL VIEWPORT (the 125 % tier at 1080p, a small window at the
// 0.75 clamp) cannot hold the whole bar between its 132 px top and 18 px
// bottom: the section gaps close to `sectionGapMin`, the gauges shrink toward
// `gauges.hMin`, and only then does the bar's top rise above 132 (never above
// `edge`). The text never shrinks. [reading: Story 12.3 Part B — short viewports]

import { INDEX_IDS, type IndexId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import type { HudSide } from '../../settings/store.js';

const K = CLIENT_CONFIG.console;
const B = K.bar;
const G = K.gauges;
const O = K.offer;
const LINE = K.lineW;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The five weapon tiles, top to bottom (the ruled order, Story 10.10 R17). */
export const WEAPON_ROW_KINDS = ['mainBattery', 'secondaries', 'torpedo', 'mines', 'special'] as const;
export type WeaponRowKind = (typeof WEAPON_ROW_KINDS)[number];

/** The three ability tiles, top to bottom (AC 31). */
export const ABILITY_KINDS = ['repair', 'smoke', 'shift'] as const;
export type AbilityKind = (typeof ABILITY_KINDS)[number];

/** A weapon tile: line 1 (NAME · tier · key chip) and its body (icons or bar). */
export interface WeaponTileRect extends Rect {
  kind: WeaponRowKind;
  line1: Rect;
  body: Rect;
}

/** An ability tile: line 1 (NAME · READY / seconds · key chip) and the
 *  progress line along its bottom. */
export interface AbilityTileRect extends Rect {
  kind: AbilityKind;
  line1: Rect;
  progress: Rect;
}

/** A ship row: the index name, its value, and the five-pip tier ladder. */
export interface ShipRowRect extends Rect {
  id: IndexId;
  label: Rect;
  value: Rect;
  ladder: Rect;
  bars: Rect[];
}

/** A section's bed and its head line. */
export interface SectionRect {
  bed: Rect;
  head: Rect;
}

/** One footer gauge: the gauge itself, its label line and its value line. */
export interface GaugeRect {
  gauge: Rect;
  label: Rect;
  value: Rect;
}

export interface FooterRect {
  bed: Rect;
  hull: GaugeRect;
  throttle: GaugeRect;
  level: GaugeRect;
}

export interface BarLayout {
  side: HudSide;
  /** The bar's whole column, top to bottom. */
  frame: Rect;
  weapons: SectionRect & { tiles: WeaponTileRect[] };
  abilities: SectionRect & { tiles: AbilityTileRect[] };
  ship: SectionRect & { rows: ShipRowRect[] };
  footer: FooterRect;
  /** The x of the bar's edge facing the open water (the flyout's anchor). */
  openEdge: number;
}

export interface OfferLayout {
  /** The dark gradient band along the bottom of the open water — the group's
   *  frame; every other rect here is in the same (screen-logical) space. */
  band: Rect;
  /** The header line (`n LEVELS` · `TAB + 1–4`), centred over the cards. */
  header: Rect;
  /** The four cards, one row, left to right. */
  cards: Rect[];
  /** REDRAW after the cards at the countdown, else null. */
  redraw: Rect | null;
}

export interface ConsoleLayout {
  screen: { w: number; h: number };
  side: HudSide;
  bar: BarLayout;
  offer: OfferLayout;
  /** The clear water column centred on the screen, between the bar and its
   *  mirror on the far edge — what a centred chrome line may span. */
  centerClear: number;
}

export interface ConsoleLayoutOpts {
  /** The countdown: the offer group carries REDRAW. */
  countdown?: boolean;
  /** The player's HUD SIDE; the left edge when absent. */
  side?: HudSide;
}

// --- heights ---------------------------------------------------------------------

/** A weapon tile's body height per kind: the icon row, or the heat / refill bar. */
export const WEAPON_BODY_H: Readonly<Record<WeaponRowKind, number>> = {
  mainBattery: B.shell.h,
  secondaries: B.trackH,
  torpedo: B.torp.h,
  mines: Math.max(B.rack, B.mine.h),
  special: B.trackH,
};

/** A tile's height around a body of `bodyH`: outline, padding, line 1, gap. */
function tileH(bodyH: number): number {
  return 2 * LINE + 2 * B.rowPadY + B.line1H + B.lineGap + bodyH;
}

/** A section's height around rows of the given heights. */
function sectionH(rowHs: readonly number[]): number {
  return 2 * B.secPad + B.headH + rowHs.reduce((s, h) => s + B.rowGap + h, 0);
}

const WEAPONS_H = sectionH(WEAPON_ROW_KINDS.map((k) => tileH(WEAPON_BODY_H[k])));
const ABILITY_TILE_H = tileH(B.progressH);
const ABILITIES_H = sectionH(ABILITY_KINDS.map(() => ABILITY_TILE_H));
const SHIP_H = sectionH(INDEX_IDS.map(() => B.statRowH));
/** The three sections' summed height (the footer and the gaps aside). */
export const SECTIONS_H = WEAPONS_H + ABILITIES_H + SHIP_H;

/** Pure: the footer's height around gauges `gaugeH` tall. */
export function footerH(gaugeH: number): number {
  return G.padTop + gaugeH + G.gap + G.labelH + G.gap + G.valueH + G.padBottom;
}

/** Pure: the section gap and the gauge height that fit `avail` px — the ruled
 *  sizes where they fit, else the gaps closed, then the gauges shrunk toward
 *  `hMin` (see the header). */
export function barFit(avail: number): { gap: number; gaugeH: number } {
  const need = (gap: number, gh: number): number => SECTIONS_H + 3 * gap + footerH(gh);
  if (need(B.sectionGap, G.h) <= avail) return { gap: B.sectionGap, gaugeH: G.h };
  const gap = B.sectionGapMin;
  const over = need(gap, G.h) - avail;
  return { gap, gaugeH: over > 0 ? Math.max(G.hMin, G.h - over) : G.h };
}

// --- the sections ------------------------------------------------------------------

function section(x: number, y: number, h: number): SectionRect {
  return {
    bed: { x, y, w: B.w, h },
    head: { x: x + B.secPad + B.rowPadX, y: y + B.secPad, w: B.w - 2 * (B.secPad + B.rowPadX), h: B.headH },
  };
}

/** The rows of a section starting under its head: each `rowGap` below the last. */
function rowTops(sec: SectionRect, heights: readonly number[]): number[] {
  let y = sec.head.y + sec.head.h;
  return heights.map((h) => {
    y += B.rowGap;
    const top = y;
    y += h;
    return top;
  });
}

function tileFrame(x: number, y: number, h: number): Rect & { line1: Rect } {
  const w = B.w - 2 * B.secPad;
  const ix = x + LINE + B.rowPadX;
  return { x, y, w, h, line1: { x: ix, y: y + LINE + B.rowPadY, w: w - 2 * (LINE + B.rowPadX), h: B.line1H } };
}

function weaponTiles(sec: SectionRect): WeaponTileRect[] {
  const hs = WEAPON_ROW_KINDS.map((k) => tileH(WEAPON_BODY_H[k]));
  const tops = rowTops(sec, hs);
  return WEAPON_ROW_KINDS.map((kind, i) => {
    const t = tileFrame(sec.bed.x + B.secPad, tops[i], hs[i]);
    const body = { x: t.line1.x, y: t.line1.y + B.line1H + B.lineGap, w: t.line1.w, h: WEAPON_BODY_H[kind] };
    return { kind, ...t, body };
  });
}

function abilityTiles(sec: SectionRect): AbilityTileRect[] {
  const tops = rowTops(sec, ABILITY_KINDS.map(() => ABILITY_TILE_H));
  return ABILITY_KINDS.map((kind, i) => {
    const t = tileFrame(sec.bed.x + B.secPad, tops[i], ABILITY_TILE_H);
    const progress = { x: t.line1.x, y: t.line1.y + B.line1H + B.lineGap, w: t.line1.w, h: B.progressH };
    return { kind, ...t, progress };
  });
}

/** Five pips, right-aligned at `right`, centred on `cy`. */
function pips(right: number, cy: number): { ladder: Rect; bars: Rect[] } {
  const P = B.pip;
  const w = B.pips * P.w + (B.pips - 1) * P.gap;
  const x = right - w;
  const y = cy - P.h / 2;
  return { ladder: { x, y, w, h: P.h }, bars: Array.from({ length: B.pips }, (_, i) => ({ x: x + i * (P.w + P.gap), y, w: P.w, h: P.h })) };
}

function shipRows(sec: SectionRect): ShipRowRect[] {
  const tops = rowTops(sec, INDEX_IDS.map(() => B.statRowH));
  const x = sec.bed.x + B.secPad;
  const w = B.w - 2 * B.secPad;
  return INDEX_IDS.map((id, i) => {
    const y = tops[i];
    const cy = y + B.statRowH / 2;
    const { ladder, bars } = pips(x + w - B.rowPadX, cy);
    const label = { x: x + B.rowPadX, y, w: B.statLabelW, h: B.statRowH };
    const vx = label.x + label.w + B.statGap;
    return { id, x, y, w, h: B.statRowH, label, value: { x: vx, y, w: ladder.x - B.statGap - vx, h: B.statRowH }, ladder, bars };
  });
}

function gauge(colX: number, colW: number, top: number, gaugeW: number, gaugeH: number): GaugeRect {
  const g = { x: colX + (colW - gaugeW) / 2, y: top, w: gaugeW, h: gaugeH };
  const label = { x: colX, y: top + gaugeH + G.gap, w: colW, h: G.labelH };
  return { gauge: g, label, value: { x: colX, y: label.y + G.labelH + G.gap, w: colW, h: G.valueH } };
}

function footer(x: number, y: number, gaugeH: number): FooterRect {
  const ix = x + G.padX;
  const colW = (B.w - 2 * G.padX) / 3;
  const top = y + G.padTop;
  return {
    bed: { x, y, w: B.w, h: footerH(gaugeH) },
    hull: gauge(ix, colW, top, G.hull.w, gaugeH),
    throttle: gauge(ix + colW, colW, top, G.throttle.w, gaugeH),
    level: gauge(ix + 2 * colW, colW, top, G.xpW, gaugeH),
  };
}

/** Pure: the bar's x for a side. */
export function barX(screenW: number, side: HudSide): number {
  return side === 'left' ? B.edge : screenW - B.edge - B.w;
}

/** Pure: the whole bar for a logical viewport and a side. */
export function barLayout(screenW: number, screenH: number, side: HudSide = 'left'): BarLayout {
  const bottom = screenH - B.bottom;
  const { gap, gaugeH } = barFit(bottom - B.top);
  const content = SECTIONS_H + 3 * gap + footerH(gaugeH);
  const top = Math.max(B.edge, Math.min(B.top, bottom - content));
  const x = barX(screenW, side);
  const weapons = section(x, top, WEAPONS_H);
  const abilities = section(x, top + WEAPONS_H + gap, ABILITIES_H);
  const ship = section(x, abilities.bed.y + ABILITIES_H + gap, SHIP_H);
  return {
    side,
    frame: { x, y: top, w: B.w, h: bottom - top },
    weapons: { ...weapons, tiles: weaponTiles(weapons) },
    abilities: { ...abilities, tiles: abilityTiles(abilities) },
    ship: { ...ship, rows: shipRows(ship) },
    footer: footer(x, bottom - footerH(gaugeH), gaugeH),
    openEdge: side === 'left' ? x + B.w : x,
  };
}

// --- the open water and Space-home ---------------------------------------------

/**
 * Pure: SPACE-HOME's offset (AC 28) — how far, in LOGICAL px, the centre of the
 * open water beside the bar sits from the screen centre: half the bar width +
 * its edge, toward the open side (+x with the bar on the left). The camera
 * puts the followed hull there; a caller multiplies by the HUD factor.
 */
export function openWaterOffset(side: HudSide): number {
  return ((side === 'left' ? 1 : -1) * (B.w + B.edge)) / 2;
}

/** Pure: the open water beside the bar — the screen less the bar and its edge. */
export function openWater(screenW: number, screenH: number, side: HudSide): Rect {
  const taken = B.edge + B.w;
  return { x: side === 'left' ? taken : 0, y: 0, w: screenW - taken, h: screenH };
}

// --- the offer group ------------------------------------------------------------

/**
 * Pure: the offer group (AC 35) — ALWAYS along the bottom, centred in the open
 * water beside the bar, over the dark band: the four cards in one row
 * `padBottom` above the bottom edge, the header above them, REDRAW after them
 * at the countdown.
 */
export function offerLayout(screenW: number, screenH: number, side: HudSide = 'left', countdown = false): OfferLayout {
  const water = openWater(screenW, screenH, side);
  const band = { x: water.x, y: screenH - O.bandH, w: water.w, h: O.bandH };
  const rowW = 4 * O.cardW + 3 * O.gap + (countdown ? O.gap + O.redrawW : 0);
  const x0 = band.x + (band.w - rowW) / 2;
  const y = screenH - O.padBottom - O.cardH;
  const cards = Array.from({ length: 4 }, (_, i) => ({ x: x0 + i * (O.cardW + O.gap), y, w: O.cardW, h: O.cardH }));
  const redraw = countdown ? { x: x0 + 4 * (O.cardW + O.gap), y: y + (O.cardH - O.redrawH) / 2, w: O.redrawW, h: O.redrawH } : null;
  const header = { x: band.x, y: y - O.headerGap - O.headerH, w: band.w, h: O.headerH };
  return { band, header, cards, redraw };
}

// --- the whole spine -----------------------------------------------------------

/** Pure: every bar and offer rect for a logical viewport. */
export function consoleLayout(screenW: number, screenH: number, opts: ConsoleLayoutOpts = {}): ConsoleLayout {
  const side = opts.side ?? 'left';
  return {
    screen: { w: screenW, h: screenH },
    side,
    bar: barLayout(screenW, screenH, side),
    offer: offerLayout(screenW, screenH, side, opts.countdown === true),
    centerClear: screenW - 2 * (B.edge + B.w),
  };
}

// --- hit testing ---------------------------------------------------------------

/** What a press on the bar landed on. A weapon tile carries its loadout slot
 *  (`null` for the slotless secondaries) — a press on the LMB / RMB tiles does
 *  nothing but is still swallowed. `ship` is a press anywhere else on a bed
 *  (a section head, a ship row, the footer): swallowed, acting on nothing. */
export type ConsoleHit =
  | { kind: 'slot'; row: WeaponRowKind; slot: number | null }
  | { kind: 'ability'; ability: AbilityKind }
  | { kind: 'ship' };

/** The tile under the pointer that opens the flyout (AC 34): a weapon or an
 *  ability tile. A ship row opens nothing (AC 32). */
export type BarHover = { kind: 'weapon'; row: WeaponRowKind } | { kind: 'ability'; ability: AbilityKind };

/** The loadout slot each tile presses (shared SLOT_GUN 0, the Q / E / R
 *  family slots 2 / 3 / 4 — `FAMILY_SLOT`), null for the secondaries. */
const ROW_SLOT: Readonly<Record<WeaponRowKind, number | null>> = {
  mainBattery: 0,
  secondaries: null,
  torpedo: 2,
  mines: 3,
  special: 4,
};

/** Pure: the slot a weapon tile presses. */
export function rowSlot(kind: WeaponRowKind): number | null {
  return ROW_SLOT[kind];
}

/** Pure: is a point inside a rect (edges inclusive on the top-left, exclusive bottom-right)? */
export function inRect(p: { x: number; y: number }, r: Rect): boolean {
  return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
}

/** Pure: the tile under a LOGICAL point, or null. */
export function barHover(bar: BarLayout, p: { x: number; y: number }): BarHover | null {
  const tile = bar.weapons.tiles.find((r) => inRect(p, r));
  if (tile !== undefined) return { kind: 'weapon', row: tile.kind };
  const ab = bar.abilities.tiles.find((r) => inRect(p, r));
  return ab === undefined ? null : { kind: 'ability', ability: ab.kind };
}

/** Pure: the bar element under a LOGICAL point, or null (the water). */
export function consoleHit(layout: ConsoleLayout, p: { x: number; y: number }): ConsoleHit | null {
  const bar = layout.bar;
  const hover = barHover(bar, p);
  if (hover?.kind === 'weapon') return { kind: 'slot', row: hover.row, slot: rowSlot(hover.row) };
  if (hover?.kind === 'ability') return { kind: 'ability', ability: hover.ability };
  const beds = [bar.weapons.bed, bar.abilities.bed, bar.ship.bed, bar.footer.bed];
  return beds.some((b) => inRect(p, b)) ? { kind: 'ship' } : null;
}
