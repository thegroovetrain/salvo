// Per-observer visibility — the fog-of-war core and the anti-cheat boundary.
// One pure pass per observer computes everything that observer may know this
// tick; frames.ts is the only caller, so nothing spatial can leave the server
// without going through observe(). The invariant is unit-tested property-style
// in __tests__/perception.test.ts: no contact or event in any frame may
// reference anything outside sight ∪ (this-tick radar paints).
//
// THE RULES LIVE IN THE SIGNAL REGISTRY (signals.ts): every signal channel —
// the 11 GameEvent kinds plus the contact/mine/litzone/decoy frame channels —
// is one declarative SignalSpec row (visible + materialize + counterIntel),
// and observe()/observeSpectator() below are the ONLY callers of row logic.
// Adding a signal means adding a row (plus its invariant test case), never
// editing a dispatcher here: the loops below contain no per-kind branching
// outside registry dispatch.
//
// ORDER IS SACRED (byte-identity on the wire): world-emitted events are
// dispatched in world-emission order (never bucketed or re-sorted by type),
// then per-observer ballistic reveals, then radar blips. The blip SUBSEQUENCE
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

import type { BallisticEvent, BlipEvent, Contact, DecoyView, GameEvent, LitZoneView, MineView } from '@salvo/shared';
import type { ShipRecord, World } from './world.js';
import { SIGNAL_REGISTRY, signalFor, type SignalContext } from './signals.js';

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
    ships: world.ships,
    litZones: world.litZones,
    decoys: world.decoys,
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
    ships: world.ships,
    litZones: world.litZones,
    decoys: world.decoys,
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

/**
 * The blip-subsequence order (FR10 anti-tell): a total order over PUBLIC
 * payload fields only — (x, then y, then t, then id) — so a frame's blip
 * ordering is a pure function of what the observer receives and carries ZERO
 * information about which paints are genuine hulls and which are decoy
 * counter-intel. Appending genuine-then-decoy (source order) would make "first
 * same-id blip = the real ship" a wire-readable de-anonymizer.
 */
function blipOrder(a: BlipEvent, b: BlipEvent): number {
  if (a.x !== b.x) return a.x - b.x;
  if (a.y !== b.y) return a.y - b.y;
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
  blips.push(...decoyBlips(world, ctx));
  events.push(...blips.sort(blipOrder));
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
 * rows' spectator rules applied (upg/pt/heal stay self-private; shell/torp
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
