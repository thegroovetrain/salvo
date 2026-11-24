// THE HOME'S SERVED MARKUP (Story 13.1; one version, Eric 2026-11-24). Node-safe.
//
// THESE ARE THE HOME'S OWN ELEMENTS, NOT A COPY OF THEM. The build writes this
// string into the served `index.html`; on its first mount the live home MOVES
// the wordmark `<h1>`, the version line and the link `<nav>` out of it into the
// port (`ui/homeStatic.ts`) and styles them, so the document never holds two
// versions of the same words and nothing is deleted and redrawn. Where no served
// copy exists (a dev server, a bare test document) the home parses THIS string
// and adopts from that: one builder, one source.
//
// The structure is the live one: the wordmark is `HULLCRACKER` + a `.IO` span
// (the span the live home paints phosphor-bright), and the community anchors
// carry the same off-site `target`/`rel` the live row always had. The `<main>`
// is the scripting-off reader's landmark only: the live home's `<main>` is its
// console column. Not here: the random tagline, the class chip and every
// JS-only control (AC 3).

import type { CommunityLink } from '../ui/communityLinks.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  HOWTO_HREF,
  HOWTO_LINK_LABEL,
  PRIVACY_LINK_LABEL,
  WORDMARK_NAME,
  WORDMARK_TLD,
  versionLine,
} from '../ui/siteCopy.js';
import { escapeHtml } from './escape.js';

/** The id of the home's served container: the words a reader with scripting
 *  off sees, until the live home adopts its elements (`ui/homeStatic.ts`). */
export const PRERENDER_ID = 'hc-prerender';

/** The stable ids the live home adopts its served elements by. */
export const HOME_WORDMARK_ID = 'hc-wordmark';
export const HOME_VERSION_ID = 'hc-version';
export const HOME_LINKS_ID = 'hc-links';

/** What the home prerender needs from the build: the version and the
 *  community links the BUILD's env yields. */
export interface HomePrerenderOptions {
  version: string;
  community: readonly CommunityLink[];
}

function anchor(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** Off-site: a new tab, and no window handle (or referrer) back to the game. */
function communityAnchor(link: CommunityLink): string {
  return (
    `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">` +
    `${escapeHtml(link.label)}</a>`
  );
}

/**
 * The home: the wordmark `<h1>`, the version line, and the underplay row's
 * links, in the served container `#hc-prerender` (styled for a scripting-off
 * reader by `prerenderStyle`).
 */
export function prerenderHome(opts: HomePrerenderOptions): string {
  const h1 =
    `<h1 id="${HOME_WORDMARK_ID}">${escapeHtml(WORDMARK_NAME)}` +
    `<span>${escapeHtml(WORDMARK_TLD)}</span></h1>`;
  const ver = `<p id="${HOME_VERSION_ID}">${escapeHtml(versionLine(opts.version))}</p>`;
  const links = [
    anchor(HOWTO_LINK_LABEL, HOWTO_HREF),
    anchor(PRIVACY_LINK_LABEL, CLIENT_CONFIG.consent.policyHref),
    ...opts.community.map(communityAnchor),
  ];
  return (
    `<div id="${PRERENDER_ID}"><main>${h1}${ver}</main>` +
    `<nav id="${HOME_LINKS_ID}">${links.join(' ')}</nav></div>`
  );
}
