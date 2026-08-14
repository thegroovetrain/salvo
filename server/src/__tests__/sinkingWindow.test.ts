// THE SINKING WINDOW (Story 5.2) — server-side coverage of the spec's I/O &
// Edge-Case Matrix plus the AC-mandated perception and input-validation
// invariants during sinking. The shape under test (amendments 10-16/18-19,
// with 17 REVERSED by Eric's veto 2026-08-12 — *"No sinking window, the game
// just immediately ends"* — see the match-outcome suite at the bottom):
// sinkShip takes the `sink` edge with EVERY piece of bookkeeping unmoved at
// sink-entry (one `sunk` event, kill credit, XP, deaths, respawn arm); the
// founderSinking STEP_ORDER row takes `sinking -> sunk` at the flat
// CONFIG.ship.sinkingWindowMs deadline emitting NOTHING; and exactly three
// seams re-open for the window — motion, weapons/equipment/horn,
// perceivability — while damage is a no-op, the refit is closed, the frame
// stays fogged with `you` + `sinkingUntil`, a same-tick captain wipe is a
// genuine DRAW (winnerId ''), and the match is HELD OPEN while any CAPTAIN
// is in its window (outcome latched at sink-entry, transition deferred to
// the last captain founder).

import { describe, it, expect } from 'vitest';
import {
  CONFIG,
  HEAL_CHOICE,
  founderDeadline,
  isAfloat,
  isSinking,
  isSunk,
  wrapPositive,
  type GameEvent,
  type InputMsg,
  type ResultsMsg,
  type ShipClassId,
} from '@salvo/shared';
import { World, type ShipRecord } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { Match, type MatchHooks } from '../game/match.js';
import { flatRaster } from './islandFixture.js';

const DT = CONFIG.tick.simDtMs;
const WINDOW = CONFIG.ship.sinkingWindowMs;
const TICKS = WINDOW / DT;
const SIGHT = CONFIG.vision.sight;

/** No islands + flattened raster: geometry stays out of every rule under test. */
function bareWorld(seed = 11): World {
  const w = new World(seed);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

function place(w: World, id: string, x: number, y: number, cls: ShipClassId = 'torpedoBoat'): ShipRecord {
  const rec = w.addShip(id, id.toUpperCase(), false, cls);
  rec.state.x = x;
  rec.state.y = y;
  rec.state.heading = 0;
  rec.state.speed = 0;
  return rec;
}

function input(seq: number, extra: Partial<InputMsg> = {}): InputMsg {
  return {
    seq,
    throttle: 0,
    rudder: 0,
    aim: 0,
    fireSeq: 0,
    aimDist: 0,
    slot: 0,
    fireT: 0,
    actSeq: 0,
    actSlot: 0,
    hornSeq: 0,
    ...extra,
  };
}

function stepN(w: World, n: number): GameEvent[] {
  const seen: GameEvent[] = [];
  for (let i = 0; i < n; i++) {
    w.step();
    seen.push(...w.tickEvents);
  }
  return seen;
}

/** Open the observer's this-tick paint window around bearing `brg` (the
 *  perception.test.ts idiom). */
function windowAround(me: ShipRecord, brg: number, halfWidth = 0.02): void {
  me.prevSweepAngle = wrapPositive(brg - halfWidth);
  me.sweepAngle = wrapPositive(brg + halfWidth);
}

// ---------- sink entry: bookkeeping unmoved, exactly one sunk event ----------

describe('sink entry (amendments 1/11) — bookkeeping fires immediately, once', () => {
  it('enters `sinking`, credits the killer, counts the death, arms the respawn — all at entry', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 500, 0);
    w.sinkShip('a', 'b');
    expect(isSinking(a.lifecycle)).toBe(true);
    expect(isAfloat(a.lifecycle)).toBe(false); // AFLOAT/roster flip at entry
    expect(a.hp).toBe(0);
    expect(a.deaths).toBe(1);
    expect(b.kills).toBe(1); // killer credited NOW, not at founder
    expect(b.captainKills).toBe(1);
    expect(a.respawnAt).toBe(w.now + CONFIG.ship.respawnDelay); // armed at entry
  });

  it('exactly ONE sunk event across the whole window, and the founder emits nothing', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 500, 0);
    w.respawnEnabled = false;
    w.sinkShip('a', 'b');
    const events = stepN(w, TICKS + 10); // entry tick through founder and beyond
    expect(events.filter((e) => e.k === 'sunk')).toEqual([{ k: 'sunk', id: 'a', by: 'b' }]);
    expect(isSunk(w.ships.get('a')!.lifecycle)).toBe(true);
  });

  it('a second lethal call inside the window is refused by the idempotency lock', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const c = place(w, 'c', 600, 0);
    w.respawnEnabled = false;
    w.sinkShip('a', 'b');
    expect(() => w.sinkShip('a', 'c')).not.toThrow(); // no illegal sink-from-sinking edge
    expect(a.deaths).toBe(1);
    expect(c.kills).toBe(0); // the second claimant credits nothing
    const events = stepN(w, TICKS + 2);
    expect(events.filter((e) => e.k === 'sunk')).toHaveLength(1);
  });
});

// ---------- the ritardando (motion seam) -------------------------------------

describe('motion seam — the hull keeps its way and decays to a stop', () => {
  it('a full-ahead hull decays monotonically to exactly 0 at the founder tick, steering as it goes', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.state.speed = a.stats.kinematics.maxSpeed;
    w.submitInput('a', input(1, { throttle: 1, rudder: 1 }));
    w.respawnEnabled = false;
    w.sinkShip('a');
    const headingAtSink = a.state.heading;
    let prev = a.state.speed;
    for (let i = 0; i < TICKS; i++) {
      w.step();
      expect(a.state.speed).toBeLessThanOrEqual(prev + 1e-9); // never re-accelerates past the cap
      prev = a.state.speed;
    }
    expect(a.state.speed).toBe(0); // exactly 0 on the founder tick (linear cap)
    expect(isSunk(a.lifecycle)).toBe(true); // stopped and foundered on the same tick
    expect(a.state.heading).not.toBe(headingAtSink); // the rudder still bit while making way
  });

  it('a live speedBoost COMPOSES with the decel (amendment 10): the cap is the boosted max, not the rated one', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0); // TB: slot 2 = speedBoost
    a.state.speed = a.stats.kinematics.maxSpeed;
    w.respawnEnabled = false;
    w.sinkShip('a');
    // Activate the boost WHILE SINKING — the fitment criterion admits it.
    w.submitInput('a', input(1, { throttle: 1, actSeq: 1, actSlot: 2 }));
    w.step();
    expect(a.boostUntil).toBeGreaterThan(w.now); // the doomed surge opened
    stepN(w, 19); // t = +1000ms into the window
    // Rated ramp at +1s is maxSpeed × (1 − 1000/5000); the boosted hull may
    // legitimately exceed it — the proof that the cap scales kin.maxSpeed
    // (post-boost), never the rated class max.
    const ratedCap = a.stats.kinematics.maxSpeed * (1 - 1000 / WINDOW);
    expect(a.state.speed).toBeGreaterThan(ratedCap);
  });

  it('an open boost window SURVIVES sink-entry; founder zeroes it with the slow/dazzle marks', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    a.boostUntil = w.now + 60_000;
    a.slowedUntil = w.now + 60_000;
    a.dazzledUntil = w.now + 60_000;
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(a.boostUntil).toBeGreaterThan(0); // amendment 10: the surge lives
    expect(a.slowedUntil).toBeGreaterThan(0); // a hull that sinks fouled sinks fouled
    expect(a.dazzledUntil).toBeGreaterThan(0);
    expect(a.repairHp).toBe(0); // the economy DOES die at entry
    w.step(WINDOW);
    expect(a.boostUntil).toBe(0); // founder: nothing carries through the death gap
    expect(a.slowedUntil).toBe(0);
    expect(a.dazzledUntil).toBe(0);
  });

  it('still resolves against the map boundary and still lays wake while sinking', () => {
    const w = bareWorld();
    const a = place(w, 'a', w.map.radius - 40, 0);
    a.state.speed = a.stats.kinematics.maxSpeed; // charging the edge
    w.submitInput('a', input(1, { throttle: 1 }));
    w.respawnEnabled = false;
    const wakeBefore = a.wake.count;
    w.sinkShip('a');
    stepN(w, 20);
    expect(Math.hypot(a.state.x, a.state.y)).toBeLessThanOrEqual(w.map.radius + 1e-6); // pose resolved
    expect(a.wake.count).toBeGreaterThan(wakeBefore); // seam 3: sinking water is laid
  });
});

// ---------- weapons, equipment and the horn (activation seam) ----------------

describe('weapons seam (amendment 10) — everything in a slot, plus the foghorn', () => {
  it('all seven registry rows activate while sinking — the gate never answers dead', () => {
    const w = bareWorld();
    const fits: [ShipClassId, string[]][] = [
      ['torpedoBoat', ['gun', 'torpedo', 'speedBoost']],
      ['battleship', ['gun', 'cannon', 'starShells']],
      ['mineLayer', ['gun', 'mine', 'decoyBuoy']],
    ];
    for (const [cls, expected] of fits) {
      const ship = place(w, `s-${cls}`, 0, 0, cls);
      ship.input = input(1, { aim: 0, aimDist: 200 });
      w.sinkShip(ship.id);
      expect(isSinking(ship.lifecycle)).toBe(true);
      for (let slot = 0; slot < expected.length; slot++) {
        expect(ship.loadout[slot].equipmentId).toBe(expected[slot]);
        const r = w.sinkingActivationGate(ship, slot);
        // ok, or a normal per-row denial — NEVER the dead refusal.
        if (!r.ok) expect(r.reason).not.toBe('dead');
      }
    }
  });

  it('a real click through the input path fires the gun while sinking', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aim: 0, aimDist: 300 }));
    w.step();
    expect(w.shells.size).toBe(1); // the shot left the tube
  });

  it('the horn still sounds while sinking', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.submitInput('a', input(1, { hornSeq: 1 }));
    w.step();
    expect(w.tickEvents.filter((e) => e.k === 'fh')).toHaveLength(1);
  });

  it('normal per-row denials are unchanged while sinking (out-of-arc still reaches the wire)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0); // TB torpedo: forward arc only
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.submitInput('a', input(1, { fireSeq: 1, slot: 1, aim: Math.PI, aimDist: 300 })); // astern
    w.step();
    expect(w.denialsFor('a')).toEqual([{ slot: 1, reason: 'out-of-arc', seq: 1 }]);
  });

  it('the firing window closes on exactly the founder tick', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    stepN(w, TICKS); // the founder tick has run
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aim: 0, aimDist: 300 }));
    w.step();
    expect(w.shells.size).toBe(0); // dead: the click is consumed, nothing fires
    expect(w.denialsFor('a')).toBeUndefined(); // and the dead refusal stays server-internal
  });
});

// ---------- the refit is closed (amendment 10) --------------------------------

describe('refit closed — "once sinking, you\'re done"', () => {
  it('card picks and the heal are both refused while sinking; the bank survives for the next life', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.grantXp(a, 1); // bank one level
    expect(a.bankedLevels).toBe(1);
    a.hp -= 50; // a heal would have something to restore
    w.respawnEnabled = false;
    w.sinkShip('a');
    expect(w.spendPoint('a', 0)).toBe(false); // card pick: clean denial
    expect(w.spendPoint('a', HEAL_CHOICE)).toBe(false); // heal: clean denial
    expect(a.bankedLevels).toBe(1); // bank and queue untouched
    expect(a.boons).toEqual([]);
    expect(a.repairHp).toBe(0);
    // Once FOUNDERED, dead spending resumes (builds persist across respawns).
    w.step(WINDOW);
    expect(w.spendPoint('a', 0)).toBe(true);
    expect(a.bankedLevels).toBe(0);
  });
});

// ---------- damage on a sinking hull is a no-op (amendment 12) ---------------

describe('finish-off attempt — damage is a no-op, the deadline never moves', () => {
  it('ordnance passes through: a shell over the hull resolves no dmg, no re-sink, no throw', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 500, 0);
    w.respawnEnabled = false;
    const sankAt = w.now;
    w.sinkShip('a', 'b');
    // b bursts a gun shell dead on the sinking hull's position.
    w.submitInput('b', input(1, { fireSeq: 1, slot: 0, aim: Math.PI, aimDist: 500 }));
    const events = stepN(w, 30); // flight + burst + aftermath
    expect(events.filter((e) => e.k === 'dmg' && e.id === 'a')).toEqual([]); // no damage
    expect(events.filter((e) => e.k === 'sunk')).toHaveLength(1); // no re-sink
    expect(a.deaths).toBe(1);
    expect(isSinking(a.lifecycle)).toBe(true); // still in ITS OWN window
    expect(founderDeadline(sankAt)).toBe(sankAt + WINDOW); // and the deadline never moved:
    expect(buildFrame(w, 'a', 'active').you!.sinkingUntil).toBe(sankAt + WINDOW);
  });

  it('an enemy mine at trigger range never trips on a sinking hull', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    w.mines.set('m1', { id: 'm1', ownerId: 'z', x: 10, y: 0, armedAt: 0 }); // inside any trigger ring
    stepN(w, 10);
    expect(w.mines.has('m1')).toBe(true); // not a collision subject: the trap stays set
  });

  it('the window always runs its FULL length — founder lands on exactly the deadline tick', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    w.respawnEnabled = false;
    w.sinkShip('a');
    stepN(w, TICKS - 1);
    expect(isSinking(a.lifecycle)).toBe(true); // one tick short: still going down
    w.step();
    expect(isSunk(a.lifecycle)).toBe(true); // the deadline tick: on the bottom
  });
});

// ---------- no wallhack: the frame stays fogged and carries you --------------

describe('the sinking frame (amendments 7/16) — fogged, with `you` and `sinkingUntil`', () => {
  it("a sinking captain's active-phase frame is fogged, carries you, and self-discloses the deadline", () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 2 * SIGHT, 0); // far beyond a fogged bubble
    w.respawnEnabled = false;
    const sankAt = w.now;
    w.sinkShip('a', 'b');
    w.step();
    const f = buildFrame(w, 'a', 'active');
    expect(f.spec).toBeUndefined(); // never the unfogged view mid-window
    expect(f.you).toBeDefined(); // and never a you-less frame (the main.ts:548 trap)
    expect(f.you!.alive).toBe(false); // the projection flips at entry
    expect(f.you!.sinkingUntil).toBe(founderDeadline(sankAt)); // present IFF sinking
    expect(f.contacts.map((c) => c.id)).toEqual([]); // b beyond sight: fog holds
  });

  it('at founder the frame becomes the spectator view and sinkingUntil leaves the wire', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    place(w, 'b', 100, 0);
    w.respawnEnabled = false;
    w.sinkShip('a', 'b');
    w.step(WINDOW);
    const f = buildFrame(w, 'a', 'active');
    expect(f.spec).toBe(true);
    expect(f.you).toBeUndefined();
    expect(JSON.stringify(f)).not.toContain('sinkingUntil');
  });

  it('an ALIVE hull never carries sinkingUntil (present iff sinking, omitted otherwise)', () => {
    const w = bareWorld();
    place(w, 'a', 0, 0);
    w.step();
    const you = buildFrame(w, 'a', 'active').you!;
    expect('sinkingUntil' in you).toBe(false); // omitted, never undefined
  });
});

// ---------- perceivability seam + no enemy-facing disclosure -----------------

describe('perceivability (amendments 15/16) — still a contact, still a blip, nothing disclosed', () => {
  it('a sinking hull inside sight is a normal contact with the exact live-hull shape', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 200, 0); // inside a's sight
    w.respawnEnabled = false;
    w.sinkShip('b', 'a');
    w.step();
    const b = w.ships.get('b')!;
    const f = buildFrame(w, 'a', 'active');
    expect(f.contacts).toEqual([
      { id: 'b', x: b.state.x, y: b.state.y, heading: b.state.heading, speed: b.state.speed, cls: 'torpedoBoat' },
    ]);
    // NOTHING anywhere in the observer's frame names the window (amendment 16
    // — the `sunk` event is the ruled-public register and carries no window
    // field either; the string can only appear via the self-private key).
    expect(JSON.stringify(f)).not.toContain('sinkingUntil');
    expect('sinkingUntil' in buildFrame(w, 'a', 'active').you!).toBe(false);
    expect(isSinking(a.lifecycle)).toBe(false);
  });

  it('a sinking hull in the radar annulus still paints a blip when the beam crosses it', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    const b = place(w, 'b', 400, 0); // sight < 400 ≤ radar
    w.respawnEnabled = false;
    w.sinkShip('b', 'a');
    windowAround(a, 0); // beam over b's bearing this tick
    const blips = buildFrame(w, 'a', 'active').events.filter((e) => e.k === 'blip');
    expect(blips).toEqual([
      { k: 'blip', id: 'b', x: b.state.x, y: b.state.y, t: w.now, cls: 'torpedoBoat', heading: 0, speed: 0 },
    ]);
  });

  it('at founder the hull leaves both tiers', () => {
    const w = bareWorld();
    const a = place(w, 'a', 0, 0);
    place(w, 'b', 200, 0);
    w.respawnEnabled = false;
    w.sinkShip('b', 'a');
    w.step(WINDOW);
    windowAround(a, 0);
    const f = buildFrame(w, 'a', 'active');
    expect(f.contacts).toEqual([]);
    expect(f.events.filter((e) => e.k === 'blip')).toEqual([]);
  });
});

// ---------- the match: outcome LATCHED at sink-entry, transition HELD --------
//
// AMENDMENT 17 IS REVERSED (Eric veto 2026-08-12). The orchestrator ruling
// weighed the truncated window for a 20-player lobby ("the last kill is one
// death out of nineteen") and missed that in a 1v1 EVERY death is the
// match-ending death — the feature was invisible in every duel. Eric played
// one and reported it verbatim: "No sinking window, the game just immediately
// ends." The fix is latch-then-hold: the OUTCOME still freezes the instant
// ≤1 captain is afloat (amendment 14 verbatim — sinking never moves a
// result), but the TRANSITION to 'finished' waits for every sinking
// CAPTAIN's window. Drones never hold; a hard safety-net deadline bounds the
// hold even if the founder edge were ever to break.

const TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 };

function matchSetup(ids: string[], drones = 0): { w: World; m: Match; results: ResultsMsg[] } {
  const w = new World(1);
  w.map.islands.length = 0;
  const results: ResultsMsg[] = [];
  const hooks: MatchHooks = {
    lock: () => {},
    unlock: () => {},
    fillToCapacity: () => {},
    broadcastResults: (msg) => results.push(msg),
    disconnect: () => {},
  };
  const m = new Match(w, TIMINGS, hooks);
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    m.notifyRosterChanged();
  }
  for (let i = 0; i < drones; i++) w.addShip(`d${i}`, `D${i}`, true);
  for (let i = 0; i < 100 && m.phase !== 'active'; i++) {
    w.step();
    m.update();
  }
  expect(m.phase).toBe('active');
  return { w, m, results };
}

function stepMatch(w: World, m: Match, n = 1): void {
  for (let i = 0; i < n; i++) {
    w.step();
    m.update();
  }
}

describe('match outcome (amendment 14; amendment 17 REVERSED by Eric veto 2026-08-12)', () => {
  // THE 1v1 REGRESSION Eric reported. Without the latch-then-hold fix the
  // first assertion below reads 'finished' ONE TICK after the sink — the
  // whole window destroyed in exactly the case every duel ends in.
  it("1v1: the match stays ACTIVE for the loser's whole window, the loser still fires, and the finish lands at founder", () => {
    const { w, m, results } = matchSetup(['a', 'b']);
    w.sinkShip('a', 'b');
    stepMatch(w, m);
    expect(m.phase).toBe('active'); // NOT finished on the sink tick any more
    expect(isSinking(w.ships.get('a')!.lifecycle)).toBe(true);
    expect(results).toHaveLength(0); // no results broadcast mid-window
    // Mid-window the dying captain's guns still work (the weapons seam,
    // amendment 10 — and the reason the hold exists at all).
    w.submitInput('a', input(1, { fireSeq: 1, slot: 0, aim: 0, aimDist: 300 }));
    stepMatch(w, m);
    expect(w.shells.size).toBe(1); // the revenge shot left the tube
    stepMatch(w, m, TICKS - 3); // one tick short of the founder deadline
    expect(m.phase).toBe('active');
    expect(isSinking(w.ships.get('a')!.lifecycle)).toBe(true);
    stepMatch(w, m); // the founder tick: window over, transition lands
    expect(isSunk(w.ships.get('a')!.lifecycle)).toBe(true);
    expect(m.phase).toBe('finished');
    expect(m.winnerId).toBe('b');
    expect(results[0].winnerId).toBe('b');
  });

  it("the loser's revenge shot sinks the latched winner mid-window: the winner STILL wins, placed 1st", () => {
    const { w, m, results } = matchSetup(['a', 'b']);
    w.sinkShip('a', 'b'); // the outcome latches HERE: b wins
    stepMatch(w, m);
    expect(m.phase).toBe('active');
    w.sinkShip('b', 'a'); // the revenge kill, one tick later — NOT a same-tick wipe
    stepMatch(w, m);
    expect(m.phase).toBe('active'); // now waiting on BOTH windows; b's ends last
    stepMatch(w, m, TICKS + 1);
    expect(m.phase).toBe('finished');
    expect(m.winnerId).toBe('b'); // latched at a's sink-entry; b's own sinking moved NOTHING
    expect(m.placements.get('b')).toBe(1); // first even though b ended up in the sink order
    expect(m.placements.get('a')).toBe(2);
    expect(results[0].winnerId).toBe('b');
    expect(results[0].rows.map((r) => [r.id, r.placement])).toEqual([
      ['b', 1],
      ['a', 2],
    ]);
  });

  it('a same-tick wipe of every remaining captain is STILL a genuine DRAW once both windows run out', () => {
    const { w, m, results } = matchSetup(['a', 'b']);
    w.sinkShip('a', 'b');
    w.sinkShip('b', 'a'); // the same tick — amendment 14's wipe
    stepMatch(w, m);
    expect(m.phase).toBe('active'); // both windows hold the transition
    stepMatch(w, m, TICKS);
    expect(m.phase).toBe('finished');
    expect(m.winnerId).toBe(''); // the draw resolution was latched at the wipe tick
    expect(results[0].winnerId).toBe(''); // the wire carries the draw verbatim
  });

  it('a sinking DRONE never delays the finish (drones are not combatants)', () => {
    const { w, m } = matchSetup(['a', 'b'], 1);
    w.sinkShip('b', 'a'); // latch: a wins; hold for b's window
    stepMatch(w, m, TICKS / 2);
    expect(m.phase).toBe('active');
    w.sinkShip('d0', 'a'); // the drone's window now outlives b's by half a window
    stepMatch(w, m, TICKS / 2 + 1); // b's founder tick
    expect(m.phase).toBe('finished'); // landed ON b's founder…
    expect(isSinking(w.ships.get('d0')!.lifecycle)).toBe(true); // …with the drone mid-window
    expect(m.winnerId).toBe('a');
  });

  it('the last sinking captain LEAVES mid-window: the finish is prompt, never hung', () => {
    const { w, m } = matchSetup(['a', 'b']);
    w.sinkShip('a', 'b');
    stepMatch(w, m);
    expect(m.phase).toBe('active'); // holding for a's window
    m.onPlayerLeave('a'); // removeShip takes the sinking hull with it
    expect(m.phase).toBe('finished'); // nothing left to wait for — same call
    expect(m.winnerId).toBe('b'); // latched at the sink tick, untouched by the leave
  });

  it('the SAFETY NET: a founder edge that never lands cannot hold the match open forever', () => {
    const { w, m } = matchSetup(['a', 'b']);
    w.sinkShip('a', 'b');
    stepMatch(w, m);
    expect(m.phase).toBe('active');
    // Sabotage the founder edge: shove the sinking stamp into the far future
    // so hasFoundered can never fire — the "match that can never finish"
    // catastrophe the net exists for. Nothing in a healthy sim does this.
    const a = w.ships.get('a')!;
    a.lifecycle = { kind: 'sinking', since: w.now + 100 * WINDOW };
    stepMatch(w, m, TICKS + 40); // latch + window + margin (1s) comfortably passed
    expect(isSinking(a.lifecycle)).toBe(true); // the hull is genuinely stuck…
    expect(m.phase).toBe('finished'); // …and the net finished the match anyway
    expect(m.winnerId).toBe('b');
  });
});
