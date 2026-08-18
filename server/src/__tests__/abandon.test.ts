// Story 6.7 — the departure scuttle (Eric rulings R3/R4/R5, 2026-08-18).
//
// A mid-match departure of a still-afloat captain — a consented ABANDON MATCH
// or a 60s reconnect-grace expiry, one path — routes through a REAL sinking
// (world.sinkShip with no killer) instead of the old silent removeShip:
//   - exactly ONE public `sunk` event (the register's combatant clause), so the
//     kill feed and the plume exist;
//   - it credits NOBODY — no kill tally, no XP, no bounty movement (the
//     regression that would hurt most and show up least);
//   - placement is booked once, at the leave tick, matching the old value;
//   - the Story 5.2 sinking window runs IN FULL — the hull is reaped only at
//     founder (reapDeparted), because the client is gone and nothing external
//     will ever remove it;
//   - the scuttle cannot wrongly end the match: the departed hull holds the
//     finish exactly like any other sinking captain, and an absent player can
//     never be the last one afloat.

import { describe, it, expect } from 'vitest';
import { CONFIG, isSinking, type GameEvent } from '@salvo/shared';
import { World } from '../game/world.js';
import { Match, type MatchHooks } from '../game/match.js';
import { observe } from '../game/perception.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';

const TIMINGS = { countdownMs: 100, resultsMs: 200, joinWindowMs: 0 }; // legacy fast path
/** Sinking-window length in 50ms ticks (5000ms -> 100). */
const WINDOW_TICKS = CONFIG.ship.sinkingWindowMs / 50;

interface Harness {
  w: World;
  m: Match;
  /** Every `sunk` event the world emitted, across all stepped ticks. */
  sunk: GameEvent[];
}

function setup(ids: string[]): Harness {
  const w = new World(1);
  w.map.islands.length = 0;
  const hooks: MatchHooks = {
    lock: () => {},
    unlock: () => {},
    broadcastResults: () => {},
    requeue: () => {},
    disconnect: () => {},
  };
  const m = new Match(w, TIMINGS, hooks);
  for (const id of ids) {
    w.addShip(id, id.toUpperCase());
    m.notifyRosterChanged();
  }
  return { w, m, sunk: [] };
}

function step(h: Harness, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    h.w.step();
    h.m.update();
    for (const e of h.w.tickEvents) if (e.k === 'sunk') h.sunk.push(e);
  }
}

function activate(h: Harness): void {
  expect(h.m.phase).toBe('countdown');
  for (let i = 0; i < 100 && h.m.phase !== 'active'; i++) step(h);
  expect(h.m.phase).toBe('active');
}

const sunkOf = (h: Harness, id: string): GameEvent[] =>
  h.sunk.filter((e) => e.k === 'sunk' && e.id === id);

describe('the departure scuttle (R3): a real sinking, credited to nobody', () => {
  it('emits exactly ONE killer-less sunk event and credits no kill, no XP, no bounty', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    const before = ['a', 'c'].map((id) => {
      const s = h.w.ships.get(id)!;
      return { id, kills: s.kills, banked: s.bankedLevels, level: s.level };
    });
    expect(h.w.bountyId).toBe('');
    h.m.onPlayerLeave('b');
    step(h, WINDOW_TICKS + 10); // the whole window and then some
    const events = sunkOf(h, 'b');
    expect(events).toHaveLength(1); // one sinking, one line — never zero, never two
    // No killer: the world-level event carries `by: undefined` (the storm
    // idiom); materialize() strips it to an ABSENT key on the wire, which the
    // far-observer test below pins.
    expect(events[0].k === 'sunk' && events[0].by).toBeUndefined();
    // THE REGRESSION THAT WOULD HURT MOST: nobody is credited for a scuttle.
    for (const b4 of before) {
      const s = h.w.ships.get(b4.id)!;
      expect(s.kills).toBe(b4.kills);
      expect(s.bankedLevels).toBe(b4.banked);
      expect(s.level).toBe(b4.level);
      expect(s.pveKills).toEqual({});
    }
    expect(h.w.bountyId).toBe(''); // the throne never moves on a departure
  });

  it('reaches a far-away observer via the public register clause, unwitnessed', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    // Park the observer far outside sight/radar of the wreck.
    const b = h.w.ships.get('b')!;
    const c = h.w.ships.get('c')!;
    b.state.x = 0;
    b.state.y = 0;
    c.state.x = CONFIG.vision.radar * 2;
    c.state.y = 0;
    h.m.onPlayerLeave('b');
    step(h); // the pending sunk event lands in this tick's frame window
    const seen = observe(h.w, 'c').events.filter((e) => e.k === 'sunk' && e.id === 'b');
    expect(seen).toHaveLength(1); // public clause: every captain sinking reaches every client
    expect(seen[0]).not.toHaveProperty('by');
    expect(seen[0]).not.toHaveProperty('seen'); // ...but unwitnessed: nothing spatial is licensed
  });

  it('is not tallied as a storm death', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.m.onPlayerLeave('b');
    step(h, 5); // consumeSinks has read the scuttle's sunk event by now
    expect(h.m.endSummary().stormDeaths).toBe(0);
  });
});

describe('the sinking window is not truncated (trap 2)', () => {
  it('the hull stays through its full window and is reaped only at founder', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.m.onPlayerLeave('b');
    const ship = h.w.ships.get('b');
    expect(ship).toBeDefined(); // NOT deleted at leave
    expect(isSinking(ship!.lifecycle)).toBe(true); // scuttled: alive -> sinking
    step(h, WINDOW_TICKS - 2);
    expect(h.w.ships.has('b')).toBe(true); // still foundering, window intact
    step(h, 4); // past the founder edge
    expect(h.w.ships.has('b')).toBe(false); // reaped at founder...
    expect(h.w.inputs.get('b')).toBeUndefined(); // ...and the input store with it
  });
});

describe('placement (trap 1): booked once, at the leave tick, matching the old value', () => {
  it('a leaver places below later combat sinks, exactly as before the scuttle', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.m.onPlayerLeave('b'); // first out
    expect(h.w.ships.has('b')).toBe(true); // the scuttle, not the old deletion
    step(h, WINDOW_TICKS + 2);
    expect(h.m.phase).toBe('active'); // two captains still afloat
    h.w.sinkShip('c', 'a'); // then a sinks c
    step(h, WINDOW_TICKS + 2);
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('a');
    expect(h.m.placements.get('a')).toBe(1);
    expect(h.m.placements.get('c')).toBe(2); // later sink places higher
    expect(h.m.placements.get('b')).toBe(3); // the leaver: same placement as today
    expect(sunkOf(h, 'b')).toHaveLength(1); // exactly one sunk despite recordSink + consumeSinks
  });
});

describe('repeat leave (core can route onLeave twice)', () => {
  it('a second leave for an already-scuttled hull does not truncate the window or re-book', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.m.onPlayerLeave('b');
    step(h, 3);
    h.m.onPlayerLeave('b'); // the drop -> failed-reconnect path reaches onLeave again
    expect(h.w.ships.has('b')).toBe(true); // still in its window — NOT removed
    expect(isSinking(h.w.ships.get('b')!.lifecycle)).toBe(true);
    step(h, WINDOW_TICKS + 5);
    expect(h.w.ships.has('b')).toBe(false); // reaped at founder as normal
    expect(sunkOf(h, 'b')).toHaveLength(1); // still exactly one sinking
  });
});

describe('the scuttle cannot wrongly end the match (R3)', () => {
  it('with three captains, a departure ends nothing', () => {
    const h = setup(['a', 'b', 'c']);
    activate(h);
    h.m.onPlayerLeave('b');
    expect(isSinking(h.w.ships.get('b')!.lifecycle)).toBe(true);
    step(h, WINDOW_TICKS + 5);
    expect(h.m.phase).toBe('active'); // a and c fight on
    expect(h.m.winnerId).toBe('');
  });

  it('with two captains, the survivor wins — after the full window, never instantly', () => {
    const h = setup(['a', 'b']);
    activate(h);
    h.m.onPlayerLeave('b');
    // The departed hull holds the finish exactly like any other sinking
    // captain (Eric veto 2026-08-12: the window is never truncated by an
    // immediate results screen).
    expect(h.m.phase).toBe('active');
    step(h, WINDOW_TICKS + 2);
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('a'); // the absent captain can never win
    expect(h.m.endSummary().endedBy).toBe('fieldCleared');
    expect(h.m.placements.get('a')).toBe(1);
    expect(h.m.placements.get('b')).toBe(2);
  });

  it('an already-latched winner is never displaced by the loser abandoning mid-window', () => {
    const h = setup(['a', 'b']);
    activate(h);
    h.w.sinkShip('b', 'a'); // a real combat kill latches a as the winner
    step(h);
    expect(h.m.phase).toBe('active'); // holding for b's window
    h.m.onPlayerLeave('b'); // the sinking loser quits: shipped prompt-finish path
    expect(h.m.phase).toBe('finished');
    expect(h.m.winnerId).toBe('a');
  });
});

describe('one path (R4): consented abandon and grace expiry are identical', () => {
  /** Drive the departure through the REAL ArenaRoom.teardown — the single
   *  funnel both a consented leave and a grace expiry reach via onLeave. */
  function teardownVia(h: Harness, id: string): void {
    const room = new ArenaRoom() as unknown as {
      world: World;
      match: Match | null;
      state: { players: Map<string, unknown> };
      pings: Map<string, unknown>;
      teardown(id: string): void;
    };
    room.world = h.w;
    room.match = h.m;
    room.state = { players: new Map([[id, {}]]) };
    room.pings = new Map();
    room.teardown(id);
  }

  it('both routes produce byte-identical outcomes', () => {
    const viaMatch = setup(['a', 'b', 'c']);
    const viaRoom = setup(['a', 'b', 'c']);
    activate(viaMatch);
    activate(viaRoom);
    viaMatch.m.onPlayerLeave('b');
    teardownVia(viaRoom, 'b');
    for (const h of [viaMatch, viaRoom]) step(h, WINDOW_TICKS + 5);
    // Same single killer-less sunk event...
    expect(sunkOf(viaMatch, 'b')).toEqual(sunkOf(viaRoom, 'b'));
    expect(sunkOf(viaMatch, 'b')).toHaveLength(1);
    // ...same world outcome...
    expect(viaRoom.w.ships.has('b')).toBe(viaMatch.w.ships.has('b'));
    expect(viaRoom.m.phase).toBe(viaMatch.m.phase);
    // ...same bookkeeping.
    expect([...viaRoom.m.placements.entries()]).toEqual([...viaMatch.m.placements.entries()]);
  });
});
