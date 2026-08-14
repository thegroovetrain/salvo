// Story 2.3 (amendments 22/23) — the client-derived personal score: the
// sunk-contestant roll (drone kills count in the tally, never in the list),
// elimination placement from the public alive count, and the winner state.

import { describe, it, expect } from 'vitest';
import {
  afloatCount,
  canOpenElimination,
  freshScore,
  isAfloatHull,
  isLiveRival,
  personalScore,
  personalScoreFromResults,
  placementFor,
  recordElimination,
  recordSunk,
  refinePlacement,
  respawnArmedIn,
  scoreAfterReconnect,
  boonCount,
  afloatMsFor,
  matchLogLine,
  matchTimeMs,
  STORM_KILLER,
  UNKNOWN_KILLER,
  type SunkObservation,
} from '../score.js';

const OWN = 'me';

function obs(over: Partial<SunkObservation> = {}): SunkObservation {
  return { victimId: 'v1', victimName: 'RIVAL', killerId: OWN, victimIsDrone: false, tMs: 0, killerName: null, ...over };
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
    // Our own sinking adds no ROLL entry (it never did). It DOES now add a
    // MATCH LOG line (amendment 28), so the identity assertion the other two
    // keep is checked on the roll's own fields here.
    const ownDown = recordSunk(base, obs({ victimId: OWN }), OWN);
    expect(ownDown.sunkContestants).toEqual([]);
    expect(ownDown.sunkIds).toEqual([]);
  });

  it('a DRONE we sank never enters the list (the tally still counts it)', () => {
    const base = freshScore();
    const droned = recordSunk(base, obs({ victimIsDrone: true }), OWN);
    expect(droned.sunkContestants).toEqual([]);
    expect(droned.sunkIds).toEqual([]);
    // It DOES earn a MATCH LOG line (amendment 28) — see the log's own suite for
    // why the two lists part company on drones.
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
    const score = personalScore(s, [], 3, false, null);
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
    const won = personalScore(s, ['gunDamage', 'shipHull'], 4, true, null);
    expect(won.winner).toBe(true);
    expect(won.placement).toBeNull();
    expect(won.boons).toBe(2);
    expect(won.kills).toBe(4);
  });

  it('an eliminated player reports the recorded placement', () => {
    const s = recordElimination(freshScore(), 2);
    expect(personalScore(s, [], 0, false, null).placement).toBe(3);
  });

  it('a still-alive player has no placement yet', () => {
    expect(personalScore(freshScore(), [], 0, false, null).placement).toBeNull();
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

describe('afloatCount — the chrome bar counts CAPTAINS: humans only, us included (PV 23)', () => {
  const DRONE = 255;
  // A solo captain's field: our hull, one human rival, five drones.
  const field = [
    { id: OWN, alive: true, color: 1 },
    { id: 'human', alive: true, color: 2 },
    ...[0, 1, 2, 3, 4].map((n) => ({ id: `drone${n}`, alive: true, color: DRONE })),
  ];

  it('excludes DRONES (not combatants) but still counts the LOCAL PLAYER', () => {
    expect(afloatCount(field, DRONE)).toBe(2); // us + the one human rival
    expect(isAfloatHull({ id: 'd', alive: true, color: DRONE }, DRONE)).toBe(false);
    expect(isAfloatHull({ id: OWN, alive: true, color: 1 }, DRONE)).toBe(true);
  });

  it('thins as the CAPTAINS die — drones sinking never move the number', () => {
    // The human rival goes down: 2 → 1. Every drone going down changes nothing.
    const rivalDown = field.map((m) => (m.id === 'human' ? { ...m, alive: false } : m));
    expect(afloatCount(rivalDown, DRONE)).toBe(1);
    const dronesDown = field.map((m) => (m.color === DRONE ? { ...m, alive: false } : m));
    expect(afloatCount(dronesDown, DRONE)).toBe(2);
    expect(afloatCount(field.map((m) => ({ ...m, alive: false })), DRONE)).toBe(0);
  });

  it('a room of 4 humans and 16 drones all alive reads 4 AFLOAT', () => {
    const room = [
      { id: OWN, alive: true, color: 1 },
      ...[2, 3, 4].map((n) => ({ id: `h${n}`, alive: true, color: n })),
      ...Array.from({ length: 16 }, (_, n) => ({ id: `drone${n}`, alive: true, color: DRONE })),
    ];
    expect(afloatCount(room, DRONE)).toBe(4);
  });

  it('excludes the dead, and an entry the roster has not synced yet', () => {
    expect(isAfloatHull({ id: 'a', alive: false, color: 3 }, DRONE)).toBe(false);
    expect(isAfloatHull({ id: 'a' }, DRONE)).toBe(false); // `alive` undefined is not afloat
    expect(afloatCount([], DRONE)).toBe(0);
  });

  it('still DISAGREES with the placement count — the LOCAL-PLAYER half of the asymmetry survives', () => {
    // The surviving half of the old asymmetry: placement ranks the OTHER
    // contestants (us excluded), AFLOAT includes our own hull. The drone half
    // is gone — both counts now exclude drones (the public-register ruling).
    const rivals = field.filter((m) => isLiveRival(m, OWN, DRONE)).length;
    expect(rivals).toBe(1); // the one human rival
    expect(afloatCount(field, DRONE)).toBe(2); // ...but TWO captains are afloat (them + us)
    expect(placementFor(rivals)).toBe(2); // and the placement number is unchanged
  });
});

describe('canOpenElimination — the ordering law for the elimination modal', () => {
  it('opens on an own sinking in a live match', () => {
    expect(canOpenElimination('active', false, false)).toBe(true);
  });

  it('a ready-room sinking is a respawn, not an elimination', () => {
    expect(canOpenElimination('waiting', false, false)).toBe(false);
    expect(canOpenElimination('gathering', false, false)).toBe(false); // join window = ready room
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

describe('respawnArmedIn — the client mirror of World.respawnEnabled', () => {
  // Story 5.2 review fix. The client used to set a respawn deadline on EVERY
  // own sinking; with the sinking window between founder and the spec frame,
  // that put `SUNK — RESPAWNING IN 0s` on screen in a live match. The answer is
  // Match.applyPolicy()'s own rule, mirrored here rather than inferred.

  it('is TRUE for exactly the three ready-room phases', () => {
    expect(respawnArmedIn('waiting')).toBe(true);
    expect(respawnArmedIn('gathering')).toBe(true);
    expect(respawnArmedIn('countdown')).toBe(true);
  });

  it('is FALSE in a live match — an active-phase death is a spectate, not a respawn', () => {
    expect(respawnArmedIn('active')).toBe(false);
  });

  it('fails CLOSED on `finished` and on any phase it does not recognise', () => {
    // Written as the server writes it (the three phases named), never as
    // `!== 'active'`: a placard promising a respawn nobody armed is a lie about
    // the match, while a missing one is cosmetic.
    expect(respawnArmedIn('finished')).toBe(false);
    expect(respawnArmedIn('')).toBe(false);
    expect(respawnArmedIn('some-future-phase')).toBe(false);
  });

  it('is NOT the inverse of canOpenElimination — `finished` is false for both', () => {
    expect(respawnArmedIn('finished')).toBe(false);
    expect(canOpenElimination('finished', false, false)).toBe(false);
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
    const s = personalScoreFromResults(freshScore(), ['gunDamage', 'gunDamage'], msg, OWN, 0, null);
    expect(s.winner).toBe(true);
    expect(s.placement).toBeNull();
    expect(s.kills).toBe(4); // from the row, not the lagging roster tally
    expect(s.boons).toBe(2);
  });

  it('a loser takes the placement from their own results row, not the roster', () => {
    const s = personalScoreFromResults(recordElimination(freshScore(), 4), undefined, msg, 'rival', 0, null);
    expect(s.winner).toBe(false);
    expect(s.placement).toBe(2); // NOT the provisional #5 the roster had latched
    expect(s.kills).toBe(1);
  });

  it('falls back to the latched placement + roster tally when we have no row', () => {
    const s = personalScoreFromResults(recordElimination(freshScore(), 4), undefined, msg, 'ghost', 7, null);
    expect(s.placement).toBe(5);
    expect(s.kills).toBe(7);
  });
});

// --- THE MATCH LOG + TIME AFLOAT (Story 5.3, amendment 28) --------------------

/** A minute-and-second match stamp, for readable expectations. */
function tPlus(m: number, s: number): number {
  return (m * 60 + s) * 1000;
}

describe('matchTimeMs — T+ is `serverNow − zoneStartT`, and an UNANCHORED clock is absent', () => {
  it('is the elapsed match time once the timeline is anchored', () => {
    expect(matchTimeMs(1_000_000, 900_000)).toBe(100_000);
  });

  it('reports NULL rather than the server uptime while zoneStartT is 0', () => {
    // The whole reason the type is nullable: `serverNow − 0` is a huge number
    // that would render as a plausible-looking match clock.
    expect(matchTimeMs(1_000_000, 0)).toBeNull();
    expect(matchTimeMs(1_000_000, -5)).toBeNull();
    expect(matchTimeMs(Number.NaN, 900_000)).toBeNull();
    expect(matchTimeMs(1_000_000, Number.NaN)).toBeNull();
  });

  it('clamps at 0 for a frame sampled just before the anchor lands', () => {
    expect(matchTimeMs(899_990, 900_000)).toBe(0);
  });
});

describe('matchLogLine — which sinkings earn the local player a line', () => {
  it('OUR kill on a named hull is a `sank` line at the observed stamp', () => {
    expect(matchLogLine(obs({ victimName: 'SALT SHAKER', tMs: tPlus(2, 41) }), OWN))
      .toEqual({ tMs: tPlus(2, 41), kind: 'sank', name: 'SALT SHAKER' });
  });

  it('OUR OWN sinking is a `sunkBy` line credited to the killer', () => {
    const line = matchLogLine(obs({ victimId: OWN, killerId: 'k', killerName: "KRAKEN'S BANE", tMs: tPlus(6, 27) }), OWN);
    expect(line).toEqual({ tMs: tPlus(6, 27), kind: 'sunkBy', name: "KRAKEN'S BANE" });
  });

  it('a STORM death (no killer at all) reads SUNK BY THE STORM', () => {
    const line = matchLogLine(obs({ victimId: OWN, killerId: null, killerName: null, tMs: tPlus(9, 3) }), OWN);
    expect(line).toEqual({ tMs: tPlus(9, 3), kind: 'sunkBy', name: STORM_KILLER });
  });

  it('a killer we cannot NAME is UNKNOWN VESSEL, never the storm', () => {
    // Something sank us; saying "THE STORM" would be a lie about our own death.
    // (The kill feed spells this same case UNKNOWN VESSEL.)
    const line = matchLogLine(obs({ victimId: OWN, killerId: 'gone', killerName: null, tMs: 1000 }), OWN);
    expect(line?.name).toBe(UNKNOWN_KILLER);
    expect(UNKNOWN_KILLER).not.toBe(STORM_KILLER);
  });

  it('earns NO line for someone else\'s kill', () => {
    expect(matchLogLine(obs({ killerId: 'other', tMs: 1000 }), OWN)).toBeNull();
    expect(matchLogLine(obs({ killerId: null, tMs: 1000 }), OWN)).toBeNull();
  });

  it('earns NO line for an UNSEEN kill we cannot name (the inherited limitation)', () => {
    // deferred-work.md:211-212 — an LOS-less kill yields no victim NAME. The log
    // inherits the roll's rule: omit the line rather than print a blank or an id.
    expect(matchLogLine(obs({ victimName: null, tMs: 1000 }), OWN)).toBeNull();
  });

  it('earns NO line when the timeline is not anchored (a ready-room sinking)', () => {
    expect(matchLogLine(obs({ tMs: null }), OWN)).toBeNull();
    expect(matchLogLine(obs({ victimId: OWN, tMs: null }), OWN)).toBeNull();
  });

  it('our own death OUTRANKS the kill branch when both would match', () => {
    const line = matchLogLine(obs({ victimId: OWN, killerId: OWN, killerName: 'ME', tMs: 500 }), OWN);
    expect(line?.kind).toBe('sunkBy');
  });
});

describe('recordSunk — the MATCH LOG fold (drones IN, chronological, de-duplicated)', () => {
  it('builds amendment 28\'s example log in ARRIVAL order, our death last', () => {
    let s = freshScore();
    s = recordSunk(s, obs({ victimId: 'a', victimName: 'SALT SHAKER', tMs: tPlus(2, 41) }), OWN);
    s = recordSunk(s, obs({ victimId: 'b', victimName: 'IRON KETTLE', tMs: tPlus(4, 12) }), OWN);
    s = recordSunk(s, obs({ victimId: OWN, killerId: 'k', killerName: "KRAKEN'S BANE", tMs: tPlus(6, 27) }), OWN);
    expect(s.matchLog).toEqual([
      { tMs: tPlus(2, 41), kind: 'sank', name: 'SALT SHAKER' },
      { tMs: tPlus(4, 12), kind: 'sank', name: 'IRON KETTLE' },
      { tMs: tPlus(6, 27), kind: 'sunkBy', name: "KRAKEN'S BANE" },
    ]);
    // Stamps only ever run forward, so appending IS sorting.
    expect(s.matchLog.map((e) => e.tMs)).toEqual([...s.matchLog.map((e) => e.tMs)].sort((x, y) => x - y));
  });

  it('LOGS a drone kill even though the ROLL drops it (amendment 9 is about the results TABLE)', () => {
    // The adjacent KILLS tile is the roster's drone-inclusive tally; a log that
    // dropped drone kills would show one line beside a tile reading 2.
    let s = freshScore();
    s = recordSunk(s, obs({ victimId: 'd1', victimName: 'DRONE-01', victimIsDrone: true, tMs: 30_000 }), OWN);
    s = recordSunk(s, obs({ victimId: 'h1', victimName: 'CAPTAIN-2', tMs: 60_000 }), OWN);
    expect(s.matchLog.map((e) => e.name)).toEqual(['DRONE-01', 'CAPTAIN-2']);
    expect(s.sunkContestants).toEqual(['CAPTAIN-2']);
    expect(personalScore(s, [], 2, false, 90_000).kills).toBe(2);
  });

  it('never logs a hull twice (a duplicate/replayed `sunk` is swallowed)', () => {
    let s = recordSunk(freshScore(), obs({ victimName: 'HORNET', tMs: 10_000 }), OWN);
    const after = recordSunk(s, obs({ victimName: 'HORNET', tMs: 12_000 }), OWN);
    expect(after.matchLog).toHaveLength(1);
    expect(after).toBe(s); // identity preserved: no re-render churn
    // …and a replayed OWN sinking can neither re-post the line nor move the clock.
    s = recordSunk(s, obs({ victimId: OWN, killerId: 'k', killerName: 'RAIL', tMs: 20_000 }), OWN);
    const dup = recordSunk(s, obs({ victimId: OWN, killerId: 'k', killerName: 'RAIL', tMs: 25_000 }), OWN);
    expect(dup).toBe(s);
    expect(dup.sunkAtMs).toBe(20_000);
  });

  it('an event earning no line leaves the state IDENTICAL', () => {
    const base = freshScore();
    expect(recordSunk(base, obs({ killerId: 'other', tMs: 1000 }), OWN)).toBe(base);
    expect(recordSunk(base, obs({ victimName: null, tMs: 1000 }), OWN)).toBe(base);
  });

  it('an UNSTAMPED kill still joins the ROLL — only the LOG needs a clock', () => {
    // The roll is a list of names and never asked when anything happened, so a
    // ready-room sinking (no anchor) is a log omission, not a roll omission.
    const s = recordSunk(freshScore(), obs({ tMs: null }), OWN);
    expect(s.sunkContestants).toEqual(['RIVAL']);
    expect(s.matchLog).toEqual([]);
  });

  it('a kill scored DURING our own sinking window lands after the death line', () => {
    // Story 5.2 amendment 11: you go down shooting. Chronological is the truth
    // of what happened, so the log is not re-ordered to keep the death last.
    let s = recordSunk(freshScore(), obs({ victimId: OWN, killerId: 'k', killerName: 'RAIL', tMs: 100_000 }), OWN);
    s = recordSunk(s, obs({ victimId: 'late', victimName: 'PARTING SHOT', tMs: 103_000 }), OWN);
    expect(s.matchLog.map((e) => e.kind)).toEqual(['sunkBy', 'sank']);
    expect(s.sunkAtMs).toBe(100_000); // TIME AFLOAT still ends at OUR sink-entry
  });
});

describe('afloatMsFor — the clock stops at our SINK-ENTRY, or runs to now', () => {
  it('runs to NOW while we are still afloat (the winner\'s case)', () => {
    expect(afloatMsFor(freshScore(), tPlus(11, 40))).toBe(tPlus(11, 40));
  });

  it('freezes at the moment our own hull went down', () => {
    const s = recordSunk(freshScore(), obs({ victimId: OWN, killerId: 'k', killerName: 'RAIL', tMs: tPlus(6, 27) }), OWN);
    expect(afloatMsFor(s, tPlus(9, 0))).toBe(tPlus(6, 27));
    // …and it agrees exactly with the log's own SUNK BY stamp, which is why
    // sink-entry is used rather than founder (five seconds later).
    expect(s.matchLog[0].tMs).toBe(afloatMsFor(s, tPlus(9, 0)));
  });

  it('is NULL — the tile\'s omit signal — when the timeline has no anchor', () => {
    expect(afloatMsFor(freshScore(), matchTimeMs(1_000_000, 0))).toBeNull();
    expect(personalScore(freshScore(), [], 0, false, null).afloatMs).toBeNull();
  });
});

describe('personalScore + personalScoreFromResults carry the log and the clock', () => {
  const sank = recordSunk(freshScore(), obs({ victimName: 'HORNET', tMs: tPlus(1, 5) }), OWN);

  it('the elimination modal reads both off the local fold', () => {
    const view = personalScore(sank, [], 1, false, tPlus(3, 0));
    expect(view.matchLog).toBe(sank.matchLog);
    expect(view.afloatMs).toBe(tPlus(3, 0));
  });

  it('the GAME-END modal reads both off the local fold too (the message carries neither)', () => {
    const msg = { winnerId: OWN, rows: [{ id: OWN, placement: 1, kills: 1 }] };
    const view = personalScoreFromResults(sank, [], msg, OWN, 0, tPlus(12, 0));
    expect(view.winner).toBe(true);
    expect(view.matchLog).toEqual(sank.matchLog);
    expect(view.afloatMs).toBe(tPlus(12, 0)); // the winner is still on the water
  });

  it('a RECONNECT clears the log with the roll but KEEPS the sink time', () => {
    let s = recordSunk(freshScore(), obs({ victimName: 'HORNET', tMs: tPlus(1, 5) }), OWN);
    s = recordSunk(s, obs({ victimId: OWN, killerId: 'k', killerName: 'RAIL', tMs: tPlus(4, 0) }), OWN);
    const after = scoreAfterReconnect(s);
    // The outage may have swallowed events, so the observed list restarts clean…
    expect(after.matchLog).toEqual([]);
    expect(after.loggedIds).toEqual([]);
    // …but TIME AFLOAT must not resume counting up for a dead player.
    expect(after.sunkAtMs).toBe(tPlus(4, 0));
    expect(afloatMsFor(after, tPlus(9, 0))).toBe(tPlus(4, 0));
  });
});
