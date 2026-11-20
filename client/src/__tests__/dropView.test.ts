// Story 10.9 — the airdrop ingest gate (sim/dropView.ts): a crate is kept iff
// its id, position and KIND are sound; anything else is dropped whole. Story
// 12.4: the kinds are the XP crate and the wreck (the shared `isDropKind`).
import { describe, expect, it } from 'vitest';
import { INDEX_IDS } from '@salvo/shared';
import { dropsUpdate, sanitizeDrops } from '../sim/dropView.js';

const ok = { id: 'd1', x: 10, y: -20, c: 'xp' };

describe('sanitizeDrops', () => {
  it.each(['xp', 'wreck'])('keeps a crate of kind %s', (c) => {
    const v = { id: 'k', x: 0, y: 0, c };
    expect(sanitizeDrops([v, ok])).toEqual([v, ok]);
  });

  it.each([...INDEX_IDS])('drops a retired stat-crate kind %s (Story 12.4)', (c) => {
    expect(sanitizeDrops([{ ...ok, c }, ok])).toEqual([ok]);
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

describe('dropsUpdate — the send-on-change read (PV 113)', () => {
  const a = { id: 'd1', x: 1, y: 2, c: 'xp' };
  it('an absent key keeps the held list (null); a present list replaces it; [] clears it', () => {
    expect(dropsUpdate(undefined)).toBeNull();
    expect(dropsUpdate([a])).toEqual([a]);
    expect(dropsUpdate([])).toEqual([]);
  });

  it('a present list still goes through the fail-closed gate; a present non-array is no crates', () => {
    expect(dropsUpdate([{ ...a, x: Number.NaN }, a])).toEqual([a]);
    expect(dropsUpdate(null)).toEqual([]);
    expect(dropsUpdate('d1')).toEqual([]);
  });
});
