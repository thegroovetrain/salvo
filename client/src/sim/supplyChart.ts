// THE SUPPLY-DROP CHART, CLIENT SIDE (Story 12.4, epic-12 amendment 5(f)/(g);
// the radio beacons' chart reader until then) — the pure derivation of this
// frame's charted supply drops from the polled room schema.
//
// THE WIRE CARRIES ONLY PUBLIC FACTS: the set's ring cycle (`supplyCycle`,
// -1 = none), how many slots are live (`supplyCount`) and each slot's spot
// (`supNX` / `supNY`). The landing time is DERIVED here from the SHARED pure
// module (`shared/src/sim/supplyDrops.ts`) against the zone clock
// (`zoneStartT`) — `supplyLandMs(supplyCycleStartMs(...))`, the same clock the
// server's lander reads — so the chart can never disagree with the server
// about when the crates land.
//
// STALE-BOUNDARY CARE (the `zoneViewFrom` discipline): a slot at or past
// `supplyCount` is stale and never read; a missing field (an older server, a
// not-yet-synced state) yields an EMPTY list, never a NaN sprite; a
// non-finite coordinate drops that slot; and a set whose cycle the zone clock
// has already left is dropped whole — the explicit cycle exists so a client
// can never pair an old cycle's spots with a new cycle's clock.
//
// Every live row is returned, landed or not: the mark's fade after the
// landing is a look (render/supplyDrops.ts), and the "landed" cue edge reads
// the same rows (audio/cueEdges.ts).

import { SUPPLY_WIRE_SLOTS, supplyCycleAt, supplyCycleStartMs, supplyLandMs } from '@salvo/shared';

/** A per-slot schema field name (`sup0X` … `sup7Y`). */
type SlotField = `sup${number}${'X' | 'Y'}`;

/** The supply-drop fields of the public room schema this derivation consumes. */
export interface SupplyPlane {
  zoneStartT?: number;
  supplyCycle?: number;
  supplyCount?: number;
  readonly [field: SlotField]: number | undefined;
}

/** One charted supply drop this frame. */
export interface SupplyChartRow {
  /** The wire slot (0-based) — the stable sprite key for the cycle. */
  slot: number;
  x: number;
  y: number;
  /** ms (server clock) — when this cycle's crates land. */
  landT: number;
}

/** The field names per slot, built once — no per-frame string building. */
const KEYS: readonly { x: SlotField; y: SlotField }[] = Array.from({ length: SUPPLY_WIRE_SLOTS }, (_, i) => ({
  x: `sup${i}X`,
  y: `sup${i}Y`,
}));

/** Pure: the live slot count — 0 for a missing, negative or non-integer
 *  count; clamped to the wire's slot count. */
function liveCount(s: SupplyPlane): number {
  const n = s.supplyCount;
  if (n === undefined || !Number.isInteger(n) || n <= 0) return 0;
  return Math.min(n, SUPPLY_WIRE_SLOTS);
}

/**
 * Pure: the ms the set's crates land, or null when the set must not render —
 * no set (cycle -1 / missing / malformed), no zone clock, or a set the zone
 * clock has already left (the stale boundary: the server's patch clearing or
 * replacing it has not landed yet).
 */
function setLandMs(s: SupplyPlane, now: number): number | null {
  const cycle = s.supplyCycle;
  const zoneStartT = s.zoneStartT;
  if (cycle === undefined || !Number.isInteger(cycle) || cycle < 0) return null;
  if (zoneStartT === undefined || !Number.isFinite(zoneStartT) || zoneStartT <= 0) return null;
  if (supplyCycleAt(now, zoneStartT) > cycle) return null;
  const land = supplyLandMs(supplyCycleStartMs(zoneStartT, cycle));
  return Number.isFinite(land) ? land : null;
}

/** Fill `out` (reused in place) from slot `slot`; false when the slot's
 *  coordinates are unusable. */
function readSlot(s: SupplyPlane, slot: number, landT: number, out: SupplyChartRow): boolean {
  const k = KEYS[slot];
  const x = s[k.x];
  const y = s[k.y];
  if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  out.slot = slot;
  out.x = x;
  out.y = y;
  out.landT = landT;
  return true;
}

/**
 * This frame's charted supply drops at `now` (the server-clock estimate).
 * `out` is caller-owned scratch: the array and its row objects are reused, so
 * a per-frame call allocates nothing after the first.
 */
export function supplyChartFrom(s: SupplyPlane, now: number, out: SupplyChartRow[] = []): SupplyChartRow[] {
  const landT = setLandMs(s, now);
  const count = landT === null ? 0 : liveCount(s);
  let n = 0;
  for (let slot = 0; slot < count; slot++) {
    const row = out[n] ?? (out[n] = { slot: 0, x: 0, y: 0, landT: 0 });
    if (readSlot(s, slot, landT as number, row)) n++;
  }
  out.length = n;
  return out;
}
