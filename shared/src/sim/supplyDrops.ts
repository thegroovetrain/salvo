// THE SUPPLY DROPS (Eric 2026-11-19, Story 12.4, epic-12 amendment 5(f)/(g))
// — the ONE timing model. They replace the radio beacons (Story 10.8) and
// keep their placement and timing exactly ("Same spawn characteristics"): per
// ring cycle the spots are CHARTED at the cycle start (public, the schema) and
// the crates LAND `surfaceMs` later. Pure, deterministic, zero I/O: the
// server's placer and lander, the client's chart and the bots all read a
// supply drop's clock through THESE functions. Every number lives in
// `CONFIG.supplyDrops` (constants.ts).

import { CONFIG } from '../constants.js';
import { zoneGroupMs, type ZoneTimeline } from './zone.js';

/** The supply-drop dials (`CONFIG.supplyDrops`), widened to plain numbers so
 *  the harness's `--tune supplyDrops.*` overrides and test fixtures
 *  type-check. */
export interface SupplyDropConfig {
  readonly counts: readonly number[];
  readonly surfaceMs: number;
  readonly edgeMarginU: number;
  readonly keepOutU: number;
  readonly minSpacingFrac: number;
  readonly placeAttempts: number;
  readonly crates: number;
  readonly scatterU: number;
}

/**
 * How many supply-drop spots the public room schema can carry: its
 * `sup0…sup7` field pairs (server/src/rooms/schema/ArenaState.ts). A
 * WIRE-CAPACITY number, not a gameplay number — the schema's slot count, read
 * by the server's placer and chart mirror and by the client's chart reader so
 * the two sides can never disagree about it. Raising it means adding schema
 * fields (a PROTOCOL_VERSION bump); the room test pins the fields to this
 * count.
 */
export const SUPPLY_WIRE_SLOTS = 8;

// A shipped `CONFIG.supplyDrops.counts` entry the wire cannot carry is a build
// error, not a silent clamp: fail at module load.
if (Math.max(0, ...CONFIG.supplyDrops.counts) > SUPPLY_WIRE_SLOTS) {
  throw new Error(
    `CONFIG.supplyDrops.counts asks for ${Math.max(...CONFIG.supplyDrops.counts)} supply drops in a cycle; the wire carries ${SUPPLY_WIRE_SLOTS} (SUPPLY_WIRE_SLOTS)`,
  );
}

/**
 * Spots charted in ring cycle `cycle` (R2): `counts[cycle]`, and 0 for a
 * negative, non-integer or past-the-list cycle (the sudden-death cycle gets
 * none) or a malformed entry.
 */
export function supplyCountFor(cycle: number, cfg: SupplyDropConfig = CONFIG.supplyDrops): number {
  if (!Number.isInteger(cycle) || cycle < 0 || cycle >= cfg.counts.length) return 0;
  const n = cfg.counts[cycle];
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * The ring cycle (zone ring-group index) the zone clock is in at `nowMs` —
 * `floor((now − zoneStartT) / zoneGroupMs)`. -1 before the zone starts, on a
 * non-finite clock or on a degenerate timeline. Deliberately NOT clamped to
 * the zone's group count: a cycle past `counts` simply has no drops.
 */
export function supplyCycleAt(nowMs: number, zoneStartT: number, zoneCfg: ZoneTimeline = CONFIG.zone): number {
  const groupMs = zoneGroupMs(zoneCfg);
  const elapsed = nowMs - zoneStartT;
  if (!(groupMs > 0) || !Number.isFinite(elapsed) || elapsed < 0) return -1;
  return Math.floor(elapsed / groupMs);
}

/** ms — when ring cycle `cycle` begins (the spots are charted). +Infinity
 *  ("never") on a degenerate timeline or a malformed cycle. */
export function supplyCycleStartMs(zoneStartT: number, cycle: number, zoneCfg: ZoneTimeline = CONFIG.zone): number {
  const groupMs = zoneGroupMs(zoneCfg);
  if (!(groupMs > 0) || !Number.isInteger(cycle) || cycle < 0) return Number.POSITIVE_INFINITY;
  return zoneStartT + cycle * groupMs;
}

/** ms — when a cycle's crates land: `cycleStartT + surfaceMs`. */
export function supplyLandMs(cycleStartT: number, cfg: SupplyDropConfig = CONFIG.supplyDrops): number {
  return cycleStartT + cfg.surfaceMs;
}

/** Have the cycle's crates landed by `nowMs`? True AT the landing instant;
 *  false on a non-finite clock or a never-starting cycle. */
export function supplyDropLanded(nowMs: number, cycleStartT: number, cfg: SupplyDropConfig = CONFIG.supplyDrops): boolean {
  return nowMs >= supplyLandMs(cycleStartT, cfg);
}
