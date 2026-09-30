// THE MATCH RECORD (Story 8.21, Eric rulings R1/R3 of 2026-09-30).
//
// The server-only end-of-match artifact: every hand a ship was dealt (offered
// ids, the id taken, REDRAW, T+ stamps), each participant's final build, and
// the hand-over to the AccountWriter port under the `match.end` latch. Driven
// through a REAL World + Match (no dev options), and the room hook through a
// bare ArenaRoom with its real matchHooks() (the abandon.test pattern).
//
// Pins: (a) ResultsMsg carries none of the record's vocabulary; (c) the
// builder over a redraw + two takes, a leaver, a bot, a fleet hull, an open
// hand at death, a refused pick and a dev fit; (d) exactly one record per
// finished match, none on abort, a rejecting/throwing writer never breaks the
// tick. (b) — the frame half — lives in perception.test.ts's
// DECK_FORBIDDEN_KEYS.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CATALOG, CONFIG, DEFAULT_GUN, MULLIGAN_CHOICE, PROTOCOL_VERSION, type ResultsMsg } from '@salvo/shared';
import { World } from '../game/world.js';
import { Match, type MatchHooks } from '../game/match.js';
import { buildMatchRecord, type MatchRecord } from '../game/matchRecord.js';
import { NullWriter, getAccountWriter, setAccountWriter, type AccountWriter } from '../game/accountWriter.js';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import type { Logger } from '../log.js';
import { flatRaster } from './islandFixture.js';

const TIMINGS = { countdownMs: 500, resultsMs: 200, joinWindowMs: 0 };
const SINK_TICKS = CONFIG.ship.sinkingWindowMs / CONFIG.tick.simDtMs;
const META = { matchId: 'm-1', mode: 'standard', gameVersion: '0.0.0-test', endedAtEpochMs: 1_700_000_000_000 };

/** Every key the record's vocabulary (and the retired deck's) may NEVER use on
 *  the results broadcast. */
const RESULTS_FORBIDDEN_KEYS = [
  'deck', 'deckList', 'deckId', 'deckLeft', 'deckSize', 'pool', 'remaining', 'takes', 'weights',
  'hands', 'offered', 'taken', 'cards', 'loadout', 'record',
] as const;

/** Deep KEY walk (the perception.test hasForbiddenKey shape): a forbidden word
 *  riding as a VALUE never trips it, only as an own key. */
function forbiddenKeysIn(value: unknown, forbidden: readonly string[], found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) forbiddenKeysIn(v, forbidden, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (forbidden.includes(k)) found.push(k);
      forbiddenKeysIn(v, forbidden, found);
    }
  }
  return found;
}

function noopHooks(results: ResultsMsg[] = []): MatchHooks {
  return {
    lock: () => {},
    unlock: () => {},
    broadcastResults: (msg) => void results.push(msg),
    requeue: () => {},
    disconnect: () => {},
  };
}

function bareWorld(seed = 4): World {
  const w = new World(seed, CONFIG.match.fillTo, CONFIG.zone);
  w.map.islands.length = 0;
  w.map.heightRaster = flatRaster();
  return w;
}

interface Ctx {
  w: World;
  m: Match;
}

function step(ctx: Ctx, ticks = 1): void {
  for (let i = 0; i < ticks; i++) {
    ctx.w.step();
    ctx.m.update();
  }
}

/** The first offer index this ship may legally take (the shared refusal law,
 *  asked through the world's own predicate by trying nothing destructive). */
function spendAny(w: World, id: string): string {
  const ship = w.ships.get(id)!;
  const offer = ship.offer!;
  for (let i = 0; i < offer.length; i++) {
    const card = offer[i];
    if (w.spendPoint(id, i)) return card;
  }
  throw new Error(`no takeable card in ${offer.join(',')}`);
}

/**
 * The full story: captains a (redraws, takes at the countdown, takes again on
 * live water — the winner), b (leaves mid-match holding its opening hand),
 * c (sinks holding its opening hand), a bot and a fleet hull.
 */
function playMatch(hooks: MatchHooks = noopHooks(), onBuilt: (ctx: Ctx) => void = () => {}): Ctx & { x: string; y: string } {
  const w = bareWorld();
  const m = new Match(w, TIMINGS, hooks);
  const ctx = { w, m };
  onBuilt(ctx);
  w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined);
  w.addShip('b', 'B', 'captain', 'battleship', undefined, undefined);
  w.addShip('c', 'C', 'captain', 'mineLayer', undefined, undefined);
  w.addShip('bot-1', 'BOT', 'bot', 'torpedoBoat', undefined, undefined);
  w.addShip('f1', 'F1', 'fleet', 'droneSmall', undefined, undefined);
  m.notifyRosterChanged();
  expect(m.phase).toBe('countdown');
  step(ctx); // the countdown is live water-time: the opening hand is dealt
  expect(w.spendPoint('a', MULLIGAN_CHOICE)).toBe(true);
  step(ctx);
  const x = spendAny(w, 'a'); // taken at the countdown — a negative T+
  for (let i = 0; i < 100 && m.phase !== 'active'; i++) step(ctx);
  expect(m.phase).toBe('active');
  step(ctx);
  w.grantXp(w.ships.get('a')!, 1); // one live level → one live hand
  step(ctx);
  const y = spendAny(w, 'a');
  m.onPlayerLeave('b');
  w.sinkShip('c', 'a');
  w.sinkShip('f1', 'a');
  w.sinkShip('bot-1', 'a');
  step(ctx, SINK_TICKS + 2);
  expect(m.phase).toBe('finished');
  expect(m.winnerId).toBe('a');
  return { ...ctx, x, y };
}

describe('buildMatchRecord — the full per-draw history (R1) and who is in it (R3)', () => {
  it('a captain who REDREW the opening, then took at two levels: [redrawn, taken X, taken Y], monotone T+ stamps', () => {
    const { w, m, x, y } = playMatch();
    const rec = buildMatchRecord(m, META);
    const a = rec.participants.find((p) => p.id === 'a')!;
    // Four hands: the three under test, then the one the winner's KILL XP
    // dealt (sinking c and the bot banks levels) — still open at the end.
    expect(a.hands).toHaveLength(4);
    const [h0, h1, h2, h3] = a.hands;
    expect(h0).toMatchObject({ redrawn: true, taken: null, takenAtMs: null });
    expect(h1).toMatchObject({ redrawn: false, taken: x });
    expect(h2).toMatchObject({ redrawn: false, taken: y });
    expect(h1.offered).toContain(x);
    expect(h2.offered).toContain(y);
    for (const h of a.hands) expect(h.offered.length).toBe(CONFIG.offer.size);
    // T+ is `world.now − activatedAt`: the countdown hand and its redraw are
    // NEGATIVE, the live hand is not.
    expect(h0.dealtAtMs).toBeLessThan(0);
    expect(h1.dealtAtMs).toBeLessThan(0);
    expect(h1.takenAtMs!).toBeLessThan(0);
    expect(h2.dealtAtMs).toBeGreaterThanOrEqual(0);
    expect(h3).toMatchObject({ redrawn: false, taken: null, takenAtMs: null });
    const stamps = [h0.dealtAtMs, h1.dealtAtMs, h1.takenAtMs!, h2.dealtAtMs, h2.takenAtMs!, h3.dealtAtMs];
    for (let i = 1; i < stamps.length; i++) expect(stamps[i]).toBeGreaterThanOrEqual(stamps[i - 1]);
    // The final build carries both takes; the kill levels are banked unspent,
    // the front one holding the open hand.
    expect(a.cards).toEqual([x, y]);
    expect(a.bankedLevels).toBeGreaterThanOrEqual(1);
    expect(a.placement).toBe(1);
  });

  it('the leaver is present with placement + hands; the bot with role "bot"; the fleet hull is absent; userId null everywhere', () => {
    const { w, m } = playMatch();
    const rec = buildMatchRecord(m, META);
    const ids = rec.participants.map((p) => p.id).sort();
    expect(ids).toEqual(['a', 'b', 'bot-1', 'c']);
    const b = rec.participants.find((p) => p.id === 'b')!;
    expect(w.ships.has('b')).toBe(false); // the record is gone — the snapshot is not
    expect(b.role).toBe('captain');
    expect(b.placement).toBe(m.placements.get('b'));
    expect(b.hands).toHaveLength(1);
    expect(rec.participants.find((p) => p.id === 'bot-1')!.role).toBe('bot');
    for (const p of rec.participants) {
      expect(p.userId).toBeNull();
      expect(p.role).not.toBe('fleet');
    }
    // Placements are dense 1..n, the record sorted by them.
    expect(rec.participants.map((p) => p.placement)).toEqual([1, 2, 3, 4]);
  });

  it('an OPEN hand at death: the last hand is untaken and not redrawn, and bankedLevels counts it', () => {
    const { w, m } = playMatch();
    const c = buildMatchRecord(m, META).participants.find((p) => p.id === 'c')!;
    expect(c.hands).toHaveLength(1);
    expect(c.hands[0]).toMatchObject({ taken: null, takenAtMs: null, redrawn: false });
    expect(c.hands[0].dealtAtMs).toBeLessThan(0); // the countdown's opening hand
    expect(c.bankedLevels).toBe(1);
  });

  it('carries the match-level fields from the Match and the meta', () => {
    const { w, m } = playMatch();
    const rec = buildMatchRecord(m, META);
    const summary = m.endSummary();
    expect(rec).toMatchObject({
      matchId: 'm-1',
      mode: 'standard',
      protocolVersion: PROTOCOL_VERSION,
      gameVersion: '0.0.0-test',
      endedAtEpochMs: META.endedAtEpochMs,
      activatedAtMs: m.activatedAt,
      durationS: summary.durationS,
      endedBy: summary.endedBy,
      outcome: summary.outcome,
      winnerId: 'a',
    });
  });

  it('is PURE: building twice yields equal records, and mutating one never reaches the Match snapshot', () => {
    const { w, m } = playMatch();
    const r1 = buildMatchRecord(m, META);
    (r1.participants[0].hands as unknown as { taken: string | null }[])[0].taken = 'tampered';
    (r1.participants[0].cards as unknown as string[]).push('tampered');
    const r2 = buildMatchRecord(m, META);
    expect(JSON.stringify(r2)).not.toContain('tampered');
  });

  it('a snapshot never ALIASES the live record: a hand logged after the leave snapshot does not reach it', () => {
    const w = bareWorld();
    const m = new Match(w, TIMINGS, noopHooks());
    w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined);
    w.addShip('b', 'B', 'captain', 'torpedoBoat', undefined, undefined);
    m.notifyRosterChanged();
    for (let i = 0; i < 100 && m.phase !== 'active'; i++) step({ w, m });
    const bRec = w.ships.get('b')!;
    m.onPlayerLeave('b');
    bRec.hands[0].taken = 'armor'; // a write to the live record after its snapshot
    bRec.hands.push({ dealtAtMs: 0, offered: [], taken: null, takenAtMs: null, redrawn: false });
    const snap = m.participantRecords().get('b')!;
    expect(snap.hands).toHaveLength(1);
    expect(snap.hands[0].taken).toBeNull();
  });
});

describe('the hand log — only an OFFER pick is a hand', () => {
  it('a REFUSED pick (a consumable at its cap) records nothing', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined);
    w.countdownOpen = true;
    w.grantOpening();
    expect(a.hands).toHaveLength(1);
    for (let i = 0; i < CATALOG.hullRepair.cap; i += 1) w.applyCard(a, 'hullRepair');
    a.offer = ['hullRepair'];
    const before = JSON.stringify(a.hands);
    expect(w.spendPoint('a', 0)).toBe(false);
    expect(JSON.stringify(a.hands)).toBe(before);
    expect(a.hands[0].taken).toBeNull();
  });

  it('the dev spawn fit lands in `cards` but creates NO hand', () => {
    const w = bareWorld();
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined, DEFAULT_GUN, ['armor', 'speed']);
    expect(a.cards).toEqual(['armor', 'speed']);
    expect(a.hands).toEqual([]);
  });

  it('the activation redeploy PRESERVES the log, exactly as it preserves cards and the bank', () => {
    const w = bareWorld();
    const m = new Match(w, TIMINGS, noopHooks());
    const a = w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined);
    w.addShip('b', 'B', 'captain', 'torpedoBoat', undefined, undefined);
    m.notifyRosterChanged();
    const atCountdown = JSON.stringify(a.hands);
    const bankAtCountdown = a.bankedLevels;
    expect(a.hands).toHaveLength(1);
    for (let i = 0; i < 100 && m.phase !== 'active'; i++) step({ w, m });
    expect(m.phase).toBe('active');
    expect(JSON.stringify(a.hands)).toBe(atCountdown);
    expect(a.bankedLevels).toBe(bankAtCountdown);
  });
});

describe('ResultsMsg never carries the record (pin a)', () => {
  it('a real finish with fitted cards and dealt hands: no forbidden key on the message or any row', () => {
    const results: ResultsMsg[] = [];
    const { w } = playMatch(noopHooks(results));
    expect(results).toHaveLength(1);
    // Non-vacuity: the world really did hold builds and hand logs.
    expect(w.ships.get('a')!.cards.length).toBeGreaterThan(0);
    expect(w.ships.get('a')!.hands.length).toBeGreaterThanOrEqual(3);
    expect(forbiddenKeysIn(results[0], RESULTS_FORBIDDEN_KEYS)).toEqual([]);
    for (const row of results[0].rows) expect(forbiddenKeysIn(row, RESULTS_FORBIDDEN_KEYS)).toEqual([]);
    expect(Object.keys(results[0]).sort()).toEqual(['rows', 'winnerId']);
  });
});

// --- (d) the room hand-over ---------------------------------------------------

interface RoomHarness {
  room: {
    world: World;
    match: Match | null;
    matchId: string;
    log: Logger;
    broadcast: (...args: unknown[]) => void;
    matchHooks(): MatchHooks;
    emitMatchAbort(reason: 'tick-error' | 'abandoned'): void;
  };
  logs: { level: string; event: string; fields: Record<string, unknown> }[];
}

/** A bare ArenaRoom (no Colyseus server) carrying a real World + Match whose
 *  broadcastResults is the room's OWN hook; the transport hooks are inert. */
function roomHarness(): RoomHarness {
  const room = new ArenaRoom() as unknown as RoomHarness['room'];
  const logs: RoomHarness['logs'] = [];
  const rec = (level: string) => (event: string, fields: Record<string, unknown> = {}) => void logs.push({ level, event, fields });
  room.log = { info: rec('info'), warn: rec('warn'), error: rec('error'), debug: rec('debug') };
  room.matchId = 'room-match';
  room.broadcast = () => {};
  return { room, logs };
}

function hooksFor(h: RoomHarness): MatchHooks {
  const real = h.room.matchHooks();
  return { ...noopHooks(), broadcastResults: real.broadcastResults };
}

/** Wire the harness to a match played to its finish (optionally aborting
 *  first, before the finish reaches the hook). */
function playThroughRoom(h: RoomHarness, abortFirst = false): void {
  const hooks: MatchHooks = {
    ...noopHooks(),
    broadcastResults: (msg) => {
      if (abortFirst) h.room.emitMatchAbort('tick-error');
      hooksFor(h).broadcastResults(msg);
    },
  };
  playMatch(hooks, (ctx) => {
    h.room.world = ctx.w;
    h.room.match = ctx.m;
  });
}

describe('the results hook hands the record over (pin d)', () => {
  const original = getAccountWriter();
  afterEach(() => setAccountWriter(original));

  function spyWriter(impl?: (r: MatchRecord) => Promise<void>): AccountWriter & { calls: MatchRecord[] } {
    const calls: MatchRecord[] = [];
    return {
      calls,
      recordMatch: (r) => {
        calls.push(r);
        return impl ? impl(r) : Promise.resolve();
      },
      flush: () => Promise.resolve(),
    };
  }

  it('NullWriter is the default and resolves without storing anything', async () => {
    expect(getAccountWriter()).toBeInstanceOf(NullWriter);
    await expect(new NullWriter().recordMatch({} as MatchRecord)).resolves.toBeUndefined();
    await expect(new NullWriter().flush()).resolves.toBeUndefined();
  });

  it('exactly ONE record per finished match, with a COUNT-ONLY match.record log', () => {
    const writer = spyWriter();
    setAccountWriter(writer);
    const h = roomHarness();
    // The hook reads room.world/room.match at call time: install them first.
    const hooks: MatchHooks = { ...noopHooks(), broadcastResults: (msg) => hooksFor(h).broadcastResults(msg) };
    const w = bareWorld();
    const m = new Match(w, TIMINGS, hooks);
    h.room.world = w;
    h.room.match = m;
    w.addShip('a', 'A', 'captain', 'torpedoBoat', undefined, undefined);
    w.addShip('b', 'B', 'captain', 'torpedoBoat', undefined, undefined);
    m.notifyRosterChanged();
    for (let i = 0; i < 100 && m.phase !== 'active'; i++) step({ w, m });
    w.sinkShip('b', 'a');
    step({ w, m }, SINK_TICKS + 2);
    expect(m.phase).toBe('finished');
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0].matchId).toBe('room-match');
    expect(writer.calls[0].participants.map((p) => p.id).sort()).toEqual(['a', 'b']);
    const line = h.logs.filter((l) => l.event === 'match.record');
    expect(line).toHaveLength(1);
    expect(line[0].fields).toEqual({ matchId: 'room-match', participants: 2, hands: 2 });
    // match.end came first, under the same latch.
    expect(h.logs.findIndex((l) => l.event === 'match.end')).toBeLessThan(h.logs.findIndex((l) => l.event === 'match.record'));
    // A second finish call through the hook hands nothing more (the latch).
    hooksFor(h).broadcastResults({ winnerId: 'a', rows: [] });
    expect(writer.calls).toHaveLength(1);
  });

  it('an ABORTED match hands over NOTHING (R3) and logs no match.record', () => {
    const writer = spyWriter();
    setAccountWriter(writer);
    const h = roomHarness();
    playThroughRoom(h, true);
    expect(writer.calls).toHaveLength(0);
    expect(h.logs.some((l) => l.event === 'match.abort')).toBe(true);
    expect(h.logs.some((l) => l.event === 'match.end' || l.event === 'match.record')).toBe(false);
  });

  it('a REJECTING writer logs account.write.failed and the tick never throws', async () => {
    const writer = spyWriter(() => Promise.reject(new Error('store down')));
    setAccountWriter(writer);
    const h = roomHarness();
    expect(() => playThroughRoom(h)).not.toThrow();
    expect(writer.calls).toHaveLength(1);
    await vi.waitFor(() => expect(h.logs.some((l) => l.event === 'account.write.failed')).toBe(true));
    const failed = h.logs.find((l) => l.event === 'account.write.failed')!;
    expect(failed).toMatchObject({ level: 'warn', fields: { matchId: 'room-match', err: 'store down' } });
  });

  it('a synchronously THROWING writer is contained the same way', () => {
    setAccountWriter({
      recordMatch: () => {
        throw new Error('sync boom');
      },
      flush: () => Promise.resolve(),
    });
    const h = roomHarness();
    expect(() => playThroughRoom(h)).not.toThrow();
    expect(h.logs.find((l) => l.event === 'account.write.failed')?.fields).toEqual({ matchId: 'room-match', err: 'sync boom' });
  });
});
