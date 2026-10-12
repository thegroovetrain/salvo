// MULTI-SPECTRAL COUNTERMEASURE cloud geometry (Story 9.3; re-cut by Story
// 9.3 session 2, Eric ruling 2026-10-12). The cloud is a CLIENT VISUAL
// OVERLAY — "just draw it on top of ships": the server hides nothing behind
// or inside it. The server only PLACES the cloud (at the pressing hull's
// centre) and TIMES it (`CONFIG.countermeasure.lifeMs`); each client paints
// it as smoke sprayed into a bitmap. ONLY {id,x,y,t0} rides the wire
// (CloudView).
//
// What both sides read here is the SPRAY DISC: its radius grows linearly from
// `r0` at birth to `r1` at `lifeMs` (`cloudOutlineRadius`). The server's
// `cloud` delivery gate senses that disc; the client sprays inside it. The
// spray's look and its fade are client feel knobs (CLIENT_CONFIG), not
// gameplay. (History: cycle 174 simulated 300 seeded pixels here that blocked
// sight and radar — that machinery is deleted.)
//
// NO TRANSCENDENTALS in this file (the map-gen posture). Not wounded smoke:
// `CONFIG.smoke` (the damage-band plume) is a different thing entirely; this
// module reads only `CONFIG.countermeasure`. Pure, zero I/O, plain objects.

import { CONFIG } from '../constants.js';

/**
 * One countermeasure cloud — the SERVER store record (ids `cl${n}`).
 * Stationary for its whole life: made at the hull's centre at `bornAt`,
 * deleted at `until` (= bornAt + CONFIG.countermeasure.lifeMs). It outlives
 * its owner. Never sent as-is: the wire shape is `CloudView` (types.ts).
 */
export interface CloudRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number; // u — cloud centre
  readonly y: number; // u
  readonly bornAt: number; // ms — server time the cloud was made
  readonly until: number; // ms — server time the cloud is removed
}

/** The minimal cloud shape a reader needs (a CloudRecord fits). */
export interface CloudPlace {
  readonly x: number;
  readonly y: number;
  readonly bornAt: number;
}

/** The outward scale at `ageMs`: 1 at birth, r1/r0 at `lifeMs`, clamped. */
export function cloudScale(ageMs: number): number {
  const { r0, r1, lifeMs } = CONFIG.countermeasure;
  const f = Math.min(1, Math.max(0, ageMs / lifeMs));
  return 1 + (r1 / r0 - 1) * f;
}

/** u — the cloud's spray-disc radius at `ageMs`: r0 → r1 linearly over lifeMs. */
export function cloudOutlineRadius(ageMs: number): number {
  return CONFIG.countermeasure.r0 * cloudScale(ageMs);
}
