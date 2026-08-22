// THE HOST-SDK CONTAINMENT SEAM. The rest of the client depends ONLY on this
// interface — no game code imports an ad or host SDK directly; only modules
// under client/src/portal/ and client/src/ads/ ever may.
//
// THERE ARE NO PORTALS AND THERE WILL NOT BE (Eric ruling, Epic 7): *"I'm
// controlling my game and servers. no portals. IDGAF what you do. I'm serving
// my own ads."* Hullcracker.io is self-published at its own domain, and the
// CONCRETE IMPLEMENTATION OF THIS INTERFACE IS ADSENSE — `ads/adsAdapter.ts`,
// selected at boot in main.ts when a publisher ID is configured, with
// `nullAdapter.ts` standing in for the unconfigured build. This file's original
// header promised Poki/CrazyGames SDKs "wired for real at Epic 7"; Epic 7 was
// rescoped and that never happened.
//
// THE NAME `PortalAdapter` IS RETAINED DELIBERATELY (AR11) — renaming ratified,
// shipped code to chase a changed destination is churn. Read "portal" here as
// "the one door a third-party SDK may reach the game through", which is exactly
// the job the seam still does: five methods, no vendor knowledge, one wrapper
// (`safeAdapter.ts`) that makes every edge of it unable to break the game.

/**
 * Outbound hooks into the host ad SDK, called at the client's loading and
 * match-lifecycle choke points only (never from per-frame render paths or pure
 * leaf modules). `init()` and `requestAdBreak()` are awaited flow-control
 * points; the rest are notifications.
 *
 * Implementation-side contract: methods should not throw and returned promises
 * should always settle. The game does NOT rely on this — every adapter is
 * wrapped in `safeAdapter()` before use, which swallows throws/rejections and
 * caps `requestAdBreak()` with a timeout, so a misbehaving SDK can never break
 * the game. `loadingProgress` must tolerate any number (clamp to [0, 1], never
 * throw).
 *
 * Game-side (caller) guarantees: `matchStart`/`matchEnd` fire at most once per
 * match, on lifecycle edges only; `loadingProgress` is passed fractions
 * intended to be in [0, 1]; `init()` is awaited once at boot before any other
 * call.
 */
export interface PortalAdapter {
  /** Initialize the host ad SDK. Awaited once at boot, before loading begins. */
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
