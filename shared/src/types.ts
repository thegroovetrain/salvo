// Wire contract between client and server. Field names are kept short (bytes on
// the wire) but readable. Two planes per the plan:
//   - Public plane: Colyseus schema (roster/mapSeed/mapRadius) — not defined here.
//   - Fogged plane: per-client FrameMsg built by the perception chokepoint.
// Messages: "w" welcome (once), "i" input (client->server), "f" frame
// (server->client, every tick).

import type { GameConfig, HullId, ShipClassId, UpgradeId } from './constants.js';

/** Short message-name tags used on the Colyseus channel. */
export const MSG = {
  welcome: 'w',
  input: 'i',
  frame: 'f',
  results: 'r',
  spend: 'u', // client->server: spend one banked point (see SpendMsg)
} as const;

/**
 * Match lifecycle phase (public plane — mirrored on the schema as matchPhase).
 * waiting: ready room, drive/aim/fire freely but ALL damage suppressed.
 * countdown: ≥ minHumans present, room locked, countdownEndT set.
 * active: damage live, respawn disabled (death → spectate), storm running.
 * finished: winner decided; results broadcast; room disposes after the overlay.
 */
export type MatchPhase = 'waiting' | 'countdown' | 'active' | 'finished';

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
  /**
   * Cumulative per-connection click counter (one shot per click). A value
   * newer than the last one the server consumed requests exactly ONE shot;
   * clicks during reload are consumed, not queued. A counter (not an edge
   * flag) survives the server's latest-input-wins coalescing, and a spoofed
   * jump (`fireSeq += 1000`) gains nothing — the server fires at most one
   * gated attempt per tick.
   */
  fireSeq: number;
  /**
   * u — ship→cursor distance at sample time. Guns splash their shell at this
   * point along the aim bearing (server-clamped to max gun range); torpedoes
   * and mines ignore it (direction-only).
   */
  aimDist: number;
  weapon: WeaponId; // selected weapon
}

/**
 * Client -> server spend ("u"): consume one banked point. `choice` is 0..2 for
 * the current offer's slot (see OwnShip.offer / UpgradeOffer) or HEAL_CHOICE for
 * the always-available heal. Deliberately a DISCRETE reliable message, NOT a
 * field on the per-tick InputMsg: the latest-input-wins coalescing there would
 * silently drop back-to-back spends (two quick kills → two spends).
 */
export interface SpendMsg {
  choice: number; // 0..2 = offer slot, HEAL_CHOICE = heal
}

/** SpendMsg.choice value that spends a point on healing instead of an upgrade. */
export const HEAL_CHOICE = 3;

/**
 * One weapon's ammo pool + reload timer. Replaces the old per-mount cooldown
 * arrays: each weapon has ONE pool (`n` = rounds ready to fire, 0 = empty) and
 * ONE reload timer (`reloadMsLeft` = ms until the next round tops up the pool;
 * 0 = idle, i.e. either full or between-shots with nothing pending). The reload
 * ticks whenever the pool is below max, adds +1 per fill, and restarts (with
 * overshoot carry) while still below max — see server weapons/ammo.ts.
 */
export interface WeaponAmmo {
  n: number; // rounds currently loaded (0 = empty)
  reloadMsLeft: number; // ms until the next round tops up the pool (0 = idle)
}

/**
 * Your own ship as seen in a frame — full, unfogged. `sweep` is the current
 * radar angle (rad), used to draw the sweep wedge client-side.
 *
 * `ammo` is a WeaponAmmo[] indexed by WeaponId — for each weapon, its pool
 * count + reload timer:
 *   [0] guns     — shared broadside pool (maxAmmo rounds; a click fires the one
 *                  mount whose arc bears on the aim).
 *   [1] torpedoes — bow-tube pool.
 *   [2] mines     — drop pool (distinct from the live-mine board cap).
 * maxAmmo / reloadMs are NOT on the wire — the client reads them from CONFIG
 * (and, after upgrades, from its own effective-stats computation). The client
 * derives the reload fraction from reloadMsLeft / CONFIG.reloadMs.
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
  ammo: WeaponAmmo[]; // per weapon: pool count + reload timer (see above)
  sweep: number; // rad — current radar sweep angle
  cls: ShipClassId; // ship class (drives hull dims / kinematics / max hp client-side)
  /**
   * Upgrade counts, indexed by UPGRADE_IDS order. Self-syncing every frame (no
   * event-replay problem across match resets); the client feeds (cls, upg)
   * through the shared effectiveStats() — the desync firewall. ANTI-CHEAT:
   * upgrade counts appear ONLY here, on your own ship — never on a Contact,
   * blip, ballistic event, boom, or spectator contact (enemy builds are hidden;
   * a sighted hull's class size is the only legitimate tell).
   */
  upg: number[];
  /**
   * Banked upgrade points not yet spent (one per kill). Like `upg`, this rides
   * `you` ONLY — self-private by construction, never on a Contact or spectator
   * payload.
   */
  pts: number;
  /**
   * The FRONT queued offer, as indices into UPGRADE_IDS (three distinct
   * categories; see sim/offers.ts). `[]` when pts is 0. Only the front offer is
   * ever surfaced — the rest of the queue never leaves the server.
   */
  offer: number[];
}

/** A ship revealed by true-sight this tick (position is live, not stale). */
export interface Contact {
  id: string;
  x: number; // u
  y: number; // u
  heading: number; // rad
  speed: number; // u/s
  /**
   * Hull id — a sighted hull's silhouette is legitimately visible. Wider than
   * OwnShip.cls: contacts can also be drones (droneSmall/Medium/Large), which
   * are never a class YOU can be.
   */
  cls: HullId;
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
 * A kill-reward upgrade grant. KILLER-PRIVATE: `id` is the receiving (killer)
 * ship's id, and perception forwards the event ONLY to that observer — the
 * exact mechanism of the victim-private `dmg` rule (see perception.ts). Since
 * the sole recipient is the killer itself, `id` is always the receiver's own
 * id and leaks nothing. Purely UX (toast + tone): the authoritative counts
 * self-sync every frame via OwnShip.upg.
 */
export interface UpgradeEvent {
  k: 'upg';
  id: string; // the killer (= the only observer this is ever delivered to)
  type: UpgradeId;
}

/**
 * A banked point earned (one per kill). SELF-PRIVATE: `id` is the earning ship's
 * id, and perception forwards it ONLY to that observer — the same mechanism as
 * the killer-private `upg` event. Purely UX (toast + tone): the authoritative
 * count self-syncs every frame via OwnShip.pts.
 */
export interface PointEvent {
  k: 'pt';
  id: string; // the earner (= the only observer this is ever delivered to)
}

/**
 * A heal spend was applied. SELF-PRIVATE (forwarded only to `id`, like `pt`).
 * `amount` is the ACTUAL clamped hp delta (0 at full hp), so the client can toast
 * the real gain; the authoritative hp self-syncs every frame via OwnShip.hp.
 */
export interface HealEvent {
  k: 'heal';
  id: string; // the healed ship (= the only observer this is ever delivered to)
  amount: number; // hp actually restored (clamped delta)
}

/**
 * A mine visible to this viewer, synced as CONTACT-LIKE state (not an event):
 * FrameMsg.mines is recomputed per observer every tick, exactly like contacts.
 * Owner sees ALL own mines always; others see a mine only when it is within
 * sight range + island-LOS. Mines never radar-paint. `own` = the viewer owns
 * this mine (render it friendly). A mine dropping out of the list means it is
 * gone OR out of sight — the client cannot tell, and that ambiguity is the
 * point (no event-lifecycle staleness bug is possible for a static entity).
 */
export interface MineView {
  id: string;
  x: number; // u
  y: number; // u
  own: boolean;
}

/** Per-tick, per-client events. Discriminated union on `k`. */
export type GameEvent =
  | BlipEvent
  | BallisticEvent
  | BoomEvent
  | DamageEvent
  | SunkEvent
  | SpawnEvent
  | UpgradeEvent
  | PointEvent
  | HealEvent;

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
  mines: MineView[]; // per-observer mine visibility (contact-like, recomputed per tick)
  spec?: true; // spectator (unfogged) frame
}

/** One player's line in the end-of-match results table. */
export interface ResultsRow {
  id: string;
  name: string;
  placement: number; // 1 = winner; later sinks place higher (better)
  kills: number;
  damageDealt: number; // hp dealt to other hulls (storm damage attributes to nobody)
}

/**
 * Server -> client end-of-match results ("r"), broadcast exactly once when the
 * match finishes. `winnerId` is '' only if no participant could be determined
 * (mutual destruction resolves to the LATEST-sunk human, so in practice it is
 * always set). Rows are sorted by placement ascending.
 */
export interface ResultsMsg {
  winnerId: string;
  rows: ResultsRow[];
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
