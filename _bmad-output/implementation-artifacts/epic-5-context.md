# Epic 5 Context: The Living Ocean

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 5 gives the ocean itself narrative texture and turns dying into a designed beat rather than a hard stop. Ship life-and-death becomes an explicit reversible state machine (`alive | sinking | sunk`) riding a data-declared tick-order registry, so every future sim step — sinking deceleration, whirlpool force, PvE roving — is a one-line insertion rather than a special case threaded through `world.step()`. On top of that spine: a five-second sinking ritardando where the hull decelerates but guns stay live (you can take your killer with you), an omniscient reveal that drops fog and shows the whole map on death, a results modal that closes the loop in two presses, fog banks that trade your own sight for your invisibility, hemisphered whirlpools that carry and spin hulls crossing them, and roving PvE drone fleets in three tiers that give the sensor game a second kind of prey. The throughline is Pillar 2 ("death is cheap"): losing converts into a legible, watchable story and the next match is seconds away.

## Stories

- Story 5.1: Lifecycle State Machine & STEP_ORDER Registry
- Story 5.2: The Sinking Window (resolves the sinking-activation policy with Eric)
- Story 5.3: Omniscient Reveal & Results (resolves the reveal-zoom motion exemption)
- Story 5.4: Fog Banks
- Story 5.5: Whirlpools (feel treatment designed with Eric)
- Story 5.6: Roving PvE Fleets

## Requirements & Constraints

- **Ship lifecycle is a discriminated union**, not boolean-ish alive/dead flags: `alive | sinking(since) | sunk(at)`, with transitions validated in one place and `sinking -> alive` a reserved (never-dead-code) legal transition for a future heal. The win predicate collapses to one predicate over these states.
- **`world.step()` iterates a named, data-declared step order** — inserting a new sim step (sinking deceleration, whirlpool force, PvE roving, later bot decisions) must be a one-line, reviewable edit, not a threaded special case.
- **Sinking window (~5s design target):** hull decelerates to a stop as a STEP_ORDER step; helm inputs are accepted but decay toward the stop; fire/aim inputs stay fully live. Equipment activation during sinking routes through the single sinking-activation gate that Epic 1 left as a passthrough with the policy value TBD — this story resolves that policy with Eric.
- **Provisional win semantics during sinking:** sinking ships stay win-eligible until fully sunk; if all remaining participants are sinking, the later sinker wins; same-tick mutual destruction is a draw. This must stay a single cheap predicate so future revisits are cheap.
- **Sinking ships remain fully perceivable** — they're still participants, still targets; the crimson sink ring renders and perception/input-validation invariants hold throughout.
- **Omniscient reveal:** on full sinking, fog drops, the camera zooms to the whole map, and every revealed ship wears a nameplate (extends truesight nameplates to all hulls). Only Enter/click proceeds to results. The reveal HUD survivor set is fixed: BR Chrome Bar and Kill Feed persist through the reveal; hotbar, XP rail, banked-level chip, own-vitals, and listening ring die with the hull.
- **Results modal:** kills, placement, time afloat, and accrued boons + last offer reviewable; single amber RETURN TO PORT action (Enter or ESC) — no re-queue from the modal, no dead spectate button. Leaving routes to home through the ad-break seam (`requestAdBreak()`, Story 0.4) with SET SAIL one press away.
- **Fog banks:** seeded deterministically from the map seed (frequency/size as CONFIG design targets, an FR26 extension). Inside one, truesight radius shrinks and the ship vanishes from others' truesight, while radar may still paint it. This is a visibility-predicate change with invariant coverage — never a client-side visual-only effect — and must render distinctly from the fog-of-war composite so the trade is legible before entry. Own-ship prediction must stay correct across the boundary.
- **Whirlpools:** rare, deterministically placed; each match secretly rolls northern (CCW) or southern (CW) hemisphere, stored only in World state — never in the map seed or on the wire. Crossing hulls are carried along the circular current (with = faster, against = slower) and their heading rotates with the spin; exit is possible from any side; there is no suction/trap. The hemisphere is discoverable only by observing the spin, never disclosed directly.
- **Roving PvE fleets:** three tiers by HP (common small / uncommon medium / rare large), each paying its FR18 XP fraction through the existing Epic 2 hooks. Fleet ships carry a basic gun on long cooldown, fired only in self-defense via a cheap threat-check (react to being hit or truesight proximity — never full `observe()`, never hunting), driven through the same input pipeline as every ship. Drones are never win-check participants. The perf budget must hold with full fleets present as part of the reference scenario.
- Cross-cutting NFRs bind every story here: frame budget, latency proxies, anti-cheat perception invariants, and determinism (shared-sim parity between client and server) all apply.

## Technical Decisions

- **AR8 — STEP_ORDER as data.** `world.step()` iterates a named step array; sinking deceleration, whirlpool force, PvE roving, and future bot decisions are one-line reviewable insertions rather than hand-threaded logic.
- **AR9 — lifecycle.ts is the one shared state machine.** `alive | sinking(since) | sunk(at)`, transitions validated in exactly one place, `sinking -> alive` reserved for a future heal; `match.ts`'s win predicate becomes one predicate over lifecycle states. **AMENDED (amendment 3): AR9's return-edge list is INCOMPLETE against the shipped code** — `redeploy` (`any -> alive`: creation, match-start reset, respawn) also exists and is production-reachable every match. Build the table from amendment 3, not from AR9 alone.
- **D4 — sinking-era win semantics.** Sinking ships stay win-eligible until fully sunk; last sinker among all-sinking survivors wins; same-tick mutual destruction is a draw. Deliberately kept as one cheap predicate so it stays revisitable.
- **AR14 — hemisphere secrecy and dev tooling.** The whirlpool hemisphere lives in World state, never the map seed or wire. A dev-only fog-lift and dev spectate-all camera exist server-side, gated behind `HC_DEV_OPTIONS`.
- **AR15 — hidden-information placement.** Whirlpool current math lives in shared sim (own-ship prediction needs it identical on both sides); fog-bank truesight modification is a perception-layer predicate change, integrated with existing observe()/invariant machinery; the hemisphere must be inferable only through observed motion, never a queryable flag.
- Standing engineering laws carry forward unchanged: authoritative 20Hz World with zero Colyseus imports in world/match logic, client prediction via the same shared pure functions, everything spatial leaving the server through the perception boundary (`frames.ts`/`observe()`), cyclomatic complexity ≤ 10, and full `npm run check` green as the ship gate.

## UX & Interaction Patterns

- **UX-DR27 — Results modal.** Kills, placement, time afloat, accrued boons + last offer reviewable; single amber Primary Button action RETURN TO PORT (Enter or ESC); no re-queue from the modal, no dead spectate button; victory banner reads phosphor, defeat reads amber; fullscreen dim behind results only.
- **UX-DR38 — Death sequence presentation.** ~5s sinking ritardando (helm accepted but decaying, guns live) → omniscient reveal (fog drops, camera zooms out, nameplates on all revealed hulls; only Enter/click proceeds; BR chrome bar + kill feed persist while hotbar/XP rail/chip/vitals/listening ring die with the hull) → results modal.
- **Open question #25 — reveal-zoom motion exemption.** Whether the death-reveal camera zoom is exempt from the motion/shake accessibility setting (it's the climax beat) is unresolved and must be decided with Eric inside Story 5.3; motion/shake settings otherwise override every juice rule in the game.
- **Open question #23 — whirlpool feel treatment.** No perception/feel treatment exists yet for whirlpools beyond the GDD's mechanical description; the on-water render/feel must be designed with Eric inside Story 5.5, within the existing token palette.
- Fog banks must be visually distinct from the fog-of-war composite itself (a different token/treatment), so the sight-for-invisibility trade reads before a captain sails into one.
- PvE fleets render as greyscale legacy chevrons at both hull and blip scale; richer tier-specific visual language (beyond size) is an acknowledged open item, not a blocker for this epic.

## Cross-Story Dependencies

- **5.1 is the spine for the rest of the epic.** The lifecycle state machine and STEP_ORDER registry it introduces are exactly what 5.2 (sinking), 5.5 (whirlpool force step), and 5.6 (fleet roving step) build their new steps on.
- **5.2 depends on 5.1** and closes a TBD left open since Epic 1: the sinking-activation gate point in the equipment registry (AR7) has been a passthrough pending this story's policy resolution.
- **5.3 depends on 5.2** — the omniscient reveal and results flow trigger off the `sunk` lifecycle state that 5.2's sinking window transitions into.
- **5.4 and 5.5 both extend the perception/shared-sim boundary** already established in earlier epics (Epic 4's perception invariants, the shared `stepShip`/prediction pattern) — own-ship prediction parity is a hard constraint for both, not new architecture.
- **5.6's XP payout reuses Epic 2's hooks** (FR18 tier fractions) and its drone kinematics/HP must be rescaled against the Story 1.6 hull-speed rebalance (small/medium/large drone envelopes predate that rescale and need deliberate re-tuning here, updating the shipClasses identity test's drone table).
- **Outbound to Epic 6:** the D4 win predicate this epic establishes is what FR31's participants-only win check (Story 6.3) builds on — **AMENDED (amendment 4): the drone gate is dropped in Story 5.1, not 6.3, and Story 6-5 (Solo vs AI) now owes a termination rule for human-versus-drones**; roster-scaled map generation (Story 6.2) must scale fog-bank and whirlpool placement coherently along with island density, and both sides must keep rebuilding fog banks/whirlpool placement deterministically from the seed at any roster size.
- **Inbound from Epic 3:** the BR Chrome Bar's persistence through the omniscient reveal was already built as part of the ratified survivor set in Epic 3 — this epic is where that persistence is actually exercised end-to-end for the first time.

## Ratified Amendments (durable — survives recompiles)

Full text: `epic-5-context-amendments.md`. On any conflict with the compiled content above, **the
amendment wins**. Summary of the record as of 2026-08-11 (all Eric rulings, Story 5.1 question gate):

1. **`sinking` is DECLARED-ONLY in Story 5.1** — the sim keeps `alive -> sunk` instantaneous; the state
   is entered only by transition tests until Story 5.2.
2. **`ShipRecord.alive` is REPLACED, not shadowed** — `lifecycle` is the only representation; no
   compatibility boolean getter.
3. **AR9's transition list is INCOMPLETE** — a `redeploy` (`any -> alive`) edge exists and is
   production-reachable. `sunk -> alive` cannot fire in live play (damage and respawn policy are
   mutually exclusive by phase) but IS exercised by the unit tests.
4. **Drones stop gating the win in 5.1** — partially supersedes epic-4 amendment 31; three dev
   harnesses are rewritten; Story 6-5 owes a solo-termination rule.
5. **STEP_ORDER covers sim steps only** — clock advance, the `aliveHulls()` snapshot and the event swap
   stay fixed prologue/epilogue.
6. **An order-identity test pins the tick order** — the `shipClasses` identity-test pattern.
8. ~~Never-sunk hulls place above the sunk, below the winner~~ — SUPERSEDED by amendment 9.
9. **Drones are not ranked and never appear in the results** — captains-only rows, captain-relative placements.
7. **No wire change; PROTOCOL_VERSION stays 33** — and `spectates()`'s unfogged-view gate is flagged
   for Story 5.2.

Story 5.2 question gate (all Eric rulings 2026-08-12 unless marked):

10. **The sinking-activation policy closes as NO RESTRICTION at the gate** — all seven equipment rows
    plus the foghorn stay live; the **refit/heal is what's blocked**. Closes the AR7 TBD.
11. **The kill lands IMMEDIATELY** — credit, XP, bounty, the `sunk` event, the kill feed and AFLOAT
    all fire at sink-entry, unmoved. The five seconds are the killee's beat.
12. **A sinking hull cannot be finished off** — damage on it is a no-op.
13. **The window is a flat 5000 ms**, all classes.
14. **Sinking does not affect the outcome; a same-tick wipe is a DRAW** — **amends D4**, whose
    "later sinker wins" clause is now dead.
15. **The derivation FLIPS (orchestrator): `isAfloat` does NOT move** — question-gate ruling R1 is
    superseded. Sinking re-opens exactly three seams: motion, weapons/horn, perceivability.
16. **Wire (orchestrator): `alive` goes false immediately; a new self-private `OwnShip` key keeps the
    controls live.** PV 33 → 34; the master invariant stays at exactly SIX exceptions.
17. ~~**The match is NOT held open for a sinking hull**~~ — **REVERSED by Eric's veto, amendment 20.**
20. **The match IS held open for a sinking captain (Eric veto 2026-08-12)** — amendment 17 made the
    window invisible in 100% of 1v1s. The outcome is LATCHED when it is determined and only the
    transition defers, so amendment 14 is now enforced by construction rather than by timing.
