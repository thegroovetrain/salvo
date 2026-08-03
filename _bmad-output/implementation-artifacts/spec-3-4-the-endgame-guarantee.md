---
title: '3-4 The Endgame Guarantee'
type: 'feature'
created: '2026-08-02'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false # flag retired (Epic 2 retro Ruling 1) — residuals are ledger entries with evidence + named home; this pass's changes were disclosures/coverage tests, no behavior change
baseline_revision: '418607d'
final_revision: '90f8a22'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The epic's pillar AC is half-unverified: base radar (650u) is 10u short of covering the 660u terminal ring from its center (the radar-650-vs-660 marginality amendment 4 routed here), no durable tests pin the sensor-vs-ring inequalities, and the "matches conclude past 12:00, no stalemate loop" claim has no evidence instrument — pacifist lobbies structurally cannot produce a winner (all 50 hit the tick cap `unresolved` in the 3-1 campaign) and omniscient gunner lobbies clear the field by ~p50 4:53, never reaching the final ring.

**Approach:** Three Eric rulings (amendments 22–24, AskUserQuestion this run) shape the story: (22) `CONFIG.vision.radar` becomes DERIVED `SIGHT * 2` (= 660; gun base range + star-shell flare range ride the same number, accepted ~1.5% shift) so radar and the terminal ring radius are the same expression forever, pinned by new shared constraint tests; (23) a new `endgame` scripted pilot — pacifist through the ring rhythm, hunt ON at full closure — is the evidence instrument, plus small harness collector additions (`winnerClass`, resolved-only duration, past-closure rate); (24) the acceptance bar is GEOMETRIC — no new forcing mechanic of any kind. A seeded campaign + evidence doc proves conclusion past 12:00 inside the ~15:00 contract, with a post-radar-change baseline rerun documenting the balance shift.

## Boundaries & Constraints

**Always:**
- Amendment 22 exactly: `shared/src/constants.ts:141` becomes `radar: SIGHT * 2` in place (the `litRadius: SIGHT / 2` idiom one field away), JSDoc citing the ruling. No independent 660 literal anywhere; `effectiveStats()` and every symbolic consumer derive automatically. No wire change — PROTOCOL_VERSION stays 19.
- Production-code diff is ONE line (+ comments): `shared/src/constants.ts`. Zero behavioral changes under `server/src/` or `client/src/` — everything else is harness scripts, tests, snapshots, docs, bookkeeping.
- New shared constraint tests (zone.test.ts, "Endgame Guarantee (Story 3.4)" block): `CONFIG.vision.radar === 2 * CONFIG.vision.sight` (derivation pin); `CONFIG.vision.radar >= zoneTerminalRadius(CONFIG.zone)` (blips meaningful — structural equality today, fails loudly if either side retunes apart); `CONFIG.vision.sight < zoneTerminalRadius(CONFIG.zone)` (no hull auto-visible across the ring from center).
- Endgame pilot gate (orchestrator ruling within amendment 23): hunt ON iff `world.zonePhase === 'closed'` — gating at final-group start (480s) could conclude matches BEFORE 12:00 and fail the AC's evidence; gating at closure makes every resolved match structurally past-12:00 with the fight inside the 660u ring. Implementation: widen GunnerPilot's `hunt` to a `(world) => boolean` predicate (pilots.ts:172 is the single gate expression); predicate consumes NO rng (determinism preserved); `gunner` → always true, `pacifist` → always false, `endgame` → phase check. The `zonePhase !== 'idle'` hazard is moot with a pure phase-equality gate, but never gate on `zoneStartMs`/geometry (`zoneStartMs` is 0 while idle; `terminalSightFactor: 0` test overrides break radius comparisons).
- Harness evidence fields: `MatchSample.winnerClass` (from `match.endSummary()` — runner.ts:333 currently drops it), aggregate resolved-only `durationS` summary (`endedBy !== 'unresolved'` — cap-outs at ~1321s must not pollute the conclusion percentiles), past-closure rate (`durationS > zoneClosedAtMs(CONFIG.zone)/1000`), winnerClass tally + report lines. `--json` carries them for free (whole aggregate serialized).
- `args.ts` USAGE line + the pinned `--pilot` error-string test (batchSim.test.ts:59-64 — WILL fail on any registry addition) updated in the same change.
- New pilot tests extend the existing determinism + control pattern: byte-identical input stream per seed with discriminating negative; fires 0 while pre-closure, fires > 0 once closed (drive with `zone.beatMs` override as existing tests do); pacifist control stays untouched and green.
- Evidence campaign (all seeded, byte-identical rerun; `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs`): headline `--pilot endgame --matches 50 --seed 4` at production timing (~26,420 ticks/match — expect a slow run); baseline-shift legs rerunning 3-1's exact keys on the new radar (`--matches 200 --seed 1` gunner; `--pilot pacifist --matches 50 --seed 2`) with old→new deltas vs `batch-sim-evidence-2026-08-01.md`. Results → `batch-sim-evidence-2026-08-02.md` carrying the standing honesty caveats: harness lengths are lower bounds (omniscient pilots), the endgame pilot is a modeling instrument (humans skirmish earlier), pacifist `unresolved` caps are structural by design (amendment 24).
- Evidence bar: resolved endgame matches conclude past 720s with a winner (`endedBy` real + `winnerClass` set), start-to-results p50 inside ~900s (the ~15:00 contract; report p95 honestly), storm-death and picks reads included for continuity.
- goldenFrames snapshot regenerated (`vitest -u` in server workspace) — goldenFrames.test.ts:413 places a contact at `-CONFIG.vision.radar`; inspect the snapshot diff and confirm the ONLY change is the radar-derived placement (-650 → -660).
- Stale-comment sweep limited to the identified sites: constants.ts:141 field comment + torpedo "two-plus crossings" wording (212-213; 1300/660 ≈ 1.97), client/src/render/firing.ts:13 (doubly stale: 650 AND sight 220), shell.test.ts:312 parenthetical, cannon.test.ts:65/71, starShells.test.ts:74/109/118/128, perception.test.ts:552/591, upgrades.test.ts:699, combat.test.ts:125, inputs.ts:41, projectiles.ts:414 + projectiles.test.ts:357. Comment-only edits; zero assertion changes outside the named test files.
- Epic-3 amendments 1–24 bind; complexity ≤ 10; `npm run check` green; one PR, never split; worktree diff carries no unrelated files (HULLCRACKER_NOTES.md untouched).

**Block If:**
- The endgame campaign shows combat-willing lobbies NOT concluding at the final ring (stalemate with hunt ON), or start-to-results materially breaching the ~15:00 contract — design-level findings for Eric, never a dial to turn autonomously (amendment 24 forbids inventing forcing mechanics; zone timeline values are ratified by amendment 11).
- Any AC seems to require changing `shared/src/sim/zone.ts` logic, production `server/src/` code, or any client behavior.

**Never:**
- No new mechanics: no post-closure shrink, no storm-damage ramp, no forcing function (amendment 24). No zone-timeline retune (beatMs/ringSteps/offsetCap/terminalSightFactor/stormDps are amendment-11-ratified). No XP/deck dial changes. No torpedo/homing range retune (comment wording only). No design-doc edits. No changes to camera/spectate/mouse test fixtures (injected `radarRange: 650` is a decoupled unit fixture — documented reject, not drift to chase). No `ENDGAME_SLACK_MS` change unless the campaign proves cap-outs (surface it in evidence if so).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Radar derivation | CONFIG loaded | `vision.radar === 2 * vision.sight` (660 at sight 330) | Test pin fails on drift |
| Radar-vs-ring constraint | terminal 660u | `radar >= zoneTerminalRadius(CONFIG.zone)` — equality legal | Fails loudly on one-sided retune |
| Sight-vs-ring constraint | sight 330 | `sight < zoneTerminalRadius(CONFIG.zone)` | Test pin |
| Endgame pilot, pre-closure | zonePhase clear/supply/reveal/closing | Fires 0, steers exactly like pacifist (storm-safety + wander) | No error |
| Endgame pilot, closed | zonePhase 'closed' | Targets + fires like gunner inside the 660u ring | No error |
| Endgame pilot, idle | zonePhase 'idle' (zoneStartMs 0) | Hunt OFF — no plain-gunner degeneration pre-match | Guarded by phase-equality gate |
| Unknown pilot name | `--pilot kamikaze` | UsageError listing `endgame, gunner, pacifist` | Existing pattern, string updated |
| Resolved endgame match | campaign run | `durationS > 720`, real `endedBy`, `winnerClass` populated | No error |
| Pacifist control | unchanged run | Still `unresolved` at cap — structural, documented (amendment 24) | Not a defect |
| Golden frames | contact at `-CONFIG.vision.radar` | Snapshot regenerated; only radar-derived values move | Inspect diff |

</intent-contract>

## Code Map

- `shared/src/constants.ts` — THE production change: `radar: SIGHT * 2` (line 141) + JSDoc (amendment 22); torpedo range comment wording (212-213).
- `shared/src/__tests__/zone.test.ts` — new "Endgame Guarantee (Story 3.4)" describe: derivation pin + both sensor-vs-ring inequalities (zoneTerminalRadius already exported/tested here).
- `server/scripts/batchsim/pilots.ts` — `hunt` boolean → world-predicate (single gate at :172), `endgame` factory + PILOT_REGISTRY entry; keep tunables/rng untouched.
- `server/scripts/batchsim/runner.ts` — `MatchSample.winnerClass` (finishSample :325-335 reads `summary.winnerClass`; unresolved samples get null/undefined).
- `server/scripts/batchsim/report.ts` — aggregate: resolved-only duration Summary, past-closure rate, winnerClass tally; render lines in batch report (+ sweep table untouched).
- `server/scripts/batchsim/args.ts` — USAGE pilot list (:47).
- `server/scripts/batchsim/__tests__/batchSim.test.ts` — `--pilot` error string (:59-64); endgame determinism + gate suites (beatMs override pattern from :247-318); new aggregate field assertions.
- `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` — regenerated (radar-derived contact placement).
- Comment-only touch-ups: `client/src/render/firing.ts:13`, `client/src/render/projectiles.ts:414`, `server/src/game/inputs.ts:41`, and the test-comment sites named in Boundaries.
- `_bmad-output/implementation-artifacts/batch-sim-evidence-2026-08-02.md` — NEW evidence doc (campaign + baseline-shift deltas + caveats).
- Bookkeeping in-PR: `VERSION` + root `package.json` → 0.17.37 (cycle 37); `sprint-status.yaml` 3-4 → done AND epic-3 → done (last story); `gds-workflow-status.yaml` (cycle entry + next_expected → epic-3 retrospective, then create-story 4-1); `CLAUDE.md` (radar-derivation note on the gun/vision decision lines + 3.4 bullet); epic-3 amendments 22-24 (already appended, ride this PR).

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` — radar derivation + comment sweep (shared side) — the story's one production change.
- [x] `shared/src/__tests__/zone.test.ts` — Endgame Guarantee constraint block — the durable pillar pins.
- [x] `server/src/__tests__` snapshot regen + server/client comment-only sites — mechanical fallout of the derivation.
- [x] `server/scripts/batchsim/pilots.ts` + `args.ts` — endgame pilot (predicate gate) + registry/usage — the evidence instrument (+ amendment-25 un-beach seamanship: the ruling Eric-ratified mid-run at the evidence checkpoint; v2's rotate-away/heading-hold was orchestrator-directed within that ruling's scope — see the amendment's v2 scope note).
- [x] `server/scripts/batchsim/runner.ts` + `report.ts` — winnerClass, resolved-duration, past-closure aggregates — the evidence fields.
- [x] `server/scripts/batchsim/__tests__/batchSim.test.ts` — error-string fix + endgame suites + aggregate assertions (+ un-beach/sticky-rock suites; 46 in-file).
- [x] Evidence campaign (endgame seed 4; gunner seed 1 + pacifist seed 2 reruns) → `batch-sim-evidence-2026-08-02.md` — the AC's proof (50/50 resolved, 100% past closure, p50 830.0s).
- [x] Bookkeeping — VERSION 0.17.37, sprint-status (3-4 + epic-3 done), gds-workflow-status, CLAUDE.md — in the PR.

**Acceptance Criteria:**
- Given CONFIG, when the constraint tests run, then radar is structurally `2 × sight`, radar ≥ terminal ring radius, sight < terminal ring radius — and a retune of sight moves radar, gun base range, star-shell flare range, and the terminal ring together (verified by the derivation pins, not literals).
- Given the endgame campaign, when 50 seeded matches run at production timing, then resolved matches conclude past 720s with a real `endedBy` and populated `winnerClass`, p50 start-to-results lands inside ~900s, and the report separates resolved durations from cap-outs.
- Given the pacifist control rerun, when it hits the tick cap `unresolved`, then the evidence doc documents it as structural (non-combatants cannot win) per amendment 24 — no mechanic added, no dial turned.
- Given the baseline reruns on radar 660, when compared against `batch-sim-evidence-2026-08-01.md`, then the deltas are reported (expect small; gun reach +1.5%) with no autonomous tuning response.
- Given `git diff` against baseline `418607d`, when the PR is assembled, then the only production-code change is the constants.ts derivation (+ comments), PROTOCOL_VERSION stays 19, and no zone-timeline value moved.

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass (2 Fable hunters + Codex cross-model; verdicts: build-on-it ×3; Codex: no findings)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 0, low 11)
- defer: 1: (low 1)
- reject: 4: (low 4)
- addressed_findings:
  - `[low]` `[patch]` Grace-hold off-by-one (BOTH hunters, CONFIRMED): effective hold is the exit-capture tick + 59 grace ticks; the 60th tick resumes target-seek one tick before detection re-arms. Resolved by DOCUMENTATION (tick-by-tick trace in the header + constant doc) — deliberately not a code change: both hunters rated it behaviorally invisible, and perturbing the streams would invalidate the freshly-run 300-match campaign for a cosmetic seam.
  - `[low]` `[patch]` Grace hold is blind to islands/storm (Blind Hunter, CONFIRMED) — disclosed in the header as deliberate (self-corrects via the next burst; zero resulting campaign cap-outs).
  - `[low]` `[patch]` Astern-blocked pocket residual (Edge Case Hunter, PLAUSIBLE): a blocker within the ~15u sternway could re-arm with identical geometry — disclosed in the header; the harness reports such a match honestly as `unresolved`; none in 250 campaign matches.
  - `[low]` `[patch]` False "same lookahead cone" comment (Blind Hunter, CONFIRMED) — corrected: half-disc filter; islandAvoid SUMS, asternTurnRudder picks nearest.
  - `[low]` `[patch]` Zone constraint pins are factor pins (Blind Hunter, CONFIRMED): with radar = 2×sight, sight cancels — retitled/commented honestly (they bind terminalSightFactor ∈ (1,2] against the shared derivation, the spec's actual intent) + NEW `Number.isFinite(terminalSightFactor)` pin closing the silent-NaN pass.
  - `[low]` `[patch]` Death-reset path untested (Blind Hunter, CONFIRMED) — NEW test: death mid-burst drops the stale burst, detection re-arms cleanly, no false-positive from the reset pose.
  - `[low]` `[patch]` Pre-closure steering identity asserted-not-tested (Blind Hunter, CONFIRMED) — NEW test: endgame vs pacifist input streams byte-identical until first `closed` tick, divergent after (vacuous-pass-proofed).
  - `[low]` `[patch]` Determinism negative varied the world seed, not the pilot seed (Blind Hunter, CONFIRMED) — NEW test pinning pilot-seed discrimination.
  - `[low]` `[patch]` runner.ts winnerClass '' comment fiction (Blind Hunter, CONFIRMED) — reworded: '' unreachable today, the collapse is a defensive guard.
  - `[low]` `[patch]` pastClosureRate ±50ms rounding band at exactly-closure (Edge Case Hunter, PLAUSIBLE) — documented; strict `>` kept as the conservative direction.
  - `[low]` `[patch]` Amendment-25 v2 paper trail (Blind Hunter, PLAUSIBLE): v2 exceeded the ruling's recorded text — v2 scope note appended to the amendment (orchestrator-directed within the ratified scope, surfaced to Eric in the Auto Run Result); spec task line reworded.
- defer: battleship takes 25/50 instrument endgames (50%, 2:1 over each other class) — real balance-feel signal, plausibly instrument-inflated (no kiting/torpedo/mine play in the pilots); ledgered for human-playtest review, no tuning.
- reject: boundary-wall un-beach trigger (hunters disagreed; adjudicated correct behavior — backing off the map wall is desirable); beachTrace fixture idealization (the 300-match campaign IS the real-physics integration evidence); evidence-doc numbers not review-reproducible (inherent to seeded 26k-tick runs; byte-identical-rerun property + internal-consistency audit stand in); aim.test.ts 650 fixture not in the spec's reject list (same decoupled-fixture class as the named camera/spectate/mouse rejects; list lives in the read-only intent contract).

## Design Notes

- **Why the gate is `closed`, not final-group start:** amendment 23 ratifies "hunt ON at the final ring group"; within that envelope, gating at 480s lets omniscient pilots finish before 12:00 (evidence would miss the AC), while gating at `zonePhase === 'closed'` makes "past 12:00" structural and stages the fight exactly in the 660u ring. Humans skirmish earlier — the pilot is the instrument for the guarantee, not a human model; say so in the evidence doc.
- **Predicate widening keeps three pilots one class:** `GunnerPilot(id, seed, huntPred)` with registry lambdas `() => true` / `() => false` / `(w) => w.zonePhase === 'closed'`; the rng stream is untouched because the wander branch only draws when no target exists, and the gate itself never draws.
- **660 = 660 coincidence note:** radar (2×SIGHT) and zoneTerminalRadius (terminalSightFactor 2 × sight) are now the same number by TWO derivations that happen to share the factor 2. They are structurally independent tunables (`terminalSightFactor` can retune away); the constraint test `radar >= zoneTerminalRadius` is what binds them — document this in the constants JSDoc so future readers don't conflate the two.
- **Evidence doc voice:** follow `batch-sim-evidence-2026-08-01.md` (run keys, percentile ladders, endedBy splits, honesty caveats up top, amendment cites).

## Verification

**Commands:**
- `npm run check` — expected: lint 0 errors + tsc ×3 + full suite green (2596 baseline + new constraint/pilot/aggregate tests; goldenFrames green after regen).
- `git diff --stat 418607d -- server/src client/src` — expected: test files, snapshot, and comment-only lines; zero behavioral hunks.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --pilot endgame --matches 50 --seed 4` — expected: deterministic report, resolved matches past 720s with winnerClass; rerun byte-identical.

**Manual checks (if no CLI):**
- Snapshot diff shows only radar-derived placements; evidence doc numbers match report output verbatim; no `650` literal remains that means "radar" anywhere in source or comments.

## Auto Run Result

**Status:** done. **Branch:** worktree-dev-auto-3-4-endgame-guarantee (final_revision in frontmatter). **Epic 3 is complete — all four stories landed.**

**Summary.** The Endgame Guarantee is now verified, not vibed. Three pre-implementation Eric rulings (amendments 22–24) shaped the story: `CONFIG.vision.radar` became DERIVED `SIGHT * 2` (650 → 660 — resolving the radar-650-vs-660 marginality amendment 4 routed here; gun base range and star-shell flare ride the same number, ~1.5%, deltas measured and economically invisible), so radar and the terminal ring radius are now the same expression forever, pinned by new shared constraint tests; the no-stalemate instrument is the new batch-sim `endgame` pilot (pacifist until `zonePhase === 'closed'`, then hunts — rng-free predicate); and the acceptance bar is GEOMETRIC — no forcing mechanic exists or was added. Mid-run, the evidence campaign's cap-outs were probe-diagnosed as island-beaching permalocks of the forward-only INSTRUMENT (humans carry full astern; the game has no permalock) — Eric ruled at the checkpoint (amendment 25): fix the instrument, rerun. Seamanship landed in two iterations (v1 astern burst; v2 rotate-away rudder — islandAvoid cross-product sign, NEGATED for signed sternway authority — plus heading-hold grace, after probes showed a 139-tick metronome; v2 was orchestrator-directed within the ruling's scope — Eric sees this here). **Final evidence (batch-sim-evidence-2026-08-02.md): 50/50 endgame matches resolved `fieldCleared`, 100% past the 12:00 closure, resolved p50 830.0s (13:50 — the ~15:00 contract at the median), winners across all three classes (25 BB / 13 ML / 12 TB); gunner baseline 200/200; pacifist control 50/50 structurally unresolved with picks p50 12.0 exactly at closure — the 3-1 band-floor invariant unchanged through every iteration. Zero mutual-avoidance failures in any leg at any iteration: the geometry concludes.**

**Files changed (grouped).** Production: `shared/src/constants.ts` (ONE line — the radar derivation — plus comments; PV stays 19; zone timeline untouched). Tests: `shared/src/__tests__/zone.test.ts` (Endgame Guarantee constraint block: derivation pin, factor pins, finite-factor pin), goldenFrames snapshot regen (one line, −650 → −660), comment-only 650→660 sweep across the named server/client sites. Harness: `server/scripts/batchsim/pilots.ts` (HuntPolicy predicate, `endgame` pilot, un-beach seamanship v1+v2), `runner.ts` (winnerClass), `report.ts` (resolved-only durations, past-closure rate, winnerClass tally), `args.ts` (usage), `__tests__/batchSim.test.ts` (49 in-file: endgame gate/determinism, sticky-rock un-beach suite, death-reset, pre-closure steering identity, pilot-seed discrimination, evidence-field aggregates). Docs/bookkeeping: `batch-sim-evidence-2026-08-02.md`, amendments 22–25 (+v2 scope note), 3 deferred-work entries, VERSION/package/lockfile 0.17.37 (cycle 37), sprint-status (3-4 done, epic-3 done), gds-workflow-status (cycle entry, next_expected → epic-3 retro else 4-1), CLAUDE.md 3.4 bullet.

**Review findings breakdown.** 2 Fable hunters + Codex cross-model; verdicts build-on-it ×3, Codex zero findings, no cross-model disagreements. 0 intent-gap, 0 bad-spec, 11 patches (all low: the grace-hold off-by-one resolved by documentation — both hunters rated it invisible and a code change would have invalidated the campaign for a cosmetic seam; two disclosure comments; the factor-pin retitle + finite-factor pin; three new coverage tests; two comment fictions; the amendment-25 v2 paper-trail note), 1 defer (BB takes 50% of instrument endgames — plausibly instrument-inflated, ledgered for human playtests), 4 rejects (incl. one adjudicated hunter disagreement: boundary-wall un-beaching is correct behavior). One review-hardening highlight: the pins' algebra is now stated honestly — with radar = 2×sight the sensor-vs-ring inequalities reduce to `terminalSightFactor ∈ (1, 2]` pins, which is exactly the one-sided-retune tripwire the spec intended.

**Verification.** `npm run check` green at every wave, independently re-run by the orchestrator after each: final 2614 tests — 399 shared / 834 server / 1381 client (2596 at cycle start; +18), lint 0 errors. Scope pin `git diff 418607d -- server/src client/src` = tests, snapshot, comments only. Campaign legs run at production timing, byte-identical on rerun; probe scripts deleted after use; no dev server touched; no design docs edited.

**Residual risks.** The endgame pilot is a modeling instrument — real humans skirmish before closure, so its conclusion times are conservative and its 50% BB win share is plausibly inflated (ledgered, not tuned). Three deferred-work entries carry the real-game observations to their homes (terminal-ring island pockets → endgame feel review; drone un-beaching → Epic 6 bot AI; BB share → human-playtest reads). The known astern-blocked residual is disclosed in the pilot header and reports honestly as a cap-out if it ever occurs (zero in 250 matches).
