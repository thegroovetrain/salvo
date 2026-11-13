// THE AIRDROPS (Story 10.9, epic-10 amendment 18; Eric's rulings R1–R4 of
// 2026-11-08) — the ONE drop model. Pure, deterministic, zero I/O: the
// server's spawner and collector, the client's ingest and the harness all read
// a drop through THESE functions, so the sides can never disagree about how
// many drops a minute brings, what a roll may be, or when a hull touches one.
// Every number lives in `CONFIG.drops` (constants.ts — the schedule, the
// keep-out and the pickup are documented there).
//
// A drop is NOT a ship, a target, a body or a bounty: it is a point on the
// water carrying only its KIND — one index stat, or `'wreck'` for a sunk
// participant's pickup. The AMOUNT (and, for a wreck, its stats too) is rolled
// AT PICKUP, never at spawn (Eric 2026-11-08: "The bonus is rolled AFTER I
// pick it up. I only need to know that it's there, and what type of upgrade
// it is"). Nothing here knows about owners, streams or the wire; the caller
// hands in its own `Rng`.

import { CONFIG, type IndexId } from '../constants.js';
import type { Rng } from '../math/rng.js';
import type { Vec2 } from '../math/vec.js';
import { pointPolygonDistance, segClearOfPolyBox } from './silhouette.js';
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
 *  (not an object) because it rides the wire inside the `dp` event. */
export type DropRoll = readonly [IndexId, number];

/** What a crate IS — the only thing it shows (Eric 2026-11-08): one index
 *  stat, or `'wreck'` — a sunk participant's pickup, not limited to one stat. */
export type DropKind = IndexId | 'wreck';

/** A drop on the water: its id, its (fround-ed) position and its kind. Its
 *  amount does not exist yet — `rollPickup` draws it when a hull takes it. */
export interface DropState {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly kind: DropKind;
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

/** THE SPAWN-TIME DRAW — exactly ONE `rng.next()`: the crate's stat, uniform
 *  over `cfg.indices`. (A wreck's kind is `'wreck'`, never drawn.) An EMPTY
 *  `indices` THROWS (review gate 2026-11-10) — a bug guard like
 *  `KitRollError`, reachable only from a degenerate `--tune` / fixture dial
 *  (the server's scheduler runs on CONFIG); it never answers an undefined
 *  stat. */
export function rollKind(rng: Rng, cfg: DropConfig = CONFIG.drops): IndexId {
  if (cfg.indices.length === 0) throw new Error('drops.indices is empty');
  return cfg.indices[pickIndex(rng.next(), cfg.indices.length)];
}

/** The amount — exactly ONE `rng.next()`: an integer uniform in
 *  [bonusMin, bonusMax] inclusive, `bonusMin + floor(u × span)` clamped to the
 *  top bound (`bonusMin` alone when the range is reversed). Derived from `next()` directly rather than `rng.int` so the
 *  spend is explicit HERE (mulberry32's `int` is the same one draw today; a
 *  stub or a future Rng need not be). */
function rollAmount(rng: Rng, cfg: DropConfig): number {
  // span ≥ 1 (review gate 2026-11-10): a REVERSED range (a degenerate
  // `--tune` / fixture dial) yields `bonusMin`, never a value below it.
  const span = Math.max(1, cfg.bonusMax - cfg.bonusMin + 1);
  return cfg.bonusMin + pickIndex(rng.next(), span);
}

/**
 * ONE FREE ROLL — exactly TWO `rng.next()` draws, in this order (the stream
 * contract a seeded replay depends on): the stat (`rollKind`), then the
 * amount. A wreck pickup is `wreckRolls` of these.
 */
export function rollDrop(rng: Rng, cfg: DropConfig = CONFIG.drops): DropRoll {
  const stat = rollKind(rng, cfg);
  return [stat, rollAmount(rng, cfg)];
}

/**
 * THE PICKUP ROLL (Eric 2026-11-08 — rolled AFTER the pickup, never at
 * spawn). An index kind grants `[[kind, amount]]` — ONE draw, the amount.
 * `'wreck'` grants `cfg.wreckRolls` independent `rollDrop`s (stat + amount
 * each, `2 × wreckRolls` draws; a non-positive or non-integer `wreckRolls`
 * grants nothing).
 */
export function rollPickup(rng: Rng, kind: DropKind, cfg: DropConfig = CONFIG.drops): DropRoll[] {
  if (kind !== 'wreck') return [[kind, rollAmount(rng, cfg)]];
  const rolls: DropRoll[] = [];
  const n = Number.isInteger(cfg.wreckRolls) && cfg.wreckRolls > 0 ? cfg.wreckRolls : 0;
  for (let i = 0; i < n; i++) rolls.push(rollDrop(rng, cfg));
  return rolls;
}

/**
 * Does a hull touch the drop (R4)? Its silhouette polygon (posed, world
 * space) within `rU` of the drop's centre — inclusive, and 0 when the centre
 * is inside the hull. Concave-safe (`pointPolygonDistance`).
 */
export function dropTouches(drop: Vec2, poly: readonly Vec2[], rU: number): boolean {
  // The box reject first (Story 11.2 follow-up): a hull whose bounding box is
  // more than `rU` from the centre cannot touch — one pass of compares instead
  // of the edge scan for every crate x hull pair, every tick. Exact: it only
  // skips pairs whose distance is provably past `rU`.
  if (poly.length > 0 && segClearOfPolyBox(drop, drop, poly, rU)) return false;
  return pointPolygonDistance(drop, poly) <= rU;
}

/** FAIL-CLOSED KIND VALIDATOR (the client ingest's gate on `DropView.c`):
 *  exactly `'wreck'` or one of `indices`; anything else answers false. */
export function isDropKind(v: unknown, indices: readonly string[] = CONFIG.drops.indices): v is DropKind {
  return v === 'wreck' || (typeof v === 'string' && indices.includes(v));
}

/**
 * FAIL-CLOSED ROLL VALIDATOR (the client ingest's gate on the `dp` event's
 * `g`): a two-element array whose stat is one of `indices` and whose
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
