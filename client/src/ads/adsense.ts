// THE ONLY MODULE IN THE CODEBASE PERMITTED TO NAME THE ADSENSE ORIGIN, THE
// PUBLISHER CLIENT ID, OR THE DISPLAY SLOT ID.
//
// This is `portal/`'s ratified containment applied to a THIRD third-party SDK,
// and `analytics/ga.ts`'s discipline copied line for line: the origin is named
// once as a constant, the client ID comes from a build-time `VITE_*` var and is
// NEVER a literal, the whole init sits inside one try/catch, and the started /
// queued latches are SEPARATE so a throw cannot be retried into a double
// initialisation. Nothing outside `client/src/ads/` imports this file, and the
// game reaches an ad break only through `portal/portalAdapter.ts`.
//
// ONE THING IS DELIBERATELY DIFFERENT FROM `ga.ts`, and it is the reason this
// module injects no script element. H5 Games Ads requires the loader in the
// `<head>` of the document that hosts the canvas, and Google's certified CMP —
// the single consent dialog since Story 7.4 — is DELIVERED BY that loader, so it
// has to be parsed before any module of ours runs. The tag is therefore injected
// at BUILD time (`client/src/ads/adsHead.ts`, wired by the `hc-adsense` plugin in
// `client/vite.config.ts`), only when the publisher ID is configured. What is
// left here is the runtime half: the `adsbygoogle` command queue and the
// `adConfig`/`adBreak`/display-slot shims that push into it.
//
// THE BLOCKED CASE IS THE EXPECTED CASE, and it needs no error handler because
// there is no request of ours to fail. With the loader blocked, `adsbygoogle`
// stays a plain `Array`, every push below is inert, and NO CALLBACK EVER FIRES —
// not even `adBreakDone`. That is precisely why `returnToPort` may never be
// gated on an ad callback.
//
// AND IT IS WHY `ready` MEANS "THE SDK ARRIVED", NOT "A PUSH SUCCEEDED" (review
// gate). Pushing into a plain `Array` ALWAYS succeeds, so latching on the push
// latched `ready` true in exactly the case it exists to exclude — and
// `adsAdapter.ts`'s "not ready ⇒ resolve now" fast path, whose whole purpose is
// that nobody pays `portal/safeAdapter.ts`'s 35 s cap, then covered only the
// UNCONFIGURED build and never the BLOCKED one. Arrival is now read from two
// independent positive signals, NEITHER of which is a timer: the `onReady`
// callback the SDK invokes when it drains our `adConfig`, and the queue no
// longer being a plain `Array` (Google's loader replaces `window.adsbygoogle`
// with its own command processor). `safeAdapter`'s cap stays the only timeout in
// the whole layer.
//
// The window/global type is declared LOCALLY and cast at the touch points rather
// than with `declare global`, exactly as `ga.ts` argues: a global augmentation
// would put `adsbygoogle` in scope for every file in `client/src`, which is the
// boundary this module exists to hold.

/**
 * The AdSense tag host. Named once, here, so a grep for the vendor's domain
 * lands in exactly one file. `client/index.html` deliberately contains no
 * reference to it — the build-time injection is the only way this origin is ever
 * contacted, and an unconfigured build never contacts it at all.
 */
export const AD_SCRIPT_SRC = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

/**
 * The class Google's display snippet requires on the `<ins>` element — the
 * loader finds its slots by it. Named here rather than in `ads/resultsAd.ts`
 * for the same reason `AD_SCRIPT_SRC` is: every vendor token this project types
 * out lives in one file.
 */
export const AD_INS_CLASS = 'adsbygoogle';

/**
 * The attribute the loader stamps on a slot once it has an answer: `filled`
 * when an ad was served, `unfilled` when none was. It is the ONLY signal
 * `ads/resultsAd.ts` reveals on — with the script blocked it is never written
 * at all, which is exactly the same "nothing to show" as an unfilled slot.
 */
export const AD_STATUS_ATTR = 'data-ad-status';

/** The Ad Placement API's break types. Story 7.4 uses `next` and nothing else:
 *  the one call site is death → RETURN TO PORT, which is a transition BETWEEN
 *  matches and never an interruption of play (Google's publisher policy bans
 *  full-screen ads "that interrupt the user during periods of continuous game
 *  play"). */
export type AdBreakType = 'preroll' | 'start' | 'pause' | 'next' | 'browse' | 'reward';

/** What `adBreakDone` reports. `breakStatus` is the only field this project
 *  reads, and it is never surfaced to the player. */
export interface AdBreakInfo {
  breakType?: string;
  breakName?: string;
  breakFormat?: string;
  breakStatus?: string;
}

/** One ad-break placement, in Google's own shape. */
export interface AdBreakPlacement {
  type: AdBreakType;
  name?: string;
  /** Fires only when an ad will actually show — the duck's cue. */
  beforeAd?: () => void;
  /** Fires when the ad has finished — the unduck's cue. */
  afterAd?: () => void;
  /** Fires last, ALWAYS when the script is live: filled, unfilled or capped. */
  adBreakDone?: (info: AdBreakInfo) => void;
}

/** The one-shot session config. `preloadAdBreaks` is settable ONCE and has no
 *  effect after the first `adBreak()`, which is why `startAds()` latches. */
export interface AdConfigOptions {
  sound?: 'on' | 'off';
  preloadAdBreaks?: 'on' | 'auto';
  onReady?: () => void;
}

/** What the loader leaves on `window`: a plain `Array` until the remote script
 *  arrives and replaces `push` with its own command processor. Both shapes take
 *  the same `push`, which is the whole point of the shim. */
interface AdsWindow {
  adsbygoogle?: { push(cmd: unknown): unknown };
}

/** True once `startAds()` has been attempted. Module-scoped because there is
 *  exactly one document and one session config; a second `adConfig` push would
 *  contradict the first. */
let started = false;

/** True once the session config was successfully handed to the queue. `started`
 *  latches on ATTEMPT, `queued` on the push having SUCCEEDED — the same
 *  deliberate split `ga.ts` carries. It says NOTHING about the remote script
 *  having arrived; see `sdkArrived` for that. */
let queued = false;

/** True once the SDK invoked the `onReady` we pushed with the session config —
 *  the loader's own statement that it is live and draining our commands. */
let onReadyFired = false;

/**
 * The AdSense publisher client (`ca-pub-…`), from build-time config — NEVER a
 * literal.
 *
 * Same mechanism `VITE_GA_MEASUREMENT_ID` and `VITE_WS_URL` already prove, and
 * the consequence is the point: a fork, a contributor's local `npm run dev`, or
 * any preview build has no ID, so no loader is injected, no `ads.txt` is emitted
 * and the game runs on the null adapter — byte-identical to having no ad layer
 * at all. Read at CALL time so a test can stub the env.
 */
export function adsClientId(): string {
  try {
    const env = import.meta.env as Record<string, unknown> | undefined;
    const raw = env?.VITE_ADSENSE_CLIENT;
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

/** Whether a publisher ID exists at all. No ID ⇒ `main.ts` uses the null
 *  adapter and nothing below is ever reached. */
export function isAdsConfigured(): boolean {
  return adsClientId() !== '';
}

/**
 * The RESULTS display unit's ad-slot id (`data-ad-slot`), from build-time
 * config — NEVER a literal, read at CALL time, exactly like `adsClientId()`.
 *
 * ITS OWN SWITCH, SEPARATE FROM THE PUBLISHER ID, and that separation is the
 * feature. A slot id has to be minted in the AdSense dashboard before it exists
 * at all, so the display unit ships DORMANT under a build that has a publisher
 * ID but no slot — which is precisely the state production is in the day this
 * lands. No slot ⇒ `ads/resultsAd.ts` creates no element, pushes nothing and
 * observes nothing.
 */
export function adsSlotResults(): string {
  try {
    const env = import.meta.env as Record<string, unknown> | undefined;
    const raw = env?.VITE_ADSENSE_SLOT_RESULTS;
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

/**
 * Whether a string is a well-formed AdSense ad-slot id.
 *
 * VALIDATED RATHER THAN TRUSTED, mirroring `adsHead.ts`'s `^ca-pub-\d{16}$`
 * guard and for the same reason: a typo'd env var would otherwise be written
 * verbatim into `data-ad-slot`, and an `<ins>` naming a slot that does not exist
 * is a request Google answers with nothing — indistinguishable, from inside the
 * page, from a legitimately unfilled slot. Slot ids are digit strings; the
 * length band is deliberately loose (Google publishes no format) while still
 * refusing the failure this exists to catch: empty, whitespace, a pasted url, a
 * `ca-pub-` prefix, or a single stray character.
 */
export function isValidAdSlotId(slot: string): boolean {
  return /^\d{6,20}$/.test(slot);
}

/**
 * Hand ONE display slot to the queue — the push that REQUESTS an ad.
 *
 * The lone caller is `ads/resultsAd.ts`, which latches so this runs EXACTLY ONCE
 * PER MATCH however many times the score screen is toggled (ESC from spectate
 * reopens it — amendment 17). That latch is not tidiness: pushing per toggle
 * would mint a fresh impression per keypress, which is the auto-refreshing
 * placement pattern Google suspends accounts over. It lives in the caller rather
 * than here because THIS function is honestly "push a slot", and a second
 * display unit would need its own latch, not a share of this one.
 *
 * Deliberately NOT gated on `isAdsReady()`, unlike `adBreak()`: Google's own
 * display snippet pushes into the array-shaped stub and the loader drains it on
 * arrival, so the push must be able to precede the script. With the loader
 * BLOCKED the push is inert, no `data-ad-status` is ever written, and
 * `resultsAd.ts` therefore reveals nothing — the blocked case costs the player
 * an invisible empty div and no layout at all.
 */
export function pushDisplaySlot(): void {
  if (!isAdsConfigured()) return;
  try {
    const win = globalThis as unknown as AdsWindow;
    queue(win).push({});
  } catch {
    // a hostile shim or a frozen window — the unit simply never fills
  }
}

/**
 * Whether the loader ACTUALLY ARRIVED and is processing our commands.
 *
 * Two positive signals, either of which is sufficient and neither of which is a
 * timer: the SDK called the `onReady` pushed with the session config, or it has
 * replaced `window.adsbygoogle` with its own command processor (the array-shaped
 * stub is ours; anything else is theirs). With the script blocked both stay
 * false forever, which is the whole point — `adsAdapter.ts` reads this at break
 * time and resolves AT ONCE rather than waiting on a callback that will never
 * come.
 */
export function isAdsReady(): boolean {
  if (onReadyFired) return true;
  try {
    return sdkArrived(globalThis as unknown as AdsWindow);
  } catch {
    return false;
  }
}

/** Whether `window.adsbygoogle` is the SDK's command processor rather than the
 *  plain `Array` our own shim plants. */
function sdkArrived(win: AdsWindow): boolean {
  const q = win.adsbygoogle;
  return q !== undefined && !Array.isArray(q);
}

/** The command queue, created if the loader has not already created it. Google's
 *  own snippet is `window.adsbygoogle = window.adsbygoogle || []`, and the
 *  remote script drains whatever is already in it on arrival. */
function queue(win: AdsWindow): { push(cmd: unknown): unknown } {
  win.adsbygoogle ??= [] as unknown as { push(cmd: unknown): unknown };
  return win.adsbygoogle;
}

/**
 * Bring the ad layer up and apply the one-shot session config. Returns whether
 * the config was handed to the queue — NOT whether the SDK is live (`isAdsReady`
 * is the only answer to that).
 *
 * `sound` reports the mute state AS OF BOOT so Google can pick an ad whose audio
 * matches the game's; `preloadAdBreaks: 'auto'` lets the SDK fetch ahead of the
 * break, and is settable only once — hence the latch.
 *
 * The pushed config always carries an `onReady` of ours, wrapping any the caller
 * supplied: it is the arrival signal `isAdsReady` latches on, and with the
 * loader blocked it simply never fires.
 */
export function startAds(config: AdConfigOptions): boolean {
  if (!isAdsConfigured()) return false;
  if (started) return queued;
  started = true;
  try {
    const win = globalThis as unknown as AdsWindow;
    queue(win).push({ ...config, onReady: () => markReady(config.onReady) });
    queued = true;
  } catch {
    // a hostile shim, a frozen window — ads are simply off for this session and
    // nothing above the seam ever learns of it
    queued = false;
  }
  return queued;
}

/** The SDK's arrival callback. Latches first, then forwards — a throwing caller
 *  hook must not cost us the signal. */
function markReady(inner: (() => void) | undefined): void {
  onReadyFired = true;
  try {
    inner?.();
  } catch {
    // never let an ad callback reach the render loop
  }
}

/**
 * Request an ad break. Verbatim in behaviour to Google's documented shim
 * (`adBreak = adConfig = function(o) { adsbygoogle.push(o); }`) — but only once
 * the SDK has actually arrived.
 *
 * THE GUARD IS WHAT MAKES THE BLOCKED CASE FREE: with the loader blocked nothing
 * is pushed, so the caller's "not ready" branch answers synchronously instead of
 * waiting on a callback that can never run.
 */
export function adBreak(placement: AdBreakPlacement): void {
  if (!isAdsReady()) return;
  try {
    const win = globalThis as unknown as AdsWindow;
    queue(win).push(placement);
  } catch {
    // never let an ad reach the render loop
  }
}

/** Test-only reset of the two latches and the global the shim plants. Mirrors
 *  `__resetGaForTests()`. */
export function __resetAdsForTests(): void {
  started = false;
  queued = false;
  onReadyFired = false;
  const win = globalThis as unknown as AdsWindow;
  delete win.adsbygoogle;
}
