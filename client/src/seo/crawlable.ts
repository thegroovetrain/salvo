// THE `hc-crawlable` TRANSFORM (Story 13.1, T2): one pure function the Vite
// plugin's `transformIndexHtml` calls per document, so the config holds only
// the hooks (the `hc-adsense` / `adsHead.ts` split).
//
// For a listed page: the head set + the block's pre-JS style go in before
// `</head>`, and the prerendered block goes in first thing in `<body>`. An
// unlisted document is returned unchanged. Adds no `<script>` and names no
// origin but `SITE_ORIGIN`.

import { injectHead } from './head.js';
import { prerenderHowToPlay, prerenderPrivacy } from './prerender.js';
import { prerenderHome, type HomePrerenderOptions } from './homeMarkup.js';
import { prerenderStyle } from './prerenderStyle.js';
import { pageForHtmlPath, type SitePageKey } from './site.js';

export type CrawlableOptions = HomePrerenderOptions;

const BODY_OPEN_RE = /<body\b[^>]*>/i;
const HEAD_CLOSE_RE = /<\/head>/i;

/** The prerendered block for a page. */
export function prerenderFor(key: SitePageKey, opts: CrawlableOptions): string {
  switch (key) {
    case 'home':
      return prerenderHome(opts);
    case 'howToPlay':
      return prerenderHowToPlay();
    case 'privacy':
      return prerenderPrivacy();
  }
}

/**
 * Insert `markup` right after the `<body>` open tag; unchanged without one.
 * The tag is looked for AFTER `</head>`, so a head comment that mentions
 * `<body>` is never mistaken for it.
 */
export function injectBody(html: string, markup: string): string {
  const from = Math.max(0, html.search(HEAD_CLOSE_RE));
  const m = BODY_OPEN_RE.exec(html.slice(from));
  if (m === null) return html;
  const at = from + m.index + m[0].length;
  return `${html.slice(0, at)}\n  ${markup}${html.slice(at)}`;
}

/** The whole transform for one html entry, keyed by its absolute filename. */
export function crawlableDocument(html: string, filename: string, opts: CrawlableOptions): string {
  const page = pageForHtmlPath(filename);
  if (page === undefined) return html;
  return injectBody(injectHead(html, page, [prerenderStyle()]), prerenderFor(page.key, opts));
}
