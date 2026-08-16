---
title: 'Story 6.3 — The Participants-Only Win Check'
type: 'feature'
created: '2026-08-15'
status: 'done'
baseline_revision: 'fa3cb48'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The win check already counts captains only (5-1 amendment 4), but `ShipRecord.isDrone` does two jobs at once — "PvE fleet hull" and "not a participant" — which stop being the same set the moment Story 6.4 lands AI captains. Three shipped defects ride alongside it: a genuine draw renders in amber (identical to a loss) with no spectate case, `match.end` cannot distinguish a draw from an unfinished match, and a sealed 2-captain lobby that loses one during the countdown dumps the survivor home to re-queue from scratch.

**Approach:** Split the two readings of `isDrone` into an explicit ship-role seam so 6.4 changes one definition rather than auditing sixty call sites; give the draw its own read from a DESIGN.md token; add an outcome discriminator to `match.end` and delete the unreachable `lastHumanLeft` cause; and route a stranded survivor back into the queue pool instead of home.

## Boundaries & Constraints

**Always:** `effectiveStats()`-style single derivation — one definition of "is a participant", one of "is a fleet hull", and nothing re-deriving either ad hoc. Server `game/world.ts` and `game/match.ts` keep ZERO Colyseus imports. Complexity ≤ 10 per function (ESLint-enforced). PvE fleet hulls stay non-participants at every site they already are. The draw's RESOLUTION (latch-time `mutualDestructionWinner()`) is untouched — this story changes how it is READ, not how it is decided. Colours come from `CLIENT_CONFIG.colors` tokens sourced from DESIGN.md.

**Block If:** any change would make a 1-human standard match formable or finishable (the solo-termination rule is Story 6-5's and is explicitly NOT in scope). Any change to the sinking-window hold semantics (5-2 amendment 20, an Eric veto). Any widening of what a client can perceive.

**Never:** do not introduce a "mode" branch inside `Match` or `World` — the arena must never know the mode (6.1 AC, 6.5 AC); the participant seam is a generalization, not a fork. Do not build AI combatants or bot driving (6.4). Do not revive "start the match anyway with one captain" (amendment 15). Do not scale the map (6.2 is cancelled).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Last captain among live fleet hulls | 1 afloat captain, N afloat fleet hulls | Match finishes, that captain wins, fleet hulls get no placement and no results row | No error expected |
| Same-tick wipe of every remaining captain | 2 captains sink on one tick | `winnerId: ''`; both captains placed 1..2; `match.end` outcome reads `draw` | No error expected |
| Same-tick wipe with fleet hulls still afloat | 2 captains sink, fleet hulls afloat | Identical to above — fleet hulls never inherit the win | No error expected |
| Draw reaches the client | `ResultsMsg.winnerId === ''` | Results banner reads DRAW in the `info` token; spectate banner reads a draw case, not `MATCH OVER` | Empty rows still yield DRAW, never `UNKNOWN` |
| Sealed 2-captain cohort loses one in countdown | queue-formed room, `expectedCaptains: 2`, one leaves | Survivor is signalled, returns to the HOME SCREEN, and the client joins the next queue automatically without a PLAY press (amendment 18) | If the signal cannot be delivered, the survivor still lands home and simply waits for input — no worse than today |
| Fleet hull sinks mid-match | fleet hull reaches 0 hp | Never triggers a win check outcome, never holds the finish, never appears in results | No error expected |
| Dev/sandbox direct join | no `expectedCaptains` | Ready-room behaviour byte-identical; no requeue path taken | No error expected |

</intent-contract>

## Code Map

- `server/src/game/world.ts` -- `ShipRecord` (the `isDrone` flag, 13 sites), `addShip`, `spawnFleet`, `isFleetHull` — the seam's home
- `server/src/game/match.ts` -- `isAfloatCaptain`, `afloatCaptains`, `latchOutcome`, `mutualDestructionWinner`, `computePlacements`, `resultsMsg`, `classifyEnd`, `MatchEndCause`, `MatchEndSummary`, and the `notifyRosterChanged` collapse branch (11 sites)
- `server/src/game/bounty.ts` -- captain-only throne candidates (3 sites)
- `server/src/game/signals.ts` -- public-register `sunk` clause (2 sites)
- `server/src/game/drones.ts` -- fleet aggro suppression (3 sites)
- `server/src/rooms/ArenaRoom.ts` -- `match.end` emission, the Match hooks (incl. `disconnect`), requeue broadcast
- `server/src/rooms/StandardQueueRoom.ts` -- pool membership; front-of-pool re-entry
- `shared/src/types.ts` -- `MSG` (new requeue channel), `ResultsMsg` stale doc comment
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 36 → 37
- `client/src/net/connection.ts` -- two-stage connect; requeue re-entry without a page reload
- `client/src/ui/results.ts` -- `winnerBanner`, `makeBanner` hue
- `client/src/ui/phase.ts` -- `spectateBannerText` draw case
- `client/src/render/ships.ts` -- `isDroneHull`, the client's second predicate
- `_bmad-output/implementation-artifacts/deferred-work.md` -- stale entry at :491

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/game/world.ts` -- introduce an explicit ship role (`captain` | `fleet`, with `bot` reserved for 6.4) on `ShipRecord`; express `isFleetHull` from it -- one definition of "fleet hull"
- [ ] `server/src/game/match.ts` -- add a single exported participant predicate and route every win-check/placement/results/hold site through it -- one definition of "participant", so 6.4 changes one line
- [ ] `server/src/game/{bounty,signals,drones}.ts` -- re-point each `isDrone` read at whichever of the two predicates it actually means -- ends the conflation
- [ ] `server/src/game/match.ts` -- add an outcome discriminator to `MatchEndSummary`; delete `lastHumanLeft` from `MatchEndCause` and its classifier branch -- amendment 16
- [ ] `server/src/game/match.ts` + `server/src/rooms/ArenaRoom.ts` -- replace the collapse branch's bare `disconnect()` with a requeue signal then disconnect -- amendment 15
- [ ] `shared/src/types.ts` + `shared/src/index.ts` -- add the requeue channel; correct `ResultsMsg`'s stale draw doc comment; PV 36 → 37 -- amendment 17
- [ ] `client/src/net/connection.ts` + home/menu flow -- on the requeue signal, return home and join the next queue automatically -- amendment 18
- [ ] `server/src/rooms/StandardQueueRoom.ts` -- NOT TOUCHED (amendment 18 deleted the pool re-entry; recorded so its absence reads as deliberate)
- [ ] `client/src/ui/results.ts` + `client/src/ui/phase.ts` -- render DRAW in `CLIENT_CONFIG.colors.info`; add the spectate draw case -- amendment 14
- [ ] `client/src/render/ships.ts` -- pin the client's `isDroneHull` against the server seam with a test so the two cannot drift -- amendment 13
- [ ] tests -- cover every I/O Matrix row; update the ~30 existing `isDrone` test sites; delete the synthetic `lastHumanLeft` case
- [ ] `deferred-work.md` -- correct the stale entry at :491 (it claims drones still gate the win and that 6-3 owns solo termination; both are false)
- [ ] `sprint-status.yaml` + `gds-workflow-status.yaml` -- one-line status stamps only

**Acceptance Criteria:**
- Given a match with one afloat captain and any number of afloat fleet hulls, when the win check runs, then that captain wins and no fleet hull appears in placements or results.
- Given every remaining captain sinks on the same tick, when the outcome latches, then `winnerId` is `''`, `match.end` reports the draw explicitly, and the client renders DRAW in the `info` token on both the results and spectate surfaces.
- Given a queue-formed 2-captain room whose second captain leaves during the countdown, when the room collapses, then the survivor lands on the home screen and the client joins the next queue automatically, with no PLAY press and no page reload.
- Given the dev/sandbox direct-join door, when a match runs, then boarding, the ready room, and the win check behave exactly as they do today.
- Given the whole suite, when `npm run check` runs, then lint, type-check, and all tests pass with no complexity violations.

## Spec Change Log

- **2026-08-15 — amendment 18 supersedes amendment 15's re-entry clause (Eric).** Finding: the orchestrator surfaced that front-of-pool re-entry required either a client-asserted flag (a queue-jump exploit) or cross-room state D8 forbids assuming. Eric: *"That doesn't provide any player value. I'd rather go back to the home screen and automatically join the next queue."* Amended: the survivor lands home and the CLIENT auto-joins the next queue; `StandardQueueRoom` and `queue.ts` are not touched. Known-bad state avoided: shipping a claimable `requeued` join option that lets any client jump the queue. KEEP: the arena→client signal and `MatchHooks.requeue()` still exist — the client must tell a collapsed cohort apart from a normal match-end disconnect — so amendment 17's PV 36 → 37 stands.

## Review Triage Log

- **Pass 1 (2026-08-15) — cross-model gate: Fable adversarial + Codex, run in parallel on `fa3cb48..HEAD`.** Triage: intent_gap 0, bad_spec 0, **patch 4** (2 confirmed defects + 2 hardenings), **defer 3** (ledgered), reject 0.
  - **patch/high — the fail-closed guard was not fail-closed** (`ArenaRoom.ts` requeue hook). `String(err)` inside the catch HANDLER throws on a non-`Error` value, so the exception escaped `notifyRosterChanged` and the unconditional `disconnect()` never ran — stranding the sealed room the guard exists to protect. Codex [P2]; **Fable asserted the opposite** ("the disconnect is unconditional after it"). Orchestrator confirmed by reading. Fixed + regression test proven to fail without it.
  - **patch/high — the old room's bindings survived the in-place teardown** (`main.ts` / `roomBindings.ts`). `Game.disposers` never collected `bindRoom`, and this story deliberately added a 1000ms race on `room.leave()`, so an abandoned-but-live room could deliver late events into callbacks closed over a destroyed stage. Codex [P2]; Fable enumerated DOM/window/ticker listeners and missed the Room's own. Fixed with a real disposer verified against installed `@colyseus/sdk` 0.17.43. Surfaced a second-order hazard: the SDK's `EventEmitter.remove` corrupts the handler array on a double-remove, so disposer idempotence is load-bearing and is pinned.
  - **patch/low ×2 — hardenings.** `enterPort` moved inside `requeueToPort`'s try (the one chain step with no terminal fallback); `hideBanner()` on every entry to port (a failed re-queue could sit under a stale RECONNECTING banner).
  - **defer ×3 → `deferred-work.md`.** A sealed room whose second captain never boards has no escape (collapse fires only from `countdown`); the spectate banner has no hue channel at all so the draw is distinguished there by copy alone (pre-existing); and `isParticipant` is permanently `!isFleetHull`, so the seam's only divergence point is `isHuman` with exactly two readers — 6.4 audits two sites, not sixty.
  - **Fable CONFIRMED, non-code, merge-blocking:** three spec task-list items (ledger correction + both tracker stamps) were undone. All completed in `e369491`.
  - **Held under attack, no defects found:** the client teardown leak hunt, the ~62 predicate re-pointings, the double-join/double-teardown guards, the `WinTrigger` deletion, and the draw path. `queue.ts`/`StandardQueueRoom.ts` verified byte-identical (amendment 18). `RequeueMsg` carries no world state — the master perception invariant still has exactly six exceptions.

## Design Notes

**Why the seam is built now, with no consumer.** Recorded as an Eric override (amendment 13): the orchestrator recommended deferring it to 6.4/6.5 where an AI captain would prove the shape. Eric chose to build it now. The value is that `isDrone`'s two meanings are separated *before* they diverge, so Story 6.4 adds a role rather than auditing sixty sites.

**The two predicates are not complements.** "Fleet hull" is about economy/presentation (XP tier, kill-feed suppression, bounty exclusion, greyscale nameplates, fleet aggro). "Participant" is about the match outcome (win check, placements, results rows, the sinking hold). Today `fleet ⇔ non-participant`; after 6.4 a bot is a participant that is not a captain. Each existing `isDrone` read must be re-pointed at what it *meant*, not mechanically renamed.

**Why the survivor goes home rather than back into the pool** (amendment 18, superseding 15): front-of-pool needed either a client-asserted flag (a trivial queue-jump exploit) or cross-room state that D8 forbids assuming — and was worth almost nothing anyway, since this path is only reachable from a 2-captain lobby, so the pool is nearly always empty. Eric's replacement keeps the player-facing promise (no menu trip paid for someone else's disconnect) and drops the mechanism that could not be secured. `StandardQueueRoom` and `queue.ts` are therefore byte-identical. The 2:00 clock still restarts: `armedAtMs` is a cohort property that forming deliberately clears (amendment 3's hostage-cycling fix), and no ruling ever promised otherwise.

**Draw hue.** `CLIENT_CONFIG.colors.info` (`#38BDF8`) — DESIGN.md's "informational/waiting states (kept semantic)". Phosphor means victory and amber means warning/loss, so neither can carry a draw.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + full suite green (4309+ tests)
- `npm test -w server` -- expected: match, drones, sinkingWindow, matchTelemetry, boarding, queue suites green
- `node server/scripts/matchSmoke.mjs` -- expected: full lifecycle to results (known-flaky per ledger; a single failure is inconclusive)
- `node server/scripts/queueSmoke.mjs` -- expected: queue → seat → arena, plus the requeue path
