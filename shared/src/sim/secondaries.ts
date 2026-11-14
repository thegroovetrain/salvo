// THE SECONDARIES — heat, not ammo (Story 10.4, R3, Eric 2026-11-04, epic-10
// amendment 9), and heat SLOWS the gun, it never stops it (Eric 2026-11-13,
// epic-11 amendment 9: "The secondary gun will fire 3 shots per
// second, which will fall down to 1 shot per second as it overheats. It takes
// 10 seconds to overheat now. Overheating does not stop the gun from firing,
// but it cannot fire as quickly when its just held down.").
//
// One stepper, both sides: the server steps every captain's secondaries each
// 50 ms tick off the held level (`InputMsg.sec`), and the client steps its own
// with the same call (corrected from `OwnShip.sec`).
//
// THE HEAT LAW IS PER ROUND (review-gate patch P1 kept; the earlier
// per-held-tick law let a tapped button fire about twice a hold's rounds):
//
//   - While HELD and the gun is free: a round fires. A round fired at heat
//     `h` starts an interval of `secondariesIntervalMs(h)` =
//     `1000 / (cold − (cold − hot) × h)` ms — `coldRatePerS` rounds a second
//     cold, sliding linearly to `hotRatePerS` at full heat.
//   - THAT ROUND adds `interval / overheatMs` of heat, capped at 1, so a
//     continuous hold goes cold to full over `overheatMs` of fire.
//   - A round's own interval NEVER COOLS: while the gun is still busy with its
//     last round (`untilRoundMs > 0`) heat holds, button held or not. Heat
//     drains — full to zero over `coolMs` — only for time OUTSIDE such an
//     interval in which no new round fires. The split is exact inside a step
//     (an interval that ends 20 ms into a 50 ms step leaves 30 ms of
//     cooling), so the law is the same against any tick and any press pattern.
//   - FULL HEAT NEVER LOCKS: a held gun at full heat keeps firing at the hot
//     rate and stays at full heat.
//
// What that buys: heat is a ledger of rounds, so no press pattern beats a
// hold's heat cost — every round pays its own interval's share of a full heat.
//
// THE RATE IS EXACT AGAINST ANY TICK. `untilRoundMs` is the time until the
// next round is due; a step fires every round that falls due inside it and
// carries the remainder (sometimes none in a tick, never a drifted rate). A
// press after an idle spell fires its first round in that very tick;
// releasing and re-pressing never beats the rate, because the due time
// survives the release.
//
// State is MUTATED IN PLACE and the step returns the number of rounds to fire
// (the caller spawns that many). Pure otherwise: zero I/O, no randomness.

import { CONFIG } from '../constants.js';

/** Float slack on the two heat bounds — a continuous hold that sums to "full" lands exactly on 1, a drain to "empty" exactly on 0. */
const HEAT_EPS = 1e-9;

/** A hull's secondaries state. */
export interface SecondariesState {
  /** 0..1 — 0 cold, 1 full heat. */
  heat: number;
  /**
   * ms until the next round is due (0 = a round may fire now) — which is also
   * how much of the LAST round's own interval is still running: no heat
   * drains while this is above zero.
   */
  untilRoundMs: number;
}

/**
 * The slice of `SecondariesState` that rides the wire (`OwnShip.sec`) — what
 * the HUD reads and what the client's local state is corrected from. The
 * round phase (`untilRoundMs`) stays server-side: the client spawns no shells.
 */
export type SecondariesHeat = Pick<SecondariesState, 'heat'>;

/** Cold, a round due immediately — the spawn state. */
export function initialSecondaries(): SecondariesState {
  return { heat: 0, untilRoundMs: 0 };
}

/**
 * INSTANT RELOAD VENTS THE SECONDARIES (2026-11-05, Story 10.5, R10, epic-10
 * amendment 11 — supersedes amendment 9(h) R7 "heat untouched"): heat to
 * zero, AND THE GUN IS FREE AT ONCE (Eric 2026-11-13, epic-11 amendment
 * 9, AskUserQuestion "Fire right away" — a hot round's interval is
 * up to a second now, and a vented gun must not sit it out): the running
 * round's interval is cleared, so a held gun fires on the next step at the
 * cold rate. Returns a FRESH state (the input is not mutated). The wire slice
 * (`{ heat }`) has no interval and is vented by the same call.
 */
export function ventSecondaries<T extends SecondariesHeat>(state: T): T {
  const vented = { ...state, heat: 0 };
  if ('untilRoundMs' in vented) (vented as SecondariesState).untilRoundMs = 0;
  return vented;
}

/**
 * ms — the interval a round fired at `heat` starts: `1000 / rate`, the rate
 * sliding linearly from `coldRatePerS` (heat 0) to `hotRatePerS` (heat 1).
 * Heat outside [0, 1] is clamped.
 */
/**
 * Heat as the law reads it: inside 0..1, and a non-finite value reads as
 * cold. The interval and the step walk are built on it, so a corrupt heat can
 * never produce a non-finite interval (which would never end the walk).
 */
function clampHeat(heat: number): number {
  return heat > 0 ? Math.min(1, heat) : 0;
}

export function secondariesIntervalMs(heat: number): number {
  const { coldRatePerS: cold, hotRatePerS: hot } = CONFIG.secondaries;
  const h = clampHeat(heat);
  return 1000 / (cold - (cold - hot) * h);
}

/** Fire one round NOW: its interval starts at the current heat's rate, and its heat (that interval's share of a full heat) lands, capped at 1. */
function fireRound(state: SecondariesState): void {
  const interval = secondariesIntervalMs(state.heat);
  const heat = clampHeat(state.heat) + interval / CONFIG.secondaries.overheatMs;
  state.heat = heat >= 1 - HEAT_EPS ? 1 : heat;
  state.untilRoundMs = interval;
}

/** Drain `ms` of idle time (outside any round's interval), floored at zero. */
function coolDown(state: SecondariesState, ms: number): void {
  const heat = state.heat - ms / CONFIG.secondaries.coolMs;
  state.heat = heat <= HEAT_EPS ? 0 : heat;
}

/**
 * ONE STEP of a hull's secondaries, IN PLACE. `held` is the right-mouse level
 * for this step. Returns the number of rounds that fire this step (0, 1, or
 * more when `dtMs` spans several intervals).
 *
 * The step is walked in time order: the rest of the last round's interval
 * passes first (no cooling); then, with the gun free, a held gun fires a
 * round (heat up, a new interval) and the walk repeats, while a released gun
 * cools for whatever is left of the step. A round due exactly on the step's
 * end fires in this step.
 */
export function stepSecondaries(state: SecondariesState, held: boolean, dtMs: number): number {
  // A junk step fires nothing. With no lock to end the walk, an endless step
  // would fire forever, so a non-finite `dtMs` is junk too.
  if (!(dtMs > 0) || !Number.isFinite(dtMs)) return 0;
  let left = dtMs;
  let rounds = 0;
  for (;;) {
    const busy = Math.min(state.untilRoundMs, left);
    state.untilRoundMs -= busy;
    left -= busy;
    if (state.untilRoundMs > 0) return rounds;
    if (!held) {
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
