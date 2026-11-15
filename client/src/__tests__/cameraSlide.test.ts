import { describe, it, expect } from 'vitest';
import {
  anchorGlideT,
  anchorWeight,
  boardGlideT,
  clampToDisc,
  slideAnchor,
  slideCenter,
  type SlideFrame,
} from '../render/cameraSlide.js';

// Story 11.8 (Eric 2026-11-15): the drawn centre C = slide(A, span) with
// R = the ring waypoint and h = R / 2 — A at and inside h, a glide A → ring
// centre from h to R, a glide ring centre → board centre (the origin) from R to
// the board span. The frames below are arbitrary shapes, not game numbers.

const R = 6000;
const B = 12000;
const RING = { x: 1500, y: -900 };
const F: SlideFrame = { ringSpanU: R, boardSpanU: B, ring: RING };
const A = { x: -2200, y: 3100 };

describe('slideCenter — the three legs, linear in span', () => {
  it('span ≤ h: the anchor itself', () => {
    for (const s of [100, R / 4, R / 2]) expect(slideCenter(A, s, F)).toEqual(A);
  });

  it('h → R: anchor → ring centre, linear', () => {
    for (const k of [0, 0.3, 0.5, 1]) {
      const c = slideCenter(A, R / 2 + k * (R / 2), F);
      expect(c.x).toBeCloseTo(A.x + k * (RING.x - A.x), 9);
      expect(c.y).toBeCloseTo(A.y + k * (RING.y - A.y), 9);
    }
  });

  it('R → board span: ring centre → board centre, linear; past the board span the board centre', () => {
    for (const k of [0, 0.25, 1]) {
      const c = slideCenter(A, R + k * (B - R), F);
      expect(c.x).toBeCloseTo(RING.x * (1 - k), 9);
      expect(c.y).toBeCloseTo(RING.y * (1 - k), 9);
    }
    const far = slideCenter(A, 5 * B, F);
    expect(far.x).toBeCloseTo(0, 12);
    expect(far.y).toBeCloseTo(0, 12);
  });

  it('is continuous across both joints', () => {
    for (const joint of [R / 2, R]) {
      const lo = slideCenter(A, joint - 1e-6, F);
      const hi = slideCenter(A, joint + 1e-6, F);
      expect(Math.hypot(lo.x - hi.x, lo.y - hi.y)).toBeLessThan(1e-3);
    }
  });

  it('no ring yet: the ring centre is the board centre', () => {
    const c = slideCenter(A, R, { ...F, ring: null });
    expect(c.x).toBeCloseTo(0, 12);
    expect(c.y).toBeCloseTo(0, 12);
  });

  it('degenerate frames collapse cleanly, never NaN', () => {
    const frames: SlideFrame[] = [
      { ringSpanU: B * 2, boardSpanU: B, ring: RING }, // R past the board
      { ringSpanU: B, boardSpanU: B, ring: RING }, // R at the board
      { ringSpanU: R, boardSpanU: NaN, ring: RING }, // no board yet
      { ringSpanU: R, boardSpanU: NaN, ring: null }, // nothing known: no slide
      { ringSpanU: NaN, boardSpanU: B, ring: RING },
      { ringSpanU: 0, boardSpanU: 0, ring: null },
    ];
    for (const f of frames) {
      for (const s of [0, 1, R / 2, R, B, 3 * B, NaN, Infinity]) {
        const c = slideCenter(A, s, f);
        expect(Number.isFinite(c.x) && Number.isFinite(c.y), `${JSON.stringify(f)} @ ${s}`).toBe(true);
      }
    }
    // With R at / past the board, full zoom-out is still the board centre.
    expect(slideCenter(A, B, frames[0])).toEqual({ x: 0, y: 0 });
    expect(slideCenter(A, B, frames[1])).toEqual({ x: 0, y: 0 });
    // With neither a ring nor a board known, nothing slides.
    expect(slideCenter(A, 10 * R, frames[3])).toEqual(A);
  });
});

describe('slideAnchor — the inverse (zoom-in toward the cursor)', () => {
  it('round-trips the anchor within 1e-6 u wherever t < 1', () => {
    const anchors = [A, { x: 0, y: 0 }, { x: 4000, y: -4000 }, { x: -1, y: 7 }];
    for (const a of anchors) {
      for (const s of [50, R / 2, R * 0.6, R * 0.8, R * 0.99]) {
        const back = slideAnchor(slideCenter(a, s, F), s, F);
        expect(back, `span ${s}`).not.toBeNull();
        expect(back!.x).toBeCloseTo(a.x, 6);
        expect(back!.y).toBeCloseTo(a.y, 6);
      }
    }
  });

  it('is null where the centre does not depend on the anchor (t = 1: the ring → board leg)', () => {
    for (const s of [R, (R + B) / 2, B]) expect(slideAnchor({ x: 1, y: 2 }, s, F)).toBeNull();
  });

  it('is the identity inside h', () => {
    expect(slideAnchor({ x: 9, y: -4 }, R / 3, F)).toEqual({ x: 9, y: -4 });
  });
});

describe('the glide fractions and the anchor weight (pan = Δ / weight)', () => {
  it('t and m stay in 0..1 and the weight is 1 − t', () => {
    for (const s of [0, R / 2, R * 0.75, R, (R + B) / 2, B, 2 * B]) {
      const t = anchorGlideT(s, F);
      const m = boardGlideT(s, F);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
      expect(anchorWeight(s, F)).toBeCloseTo(1 - t, 12);
    }
  });

  it('moving the anchor by Δ / weight moves the centre by exactly Δ', () => {
    const s = R * 0.7;
    const w = anchorWeight(s, F);
    const c0 = slideCenter(A, s, F);
    const c1 = slideCenter({ x: A.x + 100 / w, y: A.y - 40 / w }, s, F);
    expect(c1.x - c0.x).toBeCloseTo(100, 9);
    expect(c1.y - c0.y).toBeCloseTo(-40, 9);
  });
});

describe('clampToDisc — the anchor stays inside the board fit', () => {
  it('pulls an outside point onto the rim along its bearing; leaves an inside one', () => {
    const p = clampToDisc({ x: 300, y: 400 }, 250);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(250, 9);
    expect(p.x / p.y).toBeCloseTo(300 / 400, 9);
    expect(clampToDisc({ x: 10, y: 10 }, 250)).toEqual({ x: 10, y: 10 });
    expect(clampToDisc({ x: 1e9, y: 0 }, NaN)).toEqual({ x: 1e9, y: 0 });
  });
});
