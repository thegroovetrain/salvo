// THE ADSENSE INTERSTITIAL, behind the Epic 0 portal seam.
//
// `portal/portalAdapter.ts` has carried a null implementation since Epic 0
// waiting for exactly this: the game calls five methods and knows nothing about
// a vendor, and the ONE call site of `requestAdBreak()` is
// `app/returnToPort.ts` — death → RETURN TO PORT. There is no ad surface of any
// kind inside a live match, and there is no display unit anywhere on the site
// (Eric ruling R2, amendment 16).
//
// FOUR OF THE FIVE METHODS ARE NO-OPS AND THAT IS THE DESIGN, not an omission.
// `loadingProgress` and `matchStart`/`matchEnd` exist for a PORTAL host (Poki /
// CrazyGames) that wants to know when the game is playable; AdSense H5 has no
// such hook and this story ships no display unit for them to drive.
//
// THE CONTRACT THIS FILE MUST NOT BREAK: there is deliberately NO TIMEOUT in
// here. A second one would be a second copy of a rule `portal/safeAdapter.ts`
// already owns (its 35 s `Promise.race` cap), and the second copy is the one
// that drifts.
//
// WHICH IS EXACTLY WHY THE BLOCKED CASE MUST NEVER REACH THAT CAP (review gate).
// With the loader blocked — an ad blocker, a corporate proxy, an offline tab —
// `adsbygoogle` stays the plain `Array` our shim planted and not one callback
// fires, not even `adBreakDone`; making every return to port pay 35 s of frozen
// results screen for that is not a backstop, it is the bug. `isAdsReady()` now
// answers "did the SDK actually arrive", so the blocked case is known
// SYNCHRONOUSLY and resolves at once. The cap survives for what it was written
// for: an SDK that arrived and then went quiet mid-break.
//
// EVERY EDGE IS WRAPPED SO A THROW CANNOT EAT THE RESOLVE. `unduck()` writes a
// live `GainNode`, which throws on a closed AudioContext (a tab backgrounded
// through the break) — and a throw out of `adBreakDone` would escape into
// Google's own caller with `resolve()` never reached, which is the 35 s hang by
// another road.

import type { PortalAdapter } from '../portal/portalAdapter.js';
import { adBreak, isAdsReady, startAds, type AdBreakInfo } from './adsense.js';

/**
 * The placement name reported to Google. It names the MOMENT, not the screen,
 * because that moment is the whole policy argument: a `next` break at the end of
 * a match is a natural transition point, which is what makes it a permitted
 * full-screen placement.
 */
export const AD_BREAK_NAME = 'return-to-port';

/**
 * The last `breakStatus` Google reported (`adBreakDone`'s only field this
 * project reads): `viewed`, `dismissed`, `noAdPreloaded`, `frequencyCapped`,
 * `notReady`, `timeout`, `error`, `other`.
 *
 * NEVER SURFACED TO A PLAYER. Someone who gets no fill must not be told, and
 * must not wait: every status resolves the promise identically and the chain
 * proceeds. Its ONE consumer is `reportBreakStatus` below, which prints it once
 * per break under `import.meta.env.DEV` and is dead-stripped from the shipped
 * bundle — "did this break ever fill?" is the first question anyone debugging an
 * empty ad account asks, and a recorded value with no reader at all is a dead
 * knob by this project's own rule.
 */
let lastStatus: string | null = null;

/** The last recorded `breakStatus`, or `null` if no break has completed. */
export function lastBreakStatus(): string | null {
  return lastStatus;
}

/**
 * The recorded status' one consumer: a single DEV-only line per completed break.
 *
 * `import.meta.env.DEV` is a build-time constant, so this whole call folds away
 * in the shipped artifact — production stays silent, exactly as a layer that
 * must never speak to a player should.
 */
function reportBreakStatus(): void {
  if (!import.meta.env.DEV) return;
  console.info(`[ads] break ${AD_BREAK_NAME} finished:`, lastBreakStatus());
}

/**
 * What the adapter needs from the rest of the client, passed as callbacks so
 * `ads/` never imports the audio module and the audio module never imports
 * `ads/`. The seam is deliberately this thin: two edges and one query.
 */
export interface AdsAdapterHooks {
  /** The mute state AS OF BOOT, for `adConfig({ sound })`. Read exactly once,
   *  in `init()`: `adConfig` is a one-shot session config and
   *  `preloadAdBreaks` makes it un-resettable for the session, so a player who
   *  mutes later does not move it. */
  muted(): boolean;
  /** An ad is about to show — duck the game audio. TRANSIENT: it must not write
   *  the settings store (see `audio/context.ts`'s `duck`). */
  onBreakStart(): void;
  /** The ad is over — restore the pre-break audio state. */
  onBreakEnd(): void;
}

/**
 * The mute state for `adConfig`, fail-safe. A throwing hook must degrade to
 * "sound on" — the honest default for a game that is not muted — never to
 * `init()` throwing, which `safeAdapter` would swallow into having no ad layer
 * at all, with nothing anywhere to say so.
 */
function soundSetting(hooks: AdsAdapterHooks): 'on' | 'off' {
  try {
    return hooks.muted() ? 'off' : 'on';
  } catch {
    return 'on';
  }
}

/**
 * The real `PortalAdapter`. Constructed at the single site in `main.ts`, and
 * only when a publisher ID is configured — otherwise the null adapter stands.
 */
export function createAdsAdapter(hooks: AdsAdapterHooks): PortalAdapter {
  // Local to the adapter so the two edges can never double-fire: `beforeAd` is
  // skipped entirely on an unfilled break, and `adBreakDone` unducks defensively
  // in case a break ends without its `afterAd`.
  let ducked = false;

  function duck(): void {
    if (ducked) return;
    ducked = true;
    hooks.onBreakStart();
  }

  function unduck(): void {
    if (!ducked) return;
    ducked = false;
    hooks.onBreakEnd();
  }

  function done(info: AdBreakInfo, resolve: () => void): void {
    lastStatus = typeof info?.breakStatus === 'string' ? info.breakStatus : 'other';
    reportBreakStatus();
    // RESOLVE IS UNCONDITIONAL. `unduck()` reaches into the audio graph and can
    // throw on a context the browser closed while the tab was backgrounded; the
    // throw would otherwise escape into Google's `adBreakDone` and strand the
    // player on safeAdapter's cap for the sake of a gain node.
    try {
      unduck();
    } catch {
      // SWALLOWED, not merely survived. `finally` alone guarantees the resolve
      // but still lets the exception continue into Google's `adBreakDone`
      // caller — third-party code we neither control nor want to reason about.
      // The audio is already restored on every path the player can hear.
    } finally {
      resolve();
    }
  }

  /** The duck, on the edge Google calls. Same hazard as the unduck and no
   *  resolve to protect — a throw here would simply escape into the SDK. */
  function safeDuck(): void {
    try {
      duck();
    } catch {
      // the ad plays over the game audio; that is strictly better than a throw
    }
  }

  return {
    init: () => {
      // `sound` reports the mute state as it stands at boot; `preloadAdBreaks`
      // is settable ONCE per session, which is why `startAds` latches.
      startAds({ sound: soundSetting(hooks), preloadAdBreaks: 'auto' });
      return Promise.resolve();
    },
    loadingProgress: () => undefined,
    matchStart: () => undefined,
    matchEnd: () => undefined,
    requestAdBreak: () =>
      new Promise<void>((resolve) => {
        // An SDK that never arrived can never call anything back — whether it
        // was never configured or was blocked on the wire — so resolve NOW
        // rather than making every return to port pay safeAdapter's 35 s cap.
        // This is not a timeout and not a race: the answer is already known
        // synchronously, from the SDK's own arrival signals (`isAdsReady`).
        if (!isAdsReady()) return resolve();
        adBreak({
          type: 'next',
          name: AD_BREAK_NAME,
          beforeAd: safeDuck,
          afterAd: unduck,
          adBreakDone: (info) => done(info, resolve),
        });
      }),
  };
}

/** Test-only: clear the recorded status. */
export function __resetAdsAdapterForTests(): void {
  lastStatus = null;
}
