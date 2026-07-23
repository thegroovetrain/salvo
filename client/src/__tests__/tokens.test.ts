// Design-token guardrails (Story 1.11 — UX-DR1). Three layers:
//   (a) guard scan — no color literal may live outside the token source. Walks
//       every client/src/**/*.ts (except this __tests__ dir and config.ts, the
//       token source itself) plus index.html, and asserts zero hex / 0x-color /
//       numeric-channel rgba()·hsl() literals — the sole sanctioned exception is
//       index.html's single #050807 FOUC guard. A stray literal fails CI with a
//       file:line. If a genuine NON-color six-hex 0x constant is ever added, add
//       an explicit allowlist entry with a comment (none exist today).
//   (b) retirement asserts — the deprecated prototype values (surfaces #111111 /
//       #232937, the DOM denied #5A6478 muted, and the pre-consolidation denied
//       red spelled ff3b3b) appear nowhere in the swept source.
//   (c) identity pins — ratified names resolve to their DESIGN.md values, the
//       Regatta wheel is exactly 20 hues, and the legacy carry-overs stay
//       byte-identical.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_CONFIG } from '../config.js';

// vitest's root is the client workspace dir (vitest.config.ts lives there), so
// process.cwd() === client/. Resolve the scan roots from it.
const SRC_DIR = join(process.cwd(), 'src'); // client/src
const INDEX_HTML = join(process.cwd(), 'index.html');

/** Recursively collect scannable .ts files, skipping __tests__ and config.ts. */
function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') collectTsFiles(full, out);
    } else if (entry.name.endsWith('.ts') && entry.name !== 'config.ts') {
      out.push(full);
    }
  }
  return out;
}

// Color-literal shapes. `rgba(`/`hsl(` only count with a NUMERIC first channel,
// so cssRgba(token, a) call sites (identifier channel) never false-positive.
const COLOR_PATTERNS: Array<[string, RegExp]> = [
  ['hex', /#[0-9a-fA-F]{3,8}/],
  ['0x-color', /0x[0-9a-fA-F]{6}(?![0-9a-fA-F])/],
  ['rgb/hsl', /(?:rgba?|hsla?)\(\s*[\d.]/i],
];

interface Violation {
  file: string;
  line: number;
  match: string;
}

/** Scan one file's text; `allow` filters out sanctioned matches (index.html). */
function scanText(file: string, text: string, allow: (m: string) => boolean): Violation[] {
  const found: Violation[] = [];
  text.split('\n').forEach((lineText, i) => {
    for (const [, re] of COLOR_PATTERNS) {
      const m = re.exec(lineText);
      if (m && !allow(m[0])) found.push({ file, line: i + 1, match: m[0] });
    }
  });
  return found;
}

describe('(a) guard scan — no color literal outside the token source', () => {
  it('finds zero hex / 0x / rgba color literals across client/src *.ts', () => {
    const violations = collectTsFiles(SRC_DIR).flatMap((f) =>
      scanText(f.slice(SRC_DIR.length), readFileSync(f, 'utf8'), () => false),
    );
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('allows only the single #050807 FOUC guard in index.html', () => {
    const text = readFileSync(INDEX_HTML, 'utf8');
    const violations = scanText('index.html', text, (m) => m === '#050807');
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
    // And that sanctioned literal really is present (the guard is load-bearing).
    expect(text).toContain('#050807');
  });
});

describe('(b) retirement asserts — deprecated prototype values are gone', () => {
  const RETIRED = ['111111', '232937', 'ff3b3b', '5a6478'];
  const bodies = collectTsFiles(SRC_DIR).map((f) => readFileSync(f, 'utf8').toLowerCase());

  for (const needle of RETIRED) {
    it(`"${needle}" appears nowhere in the swept source`, () => {
      const hits = collectTsFiles(SRC_DIR).filter((_, i) => bodies[i].includes(needle));
      expect(hits.map((h) => h.slice(SRC_DIR.length))).toEqual([]);
    });
  }
});

describe('(c) identity pins — ratified names, values, and counts', () => {
  const C = CLIENT_CONFIG.colors;

  it('pins the consolidated + lightened + surface tokens', () => {
    expect(C.denied).toBe(0xff3b3b); // the single denied red
    expect(C.textMuted).toBe(0x7a8496); // lightened from #5A6478 per validation
    expect(C.panel).toBe(0x0a0f0d);
    expect(C.void).toBe(0x050807);
    expect(C.storm).toBe(0x7b2fbe);
    expect(C.stormReadout).toBe(0xb06ee8);
  });

  it('has exactly 20 Regatta personal hues', () => {
    expect(Object.keys(C.players)).toHaveLength(20);
  });

  it('keeps the legacy carry-overs byte-identical to the pre-1.11 literals', () => {
    expect(C.legacy).toEqual({
      ownHull: 0x00ff88,
      enemyHull: 0xffb800,
      ownAssetGreen: 0x2f7d5a,
      shellCore: 0xffe08a,
      torpGlow: 0x3fbf8f,
      torpWake: 0x9fd8c4,
    });
  });
});
