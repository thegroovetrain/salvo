// Thin Colyseus adapter around the plain-TS World simulation. All game logic
// lives in game/ — this room only bridges: joins/leaves <-> roster schema,
// raw "i" messages -> World's input store, fixed steps -> per-client frames.

import { Room, Client } from 'colyseus';
import { CONFIG, MSG, type WelcomeMsg, type ZoneTimeline } from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const SIM_DT_MS = CONFIG.tick.simDtMs; // 50ms fixed step (20Hz)
const INTERVAL_MS = 1000 / 60; // setSimulationInterval cadence
const MAX_ACCUMULATED_MS = SIM_DT_MS * 5; // spiral-of-death cap

/** Ships present that trip the interim zone start (see onJoin). */
const INTERIM_ZONE_START_SHIPS = 2;

interface JoinOptions {
  name?: string;
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
}

export class ArenaRoom extends Room<ArenaState> {
  maxClients = CONFIG.map.playerCap;
  autoDispose = true;

  private world!: World;
  private accumulator = 0;
  private joinCounter = 0;

  onCreate(options: RoomOptions = {}): void {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // mapRadius(6) sizing per plan. zoneOverride (dev-only) fast-forwards the
    // storm timeline for smokes/tests; undefined => shipped CONFIG.zone.
    this.world = new World(seed, CONFIG.match.fillTo, options.zoneOverride ?? CONFIG.zone);

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;
    // Idle full map until the zone starts (see onJoin interim wiring).
    this.state.zoneRadius = this.world.map.radius;

    this.onMessage(MSG.input, (client: Client, raw: unknown) => {
      this.world.submitInput(client.sessionId, raw);
    });

    this.setSimulationInterval((dt) => this.update(dt), INTERVAL_MS);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    const name = options.name?.trim() || `CAPTAIN-${this.joinCounter}`;

    this.world.addShip(client.sessionId, name);

    // INTERIM WIRING (step 14 replaces this): the storm timeline has no match
    // lifecycle yet, so start it when the SECOND ship joins. This approximates
    // "match start" for two-tab testing; a single-tab dev session never trips
    // it, so solo play keeps the full map (zone stays idle). Step 14's
    // waiting->active transition will call world.startZone() instead.
    if (this.world.ships.size >= INTERIM_ZONE_START_SHIPS) this.world.startZone();

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
  }

  onLeave(client: Client): void {
    this.world.removeShip(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  /** Fixed-step accumulator: drain whole SIM_DTs, frame out after each step. */
  private update(dtMs: number): void {
    this.accumulator = Math.min(this.accumulator + dtMs, MAX_ACCUMULATED_MS);
    while (this.accumulator >= SIM_DT_MS) {
      this.accumulator -= SIM_DT_MS;
      this.world.step(SIM_DT_MS);
      this.afterStep();
    }
  }

  private afterStep(): void {
    this.syncRoster();
    this.syncZone();
    for (const client of this.clients) {
      client.send(MSG.frame, buildFrame(this.world, client.sessionId));
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

  /** Mirror sim liveness + combat tallies onto the public roster. */
  private syncRoster(): void {
    this.state.players.forEach((meta: PlayerMeta, id: string) => {
      const ship = this.world.ships.get(id);
      if (!ship) return;
      if (meta.alive !== ship.alive) meta.alive = ship.alive;
      if (meta.kills !== ship.kills) meta.kills = ship.kills;
      if (meta.deaths !== ship.deaths) meta.deaths = ship.deaths;
    });
  }
}
