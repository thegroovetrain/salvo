import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    passWithNoTests: true,
  },
  resolve: {
    alias: [
      { find: '@salvo/shared', replacement: path.resolve(__dirname, '../shared/src/index.ts') },
    ],
  },
});
