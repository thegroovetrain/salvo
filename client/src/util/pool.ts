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
