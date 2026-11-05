// THE C / V PRESS LATCH (Story 10.5 review gate, Blind Hunter F2).
//
// The client's `C` / `V` pre-denial reads the own block's cooldown stamp
// (`repairReadyAt` / `smokeReadyAt`), which the server writes only once it has
// applied the press — a round trip later. A second press inside that round
// trip used to pass the local check, play the ACTIVATED pop, and then take the
// server's `cooling` denial on the same square. The latch closes that window:
// a press the client accepted shuts its ability's latch, and while shut a
// further press of that ability is refused locally (the cooling press's denied
// mark, nothing sent) until the server has answered —
//   * an own frame that carries the ability COOLING (the stamp arrived), or
//   * a server denial for that ability;
// and, so a lost answer can never wedge the key, a SAFETY VALVE: after
// PENDING_CAPACITY own frames without an answer — the predictor's own bound,
// past which it gives up on an input too (the same valve the own battery's
// predicted shots use) — the latch opens anyway.
//
// Pure functions over a plain record; main.ts holds the value and wires the
// press, the own frame and the denial into it (net → sim; render never writes).

import { abilityReady, type CooldownAbilityId, type OwnShip } from '@salvo/shared';
import { PENDING_CAPACITY } from './prediction.js';

/** Per cooldown ability: the own frames seen since an accepted press still
 *  awaiting the server's word, or `null` when the latch is open. */
export type AbilityLatches = Readonly<Record<CooldownAbilityId, number | null>>;

/** Both latches open — the value at construction and after any life / session
 *  boundary. */
export const OPEN_LATCHES: AbilityLatches = Object.freeze({ repair: null, smoke: null });

/** Is `id`'s latch shut (a press of it is awaiting the server's word)? */
export function latchHolds(l: AbilityLatches, id: CooldownAbilityId): boolean {
  return l[id] !== null;
}

/** A press of `id` the client accepted and sent: shut its latch. */
export function latchPress(l: AbilityLatches, id: CooldownAbilityId): AbilityLatches {
  return { ...l, [id]: 0 };
}

/** The server denied a press of `id`: open its latch. */
export function latchRelease(l: AbilityLatches, id: CooldownAbilityId): AbilityLatches {
  return l[id] === null ? l : { ...l, [id]: null };
}

/** One own frame at server-clock `now`: a shut latch opens when the frame
 *  carries its ability cooling, or on the valve; otherwise it counts the frame. */
export function latchOnOwnFrame(
  l: AbilityLatches,
  you: Pick<OwnShip, 'repairReadyAt' | 'smokeReadyAt'>,
  now: number,
): AbilityLatches {
  return {
    repair: advance(l.repair, now, you.repairReadyAt),
    smoke: advance(l.smoke, now, you.smokeReadyAt),
  };
}

function advance(frames: number | null, now: number, readyAt: number | undefined): number | null {
  if (frames === null) return null;
  if (readyAt !== undefined && !abilityReady(now, readyAt)) return null; // the stamp arrived
  const next = frames + 1;
  return next >= PENDING_CAPACITY ? null : next;
}
