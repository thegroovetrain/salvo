// THE PRIVACY PAGE'S BOOT (Story 7.2, Eric ruling R8: the policy lives at
// `/privacy`).
//
// IT IS A SECOND VITE ENTRY, NOT A FILE UNDER `public/` (the implementer
// deviation recorded in amendment 14, URL preserved exactly). A file copied
// verbatim out of `public/` cannot import the token bridge, so it could not have
// reused the page chrome R12 requires — the two rulings would have produced two
// divergent pages. `client/privacy/index.html` is a Rollup entry instead, which
// emits `dist/privacy/index.html`, which `express.static` serves at `/privacy`,
// byte-identical to the URL Eric picked.
//
// THERE IS NO GAME HERE. No Pixi, no socket, no shared sim, no analytics: this
// module imports the theme bridge, the page chrome and the copy, and that is the
// whole graph. Rollup gives the page its own chunk, so a reader of the policy
// never downloads the renderer — and, just as importantly, the analytics layer
// is not on this page's path at all, so visiting the policy can never load a
// Google tag no matter what the consent record says.
//
// `injectTheme()` MUST RUN FIRST, exactly as it does in `main.ts`: every style
// below is written in `var(--hc-*)`, and those properties do not exist until the
// bridge publishes them onto `:root`.

import { injectTheme } from '../ui/theme.js';
import {
  goHome,
  makePageList,
  makePageParagraph,
  makePageSection,
  renderPage,
} from '../ui/page.js';
import { POLICY_SECTIONS, POLICY_TITLE, POLICY_UPDATED, type PolicySection } from './policyCopy.js';

/** One policy section → one page block, in the ratified copy registers. */
function sectionBlock(section: PolicySection): HTMLElement {
  const children: HTMLElement[] = (section.paragraphs ?? []).map(makePageParagraph);
  if (section.bullets !== undefined) children.push(makePageList(section.bullets));
  return makePageSection(section.heading, ...children);
}

/** Build and mount the page. Exported so a test can drive it without the
 *  module-scope boot below (which only runs in a browser). */
export function mountPrivacyPage(): void {
  injectTheme();
  renderPage({
    id: 'privacy-page',
    title: POLICY_TITLE,
    subtitle: POLICY_UPDATED,
    body: POLICY_SECTIONS.map(sectionBlock),
    // Back means the PORT, never `history.back()` — a visitor can arrive here
    // straight from a search result, and for them "back" leaves the site. See
    // `goHome`.
    onBack: goHome,
  });
}

mountPrivacyPage();
