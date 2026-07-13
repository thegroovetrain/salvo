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
 * Your own ship as seen in a frame — full, unfogged. `cooldowns` is indexed by
 * WeaponId (ms remaining, 0 = ready). `sweep` is the current radar angle (rad),
 * used to draw the sweep wedge client-side.
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
  cooldowns: number[]; // ms remaining, indexed by WeaponId
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
 * A ballistic projectile entering your vision, sent once. The client
 * dead-reckons it: pos = (x,y) + (vx,vy) * (serverNow - t), until `ttl`
 * elapses or a matching `boom` arrives. Shared shape for shells and torpedoes.
 */
export interface BallisticEvent {
  k: 'shell' | 'torp';
  id: string; // projectile id (matches a later boom)
  x: number; // u — launch position
  y: number; // u
  vx: number; // u/s
  vy: number; // u/s
  t: number; // ms — launch server time
  ttl: number; // ms — lifetime before it expires
}

/** An explosion at a point (shell/torp impact or mine detonation). */
export interface BoomEvent {
  k: 'boom';
  id?: string; // originating projectile/mine id, if any
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
  t: number; // ms — server time at welcome (seeds the client clock)
  config: GameConfig;
}
