// The queue's arm/form POLICY — pure functions over plain numbers, ZERO
// Colyseus imports, exactly like game/match.ts and game/world.ts. Story 6.1
// moves the lobby out of the arena and in front of it; everything that decides
// WHEN a match forms lives here so the whole matrix (arm, expiry, cap, churn,
// overflow) is unit-testable without a transport, a room, or a clock.
//
// StandardQueueRoom.ts is the thin adapter: it owns the pool array, the socket
// sends and the matchMaker calls, and reads its every decision out of
// queueStep().

import { CONFIG } from '@salvo/shared';

export interface QueueConfig {
  /** Captains required to ARM the pool (CONFIG.match.minHumans). */
  minHumans: number;
  /** Captains that form the match immediately, ignoring the remaining timer
   *  (CONFIG.map.playerCap — the SAME constant the arena caps at; the queue
   *  must never fork it, see spec-6-1 Boundaries). */
  cap: number;
  /** ms an armed pool is held before it forms (CONFIG.match.queueTimerMs). */
  queueTimerMs: number;
}

export interface QueueState {
  /** Room-clock milliseconds (the adapter passes this.clock.currentTime). */
  nowMs: number;
  /** Captains currently pooled. */
  pooled: number;
  /**
   * When the CURRENT cohort's pool first reached `minHumans`, or null if it
   * has not.
   *
   * Never moved once set WITHIN a cohort — not when captains leave, not when
   * they rejoin. That is deliberate: a deadline that later joins could extend
   * is a hostage-cycling vector (one captain cycling leave/rejoin holds
   * everyone else in the queue forever), which is exactly the flaw the arena's
   * 30 s gathering window carried (deferred-work.md:319).
   *
   * It IS cleared at exactly one place: when a match forms. Forming is a cohort
   * boundary — those captains have left for the arena — so the captains behind
   * them (an overflow surplus, or the next arrivals) must get their own full
   * `queueTimerMs`, not the expired remains of someone else's. Without this
   * reset a room that had once expired would form every subsequent pair
   * INSTANTLY for the rest of its life, and the 2:00 wait would silently
   * evaporate after the first match. A griefer cannot abuse the reset: forming
   * requires minHumans AND either the full timer or a full lobby, and it
   * consumes the captains it seats.
   */
  armedAtMs: number | null;
}

export interface QueueDecision {
  /** The armed timestamp AFTER this step (the adapter stores it verbatim). */
  armedAtMs: number | null;
  /** True when the adapter should form a match this step. */
  form: boolean;
  /** Captains to seat when `form` — the FIRST N of the pool in join order; a
   *  surplus past `cap` stays pooled. 0 when `form` is false. */
  formCount: number;
  /** ms until the deadline; null while unarmed (the pool has never reached
   *  minHumans), which is what QueueStatusMsg reports as "no countdown yet". */
  startsInMs: number | null;
}

/** The shipped queue policy constants. Mirrors game/match.ts's defaultTimings():
 *  CONFIG is the single source of truth, this is just the projection. */
export function defaultQueueConfig(): QueueConfig {
  return {
    minHumans: CONFIG.match.minHumans,
    cap: CONFIG.map.playerCap,
    queueTimerMs: CONFIG.match.queueTimerMs,
  };
}

/**
 * One queue step. Arms the pool the first time it reaches `minHumans`, then
 * forms when the deadline has passed OR the pool has reached the cap —
 * whichever comes first — but ONLY while the pool still holds `minHumans`.
 *
 * The min check is re-tested at form time on purpose: nothing may start a
 * 1-human standard match (it has no defined termination rule until Story
 * 6-3/6-5), so an expired deadline over a drained pool simply waits, and fires
 * the moment the pool re-reaches min.
 */
export function queueStep(state: QueueState, cfg: QueueConfig): QueueDecision {
  const armedAtMs = state.armedAtMs ?? (state.pooled >= cfg.minHumans ? state.nowMs : null);
  // Clamped at 0, so `startsInMs === 0` IS "the deadline has passed" — one
  // expression serving both the wire countdown and the expiry test, rather
  // than two that can drift apart.
  const startsInMs = armedAtMs === null ? null : Math.max(0, armedAtMs + cfg.queueTimerMs - state.nowMs);
  const form = armedAtMs !== null && state.pooled >= cfg.minHumans && (startsInMs === 0 || state.pooled >= cfg.cap);
  // Forming CLEARS the arm (see QueueState.armedAtMs): the seated captains are
  // a departing cohort, so whoever is left behind re-arms fresh on a later step
  // and waits their own full queueTimerMs.
  return {
    armedAtMs: form ? null : armedAtMs,
    form,
    formCount: form ? Math.min(cfg.cap, state.pooled) : 0,
    startsInMs,
  };
}
