// THE PRIVACY PAGE'S BOOT (Story 7.2, Eric ruling R8: the policy lives at
// `/privacy`; Story 13.1).
//
// IT IS A SECOND VITE ENTRY, NOT A FILE UNDER `public/` (amendment 14, URL
// preserved exactly): `client/privacy/index.html` is a Rollup entry, which
// emits `dist/privacy/index.html`, which `express.static` serves at `/privacy`.
//
// IT BUILDS NOTHING (Eric 2026-11-24: one version of every page). The served
// document already holds the whole policy, styled before any script runs: the
// `hc-crawlable` Vite plugin writes `privacyMarkup()` into its body and the
// theme's custom properties into its head at build time. This module attaches
// only what needs JavaScript — ESC returns home — through `attachPage`.
//
// THERE IS NO GAME HERE. No Pixi, no socket, no shared sim, no analytics: the
// analytics layer is not on this page's path at all, so visiting the policy
// can never load a Google tag no matter what the consent record says.

import { attachPage } from '../ui/page.js';
import { PRIVACY_PAGE_ID, privacyMarkup } from './pageMarkup.js';

/** Attach the page's behavior. Exported so a test can drive it without the
 *  module-scope boot below. */
export function attachPrivacyPage(): void {
  attachPage({ id: PRIVACY_PAGE_ID, markup: privacyMarkup });
}

attachPrivacyPage();
