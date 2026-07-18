---
title: 'Story 0.3: Server Operability Baseline'
type: 'feature'
created: '2026-07-18'
status: 'in-progress'
baseline_revision: 'f397e84a033d84c746c1cdf23bc8ba864a3b08d4'
review_loop_iteration: 0
followup_review_recommended: false
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

- [ ] `server/src/log.ts` -- implement structured logger + context helper; unit tests -- the logging substrate everything else consumes
- [ ] `shared/src/constants.ts` -- add `CONFIG.net.joiningDeadlineSeconds: 10` -- single source of truth
- [ ] `server/src/game/match.ts` -- `Participant.classId`, `activatedAt`, storm-death tally, pure `endSummary()`; pure tick-error tolerance helper (env-independent: takes tolerance + counter); unit tests -- telemetry truth stays sim-side and testable
- [ ] `server/src/metrics.ts` -- registry (ring buffer, percentiles, message rates), `matchMaker.stats.local` payload, typed `/metrics` endpoint; unit tests -- operability visibility
- [ ] `server/src/app.config.ts` -- mount `routes` -- serve the endpoint
- [ ] `server/src/rooms/ArenaRoom.ts` -- tick-error boundary + counter + dispose path, lifecycle logging with `{roomId, matchId, tick}` context, metrics feeds (tick timing, message counts, register/unregister), matchId generation, `match.end`/`match.abort` emission, JOINING-deadline kick, migrate console.warn; wiring tests via the fake-injection harness -- the adapter glue
- [ ] `server/scripts/metricsSmoke.mjs` -- real-socket smoke: stdout capture asserts `match.end` fields; `/metrics` fetched and shape-asserted -- the AC proof
- [ ] Unit-test the I/O matrix rows (tolerance reset, abort-once semantics, deadline kick vs timely join, HC_DEBUG gating)

**Acceptance Criteria:**

- Given any match lifecycle event, when it occurs, then exactly one structured `info` line with matchId/roomId/tick context reaches stdout, and a running match with HC_DEBUG unset produces zero per-tick log lines.
- Given `World.step()` throws repeatedly, when consecutive failures reach the effective tolerance (env override, else 1 dev / 3 prod), then the room logs `match.abort` and disposes while the process and any sibling room keep running (proven by test).
- Given `npm run check` and all smokes in `server/scripts/` (including the new metricsSmoke), when run, then everything passes; `grep -rn "colyseus" server/src/game/` stays empty.
- Given GET `/metrics` on a live server, then a 200 JSON body carries room/player counts, tick-duration p50/p95/max, and message rates.

## Spec Change Log

## Review Triage Log

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
