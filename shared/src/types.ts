// Wire contract between client and server. Field names are kept short (bytes on
// the wire) but readable. Two planes per the plan:
//   - Public plane: Colyseus schema (roster/mapSeed/mapRadius) — not defined here.
//   - Fogged plane: per-client FrameMsg built by the perception chokepoint.
// Messages: "w" welcome (once), "i" input (client->server), "f" frame
// (server->client, every tick).

import type { GameConfig, HornId, HullId, ShipClassId } from './constants.js';
import type { Vec2 } from './math/vec.js';
import type { StarShellsMode } from './sim/stats.js';

/** Short message-name tags used on the Colyseus channel. */
export const MSG = {
  welcome: 'w',
  input: 'i',
  frame: 'f',
  results: 'r',
  spend: 'u', // client->server: spend one banked point (see SpendMsg)
  ping: 'p', // server->client PingMsg / client->server PongMsg echo (RTT measurement)
  // Story 6.1 — StandardQueueRoom channels. These ride the QUEUE room, never the
  // arena, so they are additive to the arena wire contract and do not move
  // PROTOCOL_VERSION. Version compatibility for queued players is enforced at the
  // queue's own door instead (matchMaker seat reservation bypasses onAuth, so the
  // arena's gate never runs for them).
  queueStatus: 'q', // server->client QueueStatusMsg (liveness + countdown)
  seat: 'seat', // server->client: an ISeatReservation to consume into the arena
  // Story 6.3 — the cohort-collapse signal. UNLIKE the two queue channels above
  // this one rides the ARENA room, so amendment 6's "the arena wire contract is
  // untouched" reasoning does not cover it and PROTOCOL_VERSION moves with it
  // (epic-6 amendment 17).
  requeue: 'rq', // server->client RequeueMsg (go home, then queue again)
} as const;

/**
 * Server -> client "go home and start a fresh queue join" ("rq"), broadcast on
 * the ARENA room immediately before the room disconnects everyone aboard
 * (Story 6.3, epic-6 amendments 15/18).
 *
 * It exists for exactly one reason: the client must be able to tell a COLLAPSED
 * COHORT apart from a normal match-end disconnect, which correctly returns to a
 * home screen that then WAITS FOR INPUT. Only this case re-queues on its own.
 *
 * `reason` is a machine-readable discriminator, never a copy string — the
 * client owns the wording (register grammar), and Story 6.7's richer
 * reconnection UX extends this union rather than inventing a second channel.
 *
 * 'cohortLost' — a queue-formed room fell below CONFIG.match.minHumans during
 * the countdown. The cohort is SEALED at forming (amendment 10) so it can never
 * refill; the survivor is sent home and the client re-queues automatically,
 * with no privileged position in the pool (amendment 18 deleted front-of-pool
 * re-entry outright — the returning survivor is an ordinary new arrival).
 *
 * BEST-EFFORT BY CONSTRUCTION: the disconnect that follows is unconditional and
 * is never gated on this broadcast, so an undelivered signal costs the survivor
 * a PLAY press and nothing else — exactly the pre-6.3 behaviour.
 */
export interface RequeueMsg {
  reason: 'cohortLost';
}

/**
 * Queue liveness, pushed on every change (Story 6.1).
 *
 * `startsInMs` is null until the pool ARMS at `min` captains; once armed it is a
 * hard deadline that later joins never extend. A pool below `min` therefore shows
 * a truthful "waiting for captains" state rather than a countdown that cannot fire.
 */
export interface QueueStatusMsg {
  n: number; // captains currently pooled
  min: number; // captains required to arm (CONFIG.match.minHumans)
  cap: number; // captains that trigger an immediate form (CONFIG.map.playerCap)
  startsInMs: number | null; // ms until the match forms; null while unarmed
}

/**
 * Story 6.6 — the pre-join liveness contract, served over HTTP at `GET /liveness`
 * rather than the arena socket, because the home screen has no room to listen to.
 *
 * EVERY COUNT IS HUMANS ONLY (Eric ruling 2026-08-17, Q3). Bots hold no seat, so
 * the driver's per-room `clients` gives this for free — a solo room with 1 human
 * and 19 AI captains contributes exactly 1. Reporting participants here would be
 * population theater, which is the thing this epic exists to refuse.
 *
 * Derived exclusively from `matchMaker.query()`, which routes through the DRIVER
 * and is therefore multi-process safe. `matchMaker.stats.local` is process-local
 * and must never back this payload (architecture rule D8).
 *
 * NOT a PROTOCOL_VERSION concern: this is an additive HTTP shape and the arena
 * wire contract does not move. `PROTOCOL_VERSION` stays 40.
 */
export interface LivenessPayload {
  /**
   * EVERY live human: in a match, in the queue, OR sitting on the home screen —
   * including you (Eric ruling 2026-08-18, widening the original in-match-or-in-
   * queue definition). This is a LIVENESS figure, not a load figure: a player
   * reading the home screen deciding whether to press SOLO is present, and the
   * whole point of the number is to tell the next visitor somebody is here.
   *
   * The two ROOM populations come from each room's OWN live client count where
   * the room publishes one (`metadata.humans`), NOT from the driver's raw
   * `clients`. That distinction is load-bearing twice over: the driver
   * increments at SEAT RESERVATION, so a captain mid-handoff would otherwise be
   * counted in the queue and the arena at once; and it decrements only after the
   * reconnect grace settles, so a captain who closed their tab would otherwise
   * read as online for `CONFIG.net.reconnectGraceSeconds` (60s) afterwards.
   *
   * The HOME-SCREEN population is a presence set kept on `matchMaker.presence`
   * (so it survives the move to a redis presence, per D8) and fed by the liveness
   * poll itself — the poll IS the heartbeat, so no extra request exists. Entries
   * expire on a TTL comfortably longer than the poll interval, which is what
   * makes a closed tab drop out on its own with nothing to unsubscribe. Double
   * counting is structurally impossible because the poll STOPS the moment a
   * player commits to a door: you are either polling from home, or you are in a
   * room, never both.
   */
  playersOnline: number;
  /** Arena rooms in existence, ANY phase (boarding/countdown/active/results). */
  liveGames: number;
  /**
   * The Standard queue, or null when no queue room exists — which is the NORMAL
   * empty state, not an error: the room `autoDispose`s when the last captain
   * leaves, so "nobody queued" and "no room" are the same fact.
   */
  queue: {
    pooled: number;
    min: number; // captains required to arm
    cap: number; // captains that form the match immediately
    /**
     * Absolute epoch ms at which the pool forms, or null while UNARMED. Absolute
     * (not remaining-ms) so the client ticks a smooth countdown between slow
     * polls; null is load-bearing — amendment 4 forbids showing a countdown that
     * cannot fire.
     */
    deadlineAt: number | null;
  } | null;
  /**
   * Per-mode split. Deliberately NOT rendered on the home screen (Eric ruling
   * 2026-08-17: "I don't need to see how many players are playing solo vs AI on
   * the homepage… This is great info for the endpoint, though") — it exists for
   * operators and for whatever later surface wants it.
   *
   * THESE COUNT ARENA ROOMS ONLY, so queued captains are in NEITHER bucket:
   *   modes.standard.players + modes.soloVsAi.players  !=  playersOnline
   * whenever anyone is pooled, and the difference IS the queue. Not a
   * discrepancy to reconcile — a captain still waiting has no mode yet, the
   * queue being the one door in front of every mode. Inventing a third bucket
   * for them would put a number on the wire that nothing renders.
   */
  modes: {
    standard: { players: number; games: number };
    soloVsAi: { players: number; games: number };
  };
  /** Server clock at build time, so the client can correct its own skew. */
  serverNow: number;
}

/**
 * Match lifecycle phase (public plane — mirrored on the schema as matchPhase).
 * waiting: ready room, drive/aim/fire freely but ALL damage suppressed.
 * gathering: ≥ minHumans present, room still UNLOCKED for the join window
 *   (CONFIG.match.joinWindow); countdownEndT carries the window's deadline.
 * countdown: join window elapsed, room locked, countdownEndT set.
 * active: damage live, respawn disabled (death → spectate), storm running.
 * finished: winner decided; results broadcast; room disposes after the overlay.
 */
export type MatchPhase = 'waiting' | 'gathering' | 'countdown' | 'active' | 'finished';

/** A circle: spawn ring, map disc, or an island's bounding circle. */
export interface Circle {
  x: number; // u
  y: number; // u
  r: number; // u
}

/**
 * One elevation band of an island (cycle 59): the isolines of the SAME height
 * field the coastline was thresholded from, at `level` steps above sea level.
 * RENDERING ONLY — contours are never collided and never LOS-tested; the
 * gameplay authority on elevation is the retained height raster (GameMap).
 * `polys` is a LIST because one band may split into multiple disjoint peaks on
 * an elongated island — a desired feature, not an error. Each poly is CCW and
 * strictly inside its parent (the island coastline for level 1, a level-k−1
 * poly above that); max 4 bands per island (base coastline + levels 1..3).
 */
export interface Contour {
  level: number; // 1..3 — steps above sea level (the coastline itself is band 0)
  polys: Vec2[][]; // world-space CCW loops, implicitly closed (last -> first)
}

/**
 * A height-field landmass (cycle 59, PV 29 — supersedes the cycle-51 capsule
 * generator's skeleton islands). `x/y/r` IS the bounding circle — max distance
 * from (x,y) to any vert — which keeps `Island` structurally assignable to
 * `Circle` (deliberate: every circle-typed consumer keeps compiling, and the
 * bounding circle is the mandatory broadphase in front of every exact polygon
 * test; see sim/island.ts, the single query seam). Map geometry never travels
 * on the wire — both sides rebuild identical islands from `mapSeed` via
 * generateMap.
 *
 * `pole` is the pole of inaccessibility — the interior point furthest from the
 * coastline, guaranteed inside `poly` — and `core` is the inscribed radius
 * about `pole`, NOT about `(x,y)`: on a hook island the centroid falls in its
 * own bay, which would zero the core on exactly the islands whose LOS
 * early-out matters most. The retired 1-3 point `skeleton` (and the star-shape
 * invariant that rode on it) is gone: push-out now aims at the nearest
 * boundary point (sim/collision.ts).
 */
export interface Island {
  x: number; // u — bounding-circle centre (polygon vertex centroid)
  y: number; // u
  r: number; // u — bounding-circle radius: max distance from (x,y) to any vert
  /** Closed WORLD-SPACE boundary, CCW, implicitly closed (last -> first). */
  poly: Vec2[];
  /** Pole of inaccessibility — deepest interior point, always inside `poly`. */
  pole: Vec2;
  /** Largest radius about `pole` fully inside poly; > 0 by construction. */
  core: number;
  /** Elevation bands (render-only isolines of the height field), levels 1..3. */
  contours: Contour[];
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
  /**
   * Client-side monotonic FOGHORN counter, mirroring fireSeq/actSeq's grammar
   * (Story 4.5). A value newer than the last the server consumed requests
   * exactly ONE honk; `0` is the explicit "never honked" sentinel, so every
   * existing driver (and every drone — drones never honk) keeps sending 0 and
   * never sounds. The server consumes it with max(), so a stale or replayed
   * value reads as "no new press" and a spoofed jump (`hornSeq += 1000`)
   * gains nothing — at most one gated honk resolves per tick, and it is
   * gated again on CONFIG.foghorn.cooldownMs. The honk is NOT aimed and NEVER
   * primes: it is an emote, with no XP, damage, or match-state consequence.
   * Validated server-side like every field (finite int ≥ 0, monotonic).
   */
  hornSeq: number;
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
 * SpendMsg.choice sentinel for the DAMAGE CONTROL heal (Eric rulings
 * 2026-08-04): EXACTLY -1 = spend the level on the always-available heal
 * strip instead of a card. Deliberately a reserved NEGATIVE value: a positive
 * sentinel (e.g. 4) would collide with a real card index the moment
 * CONFIG.offer.size moves — a negative can never alias an offer slot, since
 * card choices are 0..length-1 by construction.
 */
export const HEAL_CHOICE = -1;

/**
 * Client -> server spend ("u"): consume one banked level. `choice` is either
 * a card index — 0..N-1, bounded by the FRONT offer's actual length (see
 * OwnShip.offer / BoonOffer) — or EXACTLY `HEAL_CHOICE` (-1) for the
 * always-available DAMAGE CONTROL heal (Eric rulings 2026-08-04). EVERYTHING
 * else (out-of-range, other negatives, non-integers) is rejected with the
 * level intact. Deliberately a DISCRETE reliable message, NOT a field on the
 * per-tick InputMsg: the latest-input-wins coalescing there would silently
 * drop back-to-back spends (two quick kills → two spends).
 */
export interface SpendMsg {
  choice: number; // 0..N-1 = offer slot (front-offer-bounded) | HEAL_CHOICE (-1) = heal
}

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
   * Banked LEVELS not yet spent (Story 2.6/2.8 — the economy is levels, earned
   * by passive XP, not kills; `lvl` is the running total earned, `pts` what is
   * still unspent). The server's bare banked-level COUNT — every level banks
   * here, including a degenerate one whose draw came up empty (which surfaces
   * `offer: []` below). Self-private by
   * construction: it rides `you` ONLY, never a Contact or spectator payload.
   */
  pts: number;
  /**
   * The FRONT offer, as BOON IDS (Story 2.8 — up to CONFIG.offer.size
   * DIFFERENT card lines drawn from this player's deck; sim/deck.ts). `[]`
   * when pts is 0 (and, degenerately, when the deck drew nothing). Only the
   * front level ever has a hand at all — levels behind it are a bare count
   * server-side, and the DECK never leaves the server.
   * Self-private like `pts`: it rides `you` and NOTHING else. The client
   * resolves each id against the shared BOON_CATALOG and drops the WHOLE view
   * on an unresolvable id (row k must stay server slot k).
   */
  offer: string[];
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
  /**
   * Applied boon ids, in application order (Story 2.5 — dormant until 2.7's
   * spend flow grants any). Self-syncing every frame like `upg`: the client
   * resolves ids through the shared BOON_CATALOG (fail-closed — unknown ids
   * dropped) and feeds the defs to effectiveStats / the slot derivation / the
   * predictor's behavior hooks. ANTI-CHEAT: like upgrade counts, boons appear
   * ONLY here, on your own ship — never on a Contact, blip, ballistic event,
   * boom, or spectator contact (enemy builds are inferable only from observed
   * behavior on the water, never from the wire).
   */
  boons: string[];
  /**
   * Levels COMPLETED so far this life-of-the-match (Story 2.6) — an integer,
   * starting at 0 and wiped with the build at the match boundary. Every level
   * banks one point (see `pts`): `lvl` is the running total earned, `pts` what
   * is still unspent. ANTI-CHEAT: self-private like `upg`/`pts`/`boons` — it
   * rides `you` and NOTHING else (never a Contact, blip, ballistic event,
   * boom, spectator payload, or the roster schema). An enemy's level is
   * inferable only from what their ship does on the water.
   */
  lvl: number;
  /**
   * Progress toward the NEXT level as a fraction in [0,1) — the server's
   * integer-ms accumulator over CONFIG.xp.levelMs. Server-authoritative and
   * never predicted: the client renders it verbatim (no client-side XP
   * accrual exists). Self-private exactly like `lvl`.
   */
  xp: number;
  /**
   * hp — remaining DAMAGE CONTROL regen pool (Eric rulings 2026-08-04); `0`
   * = no pool draining. Each heal spend adds CONFIG.damageControl.regenHp
   * here; the server drains it at the fixed regenHp/regenMs rate (pools ADD,
   * the rate never changes) and it resets to 0 wherever boostUntil does
   * (spawn, sink, respawn, match boundary). SELF-PRIVATE BY CONSTRUCTION (the
   * boostUntil precedent): this field rides `you` and NOTHING else — it never
   * appears on a Contact, blip, ballistic event, boom, or spectator payload.
   * An enemy observer reads a healing hull ONLY through its observed
   * persistence under fire; the heal's timing and existence stay self-private.
   */
  repairHp: number;
  /**
   * ms — server-clock time the PROP-FOULING slow on this ship ends (Story
   * 2.8); absent/0 = not slowed. The victim is slowed while `serverNow <
   * slowedUntil`, driving the predictor's slowedKinematics fold (sim/slow.ts —
   * composition pinned boosted → slowed → hooks) and any HUD tell. VICTIM-
   * PRIVATE by construction (the boostUntil precedent): rides `you` and
   * NOTHING else — an enemy observer reads a fouled hull only through its
   * observed kinematics.
   */
  slowedUntil?: number;
  /**
   * ms — server-clock time the DAZZLE truesight reduction on this ship ends
   * (Story 2.8); absent/0 = not dazzled. While dazzled the server's perception
   * shrinks this ship's effective sight, and the client shrinks its own fog
   * hole honestly from THIS field. VICTIM-PRIVATE exactly like `slowedUntil`.
   */
  dazzledUntil?: number;
  /**
   * ms — server-clock time this SINKING hull founders (Story 5.2, amendments
   * 13/16): `sinceMs + CONFIG.ship.sinkingWindowMs`, stamped at sink-entry via
   * sim/sinking.ts founderDeadline(). Present IFF the hull is in the sinking
   * window; OMITTED entirely otherwise — never an `undefined` value (the
   * msgpack rule; the `slowedUntil` precedent, spread-conditional at frame
   * build). An absolute timestamp so the client renders the going-down
   * countdown against its existing server-clock estimate — no second clock.
   * SELF-PRIVATE BY CONSTRUCTION (the boostUntil precedent): rides `you` and
   * NOTHING else — never a Contact, blip, ballistic event, boom, or spectator
   * payload — so it adds NO new perception exception (the master invariant
   * stays at exactly SIX). An enemy already reads a sinking hull only through
   * its observed kinematics (a decelerating contact); no enemy-facing sinking
   * channel exists. This is the key that carries the client's THIRD state:
   * `alive` goes false at sink-entry (amendment 11), and `sinkingUntil` is
   * what keeps hull/helm/hotbar/firing-arc/horn live instead of spectate.
   */
  sinkingUntil?: number;
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
  /**
   * SELF-PRIVATE aggro mark (Story 5.6, epic-5 amendment 40). Present and
   * `true` ONLY when this contact is a PvE fleet ship that has acquired THE
   * OBSERVER RECEIVING THIS FRAME; omitted entirely in every other case,
   * including for other observers watching the same hull and for spectators.
   *
   * WHY THIS NEEDS NO SEVENTH PERCEPTION EXCEPTION: it is an extra attribute
   * on a contact the observer can ALREADY see (the row only exists because
   * `contactSignal.visible` passed), so it widens no spatial disclosure — it
   * is the `sinkingUntil`/`slowedUntil` shape applied to a Contact instead of
   * to `you`. It is also unforgeable intent rather than derived state: a
   * client cannot compute it, which is exactly why Eric's *"very visually
   * obvious that a PvE ship has aggro'd you"* needs a field at all.
   *
   * Appended LAST and optional so the historical key order stays byte-stable;
   * `spectator.test.ts`'s exact Contact key-set assertion (epic-5 amendment
   * 19) is updated deliberately alongside it.
   */
  aggro?: true;
}

// --- GameEvent union (discriminated on `k`) --------------------------------

/**
 * Radar paint: a timestamped stale snapshot of a contact's position — and,
 * as of Story 4.2 (FR14), its pose: hull class, heading, and signed speed at
 * paint time, so a paint renders as the true-scale silhouette with an
 * ARPA-style speed vector instead of an anonymous dot.
 *
 * ANTI-CHEAT — why `heading`/`speed` are safe where BallisticEvent's
 * constant-free rule forbids any derivable field: a painted hull's POSITION is
 * already disclosed by the paint itself, and its instantaneous velocity says
 * nothing about the observer→target geometry — there is no CONFIG constant to
 * combine it with that would solve back to anything hidden (contrast a fogged
 * shell, where remaining-flight × known speed recovers the muzzle). Only the
 * raw `state.speed` scalar rides here — NEVER a derived speed cap, max-speed
 * fraction, or boost flag, which would leak build state (the OwnShip
 * boostUntil/boons self-private law). Note the honest limit of that rule: base
 * class envelopes are public CONFIG, so a paint reporting speed above a class's
 * base maxSpeed still IMPLIES an engine boon or an active boost. That inference
 * is inherent to disclosing speed at all (FR14) and is not new — `Contact`
 * already discloses raw speed at sight range; 4.2 extends an accepted
 * disclosure outward to radar range rather than opening a new class of leak.
 * What the rule buys is that the wire never states build state OUTRIGHT, so a
 * stock hull at flank is indistinguishable from a boosted one at the same
 * speed. A decoy buoy's paint carries its FROZEN
 * drop-time cls/heading with speed exactly 0 (a radar reflector reports true
 * stationary values) through the same shaper — field-for-field identical.
 * KEY ORDER: the three fields are APPENDED after `t` (msgpack key-insertion
 * order) so the historical {k,id,x,y,t} prefix stays byte-stable.
 */
export interface SilhouetteBlipEvent {
  k: 'blip';
  id: string;
  x: number; // u — position at paint time
  y: number; // u
  t: number; // ms — server time the blip was painted (drives phosphor decay)
  cls: HullId; // hull id at paint time (drones paint their drone hull)
  heading: number; // rad — at paint time
  speed: number; // u/s (signed, the raw scalar) — at paint time
}

/**
 * Radar paint, `return` grammar — THE SERVER RASTERIZES THE HULL (cycle 63,
 * Eric ruling 2026-08-07, amendment 152; supersedes the cycle-51
 * {k,id,x,y,t,ext} shape). The server projects the true hull polygon onto the
 * shared radar grid (`CONFIG.vision.radarCellU`, sim/radarRaster.ts) and
 * sends COVERAGE CELLS: a world-anchored cell rect plus a packed coverage
 * bitmask. The client computes ALL intensity (range falloff, the core→edge
 * term from depth inside the mask, the SNR grain) — the server does geometry
 * only.
 *
 * THE MASK IS FUZZED, BY RULING (cycle-63 review gate, amendments 156-157):
 * what rides the wire is `paintCoverage` — the sharp rasterization dilated
 * one cell (beam smear), stretched 0-1 further cell per side and glinted on
 * its fringe per paint (`fuzzCoverage`, seeded by `paintSeed(t, x, y,
 * heading)` — time and exact pose, NEVER any ship identity, so the jitter is
 * not a cross-sweep correlation handle). A sharp mask was a class lookup
 * table, which reversed amendment 68; the fuzzed mask keeps size and
 * orientation readable while class is inferable only with skill.
 *
 * THIS SHAPE REDUCES DISCLOSURE, and that is load-bearing (amendment 152).
 * The retired shape carried an `id` — a correlation handle across sweeps —
 * plus the exact float position and a derived `ext` scalar a modified client
 * could reason about. This shape carries a coverage footprint and NOTHING
 * ELSE: no `id`, no `cls`, no `heading`, no `ext`, no exact position (the
 * mask is cell-quantized). There is no correlation handle to drop because
 * none is sent — the phosphor-blip philosophy (the server keeps no history;
 * the client synthesises persistence) applied to the last row that still
 * violated it. What a lit cell says is "there is metal here", which is
 * precisely and only what a radar says. Orientation/aspect are disclosed
 * exactly as far as the footprint's SHAPE discloses them — that is the
 * ruling's point (a fogged hull finally points the way it is moving).
 *
 * ANTI-CHEAT BOUND (amendment 66's rule carried forward): the mask derives
 * from hull geometry + pose ONLY — never boons, hp, damage state, or any
 * range-derivable quantity. It is observer-INDEPENDENT: every observer
 * painting this hull this tick receives the identical mask. A decoy buoy's
 * paint is rasterized by the same shared function from its frozen drop-time
 * pose (owner hull, drop heading) — byte-for-byte a genuine footprint by
 * construction (amendment 11).
 *
 * WIRE LAYOUT: `gx`/`gy` are ABSOLUTE world cell indices of the rect's min
 * corner (`floor(worldU / radarCellU)`), `w`/`h` the rect in cells, `bits`
 * the packed row-major mask (bit `row * w + col`, 32 bits per word,
 * LSB-first). Mask words are SIGNED 32-bit integers — `setBit` builds them
 * with `|=`, so a word whose bit 31 is set serializes NEGATIVE; consumers
 * must compare words as int32, never coerce through `>>> 0`. A battleship
 * broadside is ~16×6 cells at the 9u lattice ≈ 3 mask words. KEY
 * ORDER (msgpack key-insertion order): k,t,gx,gy,w,h,bits.
 */
export interface ReturnBlipEvent {
  k: 'blip';
  t: number; // ms — server time the blip was painted (drives phosphor decay)
  gx: number; // absolute world cell index (x) of the rect's min corner
  gy: number; // absolute world cell index (y) of the rect's min corner
  w: number; // rect width in cells
  h: number; // rect height in cells
  bits: number[]; // packed row-major coverage mask (32 bits/word, LSB-first, signed int32 words)
}

/**
 * The blip wire shape — a two-member union with NO per-event discriminator
 * beyond the shared `k: 'blip'`. The server picks ONE grammar for the whole
 * room (`HC_RADAR_GRAMMAR`, amendment 63) and announces it in the welcome
 * handshake (`WelcomeMsg.radarGrammar`), so every blip in a given match has
 * the same shape and the client narrows on the ANNOUNCED mode, never by
 * probing fields — a per-event tag would be dead weight on a 20Hz channel.
 */
export type BlipEvent = SilhouetteBlipEvent | ReturnBlipEvent;

/**
 * One wake ribbon SEGMENT the observer's sweep crossed this tick (Story 4.12,
 * amendments 194-196) — disturbed water rasterized onto the SAME radar
 * lattice as `ReturnBlipEvent` (`CONFIG.vision.radarCellU`,
 * `paintSegmentCoverage` in sim/radarRaster.ts — sharp geometry plus the
 * per-paint flank glint, cycle-69 review gate P3), in the same world-anchored
 * cell-rect + packed-mask shape, gated per segment on `blipGate`'s clause
 * order with a PER-SOURCE inner bound (sight for a ship's water, the 3/8
 * detect radius for a torpedo's — cycle-69 review gate P2) and
 * band-consistent occlusion, in the `return` radar grammar only (P1) — NOT a
 * declared exception to the master perception invariant; what is new is that
 * the subject is water rather than a ship.
 *
 * THE PAYLOAD CARRIES NO IDENTITY OF ANY KIND (amendment 194): no ship id,
 * no class, no hue, no owner, and no hull↔wake linkage. A wake cell says
 * "the water here was disturbed, this recently" — which is precisely and
 * only what a radar reads off a track. Correlating a track to a hull is the
 * player's inference, never the wire's statement.
 *
 * WHY AGE IS ON THE WIRE AND COURSE IS NOT: the client cannot infer which
 * end of a painted ribbon is the NEW end — that inference is exactly the
 * identity linkage this payload refuses to carry — so the quantized
 * water-age bucket `a` IS the recency channel, and course falls out for
 * free as the age gradient along the ribbon. `a` is quantized to
 * `WAKE_AGE_BUCKETS` (sim/wake.ts — 4; both the wire and the client read
 * that one constant) because the presentation consumes age only as an
 * intensity multiplier that matters near the lit threshold, and the wire
 * may carry no finer resolution than the presentation actually consumes
 * (Story 4.9's standing rule, amendment 124).
 *
 * WIRE LAYOUT mirrors `ReturnBlipEvent` (same `gx`/`gy`/`w`/`h`/`bits`
 * semantics, signed int32 mask words). KEY ORDER (msgpack key-insertion
 * order, load-bearing): k,t,a,gx,gy,w,h,bits.
 */
export interface WakeBlipEvent {
  k: 'wk';
  t: number; // ms — server time the segment was painted (drives phosphor decay)
  a: number; // quantized water-age bucket, 0..WAKE_AGE_BUCKETS-1 (the recency channel)
  gx: number; // absolute world cell index (x) of the rect's min corner
  gy: number; // absolute world cell index (y) of the rect's min corner
  w: number; // rect width in cells
  h: number; // rect height in cells
  bits: number[]; // packed row-major coverage mask (32 bits/word, LSB-first, signed int32 words)
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
 * A steering (ACOUSTIC HOMING) torpedo's ballistic UPDATE (Story 2.8): the
 * enemy client dead-reckons ballistics from reveal velocity, so a torpedo
 * whose velocity DIRECTION has drifted beyond a small threshold since its last
 * emit re-emits current pos + velocity to observers who can currently see it;
 * the client updates the live track in place (same id). SAME CONSTANT-FREE
 * SHAPE RULE as BallisticEvent's materialization: {id,x,y,vx,vy,t} only — no
 * range-derivable field (ttl/distLeft/launch/target) may EVER be added, or a
 * fogged shooter's position becomes solvable. `seenBallistics` exactly-once
 * relaxes to allow updates keyed by the same id.
 */
export interface TorpedoUpdateEvent {
  k: 'torpU';
  id: string; // the live torpedo's projectile id (matches its 'torp' reveal)
  x: number; // u — position at update time
  y: number;
  vx: number; // u/s — velocity at update time
  vy: number;
  t: number; // ms — update server time
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

/**
 * FALL OF SHOT (Story 4.3, amendment 16): the shooter's OWN shell terminated
 * without resolving any victim — a splash at the true impact point, rendered
 * above the fog for the shooter alone, so bracket-and-walk fire works (FR16).
 * `id` is the SHOOTER's ship id: the self-private gate key (perception
 * forwards it ONLY to that observer — the dmg/pt precedent), never a victim
 * reference. GUN-FAMILY ONLY (wire kind 'shell' — gun, cannon, star shells):
 * torpedoes and mines have no fall-of-shot (the quiet weapons stay quiet).
 *
 * ANTI-CHEAT — deliberately omitted: any victim/target identity (a splash IS
 * a miss; there is nobody to name), any weapon identity, and any
 * range-derivable field (the BallisticEvent rationale applies unchanged).
 * The position reveals nothing the shooter did not author: the shell flew to
 * a point they clicked. KEY ORDER IS LOAD-BEARING (msgpack): k,id,x,y.
 */
export interface SplashEvent {
  k: 'sp';
  id: string; // the SHOOTER's ship id (the self-private gate key)
  x: number; // u — the true impact point
  y: number; // u
}

/**
 * HIT CALL (Story 4.3, amendments 17/18): something the shooter fired or laid
 * CONNECTED — exactly one per ordnance resolution, at the impact/burst/mine
 * point, delivered ONLY to the owner (self-private; spectator-public like
 * dmg). ALL ORDNANCE: gun, cannon, star shells, torpedo, AND mines (a Mine
 * Layer learning remotely that a trap sprung is the intended feature). This
 * KNOWINGLY supersedes the boom row's owner anti-leak rule for the owner-hit
 * case (amendment 17): "something of yours connected out there" is now
 * deliberate — it is what keeps the ratified decoy disambiguation oracle
 * alive ("shooting a decoy produces no Hit Call" only means something if a
 * real hit at fog range produces one).
 *
 * ANTI-CHEAT — deliberately omitted: EVERY severity channel. No victim id,
 * no amount, no hp, no kill flag, no weapon, no hull count — an AP shell
 * that pierces several hulls sends exactly ONE Hit Call (a per-pierce call
 * would leak the hull count). `id` is the SHOOTER's ship id (the
 * self-private gate key), NEVER the victim's. KEY ORDER IS LOAD-BEARING
 * (msgpack): k,id,x,y.
 */
export interface HitCallEvent {
  k: 'hc';
  id: string; // the SHOOTER's ship id (the self-private gate key) — NEVER the victim
  x: number; // u — the impact/burst/detonation point
  y: number; // u
}

/**
 * MUZZLE FLASH (Story 4.3, amendments 15/19/20): a gun-family weapon fired
 * HERE — position only. Emitted at the shell's PRE-pre-step origin (the TRUE
 * muzzle), so a D1 back-dated shell that materializes further along its
 * flight is masked by a flash at the hull it left — never at a reveal point,
 * which is the exact anti-cheat leak the Story 1.5 review closed. Visible to
 * any observer within the derived CONFIG.vision.muzzleFlash halo (the eighths
 * ladder's 5/8 rung, SIGHT * 1.25 — moved down from 6/8 by Story 4.9,
 * amendment 119) with island LOS clear — a declared, narrowly-scoped fog
 * exception (a flash is a light source: dazzle does not change how far it
 * carries, and no lit zone extends it). The halo still comfortably covers the
 * back-dated spawn above, because it still exceeds the truesight bubble.
 *
 * ANTI-CHEAT — deliberately omitted: EVERY identity channel. No shooter id
 * (not even for the shooter — there is no privileged view of this row), no
 * personal hue, no class, no weapon kind, no heading, and no per-weapon
 * weight (a heavier cannon flash would put a class tell on the wire that
 * deliberately does not exist). The flash must create a question, never
 * answer one. GUN FAMILY ONLY by the wire-kind predicate ('shell' selects
 * gun + cannon + star shells and excludes 'torp' exactly — no per-weapon
 * table exists to leak through); mine/decoy stern-drops never spawn a
 * ballistic at all. KEY ORDER IS LOAD-BEARING (msgpack): k,x,y.
 */
export interface MuzzleEvent {
  k: 'mz';
  x: number; // u — the TRUE muzzle (never a reveal point)
  y: number; // u
}

/**
 * WOUNDED SMOKE (Story 4.4, amendments 41/45): a hull is hurt HERE, this
 * hurt — position and severity band, and nothing else. Emitted on the
 * CONFIG.smoke.puffIntervalMs cadence at the hull's TRUE CURRENT POSITION for
 * as long as it stays below a band, and visible to any observer within the
 * derived CONFIG.vision.muzzleFlash halo (the ladder's 5/8 rung, SIGHT * 1.25
 * since Story 4.9) with island LOS clear
 * — the muzzle flash's reach reused verbatim, never a fourth vision constant
 * (amendment 42), and islands block this sensor exactly as they block every
 * other (amendment 44). A declared, narrowly-scoped fog exception: the FIFTH,
 * and the first enemy-hp-derived information the game has ever put on the
 * wire. The server keeps NO plume history — the client accumulates these
 * anonymous pulses into a drifting plume, the way it accumulates phosphor
 * blips.
 *
 * `tier` is an ENUM, never a fraction and never an hp value: 1 = light (hp
 * fraction below CONFIG.damageBands.amberBelow), 2 = heavy (below
 * criticalBelow). Sending hp/maxHp would be a real HP gauge and is
 * FORBIDDEN — two named conditions is a state, not a number (amendment 41).
 *
 * ANTI-CHEAT — deliberately omitted: EVERY identity channel, for EVERY
 * observer without exception — enemies, the smoking ship's OWN captain, and
 * spectators alike. No ship id, no personal hue, no class, no hp, no damage
 * amount, no fraction, no heading. The plume says "a hull is hurt, this hurt,
 * right there" and answers nothing else. Load-bearing consequence: NO
 * CORRELATION HANDLE EXISTS and none may be invented — not the real ship id,
 * not a per-observer alias, not a stable anonymous key (amendment 45) — so
 * per-source puff capping is impossible by construction and the client may
 * cap globally only. Own smoke rides this same row with no special case
 * (amendment 46), as does a drone's (amendment 47). KEY ORDER IS LOAD-BEARING
 * (msgpack): k,x,y,tier.
 */
export interface SmokeEvent {
  k: 'sm';
  x: number; // u — the smoking hull's TRUE current position (never a reveal point)
  y: number; // u
  tier: 1 | 2; // 1 = light (< amberBelow), 2 = heavy (< criticalBelow) — an ENUM, never a fraction
}

/**
 * THE FOGHORN (Story 4.5, amendments 51-58): a captain sounded their horn —
 * a BEARING they chose to give away, and never a position. The SIXTH declared
 * exception to the master perception invariant, and the FIRST signal whose
 * payload varies BY OBSERVER in substance rather than by a flag (`sunk`
 * stamps a per-observer `seen`; this row computes a per-observer bearing and
 * band). A honk is an EMOTE — information the captain SPENDS — which is the
 * premise that licenses everything below and the one any future change must
 * argue from.
 *
 * THREE PAYLOAD SHAPES, exhaustively:
 *   - Fogged listener:  {k, h, b, v}       — bearing + volume band + horn id.
 *   - The honker (self): {k, h, self}      — no bearing (a bearing to
 *                                            yourself is meaningless); the
 *                                            client blooms an own-hull mark.
 *   - Spectator:        {k, h, x, y}       — the omniscient path only; the
 *                                            free camera has no server-known
 *                                            position to take a bearing from,
 *                                            so it derives one client-side.
 * A fogged listener NEVER receives x, y, self, or id in any combination.
 *
 * VOLUME BANDS ride THE EIGHTHS LADDER (Story 4.9, amendment 122, superseding
 * amendment 53's three tiers): `v` is which EIGHTH of the LISTENER's OWN intel
 * range (`me.stats.radarRange`) the honker sits in — band 8 ends at the
 * listener's radar edge, and beyond band 8 NO event is emitted to that observer
 * at all. Anchoring on intel range rather than on
 * sight is what RETIRES amendment 53's max() clamps: dazzle never touches
 * radar range, so *dazzle cannot also DEAFEN* is now true BY CONSTRUCTION
 * rather than by defensive coding, and no arrangement of dazzle and boons can
 * invert the bands. Hearing therefore widens with `intelRadar` rather than
 * with `intelTruesight` — a deliberate trade. No vision constant was added for
 * the foghorn (amendment 42's rule, still holding).
 *
 * GAIN IS NOT ON THE WIRE AND MUST NEVER BE. `v` is an OPAQUE ENUM: the band
 * → gain mapping (1.0 / 1.0 / 1.0 / 1.0 / 0.875 / 0.75 / 0.625 / 0.5 — flat
 * through band 4 = truesight at base stats, then a 12.5-percentage-point step
 * per band, one eighth of FULL SCALE and one quarter of the 100→50% span, in
 * four steps from band 4 to the 50% radar edge) is a CLIENT-SIDE LOOKUP in
 * CLIENT_CONFIG. Putting a gain fraction on the wire would make hearing a
 * property of the sound rather than of the listener.
 *
 * WHAT BOUNDS THE DISCLOSURE IS RESOLUTION, NOT OPACITY. A band IS invertible:
 * any listener can map it back to a region of their OWN intel range, and that
 * is inherent to sending a volume tier at all (amendment 51 ratified exactly
 * that — BEARING AND VOLUME TIER ONLY). The rule the wire actually holds is
 * that the band's resolution is NEVER FINER THAN THE GAIN CURVE CONSUMES: the
 * server floors the RAW band to `max(band, 4)` before anything else touches it,
 * because bands 1-4 share one gain (1.0) and one chevron weight, so a finer
 * value would carry range information no honest client could use and only a
 * modified one could read. Emitted values are
 * therefore 4..8 — a 330u plateau at base stats, then 82.5u steps that each
 * correspond to a real, audible difference. Any future retune of the gain
 * curve must move this floor with it, in both directions.
 *
 * ISLANDS MUFFLE rather than block (amendment 54, the first dent in the
 * 2026-08-02 LOS law), preserved in meaning across the rebase: a failed
 * losClear() resolves to `max(5, floored + 2)`, silent when that would exceed
 * 8. Two bands is the width of one old tier, so the demotion reproduces the old
 * behavior at its boundaries — the whole 100% plateau lands at band 6 (75%)
 * behind rock, which is amendment 54's ruling at the truesight edge exactly,
 * and *a rock ALWAYS costs the honker reach* stays true. Applied ONCE, to the
 * ALREADY-FLOORED band, from exactly one losClear() call: muffling the raw band
 * instead would let a blocked honk be differenced back into the plateau
 * resolution the floor exists to remove.
 *
 * `h` is the equipped horn variant (amendment 52) — the ONLY identity-adjacent
 * field on this row, and a KNOWING, NARROW break with the neutral-signal rule
 * of `mz`/`sm`: a distinctive horn is a soft identity tell at up to 660u, and
 * that is the point of a purchasable horn. An unknown id must fall back to the
 * default voice client-side (sanitizeHornId), never to silence or a throw.
 *
 * ANTI-CHEAT — deliberately omitted for a fogged listener: EVERY positional
 * and identity channel except `h`. No x, no y, no ship id, no personal hue,
 * no class, no name, no range-derivable field — and NO CORRELATION HANDLE of
 * any kind, not a per-observer alias and not a stable anonymous key
 * (amendment 45's rule applies here verbatim). No kill-feed line, no roster
 * schema field, no XP or damage.
 *
 * SERVER-INTERNAL ONLY: the SUBJECT this row is built from additionally
 * carries `x`, `y` and `id` (the honker's true position, used to compute each
 * observer's bearing/distance, and the honker's id, used to decide `self`).
 * materialize() MUST NEVER FORWARD THE SUBJECT — it returns a FRESH object per
 * observer, exactly as the `mz` row does. `x`/`y` reach a spectator only;
 * `id` reaches NO observer, ever.
 *
 * KEY ORDER IS LOAD-BEARING (msgpack; see the signals.ts header): k,h,self?,
 * b?,v?,x?,y? — absent keys are omitted entirely, never sent as undefined.
 */
export interface FoghornEvent {
  k: 'fh';
  h: HornId; // which horn sounded — the ONLY identity-adjacent field, deliberate (amendment 52)
  self?: true; // the honker's own copy (always `true` when present, never `false`)
  b?: number; // rad — bearing FROM observer TO honker, wrapPositive [0, 2π). FOGGED LISTENERS ONLY
  v?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // volume BAND: which eighth of the LISTENER's intel range the honker sits in (8 = the radar edge). The SERVER emits 4..8 only — bands 1-4 share one gain and one chevron weight, so the wire is floored at 4 and carries no resolution an honest client cannot consume; the CLIENT's tables stay complete for 1..8 so a lower value still resolves if one ever arrives. Gain is a CLIENT-SIDE lookup and never travels. FOGGED LISTENERS ONLY
  x?: number; // u — SUBJECT-SIDE + SPECTATOR ONLY. Never reaches a fogged listener
  y?: number; // u — SUBJECT-SIDE + SPECTATOR ONLY. Never reaches a fogged listener
  id?: string; // the honker's id — SUBJECT-SIDE ONLY, read by the row to decide `self`. NEVER on the wire, for ANY observer
}

/** A ship took damage. `hp` is its resulting hit points. */
export interface DamageEvent {
  k: 'dmg';
  id: string;
  amount: number; // hp lost
  hp: number; // hp remaining
}

/**
 * A ship sank. `by` is the killer's id, if attributable.
 *
 * THE PUBLIC REGISTER (global kill feed): a human captain's sinking is
 * delivered to EVERY client — identity only ({k,id,by?}), never a position,
 * class, hue, damage, or weapon field. Drone sinkings stay gated (witnessed,
 * or your own kill). `seen` is PER-OBSERVER, stamped by the sunk row's
 * materialize() on the server: present (always `true`) iff THIS observer
 * legitimately witnessed the wreck (sight+LOS, an owned lit zone, own hull,
 * or spectator). It gates EVERYTHING SPATIAL on the client — the sink plume
 * and the contact-view teardown — so an unwitnessed feed line can never draw
 * at a stale last-known position. Never emitted as `seen: false` or with an
 * `undefined` value (msgpack encodes it): the key is omitted entirely when
 * the observer did not witness the wreck. KEY ORDER IS LOAD-BEARING
 * (msgpack): k,id,by?,seen?,bty? — absent keys are omitted, never undefined.
 *
 * `bty` (Story 4.6, Eric rulings 2026-08-10): WHICH PARTICIPANT in this
 * sinking held the bounty throne at the pre-sink instant — `'v'` the victim,
 * `'k'` the killer. Both can never be true at once (one throne, and a
 * self-sink credits nobody, so `'k'` requires a `by` distinct from `id`).
 * Identity-only, adds NO disclosure: `'v'` can only ride a combatant sinking
 * (a drone can never hold the throne), `'k'` may ride a drone wreck — but
 * that event reaches only the witness and the credited killer, both of whom
 * already know the leader's identity from the public ArenaState.bountyId.
 * The key is omitted entirely when neither held it, never `undefined`.
 * Observer-INDEPENDENT (unlike the per-observer `seen`): every recipient of
 * the row gets the same value.
 *
 * `vcls` (Story 5.6) is documented on the field itself and is appended after
 * `bty`; the full load-bearing key order is k,id,by?,seen?,bty?,vcls?.
 */
export interface SunkEvent {
  k: 'sunk';
  id: string;
  by?: string;
  seen?: true;
  bty?: 'v' | 'k';
  /**
   * THE VICTIM'S HULL ID, delivered ONLY to the observer credited with the
   * kill (Story 5.6, Eric ruling 2026-08-14, epic-5 amendment 43):
   * *"I want to know the kills I get when I get them. Meaning I want to know
   * I killed a Small Drone if a Small Drone is killed by my mine."*
   *
   * WHY THIS COULD NOT BE DONE CLIENT-SIDE, which is the whole reason a wire
   * field exists: you can sink a fleet ship you never saw — a mine it sailed
   * over, or a shell at 500u, since the gun reaches 660u and truesight is 330.
   * With drones off the roster (amendment 39) the client then holds no name,
   * no hull and no row for that id, and the feed could only say
   * `UNKNOWN VESSEL`. The server knows; nobody else can.
   *
   * PER-OBSERVER, like `seen` and unlike `bty` — stamped by the sunk row's
   * materialize() only when `by === observerId`. A bystander who witnesses the
   * same sinking never receives it, so this discloses the victim's CLASS to
   * exactly one client that already earned the XP for it and already learned
   * the tier from the amount. It therefore adds NO perception exception: the
   * master invariant stays at exactly SIX.
   *
   * Deliberately NOT the Public Register's business: the register is
   * identity-only by ruling, and this key never rides a row the killer is not
   * the recipient of. Appended LAST, key omitted entirely when absent (never
   * `undefined` — msgpack encodes that). KEY ORDER IS LOAD-BEARING:
   * k,id,by?,seen?,bty?,vcls?.
   *
   * It names the SIZE because the size is the payout (¼ / ½ / ¾ level), and it
   * changes nothing else: PvE kills still never increment the KILLS tally and
   * still never reach the match log or the end-game record (amendment 38,
   * re-confirmed by Eric in the same ruling).
   */
  vcls?: HullId;
}

/** A ship (re)spawned at a position. */
export interface SpawnEvent {
  k: 'spawn';
  id: string;
  x: number; // u
  y: number; // u
}

/**
 * A banked point earned (one per level). SELF-PRIVATE: `id` is the earning
 * ship's id, and perception forwards it ONLY to that observer — the same
 * mechanism as the victim-private `dmg` rule. Purely UX (toast + tone): the
 * authoritative count self-syncs every frame via OwnShip.pts.
 */
export interface PointEvent {
  k: 'pt';
  id: string; // the earner (= the only observer this is ever delivered to)
}

/**
 * A boon FITTED by spending a banked level (Story 2.7). SELF-PRIVATE: `id` is
 * the spending ship's id and perception forwards the event ONLY to that
 * observer — the same gate as `upg`/`pt`, so an enemy build never rides another
 * observer's frame. Queued by World.spendPoint (NOT by applyBoon, which stays
 * event-free so directed grants make no UX noise). Purely UX (fitted toast +
 * tone): the authoritative boon list self-syncs every frame via OwnShip.boons.
 */
export interface BoonFitEvent {
  k: 'bn';
  id: string; // the spender (= the only observer this is ever delivered to)
  boon: string; // the fitted boon's catalog id
}

/**
 * A DAMAGE CONTROL heal spent (Eric rulings 2026-08-04): marks the INSTANT
 * application at spend time. SELF-PRIVATE: `id` is the healing ship's id and
 * perception forwards the event ONLY to that observer — the same gate as
 * `pt`/`bn`, so a heal never rides another observer's frame. Purely UX (tone
 * + HUD flash): the authoritative numbers self-sync every frame via
 * OwnShip.hp / OwnShip.repairHp. ANTI-CHEAT — deliberately omitted: any hp
 * amount or total, any victim id, anything derivable about another ship.
 */
export interface HealEvent {
  k: 'heal';
  id: string; // the healer (= the only observer this is ever delivered to)
}

/**
 * A mine visible to this viewer, synced as CONTACT-LIKE state (not an event):
 * FrameMsg.mines is recomputed per observer every tick, exactly like contacts.
 * Owner sees ALL own mines always; others see a mine only when it is within
 * sight range + island-LOS. Mines never radar-paint. `own` = the viewer owns
 * this mine (render it friendly). A mine dropping out of the list means it is
 * gone OR out of sight — the client cannot tell, and that ambiguity is the
 * point (no event-lifecycle staleness bug is possible for a static entity).
 * `by` is the DROPPER'S ship id (roster-resolvable — the marker renders in the
 * dropper's personal hue for EVERY observer come Story 1.12, a deliberate intel
 * grant, Eric 2026-07-23; amber only when the dropper has left the roster).
 */
export interface MineView {
  id: string;
  x: number; // u
  y: number; // u
  own: boolean;
  by: string; // the dropper's ship id (personal-hue + roster attribution)
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
 * `mode` is the firer's star-shell DOCTRINE stamped on the zone record at
 * zone-spawn time — delivered to EVERY legitimate observer (Story 2.9,
 * amendment 50: counterplay over concealment — the zone's nature is
 * observable behavior of the fired shell, not a build leak). Optional on the
 * TYPE only so pre-2.9 client fixtures keep compiling — the server always
 * emits it; a missing mode renders as 'standard'.
 */
export interface LitZoneView {
  id: string;
  x: number; // u — zone center
  y: number; // u
  r: number; // u — lit radius
  until: number; // ms — server time the zone expires
  by: string; // the firer's ship id
  mode?: StarShellsMode; // the zone's doctrine (amendment 50); server-emitted always
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
 * `by` is the OWNER'S ship id (roster-resolvable — the truth marker renders in
 * the owner's personal hue for EVERY observer come Story 1.12, a deliberate intel
 * grant, Eric 2026-07-23; amber only when the owner has left the roster). This
 * rides ONLY the truesight truth channel — the deceiving radar blip still carries
 * the owner's id through its own path (counterIntel), unchanged.
 */
export interface DecoyView {
  id: string; // the decoy's own id (NOT the owner's ship id the blip lie carries)
  x: number; // u
  y: number; // u
  until: number; // ms — server time the buoy expires
  own: boolean; // true iff the receiving observer OWNS this buoy (per-observer, the mines precedent)
  by: string; // the owner's ship id (personal-hue + roster attribution)
}

/**
 * Why the server refused a press, on the wire (Story 1.10 — FR12's "denied
 * fire is never silent"). The four wire reasons:
 *   'out-of-arc' — an aimed weapon click outside its launch sector (torpedo).
 *   'cooling'    — a WEAPON click against an empty pool (the round is
 *                  reloading; the weapon channel's empty-pool vocabulary).
 *   'no-ammo'    — an ABILITY press against an empty pool (no charge).
 *   'blocked'    — a stern drop (mine/decoyBuoy) whose drop point lands
 *                  inside an island or outside the water — nothing consumed.
 * The gate's 'dead'/'empty-slot' refusals never ride the wire: they are
 * either perfectly client-predictable (dead) or unreachable for an honest
 * client (empty-slot), and both spend nothing.
 */
export type DenialReason = 'out-of-arc' | 'no-ammo' | 'cooling' | 'blocked';

/**
 * One denied press, SELF-PRIVATE on the per-client frame (FrameMsg.denied —
 * a sibling of `you`, NEVER a contact-visible event): only the pressing
 * client ever receives it, so a denial can never leak another ship's
 * loadout/reload state. `seq` is the press identity the client deduplicates
 * feedback on — the click's InputMsg.fireSeq for weapons, the press's
 * InputMsg.actSeq for abilities — keyed (slot, seq): a client-predicted
 * denial suppresses the matching server echo; an unpredicted server denial
 * (stale-ammo races) triggers the feedback late-but-explicit. Never zero
 * feedbacks, never two. Denied presses spend NOTHING (round/charge kept).
 */
export interface DeniedView {
  slot: number; // loadout slot the press targeted (InputMsg.slot / actSlot)
  reason: DenialReason;
  seq: number; // press identity: fireSeq (weapon click) or actSeq (ability)
}

/** Per-tick, per-client events. Discriminated union on `k`. */
export type GameEvent =
  | BlipEvent
  | WakeBlipEvent
  | BallisticEvent
  | TorpedoUpdateEvent
  | BoomEvent
  | BurstEvent
  | DamageEvent
  | SunkEvent
  | SpawnEvent
  | PointEvent
  | BoonFitEvent
  | HealEvent
  | SplashEvent
  | HitCallEvent
  | MuzzleEvent
  | SmokeEvent
  | FoghornEvent;

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
  /** This tick's denied presses — SELF-PRIVATE (rides like `you`, only ever
   *  the receiving client's own denials; omitted when none, never on
   *  spectator frames — a dead ship cannot press). See DeniedView. */
  denied?: DeniedView[];
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
 * match finishes. Rows are sorted by placement ascending.
 *
 * `winnerId` is '' when the match ended with NO WINNER — a genuine DRAW. Since
 * Story 5.2's amendment 14 that is a real, reachable outcome and not a
 * can't-happen fallback: mutual destruction resolves to the LATEST-sunk
 * participant, but when the last captains standing share one sink-entry stamp
 * they went down together, no "later sinker" exists, and nobody wins. The
 * client must therefore render '' as DRAW (Story 6.3, amendment 14) rather than
 * as an unknown or a loss.
 */
export interface ResultsMsg {
  winnerId: string;
  rows: ResultsRow[];
}

/**
 * Which blip wire shape this room speaks (amendment 63): 'silhouette' is the
 * shipped 4.2 grammar (SilhouetteBlipEvent — pose on the wire), 'return' the
 * realism grammar (ReturnBlipEvent — a fuzzed coverage footprint, cycle 63).
 * Server-picked per room (`HC_RADAR_GRAMMAR`, default 'silhouette'), announced
 * once in the welcome; the client narrows every BlipEvent on this, never by
 * probing fields.
 */
export type RadarGrammar = 'silhouette' | 'return';

/**
 * Which id namespace blips carry (amendment 63): 'roster' is today's behavior
 * (blip.id is the painted ship's roster id), 'pseudonym' maps each ship to a
 * stable per-match track id rolled on the server's private stream (the zone
 * nonce posture), a decoy emitting under its OWNER's pseudonym. Orthogonal to
 * RadarGrammar by design — presentation and identity are independent questions
 * and a single flag would foreclose the happy medium the ruling exists to
 * enable. Server-picked per room (`HC_RADAR_IDENTITY`, default 'roster').
 */
export type RadarIdentity = 'roster' | 'pseudonym';

/**
 * Server -> client handshake ("w"), sent once on join. Carries the map seed for
 * deterministic client-side island generation plus a CONFIG snapshot so the
 * client shares every tunable — and, as of the radar realism cycle, the room's
 * radar grammar/identity modes, the ONLY place they travel (blips themselves
 * are deliberately tagless; see BlipEvent).
 */
export interface WelcomeMsg {
  sessionId: string;
  mapSeed: number;
  mapRadius: number; // u
  playerCap: number; // the cap the server sized the map against (feeds generateMap)
  t: number; // ms — server time at welcome (seeds the client clock)
  config: GameConfig;
  radarGrammar: RadarGrammar; // which BlipEvent member this room emits
  radarIdentity: RadarIdentity; // which id namespace blips carry
}
