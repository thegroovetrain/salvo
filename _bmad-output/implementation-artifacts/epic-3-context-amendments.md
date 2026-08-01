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
