---
title: 'Balance harness: every weapon stat tunable (CONFIG families + per-run tuned catalog + ladder.* steps)'
type: 'harness'
created: '2026-11-15'
status: 'done'
review_loop_iteration: 0
baseline_revision: '64d9a27c'
context: ['batch-sim-evidence-2026-11-15.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric (2026-11-15, on the balance-sim baseline): "Please modify the harness so all weapon stats can be played with. Then we can run experiments." `--tune` could not reach `lightTorpedo.*`, `supercavTorpedo.*`, `flashShells.*` or `dispersion.*`; it REFUSED `rangeUAtV` / `runUAtV`; it ACCEPTED `hullRepair.hpPerCard`, `hullRepair.reloadPerCard`, `countermeasure.reloadPerCard` / `lifeMsPerCard` and both `radiusStepPerTier` dials while they silently changed nothing (sim/catalog.ts reads them once at module load); and no per-tier authored step (torpedo speed / homing, mine blast ×1.1, star lit time, …) was reachable at all, because the catalog is deep-frozen (amendment 110).

**Approach:** harness-only. `server/scripts/batchsim/catalogTune.ts` builds one run's UNFROZEN copy of the shared CATALOG after the CONFIG tunes land, re-derives every load-time step from the live CONFIG (same formulas — an untuned CONFIG reproduces the shipped catalog exactly), applies `ladder.<line>.<stat>[.<tier>]=V` keys, and the runner hands the copy to each World through its existing `opts.catalog` injection. The shipped CATALOG and every gameplay file are untouched.

## Boundaries & Constraints

**Always:** the shipped CATALOG stays frozen and unmutated; an untuned run plays the shipped CATALOG (no copy); `ladder.*` keys are validated against real stat paths (BOON_STAT_PATH_SET) at parse time; Tier V dials floor at 1 like their Tier I siblings.

**Known limit (documented in catalogTune.ts):** bots score upgrades (ai/spending.ts) and estimate a mine's blast (ai/battery.ts) against the SHIPPED catalog — scoring is unused under `--bot-spend random`.

</intent-contract>

## Result

- Families added: `lightTorpedo.`, `supercavTorpedo.`, `flashShells.`, `dispersion.`. `rangeUAtV` / `runUAtV` are dials (floor 1). Per-card amounts and radius steps now reach the sim.
- `ladder.<line>.<stat>=V` sets every upgrade tier's step (II–V on a weapon); `.<tier>` (1–5) sets one tier; an `add` step takes V, a `mult` step V as its factor (> 0); a stat with no step gets a new `add` step.
- Tests: `catalogTune.test.ts` (11, mechanism only: expected values from CONFIG and the tune); the two `rangeUAtV` / `runUAtV` refusal tests flipped to the new behavior. End-to-end: a 1-match 16-bot CLI run with `supercavTorpedo.damage`, `ladder.lightTorpedo.speed` and `supercavTorpedo.runUAtV` completed and recorded all three in the report.
- Cycle 238, 0.19.32, PV 108 unchanged (harness only).
