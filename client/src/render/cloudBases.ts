// THE ONE CLIENT MEMO of countermeasure cloud pixel constants (Story 9.3, Eric
// rulings 2026-10-11, epic-9 amendments 40–47). `cloudBase(id)` is a pure,
// seeded function of the cloud id (shared sim/cloud.ts) — the rejection-sampled
// offsets + death ages — so it is computed ONCE per id and reused by both
// readers: the renderer (render/countermeasure.ts) and the in-bubble wake
// sight mirror (render/wake.ts `cloudCrossed`). One memo, never two, so the
// pixels the player sees are, by construction, the pixels the mirror tests.
//
// Lifetime: the renderer is the only pruner — it calls `retainCloudBases`
// with the ids it still holds when a cloud dies (render) or at the
// match-start reset (clear), never per frame (amendment 51: a cloud once seen
// is held until it dies). `state.net.clouds` is the same held set, so every id
// the wake can ask about is one the renderer holds, give or take the one
// frame between the frame clock and the render clock; a miss computes and
// memoizes.

import { cloudBase, type CloudBase } from '@salvo/shared';

const memo = new Map<string, CloudBase>();

/** The memoized pixel constants for cloud `id` (computed on first sight). */
export function cloudBaseFor(id: string): CloudBase {
  let base = memo.get(id);
  if (base === undefined) {
    base = cloudBase(id);
    memo.set(id, base);
  }
  return base;
}

/** Drop every memoized base whose id is not in `live` (the renderer's sync). */
export function retainCloudBases(live: ReadonlySet<string>): void {
  for (const id of memo.keys()) if (!live.has(id)) memo.delete(id);
}

/** Is a base held for `id`? (test seam) */
export function hasCloudBase(id: string): boolean {
  return memo.has(id);
}
