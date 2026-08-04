import { describe, it, expect } from 'vitest';
import { Pool, capOldest, capOldestByKey } from '../util/pool.js';

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

// Story 4.2: a radar paint persists three sweeps, so a contact painted every
// sweep would stack paints forever. The cap is PER CONTACT so one busy track
// trims itself instead of evicting everyone else's history.

describe('capOldestByKey — the per-track blip cap', () => {
  interface P { id: string; t: number }
  const key = (p: P): string => p.id;
  const track = (): P[] => [
    { id: 'a', t: 1 }, { id: 'b', t: 2 }, { id: 'a', t: 3 },
    { id: 'b', t: 4 }, { id: 'a', t: 5 }, { id: 'a', t: 6 },
  ];

  it('is a no-op while that key is at or under its cap', () => {
    const list = track();
    expect(capOldestByKey(list, key, 'b', 3)).toEqual([]);
    expect(capOldestByKey(list, key, 'c', 3)).toEqual([]); // absent key
    expect(list).toHaveLength(6);
  });

  it("evicts that key's OLDEST first and leaves exactly the cap", () => {
    const list = track();
    expect(capOldestByKey(list, key, 'a', 3)).toEqual([{ id: 'a', t: 1 }]);
    expect(list.filter((p) => p.id === 'a').map((p) => p.t)).toEqual([3, 5, 6]);
  });

  it('never touches entries under any OTHER key (insertion order preserved)', () => {
    const list = track();
    capOldestByKey(list, key, 'a', 1);
    expect(list.map((p) => `${p.id}${p.t}`)).toEqual(['b2', 'b4', 'a6']);
  });

  it('returns multiple evictions oldest-first, for age-ordered release', () => {
    const list = track();
    expect(capOldestByKey(list, key, 'a', 2)).toEqual([{ id: 'a', t: 1 }, { id: 'a', t: 3 }]);
  });

  it('evicts every entry under a key for a cap of 0', () => {
    const list = track();
    expect(capOldestByKey(list, key, 'b', 0)).toEqual([{ id: 'b', t: 2 }, { id: 'b', t: 4 }]);
    expect(list.every((p) => p.id === 'a')).toBe(true);
  });
});
