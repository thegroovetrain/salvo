import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MineView } from '@salvo/shared';
import { reconcileMines, Mines } from '../render/mines.js';

const mine = (id: string, own = false, by = 'p1'): MineView => ({ id, x: 0, y: 0, own, by });

describe('reconcileMines — mine list → sprite lifecycle diff', () => {
  it('adds every mine when starting from nothing', () => {
    const { add, remove } = reconcileMines(new Set(), [mine('m1'), mine('m2', true)]);
    expect(add.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(remove).toEqual([]);
  });

  it('removes sprites whose mine dropped out of the list (triggered or fogged)', () => {
    const { add, remove } = reconcileMines(new Set(['m1', 'm2']), [mine('m1')]);
    expect(add).toEqual([]);
    expect(remove).toEqual(['m2']);
  });

  it('leaves mines present in both untouched (static — nothing to update)', () => {
    const { add, remove } = reconcileMines(new Set(['m1']), [mine('m1'), mine('m3')]);
    expect(add.map((m) => m.id)).toEqual(['m3']);
    expect(remove).toEqual([]);
  });

  it('handles a full swap (all gone, all new)', () => {
    const { add, remove } = reconcileMines(new Set(['a', 'b']), [mine('c')]);
    expect(add.map((m) => m.id)).toEqual(['c']);
    expect(remove.sort()).toEqual(['a', 'b']);
  });

  it('empty incoming clears everything', () => {
    const { add, remove } = reconcileMines(new Set(['a', 'b']), []);
    expect(add).toEqual([]);
    expect(remove.sort()).toEqual(['a', 'b']);
  });
});

describe('Mines — firer-hue tint (Story 1.12) + own/enemy layer split', () => {
  function harness() {
    const ownLayer = new Container();
    const enemyLayer = new Container();
    const mines = new Mines(ownLayer, enemyLayer);
    return { ownLayer, enemyLayer, mines };
  }

  it('resolves each new mine’s tint from its dropper id (`by`) via hueFor', () => {
    const { mines } = harness();
    const hueFor = vi.fn((_by: string) => 0x123456);
    mines.sync([mine('m1', true, 'alice'), mine('m2', false, 'bob')], hueFor);
    expect(hueFor.mock.calls.map((c) => c[0]).sort()).toEqual(['alice', 'bob']);
  });

  it('routes own mines to the chart layer and enemy mines to the world layer', () => {
    const { ownLayer, enemyLayer, mines } = harness();
    mines.sync([mine('m1', true, 'me'), mine('m2', false, 'foe')], () => 0x00ff00);
    expect(ownLayer.children).toHaveLength(1);
    expect(enemyLayer.children).toHaveLength(1);
  });
});
