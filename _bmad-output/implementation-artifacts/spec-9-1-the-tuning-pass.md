---
title: 'Story 9.1: The Tuning Pass — session 1, the big ocean'
type: 'balance'
created: '2026-10-07'
status: 'built (session 2: cycle 170)'
baseline_revision: '50f189f4'
final_revision: 'pending'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/9-1-the-tuning-pass.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/batch-sim-evidence-2026-10-06.md'
warnings: [eric-steered, no-review-gate-yet]
---

<intent-contract>

## Intent

**Problem (Eric, 2026-10-06):** *"I want ~50% of the field gone at each ring, on average. So 20 becomes 10 becomes 5 becomes 2-3. Games are ending around 6-8 minutes. The game is deadly again, which isn't bad. But the other issue is that there's no real easy way to escape combat."* Baseline measured: 7.4 alive at 4:00, 1.3 at 8:00, median match 8:04.

**Approach:** Eric's own balance-harness session (`batch-sim-evidence-2026-10-06.md`, 13 arms over two days) and then, at his word (*"I think I need to see it myself. Lets run with 11000 -> 7000 -> 4000 -> 2000 -> 0, set up a PR, i'll test on development"*), ship the board that met the 4:00 target for him to play on staging: ocean radius 5500 u, 10 % land, and the storm's ring ladder as his literal numbers. Hull hp, guns, heals and the spawn layout are untouched; ring 2 (3.8 alive in sim against 5) is his next dial.

## Boundaries & Constraints

**Always:**
- Every number is Eric's, recorded verbatim in epic-9 amendments 2–9. The board: `CONFIG.map.baseRadius` 5500; `TERRAIN_PARAMS` cover 0.10 (band 0.08–0.12); `CONFIG.zone.ringRadii` [3500, 2000, 1000].
- The ladder is LITERAL in CONFIG (ring radii in units, terminal last). The geometric formula (`ringSteps` + `terminalSightFactor`) is retired from the shipped config and kept only as the fallback for timelines that carry no ladder (dev `zoneOverride` literals, smokes, fixtures). `sim/zone.ts` is the one place both paths meet; clamp chain, roll, containment and the collapse are unchanged.
- Ring sizes are not a test subject (amendment 8): zone tests exercise the functions on a synthetic ladder; rolled rings compare against `zoneTerminalRadius(cfg)`.
- `PROTOCOL_VERSION` 71 → 72 (same seed, different ocean; the client derives map and storm locally). `VERSION` / root `package.json` / lockfile 0.18.34. Both trackers stamped.
- Harness instrument changes stay instrument: `--set terrain.*`, `--spawn-rings`, `zone.ringRadii.N`; retired `zone.ringSteps.*` / `zone.terminalSightFactor` refused with the live dial named.

**Never:**
- Propose or measure anything at 2800 u again (amendment 6). Re-propose the two-ring spawn at the big board without Eric asking (unmeasured there).
- Let map generation give up (amendment 10): an invalid draw is reseeded until a valid map comes out; `MapGenerationError` is a bug guard, not an outcome.
- Pin a CONFIG number in a test re-based this cycle (cover band values, ring radii, vertex average).

</intent-contract>

## Code Map

- `shared/src/constants.ts` — `map.baseRadius` 5500; `zone.ringRadii` [3500, 2000, 1000] (ringSteps / terminalSightFactor removed); doc blocks carry the rulings.
- `shared/src/sim/heightField.ts` — `TERRAIN_PARAMS.cover{Target,Min,Max}` 0.10 / 0.08 / 0.12 (`regionWavelength` tracks the radius as before).
- `shared/src/sim/zone.ts` — `ZoneTimeline.ringRadii?`; `ringSteps` / `terminalSightFactor` optional (formula fallback); `ringRadiiOf`, `geometricGroups`, `zoneTerminalRadius`, `zoneRingRadii` take the literal path when a ladder is present.
- `shared/src/sim/map.ts` — `mapIsNavigable(map)` export (validateMap's navigability half).
- `shared/src/index.ts` — PV 72 + note.
- `server/src/game/spawn.ts` — harness-only `setSpawnLayout` / `spawnRingRadii` (null = shipped single ring, candidate for candidate).
- `server/scripts/batchsim/{overrides,args,main,runner}.ts` — `terrain.*`, `--spawn-rings`, `zone.ringRadii.N`, retired-key refusals, `spawnDiag` in the JSON.
- Tests: `shared/src/__tests__/{zone,map,heightField,radarShadow,collision,barrel,radarRaster}.test.ts`; `server/src/__tests__/{spawnLayout,drones}.test.ts`; `server/scripts/batchsim/__tests__/{terrainDials,batchSim,poolReadouts}.test.ts`; `client/src/__tests__/{zone,ordnanceMasksAreServerOnly}.test.ts`; `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap` (re-recorded — see below).
- Docs: `CHANGELOG.md`, `epic-9-context-amendments.md` 2–9, GDD dated stamps (storm, ocean, generation parameters), `epics.md` 9.1 stamp, both trackers, `batch-sim-evidence-2026-10-06.md` (the session), `9-1-the-tuning-pass.md` (story record).

## Test re-bases (each with its measurement — amendment 9)

See amendment 9 (b)–(g); 9(a) is superseded by amendment 10 (the sweep generates every seed again and pins that it does). The one that is a design observation for Eric rather than a test matter: the biggest landmasses on the 10 % board sit AT the 92-vertex hard cap and run up to 37 u off the raster mask — a finer cap for very large islands is a map-look question.

## Known costs told to Eric with the ruling

- ~~Map generation gives up on ~1 seed in 30–100~~ — REJECTED by Eric the same day (amendment 10): the generator reseeds until valid; no lobby is ever closed by the generator.
- The 1000 u terminal ring is wider than radar reach (660 u); the sudden-death collapse ends the match.
- The storm takes 13–17 % of bot deaths on the big board (1.8 % before), the 4-minute beat unchanged.
- Map generation ~0.7 s per map; height raster 791² (was 405²).

## Session 2 (cycle 170, 0.18.35, PV 73)

Eric after playing 0.18.34 on staging: storm damage RAMP 1 / 2 / 3 / 4 / 5 hp/s by close (`CONFIG.zone.stormDps` ladder, `stormDpsFor`), ocean radius 5500 → 4000 (diameter 8000), rings 8000 → 5000 → 3000 → 2000 → 0 (`ringRadii` [2500, 1500, 1000]); amendments 11–13; the harness run at these numbers is the ledger's §9.

## Gate

`npm run check` — results in the CHANGELOG entry. No review gate run this cycle (Eric's call to see it first); `followup_review_recommended: true`.
