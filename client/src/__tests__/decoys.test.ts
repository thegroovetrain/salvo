// Decoy-buoy reconcile (render/decoys.ts) — the pure list -> sprite lifecycle
// diff, the mines/litZones precedent (Story 1.8). A buoy is a static point, so
// reconcile is a plain id-set diff: ids only in the incoming list are added, ids
// only in the held set are removed, ids in both are left untouched.
//
// NOTE: there is deliberately NO own/enemy split test — DecoyView is
// `{id,x,y,until}` with no owner discriminator (unlike MineView's `own`), so the
// renderer cannot and does not distinguish own from enemy buoys. That gap is
// reported to the orchestrator; if a split is wanted, DecoyView needs an `own`
// field mirroring mineSignal.materialize.

import { describe, it, expect } from 'vitest';
import type { DecoyView } from '@salvo/shared';
import { reconcileDecoys } from '../render/decoys.js';

const decoy = (id: string, until = 5000): DecoyView => ({ id, x: 0, y: 0, until });

describe('reconcileDecoys — decoy list → sprite lifecycle diff', () => {
  it('adds every buoy when starting from nothing', () => {
    const { add, remove } = reconcileDecoys(new Set(), [decoy('d1'), decoy('d2')]);
    expect(add.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose buoy dropped out of the list (expired or out of view)', () => {
    const { add, remove } = reconcileDecoys(new Set(['d1', 'd2']), [decoy('d1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['d2']);
  });

  it('leaves buoys present in both untouched (static — nothing to update)', () => {
    const { add, remove } = reconcileDecoys(new Set(['d1']), [decoy('d1'), decoy('d3')]);
    expect(add.map((d) => d.id)).toEqual(['d3']);
    expect(remove).toEqual([]);
  });

  it('a REPLACE (owner drops a second buoy: old id leaves, new id joins) is one remove + one add', () => {
    // The server evicts the owner's prior buoy and spawns a new one with a fresh
    // id — the truth list swaps 'd1' for 'd2' in a single tick.
    const { add, remove } = reconcileDecoys(new Set(['d1']), [decoy('d2')]);
    expect(add.map((d) => d.id)).toEqual(['d2']);
    expect(remove).toEqual(['d1']);
  });

  it('empty incoming clears everything (natural expiry / match reset / despawn-all)', () => {
    const { add, remove } = reconcileDecoys(new Set(['a', 'b']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});
