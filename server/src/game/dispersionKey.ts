// THE DISPERSION KEY (Story 11.1 review fix — anti-cheat). Every gun shell's
// dispersion seed is minted here, server-side, from a per-room secret key:
//
//   seed(ordinal) = first 4 bytes (big-endian uint32) of
//                   HMAC-SHA256(key, ordinal as 8-byte big-endian)
//
// WHY A KEYED HASH. A shooter sees its own shells' exact landings and every
// shell's ordinal is public (its id is `s<ordinal>`), so one shell's 32-bit
// seed is brute-forceable from its landing in seconds. Under the first cut
// (`priv ^ const ^ imul(ordinal, K)`) that recovered the room's pseudonym
// material and with it EVERY room-private stream (track ids, beacons,
// airdrops, dropout, fog) plus every later shell. Under an HMAC a recovered
// seed reveals nothing about the key, about any other shell's seed or about
// any other stream — and the key is independent of `priv` by construction.
//
// `shared` stays pure and crypto-free: the shared dispersion math
// (`dispersedPoint` / `dispersedLanding`) keeps taking a plain 32-bit seed.

import { createHash, createHmac, randomBytes } from 'node:crypto';

/** Bytes in a dispersion key. */
export const DISPERSION_KEY_BYTES = 32;

/** The label the OFFLINE key is hashed under — a fixed domain separator, not a secret. */
const OFFLINE_KEY_LABEL = 'hullcracker/dispersion-key/v1';

/** A fresh random per-room key — what ArenaRoom passes for every real room. */
export function freshDispersionKey(): Buffer {
  return randomBytes(DISPERSION_KEY_BYTES);
}

/**
 * The OFFLINE key (batch sims, tests, the RL env — never a production room):
 * SHA-256 over the fixed label, the map seed and the pseudonym material, so
 * an offline run with the same seeds replays every landing exactly.
 */
export function offlineDispersionKey(mapSeed: number, pseudonymMaterial: number): Buffer {
  const seeds = Buffer.alloc(8);
  seeds.writeUInt32BE(mapSeed >>> 0, 0);
  seeds.writeUInt32BE(pseudonymMaterial >>> 0, 4);
  return createHash('sha256').update(OFFLINE_KEY_LABEL).update(seeds).digest();
}

/** One shell's 32-bit dispersion seed from the room's key and the shell's ordinal (see the header). */
export function dispersionShellSeed(key: Uint8Array, ordinal: number): number {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.max(0, Math.trunc(ordinal))), 0);
  return createHmac('sha256', key).update(msg).digest().readUInt32BE(0);
}
