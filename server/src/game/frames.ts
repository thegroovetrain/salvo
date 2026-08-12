// Per-client frame construction — the fogged plane of the sync model. This is
// the single chokepoint for everything spatial leaving the server (the
// toClientView() philosophy carried forward). Contacts and events come
// EXCLUSIVELY from perception.observe() — sight tier, island LOS, radar
// paints, and per-event visibility rules all live there, so the anti-cheat
// invariant stays a unit-testable property of one function. Nothing else may
// ever put contacts or events into a frame.

import {
  CONFIG,
  DRONE_HULL_IDS,
  founderDeadline,
  isAfloat,
  isSunk,
  type FrameMsg,
  type MatchPhase,
  type OwnShip,
  type ShipClassId,
} from '@salvo/shared';
import { observe, observeSpectator } from './perception.js';
import { slotAmmo } from './equipment/index.js';
import type { ShipRecord, World } from './world.js';

function toOwnShip(ship: ShipRecord, now: number): OwnShip {
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
    // PROJECTED, never mirrored (Story 5.2, amendments 11/16): `alive` is
    // isAfloat(), so it goes FALSE the instant the hull starts sinking —
    // correct for the register and the roster, and exactly why the trailing
    // `sinkingUntil` key below exists: it alone tells this client "not alive
    // but not spectating yet", the third state.
    alive: isAfloat(ship.lifecycle),
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
    // (OwnShip.upg died with the legacy upgrade economy — Story 2.8's
    // wholesale strip. The client derives effective stats from (cls, boons).)
    // Banked levels = the offer queue length (single source of truth). Only the
    // FRONT offer is surfaced, as BOON IDS (Story 2.7; deck-drawn as of 2.8),
    // defensively copied; the rest of the queue never leaves the server — and
    // the DECK itself never leaves it at all. Self-private (own ship only),
    // like boons.
    pts: ship.offers.length,
    offer: ship.offers.length > 0 ? [...ship.offers[0]] : [],
    // ms — active speed-boost window end (0 = inactive). OWNER-ONLY by
    // construction (Story 1.6): boostUntil rides `you` and NOTHING else — never
    // a Contact, blip, ballistic event, boom, or spectator payload. An enemy
    // observer reads a boosting hull only through its observed kinematics.
    boostUntil: ship.boostUntil,
    // hp — the REMAINING DAMAGE CONTROL regen pool (Eric rulings 2026-08-04);
    // 0 = nothing draining. OWNER-ONLY on exactly the boostUntil terms: it
    // rides `you` and NOTHING else — never a Contact, blip, ballistic event,
    // boom, or spectator payload. An enemy observer can never learn that a hull
    // is repairing; it reads only the hp it can actually see change. REQUIRED
    // (not optional like slowedUntil/dazzledUntil): the client's strip renders
    // the pool every frame, so a dropped key would read as "pool gone".
    repairHp: ship.repairHp,
    // Applied boon ids (Story 2.5 — dormant, [] until 2.7 grants any),
    // defensive copy. SELF-PRIVATE like upg/boostUntil: rides `you` and
    // NOTHING else — never a Contact, blip, ballistic event, boom, or
    // spectator payload (enemy builds stay hidden).
    boons: [...ship.boons],
    // Levels completed + progress toward the next, as a 0..1 fraction of
    // CONFIG.xp.levelMs (Story 2.6). SELF-PRIVATE like upg/pts/boons: both ride
    // `you` and NOTHING else — never a Contact, blip, ballistic event, boom, or
    // spectator payload. The client renders them verbatim (no XP prediction).
    lvl: ship.level,
    xp: ship.xpMs / CONFIG.xp.levelMs,
    // Active debuff windows (Story 2.8), OPTIONAL on the wire — omitted (not
    // 0) when inactive, so debuff-free frames carry no dead keys. VICTIM-
    // PRIVATE like boostUntil: they ride `you` and NOTHING else — an enemy
    // reads a fouled hull only through its observed kinematics, a dazzled one
    // not at all. slowedUntil drives the predictor's slowedKinematics fold;
    // dazzledUntil shrinks the client's own fog hole honestly.
    ...(ship.slowedUntil > now ? { slowedUntil: ship.slowedUntil } : {}),
    ...(ship.dazzledUntil > now ? { dazzledUntil: ship.dazzledUntil } : {}),
    // ms — the founder deadline while THIS hull is in the sinking window
    // (Story 5.2, amendment 16): present IFF sinking, OMITTED entirely
    // otherwise — never an `undefined` value (the slowedUntil precedent
    // above; msgpack drops nothing silently). SELF-PRIVATE BY CONSTRUCTION:
    // rides `you` and NOTHING else — never a Contact, blip, event or
    // spectator payload — so the master perception invariant keeps exactly
    // SIX declared exceptions. Derived through the shared founderDeadline()
    // (since + CONFIG.ship.sinkingWindowMs), the same math the sim's founder
    // edge runs, so the countdown the client renders IS the deadline the
    // server enforces.
    ...(ship.lifecycle.kind === 'sinking'
      ? { sinkingUntil: founderDeadline(ship.lifecycle.since) }
      : {}),
  };
}

/**
 * THE spectator gate (anti-cheat sensitive): unfogged frames go ONLY to an
 * observer whose life is OVER during the active phase, or to everyone once
 * the match is finished (no way back into play either way). Every other
 * observer — alive OR SINKING in active, anyone in waiting/countdown (lobby
 * keeps the one fogged code path), a fresh wreck awaiting respawn in waiting —
 * stays fully fogged.
 *
 * KEYED ON isSunk, NOT !isAfloat (Story 5.2 — amendment 7's recorded warning,
 * discharged): a sinking captain is not-afloat for the whole five-second
 * window, and `!isAfloat` here would hand them the unfogged full-map view for
 * all of it — precisely the anti-cheat widening the master perception
 * invariant asserts against. A sinking hull's frame stays FOGGED and still
 * carries `you` (with `sinkingUntil`), so the dying captain aims through the
 * same fog as everyone else until the founder edge lands.
 *
 * The `finished` branch deliberately stays first (amendment 17): a match may
 * finish while a hull is still sinking, and the results flow — including this
 * unfogged view — supersedes that hull's remaining window.
 */
function spectates(phase: MatchPhase, ship: ShipRecord | undefined): boolean {
  if (phase === 'finished') return true;
  return phase === 'active' && ship !== undefined && isSunk(ship.lifecycle);
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
    you: ship ? toOwnShip(ship, world.now) : undefined,
    contacts: view.contacts,
    events: view.events,
    mines: view.mines,
    ...(view.litZones.length > 0 ? { litZones: view.litZones } : {}),
    ...(view.decoys.length > 0 ? { decoys: view.decoys } : {}),
    ...(denied !== undefined && denied.length > 0 ? { denied: [...denied] } : {}),
  };
}
