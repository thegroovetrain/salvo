// recordToRows (Story 12.1) — the pure record → rows mapping. Contracts: the
// callsign and the account link never reach a row; every hand becomes one row
// keyed by its dealing order; a countdown leaver and a draw are kept as built;
// the record is not mutated.

import { describe, expect, it } from 'vitest';
import { recordToRows, rowCount } from '../ledger/rows.js';
import { CALLSIGN, fixtureRecord } from './ledgerFixture.js';

function keysDeep(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysDeep(v, out);
    }
  }
  return out;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('recordToRows', () => {
  it('carries no callsign and no account link anywhere', () => {
    const rows = recordToRows(fixtureRecord());
    const keys = keysDeep(rows);
    expect(keys.has('name')).toBe(false);
    expect(keys.has('userId')).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(CALLSIGN);
  });

  it('one participant row per participant, keyed by the record id', () => {
    const record = fixtureRecord();
    const rows = recordToRows(record);
    expect(rows.participants.map((p) => p.participantId)).toEqual(record.participants.map((p) => p.id));
    for (const p of rows.participants) expect(p.matchId).toBe(record.matchId);
    expect(rows.match.id).toBe(record.matchId);
  });

  it('one hand row per hand, ordinal = dealing order, values as built', () => {
    const record = fixtureRecord();
    const rows = recordToRows(record);
    for (const p of record.participants) {
      const mine = rows.hands.filter((h) => h.participantId === p.id);
      expect(mine.map((h) => h.ordinal)).toEqual(p.hands.map((_, i) => i));
      mine.forEach((h, i) => {
        const src = p.hands[i];
        expect(h).toMatchObject({
          dealtAtMs: src.dealtAtMs,
          offered: [...src.offered],
          taken: src.taken,
          takenAtMs: src.takenAtMs,
          redrawn: src.redrawn,
        });
      });
    }
    expect(rowCount(rows)).toBe(1 + record.participants.length + rows.hands.length);
  });

  it('keeps a countdown leaver as built: placement 0, negative T+ stamps', () => {
    const record = fixtureRecord();
    const leaver = record.participants.find((p) => p.placement === 0)!;
    const rows = recordToRows(record);
    expect(rows.participants.find((p) => p.participantId === leaver.id)!.placement).toBe(0);
    const hands = rows.hands.filter((h) => h.participantId === leaver.id);
    expect(hands.map((h) => h.dealtAtMs)).toEqual(leaver.hands.map((h) => h.dealtAtMs));
    expect(hands.every((h) => h.dealtAtMs < 0)).toBe(true);
  });

  it("stores a draw's empty winner as-is", () => {
    expect(recordToRows(fixtureRecord('m-draw', 'draw')).match).toMatchObject({ outcome: 'draw', winnerId: '' });
  });

  it('cards keep fit order with repeats; the record is never mutated', () => {
    const record = deepFreeze(fixtureRecord());
    const rows = recordToRows(record);
    rows.participants.forEach((p, i) => expect(p.cards).toEqual([...record.participants[i].cards]));
    rows.participants.forEach((p, i) => expect(p.indexBonus).toEqual(record.participants[i].indexBonus));
  });
});
