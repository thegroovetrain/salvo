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
 * Hard cap on the accepted-intent queue per client (Story 2.1 — the
 * transport-coalescing press-swallow fix). Every ACCEPTED input is also queued
 * so the World can evaluate each one's fire/act intent in seq order once per
 * tick — two clicks landing in one 50ms tick both get a shot attempt (or a
 * wire denial) instead of latest-wins silently swallowing the older press.
 *
 * The cap IS the rate cap, deliberately. `allowRate` is a FIXED 1000ms window,
 * not a smooth 2-per-tick throttle: a network-jitter flush can deliver the
 * whole remaining window allowance inside ONE 50ms tick, so arrivals per tick
 * are bounded only by INPUT_RATE_CAP. Setting the queue bound to that same
 * number makes overflow impossible for accepted inputs — every accepted press
 * fires or gets its own wire denial, which is exactly the swallow class this
 * story closes. (An "average" bound like 4 silently drops burst presses: the
 * World's trailing latest-input pass only re-evaluates the ONE stored latest
 * input, so the middle of a dropped burst is neither fired nor denied.)
 */
export const INTENT_QUEUE_CAP = INPUT_RATE_CAP;

/**
 * aimDist ceiling: a STATIC TRANSPORT sanity bound only — 4× the base map
 * radius spans the whole ocean, so it admits any legitimate click (the gun's
 * effective range never exceeds the map) with generous headroom, while
 * rejecting only absurd wire garbage. It is deliberately a MAP-SCALE constant,
 * NOT a weapon stat: a radar-derived bound (e.g. 2× radar) is silently
 * overtaken by ~5 stacked gunRange upgrades (660×1.15ⁿ), which would clamp
 * legitimate long shots short of the client's range marker. The real gameplay
 * clamp to per-ship effective gun range is applied PER SHOT in equipment/guns.ts.
 */
export const AIM_DIST_MAX = 4 * CONFIG.map.baseRadius;

/** Neutral input applied to a ship before its client ever sends one. */
export function neutralInput(): InputMsg {
  return { seq: 0, throttle: 0, rudder: 0, aim: 0, fireSeq: 0, aimDist: 0, slot: 0, fireT: 0, actSeq: 0, actSlot: 0 };
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

/** Valid ability-activation counter (Story 1.6): a finite INTEGER >= 0. Like
 *  the slot index it drops the WHOLE message on anything else (non-finite,
 *  negative, fractional) — the same sanitize law. A clean monotonic counter,
 *  the actSeq sibling of the slot check; the World's lastActSeq = max(...)
 *  consumption makes any accepted-but-stale value read as "no new activation". */
function isActSeq(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
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
  // Story 1.6 ability-activation fields, validated like their precedents
  // (actSeq the fireSeq-style counter, actSlot the slot-index): malformed
  // drops the whole message, never partially applying.
  if (!isActSeq(m.actSeq)) return null;
  if (!isSlotIndex(m.actSlot)) return null;
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
    actSeq: m.actSeq,
    actSlot: m.actSlot,
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
  /** ms — the previously ACCEPTED fire time (THE monotonicity floor: fire
   *  times never run backwards across shots). */
  prevFireT: number;
}

/**
 * D1 fire-time clamp — THE trust boundary for latency compensation. The server
 * never takes the client's claim outright: compensation (now - claimed) is
 * clamped into [0, allowance] where allowance = min(measured RTT + jitter,
 * ceiling). No measured RTT (never pinged back) => zero compensation. The
 * sentinel claim (<= 0) means "no claim" => fire at `now`. The result is
 * floored at the previous ACCEPTED fire time and can never exceed `now`
 * (comp >= 0). Pure; unit-tested by table.
 *
 * AR3's "never earlier than the previous input" binds the claim to the
 * previous input's carried fire-time — claims are monotone and can never
 * time-travel behind the client's own input stream (`prevFireT` is exactly
 * that floor). It is deliberately NOT the previous input's server-APPLY time:
 * flooring there would cap compensation at ~one input interval (~50ms) for
 * any client streaming at the 50ms cadence — defeating AR3's stated purpose
 * (removes the input-delay penalty) and perversely granting input-throttlers
 * MORE compensation than honest streamers. (Adjudicated 2026-07-21, flagged
 * for Eric's veto.)
 */
export function clampFireTime(c: FireTimeClaim): number {
  if (c.claimed <= 0) return c.now; // sentinel: no claim, zero compensation
  if (c.rttMs === null) return Math.max(c.now, c.prevFireT); // never measured: zero comp
  const allowance = Math.min(c.rttMs + c.jitterMs, c.ceilingMs);
  const comp = Math.min(Math.max(c.now - c.claimed, 0), allowance);
  return Math.max(c.now - comp, c.prevFireT);
}

interface RateWindow {
  start: number; // ms — window open time (server clock)
  count: number;
}

/**
 * Latest-input-per-client store (highest seq wins for the kinematics the sim
 * steps every tick) PLUS a per-client accepted-intent queue (Story 2.1):
 * every accepted input is also queued (bounded by INTENT_QUEUE_CAP, which is
 * the rate cap itself, so no accepted input is ever dropped) so the World
 * can evaluate EACH accepted input's fire/act intent in seq order once per
 * tick — transport coalescing can no longer swallow the older of two presses
 * landing in one tick. The world reads the stored latest input every tick;
 * frames echo the stored seq as ackSeq.
 */
export class InputStore {
  private latest = new Map<string, InputMsg>();
  private windows = new Map<string, RateWindow>();
  /** Accepted inputs awaiting their once-per-tick intent evaluation, in
   *  accept (= strictly increasing seq) order. Cleared by drainIntents(). */
  private intents = new Map<string, InputMsg[]>();

  /**
   * Submit a raw wire message for `id` at server time `now` (ms).
   * Returns true iff the message was accepted and stored.
   */
  submit(id: string, raw: unknown, now: number): boolean {
    if (!this.allowRate(id, now)) return false;
    const msg = sanitizeInput(raw, this.ackFor(id));
    if (!msg) return false;
    this.latest.set(id, msg);
    this.queueIntent(id, msg);
    return true;
  }

  /** Latest accepted input for `id`, if any. */
  get(id: string): InputMsg | undefined {
    return this.latest.get(id);
  }

  /**
   * Take (and clear) every accepted-but-unevaluated input for `id`, in seq
   * order. Called by the World exactly once per tick per ship; fireControl /
   * activationControl evaluate each entry's press intent so an older press
   * fires or is denied on the wire, never silently swallowed. Empty between
   * arrivals — kinematics stay latest-wins via get().
   */
  drainIntents(id: string): InputMsg[] {
    const queue = this.intents.get(id);
    if (queue === undefined) return [];
    this.intents.delete(id);
    return queue;
  }

  /** Highest accepted seq for `id` (0 before any input). Frames echo this. */
  ackFor(id: string): number {
    return this.latest.get(id)?.seq ?? 0;
  }

  /** Forget a client entirely (on leave). */
  remove(id: string): void {
    this.latest.delete(id);
    this.windows.delete(id);
    this.intents.delete(id);
  }

  /** Queue an accepted input for intent evaluation. INTENT_QUEUE_CAP equals
   *  INPUT_RATE_CAP, and the rate cap admits at most INPUT_RATE_CAP accepted
   *  messages per window (however they burst inside a tick), so this bound is
   *  unreachable for accepted inputs — it exists only as a memory guard. */
  private queueIntent(id: string, msg: InputMsg): void {
    const queue = this.intents.get(id) ?? [];
    if (queue.length >= INTENT_QUEUE_CAP) return;
    queue.push(msg);
    this.intents.set(id, queue);
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
