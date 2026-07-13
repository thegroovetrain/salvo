// Thin Colyseus adapter around the plain-TS World simulation. All game logic
// lives in game/ — this room only bridges: joins/leaves <-> roster schema,
// raw "i" messages -> World's input store, fixed steps -> per-client frames.

import { Room, Client } from 'colyseus';
import { CONFIG, MSG, type WelcomeMsg } from '@salvo/shared';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';
import { World } from '../game/world.js';
import { buildFrame } from '../game/frames.js';

const SIM_DT_MS = CONFIG.tick.simDtMs; // 50ms fixed step (20Hz)
const INTERVAL_MS = 1000 / 60; // setSimulationInterval cadence
const MAX_ACCUMULATED_MS = SIM_DT_MS * 5; // spiral-of-death cap

interface JoinOptions {
  name?: string;
}

export class ArenaRoom extends Room<ArenaState> {
  maxClients = CONFIG.map.playerCap;
  autoDispose = true;

  private world!: World;
  private accumulator = 0;
  private joinCounter = 0;

  onCreate(): void {
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.world = new World(seed, CONFIG.match.fillTo); // mapRadius(6) sizing per plan

    this.state = new ArenaState();
    this.state.mapSeed = seed;
    this.state.mapRadius = this.world.map.radius;

    this.onMessage(MSG.input, (client: Client, raw: unknown) => {
      this.world.submitInput(client.sessionId, raw);
    });

    this.setSimulationInterval((dt) => this.update(dt), INTERVAL_MS);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    const name = options.name?.trim() || `CAPTAIN-${this.joinCounter}`;

    this.world.addShip(client.sessionId, name);

    const meta = new PlayerMeta();
    meta.id = client.sessionId;
    meta.name = name;
    this.state.players.set(client.sessionId, meta);

    const welcome: WelcomeMsg = {
      sessionId: client.sessionId,
      mapSeed: this.state.mapSeed,
      mapRadius: this.world.map.radius,
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
    for (const client of this.clients) {
      client.send(MSG.frame, buildFrame(this.world, client.sessionId));
    }
  }

  /** Mirror sim liveness onto the public roster (kills/deaths: combat step). */
  private syncRoster(): void {
    this.state.players.forEach((meta: PlayerMeta, id: string) => {
      const ship = this.world.ships.get(id);
      if (ship && meta.alive !== ship.alive) meta.alive = ship.alive;
    });
  }
}
