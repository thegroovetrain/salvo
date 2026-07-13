import { Room, Client } from 'colyseus';
import { ArenaState, PlayerMeta } from './schema/ArenaState.js';

const SIM_HZ = 60;
const SIM_DT = 1000 / SIM_HZ;
const DEFAULT_MAP_RADIUS = 900;

interface JoinOptions {
  name?: string;
}

/**
 * Thin Colyseus adapter around the (future) plain-TS World simulation.
 * For the scaffold it just manages the roster schema and runs an empty tick.
 */
export class ArenaRoom extends Room<ArenaState> {
  maxClients = 20;
  autoDispose = true;

  private joinCounter = 0;

  onCreate(): void {
    this.state = new ArenaState();
    this.state.mapSeed = (Math.random() * 0xffffffff) >>> 0;
    this.state.mapRadius = DEFAULT_MAP_RADIUS;

    this.setSimulationInterval((dt) => this.tick(dt), SIM_DT);
  }

  onJoin(client: Client, options: JoinOptions = {}): void {
    this.joinCounter += 1;
    const meta = new PlayerMeta();
    meta.id = client.sessionId;
    meta.name = options.name?.trim() || `CAPTAIN-${this.joinCounter}`;
    this.state.players.set(client.sessionId, meta);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  private tick(_dt: number): void {
    // World.step() lands here in a later build-order step.
  }
}
