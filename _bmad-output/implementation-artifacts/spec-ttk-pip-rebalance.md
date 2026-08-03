---
title: 'TTK & Objective Pip Rebalance'
type: 'feature'
created: '2026-08-03'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '412dcc79a6de508987e1ce876d4b4c0231231488'
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** TTK is far too low — the gun (25) + battleship cannon (50) = 75 ≥ the 70 HP torpedo boat, so an un-upgraded BS deletes an un-upgraded TB in ~1s. Separately, the ship-select pip cards use a *relative* scale (`value/anchorMax×5`), so pips mean nothing objective (BS shows 3 speed pips at 35 kn).

**Approach:** Eric-ruled objective pip anchors (invocation + AskUserQuestion rulings, 2026-08-03): SPEED 1 pip = 30 kn, +5 kn/pip; TOUGHNESS 1 pip = 100 HP, +25 HP/pip; TURNING 1 pip = 0.2 rad/s, +0.2/pip. Speeds (45/40/35) and turn rates (0.8/0.6/0.4) already sit exactly on scale — untouched. HP moves onto the ladder: **TB 70→125 (2 pips), ML 105→150 (3), BS 150→175 (4)**. Client pip mapper becomes anchored-linear. Batch-sim evidence legs re-run report-only.

## Boundaries & Constraints

**Always:**
- Class HP exactly 125/150/175; every other CONFIG dial (speeds, turn rates, all weapon damage, XP/deck) byte-identical.
- Drones stay 80/100/120 byte-for-byte (Eric ruling) — the small drone becomes the lightest hull on the water; guardrail tests update to pin that deliberately (max-stacked single-weapon damage 65 still < 80).
- Pip mapping is ONE pure function (`util/pips.ts`) over per-stat `{base, step}` anchors in `CLIENT_CONFIG.home.pip`; `pips = clamp(1 + round((value−base)/step), 1, 5)`.
- Values-only change: no wire-shape change, no `PROTOCOL_VERSION` bump.
- Cycle 39 → VERSION 0.17.39 (root package.json too).
- Evidence rerun is report-only: measure, write the evidence doc, change nothing from it.

**Block If:**
- The evidence rerun shows a structural break (matches stop resolving, endgame guarantee fails, harness errors) — surface, don't retune.
- Any fix seems to require touching weapon damage, drone HP, XP/deck dials, or shared sim logic beyond the three HP literals.

**Never:** No level-heal (stays filed per amendment 38 — Eric re-deferred it). No damage retunes. No design-doc edits. No dev server started.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Objective pips | 45 kn / 175 HP / 0.6 rad/s | 4 / 4 / 3 pips | No error expected |
| Below base | 25 kn (< 30 base) | 1 pip (never blank) | Clamped |
| Above top | 60 kn (> 5-pip 50) | 5 pips | Clamped |
| Degenerate anchor | step ≤ 0 or non-finite value | 1 pip | Guarded |
| TTK alpha-strike | gun 25 + cannon 50 on un-upgraded TB | 75 < 125 — TB survives | — |
| Card fills | TB / BS / ML | [4,2,4] / [2,4,2] / [3,3,3] | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.shipClasses.*.hp` literals + comments (the only sim change)
- `shared/src/__tests__/shipClasses.test.ts` -- pins class HP literals (deliberate update); drone table pins unchanged
- `shared/src/__tests__/damageGuardrail.test.ts` -- min-hull-relative; "lightest hull is the 70hp TB (drones heavier)" identity flips to small-drone-80
- `client/src/util/pips.ts` -- `pipFill` ratio formula → anchored-linear
- `client/src/config.ts` -- `CLIENT_CONFIG.home.pip` `speedMax/hpMax/turnMax` → `{base, step}` per stat
- `client/src/ui/classSelect.ts` -- threads anchors into `cardViewModel`
- `client/src/__tests__/classSelect.test.ts` -- pins pip fills per class
- `server/scripts/batchSim.mjs` -- evidence harness (lethal / pacifist / endgame legs)
- `VERSION`, `package.json` -- 0.17.38 → 0.17.39

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- set hp 125/150/175 with comments citing the objective toughness ladder (1 pip=100, +25/pip; Eric 2026-08-03) -- the TTK fix
- [x] `shared/src/__tests__/shipClasses.test.ts` -- update the three class hp pins (125/150/175); keep ordering + drone byte-for-byte pins -- deliberate identity update
- [x] `shared/src/__tests__/damageGuardrail.test.ts` -- re-pin lightest-hull identity (small drone 80 is now the floor); assert max-stacked ladders (≤65) still under it; keep all class-relative guardrails -- guardrail strengthens
- [x] `client/src/util/pips.ts` + `client/src/config.ts` -- anchored-linear `pipFill(value, {base, step})`; anchors speed {30,5}, toughness {100,25}, turning {0.2,0.2} -- pips become objective
- [x] `client/src/ui/classSelect.ts` + `client/src/__tests__/classSelect.test.ts` -- thread anchors; pins become TB [4,2,4], BS [2,4,2], ML [3,3,3]; add matrix edge cases (below-base→1, above-top→5, degenerate→1)
- [x] repo-wide -- fix any other test/smoke pinning old HP literals surfaced by `npm run check` (update pins only, never dials)
- [x] `VERSION` + root `package.json` -- 0.17.39 (cycle 39)
- [x] evidence -- SUPERSEDED by Eric mid-run ruling 2026-08-03 (skip the batch-sim rerun this cycle, credit budget): entry appended to `deferred-work.md` for a future report-only rerun; no evidence doc this cycle

**Acceptance Criteria:**
- Given an un-upgraded TB at full HP, when it takes one gun burst and one cannon burst (75 total), then it survives with 50 HP.
- Given the class-select cards, when rendered, then pip fills read TB 4/2/4, BS 2/4/2, ML 3/3/3 and derive from the objective anchors (not relative maxima).
- Given any hull incl. drones and any single weapon max-stacked to its copy cap, when it hits, then it cannot one-shot (65 < 80).
- Given `npm run check`, when run, then lint + tsc + all tests pass with no dial changed except the three HP literals.
- ~~Given the evidence rerun, when complete, then the evidence doc exists with the three legs' distributions and zero committed tuning changes.~~ (Superseded — see Spec Change Log 2026-08-03.)

## Spec Change Log

- **2026-08-03 (Eric mid-run ruling):** The batch-sim evidence rerun (task + AC above, ratified report-only in the pre-implementation questions) is SKIPPED this cycle — Eric: "skip the evidence batch sim, I'm running low on Fable credits… put it on the todo list for a future time." Recorded as a deferred-work ledger entry (2026-08-03 section). KEEP: the ruling is a deferral, not a cancellation — the rerun stays report-only with no dial changes when it lands; all other spec content unchanged.

## Review Triage Log

## Design Notes

- Rulings (Eric, 2026-08-03, AskUserQuestion): turning anchor 0.2/pip ratified; drones unchanged; level-heal deferred again; evidence rerun report-only ratified.
- Execution directive from invocation: use `/orchestrate` for implementation subagents, model per task complexity.
- Drone XP-farm pace and the 3-1 economy evidence stay anchored precisely because drone HP is untouched.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + full suite green
- `npm test -w shared` / `npm test -w client` -- expected: updated pins green
- `node server/scripts/batchSim.mjs …` (legs per 2-10/3-4 usage) -- expected: legs complete; evidence doc written
