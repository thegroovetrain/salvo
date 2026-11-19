// THE BAR'S PURE LOOKS (Story 12.3 Part B; carried over from Story 10.10's
// weapons console, R16 / R18) — the tile outlines per state, the ACTIVE
// breath, the mono floor, the key chip's width and the preview's text forms.
// No Pixi; the painters (barWeapons.ts, barShip.ts) read these.
//
//   tile states:  cooling  silver .45
//                 ready    phosphor .65 + glow
//                 readied  amber outline + 16 px bloom + .16 inset wash (ARMED)
//                 empty    dashed silver (no weapon in the slot)
//                 denied   the 80 ms red edge (wins over the state)
//                 preview  the amber outline a hovered card puts on the tile
//                          it changes (AC 36)

import { CLIENT_CONFIG } from '../../config.js';
import { motionIntensity, motionScaled, type MotionLevel } from '../../settings/store.js';
import { monoTextWidth } from '../../util/monoMeasure.js';
import { tierRampColor } from '../../ui/tierRamp.js';
import type { AbilityState, PreviewMark, PreviewMarks, RowState, WeaponRowModel } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const T = K.type;
const MONO_FLOOR = CLIENT_CONFIG.settings.monoFloorPx;

/**
 * Pure: the scale a `sizePx` register is drawn at under the HUD factor
 * `uiScale` so it never RENDERS below the mono floor (`monoFloorPx`). The 12
 * and 13 px registers dip under it only at the smallest HUD factor × the 90 %
 * tier; 1 everywhere else.
 */
export function floorScale(sizePx: number, uiScale: number): number {
  if (!Number.isFinite(uiScale) || uiScale <= 0 || !(sizePx > 0)) return 1;
  return Math.max(1, MONO_FLOOR / (sizePx * uiScale));
}

/** One outline recipe (tokens + alphas — DESIGN.md registers, no literals). */
export interface ConsoleSkin {
  border: number;
  borderAlpha: number;
  width: number;
  glowPx: number;
  glowAlpha: number;
  washAlpha: number;
  dashed: boolean;
}

const SKIN = (border: number, borderAlpha: number, width = 1, glowPx = 0, glowAlpha = 0, washAlpha = 0, dashed = false): ConsoleSkin =>
  ({ border, borderAlpha, width, glowPx, glowAlpha, washAlpha, dashed });

const ROW_SKINS: Readonly<Record<RowState, ConsoleSkin>> = {
  empty: SKIN(C.silver, 0.45, 1, 0, 0, 0, true),
  ready: SKIN(C.phosphor, 0.65, 1, 10, 0.25),
  cooling: SKIN(C.silver, 0.45),
  readied: SKIN(C.amber, 1, 1.5, 16, 0.4, 0.16),
};

const ABILITY_SKINS: Readonly<Record<AbilityState, ConsoleSkin>> = {
  ready: SKIN(C.phosphor, 0.65, 1, 10, 0.25),
  cooling: SKIN(C.silver, 0.45),
  active: SKIN(C.phosphorBright, 1, 2, 14, 0.24),
};

/** The 80 ms denied edge. */
const DENIED_SKIN = SKIN(C.denied, 1, 2, 8, 0.25);

/** AC 36: the tile a hovered card changes — the bench's amber 1.5 px outline,
 *  its 14 px amber glow and the hover wash. */
export const PREVIEW_SKIN: ConsoleSkin = SKIN(C.amber, 1, 1.5, 14, 0.35, 0.06);

/** The wash a tile under the pointer wears (the bench's `:hover`). */
export const HOVER_WASH = 0.06;

function motionGlow(skin: ConsoleSkin, motion: MotionLevel): ConsoleSkin {
  const k = motionIntensity(motion);
  return k >= 1 ? skin : { ...skin, glowPx: skin.glowPx * k, glowAlpha: skin.glowAlpha * k };
}

/** Pure: a weapon tile's outline this frame — the denied pulse wins, then a
 *  hovered card's preview, then the state. */
export function rowSkin(state: RowState, denied: boolean, motion: MotionLevel, preview = false): ConsoleSkin {
  if (denied) return motionGlow(DENIED_SKIN, motion);
  return motionGlow(preview ? PREVIEW_SKIN : ROW_SKINS[state], motion);
}

/** Pure: an ability tile's outline — denied wins, then the preview; ACTIVE
 *  breathes its alphas. */
export function abilitySkin(state: AbilityState, denied: boolean, motion: MotionLevel, breath: number, preview = false): ConsoleSkin {
  if (denied) return motionGlow(DENIED_SKIN, motion);
  if (preview) return motionGlow(PREVIEW_SKIN, motion);
  const skin = motionGlow(ABILITY_SKINS[state], motion);
  return state === 'active' ? { ...skin, borderAlpha: skin.borderAlpha * breath, glowAlpha: skin.glowAlpha * breath } : skin;
}

// --- the ACTIVE breath (today's integrator, capped) ---------------------------------

const BREATH_HZ = Math.min(0.5, CLIENT_CONFIG.settings.pulseCapHz);
const BREATH_AMP = 0.3;
const MAX_BREATH_DT = 0.5;

/** Pure: advance the breath phase by one frame — integrated, never absolute
 *  time, so a server-clock re-estimate cannot jump the alpha. */
export function advanceBreath(phase: number, dtSec: number): number {
  const step = Math.min(MAX_BREATH_DT, Math.max(0, dtSec));
  return (phase + BREATH_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

/** Pure: the breath multiplier at a phase under the motion level (1 at off). */
export function breathAt(phase: number, motion: MotionLevel): number {
  const amp = motionScaled(BREATH_AMP, motion);
  return 1 - amp + amp * Math.sin(phase);
}

// --- words, chips, preview text ------------------------------------------------------

/** The arrows a preview mark prints beside its incoming value (R18). */
export const PREVIEW_ARROW = { up: '▲', down: '▼' } as const;

/** Pure: a key chip's width — the widening mono box (`LMB`, `Shift`), its
 *  glyph drawn at `scale` (the mono floor's, `floorScale`). */
export function consoleChipWidth(glyph: string, scale = 1): number {
  return Math.max(K.bar.keyChip, monoTextWidth(glyph, T.keyChip) * scale + 2 * K.chipPadX);
}

/** Pure: the text a readout prints and whether it is a preview mark. */
export function markedValue(value: string, mark: PreviewMark | undefined): { text: string; amber: boolean } {
  if (mark === undefined) return { text: value, amber: false };
  return { text: `${mark.value}${PREVIEW_ARROW[mark.direction]}`, amber: true };
}

/** Pure: the text an index value prints — the plain value, or under a
 *  preview mark the incoming value and its arrow (AC 36: `new▲`). */
export function indexValueText(value: number, mark: PreviewMark | undefined): string {
  return markedValue(String(value), mark).text;
}

/**
 * Pure: the tier numeral line 1 prints in `room` px — the ramp numeral, or
 * under a marked tier the amber hover form: `II→III` where it fits, else
 * `III▲`, else the bare amber `III` (the text never shrinks, the form
 * shortens). `room` defaults to unbounded.
 */
export function tierLabel(row: WeaponRowModel, preview: PreviewMarks | null, room = Infinity): { text: string; color: number } {
  const mark = preview?.get(`row.${row.kind}.tier`);
  if (mark === undefined) return { text: row.tierNumeral, color: tierRampColor(row.tier) };
  const forms = [...(row.tierNumeral === '' ? [] : [`${row.tierNumeral}→${mark.value}`]), `${mark.value}▲`, mark.value];
  const text = forms.find((f) => monoTextWidth(f, T.tier) <= room) ?? mark.value;
  return { text, color: C.amber };
}
