// Match lifecycle — the room's phase state machine, pure logic (zero Colyseus
// imports; ArenaRoom is a thin adapter that forwards join/leave/tick and
// implements the side-effect hooks). Phases:
//
//   waiting   — ready room. Ships spawn/drive/aim/FIRE freely (including mine
//               drops), but all damage is suppressed (World.damageEnabled=
//               false; target practice). Respawn works.
//   gathering — ≥ CONFIG.match.minHumans humans present; the room stays
//               UNLOCKED for joinWindowMs (CONFIG.match.joinWindow) so more
//               captains can pile into the same room. Same weapons-safe
//               policy as waiting; countdownEndT carries the window deadline.
//               Joins never reset the timer. CANCELS back to waiting (WITHOUT
//               unlock — it was never locked) if humans drop below the
//               minimum. joinWindowMs <= 0 skips this phase entirely (legacy:
//               straight to countdown + lock — smokes/tests/batch-sim).
//   countdown — the join window elapsed (or joinWindowMs <= 0 at minHumans);
//               countdownEndT = now + countdown. The room LOCKS (late joiners
//               land in fresh rooms via joinOrCreate). CANCELS back to waiting
//               (and unlocks) if humans drop below the minimum.
//   active    — countdown elapsed: drone-fill seam runs (STEP 15 STUB), the
//               field is cleared and every hull redeployed to the spawn ring,
//               THEN the storm timeline anchors. Damage live, respawn DISABLED
//               (death → spectator frames, see frames.ts). Sink order is
//               tracked for placement; a player leaving mid-match counts as
//               sunk-at-leave-time.
//   finished  — AFLOAT CAPTAINS ≤ 1 (amendment 4: drones no longer gate the
//               win — see checkWin). winnerId = the survivor, or (mutual
//               destruction, RULING) the LATEST-sunk human. Placements set,
//               one 'results' broadcast, damage frozen; after resultsMs the
//               room disconnects (autoDispose). No new matches in this room.

import {
  CONFIG,
  isAfloat,
  type HullId,
  type MatchPhase,
  type ResultsMsg,
  type ResultsRow,
} from '@salvo/shared';
import type { ShipRecord, World } from './world.js';

/** Countdown/results timing. Overridable per-room via the DEV-ONLY matchOverride. */
export interface MatchTimings {
  countdownMs: number;
  resultsMs: number;
  /** Unlocked gathering window at minHumans, before the countdown arms.
   *  <= 0 collapses to the legacy behavior (immediate countdown + lock). */
  joinWindowMs: number;
  /** Humans required to start the countdown. DEV override; defaults to CONFIG. */
  minHumans?: number;
}

export function defaultTimings(): MatchTimings {
  return {
    countdownMs: CONFIG.match.countdown,
    resultsMs: CONFIG.match.resultsSeconds * 1000,
    joinWindowMs: CONFIG.match.joinWindow,
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
 * How a match ended (amendment 53) — the abandonment classification the balance
 * evidence needs, so a quit-out match isn't read as a fought-out one:
 *   lastHumanSunk — a terminal SINKING left 0 humans alive (mutual destruction
 *                   or the last human sinking to storm/combat; the winner is
 *                   resolved by latest-sunk placement).
 *   lastHumanLeft — the terminal event was a DEPARTURE that left 0 humans alive
 *                   (the quit-out path: onPlayerLeave → win check).
 *   fieldCleared  — the winner is alive with everything else gone.
 * Telemetry only: this rides the `match.end` log line, never the wire.
 */
export type MatchEndCause = 'lastHumanSunk' | 'fieldCleared' | 'lastHumanLeft';

/** What drove the win check that finished the match — the post-step sink scan
 *  or a client departure. Classification input only (see classifyEnd). */
type WinTrigger = 'sink' | 'leave';

/**
 * Pure, room-agnostic telemetry aggregate for a match, assembled sim-side so the
 * numbers stay unit-testable without a Colyseus room. The room decorates it with
 * identity (matchId, mode) before emitting `match.end`. Safe to call in any
 * phase: everything reads zero/empty/null until a match activates and finishes.
 */
export interface MatchEndSummary {
  /** All combatants captured at activation, drones included. */
  rosterSize: number;
  /** hullId -> combatant count (drones included, under their drone hull ids). */
  rosterByClass: Record<string, number>;
  /** (finishedAt - activatedAt) in seconds, rounded to 1 decimal; 0 if unfinished. */
  durationS: number;
  /** Winner participant's hull id (always a player class — drones never win),
   *  or null when there is no winner yet. */
  winnerClass: string | null;
  /** hullId -> summed kills across combatants (drones included). */
  killsByClass: Record<string, number>;
  /** Sinks with no attributable killer (storm deaths) observed while active. */
  stormDeaths: number;
  /** How the match ended (amendment 53). Before a finish this reads the
   *  no-survivor default ('lastHumanSunk'); durationS 0 + winnerClass null are
   *  what mark a summary as not-yet-finished. */
  endedBy: MatchEndCause;
}

/**
 * THE win predicate (Story 5.1 AC; amendment 4) — a CAPTAIN still in the fight.
 *
 * One predicate over lifecycle state, expressed once and reused: checkWin() is
 * the only rule, afloatCaptains() its only collector. There is no second,
 * near-identical walk of world.ships deciding who counts — the drone-side
 * counterpart (aliveDroneCount) is gone with the gate it existed for.
 *
 * `isAfloat` is the seam: when Story 5.2 rules whether a `sinking` hull still
 * counts as a combatant, this predicate moves with it for free.
 *
 * Drones are not captains, and drones are not combatants — the same position
 * the Public Register took for `sunk` (CONFIG.xp.droneTierLevels pays a
 * fraction of a level where a captain pays a full one) and Story 4.6's bounty
 * throne took for `captainKills`. Neither of those is touched here:
 * ShipRecord.kills still counts drones for the roster/results tally.
 */
function isAfloatCaptain(s: ShipRecord): boolean {
  return !s.isDrone && isAfloat(s.lifecycle);
}

/** Snapshot of a participant's identity + tallies (survives their ship's removal). */
interface Participant {
  name: string;
  isDrone: boolean;
  hullId: HullId;
  kills: number;
  damageDealt: number;
}

export class Match {
  phase: MatchPhase = 'waiting';
  /** CURRENT-PHASE deadline (server ms): the gathering window's end during
   *  'gathering', the countdown's end during 'countdown', 0 otherwise. The
   *  room mirrors it verbatim onto ArenaState.countdownEndT — the phase
   *  string disambiguates which deadline a client is reading. */
  countdownEndT = 0;
  /** Winner's id once finished ('' before). */
  winnerId = '';
  /** Server ms the match went active (0 before activation). Telemetry duration base. */
  activatedAt = 0;
  /** placement per participant id, filled when the match finishes. */
  readonly placements = new Map<string, number>();

  /** Killer-less sinks (storm deaths) observed during the active phase. */
  private stormDeaths = 0;

  /** Terminal cause, written once in finish(). The pre-finish value is derived
   *  from the same winner-resolution state a sunk-out finish reads (no alive
   *  survivor, no winnerId), never from a clock or the room. */
  private endedBy: MatchEndCause = 'lastHumanSunk';

  /** Participant ids in sink order (earliest first), DRONES INCLUDED — the
   *  order is the raw record; computePlacements() is what filters it to
   *  captains. Later sink = better placement. */
  private readonly sinkOrder: string[] = [];
  /** Everyone present at activation, drones included (stats refreshed on
   *  exit/finish). Telemetry reads all of it; the results rows read the
   *  captains only. */
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

  /** Call after any join (and after onPlayerLeave): opens/cancels the
   *  gathering window and starts/cancels the countdown. Joins during
   *  gathering deliberately change nothing — the window timer never resets. */
  notifyRosterChanged(): void {
    const enough = this.humanCount() >= this.minHumans;
    if (this.phase === 'waiting' && enough) {
      // joinWindowMs <= 0 collapses synchronously to the legacy behavior:
      // straight to countdown + lock (smokes/tests/batch-sim fast path).
      if (this.timings.joinWindowMs > 0) this.openGathering();
      else this.startCountdown();
    } else if (this.phase === 'gathering' && !enough) {
      // Back to waiting WITHOUT unlock(): the gathering room was never locked.
      this.phase = 'waiting';
      this.countdownEndT = 0;
      this.applyPolicy();
    } else if (this.phase === 'countdown' && !enough) {
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
    // 'leave': a finish that falls out of THIS check was driven by a departure.
    if (this.phase === 'active') this.checkWin('leave');
  }

  /** Advance the state machine one tick. Call right after world.step(). */
  update(): void {
    if (this.phase === 'gathering' && this.world.now >= this.countdownEndT) {
      this.startCountdown();
      // Return so 'countdown' is synced to clients for at least one tick even
      // under degenerate dev timings (countdownMs <= 0 would otherwise cascade
      // gathering -> countdown -> active inside a single update).
      return;
    }
    if (this.phase === 'countdown' && this.world.now >= this.countdownEndT) this.activate();
    if (this.phase === 'active') {
      this.consumeSinks();
      this.checkWin('sink');
    }
    if (this.phase === 'finished') this.maybeDisconnect();
  }

  // --- transitions -----------------------------------------------------------

  /** minHumans reached with a real join window: hold the room OPEN so more
   *  captains can gather. No lock — that fires at the countdown transition. */
  private openGathering(): void {
    this.phase = 'gathering';
    this.countdownEndT = this.world.now + this.timings.joinWindowMs;
    this.applyPolicy();
  }

  /** Arm the countdown and LOCK the room — from waiting (joinWindowMs <= 0
   *  legacy path) or from a gathering window that just expired. The one place
   *  lock() ever fires. */
  private startCountdown(): void {
    this.phase = 'countdown';
    this.countdownEndT = this.world.now + this.timings.countdownMs;
    this.applyPolicy();
    this.hooks.lock();
  }

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
    // Drones ARE participants — they are combatants for the KILL FEED, the
    // contact stream and the operator telemetry (endSummary reads this Map, and
    // rosterSize/rosterByClass/killsByClass must count every hull). They are
    // NOT shown in the RESULTS: resultsMsg() filters them out and
    // computePlacements() places captains only (Eric ruling 2026-08-11).
    for (const s of this.world.ships.values()) {
      this.participants.set(s.id, {
        name: s.name,
        isDrone: s.isDrone,
        hullId: s.hullId,
        kills: 0,
        damageDealt: 0,
      });
    }
    this.applyPolicy();
  }

  private finish(aliveWinner: ShipRecord | undefined, trigger: WinTrigger): void {
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
        hullId: aliveWinner.hullId,
        kills: aliveWinner.kills,
        damageDealt: aliveWinner.damageDealt,
      });
    }
    // RULING: with 0 captains afloat (simultaneous mutual destruction — the last
    // two captains going down on the same tick, since any tick that leaves ONE
    // afloat now finishes on that captain, amendment 4) the winner is the
    // latest-sunk HUMAN — drones can never win, so we skip past them in the sink
    // order rather than taking its last entry blindly.
    this.winnerId = aliveWinner?.id ?? this.latestSunkHuman() ?? '';
    this.endedBy = this.classifyEnd(aliveWinner, trigger);
    this.computePlacements();
    this.phase = 'finished';
    this.finishedAt = this.world.now;
    this.applyPolicy(); // freeze the outcome: damage suppressed during results
    this.hooks.broadcastResults(this.resultsMsg());
  }

  /**
   * endedBy classification (amendment 53). A survivor means the field was
   * cleared regardless of what tripped the check — in a 2-human room one
   * departure leaves the other captain standing on an empty ocean, which is a
   * victory, not an abandonment. With NO human alive the trigger names the
   * cause: the last hull left the room, or the last hull went down.
   */
  private classifyEnd(aliveWinner: ShipRecord | undefined, trigger: WinTrigger): MatchEndCause {
    if (aliveWinner) return 'fieldCleared';
    return trigger === 'leave' ? 'lastHumanLeft' : 'lastHumanSunk';
  }

  // --- per-phase bookkeeping ---------------------------------------------------

  /** World combat policy per phase: the ready room is weapons-hot but harmless.
   *  Story 2.6 adds the XP policy on the same seam (amendment 34): passive XP
   *  accrues in the ACTIVE phase only — the ready room and the post-match
   *  freeze bank nothing. Kill credit is deliberately not policy-gated. */
  private applyPolicy(): void {
    const w = this.world;
    w.damageEnabled = this.phase === 'active';
    w.respawnEnabled = this.phase === 'waiting' || this.phase === 'gathering' || this.phase === 'countdown';
    w.xpEnabled = this.phase === 'active';
  }

  /** Record this tick's sink events (every participant) into the sink order. */
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
   * Post-step / post-leave win check — ONE predicate (isAfloatCaptain) over
   * lifecycle state, counting CAPTAINS ONLY. The match ends when at most one
   * captain is still afloat:
   *   - one afloat captain  → that captain won, however many drones remain,
   *   - zero afloat captains → mutual destruction; winner = latest-sunk human.
   *
   * DRONES NO LONGER GATE THE WIN (Eric ruling 2026-08-11, amendment 4:
   * *"Drones should stop gating the win, the game cant even fucking start
   * without two or more live players right now"*), partially superseding the
   * epic-4 amendment 31 defer. The old `aliveDroneCount() > 0` guard existed
   * because "≤1 human afloat" is already true at activation for a SOLO human +
   * fill drones, which would insta-finish. That hazard is confined to
   * configurations overriding CONFIG.match.minHumans (2) down to 1 — which only
   * dev tooling can do, since sanitizeRoomOptions gates matchOverride behind
   * HC_DEV_OPTIONS. Production can never start a live match with one captain,
   * so the guard bought nothing and cost a lone survivor a fight against hulls
   * that can never win.
   *
   * LEFT OPEN, RECORDED HERE: Story 6-5 (Solo vs AI) owes a termination rule
   * for a human-versus-drones match. Drones can never win (finish() skips past
   * them in the sink order) and a lone human can no longer lose to them by
   * attrition — with minHumans overridden to 1 such a match now finishes the
   * instant it activates, and Solo vs AI needs a real answer rather than this
   * one (amendment 4).
   */
  private checkWin(trigger: WinTrigger): void {
    const captains = this.afloatCaptains();
    if (captains.length > 1) return;
    this.finish(captains[0], trigger);
  }

  private maybeDisconnect(): void {
    if (this.disconnectFired || this.world.now < this.finishedAt + this.timings.resultsMs) return;
    this.disconnectFired = true;
    this.hooks.disconnect();
  }

  // --- results ----------------------------------------------------------------

  /**
   * PLACEMENT IS CAPTAIN-RELATIVE (Eric ruling 2026-08-11: *"just don't show
   * the drones in the match results. problem solved."* — supersedes amendment
   * 8's survivors tier). Winner = 1; then the sunk CAPTAINS by reverse sink
   * order (later sink places higher) — the ORIGINAL shipped rule, now
   * restricted to captains.
   *
   * WHY THE FILTER IS HERE AND NOT ONLY IN resultsMsg(): drones are excluded
   * from the results ROWS, so leaving them in the placement numbering would
   * render a 2-captain match as "1st" and "20th" — the table would still look
   * broken. Placing captains only is what makes the surviving filter honest.
   *
   * AMENDMENT 8's SURVIVOR TIER IS DELETED, not kept as defensive code: it is
   * UNREACHABLE once drones are excluded. checkWin() finishes only when at most
   * ONE captain is afloat, and finish() takes exactly that captain as the
   * winner — so every OTHER captain is not afloat at the finish, and every
   * non-afloat captain is in `sinkOrder` (world.sinkShip is the sole
   * `alive -> sunk` edge and always emits `sunk`, consumeSinks records it
   * BEFORE checkWin in the same update, a mid-match departure is recorded by
   * onPlayerLeave before its own check, and activate() redeploys every hull
   * alive so nobody enters the match already down).
   *
   * INVARIANT: every CAPTAIN participant gets a placement >= 1, so
   * `placement: 0` is unreachable for any results row. The two tiers partition
   * the captains: captain sinks ⊆ participants (recordSink's guard) and the
   * winner is a captain participant (finish() backfills a late-joining one).
   * Captain placements are the dense range 1..(captain count).
   *
   * Drones keep NO placement at all — `ArenaRoom.syncRoster()` mirrors 0 onto
   * their PlayerMeta.placement, which no client reads (the results table is
   * built from ResultsMsg rows, and the provisional number from the roster's
   * `alive` count).
   */
  private computePlacements(): void {
    this.placements.clear();
    let next = 1;
    if (this.winnerId) this.placements.set(this.winnerId, next++);
    for (let i = this.sinkOrder.length - 1; i >= 0; i--) {
      const id = this.sinkOrder[i];
      // Skip the mutual-destruction winner (already placed) and every drone —
      // drones are not combatants, so they hold no placement and get no row.
      if (this.placements.has(id) || this.participants.get(id)?.isDrone) continue;
      this.placements.set(id, next++);
    }
  }

  /**
   * The results rows are CAPTAINS ONLY (Eric ruling 2026-08-11). Drones are not
   * combatants — the same position the Public Register took for `sunk` and the
   * bounty throne took for `captainKills` — and the project docs have described
   * placement/results as humans-only since the AFLOAT ruling. Telemetry is
   * unaffected: endSummary() still counts every hull, drones included.
   */
  private resultsMsg(): ResultsMsg {
    const rows: ResultsRow[] = [];
    for (const [id, p] of this.participants) {
      if (p.isDrone) continue;
      rows.push({
        id,
        name: p.name,
        // UNREACHABLE by computePlacements()' partition invariant (every
        // captain participant is the winner or in the sink order). The fallback
        // sorts LAST rather than first so that if that invariant is ever
        // broken, an unplaced hull can never be seated above the winner again —
        // the exact shape of the defect this replaced.
        placement: this.placements.get(id) ?? this.participants.size + 1,
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
      rosterByClass[p.hullId] = (rosterByClass[p.hullId] ?? 0) + 1;
      killsByClass[p.hullId] = (killsByClass[p.hullId] ?? 0) + p.kills;
    }
    const finished = this.finishedAt > 0 && this.activatedAt > 0;
    const durationS = finished ? Math.round((this.finishedAt - this.activatedAt) / 100) / 10 : 0;
    return {
      rosterSize: this.participants.size,
      rosterByClass,
      durationS,
      winnerClass: this.participants.get(this.winnerId)?.hullId ?? null,
      killsByClass,
      stormDeaths: this.stormDeaths,
      endedBy: this.endedBy,
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

  /** Every captain still afloat — the ONLY collector over the win predicate. */
  private afloatCaptains(): ShipRecord[] {
    const out: ShipRecord[] = [];
    for (const s of this.world.ships.values()) if (isAfloatCaptain(s)) out.push(s);
    return out;
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
