// THE return-to-port chain, extracted from main.ts as a pure factory over its
// four side-effects so the whole thing is unit-testable with fake timers.
//
// Back to the menu via a full reload: bulletproof teardown of the Pixi scene,
// loop, listeners, and net state in one stroke; the next PLAY is a fresh
// joinOrCreate. The saved callsign persists in localStorage.
//
// The chain, in order (each step's ordering is load-bearing):
//   1. LATCH — a second activation (double click, or a key after the click) is
//      a no-op; the first chain still runs to its reload.
//   2. onStart — synchronous teardown hygiene (main.ts cancels the debounced
//      fog re-bake and marks the game as returning, so handleRoomLeave knows a
//      reload is already on its way).
//   3. requestAdBreak() — awaited to completion, NOT time-boxed here: the
//      adapter is always safeAdapter-wrapped, which already caps it at 35s. A
//      shorter cap here would cut a real interstitial off mid-play.
//   4. leaveRoom() raced against `leaveTimeoutMs` — the fix. `room.leave()`
//      never settles when the socket is already gone (the server disposes the
//      room resultsSeconds after the finish), which used to strand the player
//      on the results screen with no path home. The race guarantees the chain
//      always reaches the reload; a rejection is swallowed the same way.
//   5. reload() — unconditional, in a finally.

/** The four side-effects the chain drives, injected so tests can observe them. */
export interface ReturnToPortDeps {
  /** Portal ad-break seam (already 35s-bounded by safeAdapter). */
  requestAdBreak: () => Promise<void>;
  /** Colyseus `room.leave()` — may reject, or never settle at all. */
  leaveRoom: () => Promise<unknown>;
  /** Full page reload — the teardown. */
  reload: () => void;
  /** Synchronous teardown hygiene, run once on the first activation. */
  onStart?: () => void;
  /** ms — the leave() race window. Defaults to LEAVE_TIMEOUT_MS. */
  leaveTimeoutMs?: number;
}

/**
 * ms — how long the chain waits on `room.leave()` before reloading anyway.
 * Long enough for a healthy socket's leave handshake, short enough that a dead
 * one is indistinguishable from an instant return.
 */
export const LEAVE_TIMEOUT_MS = 1000;

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
 * Build the return-to-port action over its dependencies. The returned function
 * is idempotent (latched) and never throws; calling it always ends in exactly
 * one `reload()`.
 */
export function makeReturnToPort(deps: ReturnToPortDeps): () => void {
  const leaveMs = deps.leaveTimeoutMs ?? LEAVE_TIMEOUT_MS;
  let returning = false;
  return () => {
    if (returning) return; // second activation: the first chain owns the reload
    returning = true;
    // The latch is already set, so a synchronous throw here would escape with
    // no chain behind it and strand the player permanently — swallow it and
    // keep the "always exactly one reload" contract.
    try {
      deps.onStart?.();
    } catch {
      /* teardown hygiene is best-effort; the reload is the real teardown */
    }
    void settle(() => deps.requestAdBreak())
      .then(() => Promise.race([settle(() => deps.leaveRoom()), delay(leaveMs)]))
      .finally(() => deps.reload());
  };
}
