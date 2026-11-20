// THE KEYED STREAM SEEDS (Story 12.4 review fix — anti-cheat). The supply
// drops' placement and landing scatter and the level stat roll seed off the
// room's 32-byte dispersion key by HMAC under their own labels
// (`keyedStreamSeed`), never off the 32-bit pseudonym material — a public
// output of a 32-bit `priv ^ K` stream could be brute-forced back to `priv`.
// Pinned here: determinism per key, distinct streams per label and per
// ordinal, a new key moves every stream, and the shell dispersion seed is
// UNCHANGED (still HMAC(key, 8-byte ordinal)).

import { createHmac } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { dispersionShellSeed, keyedStreamSeed, offlineDispersionKey } from '../game/dispersionKey.js';

const KEY_A = offlineDispersionKey(1, 2);
const KEY_B = offlineDispersionKey(1, 3);
const LABELS = ['supply-spot', 'supply-scatter', 'stat-roll'] as const;

describe('keyedStreamSeed', () => {
  it('is a deterministic uint32 per (key, label, ordinals)', () => {
    for (const label of LABELS) {
      const s = keyedStreamSeed(KEY_A, label, 3, 1);
      expect(Number.isInteger(s) && s >= 0 && s <= 0xffffffff).toBe(true);
      expect(keyedStreamSeed(Buffer.from(KEY_A), label, 3, 1)).toBe(s);
    }
  });

  it('every label and every ordinal tuple is its own stream', () => {
    const seen = new Set<number>();
    let n = 0;
    for (const label of LABELS) {
      for (let a = 0; a < 6; a += 1) {
        for (let b = 0; b < 6; b += 1) {
          seen.add(keyedStreamSeed(KEY_A, label, a, b));
          n += 1;
        }
        seen.add(keyedStreamSeed(KEY_A, label, a));
        n += 1;
      }
    }
    expect(seen.size).toBe(n);
  });

  it('another key moves every stream', () => {
    for (const label of LABELS) {
      for (let k = 0; k < 8; k += 1) expect(keyedStreamSeed(KEY_B, label, k)).not.toBe(keyedStreamSeed(KEY_A, label, k));
    }
  });

  it('refuses an empty or NUL-bearing label (domain separation)', () => {
    expect(() => keyedStreamSeed(KEY_A, '', 1)).toThrow();
    expect(() => keyedStreamSeed(KEY_A, 'a\0b', 1)).toThrow();
  });

  it('the shell dispersion seed is UNCHANGED: HMAC-SHA256(key, ordinal as 8-byte BE), first 4 bytes BE — and shares no seed with the keyed streams', () => {
    const shellSeeds = new Set<number>();
    for (let n = 0; n < 32; n += 1) {
      const msg = Buffer.alloc(8);
      msg.writeBigUInt64BE(BigInt(n), 0);
      const want = createHmac('sha256', KEY_A).update(msg).digest().readUInt32BE(0);
      expect(dispersionShellSeed(KEY_A, n)).toBe(want);
      shellSeeds.add(want);
    }
    for (const label of LABELS) for (let n = 0; n < 32; n += 1) expect(shellSeeds.has(keyedStreamSeed(KEY_A, label, n))).toBe(false);
  });
});
