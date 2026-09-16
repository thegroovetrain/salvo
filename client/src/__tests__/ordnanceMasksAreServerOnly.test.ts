// THE ORDNANCE MASKS ARE SERVER-ONLY (Story 8.4, AR44) — a grep pin over the
// whole client source.
//
// Story 8.4 added a `hits` row to six `CONFIG.<ordnance>` blocks (the KINDS of
// thing each weapon's projectiles may touch) and a `hits` field to
// `ShellState`. It deliberately did NOT bump `PROTOCOL_VERSION`, on one
// condition: THE CLIENT NEVER READS EITHER. A mask is a server-side collision
// decision; the client predicts no ordnance and resolves no hits, so nothing on
// this side has a use for it.
//
// WHY A TEXT SCAN AND NOT A TYPE CHECK. `CONFIG` is shared, so `CONFIG.gun.hits`
// compiles perfectly well in a client module — a reader would be legal, silent,
// and would quietly turn a server-side tuning field into a wire contract that
// a protocol bump has to protect. The scan catches the intent at the moment it
// is written, in a render module, a prediction path or an aim preview alike.
//
// If a later story genuinely needs a mask client-side (a render tell that
// depends on what a weapon can hit), that is a wire-contract change: bump
// `PROTOCOL_VERSION` and retire this pin deliberately, with a note.
//
// The `__tests__` tree is excluded, so this file does not trip its own pin.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROTOCOL_VERSION } from '@salvo/shared';

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

describe('the ordnance `hits` masks never reach the client (Story 8.4)', () => {
  it('scans a non-trivial number of sources (the pin is not silently empty)', () => {
    expect(FILES.length).toBeGreaterThan(20);
  });

  it('no client source reads a `.hits` mask', () => {
    const offenders = FILES.filter((f) => /\.hits\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('no client source names `TargetKind` or builds an ordnance `Target`', () => {
    const offenders = FILES.filter((f) => /\bTargetKind\b/.test(readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('and so PROTOCOL_VERSION stays 51 — Story 8.4 changes no wire contract', () => {
    expect(PROTOCOL_VERSION).toBe(51);
  });
});
