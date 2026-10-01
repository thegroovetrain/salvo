// SMOKE SCREEN puff geometry (Story 8.18, catalog-v3 R38; Eric rulings
// 2026-09-29, epic-8 amendments 138–145) — THE one growth curve for a laid
// puff, run by BOTH sides. The server's sight predicate (`sightClear` in
// server/src/game/signals.ts) evaluates it at the tick's `now`; the client
// evaluates it from the wire `t0` (SmokeView) and the frame's server time
// (`FrameMsg.t`, advanced by its server-clock estimate). Because the curve is
// shared and deterministic, NO RADIUS RIDES THE WIRE — the wire carries only
// the birth stamp, and both sides derive the identical radius from it. Never
// re-derive the curve per side.
//
// Not wounded smoke: `CONFIG.smoke` (the damage-band plume, 250 ms cadence,
// client-synthesized, occludes nothing) is a different thing entirely; this
// module reads only `CONFIG.smokeScreen`. Pure, zero I/O, plain objects.

import { CONFIG } from '../constants.js';

/**
 * One laid SMOKE SCREEN puff — the SERVER store record (`world.smoke`, ids
 * `sk${n}`). Stationary for its whole life: laid at the layer's CENTER (its own
 * position, amendment 190) at
 * `bornAt`, deleted at `until` (= bornAt + CONFIG.smokeScreen.lifeMs). It
 * outlives its owner (everything on the water does). Never sent as-is: the
 * wire shape is `SmokeView` (types.ts) — no owner, no `until`, no radius.
 */
export interface SmokePuff {
  readonly id: string;
  readonly ownerId: string;
  readonly x: number; // u — puff centre
  readonly y: number; // u
  readonly bornAt: number; // ms — server time the puff was laid
  readonly until: number; // ms — server time the puff is removed
}

/**
 * The puff's radius at server time `now`: linear growth from
 * `CONFIG.smokeScreen.r0` at `bornAt` to `r1` at `bornAt + expandMs`, clamped
 * at both ends — a `now` before `bornAt` (a client clock a hair behind the
 * stamp) gives r0, and past full growth it stays r1.
 */
export function puffRadius(bornAt: number, now: number): number {
  const { r0, r1, expandMs } = CONFIG.smokeScreen;
  const f = Math.min(1, Math.max(0, now - bornAt) / expandMs);
  return r0 + (r1 - r0) * f;
}
