// Wire contract between client and server. Field names are kept short (bytes on
// the wire) but readable. Two planes per the plan:
//   - Public plane: Colyseus schema (roster/mapSeed/mapRadius) — not defined here.
//   - Fogged plane: per-client FrameMsg built by the perception chokepoint.
// Messages: "w" welcome (once), "i" input (client->server), "f" frame
// (server->client, every tick).

import type { GameConfig } from './constants.js';

/** Short message-name tags used on the Colyseus channel. */
export const MSG = {
  welcome: 'w',
  input: 'i',
  frame: 'f',
} as const;

/** Weapon selector index. 0 = guns, 1 = torpedoes, 2 = mines. */
export type WeaponId = 0 | 1 | 2;

/** Named weapon indices (keep in sync with WeaponId). */
export const WEAPON = { gun: 0, torpedo: 1, mine: 2 } as const;

/** A circle: island obstacle or spawn ring. */
export interface Circle {
  x: number; // u
  y: number; // u
  r: number; // u
}

/**
 * Client -> server input ("i"), sent every tick (~50ms) and on key edges,
 * rate-capped server-side. Server keeps the latest seq per client and clamps
 * every field. `seq`/frame `ackSeq` future-proof the wire for v2 reconcile.
 */
export interface InputMsg {
  seq: number; // monotonic per-client sequence
  throttle: number; // -1..1
  rudder: number; // -1..1
  aim: number; // rad — desired firing bearing (world space)
  fire: boolean; // fire held this tick
  weapon: WeaponId; // selected weapon
}

/**
 * Your own ship as seen in a frame — full, unfogged. `sweep` is the current
 * radar angle (rad), used to draw the sweep wedge client-side.
 *
 * `cooldowns` is a 3-element array indexed by WeaponId (ms remaining until that
 * weapon can fire again, 0 = ready to fire now):
 *   [0] guns     — the SOONEST-ready gun mount's remaining reload. Guns have
 *                  two independent broadside mounts; this surfaces the minimum
 *                  of their cooldowns so the HUD/UX reads "when can I next put a
 *                  shell out" regardless of which battery bears. (Per-mount
 *                  timers stay server-side; the wire carries only the min.)
 *   [1] torpedoes — 0 until torpedoes land (step 12).
 *   [2] mines     — 0 until mines land (step 12).
 */
export interface OwnShip {
  id: string;
  x: number; // u
  y: number; // u
  heading: number; // rad
  speed: number; // u/s (signed)
  hp: number;
  alive: boolean;
  weapon: WeaponId; // currently selected
  cooldowns: number[]; // ms remaining, indexed by WeaponId (see above)
  sweep: number; // rad — current radar sweep angle
}

/** A ship revealed by true-sight this tick (position is live, not stale). */
export interface Contact {
  id: string;
  x: number; // u
  y: number; // u
  heading: number; // rad
  speed: number; // u/s
}

// --- GameEvent union (discriminated on `k`) --------------------------------

/** Radar paint: a timestamped stale snapshot of a contact's position. */
export interface BlipEvent {
  k: 'blip';
  id: string;
  x: number; // u — position at paint time
  y: number; // u
  t: number; // ms — server time the blip was painted (drives phosphor decay)
}

/**
 * A ballistic projectile entering your vision, sent once — position and
 * velocity AT REVEAL TIME (launch for the owner, first-sight for everyone
 * else). The client dead-reckons it: pos = (x,y) + (vx,vy) * (serverNow - t),
 * terminating on a matching `boom` OR a client-derived max lifetime (per-kind,
 * computed from CONFIG range/speed) OR when it leaves the client's own sight
 * bubble. Shared shape for shells and torpedoes.
 *
 * ANTI-CHEAT — no range-derivable field may EVER return to this shape (no
 * `ttl`, no `distLeft`, no launch position). CONFIG ships shellRange/shellSpeed
 * to every client, so any remaining-flight quantity on a fogged reveal lets a
 * modified client solve back to the (hidden) muzzle: traveled = range −
 * ttl·speed, launch = pos − unit(v)·traveled. A constant-free wire shape
 * ({id,x,y,vx,vy,t}) cannot encode traveled distance, so it cannot leak a
 * fogged shooter's position. Termination stays a client concern.
 */
export interface BallisticEvent {
  k: 'shell' | 'torp';
  id: string; // projectile id (matches a later boom)
  x: number; // u — position at reveal time (NOT launch, on a first-sight reveal)
  y: number; // u
  vx: number; // u/s
  vy: number; // u/s
  t: number; // ms — reveal server time
}

/**
 * An explosion at a point (shell/torp impact or mine detonation). `id` matches
 * the originating projectile so the client terminates its dead-reckoned render.
 * `hit` is the struck ship's id, but ONLY when the victim is a sighted contact
 * of this observer (or the observer IS the victim) — see perception.ts. It
 * drives the hit spark + hull flash. Its absence means either a splash
 * (island/range exhaustion → splash ring) OR an impact whose victim this
 * observer cannot currently see (anti-cheat: a hull straddling the sight edge
 * must not leak the victim's id); the client plays a generic impact either way.
 */
export interface BoomEvent {
  k: 'boom';
  id?: string; // originating projectile/mine id, if any
  hit?: string; // struck ship id, when this boom is a ship impact
  x: number; // u
  y: number; // u
}

/** A ship took damage. `hp` is its resulting hit points. */
export interface DamageEvent {
  k: 'dmg';
  id: string;
  amount: number; // hp lost
  hp: number; // hp remaining
}

/** A ship sank. `by` is the killer's id, if attributable. */
export interface SunkEvent {
  k: 'sunk';
  id: string;
  by?: string;
}

/** A ship (re)spawned at a position. */
export interface SpawnEvent {
  k: 'spawn';
  id: string;
  x: number; // u
  y: number; // u
}

/**
 * A mine visible to this viewer. Visibility is resolved per client by the
 * perception chokepoint (owner always; enemies only inside sight range).
 * `mine_owned` = the viewer owns this mine (render it as friendly).
 */
export interface MineEvent {
  k: 'mine';
  id: string;
  x: number; // u
  y: number; // u
  mine_owned: boolean;
}

/** A previously-seen mine is gone (triggered or despawned). */
export interface MineGoneEvent {
  k: 'mineGone';
  id: string;
}

/** Per-tick, per-client events. Discriminated union on `k`. */
export type GameEvent =
  | BlipEvent
  | BallisticEvent
  | BoomEvent
  | DamageEvent
  | SunkEvent
  | SpawnEvent
  | MineEvent
  | MineGoneEvent;

/**
 * Server -> client per-tick frame ("f"). Built per client by buildFrame().
 * Spectator frames set `spec: true`, omit `you`, and carry every ship in
 * `contacts` unfogged (no blips needed).
 */
export interface FrameMsg {
  t: number; // ms — server time this frame was built
  tick: number; // server tick counter
  ackSeq: number; // highest input seq applied for this client
  you?: OwnShip; // omitted for spectators
  contacts: Contact[];
  events: GameEvent[];
  spec?: true; // spectator (unfogged) frame
}

/**
 * Server -> client handshake ("w"), sent once on join. Carries the map seed for
 * deterministic client-side island generation plus a CONFIG snapshot so the
 * client shares every tunable.
 */
export interface WelcomeMsg {
  sessionId: string;
  mapSeed: number;
  mapRadius: number; // u
  playerCap: number; // the cap the server sized the map against (feeds generateMap)
  t: number; // ms — server time at welcome (seeds the client clock)
  config: GameConfig;
}
