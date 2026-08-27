// Consent state: the PURE, testable half of the analytics layer (Story 7-2,
// moved from Consent Mode BASIC to ADVANCED by Story 7-4).
//
// Nothing in here touches `gtag`, `dataLayer`, the DOM or the network — this
// module only answers "what did the player decide?" and "what payload does
// Consent Mode v2 expect for that decision?". `analytics/ga.ts` is the single
// site that knows GA4 exists; `analytics/index.ts` is the seam game code calls.
// Splitting the decision out is what makes the whole I/O matrix unit-testable
// without a browser: the state machine is three values and three payloads.
//
// WHAT 7.4 CHANGED, IN ONE LINE: the EEA/UK/CH question is GOOGLE'S CMP's to ask
// now, so the global default grants, the region default finally does work, and
// the record below shrinks to a local analytics override.

/** A decision the player actually made in our own settings. Absent from
 *  storage = no local override; see `ConsentState`. */
export type ConsentChoice = 'granted' | 'denied';

/**
 * The full tri-state.
 *
 * `undecided` NO LONGER MEANS "AN UNANSWERED QUESTION" (Story 7.4). There is no
 * question of ours left to answer: the consent card is deleted and Google's CMP
 * owns the dialog. It now means "no LOCAL override" — follow Google's CMP and
 * the region defaults, which for a non-EEA visitor means analytics is running.
 * It is still the fail-open value when storage throws, and that stays the safe
 * direction because the defaults, not this record, are what protect the EEA.
 */
export type ConsentState = ConsentChoice | 'undecided';

/**
 * The persisted record's key, in the existing `hullcracker.*` namespace
 * (`hullcracker.name`, `hullcracker.class`, …).
 *
 * PERSISTENCE HERE IS STRUCTURAL, NOT A PREFERENCE (Eric ruling, amendment 14):
 * `client/src/app/returnToPort.ts` ends every return-to-port with a real
 * `reload()`, so EVERY normal loop iteration is a full page navigation. A local
 * opt-out that did not survive that would be no opt-out at all.
 *
 * THE KEY AND THE THREE TOKENS ARE UNCHANGED ACROSS 7.4 deliberately: a player
 * who declined under the old card keeps their decline, because "denied" means
 * the same thing on both sides of the change — do not measure me.
 */
export const CONSENT_KEY = 'hullcracker.consent';

/**
 * GLOBAL PRIVACY CONTROL — READ AS A PRE-EMPTIVE DENIAL (Eric ruling
 * 2026-08-27, epic-7 amendment 45; closes the Story 7.2 ledger entry).
 *
 * `navigator.globalPrivacyControl === true` is a browser-level opt-out the
 * player configured once, deliberately, and which several US state privacy laws
 * treat as a legally binding signal. So it is not a tie-breaker and not a
 * default: it DENIES BEFORE AND REGARDLESS OF ANY GRANT, over a stored local
 * choice and over anything Google's CMP may say later, for every consent signal
 * this module controls.
 *
 * It is deliberately NOT persisted. The player's own stored choice is left
 * exactly where it is, so turning GPC off restores the decision they actually
 * made rather than a denial we wrote on their behalf.
 *
 * STRICT `=== true`. The spec defines the property as the boolean `true` when
 * the signal is on and leaves it absent otherwise; a truthy non-boolean is a
 * shim doing something else, and reading it as consent would be inventing one.
 * Wrapped in the same fail-open `try` every reader in this module uses — a
 * hostile `navigator` shim must not throw on the boot path — but note the
 * failure direction is the honest one either way: no readable signal is not a
 * signal.
 */
export function gpcDenied(): boolean {
  try {
    if (typeof navigator === 'undefined') return false;
    return (navigator as { globalPrivacyControl?: unknown }).globalPrivacyControl === true;
  } catch {
    return false;
  }
}

/**
 * The stored choice, or `undecided`.
 *
 * FAIL-OPEN ON EVERY FAILURE, exactly like `home.ts`'s `loadSavedName` and
 * `loadSavedClassOrNull`: private mode, a disabled-storage policy or a hostile
 * shim throws on `getItem`, and the answer to that is "there is no local
 * override", not a crash on the boot path. A corrupt/legacy value is treated the
 * same way — only the two exact tokens count as a decision, so a hand-edited
 * `hullcracker.consent = "yes"` can never be read as an accept.
 */
export function loadConsent(): ConsentState {
  // GPC OUTRANKS THE RECORD, and is checked before it is read: a stored
  // `granted` from before the player turned the signal on must not resurrect
  // (see `gpcDenied`). The record itself is untouched.
  if (gpcDenied()) return 'denied';
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : 'undecided';
  } catch {
    return 'undecided';
  }
}

/** Record the player's decision. Swallows a storage throw: a blocked store just
 *  means the override does not survive the reload and the defaults govern again,
 *  which is the same place a first-time visitor starts from. */
export function saveConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // storage unavailable — the choice just won't survive the next reload
  }
}

// --- Consent Mode v2 payloads -------------------------------------------------

/** The four Consent Mode v2 signals. `ad_user_data` and `ad_personalization`
 *  are the two v2 added on top of v1's storage pair; all four must be set or
 *  Google treats the unset ones as unknown. */
export interface ConsentSignals {
  ad_storage: ConsentChoice;
  ad_user_data: ConsentChoice;
  ad_personalization: ConsentChoice;
  analytics_storage: ConsentChoice;
}

/** A default payload may additionally be scoped to a region list. */
export interface ConsentDefaultPayload extends ConsentSignals {
  region?: readonly string[];
}

/**
 * EEA + UK + Switzerland, as ISO-3166-1 alpha-2 codes (Consent Mode's `region`
 * accepts alpha-2 country and ISO-3166-2 subdivision codes).
 *
 * EU-27, then the three non-EU EEA states (IS/LI/NO), then GB and CH.
 */
export const EEA_UK_CH_REGIONS: readonly string[] = Object.freeze([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK',
  'IS', 'LI', 'NO',
  'GB', 'CH',
]);

/** Every signal denied — the shape the region-scoped default is built from. */
function allDenied(): ConsentSignals {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  };
}

/** Every signal granted — the shape the global default is built from. */
function allGranted(): ConsentSignals {
  return {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
  };
}

/**
 * The GLOBAL default: everything GRANTED, for everyone the region default does
 * not cover.
 *
 * IT INVERTED IN STORY 7.4, AND THE INVERSION IS THE WHOLE MODE CHANGE (Eric
 * rulings 2026-08-19). Story 7.2 shipped Consent Mode BASIC (R7): nothing
 * third-party existed until an explicit Accept, so a global deny was the state
 * the tag was born into and a self-built card asked the question. 7.4 adopts
 * GOOGLE'S OWN CERTIFIED CMP as the single consent dialog — and that CMP has no
 * standalone script, it is delivered BY the ad script — so the tag now loads for
 * everyone, pre-decision, which is Consent Mode ADVANCED by construction.
 *
 * Under Advanced the global default is what governs every visitor OUTSIDE the
 * EEA/UK/CH, where Eric ruled no dialog appears at all and analytics simply
 * runs. A denied global default would therefore mean "measure nobody, anywhere,
 * forever" — the CMP never asks those visitors, so no update would ever arrive
 * to lift it. EEA/UK/CH visitors are protected by `consentRegionDefaults()`
 * below, which Google resolves server-side and which the CMP then updates.
 *
 * ORDER IS STILL GOOGLE'S CONTRACT: default before config. A tag that never saw
 * a default treats the signals as unknown.
 */
export function consentDefaults(): ConsentDefaultPayload {
  // ...unless the browser already said no. GPC turns the GLOBAL default over
  // (the region default below is denied either way), so a GPC visitor's tag is
  // born denied instead of being granted and then corrected.
  return gpcDenied() ? allDenied() : allGranted();
}

/**
 * The REGION-SCOPED default for the EEA/UK/CH: all four signals denied.
 *
 * IT IS NOW LOAD-BEARING. Story 7.2 shipped it inert and said so at length —
 * under Basic mode it denied what the global default already denied, for a tag
 * that was not even loaded — while predicting exactly this: *"if a later story
 * ever moves this project to Advanced mode, where the tag DOES load
 * pre-decision and the region list starts governing who gets measured in
 * cookieless-ping mode, the correct default is already in place rather than
 * being invented under time pressure."* Story 7.4 is that story. This list is
 * the ONLY thing standing between an EEA visitor and a granted global default
 * until Google's CMP issues its own `consent update`.
 *
 * There is deliberately NO GEO LOOKUP anywhere in this layer (amendment 14, R6):
 * buying a client-side geo signal would cost a third-party request against NFR2,
 * and Google resolves `region` server-side from the request itself.
 */
export function consentRegionDefaults(): ConsentDefaultPayload {
  return { ...allDenied(), region: EEA_UK_CH_REGIONS };
}

/** The one signal our own settings row may move. See `consentUpdate`. */
export interface ConsentAnalyticsUpdate {
  analytics_storage: ConsentChoice;
}

/**
 * THE PLAYER'S LOCAL ANALYTICS OVERRIDE — and nothing else.
 *
 * ITS MEANING CHANGED IN 7.4 (Eric rulings 2026-08-19). It used to be "the
 * answer to our consent card", and that card is deleted; it is now the payload
 * for the settings PRIVACY row, which is the only in-product analytics door left.
 *
 * THE DIVISION OF AUTHORITY IS THE POINT, and it replaces 7.2's frozen "the
 * three ad signals stay denied" note. `ad_storage`, `ad_user_data` and
 * `ad_personalization` now belong to GOOGLE'S CMP, which asks for them in its
 * own dialog and issues its own `consent update`. Our settings toggle has no
 * authority over them, so it does not name them: writing `ad_storage: 'denied'`
 * here would silently stamp on a consent the player gave Google's dialog, and
 * writing `'granted'` would forge one they never gave. A partial update leaves
 * every signal it omits exactly as the CMP and the defaults left it.
 *
 * GPC IS THE ONE THING THAT WIDENS IT, AND IT WIDENS TO ALL FOUR (Eric ruling
 * 2026-08-27). Two reasons, and the second is why the defaults branch alone
 * would not have been enough:
 *
 *  1. GPC is a "do not sell or share" signal. The signals that carry selling
 *     and sharing are the three AD ones — denying `analytics_storage` alone
 *     would answer the legal signal with the one thing it is least about. The
 *     7.4 division of authority is not breached: it forbids this row from
 *     forging a GRANT the player never gave and from stamping on a consent they
 *     gave Google's dialog, and a denial the player themselves configured at
 *     the browser is neither.
 *  2. On an ads-configured build the consent DEFAULTS are written into the page
 *     head at BUILD time (`ads/adsHead.ts`), where no browser and therefore no
 *     GPC signal exists — and `ga.ts` then skips its own defaults, so
 *     `consentDefaults()`'s GPC branch never reaches production at all. This
 *     UPDATE is the leg that actually lands there.
 */
export function consentUpdate(choice: ConsentChoice): ConsentAnalyticsUpdate | ConsentSignals {
  return gpcDenied() ? allDenied() : { analytics_storage: choice };
}
