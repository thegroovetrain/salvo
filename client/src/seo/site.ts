// THE SITE TABLE (Story 13.1, AC 11, 13, 14) — the one origin, and the three
// served documents with their canonical paths. The canonicals, `og:url`s and
// the sitemap are all built from this table, so they cannot disagree.
//
// Node-safe: imported by `client/vite.config.ts` through `seo/crawlable.ts`.
//
// ONE BUILD SERVES BOTH HOSTS, so the staging documents also name the
// production canonical. That is correct: staging is noindexed and gated.

/** The production origin — the only origin the SEO layer ever names. */
export const SITE_ORIGIN = 'https://hullcracker.io';

export type SitePageKey = 'home' | 'howToPlay' | 'privacy';

/** One served document: its key, its served path (the trailing-slash form
 *  `express.static` answers with 200), and its Rollup entry's path under
 *  `client/`. */
export interface SitePage {
  key: SitePageKey;
  path: string;
  sourceSuffix: string;
}

export const SITE_PAGES: readonly SitePage[] = [
  { key: 'home', path: '/', sourceSuffix: '/client/index.html' },
  { key: 'howToPlay', path: '/how-to-play/', sourceSuffix: '/client/how-to-play/index.html' },
  { key: 'privacy', path: '/privacy/', sourceSuffix: '/client/privacy/index.html' },
];

/** A page's absolute canonical URL. */
export function canonicalUrl(page: SitePage): string {
  return SITE_ORIGIN + page.path;
}

/**
 * The site page an html entry's absolute filename belongs to, or `undefined`
 * (an unlisted page gets nothing — the table is an allowlist, like
 * `isGameIndexPath`). Windows separators are normalized first.
 */
export function pageForHtmlPath(filename: string): SitePage | undefined {
  const norm = filename.replace(/\\/g, '/');
  return SITE_PAGES.find((p) => norm.endsWith(p.sourceSuffix));
}
