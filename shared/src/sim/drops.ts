// THE AIRDROPS (Story 10.9, epic-10 amendment 18; Eric's rulings R1–R4 of
// 2026-11-08) — the ONE drop model. Pure, deterministic, zero I/O: the
// server's spawner and collector, the client's ingest and the harness all read
// a drop through THESE functions, so the sides can never disagree about how
// many drops a minute brings, what a roll may be, or when a hull touches one.
// Every number lives in `CONFIG.drops` (constants.ts — the schedule, the
// keep-out and the pickup are documented there).
//
// A drop is NOT a ship, a target, a body or a bounty: it is a point on the
// water carrying only its KIND. Since 2026-11-19 (Story 12.4, epic-12
// amendment 5) there are two: `'xp'` — every airdrop and supply-drop crate,
// worth `CONFIG.drops.xpLevels` of a level — and `'wreck'` — a sunk
// participant's pickup, worth +1 to a random stat per level the victim had
// (`rollWreckStats`, rolled AT PICKUP). The old per-stat crate kinds and
// their +bonusMin..+bonusMax roll are retired. Nothing here knows about
// owners, streams or the wire; the caller hands in its own rng.

import { CONFIG, type IndexId } from '../constants.js';
import type { Vec2 } from '../math/vec.js';
import type { StatRollConfig } from './levelRoll.js';
import { pointPolygonDistance, segClearOfPolyBox } from './silhouette.js';
import { bonusCount } from './stats.js';

/** The drop dials (`CONFIG.drops`), widened to plain numbers so the harness's
 *  `--tune drops.*` overrides and test fixtures type-check. */
export interface DropConfig {
  readonly perMinuteRemaining: number;
  readonly untilMinute: number;
  readonly radiusU: number;
  readonly placeAttempts: number;
  readonly xpLevels: number;
}

/** One grant: `[stat, amount]` — `amount` index points onto `stat`. A tuple
 *  (not an object) because it rides the wire inside the `dp` event. */
export type DropRoll = readonly [IndexId, number];

/** What a crate IS — the only thing it shows: `'xp'` (every airdrop and
 *  supply-drop crate) or `'wreck'` (a sunk participant's pickup). */
export type DropKind = 'xp' | 'wreck';

/** The kinds a crate may be, in one list (the ingest gate reads it). */
const DROP_KINDS: readonly string[] = ['xp', 'wreck'];

/** A drop on the water: its id, its (fround-ed) position and its kind. A
 *  wreck's grants do not exist yet — `rollWreckStats` draws them when a hull
 *  takes it. */
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

/** How many +1 picks a wreck of `levels` grants: floored, and 0 for a
 *  non-finite or non-positive count. */
function wreckPickCount(levels: number): number {
  return Number.isFinite(levels) && levels > 0 ? Math.floor(levels) : 0;
}

/**
 * THE WRECK PICKUP ROLL (Eric 2026-11-19, Story 12.4, epic-12 amendment 5(e):
 * *"+1 point to a random stat for each level that ship had gained before
 * being sunk"*): `levels` (floored; ≤ 0 or non-finite → none) independent
 * uniform picks over `cfg.indices`, exactly ONE `rng.next()` each, MERGED per
 * stat — one `[stat, n]` pair per stat that got at least one point, in
 * `cfg.indices` order. A pick whose rng value is outside [0, 1) (NaN, a
 * negative) is spent and grants nothing. An empty `indices` grants nothing
 * and spends nothing.
 */
export function rollWreckStats(
  rng: { next(): number },
  levels: number,
  cfg: StatRollConfig = CONFIG.xp.statRoll,
): Array<[IndexId, number]> {
  const n = cfg.indices.length;
  if (n === 0) return [];
  const counts = new Array<number>(n).fill(0);
  const picks = wreckPickCount(levels);
  for (let i = 0; i < picks; i++) {
    const u = rng.next();
    if (u >= 0 && u < 1) counts[Math.floor(u * n)] += 1;
  }
  const out: Array<[IndexId, number]> = [];
  for (let i = 0; i < n; i++) if (counts[i] > 0) out.push([cfg.indices[i], counts[i]]);
  return out;
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
 *  exactly `'xp'` or `'wreck'`; anything else answers false. */
export function isDropKind(v: unknown): v is DropKind {
  return typeof v === 'string' && DROP_KINDS.includes(v);
}

/**
 * FAIL-CLOSED GRANT VALIDATOR (the client ingest's gate on each entry of the
 * `dp` event's `g` — a wreck's merged grants): a two-element array whose stat is one of `indices` and whose
 * amount is a POSITIVE SAFE INTEGER — a `bonusCount`-acceptable count that is
 * also exactly what was sent, so a fraction, 0, a negative, NaN or ±Infinity
 * is REJECTED, never floored into a value. Anything else answers false.
 */
export function isDropRoll(v: unknown, indices: readonly string[] = CONFIG.xp.statRoll.indices): v is DropRoll {
  if (!Array.isArray(v) || v.length !== 2) return false;
  const [stat, amount] = v as unknown[];
  if (typeof stat !== 'string' || !indices.includes(stat)) return false;
  return typeof amount === 'number' && amount > 0 && bonusCount(amount) === amount;
}
