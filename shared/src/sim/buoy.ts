// THE BUOY LAW (Story 10.9, Eric rulings 2026-10-27/28, epic-10 amendments 2
// and 4) — the pure half of the four buoys both sides read.
//
// A buoy is the old DECOY BUOY's body (50 hp, a `decoy` target, a 12 u radar
// square — `CONFIG.buoy`) with a KIND, a 30 s life and an OWNER-ONLY effect
// inside `CONFIG.buoy.radiusU` (750 u, every kind — ruling 0):
//   radar   — a second sweep for the owner (server perception paints it);
//   healing — 2 % of missing hp per second, uninterruptible;
//   shield  — a second shield pool growing 1 % of max hp per second, no cap,
//             eaten after armor and before the SHIELD BLOCK (ruling 4);
//   speed   — +25 % of the RATED top speed, adding on the base with the
//             Speedboat's Shift (ruling 6: +50 % together).
// A KIND COUNTS ONCE (ruling 5): the server computes each hull's set of kinds
// it is inside once per tick and applies one term per kind.
//
// WHAT LIVES HERE is what both sides must agree on byte for byte: the kind
// map, the inside test, the shield/speed TAIL and the combined boost factor
// the kinematics fold's FIRST stage takes (server `tickKinematics` and the
// client's `prediction.ts` both call `combinedBoostFactor` → `boostedKinematics`
// on the rated kinematics, so a boosted hull predicts without drift). Nothing
// here reads a clock or CONFIG: the caller passes `now` (its server clock or
// its estimate of it) and the CONFIG dials, exactly as sim/boost.ts does.
//
// Pure, deterministic, zero I/O, plain numbers in and out.

import type { ConsumableId } from './effects.js';

/** The four buoy kinds — what a buoy DOES, stamped on the body at the drop
 *  and carried on the wire as `DecoyView.kind` for every observer who sees it. */
export type BuoyKind = 'radar' | 'healing' | 'shield' | 'speed';

/** Every kind, in catalog order (the order `BUOY_LINE_IDS` appends them). */
export const BUOY_KINDS: readonly BuoyKind[] = ['radar', 'healing', 'shield', 'speed'];

/** The four buoy LINES of the catalog, in LINE_IDS order. */
export const BUOY_LINE_IDS = ['radarBuoy', 'healingBuoy', 'shieldBuoy', 'speedBuoy'] as const satisfies
  readonly ConsumableId[];

/** One of the four buoy consumable ids. */
export type BuoyLineId = (typeof BUOY_LINE_IDS)[number];

const BUOY_LINE_SET: ReadonlySet<string> = new Set(BUOY_LINE_IDS);

/** Pure: is this id one of the four buoy lines? Accepts any string so every
 *  "what is in this slot" caller can ask it directly. */
export function isBuoyLine(id: string): id is BuoyLineId {
  return BUOY_LINE_SET.has(id);
}

/** The line ↔ kind map — TOTAL over `BuoyLineId`, so a fifth buoy fails to
 *  compile on both sides rather than drop silently. */
const KIND_OF_LINE: Readonly<Record<BuoyLineId, BuoyKind>> = {
  radarBuoy: 'radar',
  healingBuoy: 'healing',
  shieldBuoy: 'shield',
  speedBuoy: 'speed',
};

/** Pure: the kind a buoy dropped from this line is. */
export function buoyKindOf(id: BuoyLineId): BuoyKind {
  return KIND_OF_LINE[id];
}

/**
 * THE TAIL of a shield or speed effect, in [0, 1] — how much of the effect a
 * hull keeps after it last stood inside a buoy of that kind (`insideAtMs`, the
 * server's per-tick stamp; 0 = never):
 *   - 0 when `insideAtMs <= 0` (never inside);
 *   - 1 while `nowMs - insideAtMs <= holdMs` (the HOLD — full effect; a clock
 *     that reads before the stamp is clamped high);
 *   - linear from 1 down to 0 across `(holdMs, holdMs + rampMs]` (the RAMP);
 *   - 0 after.
 * Any non-finite input reads 0 (fail-closed: no effect rather than a NaN cap
 * loose in the kinematics). `holdMs`/`rampMs` are `CONFIG.buoy.tailHoldMs` /
 * `tailRampMs`, passed in so this stays a leaf.
 */
export function buoyTail(nowMs: number, insideAtMs: number, holdMs: number, rampMs: number): number {
  if (!Number.isFinite(nowMs) || !Number.isFinite(insideAtMs)) return 0;
  if (!Number.isFinite(holdMs) || !Number.isFinite(rampMs)) return 0;
  if (insideAtMs <= 0) return 0;
  const since = nowMs - insideAtMs;
  if (since <= holdMs) return 1;
  if (rampMs <= 0) return 0;
  const t = 1 - (since - holdMs) / rampMs;
  return t <= 0 ? 0 : Math.min(1, t);
}

/** Pure: is the point (x, y) within `radiusU` of the buoy at (bx, by)? The
 *  CENTRE test, INCLUSIVE at the edge — the one law for "inside a buoy" on
 *  both sides (every effect, every kind). */
export function insideBuoy(bx: number, by: number, x: number, y: number, radiusU: number): boolean {
  return Math.hypot(x - bx, y - by) <= radiusU;
}

/**
 * The FIRST stage's factor for the kinematics fold (sim/boost.ts
 * `boostedKinematics(kin, factor, factor > 0)`): the Shift's factor while the
 * Shift is active PLUS the SPEED BUOY's factor scaled by its tail — the two
 * ADD on the base (ruling 6: "each adds a quarter of the rated top speed",
 * +50 % together; never a product). `shiftFactor` = `CONFIG.boost.factor`,
 * `buoyFactor` = `CONFIG.buoy.speed.factor`, `buoyTail01` = `buoyTail(...)`.
 */
export function combinedBoostFactor(
  shiftActive: boolean,
  buoyTail01: number,
  shiftFactor: number,
  buoyFactor: number,
): number {
  return (shiftActive ? shiftFactor : 0) + buoyFactor * buoyTail01;
}
