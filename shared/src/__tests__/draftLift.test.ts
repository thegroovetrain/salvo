// Pins draftLift (Story 8.19, Eric rulings 2026-09-30, epic-8 amendments
// 151–155) — the wake-draft lift read off the ONE wake model (sim/wake.ts).
// The pure rows of the spec's I/O matrix: dead astern fresh, half-aged water,
// end of life, the lane edge at the wake-maker's own hull width (battleship
// 32, torpedo boat 9), crossing / opposed / oblique headings, two overlapping
// wakes (MAX, never a sum), own- and torpedo-water exclusion, leftover water,
// garbage inputs, and a seeded fuzz holding the result inside [0, lift]. THE
// STERN RULE (Eric 2026-09-30, amendment 159): the freshest `hullAheadU +
// riderHalfLenU` of arc length is not draftable — the rows below that pass
// rider half 0 on a hullAheadU-0 ribbon pin the unchanged pre-rule behaviour.

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  appendWakeSample,
  createWakeRibbon,
  draftLift,
  mulberry32,
  type DraftConfig,
  type WakeRibbon,
} from '../index.js';

const CFG: DraftConfig = CONFIG.wake.draft;
const LIFT = CFG.lift; // 0.05
const LIFE = 10000; // ms — a round test life (the ribbon carries its own)
const N = 11; // samples: x = 0, 12, …, 120

/**
 * A straight ribbon laid along +x at 12 u/s: sample i at (12 i, y) stamped
 * `t0 + 1000 i`, so the newest (x = 120) is stamped t0 + 10000.
 */
function straightRibbon(widthU: number, t0 = 0, y = 0, torp = false, hullAheadU = 0): WakeRibbon {
  const r = createWakeRibbon(60, LIFE, widthU, torp, hullAheadU);
  for (let i = 0; i < N; i++) appendWakeSample(r, 12 * i, y, t0 + 1000 * i);
  return r;
}

const NEWEST_T = 1000 * (N - 1); // 10000

describe('draftLift — the lift along the lane', () => {
  it('dead astern, fresh water, same heading: ≈ the full lift', () => {
    const r = straightRibbon(20);
    expect(draftLift([r], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    // A hair behind the newest sample: still ≈ the full lift.
    expect(draftLift([r], null, 118, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * (1 - 1000 * (2 / 12) / LIFE), 12);
  });

  it('half-aged water: lift / 2 (the age is interpolated at the projection)', () => {
    // (Wide ribbons read the same — see the newer-end-cap cases below.)
    const r = straightRibbon(9);
    // x = 60 was laid at t = 5000; at now = 10000 the water is half its life old.
    expect(draftLift([r], null, 60, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
    // Mid-segment (x = 62 → laid at 5000 + 2/12 s): interpolated, not
    // stepped per sample.
    expect(draftLift([r], null, 62, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * (0.5 + 2 / 120), 12);
  });

  it('end of life: water exactly lifeMs old gives 0; expired segments are not walked', () => {
    const r = straightRibbon(9);
    // x = 0 was laid at t = 0: exactly LIFE old at now = LIFE → ageFactor 0.
    expect(draftLift([r], null, 0, 0, 0, 0, LIFE, CFG)).toBe(0);
    // A hair earlier it is still (barely) water …
    expect(draftLift([r], null, 0, 0, 0, 0, LIFE - 0.5, CFG)).toBeGreaterThan(0);
    // … and a hair later the whole first segment is expired (not walked); the
    // next segment has no cap at its older end.
    expect(draftLift([r], null, 0, 0, 0, 0, LIFE + 0.5, CFG)).toBe(0);
    // All water older than life: 0 everywhere.
    for (const x of [0, 30, 60, 90, 120]) expect(draftLift([r], null, x, 0, 0, 0, NEWEST_T + LIFE + 1, CFG)).toBe(0);
  });
});

describe('draftLift — segments are capped at the NEWER end only (orchestrator ruling on reading f)', () => {
  it('a rider on the centre line reads the age of its OWN spot on wide ribbons (20 u and 32 u)', () => {
    // x = 60 was laid at t = 5000 → half its life old at now = 10000. The
    // fresher segment starting at x = 72 (12 u ahead, inside both lanes) has
    // no cap at its older end, so it cannot lend its fresher water.
    for (const w of [20, 32]) {
      const r = straightRibbon(w);
      expect(draftLift([r], null, 60, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
      expect(draftLift([r], null, 62, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * (0.5 + 2 / 120), 12);
    }
  });

  it('a point just BEHIND the oldest live sample gets 0 (no lane behind the tail)', () => {
    const r = straightRibbon(20);
    const now = NEWEST_T - 1000; // oldest sample (x = 0) is 9000 ms old — live
    expect(draftLift([r], null, 0, 0, 0, 0, now, CFG)).toBeCloseTo(LIFT * 0.1, 12);
    expect(draftLift([r], null, -0.001, 0, 0, 0, now, CFG)).toBe(0);
    expect(draftLift([r], null, -3, 0, 0, 0, now, CFG)).toBe(0);
    expect(draftLift([r], null, -3, 5, 0, 0, now, CFG)).toBe(0);
  });

  it('a point up to one half-width AHEAD of the newest sample reads the newest sample\'s age', () => {
    const r = straightRibbon(20);
    expect(draftLift([r], null, 139, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    expect(draftLift([r], null, 141, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
    // Later clock: the newest water is 2000 ms old → 0.8 × lift, ahead of it too.
    expect(draftLift([r], null, 135, 0, 0, 0, NEWEST_T + 2000, CFG)).toBeCloseTo(LIFT * 0.8, 12);
    expect(draftLift([r], null, 125, 10, 0, 0, NEWEST_T + 2000, CFG)).toBeCloseTo(LIFT * 0.8, 12);
  });

  it('a 90° turn: the OUTER wedge of the joint is lifted with the joint\'s age, heading against the OLDER segment', () => {
    // Along +x to the joint (60, 0) at t = 5000, then a left turn along +y.
    const r = createWakeRibbon(60, LIFE, 20);
    for (let i = 0; i <= 5; i++) appendWakeSample(r, 12 * i, 0, 1000 * i);
    for (let j = 1; j <= 5; j++) appendWakeSample(r, 60, 12 * j, 5000 + 1000 * j);
    const now = 7000; // joint water 2000 ms old → ageFactor 0.8
    // (65, -5) is past the older segment's newer end (u > 1 → the joint, 7.07 u
    // away) and behind the newer segment's older end (u < 0 → 0).
    expect(draftLift([r], null, 65, -5, 0, 0, now, CFG)).toBeCloseTo(LIFT * 0.8, 12);
    // headFactor is against the older segment (+x): sailing +y there gives 0 …
    expect(draftLift([r], null, 65, -5, Math.PI / 2, 0, now, CFG)).toBeCloseTo(0, 12);
    // … and 45° off it gives cos 45°.
    expect(draftLift([r], null, 65, -5, Math.PI / 4, 0, now, CFG)).toBeCloseTo(LIFT * 0.8 * Math.SQRT1_2, 12);
    // Outside the half-width from the joint: 0.
    expect(draftLift([r], null, 75, -15, 0, 0, now, CFG)).toBe(0);
  });
});

describe('draftLift — the lane is the wake-maker\'s own hull width', () => {
  it('battleship ribbon (widthU 32): 31 u off the line is lifted, 33 u is not', () => {
    const r = straightRibbon(32);
    expect(draftLift([r], null, 60, 31, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
    expect(draftLift([r], null, 60, -31, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
    expect(draftLift([r], null, 60, 33, 0, 0, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([r], null, 60, -33, 0, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('torpedo-boat ribbon (widthU 9): 8 u off the line is lifted, 10 u is not', () => {
    const r = straightRibbon(9);
    expect(draftLift([r], null, 60, 8, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
    expect(draftLift([r], null, 60, 10, 0, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('halfWidthBeams scales the lane', () => {
    const r = straightRibbon(9);
    // Lane 18 u: 15 u off is in; 19 u off is out.
    expect(draftLift([r], null, 60, 15, 0, 0, NEWEST_T, { lift: LIFT, halfWidthBeams: 2 })).toBeCloseTo(LIFT / 2, 12);
    expect(draftLift([r], null, 60, 19, 0, 0, NEWEST_T, { lift: LIFT, halfWidthBeams: 2 })).toBe(0);
  });
});

describe('draftLift — heading matters, never negative', () => {
  it('crossing (90°): 0', () => {
    const r = straightRibbon(20);
    // EXACTLY 0: cos(π/2) is ~6e-17 as a double, and the dust floor reports
    // that ~1e-18 "lift" as 0 so the server never stamps or sends it.
    expect(draftLift([r], null, 120, 0, Math.PI / 2, 0, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([r], null, 120, 0, -Math.PI / 2, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('opposed (180°): exactly 0, never negative', () => {
    const r = straightRibbon(20);
    expect(draftLift([r], null, 120, 0, Math.PI, 0, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([r], null, 60, 0, Math.PI * 0.75, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('oblique (60°): × 0.5', () => {
    const r = straightRibbon(20);
    expect(draftLift([r], null, 120, 0, Math.PI / 3, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * 0.5, 12);
    expect(draftLift([r], null, 120, 0, -Math.PI / 3, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * 0.5, 12);
  });
});

describe('draftLift — which water counts', () => {
  it('two overlapping wakes worth 0.04 and 0.03: the MAX (0.04), never the sum', () => {
    const a = straightRibbon(20, -2000); // newest laid 2000 ms before now → 0.8
    const b = straightRibbon(20, -4000); // newest laid 4000 ms before now → 0.6
    expect(draftLift([a], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(0.04, 12);
    expect(draftLift([b], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(0.03, 12);
    expect(draftLift([a, b], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(0.04, 12);
    expect(draftLift([b, a], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(0.04, 12);
  });

  it('the rider\'s OWN ribbon is excluded (by reference)', () => {
    const own = straightRibbon(20);
    expect(draftLift([own], own, 120, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
    // Another ribbon under the rider still counts beside the excluded own.
    const other = straightRibbon(20, -2000);
    expect(draftLift([own, other], own, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(0.04, 12);
  });

  it('torpedo water is excluded', () => {
    const torp = straightRibbon(20, 0, 0, true);
    expect(draftLift([torp], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('leftover water (an orphan / detached / wreck ribbon) lifts like any other', () => {
    // Water is water: a ribbon no longer attached to any source — including an
    // identical copy of the rider's own geometry held by another reference —
    // counts; only the reference passed as `own` is excluded.
    const own = straightRibbon(20);
    const orphan = straightRibbon(20);
    expect(draftLift([orphan], own, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    expect(draftLift([own, orphan], own, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
  });
});

describe('draftLift — THE STERN RULE: the freshest hullAheadU + riderHalfLenU of arc is not draftable (amendment 159)', () => {
  // straightRibbon: samples at x = 0, 12, …, 120 laid at t = 1000 × (x / 12),
  // so the water at x is (NEWEST_T − 1000 x / 12) ms old at now = NEWEST_T and
  // a centre-line rider at x reads ageFactor x / 120.
  it('an attached ribbon (hullAheadU 50) and a rider of half length 50: the lane head is 100 u back — fresher water gives 0, 101 u back is lifted', () => {
    const r = straightRibbon(9, 0, 0, false, 50);
    // Head at x = 20. A centre-line rider more than one half-width (9 u) past
    // the head, anywhere up to the newest sample, is inside the cut → 0.
    for (const x of [30, 40, 60, 80, 100, 110, 119, 120, 125]) {
      expect(draftLift([r], null, x, 0, 0, 50, NEWEST_T, CFG)).toBe(0);
    }
    // 101 u of arc back from the newest sample (x = 19): lifted, age at its own spot.
    expect(draftLift([r], null, 19, 0, 0, 50, NEWEST_T, CFG)).toBeCloseTo(LIFT * (19 / 120), 12);
    // Exactly at the head: the head's interpolated age.
    expect(draftLift([r], null, 20, 0, 0, 50, NEWEST_T, CFG)).toBeCloseTo(LIFT * (20 / 120), 12);
    // Without the cut the same fresh spot would be lifted (non-vacuity).
    expect(draftLift([r], null, 100, 0, 0, 0, NEWEST_T, CFG)).toBe(0); // hullAheadU 50 alone still cuts x > 79
    expect(draftLift([straightRibbon(9)], null, 100, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT * (100 / 120), 12);
  });

  it('the cap sits AT THE HEAD: a rider abeam of the head within the half-width is lifted at the head\'s age; abeam of a fresher point it is not', () => {
    const r = straightRibbon(9, 0, 0, false, 50); // head at x = 20 for a rider of half 50
    const headAge = LIFT * (20 / 120);
    expect(draftLift([r], null, 20, 8, 0, 50, NEWEST_T, CFG)).toBeCloseTo(headAge, 12);
    expect(draftLift([r], null, 20, -8, 0, 50, NEWEST_T, CFG)).toBeCloseTo(headAge, 12);
    expect(draftLift([r], null, 24, 0, 0, 50, NEWEST_T, CFG)).toBeCloseTo(headAge, 12); // 4 u ahead of the head, on the line
    expect(draftLift([r], null, 26, 5, 0, 50, NEWEST_T, CFG)).toBeCloseTo(headAge, 12); // √61 ≈ 7.8 u from the head
    // Abeam of a FRESHER point (x = 30 or 60): outside the head's round cap → 0.
    expect(draftLift([r], null, 30, 8, 0, 50, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([r], null, 60, 8, 0, 50, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([r], null, 30, 0, 0, 50, NEWEST_T, CFG)).toBe(0); // 10 u ahead of the head
  });

  it('a cut that spans several segments (hullAheadU 20 + rider half 10 = 30 u → the head at x = 90, mid-segment)', () => {
    const r = straightRibbon(9, 0, 0, false, 20);
    expect(draftLift([r], null, 89, 0, 0, 10, NEWEST_T, CFG)).toBeCloseTo(LIFT * (89 / 120), 12);
    expect(draftLift([r], null, 90, 0, 0, 10, NEWEST_T, CFG)).toBeCloseTo(LIFT * (90 / 120), 12);
    expect(draftLift([r], null, 91, 0, 0, 10, NEWEST_T, CFG)).toBeCloseTo(LIFT * (90 / 120), 12); // the head's cap
    expect(draftLift([r], null, 100, 0, 0, 10, NEWEST_T, CFG)).toBe(0); // 10 u past the head
    expect(draftLift([r], null, 110, 0, 0, 10, NEWEST_T, CFG)).toBe(0);
    // The cut is the SUM: the same head from hullAheadU 0 + rider half 30.
    const orphan = straightRibbon(9);
    expect(draftLift([orphan], null, 90, 0, 0, 30, NEWEST_T, CFG)).toBeCloseTo(LIFT * (90 / 120), 12);
    expect(draftLift([orphan], null, 100, 0, 0, 30, NEWEST_T, CFG)).toBe(0);
    // ...and it walks ARC LENGTH around a turn: +x to (60, 0), then +y to (60, 60).
    const bent = createWakeRibbon(60, LIFE, 9, false, 50);
    for (let i = 0; i <= 5; i++) appendWakeSample(bent, 12 * i, 0, 1000 * i);
    for (let j = 1; j <= 5; j++) appendWakeSample(bent, 60, 12 * j, 5000 + 1000 * j);
    // cut 60 + 10 = 70: 60 u up the +y leg, then 10 u back along +x → head (50, 0).
    expect(draftLift([bent], null, 50, 0, 0, 10, NEWEST_T, CFG)).toBeCloseTo(LIFT * (1 - (NEWEST_T - 5000 * (50 / 60)) / LIFE), 12);
    expect(draftLift([bent], null, 60, 30, Math.PI / 2, 10, NEWEST_T, CFG)).toBe(0); // on the cut +y leg
  });

  it('a cut longer than the whole ribbon → 0 everywhere', () => {
    const r = straightRibbon(20, 0, 0, false, 100);
    for (const x of [-5, 0, 10, 30, 60, 90, 120, 130]) {
      expect(draftLift([r], null, x, 0, 0, 21, NEWEST_T, CFG)).toBe(0);
      expect(draftLift([r], null, x, 0, 0, Number.MAX_VALUE, NEWEST_T, CFG)).toBe(0);
    }
  });

  it('an ORPHAN (hullAheadU 0) is cut only by the rider\'s own half length', () => {
    const r = straightRibbon(9); // detached water: no hull ahead of it
    expect(r.hullAheadU).toBe(0);
    expect(draftLift([r], null, 69, 0, 0, 50, NEWEST_T, CFG)).toBeCloseTo(LIFT * (69 / 120), 12);
    expect(draftLift([r], null, 70, 0, 0, 50, NEWEST_T, CFG)).toBeCloseTo(LIFT * (70 / 120), 12);
    expect(draftLift([r], null, 80, 0, 0, 50, NEWEST_T, CFG)).toBe(0); // 10 u past the head
    expect(draftLift([r], null, 120, 0, 0, 50, NEWEST_T, CFG)).toBe(0);
  });

  it('rider half 0 on a hullAheadU-0 ribbon reproduces the pre-rule lane (the newest sample\'s round cap)', () => {
    const r = straightRibbon(20);
    expect(draftLift([r], null, 139, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    expect(draftLift([r], null, 141, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
  });

  it('a non-finite or negative rider half length (or a corrupted hullAheadU) is treated as 0', () => {
    const r = straightRibbon(20);
    for (const bad of [NaN, Infinity, -Infinity, -50]) {
      expect(draftLift([r], null, 120, 0, 0, bad, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    }
    r.hullAheadU = NaN;
    expect(draftLift([r], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
    r.hullAheadU = -40;
    expect(draftLift([r], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT, 12);
  });
});

describe('draftLift — garbage degrades to 0, never throws', () => {
  it('non-finite x / y / heading / now → 0', () => {
    const r = straightRibbon(20);
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(draftLift([r], null, bad, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
      expect(draftLift([r], null, 120, bad, 0, 0, NEWEST_T, CFG)).toBe(0);
      expect(draftLift([r], null, 120, 0, bad, 0, NEWEST_T, CFG)).toBe(0);
      expect(draftLift([r], null, 120, 0, 0, 0, bad, CFG)).toBe(0);
    }
  });

  it('non-finite or non-positive dials → 0', () => {
    const r = straightRibbon(20);
    for (const bad of [NaN, Infinity, 0, -1]) {
      expect(draftLift([r], null, 120, 0, 0, 0, NEWEST_T, { lift: bad, halfWidthBeams: 1 })).toBe(0);
      expect(draftLift([r], null, 120, 0, 0, 0, NEWEST_T, { lift: LIFT, halfWidthBeams: bad })).toBe(0);
    }
  });

  it('a NaN stored sample is skipped and the ribbon closes across it', () => {
    const r = straightRibbon(9);
    // Corrupt sample 5 (x = 60, t = 5000) in place.
    const i5 = (r.head + 5) % r.cap;
    r.xs[i5] = NaN;
    // x = 60 still lies on the closed-across segment 48 → 72 (age 5000 there).
    expect(() => draftLift([r], null, 60, 0, 0, 0, NEWEST_T, CFG)).not.toThrow();
    expect(draftLift([r], null, 60, 0, 0, 0, NEWEST_T, CFG)).toBeCloseTo(LIFT / 2, 12);
    r.ts[(r.head + 6) % r.cap] = NaN;
    expect(Number.isFinite(draftLift([r], null, 60, 0, 0, 0, NEWEST_T, CFG))).toBe(true);
  });

  it('count < 2, a zero-length segment, lifeMs ≤ 0 or widthU ≤ 0 → 0', () => {
    const one = createWakeRibbon(60, LIFE, 20);
    expect(draftLift([one], null, 0, 0, 0, 0, 0, CFG)).toBe(0);
    appendWakeSample(one, 0, 0, 0);
    expect(draftLift([one], null, 0, 0, 0, 0, 0, CFG)).toBe(0);

    // A degenerate (zero-length) segment forced into the store.
    const deg = createWakeRibbon(60, LIFE, 20);
    appendWakeSample(deg, 5, 5, 0);
    const slot = (deg.head + 1) % deg.cap;
    deg.xs[slot] = 5;
    deg.ys[slot] = 5;
    deg.ts[slot] = 100;
    deg.count = 2;
    expect(draftLift([deg], null, 5, 5, 0, 0, 100, CFG)).toBe(0);

    const noLife = straightRibbon(20);
    noLife.lifeMs = 0;
    expect(draftLift([noLife], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
    const noWidth = straightRibbon(20);
    noWidth.widthU = 0;
    expect(draftLift([noWidth], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
    expect(draftLift([], null, 120, 0, 0, 0, NEWEST_T, CFG)).toBe(0);
  });
});

describe('draftLift — always inside [0, cfg.lift] (seeded fuzz)', () => {
  it('holds for random ribbons, riders, headings and clocks', () => {
    const rng = mulberry32(0x8190);
    const rand = (lo: number, hi: number): number => lo + (hi - lo) * rng.next();
    for (let trial = 0; trial < 300; trial++) {
      const ribbons: WakeRibbon[] = [];
      const nRibbons = 1 + Math.floor(rng.next() * 4);
      for (let k = 0; k < nRibbons; k++) {
        const r = createWakeRibbon(rand(10, 80), rand(1000, 12000), rand(0, 40), rng.next() < 0.2, rand(-10, 70));
        let x = rand(-200, 200);
        let y = rand(-200, 200);
        let h = rand(-Math.PI, Math.PI);
        let t = rand(0, 5000);
        const samples = Math.floor(rng.next() * 40);
        for (let s = 0; s < samples; s++) {
          h += rand(-0.5, 0.5);
          x += Math.cos(h) * rand(0, 30);
          y += Math.sin(h) * rand(0, 30);
          t += rand(0, 800);
          appendWakeSample(r, x, y, t);
        }
        ribbons.push(r);
      }
      const own = rng.next() < 0.3 ? ribbons[0] : null;
      for (let p = 0; p < 20; p++) {
        const v = draftLift(ribbons, own, rand(-300, 300), rand(-300, 300), rand(-10, 10), rand(-10, 70), rand(0, 40000), CFG);
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(LIFT);
      }
    }
  });
});
