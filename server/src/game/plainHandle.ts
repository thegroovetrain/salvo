// THE PLAIN-HULL HANDLE (Story 11.2, Eric 2026-11-12, R3 — anti-cheat). A
// hull seen by eye beyond the class-and-name reach rides the frame as a
// `PlainContact`: pose under an ANONYMOUS handle `h`. This module mints that
// handle, server-side, from a per-room secret key:
//
//   handle(ordinal) = base64url of the first 6 bytes of
//                     HMAC-SHA256(handleKey, ordinal as 8-byte big-endian)
//   handleKey       = HMAC-SHA256(roomKey, a fixed domain label)
//
// `ordinal` is the World's own mint counter — one tick per handle ever
// minted in the room, across every observer. NEITHER SHIP ID IS AN INPUT.
//
// WHY IT CANNOT BE LINKED TO A ROSTER ID OR A CLASS.
//   - The handle is a keyed hash of a counter, so it carries nothing about
//     the hull it names: not its id, not its class, not the observer.
//   - PER OBSERVER: every observer's handle for a hull is its own mint, so
//     two colluding observers comparing frames find no shared token.
//   - PER VISIT: perception forgets a handle the first pass its hull is not a
//     plain contact (it left the band outward, crossed into the full tier,
//     sank, or went behind an island), and the next visit mints a new one. A
//     stable handle would link a hull to its class after one close pass.
//   - The counter itself never reaches a client, and under an HMAC a handle
//     reveals nothing about the key, the ordinal or any other handle — so an
//     observer cannot count how many handles OTHER observers were issued
//     (which would leak who else is looking at whom).
//
// THE KEY is derived from the room's `dispersionKey` (32 random bytes per
// real room — game/dispersionKey.ts) under a fixed label. HMAC under a
// distinct message is a standard key separation: the two derived streams
// (shell seeds, handles) are independent, and neither is derived from the
// room's pseudonym material by XOR (the Story 11.1 review rule). OFFLINE runs
// (tests, batch sims, the RL env) get the seed-derived key and replay
// exactly.
//
// `World.pseudonymFor` IS DELIBERATELY NOT REUSED: that track id is stable
// for the whole match and the same for every observer — exactly the two
// properties this handle must not have.

import { createHmac } from 'node:crypto';

/** The label the handle key is derived under — a fixed domain separator, not a secret. */
const HANDLE_KEY_LABEL = 'hullcracker/plain-handle-key/v1';

/** Bytes of the HMAC a handle keeps (48 bits → 8 base64url characters). */
const HANDLE_BYTES = 6;

/** The room's plain-handle key, derived from its dispersion key (see the header). */
export function plainHandleKey(roomKey: Uint8Array): Buffer {
  return createHmac('sha256', roomKey).update(HANDLE_KEY_LABEL).digest();
}

/** The handle for one mint ordinal (see the header). */
export function plainHandle(key: Uint8Array, ordinal: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.max(0, Math.trunc(ordinal))), 0);
  return createHmac('sha256', key).update(msg).digest().subarray(0, HANDLE_BYTES).toString('base64url');
}
