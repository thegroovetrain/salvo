// MAIN-BATTERY HIT SHARE BY RANGE BAND (Story 11.1, Eric 2026-11-12 — the
// harness readout that replaced `shotsBeyondRange` when range attenuation
// retired): how often a main-battery shell damages a hull, split by how far
// it was fired, in four equal bands of the firing turret's reach.
//
// WHAT IS MEASURED, stated (the harness sees the shell table, never the click):
//   - THE FIRING RANGE is the shell's position when the collector first sees
//     it (its muzzle — or a little along its track when a fire-time back-date
//     pre-stepped it) → its target point. The target is the DISPERSED landing,
//     which sits within half the dispersion ellipse's along axis (0.5 % of the
//     range at the shipped dials) of the base aim point — the nearest
//     equivalent of "muzzle → aim point" the harness can observe at spawn.
//   - THE REACH is the owner's folded `stats.equipment.mainBattery.rangeU` at
//     that moment (no lit-zone lift); a shot past it (a lit lift, or a
//     dispersed landing beyond reach) files in the last band.
//   - DAMAGED A HULL: on the tick the shell leaves the table, either a `boom`
//     names it with a `hit` (a direct hit on a ship), or its `boom` / `burst`
//     came with its owner's `hc` at the same point (the landing resolved a
//     victim — the World's hit-call rule, which also counts a radio beacon).
//     Since the blast retired (2026-11-13, epic-11 amendment 8) a main-battery
//     landing is a `boom`; the `burst` arm stays for every blast shell.
//   - BLIND SPOT: a shell created and spent inside one tick is never seen.
//
// Pure helpers + one small tracker; READ-ONLY over the World, like every
// number in the harness.

import type { GameEvent, ShellState } from '@salvo/shared';

/** How many equal bands the reach is cut into. */
export const RANGE_BANDS = 4;

/** Fresh zero counters, one per band. */
export const emptyBands = (): number[] => new Array<number>(RANGE_BANDS).fill(0);

/**
 * The band (0 .. RANGE_BANDS − 1) of a shot of `rangeU` against a reach of
 * `reachU`: `floor(rangeU / reachU × RANGE_BANDS)`, clamped — a shot at or
 * past the reach (or a degenerate reach) files in the last band.
 */
export function rangeBandOf(rangeU: number, reachU: number): number {
  if (!(reachU > 0) || !Number.isFinite(rangeU)) return RANGE_BANDS - 1;
  const band = Math.floor((Math.max(0, rangeU) / reachU) * RANGE_BANDS);
  return Math.min(RANGE_BANDS - 1, band);
}

/** True for a MAIN-BATTERY shell: the server-private `batteryShell` marker,
 *  which ONLY the main battery's salvo sets (equipment/mainBattery.ts). The
 *  old inference from `contactDamage !== damage` misfiled a hull or `--tune`
 *  arm whose shell damage equals its contact damage (Story 11.1 review fix). */
export function isMainBatteryShell(s: ShellState): boolean {
  return s.kind === 'shell' && s.batteryShell === true;
}

/** Did shell `shellId` (owned by `ownerId`) damage a hull on this tick's
 *  events? (See the header for the exact rule.) */
export function shellDamagedHull(events: readonly GameEvent[], shellId: string, ownerId: string): boolean {
  for (const e of events) {
    if (e.k === 'boom' && e.id === shellId && e.hit !== undefined) return true;
    if ((e.k === 'burst' || e.k === 'boom') && e.id === shellId) return events.some((h) => h.k === 'hc' && h.id === ownerId && h.x === e.x && h.y === e.y);
  }
  return false;
}

/** A main-battery shell in flight: whose, and which band it was fired in. */
interface InFlight {
  ownerId: string;
  band: number;
}

/** The per-bot counters this tracker writes into (BotReadouts' two arrays). */
export interface BandCounters {
  mbBandShells: number[];
  mbBandHits: number[];
}

/** Follows main-battery shells from first sight to the tick they leave. */
export class RangeBandTracker {
  private flying = new Map<string, InFlight>();

  /** A shell seen for the first time: file it in its band. */
  launched(s: ShellState, reachU: number, out: BandCounters): void {
    if (!isMainBatteryShell(s) || s.targetX === null || s.targetY === null) return;
    const band = rangeBandOf(Math.hypot(s.targetX - s.x, s.targetY - s.y), reachU);
    out.mbBandShells[band] += 1;
    this.flying.set(s.id, { ownerId: s.ownerId, band });
  }

  /** After the tick: every tracked shell no longer in `live` is spent — a hit
   *  in its band if this tick's events say it damaged a hull. */
  settle(live: ReadonlyMap<string, unknown>, events: readonly GameEvent[], counters: (ownerId: string) => BandCounters | undefined): void {
    for (const [id, f] of this.flying) {
      if (live.has(id)) continue;
      this.flying.delete(id);
      const out = counters(f.ownerId);
      if (out !== undefined && shellDamagedHull(events, id, f.ownerId)) out.mbBandHits[f.band] += 1;
    }
  }
}
