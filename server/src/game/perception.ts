// Per-observer visibility — the fog-of-war core and the anti-cheat boundary.
// One pure pass per observer computes everything that observer may know this
// tick; frames.ts is the only caller, so nothing spatial can leave the server
// without going through observe(). The invariant is unit-tested property-style
// in __tests__/perception.test.ts: no contact or event in any frame may
// reference anything outside sight ∪ (this-tick radar paints).
//
// THE RULES LIVE IN THE SIGNAL REGISTRY (signals.ts): every signal channel —
// the 10 GameEvent kinds plus the contact/mine frame channels — is one
// declarative SignalSpec row (visible + materialize), and observe()/
// observeSpectator() below are the ONLY callers of row logic. Adding a signal
// means adding a row (plus its invariant test case), never editing a
// dispatcher here: the loops below contain no per-kind branching outside
// registry dispatch.
//
// ORDER IS SACRED (byte-identity on the wire): world-emitted events are
// dispatched in world-emission order (never bucketed or re-sorted by type),
// then per-observer ballistic reveals, then radar blips; contacts and mines
// keep their Map-insertion iteration order in their own frame channels.
//
// OBSERVER MODEL: an observer with a ship record observes from its position,
// alive or sunk — a fresh wreck keeps seeing its surroundings for the 3s
// respawn delay (waiting-phase deaths). A client with no ship at all sees
// nothing (fail-closed). SPECTATORS (dead-in-active or anyone once the match
// is finished — gated by frames.ts on the match phase, never here) get the
// separate observeSpectator() view: unfogged, since a dead player has no
// channel back into the match. observe() itself never relaxes fog.

import type { BallisticEvent, BlipEvent, Contact, GameEvent, MineView } from '@salvo/shared';
import type { ShipRecord, World } from './world.js';
import { SIGNAL_REGISTRY, signalFor, type SignalContext } from './signals.js';

export { losClear } from './signals.js';

/** Everything one observer may know this tick. */
export interface PerceptionView {
  contacts: Contact[];
  events: GameEvent[];
  mines: MineView[];
}

/** The narrow row context for the FOGGED path (observe() fail-closes before
 *  this when the observer has no ship, so rows always get a real `me`). */
function foggedContext(world: World, me: ShipRecord): SignalContext {
  return { mode: 'fogged', me, observerId: me.id, now: world.now, islands: world.map.islands, ships: world.ships };
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
    if (row.visible(ctx, shell)) out.push(row.materialize(ctx, shell));
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

/** One registry-driven view build — both observer modes share it; the ctx mode
 *  is the ONLY thing that differs. Emission order per the header: forwarded
 *  world events → ballistic reveals → blips (spectator blips are none by rule:
 *  the blip row never fires unfogged). */
function view(world: World, ctx: SignalContext): PerceptionView {
  const { contacts, blips } = shipScan(world, ctx);
  const events = forwardedEvents(world, ctx);
  events.push(...ballisticScan(world, ctx));
  events.push(...blips);
  return { contacts, events, mines: mineScan(world, ctx) };
}

/**
 * Build the full per-observer view for this tick. The ONLY producer of FOGGED
 * frame contacts/events (frames.ts is its only caller). A viewer with no ship
 * sees nothing — fail-closed.
 */
export function observe(world: World, observerId: string): PerceptionView {
  const me = world.ships.get(observerId);
  if (!me) return { contacts: [], events: [], mines: [] };
  return view(world, foggedContext(world, me));
}

/**
 * The UNFOGGED spectator view: every alive ship as a live contact, every mine
 * (own = observer owns it), and this tick's world events with only the rows'
 * spectator rules applied (upg/pt/heal stay self-private; shell/torp world
 * events defer to the exactly-once ballistic reveal; blips are pointless —
 * contacts are live — and never emitted).
 *
 * ANTI-CHEAT GATE: only frames.ts may call this, and only for a dead-in-active
 * or finished-phase observer. The invariant test asserts an alive active
 * observer can never receive this view.
 */
export function observeSpectator(world: World, observerId: string): PerceptionView {
  return view(world, spectatorContext(world, observerId));
}
