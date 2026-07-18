// The seam for web-game portal SDKs (Poki/CrazyGames), wired for real at Epic 7.
// The rest of the client depends ONLY on this interface — no game code imports a
// portal SDK directly; only modules under client/src/portal/ ever may. Today the
// sole implementation is the null adapter (all no-ops), so the game runs
// portal-free with no behavior or timing change.

/**
 * Outbound hooks into a portal SDK, called at the client's loading and
 * match-lifecycle choke points only (never from per-frame render paths or pure
 * leaf modules). `init()` and `requestAdBreak()` are awaited flow-control
 * points; the rest are notifications.
 *
 * Implementation-side contract: methods should not throw and returned promises
 * should always settle. The game does NOT rely on this — every adapter is
 * wrapped in `safeAdapter()` before use, which swallows throws/rejections and
 * caps `requestAdBreak()` with a timeout, so a misbehaving portal can never
 * break the game. `loadingProgress` must tolerate any number (clamp to [0, 1],
 * never throw).
 *
 * Game-side (caller) guarantees: `matchStart`/`matchEnd` fire at most once per
 * match, on lifecycle edges only; `loadingProgress` is passed fractions
 * intended to be in [0, 1]; `init()` is awaited once at boot before any other
 * call.
 */
export interface PortalAdapter {
  /** Initialize the portal SDK. Awaited once at boot, before loading begins. */
  init(): Promise<void>;
  /** Report load progress as a fraction in [0, 1]. */
  loadingProgress(fraction: number): void;
  /** A match went live (fires at most once per match). */
  matchStart(): void;
  /** A match ended / results arrived (fires at most once per match). */
  matchEnd(): void;
  /**
   * Request an interstitial ad break; the returned promise settles when play
   * may resume. Callers proceed on rejection — never strand the player on an ad.
   */
  requestAdBreak(): Promise<void>;
}
