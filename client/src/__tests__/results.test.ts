// Results overlay pure helpers (ui/results.ts) + its DOM wiring (the RETURN TO
// PORT button is the player's only path home, so its listener is pinned) + menu
// callsign sanitizing.

import { describe, it, expect, afterEach } from 'vitest';
import type { ResultsMsg, ResultsRow } from '@salvo/shared';
import { fmtDamage, showResults, sortRows, winnerBanner } from '../ui/results.js';
import { sanitizeName, NAME_MAX } from '../ui/home.js';

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

describe('showResults — RETURN TO PORT wiring', () => {
  const msg: ResultsMsg = { winnerId: 'a', rows: [row('a', 1), row('b', 2)] };

  afterEach(() => document.body.replaceChildren());

  /** The overlay's action button (the only <button> in the panel). */
  function returnButton(): HTMLButtonElement | null {
    return document.querySelector('#results-overlay button');
  }

  it('fires the return callback exactly once per click', () => {
    let returns = 0;
    showResults(msg, 'b', () => (returns += 1));
    const btn = returnButton();
    expect(btn?.textContent).toBe('RETURN TO PORT');
    btn?.click();
    expect(returns).toBe(1);
  });

  it('a second showResults leaves exactly ONE overlay, whose button is live', () => {
    let first = 0;
    let second = 0;
    showResults(msg, 'b', () => (first += 1));
    const stale = returnButton();
    showResults(msg, 'b', () => (second += 1)); // results re-delivery (story-0.2 resume)
    expect(document.querySelectorAll('#results-overlay')).toHaveLength(1);
    const live = returnButton();
    expect(live).not.toBe(stale); // the old overlay (and its listener) is gone
    live?.click();
    expect(second).toBe(1);
    expect(first).toBe(0); // the replaced overlay can never fire a second chain
  });
});

describe('sanitizeName', () => {
  it('trims whitespace and caps the length', () => {
    expect(sanitizeName('  SALTY DOG  ')).toBe('SALTY DOG');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(NAME_MAX);
    expect(sanitizeName('   ')).toBe('');
  });
});
