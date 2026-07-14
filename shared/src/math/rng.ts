// Deterministic PRNG (mulberry32) used for map generation and any
// reproducible randomness. Same seed => identical stream on every platform.

/** A seeded pseudo-random number source with convenience helpers. */
export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  float(min: number, max: number): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Uniformly pick one element of a non-empty array. */
  pick<T>(arr: readonly T[]): T;
}

/** Create a deterministic PRNG seeded by `seed` (coerced to uint32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}
