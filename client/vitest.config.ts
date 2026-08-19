import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
    // The perf build's define (Story 7.1). FALSE under test, matching the
    // shipped build rather than the instrument: a test that ran with the perf
    // door open would be testing a bundle nobody deploys.
    __HC_PERF__: JSON.stringify(false),
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
