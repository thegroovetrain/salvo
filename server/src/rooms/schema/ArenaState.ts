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

  // --- THE SUPPLY-DROP CHART (Story 12.4, Eric 2026-11-19, epic-12 amendment
  // 5(f)/(g); the radio beacons' Story 10.8 seat, renamed) ---
  //
  // GLOBAL WORLD FACTS, PUBLIC BY RULING: every player's chart shows the
  // cycle's spots from charting until the crates land, then the mark fades
  // (*"I want their locations marked on the map before they drop"*). They are
  // NOT per-ship facts — a spot belongs to nobody — so they ride the public
  // plane like the zone rings, and nothing about one ever enters a frame (the
  // landed crates are ordinary airdrops, delivered by perception). FLAT
  // SCALARS on purpose: no third Schema class, no ArraySchema (the two-class
  // pin in colyseus018.test.ts stands).
  //
  // The client derives the landing time from these fields plus the zone clock
  // (`zoneStartT`) through the shared model (`supplyCycleStartMs`,
  // `supplyLandMs` in shared/src/sim/supplyDrops.ts). State-derived each step
  // from `World.supplyChart` (ArenaRoom.syncSupplyDrops), so a late joiner
  // reads the same set. The beacons' per-slot early sink time is gone.

  /** The ring cycle the charted set belongs to (its clock is
   *  `supplyCycleStartMs(zoneStartT, cycle)`); -1 = no spots. Explicit so a
   *  client can never pair one cycle's positions with another cycle's clock. */
  @type('int8') supplyCycle = -1;
  /** How many of the slots below are live (0..SUPPLY_WIRE_SLOTS). Slots at
   *  or past it hold STALE values and must be ignored. */
  @type('uint8') supplyCount = 0;
  // Slot N: the spot's position (u).
  @type('float32') sup0X = 0;
  @type('float32') sup1X = 0;
  @type('float32') sup2X = 0;
  @type('float32') sup3X = 0;
  @type('float32') sup4X = 0;
  @type('float32') sup5X = 0;
  @type('float32') sup6X = 0;
  @type('float32') sup7X = 0;
  @type('float32') sup0Y = 0;
  @type('float32') sup1Y = 0;
  @type('float32') sup2Y = 0;
  @type('float32') sup3Y = 0;
  @type('float32') sup4Y = 0;
  @type('float32') sup5Y = 0;
  @type('float32') sup6Y = 0;
  @type('float32') sup7Y = 0;
}
