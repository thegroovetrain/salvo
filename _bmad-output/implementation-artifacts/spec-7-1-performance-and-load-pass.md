---
title: 'Story 7-1: Performance & Load Pass'
type: 'chore'
created: '2026-08-18'
status: 'in-review'
baseline_revision: 'e850507585856ad8e5ac8c5a4b567ed38649bd98'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** NFR1's whole-frame verdict has never been obtained, and it is unobtainable *by construction*: the only split sim/render instrument (`client/src/stage/worstCase.ts`) is reachable only under `import.meta.env.DEV`, while Eric's 2026-08-11 ruling makes a Vite dev build an invalid NFR1 basis and headless rAF throttling makes any frame-rate number a lie. Three epics of render growth (return heatmap, radar shadows, wakes, chop, a 2800u ocean, up to 48 concurrent PvE hulls, 20-hull bot lobbies, the whole-disc omniscient reveal) are unmeasured, and NFR2's load budget is likewise unmeasured while first paint is currently gated on a Google Fonts round-trip.

**Approach:** Make the measurement legitimate, then take it. Add a **perf build** (`vite build --mode perf`, `__HC_PERF__` define) that is production-identical in every code path but retains the staged scene; extend the staged scene with a second, NFR1-population profile (the readability profile stays byte-identical); drive it **headful on this reference device** so vsync is real; capture the frame-time split, entity counts and a cold-load waterfall as machine-readable audit records; fix any breach at the offending system.

## Boundaries & Constraints

**Always:**
- The **shipped** `npm run build` artifact stays free of `STAGE_MARKER` and of every perf seam — pinned by an automated check, not asserted (NFR17). `__HC_PERF__` defaults to `false` so both gate terms fold dead in the default build.
- The NFR1 verdict is taken on the **perf build**, never a dev build, and **headful** on the reference device (MacBook Pro 16,1 / 6-core i7-9750H @ 2.6 GHz / 32 GB / macOS 25.4). Headless is permitted only for the *cold-load* leg, where rAF cadence is irrelevant.
- Story 4.8's readability gate must keep working unchanged: `/?stage=worstcase` with no profile parameter stages exactly today's scene, and `client/scripts/readabilityCapture.mjs` keeps passing.
- No new workspace dependency. Browser automation resolves an existing `playwright-core` install the way `readabilityCapture.mjs` already does, or drives Chrome over CDP using the already-present `ws`.
- Frame-cadence numbers live in their own struct and carry their validity condition. **`FrameStats` gains no `fps` field** — the 2026-08-11 prohibition stands.
- Every number that reaches the audit record is measured in this cycle; no figure is carried forward from a code comment.

**Block If:**
- A measured budget breach can only be closed by cutting or degrading a ratified feature — HALT for Eric's sign-off rather than cutting.
- The reference scenario cannot be staged without changing gameplay-authoritative `CONFIG` values.
- Headful Chrome cannot be launched on this machine, leaving no legitimate basis for the frame-rate half of the verdict.

**Never:**
- Do not measure off `npm run dev` / the Vite dev server, and do not start Eric's dev server.
- Do not fix the ungated production `P` netcode toggle, do not build `loadTest.mjs`, and do not touch server tick profiling or `/metrics` — those are Story 7.8's named scope. Ledger findings instead.
- Do not add analytics, consent or ad scripts to measure their cost — they do not exist yet (Stories 7.2/7.4); measure the budget they must later fit inside.
- Do not edit DESIGN.md, EXPERIENCE.md, the GDD or `epics.md` (Story 7.6 owns doc reconciliation).
- Do not introduce a player-facing FPS/perf HUD — no such surface is designed, and NFR17 forbids shipping one.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default production build | `npm run build` | `client/dist` contains no `STAGE_MARKER` and no perf-only code | Verification command fails |
| Perf build | `npm run build:perf -w client` | Minified prod bundle that DOES contain `STAGE_MARKER`; `window.__hcStage` present at `/?stage=worstcase` | Missing marker ⇒ fail loudly |
| Profile absent | `/?stage=worstcase` | Today's Story 4.8 readability scene, unchanged | Falls back to readability profile |
| Profile `nfr1` | `/?stage=worstcase&profile=nfr1` | Full-match population: 20 contestants + peak PvE fleet + in-flight ordnance + all shipped effects | Unknown profile string ⇒ readability profile, warn to console |
| Frame stats, too few frames | fewer than 2 samples | `stats()` returns `null` | No throw |
| Present stats, throttled source | headless / no vsync | Cadence struct reports samples but flags `vsyncTrusted: false` | Verdict leg refused, never faked |
| Cold load, fonts unreachable | Google Fonts blocked or slow | First paint NOT delayed past the bounded wait; game boots on fallback faces | Existing catch keeps boot alive |

</intent-contract>

## Code Map

- `client/vite.config.ts` -- add the `__HC_PERF__` define, defaulted false and true only under `--mode perf`.
- `client/package.json` -- add the `build:perf` script; wire the existing unwired `vitest bench`.
- `client/src/main.ts:4611,4640,4758` -- `stagedSceneRequested()` and the `import.meta.env.DEV` gate that dead-strips the stage; gate becomes `import.meta.env.DEV || __HC_PERF__` and the profile is parsed here.
- `client/src/stage/worstCaseScene.ts` -- `SCENE` (readability population: 12 near + 7 far contacts) and `STAGE_MARKER`; gains the NFR1 population profile beside the existing one.
- `client/src/stage/worstCase.ts:65-140,330-361,424` -- `FrameSample`/`SeriesStats`/`FrameStats`, `driveFrame()`'s split timer, `stats()`, the `window.__hcStage` surface; gains present-cadence sampling and entity counts.
- `client/src/render/stage.ts:198-249` -- `preloadFonts()` + `await document.fonts.ready` before `app.init()`: the first-paint blocker.
- `client/index.html:7-9` -- render-blocking Google Fonts stylesheet; the other half of the first-paint blocker.
- `client/scripts/readabilityCapture.mjs` -- reference implementation for playwright resolution, `--verify-bundle` and audit-output posture; must keep passing.
- `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- does not exist; created by this cycle.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- home for out-of-scope findings (the ungated `P` toggle, bundle splitting if deferred).

## Tasks & Acceptance

**Execution:**
- [x] `client/vite.config.ts` -- define `__HC_PERF__` as `mode === 'perf'` and declare it in the client's ambient types -- so a production-identical build can retain the instrument while the default build folds it dead.
- [x] `client/package.json` -- add `build:perf` writing to a separate out dir, and a `bench` script -- the perf build must never overwrite the shipped `dist`.
- [x] `client/src/main.ts` -- widen the stage gate to `import.meta.env.DEV || __HC_PERF__`, parse `profile` off the query string, pass it to `runWorstCaseScene` -- one entry point, both profiles.
- [x] `client/src/stage/worstCaseScene.ts` -- add an `nfr1` scene profile beside `SCENE` staging the full-match population (20 contestants + the 48-hull peak PvE fleet + in-flight ordnance + all shipped effects), selected by parameter with the existing constants as the default -- Story 4.8's gate must not move while NFR1 gets its own population.
- [x] `client/src/stage/worstCase.ts` -- add rAF present-cadence sampling in its own struct with a `vsyncTrusted` flag, and an entity/sprite count readout; expose both on `__hcStage` -- the audit record needs frame-time split AND entity counts, and the cadence half must declare when it is trustworthy.
- [x] `client/scripts/perfCapture.mjs` -- new headful capture driving the perf build: warm up, run measurement windows at zoom 0.5/1.0/1.5 plus the omniscient-reveal framing, emit JSON + PNGs -- the NFR1 evidence, re-runnable rather than a comment.
- [x] `client/scripts/loadCapture.mjs` -- new headless cold-load capture against the real `client/dist` with CDP network throttling and a cold cache: FCP, interactive-home, full request waterfall -- the NFR2 evidence.
- [x] `client/index.html` -- make the Google Fonts stylesheet non-render-blocking -- first paint must not wait on a third-party CDN (NFR2).
- [x] `client/src/render/stage.ts` -- bound the font wait so `app.init()` cannot be held hostage by `document.fonts.ready` -- the same blocker on the JS side; boot already falls back to system faces.
- [x] `client/src/__tests__/` -- add tests covering the profile selector, `vsyncTrusted` gating, the bounded font wait, and the absence of an `fps` field on `FrameStats` -- the I/O matrix's edge cases.
- [x] `client/scripts/perfCapture.mjs` + `client/scripts/loadCapture.mjs` -- run both, then fix each breach in the file that owns the offending system and re-run the same capture -- the story is a verdict, not a harness.
- [x] `_bmad-output/implementation-artifacts/perf-gate/` -- write the audit record (JSON + a markdown write-up carrying the device stamp, both verdicts and every fix) -- the AC's named deliverable.
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- create it and record this cycle's decisions of record, each attributed (measured fact / implementer decision / Eric ruling) -- amendments are the durable home; compiled epic context is regenerable.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger out-of-scope findings with evidence -- Story 7.8 owns them.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` + `_bmad-output/gds-workflow-status.yaml` + `VERSION` -- stamp 7-1 done, cycle 103 / 0.17.103 -- both trackers move in the same PR, without exception.

**Acceptance Criteria:**
- Given the reference device and the perf build run headful, when the NFR1 profile runs its measurement window, then the frame-time split is recorded against sim ≤ 3 ms, render ≤ 10 ms and headroom ≥ 3.6 ms, with entity counts alongside, and a pass/fail verdict is stated per framing rather than averaged into one number.
- Given a measured breach, when it is fixed, then the fix is at the offending system (pooling, batching, decay caps) and the same measurement is re-run and recorded before and after; if no such fix exists without cutting a ratified feature, the run HALTS for Eric.
- Given a cold cache and a throttled residential connection, when the real production build is loaded, then time to interactive home is recorded against ~10 s, the waterfall is captured, and first paint is demonstrably not gated on font loading.
- Given `npm run build`, when the built assets are searched, then no `STAGE_MARKER` and no perf-only code appear anywhere in `client/dist`.
- Given `npm run check`, when it runs, then lint, three type-checks and all tests pass.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why a perf build rather than measuring the dev build.** Eric ruled the dev build an invalid NFR1 basis, and he is right: Vite dev serves unbundled ES modules, skips minification and keeps every dev branch live. But the instrument lives behind `import.meta.env.DEV`, so "valid basis" and "has an instrument" were mutually exclusive. `--mode perf` breaks the deadlock: identical Rollup pipeline, identical minification, identical folded-away dev branches, one extra define. The shipped artifact is unchanged and provably so — `STAGE_MARKER` exists precisely so the dead-strip claim is checked rather than asserted.

**Why headful.** The 2026-08-11 run reported "17 frames in 6 s (2.8 fps)" beside a 1.1 ms frame time — the frame count was measuring headless Chromium's rAF throttle. A GUI session exists on this machine, so the browser can present against a real vsync source and the cadence becomes a real observation. The capture records `vsyncTrusted` and refuses the cadence verdict when it is false, so the failure mode is a refusal rather than a fabricated number.

**Why a second scene profile instead of editing SCENE.** `SCENE`'s counts are reasoned against the *attention* ceiling (~100× the ratified onset budget in one screen region) and are load-bearing for Story 4.8's ratified gate. NFR1's scenario is a different ceiling — total entity population across the whole viewport. Editing SCENE would silently re-take a ratified decision; adding a profile takes neither.

**The two framings that matter.** Alive play at 0.5×–1.5× zoom is one; the omniscient reveal at ~0.26× is the other, and it is the known-worst and never-measured case — it draws every island coastline and contour band on the disc at once. Both are measured; a single averaged number would hide whichever is worse.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), three type-checks clean, all tests pass.
- `npm run build` -- expected: green; a search of `client/dist` for `HC_STAGED_WORSTCASE` then returns nothing.
- `node client/scripts/readabilityCapture.mjs --verify-bundle` -- expected: the existing Story 4.8 bundle check still passes.
- `npm run build:perf -w client` then `node client/scripts/perfCapture.mjs` -- expected: JSON audit record under `_bmad-output/implementation-artifacts/perf-gate/` with a stated verdict per framing.
- `node client/scripts/loadCapture.mjs` -- expected: cold-load waterfall + FCP/interactive-home timings in the same directory.
