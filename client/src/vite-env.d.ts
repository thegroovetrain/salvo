/// <reference types="vite/client" />

/** App version injected by Vite from the root package.json (vite.config.ts define). */
declare const __APP_VERSION__: string;

// (`__BLIP_VARIANT_P__` retired in cycle 50 — the radar grammar is a server
// flag announced in the welcome handshake, not a build-time client define.)
