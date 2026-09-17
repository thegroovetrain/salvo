// THE SLOT ROW (Story 2.2's hotbar, RE-CUT onto the HUD bar in Story 8.6) —
// nine squares and one framed belt, drawn in Pixi over the water at the
// geometry `render/hudBar.ts` hands it:
//
//   HP globe | Gun  Shift  Q  E  R | [ 1  2  3  4 ] | helm globe
//                                    ^ the belt frame this module draws
//
// WHAT STORY 8.6 DELETED, and why it is deletion rather than a flag:
//   • `hotbarLayout` / `HotbarLayout` — the bottom-left stack is gone; the bar's
//     one pure `hudBarLayout` owns every rect now (ruling 1), and this module
//     hit-tests and paints the rects it is handed.
//   • the LABEL COLUMN (slot name + quick-info line) — no word renders on a slot
//     any more (UX-DR40/41). The tooltip carries the name, the interaction line,
//     the description and the accrued build; the SQUARE carries state, seconds
//     and counts. With the whole loadout on one row there is no column to put
//     words in, and nine names across the bottom of the screen was the "three
//     corners" problem in miniature.
//   • the CHAMFER — the ability shape mark. The bar's ability slot is `Shift`,
//     spelled out on its chip (amendment 33), and the cut fought the wipe's
//     angle-uniform sweep at the one corner the sweep starts from.
//   • the PERIMETER COOLDOWN TRACK — replaced outright by the WIPE
//     (render/cooldownWipe.ts, ruling 3): a dark region uncovering clockwise
//     from twelve with the seconds left as one big centred numeral.
//
// WHAT SURVIVED UNTOUCHED: the pure state grammar. `slotState` and its
// precedence, the eight skins, the ACTIVE breath, the flash-budget degrade, the
// hover dwell and the whole tooltip core are the ratified 2.2–8.5 contract and
// are byte-identical here — only their geometry moved.
//
// The state grammar is DESIGN.md · Components · Hotbar Slot, as the ratified
// mock (`mockups/hud-composite-3.html`) draws it:
//   idle        1px silver .28 outline, transparent interior (water shows through)
//   ready wpn   phosphor .4 outline + 10px glow
//   ready Shift phosphor .65 outline + 14px glow
//   selected    amber outline + 16px glow + inset amber wash + FILLED amber key
//               chip — the wash and the filled chip are the selected channel;
//               hue is secondary (dual-coding)
//   cooling     card-scrim interior, the dark WIPE uncovering clockwise from
//               twelve, the icon at .4 and the seconds left as a centred numeral
//   activated   one <=80ms phosphor pop (wash + full outline + 22px bloom)
//               decaying into cooling — reuses the DeniedPulse 80/300ms register
//   active      (amendment 48, carried by amendment 34) the ability WINDOW is
//               running: a breathing phosphor outline + the seconds left as the
//               same centred numeral, NO overlay, icon at full alpha
//   empty       1px DASHED slate .45 + a centred `—` glyph, and NO WORDS
//   denied      1px→2px denied-red edge pulse + red icon flash — never silence
//
// Selection is the CLIENT's primed slot (gun whenever nothing is primed) — the
// server keeps no priming state. Reload/cooling renders on EVERY slot
// regardless of which one is selected (every system's reload ticks anyway).
//
// Colors are tokens only (CLIENT_CONFIG.colors); every size is the bar's
// (CLIENT_CONFIG.hudBar — epic-8 amendment 31: the mock is read literally).
// Nothing here drives net or sim: clicks are routed back out through the SAME
// keyboard slot-action path the keys use.

import { Container, Graphics, Text } from 'pixi.js';
import {
  CATALOG,
  CONSUMABLE_SLOTS,
  SLOT_COUNT,
  boonStackCount,
  type EffectiveStats,
  type EquipmentId,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionAllowed, motionIntensity, motionScaled, settings, type MotionLevel } from '../settings/store.js';
import type { ScreenPoint } from '../input/mouse.js';
import { traceDashed, type PolyPoint } from '../util/poly.js';
import { boonEffectLine, boonName } from '../ui/boonCopy.js';
import { monoTextWidth, monoWrapLines } from '../ui/refitCardFit.js';
import { drawEquipmentIcon, drawDashGlyph } from './equipmentIcons.js';
import { drawWipeDark, drawWipeScrim, wipeLabel } from './cooldownWipe.js';
import { microScale, type HudBarLayout, type Rect } from './hudBar.js';
import {
  SLOT_KEY_GLYPHS,
  cardEquipmentIds,
  equipmentInfo,
  isShipwideCard,
  interactionLine,
  lineTier,
  type EquipmentInfo,
} from './equipmentInfo.js';

const C = CLIENT_CONFIG.colors;
const H = CLIENT_CONFIG.hotbar;
const B = CLIENT_CONFIG.hudBar;
const W = B.wipe;
const MONO = CLIENT_CONFIG.type.mono;
const DISPLAY = CLIENT_CONFIG.type.display;

/** Pure: is this slot one of the four CONSUMABLE BELT squares (44px, framed,
 *  no tier numeral)? The belt's membership is shared's, never a local range. */
export function isBeltSlot(slot: number): boolean {
  return (CONSUMABLE_SLOTS as readonly number[]).includes(slot);
}

// --- pure core: per-slot state -------------------------------------------------

/** The EIGHT slot states: the seven ratified in DESIGN.md · Components · Hotbar
 *  Slot, plus ACTIVE (amendment 48 — an ability window is RUNNING). */
export type SlotState =
  | 'empty'
  | 'denied'
  | 'activated'
  | 'active'
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
 * denied > activated > ACTIVE > cooling > selected > ready — an empty slot
 * short-circuits everything (it holds nothing to deny, cool, or select; R is
 * inert while unfitted, so no flag can ever reach it).
 *
 * COOLING IS AVAILABILITY, NOT TIMER STATE: a pool with a round still in it
 * (`n > 0`) reads READY even while the reload timer runs for the NEXT round —
 * an upgraded 2-fish tube with one fish left is fireable, and dimming it would
 * lie. Only an empty pool (`n <= 0`) with a running timer cools.
 *
 * ACTIVE OUTRANKS COOLING (amendment 48, re-ruled for the bar by amendment 34).
 * The two genuinely coexist — a radar buoy floats out its whole window while its
 * rack reloads, and the boost's cooldown starts the instant the throttle opens —
 * so this is a real decision, not a hypothetical: while the window is RUNNING it
 * is the payoff, and the cooldown is the smaller story. On the bar the ACTIVE
 * slot therefore shows the WINDOW's seconds in the same centred numeral the
 * wipe uses, with no overlay at all: one numeral register, two meanings,
 * separated by the outline (breathing phosphor vs the dark sweep).
 */
export function slotState(
  id: EquipmentId | null,
  flags: SlotFlags,
  cooling: boolean,
  selected: boolean,
  isWeapon: boolean,
  active = false,
): SlotState {
  if (id === null) return 'empty';
  if (flags.denied) return 'denied';
  if (flags.activated) return 'activated';
  if (active) return 'active';
  if (cooling) return 'cooling';
  if (selected) return 'selected';
  return isWeapon ? 'readyWeapon' : 'readyAbility';
}

/** Pure: is this slot COOLING — no round available and a reload running? */
export function isCooling(ammo: WeaponAmmo | null): boolean {
  return ammo !== null && ammo.n <= 0 && ammo.reloadMsLeft > 0;
}

/**
 * Pure: the accrued card ids a SLOT owns, in fit order with repeats intact.
 *
 * STORY 8.1 — NO CATEGORY FILTER. Catalog v3 deleted the nine categories, so a
 * slot claims the cards that actually ADDRESS its equipment: the line's own
 * slotFill target, the equipment its stat effects write into, and the equipment
 * an add-on bolts its verb onto (render/equipmentInfo.cardEquipmentIds). The
 * GUN, being the permanent first slot, additionally hosts the SHIPWIDE ladders
 * (ARMOR / SPEED / TURNING / RADAR SWEEP / RELOAD), which belong to no weapon —
 * the same role the v2 INTEL/SHIP categories had, derived rather than declared.
 *
 * Fail-closed on the catalog (Object.hasOwn): a junk id on the wire is dropped
 * rather than rendering a row nothing can explain.
 */
export function slotBoonIds(id: EquipmentId, cards: readonly string[]): string[] {
  return cards.filter((c) => {
    if (!Object.hasOwn(CATALOG, c)) return false;
    const targets = cardEquipmentIds(c);
    return targets.length === 0 ? id === 'gun' : targets.includes(id);
  });
}

/** Everything one rendered slot square needs — the pure view model. */
export interface SlotViewModel {
  slot: number;
  id: EquipmentId | null;
  state: SlotState;
  /** The selection channel (filled amber key chip), tracked independently of
   *  `state` so a SELECTED slot that is also cooling keeps reading as selected
   *  (dual-coding — DESIGN.md). */
  selected: boolean;
  keyGlyph: string;
  /** Ammo count text, or null — badges show ONLY on pools larger than one. */
  badge: string | null;
  /** The wipe's elapsed fraction in [0,1); 0 when not cooling. */
  coolFrac: number;
  /** Reload ms left while COOLING (0 otherwise) — the wipe's centred numeral. */
  reloadMsLeft: number;
  /** Remaining ms of a running ability window (0 = none) — the ACTIVE numeral. */
  activeMsLeft: number;
  /** The fitted equipment LINE's tier, 1..5 (0 = none, and always 0 on the belt
   *  and on an empty) — the bottom-right numeral. */
  tier: number;
  /** A boon just landed on this slot's family: the ≤80ms phosphor fit pulse is
   *  showing THIS frame (already motion-gated — see slotViewModel). */
  fitFlash: boolean;
  /** Accrued cards on this slot (the tooltip's list length, unclamped). */
  boonCount: number;
  /** This frame's one-shot on this slot is DEGRADED by the aggregate flash budget
   *  (amendment 240): draw the flat mark, not the bloom. Absent = animate. */
  degraded?: boolean;
}

/** The own-ship inputs the slot row reads (one-way: state → view, never back). */
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
  /** Per-slot: this frame's denied pulse was over the AGGREGATE FLASH BUDGET
   *  (render/flashBudget.ts, amendment 240) and must render DEGRADED — the flat
   *  `motion: 'off'` mark. The denial itself is never suppressed: the budget
   *  degrades, it does not delete. Absent = nothing was over budget. */
  deniedDegraded?: readonly boolean[];
  /** Per-slot activated pop state this frame. */
  activated: readonly boolean[];
  /** The refit window is open (or the start line is held): the slot groups dim
   *  to 38%, slot keys AND clicks suspended. */
  dim: boolean;
  /** Accessibility motion level (Story 2.3) — gates the ACTIVATED pop, the FIT
   *  flash and the glow/breathing amplitude. Defaults to 'full' so existing
   *  callers/tests are unchanged. */
  motion?: MotionLevel;
  /** The own fitted card ids (OwnShip.cards, repeats intact) — the tooltip's
   *  accrued list and each square's TIER numeral. Absent = nothing fitted. */
  cards?: readonly string[];
  /** Per-slot REMAINING ability-window ms (0 = no window running) — the ACTIVE
   *  state's whole input (amendment 48: boost's `boostUntil`, the radar buoy's
   *  own `until`), resolved against the server clock by the caller. */
  activeMsLeft?: readonly number[];
  /** Per-slot fit pulse this frame: a boon landed on THIS slot's family. */
  fit?: readonly boolean[];
  /** Rank-wide fit pulse: a shipwide (INTEL/SHIP) boon landed, which no single
   *  slot owns — the whole row flashes once instead (amendment 51). */
  fitFrame?: boolean;
  /** That rank-wide pulse was over the aggregate flash budget: it still draws,
   *  at the flat degraded weight (see drawFitFrame). */
  fitFrameDegraded?: boolean;
  /** Server-clock SECONDS — the ACTIVE outline's breathing phase (the xp strip /
   *  HP globe idiom: one shared clock, integrated phase, never a frame counter). */
  nowSec?: number;
}

/** Pure: every square's view model, in slot order (Gun – Shift – Q – E – R – 1-4). */
export function slotViewModels(view: HotbarView): SlotViewModel[] {
  return Array.from({ length: SLOT_COUNT }, (_, slot) => slotViewModel(view, slot));
}

/** Pure: the badge text for a WEAPON slot — null unless the effective pool holds
 *  >1 AND a real ammo entry exists (a missing entry shows NO badge, never "0"). */
export function badgeText(info: EquipmentInfo, ammo: WeaponAmmo | null): string | null {
  if (info.maxAmmo <= 1 || ammo === null) return null;
  return String(ammo.n);
}

/**
 * Pure: the badge text for a BELT square — the mock's `×n` stock mark.
 *
 * The belt is EMPTY for the whole of Story 8.6 (Story 8.7 stocks the rack), so
 * nothing renders this today; the path exists because the badge is part of the
 * square's grammar and leaving a hole here is how the rack's first stock ships
 * with no readout at all.
 */
export function beltBadgeText(ammo: WeaponAmmo | null): string | null {
  return ammo === null || ammo.n <= 0 ? null : `×${ammo.n}`;
}

/** Pure: the wipe's elapsed fraction in [0,1] (0 = not cooling). */
export function coolFraction(reloadMsLeft: number, reloadMs: number): number {
  if (reloadMsLeft <= 0 || reloadMs <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - reloadMsLeft / reloadMs));
}

/**
 * Pure: the ONE centred numeral a square shows — the ACTIVE window's seconds
 * left while a window runs, the reload's while it cools, and nothing otherwise.
 *
 * One register, two meanings (amendment 34). What separates them is the OUTLINE:
 * ACTIVE breathes phosphor over an undimmed icon with no overlay at all, while
 * cooling is the dark sweep over a dimmed one. A player never has to ask which
 * clock they are reading, because the two never coexist on one square —
 * `slotState` ranks ACTIVE above cooling precisely so the window wins.
 */
export function slotNumeral(m: Pick<SlotViewModel, 'state' | 'activeMsLeft' | 'reloadMsLeft'>): string {
  if (m.state === 'active') return wipeLabel(m.activeMsLeft);
  if (m.state === 'cooling') return wipeLabel(m.reloadMsLeft);
  return '';
}

/**
 * The unfitted square: a dashed box with a centred `—` and NOTHING else
 * (UX-DR41, Story 8.5). The key chip is NOT emptied with it — an empty Q still
 * says Q, which is the whole point of denying its key (amendment 26).
 * `degraded: false` is explicit rather than omitted for totality: an unfitted
 * slot holds nothing to deny, so it can never carry a budget verdict.
 */
function emptySlotModel(slot: number, keyGlyph: string): SlotViewModel {
  return { slot, id: null, state: 'empty', selected: false, keyGlyph, badge: null, coolFrac: 0, reloadMsLeft: 0, activeMsLeft: 0, tier: 0, fitFlash: false, boonCount: 0, degraded: false };
}

/**
 * Pure: this frame's feedback latches for a slot. The ACTIVATED pop is pure
 * juice — the cooling wipe that follows it carries the same information
 * statically — so the accessibility motion level suppresses it at `off`. The
 * DENIED latch is never gated: it is the denial's only visual channel.
 */
export function slotFlags(view: HotbarView, slot: number): SlotFlags {
  return {
    denied: view.denied[slot] ?? false,
    activated: (view.activated[slot] ?? false) && motionAllowed(view.motion ?? 'full'),
  };
}

/**
 * Pure: is this slot's denied pulse DEGRADED this frame (the aggregate flash
 * budget's `'degrade'` verdict — main.ts owns the claim, per slot, against
 * `hotbarSlotKey`)?
 *
 * Deliberately NOT a third `SlotFlags` field: the flags are the STATE latches
 * that decide which state a square is in, and a budget verdict must never be
 * able to change that — a degraded denial is still a denial. It is ANDed with
 * the pulse it describes, because a degrade flag with no denial showing would
 * silently flatten some other state's bloom.
 */
export function slotDegraded(view: HotbarView, slot: number, denied: boolean): boolean {
  return denied && (view.deniedDegraded?.[slot] ?? false);
}

function slotViewModel(view: HotbarView, slot: number): SlotViewModel {
  const id = view.loadout[slot] ?? null;
  const keyGlyph = SLOT_KEY_GLYPHS[slot] ?? '';
  if (id === null) return emptySlotModel(slot, keyGlyph);
  const info = equipmentInfo(view.stats, id);
  const a = view.ammo[slot] ?? null;
  const cooling = isCooling(a);
  const belt = isBeltSlot(slot);
  // The numeral + the wipe belong to the COOLING read: a slot that still has a
  // round shows no clock at all, not the timer for the next one.
  const left = cooling ? (a?.reloadMsLeft ?? 0) : 0;
  const flags = slotFlags(view, slot);
  const selected = slot === view.primedSlot;
  const { activeLeft, boonCount, fitFlash } = slotEconomy(view, slot, id);
  return {
    slot,
    id,
    state: slotState(id, flags, cooling, selected, info.isWeapon, activeLeft > 0),
    selected,
    keyGlyph,
    ...slotMarks(view, id, a, belt),
    coolFrac: coolFraction(left, info.reloadMs),
    reloadMsLeft: left,
    activeMsLeft: activeLeft,
    fitFlash,
    boonCount,
    degraded: slotDegraded(view, slot, flags.denied),
  };
}

/**
 * Pure: a square's two corner MARKS — the ammo badge and the tier numeral.
 *
 * The belt forks both: its badge counts STOCK (`×n`, mock `.belt .badge`) rather
 * than a magazine, and it shows no tier at all, because a consumable is a thing
 * you carry rather than a ladder you climb (ruling 4).
 */
function slotMarks(
  view: HotbarView,
  id: EquipmentId,
  ammo: WeaponAmmo | null,
  belt: boolean,
): { badge: string | null; tier: number } {
  if (belt) return { badge: beltBadgeText(ammo), tier: 0 };
  return { badge: badgeText(equipmentInfo(view.stats, id), ammo), tier: lineTier(view.cards ?? [], id) };
}

/**
 * Pure: a slot's Story 2.9 inputs — the running ability window, the accrued
 * count, and this frame's fit pulse. All three are OPTIONAL on the view (a
 * caller from before 2.9 gets exactly the old square back).
 *
 * The fit pulse is pure JUICE — the tooltip row and the toast carry the same
 * fact statically — so it gates on the motion level exactly as the ACTIVATED
 * pop does. The window and the count never gate: they are information.
 */
function slotEconomy(
  view: HotbarView,
  slot: number,
  id: EquipmentId,
): { activeLeft: number; boonCount: number; fitFlash: boolean } {
  return {
    activeLeft: Math.max(0, view.activeMsLeft?.[slot] ?? 0),
    boonCount: slotBoonIds(id, view.cards ?? []).length,
    fitFlash: (view.fit?.[slot] ?? false) && motionAllowed(view.motion ?? 'full'),
  };
}

// --- pure core: the TIER numeral ------------------------------------------------

/**
 * The tier numerals, I..V — the mock's `.tier` mark in a square's bottom-right
 * corner. A ROMAN numeral deliberately: the square's other numeral is the
 * seconds clock, in arabic digits at twice the size, and two arabic numbers on
 * one 54px square would read as one number split in half.
 */
export const TIER_NUMERALS: readonly string[] = ['I', 'II', 'III', 'IV', 'V'];

/**
 * The tier RAMP, ABSOLUTE and not relative: tier III is the same colour on a
 * weapon capped at III as on one capped at V, so a player learns one ladder of
 * five colours instead of re-reading the ramp per weapon. Tokens only (UX-DR76
 * — Story 8.6 mints nothing), and the last two rungs deliberately borrow the
 * ALERT hues: a tier IV/V weapon is a thing other players should worry about.
 */
export const TIER_COLORS: readonly number[] = [C.phosphor, C.info, C.stormReadout, C.denied, C.amber];

/** Pure: the numeral a tier prints, or '' for "no fitted ladder" (tier 0) and
 *  for anything past the ramp (which the catalog's caps make unreachable). */
export function tierNumeral(tier: number): string {
  return TIER_NUMERALS[tier - 1] ?? '';
}

/** Pure: the tier numeral's colour on the absolute ramp (tier 1 = phosphor). */
export function tierColor(tier: number): number {
  return TIER_COLORS[Math.min(Math.max(tier, 1), TIER_COLORS.length) - 1];
}

// --- pure core: the KEY CHIP -----------------------------------------------------

/**
 * Pure: a key chip's width (px) — the mock's `.kc` box, which WIDENS to its
 * glyph: `min-width 16px` with `3px` of padding each side. That is what lets
 * slot 1's chip spell `Shift` (amendment 33) while the digits stay square.
 *
 * `micro` is `microScale(uiScale)` (ruling 2). The GLYPH counter-scales at the
 * 90% UI setting so it still renders at the 9px mono floor — and a glyph that
 * grew relative to its box would run straight out of it, so the BOX takes the
 * same factor on its text term. The padding is deliberately left to scale with
 * the geometry: it is spacing, not type.
 */
export function chipWidth(glyph: string, micro = 1): number {
  return Math.max(B.chipMinW, monoTextWidth(glyph, B.type.chip) * micro + 2 * B.chipPadX);
}

/**
 * Pure: a slot's AMMO BADGE box — the 16px square overhanging its top-right
 * corner (`beltBadgeOverhang` is 1px tighter on the belt, as the mock's
 * `.belt .badge` is).
 *
 * Returned UNCONDITIONALLY, whether or not a badge renders this frame: it is
 * the hit-test's input as well as the drawer's, and the click gate must be a
 * function of the LAYOUT, not of how many rounds happen to be in the pool. The
 * old row footprint reserved the same overhang for the same reason (amendment
 * 11) — a press on the ammo count is that slot's press, never a shot at the
 * water behind it.
 */
export function badgeRect(layout: HudBarLayout, slot: number): Rect {
  const sq = layout.squares[slot];
  const over = isBeltSlot(slot) ? B.beltBadgeOverhang : B.badgeOverhang;
  return { x: sq.x + sq.w - B.badge + over, y: sq.y - over, w: B.badge, h: B.badge };
}

/**
 * Pure: a slot's key-chip BOX, centred under its square.
 *
 * Deliberately measured at `micro = 1` for HIT-TESTING (see `slotAtPoint`): the
 * hit region is the square's own width, so the chip's exact drawn width never
 * has to reach the click gate and the gate stays a function of the layout
 * alone.
 */
export function chipRect(layout: HudBarLayout, slot: number, micro = 1): Rect {
  const anchor = layout.chips[slot];
  const w = chipWidth(SLOT_KEY_GLYPHS[slot] ?? '', micro);
  return { x: anchor.cx - w / 2, y: anchor.y, w, h: B.chipH };
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
  /** Dashed outline (the empty slot). */
  dashed: boolean;
  /** Card-scrim interior (cooling — painted by the WIPE since Story 8.6). */
  scrim: boolean;
}

const SKINS: Record<SlotState, SlotSkin> = {
  empty: { border: C.textMuted, borderAlpha: 0.45, borderWidth: 1, glowPx: 0, glowAlpha: 0, wash: C.void, washAlpha: 0, icon: C.textMuted, iconAlpha: 0.5, dashed: true, scrim: false },
  readyWeapon: { border: C.phosphor, borderAlpha: 0.4, borderWidth: 1, glowPx: 10, glowAlpha: 0.15, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.75, dashed: false, scrim: false },
  // The two glow alphas below are the MOCK's, re-taken in Story 8.6 (epic-8
  // amendment 31 — the mock is the register of record for the bar's surfaces):
  // `.slot.ability.ready`'s 14px phosphor bloom is .2 and `.slot.sel`'s 16px
  // amber bloom is .4, against the .18 / .22 the bottom-left stack had drifted
  // to. Nothing else in this table moved. (The alphas are NAMED, not spelled
  // out as the mock's colour functions: tokens.test.ts's guard scan reads
  // comments too, and a quoted rgba() would fail the literal scan.)
  readyAbility: { border: C.phosphor, borderAlpha: 0.65, borderWidth: 1, glowPx: 14, glowAlpha: 0.2, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.85, dashed: false, scrim: false },
  selected: { border: C.amber, borderAlpha: 1, borderWidth: 1.5, glowPx: 16, glowAlpha: 0.4, wash: C.amber, washAlpha: 0.12, icon: C.amber, iconAlpha: 0.95, dashed: false, scrim: false },
  // Cooling DIMS the phosphor icon (amendment 16 — dim the same color, never
  // swap in grey); the silver box edge is decorative linework and stays.
  cooling: { border: C.silver, borderAlpha: 0.28, borderWidth: 1, glowPx: 0, glowAlpha: 0, wash: C.void, washAlpha: 0, icon: C.phosphor, iconAlpha: 0.55, dashed: false, scrim: true },
  activated: { border: C.phosphor, borderAlpha: 1, borderWidth: 1.5, glowPx: 22, glowAlpha: 0.3, wash: C.phosphor, washAlpha: 0.2, icon: C.phosphorBright, iconAlpha: 1, dashed: false, scrim: false },
  // ACTIVE (amendment 48): the ability window is RUNNING. A persistent phosphor
  // outline — heavier than ready, lighter than the one-shot ACTIVATED pop it
  // decays out of — that BREATHES (activeBreath below). Deliberately not a wash:
  // the window can run for seconds, and a filled slot at that duration competes
  // with the threat channels this feedback must sit under (Tier-3 attention).
  active: { border: C.phosphorBright, borderAlpha: 1, borderWidth: 2, glowPx: 14, glowAlpha: 0.24, wash: C.void, washAlpha: 0, icon: C.phosphorBright, iconAlpha: 1, dashed: false, scrim: false },
  denied: { border: C.denied, borderAlpha: 1, borderWidth: 2, glowPx: 8, glowAlpha: 0.25, wash: C.void, washAlpha: 0, icon: C.denied, iconAlpha: 1, dashed: false, scrim: false },
};

/** The ACTIVE outline's breathing CYCLE (s) — amendment 48's "≥2s cycle". */
export const ACTIVE_BREATH_SEC = 2;

/**
 * The ACTIVE outline's breathing RATE (Hz), hard-clamped by the SHARED
 * photosensitivity ceiling (settings.pulseCapHz) exactly like the XP chip and
 * the HP globe. The clamp is not decoration: it is the one place a future
 * shorter cycle could otherwise sneak past the accessibility floor.
 */
export const ACTIVE_PULSE_HZ = Math.min(1 / ACTIVE_BREATH_SEC, CLIENT_CONFIG.settings.pulseCapHz);

/** Peak depth of the ACTIVE breath (a multiplier swing on the outline's alpha). */
export const ACTIVE_PULSE_AMP = 0.3;

/** Largest frame gap (s) the ACTIVE-breath integrator advances across — the
 *  litZones/hud precedent: a backgrounded tab, or a server-clock re-estimate
 *  that moves `nowSec` by seconds, must not jump the wave. */
const MAX_BREATH_DT = 0.5;

/**
 * Pure: advance the ACTIVE breath's PHASE (radians) by one frame's `dtSec`.
 *
 * INTEGRATED, never derived from absolute time (litZones.advanceEmberPhase and
 * the hull pulse, verbatim reasoning). The server clock this rides is an
 * ESTIMATE, and it is re-estimated: an absolute `sin(nowSec · ω)` teleports the
 * outline's alpha the instant that estimate moves, which is exactly the sudden
 * brightness step the photosensitivity cap exists to prevent. Integrating makes
 * the phase continuous through any such correction, so the cap on the RATE is
 * also a cap on how fast the alpha can move.
 */
export function advanceBreathPhase(phase: number, dtSec: number): number {
  const step = Math.min(MAX_BREATH_DT, Math.max(0, dtSec));
  return (phase + ACTIVE_PULSE_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the ACTIVE outline's alpha MULTIPLIER at a breath `phase` (radians —
 * advanceBreathPhase's output), in [1 - 2·amp, 1]. `amp` is the MOTION-SCALED
 * amplitude: `reduced` halves the depth, `off` makes it exactly 1 — a STATIC
 * outline, present and fully legible, which with the always-on numeral is the
 * whole dual-code. Duration is never touched (juice discipline: reduced halves
 * depth, not time).
 */
export function activeBreath(phase: number, amp = ACTIVE_PULSE_AMP): number {
  return 1 - amp + amp * Math.sin(phase);
}

/**
 * Pure: the alpha a square's small TEXT renders at. Amendment 16's
 * dim-not-grey rule: a cooling or empty slot dims the phosphor/white it already
 * uses instead of swapping in a grey.
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

/**
 * Pure: the skin a square paints with THIS frame — slotSkin with the ACTIVE
 * breath applied to the outline/bloom alphas. Every other state is returned
 * untouched: only ACTIVE breathes, and only its ALPHA moves (the outline width,
 * the icon and the numeral hold still, so the state is never carried by the
 * motion).
 */
export function breathedSkin(state: SlotState, motionIntensity: number, breath: number): SlotSkin {
  const skin = slotSkin(state, motionIntensity);
  if (state !== 'active') return skin;
  return { ...skin, borderAlpha: skin.borderAlpha * breath, glowAlpha: skin.glowAlpha * breath };
}

/**
 * Pure: the skin a DEGRADED one-shot paints (the aggregate flash budget's
 * `'degrade'` verdict, amendment 240) — the square's already-ratified
 * `motion: 'off'` keyframe, which is exactly `slotSkin`'s zero-intensity form:
 * the BLOOM is gone and the border, its width, the icon and the wash are
 * byte-identical. The denial therefore keeps its presence, its position and its
 * full weight; what it loses is the sudden halo, i.e. the flash.
 */
export function degradedSkin(skin: SlotSkin): SlotSkin {
  return { ...skin, glowPx: 0, glowAlpha: 0 };
}

/** Outset (px) of a fit pulse's ring from the surface it flashes around. */
export const FIT_PULSE_PX = 6;

/** Peak alpha of the RANK-WIDE fit frame's stroke (amendment 51's one-shot). */
export const FIT_FRAME_ALPHA = 0.5;

/**
 * Pure: the rank-wide fit frame's stroke alpha this frame. A DEGRADED one-shot
 * (the aggregate flash budget, amendment 240) still draws its full-size frame at
 * its true position for its full life — only at the flat degraded weight, so the
 * row still says "a shipwide boon landed" without contributing another luminance
 * step to a screen already over its 3-per-second floor. It is never skipped: the
 * budget degrades, it does not delete.
 */
export function fitFrameAlpha(degraded: boolean): number {
  return degraded ? FIT_FRAME_ALPHA * CLIENT_CONFIG.flashBudget.degradeAlphaFactor : FIT_FRAME_ALPHA;
}

// --- pure core: hit-test ---------------------------------------------------------

/** Pure: does a screen point fall inside a rect (inclusive, as the shipped row
 *  hit-test always was)? */
function inRect(p: ScreenPoint, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/**
 * Pure: a slot's CONTIGUOUS column — its square, the `chipGap` seam under it and
 * its key chip, as ONE rect at the square's width.
 *
 * ONE rect and not two (review gate, cycle 141): tested as a square plus a
 * separate chip row, the 5px seam between them was WATER, so a click 3px under a
 * square fell straight through the bar and fired the gun — the precise failure
 * the amendment-11 footprint exists to prevent. Nothing about the drawn surface
 * changed; the seam is simply part of the control it has always looked like part
 * of.
 */
function slotColumn(layout: HudBarLayout, slot: number): Rect {
  const sq = layout.squares[slot];
  const chip = layout.chips[slot];
  return { x: sq.x, y: sq.y, w: sq.w, h: chip.y + B.chipH - sq.y };
}

/**
 * Pure: the slot whose COLUMN (square + seam + key chip) or AMMO BADGE contains
 * a screen point, or null.
 *
 * THE hit-test behind both the hover tooltip and the click gate (amendment 11):
 * the chip and the badge are part of the control, exactly as the whole ROW was
 * on the old stack — a press on a slot's key glyph or its ammo count is that
 * slot's press, and is swallowed, so it can never fire the gun at the water
 * underneath. The 8px gaps between squares, the belt frame's padding and
 * everything outside stay WATER, so a press there falls through and fires
 * exactly as before.
 *
 * The chip's hit region is the SQUARE's width rather than the chip's own drawn
 * width: the drawn width is a measured-text function of the UI scale (see
 * `chipWidth`), and the click gate must be a function of the layout alone. The
 * chip is never wider than its square, so this region contains the chip and
 * nothing else.
 *
 * TWO PASSES, SQUARES FIRST (review gate, cycle 141). `beltBadgeOverhang` is
 * exactly the belt gap, so slot 5's badge ends ON slot 6's left edge, and rects
 * are inclusive on both edges: a single pass in slot order gave the previous
 * slot's badge the top 10px of its neighbour's own left-edge column. A press
 * inside a square now always belongs to that square, and a badge only ever wins
 * the overhang — which is the part of it that hangs over water.
 *
 * A null layout (the bar is hidden — death, spectate, the forceSnap pose gap)
 * hits nothing: a hidden bar routes no clicks.
 */
export function slotAtPoint(p: ScreenPoint, layout: HudBarLayout | null): number | null {
  if (layout === null) return null;
  for (let slot = 0; slot < layout.squares.length; slot += 1) {
    if (inRect(p, slotColumn(layout, slot))) return slot;
  }
  for (let slot = 0; slot < layout.squares.length; slot += 1) {
    if (inRect(p, badgeRect(layout, slot))) return slot;
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
 * refit window holds the lockout (`dim`) — a ghost tooltip floating under the
 * modal contradicts the full-lockout ruling — never without a model (an
 * unfitted slot describes nothing), and never before the dwell elapses.
 */
export function shouldShowTooltip(hover: HoverState, nowMs: number, dim: boolean, hasModel: boolean): boolean {
  return !dim && hasModel && hoverReady(hover, nowMs);
}

/**
 * One accrued-boon row in the tooltip's BOONS block (Story 2.9 — the block that
 * shipped in 2.2 as deliberate absence now carries the build).
 *
 * A normal row is a PAIR of lines: the `◆ NAME` the card showed (at the stack's
 * current rung) over a compact effect line reporting the LIVE value. A `divider`
 * row is a single line with no effect under it — the `— SHIP —` section head and
 * the `+n MORE` overflow marker.
 */
export interface TooltipBoonRow {
  label: string;
  effect: string;
  divider: boolean;
  /** The `+n MORE` marker only: how many REAL accrued lines it stands in for.
   *  Carried as data (not re-parsed off the label) so a second trim pass — the
   *  render's viewport clamp re-trimming an already-trimmed list — folds the
   *  earlier count into its own instead of forgetting it. */
  hidden?: number;
}

/**
 * The tooltip's content. `boons` is the ACCRUED build for this slot — already
 * trimmed to fit its box (fitBoonRows). An empty list still renders as ABSENCE:
 * no divider, no rows, no placeholder.
 */
export interface TooltipModel {
  name: string;
  interaction: string;
  description: string;
  boons: readonly TooltipBoonRow[];
}

/** The section head that separates the gun slot's own guns lines from the
 *  shipwide INTEL/SHIP lines it hosts. */
export const SHIP_DIVIDER_ROW = '— SHIP —';

/** Pure: the `+n MORE` marker that replaces the rows a panel cannot fit. */
export function moreBoonsRow(hidden: number): TooltipBoonRow {
  return { label: `◆ +${hidden} MORE`, effect: '', divider: true, hidden };
}

/**
 * Pure: one accrued line's row — the ladder name at the rung you hold, and the
 * live effect line under it.
 *
 * NO `×n` SUFFIX. `boonName` is position-aware: every stackable ladder in the
 * catalog names its own rung (HEAVY SHELLS Mk III), so a suffix could only ever
 * repeat what the name just said — and the rows that DON'T carry a rung name are
 * the single-copy lines, where there is no count to print anyway.
 */
function boonRow(id: string, stack: number, stats: EffectiveStats): TooltipBoonRow {
  return { label: `◆ ${boonName(id, stack - 1)}`, effect: boonEffectLine(id, stats), divider: false };
}

/**
 * Pure: every accrued row for a slot, UNTRIMMED, in fit order. Stacked copies
 * COLLAPSE: five HEAVY SHELLS are one row at Mk V, not five rows. The gun slot
 * appends the shipwide lines under the `— SHIP —` divider (see slotBoonIds).
 *
 * The divider is a SEPARATOR, so it only appears with something on both sides:
 * a gun holding shipwide lines and nothing of its own lists them bare. A heading
 * over the whole list separates it from nothing and just spends a line saying so.
 */
export function boonRows(id: EquipmentId, cards: readonly string[], stats: EffectiveStats): TooltipBoonRow[] {
  const ids = slotBoonIds(id, cards);
  const own: TooltipBoonRow[] = [];
  const ship: TooltipBoonRow[] = [];
  const seen = new Set<string>();
  for (const b of ids) {
    if (seen.has(b)) continue;
    seen.add(b);
    const row = boonRow(b, boonStackCount(ids, b), stats);
    (isShipwideCard(b) ? ship : own).push(row);
  }
  if (ship.length === 0) return own;
  if (own.length === 0) return ship;
  return [...own, { label: SHIP_DIVIDER_ROW, effect: '', divider: true }, ...ship];
}

/**
 * Pure: the tooltip for a slot, or null when there is nothing to describe (an
 * unfitted slot has no equipment — and since Story 8.6 the square carries no
 * words at all, so the tooltip is the ONLY place a slot's name is ever read).
 * `boons` is the own fitted-boon id list (repeats intact).
 */
export function tooltipModel(
  slot: number,
  id: EquipmentId | null,
  stats: EffectiveStats,
  cards: readonly string[] = [],
): TooltipModel | null {
  if (id === null) return null;
  const info = equipmentInfo(stats, id);
  const full: TooltipModel = {
    name: info.name.toUpperCase(),
    interaction: interactionLine(slot, id),
    description: info.description,
    boons: boonRows(id, cards, stats),
  };
  return { ...full, boons: fitBoonRows(full) };
}

// --- pure core: the tooltip's CONTAINER FIT (amendment 47) ----------------------

// The panel is the mirror image of the refit card's fit problem: the card is a
// FIXED box holding growing text, the tooltip is a GROWING panel inside a fixed
// viewport. Same law, same method — model the height in pure arithmetic, pin it
// in a test that walks the whole catalog (__tests__/tooltipFit.test.ts).
//
// WHY THE MODEL IS THE RENDER (and cannot drift): every text style below takes
// its size AND its line-height from TIP_TYPE, and drawTooltip lays the rows out
// at the modelled offsets rather than at Pixi's measured heights. Widths use the
// refit card's mono model (ui/refitCardFit) — an UPPER bound for the mono rows
// (0.605em covers the whole declared fallback stack) and, comfortably, for the
// proportional description too, whose display face averages well under 0.6em.

/** The tooltip's type register — sizes, letter-spacings, explicit line-heights
 *  and inter-block gaps. The Pixi styles below are built FROM this. */
export const TIP_TYPE = {
  nameSize: 17,
  nameLetterSpacing: 1.1,
  interactionSize: 14,
  interactionLetterSpacing: 1.6,
  descSize: 18,
  descLineHeight: 26,
  boonSize: 14,
  boonLetterSpacing: 0.6,
  boonLineHeight: 20,
  /** Line box (px) for the two mono heading rows. */
  headLineHeight: 24,
  /** Gaps: name→interaction, interaction→description, description→boons. */
  nameGap: 6,
  descGap: 10,
  boonsGap: 12,
} as const;

/**
 * The SHORTEST logical viewport the HUD is designed against — the 1280×614
 * floor the refit band's geometry is already pinned to (CLIENT_CONFIG.refit's
 * cardHeight note, the 125% UI-scale tier of a 1366×768 screen). A panel that
 * fits here fits everywhere.
 */
export const TOOLTIP_FLOOR_VIEWPORT_H = 614;

/** THE tooltip's container: the floor viewport minus the panel's own minimum
 *  margin at top and bottom. Nothing may render taller than this. */
export const TOOLTIP_MAX_PANEL_H = TOOLTIP_FLOOR_VIEWPORT_H - 2 * H.tooltip.margin;

/** The panel's inner content width (px) — the fixed panel minus padding. */
export function tooltipInnerWidth(): number {
  return H.tooltip.width - H.tooltip.pad * 2;
}

/** Everything the fit pin asserts on, plus the line counts that make a failure
 *  diagnosable ("the boons block wrapped to 31 lines"). */
export interface TooltipMetrics {
  innerW: number;
  descLines: number;
  boonLines: number;
  /** Total panel height (px) — the same number drawTooltip paints with. */
  height: number;
  /** height − TOOLTIP_MAX_PANEL_H: ≤ 0 fits, > 0 is an amendment-47 violation. */
  overflow: number;
}

/** Pure: the BOONS block as ONE wrapped text run — the exact string the panel
 *  renders (a divider row contributes its label alone). */
export function boonBlockText(rows: readonly TooltipBoonRow[]): string {
  return rows.map((r) => (r.divider ? r.label : `${r.label}\n${r.effect}`)).join('\n');
}

/** Wrapped line count of the boons block at the panel's inner width. */
function boonBlockLines(rows: readonly TooltipBoonRow[], innerW: number): number {
  let lines = 0;
  for (const r of rows) {
    lines += monoWrapLines(r.label, TIP_TYPE.boonSize, TIP_TYPE.boonLetterSpacing, innerW);
    if (!r.divider) lines += monoWrapLines(r.effect, TIP_TYPE.boonSize, TIP_TYPE.boonLetterSpacing, innerW);
  }
  return lines;
}

/**
 * Pure: the modelled height of a tooltip panel, against its container. `maxPanelH`
 * is the budget `overflow` is measured against — the design floor by default, and
 * the REAL viewport's allowance when the render clamps against a screen shorter
 * than the room above the hovered square (drawTooltip / tooltipRenderGeom).
 */
export function tooltipMetrics(model: TooltipModel, maxPanelH = TOOLTIP_MAX_PANEL_H): TooltipMetrics {
  const T = TIP_TYPE;
  const innerW = tooltipInnerWidth();
  const descLines = monoWrapLines(model.description, T.descSize, 0, innerW);
  const boonLines = boonBlockLines(model.boons, innerW);
  const height =
    H.tooltip.pad * 2 +
    T.headLineHeight * 2 +
    T.nameGap +
    T.descGap +
    descLines * T.descLineHeight +
    (model.boons.length > 0 ? T.boonsGap + boonLines * T.boonLineHeight : 0);
  return { innerW, descLines, boonLines, height, overflow: height - maxPanelH };
}

/** Pure: how many REAL accrued lines a row list accounts for — one per boon row,
 *  none for a `— SHIP —` head (furniture: counting it would make the `+n MORE`
 *  marker overstate the build it hides), and the carried count for a marker that
 *  is itself standing in for rows. */
function boonLineCount(rows: readonly TooltipBoonRow[]): number {
  return rows.reduce((n, r) => n + (r.divider ? (r.hidden ?? 0) : 1), 0);
}

/**
 * Pure: the first `k` rows, tidied into something that can actually be shown —
 * the trim's own honesty rules, kept out of the fit search's arithmetic.
 *
 *  • a kept TRAILING divider is popped: a `— SHIP —` head whose section was
 *    entirely trimmed away introduces nothing, and directly above the marker it
 *    reads as a heading FOR the marker;
 *  • the `+n MORE` count is the REAL lines dropped, dividers excluded — the
 *    panel must never claim to be hiding a separator.
 */
export function trimmedBoonRows(rows: readonly TooltipBoonRow[], k: number): TooltipBoonRow[] {
  const kept = rows.slice(0, k);
  while (kept.length > 0 && kept[kept.length - 1].divider) kept.pop();
  const hidden = boonLineCount(rows) - boonLineCount(kept);
  return hidden > 0 ? [...kept, moreBoonsRow(hidden)] : kept;
}

/**
 * Pure: the accrued rows a panel can actually SHOW (amendment 47 — the tooltip's
 * half of the container-fit law). Keeps as many rows as fit, in fit order, and
 * spends the last row on a `◆ +n MORE` marker when anything had to go, so the
 * panel never lies about the size of the build. Returns the whole list whenever
 * it fits — the trim is the exception, not the design. `maxPanelH` is the height
 * budget to fit inside (see tooltipMetrics).
 */
export function fitBoonRows(model: TooltipModel, maxPanelH = TOOLTIP_MAX_PANEL_H): readonly TooltipBoonRow[] {
  for (let k = model.boons.length; k > 0; k -= 1) {
    const boons = k === model.boons.length ? model.boons : trimmedBoonRows(model.boons, k);
    if (tooltipMetrics({ ...model, boons }, maxPanelH).overflow <= 0) return boons;
  }
  return [];
}

/**
 * What ONE frame's tooltip actually paints — the model's arithmetic reconciled
 * with the two things only the renderer knows: how tall the description text
 * MEASURED, and how tall the screen really is.
 *
 * The offsets are relative to the panel's top-left, so the placement (which
 * needs `panelH`) can be resolved after this.
 */
export interface TooltipRenderGeom {
  /** The rows to draw — model.boons, or a shorter list when the real viewport
   *  is tighter than the design floor the model was fitted against. */
  boons: readonly TooltipBoonRow[];
  panelH: number;
  /** Top of the description block, from the panel's top edge. */
  descDy: number;
  /** Top of the boons block, from the panel's top edge. */
  boonsDy: number;
}

/**
 * Pure: that reconciliation (amendment 47, the render half).
 *
 * The MODEL stays the fit-pin authority — tooltipMetrics is what the catalog
 * walk proves — but a model is an upper bound on width and a nominal on height,
 * and the panel is painted at real pixels on a real screen. Two things can
 * therefore differ from the pin, and both would otherwise draw past a boundary:
 *
 *  • `measuredDescH`: Pixi wrapped the description to more height than the mono
 *    model predicted. The boons block is placed below the LARGER of the two and
 *    the panel grows by the difference, so the description can never run under
 *    the build list.
 *  • `roomAboveH`: the clear water ABOVE the hovered square is shorter than the
 *    design floor's allowance (a small window, a high UI scale, a belt square
 *    that sits lower than the weapon row). The panel is clamped to what that
 *    space allows and the rows are re-trimmed against the smaller budget — the
 *    same `+n MORE` grammar, just tighter.
 *
 *    THE ROOM ABOVE, NOT THE SCREEN (review gate, cycle 141). This used to be
 *    `screenH - 2*margin`, which at the 1280x614 floor let the tallest build
 *    model a 570px panel that `tooltipPlacement` then clamped to the top margin
 *    — painting straight over the hovered square, the other eight slots and both
 *    globes. The panel hangs ABOVE the square by construction, so the square's
 *    own clearance is the only budget that can keep that promise, and the screen
 *    clamp is subsumed by it (the bar is `floor` px off the viewport's edge).
 *
 * Growth from measurement is taken out of the row budget FIRST, so the two fixes
 * cannot fight: whatever the description costs, the panel still fits its space.
 */
export function tooltipRenderGeom(model: TooltipModel, measuredDescH: number, roomAboveH: number): TooltipRenderGeom {
  const T = TIP_TYPE;
  const maxPanelH = Math.min(TOOLTIP_MAX_PANEL_H, roomAboveH);
  const modelledDescH = tooltipMetrics(model).descLines * T.descLineHeight;
  const excess = Math.max(0, measuredDescH - modelledDescH);
  const budget = maxPanelH - excess;
  const fitted = tooltipMetrics(model, budget).overflow <= 0 ? model.boons : fitBoonRows(model, budget);
  const m = tooltipMetrics({ ...model, boons: fitted }, budget);
  const descDy = H.tooltip.pad + T.headLineHeight * 2 + T.nameGap + T.descGap;
  return {
    boons: fitted,
    panelH: m.height + excess,
    descDy,
    boonsDy: descDy + Math.max(modelledDescH, measuredDescH) + T.boonsGap,
  };
}

/** Where the tooltip panel sits, and where its pointer notch tips down. */
export interface TooltipPlacement {
  x: number;
  y: number;
  /** Notch tip's screen x, on the panel's BOTTOM edge. */
  notchX: number;
}

/**
 * Pure: the panel ABOVE the hovered square (Story 8.6), horizontally centred on
 * it and clamped so it never leaves the viewport on any edge.
 *
 * ABOVE, NOT FLANKING. The old stack sat at the screen's left edge, so a panel
 * could flank it right and sit over open water. The bar is CENTRED at the foot
 * of the screen: a flanking panel would cover the globes or the belt — i.e. the
 * HUD would hide the HUD — while the space directly above the bar is empty by
 * construction. Nothing else renders there: epic-8 amendment 38 moved the storm
 * warning and the victim tells UNDER the top-centre chrome bar precisely because
 * this panel reaches across that space on every hover.
 *
 * THE CLAMPS ARE BELT AND BRACES, NOT THE FIT (review gate, cycle 141): the
 * panel is trimmed to the room above the square before it gets here
 * (`tooltipFrame`), so the top clamp can no longer pull a too-tall panel down
 * over the square it points at.
 *
 * `gap` is measured from the SQUARE, not from the chip, so the panel's foot
 * reads as pointing at the thing it describes.
 */
export function tooltipPlacement(square: Rect, panelH: number, screenW: number, screenH: number): TooltipPlacement {
  const t = H.tooltip;
  const cx = square.x + square.w / 2;
  const maxX = Math.max(t.margin, screenW - t.margin - t.width);
  const x = Math.min(maxX, Math.max(t.margin, cx - t.width / 2));
  const maxY = Math.max(t.margin, screenH - t.margin - panelH);
  const y = Math.min(maxY, Math.max(t.margin, square.y - t.gap - panelH));
  const notchX = Math.min(x + t.width - t.notch - 2, Math.max(x + t.notch + 2, cx));
  return { x, y, notchX };
}

/**
 * Pure: ONE frame's whole tooltip — the geometry and the placement, composed in
 * the same order the renderer needs them (the placement needs `panelH`, which
 * the geometry resolves). The Pixi shell does nothing else to them, which is
 * what makes the pair testable without a canvas.
 */
export function tooltipFrame(
  model: TooltipModel,
  measuredDescH: number,
  square: Rect,
  screenW: number,
  screenH: number,
): { geom: TooltipRenderGeom; place: TooltipPlacement } {
  // THE HEIGHT BUDGET IS THE ROOM ABOVE THE SQUARE (review gate, cycle 141) —
  // the clear water between the top margin and the panel's own `gap` over the
  // thing it points at. Trimming against the SCREEN instead let the tallest
  // build model a panel taller than that space and land on the bar.
  const roomAbove = square.y - H.tooltip.gap - H.tooltip.margin;
  const geom = tooltipRenderGeom(model, measuredDescH, roomAbove);
  return { geom, place: tooltipPlacement(square, geom.panelH, screenW, screenH) };
}

// --- Pixi shell -----------------------------------------------------------------

// EVERY size here is the BAR's (CLIENT_CONFIG.hudBar), read literally off the
// ratified mock (epic-8 amendment 31): the July ~1.6x micro lift applies to the
// old corners, not to this surface. The one thing that moves with the UI setting
// is the 9px register, which counter-scales through `microScale` (ruling 2) so a
// chip or tier glyph never renders under the mono floor.

/** Key chip glyph — mock `.kc { font: 9px var(--mono) }`, muted text on a muted
 *  hairline; the SELECTED chip overrides fill + weight (see drawChip). */
const CHIP_STYLE = { fontFamily: MONO, fontSize: B.type.chip, fill: C.textMuted, letterSpacing: 0 } as const;
/** Tier numeral — mock `.tier { font: 600 9px var(--mono); letter-spacing: .04em }`. */
const TIER_STYLE = { fontFamily: MONO, fontSize: B.type.tier, fontWeight: '600', fill: C.phosphor, letterSpacing: B.type.tier * 0.04 } as const;
/** Ammo badge digit — mock `.badge { font: 600 10px var(--mono) }`, its own
 *  register in the bar's type block. NOT one of the 9px ones: 10 x 0.9 = 9
 *  clears the mono floor unaided, so it does not counter-scale (`microScale`
 *  covers the 9px registers ONLY — ruling 2). */
const BADGE_STYLE = { fontFamily: MONO, fontSize: B.type.badge, fill: C.phosphor, letterSpacing: 0 } as const;
/** The cooldown/ACTIVE numeral — mock `.cd { font: 600 18px var(--mono) }` with
 *  its `text-shadow: 0 0 6px` black halo, which is what keeps the numeral
 *  legible over BOTH the cleared and the darkened halves of the wipe. The halo
 *  reads the `void` token rather than a literal black (UX-DR76). */
const NUMERAL_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.wipe,
  fontWeight: '600',
  fill: C.textPrimary,
  letterSpacing: B.type.wipe * 0.02,
  dropShadow: { color: C.void, alpha: 1, blur: W.shadowBlur, distance: 0, angle: 0 },
} as const;

// Every tooltip style takes its size AND its explicit line-height from TIP_TYPE
// — the register tooltipMetrics() measures with — so the modelled panel height
// IS the painted one (the refit card's model-equals-DOM discipline).
const TIP_NAME_STYLE = {
  fontFamily: MONO,
  fontSize: TIP_TYPE.nameSize,
  fill: C.textPrimary,
  letterSpacing: TIP_TYPE.nameLetterSpacing,
  lineHeight: TIP_TYPE.headLineHeight,
} as const;
const TIP_INTERACTION_STYLE = {
  fontFamily: MONO,
  fontSize: TIP_TYPE.interactionSize,
  fill: C.amber,
  letterSpacing: TIP_TYPE.interactionLetterSpacing,
  lineHeight: TIP_TYPE.headLineHeight,
} as const;
const TIP_DESC_STYLE = {
  fontFamily: DISPLAY,
  fontSize: TIP_TYPE.descSize,
  fill: C.textPrimary,
  wordWrap: true,
  wordWrapWidth: H.tooltip.width - H.tooltip.pad * 2,
  lineHeight: TIP_TYPE.descLineHeight,
} as const;
/** The accrued-boon block: the PHOSPHOR DATA register (amendment 16 — the same
 *  family as the HDG/KTS readouts; the build readout is instrument data). */
const TIP_BOON_STYLE = {
  fontFamily: MONO,
  fontSize: TIP_TYPE.boonSize,
  fill: C.phosphor,
  letterSpacing: TIP_TYPE.boonLetterSpacing,
  lineHeight: TIP_TYPE.boonLineHeight,
  wordWrap: true,
  wordWrapWidth: H.tooltip.width - H.tooltip.pad * 2,
} as const;

/** Alpha the small square text dims to in the cooling + empty states
 *  (amendment 16: "dim these same colors, never grey"). */
export const DIM_TEXT_ALPHA = 0.7;

/** The four corners of a square, as a closed ring (no chamfer since Story 8.6). */
function squarePoints(r: Rect): PolyPoint[] {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}

/** Inflate an outline outward from the square's center (the glow rings). */
function inflate(pts: PolyPoint[], r: Rect, px: number): PolyPoint[] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const k = (r.w / 2 + px) / (r.w / 2);
  return pts.map((p) => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }));
}

/** Pure: the smallest box containing both dim groups — the rank-wide fit
 *  frame's target (the slot run plus the belt, which is exactly what dims). */
function groupsBounds(layout: HudBarLayout): Rect {
  const x = Math.min(...layout.dimGroups.map((r) => r.x));
  const y = Math.min(...layout.dimGroups.map((r) => r.y));
  const right = Math.max(...layout.dimGroups.map((r) => r.x + r.w));
  const bottom = Math.max(...layout.dimGroups.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** One square's Pixi text objects (created once, diffed on assignment). */
interface SlotText {
  chip: Text;
  badge: Text;
  tier: Text;
  numeral: Text;
}

/** The memoized tooltip model + the inputs it was built from (see cachedModel). */
interface TooltipCache {
  slot: number;
  id: EquipmentId | null;
  stats: EffectiveStats;
  boons: readonly string[];
  model: TooltipModel | null;
}

/** One shared empty list, so a build with nothing fitted keeps a stable identity
 *  across frames instead of allocating a fresh `[]` the cache can never match. */
const EMPTY_BOONS: readonly string[] = [];

/** Pure: are these the same accrued list, for cache purposes? Identity first (the
 *  usual case — `you.cards` is the wire array, replaced only when it changes),
 *  then length + last id, which is what a fit CAN only ever change (boons append,
 *  never reorder or drop). */
function sameBoonList(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a[a.length - 1] === b[b.length - 1]);
}

/**
 * THE SLOT ROW + THE BELT FRAME on the HUD bar.
 *
 * DIM: the whole of this object IS the bar's two dim groups (the five weapon
 * squares and the framed belt — ruling 9), so the dim is one alpha on this
 * root, driven by `view.dim` at `CLIENT_CONFIG.hudBar.dimAlpha`. The composing
 * `HudBar` therefore has nothing to do for the dim beyond passing the flag
 * through; the globes and the XP strip, which stay at full, are its own
 * children and are never touched by it.
 */
export class Hotbar {
  private readonly root = new Container();
  private readonly gfx = new Graphics();
  private readonly slotText: SlotText[];
  private readonly tipRoot = new Container();
  private readonly tipGfx = new Graphics();
  private readonly tipName: Text;
  private readonly tipInteraction: Text;
  private readonly tipDesc: Text;
  private readonly tipBoons: Text;
  private readonly lastText: string[] = [];
  private hover: HoverState = NO_HOVER;
  private cachedLayout: HudBarLayout | null = null;
  /** INTEGRATED ACTIVE-breath phase + the clock it last advanced at (the
   *  litZones ember precedent — accumulated per frame, never absolute time). */
  private breathPhase = 0;
  private lastBreathSec: number | null = null;
  private tipCache: TooltipCache | null = null;
  /** This frame's 9px counter-scale (ruling 2) — 1 at 100% and 125% UI scale. */
  private micro = 1;

  constructor(hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gfx);
    this.slotText = Array.from({ length: SLOT_COUNT }, () => this.buildSlotText());
    this.tipName = new Text({ text: '', style: TIP_NAME_STYLE });
    this.tipInteraction = new Text({ text: '', style: TIP_INTERACTION_STYLE });
    this.tipDesc = new Text({ text: '', style: TIP_DESC_STYLE });
    this.tipBoons = new Text({ text: '', style: TIP_BOON_STYLE });
    this.tipRoot.addChild(this.tipGfx, this.tipName, this.tipInteraction, this.tipDesc, this.tipBoons);
    this.tipRoot.visible = false;
    this.root.addChild(this.tipRoot);
  }

  private buildSlotText(): SlotText {
    const chip = new Text({ text: '', style: CHIP_STYLE });
    chip.anchor.set(0.5);
    const badge = new Text({ text: '', style: BADGE_STYLE });
    badge.anchor.set(0.5);
    const tier = new Text({ text: '', style: TIER_STYLE });
    tier.anchor.set(1, 1);
    const numeral = new Text({ text: '', style: NUMERAL_STYLE });
    numeral.anchor.set(0.5);
    this.root.addChild(chip, badge, tier, numeral);
    return { chip, badge, tier, numeral };
  }

  /** The layout this frame used — null while hidden (hit-tests must miss). */
  get layout(): HudBarLayout | null {
    return this.cachedLayout;
  }

  /** The slot under a screen point, or null while the bar isn't rendering. */
  slotAt(p: ScreenPoint): number | null {
    return slotAtPoint(p, this.cachedLayout);
  }

  /**
   * Hide the slot row (death / spectate / reveal / return to port — and the
   * forceSnap pose gap after a reconnect or a P toggle, where no frame renders
   * at all). DROPS the cached layout, so a hidden row routes no clicks: the gate
   * misses and the press falls through to the water exactly as it would with no
   * bar on screen.
   */
  hide(): void {
    this.root.visible = false;
    this.tipRoot.visible = false;
    this.hover = NO_HOVER;
    this.cachedLayout = null;
  }

  /**
   * Render one frame at the bar's geometry. `cursor` is the pointer position, or
   * null when the pointer has left the window (no hover then); `nowMs` is a
   * monotonic clock (performance.now) for the dwell delay; `uiScale` is the UI
   * setting, for the 9px counter-scale alone.
   */
  update(
    view: HotbarView,
    layout: HudBarLayout,
    cursor: ScreenPoint | null,
    nowMs: number,
    uiScale = 1,
  ): void {
    this.root.visible = true;
    this.root.alpha = view.dim ? B.dimAlpha : 1;
    this.micro = microScale(uiScale);
    this.cachedLayout = layout;
    const models = slotViewModels(view);
    this.gfx.clear();
    this.drawBeltFrame(layout);
    const breath = activeBreath(this.advanceBreath(view.nowSec), motionScaled(ACTIVE_PULSE_AMP, view.motion ?? 'full'));
    for (const m of models) this.drawSlot(m, layout, breath);
    this.drawFitFrame(view, layout);
    this.updateTooltip(view, layout, models, cursor, nowMs);
  }

  /** Advance the shared ACTIVE-breath phase to `nowSec` and return it. A frame
   *  with no clock (a caller from before 2.9) holds the phase where it is. */
  private advanceBreath(nowSec: number | undefined): number {
    if (nowSec === undefined) return this.breathPhase;
    const dt = this.lastBreathSec === null ? 0 : nowSec - this.lastBreathSec;
    this.lastBreathSec = nowSec;
    this.breathPhase = advanceBreathPhase(this.breathPhase, dt);
    return this.breathPhase;
  }

  /**
   * THE BELT FRAME (ruling 5) — one 1px silver .2 rectangle around the four
   * consumable squares AND their chips (the mock's `.belt` encloses the whole
   * `.sw` column). It is the only grouping mark on the bar: the belt is a
   * different KIND of slot (stock you spend, not kit you fire), and the frame is
   * what says so without a word.
   */
  private drawBeltFrame(layout: HudBarLayout): void {
    const b = layout.belt;
    this.gfx.rect(b.x, b.y, b.w, b.h).stroke({ width: B.lineW, color: C.silver, alpha: 0.2 });
  }

  private drawSlot(m: SlotViewModel, layout: HudBarLayout, breath: number): void {
    const square = layout.squares[m.slot];
    const breathed = breathedSkin(m.state, motionIntensity(settings.current.motion), breath);
    const skin = m.degraded ? degradedSkin(breathed) : breathed;
    // THE COOLING SANDWICH (the mock's own stacking order): the .55 scrim under
    // the icon, the .86 dark region OVER it — the clock takes the icon down with
    // it as it uncovers — and then the numeral, tier numeral and badge on top of
    // both. Nothing that carries a NUMBER is ever dimmed by the wipe.
    const cooling = m.state === 'cooling';
    if (cooling) drawWipeScrim(this.gfx, square);
    this.drawBox(m, square, skin);
    this.drawIcon(m, square, skin);
    if (cooling) drawWipeDark(this.gfx, square, m.coolFrac);
    this.drawTier(m, square);
    this.drawBadge(m, layout);
    this.drawChip(m, layout);
    this.drawNumeral(m, square);
  }

  /**
   * The RANK-WIDE fit pulse (amendment 51): a shipwide INTEL/SHIP boon belongs
   * to no single slot, so the whole row takes the flash instead of an arbitrary
   * weapon claiming it. Same 80ms/300ms register as the slot pulse — the
   * caller's DeniedPulse owns the timing; this only paints the frame.
   */
  private drawFitFrame(view: HotbarView, layout: HudBarLayout): void {
    if (!(view.fitFrame ?? false) || !motionAllowed(view.motion ?? 'full')) return;
    const b = groupsBounds(layout);
    const pad = FIT_PULSE_PX;
    this.gfx
      .rect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
      .stroke({ width: 1.5, color: C.phosphorBright, alpha: fitFrameAlpha(view.fitFrameDegraded ?? false) });
  }

  private drawBox(m: SlotViewModel, square: Rect, skin: SlotSkin): void {
    const g = this.gfx;
    const pts = squarePoints(square);
    const flat = pts.flatMap((p) => [p.x, p.y]);
    if (skin.washAlpha > 0) g.poly(flat).fill({ color: skin.wash, alpha: skin.washAlpha });
    if (skin.dashed) traceDashed(g, pts);
    else g.poly(flat);
    g.stroke({ width: skin.borderWidth, color: skin.border, alpha: skin.borderAlpha });
    this.drawGlow(pts, square, skin);
    if (m.fitFlash) this.drawFitPulse(pts, square);
  }

  /** THE FIT FLASH (amendment 51): one ≤80ms phosphor ring outside the square
   *  whose family just took a boon — the ACTIVATED pop's register applied to
   *  the economy channel, deliberately OUTSIDE the box so it reads as something
   *  arriving ON the slot rather than the slot activating. */
  private drawFitPulse(pts: PolyPoint[], square: Rect): void {
    for (let i = 1; i <= 2; i++) {
      const ring = inflate(pts, square, (FIT_PULSE_PX * i) / 2);
      this.gfx
        .poly(ring.flatMap((p) => [p.x, p.y]))
        .stroke({ width: 1.5, color: C.phosphorBright, alpha: 0.55 / i });
    }
  }

  /** Layered low-alpha rings approximating the DESIGN.md box glow. */
  private drawGlow(pts: PolyPoint[], square: Rect, skin: SlotSkin): void {
    if (skin.glowPx <= 0) return;
    for (let i = 1; i <= 3; i++) {
      const ring = inflate(pts, square, (skin.glowPx * i) / 3);
      this.gfx
        .poly(ring.flatMap((p) => [p.x, p.y]))
        .stroke({ width: 1.5, color: skin.border, alpha: (skin.glowAlpha * (4 - i)) / 4 });
    }
  }

  /** The equipment glyph — 28px in a weapon square, 22px in a belt one (mock
   *  `.slot > svg` / `.belt .slot > svg`), dimmed to `wipe.iconAlpha` under a
   *  running wipe and at FULL alpha while an ability window is ACTIVE. */
  private drawIcon(m: SlotViewModel, square: Rect, skin: SlotSkin): void {
    const cx = square.x + square.w / 2;
    const cy = square.y + square.h / 2;
    const size = isBeltSlot(m.slot) ? B.beltIcon : B.icon;
    const alpha = m.state === 'cooling' ? W.iconAlpha : skin.iconAlpha;
    const style = { width: 1.5, color: skin.icon, alpha };
    if (m.id === null) drawDashGlyph(this.gfx, cx, cy, size * 0.5, style);
    else drawEquipmentIcon(this.gfx, m.id, cx, cy, size, style);
  }

  /**
   * The TIER numeral, bottom-right, on the ABSOLUTE ramp — and ABOVE the wipe,
   * because what a weapon IS outranks when it is next ready: a player choosing a
   * target reads the tier, a player waiting reads the clock, and the clock is
   * already the biggest thing on the square.
   */
  private drawTier(m: SlotViewModel, square: Rect): void {
    const t = this.slotText[m.slot].tier;
    const text = tierNumeral(m.tier);
    t.visible = text !== '';
    if (text === '') return;
    this.setFill(t, tierColor(m.tier));
    t.alpha = dimAlphaFor(m);
    t.scale.set(this.micro);
    t.position.set(square.x + square.w - B.tierInset.right, square.y + square.h - B.tierInset.bottom);
    this.setText(t, text, m.slot * 4);
  }

  /** Ammo badge — a 16px scrim square overhanging the square's top-right corner,
   *  ONLY on pools larger than one round (a belt square's rides 1px tighter).
   *  Its box is `badgeRect`'s, the same one the hit-test swallows. */
  private drawBadge(m: SlotViewModel, layout: HudBarLayout): void {
    const t = this.slotText[m.slot].badge;
    t.visible = m.badge !== null;
    if (m.badge === null) return;
    const b = badgeRect(layout, m.slot);
    this.gfx.rect(b.x, b.y, b.w, b.h).fill({ color: C.cardScrim, alpha: 0.95 });
    this.gfx.rect(b.x, b.y, b.w, b.h).stroke({ width: B.lineW, color: C.phosphor, alpha: 0.5 });
    t.alpha = dimAlphaFor(m);
    t.scale.set(1); // a 10px register: it clears the mono floor without help
    t.position.set(b.x + b.w / 2, b.y + b.h / 2);
    this.setText(t, m.badge, m.slot * 4 + 1);
  }

  /**
   * The key chip, centred BELOW its square: a widening 16px-tall mono box
   * (amendment 33 — which is what lets slot 1 spell `Shift`).
   *
   * THE GUN'S CHIP IS A GHOST: the gun is keyless and permanently selected, but
   * its column still owes the row a chip-height, or the five weapon squares
   * would not share one baseline with each other. So the box is laid out and
   * measured exactly like the others and simply never painted (the mock's
   * `.kc.ghost`, which sets border and colour transparent for the same reason).
   */
  private drawChip(m: SlotViewModel, layout: HudBarLayout): void {
    const t = this.slotText[m.slot].chip;
    const ghost = m.keyGlyph === '';
    const box = chipRect(layout, m.slot, this.micro);
    if (!ghost) this.paintChipBox(m, box);
    t.visible = !ghost;
    this.setFill(t, m.selected ? C.void : chipTextColor(m));
    this.setWeight(t, m.selected ? '600' : '400');
    t.alpha = m.selected ? 1 : dimAlphaFor(m);
    t.scale.set(this.micro);
    t.position.set(box.x + box.w / 2, box.y + box.h / 2);
    this.setText(t, m.keyGlyph, m.slot * 4 + 2);
  }

  /** The chip's box: filled amber while SELECTED (the selection channel — a
   *  shape+fill change, not a hue swap), a denied-red hairline while denied, a
   *  muted hairline otherwise. */
  private paintChipBox(m: SlotViewModel, box: Rect): void {
    const g = this.gfx;
    if (m.selected) {
      g.rect(box.x, box.y, box.w, box.h).fill({ color: C.amber, alpha: 1 });
      return;
    }
    const denied = m.state === 'denied';
    g.rect(box.x, box.y, box.w, box.h)
      .stroke({ width: B.lineW, color: denied ? C.denied : C.textMuted, alpha: denied ? 1 : 0.55 });
  }

  /** The ONE centred numeral: the ACTIVE window's seconds, or the reload's. */
  private drawNumeral(m: SlotViewModel, square: Rect): void {
    const t = this.slotText[m.slot].numeral;
    const text = slotNumeral(m);
    t.visible = text !== '';
    if (text === '') return;
    t.position.set(square.x + square.w / 2, square.y + square.h / 2);
    this.setText(t, text, m.slot * 4 + 3);
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

  /** ...and for the weight (the selected chip's glyph goes 600). */
  private setWeight(t: Text, weight: '400' | '600'): void {
    if (t.style.fontWeight === weight) return;
    t.style.fontWeight = weight;
  }

  private updateTooltip(
    view: HotbarView,
    layout: HudBarLayout,
    models: SlotViewModel[],
    cursor: ScreenPoint | null,
    nowMs: number,
  ): void {
    // A null cursor is "the pointer isn't in the window" (input/mouse.ts's
    // presence flag): the last known position must not keep a tooltip alive.
    this.hover = nextHover(this.hover, cursor === null ? null : slotAtPoint(cursor, layout), nowMs);
    const slot = this.hover.slot;
    const model = slot === null ? null : this.cachedModel(slot, models[slot].id, view);
    if (!shouldShowTooltip(this.hover, nowMs, view.dim, model !== null) || slot === null || model === null) {
      this.tipRoot.visible = false;
      return;
    }
    this.tipRoot.visible = true;
    this.drawTooltip(model, layout, slot);
  }

  /**
   * The hovered slot's tooltip model, rebuilt only when its INPUTS change.
   *
   * Pure perf, no behavior: tooltipModel walks the catalog, formats an effect
   * line per accrued row and then runs the fit search — which re-measures the
   * whole panel once per row it has to drop — and a held hover asks for the same
   * answer every frame for as long as the pointer rests there. The key is the
   * three inputs the model is a function of: the slot's equipment, the accrued
   * list (by identity, falling back to length + last id for a caller that
   * rebuilds the array each frame), and the effective stats the effect lines
   * read (swapped as a whole object by applyOwnStats, so identity is exact).
   */
  private cachedModel(slot: number, id: EquipmentId | null, view: HotbarView): TooltipModel | null {
    const boons = view.cards ?? EMPTY_BOONS;
    const c = this.tipCache;
    if (c && c.slot === slot && c.id === id && c.stats === view.stats && sameBoonList(c.boons, boons)) {
      return c.model;
    }
    const model = tooltipModel(slot, id, view.stats, boons);
    this.tipCache = { slot, id, stats: view.stats, boons, model };
    return model;
  }

  /**
   * Pure: the viewport the panel is clamped against, recovered from the layout.
   *
   * The bar hangs from the FLOOR by construction (`hudBarLayout`), so the screen
   * height is exactly the bar's bottom plus the floor gap, and the width is its
   * centred left edge doubled plus its own width (to the rounding the centring
   * already did). Recovering it here is what lets `update` take the layout and
   * nothing else — one geometry input, no chance of a stale second one.
   */
  private screenOf(layout: HudBarLayout): { w: number; h: number } {
    const bar = layout.bar;
    return { w: bar.x * 2 + bar.w, h: bar.y + bar.h + B.floor };
  }

  /**
   * Near-opaque panel + 1px silver .4 border + a pointer notch on its BOTTOM
   * edge, laid out at the offsets tooltipRenderGeom resolves — the MODEL's
   * arithmetic (the amendment-47 pin measures the same functions) reconciled
   * with the description's MEASURED height and the REAL viewport. An empty
   * BOONS block still renders as ABSENCE: no divider, no rows, no placeholder.
   */
  private drawTooltip(model: TooltipModel, layout: HudBarLayout, slot: number): void {
    const t = H.tooltip;
    const T = TIP_TYPE;
    const screen = this.screenOf(layout);
    this.setText(this.tipName, model.name, 100);
    this.setText(this.tipInteraction, model.interaction, 101);
    // The description's text must be assigned BEFORE it is measured: the height
    // this reads is the one Pixi just wrapped, not last frame's.
    this.setText(this.tipDesc, model.description, 102);
    const { geom, place } = tooltipFrame(model, this.tipDesc.height, layout.squares[slot], screen.w, screen.h);
    this.setText(this.tipBoons, boonBlockText(geom.boons), 103);
    this.tipBoons.visible = geom.boons.length > 0;
    const x = place.x + t.pad;
    this.tipName.position.set(x, place.y + t.pad);
    this.tipInteraction.position.set(x, place.y + t.pad + T.headLineHeight + T.nameGap);
    this.tipDesc.position.set(x, place.y + geom.descDy);
    this.tipBoons.position.set(x, place.y + geom.boonsDy);
    this.paintTooltipPanel(place, geom.panelH);
  }

  private paintTooltipPanel(place: TooltipPlacement, panelH: number): void {
    const t = H.tooltip;
    const g = this.tipGfx;
    g.clear();
    g.rect(place.x, place.y, t.width, panelH).fill({ color: C.panel, alpha: 0.97 });
    g.rect(place.x, place.y, t.width, panelH).stroke({ width: 1, color: C.silver, alpha: 0.4 });
    const edge = place.y + panelH;
    g.moveTo(place.notchX - t.notch, edge)
      .lineTo(place.notchX, edge + t.notch)
      .lineTo(place.notchX + t.notch, edge)
      .fill({ color: C.panel, alpha: 0.97 });
  }
}

/** The chip glyph's colour when it is not the selected (amber-filled) one: the
 *  denied red while a denial is showing, the muted register otherwise. */
function chipTextColor(m: SlotViewModel): number {
  return m.state === 'denied' ? C.denied : C.textMuted;
}
