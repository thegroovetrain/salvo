import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

/** The connect-style middleware shape the dev server's `use()` takes. Declared
 *  locally so this config needs no `@types/connect` dependency. */
type DevMiddleware = (
  req: { url?: string },
  res: { statusCode: number; setHeader: (k: string, v: string) => void; end: () => void },
  next: () => void,
) => void;

// THE FUNCTION FORM IS LOAD-BEARING (Story 7.1). This took a plain object until
// this cycle; the perf build needs `mode`, which is the ONE input separating a
// measurable build from the shipped one.
export default defineConfig(({ mode }) => ({
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
     * TWO ENTRIES (Story 7.2, Eric ruling R8 — the policy lives at `/privacy`).
     *
     * `main` is the entry Vite already used by default; naming it explicitly is
     * required, because the moment `input` is given it REPLACES the default
     * rather than adding to it, and omitting `main` would ship a site that is
     * nothing but a privacy policy.
     *
     * Rollup keys the emitted path off the entry's path relative to the project
     * root, so `client/privacy/index.html` lands at `dist/privacy/index.html` —
     * which `express.static` (server/src/app.config.ts) serves at `/privacy`,
     * byte-identical to the URL Eric picked (it 301s to `/privacy/` and serves
     * the directory index, exactly as it does for `/`).
     *
     * THE DEV SERVER DOES NOT DO THAT BY ITSELF — see `hc-privacy-dev-url`
     * below. Vite's SPA html-fallback answers a bare `/privacy` with the GAME,
     * so without the plugin the link on home would look broken in `npm run dev`
     * and work in production, which is the worst way round.
     *
     * NOTHING ELSE ABOUT THE BUILD MOVES. `build:perf`'s `--mode perf
     * --outDir dist-perf` still governs where output goes, so the perf build
     * simply emits both entries into `dist-perf`; the shipped `dist` is
     * unchanged apart from gaining the second page, and NFR17's
     * `--verify-bundle` grep still finds no instrument in it (the policy page's
     * module graph is the theme bridge, the page chrome and its copy — no Pixi,
     * no stage, no analytics).
     */
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        privacy: resolve(__dirname, 'privacy/index.html'),
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
      name: 'hc-privacy-dev-url',
      apply: 'serve' as const,
      configureServer(server: { middlewares: { use: (fn: DevMiddleware) => void } }) {
        server.middlewares.use((req, res, next) => {
          const path = (req.url ?? '').split('?')[0];
          if (path !== '/privacy') return next();
          res.statusCode = 301;
          res.setHeader('Location', '/privacy/');
          res.end();
        });
      },
    },
  ],
}));
