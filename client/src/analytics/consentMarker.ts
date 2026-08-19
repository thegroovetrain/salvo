// ONE STRING, ZERO IMPORTS — and that is the whole point of the file.
//
// The marker is a contract between two layers that must not otherwise know each
// other: `ads/adsHead.ts` WRITES it into the page head at build time, and
// `analytics/ga.ts` READS it to decide whether the defaults have already been
// stated. It first lived in `adsHead.ts`, which made the module documented as
// "the only module permitted to name gtag" import the AD layer — and through it
// the vendor origin and `adsense.ts` — for the sake of one identifier. One more
// import in the other direction would have closed a cycle.
//
// A leaf constant is the ratified answer to that shape (the `shared/` seam's
// argument, applied to a client module): both sides import DOWN, neither
// imports across, and the string is still stated exactly once so the two can
// never drift.

/**
 * The marker the injected consent-defaults block plants on `window`.
 *
 * `analytics/ga.ts` skips sending its own consent defaults when it is present,
 * so the defaults are stated EXACTLY ONCE per page whichever way the page was
 * built. When it is absent — an unconfigured, dev or fork build with a GA ID but
 * no publisher ID — `ga.ts` keeps sending them, so an ads-less build still
 * protects EEA visitors.
 */
export const CONSENT_DEFAULTS_MARKER = '__hcConsentDefaults';
