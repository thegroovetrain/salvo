// THE HP GLOBE (Story 8.6) — the HUD bar's LEFT-hand disc: a 104 px bowl of
// water whose level is the hull, ringed in the damage ramp, with the hull
// number read out across its middle.
//
// It REPLACES the 6 px vertical HP rail that used to abut the bottom-right
// vitals cluster (render/hud.ts, Stories 2.4 / 4.8). Every PURE function the
// rail owned moved here unchanged — the bands (`hpColor`), the gates
// (`railPulsing` / `railCritical` / `railAmberChannel`), the one fraction
// derivation (`railFraction`), the redraw signature (`railSig`), DAMAGE
// CONTROL's incoming band (`repairFraction`) and the whole breathing envelope
// (`hullPulseHz` / `advancePulsePhase` / `hullFillAlpha` / `hullFillHeld`). The
// names keep their `rail` prefix deliberately: they are the SAME predicates the
// attention seam composes and the same thresholds `CONFIG.damageBands` pins, and
// renaming them would have made a behaviour-preserving move look like a
// re-decision. Only the SHAPE the fraction is painted into changed.
//
// THE ATTENTION SEAM. render/attention.ts imports `railCritical` back out of
// this module (amendment 16's rule: the OWNING module exports the predicate),
// and this module imports `amberPulseWinner` back in for `hpGlobeHoldsLit`. The
// cycle is the one render/hud.ts already carried and is benign for the same
// reason: neither module calls the other at load time.
//
// GEOMETRY. Pixi's y grows DOWNWARD, so a FULLER hull has a SMALLER waterline y:
// `globeWaterY` maps [0,1] onto [+r, -r]. The water itself is
// `circleSegmentBelow` (render/globe.ts) and the pending-heal band is the slice
// of the disc between the live waterline and where the still-draining pool will
// leave it (epic-8 amendment 35).

import { Container, Graphics, Text } from 'pixi.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled, settings } from '../settings/store.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import type { PolyPoint } from '../util/poly.js';
// The Tier-1 hold easing is the storm vignette's, imported rather than
// re-derived: amendment 16's hold is ONE behavior with one time constant shape.
import { easeHold } from './zone.js';
import { amberPulseWinner } from './attention.js';
import { circleSegmentBelow, drawGlobeBed } from './globe.js';
import { microScale, type Circle } from './hudBar.js';

const C = CLIENT_CONFIG.colors;
const V = CLIENT_CONFIG.vitals;
const B = CLIENT_CONFIG.hudBar;
const MONO = CLIENT_CONFIG.type.mono;

/** Water fill alpha at the globe's steady keyframe — the mock's phosphor wash
 *  at .28. The BREATHING rides the fill Graphics' own alpha on top of it,
 *  exactly as the rail's did, so a pulsing globe never redraws. */
const FILL_ALPHA = 0.28;
/** The bed's hairline (silver) and the second, RAMP-COLOURED ring outside it —
 *  the mock's outer stroke at .35, which is what carries the band to the eye at
 *  a glance without anyone reading the number. */
const BED_RING_ALPHA = 0.28;
const RAMP_RING_ALPHA = 0.35;

/** Readout stack, globe-local (px from the centre): the `HULL` caption's
 *  CENTRE, and the shared BOTTOM edge of the `212` / `/250` pair — one line, as
 *  the mock's `.gt` column reads it. */
const HULL_LABEL_DY = -16;
const READOUT_BOTTOM_DY = 16;

const LABEL_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.hullLabel,
  fill: C.textSecondary,
  letterSpacing: 1.5,
} as const;
const VALUE_STYLE = {
  fontFamily: MONO,
  fontSize: B.type.hull,
  fontWeight: '600',
  fill: C.textPrimary,
  letterSpacing: 0.5,
} as const;
const MAX_STYLE = { fontFamily: MONO, fontSize: B.type.hullMax, fill: C.textSecondary } as const;

/**
 * Pure: the displayed hull POINTS — floored, then floored again at 1 while any
 * hull remains.
 *   • floor, not round, so the number never disagrees with the globe's band —
 *     49.6 hp reads `49` beside an amber globe rather than a phosphor-looking
 *     `50` (the band uses the exact fraction);
 *   • but a LIVE hull never reads `0`: storm damage leaves fractions (0.4 hp is
 *     still afloat), and `HULL 0 /100` on a ship that is still fighting is a lie.
 *     Only a genuinely sunk hull (hp <= 0) reads zero.
 */
export function hullShownValue(hp: number): number {
  return hp <= 0 ? 0 : Math.max(1, Math.floor(hp));
}

/** Pure: the ` /250` half of the readout (its own dimmer register). */
export function hullMaxLabel(maxHp: number): string {
  return `/${Math.round(maxHp)}`;
}

/** Pure: the HP readout's value text — `72/100`. The globe splits it across two
 *  registers, but the ONE derivation stays here so the split can never drift. */
export function hullHeaderValue(hp: number, maxHp: number): string {
  return `${hullShownValue(hp)}${hullMaxLabel(maxHp)}`;
}

/**
 * Pure: HP fill color by remaining fraction (UX-DR15 + amendment 27's bands).
 * The thresholds are EXCLUSIVE lower bounds for the better color: exactly 50%
 * still reads phosphor, exactly 25% still reads amber. `damage` crimson is
 * retired here — the critical band is the brighter `damageMarker`.
 */
export function hpColor(frac: number): number {
  if (frac >= V.amberBelow) return C.phosphor;
  if (frac >= V.criticalBelow) return C.amber;
  return C.damageMarker;
}

/** Pure: does the globe BREATHE at this fraction? (The pulse gate is the exact
 *  fraction — the same test hullFillAlpha applies.) */
export function railPulsing(frac: number): boolean {
  return frac < V.amberBelow;
}

/**
 * Pure: is the hull in its CRITICAL (crimson `damageMarker`) band? THE TIER-1
 * GATE — render/attention.ts composes this, never a threshold of its own
 * (amendment 16's rule: the owning module exports the predicate).
 *
 * Amendment 239: the attention table's Tier-1 HP channel is `<25%`, which is
 * exactly this band; 25-50% is the AMBER WARNING band, and a warning is not a
 * threat. The globe's own display grammar does NOT move — it still breathes
 * below 50% (`railPulsing`, untouched) at the same ramp and in the same colors.
 *
 * The bound is EXCLUSIVE, matching `hpColor`'s convention exactly: a fraction of
 * exactly `criticalBelow` still reads amber and is NOT critical.
 */
export function railCritical(frac: number): boolean {
  return frac < V.criticalBelow;
}

/**
 * Pure: is the globe an AMBER CHANNEL this frame — breathing (below 50%) but not
 * yet crimson (at or above 25%)? THE AMBER COROLLARY's HP input, composed from
 * the two gates above rather than from a third threshold.
 *
 * Below 25% this goes FALSE, which is the whole point: a crimson globe is not a
 * lesser amber that could lose a ranking — it is the Tier-1 threat channel.
 */
export function railAmberChannel(frac: number): boolean {
  return railPulsing(frac) && !railCritical(frac);
}

/**
 * Pure: the hull's remaining fraction, clamped to [0,1] — THE one derivation
 * both the globe's own draw and the attention seam's HP input read. A
 * missing/zero denominator reads 0 here; NULL-vs-ZERO is the CALLER's
 * distinction (Tier1Input.hpFrac is nullable precisely because a hull that does
 * not exist is not a hull at 0%).
 */
export function railFraction(hp: number, maxHp: number): number {
  return maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
}

/**
 * Pure: the globe geometry's redraw signature. The fraction is quantized (0.001
 * of the bowl), but the BAND and the PULSE GATE are carried exactly: quantizing
 * alone would let 0.4996 share a signature with 0.5 and keep drawing a phosphor
 * globe while the (exact-fraction) pulse gate had already started breathing it.
 */
export function railSig(frac: number, pending = 0): string {
  return `${frac.toFixed(3)}|${hpColor(frac)}|${railPulsing(frac) ? 1 : 0}|${pending.toFixed(3)}`;
}

/**
 * Pure: DAMAGE CONTROL's INCOMING band as a fraction of the bowl (cycle 46). It
 * is what the still-draining regen pool (`OwnShip.repairHp`) can actually
 * deliver, so it is CLIPPED at the crown exactly as the server clamps the payout
 * at maxHp — a pool draining against a nearly-full hull shows only the part that
 * will land. Zero whenever there is no pool, no hull, or no room to heal into.
 */
export function repairFraction(hp: number, repairHp: number, maxHp: number): number {
  if (maxHp <= 0 || repairHp <= 0) return 0;
  const filled = Math.max(0, Math.min(1, hp / maxHp));
  return Math.max(0, Math.min(1 - filled, repairHp / maxHp));
}

/**
 * Pure: the breathing RATE (Hz) at a remaining fraction — a linear ramp from
 * `pulseMinHz` (0.5) at 50% hull to the shared photosensitivity ceiling
 * (`settings.pulseCapHz`, 1.1) at `pulseFloorFrac` (10%) and below. CLAMPED at
 * both ends: no input can produce a rate above the ceiling, which is the
 * accessibility floor's hard promise.
 */
export function hullPulseHz(frac: number): number {
  const f = Math.min(V.amberBelow, Math.max(V.pulseFloorFrac, frac));
  const t = (V.amberBelow - f) / (V.amberBelow - V.pulseFloorFrac);
  return V.pulseMinHz + t * (CLIENT_CONFIG.settings.pulseCapHz - V.pulseMinHz);
}

/** Largest frame gap (s) the pulse integrator will advance across. */
const MAX_PULSE_DT = 0.5;

/**
 * Pure: advance the breathing pulse's PHASE (radians) by one frame.
 *
 * The phase is INTEGRATED, never computed from absolute time. `sin(t · hz)` looks
 * equivalent only while `hz` is constant: the moment the rate changes (and it
 * changes every time the hull does — storm damage ticks the fraction 20x/s), the
 * phase of an absolute-time formula jumps by `t · dhz · 2pi`, which is a strobe
 * in exactly the burning-in-the-storm case the 1.1 Hz ceiling exists to prevent.
 *
 * `dt` is clamped to [0, MAX_PULSE_DT]; the phase wraps. Above the band it HOLDS
 * AT ZERO, so the first breath after a hull drops through 50% starts from
 * sin(0) = the base alpha.
 */
export function advancePulsePhase(phase: number, frac: number, dt: number): number {
  if (!railPulsing(frac)) return 0;
  const step = Math.min(MAX_PULSE_DT, Math.max(0, dt));
  return (phase + hullPulseHz(frac) * step * Math.PI * 2) % (Math.PI * 2);
}

/**
 * Pure: the water's alpha multiplier at a given pulse PHASE — the opacity
 * breathing, in the storm vignette's exact shape (zone.ts vignetteAlpha).
 *
 * MOTION-GATED: `amp` is the motion-scaled amplitude — halved at `reduced`, zero
 * at `off`, where the globe holds its steady BASE alpha. The base is
 * INFORMATION: the water, its band colour and its level are fully present at
 * every motion level; only the breathing is motion.
 */
export function hullFillAlpha(frac: number, phase: number, amp: number = V.pulseAmp): number {
  if (frac >= V.amberBelow) return V.railFillAlpha;
  return V.railFillAlpha + amp * Math.sin(phase);
}

/** Clamp to [0,1] (a blend factor, or a caller's degenerate input). */
function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * Pure: the water alpha actually drawn — the breathing value and its LIT
 * keyframe mixed by an eased `hold` blend (0 = breathing, 1 = fully held lit).
 *
 * THE AMBER COROLLARY's loser-side draw. When the ring wins the amber ranking
 * the globe does not simply stop moving — a hard stop is itself a luminance
 * step — so the caller eases the blend with the vignette's own `easeHold`
 * (240ms) and the water SWELLS to its lit keyframe and holds there. The keyframe
 * is `sin(phi)=1`, the top of the very same wave `hullFillAlpha` draws, so a held
 * globe is never DIMMER than a breathing one and the level never moves.
 */
export function hullFillHeld(frac: number, phase: number, amp: number, hold: number): number {
  const breathing = hullFillAlpha(frac, phase, amp);
  const lit = hullFillAlpha(frac, Math.PI / 2, amp);
  return breathing + (lit - breathing) * clamp01(hold);
}

/**
 * Pure: does the HP globe HOLD at its lit keyframe this frame — i.e. is it an
 * amber channel that LOST the corollary's ranking to the chrome bar's ring?
 *
 * THE one composition of the corollary for this channel, so the bar's owner does
 * not re-spell it. `amberPulseWinner`'s rank comes from config, which still
 * spells this channel's key `hpRail` (the pre-8.6 name of the same thing — see
 * `AmberChannel` in render/attention.ts).
 */
export function hpGlobeHoldsLit(frac: number, ringUrgent: boolean): boolean {
  const amber = railAmberChannel(frac);
  return amber && amberPulseWinner({ ring: ringUrgent, hpGlobe: amber }) !== 'hpGlobe';
}

/**
 * Pure: the WATERLINE's y in globe-local space for a remaining fraction — the
 * level the bowl is filled to, measured from the centre. `frac` 1 puts it at the
 * crown (`-r`), 0 at the floor (`+r`), 0.5 dead across the middle.
 */
export function globeWaterY(r: number, frac: number): number {
  return r - 2 * r * clamp01(frac);
}

/** Arc samples per side of the pending band (the fill's own sampling density). */
const BAND_SAMPLES = 32;

/**
 * Pure: the slice of a radius-`r` disc (centred on the ORIGIN) between two
 * horizontal lines, as a closed polygon — the PENDING-HEAL band (amendment 35),
 * from the live waterline UP to where the still-draining pool will leave it.
 *
 * Empty when the band is degenerate or inverted, which is what makes the clamp
 * at maxHp free: `repairFraction` already clips the pool at the crown, so the
 * two lines coincide at a full hull and this returns nothing rather than a band
 * hanging off the top of the bowl.
 */
export function circleBandBetween(r: number, topY: number, bottomY: number): PolyPoint[] {
  if (!(r > 0)) return [];
  const top = Math.max(-r, Math.min(r, topY));
  const bottom = Math.max(-r, Math.min(r, bottomY));
  if (!(bottom > top)) return [];
  const halfAt = (y: number): number => Math.sqrt(Math.max(0, r * r - y * y));
  const right: PolyPoint[] = [];
  const left: PolyPoint[] = [];
  for (let i = 0; i <= BAND_SAMPLES; i++) {
    const y = top + ((bottom - top) * i) / BAND_SAMPLES;
    const half = halfAt(y);
    right.push({ x: half, y });
    left.push({ x: -half, y });
  }
  return [...right, ...left.reverse()];
}

/** Globe-local polygon → the flat screen-space point list Pixi's `poly` takes. */
function flatten(pts: readonly PolyPoint[], c: Circle): number[] {
  const out: number[] = [];
  for (const p of pts) out.push(p.x + c.cx, p.y + c.cy);
  return out;
}

/** What the globe draws: the hull, its pool, and the two liveness flags the bar
 *  composition uses to decide whether it is on screen at all. */
export interface HpGlobeInput {
  hp: number;
  maxHp: number;
  /** hp — DAMAGE CONTROL's still-draining regen pool (`OwnShip.repairHp`). */
  repairHp: number;
  alive: boolean;
  /** Inside the five-second sinking window (Story 5.2's third state). */
  sinking: boolean;
}

/**
 * The HP globe's Pixi shell. Three Graphics so the breathing never forces a
 * redraw: `back` (bed, rings, pending band), `fill` (the water — its ALPHA
 * breathes) and `front` (the waterline, drawn OVER the water it bounds).
 */
export class HpGlobe {
  private readonly root = new Container();
  private readonly back = new Graphics();
  private readonly fill = new Graphics();
  private readonly front = new Graphics();
  private readonly label: Text;
  private readonly value: Text;
  private readonly max: Text;
  private lastSig = '';
  private lastValue = '';
  private lastMax = '';
  private lastMicro = 1;
  /** INTEGRATED pulse phase (radians) + the clock it was last advanced at. */
  private pulsePhase = 0;
  private lastPulseSec: number | null = null;
  /** The eased AMBER-COROLLARY hold blend (0 = breathing, 1 = held lit). */
  private hold = 0;

  constructor(parent: Container) {
    parent.addChild(this.root);
    this.root.addChild(this.back, this.fill, this.front);
    this.label = new Text({ text: 'HULL', style: LABEL_STYLE });
    this.label.anchor.set(0.5);
    this.value = new Text({ text: '', style: VALUE_STYLE });
    this.value.anchor.set(0, 1);
    this.max = new Text({ text: '', style: MAX_STYLE });
    this.max.anchor.set(0, 1);
    this.root.addChild(this.label, this.value, this.max);
    // The SHIELDED readout (UX-DR46 — the `info`-tinted stack a shield boon
    // puts over this one) is Story 8.15's and is deliberately not built here.
  }

  /**
   * One frame. `hold` is the amber corollary's verdict for this channel
   * (`hpGlobeHoldsLit`) — true means the ring outranked the globe and the water
   * eases up to its lit keyframe instead of breathing.
   */
  update(input: HpGlobeInput, c: Circle, nowSec: number, hold: boolean, uiScale: number): void {
    this.root.visible = true;
    const frac = railFraction(input.hp, input.maxHp);
    const pending = repairFraction(input.hp, input.repairHp, input.maxHp);
    const sig = `${railSig(frac, pending)}|${c.cx}|${c.cy}|${c.r}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.draw(c, frac, pending);
    }
    this.breathe(frac, nowSec, hold);
    this.readout(input, c, uiScale);
  }

  /** The static half: bed, the two rings, the pending band, the waterline. */
  private draw(c: Circle, frac: number, pending: number): void {
    const color = hpColor(frac);
    const waterY = globeWaterY(c.r, frac);
    this.back.clear();
    drawGlobeBed(this.back, c.cx, c.cy, c.r, C.silver, BED_RING_ALPHA);
    this.back.circle(c.cx, c.cy, c.r).stroke({ width: B.lineW, color, alpha: RAMP_RING_ALPHA });
    if (pending > 0) {
      const band = circleBandBetween(c.r, globeWaterY(c.r, frac + pending), waterY);
      if (band.length > 2) this.back.poly(flatten(band, c)).fill({ color, alpha: V.railPendingAlpha });
    }
    this.fill.clear();
    const water = circleSegmentBelow(c.r, waterY);
    if (water.length > 2) this.fill.poly(flatten(water, c)).fill({ color, alpha: FILL_ALPHA });
    this.front.clear();
    const half = Math.sqrt(Math.max(0, c.r * c.r - waterY * waterY));
    if (half <= 0) return; // an empty (or brimful) bowl has no chord to rule
    this.front
      .moveTo(c.cx - half, c.cy + waterY)
      .lineTo(c.cx + half, c.cy + waterY)
      .stroke({ width: B.waterline, color, alpha: 1 });
  }

  /** The per-frame half: the integrated pulse and the eased corollary hold. */
  private breathe(frac: number, nowSec: number, hold: boolean): void {
    const dt = this.lastPulseSec === null ? 0 : nowSec - this.lastPulseSec;
    this.lastPulseSec = nowSec;
    this.pulsePhase = advancePulsePhase(this.pulsePhase, frac, dt);
    this.hold = easeHold(this.hold, hold ? 1 : 0, Math.max(0, dt) * 1000);
    const amp = motionScaled(V.pulseAmp, settings.current.motion);
    this.fill.alpha = hullFillHeld(frac, this.pulsePhase, amp, this.hold);
  }

  /** `HULL` over `212 /250`, centred as one block on the globe. */
  private readout(input: HpGlobeInput, c: Circle, uiScale: number): void {
    const micro = microScale(uiScale);
    if (micro !== this.lastMicro) {
      this.label.scale.set(micro);
      this.lastMicro = micro;
    }
    const value = `${hullShownValue(input.hp)}`;
    const max = hullMaxLabel(input.maxHp);
    if (value !== this.lastValue) {
      this.value.text = value;
      this.lastValue = value;
    }
    if (max !== this.lastMax) {
      this.max.text = max;
      this.lastMax = max;
    }
    this.label.position.set(c.cx, c.cy + HULL_LABEL_DY);
    // Widths come from the MONO MODEL (ui/refitCardFit.ts), never from
    // `Text.width`: the bar's type is one monospaced stack, so the model is
    // exact, and reading a Text's bounds would force a canvas measure every
    // time the hull ticks (and is unavailable headless).
    const vw = monoTextWidth(value, VALUE_STYLE.fontSize, VALUE_STYLE.letterSpacing);
    const mw = monoTextWidth(max, MAX_STYLE.fontSize);
    const x = c.cx - (vw + mw) / 2;
    this.value.position.set(x, c.cy + READOUT_BOTTOM_DY);
    this.max.position.set(x + vw, c.cy + READOUT_BOTTOM_DY);
  }

  hide(): void {
    this.root.visible = false;
  }

  show(): void {
    this.root.visible = true;
  }

  /** Render-state seams (tests/debug) — the water's live breathing alpha and the
   *  composed readout, without reaching into the display list. */
  get fillAlpha(): number {
    return this.fill.alpha;
  }

  readoutText(): string {
    return `${this.label.text} ${this.value.text} ${this.max.text}`;
  }
}
