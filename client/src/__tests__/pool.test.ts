import { describe, it, expect } from 'vitest';
import { Pool, capOldest } from '../util/pool.js';

describe('Pool', () => {
  it('creates fresh instances when empty', () => {
    let n = 0;
    const pool = new Pool(() => ({ id: n++ }));
    const a = pool.acquire();
    const b = pool.acquire();
    expect(a).not.toBe(b);
    expect(pool.createdCount_).toBe(2);
    expect(pool.freeCount).toBe(0);
  });

  it('recycles released instances (no new allocation)', () => {
    let n = 0;
    const pool = new Pool(() => ({ id: n++ }));
    const a = pool.acquire();
    pool.release(a);
    expect(pool.freeCount).toBe(1);
    const b = pool.acquire();
    expect(b).toBe(a); // same object reused
    expect(pool.createdCount_).toBe(1); // no second allocation
    expect(pool.freeCount).toBe(0);
  });

  it('grows only when demand exceeds the free list', () => {
    let n = 0;
    const pool = new Pool(() => ({ id: n++ }));
    const items = [pool.acquire(), pool.acquire(), pool.acquire()];
    items.forEach((i) => pool.release(i));
    for (let i = 0; i < 3; i++) pool.acquire();
    expect(pool.createdCount_).toBe(3);
  });
});

describe('capOldest — bounded-growth pool hygiene (e.g. radar blips)', () => {
  it('is a no-op while the list is at or under the cap', () => {
    const list = [1, 2, 3];
    expect(capOldest(list, 3)).toEqual([]);
    expect(list).toEqual([1, 2, 3]);
    expect(capOldest(list, 5)).toEqual([]);
    expect(list).toEqual([1, 2, 3]);
  });

  it('evicts the OLDEST (front) entries first, down to exactly the cap', () => {
    const list = [1, 2, 3, 4, 5];
    const evicted = capOldest(list, 2);
    expect(evicted).toEqual([1, 2, 3]);
    expect(list).toEqual([4, 5]);
  });

  it('evicts everything for a cap of 0', () => {
    const list = ['a', 'b'];
    expect(capOldest(list, 0)).toEqual(['a', 'b']);
    expect(list).toEqual([]);
  });

  it('mutates the array in place (splice), matching Pool.release-on-evict usage', () => {
    const list = [{ id: 1 }, { id: 2 }];
    const same = list;
    capOldest(list, 1);
    expect(same).toBe(list);
    expect(list).toEqual([{ id: 2 }]);
  });
});
