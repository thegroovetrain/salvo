// THE economy satellites (render/xpRail.ts, Story 2.6): the pure core — gutter
// layout, rail fill, LV tag / chip / cue copy, and the chip's breathing state
// machine (arm → decay-to-static → re-arm) — plus a Pixi smoke frame proving the
// shell composes and that the satellites die with the hull.
//
// The two structural promises this suite guards for the rest of the HUD:
//   • the rail lives INSIDE the gutter Story 2.2 reserved, which stays WATER
//     (slotAtPoint) — a press over the satellites is never a hotbar action, and
//     never stops being a shot;
//   • the tag/chip/cue sit clear of every slot row and inside the hotbar zone's
//     horizontal budget, so hud.test.ts's bottom-left/bottom-right no-overlap
//     proof still measures the truth.

import { describe, it, expect, afterEach } from 'vitest';
import { Container } from 'pixi.js';
import {
  CHIP_PULSE_HZ,
  XP_CHIP_IDLE,
  XpRail,
  chipAlpha,
  chipBreathing,
  chipLabel,
  cueLine,
  levelTag,
  nextChipState,
  xpFillFraction,
  xpRailLayout,
  type XpChipState,
} from '../render/xpRail.js';
import { hotbarLayout, slotAtPoint } from '../render/hotbar.js';
import { settings } from '../settings/store.js';
import { CLIENT_CONFIG } from '../config.js';

const X = CLIENT_CONFIG.xpRail;
const H = CLIENT_CONFIG.hotbar;
const FLOOR = { w: 1366, h: 768 }; // the supported viewport floor

describe('xpRailLayout — the satellites live in the RESERVED GUTTER', () => {
  it('puts the 3px rail inside the gutter band, spanning the hotbar stack', () => {
    const L = xpRailLayout(FLOOR.h);
    const hb = hotbarLayout(FLOOR.h);
    expect(L.rail.w).toBe(3); // UX-DR12: only the HP rail widened to 6 (amendment 27)
    expect(L.rail.x).toBeGreaterThanOrEqual(hb.gutterX);
    expect(L.rail.x + L.rail.w).toBeLessThanOrEqual(hb.gutterX + H.gutter); // never under a slot row
    expect(L.rail.y).toBe(hb.stackTop);
    expect(L.rail.h).toBe(hb.stackHeight);
  });

  it('keeps the gutter WATER: the rail routes no hotbar click (2.2 pins hold)', () => {
    const L = xpRailLayout(FLOOR.h);
    const hb = hotbarLayout(FLOOR.h);
    for (const y of [L.rail.y + 1, L.rail.y + L.rail.h / 2, L.rail.y + L.rail.h - 1]) {
      expect(slotAtPoint({ x: L.rail.x, y }, hb)).toBeNull();
      expect(slotAtPoint({ x: L.rail.x + L.rail.w, y }, hb)).toBeNull();
    }
  });

  it('stacks tag → chip → cue ABOVE the slot rows, clear of every row footprint', () => {
    const L = xpRailLayout(FLOOR.h);
    const hb = hotbarLayout(FLOOR.h);
    const topRow = hb.rows[0].row;
    expect(L.tag.y).toBeLessThan(hb.stackTop);
    expect(L.chip.y + L.chip.size).toBeLessThan(L.tag.y); // chip clears the tag
    expect(L.chip.y + L.chip.size).toBeLessThan(topRow.y); // ...and the first row's box
    expect(L.cue.y).toBe(L.chip.y + L.chip.size / 2); // the cue reads level with the chip
    expect(slotAtPoint({ x: L.chip.x + 2, y: L.chip.y + 2 }, hb)).toBeNull();
    expect(slotAtPoint({ x: L.tag.x + 2, y: L.tag.y }, hb)).toBeNull();
  });

  it('starts on screen and stays inside the hotbar zone budget hud.test.ts measures', () => {
    const L = xpRailLayout(FLOOR.h);
    expect(L.chip.y).toBeGreaterThan(0);
    expect(L.tag.x).toBeGreaterThanOrEqual(0);
    // Widest the cue line can be before it would break the bottom-left budget
    // (gutter + key chip + gap + slot + gap + label column).
    const hotbarRight = H.left + H.keyChip + H.keyGap + H.slot + H.labelGap + H.labelWidth;
    const cueBudget = hotbarRight - L.cue.x;
    expect(cueBudget).toBeGreaterThan(cueLine(1).length * 11); // ample at 14px mono
  });

  it('tracks the viewport (a taller screen moves the whole stack with it)', () => {
    const a = xpRailLayout(768);
    const b = xpRailLayout(1080);
    expect(b.rail.y - a.rail.y).toBe(1080 - 768);
    expect(b.tag.y - a.tag.y).toBe(1080 - 768);
    expect(b.chip.y - a.chip.y).toBe(1080 - 768);
    expect(b.rail.x).toBe(a.rail.x); // the gutter is bottom-LEFT anchored
  });
});

describe('xpFillFraction — the rail reads the server value verbatim', () => {
  it('passes a legal fraction straight through (no client-side accrual)', () => {
    expect(xpFillFraction(0)).toBe(0);
    expect(xpFillFraction(0.5)).toBe(0.5);
    expect(xpFillFraction(1)).toBe(1);
  });

  it('clamps defensively (a malformed frame can never draw outside the track)', () => {
    expect(xpFillFraction(-0.2)).toBe(0);
    expect(xpFillFraction(1.7)).toBe(1);
    // Non-finite = no information: the rail reads EMPTY rather than claiming a
    // full level off a malformed frame.
    expect(xpFillFraction(NaN)).toBe(0);
    expect(xpFillFraction(Infinity)).toBe(0);
  });

  it('WRAPS on a bank: the fill simply drops to the new fraction', () => {
    // 0.98 → level up → 0.01: the rail restarts near empty; the chip pulse,
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

  it('the chip is HIDDEN at zero and carries a ▲ GLYPH beside the count (never color alone)', () => {
    expect(chipLabel(0)).toBe('');
    expect(chipLabel(-1)).toBe('');
    expect(chipLabel(1)).toBe('▲1');
    expect(chipLabel(4)).toBe('▲4');
  });

  // The chip is a FIXED square (X.chip px): a two-digit count overflows it, so
  // the label clamps at 9 rather than spilling past the box's border.
  it('clamps the count at 9 — a hoarded bank renders ▲9+, never a two-digit overflow', () => {
    expect(chipLabel(9)).toBe('▲9');
    expect(chipLabel(10)).toBe('▲9+');
    expect(chipLabel(42)).toBe('▲9+');
    for (const pts of [10, 12, 99, 1000]) expect(chipLabel(pts).length).toBeLessThanOrEqual(3);
  });

  it('the cue line appears WITH the chip and names the key + the action', () => {
    expect(cueLine(0)).toBe('');
    expect(cueLine(1)).toBe('LEVEL UP — TAB TO REFIT');
    expect(cueLine(3)).toBe('LEVEL UP — TAB TO REFIT');
    // Amendment 33's vocabulary: no "banked" wording, REFIT not UPGRADE.
    expect(cueLine(1)).not.toContain('BANK');
    expect(cueLine(1)).not.toContain('UPGRADE');
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

describe('XpRail shell — a live frame, a bank, and death', () => {
  afterEach(() => {
    settings.reset();
  });

  function build(): { layer: Container; rail: XpRail } {
    const layer = new Container();
    return { layer, rail: new XpRail(layer) };
  }

  it('renders a live frame and hides again with the hull (death / spectate)', () => {
    const { rail } = build();
    expect(rail.visible).toBe(false); // nothing until a live own ship exists
    rail.update({ lvl: 2, xp: 0.4, pts: 0 }, FLOOR.h, 10);
    expect(rail.visible).toBe(true);
    rail.hide();
    expect(rail.visible).toBe(false);
    expect(rail.chipState).toEqual(XP_CHIP_IDLE); // the next life starts cold
  });

  it('drives the chip through hidden → breathing → static across frames', () => {
    const { rail } = build();
    rail.update({ lvl: 0, xp: 0.1, pts: 0 }, FLOOR.h, 0);
    expect(rail.chipState.pts).toBe(0);
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, 1); // banked
    expect(rail.chipState).toEqual({ pts: 1, armedAt: 1 });
    expect(chipBreathing(rail.chipState, 1)).toBe(true);
    rail.update({ lvl: 1, xp: 0.2, pts: 1 }, FLOOR.h, 1 + X.unspentSec + 1);
    expect(chipBreathing(rail.chipState, 1 + X.unspentSec + 1)).toBe(false);
    expect(rail.chipFillAlpha).toBe(X.chipAlpha); // decayed to a static chip
  });

  it('re-arms from the TAB signal, exactly once', () => {
    const { rail } = build();
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, 0);
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 30); // decayed
    expect(chipBreathing(rail.chipState, 30)).toBe(false);
    rail.rearm();
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 30);
    expect(rail.chipState.armedAt).toBe(30);
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 31); // the signal is consumed
    expect(rail.chipState.armedAt).toBe(30);
  });

  // The forceSnap/pose gap (respawn, the P netcode toggle) hides the satellites
  // for a frame or two. A full hide() there resets the chip state, so the very
  // next frame reads as a NEW bank and re-arms a decayed chip's 10s breathing
  // window — an unintended FOURTH re-arm trigger, off a gap nobody saw.
  it('a TRANSIENT hide (pose gap) keeps the chip state: a decayed chip stays static', () => {
    const { rail } = build();
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, 0);
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 30); // decayed to static
    expect(chipBreathing(rail.chipState, 30)).toBe(false);
    rail.hideTransient();
    expect(rail.visible).toBe(false);
    expect(rail.chipState).toEqual({ pts: 1, armedAt: 0 }); // state survives the gap
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 31); // the pose returns
    expect(rail.visible).toBe(true);
    expect(chipBreathing(rail.chipState, 31)).toBe(false); // still static — no re-arm
    expect(rail.chipFillAlpha).toBe(X.chipAlpha);
  });

  it('a FULL hide still starts the next life cold — a re-shown bank re-arms (pinned)', () => {
    const { rail } = build();
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, 0);
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 30); // decayed
    rail.hide();
    expect(rail.chipState).toEqual(XP_CHIP_IDLE);
    rail.update({ lvl: 1, xp: 0.5, pts: 1 }, FLOOR.h, 31);
    expect(rail.chipState).toEqual({ pts: 1, armedAt: 31 }); // fresh window
    expect(chipBreathing(rail.chipState, 31)).toBe(true);
  });

  it('holds a STATIC chip at motion=off (the breath is motion, the chip is not)', () => {
    const { rail } = build();
    settings.set({ motion: 'off' });
    const quarter = 1 / (4 * CHIP_PULSE_HZ);
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, 0);
    rail.update({ lvl: 1, xp: 0, pts: 1 }, FLOOR.h, quarter);
    expect(rail.chipFillAlpha).toBe(X.chipAlpha);
  });

  it('survives the whole fill range and a level wrap without throwing', () => {
    const { rail } = build();
    expect(() => {
      for (const xp of [0, 0.001, 0.5, 0.999, 0]) rail.update({ lvl: 1, xp, pts: 0 }, FLOOR.h, 1);
    }).not.toThrow();
  });
});
