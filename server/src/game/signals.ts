// The SIGNAL REGISTRY — one declarative home per spatial signal (Story 1.1).
// Every channel that can put per-observer spatial knowledge into a frame is a
// row here: the 11 GameEvent kinds plus the three contact-like frame channels
// (`contact`, `mine`, and `litzone` — pseudo event types: not GameEvents, but
// the invariant suite iterates them like everything else). perception.ts's
// observe()/observeSpectator() are the ONLY callers of a row's visible()/
// materialize(); nothing spatial leaves the server outside a row.
//
// THE LOS RULE (one rule for everything): a point is line-of-sight-clear from
// the observer iff the segment observer→point crosses no island circle
// (segCircleHit). Sight, radar, shells, booms, spawns, and sinks all use it.
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
// k,id,x,y; MineView: id,x,y,own; LitZoneView: id,x,y,r,until,by). Do not
// reorder keys.

import {
  bearing,
  segCircleHit,
  wrapPositive,
  type BallisticEvent,
  type BlipEvent,
  type BoomEvent,
  type BurstEvent,
  type Circle,
  type Contact,
  type DamageEvent,
  type GameEvent,
  type HealEvent,
  type LitZoneView,
  type MineView,
  type PointEvent,
  type ShellState,
  type SpawnEvent,
  type SunkEvent,
  type UpgradeEvent,
  type Vec2,
} from '@salvo/shared';
import type { LitZone, ShipRecord } from './world.js';
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
  /** Island circles for the one LOS rule. */
  islands: readonly Circle[];
  /** Ship records by id — victim/wreck lookups (boom stripping, sunk gating). */
  ships: ReadonlyMap<string, ShipRecord>;
  /** All ACTIVE star-shell lit zones (Story 1.7) — the owned-zone truesight
   *  source (ownZoneCovers) and the litzone row's scan subjects. */
  litZones: ReadonlyMap<string, LitZone>;
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
 * MineState for the scan-driven channels); `O` is the materialized wire shape.
 * materialize() is only ever called after visible() passes.
 */
export interface SignalSpec<S = unknown, O = unknown> {
  /** Registry key: a GameEvent `k`, or a pseudo-type for a non-event frame
   *  channel (`contact` / `mine`). */
  readonly eventType: string;
  /** The fog-of-war predicate — the anti-cheat gate for this signal. */
  visible(ctx: SignalContext, subject: S): boolean;
  /** Wire-shape the subject for this observer. KEY ORDER IS LOAD-BEARING. */
  materialize(ctx: SignalContext, subject: S): O;
  /**
   * DECLARATION ONLY (first row arrives in Story 1.8): a row may later
   * fabricate counter-intel — plausible-but-false signals (decoy contacts /
   * blips) emitted to observers the real subject is hidden from. No row
   * implements it and nothing reads it yet; the slot exists so the registry
   * shape is stable before the first lying signal ships.
   */
  counterIntel?(ctx: SignalContext, subject: S): O | null;
}

// ---------------------------------------------------------------------------
// Shared predicates (the vision math every row builds on).
// ---------------------------------------------------------------------------

/** True iff the segment a→b crosses no island circle (the one LOS rule). */
export function losClear(a: Vec2, b: Vec2, islands: readonly Circle[]): boolean {
  for (const isle of islands) {
    if (segCircleHit(a, b, isle, isle.r) !== null) return false;
  }
  return true;
}

/** Sight-tier test for a point: within the OBSERVER'S effective sight range
 *  (inclusive) + LOS-clear. Takes the ShipRecord so the sightRange upgrade
 *  applies to every point-sighted gate (ballistics, mines, booms, wrecks,
 *  spawns) uniformly. */
function pointSighted(me: ShipRecord, p: Vec2, islands: readonly Circle[]): boolean {
  const dx = p.x - me.state.x;
  const dy = p.y - me.state.y;
  const sight = me.stats.sightRange;
  return dx * dx + dy * dy <= sight * sight && losClear(me.state, p, islands);
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

/** Radar-annulus test: beyond sight (exclusive), within radar (inclusive) —
 *  both the OBSERVER'S effective ranges. Sight wins inside its radius (a
 *  LOS-blocked ship inside sight is simply invisible — it is not in the
 *  annulus, so it cannot paint). */
function inRadarAnnulus(me: ShipRecord, target: ShipRecord): boolean {
  const dx = target.state.x - me.state.x;
  const dy = target.state.y - me.state.y;
  const d2 = dx * dx + dy * dy;
  const sight2 = me.stats.sightRange * me.stats.sightRange;
  const radar2 = me.stats.radarRange * me.stats.radarRange;
  return d2 > sight2 && d2 <= radar2;
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
    const sight = me.stats.sightRange;
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
 * under fog); everyone else sees a mine only when it is within sight range +
 * island-LOS — OR inside a lit zone the observer OWNS (Story 1.7 truesight
 * parity, no LOS on the zone path). Mines NEVER radar-paint, and arm state
 * makes no difference to visibility. A static persistent entity synced this
 * way cannot suffer event-lifecycle staleness (a triggered/despawned mine
 * simply drops out of the next frame's list). Spectators see every mine.
 */
const mineSignal: SignalSpec<MineState, MineView> = {
  eventType: 'mine',
  visible(ctx, mine) {
    if (ctx.mode === 'spectator') return true;
    return (
      mine.ownerId === ctx.me.id ||
      pointSighted(ctx.me, mine, ctx.islands) ||
      ownZoneCovers(ctx, mine)
    );
  },
  materialize(ctx, mine) {
    return { id: mine.id, x: mine.x, y: mine.y, own: mine.ownerId === ctx.observerId };
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
    // KEY ORDER IS LOAD-BEARING (msgpack): id,x,y,r,until,by.
    return { id: zone.id, x: zone.x, y: zone.y, r: zone.r, until: zone.until, by: zone.ownerId };
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
 */
const blipSignal: SignalSpec<ShipRecord, BlipEvent> = {
  eventType: 'blip',
  visible(ctx, target) {
    // Blips are perception-generated, never world-emitted: a world-dispatched
    // 'blip' event (not a live ShipRecord) fails this shape guard — fail-closed.
    if (!('state' in target)) return false;
    if (ctx.mode !== 'fogged') return false;
    const me = ctx.me;
    if (!target.alive || target.id === me.id) return false;
    if (ownZoneCovers(ctx, target.state)) return false; // already a full contact — never doubled as a blip
    return (
      inRadarAnnulus(me, target) &&
      sweptThisTick(me, bearing(me.state, target.state)) &&
      losClear(me.state, target.state, ctx.islands)
    );
  },
  materialize(ctx, target) {
    const s = target.state;
    return { k: 'blip', id: target.id, x: s.x, y: s.y, t: ctx.now };
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
 * Two registry rows (two wire kinds), one shared implementation: torpedoes
 * ride the exact same first-sight reveal as shells.
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
      // First-sight OR inside an OWNED lit zone (Story 1.7 truesight parity):
      // the exactly-once seenBallistics machinery is untouched — a zone reveal
      // marks the id like any other, so the projectile is never re-sent.
      return (
        shell.ownerId === me.id ||
        pointSighted(me, shell, ctx.islands) ||
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

// ---------------------------------------------------------------------------
// World-event forwarding channels (subject = the world-emitted GameEvent).
// ---------------------------------------------------------------------------

/**
 * `boom` — visible iff the boom location is within sight + LOS, inside a lit
 * zone the observer OWNS (Story 1.7 truesight parity — everything a firer's
 * zone reveals can also visibly explode), OR the boom struck the observer
 * (`hit === me`). The shell's owner does NOT get an out-of-sight boom — hit
 * confirmation beyond sight would leak contact presence; their dead-reckoned
 * shell just expires by client lifetime. Even when the boom IS visible, its
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
    return e.hit === ctx.me.id || pointSighted(ctx.me, e, ctx.islands) || ownZoneCovers(ctx, e);
  },
  materialize(ctx, e) {
    if (ctx.mode === 'spectator') return e;
    const me = ctx.me;
    if (!e.hit || e.hit === me.id) return e;
    const victim = ctx.ships.get(e.hit);
    if (victim && (pointSighted(me, victim.state, ctx.islands) || ownZoneCovers(ctx, victim.state))) {
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
    return e.own === ctx.me.id || pointSighted(ctx.me, e, ctx.islands) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    // ALWAYS a fresh bare object — never `e` verbatim, which would leak the
    // server-internal `own` field (spectator path included).
    return { k: 'burst', id: e.id, x: e.x, y: e.y };
  },
};

/**
 * `sunk` — visible to the victim itself, and to anyone who can see the sinking
 * ship's position (wreck position: sight + LOS, or inside a lit zone the
 * observer OWNS — Story 1.7 truesight parity, so a firer watches a
 * zone-revealed hull actually go down). Everyone still learns
 * alive/kills/deaths from the public roster schema — sinking is public
 * knowledge, its LOCATION is not. Spectators get the raw event.
 */
const sunkSignal: SignalSpec<SunkEvent, SunkEvent> = {
  eventType: 'sunk',
  visible(ctx, e) {
    if (ctx.mode === 'spectator') return true;
    if (e.id === ctx.me.id) return true;
    const wreck = ctx.ships.get(e.id);
    if (wreck === undefined) return false;
    return pointSighted(ctx.me, wreck.state, ctx.islands) || ownZoneCovers(ctx, wreck.state);
  },
  materialize(_ctx, e) {
    return e;
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
    return e.id === ctx.me.id || pointSighted(ctx.me, e, ctx.islands) || ownZoneCovers(ctx, e);
  },
  materialize(_ctx, e) {
    return e;
  },
};

/**
 * SELF-PRIVATE kinds: forwarded ONLY to the ship the event names — dmg
 * (victim), upg (spender), pt (earner), heal (healed). Enemy hp, builds, and
 * point banks all stay hidden by this one gate (upgrade counts / points ride
 * ONLY on OwnShip, never on contacts/blips/booms).
 *
 * `spectatorPublic`: dmg alone passes through unfiltered to spectators (they
 * may watch a fight's hp — a dead player has no channel back into the match).
 * upg/pt/heal stay self-private even in UNFOGGED spectator frames: a
 * dead-in-active killer (mutual destruction) still gets its own point/spend/
 * heal toasts, but no other spectator may learn a living ship's build
 * increment, point bank, or heal.
 */
function selfPrivateSignal<E extends DamageEvent | UpgradeEvent | PointEvent | HealEvent>(
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
 * String-keyed registry of every signal channel — the 11 GameEvent kinds plus
 * the `contact`/`mine`/`litzone` pseudo-types. perception.ts dispatches world
 * events by `e.k` (an emitted kind with no row is a hard fail-closed drop)
 * and drives the contact/blip/ballistic/mine/litzone scans through their
 * rows. Deep-frozen: the map AND every row are frozen — rows are added at
 * authoring time only, each with its required invariant test case.
 */
export const SIGNAL_REGISTRY = deepFreezeRows({
  contact: contactSignal,
  mine: mineSignal,
  litzone: litZoneSignal,
  blip: blipSignal,
  shell: ballisticSignal('shell'),
  torp: ballisticSignal('torp'),
  boom: boomSignal,
  burst: burstSignal,
  sunk: sunkSignal,
  spawn: spawnSignal,
  dmg: selfPrivateSignal<DamageEvent>('dmg', true),
  upg: selfPrivateSignal<UpgradeEvent>('upg', false),
  pt: selfPrivateSignal<PointEvent>('pt', false),
  heal: selfPrivateSignal<HealEvent>('heal', false),
});

/**
 * COMPILE-TIME EXHAUSTIVENESS (zero runtime cost — types are fully erased):
 * adding an 11th GameEvent kind in shared/src/types.ts without a matching
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
 * ONLY the 11 GameEvent-kind rows. It excludes the contact/mine/litzone
 * pseudo-rows so a fabricated `k:'mine'` (or `k:'litzone'`) world event can
 * never materialize (restoring the old dispatcher's `default: return null`
 * guarantee), and uses an OWN-property lookup (Object.hasOwn) so an inherited
 * prototype key ('constructor', 'toString') resolves to undefined, not a
 * Function. Any unresolved kind fails closed: the caller drops the event
 * (nothing spatial leaves the server outside a registry row).
 */
export function signalFor(kind: string): SignalSpec | undefined {
  if (kind === 'contact' || kind === 'mine' || kind === 'litzone') return undefined; // pseudo-rows never dispatch
  if (!Object.hasOwn(SIGNAL_REGISTRY, kind)) return undefined; // own-property only
  return (SIGNAL_REGISTRY as Partial<Record<string, SignalSpec>>)[kind];
}
