// THE LEVEL STAT ROLL (Story 12.4, epic-12 amendment 5(b); sim/levelRoll.ts).
// Every expectation is written through CONFIG.xp.statRoll or a fixture dial —
// the mechanism follows the dials, whatever Eric sets them to; no face or
// stat list is pinned as a literal.
import { describe, it, expect } from 'vitest';
import { CONFIG, mulberry32, rollDie, rollLevelStats, type StatRollConfig } from '../index.js';

const ROLL = CONFIG.xp.statRoll;

/** A stub rng serving `values` in turn, counting its draws. */
function served(values: readonly number[]): { next(): number; calls: number } {
  const r = { calls: 0, next: () => values[r.calls++ % values.length] };
  return r;
}

describe('rollDie — one roll of the die', () => {
  it('each slice of [0, 1) maps to its face', () => {
    const faces = ROLL.faces;
    const n = faces.length;
    for (let i = 0; i < n; i++) {
      expect(rollDie(i / n, faces)).toBe(faces[i]);
      expect(rollDie((i + 0.999) / n, faces)).toBe(faces[i]);
    }
  });

  it('follows a custom face list', () => {
    const faces = [4, 9, 2];
    expect([0, 0.34, 0.67, 0.999].map((u) => rollDie(u, faces))).toEqual([4, 9, 2, 2]);
  });

  it('fails closed to 0 on a bad u (non-finite, negative, 1 or above)', () => {
    const faces = ROLL.faces.map((f) => f + 1); // every real face non-zero, so a 0 can only be the guard
    for (const u of [Number.NaN, Infinity, -Infinity, -0.01, 1, 1.5]) expect(rollDie(u, faces)).toBe(0);
  });

  it('fails closed to 0 on an empty list or a junk face (never NaN or a fraction)', () => {
    expect(rollDie(0.5, [])).toBe(0);
    for (const junk of [Number.NaN, Infinity, -1, 1.5]) expect(rollDie(0, [junk, 2])).toBe(0);
    expect(rollDie(0.75, [Number.NaN, 2])).toBe(2);
  });
});

describe('rollLevelStats — one level\'s roll', () => {
  it('spends exactly one next() per stat, in list order', () => {
    const n = ROLL.indices.length;
    const rng = served(Array.from({ length: n }, (_, i) => i / n));
    // face i of a custom die is i + 1, so stat i rolls i + 1 iff it got draw i
    const cfg: StatRollConfig = { faces: Array.from({ length: n }, (_, i) => i + 1), indices: ROLL.indices };
    expect(rollLevelStats(rng, cfg)).toEqual(ROLL.indices.map((id, i) => [id, i + 1]));
    expect(rng.calls).toBe(n);
  });

  it('returns only the non-zero pairs, in list order', () => {
    const cfg: StatRollConfig = { faces: [0, 5], indices: ROLL.indices };
    // alternate the low (0) and high (5) halves of the die
    const rng = served([0.1, 0.9]);
    const expected = ROLL.indices.flatMap((id, i) => (i % 2 === 1 ? [[id, 5]] : []));
    expect(rollLevelStats(rng, cfg)).toEqual(expected);
    expect(rng.calls).toBe(ROLL.indices.length);
  });

  it('follows a custom stat list', () => {
    const cfg: StatRollConfig = { faces: [3], indices: [ROLL.indices[1]] };
    const rng = served([0.4]);
    expect(rollLevelStats(rng, cfg)).toEqual([[ROLL.indices[1], 3]]);
    expect(rng.calls).toBe(1);
    expect(rollLevelStats(served([0.4]), { ...cfg, indices: [] })).toEqual([]);
  });

  it('a junk rng value counts 0 for that stat but is still spent', () => {
    const cfg: StatRollConfig = { faces: [2], indices: ROLL.indices };
    const rng = served([Number.NaN]);
    expect(rollLevelStats(rng, cfg)).toEqual([]);
    expect(rng.calls).toBe(ROLL.indices.length);
  });

  it('every face frequency matches its share of the CONFIG die, within a 5-sigma band', () => {
    const faces = ROLL.faces;
    const N = 20_000;
    const rng = mulberry32(0x12f4);
    const seen = new Map<number, number>();
    for (let level = 0; level < N; level++) {
      const got = new Map(rollLevelStats(rng));
      for (const id of ROLL.indices) {
        const face = got.get(id) ?? 0;
        seen.set(face, (seen.get(face) ?? 0) + 1);
      }
    }
    const total = N * ROLL.indices.length;
    for (const face of new Set(faces)) {
      const p = faces.filter((f) => f === face).length / faces.length;
      const tol = 5 * Math.sqrt((p * (1 - p)) / total);
      expect(Math.abs((seen.get(face) ?? 0) / total - p), `face ${face}`).toBeLessThanOrEqual(tol);
    }
    // nothing outside the die ever comes up
    for (const face of seen.keys()) expect(faces).toContain(face);
  });

  it('is deterministic: the same seed rolls the same levels', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 50; i++) expect(rollLevelStats(a)).toEqual(rollLevelStats(b));
  });
});
