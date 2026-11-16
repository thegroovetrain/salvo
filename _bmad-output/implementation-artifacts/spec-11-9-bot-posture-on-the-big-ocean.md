---
title: 'Story 11.9 Bot Posture on the Big Ocean — the 20 % hit bar and the standoff that follows it'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'b523abec'
final_revision: '0225d14e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A bot clicks its main battery whenever a ready turret bears on a target inside reach, from a standoff of 50–80 % of reach (190–304 hm at reach 380 hm). There a shell hits a side-on hull about 15–29 % of the time with a perfect aim, and far less with a bot's aim wobble, so bots snipe across the board. Eric (forge #63): *"bots don't snipe."*

**Approach:** Server-only. Add one pure hit-chance function: the chance that ONE main-battery shell lands inside the target's outline. It counts both the bot's own aim wobble and the real dispersion. A bot clicks only when that chance is at least `CONFIG.bots.hitBar` 0.20. The main-battery standoff band is rescaled so its far edge sits at the range where the bar is met.

## Boundaries & Constraints

**Always (Eric's rulings 2026-11-16, AskUserQuestion — literal):**
- **R1 The hit bar is 20 %**, per ONE shell (not per salvo), `CONFIG.bots.hitBar: 0.2`, a harness-tunable dial.
- **R2 What the chance counts** (the numbers Eric ruled on included it): the bot's competence wobble (`scatterOffset`'s uniform disc, radius `gunAimScatterU × range / aimScatterRefU`) convolved with the real dispersion ellipse (`dispersionAxes(range)`, the truncated-Gaussian shape of `dispersedPoint`, long axis on the line of fire). Both are centered on the bot's LEAD point (where it believes the target will be), with the target outline at that point. The held, already-drawn offset is NOT used: the bot knows its skill, not its own error. Range = the held aim distance from the hull center.
- **R3 The target's outline:** a sighted contact with a known class and heading uses that hull's real silhouette (`hullSilhouette` / `transformPolygon`) at its heading. A radar-only blip (null heading or class) is judged SIDE-ON (broadside to the line of fire) as the hull with the smallest silhouette area of `SHIP_CLASS_IDS`. That is the hard case: Eric chose "Assume side-on".
- **R4 Standoff follows the bar:** for the main battery, the band's base length is no longer `rangeU` but `B = barRangeU / 0.8`, where `barRangeU` is the largest range ≤ `rangeU` at which a SIDE-ON target of the current target's class (or the R3 blip model when the class is unknown, or with no target) clears the bar. The band edges stay `(frac + profile.bandNudge) × B`, clamped to [0, rangeU], so the cannon band's far edge (0.8) lands exactly on `barRangeU` for a zero-nudge profile. MG / flak / deck-gun rows are unchanged.
- The hold sits in `battery.ts` `batterySolve` after the reach and high-ground gates. A held click keeps the held scatter (no redraw). The aim is still written every tick (`triggerOf` unchanged).
- The bar applies in every posture and inside an own lit zone (the lit lift is about reach, not accuracy).
- `server/src/game/ai/` never imports `world.js`. The hit-chance function is pure and deterministic (a fixed lattice quadrature, NO rng). The transcendentals are fine here because the function is server-only bot code. `ai/hitChance.ts` lives in the server, not `shared`.
- Cost: memoize or tabulate so the 16-hull tick does not regress materially. `node server/scripts/tickCost.mjs` old vs new is reported in the PR.
- Complexity ≤ 10, ~500 LOC per file, American spelling.

**Block If:** the bar makes bots never fire in a scripted duel (a structural failure); a change would need a wire field, a `PROTOCOL_VERSION` bump or a client change; a design gap Eric has not ruled on (then AskUserQuestion, never a ledger entry).

**Never:** the persistence read or "one honest radar setting". There are no ghosts (11.4 is not built), no splash returns (11.5 shelved), no clutter on any bot's view and no radar knobs, so there is nothing to filter or set: recorded, not built. Also never: a change to the secondaries, torpedoes, mines, special shells or `aimScatterU` / `gunAimScatterU`; turning toward a flash bearing (#64 is an idea); pinning a seed-produced number or a CONFIG literal in a test; an edit to `CLAUDE.md`; a batch run beyond the two approved 50-match runs (seed 7, `--roster even`, `--captains 0 --bots 16`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Close, side-on | ready turret bears, target at 40 hm | chance ≥ bar → click | — |
| Far, side-on | target at 300 hm | chance < bar → hold, aim still written, scatter kept | — |
| Same range, end-on vs side-on | known class + heading | end-on chance ≥ side-on chance | — |
| Radar blip | heading/cls null | judged as the smallest hull side-on | — |
| Zero range / degenerate | aimDist ≈ 0 | chance finite in [0,1] | non-finite input → 0 (hold) |
| Bar unreachable | `hitBar` > point-blank chance | `barRangeU` = 0, band collapses to [0,0], no NaN | — |

</intent-contract>

## Code Map

- `server/src/game/ai/battery.ts` -- `batterySolve` (≈139–150): the click gates; insert the hold here.
- `server/src/game/ai/doctrine.ts` -- `gunBand` / `mountedBandOf`: the band edges; the main battery is mapped to the `cannon` key.
- `server/src/game/ai/tactics.ts` -- `bandBearing` (≈604) reads `gunBand(sit.profile, sit.stats, sit.gunId)`; it needs the target's class.
- `server/src/game/ai/types.ts` -- `RememberedContact` (≈401–480): `cls` and `heading` are null on radar-only tracks.
- `shared/src/sim/dispersion.ts` -- `dispersionAxes` (:57) and `dispersedPoint` (:78, the truncated-Gaussian law to mirror).
- `shared/src/sim/silhouette.ts` -- `hullSilhouette`, `transformPolygon`, `pointInPolygon`, `polygonArea`.
- `server/src/game/ai/tacticKit.ts` -- `scatterOffset` (:223): the wobble disc law.
- `shared/src/constants.ts` -- `CONFIG.bots` (≈419–488): add `hitBar`.
- `server/scripts/batchsim/overrides.ts` -- make `bots.hitBar` a `--set`/`--tune` dial if the bots block is tunable there.
- `server/scripts/batchsim/botReadoutReport.ts`, `botMetrics.ts`, `rangeBands.ts` -- the 9.13 readouts and hit share by range band; add main-battery clicks per bot per match.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- add `CONFIG.bots.hitBar: 0.2` with a doc comment citing Eric's ruling -- R1.
- [x] `server/src/game/ai/hitChance.ts` (new) -- `hitChance(rangeU, outline, bearingRad, cfg?)` and `barRangeU(cls|null, rangeU)`. Use a fixed lattice over the wobble disc × the dispersion ellipse, weighted to `dispersedPoint`'s law, tested with `pointInPolygon`, plus the R3 blip model. Memoize by (class, aspect bucket, range bucket) -- R2/R3.
- [x] `server/src/game/ai/battery.ts` -- the hold gate in `batterySolve` -- R2.
- [x] `server/src/game/ai/doctrine.ts` + `tactics.ts` -- rescale the main-battery band to `B = barRangeU / 0.8`, passing the target's class -- R4.
- [x] `server/src/game/ai/__tests__/hitChance.test.ts` -- contracts: in [0,1]; non-increasing with range; end-on ≥ side-on at equal range; a larger outline ≥ a smaller one; the blip model equals the smallest hull side-on; matches a seeded Monte Carlo of `dispersedPoint` + `scatterOffset` within a stated tolerance; `barRangeU` is where the chance crosses the bar.
- [x] `server/src/game/ai/__tests__/` (battery suite) -- holds below the bar with the scatter kept; clicks at or above it; the band far edge equals `barRangeU` at zero nudge.
- [x] `server/scripts/batchsim/*` -- count main-battery clicks per bot per match and print them with the 9.13 readouts.
- [x] `_bmad-output/implementation-artifacts/batch-sim-evidence-2026-11-16.md` -- the baseline vs new 50-match tables (land contact, storm share, ram deaths, placement and win share by hull, hit share by range band, main-battery clicks), plus the `tickCost.mjs` pair.
- [x] Record: epic-11 amendment (number at PR time), the both trackers, `deferred-work.md` (close the "bots see ghosts" thread as moot until 11.4), and How-to-Play only if a line is owed (none expected: bots are not explained there).

**Acceptance Criteria:**
- Given a bot whose ready turret bears on a target, when the per-shell hit chance is below 0.20, then no click is sent and its aim and held scatter persist; when the chance is at or above 0.20, then it clicks.
- Given a 16-bot match, when it runs, then bots hold station at about the bar range and the main-battery hit share rises against the baseline (reported, not asserted).
- Given the full gate, when `npm run check`, `weaponsSmoke.mjs` and `matchSmoke.mjs` run, then all pass first try. `PROTOCOL_VERSION` is unchanged; no client file changes.

## Spec Change Log

### 2026-11-16 — review pass 1 (Eric rulings by AskUserQuestion, outside the intent contract)
- Trigger: all three reviewers (two Opus hunters — Fable was rate-limited and Eric chose Opus — and Codex) found bots parking EXACTLY on the bar range and then holding fire forever (angled / opening targets, stale aim error, remembered class with no heading, positive nudge).
- R5 (Eric: "Hold at 90 % of bar range"): `CONFIG.bots.barStandoffFrac` 0.9 — the main-battery band's far edge = 0.9 × bar range; a profile nudge never pushes it past that.
- R6 (Eric: "Kite at the bar range"): the kite posture's hold distance is the same 0.9 × bar range, so a kiting bot keeps firing as it backs off.
- R7 (Eric: "Keep the old trigger"): Speed Boost's `chargingIn` reads the OLD trigger — target past `CONFIG.bots.gunBand.cannon[1]` (0.8, + nudge) × main-battery reach, not the new band.
- Orchestrator fixes: the held aim error is stored as a unit offset and rescaled to the current range at every use; the fire check reads the target's angle from the UNWOBBLED lead bearing (Codex); a remembered class with no heading is judged as THAT hull side-on, the smallest-hull blip model only when the class is unknown (supersedes the "or heading" half of R3) — the band and the gate use one model.
- Known and accepted: past ~110–160 hm side-on is not always the hardest aspect (the wobble disc is round) — the 10 % margin covers the ~1-point gap; the I/O row "end-on ≥ side-on" holds only to ~110 hm. The star-shell lit lift no longer helps the main battery in practice.
- KEEP: hitChance.ts lattice + memo (all reviewers: sound); the batterySolve gate placement; the mbClicks readout.

## Review Triage Log

### 2026-11-16 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 3, medium 2, low 1)
- defer: 0
- reject: 5: (low 5)
- addressed_findings:
  - `[high]` `[patch]` bots park on the exact bar range and never fire — margin R5 (Eric) + nudge clamp
  - `[high]` `[patch]` band vs gate model mismatch for a remembered class with no heading — one model
  - `[high]` `[patch]` kite posture can never fire — R6 (Eric)
  - `[medium]` `[patch]` held aim error drawn at long range reused at the bar — unit offset rescaled per use
  - `[medium]` `[patch]` Speed Boost now fired from the bar range — R7 (Eric) old trigger
  - `[low]` `[patch]` aspect read off the wobbled bearing (Codex) — lead bearing

## Design Notes

Why the wobble counts: Eric picked 20 % from a table that included the bot's wobble (60 / 32 / 21 % at 50 / 95 / 140 hm side-on). Without the wobble, the bar range would be ≈ 280 hm and nothing would change. With it, the side-on bar range is ≈ 140 hm for an Iowa.

`combatSmoke` and `zoneSmoke` are red on their own heuristic pilots (the deferred smoke-rewrite entries), not on this story. `weaponsSmoke` already derives its ranges from CONFIG. "Re-script the smokes for the new reaches" is satisfied by them passing; the two red ones stay on their ledger.

## Verification

**Commands:**
- `npm test -w server` then `npm run check` -- green.
- `HC_DEV_OPTIONS=1 node server/scripts/weaponsSmoke.mjs` and `matchSmoke.mjs` (booted server, PIDs killed after) -- pass.
- `node server/scripts/tickCost.mjs` on baseline vs branch -- reported.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 16 --matches 50 --seed 7 --roster even` on baseline and branch -- reported.

## Auto Run Result

Status: done (PR to `development`; Eric merges).

- **Change:** bots hold the main battery until one shell has a 20 % chance to hit (wobble × real dispersion, deterministic lattice); the battery standoff sits at 90 % of the bar range; kiting follows the bar; Speed Boost keeps its old trigger; a remembered class is judged as itself, an unknown class as the smallest hull side-on.
- **Files:** `server/src/game/ai/hitChance.ts` (new), `battery.ts`, `doctrine.ts`, `tactics.ts`, `navigate.ts`, `shift.ts`, `types.ts`; `shared/src/constants.ts` (`hitBar`, `barStandoffFrac`), `shared/src/sim/dispersion.ts` (`bellRadius` exported); harness `overrides.ts`, `botReadouts.ts`, `botReadoutReport.ts`; tests `hitChance`, `botDoctrine`, `botTactics`, `botArcs`, `botSweep`, `botHarness`.
- **Review:** 6 patches applied (3 high, 2 medium, 1 low; three via Eric's rulings R5–R7), 0 deferred from review (2 ledger notes from the story itself), 5 rejected.
- **Verification:** `npm run check` green in one run (server 3,015, client 176 files, hooks 266); `matchSmoke.mjs` and `weaponsSmoke.mjs` passed first try; `tickCost.mjs` 5.42 → 4.87 ms; 50 + 50 batch matches in `batch-sim-evidence-2026-11-16.md`.
- **Residual risk:** Warspite lost win share (4.5 → 3.0 %, 50 matches, noisy); no staging pass yet; side-on is not the hardest aspect past ~110–160 hm (covered by the 10 % margin).
