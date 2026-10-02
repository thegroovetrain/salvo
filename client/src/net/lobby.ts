// PRIVATE LOBBIES (cycle 167, Eric rulings 2026-10-02) — the third door's net
// layer. It is the queue's two-stage join with a different stage 1:
//
//   STAGE 1 — the `lobby` room. CREATE is `client.create('lobby', joinOptions)`
//   (a fresh room, its creator the host). JOIN resolves the typed 6-letter code
//   over HTTP first (`GET /lobby/resolve?code=` → `{roomId}` or a refusal
//   reason) and then `client.joinById(roomId, joinOptions)`. The code is never
//   the Colyseus roomId (E6 A46), which is why the resolve hop exists at all.
//
//   STAGE 2 — unchanged. The lobby hands out the SAME `MSG.seat` reservation the
//   queue does and `arenaFromSeat` (net/connection.ts) runs the queue's stage 2
//   byte for byte: consume, outfit, welcome.
//
// ONE-WAY DATA FLOW. The schema is folded into a plain `LobbyView` here and
// pushed through `hooks.onLobby` on every state change; the UI (ui/lobbyModal.ts)
// paints views and calls the senders below, and never touches the room.
//
// THE STARTS IN CLOCK IS ANCHORED AT ARRIVAL, not at `countdownEndT`. The lobby
// schema carries the countdown as an absolute SERVER-clock instant, and before
// the arena welcome this client has no server clock (the frame-driven
// `ServerClock` lives in the arena). A raw `countdownEndT - Date.now()` would be
// as wrong as the player's machine clock is — minutes, on a badly-set laptop. So
// the moment a NEW `countdownEndT` arrives we anchor `Date.now() +
// CONFIG.lobby.countdownMs`: the server arms the count as `now + countdownMs`
// and the patch lands within one patch interval, so the local deadline is that
// latency late and never skewed. Every observer sees the arm as it happens —
// a late join CANCELS a running count (ruling 10), so nobody ever first meets a
// countdown already in flight. The server owns the truth either way; this is a
// 10 s cosmetic readout.

import { Client, type Room, type SeatReservation } from '@colyseus/sdk';
import {
  CONFIG,
  DEFAULT_GUN,
  MSG,
  type GunId,
  type LobbyBotFillMsg,
  type LobbyPhase,
  type LobbyReadyMsg,
  type LobbyResolveResponse,
  type LobbySeedMsg,
} from '@salvo/shared';
import {
  arenaFromSeat,
  connectErrorStatus,
  joinOptions,
  QueueError,
  wsEndpoint,
  type Connection,
} from './connection.js';

/** Eric's ruling-9 refusal copy — shown verbatim by the JOIN modal. */
export type LobbyRefusal = 'NO SUCH LOBBY' | 'LOBBY FULL' | 'MATCH STARTED';

const REFUSALS: readonly LobbyRefusal[] = ['NO SUCH LOBBY', 'LOBBY FULL', 'MATCH STARTED'];

export function isLobbyRefusal(s: unknown): s is LobbyRefusal {
  return REFUSALS.some((r) => r === s);
}

export interface LobbyCaptain {
  id: string;
  name: string;
  ready: boolean;
}

/** The plain, UI-facing fold of the lobby schema. */
export interface LobbyView {
  code: string;
  hostId: string;
  mySessionId: string;
  seedText: string;
  botFill: boolean;
  /** The server's absolute instant (server clock); 0 = no countdown. */
  countdownEndT: number;
  /** The same deadline in THIS client's epoch (see the header), or null. */
  deadlineAt: number | null;
  /** In join order — the MapSchema's insertion order. */
  players: LobbyCaptain[];
  phase: LobbyPhase;
}

export interface LobbyHooks {
  /** Every state change while aboard the lobby. */
  onLobby(view: LobbyView): void;
  /** The seat landed: the lobby is over and the arena handshake begins. */
  onSeat(): void;
  /** A refusal (`LobbyRefusal`) or the existing connect-failure copy. Terminal. */
  onError(reason: string): void;
  /** The player's own LEAVE completed. Terminal and quiet. */
  onLeft(): void;
}

/** The deploy identity — exactly what the queue door sends. */
export interface LobbyDeploy {
  name?: string;
  cls?: string;
  gun?: GunId;
}

// --- pure helpers (tested) ---------------------------------------------------

/** What the code field holds: uppercased, A–Z only, at most `codeLength`. */
export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CONFIG.lobby.codeLength);
}

/** Exactly `codeLength` letters A–Z — the only shape worth a resolve. */
export function isWellFormedCode(code: string): boolean {
  return code.length === CONFIG.lobby.codeLength && /^[A-Z]+$/.test(code);
}

/** The seed text as sent: trimmed and capped (the server re-applies both). */
export function clampSeedText(raw: string): string {
  return raw.trim().slice(0, CONFIG.lobby.seedTextMax);
}

/** The resolve route, on the same HTTP origin `/liveness` uses. */
export function lobbyResolveUrl(code: string): string {
  const origin = wsEndpoint().replace(/^ws/, 'http').replace(/\/+$/, '');
  return `${origin}/lobby/resolve?code=${encodeURIComponent(code)}`;
}

/**
 * A `joinById` rejection that is really a refusal. The matchmaker answers
 * MATCHMAKE_INVALID_ROOM_ID (522) both for a room that filled (Colyseus locks a
 * room at `maxClients`: `is locked`) and for one that vanished between the
 * resolve and the join (`not found`). Anything else is a connect failure.
 */
export function joinByIdRefusal(err: unknown): LobbyRefusal | null {
  const e = err as { code?: unknown; message?: unknown } | null | undefined;
  if (e?.code !== 522) return null;
  return /locked/i.test(String(e.message ?? '')) ? 'LOBBY FULL' : 'NO SUCH LOBBY';
}

/** Turns successive `countdownEndT` values into client-epoch deadlines. */
export function makeDeadlineAnchor(now: () => number = Date.now): (endT: number) => number | null {
  let lastEnd = 0;
  let anchored: number | null = null;
  return (endT) => {
    if (!(endT > 0)) {
      lastEnd = 0;
      anchored = null;
    } else if (endT !== lastEnd) {
      lastEnd = endT;
      anchored = now() + CONFIG.lobby.countdownMs;
    }
    return anchored;
  };
}

/** The slice of the lobby schema this module reads (structural, decoder-agnostic). */
export interface LobbyStateLike {
  code?: string;
  hostId?: string;
  seedText?: string;
  botFill?: boolean;
  countdownEndT?: number;
  phase?: string;
  players?: {
    forEach(fn: (p: { id?: string; name?: string; ready?: boolean }, key: string) => void): void;
  };
}

function rosterOf(state: LobbyStateLike): LobbyCaptain[] {
  const out: LobbyCaptain[] = [];
  state.players?.forEach((p, key) => {
    out.push({ id: p.id ?? key, name: p.name ?? '', ready: p.ready === true });
  });
  return out;
}

export function lobbyView(
  state: LobbyStateLike,
  mySessionId: string,
  deadlineAt: number | null,
): LobbyView {
  return {
    code: state.code ?? '',
    hostId: state.hostId ?? '',
    mySessionId,
    seedText: state.seedText ?? '',
    botFill: state.botFill === true,
    countdownEndT: state.countdownEndT ?? 0,
    deadlineAt,
    players: rosterOf(state),
    phase: state.phase === 'started' ? 'started' : 'open',
  };
}

// --- the session -------------------------------------------------------------

interface Session {
  room: Room;
  /** Set by `leaveLobby`, so our own close is not reported as a failure. */
  leaving: boolean;
  /** Settles `sitInLobby` — LEAVE calls it directly, so a dead socket whose
   *  close never comes back cannot strand the player in a lobby they left. */
  end: (o: Outcome) => void;
}

/** The one live lobby, if any — the senders' target. */
let active: Session | null = null;

type Outcome = { seat: SeatReservation } | { left: true } | { error: string };

const LOBBY_CLOSED = (): string => connectErrorStatus(new QueueError('lobby closed'));

/**
 * Sit in the lobby until it ends: the seat, the player's LEAVE, or a failure.
 * Views stop flowing the moment any of those lands.
 */
function sitInLobby(s: Session, hooks: LobbyHooks): Promise<Outcome> {
  return new Promise((resolve) => {
    let done = false;
    const end = (o: Outcome): void => {
      if (done) return;
      done = true;
      resolve(o);
    };
    s.end = end;
    const anchor = makeDeadlineAnchor();
    const push = (state: LobbyStateLike): void => {
      if (done || !state) return;
      hooks.onLobby(lobbyView(state, s.room.sessionId, anchor(state.countdownEndT ?? 0)));
    };
    s.room.onStateChange((state: LobbyStateLike) => push(state));
    s.room.onMessage(MSG.seat, (res: SeatReservation) => end({ seat: res }));
    s.room.onError(() => end({ error: LOBBY_CLOSED() }));
    s.room.onLeave(() => end(s.leaving ? { left: true } : { error: LOBBY_CLOSED() }));
    const initial = s.room.state as LobbyStateLike | undefined;
    if (initial?.code) push(initial);
  });
}

/** Stage 2 off the seat; any failure is reported and settles null. */
async function boardArena(
  client: Client,
  seat: SeatReservation,
  hooks: LobbyHooks,
): Promise<Connection | null> {
  try {
    return await arenaFromSeat(client, seat);
  } catch (err) {
    console.error('[net] private arena handshake failed', err);
    hooks.onError(connectErrorStatus(err));
    return null;
  }
}

/** Run one lobby from an acquired room to its end. */
async function runLobby(client: Client, room: Room, hooks: LobbyHooks): Promise<Connection | null> {
  const s: Session = { room, leaving: false, end: () => undefined };
  active = s;
  const outcome = await sitInLobby(s, hooks);
  if (active === s) active = null;
  if ('left' in outcome) {
    hooks.onLeft();
    return null;
  }
  if ('error' in outcome) {
    void room.leave().catch(() => undefined);
    hooks.onError(outcome.error);
    return null;
  }
  hooks.onSeat();
  // The reservation is the matchmaker's, not the lobby's — drop the lobby
  // socket now, exactly as the queue path does.
  void room.leave().catch(() => undefined);
  return await boardArena(client, outcome.seat, hooks);
}

function optionsFor(deploy: LobbyDeploy): Record<string, unknown> {
  return joinOptions(deploy.name || undefined, deploy.cls, deploy.gun ?? DEFAULT_GUN);
}

/**
 * CREATE. Resolves the arena `Connection` once the welcome lands, or NULL when
 * the lobby ended any other way — the hooks have already said why.
 */
export async function createLobby(deploy: LobbyDeploy, hooks: LobbyHooks): Promise<Connection | null> {
  const client = new Client(wsEndpoint());
  let room: Room;
  try {
    room = await client.create('lobby', optionsFor(deploy));
  } catch (err) {
    console.error('[net] lobby create failed', err);
    hooks.onError(connectErrorStatus(err));
    return null;
  }
  return await runLobby(client, room, hooks);
}

/** `GET /lobby/resolve` → the roomId, or the refusal to show. Throws on transport failure. */
export async function resolveLobbyCode(code: string): Promise<{ roomId: string } | { reason: LobbyRefusal }> {
  const res = await fetch(lobbyResolveUrl(code), { method: 'GET', cache: 'no-store' });
  const body = (await res.json()) as Partial<LobbyResolveResponse> & { roomId?: unknown; reason?: unknown };
  if (res.ok && typeof body.roomId === 'string' && body.roomId !== '') return { roomId: body.roomId };
  if (isLobbyRefusal(body.reason)) return { reason: body.reason };
  throw new Error(`lobby resolve answered ${res.status}`);
}

/** Resolve + `joinById`, mapping every refusal; null after reporting one. */
async function acquireByCode(client: Client, code: string, deploy: LobbyDeploy, hooks: LobbyHooks): Promise<Room | null> {
  try {
    const resolved = await resolveLobbyCode(code);
    if ('reason' in resolved) {
      hooks.onError(resolved.reason);
      return null;
    }
    return await client.joinById(resolved.roomId, optionsFor(deploy));
  } catch (err) {
    const refusal = joinByIdRefusal(err);
    if (refusal === null) console.error('[net] lobby join failed', err);
    hooks.onError(refusal ?? connectErrorStatus(err));
    return null;
  }
}

/**
 * JOIN. `code` is normalized here too (any case, stray characters dropped); a
 * code that is not exactly six letters is refused locally as NO SUCH LOBBY
 * without a request.
 */
export async function joinLobby(
  rawCode: string,
  deploy: LobbyDeploy,
  hooks: LobbyHooks,
): Promise<Connection | null> {
  const code = normalizeCode(rawCode);
  if (!isWellFormedCode(code)) {
    hooks.onError('NO SUCH LOBBY');
    return null;
  }
  const client = new Client(wsEndpoint());
  const room = await acquireByCode(client, code, deploy, hooks);
  if (room === null) return null;
  return await runLobby(client, room, hooks);
}

// --- senders (the modal's only way to talk to the room) ----------------------

export function sendReady(ready: boolean): void {
  const msg: LobbyReadyMsg = { ready };
  active?.room.send(MSG.lobbyReady, msg);
}

export function sendSeed(text: string): void {
  const msg: LobbySeedMsg = { text: clampSeedText(text) };
  active?.room.send(MSG.lobbySeed, msg);
}

export function sendBotFill(on: boolean): void {
  const msg: LobbyBotFillMsg = { on };
  active?.room.send(MSG.lobbyBotFill, msg);
}

export function sendStart(): void {
  active?.room.send(MSG.lobbyStart, {});
}

/** LEAVE: close the lobby socket; the session settles through `hooks.onLeft`. */
export function leaveLobby(): void {
  const s = active;
  if (s === null) return;
  s.leaving = true;
  s.end({ left: true });
  void s.room.leave().catch(() => undefined);
}

/** Is a lobby socket live? (main.ts / tests.) */
export function lobbyActive(): boolean {
  return active !== null;
}
