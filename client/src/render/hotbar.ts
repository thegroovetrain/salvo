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
//   active      (amendment 48, Story 2.9) the ability WINDOW is running: a
//               persistent breathing phosphor outline (≥2s cycle, capped by
//               settings.pulseCapHz) + an `ACTIVE ns` countdown in the
//               quick-info line. Outranks cooling; the cool track still draws
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
  BOON_CATALOG,
  EQUIPMENT_CATEGORY,
  SLOT_COUNT,
  boonStackCount,
  type EffectiveStats,
  type EquipmentId,
  type WeaponAmmo,
} from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionAllowed, motionIntensity, motionScaled, settings, type MotionLevel } from '../settings/store.js';
import type { ScreenPoint } from '../input/mouse.js';
import { tracePerimeter, traceDashed } from '../util/poly.js';
import { boonEffectLine, boonName } from '../ui/boonCopy.js';
import { monoWrapLines } from '../ui/refitCardFit.js';
import { drawEquipmentIcon, drawPlusGlyph } from './equipmentIcons.js';
import { KEY_CHIP_STYLE, drawKeyChipBox, keyChipGlyphColor } from './keyChip.js';
import {
  SHIPWIDE_CATEGORIES,
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
 * ACTIVE OUTRANKS COOLING (amendment 48). The two genuinely coexist — a decoy
 * buoy floats out its whole window while its rack reloads, and the boost's
 * cooldown starts the instant the throttle opens — so this is a real decision,
 * not a hypothetical: while the window is RUNNING it is the payoff, and the
 * cooldown is the smaller story. Nothing is lost by the ordering, because the
 * conic cool track keeps rendering underneath the ACTIVE skin and the CD figure
 * keeps counting in the quick-info line beside the ACTIVE countdown.
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
 * Pure: trimmed damage for the quick-info line — integers bare, everything else
 * to ONE decimal (the ui/boonCopy num() idiom, the one number grammar the refit
 * card already prints).
 *
 * AMENDMENT 47 (the container-fit law) made this mandatory rather than tidy.
 * `applyStatEffect` folds `value * mult + add` with no rounding, so PROP-FOULING
 * MINES (×0.6) landing after two RDX FILLER cards produced a genuine
 * `31.799999999999997`. That printed `DMG 31.799999999999997 · CD 8s` — 32
 * characters at 16px mono = 332.8px in a 268px label column, running 64.8px
 * past the row's own clickable footprint and out over the open water.
 */
export function fmtDamage(hp: number): string {
  const tenths = Math.round(hp * 10) / 10;
  return Number.isInteger(tenths) ? tenths.toFixed(0) : tenths.toFixed(1);
}

/**
 * Pure: the quick-info line under a slot's name (amendment 13, literal): a
 * WEAPON reads `DMG n · CD ns`, an ABILITY reads `CD ns` — the split is
 * EQUIPMENT_IS_WEAPON, nothing else. PIN FLIPPED in Story 2.8 (amendment 45):
 * the mine became a click-aimed WEAPON, so it now carries the DMG figure it
 * used to hide in the tooltip; the damage VALUE is stat-driven (effective
 * stats), so a filler stack moves it. While the slot is cooling the CD figure
 * is the live remaining time, counting down whether or not the slot is
 * selected.
 */
export function quickInfoLine(
  info: EquipmentInfo,
  reloadMsLeft: number,
  activeMsLeft = 0,
  boons = 0,
): string {
  const cd = reloadMsLeft > 0 ? fmtRemaining(reloadMsLeft) : fmtSeconds(info.reloadMs);
  const core = info.isWeapon && info.damage !== null ? `DMG ${fmtDamage(info.damage)} · CD ${cd}` : `CD ${cd}`;
  return `${activeTag(activeMsLeft)}${core}${boonMark(boons)}`;
}

/**
 * Pure: the ACTIVE window's countdown prefix (amendment 48's TEXT half — the
 * breathing outline is the shape half, and neither carries the state alone).
 * Always rendered while the window runs, at EVERY motion level: the outline can
 * stop moving for accessibility, but the seconds are information.
 */
export function activeTag(activeMsLeft: number): string {
  return activeMsLeft > 0 ? `ACTIVE ${fmtWindow(activeMsLeft)} · ` : '';
}

/**
 * Pure: WHOLE remaining seconds of a running ability window, floored at 1s so a
 * live window never reads "0s". Deliberately coarser than the reload
 * countdown's tenths (fmtRemaining): a window is a span you plan inside, not a
 * frame-accurate gate, and — amendment 47 — the two countdowns share ONE label
 * column with the DMG/CD figures and the `◆n` mark. Tenths here cost two glyphs
 * the column does not have.
 */
export function fmtWindow(ms: number): string {
  return `${Math.max(1, Math.ceil(ms / 1000))}s`;
}

/**
 * Pure: the `◆n` accrued-boon mark that closes the quick-info line — the
 * COMPRESSION of the tooltip's full list into the always-visible row (the
 * diamond is the same mark the fit toast and the tooltip rows use, so one glyph
 * means "boon" everywhere).
 *
 * CLAMPED at 9 (the xpRail chipLabel precedent, amendment 47): the count shares
 * a fixed label column with the DMG/CD figures, and past 9 the exact number is
 * not the information — the tooltip has the list. '' at zero: a slot with no
 * boons shows ABSENCE, never `◆0`.
 */
export function boonMark(n: number): string {
  if (n <= 0) return '';
  return ` ◆${n > 9 ? '9+' : n}`;
}

/**
 * Pure: the accrued boon ids a SLOT owns, in fit order with repeats intact.
 * That is its equipment's own catalog category — plus, for the GUN, the two
 * shipwide categories (see equipmentInfo.SHIPWIDE_CATEGORIES): the gun is the
 * permanent top slot, so it doubles as the ship card rather than smearing
 * INTEL/SHIP lines across every weapon's tooltip.
 *
 * Fail-closed on the catalog (Object.hasOwn): a junk id on the wire is dropped
 * rather than rendering a row nothing can explain.
 */
export function slotBoonIds(id: EquipmentId, boons: readonly string[]): string[] {
  const own = EQUIPMENT_CATEGORY[id];
  const wanted = id === 'gun' ? [own, ...SHIPWIDE_CATEGORIES] : [own];
  return boons.filter((b) => Object.hasOwn(BOON_CATALOG, b) && wanted.includes(BOON_CATALOG[b].category));
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
  /** A boon just landed on this slot's family: the ≤80ms phosphor fit pulse is
   *  showing THIS frame (already motion-gated — see slotViewModel). */
  fitFlash: boolean;
  /** Accrued boons on this slot's family (the `◆n` count, unclamped). */
  boonCount: number;
  /** This frame's one-shot on this row is DEGRADED by the aggregate flash budget
   *  (amendment 240): draw the flat mark, not the bloom. Absent = animate. */
  degraded?: boolean;
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
  /** Per-slot: this frame's denied pulse was over the AGGREGATE FLASH BUDGET
   *  (render/flashBudget.ts, amendment 240) and must render DEGRADED — the flat
   *  `motion: 'off'` mark. The denial itself is never suppressed: the budget
   *  degrades, it does not delete. Absent = nothing was over budget. */
  deniedDegraded?: readonly boolean[];
  /** Per-slot activated pop state this frame. */
  activated: readonly boolean[];
  /** The refit modal is open: dim to 38%, slot keys AND clicks suspended. */
  dim: boolean;
  /** Accessibility motion level (Story 2.3) — gates the ACTIVATED pop, the FIT
   *  flash and the glow/breathing amplitude. Defaults to 'full' so existing
   *  callers/tests are unchanged. */
  motion?: MotionLevel;
  /** The own fitted boon ids (OwnShip.boons, repeats intact) — the tooltip's
   *  accrued list and the `◆n` marks. Absent = a build with nothing fitted. */
  boons?: readonly string[];
  /** Per-slot REMAINING ability-window ms (0 = no window running) — the ACTIVE
   *  state's whole input (amendment 48: boost's `boostUntil`, the decoy's own
   *  buoy `until`), resolved against the server clock by the caller. */
  activeMsLeft?: readonly number[];
  /** Per-slot fit pulse this frame: a boon landed on THIS slot's family. */
  fit?: readonly boolean[];
  /** Rank-wide fit pulse: a shipwide (INTEL/SHIP) boon landed, which no single
   *  slot owns — the whole stack flashes once instead (amendment 51). */
  fitFrame?: boolean;
  /** That rank-wide pulse was over the aggregate flash budget: it still draws,
   *  at the flat degraded weight (see drawFitFrame). */
  fitFrameDegraded?: boolean;
  /** Server-clock SECONDS — the ACTIVE outline's breathing phase (the xpRail /
   *  HP rail idiom: one shared clock, integrated phase, never a frame counter). */
  nowSec?: number;
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
  // `degraded: false` is explicit rather than omitted: an unfitted slot holds
  // nothing to deny, so it can never carry a budget verdict, and a total model
  // keeps the flag from reading `undefined` on exactly one row.
  return { slot, id: null, state: 'empty', selected: false, chamfer: false, keyGlyph, name: EMPTY_SLOT_LABEL, quickInfo: '', badge: null, coolFrac: 0, fitFlash: false, boonCount: 0, degraded: false };
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

/**
 * Pure: is this slot's denied pulse DEGRADED this frame (the aggregate flash
 * budget's `'degrade'` verdict — main.ts owns the claim, per slot, against
 * `hotbarSlotKey`)?
 *
 * Deliberately NOT a third `SlotFlags` field: the flags are the STATE latches
 * that decide which state a row is in, and a budget verdict must never be able
 * to change that — a degraded denial is still a denial. It is ANDed with the
 * pulse it describes, because a degrade flag with no denial showing would
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
  // The countdown + conic track belong to the COOLING read: a slot that still
  // has a round shows its full CD, not the timer for the next one.
  const left = cooling ? (a?.reloadMsLeft ?? 0) : 0;
  const flags = slotFlags(view, slot);
  const selected = slot === view.primedSlot;
  const { activeLeft, boonCount, fitFlash } = slotEconomy(view, slot, id);
  return {
    slot,
    id,
    state: slotState(id, flags, cooling, selected, info.isWeapon, activeLeft > 0),
    selected,
    chamfer: !info.isWeapon,
    keyGlyph,
    name: info.name,
    quickInfo: quickInfoLine(info, left, activeLeft, boonCount),
    badge: badgeText(info, a),
    coolFrac: coolFraction(left, info.reloadMs),
    fitFlash,
    boonCount,
    degraded: slotDegraded(view, slot, flags.denied),
  };
}

/**
 * Pure: a slot's Story 2.9 inputs — the running ability window, the accrued
 * count, and this frame's fit pulse. All three are OPTIONAL on the view (a
 * caller from before 2.9 gets exactly the old row back).
 *
 * The fit pulse is pure JUICE — the tooltip row, the `◆n` and the toast all
 * carry the same fact statically — so it gates on the motion level exactly as
 * the ACTIVATED pop does. The window and the count never gate: they are
 * information.
 */
function slotEconomy(
  view: HotbarView,
  slot: number,
  id: EquipmentId,
): { activeLeft: number; boonCount: number; fitFlash: boolean } {
  return {
    activeLeft: Math.max(0, view.activeMsLeft?.[slot] ?? 0),
    boonCount: slotBoonIds(id, view.boons ?? []).length,
    fitFlash: (view.fit?.[slot] ?? false) && motionAllowed(view.motion ?? 'full'),
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
 * the HP rail. The clamp is not decoration: it is the one place a future
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
 * hud.advanceHullPulsePhase, verbatim reasoning). The server clock this rides is
 * an ESTIMATE, and it is re-estimated: an absolute `sin(nowSec · ω)` teleports
 * the outline's alpha the instant that estimate moves, which is exactly the
 * sudden brightness step the photosensitivity cap exists to prevent. Integrating
 * makes the phase continuous through any such correction, so the cap on the RATE
 * is also a cap on how fast the alpha can move.
 */
export function advanceBreathPhase(phase: number, dtSec: number): number {
  const step = Math.min(MAX_BREATH_DT, Math.max(0, dtSec));
  return (phase + ACTIVE_PULSE_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the ACTIVE outline's alpha MULTIPLIER at a breath `phase` (radians —
 * advanceBreathPhase's output), in [1 - 2·amp, 1]. `amp` is the MOTION-SCALED
 * amplitude: `reduced` halves the depth, `off` makes it exactly 1 — a STATIC
 * outline, present and fully legible, which with the always-on countdown is the
 * whole dual-code. Duration is never touched (juice discipline: reduced halves
 * depth, not time).
 */
export function activeBreath(phase: number, amp = ACTIVE_PULSE_AMP): number {
  return 1 - amp + amp * Math.sin(phase);
}

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

/**
 * Pure: the skin a row paints with THIS frame — slotSkin with the ACTIVE
 * breath applied to the outline/bloom alphas. Every other state is returned
 * untouched: only ACTIVE breathes, and only its ALPHA moves (the outline width,
 * the icon and the countdown text hold still, so the state is never carried by
 * the motion).
 */
export function breathedSkin(state: SlotState, motionIntensity: number, breath: number): SlotSkin {
  const skin = slotSkin(state, motionIntensity);
  if (state !== 'active') return skin;
  return { ...skin, borderAlpha: skin.borderAlpha * breath, glowAlpha: skin.glowAlpha * breath };
}

/**
 * Pure: the skin a DEGRADED one-shot paints (the aggregate flash budget's
 * `'degrade'` verdict, amendment 240) — the row's already-ratified
 * `motion: 'off'` keyframe, which is exactly `slotSkin`'s zero-intensity form:
 * the BLOOM is gone and the border, its width, the icon and the wash are
 * byte-identical. The denial therefore keeps its presence, its position and its
 * full weight; what it loses is the sudden halo, i.e. the flash.
 *
 * This is why the budget can bind on a declared-information channel without
 * violating *"removes MOTION, never INFORMATION"*: the degraded state is one the
 * game already ships and any player can already select.
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
 * stack still says "a shipwide boon landed" without contributing another
 * luminance step to a screen already over its 3-per-second floor. It is never
 * skipped: the budget degrades, it does not delete.
 */
export function fitFrameAlpha(degraded: boolean): number {
  return degraded ? FIT_FRAME_ALPHA * CLIENT_CONFIG.flashBudget.degradeAlphaFactor : FIT_FRAME_ALPHA;
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
 * the single-copy lines, where there is no count to print anyway. The
 * "only when needed" contract stands; it is now trivially satisfied, and the
 * label column gets three glyphs back (amendment 47).
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
export function boonRows(id: EquipmentId, boons: readonly string[], stats: EffectiveStats): TooltipBoonRow[] {
  const ids = slotBoonIds(id, boons);
  const own: TooltipBoonRow[] = [];
  const ship: TooltipBoonRow[] = [];
  const seen = new Set<string>();
  for (const b of ids) {
    if (seen.has(b)) continue;
    seen.add(b);
    const row = boonRow(b, boonStackCount(ids, b), stats);
    (SHIPWIDE_CATEGORIES.includes(BOON_CATALOG[b].category) ? ship : own).push(row);
  }
  if (ship.length === 0) return own;
  if (own.length === 0) return ship;
  return [...own, { label: SHIP_DIVIDER_ROW, effect: '', divider: true }, ...ship];
}

/**
 * Pure: the tooltip for a slot, or null when there is nothing to describe
 * (an unfitted slot has no equipment — it shows its own inline label instead).
 * `boons` is the own fitted-boon id list (repeats intact); omitting it yields
 * the pre-2.9 equipment-only panel.
 */
export function tooltipModel(
  slot: number,
  id: EquipmentId | null,
  stats: EffectiveStats,
  boons: readonly string[] = [],
): TooltipModel | null {
  if (id === null) return null;
  const info = equipmentInfo(stats, id);
  const full: TooltipModel = {
    name: info.name.toUpperCase(),
    interaction: interactionLine(slot, id),
    description: info.description,
    boons: boonRows(id, boons, stats),
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
 * than the floor (drawTooltip / tooltipRenderGeom).
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
 *  • `screenH`: the viewport is shorter than TOOLTIP_FLOOR_VIEWPORT_H (a small
 *    window, a high UI scale). The panel is clamped to what the REAL screen
 *    allows and the rows are re-trimmed against that smaller budget — the same
 *    `+n MORE` grammar, just tighter — rather than running off the bottom.
 *
 * Growth from measurement is taken out of the row budget FIRST, so the two fixes
 * cannot fight: whatever the description costs, the panel still fits the screen.
 */
export function tooltipRenderGeom(model: TooltipModel, measuredDescH: number, screenH: number): TooltipRenderGeom {
  const T = TIP_TYPE;
  const maxPanelH = Math.min(TOOLTIP_MAX_PANEL_H, screenH - 2 * H.tooltip.margin);
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
 *  family as the quick-info line and the HDG/KTS readouts; the build readout is
 *  instrument data, not chrome). */
const TIP_BOON_STYLE = {
  fontFamily: MONO,
  fontSize: TIP_TYPE.boonSize,
  fill: C.phosphor,
  letterSpacing: TIP_TYPE.boonLetterSpacing,
  lineHeight: TIP_TYPE.boonLineHeight,
  wordWrap: true,
  wordWrapWidth: H.tooltip.width - H.tooltip.pad * 2,
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
 *  usual case — `you.boons` is the wire array, replaced only when it changes),
 *  then length + last id, which is what a fit CAN only ever change (boons append,
 *  never reorder or drop). */
function sameBoonList(a: readonly string[], b: readonly string[]): boolean {
  return a === b || (a.length === b.length && a[a.length - 1] === b[b.length - 1]);
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
  private readonly tipBoons: Text;
  private readonly lastText: string[] = [];
  private hover: HoverState = NO_HOVER;
  private cachedLayout: HotbarLayout | null = null;
  /** INTEGRATED ACTIVE-breath phase + the clock it last advanced at (the
   *  litZones ember precedent — accumulated per frame, never absolute time). */
  private breathPhase = 0;
  private lastBreathSec: number | null = null;
  private tipCache: TooltipCache | null = null;

  constructor(hudLayer: Container) {
    hudLayer.addChild(this.root);
    this.root.addChild(this.gfx);
    this.rowText = Array.from({ length: SLOT_COUNT }, () => this.buildRowText());
    this.tipName = new Text({ text: '', style: TIP_NAME_STYLE });
    this.tipInteraction = new Text({ text: '', style: TIP_INTERACTION_STYLE });
    this.tipDesc = new Text({ text: '', style: TIP_DESC_STYLE });
    this.tipBoons = new Text({ text: '', style: TIP_BOON_STYLE });
    this.tipRoot.addChild(this.tipGfx, this.tipName, this.tipInteraction, this.tipDesc, this.tipBoons);
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
    const breath = activeBreath(this.advanceBreath(view.nowSec), motionScaled(ACTIVE_PULSE_AMP, view.motion ?? 'full'));
    for (const row of layout.rows) this.drawRow(models[row.slot], row, breath);
    this.drawFitFrame(view, layout);
    this.updateTooltip(view, layout, models, cursor, screenW, screenH, nowMs);
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

  private drawRow(m: SlotViewModel, row: HotbarRow, breath: number): void {
    const breathed = breathedSkin(m.state, motionIntensity(settings.current.motion), breath);
    const skin = m.degraded ? degradedSkin(breathed) : breathed;
    this.drawBox(m, row.box, skin);
    this.drawIcon(m, row.box, skin);
    this.drawKeyChip(m, row);
    this.drawBadge(m, row.box);
    this.updateRowText(m, row);
  }

  /**
   * The RANK-WIDE fit pulse (amendment 51): a shipwide INTEL/SHIP boon belongs
   * to no single slot, so the whole stack takes the flash instead of an
   * arbitrary weapon claiming it. Same 80ms/300ms register as the slot pulse —
   * the caller's DeniedPulse owns the timing; this only paints the frame.
   */
  private drawFitFrame(view: HotbarView, layout: HotbarLayout): void {
    if (!(view.fitFrame ?? false) || !motionAllowed(view.motion ?? 'full')) return;
    const first = layout.rows[0];
    const pad = FIT_PULSE_PX;
    this.gfx
      .rect(first.row.x - pad, layout.stackTop - pad, first.row.w + pad * 2, layout.stackHeight + pad * 2)
      .stroke({ width: 1.5, color: C.phosphorBright, alpha: fitFrameAlpha(view.fitFrameDegraded ?? false) });
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
    // there — an empty perimeter would read as "no cooldown running". ACTIVE
    // keeps it too: the window running does not stop the rack reloading.
    if (m.state === 'cooling' || m.state === 'active') this.drawCoolTrack(pts, m.coolFrac);
    if (m.fitFlash) this.drawFitPulse(pts, box);
  }

  /** THE FIT FLASH (amendment 51): one ≤80ms phosphor ring outside the slot
   *  whose family just took a boon — the ACTIVATED pop's register applied to
   *  the economy channel, deliberately OUTSIDE the box so it reads as something
   *  arriving ON the slot rather than the slot activating. */
  private drawFitPulse(pts: ScreenPoint[], box: SlotRect): void {
    for (let i = 1; i <= 2; i++) {
      const ring = inflate(pts, box, (FIT_PULSE_PX * i) / 2);
      this.gfx
        .poly(ring.map((p) => [p.x, p.y]).flat())
        .stroke({ width: 1.5, color: C.phosphorBright, alpha: 0.55 / i });
    }
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
    const model = slot === null ? null : this.cachedModel(slot, models[slot].id, view);
    if (!shouldShowTooltip(this.hover, nowMs, view.dim, model !== null) || slot === null || model === null) {
      this.tipRoot.visible = false;
      return;
    }
    this.tipRoot.visible = true;
    this.drawTooltip(model, layout.rows[slot], screenW, screenH);
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
    const boons = view.boons ?? EMPTY_BOONS;
    const c = this.tipCache;
    if (c && c.slot === slot && c.id === id && c.stats === view.stats && sameBoonList(c.boons, boons)) {
      return c.model;
    }
    const model = tooltipModel(slot, id, view.stats, boons);
    this.tipCache = { slot, id, stats: view.stats, boons, model };
    return model;
  }

  /**
   * Near-opaque panel + 1px silver .4 border + pointer notch, laid out at the
   * offsets tooltipRenderGeom resolves — the MODEL's arithmetic (the amendment-47
   * pin measures the same functions) reconciled with the description's MEASURED
   * height and the REAL viewport, so nothing draws past the panel and the panel
   * draws past neither the floor pin nor the screen. An empty BOONS block still
   * renders as ABSENCE: no divider, no rows, no placeholder.
   */
  private drawTooltip(model: TooltipModel, row: HotbarRow, screenW: number, screenH: number): void {
    const t = H.tooltip;
    const T = TIP_TYPE;
    this.setText(this.tipName, model.name, 100);
    this.setText(this.tipInteraction, model.interaction, 101);
    // The description's text must be assigned BEFORE it is measured: the height
    // this reads is the one Pixi just wrapped, not last frame's.
    this.setText(this.tipDesc, model.description, 102);
    const geom = tooltipRenderGeom(model, this.tipDesc.height, screenH);
    this.setText(this.tipBoons, boonBlockText(geom.boons), 103);
    this.tipBoons.visible = geom.boons.length > 0;
    const place = tooltipPlacement(row, geom.panelH, screenW, screenH);
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
    const edge = place.notchLeft ? place.x : place.x + t.width;
    const tip = place.notchLeft ? edge - t.notch : edge + t.notch;
    g.moveTo(edge, place.notchY - t.notch)
      .lineTo(tip, place.notchY)
      .lineTo(edge, place.notchY + t.notch)
      .fill({ color: C.panel, alpha: 0.97 });
  }
}
