// THE HOME'S SERVED MARKUP (Story 13.1; one version, Eric 2026-11-24). Node-safe.
//
// THESE ARE THE HOME'S OWN ELEMENTS, NOT A COPY OF THEM. The build writes this
// string into the served `index.html`; on its first mount the live home MOVES
// the wordmark `<h1>`, the copyright line, the version line, the link `<nav>`
// and the social-link group out of it into the port (`ui/homeStatic.ts`) and
// styles them, so the document never holds two versions of the same words and
// nothing is deleted and redrawn. Where no served copy exists (a dev server, a
// bare test document) the home parses THIS string and adopts from that: one
// builder, one source.
//
// The structure is the live one: the wordmark is `HULLCRACKER` + a `.IO` span
// (the span the live home paints phosphor-bright); the copyright, version, nav
// and social links are the live bottom bar's pieces (Eric's 2026-11-25 Banded
// Bars redesign), in its order. The `<main>` and `<footer>` here are the
// scripting-off reader's landmarks only: the live home builds its own bars and
// console around the adopted pieces. Not here: the random tagline, the class
// chip and every JS-only control (AC 3).
//
// THE YEAR IS THE BUILD'S. `year` defaults to the current year where this runs:
// at build time for the served page (the plugin passes no year), and for the
// runtime fallback (dev, tests) the same clock. The served string is the one
// version; nothing rewrites it at runtime.

import type { CommunityLink } from '../ui/communityLinks.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  HOWTO_HREF,
  HOWTO_LINK_LABEL,
  PRIVACY_LINK_LABEL,
  WORDMARK_NAME,
  WORDMARK_TLD,
  copyrightLine,
  versionLine,
} from '../ui/siteCopy.js';
import { escapeHtml } from './escape.js';
import { socialIconSvg } from './socialIcons.js';

/** The id of the home's served container: the words a reader with scripting
 *  off sees, until the live home adopts its elements (`ui/homeStatic.ts`). */
export const PRERENDER_ID = 'hc-prerender';

/** The stable ids the live home adopts its served elements by. */
export const HOME_WORDMARK_ID = 'hc-wordmark';
export const HOME_VERSION_ID = 'hc-version';
export const HOME_LINKS_ID = 'hc-links';
export const HOME_COPYRIGHT_ID = 'hc-copyright';
export const HOME_SOCIAL_ID = 'hc-social';

/** What the home prerender needs from the build: the version, the community
 *  links the BUILD's env yields, and (optionally) the copyright year. */
export interface HomePrerenderOptions {
  version: string;
  community: readonly CommunityLink[];
  /** Defaults to the current year where the builder runs. */
  year?: number;
}

function anchor(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

/** Off-site: a new tab, and no window handle (or referrer) back to the game.
 *  Icon-only, so the service name is the anchor's accessible name. */
function socialAnchor(link: CommunityLink): string {
  return (
    `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" ` +
    `aria-label="${escapeHtml(link.name)}">${socialIconSvg(link.service)}</a>`
  );
}

/**
 * The home: the wordmark `<h1>` in a `<main>`, then a `<footer>` holding the
 * copyright line, the version line, the link `<nav>` and the social links, in
 * the served container `#hc-prerender` (styled for a scripting-off reader by
 * `prerenderStyle`).
 */
export function prerenderHome(opts: HomePrerenderOptions): string {
  const h1 =
    `<h1 id="${HOME_WORDMARK_ID}">${escapeHtml(WORDMARK_NAME)}` +
    `<span>${escapeHtml(WORDMARK_TLD)}</span></h1>`;
  const year = opts.year ?? new Date().getFullYear();
  const copy = `<p id="${HOME_COPYRIGHT_ID}">${escapeHtml(copyrightLine(year))}</p>`;
  const ver = `<p id="${HOME_VERSION_ID}">${escapeHtml(versionLine(opts.version))}</p>`;
  const links = [anchor(HOWTO_LINK_LABEL, HOWTO_HREF), anchor(PRIVACY_LINK_LABEL, CLIENT_CONFIG.consent.policyHref)];
  const nav = `<nav id="${HOME_LINKS_ID}">${links.join(' ')}</nav>`;
  const social = `<div id="${HOME_SOCIAL_ID}">${opts.community.map(socialAnchor).join(' ')}</div>`;
  return `<div id="${PRERENDER_ID}"><main>${h1}</main><footer>${copy}${ver}${nav}${social}</footer></div>`;
}
