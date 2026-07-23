// Design-token guardrails (Story 1.11 — UX-DR1). Layers:
//   (a) guard scan — no color literal may live outside the token source. A
//       SINGLE traversal collects {path, body} for every .ts/.tsx/.js/.css under
//       client/src (plus client/index.html), excluding __tests__ dirs and ONLY
//       the exact path client/src/config.ts (the token source — a future
//       render/config.ts is still scanned). Whole-text GLOBAL regexes report
//       EVERY hex / 0x-color / numeric-channel rgb()·hsl() literal with a
//       file:line computed from the match index. The sole sanctioned exceptions
//       are index.html's single #050807 FOUC guard and util/color.ts's 0xffffff
//       RGB channel MASK (a bitmask, not a color).
//   (b) retirement asserts — the deprecated prototype values (surfaces 111111 /
//       232937, the DOM denied 5a6478 muted, and the retired DOM red ff3b30 —
//       NOT the surviving ratified denied ff3b3b) appear nowhere in the scanned
//       sources, config.ts, or theme.ts.
//   (c) identity pins — the FULL ratified table resolves to its DESIGN.md
//       values (this test is the one sanctioned duplicate of the values: it
//       exists to catch token-value typos), the Regatta wheel is exactly 20
//       unique hues, the legacy carry-overs stay byte-identical, and the type
//       ramp registers carry their documented sizes/weights/tracking.
//   (d) util/color hardening — the numeric→CSS projectors mask inputs to 24
//       bits and clamp alpha, so no input yields malformed output.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENT_CONFIG } from '../config.js';
import { cssHex, cssRgba } from '../util/color.js';

// vitest's root is the client workspace dir, so process.cwd() === client/.
const CWD = process.cwd();
const SRC_DIR = join(CWD, 'src'); // client/src
const INDEX_HTML = join(CWD, 'index.html');
const CONFIG_PATH = join(SRC_DIR, 'config.ts'); // the token source — excluded by FULL PATH

interface ScanFile {
  path: string;
  body: string;
}

const SCAN_EXT = /\.(ts|tsx|js|css)$/;

/** Single traversal → {path, body} for every scannable source. Skips __tests__
 *  dirs and the exact config.ts path (full-path compare, not entry.name). */
function collect(dir: string, out: ScanFile[]): ScanFile[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') collect(full, out);
    } else if (SCAN_EXT.test(entry.name) && full !== CONFIG_PATH) {
      out.push({ path: full, body: readFileSync(full, 'utf8') });
    }
  }
  return out;
}

const FILES: ScanFile[] = collect(SRC_DIR, []);
FILES.push({ path: INDEX_HTML, body: readFileSync(INDEX_HTML, 'utf8') });

function rel(p: string): string {
  return p.startsWith(CWD) ? p.slice(CWD.length + 1) : p;
}

// Color-literal shapes (GLOBAL — every match reported). Longest alternative
// first + a trailing negative lookahead so a longer non-color hex constant
// (e.g. a 7/9/12-digit value) can never false-positive on a 6/8-digit prefix.
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const HEX0X = /0[xX](?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g;
// rgb()/hsl() only count with a NUMERIC first channel (whitespace/newline
// tolerant via \s), so cssRgba(token, a) call sites (identifier channel) and
// bare `rgba` words never false-positive.
const RGB = /(?:rgba?|hsla?)\(\s*[\d.]/gi;
const PATTERNS = [HEX, HEX0X, RGB];

/** The two sanctioned technical literals. */
function allowed(path: string, match: string): boolean {
  if (path.endsWith('index.html') && match === '#050807') return true; // FOUC guard
  // util/color.ts's 0xffffff is the RGB channel MASK (`(n>>>0) & 0xffffff`), a
  // bitmask — not a color literal.
  if (path.endsWith(join('util', 'color.ts')) && match.toLowerCase() === '0xffffff') return true;
  return false;
}

function lineOf(body: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (body[i] === '\n') line++;
  return line;
}

interface Violation {
  file: string;
  line: number;
  match: string;
}

function scan(file: ScanFile): Violation[] {
  const found: Violation[] = [];
  for (const re of PATTERNS) {
    for (const m of file.body.matchAll(re)) {
      if (!allowed(file.path, m[0])) {
        found.push({ file: rel(file.path), line: lineOf(file.body, m.index ?? 0), match: m[0] });
      }
    }
  }
  return found;
}

describe('(a) guard scan — no color literal outside the token source', () => {
  it('finds zero disallowed hex / 0x / rgb()·hsl() literals across scanned sources', () => {
    const violations = FILES.flatMap(scan);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('index.html holds exactly one #050807 and no other color literal', () => {
    const html = readFileSync(INDEX_HTML, 'utf8');
    expect([...html.matchAll(HEX)].map((m) => m[0])).toEqual(['#050807']);
    expect([...html.matchAll(HEX0X)]).toEqual([]);
    expect([...html.matchAll(RGB)]).toEqual([]);
  });
});

describe('(b) retirement asserts — deprecated prototype values are gone', () => {
  // ff3b30 is the RETIRED DOM red; ff3b3b is the SURVIVING ratified denied red
  // (must NOT be listed here). Scan every collected file plus config.ts (the one
  // scan-excluded file) — theme.ts is already in FILES.
  const RETIRED = ['111111', '232937', 'ff3b30', '5a6478'];
  const HAYSTACK: ScanFile[] = [...FILES, { path: CONFIG_PATH, body: readFileSync(CONFIG_PATH, 'utf8') }];

  for (const needle of RETIRED) {
    it(`"${needle}" appears nowhere in scanned sources, config.ts, or theme.ts`, () => {
      const hits = HAYSTACK.filter((f) => f.body.toLowerCase().includes(needle)).map((f) => rel(f.path));
      expect(hits).toEqual([]);
    });
  }
});

describe('(c) identity pins — the full ratified table, values and counts', () => {
  const C = CLIENT_CONFIG.colors;

  it('pins every surface / linework / functional / effect / drone / utility value', () => {
    // surfaces
    expect(C.void).toBe(0x050807);
    expect(C.fogBase).toBe(0x020604);
    expect(C.panel).toBe(0x0a0f0d);
    expect(C.panelDeep).toBe(0x070b0a);
    expect(C.cardScrim).toBe(0x030605);
    expect(C.hairline).toBe(0x1b2621);
    // linework & text
    expect(C.silver).toBe(0xc0c0c0);
    expect(C.textPrimary).toBe(0xe2e8f0);
    expect(C.textSecondary).toBe(0x8b95a5);
    expect(C.textMuted).toBe(0x7a8496);
    // functional
    expect(C.phosphor).toBe(0x00ff88);
    expect(C.phosphorBright).toBe(0x7fffc4);
    expect(C.blipFresh).toBe(0x66ffaa);
    expect(C.blipFaded).toBe(0x0a3d20);
    expect(C.amber).toBe(0xffb800);
    expect(C.storm).toBe(0x7b2fbe);
    expect(C.stormReadout).toBe(0xb06ee8);
    expect(C.info).toBe(0x38bdf8);
    expect(C.danger).toBe(0x8b2020);
    expect(C.denied).toBe(0xff3b3b);
    expect(C.damage).toBe(0x8b0000);
    expect(C.damageMarker).toBe(0xff6666);
    expect(C.islandFill).toBe(0x2a2410);
    expect(C.islandStroke).toBe(0x8b7520);
    // combat effects
    expect(C.splash).toBe(0xb8ccc6);
    expect(C.muzzle).toBe(0xe8f2ec);
    expect(C.torpedo).toBe(0xcfe8dd);
    expect(C.hitBloom).toBe(0xff9d3d);
    expect(C.woundedSmoke).toBe(0x7a7168);
    // drones
    expect(C.droneOutline).toBe(0x9aa3b2);
    expect(C.droneFill).toBe(0x454950);
    // utility
    expect(C.black).toBe(0x000000);
    expect(C.white).toBe(0xffffff);
  });

  it('pins the 20-hue Regatta wheel, all values unique', () => {
    expect(C.players).toEqual({
      lemon: 0xfff04d,
      chartreuse: 0xc8e619,
      olive: 0x7a9b0f,
      lime: 0x7fe03a,
      green: 0x23b123,
      spring: 0x37f2d8,
      jade: 0x0b9e8f,
      aqua: 0x40e4ee,
      cyan: 0x00d0ff,
      lagoon: 0x0e7fa0,
      sky: 0x6fc7ff,
      azure: 0x0f6fd6,
      cobalt: 0x5468ff,
      periwinkle: 0x96a6ff,
      iris: 0xa66bff,
      orchid: 0xc026d3,
      fuchsia: 0xe14dff,
      magenta: 0xff4fd8,
      mulberry: 0xb01772,
      rose: 0xff85b3,
    });
    const values = Object.values(C.players);
    expect(values).toHaveLength(20);
    expect(new Set(values).size).toBe(20);
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

  it('pins the DESIGN.md type ramp registers', () => {
    const R = CLIENT_CONFIG.type.registers;
    expect(R.label.size).toBe(11);
    expect(R.label.weight).toBe(500);
    expect(R.label.tracking).toBe('0.1em');
    expect(R.hudMicro.size).toBe(9);
    expect(R.hudMicro.tracking).toBe('0.18em');
  });
});

describe('(d) util/color hardening — masked, clamped, well-formed output', () => {
  it('cssHex formats normal / black / white', () => {
    expect(cssHex(0x123456)).toBe('#123456');
    expect(cssHex(0x000000)).toBe('#000000');
    expect(cssHex(0xffffff)).toBe('#ffffff');
  });

  it('cssHex masks out-of-range inputs to 24 bits', () => {
    expect(cssHex(-1)).toBe('#ffffff'); // (-1 >>> 0) & 0xffffff
    expect(cssHex(0x1000000)).toBe('#000000'); // 25th bit dropped
    expect(cssHex(0xff123456)).toBe('#123456'); // stray high byte stripped
  });

  it('cssRgba formats channels and passes in-range alpha', () => {
    expect(cssRgba(0xff0000, 0.5)).toBe('rgba(255, 0, 0, 0.5)');
    expect(cssRgba(0x000000, 1)).toBe('rgba(0, 0, 0, 1)');
    expect(cssRgba(0xffffff, 0)).toBe('rgba(255, 255, 255, 0)');
  });

  it('cssRgba clamps out-of-range alpha and masks the color', () => {
    expect(cssRgba(0x000000, 2)).toBe('rgba(0, 0, 0, 1)');
    expect(cssRgba(0x000000, -1)).toBe('rgba(0, 0, 0, 0)');
    expect(cssRgba(0x1ffffff, 0.25)).toBe('rgba(255, 255, 255, 0.25)');
  });
});
