// THE HOME'S SERVED MARKUP (Story 13.1). Split out of `prerender.ts` so the
// home and the static pages can be reworked independently (Eric 2026-11-24:
// one version of every page; see the epic-13 amendment). Node-safe.

import type { CommunityLink } from '../ui/communityLinks.js';
import { CLIENT_CONFIG } from '../config.js';
import {
  HOWTO_HREF,
  HOWTO_LINK_LABEL,
  PRIVACY_LINK_LABEL,
  versionLine,
  wordmarkText,
} from '../ui/siteCopy.js';
import { escapeHtml } from './escape.js';
import { PRERENDER_ID } from './takeover.js';

function text(tag: string, content: string): string {
  return `<${tag}>${escapeHtml(content)}</${tag}>`;
}

function anchor(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`;
}

function block(main: string, links: readonly string[]): string {
  return `<div id="${PRERENDER_ID}"><main>${main}</main><nav>${links.join(' ')}</nav></div>`;
}

/** What the home prerender needs from the build: the version and the
 *  community links the BUILD's env yields. */
export interface HomePrerenderOptions {
  version: string;
  community: readonly CommunityLink[];
}

/**
 * The home: the wordmark's words as the `<h1>`, the version line, and the
 * underplay row's links. NOT the random tagline, the stored class chip or the
 * JS-only controls (AC 3, reading of record).
 */
export function prerenderHome(opts: HomePrerenderOptions): string {
  const main = text('h1', wordmarkText()) + text('p', versionLine(opts.version));
  const links = [
    anchor(HOWTO_LINK_LABEL, HOWTO_HREF),
    anchor(PRIVACY_LINK_LABEL, CLIENT_CONFIG.consent.policyHref),
    ...opts.community.map((l) => anchor(l.label, l.href)),
  ];
  return block(main, links);
}

