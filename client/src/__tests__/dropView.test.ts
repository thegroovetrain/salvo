// Story 10.9 — the airdrop ingest gate (sim/dropView.ts): a crate is kept iff
// its id, position and KIND are sound; anything else is dropped whole.
import { describe, expect, it } from 'vitest';
import { INDEX_IDS } from '@salvo/shared';
import { sanitizeDrops } from '../sim/dropView.js';

const ok = { id: 'd1', x: 10, y: -20, c: 'armor' };

describe('sanitizeDrops', () => {
  it.each([...INDEX_IDS, 'wreck'])('keeps a crate of kind %s', (c) => {
    const v = { id: 'k', x: 0, y: 0, c };
    expect(sanitizeDrops([v, ok])).toEqual([v, ok]);
  });

  it('a non-array (including the omitted key) is no crates', () => {
    expect(sanitizeDrops(undefined)).toEqual([]);
    expect(sanitizeDrops({ 0: ok })).toEqual([]);
    expect(sanitizeDrops('d1')).toEqual([]);
  });

  it.each([
    ['an unknown kind', { ...ok, c: 'speed' }],
    ['a numeric kind', { ...ok, c: 3 }],
    ['a missing kind', { id: 'd1', x: 10, y: -20 }],
    ['NaN x', { ...ok, x: Number.NaN }],
    ['infinite y', { ...ok, y: Number.POSITIVE_INFINITY }],
    ['a string coordinate', { ...ok, x: '10' }],
    ['a non-string id', { ...ok, id: 7 }],
    ['null', null],
  ])('drops a view with %s', (_label, bad) => {
    expect(sanitizeDrops([bad, ok])).toEqual([ok]);
  });
});
