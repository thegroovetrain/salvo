# Epic 4 Context — Ratified Amendments

Durable, append-only record of ratified corrections to `epic-4-context.md` (bmad-dev-auto amendments protocol, Epic 1 retro Action #1). On any conflict with compiled epic context or planning docs, these entries WIN.

## 2026-08-04 — Eric ruling, Story 4-1 pre-implementation question gate (bmad-dev-auto run, this session)

Source: Eric, live design conversation during the Story 4-1 run. Full record with investigation
findings and the reasoning chain: `bmad-dev-auto-result-4-1-listening-ring-deferred.md`.

1. **Story 4.1 (The Listening Ring) is DEFERRED — the hydrophone sensor tier is not built.** Eric
   verbatim: *"Lets go ahead and defer the hydrophones, we'll save it as a feature we can add later
   if I decide we need it. I think there's enough information, and active sonar is going to be added
   anyway."* This is a deferral, NOT a cut: the story number is not retired and the feature stays
   available for a future ruling. Rationale of record: (a) the game already carries enough
   information channels; (b) **active sonar** is planned and occupies adjacent design space, so the
   third-tier complexity budget should not be spent on passive hydrophones first; (c) the ring's
   value was shown to be contingent on a torpedo/mine rebalance that has not happened — against
   today's weapons it is counterplay for threats that do not need countering.

   Consequently the following statements in the compiled `epic-4-context.md` are SUPERSEDED for as
   long as this amendment stands: "the listening ring is a third perception tier computed inside the
   observer"; "listening events are bearing-only"; the listening-ring row of the UX grammar section;
   and the wire-vs-visual asymmetry ruling (which resolved a question that is now moot, though the
   resolution itself remains correct if the tier is ever revived). Epic 4's three-tier sensor suite
   is, for now, a TWO-tier suite: truesight bubble + radar sweep.

2. **Torpedo speed is NOT a balance lever — 60 u/s stands.** Eric: *"Torps wont be faster (60 to 80
   knots is realistic)."* The current value already maps to a realistic torpedo speed, so any future
   argument that "faster fish makes a warning tier necessary" is foreclosed at the source. Torpedo
   lethality, if raised, must come from damage, reload, or delivery — not speed.

3. **Weapon cooldowns are likely going UP across most or all weapons** (Eric, same message:
   *"Im probably gonna raise the cooldowns on most if not all weapons too"*). Recorded as design
   DIRECTION, not as a ratified change — no cycle may implement it without an explicit ruling on the
   actual numbers. It sets the expected rebalance shape: longer commitment cycles rather than more
   lethal individual shots. Any future spec touching weapon pacing should check for a superseding
   ruling before assuming current `reloadMs` values are stable.

4. **Downstream consequences of amendment 1, flagged and NOT decided here:**
   - **Story 4.5 (The Foghorn)** loses its ratified display surface (the honk lights an arc sweep
     along its bearing on every listening ring in earshot). 4.5 must either grow its own bearing
     surface or defer alongside — a call for the 4.5 spec author, with Eric.
   - **Story 4.7 (Real-Time Sound Map)** narrows to the events 4.3/4.5/4.6 actually introduce; the
     listening-ring audio grammar leaves its scope.
   - **Story 4.8 (Attention Priority)** loses one Tier-1 channel. Its tier table must not pin a
     listening-ring channel that does not exist; the shipped Tier-1 channels are the low-HP rail
     pulse and the live denied pulse.
   - **The deferred submarine class** loses hydrophones as its designed counterplay; active sonar
     becomes the presumptive answer whenever the submarine is reconsidered.
   - **The 2026-08-02 radar/island LOS ruling** named hydrophones as the designed answer to
     close-range island shadows. That answer is now deferred — island shadows remain a total blind
     spot until active sonar ships. The LOS ruling itself is unchanged and still stands.

5. **Correction of record (numbers used in the deferral argument).** Battleship turn rate is
   **0.4 rad/s** (90° in ~3.9s) — not the ~0.2 that a naive read of the 2026-08-03 objective pip
   ladder suggests. The existing 5.5s of truesight torpedo warning is therefore already sufficient
   TIME to comb the tracks; the real gap the ring would have addressed is ATTENTION, not time. Any
   future revival of this story must argue from that corrected premise.

6. **Doc drift found during investigation, ledgered not fixed** (house rule: no design-doc edits
   in-cycle): EXPERIENCE.md:137 and the Story 4.7 AC both say "the 13 existing tones", but the
   shipped catalog is **22** tones (`client/src/audio/tones.ts`) — the count predates Stories
   1.7/1.8/1.10/2.9. The same text calls the denied tone "deferred"; it shipped in Story 1.10.
   Additionally `CLAUDE.md` records `PROTOCOL_VERSION` as "currently 18" — actual is **19**. All
   three belong to the Eric-gated doc-sync batch (Story 7-5 family).

## 2026-08-04 — Eric rulings, Story 4-2 pre-implementation question gate (bmad-dev-auto, this session)

Source: Eric, live design conversation during the Story 4-2 run. Governing instruction, verbatim:
*"how does it work on a real radar? just do that."* Then, on being shown that true-scale hull
outlines are not real radar behavior: *"I was originally thinking it would just paint the current
outline of the ship in whatever its current position is. I know that's not really realistic, but
this is still a video game?"* — followed by **"confirmed."** Spec of record:
`spec-4-2-class-legible-blips.md`.

7. **Blips paint the TRUE-SCALE hull silhouette at true position and true heading.** A radar paint
   is the ship's real outline at its real size — NOT a floor-clamped pixel miniature. This
   **SUPERSEDES** the ratified DESIGN.md blip block and the matching clause in the compiled
   `epic-4-context.md` ("minimum sizes floor-clamped so class stays readable at blip scale"):
   the per-class px table (**BB 14 / ML 12 / TB 11**), the 11px floor-clamp rule, the **3×-deep Mine
   Layer blip notch**, the exaggerated Gunboat shoulder flare, and "aspect ratio and size do the
   discriminating work at blip scale" are all **retired**. Rationale of record: those levers existed
   only to make a tiny symbol legible; at true scale a 124u battleship and a 100u torpedo boat are
   unmistakable without exaggeration, the blip footprint equals the hull footprint (and the
   silhouette IS the hitbox, UX-DR9), and a true-scale return is in fact CLOSER to real radar than
   fixed-size symbology, which is a modern ARPA convention drawn on top of the return.
   Implementation consequence: blips reuse `shared/src/sim/silhouette.ts` `hullSilhouette()`
   verbatim — no blip-specific geometry may exist. The 1px non-scaling hairline stroke is KEPT.

8. **Radar BEHAVIOR is realistic; the silhouette grammar is the retained game conceit.** Eric chose
   this over full realism (size-scaled blobs with no class on the wire, which would have superseded
   UX-DR10 and rewritten the story) and over the hybrid (live paint shaped, ghosts as blobs).
   FR14 stands. Where a behavior question was open, real radar practice settles it (amendments 9-11).

9. **Three-paint persistence.** A blip now lives ~3 sweep periods: the live paint plus 2 decaying
   ghosts (~12s of track at 15rpm), each keeping its silhouette. This REVERSES Eric's own earlier
   provisional pick of one-sweep decay, reversed by him on the realism argument — long-persistence
   phosphor is how course and speed are actually plotted off a scope. It also gives the story's
   "≤3 ghosts per contact" AC line something real to bound (under one-sweep decay the cap could
   never trigger). Emergent property worth preserving: ghost SPACING encodes speed, so a fast hull's
   ghosts sit nose-to-tail while a loitering hull's overlap into a blob.

10. **ARPA-style speed vector** — an arrowhead vector off the blip whose length is proportional to
    speed, clamped at both ends. Speed rides the wire as the RAW `state.speed` scalar only; no
    derived cap, max-speed fraction, or boost flag (those leak build state).

11. **The decoy buoy is a radar reflector: it reports TRUE STATIONARY values.** `speed` is exactly
    0; `cls` and `heading` are frozen from the owner AT DROP TIME onto the `Decoy` record. The
    payload stays field-for-field identical to a genuine paint (the wire-indistinguishability law is
    a PAYLOAD law), and the lie is unmasked only by BEHAVIOR over time — which is exactly how real
    decoys fail. Explicitly REJECTED: a live read of the owner's kinematics (leaks the owner's live
    course and speed at a false position while they are fogged, and is undefined for the up-to-30s
    window in which a buoy outlives its owner), and the fake-drift ghost track Eric initially leaned
    toward before the realism ruling superseded it. `cls` is always `mineLayer` in practice — only
    the ML fits a decoy buoy, which is inherent to the weapon, not a new disclosure. Accepted
    consequence: with persistence, a stationary buoy's stacked paints unmask it in ~2 sweeps, a real
    nerf to Story 1.8's decoy that Eric accepted knowingly.

12. **Drones paint the legacy chevron at TRUE size, all three tiers** (bigger hull, bigger return) —
    consistent with realism AND with the already-ratified "legacy chevron silhouette (+ its sizes)".

13. **Per-hue luminance floor is ALGORITHMIC, not a hand-authored table** — lift each hue's relative
    luminance to a target while preserving hue. This **RESOLVES** the DESIGN.md open question ("The
    exact per-hue variant table is an Open Question; the mechanism is not") by removing the table
    entirely, and covers the 8 colorblind-assist families for free. **Variant P** (phosphor-anonymous
    blips) is a BUILD-TIME define, default Variant C.

14. **Doc drift added to the 7-5 batch by this ruling** (no design-doc edits in-cycle): DESIGN.md's
    blip-size table and blip-rule paragraph, and EXPERIENCE.md's sensor-presentation line, are
    superseded by amendment 7 and must be reconciled in the Eric-gated doc-sync batch.

## 2026-08-04 — Eric rulings, Story 4-3 pre-implementation question gate (bmad-dev-auto, this session)

Source: Eric, live design conversation during the Story 4-3 run (two AskUserQuestion rounds, six
rulings). Spec of record: `spec-4-3-the-gunnery-conversation.md`. The governing shape of the answers
is CONSISTENTLY NARROW: at every fork Eric took the smallest new information channel that still
satisfied the story, which is the same instinct that produced amendment 1 (the 4-1 deferral).

15. **Muzzle flash carries to 1.5 × truesight — a MODEST HALO, not radar range and not map-wide.**
    `CONFIG.vision.muzzleFlash = SIGHT * 1.5` (495u at today's 330u sight), DERIVED from truesight
    exactly as `radar = SIGHT * 2` is (epic-3 amendment 22), so retuning truesight moves the flash
    halo with it. Explicitly REJECTED: radar range (660u) as "the natural same-ceiling-as-radar
    read", unbounded map-wide flashes ("firing lights the fog" read literally), and deferring
    muzzle-carries alongside 4.1. Consequence of record: a shooter just outside your bubble gives
    themselves away, but a radar-range duel stays anonymous — radar remains the ONLY long-range
    sensor, and the 165u-wide flash annulus is deliberately thin. **LOS applies** (islands block the
    flash) — not a new decision, but the direct consequence of the standing 2026-08-02 radar/island
    LOS ruling that islands block EVERY sensor at ALL ranges.

16. **Fall-of-shot splashes are SELF-PRIVATE — your own misses only.** A splash renders at its true
    impact point even in fog, for the shooter alone, so bracket-and-walk fire works (FR16, GDD #21).
    This RESOLVES the direct doc conflict between FR16 / the Story 4.3 AC ("**own** splashes",
    "**my** misses") and EXPERIENCE.md:181, which drops the ownership qualifier: **FR16's wording
    wins, EXPERIENCE.md:181 is the drift.** Explicitly REJECTED: anyone's misses inside radar range
    (a second fog-piercing public channel), and the status quo (splashes only where you can already
    see, which leaves 4.3's first AC unmet). Splash is a GUN-FAMILY signal only (wire kind `shell` —
    gun, cannon, star shells); torpedoes and mines have no fall-of-shot.

17. **The Hit Call is SHOOTER-ONLY and it DOES override the shipped anti-leak rule.** The comment at
    `server/src/game/signals.ts:556` — *"The shell's owner does NOT get an out-of-sight boom — hit
    confirmation beyond sight would leak contact presence"* — is **SUPERSEDED for the owner-hit case
    and only that case**. Leaking "something of yours connected out there" is now the intended
    feature, not an accident, and it is what keeps the ratified decoy disambiguation oracle alive
    (gdd.md:179, epics.md:486, game-architecture.md:791-794): "shooting a decoy produces no Hit
    Call" is only meaningful counterplay if you would normally GET one at fog range. The victim
    keeps ONLY their existing private tells (dmg / shake / vignette — no new "someone unseen hit
    you" cue); bystanders keep today's rule (bloom only at impacts they can already see). Explicitly
    REJECTED: bystanders inside radar range, an extra victim cue, and keeping the anti-leak rule
    intact (which would have killed the decoy oracle).

18. **Hit Call scope is ALL ORDNANCE — gun, cannon, star shells, torpedo, mine.** Anything you fired
    or laid that connects tells you so. This RATIFIES EXPERIENCE.md:223's Journey B climax (a mine's
    proximity fuse produces a Hit Call) against the narrower "Gunnery Conversation" framing of the
    story title. Accepted consequence of record: **a Mine Layer learns remotely that a trap sprung**,
    intel about a stretch of water they may be nowhere near — judged to be the point of laying traps.
    Note the asymmetry with amendment 16 that this creates and that is INTENTIONAL: Hit Call covers
    every weapon, splash covers only the gun family.

19. **The muzzle flash is NEUTRAL — it says someone fired, never who.** Payload carries position
    only: no shooter id, no personal hue, no weapon-type weight. This RESOLVES the head-on conflict
    between DESIGN.md:239 (neutral `{muzzle}` token) and UX-DR7 ("ordnance truth-markers in the
    FIRER's hue for ALL observers") **in DESIGN.md's favor for this signal**: the flash must create a
    question, not answer one — you still have to sweep radar or close to truesight to learn class and
    identity. Explicitly REJECTED: personal-hue flashes, and a heavier flash for the cannon (which
    would put a class tell on the wire that deliberately does not exist today — the shipped
    `muzzleHeavy` is own-side only precisely because the wire cannot say "cannon").

20. **Muzzle flash fires for the GUN FAMILY only — gun, cannon, star shells. Torpedoes stay silent.**
    This UPHOLDS the shipped "quiet weapon" ratification (`client/src/net/roomBindings.ts:597`)
    rather than reversing it; with 4.1 deferred there is already no long-range torpedo warning of any
    kind, and Eric declined to add the launch as one. Mine and decoy stern-drops have no muzzle
    either way. Implementation consequence: the flash predicate is exactly "the spawned ballistic's
    wire kind is `shell`", which selects gun + cannon + star shells and excludes `torp` with no
    weapon-type enumeration anywhere — so the server never needs a per-weapon flash table, and no
    weapon identity can leak through one.

## 2026-08-04 — Eric rulings, interstitial weapon balance pass (bmad-dev-auto, cycle 44)

Source: Eric, invocation intent plus a four-question pre-implementation gate (AskUserQuestion,
all four answered on the recommended option). Spec of record:
`spec-weapon-balance-and-radar-vector-length.md`. Evidence:
`batch-sim-evidence-2026-08-04.md`. This is the SECOND half of the rebalance amendment 3 predicted
as design direction — cycle 42 moved cooldowns globally, this cycle moves per-weapon damage,
per-weapon cooldowns, and the mine rack depth.

21. **The retuned armory (Eric, verbatim intent).** `gun.damage` 25 → **15** and
    `gun.contactDamage` 10 → **6**; `torpedo.damage` 55 → **70** with `reloadMs` 12000 → **30000**;
    `cannon.damage` 50 → **65** with `reloadMs` 50000 → **45000**; `mine.damage` 45 → **55**,
    `reloadMs` 8000 → **15000**, and `maxAmmo` 1 → **2**. The shape is explicit: the permanently
    fitted default weapon gets weaker, the committed skillshots get heavier and slower, and the
    cannon's same-day 50s retune is walked back 5s as an overshoot. `contactDamage` was scaled with
    the burst (Eric ruling) to hold the bodyblock at 40% of a full hit rather than letting the nerf
    silently buff interception. **`torpedo.speed` stays 60** — amendment 2 is untouched and remains
    in force.

22. **The 2-deep mine rack is a BASE change, not a card.** `mine.maxAmmo: 2` ships as the base fit,
    explicitly modelled on what `torpedoTube` does for the bow tube — Eric's framing was "as if it
    had something similar to the torpedo extra tube enhancement", and the ruling makes it standard
    equipment rather than a boon. It reuses the shared pool state machine
    (`server/src/game/equipment/ammo.ts`) **verbatim, with zero code changes**: one round refills
    per `reloadMs` with overshoot carry, so the rack returns to 1/2 at 15s and 2/2 at 30s. Eric
    confirmed this per-round cadence over a whole-rack refill specifically because the latter would
    have made mines the only weapon in the game with bespoke ammo machinery. `mine.maxLive` (5)
    is UNTOUCHED and remains a distinct cap — the pool bounds drops before reloading, `maxLive`
    bounds hulls on the board. The `mine.maxAmmo` stat path stays whitelisted-but-uncarded so a
    future rack card can still compose on top.

23. **Two catalog ladder steps SHRINK to keep the one-hit-kill law.** `torpedoDamage` +2 → **+1**
    and `cannonDamage` +3 → **+2** per card (both still 5 copies). At the retuned bases those
    ladders would otherwise have topped out at exactly **80** — precisely the hp of the small drone,
    the lightest hull afloat since the 2026-08-03 toughness ladder — and one-shot an undamaged hull,
    which `HULLCRACKER_NOTES.md:83` forbids ("nothing should be a 1-hit kill on an otherwise
    undamaged ship") and `damageGuardrail.test.ts` enforces. Eric chose shrinking the steps over
    three alternatives that were explicitly REJECTED: lowering the requested bases by 5 each, raising
    drone hp to lift the guardrail ceiling, and relaxing the law to protect only player hulls (125hp
    TB) while accepting that a max-stacked fish deletes a drone. Ratified max-stack endpoints are now
    **gun 30 / cannon 75 / torpedo 75 / mine 75**, all strictly under 80. Consequence of record: the
    upgrade curve on those two lines is deliberately flatter — the base number is the ratified one,
    so the step gives.

24. **The ARPA speed vector halves in ALL THREE knobs.** `CLIENT_CONFIG.blip.vector`
    `seconds` 3 → **1.5**, `minLength` 24 → **12**, `maxLength` 150 → **75**. Eric's signal was that
    the Story 4.2 vector "is too long, maybe cut the scaling in half"; the ruling scales the whole
    mark rather than only its rate, because halving `seconds` alone would leave the 24u floor
    dominating every contact under 16 u/s (a crawler's stub reading proportionally LONGER than a
    cruiser's shaft) and strand `maxLength` beyond the reach of any hull in the game. The ARPA
    meaning is preserved exactly — the tip is still where the contact will be in `seconds` — only
    the horizon shortens. Amendment 10 stands; this retunes its geometry, it does not supersede it.
    Client-only, no wire change.

25. **Scope discipline of record.** This cycle is values-only: **no `PROTOCOL_VERSION` bump**
    (22 stands — no wire shape changed), no new machinery, no new catalog cards, no changes to
    drone/class hp, torpedo speed, `mine.maxLive`, `gun.maxAmmo`, or any range/geometry constant.
    Two smoke-harness wall-clock budgets WERE widened (`weaponsSmoke` torpedo phase 120s → 240s,
    `dronesSmoke` drone-kill phase 170s → 300s) because the 12s → 30s torpedo reload cut their miss
    margin from roughly seven spare fish to one; the assertions are unchanged, only the patience.
    This was proven necessary, not precautionary: the post-retune `weaponsSmoke` run needed 4
    torpedoes / 3 hits to sink a 125hp hull, which would have blown the old 120s budget outright.

26. **Post-evidence rulings — the retune STANDS, and pacing is accepted as-is.** Eric, shown the
    cycle-44 batch-sim evidence (endgame resolved p50 830.0s → 925.7s, crossing the ~15:00
    contract): *"match time is fine."* The three options the evidence recorded are resolved on
    **accept** — no gun-damage claw-back, no storm-timeline change, no renegotiated contract. The
    ~15:00 figure is henceforth a soft pacing reference, NOT a bar the tuning is held to; a future
    cycle must not "fix" match length by citing it. The Story 3.4 no-stalemate guarantee is
    untouched and still measured the way amendment 24 ratified (matches conclude; 50/50 did).

27. **Storm-attributed kills are CORRECT as shipped.** Eric: *"if I'm keeping someone in the storm
    and that is what kills them, then I'm fine with it registering as a storm kill."* No change to
    kill attribution. Recorded because the cycle-44 review surfaced storm kills as a
    behavior-vs-intent question; the answer is that the behavior is the intent. Note for precision:
    this does NOT resolve the `matchSmoke` step-4 failure, which asserts kill CREDIT plumbing
    (winner id, placement, results rows) rather than whether storm kills are acceptable — that stays
    ledgered as a pre-existing harness flake this retune aggravated.

28. **SUDDEN DEATH is reaffirmed, sharpened, and still PARKED — explicitly "not today".** Eric,
    unprompted, in the same message: *"I'm actually heavily considering 'sudden death' at 15 minutes
    that fully closes the ring in until it is all storm at 16 minutes. someone will win at that
    point pretty quick. but not today!"* This SHARPENS the epic-3-retro contingency from "fully
    close the ring at ~15:00" to a **one-minute ramp: sudden death opens at 15:00, all storm by
    16:00**. The gate is UNCHANGED and absolute: it is a forcing mechanic that would **supersede
    epic-3 amendment 24's geometric no-stalemate bar**, and "not today" is an explicit deferral —
    **no cycle may build it without a further explicit Eric ruling authorizing the work.** One
    thing did shift: the original revisit trigger was "live play shows matches failing to conclude,"
    but Eric is weighing this while matches DO conclude, so the motivation is now pacing and
    decisiveness rather than stalemate rescue. Any future spec must argue from that premise.

## 2026-08-04 — Eric rulings, the Public Register cycle (bmad-dev-auto, interstitial — cycle 45)

Source: Eric, live design conversation during the global-kill-feed run (two AskUserQuestion rounds and
three mid-run interruptions, all 2026-08-04). Spec of record: `spec-global-kill-feed.md`. Starting
intent, verbatim: *"as a player, if a another player kills another player, i want to know about it in
the kill feed, even if i didn't see it happen."* The ruling set arrived by visible REVISION — Eric
reversed himself twice on drone status before settling — so the amendments below record the final
state AND the reasoning path, because the discarded branches are the ones a future cycle will
re-propose.

29. **`sunk` is THE PUBLIC REGISTER — the 4th DECLARED exception to the master perception invariant**
    (joining Story 4.3's `sp`/`hc`/`mz`), with its own independently-reimplemented oracle in
    `perception.test.ts`. Every COMBATANT sinking now reaches every client regardless of sight, by any
    cause — player hand, storm, or a future PvE ship. The gate is three clauses: WITNESSED (today's
    rule, extracted verbatim and unchanged), CREDITED TO YOU (amendment 30), or THE VICTIM IS A
    COMBATANT (`!wreck.isDrone` — the single site a future PvE/combat-bot distinction changes).

    **This is a reconciliation, not a widening.** The row's own shipped comment already ratified the
    principle — *"Everyone still learns alive/kills/deaths from the public roster schema — sinking is
    public knowledge, its LOCATION is not"* — and `ArenaRoom.syncRoster()` has always mirrored
    `alive`/`kills`/`deaths` to every client every tick. A client could already derive "A killed B"
    from schema deltas at tick precision; only the FEED LINE was withheld. The payload is IDENTITY
    ONLY (`{k, id, by?}` — no position, class, hue, damage, or weapon field), so the public clause
    says out loud what the schema already whispered.

    Location stays exactly as protected as before via a new per-observer `seen?: true` field stamped
    by `materialize()` precisely when the historical witness predicate holds. The client gates
    EVERYTHING SPATIAL on it — the sink plume and the contact-view teardown — so an unwitnessed kill
    can never draw a plume at a stale last-known position. `PROTOCOL_VERSION` 22 → 23.

30. **The killer always learns what they sank — at any range, through any fog, combatant or not.**
    Eric, verbatim: *"I at least want to know when *I* (or a teammate, in the future) kill anything,
    even if its a non-combatant/PvE ship/whatever. But I don't care if other teams kill these
    entities. But I want to know every time a combatant dies."* This is **amendment 17's principle at
    its terminal case**: the Hit Call already ratified shooter-only confirmation that your ordnance
    connected, knowingly superseding the `boom` row's anti-leak rule for the owner-hit case. "Your
    target went down" is the end of that same conversation, not a new principle. Implemented as a
    NAMED predicate (`sunkCreditedTo`) so the future *"or a teammate's kill"* extension changes at one
    site and nothing else re-derives kill credit.

    Consequence of record: a fog kill now also reaches `recordSunk`, closing a real shipped gap — a
    kill you could not see was counted in the server's roster tally but was MISSING from the player's
    own "SHIPS YOU SANK" card. Eric ruled the full confirmation set (**feed line + kill tone + score
    credit**), rejecting the quieter feed-line-only and no-tone variants.

    Non-combatant sinkings therefore reach exactly two audiences — the witness and the killer — and
    are never public. Eric: *"If someone else kills them, meh."*

31. **Drones are NOT combatants — and this was reversed twice before it settled.** Eric first ruled
    drones out (*"I don't care about drone or PvE ship deaths"*), then reversed on discovering they
    gate the win (*"Right now, you have to kill all the drone ships to end the game. So right now they
    technically count as combatants... BY VIRTUE of them being de-facto combatants, not by virtue of
    being drones"*), then reversed again by attacking the premise instead of the consequence:
    *"lets just instead switch it so that killing all the drones isn't required for winning. That
    would mean setting them so they are not 'combatants'... They aren't worth full XP anyway (killing
    another player/combatant ship is worth a full level)."*

    The XP argument is the durable one and is the rationale of record: the economy has ALWAYS treated
    drones as non-contestants — a drone kill pays a fraction of a level via `CONFIG.xp.droneTierLevels`
    where a captain pays a full one (`CONFIG.xp.killLevels`). The public register simply stops
    contradicting the economy.

    **The matching win-condition change is DEFERRED to Story 6-3 ("The Participants-Only Win Check"),
    which already exists in the backlog for exactly this.** `Match.checkWin()` is UNTOUCHED this cycle
    and drones still gate the win today. The deferral was Eric's explicit pick over two alternatives
    shown to him, and it was the right one: the guard he proposed removing exists to stop a solo match
    insta-finishing at activation (`humans.length <= 1` is already true at 1 human + 5 drones), so
    dropping it outright would have broken the solo battle-royale path that `drones.test.ts` and
    `dronesSmoke.mjs` pin at `minHumans: 1`. 6-3 must solve solo-mode termination as part of its work.

32. **`n AFLOAT` counts CAPTAINS ONLY — this SUPERSEDES epic-3 amendment 19.** The Story 3.3 doctrine
    note in `client/src/score.ts` argued the opposite at length ("AFLOAT counts HULLS ON THE WATER…
    a solo captain's match reads 20 → 1 exactly as it looks out the window") and has been rewritten,
    not deleted. `isAfloatHull` now takes the same `droneHue` sentinel `isLiveRival` uses. **The other
    half of the ratified asymmetry SURVIVES: AFLOAT still counts the LOCAL PLAYER, which the rival
    count still excludes.**

    Interim inconsistency, flagged and knowingly accepted: because amendment 31 deferred the win
    change, AFLOAT today reads as *"rivals left"* rather than *"hulls left to clear"* — a 4-human /
    16-drone room reads `4 AFLOAT` while all 16 drones still gate the ending. It becomes literally
    true when Story 6-3 lands. Eric was shown this framing and chose humans-only anyway.

33. **Presentation is UNCHANGED — a kill is a kill.** Eric rejected any witnessed-vs-reported visual
    distinction, so no new grammar row exists and no witnessed/reported flag reaches the DOM. Feed
    capacity rises to **6 lines / 8s TTL** (was 5 / 6s) for the higher event rate.

34. **Doc drift added to the Eric-gated 7-5 batch by this ruling** (house rule: no design-doc edits
    in-cycle): UX-DR17's "max 5 lines, 6 s TTL" (`epics.md:160` and the matching `DESIGN.md` kill-feed
    block) and the Story 1.12 restyle AC at `epics.md:534` are superseded by amendment 33; epic-3
    amendment 19's AFLOAT rule is superseded by amendment 32 wherever it is restated in design docs.

## 2026-08-05 — Eric rulings, the per-shell damage law (bmad-dev-auto, interstitial — cycle 48)

Source: Eric, bug report plus a two-question pre-implementation gate (AskUserQuestion, both answered
on the recommended option). Spec of record: `spec-salvo-per-shell-damage.md`. Starting intent,
verbatim: *"when you have upgraded the number of turrets on your Gun, and are now firing 2 or 3
bullets from one shot, if all the bullets hit, it only counts for damage once. That's wrong.
Everything that connects should deal damage."*

35. **EVERY SHELL THAT CONNECTS DEALS FULL DAMAGE — the same-click salvo single-hit rule is DELETED.**
    A multi-barrel click's fanned bursts overlap at fighting range (3° fan step, 15u burst radius —
    they separate only past ~573u of a 660u base range), and a hull standing inside two or three of
    them now takes two or three applications. The `ShellState.salvo` tag, `World.salvoHits`,
    `claimSalvoHit()`, `releaseSalvo()`, and both damage gates are gone, tag and all.

    **What was deleted was never an Eric ruling.** It was an ORCHESTRATOR invention from the Story
    2.8 review (`spec-2-8-boon-catalog-v1.md:142`), introduced to protect Eric's actual law
    (`HULLCRACKER_NOTES.md:83` — *"nothing should be a 1-hit kill on an otherwise undamaged ship"*).
    It was genuinely mandatory under the numbers of the day: gun 25 against a 70hp lightest hull, so
    a BASE 3 × 25 = 75 breached the floor with no upgrades at all. The cycle-44 rebalance
    (amendment 21: gun 25 → 15) against the 2026-08-03 toughness ladder (lightest hull now the 80hp
    small drone) dissolved that premise — base 3 × 15 = 45 is safe by a wide margin. Consequence of
    record: the two rare TWIN/TRIPLE MOUNT cards added ZERO single-target damage for their whole
    shipped life; they were coverage-only cards presented as an armament upgrade.

36. **THE ONE-HIT-KILL LAW GOVERNS A SINGLE SHELL, NOT A SINGLE CLICK.** Three shells landing is
    three hits, so the law is not breached by their sum. Eric was shown the exact consequence and
    ACCEPTED it: a fully max-stacked triple mount (5× HEAVY SHELLS → 30/shell, 2× MOUNT cards →
    3 barrels) deals **90** and one-clicks an undamaged **80hp small drone**. No player hull falls to
    the shells alone — the lightest is the 125hp Torpedo Boat, which takes 72%.
    `damageGuardrail.test.ts` was re-pinned accordingly: it now enforces the per-SHELL law and adds a
    NEW pin, `perShell × barrels < min(classHps)`, so the thing Eric actually cares about (no PLAYER
    hull is ever one-clicked by gunfire) is CI-enforced rather than assumed. That pin is explicitly
    scoped to gun shells: a burst also detonates the shooter's own armed mines inside `burstRadius`
    (`detonateMinesInBurst` + the 2.8 same-owner cascade), which can obviously exceed any hull's hp —
    that is the minefield paying out, not the gun.

    Explicitly REJECTED, all three shown to Eric — **do not re-propose without a new ruling**:
    falloff on later same-click hits (100/50/25% like the AP ladder, topping at 52.5), an aggregate
    per-click cap clamped just under the floor, and shrinking the HEAVY SHELLS step (+3 → +1) the way
    amendment 23 shrank the torpedo/cannon ladders.

37. **The victim's own damage feedback is now a PER-FRAME AGGREGATE — one shake at the summed
    magnitude, one cue.** Required to make the ruling land at all, not scope creep: `triggerShake`
    resolves colliding triggers with `Math.max`, so three separate 15hp triggers would report a 15hp
    hit for 45hp of damage and the MOUNT cards would land INVISIBLY — a direct contradiction of Story
    2.9 ("the build must be felt"). Three identical thuds in one frame are a smear, so they collapse
    to one; this is the grammar the shooter's side already ships for the Hit Call tone
    (`CLIENT_CONFIG.gunnery.hitCallToneFloorMs`), applied to the victim's side. **No new tunable was
    invented.**

    Two implementation invariants worth keeping, both found by review: the aggregate resolves in a
    PRE-PASS over the frame's events, not after the fan-out, because the server pushes `dmg` before
    the `sunk` it caused and flushing late would play the sink cue ahead of the blow that earned it.
    And burn identity is classified PER EVENT and then folded (the frame reads as fire only when
    EVERY application in it does), NOT by testing the sum against `BURN_AMOUNT_CAP` — that cap's ×4
    headroom was derived for ONE event covering overlapping patches, so four distinct enemy burners
    (~2.75hp each, one bite per owner per tick) already sum past it and pure fire would misreport as
    an impact.

38. **Scope discipline of record.** Mechanism-only: **no `PROTOCOL_VERSION` bump** (24 stands — the
    salvo tag was server-internal and never on the wire), no CONFIG tunable touched, no catalog step
    retuned, no change to `gun.damage`/`contactDamage`/`burstRadius`/`BARREL_FAN_STEP_RAD`, drone hp,
    or class hp. The surviving PER-SHELL no-double-dipping rule (one shell hits one hull at most once
    — contact XOR burst) is untouched and now has its own regression test.

39. **Doc drift added to the Eric-gated 7-5 batch by this ruling** (house rule: no design-doc edits
    in-cycle): `HULLCRACKER_NOTES.md:83` still reads *"nothing should be a 1-hit kill on an otherwise
    undamaged ship"* without the per-SHELL qualifier amendment 36 attaches to it — the traceability
    chain from three code comments now terminates in a line that reads more absolutely than the
    ratified law. Also `CLAUDE.md` records `PROTOCOL_VERSION` as "currently 23"; actual is **24**.

## 2026-08-05 — Eric rulings, Story 4-4 pre-implementation question gate (bmad-dev-auto, cycle 49)

Source: Eric, live design conversation during the Story 4-4 run (one clarifying exchange plus two
AskUserQuestion rounds, seven rulings). Spec of record: `spec-4-4-wounded-smoke.md`. The governing
move was Eric's own: shown the reach question cold he first chose truesight-only (smoke as pure
texture), then asked *"Don't we have the HP bar turning yellow or red based on remaining HP
already?"* — which reframed the whole story and moved him UP to a fog-piercing channel once the
vocabulary was settled. That question is the spine of amendment 41 and is why this story ships as a
disclosure rather than a decoration.

40. **WOUNDED SMOKE IS THE FIFTH DECLARED EXCEPTION to the master perception invariant** — joining
    Story 4.3's `sp`/`hc`/`mz` and cycle 45's `sunk` — and it is the first of its kind twice over.
    It is **the first enemy-HP-derived information the game has ever put on the wire**: until now
    `Contact` carried exactly `{id,x,y,heading,speed,cls}` and the no-enemy-hp law was stated
    outright in four places (`signals.ts:730-733`, `types.ts:441-446`, `types.ts:552-554`,
    `signals.ts:610-612`). It is also **the first PERSISTENT fog-piercing signal** — `sp`, `hc`,
    `mz` and `sunk` are all one-tick pulses, whereas a hurt hull smokes continuously for as long as
    it stays hurt. Both firsts are deliberate and both require the row's own independently
    reimplemented oracle in `perception.test.ts`, exactly as the four prior exceptions have.

41. **THE SMOKE BANDS ARE THE HP RAIL'S BANDS — 50% and 25%, two tiers.** Light smoke below 50% of
    max hp, heavy smoke below 25%. Eric: *"Then those are the numbers I want."* This is a
    RE-USE ruling, not a new tuning: `hpColor()` (`client/src/render/hud.ts:276-280`) has always
    drawn the own-vitals rail phosphor ≥50%, amber 25–50%, `damageMarker` crimson <25%
    (`CLIENT_CONFIG.vitals.amberBelow` / `criticalBelow`), and `railPulsing()` has always breathed
    the rail below 50%. **Wounded smoke is the enemy-facing half of a vocabulary that already
    shipped self-facing.** Light plume ⇔ your rail has gone amber; heavy plume ⇔ your rail has gone
    crimson. Implementation consequence, binding: the smoke tier and the rail band MUST derive from
    the SAME thresholds — no second set of numbers may exist, and a future retune of the rail bands
    moves the smoke with it. Explicitly REJECTED: a single tier at 50%, a single tier at 25%, and a
    single tier at 60% — all three were the smaller channel and Eric chose the full vocabulary.

    Tension with UX-DR24 (*"smoke conveys hurt, never a number"*) is ACKNOWLEDGED and resolved in
    favor of two tiers: two named conditions is a state, not a gauge. The wire carries a **tier
    enum**, never a fraction and never an hp value — sending `hp/maxHp` would be a real HP gauge and
    is forbidden. UX-DR24's "no enemy HP bars" clause is untouched: no bar, no number, ever.

42. **REACH IS `SIGHT * 1.5` — 495u, the muzzle-flash halo, DERIVED.** Smoke reuses
    `CONFIG.vision.muzzleFlash` rather than introducing a fourth vision constant, so retuning
    truesight moves the smoke halo exactly as it moves the flash and radar. This is the Story 4.3
    precedent taken verbatim (amendment 15), and it lands smoke in the same deliberately-thin 165u
    annulus beyond the sight bubble. Consequence of record: **inside 330u you already see the hull,
    so smoke's new work happens entirely in the 330–495u annulus**, where a plume appears with no
    hull under it and no sweep required. Radar (660u) remains the only long-range sensor, and a
    radar-range hunt still cannot tell a hurt hull from a whole one.

    Eric REVERSED his own first answer here. Truesight-only (330u) was his initial pick and would
    have made smoke pure texture — no perception exception, no new channel, and the epic's
    "damage is trackable prey" language dropped. He moved off it after the HP-rail reframing.
    Also explicitly REJECTED: radar range (660u), which would have made a hurt hull's position
    CONTINUOUS at the full sensor ceiling, and map-wide smoke ("above the fog" read literally),
    which would have been a wholly new tier beyond radar from which no wounded ship could disengage.

43. **AN ATTACHED, DRIFTING PLUME — WHERE THEY ARE, NEVER WHERE THEY'VE BEEN.** The column rises
    from the hull's current position and drifts on a fixed wind. It reveals POSITION ONLY. Explicitly
    REJECTED: a decaying trail of puffs left in the water (which would encode course, speed, and
    origin — the same information ghost blips carry, but continuous, and a strictly larger
    disclosure), and the both-at-once variant. **Binding implementation consequence:** puff lifetime
    is the knob that decides column-vs-track, so it must be tuned SHORT enough that the plume hugs
    the hull. A long-lived puff silently converts this ruling into the option Eric rejected — any
    future change to puff life is a design change, not a tuning change.

44. **ISLANDS BLOCK WOUNDED SMOKE.** LOS applies, upholding the standing 2026-08-02 ruling that
    islands block EVERY sensor at ALL ranges, and matching the muzzle flash which got LOS for exactly
    this reason. A wounded ship CAN break contact by putting rock between itself and a hunter.
    Explicitly REJECTED: the realism argument that a burning hull's column is physically tall enough
    to show over an island — which was the first time realism cut AGAINST the LOS law rather than for
    it, and Eric declined to open the first carve-out. Island shadows remain absolute.

45. **THE PLUME IS NEUTRAL — position and severity, never identity.** No ship id, no personal hue, no
    class, for anyone, at any range. This is **amendment 19's muzzle-flash rule applied to a second
    signal**: the flash *"says someone fired, never who"*, and the plume says *"a hull is hurt, this
    hurt, right there"* and nothing more. In the 330–495u annulus you learn that something is wounded
    and where — you still have to sweep radar or close to truesight to learn what it is and whose it
    is. This RESOLVES the same DESIGN.md-vs-UX-DR7 conflict amendment 19 resolved, the same way and
    for the same reason: **DESIGN.md's neutral-token grammar wins for this signal**, because the mark
    must create a question rather than answer one. Explicitly REJECTED: personal hue + class (which
    would have made the annulus a full contact and left smoke outranking radar as a continuous
    identification channel), and hue-only.

    Implementation consequence, load-bearing: **the wire payload carries no id at all**, so no
    correlation handle exists and none may be invented — not the real ship id, not a per-observer
    alias, not a stable anonymous key. The plume is therefore built the way the phosphor blip is
    built (the shipped precedent: the server keeps no history and the client synthesizes the
    persistence), NOT the way a contact is built.

46. **YOU SEE YOUR OWN SMOKE.** Own damage staying HUD-private (`EXPERIENCE.md:179`) is upheld in
    substance — no hp, amount, or number about you reaches anyone — but the plume itself is visible
    to its own captain. The reasoning is the mechanic's own: **smoke broadcasts your position to
    everyone inside 495u, so you must know you are broadcasting**, or the mechanic punishes you
    invisibly and the decision to disengage is made blind. The plume becomes a diegetic second
    reading of the amber/crimson rail you can already see. This also matches the shipped mockup
    (`mockups/death-reveal-results-1.html:531-546`), which draws heavy own smoke. Explicitly
    REJECTED: own smoke hidden entirely, and a visually heavier own plume than an enemy's (rejected
    as a second visual weight to tune and a readability-gate cost on your own screen — own and enemy
    plumes render identically).

47. **EVERY HULL WITH HP SMOKES, DRONES INCLUDED.** One rule, no carve-out: below the band is below
    the band. This does NOT contradict amendment 31 (drones are not combatants) — that ruling governs
    the PUBLIC REGISTER, which is about whose sinking is news, whereas smoke is a physical property of
    a damaged hull observed at close range. Drones already paint radar blips, so a drone plume
    discloses nothing the sweep does not. Consequence of record: a solo captain's battle royale reads
    consistently, and drones are useful practice for learning the cue. Explicitly REJECTED:
    captains-only smoke (which would have made a plume a guaranteed player tell and forced drones to
    read differently from every other hull).

48. **Decoys do not smoke, and this creates no wire-indistinguishability problem.** A `Decoy` record
    has no hp, so it has no band to fall below. The Story 1.8 indistinguishability law binds the
    PAYLOAD of a genuine paint (amendment 11), and a healthy real ship emits no smoke either — so
    "no plume" is not a decoy tell. Adding a fake plume to sell the illusion was considered and NOT
    adopted: it would be inventing a mechanic, and amendment 11 already ratified that the decoy's lie
    is unmasked by BEHAVIOR over time rather than by payload.

49. **Scope discipline of record.** `PROTOCOL_VERSION` **bumps** (24 → 25) — a new wire signal is a
    wire-shape change. No CONFIG combat tunable is touched: no damage, reload, hp, range, or catalog
    value moves, and `CONFIG.vision` gains no new constant (reach reuses `muzzleFlash` per amendment
    42; bands reuse the vitals thresholds per amendment 41). **Smoke gets no audio twin this cycle** —
    it is a continuous STATE, not an event, and the Story 4.4 acceptance criteria are the only ones in
    Epic 4 that name no tone (4.3, 4.5 and 4.6 all do). Story 4.7's sound map owns any later decision
    to voice it. **Motion setting:** the ratified house rule governs — `off` removes MOTION, never
    INFORMATION (`effects.ts:44-53`, `config.ts:1006-1008`), so the plume's PRESENCE and TIER must
    survive `motion: 'off'` intact and only the drift/billow cadence is motion-scaled. The 4.4 AC's
    "smoke respects the motion setting's reduced/off tiers" is read that way and no other.

50. **Doc drift added to the Eric-gated 7-5 batch by this ruling** (house rule: no design-doc edits
    in-cycle): `EXPERIENCE.md:179` reads *"wounded ships trail smoke … above the fog"* with no reach
    qualifier — amendment 42 bounds it at 495u, and the word "trail" is superseded by amendment 43's
    attached plume. `DESIGN.md:239`'s wounded-smoke line carries no tier grammar and must gain the
    two-band mapping from amendment 41. `epics.md:848`'s *"below the smoke threshold (CONFIG design
    target)"* is singular where amendment 41 ratified two. Also `CLAUDE.md` records
    `PROTOCOL_VERSION` as "currently 23"; actual after this cycle is **25** (it was already 24 before
    this cycle began — see amendment 39).

## 2026-08-05 — Eric rulings, Story 4-5 pre-implementation question gate (bmad-dev-auto, cycle 50)

Source: Eric, live design conversation during the Story 4-5 run (invocation intent, two
AskUserQuestion rounds of four questions each, plus one mid-run reversal). Spec of record:
`spec-4-5-the-foghorn.md`. Starting intent, verbatim: *"FOGHORN TIME! I want an *actual* fucking
foghorn sound effect! I always hear my own at full volume. I always hear anyone's within truesight
range (LOS) at full volume. If they are within muzzle flash range (1.5x LOS), i should hear it at 75%
volume. If they are in radar range, I should hear it at 50% volume. Beyond that, I should not hear
it."* — plus, unprompted and emphatic: *"FOGHORNS ARE A GREAT MONETIZATION OPTION!!!!!!"*

The shape of this ruling set BREAKS the pattern of amendments 1, 15-20 and 40-48, where Eric
consistently took the smallest new information channel. Here he took the LARGER option three times
(the sample seam over synth-only, the variant id over a neutral signal, build-scaled tiers over flat
constants) — because a foghorn is an EMOTE, a chosen self-disclosure, not a sensor return. That
distinction is the through-line of every ruling below and is the premise any future change must argue
from.

51. **THE FOGHORN IS THE SIXTH DECLARED EXCEPTION to the master perception invariant** — joining
    Story 4.3's `sp`/`hc`/`mz`, cycle 45's `sunk`, and Story 4.4's `sm`. Its payload for a fogged
    listener is **BEARING AND VOLUME TIER ONLY — no position, no ship id, no correlation handle of
    any kind.** Explicitly REJECTED: true `x`/`y` the way `mz` and `sm` carry it, which would have
    made a honk the single largest disclosure in the game (wounded smoke, the current record holder,
    reaches 495u; a honk reaches 660u). Rationale of record is the story's own line — *"every honk is
    a bearing I chose to give away"* — and it lands the foghorn on the contract the DEFERRED listening
    ring was specced to use (bearing-grade, never range-derivable), so a revived hydrophone tier would
    inherit a signal already shaped for it.

    Consequence of record: the honk is the FIRST signal whose payload VARIES BY OBSERVER in substance
    rather than by a flag. `sunk` stamps a per-observer `seen`; the foghorn computes a per-observer
    bearing and tier. `materialize(ctx, subject)` already takes the context, so this is legal within
    the shipped registry contract and needs no new machinery — but it does mean the row cannot be
    snapshot-tested from a single vantage point.

52. **THE WIRE CARRIES A HORN VARIANT ID — the monetization seam is built now.** Eric chose this over
    a neutral one-horn signal and over an own-ears-only skin. Others hear the horn you have equipped,
    which is what makes a purchased horn worth purchasing. **This is a knowing, narrow break with
    amendments 19 and 45** (the muzzle flash *"says someone fired, never who"*; the plume says *"a
    hull is hurt, right there"* and nothing more): a distinctive horn IS a soft identity tell at up to
    660u, and people will learn to recognize it. The break is justified on the emote distinction —
    every neutral-signal ruling protected information the ship LEAKS, whereas a honk is information
    the captain SPENDS.

    Scope of the seam, binding: **exactly ONE horn ships this cycle** (`'standard'`, synthesized), and
    the id is validated against a shared catalog with an unknown-id fallback to the default, so an old
    client hearing a new horn degrades to a sound rather than to silence or a throw. **Adding a second
    horn is CONTENT and needs an Eric ruling** — no cycle may invent horn variants. The id rides the
    honk event only; **no `PlayerMeta`/roster schema field was added**, because a horn is only ever
    public at the moment it sounds.

53. **VOLUME TIERS SCALE WITH THE LISTENER'S EFFECTIVE RANGES, not flat constants.** Tier 1 (100%) is
    `sightOf(me, now)`, tier 2 (75%) is `max(1.5 × sightOf(me, now), CONFIG.vision.muzzleFlash)`, tier
    3 (50%) is `max(me.stats.radarRange, tier-2 bound)`, and beyond tier 3 no event is emitted to that
    observer at all. At base stats these are exactly the 330 / 495 / 660 Eric named. Explicitly
    REJECTED: flat 330/495/660 for everyone, which would have made hearing a property of sound rather
    than of the listener — Eric chose consistency with every other sensor instead, so an intel build
    hears farther and a dazzled captain hears less.

    **The `max()` clamps are load-bearing, not defensive coding.** `CONFIG.vision.muzzleFlash` is a
    FLAT 495u constant while `sightOf` is dazzle-scaled and `radarRange` is boon-widened, so the three
    bounds are not monotone by construction: a heavily intel-boosted listener can have `sight > 495`
    (inverting tiers 2 and 3) and a star-shelled listener can have `sight` far below it. The clamps
    resolve both, and the dazzle case has a design meaning worth preserving — **dazzle must not also
    deafen**, so a blinded captain still hears at 75% out to the full 495u halo. Amendment 42's "no
    fourth vision constant" rule is upheld: tier 2 reuses `muzzleFlash`, exactly as wounded smoke does.

54. **ISLANDS MUFFLE A HONK BY EXACTLY ONE TIER — a PARTIAL carve-out of the 2026-08-02 LOS law, and
    Eric REVERSED HIMSELF to get here.** Blocked LOS demotes the resolved tier: 1 → 2, 2 → 3, 3 → no
    event. His first answer was the full carve-out (*"sound goes around — heard anyway, same
    volume"*), which he overturned mid-run before any code existed, verbatim: *"lets actually muffle
    the foghorn if its behind an island. That way if we add sound indicators again then islands remain
    useful as a hiding mechanism."*

    **The reversal's reasoning is FORWARD-LOOKING, not physical, and that is the durable part.** Sound
    genuinely diffracts around rock, which is why a hard block was rejected — but the deciding argument
    is that terrain must keep working as a hiding mechanism, or a future revived bearing-grade sound
    sensor (the deferred hydrophone tier, or active sonar) arrives in a world where islands already
    mean nothing to audio. One tier of demotion buys both readings: you can still be heard from behind
    a rock, but a rock always costs the honker reach, and at the outer band it costs them the honk
    entirely. **This is the first time the LOS law has been dented at all** — amendment 44 declined to
    open a carve-out for wounded smoke on a pure realism argument, and the difference is that this one
    arrives with a mechanism that keeps islands meaningful rather than merely excusing them.

    Binding implementation consequence: the demotion is ONE step applied AFTER the distance tier
    resolves, so exactly one `losClear()` test exists in the row and no second set of bounds can drift
    from the first. Explicitly REJECTED: a hard block (which would have made terrain able to silence
    an emote outright) and the unattenuated carve-out (Eric's own first pick).

55. **THE VISUAL TWIN IS A SCREEN-EDGE CHEVRON — and it is the bearing surface amendment 4 said this
    story had to grow.** A marker pinned to the viewport edge pointing down the honk's bearing, fading
    over ~1.2s, weight by tier. Explicitly REJECTED: an arc tick on the truesight ring (diegetic and
    cheaper, but it lives at a fixed world radius and so competes with the sight boundary's own
    meaning) and reviving the ratified 48-pip compass rose for honks alone (most faithful to the
    original design, but it puts a sensor-looking ring on screen that would sit empty almost always,
    and it would pre-commit the shape of a revived listening ring).

    This CLOSES the open item amendment 4 flagged and the sprint tracker has carried since 2026-08-04
    (*"4-5 must grow its own bearing surface or defer alongside 4-1"*): 4-5 grows its own surface and
    does NOT defer. The surface is deliberately foghorn-shaped, not sensor-shaped — a revived 4.1 is
    free to build the compass rose without inheriting this chevron. **UX-DR36 binding:** the chevron's
    presence, direction and tier weight are INFORMATION and survive `motion: 'off'` intact; only
    animated flourish is motion-scaled. Your own honk gets an own-hull bloom instead of a chevron (a
    bearing to yourself is meaningless).

56. **THE KEY IS F, as reserved — UX open question #20 is CLOSED.** F has sat bound-inert for exactly
    this story since Epic 2 (`keyboard.ts:20` header comment, the bind site's *"F
    (Foghorn-reserved)"*, a test pinning its inertness, and `settings.ts:78` deliberately omitting it
    from the binding reference). Both of those pins are now wrong by design and are updated. Rejected:
    H ("Horn" is the better mnemonic and would keep the honk away from the Q/E/R weapon cluster) —
    Eric kept the reservation. **Cooldown is 1.5s** with the existing predicted `denied` cue on an
    early press, chosen over 3s and 5s explicitly so captains can have honk CONVERSATIONS: *"let them
    be silly"* was the option's framing and the fast tier is the one he took. The mix is protected by
    a client-side `maxConcurrent` cap rather than by a slower cooldown — and the cap drops HORNS, never
    CHEVRONS, so the visual twin survives a crowded room even when the audio cannot.

57. **AN ACTUAL HORN, SHIPPED AS A SYNTH VOICE BEHIND A SAMPLE-CAPABLE SEAM.** The audio engine has
    been oscillator-and-noise-only since Epic 1 (`context.ts:2-3`, *"no audio assets"*) with tones
    capped at 150ms (`MAX_TONE_S`; `sink` is the lone 450ms exemption), so an ~1.8s horn blast had
    nowhere to live. Eric chose building the loader seam AND shipping a synthesized horn now, over
    synth-only and over blocking on a real recording. The horn gets its OWN play path rather than an
    exemption to `MAX_TONE_S` — that ceiling stays meaningful for the 24 short cues it was written
    for — and `HornVoice` is a discriminated union (`{kind:'synth'} | {kind:'sample', url}`) so a
    licensed recording later is a file plus one catalog line with **no code, wire, or protocol
    change**.

    **Recorded as a real constraint, not a caveat:** no licensed or CC0 foghorn recording exists in
    this repo and none may be sourced unattended, so the sample path ships EXERCISED BY TESTS ONLY.
    Any future cycle that wants the real thing needs Eric to supply or approve the asset first. The
    synth voice is not a beep — a ship's horn is a few low partials with slight detuning (the beating
    is the character), a slow attack and a long tail, which is what a horn synth actually does.

58. **Scope discipline of record.** `PROTOCOL_VERSION` **bumps 25 → 26** (a new event kind and a new
    `InputMsg` field are both wire-shape changes). No combat tunable moves: no damage, reload, hp,
    range, catalog step, or `CONFIG.vision` constant is touched, and the honk has NO kill-feed line,
    NO XP, and no match-state consequence of any kind — it is an emote. Drones never honk; dead
    captains and spectators never honk. **Own honks are NOT client-predicted** — the honker hears
    their own horn from a self-addressed server event, exactly once, so one code path serves every
    listener and no dedup machinery is needed; only the `denied` cue on an early press is predicted,
    which is the shipped pattern.

59. **Doc drift added to the Eric-gated 7-5 batch by this ruling** (house rule: no design-doc edits
    in-cycle): `epics.md:180` (UX-DR31) still lists the foghorn emote as *"specced but unbound (open
    question)"* — amendment 56 closes it on F. The Story 4.5 acceptance criteria at `epics.md:861-864`
    still describe the honk lighting *"an arc sweep along its bearing on every listening ring in
    earshot"* and bound its payload by *"the listening tier's bearing contract"*; amendments 51 and 55
    supersede both — there is no listening ring, and the surface is a screen-edge chevron. `FR13`
    (`epics.md:49`) names foghorns as something hull microphones detect, which is moot while
    amendment 1 stands. Also `CLAUDE.md` records `PROTOCOL_VERSION` as "currently 23"; actual after
    this cycle is **26** (see amendments 39 and 50 for the same drift going unfixed twice).

60. **A DENIED HONK IS COMPLETELY SILENT — no tone, no visual, nothing** (Eric ruling, post-review
    gate, same cycle). The implementation first played the shipped `denied` tone on a press inside
    the cooldown. The adversarial review confirmed that this made the foghorn **the only `denied`
    call site in the entire client with no visual twin**: a weapon click flashes the aim arc and
    reticle, an ability press flashes its hotbar chip, an ability against a full FIFO flashes the
    chip — and the horn has no surface of its own to flash. The twin table's own `denied` row names
    that pulse as the cue's visual, so a tone with no pulse is an orphan cue and a deaf or muted
    captain cannot tell "on cooldown" from "the key is broken".

    Shown three options — a stifled red puff at the own hull (reusing the success bloom, choked),
    leaving the tone alone as a documented deviation, or dropping the cue entirely — **Eric chose to
    drop it.** The reasoning of record: rather than invent a new visual surface for a case with no
    gameplay consequence, remove the thing that needed one. Note this knowingly trades against the
    house rule that feedback is *"never zero, never two"* (`render/deniedFire.ts` header) — that rule
    was written for FIRE denial, where a swallowed click costs a shot; a swallowed honk costs
    nothing, so there is nothing owed. **This SUPERSEDES the spec's own I/O matrix row** as originally
    written, and it is the reason `handleFoghornPress` must produce no side effect on the denied
    branch. If a horn surface (a hotbar chip, an emote wheel) ever exists, this is the ruling to
    revisit — the cue was dropped for want of a surface, not on principle.

61. **Two review-gate defects worth recording, both found by the CROSS-MODEL (Codex) pass and missed
    by the in-family adversarial reviewer.** Recorded because both are cross-boundary bugs whose
    shape will recur in any future bearing-grade or cooldown-mirroring signal:
    - **The chevron's ray must originate where the bearing was MEASURED, not at the viewport centre.**
      The camera leads up to 110u ahead of the hull (`camera.ts:175`), so an alive captain's ship is
      not at screen centre; casting the mark's ray from the centre put its edge placement out of
      agreement with the exact bearing its own rotation was drawing. Origin is now the hull's screen
      position while alive and the camera centre while spectating — which is correct precisely
      because the spectator bearing is itself derived from the camera centre at receipt. **Neither
      side's unit tests could catch this**: each workspace tested its own half against its own
      assumption.
    - **A client-side mirror of a server cooldown must reset wherever the server's does.** The server
      clears `nextHonkAt` on respawn and redeploy; the client's mirror did not, so honking, sinking,
      and respawning inside 1.5s left the client silently eating a press the server would have
      accepted. Under amendment 60's silent denial that failure is invisible, which is exactly why it
      had to be fixed rather than tolerated.

    The general lesson for future cycles: **run the cross-model review even when the in-family gate
    returns `build-on-it`.** Its verdict here was correct on everything it examined and still missed
    two confirmed defects.

## 2026-08-05 — Eric rulings, the radar realism cycle (bmad-dev-auto, interstitial — cycle 51)

Source: Eric, live design conversation across four exchanges (investigation gate → color design chat →
pre-implementation question gate → rulings), driven by **playtest feedback from ohzie**, a day-one
player. Investigation of record:
`bmad-dev-auto-result-radar-realism-investigation.md`. The governing player quote:

> *"It's almost too much information, right? Like the fact that I can tell what you are and whether
> you're a player … I like the heading, but not the ship outline or color … when everyone's just a
> blip, **chasing a blip is a risk**, and risks get your blood up. it's a pvp game."*

And Eric's, verbatim: *"what if we just made it really work like a real radar? Indiscriminate, kinda
fuzzy shapes roughly the size of the object based on what the radar 'sees' that don't transmit any
information about what the target is"* — with heading/speed left inferable from ghost paints,
*"as that is still real."*

62. **THE 4.2 SILHOUETTE GRAMMAR IS REVERSED ON PLAYTEST EVIDENCE — but kept, not deleted.** This is
    the option amendment 8 explicitly declined (*"Eric chose this over full realism (size-scaled blobs
    with no class on the wire)"*). It returns because a day-one player's objection landed on exactly
    the three channels that are NOT real radar behavior. Amendments 7, 8, 10, 12 and 13 are therefore
    **conditionally superseded** — superseded in the new `return` grammar, untouched in the retained
    `silhouette` grammar. Nothing is retired outright this cycle. Precedent for reversing on a realism
    argument: amendment 9 did the same to Eric's own provisional one-sweep-decay pick.

63. **BOTH GRAMMARS SHIP SIDE BY SIDE, BEHIND TWO SERVER-SIDE FLAGS.** Eric: *"I'd like to keep the
    current implementation as well for now until this is tested, so we can switch back and/or build a
    happy medium more easily."* Two INDEPENDENT flags, not one — `HC_RADAR_GRAMMAR`
    (`silhouette` | `return`) and `HC_RADAR_IDENTITY` (`roster` | `pseudonym`) — because presentation
    and identity are orthogonal questions and a single flag would foreclose the very happy medium the
    ruling exists to enable. Both default to TODAY's behavior, so production is byte-identical until a
    flag is flipped. **The flags MUST live on the server** (env vars honored the way `HC_DEV_OPTIONS`
    is, with the active mode announced in the welcome handshake). Rationale of record: a client-side
    flag would force the wire to carry the SUPERSET in both modes, leaving identity on the wire in
    realism mode and reducing the entire anti-cheat argument to cosmetics. Accepted consequence: the
    dual path makes this cycle BIGGER than a replacement would be (`speedVector` and `luminanceFloor`
    stay alive, the signal shaper grows a branch, golden frames need both modes).

64. **THE THREE-CHANNEL INFORMATION SPLIT** — one quantity per channel, zero overlap:
    **size = return strength**, **brightness = age**, **hue = which sensor painted it.** This
    resolves a real conflict: brightness was ALREADY spent on phosphor decay, so letting it also carry
    echo strength would make a fresh weak return and an old strong return identical. Note the
    convergence — DESIGN.md:236 already ratified exactly this grammar for the Listening Ring
    (*"pure intensity grammar: more/closer = brighter … deliberately source-ambiguous — it never
    encodes what a noise is, only where and how loud"*). Radar is being brought ONTO the design
    language the doc already holds for the acoustic sensor, not given a new one.

65. **COLOR IS SPENT ON SENSOR PROVENANCE, NOT ECHO STRENGTH — monochrome per sensor.** Garmin-style
    red/yellow/green was considered and REJECTED: on a real marine set that palette is a GAIN
    DIAGNOSTIC, and here it would be a second, redundant encoding of the quantity blob size already
    carries — clutter measured against DESIGN.md:122's guardrail *"information noise must never bury
    the hunt."* Provenance is the one thing on the scope no other channel can carry. Radar is phosphor
    green (`blip-fresh`/`blip-faded` already exist as tokens, DESIGN.md:138). **Amber is RESERVED and
    left UNASSIGNED** (see amendment 71). This change also FREES amber: its only on-water use today is
    the hue-latch boot color for unresolved contacts, which retires with the hue system in `return`
    mode. Colorblind note of record: hue must never be provenance's SOLE carrier — a second sensor
    should also differ in persistence and edge character, which it wants to anyway on realism grounds.

66. **RETURN SIZE IS ASPECT-DEPENDENT — one continuous `ext` scalar, never a class bucket.** A size
    enum (`sz: 0|1|2`) was REJECTED as channel C with extra steps: three buckets, three classes, class
    readout restored. Instead `ext` = the hull silhouette's extent PROJECTED PERPENDICULAR to the
    observer→target bearing, computed from the polygon already in `shared/src/sim/silhouette.ts`. A
    battleship bow-on paints narrow; a torpedo boat abeam paints broad. Size therefore stops mapping
    cleanly to class, which is the mysticism ohzie asked for delivered by physics rather than a fudge.
    `ext` folds in range attenuation (farther = weaker return) — both are the one quantity "how big is
    the echo." **Anti-cheat bound:** `ext` derives from hull geometry + relative bearing + range ONLY.
    It must never reflect boons, hp, damage state, or any range-derivable flight quantity.

67. **THE ARPA SPEED VECTOR DIES IN `return` MODE** (it survives untouched in `silhouette` mode).
    This overrides the one thing ohzie asked to KEEP (*"I like the heading"*), knowingly. It is
    defensible because amendment 9's three-paint persistence was justified on precisely this ground:
    *"long-persistence phosphor is how course and speed are actually plotted off a scope … ghost
    SPACING encodes speed."* Removing `heading`/`speed` from the wire does not destroy the
    information — it DEMOTES it from readout to inference, which is the entire stated goal. Course is
    additionally inferable a second way: returns pulse in size as a contact turns (amendment 66).

68. **DRONES ARE INDISTINGUISHABLE FROM CAPTAINS ON RADAR, and class is LEARNABLE rather than
    stated.** Eric, verbatim: *"Indistinguishable. Its purely a 'rough size/shape' thing. If you learn
    what a particular ship class looks like under radar, then that's player skill because it should
    not be easy."* This is a ruling that class inference is DESIGNED-IN, not a leak to be sealed — the
    aspect-dependent scalar makes it learnable but never free. It directly answers ohzie's "whether
    you're a player" complaint and strengthens the solo-match illusion. Supersedes amendment 12 in
    `return` mode (drones keep the legacy chevron in `silhouette` mode).

69. **ISLANDS PAINT RETURNS — IN THIS CYCLE.** Eric: *"Lets say yes, that will make your radar range's
    terrain a bit more prominant."* A real marine scope is mostly coastline. Cost is far lower than it
    sounds and carries **zero disclosure**: islands are already client-known from the map seed
    (`generateMap`), so this is PURE CLIENT PRESENTATION — no wire field, no server work, no
    perception-invariant surface. Radar paints only the island's NEAR arc, with everything behind it
    in shadow, which is not a new rule but the existing one (Eric ruling 2026-08-02: islands block
    every sensor at all ranges). Island returns obey the sweep and the phosphor decay exactly as ship
    returns do.

70. **BLOB GRAMMAR — a seeded irregular polygon, as the tweakable baseline.** Jitter derived from
    (track id, paint time) so a given paint is STABLE while it decays but the NEXT paint of the same
    contact differs slightly: real scope shimmer without frame-to-frame noise, and no two returns of
    one hull look identical, which reinforces the ambiguity. Eric: *"I think I like your rec, we can
    start with that and tweak from that baseline."* The alternative (a soft-edged sprite scaled by
    `ext`) was cheaper but reads as game glow rather than echo. **Collision to hold:** DESIGN.md:145
    warns *"a phosphor-ish splash is a fake blip"* — Story 4.3's fall-of-shot `sp` mark must stay in
    `{colors.splash}` and visually separable from a green return, a constraint that TIGHTENS under
    monochrome, not loosens.

71. **THREE QUESTIONS DELIBERATELY LEFT OPEN — recorded, ledgered, and NOT resolved by this cycle.**
    Eric declined to rule on all three, and inventing answers would violate the house rule against
    inventing game mechanics:
    - **Bounty Bloom** (DESIGN.md:237, GDD E6 #47, unbuilt) requires both deleted channels — personal
      hue on radar and a class blip. Eric: *"I don't know honestly because I haven't addressed the
      'bounty' story at all yet. I'm not sure I want the kill leader's position to be known globally."*
      The bounty story owns it; this cycle neither builds nor re-grammars it.
    - **Colorblind assist under `return` mode.** DESIGN.md:163 defines the assist's blip behavior as
      boosting OUTLINES and raising decayed opacity; blobs have no outlines. Eric: *"Colorblind mode
      should address this, we should make a note to circle back to this question in the future."*
      Interim: the raised decayed-opacity floor is kept, the outline clause is inert in `return` mode,
      and the family-palette work for hulls/nameplates/kill-feed is untouched.
    - **Sonar hue and the Listening Ring.** Eric: *"I don't know yet, I'm thinking about how to
      represent sound information but I'm not sold on the 'listening ring' concept entirely."* Amber
      stays reserved but UNASSIGNED — this cycle spends no hue on a sensor that does not exist.

72. **Scope discipline of record.** `PROTOCOL_VERSION` **bumps 26 → 27** — one bump covering "a blip
    may carry either shape." **Renumbered post-merge:** this cycle branched from PV 25 and originally
    claimed 26, but Story 4.5 (the foghorn) landed first and took 26, so this cycle became 27 — and
    its amendments moved 51-64 → 62-75 for the same reason. **Correction:** `CLAUDE.md` still records
    PV as "currently 23"; the actual pre-cycle value was **25** (amendment 49 already flagged the
    staleness) and is **27** after this cycle. Persistence stays
    at `persistSweeps: 3` / `paintsPerContact: 3` — they become THE course-and-speed channel in
    `return` mode, so retuning is a deliberate post-playtest job, not a guess made in-cycle. No CONFIG
    combat tunable moves: no damage, reload, hp, or range value changes, and `CONFIG.vision` gains no
    new constant. The master perception invariant and its declared exceptions (`sp`, `hc`, `mz`,
    `sunk`, `sm`, and now 4.5's `fh`) are UNTOUCHED — this change only ever REMOVES fields from
    frames, so the anti-cheat posture strictly improves.

73. **Doc drift added to the Eric-gated 7-5 batch by this ruling** (house rule: no design-doc edits
    in-cycle). This lands ON TOP of the 4.2 drift amendment 14 already queued: `DESIGN.md:169` (*"radar
    blips carry the hull outline, so class must read at blip scale"*) and `DESIGN.md:262` (*"keep
    silhouette geometry consistent everywhere a hull appears (water, blip, class card, results)"*) are
    both false in `return` mode and must gain the two-grammar split. `DESIGN.md:160`'s propagation
    line ("radar blips + kill-feed names (Variant C, the preferred default)") and its Variant P
    sentence are superseded by the flag pair in amendment 63. `DESIGN.md:163`'s assist clause needs
    the amendment 71 carve-out. `DESIGN.md:179`'s blip rule is now doubly superseded (amendment 7 then
    55). `DESIGN.md:237`'s Bounty Bloom entry must record its dependency on a channel that no longer
    exists in `return` mode.

## 2026-08-05 — Eric ruling, the Garmin echo scale (cycle 51, post-implementation)

Source: Eric, live, after seeing the shipped monochrome return grammar. Verbatim: *"Lets actually
keep the radar sweep color green but we'll change the detected entity color to the red/blue/green
scale like in the garmin radar."*

74. **RETURN-MODE ECHOES ARE COLORED BY STRENGTH ON A GARMIN-STYLE SCALE; THE SWEEP STAYS PHOSPHOR
    GREEN.** This **SUPERSEDES amendment 65's monochrome clause for radar returns** and nothing else:
    54's finding that a marine palette is a GAIN DIAGNOSTIC still stands as description — Eric has
    simply ruled that he wants that diagnostic on his scope. The split is now explicit: the SWEEP
    (conic wedge, range rings, all radar chrome) stays `{colors.phosphor}` green, and only the
    DETECTED ENTITY carries the scale. Weak → strong runs blue → green → yellow → red, matching the
    reference screenshots. **Coast returns take the same scale** (terrain is just a strong return —
    which is why the reference images are mostly red and green coastline). `silhouette` mode is
    UNTOUCHED: personal hues remain its identity channel.

    **The scale encodes RETURN STRENGTH — the same quantity blob size already carries** (aspect-
    projected `ext`, attenuated by range). That redundancy is authentic rather than accidental: on a
    real set, size and color both fall out of the echo. It is also a genuine accessibility win and a
    PARTIAL answer to the colorblind question amendment 71 left open — size dual-codes strength, so
    a CVD player loses none of the information the color carries.

    **Implementation consequence (the Story 4.2 trap, avoided):** the phosphor decay ramp
    (`blipTint`) SETS color, so it cannot drive a colored echo — it would erase the very scale this
    ruling adds. Return mode must decay through the hue-PRESERVING multiplier (`blipCool`), which
    exists for exactly this reason: Story 4.2 hit the identical problem when hue first became a
    channel (`CLIENT_CONFIG.blip.coolFloor`'s comment records it). Channels after this ruling:
    **hue = return strength, alpha = age, size = return strength.**

75. **No wire change, no PV bump — this is PURE PRESENTATION.** The client already holds `ext` and
    computes range from its own position and the paint position, so mapping those to a color
    discloses NOTHING new: `PROTOCOL_VERSION` stays **26** and the server is untouched. Amendment
    65's provenance idea is not dead but is DEFERRED with the rest of the sound-sensor question
    (amendment 71): if a second sensor ever ships, provenance must ride a channel other than a single
    hue — the natural form is a distinct RAMP per sensor (radar blue→red, sonar some other ramp) so
    palette identity rather than one color carries it. **Amber remains reserved and unassigned;
    nothing in this ruling spends it.**

## 2026-08-05 — Eric rulings, the radar heatmap correction (cycle 53, post-live)

Source: Eric, live, after seeing cycle 51's return grammar in production. Two complaints and a
reframing, verbatim:

> *"it seems like the edges of islands are just being detected as little circles around the edge of
> the island, which is **not** what I wanted. I wanted the entire island painted like a fucking
> massive object."*

> *"everything you are painting is just one color, and it seems random … here's a red object, here's
> an amber object. Next sweep, here's that red thing again but over here … If it leaves radar range
> and comes back in, its a completely different color. **A single object could potentially have bits
> that are red, blue, or green!**"*

> *"If its possible to make the radar layer a bitmap, and essentially a 'radar heatmap' that uses
> exactly three colors (and no blends of them at all) … The most certain 'this is a thing here'
> results (probably most of the large object) are just red. The stuff that's like, 'there's probably
> a thing here but it could be fuzzy' is blue. The 'we're honestly not sure, it could be a really
> small thing but here you go' results are green."*

76. **THE RETURN LAYER BECOMES A BITMAP HEATMAP, NOT POLYGONS.** This **SUPERSEDES amendment 70's
    seeded-irregular-polygon blob grammar** and the per-blip `Graphics` model behind it. Returns are
    rasterized into an intensity buffer that is quantized to color and drawn as ONE texture. The
    polygon model was the root cause of both complaints: a polygon can only carry one fill, so color
    became a per-object LABEL, and an island could only be approximated by scattering small polygons
    along its arc. Diagnosis of record — the "random" color Eric saw was real and inherent:
    `echoColor(returnStrength(ext, dist))` is per-object, and `ext` swings with aspect (a battleship
    reads 32u bow-on and 124u abeam), so the SAME hull legitimately changed color as it turned or
    re-entered range. Nothing was random; the channel was simply wrong.

77. **COLOR IS INTERNAL TEXTURE, NOT AN OBJECT LABEL — exactly three colors, NO blends.** Intensity
    is computed per PIXEL and quantized into exactly three buckets, so a single return can and should
    show all three at once: a strong core reading red, a fuzzier surround reading blue, and an
    uncertain fringe reading green. **This SUPERSEDES amendment 74's continuous blue→green→yellow→red
    ramp** (which was a smooth per-object gradient — the wrong axis entirely) while KEEPING its
    parent ruling that hue on the scope encodes RETURN STRENGTH rather than identity (amendment 65).
    Eric's mapping, verbatim in his terms: **red = "this is definitely a thing"**, **blue = "probably
    a thing, but fuzzy"**, **green = "honestly not sure, could be something tiny."** He hedged the
    ordering himself — *"Or whatever the ACTUAL RADAR would look like"* — so the three colors and
    their thresholds ship as a CONFIG array and reordering is a one-line change, deliberately, in
    case he wants the more conventional marine red/yellow/green on seeing it.

78. **AN ISLAND PAINTS AS ONE MASSIVE CONTIGUOUS RETURN, not sampled points.** Its whole
    observer-facing landmass rasterizes as solid returns — a big island should read as a big red mass
    with softer edges, which is what the Garmin reference plates actually look like (mostly
    coastline). The near-arc-only rule from amendment 69 STANDS as physics (radar sees the near face;
    the far side stays shadow, and cross-island occlusion from cycle 51's review gate is unchanged) —
    what changes is that the near face is FILLED rather than sampled.

79. **Scope discipline.** Client-only presentation: no wire change, no server change, **`PROTOCOL_
    VERSION` is UNCHANGED by this cycle** (it reads **28**, not the 27 this amendment first recorded —
    the fractal-island cycle landed 27 → 28 in parallel and took cycle number 52, so this correction
    became cycle 53), no CONFIG combat tunable moves. `silhouette` mode is UNTOUCHED — it keeps
    hull outlines, personal hues and ARPA vectors, and remains the fail-safe default in code.
    Production has both flags ON as of PR #101, so this correction reaches live on merge.

## 2026-08-06 — Eric ruling, the sight-bubble radar gate (cycle 54)

Source: Eric, live, on the cycle-53 heatmap. Verbatim:

> *"islands are being radar painted in sight range, while ships are not. It should be all or none,
> and I am leaning towards none. But ships that are partially seen and partially in radar range
> should definitely still be painted. so lets say, the very edge of sight range, yes, but for the
> most part no."*

80. **RADAR PAINTS NOTHING INSIDE THE SIGHT BUBBLE — and the rule is PER-CELL, not per-object.**
    Cycle 53 left a real inconsistency: ship echoes never appear inside truesight (the SERVER's
    `blipGate` has always excluded `dist <= sightRange`, because a sighted hull is a full `Contact`
    instead), but island coverage is pure client presentation off the map seed and had no sight term
    at all — so coastline painted straight through the bubble while hulls did not. Eric ruled the
    inconsistency closed toward **none**: inside truesight you are LOOKING, and the scope adds
    nothing there.

    The nuance he attached — *"ships that are partially seen and partially in radar range should
    definitely still be painted"* — is why this is a **per-CELL** gate and not an object-level
    exclusion. An island straddling the boundary paints only the portion beyond it; a hull at the
    very edge paints the part that lies outside. This is only expressible because amendment 76 moved
    to per-pixel intensity: the polygon grammar could not have delivered it, since a polygon carries
    one fill and would have had to be wholly in or wholly out.

81. **THE CUTOFF IS `fogHoleRadiusU()` — the SAME function that draws the visible hole.** The
    suppression boundary must be the drawn fog hole exactly, not an approximation of it, or the seam
    reads as a rendering bug. `render/fog.ts` `fogHoleRadiusU(sightRange, dazzled)` is the one source
    and it is already dazzle-aware (`CONFIG.starShells.dazzleSightFactor`).

    **Consequence that must be implemented, not assumed:** the radar currently receives
    `stats.sightRange` (boon-aware) but NOT dazzle — `main.ts` plumbs dazzle only into the fog
    (`g.fog.setDazzled(...)`). So a DAZZLED observer would get a shrunken fog hole with an unshrunken
    suppression circle, leaving a dead annulus that is fogged AND unpainted — the exact seam this
    ruling exists to remove. Dazzle must be plumbed into the radar the same way it is into the fog.

82. **Scope.** Client-only presentation: no wire change, no server change, `PROTOCOL_VERSION`
    unchanged, no CONFIG combat tunable moves. `blipGate` is NOT touched — the server rule that a
    sighted hull is a contact rather than a blip is already correct and is what this aligns islands
    to. `silhouette` mode is UNTOUCHED (it has no coverage grid at all, so it never had the bug).

## 2026-08-06 — Eric ruling, A PAINT IS A HISTORICAL RECORD (cycle 55)

Source: Eric, live, on the cycle-54 build. Two messages, verbatim:

> *"islands are being painted as soon as they leave sight range, rather than when the radar sweeps
> them. **THE RADAR SWEEP IS THE ONLY THING THAT PAINTS. EVER.** Lets just say this: if its OUTSIDE
> of sight range and its detected by radar, then radar paints it, and this includes the part of ships
> you can't see. If its INSIDE of sight range, then we don't need to radar paint it."*

> *"just because it leaves radar range doesn't mean it gets un-painted. the phosphor decays
> naturally, right?"*

83. **THE GOVERNING INVARIANT: A PAINT IS A HISTORICAL RECORD.** Everything about a paint —
    position, intensity, which band a cell lands in, and **whether a given cell paints at all** — is
    decided ONCE, at paint creation, from the observer's state at that moment. The ONLY property that
    changes afterward is alpha, via phosphor decay. Nothing about a paint may ever be re-evaluated
    against live state. This single rule subsumes all three of Eric's complaints and is the thing to
    check first whenever a new radar behavior is added.

84. **THE BUG: cycle 54 put the sight test at STAMP time, so the bubble receding PAINTED things.**
    Amendment 81 gated per-cell in `writeCell` against the LIVE grid anchor, re-evaluated every
    frame. So an island cell already inside the swept arc but suppressed for being inside truesight
    would light up the instant the observer moved away — no sweep involved, which is exactly what
    Eric saw and exactly what *"THE RADAR SWEEP IS THE ONLY THING THAT PAINTS. EVER"* forbids.
    Amendment 81's *intent* (radar adds nothing inside truesight) stands and is unchanged; only its
    EVALUATION TIME was wrong. Cycle 54's stated reasoning for choosing stamp time — that a bake-time
    gate "would go stale as the observer moves" — inverted the truth: staleness is CORRECT here,
    because a paint is history.

85. **THE FIX: freeze the observer onto the paint.** Each paint carries the observer position and
    sight radius as of its own creation, and the sight test runs against THOSE frozen values, never
    against the live grid. A cell inside truesight when the beam crossed it never enters the paint at
    all; a cell outside truesight when swept is painted and thereafter only decays. Note the rest of
    the design was ALREADY built this way and is the precedent being followed, not a new idea:
    `ShipPaint` already freezes `bearing`/`dist` at paint time (so range attenuation never changes as
    you sail away), and `IslandPaint.cover` already bakes per-cell intensity and `faceShadow` from
    the observer at paint open. The sight verdict simply joins the set of things already frozen
    there. `HeatGrid`'s live `obsX`/`obsY`/`sightR2` fields exist only to serve the wrong model and
    go away with it.

86. **ACCEPTED CONSEQUENCE, recorded so it is not later mistaken for a regression: a decaying ghost
    may sit INSIDE the sight bubble.** If a cell is legitimately swept while outside truesight and
    the observer then closes on it, the paint keeps decaying in place rather than being erased. That
    is correct — *"the phosphor decays naturally"* — and erasing it would reintroduce exactly the
    live re-evaluation amendment 83 forbids. Leaving RADAR range likewise never un-paints anything
    (already true for ships via the frozen `dist`; now uniformly true).

87. **Scope.** Client-only presentation: no wire change, no server change, `PROTOCOL_VERSION`
    unchanged, no CONFIG combat tunable moves. `blipGate` untouched. `silhouette` mode untouched.

## 2026-08-06 — Eric ruling, THE SCOPE PAINTS EVERYTHING IN RANGE (cycle 56)

Source: Eric, live, on the cycle-55 build. Verbatim:

> *"I think I love it but I also think maybe we should paint **everything** in radar range, even if
> its in LOS. Just that if its in LOS (truesight) range, then you also see the actual ship in
> realtime."*

88. **RADAR PAINTS EVERYTHING WITHIN RADAR RANGE — the sight exclusion is RETIRED.** This
    **SUPERSEDES amendment 81** (cycle 54's sight-bubble gate) and the sight half of amendments 84-85
    outright. Inside truesight you now get BOTH channels at once: the live hull, drawn in realtime,
    AND its radar echo painted by the sweep. Rationale of record: a real scope does not stop painting
    what you can also see out the window, and the doubled read is information, not noise — the echo
    tells you when the beam last touched it, which the live hull does not.

    **Amendment 83 is UNAFFECTED and still governs.** "A paint is a historical record" was never
    about sight; it is about evaluation time, and every part of it stands. What is deleted is the
    frozen sight VERDICT, not the freezing discipline. Amendment 86's accepted consequence (a ghost
    decaying inside the bubble) stops being an edge case and becomes the ordinary case.

89. **SIGHTED SHIPS ARE PAINTED CLIENT-SIDE FROM THEIR `Contact` — no wire change.** The server has
    never sent a blip for a ship inside sight: `blipGate` excludes `dist <= sightRange` because a
    sighted hull is delivered as a full `Contact` instead, and that is correct and MUST NOT CHANGE
    (it is a perception-invariant surface). So the echo for a sighted ship is synthesized on the
    CLIENT from the `Contact` it already holds — which carries `cls` and `heading` (`types.ts:304`),
    everything `perpendicularExtent` needs. This discloses NOTHING new: a sighted hull is already
    fully visible, so painting an echo from it adds no information the client did not have.

    **The sweep still gates it (amendment 83).** A contact-derived echo is created when the BEAM
    CROSSES its bearing, exactly like a wire blip — not every frame, and not on contact arrival.
    `blipGate` and every server-side rule are untouched; this is purely a second client-side source
    of paints feeding the existing paint list.

90. **Scope.** Client-only: no wire change, no server change, `PROTOCOL_VERSION` unchanged, no CONFIG
    combat tunable moves. `silhouette` mode untouched.

91. **DEFERRED TO ITS OWN CYCLE, ruled but NOT built here: above-surface projectiles paint on radar.**
    Eric, same message: *"above-surface projectiles should get picked up on radar if they are swept
    over while in the air (this would currently apply to gun, cannon, star shells, and the decoy buoy
    [which is going to get some big changes soon!]) and show up as 'weaker' returns."* Deferred
    because — unlike amendment 88 — it is NOT a render change: ballistics are currently revealed ONLY
    inside the observer's sight bubble (`types.ts`: *"position and velocity AT REVEAL TIME (launch for
    the owner, first-sight for everyone else)"*), so painting them at radar range requires the SERVER
    to disclose ballistics further out. That is a wire change, a `PROTOCOL_VERSION` bump, and a
    genuine new combat-information channel — you would see incoming fire before it reaches truesight.
    Constraints that cycle must hold: the existing anti-cheat rule that a ballistic reveal carries NO
    range-derivable field (so the wire can never be solved back to the muzzle) applies unchanged at
    the wider radius; the reveal must be gated by the same annulus + island LOS + swept-this-tick
    test `blipGate` uses; torpedoes stay excluded (underwater — the shipped "quiet weapon") and mines
    stay excluded (not above surface). The DECOY BUOY already emits a counter-intel blip by design
    (Story 1.8, amendment 11) and Eric has flagged it for *"big changes soon"*, so it should be left
    alone rather than re-plumbed here.

## 2026-08-06 — Eric ruling, THE BUFFER FOLLOWS THE VIEWPORT (cycle 58)

Source: Eric, live, after cycle 57 was reverted for a rendering regression. His own framing of the
fix, verbatim:

> *"Honestly all you had to do was fix the 'box' to the edges of the users viewport rather than the
> edges of the radar ring."*

And the constraint he made explicit, and confirmed after it was repeated back to him:

> *"if I am zoomed in when it paints and then I zoom out, it still shows me everything that *would*
> have been there."*

95. **CYCLE 57 IS REVERTED (PR #108) AND ITS APPROACH IS ABANDONED.** Amendments 92-94's PROBLEM
    statement stands — the buffer must never clip a paint — but their SOLUTION (a worst-case
    allocation derived from boon-maxed ship speed, worked through a paint-driven active sub-rect) is
    withdrawn. Root cause of record: the active rect was recomputed and RE-CENTRED every frame and
    the sprite was placed at that moving origin, so the cell↔world mapping stopped being world-locked
    — islands drifted with the observer, and the texture's `subarray` view smeared rows when the rect
    resized underneath it. The tests missed it because they exercised the PURE rasterizer, where
    cell→world is a clean function; the break was in the Pixi ADAPTER's placement.

96. **THE BUFFER IS A SCRATCH SURFACE, NOT STORAGE — and it follows the VIEWPORT.** History lives in
    the world-positioned PAINT LIST, which is re-rasterized from scratch every frame (amendment 83).
    The buffer only needs to cover what is on screen: anything off-screen is not visible, so not
    rasterizing it costs nothing, and it reappears the moment it scrolls back into view. This needs
    no worst-case allocation, no derived speed bound, and no paint-driven rect that can drift.

    The buffer's origin therefore follows the CAMERA, **snapped to whole world cells** so the pixel
    lattice stays world-locked exactly as it does today. That snapping is the load-bearing detail:
    it is what keeps a paint's cells still while the camera moves over them.

97. **THE ZOOM CONSTRAINT: paint recorded while zoomed in MUST appear on zoom-out.** Eric's
    requirement in full — a paint made off-screen at high zoom is still recorded, and zooming out
    must reveal it. This holds automatically under amendment 96 because the viewport was never
    consulted at record time, and it yields the invariant that governs this cycle:

    **NOTHING VIEWPORT-DERIVED MAY EVER TOUCH PAINT CREATION OR PAINT RETIREMENT.** The camera
    influences exactly one thing: which rectangle of world is drawn this frame. Creation stays gated
    only by the sweep, radar range and LOS; retirement stays gated only by time. Verified at ruling
    time: `render/radar.ts` has no camera, viewport or zoom reference outside doc comments.

98. **THE ADAPTER SEAM IS THE RISK, AND MUST BE TESTED AT THE ADAPTER.** Cycle 57's regression
    reached production because a green PURE-module suite was accepted as proof that PLACEMENT was
    right. This cycle must pin, at the Pixi adapter level, that an echo at a known world position
    renders at that world position — at BOTH zoom extremes (`USER_ZOOM_MIN` 0.5 / `USER_ZOOM_MAX`
    1.5, `render/camera.ts`) and while the camera is moving. A pure-rasterizer test does not
    discharge this.

99. **Scope.** Client-only: no wire change, no server change, `PROTOCOL_VERSION` unchanged, no CONFIG
    combat tunable moves. `silhouette` mode untouched. Accepted consequence: per-frame cost scales
    with VISIBLE AREA, so zooming out costs more — it must be measured at both zoom extremes and
    reported, not assumed.

## 2026-08-06 — Eric rulings, THE RADAR PHYSICS ARC (cycles 60-62, pre-implementation)

Source: Eric, live design conversation opening the cycle-60 bmad-dev-auto run, immediately after
cycle 59 (island elevation) landed. This section is the DESIGN CONTRACT for a three-cycle arc; each
cycle's own spec derives from it. **Amendments 103 and 109 are OPEN QUESTIONS, not rulings** — they
are recorded here so the cycle that resolves them knows what was already considered.

100. **THE GOVERNING INTENT: REALISTIC RADAR IS THE KILLER FEATURE.** Eric, verbatim: *"honestly I
     think that having realistic radar operation is going to be the 'killer feature' here in this
     game. I love it so much. Its *almost* right but we need to really take it seriously."* Every
     ruling below serves that sentence. Where a realism choice and a convenience choice conflict, the
     realism choice is the default and the departure must be argued explicitly.

     > **SUPERSEDED IN PART BY AMENDMENT 115 — read that before citing this clause.** The first
     > sentence stands. The "realism is the default" rule does NOT: Eric ruled *"im not really
     > married to realism, i want semi-realism but fun gameplay."*

     The extrapolation license, verbatim: *"we don't have to go with google's exact list, and you're
     correct a lot of things aren't on it, but its meant kind of as a basis to go on, so we can
     extrapolate radar signatures of various things."* The consumer-radar colour taxonomy Eric
     supplied is a BASIS, not a spec — most of its entries (fiberglass hulls, kayaks, tugboats,
     pack ice, buoys, oil platforms) have no referent in Hullcracker and must not be invented to
     satisfy it.

101. **EVERY SHIP'S ANTENNA IS AT THE SAME HEIGHT.** Eric: *"For simplicity I would actually think
     we'd argue that every ship's radar is at the same height."* One universal mast height `H`; no
     per-class antenna, and (by the same ruling) no per-class masthead height for the OCCLUDED side
     of the calculation either — target and observer are the same height, which is what collapses
     the shadow math to amendment 102's single term.

102. **THE SHADOW FORMULA, AND THE CORRECTION IT FORCES.** Under a uniform antenna height with earth
     curvature in play, the earth-flattening transform (subtract `d²/2R` from every height so rays
     become straight) yields:

     ```
     h₀ ≥ H  →  shadow is INFINITE
     h₀ <  H  →  shadowLength = 2R·(H − h₀) / d₀
     ```

     where `h₀` = terrain height, `d₀` = the OBSERVER's distance to the terrain, `R` = effective
     earth radius. Verification that pins the derivation: at `h₀ = 0` and `d₀ = √(2RH)` (the sea
     horizon), total reach is `2√(2RH)` — the textbook masthead-to-masthead radar horizon.

     **CORRECTION OF RECORD.** An earlier statement in this same conversation — that shadow length
     GROWS with the observer's distance from the island — was flat-earth math with the target at sea
     level, and it is WRONG under amendment 101. The relationship is INVERSE: **closer to a low
     island = longer shadow.** Intuition: a low wall at arm's length blocks much of the world; the
     same wall a mile off blocks almost nothing. Any implementation that reproduces the discarded
     direction is a bug.

     Design consequences, both accepted: coast-hugging carries a real COST (you acquire a large blind
     wedge behind the terrain you are hugging, precisely where you must fall back on truesight), and
     terrain splits into SOFT cover (`h₀ < H`, situational, range-dependent) versus HARD cover
     (`h₀ ≥ H`, absolute at any range). `H` is therefore the single knob governing how much of a
     given map is hard cover — the fraction of the fBm field above mast height.

103. **OPEN QUESTION — should `CONFIG.vision.radar` be DERIVED from the horizon?** Today it is
     `SIGHT × 2` = 660u, a design number. Under amendment 102 the masthead-to-masthead horizon is
     `2√(2RH)`, so radar range can instead FALL OUT of mast height and world curvature, in the same
     spirit as the existing `radar = SIGHT × 2` and `muzzleFlash = SIGHT × 1.5` derivations.

     The argument for deriving: `H` and `R` already govern shadow length. If radar range stays an
     independent literal, the two can drift into contradiction — a scope reaching 660u while the
     horizon says 400u. Deriving makes that unrepresentable by construction.

     Illustrative fit (NOT a ruling, and NOT a tuned value): `H = 20u` gives `R ≈ 2722u`, a curvature
     radius close to the map radius (2400u), and sample shadows of 408u (5u bar at 200u), 136u (same
     bar at 600u), 136u (15u ridge at 200u), infinite (≥20u terrain) — all meaningful fractions of a
     660u scope. **Resolve in cycle 61; do not encode either option before then.**

104. **THE SHADOW EDGE IS SOFT, NOT A LINE.** A hull sits below its own masthead, so a ship entering
     a shadow is masked from the waterline up: the hull goes first and the upper works still return.
     The boundary is therefore a FADE through the weakest colour band, not a binary cutoff — free
     realism, and it delivers the "fuzzy" quality Eric's cycle-51 quote asked for rather than a hard
     geometric cut.

105. **COLOUR IS INTENSITY. ALWAYS. NEVER CATEGORY.** This RE-RATIFIES amendment 77 against the pull
     of the supplied taxonomy. The Google list enumerates OBJECT TYPES, which invites mapping colour
     to category (ship = red, coast = blue) — precisely the per-object LABEL that amendment 76
     diagnosed and killed. Object type may influence colour ONLY through physical properties (size,
     aspect, elevation, material, range) feeding a single intensity scale. The taxonomy then falls
     out as a CONSEQUENCE — a warship genuinely is the strongest thing on the water, a mudflat
     genuinely is a weak one — and stays consistent for objects the list never mentioned.

106. **ONE RETURN MODEL: REFLECTIVITY × FALLOFF-BY-GEOMETRY.** The radar equation sets falloff by the
     target's GEOMETRY, not by its name:

     | target geometry | falloff | why |
     |---|---|---|
     | point (ship) | 1/d⁴ | fixed cross-section |
     | surface (coast, surf, wake, sea clutter) | 1/d³ | illuminated area grows with range |
     | volume (rain, storm) | 1/d² | illuminated volume grows faster still |

     This is what makes the taxonomy emergent: sea clutter forms a near-ship ring because its
     coefficient is tiny even though it falls off slowly; a warship blazes close and fades far under
     the 4th power; a squall stays legible across the map under the 2nd.

     **THE COEFFICIENT TABLE BELOW IS AN ASSISTANT HANDWAVE, NOT AN ERIC RULING, AND IS THE FIRST
     THING TO TUNE:** steel broadside 1.0, steel bow-on ~0.25, rock cliff 0.5, sand/mudflat 0.15,
     breaking surf 0.06, wake 0.03, sea clutter 0.02, heavy rain 0.2. Do not treat any of these as
     ratified, and do not build a balance argument on them.

107. **SHIPS DO NOT SHADOW SHIPS — RATIFIED, AND IT IS ALREADY TRUE.** Eric's premise: *"Radar is
     usually mounted pretty high on ships, so because of the curvature of the earth, its generally
     able to distinguish entire ships as well as targets behind those ships, but islands will still
     cast a distinct radar shadow."* Verified at ruling time: LOS in `server/src/game/signals.ts`
     iterates ISLANDS ONLY, and no hull-occlusion path exists anywhere in the codebase. This
     amendment exists so the behaviour reads as DESIGNED rather than omitted — do not "fix" it.

108. **FOG AND RAIN ARE A COMPLEMENTARY PAIR, DEFEATING DIFFERENT SENSORS.** Eric asked for fog as
     *"a sort of both visual and radar cover"*; the assistant pushed back on the physics (X-band
     marine radar is ~3cm, fog droplets are tens of microns — attenuation is negligible, which is the
     very reason radar exists for navigation), and Eric ratified the alternative: *"I love your take
     on fog/rain, and that allows for more potential interesting map features."*

     - **FOG** — defeats TRUESIGHT; radar is untouched. This is radar's hero moment, the beat where
       the instrument justifies itself. The counterplay is ALREADY SHIPPED: every return is
       anonymous (no hue, no class), so in fog you know something is out there but not what or whose.
     - **RAIN SQUALL** — a moving VOLUME return (amendment 106) that masks contacts inside and behind
       it. Defeats radar; your eyes still work close in.

     Frequency, per Eric: *"both would be somewhat uncommon-rare map features anyway."* Scope: this
     is its own feature at epic scale and does NOT ride along with cycles 60-62.

109. **OPEN QUESTION — the wake implementation fork.** Eric asked for ship wakes to paint: *"I'd also
     like to see the wake left by ships (and perhaps torps) get picked up as green (we could also
     increase the wake length and add some displaced water at the sides of ships)"*, and on the
     implementation: *"Part of me feels like it might make sense to transfer the ships and wakes to
     the raster in each frame and use that for radar calculation. But whether that is client or
     server or even relevent, i dunno right now. I'm good with whatever is performant."*

     The raster instinct MATCHES the shipped architecture — `render/radarHeatmap.ts` already stamps
     contacts and islands into a world-anchored raster every frame. The fork is about the SERVER:

     - **Cheap** — the client draws a short trail behind each paint it already holds. No wire change,
       no server cost, ~90% of the look. You never see a wake without its ship.
     - **Real** — the server owns wake as world state with its own lifetime, so a wake OUTLIVES the
       ship's presence in your radar range: you find a trail with nothing attached and must infer
       heading and age. A genuinely new information channel — course and recency WITHOUT identity —
       and a new wire row plus a new perception surface.

     **THE PERFORMANCE FINDING THAT MAKES "REAL" AFFORDABLE (assistant analysis, unverified by
     measurement).** At `sweepRpm` 15 the beam advances ~4.5° per 50ms tick, so a server-side
     raymarch never needs the whole scope — only the WEDGE the beam just crossed. At ~0.5° spacing
     that is ~9 rays per observer per tick; with the cycle-59 max-height pyramid letting a ray skip
     an empty tile in one test, open water is nearly free. This is the same insight that makes
     amendment 102's shadows affordable server-side, and it is why shadows (cycle 61) is the natural
     place to resolve this fork. **Measure before committing.**

     Noted for the record, deliberately NOT proposed for any of cycles 60-62: the terminal form of
     this architecture is the server returning per-bearing (range, intensity) traces — an A-scope —
     instead of entity events. It is how real radar works and it is ideally anti-cheat-shaped, but it
     is a wire rewrite and nothing below depends on it.

110. **TORPEDO WAKES ARE TABLED.** Eric: *"I mean arguably they would leave small wakes. I really
     don't know the right answer, lets table this specifically for now and play it by ear later."*
     Standing context for whoever picks it up: `CONFIG.torpedo` states in as many words that
     torpedoes are *"Never painted by radar"*, so this is a REAL BALANCE CHANGE to the shipped quiet
     weapon, not a realism freebie. Decide it on balance merits, in its own cycle.

111. **THE RATIFIED THREE-CYCLE SEQUENCE.** Eric: *"I think your sequence makes sense. We need to
     make a note of this sequence though so I can reference it in the subsequent cycles."* Each cycle
     is one unit of work and one PR; the split exists because the pieces have sharply different costs
     and only one of them touches the server.

     - **CYCLE 60 — THE PHYSICAL RETURN MODEL.** Amendments 105 + 106 applied to everything the
       client already holds: terrain-height-driven coast colour, surf fringe (Eric: *"I'd love to see
       some kind of waves up against coastlines that would get painted green"*), sea clutter, storm
       returns. **Client-only: no wire change, no server change, `PROTOCOL_VERSION` unchanged.**
       Establishes the intensity model every later piece plugs into.
     - **CYCLE 61 — HEIGHT-AWARE SHADOWS.** Amendment 102's formula as ONE shared pure function over
       the cycle-59 height raster, called by BOTH `server/src/game/signals.ts` and
       `client/src/render/radarHeatmap.ts` — a second implementation is a desync or a leak. Plus
       amendment 104's soft edge. Resolves amendment 103 (derived radar range) and amendment 109's
       fork. **This is the cycle with real server cost at 20Hz; it needs a MEASURED perf budget, and
       the max-height pyramid exists to provide it.**
     - **CYCLE 62 — WAKES.** Ship wakes on whichever side amendment 109 resolves to, plus the render
       work Eric asked for (longer wakes, displaced water at the sides of ships). Torpedoes stay
       tabled per amendment 110.

     Sequencing rationale of record: model-first, because shadows want amendment 104's soft edge and
     a soft edge is expressed in INTENSITY, which cycle 60 is what defines. Eric on the ordering:
     *"I don't know? I think your sequence makes sense."* — so this is an assistant recommendation
     Eric accepted, not an independent Eric ruling, and cycle 61 may revisit it if the perf work
     argues otherwise.

## 2026-08-06 — Eric rulings, THE EIGHTHS LADDER + arc corrections (cycle 60, pre-implementation)

Source: Eric, continuing the same conversation, after a party-mode design round. These entries
CORRECT three things recorded above (amendments 100, 103 and the mast-height proposal) and add the
range model Eric wants every future cycle to think in.

112. **SCOPE DISCIPLINE: CARDS ARE NOTED, NOT DESIGNED.** Eric: *"I want you simply to make note of
     the card changes so we can address them later. For now, at least, I want to get the radar
     painting correctly."* Amendment 117 is a PARKING LOT. No card in it may be built, costed or
     balanced inside cycles 60-62 without a fresh Eric ruling. Cycle 60's job is the paint.

113. **THE EIGHTHS LADDER — THE RANGE MODEL OF RECORD.** Eric: *"lets imagine a concept of range
     zones from our ship. Concentric circles... lets go ahead and divide our total intel range into 8
     concentric circles... That model is how I want to think about range from now on, so definitely
     make a note of it."*

     **INTEL RANGE is the whole ruler**, and radar range is its full extent (8/8). Every sensor
     boundary is an eighth of it:

     | band | u (at intel range 660) | meaning | shipped today? |
     |---|---|---|---|
     | 8/8 | 660 | radar range | YES — `CONFIG.vision.radar` |
     | 7/8 | 577.5 | "far radar" — ships read BLUE rather than RED | **NEW** — no constant exists |
     | 6/8 | 495 | — | shipped `muzzleFlash` sits HERE, not at 5/8 |
     | 5/8 | 412.5 | muzzle / smoke range (Eric's placement) | **CONFLICTS — see below** |
     | 4/8 | 330 | truesight | YES — `CONFIG.vision.sight` |
     | 2/8 | 165 | visually see nearby mines + incoming torpedoes | **CONFLICTS — see below** |

     **TWO CONFLICTS WITH SHIPPED CONSTANTS — BOTH NOW RESOLVED BY AMENDMENT 119. Read it before
     acting on either bullet below; the bullets are kept verbatim as the statement of the problem.**

     - **Muzzle/smoke is at 6/8 today, not 5/8.** `CONFIG.vision.muzzleFlash = SIGHT * 1.5` = 495u,
       which is exactly 6/8 of 660. Smoke reach is that same number reused verbatim (amendment 42 —
       deliberately never forked into a fourth vision constant), so this one number moves both.
       `zone.test.ts` pins the derivation and the ordering `sight < muzzleFlash < radar`. Either Eric
       meant 6/8 (in which case the ladder already describes the shipped game exactly) or he is
       retuning the flash/smoke halo DOWN by 82.5u. **Ask before moving it.**
     - **Mines and torpedoes are revealed at 4/8 today, not 2/8.** Both go through `pointSighted` in
       `server/src/game/signals.ts` at the dazzle-scaled sight range (330u). Dropping them to 165u
       halves the warning a captain gets on an incoming fish and materially strengthens both the
       torpedo and the Mine Layer. That is a REAL COMBAT REBALANCE, not a presentation change.
       **Ask before moving it.**

     What the ladder unambiguously ADDS is 7/8 — the red→blue crossover — which no shipped constant
     covers and which lands squarely inside cycle 60. See amendment 118.

114. **R AND H ARE FIXED CONSTANTS. THE PER-SEED PERCENTILE IS REJECTED.** The party round proposed
     deriving the hard-cover threshold `H` from each map's own land-height distribution (a percentile),
     letting `R` float to absorb it. Eric: *"i definitely do not want max radar range determined from
     how much of the map happens to be high terrain... lets keep it as an intel range thing, and we
     just so happen to set R and H so that it hits our target."* RULING: **both `R` and `H` are fixed
     tuning constants**, chosen so the horizon lands on the intended intel range. Radar range is an
     INTEL RANGE property (amendment 113) and is never a function of terrain.

     Accepted consequence, and it is fine: the fraction of a given map that is hard cover now VARIES
     BY SEED. That was a balance problem only while a card could buy into `H` — with the mast-height
     card dead (amendment 116), nothing purchases its way across the threshold, so per-seed variance
     is simply map character. Some oceans have more hard cover than others.

     What survives from the party round is the ALGEBRA, which is worth keeping because it removes a
     variable from every future discussion. Pinning the product `2RH` to the intended range collapses
     the shadow formula to a scale-free form with no earth radius in it at all:

     ```
     shadowLength = (radarRange² / 4) · (1 − h₀/H) / d₀      [infinite when h₀ ≥ H]
     ```

     Everything is `h₀/H` — terrain height as a fraction of the hard-cover threshold. **There is no
     "small planet commitment"**; that framing was an artifact of writing the equation in the wrong
     variables, and amendment 103's "illustrative fit" language should be read through this.

115. **SEMI-REALISM, NOT REALISM — THIS SUPERSEDES AMENDMENT 100's DEFAULT CLAUSE.** Eric, verbatim:
     *"im not really married to realism, i want semi-realism but fun gameplay."* Amendment 100 framed
     realism as the default with departures requiring an explicit argument. That is now BACKWARDS and
     must not be cited as written.

     The corrected rule: **realism is the IDEA SOURCE and the tiebreaker on presentation; fun wins on
     mechanics.** Reach for the physics first because it generates better ideas than invention does
     (amendment 117's Doppler blind spot is the proof — a genuine mechanic nobody would have designed
     on purpose), but when the physical answer is boring, unreadable or unfun, take the fun one and
     do not apologize for it. Realism is a tool here, not a constraint.

116. **THE MAST-HEIGHT UPGRADE CARD IS REJECTED.** Proposed in the party round: reinterpret
     `intelRadar` as raising antenna height `H`, so radar range grows as `√H` and island shadows
     shrink. Eric: *"i don't want to increase mast size, that doesnt make much sense."* Dead. Do not
     re-propose. The findings that killed it are worth keeping anyway, because they apply to ANY
     future card that touches `H`: at a stack matching the shipped ~2.01× range multiplier, `H` would
     go 20u → 80u, putting nearly all terrain below the threshold and effectively **deleting hard
     cover from the map** — a match-winning effect priced as a common.

     Standing principle that falls out of the rejection: **land is sacred.** Sensor upgrades buy
     REACH; nothing buys its way past terrain. This holds by construction as long as no stat touches
     `H`, and it is the line to defend when a future card proposal gets clever.

117. **THE PARKING LOT — sensor card ideas, RECORDED ONLY, per amendment 112.** All four are Eric's
     except where noted. None is approved, costed, or scheduled.

     - **INTEL RANGE CONSOLIDATION.** Eric: *"i was thinking of maybe condensing sight and radar
       range to an 'Intel Range' stat."* Finding: this is ALREADY most of the architecture —
       `radar = SIGHT × 2`, `muzzleFlash = SIGHT × 1.5`, and gun/cannon/star-shell range all ride
       `radarRange`. The only unconsolidated piece is the CARD: `intelRadar` multiplies `radarRange`
       post-fold, so upgrading radar today does nothing to the sight bubble. Repointing it at `sight`
       makes the whole family scale together — cheap architecturally, but much stronger, so the
       ×1.15 would have to come down hard. This is also the natural home for amendment 113's ladder,
       since the ladder is defined in terms of intel range.
     - **DOPPLER RADAR.** Eric: *"changes the radar so it indicates speed and direction (towards or
       away from you) with red and green, perhaps toggleable, perhaps its a second overlay."*
       Colour-as-velocity COLLIDES head-on with amendment 105 (colour is intensity, never category).
       Eric's own hedge is the resolution and it matches real hardware: make it a MODE. Inside
       intensity mode colour is intensity; inside Doppler mode colour is velocity; the mode indicator
       becomes a correctness surface, not chrome. **The best property is one nobody designed:**
       Doppler reads only the RADIAL component, so a ship crossing your bearing shows ZERO. Turning
       perpendicular defeats the sensor — counterplay to equipment, free from the physics, and
       self-teaching in one match. Build the card for that, not for the colour.
     - **"GROUND-PENETRATING RADAR" — right mechanic, wrong name.** Eric: *"changes the radar so it
       can see into the radar shadow but halves its sweep speed."* GPR looks into SOIL and cannot see
       around terrain; the name will bounce off anyone who knows the hardware. What genuinely fills in
       behind terrain is LOW FREQUENCY — long waves diffract around obstacles where X-band cannot —
       and it pays in resolution and scan rate. Rename it a low-band / HF set and the halved sweep
       stops being an arbitrary tax and becomes the physical consequence, with "fuzzier returns"
       plugging straight into cycle 60's intensity model at zero new machinery. Two drawbacks means
       it is not a common.
     - **ACTIVE SONAR AS A SENSOR SLOT, ON THE `R` KEY.** Eric: *"perhaps [Active Sonar] could
       potentially also be sensor upgrade that lives in this slot, that could go to the R key (instead
       of a random pickup weapon), but that is major game system change that i like and warrants more
       discussion than we can give it here."* Parked at Eric's explicit request. Continuity note: this
       is NOT a new direction — the 2026-08-04 ruling deferred hydrophones *in favour of* active
       sonar, so this is that decision's follow-through. Needs its own cycle and its own discussion.

118. **THE LADDER IS CYCLE 60's CALIBRATION TARGET.** Amendment 106's intensity model has a
     coefficient table that is explicitly an assistant handwave with nothing to calibrate against.
     Amendment 113's 7/8 band supplies exactly that: tune the falloff so a mid-size hull crosses
     **red → blue at 7/8 intel range (577.5u)**. Note the reconciliation — under amendment 106 the
     crossover is a CONSEQUENCE of the 1/d⁴ curve, never a hard-coded radius, so 7/8 is a target the
     curve is fitted to hit, not a threshold branch in the code. Writing an `if (d > 577.5)` anywhere
     in the paint path violates amendment 105 and is the wrong implementation of this amendment.

119. **THE TWO LADDER CONFLICTS ARE RULED — amendment 113's open bullets are CLOSED.** Both bands
     were put to Eric with the shipped values and the consequences named; both answers are his.

     - **MUZZLE / SMOKE MOVES TO 5/8.** Eric: *"5/8 for muzzle/smoke."* So `CONFIG.vision.muzzleFlash`
       goes `SIGHT * 1.5` → `SIGHT * 1.25` (495u → 412.5u) — the ladder is RETUNING the halo, not
       describing it. **This drags a second signal with it, deliberately:** amendment 42 reuses this
       one constant for wounded-smoke reach rather than forking a fourth vision constant, so the
       plume's reach drops to 412.5u in the same edit. Eric named the band "muzzle/smoke", so the
       coupling is doing exactly what it was designed to do. A THIRD consumer must be re-examined in
       the same story: the foghorn's volume tiers derive from `max(1.5 * sight, muzzleFlash)`
       (amendment 53), and that `max()` exists to keep the tiers monotone so an intel build hears
       farther and a dazzle cannot also deafen — verify that property still holds at the new value.
     - **MINES AND TORPEDOES DROP TO 3/8, NOT 2/8.** Eric: *"lets split the difference and say its
       3/8, and i can tweak from there. Torpedoes and mines especially need buffs. 3/8 will probably
       help them."* So detect range is `SIGHT * 0.75` (247.5u), replacing the truesight gate the two
       share today through `pointSighted`. This is a REAL COMBAT BUFF to the torpedo and the Mine
       Layer, taken knowingly and expected to be tweaked from there.

       **SHELLS DO NOT MOVE.** Eric named mines and torpedoes only; shells keep materializing at the
       truesight boundary. The rationale that makes this coherent rather than arbitrary: a torpedo is
       a wake just under the surface and a mine sits in the water, while a shell is in the air. Under
       amendment 115 that is exactly the right kind of reasoning — physics supplying a justification
       for a choice made on gameplay grounds, not dictating it.

       Eric also flagged a possible future that this story must NOT pre-build: *"Maybe 'detect range'
       could be a stat each could get separately in the future, but for now this is fine."* One
       shared constant now; a per-weapon `detectRange` stat is parked under amendment 112's rule.

     Every eighth lands on a clean `SIGHT` multiple, so the ladder ADDS no new derivation style — it
     extends the one `radar = SIGHT * 2` and `muzzleFlash` already use: 8/8 = `SIGHT * 2`, 7/8 =
     `SIGHT * 1.75`, 5/8 = `SIGHT * 1.25`, 4/8 = `SIGHT`, 3/8 = `SIGHT * 0.75`.

120. **THE ARC IS FOUR EPIC-4 STORIES, NOT AN INTERSTITIAL CYCLE.** Eric: *"I think we have used a
     lot of context on planning, so instead I'd like you to add these as epic 4 stories, so that the
     next agents who get to them can start from fresh context... they are nonblocking on anything
     left as far as I know. And I am 100% doing them next, before anything else."*

     Landed as **4.9 The Eighths Ladder → 4.10 The Physical Return Model → 4.11 Height-Aware Radar
     Shadows → 4.12 Radar Wakes** in `planning-artifacts/epics.md`, with both trackers updated. This
     SUPERSEDES amendment 111's cycle-60/61/62 framing as to *vehicle* only — the three-cycle content
     split and its sequencing rationale are unchanged, and 4.9 is new work that 111 did not cover
     (the ladder post-dates it). 4-6/4-7/4-8 are deferred behind the arc, not cancelled.

## 2026-08-06 — Eric rulings, Story 4-9 pre-implementation question gate (bmad-dev-auto, cycle 60)

Source: Eric, invocation intent plus a two-question pre-implementation gate (AskUserQuestion, both
answered on the recommended option). Spec of record: `spec-4-9-the-eighths-ladder.md`. Invocation
intent, verbatim: *"4-9. WRT to foghorn... we can use 1/4's as the volume adjust scale, or split it
into 8 'volume regions', i dont care."* These entries CLOSE the two questions amendment 119 left
implicit and record one consequence that a future cycle will otherwise mistake for a regression.

121. **THE 3/8 DETECT RANGE SCALES WITH THE OBSERVER EXACTLY AS SIGHT DOES — it is not a flat rung.**
     Mine and torpedo detection resolves as `0.75 × sightOf(me, now)`, so a star-shell DAZZLE halves
     it (247.5u → 123.75u, cutting head-on torpedo warning to ~2s) and `intelTruesight` boons widen
     it, and island LOS applies unchanged. Amendment 119 states the value as `SIGHT * 0.75`, which
     reads like a flat constant in the mould of `muzzleFlash`; this ruling resolves that reading
     toward the observer-scaled one on the grounds that it is the SMALLEST change — it narrows the
     gate mines and torpedoes already ride (`pointSighted` → `sightOf`) rather than moving them onto
     a different kind of quantity — and that it keeps the standing principle that **sensor upgrades
     buy REACH** (amendment 116) applying to detection as it applies to everything else optical.

     Explicitly REJECTED: boon-widened-but-not-dazzle-scaled (which would have made detection the one
     optical channel a flare cannot touch), and a flat 247.5u for everyone (the most literal reading
     of the ladder, rejected because it makes mine/torpedo detection the single sensor in the game
     that nothing can improve or degrade). **Binding implementation consequence:** `pointSighted` has
     NINE call sites — mines, shells, torpedoes, homing-torpedo updates, decoys, booms, bursts,
     sunk-witness and spawns all ride it today — so this ruling must land as a SEPARATE parameterized
     gate used by the mine, torpedo and torpedo-update rows only. Narrowing `pointSighted` itself
     would silently shrink six unrelated disclosures, and **SHELLS DO NOT MOVE** (amendment 119)
     even though `shell` and `torp` are literally the same generic row body today.

122. **THE FOGHORN REBASES ONTO THE LADDER AS EIGHT VOLUME REGIONS OF THE LISTENER'S INTEL RANGE.**
     Eric offered quarters or eighths and delegated the choice; shown the concrete tradeoff he took
     eighths. The band is which eighth of the LISTENER's own intel range (`stats.radarRange`) the
     honker sits in, and gain is flat at 100% through band 4 then steps down one eighth of the
     100→50% span per band: **1.0 / 1.0 / 1.0 / 1.0 / 0.875 / 0.75 / 0.625 / 0.5.** Both anchors from
     Eric's original foghorn message survive exactly — *"within truesight range at full volume"*
     (band 4 = 330u at base) and the radar edge at 50% (band 8 = 660u).

     **This RETIRES amendment 53's `max()` clamps, and the clamps' PURPOSE is now satisfied
     structurally rather than defensively.** Amendment 53 recorded that the clamps were load-bearing
     because `muzzleFlash` is flat while `sightOf` is dazzle-scaled, so the three bounds were not
     monotone by construction; the design meaning being protected was **dazzle must not also
     deafen.** Anchoring the ladder on intel range — which dazzle does not touch — makes that
     property true BY CONSTRUCTION: there is nothing left to clamp, and no arrangement of dazzle and
     boons can invert the bands. Note the deliberate trade this carries: hearing now widens with
     `intelRadar` rather than with `intelTruesight`, so "an intel build hears farther" survives
     through a different card than before.

     **The island muffle (amendment 54) is PRESERVED IN MEANING, and the one-step rule survives:**
     blocked LOS resolves to `max(5, band + 2)`, silent when that exceeds 8. Two bands is the width
     of one old tier, so the demotion reproduces amendment 54 at its boundaries — a honk at the
     truesight edge blocked by rock lands at 75% exactly as it did before, and the outer bands still
     lose the honk entirely. The `max(5, …)` floor is what keeps *"a rock ALWAYS costs the honker
     reach"* true inside the 100% plateau, where a pure band shift would have cost nothing. There is
     still exactly ONE `losClear()` call and exactly ONE set of bounds in the row.

123. **Scope discipline of record.** `PROTOCOL_VERSION` **bumps 29 → 30**, and the assessment the AC
     demanded (*"bumped if and only if a stale client would misrender"*) came back YES on two
     independent grounds, not one: the foghorn's `v` field widens from a 3-value tier to an 8-value
     band (a genuine wire-shape change), and the client's torpedo dead-reckoning cull
     (`render/projectiles.ts`, `sightRange + margin`) becomes detect-derived, so a stale tab would
     keep drawing an un-corrected torpedo ghost past the range the server stopped updating it. The
     ladder itself changes NO combat tunable beyond the two Eric ruled: no damage, reload, hp, xp or
     catalog value moves, and `radar = SIGHT * 2` / `sight = SIGHT` are untouched.

     **The 7/8 rung ships as a NAMED CONSTANT but is deliberately UNCONSUMED**, per the AC that lists
     it among what lands. It carries a loud comment recording amendment 118's constraint: it is Story
     4.10's CALIBRATION TARGET — the red→blue crossover must EMERGE from the falloff curve — and
     writing `if (d > farRadar)` anywhere in the paint path violates amendment 105 and is the wrong
     implementation of it. This is the one place the arc knowingly ships a constant with no caller,
     because naming the rung is what makes the ladder complete and checkable.

     **Two accepted consequences, recorded so a later cycle does not read them as defects:** the
     muzzle-flash and wounded-smoke annulus beyond the sight bubble HALVES from 165u (330–495) to
     82.5u (330–412.5), which is where all of both signals' new work happens — the flash still
     covers the back-dated shell spawn because 412.5 > 330, so amendment 15's D1 masking coupling
     holds. And a mine's or torpedo's BOOM/BURST stays on the truesight gate: you can now watch an
     explosion you never saw the ordnance for, which is correct — an explosion is a far larger thing
     than the mine that made it. The decoy buoy also stays on `pointSighted`, untouched, per
     amendment 91's instruction to leave it alone ahead of its own rework.

124. **THE FOGHORN WIRE IS FLOORED AT BAND 4 — the emitted domain is 4..8, not 1..8.** This
     NARROWS amendment 122's *"band 1 is the innermost eighth"* on the WIRE while leaving its ruling
     — the eight-region gain curve — untouched and exactly reproduced. Found at the review gate by
     the in-family adversarial pass and adopted as an orchestrator ruling.

     The reasoning is that bands 1-4 are IDENTICAL in every honest surface: gain is 1.0 for all four
     and the chevron weight is the shipped tier-1 weight for all four. So transmitting *which* of
     bands 1-4 a honker occupies handed a modified client two extra bits of range resolution — an
     82.5u annulus where the old three-tier wire gave 330u — with **no honest consumer at all.**
     That is precisely the disclosure amendment 51 exists to bound, and it bit hardest exactly where
     it matters: a DAZZLED or `intelRadar`-boosted listener can receive an inner band for a honker
     they cannot see, which is the fog the flat-100%-plateau presentation was supposed to be hiding.

     **CORRECTED BY THE STEP-04 REVIEW, SAME CYCLE: the floor is applied to the RAW band FIRST, then
     the muffle.** The first implementation floored the EMITTED value after the muffle, which was
     wrong twice over and both hunters' findings converge here. It leaked the very plateau bit the
     floor exists to suppress — a blocked honk resolved raw bands 1-3 to 5 but raw band 4 to 6, so a
     modified client that knows an island intervenes (it holds the map seed and both positions) still
     recovered "inside 247.5u" vs "in the 247.5-330u shell". And it silently WEAKENED amendment 54:
     a blocked point-blank honk landed at 87.5% where the ratified rule is that a rock costs one old
     tier, i.e. 75%. Flooring first fixes both — the truth table is now raw 1-4 → 4 clear / **6**
     blocked (0.75, amendment 54 restored exactly), 5 → 5/7, 6 → 6/8, 7 and 8 → themselves clear and
     SILENT blocked. The blocked path now carries no more resolution than the clear one, which is the
     property to preserve on any future edit.

     Standing principle this establishes, worth applying to any future signal: **the wire may carry
     no finer resolution than the presentation actually consumes.** A quantised channel's bucket
     count is an anti-cheat parameter, not just a rendering one — if two buckets render identically,
     shipping both is pure disclosure. No `PROTOCOL_VERSION` change is warranted: this is a
     sender-side tightening inside the already-bumped PV 30, and `FoghornEvent.v`'s TYPE stays 1..8
     so a band below 4 still resolves correctly if one ever arrives.

125. **Three defects the review gate caught that are worth recording, because their shape will
     recur.** All three were confirmed against the code before any fix was dispatched; the first was
     flagged by BOTH the in-family and the cross-model (Codex) reviewer independently.

     - **A dazzle-scaled server ring was mirrored by an un-dazzled client ring.** The server reveals
       and corrects ballistics inside `sightOf(me, now)`, which IS dazzle-scaled; the client derived
       its dead-reckoning cull from the raw `stats.sightRange`, and `updateDazzle` plumbed dazzle to
       the fog and the radar but never to the projectile renderer. A dazzled captain therefore kept
       dead-reckoning a fish the server had stopped correcting — **the client inventing information
       it does not have.** This is the amendment-81 bug class exactly, one story later, in a
       different renderer. The gap PRE-DATED this story on the shell path; what this story added was
       a comment and a unit test ASSERTING dazzle-scaling that did not exist, which is what made
       fixing it mandatory rather than optional. Dazzle is now plumbed into `Projectiles` the same
       way it reaches the fog and the radar, so both cull rings shrink and the shell-side gap closes
       too. **The durable lesson: whenever the server gates something on `sightOf`, any client
       mirror of that gate must receive dazzle, or the two silently disagree.**
     - **A perception oracle can pass VACUOUSLY.** The independently-reimplemented `mz`/`sm` oracle
       hardcodes its bound by design (it must not read the production constant), and it asserted
       `dist <= SIGHT * 1.5`. When the halo moved to `SIGHT * 1.25`, every emission still satisfied
       the looser bound, so the suite stayed green while silently ceasing to be independent between
       412.5u and 495u. An oracle that only ever checks an upper bound cannot detect a channel
       getting SMALLER. Tightened, with directed cases at 420u that fail against the old halo.
     - **A cull applied to the owner's own ordnance on a rationale that is false for owners.** The
       server's owner path short-circuits BEFORE the detect gate, so an owner's own torpedo is
       revealed and corrected at any range — yet the new detect-derived cull was applied to every
       torpedo including the player's own, silently cutting own-fish feedback from 370u to 287.5u
       with no ruling behind it. The detect cull is now ENEMY-ONLY. Generalisable: a gate copied from
       the observer path onto the owner path inherits an argument that was never about owners.

