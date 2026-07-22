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
  ping: 'p', // server->client PingMsg / client->server PongMsg echo (RTT measurement)
} as const;

/**
 * Match lifecycle phase (public plane — mirrored on the schema as matchPhase).
 * waiting: ready room, drive/aim/fire freely but ALL damage suppressed.
 * countdown: ≥ minHumans present, room locked, countdownEndT set.
 * active: damage live, respawn disabled (death → spectate), storm running.
 * finished: winner decided; results broadcast; room disposes after the overlay.
 */
export type MatchPhase = 'waiting' | 'countdown' | 'active' | 'finished';

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
   * u — ship→cursor distance at sample time. The gun bursts its shell at this
   * point along the aim bearing (server-clamped to effective gun range);
   * torpedoes and mines ignore it (direction-only).
   */
  aimDist: number;
  /**
   * Loadout slot this click activates (int 0..SLOT_COUNT-1; see sim/loadout.ts).
   * 0 (the gun, the permanently-selected default) unless the client resolved a
   * primed skillshot at click time — the server keeps NO priming state; the
   * click's slot IS the resolved prime. Validated server-side like every field.
   */
  slot: number;
  /**
   * ms — the client's server-clock estimate captured at pointerdown of the
   * most recent click (fire-time compensation, D1). `0` is the explicit
   * "no claim" sentinel meaning zero fire-time compensation. The server never
   * trusts the claim outright: compensation is clamped to
   * `min(claimed, measured RTT + jitter allowance)` with a hard ceiling of
   * `CONFIG.net.fireBackdateCeilingMs`.
   */
  fireT: number;
  /**
   * Client-side monotonic ability-ACTIVATION counter, mirroring fireSeq's
   * grammar (Story 1.6). A value newer than the last the server consumed
   * requests exactly ONE instant activation of the slot named by `actSlot`;
   * `0` is the explicit "never activated" sentinel, so every existing driver
   * (and every drone) that never touches an ability keeps sending 0 and never
   * activates. Abilities are NOT aimed and NEVER prime — the activation is an
   * instant key-press effect, independent of the click that fires the primed
   * weapon. Validated server-side like every field (finite int ≥ 0, monotonic).
   */
  actSeq: number;
  /**
   * Loadout slot index the current activation targets (int 0..SLOT_COUNT-1; see
   * sim/loadout.ts). Only a slot holding non-weapon (`EQUIPMENT_IS_WEAPON:false`)
   * equipment can activate; an actSeq advance against a weapon or empty slot is
   * structurally inert. Validated server-side like every field.
   */
  actSlot: number;
}

/**
 * Server -> client ping ("p"): `n` is a nonce, `t` the server send time (ms).
 * The client echoes PongMsg `{n}` immediately; the round-trip is the server's
 * RTT measurement feeding the D1 fire-time clamp (Colyseus 0.17 exposes no
 * room.ping(), so RTT is measured at the app level).
 */
export interface PingMsg {
  n: number; // nonce (matches the echoed PongMsg)
  t: number; // ms — server time the ping was sent
}

/**
 * Client -> server ping echo ("p"): the nonce from the PingMsg, returned
 * immediately on receipt. The server pairs it with its recorded send time to
 * compute one RTT sample for the D1 clamp bound.
 */
export interface PongMsg {
  n: number; // nonce being echoed
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
 * One equipment slot's ammo pool + reload timer: ONE pool (`n` = rounds ready
 * to fire, 0 = empty) and ONE reload timer (`reloadMsLeft` = ms until the next
 * round tops up the pool; 0 = idle, i.e. either full or between-shots with
 * nothing pending). The reload ticks whenever the pool is below max, adds +1
 * per fill, and restarts (with overshoot carry) while still below max — see
 * server equipment/ammo.ts. The single-shot gun is a 1-round pool: the client
 * renders it as a pure cooldown.
 */
export interface WeaponAmmo {
  n: number; // rounds currently loaded (0 = empty)
  reloadMsLeft: number; // ms until the next round tops up the pool (0 = idle)
}

/**
 * Your own ship as seen in a frame — full, unfogged. `sweep` is the current
 * radar angle (rad), used to draw the sweep wedge client-side.
 *
 * `ammo` is SLOT-ALIGNED: length SLOT_COUNT (see sim/loadout.ts), one entry
 * per loadout slot — null iff that slot is empty (mirrors the loadout
 * invariant: an empty slot carries no state). Under the universal fit that is
 * [gun, torpedo, mine, null]. maxAmmo / reloadMs are NOT on the wire — the
 * client reads them from CONFIG (and, after upgrades, from its own
 * effective-stats computation) and derives reload fractions from reloadMsLeft.
 */
export interface OwnShip {
  id: string;
  x: number; // u
  y: number; // u
  heading: number; // rad
  speed: number; // u/s (signed)
  hp: number;
  alive: boolean;
  ammo: (WeaponAmmo | null)[]; // per slot: pool count + reload timer, null = empty slot
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
  /**
   * ms — server-clock time the active speed-boost window ends (Story 1.6);
   * `0` = inactive. The boost is live while `serverNow < boostUntil`, driving
   * the client's boosted-cap prediction and the HUD boost chip. OWNER-ONLY by
   * construction: this field rides `you` and NOTHING else — it never appears on
   * a Contact, blip, ballistic event, boom, or spectator payload. An enemy
   * observer reads a boosting hull ONLY through its observed kinematics (a
   * faster-moving contact); the boost's timing and existence stay self-private.
   */
  boostUntil: number;
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
 * `ttl`, no `distLeft`, no launch position, no target point). CONFIG ships
 * gun range (CONFIG.vision.radar-derived) and shellSpeed to every client, so
 * any remaining-flight quantity on a fogged reveal lets a modified client
 * solve back to the (hidden) muzzle: traveled = range −
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

/**
 * A gun shell BURST at its target point (reached it un-intercepted, or was
 * intercepted inside the would-be blast — see sim/shell.ts). `id` matches the
 * originating shell so the client terminates its dead-reckoned render; x/y is
 * the burst center (= the firer's clicked point, so it reveals nothing beyond
 * the visible detonation). ANTI-CHEAT: no radius, range, or origin-derivable
 * field may EVER be added here (burstRadius ships in CONFIG; the BallisticEvent
 * rationale applies unchanged). Damage still arrives ONLY as victim-private
 * `dmg` events — a multi-victim burst emits one `dmg` per victim.
 */
export interface BurstEvent {
  k: 'burst';
  id: string; // originating shell id
  x: number; // u — burst center (the target point)
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

/**
 * A star-shell lit zone visible to this viewer, synced as CONTACT-LIKE state
 * (not an event): FrameMsg.litZones is recomputed per observer every tick,
 * exactly like mines. The OWNER (firer) always sees its own zones; any other
 * observer sees a zone iff its CENTER is within the observer's effective radar
 * range — deliberately no island LOS and no sweep gate (a flare in the sky,
 * not a hull paint); invisible beyond radar range; spectators see all. `by` is
 * the FIRER'S ship id (roster-resolvable — renders in the firer's personal hue
 * come 1.12; until then the own-green / enemy-amber tint convention). The
 * firer's truesight parity INSIDE the zone never rides this shape — revealed
 * ships/mines/ballistics arrive through their own channels (perception.ts).
 * `until` is the server-clock expiry (drives the client's fade); a zone
 * dropping out of the list means expired OR out of radar range — the client
 * cannot tell, and that ambiguity is the point (the mines precedent).
 */
export interface LitZoneView {
  id: string;
  x: number; // u — zone center
  y: number; // u
  r: number; // u — lit radius
  until: number; // ms — server time the zone expires
  by: string; // the firer's ship id
}

/**
 * A decoy buoy visible to this viewer, synced as CONTACT-LIKE state (not an
 * event): FrameMsg.decoys is recomputed per observer every tick, exactly like
 * mines. This carries the TRUTH — the buoy for what it is — and is delivered
 * only to the OWNER (always sees own buoy), to enemies whose sight/lit-zone
 * covers it (truesight reveals the lie), and to spectators. The DECEPTION — the
 * buoy painting as the owner's ship — never rides this shape: it travels as an
 * ordinary `blip` event carrying the owner's ship id (perception.ts /
 * signals.ts counterIntel), wire-indistinguishable from a real ship blip.
 * `until` is the server-clock expiry (informational — the current client
 * renders a static marker and removes it on despawn; a near-expiry fade is a
 * possible future use). A decoy dropping out of the list means expired OR out
 * of view — the client cannot tell (the mines/litZones precedent).
 */
export interface DecoyView {
  id: string; // the decoy's own id (NOT the owner's ship id the blip lie carries)
  x: number; // u
  y: number; // u
  until: number; // ms — server time the buoy expires
  own: boolean; // true iff the receiving observer OWNS this buoy (per-observer, the mines precedent)
}

/** Per-tick, per-client events. Discriminated union on `k`. */
export type GameEvent =
  | BlipEvent
  | BallisticEvent
  | BoomEvent
  | BurstEvent
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
  litZones?: LitZoneView[]; // per-observer lit-zone visibility (contact-like; omitted when none)
  decoys?: DecoyView[]; // per-observer decoy-buoy visibility (contact-like; omitted when none)
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
