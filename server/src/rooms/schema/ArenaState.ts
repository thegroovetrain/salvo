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
  /** hp dealt to other hulls this match (storm damage attributes to nobody). */
  @type('float32') damageDealt = 0;
  /** Final placement (1 = winner); 0 until determined at match end. */
  @type('uint8') placement = 0;
  // (The Regatta `color` hue index is GONE — Story 10.4, R6: "the hue wheel is
  // removed EVERYWHERE"; own linework is cyan, every enemy red, client-side.)
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

  /** 'waiting' | 'gathering' | 'countdown' | 'active' | 'finished' (MatchPhase). */
  @type('string') matchPhase = 'waiting';
  /** CURRENT-PHASE deadline (server ms): the gathering window's end during
   *  'gathering', the countdown's end during 'countdown', 0 otherwise —
   *  matchPhase disambiguates. The client derives its big center countdown
   *  from this via serverNow(). */
  @type('float64') countdownEndT = 0;
  /** Winner's session id once finished; '' until then. */
  @type('string') winnerId = '';

  /**
   * THE BOUNTY (Story 4.6, Eric ruling 2026-08-10): the throne holder's
   * session id, '' while vacant. IDENTITY ONLY — never a position, class, hp,
   * hue, or kill count; the roster above already mirrors every player's kills
   * to every client, so this discloses nothing new (the Public Register's
   * reconciliation argument). Mirrored from World.bountyId each step
   * (ArenaRoom.syncBounty), which owns the strict-overtake rule.
   */
  @type('string') bountyId = '';

  /**
   * THE FOG FIELD'S COVERAGE CUT (Story 9.10; Eric 2026-10-15 — "no discs",
   * a rolling fractal-noise field): the noise threshold the shared field
   * (sim/fog.ts, built on both sides from the welcome's `fogSeed`) is
   * sliced at — density 0 below it, a soft edge, 1 well above. MATCH-WIDE
   * WEATHER like the zone rings: one float for everyone, mirrored from
   * `World.fogCut` by ArenaRoom.syncZoneGeometry on change only (the server
   * re-cuts it once per `CONFIG.fog.refreshMs`). `9` = `FOG_NO_CUT` (a value
   * no fbm reaches) = no fog — the pre-start water and the schema's default;
   * the server never writes Infinity. NEVER per-ship, NEVER spatial: a
   * client learns where fog is, never what it hides.
   */
  @type('float32') fogCut = 9;

  // --- THE RADIO BEACONS (Story 10.8, Eric 2026-11-06, epic-10 amendment 14) ---
  //
  // GLOBAL WORLD OBJECTS, PUBLIC BY RULING: every chart shows the cycle's
  // beacons at once (R2), and a beacon destroyed afloat fades early on every
  // chart (R9). They are NOT per-ship facts — a beacon belongs to nobody —
  // so they ride the public plane like the zone rings, and nothing about one
  // ever enters a frame. FLAT SCALARS on purpose: no third Schema class, no
  // ArraySchema (the two-class pin in colyseus018.test.ts stands).
  //
  // The client derives everything else — charted / afloat / sinking / gone,
  // the rate, the body — from these fields plus the zone clock (`zoneStartT`)
  // through the SAME shared model the server pays by
  // (shared/src/sim/beacons.ts). A beacon's hp, pot and damage ledger never
  // leave the server. State-derived each step from `World.beaconChart`
  // (ArenaRoom.syncBeacons), so a late joiner reads the same set.

  /** The ring cycle the charted set belongs to (its clock is
   *  `beaconCycleStartMs(zoneStartT, cycle)`); -1 = no beacons. Explicit so a
   *  client can never pair one cycle's positions with another cycle's clock. */
  @type('int8') beaconCycle = -1;
  /** How many of the slots below are live (0..8). Slots at or past it hold
   *  STALE values and must be ignored. */
  @type('uint8') beaconCount = 0;
  // Slot N: position (u) and the EARLY sink time (server ms; 0 = the natural
  // schedule — set only when the beacon was destroyed afloat, R6).
  @type('float32') bcn0X = 0;
  @type('float32') bcn1X = 0;
  @type('float32') bcn2X = 0;
  @type('float32') bcn3X = 0;
  @type('float32') bcn4X = 0;
  @type('float32') bcn5X = 0;
  @type('float32') bcn6X = 0;
  @type('float32') bcn7X = 0;
  @type('float32') bcn0Y = 0;
  @type('float32') bcn1Y = 0;
  @type('float32') bcn2Y = 0;
  @type('float32') bcn3Y = 0;
  @type('float32') bcn4Y = 0;
  @type('float32') bcn5Y = 0;
  @type('float32') bcn6Y = 0;
  @type('float32') bcn7Y = 0;
  @type('float64') bcn0SinkT = 0;
  @type('float64') bcn1SinkT = 0;
  @type('float64') bcn2SinkT = 0;
  @type('float64') bcn3SinkT = 0;
  @type('float64') bcn4SinkT = 0;
  @type('float64') bcn5SinkT = 0;
  @type('float64') bcn6SinkT = 0;
  @type('float64') bcn7SinkT = 0;
}
