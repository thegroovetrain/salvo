// THE SUPPLY DROPS (Eric 2026-11-19, Story 12.4, epic-12 amendment 5(f)/(g))
// — the server's store of the cycle's charted drop spots and their landing.
// They replace the radio beacons (Story 10.8) and keep the beacons' placement
// and timing exactly (*"Same spawn characteristics"*): per ring cycle the
// spots are picked at the cycle's first tick (`pickSupplySpot`, spawn.ts) and
// CHARTED (public, the schema); `surfaceMs` later each spot LANDS `crates`
// ordinary XP crates within `scatterU` of it. From that moment they are plain
// airdrops in `World.drops` — the same frame row, the same sight gate, the
// same pickup, the same storm sweep. Nothing here imports Colyseus or the
// World's value side.
//
// WHAT IS PUBLIC AND WHAT IS NOT. A spot's cycle, slot and position (and the
// cycle's start, from which every reader derives the landing time) are
// public facts — they ride the Colyseus schema through `SupplyField.chart`,
// the only thing the room adapter and the bots' port read. The crates' exact
// landing points are NOT on the chart: they are ordinary crates, delivered
// only through perception (signals.ts `dropSignal`).
//
// THE STREAMS ARE ROOM-PRIVATE. The placement keeps out of every captain's
// disc, so a stream a client could replay off the public map seed would turn
// the public chart into a position oracle; the landing scatter is private for
// the same reason a minute crate's spot is. The timing model is shared
// (`shared/src/sim/supplyDrops.ts`).

import {
  CONFIG,
  SUPPLY_WIRE_SLOTS,
  mulberry32,
  supplyCountFor,
  supplyDropLanded,
  type Island,
  type Rng,
  type SupplyDropConfig,
  type Vec2,
} from '@salvo/shared';
import { logWarn } from '../log.js';
import { SPAWN_ISLAND_CLEARANCE, islandClearance } from './spawn.js';

/** One charted supply-drop spot as every client (and every bot) is told
 *  about it: the ring cycle it belongs to, its slot in the cycle's set (the
 *  schema slot), its float32-exact position and the server ms the cycle
 *  began (the landing is `supplyLandMs(cycleStartT)`, derived). */
export interface SupplyChartRow {
  readonly cycle: number;
  readonly spot: number;
  readonly x: number;
  readonly y: number;
  readonly cycleStartT: number;
}

/** THE PUBLIC CHART: the current cycle's spots in slot order — exactly what
 *  the schema carries. Empty when there are none (before the zone starts, in
 *  a cycle with no drops, with supply drops switched off). */
export type SupplyChart = readonly SupplyChartRow[];

/** One placement request: the cycle's private stream and the spots already
 *  placed this cycle. Null = no spot for this request: it is skipped, and
 *  logging that is the CALLER's job (World.placeSupplyDrops). */
export type SupplyPick = (rng: Rng, taken: readonly Vec2[]) => Vec2 | null;

/** One landed crate, before it becomes a `DropState` in `World.drops`. */
export interface SupplyCrate {
  /** `sup-<cycle>-<spot>-<n>` — n the crate's request number at its spot. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** The landing scatter's sub-stream mint constant (odd; unused by any other
 *  stream — see World's spawnPhase roster). */
const SCATTER_K = 0xcc9e2d51;

/** Spots placed for `cycle`: `supplyCountFor`, capped at the wire's slot
 *  count (`SUPPLY_WIRE_SLOTS`, shared) so the server never charts a spot no
 *  client was told about. The shipped CONFIG cannot exceed it (shared throws
 *  at load); a runtime override (`--tune`) that does is clamped LOUDLY. */
function wireCount(cycle: number, cfg: SupplyDropConfig): number {
  const want = supplyCountFor(cycle, cfg);
  if (want <= SUPPLY_WIRE_SLOTS) return want;
  logWarn('supplyDrops.count_clamped', { cycle, want, slots: SUPPLY_WIRE_SLOTS });
  return SUPPLY_WIRE_SLOTS;
}

const NO_CHART: SupplyChart = Object.freeze([]);

/** The landing scatter's private stream for spot `spot` of cycle `cycle`:
 *  keyed by the pair, so a skipped crate, another spot or another cycle
 *  never shifts this spot's draws. */
export function scatterStream(seed: number, cycle: number, spot: number): Rng {
  return mulberry32((seed ^ Math.imul(cycle * SUPPLY_WIRE_SLOTS + spot + 1, SCATTER_K)) >>> 0);
}

/** Is `p` clear of every point of `placed` by at least `gap` (centre to
 *  centre)? */
function clearOf(p: Vec2, placed: readonly Vec2[], gap: number): boolean {
  const g2 = gap * gap;
  for (const q of placed) {
    const dx = p.x - q.x;
    const dy = p.y - q.y;
    if (dx * dx + dy * dy < g2) return false;
  }
  return true;
}

/** One uniform draw over the disc of `r` about `centre` (sqrt radius; two
 *  draws), float32-exact like every crate. Null when the rounding pushed a
 *  rim draw a hair outside. */
function drawInDisc(rng: Rng, centre: Vec2, r: number): Vec2 | null {
  const d = r * Math.sqrt(rng.next());
  const a = rng.next() * Math.PI * 2;
  const p = { x: Math.fround(centre.x + Math.cos(a) * d), y: Math.fround(centre.y + Math.sin(a) * d) };
  return Math.hypot(p.x - centre.x, p.y - centre.y) <= r ? p : null;
}

/** One crate's point: up to `cfg.placeAttempts` draws inside the scatter
 *  disc, rejected on land (the spawn ring's own clearance test, as a minute
 *  crate's) or overlapping a crate already placed (centres closer than
 *  `2 × radiusU`). Null when every draw failed. */
function pickCratePoint(
  rng: Rng,
  centre: Vec2,
  islands: readonly Island[],
  placed: readonly Vec2[],
  cfg: SupplyDropConfig,
  radiusU: number,
): Vec2 | null {
  for (let i = 0; i < cfg.placeAttempts; i += 1) {
    const p = drawInDisc(rng, centre, cfg.scatterU);
    if (p === null || islandClearance(p, islands) <= SPAWN_ISLAND_CLEARANCE) continue;
    if (clearOf(p, placed, 2 * radiusU)) return p;
  }
  return null;
}

/**
 * THE LANDING SCATTER (AC 21): `cfg.crates` points uniformly within
 * `cfg.scatterU` of the charted spot, clear of land, never overlapping
 * (centres at least `2 × radiusU` apart). A crate that finds no point in
 * `cfg.placeAttempts` draws is SKIPPED and LOGGED (`supplyDrops.crateSkipped`),
 * never thrown. Deterministic per (seed, cycle, spot).
 */
export function scatterSupplyCrates(
  seed: number,
  row: SupplyChartRow,
  islands: readonly Island[],
  cfg: SupplyDropConfig = CONFIG.supplyDrops,
  radiusU: number = CONFIG.drops.radiusU,
): SupplyCrate[] {
  const rng = scatterStream(seed, row.cycle, row.spot);
  const out: SupplyCrate[] = [];
  for (let n = 0; n < cfg.crates; n += 1) {
    const p = pickCratePoint(rng, row, islands, out, cfg, radiusU);
    if (p === null) {
      logWarn('supplyDrops.crateSkipped', { cycle: row.cycle, spot: row.spot, crate: n, attempts: cfg.placeAttempts });
      continue;
    }
    out.push({ id: `sup-${row.cycle}-${row.spot}-${n}`, x: p.x, y: p.y });
  }
  return out;
}

export class SupplyField {
  private rows: SupplyChart = NO_CHART;
  /** The last ring cycle the placer ran for — INCLUDING a cycle that got no
   *  spots, which is why it is not the chart's cycle. -1 = never. */
  private placedCycle = -1;
  private cycleStartT = 0;
  /** Has the current set landed? (A set lands once.) */
  private landed = false;

  /** `seed` is SERVER-PRIVATE material (the World mints it off the room's
   *  private entropy, never the public map seed). The placement stream is
   *  `seed ^ imul(cycle + 1, 0x9e3779b9)`; the landing scatter's is
   *  `scatterStream(seed, cycle, spot)`. */
  constructor(
    private readonly seed: number,
    private readonly cfg: SupplyDropConfig = CONFIG.supplyDrops,
  ) {}

  /** The last ring cycle placed for (-1 = none yet). */
  get cycle(): number {
    return this.placedCycle;
  }

  /** The public chart (the current set, in slot order). */
  get chart(): SupplyChart {
    return this.rows;
  }

  /**
   * REPLACE THE SET for ring cycle `cycle`: the previous cycle's spots are
   * dropped (landed or not), and `supplyCountFor(cycle)` new ones are picked
   * in order on the cycle's own private stream. A pick that returns null is
   * skipped (the cycle simply has fewer spots) and the slots stay DENSE. A
   * cycle with no drops (sudden death) simply clears the set. Coordinates are
   * FLOAT32-EXACT: the schema carries float32, so the server and every
   * client hold the very same point.
   */
  replace(cycle: number, cycleStartT: number, pick: SupplyPick): void {
    this.placedCycle = cycle;
    this.cycleStartT = cycleStartT;
    this.landed = false;
    const count = wireCount(cycle, this.cfg);
    if (count === 0) {
      this.rows = NO_CHART;
      return;
    }
    const rng = mulberry32((this.seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0);
    const taken: Vec2[] = [];
    const rows: SupplyChartRow[] = [];
    for (let n = 0; n < count; n += 1) {
      const at = pick(rng, taken);
      if (at === null) continue;
      const x = Math.fround(at.x);
      const y = Math.fround(at.y);
      taken.push({ x, y });
      rows.push(Object.freeze({ cycle, spot: rows.length, x, y, cycleStartT }));
    }
    this.rows = rows.length === 0 ? NO_CHART : Object.freeze(rows);
  }

  /**
   * LAND THE SET if it is due (AC 20–21): once per set, on the first call at
   * or after `cycleStartT + surfaceMs`, every charted spot scatters its
   * crates (`scatterSupplyCrates`) and they are handed to `put`. Returns
   * whether the set landed on this call. The chart is left as it is — the
   * mark's fade is the client's, derived from the same clock.
   */
  land(now: number, islands: readonly Island[], put: (crate: SupplyCrate) => void): boolean {
    if (this.landed || this.rows.length === 0 || !supplyDropLanded(now, this.cycleStartT, this.cfg)) return false;
    this.landed = true;
    for (const row of this.rows) {
      for (const crate of scatterSupplyCrates(this.seed, row, islands, this.cfg)) put(crate);
    }
    return true;
  }
}
