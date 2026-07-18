// Match lifecycle — the room's phase state machine, pure logic (zero Colyseus
// imports; ArenaRoom is a thin adapter that forwards join/leave/tick and
// implements the side-effect hooks). Phases:
//
//   waiting   — ready room. Ships spawn/drive/aim/FIRE freely (including mine
//               drops), but all damage is suppressed (World.damageEnabled=
//               false; target practice). Respawn works.
//   countdown — starts the moment ≥ CONFIG.match.minHumans humans are present;
//               countdownEndT = now + countdown. The room LOCKS (late joiners
//               land in fresh rooms via joinOrCreate). CANCELS back to waiting
//               (and unlocks) if humans drop below the minimum.
//   active    — countdown elapsed: drone-fill seam runs (STEP 15 STUB), the
//               field is cleared and every hull redeployed to the spawn ring,
//               THEN the storm timeline anchors. Damage live, respawn DISABLED
//               (death → spectator frames, see frames.ts). Sink order is
//               tracked for placement; a player leaving mid-match counts as
//               sunk-at-leave-time.
//   finished  — alive human hulls ≤ 1. winnerId = the survivor, or (mutual
//               destruction, RULING) the LATEST-sunk human. Placements set,
//               one 'results' broadcast, damage frozen; after resultsMs the
//               room disconnects (autoDispose). No new matches in this room.

import {
  CONFIG,
  type MatchPhase,
  type ResultsMsg,
  type ResultsRow,
  type ShipClassId,
} from '@salvo/shared';
import type { ShipRecord, World } from './world.js';

/** Countdown/results timing. Overridable per-room via the DEV-ONLY matchOverride. */
export interface MatchTimings {
  countdownMs: number;
  resultsMs: number;
  /** Humans required to start the countdown. DEV override; defaults to CONFIG. */
  minHumans?: number;
}

export function defaultTimings(): MatchTimings {
  return {
    countdownMs: CONFIG.match.countdown,
    resultsMs: CONFIG.match.resultsSeconds * 1000,
  };
}

/** The side effects the state machine may trigger — implemented by the room. */
export interface MatchHooks {
  /** Close the room to new joins (countdown start). */
  lock(): void;
  /** Reopen the room (countdown cancelled). */
  unlock(): void;
  /** Drone-fill seam, run at countdown end BEFORE the field reset. STEP 15 STUB. */
  fillToCapacity(): void;
  /** Broadcast the one-time end-of-match results message. */
  broadcastResults(msg: ResultsMsg): void;
  /** Gracefully disconnect every client (room disposes via autoDispose). */
  disconnect(): void;
}

/** What the room should do with a non-consented disconnect (story 0.2). */
export type DropPolicy = 'hold' | 'teardown';

/**
 * Drop policy for a non-consented disconnect: offer the reconnect grace window
 * ('hold' — the ship keeps sailing under its last stored input) ONLY when ALL
 * of the following hold:
 *   - the close was a genuine abnormal/network drop the SDK auto-reconnects on
 *     (reconnectableClose — the room maps the WebSocket close code; see
 *     ArenaRoom.RECONNECTABLE_CLOSE_CODES). PUNITIVE closes — rate-limit /
 *     malformed-message kicks (WITH_ERROR 4002), server shutdown, etc. — are
 *     NOT reconnectable and must fall through to teardown, or a kicked client
 *     holding its reconnectionToken could walk right back in (matchMaker.
 *     reconnect() bypasses onAuth) or stall the endgame as a headless ghost.
 *   - the match is active (a ghost must never arm or hold the countdown, and
 *     the results window / sandbox rooms have nothing to hold),
 *   - the session still owns a ship,
 *   - that hull is still afloat (a dead spectator has nothing to resume into).
 * Everything else gets today's immediate leave teardown. Pure so the FULL
 * matrix stays unit-testable without a transport.
 */
export function dropPolicy(
  matchActive: boolean,
  hasShip: boolean,
  shipAlive: boolean,
  reconnectableClose: boolean,
): DropPolicy {
  return matchActive && hasShip && shipAlive && reconnectableClose ? 'hold' : 'teardown';
}

/**
 * Effective consecutive-tick-error tolerance before the room aborts. Parsed from
 * an operator override (a positive integer), clamped to [1, 100] so a fat-finger
 * value like 1e9 can't effectively disable containment (or unthrottle error
 * logging). On a missing/invalid override it defaults to 3 in production and 1
 * elsewhere (dev fails fast, prod rides out a transient blip). Env-independent by
 * design — the caller reads process.env and the prod flag; this stays pure so the
 * policy is unit-testable.
 */
export function resolveTickErrorTolerance(overrideRaw: string | undefined, isProd: boolean): number {
  const n = Number(overrideRaw);
  if (Number.isInteger(n) && n > 0) return Math.min(n, 100);
  return isProd ? 3 : 1;
}

/** Abort decision: the room gives up once consecutive failures reach tolerance. */
export function shouldAbortOnTickError(consecutiveFailures: number, tolerance: number): boolean {
  return consecutiveFailures >= tolerance;
}

/**
 * Pure, room-agnostic telemetry aggregate for a match, assembled sim-side so the
 * numbers stay unit-testable without a Colyseus room. The room decorates it with
 * identity (matchId, mode) before emitting `match.end`. Safe to call in any
 * phase: everything reads zero/empty/null until a match activates and finishes.
 */
export interface MatchEndSummary {
  /** All combatants captured at activation, drones included. */
  rosterSize: number;
  /** classId -> combatant count (drones included). */
  rosterByClass: Record<string, number>;
  /** (finishedAt - activatedAt) in seconds, rounded to 1 decimal; 0 if unfinished. */
  durationS: number;
  /** Winner participant's classId, or null when there is no winner yet. */
  winnerClass: string | null;
  /** classId -> summed kills across combatants (drones included). */
  killsByClass: Record<string, number>;
  /** Sinks with no attributable killer (storm deaths) observed while active. */
  stormDeaths: number;
}

/** Snapshot of a participant's identity + tallies (survives their ship's removal). */
interface Participant {
  name: string;
  isDrone: boolean;
  classId: ShipClassId;
  kills: number;
  damageDealt: number;
}

export class Match {
  phase: MatchPhase = 'waiting';
  /** Server ms the countdown ends at; 0 while no countdown is running. */
  countdownEndT = 0;
  /** Winner's id once finished ('' before). */
  winnerId = '';
  /** Server ms the match went active (0 before activation). Telemetry duration base. */
  activatedAt = 0;
  /** placement per participant id, filled when the match finishes. */
  readonly placements = new Map<string, number>();

  /** Killer-less sinks (storm deaths) observed during the active phase. */
  private stormDeaths = 0;

  /** Human ids in sink order (earliest first). Later sink = better placement. */
  private readonly sinkOrder: string[] = [];
  /** Humans present at activation — the results roster (stats refreshed on exit/finish). */
  private readonly participants = new Map<string, Participant>();
  private finishedAt = 0;
  private disconnectFired = false;

  constructor(
    private readonly world: World,
    private readonly timings: MatchTimings,
    private readonly hooks: MatchHooks,
  ) {
    this.applyPolicy();
  }

  /** Humans required to start the countdown (DEV override, else CONFIG). */
  private get minHumans(): number {
    return this.timings.minHumans ?? CONFIG.match.minHumans;
  }

  /** Call after any join (and after onPlayerLeave): starts/cancels the countdown. */
  notifyRosterChanged(): void {
    if (this.phase === 'waiting' && this.humanCount() >= this.minHumans) {
      this.phase = 'countdown';
      this.countdownEndT = this.world.now + this.timings.countdownMs;
      this.applyPolicy();
      this.hooks.lock();
    } else if (this.phase === 'countdown' && this.humanCount() < this.minHumans) {
      this.phase = 'waiting';
      this.countdownEndT = 0;
      this.applyPolicy();
      this.hooks.unlock();
    }
  }

  /**
   * A client left. Owns the ship removal so a mid-match departure is
   * snapshotted first: it counts as sunk-at-leave-time for placement, then the
   * win check runs against the post-removal roster.
   */
  onPlayerLeave(id: string): void {
    const ship = this.world.ships.get(id);
    if (ship && this.phase === 'active' && this.participants.has(id)) {
      this.snapshotStats(ship);
      this.recordSink(id);
    }
    this.world.removeShip(id);
    this.notifyRosterChanged();
    if (this.phase === 'active') this.checkWin();
  }

  /** Advance the state machine one tick. Call right after world.step(). */
  update(): void {
    if (this.phase === 'countdown' && this.world.now >= this.countdownEndT) this.activate();
    if (this.phase === 'active') {
      this.consumeSinks();
      this.checkWin();
    }
    if (this.phase === 'finished') this.maybeDisconnect();
  }

  // --- transitions -----------------------------------------------------------

  /** Countdown end → active. Fill seam, field reset, THEN the storm anchors. */
  private activate(): void {
    this.hooks.fillToCapacity(); // STEP 15 STUB — drones land here
    this.world.resetForMatchStart();
    this.world.startZone(this.world.now);
    this.phase = 'active';
    this.countdownEndT = 0;
    this.activatedAt = this.world.now;
    this.stormDeaths = 0;
    this.participants.clear();
    this.sinkOrder.length = 0;
    // Drones ARE participants (kill feed / contacts / results rows include them
    // and they can hold a placement) — the win + winner logic below is what
    // keeps a drone from ever winning, not their exclusion from the roster.
    for (const s of this.world.ships.values()) {
      this.participants.set(s.id, {
        name: s.name,
        isDrone: s.isDrone,
        classId: s.classId,
        kills: 0,
        damageDealt: 0,
      });
    }
    this.applyPolicy();
  }

  private finish(aliveWinner: ShipRecord | undefined): void {
    for (const s of this.world.ships.values()) {
      if (this.participants.has(s.id)) this.snapshotStats(s);
    }
    // FINDING P2 (hardening): participants is snapshotted once at activate();
    // currently unreachable in practice because the room locks at countdown
    // (no ship can join mid-match), but if that ever changes a late-joining
    // winner would be absent from participants and resultsMsg() would silently
    // drop their row despite winnerId pointing at them. Backfill a minimal
    // participant record from the ship itself rather than special-casing
    // resultsMsg()/computePlacements() — simplest option that keeps every
    // downstream read (snapshotStats, resultsMsg) correct with no other change.
    if (aliveWinner && !this.participants.has(aliveWinner.id)) {
      this.participants.set(aliveWinner.id, {
        name: aliveWinner.name,
        isDrone: aliveWinner.isDrone,
        classId: aliveWinner.classId,
        kills: aliveWinner.kills,
        damageDealt: aliveWinner.damageDealt,
      });
    }
    // RULING: with 0 humans alive (simultaneous mutual destruction, or the lone
    // human sinking to the storm while drones survive) the winner is the
    // latest-sunk HUMAN — drones can never win, so we skip past them in the sink
    // order rather than taking its last entry blindly.
    this.winnerId = aliveWinner?.id ?? this.latestSunkHuman() ?? '';
    this.computePlacements();
    this.phase = 'finished';
    this.finishedAt = this.world.now;
    this.applyPolicy(); // freeze the outcome: damage suppressed during results
    this.hooks.broadcastResults(this.resultsMsg());
  }

  // --- per-phase bookkeeping ---------------------------------------------------

  /** World combat policy per phase: the ready room is weapons-hot but harmless. */
  private applyPolicy(): void {
    const w = this.world;
    w.damageEnabled = this.phase === 'active';
    w.respawnEnabled = this.phase === 'waiting' || this.phase === 'countdown';
  }

  /** Record this tick's sink events (humans only) into the placement order. */
  private consumeSinks(): void {
    for (const e of this.world.tickEvents) {
      if (e.k !== 'sunk') continue;
      this.recordSink(e.id);
      // A sunk event with no killer is a storm death (world.applyStorm) — the
      // only killer-less sink path. Tallied for match.end telemetry.
      if (e.by === undefined) this.stormDeaths += 1;
    }
  }

  private recordSink(id: string): void {
    if (!this.participants.has(id) || this.sinkOrder.includes(id)) return;
    this.sinkOrder.push(id);
  }

  /**
   * Post-step / post-leave win check. A match with drones aboard cannot finish
   * on the "≤1 human afloat" rule alone — that is already true at activation (1
   * human + 5 drones), which would insta-finish. So the match ends only when:
   *   - no human is alive (all humans sunk — winner = latest-sunk human), OR
   *   - exactly one human is alive AND no other hull (drone or human) remains
   *     (the lone human has cleared the field — winner = that human).
   * A lone human with drones still afloat keeps fighting.
   */
  private checkWin(): void {
    const humans = this.aliveHumans();
    if (humans.length > 1) return;
    if (humans.length === 1 && this.aliveDroneCount() > 0) return;
    this.finish(humans[0]);
  }

  private maybeDisconnect(): void {
    if (this.disconnectFired || this.world.now < this.finishedAt + this.timings.resultsMs) return;
    this.disconnectFired = true;
    this.hooks.disconnect();
  }

  // --- results ----------------------------------------------------------------

  /** Winner = 1; everyone else by reverse sink order (later sink places higher). */
  private computePlacements(): void {
    this.placements.clear();
    if (this.winnerId) this.placements.set(this.winnerId, 1);
    let next = 2;
    for (let i = this.sinkOrder.length - 1; i >= 0; i--) {
      const id = this.sinkOrder[i];
      if (this.placements.has(id)) continue; // the mutual-destruction winner
      this.placements.set(id, next);
      next += 1;
    }
  }

  private resultsMsg(): ResultsMsg {
    const rows: ResultsRow[] = [];
    for (const [id, p] of this.participants) {
      rows.push({
        id,
        name: p.name,
        placement: this.placements.get(id) ?? 0,
        kills: p.kills,
        damageDealt: p.damageDealt,
      });
    }
    rows.sort((a, b) => a.placement - b.placement);
    return { winnerId: this.winnerId, rows };
  }

  /**
   * Pure end-of-match telemetry aggregate (no identity, no I/O). Reads the
   * participant snapshot (populated at activate(), stats refreshed at finish()/
   * leave), so kills reflect the freshest values available at finish time.
   * Returns zeros/empty/null before activation. The room adds matchId/mode.
   */
  endSummary(): MatchEndSummary {
    const rosterByClass: Record<string, number> = {};
    const killsByClass: Record<string, number> = {};
    for (const p of this.participants.values()) {
      rosterByClass[p.classId] = (rosterByClass[p.classId] ?? 0) + 1;
      killsByClass[p.classId] = (killsByClass[p.classId] ?? 0) + p.kills;
    }
    const finished = this.finishedAt > 0 && this.activatedAt > 0;
    const durationS = finished ? Math.round((this.finishedAt - this.activatedAt) / 100) / 10 : 0;
    return {
      rosterSize: this.participants.size,
      rosterByClass,
      durationS,
      winnerClass: this.participants.get(this.winnerId)?.classId ?? null,
      killsByClass,
      stormDeaths: this.stormDeaths,
    };
  }

  private snapshotStats(ship: ShipRecord): void {
    const p = this.participants.get(ship.id);
    if (!p) return;
    p.kills = ship.kills;
    p.damageDealt = ship.damageDealt;
  }

  private humanCount(): number {
    let n = 0;
    for (const s of this.world.ships.values()) if (!s.isDrone) n += 1;
    return n;
  }

  private aliveHumans(): ShipRecord[] {
    const out: ShipRecord[] = [];
    for (const s of this.world.ships.values()) {
      if (!s.isDrone && s.alive) out.push(s);
    }
    return out;
  }

  private aliveDroneCount(): number {
    let n = 0;
    for (const s of this.world.ships.values()) if (s.isDrone && s.alive) n += 1;
    return n;
  }

  /** Latest-sunk human id (scanning the sink order from the end), or undefined. */
  private latestSunkHuman(): string | undefined {
    for (let i = this.sinkOrder.length - 1; i >= 0; i--) {
      const id = this.sinkOrder[i];
      if (!this.participants.get(id)?.isDrone) return id;
    }
    return undefined;
  }
}
