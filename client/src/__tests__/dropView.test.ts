// Story 10.9 — the airdrop ingest gate (sim/dropView.ts): a malformed crate is
// dropped WHOLE, never drawn with its bad roll skipped.
import { describe, expect, it } from 'vitest';
import { sanitizeDrops } from '../sim/dropView.js';

const ok = { id: 'd1', x: 10, y: -20, g: [['armor', 3]] };
const bundle = { id: 'w1', x: 0, y: 0, g: [['power', 1], ['intel', 5], ['range', 2]] };

describe('sanitizeDrops', () => {
  it('keeps a valid crate and a valid wreck bundle, in order', () => {
    expect(sanitizeDrops([ok, bundle])).toEqual([ok, bundle]);
  });

  it('a non-array (including the omitted key) is no crates', () => {
    expect(sanitizeDrops(undefined)).toEqual([]);
    expect(sanitizeDrops({ 0: ok })).toEqual([]);
    expect(sanitizeDrops('d1')).toEqual([]);
  });

  it.each([
    ['an unknown stat', { ...ok, g: [['speed', 3]] }],
    ['a fractional amount', { ...ok, g: [['armor', 1.5]] }],
    ['a zero amount', { ...ok, g: [['armor', 0]] }],
    ['a negative amount', { ...ok, g: [['armor', -2]] }],
    ['one bad roll in a bundle', { ...bundle, g: [['power', 1], ['nope', 5], ['range', 2]] }],
    ['an empty g', { ...ok, g: [] }],
    ['a non-array g', { ...ok, g: 'armor' }],
    ['a malformed roll tuple', { ...ok, g: [['armor']] }],
    ['NaN x', { ...ok, x: Number.NaN }],
    ['infinite y', { ...ok, y: Number.POSITIVE_INFINITY }],
    ['a string coordinate', { ...ok, x: '10' }],
    ['a non-string id', { ...ok, id: 7 }],
    ['null', null],
  ])('drops a view with %s', (_label, bad) => {
    expect(sanitizeDrops([bad, ok])).toEqual([ok]);
  });
});
