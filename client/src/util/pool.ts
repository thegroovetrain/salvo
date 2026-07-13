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
