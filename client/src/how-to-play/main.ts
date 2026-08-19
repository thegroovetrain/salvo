// THE HOW-TO-PLAY PAGE'S BOOT (Story 7.3, FR39 / UX-DR29).
//
// A THIRD VITE ENTRY, exactly as `/privacy` is a second one, and for the reason
// recorded in `src/privacy/main.ts`: a file under `public/` cannot import the
// token bridge, so it could not reuse the page chrome at all.
// `client/how-to-play/index.html` is a Rollup entry, which emits
// `dist/how-to-play/index.html`, which `express.static` serves at
// `/how-to-play`.
//
// THERE IS NO GAME HERE. No Pixi, no socket, no shared sim, no analytics: this
// module imports the theme bridge, the page chrome and the copy, and that is
// the whole graph. Rollup gives the page its own chunk, so a reader never
// downloads the renderer to read the manual.
//
// `injectTheme()` MUST RUN FIRST, exactly as it does in `main.ts` and the
// privacy page: every style below is written in `var(--hc-*)`, and those
// properties do not exist until the bridge publishes them onto `:root`.
//
// KEYS RENDER AS KEYCAPS, NOT AS TEXT (Eric ruling 2026-08-19). `makeKeyTable`
// wears the in-game refit-card chip — a 22px square in mono — so "keys look
// like this" reads as one system across the hotbar, the refit cards and this
// page.

import { injectTheme } from '../ui/theme.js';
import {
  goHome,
  makeKeyTable,
  makePageLink,
  makePageParagraph,
  makePageSection,
  renderPage,
} from '../ui/page.js';
import {
  HOWTO_FOOTER_LEAD,
  HOWTO_FOOTER_LINK,
  HOWTO_FOOTER_TAIL,
  HOWTO_SECTIONS,
  HOWTO_SUBTITLE,
  HOWTO_TITLE,
  type HowToSection,
} from './copy.js';
import { CLIENT_CONFIG } from '../config.js';

/** One copy section → one page block: prose first, then its keycaps. */
function sectionBlock(section: HowToSection): HTMLElement {
  const children: HTMLElement[] = (section.paragraphs ?? []).map(makePageParagraph);
  if (section.keys !== undefined) children.push(makeKeyTable(section.keys));
  return makePageSection(section.heading, ...children);
}

/**
 * The closing line, which is the one place this page links onward. Built here
 * rather than in `copy.ts` because a link is DOM, and the copy module stays
 * pure data so Eric's copy pass never has to read markup.
 */
function footerBlock(): HTMLElement {
  const p = makePageParagraph(HOWTO_FOOTER_LEAD);
  p.appendChild(makePageLink(HOWTO_FOOTER_LINK, CLIENT_CONFIG.consent.policyHref));
  p.appendChild(document.createTextNode(HOWTO_FOOTER_TAIL));
  return p;
}

/** Build and mount the page. Exported so a test can drive it without the
 *  module-scope boot below (which only runs in a browser). */
export function mountHowToPlayPage(): void {
  injectTheme();
  renderPage({
    id: 'how-to-play-page',
    title: HOWTO_TITLE,
    subtitle: HOWTO_SUBTITLE,
    body: [...HOWTO_SECTIONS.map(sectionBlock), footerBlock()],
    // Back means the PORT, never `history.back()` — a reader can arrive here
    // straight from a search result, and for them "back" leaves the site.
    onBack: goHome,
  });
}

mountHowToPlayPage();
