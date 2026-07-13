import { Schema, MapSchema, type } from '@colyseus/schema';

/**
 * Public per-player roster entry. Carries no position data — the fogged
 * plane (per-client frame messages) owns everything spatial.
 */
export class PlayerMeta extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('boolean') alive = true;
  @type('uint16') kills = 0;
  @type('uint16') deaths = 0;
}

/**
 * The public plane synced to every client via Colyseus schema.
 * Deterministic mapgen: clients regenerate identical islands from mapSeed.
 */
export class ArenaState extends Schema {
  @type('uint32') mapSeed = 0;
  @type('float32') mapRadius = 0;
  @type({ map: PlayerMeta }) players = new MapSchema<PlayerMeta>();
}
