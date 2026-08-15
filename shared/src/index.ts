// @salvo/shared — single barrel for the real-time prototype.
// Wire types, kinematics, geometry, and deterministic mapgen used by both
// the Colyseus server and the Pixi client (client-side prediction).

/** Bumped on any breaking change to the client/server wire protocol.
 *  37: THE REQUEUE SIGNAL RIDES THE ARENA (Story 6.3, epic-6 amendments
 *  15/17/18). New server->client channel MSG.requeue ('rq') carrying
 *  RequeueMsg { reason: 'cohortLost' }: a queue-formed room that falls below
 *  CONFIG.match.minHumans during the countdown can never refill (the cohort is
 *  sealed at forming), so it collapses — and the survivor must be able to tell
 *  that apart from a normal match-end disconnect, which returns home and waits
 *  for input. Story 6.1 held this constant at 36 because MSG.queueStatus/seat
 *  ride the QUEUE room only (amendment 6); this one rides the ARENA, so that
 *  reasoning does not cover it and the version moves. Cheap and safe by
 *  construction: protocolVersionError rejects a mismatched `pv` at the queue's
 *  door (amendment 5), so a stale client is turned away with a clear message
 *  rather than half-joining a contract it cannot read. Also riding this bump,
 *  neither of them wire-shaped: ShipRecord grows an explicit ship ROLE seam
 *  (captain | fleet) in place of the overloaded isDrone boolean, and
 *  ResultsMsg.winnerId === '' is documented as the genuine DRAW it has been
 *  since Story 5.2 rather than a can't-happen fallback.
 *  36: ROVING PvE FLEETS + THE BIGGER OCEAN (Story 5.6, Eric rulings
 *  2026-08-14, amendments 33-44). TWO independent wire breaks in one bump.
 *  (a) THE MAP MOVED: CONFIG.map.baseRadius 2400 → 2800, so THE SAME SEED NOW
 *  BUILDS A DIFFERENT OCEAN — the cycle-59 precedent exactly. Both sides
 *  rebuild islands, the height raster and the pyramid from the seed, and the
 *  client sanity-checks welcome.mapRadius, so a stale client would fail the
 *  check or (worse) sail a different coastline than the server simulates.
 *  TERRAIN_PARAMS.regionWavelength now tracks baseRadius for the same reason.
 *  (b) CONTACT GAINS AN OPTIONAL SELF-PRIVATE TRAILING `aggro`: true only on
 *  the contact rows of PvE fleet ships that have acquired THE RECEIVING
 *  OBSERVER, omitted entirely otherwise (the sinkingUntil/slowedUntil
 *  precedent). It is stripped for every other observer and for spectators, so
 *  it discloses nothing spatially new — the observer already sees the hull —
 *  and the master perception invariant keeps exactly SIX declared exceptions.
 *  A stale client would simply never draw the aggro bracket.
 *  Also riding this bump, none of it wire-shaped on its own: PvE fleet hulls
 *  fit [gun, empty, empty, empty] instead of the universal
 *  [gun, torpedo, mine, empty]; drone envelopes retune (hp 60/75/90, maxSpeed
 *  40/35/30) and gain an optional envelope-level `gun` override; the
 *  match-start drone fill is deleted, so drones no longer hold roster rows and
 *  the client detects them from Contact.cls alone.
 *  NOTE: this landed as PV 35 on its branch and was RENUMBERED to 36 on merge —
 *  cycle 82's final collapse took 35 first. The two bumps are independent and
 *  compose: the collapse adds a fourth ring group to a board this story grew.
 *  35: SUDDEN DEATH — THE FINAL COLLAPSE (Eric ruling 2026-08-14) — the storm
 *  timeline gains a FOURTH ring group whose ring is the terminal ring's own
 *  center at radius 0: marked at 14:00, closing 15:00-16:00, all storm from
 *  16:00. NO schema field, NO new event and NO perception change — the collapse
 *  ring is CONCENTRIC with the terminal ring, so it rides the wire as the
 *  existing `zoneNextR === 0` unrevealed sentinel and both sides synthesize it
 *  from geometry the client already holds. The bump is required because the
 *  group COUNT and total length change (zoneClosedAtMs 720_000 -> 960_000):
 *  the client derives the whole rhythm from its OWN BUNDLED CONFIG.zone plus
 *  zoneStartT, so a stale bundle reads the collapse group's clear beat as
 *  "closed", draws an open 660u safe circle over a map that is entirely storm,
 *  and runs its chrome-bar countdown against the wrong clock. It MISRENDERS
 *  rather than failing, which is exactly what the join gate exists to prevent.
 *  NOTE for whoever reads this next: the reason is NOT "CONFIG gained a field
 *  and CONFIG rides WelcomeMsg". It does ride it (ArenaRoom sends `config:
 *  CONFIG`), but no client code reads `welcome.config` — it is dead payload,
 *  and it carries the static shipped constant rather than the room's effective
 *  zoneCfg, so it could not convey a dev override anyway. A CONFIG field
 *  addition is not by itself a wire break in this codebase.
 *  34: THE SINKING WINDOW (Story 5.2, Eric rulings 2026-08-12, amendments
 *  10-17) — OwnShip gains an optional SELF-PRIVATE trailing `sinkingUntil`
 *  (absolute server-clock ms the hull founders; omitted entirely when not
 *  sinking — the slowedUntil precedent). It rides `you` and nothing else, so
 *  the master perception invariant keeps exactly SIX declared exceptions and
 *  no enemy-facing sinking channel exists. The key is required because the
 *  wire's `alive` boolean goes FALSE at sink-entry (amendment 11 flips the
 *  roster and bookkeeping immediately) while amendment 10 keeps every weapon,
 *  ability and the foghorn live for the flat 5 s window: the client needs a
 *  THIRD state (alive / sinking / dead) and `alive` alone cannot carry it — a
 *  stale client would read a sinking captain as plain dead, tear down the
 *  hotbar/firing arc/aim preview and snap to spectate five seconds early. New
 *  CONFIG.ship.sinkingWindowMs (5000, flat for all classes — amendment 13)
 *  rides the welcome config snapshot; new shared sim/sinking.ts (the linear
 *  decel cap both sim sides fold identically + the founder-deadline math)
 *  rides the barrel.
 *  33: THE BOUNTY (Story 4.6, Eric ruling 2026-08-10) — the held throne over
 *  captain-only kills. ArenaState gains `bountyId` (a string appended after
 *  winnerId: the holder's session id, '' while vacant — IDENTITY ONLY, never
 *  a position, class, hp, hue, or kill count; the ruling deleted the Bounty
 *  Bloom, so no radar/perception surface moves) and SunkEvent gains an
 *  optional trailing `bty?: true` (the victim held the bounty at the instant
 *  of sinking — adds no disclosure: a drone can never hold it, so it only
 *  ever rides an already-public combatant sinking). New `CONFIG.bounty`
 *  (killLevels / minCaptainKills) rides the welcome config snapshot. A stale
 *  client would miss the schema field and drop `bty` on the floor, silently
 *  mis-rendering the bounty registers, so the bump is a compatibility gate.
 *  32: RADAR WAKES (Story 4.12, Eric rulings 2026-08-08, amendments 194-196)
 *  — new `wk` GameEvent (WakeBlipEvent {k,t,a,gx,gy,w,h,bits}): a wake ribbon
 *  SEGMENT the observer's sweep crossed this tick, rasterized onto the same
 *  radar lattice as the `return`-grammar hull mask (new shared sim/wake.ts +
 *  the paintSegmentCoverage pipeline in sim/radarRaster.ts — sharp geometry
 *  plus per-paint flank glint, cycle-69 review gate — ride the barrel), carrying
 *  geometry plus a quantized water-age bucket `a` and NO identity of any kind
 *  (no ship id, class, hue, owner, or hull↔wake linkage — amendment 194).
 *  CONFIG.vision gains wakeLifeMs/wakeSampleU/wakeTorpLifeFactor (ride the
 *  welcome config snapshot). The torpedo ENTITY still never paints and its
 *  3/8 detect gate is untouched; its WAKE now does (amendment 196). A stale
 *  client would drop `wk` events on the floor and draw a scope disagreeing
 *  with the server's disclosure, so the bump is a hard compatibility gate.
 *  31: THE SERVER RASTERIZES THE HULL (cycle 63, Eric ruling 2026-08-07,
 *  amendments 151-155) — the `return`-grammar blip payload is REPLACED:
 *  {k,id,x,y,t,ext} becomes {k,t,gx,gy,w,h,bits}, a world-anchored coverage
 *  footprint (absolute cell rect + packed row-major mask) rasterized
 *  server-side from the true hull polygon on the shared radar grid
 *  (`CONFIG.vision.radarCellU`, new — promoted from the client-only heatmap
 *  cell size because it now decides what the wire says; new shared
 *  sim/radarRaster.ts rides the barrel). This REDUCES disclosure: no `id`
 *  (no correlation handle across sweeps), no `ext`, no exact position — the
 *  server does geometry only and the client computes all intensity, with the
 *  core→edge term coming from depth inside the mask (restoring amendment
 *  77's per-pixel structure). `blipGate` and the `silhouette` grammar are
 *  untouched; the decoy counterIntel rasterizes through the same shared
 *  function from its frozen drop-time pose, so wire-indistinguishability
 *  holds by construction. A stale client would read `e.ext`/`e.x` off the
 *  new shape as undefined and paint nothing (or NaN), so the bump is a hard
 *  compatibility gate, not a courtesy.
 *  30: THE EIGHTHS LADDER (Story 4.9, Eric rulings 2026-08-06, amendments
 *  113/118/119/121/122/123) — CONFIG.vision becomes the one ruler: every
 *  sensor boundary is a named eighth of intel range, derived from SIGHT
 *  exactly as `radar = SIGHT * 2` always was. New `detect` (3/8, SIGHT * 0.75)
 *  + `detectFactor` (0.75, the observer-scaled runtime multiplier) and new
 *  `farRadar` (7/8, SIGHT * 1.75, deliberately UNCONSUMED — Story 4.10's
 *  calibration target); `muzzleFlash` MOVES 6/8 → 5/8 (SIGHT * 1.5 → SIGHT *
 *  1.25, 495u → 412.5u), which drags wounded-smoke reach with it because
 *  amendment 42 reuses that one constant. `sight` and `radar` are untouched,
 *  and no damage, reload, hp, xp or catalog value moves. All of CONFIG.vision
 *  rides the welcome config snapshot.
 *  The bump is required on two independent grounds, both of which would make a
 *  stale client MISRENDER rather than fail: (1) FoghornEvent.v widens from a
 *  3-value volume TIER to an 8-value volume BAND (which eighth of the
 *  LISTENER's intel range the honker sits in — gain stays a client-side lookup
 *  and never travels), and (2) the client's torpedo dead-reckoning cull
 *  becomes detect-derived, so an un-bumped tab would keep drawing an
 *  un-corrected torpedo ghost past the range the server stopped updating it.
 *  29: THE HEIGHT FIELD (cycle 59, Eric ruling 2026-08-06) — the capsule
 *  island generator is REPLACED by a genuine fBm height field: layered
 *  integer-hashed gradient noise with domain warping, thresholded at a
 *  rank-selected sea level for the coastline, with higher isolines of the
 *  SAME field as render-only elevation contours. `Island` loses `skeleton`
 *  and gains `pole` (pole of inaccessibility) + `contours`; `core` is now
 *  measured about the pole (a hook's centroid falls in its own bay). GameMap
 *  gains the retained quantized height raster + max-height pyramid (the
 *  future radar-shadow substrate — Eric ruling 2026-08-06). Land coverage
 *  retunes 3-5% -> 2-3%. Map geometry still never travels on the wire — only
 *  `mapSeed` does — but the same seed now builds a COMPLETELY different
 *  ocean, so an un-bumped old client would rebuild a different map and desync
 *  catastrophically. The star-shape invariant is RETIRED: lagoons are
 *  eliminated by a generation-time closure pass, and collision push-out aims
 *  at the nearest boundary point instead of a skeleton normal.
 *  28: FRACTAL ISLANDS (cycle 52, Eric ruling 2026-08-05) — islands become
 *  true polygon coastlines: generateMap's circle-packing generator is
 *  REPLACED by the fractal capsule-offset generator (new `Island` type:
 *  bounding circle x/y/r + CCW boundary poly + 1-3 pt skeleton + core
 *  radius). Map geometry still never travels on the wire — only `mapSeed`
 *  does — but the same seed now yields a COMPLETELY different ocean, so an
 *  un-bumped old client would rebuild a different map and desync
 *  catastrophically. New sim/island.ts query seam (broadphase-first island
 *  geometry for every consumer) rides the barrel.
 *  CONSEQUENCE FOR EVERY LOS-GATED SENSOR (radar paint, truesight, muzzle
 *  flash, wounded smoke, and the foghorn's one-tier muffle): LOS is now
 *  polygon-EXACT where it was bounding-circle conservative, so islands block
 *  strictly LESS than they did. Every sensor reaches marginally further past
 *  a coastline; nothing reaches less far. This is the 2026-08-02 "islands
 *  block every sensor" law applied to the true coastline instead of a
 *  circumscribed circle.
 *  27: THE RADAR REALISM CYCLE (Eric rulings 2026-08-05, amendments 62-75) —
 *  one bump covering "a blip may carry either shape" (amendment 72). Landed in
 *  PARALLEL with Story 4.5 (the foghorn, 26 below): both cycles branched from
 *  PV 25 and both claimed 26; 4.5 merged first, so this cycle renumbered to 27
 *  and its amendments from 51-64 to 62-75.
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
 *  26: THE FOGHORN (Story 4.5, Eric rulings 2026-08-05, amendments 51-58) —
 *  two wire-shape changes in one bump: (1) new `fh` GameEvent (FoghornEvent
 *  {k,h,self?,b?,v?,x?,y?}), the SIXTH declared exception to the master
 *  perception invariant and the FIRST row whose payload varies BY OBSERVER in
 *  substance — a fogged listener gets BEARING + VOLUME TIER + horn id and
 *  NEVER a position, ship id, or correlation handle (amendment 51), the
 *  honker gets {k,h,self}, and only the omniscient spectator path gets x/y;
 *  and (2) InputMsg gains required `hornSeq` (cumulative honk counter,
 *  max()-consumed, the fireSeq/actSeq grammar). Tiers derive from the
 *  LISTENER's effective ranges, so no vision constant was added (amendments
 *  42/53); islands MUFFLE by one tier instead of blocking (amendment 54). New
 *  shared HORN_IDS/HornId/DEFAULT_HORN_ID/sanitizeHornId catalog (exactly one
 *  horn, 'standard' — a second horn is Eric-gated content, amendment 52) and
 *  a new CONFIG.foghorn block (cooldownMs) riding the welcome config
 *  snapshot; join options gain an optional `horn`. No roster/PlayerMeta
 *  schema field, no kill-feed line, no XP or damage — it is an emote.
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
export const PROTOCOL_VERSION = 37;

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
export * from './sim/lifecycle.js';
export * from './sim/sinking.js';
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
export * from './sim/radarRaster.js';
export * from './sim/island.js';
export * from './sim/aim.js';
export * from './sim/shell.js';
export * from './sim/map.js';
export * from './sim/noise.js';
export * from './sim/heightField.js';
export * from './sim/radarShadow.js';
export * from './sim/wake.js';
export * from './sim/zone.js';
