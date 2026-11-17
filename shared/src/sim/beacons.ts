// THE RADIO BEACONS (Story 10.8, Eric rulings R1–R13, 2026-11-06, epic-10
// amendment 14) — the ONE lifecycle and rate model. Pure, deterministic, zero
// I/O: the server's payout and damage gate, the client's chart/water render
// and contact prediction, and the bots all read a beacon through THESE
// functions, so the three sides can never disagree about when a beacon is in
// the water, what it pays or what it is shaped like. Every number lives in
// `CONFIG.beacons` (constants.ts — the timeline is documented there).
//
// A beacon is fully described by public facts: its ring cycle (whose start
// time derives from the zone clock), its position, and an optional EARLY sink
// time stamped by the server when it is destroyed afloat (R6, public — R9).
// Nothing here knows about ships, owners or the wire.

import { CONFIG } from '../constants.js';
import type { Vec2 } from '../math/vec.js';
import { zoneGroupMs, type ZoneTimeline } from './zone.js';

/** The beacon dials (`CONFIG.beacons`), widened to plain numbers so the
 *  harness's `--tune beacons.*` overrides and test fixtures type-check. */
export interface BeaconConfig {
  readonly counts: readonly number[];
  readonly rangeU: number;
  readonly surfaceMs: number;
  readonly floatMs: number;
  readonly sinkMs: number;
  readonly levelsPerMin: number;
  readonly hp: number;
  readonly armor: number;
  readonly killLevels: number;
  readonly edgeMarginU: number;
  readonly bodyRadiusU: number;
}

/**
 * How many beacons the public room schema can carry: its `bcn0…bcn7` field
 * triples (server/src/rooms/schema/ArenaState.ts). A WIRE-CAPACITY number,
 * not a gameplay number — the schema's slot count, read by the server's
 * placer and chart mirror and by the client's chart reader so the two sides
 * can never disagree about it. Raising it means adding schema field triples
 * (a PROTOCOL_VERSION bump); the room test pins the triples to this count.
 */
export const BEACON_WIRE_SLOTS = 8;

// A shipped `CONFIG.beacons.counts` entry the wire cannot carry is a build
// error, not a silent clamp: fail at module load.
if (Math.max(0, ...CONFIG.beacons.counts) > BEACON_WIRE_SLOTS) {
  throw new Error(
    `CONFIG.beacons.counts asks for ${Math.max(...CONFIG.beacons.counts)} beacons in a cycle; the wire carries ${BEACON_WIRE_SLOTS} (BEACON_WIRE_SLOTS)`,
  );
}

/**
 * Where a beacon is in its life (R3):
 *   charted — on the chart, nothing in the water (cycle start → surface);
 *   afloat  — surfaced, paying the full rate, hittable;
 *   sinking — the sink minute, rate falling linearly to 0, still solid;
 *   gone    — sunk.
 */
export type BeaconPhase = 'charted' | 'afloat' | 'sinking' | 'gone';

export interface BeaconState {
  phase: BeaconPhase;
  /** 0..1 — the payout rate's fraction of full (1 afloat, falling while sinking). */
  rate01: number;
  /** 0..1 — progress through the sink (0 until it starts, 1 once gone). */
  sink01: number;
}

/** ms in a minute — a unit, not a dial (`levelsPerMin` is per minute). */
const MS_PER_MIN = 60_000;

/**
 * Beacons placed in ring cycle `cycle` (R2): `counts[cycle]`, and 0 for a
 * negative, non-integer or past-the-list cycle (the sudden-death cycle gets
 * none) or a malformed entry.
 */
export function beaconCountFor(cycle: number, cfg: BeaconConfig = CONFIG.beacons): number {
  if (!Number.isInteger(cycle) || cycle < 0 || cycle >= cfg.counts.length) return 0;
  const n = cfg.counts[cycle];
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * The ring cycle (zone ring-group index) the zone clock is in at `nowMs` —
 * `floor((now − zoneStartT) / zoneGroupMs)`. -1 before the zone starts, on a
 * non-finite clock or on a degenerate timeline. Deliberately NOT clamped to
 * the zone's group count: a cycle past `counts` simply has no beacons.
 */
export function beaconCycleAt(nowMs: number, zoneStartT: number, zoneCfg: ZoneTimeline = CONFIG.zone): number {
  const groupMs = zoneGroupMs(zoneCfg);
  const elapsed = nowMs - zoneStartT;
  if (!(groupMs > 0) || !Number.isFinite(elapsed) || elapsed < 0) return -1;
  return Math.floor(elapsed / groupMs);
}

/** ms — when ring cycle `cycle` begins (the beacons are charted). +Infinity
 *  ("never") on a degenerate timeline or a malformed cycle. */
export function beaconCycleStartMs(zoneStartT: number, cycle: number, zoneCfg: ZoneTimeline = CONFIG.zone): number {
  const groupMs = zoneGroupMs(zoneCfg);
  if (!(groupMs > 0) || !Number.isInteger(cycle) || cycle < 0) return Number.POSITIVE_INFINITY;
  return zoneStartT + cycle * groupMs;
}

/**
 * ms — when the sink begins. `sinkT` is the server's EARLY sink stamp (R6, 0 =
 * none); it is honored only when it is finite and lies inside the float window
 * [surface, natural) — a sink can only come EARLIER than the natural schedule,
 * and a beacon cannot be destroyed before it surfaces. Anything else reads as
 * the natural `cycleStartT + surfaceMs + floatMs`.
 */
export function beaconSinkStartMs(cycleStartT: number, sinkT: number, cfg: BeaconConfig = CONFIG.beacons): number {
  const surfaceT = cycleStartT + cfg.surfaceMs;
  const natural = surfaceT + cfg.floatMs;
  const early = Number.isFinite(sinkT) && sinkT > 0 && sinkT >= surfaceT && sinkT < natural;
  return early ? sinkT : natural;
}

/**
 * The beacon's phase, rate and sink progress at `nowMs` (R3, R6). Boundaries:
 * afloat AT the surface instant, sinking AT the sink start (rate still 1),
 * gone AT the sink end. A non-positive `sinkMs` sinks instantly.
 */
export function beaconStateAt(
  nowMs: number,
  cycleStartT: number,
  sinkT: number,
  cfg: BeaconConfig = CONFIG.beacons,
): BeaconState {
  if (!(nowMs >= cycleStartT + cfg.surfaceMs)) return { phase: 'charted', rate01: 0, sink01: 0 };
  const sinkStart = beaconSinkStartMs(cycleStartT, sinkT, cfg);
  if (nowMs < sinkStart) return { phase: 'afloat', rate01: 1, sink01: 0 };
  const f = cfg.sinkMs > 0 ? (nowMs - sinkStart) / cfg.sinkMs : 1;
  if (!(f < 1)) return { phase: 'gone', rate01: 0, sink01: 1 };
  return { phase: 'sinking', rate01: 1 - f, sink01: f };
}

/**
 * XP ms accrued per real ms at `rate01` of the full rate (R4): the full rate
 * is `levelsPerMin` levels of `levelMs` each per minute. The WHOLE pot — the
 * caller splits it among the hulls in range (`splitBeaconPot`).
 */
export function beaconXpMsPerMs(
  rate01: number,
  cfg: BeaconConfig = CONFIG.beacons,
  levelMs: number = CONFIG.xp.levelMs,
): number {
  if (!Number.isFinite(rate01) || rate01 <= 0) return 0;
  return ((cfg.levelsPerMin * levelMs) / MS_PER_MIN) * Math.min(rate01, 1);
}

/** Can a weapon strike it? Afloat only (R6: not before it surfaces, nothing
 *  once the sink has started). */
export function beaconHittable(phase: BeaconPhase): boolean {
  return phase === 'afloat';
}

/** Is it a solid body to hulls? Afloat AND sinking (R12, the wreck law). */
export function beaconSolid(phase: BeaconPhase): boolean {
  return phase === 'afloat' || phase === 'sinking';
}

/** The regular octagon's unit vertices, counter-clockwise from +x — the
 *  winding the hull silhouettes use (silhouette.ts). Literal constants so no
 *  transcendental runs at all (every consumer must agree byte-for-byte). */
const H = Math.SQRT1_2;
const OCTAGON: readonly Vec2[] = Object.freeze([
  { x: 1, y: 0 },
  { x: H, y: H },
  { x: 0, y: 1 },
  { x: -H, y: H },
  { x: -1, y: 0 },
  { x: -H, y: -H },
  { x: 0, y: -1 },
  { x: H, y: -H },
]);

/**
 * The beacon's body in WORLD space: a regular octagon of circumradius
 * `bodyRadiusU` centred on (x, y) — the same shape a hull's transformed
 * silhouette has (a closed vertex ring, CCW, no repeated first vertex), so the
 * server's ordnance targets and contact bodies and the client's predictor can
 * all take it as-is. `out` is caller-owned scratch, reused in place.
 */
export function beaconPolygon(x: number, y: number, cfg: BeaconConfig = CONFIG.beacons, out: Vec2[] = []): Vec2[] {
  const r = cfg.bodyRadiusU;
  out.length = OCTAGON.length;
  for (let i = 0; i < OCTAGON.length; i++) {
    const p = OCTAGON[i];
    const o = out[i] ?? (out[i] = { x: 0, y: 0 });
    o.x = x + p.x * r;
    o.y = y + p.y * r;
  }
  return out;
}

/**
 * Split a beacon's accrued pot evenly among `hulls` receivers in INTEGER ms:
 * each gets `floor(pot / hulls)`, the remainder carries to the next tick
 * (`share × hulls + carry === pot`). No receivers → nothing paid AND nothing
 * carried (an empty circle accrues nothing); a non-finite or non-positive pot
 * pays nothing either.
 */
export function splitBeaconPot(potMs: number, hulls: number): { shareMs: number; carryMs: number } {
  const n = Math.floor(hulls);
  if (!(n >= 1) || !Number.isFinite(n) || !Number.isFinite(potMs) || potMs <= 0) return { shareMs: 0, carryMs: 0 };
  const shareMs = Math.floor(potMs / n);
  return { shareMs, carryMs: potMs - shareMs * n };
}

/** Is a hull centred at (hx, hy) within the beacon's paying range (inclusive)? */
export function beaconInRange(bx: number, by: number, hx: number, hy: number, cfg: BeaconConfig = CONFIG.beacons): boolean {
  const dx = hx - bx;
  const dy = hy - by;
  return dx * dx + dy * dy <= cfg.rangeU * cfg.rangeU;
}
