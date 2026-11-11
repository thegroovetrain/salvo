---
title: 'Story 10.11: Bots Fill the Standard Queue at 1:00'
type: 'feature'
created: '2026-11-10'
status: 'done'
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

- **R5 `HC_QUEUE_BOT_FILL` IS A NUMBER OF SECONDS** (Eric 2026-11-10, second chat line, verbatim: *"HC_QUEUE_BOT_FILL can be basically number of seconds until queue fills with bots. If set to 0 or unset, then bot autofill should be off."*). Supersedes the first draft's "unset = ON" and its dev-only `HC_QUEUE_TIMER_MS` (dropped: a smoke boots with a small value).

## Orchestrator rulings (Eric may veto any on staging)

- **O1** A finite value above 0 = bot fill ON with that many seconds as the queue timer; unset, empty, `0`, negative or non-numeric = OFF. Declared in `render.yaml` on BOTH services as `value: "60"` (his 1:00). Consequence to report: the Blueprint syncs from `main`, so staging has no key (OFF) until this file reaches `main` or the key is set on the service by hand.
- **O2** With the switch OFF the queue is the pre-story queue (arms at `CONFIG.match.minHumans` humans, no bots) holding `CONFIG.match.queueTimerMs`, which becomes 60000 (the story's 1:00).
- **O3** `CONFIG.match.minHumans` stays 2 and keeps its meaning (no-bot arenas). The queue's arm minimum is derived: 1 when bot fill is on, `CONFIG.match.minHumans` when off. Read once at room creation.
- **O4** The arena learns `botFill`, never a mode: a TRUSTED `botFill` (the existing `lobbyTicket`) without `mode: 'private'` fills to the cap and arms at one human; the listing tag, `/liveness` split and `MatchRecord.mode` stay `'standard'`.
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
| Fill OFF (`HC_QUEUE_BOT_FILL` unset or `0`) | 1 pooled | never arms, never forms (`min 2`); 2 pooled form after the timer with NO bots | none |
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
- [x] W1 `shared/src/constants.ts` + `server/src/rooms/{queue.ts, queueFill.ts (new), StandardQueueRoom.ts, ArenaRoom.ts}` + `server/src/liveness.ts` -- timer 60000; the env switch module (`HC_QUEUE_BOT_FILL` seconds); derived arm minimum; trusted `botFill` create option; arena fill decoupled from mode; stale comments corrected; PV bumped only per the rule above -- the feature
- [x] W1 tests (same agent) -- `queue.test.ts` re-cut around the arm minimum as a parameter (lone arms/forms at min 1; never at min 2; overflow re-arm; drain); a room-level test that fill ON creates the arena with trusted `botFill` and `expectedCaptains` = humans and fill OFF passes neither; arena test: trusted `botFill` without mode → `playerCap − expectedCaptains` bots before the first tick, listing mode `'standard'`, countdown arms at one human, untrusted `botFill` stripped; switch parser unit test; liveness tests on the effective `min` -- the matrix
- [x] W2 `server/scripts/{queueSmoke,livenessSmoke,loadTest}.mjs` + client comments -- smokes re-scripted (lone captain arms and, under a short `HC_QUEUE_BOT_FILL`, is seated into a full arena; fill-OFF arm kept where a step needs an unarmed pool or documents the env it needs); `loadTest` header states it runs with the switch off; client comment drift fixed, tests touching 120_000 follow CONFIG -- scripted scenarios
- [x] W3 records -- `render.yaml` key on both services with a comment in the file's register, `docs/deploy.md` paragraph, amendment 20, VERSION / `package.json` 0.19.16, both trackers (one-line stamps), `epics.md` stamp, `project-context.md` line, this spec's result

**Acceptance Criteria:**
- Given fill ON and one pooled captain, when the queue timer expires, then one arena exists holding that captain and `playerCap − 1` bots, its listing mode is `'standard'`, and the match reaches `active`.
- Given fill ON, when `/liveness` is read with one captain pooled, then `queue.min` is 1 and `deadlineAt` is a future epoch; bots are never counted in `playersOnline`.
- Given `HC_QUEUE_BOT_FILL` unset or `0`, when one captain pools, then no deadline is published and nothing forms; two captains form a bot-less arena after the timer.
- Given the tree, when `npm run check` runs, then EXIT 0; `queueSmoke`, `livenessSmoke`, `matchSmoke`, `weaponsSmoke` pass first try against a worktree-booted server.

## Spec Change Log

## Review Triage Log

### 2026-11-10 — Review pass (Fable Blind Hunter BUILD-ON-IT · Fable Edge Case Hunter 3 cases · Codex `gpt-5.6-sol` FIX-FIRST on two findings)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 4: (high 0, medium 2, low 2)
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Edge Case Hunter (traced; Blind Hunter raised the same carry as "by design"): with an arm minimum of 1 a deadline left by a captain who armed and left was inherited by the next lone arrival — a shortened hold, or an instant bot-filled match if expired. `queueStep` now clears the arm at pool 0 (nobody is pooled, so nobody is held hostage; a dip that stays ≥ 1 keeps its deadline); regression test added.
  - `[low]` `[patch]` Codex + both hunters (CONFIRMED): `HC_QUEUE_BOT_FILL=0.0004` rounded to 0 ms and read as OFF against the "any value above 0 is ON" contract — positivity is tested on the seconds, the hold floors at 1 ms; test added.
  - Deferred (ledger, Eric's call): no per-IP throttle on the queue door now that one socket buys a 15-bot arena; `MatchRecord.mode` cannot tell a bot-filled standard match from an all-human one (O4); a no-show captain leaves an empty seat (same as private bot fill); no upper bound / no warning on a mistyped switch value.
  - Not patched, for Eric's eye: with one captain arming, a second captain who joins late in the first one's minute starts when THAT minute ends (the existing never-extend rule), even if the first captain then leaves.

## Design Notes

- **Why `botFill` and not a mode.** Story 6.5's boundary: the arena never learns which door formed it. "Fill the empty seats" is a roster instruction, like `expectedCaptains`; the ticket already proves the sender is server code.
- **Waves (orchestrator):** W1 server + shared + tests (Opus; the trust boundary in `roomOptions`/`ArenaRoom` is already built — reasoning is local) → W2 smokes + client comments (Sonnet, fully specified) ∥ W3 records (Sonnet) → gate (two Fable hunters + Codex `gpt-5.6-sol`).

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared && npm test -w server && npm test -w client` -- expected: green
- `npm run lint` -- expected: 0 errors
- `npm run check` -- expected: EXIT 0 before the PR
- `queueSmoke`, `livenessSmoke`, `matchSmoke`, `weaponsSmoke` against an agent-booted worktree server (`HC_DEV_OPTIONS=1`, scratch `PORT`, own PID and its tsx child killed after) -- expected: OK first try

## Auto Run Result

**Status:** done (review gate passed; PR to `development`).

**Summary:** The standard queue fills with bots behind one Render switch. `HC_QUEUE_BOT_FILL` is a number of seconds (Eric R5): above 0, ONE captain arms the queue (R2), it holds that many seconds, and the arena forms with combat bots filling every empty seat to `CONFIG.map.playerCap` (R1) through the existing `buildBotFleet` path, unmarked (R3); unset or 0, the queue is the two-human, bot-less queue holding `CONFIG.match.queueTimerMs`, now 60000. The arena receives a trusted `botFill` (the lobby ticket) and never a mode, so a queue match stays `'standard'` in the listing, `/liveness` and the match record. `QueueStatusMsg.min` and `/liveness` `queue.min` carry the effective arm minimum. Cycle 222, 0.19.16, PV 101 unchanged (no client code reads the changed value), epic-10 amendment 20. Subagent models by `/orchestrate` routing: Opus built the server wave, Sonnet the smokes and comments, Fable hunters + Codex at the gate.

**Files changed (headline):** `server/src/rooms/queueFill.ts` (new, the one env reader), `queue.ts` (arm minimum from the caller; arm cleared at pool 0), `StandardQueueRoom.ts` (`queueArenaCreateOptions`), `ArenaRoom.ts` (bot fill and `doorMinHumans` decoupled from `mode`), `liveness.ts` (effective `min` fallback), `shared/src/constants.ts` (`queueTimerMs` 60000), comment corrections in `match.ts` / `participants.ts` / `roomOptions.ts` / `lobbyTicket.ts` / `types.ts` and the client queue files; tests `queue.test.ts`, `queueFill.test.ts` (new), `solo.test.ts`, `liveness.test.ts`; smokes `queueSmoke.mjs` (boots with a 6 s fill: lone captain armed, seated at the deadline into a 16-row roster, match goes active; cap path), `livenessSmoke.mjs` (boots with the switch off; re-arms a fresh cohort before the presence wait), `loadTest.mjs` (comments); `render.yaml` (`"60"` on both services), `docs/deploy.md`; amendment 20, both trackers, `epics.md` stamp, `project-context.md`, the ledger, VERSION 0.19.16.

**Review:** 2 patched, 4 deferred, 3 rejected (triage log above).

**Verification:** `npm run check` EXIT 0 on the patched tree (shared 1470, server 2793 in 110 files, client 3974 in 145 files; lint 0 errors, 3 pre-existing warnings); `queueSmoke`, `livenessSmoke`, `matchSmoke`, `weaponsSmoke` OK first try on fresh boots, own servers killed.

**Residual risks:** `render.yaml` reaches Render only from `main`, so staging has no key (bot fill OFF) until the file reaches `main` or the key is set on `hullcracker-dev` by hand — the ON path has only been exercised by tests and `queueSmoke`; `loadTest`'s default connection counts were sized for a cap of 20 and leave a surplus that forms mid-run (not changed); the home button title `Deploy alone against other captains` stands (R3); How-to-Play and the GDD's "no bot-fill" sentences are 10.14's.

