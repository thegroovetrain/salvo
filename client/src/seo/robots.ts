// `/robots.txt` and `/sitemap.xml` (Story 13.1, AC 14). Emitted into
// `client/dist` on every build by the `hc-crawlable` plugin's `generateBundle`.
// Pure, Node-safe.

import { escapeHtml } from './escape.js';
import { SITE_ORIGIN, SITE_PAGES, canonicalUrl } from './site.js';

/** The sitemap's absolute URL — what `robots.txt` points crawlers at. */
export function sitemapUrl(): string {
  return `${SITE_ORIGIN}/sitemap.xml`;
}

/** Allow everything (`ads.txt` included), and name the sitemap. */
export function robotsTxt(): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${sitemapUrl()}\n`;
}

/**
 * A sitemaps.org 0.9 `urlset` of the canonical URLs, from the same table as
 * the canonicals. No `lastmod`: a build date is not a content date.
 */
export function sitemapXml(): string {
  const urls = SITE_PAGES.map((p) => `  <url><loc>${escapeHtml(canonicalUrl(p))}</loc></url>`);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}
