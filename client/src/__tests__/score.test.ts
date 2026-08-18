// Story 2.3 (amendments 22/23) — the client-derived personal score: the
// sunk-contestant roll (PvE kills appear in NO record — amendment 38),
// elimination placement from the public alive count, and the winner state.

import { describe, it, expect } from 'vitest';
import {
  afloatCount,
  canOpenElimination,
  freshScore,
  isAfloatHull,
  isLiveRival,
  missedEliminationAction,
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

  it('a PvE fleet hull we sank enters NEITHER record (amendment 38)', () => {
    const base = freshScore();
    const droned = recordSunk(base, obs({ victimIsDrone: true }), OWN);
    expect(droned.sunkContestants).toEqual([]);
    expect(droned.sunkIds).toEqual([]);
    // ...and no MATCH LOG line either, which REVERSES Story 5.3's rule: the
    // roster tally that argument leaned on no longer counts drones, so the two
    // now agree by exclusion. The state is returned IDENTICAL.
    expect(droned.matchLog).toEqual([]);
    expect(droned).toBe(base);
  });

  it('de-duplicates by victim id (a respawn-and-resink lists one hull)', () => {
    let s = recordSunk(freshScore(), obs(), OWN);
    s = recordSunk(s, obs(), OWN);
    expect(s.sunkContestants).toEqual(['RIVAL']);
  });

  it('2 fleet hulls + 1 captain ⇒ kills 1 (the server already dropped the PvE two)', () => {
    let s = freshScore();
    s = recordSunk(s, obs({ victimId: 'd1', victimName: 'DRONE', victimIsDrone: true }), OWN);
    s = recordSunk(s, obs({ victimId: 'd2', victimName: 'DRONE', victimIsDrone: true }), OWN);
    s = recordSunk(s, obs({ victimId: 'h1', victimName: 'CAPTAIN-2' }), OWN);
    // `kills` is the roster tally handed in, and amendment 38 stopped that
    // tally counting PvE sinkings at the SOURCE — the client filters nothing.
    const score = personalScore(s, [], 1, false, null);
    expect(score.kills).toBe(1);
    expect(score.sunkContestants).toEqual(['CAPTAIN-2']);
    expect(score.matchLog.map((e) => e.name)).toEqual(['CAPTAIN-2']);
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

describe('isLiveRival — placement counts the ROSTER, which is captains only (amendment 39)', () => {
  it('excludes the dead and ourselves — and no longer takes a drone sentinel at all', () => {
    expect(isLiveRival({ id: 'a', alive: true, color: 3 }, OWN)).toBe(true);
    expect(isLiveRival({ id: 'a', alive: false, color: 3 }, OWN)).toBe(false);
    expect(isLiveRival({ id: OWN, alive: true, color: 3 }, OWN)).toBe(false);
  });

  it('COUNTS a captain whose colour byte has not patched in — 255 is no longer "drone"', () => {
    // The sentinel was DUAL-PURPOSE ("drone" AND "hue not assigned yet"). With
    // fleet hulls off the roster only the second meaning survives, and dropping
    // such a row would drop a real captain mid-patch.
    expect(isLiveRival({ id: 'late', alive: true, color: 255 }, OWN)).toBe(true);
    expect(isLiveRival({ id: 'late', alive: true }, OWN)).toBe(true);
  });

  it('the solo-captain case: fleet hulls are not on the roster, so you place 2nd', () => {
    // Story 5.6: the nine hulls of a fleet contribute NO roster rows, which is
    // why this no longer needs a filter to reach the same answer.
    const roster = [
      { id: OWN, alive: true, color: 1 },
      { id: 'human', alive: true, color: 2 },
    ];
    const rivals = roster.filter((m) => isLiveRival(m, OWN)).length;
    expect(rivals).toBe(1);
    expect(placementFor(rivals)).toBe(2);
  });
});

describe('afloatCount — the chrome bar counts CAPTAINS, which is now simply the roster', () => {
  // A solo captain's field. The fleet hulls sailing alongside are ABSENT from
  // this list rather than filtered out of it — that is the whole change
  // (amendment 39: "n AFLOAT gets simpler rather than harder").
  const field = [
    { id: OWN, alive: true, color: 1 },
    { id: 'human', alive: true, color: 2 },
  ];

  it('counts every live row INCLUDING the local player', () => {
    expect(afloatCount(field)).toBe(2); // us + the one human rival
    expect(isAfloatHull({ id: OWN, alive: true, color: 1 })).toBe(true);
  });

  it('thins as the CAPTAINS die', () => {
    const rivalDown = field.map((m) => (m.id === 'human' ? { ...m, alive: false } : m));
    expect(afloatCount(rivalDown)).toBe(1);
    expect(afloatCount(field.map((m) => ({ ...m, alive: false })))).toBe(0);
  });

  it('a room of 4 captains reads 4 AFLOAT however many fleet hulls are on the water', () => {
    const room = [
      { id: OWN, alive: true, color: 1 },
      ...[2, 3, 4].map((n) => ({ id: `h${n}`, alive: true, color: n })),
    ];
    expect(afloatCount(room)).toBe(4);
  });

  it('excludes the dead, and counts an entry whose HUE has not synced yet', () => {
    expect(isAfloatHull({ id: 'a', alive: false, color: 3 })).toBe(false);
    expect(isAfloatHull({ id: 'a' })).toBe(false); // `alive` undefined is not afloat
    expect(isAfloatHull({ id: 'late', alive: true, color: 255 })).toBe(true); // captain mid-patch
    expect(afloatCount([])).toBe(0);
  });

  it('still DISAGREES with the placement count — the LOCAL-PLAYER half of the asymmetry survives', () => {
    // Placement ranks the OTHER contestants (us excluded); AFLOAT includes our
    // own hull. The drone half of the old asymmetry is gone twice over now:
    // both counts exclude fleet hulls, and neither has to test for them.
    const rivals = field.filter((m) => isLiveRival(m, OWN)).length;
    expect(rivals).toBe(1); // the one human rival
    expect(afloatCount(field)).toBe(2); // ...but TWO captains are afloat (them + us)
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

describe('missedEliminationAction — the death that happened while we were away (Story 6.7, R7)', () => {
  const live = { spectating: true, ownAlive: false, phase: 'active', resultsFinal: false, alreadyEliminated: false };

  it('opens the synthesized entry: spectating, own roster row sunk, live match', () => {
    // The own `sunk` was delivered to nobody — the room had no socket to send it
    // down — so without this the captain spectates forever with no ELIMINATED
    // modal and no placement, which reads as the game forgetting them.
    expect(missedEliminationAction(live)).toBe('open');
  });

  it('WAITS while the roster has not patched our row in', () => {
    // The frame and the schema patch arrive independently, so a check that fired
    // on "the first resumed frame" would read an empty roster about half the
    // time and conclude — wrongly, and permanently — that nothing was missed.
    expect(missedEliminationAction({ ...live, ownAlive: undefined })).toBe('wait');
  });

  it('WAITS while we are still conning a hull — a spec frame is the whole premise', () => {
    expect(missedEliminationAction({ ...live, spectating: false })).toBe('wait');
  });

  it('settles quietly when we resumed ALIVE', () => {
    expect(missedEliminationAction({ ...live, ownAlive: true })).toBe('settled');
  });

  it('never opens once the match is over — the resume-into-results ordering', () => {
    // Core runs the reconnection deferred's `.then` (the `lastResults` re-send)
    // BEFORE calling onReconnect, so on a resume `results` reaches the client
    // ahead of the welcome. Both halves of that landing are covered: the schema
    // phase, and `resultsFinal` once the table is up.
    expect(missedEliminationAction({ ...live, phase: 'finished' })).toBe('settled');
    expect(missedEliminationAction({ ...live, resultsFinal: true })).toBe('settled');
  });

  it('opens EXACTLY ONCE — a real `sunk` replayed behind it cannot re-open the modal', () => {
    expect(missedEliminationAction(live)).toBe('open');
    // `recordElimination` latches `eliminated`, which is the same never-twice
    // clause that already protects a duplicate `sunk`.
    const after = recordElimination(freshScore(), 3);
    expect(after.eliminated).toBe(true);
    expect(missedEliminationAction({ ...live, alreadyEliminated: after.eliminated })).toBe('settled');
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

describe('recordSunk — the MATCH LOG fold (chronological, de-duplicated, PvE OUT)', () => {
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

  it('DROPS a PvE kill from the log, exactly as the roll does (amendment 38)', () => {
    // Story 5.3 logged drone kills because the adjacent KILLS tile counted them
    // and a log that dropped them would disagree with the tile. Amendment 37
    // emptied the tile, so the log empties with it: one line, one kill, one
    // number, all three agreeing.
    let s = freshScore();
    s = recordSunk(s, obs({ victimId: 'd1', victimName: 'DRONE', victimIsDrone: true, tMs: 30_000 }), OWN);
    s = recordSunk(s, obs({ victimId: 'h1', victimName: 'CAPTAIN-2', tMs: 60_000 }), OWN);
    expect(s.matchLog.map((e) => e.name)).toEqual(['CAPTAIN-2']);
    expect(s.sunkContestants).toEqual(['CAPTAIN-2']);
    expect(personalScore(s, [], 1, false, 90_000).kills).toBe(1);
  });

  it('STILL logs our own death when a PvE fleet hull is what sank us, SIZED (review-gate fix)', () => {
    // The victim test runs first, so the new drone clause can never eat the one
    // line the log exists to guarantee: the player's own end.
    //
    // killerName here is 'LARGE DRONE', not null and not plain 'DRONE': main.ts
    // resolves the MATCH LOG's killer name through `feedName` (the same
    // resolver the kill feed uses), which now sizes a fleet hull off the memo
    // via `fleetSizeName` rather than either falling through the roster lookup
    // to null OR answering the unsized `DRONE_PLATE_TEXT`. Eric's ruling
    // 2026-08-14 (the size-the-death-line follow-up): *"if you actually die to
    // a drone, I DO want to see that... SUNK BY SMALL DRONE is both funnier and
    // strictly more informative"* — the size IS the embarrassment. A hull that
    // sank you is one you almost certainly saw (symmetric 330u sight/gun
    // range), so the memo has it. Before the FIRST review-gate fix the two
    // surfaces disagreed outright (feed "DRONE SANK <you>" vs. log "SUNK BY
    // UNKNOWN VESSEL"); before THIS one they'd have agreed on the wrong,
    // unsized answer. Both must resolve the identical sized string.
    const s = recordSunk(
      freshScore(),
      obs({ victimId: OWN, victimIsDrone: true, killerId: 'd1', killerName: 'LARGE DRONE', tMs: 77_000 }),
      OWN,
    );
    expect(s.matchLog).toEqual([{ tMs: 77_000, kind: 'sunkBy', name: 'LARGE DRONE' }]);
    expect(s.sunkAtMs).toBe(77_000);
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
