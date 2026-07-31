// Results modal pure helpers (ui/results.ts) + its DOM wiring. Story 2.3
// (amendments 22/23) reworked it into the ONE debrief surface: the elimination
// modal (personal score + placement + SPECTATE/RETURN TO PORT) and the game-end
// modal (the same score card + the placement table + RETURN TO PORT). Both
// action buttons are pinned by stable id — they are the player's only paths out.

import { describe, it, expect, afterEach } from 'vitest';
import type { ResultsMsg, ResultsRow } from '@salvo/shared';
import {
  closeResultsAsSpectate,
  fmtDamage,
  hideResults,
  placementLine,
  resultsVisible,
  scoreRows,
  scoreSignature,
  showResults,
  sortRows,
  sunkLines,
  updateResultsScore,
  winnerBanner,
  type ResultsView,
} from '../ui/results.js';
import type { PersonalScore } from '../score.js';
import { sanitizeName, NAME_MAX } from '../ui/home.js';

function row(id: string, placement: number): ResultsRow {
  return { id, name: id.toUpperCase(), placement, kills: 0, damageDealt: 0 };
}

function score(over: Partial<PersonalScore> = {}): PersonalScore {
  return { boons: 2, kills: 3, sunkContestants: ['RIVAL'], placement: 4, winner: false, ...over };
}

function view(over: Partial<ResultsView> = {}): ResultsView {
  return { banner: 'ELIMINATED', victory: false, score: score(), rows: null, ownId: 'b', canSpectate: true, ...over };
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

describe('the personal-score copy (amendment 23)', () => {
  it('a winner is INDICATED as such instead of getting a placement number', () => {
    expect(placementLine(score({ winner: true, placement: null }))).toContain('WON');
    expect(placementLine(score({ winner: true, placement: null }))).not.toContain('#');
  });

  it('an eliminated player reads their place', () => {
    expect(placementLine(score({ placement: 4 }))).toBe('ELIMINATED — PLACE #4');
  });

  it('an underivable placement degrades to a neutral line, never a wrong number', () => {
    expect(placementLine(score({ placement: null }))).toBe('ELIMINATED');
  });

  // PIN FLIPPED (Story 2.8): the 14 legacy upgrades died, so the row the player
  // reads is BOONS FITTED — the same number they experienced as refit picks
  // (spec 2.8 Design Notes, "score continuity").
  it('reports boons fitted and the kill tally', () => {
    expect(scoreRows(score({ boons: 5, kills: 3 }))).toEqual([
      ['BOONS FITTED', '5'],
      ['KILLS', '3'],
    ]);
  });

  it('the sunk roll lists contestants, or an explicit NONE (never a blank block)', () => {
    expect(sunkLines(score({ sunkContestants: ['A', 'B'] }))).toEqual(['· A', '· B']);
    expect(sunkLines(score({ sunkContestants: [] }))).toEqual(['— NONE —']);
  });
});

describe('showResults — the elimination modal', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  const returnButton = (): HTMLButtonElement | null => document.querySelector('#results-return');
  const spectateButton = (): HTMLButtonElement | null => document.querySelector('#results-spectate');

  it('renders the personal score, the placement, and BOTH actions while the match is live', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('ELIMINATED');
    expect(text).toContain('PLACE #4');
    expect(text).toContain('BOONS FITTED'); // Story 2.8: the legacy upgrade row's successor
    expect(text).toContain('RIVAL');
    expect(spectateButton()?.textContent).toBe('SPECTATE');
    expect(returnButton()?.textContent).toBe('RETURN TO PORT');
    expect(resultsVisible()).toBe(true);
  });

  it('SPECTATE closes the modal and hands control to the spectate view', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    spectateButton()?.click();
    expect(spectates).toBe(1);
    expect(resultsVisible()).toBe(false);
  });

  it('ESC on the modal is EXACTLY pressing SPECTATE (amendment 23)', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    closeResultsAsSpectate();
    expect(spectates).toBe(1);
    expect(resultsVisible()).toBe(false);
    closeResultsAsSpectate(); // idempotent: nothing open, nothing fires
    expect(spectates).toBe(1);
  });

  it('fires the return callback exactly once per click', () => {
    let returns = 0;
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (returns += 1) });
    returnButton()?.click();
    expect(returns).toBe(1);
  });

  it('a second showResults leaves exactly ONE overlay, whose buttons are live', () => {
    let first = 0;
    let second = 0;
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (first += 1) });
    const stale = returnButton();
    showResults(view(), { onSpectate: () => undefined, onReturn: () => (second += 1) }); // resume re-delivery
    expect(document.querySelectorAll('#results-overlay')).toHaveLength(1);
    const live = returnButton();
    expect(live).not.toBe(stale); // the old overlay (and its listener) is gone
    live?.click();
    expect(second).toBe(1);
    expect(first).toBe(0); // the replaced overlay can never fire a second chain
  });
});

describe('showResults — the game-end modal', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  const msg: ResultsMsg = { winnerId: 'a', rows: [row('a', 1), row('b', 2)] };

  it('adds the placement table and drops SPECTATE (nothing left to watch)', () => {
    showResults(view({ banner: winnerBanner(msg, 'b'), rows: msg.rows, canSpectate: false }), {
      onSpectate: () => undefined,
      onReturn: () => undefined,
    });
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('WINNER: A');
    expect(text).toContain('CAPTAIN'); // the table header
    expect(document.querySelector('#results-spectate')).toBeNull();
    expect(document.querySelector('#results-return')).not.toBeNull();
  });

  it('a WINNER gets the winner indication rather than a placement', () => {
    showResults(
      view({ banner: 'VICTORY', victory: true, score: score({ winner: true, placement: null }), rows: msg.rows, canSpectate: false }),
      { onSpectate: () => undefined, onReturn: () => undefined },
    );
    const text = document.getElementById('results-overlay')?.textContent ?? '';
    expect(text).toContain('VICTORY');
    expect(text).toContain('YOU WON');
    expect(text).not.toContain('PLACE #');
  });
});

describe('sanitizeName', () => {
  it('trims whitespace and caps the length', () => {
    expect(sanitizeName('  SALTY DOG  ')).toBe('SALTY DOG');
    expect(sanitizeName('X'.repeat(40))).toHaveLength(NAME_MAX);
    expect(sanitizeName('   ')).toBe('');
  });

  // REGRESSION (Story 2.3 review gate): the client entry sanitizer must strip
  // exactly what the server strips, or what you type is not what anyone sees.
  it('strips control / format code points before trimming and capping', () => {
    expect(sanitizeName('\u200b\u200b\u200b')).toBe(''); // zero-width only ⇒ server assigns
    expect(sanitizeName('AB\u202eCD')).toBe('ABCD'); // bidi override removed
    expect(sanitizeName('OLD\u0000SALT')).toBe('OLDSALT');
    // The strip runs BEFORE the cap, so invisibles can't eat visible characters.
    expect(sanitizeName('\u200b'.repeat(20) + 'HORNET')).toBe('HORNET');
  });
});

// --- REGRESSION: the open modal converges on server truth ---------------------

describe('updateResultsScore — an open elimination modal re-renders in place', () => {
  afterEach(() => {
    hideResults();
    document.body.replaceChildren();
  });

  function text(): string {
    return document.getElementById('results-overlay')?.textContent ?? '';
  }

  it('is a no-op when nothing is open', () => {
    expect(() => updateResultsScore(score())).not.toThrow();
    expect(resultsVisible()).toBe(false);
  });

  it('refreshes placement, kills and the sunk roll as the roster catches up', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    expect(text()).toContain('PLACE #4');
    // The roster applied the same-tick deaths and the mutual-kill credit.
    updateResultsScore(score({ placement: 2, kills: 4, sunkContestants: ['RIVAL', 'HORNET'] }));
    expect(text()).toContain('PLACE #2');
    expect(text()).not.toContain('PLACE #4');
    expect(text()).toContain('HORNET');
  });

  it('leaves the ACTIONS alone — the only paths out survive a refresh', () => {
    let spectates = 0;
    showResults(view(), { onSpectate: () => (spectates += 1), onReturn: () => undefined });
    const spectate = document.querySelector<HTMLButtonElement>('#results-spectate');
    updateResultsScore(score({ placement: 1 }));
    expect(document.querySelector('#results-spectate')).toBe(spectate); // same node
    spectate?.click();
    expect(spectates).toBe(1);
  });

  it('touches nothing when the numbers have not moved (signature guard)', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    const card = document.getElementById('results-overlay')?.children[0]?.children[2];
    updateResultsScore(score()); // identical score
    expect(document.getElementById('results-overlay')?.children[0]?.children[2]).toBe(card);
    expect(scoreSignature(score())).toBe(scoreSignature(score()));
  });

  it('a closed modal drops its mount — a later refresh cannot resurrect it', () => {
    showResults(view(), { onSpectate: () => undefined, onReturn: () => undefined });
    hideResults();
    updateResultsScore(score({ placement: 1 }));
    expect(resultsVisible()).toBe(false);
  });
});
