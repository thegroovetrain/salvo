---
title: 'Story 10.11: Bots Fill the Standard Queue at 1:00'
type: 'feature'
created: '2026-11-10'
status: 'in-progress'
baseline_revision: '56adbcc0'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A captain queuing alone for a standard match waits forever: the queue arms only at a second human and holds 2:00 (Eric 2026-10-25: *"Solo queue goes down to 1:00 lobby time and fills with bots at that time if there aren't enough players, so there is always a game."*).

**Approach:** The standard queue's timer becomes 1:00 and ONE captain arms it; when it fires (or the pool reaches the cap) the arena is formed with combat bots filling every empty seat to `CONFIG.map.playerCap`, through the same `buildBotFleet` path Solo vs AI and the private lobby's bot fill use. The whole behavior sits behind ONE server environment switch Eric can set on Render.

## Eric's rulings for this story (2026-11-10, one AskUserQuestion round at the spec step of `/bmad-dev-auto 10-11` + one chat line; literal spec; recorded as epic-10 amendment 20)

- **R1 Fill to the FULL 16** (`CONFIG.map.playerCap`, derived — no new number). Rejected: 8; 12.
- **R2 ONE captain arms the 1:00 timer.** Rejected: still needs two.
- **R3 Bots carry NO mark** — same as Solo vs AI and private lobbies today. Rejected: marked everywhere; marked on results only.
- **R4 The switch for bot fill is a server ENVIRONMENT VARIABLE settable on Render** (Eric, verbatim: *"I meant to make the switch for bot fill on lobbies something i can set as an environment variable on render"*).

## Orchestrator rulings (Eric may veto any on staging)

- **O1** The switch is `HC_QUEUE_BOT_FILL`. UNSET or anything but `0` = ON (the ruled behavior is the default, so staging gets it the moment `development` deploys — the Blueprint only syncs from `main`); `0` = OFF. Declared in `render.yaml` on BOTH services as `value: "1"` (the Blueprint is the source of truth; a dashboard-only value is drift).
- **O2** With the switch OFF the queue is the pre-story queue (arms at `CONFIG.match.minHumans` humans, no bots) but still holds 1:00 — the timer is R-ruled independently of the fill.
- **O3** `CONFIG.match.minHumans` stays 2 and keeps its meaning (no-bot arenas). The queue's arm minimum is derived: 1 when bot fill is on, `CONFIG.match.minHumans` when off. Read once at room creation.
- **O4** The arena learns `botFill`, never a mode: a TRUSTED `botFill` (the existing `lobbyTicket`) without `mode: 'private'` fills to the cap and arms at one human; the listing tag, `/liveness` split and `MatchRecord.mode` stay `'standard'`.
- **O5** A dev-only `HC_QUEUE_TIMER_MS`, honoured only with `HC_DEV_OPTIONS=1`, shortens the queue timer so the smokes can script the timer path (amendment 214). Inert in production.
- **O6** No copy changes. The home button title (`'Deploy alone against other captains'`) stands: bots are unmarked captains (R3). Flagged in the report for Eric.

## Boundaries & Constraints

**Always:** `queue.ts` stays pure (no `process.env`, no Colyseus); the env read lives in one small server module the room calls. Bots are in the water before the first tick (the solo rule). Bots are ordinary `role: 'bot'` participants through the input pipeline; `isHuman` / `humanCount` semantics unchanged. `QueueStatusMsg.min` and the queue listing's `min` carry the EFFECTIVE arm minimum, so the modal and `/liveness` never lie. `PROTOCOL_VERSION` bumps only if the client reads a changed `CONFIG` value or a wire shape moves. Complexity ≤ 10. Tests assert contracts of the function under test — no pins of 60000, 16, copy strings, or wall-clock timing.

**Block If:** a design gap surfaces that R1–R4 / O1–O6 do not cover and that changes what a player sees; a seventh perception exception would be needed; `npm run check` cannot be made green without weakening a test's contract.

**Never:** change `CONFIG.match.minHumans`; give the arena a mode; add a bot label, new HUD/home copy, or a How-to-Play sentence (10.14); touch bot behavior (10.12); count bots in `/liveness` humans; edit `CLAUDE.md`; launch batch sims; merge the PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lone captain, fill ON | 1 pooled | arms at join; status `min 1`, `startsInMs ≤ timer`; at expiry arena forms with 1 human + (cap − 1) bots; countdown arms at one human | none |
| Partial pool, fill ON | n pooled, 1 < n < cap at expiry | arena with n humans + (cap − n) bots | none |
| Cap reached | cap pooled before expiry | forms immediately, zero bots | none |
| Overflow | cap + k pooled | first cap form; the k re-arm a fresh full timer, then form with bots | none |
| Pool drains to 0 while armed | last captain leaves | nothing forms; listing publishes no deadline; next joiner's deadline follows the existing cohort rule | none |
| Fill OFF (`HC_QUEUE_BOT_FILL=0`) | 1 pooled | never arms, never forms (`min 2`); 2 pooled form after the timer with NO bots | none |
| Untrusted `botFill` | client-supplied create option, no ticket | stripped into `rejectedKeys`, no bots | silently dropped |
| Cohort shrinks in arena countdown, fill ON | 2 humans + bots, one leaves | match proceeds (min 1); all humans gone → room disposes as solo does | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts:3027-3034` -- `match.minHumans` (unchanged), `match.queueTimerMs` 120000 → 60000 + comment
- `server/src/rooms/queue.ts` -- pure policy; `QueueConfig.minHumans` becomes "captains required to arm" (value supplied by the room); `defaultQueueConfig` takes the fill flag / timer
- `server/src/rooms/StandardQueueRoom.ts` -- `cfg` built at create from the switch; `formMatch` passes `{expectedCaptains, botFill, lobbyTicket}` when ON; `resolveDeadlineAt` / `publishListing` / `pushStatus` already read `cfg.minHumans`
- `server/src/rooms/lobbyTicket.ts`, `roomOptions.ts:393-421` -- trust ticket; `admitPrivateKeys` already admits `botFill` without `mode`
- `server/src/rooms/ArenaRoom.ts:517, 688-691` -- `finishCreate` fill + `doorMinHumans`: decouple `botFill` from `mode === 'private'`; `listingModeOf` untouched
- `server/src/game/match.ts:488-525`, `participants.ts:4-8,48-51` -- stale FR34 / "queue refuses a lone human" comments
- `server/src/liveness.ts:162-193` -- `min` fallbacks
- `client/src/net/connection.ts:39-42, 310, 324-327`, `client/src/app/requeue.ts`, `client/src/ui/queueModal.ts:10,50` -- comments naming 2:00 / "needs 2"; verify whether any CODE reads `CONFIG.match.queueTimerMs` (PV decision)
- Tests: `server/src/__tests__/{queue,liveness,colyseus018,boarding,solo,operability}.test.ts`, `client/src/__tests__/{connection,queueModal}.test.ts`
- Smokes: `server/scripts/{queueSmoke,livenessSmoke,loadTest}.mjs`
- `render.yaml`, `docs/deploy.md` -- the switch
- Records: `VERSION`, `package.json` (0.19.16, cycle 222), `epic-10-context-amendments.md` (amendment 20), `sprint-status.yaml`, `gds-workflow-status.yaml`, `epics.md` Story 10.11 BUILT stamp, `project-context.md` (one line on the switch)

## Tasks & Acceptance

**Execution (waves; `/orchestrate` routing in Design Notes):**
- [ ] W1 `shared/src/constants.ts` + `server/src/rooms/{queue.ts, queueFill.ts (new), StandardQueueRoom.ts, ArenaRoom.ts}` + `server/src/liveness.ts` -- timer 60000; the env switch module (`HC_QUEUE_BOT_FILL`, dev-gated `HC_QUEUE_TIMER_MS`); derived arm minimum; trusted `botFill` create option; arena fill decoupled from mode; stale comments corrected; PV bumped only per the rule above -- the feature
- [ ] W1 tests (same agent) -- `queue.test.ts` re-cut around the arm minimum as a parameter (lone arms/forms at min 1; never at min 2; overflow re-arm; drain); a room-level test that fill ON creates the arena with trusted `botFill` and `expectedCaptains` = humans and fill OFF passes neither; arena test: trusted `botFill` without mode → `playerCap − expectedCaptains` bots before the first tick, listing mode `'standard'`, countdown arms at one human, untrusted `botFill` stripped; switch parser unit test; liveness tests on the effective `min` -- the matrix
- [ ] W2 `server/scripts/{queueSmoke,livenessSmoke,loadTest}.mjs` + client comments -- smokes re-scripted (lone captain arms and, under the dev timer, is seated into a full arena; fill-OFF arm kept where a step needs an unarmed pool or documents the env it needs); `loadTest` header states it runs with `HC_QUEUE_BOT_FILL=0`; client comment drift fixed, tests touching 120_000 follow CONFIG -- scripted scenarios
- [ ] W3 records -- `render.yaml` key on both services with a comment in the file's register, `docs/deploy.md` paragraph, amendment 20, VERSION / `package.json` 0.19.16, both trackers (one-line stamps), `epics.md` stamp, `project-context.md` line, this spec's result

**Acceptance Criteria:**
- Given fill ON and one pooled captain, when the queue timer expires, then one arena exists holding that captain and `playerCap − 1` bots, its listing mode is `'standard'`, and the match reaches `active`.
- Given fill ON, when `/liveness` is read with one captain pooled, then `queue.min` is 1 and `deadlineAt` is a future epoch; bots are never counted in `playersOnline`.
- Given `HC_QUEUE_BOT_FILL=0`, when one captain pools, then no deadline is published and nothing forms; two captains form a bot-less arena after the timer.
- Given production (`HC_DEV_OPTIONS` unset), when `HC_QUEUE_TIMER_MS` is set, then it is ignored.
- Given the tree, when `npm run check` runs, then EXIT 0; `queueSmoke`, `livenessSmoke`, `matchSmoke`, `weaponsSmoke` pass first try against a worktree-booted server.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why `botFill` and not a mode.** Story 6.5's boundary: the arena never learns which door formed it. "Fill the empty seats" is a roster instruction, like `expectedCaptains`; the ticket already proves the sender is server code.
- **Why unset = ON.** `render.yaml` reaches Render only from `main`; an opt-in switch would leave staging without the feature it must QA.
- **Waves (orchestrator):** W1 server + shared + tests (Opus; the trust boundary in `roomOptions`/`ArenaRoom` is already built — reasoning is local) → W2 smokes + client comments (Sonnet, fully specified) ∥ W3 records (Sonnet) → gate (two Fable hunters + Codex `gpt-5.6-sol`).

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared && npm test -w server && npm test -w client` -- expected: green
- `npm run lint` -- expected: 0 errors
- `npm run check` -- expected: EXIT 0 before the PR
- `queueSmoke`, `livenessSmoke`, `matchSmoke`, `weaponsSmoke` against an agent-booted worktree server (`HC_DEV_OPTIONS=1`, scratch `PORT`, own PID and its tsx child killed after) -- expected: OK first try
