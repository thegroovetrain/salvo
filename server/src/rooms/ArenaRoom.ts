// Thin Colyseus adapter around the plain-TS World simulation + Match state
// machine. All game logic lives in game/ — this room only bridges: joins/
// leaves <-> roster schema + match roster notifications, raw "i" messages ->
// World's input store, fixed steps -> match update + per-client frames, and
// implements the Match side-effect hooks (lock/unlock/broadcast/disconnect).
// Story 0.3 adds the operability glue: structured lifecycle logging,
// match.end/match.abort telemetry, tick-error containment, metrics feeds,
// and the JOINING-deadline kick — all adapter-side (game/ stays pure).

import { ClientState, CloseCode, ErrorCode, Room, ServerError, generateId, type Client } from 'colyseus';
import { CONFIG, DRONE_HULL_IDS, MSG, sanitizeClassId, type ResultsMsg, type WelcomeMsg } from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World } from '../game/world.js';
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
  sanitizeRoomOptions,
  type JoinOptions,
  type MatchOverride,
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
   * PROTOCOL_VERSION join gate (story 0.2). Static onAuth runs at matchmake
   * time — BEFORE room lookup, seat reservation, or any socket work (verified
   * in @colyseus/core MatchMaker.joinOrCreate → callOnAuth) — so a stale
   * bundle is rejected with a message the menu renders instead of failing
   * later at schema decode. matchMaker.reconnect() never calls onAuth, so a
   * mid-match resume is not re-gated (the reconnection token is the auth).
   * The thrown ServerError surfaces to the SDK's joinOrCreate promise as a
   * MatchMakeError carrying this exact message + code.
   */
  static async onAuth(_token: string, options?: JoinOptions): Promise<boolean> {
    const error = protocolVersionError(options?.pv);
    if (error) throw new ServerError(ErrorCode.AUTH_FAILED, error);
    return true;
  }

  private world!: World;
  /** Null only in sandbox mode (dev smokes) — see MatchOverride. */
  private match: Match | null = null;
  private accumulator = 0;
  private joinCounter = 0;
  private droneCounter = 0;
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

  // --- story 0.3 operability state -------------------------------------------
  /** Room-generated match identity (one match per room); '' until onCreate. */
  private matchId = '';
  /** Bound room logger; rebuilt in onCreate with {roomId, matchId, mode} + tick. */
  private log: Logger = createLogger({ mode: MODE });
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
    // mapRadius(6) sizing per plan. zoneOverride (dev-only) fast-forwards the
    // storm timeline for smokes/tests; undefined => shipped CONFIG.zone.
    this.world = new World(seed, CONFIG.match.fillTo, sanitized.zoneOverride ?? CONFIG.zone);

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

  /** The post-operability remainder of room creation (see onCreate's guard). */
  private finishCreate(sanitized: SanitizedRoomOptions, seed: number): void {
    if (!sanitized.matchOverride?.sandbox) {
      this.match = new Match(this.world, this.timings(sanitized.matchOverride), this.matchHooks());
    }

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;
    // Idle full map until the match activates and anchors the storm timeline.
    this.state.zoneRadius = this.world.map.radius;

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

  private timings(override: MatchOverride | undefined): MatchTimings {
    const base = defaultTimings();
    return {
      countdownMs: override?.countdownMs ?? base.countdownMs,
      resultsMs: override?.resultsMs ?? base.resultsMs,
      minHumans: override?.minHumans,
    };
  }

  /** The Match state machine's side effects, implemented on the room. */
  private matchHooks(): MatchHooks {
    return {
      lock: () => void this.lock(),
      unlock: () => void this.unlock(),
      // Drone-fill seam (step 15): top the roster up to CONFIG.match.fillTo with
      // weaponless target drones, each a real ship + PlayerMeta so kill feed,
      // contacts, blips, and results rows all include them. (The match.activate
      // line is NOT logged here: this hook fires at the START of the transition,
      // and a throw later in activate() would leave stdout claiming an
      // activation that never happened — see observeMatchActivation.)
      fillToCapacity: () => this.fillToCapacity(),
      broadcastResults: (msg: ResultsMsg) => {
        // Cache before broadcasting (finding F2): a captain in grace isn't in
        // this.clients, so onDrop's resume handler re-sends this to them.
        this.lastResults = msg;
        this.broadcast(MSG.results, msg);
        // Match.finish() is the only caller — the one finish hook, so this is
        // where match.end telemetry is emitted (story 0.3).
        this.emitMatchEnd();
      },
      disconnect: () => void this.disconnect(),
    };
  }

  /**
   * Fill the empty slots with target drones at match activation. Each drone is
   * an ordinary World ship (isDrone=true, driven by the DroneController via the
   * normal input path) PLUS a public PlayerMeta, so it shows up everywhere a
   * human does: roster, kill feed, contacts/blips, and the results table. Runs
   * before resetForMatchStart, which redeploys drones to the spawn ring too.
   */
  private fillToCapacity(): void {
    const need = CONFIG.match.fillTo - this.world.ships.size;
    for (let i = 0; i < need; i++) {
      this.droneCounter += 1;
      const id = `drone-${this.droneCounter}`;
      const name = `DRONE-${String(this.droneCounter).padStart(2, '0')}`;
      // Round-robin the drone hulls (small/medium/large) so every drone
      // envelope gets free visual coverage. Drones never take player classes.
      const hullId = DRONE_HULL_IDS[i % DRONE_HULL_IDS.length];
      this.world.addShip(id, name, true, hullId);
      const meta = new PlayerMeta();
      meta.id = id;
      meta.name = name;
      this.state.players.set(id, meta);
    }
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    const name = options.name?.trim() || `CAPTAIN-${this.joinCounter}`;
    const classId = sanitizeClassId(options.cls);

    this.world.addShip(client.sessionId, name, false, classId);

    // Sandbox mode only (dev smokes): pre-lifecycle interim behavior — the
    // storm starts when the 2nd ship joins. The real lifecycle anchors the
    // zone at the countdown->active transition instead (game/match.ts).
    if (!this.match && this.world.ships.size >= 2) this.world.startZone();

    const meta = new PlayerMeta();
    meta.id = client.sessionId;
    meta.name = name;
    this.state.players.set(client.sessionId, meta);

    const welcome: WelcomeMsg = {
      sessionId: client.sessionId,
      mapSeed: this.state.mapSeed,
      mapRadius: this.world.map.radius,
      playerCap: this.world.playerCap,
      t: this.world.now,
      config: CONFIG,
    };
    client.send(MSG.welcome, welcome);

    this.match?.notifyRosterChanged();

    this.log.info('client.join', { sessionId: client.sessionId });
    this.armJoiningDeadline(client);
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
   *   JOINED), so no onReconnect hook and no welcome re-send are needed —
   *   EXCEPT the one-time results broadcast (finding F2), re-sent below to a
   *   captain who resumes during the results window.
   * If the ship is sunk DURING the grace window, the pending reconnection is
   * left untouched — a resuming client lands in the normal post-death flow
   * (spectator frames), and Match.recordSink's dedupe keeps the real combat
   * placement when teardown eventually runs.
   */
  onDrop(client: Client, code?: number): void {
    const ship = this.world.ships.get(client.sessionId);
    const policy = dropPolicy(
      this.match?.phase === 'active',
      ship !== undefined,
      ship?.alive === true,
      RECONNECTABLE_CLOSE_CODES.has(code ?? -1),
    );
    if (policy === 'hold') {
      // `code ?? null` so the close code ALWAYS survives JSON.stringify —
      // undefined would silently drop the field and lose the forensics.
      this.log.info('client.drop', { sessionId: client.sessionId, code: code ?? null });
      this.allowReconnection(client, CONFIG.net.reconnectGraceSeconds)
        .then((newClient) => {
          this.log.info('client.resume', { sessionId: client.sessionId });
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
    if (!this.state.players.has(sessionId) && !this.world.ships.has(sessionId)) return false;
    // Match owns ship removal so a mid-match departure is recorded for
    // placement (sunk-at-leave-time) before the win check runs.
    if (this.match) this.match.onPlayerLeave(sessionId);
    else this.world.removeShip(sessionId);
    this.state.players.delete(sessionId);
    this.pings.delete(sessionId); // D1 ping/RTT state dies with the seat
    return true;
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
    if (this.match?.phase === 'active') this.emitMatchAbort('abandoned');
    this.metrics?.unregister();
    this.metrics = null;
    this.log.info('room.dispose', {});
  }

  private afterStep(): void {
    this.syncRoster();
    this.syncZone();
    this.syncMatch();
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
   * Mirror the live zone onto the public schema. zoneRadius is animated every
   * step (its patch rides the normal cadence); state/startT change rarely.
   * Clients derive the smooth ring locally from zoneStartT + CONFIG.
   */
  private syncZone(): void {
    const phase = this.world.zonePhase;
    if (this.state.zoneState !== phase) this.state.zoneState = phase;
    const startT = this.world.zoneStartMs;
    if (this.state.zoneStartT !== startT) this.state.zoneStartT = startT;
    this.state.zoneRadius = this.world.zoneRadius;
  }

  /** Mirror the match lifecycle onto the public schema. */
  private syncMatch(): void {
    if (!this.match) return;
    if (this.state.matchPhase !== this.match.phase) this.state.matchPhase = this.match.phase;
    if (this.state.countdownEndT !== this.match.countdownEndT) {
      this.state.countdownEndT = this.match.countdownEndT;
    }
    if (this.state.winnerId !== this.match.winnerId) this.state.winnerId = this.match.winnerId;
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
      if (meta.alive !== ship.alive) meta.alive = ship.alive;
      if (meta.kills !== ship.kills) meta.kills = ship.kills;
      if (meta.deaths !== ship.deaths) meta.deaths = ship.deaths;
      if (revealDamage && meta.damageDealt !== ship.damageDealt) meta.damageDealt = ship.damageDealt;
      const placement = this.match?.placements.get(id) ?? 0;
      if (meta.placement !== placement) meta.placement = placement;
    });
  }
}
