// Pins sim/seedText.ts (private lobbies, cycle 167, Eric ruling 3 of
// 2026-10-02): free-text seed → uint32 via FNV-1a, blank = no seed, and the
// deterministic text / text0 / text1 / … retry when map generation throws.

import { describe, it, expect } from 'vitest';
import { hashSeedText, resolveSeedText } from '../index.js';

const isUint32 = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

describe('hashSeedText', () => {
  it('is deterministic: the same text hashes to the same seed across calls', () => {
    expect(hashSeedText('bananas')).toBe(hashSeedText('bananas'));
    expect(hashSeedText('K7XQ2M rules')).toBe(hashSeedText('K7XQ2M rules'));
  });

  it('returns a uint32 for ascii, unicode and emoji input', () => {
    for (const t of ['', 'a', 'bananas', 'Ünïcødé', '海戦', '⚓🚢💥', 'x'.repeat(32)]) {
      expect(isUint32(hashSeedText(t))).toBe(true);
    }
  });

  it('matches the FNV-1a 32-bit reference value for "a"', () => {
    expect(hashSeedText('a')).toBe(0xe40c292c);
  });

  it('distinguishes a text from its first retry candidate', () => {
    expect(hashSeedText('bananas')).not.toBe(hashSeedText('bananas0'));
  });
});

describe('resolveSeedText', () => {
  it('blank or whitespace-only text means no seed (null)', () => {
    const probe = (): boolean => true;
    expect(resolveSeedText('', probe)).toBeNull();
    expect(resolveSeedText('   \t\n', probe)).toBeNull();
  });

  it('returns the trimmed text itself when its seed passes', () => {
    expect(resolveSeedText('  bananas  ', () => true)).toEqual({
      text: 'bananas',
      seed: hashSeedText('bananas'),
    });
  });

  it('tries candidates in order text, text0, text1, text2', () => {
    const seen: number[] = [];
    const rejectFirstTwo = (seed: number): boolean => {
      seen.push(seed);
      return seen.length > 2;
    };
    const r = resolveSeedText('bananas', rejectFirstTwo);
    expect(seen).toEqual([hashSeedText('bananas'), hashSeedText('bananas0'), hashSeedText('bananas1')]);
    expect(r).toEqual({ text: 'bananas1', seed: hashSeedText('bananas1') });
  });

  it('same failing text resolves to the same result every time', () => {
    const failing = new Set([hashSeedText('storm'), hashSeedText('storm0'), hashSeedText('storm1')]);
    const probe = (seed: number): boolean => !failing.has(seed);
    const a = resolveSeedText('storm', probe);
    const b = resolveSeedText('storm', probe);
    expect(a).toEqual({ text: 'storm2', seed: hashSeedText('storm2') });
    expect(b).toEqual(a);
  });

  it('throws a plain Error past the attempt cap instead of looping forever', () => {
    expect(() => resolveSeedText('never', () => false)).toThrow(Error);
  });
});
