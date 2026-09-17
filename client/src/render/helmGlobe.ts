// THE HELM GLOBE (Story 8.6) — the HUD bar's RIGHT-hand disc: the engine-order
// telegraph, the heading/speed readout, the rudder and the four helm coach
// marks, all inside one 104 px bowl.
//
// It REPLACES the bottom-right vitals cluster's vertical telegraph ladder, its
// HDG/KTS column and its 110 px rudder track (render/hud.ts, Story 2.4). The
// GRAMMAR is unchanged and deliberately so: ordered-vs-actual is still SHAPE-
// coded (a hollow phosphor rung outline against a solid amber needle, never
// colour alone), the nine detents are still the same nine, and the W/S/A/D chips
// still fade per pair after three successful inputs (amendment 26). What changed
// is that the ladder is now an ARC over the crown — ticks at `-70 + 17.5 * i`
// degrees, 0 deg = 12 o'clock, ASTERN to the LEFT and AHEAD to the RIGHT, exactly
// as the ratified mock (`mockups/hud-composite-3.html`) draws it.
//
// ANGLE CONVENTION, stated once: degrees, 0 = 12 o'clock, POSITIVE CLOCKWISE in
// Pixi's y-down screen space. `polar()` and `rot()` below are the only two places
// that convention is spelled; everything else is in those terms.
//
// The mock's coordinates are for a 104 viewBox whose centre is (52,52), so every
// offset here is simply the mock's number measured from that centre — which is
// why the radii read as `r - 5`, `r - 8`, `r - 11`: they ARE the mock's 5/8/11.

import { Container, Graphics, Text } from 'pixi.js';
import { boostedKinematics, wrapPositive, type ShipConfig } from '@salvo/shared';
import { CLIENT_CONFIG } from '../config.js';
import { motionAllowed, settings } from '../settings/store.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { drawGlobeBed } from './globe.js';
import { glyphFadeAlpha, helmGlyphs, type HelmGlyphStore, type HelmPair } from './helmGlyphs.js';
import { microScale, type Circle } from './hudBar.js';

const C = CLIENT_CONFIG.colors;
const B = CLIENT_CONFIG.hudBar;
const T = B.tick;
const RUD = B.rudder;
const MONO = CLIENT_CONFIG.type.mono;

/** Kinematics subset the speed needle needs (ahead/astern denominators). */
export interface LadderKin {
  maxSpeed: number;
  reverseSpeed: number;
}

/** Compact rung labels, index 0 (full astern) → 8 (full ahead). Retained as the
 *  ratified detent vocabulary (the audio twins and the telegraph input both name
 *  them); the arc itself is unlabelled — the bar draws no words it was not
 *  ratified to draw. */
export const DETENT_LABELS = ['FULL', '¾', '½', '¼', 'STOP', '¼', '½', '¾', 'FULL'] as const;

/** Pure: detent index [0,8] for a throttle order value in [-1,1] (0.25 steps, STOP=4). */
export function detentIndexOf(throttle: number): number {
  const i = Math.round(throttle * 4) + 4;
  return i < 0 ? 0 : i > 8 ? 8 : i;
}

/** Pure: the compact ladder label for a detent index (clamped). */
export function detentLabel(index: number): string {
  const i = index < 0 ? 0 : index > 8 ? 8 : index;
  return DETENT_LABELS[i];
}

/**
 * Pure: the ARC ANGLE (deg) of a detent tick — `-arcDeg + stepDeg * i`, so index
 * 0 (full astern) sits at -70 on the LEFT, STOP (4) at 12 o'clock and index 8
 * (full ahead) at +70 on the RIGHT. Clamped, so an out-of-range index lands on
 * an end stop rather than off the arc.
 */
export function detentTickAngle(index: number): number {
  const i = index < 0 ? 0 : index > 8 ? 8 : index;
  return -T.arcDeg + T.stepDeg * i;
}

/**
 * Pure: the ship's ACTUAL speed mapped onto the telegraph's [-1,1] axis — ahead
 * scales on maxSpeed, astern on reverseSpeed. The gap between this and the
 * ordered rung is the hull converging on the ordered speed (the naval feel: the
 * setting is instant, the hull is not).
 */
export function speedLadderFraction(speed: number, kin: LadderKin): number {
  const denom = speed >= 0 ? kin.maxSpeed : kin.reverseSpeed;
  const f = denom > 0 ? speed / denom : 0;
  return f < -1 ? -1 : f > 1 ? 1 : f;
}

/**
 * Pure: the ACTUAL-speed needle's arc angle (deg) — the ladder fraction spread
 * over the same +/-70 the ticks occupy, so the needle and the rungs share one
 * scale. CLAMPED BY CONSTRUCTION: `speedLadderFraction` saturates at +/-1, so a
 * boosted hull running past its unboosted cap pins the needle at the arc's end
 * rather than swinging off it.
 */
export function needleAngle(speed: number, kin: LadderKin): number {
  return T.arcDeg * speedLadderFraction(speed, kin);
}

/**
 * Pure: the x CENTER of the rudder position tick for a rudder axis in [-1,1],
 * clamped so the whole tick stays inside the track — at full deflection the raw
 * centre sits exactly on the track end, which would hang half the tick off it.
 */
export function rudderTickCenter(rudder: number, trackX: number, trackW: number, inset: number): number {
  const r = rudder < -1 ? -1 : rudder > 1 ? 1 : rudder;
  const raw = trackX + trackW / 2 + (r * trackW) / 2;
  const lo = trackX + inset;
  const hi = trackX + trackW - inset;
  return raw < lo ? lo : raw > hi ? hi : raw;
}

/** Half the rudder tick's painted footprint — the clamp inset (the bar's tick
 *  carries no halo, unlike the retired cluster's). */
const RUD_TICK_INSET = RUD.tickW / 2;

/** Radial insets (px from the globe's EDGE) the mock's own coordinates give:
 *  a plain tick spans r-5 .. r-11, the STOP tick r-3 .. r-12, and the ordered
 *  rung is CENTRED at r-8 (its 10 px box spanning r-3 .. r-13). */
const TICK_INSET = 5;
const STOP_INSET = 3;
const RUNG_INSET = 8;
/** The needle: a 2 px spine from r 2 out to r 31, tipped with an 8x7 arrowhead
 *  whose point reaches r 37 (mock `line y1=50 y2=21` + `polygon 52,15 48,22 56,22`). */
const NEEDLE_FROM = 2;
const NEEDLE_TO = 31;
const HEAD_TIP = 37;
const HEAD_BASE = 30;
const HEAD_HALF_W = 4;

/** Readout stack, globe-local (px from the centre) — the mock's y 54 / 65 / 78
 *  and its rudder row at y 88, each measured from the 104 box's centre. */
const HDG_DY = 2;
const HDG_LABEL_DY = 13;
const KTS_DY = 26;
const RUD_DY = 36;
/** The rudder track's centre detent mark: 6 px tall, astride the track. */
const RUD_MARK_HALF = 3;
/** Gap (px) between the `18` and its `KTS` unit in the speed readout. */
const KTS_GAP = 4;

/** The four helm coach marks, globe-local and centred on their glyph (mock
 *  `S` x13 / `W` x91 at y32, `A` x17 / `D` x87 at y91, in the 104 box). */
interface HelmLetter {
  pair: HelmPair;
  dx: number;
  dy: number;
  glyph: string;
}
const HELM_LETTERS: readonly HelmLetter[] = [
  { pair: 'ws', dx: -39, dy: -20, glyph: 'S' },
  { pair: 'ws', dx: 39, dy: -20, glyph: 'W' },
  { pair: 'ad', dx: -35, dy: 39, glyph: 'A' },
  { pair: 'ad', dx: 35, dy: 39, glyph: 'D' },
];

const HDG_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.hdg,
  fontWeight: '600',
  fill: C.textPrimary,
  letterSpacing: 1,
} as const;
const HDG_LABEL_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.hdgLabel,
  fill: C.textSecondary,
  letterSpacing: 2,
} as const;
/** The KTS pair's TYPE REGISTER — the size and tracking both Texts render at,
 *  in one place so the placement (and its pin) can measure what is drawn. */
export const KTS_TYPE = { size: B.type.kts, tracking: 1.5 } as const;
const KTS_STYLE = { fontFamily: MONO, fontSize: KTS_TYPE.size, fill: C.textPrimary, letterSpacing: KTS_TYPE.tracking } as const;
const KTS_UNIT_STYLE = { fontFamily: MONO, fontSize: KTS_TYPE.size, fill: C.textSecondary, letterSpacing: KTS_TYPE.tracking } as const;
const LETTER_STYLE = { fontFamily: MONO, fontSize: B.type.helmKey, fill: C.textSecondary } as const;

/** Pure: a globe-local point at radius `rad` on the arc angle `deg`. */
function polar(rad: number, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  return { x: rad * Math.sin(t), y: -rad * Math.cos(t) };
}

/** Pure: rotate a globe-local point CLOCKWISE by `deg` about the centre. */
function rot(x: number, y: number, deg: number): { x: number; y: number } {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function pad3(n: number): string {
  return Math.round(n).toString().padStart(3, '0');
}

/** Everything the helm globe reads — derived at the bar's composition seam from
 *  the own `ShipState` pose, the helm `Axes` and `OwnStatus`. */
export interface HelmGlobeInput {
  /** Own heading in RADIANS (`ShipState.heading`) — wrapped for the readout. */
  headingRad: number;
  /** Own SIGNED speed (u/s); astern is negative (`ShipState.speed`). */
  speed: number;
  /** The ORDERED detent, 0 (full astern) .. 8 (full ahead). */
  orderedDetent: number;
  /** Rudder axis in [-1,1] (`Axes.rudder`). */
  rudder: number;
  /** BASE ladder denominators (`EffectiveStats.kinematics`) — the whole
   *  `ShipConfig`, because the boost's one shared mutator takes it whole. */
  kin: ShipConfig;
  /** The speed boost's bonus (`EffectiveStats.equipment.speedBoost.speedBonus`). */
  speedBonus: number;
  /** The boost window is open — the needle's denominator is the BOOSTED cap,
   *  via the one shared speed mutator and never a hand-tweaked maxSpeed. */
  boostActive: boolean;
}

/**
 * The helm globe's Pixi shell. ONE Graphics for the whole instrument (bed,
 * rings, tick arc, ordered rung, needle, rudder), redrawn only when the ordered
 * detent, the rudder, the displayed speed or the globe's own geometry moves —
 * the readouts and the coach marks are Texts that diff their own strings.
 */
/**
 * Pure: where the `18.0` value and its `KTS` unit seat, so the PAIR stays
 * centred on the globe's centre line.
 *
 * `micro` is `microScale(uiScale)` — the counter-scale the 9px register takes at
 * the 90% UI tier so no mono glyph renders under the floor. The measured widths
 * are the type's own; the RENDERED widths are those times `micro`, and it is the
 * rendered ones the centring has to be done in. (Review gate, cycle 141: the
 * pair was counter-scaled but placed off the unscaled widths, so at 90% it sat
 * ~2px left of the globe's centre while every other readout on the bar stayed
 * put.) `KTS_GAP` is spacing, not type, so it is deliberately left unscaled —
 * the same rule the key chips' padding follows.
 */
export function ktsPairLayout(cx: number, value: string, micro = 1): { valueX: number; unitX: number } {
  const vw = monoTextWidth(value, KTS_TYPE.size, KTS_TYPE.tracking) * micro;
  const uw = monoTextWidth('KTS', KTS_TYPE.size, KTS_TYPE.tracking) * micro;
  const valueX = cx - (vw + KTS_GAP + uw) / 2;
  return { valueX, unitX: valueX + vw + KTS_GAP };
}

export class HelmGlobe {
  private readonly root = new Container();
  private readonly gfx = new Graphics();
  private readonly hdgValue: Text;
  private readonly hdgLabel: Text;
  private readonly ktsValue: Text;
  private readonly ktsUnit: Text;
  private readonly pairs: Record<HelmPair, Container>;
  private lastSig = '';
  private lastHeading = '';
  private lastSpeed = '';
  private lastMicro = 1;
  /** Per-pair fade clock: the second a pair CROSSED into faded during this
   *  session. Null means "not faded" OR "already faded when we booted" — a
   *  reload must show the marks gone, not replay the fade (glyphFadeAlpha). */
  private readonly fadeStart: Record<HelmPair, number | null> = { ws: null, ad: null };
  private readonly wasFaded: Record<HelmPair, boolean>;
  /** Is the globe currently on screen? A hidden→visible edge re-snapshots the
   *  fade state (see seedFadedWhileHidden). */
  private shown = false;

  constructor(
    parent: Container,
    /** The helm-glyph fade progress this globe reads. Defaults to THE
     *  process-wide store; injectable so tests can drive a fade. */
    private readonly glyphs: HelmGlyphStore = helmGlyphs,
  ) {
    parent.addChild(this.root);
    this.root.addChild(this.gfx);
    this.hdgValue = new Text({ text: '', style: HDG_STYLE });
    this.hdgValue.anchor.set(0.5);
    this.hdgLabel = new Text({ text: 'HDG', style: HDG_LABEL_STYLE });
    this.hdgLabel.anchor.set(0.5);
    this.ktsValue = new Text({ text: '', style: KTS_STYLE });
    this.ktsValue.anchor.set(0, 0.5);
    this.ktsUnit = new Text({ text: 'KTS', style: KTS_UNIT_STYLE });
    this.ktsUnit.anchor.set(0, 0.5);
    this.root.addChild(this.hdgValue, this.hdgLabel, this.ktsValue, this.ktsUnit);
    this.pairs = { ws: new Container(), ad: new Container() };
    this.buildLetters();
    this.wasFaded = { ws: this.glyphs.faded('ws'), ad: this.glyphs.faded('ad') };
  }

  /** The four coach marks, one Container per fading pair. */
  private buildLetters(): void {
    for (const letter of HELM_LETTERS) {
      const t = new Text({ text: letter.glyph, style: LETTER_STYLE });
      t.anchor.set(0.5);
      t.label = letter.glyph;
      this.pairs[letter.pair].addChild(t);
    }
    this.root.addChild(this.pairs.ws, this.pairs.ad);
  }

  /** One frame. `nowSec` is the server-clock estimate in seconds — the same
   *  clock the HP globe's pulse rides. */
  update(input: HelmGlobeInput, c: Circle, nowSec: number, uiScale: number): void {
    if (!this.shown) this.seedFadedWhileHidden();
    this.shown = true;
    this.root.visible = true;
    const kin = boostedKinematics(input.kin, input.speedBonus, input.boostActive);
    const sig = `${input.orderedDetent}|${input.rudder}|${input.speed.toFixed(1)}|${kin.maxSpeed}|${kin.reverseSpeed}|${c.cx}|${c.cy}|${c.r}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.draw(input, kin, c);
    }
    this.readout(input, c, uiScale);
    this.fadeLetters(nowSec);
  }

  /** Bed, rings, the nine-detent arc, the ordered rung, the needle, the rudder. */
  private draw(input: HelmGlobeInput, kin: LadderKin, c: Circle): void {
    const g = this.gfx;
    g.clear();
    drawGlobeBed(g, c.cx, c.cy, c.r, C.silver, 0.28);
    this.drawArc(c);
    this.drawRung(input.orderedDetent, c);
    this.drawNeedle(needleAngle(input.speed, kin), c);
    this.drawRudder(input.rudder, c);
  }

  /** Nine ticks over the crown; the STOP tick (index 4) is longer and brighter. */
  private drawArc(c: Circle): void {
    for (let i = 0; i < 9; i++) {
      const deg = detentTickAngle(i);
      const stop = i === 4;
      const outer = c.r - (stop ? STOP_INSET : TICK_INSET);
      const inner = outer - (stop ? T.stopLen : T.len);
      const a = polar(outer, deg);
      const b = polar(inner, deg);
      this.gfx
        .moveTo(c.cx + a.x, c.cy + a.y)
        .lineTo(c.cx + b.x, c.cy + b.y)
        .stroke({ width: B.lineW, color: C.silver, alpha: stop ? 0.7 : 0.45 });
    }
  }

  /** ORDERED: a hollow phosphor rung outline riding its own tick — the SHAPE
   *  channel, so the order never depends on colour to be read. */
  private drawRung(index: number, c: Circle): void {
    const deg = detentTickAngle(index);
    const mid = -(c.r - RUNG_INSET); // globe-local y at 12 o'clock
    const corners = [
      [-T.rungW / 2, mid - T.rungH / 2],
      [T.rungW / 2, mid - T.rungH / 2],
      [T.rungW / 2, mid + T.rungH / 2],
      [-T.rungW / 2, mid + T.rungH / 2],
    ].map(([x, y]) => rot(x, y, deg));
    const flat: number[] = [];
    for (const p of corners) flat.push(c.cx + p.x, c.cy + p.y);
    this.gfx.poly(flat).stroke({ width: B.lineW, color: C.phosphor, alpha: 1 });
  }

  /** ACTUAL: a solid amber needle with an arrowhead — never colour alone. */
  private drawNeedle(deg: number, c: Circle): void {
    const from = polar(NEEDLE_FROM, deg);
    const to = polar(NEEDLE_TO, deg);
    this.gfx
      .moveTo(c.cx + from.x, c.cy + from.y)
      .lineTo(c.cx + to.x, c.cy + to.y)
      .stroke({ width: T.needleW, color: C.amber, alpha: 1 });
    const tip = polar(HEAD_TIP, deg);
    const left = rot(-HEAD_HALF_W, -HEAD_BASE, deg);
    const right = rot(HEAD_HALF_W, -HEAD_BASE, deg);
    this.gfx
      .poly([c.cx + tip.x, c.cy + tip.y, c.cx + left.x, c.cy + left.y, c.cx + right.x, c.cy + right.y])
      .fill({ color: C.amber, alpha: 1 });
  }

  /** A hairline track along the globe's floor, a centre detent mark, and the
   *  AMBER position tick (the "actual" channel, as on the telegraph). */
  private drawRudder(rudder: number, c: Circle): void {
    const g = this.gfx;
    const y = c.cy + RUD_DY;
    const x0 = c.cx - RUD.track / 2;
    g.moveTo(x0, y).lineTo(x0 + RUD.track, y).stroke({ width: B.lineW, color: C.silver, alpha: 0.35 });
    g.moveTo(c.cx, y - RUD_MARK_HALF)
      .lineTo(c.cx, y + RUD_MARK_HALF)
      .stroke({ width: B.lineW, color: C.silver, alpha: 0.55 });
    const cx = rudderTickCenter(rudder, x0, RUD.track, RUD_TICK_INSET);
    g.rect(cx - RUD.tickW / 2, y - RUD.tickH / 2, RUD.tickW, RUD.tickH).fill({ color: C.amber, alpha: 1 });
  }

  /** `271°` over `HDG`, and `4.2 KTS` below it. The speed unit is the cluster's
   *  own — one decimal of raw hull speed, unconverted (the mock's `18` is art). */
  private readout(input: HelmGlobeInput, c: Circle, uiScale: number): void {
    const micro = microScale(uiScale);
    if (micro !== this.lastMicro) {
      this.lastMicro = micro;
      for (const t of [this.hdgLabel, this.ktsValue, this.ktsUnit]) t.scale.set(micro);
      for (const pair of ['ws', 'ad'] as const) {
        for (const child of this.pairs[pair].children) child.scale.set(micro);
      }
    }
    const hdg = `${pad3((wrapPositive(input.headingRad) * 180) / Math.PI)}°`;
    if (hdg !== this.lastHeading) {
      this.hdgValue.text = hdg;
      this.lastHeading = hdg;
    }
    const spd = Math.abs(input.speed).toFixed(1);
    if (spd !== this.lastSpeed) {
      this.ktsValue.text = spd;
      this.lastSpeed = spd;
    }
    this.place(c, micro);
  }

  /** Position every Text on the globe. Widths come from the MONO MODEL
   *  (ui/refitCardFit.ts) rather than `Text.width`: the bar's type is one
   *  monospaced stack, so the model is exact, and reading a Text's bounds would
   *  force a canvas measure on every knot of speed. */
  private place(c: Circle, micro: number): void {
    this.hdgValue.position.set(c.cx, c.cy + HDG_DY);
    this.hdgLabel.position.set(c.cx, c.cy + HDG_LABEL_DY);
    const kts = ktsPairLayout(c.cx, this.ktsValue.text, micro);
    this.ktsValue.position.set(kts.valueX, c.cy + KTS_DY);
    this.ktsUnit.position.set(kts.unitX, c.cy + KTS_DY);
    for (const pair of ['ws', 'ad'] as const) this.pairs[pair].position.set(c.cx, c.cy);
    for (const letter of HELM_LETTERS) {
      const t = this.pairs[letter.pair].children.find((ch) => ch.label === letter.glyph);
      t?.position.set(letter.dx, letter.dy);
    }
  }

  /**
   * Each pair holds full alpha until its 3rd successful input, then fades out
   * ONCE and stays gone (the counts persist under their own localStorage key —
   * RESET SETTINGS must never resurrect them). The fade itself is MOTION: at
   * `off` the marks simply vanish. Only a pair that crosses while the globe is
   * ON SCREEN animates.
   */
  private fadeLetters(nowSec: number): void {
    const animate = motionAllowed(settings.current.motion);
    for (const pair of ['ws', 'ad'] as const) {
      const faded = this.glyphs.faded(pair);
      if (faded && !this.wasFaded[pair]) {
        this.wasFaded[pair] = true;
        this.fadeStart[pair] = nowSec;
      }
      const group = this.pairs[pair];
      const alpha = glyphFadeAlpha(faded, this.fadeStart[pair], nowSec, animate);
      group.alpha = alpha;
      group.visible = alpha > 0;
    }
  }

  /**
   * Adopt the store's CURRENT fade state without animating — the same snapshot
   * the constructor takes, re-taken whenever the globe comes back. A pair whose
   * 3rd input landed just before death (or while spectating) has already been
   * retired as far as the player is concerned.
   */
  private seedFadedWhileHidden(): void {
    for (const pair of ['ws', 'ad'] as const) {
      if (this.glyphs.faded(pair)) this.wasFaded[pair] = true; // fadeStart stays null
    }
  }

  hide(): void {
    this.shown = false;
    this.root.visible = false;
  }

  show(): void {
    this.root.visible = true;
  }

  /** Render-state seams (tests/debug). */
  letterAlpha(pair: HelmPair): number {
    return this.pairs[pair].alpha;
  }

  readoutText(): string {
    return `${this.hdgValue.text} ${this.hdgLabel.text} ${this.ktsValue.text} ${this.ktsUnit.text}`;
  }

  /** A coach mark's globe-LOCAL position (the mock's own coordinates). */
  letterOffset(glyph: string): { x: number; y: number } | null {
    const letter = HELM_LETTERS.find((l) => l.glyph === glyph);
    if (letter === undefined) return null;
    return { x: letter.dx, y: letter.dy };
  }
}

/** The four coach marks' ratified globe-local offsets (test/debug seam). */
export const HELM_LETTER_OFFSETS: Readonly<Record<string, { x: number; y: number }>> = Object.fromEntries(
  HELM_LETTERS.map((l) => [l.glyph, { x: l.dx, y: l.dy }]),
);
