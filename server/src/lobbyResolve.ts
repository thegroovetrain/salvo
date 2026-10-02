// `GET /lobby/resolve?code=` (private lobbies, cycle 167) — turns a typed
// join code into the Colyseus roomId the client then `joinById`s. Why a route
// rather than Colyseus `filterBy`: the code is minted server-side AFTER the
// room is created, so it is not among the options filterBy matches against,
// and a route answers LOBBY FULL / MATCH STARTED cleanly before any socket
// work (spec Design Notes).
//
// Shape follows liveness.ts: a PURE resolver over a plain listing array, and a
// two-line adapter that feeds it `matchMaker.query({ name: 'lobby' })` — the
// DRIVER-backed listing (D8: never matchMaker.stats or a local room handle).
// Every input is answered; nothing here can 500 on a bad code.

import { matchMaker, createEndpoint } from 'colyseus';
import type { LobbyResolveResponse } from '@salvo/shared';
import { normalizeCode } from './rooms/lobby.js';

/** Must match app.config.ts's define and LobbyRoom.LOBBY_ROOM. */
const LOBBY_ROOM = 'lobby';

/** The listing fields the resolver reads (structural, for tests). */
export interface LobbyListing {
  roomId: string;
  clients: number;
  maxClients: number;
  metadata?: unknown;
}

export interface ResolveAnswer {
  status: 200 | 404 | 409;
  body: LobbyResolveResponse;
}

const NO_SUCH: ResolveAnswer = { status: 404, body: { reason: 'NO SUCH LOBBY' } };

/** The listing's code/phase, or null when its metadata is not a bag. */
function metaOf(room: LobbyListing): { code?: unknown; phase?: unknown } | null {
  return typeof room.metadata === 'object' && room.metadata !== null
    ? (room.metadata as { code?: unknown; phase?: unknown })
    : null;
}

/**
 * Resolve a raw `code` against the live lobby listings. Uppercased + trimmed;
 * anything but exactly six letters A–Z is NO SUCH LOBBY (404). A lobby whose
 * match has formed answers MATCH STARTED (409) while it lingers; a full one
 * LOBBY FULL (409); otherwise 200 with its roomId.
 */
export function resolveLobby(raw: unknown, rooms: readonly LobbyListing[]): ResolveAnswer {
  const code = normalizeCode(raw);
  if (code === null) return NO_SUCH;
  const room = rooms.find((r) => metaOf(r)?.code === code);
  if (!room) return NO_SUCH;
  if (metaOf(room)?.phase === 'started') return { status: 409, body: { reason: 'MATCH STARTED' } };
  if (room.clients >= room.maxClients) return { status: 409, body: { reason: 'LOBBY FULL' } };
  return { status: 200, body: { roomId: room.roomId } };
}

/** The driver query, injectable for tests. */
export type LobbyQuery = () => Promise<LobbyListing[]>;

async function driverQuery(): Promise<LobbyListing[]> {
  return await matchMaker.query({ name: LOBBY_ROOM });
}

/** Resolve through a query; a failed query answers NO SUCH LOBBY, never 500. */
export async function resolveLobbyCode(raw: unknown, query: LobbyQuery = driverQuery): Promise<ResolveAnswer> {
  if (normalizeCode(raw) === null) return NO_SUCH;
  try {
    return resolveLobby(raw, await query());
  } catch {
    return NO_SUCH;
  }
}

/** The `code` query parameter as one value (a repeated `?code=` arrives as an
 *  array from better-call — not a code). */
function codeParam(query: unknown): unknown {
  return typeof query === 'object' && query !== null ? (query as { code?: unknown }).code : undefined;
}

/**
 * GET /lobby/resolve?code=XXXXXX. No-store: the answer is a live fact (a
 * lobby fills, starts, dies). CORS comes from Colyseus's router, as for
 * /liveness.
 */
export const lobbyResolveEndpoint = createEndpoint(
  '/lobby/resolve',
  { method: 'GET' },
  async (ctx) => {
    const answer = await resolveLobbyCode(codeParam(ctx.query));
    ctx.setHeader('Cache-Control', 'no-store');
    ctx.setStatus(answer.status);
    return ctx.json(answer.body);
  },
);
