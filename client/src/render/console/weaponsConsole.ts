// THE WEAPONS CONSOLE (Story 10.10, R16 / R17 / R18 / R23 / R24; plan O4 / O5 /
// O7, F2 / F4) — the right-edge Pixi surface: ONE uniform two-column box on a
// dark-glass bed — MAIN BATTERY over SECONDARIES on the left, Q / E / R on the
// right — and the three ABILITY buttons C · V · Shift spanning its width
// beneath. A thin painter: every number, word and state arrives in the view
// model (readouts.ts) and every rect in the spine (layout.ts); nothing here
// re-derives a stat.
//
//   cell:   ┌──────────────────────────┐  200 px (W2, R26)
//   line 1  │ HEAVY TORPEDO II     [ Q ] │  NAME · tier · key chip
//   mounts  │ (12) (3.6) ( ) ( )         │  40 px rings, the seconds INSIDE,
//   stat    │ DAMAGE                 250 │  four to the line, NOTHING else
//   stat    │ SPEED                 47.5 │  on it — never wraps (R27)
//   stat    │ HOMING               0.125 │  ONE STAT PER LINE (R23): label
//   stat    │ RELOAD               21.8S │  left, value right
//           └──────────────────────────┘
//
// NO STATE WORD (Eric 2026-11-10, round 3): ready = the solid phosphor rings,
// ARMED = the amber outline + inset wash + filled amber key chip, LOCKED = the
// red outline + the denied hatched heat bar.
//
// THE PREVIEW (R18): a key in `view.preview` turns its number AMBER with an
// arrow (`new▲` / `new▼`), a marked tier reads `II→III`, and a marked count
// (tubes / racks / rounds / capacity) adds HOLLOW amber clocks / pips beyond
// the current ones. Nothing else changes colour under a hover.
//
// Drawing idioms are the retired hotbar's (render/hotbar.ts): one blurred
// glow layer under one linework Graphics, `.text` written only on change, the
// readied amber wash + filled amber key chip, the 2 px denied edge. Hit-testing
// is by the layout's rects, never Pixi interaction (O1).

import { BlurFilter, Container, Graphics, Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../../config.js';
import { motionIntensity, motionScaled, type MotionLevel } from '../../settings/store.js';
import { monoTextWidth } from '../../util/monoMeasure.js';
import { traceDashed } from '../../util/poly.js';
import { drawHudBed } from '../hudBed.js';
import { tierRampColor } from '../../ui/tierRamp.js';
import { drawEquipmentIcon } from '../equipmentIcons.js';
import { keyChipGlyphColor } from '../keyChip.js';
import {
  MAX_CLOCKS,
  inRect,
  rowSlot,
  type AbilityRect,
  type ConsoleHit,
  type ConsoleLayout,
  type Rect,
  type WeaponRowRect,
} from './layout.js';
import type { AbilityModel, AbilityState, MountClock, PreviewMark, PreviewMarks, RowState, WeaponRowModel } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const CELL = K.cell;
const AB = K.abilities;
const T = K.type;
const MONO = CLIENT_CONFIG.type.mono;
const MONO_FLOOR = CLIENT_CONFIG.settings.monoFloorPx;
// Carried from the retiring bar's block (today's values, O5 "today's dimAlpha"):
// the dim alpha, the one glow blur, the chip's side padding and the hairline.
const BAR = CLIENT_CONFIG.console;

/**
 * Pure: the scale a `sizePx` register is drawn at under the HUD factor
 * `uiScale` so it never RENDERS below the mono floor (`monoFloorPx`). The
 * text rule's sizes clear the floor at every factor but the smallest HUD
 * factor × the 90 % tier, where only the 12 px chips and tier numerals would
 * dip under it; 1 everywhere else.
 */
export function floorScale(sizePx: number, uiScale: number): number {
  if (!Number.isFinite(uiScale) || uiScale <= 0 || !(sizePx > 0)) return 1;
  return Math.max(1, MONO_FLOOR / (sizePx * uiScale));
}

// --- pure core: skins ------------------------------------------------------------

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

/** O4's outline per row state; READIED is today's selected grammar (amber
 *  outline, 16 px amber bloom, the .16 inset wash). */
const ROW_SKINS: Readonly<Record<RowState, ConsoleSkin>> = {
  empty: SKIN(C.silver, 0.45, 1, 0, 0, 0, true),
  ready: SKIN(C.phosphor, 0.65, 1, 10, 0.15),
  cooling: SKIN(C.silver, 0.45),
  readied: SKIN(C.amber, 1, 1.5, 16, 0.4, 0.16),
  locked: SKIN(C.denied, 1),
};

/** O5's button outline per ability state; ACTIVE is today's breathing outline. */
const ABILITY_SKINS: Readonly<Record<AbilityState, ConsoleSkin>> = {
  ready: SKIN(C.phosphor, 0.65, 1, 14, 0.2),
  cooling: SKIN(C.silver, 0.45),
  active: SKIN(C.phosphorBright, 1, 2, 14, 0.24),
};

/** The 80 ms denied edge (today's denied skin). */
const DENIED_SKIN = SKIN(C.denied, 1, 2, 8, 0.25);

function motionGlow(skin: ConsoleSkin, motion: MotionLevel): ConsoleSkin {
  const k = motionIntensity(motion);
  return k >= 1 ? skin : { ...skin, glowPx: skin.glowPx * k, glowAlpha: skin.glowAlpha * k };
}

/** Pure: a row's outline this frame — the denied pulse wins over the state. */
export function rowSkin(state: RowState, denied: boolean, motion: MotionLevel): ConsoleSkin {
  return motionGlow(denied ? DENIED_SKIN : ROW_SKINS[state], motion);
}

/** Pure: an ability button's outline — denied wins; ACTIVE breathes its alphas. */
export function abilitySkin(state: AbilityState, denied: boolean, motion: MotionLevel, breath: number): ConsoleSkin {
  if (denied) return motionGlow(DENIED_SKIN, motion);
  const skin = motionGlow(ABILITY_SKINS[state], motion);
  return state === 'active' ? { ...skin, borderAlpha: skin.borderAlpha * breath, glowAlpha: skin.glowAlpha * breath } : skin;
}

// --- pure core: the ACTIVE breath (today's integrator, capped) --------------------

const BREATH_HZ = Math.min(0.5, CLIENT_CONFIG.settings.pulseCapHz);
const BREATH_AMP = 0.3;
const MAX_BREATH_DT = 0.5;

/** Pure: advance the breath phase by one frame — integrated, never absolute
 *  time, so a server-clock re-estimate cannot jump the alpha. */
export function advanceBreath(phase: number, dtSec: number): number {
  const step = Math.min(MAX_BREATH_DT, Math.max(0, dtSec));
  return (phase + BREATH_HZ * step * Math.PI * 2) % (Math.PI * 2);
}

// --- pure core: words, chips, preview text ----------------------------------------

/** Pure: a key chip's width — the bar's widening mono box (`LMB`, `Shift`),
 *  its glyph drawn at `scale` (the mono floor's, `floorScale`). */
export function consoleChipWidth(glyph: string, scale = 1): number {
  return Math.max(CELL.keyChip, monoTextWidth(glyph, T.keyChip) * scale + 2 * BAR.chipPadX);
}

/** Pure: R18 — the text a readout prints and whether it is a preview mark. */
export function markedValue(value: string, mark: PreviewMark | undefined): { text: string; amber: boolean } {
  if (mark === undefined) return { text: value, amber: false };
  return { text: `${mark.value}${mark.direction === 'up' ? '▲' : '▼'}`, amber: true };
}

/**
 * Pure: the tier numeral line 1 prints in `room` px — the ramp numeral, or
 * under a marked tier the amber hover form: `II→III` where it fits, else
 * `III▲`, else the bare amber `III` (a long name — SUPERCAV TORPEDO — leaves
 * line 1 too little room for the full form; the text never shrinks, the form
 * shortens). `room` defaults to unbounded.
 */
export function tierLabel(row: WeaponRowModel, preview: PreviewMarks | null, room = Infinity): { text: string; color: number } {
  const mark = preview?.get(`row.${row.kind}.tier`);
  if (mark === undefined) return { text: row.tierNumeral, color: tierRampColor(row.tier) };
  const forms = [...(row.tierNumeral === '' ? [] : [`${row.tierNumeral}→${mark.value}`]), `${mark.value}▲`, mark.value];
  const text = forms.find((f) => monoTextWidth(f, T.tier) <= room) ?? mark.value;
  return { text, color: C.amber };
}

/** Pure: R27 — the letter-spacing a clock numeral prints at: tightened on a
 *  three-character numeral (`1.8`, `120`) so it sits inside its ring, else 0. */
export function clockTracking(numeral: string): number {
  return [...numeral].length >= 3 ? CELL.clockTracking : 0;
}

/** Pure: R27 — how many rings the mount line draws: the current ones plus a
 *  preview's hollow extras, never more than `MAX_CLOCKS` (the line never wraps). */
export function ringsShown(current: number, extra: number): { current: number; extra: number } {
  const c = Math.min(current, MAX_CLOCKS);
  return { current: c, extra: Math.max(0, Math.min(extra, MAX_CLOCKS - c)) };
}

/** Pure: how many HOLLOW amber marks a count key adds beyond the current ones
 *  (a rise only; a count that falls draws nothing extra). */
export function extraMarks(preview: PreviewMarks | null, key: string): number {
  const mark = preview?.get(key);
  if (mark === undefined || mark.direction !== 'up') return 0;
  return Math.max(0, Math.round(mark.raw - (mark.from ?? 0)));
}

/** The count key whose rise adds hollow clocks on a row (mines: whole racks). */
function clockCountKey(row: WeaponRowModel): string | null {
  if (row.kind === 'torpedo') return 'row.torpedo.tubes';
  if (row.kind === 'special') return 'row.special.rounds';
  return row.kind === 'mines' ? 'row.mines.racks' : null;
}

/** One stat line as printed (R23): the label left, the value right — the
 *  value in its hover form (`new▲` amber) under a mark. */
export interface StatLine {
  label: string;
  value: string;
  amber: boolean;
}

/** Pure: a cell's stat lines, ONE STAT PER LINE, in print order — at most the
 *  `max` lines the cell has (readouts.ts never prints more). */
export function statLines(row: WeaponRowModel, preview: PreviewMarks | null, max: number = CELL.statLines): StatLine[] {
  return row.stats.slice(0, max).map((r) => {
    const v = markedValue(r.value, preview?.get(r.key));
    return { label: r.label, value: v.text, amber: v.amber };
  });
}

// --- the Pixi shell ---------------------------------------------------------------

interface RowTexts {
  name: Text;
  tier: Text;
  chip: Text;
  numerals: Text[];
  labels: Text[];
  values: Text[];
}

interface AbilityTexts {
  word: Text;
  numeral: Text;
  chip: Text;
  name: Text;
}

export interface WeaponsConsoleView {
  rows: readonly WeaponRowModel[];
  abilities: readonly AbilityModel[];
  preview: PreviewMarks | null;
  nowSec: number;
  nowMs: number;
  motion: MotionLevel;
  /** The HUD factor the layer is drawn at (viewport × UI tier) — the mono
   *  floor's input (`floorScale`). */
  uiScale: number;
  denied: { rows: boolean[]; abilities: boolean[] };
  dim: boolean;
}

export type WeaponsConsoleLayout = ConsoleLayout['weapons'] & { abilities: ConsoleLayout['abilities'] };

/** An empty cell's name and glyph alpha (the empty skin's dim icon). */
const EMPTY_ALPHA = 0.5;
/** A cooling clock's elapsed wedge alpha; a ready disc's fill. */
const WEDGE_ALPHA = 0.35;
const DISC_ALPHA = 0.9;
/** The heat bar's fill alphas; hatch pitch. */
const HEAT_FILL_ALPHA = 0.85;
const LOCK_WASH_ALPHA = 0.16;
const HATCH_PITCH = 4;
/** An empty cell's family glyph size (px), dim, where the first ring would be. */
const EMPTY_GLYPH_PX = 24;
/** The most pips a rack's column holds before the next column starts. */
const PIPS_PER_COLUMN = 4;
/** Pure: an ability button's two text centres (y offsets from its top) —
 *  the state word / numeral just under the key chip's box (so a wide `Shift`
 *  chip never touches it), the name just above the progress hairline. */
export function abilityTextYs(h: number): { word: number; name: number } {
  const chipBottom = CELL.padX / 2 + CELL.keyChip;
  return { word: chipBottom + T.abilityState / 2, name: h - AB.progressH - T.abilityName / 2 - 1 };
}

/** Where the mount line's marks end (`x`) and how many clock numerals they used. */
interface MountsEnd {
  x: number;
  n: number;
}

function text(size: number, weight: '400' | '600', fill: number, anchorX = 0): Text {
  const t = new Text({ text: '', style: { fontFamily: MONO, fontSize: size, fontWeight: weight, fill } });
  t.anchor.set(anchorX, 0.5);
  return t;
}

function setText(t: Text, value: string): void {
  if (t.text !== value) t.text = value;
}

function setFill(t: Text, color: number): void {
  if (t.style.fill !== color) t.style.fill = color;
}

export class WeaponsConsole {
  private readonly root = new Container();
  private readonly bedGfx = new Graphics();
  private readonly glowGfx = new Graphics();
  private readonly gfx = new Graphics();
  private readonly rowTexts: RowTexts[] = [];
  private readonly abilityTexts: AbilityTexts[] = [];
  private layout: WeaponsConsoleLayout | null = null;
  private bedKey = '';
  private breathPhase = 0;
  private lastBreathSec: number | null = null;
  private uiScale = 1;
  private preview: PreviewMarks | null = null;

  constructor(parent: Container) {
    parent.addChild(this.root);
    const blur = new BlurFilter({ strength: BAR.glowBlurPx, quality: 4 });
    blur.padding = BAR.glowBlurPx * 2;
    this.glowGfx.filters = [blur];
    this.root.addChild(this.bedGfx, this.glowGfx, this.gfx);
  }

  update(view: WeaponsConsoleView, layout: WeaponsConsoleLayout): void {
    this.root.visible = true;
    this.root.alpha = view.dim ? BAR.dimAlpha : 1;
    this.layout = layout;
    this.uiScale = view.uiScale;
    this.preview = view.preview;
    this.drawBed(layout.bed);
    this.gfx.clear();
    this.glowGfx.clear();
    const breath = 1 - this.breathAmp(view.motion) + this.breathAmp(view.motion) * Math.sin(this.stepBreath(view.nowSec));
    layout.rows.forEach((rect, i) => {
      const row = view.rows[i];
      if (row !== undefined) this.drawRow(row, rect, view.denied.rows[i] === true, view.motion, i);
      else this.hideRowTexts(i);
    });
    layout.abilities.forEach((rect, i) => {
      const ab = view.abilities[i];
      const denied = view.denied.abilities[i] === true;
      if (ab !== undefined) this.drawAbility(ab, rect, abilitySkin(ab.state, denied, view.motion, breath), denied, i);
    });
  }

  /** Gone (founder, spectate, reveal, port): hidden, routes nothing, the
   *  breath starts cold next life. */
  hide(): void {
    this.hideTransient();
    this.breathPhase = 0;
    this.lastBreathSec = null;
  }

  /** A transient frame gap (the forceSnap pose gap): hidden and routing
   *  nothing, but the ACTIVE breath keeps its phase. */
  hideTransient(): void {
    this.root.visible = false;
    this.layout = null;
  }

  /** Hit-test in LOGICAL px against the last drawn layout (null while hidden):
   *  a cell → its slot (null for the secondaries), a button → its ability. The
   *  spine's `consoleHit` routing, restricted to this console's rects. */
  hit(p: { x: number; y: number }): ConsoleHit | null {
    const l = this.layout;
    if (l === null) return null;
    const row = l.rows.find((r) => inRect(p, r));
    if (row !== undefined) return { kind: 'slot', row: row.kind, slot: rowSlot(row.kind) };
    const ab = l.abilities.find((r) => inRect(p, r));
    return ab === undefined ? null : { kind: 'ability', ability: ab.kind };
  }

  private breathAmp(motion: MotionLevel): number {
    return motionScaled(BREATH_AMP, motion);
  }

  private stepBreath(nowSec: number): number {
    const dt = this.lastBreathSec === null || !Number.isFinite(nowSec) ? 0 : nowSec - this.lastBreathSec;
    if (Number.isFinite(nowSec)) this.lastBreathSec = nowSec;
    this.breathPhase = advanceBreath(this.breathPhase, dt);
    return this.breathPhase;
  }

  /** R24's dark-glass bed under the whole box — redrawn on a moved rect only. */
  private drawBed(bed: Rect): void {
    const key = `${bed.x}|${bed.y}|${bed.w}|${bed.h}`;
    if (key === this.bedKey) return;
    this.bedKey = key;
    drawHudBed(this.bedGfx, bed);
  }

  // --- texts ----------------------------------------------------------------------

  private rowTextsAt(i: number): RowTexts {
    while (this.rowTexts.length <= i) {
      const rt: RowTexts = {
        name: text(T.name, '600', C.textPrimary),
        tier: text(T.tier, '600', C.phosphor),
        chip: text(T.keyChip, '600', C.phosphor, 0.5),
        numerals: [],
        labels: [],
        values: [],
      };
      this.root.addChild(rt.name, rt.tier, rt.chip);
      this.rowTexts.push(rt);
    }
    return this.rowTexts[i];
  }

  /** A pooled Text, grown on first need only (a fit can add tubes mid-match). */
  private pooled(pool: Text[], k: number, make: () => Text): Text {
    while (pool.length <= k) {
      const t = make();
      this.root.addChild(t);
      pool.push(t);
    }
    const t = pool[k];
    t.visible = true;
    return t;
  }

  private hideRowTexts(i: number): void {
    const rt = this.rowTexts[i];
    if (rt === undefined) return;
    for (const t of [rt.name, rt.tier, rt.chip, ...rt.numerals, ...rt.labels, ...rt.values]) t.visible = false;
  }

  /** Place a Text; its scale holds it on the mono floor (`floorScale`). */
  private place(t: Text, value: string, x: number, y: number): void {
    t.visible = value !== '';
    setText(t, value);
    t.position.set(x, y);
    t.scale.set(floorScale(t.style.fontSize, this.uiScale));
  }

  // --- the outline, glow and key chip ------------------------------------------------

  private drawBox(r: Rect, skin: ConsoleSkin): void {
    const g = this.gfx;
    if (skin.washAlpha > 0) g.rect(r.x, r.y, r.w, r.h).fill({ color: skin.border, alpha: skin.washAlpha });
    if (skin.dashed) {
      traceDashed(g, [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }]);
    } else {
      g.rect(r.x, r.y, r.w, r.h);
    }
    g.stroke({ width: skin.width, color: skin.border, alpha: skin.borderAlpha });
    if (skin.glowPx <= 0 || skin.glowAlpha <= 0) return;
    const pad = skin.glowPx / 2;
    this.glowGfx
      .rect(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2)
      .fill({ color: skin.border, alpha: skin.glowAlpha })
      .rect(r.x, r.y, r.w, r.h)
      .cut();
  }

  /** The key chip at a right edge: filled amber when SELECTED (readied), a
   *  denied hairline while denied, the phosphor hairline otherwise. */
  private drawChip(t: Text, glyph: string, right: number, cy: number, selected: boolean, denied: boolean): void {
    const w = consoleChipWidth(glyph, floorScale(T.keyChip, this.uiScale));
    const x = right - w;
    const y = cy - CELL.keyChip / 2;
    const g = this.gfx;
    if (selected) g.rect(x, y, w, CELL.keyChip).fill({ color: C.amber, alpha: 1 });
    else g.rect(x, y, w, CELL.keyChip).stroke({ width: BAR.lineW, color: denied ? C.denied : C.phosphor, alpha: denied ? 1 : 0.55 });
    setFill(t, keyChipGlyphColor(selected));
    this.place(t, glyph, x + w / 2, cy);
  }

  // --- one weapon cell --------------------------------------------------------------

  private drawRow(row: WeaponRowModel, rect: WeaponRowRect, denied: boolean, motion: MotionLevel, i: number): void {
    const rt = this.rowTextsAt(i);
    this.drawBox(rect, rowSkin(row.state, denied, motion));
    this.drawHeader(row, rect.header, rt, denied);
    this.drawMounts(row, rect.mounts, rt);
    this.drawStats(row, rect, rt);
  }

  /** Line 1: NAME left, the tier numeral `tierGap` after it, the key chip
   *  right — the tier's hover form shortens to the room between (`tierLabel`). */
  private drawHeader(row: WeaponRowModel, l: Rect, rt: RowTexts, denied: boolean): void {
    const cy = l.y + l.h / 2;
    this.place(rt.name, row.name, l.x, cy);
    rt.name.alpha = row.state === 'empty' ? EMPTY_ALPHA : 1;
    const x = l.x + monoTextWidth(row.name, T.name) + CELL.tierGap;
    const chipW = consoleChipWidth(row.keyGlyph, floorScale(T.keyChip, this.uiScale));
    const tier = tierLabel(row, this.preview, l.x + l.w - chipW - CELL.tierGap - x);
    setFill(rt.tier, tier.color);
    this.place(rt.tier, tier.text, x, cy);
    this.drawChip(rt.chip, row.keyGlyph, l.x + l.w, cy, row.readied, denied);
  }

  /** The MOUNT line (R27): rings, racks or the heat bar — and nothing else. */
  private drawMounts(row: WeaponRowModel, l: Rect, rt: RowTexts): void {
    let end: MountsEnd = { x: l.x, n: 0 };
    if (row.heat !== null) this.drawHeat(row.heat.heat, row.heat.locked, l);
    else if (row.state === 'empty') end = this.drawEmptyGlyph(row, l);
    else if (row.kind === 'mines') end = this.drawRacks(row, l, rt);
    else end = this.drawClocks(row.clocks, l, rt);
    if (row.kind !== 'mines') this.drawHollowClocks(row, end, l);
    for (let k = end.n; k < rt.numerals.length; k++) rt.numerals[k].visible = false;
  }

  /** A marked count's HOLLOW amber rings after the current ones, inside the
   *  four the line holds (`ringsShown`). */
  private drawHollowClocks(row: WeaponRowModel, end: MountsEnd, l: Rect): void {
    const key = clockCountKey(row);
    const extra = ringsShown(end.n, key === null ? 0 : extraMarks(this.preview, key)).extra;
    for (let k = 0; k < extra; k++) this.drawHollowClock(end.x + k * (CELL.clock + CELL.clockGap), l.y + l.h / 2);
  }

  private drawClocks(clocks: readonly MountClock[], l: Rect, rt: RowTexts): MountsEnd {
    const cy = l.y + l.h / 2;
    const n = ringsShown(clocks.length, 0).current;
    for (let k = 0; k < n; k++) this.drawClock(clocks[k], l.x + k * (CELL.clock + CELL.clockGap), cy, rt, k);
    return { x: l.x + n * (CELL.clock + CELL.clockGap), n };
  }

  /** One ring: a solid phosphor disc when ready; otherwise a silver ring, the
   *  elapsed wedge clockwise from 12, the seconds numeral inside. */
  private drawClock(c: MountClock, x: number, cy: number, rt: RowTexts, k: number): void {
    const r = CELL.clock / 2;
    const cx = x + r;
    const g = this.gfx;
    const t = this.pooled(rt.numerals, k, () => text(T.clock, '600', C.textPrimary, 0.5));
    if (c.ready) {
      g.circle(cx, cy, r).fill({ color: C.phosphor, alpha: DISC_ALPHA });
      t.visible = false;
      return;
    }
    g.circle(cx, cy, r).stroke({ width: BAR.lineW, color: C.silver, alpha: 0.45 });
    if (c.progress > 0) {
      const a0 = -Math.PI / 2;
      g.moveTo(cx, cy).arc(cx, cy, r, a0, a0 + Math.PI * 2 * c.progress).closePath().fill({ color: C.phosphor, alpha: WEDGE_ALPHA });
    }
    const tracking = clockTracking(c.numeral);
    if (t.style.letterSpacing !== tracking) t.style.letterSpacing = tracking;
    this.place(t, c.numeral, cx, cy);
  }

  private drawHollowClock(x: number, cy: number): void {
    this.gfx.circle(x + CELL.clock / 2, cy, CELL.clock / 2).stroke({ width: BAR.lineW, color: C.amber, alpha: 1 });
  }

  /** Mines (R27): per rack ONE ring, then its held-mine pips in a short
   *  column right of it (capacity from the model; a marked capacity adds
   *  hollow amber pips; a marked rack count adds a hollow ring). */
  private drawRacks(row: WeaponRowModel, l: Rect, rt: RowTexts): MountsEnd {
    const cy = l.y + l.h / 2;
    const extraCap = extraMarks(this.preview, 'row.mines.capacity');
    const cap = Math.max(0, ...row.racks.map((r) => r.capacity)) + extraCap;
    let x = l.x;
    row.racks.forEach((rack, k) => {
      const c = row.clocks[k];
      if (c !== undefined) this.drawClock(c, x, cy, rt, k);
      x = this.drawPipColumn(rack.held, rack.capacity, rack.capacity + extraCap, x + CELL.clock + CELL.rackGap, cy) + CELL.clockGap;
    });
    const extraRacks = extraMarks(this.preview, 'row.mines.racks');
    for (let k = 0; k < extraRacks; k++) {
      this.drawHollowClock(x, cy);
      x = this.drawPipColumn(0, 0, cap, x + CELL.clock + CELL.rackGap, cy) + CELL.clockGap;
    }
    return { x, n: Math.min(row.racks.length, row.clocks.length) };
  }

  /** One rack's pips, top to bottom in columns of four, centred on `cy`;
   *  filled per held mine, muted hollow to `capacity`, amber hollow beyond
   *  (a hover's rise). Returns the column block's right edge. */
  private drawPipColumn(held: number, capacity: number, total: number, x: number, cy: number): number {
    const P = CELL.rackPip;
    const perCol = Math.min(PIPS_PER_COLUMN, Math.max(1, total));
    const top = cy - (perCol * P.h + (perCol - 1) * P.gap) / 2;
    for (let j = 0; j < total; j++) {
      const px = x + Math.floor(j / PIPS_PER_COLUMN) * (P.w + P.gap);
      const py = top + (j % PIPS_PER_COLUMN) * (P.h + P.gap);
      if (j < held) this.gfx.rect(px, py, P.w, P.h).fill({ color: C.phosphor, alpha: DISC_ALPHA });
      else this.gfx.rect(px, py, P.w, P.h).stroke({ width: BAR.lineW, color: j < capacity ? C.textMuted : C.amber, alpha: j < capacity ? 0.6 : 1 });
    }
    const cols = Math.ceil(total / PIPS_PER_COLUMN);
    return x + cols * (P.w + P.gap) - (cols > 0 ? P.gap : 0);
  }

  /** The secondaries' heat bar: phosphor fill to the heat; LOCKED = the
   *  denied outline, a denied wash and the hatch over the fill. */
  private drawHeat(heat: number, locked: boolean, l: Rect): void {
    const h = CELL.heatH;
    const y = l.y + (l.h - h) / 2;
    const frac = heat > 0 ? Math.min(1, heat) : 0;
    const g = this.gfx;
    const color = locked ? C.denied : C.phosphor;
    g.rect(l.x, y, l.w, h).stroke({ width: BAR.lineW, color: locked ? C.denied : C.silver, alpha: locked ? 1 : 0.45 });
    if (frac <= 0) return;
    if (!locked) {
      g.rect(l.x, y, l.w * frac, h).fill({ color, alpha: HEAT_FILL_ALPHA });
      return;
    }
    g.rect(l.x, y, l.w * frac, h).fill({ color, alpha: LOCK_WASH_ALPHA });
    this.hatch({ x: l.x, y, w: l.w * frac, h }, color);
  }

  /** 45° hatch lines clipped to a rect (the sitting's locked fill). */
  private hatch(r: Rect, color: number): void {
    const g = this.gfx;
    for (let d = HATCH_PITCH; d < r.w + r.h; d += HATCH_PITCH) {
      const x0 = r.x + Math.max(0, d - r.h);
      const y0 = r.y + Math.min(d, r.h);
      const x1 = r.x + Math.min(d, r.w);
      const y1 = r.y + Math.max(0, d - r.w);
      g.moveTo(x0, y0).lineTo(x1, y1);
    }
    g.stroke({ width: BAR.lineW, color, alpha: 1 });
  }

  /** An empty cell: the family glyph, dim, where the first clock would be. */
  private drawEmptyGlyph(row: WeaponRowModel, l: Rect): MountsEnd {
    if (row.emptyGlyph !== null) {
      const style = { width: 1.5, color: C.textMuted, alpha: EMPTY_ALPHA };
      drawEquipmentIcon(this.gfx, row.emptyGlyph, l.x + EMPTY_GLYPH_PX / 2, l.y + l.h / 2, EMPTY_GLYPH_PX, style);
    }
    return { x: l.x + CELL.clock + CELL.clockGap, n: 0 };
  }

  /** R23: ONE STAT PER LINE — the label left in the muted register, the value
   *  right-aligned in phosphor (amber with its arrow under a hover mark). */
  private drawStats(row: WeaponRowModel, rect: WeaponRowRect, rt: RowTexts): void {
    const lines = statLines(row, this.preview, rect.statLines.length);
    lines.forEach((line, k) => {
      const r = rect.statLines[k];
      const cy = r.y + r.h / 2;
      const label = this.pooled(rt.labels, k, () => text(T.statLabel, '400', C.textMuted));
      const value = this.pooled(rt.values, k, () => text(T.statValue, '600', C.phosphor, 1));
      this.place(label, line.label, r.x, cy);
      setFill(value, line.amber ? C.amber : C.phosphor);
      this.place(value, line.value, r.x + r.w, cy);
    });
    for (let k = lines.length; k < rt.labels.length; k++) {
      rt.labels[k].visible = false;
      rt.values[k].visible = false;
    }
  }

  // --- one ability button -------------------------------------------------------------

  private abilityTextsAt(i: number): AbilityTexts {
    while (this.abilityTexts.length <= i) {
      const at: AbilityTexts = {
        word: text(T.abilityState, '600', C.phosphor, 0.5),
        numeral: text(T.abilityNumeral, '600', C.textPrimary, 0.5),
        chip: text(T.keyChip, '600', C.phosphor, 0.5),
        name: text(T.abilityName, '400', C.textPrimary, 0.5),
      };
      this.root.addChild(at.word, at.numeral, at.chip, at.name);
      this.abilityTexts.push(at);
    }
    return this.abilityTexts[i];
  }

  /** O5: the state word (or the seconds numeral) centred, the key chip at the
   *  top-right corner, the name centred below, the progress hairline along the
   *  bottom edge while cooling. A marked C / V cooldown prints its incoming
   *  value amber in place of the word. */
  private drawAbility(ab: AbilityModel, r: AbilityRect, skin: ConsoleSkin, denied: boolean, i: number): void {
    const at = this.abilityTextsAt(i);
    this.drawBox(r, skin);
    const cx = r.x + r.w / 2;
    const ys = abilityTextYs(r.h);
    const wordY = r.y + ys.word;
    const mark = ab.kind === 'shift' ? undefined : this.preview?.get(`ability.${ab.kind}.cooldown`);
    const word = markedValue(ab.stateWord, mark);
    setFill(at.word, word.amber ? C.amber : C.phosphor);
    this.place(at.word, word.text, cx, wordY);
    this.place(at.numeral, word.text === '' ? ab.numeral : '', cx, wordY);
    const inset = CELL.padX / 2;
    this.drawChip(at.chip, ab.keyGlyph, r.x + r.w - inset, r.y + inset + CELL.keyChip / 2, false, denied);
    this.place(at.name, ab.name, cx, r.y + ys.name);
    if (ab.state === 'cooling' && ab.progress > 0) {
      this.gfx.rect(r.x, r.y + r.h - AB.progressH, r.w * Math.min(1, ab.progress), AB.progressH).fill({ color: C.phosphor, alpha: 1 });
    }
  }
}
