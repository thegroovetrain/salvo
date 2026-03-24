import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: [
      { find: '@salvo/shared/hex', replacement: path.resolve(__dirname, '../shared/src/hex.ts') },
      { find: '@salvo/shared', replacement: path.resolve(__dirname, '../shared/src/types.ts') },
    ],
  },
});
