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
//   3. requestAdBreak() — FIRED AND NOT AWAITED. Leaving is never gated on
//      the ad layer by any bound (Eric ruling 2026-08-20). It used to be
//      awaited to completion, trusting a 35s cap two modules away; a 6s cap
//      briefly replaced that. Both were the same mistake at different lengths.
//      Measured on production: 36.8s of a dead button, because the page serves
//      DISPLAY AdSense with no H5 placement API, so no ad callback ever fires.
//      A truncated ad costs an impression; a gated exit costs the player the
//      game.
//   4. leaveRoom() raced against `leaveTimeoutMs` — the fix. `room.leave()`
//      never settles when the socket is already gone (the server disposes the
//      room resultsSeconds after the finish), which used to strand the player
//      on the results screen with no path home. The race guarantees the chain
//      always reaches the reload; a rejection is swallowed the same way.
//   5. reload() — unconditional, in a finally.

/** The four side-effects the chain drives, injected so tests can observe them. */
export interface ReturnToPortDeps {
  /** Portal ad-break seam. FIRED, NEVER AWAITED — see the header. */
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

/**
 * ms — how long the chain waits on the ad break before going home anyway.
 *
 * THIS BOUND BELONGS TO THE CHAIN, not to the ad layer, and that is the point:
 * whatever any adapter does — resolve, reject, or go silent forever — the player
 * who pressed RETURN TO PORT or ABANDON MATCH reaches the home port. The chain
 * cannot inspect the ad layer's state, so it cannot tell "an interstitial is
 * playing" from "the SDK swallowed the request", and between those two it must
 * favour the player: a truncated ad is recoverable, a dead button is not.
 *
 * 6s, chosen against the mechanism rather than by feel: the break is requested
 * with `preloadAdBreaks: 'auto'`, so a fill that is going to happen has its
 * creative in hand and calls `beforeAd` within about a second. Six seconds is
 * generous headroom for an on-demand fetch to START, and it is the outer edge of
 * what reads as a transition rather than a hang. PROPOSED, flagged for Eric: it
 * is the one number in this fix that trades a possible impression against
 * responsiveness, and he owns that trade.
 */

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
    // FIRE THE AD BREAK, DO NOT WAIT ON IT (Eric ruling 2026-08-20). Leaving a
    // match is NEVER gated on the ad layer, by ANY bound: *"the kind of ads that
    // might be truncated shouldn't stop you from leaving the match"*.
    //
    // This supersedes both the original design (await to completion, borrowing a
    // 35s cap two modules away) and the 6s cap that briefly replaced it. Both
    // were the same mistake at different lengths — an ad that misbehaves could
    // still hold a player in a finished match, and Eric measured 36.8s of a dead
    // button on production. A shorter leash is still a leash.
    //
    // Accepted consequence, stated rather than hidden: once the H5 placement API
    // is actually on the page, an interstitial here will be cut off by the
    // reload. That is the ruled trade — a truncated ad costs an impression, a
    // gated exit costs the player the game.
    void settle(() => deps.requestAdBreak());
    void Promise.race([settle(() => deps.leaveRoom()), delay(leaveMs)]).finally(() => deps.reload());
  };
}
