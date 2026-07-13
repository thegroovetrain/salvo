import { describe, it, expect } from 'vitest';
import { Pool } from '../util/pool.js';

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
