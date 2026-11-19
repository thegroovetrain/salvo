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
// A SHORT LOGICAL VIEWPORT SCALES THE BAR (Eric 2026-11-19, verbatim: "On
// short screens just scale it accordingly. ... Its fine if the text gets
// small. Scale."). Where the bar's natural content (`BAR_CONTENT_H`: the three
// sections, the ruled gaps, the full gauges) does not fit between its 132 px
// top and 18 px bottom, the WHOLE bar — geometry and text together — is
// scaled down uniformly by `barScale` (≤ 1; the HUD scale clamp stays the
// upper bound). Nothing inside it reflows. The bar's rects are then in BAR
// SPACE (logical px ÷ `BarLayout.scale`): the HUD bar draws them under a
// container scaled by it, the hit tests divide a logical point by it, and
// `barScreenRect` maps one back to the logical screen. At scale 1 the two
// spaces are one (1920 × 1080 and up). The insets themselves stay logical,
// so the top still clears the kill feed.
//
// THE OFFER GROUP SCALES THE SAME WAY in a narrow open water: the four cards
// and the REDRAW slot (always reserved, so nothing moves at the countdown)
// must fit the water beside the bar with a bar-edge margin each side, or the
// whole group shrinks uniformly (`OfferLayout.scale`) — it never overlaps
// the bar.

import { INDEX_IDS, type IndexId } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { monoTextWidth } from '../../util/monoMeasure.js';
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

/** THE TIER MARK's column and the key-chip slot right of it (AC 40): the same
 *  x on every row from MAIN BATTERY to INTEL. */
export interface MarkColumn {
  /** The tier mark: the numeral, then the five dots, right-aligned in it. */
  tierMark: Rect;
  /** The fixed-width key-chip slot (empty on the ship rows). */
  chipSlot: Rect;
}

/** A refill bar with READY / the seconds at its right end (AC 29 / 31). */
export interface RefillRect {
  track: Rect;
  state: Rect;
}

/** A weapon tile: line 1 (NAME · tier mark · key chip) and its body (icons or
 *  bar); the special's body splits into its refill bar and state. */
export interface WeaponTileRect extends Rect, MarkColumn {
  kind: WeaponRowKind;
  line1: Rect;
  body: Rect;
  refill: RefillRect;
}

/** An ability tile: line 1 (NAME · tier mark · key chip) and its refill bar
 *  with READY / the seconds at its right end. */
export interface AbilityTileRect extends Rect, MarkColumn {
  kind: AbilityKind;
  line1: Rect;
  body: Rect;
  refill: RefillRect;
}

/** A ship row: the index name, its value, the tier mark, the empty chip slot. */
export interface ShipRowRect extends Rect, MarkColumn {
  id: IndexId;
  label: Rect;
  value: Rect;
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

/** THE LEVEL gauge: its value line holds two FIXED slots side by side, the
 *  pair centred in the column — `LV n` (sized for `LV 99`, right-aligned to
 *  its slot's right edge) and the bank chip's slot, reserved whether or not a
 *  level is banked (Eric 2026-11-19: nothing moves with state). */
export interface LevelGaugeRect extends GaugeRect {
  lv: Rect;
  bankChip: Rect;
}

export interface FooterRect {
  bed: Rect;
  hull: GaugeRect;
  throttle: GaugeRect;
  level: LevelGaugeRect;
}

export interface BarLayout {
  side: HudSide;
  /** THE FIT FACTOR (≤ 1): bar space × this = logical px. 1 wherever the
   *  bar's natural height fits (see the header). */
  scale: number;
  /** The bar's whole column, top to bottom (bar space, like every rect here
   *  but `openEdge`). */
  frame: Rect;
  weapons: SectionRect & { tiles: WeaponTileRect[] };
  abilities: SectionRect & { tiles: AbilityTileRect[] };
  ship: SectionRect & { rows: ShipRowRect[] };
  footer: FooterRect;
  /** The x of the bar's edge facing the open water (the flyout's anchor),
   *  in LOGICAL px. */
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
  /** REDRAW after the cards at the countdown, else null — its slot is held
   *  whether or not it shows, so the cards never move. */
  redraw: Rect | null;
  /** THE FIT FACTOR (≤ 1) the whole group is drawn at; every rect above is
   *  already in logical px at this scale. */
  scale: number;
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
const ABILITY_TILE_H = tileH(B.trackH);
const ABILITIES_H = sectionH(ABILITY_KINDS.map(() => ABILITY_TILE_H));
const SHIP_H = sectionH(INDEX_IDS.map(() => B.statRowH));
/** The three sections' summed height (the footer and the gaps aside). */
export const SECTIONS_H = WEAPONS_H + ABILITIES_H + SHIP_H;

/** The footer's height around its `gauges.h` gauges. */
export const FOOTER_H = G.padTop + G.h + G.gap + G.labelH + G.gap + G.valueH + G.padBottom;

/** The bar's NATURAL content height: the sections, the ruled gaps (one above
 *  the footer at least) and the full footer. */
export const BAR_CONTENT_H = SECTIONS_H + 3 * B.sectionGap + FOOTER_H;

/** Pure: THE BAR'S FIT FACTOR for a logical viewport `screenH` tall — 1 where
 *  the natural content fits between the top and bottom insets, else the
 *  uniform shrink that makes it fit (see the header). A degenerate height
 *  leaves it at 1. */
export function barScale(screenH: number): number {
  const avail = screenH - B.top - B.bottom;
  if (!Number.isFinite(avail)) return 1;
  return Math.min(1, Math.max(1, avail) / BAR_CONTENT_H);
}

/** Pure: a BAR-SPACE rect on the logical screen (× the bar's fit factor). */
export function barScreenRect(bar: BarLayout, r: Rect): Rect {
  const s = bar.scale;
  return s === 1 ? r : { x: r.x * s, y: r.y * s, w: r.w * s, h: r.h * s };
}

/** Pure: a LOGICAL point in the bar's own space (÷ its fit factor). */
function toBarSpace(bar: BarLayout, p: { x: number; y: number }): { x: number; y: number } {
  const s = bar.scale;
  return s === 1 ? p : { x: p.x / s, y: p.y / s };
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

/**
 * Pure: THE TIER MARK's column on a row whose content ends at `right`,
 * centred on `cy` (AC 40) — the chip slot flush right, the mark `line1Gap`
 * left of it. A function of the row's right edge alone, so every tile and ship
 * row (all sharing one right edge) puts it at the same x.
 */
export function markColumn(right: number, cy: number): MarkColumn {
  const chipSlot = { x: right - B.chipSlotW, y: cy - B.keyChip / 2, w: B.chipSlotW, h: B.keyChip };
  const mx = chipSlot.x - B.line1Gap - B.tierMark.w;
  return { chipSlot, tierMark: { x: mx, y: cy - B.keyChip / 2, w: B.tierMark.w, h: B.keyChip } };
}

/** Pure: a refill bar across `body` with its READY / seconds slot at the right end. */
export function refillRect(body: Rect): RefillRect {
  const stateX = body.x + body.w - B.stateW;
  return { track: { x: body.x, y: body.y, w: stateX - B.stateGap - body.x, h: body.h }, state: { x: stateX, y: body.y, w: B.stateW, h: body.h } };
}

/** The content's right edge inside a row starting at `x` (a tile's outline
 *  and padding, or a ship row's identical inset). */
function contentRight(x: number): number {
  return x + B.w - 2 * B.secPad - LINE - B.rowPadX;
}

function tileFrame(x: number, y: number, h: number): Rect & MarkColumn & { line1: Rect } {
  const w = B.w - 2 * B.secPad;
  const ix = x + LINE + B.rowPadX;
  const line1 = { x: ix, y: y + LINE + B.rowPadY, w: contentRight(x) - ix, h: B.line1H };
  return { x, y, w, h, line1, ...markColumn(contentRight(x), line1.y + line1.h / 2) };
}

function weaponTiles(sec: SectionRect): WeaponTileRect[] {
  const hs = WEAPON_ROW_KINDS.map((k) => tileH(WEAPON_BODY_H[k]));
  const tops = rowTops(sec, hs);
  return WEAPON_ROW_KINDS.map((kind, i) => {
    const t = tileFrame(sec.bed.x + B.secPad, tops[i], hs[i]);
    const body = { x: t.line1.x, y: t.line1.y + B.line1H + B.lineGap, w: t.line1.w, h: WEAPON_BODY_H[kind] };
    return { kind, ...t, body, refill: refillRect(body) };
  });
}

function abilityTiles(sec: SectionRect): AbilityTileRect[] {
  const tops = rowTops(sec, ABILITY_KINDS.map(() => ABILITY_TILE_H));
  return ABILITY_KINDS.map((kind, i) => {
    const t = tileFrame(sec.bed.x + B.secPad, tops[i], ABILITY_TILE_H);
    const body = { x: t.line1.x, y: t.line1.y + B.line1H + B.lineGap, w: t.line1.w, h: B.trackH };
    return { kind, ...t, body, refill: refillRect(body) };
  });
}

function shipRows(sec: SectionRect): ShipRowRect[] {
  const tops = rowTops(sec, INDEX_IDS.map(() => B.statRowH));
  const x = sec.bed.x + B.secPad;
  const w = B.w - 2 * B.secPad;
  return INDEX_IDS.map((id, i) => {
    const y = tops[i];
    const cy = y + B.statRowH / 2;
    const col = markColumn(contentRight(x), cy);
    const label = { x: x + LINE + B.rowPadX, y, w: B.statLabelW, h: B.statRowH };
    const vx = label.x + label.w + B.statGap;
    return { id, x, y, w, h: B.statRowH, label, value: { x: vx, y, w: col.tierMark.x - B.line1Gap - vx, h: B.statRowH }, ...col };
  });
}

function gauge(colX: number, colW: number, top: number, gaugeW: number): GaugeRect {
  const g = { x: colX + (colW - gaugeW) / 2, y: top, w: gaugeW, h: G.h };
  const label = { x: colX, y: top + G.h + G.gap, w: colW, h: G.labelH };
  return { gauge: g, label, value: { x: colX, y: label.y + G.labelH + G.gap, w: colW, h: G.valueH } };
}

/** The widest `LV n` the level slot is sized for. */
const LV_WIDEST = 'LV 99';

/** THE LEVEL gauge with its two fixed value slots (`LevelGaugeRect`). */
function levelGauge(colX: number, colW: number, top: number): LevelGaugeRect {
  const r = gauge(colX, colW, top, G.xpW);
  const lvW = monoTextWidth(LV_WIDEST, K.type.gaugeValue);
  const x0 = r.value.x + (r.value.w - (lvW + G.gap + G.bankChip)) / 2;
  const cy = r.value.y + r.value.h / 2;
  const lv = { x: x0, y: r.value.y, w: lvW, h: r.value.h };
  const bankChip = { x: x0 + lvW + G.gap, y: cy - G.bankChip / 2, w: G.bankChip, h: G.bankChip };
  return { ...r, lv, bankChip };
}

function footer(x: number, y: number): FooterRect {
  const ix = x + G.padX;
  const colW = (B.w - 2 * G.padX) / 3;
  const top = y + G.padTop;
  return {
    bed: { x, y, w: B.w, h: FOOTER_H },
    hull: gauge(ix, colW, top, G.hull.w),
    throttle: gauge(ix + colW, colW, top, G.throttle.w),
    level: levelGauge(ix + 2 * colW, colW, top),
  };
}

/** Pure: the whole bar for a logical viewport and a side — in BAR SPACE at
 *  its fit factor (see the header). */
export function barLayout(screenW: number, screenH: number, side: HudSide = 'left'): BarLayout {
  const s = barScale(screenH);
  const top = B.top / s;
  const bottom = (screenH - B.bottom) / s;
  const x = side === 'left' ? B.edge / s : (screenW - B.edge) / s - B.w;
  const weapons = section(x, top, WEAPONS_H);
  const abilities = section(x, top + WEAPONS_H + B.sectionGap, ABILITIES_H);
  const ship = section(x, abilities.bed.y + ABILITIES_H + B.sectionGap, SHIP_H);
  return {
    side,
    scale: s,
    frame: { x, y: top, w: B.w, h: bottom - top },
    weapons: { ...weapons, tiles: weaponTiles(weapons) },
    abilities: { ...abilities, tiles: abilityTiles(abilities) },
    ship: { ...ship, rows: shipRows(ship) },
    footer: footer(x, bottom - FOOTER_H),
    openEdge: side === 'left' ? barTaken(s) : screenW - barTaken(s),
  };
}

// --- the open water and Space-home ---------------------------------------------

/** Pure: the logical px the bar and its edge take from the screen at fit
 *  factor `scale`. */
function barTaken(scale: number): number {
  return B.edge + B.w * scale;
}

/**
 * Pure: SPACE-HOME's offset (AC 28) — how far, in LOGICAL px, the centre of the
 * open water beside the bar sits from the screen centre: half the (SCALED)
 * bar width + its edge, toward the open side (+x with the bar on the left).
 * The camera puts the followed hull there; a caller multiplies by the HUD
 * factor.
 */
export function openWaterOffset(side: HudSide, scale = 1): number {
  return ((side === 'left' ? 1 : -1) * barTaken(scale)) / 2;
}

/** Pure: the open water beside the bar — the screen less the (scaled) bar and
 *  its edge. */
export function openWater(screenW: number, screenH: number, side: HudSide, scale = 1): Rect {
  const taken = barTaken(scale);
  return { x: side === 'left' ? taken : 0, y: 0, w: screenW - taken, h: screenH };
}

// --- the offer group ------------------------------------------------------------

/** The four cards' row width (natural px). */
const CARDS_W = 4 * O.cardW + 3 * O.gap;
/** How far the row reaches right of the cards' centre with the REDRAW slot
 *  hanging off its end (natural px) — the half-width the fit must hold. */
const OFFER_REACH = CARDS_W / 2 + O.gap + O.redrawW;

/** Pure: THE OFFER GROUP'S FIT FACTOR in an open water `waterW` wide — 1 where
 *  the cards (centred) and the REDRAW slot fit with a bar-edge margin each
 *  side, else the uniform shrink that makes them fit (see the header). */
export function offerScale(waterW: number): number {
  const room = waterW / 2 - B.edge;
  if (!Number.isFinite(room)) return 1;
  return Math.min(1, Math.max(1, room) / OFFER_REACH);
}

/**
 * Pure: the offer group (AC 35) — ALWAYS along the bottom, the four cards
 * centred on THEIR OWN width in the open water beside the (scaled) bar, over
 * the dark band: one row `padBottom` above the bottom edge, the header above
 * them, REDRAW in a fixed slot hanging off the row's end at the countdown.
 * The cards never move between the countdown and the match (Eric
 * 2026-11-19). Every rect is logical px at the group's fit factor.
 */
export function offerLayout(screenW: number, screenH: number, side: HudSide = 'left', countdown = false, barFit = 1): OfferLayout {
  const water = openWater(screenW, screenH, side, barFit);
  const o = offerScale(water.w);
  const band = { x: water.x, y: screenH - O.bandH * o, w: water.w, h: O.bandH * o };
  const x0 = water.x + (water.w - CARDS_W * o) / 2;
  const y = screenH - (O.padBottom + O.cardH) * o;
  const cards = Array.from({ length: 4 }, (_, i) => ({ x: x0 + i * (O.cardW + O.gap) * o, y, w: O.cardW * o, h: O.cardH * o }));
  const redraw = countdown ? { x: x0 + (CARDS_W + O.gap) * o, y: y + ((O.cardH - O.redrawH) / 2) * o, w: O.redrawW * o, h: O.redrawH * o } : null;
  const header = { x: band.x, y: y - (O.headerGap + O.headerH) * o, w: band.w, h: O.headerH * o };
  return { band, header, cards, redraw, scale: o };
}

// --- the whole spine -----------------------------------------------------------

/** Pure: every bar and offer rect for a logical viewport. */
export function consoleLayout(screenW: number, screenH: number, opts: ConsoleLayoutOpts = {}): ConsoleLayout {
  const side = opts.side ?? 'left';
  const bar = barLayout(screenW, screenH, side);
  return {
    screen: { w: screenW, h: screenH },
    side,
    bar,
    offer: offerLayout(screenW, screenH, side, opts.countdown === true, bar.scale),
    centerClear: screenW - 2 * barTaken(bar.scale),
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
export function barHover(bar: BarLayout, at: { x: number; y: number }): BarHover | null {
  const p = toBarSpace(bar, at);
  const tile = bar.weapons.tiles.find((r) => inRect(p, r));
  if (tile !== undefined) return { kind: 'weapon', row: tile.kind };
  const ab = bar.abilities.tiles.find((r) => inRect(p, r));
  return ab === undefined ? null : { kind: 'ability', ability: ab.kind };
}

/** What the per-frame hover reads beside the point: is the bar on screen, is
 *  the pointer inside the window, and is it over the game canvas (not a DOM
 *  overlay above the bar)? */
export interface HoverGate {
  shown: boolean;
  inside: boolean;
  onCanvas: boolean;
}

/** Pure: THE FRAME'S HOVER (AC 34) — the tile under the pointer, or null:
 *  nothing while the bar is hidden, once the pointer leaves the window, or
 *  while it is over DOM chrome above the bar (the settings overlay) — so the
 *  flyout and the hover wash can never hang open. */
export function barHoverAt(bar: BarLayout, p: { x: number; y: number }, gate: HoverGate): BarHover | null {
  return gate.shown && gate.inside && gate.onCanvas ? barHover(bar, p) : null;
}

/** Pure: the bar element under a LOGICAL point, or null (the water). */
export function consoleHit(layout: ConsoleLayout, p: { x: number; y: number }): ConsoleHit | null {
  const bar = layout.bar;
  const hover = barHover(bar, p);
  if (hover?.kind === 'weapon') return { kind: 'slot', row: hover.row, slot: rowSlot(hover.row) };
  if (hover?.kind === 'ability') return { kind: 'ability', ability: hover.ability };
  const beds = [bar.weapons.bed, bar.abilities.bed, bar.ship.bed, bar.footer.bed];
  const q = toBarSpace(bar, p);
  return beds.some((b) => inRect(q, b)) ? { kind: 'ship' } : null;
}
