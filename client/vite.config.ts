import { defineConfig, loadEnv } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// The PURE half of the ad-tag injection. `src/ads/adsense.ts` is the only file
// that names the vendor's origin or client ID; this config names neither.
import { adsTxtContent, injectAdsHead, isGameIndexPath } from './src/ads/adsHead.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

/** The connect-style middleware shape the dev server's `use()` takes. Declared
 *  locally so this config needs no `@types/connect` dependency. */
type DevServer = { middlewares: { use: (fn: DevMiddleware) => void } };

type DevMiddleware = (
  req: { url?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void },
  next: () => void,
) => void;

/**
 * THE BARE PATHS THAT NEED THE TRAILING-SLASH 301. One entry per static page
 * (Story 7.3 made this a LIST rather than a second copy of the same middleware:
 * two hand-written redirects are two chances for the third page to drift from
 * the second).
 *
 * `/privacy` -> `/privacy/`, the same 301 `express.static` issues in production.
 * The QUERY STRING IS CARRIED (review gate): dropping it made a dev redirect
 * diverge from prod for any link carrying `?utm_source=`, which is exactly the
 * kind of link these pages get shared with. Matches the bare path ONLY, so
 * `/privacyfoo` and every asset under `/privacy/` fall straight through.
 */
const STATIC_PAGE_PATHS = ['/privacy', '/how-to-play'] as const;

/** The Rollup emit context `generateBundle` is called with. Declared locally so
 *  this config needs no `rollup` type import. */
type EmitContext = { emitFile: (file: { type: 'asset'; fileName: string; source: string }) => void };

const staticPageRedirect: DevMiddleware = (req, res, next) => {
  const url = req.url ?? '';
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  if (!(STATIC_PAGE_PATHS as readonly string[]).includes(path)) return next();
  res.statusCode = 301;
  res.setHeader('Location', q === -1 ? `${path}/` : `${path}/${url.slice(q)}`);
  res.end();
};

/**
 * THE ADSENSE HEAD INJECTION + `ads.txt` (Story 7.4).
 *
 * Everything this plugin DECIDES lives in `src/ads/adsHead.ts` as pure
 * functions, so it is unit-tested without running a build; what is left here is
 * the two Vite hooks. Both are gated on the publisher ID, so an unconfigured
 * build injects nothing and emits no `ads.txt` — which matters because an
 * `ads.txt` is authoritative BY OMISSION, and a wrong or partial one is strictly
 * worse than none.
 *
 * `order: 'pre'` puts our block in before any other html transform can reorder
 * the head. The page filter is `isGameIndexPath`: the loader ships on the GAME's
 * entry only, so `/privacy` and `/how-to-play` load no Google ADVERTISING or
 * ANALYTICS script, and an EEA visitor reading the policy is shown no dialog and
 * given no cookie there.
 *
 * THE `injected` FLAG IS THE POINT OF THE CLOSURE. The emit used to be gated on
 * the client ID being non-empty, which is a WEAKER statement than the one
 * `ads.txt` makes: `injectAdsHead` never throws and silently returns the html
 * unchanged on a malformed ID or a document with no `</head>`, so a build could
 * publish a file authorising Google to sell inventory on a page carrying no ad
 * code at all. The two are now the same fact — reported by the transform rather
 * than assumed — and it lives per plugin instance rather than at module scope so
 * two builds in one process cannot inherit each other's answer.
 */
function adsensePlugin(adsClient: string) {
  let injected = false;
  return {
    name: 'hc-adsense',
    transformIndexHtml: {
      order: 'pre' as const,
      handler(html: string, ctx: { filename: string }) {
        if (!isGameIndexPath(ctx.filename)) return html;
        const out = injectAdsHead(html, adsClient);
        if (out.injected) injected = true;
        return out.html;
      },
    },
    generateBundle(this: EmitContext) {
      if (!injected) return;
      this.emitFile({ type: 'asset', fileName: 'ads.txt', source: adsTxtContent(adsClient) });
    },
  };
}

// THE FUNCTION FORM IS LOAD-BEARING (Story 7.1). This took a plain object until
// this cycle; the perf build needs `mode`, which is the ONE input separating a
// measurable build from the shipped one.
export default defineConfig(({ mode }) => {
  /**
   * THE ONE SWITCH THE WHOLE AD LAYER HANGS OFF (Story 7.4).
   *
   * `loadEnv` is what makes a Render build and a local `.env` agree: it merges
   * `process.env`'s `VITE_`-prefixed vars with the `.env` files Vite would load
   * anyway, which is exactly the set `import.meta.env.VITE_ADSENSE_CLIENT` will
   * resolve to at runtime. One value, read once, drives the head injection and
   * `ads.txt` alike — an unconfigured build emits neither and is byte-identical
   * to the pre-7.4 artifact.
   */
  const adsClient = (loadEnv(mode, __dirname, 'VITE_').VITE_ADSENSE_CLIENT ?? '').trim();

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    /**
     * THE PERF BUILD (Story 7.1) — true under `vite build --mode perf`, and
     * nowhere else.
     *
     * NFR1's whole-frame verdict was unobtainable BY CONSTRUCTION: the only
     * split sim/render instrument (client/src/stage/worstCase.ts) is reachable
     * only under `import.meta.env.DEV`, while Eric's 2026-08-11 ruling makes a
     * Vite DEV build an invalid basis for the verdict at all ("the dev build
     * runs poorly on my machine"). "Valid basis" and "has an instrument" were
     * mutually exclusive. This define breaks the deadlock: `--mode perf` runs
     * the IDENTICAL Rollup pipeline, the identical minification and the
     * identical folded-away dev branches — one extra define is the whole
     * difference between it and the shipped artifact.
     *
     * IT DEFAULTS TO `false`, WHICH IS THE ENTIRE SAFETY ARGUMENT. In the
     * shipped `npm run build` the stage gate reads `(false || false) && …`, so
     * the branch, its dynamic import and the whole `src/stage/*` module graph
     * behind it are dead-stripped exactly as they were before this existed.
     * That claim is CHECKED, never asserted — `client/scripts/
     * readabilityCapture.mjs --verify-bundle` greps the built assets for
     * `STAGE_MARKER`.
     *
     * The perf build writes to `dist-perf` (see client/package.json), never
     * over the shipped `dist`, so an instrumented artifact cannot be deployed
     * by accident.
     */
    __HC_PERF__: JSON.stringify(mode === 'perf'),
    // (The Story 4.2 `__BLIP_VARIANT_P__` define is retired — cycle 50,
    // amendment 52. The radar grammar is now a SERVER flag announced in the
    // welcome handshake, so a build-time client variant would only repaint a
    // wire that still carried the identity superset.)
  },
  build: {
    /**
     * THREE ENTRIES (Story 7.2 added `/privacy`; Story 7.3 adds
     * `/how-to-play`).
     *
     * `main` is the entry Vite already used by default; naming it explicitly is
     * required, because the moment `input` is given it REPLACES the default
     * rather than adding to it, and omitting `main` would ship a site that is
     * nothing but static pages.
     *
     * Rollup keys the emitted path off the entry's path relative to the project
     * root, so `client/privacy/index.html` lands at `dist/privacy/index.html` —
     * which `express.static` (server/src/app.config.ts) serves at `/privacy`,
     * byte-identical to the URL Eric picked (it 301s to `/privacy/` and serves
     * the directory index, exactly as it does for `/`).
     *
     * THE DEV SERVER DOES NOT DO THAT BY ITSELF — see `hc-static-page-dev-url`
     * below. Vite's SPA html-fallback answers a bare `/privacy` with the GAME,
     * so without the plugin the link on home would look broken in `npm run dev`
     * and work in production, which is the worst way round.
     *
     * NOTHING ELSE ABOUT THE BUILD MOVES. `build:perf`'s `--mode perf
     * --outDir dist-perf` still governs where output goes, so the perf build
     * simply emits every entry into `dist-perf`; the shipped `dist` is
     * unchanged apart from gaining the static pages, and NFR17's
     * `--verify-bundle` grep still finds no instrument in it (the policy page's
     * module graph is the theme bridge, the page chrome and its copy — no Pixi,
     * no stage, no analytics).
     */
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
        'how-to-play': resolve(__dirname, 'how-to-play/index.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@salvo/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
  plugins: [
    {
      /**
       * MAKE `/privacy` MEAN IN DEV WHAT IT MEANS IN PRODUCTION (Story 7.2).
       *
       * `express.static` redirects a bare directory path to its trailing-slash
       * form and serves the index; Vite's dev server instead hands `/privacy`
       * to the SPA html-fallback, which returns the game. The URL Eric ruled on
       * is `/privacy`, and the home link, the privacy policy's own canonical
       * address and any QA pass all use it — so dev has to agree with prod or
       * every check of this feature is run against the wrong page.
       *
       * `apply: 'serve'` keeps this out of every build; it is a dev-server
       * convenience with no shipped counterpart. The redirect is the same 301
       * production issues, so the two behave identically rather than merely
       * both working.
       */
      name: 'hc-static-page-dev-url',
      apply: 'serve' as const,
      configureServer(server: DevServer) {
        server.middlewares.use(staticPageRedirect);
      },
      // `vite preview` serves the BUILT dist and is the closest local stand-in
      // for production, so it needs the same redirect: `apply: 'serve'` covers
      // the dev server only, and without this `/privacy` behaved differently in
      // preview than in either dev or prod (review gate).
      configurePreviewServer(server: DevServer) {
        server.middlewares.use(staticPageRedirect);
      },
    },
    adsensePlugin(adsClient),
  ],
  };
});
