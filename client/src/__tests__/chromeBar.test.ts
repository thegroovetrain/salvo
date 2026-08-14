// THE BR CHROME BAR (Story 3.3, amendments 19–21) — the pure composer behind
// the top-center match register:
//
//     12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34
//
// Every row of the story's I/O matrix is a test here, plus the three rules that
// are easy to break silently later: the ring readout's URGENCY OVERRIDE grammar,
// the ONE shared pulse ceiling (no second rate literal anywhere in the client),
// and the style register (numbers phosphor, labels dim-alpha phosphor — never
// `textMuted` — ring segment storm violet, amber only in the urgency window).

import { describe, it, expect } from 'vitest';
import {
  CHROME_BAR_SEGMENTS,
  barVisible,
  RING_LIT_ALPHA,
  RING_PULSE_AMP,
  RING_PULSE_HZ,
  advanceRingPhase,
  chromeBarLayout,
  chromeBarSegments,
  fmtBarClock,
  fmtElapsedClock,
  fmtRingClock,
  ringReadout,
  ringSegmentAlpha,
  type ChromeBarView,
} from '../ui/chromeBar.js';
import { CLIENT_CONFIG } from '../config.js';
import { motionScaled } from '../settings/store.js';
import { KILL_LEADER_MARK } from '../ui/bounty.js';
import { monoTextWidth } from '../ui/refitCardFit.js';
import { textSafe } from '../util/color.js';
import { ellipsizeName } from '../util/text.js';

const CB = CLIENT_CONFIG.chromeBar;
const C = CLIENT_CONFIG.colors;
const CAP_HZ = CLIENT_CONFIG.settings.pulseCapHz;

function view(over: Partial<ChromeBarView> = {}): ChromeBarView {
  return {
    visible: true,
    afloat: 12,
    kills: 2,
    matchMs: 252_000, // 4:12
    ring: ringReadout('clear', 154_000), // 2:34 to the close start
    bounty: null, // vacant throne: the register is absent entirely (Story 4.6)
    tier1: false,
    ...over,
  };
}

/** The whole row as one string — what the player actually reads. */
function row(v: ChromeBarView): string {
  return chromeBarSegments(v).map((s) => s.text).join('');
}

// --- the register strings (the I/O matrix, row by row) -------------------------

describe('ringReadout — amendment 26\'s continuous-countdown grammar', () => {
  it('idle renders NOTHING (the pre-live ready room keeps its phase lines)', () => {
    expect(ringReadout('idle', 0)).toEqual({ text: '', urgent: false });
  });

  it('a clear beat counts down to the next close START', () => {
    expect(ringReadout('clear', 154_000)).toEqual({ text: 'RING CLOSES IN 2:34', urgent: false });
  });

  it('the SUPPLY beat is BYTE-IDENTICAL to clear (the parked slot has zero HUD trace)', () => {
    for (const ms of [154_000, 60_000, 9_400, 0]) {
      expect(ringReadout('supply', ms)).toEqual(ringReadout('clear', ms));
    }
  });

  it('the REVEAL beat keeps the countdown running — no announcement register (amendment 26; the RING REVEALED gap Eric hit live is retired)', () => {
    expect(ringReadout('reveal', 47_000)).toEqual({ text: 'RING CLOSES IN 0:47', urgent: false });
    for (const ms of [59_000, 30_000, 10_001]) {
      expect(ringReadout('reveal', ms)).toEqual(ringReadout('clear', ms));
    }
  });

  it('the last 10s of ANY pre-close beat go amber, in the urgency window', () => {
    expect(ringReadout('reveal', 9_400)).toEqual({ text: 'RING CLOSES IN 0:10', urgent: true });
    expect(ringReadout('clear', 9_400)).toEqual({ text: 'RING CLOSES IN 0:10', urgent: true });
    expect(ringReadout('supply', 4_100)).toEqual({ text: 'RING CLOSES IN 0:05', urgent: true });
  });

  it('opens the urgency window at EXACTLY urgentMs (inclusive), not a tick later', () => {
    expect(ringReadout('reveal', CB.urgentMs).urgent).toBe(true);
    expect(ringReadout('reveal', CB.urgentMs + 1).urgent).toBe(false);
    expect(ringReadout('reveal', CB.urgentMs + 1).text).toBe(`RING CLOSES IN ${fmtRingClock(CB.urgentMs + 1)}`);
    // ...and the window is defined on closesInMs itself, so a retuned timeline
    // (or a test beat config) can never put copy and countdown out of step.
    expect(ringReadout('clear', 3_000, 5_000).urgent).toBe(true);
    expect(ringReadout('clear', 7_000, 5_000).urgent).toBe(false);
  });

  it('the SHRINK counts to the close END and is never amber', () => {
    expect(ringReadout('closing', 41_000)).toEqual({ text: 'RING CLOSING 0:41', urgent: false });
    // Deep inside the shrink, where a pre-close beat would have gone amber.
    expect(ringReadout('closing', 2_000)).toEqual({ text: 'RING CLOSING 0:02', urgent: false });
  });

  it('a fully closed ring just says so — steady, no countdown', () => {
    expect(ringReadout('closed', 0)).toEqual({ text: 'RING CLOSED', urgent: false });
    expect(ringReadout('closed', 99_000)).toEqual({ text: 'RING CLOSED', urgent: false });
  });

  it('clamps a degenerate clock instead of printing a negative one', () => {
    expect(ringReadout('clear', 0).text).toBe('RING CLOSES IN 0:00');
    expect(ringReadout('clear', -5_000).text).toBe('RING CLOSES IN 0:00');
    expect(ringReadout('closing', Number.NaN).text).toBe('RING CLOSING 0:00');
    expect(ringReadout('clear', Number.NaN).urgent).toBe(false); // a NaN clock is not an alarm
  });
});

describe('fmtElapsedClock — unpadded SHAPE, elapsed DIRECTION (Story 5.3)', () => {
  it('floors like fmtBarClock but drops the minute padding like fmtRingClock', () => {
    // The third corner: the two shipped formatters covered elapsed+padded and
    // countdown+unpadded, and TIME AFLOAT needed elapsed+unpadded. Reaching for
    // fmtRingClock because its shape was right silently bought its ceil.
    expect(fmtElapsedClock(387_400)).toBe('6:27'); // fmtRingClock would say 6:28
    expect(fmtElapsedClock(387_000)).toBe('6:27'); // boundary: both agree
    expect(fmtElapsedClock(1)).toBe('0:00'); // 1ms in has not finished a second
    expect(fmtElapsedClock(0)).toBe('0:00');
  });

  it('shares the direction of fmtBarClock and the shape of fmtRingClock', () => {
    for (const ms of [0, 1, 999, 1000, 61_500, 387_400, 3_599_999]) {
      // Same seconds as the padded elapsed clock — only the minute padding differs.
      expect(fmtElapsedClock(ms).padStart(5, '0')).toBe(fmtBarClock(ms));
    }
  });

  it('clamps a negative or non-finite span to 0:00 rather than rendering junk', () => {
    expect(fmtElapsedClock(-1)).toBe('0:00');
    expect(fmtElapsedClock(Number.NaN)).toBe('0:00');
  });
});

describe('fmtBarClock — the zero-padded, up-counting match timer', () => {
  it('pads the minutes so the row never twitches width', () => {
    expect(fmtBarClock(252_000)).toBe('04:12');
    expect(fmtBarClock(0)).toBe('00:00');
    expect(fmtBarClock(59_000)).toBe('00:59');
    expect(fmtBarClock(600_000)).toBe('10:00');
  });

  it('FLOORS the elapsed second — an up-counting clock must never read ahead of itself', () => {
    // Review fix 1: the match timer counts UP, so the second it displays is the
    // one that has actually elapsed. (Countdowns are the opposite and keep CEIL:
    // a live second reads as that second — see fmtRingClock.)
    expect(fmtBarClock(0)).toBe('00:00');
    expect(fmtBarClock(1)).toBe('00:00'); // one ms into the match is still T+00:00
    expect(fmtBarClock(999)).toBe('00:00');
    expect(fmtBarClock(1_000)).toBe('00:01');
    expect(fmtBarClock(61_001)).toBe('01:01');
  });

  it('clamps at zero and survives a degenerate clock (no NaN, no negative string)', () => {
    expect(fmtBarClock(-1)).toBe('00:00');
    expect(fmtBarClock(-999_999)).toBe('00:00');
    expect(fmtBarClock(Number.NaN)).toBe('00:00');
    expect(fmtBarClock(Number.POSITIVE_INFINITY)).toBe('00:00');
  });

  it('the RING clock is the same seconds, minutes UNPADDED (a countdown, not a clock)', () => {
    expect(fmtRingClock(154_000)).toBe('2:34');
    expect(fmtRingClock(9_400)).toBe('0:10');
    expect(fmtRingClock(-1)).toBe('0:00');
  });
});

// --- the composed row ----------------------------------------------------------

describe('chromeBarSegments — the whole register', () => {
  it('reads `n AFLOAT · n KILLS · T+mm:ss · <ring>` on a live clear beat', () => {
    expect(row(view())).toBe('12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34');
  });

  it('the supply beat renders byte-identically to clear', () => {
    expect(row(view({ ring: ringReadout('supply', 154_000) }))).toBe(row(view()));
  });

  it('shows the whole matrix of ring states in place', () => {
    expect(row(view({ ring: ringReadout('reveal', 47_000) }))).toMatch(/· RING CLOSES IN 0:47$/);
    expect(row(view({ ring: ringReadout('reveal', 9_400) }))).toMatch(/· RING CLOSES IN 0:10$/);
    expect(row(view({ ring: ringReadout('closing', 41_000) }))).toMatch(/· RING CLOSING 0:41$/);
    expect(row(view({ ring: ringReadout('closed', 0) }))).toMatch(/· RING CLOSED$/);
  });

  it('AFLOAT counts whatever it is handed — the field thinning is the whole point', () => {
    expect(row(view({ afloat: 20 }))).toMatch(/^20 AFLOAT/);
    expect(row(view({ afloat: 1 }))).toMatch(/^1 AFLOAT/);
    expect(row(view({ afloat: 0 }))).toMatch(/^0 AFLOAT/);
  });

  it('never prints a negative / fractional / missing tally', () => {
    expect(row(view({ afloat: -3, kills: Number.NaN }))).toMatch(/^0 AFLOAT · 0 KILLS/);
    expect(row(view({ kills: 2.4 }))).toMatch(/· 2 KILLS/);
  });

  it('never exceeds the segment count the renderer pools Texts for — and HITS it with the throne held', () => {
    // The pool is the MAXIMUM row (Story 4.6, 2026-08-10 rework): 10 fixed
    // segments plus the kill-leader register's optional 2 (separator + marked
    // name — the retired `BOUNTY: ` label segment made it 3). A stale literal
    // in EITHER direction is wrong: undersized lets layoutChromeBar drop the
    // tail silently, oversized wastes pooled Texts. Both bounds are pinned.
    expect(chromeBarSegments(view({ bounty: { name: 'ALPHA', hue: 0x35d07f } }))).toHaveLength(CHROME_BAR_SEGMENTS);
    expect(chromeBarSegments(view())).toHaveLength(CHROME_BAR_SEGMENTS - 2);
    // ...and the count is stable across every ring state (the ring is one slot).
    for (const state of ['clear', 'supply', 'reveal', 'closing', 'closed', 'idle'] as const) {
      expect(chromeBarSegments(view({ ring: ringReadout(state, 5_000) }))).toHaveLength(CHROME_BAR_SEGMENTS - 2);
      expect(
        chromeBarSegments(view({ ring: ringReadout(state, 5_000), bounty: { name: 'A', hue: 0x35d07f } })),
      ).toHaveLength(CHROME_BAR_SEGMENTS);
    }
  });
});

// --- THE KILL LEADER REGISTER (Story 4.6, 2026-08-10 rework) ------------------
// The bar is one of exactly THREE surfaces the throne reaches, and the only one
// that persists. It is IDENTITY ONLY: a skull-marked callsign in a hue, at the
// tail of the row, and nothing anywhere that says where that hull is. (The
// `BOUNTY: <NAME>` label grammar is retired — the mark IS the caption.)

describe('chromeBarSegments — the KILL LEADER register', () => {
  const HUE = 0x35d07f;

  it('prints `☠︎ <NAME>` at the TAIL of the row when the throne is held', () => {
    expect(row(view({ bounty: { name: 'ALPHA', hue: HUE } }))).toBe(
      `12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34 · ${KILL_LEADER_MARK} ALPHA`,
    );
  });

  it('omits the WHOLE register — separator included — when the throne is vacant', () => {
    const segs = chromeBarSegments(view({ bounty: null }));
    expect(row(view({ bounty: null }))).toBe('12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES IN 2:34');
    expect(row(view({ bounty: null }))).not.toContain(KILL_LEADER_MARK);
    // No dangling separator artifact: the row ends on the ring readout, and the
    // count of ` · ` separators is unchanged from the pre-bounty bar.
    expect(segs.filter((s) => s.text === ' · ')).toHaveLength(3);
    expect(segs[segs.length - 1].pulsed).toBe(true); // the ring is the last segment
  });

  it('the MARK rides the name segment — one segment, wearing the holder\'s lifted hue', () => {
    const segs = chromeBarSegments(view({ bounty: { name: 'ALPHA', hue: HUE } }));
    const name = segs[segs.length - 1];
    expect(name.text).toBe(`${KILL_LEADER_MARK} ALPHA`);
    expect(name.color).toBe(textSafe(HUE)); // WCAG-lifted, exactly as the feed lifts it
    expect(name.alpha).toBe(1); // the NAME is information: full alpha
    expect(name.pulsed).toBeUndefined(); // ...and it never breathes; only the ring does
  });

  it('mid-ellipsizes a long callsign at the one shared name cap (mark excluded)', () => {
    const segs = chromeBarSegments(view({ bounty: { name: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', hue: HUE } }));
    expect(segs[segs.length - 1].text).toBe(`${KILL_LEADER_MARK} ${ellipsizeName('ABCDEFGHIJKLMNOPQRSTUVWXYZ')}`);
  });

  it('carries NOTHING but identity — no number anywhere in the register', () => {
    // The ruling that shipped the bounty deleted every positional cue; the
    // register must not smuggle a kill count, a range or a bearing back in.
    const segs = chromeBarSegments(view({ bounty: { name: 'ALPHA', hue: HUE } })).slice(-2);
    expect(segs.map((s) => s.text).join('')).toBe(` · ${KILL_LEADER_MARK} ALPHA`);
    expect(segs.map((s) => s.text).join('')).not.toMatch(/\d/);
  });
});

describe('chromeBarSegments — the STYLE register (amendments 17/21)', () => {
  const segs = chromeBarSegments(view());
  const [afloatN, afloatL, sep1, killsN, killsL, sep2, tPlus, clock, sep3, ring] = segs;

  it('numbers are full-alpha phosphor (tabular for free — Geist Mono is monospaced)', () => {
    for (const s of [afloatN, killsN, clock]) {
      expect(s.color).toBe(C.phosphor);
      expect(s.alpha).toBe(1);
    }
  });

  it('labels — INCLUDING the `T+` prefix — are dim-alpha phosphor, never grey', () => {
    for (const s of [afloatL, killsL, tPlus]) {
      expect(s.color).toBe(C.phosphor);
      expect(s.alpha).toBe(CB.labelAlpha);
    }
    expect([afloatL.text, killsL.text, tPlus.text]).toEqual([' AFLOAT', ' KILLS', 'T+']);
  });

  it('NOTHING in the bar is `textMuted` — grey text is retired for load-bearing HUD text', () => {
    for (const s of segs) expect(s.color).not.toBe(C.textMuted);
    for (const s of segs) expect(s.color).not.toBe(C.textSecondary);
  });

  it('separators are punctuation: dimmer than the labels, and identical to each other', () => {
    for (const s of [sep1, sep2, sep3]) {
      expect(s.text).toBe(' · ');
      expect(s.alpha).toBe(CB.sepAlpha);
    }
    expect(CB.sepAlpha).toBeLessThan(CB.labelAlpha);
  });

  it('the ring segment wears the STORM register — violet, amber only when urgent', () => {
    expect(ring.color).toBe(C.stormReadout);
    expect(ring.pulsed).toBe(true);
    const urgent = chromeBarSegments(view({ ring: ringReadout('reveal', 9_400) }));
    expect(urgent[urgent.length - 1].color).toBe(C.amber);
    // The shrink is NOT an urgency window — it stays violet (amendment 20).
    const closing = chromeBarSegments(view({ ring: ringReadout('closing', 2_000) }));
    expect(closing[closing.length - 1].color).toBe(C.stormReadout);
    // ...and nothing but the ring segment is ever the pulsed one.
    expect(segs.filter((s) => s.pulsed)).toHaveLength(1);
  });
});

// --- the amber pulse -----------------------------------------------------------

describe('RING_PULSE_HZ — exactly 1 Hz, under the ONE shared ceiling', () => {
  it('shares ONE ceiling with the HP rail and the storm vignette (no second literal)', () => {
    expect(RING_PULSE_HZ).toBe(Math.min(1, CAP_HZ));
    expect(RING_PULSE_HZ).toBe(1); // the ratified rate at today's 1.1 Hz cap
    expect(RING_PULSE_HZ).toBeLessThanOrEqual(CAP_HZ);
  });

  it('a full second of phase is exactly one breath', () => {
    // Half a cycle is the trough; two halves come back around to the crest.
    const half = advanceRingPhase(0, true, 0.5 / RING_PULSE_HZ, RING_PULSE_AMP);
    expect(half).toBeCloseTo(Math.PI, 9);
    expect(advanceRingPhase(half, true, 0.5 / RING_PULSE_HZ, RING_PULSE_AMP)).toBeCloseTo(0, 9); // wrapped
  });
});

describe('advanceRingPhase — the integrated, phase-gated breath', () => {
  it('HOLDS AT ZERO while the urgency window is shut, so onset starts LIT', () => {
    expect(advanceRingPhase(2.2, false, 0.016, RING_PULSE_AMP)).toBe(0);
    expect(ringSegmentAlpha(0, RING_PULSE_AMP)).toBe(RING_LIT_ALPHA);
  });

  it('HOLDS AT ZERO at motion=off too, so re-enabling motion never snaps mid-breath', () => {
    // Review fix 3: the integrator is gated on the EFFECTIVE amplitude as well
    // as the window. Integrating through a motion=off stretch would park the
    // phase at an arbitrary angle, and the frame motion came back would apply
    // full amplitude there — a one-frame drop from lit.
    const off = motionScaled(RING_PULSE_AMP, 'off');
    let p = 0;
    for (let i = 0; i < 60; i++) p = advanceRingPhase(p, true, 0.016, off);
    expect(p).toBe(0);
    // ...and the first breathing frame after the toggle starts from the LIT
    // keyframe, exactly as a fresh urgency onset does.
    p = advanceRingPhase(p, true, 0.016, RING_PULSE_AMP);
    expect(ringSegmentAlpha(p, RING_PULSE_AMP)).toBeCloseTo(RING_LIT_ALPHA, 2);
  });

  it('clamps a wild frame gap (a backgrounded tab must not jump the wave)', () => {
    const huge = advanceRingPhase(0, true, 30, RING_PULSE_AMP);
    expect(huge).toBe(advanceRingPhase(0, true, 0.5, RING_PULSE_AMP));
    expect(advanceRingPhase(1, true, -5, RING_PULSE_AMP)).toBe(1); // negative dt advances nothing
    expect(advanceRingPhase(1, true, Number.NaN, RING_PULSE_AMP)).toBe(1);
  });

  it('stays wrapped into [0, 2π) over a long window', () => {
    let p = 0;
    for (let i = 0; i < 1000; i++) p = advanceRingPhase(p, true, 0.05, RING_PULSE_AMP);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(Math.PI * 2);
  });
});

describe('barVisible — the bar needs a live timeline AND a real anchor', () => {
  it('is hidden through the whole pre-live ready room (idle timeline)', () => {
    expect(barVisible('idle', 0)).toBe(false);
    expect(barVisible('idle', 1_700_000_000_000)).toBe(false);
  });

  it('is hidden while a non-idle state still carries the 0 anchor sentinel', () => {
    // The schema's `zoneStartT` is 0 until the server anchors the timeline; a
    // bar drawn against it would print `now − 0` as the match clock.
    for (const state of ['clear', 'supply', 'reveal', 'closing', 'closed'] as const) {
      expect(barVisible(state, 0)).toBe(false);
    }
    expect(barVisible('clear', -5)).toBe(false);
    expect(barVisible('clear', Number.NaN)).toBe(false);
  });

  it('shows the moment a live state arrives with a real anchor', () => {
    for (const state of ['clear', 'supply', 'reveal', 'closing', 'closed'] as const) {
      expect(barVisible(state, 1_700_000_000_000)).toBe(true);
    }
    expect(barVisible('clear', 1)).toBe(true);
  });
});

describe('ringSegmentAlpha — opacity breathing, information-first', () => {
  it('breathes between the LIT keyframe and the configured floor', () => {
    expect(ringSegmentAlpha(0, RING_PULSE_AMP)).toBeCloseTo(RING_LIT_ALPHA, 9);
    expect(ringSegmentAlpha(Math.PI, RING_PULSE_AMP)).toBeCloseTo(CB.pulseFloorAlpha, 9);
    expect(ringSegmentAlpha(Math.PI / 2, RING_PULSE_AMP)).toBeGreaterThan(CB.pulseFloorAlpha);
    expect(ringSegmentAlpha(Math.PI / 2, RING_PULSE_AMP)).toBeLessThan(RING_LIT_ALPHA);
  });

  it('never dips below the floor at ANY phase (the text is always readable)', () => {
    for (let i = 0; i <= 64; i++) {
      const a = ringSegmentAlpha((i / 64) * Math.PI * 2, RING_PULSE_AMP);
      expect(a).toBeGreaterThanOrEqual(CB.pulseFloorAlpha - 1e-9);
      expect(a).toBeLessThanOrEqual(RING_LIT_ALPHA + 1e-9);
    }
  });

  it('motion=off is STATIC AMBER at the lit keyframe — the information survives', () => {
    const amp = motionScaled(RING_PULSE_AMP, 'off');
    expect(amp).toBe(0);
    for (const phase of [0, 1, Math.PI, 4.2]) {
      expect(ringSegmentAlpha(phase, amp)).toBe(RING_LIT_ALPHA);
    }
    // reduced halves the SWING, and still never touches the color or the copy.
    const half = motionScaled(RING_PULSE_AMP, 'reduced');
    expect(ringSegmentAlpha(Math.PI, half)).toBeCloseTo(RING_LIT_ALPHA - RING_PULSE_AMP / 2, 9);
  });

  it('the Tier-1 HOLD pins the segment at the lit keyframe (Tier-2 yields the eye)', () => {
    expect(ringSegmentAlpha(Math.PI, RING_PULSE_AMP, 1)).toBeCloseTo(RING_LIT_ALPHA, 9);
    // ...and a PARTIAL (eased) hold sits between breathing and lit, never outside.
    const breathing = ringSegmentAlpha(Math.PI, RING_PULSE_AMP, 0);
    const half = ringSegmentAlpha(Math.PI, RING_PULSE_AMP, 0.5);
    expect(half).toBeGreaterThan(breathing);
    expect(half).toBeLessThan(RING_LIT_ALPHA);
    // A degenerate blend can never push the alpha out of range.
    expect(ringSegmentAlpha(Math.PI, RING_PULSE_AMP, Number.NaN)).toBeCloseTo(breathing, 9);
    expect(ringSegmentAlpha(Math.PI, RING_PULSE_AMP, 9)).toBeCloseTo(RING_LIT_ALPHA, 9);
  });

  it('at motion=off the hold is a literal no-op (no hidden motion exception)', () => {
    const amp = motionScaled(RING_PULSE_AMP, 'off');
    expect(ringSegmentAlpha(Math.PI, amp, 0)).toBe(ringSegmentAlpha(Math.PI, amp, 1));
  });
});

// --- layout + the container-fit law --------------------------------------------

describe('chromeBarLayout — one contiguous row, centered', () => {
  it('centers the row on screenW/2 and lays the segments out left to right', () => {
    const segs = chromeBarSegments(view());
    const at = chromeBarLayout(segs, 1366);
    expect(at.xs).toHaveLength(segs.length);
    expect(at.xs[0]).toBeCloseTo(1366 / 2 - at.width / 2, 9);
    for (let i = 1; i < at.xs.length; i++) expect(at.xs[i]).toBeGreaterThan(at.xs[i - 1]);
    // The last segment ends exactly at the row's right edge — no drift.
    const last = at.xs[at.xs.length - 1] + monoTextWidth(segs[segs.length - 1].text, CB.fontSize, CB.letterSpacing);
    expect(last).toBeCloseTo(at.xs[0] + at.width, 6);
  });

  it('re-centers with the viewport and never starts off the left edge', () => {
    const segs = chromeBarSegments(view());
    expect(chromeBarLayout(segs, 1920).xs[0]).toBeGreaterThan(chromeBarLayout(segs, 1366).xs[0]);
    expect(chromeBarLayout(segs, 100).xs[0]).toBe(0); // absurd viewport: clamped, not negative
  });

  it('sits in the retired zoneLine slot — the HUD\'s one edge margin', () => {
    expect(CB.y).toBe(CLIENT_CONFIG.vitals.margin);
  });
});

describe('the bar fits its container (amendment 47 — the container-fit law)', () => {
  // The row is top-center chrome with nothing beside it, so its container is the
  // LOGICAL viewport: 1366 at the supported floor, and 1280 at the ≥1600px-gated
  // 125% UI-scale tier (1600 / 1.25) — the narrowest logical width shipped.
  const NARROWEST_LOGICAL = 1280;

  it('the worst-case row fits the narrowest logical viewport', () => {
    const worst = view({
      afloat: 99,
      kills: 99,
      matchMs: 99 * 60_000 + 59_000, // T+99:59
      ring: ringReadout('clear', 99 * 60_000 + 59_000), // RING CLOSES IN 99:59
    });
    const w = chromeBarLayout(chromeBarSegments(worst), NARROWEST_LOGICAL).width;
    expect(w, `${row(worst)} @ ${w}px`).toBeLessThanOrEqual(NARROWEST_LOGICAL);
  });

  it('every reachable ring register fits, at a full 20-hull field', () => {
    for (const state of ['clear', 'supply', 'reveal', 'closing', 'closed'] as const) {
      for (const ms of [0, 9_400, 47_000, 154_000, 240_000]) {
        const v = view({ afloat: 20, kills: 19, matchMs: 720_000, ring: ringReadout(state, ms) });
        const w = chromeBarLayout(chromeBarSegments(v), NARROWEST_LOGICAL).width;
        expect(w, `${row(v)} @ ${w}px`).toBeLessThanOrEqual(NARROWEST_LOGICAL);
      }
    }
  });
});
