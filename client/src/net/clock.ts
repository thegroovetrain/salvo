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
  private lastFrameT = -Infinity; // ms — newest server timestamp ingested
  private lastFrameAt = 0; // ms — client time that newest timestamp arrived

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
    if (serverT >= this.lastFrameT) {
      this.lastFrameT = serverT;
      this.lastFrameAt = clientAt;
    }
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

  /**
   * THE STALENESS CLOCK (2026-10-14 fix: hulls vanishing mid-firefight while
   * the server lags). Server time as the FRAMES say it is: the newest `t`
   * ingested, advanced by the wall time since it arrived, and never past
   * `serverNow()`.
   *
   * WHY NOT `serverNow()`. When the server falls behind 20 Hz its sim time
   * dilates: frames keep coming but each `t` advances 50 ms per >50 ms of
   * wall. `serverNow()` rides the rolling-MIN offset (the oldest, fastest
   * sample in its 5 s window), so it keeps running at WALL rate and drifts
   * ahead of every frame it is fed — and a "not seen for N ms of serverNow"
   * prune then drops a contact that is in EVERY frame. Measured here, the age
   * of a thing delivered in the newest frame is at most the wall gap since
   * that frame arrived, however slow the server ticks.
   *
   * WHAT IT KEEPS. Something that LEAVES the frames ages by frame time, so it
   * still goes after the same TTL of frames without it; and when frames stop
   * altogether (dead socket) the wall-time term keeps the clock running, so
   * everything still ages out exactly as it did on `serverNow()`. On an
   * on-time server it trails `serverNow()` by at most the newest sample's
   * transit jitter (the min below is the guard the other way). Use it for
   * "is this delivered thing stale?" — never for poses, sweeps or ages.
   */
  frameNow(clientAt: number = this.nowFn()): number {
    const now = this.serverNow(clientAt);
    if (this.applied === null) return now;
    return Math.min(now, this.lastFrameT + Math.max(0, clientAt - this.lastFrameAt));
  }
}
