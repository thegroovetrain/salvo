---
title: 'Ship console shows the Shift bonus: ENGINES under Speed Boost, ARMOR under Hunker'
type: 'bugfix'
created: '2026-11-15'
status: 'done'
review_loop_iteration: 0
baseline_revision: '08fbe9a2'
final_revision: '588b0945'
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** Eric (2026-11-15): pressing Speed Boost should show a temporary bonus on the ENGINES index, and pressing Hunker a temporary bonus on the ARMOR index. The server already applies both (`boostedKinematics` in `stepShips`; the damage gate adds `stats.equipment.hunker.armorBonus` while `now < hunkerUntil`), but the ship console's INDICES print the permanent fold (`stats.engines`, `stats.armor`) and never move.

**Approach:** One pure client function folds the running Shift window into the two index numbers the console prints; the live console and the hover preview both read through it, and the console memo re-reads when a window opens or closes.

## Boundaries & Constraints

**Always:**
- ENGINES while boosted = `Math.floor(engines + engines * CONFIG.boost.factor)` (ENGINES is linear in top speed, `maxSpeed = CONFIG.index.engines × ENGINES / 100`; same pinned addition order as `boostedKinematics`). ARMOR while hunkered = `armor + stats.equipment.hunker.armorBonus`. No other index changes.
- Boost active = the existing prediction-aware `boostUntilNow(g)` vs `g.clock.serverNow()`; Hunker active = `you.hunkerUntil` vs the same clock (the source `activeWindows` already reads). Only the fitted Shift's window counts.
- The hover preview (R18) compares like with like: both its current and its next readouts carry the same window state, so an open window never paints a false amber ▲/▼.
- The ladder bars (`held`), the weapon rows, the class-select pips, the loadout block and the offer card copy are untouched (the card text describes the permanent change).
- Per-frame path stays allocation-free when nothing changed (memo keyed on the fold identity plus the two window flags).

**Block If:** the change would need a new wire field, a shared `CONFIG` value, or any new colour/register on the console.

**Never:** fold the bonus into `effectiveStats()` / `EffectiveStats` (the bots read rated `kinematics.maxSpeed`; mass = ARMOR must not grow — `constants.ts` hunker note); touch server code; add a test pinning a number or a word.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Boost open | Shift = boost, window open, ENGINES 85 | ENGINES reads 106 (floor 106.25); ARMOR unchanged | — |
| Hunker open | Shift = hunker, window open, ARMOR 120 | ARMOR reads 220; ENGINES unchanged | — |
| Window closes | either window expires | value returns to the permanent fold on the next frame | — |
| No window | ready / cooling / instant reload | values identical to today | — |
| Hover during window | hunker open, hover +ARMOR card | mark ARMOR 220 → (220 + card) ▲; no mark on ENGINES | — |

</intent-contract>

## Code Map

- `client/src/render/console/readouts.ts` -- `consoleReadouts` / `indexReadouts` print the INDICES; `shipReadouts` / `hoverPreview` re-fold for the preview; `ReadoutSource` / `ReadoutShip` are the inputs.
- `client/src/main.ts` -- `consoleReadoutsNow` (memo on `ownStats`/`ownSlots`), `hoverMarksNow` (memo on line + fold), `boostUntilNow`, `activeWindows` (boost/hunker window sources).
- `client/src/__tests__/consoleReadouts.test.ts` -- existing pure tests for the readouts.
- `shared/src/sim/boost.ts` -- `boostedKinematics`, the server's per-tick boost (reference only).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/console/readouts.ts` -- add an optional `shiftWindow?: { boost: boolean; hunker: boolean }` to `ReadoutSource` and `ReadoutShip`-path; a pure exported `shiftedIndex(stats, id, window)` applies the two rules above; `indexReadouts` prints through it; `shipReadouts`/`hoverPreview` accept and pass the same window to both re-folds -- one law, both paths.
- [x] `client/src/main.ts` -- compute the window flags once per frame (boost via `boostUntilNow`, hunker via `you.hunkerUntil`, each only when that id is the fitted Shift), pass them to `consoleReadouts` and `hoverPreview`, and add both flags to the `ConsoleCache` memo keys for readouts and preview -- the console redraws exactly on open/close.
- [x] `client/src/__tests__/consoleReadouts.test.ts` -- unit tests: boost window raises ENGINES by the boost law relative to the un-windowed readout (computed from `CONFIG.boost.factor`, not a literal), hunker raises ARMOR by `armorBonus`, no window = identical readouts, other indices unchanged, hover preview during a window marks only the card's key.

**Acceptance Criteria:**
- Given a Speed Boost hull in a match, when Shift is pressed, then the console's ENGINES value rises for the window's duration and returns afterwards.
- Given a Hunker hull, when Shift is pressed, then ARMOR shows +`armorBonus` for the window and returns afterwards.
- Given `npm run check`, then lint (complexity ≤ 10), type-check and all tests pass.

## Spec Change Log

## Review Triage Log

### 2026-11-15 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1 (low 1)
- defer: 0
- reject: 9 (medium 1, low 8)
- addressed_findings:
  - `[low]` `[patch]` Fitted-Shift gate read the wire's `you.shift`; the Shift button and press prediction read `g.ownSlots[SLOT_BOOST]` — `shiftWindowNow` now reads the slot (`shiftWindowFor` takes `EquipmentId | null`).

## Design Notes

Assumption made unattended (flag in the PR): the boosted ENGINES figure is floored, following the project's integer-index convention; Eric may prefer rounding.

## Verification

**Commands:**
- `npm test -w client` -- expected: all pass incl. new readout tests
- `npm run check` -- expected: green

## Auto Run Result

- **Change:** the ship console's ENGINES index rises by the Speed Boost factor (floored) and ARMOR by Hunker's `armorBonus` while the fitted Shift's window runs; the hover preview re-folds under the same window. Client only; server untouched; PV unchanged.
- **Files:** `client/src/render/console/readouts.ts` (`ShiftWindow`, `shiftWindowFor`, `shiftedIndex`, windowed `consoleReadouts` / `shipReadouts`); `client/src/main.ts` (`shiftWindowNow`, memo keys); `client/src/__tests__/consoleReadouts.test.ts` (+6 tests).
- **Review:** Blind Hunter + Edge Case Hunter (Fable) + Codex. Codex: no bugs. 1 patch applied, 9 rejected (optimistic boost window = the Shift button's existing behaviour; slows/draft out of scope; float floor latent at factor 0.25; no main.ts harness for the memo).
- **Verification:** `npm run check` steps all green (shared 1465, server 2988, client 176 files, hooks 266; lint 0 errors; tsc x3); matchSmoke + weaponsSmoke first try.
- **PR:** #353.
- **Residual risk:** the floor-vs-round reading (epic-11 amendment 16(b)) is Eric's veto.
