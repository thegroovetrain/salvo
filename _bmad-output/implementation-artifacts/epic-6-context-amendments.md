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

## Amendment 13 — The start line IS the start line. Boarding placement is the match spawn.
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
a fading screen-edge chevron in `render/foghorn.ts`. Post-amendment-14 the minimum separation is 700.8u,
which is *outside* the 660u horn range, so this leak largely closes as a side effect.

## Amendment 14 — Twenty slots for twenty captains. Even spacing by construction.
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

## Amendment 15 — Your radar sweep starts at your heading.
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
sweep them. Judged not binding, since amendment 14 already makes positions derivable at cap 20.

Applied at every placement edge so there is ONE rule, not three (`addShip`, `redeployShip`, and
`respawn` where it re-places). `prevSweepAngle` must be set EQUAL to `sweepAngle` so the half-open
paint arc `[prev, sweep)` is zero-width on the first tick and nothing paints from the seam.

**`PROTOCOL_VERSION` stays 36 for all three of amendments 13-15** — no wire shape moves. Placement,
sweep phase and the candidate lattice are all server-authoritative internals.
