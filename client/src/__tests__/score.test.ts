// Story 2.3 (amendments 22/23) — the client-derived personal score: the
// sunk-contestant roll (drone kills count in the tally, never in the list),
// elimination placement from the public alive count, and the winner state.

import { describe, it, expect } from 'vitest';
import {
  freshScore,
  personalScore,
  placementFor,
  recordElimination,
  recordSunk,
  upgradeCount,
  type SunkObservation,
} from '../score.js';

const OWN = 'me';

function obs(over: Partial<SunkObservation> = {}): SunkObservation {
  return { victimId: 'v1', victimName: 'RIVAL', killerId: OWN, victimIsDrone: false, ...over };
}

describe('recordSunk — only OUR kills on CONTESTANT hulls join the roll', () => {
  it('adds a contestant we sank', () => {
    const s = recordSunk(freshScore(), obs(), OWN);
    expect(s.sunkContestants).toEqual(['RIVAL']);
  });

  it('ignores someone else\'s kill, a storm death, and our own sinking', () => {
    const base = freshScore();
    expect(recordSunk(base, obs({ killerId: 'other' }), OWN)).toBe(base);
    expect(recordSunk(base, obs({ killerId: null }), OWN)).toBe(base);
    expect(recordSunk(base, obs({ victimId: OWN }), OWN)).toBe(base);
  });

  it('a DRONE we sank never enters the list (the tally still counts it)', () => {
    const base = freshScore();
    expect(recordSunk(base, obs({ victimIsDrone: true }), OWN)).toBe(base);
  });

  it('de-duplicates by victim id (a respawn-and-resink lists one hull)', () => {
    let s = recordSunk(freshScore(), obs(), OWN);
    s = recordSunk(s, obs(), OWN);
    expect(s.sunkContestants).toEqual(['RIVAL']);
  });

  it('the I/O matrix row: 2 drones + 1 human ⇒ kills 3, list shows the human only', () => {
    let s = freshScore();
    s = recordSunk(s, obs({ victimId: 'd1', victimName: 'DRONE-1', victimIsDrone: true }), OWN);
    s = recordSunk(s, obs({ victimId: 'd2', victimName: 'DRONE-2', victimIsDrone: true }), OWN);
    s = recordSunk(s, obs({ victimId: 'h1', victimName: 'CAPTAIN-2' }), OWN);
    const score = personalScore(s, [], 3, false);
    expect(score.kills).toBe(3);
    expect(score.sunkContestants).toEqual(['CAPTAIN-2']);
  });
});

describe('placement — derived from the public alive count', () => {
  it('k rivals still floating ⇒ you place k+1; the last two standing place 2nd', () => {
    expect(placementFor(0)).toBe(1);
    expect(placementFor(1)).toBe(2);
    expect(placementFor(5)).toBe(6);
  });

  it('latches on the FIRST elimination — a duplicate sunk can never rewrite it', () => {
    const first = recordElimination(freshScore(), 3);
    expect(first.eliminated).toBe(true);
    expect(first.placement).toBe(4);
    expect(recordElimination(first, 0)).toBe(first);
  });
});

describe('upgradeCount + personalScore', () => {
  it('sums the per-upgrade counts, tolerating a missing/short array', () => {
    expect(upgradeCount([1, 0, 2, 3])).toBe(6);
    expect(upgradeCount(undefined)).toBe(0);
    expect(upgradeCount([])).toBe(0);
  });

  it('a WINNER gets the winner flag instead of a placement number', () => {
    const s = recordElimination(freshScore(), 2);
    const won = personalScore(s, [1, 1], 4, true);
    expect(won.winner).toBe(true);
    expect(won.placement).toBeNull();
    expect(won.upgrades).toBe(2);
    expect(won.kills).toBe(4);
  });

  it('an eliminated player reports the recorded placement', () => {
    const s = recordElimination(freshScore(), 2);
    expect(personalScore(s, [], 0, false).placement).toBe(3);
  });

  it('a still-alive player has no placement yet', () => {
    expect(personalScore(freshScore(), [], 0, false).placement).toBeNull();
  });
});
