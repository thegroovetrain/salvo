// Story 6.6 — the PUBLIC liveness surface: `GET /liveness`.
//
// The home screen has to answer "is anyone playing, and is a Standard match
// about to start" BEFORE the player commits to a queue. That question is about
// the whole deployment, not about this process — so the only data source here
// is `matchMaker.query()`, which reads the DRIVER's room cache and therefore
// stays correct the day the game runs on more than one node.
//
// `matchMaker.stats.local` is FORBIDDEN in this file. It is process-local, and
// reading it here would silently bake in the co-residency assumption D8 exists
// to prevent (the queue already routes every arena creation through the
// matchmaker for exactly that reason). `/metrics` keeps using it and is right
// to: see the cross-reference comment in metrics.ts.
//
// Shape: everything the route answers is decided by `foldLiveness()`, a PURE
// function over a plain array of `{ name, clients, metadata }` records plus a
// clock. That is the project idiom (queue.ts's `queueStep`, game/match.ts,
// game/world.ts): the adapter is a two-liner and the whole matrix — including
// the EMPTY driver, which is the normal case at launch — is unit-testable with
// no Colyseus, no socket and no boot.
//
// Counts are HUMANS ONLY, for free: a bot holds no seat and no connection, so
// the driver's `clients` never sees one. Nothing here may add participant
// counts to a player-facing number.

import { matchMaker, createEndpoint } from 'colyseus';
import { CONFIG, type LivenessPayload } from '@salvo/shared';

/** Room names, mirroring app.config.ts's `gameServer.define` calls. */
export const ARENA_ROOM = 'arena';
export const QUEUE_ROOM = 'queue';

/** How long one driver query is reused. Many pollers, one query. */
export const LIVENESS_CACHE_MS = 2000;

/**
 * The ONLY fields of a driver room listing this module reads. Declared
 * structurally rather than imported as `IRoomCache` so the fold takes a plain
 * array in tests — the point of the pure seam.
 */
export interface RoomRecord {
  name: string;
  clients: number;
  metadata?: unknown;
}

/** `metadata.mode` as published by ArenaRoom.finishCreate. */
type ModeKey = 'standard' | 'soloVsAi';

/** Narrow unknown metadata to a bag, or null. */
function bagOf(metadata: unknown): Record<string, unknown> | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  return metadata as Record<string, unknown>;
}

/** Read a finite number off a (possibly absent) metadata bag, else null. */
function num(bag: Record<string, unknown> | null, key: string): number | null {
  const v = bag?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * An arena's mode. A room with no metadata, or metadata this build does not
 * recognize, counts as 'standard' — defensive AND correct: only solo rooms are
 * ever tagged, so "untagged" and "standard" are the same fact, and a mode the
 * breakdown cannot name must never vanish from the split it is meant to
 * account for.
 */
export function modeOf(metadata: unknown): ModeKey {
  return bagOf(metadata)?.mode === 'soloVsAi' ? 'soloVsAi' : 'standard';
}

/**
 * The queue block from a queue room's listing metadata (published by
 * StandardQueueRoom on change). Falls back to the room's own client count with
 * NO deadline when the metadata is absent or malformed: an honest pooled count
 * with no countdown is always safe, whereas a countdown that cannot fire is
 * exactly what amendment 4 forbids.
 */
function queueOf(room: RoomRecord): LivenessPayload['queue'] {
  const bag = bagOf(room.metadata);
  return {
    pooled: num(bag, 'pooled') ?? room.clients,
    min: num(bag, 'min') ?? CONFIG.match.minHumans,
    cap: num(bag, 'cap') ?? CONFIG.map.playerCap,
    deadlineAt: num(bag, 'deadlineAt'),
  };
}

/**
 * Fold a driver room listing into the public payload. PURE — no clock read, no
 * I/O, no Colyseus.
 *
 * - `playersOnline` = humans across EVERY room, queue and arena alike (a
 *   captain waiting is a player who is online).
 * - `liveGames` = arena rooms in ANY phase (ruled: boarding counts).
 * - `queue` = the Standard queue, or null when no queue room exists — which is
 *   the NORMAL empty state, since the room autoDisposes with its last captain.
 * - `modes` = the per-mode split, for operators only (deliberately not on the
 *   home screen).
 */
export function foldLiveness(rooms: readonly RoomRecord[], nowMs: number): LivenessPayload {
  const modes = {
    standard: { players: 0, games: 0 },
    soloVsAi: { players: 0, games: 0 },
  };
  let playersOnline = 0;
  let liveGames = 0;
  let queue: LivenessPayload['queue'] = null;
  for (const room of rooms) {
    const clients = typeof room.clients === 'number' && Number.isFinite(room.clients)
      ? Math.max(0, room.clients)
      : 0;
    playersOnline += clients;
    if (room.name === ARENA_ROOM) {
      liveGames++;
      const bucket = modes[modeOf(room.metadata)];
      bucket.players += clients;
      bucket.games++;
    } else if (room.name === QUEUE_ROOM && queue === null) {
      // First queue listing wins. There is exactly one in practice (the room is
      // never locked and has no maxClients, so joinOrCreate always pools into
      // it); taking the first keeps a hypothetical second from publishing a
      // second countdown the client would have no way to choose between.
      queue = queueOf(room);
    }
  }
  return { playersOnline, liveGames, queue, modes, serverNow: nowMs };
}

// --- adapter: driver query + short cache -------------------------------------

/** The driver query, injectable so the adapter is testable without a server. */
export type LivenessQuery = () => Promise<RoomRecord[]>;

async function driverQuery(): Promise<RoomRecord[]> {
  return await matchMaker.query({});
}

/**
 * EPOCH ms, not a monotonic source (the deliberate difference from metrics.ts).
 * `serverNow` exists so the client can correct its own clock skew against an
 * absolute `deadlineAt`, so it must be a wall clock the client can subtract
 * from its own `Date.now()`. Swappable for deterministic tests — the same
 * test-only convention as metrics.ts's `__setNowSource`.
 */
let nowMs: () => number = () => Date.now();

/** Test-only: override the epoch clock source (mirrors `resetLiveness`). */
export function __setLivenessNowSource(fn: () => number): void {
  nowMs = fn;
}

interface CacheEntry {
  at: number;
  payload: LivenessPayload;
}
let cache: CacheEntry | null = null;

/** Test-only: drop the cached payload. */
export function resetLiveness(): void {
  cache = null;
}

/**
 * The cached payload. A page of visitors polling every 10 s must not become a
 * driver query per visitor, so one query is reused for LIVENESS_CACHE_MS. The
 * age test is `0 <= age < TTL`, so a clock that steps BACKWARDS invalidates the
 * cache rather than pinning it until the step is worked off.
 *
 * `serverNow` is re-stamped on every response, even from cache: the counts may
 * be up to 2 s stale (nobody can tell), but a stale clock stamp would inject up
 * to 2 s of phantom skew into the client's countdown correction, which is the
 * one number in the payload that must never be old.
 */
export async function livenessPayload(query: LivenessQuery = driverQuery): Promise<LivenessPayload> {
  const now = nowMs();
  if (cache !== null) {
    const age = now - cache.at;
    if (age >= 0 && age < LIVENESS_CACHE_MS) return { ...cache.payload, serverNow: now };
  }
  const payload = foldLiveness(await query(), now);
  cache = { at: now, payload };
  return payload;
}

// --- HTTP endpoint (Colyseus 0.17 typed route) -------------------------------

/**
 * GET /liveness — the public, cross-process, player-facing snapshot.
 *
 * CORS needs no work here: Colyseus's router prepends
 * `Access-Control-Allow-Origin: *` to every response, so the Vite dev client on
 * :5173 reads this off :2567 unchanged.
 */
export const livenessEndpoint = createEndpoint(
  '/liveness',
  { method: 'GET' },
  async (ctx) => ctx.json(await livenessPayload()),
);
