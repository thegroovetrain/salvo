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

## 2026-08-05 — Eric rulings, the per-shell damage law (bmad-dev-auto, interstitial — cycle 47)

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
