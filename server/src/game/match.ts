// Match lifecycle — the room's phase state machine, pure logic (zero Colyseus
// imports; ArenaRoom is a thin adapter that forwards join/leave/tick and
// implements the side-effect hooks). Phases:
//
//   waiting   — ready room. Ships spawn/drive/aim/FIRE freely, but all damage
//               is suppressed (World.damageEnabled=false; target practice) and
//               mine drops are disabled. Respawn works.
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

import { CONFIG, type MatchPhase, type ResultsMsg, type ResultsRow } from '@salvo/shared';
import type { ShipRecord, World } from './world.js';

/** Countdown/results timing. Overridable per-room via the DEV-ONLY matchOverride. */
export interface MatchTimings {
  countdownMs: number;
  resultsMs: number;
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

/** Snapshot of a participant's identity + tallies (survives their ship's removal). */
interface Participant {
  name: string;
  kills: number;
  damageDealt: number;
}

export class Match {
  phase: MatchPhase = 'waiting';
  /** Server ms the countdown ends at; 0 while no countdown is running. */
  countdownEndT = 0;
  /** Winner's id once finished ('' before). */
  winnerId = '';
  /** placement per participant id, filled when the match finishes. */
  readonly placements = new Map<string, number>();

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

  /** Call after any join (and after onPlayerLeave): starts/cancels the countdown. */
  notifyRosterChanged(): void {
    if (this.phase === 'waiting' && this.humanCount() >= CONFIG.match.minHumans) {
      this.phase = 'countdown';
      this.countdownEndT = this.world.now + this.timings.countdownMs;
      this.applyPolicy();
      this.hooks.lock();
    } else if (this.phase === 'countdown' && this.humanCount() < CONFIG.match.minHumans) {
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
    this.participants.clear();
    this.sinkOrder.length = 0;
    for (const s of this.world.ships.values()) {
      if (!s.isDrone) this.participants.set(s.id, { name: s.name, kills: 0, damageDealt: 0 });
    }
    this.applyPolicy();
  }

  private finish(aliveWinner: ShipRecord | undefined): void {
    for (const s of this.world.ships.values()) {
      if (this.participants.has(s.id)) this.snapshotStats(s);
    }
    // RULING: with 0 humans alive (simultaneous mutual destruction) the winner
    // is the latest-sunk human — the last entry in the sink order.
    this.winnerId = aliveWinner?.id ?? this.sinkOrder[this.sinkOrder.length - 1] ?? '';
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
    w.minesEnabled = this.phase === 'active';
    w.respawnEnabled = this.phase === 'waiting' || this.phase === 'countdown';
  }

  /** Record this tick's sink events (humans only) into the placement order. */
  private consumeSinks(): void {
    for (const e of this.world.tickEvents) {
      if (e.k === 'sunk') this.recordSink(e.id);
    }
  }

  private recordSink(id: string): void {
    if (!this.participants.has(id) || this.sinkOrder.includes(id)) return;
    this.sinkOrder.push(id);
  }

  /** Post-step / post-leave: ≤1 alive human-controlled hull ends the match. */
  private checkWin(): void {
    const alive = this.aliveHumans();
    if (alive.length > 1) return;
    this.finish(alive[0]);
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
}
