// THE XP STRIP (render/xpStrip.ts, Story 8.6 ruling 8) — the pure core (copy,
// the fill fraction, the chip's breathing state machine and its Tier-3 freeze)
// plus a Pixi smoke frame proving the shell composes, lays its row out against
// the bar's own spine, and dies with the hull.
//
// This suite is the XP RAIL's suite, relocated: every behavioural pin below
// came over unchanged from `xpRail.test.ts`, because the story moved the
// geometry and kept the behaviour. What is NEW is the strip's own row —
//   • the cue's ratified copy (`TAB TO REFIT`, no `LEVEL UP — ` prefix),
//   • `LV 0` rendering rather than an empty head,
//   • the track NARROWING by the measured tag and by the tail group,
//   • the tail RIGHT-FLUSHING (the chip shifts left by the cue + its gap),
//   • the 9px cue's counter-scale at the 90% UI setting.
//
// The rail's two structural promises — "the satellites live in the reserved
// gutter" and "the gutter stays water" — died with the gutter: the strip's row
// is part of the bar and is laid out by `hudBarLayout`, whose own suite
// (hudBar.test.ts) owns the geometry. What is left here is what the strip
// itself decides.

import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import {
  CHIP_LABEL_MAX_GLYPHS,
  CHIP_PULSE_HZ,
  XP_CHIP_IDLE,
  XpStrip,
  chipAlpha,
  chipBreathing,
  chipDimKeyframe,
  chipHeld,
  chipLabel,
  cueLine,
  levelTag,
  nextChipState,
  xpFillFraction,
  type XpChipState,
  type XpView,
} from '../render/xpStrip.js';
import { hudBarLayout, microScale, type StripLayout } from '../render/hudBar.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { easeHold } from '../render/zone.js';
import { settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const X = CLIENT_CONFIG.xpRail; // the chip's BREATH — unchanged by the move
const B = CLIENT_CONFIG.hudBar;
const FLOOR = { w: 1366, h: 768 }; // the supported viewport
const STRIP: StripLayout = hudBarLayout(FLOOR.w, FLOOR.h).strip;

/** One frame's view, with the fields a case cares about overridden. */
function view(over: Partial<XpView> = {}): XpView {
  return { lvl: 3, xp: 0.62, pts: 0, refitable: true, ...over };
}

describe('xpFillFraction — the track reads the server value verbatim', () => {
  it('passes a legal fraction straight through (no client-side accrual)', () => {
    expect(xpFillFraction(0)).toBe(0);
    expect(xpFillFraction(0.5)).toBe(0.5);
    expect(xpFillFraction(1)).toBe(1);
  });

  it('clamps defensively (a malformed frame can never draw outside the track)', () => {
    expect(xpFillFraction(-0.2)).toBe(0);
    expect(xpFillFraction(1.7)).toBe(1);
    // Non-finite = no information: the strip reads EMPTY rather than claiming a
    // full level off a malformed frame.
    expect(xpFillFraction(NaN)).toBe(0);
    expect(xpFillFraction(Infinity)).toBe(0);
  });

  it('WRAPS on a bank: the fill simply drops to the new fraction', () => {
    // 0.98 → level up → 0.01: the track restarts near empty; the chip pulse,
    // toast and tone carry the moment (spec Design Notes).
    expect(xpFillFraction(0.98)).toBeGreaterThan(xpFillFraction(0.01));
  });
});

describe('tag / chip / cue copy — dual-coded, hidden at zero', () => {
  it('the LV tag counts completed levels (integer, floored defensively)', () => {
    expect(levelTag(0)).toBe('LV 0');
    expect(levelTag(3)).toBe('LV 3');
    expect(levelTag(3.9)).toBe('LV 3');
    expect(levelTag(-2)).toBe('LV 0');
    expect(levelTag(NaN)).toBe('LV 0');
  });

  it('the chip is HIDDEN at zero and carries the BARE count — the chip is the shape channel', () => {
    // Orchestrator ruling (wave 2c): the mock draws a bare digit in the 24px
    // chip, so the rail's ▲ glyph does not come to the bar. The lit chip's own
    // presence is what says "a level is banked" without hue.
    expect(chipLabel(0)).toBe('');
    expect(chipLabel(-1)).toBe('');
    expect(chipLabel(1)).toBe('1');
    expect(chipLabel(4)).toBe('4');
    for (const pts of [1, 4, 9]) expect(chipLabel(pts)).not.toContain('▲');
  });

  // Past 9 the exact number stops being the information: "more than you can
  // spend in one sitting" is, and the cue says the rest.
  it('clamps the count at 9 — a hoarded bank renders +, never a two-digit count', () => {
    expect(chipLabel(9)).toBe('9');
    expect(chipLabel(10)).toBe('+');
    expect(chipLabel(42)).toBe('+');
    for (const pts of [10, 12, 99, 1000]) expect(chipLabel(pts).length).toBe(1);
  });

  // AMENDMENT 47 (the container-fit law), pinned against the BAR's chip: no
  // reachable label is wider than the 24px square at the 11px/600 count.
  it('NO chip label renders wider than the bank chip it sits in', () => {
    for (const pts of [0, 1, 5, 9, 10, 99, 1000]) {
      expect(monoTextWidth(chipLabel(pts), B.type.lv, 0)).toBeLessThanOrEqual(B.bankChip);
    }
    expect(CHIP_LABEL_MAX_GLYPHS).toBeGreaterThanOrEqual(2);
  });

  it('the cue reads TAB TO REFIT — the LEVEL UP prefix is the TOAST\'s, not the strip\'s', () => {
    // Ruling 8: the chip beside it reports the bank and the tag at the other end
    // of the row reports the level, so the strip says only what is left to say.
    expect(cueLine(0, true)).toBe('');
    expect(cueLine(1, true)).toBe('TAB TO REFIT');
    expect(cueLine(3, true)).toBe('TAB TO REFIT');
    expect(cueLine(1, true)).not.toContain('LEVEL UP');
    expect(cueLine(1, true)).not.toContain('—');
    // Amendment 33's vocabulary is otherwise untouched: no "banked" wording,
    // REFIT not UPGRADE.
    expect(cueLine(1, true)).not.toContain('BANK');
    expect(cueLine(1, true)).not.toContain('UPGRADE');
  });

  // Both review models (Fable + Codex) flagged this independently at the cycle-80
  // gate. Since the lazy-draw bugfix a level ALWAYS banks, so `pts > 0` with an
  // EMPTY front offer is a legitimate wire state (a degenerate exhausted deck —
  // `materializeOffer` stored no hand). `offerView` refuses to open the band on
  // an empty offer, so an instruction to press TAB would be a promise the client
  // cannot keep. The instruction is withheld; the CHIP still reports the bank,
  // because the level really was earned.
  it('withholds the TAB instruction when the bank cannot actually be refitted', () => {
    expect(cueLine(1, false)).toBe('');
    expect(cueLine(3, false)).toBe('');
    // ...but the chip is unchanged: the level is banked and still says so.
    expect(chipLabel(1)).toBe('1');
    expect(chipLabel(3)).toBe('3');
  });
});

describe('the chip breathing state machine (I/O matrix: 0 → 1 → 10s unspent → new bank)', () => {
  it('is hidden and unarmed at zero banked levels', () => {
    const s = nextChipState(XP_CHIP_IDLE, 0, 10);
    expect(s).toEqual(XP_CHIP_IDLE);
    expect(chipBreathing(s, 10)).toBe(false);
  });

  it('arms on the FIRST bank and breathes a 2.4s cycle under the shared 1.1 Hz cap', () => {
    const s = nextChipState(XP_CHIP_IDLE, 1, 100);
    expect(s).toEqual({ pts: 1, armedAt: 100 });
    expect(chipBreathing(s, 100)).toBe(true);
    expect(CHIP_PULSE_HZ).toBeCloseTo(1 / X.breathSec, 9);
    expect(1 / CHIP_PULSE_HZ).toBeGreaterThanOrEqual(2); // accessibility floor: ≥ 2s cycles
    expect(CHIP_PULSE_HZ).toBeLessThanOrEqual(CLIENT_CONFIG.settings.pulseCapHz);
  });

  it('DECAYS to static after ~10s unspent — information stays, motion stops', () => {
    const s = nextChipState(XP_CHIP_IDLE, 1, 0);
    expect(chipBreathing(s, X.unspentSec - 0.01)).toBe(true);
    expect(chipBreathing(s, X.unspentSec)).toBe(false);
    expect(chipBreathing(s, 60)).toBe(false);
    expect(chipAlpha(s, 60)).toBe(X.chipAlpha); // still fully legible when static
    expect(chipLabel(1)).not.toBe(''); // ...and still SHOWN
  });

  it('RE-ARMS on a new bank (the second level restarts the breath)', () => {
    const armed = nextChipState(XP_CHIP_IDLE, 1, 0);
    const stale = nextChipState(armed, 1, 30); // 30s unspent — decayed
    expect(chipBreathing(stale, 30)).toBe(false);
    const rebanked = nextChipState(stale, 2, 30);
    expect(rebanked).toEqual({ pts: 2, armedAt: 30 });
    expect(chipBreathing(rebanked, 30)).toBe(true);
  });

  it('RE-ARMS on a TAB refit open (amendment 1 replaces the old SPACE touch)', () => {
    const stale = nextChipState({ pts: 1, armedAt: 0 }, 1, 40);
    expect(chipBreathing(stale, 40)).toBe(false);
    const touched = nextChipState(stale, 1, 40, true);
    expect(touched.armedAt).toBe(40);
    expect(chipBreathing(touched, 40)).toBe(true);
  });

  it('drops the window when the bank empties, so the NEXT bank breathes from zero', () => {
    const armed = nextChipState(XP_CHIP_IDLE, 1, 0);
    const spent = nextChipState(armed, 0, 5); // spent inside the window
    expect(spent).toEqual(XP_CHIP_IDLE);
    const next = nextChipState(spent, 1, 6);
    expect(next.armedAt).toBe(6); // a fresh full window, not 1s of an inherited one
  });

  it('arms an ALREADY-banked chip that arrives unarmed (reconnect mid-bank)', () => {
    const s = nextChipState({ pts: 2, armedAt: null }, 2, 12);
    expect(s.armedAt).toBe(12);
  });

  it('carries an unchanged bank on its own clock (no per-frame re-arming)', () => {
    const armed = nextChipState(XP_CHIP_IDLE, 1, 0);
    const later = nextChipState(armed, 1, 3);
    expect(later.armedAt).toBe(0); // the window elapses, frame after frame
  });
});

describe('chipAlpha — motion-gated breathing over an information base', () => {
  const armed: XpChipState = { pts: 1, armedAt: 0 };

  it('starts at the BASE alpha (sin(0)) so every window eases out of the static chip', () => {
    expect(chipAlpha(armed, 0)).toBeCloseTo(X.chipAlpha, 9);
  });

  it('breathes symmetrically around the base at full motion', () => {
    const quarter = 1 / (4 * CHIP_PULSE_HZ);
    expect(chipAlpha(armed, quarter)).toBeCloseTo(X.chipAlpha + X.pulseAmp, 6);
    expect(chipAlpha(armed, 3 * quarter)).toBeCloseTo(X.chipAlpha - X.pulseAmp, 6);
  });

  it('HALVES at reduced motion and holds the base at off (information never moves)', () => {
    const quarter = 1 / (4 * CHIP_PULSE_HZ);
    expect(chipAlpha(armed, quarter, X.pulseAmp / 2)).toBeCloseTo(X.chipAlpha + X.pulseAmp / 2, 6);
    expect(chipAlpha(armed, quarter, 0)).toBe(X.chipAlpha);
  });

  it('never leaves a legible range (no flash to invisible, no blowout)', () => {
    for (let t = 0; t < 4; t += 0.05) {
      const a = chipAlpha(armed, t);
      expect(a).toBeGreaterThan(0.5);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

// --- the Pixi shell -------------------------------------------------------------

function build(): XpStrip {
  return new XpStrip(new Container());
}

describe('XpStrip shell — a live frame, a bank, and death', () => {
  afterEach(() => {
    settings.reset();
  });

  it('renders a live frame and hides again with the hull (the reveal / spectate)', () => {
    const strip = build();
    expect(strip.visible).toBe(false); // nothing until a live own ship exists
    strip.update(view({ lvl: 2, xp: 0.4 }), STRIP, 10);
    expect(strip.visible).toBe(true);
    strip.hide();
    expect(strip.visible).toBe(false);
    expect(strip.chipState).toEqual(XP_CHIP_IDLE); // the next life starts cold
  });

  it('drives the chip through hidden → breathing → static across frames', () => {
    const strip = build();
    strip.update(view({ lvl: 0, xp: 0.1 }), STRIP, 0);
    expect(strip.chipState.pts).toBe(0);
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 1); // banked
    expect(strip.chipState).toEqual({ pts: 1, armedAt: 1 });
    expect(chipBreathing(strip.chipState, 1)).toBe(true);
    strip.update(view({ lvl: 1, xp: 0.2, pts: 1 }), STRIP, 1 + X.unspentSec + 1);
    expect(chipBreathing(strip.chipState, 1 + X.unspentSec + 1)).toBe(false);
    expect(strip.chipFillAlpha).toBe(X.chipAlpha); // decayed to a static chip
  });

  it('re-arms from the TAB signal, exactly once', () => {
    const strip = build();
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0);
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 30); // decayed
    expect(chipBreathing(strip.chipState, 30)).toBe(false);
    strip.rearm();
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 30);
    expect(strip.chipState.armedAt).toBe(30);
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 31); // the signal is consumed
    expect(strip.chipState.armedAt).toBe(30);
  });

  // The forceSnap/pose gap (respawn, the P netcode toggle) hides the bar for a
  // frame or two. A full hide() there resets the chip state, so the very next
  // frame reads as a NEW bank and re-arms a decayed chip's 10s breathing window
  // — an unintended FOURTH re-arm trigger, off a gap nobody saw.
  it('a TRANSIENT hide (pose gap) keeps the chip state: a decayed chip stays static', () => {
    const strip = build();
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0);
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 30); // decayed to static
    expect(chipBreathing(strip.chipState, 30)).toBe(false);
    strip.hideTransient();
    expect(strip.visible).toBe(false);
    expect(strip.chipState).toEqual({ pts: 1, armedAt: 0 }); // state survives the gap
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 31); // the pose returns
    expect(strip.visible).toBe(true);
    expect(chipBreathing(strip.chipState, 31)).toBe(false); // still static — no re-arm
    expect(strip.chipFillAlpha).toBe(X.chipAlpha);
  });

  it('a FULL hide still starts the next life cold — a re-shown bank re-arms (pinned)', () => {
    const strip = build();
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0);
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 30); // decayed
    strip.hide();
    expect(strip.chipState).toEqual(XP_CHIP_IDLE);
    strip.update(view({ lvl: 1, xp: 0.5, pts: 1 }), STRIP, 31);
    expect(strip.chipState).toEqual({ pts: 1, armedAt: 31 }); // fresh window
    expect(chipBreathing(strip.chipState, 31)).toBe(true);
  });

  it('holds a STATIC chip at motion=off (the breath is motion, the chip is not)', () => {
    const strip = build();
    settings.set({ motion: 'off' });
    const quarter = 1 / (4 * CHIP_PULSE_HZ);
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0);
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, quarter);
    expect(strip.chipFillAlpha).toBe(X.chipAlpha);
  });

  it('survives the whole fill range and a level wrap without throwing', () => {
    const strip = build();
    expect(() => {
      for (const xp of [0, 0.001, 0.5, 0.999, 0]) strip.update(view({ lvl: 1, xp }), STRIP, 1);
    }).not.toThrow();
  });
});

// --- THE STRIP'S OWN ROW (Story 8.6) -------------------------------------------

describe('XpStrip row — the tag narrows the track, the tail right-flushes', () => {
  afterEach(() => settings.reset());

  it('starts the track a stripItemGap past the MEASURED tag, not at the bar edge', () => {
    const strip = build();
    strip.update(view({ lvl: 3, pts: 0 }), STRIP, 0);
    const tagW = monoTextWidth('LV 3', B.type.lv, B.type.lv * 0.14);
    expect(strip.trackRect.x).toBeCloseTo(STRIP.lvX + tagW + B.stripItemGap, 6);
    expect(strip.trackRect.x).toBeGreaterThan(STRIP.track.x);
    expect(strip.trackRect.h).toBe(B.strip);
    expect(strip.trackRect.y).toBe(STRIP.track.y);
  });

  it('re-measures when the tag grows a glyph (LV 9 → LV 10 pushes the track right)', () => {
    const a = build();
    const b = build();
    a.update(view({ lvl: 9 }), STRIP, 0);
    b.update(view({ lvl: 10 }), STRIP, 0);
    expect(b.trackRect.x).toBeGreaterThan(a.trackRect.x);
    expect(b.trackRect.w).toBeLessThan(a.trackRect.w);
  });

  it('runs the track to the bar\'s right edge while NOTHING is banked', () => {
    const strip = build();
    strip.update(view({ pts: 0 }), STRIP, 0);
    expect(strip.trackRect.x + strip.trackRect.w).toBe(STRIP.track.x + STRIP.track.w);
    expect(strip.chipVisible).toBe(false);
    expect(strip.cueVisible).toBe(false);
  });

  it('shows the chip at one banked level and stops the track short of it', () => {
    const strip = build();
    strip.update(view({ pts: 1 }), STRIP, 0);
    expect(strip.chipVisible).toBe(true);
    expect(strip.cueVisible).toBe(true);
    expect(strip.chipRect.w).toBe(B.bankChip);
    expect(strip.trackRect.x + strip.trackRect.w).toBeCloseTo(strip.chipRect.x - B.stripItemGap, 6);
    expect(strip.trackRect.w).toBeGreaterThan(0);
  });

  it('SHIFTS the chip left by the cue\'s width + cueGap when the cue renders', () => {
    const withCue = build();
    const noCue = build();
    withCue.update(view({ pts: 1, refitable: true }), STRIP, 0);
    noCue.update(view({ pts: 1, refitable: false }), STRIP, 0);
    // No cue: the chip holds the layout's own right-flushed box.
    expect(noCue.chipRect.x).toBe(STRIP.chip.x);
    expect(noCue.cueVisible).toBe(false);
    const cueW = monoTextWidth('TAB TO REFIT', B.type.cue, B.type.cue * 0.14);
    expect(withCue.chipRect.x).toBeCloseTo(STRIP.chip.x - cueW - B.cueGap, 6);
    // ...and the bar's right edge never moves: the group grows INWARD.
    expect(withCue.chipRect.x + withCue.chipRect.w).toBeLessThan(STRIP.cueX);
  });

  it('COUNTER-SCALES the 9px cue at the 90% UI setting and leaves 100/125% alone', () => {
    const strip = build();
    strip.update(view({ pts: 1 }), STRIP, 0, false, 0, 1);
    expect(strip.cueScale).toBe(1);
    strip.update(view({ pts: 1 }), STRIP, 0, false, 0, 1.25);
    expect(strip.cueScale).toBe(1);
    strip.update(view({ pts: 1 }), STRIP, 0, false, 0, 0.9);
    expect(strip.cueScale).toBeCloseTo(microScale(0.9), 9);
    expect(B.type.cue * strip.cueScale * 0.9).toBeCloseTo(B.type.cue, 9); // renders AT 9px
  });

  it('gives the counter-scaled cue its full room: the chip shifts by the SCALED width', () => {
    const full = build();
    const small = build();
    full.update(view({ pts: 1 }), STRIP, 0, false, 0, 1);
    small.update(view({ pts: 1 }), STRIP, 0, false, 0, 0.9);
    expect(small.chipRect.x).toBeLessThan(full.chipRect.x); // a wider cue pushes further
  });

  it('renders LV 0 rather than an empty head (the held start line)', () => {
    const strip = build();
    strip.update(view({ lvl: 0, xp: 0, pts: 0 }), STRIP, 0);
    expect(levelTag(0)).toBe('LV 0');
    expect(strip.visible).toBe(true);
    expect(strip.chipVisible).toBe(false); // nothing banked at the line
    expect(strip.trackRect.w).toBeGreaterThan(0); // the track always draws
  });

  it('survives a degenerate row (a viewport so narrow the tail eats the track)', () => {
    const strip = build();
    const squeezed: StripLayout = { ...STRIP, track: { ...STRIP.track, w: 4 }, chip: { ...STRIP.chip, x: STRIP.lvX } };
    expect(() => strip.update(view({ pts: 1 }), squeezed, 0)).not.toThrow();
    expect(strip.trackRect.w).toBe(0); // clamped, never negative
  });
});

// --- STORY 4.8: THE TIER-3 FREEZE ----------------------------------------------
//
// The bank chip is the ONE Tier-3 channel that actually breathes (the toasts
// fade on a TTL and the XP track itself does not animate), so it is where the
// economy tier's *"freezes at its dim keyframe under ANY higher tier"* rule
// lands — Tier 2 ALONE included (amendment 243's literal reading).

describe('chipDimKeyframe / chipHeld — the Tier-3 freeze', () => {
  const banked = nextChipState(XP_CHIP_IDLE, 1, 0);

  it('the dim keyframe is the LOW extreme of the breath — dim, never gone', () => {
    expect(chipDimKeyframe(banked, 0.4)).toBeCloseTo(X.chipAlpha - X.pulseAmp, 9);
    expect(chipDimKeyframe(banked, 0.4)).toBeGreaterThan(0);
    // Every frame of the breath is at or above it, so the freeze can never make
    // the chip brighter than it would have been at that instant... or invisible.
    for (let t = 0.05; t < 2; t += 0.05) {
      expect(chipAlpha(banked, t)).toBeGreaterThanOrEqual(chipDimKeyframe(banked, t) - 1e-9);
    }
  });

  it('EASES rather than snaps — a partial blend is a real intermediate value', () => {
    const peak = 1 / (4 * CHIP_PULSE_HZ); // sin = 1, the brightest frame
    const breathing = chipAlpha(banked, peak, X.pulseAmp);
    const oneFrame = chipHeld(banked, peak, X.pulseAmp, easeHold(0, 1, 16));
    expect(oneFrame).toBeLessThan(breathing);
    expect(oneFrame).toBeGreaterThan(chipDimKeyframe(banked, peak) + 1e-3);
    let freeze = 0;
    for (let i = 0; i < 120; i++) freeze = easeHold(freeze, 1, 16); // ~2s = 8τ
    expect(chipHeld(banked, peak, X.pulseAmp, freeze)).toBeCloseTo(chipDimKeyframe(banked, peak), 3);
  });

  it('is a NO-OP at motion=off and on a decayed (static) chip', () => {
    expect(chipHeld(banked, 0.4, 0, 1)).toBe(X.chipAlpha); // motion:off: one endpoint
    const late = X.unspentSec + 1;
    expect(chipHeld(banked, late, X.pulseAmp, 1)).toBe(chipAlpha(banked, late, X.pulseAmp));
  });
});

describe('XpStrip — the freeze on the real instrument', () => {
  afterEach(() => settings.reset());

  it('settles the chip at its dim keyframe while a higher tier is active', () => {
    const strip = build();
    const v = view({ lvl: 1, xp: 0.5, pts: 1 });
    let ms = 0;
    // ~2s of frozen frames (server seconds and monotonic ms advance together).
    for (let i = 0; i < 125; i++) {
      ms += 16;
      strip.update(v, STRIP, ms / 1000, true, ms);
    }
    expect(strip.chipFillAlpha).toBeCloseTo(X.chipAlpha - X.pulseAmp, 2);
  });

  it('breathes again when every higher tier clears', () => {
    const strip = build();
    const v = view({ lvl: 1, xp: 0.5, pts: 1 });
    let ms = 0;
    for (let i = 0; i < 125; i++) {
      ms += 16;
      strip.update(v, STRIP, ms / 1000, true, ms);
    }
    const alphas: number[] = [];
    for (let i = 0; i < 200; i++) {
      ms += 16;
      strip.update(v, STRIP, ms / 1000, false, ms);
      alphas.push(strip.chipFillAlpha);
    }
    expect(new Set(alphas.map((a) => a.toFixed(4))).size).toBeGreaterThan(20); // it moves again
    expect(Math.max(...alphas)).toBeGreaterThan(X.chipAlpha - X.pulseAmp + 0.01);
  });

  it('defaults to NOT frozen, so a caller that passes no tier is unchanged', () => {
    const strip = build();
    const a = build();
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0);
    a.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, 0, false);
    const quarter = 1 / (4 * CHIP_PULSE_HZ);
    strip.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, quarter);
    a.update(view({ lvl: 1, xp: 0, pts: 1 }), STRIP, quarter, false);
    expect(strip.chipFillAlpha).toBeCloseTo(X.chipAlpha + X.pulseAmp, 9);
    expect(strip.chipFillAlpha).toBe(a.chipFillAlpha);
  });

  it('drops the freeze blend with the hull, but keeps it across a pose gap', () => {
    const strip = build();
    const v = view({ lvl: 1, xp: 0.5, pts: 1 });
    let ms = 0;
    for (let i = 0; i < 125; i++) {
      ms += 16;
      strip.update(v, STRIP, ms / 1000, true, ms);
    }
    const frozen = strip.chipFillAlpha;
    strip.hideTransient(); // the forceSnap pose gap: a frame the player never saw
    ms += 16;
    strip.update(v, STRIP, ms / 1000, true, ms);
    expect(strip.chipFillAlpha).toBeCloseTo(frozen, 3); // the hold survived it
    strip.hide(); // ...death, though, is a real boundary
    ms += 16;
    strip.update(v, STRIP, ms / 1000, false, ms);
    expect(strip.chipFillAlpha).toBeCloseTo(X.chipAlpha, 9); // a fresh window, unfrozen
  });
});
