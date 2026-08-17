---
status: blocked
blocking_condition: intent gaps — pre-implementation question gate (Eric rulings required)
story: 'Story 6.5 — Solo vs AI Mode'
cycle: 97 (0.17.97 if landed)
created: '2026-08-17'
base: origin/main @ f4944b4 (cycle 96, 0.17.96, PROTOCOL_VERSION 40)
---

# Story 6-5 — Solo vs AI Mode: pre-implementation question gate

Eric asked for questions before implementation. This is the gate. Four parallel read-only
investigations were run against `origin/main` (queue/room plumbing, the bot API surface, the client
home screen + DESIGN.md, and an adversarial audit of the match lifecycle under a 1-human + 19-bot
roster). Everything below is evidenced with `file:line`; where a claim is an inference rather than a
citation, it says so.

**Read §0 first — it changes what this story is.**

---

## §0. THE HEADLINE: the termination debt is DISCHARGED, not inherited

The ledger flags this three times (`deferred-work.md:876`, `:1028`, and in code at
`server/src/game/match.ts:747-753`) and says outright: *"Give it the rule at spec time; do not let it
arrive as a review finding."*

**Finding: Solo vs AI does not need a new termination rule. The participant seam already resolves it.**

- The win predicate is `isAfloatCaptain` = `isParticipant(s) && isAfloat(s.lifecycle)`
  (`match.ts:312-314`), and `isParticipant` is `s.role !== 'fleet'` (`participants.ts:65-67`).
  **A bot counts in the win check.**
- `latchOutcome()` (`match.ts:794-804`) opens `if (captains.length > 1) return false;`. With 1 human +
  19 bots afloat that is 20 — the match simply runs, and latches when ≤ 1 participant remains.
- `latchedWinner = captains[0]` **may be a bot**: `winnerId` becomes the bot's id, `classifyEnd`
  returns `'fieldCleared'`, and the client renders `WINNER: <botname>` (`results.ts:111-116`).
- The sinking hold generalises for free — `holdsForSinkingCaptain()` (`match.ts:808-814`) tests
  `isParticipant(s) && isSinking(s.lifecycle)`, so a bot holds the finish for its 5 s window exactly
  as a human does.
- Sudden death (the 16:00 collapse, epic-3 amendment 27-30) guarantees structural termination even if
  every bot turtles.

**The gap that genuinely exists is a DIFFERENT case** and this story does not open it: *1 human +
only PvE fleet hulls* still has no defined end, and is pinned as current correct behaviour by
`drones.test.ts:911-919` (*'a solo captain wins immediately — with an EMPTY ocean'*). `queue.ts:78-84`
still refuses to form it, with that reason in its own comment.

**So the ruling this story owes is a one-liner, and it is a confirmation rather than an invention:**
*Solo vs AI terminates under the ordinary participants-only rule — last participant afloat wins, a bot
may win, a same-tick wipe is the existing draw. Nothing forks on mode.* **Q6 below is the only real
decision hiding inside it.**

---

## §1. What is already correct and needs ZERO work

Recorded so the spec does not re-litigate it, and so scope stays honest:

| Area | Status | Evidence |
|---|---|---|
| Win check / draw / sinking hold with bots | correct | `match.ts:312`, `:794`, `:808` |
| Placements — bots occupy places, dense 1..20 | correct | `match.ts:879-893` |
| Results rows — bots included with real callsigns | correct | `match.ts:902-921` |
| Public kill register — a bot sinking is public | correct | `signals.ts:1367` (`isParticipant(wreck)`) |
| Bot kills pay full `killLevels` + move the bounty throne | correct | `world.ts:1699-1735`, `bounty.ts:67,86` |
| PvE fleets fire in any active match, no mode gate | correct (matches AC) | `world.ts:2626-2627` |
| Spawn lattice fits exactly 1 + 19 | correct | `spawn.ts:51` — 20 candidates from `playerCap` |
| Client-less participants (RTT, ack, lag-comp, disconnect) | safe by construction | `inputs.ts:176` (null rtt ⇒ zero lag comp); bots send `fireT: 0` |
| Bots are NOT caught by `isDroneHull` | correct | `render/ships.ts:143` matches only `drone*` ids |
| `queueStep` is already generic over its config | reusable as-is | `queue.ts:85-98` |
| D8 no-co-residency | respected | `StandardQueueRoom.ts:196-203` |

The simulation, the state machine and the economy are ready. **Every piece of real work in this story
is in the room/queue/client layer.**

---

## §2. The four things that are actually broken

### 2.1 Bots have no roster row — the largest hidden scope

`syncRoster()` walks `this.state.players` (`ArenaRoom.ts:943-957`), and rows are created in exactly
one place: `ArenaRoom.onJoin:534-544`, keyed by `client.sessionId`. `World.addBot()` never reaches it
— and `ArenaRoom.ts:524-527` says so explicitly: *"Story 6.4's AI captains will not [reach this
door]."*

Every symptom is client-visible; the fix is on the server. Each row below was confirmed at its call
site by two independent investigators:

| Surface | What a Solo vs AI player actually sees | Site |
|---|---|---|
| `n AFLOAT` | **`1 AFLOAT` for the whole match** while 19 bots hunt them | `main.ts:1254`, `score.ts:325-344` |
| Death banner | **`SUNK — 1ST OF 1`** when they died 14th — and it **latches** | `main.ts:1277-1283`, `score.ts:414-419` |
| Hull colour | **19 identical amber-hollow outlines** (the roster-miss fallback) | `ships.ts:91-110` |
| Nameplates | **none ever latch**; retried every frame | `nameplates.ts:76-88`, `contacts.ts:287-291` |
| Kill feed | **`UNKNOWN VESSEL SUNK BY UNKNOWN VESSEL`**, wall to wall | `killFeed.ts:33`, `main.ts:1079-1083` |
| Kill-leader register | segment **vanishes**; claim line reads `☠︎ UNKNOWN VESSEL…` | `main.ts:1105-1129` |
| Results modal | **correct** — 20 rows, real callsigns, right placement | `match.ts:902-921` |

Note the last row: the results table would be *right* while the chrome bar said `1 AFLOAT` all match.
Amber is also the reserved ACTION register, which `DESIGN.md:256` explicitly forbids as a combatant
hue — so the fallback is a design violation, not just a miss.

This directly contradicts three clauses of the story's own AC (`epics.md`): bots *"pick classes and
personal colors like players"*, *"read as combatants everywhere (class silhouettes, personal colors,
nameplates, kill feed)"*, and *"only drones are greyscale"*.

**Fix (small, but net-new server work):** after each `addBot()`, build a `PlayerMeta` with the bot's
id/name and a hue from `assignHue`, and `state.players.set(rec.id, meta)`. `syncRoster` then works
unmodified — its `world.ships.get(id)` lookup already resolves `bot-N`. Two constraints:
`REGATTA_HUES` is exactly **20** (`constants.ts:1702`), so 1 + 19 consumes the wheel exactly and
`usedHues()` must see the bot hues before the human joins (the human joins *after* room creation); and
`REGATTA_NO_HUE` (255) is the **drone-grey sentinel**, so leaving the default makes bots render as
drones.

### 2.2 A solo room is unconstructible in production — and fails SILENTLY

Four guards stack, and the failure mode is not an error:

1. `sanitizeExpectedCaptains` clamps `Math.max(v, CONFIG.match.minHumans)` — **`1` becomes `2`**
   (`roomOptions.ts:191-194`). It clamps against the CONFIG constant, **not** against the room's
   effective minHumans. Not dev-gated.
2. `const enough = this.humanCount() >= this.minHumans;` (`match.ts:427`) — permanently false with one
   human, so `startCountdown()` is never reached.
3. `matchOverride.minHumans` is the only existing way to set 1, and it is **stripped unless
   `HC_DEV_OPTIONS=1`** (`roomOptions.ts:164-176`).
4. `queue.ts:86,91` — a lone captain never arms and never forms.

**Consequence if wired naively:** the room boards, burns the 20 s boarding grace, and then sits
**frozen forever** — dead helm, no weapons, no radar (`match.ts:684-694`) — with the backstop clock
(`match.ts:525`) re-running the same failing gate every tick. No exception, no log, no timeout.

### 2.3 Bot spawn timing is a one-tick trap

Bots must be in `world.ships` **before** the `Match.update()` tick that runs `activate()`:

- `activate()` snapshots `participants` from `world.ships` (`match.ts:585-594`);
- `checkWin()` runs **in that same `update()`** (`match.ts:533-537`) — with only the human present,
  `captains.length === 1` latches an **instant human victory**;
- `recordSink` refuses ids outside the snapshot (`match.ts:712`), so a late bot sinks unrecorded, with
  no placement and no results row.

And the old injection seam is gone: *"(The drone-fill seam died with the fill itself — Story 5.6,
amendment 41…)"* (`match.ts:123-125`). Bots must be added at room creation / boarding.

**This regression is invisible to the existing suite** — the insta-finish is *pinned as correct* by
`drones.test.ts:911`.

### 2.4 There are no Match + bots integration tests at all

`match.test.ts:661` covers fleet hulls only, noting the two were *"coextensive until 6.4 lands bots"*;
`bots.test.ts` never constructs a `Match`. Nothing pins *"a bot wins"*, *"a bot holds the finish"*, or
a 1+19 run to completion. The AC's headless smoke is therefore load-bearing.

---

## §3. QUESTIONS FOR ERIC

Each carries the orchestrator's recommendation. Recommendations are **proposals, not decisions.**

### Q1 — The door: how does the arena get told to build bots? ⚙️ ARCHITECTURE

The tension is real and both sides are written down. `StandardQueueRoom.ts:6-12` and `:215-217` insist
*"the arena never learns the mode — it only ever receives seats"*, and mark `expectedCaptains`
*"Explicitly NOT a mode"*. The AC repeats it. **But the arena is the only place that can call
`world.addBot()`** — the queue cannot reach into it, because `createRoom` may dispatch to a different
process (D8, verified in `@colyseus/core` 0.17 `MatchMaker.mjs:226-240`).

- **(a) RECOMMENDED — a second queue room + two NUMBERS on `createRoom`.** `gameServer.define('soloQueue', SoloVsAiQueueRoom)`,
  reusing `queueStep` with `{minHumans: 1, cap: 1, queueTimerMs: 0}` (forms instantly on the first
  joiner, no new decision logic). It creates the arena with `expectedCaptains: 1` **and**
  `botCount: 19`. The arena branches on *how many bots to build*, never on *which mode this is* — a
  count is a parameter, a mode is a fork. Both fields server-authored, both clamped by their own pure
  sanitizer in the `expectedCaptains` idiom, neither client-supplied.
- (b) One queue room with a client-supplied `mode` option. **Rejected** — puts a mode discriminator on
  a client-supplied path, which is exactly what the epic forbids.
- (c) Arena infers it: `expectedCaptains === 1` ⇒ fill to cap with bots. Fewer fields, but couples two
  unrelated meanings and makes a future 2-human-vs-bots lobby unexpressible.

**Q1 also requires relaxing `sanitizeExpectedCaptains`'s floor from `CONFIG.match.minHumans` to 1, and
deriving the room's effective `minHumans` from `expectedCaptains` for queue-formed rooms** — otherwise
§2.2 bites. This is a security-gate edit, so it is surfaced rather than assumed. Recommended shape:
floor of `1`, ceiling unchanged at `playerCap`; `botCount` clamped to `[0, playerCap - 1]`.

### Q2 — The home screen's second button: DESIGN.md has no answer 🎨 DESIGN

**The requirement is already ruled; the presentation is not.** `.decision-log.md:62` (Eric,
2026-07-16): *"launch modes = Solo and Solo vs AI (home must offer both minimally, no full
mode-selector)"*, echoed at `EXPERIENCE.md:31/35`. And `deferred-work.md:140` names **this story** as
the owner.

But `DESIGN.md` defines **exactly one button** (`:244`): *"Primary Button | Amber outline + glow
register… never a filled slab; mono uppercase letter-spaced label, sub-line for context."* There is
**no Secondary Button spec, no button-pair spacing, and no rule for which of two home actions is
dominant.**

The only two-action precedent in the repo is the results modal (`results.ts:733-741`): *"the secondary
(SPECTATE) is the same shape **unlit**, which is what keeps it the non-dominant action"* — amber + glow
for the primary, `--hc-phosphor` unlit for the secondary. That is a modal, not the home screen.

Sub-questions, all genuinely open:
- **Q2a Layout** — stacked below PLAY, or side-by-side? ⚠️ **Constraint:** the port column is a rigid
  ~668 px stack of hard px margins that does not ride the HUD ui-scale, has already overflowed a
  768 px viewport once, and is guarded by `containerFit.test.ts:104-115`. A second 86 px button plus
  margin adds **~112 px**. Side-by-side costs no height; stacked is the simpler read.
- **Q2b Dominance** — is `SOLO VS AI` the unlit secondary (SPECTATE precedent, recommended), or equal
  amber? At beta population zero it is the mode that always works, which argues the other way.
- **Q2c Label** — `SOLO VS AI`? `EXPERIENCE.md` says "Solo vs AI", the GDD says "Solo vs Bots", and
  `EXPERIENCE.md:256` already flags the rename as an open GDD correction.
- **Q2d Sub-line** — shipped grammar is `DEPLOY AS <CLASS> · SOLO`, pinned by `home.test.ts:36`.
  Extension to `DEPLOY AS TORPEDO BOAT · SOLO VS AI` is the obvious read but is **inference, not a
  quoted rule**. `EXPERIENCE.md:67` binds only that the sub-line *"always states what will happen"*.
- **Q2e Enter** — `EXPERIENCE.md:124` binds *"Enter | Home: same as SET SAIL"*. **Recommended: Enter
  stays PLAY, the second button is mouse/Tab only, no `⏎` chip on either** (today's PLAY has no chip,
  and `results.ts:786-796` makes the chip a truthfulness rule — it may only appear where Enter really
  does that thing). Anything richer starts becoming the 6-6 selector the decision log said not to build.

**Orchestrator recommendation: stacked secondary, unlit phosphor outline, label `SOLO VS AI`, sub-line
extended to `· SOLO VS AI`, Enter unchanged.** Every part of that is Eric's to overrule.

### Q3 — What happens when the solo player dies first? 🎮 GAME DESIGN — the one with real feel consequences

This is the sharpest *player-experience* question in the story, and it is not addressed anywhere in
the planning artifacts.

Traced: the human's death does **not** end the match (§0). With 19 bots afloat there is no latch, so
the player watches a **bot battle royale that can run to the 16:00 sudden-death collapse** — up to
~15 minutes of spectating hulls they have no stake in. And if they quit instead, `onDispose` fires
`emitMatchAbort('abandoned')` (`ArenaRoom.ts:857-862`) and **no `ResultsMsg` is ever broadcast** — they
lose their placement entirely.

- **(a) RECOMMENDED — change nothing in the arena.** The match runs to completion; the player
  spectates or returns to port. It is the only option that keeps *"the arena never knows the mode"*
  literally true, and it is what a human already experiences dying 14th in a Standard match.
- (b) End the match when the last **human** sinks. Honest for a single-player mode ("your run is
  over"), but it is a **mode fork inside the arena** — explicitly forbidden by the AC — and it would
  make the bot BR meaningless.
- (c) Keep (a), but let a player who returns to port after dying still receive their results. This
  targets the genuinely bad outcome (quit ⇒ placement lost) without forking on mode. **Note this is a
  pre-existing hole that affects Standard play identically** — so it is arguably its own interstitial
  rather than 6-5 scope. Flagged, not assumed.

If (a) is taken, the accepted cost should be stated in the amendments: *a solo player who dies early
either watches bots for up to 15 minutes or forfeits their results screen.*

### Q4 — Bot class distribution: uniform random, or a balanced field? 🎮 GAME DESIGN

`BotController.enroll` picks `rng.pick(SHIP_CLASS_IDS)` — **uniform random per bot**
(`ai/botDriver.ts:154-155`). Across 19 bots that can land lopsided (nine battleships is an ordinary
draw). By contrast the batch-sim's *captains* use round-robin `SHIP_CLASS_IDS[i % 3]`
(`runner.ts:298-303`).

Solo vs AI is *"the live tutorial"* (`EXPERIENCE.md:37`) and the launch-day first match for most
players, so what they meet on the water is what they learn the game is.

- **(a) RECOMMENDED — round-robin/balanced**, so every solo match fields all three hulls in roughly
  equal number (6/6/7 across 19). Best tutorial value, lowest variance.
- (b) Leave uniform random — more match-to-match variety, occasional degenerate fields.
- (c) Weighted (e.g. favour Torpedo Boat as the most legible opponent).

`addBot()` currently takes **zero parameters** and auto-derives everything, so any answer but (b)
means widening its signature — a small, contained change.

### Q5 — Two small identity questions bundled 🎮 GAME DESIGN

- **Q5a Callsign collision.** The 30-name pool (`constants.ts:570-577`) is drawn without repeat among
  bots, but **uniqueness is not enforced against the human's name** — a player calling themselves
  `SQUALL` silently shares it with a bot. **Recommended: exclude the human's chosen callsign from the
  bot draw.** Cheap; prevents a confusing kill feed.
- **Q5b `n AFLOAT` semantics.** Giving bots roster rows makes `afloatCount` return **20**, not 1. Epic-4
  (The Public Register) ruled *"`n AFLOAT` counts CAPTAINS ONLY"*, superseding an earlier all-hulls
  reading. Bots are participants, not drones, so counting them is the consistent reading and the
  honest number — but it **restates a ratified ruling's wording**, so it is surfaced rather than
  quietly done. **Recommended: AFLOAT counts PARTICIPANTS (captains + bots, never fleet hulls)**, with
  an amendment recording the wording change.

### Q6 — Confirm the termination ruling ✅ CONFIRMATION

Per §0: *Solo vs AI terminates under the ordinary participants-only rule. A bot may win, and the
results modal will name it. The undefined case (1 human + only PvE fleets) stays refused by the queue
and is NOT opened by this story.* **Confirm, and the three-times-flagged ledger debt closes.**

### Q7 — Scope boundary with Story 6.6 📋 SCOPE

6-6 owns *Mode Select & Queue Liveness*. **Recommended reading:** 6-5 ships the minimal honest second
button and the working mode; 6-6 grows the real selector, player counts and dead-queue steering.
Concretely, 6-5 would **not** build: a mode-selector control, queue liveness counts, or
`hullcracker.mode` persistence in localStorage (`lastDeploy` at `main.ts:4126` would need a mode field
for the auto-requeue path — recommend deferring with it). **Confirm or redraw.**

### Q8 — The `?direct=1` dev escape 🔧 DEV

Epic-6 amendment 9 ledgered this for exactly now: *"when Solo vs AI ships, it becomes the honest
answer to 'I want to play right now on my own', and this escape can be reconsidered — but not deleted
casually, because a bot lobby is not the same instrument as an empty ocean when what you are measuring
is the feel of one hull."* **Recommended: KEEP it unchanged.** Amendment 9 already argued its own case
and nothing has changed; a bot lobby does not replace an empty ocean for handling work.

---

## §4. What the spec will contain once these are ruled

Sketched so the size is visible. Nothing here is started.

- `shared/src/constants.ts` — `CONFIG.bots` gains a count (no bot-count tunable exists today; **19
  lives only in prose**). Queue config for the solo pool.
- `server/src/rooms/roomOptions.ts` — `sanitizeExpectedCaptains` floor 1; new sanitized `botCount`.
- `server/src/rooms/SoloVsAiQueueRoom.ts` — NEW (+ a shared base extracted from `StandardQueueRoom`,
  whose `cfg` and `ARENA_ROOM`/`MODE` constants are currently private/module-level).
- `server/src/app.config.ts` — register the second queue room.
- `server/src/rooms/ArenaRoom.ts` — build `botCount` bots at create, **before boarding**; `PlayerMeta`
  row + hue per bot; hue ordering vs the human's join.
- `server/src/game/world.ts` / `ai/botDriver.ts` — `addBot()` gains class-selection control (Q4) and
  callsign exclusion (Q5a).
- `client/src/ui/home.ts` — second button (Q2); `client/src/net/connection.ts` — room name is a
  hardcoded literal at `:359` and `connect()` has no mode parameter.
- `client/src/ui/home.ts:167` — `AWAITING A SECOND CAPTAIN` must never render for a solo queue.
- Tests: `home.test.ts:36` (`· SOLO` sub-line) and `:83` need reading before any copy change;
  `containerFit.test.ts` guards the column height; new Match+bots integration tests (§2.4); a
  `soloSmoke.mjs` headless smoke proving queue → countdown → live → win/loss → reveal → results.
- `PROTOCOL_VERSION`: **expected to stay 40.** Nothing on the arena wire moves; the new channels ride
  the queue room, and `CONFIG.bots` is server-only simulation constants the client never reads —
  governed by amendment 26's stated rule, *"a CONFIG block bumps PV when the CLIENT READS IT, not
  merely because it rides the welcome."* To be re-verified at implementation, not assumed.

---

## §5. Risk ranking — what would silently ship broken

1. **Roster-derived client numbers** (`1 AFLOAT`, latched `SUNK — 1ST OF 1`). Every function is
   individually correct and unit-tested against a captains-only roster; the composition is flatly
   wrong in solo. **Nothing throws.**
2. **Identity blackout** (`UNKNOWN VESSEL` feed, vanishing kill-leader register, plateless amber
   bots). Renders "working" in every existing test.
3. **Bot spawn one tick late** ⇒ instant human victory, and the existing suite *pins that as correct*.
4. **The door guards** — naive wiring either ships an `HC_DEV_OPTIONS` bypass or a room frozen forever.
5. **Quit-after-death loses results entirely** (Q3).
6. **Zero Match+bots integration coverage** — the smoke is load-bearing.
7. Minor: `latestSunkHuman` / `'lastHumanSunk'` are now misnomers (they walk participants); the
   telemetry docstring *"drones never win"* is stale now that a bot can.

---

## §6. Answer format

Answering Q1–Q8 (a bare `(a)`/`(b)` per question is enough, with any override) unblocks
implementation. Q1, Q2 and Q3 change the most work; Q6 and Q7 are confirmations; Q8 has a standing
recommendation to change nothing.
