---
title: 'Story 6-6 — Mode Select & Queue Liveness'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
final_revision: 'a5741fce8902517c89d3d040528db3de178ae7e4'
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-6-6-mode-select-queue-liveness-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The home screen knows nothing. A player looking at it cannot tell whether anyone is
playing, whether a Standard match is about to start, or whether pressing SOLO means a five-second
wait or an indefinite one — the queue's counts (`MSG.queueStatus`) only exist *after* you have
already committed to queueing, and no arena carries any mode identity at all. At beta population
that reads as "the game is broken" rather than "nobody is here yet", which is the exact failure
Story 6.6's user story names.

**Approach:** One public `GET /liveness` route, built from a **pure aggregator** over
`matchMaker.query()` (driver-backed, so it stays correct across processes), polled by the home
screen. The page shows two GLOBAL figures top-left — `PLAYERS ONLINE` and `LIVE GAMES` — and hangs
per-door detail on the mode buttons themselves: a live queue count and countdown on SOLO, and the
constant `STARTS INSTANTLY` on SOLO VS AI, which is the dead-queue steer. Plus `hullcracker.mode`,
so an auto-requeue survives a reload.

## Boundaries & Constraints

**Always:**
- Every count is **HUMANS ONLY** (Eric, Q3). Bots hold no seat, so the driver's `clients` gives this
  for free — nothing may add participant counts to a player-facing number.
- `matchMaker.query()` is the ONLY source. `matchMaker.stats.local` is FORBIDDEN here — it is
  process-local, which is the co-residency assumption D8 exists to prevent.
- The aggregator is **pure**, over an injected query function, and unit-tested with no framework.
- `PLAYERS ONLINE` = humans in a queue **or** in a match. `LIVE GAMES` = arena rooms, **any phase**.
- The zero renders honestly (Eric, Q5) — `EXPERIENCE.md:108`'s "absence, not placeholders" is scoped
  to decorative empties; a population of zero is a fact the player needs.
- Numbers are Geist Mono, uppercase, `tabular-nums` (`DESIGN.md:183`), and never `text-muted`
  (`DESIGN.md:153`, load-bearing numbers).
- The pre-join countdown ticks LOCALLY off an absolute `deadlineAt`, corrected by `serverNow` for
  clock skew — never a re-polled remaining-ms.
- The liveness fetch fails SAFE: on any error the annotations simply do not render. The home screen
  must never be blocked, delayed, or error-toasted by it.

**Block If:**
- Anything would require the simulation (`server/src/game/**`) to learn the mode — `git grep -n
  "solo\|mode" server/src/game/` must stay clean of room-mode references.
- The design would require a `PROTOCOL_VERSION` bump or an arena wire-shape change.

**Never:**
- Do NOT touch `/metrics` (Eric ruling). Its `rooms`/`players` stay process-local, because that is
  the correct answer to an ops route's question. Add a cross-reference comment only.
- No `LobbyRoom`, no second websocket, no read-only queue peek.
- No per-mode counts ON THE HOMEPAGE (Eric rewrote Q4) — the breakdown ships in the endpoint payload
  only.
- No home-screen visitor/presence tracking.
- No phase metadata on the arena (any-phase counting was ruled).
- No DUO/TRIO. No change to `?direct=1`/`HC_DEV_OPTIONS`. No change to queue POLICY (`queue.ts`
  timings, arm rule, seal) — the queue only publishes what it already computes.
- No change to the secondary-button lit/unlit treatment shipped by 6-5.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Healthy server | 2 arenas (12 + 8 humans), queue with 3 | `PLAYERS ONLINE: 23`, `LIVE GAMES: 2`; SOLO reads `3 QUEUED · STARTS m:ss` | — |
| Empty server | no rooms at all | `PLAYERS ONLINE: 0`, `LIVE GAMES: 0`; SOLO reads `0 QUEUED · NEEDS 2 TO START` | — |
| No queue room | `autoDispose` removed it | Server emits `{pooled: 0, min, cap, deadlineAt: null}` from CONFIG — identical to an empty queue, and never `null`, so the client never has to invent a threshold | Never an error |
| Queue unarmed | 1 pooled, `armedAtMs` null | `1 QUEUED · NEEDS 2 TO START` — **no countdown that cannot fire** | — |
| Queue armed | 4 pooled, deadline +1:23 | `4 QUEUED · STARTS 1:23`, ticking locally between polls | — |
| Deadline passed | `deadlineAt` in the past | Clamp at `0:00`; next poll reports the fresh pool | Never negative |
| Client clock skewed | `Date.now()` off by 30 s | Countdown correct — offset derived from `serverNow` | — |
| Solo vs AI arenas | 5 solo rooms, 1 human each | Counted in the globals (5 players / 5 games); breakdown in payload; **homepage shows no solo-specific count** | — |
| Bots afloat | 1 human + 19 bots | Contributes exactly **1** to `PLAYERS ONLINE` | — |
| Fetch fails / offline | network error, 500, timeout | Annotations and the top-left block do not render; buttons stay fully usable | Silent, fail-open |
| Malformed payload | non-numeric fields | Rejected by a shape guard; treated as unavailable | Silent |
| Poll while queued | player already in the queue | Poll stops; the live `MSG.queueStatus` line owns the status | — |
| Mode persistence | last deploy was `soloVsAi`, page reloaded | `hullcracker.mode` restores it for auto-requeue only; buttons unchanged | Corrupt value ignored |

</intent-contract>

## Code Map

- `shared/src/types.ts` -- ADD `LivenessPayload` (+ barrel export). Additive only; this is an HTTP
  contract both sides read, so it lives with the other client/server contracts. **No PV bump** — the
  arena wire shape does not move.
- `server/src/liveness.ts` -- NEW. The **pure** fold: `foldLiveness(rooms, nowMs)` over
  `{ name, clients, metadata }` records → `LivenessPayload`, plus `livenessPayload(query)` and the
  ~2 s cache. Endpoint via `createEndpoint` (the `metrics.ts:250-258` idiom).
- `server/src/app.config.ts` -- mount ONE `createRouter({ getMetrics, getLiveness })` from core.
  (`.extend()` was the first approach and was replaced at the review gate: better-call's `extend`
  never sets core's `__globalEndpoints`, so the dev playground silently lost `/liveness`.) CORS needs
  no work — Colyseus prepends `Access-Control-Allow-Origin: *` to every response (`router/index.mjs`).
- `server/src/metrics.ts` -- COMMENT ONLY. A pointer to `/liveness` explaining the two numbers
  differ deliberately (process-local vs global) so nobody "reconciles" them.
- `server/src/rooms/ArenaRoom.ts` -- publishes `{ mode, humans }` to listing metadata: the mode tag
  at `finishCreate` (free — metadata set inside `onCreate` rides the create-time `driver.persist`),
  and the live human count on change (join/leave/drop/reconnect-resume). `humans` exists because the
  driver's `clients` is wrong in BOTH directions for a player-facing count — it increments at seat
  RESERVATION (double-counting a captain mid-handoff) and decrements only after the 60 s reconnect
  grace settles (counting a departed captain for a full minute).
- `server/src/rooms/StandardQueueRoom.ts` -- publish `{ pooled, min, cap, deadlineAt }` to listing
  metadata **when they change**, not on every 1 Hz tick. Policy untouched.
- `client/src/net/liveness.ts` -- NEW. Real (CORS-clean) fetch + shape guard + 10 s poll +
  `serverNow` skew offset. Origin derived from `wsEndpoint()` exactly as `probeServer()` does.
- `client/src/ui/home.ts` -- the top-left `PLAYERS ONLINE` / `LIVE GAMES` block; button sub-lines;
  `HomeHandle.setLiveness`; `saveMode`/`loadSavedMode` on `hullcracker.mode` (mirror `saveClass`).
- `client/src/main.ts` -- start/stop the poll with the home screen; restore the persisted mode.
- Reference only: `client/src/ui/home.ts:399-416` (`makeModeButton`), `:486-493` (mode row),
  `:562-578` (the gear — the top-left block is its mirror).

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/types.ts` -- `LivenessPayload` + barrel -- one definition both sides read.
- [ ] `server/src/liveness.ts` -- NEW -- pure fold + cached payload + endpoint. The fold must be
      callable with a plain array so it tests without Colyseus.
- [ ] `server/src/rooms/ArenaRoom.ts` -- mode metadata -- without it, the per-mode breakdown is
      unanswerable. Must not reach `server/src/game/`.
- [ ] `server/src/rooms/StandardQueueRoom.ts` -- publish pooled/deadline on change -- the timer is a
      private field today; publishing per tick would be a driver write per second, forever.
- [ ] `server/src/app.config.ts` -- mount the route via `.extend()`.
- [ ] `server/src/metrics.ts` -- cross-reference comment only.
- [ ] `client/src/net/liveness.ts` -- NEW -- fetch, guard, poll, skew offset, fail-safe.
- [ ] `client/src/ui/home.ts` -- top-left block, button sub-lines, mode persistence.
- [ ] `client/src/main.ts` -- poll lifecycle + persisted-mode restore.
- [ ] `server/src/__tests__/liveness.test.ts` -- NEW -- every server-side I/O matrix row against the
      pure fold, including the empty driver and the metadata-less room.
- [ ] `client/src/__tests__/home.test.ts` -- REVISE the `children.length === 1` pin at `:244-253`
      **deliberately, with the reasoning written in** (amendment 31 struck a sub-line that RESTATED
      the Class Chip; a live count is new information). Add the render + zero-state cases.
- [ ] `client/src/__tests__/liveness.test.ts` -- NEW -- shape guard, skew maths, fail-safe path.
- [ ] `server/scripts/livenessSmoke.mjs` -- NEW -- boot, create rooms over real sockets, assert the
      route's numbers move.

**Acceptance Criteria:**
- Given an empty server, when I load home, then it reads `PLAYERS ONLINE: 0` and `LIVE GAMES: 0`
  rather than hiding the block, and SOLO VS AI reads `STARTS INSTANTLY`.
- Given a Standard queue armed with 4 captains, when I watch the SOLO button, then its countdown
  ticks down smoothly between polls and never shows a countdown while the pool is below 2.
- Given a Solo vs AI match with 1 human and 19 bots, then it contributes exactly 1 to
  `PLAYERS ONLINE` and 1 to `LIVE GAMES`.
- Given the liveness route is unreachable, when I load home, then the buttons work normally and no
  error is shown.
- Given `git grep -n "mode" server/src/game/`, then no room-mode reference appears.
- Given `npm run check`, then lint, type-check and all tests pass.

## Spec Change Log

## Review Triage Log

### 2026-08-17 — Review pass (cycle 98): 3 reviewers — 2 adversarial (Blind Hunter, Edge Case Hunter) + 1 Codex cross-model

- intent_gap: 0
- bad_spec: 0
- patch: 13: (high 3, medium 7, low 3)
- defer: 4: (high 0, medium 3, low 1)
- reject: 1: (low 1)
- addressed_findings:
  - `[high]` `[patch]` F1 — an ARMED pool that drains below `min` kept publishing a live deadline, so the front page counted down to `0:00` and STUCK THERE FOREVER advertising a match that could never form. Violated epic-6 amendment 4 verbatim and the spec's own AC. Fixed in the PUBLISHER (`resolveDeadlineAt` returns null below `min`); `queue.ts` policy left byte-identical. Both adversarial reviewers found this independently.
  - `[high]` `[patch]` F3 — committing to the queue stopped the POLL but never cleared the PAINT, so for the whole 2:00 wait the SOLO button counted down a dead payload while the status line contradicted it — the exact failure `main.ts`'s own comment says it prevents. `stopHomeLiveness` now pushes `setLiveness(null)`.
  - `[high]` `[patch]` F12 — `playersOnline` over-counted by up to 60s on EVERY dropped connection: the driver's `clients` decrements only after `allowReconnection()` settles (`reconnectGraceSeconds: 60`). Arena now publishes its own live `humans` count in listing metadata; the fold prefers it. Found by Codex alone, confirmed against `@colyseus/core` 0.17.44 source. THIS ALSO CLOSED the seat-handoff double-count the spec had accepted, since a reserved-but-unjoined seat is not in the room's own client list.
  - `[medium]` `[patch]` F2 — the sub-line branched only on `deadlineAt === null`, rendering the self-contradicting `20 QUEUED · NEEDS 2 TO START` during the form window. Now a four-state machine; `STARTING` is the new orchestrator-ruled copy.
  - `[medium]` `[patch]` F4 — the 2s cache had no in-flight coalescing, so N concurrent pollers each hit the driver on a public unauthenticated route. Memoized the in-flight promise; rejections release the slot.
  - `[medium]` `[patch]` F5 — `serverNow` was stamped BEFORE the awaited query, injecting the query's own latency as phantom clock skew and making every countdown run early. Stamped after.
  - `[medium]` `[patch]` F6 — `queueOf`'s `pooled` fallback did not validate `room.clients`, so one non-finite value became `NaN`, failed the client's strict guard, and blacked out the WHOLE register including healthy arena counts.
  - `[medium]` `[patch]` F7 — the empty-server case (the most-viewed state this story exists for) hardcoded `min` as `2` client-side. Server now always emits the queue block with CONFIG-derived `min`/`cap`; the client literal is deleted.
  - `[medium]` `[patch]` F9 — an absent sub-line used `display:none`, so the deploy stack shifted ~17px when the first payload landed and jittered every 10s on a flaky link, moving the primary button between mousedown and mouseup. Space is now reserved.
  - `[medium]` `[patch]` F13 — `stop()` suppressed the callback but never aborted the in-flight fetch, leaking a request per home-entry on a slow server. The poll now owns an `AbortController`.
  - `[low]` `[patch]` F8 — no cache directives on a polled endpoint; a caching proxy could freeze the counts and the absolute deadline for a whole session. `Cache-Control: no-store` both ends.
  - `[low]` `[patch]` F10 — `home.test.ts`'s "both boxes are the same shape" pin had become a TAUTOLOGY (comparing `'' === ''`) while the two buttons genuinely differed. Replaced with a real shared-shape comparison asserting non-vacuous values.
  - `[low]` `[patch]` F11 — `.extend()` bypasses core's `__globalEndpoints`, so the dev playground lost `/liveness`. One `createRouter({getMetrics, getLiveness})` instead; `/metrics` stays byte-identical by object identity (pinned).
  - Verification that the regressions DISCRIMINATE: with all 10 source files reverted to HEAD and only the new tests kept, 27 server and 15 client tests fail.

## Design Notes

**Why the aggregator is pure and injected.** `matchMaker.query()` is trivially mockable, but the
project's idiom (`queue.ts`'s `queueStep`, `metrics.ts`'s exported maths) is to put the decision in a
pure function and keep the adapter thin. It also means the empty-driver case — which is the *normal*
case at launch — is a one-line test rather than a boot.

**Why `/metrics` is untouched.** Its `rooms`/`players` overlap `/liveness` in name only. Process-local
is the CORRECT answer to "is this dyno loaded"; global is the correct answer to "how many people are
playing". Reconciling them would break the ops route's actual job. Both files get a comment saying so.

**Why the countdown ticks locally.** Polling every second for a smooth clock would be a driver query
per second per visitor. Publishing an absolute `deadlineAt` plus `serverNow` lets the client tick at
60 fps off one 10 s poll, and makes clock skew explicit rather than latent.

**The double-count is FIXED, not accepted (review gate).** The original note ledgered it: during seat
handoff a captain is briefly connected to the queue room while already holding a reserved arena seat,
so `PLAYERS ONLINE` over-counts by up to the cohort size — claimed as "well under a second". Two
things were wrong with that. The STATE is brief, but the DISPLAY is not: the figure passes through a
2 s server cache and a 10 s client poll, so a sub-second truth can sit on a home screen for up to
~12 s. And the same mechanism carries a much larger defect in the other direction — Colyseus
decrements a room's driver-visible `clients` only inside `#_onAfterLeave`, which for a room defining
`onDrop` is deferred until `allowReconnection()` settles, i.e. `CONFIG.net.reconnectGraceSeconds`
(60) for the arena; a captain who closed their tab was reported ONLINE for a full minute, which is
the ordinary way a player leaves rather than an edge case.

Both are one fix and it needs no identity tracking across rooms: each arena publishes its OWN
immediate human count (`metadata.humans` = `this.clients.length`, on change, beside the mode tag) and
`foldLiveness` prefers it over the driver's seat ledger. `this.clients` is mutated immediately on
both edges and never holds a reserved-but-unjoined seat, so a captain mid-handoff is counted exactly
once (in the queue) and a departed captain is counted zero times, immediately.

**The button sub-line reverses a shape, not a reason.** Amendment 31 deleted the sub-lines because
they restated the Class Chip immediately above. A live queue count is information available nowhere
else on the page, so it honours that reasoning while reversing its shape — recorded as an amendment
so a future agent does not "restore" the bare buttons.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, complexity ≤ 10 holds.
- `npm run check` -- expected: lint + type-check + all tests pass (4830 + new).
- `HC_DEV_OPTIONS=1 node server/scripts/livenessSmoke.mjs` -- expected: route reports 0/0 on an idle
  server, then non-zero once rooms exist.
- `git grep -n "matchMaker.stats" server/src/liveness.ts` -- expected: NO hits (D8).

**Manual checks:**
- Screenshot the home screen for Eric — the top-left block's exact placement and the button sub-line
  treatment are new surfaces the design system does not spec, and ship as a proposal.
