// Per-client frame construction — the fogged plane of the sync model. This is
// the single chokepoint for everything spatial leaving the server (the
// toClientView() philosophy carried forward). Contacts and events come
// EXCLUSIVELY from perception.observe() — sight tier, island LOS, radar
// paints, and per-event visibility rules all live there, so the anti-cheat
// invariant stays a unit-testable property of one function. Nothing else may
// ever put contacts or events into a frame.

import type { FrameMsg, MatchPhase, OwnShip } from '@salvo/shared';
import { observe, observeSpectator } from './perception.js';
import { weaponCooldowns } from './weapons/index.js';
import type { ShipRecord, World } from './world.js';

function toOwnShip(ship: ShipRecord): OwnShip {
  return {
    id: ship.id,
    x: ship.state.x,
    y: ship.state.y,
    heading: ship.state.heading,
    speed: ship.state.speed,
    hp: ship.hp,
    alive: ship.alive,
    weapon: ship.input.weapon,
    // [guns, torpedoes, mines] ms remaining, each the soonest-ready mount/tube.
    cooldowns: weaponCooldowns(ship),
    // Post-advance angle == the leading edge of this tick's paint window, so
    // the client wedge visually crosses a contact the moment its blip arrives.
    sweep: ship.sweepAngle,
  };
}

/**
 * THE spectator gate (anti-cheat sensitive): unfogged frames go ONLY to a
 * dead observer during the active phase, or to everyone once the match is
 * finished (no way back into play either way). Every other observer — alive
 * in active, anyone in waiting/countdown (lobby keeps the one fogged code
 * path), a fresh wreck awaiting respawn in waiting — stays fully fogged.
 */
function spectates(phase: MatchPhase, ship: ShipRecord | undefined): boolean {
  if (phase === 'finished') return true;
  return phase === 'active' && ship !== undefined && !ship.alive;
}

/**
 * Build the per-tick frame for one client. Call once per client per tick:
 * observe()/observeSpectator() mark ballistics as seen per observer
 * (exactly-once event semantics). `phase` is the room's match phase; the
 * 'waiting' default preserves pre-lifecycle behavior for standalone worlds
 * (unit tests, sandbox smokes) — the room always passes its live phase.
 */
export function buildFrame(world: World, playerId: string, phase: MatchPhase = 'waiting'): FrameMsg {
  const ship = world.ships.get(playerId);
  const base = {
    t: world.now,
    tick: world.tick,
    ackSeq: world.inputs.ackFor(playerId),
  };
  if (spectates(phase, ship)) {
    const view = observeSpectator(world, playerId);
    // spec: true, `you` OMITTED — the client renders purely from contacts.
    return { ...base, contacts: view.contacts, events: view.events, mines: view.mines, spec: true };
  }
  const view = observe(world, playerId);
  return {
    ...base,
    you: ship ? toOwnShip(ship) : undefined,
    contacts: view.contacts,
    events: view.events,
    mines: view.mines,
  };
}
