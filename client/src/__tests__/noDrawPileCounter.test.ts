// NO DRAW-PILE COUNTER (Story 8.3) — a grep pin over the whole client source.
//
// Eric, 2026-09-10/11: a HUD readout must EARN its place, and "if the player
// can infer it, do not propose it". The draw-pile counter was deleted on those
// terms — a captain does not need to be told how many cards are left in a pool
// they never see, and a number like that turns a deck into a countdown. Story
// 8.3 makes that a standing rule rather than one deletion: there is no
// `deckLeft` or `deckSize` field on `OwnShip` (shared/src/types.ts), no such
// key in any frame or in the welcome (the server-side pins in
// perception.test.ts and decks.test.ts), and — here — no client symbol that
// names either. `pool` and `remaining` are NOT scanned here — both are
// legitimate words in client code (an object pool, a remaining-count for
// something else entirely) — the drawpile-specific names are what carry the
// intent.
//
// WHY A TEXT SCAN AND NOT A TYPE CHECK. A field with no consumer may not ride
// along "for later": the thing this guards against is someone adding
// `deckLeft`/`deckSize` to the wire BECAUSE a renderer asked for it, or
// leaving a dead reader behind that makes the field look wanted. Neither shows
// up as a type error — a reader of a field nobody sends just reads
// `undefined`. A scan of the source text catches the intent at the moment it
// is written, in a HUD module, a net mirror, a debug overlay or a comment
// alike.
//
// The `__tests__` tree is excluded, so this file (and any future pin that has
// to name the symbol to forbid it) does not trip the pin it enforces.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from THIS file rather than process.cwd(): the scan must cover the
// same tree however the runner was invoked (workspace script, repo root, IDE).
const SRC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..'); // client/src

/** Every `.ts` under client/src except the `__tests__` tree. */
function collect(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') collect(full, out);
    } else if (entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

const FILES = collect(SRC_DIR, []);

function rel(p: string): string {
  return p.startsWith(SRC_DIR) ? join('src', p.slice(SRC_DIR.length + 1)) : p;
}

describe('no draw-pile counter anywhere in the client (Eric 2026-09-10/11)', () => {
  it('scans a non-trivial number of sources (the pin is not silently empty)', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('no client source names `deckLeft`', () => {
    const offenders = FILES.filter((f) => readFileSync(f, 'utf8').includes('deckLeft')).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no client source names `deckSize`', () => {
    const offenders = FILES.filter((f) => readFileSync(f, 'utf8').includes('deckSize')).map(rel);
    expect(offenders).toEqual([]);
  });
});
