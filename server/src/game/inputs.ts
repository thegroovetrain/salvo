// Input validation + latest-input store. The ONLY path player intent enters
// the simulation (drones will use it too). Malformed messages are silently
// dropped per the plan: every field finite-checked, numeric axes clamped,
// aim wrapped, seq must strictly exceed the stored seq, and each client is
// rate-capped at 40 accepted-or-not messages per second.

import { wrapAngle, type InputMsg, type WeaponId } from '@salvo/shared';

/** Max input messages per client per rolling window. */
export const INPUT_RATE_CAP = 40;
/** Rate-cap window length (ms of server time). */
export const INPUT_RATE_WINDOW_MS = 1000;

/** Neutral input applied to a ship before its client ever sends one. */
export function neutralInput(): InputMsg {
  return { seq: 0, throttle: 0, rudder: 0, aim: 0, fire: false, weapon: 0 };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampUnit(v: number): number {
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

function isWeaponId(v: unknown): v is WeaponId {
  return v === 0 || v === 1 || v === 2;
}

function numericFieldsFinite(m: Record<string, unknown>): boolean {
  return (
    isFiniteNumber(m.seq) &&
    isFiniteNumber(m.throttle) &&
    isFiniteNumber(m.rudder) &&
    isFiniteNumber(m.aim)
  );
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
  if (typeof m.fire !== 'boolean') return null;
  if (!isWeaponId(m.weapon)) return null;
  const seq = m.seq as number;
  if (seq <= lastSeq) return null;
  return {
    seq,
    throttle: clampUnit(m.throttle as number),
    rudder: clampUnit(m.rudder as number),
    aim: wrapAngle(m.aim as number),
    fire: m.fire,
    weapon: m.weapon,
  };
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
