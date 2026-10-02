// THE LOBBY TRUST TICKET (private lobbies, cycle 167 — spec Design Notes,
// "Why a trust ticket").
//
// `mapSeed`, `botFill` and `mode: 'private'` are room-CREATE options, and
// room-create options reach ArenaRoom.onCreate from wherever the create came
// from — including a client's own `client.create('arena', {solo:true, ...})`.
// So they cannot be honoured on their face: a production client must never pin
// a map or fill its own room with bots by naming a key.
//
// The private lobby needs to pass exactly those keys to the arena it forms. It
// does so through `matchMaker.createRoom` from SERVER code, carrying this
// ticket: a random string minted once per process at module load, known only
// to server modules, never sent to any client and never echoed into a
// sanitized option bag. `sanitizeRoomOptions` admits the three keys only when
// the bag carries this exact value.
//
// PER PROCESS, deliberately: no env secret, no deploy change. The lobby and the
// arena it creates are created through the same matchMaker call path; if a
// future multi-process deployment ever placed the arena on another process,
// the ticket would not match there and the arena would fall back to the
// ordinary untrusted behavior (random map, no bots) — fail CLOSED, never open.

import { randomBytes } from 'node:crypto';

/** 32 random bytes as hex — unguessable, and minted once per process. */
const TICKET = randomBytes(32).toString('hex');

/** This process's ticket. Server-only: never put it on the wire. */
export function lobbyTicket(): string {
  return TICKET;
}

/** True only for this process's exact ticket string. */
export function isTrustedTicket(x: unknown): boolean {
  return typeof x === 'string' && x === TICKET;
}
