/// <reference types="vite/client" />

/** App version injected by Vite from the root package.json (vite.config.ts define). */
declare const __APP_VERSION__: string;

/**
 * TRUE ONLY IN THE PERF BUILD (`vite build --mode perf`, Story 7.1) — the
 * second, deliberate door to the staged worst-case scene, so NFR1 can be
 * measured on a production-identical bundle instead of a dev server.
 *
 * `false` in `npm run build` AND in `npm run dev` (the dev door is
 * `import.meta.env.DEV`), so in the shipped artifact the stage gate folds to
 * `(false || false) && …` and the whole `src/stage/*` graph is dead-stripped.
 * See client/vite.config.ts for the full rationale.
 */
declare const __HC_PERF__: boolean;

// (`__BLIP_VARIANT_P__` retired in cycle 51; the per-room radar-mode flags
// that replaced it were themselves deleted in cycle 105 — there is exactly
// one radar grammar, so nothing is announced and nothing is defined.)
