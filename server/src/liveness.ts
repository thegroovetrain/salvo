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
//
// HOME-SCREEN PRESENCE (Eric ruling 2026-08-18). `playersOnline` counts every
// live human, and a player reading the home screen deciding which door to press
// is one. They hold no room and no socket, so the driver cannot see them — the
// LIVENESS POLL ITSELF is their heartbeat: each `GET /liveness?c=<tab id>`
// records that tab into a shared presence hash, and the count is the live size
// of that hash. No extra request, nothing to unsubscribe, and a closed tab drops
// out on the TTL by itself.
//
// The store is `matchMaker.presence`, NOT a module-level Map — the same D8
// argument that made this route use `matchMaker.query()`. A Map would be
// process-local and would undercount the day this runs on two nodes, silently
// and in the direction that makes the game look dead.
//
// DOUBLE COUNTING IS STRUCTURAL, not reconciled: the client stops polling the
// instant it commits to a door, so a human is either polling from home or
// holding a room seat, never both. Nothing here subtracts, de-duplicates or
// cross-references the two populations, and nothing may start — a reconciliation
// pass would be a second answer to a question that already has one.

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
 *   captain waiting is a player who is online), PLUS `homeViewers` — the
 *   home-screen population, which is an INPUT to this function and never a side
 *   effect inside it. The recording and the counting of that set are the
 *   adapter's job (`homeViewers()` below); the fold only adds a number it was
 *   handed, which is what keeps the whole I/O matrix testable with no presence,
 *   no driver and no boot.
 * - `liveGames` = arena rooms in ANY phase (ruled: boarding counts). HOME
 *   VIEWERS DO NOT TOUCH IT — a player reading the front page is not a game.
 * - `queue` = the Standard queue, or `emptyQueue()` when no queue room exists —
 *   which is the NORMAL empty state, since the room autoDisposes with its last
 *   captain, and reads identically to a pool of zero.
 * - `modes` = the per-mode split, for operators only (deliberately not on the
 *   home screen). ARENAS ONLY — see the header: queued captains are in neither
 *   bucket, and neither are home viewers, so the two do not sum to
 *   `playersOnline`.
 */
export function foldLiveness(
  rooms: readonly RoomRecord[],
  nowMs: number,
  homeViewers = 0,
): LivenessPayload {
  const modes = {
    standard: { players: 0, games: 0 },
    soloVsAi: { players: 0, games: 0 },
  };
  // The home-screen population enters here and nowhere else. Validated the same
  // way every other externally-sourced number in this file is: one bad input may
  // not poison the whole register with a NaN.
  let playersOnline = Number.isFinite(homeViewers) ? Math.max(0, homeViewers) : 0;
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

// --- home-screen presence ----------------------------------------------------

/**
 * The shared hash every process writes home-screen heartbeats into.
 * Namespaced so it can never collide with a Colyseus-internal presence key.
 */
export const PRESENCE_KEY = 'hc:liveness:home';

/**
 * How long one recorded tab stays counted without polling again.
 *
 * The client polls every 10 s, so this is THREE poll intervals: a viewer
 * survives two consecutive missed polls (a backgrounded tab throttled by the
 * browser, a dropped request, a 4G tunnel) without blinking out of the count,
 * which matters because the number they are reading includes themselves and a
 * self-count that flickers reads as a broken page. It is also short enough that
 * a CLOSED tab is gone within half a minute with nothing to unsubscribe — the
 * whole reason this is a TTL and not a session. Longer would inflate the front
 * page with ghosts (the exact lie the story exists to prevent, in the flattering
 * direction); shorter would start dropping live viewers on ONE missed poll.
 *
 * Deliberately NOT derived from a shared poll-interval constant: the client half
 * lives in another workspace and `shared/` carries no such value, so the
 * relationship is stated here rather than faked in code. If the client poll
 * interval moves, this moves with it — 3x is the rule.
 */
export const PRESENCE_TTL_MS = 30_000;

/** Bounds on the client's ephemeral per-tab id (`?c=`). */
const VIEWER_ID_MIN = 8;
const VIEWER_ID_MAX = 64;
/**
 * URL-safe base64 / hex / UUID alphabet. Wide enough for whatever the client
 * mints (`crypto.randomUUID()`, a random hex string, a base64url nonce) and
 * narrow enough that nothing landing in a presence key can carry a separator, a
 * wildcard, a control character or a redis glob.
 */
const VIEWER_ID_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * The viewer id from a parsed query bag, or null.
 *
 * ABSENT IS LEGITIMATE and must stay that way: a smoke, a curl, an uptime probe
 * and an operator all poll this route with no `c` at all, and they get the real
 * payload without being counted. So does anything malformed — an oversized id, a
 * repeated `?c=a&c=b` (better-call hands that over as an ARRAY, which is why the
 * `typeof` check is load-bearing rather than decorative), a value carrying
 * punctuation. Every one of those is silently NOT RECORDED. None of them is an
 * error: this route answers a population question, and refusing to answer it
 * because a query parameter was junk would take the front page down over a
 * cosmetic input.
 */
export function viewerIdOf(query: unknown): string | null {
  const raw = bagOf(query)?.c;
  if (typeof raw !== 'string') return null;
  if (raw.length < VIEWER_ID_MIN || raw.length > VIEWER_ID_MAX) return null;
  return VIEWER_ID_CHARS.test(raw) ? raw : null;
}

/**
 * The slice of `Presence` this module uses. Declared structurally (like
 * `RoomRecord`) so tests inject a plain object and the module never has to boot
 * a matchMaker — `matchMaker.presence` satisfies it by shape.
 */
export interface PresenceLike {
  hset(key: string, field: string, value: string): unknown;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, field: string): unknown;
}

/**
 * `matchMaker.presence`, or null when there is no matchMaker to read (unit
 * tests, pre-listen). Degrading to null costs the home-screen term and keeps
 * every room count — the same "one missing source may not black out the whole
 * register" rule the malformed-metadata paths follow.
 */
function defaultPresence(): PresenceLike | null {
  try {
    const p = matchMaker.presence as unknown as PresenceLike | undefined;
    return p !== undefined && typeof p.hgetall === 'function' ? p : null;
  } catch {
    return null;
  }
}

/**
 * Count the live entries and PRUNE the dead ones.
 *
 * Both halves are required. Filtering on read alone keeps the count honest while
 * the hash grows without bound — every tab that ever loaded the page, forever —
 * so an expired field is actually `hdel`'d the first time a poll walks past it.
 * Steady state is bounded by the number of distinct tabs that polled inside one
 * TTL window. (Per-field expiry is not available: core's own LocalPresence notes
 * that redis HEXPIRE needs 7.4+, and its `hincrbyex` fallback expires the WHOLE
 * hash — which would drop every viewer at once. Value-stamped + swept is the
 * only shape that behaves identically on both presence backends.)
 *
 * A stamp in the FUTURE counts as live rather than being pruned. The only writer
 * of these values is this server, so a future stamp means one node's clock runs
 * ahead of another's — and pruning on that would have node A delete node B's
 * viewers on every single poll, a self-inflicted outage of exactly the multi-node
 * case the presence store exists for. Skew is bounded and self-heals on the next
 * heartbeat; a garbage stamp is not reachable from the wire.
 */
async function countViewers(store: PresenceLike, now: number): Promise<number> {
  const all = await store.hgetall(PRESENCE_KEY);
  const expired: string[] = [];
  let live = 0;
  for (const [id, stamp] of Object.entries(all ?? {})) {
    const seen = Number(stamp);
    if (Number.isFinite(seen) && now - seen < PRESENCE_TTL_MS) live++;
    else expired.push(id);
  }
  await Promise.all(expired.map((id) => store.hdel(PRESENCE_KEY, id)));
  return live;
}

/**
 * Record this request's viewer (when it carries a valid id) and return the size
 * of the live home-screen set.
 *
 * RECORD FIRST, THEN COUNT — so a first-time visitor is in the number they are
 * being shown. `playersOnline` is documented as including you; a heartbeat that
 * only took effect on the NEXT poll would show a lone visitor `0 PLAYERS ONLINE`
 * on a page whose own definition counts them, for a full poll interval.
 *
 * A presence failure degrades to 0 rather than throwing. The room counts are the
 * older, more load-bearing half of this payload and must survive a presence
 * outage; a 500 here would take the whole front page down to lose one term.
 */
export async function homeViewers(
  viewer: string | null,
  now: number,
  store: PresenceLike | null,
): Promise<number> {
  if (store === null) return 0;
  try {
    if (viewer !== null) await store.hset(PRESENCE_KEY, viewer, String(now));
    return await countViewers(store, now);
  } catch {
    return 0;
  }
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

/**
 * THE CACHE HOLDS THE DRIVER'S ANSWER, NOT THE FOLDED PAYLOAD.
 *
 * It used to hold the payload, which was fine while every term came from one
 * query. It cannot once `playersOnline` carries a home-screen count, because of
 * the decision recorded on `livenessPayload()`: the ROOM half is cached and the
 * HOME half is read fresh per request, so the fold has to run on every response.
 * Caching the room LISTING is what makes that free — the expensive thing
 * (`matchMaker.query()`, a cross-process driver read) is still collapsed exactly
 * as before, while the fold itself is arithmetic over a handful of records.
 */
interface CacheEntry {
  at: number;
  rooms: readonly RoomRecord[];
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
let inFlight: Promise<CacheEntry> | null = null;

/** Test-only: drop the cached payload (and any in-flight query). */
export function resetLiveness(): void {
  cache = null;
  inFlight = null;
}

/**
 * The cached room listing, or null when there is no usable one. The age test is
 * `0 <= age < TTL`, so a clock that steps BACKWARDS invalidates the cache
 * rather than pinning it until the step is worked off.
 *
 * Nothing is re-stamped here any more, because nothing is folded here any more:
 * `serverNow` is stamped by `livenessPayload()` on every response, cached or
 * not. The counts may be up to 2 s stale (nobody can tell), but a stale clock
 * stamp would inject up to 2 s of phantom skew into the client's countdown
 * correction, which is the one number in the payload that must never be old.
 */
function cachedRooms(now: number): readonly RoomRecord[] | null {
  if (cache === null) return null;
  const age = now - cache.at;
  return age >= 0 && age < LIVENESS_CACHE_MS ? cache.rooms : null;
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
/**
 * A COPY of the fields the fold reads. Required, not hygiene.
 *
 * `matchMaker.query()` hands back the driver's LIVE listing objects, not
 * snapshots: core mutates `listing.clients` on every seat edge, and
 * `Room.setMetadata()` writes field-by-field INTO `listing.metadata` in place
 * (@colyseus/core 0.17.44, Room.ts:674-688). Caching those references would make
 * the "2 s cache" silently track live state — livenessSmoke.mjs caught exactly
 * that, a poll 3 ms inside the window already reporting a captain who joined
 * after the query settled. The pre-ruling code got away with it only because it
 * folded immediately and cached NUMBERS; now that the listing itself is what is
 * cached, it has to be copied.
 *
 * Shallow is sufficient and deliberate: the fold reads only scalar keys off the
 * metadata bag, so one level of copying pins every value it can consume.
 */
function snapshot(rooms: readonly RoomRecord[]): readonly RoomRecord[] {
  return rooms.map((room) => {
    const bag = bagOf(room.metadata);
    return { name: room.name, clients: room.clients, metadata: bag === null ? room.metadata : { ...bag } };
  });
}

async function refresh(query: LivenessQuery): Promise<CacheEntry> {
  const rooms = snapshot(await query());
  const entry: CacheEntry = { at: nowMs(), rooms };
  cache = entry;
  return entry;
}

/**
 * The room listing: from cache, from the query already in flight, or from a new
 * one. A FAILED query is never cached — and the in-flight slot is released on
 * rejection as well as on success, so the very next caller retries rather than
 * inheriting a dead promise.
 */
async function roomListing(query: LivenessQuery): Promise<readonly RoomRecord[]> {
  const hit = cachedRooms(nowMs());
  if (hit !== null) return hit;
  inFlight ??= refresh(query).finally(() => {
    inFlight = null;
  });
  return (await inFlight).rooms;
}

/**
 * The public payload. A page of visitors polling every 10 s must not become a
 * driver query per visitor, so one query serves everyone for LIVENESS_CACHE_MS
 * (settled cache) or for its own duration (in-flight promise).
 *
 * THE CACHE COVERS THE ROOMS AND NOT THE VIEWER COUNT — the decision this
 * follow-up had to make, and it goes the other way from the room half:
 *
 *   1. Presence has to be WRITTEN on every request anyway, cache hit or not, or
 *      a viewer whose polls keep landing inside someone else's cache window
 *      never refreshes their own TTL and silently ages out while sitting right
 *      there on the page. So the store is already touched on the cached path;
 *      reading the set back costs the same round-trip class. The thing the cache
 *      exists to collapse — `matchMaker.query()`, the cross-process driver read
 *      — is still collapsed exactly as before.
 *   2. The number is documented as INCLUDING YOU, and staleness here is not
 *      symmetric with staleness in the room counts. A first-time visitor whose
 *      request lands inside another visitor's 2 s window would be handed a count
 *      that provably excludes them — on an empty server, `0 PLAYERS ONLINE` on a
 *      page whose own definition counts them — and the correction would not
 *      arrive in 2 s but in a full POLL INTERVAL (10 s), because that is when
 *      they next ask. Nobody can perceive a 2 s-stale room count; everybody can
 *      perceive not existing.
 *   3. It costs nothing structurally: the cache holds the driver's ANSWER, so
 *      every response re-runs a pure fold over a handful of records, and
 *      `foldLiveness` stays pure with the presence set as an INPUT.
 */
export async function livenessPayload(
  query: LivenessQuery = driverQuery,
  viewer: string | null = null,
  store: PresenceLike | null = defaultPresence(),
): Promise<LivenessPayload> {
  const rooms = await roomListing(query);
  // The clock is read AFTER the driver settles (see `refresh`) and again for the
  // stamp itself, so a caller that joined an in-flight query part-way through is
  // never handed the clock as it stood when someone else's request landed.
  const viewers = await homeViewers(viewer, nowMs(), store);
  return foldLiveness(rooms, nowMs(), viewers);
}

// --- HTTP endpoint (Colyseus 0.17 typed route) -------------------------------

/**
 * GET /liveness — the public, cross-process, player-facing snapshot.
 *
 * CORS needs no work here: Colyseus's router prepends
 * `Access-Control-Allow-Origin: *` to every response, so the Vite dev client on
 * :5173 reads this off :2567 unchanged.
 *
 * `?c=<ephemeral per-tab id>` is the home-screen heartbeat — see `viewerIdOf`.
 * It is OPTIONAL in every direction: absent, malformed or oversized, the payload
 * is served unchanged and the caller simply is not counted.
 */
export const livenessEndpoint = createEndpoint(
  '/liveness',
  { method: 'GET' },
  async (ctx) => {
    const payload = await livenessPayload(driverQuery, viewerIdOf(ctx.query));
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
