// Search-engine exclusion for non-production hosts (cycle 127). An ops
// surface, NOT sim — the log.ts / metrics.ts / liveness.ts family.
//
// WHY THIS EXISTS. Cycle 127 stood up a second Render service, `hullcracker-dev`,
// which builds the `development` branch and serves a byte-identical copy of the
// game at its own *.onrender.com hostname. Nothing in the build carries a
// robots.txt, a `<link rel="canonical">`, an og:url or a noindex of any kind —
// verified across all three Vite entries (`/`, `/privacy`, `/how-to-play`) —
// and the server serves `client/dist` bare through `express.static`. So the
// staging host would be fully crawlable and would duplicate hullcracker.io's
// pages against the exact domain the AdSense approval and the GA4 property are
// tied to. The dev service creates that exposure, so the dev service closes it.
//
// WHY A HEADER AND NOT A robots.txt. robots.txt asks a crawler not to FETCH a
// URL; it does not stop that URL being INDEXED when it is discovered some other
// way (a link, a sitemap, a referrer). `X-Robots-Tag: noindex` is the directive
// that actually keeps a page out of the index, and as a header it covers every
// response — the three HTML entries, their assets, and any route added later —
// without a file that has to be remembered and kept in sync.
//
// PRODUCTION IS UNTOUCHED. `HC_NOINDEX` is unset there, `noIndexEnabled()` is
// false, and `app.config.ts` never mounts the middleware at all — so there is
// no header, and no per-request work, on the public game.
//
// The env read is LAZY, per call rather than at module load, following the
// HC_DEBUG precedent in log.ts: it lets a test flip process.env between cases
// without re-importing the module.

import type { Request, Response, NextFunction } from 'express';

/** The exact directive sent. `nofollow` rides along so a crawler that reaches
 *  a staging page does not walk it into more staging pages. */
export const ROBOTS_TAG = 'noindex, nofollow';

/** True only for the explicit opt-in string. Anything else — unset, '0',
 *  'true', '' — leaves the host indexable, so a typo fails toward production
 *  behaviour rather than silently de-indexing the real game. */
export function noIndexEnabled(): boolean {
  return process.env.HC_NOINDEX === '1';
}

/** Stamps every response with the exclusion directive. Mounted ahead of
 *  `express.static` so it covers the served client, not just the API. */
export function robotsTagMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader('X-Robots-Tag', ROBOTS_TAG);
  next();
}
