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
// stop thinking about it. Whether the event is sent, queued, or dropped is this
// module's problem — a caller that asks "have they consented?" is a second copy
// of the decision, and the second copy is the one that drifts.
//
// THE FUNNEL IS FIVE EVENTS AND NOTHING ELSE (NFR19). No callsign, no ship
// class, no kills, no placement, no room id, no match id, no gameplay state,
// ever. The single parameter that ships anywhere is `mode` on `mode_pick`.

import {
  loadConsent,
  saveConsent,
  consentDefaults,
  consentRegionDefaults,
  consentUpdate,
  type ConsentChoice,
  type ConsentState,
} from './consent.js';
import { isGaConfigured, sendGaBeaconEvent, sendGaEvent, startGa } from './ga.js';

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

/**
 * Pre-consent queue cap.
 *
 * `home` fires before the player has answered the bar, so events MUST be
 * survivable across an undecided window or the first funnel step is
 * structurally unmeasurable. The window is one page load and the funnel is five
 * steps, so eight is the whole journey plus slack; the only way to exceed it is
 * a player cycling mode picks repeatedly before answering. Past the cap the
 * OLDEST is dropped, which bounds memory without ever letting the queue become
 * a leak.
 */
const QUEUE_CAP = 8;

interface QueuedEvent {
  name: string;
  params?: Record<string, unknown>;
  beacon?: true;
}

/** The game-facing surface. Every method is void, synchronous and no-throw. */
export interface Analytics {
  /** Resolve the stored decision and, if it is already `granted`, build the tag.
   *  Called once at boot, before any funnel call. Idempotent. */
  boot(): void;
  /** The player's decision, for the consent bar's show/hide test. */
  consentState(): ConsentState;
  /** ACCEPT pressed: persist, build the tag, flush whatever queued. */
  grantConsent(): void;
  /** DECLINE pressed: persist, discard the queue, never load anything. */
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
 *  sent differently, so the queue's flush and the live path can never drift. */
function emit(ev: QueuedEvent): void {
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
  /** `undecided` until `boot()` reads storage. Held in memory so the consent
   *  bar and the queue agree without re-reading `localStorage` per event. */
  let state: ConsentState = 'undecided';
  let booted = false;
  let queue: QueuedEvent[] = [];

  /** Push through to GA, or hold it. The one place the tri-state is consulted. */
  function dispatch(ev: QueuedEvent): void {
    if (state === 'denied') return;
    if (state === 'granted') {
      emit(ev);
      return;
    }
    // undecided: hold it. Nothing is queued when there is no measurement ID —
    // an inert build must not accumulate objects for a flush that can never come.
    if (!isGaConfigured()) return;
    // PAST THE CAP, DROP THE NEWEST — not the oldest (review gate). A funnel
    // reads forwards, and `home` is both the first event queued and the one the
    // queue exists for, so drop-oldest evicted precisely the wrong end: a player
    // who cycled mode picks before answering would have flushed a funnel with no
    // beginning. Keeping the earliest events preserves the shape that matters.
    if (queue.length >= QUEUE_CAP) return;
    queue.push(ev);
  }

  /**
   * Build the tag and drain the queue, in that order.
   *
   * BOTH consent defaults are sent — the global one and the EEA/UK/CH
   * region-scoped one — before the update. Under Basic mode the region default
   * changes nothing; see `consent.ts` for why it is sent anyway.
   */
  function activate(): void {
    // The queue is drained ONLY once the tag is known to be built (review gate).
    // Clearing it first meant a `startGa` that failed — a frozen window, no
    // document head, a CSP — silently threw away the queued `home`/`mode_pick`
    // with no possibility of a later retry.
    if (!startGa([consentDefaults(), consentRegionDefaults()], consentUpdate('granted'))) return;
    const pending = queue;
    queue = [];
    for (const ev of pending) emit(ev);
  }

  function settle(choice: ConsentChoice): void {
    state = choice;
    saveConsent(choice);
    if (choice === 'granted') activate();
    else queue = [];
  }

  return {
    boot: () =>
      guard(() => {
        if (booted) return;
        booted = true;
        state = loadConsent();
        if (state === 'granted') activate();
        else if (state === 'denied') queue = [];
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
