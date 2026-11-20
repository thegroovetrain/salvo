import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
    // The match ledger (Story 12.1) must never open a real database because a
    // shell happened to export one: importing app.config.ts boots the writer
    // from process.env. Tests that want a store pass their own env/target.
    env: { DATABASE_URL: '', HC_DEV_DB: '' },
  },
  resolve: {
    alias: [
      { find: '@salvo/shared', replacement: path.resolve(__dirname, '../shared/src/index.ts') },
    ],
  },
});
