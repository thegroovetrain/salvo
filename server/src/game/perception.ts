// Per-observer visibility — the fog-of-war core and the anti-cheat boundary.
// One pure pass per observer computes everything that observer may know this
// tick; frames.ts is the only caller, so nothing spatial can leave the server
// without going through observe(). The invariant is unit-tested property-style
// in __tests__/perception.test.ts: no contact or event in any frame may
// reference anything outside sight ∪ (this-tick radar paints).
//
// THE LOS RULE (one rule for everything): a point is line-of-sight-clear from
// the observer iff the segment observer→point crosses no island circle
// (segCircleHit). Sight, radar, shells, booms, spawns, and sinks all use it.
//
// THE TWO VISION TIERS:
//   - Sight:  dist ≤ CONFIG.vision.sight (boundary INCLUSIVE) ∧ LOS-clear.
//             Live contacts — position/heading/speed straight from the sim.
//   - Radar:  sight < dist ≤ radar (both boundaries as written) ∧ LOS-clear
//             ∧ the observer's beam crossed the target's bearing this tick:
//             wrapPositive(bearing − prev) < wrapPositive(cur − prev), the
//             half-open window [prev, cur) — wrap-safe, and each bearing falls
//             in exactly one window per revolution. Paints become `blip`
//             events carrying position-at-paint-time; the server keeps no blip
//             history (phosphor decay is client render math).
//             ONLY SHIPS PAINT. Torpedoes and mines (step 12) never appear on
//             radar — pairScan iterates ships only, by construction.
//
// VISIBILITY RULE PER EVENT KIND (documented per the plan):
//   - shell: emitted per observer, exactly once (ShipRecord.seenShells). The
//     OWNER always gets it at launch. Everyone else gets it when the shell
//     FIRST becomes visible (within sight + LOS), with CURRENT position /
//     velocity ONLY — never a range-derivable field (no ttl/distLeft). The
//     client dead-reckons from there, so a shell fired outside your bubble
//     materializes at your sight boundary, never at its (hidden) launch point;
//     and a constant-free wire shape cannot be solved back to the muzzle. See
//     BallisticEvent's anti-cheat note. World-emitted shell events are dropped
//     here and re-issued per observer.
//   - boom:  visible iff the boom location is within sight + LOS, OR the boom
//     struck the observer (`hit === me`). The shell's owner does NOT get an
//     out-of-sight boom — hit confirmation beyond sight would leak contact
//     presence; their dead-reckoned shell just expires by client lifetime.
//     Even when the boom IS visible, its `hit` (victim id) is stripped unless
//     the victim's CENTER is itself sighted (boomForObserver) — a hull can
//     straddle the sight edge with its center in fog, and emitting the id there
//     would leak the victim's identity.
//   - dmg:   victim-private (only the damaged ship hears its hp).
//   - sunk:  visible to the victim itself, and to anyone who can see the
//     sinking ship's position (wreck position, sight + LOS). Everyone still
//     learns alive/kills/deaths from the public roster schema — sinking is
//     public knowledge, its LOCATION is not.
//   - spawn: visible to the spawner itself, and to anyone who can see the
//     spawn point (sight + LOS).
//   - blip:  generated here, per observer (see radar tier above).
//   - torp/mine/mineGone: not produced yet (step 12); dropped defensively so
//     a future world emission cannot leak by default.
//
// OBSERVER MODEL: an observer with a ship record observes from its position,
// alive or sunk — a fresh wreck keeps seeing its surroundings for the 3s
// respawn delay (spectator frames are a later step). A client with no ship at
// all sees nothing (fail-closed).

import {
  CONFIG,
  bearing,
  segCircleHit,
  wrapPositive,
  type BlipEvent,
  type BallisticEvent,
  type BoomEvent,
  type Circle,
  type Contact,
  type GameEvent,
  type SunkEvent,
  type Vec2,
} from '@salvo/shared';
import type { ShipRecord, World } from './world.js';

const SIGHT = CONFIG.vision.sight;
const RADAR = CONFIG.vision.radar;
const SIGHT2 = SIGHT * SIGHT;
const RADAR2 = RADAR * RADAR;

/** Everything one observer may know this tick. */
export interface PerceptionView {
  contacts: Contact[];
  events: GameEvent[];
}

/** True iff the segment a→b crosses no island circle (the one LOS rule). */
export function losClear(a: Vec2, b: Vec2, islands: readonly Circle[]): boolean {
  for (const isle of islands) {
    if (segCircleHit(a, b, isle, isle.r) !== null) return false;
  }
  return true;
}

/** Sight-tier test for a point: within sight range (inclusive) + LOS-clear. */
function pointSighted(me: Vec2, p: Vec2, islands: readonly Circle[]): boolean {
  const dx = p.x - me.x;
  const dy = p.y - me.y;
  return dx * dx + dy * dy <= SIGHT2 && losClear(me, p, islands);
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

/**
 * The shared pair loop (per plan): one dist² per observer/target pair decides
 * both tiers. Sight wins inside its radius (a LOS-blocked ship inside sight is
 * simply invisible — it is not in the radar annulus, so it cannot paint).
 */
function pairScan(world: World, me: ShipRecord): { contacts: Contact[]; blips: BlipEvent[] } {
  const contacts: Contact[] = [];
  const blips: BlipEvent[] = [];
  const my = me.state;
  for (const ship of world.ships.values()) {
    if (ship.id === me.id || !ship.alive) continue;
    const s = ship.state;
    const dx = s.x - my.x;
    const dy = s.y - my.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > RADAR2) continue;
    if (d2 <= SIGHT2) {
      if (losClear(my, s, world.map.islands)) {
        contacts.push({ id: ship.id, x: s.x, y: s.y, heading: s.heading, speed: s.speed });
      }
    } else if (sweptThisTick(me, bearing(my, s)) && losClear(my, s, world.map.islands)) {
      blips.push({ k: 'blip', id: ship.id, x: s.x, y: s.y, t: world.now });
    }
  }
  return { contacts, blips };
}

/**
 * Per-observer ballistic events: every live shell this observer has not been
 * told about yet, if the owner (always) or first visible (sight + LOS), with
 * CURRENT position/velocity only — NO range-derivable field (no ttl). See the
 * BallisticEvent anti-cheat note: a constant-free wire shape cannot leak the
 * fogged launch point. The client terminates the render itself (boom, a
 * CONFIG-derived per-kind max lifetime, or leaving its own sight bubble).
 */
function shellEvents(world: World, me: ShipRecord): BallisticEvent[] {
  const out: BallisticEvent[] = [];
  for (const shell of world.shells.values()) {
    if (me.seenShells.has(shell.id)) continue;
    const own = shell.ownerId === me.id;
    if (!own && !pointSighted(me.state, shell, world.map.islands)) continue;
    me.seenShells.add(shell.id);
    out.push({
      k: 'shell',
      id: shell.id,
      x: shell.x,
      y: shell.y,
      vx: shell.vx,
      vy: shell.vy,
      t: world.now,
    });
  }
  return out;
}

/**
 * A boom for this observer, or null if invisible. Visible iff the impact point
 * is sighted OR the observer is the victim. The `hit` (victim id) is then kept
 * ONLY when the victim's CENTER is itself sighted (or the observer IS the
 * victim): a hull can straddle the sight edge with its center in fog, and
 * emitting `hit` there would leak the victim's id (reviewer finding 2). A
 * hit-less boom just plays a generic impact/splash on the client.
 */
function boomForObserver(world: World, me: ShipRecord, e: BoomEvent): BoomEvent | null {
  const islands = world.map.islands;
  if (e.hit !== me.id && !pointSighted(me.state, e, islands)) return null;
  if (!e.hit || e.hit === me.id) return e;
  const victim = world.ships.get(e.hit);
  if (victim && pointSighted(me.state, victim.state, islands)) return e;
  return { k: 'boom', id: e.id, x: e.x, y: e.y }; // impact visible, victim id stripped
}

/** A sunk event for this observer, or null: victim itself, or wreck sighted. */
function sunkForObserver(world: World, me: ShipRecord, e: SunkEvent): SunkEvent | null {
  if (e.id === me.id) return e;
  const wreck = world.ships.get(e.id);
  return wreck !== undefined && pointSighted(me.state, wreck.state, world.map.islands) ? e : null;
}

/**
 * Apply the per-kind visibility rules (header) to one world-emitted event,
 * returning the event to emit to this observer (possibly sanitized) or null if
 * the observer may not know about it at all.
 */
function worldEventForObserver(world: World, me: ShipRecord, e: GameEvent): GameEvent | null {
  switch (e.k) {
    case 'boom':
      return boomForObserver(world, me, e);
    case 'dmg':
      return e.id === me.id ? e : null;
    case 'sunk':
      return sunkForObserver(world, me, e);
    case 'spawn':
      return e.id === me.id || pointSighted(me.state, e, world.map.islands) ? e : null;
    default:
      // shell (re-issued per observer above), torp/mine/mineGone (step 12),
      // blip (never world-emitted): fail closed.
      return null;
  }
}

/**
 * Build the full per-observer view for this tick. The ONLY producer of frame
 * contacts/events (frames.ts is its only caller). A viewer with no ship sees
 * nothing — fail-closed until spectator frames land (step 14).
 */
export function observe(world: World, observerId: string): PerceptionView {
  const me = world.ships.get(observerId);
  if (!me) return { contacts: [], events: [] };
  const { contacts, blips } = pairScan(world, me);
  const events: GameEvent[] = [];
  for (const e of world.tickEvents) {
    const emitted = worldEventForObserver(world, me, e);
    if (emitted) events.push(emitted);
  }
  events.push(...shellEvents(world, me));
  events.push(...blips);
  return { contacts, events };
}
