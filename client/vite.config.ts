import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Variant P (Story 4.2, amendment 13): phosphor-anonymous blips. A BUILD
    // define, default Variant C — set HC_BLIP_VARIANT_P=1 in the build env to
    // produce a Variant P bundle for a side-by-side on water.
    __BLIP_VARIANT_P__: JSON.stringify(process.env.HC_BLIP_VARIANT_P === '1'),
  },
  resolve: {
    alias: {
      '@salvo/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
