// THE AUTO-REQUEUE CHAIN (Story 6.3, epic-6 amendments 15/18) — the sibling of
// app/returnToPort.ts, and deliberately its near-twin: the same latch, the same
// best-effort leave race, and exactly ONE terminal action that always runs.
//
// It fires on the arena's `rq` signal and on nothing else. A queue-formed room
// whose cohort falls below CONFIG.match.minHumans during the countdown is SEALED
// (amendment 10) and can never refill, so it collapses — and the survivor was
// one captain short through nobody's fault. Eric's ruling: they land on the home
// screen and the client joins the next queue for them, with no PLAY press.
//
// TWO THINGS THIS IS NOT:
//   • NOT the normal match-end disconnect. That still returns home and WAITS for
//     input (amendment 18's "unchanged"), which is the whole reason the server
//     has to signal this case explicitly rather than let the client guess from a
//     socket close.
//   • NOT a privileged re-entry. Amendment 18 deleted front-of-pool position
//     outright — the returning survivor is an ordinary new arrival, and the 2:00
//     cohort clock genuinely restarts.
//
// The chain, in order (each step's ordering is load-bearing):
//   1. LATCH — a second activation is a no-op. The signal arrives and THEN the
//      socket closes behind it, so two independent routes reach this door; only
//      the first may start a join.
//   2. onStart — synchronous teardown (main.ts stops the loop, drops the input
//      listeners and marks the game as returning, so the leave that follows
//      cannot be re-read as a dropped connection).
//   3. leaveRoom() raced against `leaveTimeoutMs` — `room.leave()` need not ever
//      settle when the server is already disposing the room, and the race is
//      what guarantees we still reach port.
//   4. enterPort() — unconditional, in a finally. NO PAGE RELOAD: the arena
//      session is torn down in place and the shell goes back to the home screen.
//
// The portal ad break that return-to-port requests is deliberately ABSENT: this
// is not the end of a match, it is a lobby that never started, and an
// interstitial charged against a disconnect the player did not cause would be
// the menu trip amendment 15 set out to save them.

/** The side-effects the chain drives, injected so tests can observe them. */
export interface RequeueDeps {
  /** Colyseus `room.leave()` — may reject, or never settle at all. */
  leaveRoom: () => Promise<unknown>;
  /**
   * Tear the arena session down and hand the shell back to port, queueing
   * again automatically. Runs exactly once, whatever `leaveRoom` does.
   */
  enterPort: () => void;
  /** Synchronous teardown, run once on the first activation. */
  onStart?: () => void;
  /** ms — the leave() race window. Defaults to REQUEUE_LEAVE_TIMEOUT_MS. */
  leaveTimeoutMs?: number;
}

/**
 * ms — how long the chain waits on `room.leave()` before going home anyway.
 * The same value (and the same reasoning) as the return-to-port chain's race:
 * long enough for a healthy socket's leave handshake, short enough that a dead
 * one is indistinguishable from an instant return.
 */
export const REQUEUE_LEAVE_TIMEOUT_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run `call` and resolve however it ends — sync throw, rejection, or value. */
function settle(call: () => Promise<unknown>): Promise<void> {
  try {
    return Promise.resolve(call()).then(
      () => undefined,
      () => undefined,
    );
  } catch {
    return Promise.resolve();
  }
}

/**
 * Build the auto-requeue action over its dependencies. The returned function is
 * idempotent (latched) and never throws; calling it any number of times always
 * ends in exactly one `enterPort()`.
 */
export function makeRequeue(deps: RequeueDeps): () => void {
  const leaveMs = deps.leaveTimeoutMs ?? REQUEUE_LEAVE_TIMEOUT_MS;
  let requeuing = false;
  return () => {
    if (requeuing) return; // the socket close behind the signal must not re-enter
    requeuing = true;
    // The latch is already set, so a synchronous throw here would escape with no
    // chain behind it and strand the player on a frozen start line — swallow it
    // and keep the "always exactly one enterPort" contract.
    try {
      deps.onStart?.();
    } catch {
      /* teardown is best-effort; getting back to port is the real guarantee */
    }
    void Promise.race([settle(() => deps.leaveRoom()), delay(leaveMs)]).finally(() =>
      deps.enterPort(),
    );
  };
}
