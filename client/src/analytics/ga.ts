// THE ONLY MODULE IN THE CODEBASE PERMITTED TO NAME `gtag` OR `dataLayer`.
//
// This is `client/src/portal/`'s ratified shape applied to a second third-party
// SDK: one module owns the vendor, one seam (`analytics/index.ts`) owns the
// game-facing calls, and NOTHING else imports this file. The failure mode is
// identical to a portal SDK's — an ad blocker, a blocked domain, a CSP, a thrown
// initialiser — and the answer is identical too: swallow and continue, exactly
// as `portal/safeAdapter.ts` does. Analytics failing is not an event worth one
// dropped frame.
//
// The window/global type is declared LOCALLY and cast at the two touch points
// rather than with `declare global`. A global augmentation would put `gtag` and
// `dataLayer` in scope for every file in `client/src`, which is precisely the
// boundary this module exists to hold.

import type { ConsentAnalyticsUpdate, ConsentDefaultPayload } from './consent.js';
// THE MARKER ONLY — and from a LEAF module that imports nothing, not from the ad
// layer. `ads/adsHead.ts` is the pure build-time transform that writes the
// consent defaults into the page head when a publisher ID is configured; this
// module has to know whether that happened, and one shared constant is the
// alternative to typing the same global's name into two files (the desync class
// this project exists to prevent). Importing it from `ads/adsHead.js` — as this
// did — inverted the layering: the module documented as the only one permitted
// to name gtag depended on the ad layer, and through it on the vendor origin,
// for a single string.
import { CONSENT_DEFAULTS_MARKER } from './consentMarker.js';

/**
 * The tag host. Named once, here, so a grep for the vendor's domain lands in
 * exactly one file. The shipped `index.html` deliberately contains no reference
 * to it at all: the script element below is the ONLY way this origin is ever
 * contacted. Since Story 7.4 it is contacted at boot rather than after an
 * Accept — Consent Mode ADVANCED — and the consent SIGNALS, not the script's
 * existence, are what carry the player's decision.
 */
export const GA_SCRIPT_SRC = 'https://www.googletagmanager.com/gtag/js';


type GtagArg = string | Date | Record<string, unknown>;
type GtagFn = (...args: GtagArg[]) => void;

interface GaWindow {
  dataLayer?: unknown[];
  gtag?: GtagFn;
}

/** True once `startGa()` has built the tag. Module-scoped rather than
 *  per-instance because there is exactly one document and one GA property; a
 *  second injection would double-count every event. */
let started = false;

/** True once the whole init sequence completed without throwing. `started`
 *  latches on ATTEMPT (so a throw cannot be retried into a double injection);
 *  `ready` latches on SUCCESS (so events are not pushed into a half-built
 *  dataLayer). The two are deliberately separate. */
let ready = false;

/**
 * The GA4 measurement ID, from build-time config — NEVER a literal.
 *
 * Same mechanism `VITE_WS_URL` already proves in `net/connection.ts`. The
 * consequence is the point: a fork, a contributor's local `npm run dev`, or a
 * preview build with no `.env` has no ID, so this whole layer is inert and can
 * never report into Eric's property. Read at CALL time, not at module load, so
 * a test can stub the env and so a build that folds the constant still works.
 */
export function measurementId(): string {
  try {
    const env = import.meta.env as Record<string, unknown> | undefined;
    const raw = env?.VITE_GA_MEASUREMENT_ID;
    return typeof raw === 'string' ? raw.trim() : '';
  } catch {
    return '';
  }
}

/** Whether an ID exists at all. No ID ⇒ every function below is a no-op, and the
 *  settings PRIVACY row still works and still records the player's choice. */
export function isGaConfigured(): boolean {
  return measurementId() !== '';
}

/** Whether the tag has been built and is accepting events. */
export function isGaReady(): boolean {
  return ready;
}

/** The `dataLayer` + `gtag` shim, verbatim in behaviour to Google's snippet:
 *  `gtag` pushes its own `arguments` object (NOT a spread array — gtag.js reads
 *  the arguments object's shape), and works before the remote script arrives
 *  because the remote script drains the same queue on load. */
function bootstrapDataLayer(win: GaWindow): GtagFn {
  win.dataLayer = win.dataLayer ?? [];
  const layer = win.dataLayer;
  const gtag: GtagFn = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  win.gtag = gtag;
  return gtag;
}

/** Append the remote tag. `onerror` is swallowed rather than left to bubble to
 *  `window.onerror`: a blocked domain is the EXPECTED case for a meaningful
 *  slice of players, not an exception worth reporting. */
function injectTag(id: string): void {
  const el = document.createElement('script');
  el.async = true;
  el.src = `${GA_SCRIPT_SRC}?id=${encodeURIComponent(id)}`;
  el.setAttribute('data-hc-analytics', 'ga4');
  el.onerror = () => {
    /* blocked domain / offline — the game does not care */
  };
  document.head.appendChild(el);
}

/**
 * Build the tag. Since Story 7.4 this runs at BOOT for everyone (Consent Mode
 * ADVANCED — Google's CMP is delivered by the ad script, so there is no
 * pre-consent window left on this page). Returns whether the tag is live.
 *
 * IT NO LONGER SENDS AN UPDATE, and that omission is load-bearing. Under Basic
 * mode the tag was built only after a grant, so an unconditional granting
 * update was correct by construction. Under Advanced it is built for an
 * undecided EEA visitor too, and an update here would OVERRIDE the region-scoped
 * denial that is the only thing protecting them. Updates now arrive from exactly
 * two places, both of them decisions: Google's CMP, and `sendGaConsentUpdate`
 * below carrying the settings row's local analytics override.
 *
 * ORDER IS THE CONTRACT, and it is Google's, not ours: the consent DEFAULTS must
 * be in the dataLayer before `config`, or the tag briefly runs with unknown
 * signals. The remote script is appended last and drains the queue on arrival,
 * so every command above is already waiting for it.
 *
 * `send_page_view: false` IS A DELIBERATE NFR19 DECISION, not an oversight.
 * GA4's automatic page_view would be a SIXTH event on a funnel ruled to be
 * exactly five, and it would double-count `home`, which is this game's own
 * page-view moment. `allow_google_signals: false` is kept as an INDEPENDENT
 * assertion rather than a consequence: 7.4's global default grants the ad
 * signals for AdSense's sake, and this line says the ANALYTICS property still
 * builds no cross-device advertising identifier, true even if the property's UI
 * is toggled later.
 */
/**
 * Did the PAGE ITSELF already state the consent defaults?
 *
 * Since Story 7.4 an ads-configured build injects `gtag('consent','default',…)`
 * into `<head>`, ahead of `adsbygoogle.js`, because Google's CMP is delivered by
 * that loader and gtag.js processes `dataLayer` IN ORDER — a `default` arriving
 * behind the CMP's `update` would be processed second and could reset a returning
 * EEA visitor's granted consent back to denied.
 *
 * So when the marker is present the defaults are already first in the queue and
 * this module must not restate them. When it is ABSENT — an unconfigured build,
 * `npm run dev`, or a fork with a GA ID but no publisher ID — nothing else states
 * them, so `startGa` keeps sending them exactly as it did before and an ads-less
 * build still protects EEA visitors. One statement per page, either way.
 */
function defaultsAlreadyInPage(): boolean {
  try {
    return (globalThis as unknown as Record<string, unknown>)[CONSENT_DEFAULTS_MARKER] === true;
  } catch {
    return false;
  }
}

export function startGa(defaults: readonly ConsentDefaultPayload[]): boolean {
  const id = measurementId();
  if (id === '') return false;
  if (started) return ready;
  started = true;
  try {
    const win = globalThis as unknown as GaWindow;
    const gtag = bootstrapDataLayer(win);
    if (!defaultsAlreadyInPage()) for (const d of defaults) gtag('consent', 'default', { ...d });
    gtag('js', new Date());
    // `transport_type` rides the CONFIG, not the event (review gate). It was
    // attached to `requeue`'s parameter bag first, which made NFR19's "the only
    // parameter that ships is `mode`" true only with a footnote. gtag.js accepts
    // it here and applies it to every hit, so the parameter bag stays literally
    // empty for four of the five events and holds nothing but `mode` for the
    // fifth. Beacon transport matters because `returnToPort` ends in a real
    // `location.reload()` that would kill an in-flight XHR.
    gtag('config', id, {
      send_page_view: false,
      allow_google_signals: false,
      ...(hasBeacon() ? { transport_type: 'beacon' } : {}),
    });
    injectTag(id);
    ready = true;
  } catch {
    // a hostile shim, a frozen window, a document with no head — analytics is
    // simply off for this session and nothing above the seam ever learns of it
    ready = false;
  }
  return ready;
}

/**
 * Send a consent UPDATE to a live tag.
 *
 * PARTIAL BY DESIGN (Story 7.4): the payload names `analytics_storage` alone,
 * because the three ad signals belong to Google's CMP now and a `consent update`
 * leaves every signal it omits exactly where the CMP and the defaults left it.
 * Silently drops if the tag was never built, which is the inert-build case.
 */
export function sendGaConsentUpdate(update: ConsentAnalyticsUpdate): void {
  if (!ready) return;
  try {
    const win = globalThis as unknown as GaWindow;
    win.gtag?.('consent', 'update', { ...update });
  } catch {
    // never let a consent signal reach the render loop
  }
}

/** Push a funnel event. Silently drops if the tag was never built — the
 *  backstop for the blocked and inert-build cases. Callers never branch on it. */
export function sendGaEvent(name: string, params?: Record<string, unknown>): void {
  if (!ready) return;
  try {
    const win = globalThis as unknown as GaWindow;
    win.gtag?.('event', name, params ?? {});
  } catch {
    // never let a measurement reach the render loop
  }
}

/**
 * Whether this browser can actually do beacon transport. Checked rather than
 * assumed because `requeue` is the one event that MUST survive a navigation:
 * asking gtag.js for a transport the browser lacks buys nothing, so on a
 * browser without `sendBeacon` the event is sent plainly and is simply allowed
 * to lose the race with the reload.
 */
function hasBeacon(): boolean {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function';
  } catch {
    return false;
  }
}

/**
 * Push an event that must leave BEFORE a `location.reload()`.
 *
 * `returnToPort.ts` ends in a real page navigation, which kills an in-flight
 * XHR — so `requeue` would be lost on most attempts without this. GA4 honours
 * `transport_type: 'beacon'`, which hands the hit to `navigator.sendBeacon` and
 * lets the browser deliver it after the document is gone.
 *
 * `transport_type` is a TRANSPORT DIRECTIVE, not payload: it tells gtag.js how
 * to send, and carries nothing about the player. NFR19's "the only parameter
 * that ships is `mode`" is about measured data, and this is not measured data.
 */
export function sendGaBeaconEvent(name: string): void {
  // Beacon transport is now configured once on the tag (see `startGa`), so this
  // is an ordinary send. The separate entry point survives because the CALLER's
  // intent — "this one has to outlive a navigation" — is worth keeping legible
  // at the call site, and because a future transport that genuinely needs a
  // per-event directive has an obvious home.
  sendGaEvent(name);
}

/** Test-only reset of this module's two latches and the globals it plants.
 *  Mirrors `connection.ts`'s `__resetSessionColorPrefForTests`. */
export function __resetGaForTests(): void {
  started = false;
  ready = false;
  const win = globalThis as unknown as GaWindow;
  delete win.dataLayer;
  delete win.gtag;
}
