// Pure stats helpers for the batch-sim harness: nearest-rank percentiles
// (latencyHarness convention), the min/p25/p50/p75/p95/max + mean summary the
// spec's report format requires, and the seed-mixing used to decorrelate
// per-match / per-captain mulberry32 streams from the one run seed.

export interface Summary {
  n: number;
  mean: number;
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  max: number;
}

/** Nearest-rank percentile over an ASCENDING-sorted array (0 when empty). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
}

/** Full distribution summary; all-zeros when `values` is empty. */
export function summarize(values: readonly number[]): Summary {
  if (values.length === 0) return { n: 0, mean: 0, min: 0, p25: 0, p50: 0, p75: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    n: sorted.length,
    mean,
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

/** Decorrelate a sub-stream seed from the run seed by ordinal (the World
 *  deckRngFor idiom: golden-ratio Math.imul scramble, coerced to uint32). */
export function mixSeed(seed: number, ordinal: number): number {
  return (seed ^ Math.imul(ordinal + 1, 0x9e3779b9)) >>> 0;
}

/** Multiset tally of string ids (deck.test tally idiom). */
export function tally(ids: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Fixed-decimal number formatting (deterministic report bodies). */
export function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** One deterministic summary line: n + mean + the percentile ladder. */
export function fmtSummary(s: Summary, digits = 1): string {
  const f = (n: number): string => fmt(n, digits);
  return `n=${s.n} mean=${f(s.mean)} min=${f(s.min)} p25=${f(s.p25)} p50=${f(s.p50)} p75=${f(s.p75)} p95=${f(s.p95)} max=${f(s.max)}`;
}
