---
title: 'Story 6-5 — Solo vs AI Mode'
type: 'feature'
created: '2026-08-17'
status: 'draft'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-6-5-solo-vs-ai-mode-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** At beta launch population is zero and `CONFIG.match.minHumans = 2`, so one player cannot
start a match at all. Story 6-4 landed full combat bots — AI captains that fight with real loadouts,
earn XP, spend boons, take placements and can win — but Eric's ruling A1 deliberately left them with
no production caller. There is no way to reach them from the game.

**Approach:** A second button on the home screen that starts an ordinary battle royale with one human
and 19 AI captains. No queue, no pool, no waiting room, no new room type: the client calls
`client.create('arena', { solo: true })`, which always mints a fresh room, and the arena fills the
roster to `CONFIG.map.playerCap` with bots before the match activates. Storm, PvE fleets, economy,
placements and the win check are byte-identical to Standard.

## Boundaries & Constraints

**Always:**
- The arena's GAME LOGIC never forks on mode. Roster composition (how many bots to build) is a
  parameter, exactly as `expectedCaptains` already is; no storm, economy, PvE, perception or win-check
  code may test for solo.
- Bots are FULL PARTICIPANTS and must read as captains everywhere: real class silhouette, personal
  Regatta hue, nameplate, real callsign in the kill feed and results table. They are NOT PvE drones
  and must never render greyscale or amber-hollow.
- Bots must exist in `world.ships` BEFORE the `Match.update()` tick that runs `activate()`.
- `client.create()` (never `joinOrCreate`) for the solo door — it always mints a fresh room, so a solo
  request can never land in another player's match.
- The `PROTOCOL_VERSION` gate keeps running on the solo door.
- Solo rooms lock at birth like every queue-formed room (`expectedCaptains` set ⇒ `lock()`).
- `shared/` is FROZEN this story. No wire-type change, no CONFIG change. Bot count DERIVES from
  `CONFIG.map.playerCap`.

**Block If:**
- Any change would require a wire-shape change, a `PlayerMeta` schema field, or a PV bump.
- The solo door cannot be opened without also widening the arena's public door for non-solo joins.

**Never:**
- No queue room, no `SoloVsAiQueueRoom`, no base-class extraction from `StandardQueueRoom`, no
  `app.config.ts` change. `StandardQueueRoom` and `queue.ts` are UNTOUCHED.
- No mode-selector control, no queue-liveness counts, no localStorage mode persistence — Story 6.6.
  (In-memory mode on `lastDeploy` IS in scope — Eric 2026-08-17, see Design Notes.)
- No replay button on the results modal (Eric amendment 30, MUST-level, pinned in `results.test.ts`).
- Do not change `?direct=1` or the `HC_DEV_OPTIONS` dev door (epic-6 amendment 9 stands).
- Do not modify `server/src/game/ai/**` behaviour or its ESLint import boundary.
- Do not touch the PvE fleet system.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Solo launch | `create('arena', {solo:true, pv, name, cls})` | Fresh locked room, 19 bots built, 1 seat, boards, 0:10 countdown, live | — |
| Stale client | `solo:true` with wrong `pv` | Rejected at `onAuth` by `protocolVersionError` | Clear error, no seat |
| Direct non-solo join | `create/joinOrCreate('arena')`, no `solo` | Still refused unless `HC_DEV_OPTIONS=1` | `ARENA_DIRECT_JOIN_ERROR` |
| Bot roster | 19 bots built | Each gets `PlayerMeta` (id/name/hue); `n AFLOAT` reads 20 | — |
| Hue collision | Human's `colorPref` already held by a bot | Bot and human SWAP hues; human keeps their preference | Fallback: any free hue |
| Callsign collision | Human's name equals a bot's | That bot is redrawn from the remaining pool | Suffix if pool exhausted |
| Class spread | 19 bots | Balanced round-robin over the 3 classes (6/6/7), order shuffled per room | — |
| Human sinks 14th | 19 bots afloat | Match CONTINUES; player spectates or returns to port | — |
| A bot wins | Last participant afloat is a bot | `winnerId` = bot id; results name it | — |
| Human leaves mid-match | 0 clients | Room disposes on grace expiry; bots hold no seat | `matchAbort('abandoned')` |
| `expectedCaptains: 1` | solo room | Accepted (floor relaxed to 1), NOT clamped to 2 | — |

</intent-contract>

## Code Map

- `server/src/rooms/roomOptions.ts` -- add `solo` to `JoinOptions`/`RoomOptions` + a pure
  `sanitizeSolo`; relax `sanitizeExpectedCaptains`'s floor from `CONFIG.match.minHumans` to `1`.
  NOT dev-gated (see Design Notes for the security argument).
- `server/src/rooms/ArenaRoom.ts` -- `static onAuth` admits `solo === true` after the PV gate;
  `finishCreate` derives `expectedCaptains: 1` + `minHumans: 1` and builds
  `CONFIG.map.playerCap - 1` bots with `PlayerMeta` rows + hues; `onJoin` performs the hue swap and
  callsign redraw. THE ONLY FILE THAT KNOWS THE WORD "SOLO".
- `server/src/game/world.ts` -- `addBot(hullId?)` gains an optional class so the caller can balance
  the field; default behaviour unchanged.
- `server/src/game/ai/botDriver.ts` -- `enroll(id, hullId?)` honours a supplied class; a
  `renameBot(id)` redraw for the callsign collision. NO behaviour change to the brain.
- `client/src/ui/home.ts` -- PLAY is relabelled `SOLO` and LOSES its sub-line (Eric 2026-08-17); a
  centered `SOLO VS AI` button sits in a row BELOW a mode row built to hold DUO/TRIO later. Must never
  render `AWAITING A SECOND CAPTAIN` for solo.
- `client/src/net/connection.ts` -- `connect()` takes a solo flag; solo skips the queue entirely and
  calls `client.create('arena', {...opts, solo:true})`.
- `client/src/main.ts` -- wire the second button through `startGame`/`lastDeploy`.
- `server/scripts/soloSmoke.mjs` -- NEW. Full flow over a real socket.
- Reference only: `server/scripts/batchsim/runner.ts:256-318` (the only existing bot-lobby
  construction), `server/src/rooms/StandardQueueRoom.ts` (DO NOT EDIT).

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/rooms/roomOptions.ts` -- `sanitizeSolo` + `expectedCaptains` floor 1 -- a solo room
      must be expressible; today `1` silently becomes `2`.
- [ ] `server/src/rooms/ArenaRoom.ts` -- solo door, bot construction at create, `PlayerMeta` + hues --
      bots must be in `world.ships` before `activate()` or `checkWin` latches an instant human win.
- [ ] `server/src/game/world.ts` + `ai/botDriver.ts` -- optional class + callsign redraw -- a balanced
      field and no name collision with the player.
- [ ] `client/src/net/connection.ts` + `client/src/main.ts` -- the solo connect path.
- [ ] `client/src/ui/home.ts` -- the second button and its sub-line.
- [ ] `server/src/__tests__/solo.test.ts` -- NEW -- every I/O matrix row.
- [ ] `server/src/__tests__/match.test.ts` -- a Match+bots integration test: 1+19 runs, a bot wins,
      a bot holds the finish -- there is ZERO such coverage today.
- [ ] `client/src/__tests__/home.test.ts` -- second button; read `:36`/`:83` before touching copy.
- [ ] `server/scripts/soloSmoke.mjs` -- queue-free create → countdown → live → results.

**Acceptance Criteria:**
- Given the home screen, when I press SOLO VS AI, then a match starts with me and 19 AI captains
  without waiting for anyone.
- Given a live solo match, when I read the chrome bar, then `n AFLOAT` counts all surviving
  participants (20 at start), never 1.
- Given a bot on my radar or in sight, then it renders in a personal Regatta hue with a nameplate and
  a real callsign — never greyscale, never amber-hollow.
- Given I sink a bot, then the kill feed names it, it pays full `killLevels`, and it can move the
  kill-leader throne.
- Given the last participant afloat is a bot, then the match ends and the results modal names it.
- Given a non-solo direct arena join without `HC_DEV_OPTIONS`, then it is still refused.
- Given `npm run check`, then lint, type-check and all tests pass.

## Design Notes

**Why no queue.** A solo queue has nothing to queue — it forms on the first joiner. `client.create()`
always mints a fresh room (verified: `@colyseus/sdk` `Client.mjs:114`), and `callOnAuth` runs on that
path (`@colyseus/core` `MatchMaker.mjs:113`), so the PV gate is preserved and a solo request can never
join someone else's match. That deletes a room type, a base-class extraction and the client's queue
plumbing.

**Why `solo` may be client-supplied (the security argument, stated so review can attack it).** The
arena's public door is closed because a client must not be able to walk into a SHARED match on its own
terms. `create()` gives the asker a private, immediately-locked room, so the only thing a hostile
client can do with `solo:true` is spawn its own 20-hull room — the same cost as any legitimate solo
player. It cannot inject bots into another player's match, because it cannot reach another player's
match. `sanitizeSolo` still coerces strictly (`=== true`), and every other dev override stays gated.

**Bot count DERIVES from `CONFIG.map.playerCap`** (fill the roster to cap) rather than adding a
constant — self-documenting, matches the AC's "fills the lobby to cap", and cannot drift from the
spawn lattice, which also has exactly `playerCap` candidates.

**The hue swap.** `REGATTA_HUES` is exactly 20, and 1 + 19 consumes it exactly. Bots are built before
the human joins, so the human's `colorPref` may already be held. On join, if a bot holds it, the two
SWAP — the player keeps their chosen colour and the wheel stays a bijection. `REGATTA_NO_HUE` (255) is
the drone-grey sentinel and must never be left on a bot.

**`n AFLOAT` now counts participants.** Giving bots roster rows makes `afloatCount` return 20. Epic-4
worded this "captains only" when the only alternative was PvE drones; AI captains are participants,
so counting them is the consistent reading. Record as an epic-6 amendment.

**The home screen is a MODE ROW plus a solo-vs-AI row (Eric rulings, 2026-08-17).** PLAY becomes
`SOLO` and loses its sub-line — *"I want the current PLAY button to say SOLO and nothing else. It
doesn't need to say Deploy as [ship class]."* The Class Chip directly above already shows the hull, so
the sub-line was redundant. `SOLO VS AI` is centered in a row BELOW. The top row is built as a real
row container because *"the current PLAY button will be in-line with DUO and TRIO modes, once those
are out. All three are above SOLO VS AI."* **This retires the `home.test.ts:36` sub-line pin and
overrides EXPERIENCE.md:67's "sub-line always states what will happen"** — recorded as an amendment,
not worked around. Dropping both sub-lines also resolves the column-height pressure that adding a
second button created.

**Auto-requeue remembers the mode (Eric, 2026-08-17)** — *"Lobby collapse should return to whatever
the last mode the player/group had queued for."* An in-memory mode on `lastDeploy`; no localStorage
(that stays 6.6). **The collapse path is UNREACHABLE in Solo vs AI** — Eric asked *"why would the
lobby collapse in solo vs ai anyway?"* and the answer is that it cannot: the collapse fires only for a
sealed 2-captain cohort losing one during the 0:10 countdown, and a solo room has no cohort. The field
exists for DUO/TRIO.

**The termination rule (the debt the ledger flagged three times).** No new rule is needed and none is
invented: `isParticipant` is `role !== 'fleet'`, so bots count in `afloatCaptains()`, a 1+19 roster
does not latch, and the last participant afloat wins. The undefined case is 1 human + PvE fleets only,
which `queue.ts` still refuses; this story does not open it.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, complexity ≤ 10 holds.
- `npm run check` -- expected: lint + type-check + all tests pass (4309 + new).
- `HC_DEV_OPTIONS=1 node server/scripts/soloSmoke.mjs` -- expected: one client, 20 hulls afloat,
  countdown fires without a second human, match reaches `active`, results broadcast.

**Manual checks:**
- Screenshot the home screen for Eric — the second button's styling is UNRULED (DESIGN.md has no
  secondary button spec) and ships as a proposal, not a settled decision.
- `git grep -n "solo" server/src/game/` -- expected: NO hits. The word must not reach the simulation.
