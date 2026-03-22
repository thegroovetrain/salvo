import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@salvo/shared': path.resolve(__dirname, '../shared/src/types.ts'),
    },
  },
});
