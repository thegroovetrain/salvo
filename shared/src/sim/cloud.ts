// MULTI-SPECTRAL COUNTERMEASURE cloud geometry (Story 9.3; re-cut by Story
// 9.3 session 2, Eric ruling 2026-10-12). The cloud is a CLIENT VISUAL
// OVERLAY — "just draw it on top of ships": the server hides nothing behind
// or inside it. The server only PLACES the cloud (at the pressing hull's
// centre) and TIMES it; each client paints it as smoke sprayed into a bitmap.
//
// What both sides read here is the SPRAY DISC: its radius grows linearly from
// `r0` at birth to `r1` at `lifeMs` (`cloudOutlineRadius`). The server's
// `cloud` delivery gate senses that disc; the client sprays inside it. The
// spray's look and its fade are client feel knobs (CLIENT_CONFIG), not
// gameplay. (History: cycle 174 simulated 300 seeded pixels here that blocked
// sight and radar — that machinery is deleted.)
//
// THE SIZE AND LIFE ARE THE CLOUD'S OWN (Story 10.6, Eric 2026-11-05, R9 /
// I6): the SMOKE SCREEN cards grow the disc and lengthen the life, so a press
// STAMPS the owner's `EffectiveStats.smoke` `{ lifeMs, r0, r1 }` on the cloud
// and every function here reads the stamped values — never CONFIG. A card
// taken after the press never changes a live cloud. They ride `CloudView`.
//
// NO TRANSCENDENTALS in this file (the map-gen posture). Not wounded smoke:
// `CONFIG.smoke` (the damage-band plume) is a different thing entirely. Pure,
// zero I/O, plain objects.

/** A cloud's stamped size and life (Story 10.6, I6) — the owner's
 *  `EffectiveStats.smoke` at the press. */
export interface CloudSize {
  readonly lifeMs: number; // ms the cloud lives
  readonly r0: number; // u — the spray disc's radius at birth
  readonly r1: number; // u — the spray disc's radius at the end of its life
}

/**
 * One countermeasure cloud — the SERVER store record (ids `cl${n}`).
 * Stationary for its whole life: made at the hull's centre at `bornAt`,
 * deleted at `until` (= bornAt + its stamped `lifeMs`). It outlives its
 * owner. Never sent as-is: the wire shape is `CloudView` (types.ts).
 */
export interface CloudRecord extends CloudSize {
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

/** The outward scale at `ageMs`: 1 at birth, r1/r0 at its `lifeMs`, clamped. */
export function cloudScale(ageMs: number, size: CloudSize): number {
  const { r0, r1, lifeMs } = size;
  const f = Math.min(1, Math.max(0, ageMs / lifeMs));
  return 1 + (r1 / r0 - 1) * f;
}

/** u — the cloud's spray-disc radius at `ageMs`: r0 → r1 linearly over its life. */
export function cloudOutlineRadius(ageMs: number, size: CloudSize): number {
  return size.r0 * cloudScale(ageMs, size);
}
