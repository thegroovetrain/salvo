---
title: 'Gun cadence retune: 15 s main guns, slowing secondaries with no lock'
type: 'feature'
created: '2026-11-13'
status: 'done'
baseline_revision: '1cee4c7da9fa98e3191f6aaebb4a83e8e01fb86e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric 2026-11-13 (chat + AskUserQuestion): main guns reload too fast, and the secondaries are a 8-shots-a-second burst that locks out after 4 s. He wants slower main guns and a secondary gun that slows as it heats instead of locking.

**Approach:** `CONFIG.mainBattery.reloadMs` 10 s → 15 s (at RELOAD 100). The secondaries fire 3 shots/s cold, sliding linearly with heat to 1 shot/s at full heat; 10 s of holding reaches full heat; full heat never stops the gun; 10 s of not firing cools full heat to zero; 3 hp per shot (unchanged). The lock is deleted from the sim, the wire and the HUD.

## Boundaries & Constraints

**Always:**
- Eric's numbers are literal: main 15 000 ms; secondaries cold 3 shots/s, hot 1 shot/s, `overheatMs` 10 000, `coolMs` 10 000, damage 3. Held from cold: 20 shots in the first 10 s, 70 in the first minute, 60 every minute after.
- One shared law in `shared/src/sim/secondaries.ts`, stepped by both sides. The heat ledger stays PER ROUND so no press pattern beats holding's heat cost: the interval after a round fired at heat `h` is `1000 / (cold − (cold − hot) × h)` ms; that round adds `interval / overheatMs` heat, capped at 1; a round's own interval never cools; heat drains `1 / coolMs` per ms only outside that interval while no round fires. The due time survives a release (re-pressing never beats the rate). A held gun at full heat keeps firing at the hot rate and stays at full heat.
- Rate is exact against any tick (carry the remainder), as today.
- INSTANT RELOAD still vents heat to zero.
- `PROTOCOL_VERSION` bumps (wire shape `OwnShip.sec` loses `locked`; the client reads the changed CONFIG).
- Version, cycle, amendment and PV numbers are written as placeholders `<VERSION>`, `<CYCLE>`, `<AMENDMENT>`, `<PV>` by the implementer; the orchestrator fills them at PR time.

**Block If:** the change would need a new HUD element, new in-game copy, a new bot rule, or any number not listed above.

**Never:** change `CONFIG.bots` values (`secReleaseHeat` 0.8 / `secRepressHeat` 0.2 stay; only the `locked` reads go); change damage, reach, dispersion, hit rules or any other weapon; restyle the weapons console (the heat bar stays exactly as it draws unlocked; only the secondaries' locked look is removed); pin Eric's numbers in a test (test the law against `CONFIG`, or with a local cfg); edit `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hold from cold | held, heat 0 | first round at once; intervals lengthen with heat; heat reaches 1 after `overheatMs` of fire | none |
| Hold at full heat | held, heat 1 | one round per `1000 / hot` ms, heat stays 1, never stops | none |
| Release | not held, heat > 0, round window over | heat drains to 0 over `coolMs × heat`; rate recovers with it | none |
| Tap spam | press/release every tick | never more rounds than a hold over the same time; the due time survives release | none |
| Big step | `dtMs` spans several intervals | every due round fires, remainder carried | `dtMs ≤ 0` → 0 rounds |
| Instant Reload | heat 1 | heat 0 | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `mainBattery.reloadMs`; `secondaries` block (`rateMs` → cold/hot rates, `overheatMs`, `coolMs`) and its doc comments; `bots` heat-discipline comment
- `shared/src/sim/secondaries.ts` -- the heat law, `SecondariesState.locked`, `SecondariesHeat`, `ventSecondaries`, `secondariesHeatPerRound`
- `shared/src/types.ts` -- `OwnShip.sec` wire shape and comments (~l.366, ~l.489)
- `shared/src/index.ts` -- `PROTOCOL_VERSION`
- `server/src/game/frames.ts` (l.109), `server/src/game/world.ts` (comments ~l.674, 7198, 7528), `server/src/game/equipment/instantReload.ts` -- wire slice and vent
- `server/src/game/ai/battery.ts` (l.168–181) -- bot heat discipline reads `sec.locked`
- `client/src/sim/ownBattery.ts`, `client/src/main.ts` (l.3499), `client/src/render/console/readouts.ts` (l.553–557), `client/src/render/console/weaponsConsole.ts` (l.485, 574–590), `client/src/stage/worstCaseScene.ts` (l.538) -- client mirror and HUD lock look
- `client/src/audio/synth/cues.ts` (l.102) -- comment citing 120 ms
- `server/scripts/batchsim/overrides.ts` (l.515–517), `catalogMetrics.ts`, `server/scripts/weaponsSmoke.mjs`, `combatSmoke.mjs` -- tunable allow-list and smokes that read the old keys / lock
- Tests: `shared/src/__tests__/secondaries.test.ts`, `server/src/__tests__/{mainBattery,botTactics,botSweep,shift,upgrades,goldenFrames,frames}.test.ts`, `client/src/__tests__/{ownBattery,weaponsConsole,consoleReadouts}.test.ts`, batchsim tests

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- `mainBattery.reloadMs: 15000`; replace `secondaries.rateMs` with `coldRatePerS: 3` and `hotRatePerS: 1`, `overheatMs: 10000`, `coolMs: 10000`; rewrite the two doc blocks to the new law, dated "Eric 2026-11-13, epic-11 amendment `<AMENDMENT>`" -- the ruled numbers
- [x] `shared/src/sim/secondaries.ts` -- implement the law above; delete `locked` from state, wire slice and vent; replace `secondariesHeatPerRound` with an exported `secondariesIntervalMs(heat)`; rewrite the header -- the mechanism
- [x] `shared/src/types.ts`, `shared/src/index.ts` -- drop `locked` from `OwnShip.sec`; bump `PROTOCOL_VERSION` (write `<PV>` in comments only; the literal is current + 1) -- wire contract
- [x] `server/src/game/**` -- frames slice, vent, bot discipline without `locked`, comments -- follow the shared change
- [x] `client/src/**` -- mirror without `locked`; secondaries row is always `ready` and its heat bar always draws the unlocked look; remove the `locked` row state/skin only if nothing else uses it -- HUD follows the mechanism
- [x] `server/scripts/**` -- allow-list keys, metrics and smokes follow the renamed tunables and the missing lock -- keep tooling green
- [x] Tests -- rewrite the secondaries law tests for the matrix above (law vs `CONFIG`, no literal 3 / 1 / 10 000 pins); delete lock tests; fix every other test the change breaks; re-record golden frames only if they differ -- coverage follows the contract
- [x] `_bmad-output/implementation-artifacts/epic-11-context-amendments.md` -- append amendment `<AMENDMENT>` (ruling, Eric's quotes from this spec, the count table: 20 / 70 / 60 shots, today 204) -- durable home

**Acceptance Criteria:**
- Given a cold gun held for `overheatMs` at 50 ms ticks, when the rounds are counted, then the count equals the mean of the cold and hot rates × `overheatMs` (± 1 round) and heat is 1.
- Given heat 1 and the button held for a further minute, then rounds fire at the hot rate throughout and heat never leaves 1.
- Given any press pattern over a long window, then rounds fired never exceed what a continuous hold fires in the same window plus the cooling-earned surplus the law defines (no tap exploit: a release never fires a round earlier than its due time).
- Given a frame for the own ship, then `sec` carries `heat` only.
- Given `npm run check`, then lint, type-check and all four test suites pass.

## Spec Change Log

- 2026-11-13, review gate: both Fable hunters flagged that INSTANT RELOAD's vent kept the running round's interval (up to 1 s at full heat; it was at most 120 ms). Asked Eric (AskUserQuestion): "Fire right away". Amended: `ventSecondaries` also clears the interval. Avoids a vented gun that sits silent for up to a second. KEEP: the per-round heat ledger and the due time surviving a plain release.
- 2026-11-13, review gate: bots' 0.8 / 0.2 heat band no longer earns them anything. Asked Eric: "Leave bots as they are". No change.
- Numbers taken at PR time: cycle 232, 0.19.26, PV 106, epic-11 amendment 9.

## Review Triage Log

### 2026-11-13 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex cross-model; all three "build on it")
- intent_gap: 2 (both asked and ruled: the vent's interval; the bot band)
- bad_spec: 0
- patch: 4
- defer: 1
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Non-finite heat made the step walk endless (no lock to end it): heat is clamped, NaN reads as cold; regression test added.
  - `[low]` `[patch]` A non-finite `dtMs` passed the junk-step guard: now fires nothing; test extended.
  - `[low]` `[patch]` `weaponsSmoke.mjs` phase 7(c) could re-press on a stale full-heat frame: it waits for a cooling frame first.
  - `[low]` `[patch]` Stale comments (main battery "10 s"; "tapping buys no extra rounds") corrected.
  - `[medium]` `[intent_gap]` INSTANT RELOAD's vent: ruled "Fire right away"; implemented, shared and server tests updated (the server fixture now starts mid-interval).
  - rejected: `--tune` bounds on the two rate dials (dev tool, floor kept as the implementer documented); client/server round-phase drift (no consumer: the client spawns no rounds); the bot band's value (ruled, unchanged).

## Design Notes

Why per-round heat with a heat-dependent interval: a continuous hold then sums to exactly `overheatMs` (each round's heat is its own interval's share), and the old tap exploit (a tap fires at once but pays one tick of heat) stays closed. Bots keep their 0.8 / 0.2 release/re-press band untouched; it is reported to Eric as a consequence, not retuned.

## Verification

**Commands:**
- `npm run build -w shared && npm run check` -- expected: all green
- `node server/scripts/tickCost.mjs` -- expected: 16-hull tick no worse than development (project-context rule for shell-count changes)
- `HC_DEV_OPTIONS=1` weapons and combat smokes (`server/scripts/weaponsSmoke.mjs`, `combatSmoke.mjs`; see their headers for boot steps) -- expected: PASS
