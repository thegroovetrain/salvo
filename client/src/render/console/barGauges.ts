// THE BAR'S FOOTER (Story 12.3 Part B, AC 33) — three vertical gauges side by
// side, pinned to the bottom of the bar:
//
//   HULL      ten segments filled FROM THE BOTTOM in the band colour (phosphor
//             ≥ 50 %, amber ≥ 25 %, red below), the pooled HULL REPAIR climb
//             lighter above them, breathing below 50 % exactly as the hull
//             gauge always has; the whole-number percent under it
//   THROTTLE  the nine detents, ahead on top (STOP longer and brighter), the
//             labels FULL / ½ / STOP / ½ / FULL, a box at the ORDERED detent,
//             an arrow at the ACTUAL speed; the word under it (`¾ AHEAD`)
//   LEVEL     the XP track filling toward the next level; `LV n` under it,
//             with the banked-level chip beside it (its breath and Tier-3
//             freeze are the XP strip's) [reading: Story 12.3 Part B — the
//             bank chip stays, beside LV n]
//
// HDG / KTS, the rudder track and the W / S / A / D coach marks left the HUD
// (AC 33). Graphics redraw only on a changed input; Text only on a changed string.

import { Container, Graphics, type Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../../config.js';
import { motionScaled, settings } from '../../settings/store.js';
import { easeHold } from '../zone.js';
import { monoText, place, setFill } from './barDraw.js';
import type { FooterRect, GaugeRect, LevelGaugeRect, Rect } from './layout.js';
import {
  DETENT_LABELS,
  DETENTS,
  STOP_DETENT,
  XP_CHIP_IDLE,
  advancePulsePhase,
  chipHeld,
  chipLabel,
  detentY,
  hullColor,
  hullFillHeld,
  hullFraction,
  hullPercent,
  hullSegments,
  labelledDetent,
  levelTag,
  nextChipState,
  repairFraction,
  speedY,
  throttleWord,
  xpFillFraction,
  type LadderKin,
  type XpChipState,
} from './readouts.js';

const C = CLIENT_CONFIG.colors;
const K = CLIENT_CONFIG.console;
const G = K.gauges;
const TH = G.throttle;
const T = K.type;
const H = K.hull;

/** Line alphas on existing tokens (the bench's CSS, read literally). */
const A = { seg: 0.45, tick: 0.6, xpEdge: 0.45, xpFill: 0.85, chipBorder: 0.65, chipBed: 0.6 } as const;
/** The label register's tracking (the bench's `.gl`, .1em). */
const LABEL_TRACKING = T.gaugeLabel * 0.1;

/** Everything the footer reads for one frame. */
export interface GaugesView {
  hp: number;
  maxHp: number;
  repairHp: number;
  /** The amber corollary's verdict for the hull channel (`hullHoldsLit`). */
  hullHold: boolean;
  speed: number;
  orderedDetent: number;
  /** The arrow's denominators — already boosted (`helmKinematics`). */
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
  uiScale: number;
}

function label(text: string): Text {
  const t = monoText(T.gaugeLabel, '400', C.textMuted, 0.5, LABEL_TRACKING);
  t.text = text;
  return t;
}

// --- HULL -----------------------------------------------------------------------

class HullGauge {
  private readonly bed = new Graphics();
  private readonly pending = new Graphics();
  private readonly fill = new Graphics();
  private readonly value = monoText(T.gaugeValue, '600', C.phosphor, 0.5);
  private readonly label = label('HULL');
  private rect: GaugeRect | null = null;
  private sig = '';
  private phase = 0;
  private lastSec: number | null = null;
  private hold = 0;

  constructor(root: Container) {
    root.addChild(this.bed, this.pending, this.fill, this.label, this.value);
  }

  update(v: GaugesView, r: GaugeRect): void {
    const frac = hullFraction(v.hp, v.maxHp);
    const pend = repairFraction(v.hp, v.repairHp, v.maxHp);
    const sig = `${Math.round(frac * 1000)}|${Math.round(pend * 1000)}`;
    if (r !== this.rect || sig !== this.sig) this.draw(r, frac, pend, sig);
    setFill(this.value, hullColor(frac));
    place(this.value, `${hullPercent(v.hp, v.maxHp)}%`, r.value.x + r.value.w / 2, r.value.y + r.value.h / 2, v.uiScale);
    this.breathe(frac, v.nowSec, v.hullHold);
  }

  private draw(r: GaugeRect, frac: number, pend: number, sig: string): void {
    this.rect = r;
    this.sig = sig;
    this.label.position.set(r.label.x + r.label.w / 2, r.label.y + r.label.h / 2);
    const segs = hullSegmentRects(r.gauge);
    const fills = hullSegments(frac, pend, segs.length);
    const color = hullColor(frac);
    this.bed.clear();
    this.fill.clear();
    this.pending.clear();
    segs.forEach((s, i) => {
      const f = fills[i];
      if (f.fill + f.pending < 1) this.bed.rect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1).stroke({ width: K.lineW, color: C.silver, alpha: A.seg });
      paintSegment(this.fill, this.pending, s, f, color);
    });
  }

  private breathe(frac: number, nowSec: number, hold: boolean): void {
    const dt = this.lastSec === null ? 0 : nowSec - this.lastSec;
    this.lastSec = nowSec;
    this.phase = advancePulsePhase(this.phase, frac, dt);
    this.hold = easeHold(this.hold, hold ? 1 : 0, Math.max(0, dt) * 1000);
    this.fill.alpha = hullFillHeld(frac, this.phase, motionScaled(H.pulseAmp, settings.current.motion), this.hold);
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
    return this.value.text;
  }
}

/** Pure: the hull gauge's segments, BOTTOM to top, `segGap` apart. */
export function hullSegmentRects(g: Rect): Rect[] {
  const n = G.hull.segments;
  const h = (g.h - (n - 1) * G.hull.segGap) / n;
  return Array.from({ length: n }, (_, i) => ({ x: g.x, y: g.y + g.h - (i + 1) * h - i * G.hull.segGap, w: g.w, h }));
}

/** One segment filled from its BOTTOM by the live hull, the pool lighter above. */
function paintSegment(fill: Graphics, pending: Graphics, s: Rect, seg: { fill: number; pending: number }, color: number): void {
  const fh = s.h * seg.fill;
  if (fh > 0) fill.rect(s.x, s.y + s.h - fh, s.w, fh).fill({ color, alpha: 1 });
  const ph = s.h * seg.pending;
  if (ph > 0) pending.rect(s.x, s.y + s.h - fh - ph, s.w, ph).fill({ color, alpha: H.pendingAlpha });
}

// --- THROTTLE ---------------------------------------------------------------------

class ThrottleGauge {
  private readonly ticks = new Graphics();
  private readonly marks = new Graphics();
  private readonly detentLabels: Text[];
  private readonly ends: [Text, Text];
  private readonly word = monoText(T.gaugeValue, '600', C.textPrimary, 0.5);
  private readonly label = label('THROTTLE');
  private rect: GaugeRect | null = null;
  private last = { ordered: -1, arrow: NaN };

  constructor(root: Container) {
    this.detentLabels = DETENT_LABELS.map((l, i) => {
      const t = monoText(T.throttleLabel, '400', i === STOP_DETENT ? C.textPrimary : C.textMuted, 1);
      t.text = labelledDetent(i) ? l : '';
      return t;
    });
    this.ends = [monoText(T.throttleLabel, '400', C.textMuted, 1), monoText(T.throttleLabel, '400', C.textMuted, 1)];
    this.ends[0].text = '▲';
    this.ends[1].text = '▼';
    root.addChild(this.ticks, this.marks, ...this.detentLabels, ...this.ends, this.label, this.word);
  }

  update(v: GaugesView, r: GaugeRect): void {
    if (r !== this.rect) this.relayout(r);
    const g = r.gauge;
    const ordered = Math.max(0, Math.min(DETENTS - 1, v.orderedDetent));
    const arrow = Math.round(speedY(v.speed, v.kin, g.y, g.h, TH.inset) * 2) / 2;
    if (ordered !== this.last.ordered || arrow !== this.last.arrow) this.drawMarks(g, ordered, arrow);
    place(this.word, throttleWord(ordered), r.value.x + r.value.w / 2, r.value.y + r.value.h / 2, v.uiScale);
  }

  /** The spine, the nine ticks (STOP longer and brighter), the labels. */
  private relayout(r: GaugeRect): void {
    this.rect = r;
    this.last = { ordered: -1, arrow: NaN };
    const g = r.gauge;
    const x = g.x + (TH.tickX / TH.w) * g.w;
    const t = this.ticks;
    t.clear();
    t.moveTo(x, detentY(0, g.y, g.h, TH.inset)).lineTo(x, detentY(DETENTS - 1, g.y, g.h, TH.inset)).stroke({ width: 2, color: C.hairline });
    for (let i = 0; i < DETENTS; i++) {
      const y = detentY(i, g.y, g.h, TH.inset);
      const stop = i === STOP_DETENT;
      const w = stop ? TH.stopTick : TH.tick;
      t.moveTo(x - w / 2, y).lineTo(x + w / 2, y).stroke({ width: stop ? 2 : 1, color: stop ? C.phosphorBright : C.silver, alpha: stop ? 1 : A.tick });
      this.detentLabels[i].position.set(x - TH.labelGap, y);
    }
    const endX = g.x + (TH.endX / TH.w) * g.w;
    this.ends[0].position.set(endX, detentY(DETENTS - 1, g.y, g.h, TH.inset));
    this.ends[1].position.set(endX, detentY(0, g.y, g.h, TH.inset));
    this.label.position.set(r.label.x + r.label.w / 2, r.label.y + r.label.h / 2);
  }

  /** The ordered detent's hollow box and the actual speed's solid arrow. */
  private drawMarks(g: Rect, ordered: number, arrow: number): void {
    this.last = { ordered, arrow };
    const x = g.x + (TH.tickX / TH.w) * g.w;
    const m = this.marks;
    m.clear();
    const y = detentY(ordered, g.y, g.h, TH.inset);
    m.rect(x - TH.box.w / 2, y - TH.box.h / 2, TH.box.w, TH.box.h).stroke({ width: 1.5, color: C.phosphor, alpha: 1 });
    const ax = x + TH.arrowGap;
    m.poly([ax, arrow, ax + TH.arrow.w, arrow - TH.arrow.h / 2, ax + TH.arrow.w, arrow + TH.arrow.h / 2]).fill({ color: C.phosphor, alpha: 1 });
  }

  get wordText(): string {
    return this.word.text;
  }
}

// --- LEVEL ------------------------------------------------------------------------

class LevelGauge {
  private readonly track = new Graphics();
  private readonly chipBox = new Graphics();
  /** `LV n`, right-aligned to its fixed slot's right edge (it grows left). */
  private readonly lv = monoText(T.gaugeValue, '600', C.textPrimary, 1);
  private readonly count = monoText(T.keyChip, '600', C.phosphor, 0.5);
  private readonly label = label('LEVEL');
  private rect: LevelGaugeRect | null = null;
  private chip: XpChipState = XP_CHIP_IDLE;
  private freezeBlend = 0;
  private lastFreezeMs = -1;
  private lastXpQ = -1;
  private lastChipKey = '';
  private readonly chipAt = { x: Number.NaN, y: Number.NaN };

  constructor(root: Container) {
    root.addChild(this.track, this.chipBox, this.label, this.lv, this.count);
  }

  /** `LV n` and the bank chip each in their FIXED slot (layout.ts
   *  `LevelGaugeRect`): the chip's slot is reserved with or without a banked
   *  level, so neither moves with state (Eric 2026-11-19). */
  update(v: GaugesView, r: LevelGaugeRect): void {
    const relaid = r !== this.rect;
    this.rect = r;
    if (relaid) this.label.position.set(r.label.x + r.label.w / 2, r.label.y + r.label.h / 2);
    this.paintTrack(r.gauge, xpFillFraction(v.xp), relaid);
    place(this.lv, levelTag(v.lvl), r.lv.x + r.lv.w, r.lv.y + r.lv.h / 2, v.uiScale);
    this.paintChip(v, r.bankChip, v.pts > 0);
  }

  private paintTrack(g: Rect, frac: number, relaid: boolean): void {
    const q = Math.round(frac * 1000);
    if (q === this.lastXpQ && !relaid) return;
    this.lastXpQ = q;
    const t = this.track;
    t.clear();
    t.rect(g.x + 0.5, g.y + 0.5, g.w - 1, g.h - 1).stroke({ width: K.lineW, color: C.silver, alpha: A.xpEdge });
    if (frac > 0) t.rect(g.x + 1, g.y + 1 + (g.h - 2) * (1 - frac), g.w - 2, (g.h - 2) * frac).fill({ color: C.phosphorBright, alpha: A.xpFill });
  }

  /** The banked-level chip beside `LV n`: its breath and Tier-3 freeze. */
  private paintChip(v: GaugesView, slot: Rect, shown: boolean): void {
    this.chip = nextChipState(this.chip, v.pts, v.nowSec);
    const dtMs = this.lastFreezeMs < 0 ? 0 : v.nowMs - this.lastFreezeMs;
    this.lastFreezeMs = v.nowMs;
    this.freezeBlend = easeHold(this.freezeBlend, v.freeze ? 1 : 0, dtMs);
    this.chipBox.visible = shown;
    this.count.visible = shown;
    if (!shown) return;
    const s = slot.w;
    const x = slot.x;
    const cy = slot.y + slot.h / 2;
    this.chipAt.x = x;
    this.chipAt.y = slot.y;
    const key = `${x}|${cy}`;
    if (key !== this.lastChipKey) {
      this.lastChipKey = key;
      this.chipBox.clear();
      this.chipBox.rect(x, cy - s / 2, s, s).fill({ color: C.cardScrim, alpha: A.chipBed });
      this.chipBox.rect(x, cy - s / 2, s, s).stroke({ width: K.lineW, color: C.phosphor, alpha: A.chipBorder });
    }
    place(this.count, chipLabel(v.pts), x + s / 2, cy, v.uiScale);
    const alpha = chipHeld(this.chip, v.nowSec, motionScaled(K.chip.pulseAmp, settings.current.motion), this.freezeBlend);
    this.chipBox.alpha = alpha;
    this.count.alpha = alpha;
  }

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

  /** Where `LV n` and the bank chip were last placed (test seam). */
  get marks(): LevelMarks {
    return { lvX: this.lv.x, lvY: this.lv.y, lvAnchorX: this.lv.anchor.x, chipX: this.chipAt.x, chipY: this.chipAt.y };
  }
}

/** Where the LEVEL gauge's `LV n` and bank chip sit (test seam). */
export interface LevelMarks {
  lvX: number;
  lvY: number;
  lvAnchorX: number;
  chipX: number;
  chipY: number;
}

// --- the footer --------------------------------------------------------------------

export class Gauges {
  readonly root = new Container();
  private readonly hull: HullGauge;
  private readonly throttle: ThrottleGauge;
  private readonly level: LevelGauge;

  constructor() {
    this.hull = new HullGauge(this.root);
    this.throttle = new ThrottleGauge(this.root);
    this.level = new LevelGauge(this.root);
  }

  update(v: GaugesView, f: FooterRect): void {
    this.hull.update(v, f.hull);
    this.throttle.update(v, f.throttle);
    this.level.update(v, f.level);
  }

  /** The breathing states die with the hull (a real hide). */
  reset(): void {
    this.hull.reset();
    this.level.reset();
  }

  get hullText(): string {
    return this.hull.text;
  }

  get hullFillAlpha(): number {
    return this.hull.fillAlpha;
  }

  get throttleWord(): string {
    return this.throttle.wordText;
  }

  get chipAlpha(): number {
    return this.level.chipAlpha;
  }

  get chipVisible(): boolean {
    return this.level.chipVisible;
  }

  get levelMarks(): LevelMarks {
    return this.level.marks;
  }
}
