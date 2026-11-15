// Build the rain-sight bench into ONE self-contained HTML file.
// Usage (from the repo root): node bench/rain-sight/build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const res = await build({
  entryPoints: [resolve(here, 'src/main.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  write: false,
  logLevel: 'warning',
  alias: {
    'pixi.js': resolve(root, 'node_modules/pixi.js'),
    '@salvo/shared': resolve(root, 'shared/src/index.ts'),
  },
  define: { __APP_VERSION__: '"bench"', __HC_PERF__: 'false' },
});
const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = readFileSync(resolve(here, 'src/page.html'), 'utf8');
const parts = tpl.split('/*BUNDLE*/');
if (parts.length !== 2) throw new Error('page.html must contain exactly one /*BUNDLE*/ marker');
const out = resolve(here, 'rain-sight.html');
writeFileSync(out, parts[0] + js + parts[1]);
const mb = statSync(out).size / 1e6;
if (mb >= 10) throw new Error(`rain-sight.html is ${mb.toFixed(2)} MB (limit 10 MB)`);
console.log(`built ${out} (${mb.toFixed(2)} MB)`);
