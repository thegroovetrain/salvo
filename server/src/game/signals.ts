// The SIGNAL REGISTRY — one declarative home per spatial signal (Story 1.1).
// Every channel that can put per-observer spatial knowledge into a frame is a
// row here: the 16 GameEvent kinds plus the four contact-like frame channels
// (`contact`, `mine`, `litzone`, and `decoy` — pseudo event types: not
// GameEvents, but the invariant suite iterates them like everything else).
// perception.ts's observe()/observeSpectator() are the ONLY callers of a row's
// visible()/materialize()/counterIntel(); nothing spatial leaves the server
// outside a row.
//
// THE LOS RULE (one rule for everything): a point is line-of-sight-clear from
// the observer iff the segment observer→point crosses no island COASTLINE
// (islandBlocksSegment — bounding-circle broadphase, `core` early-out, then
// the exact polygon test). Sight, radar, shells, booms, spawns, and sinks all
// use it. ALL island-geometry branching stays inside losClear: no visible()/
// materialize() row may iterate polygon edges itself, or the 14 rows blow the
// ESLint complexity ceiling.
//
// Rows see a NARROW SignalContext (the ActivationContext pattern from
// equipment/index.ts) — the observer's ship record, tick time, islands for LOS,
// and the ships map for victim/wreck lookups — never a Colyseus type. The
// `mode` discriminator lets one row serve both the fogged observe() path and
// the unfogged observeSpectator() path; fogged rows never relax fog.
//
// KEY INSERTION ORDER IS LOAD-BEARING: frames go out via msgpack, and JSON/
// msgpack key order follows object insertion order. Every materialize() below
// builds its wire object in the exact historical field order (Contact:
// id,x,y,heading,speed,cls; BallisticEvent: k,id,x,y,vx,vy,t; stripped boom:
// k,id,x,y; MineView: id,x,y,own,by; LitZoneView: id,x,y,r,until,by,mode;
// DecoyView: id,x,y,until,own,by; SplashEvent/HitCallEvent: k,id,x,y;
// MuzzleEvent: k,x,y — Story 4.3; SmokeEvent: k,x,y,tier — Story 4.4;
// FoghornEvent: k,h then self? (honker) / x,y (spectator) / b,v (fogged
// listener) — Story 4.5; SunkEvent: k,id,by?,seen? — the public
// register, absent keys OMITTED). Do not reorder keys — `by` (Story 1.12) is
// appended LAST on mine/decoy, `mode` (Story 2.9) after it on litzone, so the
// historical prefix stays byte-stable.

import {
  CONFIG,
  bearing,
  hullSilhouette,
  islandBlocksSegment,
  perpendicularExtent,
  transformPolygon,
  wrapAngle,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type BoomEvent,
  type BurstEvent,
  type Contact,
  type DamageEvent,
  type DecoyView,
  type FoghornEvent,
  type GameEvent,
  type HealEvent,
  type HitCallEvent,
  type HullId,
  type Island,
  type LitZoneView,
  type MineView,
  type MuzzleEvent,
  type BoonFitEvent,
  type PointEvent,
  type RadarGrammar,
  type RadarIdentity,
  type ShellState,
  type SmokeEvent,
  type SpawnEvent,
  type SplashEvent,
  type SunkEvent,
  type TorpedoUpdateEvent,
  type Vec2,
} from '@salvo/shared';
import type { Decoy, LitZone, ShipRecord } from './world.js';
import type { MineState } from './equipment/index.js';

// ---------------------------------------------------------------------------
// The narrow per-observer context rows receive (imitates equipment's
// ActivationContext).
// ---------------------------------------------------------------------------

interface SignalContextBase {
  /** The observing client's id (== its ship id whenever it has a ship). */
  observerId: string;
  /** Server time this tick (ms) — stamped on blips and ballistic reveals. */
  now: number;
  /** Island landmasses for the one LOS rule (bounding circle + coastline). */
  islands: readonly Island[];
  /** Ship records by id — victim/wreck lookups (boom stripping, sunk gating). */
  ships: ReadonlyMap<string, ShipRecord>;
  /** All ACTIVE star-shell lit zones (Story 1.7) — the owned-zone truesight
   *  source (ownZoneCovers) and the litzone row's scan subjects. */
  litZones: ReadonlyMap<string, LitZone>;
  /** All LIVE decoy buoys (Story 1.8) — the decoy row's scan subjects AND the
   *  blip row's counterIntel subjects (the radar-double deception). */
  decoys: ReadonlyMap<string, Decoy>;
  /** Which blip wire shape this room emits (the radar realism cycle, amendment
   *  63) — the blipShape branch key. The GATE never reads it: only the wire
   *  SHAPE branches on grammar, never who can see what. */
  radarGrammar: RadarGrammar;
  /** Which id namespace blips carry (amendment 63): 'roster' = the painted
   *  ship's real id (today's behavior), 'pseudonym' = pseudonymOf(shipId). */
  radarIdentity: RadarIdentity;
  /** Ship id → stable per-match track id (World.pseudonymFor — the server-
   *  private stream; see World.trackIds for the honest correlation bound).
   *  Consulted by blipShape ONLY in pseudonym mode. */
  pseudonymOf(shipId: string): string;
}

/** The fogged observe() path: rows apply full fog-of-war. observe() fail-closes
 *  before any row runs when the observer has no ship, so `me` is always set. */
export interface FoggedSignalContext extends SignalContextBase {
  mode: 'fogged';
  me: ShipRecord;
}

/** The unfogged observeSpectator() path (dead-in-active or finished phase —
 *  gated by frames.ts, never here). `me` is the spectator's ship record when
 *  one still exists (it carries the ballistic reveal memory); a client with no
 *  record gets no ballistic reveals (fail-closed). */
export interface SpectatorSignalContext extends SignalContextBase {
  mode: 'spectator';
  me: ShipRecord | undefined;
}

export type SignalContext = FoggedSignalContext | SpectatorSignalContext;

// ---------------------------------------------------------------------------
// SignalSpec — one registry row.
// ---------------------------------------------------------------------------

/**
 * One spatial signal, declaratively: may THIS observer perceive the subject,
 * and what exact wire shape does it receive. `S` is the row's subject (a
 * world-emitted GameEvent for forwarded kinds; a live ShipRecord / ShellState /
 * MineState / Decoy for the scan-driven channels); `O` is the materialized
 * wire shape. materialize() is only ever called after visible() passes. `CI`
 * is the counterIntel subject type — the DECEIVING entity a row fabricates a
 * signal FROM (default S; the blip row lies from a Decoy).
 */
export interface SignalSpec<S = unknown, O = unknown, CI = S> {
  /** Registry key: a GameEvent `k`, or a pseudo-type for a non-event frame
   *  channel (`contact` / `mine` / `litzone` / `decoy`). */
  readonly eventType: string;
  /** The fog-of-war predicate — the anti-cheat gate for this signal. */
  visible(ctx: SignalContext, subject: S): boolean;
  /** Wire-shape the subject for this observer. KEY ORDER IS LOAD-BEARING. */
  materialize(ctx: SignalContext, subject: S): O;
  /**
   * COUNTER-INTEL (first implementation: the blip row, Story 1.8): a row may
   * fabricate plausible-but-FALSE signals from a deceiving entity — emitted
   * through the row's OWN gate and wire shaper so a lie is field-for-field and
   * timing-indistinguishable from the truth (FR10). Returns the wire shape to
   * emit, or null when the deception does not fire for this observer this
   * tick. perception.ts is the only caller (the decoy scan).
   */
  counterIntel?(ctx: SignalContext, subject: CI): O | null;
}

// ---------------------------------------------------------------------------
// Shared predicates (the vision math every row builds on).
// ---------------------------------------------------------------------------

/**
 * True iff the segment a→b crosses no island coastline (the one LOS rule).
 *
 * THE ANTI-CHEAT CHOKEPOINT: this must stay EXACT — an approximation that
 * over-blocks hides a contact the observer has earned, one that under-blocks
 * leaks a contact behind land. `islandBlocksSegment` is exact (its bounding-
 * circle broadphase and `core` early-out only skip work in cases whose answer
 * is already decided), and it is the ONLY island-geometry branching on this
 * path — every visible()/materialize() row delegates here rather than
 * iterating polygon edges, which is what keeps those 14 rows under ESLint
 * complexity 10.
 */
export function losClear(a: Vec2, b: Vec2, islands: readonly Island[]): boolean {
  for (const isle of islands) {
    if (islandBlocksSegment(a, b, isle)) return false;
  }
  return true;
}

/**
 * The observer's EFFECTIVE sight radius this tick (Story 2.8, DAZZLE BURST):
 * stats.sightRange, scaled by CONFIG.starShells.dazzleSightFactor while the
 * observer is DAZZLED (world.applyZoneEffects refreshes dazzledUntil every
 * tick the observer's center sits in a non-owned dazzle zone; the victim's
 * own wire field OwnShip.dazzledUntil reads the same mark, so the server's
 * shrunken sight and the client's honest fog hole agree). THE one place the
 * dazzle factor enters perception — every sight-tier predicate below calls
 * this, so a NON-dazzled observer's numbers are bit-identical to pre-2.8.
 */
function sightOf(me: ShipRecord, now: number): number {
  return now < me.dazzledUntil
    ? me.stats.sightRange * CONFIG.starShells.dazzleSightFactor
    : me.stats.sightRange;
}

/** Sight-tier test for a point: within the OBSERVER'S effective sight range
 *  (inclusive, dazzle-scaled — sightOf) + LOS-clear. Takes the ShipRecord so
 *  the sightRange boons apply to every point-sighted gate (ballistics, mines,
 *  booms, wrecks, spawns) uniformly. */
function pointSighted(me: ShipRecord, p: Vec2, islands: readonly Island[], now: number): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const sight = sightOf(me, now);
  return dx * dx + dy * dy <= sight * sight && losClear(me.state, p, islands);
}

/**
 * DETECT-tier test for a point (Story 4.9, amendments 119/121): the 3/8 rung —
 * within `sightOf(me, now) * CONFIG.vision.detectFactor` (inclusive) +
 * LOS-clear. pointSighted's SIBLING, never a narrowing of it: exactly THREE
 * rows ride this gate — mines (mineSignal), torpedoes (ballisticSignal's
 * `torp` branch), and homing-torpedo updates (torpedoUpdateSignal). Everything
 * else pointSighted serves — shells, decoys, booms, bursts, sunk-witness,
 * spawns — stays on truesight, byte-identical (SHELLS DO NOT MOVE: a shell is
 * in the air; a torpedo is a wake just under the surface and a mine sits in
 * the water). Observer-scaled exactly as sight is (amendment 121): a
 * star-shell dazzle halves it, an intelTruesight boon widens it, and island
 * LOS applies unchanged — sensor upgrades buy REACH here like everywhere
 * else optical.
 */
function pointDetected(me: ShipRecord, p: Vec2, islands: readonly Island[], now: number): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const detect = sightOf(me, now) * CONFIG.vision.detectFactor;
  return dx * dx + dy * dy <= detect * detect && losClear(me.state, p, islands);
}

/**
 * True iff a lit zone OWNED by this observer covers point `p` (Story 1.7):
 * dist(p, zone center) ≤ zone radius, boundary INCLUSIVE. "Lit from above" —
 * deliberately NO island-LOS term on any zone path (an island between the
 * observer and a lit point never blocks the reveal; the flare hangs over the
 * water). FIRER-ONLY by construction: only zones whose ownerId is the
 * observer count, so a non-owner NEVER gains contacts/mines/ballistics from
 * someone else's zone. Feeds the contact/mine/ballistic rows as an OR beside
 * their sight gates.
 */
export function ownZoneCovers(ctx: SignalContext, p: Vec2): boolean {
  const me = ctx.me;
  if (!me) return false;
  for (const zone of ctx.litZones.values()) {
    if (zone.ownerId !== me.id) continue;
    const dx = p.x - zone.x;
    const dy = p.y - zone.y;
    if (dx * dx + dy * dy <= zone.r * zone.r) return true;
  }
  return false;
}

/**
 * True iff the observer's beam crossed `brg` this tick: the half-open window
 * [prevSweepAngle, sweepAngle), wrap-safe. Start-inclusive + strict `<` at the
 * end means each bearing is painted exactly once per revolution.
 */
function sweptThisTick(me: ShipRecord, brg: number): boolean {
  const window = wrapPositive(me.sweepAngle - me.prevSweepAngle);
  return wrapPositive(brg - me.prevSweepAngle) < window;
}

/** Radar-annulus test for a POINT: beyond sight (exclusive), within radar
 *  (inclusive) — both the OBSERVER'S effective ranges (the sight boundary is
 *  the SAME dazzle-scaled sightOf every sight predicate uses, so "sight wins
 *  inside its radius" stays coherent for a dazzled observer: the shrunk band
 *  becomes paintable annulus, never a dead ring). Sight wins inside its
 *  radius (a LOS-blocked ship inside sight is simply invisible — it is not in
 *  the annulus, so it cannot paint). Point-based so the decoy counterIntel
 *  (Story 1.8) runs the IDENTICAL test on a buoy position. */
function inRadarAnnulus(me: ShipRecord, p: Vec2, now: number): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const d2 = dx * dx + dy * dy;
  const sight = sightOf(me, now);
  const radar2 = me.stats.radarRange * me.stats.radarRange;
  return d2 > sight * sight && d2 <= radar2;
}

/**
 * THE ship-blip gate (one function, two callers — FR10's temporal
 * indistinguishability by construction): sight < dist ≤ radar (the annulus) ∧
 * the observer's beam crossed the point's bearing this tick ∧ island-LOS
 * clear. The genuine ship scan and the decoy counterIntel both call THIS, so a
 * buoy paints exactly when a ship at that position would — same tick, same
 * boundaries, same LOS shadowing. Do not fork it.
 */
function blipGate(me: ShipRecord, p: Vec2, islands: readonly Island[], now: number): boolean {
  return inRadarAnnulus(me, p, now) && sweptThisTick(me, bearing(me.state, p)) && losClear(me.state, p, islands);
}

/** Scratch polygon for the `ext` computation (transformPolygon's `out` reuse —
 *  allocation-light; consumed synchronously inside blipShape, never retained). */
const EXT_SCRATCH: Vec2[] = [];

/**
 * The `return`-grammar echo extent (amendment 66, R2): the hull silhouette's
 * total extent projected PERPENDICULAR to the observer→target bearing, in
 * world units. Posed at the ORIGIN (extent is translation-invariant) with the
 * paint's heading only. ANTI-CHEAT BOUND (absolute): `ext` derives from hull
 * geometry + relative bearing ONLY — never boons, hp, damage state, or any
 * range-derivable flight quantity. There is deliberately NO range term
 * server-side: range attenuation is client render math (R2), computed from
 * the paint position the observer already holds.
 */
function echoExtent(me: ShipRecord, p: Vec2, cls: HullId, heading: number): number {
  return perpendicularExtent(transformPolygon(hullSilhouette(cls), 0, 0, heading, EXT_SCRATCH), bearing(me.state, p));
}

/** THE blip wire shaper (one function, two callers — FR10's wire
 *  indistinguishability by construction), branched per the room's radar modes
 *  (the radar realism cycle, amendments 62-68 — ONLY the wire shape branches;
 *  blipGate is untouched). KEY ORDER IS LOAD-BEARING: silhouette grammar
 *  emits k,id,x,y,t,cls,heading,speed (Story 4.2 — the class-legible pose
 *  APPENDED after `t`); return grammar emits k,id,x,y,t,ext (the one aspect
 *  scalar appended after the same byte-stable {k,id,x,y,t} prefix). In
 *  pseudonym identity mode `id` is the ship's stable per-match track id
 *  (ctx.pseudonymOf) — a genuine paint resolves the SHIP's id, the decoy
 *  counterIntel resolves the OWNER's, so the buoy paints under exactly the id
 *  the owner's own hull would (the Story 1.8 indistinguishability law,
 *  preserved under both flags). A genuine paint passes the ship's id/position
 *  and LIVE pose; the decoy counterIntel passes the OWNER'S ship id with the
 *  buoy's position and its FROZEN drop-time cls/heading at speed 0 (a radar
 *  reflector reports true stationary values — see the Decoy record's
 *  anti-cheat note) — byte-for-byte the same shape either way. */
function blipShape(
  ctx: SignalContext,
  me: ShipRecord,
  shipId: string,
  p: Vec2,
  cls: HullId,
  heading: number,
  speed: number,
): BlipEvent {
  const id = ctx.radarIdentity === 'pseudonym' ? ctx.pseudonymOf(shipId) : shipId;
  if (ctx.radarGrammar === 'return') {
    return { k: 'blip', id, x: p.x, y: p.y, t: ctx.now, ext: echoExtent(me, p, cls, heading) };
  }
  return { k: 'blip', id, x: p.x, y: p.y, t: ctx.now, cls, heading, speed };
}

// ---------------------------------------------------------------------------
// Contact-like channels (pseudo event types — synced state, not GameEvents).
// ---------------------------------------------------------------------------

/**
 * `contact` — true-sight tier: another live hull within the observer's
 * effective sight range (boundary INCLUSIVE) + LOS-clear, OR the hull's
 * CENTER inside a lit zone the observer OWNS (Story 1.7 — firer-only
 * truesight parity, "lit from above": no LOS term on the zone path). Live
 * position/heading/speed straight from the sim. Spectators (unfogged) see
 * every alive hull — including, in the finished phase, their own.
 */
const contactSignal: SignalSpec<ShipRecord, Contact> = {
  eventType: 'contact',
  visible(ctx, ship) {
    if (!ship.alive) return false;
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    if (ship.id === me.id) return false;
    const dx = ship.state.x - me.state.x;
    const dy = ship.state.y - me.state.y;
    const sight = sightOf(me, ctx.now); // dazzle-scaled (Story 2.8) — the observer's own reduction
    return (
      (dx * dx + dy * dy <= sight * sight && losClear(me.state, ship.state, ctx.islands)) ||
      ownZoneCovers(ctx, ship.state)
    );
  },
  materialize(_ctx, ship) {
    const s = ship.state;
    // `cls` is the full HullId — drone contacts carry droneSmall/Medium/Large.
    return { id: ship.id, x: s.x, y: s.y, heading: s.heading, speed: s.speed, cls: ship.hullId };
  },
};

/**
 * `mine` — contact-like state (NOT events), recomputed every tick exactly like
 * contacts. The owner sees ALL its own mines always (own field awareness, even
 * under fog); everyone else sees a mine only when it is within DETECT range
 * (Story 4.9: the 3/8 rung, pointDetected — a mine sits low in the water, so
 * it reveals closer than a hull does) + island-LOS — OR inside a lit zone the
 * observer OWNS (Story 1.7 truesight parity, no LOS on the zone path). Mines
 * NEVER radar-paint, and arm state makes no difference to visibility. A
 * static persistent entity synced this way cannot suffer event-lifecycle
 * staleness (a triggered/despawned mine simply drops out of the next frame's
 * list). Spectators see every mine.
 */
const mineSignal: SignalSpec<MineState, MineView> = {
  eventType: 'mine',
  visible(ctx, mine) {
    if (ctx.mode === 'spectator') return true;
    return (
      mine.ownerId === ctx.me.id ||
      pointDetected(ctx.me, mine, ctx.islands, ctx.now) ||
      ownZoneCovers(ctx, mine)
    );
  },
  materialize(ctx, mine) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,own,by. `by` (Story 1.12) is
    // the dropper's ship id — roster-resolved to the dropper's personal hue for
    // every observer (a deliberate intel grant, Eric 2026-07-23), appended LAST.
    return { id: mine.id, x: mine.x, y: mine.y, own: mine.ownerId === ctx.observerId, by: mine.ownerId };
  },
};

/**
 * `litzone` — contact-like state (NOT events), recomputed every tick exactly
 * like mines (Story 1.7). The OWNER (firer) always sees its own zones; any
 * other fogged observer sees a zone iff its CENTER is within the observer's
 * effective radar range — deliberately NO island LOS and NO sweep gate (a
 * 10s flare in the sky, not a hull paint; zone-CENTER distance, not
 * circle-edge, keeps the rule one comparison). Invisible beyond radar range.
 * Spectators see all. ONLY the circle rides this row — the firer's truesight
 * parity inside it flows through the contact/mine/ballistic rows
 * (ownZoneCovers), never here. `by` is the firer's ship id
 * (roster-resolvable — the 1.12 personal-hue hook).
 */
const litZoneSignal: SignalSpec<LitZone, LitZoneView> = {
  eventType: 'litzone',
  visible(ctx, zone) {
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    if (zone.ownerId === me.id) return true;
    const dx = zone.x - me.state.x;
    const dy = zone.y - me.state.y;
    const radar = me.stats.radarRange;
    return dx * dx + dy * dy <= radar * radar; // no LOS, no sweep gate
  },
  materialize(_ctx, zone) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,r,until,by,mode. `mode`
    // (Story 2.9, amendment 50) is the zone's doctrine — stamped on the
    // record at zone-spawn time and delivered to EVERY observer who sees the
    // circle (counterplay over concealment), appended LAST.
    return { id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId, mode: zone.mode };
  },
};

/**
 * `decoy` — contact-like state (NOT events), recomputed every tick exactly
 * like mines (Story 1.8). This channel carries THE TRUTH — the buoy for what
 * it is (DecoyView) — never the deception (that is the blip row's counterIntel
 * above). The OWNER always sees its own buoy (own-equipment awareness, the
 * mines precedent); any other fogged observer sees it only when TRUESIGHT
 * reaches it: within sight + island-LOS (pointSighted), or inside a lit zone
 * the observer OWNS (Story 1.7 parity, no LOS on the zone path) — sight
 * reveals the lie. Decoys NEVER appear as contacts and never radar-paint
 * truthfully (radar range only ever produces the counterIntel blip).
 * Spectators see every buoy.
 */
const decoySignal: SignalSpec<Decoy, DecoyView> = {
  eventType: 'decoy',
  visible(ctx, decoy) {
    if (ctx.mode === 'spectator') return true;
    return (
      decoy.ownerId === ctx.me.id ||
      pointSighted(ctx.me, decoy, ctx.islands, ctx.now) ||
      ownZoneCovers(ctx, decoy)
    );
  },
  materialize(ctx, decoy) {
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,until,own,by. `id` is the
    // DECOY's own id — the owner's ship id rides the counterIntel blip AND, as of
    // Story 1.12, the trailing `by` here (roster-resolved to the owner's personal
    // hue for every observer of the TRUTH marker; the deceiving blip is unchanged).
    // `own` mirrors mineSignal (ctx.observerId): true iff the receiver owns the
    // buoy. Spectators (observerId ≠ ownerId) read own=false. `by` appended LAST.
    return { id: decoy.id, x: decoy.x, y: decoy.y, until: decoy.until, own: decoy.ownerId === ctx.observerId, by: decoy.ownerId };
  },
};

// ---------------------------------------------------------------------------
// Perception-generated event channels (scan-driven, never forwarded raw).
// ---------------------------------------------------------------------------

/**
 * `blip` — the radar tier: sight < dist ≤ radar (both boundaries as written)
 * ∧ LOS-clear ∧ the observer's beam crossed the target's bearing this tick
 * (the half-open window [prev, cur) — wrap-safe, each bearing painted exactly
 * once per revolution). Paints carry position-at-paint-time; the server keeps
 * no blip history (phosphor decay is client render math). ONLY SHIPS PAINT —
 * torpedoes and mines never appear on radar (the ship scan iterates ships
 * only, by construction). A ship inside a lit zone the observer OWNS never
 * blips: it is already a FULL contact (Story 1.7), and the row stays
 * self-contained rather than leaning on the scan's contact-first ordering.
 * Spectators get live contacts instead, never blips.
 *
 * COUNTER-INTEL (Story 1.8, FR10): the row also implements the registry's
 * counterIntel seam for DECOY BUOYS — the first lying signal. For a fogged
 * NON-OWNER observer, a live buoy emits a blip through the EXACT ship-blip
 * gate (blipGate — same annulus, same swept-this-tick window, same island
 * LOS) and the EXACT wire shaper (blipShape), carrying the OWNER's ship id at
 * the BUOY's position: on the wire and in time it is indistinguishable from
 * the owner's own hull painting there. It NEVER lies to its owner, never
 * fires unfogged (spectators see the truth via the decoy row), and — zone
 * parity with the ship rule — never doubles a buoy the observer's own lit
 * zone already truesights (the decoys channel carries the truth there).
 */
const blipSignal: SignalSpec<ShipRecord, BlipEvent, Decoy> = {
  eventType: 'blip',
  visible(ctx, target) {
    // Blips are perception-generated, never world-emitted: a world-dispatched
    // 'blip' event (not a live ShipRecord) fails this shape guard — fail-closed.
    if (!('state' in target)) return false;
    if (ctx.mode !== 'fogged') return false;
    const me = ctx.me;
    if (!target.alive || target.id === me.id) return false;
    if (ownZoneCovers(ctx, target.state)) return false; // already a full contact — never doubled as a blip
    return blipGate(me, target.state, ctx.islands, ctx.now);
  },
  materialize(ctx, target) {
    // Live pose (Story 4.2, FR14): hull id, heading, and the raw signed speed
    // scalar at paint time — never a derived cap or boost flag (build leak).
    // The blip row only ever materializes fogged (visible() requires it), so
    // ctx.me is always set; the non-null assertion mirrors that gate.
    return blipShape(ctx, ctx.me!, target.id, target.state, target.hullId, target.state.heading, target.state.speed);
  },
  counterIntel(ctx, decoy) {
    // Spectators are unfogged — they get the truth (the decoy row), never a lie.
    if (ctx.mode !== 'fogged') return null;
    const me = ctx.me;
    // The buoy never lies to its owner ("shows up as YOU" — to OTHERS).
    if (decoy.ownerId === me.id) return null;
    // Zone parity with the ship rule above: an observer whose OWN lit zone
    // covers the buoy already truesights it (the decoys channel) — never
    // doubled as a blip, exactly like a zone-covered ship.
    if (ownZoneCovers(ctx, decoy)) return null;
    // CONTACT-COEXISTENCE GUARD (FR10): never lie about an owner the observer
    // can currently SEE. A genuine ship can never be a contact AND a blip in
    // the same frame (the annulus excludes sight; zone-covered ships are
    // blip-excluded), so contact('a') + blip('a') coexisting would be a wire
    // tell that unmasks the buoy. The gate reuses the contact row's EXACT
    // visibility predicate on the OWNER's hull — never a hand-rolled variant —
    // and the deception is worthless in that state anyway (the observer has
    // the real hull in truesight).
    const owner = ctx.ships.get(decoy.ownerId);
    if (owner !== undefined && contactSignal.visible(ctx, owner)) return null;
    if (!blipGate(me, decoy, ctx.islands, ctx.now)) return null;
    // The lie: the genuine blip shape with the OWNER's ship id at the buoy's
    // position. `t` = ctx.now, like every real paint. The pose is the buoy's
    // FROZEN drop-time snapshot at speed 0 (Story 4.2, amendment 11) — TRUE
    // stationary values, never a live ctx.ships.get(ownerId) kinematics read
    // (the buoy outlives its owner by up to 30s and must keep painting; a live
    // read would also leak the fogged owner's course/speed at a false
    // position). Unmasking the lie is BEHAVIORAL — it never moves — not a
    // payload difference. In pseudonym mode blipShape resolves the OWNER's
    // pseudonym from ownerId, so the lie rides exactly the track id the
    // owner's own hull paints under; in return grammar it carries the
    // owner-hull extent at the frozen drop heading — indistinguishable under
    // every flag combination.
    return blipShape(ctx, me, decoy.ownerId, decoy, decoy.hullId, decoy.heading, 0);
  },
};

/**
 * `shell` / `torp` — per-observer ballistic reveal, exactly once
 * (ShipRecord.seenBallistics). The OWNER always gets it at launch. Everyone
 * else gets it when the projectile FIRST becomes visible (within sight + LOS),
 * with CURRENT pos/velocity ONLY — never a range-derivable field (no ttl /
 * distLeft). The client dead-reckons from there, so a shell fired outside your
 * bubble materializes at your sight boundary, never at its (hidden) launch
 * point; and a constant-free wire shape cannot be solved back to the muzzle
 * (see BallisticEvent's anti-cheat note). Spectators skip the sight gate but
 * keep the exactly-once reveal memory: a projectile launched BEFORE the
 * observer died (and never sighted) still materializes with current params,
 * and this-tick launches are not double-sent. A spectator with no ship record
 * has no reveal memory — fail-closed, no reveals.
 *
 * Two registry rows (two wire kinds), one shared implementation — with ONE
 * deliberate fork (Story 4.9, amendments 119/121): the GATE branches on kind.
 * A shell first reveals at the truesight boundary (pointSighted — SHELLS DO
 * NOT MOVE: a shell is in the air); a torpedo first reveals at the DETECT
 * boundary (pointDetected, the 3/8 rung — a wake just under the surface).
 * Everything else — the owner-always path, the owned-zone OR, the
 * exactly-once seenBallistics memory, the wire shape — is identical for both.
 */
function ballisticSignal(kind: 'shell' | 'torp'): SignalSpec<ShellState, BallisticEvent> {
  return {
    eventType: kind,
    visible(ctx, shell) {
      // Only a LIVE projectile record may reveal. A world-emitted 'shell'/'torp'
      // event reaching this row via tickEvents dispatch (no ownerId on the wire
      // shape) is dropped — reveals are re-issued per observer by the scan.
      if (!('ownerId' in shell) || shell.kind !== kind) return false;
      const me = ctx.me;
      if (!me || me.seenBallistics.has(shell.id)) return false;
      if (ctx.mode === 'spectator') return true;
      // First-sight (shell) / first-detect (torp) OR inside an OWNED lit zone
      // (Story 1.7 truesight parity): the exactly-once seenBallistics
      // machinery is untouched — a zone reveal marks the id like any other,
      // so the projectile is never re-sent.
      return (
        shell.ownerId === me.id ||
        (kind === 'torp'
          ? pointDetected(me, shell, ctx.islands, ctx.now)
          : pointSighted(me, shell, ctx.islands, ctx.now)) ||
        ownZoneCovers(ctx, shell)
      );
    },
    materialize(ctx, shell) {
      // PURE wire-shaper — no mutation. Marking the projectile seen (the
      // exactly-once semantics) is the SCAN's job: perception.ballisticScan
      // marks each revealed id immediately after pushing this shape. A mutating
      // materialize on a publicly importable registry would let Story 1.8's
      // counter-intel wiring accidentally consume reveals just by shaping one.
      // `t` is REVEAL time (ctx.now), never the projectile's bornAt.
      return { k: shell.kind, id: shell.id, x: shell.x, y: shell.y, vx: shell.vx, vy: shell.vy, t: ctx.now };
    },
  };
}

/** deg → rad for the torpU emission threshold (CONFIG authors it in degrees). */
const TORP_UPDATE_THRESHOLD_RAD = (CONFIG.torpedo.homingUpdateAngleDeg * Math.PI) / 180;

/** Has this torpedo's velocity direction drifted ≥ the torpU threshold from
 *  what `me` last received for the track? False when the observer holds no
 *  baseline (never revealed — updates only ever follow a reveal). */
function homingTrackDrifted(me: ShipRecord, shell: ShellState): boolean {
  const last = me.torpDirs.get(shell.id);
  if (last === undefined || !me.seenBallistics.has(shell.id)) return false;
  return Math.abs(wrapAngle(Math.atan2(shell.vy, shell.vx) - last)) >= TORP_UPDATE_THRESHOLD_RAD;
}

/**
 * `torpU` — a STEERING (ACOUSTIC HOMING) torpedo's ballistic update (Story
 * 2.8): the enemy client dead-reckons a torpedo from its reveal velocity, so a
 * fish whose velocity DIRECTION has drifted ≥ CONFIG.torpedo.
 * homingUpdateAngleDeg from what THIS observer last received re-emits current
 * pos + velocity — same constant-free shape rule as the reveal ({k,id,x,y,vx,
 * vy,t}: no range-derivable field may EVER be added). Emitted ONLY to an
 * observer for whom the track is ALREADY revealed (seenBallistics — the
 * exactly-once convention relaxes to allow UPDATES keyed by the same id, for
 * this row alone) AND who can currently see it via the torpedo reveal
 * predicate (owner / DETECT+LOS — Story 4.9's pointDetected, matching the
 * `torp` reveal gate so corrections stop exactly where first reveal starts /
 * owned lit zone; spectators skip the gate, mirroring the reveal row). NOT
 * self-private: torpU is an OBSERVED-projectile event, gated like the
 * reveals. The per-observer direction baseline lives in ShipRecord.torpDirs
 * (set at reveal, advanced by perception's scan after each emission —
 * materialize stays a pure shaper).
 */
const torpedoUpdateSignal: SignalSpec<ShellState, TorpedoUpdateEvent> = {
  eventType: 'torpU',
  visible(ctx, shell) {
    // Only a LIVE homing torpedo record may update. A fabricated world-emitted
    // 'torpU' event reaching this row via tickEvents dispatch (no ownerId /
    // homing on the wire shape) is dropped — fail-closed.
    if (!('ownerId' in shell) || shell.kind !== 'torp' || shell.homing === undefined) return false;
    const me = ctx.me;
    if (!me || !homingTrackDrifted(me, shell)) return false;
    if (ctx.mode === 'spectator') return true;
    return (
      shell.ownerId === me.id ||
      pointDetected(me, shell, ctx.islands, ctx.now) ||
      ownZoneCovers(ctx, shell)
    );
  },
  materialize(ctx, shell) {
    // KEY ORDER IS LOAD-BEARING (k,id,x,y,vx,vy,t) — the BallisticEvent order.
    // `t` is UPDATE time (ctx.now).
    return { k: 'torpU', id: shell.id, x: shell.x, y: shell.y, vx: shell.vx, vy: shell.vy, t: ctx.now };
  },
};

// ---------------------------------------------------------------------------
// World-event forwarding channels (subject = the world-emitted GameEvent).
// ---------------------------------------------------------------------------

/**
 * `boom` — visible iff the boom location is within sight + LOS, inside a lit
 * zone the observer OWNS (Story 1.7 truesight parity — everything a firer's
 * zone reveals can also visibly explode), OR the boom struck the observer
 * (`hit === me`). The shell's owner does NOT get an out-of-sight boom on THIS
 * row — but the original rationale ("hit confirmation beyond sight would leak
 * contact presence") is SUPERSEDED for the owner-hit case by Story 4.3,
 * amendment 17: out-of-sight hit confirmation is now the deliberate,
 * narrowly-scoped job of the SELF-PRIVATE Hit Call row (`hc`, hitCallSignal
 * below) — position only, never a victim id or severity — because the
 * ratified decoy disambiguation oracle depends on it. Bystanders and victims
 * keep today's boom rules exactly; the owner's dead-reckoned shell still just
 * expires by client lifetime on this row. Even when the boom IS visible, its
 * `hit` (victim id) is stripped unless the victim's CENTER is itself sighted
 * or zone-covered (or the observer IS the victim): a hull can straddle the
 * sight edge with its center in fog, and emitting the id there would leak the
 * victim's identity. A hit-less boom just plays a generic impact/splash on
 * the client. Spectators get the raw event.
 */
const boomSignal: SignalSpec<BoomEvent, BoomEvent> = {
  eventType: 'boom',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.hit === ctx.me.id || pointSighted(ctx.me, e, ctx.islands, ctx.now) || ownZoneCovers(ctx, e);
  },
  materialize(ctx, e) {
    if (ctx.mode === 'spectator') return e;
    const me = ctx.me;
    if (!e.hit || e.hit === me.id) return e;
    const victim = ctx.ships.get(e.hit);
    if (victim && (pointSighted(me, victim.state, ctx.islands, ctx.now) || ownZoneCovers(ctx, victim.state))) {
      return e;
    }
    return { k: 'boom', id: e.id, x: e.x, y: e.y }; // impact visible, victim id stripped
  },
};

/**
 * Server-INTERNAL burst subject: the wire BurstEvent plus the firing shell's
 * ownerId, carried only inside World.tickEvents for the owner-visibility rule
 * below. `own` NEVER reaches the wire — materialize() always rebuilds the
 * bare {k,id,x,y} shape, on BOTH the fogged and spectator paths.
 */
export interface BurstSubject extends BurstEvent {
  own: string;
}

/**
 * `burst` — a gun shell detonating at its target point. Visible to the shell
 * OWNER (the burst centers on the point they clicked, so it reveals nothing
 * they didn't author — unlike boom, whose owner-suppression rule guards
 * against hit-confirmation leaks), to anyone with the burst point sighted
 * (sight + LOS, the boom pattern), or with the point inside a lit zone the
 * observer OWNS (Story 1.7). Damage never rides here — burst victims
 * get their own victim-private dmg events; burstRadius is CONFIG, never on
 * the wire.
 *
 * ABSENCE-INFERENCE CHANNEL (accepted by design): the owner ALWAYS sees their
 * own burst, so the ABSENCE of a burst after a shot leaks one bit — "something
 * intercepted the shell short of the target." This is deliberately tolerated
 * because it is subsumed by radar: islands stop shells, so an island-shadowed
 * hull can never be probed this way, and any LOS-clear hull inside gun range
 * (gun range = radar range) is painted by the radar sweep within one ~4s
 * revolution regardless. The owner learns nothing the sweep would not reveal.
 */
const burstSignal: SignalSpec<BurstSubject, BurstEvent> = {
  eventType: 'burst',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.own === ctx.me.id || pointSighted(ctx.me, e, ctx.islands, ctx.now) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object — never `e` verbatim, which would leak the
    // server-internal `own` field (spectator path included).
    return { k: 'burst', id: e.id, x: e.x, y: e.y };
  },
};

/**
 * The observer legitimately WITNESSED the wreck — today's historical sunk
 * gate, extracted verbatim: spectator, the observer's own hull, or the wreck
 * position sighted (sight + LOS) / inside a lit zone the observer OWNS
 * (Story 1.7 truesight parity, so a firer watches a zone-revealed hull
 * actually go down). Fail-closed on a missing wreck record. This predicate is
 * BOTH a visibility clause and the per-observer `seen` stamp (materialize
 * below), so today's gate keeps its exact meaning and simply becomes a flag
 * instead of a filter.
 */
function sunkWitnessed(ctx: SignalContext, e: SunkEvent): boolean {
  if (ctx.mode === 'spectator' || e.id === ctx.me.id) return true;
  const wreck = ctx.ships.get(e.id);
  if (wreck === undefined) return false;
  return pointSighted(ctx.me, wreck.state, ctx.islands, ctx.now) || ownZoneCovers(ctx, wreck.state);
}

/**
 * The sinking is CREDITED TO this observer — your kill, at any range and
 * through any fog (the amendment 17 principle, terminal case: "your target
 * went down" is the end of the same shooter-only conversation the Hit Call
 * opened). THE single site the future "or a teammate's kill" extension
 * changes — nothing else may re-derive kill credit.
 */
function sunkCreditedTo(ctx: SignalContext, e: SunkEvent): boolean {
  return e.by !== undefined && e.by === ctx.me?.id;
}

/**
 * `sunk` — THE PUBLIC REGISTER (global kill feed): the 4th DECLARED exception
 * to the master perception invariant (joining Story 4.3's `sp`/`hc`/`mz`),
 * with its own independently-reimplemented oracle in perception.test.ts.
 * Three clauses, three separate reasons:
 *   • WITNESSED (sunkWitnessed — today's rule, unchanged): spectator, own
 *     hull, or wreck position sighted / owned-zone-covered;
 *   • CREDITED TO YOU (sunkCreditedTo — the amendment 17 shooter-only
 *     principle): you learn that anything you sank went down, drone included;
 *   • THE VICTIM IS A COMBATANT (`!wreck.isDrone`): every human captain's
 *     sinking reaches every client. This is the single site a future
 *     PvE/combat-bot distinction changes.
 * ANTI-LEAK RATIONALE for the public clause: the payload is IDENTITY ONLY
 * ({k,id,by?} — no position, class, hue, damage, or weapon field), and
 * ArenaRoom.syncRoster() already makes the FACT of every sinking public —
 * alive/kills/deaths mirror to every client. What this row adds beyond the
 * schema is precision, and that is the honest scope of the ratification: the
 * event is a SAME-TICK channel (frame events send synchronously each tick;
 * schema patches ride Colyseus's patch-rate timer), and it PAIRS killer to
 * victim explicitly via `by` — two same-tick kills by different killers
 * aggregate in the counters as (+1, +1) and cannot be paired back from
 * deltas. So the public clause makes ATTRIBUTION explicit and same-tick;
 * it does not merely restate the schema. Drone sinkings are NOT public
 * (drones are not contestants — a
 * drone kill is a fraction of a level via CONFIG.xp.droneTierLevels where a
 * captain is a full one); they arrive only witnessed or credited.
 * materialize() stamps the per-observer `seen: true` exactly when
 * sunkWitnessed holds — the client gates everything SPATIAL (sink VFX,
 * contact teardown) on it, so location stays as protected as it is today.
 */
const sunkSignal: SignalSpec<SunkEvent, SunkEvent> = {
  eventType: 'sunk',
  visible(ctx, e) {
    if (sunkWitnessed(ctx, e) || sunkCreditedTo(ctx, e)) return true;
    const wreck = ctx.ships.get(e.id);
    return wreck !== undefined && !wreck.isDrone; // the public register: combatants only
  },
  materialize(ctx, e) {
    // ALWAYS a fresh object (the burstSignal discipline): KEY ORDER IS
    // LOAD-BEARING (msgpack): k,id,by?,seen? — and NEVER a key whose value is
    // undefined (msgpack encodes it; world-emitted storm deaths carry
    // `by: undefined`, which must leave the wire as an ABSENT key).
    const out: SunkEvent = { k: 'sunk', id: e.id };
    if (e.by !== undefined) out.by = e.by;
    if (sunkWitnessed(ctx, e)) out.seen = true; // per-observer; spectators always carry it
    return out;
  },
};

/**
 * `spawn` — visible to the spawner itself, and to anyone who can see the spawn
 * point (sight + LOS, or inside a lit zone the observer OWNS — Story 1.7).
 * Spectators get the raw event.
 */
const spawnSignal: SignalSpec<SpawnEvent, SpawnEvent> = {
  eventType: 'spawn',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    return e.id === ctx.me.id || pointSighted(ctx.me, e, ctx.islands, ctx.now) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    return e;
  },
};

/**
 * SELF-PRIVATE kinds: forwarded ONLY to the ship the event names — dmg
 * (victim), pt (earner), bn (the boon a spend FITTED — Story 2.7), heal (the
 * DAMAGE CONTROL spend — Eric rulings 2026-08-04). Enemy hp, builds, boons,
 * level banks, and repairs all stay hidden by this one gate (levels / boon ids
 * ride ONLY on OwnShip, never on contacts/blips/booms). (The 'upg' row died
 * with the legacy upgrade economy — Story 2.8's wholesale strip.)
 *
 * `spectatorPublic`: dmg alone passes through unfiltered to spectators (they
 * may watch a fight's hp — a dead player has no channel back into the match).
 * pt/bn/heal stay self-private even in UNFOGGED spectator frames: a
 * dead-in-active captain still gets its own level/fit toasts (spending while
 * dead is legal), but no other spectator may learn a living ship's fitted
 * boon, level bank, or that it just repaired. (The 'heal' row LEFT with the
 * REPAIR spend — Story 2.1, Eric ruling 2026-07-24 — and RETURNED with the
 * DAMAGE CONTROL strip, 2026-08-04, on strictly tighter terms: no hp amount,
 * no total, no victim id, nothing derivable about another ship.)
 */
function selfPrivateSignal<E extends DamageEvent | PointEvent | BoonFitEvent | HealEvent>(
  kind: E['k'],
  spectatorPublic: boolean,
): SignalSpec<E, E> {
  return {
    eventType: kind,
    visible(ctx, e) {
      if (ctx.mode === 'spectator' && spectatorPublic) return true;
      return e.id === ctx.observerId;
    },
    materialize(_ctx, e) {
      return e;
    },
  };
}

/**
 * SHOOTER-PRIVATE kinds (Story 4.3) — the selfPrivateSignal idiom applied to
 * the gunnery events `sp`/`hc`, whose `id` names the SHOOTER rather than a
 * victim/earner. A separate factory (not a widening of selfPrivateSignal's
 * union) so the dmg/pt/bn gate keeps its exact historical type. Both rows are
 * spectator-public, exactly like `dmg` (a dead player may watch the gunnery
 * conversation; there is no channel back into the match).
 */
function shooterPrivateSignal<E extends SplashEvent | HitCallEvent>(kind: E['k']): SignalSpec<E, E> {
  return {
    eventType: kind,
    visible(ctx, e) {
      if (ctx.mode === 'spectator') return true; // spectator-public, the dmg precedent
      return e.id === ctx.observerId;
    },
    materialize(_ctx, e) {
      return e; // world-emitted key order (k,id,x,y) forwarded verbatim
    },
  };
}

/**
 * `sp` — FALL OF SHOT (Story 4.3, amendment 16): the shooter's own shell
 * terminated without resolving any victim; a splash at the true impact point,
 * for the shooter ALONE, at any range and through any fog. A DECLARED
 * exception to the master perception invariant: it references a point outside
 * the observer's sight ∪ paints, justified because the point is one the
 * shooter authored (their own click / their own shell's flight) — the burst
 * row's owner rationale, extended to misses. Self-private + spectator-public:
 * exactly the `dmg` row's shape. GUN-FAMILY ONLY at the emission site (wire
 * kind 'shell'): torpedoes and mines never produce one (World.emitSplash).
 */
const fallOfShotSignal = shooterPrivateSignal<SplashEvent>('sp');

/**
 * `hc` — HIT CALL (Story 4.3, amendments 17/18): something the shooter fired
 * or laid CONNECTED — position only, never a victim id or any severity
 * channel. A DECLARED exception to the master perception invariant AND a
 * knowing supersession of the boom row's owner anti-leak rule for the
 * owner-hit case ONLY (see the boom row's amended comment): leaking
 * "something of yours connected out there" to its owner is now the intended
 * feature — it is what keeps the ratified decoy disambiguation oracle alive.
 * Self-private + spectator-public: exactly the `dmg` row's shape. ALL
 * ORDNANCE at the emission sites: gun, cannon, star shells, torpedo, mines.
 */
const hitCallSignal = shooterPrivateSignal<HitCallEvent>('hc');

/**
 * `mz` — MUZZLE FLASH (Story 4.3, amendments 15/19/20): a gun-family weapon
 * fired at this point. A DECLARED exception to the master perception
 * invariant with its own NEW spatial rule: visible iff
 * dist(observer, flash) ≤ CONFIG.vision.muzzleFlash (the DERIVED SIGHT * 1.5
 * halo — the CONSTANT, deliberately NOT the observer's dazzle-scaled
 * sightOf: a flash is a light source, not an illuminated object, so dazzle
 * does not change how far it carries, and intel boons do not widen it) ∧
 * island LOS clear (the standing 2026-08-02 ruling: islands block EVERY
 * sensor at ALL ranges). Deliberately NO ownZoneCovers term — a star-shell
 * zone does not help you see a flash you are too far away from. materialize
 * returns the bare {k,x,y} for EVERY observer — shooter and spectators
 * included; there is no privileged view of this row and no identity of any
 * kind on it (amendment 19: the flash must create a question, not answer
 * one).
 */
const muzzleFlashSignal: SignalSpec<MuzzleEvent, MuzzleEvent> = {
  eventType: 'mz',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    const dx = e.x - me.state.x;
    const dy = e.y - me.state.y;
    const halo = CONFIG.vision.muzzleFlash;
    return dx * dx + dy * dy <= halo * halo && losClear(me.state, e, ctx.islands);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object (the burst-row discipline): the wire shape is
    // {k,x,y} for every observer — no id can ever ride along by accident.
    return { k: 'mz', x: e.x, y: e.y };
  },
};

/**
 * `sm` — WOUNDED SMOKE (Story 4.4, amendments 40-50): a hull below a damage
 * band is smoking at this point, this hard. The FIFTH declared exception to
 * the master perception invariant (after 4.3's sp/hc/mz and PV 23's public
 * sunk register), with its own independently-reimplemented oracle in
 * perception.test.ts. Visible iff dist(observer, puff) ≤
 * CONFIG.vision.muzzleFlash — the mz row's CONSTANT halo reused verbatim
 * (amendment 42: no fourth vision constant), deliberately NOT the observer's
 * dazzle-scaled sightOf and NOT the boon-widened stats.sightRange: smoke
 * reach must be identical for every observer, or the plume would carry
 * per-observer build/state information — ∧ island LOS clear (amendment 44:
 * islands block EVERY sensor at ALL ranges). Deliberately NO ownZoneCovers
 * term, exactly like mz: a star-shell zone does not help you see a plume you
 * are too far away from. materialize returns a fresh bare {k,x,y,tier} for
 * EVERY observer — the smoking ship's own captain (amendment 46: own smoke
 * rides this row with no special case) and spectators included; no ship id,
 * hue, class, hp, or fraction may ever ride it (amendment 45: no correlation
 * handle of any kind exists on this row, so per-source capping is impossible
 * by construction).
 */
const woundedSmokeSignal: SignalSpec<SmokeEvent, SmokeEvent> = {
  eventType: 'sm',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    const me = ctx.me;
    const dx = e.x - me.state.x;
    const dy = e.y - me.state.y;
    const halo = CONFIG.vision.muzzleFlash;
    return dx * dx + dy * dy <= halo * halo && losClear(me.state, e, ctx.islands);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object (the mz/burst-row discipline): the wire shape
    // is {k,x,y,tier} for every observer — no id can ever ride along by
    // accident, and no observer gets a privileged view.
    return { k: 'sm', x: e.x, y: e.y, tier: e.tier };
  },
};

/** The world-emitted foghorn SUBJECT (Story 4.5): World.consumeHonk always
 *  stamps the honker's true position and id onto the internal event —
 *  server-private inputs the row consumes and NEVER forwards (see the row). */
type FoghornSubject = FoghornEvent & { x: number; y: number; id: string };

/** The eight-band wire domain (Story 4.9 — FoghornEvent.v). */
type FoghornBand = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * The fogged listener's VOLUME BAND for a honk, or null = inaudible (Story
 * 4.9, amendment 122 — supersedes amendment 53's three tiers) — THE one band
 * resolver: visible() and materialize() both call this, so the gate and the
 * wire can never drift. The band is which EIGHTH of the LISTENER'S own INTEL
 * RANGE (`stats.radarRange` — boon-widened, NEVER dazzle-scaled) the honker
 * sits in: `band = ceil(8 × d / intelRange)`, d == 0 resolving to band 1,
 * boundaries inclusive (at base stats band 4 ends exactly at truesight 330u —
 * full volume — and band 8 at the 660u radar edge, 50%; gain is a CLIENT-side
 * lookup, never on the wire). Beyond band 8: inaudible, no event at all.
 *
 * Amendment 53's max() clamps are RETIRED, their purpose satisfied
 * STRUCTURALLY: they existed because muzzleFlash was flat while sightOf is
 * dazzle-scaled, so the old tier bounds were not monotone by construction.
 * Anchoring every band on intel range — which dazzle never touches — makes
 * "dazzle cannot deafen" true BY CONSTRUCTION; there is nothing left to
 * clamp. The knowing trade: hearing now widens with `intelRadar` rather than
 * `intelTruesight`.
 *
 * ISLANDS MUFFLE, NEVER BLOCK (amendment 54, preserved in meaning — still
 * the one partial carve-out of the 2026-08-02 "islands block every sensor"
 * law): after the distance band resolves, a failed losClear() demotes ONCE to
 * `max(5, band + 2)` — two bands is the width of one old tier, so the
 * boundaries reproduce the old behavior (a honk at the truesight edge blocked
 * by rock lands at 75%; bands 7-8 lose the honk entirely), and the floor of 5
 * keeps "a rock ALWAYS costs the honker reach" true inside the 100% plateau.
 * Exactly ONE losClear call and ONE set of bounds; the demotion is applied
 * once, post-resolution, never via a second threshold set.
 *
 * THE PLATEAU FLOOR — `Math.max(…, 4)` ON THE EMITTED VALUE (review fix,
 * anti-cheat). Bands 1-4 are INDISTINGUISHABLE in every honest surface: gain is
 * 1.0 for all four (CLIENT_CONFIG.foghorn.bandGain) and the chevron weight is
 * the identical {22, 3, 0.95} for all four (…chevron.bands). Sending WHICH of
 * bands 1-4 a honker sits in would hand a MODIFIED client two extra bits of
 * range resolution — an 82.5u annulus rather than the 330u plateau, and worst
 * for a DAZZLED or intelRadar-boosted listener who can receive a low band for a
 * hull they cannot see — with NO honest consumer at all. That is precisely the
 * disclosure amendment 51 bounds (BEARING AND VOLUME TIER ONLY, no position, no
 * correlation handle). So the wire carries the band floor-clamped to the
 * COARSEST value that reproduces the ratified gain curve EXACTLY: honest client
 * output is byte-identical (same gain, same chevron weight) and only the
 * cheat-readable surplus is gone. The clamp is applied to the EMITTED value,
 * AFTER the muffle resolves, so it is a no-op on the muffle path by
 * construction (`max(5, band + 2)` is already ≥ 5) — muffled reach is
 * unchanged, and a raw band-1 honk behind a rock still lands at 5, not 6.
 *
 * FAIL CLOSED ON A DEGENERATE INTEL RANGE (review fix). `ceil(8 × d /
 * radarRange)` is only a band for a POSITIVE FINITE radarRange and a finite d;
 * a zero/negative/NaN/Infinite one yields Infinity, a negative, NaN or 0, and
 * `NaN > 8` is FALSE — so a lone upper-bound check would let a non-band reach
 * the wire, where the client's tables have no entry for it. The explicit domain
 * test below runs on the RAW band, BEFORE the plateau floor, so a garbage value
 * can never be laundered into a legal 4. Unreachable from an honest server
 * today; that is exactly why it must return null rather than throw.
 */
function hornBandFor(me: ShipRecord, subject: FoghornSubject, islands: readonly Island[]): FoghornBand | null {
  const d = Math.hypot(subject.x - me.state.x, subject.y - me.state.y);
  const band = d === 0 ? 1 : Math.ceil((8 * d) / me.stats.radarRange);
  if (!Number.isInteger(band) || band < 1 || band > 8) return null;
  const emitted = losClear(me.state, subject, islands)
    ? band
    : Math.max(5, band + 2); // one step, applied once (amendment 54)
  if (emitted > 8) return null;
  return Math.max(emitted, 4) as FoghornBand; // the plateau floor — a no-op past band 4
}

/**
 * `fh` — THE FOGHORN (Story 4.5, amendments 51-58): a captain chose to sound
 * their horn. The SIXTH declared exception to the master perception
 * invariant (after 4.3's sp/hc/mz, PV 23's public sunk register, and 4.4's
 * sm), with its own independently-reimplemented oracle in perception.test.ts.
 * Three observer shapes, each a FRESH object literal (the mz discipline —
 * materialize NEVER forwards or spreads the subject, so the server-private
 * x/y/id can never ride along by accident):
 *   honker    → {k,h,self:true} — their own horn back, no distance/LOS test,
 *               checked FIRST in both gates (before any spectator or me math);
 *   spectator → {k,h,x,y} — the omniscient path (the client aims the chevron
 *               from its own camera); short-circuits BEFORE any ctx.me read,
 *               since a record-less spectator has me === undefined;
 *   fogged    → {k,h,b,v} — bearing (wrapPositive [0, 2π)) + volume BAND
 *               (1..8, Story 4.9) from hornBandFor above. NO x, NO y, NO ship
 *               id, and no correlation handle of any kind (amendment 45's
 *               rule verbatim): a honk is a bearing the honker chose to give
 *               away, and nothing more.
 * `h` is the horn variant — the row's ONLY identity-adjacent field, a knowing
 * narrow break with mz/sm's neutral-signal rule (amendment 52: a distinctive
 * purchased horn being recognizable at 660u is the point of buying one).
 */
const foghornSignal: SignalSpec<FoghornSubject, FoghornEvent> = {
  eventType: 'fh',
  visible(ctx, e) {
    if (e.id === ctx.observerId) return true; // the honker always hears their own horn
    if (ctx.mode === 'spectator') return true; // before any ctx.me math (me may be undefined)
    return hornBandFor(ctx.me, e, ctx.islands) !== null;
  },
  materialize(ctx, e) {
    if (e.id === ctx.observerId) return { k: 'fh', h: e.h, self: true };
    if (ctx.mode === 'spectator') return { k: 'fh', h: e.h, x: e.x, y: e.y };
    // visible() passed, so the band is non-null — the ONE shared resolver
    // guarantees the gate and this payload agree.
    const v = hornBandFor(ctx.me, e, ctx.islands) as FoghornBand;
    return { k: 'fh', h: e.h, b: wrapPositive(bearing(ctx.me.state, e)), v };
  },
};

// ---------------------------------------------------------------------------
// The registry: every spatial signal channel, one row each.
// ---------------------------------------------------------------------------

/** Freeze the registry AND every row inside it. A shallow Object.freeze on the
 *  map alone would leave the rows mutable (a counter-intel slot could be
 *  monkey-patched onto a row at runtime); this freezes each row too. Generic
 *  over the map type so the precise per-key row types survive
 *  (SIGNAL_REGISTRY.contact stays SignalSpec<ShipRecord, Contact>). */
const deepFreezeRows = <T extends object>(rows: T): Readonly<T> => {
  for (const key of Object.keys(rows) as (keyof T)[]) Object.freeze(rows[key]);
  return Object.freeze(rows);
};

/**
 * String-keyed registry of every signal channel — the 16 GameEvent kinds plus
 * the `contact`/`mine`/`litzone`/`decoy` pseudo-types. perception.ts
 * dispatches world events by `e.k` (an emitted kind with no row is a hard
 * fail-closed drop) and drives the contact/blip/ballistic/mine/litzone/decoy
 * scans through their rows. Deep-frozen: the map AND every row are frozen —
 * rows are added at authoring time only, each with its required invariant
 * test case.
 */
export const SIGNAL_REGISTRY = deepFreezeRows({
  contact: contactSignal,
  mine: mineSignal,
  litzone: litZoneSignal,
  decoy: decoySignal,
  blip: blipSignal,
  shell: ballisticSignal('shell'),
  torp: ballisticSignal('torp'),
  torpU: torpedoUpdateSignal, // Story 2.8: the homing-track update (scan-driven, like shell/torp)
  boom: boomSignal,
  burst: burstSignal,
  sunk: sunkSignal,
  spawn: spawnSignal,
  dmg: selfPrivateSignal<DamageEvent>('dmg', true),
  pt: selfPrivateSignal<PointEvent>('pt', false),
  bn: selfPrivateSignal<BoonFitEvent>('bn', false),
  // DAMAGE CONTROL (Eric rulings 2026-08-04): the heal spend's own toast.
  // spectatorPublic FALSE — the pt/bn terms, deliberately NOT dmg's: a heal is
  // an economy act, and "that hull just repaired" must never reach anyone but
  // the hull that spent the level (the spec's no-observer-visible-cue rule).
  heal: selfPrivateSignal<HealEvent>('heal', false),
  // Story 4.3 (amendments 15-20): the gunnery conversation — three declared
  // fog exceptions, each with its stated rationale on its row above.
  sp: fallOfShotSignal,
  hc: hitCallSignal,
  mz: muzzleFlashSignal,
  // Story 4.4 (amendments 40-50): wounded smoke — the fifth declared fog
  // exception, anonymous by construction (see the row above).
  sm: woundedSmokeSignal,
  // Story 4.5 (amendments 51-58): the foghorn — the sixth declared fog
  // exception and the first partial LOS carve-out (islands muffle one step —
  // max(5, band + 2) on the Story 4.9 eight-band ladder).
  fh: foghornSignal,
});

/**
 * COMPILE-TIME EXHAUSTIVENESS (zero runtime cost — types are fully erased):
 * adding a new GameEvent kind in shared/src/types.ts without a matching
 * registry row makes `MissingEventRows` a non-`never` type, which then fails the
 * `AssertNever` constraint and breaks `tsc`. The registry MAY hold extra keys
 * (the contact/mine pseudo-rows); it may never OMIT a GameEvent kind.
 */
type MissingEventRows = Exclude<GameEvent['k'], keyof typeof SIGNAL_REGISTRY>;
type AssertNever<T extends never> = T;
// Exported only so it counts as "used" — nothing imports it; its sole purpose
// is that `tsc` evaluates the AssertNever constraint on MissingEventRows here.
export type RegistryCoversEveryGameEventKind = AssertNever<MissingEventRows>;

/**
 * Row lookup for WORLD-EVENT dispatch (perception.forwardedEvents). Resolves
 * ONLY the 16 GameEvent-kind rows. It excludes the contact/mine/litzone/decoy
 * pseudo-rows so a fabricated `k:'mine'` (or `k:'litzone'`/`k:'decoy'`) world
 * event can never materialize (restoring the old dispatcher's
 * `default: return null` guarantee), and uses an OWN-property lookup
 * (Object.hasOwn) so an inherited prototype key ('constructor', 'toString')
 * resolves to undefined, not a Function. Any unresolved kind fails closed:
 * the caller drops the event (nothing spatial leaves the server outside a
 * registry row).
 */
export function signalFor(kind: string): SignalSpec | undefined {
  // Pseudo-rows never dispatch from world events.
  if (kind === 'contact' || kind === 'mine' || kind === 'litzone' || kind === 'decoy') return undefined;
  if (!Object.hasOwn(SIGNAL_REGISTRY, kind)) return undefined; // own-property only
  return (SIGNAL_REGISTRY as Partial<Record<string, SignalSpec>>)[kind];
}
