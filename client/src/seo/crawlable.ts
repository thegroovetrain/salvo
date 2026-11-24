// THE `hc-crawlable` TRANSFORM (Story 13.1, T2): one pure function the Vite
// plugin's `transformIndexHtml` calls per document, so the config holds only
// the hooks (the `hc-adsense` / `adsHead.ts` split).
//
// For a listed page: the head set + the page's style go in before `</head>`,
// and the page's served markup goes in first thing in `<body>`. An unlisted
// document is returned unchanged. Adds no `<script>` and names no origin but
// `SITE_ORIGIN`.
//
// ONE VERSION OF EVERY PAGE (Eric 2026-11-24). For How to Play and Privacy the
// served markup IS the page — the same builder (`ui/pageMarkup.ts`) the
// runtime would use, never a second implementation — and the head carries the
// theme's custom properties (`themeCss`, the same list `injectTheme`
// publishes), so the page is fully styled before any script runs. The home's
// block is styled for a scripting-off reader by `prerenderStyle`.

import { injectHead } from './head.js';
import { prerenderHome, type HomePrerenderOptions } from './homeMarkup.js';
import { prerenderStyle } from './prerenderStyle.js';
import { pageForHtmlPath, type SitePageKey } from './site.js';
import { howToPlayMarkup } from '../how-to-play/pageMarkup.js';
import { privacyMarkup } from '../privacy/pageMarkup.js';
import { themeCss } from '../ui/theme.js';

export type CrawlableOptions = HomePrerenderOptions;

const BODY_OPEN_RE = /<body\b[^>]*>/i;
const HEAD_CLOSE_RE = /<\/head>/i;

/** The id of the theme `<style>` a static page's head carries. */
export const THEME_STYLE_ID = 'hc-theme';

/** The served body markup for a page. */
export function prerenderFor(key: SitePageKey, opts: CrawlableOptions): string {
  switch (key) {
    case 'home':
      return prerenderHome(opts);
    case 'howToPlay':
      return howToPlayMarkup();
    case 'privacy':
      return privacyMarkup();
  }
}

/** The `<style>` a page's head gets: the home's block style, or the theme. */
export function pageStyleFor(key: SitePageKey): string {
  if (key === 'home') return prerenderStyle();
  return `<style id="${THEME_STYLE_ID}">${themeCss()}</style>`;
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
  return injectBody(injectHead(html, page, [pageStyleFor(page.key)]), prerenderFor(page.key, opts));
}
