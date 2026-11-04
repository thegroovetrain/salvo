// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9): "it can be used reliably in bursts, and as long as it hasn't
// overheated it will cool down when not being fired, but sustained fire might
// take it out of commission until it fully cools."
//
// One stepper, both sides: the server steps every captain's secondaries each
// 50 ms tick off the held level (`InputMsg.sec`), and the client steps its own
// with the same call (corrected from `OwnShip.sec`).
//
//   - While HELD and not locked: one round every `CONFIG.secondaries.rateMs`,
//     and heat rises linearly — cold to full over `overheatMs` of firing.
//   - Reaching full heat LOCKS the guns: no round fires, held or not, until
//     heat is back to ZERO.
//   - Whenever not firing (released, or locked) heat drains linearly — full to
//     zero over `coolMs`.
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

/** Float slack on the two heat thresholds — 80 steps of 50 / 4000 must reach "full" on the 80th, not the 81st. */
const HEAT_EPS = 1e-9;

/** A hull's secondaries state. */
export interface SecondariesState {
  /** 0..1 — 0 cold, 1 full heat. */
  heat: number;
  /** True from the step heat reaches 1 until the step it is back to 0: no round fires while locked. */
  locked: boolean;
  /** ms until the next round is due (0 = a round may fire now). */
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

/** Fire every round that falls due inside this step; returns how many. */
function fireDue(state: SecondariesState, dtMs: number): number {
  const rateMs = CONFIG.secondaries.rateMs;
  let until = state.untilRoundMs - dtMs;
  let rounds = 0;
  while (until <= 0) {
    rounds += 1;
    until += rateMs;
  }
  state.untilRoundMs = until;
  return rounds;
}

/** Heat for a FIRING step: rise, and lock on reaching full. */
function heatUp(state: SecondariesState, dtMs: number): void {
  state.heat += dtMs / CONFIG.secondaries.overheatMs;
  if (state.heat >= 1 - HEAT_EPS) {
    state.heat = 1;
    state.locked = true;
  }
}

/** Heat for a NON-firing step: drain, and unlock on reaching zero. */
function coolDown(state: SecondariesState, dtMs: number): void {
  state.heat -= dtMs / CONFIG.secondaries.coolMs;
  if (state.heat <= HEAT_EPS) {
    state.heat = 0;
    state.locked = false;
  }
}

/**
 * ONE STEP of a hull's secondaries, IN PLACE. `held` is the right-mouse level
 * for this tick. Returns the number of rounds that fire this step (0, 1, or
 * more when `dtMs` spans several `rateMs`).
 *
 * A step that reaches full heat still fires its own rounds — the lock bites
 * from the NEXT step.
 */
export function stepSecondaries(state: SecondariesState, held: boolean, dtMs: number): number {
  if (held && !state.locked) {
    const rounds = fireDue(state, dtMs);
    heatUp(state, dtMs);
    return rounds;
  }
  state.untilRoundMs = Math.max(0, state.untilRoundMs - dtMs);
  coolDown(state, dtMs);
  return 0;
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
