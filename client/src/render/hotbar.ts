// THE hotbar (Story 2.2) — four square slots stacked bottom-left, top-to-bottom
// Gun (keyless) – Q – E – R (amendment 10), rendered in Pixi over the water.
// Story 2.3 grew the geometry (slot / key chip / label column / tooltip) to fit
// the ratified ~1.6x type lift, de-greyed the row text to phosphor data + white
// names, and gated the ACTIVATED pop + glow amplitude on the motion setting.
//
// Shape: a PURE CORE (state mapping, layout, hit-test, quick-info strings,
// tooltip model + placement, hover dwell, click routing) with a thin Pixi shell
// under it. Everything the grammar depends on is a pure function so the whole
// contract is unit-testable without instantiating Pixi.
//
// The state grammar is DESIGN.md · Components · Hotbar Slot, verbatim:
//   idle        1px silver .28 outline, transparent interior (water shows through)
//   ready wpn   phosphor .4 outline + 10px glow
//   ready abil  phosphor .65 outline + 14px glow + 9px top-right CHAMFER
//               (the chamfer is a SHAPE mark for "activates immediately" —
//                weapons never carry it)
//   selected    amber outline + 16px glow + inset amber wash + FILLED amber key
//               chip + amber name — the wash and the filled chip are the
//               selected channel; hue is secondary (dual-coding)
//   cooling     dimmed icon, card-scrim interior, 2px conic perimeter track
//               (phosphor elapsed / phosphor .14 remaining), live seconds in
//               the quick-info line
//   activated   one ≤80ms phosphor pop (wash + full outline + 22px bloom)
//               decaying into cooling — reuses the DeniedPulse 80/300ms register
//   empty       1px DASHED slate .45, `+` glyph, "— awaiting refit —"
//   denied      1px→2px denied-red edge pulse + red icon flash — never silence
//
// Selection is the CLIENT's primed slot (gun whenever nothing is primed) — the
// server keeps no priming state. Reload/cooling renders on EVERY slot
// regardless of which one is selected (every system's reload ticks anyway).
//
// Colors are tokens only (CLIENT_CONFIG.colors); geometry knobs live in
// CLIENT_CONFIG.hotbar. Nothing here drives net or sim: clicks are routed back
// out through the SAME keyboard slot-action path the keys use.

import { Container, Graphics, Text } from 'pixi.js';
import {
  SLOT_COUNT,
  type EffectiveStats,
  type EquipmentId,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionAllowed, motionIntensity, settings, type MotionLevel } from '../settings/store.js';
import type { ScreenPoint } from '../input/mouse.js';
import { tracePerimeter, traceDashed } from '../util/poly.js';
import { drawEquipmentIcon, drawPlusGlyph } from './equipmentIcons.js';
import { KEY_CHIP_STYLE, drawKeyChipBox, keyChipGlyphColor } from './keyChip.js';
import {
  SLOT_KEY_GLYPHS,
  equipmentInfo,
  interactionLine,
  type EquipmentInfo,
} from './equipmentInfo.js';

const C = CLIENT_CONFIG.colors;
const H = CLIENT_CONFIG.hotbar;
const MONO = CLIENT_CONFIG.type.mono;
const DISPLAY = CLIENT_CONFIG.type.display;

/** The empty (offer) slot's label — DESIGN.md Components · Hotbar Slot. */
export const EMPTY_SLOT_LABEL = '— awaiting refit —';

// --- pure core: per-slot state -------------------------------------------------

/** The seven ratified slot states (DESIGN.md · Components · Hotbar Slot). */
export type SlotState =
  | 'empty'
  | 'denied'
  | 'activated'
  | 'cooling'
  | 'selected'
  | 'readyWeapon'
  | 'readyAbility';

/** Per-slot one-frame feedback latches (from the existing denied/ability machinery). */
export interface SlotFlags {
  /** A denied pulse is showing for this slot THIS frame. */
  denied: boolean;
  /** An activated pop is showing for this slot THIS frame. */
  activated: boolean;
}

/**
 * Pure: one slot's state. Precedence (highest first) is
 * denied > activated > cooling > selected > ready — an empty slot short-
 * circuits everything (it holds nothing to deny, cool, or select; R is inert
 * while unfitted, so no flag can ever reach it).
 *
 * COOLING IS AVAILABILITY, NOT TIMER STATE: a pool with a round still in it
 * (`n > 0`) reads READY even while the reload timer runs for the NEXT round —
 * an upgraded 2-fish tube with one fish left is fireable, and dimming it would
 * lie. Only an empty pool (`n <= 0`) with a running timer cools.
 */
export function slotState(
  id: EquipmentId | null,
  flags: SlotFlags,
  cooling: boolean,
  selected: boolean,
  isWeapon: boolean,
): SlotState {
  if (id === null) return 'empty';
  if (flags.denied) return 'denied';
  if (flags.activated) return 'activated';
  if (cooling) return 'cooling';
  if (selected) return 'selected';
  return isWeapon ? 'readyWeapon' : 'readyAbility';
}

/** Pure: is this slot COOLING — no round available and a reload running? */
export function isCooling(ammo: WeaponAmmo | null): boolean {
  return ammo !== null && ammo.n <= 0 && ammo.reloadMsLeft > 0;
}

/** Pure: trimmed seconds for a duration in ms — "3s", "4.5s", "12s". */
export function fmtSeconds(ms: number): string {
  const tenths = Math.round(Math.max(0, ms) / 100) / 10;
  return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)}s`;
}

/** Pure: the LIVE remaining seconds while cooling — rounded UP to a tenth and
 *  FLOORED at one tenth, so a still-cooling slot never reads "0s" (the last
 *  frame before the round lands shows "0.1s", then the state leaves cooling). */
export function fmtRemaining(ms: number): string {
  const tenths = Math.max(1, Math.ceil(Math.max(0, ms) / 100)) / 10;
  return `${Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1)}s`;
}

/**
 * Pure: the quick-info line under a slot's name (amendment 13, literal): a
 * WEAPON reads `DMG n · CD ns`, an ABILITY reads `CD ns` — the split is
 * EQUIPMENT_IS_WEAPON, nothing else (so the mine, an ability that happens to
 * deal damage, shows CD only; its damage lives in the tooltip description).
 * While the slot is cooling the CD figure is the live remaining time, counting
 * down whether or not the slot is selected.
 */
export function quickInfoLine(info: EquipmentInfo, reloadMsLeft: number): string {
  const cd = reloadMsLeft > 0 ? fmtRemaining(reloadMsLeft) : fmtSeconds(info.reloadMs);
  return info.isWeapon && info.damage !== null ? `DMG ${info.damage} · CD ${cd}` : `CD ${cd}`;
}

/** Everything one rendered slot row needs — the pure view model. */
export interface SlotViewModel {
  slot: number;
  id: EquipmentId | null;
  state: SlotState;
  /** The selection channel (filled amber key chip + amber name), tracked
   *  independently of `state` so a SELECTED slot that is also cooling keeps
   *  reading as selected (dual-coding — DESIGN.md). */
  selected: boolean;
  /** Ability shape mark: the 9px top-right chamfer. Weapons never chamfer. */
  chamfer: boolean;
  keyGlyph: string;
  name: string;
  quickInfo: string;
  /** Ammo count text, or null — badges show ONLY on pools larger than one. */
  badge: string | null;
  /** Conic cooldown-track progress in [0,1); 0 when not cooling. */
  coolFrac: number;
}

/** The own-ship inputs the hotbar reads (one-way: state → view, never back). */
export interface HotbarView {
  /** Slot-aligned own loadout ids (null = unfitted). */
  loadout: readonly (EquipmentId | null)[];
  /** Slot-aligned server-authoritative pools + reload timers. */
  ammo: readonly (WeaponAmmo | null)[];
  /** Own effective stats — every denominator (reload, pool size). */
  stats: EffectiveStats;
  /** Client-primed slot (gun when nothing is primed). */
  primedSlot: number;
  /** Per-slot denied pulse state this frame. */
  denied: readonly boolean[];
  /** Per-slot activated pop state this frame. */
  activated: readonly boolean[];
  /** The refit modal is open: dim to 38%, slot keys AND clicks suspended. */
  dim: boolean;
  /** Accessibility motion level (Story 2.3) — gates the ACTIVATED pop and the
   *  glow amplitude. Defaults to 'full' so existing callers/tests are unchanged. */
  motion?: MotionLevel;
}

/** Pure: the four row view models, in slot order (Gun – Q – E – R). */
export function slotViewModels(view: HotbarView): SlotViewModel[] {
  return Array.from({ length: SLOT_COUNT }, (_, slot) => slotViewModel(view, slot));
}

/** Pure: the badge text for a slot — null unless the effective pool holds >1
 *  AND a real ammo entry exists (a missing entry shows NO badge, never "0"). */
export function badgeText(info: EquipmentInfo, ammo: WeaponAmmo | null): string | null {
  if (info.maxAmmo <= 1 || ammo === null) return null;
  return String(ammo.n);
}

/** Pure: the conic track's elapsed fraction in [0,1] (0 = not cooling). */
export function coolFraction(reloadMsLeft: number, reloadMs: number): number {
  if (reloadMsLeft <= 0 || reloadMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - reloadMsLeft / reloadMs));
}

/** The unfitted (offer) slot's row: dashed box, `+` glyph, awaiting-refit label. */
function emptySlotModel(slot: number, keyGlyph: string): SlotViewModel {
  return { slot, id: null, state: 'empty', selected: false, chamfer: false, keyGlyph, name: EMPTY_SLOT_LABEL, quickInfo: '', badge: null, coolFrac: 0 };
}

/**
 * Pure: this frame's feedback latches for a slot. The ACTIVATED pop is pure
 * juice — the cooling track that follows it carries the same information
 * statically — so the accessibility motion level suppresses it at `off`. The
 * DENIED latch is never gated: it is the denial's only visual channel.
 */
export function slotFlags(view: HotbarView, slot: number): SlotFlags {
  return {
    denied: view.denied[slot] ?? false,
    activated: (view.activated[slot] ?? false) && motionAllowed(view.motion ?? 'full'),
  };
}

function slotViewModel(view: HotbarView, slot: number): SlotViewModel {
  const id = view.loadout[slot] ?? null;
  const keyGlyph = SLOT_KEY_GLYPHS[slot] ?? '';
  if (id === null) return emptySlotModel(slot, keyGlyph);
  const info = equipmentInfo(view.stats, id);
  const a = view.ammo[slot] ?? null;
  const cooling = isCooling(a);
  // The countdown + conic track belong to the COOLING read: a slot that still
  // has a round shows its full CD, not the timer for the next one.
  const left = cooling ? (a?.reloadMsLeft ?? 0) : 0;
  const flags = slotFlags(view, slot);
  const selected = slot === view.primedSlot;
  return {
    slot,
    id,
    state: slotState(id, flags, cooling, selected, info.isWeapon),
    selected,
    chamfer: !info.isWeapon,
    keyGlyph,
    name: info.name,
    quickInfo: quickInfoLine(info, left),
    badge: badgeText(info, a),
    coolFrac: coolFraction(left, info.reloadMs),
  };
}

// --- pure core: the state skin -------------------------------------------------

/** Token + alpha recipe for one slot state (no literals — DESIGN.md registers). */
export interface SlotSkin {
  border: number;
  borderAlpha: number;
  borderWidth: number;
  /** Outer bloom radius (px) and its peak alpha; 0 = no glow. */
  glowPx: number;
  glowAlpha: number;
  /** Inset wash token + alpha (0 = none). */
  wash: number;
  washAlpha: number;
  icon: number;
  iconAlpha: number;
  /** Dashed outline (the empty offer slot). */
  dashed: boolean;
  /** Card-scrim interior (cooling). */
  scrim: boolean;
}

const SKINS: Record<SlotState, SlotSkin> = {
  empty: { border: C.textMuted, borderAlpha: 0.45, borderWidth: 1, glowPx: 0, glowAlpha: 0, wash: C.void, washAlpha: 0, icon: C.textMuted, iconAlpha: 0.5, dashed: true, scrim: false },
  readyWeapon: { border: C.phosphor, borderAlpha: 0.4, borderWidth: 1, glowPx: 10, glowAlpha: 0.15, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.75, dashed: false, scrim: false },
  readyAbility: { border: C.phosphor, borderAlpha: 0.65, borderWidth: 1, glowPx: 14, glowAlpha: 0.18, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.85, dashed: false, scrim: false },
  selected: { border: C.amber, borderAlpha: 1, borderWidth: 1.5, glowPx: 16, glowAlpha: 0.22, wash: C.amber, washAlpha: 0.12, icon: C.amber, iconAlpha: 0.95, dashed: false, scrim: false },
  // Cooling DIMS the phosphor icon (amendment 16 — dim the same color, never
  // swap in grey); the silver box edge is decorative linework and stays.
  cooling: { border: C.silver, borderAlpha: 0.28, borderWidth: 1, glowPx: 0, glowAlpha: 0, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.55, dashed: false, scrim: true },
  activated: { border: C.phosphor, borderAlpha: 1, borderWidth: 1.5, glowPx: 22, glowAlpha: 0.3, wash: C.phosphor, washAlpha: 0.2, icon: C.phosphorBright, iconAlpha: 1, dashed: false, scrim: false },
  denied: { border: C.denied, borderAlpha: 1, borderWidth: 2, glowPx: 8, glowAlpha: 0.25, wash: C.void, washAlpha: 0, icon: C.denied, iconAlpha: 1, dashed: false, scrim: false },
};

/**
 * Pure: the alpha a row's TEXT renders at. Amendment 16's dim-not-grey rule: a
 * cooling or empty slot dims the phosphor/white it already uses instead of
 * swapping in a grey, so the state grammar reads without any grey text.
 */
export function dimAlphaFor(m: Pick<SlotViewModel, 'state' | 'id'>): number {
  return m.state === 'cooling' || m.id === null ? DIM_TEXT_ALPHA : 1;
}

/**
 * Pure: the skin for a slot state, with the accessibility motion level applied
 * to the GLOW amplitude only (Story 2.3). The border/icon/wash colors — the
 * channels that carry the STATE information, denied red included — are never
 * touched: `off` removes the bloom, never the meaning.
 */
export function slotSkin(state: SlotState, motionIntensity = 1): SlotSkin {
  const skin = SKINS[state];
  if (motionIntensity >= 1) return skin;
  return { ...skin, glowPx: skin.glowPx * motionIntensity, glowAlpha: skin.glowAlpha * motionIntensity };
}

// --- pure core: layout + hit-test ----------------------------------------------

/** One slot's square in screen space. */
export interface SlotRect {
  x: number;
  y: number;
  size: number;
}

/** One laid-out hotbar row (screen space). */
export interface HotbarRow {
  slot: number;
  /** Key-chip square (top-left); 16×16, vertically centered on the slot. */
  keyX: number;
  keyY: number;
  box: SlotRect;
  /** Label column left edge + the two text baselines' top edges. */
  labelX: number;
  nameY: number;
  infoY: number;
  /**
   * THE control's footprint: key chip → slot → label column, including the
   * ammo badge's top-right overhang. The whole ROW is the control (amendment
   * 11) — a press anywhere in here is that slot's action and is swallowed, so
   * clicking a key chip or a name can never fire the gun at the water beneath.
   * The 14px stack gaps deliberately stay water (only real rows swallow).
   */
  row: HudRect;
}

/** A screen-space rect (px). */
export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HotbarLayout {
  rows: HotbarRow[];
  /** Left edge of the reserved (empty) gutter — Story 2.6's XP rail lands here. */
  gutterX: number;
  stackTop: number;
  stackHeight: number;
}

/**
 * Pure: the whole stack laid out from the viewport height (bottom-left anchor;
 * width is irrelevant — nothing is right-aligned). Called per frame from the
 * screen size, the same idiom as Hud.update — no resize listener.
 */
export function hotbarLayout(screenH: number): HotbarLayout {
  const stackHeight = SLOT_COUNT * H.slot + (SLOT_COUNT - 1) * H.gap;
  const stackTop = screenH - H.bottom - stackHeight;
  const boxX = H.left + H.keyChip + H.keyGap;
  const rows = Array.from({ length: SLOT_COUNT }, (_, slot) => {
    const top = stackTop + slot * (H.slot + H.gap);
    const labelX = boxX + H.slot + H.labelGap;
    return {
      slot,
      keyX: H.left,
      keyY: top + (H.slot - H.keyChip) / 2,
      box: { x: boxX, y: top, size: H.slot },
      labelX,
      nameY: top + H.nameTop,
      infoY: top + H.infoTop,
      row: {
        x: H.left,
        y: top - H.badgeOverhang, // the badge overhangs the slot's top-right
        w: labelX + H.labelWidth - H.left,
        h: H.slot + H.badgeOverhang,
      },
    };
  });
  return { rows, gutterX: H.left - H.gutter, stackTop, stackHeight };
}

/**
 * Pure: the slot whose ROW FOOTPRINT contains a screen point, or null. THE
 * hit-test behind both the hover tooltip and the click gate (amendment 11):
 * the whole row is the control — key chip, slot square (badge overhang
 * included), and label column all hit. The reserved left gutter (2.6's XP
 * rail), the 14px gaps between rows, and everything outside stay WATER, so a
 * press there falls through and fires exactly as before.
 *
 * A null layout (the hotbar is hidden — death, spectate, the forceSnap pose
 * gap) hits nothing: a hidden hotbar routes no clicks.
 */
export function slotAtPoint(p: ScreenPoint, layout: HotbarLayout | null): number | null {
  if (layout === null) return null;
  for (const { slot, row } of layout.rows) {
    if (p.x >= row.x && p.x <= row.x + row.w && p.y >= row.y && p.y <= row.y + row.h) return slot;
  }
  return null;
}

// --- pure core: hover + tooltip -------------------------------------------------

/** Hover dwell state (which slot, since when). */
export interface HoverState {
  slot: number | null;
  since: number;
}

export const NO_HOVER: HoverState = { slot: null, since: 0 };

/** Pure: advance the hover dwell — the clock restarts whenever the slot changes. */
export function nextHover(prev: HoverState, slot: number | null, nowMs: number): HoverState {
  if (slot === prev.slot) return prev;
  return { slot, since: nowMs };
}

/** Pure: has the hover dwelled long enough to show the tooltip? */
export function hoverReady(state: HoverState, nowMs: number, delayMs = H.tooltip.delayMs): boolean {
  return state.slot !== null && nowMs - state.since >= delayMs;
}

/**
 * Pure: should the tooltip panel be on screen this frame? Never while the
 * refit modal holds the lockout (`dim`) — a ghost tooltip floating under the
 * modal contradicts the full-lockout ruling — never without a model (an
 * unfitted slot describes nothing), and never before the dwell elapses.
 */
export function shouldShowTooltip(hover: HoverState, nowMs: number, dim: boolean, hasModel: boolean): boolean {
  return !dim && hasModel && hoverReady(hover, nowMs);
}

/**
 * The tooltip's content. `boons` exists as STRUCTURE only: boons don't exist
 * yet, so the list is always empty and the panel renders no divider, no rows,
 * no placeholder — absence, not a stub (Story 2.5+ fills it).
 */
export interface TooltipModel {
  name: string;
  interaction: string;
  description: string;
  boons: readonly string[];
}

/** Pure: the tooltip for a slot, or null when there is nothing to describe
 *  (an unfitted slot has no equipment — it shows its own inline label instead). */
export function tooltipModel(slot: number, id: EquipmentId | null, stats: EffectiveStats): TooltipModel | null {
  if (id === null) return null;
  const info = equipmentInfo(stats, id);
  return {
    name: info.name.toUpperCase(),
    interaction: interactionLine(slot, id),
    description: info.description,
    boons: [],
  };
}

/** Where the tooltip panel sits, and which side its pointer notch is on. */
export interface TooltipPlacement {
  x: number;
  y: number;
  /** Notch on the panel's LEFT edge (panel flanks right) or right edge. */
  notchLeft: boolean;
  /** Notch tip's screen y. */
  notchY: number;
}

/**
 * Pure: flank the hovered slot to the RIGHT, falling back to the LEFT when the
 * panel would leave the viewport, vertically centered on the slot and clamped
 * so the panel never leaves the screen on any edge.
 */
export function tooltipPlacement(row: HotbarRow, panelH: number, screenW: number, screenH: number): TooltipPlacement {
  const t = H.tooltip;
  const right = row.box.x + row.box.size + t.gap;
  const notchLeft = right + t.width <= screenW - t.margin;
  const x = notchLeft ? right : Math.max(t.margin, row.box.x - t.gap - t.width);
  const centerY = row.box.y + row.box.size / 2;
  const maxY = Math.max(t.margin, screenH - t.margin - panelH);
  const y = Math.min(maxY, Math.max(t.margin, centerY - panelH / 2));
  const notchY = Math.min(y + panelH - t.notch - 2, Math.max(y + t.notch + 2, centerY));
  return { x, y, notchLeft, notchY };
}

// --- Pixi shell -----------------------------------------------------------------

// Story 2.3 (amendments 15/16): every size carries the ratified ~1.6x lift
// (9->14, 10->16, 11->17, 12->18, 13->20) and the hotbar de-grey — key chips,
// quick-info and the reload countdown render CIC PHOSPHOR, slot names render
// bright white. Grey text is gone from this surface entirely; the cooling/empty
// states DIM these same colors (DIM_ALPHA) instead of switching to grey, so the
// state grammar survives the de-grey.
// The key chip's box + glyph style now live in the SHARED drawer
// (render/keyChip.ts) — one family with the helm keys (UX-DR33).
const KEY_STYLE = KEY_CHIP_STYLE;
const NAME_STYLE = { fontFamily: DISPLAY, fontSize: 20, fontWeight: '600', fill: C.textPrimary, letterSpacing: 0.3 } as const;
const INFO_STYLE = { fontFamily: MONO, fontSize: 16, fill: C.phosphor, letterSpacing: 0.8 } as const;
const BADGE_STYLE = { fontFamily: MONO, fontSize: 16, fill: C.phosphor, letterSpacing: 0 } as const;
const TIP_NAME_STYLE = { fontFamily: MONO, fontSize: 17, fill: C.textPrimary, letterSpacing: 1.1 } as const;
const TIP_INTERACTION_STYLE = { fontFamily: MONO, fontSize: 14, fill: C.amber, letterSpacing: 1.6 } as const;
const TIP_DESC_STYLE = {
  fontFamily: DISPLAY,
  fontSize: 18,
  fill: C.textPrimary,
  wordWrap: true,
  wordWrapWidth: H.tooltip.width - H.tooltip.pad * 2,
  lineHeight: 26,
} as const;

/** Alpha the phosphor/white row text dims to in the cooling + empty states
 *  (amendment 16: "dim these same colors, never grey"). */
export const DIM_TEXT_ALPHA = 0.7;

/** The outline path of a slot square, with an optional top-right chamfer cut. */
function slotOutline(b: SlotRect, cut: number): ScreenPoint[] {
  const { x, y, size } = b;
  if (cut <= 0) return [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
  return [
    { x, y },
    { x: x + size - cut, y },
    { x: x + size, y: y + cut },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ];
}

/** Inflate an outline outward from the square's center (the glow rings). */
function inflate(pts: ScreenPoint[], b: SlotRect, px: number): ScreenPoint[] {
  const cx = b.x + b.size / 2;
  const cy = b.y + b.size / 2;
  const k = (b.size / 2 + px) / (b.size / 2);
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/** One row's Pixi text objects (created once, diffed on assignment). */
interface RowText {
  key: Text;
  name: Text;
  info: Text;
  badge: Text;
}

export class Hotbar {
  private readonly root = new Container();
  private readonly gfx = new Graphics();
  private readonly rowText: RowText[];
  private readonly tipRoot = new Container();
  private readonly tipGfx = new Graphics();
  private readonly tipName: Text;
  private readonly tipInteraction: Text;
  private readonly tipDesc: Text;
  private readonly lastText: string[] = [];
  private hover: HoverState = NO_HOVER;
  private cachedLayout: HotbarLayout | null = null;

  constructor(hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gfx);
    this.rowText = Array.from({ length: SLOT_COUNT }, () => this.buildRowText());
    this.tipName = new Text({ text: '', style: TIP_NAME_STYLE });
    this.tipInteraction = new Text({ text: '', style: TIP_INTERACTION_STYLE });
    this.tipDesc = new Text({ text: '', style: TIP_DESC_STYLE });
    this.tipRoot.addChild(this.tipGfx, this.tipName, this.tipInteraction, this.tipDesc);
    this.tipRoot.visible = false;
    this.root.addChild(this.tipRoot);
  }

  private buildRowText(): RowText {
    const key = new Text({ text: '', style: KEY_STYLE });
    key.anchor.set(0.5);
    const name = new Text({ text: '', style: NAME_STYLE });
    const info = new Text({ text: '', style: INFO_STYLE });
    const badge = new Text({ text: '', style: BADGE_STYLE });
    badge.anchor.set(0.5);
    this.root.addChild(key, name, info, badge);
    return { key, name, info, badge };
  }

  /** The layout this frame used — null while hidden (hit-tests must miss). */
  get layout(): HotbarLayout | null {
    return this.cachedLayout;
  }

  /** The slot under a screen point, or null while the hotbar isn't rendering. */
  slotAt(p: ScreenPoint): number | null {
    return slotAtPoint(p, this.cachedLayout);
  }

  /**
   * Hide the whole hotbar (death / spectate / reveal / return to port — and the
   * forceSnap pose gap after a reconnect or a P toggle, where no frame renders
   * at all). DROPS the cached layout, so a hidden hotbar routes no clicks: the
   * gate misses and the press falls through to the water exactly as it would
   * with no hotbar on screen.
   */
  hide(): void {
    this.root.visible = false;
    this.tipRoot.visible = false;
    this.hover = NO_HOVER;
    this.cachedLayout = null;
  }

  /** Render one frame. `cursor` is the pointer position, or null when the
   *  pointer has left the window (no hover then); `nowMs` is a monotonic clock
   *  (performance.now) for the dwell delay. */
  update(view: HotbarView, screenW: number, screenH: number, cursor: ScreenPoint | null, nowMs: number): void {
    this.root.visible = true;
    this.root.alpha = view.dim ? H.dimAlpha : 1;
    const layout = hotbarLayout(screenH);
    this.cachedLayout = layout;
    const models = slotViewModels(view);
    this.gfx.clear();
    for (const row of layout.rows) this.drawRow(models[row.slot], row);
    this.updateTooltip(view, layout, models, cursor, screenW, screenH, nowMs);
  }

  private drawRow(m: SlotViewModel, row: HotbarRow): void {
    const skin = slotSkin(m.state, motionIntensity(settings.current.motion));
    this.drawBox(m, row.box, skin);
    this.drawIcon(m, row.box, skin);
    this.drawKeyChip(m, row);
    this.drawBadge(m, row.box);
    this.updateRowText(m, row);
  }

  private drawBox(m: SlotViewModel, box: SlotRect, skin: SlotSkin): void {
    const g = this.gfx;
    const pts = slotOutline(box, m.chamfer ? H.chamfer : 0);
    const flat = pts.map((p) => [p.x, p.y]).flat();
    if (skin.scrim) g.poly(flat).fill({ color: C.cardScrim, alpha: 0.9 });
    if (skin.washAlpha > 0) g.poly(flat).fill({ color: skin.wash, alpha: skin.washAlpha });
    if (skin.dashed) traceDashed(g, pts);
    else g.poly(flat);
    g.stroke({ width: skin.borderWidth, color: skin.border, alpha: skin.borderAlpha });
    this.drawGlow(pts, box, skin);
    // The track belongs to the STATE, not to the fraction: at frac 0 (the frame
    // the reload starts, or a mid-reload reload upgrade that leaves
    // reloadMsLeft >= the new reloadMs) the dim remaining ring must still be
    // there — an empty perimeter would read as "no cooldown running".
    if (m.state === 'cooling') this.drawCoolTrack(pts, m.coolFrac);
  }

  /** Layered low-alpha rings approximating the DESIGN.md box glow. */
  private drawGlow(pts: ScreenPoint[], box: SlotRect, skin: SlotSkin): void {
    if (skin.glowPx <= 0) return;
    for (let i = 1; i <= 3; i++) {
      const ring = inflate(pts, box, (skin.glowPx * i) / 3);
      this.gfx
        .poly(ring.map((p) => [p.x, p.y]).flat())
        .stroke({ width: 1.5, color: skin.border, alpha: (skin.glowAlpha * (4 - i)) / 4 });
    }
  }

  /** 2px conic perimeter track: phosphor elapsed / phosphor .14 remaining. */
  private drawCoolTrack(pts: ScreenPoint[], frac: number): void {
    const g = this.gfx;
    tracePerimeter(g, pts, 0, frac);
    g.stroke({ width: H.trackWidth, color: C.phosphor, alpha: 0.9 });
    tracePerimeter(g, pts, frac, 1);
    g.stroke({ width: H.trackWidth, color: C.phosphor, alpha: 0.14 });
  }

  private drawIcon(m: SlotViewModel, box: SlotRect, skin: SlotSkin): void {
    const cx = box.x + box.size / 2;
    const cy = box.y + box.size / 2;
    const style = { width: 1.5, color: skin.icon, alpha: skin.iconAlpha };
    if (m.id === null) drawPlusGlyph(this.gfx, cx, cy, H.icon * 0.5, style);
    else drawEquipmentIcon(this.gfx, m.id, cx, cy, H.icon, style);
  }

  /** Mono key chip via the SHARED drawer (render/keyChip.ts — one family with
   *  the helm keys); the SELECTED slot's chip fills amber with a void glyph,
   *  the keyless gun renders a GHOST chip (no box, alignment kept). */
  private drawKeyChip(m: SlotViewModel, row: HotbarRow): void {
    const t = this.rowText[m.slot].key;
    const s = H.keyChip;
    if (m.keyGlyph !== '') drawKeyChipBox(this.gfx, row.keyX, row.keyY, m.selected, s);
    t.visible = m.keyGlyph !== '';
    // Key chips are PHOSPHOR (amendment 16); the SELECTED chip fills amber and
    // knocks its glyph out in void. Cooling/empty dim the phosphor, never grey.
    this.setFill(t, keyChipGlyphColor(m.selected));
    t.alpha = m.selected ? 1 : dimAlphaFor(m);
    t.position.set(row.keyX + s / 2, row.keyY + s / 2);
    this.setText(t, m.keyGlyph, m.slot * 4);
  }

  /** Ammo badge — 16px scrim square overhanging the slot's top-right corner,
   *  ONLY on pools larger than one round. */
  private drawBadge(m: SlotViewModel, box: SlotRect): void {
    const t = this.rowText[m.slot].badge;
    t.visible = m.badge !== null;
    if (m.badge === null) return;
    const s = H.badge;
    const x = box.x + box.size - s + H.badgeOverhang;
    const y = box.y - H.badgeOverhang;
    this.gfx.rect(x, y, s, s).fill({ color: C.cardScrim, alpha: 0.95 });
    this.gfx.rect(x, y, s, s).stroke({ width: 1, color: C.phosphor, alpha: 0.5 });
    t.alpha = dimAlphaFor(m);
    t.position.set(x + s / 2, y + s / 2);
    this.setText(t, m.badge, m.slot * 4 + 1);
  }

  private updateRowText(m: SlotViewModel, row: HotbarRow): void {
    const { name, info } = this.rowText[m.slot];
    const dim = dimAlphaFor(m);
    name.position.set(row.labelX, row.nameY);
    info.position.set(row.labelX, row.infoY);
    // Names: bright white, amber while selected. Cooling/empty DIM the same
    // color rather than switching to grey (amendment 16).
    this.setFill(name, m.selected ? C.amber : C.textPrimary);
    name.alpha = dim;
    info.alpha = dim;
    info.visible = m.quickInfo !== '';
    this.setText(name, m.name, m.slot * 4 + 2);
    this.setText(info, m.quickInfo, m.slot * 4 + 3);
  }

  /** Assign only on change — Pixi re-rasterizes a Text on every `.text` write. */
  private setText(t: Text, value: string, key: number): void {
    if (this.lastText[key] === value) return;
    this.lastText[key] = value;
    t.text = value;
  }

  /** Same guard for the tint: a style write invalidates the rasterized text. */
  private setFill(t: Text, color: number): void {
    if (t.style.fill === color) return;
    t.style.fill = color;
  }

  private updateTooltip(
    view: HotbarView,
    layout: HotbarLayout,
    models: SlotViewModel[],
    cursor: ScreenPoint | null,
    screenW: number,
    screenH: number,
    nowMs: number,
  ): void {
    // A null cursor is "the pointer isn't in the window" (input/mouse.ts's
    // presence flag): the last known position must not keep a tooltip alive.
    this.hover = nextHover(this.hover, cursor === null ? null : slotAtPoint(cursor, layout), nowMs);
    const slot = this.hover.slot;
    const model = slot === null ? null : tooltipModel(slot, models[slot].id, view.stats);
    if (!shouldShowTooltip(this.hover, nowMs, view.dim, model !== null) || slot === null || model === null) {
      this.tipRoot.visible = false;
      return;
    }
    this.tipRoot.visible = true;
    this.drawTooltip(model, layout.rows[slot], screenW, screenH);
  }

  /** 236px near-opaque panel + 1px silver .4 border + pointer notch. The BOONS
   *  block renders as ABSENCE: no divider, no rows, no placeholder. */
  private drawTooltip(model: TooltipModel, row: HotbarRow, screenW: number, screenH: number): void {
    const t = H.tooltip;
    this.setText(this.tipName, model.name, 100);
    this.setText(this.tipInteraction, model.interaction, 101);
    this.setText(this.tipDesc, model.description, 102);
    const nameH = this.tipName.height;
    const interH = this.tipInteraction.height;
    const panelH = t.pad * 2 + nameH + 6 + interH + 10 + this.tipDesc.height;
    const place = tooltipPlacement(row, panelH, screenW, screenH);
    this.tipName.position.set(place.x + t.pad, place.y + t.pad);
    this.tipInteraction.position.set(place.x + t.pad, place.y + t.pad + nameH + 6);
    this.tipDesc.position.set(place.x + t.pad, place.y + t.pad + nameH + 6 + interH + 10);
    this.paintTooltipPanel(place, panelH);
  }

  private paintTooltipPanel(place: TooltipPlacement, panelH: number): void {
    const t = H.tooltip;
    const g = this.tipGfx;
    g.clear();
    g.rect(place.x, place.y, t.width, panelH).fill({ color: C.panel, alpha: 0.97 });
    g.rect(place.x, place.y, t.width, panelH).stroke({ width: 1, color: C.silver, alpha: 0.4 });
    const edge = place.notchLeft ? place.x : place.x + t.width;
    const tip = place.notchLeft ? edge - t.notch : edge + t.notch;
    g.moveTo(edge, place.notchY - t.notch)
      .lineTo(tip, place.notchY)
      .lineTo(edge, place.notchY + t.notch)
      .fill({ color: C.panel, alpha: 0.97 });
  }
}
