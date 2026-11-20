import { describe, it, expect } from 'vitest';
import { CONFIG, hullBlocks } from '../index.js';

// The hull health step (Story 12.3, epic-12 amendment 2(e) + (g)). Every
// boundary is spoken RELATIVE to CONFIG.hullBar.blocks and to a hull's own
// maxHp, so the suite follows the configure instead of pinning it.

const BLOCKS = CONFIG.hullBar.blocks;
// Chosen so every `maxHp × k / blocks` is a whole hp for the shipped count.
const MAX_HPS = [1000, 400, 2400];

describe('hullBlocks — the step a hull bar shows', () => {
  it('a full hull lights every block', () => {
    for (const maxHp of MAX_HPS) expect(hullBlocks(maxHp, maxHp)).toBe(BLOCKS);
  });

  it('exactly maxHp × k / blocks still shows k + 1 (capped at blocks); one hp below shows k', () => {
    for (const maxHp of MAX_HPS) {
      for (let k = 1; k <= BLOCKS; k += 1) {
        const edge = (maxHp * k) / BLOCKS;
        expect(hullBlocks(edge, maxHp)).toBe(Math.min(BLOCKS, k + 1));
        expect(hullBlocks(edge - 1, maxHp)).toBe(k);
      }
    }
  });

  it('never rises as hp falls, and visits every step from blocks down to 1', () => {
    const maxHp = MAX_HPS[0];
    const seen = new Set<number>();
    let last: number = BLOCKS;
    for (let hp = maxHp; hp >= 0; hp -= 1) {
      const b = hullBlocks(hp, maxHp);
      expect(b).toBeLessThanOrEqual(last);
      last = b;
      seen.add(b);
    }
    expect([...seen].sort()).toEqual(Array.from({ length: BLOCKS }, (_, i) => i + 1));
  });

  it('the last hp point still shows one block', () => {
    for (const maxHp of MAX_HPS) expect(hullBlocks(1, maxHp)).toBe(1);
  });

  it('a hull at or below 0 hp (sinking) shows one block — never zero', () => {
    for (const maxHp of MAX_HPS) {
      expect(hullBlocks(0, maxHp)).toBe(1);
      expect(hullBlocks(-250, maxHp)).toBe(1);
    }
  });

  it('over-full hp caps at the block count', () => {
    expect(hullBlocks(1500, 1000)).toBe(BLOCKS);
    expect(hullBlocks(Infinity, 1000)).toBe(BLOCKS);
  });

  it('a non-finite fraction fails to one block, never a full bar', () => {
    expect(hullBlocks(NaN, 1000)).toBe(1);
    expect(hullBlocks(500, NaN)).toBe(1);
    expect(hullBlocks(0, 0)).toBe(1);
  });
});

describe('hullBlocks × CONFIG.damageBands — the bar steps where smoke and fire change (AC 14)', () => {
  // The smoke emitter's own reading: frac = hp / maxHp, hurt when
  // frac < amberBelow, critical when frac < criticalBelow.
  it('reads 2 or fewer exactly while the hull smokes, and 1 exactly while it burns', () => {
    const { amberBelow, criticalBelow } = CONFIG.damageBands;
    for (const maxHp of MAX_HPS) {
      for (let hp = 1; hp <= maxHp; hp += 1) {
        const frac = hp / maxHp;
        const b = hullBlocks(hp, maxHp);
        expect(b <= 2).toBe(frac < amberBelow);
        expect(b <= 1).toBe(frac < criticalBelow);
      }
    }
  });
});
