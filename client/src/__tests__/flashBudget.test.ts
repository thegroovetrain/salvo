// THE AGGREGATE FLASH BUDGET (Story 4.8, amendment 240) — the mechanism behind
// the ratified floor "no element or screen region flashes more than 3x/s
// regardless of how many compliant events stack". These tests pin the two
// stages (coalesce, then degrade), the never-delete guarantee, and the two
// properties that quietly break it: a degraded flash must not consume budget,
// and the window must slide BY TIMESTAMP so a tab restore cannot burst-degrade.

import { describe, it, expect } from 'vitest';
import { createFlashBudget, regionKey, FLASH_ELEMENTS, hotbarSlotKey } from '../render/flashBudget.js';
import { CLIENT_CONFIG } from '../config.js';

const FB = CLIENT_CONFIG.flashBudget;
const KEY = 'r0:0';

describe('claim — the per-key sliding window', () => {
  it('animates everything under the threshold', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) {
      expect(b.claim(KEY, 1_000 + i * 10)).toBe('animate');
    }
  });

  it('degrades the onset past the threshold, in the same window', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 1_000 + i * 10);
    expect(b.claim(KEY, 1_040)).toBe('degrade');
    expect(b.claim(KEY, 1_050)).toBe('degrade');
  });

  it('a DEGRADED onset consumes no budget — it did not flash', () => {
    // The trap: charging a refused flash would hold the window permanently full
    // under a heavy stack and starve every animation that followed it. Here, 20
    // refused onsets at t=1000 leave the window holding exactly the 3 that were
    // granted, so the window frees up on schedule rather than on the last click.
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 1_000);
    for (let i = 0; i < 20; i++) expect(b.claim(KEY, 1_000)).toBe('degrade');
    expect(b.claim(KEY, 1_000 + FB.windowMs)).toBe('animate');
  });

  it('the window slides by TIMESTAMP — a clock gap restores full budget', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 1_000);
    expect(b.claim(KEY, 1_000)).toBe('degrade');
    // A backgrounded tab restoring 5 minutes later: every stale onset expires,
    // so the first flashes back are animated rather than burst-degraded.
    const later = 1_000 + 300_000;
    for (let i = 0; i < FB.maxPerSecond; i++) expect(b.claim(KEY, later + i)).toBe('animate');
    expect(b.claim(KEY, later + 10)).toBe('degrade');
  });

  it('expires onsets one at a time as the window rolls forward', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 1_000 + i * 100);
    expect(b.claim(KEY, 1_300)).toBe('degrade');
    // The first onset (t=1000) leaves the window at t=2000; one slot frees up.
    expect(b.claim(KEY, 2_000)).toBe('animate');
    expect(b.claim(KEY, 2_001)).toBe('degrade');
  });

  it('a FUTURE-stamped onset never survives the window (and a same-instant one still counts)', () => {
    // `nowMs - t < windowMs` is true for ANY t > nowMs — a negative difference is
    // always under the window — so an onset stamped ahead of the clock would be
    // retained FOREVER, degrading that key permanently and defeating the sweep's
    // key cleanup. Reachable through any backward clock movement (and, before the
    // foghorn's clock fix, through a second clock domain claiming on the same
    // budget). The window's predicate is "in the PAST and inside the window", and
    // it fails SAFE — an onset that cannot be trusted is dropped, i.e. toward
    // 'animate'.
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 10_000); // stamped far ahead
    expect(b.claim(KEY, 1_000)).toBe('animate'); // the real now is not held hostage
    expect(b.claim(KEY, 1_001)).toBe('animate');
    // ...and the correction must not overshoot: a same-frame claim (difference 0)
    // is IN the window, so three of them still fill it.
    const c = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) expect(c.claim(KEY, 1_000)).toBe('animate');
    expect(c.claim(KEY, 1_000)).toBe('degrade');
  });

  it('keys are independent — one busy region never gags another', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond + 5; i++) b.claim('r0:0', 1_000);
    expect(b.claim('r0:0', 1_000)).toBe('degrade');
    expect(b.claim('r3:2', 1_000)).toBe('animate');
    expect(b.claim(FLASH_ELEMENTS.deniedArc, 1_000)).toBe('animate');
    expect(b.claim(hotbarSlotKey(1), 1_000)).toBe('animate');
  });

  it('survives a long stack without unbounded growth (the sweep)', () => {
    // 5000 claims across 500 keys with a rolling clock: purely a "does not throw
    // / does not stall" pin on the amortized sweep path.
    const b = createFlashBudget();
    for (let i = 0; i < 5_000; i++) b.claim(`k${i % 500}`, i * 10);
    expect(b.claim('k0', 60_000)).toBe('animate');
  });

  it('reset clears the whole window', () => {
    const b = createFlashBudget();
    for (let i = 0; i < FB.maxPerSecond; i++) b.claim(KEY, 1_000);
    expect(b.claim(KEY, 1_000)).toBe('degrade');
    b.reset();
    expect(b.claim(KEY, 1_000)).toBe('animate');
  });
});

describe('coalesce — one frame, one cue (amendment 37 extended to visuals)', () => {
  it('collapses the same kind at the same point in one frame', () => {
    const b = createFlashBudget();
    expect(b.coalesce('spark', 100, 200, 7)).toBe(true);
    expect(b.coalesce('spark', 100, 200, 7)).toBe(false);
    expect(b.coalesce('spark', 100, 200, 7)).toBe(false);
  });

  it('does not collapse across frames — a repeated mark is a new fact', () => {
    const b = createFlashBudget();
    expect(b.coalesce('spark', 100, 200, 7)).toBe(true);
    expect(b.coalesce('spark', 100, 200, 8)).toBe(true);
  });

  it('does not collapse a different position or a different kind', () => {
    const b = createFlashBudget();
    expect(b.coalesce('spark', 100, 200, 7)).toBe(true);
    expect(b.coalesce('spark', 140, 200, 7)).toBe(true);
    expect(b.coalesce('spark', 100, 260, 7)).toBe(true);
    expect(b.coalesce('muzzle', 100, 200, 7)).toBe(true);
  });

  it('quantizes at the gunneryFeed convention — sub-quantum jitter is one mark', () => {
    const b = createFlashBudget();
    expect(b.coalesce('spark', 100, 200, 1)).toBe(true);
    expect(b.coalesce('spark', 100 + FB.coalesceQuantumU / 4, 200, 1)).toBe(false);
    expect(b.coalesce('spark', 100 + FB.coalesceQuantumU, 200, 1)).toBe(true);
  });

  it('reset drops the frame memory too', () => {
    const b = createFlashBudget();
    expect(b.coalesce('spark', 1, 2, 3)).toBe(true);
    b.reset();
    expect(b.coalesce('spark', 1, 2, 3)).toBe(true);
  });
});

describe('regionKey — a stable fraction of the screen at any resolution', () => {
  it('gives the same key for the same fractional position on any viewport', () => {
    const laptop = regionKey(1366 * 0.3, 768 * 0.7, 1366, 768);
    const uhd = regionKey(3840 * 0.3, 2160 * 0.7, 3840, 2160);
    expect(laptop).toBe(uhd);
  });

  it('partitions the viewport into exactly regionCols x regionRows cells', () => {
    const keys = new Set<string>();
    for (let c = 0; c < FB.regionCols; c++) {
      for (let r = 0; r < FB.regionRows; r++) {
        keys.add(regionKey(((c + 0.5) / FB.regionCols) * 800, ((r + 0.5) / FB.regionRows) * 600, 800, 600));
      }
    }
    expect(keys.size).toBe(FB.regionCols * FB.regionRows);
  });

  it('clamps out-of-viewport coordinates into the edge cells', () => {
    const w = 800;
    const h = 600;
    const topLeft = regionKey(0, 0, w, h);
    const bottomRight = regionKey(w - 1, h - 1, w, h);
    expect(regionKey(-9_999, -9_999, w, h)).toBe(topLeft);
    expect(regionKey(9_999, 9_999, w, h)).toBe(bottomRight);
    expect(regionKey(w, h, w, h)).toBe(bottomRight); // the exclusive far edge
    // ...and it never mints an unbounded key: a stack drifting off screen keeps
    // answering to the edge region's budget instead of escaping it.
    const off = new Set([
      regionKey(-1e6, 300, w, h),
      regionKey(-1e9, 300, w, h),
      regionKey(NaN, 300, w, h),
    ]);
    expect(off.size).toBeLessThanOrEqual(2);
  });

  it('degenerate viewports fall back to a single cell rather than throwing', () => {
    expect(regionKey(10, 10, 0, 0)).toBe('r0:0');
  });
});

describe('the budget never deletes', () => {
  it('degrade is a VERDICT, not a drop — every claimant gets an answer', () => {
    // The contract the render sites rely on: `claim` only ever says how to draw,
    // it never says "do not draw". 12 flashes in one region in one second are 3
    // animated ramps and 9 flat marks — all 12 still on screen at their true
    // positions (amendment 240: presence, position and weight survive).
    const b = createFlashBudget();
    const verdicts = Array.from({ length: 12 }, (_, i) => b.claim(KEY, 1_000 + i * 10));
    expect(verdicts.filter((v) => v === 'animate').length).toBe(FB.maxPerSecond);
    expect(verdicts.filter((v) => v === 'degrade').length).toBe(12 - FB.maxPerSecond);
    expect(verdicts.length).toBe(12);
  });

  it('a degraded mark still carries a real alpha (the motion:off keyframe)', () => {
    expect(FB.degradeAlphaFactor).toBeGreaterThan(0);
    expect(FB.degradeAlphaFactor).toBeLessThan(1);
  });
});
