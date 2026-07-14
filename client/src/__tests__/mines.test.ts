import { describe, it, expect } from 'vitest';
import type { MineView } from '@salvo/shared';
import { reconcileMines } from '../render/mines.js';

const mine = (id: string, own = false): MineView => ({ id, x: 0, y: 0, own });

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
