// THE AIRDROPS (Story 10.9, epic-10 amendment 16; Eric's rulings R1–R4 of
// 2026-11-08) — the ONE drop model. Pure, deterministic, zero I/O: the
// server's spawner and collector, the client's ingest and the harness all read
// a drop through THESE functions, so the sides can never disagree about how
// many drops a minute brings, what a roll may be, or when a hull touches one.
// Every number lives in `CONFIG.drops` (constants.ts — the schedule, the
// keep-out and the pickup are documented there).
//
// A drop is NOT a ship, a target, a body or a bounty: it is a point on the
// water carrying one roll (or a wreck's bundle of rolls). Nothing here knows
// about owners, streams or the wire; the caller hands in its own `Rng`.

import { CONFIG, type IndexId } from '../constants.js';
import type { Rng } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import { pointPolygonDistance } from './silhouette.js';
import { bonusCount } from './stats.js';

/** The drop dials (`CONFIG.drops`), widened to plain numbers so the harness's
 *  `--tune drops.*` overrides and test fixtures type-check. */
export interface DropConfig {
  readonly perMinuteRemaining: number;
  readonly untilMinute: number;
  readonly radiusU: number;
  readonly bonusMin: number;
  readonly bonusMax: number;
  readonly wreckRolls: number;
  readonly placeAttempts: number;
  readonly indices: readonly IndexId[];
}

/** One roll: `[stat, amount]` — `amount` index points onto `stat`. A tuple
 *  (not an object) because it rides the wire inside `DropView.g` and the
 *  `dp` event. */
export type DropRoll = readonly [IndexId, number];

/** A drop on the water: its id, its (fround-ed) position and its rolls —
 *  one for an ordinary drop, `wreckRolls` for a wreck pickup (R2). */
export interface DropState {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rolls: ReadonlyArray<DropRoll>;
}

/**
 * Drops scattered at match minute `minute`:
 * `max(0, perMinuteRemaining × (untilMinute − minute))` — 2 per minute
 * remaining to 12:00 at the shipped dials, none from `untilMinute` on. 0 for a
 * negative, non-integer or non-finite minute (no batch exists there).
 */
export function dropCountFor(minute: number, cfg: DropConfig = CONFIG.drops): number {
  if (!Number.isInteger(minute) || minute < 0) return 0;
  return Math.max(0, cfg.perMinuteRemaining * (cfg.untilMinute - minute));
}

/**
 * Every drop the schedule scatters in a whole match: Σ `dropCountFor(m)` over
 * m ∈ [0, untilMinute) — 24 + 22 + … + 2 = 156 at the shipped dials (the
 * brainstorm's "156", DERIVED from the law, never a constant).
 */
export function totalDropCount(cfg: DropConfig = CONFIG.drops): number {
  let n = 0;
  for (let m = 0; m < cfg.untilMinute; m++) n += dropCountFor(m, cfg);
  return n;
}

/**
 * The match minute at `nowMs` on the zone clock —
 * `floor((now − zoneStartT) / beatMs)`. -1 before the zone starts, on a
 * non-finite input, or on a non-positive beat (no minute exists there).
 */
export function dropMinuteAt(nowMs: number, zoneStartT: number, beatMs: number): number {
  const elapsed = nowMs - zoneStartT;
  if (!(beatMs > 0) || !Number.isFinite(beatMs) || !Number.isFinite(elapsed) || elapsed < 0) return -1;
  return Math.floor(elapsed / beatMs);
}

/** Uniform index into a list of `n` from one rng float in [0, 1). The `min`
 *  guards an rng that returns exactly 1 (a stub; mulberry32 never does). */
function pickIndex(u: number, n: number): number {
  return Math.min(n - 1, Math.floor(u * n));
}

/**
 * ONE ROLL — exactly TWO `rng.next()` draws, in this order (the stream
 * contract a seeded replay depends on):
 *   1. the stat, uniform over `cfg.indices`;
 *   2. the amount, an integer uniform in [bonusMin, bonusMax] inclusive —
 *      `bonusMin + floor(u × (bonusMax − bonusMin + 1))`, clamped to the top
 *      bound. Derived from `next()` directly rather than `rng.int` so the
 *      spend is explicit HERE (mulberry32's `int` is the same one draw and
 *      formula today; a stub or a future Rng need not be).
 */
export function rollDrop(rng: Rng, cfg: DropConfig = CONFIG.drops): DropRoll {
  const stat = cfg.indices[pickIndex(rng.next(), cfg.indices.length)];
  const span = cfg.bonusMax - cfg.bonusMin + 1;
  const amount = cfg.bonusMin + pickIndex(rng.next(), span);
  return [stat, amount];
}

/** `n` independent rolls (a wreck pickup's bundle, R2), each `rollDrop` in
 *  turn — `2n` draws. A non-positive or non-integer `n` rolls nothing. */
export function rollBundle(rng: Rng, n: number, cfg: DropConfig = CONFIG.drops): DropRoll[] {
  const rolls: DropRoll[] = [];
  const count = Number.isInteger(n) && n > 0 ? n : 0;
  for (let i = 0; i < count; i++) rolls.push(rollDrop(rng, cfg));
  return rolls;
}

/**
 * Does a hull touch the drop (R4)? Its silhouette polygon (posed, world
 * space) within `rU` of the drop's centre — inclusive, and 0 when the centre
 * is inside the hull. Concave-safe (`pointPolygonDistance`).
 */
export function dropTouches(drop: Vec2, poly: readonly Vec2[], rU: number): boolean {
  return pointPolygonDistance(drop, poly) <= rU;
}

/**
 * FAIL-CLOSED ROLL VALIDATOR (the client ingest's gate on `DropView.g` and the
 * `dp` event): a two-element array whose stat is one of `indices` and whose
 * amount is a POSITIVE SAFE INTEGER — a `bonusCount`-acceptable count that is
 * also exactly what was sent, so a fraction, 0, a negative, NaN or ±Infinity
 * is REJECTED, never floored into a value. Anything else answers false.
 */
export function isDropRoll(v: unknown, indices: readonly string[] = CONFIG.drops.indices): v is DropRoll {
  if (!Array.isArray(v) || v.length !== 2) return false;
  const [stat, amount] = v as unknown[];
  if (typeof stat !== 'string' || !indices.includes(stat)) return false;
  return typeof amount === 'number' && amount > 0 && bonusCount(amount) === amount;
}
