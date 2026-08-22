// The standard-match queue (Story 6.1). A thin Colyseus adapter over the pure
// policy in queue.ts — the same split ArenaRoom keeps against game/world.ts and
// game/match.ts: nothing here decides WHEN a match forms, it only owns the pool
// array, the socket sends and the matchMaker calls.
//
// Why a room in FRONT of the arena at all: the lobby used to live inside the
// arena, which made "which mode am I waiting for" a property of the arena room
// itself (blocking Story 6.5's Solo vs AI, which requires the arena never to
// fork on mode) and scattered late arrivals into fresh empty rooms once the
// gathering window closed. The queue pools captains, arms ONE hard deadline at
// the second captain, and hands the arena a fully-formed roster in a single
// reservation. The arena never learns the mode — it only ever receives seats.

import { ClientState, CloseCode, ErrorCode, Room, ServerError, matchMaker, type AuthContext, type Client } from 'colyseus';
import {
  CONFIG,
  MSG,
  sanitizeClassId,
  sanitizeHornId,
  type QueueStatusMsg,
} from '@salvo/shared';
import {
  protocolVersionError,
  sanitizeColorPref,
  sanitizeName,
  type JoinOptions,
} from './roomOptions.js';
import { stagingGateError } from '../stagingGate.js';
import { defaultQueueConfig, queueStep, type QueueConfig, type QueueDecision } from './queue.js';
import { createLogger, type LogFields, type Logger } from '../log.js';

/** The room name the queue seats captains into — must match app.config.ts. */
const ARENA_ROOM = 'arena';
/** Telemetry mode tag, mirroring ArenaRoom's MODE. */
const MODE = 'queue';
/** Queue evaluation cadence. 1 Hz on the ROOM CLOCK (clock.setInterval, never
 *  setSimulationInterval — there is no simulation here, and a queue that ticks
 *  at 60 Hz would burn a core doing arithmetic on an unchanged pool). One
 *  second is also the resolution QueueStatusMsg's countdown is rendered at. */
const TICK_MS = 1000;

/** Client-facing message when the arena could not be created or a seat could
 *  not be reserved. Never a silent drop — the client shows this and un-busies
 *  the home screen. */
const FORM_FAILED_ERROR = 'could not start a match — please try again';

/**
 * The listing-metadata block this room publishes for `GET /liveness` (Story
 * 6.6). It carries exactly what QueueStatusMsg already carries, with the
 * countdown re-expressed as an ABSOLUTE epoch deadline (see resolveDeadlineAt).
 */
interface QueueListingMeta {
  pooled: number;
  min: number;
  cap: number;
  /** Epoch ms the pool forms at; null while UNARMED. */
  deadlineAt: number | null;
}

/**
 * The IRoomCache handle matchMaker.createRoom hands back. Derived from the
 * function's own return type rather than imported by name: it is the ONLY
 * arena handle the queue ever holds, and it is deliberately metadata — not a
 * Room instance (see formMatch's D8 note).
 */
type RoomCache = Awaited<ReturnType<typeof matchMaker.createRoom>>;

interface PooledCaptain {
  client: Client;
  /**
   * Join options ALREADY run through the arena's own sanitizers (see
   * sanitizeArenaOptions). They ride the seat reservation verbatim, so
   * ArenaRoom.onJoin receives exactly the shape it receives today — the
   * sanitizing simply happens one door earlier.
   */
  options: JoinOptions;
}

/**
 * Render a thrown value into log fields without ever throwing ourselves (the
 * ArenaRoom.describeError posture, trimmed: a failed form is reported, never
 * escalated into a second failure inside the reporting).
 */
function errorFields(err: unknown): LogFields {
  if (err instanceof Error) return { error: err.message };
  try {
    return { error: String(err) };
  } catch {
    return { error: 'unstringifiable' };
  }
}

/**
 * Sanitize the client-supplied identity options at the QUEUE door, using the
 * arena's existing pure helpers. Only the plain identity options travel: the
 * dev-only room overrides (matchOverride/zoneOverride/mapSeed) are room-CREATE
 * options and are never forwarded — the queue always creates its arena with
 * `{}`, so a queued client can never reach them at all.
 */
function sanitizeArenaOptions(options: JoinOptions): JoinOptions {
  return {
    name: sanitizeName(options.name),
    cls: sanitizeClassId(options.cls),
    horn: sanitizeHornId(options.horn),
    colorPref: sanitizeColorPref(options.colorPref),
  };
}

export class StandardQueueRoom extends Room {
  // No maxClients: the pool may legitimately exceed CONFIG.map.playerCap (the
  // overflow row — the first `cap` captains form a match and the surplus stays
  // pooled). Capping the queue at the arena's cap would turn a 25-captain rush
  // into five rejected connections.
  autoDispose = true;
  maxMessagesPerSecond = CONFIG.net.maxMessagesPerSecond;

  /**
   * PROTOCOL_VERSION gate, re-implemented at the queue's door and load-bearing
   * there: matchMaker.reserveSeatFor / reserveMultipleSeatsFor call the room's
   * `_reserveSeat` directly and NEVER call `callOnAuth` (verified in the
   * installed @colyseus/core 0.17). So the arena's static onAuth no longer runs
   * for any real player — the queue is the only door left where a stale bundle
   * can be turned away with a readable "refresh" message instead of failing
   * later at schema decode.
   */
  static async onAuth(
    _token: string,
    options?: JoinOptions,
    context?: AuthContext,
  ): Promise<boolean> {
    const error = protocolVersionError(options?.pv);
    if (error) throw new ServerError(ErrorCode.AUTH_FAILED, error);
    // STAGING PASSWORD (cycle 127), and this door is the load-bearing copy for
    // exactly the reason the PV gate above is: the queue is the door a
    // multiplayer player knocks on. The cookie arrives on its own — the SDK
    // posts the matchmake request with credentials included and staging is
    // same-origin. Inert in production (HC_STAGING_KEY unset).
    const gate = stagingGateError(context?.headers?.get('cookie') ?? undefined);
    if (gate) throw new ServerError(ErrorCode.AUTH_FAILED, gate);
    return true;
  }

  /** Pooled captains in JOIN ORDER — the order a form takes its first N from. */
  private readonly pool: PooledCaptain[] = [];
  /** See QueueState.armedAtMs: never moved within a cohort, cleared only when a
   *  match forms so the captains left behind serve their own full timer. */
  private armedAtMs: number | null = null;
  /** True across formMatch's awaits; suppresses re-entrant evaluation. */
  private forming = false;
  private readonly cfg: QueueConfig = defaultQueueConfig();
  private log: Logger = createLogger({ mode: MODE });
  /** The listing metadata last written, so a tick that changes nothing writes
   *  nothing (see publishListing). */
  private published: QueueListingMeta | null = null;
  /** Absolute epoch-ms deadline for the CURRENT cohort, and the armedAtMs it
   *  was stamped from (see resolveDeadlineAt). */
  private deadlineAt: number | null = null;
  private deadlineArmedAtMs: number | null = null;

  onCreate(): void {
    this.log = createLogger({ roomId: this.roomId, mode: MODE });
    // Seed the listing metadata BEFORE the first join, so /liveness never sees
    // a queue room with no shape. Free: `_internalState` is still CREATING
    // here, so setMetadata skips its own persist and the create-time
    // driver.persist carries it (the same argument as ArenaRoom's mode tag).
    this.publishListing(null);
    this.clock.setInterval(() => this.evaluate(false), TICK_MS);
    this.log.info('queue.create', { minHumans: this.cfg.minHumans, cap: this.cfg.cap });
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.pool.push({ client, options: sanitizeArenaOptions(options) });
    this.log.info('queue.join', { sessionId: client.sessionId, pooled: this.pool.length });
    this.armJoiningDeadline(client);
    this.evaluate(true);
  }

  /**
   * A captain leaving the pool (CANCEL, a closed tab, or a dropped socket —
   * the queue defines no onDrop, so every close routes straight here with no
   * reconnect grace: a half-second of queueing is not worth resuming).
   * Deliberately NOT idempotency-guarded beyond the presence check: a client
   * already spliced out by formMatch is simply not found.
   */
  onLeave(client: Client): void {
    const at = this.pool.findIndex((p) => p.client.sessionId === client.sessionId);
    if (at < 0) return;
    this.pool.splice(at, 1);
    this.log.info('queue.leave', { sessionId: client.sessionId, pooled: this.pool.length });
    this.evaluate(true);
  }

  onDispose(): void {
    this.log.info('queue.dispose', {});
  }

  /**
   * One policy step. `pushAlways` distinguishes the two callers: a pool-count
   * change always pushes fresh liveness (the count itself moved), while the
   * 1 Hz tick only pushes while ARMED, because that is the only state whose
   * countdown advances between ticks — an unarmed pool's status is identical
   * second to second and does not need to be re-sent.
   */
  private evaluate(pushAlways: boolean): void {
    if (this.forming) return;
    const decision = queueStep(
      { nowMs: this.clock.currentTime, pooled: this.pool.length, armedAtMs: this.armedAtMs },
      this.cfg,
    );
    this.armedAtMs = decision.armedAtMs;
    this.publishListing(decision);
    if (decision.form) {
      void this.formMatch(decision.formCount);
      return;
    }
    if (pushAlways || decision.startsInMs !== null) this.pushStatus(decision.startsInMs);
  }

  /**
   * The cohort's deadline as an ABSOLUTE EPOCH ms, for `GET /liveness` (Story
   * 6.6) — the home screen is not connected to this room, so it cannot be given
   * a remaining-ms the way a pooled captain's QueueStatusMsg is; it needs a
   * fixed point it can tick a local countdown against.
   *
   * Stamped ONCE per cohort, from `Date.now()` plus the policy's own remaining
   * ms. Two reasons it is not `armedAtMs + queueTimerMs`: the queue's clock is
   * `this.clock.currentTime` (a Colyseus room clock), so nothing in this file
   * may assume its origin is the wall-clock epoch; and a value recomputed from
   * `Date.now()` every tick would jitter by a few ms per second and defeat the
   * publish-on-change rule below, turning liveness into a driver write per
   * second forever.
   *
   * Because `armedAtMs` never moves within a cohort (see QueueState.armedAtMs),
   * a stamp keyed on it is stable until a match forms and the next cohort arms.
   *
   * A DEADLINE THAT CANNOT FIRE IS NOT A DEADLINE, so it is not published.
   * `queueStep` deliberately clears `armedAtMs` only when a match FORMS, never
   * when the pool drains (that is the anti-hostage-cycling rule — a deadline
   * later joins could extend is a griefing vector, and it is POLICY, frozen).
   * The consequence for a PUBLISHER is that an armed pool of 2 that drops to 1
   * keeps counting down toward a form `queueStep` will refuse: the home screen
   * would read `1 QUEUED · STARTS 1:50`, tick to `0:00`, and stick there
   * forever. So the publishing decision is taken here — below `min`, publish no
   * deadline (epic-6 amendment 4: "the queue does not run a countdown that
   * cannot fire") — while the policy stays byte-identical.
   *
   * The stamp itself is NOT cleared on the way down: `armedAtMs` did not move,
   * so the cohort's deadline did not move, and re-publishing the SAME number
   * when the pool refills is both the honest answer and what keeps the
   * publish-on-change rule from writing to the driver on every dip.
   */
  private resolveDeadlineAt(decision: QueueDecision): number | null {
    if (decision.armedAtMs === null || decision.startsInMs === null) {
      this.deadlineArmedAtMs = null;
      this.deadlineAt = null;
      return null;
    }
    if (this.deadlineArmedAtMs !== decision.armedAtMs || this.deadlineAt === null) {
      this.deadlineArmedAtMs = decision.armedAtMs;
      this.deadlineAt = Date.now() + decision.startsInMs;
    }
    if (this.pool.length < this.cfg.minHumans) return null;
    return this.deadlineAt;
  }

  /**
   * Publish the pool to the ROOM LISTING for `GET /liveness` — ONLY WHEN A
   * VALUE CHANGED. setMetadata persists to the matchmaker driver, and the 1 Hz
   * tick runs for the whole life of the room, so an unconditional publish would
   * be one driver write per second forever: invisible on the LocalDriver and a
   * real, permanent cost the day the driver is Redis.
   *
   * `decision === null` is the onCreate seed: shape with no countdown.
   *
   * Policy is untouched by all of this — nothing here decides anything, it only
   * mirrors what queueStep already computed.
   */
  private publishListing(decision: QueueDecision | null): void {
    const meta: QueueListingMeta = {
      pooled: this.pool.length,
      min: this.cfg.minHumans,
      cap: this.cfg.cap,
      deadlineAt: decision === null ? null : this.resolveDeadlineAt(decision),
    };
    const prev = this.published;
    const same = prev !== null
      && prev.pooled === meta.pooled
      && prev.min === meta.min
      && prev.cap === meta.cap
      && prev.deadlineAt === meta.deadlineAt;
    if (same) return;
    this.published = meta;
    // A failed persist must not latch: clearing the mirror makes the next tick
    // that changes anything retry rather than believe it already published.
    void this.setMetadata(meta).catch(() => {
      this.published = null;
    });
  }

  /** QueueStatusMsg to every POOLED captain (a captain already seated by a
   *  form is out of the pool and must not be told about the next one). */
  private pushStatus(startsInMs: number | null): void {
    const msg: QueueStatusMsg = {
      n: this.pool.length,
      min: this.cfg.minHumans,
      cap: this.cfg.cap,
      startsInMs,
    };
    for (const pooled of this.pool) pooled.client.send(MSG.queueStatus, msg);
  }

  /**
   * Create an arena and seat the first `count` captains into it.
   *
   * D8 — the queue may use ONLY matchMaker.createRoom /
   * reserveMultipleSeatsFor / buildSeatReservation. It must NEVER call
   * getLocalRoomById or hold a Room instance: that would silently bind the
   * queue to same-process co-residency with the arena it just created, and the
   * whole point of routing through the matchmaker is that the arena may live on
   * another process entirely. Everything below works on the IRoomCache handle
   * (metadata + roomId), which is process-agnostic by construction.
   */
  private async formMatch(count: number): Promise<void> {
    this.forming = true;
    // Splice BEFORE the first await: a captain who joins while the arena is
    // being created must land in the NEXT pool, never be seated twice. The
    // surplus past `cap` simply stays in this.pool.
    const seated = this.pool.splice(0, count);
    try {
      // The ONLY room option the queue passes: how many captains it is about
      // to reserve seats for (Eric ruling 2026-08-14 — the arena boards the
      // whole group locked down and holds the 10 s countdown until every one
      // of them has loaded in, so it must know the size of the group it is
      // waiting for). Explicitly NOT a mode, and not a client-supplied option:
      // the arena still never learns what kind of queue formed it.
      const arena = await matchMaker.createRoom(ARENA_ROOM, { expectedCaptains: seated.length });
      const reserved = await matchMaker.reserveMultipleSeatsFor(
        arena,
        seated.map((p) => ({ sessionId: p.client.sessionId, options: p.options, auth: p.client.auth })),
      );
      this.deliverSeats(arena, seated, reserved);
    } catch (err) {
      this.failSeats(seated, err);
    } finally {
      this.forming = false;
    }
    // A surplus is a live pool again the instant the form completes.
    this.evaluate(true);
  }

  /**
   * Hand each successfully-reserved captain its seat. reserveMultipleSeatsFor
   * returns a PER-SEAT boolean (the arena's _reserveSeat returns false rather
   * than throwing when the room is full), so a partial success is normal and
   * must be handled seat by seat.
   */
  private deliverSeats(arena: RoomCache, seated: PooledCaptain[], reserved: boolean[]): void {
    const refused: PooledCaptain[] = [];
    for (const [i, pooled] of seated.entries()) {
      if (!reserved[i]) {
        refused.push(pooled);
        continue;
      }
      pooled.client.send(MSG.seat, matchMaker.buildSeatReservation(arena, pooled.client.sessionId));
    }
    this.log.info('queue.form', {
      arenaRoomId: arena.roomId,
      seated: seated.length - refused.length,
      refused: refused.length,
      pooled: this.pool.length,
    });
    if (refused.length > 0) this.failSeats(refused, new Error('seat reservation refused'));
  }

  /**
   * Never silently drop a captain a form failed for: tell them (the SDK
   * surfaces client.error as onError) and close the connection so the home
   * screen un-busies rather than sitting on a queue that will never fire. They
   * are already out of the pool, so nothing here can re-seat them.
   */
  private failSeats(seated: PooledCaptain[], err: unknown): void {
    this.log.error('queue.formFailed', { ...errorFields(err), affected: seated.length });
    for (const pooled of seated) {
      pooled.client.error(ErrorCode.MATCHMAKE_UNHANDLED, FORM_FAILED_ERROR);
      pooled.client.leave(CloseCode.WITH_ERROR);
    }
  }

  /**
   * JOINING-deadline kick, ported verbatim in spirit from ArenaRoom: core
   * pushes a client into `this.clients` BEFORE onJoin runs and leaves it
   * ClientState.JOINING until its JOIN_ROOM ack lands, so a client that never
   * completes the handshake would otherwise hold a POOL SLOT — and here that is
   * worse than in the arena, because a pool of phantom captains can arm the
   * timer and form a match nobody is actually in. Same exploit surface, new
   * door. Decided at FIRE time (race-free) and never cleared: room-clock timers
   * die with the room on dispose.
   */
  private armJoiningDeadline(client: Client): void {
    this.clock.setTimeout(
      () => this.kickIfStillJoining(client),
      CONFIG.net.joiningDeadlineSeconds * 1000,
    );
  }

  private kickIfStillJoining(client: Client): void {
    if (client.state === ClientState.JOINED || !this.clients.includes(client)) return;
    this.log.warn('queue.joiningKick', { sessionId: client.sessionId });
    // WITH_ERROR (4002): a punitive close, no grace window (the queue grants
    // none anyway) — the pool slot is freed through onLeave immediately.
    client.leave(CloseCode.WITH_ERROR);
  }
}
