# Epic 6 Context — Ratified Amendments (durable; survives recompiles)

Append-only. Every entry is a dated, source-attributed ratified correction to Epic 6 planning
context. On any conflict between an amendment here and planning-artifact-derived content in
`epic-6-context.md`, **the amendment wins**. No tooling step may regenerate, prune, or rewrite this
file.

---

## Amendment 1 — The lobby leaves the arena. The queue replaces the ready room.
**Source:** Eric, 2026-08-14, Story 6.1 question gate.
> "I don't mind if a queue replaces the current waiting room."

The gate put three shapes to him: (a) a queue that replaces the in-game weapons-safe ready room,
(b) a thin queue that feeds it, (c) an advisory queue. The orchestrator recommended **(b)** on the
grounds that the ready room is ratified UX (UX-DR30 — sail a live hull with the full HUD while
`AWAITING CAPTAINS n/2`), and that (b) keeps a single fill-or-timer authority. **Eric took (a)** and
explicitly removed that objection as a blocker. So this amendment supersedes the orchestrator's
recommendation, not the other way round — recorded that way deliberately.

Consequence accepted: for standard play, waiting is no longer sailable. `UX-DR30`'s waiting-room
grammar survives only for the dev/sandbox door and for whatever 6.6 builds on the home screen.

## Amendment 2 — The lobby clock is 2:00, the countdown is 0:10, and a full lobby skips the wait.
**Source:** Eric, 2026-08-14.
> "What I want to happen is a 2:00 countdown, and then the game starts (with a 10 second countdown).
> If the lobby fills up to max players, it should jump right to the 10 second countdown and then
> start the game."

Lands as `CONFIG.match.queueTimerMs = 120000` (new), `CONFIG.match.countdown` **15000 → 10000**, and
`CONFIG.match.joinWindow` **30000 → 0**.

`joinWindow: 0` **retires the arena's own gathering phase in production** — the queue owns the wait
now. Zero routes `Match.notifyRosterChanged` straight from `waiting` to `startCountdown` through the
pre-existing "legacy immediate countdown+lock" path, so no state-machine surgery was needed. The
`gathering` phase is deliberately **left in the machine** (still reachable via `matchOverride`, still
covered by its own tests) rather than deleted; deleting it would touch `phase.ts`, `chromeBar.ts`,
`score.ts` and `settings.ts` for no behavioural gain.

Note this also closes a question the interim join-window spec explicitly deferred to Epic 6
(`spec-join-window-before-countdown.md:116,123`): **a full room now early-arms.** It previously did
not.

## Amendment 3 — The 2:00 clock starts at the SECOND captain and is a hard deadline.
**Source:** Eric, 2026-08-14, answering the gate's Q1: *"2nd captain is fine."*

The clock arms the first time the pool reaches `minHumans` (2), never at the first captain — a
countdown that cannot fire is a lie, and min-2 is emphatic (FR34, GDD, Eric).

**And `armedAtMs` is never moved once set**, by any later join, leave, or rejoin. That second half is
the orchestrator's ruling under Eric's "implementation is up to you", and it deliberately closes the
hostage-cycling vector at `deferred-work.md:319` — where leaving and rejoining reopened a fresh 30 s
gathering window each time, letting one player hold a lobby indefinitely. **That ledger entry is
resolved by this amendment.**

Corollary, ledgered rather than hidden: if the deadline passes while the pool has fallen below 2, no
match forms, and the match forms as soon as a second captain returns — which can be near-instant for
whoever was already waiting. Accepted; the alternative (re-arming) is the hostage vector.

## Amendment 4 — A lone captain waits, and the queue says so.
**Source:** Eric, 2026-08-14, answering the gate's Q2: *"That's fine too."*

At launch-day zero population a single queued captain waits indefinitely: min-2 is emphatic, bot-fill
is forbidden (FR34), and Solo vs AI does not exist until Story 6.5. The queue reports the honest
state (`startsInMs: null`, captains pooled vs required) and does **not** run a countdown that cannot
fire. This is the common case until 6.5 lands, and it is a known cost rather than an oversight.

## Amendment 5 — Seat reservation bypasses `onAuth`, so the version gate moves to the queue.
**Source:** Orchestrator finding, 2026-08-14, verified against installed `@colyseus/core` 0.17.10.

`MatchMaker.callOnAuth` is invoked only from `joinOrCreate`, `create`, `join` and `joinById`.
`reserveSeatFor` / `reserveMultipleSeatsFor` call `remoteRoomCall(roomId, "_reserveSeat", ...)`
directly and **never** touch it. `ArenaRoom.static onAuth` is the `PROTOCOL_VERSION` join gate.

Therefore the moment players reach the arena through a queue reservation, **the version gate silently
stops running** — a stale client seats successfully and desyncs against a wire contract it does not
implement. The gate is re-implemented at the queue's door using the existing pure
`protocolVersionError`.

The same asymmetry has a second, useful consequence: because `onAuth` now runs *only* on direct
`joinOrCreate('arena')`, it is exactly the right place to close the arena's public door (dev door
retained behind `HC_DEV_OPTIONS`, which every headless smoke already sets).

Related and also ported: Story 0.3's JOINING-deadline guard (`CONFIG.net.joiningDeadlineSeconds`),
which defends against a client that never confirms join squatting a slot while the transport buffers
frames unboundedly. A queue is a second front door and inherits none of it.

## Amendment 6 — `PROTOCOL_VERSION` does not move for Story 6.1.
**Source:** Orchestrator ruling, 2026-08-14.

The arena's wire contract is untouched — `WelcomeMsg`, frames, `ArenaState` and every wire type are
byte-identical. What changed is the *matchmaking handshake*, which is not what the constant versions.
`MSG.queueStatus` / `MSG.seat` / `QueueStatusMsg` are additive and ride the **queue** room only.
Compatibility for queued players is carried by amendment 5's gate instead. PV stays **36**.

## Amendment 7 — The convergence complaint is a timer problem, not a topology problem.
**Source:** Orchestrator finding, 2026-08-14. Corrects an instruction in the ledger.

`deferred-work.md:365` instructs the 6.1 spec author to treat the 2026-08-02 ~10-player playtest
(*"tough getting us all in the same game"*) as **the primary observed failure mode the queue design
must solve**. Tracing it: the scatter was caused by the **45-second hard deadline** (30 s gathering +
15 s countdown), after which `startCountdown` locks the room and `joinOrCreate` routes the next
arrival to a **brand-new** room — `matchSmoke.mjs:455` asserted exactly that.

**A queue does not fix this by existing.** Once a match has started, nothing can put a late friend
into it. What the queue buys is that the late friend waits *in a visible pool* rather than alone in
an empty ocean — honesty, not convergence. The actual convergence lever is the **timer**, and
amendment 2 moves it from 45 s to 2:10. The ledger entry should be read with this correction
attached; any future spec claiming the queue itself solved the playtest complaint is overclaiming.

## Amendment 8 — Boarding: everyone drops in frozen, and the countdown waits for the last loader.
**Source:** Eric, 2026-08-14, correcting the Story 6.1 implementation mid-flight.
> "At 2:00 wait with at least 2, or at full lobby capacity, the game should drop everyone into their
> start location on the map, with movement/weapons locked and radar off. Once everyone is loaded, the
> 10 second countdown begins. Then the game starts."

This **reverses an orchestrator ruling**, recorded plainly: spec-6-1's Design Notes had argued there
was no need for an "everyone loaded" handshake, on the grounds that seats are reserved in one tick,
clients consume within about a second, and a straggler's reservation expires at 15 s anyway. Eric
wants the gate to be real. It is now a requirement, not an optimisation.

Three things this settles that the earlier design did not:

1. **There is a BOARDING state between seating and countdown.** The arena holds after creation until
   the roster reaches `expectedCaptains` (passed by the queue at `createRoom`, clamped to
   `[minHumans, playerCap]`), then starts the 0:10 countdown. A boarding grace is still required as a
   backstop so one client that never loads cannot hold the lobby forever — it must exceed the 15 s
   `DEFAULT_SEAT_RESERVATION_TIME`, since a seat that has expired is never going to be consumed.
2. **The pre-live state is FROZEN, not a ready room.** Movement locked, weapons locked, radar off,
   from drop until `active`. This finishes what amendment 1 started: the sailable weapons-safe ready
   room is gone in production, and what replaces it is not a smaller ready room but a held start
   line. Note the direction of change — today's `waiting`/`countdown` phases let a player drive
   freely and fire with damage merely suppressed; that is now the dev/sandbox door's behaviour only.
3. **Players see their start location before the match starts.** Spawn placement is therefore
   disclosed during boarding, which is a deliberate, ruled change: your position on the ring is known
   to you before the gun.

Implementation seam, for the record: `match.ts` already funnels phase-derived world gates through one
place (`w.damageEnabled = this.phase === 'active'`, and `xpEnabled` beside it). The movement, weapon
and radar locks hang off that same line rather than being scattered, which keeps a single derivation
point in the `effectiveStats()` tradition.

## Amendment 9 — The queue costs solo playtesting, so a dev escape ships with it.
**Source:** Orchestrator finding + ruling, 2026-08-14. Not yet reviewed by Eric.

A consequence nobody asked about and the story would otherwise have shipped silently: **with the
queue in front of the arena, one player can never start a match.** `minHumans` is 2 and emphatic,
bot-fill is forbidden, and Solo vs AI is Story 6.5 — so a lone captain pools at 1/2 and waits
forever. Before 6.1 that same captain got a sailable weapons-safe ready room and could evaluate
handling, gunnery feel and the map on their own. That is Eric's primary playtest loop, and it would
have disappeared without a line of warning.

Worse, `npm run dev` did not set `HC_DEV_OPTIONS`, so the arena's newly-closed direct door was shut
in local development too — leaving *no* way to reach an ocean solo from a browser.

Two changes, both dev-only:
- `server/package.json`'s `dev` script now sets `HC_DEV_OPTIONS=1`. Production (`start`) is
  deliberately untouched, so the direct door stays closed where it matters.
- `client/src/net/connection.ts` gains `?direct=1`, which skips the queue and joins the arena
  straight. It is guarded by `import.meta.env.DEV` (NFR17's "nothing debug ships" — the branch is
  stripped from the production bundle) **and** independently by the server's `HC_DEV_OPTIONS` check,
  so it is two locks deep.

A room entered this way is **not** the frozen start line. The server boards only rooms the queue
created — boarding is keyed on `expectedCaptains`, which only the queue sets — so a direct join
behaves exactly as the game did before Story 6.1. That is the point: the escape restores the old
loop rather than offering a degraded version of the new one.

Ledgered for Story 6.5: when Solo vs AI ships, it becomes the honest answer to "I want to play right
now on my own", and this escape can be reconsidered — but not deleted casually, because a bot lobby
is not the same instrument as an empty ocean when what you are measuring is the feel of one hull.

## Amendment 10 — The cohort is sealed at forming. No late arrivals, structurally.
**Source:** Eric, 2026-08-15.
> "The timer is now 2:00. Once that timer is up, (or the room is full) the match begins. No more late
> arrivals. Everyone loads in, then the timer counts down from 10."

Mostly a restatement of amendments 2/3/8, which shipped as described. The one clause that was only
INCIDENTALLY true is **"no more late arrivals"**, and this amendment makes it structural.

Before: a queue-formed arena was created unlocked and public, and locked only at `startCountdown()`.
Nobody could actually reach it, because `ArenaRoom.onAuth` refuses every direct join without
`HC_DEV_OPTIONS` — but the guarantee rested entirely on that one door being shut, and on `createRoom`
always minting a fresh room rather than reusing one.

Now, two changes:
- **Sealed from birth.** `ArenaRoom` locks itself in `finishCreate` whenever `expectedCaptains` is
  set (which only `StandardQueueRoom` sets). Verified against `@colyseus/core` 0.17.10 and then
  re-verified live: `_reserveSeat` checks `maxClients` and never consults `locked`, and the join path
  consumes a reservation without testing it either — the queue smoke still seats 19 captains into a
  room that was locked before a single seat existed.
- **Never unlocked.** `Match`'s `countdown && !enough` branch previously called `hooks.unlock()`,
  which would have re-opened a lobby that had already closed. It is now skipped for queue-formed
  rooms. The dev/sandbox ready room keeps unlocking exactly as it always has.

**A consequence that needed its own decision, flagged as UNRULED.** Sealing the room means a cohort
that falls below `minHumans` can never refill. That is reachable only by a **2-captain lobby losing
one during the 0:10 countdown** — any larger cohort still has `enough` and is untouched. Left alone,
the survivor would sit in a frozen ocean forever with no exit but a page reload, so the room now
**collapses** (`hooks.disconnect()`) and the survivor lands home able to re-queue.

That is the orchestrator's call, not Eric's, and it is deliberately the conservative one: the honest
alternative is to **start the match anyway with a single captain**, which cannot be done until Story
6-5 supplies the solo-termination rule amendment 4 created (a lone captain afloat has no defined way
to win or lose). If that rule lands first, this collapse should be revisited.

## Amendment 11 — The ocean does not scale. Story 6.2 is closed won't-do, and FR27's map clause with it.
**Source:** Eric, 2026-08-15, at the Story 6.2 question gate.
> "Yeah, we can close this. We won't be scaling the map size."

Story 6.2 (Roster-Scaled Oceans) asked the map to size itself from the roster at countdown. **It is
cancelled.** The ocean stays a fixed 2800u-radius disc at every roster, as set by epic-5 amendment 42.

**The finding that produced the ruling, recorded because it is counter-intuitive and will otherwise
be re-derived:** the roster-scaling machinery is fully plumbed and has never once done anything.
`mapRadius(cap) = baseRadius * sqrt(cap / capRef)` exists in CONFIG, `WelcomeMsg.playerCap` is on the
wire, and the client already rebuilds from it — but `ArenaRoom` builds its World at room creation
with the constant `CONFIG.map.playerCap`, and `capRef` equals `playerCap`, so the square root is
always √1 and the function has always returned exactly `baseRadius`. That was true at 900u (capRef 6),
at 2400u and at 2800u. **A lobby that filled to 20 always got the same ocean a lobby of 2 got.**

Story 6.1 did not change this, but it did make the roster *knowable* at creation time for the first
time (`expectedCaptains`, sealed at forming by amendment 10), which is why 6.2 became buildable as a
one-argument change at `ArenaRoom.ts`'s `new World(...)` call. Eric declined it.

**Measured evidence behind the decline** (rosters 2-20, three seeds; full table in
`bmad-dev-auto-result-6-2-roster-oceans-questions.md`). Generation is valid at every size and land
coverage holds at ~2.5% throughout, so nothing was blocking it technically. What moved was the game:
at cap 2 the map would be 885u, where the FIXED 660u endgame ring is already 56% of the water at 0:00
(vs 5.6% at cap 20) and radar reaches 75% of the map radius (vs 24%) — the storm stops being a pacing
instrument and Epic 4's whole sensor calibration, which is anchored to a 2800u ocean, loses its
premise.

**Two consequences that must not be lost:**

1. **FR27's map clause closes as won't-do.** Its other half — spawns outer-ring, max-min mutual
   distance, island-clear — already ships and was verified during this gate: even-spacing chord on
   the spawn ring is 701u at cap 20 and 1417u at cap 2, above radar range (660u) at every size.
2. **The dormant machinery is deliberately KEPT, not deleted.** `mapRadius()`, `capRef`, the
   `generateMap(seed, playerCap)` parameter and `WelcomeMsg.playerCap` all stay. They cost nothing,
   the wire field is already shipped at PV 36, and the TEAMS work (see below) may yet need the ocean
   to size on hulls — in which case the input changes and the curve is already there. Deleting them
   would be the expensive-to-reverse direction.

**What this orphans, re-homed rather than dropped:** `deferred-work.md`'s teams entry recorded Eric's
*"~20 teams of 1-3 players, with enough room that all teams can spawn with a buffer"* ruling and
named Story 6.2 as the owner of roster-dynamic sizing. With 6.2 cancelled that pointer is dangling.
Teams remain unhomed Epic-6-era scope; if they land, the sizing question reopens **in the opposite
direction** (up to 60 hulls wants a bigger ocean, not a smaller one), and this amendment is the
reason the curve was left in place for it.

## Amendment 12 — UNRULED: the PvE wave table is absolute, and that may be correct.
**Source:** Orchestrator finding at the 6.2 gate + Eric thinking aloud, 2026-08-15. **Not ruled.**

Surfaced during the 6.2 investigation and explicitly left open. `CONFIG.fleet.waves` is absolute —
4 / 2 / 1 fleets at 1:00 / 5:00 / 9:00, so **36 PvE hulls arrive at 1:00 whether the match has 2
captains or 20** (18.0 hulls per captain at cap 2, 1.8 at cap 20). Epic-5 amendment 45's stated
rationale reads *"The wave sizes are a RATIO, not a budget: one fleet per ~5 captains"*, which the
shipped table does not satisfy at any roster below 20.

**This is a live gap in shipped code today and has nothing to do with map sizing** — it was found
here only because both questions are about density.

Eric's reaction, verbatim and left standing:
> "The Ratio is assuming there are 20 captains, sure. If there aren't, then they will have a lot more
> to hunt, wont they? The ocean would be *really* empty without them at 2800u and 2 players. FFS, now
> I don't know the right answer here at all."

**The orchestrator's read, offered as reasoning and NOT as a ruling:** the contradiction is probably
verbal rather than real. Amendment 45's ratio language was justifying a total XP budget (21 levels
across a match) at the 20-captain design point; it was never a law meant to hold at every roster. The
one number is doing two jobs — *how much XP exists* and *how full the water feels* — and Eric's
instinct catches the second one, which the ratio phrasing would destroy.

What genuinely changes at low rosters is **leveling speed**, not fairness: two captains have ~18
hulls of largely uncontested XP each instead of 1.8 contested ones, so small matches become
high-boon. That is **symmetric** between the captains, so it is a flavour difference rather than an
imbalance, and a small lobby resolving into a fast boon-heavy slugfest is arguably the right shape.

**Recommended default: change nothing.** The shipped table is the measured, evidenced state; every
alternative is a change with no evidence behind it. The real hazard is the WORDING — "it's a RATIO,
not a budget" reads as a requirement the table violates, so a future agent will eventually "fix" the
table to match a rationale that was never a requirement. **Amendment 45's text was deliberately left
unedited** (a change signal authorises only what it rules on, and Eric ruled on the map, not on
this); this entry exists so the next reader finds the reasoning before the temptation.

Answering it properly needs two different instruments: the batch-sim harness can measure whether
small-lobby leveling runs away, but "does a 2-captain 2800u ocean feel empty, and does the PvE
out-threaten the PvP down there" needs eyes on the water. Ledgered to the standing playtest
checkpoint rather than guessed at.

## Amendment 13 — The participant seam is built NOW, ahead of its consumer.
**Source:** Eric, 2026-08-15, Story 6.3 question gate. **Overrules the orchestrator's recommendation.**

The gate reported honestly that Story 6.3 was ~80% already satisfied: the captains-only win check
landed in 5-1 (amendment 4), the sinking/latch semantics in 5-2 (amendment 20), the PvE exclusion in
5-6, and all three of the AC's named tests already exist and pass. The orchestrator recommended
**gap-close and mark done**, deferring the "AI combatants are participants" half to 6-4/6-5 on the
grounds that designing a predicate with no consumer is designing blind.

**Eric chose to build the full seam now.** Recorded as an override, not as agreement.

What that means concretely: `ShipRecord.isDrone` today does TWO jobs — it means *"this is a PvE fleet
hull"* (economy tier, kill-feed suppression, bounty exclusion, fleet aggro, nameplate greyscale) and
it means *"this is not a participant"* (win check, placements, results rows, the sinking hold). Those
are the same set today and stop being the same set the moment Story 6.4 lands AI captains, who are
participants and are not fleet hulls. The seam splits the two readings so that 6.4 changes ONE
definition rather than auditing sixty call sites under time pressure.

`isDrone` is NOT on the wire — zero occurrences in `shared/` — so this is entirely a server/client
internal refactor and costs no protocol movement of its own.

**The client's second predicate moves in step.** `deferred-work.md` has carried *"a non-combatant
predicate now exists in two places, by necessity, and they must be kept in step"* since Story 5.6;
the client tests hull id (`isDroneHull`) because it has no flag to read. That stays true — a bot
captain will carry a real class hull id — but the seam is pinned by a test so the two cannot drift
silently.

## Amendment 14 — A draw gets its own read.
**Source:** Eric, 2026-08-15, Story 6.3 question gate.

A same-tick mutual kill has been a genuine outcome since Story 5.2 (`winnerId: ''`, epic-5
amendment 14), but it has never LOOKED like one: `makeBanner` renders the DRAW banner in amber, the
same hue a loss wears, and `spectateBannerText` has no draw case at all — a drawn match reads
`MATCH OVER — SPECTATING`, identical to watching someone else win.

Ruled: the draw is rendered distinctly from both victory and defeat, and the spectate banner gains a
draw case. It is the one match outcome a player currently cannot tell apart from losing.

Presentation only; the draw's RESOLUTION (latched at the wipe tick, `mutualDestructionWinner()`) is
untouched. The hue comes from `DESIGN.md`, not invented at the call site.

## Amendment 15 — A stranded survivor returns to the QUEUE, not home.
**Source:** Eric, 2026-08-15, Story 6.3 question gate. **A third option, not previously offered.**

Amendment 10 left this UNRULED and shipped the conservative call: a sealed 2-captain cohort that
loses one during the 0:10 countdown can never refill, so the room collapses (`hooks.disconnect()`)
and the survivor lands home. Amendment 10 named exactly two futures — keep the collapse, or start
the match anyway with one captain (which needs the solo-termination rule Story 6-5 still owes).

**Eric took neither.** The survivor is returned to the queue rather than dumped home: they were
one captain short through no fault of their own, and sending them back to the menu makes them pay
the full 2:00 wait again for someone else's disconnect.

**The honest limit of this, recorded rather than glossed:** `armedAtMs` is a COHORT property that
forming deliberately clears (see `queue.ts`'s `QueueState.armedAtMs` — a deadline later joins could
extend is the hostage-cycling vector amendment 3 closed). A returning survivor therefore cannot
inherit a running deadline; what they get is re-entry without a page reload and FRONT-of-pool
position, so they seat first when the next cohort forms. If the pool they return to is empty — the
common case, since this is only reachable from a 2-captain lobby — they wait for a second captain
exactly as any lone captain does (amendment 4). The 2:00 clock genuinely does restart; the menu trip
does not.

This does NOT revive the "start anyway with one captain" option: a solo standard match still has no
termination rule, and `queue.ts` still refuses to form one.

## Amendment 16 — `match.end` gains an outcome discriminator; `lastHumanLeft` is retired.
**Source:** Eric, 2026-08-15, Story 6.3 question gate.

Two telemetry defects, both surfaced at the gate, both ruled fixed:

1. **A draw is indistinguishable from an unfinished match.** `MatchEndSummary.winnerClass` is `null`
   for a genuine draw AND `null` whenever the winner lookup misses, so no consumer can count draws.
   An explicit outcome field lands beside it.
2. **`endedBy: 'lastHumanLeft'` is unreachable through any real socket session** and has been since
   the drone-gate removal — `ArenaRoom` steps the world and the match synchronously, so a departure
   can never land between a sink and the next win check. It survives only because a unit test drives
   sink-then-leave with no tick between. It is REMOVED, under the project's standing "no dead knob
   survives" rule (the same rule that deleted grey NO-DATA in cycle 69 and the storm radar return in
   cycle 72), rather than kept as a category only a synthetic test can produce.

Telemetry only — `MatchEndSummary` rides the `match.end` log line and never the wire.

## Amendment 17 — `PROTOCOL_VERSION` 36 → 37: the requeue signal rides the ARENA.
**Source:** Orchestrator, 2026-08-15. Not an Eric ruling.

Amendment 15 needs the arena to tell a stranded survivor *"go back to the queue"* rather than merely
dropping them, and that is a new server→client channel on the ARENA room. Amendment 6's reasoning for
holding PV at 36 through Story 6.1 was explicit and narrow — the queue's channels *"ride the queue
room only"*, leaving the arena wire contract untouched. That reasoning does not cover this one, so
the version moves.

The bump is cheap and safe by construction: `protocolVersionError` in `roomOptions.ts` rejects a
mismatched `pv` at the door, and amendment 5 moved that gate to the queue, so a stale client is
turned away with a clear message rather than half-joining a contract it cannot read.

## Amendment 18 — The stranded survivor goes HOME and re-queues automatically. Supersedes amendment 15's re-entry clause.
**Source:** Eric, 2026-08-15, on the orchestrator surfacing the front-of-pool security problem.
> "That doesn't provide any player value. I'd rather go back to the home screen and automatically
> join the next queue."

Amendment 15 ruled that a survivor of a collapsed cohort returns to the QUEUE rather than home, with
FRONT-of-pool position. Building it safely turned out to be the whole difficulty, and the orchestrator
surfaced it rather than quietly shipping the exploitable version:

- a client-asserted `requeued: true` join option is a **trivial queue-jump** — any client can claim it;
- a server-issued token needs state shared between `ArenaRoom` and `StandardQueueRoom`, which **D8
  forbids assuming** (no same-process room co-residency), re-affirmed by amendment 5.

Which left front-of-pool worth almost nothing anyway: this path is only reachable from a 2-captain
lobby, so the pool being returned to is nearly always EMPTY and there is nothing to be in front of.
Eric's response is the correct simplification, not a concession.

**Ruled:** the survivor returns to the HOME SCREEN — the shipped teardown, unchanged — and the CLIENT
then joins the next queue automatically, without the player pressing PLAY. The player-facing promise
of amendment 15 ("you do not pay for someone else's disconnect with a menu trip") is kept; the
mechanism that could not be secured is dropped.

**What this deletes from the plan:** `StandardQueueRoom` is not touched at all — no pool re-entry, no
front-insertion, no privileged position of any kind, so there is no new exploit surface to reason
about and the queue's arm/form policy in `queue.ts` is byte-identical.

**What survives from amendment 15:** the arena must still SIGNAL this case, because the client has to
tell a collapsed cohort apart from a normal match-end disconnect (which correctly returns to a home
screen that then waits for input). So `MatchHooks.requeue()` and the arena→client channel stay, and
amendment 17's `PROTOCOL_VERSION` 36 → 37 stands. The signal's MEANING changes from "re-enter the
queue in place" to "go home and start a fresh queue join".

**Unchanged and worth restating:** the 2:00 clock still restarts, because `armedAtMs` is a cohort
property that forming deliberately clears (amendment 3's hostage-cycling fix). No ruling has ever
promised otherwise. And this still does NOT revive "start the match anyway with one captain" — a solo
standard match has no termination rule until Story 6-5.

## Amendment 19 — The start line IS the start line. Boarding placement is the match spawn.
**Source:** Eric, 2026-08-16, reporting the defect.
> "After the countdown, it jumps them to a new random start location. I would like for it to place
> them into the game in the spot they will spawn in from the beginning, instead."

**A defect, not a design change** — it makes true what amendment 8 point 3 and Story 6-1's own AC
(`spec-6-1-queue-based-lobbies.md:109`, *"every one of them sees their own start location on the map
while the roster is still filling"*) already said. Boarding disclosed **a** location, which was then
discarded. The 6-1 spec's Design Notes never mention `resetForMatchStart`; boarding was built on top
of a pre-existing teleport nobody noticed was still in the activate path. Nothing was ever decided in
favour of the re-roll — it was inherited.

**Measured before the fix** (20 headless captains, real queue path, production timings): 20 of 20
displaced at countdown→active. Median **~2140u**, six near-antipodal at **~4470u — 160% of the 2800u
map radius**. Heading was re-derived too. Radius stayed 2240.00u before and after: hulls were moved
*along* the spawn ring, not off it.

`Match.activate()` → `World.resetForMatchStart()` → `redeployShip()` opens with
`pickSpawn(this.map, placed, this.rng)` against an **empty** `placed` list, so the re-roll was
entirely independent of where anyone stood.

**Gated to queue-formed rooms** (`expectedCaptains !== undefined`), Eric declining to rule on the fork
(*"I do not give a shit"*) and the orchestrator taking its own recommendation. The dev/sandbox
direct-join door keeps its re-roll because it is genuinely load-bearing there: that room is the old
sailable, weapons-hot ready room where captains really drive, really fire and really drain pools.
Confirming fact: **no test anywhere constructs a boarding room and asserts position or spawn-event
count at activation**, so the gated change breaks zero tests, while an ungated one breaks six
ready-room assertions headed by `match.test.ts:253`.

**Three rulings inside the fix, recorded because each is silently re-breakable:**
1. **No no-move spawn event.** Emitting one whose position equals the current position calls the
   client's `predictor.forceSnap()`, leaving `ownPose` null until the next server frame — during which
   `client/src/main.ts:3319` hides the own hull, nameplate, hotbar and xpRail. That is a visible blink
   at the exact moment the gun goes. Dropping it is safe because `updateMatchEpoch`
   (`client/src/main.ts:956`) already fires `resetOwnOrders(g)` on the `→ active` phase edge, and its
   doc comment states it is *"Idempotent with the server's own spawn event, which calls the same
   function."* **Zero client changes were needed.**
2. **The RNG-stream shift is accepted.** Skipping N `pickSpawn` draws advances the shared world `rng`
   differently, moving subsequent PvE fleet-wave anchors for a given seed. Nothing pins seed-stable
   fleet placement, and the batch-sim harness runs with no `expectedCaptains` so it keeps the old path.
3. **The rest of `resetForMatchStart` still runs.** Of `redeployShip`'s 31 mutations, all but three are
   provable no-ops in a frozen boarding room; only placement is gated.

**A trap for whoever touches the regression test:** the schema `matchPhase` patch lands a frame LATE,
so the frame carrying the teleport is still labelled `countdown` on the client. A naive "last
pre-active vs first active" comparison reports **0.00u** and falsely refutes the bug. Assert on the raw
position discontinuity.

**Ledgered, not fixed (Eric's call):** the foghorn is deliberately live on the frozen start line
(`client/src/input/keyboard.ts:264-270` — *"Eric's ruling names movement, weapons and radar, and the
horn is none of the three"*) and carries a bearing plus a recognizable horn variant out to 660u. That
was free while spawns were thrown away; with permanent spawns a honk gives away a real starting
bearing. Eric: *"Is anyone even close enough to hear it? Who the hell cares?"* Accepted. Note for the
record that the **audio is not panned** (`playHorn` takes gain only) but the **direction is drawn** —
a fading screen-edge chevron in `render/foghorn.ts`. Post-amendment-20 the minimum separation is 700.8u,
which is *outside* the 660u horn range, so this leak largely closes as a side effect.

## Amendment 20 — Twenty slots for twenty captains. Even spacing by construction.
**Source:** Eric, 2026-08-16.
> "there is no reason to have 32 potential start slots in a game meant for 20 players."

`SPAWN_CANDIDATES` was the literal **32** (`server/src/game/spawn.ts:27`). Placing 20 hulls into 32
fixed, evenly-spaced ring slots forces adjacent pairs **by pigeonhole** — not by bad luck. Adjacent
candidates are **439u** apart on the 2240u ring, which is inside the **660u** radar range and outside
the 330u truesight bubble. **So at every full lobby, several pairs started able to radar-paint each
other while unable to see each other.** Eric's bar, stated at the same gate: *"No participants should
start so close to each other that they can see each other, let alone radar scan each other."*

Deriving the candidate count from `CONFIG.map.playerCap` is **half** the fix, and the orchestrator
initially claimed it was the whole fix. **It is not, and the reason is the single most re-derivable
trap in this amendment.**

**THE COUNT ALONE DOES NOTHING, BECAUSE THE LATTICE WAS NEVER SHARED.** `pickSpawn` drew its phase
`offset` **fresh on every call** (`spawn.ts:220`), so each hull came off its own independently rotated
lattice and the 20 hulls of a full lobby never sat on one. The orchestrator's "20 captains fill all 20
evenly-spaced slots" reasoning silently assumed a shared lattice that did not exist. Refuted by
measurement before it shipped (60 seeds, 20 hulls, minimum pairwise separation):

| candidates | phase offset | min | median | max | seeds with a pair inside radar |
|---|---|---|---|---|---|
| 32 | per-call (**was shipped**) | 359u | 416u | 475u | **100%** |
| 20 | per-call (count change alone) | 352u | 415u | 483u | **100%** |
| 32 | per-world | 439.1u | 439.1u | 439.1u | 100% |
| 20 | **per-world (shipped)** | **700.8u** | 700.8u | 700.8u | **0%** |

So the fix is **both** halves: candidates = `playerCap` **and** the lattice phase drawn **once per
World** and passed to all three placement edges (`addShip`, `redeployShip`, `respawn`). Read the table
before touching either: changing one without the other returns the game to 100% of full lobbies
starting with a pair inside radar range. With both, a full lobby fills every candidate and spacing is
even by construction at `2 · 2240 · sin(π/20)` = **700.8u**. Partial rosters still spread properly
because max-min picks the far candidate first, so no slot-assignment machinery, join-order bookkeeping
or cohort-size plumbing was needed — **Eric's one-line reading still beat the orchestrator's proposed
even-spacing-slot scheme**, it just needed the shared phase under it.

The per-world phase was taken as delivering a ruling Eric had already made (*"No participants should
start so close to each other that they can see each other, let alone radar scan each other"*) rather
than as a new design decision — recorded plainly so the authority is traceable.

**The margin is only ~6% and that is the fragile part.** 700.8u against 660u is 40.8u of slack, and it
moves if ANY of the player cap, map radius, `spawnFraction` or radar range is retuned. Pinned with a
build-failing constraint test in the eighths-ladder idiom (`2·spawnRing·sin(π/playerCap) > radar`) so a
future retune fails the build instead of silently re-creating the bug.

**The consequence that cannot be fixed on this ocean, ledgered rather than hidden.** The ring
circumference is 14,074u, so 20 captains get 703.7u of arc each against a 660u requirement: **the ring
is saturated.** Any arrangement satisfying "nobody starts in radar range" at cap 20 is therefore
necessarily near-evenly spaced, and even spacing is **exactly derivable** — a player knows the ring
radius (the client rebuilds the map from the seed), the captain count (the chrome bar) and their own
position, so they can compute all 19 other spawns. **On a 2800u ocean, "nobody starts in radar range"
and "spawns are not predictable" are close to mutually exclusive.** Buying real jitter freedom needs a
bigger ring, not a better algorithm. Note this was *already* substantially true at 32 slots (only 32
possible positions existed); even spacing makes it exact rather than introducing the class.

**TEAMS REOPEN THIS, in the direction amendment 11 predicted.** Eric, same gate: *"the problem will
compound when I add duo/trio queues... teams would start in LOS of each other, but they still need to
be out of range entirely of other teams."* Teammates in mutual LOS must sit within 330u of each other,
which eats the inter-team gap down to ~370u — inside radar. Twenty trios do not fit on today's ring at
any spacing. Rough sizing: tight clusters (~100u apart) need map radius ~3024u (+8%); a comfortable
800u inter-team separation needs ~3195u (+14%). Amendment 11 left `mapRadius()`, `capRef` and
`WelcomeMsg.playerCap` in place for exactly this, and this is the amendment that cashes that bet.

## Amendment 21 — Your radar sweep starts at your heading.
**Source:** Eric, 2026-08-16, amending the orchestrator's proposal.
> "2 is a good idea, but it might be better if instead your radar sweep starts at the same heading you
> start?"

**The bug Eric found by intuition** (*"whoever is below and to the left has a big advantage... due to
how radar scans work for all players"*), confirmed in code: every ship is constructed with
`sweepAngle: 0` (`world.ts:1171`), and `world.ts:3626` refuses to advance the sweep while
`radarEnabled` is false — which is the **entire boarding freeze**. So all captains' sweeps sit locked
at 0 through boarding and all begin rotating from exactly 0 on the same tick, at the same 15rpm,
staying phase-locked for the whole match. For any pair, one paints the other exactly half a revolution
(**2s** of a 4s sweep) before the other, decided purely by relative bearing — i.e. purely by world
position. **Story 6-1's radar freeze created this**; before it, captains joined at different wall-clock
times and their sweeps were naturally out of phase.

The orchestrator proposed randomizing the initial phase. **Eric's alternative is better and was
adopted.** Worked geometry, recorded because the result is counter-intuitive: sweep-at-heading does
**NOT** equalize detection timing. Two adjacent captains at cap 20 — the counter-clockwise neighbour
paints first after 81° (~0.9s), the other after 279° (~3.1s), still a ~2.2s edge.

**What changes is the symmetry, and that is the whole point.** Under absolute-zero starts the edge is
decided by absolute world position, so one captain can beat their neighbours on *both* sides. Under
sweep-at-heading the formation is rotationally symmetric: **every captain gets the early look at one
neighbour and the late look at the other, identically.** Fair by structure rather than fair by luck —
which is strictly better than randomizing, since a random phase hands some players a good draw and
others a bad one every match.

**Accepted cost:** it is deterministic, so a player doing the math knows when a neighbour's beam will
sweep them. Judged not binding, since amendment 20 already makes positions derivable at cap 20.

Applied at every placement edge so there is ONE rule, not three (`addShip`, `redeployShip`, and
`respawn` where it re-places). `prevSweepAngle` must be set EQUAL to `sweepAngle` so the half-open
paint arc `[prev, sweep)` is zero-width on the first tick and nothing paints from the seam.

**`PROTOCOL_VERSION` stays 37 for all three of amendments 19-21** — no wire shape moves. Placement,
sweep phase and the candidate lattice are all server-authoritative internals.

## Amendment 22 — THE INTEL RANGE MERGE. One card drives the whole eighths ladder, and the ladder ordering becomes arithmetic.

**Eric rulings 2026-08-16.** `intelTruesight` and `intelRadar` are RETIRED and replaced by ONE
`intelRange` line (category `intel`, common, **4 copies**, ×1.15 radar range per card). Truesight
stops being independently purchasable: `EffectiveStats.sightRange` becomes a DERIVED field,
`radarRange / 2`, re-pinned post-fold in `sim/stats.ts` `clampStats` and in `sim/boons.ts`
`applyBoonStats` exactly as the three `rangeU` paths already were, and `'sightRange'` LEAVES
`BOON_STAT_PATHS` so nothing can address it again without failing to type-check.

**Why the merge, and why it is a fix rather than a buff.** The two intel lines moved
`sightRange` and `radarRange` INDEPENDENTLY, and the 5/8 muzzle-flash / wounded-smoke rung was a
FLAT constant at 412.5u. Two stacks of `intelTruesight` put a player's own sight bubble at
330 × 1.12² = 414.0u — PAST that rung — so both signal rows fired entirely inside the bubble where
the hull was already visible, and went informationally dead for their owner. Story 4.9 had moved
that rung 6/8 → 5/8 (495u → 412.5u), which halved the break point from 4 stacks to 2. With every
rung a fixed fraction of ONE number — detect 0.375R, sight 0.5R, muzzle/smoke 0.625R, farRadar
0.875R, radar R — the ordering `detect < sight < muzzleFlash < farRadar < radar` now holds at EVERY
stack level **by arithmetic rather than by invariant**. It is no longer a property that can be
violated. Measured across all five stack levels: HOLDS at each; zero boons is byte-identical to the
pre-merge base, because `CONFIG.vision.radar` IS `SIGHT * 2`.

**THE LADDER SCALES — and this supersedes epic-4 amendments 15/42/119 on the flat-halo clause.**
Eric: *"It scales. Intel range means your detection range on all levels gets further."* The `mz` and
`sm` gates in `game/signals.ts` now call ONE resolver, `muzzleFlashReach(me)`, returning
`me.stats.radarRange * CONFIG.vision.muzzleFlashFactor` (0.625). This REMOVES THE ODD ONE OUT rather
than creating an exception: 3/8 detect (`sightOf × detectFactor`), 4/8 sight (`sightOf`) and 8/8
radar (`me.stats.radarRange`) were ALREADY observer-scaled; 5/8 was the only consumed rung that was
not.

**Anchored on radar range, NEVER on `sightOf` — this is load-bearing.** Both produce the same
number once sight is radarRange/2, but `sightOf` is the sole place dazzle enters perception, so a
radar-anchored rung keeps *"a flash is a light source, not an illuminated object — dazzle does not
change how far it carries"* true BY CONSTRUCTION rather than by care. Same argument amendment 122
made when the foghorn moved onto intel range.

**The superseded anti-leak rationale, and why it does not apply.** `signals.ts` argued the halo must
be flat *"or the plume would carry per-observer build/state information."* That holds for
SUBJECT-scaling — a plume whose radius encoded the SMOKING ship's build would broadcast it — and NOT
for OBSERVER-scaling: the watcher already knows their own build, and neither row carries identity
(`mz` is a bare `{k,x,y}`, `sm` a bare `{k,x,y,tier}`). The master perception invariant still has
exactly SIX declared exceptions; none was added.

**×4 copies is also a PERFORMANCE ruling.** Eric: *"Make it 4 copies, its powerful."* Client radar
render cost is purely quadratic in `radarRange` across the whole reachable range — the `minRayRad`
clamp does not engage below 2000u — so the copy cap IS the cost cap: ×4 tops the worst frame at
×3.06 rather than the ×4.05 a 5-copy line would have. Top of ladder: radar 1154.3, detect 432.9,
sight 577.2, muzzle/smoke 721.5, farRadar 1010.1.

**`intelSweep` STAYS A SEPARATE LINE** (Eric: *"no, its a separate line"*) — it is a rate, not a
range. The `intel` category therefore ends with two lines and 9 physical cards, down from three and
15. That is a smaller nerf than it reads: the lost weight is almost entirely the deleted
`intelTruesight` line, and the USEFUL intel draw is near unchanged (`intelRange` at 4/53 ≈ 7.5% per
slot against `intelRadar`'s old 5/59 ≈ 8.5%).

**Amendment 122's "knowing trade" is RETIRED** — hearing widening with `intelRadar` rather than
`intelTruesight` was a fork that no longer exists, because there is only one intel line to buy. The
foghorn's band anchor is unchanged; what disappeared is the choice it used to cost you.

**Card copy** (Eric rulings): the ladder blends both retired ladders, alternating optics and antenna
because the merged card widens the whole sensor suite — `IMPROVED OPTICS` → `HIGH-GAIN ANTENNA` →
`DIRECTOR TOWER` → `CAVITY MAGNETRON`, every name existing ratified copy, none invented. The sight
rider is disclosed through the NOTE line rather than a second number row (the pattern already
ratified for gun/cannon/star reach): *"Sight, gun, cannon and star shells reach with it."*

**`PROTOCOL_VERSION` 37 → 38.** Boon ids ride the wire and the client resolves them fail-closed, so
retiring two ids and adding one is a wire-contract break; the PV join gate is the only thing stopping
a stale bundle from silently dropping a card it cannot resolve.

**One trap for the next agent:** the `mz`/`sm` verifiers in `server/src/__tests__/perception.test.ts`
are DELIBERATELY independent reimplementations and do not inherit the production resolver. They were
re-derived BY HAND as `me.stats.radarRange * 0.625`, separately in each verifier, per that file's
own rule. Do not refactor them to share a helper or to import `muzzleFlashReach`.

## Amendment 23 — FRAGMENTATION CASING is deleted. A card that can be a total no-op is not a balance problem, it is a broken card.

**Eric ruling 2026-08-16:** *"Remove the cannon blast radius card altogether."*

`cannonBlast` (FRAGMENTATION CASING Mk I–V, cannon, common ×5, ×1.1 `cannon.burstRadius` per card)
leaves the catalog entirely. Catalog 35 → 34 lines; the cannon subdeck 12 → 7 cards; a battleship's
deck 60 → 55. `PROTOCOL_VERSION` 38 → 39, because catalog content IS wire contract.

**Why it had to go rather than be tuned.** ARMOR-PIERCING SHELLS hardcodes `burstRadius: 0` — an AP
shell pierces instead of bursting. So for any build holding the AP doctrine, FRAGMENTATION CASING
multiplied zero by 1.1 and did **nothing at all**, five times over. A player on AP could be offered
it, spend a banked level on it, and fit up to five copies for literally no effect, with no
disclosure on the card, in the offer, or anywhere else. The boon-cards investigation confirmed it as
the most egregious of the four dead-card findings.

**Deleted rather than gated, deliberately.** The alternatives were a deck-time exclusion (drop the
line from the pool once AP is held) or a burst floor under AP. The first adds conditional deck
composition for a card nobody was choosing on purpose; the second changes how the AP doctrine plays
— AP's whole identity is *"the cannon stops bursting"* — in order to rescue a card whose only job
was to scale a number AP sets to zero. Removing the line costs the cannon subdeck one common and
costs the player nothing they were actually getting.

**What did NOT change.** `cannon.burstRadius` is untouched as a STAT: the cannon still bursts at its
`CONFIG.cannon.burstRadius` base of 30u under every non-AP doctrine, and still does not burst under
AP. No damage, blast, reload or doctrine number moved. The path stays on `BOON_STAT_PATHS` with no
card behind it, which is the established shape rather than an oversight — `gun.burstRadius`,
`gun.contactDamage` and `cannon.contactDamage` are all whitelisted-but-unwritten already, and the
seven `<equipment>.reloadMs` paths have been since the 2026-08-04 global-cooldown ruling. A future
cannon-blast card can therefore land without touching the whitelist.

**Consequence worth naming:** the cannon subdeck is now the THINNEST equipment subdeck at 7 cards
(5 commons + 2 exclusives), against torpedoes 12, starShells 12 and mines 22. A battleship pilot
will see cannon cards less often than before, and the two exclusives are now 2/7 of that subdeck
rather than 2/12 — so the doctrine choice arrives sooner on average. That is a real pacing change,
untuned here because it follows from the deletion rather than from a separate decision.

**THREE DEAD-CARD FINDINGS REMAIN UNRULED** from the same investigation: `mineDamage` ×
`minePropFouling` is PICK-ORDER dependent (53 vs 45 hp for identical cards, because both write
`mine.damage` and the fold is list-ordered), `mineTrigger`'s 5th card is ~75% eaten by the
`triggerRadius ≤ blastRadius` clamp when no `mineBlast` is held, and at most 1 of 6 acquisition
cards can ever fire (one extra slot; `consumeAcquisition` purges the rest).

## Amendment 24 — THE PvE FLEET REBALANCE: softer hulls, richer payout, twice as many groups, wider spread (Eric rulings 2026-08-16) — retunes epic-5 amendments 33/34/35/45

Interstitial cycle 94 (0.17.94). Story 5.6's fleets sailed and two things were wrong at once, and
only one of them was a number. **They were hard to FIND** — *"finding them on a big map can be a
pain! even with 7 players, which is the most i've had in a game at one time"* — and their envelope
did not line up with the attrition role amendment 45 had just given them.

### The envelope: 45/60/75 hp, and the gun goes FLAT

|  | small | medium | large |
|---|---|---|---|
| hp | **45** *(was 60)* | **60** *(was 75)* | **75** *(was 90)* |
| gun damage | **1** | **1** *(was 2)* | **1** *(was 3)* |
| kill value | ¼ | **½** *(was ⅓)* | **¾** *(was ½)* |
| captain shots to sink (base gun, 15) | **3** | **4** | **5** |
| TTK at the 5 s reload | **15 s** | **20 s** | **25 s** |
| damage it deals back over that window | **3** | **4** | **5** |
| maxSpeed / turnRate / hull dims | unchanged | | |

**THE FLAT GUN IS A DERIVATION, NOT A FLATTENING.** Eric specified the return damage as 3/4/5. The
drone reload (5000 ms) equals the captain gun reload, so volleys-back is exactly shots-to-kill —
3/4/5 by construction. **Damage 1 on every size therefore SATISFIES a per-size damage spec**, and a
per-size damage table would have double-counted the size scaling that hp already carries. The next
agent should not read `damage: 1` three times as a lost distinction; size reads through hp, payout,
speed and aim scatter, and now through how long the hull survives to keep shooting.

**The exchange rate — the number amendment 45 ruled must stay in view — improves on every size:**

| | damage taken | levels to repair (÷50) | levels earned | net |
|---|---|---|---|---|
| small | 3 | 0.06 | 0.25 | **+0.19** |
| medium | 4 | 0.08 | 0.50 | **+0.42** |
| large | 5 | 0.10 | 0.75 | **+0.65** |

`damageGuardrail.test.ts` passes UNCHANGED, and its counter-pin (*"the old 6/8/10 gun fails this
same test on every size"*) is still non-vacuous at the new hp — 0.36 > 0.25, 0.64 > 0.50, 1.00 >
0.75. The pin was written against a 60 hp small hull and still bites at 45.

### The spawn unit halves, the wave counts double

**`CONFIG.fleet.composition` becomes `{large: 1, medium: 2, small: 3}` — SIX hulls** — and the waves
go **4/2/1 → 8/4/2 groups**. Eric derived this as a 12-hull fleet (2L/4M/6S, worth 5 levels) split
into two halves; **the 12-hull fleet is a derivation path and does NOT exist in code.** *"Keep
'fleet' = 6 hulls."* A rename to `squadron` was offered and declined.

| wave | groups | hulls | levels |
|---|---|---|---|
| 1:00 | **8** | 48 | 20 |
| 5:00 | **4** | 24 | 10 |
| 9:00 | **2** | 12 | 5 |
| total | **14** | **84** *(was 63)* | **35** *(was 21)* |

**Amendment 45's ~5:1 captains-per-fleet ratio is PRESERVED, not abandoned** — 4/2/1 twelve-hull
fleets is still the shape; each is simply spawned as two independent six-hull groups. Anyone
retuning waves should still re-derive from the ratio, exactly as 45 instructs.

**THE HALVES ARE FULLY INDEPENDENT ANCHORS (Eric ruling).** Modelling them as a related pair, spawned
a fixed distance apart, was offered and declined. `pickFleetAnchor` already scores every candidate by
max-min distance from everything afloat *including fleet hulls*, so eight anchors spread themselves —
*"spread these fleets from each other"* is what the shipped picker already does, and the pairing would
have needed a new constant, a second placement path, and a real risk of the two wings landing inside
each other's 330 u sight and re-forming a twelve-hull witness network.

### `spreadU` 400 → 500

Amendment 35 calls this THE difficulty dial. Two effects compose here and they push the same way:
the group is now **6 hulls, not 9**, and the radius is wider — so hull density per unit area falls to
**~43% of shipped**, and typical witnesses per hit go ~2-4 → **~1-3**. Amendment 35's stated bound
(*"~700 u — 0-1 witness; 'fleet' stops meaning anything"*) is respected with margin; 600 u was
offered and not taken for that reason.

**The discoverability fix is the GROUP COUNT, not the radius.** Eight scattered contacts in wave one
against four is the change that answers *"finding them can be a pain"*; the wider spread is the
"larger surface area" half of the same sentence.

### THE RING-CONTAINMENT CORRECTION (orchestrator, forced by the spreadU ruling — **Eric has veto, this was not his call**)

`fleetAnchor` samples anchors at `max(ring.r − spreadU, ring.r × FLEET_ANCHOR_MIN_FRACTION)` and the
shipped docblock claims this *"stops `spreadU` short of the ring edge so the hulls scatter into water
rather than into the storm (floored well inside, since the terminal ring is only 660 u across and the
spread is 400 u)."* **That guarantee was arithmetic coincidence between two unrelated constants, and
raising `spreadU` breaks it.** The floor (0.35) bites whenever `ring.r < spreadU / 0.65` — below
615 u at spreadU 400, below **769 u at 500** — and at the 660 u terminal ring it permits an anchor at
231 u scattering 500 u, i.e. **731 u from centre: outside the ring, in the storm.**

**Not reachable in production today** (the 9:00 wave fires against a ~1068 u ring and the retry budget
caps a pending wave at 10 s), so this is a latent trap rather than a live bug — but a compressed
`zoneOverride` in a smoke reaches it, and the docblock's stated reasoning is now false.

**Ruled: the guarantee becomes EXPLICIT.** `fleetOffset` gains a live-ring containment test beside its
existing island-clearance and intel-disc rejections, on the same reject-and-re-roll ladder, falling
back to the anchor itself (ring-clear by construction). The constants stop being load-bearing on each
other. Raising `FLEET_ANCHOR_MIN_FRACTION` instead was rejected: it would squeeze the last wave's two
groups into a 160 u-radius disc and stack them.

### NO HARDCODED XP TOTAL IN THE CONTRACT (Eric ruling)

> *"just say XP is calculated from fleet comp. No need to 'hardcode' any amount of xp into the
> contract."*

**Amendment 33's `expect(fleetLevels()).toBe(3)` pin is RETIRED, and it had already gone vacuous on
its own terms.** That pin existed because `droneMedium` paid **⅓** — a non-dyadic rational — so a
composition edit could quietly start paying float dust. With the tiers now **¼ / ½ / ¾, every tier is
a dyadic rational, and therefore EVERY integer composition is exact.** The invariant moves up one
level: pin that the TIERS are exactly representable and that `fleetLevels()` carries no dust, never
that it equals a particular number. `fleetLevels()` remains the single derivation from
`composition × droneTierLevels`.

### THE MINE LAYER IS A FLEET-KILLING MACHINE, AND THAT IS THE POINT (Eric ruling 2026-08-16)

> *"if you wanna spend mines to clear drones, do it. My players actually found that the minelayer is a
> fleet-killing machine, and it being able to aggro and mine pve ships can secure it an XP bonus to
> rely on in fights."*

Dropping the small hull to 45 hp puts it **under the base mine's 55 damage**, so a base mine now
one-shots it. At 60 hp the mine fell four short and only a STACKED `mineDamage` build cleared the
bar — `damageGuardrail.test.ts` pinned that gap explicitly.

**This was surfaced to Eric as a consequence and he ruled it a FEATURE.** It is now pinned as a
ratified buff rather than an accepted cost: the Mine Layer's fleet-farm works out of the box instead
of requiring a card first, which is a real and deliberate widening of that hull's early game.

**The one weapon that must never cross this line is the GUN**, and it does not (15 < 45). The whole
3/4/5-shot ladder is written against the gun, so a one-shot there would collapse the envelope rather
than reward a build. Every heavier weapon — cannon 65, torpedo 70, mine 55 — now clears the small
hull at base.

**AMENDMENT 36 CLAUSE 3 IS UNTOUCHED: a mine hit still does not aggro its victim.** Eric's sentence
*"being able to aggro and mine pve ships"* describes the PLAYSTYLE — pull aggro with the gun, lead
the hulls over a field — not a reversal of the mine-aggro rule. That rule exists because a mine's
layer may be dead or 2000u away, and chasing it produces a hull wandering off after a ghost. Read
this as confirmation the rule is working, not as permission to widen it.

### Named consequences, ledgered rather than mitigated

1. **The PvE faucet grows 21 → 35 levels — put to Eric explicitly and confirmed.** That is ~1.8× the
   19 levels of captain kills a full 20-captain lobby can produce. Amendment 45 already flagged 21 as
   past that line and this widens it deliberately. It is contested and costs ~1.8 min per group to
   collect, so realised income sits far below 35 — and `pveKillsByClass` (amendment 44) is the
   evidence that will settle whether it matters. **This is the number to re-derive from if the
   economy reads wrong in playtest.**
2. **Per-group threat drops again.** A 6-hull group volleys **6 damage (1.2 dps)** against the shipped
   9-hull group's 16 (3.2 dps): a 125 hp Torpedo Boat now survives **~104 s** under full group aggro,
   up from 39 s. Amendment 45 answered the "reads as no threat" objection structurally — *"the fleets
   stick together as fleets, they are a danger, and the players fighting over them amplify that"* —
   but that argument was made about NINE hulls. It is weaker at six and is recorded as the open risk
   of this cycle.
3. **Groups sit closer together on average.** Eight anchors on one ocean are necessarily nearer each
   other than four were, so two groups drifting into mutual LOS is now more likely. Per amendment 35
   that is **the witness rule working, not failing** — the sweep is global by ruling and must not be
   "fixed" to be per-fleet.
4. **Server cost:** hulls afloat 63 → 84 (+33%), pro-rating amendment 33's figures to ≈3.3 ms/tick
   against the 50 ms budget. **Client radar load per group FALLS** (6 hulls in sensor range, not 9),
   so the client sits strictly below its shipped 1.74 ms / 2.5 ms measurement.

`PROTOCOL_VERSION` is **unchanged at 39**, on the amendment-45 precedent: every value here is a
server-side simulation constant. The whole of `CONFIG` does ride `WelcomeMsg.config`
(`GameConfig = typeof CONFIG`), but the client never computes a fleet hull's stats (`frames.ts`
throws if a drone hull reaches `toOwnShip`), never reads `CONFIG.fleet`, and never derives a drone's
XP payout — it is told what it earned. No wire SHAPE moves.

## Amendment 25 — The mine rack stops punishing its own doctrine, and the trip ring rides the blast.

**Eric ruling 2026-08-16:** *"remove damage decrease for the fouling mines. tie the trigger radius to
the blast radius, combine the cards, so picking it up increases both."*

Three changes to the mines category, closing two of the three dead-card findings the boon-cards
investigation left open. Catalog 34 → 33 lines; the mine subdeck 22 → 17; a Mine Layer's deck 63 →
58. `PROTOCOL_VERSION` 39 → 40.

**1. PROP-FOULING no longer pays damage for the slow.** The `stat('mine.damage', { mult: 0.6 })`
bundled onto `minePropFouling` is DELETED; the doctrine is now a pure behaviour change. Beyond the
balance intent, this retires a real defect: that multiplier was the ONLY multiplicative writer of
`mine.damage`, against `mineDamage`'s ADDITIVE ladder, and `applyBoonStats` folds in list order — so
the same cards produced **different damage depending on pick order** (fouling-then-five-damage =
55×0.6+20 = 53 hp; damage-then-fouling = (55+20)×0.6 = 45 hp). With no multiplier left, one effect
writes the path and order cannot matter. Verified: both orders now yield 75.

**2. The trip ring is DERIVED from the blast radius.** `mine.triggerRadius` = `blastRadius ×
CONFIG.mine.triggerFactor` (2/3), re-pinned post-fold in BOTH `clampStats` and `applyBoonStats`
exactly as `sightRange` and the three `rangeU` paths are, and REMOVED from `BOON_STAT_PATHS`. The old
`min(triggerRadius, blastRadius)` clamp is RETIRED — it held the invariant, but by silently eating
~75% of the 5th trigger card whenever no blast card was held (32 → 51.54 clamped to 48, so the last
card bought 1.1u instead of 4.7u). **A fixed fraction of the ceiling can never cross the ceiling**,
so the invariant is now structural. Base is byte-identical: 48 × 2/3 = 32 exactly.

**3. The two ring cards merge.** `mineTrigger` (MAGNETIC → COMBINATION FUZE) is DELETED and
`mineBlast` (BLAST CASING Mk I–V, ×5, ×1.1 blast) now grows both rings by construction. The card's
note carries it — *"The trip ring widens with it."* — rather than making the player infer it.

**COPY NOTE, flagged rather than decided:** the surviving ladder is BLAST CASING Mk I–V verbatim,
because it is the ladder attached to the stat that survived. The five FUZE names retire unused. This
was NOT put to Eric the way the Intel Range ladder was; a blend was possible and was not taken,
because inventing or re-mixing ratified card copy without a ruling is the thing the naming law
forbids. Re-mixing it later is a one-line change.

**Balance consequences named, none tuned:**
- PROP-FOULING is now a PURE UPGRADE — the slow with no cost — where it used to be a side-grade
  against SELF-PROPELLED. Both exclusives are now pure adds, so they remain side-grades to EACH
  OTHER, but the choice to take a doctrine at all is now strictly correct.
- Max reachable trip ring is UNCHANGED at 51.54u: it was 32 × 1.1⁵ and is now (48 × 1.1⁵) × 2/3.
  The `creepAcquireRange > trigger + longestHull/2` guardrail therefore holds at the same numbers.
- The mine subdeck loses 5 cards (22 → 17), so a Mine Layer sees mine cards less often and reaches
  its doctrine choice sooner — the same shape of pacing shift amendment 23 recorded for the cannon.

**ONE DEAD-CARD FINDING REMAINS UNRULED:** at most 1 of 6 acquisition cards can ever fire (there is
one extra slot, and `consumeAcquisition` purges every remaining acquisition once one is fitted).
