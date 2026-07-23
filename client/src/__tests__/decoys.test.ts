// Decoy-buoy reconcile + render (render/decoys.ts) — the pure list -> sprite
// lifecycle diff plus the own/enemy layer split and own-spawn cue hook, the
// mines.ts precedent (Story 1.8). A buoy is a static point, so reconcile is a
// plain id-set diff: ids only in the incoming list are added, ids only in the
// held set are removed, ids in both are left untouched.
//
// The OWN/ENEMY split rides DecoyView.own (added to mirror MineView.own): an OWN
// buoy draws in the fog-immune chart layer, a truesighted ENEMY buoy in the
// fogged world layer — without it a truesighted enemy buoy would have read as
// YOURS. The own-spawn hook fires ONLY for newly-added OWN buoys (the audio
// placement cue), so it can never misfire on an enemy buoy we truesight.

import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { DecoyView } from '@salvo/shared';
import { reconcileDecoys, Decoys } from '../render/decoys.js';

const decoy = (id: string, own = false, until = 5000, by = 'p1'): DecoyView => ({ id, x: 0, y: 0, until, own, by });

/** Stub firer-hue resolver for the render harness (Story 1.12). */
const HUE = (): number => 0x123456;

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

  it('the add list carries `own` through (the split data for the renderer)', () => {
    const { add } = reconcileDecoys(new Set(), [decoy('mine', true), decoy('theirs', false)]);
    expect(add.map((d) => ({ id: d.id, own: d.own }))).toEqual([
      { id: 'mine', own: true },
      { id: 'theirs', own: false },
    ]);
  });
});

describe('Decoys — own/enemy layer split + own-spawn cue hook (mines precedent)', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const onOwnDecoySpawn = vi.fn();
    const decoys = new Decoys(ownLayer, enemyLayer, onOwnDecoySpawn);
    return { ownLayer, enemyLayer, onOwnDecoySpawn, decoys };
  }

  it('routes an OWN buoy to the chart layer and an ENEMY buoy to the world layer', () => {
    const { ownLayer, enemyLayer, decoys } = harness();
    decoys.sync([decoy('mine', true), decoy('theirs', false)], HUE);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });

  it('fires the own-spawn hook ONLY for newly-added OWN buoys (never for enemy)', () => {
    const { onOwnDecoySpawn, decoys } = harness();
    decoys.sync([decoy('mine', true), decoy('theirs', false)], HUE);
    expect(onOwnDecoySpawn).toHaveBeenCalledTimes(1);
    expect(onOwnDecoySpawn.mock.calls[0][0].id).toBe('mine');
  });

  it('fires the hook once per placement, not every tick a buoy persists', () => {
    const { onOwnDecoySpawn, decoys } = harness();
    decoys.sync([decoy('mine', true)], HUE);
    decoys.sync([decoy('mine', true)], HUE); // still present — no re-add, no re-cue
    expect(onOwnDecoySpawn).toHaveBeenCalledTimes(1);
  });

  it('clears both layers when the incoming list empties', () => {
    const { ownLayer, enemyLayer, decoys } = harness();
    decoys.sync([decoy('mine', true), decoy('theirs', false)], HUE);
    decoys.sync([], HUE);
    expect(ownLayer.children).toHaveLength(0);
    expect(enemyLayer.children).toHaveLength(0);
  });
});
