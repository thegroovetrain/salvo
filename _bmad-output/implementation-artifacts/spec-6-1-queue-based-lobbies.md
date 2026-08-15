---
title: 'Story 6.1 — Queue-Based Lobbies'
type: 'feature'
created: '2026-08-14'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** The lobby lives inside the arena room, so every player who presses PLAY is dropped into
a live ocean and the room itself decides when to start. That makes mode a room property (blocking
6.5's Solo vs AI, which requires the arena never to fork on mode), leaves 6.6's queue-liveness
readout with no data source, and gives late arrivals a hard 45 s window after which `joinOrCreate`
silently scatters them into a fresh, empty room.

**Approach:** Put a `StandardQueueRoom` in front of the arena. It pools every waiting captain, arms a
2:00 timer at the second captain, and forms a match on timer-expiry or at cap 20 — whichever comes
first — by creating the arena room and reserving every seat at once. The arena keeps its state
machine but its own waiting/gathering phase is retired in production (the queue owns the wait); it
starts a 10 s countdown and goes live.

## Boundaries & Constraints

**Always:**
- Min 2 human captains. Nothing may start a 1-human standard match — that state has no defined
  termination rule until Story 6-3/6-5.
- Zero bot-fill. An incomplete group forms a smaller honest roster, never a padded one.
- Cap 20, enforced by `ArenaRoom.maxClients` / `CONFIG.map.playerCap`. The queue must not fork it.
- The arena never learns the mode. No `mode` string may reach `ArenaRoom`, `World`, or `Match`.
- The 2:00 timer is a hard deadline set once at arm time and never extended by later joins or
  re-joins (this closes the ledgered hostage-cycling vector, `deferred-work.md:319`).
- Queue code may use `matchMaker.createRoom` / `reserveMultipleSeatsFor` only. It may never call
  `getLocalRoomById` or hold a room instance — D8, no same-process co-residency.
- The `PROTOCOL_VERSION` gate and the JOINING-deadline guard must both exist on the queue's door.

**Block If:**
- Satisfying min-2 would require changing the win predicate or `Match.checkWin` — that is 6-3's, halt
  instead.
- The cap-20 constant would need to differ between queue and arena.

**Never:**
- No skill matching, ranked, parties, or teams. `rank`/`compare` semantics must be inert.
- No bot or drone roster fill, in any code path, behind any flag.
- No mode-select UI, no liveness chrome, no `deploySubline()` copy change — all 6.6's.
- No `SoloVsAiQueueRoom` — 6.5's.
- No change to `Match.checkWin`, results, placements, or the sinking window.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lone captain | pool = 1 | Not armed; waits indefinitely; liveness reports 1/2 and no countdown | No error |
| Arm | pool reaches 2 | `armedAtMs = now`; liveness reports a 2:00 countdown | No error |
| Timer expiry | armed, elapsed ≥ 120 s, pool ≥ 2 | Form match with everyone pooled (≤20) | No error |
| Early-arm at cap | armed, pool reaches 20 | Form immediately, ignore remaining timer | No error |
| Drop below min after arm | armed, pool falls to 1 | `armedAtMs` retained; does NOT fire at expiry; fires as soon as pool ≥ 2 again | No error |
| Re-join churn | player leaves and rejoins repeatedly | `armedAtMs` never moves — deadline cannot be extended | No error |
| Overflow | pool = 25 when forming | First 20 by join order form the match; remaining 5 stay pooled and re-arm | No error |
| Stale client | `pv !== PROTOCOL_VERSION` at queue join | Rejected at the queue door with the existing version-mismatch error | `protocolVersionError` |
| Direct arena join | `joinOrCreate('arena')`, `HC_DEV_OPTIONS` unset | Rejected in `ArenaRoom.static onAuth` | ServerError |
| Seat reservation fails | arena full / create throws | Affected clients are told and returned to the pool, not silently dropped | Reported to client |
| Client cancels | player hits CANCEL while queued | Leaves the queue cleanly; home un-busies; no reload | No error |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.match`: `countdown` 15000→10000, `joinWindow` 30000→0, new `queueTimerMs`.
- `server/src/rooms/queue.ts` -- NEW. Pure arm/form decision logic, zero Colyseus imports, fully unit-testable.
- `server/src/rooms/StandardQueueRoom.ts` -- NEW. Thin Colyseus adapter: PV gate, JOINING guard, 1 Hz tick, seat reservation.
- `server/src/rooms/ArenaRoom.ts` -- `static onAuth` additionally rejects direct joins unless `HC_DEV_OPTIONS=1` (reservation path bypasses `onAuth`, so this only ever sees the direct door).
- `server/src/rooms/roomOptions.ts` -- reuse `protocolVersionError`, `sanitizeName`/`sanitizeClassId`/`sanitizeHornId`/`sanitizeColorPref` at the queue door.
- `server/src/app.config.ts` -- register the `queue` room alongside `arena`.
- `client/src/net/connection.ts` -- two-stage connect; timeout split; `reconnection.enabled` moves to the arena room.
- `client/src/ui/home.ts` -- queue status copy + CANCEL affordance (minimum honest surface only).
- `server/scripts/matchSmoke.mjs` -- rewrite against the queue; keep the old assertions as the dev-door smoke.
- `server/scripts/queueSmoke.mjs` -- NEW. Two clients queue → seats reserved → both land in one arena → match starts.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- retime `match` and add `queueTimerMs: 120000` -- the ruled 2:00 / 10 s shape.
- [ ] `server/src/rooms/queue.ts` -- pure `queueStep()` over `{now, pooled, armedAtMs}` -- keeps the policy testable and Colyseus-free, matching the `world.ts`/`match.ts` convention.
- [ ] `server/src/__tests__/queue.test.ts` -- cover every row of the I/O matrix -- the arm/expiry/overflow rules are where this story can silently break min-2.
- [ ] `server/src/rooms/StandardQueueRoom.ts` -- adapter: PV gate, JOINING deadline, 1 Hz tick, `createRoom` + `reserveMultipleSeatsFor`, liveness + `seat` messages.
- [ ] `server/src/rooms/ArenaRoom.ts` -- close the public door in `static onAuth`.
- [ ] `server/src/app.config.ts` -- define the `queue` room.
- [ ] `client/src/net/connection.ts` -- two-stage connect, timeout split, cancel support.
- [ ] `client/src/ui/home.ts` -- queue status + CANCEL.
- [ ] `server/scripts/queueSmoke.mjs` + `matchSmoke.mjs` -- prove the flow over real sockets.

**Acceptance Criteria:**
- Given one captain queued, when 2:00 elapses, then no match forms and the queue still reports 1/2.
- Given two captains queued, when 2:00 elapses, then one arena is created, both are seated in it, and a 10 s countdown starts.
- Given a pool reaching 20, when the 20th joins, then the match forms immediately without waiting out the timer.
- Given an armed pool, when a captain leaves and rejoins repeatedly, then the deadline never moves.
- Given `HC_DEV_OPTIONS` unset, when a client calls `joinOrCreate('arena')`, then it is rejected.
- Given a stale `pv`, when the client joins the queue, then it is rejected at the queue door.
- Given a queued captain, when they press CANCEL, then they leave the queue and the home is usable again without a reload.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the arena's own waiting phase is retired rather than deleted.** Setting `joinWindow: 0` makes
`notifyRosterChanged` route straight from `waiting` to `startCountdown` — a path that already exists
and is already tested (the "legacy immediate countdown+lock" override). The `gathering` phase stays
in the state machine, unreachable in production but still covered by its own tests. Deleting it would
touch `phase.ts`, `chromeBar.ts`, `score.ts` and `settings.ts` for no behavioural gain.

**Why no `expectedCaptains` handshake.** All seats are reserved in one tick and clients consume
within ~1 s; a client that takes longer than the 10 s countdown would have lost its reservation at
15 s anyway (`DEFAULT_SEAT_RESERVATION_TIME`). Verified: a locked room still accepts a pre-reserved
seat — the join path checks `_reservedSeats` and never tests `locked` — so the countdown's `lock()`
does not strand a slow joiner.

**Why `static onAuth` is the right place to close the arena door.** `matchMaker.reserveSeatFor` calls
`_reserveSeat` directly and never invokes `callOnAuth`. So `onAuth` now runs *only* on direct
`joinOrCreate('arena')` — exactly the door being closed — and queue-routed players never touch it.
The same asymmetry is why the PV gate must be re-implemented at the queue: left only on the arena, it
would silently stop running for every real player.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green across all three workspaces.
- `HC_DEV_OPTIONS=1 node server/scripts/queueSmoke.mjs` -- expected: two clients queue, both receive a seat, both land in the same arena room id, match reaches `active`.
- `HC_DEV_OPTIONS=1 node server/scripts/matchSmoke.mjs` -- expected: green against the rewritten flow.
