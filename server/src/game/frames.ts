// Per-client frame construction — the fogged plane of the sync model. This is
// the single chokepoint for everything spatial leaving the server (the
// toClientView() philosophy carried forward). Contacts and events come
// EXCLUSIVELY from perception.observe() — sight tier, island LOS, radar
// paints, and per-event visibility rules all live there, so the anti-cheat
// invariant stays a unit-testable property of one function. Nothing else may
// ever put contacts or events into a frame.

import {
  DRONE_HULL_IDS,
  UPGRADE_IDS,
  type FrameMsg,
  type MatchPhase,
  type OwnShip,
  type ShipClassId,
} from '@salvo/shared';
import { observe, observeSpectator } from './perception.js';
import { slotAmmo } from './equipment/index.js';
import type { ShipRecord, World } from './world.js';

function toOwnShip(ship: ShipRecord): OwnShip {
  // Anti-cheat/invariant guard: OwnShip only ever describes a human client's
  // own ship, whose hullId is ALWAYS a ShipClassId. A drone hull id reaching
  // here means a drone record was routed to a client frame — an upstream bug,
  // so fail loud rather than emit a malformed `cls` (OwnShip.cls is narrowed to
  // ShipClassId on the wire). Contacts carry drone hull ids via signals.ts.
  if ((DRONE_HULL_IDS as readonly string[]).includes(ship.hullId)) {
    throw new Error(`toOwnShip: drone hull id '${ship.hullId}' (ship ${ship.id}) must never reach an OwnShip`);
  }
  return {
    id: ship.id,
    x: ship.state.x,
    y: ship.state.y,
    heading: ship.state.heading,
    speed: ship.state.speed,
    hp: ship.hp,
    alive: ship.alive,
    // Slot-aligned ammo (length SLOT_COUNT, null = empty slot): pool count +
    // reload timer per loadout slot in slot order (equipment/index.ts).
    ammo: slotAmmo(ship),
    // Post-advance angle == the leading edge of this tick's paint window, so
    // the client wedge visually crosses a contact the moment its blip arrives.
    sweep: ship.sweepAngle,
    // OwnShip.cls is a ShipClassId by construction: only human clients receive
    // an OwnShip, and a player ship's hullId is always its picked class (drone
    // hull ids exist only on drones, which have no client). Contacts carry the
    // full HullId instead — that lives in signals.ts's contact row.
    cls: ship.hullId as ShipClassId,
    // Upgrade counts (UPGRADE_IDS order), defensive copy. Self-syncing every
    // frame; the client derives effective stats from (cls, upg). OWN SHIP ONLY
    // — contacts/spectator payloads never carry upgrade data (anti-cheat).
    upg: [...ship.upgrades],
    // Banked points = the offer queue length (single source of truth). Only the
    // FRONT offer is surfaced, as UPGRADE_IDS indices; the rest never leaves the
    // server. Self-private (own ship only), like upg.
    pts: ship.offers.length,
    offer: ship.offers.length > 0 ? ship.offers[0].map((t) => UPGRADE_IDS.indexOf(t)) : [],
    // ms — active speed-boost window end (0 = inactive). OWNER-ONLY by
    // construction (Story 1.6): boostUntil rides `you` and NOTHING else — never
    // a Contact, blip, ballistic event, boom, or spectator payload. An enemy
    // observer reads a boosting hull only through its observed kinematics.
    boostUntil: ship.boostUntil,
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
    return {
      ...base,
      contacts: view.contacts,
      events: view.events,
      mines: view.mines,
      // litZones is OPTIONAL on the wire: omitted (not an empty array) when
      // this observer sees none, so zone-free frames stay byte-identical to
      // pre-1.7 frames (same rule on both paths).
      ...(view.litZones.length > 0 ? { litZones: view.litZones } : {}),
      // decoys is OPTIONAL the same way (Story 1.8): omitted when none, so
      // buoy-free frames stay byte-identical to pre-1.8 frames.
      ...(view.decoys.length > 0 ? { decoys: view.decoys } : {}),
      spec: true,
    };
  }
  const view = observe(world, playerId);
  // This client's OWN denied presses (Story 1.10) — SELF-PRIVATE by
  // construction: read keyed by the frame's own playerId (the boostUntil /
  // own-ship-data precedent — nothing spatial, so not a perception channel),
  // and OPTIONAL on the wire (omitted, not [], when none — the litZones
  // rule). Spectator frames never carry it: a dead ship cannot press.
  const denied = world.denialsFor(playerId);
  return {
    ...base,
    you: ship ? toOwnShip(ship) : undefined,
    contacts: view.contacts,
    events: view.events,
    mines: view.mines,
    ...(view.litZones.length > 0 ? { litZones: view.litZones } : {}),
    ...(view.decoys.length > 0 ? { decoys: view.decoys } : {}),
    ...(denied !== undefined && denied.length > 0 ? { denied: [...denied] } : {}),
  };
}
