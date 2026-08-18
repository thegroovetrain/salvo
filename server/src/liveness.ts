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
//
// What each field MEANS is documented on `LivenessPayload` itself
// (shared/src/types.ts) — in particular why
// `modes.standard.players + modes.soloVsAi.players` does NOT equal
// `playersOnline` whenever anyone is pooled. Read it before "reconciling" them.

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
 * The driver's own socket count for a room, VALIDATED. A listing that somehow
 * carries a non-finite `clients` must contribute 0 rather than poison every
 * number downstream with NaN — one bad room may not black out the register.
 */
function clientsOf(room: RoomRecord): number {
  return typeof room.clients === 'number' && Number.isFinite(room.clients)
    ? Math.max(0, room.clients)
    : 0;
}

/**
 * HOW MANY HUMANS ARE ACTUALLY IN THIS ROOM.
 *
 * `metadata.humans` FIRST, the driver's `clients` only as a fallback — because
 * the driver's number is not the room's population, it is the room's SEAT
 * ledger, and the two differ in both directions (verified against
 * @colyseus/core 0.17.44's Room.mjs):
 *
 *   TOO HIGH, FOR UP TO 60 s. `#_decrementClientCount()` runs in
 *   `#_onAfterLeave`, which for a room defining `onDrop` is deferred until the
 *   `allowReconnection()` promise settles. ArenaRoom grants
 *   CONFIG.net.reconnectGraceSeconds (60), so a captain who closes their tab
 *   stayed in `PLAYERS ONLINE` for a full minute. That is the NORMAL exit, not
 *   an edge case.
 *
 *   TOO HIGH AGAIN, ACROSS EVERY SEAT HANDOFF. `#_incrementClientCount()` runs
 *   inside `_reserveSeat`, i.e. the instant the queue reserves a seat — while
 *   the captain is still holding their queue socket. The driver therefore
 *   counts them twice for the whole reservation window.
 *
 * A room's OWN `this.clients` array is mutated immediately on both edges (push
 * in `_onJoin`, `delete` at the top of `_onLeave`) and never contains a
 * reserved-but-unjoined seat, so publishing it as `humans` answers both. Rooms
 * that publish nothing (an older build, a listing racing its first write) fall
 * back to the seat ledger, which is wrong-but-bounded rather than absent.
 */
function humansOf(room: RoomRecord): number {
  const published = num(bagOf(room.metadata), 'humans');
  return published === null ? clientsOf(room) : Math.max(0, published);
}

/**
 * The queue block from a queue room's listing metadata (published by
 * StandardQueueRoom on change). Falls back to the room's own client count with
 * NO deadline when the metadata is absent or malformed: an honest pooled count
 * with no countdown is always safe, whereas a countdown that cannot fire is
 * exactly what amendment 4 forbids.
 *
 * `pooled`'s fallback goes through `clientsOf`, NOT through `room.clients` raw:
 * an unvalidated fallback made ONE bad sub-field black out the whole register
 * (a NaN serializes to `null`, which the client's strict shape guard rejects,
 * so PLAYERS ONLINE and LIVE GAMES vanished even though the arena counts were
 * perfect).
 */
function queueOf(room: RoomRecord): LivenessPayload['queue'] {
  const bag = bagOf(room.metadata);
  return {
    pooled: num(bag, 'pooled') ?? clientsOf(room),
    min: num(bag, 'min') ?? CONFIG.match.minHumans,
    cap: num(bag, 'cap') ?? CONFIG.map.playerCap,
    deadlineAt: num(bag, 'deadlineAt'),
  };
}

/**
 * The queue block for a deployment with NO queue room at all — which is the
 * NORMAL idle state, since the room autoDisposes with its last captain.
 *
 * The server ALWAYS emits a block now. `LivenessPayload['queue']` keeps its
 * `| null` (an older server, a proxy, a future shape) and the client's guard
 * keeps accepting it, but nothing WE serve is ever null — because the only
 * thing a client could do with a null block is hardcode the threshold, and a
 * front page that says `NEEDS 2 TO START` from a client-side literal starts
 * lying the day `CONFIG.match.minHumans` is retuned. The empty-server case is
 * the single most-viewed state this route exists for; it must be answered by
 * the same authority that answers the busy one.
 */
function emptyQueue(): LivenessPayload['queue'] {
  return {
    pooled: 0,
    min: CONFIG.match.minHumans,
    cap: CONFIG.map.playerCap,
    deadlineAt: null,
  };
}

/**
 * Fold a driver room listing into the public payload. PURE — no clock read, no
 * I/O, no Colyseus.
 *
 * - `playersOnline` = humans across EVERY room, queue and arena alike (a
 *   captain waiting is a player who is online).
 * - `liveGames` = arena rooms in ANY phase (ruled: boarding counts).
 * - `queue` = the Standard queue, or `emptyQueue()` when no queue room exists —
 *   which is the NORMAL empty state, since the room autoDisposes with its last
 *   captain, and reads identically to a pool of zero.
 * - `modes` = the per-mode split, for operators only (deliberately not on the
 *   home screen). ARENAS ONLY — see the header: queued captains are in neither
 *   bucket, so the two do not sum to `playersOnline`.
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
    const humans = humansOf(room);
    playersOnline += humans;
    if (room.name === ARENA_ROOM) {
      liveGames++;
      const bucket = modes[modeOf(room.metadata)];
      bucket.players += humans;
      bucket.games++;
    } else if (room.name === QUEUE_ROOM && queue === null) {
      // First queue listing wins. There is exactly one in practice (the room is
      // never locked and has no maxClients, so joinOrCreate always pools into
      // it); taking the first keeps a hypothetical second from publishing a
      // second countdown the client would have no way to choose between.
      queue = queueOf(room);
    }
  }
  return { playersOnline, liveGames, queue: queue ?? emptyQueue(), modes, serverNow: nowMs };
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
/**
 * The query that is RUNNING RIGHT NOW, if any.
 *
 * The settled cache alone does not satisfy this module's own contract ("many
 * pollers, ONE driver query"): it is written only AFTER `await query()`
 * resolves, so every poller that arrives inside one query's latency window
 * missed the cache and started its own. On an unauthenticated public route
 * that is a stampede amplifier — N concurrent visitors become N driver
 * queries, which is exactly the cost the future Redis driver cannot absorb.
 * Memoizing the PROMISE collapses them onto one.
 */
let inFlight: Promise<LivenessPayload> | null = null;

/** Test-only: drop the cached payload (and any in-flight query). */
export function resetLiveness(): void {
  cache = null;
  inFlight = null;
}

/**
 * The cached payload, or null when there is no usable one. The age test is
 * `0 <= age < TTL`, so a clock that steps BACKWARDS invalidates the cache
 * rather than pinning it until the step is worked off.
 *
 * `serverNow` is re-stamped here: the counts may be up to 2 s stale (nobody can
 * tell), but a stale clock stamp would inject up to 2 s of phantom skew into
 * the client's countdown correction, which is the one number in the payload
 * that must never be old.
 */
function cachedPayload(now: number): LivenessPayload | null {
  if (cache === null) return null;
  const age = now - cache.at;
  return age >= 0 && age < LIVENESS_CACHE_MS ? { ...cache.payload, serverNow: now } : null;
}

/**
 * One real driver read.
 *
 * THE CLOCK IS READ AFTER THE QUERY SETTLES, never before. `serverNow` exists
 * so a client can subtract it from its own `Date.now()` and correct an absolute
 * `deadlineAt`; stamping it before an 800 ms driver round trip would hand every
 * visitor an 800 ms skew correction that is pure fiction, and their countdown
 * would run that much early. The same stamp dates the cache entry, so the TTL
 * is measured from when the counts were TRUE rather than from when they were
 * asked for.
 */
async function refresh(query: LivenessQuery): Promise<LivenessPayload> {
  const rooms = await query();
  const at = nowMs();
  const payload = foldLiveness(rooms, at);
  cache = { at, payload };
  return payload;
}

/**
 * The public payload. A page of visitors polling every 10 s must not become a
 * driver query per visitor, so one query serves everyone for LIVENESS_CACHE_MS
 * (settled cache) or for its own duration (in-flight promise).
 *
 * A FAILED query is still never cached — and the in-flight slot is released on
 * rejection as well as on success, so the very next caller retries rather than
 * inheriting a dead promise.
 */
export async function livenessPayload(query: LivenessQuery = driverQuery): Promise<LivenessPayload> {
  const cached = cachedPayload(nowMs());
  if (cached !== null) return cached;
  inFlight ??= refresh(query).finally(() => {
    inFlight = null;
  });
  const payload = await inFlight;
  // Re-stamped for the same reason a cache hit is: a caller that joined an
  // in-flight query part-way through must not be handed the clock as it stood
  // when someone else's request landed.
  return { ...payload, serverNow: nowMs() };
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
  async (ctx) => {
    const payload = await livenessPayload();
    // NO-STORE, and it is load-bearing rather than hygiene. Every number here
    // is a live population figure polled every 10 s, and `queue.deadlineAt` is
    // an ABSOLUTE epoch: a caching proxy (a corporate middlebox, a CDN edge, a
    // mobile carrier) that held one response for a session would freeze
    // PLAYERS ONLINE for that whole session AND pin the countdown at 0:00
    // forever, which is precisely the "the game is broken" reading this story
    // exists to prevent. Our own 2 s server cache is deliberate and bounded;
    // an intermediary's is neither.
    ctx.setHeader('Cache-Control', 'no-store');
    return ctx.json(payload);
  },
);
