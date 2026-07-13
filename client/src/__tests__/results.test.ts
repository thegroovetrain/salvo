// Results overlay pure helpers (ui/results.ts) + menu callsign sanitizing.

import { describe, it, expect } from 'vitest';
import type { ResultsMsg, ResultsRow } from '@salvo/shared';
import { fmtDamage, sortRows, winnerBanner } from '../ui/results.js';
import { sanitizeName, NAME_MAX } from '../ui/menu.js';

function row(id: string, placement: number): ResultsRow {
  return { id, name: id.toUpperCase(), placement, kills: 0, damageDealt: 0 };
}

describe('sortRows', () => {
  it('orders by placement ascending (winner first) without mutating the input', () => {
    const rows = [row('c', 3), row('a', 1), row('b', 2)];
    const sorted = sortRows(rows);
    expect(sorted.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b']); // untouched
  });
});

describe('winnerBanner', () => {
  const msg: ResultsMsg = { winnerId: 'a', rows: [row('a', 1), row('b', 2)] };

  it('is VICTORY for the winner, WINNER: name for everyone else', () => {
    expect(winnerBanner(msg, 'a')).toBe('VICTORY');
    expect(winnerBanner(msg, 'b')).toBe('WINNER: A');
  });

  it('degrades gracefully when the winner is not in the rows', () => {
    expect(winnerBanner({ winnerId: 'x', rows: [row('b', 2)] }, 'b')).toBe('WINNER: UNKNOWN');
  });
});

describe('fmtDamage', () => {
  it('rounds to whole hp', () => {
    expect(fmtDamage(109.6)).toBe('110');
    expect(fmtDamage(0)).toBe('0');
  });
});

describe('sanitizeName', () => {
  it('trims whitespace and caps the length', () => {
    expect(sanitizeName('  SALTY DOG  ')).toBe('SALTY DOG');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(NAME_MAX);
    expect(sanitizeName('   ')).toBe('');
  });
});
