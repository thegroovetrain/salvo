// Story 6.6 — the public `/liveness` aggregator, tested row by row against the
// spec's I/O matrix.
//
// This is deliberately unit-level against the PURE foldLiveness(): the whole
// reason the fold lives outside the endpoint is that "humans only, any phase,
// null queue is normal" is the rule this story can silently break, and it must
// be provable without a driver, a socket or a boot. In particular the EMPTY
// server — the normal case on launch day, and the case a real boot is worst at
// reproducing — is one line here.
//
// The adapter's own responsibilities (the real driver query, the route) are
// integration surface and are covered by livenessSmoke.mjs; what is checked
// HERE is the fold, the metadata defaulting, and the cache.
//
// NOTE: `colyseus` is imported by liveness.ts (for matchMaker + createEndpoint)
// but nothing in this file touches it — every test injects its own query.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ClientState } from 'colyseus';
import { CONFIG } from '@salvo/shared';
import { ArenaRoom } from '../rooms/ArenaRoom.js';
import { StandardQueueRoom } from '../rooms/StandardQueueRoom.js';
import {
  foldLiveness,
  modeOf,
  livenessPayload,
  resetLiveness,
  __setLivenessNowSource,
  LIVENESS_CACHE_MS,
  ARENA_ROOM,
  QUEUE_ROOM,
  livenessEndpoint,
  viewerIdOf,
  homeViewers,
  PRESENCE_KEY,
  PRESENCE_TTL_MS,
  type RoomRecord,
  type PresenceLike,
} from '../liveness.js';

const NOW = 1_700_000_000_000;

/** An arena listing; `mode` undefined means "no metadata at all". */
function arena(clients: number, mode?: string): RoomRecord {
  return mode === undefined
    ? { name: ARENA_ROOM, clients }
    : { name: ARENA_ROOM, clients, metadata: { mode } };
}

/** A queue listing carrying the block StandardQueueRoom publishes. */
function queue(clients: number, meta?: unknown): RoomRecord {
  return meta === undefined ? { name: QUEUE_ROOM, clients } : { name: QUEUE_ROOM, clients, metadata: meta };
}

beforeEach(() => {
  resetLiveness();
  __setLivenessNowSource(() => Date.now());
});

// --- the I/O matrix ----------------------------------------------------------

describe('foldLiveness — the spec I/O matrix', () => {
  it('healthy server: 2 arenas (12 + 8) plus a queue of 3', () => {
    const deadlineAt = NOW + 83_000;
    const out = foldLiveness(
      [
        arena(12, 'standard'),
        arena(8, 'standard'),
        queue(3, { pooled: 3, min: 2, cap: 20, deadlineAt }),
      ],
      NOW,
    );
    // 12 + 8 + 3 — a captain waiting in the queue is a player who is online.
    expect(out.playersOnline).toBe(23);
    expect(out.liveGames).toBe(2);
    expect(out.queue).toEqual({ pooled: 3, min: 2, cap: 20, deadlineAt });
    expect(out.serverNow).toBe(NOW);
  });

  it('empty server: no rooms at all renders an honest zero, not a null', () => {
    const out = foldLiveness([], NOW);
    expect(out.playersOnline).toBe(0);
    expect(out.liveGames).toBe(0);
    // REVISED: the queue block is EMITTED even with no queue room (see the
    // "no queue room" block below for why). The COUNTS are 0, not absent — a
    // population of zero is a fact the player needs.
    expect(out.queue).toEqual({
      pooled: 0,
      min: CONFIG.match.minHumans,
      cap: CONFIG.map.playerCap,
      deadlineAt: null,
    });
    expect(out.modes).toEqual({
      standard: { players: 0, games: 0 },
      soloVsAi: { players: 0, games: 0 },
    });
  });

  it('no queue room: autoDispose removed it — identical to an empty queue, never an error', () => {
    const out = foldLiveness([arena(4, 'standard')], NOW);
    expect(out.queue).toEqual({
      pooled: 0,
      min: CONFIG.match.minHumans,
      cap: CONFIG.map.playerCap,
      deadlineAt: null,
    });
    expect(out.playersOnline).toBe(4);
    expect(out.liveGames).toBe(1);
  });

  it('queue unarmed: deadlineAt stays null so no countdown that cannot fire is published', () => {
    const out = foldLiveness([queue(1, { pooled: 1, min: 2, cap: 20, deadlineAt: null })], NOW);
    expect(out.queue).toEqual({ pooled: 1, min: 2, cap: 20, deadlineAt: null });
    expect(out.playersOnline).toBe(1);
    expect(out.liveGames).toBe(0);
  });

  it('queue armed: carries the ABSOLUTE deadline verbatim (never a remaining-ms)', () => {
    const deadlineAt = NOW + 83_000;
    const out = foldLiveness([queue(4, { pooled: 4, min: 2, cap: 20, deadlineAt })], NOW);
    expect(out.queue?.deadlineAt).toBe(deadlineAt);
    // The fold does NO clamping: a deadline is a fixed point in time, and
    // clamping at 0:00 is the renderer's job (it ticks between polls).
    expect(out.queue!.deadlineAt! - out.serverNow).toBe(83_000);
  });

  it('deadline passed: reported in the past, unmodified — the fold never invents a fresh one', () => {
    const deadlineAt = NOW - 5_000;
    const out = foldLiveness([queue(2, { pooled: 2, min: 2, cap: 20, deadlineAt })], NOW);
    expect(out.queue?.deadlineAt).toBe(deadlineAt);
  });

  it('solo vs AI arenas: 5 rooms with 1 human each count in the globals and split out', () => {
    const rooms = Array.from({ length: 5 }, () => arena(1, 'soloVsAi'));
    const out = foldLiveness(rooms, NOW);
    expect(out.playersOnline).toBe(5);
    expect(out.liveGames).toBe(5);
    expect(out.modes.soloVsAi).toEqual({ players: 5, games: 5 });
    expect(out.modes.standard).toEqual({ players: 0, games: 0 });
  });

  it('bots afloat: a 1-human + 19-bot room contributes exactly 1 (the driver never sees a bot)', () => {
    // `clients` is a SOCKET count. A bot holds no seat and no connection, so
    // there is nothing to subtract here — humans-only is structural.
    const out = foldLiveness([arena(1, 'soloVsAi')], NOW);
    expect(out.playersOnline).toBe(1);
    expect(out.liveGames).toBe(1);
  });

  it('a room with NO metadata counts as standard rather than vanishing from the split', () => {
    const out = foldLiveness([arena(6)], NOW);
    expect(out.liveGames).toBe(1);
    expect(out.modes.standard).toEqual({ players: 6, games: 1 });
    expect(out.modes.soloVsAi).toEqual({ players: 0, games: 0 });
    // The split must always account for every arena.
    expect(out.modes.standard.games + out.modes.soloVsAi.games).toBe(out.liveGames);
  });

  it('a mixed deployment splits per mode while the globals stay the sum', () => {
    const out = foldLiveness(
      [arena(12, 'standard'), arena(3), arena(1, 'soloVsAi'), arena(1, 'soloVsAi'), queue(2)],
      NOW,
    );
    expect(out.liveGames).toBe(4);
    expect(out.modes.standard).toEqual({ players: 15, games: 2 });
    expect(out.modes.soloVsAi).toEqual({ players: 2, games: 2 });
    expect(out.playersOnline).toBe(19); // 12 + 3 + 1 + 1 + 2 queued
    expect(out.modes.standard.players + out.modes.soloVsAi.players + 2).toBe(out.playersOnline);
  });
});

// --- counting rules ----------------------------------------------------------

describe('foldLiveness — counting rules', () => {
  it('counts arenas in ANY phase: a 0-client arena is still a live game', () => {
    const out = foldLiveness([arena(0, 'standard')], NOW);
    expect(out.liveGames).toBe(1);
    expect(out.playersOnline).toBe(0);
  });

  it('never counts a queue room as a live game', () => {
    const out = foldLiveness([queue(19, { pooled: 19, min: 2, cap: 20, deadlineAt: null })], NOW);
    expect(out.liveGames).toBe(0);
    expect(out.playersOnline).toBe(19);
  });

  it('ignores rooms it does not know, but still counts their humans as online', () => {
    // Defensive: a future room name must not silently disappear from the
    // population figure just because this build has no bucket for it.
    const out = foldLiveness([{ name: 'lobby', clients: 3 }, arena(2, 'standard')], NOW);
    expect(out.playersOnline).toBe(5);
    expect(out.liveGames).toBe(1);
    expect(out.queue?.pooled).toBe(0); // an unknown room is not the queue
  });

  it('takes the FIRST queue listing when a second somehow exists', () => {
    const out = foldLiveness(
      [
        queue(2, { pooled: 2, min: 2, cap: 20, deadlineAt: NOW + 1000 }),
        queue(7, { pooled: 7, min: 2, cap: 20, deadlineAt: NOW + 9999 }),
      ],
      NOW,
    );
    expect(out.queue?.pooled).toBe(2);
    // Both rooms' humans still count toward the population.
    expect(out.playersOnline).toBe(9);
  });

  it('is pure: the same input twice gives an equal payload and mutates nothing', () => {
    const rooms: RoomRecord[] = [arena(3, 'standard'), queue(1, { pooled: 1, min: 2, cap: 20, deadlineAt: null })];
    const snapshot = JSON.stringify(rooms);
    expect(foldLiveness(rooms, NOW)).toEqual(foldLiveness(rooms, NOW));
    expect(JSON.stringify(rooms)).toBe(snapshot);
  });
});

// --- malformed metadata ------------------------------------------------------

describe('modeOf — defensive defaulting', () => {
  it('defaults to standard for absent, non-object and unrecognized metadata', () => {
    expect(modeOf(undefined)).toBe('standard');
    expect(modeOf(null)).toBe('standard');
    expect(modeOf('soloVsAi')).toBe('standard'); // a string is not a bag
    expect(modeOf({})).toBe('standard');
    expect(modeOf({ mode: 'duo' })).toBe('standard');
    expect(modeOf({ mode: 42 })).toBe('standard');
  });

  it('recognizes exactly the tag ArenaRoom publishes', () => {
    expect(modeOf({ mode: 'soloVsAi' })).toBe('soloVsAi');
    expect(modeOf({ mode: 'standard' })).toBe('standard');
  });
});

describe('the queue block — malformed or missing metadata', () => {
  it('falls back to the room client count with NO deadline when metadata is absent', () => {
    const out = foldLiveness([queue(3)], NOW);
    expect(out.queue).toEqual({
      pooled: 3,
      min: CONFIG.match.minHumans,
      cap: CONFIG.map.playerCap,
      deadlineAt: null,
    });
  });

  it('rejects non-numeric fields field by field rather than publishing garbage', () => {
    const out = foldLiveness(
      [queue(5, { pooled: 'many', min: null, cap: 20, deadlineAt: 'soon' })],
      NOW,
    );
    expect(out.queue).toEqual({
      pooled: 5, // fell back to clients
      min: CONFIG.match.minHumans,
      cap: 20, // the one good field survives
      deadlineAt: null, // NEVER a countdown built from a non-number
    });
  });

  it('rejects NaN/Infinity deadlines (a countdown against them renders as garbage)', () => {
    expect(foldLiveness([queue(2, { deadlineAt: NaN })], NOW).queue?.deadlineAt).toBeNull();
    expect(foldLiveness([queue(2, { deadlineAt: Infinity })], NOW).queue?.deadlineAt).toBeNull();
  });

  it('treats a non-finite client count as 0 rather than poisoning the whole population', () => {
    const out = foldLiveness(
      [{ name: ARENA_ROOM, clients: Number.NaN }, arena(4, 'standard')],
      NOW,
    );
    expect(out.playersOnline).toBe(4);
    expect(out.liveGames).toBe(2);
  });
});

// --- the cache ---------------------------------------------------------------

describe('livenessPayload — the ~2s cache', () => {
  let clock = NOW;
  let calls = 0;
  const query = async (): Promise<RoomRecord[]> => {
    calls++;
    return [arena(calls, 'standard')];
  };

  beforeEach(() => {
    resetLiveness();
    clock = NOW;
    calls = 0;
    __setLivenessNowSource(() => clock);
  });

  it('queries the driver once and serves every poll inside the window from cache', async () => {
    const first = await livenessPayload(query);
    expect(calls).toBe(1);
    expect(first.playersOnline).toBe(1);
    clock = NOW + LIVENESS_CACHE_MS - 1;
    const second = await livenessPayload(query);
    expect(calls).toBe(1); // many pollers, ONE driver query
    expect(second.playersOnline).toBe(1);
  });

  it('re-queries once the window expires', async () => {
    await livenessPayload(query);
    clock = NOW + LIVENESS_CACHE_MS;
    const fresh = await livenessPayload(query);
    expect(calls).toBe(2);
    expect(fresh.playersOnline).toBe(2);
  });

  it('re-stamps serverNow on a CACHED response — a stale clock is phantom skew', async () => {
    await livenessPayload(query);
    clock = NOW + 1500;
    const cached = await livenessPayload(query);
    expect(calls).toBe(1);
    expect(cached.serverNow).toBe(NOW + 1500); // NOT the NOW the counts were folded at
  });

  it('invalidates rather than pins the cache when the clock steps backwards', async () => {
    await livenessPayload(query);
    clock = NOW - 60_000; // an NTP step back
    await livenessPayload(query);
    expect(calls).toBe(2);
  });

  it('does not cache a failed query', async () => {
    let fail = true;
    const flaky = async (): Promise<RoomRecord[]> => {
      if (fail) throw new Error('driver down');
      return [arena(7, 'standard')];
    };
    await expect(livenessPayload(flaky)).rejects.toThrow('driver down');
    fail = false;
    const out = await livenessPayload(flaky);
    expect(out.playersOnline).toBe(7);
  });
});

// --- architecture pins -------------------------------------------------------

describe('architecture', () => {
  it('never reads matchMaker.stats (D8: nothing player-facing may assume co-residency)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../liveness.ts', import.meta.url), 'utf-8');
    // The file's own doc comment NAMES the ban, so the pin must look at CODE
    // only — otherwise documenting the rule would be what breaks it.
    const code = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/matchMaker\s*\.\s*stats/);
    // ...and the only matchMaker call it does make is the driver-backed query.
    expect(code).toMatch(/matchMaker\.query\(/);
  });
});

// =============================================================================
// REVIEW-GATE REGRESSIONS (Story 6.6, second pass)
// =============================================================================
//
// Everything below was found by adversarial review of the shipped story. Each
// block names the DEFECT it pins, because every one of them is a case where the
// route kept answering 200 with a well-formed payload that was simply WRONG —
// the class of bug no shape test can catch.

// --- F7: the empty-server answer comes from the SERVER, never a client literal

describe('the queue block is always EMITTED (F7)', () => {
  it('fills the no-room case itself, so no client has to hardcode the threshold', () => {
    // The client used to substitute `DEFAULT_QUEUE_MIN = 2` whenever `queue`
    // was null — i.e. exactly on the empty server, the single most-viewed state
    // this route exists for. A retune of CONFIG.match.minHumans would have made
    // the front page lie, silently, in its most-read line.
    const out = foldLiveness([], NOW);
    expect(out.queue).not.toBeNull();
    expect(out.queue?.min).toBe(CONFIG.match.minHumans);
    expect(out.queue?.cap).toBe(CONFIG.map.playerCap);
    expect(out.queue?.pooled).toBe(0);
    expect(out.queue?.deadlineAt).toBeNull(); // never a countdown out of nothing
  });

  it('is a FRESH object each fold — the fold stays pure and unshared', () => {
    const a = foldLiveness([], NOW);
    const b = foldLiveness([], NOW);
    expect(a.queue).toEqual(b.queue);
    expect(a.queue).not.toBe(b.queue);
  });

  it('a real queue room still wins over the empty block', () => {
    const out = foldLiveness([queue(3, { pooled: 3, min: 2, cap: 20, deadlineAt: NOW + 1000 })], NOW);
    expect(out.queue).toEqual({ pooled: 3, min: 2, cap: 20, deadlineAt: NOW + 1000 });
  });
});

// --- F6: one bad sub-field must not black out the whole register -------------

describe('a malformed sub-field never poisons the payload (F6)', () => {
  it('a queue listing with a non-finite client count reports pooled 0, not NaN', () => {
    // `pooled` fell back to `room.clients` UNVALIDATED while the arena path
    // validated. A NaN here serializes to `null`, the client's strict shape
    // guard rejects the whole payload, and PLAYERS ONLINE / LIVE GAMES vanish
    // even though the arena counts were perfect.
    const out = foldLiveness([{ name: QUEUE_ROOM, clients: Number.NaN }, arena(4, 'standard')], NOW);
    expect(out.queue?.pooled).toBe(0);
    expect(Number.isFinite(out.queue?.pooled)).toBe(true);
    expect(out.playersOnline).toBe(4);
    // The whole payload must survive a JSON round trip with no nulls in it.
    const round = JSON.parse(JSON.stringify(out)) as typeof out;
    expect(round.queue?.pooled).toBe(0);
    expect(round.playersOnline).toBe(4);
  });

  it.each([Infinity, -Infinity, Number.NaN])('rejects clients=%p on the queue path', (bad) => {
    const out = foldLiveness([{ name: QUEUE_ROOM, clients: bad }], NOW);
    expect(Number.isFinite(out.queue?.pooled)).toBe(true);
    expect(Number.isFinite(out.playersOnline)).toBe(true);
  });
});

// --- F12: the driver's `clients` is a SEAT LEDGER, not a population ----------

describe('metadata.humans is preferred over the driver seat count (F12)', () => {
  it('uses the published humans when the driver still counts a departed captain', () => {
    // Room.#_decrementClientCount() is deferred until allowReconnection()
    // settles — 60s for the arena — so a closed tab stayed "online" for a full
    // minute. The room publishes its own immediate count instead.
    const stale: RoomRecord = {
      name: ARENA_ROOM,
      clients: 12,
      metadata: { mode: 'standard', humans: 11 },
    };
    const out = foldLiveness([stale], NOW);
    expect(out.playersOnline).toBe(11);
    expect(out.modes.standard.players).toBe(11);
  });

  it('uses it for the seat-handoff double count too (reserved seats are not aboard)', () => {
    // _reserveSeat increments the driver count the instant the queue reserves,
    // while the captain is still holding their queue socket. The arena's own
    // this.clients holds no reserved-but-unjoined seat, so the pair is counted
    // ONCE: 4 pooled + 0 aboard, not 4 + 4.
    const out = foldLiveness(
      [
        queue(4, { pooled: 4, min: 2, cap: 20, deadlineAt: null }),
        { name: ARENA_ROOM, clients: 4, metadata: { mode: 'standard', humans: 0 } },
      ],
      NOW,
    );
    expect(out.playersOnline).toBe(4);
    expect(out.modes.standard.players).toBe(0);
    expect(out.liveGames).toBe(1); // an empty boarding arena is still a live game
  });

  it('falls back to the driver count when the room published none (older build, racing listing)', () => {
    expect(foldLiveness([arena(7, 'standard')], NOW).playersOnline).toBe(7);
    expect(
      foldLiveness([{ name: ARENA_ROOM, clients: 7, metadata: { mode: 'standard' } }], NOW).playersOnline,
    ).toBe(7);
  });

  it('falls back when the published value is not a finite number', () => {
    for (const bad of ['3', null, Number.NaN, Infinity, {}]) {
      const out = foldLiveness(
        [{ name: ARENA_ROOM, clients: 5, metadata: { mode: 'standard', humans: bad } }],
        NOW,
      );
      expect(out.playersOnline).toBe(5);
    }
  });

  it('never reports a negative population', () => {
    const out = foldLiveness([{ name: ARENA_ROOM, clients: 3, metadata: { humans: -9 } }], NOW);
    expect(out.playersOnline).toBe(0);
  });

  it('the mode tag keeps working alongside it (one object, both keys)', () => {
    const out = foldLiveness(
      [{ name: ARENA_ROOM, clients: 20, metadata: { mode: 'soloVsAi', humans: 1 } }],
      NOW,
    );
    expect(out.modes.soloVsAi).toEqual({ players: 1, games: 1 });
    expect(out.modes.standard).toEqual({ players: 0, games: 0 });
  });
});

// --- F4/F5: the cache's two remaining holes ----------------------------------

describe('livenessPayload — one driver query for many pollers (F4)', () => {
  beforeEach(() => {
    resetLiveness();
    __setLivenessNowSource(() => NOW);
  });

  it('collapses CONCURRENT pollers inside one query latency window onto one query', async () => {
    // The settled cache is written only AFTER `await query()`, so every poller
    // that arrived while the first query was in flight missed it and started
    // its own. On a public unauthenticated route that is a stampede amplifier.
    let calls = 0;
    const gate: { release: (() => void) | null } = { release: null };
    const query = async (): Promise<RoomRecord[]> => {
      calls++;
      await new Promise<void>((res) => {
        gate.release = res;
      });
      return [arena(3, 'standard')];
    };
    const all = Promise.all([1, 2, 3, 4, 5].map(() => livenessPayload(query)));
    await Promise.resolve(); // let every caller reach the await
    expect(calls).toBe(1);
    gate.release?.();
    const payloads = await all;
    expect(calls).toBe(1);
    for (const p of payloads) expect(p.playersOnline).toBe(3);
  });

  it('releases the in-flight slot on REJECTION, so the next caller retries', async () => {
    let calls = 0;
    const flaky = async (): Promise<RoomRecord[]> => {
      calls++;
      if (calls === 1) throw new Error('driver down');
      return [arena(9, 'standard')];
    };
    await expect(livenessPayload(flaky)).rejects.toThrow('driver down');
    const out = await livenessPayload(flaky);
    expect(calls).toBe(2);
    expect(out.playersOnline).toBe(9);
  });

  it('concurrent callers all see the SAME rejection, and none of them latch it', async () => {
    let calls = 0;
    const boom = async (): Promise<RoomRecord[]> => {
      calls++;
      await Promise.resolve();
      throw new Error('driver down');
    };
    const results = await Promise.allSettled([livenessPayload(boom), livenessPayload(boom)]);
    expect(calls).toBe(1);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    const ok = await livenessPayload(async () => [arena(2, 'standard')]);
    expect(ok.playersOnline).toBe(2);
  });
});

describe('livenessPayload — serverNow is stamped AFTER the query (F5)', () => {
  beforeEach(() => resetLiveness());

  it('does not hand every client the clock as it stood BEFORE an 800ms driver query', async () => {
    // serverNow is the client's skew correction against an ABSOLUTE deadlineAt.
    // Stamped pre-query, every countdown on every home screen runs the query's
    // whole latency early.
    let clock = NOW;
    __setLivenessNowSource(() => clock);
    const slow = async (): Promise<RoomRecord[]> => {
      clock = NOW + 800; // the driver round trip
      return [arena(1, 'standard')];
    };
    const out = await livenessPayload(slow);
    expect(out.serverNow).toBe(NOW + 800);
    expect(out.serverNow).not.toBe(NOW);
  });

  it('dates the CACHE from when the counts were true, not from when they were asked for', async () => {
    let clock = NOW;
    __setLivenessNowSource(() => clock);
    let calls = 0;
    const slow = async (): Promise<RoomRecord[]> => {
      calls++;
      clock += 1500;
      return [arena(calls, 'standard')];
    };
    await livenessPayload(slow); // settles at NOW + 1500
    clock = NOW + 1500 + LIVENESS_CACHE_MS - 1;
    await livenessPayload(slow);
    expect(calls).toBe(1); // still inside the window measured from the settle
  });
});

// --- F8: a polled endpoint must forbid intermediary caching ------------------

describe('the /liveness endpoint (F8)', () => {
  beforeEach(() => resetLiveness());

  it('sends Cache-Control: no-store', async () => {
    // A caching proxy that held one response would freeze PLAYERS ONLINE for a
    // whole session and pin the ABSOLUTE deadlineAt at 0:00 forever.
    __setLivenessNowSource(() => NOW);
    await livenessPayload(async () => []); // warm the cache: no driver needed below
    const out = (await (livenessEndpoint as unknown as (
      ctx: Record<string, unknown>,
    ) => Promise<{ headers: Headers }>)({ returnHeaders: true })) as { headers: Headers };
    expect(out.headers.get('cache-control')).toBe('no-store');
  });
});

// =============================================================================
// THE PUBLISHERS — what the two rooms actually write onto their listings
// =============================================================================
//
// `foldLiveness` above is only as honest as the metadata it is handed. These
// blocks drive the REAL rooms (the bare `new Room()` idiom from solo.test.ts /
// operability.test.ts, with core's own methods injected) and assert on the
// objects they hand to `setMetadata`.

interface QueueMeta {
  pooled: number;
  min: number;
  cap: number;
  deadlineAt: number | null;
}

interface ArenaMeta {
  mode: string;
  humans: number;
}

interface FakeSocket {
  sessionId: string;
  state: ClientState;
  auth?: unknown;
  send: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  leave: ReturnType<typeof vi.fn>;
}

function socket(id: string): FakeSocket {
  return {
    sessionId: id,
    state: ClientState.JOINED,
    send: vi.fn(),
    error: vi.fn(),
    leave: vi.fn(),
  };
}

interface QueueHarness {
  onCreate(): void;
  onJoin(client: FakeSocket, options?: unknown): void;
  onLeave(client: FakeSocket): void;
  clients: FakeSocket[];
  clock: { currentTime: number; setInterval: unknown; setTimeout: unknown };
  setMetadata: ReturnType<typeof vi.fn>;
}

/** A real StandardQueueRoom with core's transport surface injected. Returns the
 *  room, the metadata it has published so far, and a hand crank for its 1 Hz
 *  tick (the room clock is ours, so nothing here depends on real time). */
function queueRoom(): {
  r: QueueHarness;
  published: () => QueueMeta[];
  tick: () => void;
  at: (ms: number) => void;
} {
  const ticks: (() => void)[] = [];
  const r = new StandardQueueRoom() as unknown as QueueHarness & Record<string, unknown>;
  r.clients = [];
  r.clock = {
    currentTime: 0,
    setInterval: (fn: () => void) => {
      ticks.push(fn);
      return 0;
    },
    setTimeout: () => 0,
  };
  r.setMetadata = vi.fn(() => Promise.resolve());
  r.onCreate();
  return {
    r,
    published: () => r.setMetadata.mock.calls.map((c) => c[0] as QueueMeta),
    tick: () => {
      for (const fn of ticks) fn();
    },
    at: (ms: number) => {
      r.clock.currentTime = ms;
    },
  };
}

function pool(h: ReturnType<typeof queueRoom>, id: string): FakeSocket {
  const c = socket(id);
  h.r.clients.push(c);
  h.r.onJoin(c, {});
  return c;
}

function unpool(h: ReturnType<typeof queueRoom>, c: FakeSocket): void {
  h.r.clients.splice(h.r.clients.indexOf(c), 1);
  h.r.onLeave(c);
}

const lastQueueMeta = (h: ReturnType<typeof queueRoom>): QueueMeta => {
  const all = h.published();
  return all[all.length - 1];
};

// --- F1: a countdown that cannot fire is never published ---------------------

describe('StandardQueueRoom publishes no deadline below min (F1)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('drops the deadline when an ARMED pool drains below min, and restores it on refill', () => {
    // queueStep clears armedAtMs ONLY on form, never on drain — deliberate,
    // frozen POLICY (a deadline later joins could extend is a hostage-cycling
    // vector). The consequence for the PUBLISHER is that 2 captains arm, 1
    // leaves, and startsInMs keeps counting toward a form the policy will
    // refuse: the home screen read `1 QUEUED · STARTS 1:50`, ticked to `0:00`,
    // and stuck there forever with no match possible.
    const h = queueRoom();
    const a = pool(h, 'A');
    expect(lastQueueMeta(h)).toMatchObject({ pooled: 1, deadlineAt: null });

    pool(h, 'B');
    const armed = lastQueueMeta(h);
    expect(armed.pooled).toBe(2);
    expect(typeof armed.deadlineAt).toBe('number');

    unpool(h, a);
    const drained = lastQueueMeta(h);
    expect(drained.pooled).toBe(1);
    expect(drained.deadlineAt).toBeNull();

    // ...and the cohort's deadline did not MOVE while it was unpublishable:
    // armedAtMs never changed, so the refill republishes the SAME instant.
    pool(h, 'C');
    expect(lastQueueMeta(h)).toEqual({ ...armed, pooled: 2 });
  });

  it('keeps publishing null on every later tick while the pool stays short', () => {
    const h = queueRoom();
    const a = pool(h, 'A');
    pool(h, 'B');
    unpool(h, a);
    const writes = h.published().length;
    for (const t of [1000, 2000, 3000]) {
      h.at(t);
      h.tick();
    }
    expect(lastQueueMeta(h).deadlineAt).toBeNull();
    // Publish-on-change still holds: an unchanging short pool never writes
    // again, so this costs the matchmaker driver nothing per second.
    expect(h.published().length).toBe(writes);
  });

  it('leaves POLICY untouched — the pool is still armed underneath', () => {
    // The proof that this is a publishing decision and not a policy change:
    // the cohort re-publishes its ORIGINAL deadline the moment it refills,
    // which is only possible if armedAtMs survived the drain.
    const h = queueRoom();
    const a = pool(h, 'A');
    pool(h, 'B');
    const armedAt = lastQueueMeta(h).deadlineAt;
    unpool(h, a);
    h.at(30_000);
    h.tick();
    pool(h, 'C');
    expect(lastQueueMeta(h).deadlineAt).toBe(armedAt);
  });
});

// --- F2: the STARTING window is a state the server really publishes ----------

describe('StandardQueueRoom publishes a full pool with NO deadline while forming (F2)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('emits pooled >= min with deadlineAt null for the whole formMatch window', async () => {
    // queueStep clears armedAtMs the instant it decides to form, and the room
    // publishes that listing BEFORE seating anyone. Read as "unarmed" the home
    // screen rendered `2 QUEUED · NEEDS 2 TO START`, which contradicts itself —
    // and the 2s server cache plus the 10s client poll could hold it for ~12s.
    const h = queueRoom();
    pool(h, 'A');
    pool(h, 'B');
    expect(lastQueueMeta(h)).toMatchObject({ pooled: 2 });
    expect(lastQueueMeta(h).deadlineAt).not.toBeNull();

    h.at(CONFIG.match.queueTimerMs); // the deadline expires -> form
    h.tick();
    // Asserted SYNCHRONOUSLY: publishListing runs before formMatch is even
    // invoked, which is exactly why this listing is what a poller sees for the
    // whole (100-500ms) creation + reservation window.
    expect(lastQueueMeta(h)).toMatchObject({ pooled: 2, min: CONFIG.match.minHumans });
    expect(lastQueueMeta(h).deadlineAt).toBeNull();
    // ...and the matchmaker call it then makes cannot succeed in a unit test;
    // formMatch swallows that into failSeats, which must not escape here.
    await Promise.resolve();
  });
});

// --- F12: the arena publishes its own, immediate human count -----------------

interface ArenaHarness {
  onCreate(options?: Record<string, unknown>): void;
  onJoin(client: FakeSocket, options?: unknown): void;
  onDrop(client: FakeSocket, code?: number): void;
  onLeave(client: FakeSocket, code?: number): void;
  clients: FakeSocket[];
  setMetadata: ReturnType<typeof vi.fn>;
  allowReconnection: ReturnType<typeof vi.fn>;
}

function arenaRoom(options: Record<string, unknown> = {}): {
  r: ArenaHarness;
  published: () => ArenaMeta[];
} {
  const r = new ArenaRoom() as unknown as ArenaHarness & Record<string, unknown>;
  r.lock = vi.fn(() => Promise.resolve());
  r.unlock = vi.fn(() => Promise.resolve());
  r.disconnect = vi.fn(() => Promise.resolve());
  r.broadcast = vi.fn();
  r.onMessage = vi.fn();
  r.setSimulationInterval = vi.fn();
  r.clock = { setInterval: vi.fn(), setTimeout: vi.fn() };
  r.clients = [];
  r.setMetadata = vi.fn(() => Promise.resolve());
  r.allowReconnection = vi.fn(() => new Promise(() => undefined));
  r.onCreate(options);
  return { r, published: () => r.setMetadata.mock.calls.map((c) => c[0] as ArenaMeta) };
}

const lastArenaMeta = (h: { published: () => ArenaMeta[] }): ArenaMeta => {
  const all = h.published();
  return all[all.length - 1];
};

describe('ArenaRoom publishes its live human count (F12)', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.HC_DEV_OPTIONS;
  });
  afterEach(() => vi.restoreAllMocks());

  it('seeds mode AND humans at create, in one object', () => {
    expect(lastArenaMeta(arenaRoom())).toEqual({ mode: 'standard', humans: 0 });
  });

  it('counts up on join', () => {
    const h = arenaRoom();
    for (const id of ['A', 'B', 'C']) {
      const c = socket(id);
      h.r.clients.push(c);
      h.r.onJoin(c, {});
    }
    expect(lastArenaMeta(h)).toEqual({ mode: 'standard', humans: 3 });
  });

  it('counts DOWN the instant a captain drops — not 60 seconds later', () => {
    // The whole finding: #_decrementClientCount() is deferred until the
    // allowReconnection() promise settles, and this room grants
    // CONFIG.net.reconnectGraceSeconds (60). Core removes the client from
    // this.clients at the TOP of _onLeave, before onDrop runs, so publishing
    // here reports the truth immediately.
    const h = arenaRoom();
    const a = socket('A');
    const b = socket('B');
    for (const c of [a, b]) {
      h.r.clients.push(c);
      h.r.onJoin(c, {});
    }
    expect(lastArenaMeta(h).humans).toBe(2);
    h.r.clients.splice(h.r.clients.indexOf(b), 1); // what core does first
    h.r.onDrop(b, 1006);
    expect(lastArenaMeta(h)).toEqual({ mode: 'standard', humans: 1 });
    expect(CONFIG.net.reconnectGraceSeconds).toBeGreaterThan(0); // the window we no longer wait out
  });

  it('counts down on a CONSENTED leave too (code 4000 routes straight to onLeave)', () => {
    const h = arenaRoom();
    const a = socket('A');
    h.r.clients.push(a);
    h.r.onJoin(a, {});
    h.r.clients.splice(0, 1);
    h.r.onLeave(a, 4000);
    expect(lastArenaMeta(h).humans).toBe(0);
  });

  it('publishes ON CHANGE only — an unchanged room never writes again', () => {
    const h = arenaRoom();
    const a = socket('A');
    h.r.clients.push(a);
    h.r.onJoin(a, {});
    const writes = h.published().length;
    h.r.clients.splice(0, 1);
    h.r.onDrop(a, 1006);
    h.r.onLeave(a, 1006); // core reaches onLeave through several routes
    expect(h.published().length).toBe(writes + 1);
  });

  it('keeps the solo mode tag alongside the count', () => {
    const h = arenaRoom({ solo: true });
    expect(lastArenaMeta(h).mode).toBe('soloVsAi');
    // Nineteen bots are afloat and NONE of them is a human.
    expect(lastArenaMeta(h).humans).toBe(0);
  });
});

// --- F11: one router, so the playground still lists /liveness ----------------

describe('the HTTP router carries both endpoints (F11)', () => {
  it('registers /metrics AND /liveness in core __globalEndpoints', async () => {
    // core's createRouter is the ONLY thing that assigns __globalEndpoints,
    // which @colyseus/playground reads to list the server's routes; better-
    // call's `.extend()` builds its own router and never touches the global,
    // so the endpoint added by extend was invisible in the dev playground.
    const colyseus = await import('colyseus');
    await import('../app.config.js');
    // Read THROUGH the namespace: `__globalEndpoints` is a live `let` binding
    // that createRouter reassigns, so destructuring it early captures the
    // pre-app.config value and the test proves nothing.
    const paths = Object.values(colyseus.__globalEndpoints).map((e) => (e as { path: string }).path);
    expect(paths).toContain('/metrics');
    expect(paths).toContain('/liveness');
  });

  it('serves both paths, with /metrics byte-identical to the object metrics.ts exports', async () => {
    const appConfig = (await import('../app.config.js')).default as unknown as {
      routes: { findRoute: (m: string, p: string) => { data: { path: string } } | undefined };
    };
    const { metricsEndpoint } = await import('../metrics.js');
    expect(appConfig.routes.findRoute('GET', '/liveness')?.data.path).toBe('/liveness');
    const ops = appConfig.routes.findRoute('GET', '/metrics');
    expect(ops?.data).toBe(metricsEndpoint); // the same endpoint object, untouched
  });
});

// =============================================================================
// HOME-SCREEN PRESENCE (Eric ruling 2026-08-18)
// =============================================================================
//
// `playersOnline` counts EVERY live human, and a player sitting on the home
// screen deciding which door to press is one. They hold no room and no socket,
// so the liveness poll itself is their heartbeat: `GET /liveness?c=<tab id>`
// records the tab into a shared presence hash and the count is that hash's live
// size.
//
// Everything below fails against the pre-ruling code, which had no notion of a
// viewer at all: `foldLiveness` took two arguments and `viewerIdOf` /
// `homeViewers` / `PRESENCE_KEY` / `PRESENCE_TTL_MS` did not exist.

/** A `matchMaker.presence` stand-in: the hash, plus an op log to assert on. */
function fakePresence(seed: Record<string, string> = {}): PresenceLike & {
  hash: Record<string, string>;
  ops: string[];
  keys: string[];
} {
  const hash: Record<string, string> = { ...seed };
  const ops: string[] = [];
  const keys: string[] = [];
  return {
    hash,
    ops,
    keys,
    hset(key: string, field: string, value: string) {
      keys.push(key);
      ops.push(`hset:${field}=${value}`);
      hash[field] = value;
      return Promise.resolve(true);
    },
    hgetall(key: string) {
      keys.push(key);
      ops.push('hgetall');
      return Promise.resolve({ ...hash });
    },
    hdel(key: string, field: string) {
      keys.push(key);
      ops.push(`hdel:${field}`);
      const had = hash[field] !== undefined;
      delete hash[field];
      return Promise.resolve(had);
    },
  };
}

const opsOf = (p: { ops: string[] }, prefix: string): string[] =>
  p.ops.filter((o) => o.startsWith(prefix));

// --- the `c` query parameter -------------------------------------------------

describe('viewerIdOf — strict validation of ?c=', () => {
  it('accepts the shapes a client actually mints', () => {
    for (const id of [
      '8f3a1c2b9d4e5f60', // 16 hex
      crypto.randomUUID(), // dashes are in the alphabet on purpose
      'AbCdEf01_-ZzYy9',
      'a'.repeat(64), // exactly at the ceiling
      '12345678', // exactly at the floor
    ]) {
      expect(viewerIdOf({ c: id })).toBe(id);
    }
  });

  it('treats an ABSENT c as legitimate — a smoke, a curl and an operator are not counted', () => {
    // Not an error, and emphatically not a 400: this route answers a population
    // question and must keep answering it for a caller that has no tab.
    expect(viewerIdOf({})).toBeNull();
    expect(viewerIdOf(undefined)).toBeNull();
    expect(viewerIdOf(null)).toBeNull();
    expect(viewerIdOf('c=abcdefgh')).toBeNull(); // a string is not a query bag
  });

  it('rejects out-of-bounds lengths', () => {
    expect(viewerIdOf({ c: '' })).toBeNull();
    expect(viewerIdOf({ c: '1234567' })).toBeNull(); // one under the floor
    expect(viewerIdOf({ c: 'a'.repeat(65) })).toBeNull(); // one over the ceiling
    expect(viewerIdOf({ c: 'a'.repeat(100_000) })).toBeNull(); // an oversize attempt
  });

  it('rejects anything outside the URL-safe alphabet', () => {
    for (const bad of [
      'abcdefg h', // whitespace
      'abcdefgh:1', // a separator
      'abcdefgh*', // a redis glob
      'abcdefgh?', // ditto
      'abcdefgh.', // punctuation
      'abcdefgh\n', // a control character
      'abcdefgh%00',
      'hc:liveness:home', // cannot address another presence key
      '../../etc/passwd',
    ]) {
      expect(viewerIdOf({ c: bad })).toBeNull();
    }
  });

  it('rejects a REPEATED ?c=a&c=b, which better-call hands over as an array', () => {
    // The `typeof raw !== 'string'` guard is what catches this; without it the
    // array would be stringified into a single bogus field.
    expect(viewerIdOf({ c: ['abcdefgh1', 'abcdefgh2'] })).toBeNull();
    expect(viewerIdOf({ c: 12345678 })).toBeNull();
    expect(viewerIdOf({ c: { id: 'abcdefgh' } })).toBeNull();
  });
});

// --- the fold takes the count as an INPUT ------------------------------------

describe('foldLiveness — the home-screen term is an input, never a side effect', () => {
  it('adds home viewers to playersOnline and to NOTHING else', () => {
    const out = foldLiveness([arena(3, 'standard'), queue(2)], NOW, 4);
    expect(out.playersOnline).toBe(9); // 3 aboard + 2 pooled + 4 reading the page
    // A player on the front page is not a game and has no mode yet.
    expect(out.liveGames).toBe(1);
    expect(out.modes.standard).toEqual({ players: 3, games: 1 });
    expect(out.modes.soloVsAi).toEqual({ players: 0, games: 0 });
    expect(out.queue?.pooled).toBe(2);
  });

  it('counts viewers on a completely empty server — the launch-day case', () => {
    const out = foldLiveness([], NOW, 1);
    expect(out.playersOnline).toBe(1);
    expect(out.liveGames).toBe(0);
    expect(out.queue?.pooled).toBe(0);
  });

  it('defaults to 0, so every pre-ruling call site stays byte-identical', () => {
    expect(foldLiveness([arena(3, 'standard')], NOW)).toEqual(
      foldLiveness([arena(3, 'standard')], NOW, 0),
    );
    // ...and the parameter is really consumed rather than accepted and dropped:
    // a nonzero term must MOVE the payload.
    expect(foldLiveness([arena(3, 'standard')], NOW, 2)).not.toEqual(
      foldLiveness([arena(3, 'standard')], NOW),
    );
  });

  it('validates the term like every other external number (no NaN in the register)', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const out = foldLiveness([arena(4, 'standard')], NOW, bad);
      expect(out.playersOnline).toBe(4);
      expect(Number.isFinite(out.playersOnline)).toBe(true);
    }
    expect(foldLiveness([arena(4, 'standard')], NOW, -9).playersOnline).toBe(4);
    // A FINITE term still lands — the guard rejects garbage, it does not reject
    // the feature.
    expect(foldLiveness([arena(4, 'standard')], NOW, 3).playersOnline).toBe(7);
  });

  it('STAYS PURE: not async, and its body names no presence at all', () => {
    // The presence set is an input to the fold, not I/O inside it. An async fold
    // or one referencing the store would be the regression this pins.
    expect(foldLiveness.constructor.name).toBe('Function');
    const body = foldLiveness.toString();
    expect(body).toContain('homeViewers'); // ...it does take the term as a parameter
    for (const token of ['PRESENCE_KEY', 'hgetall', 'hset', 'hdel', 'await', 'Date.now']) {
      expect(body).not.toContain(token);
    }
  });

  it('is still referentially pure with a viewer count in play', () => {
    const rooms: RoomRecord[] = [arena(3, 'standard')];
    const snapshot = JSON.stringify(rooms);
    expect(foldLiveness(rooms, NOW, 5).playersOnline).toBe(8);
    expect(foldLiveness(rooms, NOW, 5)).toEqual(foldLiveness(rooms, NOW, 5));
    expect(JSON.stringify(rooms)).toBe(snapshot);
  });
});

// --- record, count, prune ----------------------------------------------------

describe('homeViewers — record then count', () => {
  it('records the viewer under PRESENCE_KEY with an epoch stamp and counts them', async () => {
    const p = fakePresence();
    expect(await homeViewers('abcdefgh1234', NOW, p)).toBe(1); // including you, poll one
    expect(p.hash).toEqual({ abcdefgh1234: String(NOW) });
    expect(new Set(p.keys)).toEqual(new Set([PRESENCE_KEY]));
  });

  it('counts TWO distinct tabs as two viewers', async () => {
    const p = fakePresence();
    expect(await homeViewers('tab-aaaaaaaa', NOW, p)).toBe(1);
    expect(await homeViewers('tab-bbbbbbbb', NOW + 10, p)).toBe(2);
    expect(Object.keys(p.hash).sort()).toEqual(['tab-aaaaaaaa', 'tab-bbbbbbbb']);
  });

  it('counts the SAME tab polling twice ONCE, and refreshes its stamp', async () => {
    const p = fakePresence();
    expect(await homeViewers('tab-aaaaaaaa', NOW, p)).toBe(1);
    expect(await homeViewers('tab-aaaaaaaa', NOW + 10_000, p)).toBe(1);
    expect(p.hash['tab-aaaaaaaa']).toBe(String(NOW + 10_000)); // heartbeat, not a 2nd row
  });

  it('drops an EXPIRED entry out of the count', async () => {
    const p = fakePresence({
      stale0000000: String(NOW - PRESENCE_TTL_MS), // exactly at the TTL: dead
      stale1111111: String(NOW - PRESENCE_TTL_MS - 60_000), // long gone
      alive0000000: String(NOW - PRESENCE_TTL_MS + 1), // one ms inside: alive
    });
    expect(await homeViewers(null, NOW, p)).toBe(1);
  });

  it('survives two missed polls — the whole reason the TTL is 3x the interval', async () => {
    // 10s client poll. A backgrounded tab that misses two polls in a row is
    // still present at 20s and must not blink out of a count that includes it.
    const p = fakePresence();
    await homeViewers('tab-aaaaaaaa', NOW, p);
    expect(await homeViewers(null, NOW + 20_000, p)).toBe(1);
    expect(PRESENCE_TTL_MS).toBeGreaterThan(20_000);
    // ...and a closed tab is gone on its own shortly after, with nothing to
    // unsubscribe. Half a minute, not a session.
    expect(await homeViewers(null, NOW + 31_000, p)).toBe(0);
    expect(PRESENCE_TTL_MS).toBeLessThanOrEqual(60_000);
  });

  it('actually PRUNES expired fields, so the hash cannot grow without bound', async () => {
    const p = fakePresence({
      gone00000000: String(NOW - PRESENCE_TTL_MS - 1),
      gone11111111: String(NOW - PRESENCE_TTL_MS - 2),
      here00000000: String(NOW),
    });
    expect(await homeViewers(null, NOW, p)).toBe(1);
    // Filtering on read alone would leave every tab that ever loaded the page in
    // the hash forever. The dead fields are deleted, not merely skipped.
    expect(Object.keys(p.hash)).toEqual(['here00000000']);
    expect(opsOf(p, 'hdel').sort()).toEqual(['hdel:gone00000000', 'hdel:gone11111111']);
    // A second sweep has nothing left to delete — pruning is idempotent.
    p.ops.length = 0;
    expect(await homeViewers(null, NOW, p)).toBe(1);
    expect(opsOf(p, 'hdel')).toEqual([]);
  });

  it('prunes a stamp that is not a number at all', async () => {
    const p = fakePresence({
      junk00000000: 'not-a-number',
      nan000000000: 'NaN',
      ok0000000000: String(NOW),
    });
    expect(await homeViewers(null, NOW, p)).toBe(1);
    expect(Object.keys(p.hash)).toEqual(['ok0000000000']);
  });

  it('keeps a FUTURE stamp — one node must not delete another node\'s viewers', async () => {
    // The only writer of these values is this server, so a future stamp means a
    // peer's clock runs ahead. Pruning on that would be a self-inflicted outage
    // of exactly the multi-node case the presence store exists for.
    const p = fakePresence({ ahead0000000: String(NOW + 2_000) });
    expect(await homeViewers(null, NOW, p)).toBe(1);
    expect(p.hash.ahead0000000).toBe(String(NOW + 2_000));
  });

  it('counts the set for a caller with NO id — a curl reads the number, unrecorded', async () => {
    const p = fakePresence({ tab000000000: String(NOW) });
    expect(await homeViewers(null, NOW, p)).toBe(1);
    expect(opsOf(p, 'hset')).toEqual([]); // nothing recorded for the anonymous caller
  });

  it('degrades to 0 with no presence available (unit tests, pre-listen)', async () => {
    expect(await homeViewers('tab-aaaaaaaa', NOW, null)).toBe(0);
  });

  it('degrades to 0 rather than throwing when the store fails', async () => {
    // A presence outage must cost the home-screen TERM, never the room counts:
    // a 500 here would take the whole front page down to lose one number.
    const boom: PresenceLike = {
      hset: () => Promise.reject(new Error('presence down')),
      hgetall: () => Promise.reject(new Error('presence down')),
      hdel: () => Promise.reject(new Error('presence down')),
    };
    await expect(homeViewers('tab-aaaaaaaa', NOW, boom)).resolves.toBe(0);
    await expect(homeViewers(null, NOW, boom)).resolves.toBe(0);
  });
});

// --- the cache-vs-presence decision -----------------------------------------

describe('livenessPayload — the rooms are cached, the viewer count is NOT', () => {
  let clock = NOW;
  let calls = 0;
  const query = async (): Promise<RoomRecord[]> => {
    calls++;
    return [arena(1, 'standard')];
  };

  beforeEach(() => {
    resetLiveness();
    clock = NOW;
    calls = 0;
    __setLivenessNowSource(() => clock);
  });

  it('sums the room humans and the home viewers into playersOnline', async () => {
    const p = fakePresence();
    const out = await livenessPayload(query, 'tab-aaaaaaaa', p);
    expect(out.playersOnline).toBe(2); // 1 aboard + 1 reading the page
    expect(out.liveGames).toBe(1);
  });

  it('RECORDS THE HEARTBEAT ON A CACHE HIT — else a viewer silently ages out', async () => {
    // The defect this pins: presence written only on the driver-refresh path. A
    // tab whose polls keep landing inside somebody else's 2s window would never
    // refresh its own TTL and would drop out of the count while sitting right
    // there on the page.
    const p = fakePresence();
    await livenessPayload(query, 'tab-aaaaaaaa', p);
    clock = NOW + LIVENESS_CACHE_MS - 1; // inside the window
    await livenessPayload(query, 'tab-aaaaaaaa', p);
    expect(calls).toBe(1); // one driver query served both, as before
    expect(opsOf(p, 'hset')).toEqual([
      `hset:tab-aaaaaaaa=${NOW}`,
      `hset:tab-aaaaaaaa=${NOW + LIVENESS_CACHE_MS - 1}`,
    ]);
    expect(p.hash['tab-aaaaaaaa']).toBe(String(NOW + LIVENESS_CACHE_MS - 1));
  });

  it('serves a STALE room count with a FRESH viewer count on a cache hit', async () => {
    // The decision, observable: nobody can perceive a 2s-stale room count;
    // everybody can perceive not existing. So the room half is cached and the
    // home half is read per request.
    const p = fakePresence();
    const first = await livenessPayload(query, 'tab-aaaaaaaa', p);
    expect(first.playersOnline).toBe(2);
    p.hash['tab-bbbbbbbb'] = String(NOW + 100); // another tab lands on the page
    clock = NOW + 500; // still inside the 2s window
    const cached = await livenessPayload(query, 'tab-aaaaaaaa', p);
    expect(calls).toBe(1); // the driver was NOT re-queried
    expect(cached.liveGames).toBe(1); // the stale room half, unchanged
    expect(cached.playersOnline).toBe(3); // 1 aboard + 2 viewers, counted fresh
    expect(cached.serverNow).toBe(NOW + 500);
  });

  it('a first-time visitor is in the number they are shown, even inside a warm cache', async () => {
    const p = fakePresence();
    await livenessPayload(query, null, p); // somebody else warmed the cache
    clock = NOW + 400;
    const mine = await livenessPayload(query, 'tab-newcomer', p);
    expect(calls).toBe(1);
    expect(mine.playersOnline).toBe(2); // NOT 1 — "including you" holds on poll one
  });

  it('serves the payload normally for a caller with no id at all', async () => {
    const p = fakePresence({ tab000000000: String(NOW) });
    const out = await livenessPayload(query, null, p);
    expect(out.playersOnline).toBe(2); // the existing viewer still counts
    expect(opsOf(p, 'hset')).toEqual([]);
    expect(out.queue).not.toBeNull();
    expect(JSON.parse(JSON.stringify(out))).toEqual(out); // no NaN, no undefined
  });

  it('serves the payload with the room counts intact when presence is down', async () => {
    let attempts = 0;
    const boom: PresenceLike = {
      hset: () => {
        attempts++;
        return Promise.reject(new Error('presence down'));
      },
      hgetall: () => {
        attempts++;
        return Promise.reject(new Error('presence down'));
      },
      hdel: () => Promise.reject(new Error('presence down')),
    };
    const out = await livenessPayload(query, 'tab-aaaaaaaa', boom);
    expect(attempts).toBeGreaterThan(0); // the store WAS reached, and it threw
    expect(out.playersOnline).toBe(1); // ...and the room half survived it
    expect(out.liveGames).toBe(1);
  });

  it('caches a SNAPSHOT, never the driver\'s live listing objects', async () => {
    // Found by livenessSmoke.mjs, which is the only instrument that could:
    // matchMaker.query() hands back the driver's LIVE listings, core mutates
    // `listing.clients` on every seat edge and setMetadata writes into
    // `listing.metadata` IN PLACE. Caching the reference made the 2s cache
    // silently track live state — a poll 3ms inside the window already saw a
    // captain who joined after the query. The pre-ruling code was safe only
    // because it folded immediately and cached numbers.
    const live: RoomRecord = { name: ARENA_ROOM, clients: 2, metadata: { mode: 'standard', humans: 2 } };
    const first = await livenessPayload(async () => [live], null, fakePresence());
    expect(first.playersOnline).toBe(2);
    live.clients = 9; // what core does on a seat edge
    (live.metadata as Record<string, unknown>).humans = 9; // ...and what setMetadata does
    clock = NOW + LIVENESS_CACHE_MS - 1;
    const cached = await livenessPayload(async () => [live], null, fakePresence());
    expect(cached.playersOnline).toBe(2); // the CACHED truth, not the live one
    expect(cached.modes.standard.players).toBe(2);
  });

  it('still collapses concurrent pollers onto ONE driver query with presence in play', async () => {
    const p = fakePresence();
    const gate: { release: (() => void) | null } = { release: null };
    let slowCalls = 0;
    const slow = async (): Promise<RoomRecord[]> => {
      slowCalls++;
      await new Promise<void>((res) => {
        gate.release = res;
      });
      return [arena(3, 'standard')];
    };
    const all = Promise.all(
      ['tab-aaaaaaaa', 'tab-bbbbbbbb', 'tab-cccccccc'].map((id) => livenessPayload(slow, id, p)),
    );
    await Promise.resolve();
    expect(slowCalls).toBe(1);
    gate.release?.();
    const payloads = await all;
    expect(slowCalls).toBe(1);
    // Every one of the three tabs got recorded, and the last poll to fold sees
    // all three.
    expect(Object.keys(p.hash).sort()).toEqual(['tab-aaaaaaaa', 'tab-bbbbbbbb', 'tab-cccccccc']);
    for (const out of payloads) expect(out.liveGames).toBe(1);
    expect(Math.max(...payloads.map((o) => o.playersOnline))).toBe(6); // 3 aboard + 3 viewers
  });
});

// --- the route ---------------------------------------------------------------

describe('the /liveness endpoint reads ?c= (and never fails over it)', () => {
  beforeEach(() => {
    resetLiveness();
    __setLivenessNowSource(() => NOW);
  });

  const call = async (query: unknown): Promise<{ playersOnline: number; liveGames: number }> => {
    const handler = livenessEndpoint as unknown as (
      ctx: Record<string, unknown>,
    ) => Promise<{ playersOnline: number; liveGames: number }>;
    return handler({ query });
  };

  it('is wired to the validator, and no ?c= value can ever break the payload', async () => {
    // TWO halves, because a unit test can observe only one of them directly.
    //
    // (a) There is no matchMaker here, so the home term degrades to 0 and the
    //     assertions below prove the part that matters most about this route: a
    //     query parameter, whatever it holds, can never 400 or 500 the
    //     population figures. Counting through the socket is livenessSmoke.mjs.
    // (b) The source pin — this file's existing architecture-pin idiom. Deleting
    //     `viewerIdOf(ctx.query)` from the route would leave every unit test
    //     green while the heartbeat quietly stopped being recorded, so the wire
    //     from the query bag to the validator is pinned literally.
    await livenessPayload(async () => [arena(4, 'standard')]); // warm the cache
    for (const q of [
      { c: '8f3a1c2b9d4e5f60' },
      { c: 'not a valid id!' },
      { c: 'a'.repeat(100_000) },
      { c: ['a1234567', 'b1234567'] },
      {},
      undefined,
    ]) {
      const body = await call(q);
      expect(body.playersOnline).toBe(4);
      expect(body.liveGames).toBe(1);
    }
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../liveness.ts', import.meta.url), 'utf-8');
    expect(src).toMatch(/livenessPayload\(driverQuery, viewerIdOf\(ctx\.query\)\)/);
  });
});

// --- architecture: the presence store, not a module Map ----------------------

describe('presence lives on matchMaker.presence, not in this process (D8)', () => {
  it('reads the shared presence store and keeps stats.local banned', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../liveness.ts', import.meta.url), 'utf-8');
    const code = src
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    // A module-level Map would be process-local and would UNDERCOUNT the day
    // this runs on two nodes — silently, and in the direction that makes the
    // game look dead. Same rule that made this route use matchMaker.query().
    expect(code).toMatch(/matchMaker\.presence/);
    expect(code).not.toMatch(/new Map\s*(<|\()/);
    expect(code).not.toMatch(/new Set\s*(<|\()/);
    expect(code).not.toMatch(/matchMaker\s*\.\s*stats/);
  });

  it('namespaces its key so it cannot collide with a Colyseus-internal one', () => {
    expect(PRESENCE_KEY.startsWith('hc:')).toBe(true);
  });
});
