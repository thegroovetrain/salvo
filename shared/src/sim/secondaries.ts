// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9): "it can be used reliably in bursts, and as long as it hasn't
// overheated it will cool down when not being fired, but sustained fire might
// take it out of commission until it fully cools."
//
// One stepper, both sides: the server steps every captain's secondaries each
// 50 ms tick off the held level (`InputMsg.sec`), and the client steps its own
// with the same call (corrected from `OwnShip.sec`).
//
// THE HEAT LAW IS PER ROUND (review-gate patch P1 — the orchestrator's
// ruling on R3's numbers; the earlier per-held-tick law let a tapped button
// fire about twice a hold's rounds and never overheat):
//
//   - While HELD and not locked: one round every `CONFIG.secondaries.rateMs`.
//   - EVERY ROUND FIRED adds `rateMs / overheatMs` of heat, so a continuous
//     hold goes cold to full over `overheatMs` of fire.
//   - A round's own `rateMs` window NEVER COOLS: while the gun is still busy
//     with its last round (`untilRoundMs > 0`) heat holds, button held or not.
//     Heat drains — full to zero over `coolMs` — only for time OUTSIDE such a
//     window in which no new round fires. The split is exact inside a step
//     (a window that ends 20 ms into a 50 ms step leaves 30 ms of cooling),
//     so the law is the same against any tick and any press pattern.
//   - Reaching full heat LOCKS the guns: no round fires, held or not, until
//     heat is back to ZERO. The step in which heat reaches zero only unlocks;
//     a held button fires again on the next step.
//
// What that buys: heat is a ledger of rounds, so NO press pattern beats the
// duty cycle — each round's heat takes `rateMs × coolMs / overheatMs` of idle
// time to shed, so the long-run rate can never exceed one round per
// `rateMs × (1 + coolMs / overheatMs)` (plus one full heat's worth of rounds
// banked at the start).
//
// THE RATE IS EXACT AGAINST ANY TICK. `untilRoundMs` is the time until the
// next round is due; a step fires every round that falls due inside it and
// carries the remainder, so 120 ms rounds against 50 ms ticks land on ticks
// 0, 2, 4, 7, 9, 11, … (one round per 120 ms in the long run, sometimes none in a
// tick, never a drifted rate). A press after an idle spell fires its first
// round in that very tick; releasing and re-pressing never beats the rate,
// because the due time survives the release.
//
// State is MUTATED IN PLACE and the step returns the number of rounds to fire
// (the caller spawns that many). Pure otherwise: zero I/O, no randomness.

import { CONFIG } from '../constants.js';

/** Float slack on the two heat thresholds — a whole number of rounds that sums to "full" must lock on the last of them, not one later. */
const HEAT_EPS = 1e-9;

/** A hull's secondaries state. */
export interface SecondariesState {
  /** 0..1 — 0 cold, 1 full heat. */
  heat: number;
  /** True from the step heat reaches 1 until the step it is back to 0: no round fires while locked. */
  locked: boolean;
  /**
   * ms until the next round is due (0 = a round may fire now) — which is also
   * how much of the LAST round's own rate window is still running: no heat
   * drains while this is above zero.
   */
  untilRoundMs: number;
}

/**
 * The slice of `SecondariesState` that rides the wire (`OwnShip.sec`) — what
 * the HUD reads and what the client's local state is corrected from. The
 * round phase (`untilRoundMs`) stays server-side: the client spawns no shells.
 */
export type SecondariesHeat = Pick<SecondariesState, 'heat' | 'locked'>;

/** Cold, unlocked, a round due immediately — the spawn state. */
export function initialSecondaries(): SecondariesState {
  return { heat: 0, locked: false, untilRoundMs: 0 };
}

/** Heat of ONE round fired, as a fraction of full: `rateMs / overheatMs`. */
export function secondariesHeatPerRound(): number {
  return CONFIG.secondaries.rateMs / CONFIG.secondaries.overheatMs;
}

/** Fire one round NOW: its heat lands (locking on reaching full) and its rate window starts. */
function fireRound(state: SecondariesState): void {
  state.heat += secondariesHeatPerRound();
  if (state.heat >= 1 - HEAT_EPS) {
    state.heat = 1;
    state.locked = true;
  }
  state.untilRoundMs = CONFIG.secondaries.rateMs;
}

/** Drain `ms` of idle time (outside any round's window), unlocking on reaching zero. */
function coolDown(state: SecondariesState, ms: number): void {
  state.heat -= ms / CONFIG.secondaries.coolMs;
  if (state.heat <= HEAT_EPS) {
    state.heat = 0;
    state.locked = false;
  }
}

/**
 * ONE STEP of a hull's secondaries, IN PLACE. `held` is the right-mouse level
 * for this step. Returns the number of rounds that fire this step (0, 1, or
 * more when `dtMs` spans several `rateMs`).
 *
 * The step is walked in time order: the rest of the last round's window
 * passes first (no cooling); then, with the gun free, a held unlocked gun
 * fires a round (heat up, a new window) and the walk repeats, while a
 * released or locked gun cools for whatever is left of the step. A round due
 * exactly on the step's end fires in this step. The round that reaches full
 * heat is fired; the lock stops the next one.
 */
export function stepSecondaries(state: SecondariesState, held: boolean, dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  let left = dtMs;
  let rounds = 0;
  for (;;) {
    const busy = Math.min(state.untilRoundMs, left);
    state.untilRoundMs -= busy;
    left -= busy;
    if (state.untilRoundMs > 0) return rounds;
    if (!held || state.locked) {
      coolDown(state, left);
      return rounds;
    }
    fireRound(state);
    rounds += 1;
  }
}

/**
 * u — THE SECONDARIES' REACH for a folded main-battery reach: half of it
 * (`CONFIG.secondaries.rangeFrac`), measured from the ship centre.
 * `effectiveStats()` already publishes this as `stats.secondaryRangeU`; this
 * is the one law both read.
 */
export function secondaryReachU(mainReachU: number): number {
  return mainReachU * CONFIG.secondaries.rangeFrac;
}
