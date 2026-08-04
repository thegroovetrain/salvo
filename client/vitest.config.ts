import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    // Tests run the SHIPPING variant (C) — Variant P is a build-time A/B, not a
    // behavior the suite pins.
    __BLIP_VARIANT_P__: JSON.stringify(false),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
  },
  resolve: {
    alias: [
      { find: '@salvo/shared', replacement: path.resolve(__dirname, '../shared/src/index.ts') },
    ],
  },
});
