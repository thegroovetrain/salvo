---
title: 'Radar sweep stat tracked in RPM (base 15, +3/stack, cap 30)'
type: 'feature'
created: '2026-07-25'
status: 'in-review'
baseline_revision: '7df936ae4bf2031c91d242252ea3ecdaa8bed347'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** The radar sweep speed is tracked as a period in ms (`CONFIG.vision.sweepPeriod: 4000`) with a multiplicative upgrade (`sweepSpeed: ×0.85 period/stack, uncapped`). Eric wants the stat modeled the way real surface-search radars are specified: rotation rate in RPM. (Eric's invocation premise "currently 8 s / 7.5 RPM" was wrong — the code has always swept at 4 s/rev = 15 RPM; Eric ruled 2026-07-25, via AskUserQuestion: **keep the 15 RPM base**, no felt-base change.)

**Approach:** Make RPM the tracked stat: `CONFIG.vision.sweepRpm: 15`, upgrade `sweepSpeed: +3 RPM per stack, hard cap 30 RPM`. `effectiveStats()` computes `sweepRpm = min(15 + 3·count, 30)` and keeps `sweepPeriodMs` as a derived field (`60000 / sweepRpm`) so every consumer (server `advanceSweeps`, client radar/phosphor/main.ts) is untouched. Zero stacks → exactly 4000 ms, byte-identical to today.

## Boundaries & Constraints

**Always:**
- `effectiveStats()` (`shared/src/sim/stats.ts`) remains the ONLY derivation path; both sides recompute from `(cls, upg)`.
- `sweepPeriodMs` stays on `EffectiveStats`, derived as `60000 / sweepRpm`; zero-count result is exactly `4000`.
- Upgrade id `'sweepSpeed'` keeps its `UPGRADE_IDS` slot (append-only wire index) and its `intel` category slot.
- No wire-type change; `PROTOCOL_VERSION` (currently 12) is NOT bumped.
- ESLint complexity ≤ 10; `npm run check` fully green.

**Block If:**
- Implementing forces a change to `shared/src/types.ts` wire shapes, `rollOffer`/offer machinery, or any felt base-speed ≠ 15 RPM.
- A consumer is found that cannot work from the derived `sweepPeriodMs` (would force duplicated rpm→period math outside `effectiveStats`).

**Never:**
- Do not touch `shared/src/sim/offers.ts` — a 6th+ `sweepSpeed` pick clamps to a no-op (accepted interregnum quirk, `gunAmmo` precedent; legacy catalog dies in Epic 2).
- Do not edit GDD/UX docs — the GDD's "4 s revolution" stays true at 15 RPM.
- Do not change the local period literals in `client/src/__tests__/phosphor.test.ts` (4000) / `ambient.test.ts` (8000) — they test period-agnostic math, not CONFIG.
- No version bump (release bumps are separate chores).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Base | 0 sweepSpeed stacks | sweepRpm 15, sweepPeriodMs exactly 4000 | No error expected |
| Stacked | n=1..5 stacks | sweepRpm 18/21/24/27/30; sweepPeriodMs 60000/rpm | No error expected |
| Cap | 6+ stacks | identical to 5 stacks (sweepRpm 30, 2000 ms) | Clamp, never exceed 30 |
| Server sweep | 0 stacks, 20 Hz ticks | one full revolution in exactly 80 ticks (4000 ms) | — |
| Upgraded observer | 1 stack vs 0 stacks, same ticks | upgraded sweepAngle = base × (18/15) | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts:134` -- `CONFIG.vision.sweepPeriod` → `sweepRpm: 15`; `:316` `upgrades.sweepSpeed` → `{ addRpm: 3, maxRpm: 30 }` (first capped upgrade in the game).
- `shared/src/sim/stats.ts:108,173` -- `EffectiveStats` gains `sweepRpm`; `sweepPeriodMs` becomes derived. Update header comment (stacking is no longer purely mult/add-uncapped).
- `server/src/game/world.ts:1266` -- consumer of `stats.sweepPeriodMs`; NO code change (comment mentions upgrade — keep accurate).
- `client/src/main.ts:870,903` -- diffs/pushes `sweepPeriodMs`; NO code change.
- `client/src/render/radar.ts` -- period-parameterized, but its base-default initializer (`:65`) read the deleted constant → now derives `60000 / CONFIG.vision.sweepRpm` (immediately overwritten by `setRanges` with the effectiveStats value). `render/phosphor.ts` -- comment fix only (param is named `sweepPeriodMs`).
- `server/scripts/fogSmoke.mjs:32` -- headless smoke read the deleted constant (invisible to `npm run check` — smokes aren't type-checked) → now derives the base period from `sweepRpm`. Found in review; the verification grep was scoped to `*/src` and missed it.
- `client/src/__tests__/ambient.test.ts:4` -- comment referenced the deleted constant → reworded (literals untouched per intent contract).
- `client/src/render/ambient.ts:143` -- reads `CONFIG.vision.sweepPeriod` directly → derive `60000 / CONFIG.vision.sweepRpm` (comments at :10 too).
- `client/src/config.ts:244,270` -- comment references to `CONFIG.vision.sweepPeriod` → update wording.
- Tests: `shared/src/__tests__/stats.test.ts:51,87-90,234,257`; `server/src/__tests__/world.test.ts:175-182`, `goldenFrames.test.ts:37`, `perception.test.ts:43-44,1042`, `upgrades.test.ts:542-553`.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- replace `vision.sweepPeriod: 4000` with `sweepRpm: 15`; replace `upgrades.sweepSpeed: { periodMult: 0.85 }` with `{ addRpm: 3, maxRpm: 30 }`; update adjacent comments (RPM framing, cap semantics) -- source of truth moves to RPM.
- [x] `shared/src/sim/stats.ts` -- add `sweepRpm` to `EffectiveStats`; compute `sweepRpm = Math.min(CONFIG.vision.sweepRpm + u.sweepSpeed.addRpm * count, u.sweepSpeed.maxRpm)`; `sweepPeriodMs = 60000 / sweepRpm` -- RPM is the tracked stat, period the derived convenience.
- [x] `client/src/render/ambient.ts` -- derive the ambient period from `CONFIG.vision.sweepRpm` (menu radar shows base rate) -- only non-stats consumer of the raw constant.
- [x] `client/src/config.ts` -- fix the two doc-comments naming `CONFIG.vision.sweepPeriod` -- comment accuracy only.
- [x] `shared/src/__tests__/stats.test.ts` -- zero-identity asserts `sweepRpm === 15` / `sweepPeriodMs === 4000` (exact); replace the 0.85³ stacking test with additive cases (3 stacks → 24 RPM / 2500 ms) plus a cap case (6 stacks ≡ 5 stacks ≡ 30 RPM / 2000 ms); AFFECTED table: `sweepSpeed → ['sweepRpm', 'sweepPeriodMs']`; direction-sanity keeps `sweepPeriodMs` shrinking -- pins the new model.
- [x] `server/src/__tests__/world.test.ts`, `goldenFrames.test.ts`, `perception.test.ts` -- derive tick math from `60000 / CONFIG.vision.sweepRpm` instead of `CONFIG.vision.sweepPeriod`; widen the perception fuzzer's sweepSpeed range from `int(0,2)` to `int(0,5)` (exercise up to the cap) -- keeps sweep-window invariants pinned to CONFIG.
- [x] `server/src/__tests__/upgrades.test.ts` -- per-observer sweep test: expected ratio becomes `(15+3)/15` (upgraded angle = base × 18/15) replacing the `/0.85` factor -- pins server-side per-ship effective rate.

**Acceptance Criteria:**
- Given any `sweepSpeed` count n, when `effectiveStats` runs on either side, then `sweepRpm = min(15 + 3n, 30)` and `sweepPeriodMs = 60000 / sweepRpm` (matrix above), with zero-count exactly 4000 ms.
- Given the full repo, when `grep -rn "sweepPeriod\b\|periodMult" shared/src server/src client/src` runs (excluding the two decoupled test literals), then no references to the old constant/multiplier remain.
- Given `npm run check`, when it runs at repo root, then lint + type-check + all tests pass (existing 1008 plus the amended/new sweep cases).

## Spec Change Log

## Review Triage Log

### 2026-07-25 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 1, low 6)
- defer: 0
- reject: 6: (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` `server/scripts/fogSmoke.mjs:32` still read the deleted `CONFIG.vision.sweepPeriod` (PERIOD → undefined → NaN observation windows; smokes are neither type-checked nor gated by `npm run check`) — now derives `60000 / CONFIG.vision.sweepRpm`.
  - `[low]` `[patch]` `shared/src/sim/stats.ts` comments falsely claimed the "only rpm↔period conversion in the codebase" (radar.ts/ambient.ts derive the BASE period at their own edges) — reworded to scope the claim to upgraded stats.
  - `[low]` `[patch]` Spec Code Map said `radar.ts` "NO code change" while the diff necessarily edited its base-default initializer — Code Map corrected (this entry is the record).
  - `[low]` `[patch]` `constants.ts` `vision.sweepRpm` comment now warns the effectiveStats clamp caps the TOTAL (tuning base above `maxRpm` would silently clamp the un-upgraded rate).
  - `[low]` `[patch]` `server/src/__tests__/upgrades.test.ts` re-derived the expected rate ad hoc (`(rpm+addRpm)/rpm`, clamp-blind) — now reads the effectiveStats contract (`base.stats.sweepPeriodMs / up.stats.sweepPeriodMs`).
  - `[low]` `[patch]` `server/src/__tests__/world.test.ts` `ticksPerRev` unrounded (fractional loop bound on rpm retunes that don't divide 60000/SIM_DT) — wrapped in `Math.round` matching perception.test.ts.
  - `[low]` `[patch]` `client/src/__tests__/ambient.test.ts:4` comment referenced the deleted constant — reworded (test literals untouched).

Rejected (noise, adjudicated by orchestrator): "Block-If fired" claim on radar.ts (base-default CONFIG reads are the file's pre-existing pattern — sightRange/radarRange initializers do the same — and no upgraded value is re-derived); missing rpm floor clamp (counts are server-authoritative and non-negative; rpm < 15 unreachable); cap-region world-test coverage (clamp pinned at 6/20/100 stacks in stats.test.ts; fuzzer 0..5 matches spec); goldenFrames SWEEP_DELTA ulp formulation; client-side `sweepRpm` "dead weight" (RPM is the tracked stat by ruling; period is bijective and diffed); verification-grep scope meta-finding (AC lives in the read-only intent contract; the miss is recorded here and in the Code Map).

## Design Notes

- **Eric rulings (2026-07-25, this run):** track sweep in RPM; base **15 RPM** (explicitly chose "keep 15 RPM base" after being shown the code already sweeps at 4 s/rev — his "currently 8 s" premise was wrong); +3 RPM per stack; hard cap 30 RPM.
- **Cap semantics:** first stack-capped upgrade. The clamp lives in `effectiveStats()` only; offers keep proposing `sweepSpeed` even at cap (pre-rolled offers can't retro-filter without violating never-reroll; `gunAmmo` no-op precedent; catalog replaced in Epic 2).
- 60000/15 = 4000 exactly, so base gameplay, golden frames, and the ambient menu radar are bit-identical; only stacked values shift (old ×0.85 curve: 17.6/20.8/24.4/28.7/33.8 RPM → new: 18/21/24/27/30).

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc (3 workspaces) + all tests green.
- `npm test -w shared -- stats` and `npm test -w server -- upgrades` -- expected: amended sweep cases pass.
- `grep -rn "sweepPeriod\b\|periodMult" shared/src server/src client/src --include='*.ts' | grep -v phosphor.test | grep -v ambient.test` -- expected: no matches.

## Auto Run Result

**Summary:** The radar sweep stat is now tracked in RPM. `CONFIG.vision.sweepRpm: 15` replaces `sweepPeriod: 4000` (identical felt speed — 60000/15 = 4000 ms exactly; Eric ruled keep-15 after his "currently 8 s" premise was shown false), and the `sweepSpeed` upgrade went from ×0.85 period per stack (uncapped) to **+3 RPM per stack, hard-capped at 30 RPM** (18/21/24/27/30; the game's first capped stat). `effectiveStats()` exposes `sweepRpm` and derives `sweepPeriodMs = 60000/rpm`, so every consumer, the wire contract, and `PROTOCOL_VERSION` are untouched.

**Files changed:**
- `shared/src/constants.ts` — `vision.sweepRpm: 15`; `upgrades.sweepSpeed: { addRpm: 3, maxRpm: 30 }`; cap-coupling comments.
- `shared/src/sim/stats.ts` — `sweepRpm` computed+clamped (the only upgraded-stat conversion); `sweepPeriodMs` derived.
- `client/src/render/ambient.ts`, `render/radar.ts` — base-default periods derived from `sweepRpm`.
- `client/src/config.ts`, `render/phosphor.ts`, `client/src/__tests__/ambient.test.ts` — comment accuracy.
- `server/scripts/fogSmoke.mjs` — review patch: read the deleted constant (NaN windows); now derives from `sweepRpm`.
- Tests: `shared stats.test.ts` (RPM identity/additive/cap pins), `server world/goldenFrames/perception/upgrades` (RPM-derived tick math; fuzzer to 0..5; contract-read expected values).
- `_bmad-output/gds-workflow-status.yaml` — `last_updated` refreshed; `next_expected` unchanged (not a gds phase/story).

**Review:** Blind Hunter + Edge Case Hunter (session-model). 13 deduped findings → 7 patched (1 medium: fogSmoke.mjs; 6 low: comment/spec accuracy + test retune-robustness), 0 deferred, 6 rejected (adjudicated noise — see Review Triage Log). 0 intent_gap, 0 bad_spec.

**Follow-up review recommended:** false — patches were localized comment/test/script fixes; the one behavior-adjacent fix (fogSmoke) is a one-line derivation with no production surface.

**Verification:** `npm run check` green post-patches (lint 0 errors; tsc ×3 clean; tests shared 263 / server 647 / client 566 = **1476**, was 1474 — +2 new sweep pins). Repo-wide grep (`*.ts`/`*.mjs`/`*.js`, incl. `server/scripts`) shows zero stale `sweepPeriod`/`periodMult` references outside the two intentionally decoupled test literals.

**Residual risks:** none identified for production (base behavior bit-identical; only stacked upgrade values shift, old 17.6/20.8/24.4/28.7/33.8 → 18/21/24/27/30). Known accepted quirk: offers still propose `sweepSpeed` at cap (no-op pick; dies with the Epic 2 economy). fogSmoke.mjs was not executed live (requires a running server); its fix restores the exact pre-change value.
