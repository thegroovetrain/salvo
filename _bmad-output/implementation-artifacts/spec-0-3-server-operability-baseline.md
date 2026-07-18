---
title: 'Story 0.3: Server Operability Baseline'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_revision: 'f397e84a033d84c746c1cdf23bc8ba864a3b08d4'
final_revision: '57533ed2a8c95c15ff293d9affeb15662495da7e'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md',
  ]
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The server is a black box: one stray `console.warn` is the entire logging story, an exception inside `World.step()` unwinds `ArenaRoom.update()` and silently kills the tick for every room sharing the process, and there is no way to ask a running server how it's doing. A dead match under traffic is a shrug, not a bug report.

**Approach:** Add a structured stdout logger (`server/src/log.ts`, `level event {fields}` lines with matchId/roomId/tick context), emit `match.end`/`match.abort` telemetry from pure Match-side aggregation, wrap the room's tick boundary in an error catcher that disposes the room gracefully at `HC_TICK_ERROR_TOLERANCE` consecutive failures while the process and other rooms survive, and serve `/metrics` (room/player counts, tick-duration p50/p95/max, message rates) via a Colyseus 0.17 typed HTTP route fed by a process-local aggregator (`server/src/metrics.ts`). Pick up the deferred JOINING-deadline kick riding the same room plumbing.

## Boundaries & Constraints

**Always:**

- `World` and `Match` keep ZERO Colyseus imports. Telemetry aggregation is pure Match/World-side data (`Participant` gains `classId`; Match gains `activatedAt`, a storm-death tally, and a pure end-summary method); ONLY the room/adapter layer calls the logger and metrics registry.
- Log format: one line per event, `level event {json-fields}`, stdout only, no files, no third-party log/metrics libs (no pino, no prom-client). Every room-scoped line carries `roomId`, `matchId` (once one exists), and `tick`. Zero PII: never log player names or session ids in telemetry lines.
- Hot-path law: nothing logs inside per-tick/per-frame loops except throttled aggregates. The once-per-second tick-duration summary is `debug` level, gated by `HC_DEBUG=1` [autonomous ruling — always-on visibility comes from `/metrics`]. `info` is reserved for match lifecycle events (create/activate/end/abort/dispose, join/leave/drop/resume).
- `match.end` carries `{matchId, mode, rosterSize, rosterByClass, durationS, winnerClass, killsByClass, stormDeaths}`; `match.abort` carries `{matchId, reason, tick}`. `mode` is the constant `'arena'` and `matchId` is room-generated (`generateId()` from colyseus, adapter-side) [autonomous rulings — no mode/matchId concept exists yet]. Storm deaths = sunk events with `by === undefined` (the only killer-less sink path, world.ts:507).
- `match.abort` fires when a match that reached `active` terminates without `finish()`: tick-error dispose (`reason: 'tick-error'`) and room disposal with the match still active (`reason: 'abandoned'`). Normal wins keep emitting `match.end` only.
- Tick-error containment: try/catch around the step body in `ArenaRoom.update()` (world.step + match.update + afterStep, :315–320); a consecutive-failure counter resets on any clean tick; at tolerance, log `error` + `match.abort`, then `this.disconnect()` (existing dispose path — the client's `handleRoomLeave` already shows the DISCONNECTED banner and returns to menu; zero client changes). Tolerance = `HC_TICK_ERROR_TOLERANCE` env override, defaulting to 1 when `NODE_ENV !== 'production'`, 3 in production. The decision logic must be a pure, unit-testable helper.
- `/metrics` is a typed route (`createEndpoint`/`routes` option per the epic tech decision) returning JSON: `{rooms, players}` from `matchMaker.stats.local`, tick-duration `{p50, p95, max}` ms and inbound message rate from a process-local registry in `metrics.ts` that rooms feed (tick timings from `update()`, message counts from the two `onMessage` handlers) and unregister from on dispose. If the installed typed-routes API proves materially broken when wired, fall back to `app.get` in the existing `initializeExpress` block and record the ruling.
- JOINING-deadline kick [deferred-work pickup homed here by story 0.2]: arm a `this.clock` deadline per client when it appears still-JOINING; a client not `ClientState.JOINED` when the deadline fires is kicked (`client.leave`), freeing the roster slot and the unbounded `_enqueuedMessages` buffer. Deadline is CONFIG-declared under `CONFIG.net` [autonomous ruling: `joiningDeadlineSeconds = 10`].
- Migrate the existing `console.warn` (ArenaRoom.ts:100) to the logger. No single-process assumptions in `metrics.ts` beyond "this process's rooms" (`stats.local` is explicitly process-local).
- Process hygiene: boot temp servers only on verified-free ports; kill everything you start; never kill a listener you didn't start.

**Block If:**

- Containment can't hold: a thrown `World.step()` provably corrupts shared/global state such that disposing the room can't protect sibling rooms in the process.
- Feeding metrics or telemetry requires adding Colyseus imports or I/O to `world.ts`/`match.ts`.

**Never:**

- No Prometheus/OpenMetrics exposition format (JSON body) [autonomous ruling]; no auth on `/metrics` at beta (no secrets in payload); no dashboards.
- No client-side changes (the existing room-close path already delivers banner → menu); no wire-contract change, no `PROTOCOL_VERSION` bump, no schema fields.
- No gameplay/balance changes; no matchSmoke timing/geometry hardening (stays in deferred-work); no Redis/multi-process stats fan-out (`stats.fetchAll`), no Render autoscaling work; no event bus — telemetry aggregates through the existing tick order and hooks.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Match ends normally | Win check fires `finish()` | One `info match.end` line with all 8 fields; roster fields count all combatants (drones included), winnerClass from winner's classId | No error |
| Tick error, dev tolerance | `World.step()` throws, `NODE_ENV` ≠ production, no override | `error tick.error` with context; 1st consecutive failure hits tolerance → `match.abort {reason:'tick-error'}` → room disconnects; process + other rooms keep ticking | Contained at tick boundary |
| Tick errors below tolerance | Prod tolerance 3, two failures then a clean tick | Two `error` lines, counter resets, room lives, no abort | Contained |
| Abandoned active match | Room disposes mid-`active` (all leavers past grace) without finish() | `match.abort {reason:'abandoned'}` exactly once; a finished match never emits abort | No error |
| /metrics idle | GET with no rooms | 200 JSON, zero counts, null/zero percentiles | No error |
| /metrics live | GET during an active match | 200 JSON: rooms/players ≥ 1, tick p50/p95/max > 0, message rate reflects traffic | No error |
| Client stuck JOINING | Seat taken, join confirmation never sent, deadline passes | Client kicked, slot freed; a client that reaches JOINED in time is never kicked | Clean `client.leave` |
| HC_DEBUG unset | Normal ticking | No per-tick/per-second lines at all; info only on lifecycle events | No error |

</intent-contract>

## Code Map

- `server/src/log.ts` -- NEW: structured logger (`info/warn/error` always, `debug` gated by `HC_DEBUG=1`), `level event {json}` single-line format, child-context helper for `{roomId, matchId, tick}`
- `server/src/metrics.ts` -- NEW: process-local registry (room register/unregister, tick-duration ring buffer + percentiles, message counters/rates) + `/metrics` typed endpoint (`createEndpoint` from colyseus) + payload assembly using `matchMaker.stats.local`
- `server/src/app.config.ts:15-24` -- wire `routes` into `config({...})` alongside existing `initializeExpress` (`/health` stays); `isProd` already defined here
- `server/src/rooms/ArenaRoom.ts:90-136,313-336` -- onCreate: matchId, logger context, metrics registration, JOINING-deadline arming; update(): try/catch boundary + failure counter + tick timing feed; onMessage handlers: message counting; onJoin/onLeave/onDrop/teardown/results: lifecycle info lines; onDispose: abort-if-active + metrics unregister; migrate :100 console.warn
- `server/src/game/match.ts:86-91,166-181,183-226` -- `Participant.classId`; `activatedAt` in `activate()`; storm-death tally in `consumeSinks()` (`by === undefined`); pure `endSummary()` returning telemetry fields (room adds matchId/mode); pure tick-error tolerance helper can live here or a sibling pure module
- `server/src/game/world.ts:66-129,429,500-510` -- read-only reference: `ShipRecord.classId/kills`, `tick`, storm sink with `by: undefined`; no changes expected
- `shared/src/constants.ts:198-212` -- `CONFIG.net.joiningDeadlineSeconds: 10` with derivation comment
- `server/src/__tests__/` -- NEW log.test.ts, metrics.test.ts (percentiles, rates, registry), tick-error policy tests, match telemetry tests (endSummary aggregates incl. storm deaths), room wiring tests following the reconnect.test.ts fake-injection harness (:45-73)
- `server/scripts/metricsSmoke.mjs` -- NEW smoke: boot real server (reconnectSmoke.mjs:55-66 pattern), capture stdout, drive a short dev-options match, assert `/metrics` payload shape + a `match.end` line with all fields
- `server/src/rooms/roomOptions.ts` -- read-only: confirm no interference with deadline kick

## Tasks & Acceptance

**Execution:**

- [x] `server/src/log.ts` -- implement structured logger + context helper; unit tests -- the logging substrate everything else consumes
- [x] `shared/src/constants.ts` -- add `CONFIG.net.joiningDeadlineSeconds: 10` -- single source of truth
- [x] `server/src/game/match.ts` -- `Participant.classId`, `activatedAt`, storm-death tally, pure `endSummary()`; pure tick-error tolerance helper (env-independent: takes tolerance + counter); unit tests -- telemetry truth stays sim-side and testable
- [x] `server/src/metrics.ts` -- registry (ring buffer, percentiles, message rates), `matchMaker.stats.local` payload, typed `/metrics` endpoint; unit tests -- operability visibility
- [x] `server/src/app.config.ts` -- mount `routes` -- serve the endpoint
- [x] `server/src/rooms/ArenaRoom.ts` -- tick-error boundary + counter + dispose path, lifecycle logging with `{roomId, matchId, tick}` context, metrics feeds (tick timing, message counts, register/unregister), matchId generation, `match.end`/`match.abort` emission, JOINING-deadline kick, migrate console.warn; wiring tests via the fake-injection harness -- the adapter glue
- [x] `server/scripts/metricsSmoke.mjs` -- real-socket smoke: stdout capture asserts `match.end` fields; `/metrics` fetched and shape-asserted -- the AC proof
- [x] Unit-test the I/O matrix rows (tolerance reset, abort-once semantics, deadline kick vs timely join, HC_DEBUG gating)

**Acceptance Criteria:**

- Given any match lifecycle event, when it occurs, then exactly one structured `info` line with matchId/roomId/tick context reaches stdout, and a running match with HC_DEBUG unset produces zero per-tick log lines.
- Given `World.step()` throws repeatedly, when consecutive failures reach the effective tolerance (env override, else 1 dev / 3 prod), then the room logs `match.abort` and disposes while the process and any sibling room keep running (proven by test).
- Given `npm run check` and all smokes in `server/scripts/` (including the new metricsSmoke), when run, then everything passes; `grep -rn "colyseus" server/src/game/` stays empty.
- Given GET `/metrics` on a live server, then a 200 JSON body carries room/player counts, tick-duration p50/p95/max, and message rates.

## Spec Change Log

## Review Triage Log

### 2026-07-18 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)

- intent_gap: 0
- bad_spec: 0
- patch: 13: (high 1, medium 3, low 9)
- defer: 1: (high 0, medium 1, low 0)
- reject: 1
- addressed_findings:
  - `[high]` `[patch]` The containment boundary could itself be escaped: `onTickError` used `String(err)`, which throws on prototype-less values, and the resulting TypeError propagated through `update()` into core's bare setInterval — killing the whole process, the exact outcome the boundary exists to prevent (Edge Case Hunter, CONFIRMED) → `describeError()` (Error → message + stack field, non-Error → guarded String → 'unstringifiable') + belt-and-braces catch around the whole handler that still aborts+disconnects without logging; regression test throws `Object.create(null)` from world.step
  - `[medium]` `[patch]` The JOINING-deadline kick missed the story-0.2 resume handshake — core's reconnection branch pushes the new client into `this.clients` in JOINING without calling onJoin, so a resumed client that never acks squats indefinitely, reopening the exact vector the feature closes (Blind Hunter AND Edge Case Hunter independently, CONFIRMED in installed core) → deadline now also armed at the `allowReconnection(...).then` resolution; kicked/never-kicked regression tests
  - `[medium]` `[patch]` "Consecutive" failures counted accumulator-loop iterations, so prod tolerance 3 could be consumed inside one ≥150ms interval fire with zero real time between retries (both hunters) → a caught failure stops the drain and resets the accumulator; one increment max per interval fire, tested
  - `[medium]` `[patch]` `match.abort {reason:'tick-error'}` fired whenever a Match existed, including waiting/countdown — spec scopes abort to matches that reached active (Edge Case Hunter, CONFIRMED) → emission gated on `phase === 'active'`, tested at waiting/countdown
  - `[low]` `[patch]` `messages.total` documented "since process start" but shrank to 0 as rooms disposed (both hunters, CONFIRMED) → retired-total fold on unregister; monotonic, tested
  - `[low]` `[patch]` `ratePerSec` averaged only ACTIVE seconds — a single 300-message burst in an idle minute read as 300/s → rate = window sum / covered seconds (min 60), sparse-burst test
  - `[low]` `[patch]` Metrics registry entry leaked forever if onCreate threw after registerRoom (dispose listener attaches only post-onCreate) → onCreate remainder wrapped, unregister-on-throw, tested
  - `[low]` `[patch]` Wall-clock (`Date.now`) bucket keying stalled the rate window and debug summary on NTP backward steps → monotonic performance.now-derived seconds source (test-injectable)
  - `[low]` `[patch]` `HC_TICK_ERROR_TOLERANCE=1e9` disabled containment and unthrottled tick.error to 20Hz → valid values clamped to [1,100]
  - `[low]` `[patch]` Non-hold drops and leaves never logged their close code — the datum distinguishing punitive kicks from organic leaves → `code: code ?? null` on client.drop and client.leave lines
  - `[low]` `[patch]` `match.activate` logged from the transition-start hook, so a mid-activation throw left a false lifecycle line on stdout (Codex) → one-shot post-transition phase observation; nothing claimed if activation throws
  - `[low]` `[patch]` `createLogger(...).debug` paid merge + dynamic() before the HC_DEBUG gate (comment claimed otherwise) → gate first, then merge; dynamic-spy test; stale comment fixed
  - `[low]` `[patch]` metricsSmoke's `p50 > 0` assertion was one fast machine away from a false flake (round2 floors <0.005ms) → asserts samples/max > 0 and p95 ≥ p50 ≥ 0
- Deferred: the `'abandoned'` abort is unreachable through any real flow — every dispose path funnels the leave cascade into `finish()` first, so quit-out matches land in telemetry as `match.end` with a "winner" (live-proven by the smoke's own choreography); how abandonment should be classified in balance data is a game-design decision for Eric → deferred-work.md.
- Rejected (verified compliant): sessionId in client lifecycle lines (flagged by Blind Hunter and Codex) — the spec's zero-PII constraint explicitly scopes to telemetry lines (`match.end`/`match.abort`, which are clean); sessionIds are ephemeral transport ids required for drop/resume forensics. Ruling: lifecycle lines keep sessionId; telemetry lines never carry it.

## Design Notes

- **Telemetry split:** Match owns the pure aggregation (`endSummary()`), the room owns identity (`matchId`, `roomId`, `mode`) and emission. This keeps `grep colyseus server/src/game/` empty and the numbers unit-testable without a room.
- **Abort-once discipline:** `finish()` and abort paths are mutually exclusive; guard so a tick-error dispose after a finished match emits nothing, mirroring 0.2's teardown-once discipline.
- **Tick timing home:** measure around the whole step body (world.step + match.update + afterStep) in `update()` — that's the operator-meaningful "tick budget", and it needs no World changes.
- **matchSmoke flake note:** matchSmoke keeps its documented pre-existing flakiness; it is not a regression signal for this story and its hardening stays in deferred-work.
- **Autonomous rulings for Eric's morning review:** `mode: 'arena'` constant; room-generated matchId via colyseus `generateId()`; tick summary at debug level (HC_DEBUG) with `/metrics` as the always-on surface; JSON (not Prometheus) payload; unauthenticated `/metrics` at beta; `joiningDeadlineSeconds = 10`; JOINING-deadline kick pulled in from deferred-work (its afterStep-guard half shipped in 0.2).

## Verification

**Commands:**

- `npm run check` -- expected: lint + tsc + all tests green, all three workspaces
- `node server/scripts/metricsSmoke.mjs` -- expected: match.end line with all 8 fields on captured stdout; /metrics 200 with counts, percentiles, rates
- `node server/scripts/reconnectSmoke.mjs` + remaining smokes vs self-owned `HC_DEV_OPTIONS=1` server -- expected: no regressions (matchSmoke keeps its pre-existing flake caveat)
- `grep -rn "colyseus" server/src/game/` -- expected: no matches
- `HC_DEBUG=1` boot + short match -- expected: once-per-second tick summaries appear; without it, none

## Auto Run Result

**Status:** done (2026-07-18)

**Summary:** The server is no longer a black box. Every match lifecycle event now emits one structured stdout line (`level event {json}`, all carrying roomId/matchId/tick via `server/src/log.ts`); `match.end` carries the full 8-field telemetry contract ({matchId, mode:'arena', rosterSize, rosterByClass, durationS, winnerClass, killsByClass, stormDeaths} — aggregated purely in Match, identity added room-side) and `match.abort {matchId, reason, tick}` covers tick-error and defensive abandoned disposal. An exception inside the sim step no longer kills the process: the tick boundary catches it, counts consecutive failures per interval fire, and at `HC_TICK_ERROR_TOLERANCE` (clamped [1,100]; default 1 dev / 3 prod) disposes just that room — players land on the existing DISCONNECTED-banner → menu path with zero client changes, and the error handler itself is throw-proof (proven with a prototype-less thrown value). `/metrics` is a Colyseus 0.17 typed route returning room/player counts (`matchMaker.stats.local`), tick-duration p50/p95/max from per-room ring buffers, and monotonic message totals/rates. The deferred-work JOINING-deadline kick shipped riding the same plumbing (`CONFIG.net.joiningDeadlineSeconds = 10`, fire-time JOINED check, punitive 4002 close so no grace) and — after the review gate caught the gap — also covers the story-0.2 resume handshake. HC_DEBUG=1 adds once-per-second tick.summary debug lines; without it a running match logs nothing per tick.

**Files changed:** NEW `server/src/log.ts` (structured logger + context factory), `server/src/metrics.ts` (registry + typed /metrics endpoint), `server/scripts/metricsSmoke.mjs` (real-socket AC proof), `server/src/__tests__/log.test.ts` + `metrics.test.ts` + `matchTelemetry.test.ts` + `operability.test.ts`; MODIFIED `server/src/rooms/ArenaRoom.ts` (tick-error boundary, lifecycle logging, telemetry emission, metrics feeds, matchId, JOINING kick incl. resume path), `server/src/game/match.ts` (Participant.classId, activatedAt, storm-death tally, pure endSummary()/tolerance helpers — still zero Colyseus imports), `server/src/app.config.ts` (routes mount), `shared/src/constants.ts` (CONFIG.net.joiningDeadlineSeconds).

**Review findings breakdown:** three parallel reviewers (Blind Hunter, Edge Case Hunter, Codex cross-model). 13 patches applied (1 high: the containment handler itself could throw and kill the process; 3 medium: JOINING kick missed the 0.2 resume path [flagged independently by both hunters], tolerance consumable in one interval fire, tick-error abort unscoped by phase; 9 low), 1 deferred ('abandoned' abort unreachable — quit-out matches telemetered as match.end with a winner; classification is a design decision for Eric, logged in deferred-work.md), 1 rejected with recorded ruling (sessionId in lifecycle lines is compliant — the zero-PII constraint scopes to telemetry lines, which are clean). No intent gaps, no bad_spec loopbacks. Every patch carries a regression test demonstrated to fail without its fix.

**Verification performed:** `npm run check` exit 0 — 759 tests green (129 shared + 349 server + 281 client; +74 over baseline), lint + tsc clean all workspaces. metricsSmoke passes over real sockets twice pre-fix and again post-fix (idle + live /metrics shapes, one match.end with all 8 fields on captured stdout, lifecycle lines carrying roomId/matchId/tick, zero debug lines with HC_DEBUG unset, no port leaks). HC_DEBUG=1 boot emits `debug tick.summary` with full context. All other smokes green with verified exit codes (smoke, combat, weapons, fog, prediction vs self-owned :2611; zone, drones, reconnect self-booting) — fogSmoke flaked once on "park in radar band" timing, then passed twice consecutively. reconnectSmoke green post-fix with zero false JOINING-kicks on resume. matchSmoke failed twice ("A sinking B" timeout, "suppressed torpedo impact") — the documented pre-existing flake reproduced on pristine baselines during stories 0.1/0.2; not a 0.3 regression signal. `grep -rn colyseus server/src/game/` clean.

**Residual risks:** (1) quit-out matches read as completed matches with winners in match.end until Eric rules on abandonment classification (deferred); (2) prod tolerance 3 rides out only faults transient across interval fires — a persistent fault aborts within ~3 fires by design; (3) matchSmoke remains an unreliable regression signal until hardened (deferred since 0.1); (4) `/metrics` is unauthenticated JSON at beta (no secrets in payload — revisit before public traffic if desired).

**Autonomous rulings for Eric's review:** `mode: 'arena'` constant (no mode concept exists yet); room-generated matchId via colyseus `generateId()`; tick summaries at debug level behind HC_DEBUG with /metrics as the always-on surface; JSON (not Prometheus) payload, unauthenticated at beta; `joiningDeadlineSeconds = 10`; JOINING-deadline kick pulled forward from deferred-work incl. the resume path; sessionId kept in operational lifecycle lines (never in telemetry); tolerance clamped to [1,100]; ratePerSec = window sum / covered seconds.
