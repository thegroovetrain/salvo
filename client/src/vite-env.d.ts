/// <reference types="vite/client" />

/** App version injected by Vite from the root package.json (vite.config.ts define). */
declare const __APP_VERSION__: string;

/** Variant P (Story 4.2): phosphor-anonymous blips, injected by Vite. Default
 *  false = Variant C, the ratified personal-hue grammar. See config.ts's
 *  `BLIP_VARIANT_P`, which is the only place this global should be read. */
declare const __BLIP_VARIANT_P__: boolean;
