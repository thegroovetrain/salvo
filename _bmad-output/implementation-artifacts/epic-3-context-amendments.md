# Epic 3 Context — Ratified Amendments

Durable, append-only record of ratified corrections to `epic-3-context.md` (bmad-dev-auto amendments protocol, Epic 1 retro Action #1). On any conflict with compiled epic context or planning docs, these entries WIN.

## 2026-08-01 — Eric rulings, Epic 2 retrospective (epic-2-retro-2026-08-01.md, live session)

Source: Eric, live rulings recorded in the Epic 2 retro; both routed into Epic 3 spec authorship by the retro's action table.

1. **Storm-purple exclusivity is dead; the binding 3.2 requirement is ring-edge legibility.** Eric: what matters is that players can easily see the edge of the ring against everything else on the water — not that purple appears nowhere else. Accent reuse of storm purple by other systems (e.g. EXCLUSIVE boons, epic-2 amendment 49) is explicitly fine. Story 3.2's "purple appears nowhere else in the game" AC clause (epics.md) is superseded; 3.2's design gate is judged against ring-edge legibility (current ring vs next ring vs fog vs blips, at any zoom).
2. **Story 3.1's spec carries the economy-evidence baggage** (retro Action #3; picks-band attribution Eric-ratified at the 2-10 amendment-55 checkpoint): (a) picks-band shortfall ownership — the 12–20 picks-per-match band is arithmetically unreachable at current match lengths; match length, not XP dials, is the fix, and no XP dial change may chase the band before 3.1 lands; (b) the harness-lengths-are-lower-bounds caveat — pilots are omniscient, so a timeline tuned to ~12:00 in the harness may run longer for humans; (c) the `endedBy` match-end split is used in the evidence read; (d) a post-landing baseline rerun confirms match length and picks-band reachability.

## 2026-08-01 — Eric rulings, Story 3-1 pre-implementation questions (AskUserQuestion, this run — round 1)

Source: Eric, direct answers to the four surfaced questions.

3. **Rings are OFFSET-CENTER.** Each next ring lands at a seeded offset, fully contained in the current ring — the minute-3 reveal carries real planning pressure (GDD: "where you must be is now known"). Ring centers derive deterministically from the map seed; both sides compute identically; nothing new travels on the wire beyond the phased state itself. Drones, harness pilots, and the zone renderer thread the live ring center instead of assuming (0,0).
4. **Final ring radius = 2 × truesight radius (660u at sight 330), the literal "two truesight diameters across" reading, DERIVED from CONFIG.vision.sight** — never an independent constant; retuning truesight moves the endgame. Lands in 3.1 as the timeline's terminal value; Story 3.4 owns constraint verification (including the radar-650-vs-660 marginality) and the no-stalemate evidence.
5. **Intermediate ring radii step down GEOMETRICALLY** (each close multiplies radius by the same ratio, map → final in 3 equal-ratio steps), shipped as per-group CONFIG-tunable design-target fractions.
6. **Evidence adds a PACIFIST-PILOT control** (a no-hunt policy flag in the batch-sim harness): lethal pilots keep giving the lower-bound baseline, pacifist matches run the full ring rhythm to storm-forced conclusion — proving ~12:00 closure, storm pressure, and picks-band reachability under long matches.

## 2026-08-01 — Eric rulings, Story 3-1 pre-implementation questions (AskUserQuestion, this run — round 2, map size)

Source: Eric, mid-run message ("the map is going to need to be a *lot* bigger… ideally the actual rate it closes should be comparable to ship speed") + direct answers to the three follow-up questions.

7. **The map bump lands IN Story 3.1** (not waiting for 6.2): production map radius target **~2400u** and match fill target **~20 ships** as CONFIG design targets, with exact values ratified at a mid-run evidence checkpoint (the 2-10 amendment-55 pattern — no autonomous balance commits). The design equation is the **closing-rate criterion**: with offset rings the worst-case escape distance per close is up to 2× the radius delta, and it should land ≈80% of a battleship-minute (slowest hull 35 u/s × 60s = 2100u) — survivable if you commit immediately, lethal if you loiter ("neither dilly nor dally"). At R≈2400 geometric steps to 660 give first-close delta ≈840u → worst case ≈1680u ≈ 80%. Ring-offset cap stays a tunable to trim worst cases. Story 6.2 later makes sizing roster-dynamic; perf + XP-economy effects of the larger fill are measured in the evidence run.
8. **How CONFIG expresses the bigger map is implementer-drafted** (baseRadius/capRef/fillTo retune), checkpoint-ratified; the ratified targets are the resulting radius ≈2400u and fill ≈20.
9. **"20 teams of 1–3 players" is ledgered for Epic 6** — squads are new GDD-level scope (current GDD: one ship per player, FFA); captured as a deferred-work entry homed at Epic 6 lobby design (queueing, rosters, spawn buffers, PvE room designed together); the GDD updates then, not now. Nothing about teams blocks 3.1.

## 2026-08-01 — Eric ruling, Story 3-1 spec-gate confirmation (AskUserQuestion, this run)

Source: Eric, direct answer to the surfaced anti-cheat question.

10. **Ring centers are SERVER-PRIVATE — supersedes amendment 3's "derive from the map seed" derivation channel.** Because mapSeed is client-known, seed-derived centers would let a modded client precompute all future rings; instead they roll on a server-private seeded stream (decorrelated, offer-stream pattern), and revealed geometry travels to clients via the synced room state at reveal time (small wire addition, riding the already-planned PROTOCOL_VERSION 17→18 bump). Player-visible behavior identical (offset rings, revealed at minute 3); harness reproducibility preserved (World seed → zone stream). Amendment 3's ratified WHAT (offset-center rings, containment, reveal beat) stands unchanged.

## 2026-08-01 — Eric ruling, Story 3-1 evidence checkpoint (AskUserQuestion, this run — the amendment-7 checkpoint)

11. **The 3-1 tuning pass is RATIFIED AS EVIDENCED, unchanged** (`batch-sim-evidence-2026-08-01.md`): `map.baseRadius 2400 / capRef 20 / match.fillTo 20`, `zone.beatMs 60000 / offsetCap 1.0 / terminalSightFactor 2 (→660u) / geometric ringSteps / stormDps 4`. Evidence: pacifist control reaches picks p50 12.0 exactly at 12:00 closure (band floor) and 21 by cap; lethal baseline p50 tripled to ~3:00 with picks 4; map sweep shows match length now scales with board size (zone-insensitivity over); closing-rate table pins 2400u at 79.9% of a battleship-minute on close 1 (the ratified ~80%), 3200u rejected (>100%, worst-placed battleship unsavable), 1600u rejected (toothless). No XP/deck dial touched (amendment 2 honored — the picks band was reached by match length alone). Measured observation, no change: 84% of hunter kills are drones (piñata until Epic 6 bots; awareness only). The 2-10 picks-band deferred-work entry is RESOLVED by this evidence.

## 2026-08-01 — Eric rulings, Story 3-1 review gate (AskUserQuestion, this run)

Source: Eric, direct answers during the 3-1 review gate.

12. **Islands scale with the map bump, in-story.** The island budget (cluster count, modestly sizes) scales ~with map area so the 2400u board keeps Hullcracker's cover/LOS/radar-shadow density instead of shipping ~14% of the pre-bump density as open sea; spawn-clearance rules keep holding; smoke seeds re-scanned; evidence baseline re-run. (Review finding: generateMap constants were tuned for the 900u board; no prior amendment covered island density.)
13. **Versioning re-ruled (project-wide): the game stays 0.17.X until all 7 epics complete.** X = the count of landed dev-auto build cycles for these epics (epic stories AND interstitial fix cycles); each future cycle increments X by 1. This PR is cycle 31 → VERSION 0.17.31 (the in-run 0.18.0 bump is reverted). Supersedes the old "0.X.0 = features" application for the epic era.

## 2026-08-02 — Eric rulings, Story 3-2 pre-implementation questions (AskUserQuestion, this run)

Source: Eric, direct answers to the four surfaced questions (all chose the presented recommendation).

14. **Ring-edge grammar ratified (the UX OQ#7 treatment choice):** the CURRENT live ring renders as a SOLID stroke at storm-readout (#B06EE8), ~2px screen-locked (zoom-compensated) width; the REVEALED next ring renders as a DASHED stroke at storm-readout at ~50% alpha (the shipped telegraph treatment). Solid-vs-dashed is the non-color channel separating live boundary from telegraph. The 3.1 interim phosphor-green "safe ring" RETIRES — both edges are violet, satisfying UX-DR5's edge clause. The AC's "resolved WITH ERIC" treatment choice is hereby closed; the on-sight ring-legibility sign-off still happens at the story's design-gate checkpoint (screenshots, amendment-55 pattern) before finalize.
15. **Storm fill is FULL-AREA — supersedes the interim 70u annulus band:** the whole region outside the live ring fills at low-alpha storm (#7B2FBE) out past the map edge; fill alpha is implementer-tuned so blips/contacts (which draw above the zone layer) stay legible; the edge stroke, not the fill, carries the 3:1 legibility (DESIGN.md contrast note).
16. **Attention-tier arbitration lands as a MINIMAL PURE SEAM (first consumer of the EXPERIENCE.md tier table):** a small pure helper computes "Tier-1 active" (HP-rail low-HP pulse active, or a live denied-fire pulse) and the in-storm vignette (Tier 2) holds steady at its lit (max-alpha) keyframe while true, resuming its ≤pulseCapHz breathing when clear. Story 4-8 owns the generalized three-tier system; no economy-tier or cross-module arbitration ships here.
17. **The reveal moment gets a SUBTLE ONE-SHOT:** the dashed telegraph lands with a brief flash-then-settle under the one-shot grammar (80 ms, ≥300 ms spacing, ≤3 flashes/s per region), motion-gated (motion=off → telegraph appears with no flourish). NO audio cue ships in 3.2 — the sound-event map remains open question #8 for the later audio pass.
