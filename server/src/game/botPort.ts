// THE BOT WORLD PORT ADAPTER (Story 9.13, epic-9 amendment 190).
//
// World used to hand BotController ITSELF as the BotWorldPort (it satisfied
// the interface structurally). Amendment 190 widened the port by three zone
// readouts a human client is sent or derives — the revealed next ring, the
// zone clock and the always-safe disc — and the zone clock cannot be a World
// field of that name (World.zonePhase is the schema's phase string). So the
// port is now an explicit object of delegating getters built here, and the
// three readouts are derived from the SAME public inputs a client holds:
//   * the ring as of the last boundary (the schema's `zoneCur*`),
//   * the revealed next ring (the schema's `zoneNext*`),
//   * the timeline anchor (`zoneStartT`) and the bundled CONFIG.zone,
// run through the shared `zoneLiveState` — the one live-ring derivation both
// sides already share — so a bot's clock equals a client's by construction.
//
// THE BEACON CHART (Story 10.8, Eric 2026-11-06 "bots sail to and farm
// beacons", epic-10 amendment 6(g); spec R3 / R9): `beacons()` reads ONLY
// `World.beaconChart` — the cycle, its start and each beacon's position and
// early sink time, exactly what the schema mirrors to every client — and runs
// each through the shared `beaconStateAt`, the one lifecycle a client's chart
// render reads too. Never the server's BeaconRecords (hp, pot, ledger).
//
// Lives OUTSIDE ai/ on purpose: it reads World (structurally, through
// BotPortSource), and ai/ may not import world.js. Zero Colyseus.

import {
  beaconStateAt,
  zoneLiveState,
  zoneRingRadii,
  type BeaconPhase,
  type ZonePhase,
  type ZoneRing,
  type ZoneTimeline,
  type GameMap,
} from '@salvo/shared';
import type { BotBeacon, BotWorldPort, BotZonePhase } from './ai/types.js';
import type { BeaconChart } from './beacons.js';
import type { NavCache } from './navCache.js';

/** What the adapter reads off World — every field public on World today. */
export interface BotPortSource {
  readonly now: number;
  readonly map: GameMap;
  readonly zoneLiveRing: ZoneRing;
  readonly zoneCurrentRing: ZoneRing;
  readonly zoneRevealedNextRing: ZoneRing | null;
  readonly zoneStartMs: number;
  readonly zonePhase: ZonePhase;
  readonly zoneEndgameReached: boolean;
  readonly helmEnabled: boolean;
  /** The public beacon chart (Story 10.8 — World.beaconChart). */
  readonly beaconChart: BeaconChart;
  /** The map's nav cache (Story 9.13, amendment 192 — game/navCache.ts). */
  readonly nav?: NavCache;
  submitInput(id: string, raw: unknown): boolean;
  spendPoint(id: string, rawChoice: unknown): boolean;
}

/** The zone clock and group a client derives (null group = idle/closed). */
interface ZoneClock {
  readonly phase: ZonePhase;
  readonly closesInMs: number | null;
  /** The live ring group, 0 while idle (ring 0 is live), null once closed. */
  readonly group: number | null;
}

/**
 * The zone clock from the client-visible inputs alone. Idle = no timeline
 * yet (group 0's ring is the whole map and live); closed = no close is coming.
 */
export function zoneClockOf(src: BotPortSource, cfg: ZoneTimeline): ZoneClock {
  if (src.zonePhase === 'idle') return { phase: 'idle', closesInMs: null, group: 0 };
  const s = zoneLiveState(src.now, src.zoneStartMs, src.zoneCurrentRing, src.zoneRevealedNextRing, cfg);
  if (s.phase === 'closed') return { phase: 'closed', closesInMs: null, group: null };
  return { phase: s.phase, closesInMs: s.closesInMs, group: s.groupIndex };
}

/**
 * THE ALWAYS-SAFE DISC (amendment 200(3)): a ring of radius r_next lying
 * inside the live ring (centre c, radius R) always contains the disc at c of
 * radius 2·r_next − R. `nextR` null (closed) = the live ring itself.
 */
export function safeDiscOf(live: ZoneRing, nextR: number | null): ZoneRing {
  const rNext = nextR ?? live.r;
  return { cx: live.cx, cy: live.cy, r: Math.max(0, 2 * rNext - live.r) };
}

/** A mutable BotBeacon — the port's reused rows. */
interface BeaconRow {
  x: number;
  y: number;
  phase: BeaconPhase;
  rate01: number;
}

/**
 * THE BOTS' BEACON VIEW (see the file header): one row per charted beacon at
 * `now`, written into `out` in place (rows reused, length trimmed) — the
 * chart's public facts through the shared lifecycle, nothing else.
 */
export function beaconRowsOf(chart: BeaconChart, now: number, out: BotBeacon[]): readonly BotBeacon[] {
  const rows = out as BeaconRow[];
  rows.length = chart.beacons.length;
  for (let i = 0; i < chart.beacons.length; i += 1) {
    const b = chart.beacons[i];
    const s = beaconStateAt(now, chart.cycleStartT, b.sinkT);
    const row = rows[i] ?? (rows[i] = { x: 0, y: 0, phase: 'charted', rate01: 0 });
    row.x = b.x;
    row.y = b.y;
    row.phase = s.phase;
    row.rate01 = s.rate01;
  }
  return rows;
}

/** Build the port World hands BotController (see the file header). */
export function makeBotPort(src: BotPortSource, cfg: ZoneTimeline): BotWorldPort {
  // The public ladder is a pure function of the map radius and CONFIG.zone;
  // both are fixed for a World's life, so it is computed once.
  let ladder: number[] | null = null;
  const nextLadderR = (group: number | null): number | null => {
    if (group === null) return null;
    ladder ??= zoneRingRadii(src.map.radius, cfg);
    return ladder[group + 1] ?? null;
  };
  const beaconRows: BotBeacon[] = [];
  return {
    get now() { return src.now; },
    get map() { return src.map; },
    get zoneLiveRing() { return src.zoneLiveRing; },
    get zoneEndgameReached() { return src.zoneEndgameReached; },
    get helmEnabled() { return src.helmEnabled; },
    get nav() { return src.nav ?? null; },
    submitInput: (id, raw) => src.submitInput(id, raw),
    spendPoint: (id, rawChoice) => src.spendPoint(id, rawChoice),
    zoneNextRing: () => src.zoneRevealedNextRing,
    zonePhase: (): BotZonePhase => {
      const c = zoneClockOf(src, cfg);
      return { phase: c.phase, closesInMs: c.closesInMs };
    },
    zoneSafeDisc: () => safeDiscOf(src.zoneLiveRing, nextLadderR(zoneClockOf(src, cfg).group)),
    beacons: () => beaconRowsOf(src.beaconChart, src.now, beaconRows),
  };
}
