---
title: '30s Join Window Before the Countdown'
type: 'feature'
created: '2026-08-02'
status: 'in-review'
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

### 2026-08-02 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 1, low 9)
- defer: 1: (high 0, medium 1, low 0)
- reject: 6
- addressed_findings:
  - `[medium]` `[patch]` CLAUDE.md still described the pre-change lifecycle ("Countdown arms at 2 human captains", waiting/countdown phase lists ×3) — all three sites updated to the gathering model
  - `[low]` `[patch]` `ArenaState.matchPhase` docstring still enumerated the old four phases — added `'gathering'`
  - `[low]` `[patch]` gathering HUD copy `GATHERING CAPTAINS n/${fillTo}` used the drone-inclusive denominator (read as a failed gather) — draft copy now `GATHERING CAPTAINS — n ABOARD`, test updated
  - `[low]` `[patch]` `matchSmoke` post-expiry assertion `countdownEndT > 0` was tautological (already true during gathering) — now asserts the deadline moved past the captured gathering deadline
  - `[low]` `[patch]` `matchSmoke` 2000ms window left thin margin for sleep(500)+join round-trips on slow CI — raised to 5000ms with rationale comment
  - `[low]` `[patch]` `<= 0` legacy contract only tested at exactly 0 — added a `joinWindowMs: -1` legacy-path unit test
  - `[low]` `[patch]` degenerate dev timings (`countdownMs <= 0` + real window) could cascade gathering→countdown→active in one `update()`, never syncing `'countdown'` — early return after `startCountdown()` guarantees one synced tick
  - `[low]` `[patch]` gathering's silent final-5s (vs countdown's tick cue) was undocumented at the gate — comment in `tones.ts` records the deliberate design
  - `[low]` `[patch]` `canAbandon` docstring rationale didn't know `gathering` exists — extended
  - `[low]` `[patch]` `CONFIG.match.joinWindow` carried no ruling attribution unlike neighboring tunables — comment cites the Eric ruling 2026-08-02
  - Deferred: leave/rejoin cycling now reopens fresh 30s windows (pre-existing hostage vector, scaled up; mitigation needs an Eric design ruling) → deferred-work.md
  - Rejected (6): full-room-skips-window (explicit spec Never — FR34/Epic 6 fill-or-timer scope); 45s unconditional start (Eric's ratified 30s+15s design); `matchOverride` value-type sanitization hole (pre-existing pattern, `HC_DEV_OPTIONS`-gated, unreachable in production); seat-reservation-vs-lock race (pre-existing engine-level race, `finish()` P2 backfill already defends); reviewed-diff-excludes-lockfile/spec (deliberate workflow exclusions); PV-19 comment overstating the config leg (welcome snapshot does change shape — claim accurate)

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

## Auto Run Result

**Summary:** Added a 30s unlocked join window (`gathering` phase) between `waiting` and the 15s locked `countdown`, so playtesting friends can pile into the same room instead of being bounced the instant a 2nd captain joins. `CONFIG.match.joinWindow = 30000` (Eric ruling 2026-08-02); `joinWindowMs <= 0` (dev override/harness timings) collapses synchronously to the exact legacy immediate-countdown+lock behavior. New `MatchPhase` value ⇒ `PROTOCOL_VERSION` 18→19; `ArenaState.countdownEndT` redefined as the current-phase deadline (no new schema field). VERSION 0.17.32 (cycle 32).

**Files changed:**
- `shared/src/constants.ts` — `match.joinWindow: 30000` tunable (ruling-attributed)
- `shared/src/types.ts` / `shared/src/index.ts` — `MatchPhase` + `'gathering'`; PV 19 with log entry
- `server/src/game/match.ts` — gathering state: `openGathering()`/`startCountdown()` (single lock site), `<=0` legacy shortcut, cancel-without-unlock, respawn policy, one-synced-tick guard, header spec
- `server/src/rooms/roomOptions.ts` / `ArenaRoom.ts` / `schema/ArenaState.ts` — `joinWindowMs` dev override plumb-through; deadline-mirror + phase docs
- `client/src/ui/phase.ts` — gathering HUD (draft copy `GATHERING CAPTAINS — n ABOARD`, big window seconds, WEAPONS SAFE)
- `client/src/ui/settings.ts` / `client/src/audio/tones.ts` — comment contracts (abandon rationale; deliberate gathering silence)
- Tests: `match.test.ts` (+7 gathering/legacy-negative), `matchTelemetry`, `roomOptions`, `drones`, `reconnect`, `denials`, `barrel`, `batchSim`, `phaseUx` (+2), `score`, `settings`
- Smokes/harness: `matchSmoke.mjs` (real 5s window proving same-room join + post-expiry lock over sockets), `dronesSmoke`/`metricsSmoke`/`reconnectSmoke` (+`joinWindowMs: 0`), `batchsim/runner.ts` (0 + rationale)
- Process: `VERSION`/`package.json` 0.17.32, `package-lock.json` version sync, `gds-workflow-status.yaml` last_updated, `CLAUDE.md` lifecycle prose ×3

**Review findings:** 10 patched (1 medium, 9 low — docs/comments, HUD denominator, smoke flake margin + tautological assertion, negative-override test, degenerate-timing sync guard), 1 deferred (leave/rejoin fresh-window cycling → deferred-work.md, needs an Eric design ruling), 6 rejected (incl. full-room early-arm = FR34/Epic 6 scope; 45s start = the ratified design).

**Verification:** `npm run check` exit 0 (0 lint errors; 379+816+1205 = 2400 tests green, was 2391 at baseline). All four lifecycle smokes PASS over real sockets (`matchSmoke` twice — pre- and post-patch — proving gathering same-room join, window-expiry lock, weapons-safe window, full loop to results; `dronesSmoke`, `metricsSmoke`, `reconnectSmoke` on the `joinWindowMs: 0` fast path). The seven sandbox smokes construct no Match and are unaffected.

**Residual risks:** production 30s+15s pre-match length is by design but unmeasured with real humans (first playtest will tell); the deferred leave/rejoin window-cycling vector; stale clients (pv ≤ 18) are cleanly rejected at matchmake — players must refresh after deploy.
