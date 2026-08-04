// Generic object pool. Amortizes allocation of short-lived render objects
// (wake dots, splashes, blips) by recycling released instances. Pure and
// Pixi-agnostic: the factory decides what T is, so it is unit-testable with
// plain objects and reused for Pixi Graphics in render code.

export class Pool<T> {
  private readonly free: T[] = [];
  private createdCount = 0;

  constructor(private readonly factory: () => T) {}

  /** Take an instance from the pool, creating a fresh one if none are free. */
  acquire(): T {
    const recycled = this.free.pop();
    if (recycled !== undefined) return recycled;
    this.createdCount += 1;
    return this.factory();
  }

  /** Return an instance to the pool for later reuse. */
  release(item: T): void {
    this.free.push(item);
  }

  /** Number of instances currently idle in the pool. */
  get freeCount(): number {
    return this.free.length;
  }

  /** Total instances the factory has ever produced (for tests / diagnostics). */
  get createdCount_(): number {
    return this.createdCount;
  }
}

/**
 * Pool-hygiene helper: cap a live list to at most `cap` entries, evicting the
 * OLDEST (front) first — `list` is mutated in place (splice) and the evicted
 * entries are returned so the caller can release any pooled resource they
 * hold (e.g. a Pixi sprite back into its Pool). Used to bound unbounded growth
 * of long-lived per-tick spawns (radar blips) when network messages keep
 * arriving faster than the render loop retires them (e.g. a backgrounded tab).
 */
export function capOldest<T>(list: T[], cap: number): T[] {
  const evictCount = list.length - cap;
  return evictCount > 0 ? list.splice(0, evictCount) : [];
}

/**
 * Per-KEY variant of `capOldest`: cap how many entries carrying key `k` may
 * live inside a shared insertion-ordered list, evicting that key's OLDEST
 * first. Entries under every other key are untouched, and the returned list is
 * oldest-first so the caller can release pooled resources in age order.
 *
 * Story 4.2's blip track cap: a radar paint now persists three sweeps, so a
 * contact painted every sweep would otherwise stack paints forever. Capping
 * PER CONTACT (rather than leaning on the global backstop) is what bounds one
 * busy track instead of letting it evict everyone else's history.
 */
export function capOldestByKey<T>(list: T[], keyOf: (item: T) => string, k: string, cap: number): T[] {
  const hits: number[] = [];
  for (let i = 0; i < list.length; i++) if (keyOf(list[i]) === k) hits.push(i);
  const evictCount = hits.length - cap;
  if (evictCount <= 0) return [];
  const evicted: T[] = [];
  // Splice from the highest doomed index down so the lower indices stay valid.
  for (let n = evictCount - 1; n >= 0; n--) evicted.unshift(list.splice(hits[n], 1)[0]);
  return evicted;
}
