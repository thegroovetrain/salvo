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

  // --- Storm circle (public plane — the zone is charted; everyone sees it) ---
  //
  // The zone timeline is deterministic: given zoneStartT and CONFIG.zone (which
  // every client already has from the welcome), zoneRadiusAt(serverNow, ...)
  // reproduces the exact safe radius at any instant. RULING: the client DERIVES
  // its render radius from zoneStartT + CONFIG via serverNow() so the ring stays
  // butter-smooth at 60fps regardless of schema patch cadence, and treats the
  // live `zoneRadius` below only as a cross-check / fallback. The server still
  // animates zoneRadius every fixed step (patches ride the normal cadence) so a
  // client that trusts the schema directly is never wrong by more than one tick.

  /** 'idle' (pre-start) | 'grace' | 'shrinking' | 'closed'. */
  @type('string') zoneState = 'idle';
  /** Server ms the zone timeline was anchored at (0 while idle). */
  @type('float64') zoneStartT = 0;
  /** Live safe-zone radius (u), re-animated every fixed step. Derive-locally on
   *  the client for smoothness; this is the authoritative cross-check. */
  @type('float32') zoneRadius = 0;
}
