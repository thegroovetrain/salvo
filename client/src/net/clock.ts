// Server-time estimator. Every FrameMsg (and the welcome) carries the server
// clock `t`; this module turns those into a smooth, monotonic `serverNow()`
// that drives snapshot interpolation, blip phosphor decay, the sweep wedge,
// and shell dead-reckoning (one clock for all of them, per the plan).
//
// Estimator choice: ROLLING-MIN offset with an EWMA slew (not plain EWMA).
// Each sample measures offset = clientReceiveTime - serverSendTime
//                             = trueClockSkew + networkTransit.
// Transit is strictly additive noise: a sample can only ever OVERSHOOT the
// true skew, never undershoot it. The windowed minimum is therefore the
// sample that arrived on the fastest path — the best estimate available —
// and jitter spikes (large transit) can never drag it in either direction,
// whereas a plain EWMA absorbs every spike. The applied offset then slews
// toward the rolling min so serverNow() never visibly jumps, with a hard
// snap for genuinely large shifts (first sample, machine sleep, etc.).

const WINDOW_MS = 5000; // rolling-min window over recent samples
const SLEW_ALPHA = 0.1; // per-sample EWMA rate toward the rolling min
const SNAP_MS = 250; // |target - applied| beyond this hard-snaps

interface OffsetSample {
  at: number; // ms — client time the sample was taken
  offset: number; // ms — clientTime - serverTime for this sample
}

export class ServerClock {
  private samples: OffsetSample[] = [];
  private applied: number | null = null; // smoothed offset in active use
  private lastReturned = -Infinity; // monotonic guard on serverNow()

  constructor(private readonly nowFn: () => number = () => performance.now()) {}

  /** True once at least one sample has been ingested. */
  get ready(): boolean {
    return this.applied !== null;
  }

  /** The offset currently applied (ms, client - server). For tests/debug. */
  get offset(): number | null {
    return this.applied;
  }

  /**
   * Ingest one server timestamp (welcome `t` or frame `t`) received at client
   * time `clientAt` (defaults to now — pass explicitly in tests).
   */
  addSample(serverT: number, clientAt: number = this.nowFn()): void {
    this.samples.push({ at: clientAt, offset: clientAt - serverT });
    const cutoff = clientAt - WINDOW_MS;
    while (this.samples.length > 1 && this.samples[0].at < cutoff) {
      this.samples.shift();
    }
    let target = Infinity;
    for (const s of this.samples) target = Math.min(target, s.offset);
    if (this.applied === null || Math.abs(target - this.applied) > SNAP_MS) {
      this.applied = target;
    } else {
      this.applied += (target - this.applied) * SLEW_ALPHA;
    }
  }

  /**
   * Estimated server time (ms, same clock as FrameMsg.t) at client time
   * `clientAt`. Monotonic: never returns less than a previous call.
   * Returns 0 until the first sample arrives.
   */
  serverNow(clientAt: number = this.nowFn()): number {
    if (this.applied === null) return 0;
    const t = clientAt - this.applied;
    if (t < this.lastReturned) return this.lastReturned;
    this.lastReturned = t;
    return t;
  }
}
