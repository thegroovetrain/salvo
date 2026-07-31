---
title: 'Story 2.10: Economy Batch-Sim Harness'
type: 'feature'
created: '2026-07-31'
status: 'in-progress'
baseline_revision: '23227ed'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every economy dial (CONFIG.xp, CONFIG.deck rare weight, catalog values) is an implementer-drafted handwave; the epic mandates "tuning is evidence, not vibes" — at least one committed tuning pass of FR18's XP values before any human playtest (AR18), with the rare-weight dial set by this story's evidence (amendment 38). Also blocking: quit-outs record as ordinary `match.end` (telemetry pollution debt, must land first).

**Approach:** Build the triple-duty harness's first duty as an IN-PROCESS headless batch sim (`server/scripts/batchSim.mjs`): World+Match are Colyseus-free and wall-clock-free (~42µs/tick measured ≈ 8 matches/sec), so the harness constructs them directly — no sockets — and drives N scripted captains + drone fill (amendment 54) with deterministic seeded pilots. First land the `endedBy` classification (amendment 53). Gather distributions, then STOP at the evidence checkpoint (amendment 55): Eric ratifies the retune values; only those are committed (scope per amendment 56).

## Boundaries & Constraints

**Always:**

- **Rulings bind:** amendments 53–56 (recorded this run). endedBy = `'lastHumanSunk' | 'fieldCleared' | 'lastHumanLeft'` on `MatchEndSummary`, sim-side only, non-breaking `match.end` log addition. Scripted captains + drones, mix configurable. Evidence checkpoint before ANY balance commit. Tuning scope = `CONFIG.xp` (levelMs, killLevels, droneTierLevels) + `CONFIG.deck` (rareWeightBase, rareWeightPerDryLevel) ONLY.
- **Harness discipline:** lives in `server/scripts/` (AC-named `batchSim.mjs` entry; internals may be .ts loaded via tsx — `server/dist` is stale and not a dependency); refuses to run without `HC_DEV_OPTIONS=1` (convention gate — no room is involved); hot loop = `world.step(); match.update();` with NO frame/perception builds; all randomness seeded `mulberry32` (run key = seed + config + roster; same key → identical report, modulo report timestamp metadata); pilots submit intent ONLY via `world.submitInput()` (the drone seam) and spend via the real `spendPoint` flow; latencyHarness report/CLI conventions (arg parsing, advisory exit-0 unless structural failure, percentiles not just means).
- **Report contents (the AC's measures + the ledger's docket):** level curves, kill-bonus distributions (captain kills + per-drone-tier), time-to-N-boons, time-to-first-exclusive (offered AND fitted), picks per match, deck depletion, copy-cap reach rates, match lengths, endedBy split, storm deaths — across tunable CONFIG inputs (sweep support). A pure deck-only fast mode (drawOffer/returnCards loop over the exported deck seam) backs the rare-weight pity curves at massive scale.
- **Clean seams (AR12):** the runner (build lobby → run match → collect stats) and the pilot interface are structured so the later load-test and bot-vs-bot duties reuse them; document the seam in the script header. Pilots are deliberately omniscient in-process for v1 (economy tuning); perception-honest bots are Epic 6's duty.
- **Retune commit:** only Eric-ratified values from the checkpoint; update value-pinned tests (e.g. `shared/src/__tests__/barrel.test.ts` CONFIG.deck equality) knowingly; the evidence report lands as an implementation artifact; the spec records the ratified numbers.
- Cross-cutting: complexity ≤ 10; no `Math.random`/`Date.now` in any sim-adjacent loop; `npm run check` green; server/src changes stay Colyseus-free where they are today; no client changes.

**Block If:**
- Any needed change is a wire-contract change (none expected — `endSummary()` feeds `log.info`, not the client wire; if a PV bump surfaces, stop).
- Evidence reveals a structural economy defect fixable only by mechanics changes (not dial values) — Eric's call.
- The evidence checkpoint cannot reach Eric (no ratification → no balance commit; ship harness + evidence + endedBy and HALT for input rather than tune autonomously).

**Never:**
- No zone/storm retune and no NFR6 adjudication (Story 3.1 owns "confirms ~15:00" — report lengths only; the 3:45 close vs 15:00 budget tension is REPORTED, not fixed).
- No catalog step-value/doctrine-factor retunes; no 2-9 feel-value tuning (tones/tells/looks — later identity pass). No deck/XP mechanics changes (shapes are ratified; dials only).
- No load-test or bot-vs-bot implementation (seams only). No sockets/Colyseus in the harness. No perception calls in the hot loop. No new wire fields, no PROTOCOL_VERSION bump, no VERSION bump before the retune ships (retune is a feature story component, not a standalone release).
- No drone behavior changes; no win-check changes (the harness composes lobbies that legally run: ≥1 scripted captain).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reproducibility | same seed/config/roster twice | identical distributions byte-for-byte (timestamp metadata excluded) | — |
| endedBy: quit-out | last human leaves mid-active | `match.end … endedBy:'lastHumanLeft'` | — |
| endedBy: sunk | last alive human sunk (storm/combat) | `endedBy:'lastHumanSunk'` | — |
| endedBy: victory | winner alive, field cleared | `endedBy:'fieldCleared'` | — |
| Gate | run without `HC_DEV_OPTIONS=1` | refuses with clear message, exit ≠ 0 | — |
| Batch run | `--matches 500 --seed 7 --captains 3` | full report with percentiles for every listed measure | per-match failure → recorded + skipped, structural failure → nonzero exit |
| Config sweep | override/sweep of a tunable dial (e.g. xp.levelMs candidates) | per-variant reports, side-by-side comparison table | unknown/frozen key → clear error |
| Deck-only mode | `--deck-only --draws N` | pity curves (levelsSinceRare vs rare rate), time-to-first-exclusive by draw index, at ≥10⁴ seeds scale | — |
| Kill tiers | captain kills small/medium/large drone + captain | XP fractions ¼/⅓/½/1 observed in level accounting | — |

</intent-contract>

## Code Map

- `server/src/game/match.ts` -- `MatchEndSummary.endedBy` + cause threading through `finish()`/`checkWin()`/`onPlayerLeave()` (the three-way classification; `ArenaRoom.emitMatchEnd` spreads the summary unchanged)
- `server/src/__tests__/matchTelemetry.test.ts` + `match.test.ts` -- exact-object assertions updated; new endedBy matrix cases (fail-proven)
- `server/scripts/batchSim.mjs` -- entry: HC_DEV_OPTIONS gate, CLI, tsx bootstrap into the in-process runner
- `server/scripts/batchsim/*.ts` (or equivalent tsx-loaded internals) -- runner (World+Match+filling hooks pattern from `drones.test.ts`), captain pilots (hunt/spend, grown from `dronesSmoke.mjs` `huntTick` onto `world.submitInput`), stats collectors (read `world.ships` + `tickEvents`), report/percentiles, config sweep, deck-only mode (pure `buildDeck`/`drawOffer`/`returnCards`/`consumeAcquisition`/`scrubAcquisitions` seam re-exported from `@salvo/shared`)
- `server/src/__tests__/` (new) -- unit tests for harness-pure helpers (stats aggregation, pilot determinism) where placement permits vitest pickup
- `shared/src/constants.ts` -- the retune target (CONFIG.xp / CONFIG.deck) — ONLY post-checkpoint with Eric-ratified values; `shared/src/__tests__/barrel.test.ts` pin updated knowingly
- `_bmad-output/implementation-artifacts/batch-sim-evidence-2026-07-31.md` -- the evidence report artifact (distributions, recommendations, ratified outcome)
- Bookkeeping: sprint-status (2-10 done), gds-workflow-status (next_expected → epic-2 retro/3-1), deferred-work (close spec-0-3 abandonment entry via amendment 53; annotate the 2-8 tuning entry: XP + rare-weight evidence delivered, catalog values remain), amendments 53–56 (already recorded)

## Tasks & Acceptance

**Execution (dependency order):**
- [ ] `server/src/game/match.ts` + tests -- endedBy classification -- the telemetry debt that must land before tuning (amendment 53)
- [ ] `server/scripts/batchSim.mjs` + internals -- in-process runner + scripted captain pilots + drone fill -- the engine (amendment 54)
- [ ] Stats collectors + report + config sweep + deck-only mode -- the AC's measures + amendment 38's pity evidence
- [ ] Unit tests -- endedBy matrix, reproducibility, aggregation helpers
- [ ] Evidence campaign -- runs at current dials + candidate sweeps → evidence artifact
- [ ] EVIDENCE CHECKPOINT (AskUserQuestion, amendment 55) -- present distributions + recommended values -- commit ONLY ratified values (+ pinned-test updates)
- [ ] Bookkeeping files -- per-PR protocol
- [ ] `npm run check` -- gate green

**Acceptance Criteria:**
- Given the same seed/config/roster, when the harness runs twice, then reports are identical (NFR5).
- Given a ≥500-match batch at current dials, then the report shows level curves, kill-bonus distributions, time-to-N-boons, time-to-first-exclusive, picks/match, deck depletion, cap-reach rates, match lengths, endedBy split, storm deaths — with percentiles.
- Given each of the three end causes, then `match.end` carries the correct endedBy (unit-tested per cause, fail-proven).
- Given the evidence checkpoint, then exactly the Eric-ratified values are committed (or a ratified confirm-as-is is recorded) — the committed tuning pass of FR18's values + the amendment-38 dial.
- Given the harness structure, then load-test and bot-vs-bot duties have documented reuse seams (runner + pilot interface) without any implementation of either.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why in-process:** every existing smoke is socket-bound (5-min matches); World+Match have zero Colyseus imports, no wall clock (`World.now` is an accumulator), and measure ~42µs/tick — 1,785 ticks of a full solo match in 121ms. The batch AC is only feasible in-process; `drones.test.ts` `fillingHooks()` is the 4-line lobby-fill pattern.
- **Why scripted captains (amendment 54):** `checkWin` short-circuits at 0 humans on the first active tick, and drones structurally cannot fire (constant seq counters) or ram — a literal drone-only lobby yields an instant no-winner finish and zero kills.
- **endedBy semantics:** `'lastHumanLeft'` = the terminal event was a departure (`onPlayerLeave` → checkWin with 0 alive humans); `'lastHumanSunk'` = terminal sinking left 0 alive humans (winner by latest-sunk placement); `'fieldCleared'` = winner alive with field cleared. Room needs no change — `emitMatchEnd` spreads the summary.
- **Config sweep mechanism:** implementer's choice (in-process CONFIG patching before World construction, or subprocess-per-variant) — constraint: production code paths unchanged; if CONFIG is frozen, prefer subprocess-per-variant over adding shared seams.
- **Draft tuning targets (amendment 56, for the recommendation — not auto-commit):** passive ~1 level/min shape preserved; ~12–20 picks per match (brainstorm draw-math premise); exclusives reliably reachable (time-to-first-exclusive). Note: at today's 3:45 storm close, passive alone yields ~4–6 levels — the 12–20 band likely leans on kills and/or reveals dial tension; that is exactly the evidence for the checkpoint, and any zone-length conclusion is 3.1's, not ours.

## Verification

**Commands:**
- `npm run check` -- expected: lint + 3× type-check + all workspace tests green (2280 baseline grows)
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 20 --seed 7 --captains 3` (twice) -- expected: identical distribution blocks
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --deck-only --draws 20000 --seed 7` -- expected: pity-curve table
- `npm test -w server` -- expected: endedBy matrix + telemetry assertions green
