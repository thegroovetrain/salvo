---
title: '30s Join Window Before the Countdown'
type: 'feature'
created: '2026-08-02'
status: 'in-progress'
baseline_revision: 'ca8fb82726e8916afe4b45af66033ba09ccf3fab'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Playtesting friends can't get into the same match: the moment a 2nd human captain joins, the 15s countdown starts AND the room locks (`Match.notifyRosterChanged` fires `hooks.lock()` immediately), so every later friend is bounced to a fresh room with effectively zero join window.

**Approach:** Insert a new `gathering` phase between `waiting` and `countdown`: when `minHumans` is reached, the room stays **unlocked** for a 30s join window (`CONFIG.match.joinWindow`), then the existing 15s countdown arms and locks exactly as today. `joinWindowMs <= 0` collapses to the exact legacy behavior (straight to countdown + lock) so smokes/tests/batch-sim keep their fast paths.

## Boundaries & Constraints

**Always:**
- `CONFIG.match.joinWindow: 30000` (ms) in shared constants — gameplay-authoritative tunable; `MatchTimings.joinWindowMs` defaults from it; `MatchOverride.joinWindowMs` is the dev override (rides the existing `HC_DEV_OPTIONS` gate — no new gating code).
- `gathering` is a weapons-safe ready room identical to `waiting`/`countdown` policy: `damageEnabled=false`, `xpEnabled=false`, `respawnEnabled=TRUE` (add `gathering` to the `applyPolicy()` respawn disjunction or ready-room deaths become permanent).
- Room lock fires ONLY at the gathering→countdown transition; gathering→waiting cancel (humans drop below min) must NOT call `unlock()` (it was never locked). Countdown cancel path unchanged (still unlocks). Joins during gathering never reset the window timer.
- `joinWindowMs <= 0` ⇒ `waiting → countdown` synchronously in `notifyRosterChanged` (lock immediately), byte-identical to current semantics.
- New `MatchPhase` value `'gathering'` in `shared/src/types.ts` is a wire-contract change ⇒ bump `PROTOCOL_VERSION` 18 → 19.
- Reuse the existing `ArenaState.countdownEndT` schema field as the *current phase deadline* (gathering end during `gathering`, countdown end during `countdown`, 0 otherwise) — no new schema/wire field.
- Drone fill, map sizing, win checks, zone timeline: untouched (`fillToCapacity()` still runs at `activate()`).
- All player-facing gathering copy is draft copy (standing draft-copy rule; canon later).
- VERSION → 0.17.32 (cycle 32 per the 0.17.X epic-era ruling), VERSION file + root package.json; advance `_bmad-output/gds-workflow-status.yaml` `last_updated` (keep `next_expected` per its established interstitial-cycle pattern) in this same PR.

**Block If:** the implementation turns out to require changing lock/late-join semantics beyond deferring the lock (e.g. admitting joins during `countdown`/`active`), or any zone/win-logic change becomes necessary.

**Never:**
- No early-start-on-full-lobby / fill-or-timer logic — that is FR34, Epic 6 scope. Timer-only window.
- No joins after the lock (countdown/active) — the lock remains the only late-join defense.
- No new invented mechanics/balance values beyond the ratified 30s window; no design-doc edits in-story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Window opens | 2nd human joins during `waiting` (joinWindowMs=30000) | `phase='gathering'`, deadline = now+30000, room still UNLOCKED, no `lock()` call | No error |
| Friend joins in window | 3rd human joins during `gathering` | Accepted into same room; timer NOT reset; roster grows | No error |
| Window expires | now ≥ gathering deadline (in `update()`) | `phase='countdown'`, `countdownEndT=now+countdownMs`, `hooks.lock()` fires exactly once | No error |
| Cancel from gathering | human leaves, count < minHumans during `gathering` | `phase='waiting'`, deadline 0, NO `unlock()` call | No error |
| Legacy override | `joinWindowMs: 0` (smokes/batch-sim/tests) | 2nd join ⇒ immediate `countdown` + lock, exactly today's behavior | No error |
| Client in window | `matchPhase='gathering'`, deadline mirrored via `countdownEndT` | HUD: draft copy top line incl. human count (e.g. `GATHERING CAPTAINS n/20`), big center seconds, tag `WEAPONS SAFE`; no countdown tick audio (tick stays `countdown`-only) | Unknown phase on stale UI renders blank (existing fallthrough) |
| Stale client | client with `pv` 18 joins | Rejected at matchmake by `protocolVersionError` (existing gate) | Standard PV error |
| Ready-room death in window | ship sunk during `gathering` (weapons-safe = damage suppressed anyway) | respawn still enabled | No error |

</intent-contract>

## Code Map

- `shared/src/constants.ts:457` — `CONFIG.match` block; add `joinWindow: 30000`
- `shared/src/types.ts:28` — `MatchPhase` union; add `'gathering'`
- `shared/src/index.ts:119` — `PROTOCOL_VERSION` 18→19
- `server/src/game/match.ts` — state machine: `MatchTimings.joinWindowMs`, `defaultTimings()`, `notifyRosterChanged()` (`:203`), `update()` (`:235`), `applyPolicy()` (`:324` respawn disjunction), header prose spec (`:1-21`)
- `server/src/rooms/roomOptions.ts:76` — `MatchOverride.joinWindowMs?`
- `server/src/rooms/ArenaRoom.ts:378` — `timings()` mapping; `syncMatch()` (`:836`) mirrors the phase deadline into `ArenaState.countdownEndT`
- `client/src/ui/phase.ts:28` — `matchUx()` gathering branch (draft copy)
- `client/src/main.ts:690-701` — verify score-epoch edge + audio cues stay correct across waiting→gathering→countdown→active (tick cue remains `countdown`-only)
- Tests: `server/src/__tests__/match.test.ts`, `matchTelemetry.test.ts`, `roomOptions.test.ts`; `client/src/__tests__/phaseUx.test.ts`, `score.test.ts`, `settings.test.ts`
- Smokes: `server/scripts/matchSmoke.mjs`, `dronesSmoke.mjs`, `metricsSmoke.mjs`, `reconnectSmoke.mjs`; harness `server/scripts/batchsim/runner.ts:45,251`
- `VERSION`, root `package.json`, `_bmad-output/gds-workflow-status.yaml`

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` -- add `match.joinWindow: 30000` with comment -- single source of truth
- [x] `shared/src/types.ts` + `shared/src/index.ts` -- add `'gathering'` to `MatchPhase`; bump `PROTOCOL_VERSION` to 19 with log comment -- wire contract
- [x] `server/src/game/match.ts` -- gathering phase: timings field + default, `notifyRosterChanged` waiting→gathering (unlocked) with `joinWindowMs<=0` legacy shortcut, `update()` gathering-deadline→countdown(+lock), cancel path, `applyPolicy` respawn, header comment -- core behavior
- [x] `server/src/rooms/roomOptions.ts` + `server/src/rooms/ArenaRoom.ts` -- `joinWindowMs` override plumb-through; `syncMatch` deadline mirror -- dev/smoke control + client visibility
- [x] `client/src/ui/phase.ts` (+ `main.ts` only if edge predicates need it) -- gathering HUD copy (draft) with human count + big seconds -- player-facing window signal
- [x] `server/src/__tests__/match.test.ts` -- keep legacy suites green via `joinWindowMs: 0`; NEW gathering suite (open window, no-lock, timer no-reset, expiry→lock-once, cancel-no-unlock) -- pin behavior
- [x] `server/src/__tests__/matchTelemetry.test.ts` + `roomOptions.test.ts` -- helpers get `joinWindowMs: 0`; override pass-through case -- keep green + cover new field
- [x] `client/src/__tests__/phaseUx.test.ts` + `score.test.ts` (+ `settings.test.ts` if phase-looped) -- gathering copy/seconds; `canOpenElimination('gathering')===false` -- client pinning
- [x] `server/scripts/dronesSmoke.mjs`, `metricsSmoke.mjs`, `reconnectSmoke.mjs`, `server/scripts/batchsim/runner.ts` -- add `joinWindowMs: 0` -- preserve fast paths & documented budget formula
- [x] `server/scripts/matchSmoke.mjs` -- extend: small real window (~2000ms); assert `gathering` after 2nd join, 3rd client joins SAME room during window, post-window `countdown` + 4th client bounced -- prove the feature over real sockets
- [x] `VERSION` + `package.json` + `_bmad-output/gds-workflow-status.yaml` -- 0.17.32; status advance -- process rulings

**Acceptance Criteria:**
- Given two humans in a room with production CONFIG, when the second joins, then the room reports `gathering`, stays joinable for 30s, and only then runs the unchanged 15s locked countdown into `active`.
- Given a third human connecting via `joinOrCreate('arena')` during another room's gathering window, when matchmaking resolves, then they land in that same room.
- Given `joinWindowMs: 0` (dev override or harness timings), when the second human joins, then behavior is byte-identical to pre-change (immediate countdown + lock; all legacy match tests pass unmodified in assertion content).
- Given `npm run check`, when run, then lint (complexity ≤ 10), all three type-checks, and the full test suite pass.
- Given the four lifecycle smokes run with `HC_DEV_OPTIONS=1`, when executed, then all pass within their existing timeout budgets.

## Spec Change Log

## Review Triage Log

## Design Notes

- Reusing `ArenaState.countdownEndT` as "current phase deadline" avoids a schema field addition; the phase string disambiguates. Internal `Match` representation (one deadline field vs. two) is implementer's choice — the public contract is `countdownEndT` + `phase`.
- `matchUxFromRoom` passes `players.size` as the human count — safe during gathering because drones only exist after `activate()`.
- The countdown tick audio cue stays gated on `phase === 'countdown'` — the gathering window is deliberately silent; the audible tick still marks "locked, really starting".
- FR34 (Epic 6: min 2, fill-or-timer, cap 20, no bot-fill) later subsumes this window; this story adds the timer seam without prejudging fill-or-timer.

## Verification

**Commands:**
- `npm run check` -- expected: lint + tsc (shared/server/client) + full suite green
- `HC_DEV_OPTIONS=1 node server/scripts/matchSmoke.mjs` (server booted from `server/`) -- expected: PASS incl. new gathering assertions
- `HC_DEV_OPTIONS=1 node server/scripts/dronesSmoke.mjs` / `metricsSmoke.mjs` / `reconnectSmoke.mjs` -- expected: PASS within existing budgets
