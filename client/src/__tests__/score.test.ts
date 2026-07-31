// Story 2.3 (amendments 22/23) — the client-derived personal score: the
// sunk-contestant roll (drone kills count in the tally, never in the list),
// elimination placement from the public alive count, and the winner state.

import { describe, it, expect } from 'vitest';
import {
  canOpenElimination,
  freshScore,
  isLiveRival,
  personalScore,
  personalScoreFromResults,
  placementFor,
  recordElimination,
  recordSunk,
  refinePlacement,
  scoreAfterReconnect,
  boonCount,
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

describe('boonCount + personalScore', () => {
  // Story 2.8: the metric is BOONS FITTED — the number of picks the player
  // actually made (OwnShip.boons.length). Repeats are picks too, so occurrences
  // count and the list is NEVER de-duplicated.
  it('counts fitted boons, repeats included, tolerating a missing list', () => {
    expect(boonCount(['gunDamage', 'gunDamage', 'shipHull'])).toBe(3);
    expect(boonCount(undefined)).toBe(0);
    expect(boonCount([])).toBe(0);
  });

  it('a WINNER gets the winner flag instead of a placement number', () => {
    const s = recordElimination(freshScore(), 2);
    const won = personalScore(s, ['gunDamage', 'shipHull'], 4, true);
    expect(won.winner).toBe(true);
    expect(won.placement).toBeNull();
    expect(won.boons).toBe(2);
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

// --- REGRESSIONS (Story 2.3 review gate) --------------------------------------

describe('a victim with no resolvable callsign is OMITTED, never shown as an id', () => {
  it('leaves the roll untouched when the roster entry is already gone', () => {
    // The victim left the room between the sinking and the event landing, so
    // there is no callsign. The roster kill TALLY still counts them; the list is
    // a roll of names and a raw session id is never a name.
    const s = recordSunk(freshScore(), obs({ victimName: null }), OWN);
    expect(s.sunkContestants).toEqual([]);
    expect(s).toBe(freshScore()); // identity preserved: no re-render churn
  });

  it('a later resolvable kill still lists normally', () => {
    let s = recordSunk(freshScore(), obs({ victimId: 'ghost', victimName: null }), OWN);
    s = recordSunk(s, obs({ victimId: 'v2', victimName: 'HORNET' }), OWN);
    expect(s.sunkContestants).toEqual(['HORNET']);
  });
});

describe('isLiveRival — placement counts HUMANS, never drones', () => {
  const DRONE = 255;

  it('excludes drones, the dead, and ourselves', () => {
    expect(isLiveRival({ id: 'a', alive: true, color: 3 }, OWN, DRONE)).toBe(true);
    expect(isLiveRival({ id: 'd', alive: true, color: DRONE }, OWN, DRONE)).toBe(false);
    expect(isLiveRival({ id: 'a', alive: false, color: 3 }, OWN, DRONE)).toBe(false);
    expect(isLiveRival({ id: OWN, alive: true, color: 3 }, OWN, DRONE)).toBe(false);
  });

  it('the solo-captain case: 5 live drones + 1 live human ⇒ you place 2nd, not 7th', () => {
    const roster = [
      { id: OWN, alive: true, color: 1 },
      { id: 'human', alive: true, color: 2 },
      ...[0, 1, 2, 3, 4].map((n) => ({ id: `drone${n}`, alive: true, color: DRONE })),
    ];
    const rivals = roster.filter((m) => isLiveRival(m, OWN, DRONE)).length;
    expect(rivals).toBe(1);
    expect(placementFor(rivals)).toBe(2);
  });
});

describe('canOpenElimination — the ordering law for the elimination modal', () => {
  it('opens on an own sinking in a live match', () => {
    expect(canOpenElimination('active', false, false)).toBe(true);
  });

  it('a ready-room sinking is a respawn, not an elimination', () => {
    expect(canOpenElimination('waiting', false, false)).toBe(false);
    expect(canOpenElimination('countdown', false, false)).toBe(false);
  });

  it('NEVER replaces the game-end results — the final-victim race', () => {
    // The winner's own killing blow: `results` arrives BEFORE our own `sunk`
    // frame, while the schema still reads 'active'. The placement table must
    // stand; an elimination modal here would offer SPECTATE into a finished match.
    expect(canOpenElimination('active', true, false)).toBe(false);
  });

  it('is latched — a duplicate own sunk can never re-open it', () => {
    expect(canOpenElimination('active', false, true)).toBe(false);
  });
});

describe('refinePlacement — converge on server truth while the roster catches up', () => {
  const eliminated = recordElimination(freshScore(), 3); // provisional: #4

  it('does nothing before an elimination', () => {
    expect(refinePlacement(freshScore(), 2, false)).toBe(freshScore());
  });

  it('lowers an inflated placement as a lagging roster applies the same-tick deaths', () => {
    expect(eliminated.placement).toBe(4);
    const converged = refinePlacement(eliminated, 1, false); // a rival died with us
    expect(converged.placement).toBe(2);
    expect(converged.placementSettled).toBe(false);
  });

  it('FREEZES the moment the roster has applied our own sinking', () => {
    const settled = refinePlacement(eliminated, 1, true);
    expect(settled.placement).toBe(2);
    expect(settled.placementSettled).toBe(true);
    // Rivals dying AFTER us must never keep dragging our number down to #1.
    expect(refinePlacement(settled, 0, true).placement).toBe(2);
    expect(refinePlacement(settled, 0, true)).toBe(settled); // identity: no churn
  });

  it('keeps the Math.max(1, …) floor', () => {
    expect(refinePlacement(eliminated, -5, true).placement).toBe(1);
  });
});

describe('scoreAfterReconnect — the roll resets, the elimination latch does NOT', () => {
  it('preserves eliminated + placement and drops only the untrustworthy roll', () => {
    let s = recordSunk(freshScore(), obs({ victimName: 'HORNET' }), OWN);
    s = recordElimination(s, 2);
    s = refinePlacement(s, 2, true);
    const after = scoreAfterReconnect(s);
    expect(after.eliminated).toBe(true);
    expect(after.placement).toBe(3);
    expect(after.placementSettled).toBe(true);
    // The outage may have swallowed `sunk` events, so the observed roll can no
    // longer be trusted — better empty than wrong.
    expect(after.sunkContestants).toEqual([]);
    expect(after.sunkIds).toEqual([]);
  });

  it('a duplicate own-sunk after the reconnect still can NOT re-open the modal', () => {
    const after = scoreAfterReconnect(recordElimination(freshScore(), 1));
    expect(canOpenElimination('active', false, after.eliminated)).toBe(false);
  });
});

describe('personalScoreFromResults — the GAME-END score comes off the MESSAGE', () => {
  const msg = {
    winnerId: OWN,
    rows: [
      { id: OWN, placement: 1, kills: 4 },
      { id: 'rival', placement: 2, kills: 1 },
    ],
  };

  it('the winner reads VICTORY even while the schema has not patched winnerId yet', () => {
    // The schema-derived path reported `winner: false` here (winnerId still ''),
    // so the actual winner saw an amber "ELIMINATED" line under a VICTORY banner.
    const s = personalScoreFromResults(freshScore(), ['gunDamage', 'gunDamage'], msg, OWN, 0);
    expect(s.winner).toBe(true);
    expect(s.placement).toBeNull();
    expect(s.kills).toBe(4); // from the row, not the lagging roster tally
    expect(s.boons).toBe(2);
  });

  it('a loser takes the placement from their own results row, not the roster', () => {
    const s = personalScoreFromResults(recordElimination(freshScore(), 4), undefined, msg, 'rival', 0);
    expect(s.winner).toBe(false);
    expect(s.placement).toBe(2); // NOT the provisional #5 the roster had latched
    expect(s.kills).toBe(1);
  });

  it('falls back to the latched placement + roster tally when we have no row', () => {
    const s = personalScoreFromResults(recordElimination(freshScore(), 4), undefined, msg, 'ghost', 7);
    expect(s.placement).toBe(5);
    expect(s.kills).toBe(7);
  });
});
