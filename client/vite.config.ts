import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

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
  resolve: {
    alias: {
      '@salvo/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
}));
