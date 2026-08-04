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
