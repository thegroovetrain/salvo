// THE SITE'S CHROME WORDS — the wordmark, the underplay link labels and hrefs,
// the static pages' way back, and the version line (Story 13.1, T1.1).
//
// They used to be typed inline in `ui/home.ts` and `ui/page.ts`. Those modules
// build DOM and pull the renderer's graph, so the build-time prerenderer
// (`seo/prerender.ts`, run inside the Vite config in Node) could not import
// them. The words moved HERE, unchanged, and both the live DOM and the
// prerendered HTML read them from this one place, so the served HTML and the
// live page can never disagree.
//
// NODE-SAFE BY CONTRACT: no imports, no DOM, no `import.meta.env`.

/** The wordmark's name, then its phosphor-bright suffix (`makeWordmark`). */
export const WORDMARK_NAME = 'HULLCRACKER';
export const WORDMARK_TLD = '.IO';

/** The wordmark's full words, as the live mark's `textContent` reads. */
export function wordmarkText(): string {
  return WORDMARK_NAME + WORDMARK_TLD;
}

/**
 * The How-to-Play page's URL (Story 7.3). Not a `CLIENT_CONFIG` entry:
 * `consent.policyHref` earns its config home because two surfaces must agree on
 * it; this one is read by the home's link and its prerendered twin only.
 */
export const HOWTO_HREF = '/how-to-play';

/** The underplay row's two static-page link labels. */
export const HOWTO_LINK_LABEL = 'HOW TO PLAY';
export const PRIVACY_LINK_LABEL = 'PRIVACY';

/** The static pages' back words (`renderPage`'s default back label). */
export const BACK_TO_PORT_LABEL = 'BACK TO PORT';

/** The home's version line. */
export function versionLine(version: string): string {
  return `v${version}`;
}
