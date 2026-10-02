// THE ARENA-FORMING ROUTINE, shared by the two rooms that stand in front of the
// arena: StandardQueueRoom (Story 6.1) and the private LobbyRoom (cycle 167).
// Extracted verbatim in behavior from StandardQueueRoom.formMatch — create the
// arena through the matchmaker, reserve every captain's seat in one call, hand
// each its seat, and fail the rest loudly — parameterized only by the extra
// room-create options and the log tag.
//
// D8 — ONLY matchMaker.createRoom / reserveMultipleSeatsFor /
// buildSeatReservation. Never getLocalRoomById, never a Room instance: that
// would silently bind the caller to same-process co-residency with the arena
// it just created, and the whole point of routing through the matchmaker is
// that the arena may live on another process entirely. Everything below works
// on the IRoomCache handle (metadata + roomId), process-agnostic by
// construction.

import { CloseCode, ErrorCode, matchMaker, type Client } from 'colyseus';
import { sanitizeClassId, sanitizeHornId, MSG, type GunId } from '@salvo/shared';
import { sanitizeColorPref, sanitizeName, type JoinOptions } from './roomOptions.js';
import type { LogFields, Logger } from '../log.js';

/** The room name captains are seated into — must match app.config.ts. */
export const ARENA_ROOM = 'arena';

/** Client-facing message when the arena could not be created or a seat could
 *  not be reserved. Never a silent drop — the client shows this and un-busies
 *  the home screen. */
export const FORM_FAILED_ERROR = 'could not start a match — please try again';

/**
 * The IRoomCache handle matchMaker.createRoom hands back. Derived from the
 * function's own return type rather than imported by name: it is the ONLY
 * arena handle a front room ever holds, and it is deliberately metadata — not
 * a Room instance (see the D8 note above).
 */
type RoomCache = Awaited<ReturnType<typeof matchMaker.createRoom>>;

/** One captain about to be seated. */
export interface SeatedCaptain {
  client: Client;
  /**
   * Join options ALREADY run through the arena's own sanitizers (see
   * sanitizeArenaOptions). They ride the seat reservation verbatim, so
   * ArenaRoom.onJoin receives exactly the shape it receives from any door —
   * the sanitizing simply happens one door earlier.
   */
  options: JoinOptions;
  /**
   * THE FROZEN GUN (Story 8.14, amendment 95): which gun this captain picked,
   * sanitized at the front door and written into the seat reservation's
   * SERVER-ONLY `auth` payload — never into `options`, which a client can
   * shape. ArenaRoom.onJoin reads it back off `client.auth.gun`.
   */
  gun: GunId;
}

/** What one form needs. */
export interface FormArenaRequest {
  /** Room-create options for the arena (expectedCaptains, and — from the
   *  private lobby only — the trust ticket and its keys). */
  createOptions: Record<string, unknown>;
  seated: readonly SeatedCaptain[];
  log: Logger;
  /** Log event prefix: `<tag>.form` / `<tag>.formFailed`. */
  tag: string;
  /** Extra fields for the `<tag>.form` line, read when it is written. */
  formFields?: () => LogFields;
}

/**
 * The reservation's `auth` payload for a captain: whatever the front room's
 * own door left on `client.auth` (today `undefined`, which spreads to nothing
 * — a static `onAuth` returning the bare verdict `true` is mapped to
 * `undefined` by @colyseus/core 0.18.13's `callOnAuth`, and `_onJoin` assigns
 * only a TRUTHY `authData`; Epic 9 puts the account there) plus the frozen
 * GUN. Only an OBJECT is spread: a primitive verdict would otherwise be lost
 * silently and a hostile shape can never reach here (auth is server-written).
 */
export function seatAuth(client: Client, gun: GunId): Record<string, unknown> {
  const base: unknown = client.auth;
  const carried = typeof base === 'object' && base !== null ? (base as Record<string, unknown>) : {};
  return { ...carried, gun };
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
 * Sanitize the client-supplied identity options at a FRONT door, using the
 * arena's existing pure helpers. Only the plain identity options travel: the
 * dev-only room overrides (matchOverride/zoneOverride/mapSeed) are room-CREATE
 * options and are never forwarded from a joiner's bag.
 */
export function sanitizeArenaOptions(options: JoinOptions): JoinOptions {
  const out: JoinOptions = {
    name: sanitizeName(options.name),
    cls: sanitizeClassId(options.cls),
    horn: sanitizeHornId(options.horn),
    colorPref: sanitizeColorPref(options.colorPref),
  };
  // THE GUN DOES NOT TRAVEL IN `options` (Story 8.14): like the deck before
  // it, it rides the seat's server-only `auth` — see seatAuth — so the arena
  // never re-reads a client-shapeable gun off a seated captain. Deck-shaped
  // keys (`deck`, `deckId`, `deckOverride`) are gone entirely and are dropped
  // here like any other unknown key.
  return out;
}

/**
 * Create an arena and seat every captain in `seated` into it. Resolves true
 * when the arena was created and the reservation call returned (individual
 * seats may still have been refused and failed); false when the create or the
 * reservation threw and every captain was failed. Never rejects.
 */
export async function formArena(req: FormArenaRequest): Promise<boolean> {
  try {
    const arena = await matchMaker.createRoom(ARENA_ROOM, req.createOptions);
    // THE GUN RIDES `auth`, NEVER `options` (Story 8.14): the arena cannot
    // tell a reservation's options from a direct join's, but a reservation's
    // `auth` is written only by server code and surfaces as `client.auth` in
    // ArenaRoom.onJoin. Verified against @colyseus/core 0.18.13:
    // MatchMaker.mjs reserveMultipleSeatsFor :461-481 forwards each `auth` to
    // Room._reserveMultipleSeats :1344, which stores it as the seat's authData
    // :1313, and Room._onJoin :1098-1099 assigns it to `client.auth` before
    // onJoin :1125.
    const reserved = await matchMaker.reserveMultipleSeatsFor(
      arena,
      req.seated.map((p) => ({ sessionId: p.client.sessionId, options: p.options, auth: seatAuth(p.client, p.gun) })),
    );
    deliverSeats(req, arena, reserved);
    return true;
  } catch (err) {
    failSeats(req, req.seated, err);
    return false;
  }
}

/**
 * Hand each successfully-reserved captain its seat. reserveMultipleSeatsFor
 * returns a PER-SEAT boolean (the arena's _reserveSeat returns false rather
 * than throwing when the room is full), so a partial success is normal and
 * must be handled seat by seat.
 */
function deliverSeats(req: FormArenaRequest, arena: RoomCache, reserved: boolean[]): void {
  const refused: SeatedCaptain[] = [];
  for (const [i, captain] of req.seated.entries()) {
    if (!reserved[i]) {
      refused.push(captain);
      continue;
    }
    captain.client.send(MSG.seat, matchMaker.buildSeatReservation(arena, captain.client.sessionId));
  }
  req.log.info(`${req.tag}.form`, {
    arenaRoomId: arena.roomId,
    seated: req.seated.length - refused.length,
    refused: refused.length,
    ...(req.formFields?.() ?? {}),
  });
  if (refused.length > 0) failSeats(req, refused, new Error('seat reservation refused'));
}

/**
 * Never silently drop a captain a form failed for: tell them (the SDK
 * surfaces client.error as onError) and close the connection so the home
 * screen un-busies rather than sitting on a room that will never fire.
 */
function failSeats(req: FormArenaRequest, seated: readonly SeatedCaptain[], err: unknown): void {
  req.log.error(`${req.tag}.formFailed`, { ...errorFields(err), affected: seated.length });
  for (const captain of seated) {
    captain.client.error(ErrorCode.MATCHMAKE_UNHANDLED, FORM_FAILED_ERROR);
    captain.client.leave(CloseCode.WITH_ERROR);
  }
}
