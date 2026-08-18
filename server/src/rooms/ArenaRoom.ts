// Thin Colyseus adapter around the plain-TS World simulation + Match state
// machine. All game logic lives in game/ — this room only bridges: joins/
// leaves <-> roster schema + match roster notifications, raw "i" messages ->
// World's input store, fixed steps -> match update + per-client frames, and
// implements the Match side-effect hooks (lock/unlock/broadcast/disconnect).
// Story 0.3 adds the operability glue: structured lifecycle logging,
// match.end/match.abort telemetry, tick-error containment, metrics feeds,
// and the JOINING-deadline kick — all adapter-side (game/ stays pure).

import { ClientState, CloseCode, ErrorCode, Room, ServerError, generateId, type Client } from 'colyseus';
import {
  CONFIG,
  MSG,
  REGATTA_NO_HUE,
  SHIP_CLASS_IDS,
  isAfloat,
  mulberry32,
  sanitizeClassId,
  sanitizeHornId,
  zoneGroups,
  type RequeueMsg,
  type ResultsMsg,
  type Rng,
  type ShipClassId,
  type WelcomeMsg,
} from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World, resolveRadarGrammar, resolveRadarIdentity } from '../game/world.js';
import { assignHue } from '../game/regatta.js';
import { buildFrame } from '../game/frames.js';
import {
  Match,
  defaultTimings,
  dropPolicy,
  resolveTickErrorTolerance,
  shouldAbortOnTickError,
  type MatchHooks,
  type MatchTimings,
} from '../game/match.js';
import { createLogger, type LogFields, type Logger } from '../log.js';
import { registerRoom, type RoomMetricsHandle } from '../metrics.js';
import { RttEstimator } from '../game/rtt.js';
import {
  protocolVersionError,
  sanitizeColorPref,
  sanitizeName,
  sanitizeRoomOptions,
  type JoinOptions,
  type RoomOptions,
  type SanitizedRoomOptions,
} from './roomOptions.js';

const SIM_DT_MS = CONFIG.tick.simDtMs; // 50ms fixed step (20Hz)
const INTERVAL_MS = 1000 / 60; // setSimulationInterval cadence
const MAX_ACCUMULATED_MS = SIM_DT_MS * 5; // spiral-of-death cap
/**
 * Cap on unanswered ping nonces retained per client. With one ping per
 * CONFIG.net.pingIntervalMs and a CONFIG.net.rttWindowMs estimator window,
 * anything older than the window is useless anyway; 16 comfortably covers the
 * window at the 1s cadence while bounding a client that simply never echoes.
 */
const MAX_OUTSTANDING_PINGS = 16;
/** Telemetry mode tag (one room type today) carried on match.end/match.abort. */
const MODE = 'arena';

/**
 * The listing-metadata block this room publishes for `GET /liveness` (Story
 * 6.6): which door created it, and how many humans are aboard RIGHT NOW (see
 * publishListing for why the driver's own `clients` count cannot answer that).
 */
interface ArenaListingMeta {
  mode: 'standard' | 'soloVsAi';
  humans: number;
}
/** The zeroed "unrevealed" next-ring mirror (r 0 = no reveal — see ArenaState). */
const ZERO_RING = Object.freeze({ cx: 0, cy: 0, r: 0 });
/**
 * Rejection message for a direct `joinOrCreate('arena')` (Story 6.1). Every
 * production captain arrives through StandardQueueRoom's seat reservation
 * instead; the direct door is dev-only (HC_DEV_OPTIONS=1) so the headless
 * smokes can keep driving an arena without a queue in front of it.
 */
export const ARENA_DIRECT_JOIN_ERROR = 'this room is not joinable directly — use the queue';
/**
 * Bounded redraws when a joining captain's callsign collides with a bot's
 * (Story 6.5). One is normally enough — the pool is drawn without repeat — so
 * this only covers the unlucky case where the NEXT name also matches the
 * player. Bounded rather than looped-until-clear: a name search must never be
 * able to spin on a pathological pool.
 */
const CALLSIGN_REDRAWS = 4;

/**
 * Render a thrown value into log fields WITHOUT ever throwing ourselves:
 * `String(err)` itself throws for prototype-less values (`throw
 * Object.create(null)`), and a throw here would escape the tick-error
 * containment straight into core's bare setInterval. Errors keep their
 * message and a separate stack field for forensics.
 */
function describeError(err: unknown): LogFields {
  if (err instanceof Error) return { error: err.message, stack: err.stack };
  try {
    return { error: String(err) };
  } catch {
    return { error: 'unstringifiable' };
  }
}

/**
 * Close codes that earn the reconnect grace window (story 0.2, finding F1).
 * EXACTLY the set the @colyseus/sdk itself auto-reconnects on (verified against
 * @colyseus/sdk 0.17.43 Connection.onclose → handleReconnection) — genuine
 * abnormal/network drops. Every other code is a punitive or deliberate close
 * that must tear down immediately: WITH_ERROR 4002 (rate-limit / malformed-
 * message kick — verified as the code core passes onDrop from
 * #_forciblyCloseClient in @colyseus/core 0.17.44 Room.ts), SERVER_SHUTDOWN,
 * FAILED_TO_RECONNECT, etc. (CONSENTED 4000 never reaches onDrop — core routes
 * it straight to onLeave). Referenced by name off the CloseCode enum re-exported
 * from 'colyseus'.
 */
const RECONNECTABLE_CLOSE_CODES: ReadonlySet<number> = new Set([
  CloseCode.GOING_AWAY, // 1001
  CloseCode.NO_STATUS_RECEIVED, // 1005
  CloseCode.ABNORMAL_CLOSURE, // 1006
  CloseCode.MAY_TRY_RECONNECT, // 4010
]);

/**
 * Per-client RTT measurement state for the D1 ping loop ('p' channel). The
 * room sends MSG.ping every CONFIG.net.pingIntervalMs; the client echoes the
 * nonce; the elapsed REAL time (performance.now — this is the I/O adapter, not
 * the sim, so wall-clock is correct here) is one RTT sample. The estimator's
 * windowed min feeds World.setRtt after every sample.
 */
interface PingState {
  estimator: RttEstimator;
  /** Last nonce sent (incrementing per client). */
  nonce: number;
  /** Outstanding nonce -> real send time (performance.now ms); bounded. */
  outstanding: Map<number, number>;
}

// Colyseus 0.17 changed the Room generic from `Room<State>` to
// `Room<{ state: State }>` (the parameter is now a RoomOptions bag carrying
// state/metadata/client types), so `this.state` types as ArenaState again.
export class ArenaRoom extends Room<{ state: ArenaState }> {
  maxClients = CONFIG.map.playerCap;
  autoDispose = true;
  // Transport-level input flood guard (0.17): breach = forced disconnect.
  // CONFIG.net.maxMessagesPerSecond is the single source of truth; the budget
  // is sized for burst DELIVERY after a wifi stall, not just the 20Hz send
  // cadence (see constants.ts for the arrival-window derivation). CAUTION: the
  // 1s window resets off room.clock, which only advances while the simulation
  // interval runs — if the sim is ever paused, this degrades into a cumulative
  // cap that kicks an honest 20Hz client after ~10s.
  maxMessagesPerSecond = CONFIG.net.maxMessagesPerSecond;

  /**
   * The arena's DIRECT door (story 0.2's PROTOCOL_VERSION gate + Story 6.1's
   * closure). Static onAuth runs at matchmake time — BEFORE room lookup, seat
   * reservation, or any socket work (verified in @colyseus/core
   * MatchMaker.joinOrCreate → callOnAuth) — so a stale bundle is rejected with
   * a message the menu renders instead of failing later at schema decode.
   * matchMaker.reconnect() never calls onAuth, so a mid-match resume is not
   * re-gated (the reconnection token is the auth). The thrown ServerError
   * surfaces to the SDK's joinOrCreate promise as a MatchMakeError carrying
   * this exact message + code.
   *
   * Story 6.1 — this method now runs ONLY on a direct `joinOrCreate('arena')`.
   * matchMaker.reserveSeatFor / reserveMultipleSeatsFor call the room's
   * `_reserveSeat` directly and never invoke callOnAuth, so a queue-routed
   * captain never reaches here at all. That asymmetry cuts both ways: the PV
   * gate had to be re-implemented on StandardQueueRoom's door (or it would
   * silently stop running for every real player), and closing this door costs
   * queue traffic nothing. Only the smokes (HC_DEV_OPTIONS=1) still join an
   * arena directly.
   */
  static async onAuth(_token: string, options?: JoinOptions): Promise<boolean> {
    const error = protocolVersionError(options?.pv);
    if (error) throw new ServerError(ErrorCode.AUTH_FAILED, error);
    // THE SOLO DOOR (Story 6.5). The PV gate above still runs FIRST and is
    // unchanged — a stale bundle is refused here whichever door it knocks on.
    //
    // Why a client-supplied flag may open this one: the solo client calls
    // `client.create('arena', {solo:true})`, and create() ALWAYS mints a fresh
    // room, so the asker gets a private room of its own. Every production arena
    // — queue-formed or solo — is LOCKED AT BIRTH (see finishCreate), and
    // @colyseus/core refuses a locked room to both of the doors that could
    // reach an existing one (joinById throws "room is locked"; joinOrCreate's
    // driver query filters `locked: false`). So the only thing `solo:true` can
    // buy a hostile client is its own 20-hull room — the same cost as any
    // legitimate solo player — and never a seat, or a bot, in someone else's
    // match. Everything else about this door is untouched: a non-solo direct
    // join is still refused unless the process opted in with HC_DEV_OPTIONS=1.
    if (options?.solo === true) return true;
    if (process.env.HC_DEV_OPTIONS !== '1') {
      throw new ServerError(ErrorCode.AUTH_FAILED, ARENA_DIRECT_JOIN_ERROR);
    }
    return true;
  }

  private world!: World;
  /**
   * The room's Regatta hue RNG stream (Story 1.12) — seeded ONCE per room from
   * mapSeed decorrelated by a fresh mixing constant (distinct from world.ts's
   * spawn/upgrade/drone streams). Drives the no-preference assignment path
   * (assignHue) so hue picks are deterministic + seeded, never Math.random.
   */
  private hueRng!: Rng;
  /** Null only in sandbox mode (dev smokes) — see MatchOverride. */
  private match: Match | null = null;
  private accumulator = 0;
  private joinCounter = 0;
  /**
   * The one-time end-of-match results broadcast, cached when it fires (finding
   * F2). At drop time core removes the client from `this.clients`, so a captain
   * in grace misses the broadcast; if they resume during the results window we
   * re-send this so their results screen still renders. Null until the match
   * finishes — a normal mid-match resume then re-sends nothing.
   */
  private lastResults: ResultsMsg | null = null;
  /** Per-client D1 ping/RTT state; entries live from first ping to teardown. */
  private readonly pings = new Map<string, PingState>();
  /**
   * Seats whose captain has gone but whose SCUTTLED hull is still in its Story
   * 5.2 sinking window (Story 6.7, R5). The `PlayerMeta` row outlives the
   * client on purpose: `Match.onPlayerLeave` sinks the hull, but the resulting
   * `sunk` event is framed on a LATER tick, and every client resolves kill-feed
   * names from the live roster at event time — deleting the row with the seat
   * renders the departure as `UNKNOWN VESSEL`, which is exactly the "reads as
   * an ordinary sinking" ruling failing. `alive` is not special-cased: it is
   * projected from the hull's lifecycle by syncRoster, so a scuttled captain
   * shows as a sinking captain, which is what they are. Released by
   * releaseDeparted() once the hull is actually gone (Match.reapDeparted takes
   * it at the founder edge), and unconditionally at dispose so a seat can never
   * be held past the room.
   */
  private readonly departing = new Set<string>();

  // --- story 0.3 operability state -------------------------------------------
  /** Room-generated match identity (one match per room); '' until onCreate. */
  private matchId = '';
  /** Bound room logger; rebuilt in onCreate with {roomId, matchId, mode} + tick. */
  private log: Logger = createLogger({ mode: MODE });
  /** Which door created this room — the /liveness per-mode split (Story 6.6). */
  private mode: ArenaListingMeta['mode'] = 'standard';
  /** The listing metadata last written, so an unchanged room writes nothing. */
  private publishedListing: ArenaListingMeta | null = null;
  /** Metrics registry handle; null before onCreate and after dispose. */
  private metrics: RoomMetricsHandle | null = null;
  /** Consecutive failed sim steps (world.step + match.update + afterStep). */
  private consecutiveTickErrors = 0;
  /** Effective HC_TICK_ERROR_TOLERANCE, resolved ONCE in onCreate. */
  private tickErrorTolerance = 1;
  /** True once a tick-error abort fired — stops stepping until dispose lands. */
  private aborting = false;
  /** match.end emitted — an ended match must never also emit match.abort. */
  private matchEndEmitted = false;
  /** match.abort emitted — at most once, shared by tick-error + abandoned paths. */
  private matchAbortEmitted = false;
  /** match.activate logged (one-shot, observed AFTER the transition completes). */
  private matchActivateLogged = false;
  // HC_DEBUG once-per-second tick summary accumulators (cheap scalars only).
  private debugSteps = 0;
  private debugTotalMs = 0;
  private debugMaxMs = 0;
  private debugWindowStart = Date.now();

  onCreate(options: RoomOptions = {}): void {
    // SECURITY (findings C1/C2): matchOverride/zoneOverride arrive verbatim
    // from client-supplied joinOrCreate options. Only honor them when the
    // server process opts in via HC_DEV_OPTIONS=1 (smokes/tests only) —
    // otherwise a hostile client could trap joiners in a lifecycle-less
    // sandbox room, DoS via huge minHumans/countdownMs/resultsMs, or desync
    // the server's storm from what honest clients render.
    const devEnabled = process.env.HC_DEV_OPTIONS === '1';
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, devEnabled);

    // mapSeed (dev-only, HC_DEV_OPTIONS-gated like the other overrides) pins
    // the deterministic map for latency-harness smokes; production rooms
    // always roll a random seed.
    const seed = sanitized.mapSeed ?? (Math.random() * 0xffffffff) >>> 0;
    this.world = this.buildWorld(seed, sanitized);

    this.initOperability(rejectedKeys);

    // Core attaches its dispose handling only after onCreate returns — a
    // throw below would otherwise strand the metrics registration forever
    // (no onDispose ever runs for a room that failed to create).
    try {
      this.finishCreate(sanitized, seed);
    } catch (err) {
      this.metrics?.unregister();
      this.metrics = null;
      throw err;
    }
  }

  /**
   * The room's World: map sized for the PLAYER CAP (mapRadius(CONFIG.map.
   * playerCap) — 2800u since Story 5.6's bigger ocean). It rode
   * CONFIG.match.fillTo until amendment 41 deleted the fill: the constant
   * meaning "how many drones to top up to" was also the constant meaning "how
   * big is the ocean". Both are 20, so nothing observable moved.
   * zoneOverride (dev-only) reshapes the storm timeline
   * for smokes/tests, undefined => shipped CONFIG.zone.
   *
   * zoneSeeds: per-room, PER-RING server-private nonces for the ring streams
   * (amendment 10 + review FIX 2). mapSeed rides the welcome, so ring offsets
   * must NOT be derivable from it — and each ring gets its OWN independent
   * nonce so a revealed ring's geometry cannot be brute-forced back into a
   * shared stream state to precompute later rings. Non-deterministic entropy
   * is legal HERE (the I/O adapter, like the random map seed — never in
   * game/); the World stays pure and just consumes the seeds. Deliberately NOT
   * a dev option: nothing needs to pin rolls (smokes assert ring structure,
   * not specific offsets). Split out of onCreate so tests can pin that the
   * world actually receives caller-supplied seed material.
   */
  private buildWorld(seed: number, sanitized: SanitizedRoomOptions): World {
    const zoneCfg = sanitized.zoneOverride ?? CONFIG.zone;
    const zoneSeeds = Array.from({ length: zoneGroups(zoneCfg) }, () => (Math.random() * 0xffffffff) >>> 0);
    // Radar realism cycle (amendment 63): the two SERVER-SIDE mode flags.
    // process.env is read HERE, in the adapter — never in game/ (the
    // resolveTickErrorTolerance seam); the resolvers are pure and FAIL-SAFE
    // (unrecognized/absent values => today's behavior, never fail-open). The
    // pseudonym seed is fresh per-room adapter entropy (the zoneSeeds
    // posture): track ids must never be derivable from the client-known
    // mapSeed.
    return new World(seed, CONFIG.map.playerCap, zoneCfg, {
      zoneSeeds,
      radarGrammar: resolveRadarGrammar(process.env.HC_RADAR_GRAMMAR),
      radarIdentity: resolveRadarIdentity(process.env.HC_RADAR_IDENTITY),
      pseudonymSeed: (Math.random() * 0xffffffff) >>> 0,
    });
  }

  /**
   * Best-effort diagnostic: log a warning and swallow anything the logging
   * itself throws (the room.requeueBroadcastFailed posture — a report must
   * never become a second failure).
   */
  private warnQuietly(event: string, err: unknown): void {
    try {
      this.log.warn(event, describeError(err));
    } catch {
      /* diagnostics are best-effort */
    }
  }

  /**
   * Publish this room's listing metadata for `GET /liveness` — ONLY WHEN A
   * VALUE CHANGED, the same discipline (and the same un-latching `.catch`)
   * StandardQueueRoom.publishListing uses. Never on a tick: setMetadata
   * persists to the matchmaker driver, and a 20 Hz room would turn that into a
   * write storm.
   *
   * WHY `humans` IS PUBLISHED AT ALL — the driver's own `clients` count is not
   * this room's population, it is its SEAT LEDGER, and it over-reports in two
   * ways that both land on the front page (verified in @colyseus/core 0.17.44
   * Room.mjs):
   *
   *   1. `#_decrementClientCount()` runs inside `#_onAfterLeave`, which for a
   *      room defining `onDrop` is deferred until the `allowReconnection()`
   *      promise settles. This room grants CONFIG.net.reconnectGraceSeconds
   *      (60), so a captain who closes their tab was still being counted as
   *      ONLINE a full minute later. That is the ordinary way a player leaves.
   *   2. `#_incrementClientCount()` runs inside `_reserveSeat` — the moment the
   *      queue reserves a seat, while the captain is still holding their queue
   *      socket — so every seat handoff double-counted a cohort.
   *
   * `this.clients` answers both: core pushes into it in `_onJoin` and deletes
   * from it at the TOP of `_onLeave` (before onDrop/onLeave run), and a
   * reserved-but-unjoined seat is never in it. So the count published here is
   * the number of humans actually connected to this room, right now.
   *
   * Both keys are written together as ONE object every time. setMetadata
   * shallow-merges, so a partial write would be safe — but writing the pair
   * keeps "what this room publishes" readable in one place.
   *
   * The catch is load-bearing, not decoration: a bare `void` on an async call
   * makes any failure an UNHANDLED REJECTION that fails the whole test file
   * around it. `setMetadata` dereferences core's `_listing`, which only the
   * matchmaker creates — so every unit test that constructs an ArenaRoom
   * directly (solo.test.ts et al) hits it — and against a remote driver a
   * persist can legitimately fail. A missing listing tag degrades /liveness's
   * per-mode split to 'standard' and its human count to the seat ledger; it
   * must never take the room down with it. Clearing the mirror on failure is
   * what makes the next change RETRY instead of believing it already published.
   */
  private publishListing(): void {
    const meta: ArenaListingMeta = { mode: this.mode, humans: this.clients.length };
    const prev = this.publishedListing;
    if (prev !== null && prev.mode === meta.mode && prev.humans === meta.humans) return;
    this.publishedListing = meta;
    void this.setMetadata(meta).catch((err: unknown) => {
      this.publishedListing = null;
      this.warnQuietly('room.modeMetadataFailed', err);
    });
  }

  /** The post-operability remainder of room creation (see onCreate's guard). */
  private finishCreate(input: SanitizedRoomOptions, seed: number): void {
    // SOLO VS AI (Story 6.5): a one-captain cohort. Both fields are DERIVED
    // here rather than taken from matchOverride — that is the dev-gated door,
    // and this is a production mode. expectedCaptains 1 is what makes the
    // boarding gate arm on the single human's join (and, below, what locks the
    // room at birth); minHumans 1 is what lets the countdown arm at all.
    const sanitized: SanitizedRoomOptions = input.solo ? { ...input, expectedCaptains: 1 } : input;
    // Regatta hue stream (Story 1.12): one mulberry32 per room, decorrelated from
    // mapgen/spawn/upgrade/drone streams by a fresh mixing constant.
    this.hueRng = mulberry32((seed ^ 0xc2b2ae35) >>> 0);
    if (!sanitized.matchOverride?.sandbox) {
      this.match = new Match(this.world, this.timings(sanitized), this.matchHooks());
    }
    // A QUEUE-FORMED room is SEALED FROM BIRTH (Eric ruling 2026-08-15: "No more
    // late arrivals"). expectedCaptains is set only by StandardQueueRoom, and it
    // means the cohort was fixed at the instant the queue formed — so the room is
    // locked here rather than at startCountdown, and Match never unlocks it again.
    //
    // Locking does NOT interfere with the seats the queue is about to reserve:
    // _reserveSeat checks maxClients and never consults `locked`, and the join
    // path consumes a reservation without testing it either. Verified against
    // @colyseus/core 0.17.10.
    //
    // In production this is defence in depth — ArenaRoom.onAuth already refuses
    // every direct join without HC_DEV_OPTIONS — but it makes the guarantee
    // STRUCTURAL rather than a property of one door being shut.
    if (sanitized.expectedCaptains !== undefined) void this.lock();

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;
    // Idle full-map ring until the match activates and anchors the storm
    // timeline (center 0,0 is the schema default; next stays zeroed/unrevealed).
    this.state.zoneCurR = this.world.map.radius;

    // THE BOTS MUST BE IN THE WATER BEFORE THE FIRST TICK (Story 6.5). Not a
    // preference — a correctness requirement: Match.activate() snapshots its
    // participants from world.ships and checkWin() runs in that SAME update(),
    // so a roster holding only the human latches an instant victory, and any
    // bot arriving after that snapshot sinks unrecorded (recordSink refuses ids
    // outside it). Building here — before setSimulationInterval below — is what
    // makes "before activate" structural rather than a race.
    if (sanitized.solo) this.buildBotFleet();

    // LISTING metadata for /liveness (Story 6.6). This is the ONLY place the
    // arena's mode is written down, and it goes on the ROOM LISTING — never
    // into the World, the Match or anything under game/, which still never
    // learns what kind of door created it (Story 6.5's boundary).
    //
    // FREE at create time: setMetadata skips its driver.persist while
    // `_internalState` is CREATING, and core only flips that to CREATED after
    // onCreate returns (@colyseus/core 0.17.44 MatchMaker.mjs:298). It mutates
    // `_listing` in place, and the create-time `driver.persist(listing, true)`
    // that runs right after onCreate carries the metadata with it. So this
    // costs zero extra driver writes — one write, as before.
    this.mode = sanitized.solo ? 'soloVsAi' : 'standard';
    this.publishListing();

    this.onMessage(MSG.input, (client: Client, raw: unknown) => this.onInputMessage(client, raw));
    this.onMessage(MSG.spend, (client: Client, raw: unknown) => this.onSpendMessage(client, raw));
    this.onMessage(MSG.ping, (client: Client, raw: unknown) => this.onPongMessage(client, raw));

    this.setSimulationInterval((dt) => this.update(dt), INTERVAL_MS);
    // D1 RTT loop: ping every connected client on the room clock. The 'p'
    // channel rides the room-wide transport guard only (never the input store).
    this.clock.setInterval(() => this.sendPings(), CONFIG.net.pingIntervalMs);
  }

  /**
   * One ping sweep: send MSG.ping {n, t: world.now} to every fully-JOINED
   * client, recording the REAL send time per nonce (RTT is transport latency —
   * wall clock, not sim clock). The outstanding map is bounded: a client that
   * never echoes sheds its oldest nonces past MAX_OUTSTANDING_PINGS.
   *
   * Every sweep ALSO re-pushes the estimator's windowed min into the World, so
   * window expiry reaches the D1 clamp even when a client stops echoing
   * entirely (estimator drains to null => zero compensation) — staleness must
   * never be gated on the next pong that may never come.
   *
   * ACCEPTED RESIDUAL (flagged for Eric): a client that CONTINUOUSLY delays
   * only its pong echoes can present as a high-latency client and bank
   * compensation up to the ratified 150ms ceiling — bounded by design (AR3's
   * accepted envelope; indistinguishable from, and equivalent to, genuinely
   * routing through a slow link).
   */
  private sendPings(): void {
    for (const client of this.clients) {
      if (client.state !== ClientState.JOINED) continue;
      const st = this.pingStateFor(client.sessionId);
      st.nonce += 1;
      st.outstanding.set(st.nonce, performance.now());
      while (st.outstanding.size > MAX_OUTSTANDING_PINGS) {
        const oldest = st.outstanding.keys().next().value;
        if (oldest === undefined) break;
        st.outstanding.delete(oldest);
      }
      client.send(MSG.ping, { n: st.nonce, t: this.world.now });
      // Estimator timestamps ride the sim clock (see onPongMessage's addSample),
      // so the expiry probe must too.
      this.world.setRtt(client.sessionId, st.estimator.minMs(this.world.now));
    }
  }

  private pingStateFor(sessionId: string): PingState {
    let st = this.pings.get(sessionId);
    if (!st) {
      st = { estimator: new RttEstimator(CONFIG.net.rttWindowMs), nonce: 0, outstanding: new Map() };
      this.pings.set(sessionId, st);
    }
    return st;
  }

  /**
   * PongMsg echo ('p'): pair the nonce with its recorded send time for one RTT
   * sample, then push the estimator's windowed min into the World for the D1
   * fire-time clamp. Unknown/stale/duplicate nonces (already consumed or
   * pruned) and malformed payloads are ignored — fail-closed, no state change.
   */
  private onPongMessage(client: Client, raw: unknown): void {
    this.metrics?.recordMessage();
    const st = this.pings.get(client.sessionId);
    const n = (raw as { n?: unknown } | null)?.n;
    if (!st || typeof n !== 'number') return;
    const sentAt = st.outstanding.get(n);
    if (sentAt === undefined) return; // unknown or stale nonce
    st.outstanding.delete(n);
    st.estimator.addSample(performance.now() - sentAt, this.world.now);
    this.world.setRtt(client.sessionId, st.estimator.minMs(this.world.now));
  }

  /**
   * Story 0.3 wiring: match identity, the bound room logger (every line
   * carries roomId/matchId/mode plus the live tick), the console.warn →
   * logWarn migration for rejected dev options, metrics registration, and
   * the tick-error tolerance. process.env is read HERE, in the adapter —
   * never in game/ (resolveTickErrorTolerance stays pure).
   */
  private initOperability(rejectedKeys: string[]): void {
    this.matchId = generateId();
    this.log = createLogger(
      { roomId: this.roomId, matchId: this.matchId, mode: MODE },
      () => ({ tick: this.world.tick }),
    );
    if (rejectedKeys.length > 0) {
      this.log.warn('room.devOptionsRejected', { rejected: rejectedKeys });
    }
    this.metrics = registerRoom(this.roomId);
    this.tickErrorTolerance = resolveTickErrorTolerance(
      process.env.HC_TICK_ERROR_TOLERANCE,
      process.env.NODE_ENV === 'production',
    );
    this.log.info('room.create', { tolerance: this.tickErrorTolerance });
  }

  /** Raw "i" input → World's input store (fail-closed validation lives there).
   * Counted at the top: even a malformed message is transport pressure. */
  private onInputMessage(client: Client, raw: unknown): void {
    this.metrics?.recordMessage();
    this.world.submitInput(client.sessionId, raw);
  }

  /**
   * Discrete spend message (NOT on the per-tick InputMsg: latest-wins
   * coalescing would drop back-to-back spends; WS ordering gives FIFO for
   * free). All validation lives in spendPoint (fail-closed, unit-testable
   * without Colyseus); spends are bounded by banked points, so no per-channel
   * cap — only the room-wide transport guard (maxMessagesPerSecond) applies.
   */
  private onSpendMessage(client: Client, raw: unknown): void {
    this.metrics?.recordMessage();
    this.world.spendPoint(client.sessionId, (raw as { choice?: unknown } | null)?.choice);
  }

  /**
   * The room's lifecycle timings. `expectedCaptains` is the ONE field that is
   * not an override: it arrives from the QUEUE at createRoom (already clamped
   * by sanitizeExpectedCaptains) and switches the room into amendment 8's
   * boarding behavior. Absent — which is every direct joinOrCreate, every
   * headless smoke and every test — the Match runs exactly as it shipped.
   */
  private timings(sanitized: SanitizedRoomOptions): MatchTimings {
    const override = sanitized.matchOverride;
    const base = defaultTimings();
    return {
      countdownMs: override?.countdownMs ?? base.countdownMs,
      resultsMs: override?.resultsMs ?? base.resultsMs,
      joinWindowMs: override?.joinWindowMs ?? base.joinWindowMs,
      // ONE human is the whole cohort in a Solo vs AI room (Story 6.5), so the
      // countdown must arm at one. minHumans is a PEOPLE count and stays one:
      // the nineteen bots are participants, never humans, and never advance it.
      // A dev matchOverride still wins, so no smoke's timings moved.
      minHumans: override?.minHumans ?? (sanitized.solo ? 1 : undefined),
      expectedCaptains: sanitized.expectedCaptains,
      boardingGraceMs: base.boardingGraceMs,
    };
  }

  /** The Match state machine's side effects, implemented on the room. */
  private matchHooks(): MatchHooks {
    return {
      lock: () => void this.lock(),
      unlock: () => void this.unlock(),
      // (The drone-fill hook is GONE — Story 5.6, amendment 41 deleted the
      // match-start fill outright. PvE fleets are world content on their own
      // wave clock inside the World, hold no PlayerMeta row, and never top up
      // a roster.)
      broadcastResults: (msg: ResultsMsg) => {
        // Cache before broadcasting (finding F2): a captain in grace isn't in
        // this.clients, so onDrop's resume handler re-sends this to them.
        this.lastResults = msg;
        this.broadcast(MSG.results, msg);
        // Match.finish() is the only caller — the one finish hook, so this is
        // where match.end telemetry is emitted (story 0.3).
        this.emitMatchEnd();
      },
      // Story 6.3 (epic-6 amendments 15/17/18): the cohort-collapse signal, fired
      // by Match immediately BEFORE the disconnect it annotates. BEST-EFFORT AND
      // NEVER LOAD-BEARING — the broadcast is wrapped because the disconnect that
      // follows it is unconditional, and a transport failure here must not throw
      // out of notifyRosterChanged and strand a room that can never refill. An
      // undelivered signal costs the survivor a PLAY press and nothing else.
      requeue: () => {
        const msg: RequeueMsg = { reason: 'cohortLost' };
        try {
          this.broadcast(MSG.requeue, msg);
        } catch (err) {
          // THE HANDLER MUST BE TOTAL TOO (review gate). A guard whose CATCH
          // can throw is not a guard: `String(err)` itself throws for a
          // prototype-less or hostile value (`throw Object.create(null)`), and
          // so can a broken logger — either would escape notifyRosterChanged
          // ahead of the unconditional disconnect() and strand a sealed room
          // that can never refill, which is the ONE failure this wrapper
          // exists to prevent. `describeError` is the shipped total renderer
          // (see its docstring — the tick-error containment needs the same
          // property); the inner catch covers the log CALL, and is empty
          // because there is by then nothing left that can safely speak.
          try {
            this.log.warn('room.requeueBroadcastFailed', describeError(err));
          } catch {
            /* diagnostics are best-effort; the disconnect behind us is not */
          }
        }
      },
      disconnect: () => void this.disconnect(),
    };
  }

  /** The hue indices the roster currently holds (Story 1.12) — the `used` set for
   *  assignHue. Skips the 255 sentinel, which since Story 5.6 only ever marks a
   *  not-yet-assigned entry: PvE fleet hulls hold no roster row at all
   *  (amendment 39), so they never reach the wheel to be excluded from it. */
  private usedHues(): Set<number> {
    const used = new Set<number>();
    this.state.players.forEach((meta: PlayerMeta) => {
      if (meta.color !== REGATTA_NO_HUE) used.add(meta.color);
    });
    return used;
  }

  /**
   * FILL THE ROSTER WITH AI CAPTAINS (Story 6.5) — the whole server side of
   * Solo vs AI. `CONFIG.map.playerCap - 1` bots, so the ocean holds a full
   * lobby with the one human: the count is DERIVED from the cap rather than
   * being a new constant, which keeps it in step with the spawn lattice (also
   * exactly playerCap candidates) and with the map radius, which is sized off
   * the same number.
   *
   * A BOT GETS A ROSTER ROW, and that is the point of the story. `syncRoster()`
   * walks `state.players`, and every identity surface downstream of it —
   * `n AFLOAT`, the death banner's placement, hull colour, nameplates, the kill
   * feed, the kill-leader register — reads that map. Without a row the player
   * meets nineteen amber-hollow, plateless UNKNOWN VESSELs while the chrome bar
   * insists `1 AFLOAT`. With one, every surface works unmodified.
   */
  private buildBotFleet(): void {
    const order = this.shuffledClasses();
    const count = CONFIG.map.playerCap - 1;
    for (let i = 0; i < count; i += 1) {
      const rec = this.world.addBot(order[i % order.length]);
      const meta = new PlayerMeta();
      meta.id = rec.id;
      meta.name = rec.name;
      // A REAL REGATTA HUE, never REGATTA_NO_HUE (255): that sentinel is the
      // drone-grey mark, and an AI captain wearing it renders as PvE content.
      // The wheel is exactly 20 and 19 bots + 1 human consume it precisely.
      meta.color = assignHue(this.usedHues(), undefined, this.hueRng, i + 1);
      this.state.players.set(rec.id, meta);
    }
    this.log.info('room.botFleet', { bots: count });
  }

  /**
   * The class-dealing order for a bot fleet: the three hulls, shuffled ONCE per
   * room off the room's seeded stream. Dealt round-robin (6/6/7 across 19) this
   * fields all three silhouettes in every solo match — which matters because
   * this mode is most players' first match, and nineteen independent uniform
   * draws land lopsided often enough that a field of nine battleships is an
   * ordinary result. The shuffle is what keeps the same class from always
   * taking the odd seat, and it is seeded (never Math.random) like every other
   * roll the room makes.
   */
  private shuffledClasses(): ShipClassId[] {
    const out = [...SHIP_CLASS_IDS];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.hueRng.int(0, i);
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /**
   * A joining captain's personal hue, with the BOT SWAP (Story 6.5).
   *
   * The ordinary FCFS rule (assignHue) is unchanged and still decides
   * everything: a free preference is granted verbatim, a contested one falls to
   * the nearest free hue, no preference draws a random free one. What is new is
   * the case that only exists in a bot lobby — the fleet was hued before the
   * player arrived, so an AI captain may already be flying the colour the
   * player chose. A bot has no preference to defend, so the two SWAP: the
   * player keeps their choice and the bot takes the hue the player would
   * otherwise have flown. The wheel stays a bijection (exactly 20 hues, 20
   * hulls) and no third party is disturbed — a hue held by a HUMAN is never
   * taken, so the FCFS contest between two players is byte-identical.
   */
  private resolveJoinerHue(pref: number | undefined): number {
    const hue = assignHue(this.usedHues(), pref, this.hueRng, this.joinCounter);
    if (pref === undefined || hue === pref) return hue;
    const holder = this.botMetaWithHue(pref);
    if (!holder) return hue; // a human holds it — FCFS stands
    holder.color = hue;
    return pref;
  }

  /** The roster row of a BOT flying `hue`, or null (a human's row is never
   *  returned — see resolveJoinerHue). */
  private botMetaWithHue(hue: number): PlayerMeta | null {
    let found: PlayerMeta | null = null;
    this.state.players.forEach((meta: PlayerMeta, id: string) => {
      if (found !== null || meta.color !== hue) return;
      if (this.world.ships.get(id)?.role === 'bot') found = meta;
    });
    return found;
  }

  /**
   * Redraw any BOT whose callsign matches the joining captain's (Story 6.5),
   * case-insensitively. The redraw walks the controller's without-repeat order,
   * so it lands on a name nothing else is flying; the bounded retry covers the
   * degenerate case where the very next name also matches the player. The bot's
   * hull, mind, profile and deck are untouched — this is a name and nothing
   * else, and the roster row is re-pointed at the new one.
   */
  private resolveCallsignCollision(name: string): void {
    const key = name.toUpperCase();
    const id = this.botIdNamed(key);
    if (id === null) return;
    for (let i = 0; i < CALLSIGN_REDRAWS; i += 1) {
      const next = this.world.renameBot(id);
      if (next === null || next.toUpperCase() !== key) break;
    }
    const meta = this.state.players.get(id);
    const rec = this.world.ships.get(id);
    if (meta && rec) meta.name = rec.name;
  }

  /** The id of a bot flying `upper` (an already-uppercased callsign), or null. */
  private botIdNamed(upper: string): string | null {
    for (const s of this.world.ships.values()) {
      if (s.role === 'bot' && s.name.toUpperCase() === upper) return s.id;
    }
    return null;
  }

  /**
   * The WelcomeMsg payload, built identically for BOTH doors (Story 6.7): the
   * join at `onJoin`, and the RE-SEND at `onReconnect` that lets a refreshed
   * page render at all. Everything here is either per-seat-immutable
   * (`sessionId`, `mapSeed`, `mapRadius`, `playerCap`, the two radar modes) or
   * read live at send time (`t` off `this.world.now`), so the payload is valid
   * mid-match on either path. Nothing phase-dependent belongs here — match
   * phase, countdown, zone, roster and bounty all live in `ArenaState`, which
   * core re-sends in full on the resume ack.
   *
   * NO WIRE CHANGE: this is the shipped message, byte-identical, reached from a
   * second lifecycle hook (PROTOCOL_VERSION stays 40 — amendment-24 precedent,
   * matching the MSG.results re-send in onDrop's resume branch).
   *
   * DELIBERATELY NOT a shared join helper: the ship-spawn half of onJoin
   * (`world.addShip`, the roster row, the hue draw) must stay EXCLUSIVELY on
   * the join path. Core calls onReconnect INSTEAD OF onJoin, and re-running any
   * of it would spawn a second hull for one captain.
   */
  private buildWelcome(sessionId: string): WelcomeMsg {
    return {
      sessionId,
      mapSeed: this.state.mapSeed,
      mapRadius: this.world.map.radius,
      playerCap: this.world.playerCap,
      t: this.world.now,
      config: CONFIG,
      // The room's radar modes (amendment 63) — the ONLY place they travel;
      // blips themselves are tagless and the client narrows on these.
      radarGrammar: this.world.radarGrammar,
      radarIdentity: this.world.radarIdentity,
    };
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    // SECURITY (Story 2.3, deferred-work 127/130): options.name arrives verbatim
    // from joinOrCreate. sanitizeName type-guards it (a non-string used to THROW
    // on .trim()), trims it, and caps it at NAME_MAX code points; undefined ⇒
    // the CAPTAIN-n fallback.
    const name = sanitizeName(options.name) ?? `CAPTAIN-${this.joinCounter}`;
    const classId = sanitizeClassId(options.cls);
    // Foghorn variant (Story 4.5): sanitized HERE like cls — a plain identity
    // option, never a dev override — and handed straight to the ship record.
    // Fail-open to 'standard'; no roster/PlayerMeta field (amendment 52).
    const horn = sanitizeHornId(options.horn);
    // A bot fleet was drawn BEFORE this captain arrived (Story 6.5), so its
    // callsigns were picked without knowing the player's. A shared name would
    // print two identical hulls in one kill feed with no way to tell them
    // apart — redraw the bot, never the player.
    this.resolveCallsignCollision(name);

    // A joining CLIENT is always a captain (Story 6.3's role seam, amendment
    // 13): the socket is the proof. Fleet hulls are world content spawned by
    // World itself and never reach this door; Story 6.4's AI captains will not
    // either.
    this.world.addShip(client.sessionId, name, 'captain', classId, horn);

    // Sandbox mode only (dev smokes): pre-lifecycle interim behavior — the
    // storm starts when the 2nd ship joins. The real lifecycle anchors the
    // zone at the countdown->active transition instead (game/match.ts).
    if (!this.match && this.world.ships.size >= 2) this.world.startZone();

    const meta = new PlayerMeta();
    meta.id = client.sessionId;
    meta.name = name;
    // Regatta Hoist (Story 1.12): assign a unique personal hue FCFS at join.
    // `used` is every hue the roster already holds. Since Story 5.6 the roster
    // is CAPTAINS ONLY (amendment 39), so no sentinel entry can occupy a wheel
    // index — fleet hulls never get a row at all.
    // `joinCounter` feeds ONLY assignHue's defensive exhaustion fallback (wheel
    // full → joinOrder % 20); at cap 20 the wheel always has a free hue first.
    meta.color = this.resolveJoinerHue(sanitizeColorPref(options.colorPref));
    this.state.players.set(client.sessionId, meta);

    client.send(MSG.welcome, this.buildWelcome(client.sessionId));

    this.match?.notifyRosterChanged();

    this.log.info('client.join', { sessionId: client.sessionId });
    this.armJoiningDeadline(client);
    // /liveness (Story 6.6): the population moved. Publish-on-change, so a room
    // whose roster is stable never writes to the driver again.
    this.publishListing();
  }

  /**
   * Resume door (Story 6.7). Core calls this INSTEAD OF onJoin on the
   * reconnection branch (verified in @colyseus/core 0.17.44 Room.mjs:693-701 —
   * `isWaitingReconnection` short-circuits the onJoin path entirely), so the
   * seat, the ship, the roster row, the hue and the input store all still exist
   * and NOTHING here may re-create any of them: a second `world.addShip` would
   * give one captain two hulls.
   *
   * All this does is RE-SEND the welcome. Until Story 6.7 the payload was
   * unreachable outside onJoin, so a client whose JS heap died — a page refresh
   * — resumed into a socket that would never tell it its own sessionId or the
   * map seed, and could render nothing. An in-page resume gets it too (core
   * makes no distinction) and ignores it idempotently.
   *
   * Sending to a still-RECONNECTING/JOINING client is safe: the message
   * enqueues and flushes on the JOIN_ROOM ack, exactly like the MSG.results
   * re-send in onDrop's resume branch.
   *
   * TOTAL BY CONSTRUCTION. Core wraps this rethrow-true (Room.mjs:1129-1130)
   * and its own catch answers a throw with `_onLeave(FAILED_TO_RECONNECT)` — so
   * an exception here does not degrade the resume, it ABORTS it. A captain who
   * reconnected successfully must never lose the seat to a diagnostic failure,
   * so this takes the warnQuietly posture every other room hook uses.
   */
  onReconnect(client: Client): void {
    try {
      client.send(MSG.welcome, this.buildWelcome(client.sessionId));
    } catch (err) {
      this.warnQuietly('client.resumeWelcomeFailed', err);
    }
  }

  /**
   * JOINING-deadline kick (story 0.3, deferred-work pickup). Core pushes the
   * client into `this.clients` BEFORE onJoin runs, and the client stays
   * ClientState.JOINING until its JOIN_ROOM ack arrives over the wire
   * (verified in @colyseus/core 0.17 Room._onJoin → _onMessage) — so a client
   * that never completes the handshake holds a roster slot and an unbounded
   * `_enqueuedMessages` buffer forever. Arm an unconditional per-client
   * deadline and decide at FIRE time (race-free: a client that reached JOINED
   * is untouchable, and one that already left fails the `this.clients` check).
   * No explicit clearing needed: room clock timers are cleared by core on
   * dispose (`#_dispose` → `clock.clear()`), and a story-0.2 resume never
   * re-runs onJoin (core's reconnection branch calls onReconnect only), so a
   * resumed client never arms a fresh deadline.
   */
  private armJoiningDeadline(client: Client): void {
    this.clock.setTimeout(
      () => this.kickIfStillJoining(client),
      CONFIG.net.joiningDeadlineSeconds * 1000,
    );
  }

  private kickIfStillJoining(client: Client): void {
    if (client.state === ClientState.JOINED || !this.clients.includes(client)) return;
    this.log.warn('client.joiningKick', { sessionId: client.sessionId });
    // Punitive close: WITH_ERROR (4002) is NOT in RECONNECTABLE_CLOSE_CODES,
    // so onDrop routes the kick straight to teardown — no grace window, the
    // roster slot and enqueued-message buffer are freed immediately.
    client.leave(CloseCode.WITH_ERROR);
  }

  /**
   * Reconnect gate (story 0.2). With onDrop defined, Colyseus routes EVERY
   * non-consented close here first, passing the WebSocket close code as the 2nd
   * argument. Only GENUINE abnormal/network drops (RECONNECTABLE_CLOSE_CODES —
   * exactly the set the SDK auto-reconnects on) earn a grace window; PUNITIVE
   * closes get NO grace (finding F1). A rate-limit / malformed-message kick
   * closes WITH_ERROR 4002 — since matchMaker.reconnect() bypasses onAuth, a
   * kicked client still holding its reconnectionToken could otherwise walk
   * right back in, or stall the endgame as a headless ghost; so 4002 (and
   * server shutdown, etc.) falls through to immediate teardown. Consented
   * leaves (room.leave(true) → 4000) skip onDrop entirely and go straight to
   * onLeave.
   *
   * Policy (pure, see game/match.ts dropPolicy): a reconnectable-close,
   * active-match participant whose hull is still afloat gets a grace window —
   * the ship keeps sailing under its last stored input (only World.removeShip
   * clears the input store) as a visible, huntable participant that still
   * counts in the win check. Everyone else falls through to immediate teardown.
   *
   * Teardown ordering, verified against the installed @colyseus/core 0.17
   * Room.ts (_onLeave → #_onAfterLeave):
   * - 'teardown': we do NOTHING here — core always invokes onLeave right
   *   after an onDrop that set up no reconnection.
   * - 'hold': core defers; on grace expiry / rejection / room dispose it
   *   invokes onLeave (running the teardown), while a successful resume marks
   *   the old client RECONNECTED and skips onLeave entirely. Server side of a
   *   resume is otherwise a no-op: the same-Room client kept its listeners
   *   and per-tick frames resume via afterStep once the ack lands (state
   *   JOINED). Two things the ack alone does NOT carry are re-sent by hand:
   *   the one-time results broadcast (finding F2, below — a captain who
   *   resumes during the results window missed it), and the welcome
   *   (onReconnect, Story 6.7 — a PAGE REFRESH lost its JS heap and has no
   *   sessionId or map seed to render with).
   * If the ship is sunk DURING the grace window, the pending reconnection is
   * left untouched — a resuming client lands in the normal post-death flow
   * (spectator frames), and Match.recordSink's dedupe keeps the real combat
   * placement when teardown eventually runs.
   */
  onDrop(client: Client, code?: number): void {
    // THE 60-SECOND OVER-COUNT ENDS HERE (Story 6.6). Core deletes the client
    // from `this.clients` at the top of `_onLeave`, before this runs, but it
    // does NOT decrement the driver's own listing count until the
    // allowReconnection() promise below settles — a full
    // CONFIG.net.reconnectGraceSeconds later. Publishing now is what makes
    // `PLAYERS ONLINE` drop when the tab closes rather than a minute after.
    this.publishListing();
    const ship = this.world.ships.get(client.sessionId);
    const policy = dropPolicy(
      this.match?.phase === 'active',
      ship !== undefined,
      ship !== undefined && isAfloat(ship.lifecycle),
      RECONNECTABLE_CLOSE_CODES.has(code ?? -1),
    );
    if (policy === 'hold') {
      // `code ?? null` so the close code ALWAYS survives JSON.stringify —
      // undefined would silently drop the field and lose the forensics.
      this.log.info('client.drop', { sessionId: client.sessionId, code: code ?? null });
      this.allowReconnection(client, CONFIG.net.reconnectGraceSeconds)
        .then((newClient) => {
          this.log.info('client.resume', { sessionId: client.sessionId });
          // The resume branch pushes the new client into `this.clients` without
          // re-running onJoin, so this is the only place that can put the
          // recovered captain back into the published count.
          this.publishListing();
          // Finding F2: results fire as a one-shot broadcast the dropped client
          // missed (not in this.clients). Re-send only if the match finished
          // while they were away; a normal mid-match resume sends nothing. The
          // send enqueues on the not-yet-acked client and flushes on ack.
          if (this.lastResults) newClient.send(MSG.results, this.lastResults);
          // The resume path never re-runs onJoin (core's reconnection branch
          // pushes THIS new client object into this.clients still JOINING and
          // only flips it JOINED on its ack) — so it needs its own
          // JOINING-deadline, or a resumed client that never acks squats
          // forever: roster slot held, ship counted in the win check,
          // enqueued-message buffer growing. Same fire-time-checked kick.
          this.armJoiningDeadline(newClient);
        })
        // Finding F3: defensive — the deferred REJECTS on grace expiry / room
        // dispose. Core routes that into onLeave → teardown (Room.ts _onLeave,
        // ~1750), and @colyseus/core 0.17.44 already attaches its own internal
        // rejection handler, so the installed version never leaks an
        // unhandledRejection. This catch is belt-and-suspenders against a
        // future core patch dropping that guarantee, and also swallows the
        // rejection on the promise reference we retain via .then() above.
        .catch(() => undefined);
    }
  }

  onLeave(client: Client, code?: number): void {
    // Covers every departure onDrop does not: a CONSENTED leave (code 4000
    // routes straight here), a reconnection that expired, and room dispose.
    // Idempotent by publish-on-change, so the drop→leave pair costs one write.
    this.publishListing();
    // Log only when the teardown actually removed something: with onDrop
    // defined, core can route one departure into onLeave through several
    // paths, and a repeat must stay silent (one info line per real leave).
    // The close code (core passes it — Room._onLeave) distinguishes punitive
    // kicks (4002) from organic leaves on stdout; null when core omits it.
    if (this.teardown(client.sessionId)) {
      this.log.info('client.leave', { sessionId: client.sessionId, code: code ?? null });
    }
  }

  /**
   * The one leave teardown path (story 0.2): match-recorded removal (or bare
   * removeShip in sandbox rooms) + roster delete. IDEMPOTENT by presence
   * guard — with onDrop defined, core can reach onLeave through several
   * routes (immediate after onDrop, deferred after a failed reconnection,
   * room dispose), and Match.onPlayerLeave/removeShip on an already-removed
   * id must stay a no-op. recordSink's dedupe additionally keeps the real
   * combat placement for a ship sunk during its grace window.
   *
   * This OR-shaped guard silently rests on TWO contracts (finding F5):
   *   1. Match.onPlayerLeave / World.removeShip tolerate a repeat call on an
   *      id already removed (both are no-ops on a missing id) — so even if a
   *      race let two teardowns past the guard, no double-record occurs.
   *   2. Colyseus never reuses a sessionId within one room's lifetime — so a
   *      stale teardown can never collide with a genuinely new occupant of the
   *      same id (a resuming client keeps its ORIGINAL sessionId, and core
   *      generates fresh ids per seat reservation).
   */
  private teardown(sessionId: string): boolean {
    // A seat already torn down and now holding its scuttled hull's window is
    // DONE — this guard is what keeps teardown strictly idempotent while the
    // roster row is deliberately still present.
    if (this.departing.has(sessionId)) return false;
    if (!this.state.players.has(sessionId) && !this.world.ships.has(sessionId)) return false;
    // Match owns ship removal so a mid-match departure is recorded for
    // placement (sunk-at-leave-time) before the win check runs.
    if (this.match) this.match.onPlayerLeave(sessionId);
    else this.world.removeShip(sessionId);
    this.pings.delete(sessionId); // D1 ping/RTT state dies with the seat
    // THE SCUTTLE LEAVES THE HULL ON THE WATER (Story 6.7): when onPlayerLeave
    // sank it rather than removing it, the roster row must outlive the seat
    // until the wreck is reaped, or the `sunk` event framed next tick has no
    // name to resolve. Every other departure still releases the row here.
    if (this.world.ships.has(sessionId)) {
      this.departing.add(sessionId);
      return true;
    }
    this.state.players.delete(sessionId);
    return true;
  }

  /**
   * Release seats whose scuttled hull has been reaped (Story 6.7). Runs every
   * step, right after Match.reapDeparted() has had its chance at the founder
   * edge — so the row survives exactly as long as the hull does, and no longer.
   * `force` releases regardless (dispose): the seat is never held past the room.
   */
  private releaseDeparted(force = false): void {
    for (const id of this.departing) {
      if (!force && this.world.ships.has(id)) continue;
      this.departing.delete(id);
      this.state.players.delete(id);
    }
  }

  /** Fixed-step accumulator: drain whole SIM_DTs, frame out after each step. */
  private update(dtMs: number): void {
    // Once a tick-error abort fired, stop attempting steps entirely — the
    // simulation interval keeps firing until this.disconnect() finishes
    // disposing the room, and re-stepping a broken world would just re-throw.
    if (this.aborting) return;
    this.accumulator = Math.min(this.accumulator + dtMs, MAX_ACCUMULATED_MS);
    while (this.accumulator >= SIM_DT_MS) {
      this.accumulator -= SIM_DT_MS;
      if (!this.runStep()) return;
    }
  }

  /**
   * One guarded sim step (story 0.3 tick-error containment): the whole step
   * body — world.step + match.update + afterStep — is the failure unit. A
   * clean step resets the consecutive-failure counter and feeds the metrics
   * registry; a throw is contained at this boundary so sibling rooms in the
   * process keep ticking. Returns false when the step failed — the caller
   * stops draining either way (below tolerance the backlog was dropped, at
   * tolerance the room is aborting).
   */
  private runStep(): boolean {
    const start = performance.now();
    try {
      this.world.step(SIM_DT_MS);
      this.match?.update();
      this.observeMatchActivation();
      this.afterStep();
    } catch (err) {
      this.onTickError(err);
      // Stop draining this update() call on ANY failure (below tolerance the
      // accumulator was dropped; at tolerance the room is aborting).
      return false;
    }
    this.consecutiveTickErrors = 0;
    this.recordStepTiming(performance.now() - start);
    return true;
  }

  /**
   * One-shot, truthful match.activate line: observed AFTER match.update()
   * returned with the transition complete. If activation throws mid-way, the
   * step's catch runs instead and nothing is claimed on stdout.
   */
  private observeMatchActivation(): void {
    if (this.matchActivateLogged || this.match?.phase !== 'active') return;
    this.matchActivateLogged = true;
    this.log.info('match.activate', {});
  }

  /**
   * Contained tick-failure handling. NOTHING may escape this method into
   * core's bare setInterval — a secondary throw (broken logger, poisoned
   * error value) still aborts the room, silently.
   */
  private onTickError(err: unknown): void {
    try {
      this.consecutiveTickErrors += 1;
      // Drop the backlog: a failed tick's accumulated debt is meaningless,
      // and re-draining it would let one stalled update() call burn through
      // the whole tolerance with zero real time between "retries". Each
      // interval fire contributes at most ONE consecutive failure.
      this.accumulator = 0;
      this.log.error('tick.error', {
        ...describeError(err),
        consecutive: this.consecutiveTickErrors,
        tolerance: this.tickErrorTolerance,
      });
      if (shouldAbortOnTickError(this.consecutiveTickErrors, this.tickErrorTolerance)) {
        this.abortOnTickErrors();
      }
    } catch {
      // Belt-and-braces: set the abort state and dispose WITHOUT logging.
      this.aborting = true;
      try {
        void this.disconnect();
      } catch {
        // Swallow — core's own dispose paths remain the last resort.
      }
    }
  }

  private abortOnTickErrors(): void {
    if (this.aborting) return;
    this.aborting = true; // set BEFORE disconnect: guards re-entry from later interval fires
    // Spec: match.abort marks a match that REACHED 'active' terminating
    // without finish() — waiting/countdown tick-error disposes emit only
    // tick.error + room.dispose. (A finished match is already suppressed by
    // emitMatchAbort's matchEndEmitted guard.)
    if (this.match?.phase === 'active') this.emitMatchAbort('tick-error');
    void this.disconnect();
  }

  /** Per-step metrics feed + the HC_DEBUG once-per-second tick summary. */
  private recordStepTiming(durationMs: number): void {
    this.metrics?.recordTick(durationMs);
    this.debugSteps += 1;
    this.debugTotalMs += durationMs;
    if (durationMs > this.debugMaxMs) this.debugMaxMs = durationMs;
    const now = Date.now();
    if (now < this.debugWindowStart + 1000) return;
    // Field assembly here is three scalars once per second — cheap enough to
    // build unconditionally; logDebug drops the line when HC_DEBUG !== '1'.
    this.log.debug('tick.summary', {
      steps: this.debugSteps,
      avgMs: Math.round((this.debugTotalMs / this.debugSteps) * 100) / 100,
      maxMs: Math.round(this.debugMaxMs * 100) / 100,
    });
    this.debugSteps = 0;
    this.debugTotalMs = 0;
    this.debugMaxMs = 0;
    this.debugWindowStart = now;
  }

  /**
   * `match.end` telemetry — exactly once, from the finish hook. Mutual
   * exclusion with match.abort (story 0.3): a tick-error abort disposes a
   * match that never finished, but the dispose-driven leave cascade CAN still
   * reach Match.finish() (teardown → onPlayerLeave → checkWin), so the
   * abort guard here is load-bearing, not decorative. No session ids or
   * player names ride on this line (telemetry PII rule).
   */
  private emitMatchEnd(): void {
    if (this.matchEndEmitted || this.matchAbortEmitted || !this.match) return;
    this.matchEndEmitted = true;
    this.log.info('match.end', { matchId: this.matchId, mode: MODE, ...this.match.endSummary() });
  }

  /**
   * `match.abort` telemetry — at most once per room, and never after a
   * normal finish. The shared guard means a tick-error abort (which disposes
   * the room with the match still 'active') does not ALSO emit 'abandoned'
   * from onDispose.
   */
  private emitMatchAbort(reason: 'tick-error' | 'abandoned'): void {
    if (this.matchAbortEmitted || this.matchEndEmitted) return;
    this.matchAbortEmitted = true;
    this.log.info('match.abort', { matchId: this.matchId, reason, tick: this.world.tick });
  }

  /**
   * Story 0.3: telemetry + metrics teardown. A match still 'active' when the
   * room disposes terminated without finish() — that is an abort ('abandoned'),
   * unless the tick-error path already claimed the shared abort guard.
   */
  onDispose(): void {
    this.releaseDeparted(true); // no seat outlives the room, reaped or not
    if (this.match?.phase === 'active') this.emitMatchAbort('abandoned');
    this.metrics?.unregister();
    this.metrics = null;
    this.log.info('room.dispose', {});
  }

  private afterStep(): void {
    this.releaseDeparted(); // scuttled hulls reaped this tick free their seats
    this.syncRoster();
    this.syncZone();
    this.syncMatch();
    this.syncBounty();
    const phase = this.match?.phase ?? 'waiting';
    for (const client of this.clients) {
      // Skip clients not fully JOINED (initial-join handshake and the
      // reconnect-ack window): sends to those enqueue into an unbounded
      // transport buffer instead of the wire, and a resuming client only
      // needs live frames from its first acked tick onward.
      if (client.state !== ClientState.JOINED) continue;
      client.send(MSG.frame, buildFrame(this.world, client.sessionId, phase));
    }
  }

  /**
   * Mirror the phased zone onto the public schema (Story 3.1): phase string,
   * anchor time, and the REVEALED ring prefix only — the current ring (ring g
   * at the last boundary) plus the next ring from its reveal beat onward,
   * zeroed otherwise (amendment 10: unrevealed geometry never rides the wire).
   * Everything is STATE-DERIVED from the world each step — never event-driven —
   * so late joiners and reconnects get the correct prefix from plain schema
   * sync. Clients interpolate current→next locally (shared zoneLiveState) for
   * the smooth 60fps ring; every field here changes only at beat boundaries.
   */
  private syncZone(): void {
    const phase = this.world.zonePhase;
    if (this.state.zoneState !== phase) this.state.zoneState = phase;
    const startT = this.world.zoneStartMs;
    if (this.state.zoneStartT !== startT) this.state.zoneStartT = startT;
    this.syncZoneGeometry();
  }

  /** The ring-geometry half of syncZone (guarded assigns: schema patches only
   *  on real boundary changes). */
  private syncZoneGeometry(): void {
    const s = this.state;
    const cur = this.world.zoneCurrentRing;
    if (s.zoneCurCx !== cur.cx) s.zoneCurCx = cur.cx;
    if (s.zoneCurCy !== cur.cy) s.zoneCurCy = cur.cy;
    if (s.zoneCurR !== cur.r) s.zoneCurR = cur.r;
    const next = this.world.zoneRevealedNextRing ?? ZERO_RING;
    if (s.zoneNextCx !== next.cx) s.zoneNextCx = next.cx;
    if (s.zoneNextCy !== next.cy) s.zoneNextCy = next.cy;
    if (s.zoneNextR !== next.r) s.zoneNextR = next.r;
  }

  /** Mirror the match lifecycle onto the public schema. Match.countdownEndT
   *  is the CURRENT-PHASE deadline (gathering window end during 'gathering',
   *  countdown end during 'countdown', 0 otherwise) — mirrored verbatim; the
   *  phase string tells the client which deadline it is reading. */
  private syncMatch(): void {
    if (!this.match) return;
    if (this.state.matchPhase !== this.match.phase) this.state.matchPhase = this.match.phase;
    if (this.state.countdownEndT !== this.match.countdownEndT) {
      this.state.countdownEndT = this.match.countdownEndT;
    }
    if (this.state.winnerId !== this.match.winnerId) this.state.winnerId = this.match.winnerId;
  }

  /** Mirror the bounty throne onto the public schema (Story 4.6): one
   *  identity-only scalar, guarded-assign so a patch rides only on a real
   *  transfer/vacate — World owns the strict-overtake rule (game/bounty.ts);
   *  this is a verbatim mirror, never a re-derivation. */
  private syncBounty(): void {
    if (this.state.bountyId !== this.world.bountyId) this.state.bountyId = this.world.bountyId;
  }

  /**
   * Mirror sim liveness + combat tallies onto the public roster. damageDealt
   * is withheld until the match finishes (FINDING P1): mirroring it live
   * turned the public schema into a "combat is happening somewhere" channel
   * that the fog otherwise denies — any client could watch a stranger's
   * damageDealt tick up and infer a fight in progress without sight/radar on
   * either party. kills/deaths/alive stay live (already implied by kill-feed
   * events); placement stays finish-only per the existing placements Map,
   * which is empty until Match.finish() runs.
   */
  private syncRoster(): void {
    const revealDamage = !this.match || this.match.phase === 'finished';
    this.state.players.forEach((meta: PlayerMeta, id: string) => {
      const ship = this.world.ships.get(id);
      if (!ship) return;
      // THE WIRE DOES NOT MOVE (Story 5.1, amendment 7): PlayerMeta.alive stays
      // a schema boolean, PROJECTED from the lifecycle here.
      const afloat = isAfloat(ship.lifecycle);
      if (meta.alive !== afloat) meta.alive = afloat;
      if (meta.kills !== ship.kills) meta.kills = ship.kills;
      if (meta.deaths !== ship.deaths) meta.deaths = ship.deaths;
      if (revealDamage && meta.damageDealt !== ship.damageDealt) meta.damageDealt = ship.damageDealt;
      const placement = this.match?.placements.get(id) ?? 0;
      if (meta.placement !== placement) meta.placement = placement;
    });
  }
}
