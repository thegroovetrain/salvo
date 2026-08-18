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

import { describe, it, expect, beforeEach } from 'vitest';
import { CONFIG } from '@salvo/shared';
import {
  foldLiveness,
  modeOf,
  livenessPayload,
  resetLiveness,
  __setLivenessNowSource,
  LIVENESS_CACHE_MS,
  ARENA_ROOM,
  QUEUE_ROOM,
  type RoomRecord,
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
    // The queue block is null (there is no room); the COUNTS are 0, not absent —
    // a population of zero is a fact the player needs.
    expect(out.queue).toBeNull();
    expect(out.modes).toEqual({
      standard: { players: 0, games: 0 },
      soloVsAi: { players: 0, games: 0 },
    });
  });

  it('no queue room: autoDispose removed it — identical to an empty queue, never an error', () => {
    const out = foldLiveness([arena(4, 'standard')], NOW);
    expect(out.queue).toBeNull();
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
    expect(out.queue).toBeNull();
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
