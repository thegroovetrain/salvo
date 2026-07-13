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
//     velocity / remaining ttl — the client dead-reckons from there, so a
//     shell fired outside your bubble materializes at your sight boundary,
//     never at its (hidden) launch point. World-emitted shell events are
//     dropped here and re-issued per observer.
//   - boom:  visible iff the boom location is within sight + LOS, OR the boom
//     struck the observer (`hit === me`). The shell's owner does NOT get an
//     out-of-sight boom — hit confirmation beyond sight would leak contact
//     presence; their dead-reckoned shell just expires by ttl.
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
  type Circle,
  type Contact,
  type GameEvent,
  type ShellState,
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

/** Remaining flight time (ms) of a live shell, for first-sight re-emission. */
function remainingTtl(shell: ShellState): number {
  const speed = Math.hypot(shell.vx, shell.vy);
  return speed > 0 ? (shell.distLeft / speed) * 1000 : 0;
}

/**
 * Per-observer ballistic events: every live shell this observer has not been
 * told about yet, if the owner (always) or first visible (sight + LOS), with
 * CURRENT params — see the header for why launch params must not leak.
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
      ttl: remainingTtl(shell),
    });
  }
  return out;
}

/** Apply the per-kind visibility rules (header) to one world-emitted event. */
function worldEventVisible(world: World, me: ShipRecord, e: GameEvent): boolean {
  const islands = world.map.islands;
  switch (e.k) {
    case 'boom':
      return e.hit === me.id || pointSighted(me.state, e, islands);
    case 'dmg':
      return e.id === me.id;
    case 'sunk': {
      if (e.id === me.id) return true;
      const wreck = world.ships.get(e.id);
      return wreck !== undefined && pointSighted(me.state, wreck.state, islands);
    }
    case 'spawn':
      return e.id === me.id || pointSighted(me.state, e, islands);
    default:
      // shell (re-issued per observer above), torp/mine/mineGone (step 12),
      // blip (never world-emitted): fail closed.
      return false;
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
    if (worldEventVisible(world, me, e)) events.push(e);
  }
  events.push(...shellEvents(world, me));
  events.push(...blips);
  return { contacts, events };
}
