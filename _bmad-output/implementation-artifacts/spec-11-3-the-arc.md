---
title: 'Story 11.3: The Arc'
type: 'feature'
created: '2026-11-13'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A radar paint today is the target's silhouette with a one-cell fuzz, so at 400 hm a scope shows a ship's exact position as sharply as a sighted contact. Epic 11's pillar (lock 1) is that clear-day dark is RESOLUTION, not range: a far contact must be an ARC — sharp in range, wide in bearing.

**Approach:** One pure shared function smears any sharp radar coverage in bearing about the observer by `CONFIG.vision.beamDeg` and in range by a pulse term, and every radar paint source (hull, wake segment, crate disc) runs through it server-side before today's fuzz. The wire keeps its cell-mask shape; the client's size validators and the bots' crate test are re-derived for wide masks. A live arc bench page built from the real function (with the client far-cell candidates) goes to Eric BEFORE any game wiring is committed.

## Boundaries & Constraints

**Always (Eric's rulings, AskUserQuestion x2, 2026-11-13, R1–R6):**
- R1 Beam width 3° — `CONFIG.vision.beamDeg: 3`, a dial, not a player knob. (The forge's "5–6° ≈ 500 u at 9,000 u" was inconsistent; 500 u at full reach IS ~3°.)
- R2 The arc is CENTERED on the true bearing, like a real set. Eric accepts that a modified client can read the exact bearing from an arc's middle. The story AC's "never leaks the bearing more tightly than the beam allows" is superseded by: a paint is never NARROWER in bearing than the beam at its range.
- R3 Depth = the target's own extent along the line of sight + a pulse term of 1.5 hm (`CONFIG.vision.pulseHm: 1.5`, written via `hmToU`). Heading still shows in a paint's depth.
- R4 Everything the radar paints smears by the same beam: hulls, wake segments, crate discs.
- R5 Bench page FIRST (amendment 1(q)): built from the real shared arc function on real `generateMap` seeds, dials for beam and pulse, targets at several hm ranges incl. 400; Eric's yes before game wiring is committed.
- R6 Client far-cell look: candidate curves (today's fixed 9 u cell among them) rendered side by side on the bench page; Eric picks; nothing ships unseen.
- The smear is per OBSERVER: observer → target bearing/range is an input; the paint memos key on it. Per-paint salt (`paintSalt.ts`) stays; the crate path gains the salt the hull path has.
- Still exactly SIX perception exceptions; the arc gets its own invariant line (every radar paint, at any range, spans at least the beam's bearing width at its range and is no deeper than target extent + pulse + fuzz).
- `PROTOCOL_VERSION` bumps (the client reads `beamDeg` for its validators).
- Numbers (amendment, cycle, version, PV) taken at PR time after `git fetch`.

**Block If:** Eric does not give his yes on the bench page or rules something R1–R6 do not cover; a 16-hull `tickCost.mjs` regresses past half the 50 ms tick; the arc cannot ship without a seventh exception.

**Never:** player radar knobs, ghosts, the strength model (11.4); splashes on radar (11.5); bot tuning beyond keeping them functional (11.9 — bots read the arc's centroid as today); in-game copy; touching dispersion, reaches, sight tiers, shadows; a local perf verdict; editing `CLAUDE.md`; merging.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Far hull | hull at 400 hm | arc ≈ 476 u wide, ≈ hull depth + 34 u deep | none |
| Near hull | hull at 5 hm | beam adds < 1 cell; silhouette shape survives | none |
| Wake | segment at 300 hm | smeared like a hull | none |
| Crate | crate at 350 hm | smeared; bots still classify it a crate | none |
| Observer at target | distance 0 | no smear (sharp + fuzz) | finite guard |
| Two observers | same hull, same tick | different masks; each centered on its own bearing | none |
| Arc across 0° / 360° | target due east of observer | continuous arc, no wrap gap | none |
| Stale client | old PV | join refused | existing gate |

</intent-contract>

## Code Map

- `shared/src/sim/radarRaster.ts` -- `paintCoverage` / `paintSegmentCoverage` / `paintDiscCoverage` / `fuzzCoverage`; arc smear goes between sharp raster and fuzz.
- `shared/src/constants.ts` -- `CONFIG.vision` (`radarCellU` 9, `radarFuzz`, `radar`), `CONFIG.bots.cratePaintMaxU`.
- `server/src/game/signals.ts` -- `paintMask` (:683), `wakeMask` (:1463), `dropPaint` (:1183), memos `lastMask` / `lastWakeMask`.
- `client/src/render/radar.ts` -- `MAX_COVERAGE_SPAN` (:1477), `MAX_WAKE_SPAN` (:1564) validators.
- `client/src/render/ambient.ts:446`, `ambientScene.ts:577`, `client/src/stage/worstCaseScene.ts:655` -- client callers of the paint functions.
- `server/src/game/ai/plot.ts:158` `isCrateSizedPaint`, `utility.ts:453` `foldBlip`.
- Tests: `server/src/__tests__/radarWire.test.ts`, `paintFixture.ts`, `perception.test.ts` oracles (:3762–4297), `goldenFrames.test.ts`; `shared/src/__tests__/radarRaster.test.ts`, `wake.test.ts`, `drops.test.ts`; `botPlot.test.ts:921`.
- `client/scripts/reachBench.mjs` + `reachBench/` -- bench recipe to copy.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/radarArc.ts` (new) + `constants.ts` -- pure `smearArc(sharp, ox, oy, cellU, beamRad, pulseU)`: each lit cell contributes the annular sector [r ± pulse/2] × [θ ± beam/2] about the observer; union; finite-guarded; no transcendental-dependence on the wire beyond what `paintCoverage` already has -- the arc law, one function.
- [ ] `client/scripts/arcBench.mjs` + `arcBench/` -- the bench page (R5, R6) with `--selftest` -- Eric's gate.
- [ ] `shared/src/sim/radarRaster.ts` -- the three paint functions take the observer and apply `smearArc` before fuzz; crate path takes the salt -- one pipeline.
- [ ] `server/src/game/signals.ts` -- pass `ctx.me` pose; memo keys gain the observer -- per-observer paints.
- [ ] `client/src/render/radar.ts` + the three client callers -- validators re-derived from beam, pulse and radar reach; ambient scenes pass their observer -- far paints are not dropped.
- [ ] `server/src/game/ai/plot.ts` -- crate test reads radial depth, not `max(w,h)` -- bots stay functional.
- [ ] Client far-cell change per Eric's bench pick (R6).
- [ ] Tests: arc unit tests (width ≥ beam at range, depth bound, wrap, near-range shape); per-observer invariant line in the perception suite; oracles/fixtures take the observer; golden frames re-recorded with a dated header paragraph; `shared/src/index.ts` PV bump.

**Acceptance Criteria:**
- Given any radar paint in any frame, when the invariant suite runs, then its bearing span about the observer is ≥ the beam at its range and its depth ≤ extent + pulse + fuzz bound, and the six exceptions stay six.
- Given a 16-hull match, when `tickCost.mjs` runs old vs new, then both numbers are in the PR.
- Given the built client, when `glBudget.mjs` and `playCheck.mjs` run, then both pass.

## Design Notes

Two observers painting one hull in one tick now receive different masks (each centered on its own bearing): the old "observer-independent mask" claim and its tests are retired as a ruling, not patched. Arc size at 400 hm with 3°: ~53 × ~5 cells; a 45°-bearing bbox ≤ ~55² cells ≈ 95 words — bounded.

## Verification

**Commands:**
- `npm run check` -- green.
- `node client/scripts/arcBench.mjs --selftest` -- PASS.
- `node server/scripts/tickCost.mjs`, `node client/scripts/glBudget.mjs`, `node client/scripts/playCheck.mjs` -- run, numbers recorded.
- matchSmoke + weaponsSmoke (booted server, `HC_DEV_OPTIONS=1`) -- first try.
