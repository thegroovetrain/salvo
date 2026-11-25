// THE BUILD-TIME HEAD SET (Story 13.1, AC 11-13): canonical, Open Graph and
// the Twitter card, injected into each served document by the `hc-crawlable`
// plugin. Pure, Node-safe.
//
// INJECTED, NEVER TYPED INTO THE SOURCE HTML: `analytics.test.ts` pins every
// source page to the two font origins, and a canonical names a third.
//
// SINGLE SOURCE FOR THE WORDS: `og:title` / `twitter:title` read the document's
// own `<title>`, and `og:description` / `twitter:description` read its own
// `<meta name="description">`. Nothing here restates either.

import { escapeHtml, unescapeHtml } from './escape.js';
import { canonicalUrl, type SitePage } from './site.js';
import { wordmarkText } from '../ui/siteCopy.js';

const TITLE_RE = /<title>([^<]*)<\/title>/i;
const DESCRIPTION_RE = /<meta\s+name="description"\s+content="([^"]*)"\s*\/?>/i;
const HEAD_CLOSE_RE = /<\/head>/i;

/** The document's `<title>` text, decoded, or null. */
export function readTitle(html: string): string | null {
  const m = TITLE_RE.exec(html);
  return m === null ? null : unescapeHtml(m[1]);
}

/** The document's `<meta name="description">` content, decoded, or null. */
export function readDescription(html: string): string | null {
  const m = DESCRIPTION_RE.exec(html);
  return m === null ? null : unescapeHtml(m[1]);
}

function meta(attr: 'name' | 'property', key: string, value: string): string {
  return `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
}

/** The pair of tags a text field yields, or none when the document lacks it. */
function optionalPair(value: string | null, og: string, twitter: string): string[] {
  if (value === null) return [];
  return [meta('property', og, value), meta('name', twitter, value)];
}

/** The head tags for one page: canonical, Open Graph, Twitter card. */
export function headTags(page: SitePage, title: string | null, description: string | null): string[] {
  const url = canonicalUrl(page);
  return [
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', wordmarkText()),
    meta('property', 'og:url', url),
    meta('name', 'twitter:card', 'summary'),
    ...optionalPair(title, 'og:title', 'twitter:title'),
    ...optionalPair(description, 'og:description', 'twitter:description'),
  ];
}

/**
 * Insert `extra` markup and the page's head tags just before `</head>`. A
 * document with no `</head>` is returned unchanged (a build step never throws).
 */
export function injectHead(html: string, page: SitePage, extra: readonly string[] = []): string {
  const at = html.search(HEAD_CLOSE_RE);
  if (at === -1) return html;
  const tags = [...headTags(page, readTitle(html), readDescription(html)), ...extra];
  return `${html.slice(0, at)}  ${tags.join('\n  ')}\n${html.slice(at)}`;
}
