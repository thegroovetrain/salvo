// Windowed-minimum RTT estimator (story 1.5, D1). One instance per connected
// client, fed by the room's app-level ping loop (Colyseus 0.17 exposes no
// room.ping(), so the adapter measures round-trips itself). The D1 fire-time
// clamp wants the client's BEST-CASE latency — the minimum over a sliding
// window (CONFIG.net.rttWindowMs) — so a transient congestion spike never
// inflates the back-dating allowance, and a client that genuinely improves
// (roams to better wifi) sheds its stale worst numbers once the window rolls.
// Pure over (sample, timestamp) pairs: zero I/O, zero Colyseus — the room owns
// the clock and the sockets, this owns only the arithmetic.

/** One RTT measurement: the round-trip in ms and the time it was taken. */
interface RttSample {
  rttMs: number;
  atMs: number;
}

/**
 * Sliding-window minimum over RTT samples. `addSample` appends (timestamps are
 * expected non-decreasing — the caller samples off one monotonic clock);
 * `minMs` prunes everything older than the window and returns the min of what
 * survives, or null when nothing does (never measured / all expired) — the
 * clamp treats null as zero compensation.
 */
export class RttEstimator {
  private readonly samples: RttSample[] = [];

  constructor(private readonly windowMs: number) {}

  /** Record one round-trip measurement taken at `atMs`. */
  addSample(rttMs: number, atMs: number): void {
    this.samples.push({ rttMs, atMs });
    this.prune(atMs);
  }

  /** Minimum RTT over the samples still inside the window at `atMs`, or null. */
  minMs(atMs: number): number | null {
    this.prune(atMs);
    if (this.samples.length === 0) return null;
    let min = Number.POSITIVE_INFINITY;
    for (const s of this.samples) min = Math.min(min, s.rttMs);
    return min;
  }

  /** Number of live samples (testing/inspection only). */
  get size(): number {
    return this.samples.length;
  }

  /** Drop samples that have aged out of the window (append order = time order). */
  private prune(atMs: number): void {
    while (this.samples.length > 0 && atMs - this.samples[0].atMs > this.windowMs) {
      this.samples.shift();
    }
  }
}
