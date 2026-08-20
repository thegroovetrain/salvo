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
//   3. requestAdBreak() — raced against `adBreakTimeoutMs`. IT USED TO BE
//      AWAITED TO COMPLETION on the argument that the adapter is always
//      safeAdapter-wrapped and therefore already capped at 35s, and that a
//      shorter cap here would cut a real interstitial off mid-play. Both halves
//      of that argument were wrong in practice (playtest 2026-08-20): the cap
//      held, so nobody was stranded FOREVER, but 35s of a dead button is
//      indistinguishable from broken — Eric: *"return to port no longer works
//      at all"* — and the interstitial being protected did not exist, because
//      the page's ad layer had no Ad Placement API to show one with. THE RULE
//      NOW: a player who has asked to leave is never held by the ad layer, and
//      this chain owns that guarantee itself rather than borrowing it from a cap
//      two modules away. `ads/adsense.ts` separately stopped claiming readiness
//      for a display-only loader, so a break that can never fill is now declined
//      instantly and this bound is a pure backstop.
//   4. leaveRoom() raced against `leaveTimeoutMs` — the fix. `room.leave()`
//      never settles when the socket is already gone (the server disposes the
//      room resultsSeconds after the finish), which used to strand the player
//      on the results screen with no path home. The race guarantees the chain
//      always reaches the reload; a rejection is swallowed the same way.
//   5. reload() — unconditional, in a finally.

/** The four side-effects the chain drives, injected so tests can observe them. */
export interface ReturnToPortDeps {
  /** Portal ad-break seam. May resolve, reject, or NEVER SETTLE — the chain
   *  bounds it itself (`adBreakTimeoutMs`) rather than trusting any wrapper. */
  requestAdBreak: () => Promise<void>;
  /** Colyseus `room.leave()` — may reject, or never settle at all. */
  leaveRoom: () => Promise<unknown>;
  /** Full page reload — the teardown. */
  reload: () => void;
  /** Synchronous teardown hygiene, run once on the first activation. */
  onStart?: () => void;
  /** ms — the leave() race window. Defaults to LEAVE_TIMEOUT_MS. */
  leaveTimeoutMs?: number;
  /** ms — the ad-break race window. Defaults to AD_BREAK_TIMEOUT_MS. */
  adBreakTimeoutMs?: number;
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
export const AD_BREAK_TIMEOUT_MS = 6000;

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
  const adMs = deps.adBreakTimeoutMs ?? AD_BREAK_TIMEOUT_MS;
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
    void Promise.race([settle(() => deps.requestAdBreak()), delay(adMs)])
      .then(() => Promise.race([settle(() => deps.leaveRoom()), delay(leaveMs)]))
      .finally(() => deps.reload());
  };
}
