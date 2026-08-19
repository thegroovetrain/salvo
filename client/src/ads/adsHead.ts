// THE BUILD-TIME HEAD INJECTION — pure functions, no I/O, no Vite, no Node.
//
// `client/vite.config.ts`'s `hc-adsense` plugin is four lines of glue on top of
// this file; everything that decides WHAT gets written lives here so it is unit
// testable without running a build (`client/src/__tests__/ads.test.ts`).
//
// WHY THE TAG IS INJECTED AT ALL, RATHER THAN TYPED INTO `client/index.html`.
// Story 7.2's guard reads every shipped page's SOURCE html off disk and asserts
// it carries exactly one `<script>` — its own module entry — and names only the
// two font origins. That guard is worth more than the convenience of a static
// tag: it is what stops a vendor snippet being pasted into a page head where an
// unconfigured fork would inherit it too. Injecting at build time keeps the
// source html pure (the guard stays green, UNMODIFIED), makes an unconfigured
// build provably inert, and puts the tag and `ads.txt` under one switch.
//
// WHY THE CONSENT DEFAULTS ARE INJECTED TOO, AND WHY THEY GO FIRST. `gtag(
// 'consent','default',…)` must be in the `dataLayer` before anything Google's
// CMP pushes: gtag.js processes the queue IN ORDER, and a returning EEA visitor
// whose stored choice the CMP applies early would otherwise have a granted
// consent reset by a `default` arriving behind it. Since `adsbygoogle.js` is the
// thing that DELIVERS the CMP, the defaults cannot live in a module that loads
// later — they have to be parsed ahead of the loader, which is what this file
// writes.
//
// AND THE REGION LIST IS NOT RETYPED. Duplicating 32 country codes into an HTML
// string is the desync class this project exists to prevent, so both payloads
// come from `analytics/consent.ts` — the same functions the runtime tag uses —
// and a test pins the injected list against `EEA_UK_CH_REGIONS` directly.

import { consentDefaults, consentRegionDefaults } from '../analytics/consent.js';
// The marker lives in a LEAF module of its own (`analytics/consentMarker.ts`),
// imported by both sides. It used to be declared here, which made `ga.ts` — the
// only module permitted to name gtag — import the ad layer, and the vendor
// origin with it, for one identifier.
import { CONSENT_DEFAULTS_MARKER } from '../analytics/consentMarker.js';
import { AD_SCRIPT_SRC } from './adsense.js';

/**
 * The `ads.txt` certification authority ID for Google's exchange — a published
 * constant of Google's, identical on every publisher's file. The PUBLISHER half
 * of the line is derived from the configured client, never typed in.
 */
const ADS_TXT_AUTHORITY_ID = 'f08c47fec0942fa0';

/**
 * THE ALLOWLIST — the one page the loader may reach, matched positively.
 *
 * This was a DENYLIST of the static pages, which opted every future entry IN by
 * default: a fourth Rollup input would have silently inherited the loader and
 * the consent block with nothing to say so. The default must be "no ads", so the
 * game's own entry is named and everything else is excluded by construction.
 *
 * The policy Story 7.4 ships states the interstitial is the only place an ad can
 * appear, and the static pages load no Google ADVERTISING or ANALYTICS script,
 * so an EEA visitor reading the privacy policy is never shown a dialog and no
 * cookie is written there. (They do still fetch Google Fonts — an IP disclosure
 * the policy itself calls out — which is why that sentence names the two script
 * families rather than claiming "no Google anything".)
 */
const GAME_ENTRY_SUFFIX = '/client/index.html';

/** Bare forms of the same entry, for a caller that passes a root-relative path
 *  rather than an absolute one. */
const GAME_ENTRY_BARE = ['index.html', '/index.html'] as const;

/** The shape a build-time injection reports: the html to write, and whether the
 *  block ACTUALLY went in. The second field is what gates `ads.txt` — see
 *  `injectAdsHead`. */
export interface AdsHeadInjection {
  html: string;
  injected: boolean;
}

/**
 * Whether a string is a well-formed AdSense publisher client.
 *
 * VALIDATED RATHER THAN TRUSTED, for the same reason this file gates everything
 * on the ID being present at all: `ads.txt` is authoritative BY OMISSION, so a
 * typo'd or truncated env var would publish a file naming a publisher who does
 * not exist — strictly worse than no file — and inject `?client=<garbage>` into
 * the loader url. `String.replace` no-ops silently on a malformed value, so
 * nothing downstream could have noticed.
 */
export function isValidAdsClientId(clientId: string): boolean {
  return /^ca-pub-\d{16}$/.test(clientId);
}

/**
 * The single `ads.txt` line authorising Google to sell this site's inventory.
 *
 * DERIVED FROM THE CONFIGURED CLIENT (`ca-pub-…` → `pub-…`) rather than written
 * out, so a fork that configures its own publisher gets a correct file instead
 * of Eric's ID. An `ads.txt` is authoritative BY OMISSION —
 * a wrong or partial one is strictly worse than none — which is also why the
 * whole emission is gated on the ID being present.
 */
export function adsTxtLine(clientId: string): string {
  return `google.com, ${clientId.replace(/^ca-/, '')}, DIRECT, ${ADS_TXT_AUTHORITY_ID}`;
}

/** The file's full contents: the one line, newline-terminated. */
export function adsTxtContent(clientId: string): string {
  return `${adsTxtLine(clientId)}\n`;
}

/**
 * The inline consent-default block. Region-scoped default FIRST, then the
 * global one, matching Google's own documented example; region matching is by
 * specificity rather than order, so this is legibility, not a dependency.
 */
export function consentDefaultsScript(): string {
  const region = inlineJson(consentRegionDefaults());
  const global = inlineJson(consentDefaults());
  return [
    '<script>',
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}',
    `gtag('consent','default',${region});`,
    `gtag('consent','default',${global});`,
    `window.${CONSENT_DEFAULTS_MARKER}=true;`,
    '</script>',
  ].join('\n');
}

/**
 * JSON for an INLINE `<script>` body.
 *
 * `</script>` inside a script element ends the element, wherever it appears —
 * the HTML parser does not know or care that it is inside a JS string literal.
 * Escaping `<` as `\u003C` (which JS parses straight back to `<`) makes that
 * unconstructable, so the payload can never truncate the one block the whole
 * consent design depends on being parsed BEFORE `adsbygoogle.js`. Today's
 * payloads are frozen tokens and ISO country codes and could not trip it; the
 * escape is here so a later region list or a new signal name cannot either.
 */
export function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C');
}

/** The AdSense loader itself. `crossorigin="anonymous"` matches Google's own
 *  snippet; `async` keeps it off the critical path for NFR2's load budget. */
export function adsLoaderTag(clientId: string): string {
  return `<script async src="${AD_SCRIPT_SRC}?client=${encodeURIComponent(clientId)}" crossorigin="anonymous"></script>`;
}

/**
 * Whether this html file is the GAME's entry — the only page the loader may
 * reach. An ALLOWLIST: a page this does not name gets no loader, so a fourth
 * Rollup input is excluded by default rather than opted in by silence.
 */
export function isGameIndexPath(filename: string): boolean {
  const norm = filename.replace(/\\/g, '/');
  if ((GAME_ENTRY_BARE as readonly string[]).includes(norm)) return true;
  return norm.endsWith(GAME_ENTRY_SUFFIX);
}

/**
 * Put the consent defaults and then the loader at the end of `<head>`.
 *
 * Returns the html UNCHANGED, and `injected: false`, when the publisher ID is
 * missing or malformed (the unconfigured build stays byte-identical to today) or
 * when the document has no `</head>` to inject before — a silent no-op is the
 * right failure here, since the caller is a build step and a thrown transform
 * would take the whole build with it.
 *
 * THE `injected` FLAG IS WHY THIS RETURNS AN OBJECT. A silent no-op that the
 * caller cannot see is how a site ends up publishing an `ads.txt` authorising
 * Google to sell inventory on a page that carries no loader; `client/
 * vite.config.ts` gates the emit on this exact answer rather than on the
 * looser "an ID was configured".
 */
export function injectAdsHead(html: string, clientId: string): AdsHeadInjection {
  if (!isValidAdsClientId(clientId)) return { html, injected: false };
  const close = html.lastIndexOf('</head>');
  if (close === -1) return { html, injected: false };
  const block = `${consentDefaultsScript()}\n${adsLoaderTag(clientId)}\n`;
  return { html: `${html.slice(0, close)}${block}${html.slice(close)}`, injected: true };
}
