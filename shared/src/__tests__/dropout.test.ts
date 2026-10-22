import { describe, it, expect } from 'vitest';
import { CONFIG, dropoutPaintP, dropoutPaints, dropoutRoll, type DropoutCurve } from '../index.js';

// THE RADAR DROPOUT (Story 9.8, Eric 2026-10-13, epic-9 amendment 104 and
// rulings 121–123): beyond the 8/12 rung a sweep increasingly FAILS TO PAINT a
// return — p(paint) 1 to 8/12, 0.9 at 10/12, 0.1 at the 12/12 rim, flat then a
// cliff, each sweep revolution its own stateless roll, no size weighting.
//
// Every distance below is a multiple of the ruler's rung (`radar / 12`) and
// every probability is read from CONFIG.vision.dropout — never the literal
// 1,000 / 1,250 / 1,500 (epic-9 amendment 8). At the shipped ladder the matrix
// rows read: 900 u → 1, 1,000 u → 1, 1,125 u → ≈0.95, 1,250 u → 0.9,
// 1,375 u → ≈0.5, 1,500 u → 0.1.

const RADAR = CONFIG.vision.radar;
const RUNG = RADAR / 12;
const D = CONFIG.vision.dropout;

describe('the dropout dials sit on the twelfths ruler (ruling 121)', () => {
  it('starts at 8/12, knees at 10/12, and the probabilities are a flat-then-cliff shape', () => {
    expect(D.startU).toBe(RUNG * 8);
    expect(D.kneeU).toBe(RUNG * 10);
    expect(D.kneeP).toBeGreaterThan(D.rimP);
    expect(D.kneeP).toBeLessThanOrEqual(1);
    expect(D.rimP).toBeGreaterThanOrEqual(0);
  });
});

describe('dropoutPaintP — the curve (matrix rows)', () => {
  it('p is 1 inside the flat band (7.2/12 and exactly 8/12)', () => {
    expect(dropoutPaintP(RUNG * 7.2)).toBe(1);
    expect(dropoutPaintP(D.startU)).toBe(1);
    expect(dropoutPaintP(0)).toBe(1);
  });

  it('p is 1 − (1 − kneeP)/2 halfway to the knee (9/12) — S(½) = ½', () => {
    expect(dropoutPaintP(RUNG * 9)).toBeCloseTo(1 - (1 - D.kneeP) / 2, 12);
  });

  it('p is kneeP at the knee (10/12)', () => {
    expect(dropoutPaintP(D.kneeU)).toBeCloseTo(D.kneeP, 12);
  });

  it('p is halfway from kneeP to rimP at 11/12, and rimP at the rim (12/12)', () => {
    expect(dropoutPaintP(RUNG * 11)).toBeCloseTo((D.kneeP + D.rimP) / 2, 12);
    expect(dropoutPaintP(RADAR)).toBeCloseTo(D.rimP, 12);
  });

  it('p holds at rimP beyond the rim (callers exclude d > radar; the curve never goes negative)', () => {
    expect(dropoutPaintP(RADAR * 1.2)).toBeCloseTo(D.rimP, 12);
  });

  it('is monotone non-increasing and CONTINUOUS over a fine sweep of the whole band', () => {
    let prev = dropoutPaintP(0);
    const step = RUNG / 50;
    for (let d = step; d <= RADAR; d += step) {
      const p = dropoutPaintP(d);
      expect(p, `d=${d}`).toBeLessThanOrEqual(prev + 1e-12);
      // Continuity: a step of RUNG/50 can never move p by more than the
      // steepest smoothstep slope allows (1.5 × Δp per span × step / span).
      expect(prev - p, `d=${d}`).toBeLessThan(0.05);
      expect(p, `d=${d}`).toBeGreaterThanOrEqual(0);
      expect(p, `d=${d}`).toBeLessThanOrEqual(1);
      prev = p;
    }
    // Continuity at the two joins, from both sides.
    expect(dropoutPaintP(D.startU + 1e-6)).toBeCloseTo(1, 6);
    expect(dropoutPaintP(D.kneeU - 1e-6)).toBeCloseTo(dropoutPaintP(D.kneeU + 1e-6), 6);
  });

  it('a non-finite range never paints (p = 0)', () => {
    for (const d of [NaN, Infinity, -Infinity]) expect(dropoutPaintP(d), String(d)).toBe(0);
  });

  it('a DEGENERATE curve fails closed to a step at startU — never paints farther than the flat band', () => {
    const bad: DropoutCurve[] = [
      { ...D, kneeU: D.startU }, // collapsed knee
      { ...D, kneeU: D.startU - 1 }, // reversed band
      { ...D, kneeU: NaN },
      { ...D, kneeU: RADAR }, // radar ≤ knee
      { ...D, kneeP: 0.5, rimP: 0.9 }, // rim more reliable than the knee: not monotone
    ];
    for (const cfg of bad) {
      expect(dropoutPaintP(D.startU, cfg), JSON.stringify(cfg)).toBe(1);
      expect(dropoutPaintP(D.startU + 1, cfg), JSON.stringify(cfg)).toBe(0);
      expect(dropoutPaintP(RADAR, cfg), JSON.stringify(cfg)).toBe(0);
    }
    // A radar range at or inside the knee is degenerate the same way.
    expect(dropoutPaintP(RUNG * 11, D, D.kneeU)).toBe(0);
  });

  it('a non-finite probability dial reads 0 beyond the flat band (fail closed)', () => {
    expect(dropoutPaintP(RUNG * 11, { ...D, rimP: NaN })).toBe(0);
    expect(dropoutPaintP(RUNG * 9, { ...D, kneeP: NaN })).toBe(0);
    expect(dropoutPaintP(RUNG * 7, { ...D, kneeP: NaN })).toBe(1);
  });
});

describe('dropoutRoll — the stateless per-revolution roll', () => {
  it('is a float in [0, 1)', () => {
    for (let rev = 0; rev < 500; rev++) {
      const r = dropoutRoll(12345, 'obs', 'tgt', rev);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('is DETERMINISTIC: the same inputs give the identical float on every call (1000 calls)', () => {
    const first = dropoutRoll(987654321, 'sessionA', 'sessionB', 41);
    for (let i = 0; i < 1000; i++) expect(dropoutRoll(987654321, 'sessionA', 'sessionB', 41)).toBe(first);
    expect(dropoutPaints(RUNG * 11.2, 987654321, 'sessionA', 'sessionB', 41)).toBe(
      first < dropoutPaintP(RUNG * 11.2),
    );
  });

  it('over 400 revolutions at 11.2/12 the paint share is p ± 0.1, and it is NOT all-or-nothing', () => {
    const d = RUNG * 11.2; // 1,400 u at the shipped ladder
    const p = dropoutPaintP(d);
    let painted = 0;
    for (let rev = 0; rev < 400; rev++) if (dropoutPaints(d, 7, 'obs', 'tgt', rev)) painted++;
    expect(Math.abs(painted / 400 - p)).toBeLessThan(0.1);
    expect(painted).toBeGreaterThan(0);
    expect(painted).toBeLessThan(400);
  });

  it('inside the flat band every revolution paints (7.2/12, 400 revolutions)', () => {
    for (let rev = 0; rev < 400; rev++) expect(dropoutPaints(RUNG * 7.2, 7, 'obs', 'tgt', rev)).toBe(true);
  });

  it('a non-finite range never paints on any revolution', () => {
    for (let rev = 0; rev < 100; rev++) expect(dropoutPaints(NaN, 7, 'obs', 'tgt', rev)).toBe(false);
  });

  /** Pearson correlation of two equal-length series. */
  const corr = (a: readonly number[], b: readonly number[]): number => {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return sab / Math.sqrt(saa * sbb);
  };
  const series = (seed: number, obs: string, tgt: string): number[] =>
    Array.from({ length: 400 }, (_, rev) => dropoutRoll(seed, obs, tgt, rev));

  it('different observer keys, target keys, seeds — and a swapped pair — DECORRELATE', () => {
    const base = series(7, 'alpha', 'bravo');
    const others = [
      series(7, 'charlie', 'bravo'), // another observer of the same target
      series(7, 'alpha', 'delta'), // the same observer, another target
      series(8, 'alpha', 'bravo'), // another world seed
      series(7, 'bravo', 'alpha'), // the pair swapped
    ];
    for (const o of others) {
      expect(Math.abs(corr(base, o))).toBeLessThan(0.15);
      expect(o).not.toEqual(base);
    }
  });

  it('successive revolutions decorrelate (rev k vs k + 1)', () => {
    const s = series(7, 'alpha', 'bravo');
    expect(Math.abs(corr(s.slice(0, -1), s.slice(1)))).toBeLessThan(0.15);
  });

  it('a malformed seed or revolution still yields a deterministic draw (uint32 coercion)', () => {
    expect(dropoutRoll(NaN, 'a', 'b', NaN)).toBe(dropoutRoll(0, 'a', 'b', 0));
    expect(dropoutRoll(-1, 'a', 'b', 3)).toBe(dropoutRoll(0xffffffff, 'a', 'b', 3));
  });
});
