// Per-client frame construction — the fogged plane of the sync model. This is
// the single chokepoint for everything spatial leaving the server (the
// toClientView() philosophy carried forward). Contacts and events come
// EXCLUSIVELY from perception.observe() — sight tier, island LOS, radar
// paints, and per-event visibility rules all live there, so the anti-cheat
// invariant stays a unit-testable property of one function. Nothing else may
// ever put contacts or events into a frame.

import type { FrameMsg, OwnShip } from '@salvo/shared';
import { observe } from './perception.js';
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
 * Build the per-tick frame for one client. Call once per client per tick:
 * observe() marks shells as seen per observer (exactly-once event semantics).
 */
export function buildFrame(world: World, playerId: string): FrameMsg {
  const ship = world.ships.get(playerId);
  const view = observe(world, playerId);
  return {
    t: world.now,
    tick: world.tick,
    ackSeq: world.inputs.ackFor(playerId),
    you: ship ? toOwnShip(ship) : undefined,
    contacts: view.contacts,
    events: view.events,
    mines: view.mines,
  };
}
