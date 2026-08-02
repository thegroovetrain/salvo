import { Schema, MapSchema, type } from '@colyseus/schema';
import { REGATTA_NO_HUE } from '@salvo/shared';

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
  /** hp dealt to other hulls this match (storm damage attributes to nobody). */
  @type('float32') damageDealt = 0;
  /** Final placement (1 = winner); 0 until determined at match end. */
  @type('uint8') placement = 0;
  /**
   * Regatta Hoist personal-hue index into the shared REGATTA_HUES wheel (0..19),
   * assigned FCFS at join (game/regatta.ts) so every screen agrees on who is who.
   * REGATTA_NO_HUE (255) is the sentinel — drones always, and any human before
   * assignment lands — rendering the drone greys everywhere, never a wheel hue.
   * The color index rides ONLY the roster schema, never a spatial frame.
   */
  @type('uint8') color = REGATTA_NO_HUE;
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
  // PHASED TIMELINE (Story 3.1, PV 18). The timing is deterministic: given
  // zoneStartT and CONFIG.zone (which every client already has from the
  // welcome), the phase rhythm reproduces at any instant. The GEOMETRY is not
  // client-derivable by design (amendment 10): ring centers roll on a
  // server-private stream, so the schema mirrors exactly the REVEALED prefix —
  // the current ring (ring g as of the last ring boundary) always, and the
  // next ring ONLY from its group's reveal beat through the end of the close
  // (ZEROED otherwise — unrevealed geometry never rides the wire). The client
  // derives its butter-smooth 60fps live ring by interpolating current→next
  // from zoneStartT + CONFIG via the SAME shared zoneLiveState() the server
  // runs — no forked math, never wrong by more than one tick at a boundary.
  // All fields are state-derived every step, so a late joiner / reconnecting
  // client gets the correct revealed prefix from the plain schema sync.

  /** 'idle' (pre-start) | 'clear' | 'supply' | 'reveal' | 'closing' | 'closed'. */
  @type('string') zoneState = 'idle';
  /** Server ms the zone timeline was anchored at (0 while idle). */
  @type('float64') zoneStartT = 0;
  /** Current ring center x (u) — ring g as of the last ring boundary. */
  @type('float32') zoneCurCx = 0;
  /** Current ring center y (u). */
  @type('float32') zoneCurCy = 0;
  /** Current ring radius (u); the full map radius while idle. */
  @type('float32') zoneCurR = 0;
  /** Revealed next-ring center x (u); 0 while unrevealed (see header). */
  @type('float32') zoneNextCx = 0;
  /** Revealed next-ring center y (u); 0 while unrevealed. */
  @type('float32') zoneNextCy = 0;
  /** Revealed next-ring radius (u); 0 while unrevealed (the reveal gate —
   *  a real ring's radius is always > 0, so r === 0 means "no reveal"). */
  @type('float32') zoneNextR = 0;

  // --- Match lifecycle (public plane — see server/src/game/match.ts) ---

  /** 'waiting' | 'countdown' | 'active' | 'finished' (MatchPhase). */
  @type('string') matchPhase = 'waiting';
  /** CURRENT-PHASE deadline (server ms): the gathering window's end during
   *  'gathering', the countdown's end during 'countdown', 0 otherwise —
   *  matchPhase disambiguates. The client derives its big center countdown
   *  from this via serverNow(). */
  @type('float64') countdownEndT = 0;
  /** Winner's session id once finished; '' until then. */
  @type('string') winnerId = '';
}
