// THE ANALYTICS SEAM — the only analytics surface game code may import.
//
// `portal/portalAdapter.ts` is this project's ratified answer to "a third-party
// SDK must not reach into game code", and this is the same shape: one interface
// the game calls, one module (`ga.ts`) that owns the vendor, and every method
// unconditionally safe to call fire-and-forget.
//
// THE RULE CALLERS MUST NOT BREAK: **never branch on consent state at a call
// site.** `main.ts` and `home.ts` call `analytics.home()` / `.modePick()` /
// `.matchStart()` / `.matchEnd()` / `.requeue()` at the ruled funnel moments and
// stop thinking about it. Whether the event is sent or dropped is this module's
// problem — a caller that asks "have they consented?" is a second copy of the
// decision, and the second copy is the one that drifts.
//
// STORY 7.4 MOVED THIS LAYER TO CONSENT MODE ADVANCED. Google's own certified
// CMP is now the single consent dialog (it is delivered by the ad script, so it
// cannot sit behind a gate of ours), the self-built consent card is deleted, and
// the tag is therefore built at boot for everyone. The player's decision travels
// as consent SIGNALS, never as the presence or absence of a script.
//
// THE FUNNEL IS FIVE EVENTS AND NOTHING ELSE (NFR19). No callsign, no ship
// class, no kills, no placement, no room id, no match id, no gameplay state,
// ever. The single parameter that ships anywhere is `mode` on `mode_pick`.

import {
  gpcDenied,
  loadConsent,
  saveConsent,
  consentDefaults,
  consentRegionDefaults,
  consentUpdate,
  type ConsentChoice,
  type ConsentState,
} from './consent.js';
import { sendGaBeaconEvent, sendGaConsentUpdate, sendGaEvent, startGa } from './ga.js';

export type { ConsentChoice, ConsentState } from './consent.js';
export { CONSENT_KEY } from './consent.js';

/** The mode a player picked on home. The ONLY parameter value that ever leaves
 *  this client, and it is a closed set of two literals by design — an open
 *  string here is how a callsign eventually ends up in an analytics property. */
export type FunnelMode = 'standard' | 'soloVsAi';

/**
 * The five funnel event names, in journey order. Exported so the test suite can
 * pin the set rather than re-typing it, and so a sixth event has to be added
 * HERE — visibly, against NFR19 — rather than sprinkled at a call site.
 */
export const FUNNEL_EVENTS = Object.freeze({
  home: 'home',
  modePick: 'mode_pick',
  matchStart: 'match_start',
  matchEnd: 'match_end',
  requeue: 'requeue',
} as const);

// THE PRE-CONSENT QUEUE IS RETIRED (Story 7.4, Eric rulings 2026-08-19).
//
// It existed for exactly one reason: under Consent Mode BASIC no tag existed
// until an explicit Accept, so `home` — which fires before the player answers —
// had to be held or the first funnel step was structurally unmeasurable. Under
// ADVANCED the tag is built at boot for everyone, so there is no undecided
// window left to hold anything across, and `dataLayer` already buffers every
// command until the remote script arrives and drains it. Nothing is lost.
//
// Retired rather than adapted, in the cycle-69 grey-NO-DATA style: a queue that
// can never fill is a knob a later reader has to reason about for nothing.

/** One event on its way to the vendor. */
interface FunnelEvent {
  name: string;
  params?: Record<string, unknown>;
  beacon?: true;
}

/** The game-facing surface. Every method is void, synchronous and no-throw. */
export interface Analytics {
  /** Build the tag and apply any stored local override. Called once at boot,
   *  before any funnel call. Idempotent. */
  boot(): void;
  /** The LOCAL analytics override, for the settings PRIVACY row. `undecided`
   *  means the player has set none — the CMP and the region defaults govern. */
  consentState(): ConsentState;
  /** Settings ANALYTICS → ON: persist and send a granting consent update. */
  grantConsent(): void;
  /** Settings ANALYTICS → OFF: persist, send a denying consent update, and stop
   *  dispatching funnel events for the rest of the session. */
  denyConsent(): void;

  /** Funnel 1 — the player is standing in port. */
  home(): void;
  /** Funnel 2 — a mode button was pressed and the press actually deploys. */
  modePick(mode: FunnelMode): void;
  /** Funnel 3 — room joined and welcome received (R4), once per match. */
  matchStart(): void;
  /** Funnel 4 — this player's own exit from play (R5), latched once per match. */
  matchEnd(): void;
  /** Funnel 5 — RETURN TO PORT. Sent by beacon: a `location.reload()` follows
   *  immediately and would kill a normal request. */
  requeue(): void;
}

/** Hand one event to the vendor. The single site that knows a beacon event is
 *  sent differently. */
function emit(ev: FunnelEvent): void {
  if (ev.beacon) sendGaBeaconEvent(ev.name);
  else sendGaEvent(ev.name, ev.params);
}

/** Every public method routes through here. A throw anywhere in the analytics
 *  graph — a frozen `globalThis`, a hostile `localStorage` shim, a vendor script
 *  that redefined `gtag` into something that raises — is swallowed at the
 *  boundary, exactly as `portal/safeAdapter.ts` does it. Measurement is never
 *  worth a frame. */
function guard(call: () => void): void {
  try {
    call();
  } catch {
    /* analytics must never break the game */
  }
}

function createAnalytics(): Analytics {
  /** The LOCAL analytics override, `undecided` until `boot()` reads storage.
   *  Held in memory so the settings row and the dispatch path agree without
   *  re-reading `localStorage` per event. */
  let state: ConsentState = 'undecided';
  let booted = false;

  /**
   * Push through to GA, or drop it. The one place the tri-state is consulted.
   *
   * ONLY AN EXPLICIT LOCAL DENIAL SUPPRESSES (Story 7.4). `undecided` now means
   * "no local override", not "an unanswered question", so it dispatches — which
   * is the honest reading under Advanced mode: the global default grants
   * analytics, so a non-EEA visitor IS being measured, while an EEA visitor's
   * region default denies storage until Google's CMP says otherwise. What a hit
   * under a denied signal becomes (a cookieless ping) is Google's rule to apply,
   * not ours to re-implement here — a second copy is the copy that drifts.
   */
  function dispatch(ev: FunnelEvent): void {
    if (state === 'denied') return;
    emit(ev);
  }

  /**
   * Build the tag. Idempotent — `startGa` latches on its first attempt, and is
   * a no-op with no measurement ID.
   *
   * BOTH consent defaults ride it, REGION-SCOPED FIRST then global, and NO
   * update: an unconditional update here would override the EEA/UK/CH denial
   * before the CMP had any chance to ask. See `ga.ts`'s `startGa` for the full
   * argument.
   *
   * The order matches `ads/adsHead.ts`'s injected block exactly. Google resolves
   * a `default` by SPECIFICITY rather than by order, so both orderings are
   * correct — but the two blocks are two statements of one contract, and two
   * statements that differ are how a later reader concludes one of them is
   * wrong.
   */
  function activate(): void {
    startGa([consentRegionDefaults(), consentDefaults()]);
  }

  function settle(choice: ConsentChoice): void {
    // GPC OUTRANKS THE ROW (Eric ruling 2026-08-27). The player's press is still
    // PERSISTED — turning the browser signal off must give them back the choice
    // they actually made — but it does not lift the denial for this session, and
    // `consentUpdate` below denies all four signals rather than carrying the
    // grant. `loadConsent()` applies the same rule on the way in, so the two
    // entry points into `state` agree by construction.
    state = gpcDenied() ? 'denied' : choice;
    saveConsent(choice);
    // The tag is normally already up — `boot()` builds it — but a settings press
    // can reach here first after a failed boot, and `activate` is cheap and
    // idempotent. An update into a tag that was never built is a no-op.
    activate();
    sendGaConsentUpdate(consentUpdate(choice));
  }

  return {
    boot: () =>
      guard(() => {
        if (booted) return;
        booted = true;
        state = loadConsent();
        // ALWAYS ACTIVATE (Story 7.4). There is no pre-consent window on this
        // page any more, so withholding the tag would withhold it forever from
        // every visitor Google's CMP never asks.
        activate();
        // A stored choice is re-asserted AFTER activation, in BOTH directions:
        // it is an update, and an update is only meaningful once the defaults
        // are in the dataLayer ahead of it.
        //
        // BOTH, because `settle()` sends both and every RETURN TO PORT ends in a
        // `location.reload()`. Re-sending only the denial meant a visitor who
        // turned ANALYTICS ON got it for that page life alone and then silently
        // reverted to the region default forever, with the settings row still
        // reading ON — while the privacy policy says the stored choice overrides
        // the region default. `undecided` still sends nothing: no local override
        // means the defaults and the CMP govern, which is the whole design.
        if (state !== 'undecided') sendGaConsentUpdate(consentUpdate(state));
      }),

    // `loadConsent()` has its own fail-open catch, so no guard is needed here —
    // reading before boot() is the honest answer rather than a stale default.
    consentState: () => (booted ? state : loadConsent()),

    grantConsent: () => guard(() => settle('granted')),
    denyConsent: () => guard(() => settle('denied')),

    home: () => guard(() => dispatch({ name: FUNNEL_EVENTS.home })),
    modePick: (mode) => guard(() => dispatch({ name: FUNNEL_EVENTS.modePick, params: { mode } })),
    matchStart: () => guard(() => dispatch({ name: FUNNEL_EVENTS.matchStart })),
    matchEnd: () => guard(() => dispatch({ name: FUNNEL_EVENTS.matchEnd })),
    requeue: () => guard(() => dispatch({ name: FUNNEL_EVENTS.requeue, beacon: true })),
  };
}

/**
 * The process-wide seam. A singleton because there is one document, one GA
 * property and one consent record — a second instance would double-count.
 * `createAnalytics` stays exported for the suite, which needs a fresh state
 * machine per case.
 */
export const analytics: Analytics = createAnalytics();

/** Test-only: a fresh, unbooted seam. Pair with `__resetGaForTests()`. */
export function __createAnalyticsForTests(): Analytics {
  return createAnalytics();
}
