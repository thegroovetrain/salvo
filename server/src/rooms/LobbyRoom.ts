// THE PRIVATE LOBBY (cycle 167, Eric rulings 2026-10-02) — the third front
// door, beside the Standard queue and Solo vs AI. A thin Colyseus adapter over
// the pure policy in lobby.ts, modeled on StandardQueueRoom: nothing here
// decides WHEN the arena forms; it owns the sockets, the schema mirror and the
// matchMaker calls, and forms the arena through formArena.ts exactly the way
// the queue does (D8: matchMaker.createRoom / reserveMultipleSeatsFor only —
// no Room handle, no world.js / match.js import, ever).
//
// The code is OUR id, never the Colyseus roomId (E6 A46): a joiner resolves it
// through `GET /lobby/resolve?code=` (lobbyResolve.ts) and then `joinById`s.
// The room is PRIVATE in the matchmaker's listing, so `join` / `joinOrCreate`
// can never wander into someone's lobby without the code.

import { randomInt } from 'node:crypto';
import { ClientState, CloseCode, ErrorCode, Room, ServerError, matchMaker, type AuthContext, type Client } from 'colyseus';
import {
  CONFIG,
  MSG,
  MapGenerationError,
  generateMap,
  resolveSeedText,
  type LobbyPhase,
} from '@salvo/shared';
import { protocolVersionError, sanitizeGun, type JoinOptions } from './roomOptions.js';
import { stagingGateError } from '../stagingGate.js';
import { assertSoloCreateAllowed } from './createThrottle.js';
import { formArena, sanitizeArenaOptions, type SeatedCaptain } from './formArena.js';
import { LobbyPolicy, cleanSeedText, mintCode } from './lobby.js';
import { lobbyTicket } from './lobbyTicket.js';
import { LobbyPlayer, LobbyState } from './schema/LobbyState.js';
import { createLogger, type Logger } from '../log.js';

/** The room name — must match app.config.ts and lobbyResolve.ts. */
export const LOBBY_ROOM = 'lobby';
/** Telemetry mode tag. */
const MODE = 'lobby';
/** Policy cadence: 1 Hz on the room clock, like the queue. Also the cadence
 *  the host's seed text is resolved at (see onSeed). */
const TICK_MS = 1000;

/** The listing-metadata block (read by `GET /lobby/resolve`). Every key is
 *  written on every call: 0.18's setMetadata REPLACES the object. */
export interface LobbyListingMeta {
  code: string;
  phase: LobbyPhase;
  mode: 'private';
}

/**
 * The matchmake METHOD a static onAuth is answering ('create', 'joinById',
 * 'joinOrCreate', …), read off the HTTP matchmaking request's own path
 * (`POST /matchmake/:method/:roomName` — @colyseus/core 0.18.13
 * router/default_routes.mjs builds the AuthContext with `req: ctx.request`).
 * Static onAuth receives no room, so this is how the door tells a CREATE from
 * a JOIN-BY-CODE. Null when there is no request to read.
 */
export function matchmakeMethodOf(context: AuthContext | undefined): string | null {
  const url: unknown = (context?.req as { url?: unknown } | undefined)?.url;
  if (typeof url !== 'string') return null;
  try {
    const parts = new URL(url, 'http://localhost').pathname.split('/');
    const at = parts.indexOf('matchmake');
    return at >= 0 && parts[at + 1] ? decodeURIComponent(parts[at + 1]) : null;
  } catch {
    return null;
  }
}

/** A [0, 1) source backed by node:crypto — a join code must not be guessable
 *  from another lobby's code. */
function cryptoRng(): number {
  return randomInt(0x1000000) / 0x1000000;
}

/**
 * The seed probe (ruling 3): does this uint32 generate a map? Only
 * MapGenerationError means "no" — the deferred map-gen throw that the suffix
 * retry routes around (the throw itself stays UNFIXED, Eric 2026-09-16). Any
 * other error is a real bug and propagates. Same arguments as World's own
 * generateMap(seed, playerCap) call.
 */
function seedGenerates(seed: number): boolean {
  try {
    generateMap(seed, CONFIG.map.playerCap);
    return true;
  } catch (err) {
    if (err instanceof MapGenerationError) return false;
    throw err;
  }
}

export class LobbyRoom extends Room<{ state: LobbyState }> {
  maxClients = CONFIG.map.playerCap;
  autoDispose = true;
  maxMessagesPerSecond = CONFIG.net.maxMessagesPerSecond;

  /**
   * The lobby's door. Seat reservations bypass the arena's onAuth (E6 A5, D8),
   * so the PV gate and the staging gate are re-run HERE, exactly as the queue
   * runs them. A CREATE (any matchmake method but joinById) also spends the
   * per-IP create bucket Solo vs AI uses (ruling 8): a lobby is a room minted
   * per request, the same flood surface.
   */
  static async onAuth(
    _token: string,
    options?: JoinOptions,
    context?: AuthContext,
  ): Promise<boolean> {
    const error = protocolVersionError(options?.pv);
    if (error) throw new ServerError(ErrorCode.AUTH_FAILED, error);
    const gate = stagingGateError(context?.headers?.get('cookie') ?? undefined);
    if (gate) throw new ServerError(ErrorCode.AUTH_FAILED, gate);
    if (matchmakeMethodOf(context) !== 'joinById') assertSoloCreateAllowed(context);
    return true;
  }

  private readonly policy = new LobbyPolicy();
  /** Sanitized identity + frozen gun per captain, ready for formArena. */
  private readonly seats = new Map<string, SeatedCaptain>();
  private phase: LobbyPhase = 'open';
  /** The resolved uint32 seed, or null = random map (ruling 3). */
  private resolvedSeed: number | null = null;
  /** Host text awaiting resolution on the next tick (null = nothing new). */
  private pendingSeed: string | null = null;
  private joinCounter = 0;
  private log: Logger = createLogger({ mode: MODE });

  async onCreate(): Promise<void> {
    this.log = createLogger({ roomId: this.roomId, mode: MODE });
    this.state = new LobbyState();
    this.state.code = mintCode(cryptoRng, await this.liveCodes());
    // PRIVATE in the listing: `join` / `joinOrCreate` skip private rooms
    // (MatchMaker.findOneRoomAvailable filters `private: false`), so the
    // only way in is joinById after a resolve. Free during CREATING.
    void this.setPrivate(true);
    this.publishListing();
    this.onMessage(MSG.lobbyReady, (client: Client, raw: unknown) => this.onReady(client, raw));
    this.onMessage(MSG.lobbySeed, (client: Client, raw: unknown) => this.onSeed(client, raw));
    this.onMessage(MSG.lobbyBotFill, (client: Client, raw: unknown) => this.onBotFill(client, raw));
    this.onMessage(MSG.lobbyStart, (client: Client) => this.onStart(client));
    this.clock.setInterval(() => this.tick(), TICK_MS);
    this.log.info('lobby.create', { code: this.state.code });
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    if (this.phase !== 'open') return;
    // Sanitized and frozen at THIS door, exactly like the queue (Story 8.14):
    // identity options ride the seat's options, the gun rides its `auth`.
    const arenaOptions = sanitizeArenaOptions(options);
    const gun = sanitizeGun(options.gun, this.log);
    this.seats.set(client.sessionId, { client, options: arenaOptions, gun });
    this.joinCounter += 1;
    const name = arenaOptions.name ?? `CAPTAIN-${this.joinCounter}`;
    this.policy.onJoin(client.sessionId, name);
    const row = new LobbyPlayer();
    row.id = client.sessionId;
    row.name = name;
    this.state.players.set(client.sessionId, row);
    this.log.info('lobby.join', { sessionId: client.sessionId, aboard: this.seats.size });
    this.armJoiningDeadline(client);
    this.sync();
  }

  onLeave(client: Client): void {
    if (!this.seats.delete(client.sessionId)) return;
    this.state.players.delete(client.sessionId);
    this.log.info('lobby.leave', { sessionId: client.sessionId, aboard: this.seats.size });
    if (this.phase !== 'open') return;
    this.policy.onLeave(client.sessionId, Date.now());
    this.sync();
  }

  onDispose(): void {
    this.log.info('lobby.dispose', { phase: this.phase });
  }

  // --- messages --------------------------------------------------------------

  /** `lr` — any captain. Non-boolean is dropped. */
  private onReady(client: Client, raw: unknown): void {
    const ready = (raw as { ready?: unknown } | null)?.ready;
    if (this.phase !== 'open' || typeof ready !== 'boolean') return;
    this.policy.onReady(client.sessionId, ready, Date.now());
    this.sync();
  }

  /**
   * `ls` — host only. The typed text shows to everyone at once; RESOLVING it
   * (a full test map generation per candidate) is coalesced onto the 1 Hz
   * tick, so a host spamming keystrokes costs at most one generation per
   * second rather than one per message. Blank clears the seed.
   */
  private onSeed(client: Client, raw: unknown): void {
    if (!this.isHostControl(client)) return;
    const text = cleanSeedText((raw as { text?: unknown } | null)?.text);
    if (text === null || text === this.state.seedText) return;
    this.state.seedText = text;
    this.state.seedResolved = '';
    this.resolvedSeed = null;
    this.pendingSeed = text === '' ? null : text;
  }

  /** `lb` — host only, boolean only. */
  private onBotFill(client: Client, raw: unknown): void {
    const on = (raw as { on?: unknown } | null)?.on;
    if (!this.isHostControl(client) || typeof on !== 'boolean') return;
    this.policy.onBotFill(client.sessionId, on, Date.now());
    this.sync();
  }

  /** `lg` — host only, and only while a start is legal (ruling 2). */
  private onStart(client: Client): void {
    if (!this.isHostControl(client) || !this.policy.forceStart(client.sessionId)) return;
    void this.form();
  }

  /** Host-only control messages from anyone else are silently dropped. */
  private isHostControl(client: Client): boolean {
    return this.phase === 'open' && client.sessionId === this.policy.hostId;
  }

  // --- the tick, the mirror, the form ----------------------------------------

  private tick(): void {
    if (this.phase !== 'open') return;
    this.flushSeed();
    const verdict = this.policy.evaluate(Date.now());
    this.sync();
    if (verdict === 'form') void this.form();
  }

  /** Resolve the pending host text (ruling 3: hash, probe, suffix retry). */
  private flushSeed(): void {
    const text = this.pendingSeed;
    if (text === null) return;
    this.pendingSeed = null;
    const resolved = resolveSeedText(text, seedGenerates);
    this.resolvedSeed = resolved?.seed ?? null;
    this.state.seedResolved = resolved?.text ?? '';
  }

  /** Mirror the policy into the schema (host, bot-fill, countdown, READY). */
  private sync(): void {
    this.state.hostId = this.policy.hostId;
    this.state.botFill = this.policy.botFill;
    this.state.countdownEndT = this.policy.countdownEndT;
    for (const captain of this.policy.captains.values()) {
      const row = this.state.players.get(captain.id);
      if (row && row.ready !== captain.ready) row.ready = captain.ready;
    }
  }

  /**
   * Form the arena: the code dies NOW (ruling 11 — metadata phase 'started'
   * answers MATCH STARTED), the room locks, and every captain is seated in
   * join order through formArena. On success the room lingers
   * CONFIG.lobby.startedLingerMs and then closes itself; on failure formArena
   * has already errored and closed every socket, so the empty room disposes.
   */
  private async form(): Promise<void> {
    if (this.phase !== 'open') return;
    this.phase = 'started';
    this.flushSeed();
    this.state.phase = 'started';
    this.state.countdownEndT = 0;
    this.publishListing();
    void this.lock();
    const seated = this.policy
      .inJoinOrder()
      .map((c) => this.seats.get(c.id))
      .filter((s): s is SeatedCaptain => s !== undefined);
    const ok = await formArena({
      createOptions: this.arenaCreateOptions(seated.length),
      seated,
      log: this.log,
      tag: 'lobby',
      formFields: () => ({ botFill: this.policy.botFill, seeded: this.resolvedSeed !== null }),
    });
    if (ok) this.linger();
  }

  /** The arena's create bag. The trust ticket is what lets mapSeed / botFill /
   *  mode through sanitizeRoomOptions; no client bag can carry it. */
  private arenaCreateOptions(captains: number): Record<string, unknown> {
    const opts: Record<string, unknown> = {
      expectedCaptains: captains,
      lobbyTicket: lobbyTicket(),
      mode: 'private',
      botFill: this.policy.botFill,
    };
    if (this.resolvedSeed !== null) opts.mapSeed = this.resolvedSeed;
    return opts;
  }

  /** Keep the (locked, emptying) room listed so a dead code answers MATCH
   *  STARTED, then close it: NO SUCH LOBBY from then on (ruling 11). */
  private linger(): void {
    this.autoDispose = false;
    this.clock.setTimeout(() => void this.disconnect(), CONFIG.lobby.startedLingerMs);
  }

  /** Every key, every time (0.18 setMetadata REPLACES). Best-effort. */
  private publishListing(): void {
    const meta: LobbyListingMeta = { code: this.state.code, phase: this.phase, mode: 'private' };
    void this.setMetadata(meta).catch((err: unknown) => {
      this.log.warn('lobby.metadataFailed', { error: err instanceof Error ? err.message : 'unknown' });
    });
  }

  /** Codes held by live lobbies (the uniqueness set for mintCode). */
  private async liveCodes(): Promise<Set<string>> {
    const rooms = await matchMaker.query({ name: LOBBY_ROOM });
    const codes = new Set<string>();
    for (const room of rooms) {
      const code = (room.metadata as { code?: unknown } | undefined)?.code;
      if (typeof code === 'string') codes.add(code);
    }
    return codes;
  }

  /**
   * JOINING-deadline kick, as on the queue: a client that never completes the
   * handshake must not hold a lobby slot (and, here, block everyone's
   * all-ready forever by being an un-ready phantom).
   */
  private armJoiningDeadline(client: Client): void {
    this.clock.setTimeout(() => {
      if (client.state === ClientState.JOINED || !this.clients.includes(client)) return;
      this.log.warn('lobby.joiningKick', { sessionId: client.sessionId });
      client.leave(CloseCode.WITH_ERROR);
    }, CONFIG.net.joiningDeadlineSeconds * 1000);
  }
}
