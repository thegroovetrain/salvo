// @vitest-environment node
//
// THE BUILD RUNS THE CRAWLABLE BUILDER IN PLAIN NODE (Story 13.1). The config
// loads `seo/crawlable.ts` outside any browser, so its whole import graph must
// be Node-safe: no `document`, no `window`, nothing DOM-shaped at module scope.
// This file runs in the node environment — the import below throws if anything
// in that graph touches the DOM — and builds the three real source documents.
// Structure only, by string: there is no DOM here to parse with.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crawlableDocument } from '../seo/crawlable.js';

const OPTS = { version: '9.9.9', community: [] };
const DOCS = ['index.html', 'how-to-play/index.html', 'privacy/index.html'] as const;

const count = (html: string, re: RegExp): number => (html.match(re) ?? []).length;

describe('the crawlable builder in plain Node', () => {
  it('runs with no DOM at all', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });

  for (const rel of DOCS) {
    it(`${rel}: one h1, a main, a nav, a canonical, and no added script`, () => {
      const abs = join(process.cwd(), rel);
      const source = readFileSync(abs, 'utf8');
      const out = crawlableDocument(source, abs, OPTS);
      expect(count(out, /<h1\b/gi)).toBe(1);
      expect(count(out, /<main\b/gi)).toBe(1);
      expect(count(out, /<nav\b/gi)).toBe(1);
      expect(count(out, /<link\b[^>]*rel="canonical"/gi)).toBe(1);
      expect(count(out, /<script\b/gi)).toBe(count(source, /<script\b/gi));
    });
  }
});
