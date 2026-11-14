// THE PAINT SALT (Story 11.2 review gate, F1 — anti-cheat). Every radar
// paint the server puts on the wire (a hull's `blip`, a wake's `wk`, and —
// since Story 11.3 — a crate's `blip`) fuzzes
// its mask on a seed that is salted here, server-side, from a per-room
// secret key:
//
//   salt(kind, words) = first 4 bytes (big-endian uint32, never 0) of
//                       HMAC-SHA256(paintKey, kind byte ‖ the words' exact
//                       IEEE-754 bytes)
//   paintKey          = HMAC-SHA256(roomKey, a fixed domain label)
//
// `words` are the paint's own inputs (paint time and exact pose), so the
// salt is PER PAINT: deterministic and observer-free (every observer
// painting this hull this tick draws the identical salt and glint seed), and
// carrying no ship identity (no cross-sweep correlation handle — amendment
// 157 stands). The MASK is per observer since Story 11.3 (the arc is smeared
// about the observer before the fuzz), so signals.ts's one-slot mask memos
// key on the observer's position as well as on these words.
//
// WHY. The unsalted fuzz seed is a public hash of (t, x, y, heading). Since
// Story 11.2 a plain-hull contact hands an observer a hull's exact pose
// WITHOUT its class, and the same hull's blip is fuzzed over the class's
// polygon — so a modified client could replay the fuzz for each hull id and
// keep the one that matches: the class, read at 350 hm instead of 200. Under
// the keyed salt the fuzz cannot be replayed from public inputs.
//
// WHY PER PAINT AND NOT ONE ROOM CONSTANT. A hull seen in the INNER tier
// gives pose AND class, so a constant 32-bit salt could be brute-forced
// offline from one such paint and then reused on every plain hull. Under an
// HMAC per paint a recovered salt reveals nothing about the key or about any
// other paint's salt.
//
// THE KEY is derived from the room's `dispersionKey` under its own label —
// the plain-handle key's precedent (game/plainHandle.ts): standard key
// separation, never XOR, no material shared with another observable stream
// (the Story 11.1 review rule). OFFLINE runs (tests, batch sims, the RL env)
// get the seed-derived key and replay every mask exactly.
//
// RESIDUAL (pre-existing, accepted): the mask is still fuzzed over the true
// footprint, so hull SIZE shows through a paint — "inferable with skill,
// never readable" (amendment 68). The salt closes the exact replay only.

import { createHmac } from 'node:crypto';

/** The label the paint key is derived under — a fixed domain separator, not a secret. */
const PAINT_KEY_LABEL = 'hullcracker/paint-salt-key/v1';

/** What is being painted — a domain byte, so a hull and a segment that happen
 *  to share their words never share a salt. */
export type PaintKind = 'hull' | 'wake' | 'crate';

const KIND_BYTE: Readonly<Record<PaintKind, number>> = { hull: 1, wake: 2, crate: 3 };

/** The room's paint-salt key, derived from its dispersion key (see the header). */
export function paintSaltKey(roomKey: Uint8Array): Buffer {
  return createHmac('sha256', roomKey).update(PAINT_KEY_LABEL).digest();
}

/** One paint's 32-bit salt (see the header). Never 0 — 0 is the shared
 *  pipeline's "unsalted" value. */
export function paintSalt(key: Uint8Array, kind: PaintKind, words: readonly number[]): number {
  const msg = Buffer.alloc(1 + words.length * 8);
  msg.writeUInt8(KIND_BYTE[kind], 0);
  for (let i = 0; i < words.length; i++) msg.writeDoubleBE(words[i], 1 + i * 8);
  return createHmac('sha256', key).update(msg).digest().readUInt32BE(0) || 1;
}
