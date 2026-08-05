// @salvo/shared — single barrel for the real-time prototype.
// Wire types, kinematics, geometry, and deterministic mapgen used by both
// the Colyseus server and the Pixi client (client-side prediction).

/** Bumped on any breaking change to the client/server wire protocol.
 *  26: THE RADAR REALISM CYCLE (Eric rulings 2026-08-05, amendments 62-73) —
 *  one bump covering "a blip may carry either shape" (amendment 72).
 *  BlipEvent becomes a two-member union with NO per-event discriminator:
 *  SilhouetteBlipEvent (the shipped 4.2 shape, byte-stable {k,id,x,y,t}
 *  prefix then cls/heading/speed, unchanged) | ReturnBlipEvent
 *  ({k,id,x,y,t,ext} — ext the hull silhouette's extent projected
 *  perpendicular to the observer→target bearing, pure aspect geometry in
 *  world units, no range term; amendment 66's anti-cheat bound: never boons,
 *  hp, damage state, or any range-derivable flight quantity). The server
 *  picks ONE grammar per room and announces it in the welcome — WelcomeMsg
 *  gains required radarGrammar ('silhouette'|'return') and radarIdentity
 *  ('roster'|'pseudonym'), both defaulting to today's behavior so production
 *  is byte-identical until a server flag flips (amendment 63). CONFIG is
 *  untouched (CONFIG.vision gains no new constant).
 *  25: WOUNDED SMOKE (Story 4.4, Eric rulings 2026-08-05) — new `sm`
 *  GameEvent ({k,x,y,tier}: a hull is hurt HERE, this hurt), the FIFTH
 *  declared exception to the master perception invariant and the first
 *  enemy-hp-derived information ever put on the wire. The payload carries NO
 *  identity of any kind for ANY observer (amendment 45) and `tier` is a
 *  two-value ENUM, never a fraction or hp value (amendment 41). New
 *  CONFIG.damageBands block (amberBelow/criticalBelow — the own-vitals HP
 *  rail's shipped thresholds promoted unchanged, now the ONE source for both
 *  the rail and the smoke tiers) and CONFIG.smoke block (puffIntervalMs);
 *  both ride the welcome config snapshot. Reach adds NO vision constant — it
 *  reuses CONFIG.vision.muzzleFlash verbatim (amendment 42).
 *  24: DAMAGE CONTROL (Eric rulings 2026-08-04) — the heal spend returns as
 *  an ALWAYS-AVAILABLE spend, NOT a card: nothing enters BOON_CATALOG and
 *  deck composition is byte-identical (CONFIG.offer.size stays 4).
 *  `SpendMsg.choice` gains the reserved NEGATIVE sentinel HEAL_CHOICE (-1;
 *  card picks stay 0..front-offer-length-1, everything else rejected);
 *  OwnShip gains required self-private `repairHp` (remaining regen pool, hp
 *  — rides `you` and nothing else, the boostUntil precedent); new
 *  self-private `heal` GameEvent ({k,id} — the instant application at spend
 *  time, the pt/bn gate); new CONFIG.damageControl block
 *  (instantHp/regenHp/regenMs) rides the welcome config snapshot.
 *  23: the public register (global kill feed) — SunkEvent gains an optional
 *  per-observer `seen?: true` flag, stamped by the sunk row's materialize()
 *  when the observer legitimately witnessed the wreck (sight+LOS / owned lit
 *  zone / own hull / spectator). The sunk row's gate widens to three clauses
 *  (witnessed, OR the victim is a human captain — identity-only public
 *  delivery, OR you are the credited killer), making `sunk` the 4th declared
 *  exception to the master perception invariant. Key order k,id,by?,seen?;
 *  absent keys are omitted entirely (never an undefined value).
 *  22: the gunnery conversation (Story 4.3, amendments 15-20) — three new
 *  GameEvent kinds, each its own declared fog exception in the signal
 *  registry: `sp` (SplashEvent {k,id,x,y} — fall of shot, self-private to
 *  the shooter, gun family only), `hc` (HitCallEvent {k,id,x,y} —
 *  shooter-only hit confirmation across ALL ordnance, position but never
 *  severity or victim), and `mz` (MuzzleEvent {k,x,y} — a NEUTRAL gun-family
 *  muzzle flash carrying no identity for anyone, visible within the derived
 *  CONFIG.vision.muzzleFlash halo (SIGHT * 1.5) with island LOS). CONFIG.
 *  vision gains muzzleFlash (rides the welcome config snapshot).
 *  21: global cooldown reduction (Eric rulings 2026-08-04) — BOON_CATALOG
 *  content changed, and catalog content IS wire contract: the seven
 *  per-equipment reload lines (gunReload/cannonReload/torpedoReload/
 *  mineReload/boostReload/starReload/decoyReload) are DELETED and one
 *  universal `shipCooldown` line (category 'ship', common ×5) replaces them,
 *  driving the new base-1.0 `cooldownScale` EffectiveStats scalar additively
 *  (−0.1/card) into EVERY equipment reloadMs. 42 lines → 36. CONFIG.gun.
 *  reloadMs 3000→5000 and CONFIG.cannon.reloadMs 15000→50000 also ride the
 *  welcome config snapshot. No FrameMsg/schema shape changes.
 *  20: class-legible blips (Story 4.2, FR14) — BlipEvent gains `cls` (HullId),
 *  `heading`, and `speed` (the raw signed scalar), APPENDED after `t` so the
 *  historical {k,id,x,y,t} prefix stays byte-stable. A genuine paint carries
 *  the ship's live pose; a decoy buoy's counterIntel paint carries its frozen
 *  drop-time cls/heading with speed exactly 0 (a radar reflector reports true
 *  stationary values) — same shaper, field-for-field identical.
 *  19: join window before the countdown — MatchPhase gains 'gathering'
 *  (waiting → gathering at minHumans: the room stays UNLOCKED for
 *  CONFIG.match.joinWindow ms, then the unchanged locked countdown arms).
 *  ArenaState.countdownEndT is REDEFINED as the current-phase deadline
 *  (gathering window end during 'gathering', countdown end during
 *  'countdown', 0 otherwise) — no new schema field. CONFIG.match gains
 *  joinWindow (rides the welcome config snapshot).
 *  18: phased zone timeline + map bump (Story 3.1) — three wire deltas in one
 *  bump: (1) CONFIG.zone is RESHAPED in the welcome config snapshot
 *  (grace/shrinkDuration/endRadiusFraction die; beatMs/ringSteps/offsetCap/
 *  terminalSightFactor ship; stormDps survives) and CONFIG.map/match retune
 *  (baseRadius 900→2400, capRef 6→20, fillTo 6→20); (2) the ArenaState zone
 *  plane changes: the animated `zoneRadius` float is REPLACED by revealed-only
 *  ring geometry — `zoneCurCx/zoneCurCy/zoneCurR` (ring g as of the last ring
 *  boundary, always present once started) and `zoneNextCx/zoneNextCy/zoneNextR`
 *  (ring g+1, ZEROED except from that group's reveal beat through its close —
 *  clients NEVER receive unrevealed ring geometry; centers are server-private,
 *  amendment 10); the client derives the live 60fps ring by interpolating
 *  current→next from zoneStartT + CONFIG via the shared zoneLiveState();
 *  (3) the `zoneState` value set changes: 'grace'/'shrinking' die,
 *  'clear'|'supply'|'reveal'|'closing' ship ('idle'/'closed' survive).
 *  No FrameMsg changes.
 *  17: doctrine-distinct lit zones (Story 2.9, amendment 50) — LitZoneView
 *  gains a trailing `mode` ('standard'|'incendiary'|'dazzle'): the firer's
 *  star-shell doctrine stamped on the zone record at zone-spawn time,
 *  delivered to EVERY legitimate observer of the circle (counterplay over
 *  concealment — the zone's nature is observable behavior of the fired
 *  shell, not a build leak). The server always emits it; the field is
 *  optional on the type only so a mode-blind reader defaults to 'standard'.
 *  16: Boon Catalog v1 + THE DECK MODEL (Story 2.8) — one bump for the story's
 *  every wire delta: (1) BOON_CATALOG is REPLACED wholesale (dummy set → the
 *  42-line v1 catalog across 9 categories; per the content-is-contract
 *  convention the replacement alone is a break); (2) the legacy upgrade
 *  system leaves the wire — `OwnShip.upg` deleted, the `upg` GameEvent
 *  deleted, UPGRADE_IDS/UPGRADE_CATEGORIES/CONFIG.upgrades gone from the
 *  welcome config snapshot (the sweep ceiling re-homes to
 *  CONFIG.vision.sweepRpmMax); (3) OwnShip gains optional victim-private
 *  `slowedUntil` and `dazzledUntil` (prop-fouling slow / dazzle windows,
 *  riding `you` only — the boostUntil precedent); (4) new `torpU` GameEvent
 *  (TorpedoUpdateEvent {k,id,x,y,vx,vy,t} — a homing torpedo's constant-free
 *  ballistic update; seenBallistics exactly-once relaxes to allow updates);
 *  (5) catalog-driven behavior changes ride the config snapshot: star shells
 *  are damageless (CONFIG.starShells.damage deleted; incendiary/dazzle
 *  doctrine fields added), the mine is a click-aimed rear-arc weapon
 *  (EQUIPMENT_IS_WEAPON.mine true; CONFIG.mine gains placeRange,
 *  placeHalfArcDeg, the foul and creep doctrine fields), CONFIG.torpedo gains
 *  the homing fields + commandBurstRadius, and
 *  new CONFIG.deck (rare-weight dials) ships. Offers are deck-drawn
 *  (rollBoonOffer died; sim/deck.ts is the engine).
 *  15: offers — roll, bank, spend (Story 2.7) — the offer flow goes fully
 *  boon-typed. `OwnShip.offer` RE-TYPES from UPGRADE_IDS indices (number[]) to
 *  BOON IDS (string[]) and grows from 3 entries to `CONFIG.offer.size` (4,
 *  a new welcome-config block); `SpendMsg.choice` is therefore 0..3, bounded
 *  server-side by the front offer's actual length. New self-private
 *  `bn` GameEvent ({k,id,boon} — a boon FITTED by a spend), riding `you`'s
 *  observer only, exactly like `upg`/`pt`. BOON_CATALOG ships its interim
 *  DUMMY content (10 stat-only boons across 5 categories, amendment 35) — and
 *  per the convention below, catalog content alone is a wire break. The legacy
 *  `upg` event and OwnShip.upg stay on the wire but are production-unreachable
 *  (nothing rolls or spends an upgrade any more); they die in 2.8.
 *  14: XP tick & kill bonuses (Story 2.6) — OwnShip gains required
 *  self-private `lvl` (integer levels completed) and `xp` (0..1 progress
 *  toward the next level), riding `you` and nothing else (the upg/pts/boons
 *  precedent). New `CONFIG.xp` block (levelMs / killLevels / droneTierLevels)
 *  rides the welcome config snapshot. Level-ups are now the ONLY thing that
 *  banks a point — the `pt` event and the offer shape are unchanged, so a
 *  stale client would silently mis-render progression rather than fail.
 *  13: boon effect engine dormant plumbing (Story 2.5) — OwnShip gains
 *  required `boons` (applied boon ids, self-private: rides `you` and nothing
 *  else, the upg/boostUntil precedent). Always [] until Story 2.7's spend
 *  flow grants any (BOON_CATALOG ships empty); new shared sim/boons.ts +
 *  sim/hooks.ts (the wire field's client-side consumers).
 *  CONVENTION (from 13 onward): BOON_CATALOG and HOOK_REGISTRY content IS wire
 *  contract — adding, removing, or changing ANY entry in either REQUIRES a
 *  PROTOCOL_VERSION bump. Both sides resolve boon ids/hook ids fail-closed
 *  (unknown = silently dropped), so a stale client would silently ignore a
 *  boon or hook the server is simulating; this join gate is the only guard.
 *  12: the new input scheme (Story 2.1) — the interregnum REPAIR/heal spend is
 *  deleted end-to-end (Eric ruling 2026-07-24 "1-4 cards, no repair"):
 *  HEAL_CHOICE and the self-private 'heal' GameEvent leave the wire contract
 *  (SpendMsg.choice is 0..2 only); CONFIG.upgradePoints (healHp) is removed
 *  from the welcome config snapshot.
 *  11: Regatta Hoist personal colors (Story 1.12) — the roster schema gains
 *  PlayerMeta.color (uint8 hue index 0–19, 255 = drone/no-hue sentinel);
 *  join options gain optional colorPref (0–19); MineView + DecoyView each gain a
 *  trailing `by` (owner ship id) so ordnance markers render in the firer's
 *  personal hue for every observer (a deliberate intel grant, Eric 2026-07-23).
 *  10: firing arcs for the class era (Story 1.10) — FrameMsg gains optional
 *  self-private `denied` (DeniedView {slot,reason,seq}: the server's denial
 *  signal, reasons 'out-of-arc'|'no-ammo'|'cooling'|'blocked'); CONFIG's
 *  gun/cannon/starShells blocks gain the ratified `arc: 'full'` declaration
 *  (rides the welcome config snapshot); new shared sim/arcs.ts (arcFor).
 *  9: mine-layer loadout (Story 1.8) — the mineLayer fit becomes
 *  [gun, mine, decoyBuoy, empty]; mine flips to the ability (actSeq) channel;
 *  FrameMsg gains optional decoys (DecoyView {id,x,y,until,own}); CONFIG.mine gains
 *  blastRadius + a trigger/maxLive retune; CONFIG gains a decoyBuoy block (all
 *  ride the welcome config snapshot).
 *  8: battleship loadout (Story 1.7) — FrameMsg gains optional litZones
 *  (LitZoneView {id,x,y,r,until,by}: star-shell lit zones, owner-always /
 *  radar-gated circle); CONFIG gains cannon + starShells blocks (rides the
 *  welcome config snapshot); the battleship fit becomes
 *  [gun, cannon, starShells, empty].
 *  7: torpedo-boat loadout (Story 1.6) — InputMsg gains required actSeq/actSlot
 *  (instant ability activation); OwnShip gains required owner-only boostUntil
 *  (active speed-boost window end, server-clock ms).
 *  6: firing under latency (D1) — InputMsg gains required fireT (client
 *  server-clock fire timestamp, 0 = no claim); new 'p' ping channel
 *  (PingMsg/PongMsg) for server-side RTT measurement.
 *  5: universal standard gun — InputMsg.weapon (WeaponId) replaced by
 *  InputMsg.slot (loadout slot index); OwnShip.weapon removed; OwnShip.ammo
 *  became slot-aligned (WeaponAmmo | null)[]; new 'burst' GameEvent;
 *  WeaponId/WEAPON retired from the wire contract.
 *  4: three-hull-envelopes re-scope — the `cls` values on the wire changed
 *  (torpedoBoat/battleship/mineLayer classes; Contact.cls widened to HullId
 *  with droneSmall/droneMedium/droneLarge).
 *  3: Colyseus 0.17 / @colyseus/schema 4.x serializer wire break. NOTE: this
 *  constant IS a runtime join gate (since 1.4): the server rejects a
 *  mismatched-or-missing client `pv` at matchmake time with a clean version
 *  error (server/src/rooms/roomOptions.ts protocolVersionError), before any
 *  seat is reserved. */
export const PROTOCOL_VERSION = 26;

// Tunables
export * from './constants.js';

// Wire contract
export * from './types.js';

// Math
export * from './math/vec.js';
export * from './math/angle.js';
export * from './math/geom.js';
export * from './math/rng.js';

// Simulation
export * from './sim/ship.js';
export * from './sim/stats.js';
export * from './sim/boons.js';
export * from './sim/hooks.js';
export * from './sim/loadout.js';
export * from './sim/arcs.js';
export * from './sim/boost.js';
export * from './sim/slow.js';
export * from './sim/offers.js';
export * from './sim/deck.js';
export * from './sim/collision.js';
export * from './sim/silhouette.js';
export * from './sim/aim.js';
export * from './sim/shell.js';
export * from './sim/map.js';
export * from './sim/zone.js';
