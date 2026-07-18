// Thin Colyseus adapter around the plain-TS World simulation + Match state
// machine. All game logic lives in game/ — this room only bridges: joins/
// leaves <-> roster schema + match roster notifications, raw "i" messages ->
// World's input store, fixed steps -> match update + per-client frames, and
// implements the Match side-effect hooks (lock/unlock/broadcast/disconnect).

import { ClientState, CloseCode, ErrorCode, Room, ServerError, type Client } from 'colyseus';
import { CONFIG, MSG, SHIP_CLASS_IDS, sanitizeClassId, type ResultsMsg, type WelcomeMsg } from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { Match, defaultTimings, dropPolicy, type MatchHooks, type MatchTimings } from '../game/match.js';
import {
  protocolVersionError,
  sanitizeRoomOptions,
  type JoinOptions,
  type MatchOverride,
  type RoomOptions,
} from './roomOptions.js';

const SIM_DT_MS = CONFIG.tick.simDtMs; // 50ms fixed step (20Hz)
const INTERVAL_MS = 1000 / 60; // setSimulationInterval cadence
const MAX_ACCUMULATED_MS = SIM_DT_MS * 5; // spiral-of-death cap

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

  onCreate(options: RoomOptions = {}): void {
    // SECURITY (findings C1/C2): matchOverride/zoneOverride arrive verbatim
    // from client-supplied joinOrCreate options. Only honor them when the
    // server process opts in via HC_DEV_OPTIONS=1 (smokes/tests only) —
    // otherwise a hostile client could trap joiners in a lifecycle-less
    // sandbox room, DoS via huge minHumans/countdownMs/resultsMs, or desync
    // the server's storm from what honest clients render.
    const devEnabled = process.env.HC_DEV_OPTIONS === '1';
    const { sanitized, rejectedKeys } = sanitizeRoomOptions(options, devEnabled);
    if (rejectedKeys.length > 0) {
      console.warn(
        `[ArenaRoom] rejected dev-only options (HC_DEV_OPTIONS not set): ${rejectedKeys.join(', ')}`,
      );
    }

    const seed = (Math.random() * 0xffffffff) >>> 0;
    // mapRadius(6) sizing per plan. zoneOverride (dev-only) fast-forwards the
    // storm timeline for smokes/tests; undefined => shipped CONFIG.zone.
    this.world = new World(seed, CONFIG.match.fillTo, sanitized.zoneOverride ?? CONFIG.zone);

    if (!sanitized.matchOverride?.sandbox) {
      this.match = new Match(this.world, this.timings(sanitized.matchOverride), this.matchHooks());
    }

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;
    // Idle full map until the match activates and anchors the storm timeline.
    this.state.zoneRadius = this.world.map.radius;

    this.onMessage(MSG.input, (client: Client, raw: unknown) => {
      this.world.submitInput(client.sessionId, raw);
    });

    // Discrete spend message (NOT on the per-tick InputMsg: latest-wins
    // coalescing would drop back-to-back spends; WS ordering gives FIFO for
    // free). All validation lives in spendPoint (fail-closed, unit-testable
    // without Colyseus); spends are bounded by banked points, so no per-channel
    // cap — only the room-wide transport guard (maxMessagesPerSecond) applies.
    this.onMessage(MSG.spend, (client: Client, raw: unknown) => {
      this.world.spendPoint(client.sessionId, (raw as { choice?: unknown } | null)?.choice);
    });

    this.setSimulationInterval((dt) => this.update(dt), INTERVAL_MS);
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
      // contacts, blips, and results rows all include them.
      fillToCapacity: () => this.fillToCapacity(),
      broadcastResults: (msg: ResultsMsg) => {
        // Cache before broadcasting (finding F2): a captain in grace isn't in
        // this.clients, so onDrop's resume handler re-sends this to them.
        this.lastResults = msg;
        this.broadcast(MSG.results, msg);
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
      // Round-robin the classes so every hull gets free visual coverage.
      const classId = SHIP_CLASS_IDS[i % SHIP_CLASS_IDS.length];
      this.world.addShip(id, name, true, classId);
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
      this.allowReconnection(client, CONFIG.net.reconnectGraceSeconds)
        .then((newClient) => {
          // Finding F2: results fire as a one-shot broadcast the dropped client
          // missed (not in this.clients). Re-send only if the match finished
          // while they were away; a normal mid-match resume sends nothing. The
          // send enqueues on the not-yet-acked client and flushes on ack.
          if (this.lastResults) newClient.send(MSG.results, this.lastResults);
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

  onLeave(client: Client): void {
    this.teardown(client.sessionId);
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
  private teardown(sessionId: string): void {
    if (!this.state.players.has(sessionId) && !this.world.ships.has(sessionId)) return;
    // Match owns ship removal so a mid-match departure is recorded for
    // placement (sunk-at-leave-time) before the win check runs.
    if (this.match) this.match.onPlayerLeave(sessionId);
    else this.world.removeShip(sessionId);
    this.state.players.delete(sessionId);
  }

  /** Fixed-step accumulator: drain whole SIM_DTs, frame out after each step. */
  private update(dtMs: number): void {
    this.accumulator = Math.min(this.accumulator + dtMs, MAX_ACCUMULATED_MS);
    while (this.accumulator >= SIM_DT_MS) {
      this.accumulator -= SIM_DT_MS;
      this.world.step(SIM_DT_MS);
      this.match?.update();
      this.afterStep();
    }
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
