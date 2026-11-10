// THE SHIP CONSOLE (Story 10.10, plan O6 with Eric's R20 / R21 / R24; epic-10
// amendments 16 / 17 / 18) — the left-edge Pixi surface that replaced the HP
// globe, the helm globe and the XP strip. COMPACT (R21), on a dark-glass bed
// (R24), top to bottom, bottom-anchored on the left edge:
//
//   HULL    the percent numeral in its band colour over a 10-segment bar
//           (filled segments in the band colour, the pooled HULL REPAIR climb
//           lighter above them), breathing below 50 % exactly as the globe did
//   INDICES ARMOR · POWER · RELOAD · ENGINES · INTEL · RANGE — label, value,
//           and the five-bar TIER LADDER (R20) filled per card held
//   HELM    `HDG 045°` / `18.0 KTS`, the nine-detent telegraph laid flat
//           (hollow phosphor rung = ordered, solid amber needle = actual), the
//           rudder track, the W / S / A / D coach marks that fade once learned
//   LEVEL   `LV n`, the banked-level chip (its breath and Tier-3 freeze are
//           the strip's), the XP track
//
// THE HOVER PREVIEW (R18): a hovered offer card's marks (`hoverPreview`, a
// real re-fold) turn every index value it would change AMBER with ▲ / ▼ and
// the new value, and the ladder bar it would fill draws hollow amber. Nothing
// else changes colour.
//
// Every geometric fact comes from the pure spine (`ShipConsoleLayout`), every
// number from the pure view model (readouts.ts and the hull / level / helm
// cores it re-exports). This module only draws, and only when something it
// draws changed: Graphics are redrawn on a changed input, Text is assigned
// only on a changed string, and the strings themselves are built only when the
// numbers behind them moved — the per-frame path allocates nothing.

import { Container, Graphics, Text } from 'pixi.js';
import { INDEX_IDS } from '@salvo/shared';
import { CLIENT_CONFIG } from '../../config.js';
import { motionAllowed, motionScaled, settings } from '../../settings/store.js';
import { monoTextWidth } from '../../util/monoMeasure.js';
import { indexWord } from '../../ui/boonCopy.js';
import { easeHold } from '../zone.js';
import { drawHudBed } from '../hudBed.js';
import { glyphFadeAlpha, helmGlyphs, type HelmGlyphStore, type HelmPair } from '../helmGlyphs.js';
import {
  READOUT_KEY,
  XP_CHIP_IDLE,
  DETENTS,
  STOP_DETENT,
  advancePulsePhase,
  chipHeld,
  chipLabel,
  detentTickX,
  headingText,
  hullColor,
  hullFillHeld,
  hullFraction,
  hullPercent,
  hullSegments,
  levelTag,
  needleX,
  nextChipState,
  repairFraction,
  rudderTickCenter,
  speedText,
  xpFillFraction,
  type LadderKin,
  type PreviewMark,
  type PreviewMarks,
  type Readout,
  type XpChipState,
} from './readouts.js';
import type { Rect, ShipConsoleLayout } from './layout.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const TY = K.type;
const H = K.hull;
const CH = K.chip;
const TK = K.tick;
const MONO = CLIENT_CONFIG.type.mono;

/** The label register's tracking (the sitting's `.lbl`, .16em). */
const LABEL_TRACKING = TY.label * 0.16;
/** Line alphas on existing tokens (the sitting's CSS, read literally). */
const A = {
  segEdge: 0.3,
  tick: 0.4,
  stopTick: 0.6,
  rudderTrack: 0.4,
  rudderCentre: 0.5,
  barEdge: 0.6,
  trackFill: 0.06,
  trackBorder: 0.25,
  chipBorder: 0.65,
  chipBed: 0.6,
} as const;

/** The arrows a preview mark prints beside its incoming value (R18). */
export const PREVIEW_ARROW = { up: '▲', down: '▼' } as const;

/** The index readout keys, spelled once (no per-frame string building). */
const INDEX_KEYS: readonly string[] = INDEX_IDS.map((id) => READOUT_KEY.index(id));
const HELD_KEYS: readonly string[] = INDEX_IDS.map((id) => READOUT_KEY.held(id));

/** Everything the ship console reads for one frame. */
export interface ShipConsoleView {
  hp: number;
  maxHp: number;
  repairHp: number;
  /** The amber corollary's verdict for the hull channel (`hullHoldsLit`):
   *  true = the ring outranked the hull, which eases to its lit keyframe. */
  hullHold: boolean;
  /** This frame's readouts (`consoleReadouts`) — the indices and their held
   *  cards. Pass the SAME array while nothing changed (it is memoised). */
  readouts: readonly Readout[];
  /** The hovered offer card's marks, or null (R18). */
  preview: PreviewMarks | null;
  headingRad: number;
  speed: number;
  orderedDetent: number;
  rudder: number;
  /** The needle's denominators — already boosted (`helmKinematics`). */
  kin: LadderKin;
  lvl: number;
  xp: number;
  pts: number;
  /** A higher attention tier holds the bank chip at its dim keyframe. */
  freeze: boolean;
  /** Server-clock estimate, seconds (the breath clock). */
  nowSec: number;
  /** Monotonic frame clock, ms (the freeze ease). */
  nowMs: number;
  /** The HUD factor (viewport × UI tier). Not read: every register here is a
   *  text-rule size (≥ 14 px) that clears the mono floor at the smallest HUD
   *  factor, so nothing counter-scales (consoleLayout.test.ts pins that). */
  uiScale: number;
}

/** Pure: the text an index value prints — the plain value, or under a
 *  preview mark the incoming value and its arrow. */
export function indexValueText(value: number, mark: PreviewMark | undefined): string {
  return mark === undefined ? String(value) : `${mark.value}${PREVIEW_ARROW[mark.direction]}`;
}

function text(str: string, size: number, fill: number, weight = '400', letterSpacing = 0): Text {
  return new Text({ text: str, style: { fontFamily: MONO, fontSize: size, fontWeight: weight as '400', fill, letterSpacing } });
}

function setText(t: Text, s: string): void {
  if (t.text !== s) t.text = s;
}

function setFill(t: Text, color: number): void {
  if (t.style.fill !== color) t.style.fill = color;
}

// --- HULL -----------------------------------------------------------------------

class HullGauge {
  private readonly bed = new Graphics();
  private readonly fill = new Graphics();
  private readonly pending = new Graphics();
  private readonly num = text('', TY.hull, C.phosphor, '600');
  private readonly unit = text('%', TY.hullUnit, C.textMuted);
  private readonly label = text('HULL', TY.label, C.textMuted, '400', LABEL_TRACKING);
  private layout: ShipConsoleLayout | null = null;
  private lastPct = -1;
  private lastFracQ = -1;
  private lastPendQ = -1;
  private phase = 0;
  private lastSec: number | null = null;
  private hold = 0;

  constructor(root: Container) {
    this.num.anchor.set(0, 1);
    this.unit.anchor.set(0, 1);
    this.label.anchor.set(1, 1);
    root.addChild(this.bed, this.pending, this.fill, this.num, this.unit, this.label);
  }

  update(v: ShipConsoleView, l: ShipConsoleLayout): void {
    const frac = hullFraction(v.hp, v.maxHp);
    const pend = repairFraction(v.hp, v.repairHp, v.maxHp);
    const relaid = l !== this.layout;
    if (relaid) this.relayout(l);
    this.readout(v, frac, relaid);
    this.drawFill(l, frac, pend, relaid);
    this.breathe(frac, v.nowSec, v.hullHold);
  }

  private relayout(l: ShipConsoleLayout): void {
    this.layout = l;
    this.bed.clear();
    for (const s of l.segments) this.bed.rect(s.x, s.y, s.w, s.h).stroke({ width: 1, color: C.silver, alpha: A.segEdge });
    const base = l.hullLine.y + l.hullLine.h;
    this.num.position.set(l.hullLine.x, base);
    this.label.position.set(l.hullLine.x + l.hullLine.w, base);
  }

  private readout(v: ShipConsoleView, frac: number, relaid: boolean): void {
    const pct = hullPercent(v.hp, v.maxHp);
    if (pct === this.lastPct && !relaid) return;
    this.lastPct = pct;
    setText(this.num, String(pct));
    setFill(this.num, hullColor(frac));
    const l = this.layout!;
    this.unit.position.set(l.hullLine.x + monoTextWidth(this.num.text, TY.hull) + 4, l.hullLine.y + l.hullLine.h - 4);
  }

  private drawFill(l: ShipConsoleLayout, frac: number, pend: number, relaid: boolean): void {
    const fq = Math.round(frac * 1000);
    const pq = Math.round(pend * 1000);
    if (fq === this.lastFracQ && pq === this.lastPendQ && !relaid) return;
    this.lastFracQ = fq;
    this.lastPendQ = pq;
    const color = hullColor(frac);
    const segs = hullSegments(frac, pend, l.segments.length);
    this.fill.clear();
    this.pending.clear();
    for (let i = 0; i < l.segments.length; i++) paintSegment(this.fill, this.pending, l.segments[i], segs[i], color);
  }

  private breathe(frac: number, nowSec: number, hold: boolean): void {
    const dt = this.lastSec === null ? 0 : nowSec - this.lastSec;
    this.lastSec = nowSec;
    this.phase = advancePulsePhase(this.phase, frac, dt);
    this.hold = easeHold(this.hold, hold ? 1 : 0, Math.max(0, dt) * 1000);
    const amp = motionScaled(H.pulseAmp, settings.current.motion);
    this.fill.alpha = hullFillHeld(frac, this.phase, amp, this.hold);
  }

  reset(): void {
    this.phase = 0;
    this.lastSec = null;
    this.hold = 0;
  }

  get fillAlpha(): number {
    return this.fill.alpha;
  }

  get text(): string {
    return `${this.num.text}${this.unit.text}`;
  }
}

function paintSegment(fill: Graphics, pending: Graphics, s: Rect, seg: { fill: number; pending: number }, color: number): void {
  const fw = s.w * seg.fill;
  if (fw > 0) fill.rect(s.x, s.y, fw, s.h).fill({ color, alpha: 1 });
  const pw = s.w * seg.pending;
  if (pw > 0) pending.rect(s.x + fw, s.y, pw, s.h).fill({ color, alpha: H.pendingAlpha });
}

// --- INDICES --------------------------------------------------------------------

class IndexRows {
  private readonly labels: Text[];
  private readonly values: Text[];
  private readonly bars = new Graphics();
  private layout: ShipConsoleLayout | null = null;
  private readouts: readonly Readout[] | null = null;
  private readonly value = INDEX_IDS.map(() => 0);
  private readonly held = INDEX_IDS.map(() => 0);
  /** Per row, what the value Text last printed: the value, the mark's raw
   *  (NaN = none) and its direction — the string is rebuilt only on a change. */
  private readonly shown = INDEX_IDS.map(() => ({ value: NaN, mark: NaN, up: true }));
  private barsSig = -1;

  constructor(root: Container) {
    this.labels = INDEX_IDS.map((id) => text(indexWord(id), TY.indexLabel, C.textMuted, '400', TY.indexLabel * 0.12));
    this.values = INDEX_IDS.map(() => text('', TY.indexValue, C.phosphor, '600'));
    for (const t of [...this.labels, ...this.values]) t.anchor.set(0, 0.5);
    root.addChild(this.bars, ...this.labels, ...this.values);
  }

  update(v: ShipConsoleView, l: ShipConsoleLayout): void {
    if (v.readouts !== this.readouts) this.read(v.readouts);
    const relaid = l !== this.layout;
    if (relaid) this.relayout(l);
    for (let i = 0; i < INDEX_IDS.length; i++) this.paintValue(i, v.preview?.get(INDEX_KEYS[i]), relaid);
    this.paintBars(l, v.preview, relaid);
  }

  /** Pick the six values and held counts out of the readouts (on change only). */
  private read(readouts: readonly Readout[]): void {
    this.readouts = readouts;
    for (const r of readouts) {
      const vi = INDEX_KEYS.indexOf(r.key);
      if (vi >= 0) this.value[vi] = r.raw;
      const hi = HELD_KEYS.indexOf(r.key);
      if (hi >= 0) this.held[hi] = r.raw;
    }
  }

  private relayout(l: ShipConsoleLayout): void {
    this.layout = l;
    l.indices.forEach((row, i) => {
      this.labels[i].position.set(row.label.x, row.y + row.h / 2);
      this.values[i].position.set(row.value.x, row.y + row.h / 2);
    });
  }

  private paintValue(i: number, mark: PreviewMark | undefined, relaid: boolean): void {
    const s = this.shown[i];
    const markRaw = mark === undefined ? NaN : mark.raw;
    const up = mark === undefined || mark.direction === 'up';
    const same = s.value === this.value[i] && Object.is(s.mark, markRaw) && s.up === up;
    if (same && !relaid) return;
    s.value = this.value[i];
    s.mark = markRaw;
    s.up = up;
    setText(this.values[i], indexValueText(this.value[i], mark));
    setFill(this.values[i], mark === undefined ? C.phosphor : C.amber);
  }

  /** The five-bar ladders: filled per card held, the bar a hovered card would
   *  fill hollow amber, the rest silver outlines. */
  private paintBars(l: ShipConsoleLayout, preview: PreviewMarks | null, relaid: boolean): void {
    let sig = 0;
    for (let i = 0; i < INDEX_IDS.length; i++) {
      const next = preview?.get(HELD_KEYS[i])?.raw ?? this.held[i];
      sig = sig * 37 + this.held[i] * 7 + next;
    }
    if (sig === this.barsSig && !relaid) return;
    this.barsSig = sig;
    this.bars.clear();
    l.indices.forEach((row, i) => {
      const next = preview?.get(HELD_KEYS[i])?.raw ?? this.held[i];
      row.bars.forEach((b, k) => paintBar(this.bars, b, k < this.held[i] ? 'held' : k < next ? 'preview' : 'empty'));
    });
  }

  valueText(i: number): string {
    return this.values[i].text;
  }

  valueColor(i: number): number {
    return this.values[i].style.fill as number;
  }
}

function paintBar(g: Graphics, b: Rect, state: 'held' | 'preview' | 'empty'): void {
  if (state === 'held') {
    g.rect(b.x, b.y, b.w, b.h).fill({ color: C.phosphor, alpha: 1 });
    return;
  }
  const color = state === 'preview' ? C.amber : C.silver;
  g.rect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1).stroke({ width: 1, color, alpha: state === 'preview' ? 1 : A.barEdge });
}

// --- HELM -----------------------------------------------------------------------

/** The four coach marks: W / S at the telegraph's ends (astern left), A / D at
 *  the rudder track's. Each pair fades once learned (render/helmGlyphs.ts). */
const COACH: readonly { pair: HelmPair; glyph: string; end: 'ladderL' | 'ladderR' | 'rudderL' | 'rudderR' }[] = [
  { pair: 'ws', glyph: 'S', end: 'ladderL' },
  { pair: 'ws', glyph: 'W', end: 'ladderR' },
  { pair: 'ad', glyph: 'A', end: 'rudderL' },
  { pair: 'ad', glyph: 'D', end: 'rudderR' },
];
const COACH_GAP = 8;

class HelmInstrument {
  private readonly hdgLabel = text('HDG', TY.label, C.textMuted, '400', LABEL_TRACKING);
  private readonly hdg = text('', TY.hdg, C.phosphor, '600');
  private readonly kts = text('', TY.kts, C.phosphor, '600');
  private readonly ktsLabel = text('KTS', TY.label, C.textMuted, '400', LABEL_TRACKING);
  private readonly ticks = new Graphics();
  private readonly marks = new Graphics();
  private readonly coach: Text[];
  private readonly pairs: Record<HelmPair, Text[]> = { ws: [], ad: [] };
  private readonly fadeStart: Record<HelmPair, number | null> = { ws: null, ad: null };
  private readonly wasFaded: Record<HelmPair, boolean>;
  private layout: ShipConsoleLayout | null = null;
  private lastHdg = NaN;
  private lastSpd = NaN;
  private lastMarks = { rung: -1, needle: NaN, rudder: NaN };

  constructor(root: Container, private readonly glyphs: HelmGlyphStore = helmGlyphs) {
    this.hdgLabel.anchor.set(0, 1);
    this.hdg.anchor.set(0, 1);
    this.kts.anchor.set(1, 1);
    this.ktsLabel.anchor.set(1, 1);
    this.coach = COACH.map((c) => {
      const t = text(c.glyph, TY.label, C.textSecondary);
      t.anchor.set(c.end.endsWith('L') ? 1 : 0, 0.5);
      this.pairs[c.pair].push(t);
      return t;
    });
    this.wasFaded = { ws: glyphs.faded('ws'), ad: glyphs.faded('ad') };
    root.addChild(this.ticks, this.marks, this.hdgLabel, this.hdg, this.kts, this.ktsLabel, ...this.coach);
  }

  update(v: ShipConsoleView, l: ShipConsoleLayout): void {
    const relaid = l !== this.layout;
    if (relaid) this.relayout(l);
    this.readouts(v, relaid);
    this.paintMarks(v, l, relaid);
    this.fadeCoach(v.nowSec);
  }

  private relayout(l: ShipConsoleLayout): void {
    this.layout = l;
    const base = l.helmReadout.y + l.helmReadout.h;
    this.hdgLabel.position.set(l.helmReadout.x, base - 3);
    this.hdg.position.set(l.helmReadout.x + monoTextWidth('HDG', TY.label, LABEL_TRACKING) + 6, base);
    this.ktsLabel.position.set(l.helmReadout.x + l.helmReadout.w, base - 2);
    this.kts.position.set(this.ktsLabel.x - monoTextWidth('KTS', TY.label, LABEL_TRACKING) - 6, base);
    drawLadderTicks(this.ticks, l.ladder, l.rudder);
    COACH.forEach((c, i) => this.coach[i].position.set(...coachPoint(c.end, l)));
  }

  /** The HDG readout as drawn (test seam). */
  get headingReadout(): string {
    return this.hdg.text;
  }

  private readouts(v: ShipConsoleView, relaid: boolean): void {
    const hdg = Math.round((v.headingRad * 1800) / Math.PI);
    // An unreadable heading keeps the last one drawn: no per-frame string.
    if (Number.isFinite(hdg) && (hdg !== this.lastHdg || relaid)) {
      this.lastHdg = hdg;
      setText(this.hdg, headingText(v.headingRad));
    }
    const spd = Math.round(Math.abs(v.speed) * 10);
    if (spd !== this.lastSpd || relaid) {
      this.lastSpd = spd;
      setText(this.kts, speedText(v.speed));
    }
  }

  /** The ordered rung, the actual needle and the rudder tick (redrawn only
   *  when one moved by half a pixel). */
  private paintMarks(v: ShipConsoleView, l: ShipConsoleLayout, relaid: boolean): void {
    const lad = l.ladder;
    const rung = Math.max(0, Math.min(DETENTS - 1, v.orderedDetent));
    const needle = Math.round(needleX(v.speed, v.kin, lad.x, lad.w) * 2) / 2;
    const rud = l.rudder;
    const rudder = Math.round(rudderTickCenter(v.rudder, rud.x, rud.w, TK.rudderW / 2) * 2) / 2;
    const m = this.lastMarks;
    if (m.rung === rung && m.needle === needle && m.rudder === rudder && !relaid) return;
    m.rung = rung;
    m.needle = needle;
    m.rudder = rudder;
    const g = this.marks;
    g.clear();
    const cy = lad.y + lad.h / 2;
    g.rect(detentTickX(rung, lad.x, lad.w) - TK.rungW / 2, cy - TK.rungH / 2, TK.rungW, TK.rungH).stroke({ width: 1, color: C.phosphor, alpha: 1 });
    g.rect(needle - TK.needleW / 2, lad.y, TK.needleW, lad.h).fill({ color: C.amber, alpha: 1 });
    g.rect(rudder - TK.rudderW / 2, rud.y + (rud.h - TK.rudderH) / 2, TK.rudderW, TK.rudderH).fill({ color: C.amber, alpha: 1 });
  }

  private fadeCoach(nowSec: number): void {
    const animate = motionAllowed(settings.current.motion);
    for (const pair of ['ws', 'ad'] as const) {
      const faded = this.glyphs.faded(pair);
      if (faded && !this.wasFaded[pair]) {
        this.wasFaded[pair] = true;
        this.fadeStart[pair] = nowSec;
      }
      const alpha = glyphFadeAlpha(faded, this.fadeStart[pair], nowSec, animate);
      for (const t of this.pairs[pair]) {
        t.alpha = alpha;
        t.visible = alpha > 0;
      }
    }
  }

  /** A pair that faded while the console was hidden must not replay its fade. */
  seedFaded(): void {
    for (const pair of ['ws', 'ad'] as const) if (this.glyphs.faded(pair)) this.wasFaded[pair] = true;
  }
}

function coachPoint(end: (typeof COACH)[number]['end'], l: ShipConsoleLayout): [number, number] {
  const lad = l.ladder;
  const rud = l.rudder;
  if (end === 'ladderL') return [lad.x - COACH_GAP, lad.y + lad.h / 2];
  if (end === 'ladderR') return [lad.x + lad.w + COACH_GAP, lad.y + lad.h / 2];
  if (end === 'rudderL') return [rud.x - COACH_GAP, rud.y + rud.h / 2];
  return [rud.x + rud.w + COACH_GAP, rud.y + rud.h / 2];
}

/** The nine detent ticks (STOP longer and brighter) and the rudder track with
 *  its centre tick — static linework, redrawn on a re-layout only. */
function drawLadderTicks(g: Graphics, lad: Rect, rud: Rect): void {
  g.clear();
  const cy = lad.y + lad.h / 2;
  for (let i = 0; i < DETENTS; i++) {
    const x = detentTickX(i, lad.x, lad.w);
    const stop = i === STOP_DETENT;
    const len = stop ? TK.stopLen : TK.len;
    g.rect(x - 0.5, cy - len / 2, 1, len).fill({ color: C.silver, alpha: stop ? A.stopTick : A.tick });
  }
  const ry = rud.y + rud.h / 2;
  g.rect(rud.x, ry - 0.5, rud.w, 1).fill({ color: C.silver, alpha: A.rudderTrack });
  g.rect(rud.x + rud.w / 2 - 0.5, ry - TK.rudderH / 2, 1, TK.rudderH).fill({ color: C.silver, alpha: A.rudderCentre });
}

// --- LEVEL ----------------------------------------------------------------------

class LevelBlock {
  private readonly lv = text('', TY.lv, C.phosphor, '600', TY.lv * 0.06);
  private readonly chipBox = new Graphics();
  private readonly count = text('', TY.bankCount, C.phosphor, '600');
  private readonly track = new Graphics();
  private layout: ShipConsoleLayout | null = null;
  private chip: XpChipState = XP_CHIP_IDLE;
  private freezeBlend = 0;
  private lastFreezeMs = -1;
  private lastLvl = -1;
  private lastPts = -1;
  private lastXpQ = -1;

  constructor(root: Container) {
    this.lv.anchor.set(0, 0.5);
    this.count.anchor.set(0.5);
    root.addChild(this.track, this.chipBox, this.lv, this.count);
  }

  update(v: ShipConsoleView, l: ShipConsoleLayout): void {
    const relaid = l !== this.layout;
    if (relaid) this.relayout(l);
    if (v.lvl !== this.lastLvl) {
      this.lastLvl = v.lvl;
      setText(this.lv, levelTag(v.lvl));
    }
    this.paintChip(v);
    this.paintTrack(l, xpFillFraction(v.xp), relaid);
  }

  private relayout(l: ShipConsoleLayout): void {
    this.layout = l;
    this.lv.position.set(l.levelRow.x, l.levelRow.y + l.levelRow.h / 2);
    const c = l.bankChip;
    this.chipBox.clear();
    this.chipBox.rect(c.x, c.y, c.w, c.h).fill({ color: C.cardScrim, alpha: A.chipBed });
    this.chipBox.rect(c.x, c.y, c.w, c.h).stroke({ width: 1, color: C.phosphor, alpha: A.chipBorder });
    this.count.position.set(c.x + c.w / 2, c.y + c.h / 2);
  }

  private paintChip(v: ShipConsoleView): void {
    this.chip = nextChipState(this.chip, v.pts, v.nowSec);
    const dtMs = this.lastFreezeMs < 0 ? 0 : v.nowMs - this.lastFreezeMs;
    this.lastFreezeMs = v.nowMs;
    this.freezeBlend = easeHold(this.freezeBlend, v.freeze ? 1 : 0, dtMs);
    if (v.pts !== this.lastPts) {
      this.lastPts = v.pts;
      setText(this.count, chipLabel(v.pts));
    }
    const shown = v.pts > 0;
    this.chipBox.visible = shown;
    this.count.visible = shown;
    const alpha = chipHeld(this.chip, v.nowSec, motionScaled(CH.pulseAmp, settings.current.motion), this.freezeBlend);
    this.chipBox.alpha = alpha;
    this.count.alpha = alpha;
  }

  private paintTrack(l: ShipConsoleLayout, frac: number, relaid: boolean): void {
    const q = Math.round(frac * 1000);
    if (q === this.lastXpQ && !relaid) return;
    this.lastXpQ = q;
    const t = l.track;
    const g = this.track;
    g.clear();
    g.rect(t.x, t.y, t.w, t.h).fill({ color: C.phosphor, alpha: A.trackFill });
    g.rect(t.x, t.y, t.w, t.h).stroke({ width: 1, color: C.phosphor, alpha: A.trackBorder });
    if (frac > 0) g.rect(t.x, t.y, t.w * frac, t.h).fill({ color: C.phosphor, alpha: 1 });
  }

  /** A real hide drops the chip's breath and the freeze with the hull. */
  reset(): void {
    this.chip = XP_CHIP_IDLE;
    this.freezeBlend = 0;
    this.lastFreezeMs = -1;
  }

  get chipAlpha(): number {
    return this.chipBox.alpha;
  }

  get chipVisible(): boolean {
    return this.chipBox.visible;
  }
}

// --- the console ----------------------------------------------------------------

/**
 * The ship console. Lives on `stage.layers.hud` (UI-scaled with every HUD
 * surface). Shown while the player cons a hull — the held start line and the
 * whole sinking window included — and hidden at FOUNDER, spectate and port.
 */
export class ShipConsole {
  private readonly root = new Container();
  /** R24's dark-glass bed under the whole console. */
  private readonly bedGfx = new Graphics();
  private readonly hull: HullGauge;
  private readonly indices: IndexRows;
  private readonly helm: HelmInstrument;
  private readonly level: LevelBlock;
  private layout: ShipConsoleLayout | null = null;

  constructor(parent: Container, glyphs?: HelmGlyphStore) {
    this.root.addChild(this.bedGfx);
    this.hull = new HullGauge(this.root);
    this.indices = new IndexRows(this.root);
    this.helm = new HelmInstrument(this.root, glyphs);
    this.level = new LevelBlock(this.root);
    this.root.visible = false;
    parent.addChild(this.root);
  }

  /** One frame. `layout` is the spine's ship rect set — pass the SAME object
   *  until the viewport changes. */
  update(view: ShipConsoleView, layout: ShipConsoleLayout): void {
    if (!this.root.visible) this.helm.seedFaded();
    this.root.visible = true;
    if (layout !== this.layout) drawHudBed(this.bedGfx, layout.bed);
    this.layout = layout;
    this.hull.update(view, layout);
    this.indices.update(view, layout);
    this.helm.update(view, layout);
    this.level.update(view, layout);
  }

  /** Hidden with the hull (founder / spectate / port): the breath state dies
   *  with it, so the next life starts cold. */
  hide(): void {
    this.root.visible = false;
    this.hull.reset();
    this.level.reset();
  }

  /** Hidden for a TRANSIENT pose gap — every breathing state KEPT (a gap the
   *  player never saw must not re-arm the bank chip's window). */
  hideTransient(): void {
    this.root.visible = false;
  }

  // --- test / debug seams -------------------------------------------------------

  get visible(): boolean {
    return this.root.visible;
  }

  /** The HDG readout as drawn (test seam). */
  get headingReadout(): string {
    return this.helm.headingReadout;
  }

  get hullText(): string {
    return this.hull.text;
  }

  get hullFillAlpha(): number {
    return this.hull.fillAlpha;
  }

  indexValueText(i: number): string {
    return this.indices.valueText(i);
  }

  indexValueColor(i: number): number {
    return this.indices.valueColor(i);
  }

  get chipAlpha(): number {
    return this.level.chipAlpha;
  }

  get chipVisible(): boolean {
    return this.level.chipVisible;
  }

  /** The layout last drawn (null before the first frame). */
  get drawnLayout(): ShipConsoleLayout | null {
    return this.layout;
  }
}
