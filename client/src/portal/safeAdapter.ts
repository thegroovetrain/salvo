import type { PortalAdapter } from './portalAdapter.js';

/**
 * Backstop for a real adapter's requestAdBreak() hanging: longer than any
 * standard interstitial (~30s max), after which the game proceeds without it —
 * the player is never stranded on an ad.
 */
const AD_BREAK_TIMEOUT_MS = 35_000;

function swallowSync(call: () => void): void {
  try {
    call();
  } catch {
    /* a portal must never break the game */
  }
}

async function swallowAsync(call: () => Promise<void>): Promise<void> {
  try {
    await call();
  } catch {
    /* a portal must never break the game */
  }
}

function timeout(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps any PortalAdapter so the game's side of the seam is unconditionally
 * safe: synchronous throws are swallowed, rejected promises resolve, and
 * requestAdBreak() is capped by a timeout so even a hanging implementation
 * cannot strand the player. Call sites may treat every method as
 * fire-and-forget; only the wrapped adapter is ever handed to the game.
 */
export function safeAdapter(inner: PortalAdapter, adBreakTimeoutMs: number = AD_BREAK_TIMEOUT_MS): PortalAdapter {
  return {
    init: () => swallowAsync(() => inner.init()),
    loadingProgress: (fraction) => swallowSync(() => inner.loadingProgress(fraction)),
    matchStart: () => swallowSync(() => inner.matchStart()),
    matchEnd: () => swallowSync(() => inner.matchEnd()),
    requestAdBreak: () => Promise.race([swallowAsync(() => inner.requestAdBreak()), timeout(adBreakTimeoutMs)]),
  };
}
