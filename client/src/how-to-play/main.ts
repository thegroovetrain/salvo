// THE HOW-TO-PLAY PAGE'S BOOT (Story 7.3, FR39 / UX-DR29; Story 13.1).
//
// A THIRD VITE ENTRY, exactly as `/privacy` is a second one:
// `client/how-to-play/index.html` is a Rollup entry, which emits
// `dist/how-to-play/index.html`, which `express.static` serves at
// `/how-to-play`.
//
// IT BUILDS NOTHING (Eric 2026-11-24: one version of every page). The served
// document already holds the whole page, styled before any script runs: the
// `hc-crawlable` Vite plugin writes `howToPlayMarkup()` into its body and the
// theme's custom properties into its head at build time. This module attaches
// only what needs JavaScript — ESC returns home — through `attachPage`.
//
// THERE IS NO GAME HERE. No Pixi, no socket, no analytics. The builder is still
// in this chunk (with the stat fold it derives its tables from) only so a
// document without the served page — a bare test — gets the same one.

import { attachPage } from '../ui/page.js';
import { HOWTO_PAGE_ID, howToPlayMarkup } from './pageMarkup.js';

/** Attach the page's behavior. Exported so a test can drive it without the
 *  module-scope boot below. */
export function attachHowToPlayPage(): void {
  attachPage({ id: HOWTO_PAGE_ID, markup: howToPlayMarkup });
}

attachHowToPlayPage();
