// Per-client frame construction — the fogged plane of the sync model. This is
// the single chokepoint for everything spatial leaving the server (the
// toClientView() philosophy carried forward).
//
// ============================ STEP 9 SEAM ==================================
// FOG OF WAR IS NOT IMPLEMENTED YET. visibleContacts()/visibleEvents() below
// currently return EVERYTHING (all other living ships, all events) — this is
// the deliberate interp-checkpoint behavior from build-order step 5. Step 9
// replaces the bodies of exactly these two functions with perception.ts
// filtering (sight range, island LOS, radar paints). Nothing else may ever
// put contacts or events into a frame — keep this the only route, so the
// anti-cheat invariant stays a unit-testable property of two functions.
// ===========================================================================

import type { Contact, FrameMsg, GameEvent, OwnShip } from '@salvo/shared';
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
    cooldowns: [0, 0, 0], // real per-weapon cooldowns arrive with combat (step 8)
    sweep: ship.sweepAngle,
  };
}

/**
 * STEP 9 SEAM — perception filtering goes here and ONLY here.
 * Interp checkpoint: every other living ship is a contact, unfogged.
 */
function visibleContacts(world: World, viewerId: string): Contact[] {
  const contacts: Contact[] = [];
  for (const ship of world.ships.values()) {
    if (ship.id === viewerId || !ship.alive) continue;
    contacts.push({
      id: ship.id,
      x: ship.state.x,
      y: ship.state.y,
      heading: ship.state.heading,
      speed: ship.state.speed,
    });
  }
  return contacts;
}

/**
 * STEP 9 SEAM — per-viewer event filtering (shell visibility, mine ownership,
 * blips) goes here and ONLY here. Interp checkpoint: all events, everyone.
 */
function visibleEvents(world: World, _viewerId: string): GameEvent[] {
  return [...world.tickEvents];
}

/** Build the per-tick frame for one client. */
export function buildFrame(world: World, playerId: string): FrameMsg {
  const ship = world.ships.get(playerId);
  return {
    t: world.now,
    tick: world.tick,
    ackSeq: world.inputs.ackFor(playerId),
    you: ship ? toOwnShip(ship) : undefined,
    contacts: visibleContacts(world, playerId),
    events: visibleEvents(world, playerId),
  };
}
