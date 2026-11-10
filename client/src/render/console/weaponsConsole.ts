// THE WEAPONS CONSOLE (Story 10.10, R16 / R17 / R18; plan O4 / O5 / O7) — the
// right-edge Pixi surface: five tall ROW-BUTTONS (Main Battery · Secondaries ·
// Torpedo · Mines · Special) and the three ABILITY buttons C · V · Shift under
// them. A thin painter: every number, word and state arrives in the W1 view
// model (readouts.ts) and every rect in the W1 spine (layout.ts); nothing here
// re-derives a stat.
//
//   row:  ┌──────────────────────────────────────────────┐
//   line1 │ NAME   READY  II                       [ Q ] │
//   line2 │ ◔ ◔ ●  (clocks · rack pips · the heat bar)   │
//   stats │ DAMAGE 250 · SPEED 47.5 · RELOAD 21.8S       │
//         └──────────────────────────────────────────────┘
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
import { tierRampColor } from '../../ui/tierRamp.js';
import { drawEquipmentIcon } from '../equipmentIcons.js';
import { keyChipGlyphColor } from '../keyChip.js';
import {
  WEAPON_ROW_KINDS,
  inRect,
  rowSlot,
  statsNeedTwoLines,
  type AbilityRect,
  type ConsoleHit,
  type ConsoleLayout,
  type Rect,
  type WeaponRowRect,
} from './layout.js';
import { rowStats } from './readouts.js';
import type { AbilityModel, AbilityState, MountClock, PreviewMark, PreviewMarks, Readout, RowState, WeaponRowModel } from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const ROW = K.row;
const AB = K.abilities;
const T = K.type;
const MONO = CLIENT_CONFIG.type.mono;
// Carried from the retiring bar's block (today's values, O5 "today's dimAlpha"):
// the dim alpha, the one glow blur, the chip's side padding and the hairline.
const BAR = CLIENT_CONFIG.console;

/** The 9 px registers that counter-scale at the 90 % UI tier (the bar's rule). */
function microScale(uiScale: number): number {
  return Number.isFinite(uiScale) && uiScale > 0 && uiScale < 1 ? 1 / uiScale : 1;
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

/** Pure: the state word's colour (READY phosphor · ARMED amber · LOCKED denied). */
export function stateWordColor(state: RowState): number {
  if (state === 'readied') return C.amber;
  return state === 'locked' ? C.denied : C.phosphor;
}

/** Pure: a key chip's width — the bar's widening mono box (`LMB`, `Shift`). */
export function consoleChipWidth(glyph: string): number {
  return Math.max(ROW.keyChip, monoTextWidth(glyph, T.keyChip) + 2 * BAR.chipPadX);
}

/** Pure: R18 — the text a readout prints and whether it is a preview mark. */
export function markedValue(value: string, mark: PreviewMark | undefined): { text: string; amber: boolean } {
  if (mark === undefined) return { text: value, amber: false };
  return { text: `${mark.value}${mark.direction === 'up' ? '▲' : '▼'}`, amber: true };
}

/** Pure: the one-line stats text a row PRINTS (`DAMAGE 27×2 · RANGE 950 ·
 *  RELOAD 9.5S`) — each value in its hover form (`8.0S▼`) under a mark, the
 *  same tokens `statTokens` lays out — what the spine measures for growth. */
export function printedStatsLine(stats: readonly Readout[], preview: PreviewMarks | null): string {
  let line = '';
  stats.forEach((r, i) => {
    const v = markedValue(r.value, preview?.get(r.key)).text;
    line += `${i > 0 ? ' · ' : ''}${r.label === '' ? v : `${r.label} ${v}`}`;
  });
  return line;
}

/** Pure: every weapon row's two-line verdict on the line it PRINTS (hover
 *  marks applied) at the counter-scale it is DRAWN at, written into `out`
 *  (ruled row order); returns the verdicts as bits. */
export function statsTwoLineFlags(readouts: readonly Readout[], preview: PreviewMarks | null, micro: number, out: boolean[]): number {
  let bits = 0;
  WEAPON_ROW_KINDS.forEach((kind, i) => {
    out[i] = statsNeedTwoLines(printedStatsLine(rowStats(kind, readouts), preview), micro);
    if (out[i]) bits |= 1 << i;
  });
  return bits;
}

/** Pure: the tier numeral — `II→III` amber under a marked tier, else the ramp. */
export function tierLabel(row: WeaponRowModel, preview: PreviewMarks | null): { text: string; color: number } {
  const mark = preview?.get(`row.${row.kind}.tier`);
  if (mark !== undefined) return { text: row.tierNumeral === '' ? mark.value : `${row.tierNumeral}→${mark.value}`, color: C.amber };
  return { text: row.tierNumeral, color: tierRampColor(row.tier) };
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

/** One placed token on a stats line. */
export interface StatToken {
  label: string;
  value: string;
  amber: boolean;
  x: number;
  line: number;
  valueX: number;
}

/** Pure: the stats line laid out — labels muted, values phosphor (amber when
 *  marked), `·` between fields; wraps onto a second line only when the spine
 *  grew the row (`twoLine`). Positions are relative to the line's left edge. */
export function statTokens(row: WeaponRowModel, preview: PreviewMarks | null, width: number, twoLine: boolean, micro = 1): StatToken[] {
  const w = (s: string): number => monoTextWidth(s, T.stats, T.statsTracking) * micro;
  const out: StatToken[] = [];
  let x = 0;
  let line = 0;
  for (const r of row.stats) {
    const v = markedValue(r.value, preview?.get(r.key));
    const word = r.label === '' ? '' : `${r.label} `;
    let label = x > 0 ? `· ${word}` : word;
    const wrap = twoLine && line === 0 && x > 0 && x + w(label + v.text) > width;
    if (wrap) {
      line = 1;
      x = 0;
      label = word;
    }
    out.push({ label, value: v.text, amber: v.amber, x, line, valueX: x + w(label) });
    x += w(label + v.text + ' ');
  }
  return out;
}

// --- the Pixi shell ---------------------------------------------------------------

interface RowTexts {
  name: Text;
  state: Text;
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
  uiScale: number;
  denied: { rows: boolean[]; abilities: boolean[] };
  dim: boolean;
}

export type WeaponsConsoleLayout = ConsoleLayout['weapons'] & { abilities: ConsoleLayout['abilities'] };

/** An empty row's name and glyph alpha (the empty skin's dim icon). */
const EMPTY_ALPHA = 0.5;
/** A cooling clock's elapsed wedge alpha; a ready disc's fill. */
const WEDGE_ALPHA = 0.35;
const DISC_ALPHA = 0.9;
/** The heat bar's height as a share of line 2; its fill alphas; hatch pitch. */
const HEAT_H = 0.5;
const HEAT_FILL_ALPHA = 0.85;
const LOCK_WASH_ALPHA = 0.16;
const HATCH_PITCH = 4;
/** Gap between a rack's ring and its pips / between whole racks. */
const RACK_GAP = 4;

/** Where line 2's marks end (`x`) and how many clock numerals they used. */
interface Line2End {
  x: number;
  n: number;
}

function text(size: number, weight: '400' | '600', fill: number, anchorX = 0, letterSpacing = 0): Text {
  const t = new Text({ text: '', style: { fontFamily: MONO, fontSize: size, fontWeight: weight, fill, letterSpacing } });
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
  private readonly glowGfx = new Graphics();
  private readonly gfx = new Graphics();
  private readonly rowTexts: RowTexts[] = [];
  private readonly abilityTexts: AbilityTexts[] = [];
  private layout: WeaponsConsoleLayout | null = null;
  private breathPhase = 0;
  private lastBreathSec: number | null = null;
  private micro = 1;
  private preview: PreviewMarks | null = null;

  constructor(parent: Container) {
    parent.addChild(this.root);
    const blur = new BlurFilter({ strength: BAR.glowBlurPx, quality: 4 });
    blur.padding = BAR.glowBlurPx * 2;
    this.glowGfx.filters = [blur];
    this.root.addChild(this.glowGfx, this.gfx);
  }

  update(view: WeaponsConsoleView, layout: WeaponsConsoleLayout): void {
    this.root.visible = true;
    this.root.alpha = view.dim ? BAR.dimAlpha : 1;
    this.layout = layout;
    this.micro = microScale(view.uiScale);
    this.preview = view.preview;
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
   *  a row → its slot (null for the secondaries), a button → its ability. The
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

  // --- texts ----------------------------------------------------------------------

  private rowTextsAt(i: number): RowTexts {
    while (this.rowTexts.length <= i) {
      const rt: RowTexts = {
        name: text(T.name, '600', C.textPrimary),
        state: text(T.state, '600', C.phosphor),
        tier: text(T.tier, '600', C.phosphor),
        chip: text(T.keyChip, '600', C.phosphor, 0.5),
        numerals: [],
        labels: [],
        values: [],
      };
      this.root.addChild(rt.name, rt.state, rt.tier, rt.chip);
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
    for (const t of [rt.name, rt.state, rt.tier, rt.chip, ...rt.numerals, ...rt.labels, ...rt.values]) t.visible = false;
  }

  private place(t: Text, value: string, x: number, y: number, micro: boolean): void {
    t.visible = value !== '';
    setText(t, value);
    t.position.set(x, y);
    t.scale.set(micro ? this.micro : 1);
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
    const w = consoleChipWidth(glyph);
    const x = right - w;
    const y = cy - ROW.keyChip / 2;
    const g = this.gfx;
    if (selected) g.rect(x, y, w, ROW.keyChip).fill({ color: C.amber, alpha: 1 });
    else g.rect(x, y, w, ROW.keyChip).stroke({ width: BAR.lineW, color: denied ? C.denied : C.phosphor, alpha: denied ? 1 : 0.55 });
    setFill(t, keyChipGlyphColor(selected));
    this.place(t, glyph, x + w / 2, cy, true);
  }

  // --- one weapon row ---------------------------------------------------------------

  private drawRow(row: WeaponRowModel, rect: WeaponRowRect, denied: boolean, motion: MotionLevel, i: number): void {
    const rt = this.rowTextsAt(i);
    this.drawBox(rect, rowSkin(row.state, denied, motion));
    this.drawLine1(row, rect.line1, rt, denied);
    this.drawLine2(row, rect.line2, rt);
    this.drawStats(row, rect, rt);
  }

  private drawLine1(row: WeaponRowModel, l: Rect, rt: RowTexts, denied: boolean): void {
    const cy = l.y + l.h / 2;
    const empty = row.state === 'empty';
    this.place(rt.name, row.name, l.x, cy, false);
    rt.name.alpha = empty ? EMPTY_ALPHA : 1;
    let x = l.x + monoTextWidth(row.name, T.name) + ROW.padX;
    setFill(rt.state, stateWordColor(row.state));
    this.place(rt.state, row.stateWord, x, cy, true);
    if (row.stateWord !== '') x += monoTextWidth(row.stateWord, T.state) * this.micro + ROW.padX;
    const tier = tierLabel(row, this.preview);
    setFill(rt.tier, tier.color);
    this.place(rt.tier, tier.text, x, cy, true);
    this.drawChip(rt.chip, row.keyGlyph, l.x + l.w, cy, row.readied, denied);
  }

  private drawLine2(row: WeaponRowModel, l: Rect, rt: RowTexts): void {
    let end: Line2End = { x: l.x, n: 0 };
    if (row.heat !== null) this.drawHeat(row.heat.heat, row.heat.locked, l);
    else if (row.state === 'empty') end = this.drawEmptyGlyph(row, l);
    else if (row.kind === 'mines') end = this.drawRacks(row, l, rt);
    else end = this.drawClocks(row.clocks, l, rt);
    const key = clockCountKey(row);
    const extra = key === null ? 0 : extraMarks(this.preview, key);
    for (let k = 0; k < extra; k++) this.drawHollowClock(end.x + k * (ROW.clock + ROW.clockGap), l.y + l.h / 2);
    for (let k = end.n; k < rt.numerals.length; k++) rt.numerals[k].visible = false;
  }

  private drawClocks(clocks: readonly MountClock[], l: Rect, rt: RowTexts): Line2End {
    const cy = l.y + l.h / 2;
    let x = l.x;
    clocks.forEach((c, k) => {
      if (k > 0 && c.group !== clocks[k - 1].group) x += ROW.clockGap;
      this.drawClock(c, x, cy, rt, k);
      x += ROW.clock + ROW.clockGap;
    });
    return { x, n: clocks.length };
  }

  /** One 18 px ring: a solid phosphor disc when ready; otherwise a silver
   *  ring, the elapsed wedge clockwise from 12, the seconds numeral inside. */
  private drawClock(c: MountClock, x: number, cy: number, rt: RowTexts, k: number): void {
    const r = ROW.clock / 2;
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
    this.place(t, c.numeral, cx, cy, true);
  }

  private drawHollowClock(x: number, cy: number): void {
    this.gfx.circle(x + ROW.clock / 2, cy, ROW.clock / 2).stroke({ width: BAR.lineW, color: C.amber, alpha: 1 });
  }

  private rackPipsW(n: number): number {
    return n * (ROW.rackPip.w + ROW.rackPip.gap);
  }

  /** Mines: per rack its reload ring, then its held-mine pips (capacity from
   *  the model; a marked capacity adds hollow amber pips). */
  private drawRacks(row: WeaponRowModel, l: Rect, rt: RowTexts): Line2End {
    const cy = l.y + l.h / 2;
    const extraCap = extraMarks(this.preview, 'row.mines.capacity');
    const P = ROW.rackPip;
    let x = l.x;
    row.racks.forEach((rack, k) => {
      const c = row.clocks[k];
      if (c !== undefined) this.drawClock(c, x, cy, rt, k);
      x += ROW.clock + RACK_GAP;
      for (let j = 0; j < rack.capacity + extraCap; j++) {
        const px = x + j * (P.w + P.gap);
        const py = cy - P.h / 2;
        if (j < rack.held) this.gfx.rect(px, py, P.w, P.h).fill({ color: C.phosphor, alpha: DISC_ALPHA });
        else this.gfx.rect(px, py, P.w, P.h).stroke({ width: BAR.lineW, color: j < rack.capacity ? C.textMuted : C.amber, alpha: j < rack.capacity ? 0.6 : 1 });
      }
      x += this.rackPipsW(rack.capacity + extraCap) + ROW.clockGap;
    });
    return { x, n: Math.min(row.racks.length, row.clocks.length) };
  }

  /** The secondaries' heat bar: phosphor fill to the heat; LOCKED = the
   *  denied outline, a denied wash and the hatch over the fill. */
  private drawHeat(heat: number, locked: boolean, l: Rect): void {
    const h = l.h * HEAT_H;
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

  /** An empty row: the family glyph, dim, where the first clock would be. */
  private drawEmptyGlyph(row: WeaponRowModel, l: Rect): Line2End {
    if (row.emptyGlyph !== null) {
      const style = { width: 1.5, color: C.textMuted, alpha: EMPTY_ALPHA };
      drawEquipmentIcon(this.gfx, row.emptyGlyph, l.x + ROW.clock / 2, l.y + l.h / 2, ROW.clock, style);
    }
    return { x: l.x + ROW.clock + ROW.clockGap, n: 0 };
  }

  private drawStats(row: WeaponRowModel, rect: WeaponRowRect, rt: RowTexts): void {
    const s = rect.stats;
    const tokens = statTokens(row, this.preview, s.w, rect.twoLine, this.micro);
    tokens.forEach((tok, k) => {
      const y = s.y + ROW.statsLineH * tok.line + ROW.statsLineH / 2;
      const label = this.pooled(rt.labels, k, () => text(T.stats, '400', C.textMuted, 0, T.statsTracking));
      const value = this.pooled(rt.values, k, () => text(T.stats, '600', C.phosphor, 0, T.statsTracking));
      this.place(label, tok.label, s.x + tok.x, y, true);
      setFill(value, tok.amber ? C.amber : C.phosphor);
      this.place(value, tok.value, s.x + tok.valueX, y, true);
    });
    for (let k = tokens.length; k < rt.labels.length; k++) {
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
   *  top-right corner, the name centred at the foot, the progress hairline
   *  along the bottom edge while cooling. A marked C / V cooldown prints its
   *  incoming value amber in place of the word. */
  private drawAbility(ab: AbilityModel, r: AbilityRect, skin: ConsoleSkin, denied: boolean, i: number): void {
    const at = this.abilityTextsAt(i);
    this.drawBox(r, skin);
    const cx = r.x + r.w / 2;
    const midY = r.y + r.h / 2;
    const mark = ab.kind === 'shift' ? undefined : this.preview?.get(`ability.${ab.kind}.cooldown`);
    const word = markedValue(ab.stateWord, mark);
    setFill(at.word, word.amber ? C.amber : C.phosphor);
    this.place(at.word, word.text, cx, midY, false);
    this.place(at.numeral, word.text === '' ? ab.numeral : '', cx, midY, false);
    const inset = ROW.padX / 2;
    this.drawChip(at.chip, ab.keyGlyph, r.x + r.w - inset, r.y + inset + ROW.keyChip / 2, false, denied);
    this.place(at.name, ab.name, cx, r.y + r.h - AB.progressH - T.abilityName, true);
    if (ab.state === 'cooling' && ab.progress > 0) {
      this.gfx.rect(r.x, r.y + r.h - AB.progressH, r.w * Math.min(1, ab.progress), AB.progressH).fill({ color: C.phosphor, alpha: 1 });
    }
  }
}
