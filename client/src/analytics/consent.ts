// Consent state: the PURE, testable half of the analytics layer (Story 7-2).
//
// Nothing in here touches `gtag`, `dataLayer`, the DOM or the network — this
// module only answers "what did the player decide?" and "what payload does
// Consent Mode v2 expect for that decision?". `analytics/ga.ts` is the single
// site that knows GA4 exists; `analytics/index.ts` is the seam game code calls.
// Splitting the decision out is what makes the whole I/O matrix unit-testable
// without a browser: the state machine is three values and two payloads.

/** A decision the player actually made. Absent from storage = undecided. */
export type ConsentChoice = 'granted' | 'denied';

/** The full tri-state. `undecided` is the first-visit value AND the fail-open
 *  value when storage throws — a player whose storage is unavailable is treated
 *  as not having answered, never as having accepted. */
export type ConsentState = ConsentChoice | 'undecided';

/**
 * The persisted record's key, in the existing `hullcracker.*` namespace
 * (`hullcracker.name`, `hullcracker.class`, …).
 *
 * PERSISTENCE HERE IS STRUCTURAL, NOT A PREFERENCE (Eric ruling, amendment 14):
 * `client/src/app/returnToPort.ts` ends every return-to-port with a real
 * `reload()`, so EVERY normal loop iteration is a full page navigation. Without
 * a stored record the consent bar would reappear after every single match.
 */
export const CONSENT_KEY = 'hullcracker.consent';

/**
 * The stored choice, or `undecided`.
 *
 * FAIL-OPEN ON EVERY FAILURE, exactly like `home.ts`'s `loadSavedName` and
 * `loadSavedClassOrNull`: private mode, a disabled-storage policy or a hostile
 * shim throws on `getItem`, and the answer to that is "the player hasn't
 * decided", not a crash on the boot path. A corrupt/legacy value is treated the
 * same way — only the two exact tokens count as a decision, so a hand-edited
 * `hullcracker.consent = "yes"` can never be read as an accept.
 */
export function loadConsent(): ConsentState {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw === 'granted' || raw === 'denied' ? raw : 'undecided';
  } catch {
    return 'undecided';
  }
}

/** Record the player's decision. Swallows a storage throw: a blocked store
 *  means the bar shows again next load, which is strictly the safe direction —
 *  it re-asks rather than silently assuming the old answer. */
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

/** Every signal denied — the shape both defaults start from. */
function allDenied(): ConsentSignals {
  return {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  };
}

/**
 * The GLOBAL default: everything denied, for everyone, before any update.
 *
 * Under Consent Mode BASIC (Eric ruling R7 — nothing third-party loads until
 * the player clicks Accept) this default is the state the tag is born into and
 * lives in for exactly as long as it takes the very next `update` call to run,
 * because we only ever load the tag AFTER a grant. It is still sent, in this
 * order, because Google's contract is "default before config, update after" and
 * a tag that never saw a default treats the signals as unknown.
 */
export function consentDefaults(): ConsentDefaultPayload {
  return allDenied();
}

/**
 * The REGION-SCOPED default for the EEA/UK/CH.
 *
 * READ THIS BEFORE ASSUMING IT DOES WORK: under Basic mode it does not, and
 * cannot, change behaviour. Basic mode denies everything to everyone until the
 * player accepts — so a region-scoped denial is denying what the global default
 * already denied, for a tag that is not even loaded yet. It is here for
 * CORRECTNESS, not for effect: a Consent Mode audit (and Story 7.4's certified
 * CMP, which arrives with the ads) expects to find a region-scoped EEA/UK/CH
 * default, and if a later story ever moves this project to Advanced mode — where
 * the tag DOES load pre-decision and the region list starts governing who gets
 * measured in cookieless-ping mode — the correct default is already in place
 * rather than being invented under time pressure.
 *
 * There is deliberately NO GEO LOOKUP anywhere in this layer (amendment 14, R6):
 * the bar is shown to everyone, and buying a client-side geo signal would cost a
 * third-party request against NFR2. Google resolves `region` server-side from
 * the request itself.
 */
export function consentRegionDefaults(): ConsentDefaultPayload {
  return { ...allDenied(), region: EEA_UK_CH_REGIONS };
}

/**
 * The update sent when a decision arrives.
 *
 * THE THREE AD SIGNALS STAY DENIED EVEN ON ACCEPT. This story ships analytics
 * and nothing else; Story 7.4 owns ads, and it is that story's job — with a
 * certified CMP — to widen these. Granting an ad signal here would be granting
 * consent for a thing the site does not do, on a bar whose copy does not ask
 * for it.
 */
export function consentUpdate(choice: ConsentChoice): ConsentSignals {
  return { ...allDenied(), analytics_storage: choice };
}
