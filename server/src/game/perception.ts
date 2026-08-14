// Per-observer visibility — the fog-of-war core and the anti-cheat boundary.
// One pure pass per observer computes everything that observer may know this
// tick; frames.ts is the only caller, so nothing spatial can leave the server
// without going through observe(). The invariant is unit-tested property-style
// in __tests__/perception.test.ts: no contact or event in any frame may
// reference anything outside sight ∪ (this-tick radar paints) — beyond the
// DECLARED per-row exceptions (self-directed events, owner-authored points,
// Story 4.3's sp/hc/mz gunnery rows, Story 4.4's anonymous `sm` wounded
// smoke, and Story 4.5's bearing-only `fh` foghorn), each codified by its own
// independently-reimplemented oracle in that suite.
//
// THE RULES LIVE IN THE SIGNAL REGISTRY (signals.ts): every signal channel —
// the 18 GameEvent kinds plus the contact/mine/litzone/decoy frame channels —
// is one declarative SignalSpec row (visible + materialize + counterIntel),
// and observe()/observeSpectator() below are the ONLY callers of row logic.
// Adding a signal means adding a row (plus its invariant test case), never
// editing a dispatcher here: the loops below contain no per-kind branching
// outside registry dispatch.
//
// ORDER IS SACRED (byte-identity on the wire): world-emitted events are
// dispatched in world-emission order (never bucketed or re-sorted by type),
// then per-observer ballistic reveals, then homing-track updates (torpU,
// Story 2.8), then radar blips. The blip SUBSEQUENCE
// alone is sorted by PUBLIC payload only — (x, y, t, id), fields the observer
// receives anyway — because genuine ship paints and decoy counter-intel
// paints merge into it (Story 1.8/FR10): any source-derived order (ships-map
// first, decoys-map second) would let array position de-anonymize the
// deception whenever a hull and its buoy paint the same tick. Contacts,
// mines, lit zones, and decoys keep their Map-insertion iteration order in
// their own frame channels.
//
// OBSERVER MODEL: an observer with a ship record observes from its position,
// alive or sunk — a fresh wreck keeps seeing its surroundings for the 3s
// respawn delay (waiting-phase deaths). A client with no ship at all sees
// nothing (fail-closed). SPECTATORS (dead-in-active or anyone once the match
// is finished — gated by frames.ts on the match phase, never here) get the
// separate observeSpectator() view: unfogged, since a dead player has no
// channel back into the match. observe() itself never relaxes fog.

import { eachWakeSegment, type BallisticEvent, type BlipEvent, type Contact, type DecoyView, type GameEvent, type LitZoneView, type MineView, type ReturnBlipEvent, type SilhouetteBlipEvent, type TorpedoUpdateEvent, type WakeBlipEvent } from '@salvo/shared';
import type { ShipRecord, World } from './world.js';
import { SIGNAL_REGISTRY, signalFor, sweepMayCrossWake, type SignalContext, type WakeSubject } from './signals.js';

/** Everything one observer may know this tick. */
export interface PerceptionView {
  contacts: Contact[];
  events: GameEvent[];
  mines: MineView[];
  litZones: LitZoneView[];
  decoys: DecoyView[];
}

/** The narrow row context for the FOGGED path (observe() fail-closes before
 *  this when the observer has no ship, so rows always get a real `me`). */
function foggedContext(world: World, me: ShipRecord): SignalContext {
  return {
    mode: 'fogged',
    me,
    observerId: me.id,
    now: world.now,
    islands: world.map.islands,
    // Story 4.11: the blip gate's shadow-march substrate (the raster alone,
    // never the whole GameMap — the narrow-context principle).
    heightRaster: world.map.heightRaster,
    ships: world.ships,
    litZones: world.litZones,
    decoys: world.decoys,
    // Story 4.12: the wake scan's subject list (every live ribbon — active,
    // torpedo, and detached water), riding the context like the raster does.
    wakes: world.wakeRibbons,
    // Radar realism cycle (amendment 63): the room's modes + the pseudonym
    // resolver, threaded from the World (which the ADAPTER configured — no
    // process.env anywhere on this path).
    radarGrammar: world.radarGrammar,
    radarIdentity: world.radarIdentity,
    pseudonymOf: (id: string) => world.pseudonymFor(id),
    // Story 5.6 (amendment 40): the self-private aggro mark's ONE input.
    aggroAt: (fleetShipId: string, observerId: string) => world.drones.isTargeting(fleetShipId, observerId),
  };
}

/** The narrow row context for the UNFOGGED spectator path (`me` may be
 *  undefined — a record-less spectator keeps no ballistic reveal memory). */
function spectatorContext(world: World, observerId: string): SignalContext {
  return {
    mode: 'spectator',
    me: world.ships.get(observerId),
    observerId,
    now: world.now,
    islands: world.map.islands,
    // Inert on this path (spectators get live contacts, never blips) — rides
    // every context uniformly so the context stays one shape.
    heightRaster: world.map.heightRaster,
    ships: world.ships,
    litZones: world.litZones,
    decoys: world.decoys,
    // Inert on this path too (spectators have no radar, so no wake events) —
    // rides uniformly so the context stays one shape.
    wakes: world.wakeRibbons,
    // Modes ride every context uniformly (spectators get live contacts, never
    // blips — these are inert here, but the context stays one shape).
    radarGrammar: world.radarGrammar,
    radarIdentity: world.radarIdentity,
    pseudonymOf: (id: string) => world.pseudonymFor(id),
    // Story 5.6 (amendment 40): DEAD on this path — the contact row refuses
    // the aggro mark for `mode: 'spectator'` before it ever asks. It rides
    // uniformly so the context stays one shape (the radarGrammar posture).
    aggroAt: (fleetShipId: string, observerId: string) => world.drones.isTargeting(fleetShipId, observerId),
  };
}

/**
 * The shared single pass over ships: one loop decides both tiers per
 * observer/target pair (the historical pairScan structure), but the tier
 * predicates and wire shapes live entirely in the contact/blip rows. Sight
 * wins inside its radius — a ship that fails the contact row is offered to the
 * blip row, whose annulus gate excludes everything within sight.
 */
function shipScan(world: World, ctx: SignalContext): { contacts: Contact[]; blips: BlipEvent[] } {
  const contacts: Contact[] = [];
  const blips: BlipEvent[] = [];
  const contactRow = SIGNAL_REGISTRY.contact;
  const blipRow = SIGNAL_REGISTRY.blip;
  for (const ship of world.ships.values()) {
    if (contactRow.visible(ctx, ship)) contacts.push(contactRow.materialize(ctx, ship));
    else if (blipRow.visible(ctx, ship)) blips.push(blipRow.materialize(ctx, ship));
  }
  return { contacts, blips };
}

/**
 * World-emitted events, dispatched ONE BY ONE in world-emission order to each
 * event's registry row (lookup by `e.k` — never iterate the registry over the
 * event list, which would re-bucket by type). An emitted kind with no row is a
 * hard fail-closed drop.
 */
function forwardedEvents(world: World, ctx: SignalContext): GameEvent[] {
  const out: GameEvent[] = [];
  for (const e of world.tickEvents) {
    const row = signalFor(e.k);
    if (!row || !row.visible(ctx, e)) continue;
    // Every event-kind row materializes a GameEvent; the cast recovers the
    // type erased by the string-keyed lookup.
    out.push(row.materialize(ctx, e) as GameEvent);
  }
  return out;
}

/** Per-observer ballistic reveals: every live projectile is offered to its own
 *  kind's row (shell/torp — registry dispatch by `shell.kind`), which owns the
 *  exactly-once seenBallistics memory and the reveal-time wire shape. */
function ballisticScan(world: World, ctx: SignalContext): BallisticEvent[] {
  const out: BallisticEvent[] = [];
  for (const shell of world.shells.values()) {
    const row = SIGNAL_REGISTRY[shell.kind];
    if (!row.visible(ctx, shell)) continue;
    out.push(row.materialize(ctx, shell));
    // The exactly-once reveal mark lives HERE, not in materialize (which is a
    // pure wire-shaper). visible() guarantees ctx.me exists (fogged: always;
    // spectator: it fails closed when !me), so mark immediately — same tick and
    // per-projectile order the old mutating materialize used.
    ctx.me?.seenBallistics.add(shell.id);
    // A HOMING torpedo's reveal also records its direction baseline (Story
    // 2.8): the torpU row re-emits to this observer only once the live
    // velocity direction drifts past the threshold from THIS value.
    if (shell.homing !== undefined) ctx.me?.torpDirs.set(shell.id, Math.atan2(shell.vy, shell.vx));
  }
  return out;
}

/** Per-observer HOMING-track updates (Story 2.8): every live steering torpedo
 *  is offered to the torpU row (already-revealed + currently-DETECTED — the
 *  3/8 rung since Story 4.9, not the truesight bubble — + direction drift ≥
 *  threshold; the row owns the rules); an emission advances
 *  this observer's direction baseline HERE (the seenBallistics mark precedent
 *  — materialize stays a pure wire-shaper). The 'exactly-once' ballistic
 *  convention is deliberately relaxed for THIS channel alone: updates re-key
 *  the same projectile id. */
function torpedoUpdateScan(world: World, ctx: SignalContext): TorpedoUpdateEvent[] {
  const out: TorpedoUpdateEvent[] = [];
  const row = SIGNAL_REGISTRY.torpU;
  for (const shell of world.shells.values()) {
    if (shell.homing === undefined) continue;
    if (!row.visible(ctx, shell)) continue;
    out.push(row.materialize(ctx, shell));
    ctx.me?.torpDirs.set(shell.id, Math.atan2(shell.vy, shell.vx));
  }
  return out;
}

/** Per-observer mine visibility — contact-like state (NOT events), recomputed
 *  every tick through the mine row, in Map-insertion (drop) order. */
function mineScan(world: World, ctx: SignalContext): MineView[] {
  const out: MineView[] = [];
  const row = SIGNAL_REGISTRY.mine;
  for (const mine of world.mines.values()) {
    if (row.visible(ctx, mine)) out.push(row.materialize(ctx, mine));
  }
  return out;
}

/** Per-observer lit-zone visibility (Story 1.7) — contact-like state exactly
 *  like mines, recomputed every tick through the litzone row, in Map-insertion
 *  (burst) order. Only the radar-gated circle rides here; the firer's
 *  truesight parity inside a zone flows through the contact/mine/ballistic
 *  rows (signals.ownZoneCovers). */
function litZoneScan(world: World, ctx: SignalContext): LitZoneView[] {
  const out: LitZoneView[] = [];
  const row = SIGNAL_REGISTRY.litzone;
  for (const zone of world.litZones.values()) {
    if (row.visible(ctx, zone)) out.push(row.materialize(ctx, zone));
  }
  return out;
}

/** Per-observer decoy-buoy TRUTH visibility (Story 1.8) — contact-like state
 *  exactly like mines, recomputed every tick through the decoy row, in
 *  Map-insertion (drop) order. Owner always / truesighted enemies /
 *  spectators; the DECEPTION never rides here (see decoyBlips below). */
function decoyScan(world: World, ctx: SignalContext): DecoyView[] {
  const out: DecoyView[] = [];
  const row = SIGNAL_REGISTRY.decoy;
  for (const decoy of world.decoys.values()) {
    if (row.visible(ctx, decoy)) out.push(row.materialize(ctx, decoy));
  }
  return out;
}

/** Counter-intel radar paints (Story 1.8, FR10): every live decoy is offered
 *  to the BLIP row's counterIntel, which applies the EXACT ship-blip gate to
 *  the buoy position and emits the genuine blip shape with the OWNER's ship
 *  id — or null (owner / unfogged / unswept / out of the annulus / LOS-
 *  blocked / zone-truesighted). This scan is the ONLY counterIntel call site,
 *  keeping observe() the single scan surface and frames.ts the sole spatial
 *  exit. */
function decoyBlips(world: World, ctx: SignalContext): BlipEvent[] {
  const out: BlipEvent[] = [];
  const row = SIGNAL_REGISTRY.blip;
  for (const decoy of world.decoys.values()) {
    const lie = row.counterIntel!(ctx, decoy);
    if (lie !== null) out.push(lie);
  }
  return out;
}

/** Reused wake-subject scratch for the wake scan (the SEG_SCRATCH pattern):
 *  filled per segment, consumed synchronously by the row's visible()/
 *  materialize() — the materialized wire object is always fresh. */
const WAKE_SUBJECT: WakeSubject = { x: 0, y: 0, ax: 0, ay: 0, bx: 0, by: 0, bucket: 0, widthU: 0, torp: false };

/**
 * Per-observer wake disclosure (Story 4.12): every live ribbon — a ship's
 * active track, a running torpedo's, or detached water still ageing out — is
 * walked segment by segment through the `wk` row, which gates each segment at
 * its midpoint on the blipGate clause order with a PER-SOURCE inner bound and
 * band-consistent occlusion (cycle-69 review gate, P2 — see the row and
 * signals.wakeGate), in the `return` grammar only (P1). THE THIRD SCAN beside
 * shipScan (which iterates ships ONLY, by construction) and ballisticScan —
 * wake is water, not a ship, so it gets its own subject list (ctx.wakes).
 * The ribbon-level broadphase (sweepMayCrossWake — bounding circle + bearing
 * span, conservative only) runs before the per-segment loop so cost scales
 * with what the beam crossed rather than with track length. Spectators get
 * none (no radar — the blip rule; the row also fails closed on mode).
 */
function wakeScan(ctx: SignalContext): WakeBlipEvent[] {
  const out: WakeBlipEvent[] = [];
  if (ctx.mode !== 'fogged') return out;
  // Grammar early-out (cycle-69 review gate, P1) — a COST device beside the
  // row's own first clause, the sweepMayCrossWake pattern: the rule lives in
  // the row (its visible() is grammar-gated), this line only spares a default
  // silhouette room the whole per-ribbon walk. Deleting it changes no frame.
  if (ctx.radarGrammar !== 'return') return out;
  const row = SIGNAL_REGISTRY.wk;
  for (const ribbon of ctx.wakes) {
    if (!sweepMayCrossWake(ctx.me, ribbon, ctx.now)) continue;
    eachWakeSegment(ribbon, ctx.now, (seg) => {
      const s = WAKE_SUBJECT;
      s.x = seg.mx;
      s.y = seg.my;
      s.ax = seg.ax;
      s.ay = seg.ay;
      s.bx = seg.bx;
      s.by = seg.by;
      s.bucket = seg.bucket;
      s.widthU = ribbon.widthU;
      s.torp = ribbon.torp; // the per-source inner bound (review-gate P2)
      if (row.visible(ctx, s)) out.push(row.materialize(ctx, s));
    });
  }
  return out;
}

/** The wake-subsequence order (Story 4.12 — the blipOrder discipline): a
 *  total order over PUBLIC payload only (gx, gy, t, a, w, h, mask words), so
 *  a frame's wake ordering carries ZERO source information. Scan order is
 *  ribbon-store order — emitting it raw would GROUP segments by source, and
 *  array-position clustering is exactly the hull↔wake linkage amendment 194
 *  forbids the wire to carry. */
function wakeOrder(a: WakeBlipEvent, b: WakeBlipEvent): number {
  if (a.gx !== b.gx) return a.gx - b.gx;
  if (a.gy !== b.gy) return a.gy - b.gy;
  if (a.t !== b.t) return a.t - b.t;
  if (a.a !== b.a) return a.a - b.a;
  if (a.w !== b.w) return a.w - b.w;
  if (a.h !== b.h) return a.h - b.h;
  if (a.bits.length !== b.bits.length) return a.bits.length - b.bits.length;
  for (let i = 0; i < a.bits.length; i++) {
    if (a.bits[i] !== b.bits[i]) return a.bits[i] - b.bits[i];
  }
  return 0;
}

/**
 * The blip-subsequence order (FR10 anti-tell): a total order over PUBLIC
 * payload fields only, so a frame's blip ordering is a pure function of what
 * the observer receives and carries ZERO information about which paints are
 * genuine hulls and which are decoy counter-intel. Appending
 * genuine-then-decoy (source order) would make array position a wire-readable
 * de-anonymizer whenever a hull and a buoy paint the same tick.
 *
 * Two comparators, one per grammar (a room emits exactly one shape —
 * amendment 63): silhouette orders by (x, y, t, id) exactly as it always has
 * — cls/heading/speed are deliberately NOT in the key (a field that DIFFERS
 * between a genuine paint and a decoy paint, like speed = 0, would become a
 * sort-position de-anonymizer). The cycle-63 `return` shape carries NO id
 * (amendment 152), so its key is the full public payload: (gx, gy, t, w, h,
 * then the mask words lexicographically) — total up to byte-identical
 * payloads, and two byte-identical payloads carry no order information to
 * leak.
 */
function returnBlipOrder(a: ReturnBlipEvent, b: ReturnBlipEvent): number {
  if (a.gx !== b.gx) return a.gx - b.gx;
  if (a.gy !== b.gy) return a.gy - b.gy;
  if (a.t !== b.t) return a.t - b.t;
  if (a.w !== b.w) return a.w - b.w;
  if (a.h !== b.h) return a.h - b.h;
  if (a.bits.length !== b.bits.length) return a.bits.length - b.bits.length;
  for (let i = 0; i < a.bits.length; i++) {
    if (a.bits[i] !== b.bits[i]) return a.bits[i] - b.bits[i];
  }
  return 0;
}

function silhouetteBlipOrder(a: SilhouetteBlipEvent, b: SilhouetteBlipEvent): number {
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Grammar-dispatched comparator over the tagless union: every blip in a
 *  frame has the one shape the room's grammar picked, so presence of `gx`
 *  (a required `return` key that the silhouette shape can never carry) is a
 *  structural discriminator, not a probe of optional fields. */
function blipOrder(a: BlipEvent, b: BlipEvent): number {
  if ('gx' in a && 'gx' in b) return returnBlipOrder(a, b);
  return silhouetteBlipOrder(a as SilhouetteBlipEvent, b as SilhouetteBlipEvent);
}

/** One registry-driven view build — both observer modes share it; the ctx mode
 *  is the ONLY thing that differs. Emission order per the header: forwarded
 *  world events → ballistic reveals → the blip subsequence, which merges
 *  genuine ship paints and decoy counter-intel paints and is sorted by
 *  blipOrder (public payload only — never source order; spectator blips are
 *  none by rule: neither the blip row nor its counterIntel ever fires
 *  unfogged). Only the blip subsequence is sorted; its position relative to
 *  every other event kind is unchanged. */
function view(world: World, ctx: SignalContext): PerceptionView {
  const { contacts, blips } = shipScan(world, ctx);
  const events = forwardedEvents(world, ctx);
  events.push(...ballisticScan(world, ctx));
  // Homing-track updates (Story 2.8) sit AFTER the reveals (an update can
  // never precede its own track's reveal in a frame) and before the blip
  // subsequence — a knowing extension of the sacred emission order.
  events.push(...torpedoUpdateScan(world, ctx));
  blips.push(...decoyBlips(world, ctx));
  events.push(...blips.sort(blipOrder));
  // Wake segments (Story 4.12) CLOSE the frame as a new trailing subsequence
  // — every historical kind keeps its exact position — sorted by wakeOrder
  // (public payload only, never ribbon-store order; see the comparator).
  events.push(...wakeScan(ctx).sort(wakeOrder));
  return {
    contacts,
    events,
    mines: mineScan(world, ctx),
    litZones: litZoneScan(world, ctx),
    decoys: decoyScan(world, ctx),
  };
}

/**
 * Build the full per-observer view for this tick. The ONLY producer of FOGGED
 * frame contacts/events (frames.ts is its only caller). A viewer with no ship
 * sees nothing — fail-closed.
 */
export function observe(world: World, observerId: string): PerceptionView {
  const me = world.ships.get(observerId);
  if (!me) return { contacts: [], events: [], mines: [], litZones: [], decoys: [] };
  return view(world, foggedContext(world, me));
}

/**
 * The UNFOGGED spectator view: every alive ship as a live contact, every mine
 * (own = observer owns it), every lit zone and decoy buoy (the truth — a
 * spectator is never lied to), and this tick's world events with only the
 * rows' spectator rules applied (pt/bn stay self-private; shell/torp
 * world events defer to the exactly-once ballistic reveal; blips — genuine or
 * counter-intel — are pointless with live contacts and never emitted).
 *
 * ANTI-CHEAT GATE: only frames.ts may call this, and only for a dead-in-active
 * or finished-phase observer. The invariant test asserts an alive active
 * observer can never receive this view.
 */
export function observeSpectator(world: World, observerId: string): PerceptionView {
  return view(world, spectatorContext(world, observerId));
}
