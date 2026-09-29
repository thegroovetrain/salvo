// ai/torpedoThreat.ts — THE INBOUND-TORPEDO READ (Story 8.15, amendment 115).
//
// DAMAGE CUT is PROACTIVE (Eric, 2026-09-29): one of its two triggers is an
// enemy torpedo the bot can SEE heading at its hull and within 150 u. This
// module is that read, over the bot's own fogged view and nothing else.
//
// WHY A MEMORY. A `torp` reveal is sent ONCE PER VISIT of the observer's
// detect gate (signals.ts `ballisticSignal`, perception.ballisticScan), and a
// `torpU` only when a homing fish's heading drifts. So a fish first detected
// far out appears in exactly one tick's view; to know it is 150 u away three
// seconds later the bot has to dead-reckon it, exactly as a human client
// does. `mind.torps` is that dead-reckoning table: written from `torp` /
// `torpU`, deleted by the `boom` carrying the fish's id, and aged out once
// the fish must have run its maximum course.
//
// OWN FISH. A reveal names no owner (anti-cheat: constant-free wire shape).
// The owner's reveal arrives on the LAUNCH tick, just clear of its own
// silhouette and running away from it — so a fish FIRST seen within the
// launch radius and receding is marked own and never counts (no friendly
// fire: an own torpedo can never damage its own hull, even if its homing
// later swings it back across the bow).

import { CONFIG, hullSilhouette, polygonMaxRadius, type GameEvent } from '@salvo/shared';
import type { BotMind, BotSelf, SeenTorpedo } from './types.js';

/** u — Eric's number (amendment 115, 2026-09-29): an inbound enemy torpedo
 *  closer than this, on a collision line, is a DAMAGE CUT trigger. */
export const DAMAGE_CUT_TORPEDO_U = 150;

/** u — the hull's bounding-circle radius. DAMAGE CUT is the Battleship's Shift
 *  alone (class-pinned, amendments 99-102), so the silhouette is that hull's;
 *  the bot's self-read carries no hull id. */
const BS_HULL_RADIUS_U = polygonMaxRadius(hullSilhouette('battleship'));

/** u — a fish's ray passing within this of the hull centre is a collision
 *  line: the silhouette's bounding radius plus the torpedo's own hit radius. */
const COLLISION_RADIUS_U = BS_HULL_RADIUS_U + CONFIG.torpedo.hitRadius;

/** u — bot-internal slack on the launch radius: at most one sim tick of run
 *  for any torpedo line (a supercav fish included), with room to spare. */
const OWN_LAUNCH_SLACK_U = 20;

/** u — how far from the centre an OWN launch-tick reveal can sit: the spawn
 *  offset (hull edge + hitRadius + spawnClearance) plus the slack. */
const OWN_LAUNCH_U = COLLISION_RADIUS_U + CONFIG.torpedo.spawnClearance + OWN_LAUNCH_SLACK_U;

/** The fish's dead-reckoned position at `now`. */
function reckon(f: SeenTorpedo, now: number): { x: number; y: number } {
  const dt = (now - f.t) / 1000;
  return { x: f.x + f.vx * dt, y: f.y + f.vy * dt };
}

/** Has the fish run past its longest possible course (the homing range at
 *  its own speed)? Then it is spent, whether or not its boom was seen. */
function expired(f: SeenTorpedo, now: number): boolean {
  const speed = Math.hypot(f.vx, f.vy);
  if (speed <= 0) return true;
  return now - f.t > (CONFIG.torpedo.homingMaxRangeU / speed) * 1000;
}

/** Is a fish at `p` moving with (vx, vy) running AWAY from the hull? */
function receding(self: BotSelf, p: { x: number; y: number }, vx: number, vy: number): boolean {
  return (p.x - self.state.x) * vx + (p.y - self.state.y) * vy >= 0;
}

/** A first-sight reveal that is this hull's own launch (see header). */
function ownLaunch(self: BotSelf, e: SeenTorpedo): boolean {
  const d = Math.hypot(e.x - self.state.x, e.y - self.state.y);
  return d <= OWN_LAUNCH_U && receding(self, e, e.vx, e.vy);
}

/** Fold one event into the table. */
function foldTorpEvent(torps: Map<string, SeenTorpedo>, self: BotSelf, e: GameEvent): void {
  if (e.k === 'boom') {
    if (e.id !== undefined) torps.delete(e.id);
    return;
  }
  if (e.k !== 'torp' && e.k !== 'torpU') return;
  const prev = torps.get(e.id);
  const next: SeenTorpedo = { x: e.x, y: e.y, vx: e.vx, vy: e.vy, t: e.t, own: false };
  next.own = prev !== undefined ? prev.own : ownLaunch(self, next);
  torps.set(e.id, next);
}

/**
 * Fold this tick's view into `mind.torps` (created lazily; released with the
 * life by the driver). Called once per folded view, from tactics' ingest.
 */
export function noteTorpedoes(mind: BotMind, self: BotSelf, now: number): void {
  if (mind.view === null) return;
  const torps = mind.torps ?? new Map<string, SeenTorpedo>();
  mind.torps = torps;
  for (const e of mind.view.events) foldTorpEvent(torps, self, e);
  for (const [id, f] of torps) if (expired(f, now)) torps.delete(id);
}

/** Is this one fish an inbound threat: an enemy's, inside 150 u, closing,
 *  and its velocity ray passing within the hull's collision radius? */
function threatens(self: BotSelf, f: SeenTorpedo, now: number): boolean {
  if (f.own) return false;
  const p = reckon(f, now);
  const rx = self.state.x - p.x;
  const ry = self.state.y - p.y;
  if (Math.hypot(rx, ry) > DAMAGE_CUT_TORPEDO_U) return false;
  if (receding(self, p, f.vx, f.vy)) return false;
  const speed = Math.hypot(f.vx, f.vy);
  return Math.abs(rx * f.vy - ry * f.vx) / speed <= COLLISION_RADIUS_U;
}

/** Any remembered enemy torpedo inbound on this hull within 150 u? */
export function torpedoInbound(self: BotSelf, mind: BotMind, now: number): boolean {
  if (mind.torps === undefined || mind.torps === null) return false;
  for (const f of mind.torps.values()) if (threatens(self, f, now)) return true;
  return false;
}
