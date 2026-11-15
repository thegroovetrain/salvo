---
title: 'Story 11.6 Rain First — the storm eye and partial sight'
type: 'feature'
created: '2026-11-14'
status: 'in-progress'
baseline_revision: '0cfdff41309913003df1c87e473bef4c77d09542'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The fog banks cut sight on/off like League-of-Legends brush (a hull is fully seen or gone; your own bank is free), and they sit nearly still on a coverage target. Eric 2026-11-14: rain must occlude "in a realistic way" — you see the PARTS of a ship the rain lets through — and the weather is the eye of a closing hurricane.

**Approach:** Replace the fog field with a storm-eye rain field anchored to the live zone ring (pure shared function of `fogSeed` + live ring + time; no cut, no coverage target). Sight through rain becomes optical depth τ = ∫density along the line; a hull is sent while ANY point of a grid over its outline has visibility V = exp(−k·τ) ≥ the vanish cutoff, and the client draws it with Eric's A+D look (hull-locked fine dissolve + secondary fade/blur) per part. Eyes only — radar untouched (scope Option 1).

## Boundaries & Constraints

**Always:**
- Eric's ruled numbers, from the bench page (https://claude.ai/artifact/63nUUF8FWXps44c4feZpS3, v4; reference code on branch `worktree-rain-sight-bench` → `bench/rain-sight/src/stormField.ts`, `look.ts`): extinction k 0.006 / u at density 1; vanish cutoff V 0.05; hull grid 6 along × 2 across; grain 2 u; blur at V 0 = 6 u; D strength 0.4; edge speed 10 u/s; center turn 0.5 × edge; spiral pre-wind 4 rad; eye radius 0.40 × live R; edge coverage per ring 45 / 50 / 55 / 60 % (lerped across each closing beat by the ring's own progress, held at 60 % through the collapse); outside coverage 70 %; edge soft width 0.25 × R; morph 150 s. Gameplay-bearing values in `CONFIG.fog`; grain / blur / D strength in `CLIENT_CONFIG`.
- The field is the ONE shared derivation both sides run (`shared/src/sim/fog.ts`), in the map-gen posture: no Math.exp / sin / cos / pow / random / Date.now in that file (the source guard stays); `fogSinCos` for rotation; noise from `sim/noise.ts`.
- The eye's center is the LIVE ring (`zoneLiveState`) — never the unrevealed next ring. The server anchors to `Math.fround`ed ring values so it matches the client's float32 schema copy.
- No own-bank exemption anywhere: rain you stand in blocks your sight.
- Sight reaches (`sightRange`, `hullSightRange`, every other eye reach) are unchanged range caps; rain no longer adds distance — it gates by τ ≤ T where T = ln(1 / cutoff) / k (a constant derived outside the guarded file).
- Every eye gate that pays the fog toll today (hull full + plain tiers, shells, torpedoes, mines, crates, booms, bursts, sunk, spawn, muzzle flash, smoke, countermeasure cloud) switches to the τ gate. Only the two hull rows use the outline grid; point things pass or fail on one ray and draw as today. Still exactly SIX perception exceptions; the invariant oracle is ported, never loosened.
- Rain starts at zone start and rolls in over `CONFIG.fog.onsetMs` 15000 (today's ~15 s onset behavior, density × a linear ramp); none before zone start (golden frames stay valid).
- The client computes per-part V locally from the same shared field (the field is public weather — nothing new on the wire beyond deleting `fogCut`).

**Block If:**
- `tickCost.mjs` shows the 16-hull tick mean above 2× the pre-change baseline on the same machine after the bounded-gate work — halt and report numbers.
- Any perception invariant can only pass by widening an exception.

**Never:**
- Radar, radar returns, ghosts, the rain-clutter knob, a weather roll / weather on the welcome (11.4 / 11.10 — not this story).
- In-game copy or How-to-Play text; GDD / DESIGN.md edits (stamped at 11.11).
- A Pixi texture source destroyed or swapped under a live mask (the 11.2 freeze rule); a second unguarded ticker.
- Per-ship spatial fields on the schema.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clear water | τ = 0 to every grid point | Hull sent; drawn exactly as today (V 1 everywhere) | — |
| Half in a band | bow points τ > T, stern τ ≤ T | Hull sent; bow dissolved/faded, stern crisp | — |
| Fully hidden | every grid point τ > T | Hull not in `contacts` nor `pc` | — |
| Observer inside a band | observer's own cell dense | Pays its own band (no free run) | — |
| Pre-zone / idle | `zoneStartT` null | density 0 everywhere | — |
| Closing beat | ring lerping | eye center/radius follow the live ring continuously; no density jump > field tolerance | — |
| Collapse R → 0 | final group | eye radius 0, whole map at outside coverage; spin uses R floored (250 u) | finite output, never NaN |
| Non-finite input | NaN pose/time | density 0, τ 0 (fail-open as today) | no throw |

</intent-contract>

## Code Map

- `shared/src/sim/fog.ts` -- rewritten: storm-eye field (`makeFogField(seed, cfg, oceanR)`, `fogDensityAt(field, x, y, tMs, ring)`, `fogDepthAlong`, `fogEyeReach` under T, hull grid helper); delete cut/coverage/own-bank/lattice.
- `shared/src/constants.ts` `CONFIG.fog` (2522–2581) -- new dials, derived `maxDepth`; retire coverageMin/Max, targetPeriodMs, cutRatePerS, quantileLattice, sightCostPerU, windU, spinRimU, spinShear.
- `shared/src/index.ts` -- barrel + `PROTOCOL_VERSION` bump (107 → next, number taken at PR time).
- `server/src/game/world.ts` -- fog fields/memo (1477–1626, 1714–2091, 2314–2332, 4643–4950, 8185–8294): delete cut controller; memo refills from the new field at the epoch ring; gate = bounded τ walk; test seam replaces `setFogCutForTest`.
- `server/src/game/signals.ts` -- `eyeHolds`/`fogAdmits`; hull rows 734/751/811–818 go multi-point; all other eye rows on τ.
- `server/src/game/perception.ts` -- `foggedContext` thunks.
- `server/src/rooms/schema/ArenaState.ts` + `ArenaRoom.ts` -- delete `fogCut`; `fogSeed` stays on welcome; metrics `recordFog` retired.
- `server/src/game/ai/cover.ts`, `navigate.ts`, `posture.ts`, `ai/types.ts` -- bots keep a density-based cover read from the new field.
- `server/scripts/batchsim/*` (`overrides.ts`, `botReadouts.ts`, `poolReadouts.ts`, `tickCost.ts`), `server/scripts/fogSmoke.mjs` -- new keys; smoke rewritten time-bracketed.
- `client/src/render/fogField.ts`, `main.ts` (2882, 4529, 4793) -- density fn = new field at live ring; `setCut` gone.
- `client/src/render/radarDim.ts`, `radar.ts` -- eye-reach fan under T.
- `client/src/render/ships.ts`, `plainHull.ts`, `plainHullViews.ts`, `contacts.ts` -- A+D per-part look.
- Tests: `shared/__tests__/fog.test.ts`, `barrel.test.ts`; server `perception.test.ts` (oracle 386–456, 4897, 5073), `perceptionWork.test.ts`, `fogGate.test.ts`, `fogField.test.ts`, `stepOrder.test.ts`, `metrics.test.ts`, bot tests with `fogAt` stubs, `batchSim.test.ts`; client `fogField.test.ts`, `dimFogSlide.test.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/fog.ts`, `constants.ts`, `index.ts`, shared tests -- port the bench `stormField.ts` into the guarded module; τ walk; hull grid; tests on the pure functions (eye clear, coverage profile by ρ, continuity across closing/morph/collapse, τ monotone, no own bank) -- one derivation for both sides.
- [ ] `server/src/game/world.ts`, `signals.ts`, `perception.ts`, schema/room, metrics -- τ gate everywhere, multi-point hull rows with early exit (first passing point wins; reuse `hullPoly`), cut machinery deleted, oracle ported -- the anti-cheat chokepoint stays exact.
- [ ] `server/src/game/ai/*`, batch-sim, `fogSmoke.mjs`, `tickCost.ts` -- bots function on the new field; harness keys follow CONFIG; smoke time-bracketed.
- [ ] `client/src/render/fogField.ts`, `main.ts`, `radarDim.ts`/`radar.ts` -- draw rain from the live ring; eye-reach fan under T.
- [ ] `client/src/render/ships.ts`, `plainHull*.ts`, `contacts.ts`, `config.ts` -- A+D look per part on full contacts and plain hulls (noise locked to the hull; no per-frame reroll; masks/filters respect the texture rules).

**Acceptance Criteria:**
- Given a live match, when the zone runs its whole timeline, then the rain's eye stays centered on the live ring with no density pop at beat edges, morph resets or the collapse.
- Given a hull partly behind rain, when observed, then the frame carries it iff some grid point has τ ≤ T, and the client shows the passing parts with the A+D look and the hidden parts gone.
- Given the perception property suites, when run, then they pass with the ported oracle and exactly six exceptions.
- Given `tickCost.mjs`, `glBudget.mjs`, `playCheck.mjs`, `weaponsSmoke`, `matchSmoke`, `fogSmoke`, when run before the PR, then each passes and the tick cost old vs new is in the PR.

## Spec Change Log

- 2026-11-14 (Eric, mid-implementation): eye radius is STEPPED per ring like the edge coverage — `eyeRadiusFracByRing` 0.10 / 0.20 / 0.30 / 0.40 (start, after 1st, 2nd, 3rd close), lerped across each closing beat, held at 0.40 through the collapse. Supersedes the contract's single "eye radius 0.40 × live R". KEEP everything else.

- 2026-11-14 (Eric, AskUserQuestion, mid-build): SCOPE ADDS — (1) SMOKE SCREEN clouds occlude sight like rain (cloud optical depth added to the line; same A+D look; owner blinded too; thickness set by Eric on the bench page; smoke never blocks radar — orchestrator reading). (2) RAIN RADAR CLUTTER: grainy band-shaped mush re-rolled each sweep, weak at band edges / medium in band middles / heavy outside the ring, client-drawn from the shared field (no wire, no server); real returns NOT weakened. Supersedes the contract's "Never: Radar … (11.4)" for the clutter only and its smoke-free gate list. Bench page (`bench/rain-sight/`) now ships in this PR as the story's bench (precedent: dispersionBench / reachBench).
- 2026-11-15 (Eric: "fixing the test page isn't important. go with 3, 11, and 17.5"): clutter amounts 3 / 11 / 17.5 %; smoke 3x rain, soft 0.3 (page defaults); the bench page is REMOVED from the PR (it locks up; kept on branch `worktree-rain-sight-bench` / commit 7398b031) — supersedes the earlier "bench ships in this PR" line.

## Review Triage Log

## Design Notes

Orchestrator readings for Eric's veto (stated in the PR): point things (shells, torpedoes, flashes, mines…) pop at the cutoff and draw as today — only hulls dissolve; the ~15 s onset at zone start is kept as a ramp; bots treat density ≥ 0.5 as cover as before (now both ways blind); the client's rain drawing (wisps tile + density mask, Eric-approved on the page) is kept; the server's field is evaluated at the memo epoch (≤ 500 ms) as today. Supersedes epics.md 11.6's "sight cut … as today", its radar/ghost/knob clauses and its welcome weather roll (amendment at PR time).

## Verification

**Commands:**
- `npm run check` -- green.
- `node server/scripts/tickCost.mjs` (old vs new, same machine) -- new mean ≤ 2× old, numbers in PR.
- `node client/scripts/glBudget.mjs`, `node client/scripts/playCheck.mjs` -- pass.
- `HC_DEV_OPTIONS=1` server + `weaponsSmoke.mjs`, `matchSmoke.mjs`, `fogSmoke.mjs` -- first-try pass.
