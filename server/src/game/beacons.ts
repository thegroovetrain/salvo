// THE RADIO BEACON FIELD (Story 10.8, Eric rulings R1–R13, 2026-11-06, epic-10
// amendment 14) — the server's store of the cycle's beacons, on the
// `drones.ts` controller pattern: the World owns ONE of these and reaches it
// through a handful of glue rows; nothing here imports Colyseus or the World's
// value side.
//
// A BEACON IS ITS OWN OBJECT, NEVER A SHIP. It holds no ShipRecord, so it is
// by construction never a perception contact, a radar paint, a wake, a storm
// victim, a `sunk` row, a bounty candidate or a win-check seat: a site that
// forgets about beacons means "the beacon did not take that damage" (caught
// by the per-weapon matrix in beacons.test.ts), never a leak.
//
// WHAT IS PUBLIC AND WHAT IS NOT. A beacon's cycle, position and EARLY sink
// time are public facts (R9) — they ride the Colyseus schema through
// `BeaconField.chart`, the only thing the room adapter (and, later, the bots'
// port) reads. Its hp, its pot, its damage ledger and its hulls-in-range
// counters never leave the server.
//
// THE LIFECYCLE AND THE RATE ARE NOT HERE. `shared/src/sim/beacons.ts` is the
// one model (`beaconStateAt`, `beaconXpMsPerMs`, `splitBeaconPot`,
// `beaconPolygon`, `beaconInRange`); this file only stores, places, pays and
// counts through it. The hp DECREMENT is not here either: the damage gate's
// fence keeps every `.hp -=` in world.ts (`World.damageBeacon`).

import {
  CONFIG,
  beaconCountFor,
  beaconHittable,
  beaconInRange,
  beaconPolygon,
  beaconSolid,
  beaconStateAt,
  beaconXpMsPerMs,
  mulberry32,
  splitBeaconPot,
  type BeaconPhase,
  type ContactBody,
  type Rng,
  type Target,
  type Vec2,
} from '@salvo/shared';
import type { FleetAnchor } from './spawn.js';
import type { AssistTally, ShipRecord } from './world.js';

/** How many beacons the public chart can carry — the schema's `bcn0…bcn7`
 *  slots (rooms/schema/ArenaState.ts). WIRE CAPACITY, not a gameplay dial: a
 *  `CONFIG.beacons.counts` entry above it is placed only up to this many, so
 *  the server can never hold a beacon no client was told about. */
export const BEACON_CHART_SLOTS = 8;

/** One beacon. Everything but `x` / `y` / `sinkT` (and the cycle it belongs
 *  to) is SERVER-PRIVATE. */
export interface BeaconRecord {
  /** Server-side handle only (`bcn-<cycle>-<slot>`) — NEVER on the wire. */
  readonly id: string;
  readonly cycle: number;
  /** Its index in the cycle's set — the schema slot it is mirrored into. */
  readonly slot: number;
  readonly x: number;
  readonly y: number;
  /** Hit points left. Decremented ONLY by `World.damageBeacon`. */
  hp: number;
  /** Server ms of the EARLY sink (R6), 0 = the natural schedule. Public (R9). */
  sinkT: number;
  /** XP ms accrued and not yet paid: the split's integer remainder plus the
   *  sub-ms fraction of the rate. Zeroed whenever the circle is empty. */
  potMs: number;
  /** Who damaged it and when — the kill value's split ledger (R13), on the
   *  same rolling-counter entries a hull's `damageFrom` holds. */
  readonly damageFrom: Map<string, AssistTally>;
  /** Server ms of its next smoke puff (R11) — the hull throttle's twin. */
  nextSmokeAt: number;
  /** HARNESS: hulls inside the paying circle on the last payout tick. */
  inRange: number;
  /** HARNESS: `inRangeTicks[n]` = paying ticks this beacon had n hulls in range. */
  readonly inRangeTicks: number[];
  /** Its body in world space (the shared octagon) — the ordnance target
   *  polygon and the contact body's outline. Never moves. */
  readonly poly: Vec2[];
  /** Its immovable hull-pass body (R7): mass = ARMOR, speed 0. */
  readonly body: ContactBody;
}

/** One charted beacon as every client is told about it. */
export interface BeaconChartEntry {
  readonly x: number;
  readonly y: number;
  /** Server ms of the early sink, 0 = the natural schedule. */
  readonly sinkT: number;
}

/**
 * THE PUBLIC CHART — exactly what the schema carries, and the only beacon
 * reading the room adapter and the bots' port may take. `cycle` is the ring
 * cycle the set belongs to, -1 when there is none (before the zone starts, in
 * a cycle with no beacons, with beacons switched off); `cycleStartT` is the
 * server ms that cycle began (0 when none) — derivable by any client from the
 * zone clock, carried here so a server-side reader does not re-derive it.
 */
export interface BeaconChart {
  readonly cycle: number;
  readonly cycleStartT: number;
  readonly beacons: readonly BeaconChartEntry[];
}

const NO_CHART: BeaconChart = Object.freeze({ cycle: -1, cycleStartT: 0, beacons: Object.freeze([]) });

/** One placement request: the cycle's private stream and the beacons already
 *  picked this cycle (each pick enters the next one's `occupied`). */
export type BeaconPick = (rng: Rng, taken: readonly Vec2[]) => FleetAnchor;

/** Pays one hull its integer share of a beacon's pot. */
export type BeaconPay = (hull: ShipRecord, shareMs: number) => void;

export class BeaconField {
  private list: BeaconRecord[] = [];
  private readonly byId = new Map<string, BeaconRecord>();
  /** The last ring cycle the placer ran for — INCLUDING a cycle that got no
   *  beacons, which is why it is not the chart's cycle. -1 = never. */
  private placedCycle = -1;
  private cycleStartT = 0;
  private chartMemo: BeaconChart | null = null;
  /** Scratch: the hulls inside one beacon's circle this tick. */
  private readonly receivers: ShipRecord[] = [];
  /** HARNESS: `inRangeTicks[n]` = beacon-ticks, over the whole match and every
   *  beacon, on which a paying beacon had n hulls in range. */
  readonly inRangeTicks: number[] = [];

  /** `seed` is SERVER-PRIVATE material (the World mints it off the room's
   *  private entropy, never the public map seed): max-min placement against
   *  the captains' positions on a stream a client could replay would turn the
   *  public chart into a position oracle. */
  constructor(private readonly seed: number) {}

  /** The last ring cycle placed for (-1 = none yet). */
  get cycle(): number {
    return this.placedCycle;
  }

  /** Every beacon of the current set, in slot order. */
  get records(): readonly BeaconRecord[] {
    return this.list;
  }

  get(id: string): BeaconRecord | undefined {
    return this.byId.get(id);
  }

  /** The public chart (memoized; rebuilt after a placement or an early sink). */
  get chart(): BeaconChart {
    if (this.chartMemo !== null) return this.chartMemo;
    this.chartMemo =
      this.list.length === 0
        ? NO_CHART
        : {
            cycle: this.placedCycle,
            cycleStartT: this.cycleStartT,
            beacons: this.list.map((b) => ({ x: b.x, y: b.y, sinkT: b.sinkT })),
          };
    return this.chartMemo;
  }

  /**
   * REPLACE THE SET for ring cycle `cycle` (R2): the previous cycle's beacons
   * are dropped whatever state they are in, and `beaconCountFor(cycle)` new
   * ones are picked in order on the cycle's own private stream. A cycle with
   * no beacons (sudden death) simply clears the set.
   */
  replace(cycle: number, cycleStartT: number, pick: BeaconPick): void {
    this.list = [];
    this.byId.clear();
    this.placedCycle = cycle;
    this.cycleStartT = cycleStartT;
    this.chartMemo = null;
    const count = Math.min(beaconCountFor(cycle), BEACON_CHART_SLOTS);
    if (count === 0) return;
    const rng = mulberry32((this.seed ^ Math.imul(cycle + 1, 0x9e3779b9)) >>> 0);
    const taken: Vec2[] = [];
    for (let slot = 0; slot < count; slot += 1) {
      const at = pick(rng, taken);
      taken.push({ x: at.x, y: at.y });
      this.add(cycle, slot, at.x, at.y);
    }
  }

  private add(cycle: number, slot: number, x: number, y: number): void {
    const id = `bcn-${cycle}-${slot}`;
    const poly = beaconPolygon(x, y);
    const rec: BeaconRecord = {
      id,
      cycle,
      slot,
      x,
      y,
      hp: CONFIG.beacons.hp,
      sinkT: 0,
      potMs: 0,
      damageFrom: new Map(),
      nextSmokeAt: 0,
      inRange: 0,
      inRangeTicks: [],
      poly,
      // Immovable, so the resolver never writes this state or this outline.
      body: { id, state: { x, y, heading: 0, speed: 0 }, poly, mass: CONFIG.beacons.armor, movable: false },
    };
    this.list.push(rec);
    this.byId.set(id, rec);
  }

  /** Where `b` is in its life at `now` — the shared model, nothing else. */
  phaseOf(b: BeaconRecord, now: number): BeaconPhase {
    return beaconStateAt(now, this.cycleStartT, b.sinkT).phase;
  }

  /** Can a weapon strike `b` at `now`? (Afloat only — R6.) */
  hittable(b: BeaconRecord, now: number): boolean {
    return beaconHittable(this.phaseOf(b, now));
  }

  /** Append every HITTABLE beacon as an ordnance target (kind `beacon`). */
  collectTargets(now: number, out: Target[]): void {
    for (const b of this.list) {
      if (this.hittable(b, now)) out.push({ id: b.id, kind: 'beacon', poly: b.poly });
    }
  }

  /** Append every SOLID beacon's immovable body (afloat AND sinking — R12). */
  collectBodies(now: number, out: ContactBody[]): void {
    for (const b of this.list) {
      if (beaconSolid(this.phaseOf(b, now))) out.push(b.body);
    }
  }

  /** Stamp the EARLY sink (R6): the sink minute starts at `now`. */
  sink(b: BeaconRecord, now: number): void {
    b.sinkT = now;
    this.chartMemo = null;
  }

  /**
   * ONE TICK OF PAYOUT (R3, R4). For every beacon in a paying phase, the
   * afloat `hulls` whose centre is in range split the pot evenly in INTEGER
   * ms; the remainder — and the sub-ms fraction of the rate — carries to the
   * next tick, so nothing drifts and nothing is lost. An EMPTY circle accrues
   * nothing and forfeits what was carried (no jackpot for the first arrival).
   *
   * The rate is read at the MIDDLE of the tick's interval (`now − dt/2`): the
   * pot accrues over (now − dt, now], and the midpoint is the exact integral
   * of a rate that is constant or linear across it — so on a tick-aligned
   * clock a beacon's natural pot is exactly `levelsPerMin × (floatMs +
   * sinkMs / 2)` and the tick that lands ON the surface instant does not pay
   * for the charted 50 ms behind it.
   *
   * `hulls` is the caller's list of hulls that MAY be paid (afloat
   * participants); who is in range is decided here, on their positions now.
   */
  payout(now: number, dtMs: number, hulls: readonly ShipRecord[], pay: BeaconPay): void {
    for (const b of this.list) {
      const rate01 = beaconStateAt(now - dtMs / 2, this.cycleStartT, b.sinkT).rate01;
      if (!(rate01 > 0)) {
        b.inRange = 0;
        b.potMs = 0;
        continue;
      }
      const receivers = this.receiversOf(b, hulls);
      this.count(b, receivers.length);
      if (receivers.length === 0) {
        b.potMs = 0;
        continue;
      }
      b.potMs += beaconXpMsPerMs(rate01) * dtMs;
      const whole = Math.floor(b.potMs);
      const { shareMs, carryMs } = splitBeaconPot(whole, receivers.length);
      b.potMs = b.potMs - whole + carryMs;
      if (shareMs > 0) for (const hull of receivers) pay(hull, shareMs);
    }
  }

  /** The hulls whose CENTRE is inside `b`'s paying circle (scratch, reused). */
  private receiversOf(b: BeaconRecord, hulls: readonly ShipRecord[]): readonly ShipRecord[] {
    const out = this.receivers;
    out.length = 0;
    for (const hull of hulls) {
      if (beaconInRange(b.x, b.y, hull.state.x, hull.state.y)) out.push(hull);
    }
    return out;
  }

  /** HARNESS: note `n` hulls in range of a paying beacon this tick. */
  private count(b: BeaconRecord, n: number): void {
    b.inRange = n;
    b.inRangeTicks[n] = (b.inRangeTicks[n] ?? 0) + 1;
    this.inRangeTicks[n] = (this.inRangeTicks[n] ?? 0) + 1;
  }

  /**
   * SMOKE AND FIRE (R11): a hurt beacon on the water — afloat or sinking —
   * owes one anonymous puff per `CONFIG.smoke.puffIntervalMs`, at the tier the
   * SHIP damage bands give its hp fraction (the hull emitter's rule, read off
   * the same two CONFIG blocks). `emit` queues the existing `sm` row; nothing
   * about the beacon rides it.
   */
  smoke(now: number, emit: (x: number, y: number, tier: 1 | 2) => void): void {
    const bands = CONFIG.damageBands;
    for (const b of this.list) {
      if (now < b.nextSmokeAt || !beaconSolid(this.phaseOf(b, now))) continue;
      const frac = b.hp / CONFIG.beacons.hp;
      if (frac >= bands.amberBelow) continue;
      b.nextSmokeAt = now + CONFIG.smoke.puffIntervalMs;
      emit(b.x, b.y, frac < bands.criticalBelow ? 2 : 1);
    }
  }
}
