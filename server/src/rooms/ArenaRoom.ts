// Thin Colyseus adapter around the plain-TS World simulation + Match state
// machine. All game logic lives in game/ — this room only bridges: joins/
// leaves <-> roster schema + match roster notifications, raw "i" messages ->
// World's input store, fixed steps -> match update + per-client frames, and
// implements the Match side-effect hooks (lock/unlock/broadcast/disconnect).

import { Room, Client } from 'colyseus';
import { CONFIG, MSG, type ResultsMsg, type WelcomeMsg, type ZoneTimeline } from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';
import { Match, defaultTimings, type MatchHooks, type MatchTimings } from '../game/match.js';

const SIM_DT_MS = CONFIG.tick.simDtMs; // 50ms fixed step (20Hz)
const INTERVAL_MS = 1000 / 60; // setSimulationInterval cadence
const MAX_ACCUMULATED_MS = SIM_DT_MS * 5; // spiral-of-death cap

interface JoinOptions {
  name?: string;
}

/**
 * DEV TOOL for smokes/tests only — matchmaking / the real client NEVER set it.
 * `countdownMs`/`resultsMs` shrink the lifecycle timers so a full match loop is
 * observable in seconds. `sandbox: true` disables the match lifecycle entirely
 * (no Match constructed): the World keeps its permissive defaults (damage on,
 * respawn on, mines on), frames stay fogged for everyone, and the storm starts
 * when the 2nd ship joins — the pre-step-14 behavior the older standalone
 * smoke scripts (combat/fog/weapons/zone) were written against.
 */
interface MatchOverride {
  countdownMs?: number;
  resultsMs?: number;
  sandbox?: boolean;
}

/**
 * Room-create options. `zoneOverride` is a DEV TOOL for smokes/tests only — it
 * fast-forwards the storm timeline so a shrink is observable in seconds.
 * Matchmaking / the real client NEVER set it (the client derives its ring from
 * CONFIG.zone, so an override desyncs the client's derived radius — acceptable
 * because the only clients that pass it are headless smoke scripts).
 */
interface RoomOptions extends JoinOptions {
  zoneOverride?: ZoneTimeline;
  matchOverride?: MatchOverride;
}

export class ArenaRoom extends Room<ArenaState> {
  maxClients = CONFIG.map.playerCap;
  autoDispose = true;

  private world!: World;
  /** Null only in sandbox mode (dev smokes) — see MatchOverride. */
  private match: Match | null = null;
  private accumulator = 0;
  private joinCounter = 0;

  onCreate(options: RoomOptions = {}): void {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // mapRadius(6) sizing per plan. zoneOverride (dev-only) fast-forwards the
    // storm timeline for smokes/tests; undefined => shipped CONFIG.zone.
    this.world = new World(seed, CONFIG.match.fillTo, options.zoneOverride ?? CONFIG.zone);

    if (!options.matchOverride?.sandbox) {
      this.match = new Match(this.world, this.timings(options.matchOverride), this.matchHooks());
    }

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;
    // Idle full map until the match activates and anchors the storm timeline.
    this.state.zoneRadius = this.world.map.radius;

    this.onMessage(MSG.input, (client: Client, raw: unknown) => {
      this.world.submitInput(client.sessionId, raw);
    });

    this.setSimulationInterval((dt) => this.update(dt), INTERVAL_MS);
  }

  private timings(override: MatchOverride | undefined): MatchTimings {
    const base = defaultTimings();
    return {
      countdownMs: override?.countdownMs ?? base.countdownMs,
      resultsMs: override?.resultsMs ?? base.resultsMs,
    };
  }

  /** The Match state machine's side effects, implemented on the room. */
  private matchHooks(): MatchHooks {
    return {
      lock: () => void this.lock(),
      unlock: () => void this.unlock(),
      // STEP 15 STUB: the drone-fill seam. DroneController lands here — until
      // then matches run with however many humans are aboard. Loud on purpose.
      fillToCapacity: () =>
        console.warn('[match] fillToCapacity(): STEP 15 STUB — no drones filled'),
      broadcastResults: (msg: ResultsMsg) => this.broadcast(MSG.results, msg),
      disconnect: () => void this.disconnect(),
    };
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    const name = options.name?.trim() || `CAPTAIN-${this.joinCounter}`;

    this.world.addShip(client.sessionId, name);

    // Sandbox mode only (dev smokes): pre-lifecycle interim behavior — the
    // storm starts when the 2nd ship joins. The real lifecycle anchors the
    // zone at the countdown->active transition instead (game/match.ts).
    if (!this.match && this.world.ships.size >= 2) this.world.startZone();

    const meta = new PlayerMeta();
    meta.id = client.sessionId;
    meta.name = name;
    this.state.players.set(client.sessionId, meta);

    const welcome: WelcomeMsg = {
      sessionId: client.sessionId,
      mapSeed: this.state.mapSeed,
      mapRadius: this.world.map.radius,
      playerCap: this.world.playerCap,
      t: this.world.now,
      config: CONFIG,
    };
    client.send(MSG.welcome, welcome);

    this.match?.notifyRosterChanged();
  }

  onLeave(client: Client): void {
    // Match owns ship removal so a mid-match departure is recorded for
    // placement (sunk-at-leave-time) before the win check runs.
    if (this.match) this.match.onPlayerLeave(client.sessionId);
    else this.world.removeShip(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  /** Fixed-step accumulator: drain whole SIM_DTs, frame out after each step. */
  private update(dtMs: number): void {
    this.accumulator = Math.min(this.accumulator + dtMs, MAX_ACCUMULATED_MS);
    while (this.accumulator >= SIM_DT_MS) {
      this.accumulator -= SIM_DT_MS;
      this.world.step(SIM_DT_MS);
      this.match?.update();
      this.afterStep();
    }
  }

  private afterStep(): void {
    this.syncRoster();
    this.syncZone();
    this.syncMatch();
    const phase = this.match?.phase ?? 'waiting';
    for (const client of this.clients) {
      client.send(MSG.frame, buildFrame(this.world, client.sessionId, phase));
    }
  }

  /**
   * Mirror the live zone onto the public schema. zoneRadius is animated every
   * step (its patch rides the normal cadence); state/startT change rarely.
   * Clients derive the smooth ring locally from zoneStartT + CONFIG.
   */
  private syncZone(): void {
    const phase = this.world.zonePhase;
    if (this.state.zoneState !== phase) this.state.zoneState = phase;
    const startT = this.world.zoneStartMs;
    if (this.state.zoneStartT !== startT) this.state.zoneStartT = startT;
    this.state.zoneRadius = this.world.zoneRadius;
  }

  /** Mirror the match lifecycle onto the public schema. */
  private syncMatch(): void {
    if (!this.match) return;
    if (this.state.matchPhase !== this.match.phase) this.state.matchPhase = this.match.phase;
    if (this.state.countdownEndT !== this.match.countdownEndT) {
      this.state.countdownEndT = this.match.countdownEndT;
    }
    if (this.state.winnerId !== this.match.winnerId) this.state.winnerId = this.match.winnerId;
  }

  /** Mirror sim liveness + combat tallies onto the public roster. */
  private syncRoster(): void {
    this.state.players.forEach((meta: PlayerMeta, id: string) => {
      const ship = this.world.ships.get(id);
      if (!ship) return;
      if (meta.alive !== ship.alive) meta.alive = ship.alive;
      if (meta.kills !== ship.kills) meta.kills = ship.kills;
      if (meta.deaths !== ship.deaths) meta.deaths = ship.deaths;
      if (meta.damageDealt !== ship.damageDealt) meta.damageDealt = ship.damageDealt;
      const placement = this.match?.placements.get(id) ?? 0;
      if (meta.placement !== placement) meta.placement = placement;
    });
  }
}
