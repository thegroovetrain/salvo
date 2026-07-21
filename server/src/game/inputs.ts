// Input validation + latest-input store. The ONLY path player intent enters
// the simulation (drones will use it too). Malformed messages are silently
// dropped per the plan: every field finite-checked, numeric axes clamped,
// aim wrapped, fireSeq/aimDist floored/clamped non-negative, seq must
// strictly exceed the stored seq, and each client is rate-capped at 40
// accepted-or-not messages per second. fireSeq monotonicity is deliberately
// NOT enforced here — the World's consumption (lastFireSeq = max(...)) makes
// a stale or replayed counter value simply read as "no new click".

import { CONFIG, SLOT_COUNT, wrapAngle, type InputMsg } from '@salvo/shared';

/** Max input messages per client per rolling window. */
export const INPUT_RATE_CAP = 40;
/** Rate-cap window length (ms of server time). */
export const INPUT_RATE_WINDOW_MS = 1000;

/**
 * aimDist ceiling: a STATIC TRANSPORT sanity bound only — 4× the base map
 * radius spans the whole ocean, so it admits any legitimate click (the gun's
 * effective range never exceeds the map) with generous headroom, while
 * rejecting only absurd wire garbage. It is deliberately a MAP-SCALE constant,
 * NOT a weapon stat: a radar-derived bound (e.g. 2× radar) is silently
 * overtaken by ~5 stacked gunRange upgrades (650×1.15ⁿ), which would clamp
 * legitimate long shots short of the client's range marker. The real gameplay
 * clamp to per-ship effective gun range is applied PER SHOT in equipment/guns.ts.
 */
export const AIM_DIST_MAX = 4 * CONFIG.map.baseRadius;

/** Neutral input applied to a ship before its client ever sends one. */
export function neutralInput(): InputMsg {
  return { seq: 0, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0 };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

/** Valid loadout slot index: an INTEGER in [0, SLOT_COUNT). Anything else
 *  (7, 1.5, NaN, negatives, non-numbers) drops the WHOLE message — the
 *  existing sanitize law: malformed input never partially applies. */
function isSlotIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < SLOT_COUNT;
}

function numericFieldsFinite(m: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(m.seq) &&
    isFiniteNumber(m.throttle) &&
    isFiniteNumber(m.rudder) &&
    isFiniteNumber(m.aim) &&
    isFiniteNumber(m.fireSeq) &&
    isFiniteNumber(m.aimDist) &&
    isFiniteNumber(m.fireT) &&
    (m.fireT as number) >= 0
  );
}

/** Floor to an integer, clamping negatives to 0 (fireSeq is a click COUNT). */
function sanitizeFireSeq(v: number): number {
  return Math.max(0, Math.floor(v));
}

/** Clamp a distance into [0, AIM_DIST_MAX]. */
function sanitizeAimDist(v: number): number {
  return Math.min(Math.max(v, 0), AIM_DIST_MAX);
}

/**
 * Validate + sanitize a raw wire message into an InputMsg, or null to drop.
 * `lastSeq` is the highest seq already stored for this client — anything not
 * strictly newer is stale and dropped.
 */
export function sanitizeInput(raw: unknown, lastSeq: number): InputMsg | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (!numericFieldsFinite(m)) return null;
  if (!isSlotIndex(m.slot)) return null;
  const seq = m.seq as number;
  if (seq <= lastSeq) return null;
  return {
    seq,
    throttle: clampUnit(m.throttle as number),
    rudder: clampUnit(m.rudder as number),
    aim: wrapAngle(m.aim as number),
    fireSeq: sanitizeFireSeq(m.fireSeq as number),
    aimDist: sanitizeAimDist(m.aimDist as number),
    slot: m.slot,
    fireT: m.fireT as number,
  };
}

/** Everything clampFireTime needs to turn a claimed fire time into a safe one. */
export interface FireTimeClaim {
  /** ms — the client's claimed fire time (InputMsg.fireT; 0 = no-claim sentinel). */
  claimed: number;
  /** ms — server time this tick (World.now). */
  now: number;
  /** ms — the windowed-min measured RTT for this client, null if never measured. */
  rttMs: number | null;
  /** ms — CONFIG.net.fireJitterAllowanceMs (honest jitter headroom above RTT). */
  jitterMs: number;
  /** ms — CONFIG.net.fireBackdateCeilingMs (the hard back-dating cap, AR3). */
  ceilingMs: number;
  /** ms — server time the PREVIOUS applied input arrived (monotonicity floor:
   *  a shot can never be back-dated to before the input that preceded it). */
  prevInputAt: number;
  /** ms — the previously ACCEPTED fire time (monotonicity floor: fire times
   *  never run backwards across shots). */
  prevFireT: number;
}

/**
 * D1 fire-time clamp — THE trust boundary for latency compensation. The server
 * never takes the client's claim outright: compensation (now - claimed) is
 * clamped into [0, allowance] where allowance = min(measured RTT + jitter,
 * ceiling). No measured RTT (never pinged back) => zero compensation. The
 * sentinel claim (<= 0) means "no claim" => fire at `now`. The result is
 * floored at both monotonicity marks (previous applied input, previous accepted
 * fire) and can never exceed `now` (comp >= 0). Pure; unit-tested by table.
 */
export function clampFireTime(c: FireTimeClaim): number {
  if (c.claimed <= 0) return c.now; // sentinel: no claim, zero compensation
  const floors = Math.max(c.prevInputAt, c.prevFireT);
  if (c.rttMs === null) return Math.max(c.now, floors); // never measured: zero comp
  const allowance = Math.min(c.rttMs + c.jitterMs, c.ceilingMs);
  const comp = Math.min(Math.max(c.now - c.claimed, 0), allowance);
  return Math.max(c.now - comp, floors);
}

interface RateWindow {
  start: number; // ms — window open time (server clock)
  count: number;
}

/**
 * Latest-input-per-client store (highest seq wins; no replay queue at tracer
 * stage). The world reads the stored input every tick; frames echo the stored
 * seq as ackSeq.
 */
export class InputStore {
  private latest = new Map<string, InputMsg>();
  private windows = new Map<string, RateWindow>();

  /**
   * Submit a raw wire message for `id` at server time `now` (ms).
   * Returns true iff the message was accepted and stored.
   */
  submit(id: string, raw: unknown, now: number): boolean {
    if (!this.allowRate(id, now)) return false;
    const msg = sanitizeInput(raw, this.ackFor(id));
    if (!msg) return false;
    this.latest.set(id, msg);
    return true;
  }

  /** Latest accepted input for `id`, if any. */
  get(id: string): InputMsg | undefined {
    return this.latest.get(id);
  }

  /** Highest accepted seq for `id` (0 before any input). Frames echo this. */
  ackFor(id: string): number {
    return this.latest.get(id)?.seq ?? 0;
  }

  /** Forget a client entirely (on leave). */
  remove(id: string): void {
    this.latest.delete(id);
    this.windows.delete(id);
  }

  /** Fixed-window rate cap: at most INPUT_RATE_CAP messages per window. */
  private allowRate(id: string, now: number): boolean {
    const w = this.windows.get(id);
    if (!w || now - w.start >= INPUT_RATE_WINDOW_MS) {
      this.windows.set(id, { start: now, count: 1 });
      return true;
    }
    if (w.count >= INPUT_RATE_CAP) return false;
    w.count += 1;
    return true;
  }
}
