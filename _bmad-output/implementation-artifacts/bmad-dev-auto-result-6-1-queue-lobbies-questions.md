---
status: blocked
---

# BMad Dev Auto Result — Story 6.1 Queue-Based Lobbies: QUESTION GATE

Status: blocked (pre-implementation question gate)
Blocking condition: sixteen design rulings across five clusters. The load-bearing one is Cluster A —
**every number in this story's acceptance criteria is already shipped inside the arena room**, so the
story is not "build min-2 fill-or-timer", it is "decide where the lobby lives". Three further
rulings are needed because the framework's own `QueueRoom` conflicts with FR34 and with the
undefined solo-termination rule, and two because a queue silently disables shipped security gates.

## Intent (invocation, 2026-08-14)

> `/bmad-dev-auto 6-1. surface any questions prior to implementation. use /orchestrate to select
> model for subagents based on task complexity.`

Branched fresh from `origin/main` at `5d54cd6` into the worktree
`worktree-dev-auto-6-1-queue-lobbies`. VERSION 0.17.87, `PROTOCOL_VERSION` 36. **No code, CONFIG,
wire, test or planning-artifact change has been made.** The single file written is
`epic-6-context.md` (the workflow's required epic-context compile — it did not exist; Epic 6 has no
amendments file yet, so no Ratified Amendments section was added).

Four investigation subagents were dispatched, model-routed per `/orchestrate` — **Opus** for the
three architectural sweeps (server rooms/match/app-config, client join flow/home/phase, the
planning-decision + ledger scan), **Sonnet** for the mechanical epic-context compile. Every
load-bearing claim below was re-verified by hand against the source or against the installed
framework code.

Note for the next agent: there is **no `client/src/ui/menu.ts`**. Story 1.14 replaced it with
`client/src/ui/home.ts`. Several planning docs still say "menu".

---

## Headline 1: the acceptance criteria are already met — in the wrong room. That is the whole story.

Read the AC literally: *"a match arms at 2 human captains and starts on fill-or-timer (timer as
CONFIG design target), capped at 20"*, and *"zero bot-fill exists in Standard"*.

All four of those ship today:

| AC clause | Where it already lives | Value |
|---|---|---|
| arms at 2 human captains | `match.ts:325-343` `notifyRosterChanged` → `openGathering` | `CONFIG.match.minHumans = 2` |
| fill-or-timer | `match.ts:383-397` gathering window → countdown | `joinWindow 30000` + `countdown 15000` |
| capped at 20 | `ArenaRoom.ts:120` `maxClients = CONFIG.map.playerCap` | 20 |
| zero bot-fill | deleted outright in cycle 83 | epic-5 amendment 41 |

`startCountdown()` (`match.ts:392-397`) is the **only** caller of `hooks.lock()`. So the arena room
*is* the lobby, and has been since cycle 32.

**What a queue genuinely adds is therefore only three things**, and they should be the story's real
goals rather than the AC's restated numbers:

1. **Mode as a queue choice** — required by 6.5, and the reason D6 exists at all. The arena must
   never fork on mode; a second queue room is how Solo vs AI gets built without touching arena code.
2. **A single visible pool** — 6.6's liveness readout has nowhere to read from today. The queue is
   the only place a population number exists.
3. **Convergence** — the ledgered primary failure mode.

**And here is the correction the spec must not inherit uncritically.** `deferred-work.md:365`
instructs the 6.1 author to treat the 2026-08-02 playtest (*"tough getting us all in the same
game"*) as the failure mode the queue design must solve. Tracing it: the scatter is caused by the
**45-second hard deadline** (30 s gathering + 15 s countdown), after which `startCountdown` locks the
room and `joinOrCreate` sends the next arrival to a **brand-new room** — `matchSmoke.mjs:455` asserts
exactly that. Ten friends arriving over two minutes therefore split across rooms no matter what
front door they use.

A queue **does not fix this by existing.** Once a match has started, nothing can put a late friend
into it. What a queue actually buys is that the late friend waits *in a pool with a visible count*
instead of alone in an empty ocean — honesty, not convergence. **The convergence lever is the timer
(Q2), not the room topology.** Any spec claiming the queue solves the playtest complaint is
overclaiming, and the ledger entry should be updated to say so.

## Headline 2: the framework's `QueueRoom` exists, and three of its behaviours are illegal here

D6 names *"Colyseus 0.17 QueueRoom"*, and unlike AR2's sibling assumption about `room.ping()` (which
turned out not to exist, and cost Story 1.5 an app-level substitute) **this one is real**:
`@colyseus/core/build/rooms/QueueRoom` ships group formation, seat reservation via
`reserveMultipleSeatsFor`, and a `seat` → `confirm` handshake. The client half,
`client.consumeSeatReservation`, is in `@colyseus/sdk` 0.17.43.

Free and worth taking:
- It pushes a `clients: number` message to everyone queued — **6.6's liveness data source, for free.**
- It ships `maxTeamSize` / `QueueClientData.teamId` — **free groundwork for the ledgered TEAMS
  entry** (`deferred-work.md:313`), which Eric explicitly homed at *"Epic 6 lobby design"*.

Wrong for us, in ascending order of seriousness:
- **`rank` / `compare` are skill matching.** `DEFAULT_COMPARE` buckets by rank ratio. The AC says
  *"no skill matching, no parties, no ranked."* Neutralised by `rank: 0` + `compare: () => true` —
  trivial, but it must be deliberate, and it must be **tested**, or a future SDK bump quietly
  reintroduces matchmaking the AC forbids.
- **It forms a group only at *exactly* `maxPlayers`**, or via the incomplete-group timer. There is no
  "arm at 2, then keep filling for 30 s" semantic anywhere in it. That is the shipped arena
  behaviour, and the built-in room cannot express it without overriding `reassignMatchGroups`.
- **Its `allowIncompleteGroups` doc says, verbatim: *"Your room should fill the remaining spots with
  'bots' on this case."*** That is precisely what FR34 forbids. The incomplete path must resolve to a
  smaller honest roster instead.

**And the one that is genuinely dangerous** — I read the implementation rather than the docs:

```js
// redistributeClients: only reachable when allowIncompleteGroups === true
if (currentCycle >= this.maxWaitingCycles && this.allowIncompleteGroups) { highPriorityGroups.push(group) }
// evaluateHighPriorityGroups:
group.ready = group.clients.every((c) => c.userData?.currentCycle > 1)
```

A **single** waiting player satisfies `every(...)` on a group of one. So the stock incomplete-group
path **starts a one-human match** after the timer. Two consequences collide there:

- It violates min-2 directly.
- **It makes an undefined game state reachable.** `deferred-work.md:874` records that since epic-5
  amendment 4 made the win check captains-only, a lone human against drones/fleets **has no defined
  end** — and that this is *"safe today only because `minHumans = 2`."* Wiring the stock QueueRoom
  with `allowIncompleteGroups: true` removes the only thing standing between the shipped build and a
  match that cannot terminate. Story 6-3 owns the fix; 6.1 must not front-run it by accident.

## Headline 3: a queue silently switches off two shipped gates. Both are confirmed, not suspected.

**(a) The `PROTOCOL_VERSION` join gate stops running.** I traced this in the installed framework
rather than inferring it. `MatchMaker.mjs` calls `callOnAuth(...)` from `joinOrCreate`, `create`,
`join` and `joinById` only. `reserveSeatFor` (`:428`) and `reserveMultipleSeatsFor` go straight to
`remoteRoomCall(roomId, "_reserveSeat", ...)` — **`callOnAuth` is never on that path.**

`ArenaRoom.static onAuth` (`ArenaRoom.ts:141-145`) is the PV gate, throwing `protocolVersionError`.
So the moment players reach the arena through a queue's seat reservation, **a stale client is no
longer rejected at matchmake** — it seats successfully and desyncs against a wire contract it does
not implement. `reconnectSmoke.mjs:165-169` currently asserts a `pv`-less join is rejected; that
assertion would still pass while the real path is unguarded.

*This is a ruling I would make rather than a question — the gate moves to the queue's join, reusing
the pure `protocolVersionError` from `roomOptions.ts:65` — but it is flagged because it changes where
a security boundary lives, and because the arena must keep its own `onAuth` for the direct/dev door.*

**(b) The JOINING-deadline guard is not inherited.** Story 0.3 fixed a live exploit — a client that
never confirms join squats a roster slot while the transport buffers frames at 20 Hz unboundedly —
with `armJoiningDeadline`/`kickIfStillJoining` and `CONFIG.net.joiningDeadlineSeconds = 10`
(`ArenaRoom.ts:487`, `:504-518`; `joiningGuard.test.ts`). **A queue room is a second front door with
none of that.** It must be ported, or the exploit reopens on the new entrance — worse, on the
entrance that is now the *only* public one.

## Headline 4: on the client, one shipped constant breaks the whole flow

`WELCOME_TIMEOUT_MS = 5000` (`connection.ts:22`) races the welcome handshake against
`onError`/`onLeave` (`:194-217`). **A queue can legitimately hold a player for tens of seconds.**
Left as-is, a perfectly healthy queue wait past five seconds fails the race, calls `room.leave()`
(`:266-272`), and shows the player `CONNECTION FAILED — IS THE SERVER RUNNING ON :2567?`.

Three more client facts that constrain the design, all verified:

- **`connect()` must not resolve until the *arena* welcome lands.** `startGame` (`main.ts:3831-3832`)
  hides the home and stops the ambient scene the instant it resolves — an early resolve drops the
  player onto a black canvas for the entire queue wait.
- **`room.reconnection.enabled = true` is set on whatever room was just joined** (`:253-254`). On the
  queue room that would auto-rejoin a room the player has already been handed off from. It must move
  to after `consumeSeatReservation`.
- **There is no cancel path anywhere.** Once PLAY is pressed the home is busy-dimmed and the only
  exit from any connected state is `location.reload()` (`main.ts:1595-1607`, `returnToPort.ts`). A
  queue without a cancel affordance strands the player by construction.

Identity is safe by luck of design and must stay that way: client state is seeded from
`welcome.sessionId` (`main.ts:2071`), **not** `room.sessionId`. Any refactor that "simplifies" that
breaks every self-identification path at once under a two-room design.

## Headline 5: D8 cannot be *proven* today, only obeyed

The AC says *"no code path assumes same-process room co-residency (D8 holds through the queue
layer)."* But `app.config.ts` configures **no presence and no driver** — Colyseus defaults to
`LocalPresence` + `LocalDriver`, and `metrics.ts:224` reads `matchMaker.stats.local` and says so.

The good news: `matchMaker.createRoom` + `reserveSeatFor` are driver/presence-backed and are already
correct cross-process; `getLocalRoomById` is the trap. So D8 is a **code-discipline rule**, and the
correct queue implementation satisfies it for free. The problem is that **with a local driver,
nothing fails when you violate it** — the AC asserts a property no test can currently observe.

---

# THE QUESTIONS

## Cluster A — where does the lobby live? (this decides the story)

**Q1. Does the queue REPLACE the in-game ready room, or FEED it?**

- **(a) Replace.** Players wait in a pre-arena pool with no ship and no ocean; the arena is created
  only when the group is complete, is locked from birth, and goes straight to countdown. This is
  exactly the built-in `QueueRoom` model and the most literal reading of D6's *"seat reservation into
  arena rooms"*. **Cost:** it deletes the ratified weapons-safe ready room for standard play —
  UX-DR30's *"AWAITING CAPTAINS n/2"* with the full live HUD and a sailable ship
  (`phase.ts:34-40`, `hud.ts:754-770`). Two captains would stare at a DOM panel for the entire timer
  instead of sailing. It also has no seam for a pre-locked arena: `startCountdown` is the only
  `lock()` caller, and `notifyRosterChanged`'s `unlock()` cancel path (`match.ts:341`) becomes wrong.
- **(b) Feed.** ★ The queue is a thin front door: it holds a player only until it can route them, then
  creates-or-finds the open arena and reserves a seat. The arena keeps gathering → countdown → lock
  exactly as today, and the in-game ready room survives untouched. **One fill-or-timer authority
  remains** (`Match`), which is the project's standing anti-desync posture — the same argument that
  made `effectiveStats()` the single derivation path. **Cost:** the queue is thinner than D6's prose
  implies, and on its own it changes player-visible behaviour almost not at all (see Headline 1).
- **(c) Advisory.** Queue exists, picks the room, hands a reservation, pools nobody. Minimal work;
  buys only the mode seam and nothing else.

*Recommendation:* **(b)**, and then spend the story's real effort on Q2 (the timer) and on the mode
seam that 6.5 needs — because those are the two things that actually change the game. (a) is the
bigger build and its main effect is to remove a ratified UX you liked enough to ship.

**Q2. What are the fill-or-timer numbers, and does reaching 20 start the match immediately?**
Today's effective wait is **at most 45 s** from the 2nd captain (30 s window + 15 s countdown), and
**a full room does NOT early-arm** — `spec-join-window-before-countdown.md:116,123` deferred
full-room early-arm explicitly as *"FR34/Epic 6 scope"*, so that deferred question lands here.
Sub-questions: (i) does hitting cap 20 skip the remaining window? (ii) does the timer stay 30 s, or
does a queue's better honesty (a visible count) buy the patience for a longer one? (iii) is the
timer measured from the *first* captain in the pool or the *second*?
*Recommendation:* early-arm at cap yes; timer from the **second** captain (arming is a 2-human
event); hold at 30 s for now and revisit with live population data rather than guessing at zero.

**Q3. If the queue owns arming (Q1a only), what happens to `Match`'s gathering phase?**
It cannot stay live in both rooms — that is two derivations of one rule, the exact class
`effectiveStats()` exists to prevent. Either `gathering` is deleted from the state machine and the
queue-created arena starts at `countdown`, or the queue never arms and (b) is the answer.
*Recommendation:* moot under (b); under (a), delete `gathering` outright rather than leaving it
dormant, and update `phase.ts`, `chromeBar.ts`, `score.ts` and `settings.ts` which all read it.

**Q4. Does the queue fix the hostage-cycling vector, or inherit it?**
`deferred-work.md:319` records that leave/rejoin reopens a **fresh 30 s gathering window each time**,
so one player can cycle a lobby indefinitely — and the entry says any cap/shrink mitigation *"is a
game-design decision needing an Eric ruling."* A queue is the natural place to fix it (a hard
deadline from the first arm, never re-extended) but that is a behaviour change, not a refactor.
*Recommendation:* make the timer a **hard deadline set once at arm time and never re-extended by
subsequent joins or re-joins.** It closes the ledger entry and makes the countdown honest.

## Cluster B — the arena's front door

**Q5. Does `joinOrCreate('arena')` stay open to clients?**
If it does, **the queue is advisory and every guarantee in this story is bypassable** — min-2, cap
20, and zero-bot-fill all become suggestions, because `app.config.ts:24` defines `arena` publicly
with no `filterBy`. If it does not, seven headless smokes break at once (`smoke`, `combatSmoke`,
`weaponsSmoke`, `fogSmoke`, `predictionSmoke`, `zoneSmoke`, `latencyHarness` all
`joinOrCreate('arena', {matchOverride: {sandbox: true}, ...})`).
*Recommendation:* close the public door and keep a **dev door behind `HC_DEV_OPTIONS`** — the exact
pattern `matchOverride`/`zoneOverride` already use, so it needs no new concept. Production clients
reach the arena only through a queue; smokes keep their direct join.

**Q6. How do dev overrides reach a queue-created arena?**
`matchOverride`/`zoneOverride`/`mapSeed` are consumed in `ArenaRoom.onCreate` via
`sanitizeRoomOptions` (`:203`). If the queue creates the room, it must forward them into
`matchMaker.createRoom(...)` — or Q5's dev door carries them and the queue never sees them.
*Recommendation:* Q5's dev door carries them; the queue forwards nothing. Fewer paths that can leak
dev options into production.

**Q7. `matchSmoke.mjs` asserts the behaviour a queue replaces. Confirm the rewrite is sanctioned.**
It pins, deliberately: two clients land in the **same** room (`:438`), a 3rd joins that same
**unlocked** room (`:447`), and a 4th after lock lands in a **different** room (`:455`). Those are
ratified assertions about `joinOrCreate` semantics. Under any queue they are rewritten, not adapted.
*Recommendation:* rewrite `matchSmoke.mjs` against the queue and keep the current file's assertions
alive as the **dev-door** smoke, so the arena's own lobby logic stays covered under (b).

## Cluster C — the gates a queue switches off (rulings, flagged for veto)

**Q8. The PV gate moves to the queue join.** Confirmed bypass, Headline 3(a). I intend to gate at the
queue using the existing pure `protocolVersionError`, and **keep** `ArenaRoom.onAuth` for the dev
door. Flagging rather than asking because leaving it as-is ships a silently unguarded version gate.

**Q9. The JOINING-deadline guard is ported to the queue.** Confirmed gap, Headline 3(b). Same
`CONFIG.net.joiningDeadlineSeconds`, same shape as `ArenaRoom.ts:504-518`, with its own test.

**Q10. D8 — build the presence/driver injection seam now, or accept the AC as unprovable?**
Three options: (i) accept it as a code-discipline rule, satisfied in practice, tested by nobody;
(ii) add the config-injection seam now with memory implementations (D8's own words: *"memory
implementations on Render, `@colyseus/redis-*` engaged at the Colyseus Cloud move"*), so the shape is
right even though the wiring is local; (iii) add a lint rule banning `getLocalRoomById` and
direct room-instance references from queue code, which is the only mechanism that would actually
*catch* a violation.
*Recommendation:* (ii) **and** (iii). (iii) is cheap and is the only thing that makes the AC mean
anything; the `ai/` import boundary in 6.4 sets the precedent for a lint-enforced seam.

## Cluster D — the client

**Q11. Does 6.1 ship a queue UI, or does the player stare at a busy button?**
6.6 owns mode select and liveness chrome. But the client has **no cancel path and no waiting
surface** (Headline 4), so a queue with zero UI is not shippable — the player presses PLAY and is
stranded with a reload as their only exit.
*Recommendation:* 6.1 ships the **minimum honest surface only** — keep the home visible, drive
`home.setStatus()` with queue copy (count + why it is waiting) and add a CANCEL affordance that
leaves the queue and un-busies the home. All real chrome, the mode selector and the liveness
register stay 6.6's. `deploySubline()`'s hardcoded `· SOLO` (`home.ts:124`, pinned by three tests
whose name says *"no mode selector — Epic 6"*) should **not** be deepened, and should not be changed
here either.

**Q12. The welcome-timeout split.** The 5 s deadline applies to the **arena** handshake only; the
queue wait gets its own (long or open-ended) deadline, and `connectErrorStatus()` (`:286-292`) gains
a queue branch so a queue failure stops reading as *"IS THE SERVER RUNNING ON :2567?"*. Ruling,
flagged — it is the single most likely way this story ships broken.

## Cluster E — scope and forward-compatibility

**Q13. Do we reserve the TEAMS seam?**
Eric ledgered teams (~20 teams of 1-3) explicitly *"Ledger for Epic 6"*, homed at *"Epic 6 lobby
design, where queueing, rosters, roster-scaled map sizing (6.2), and spawn rules get designed
together"* (`deferred-work.md:313`). **This is that story**, and the framework gives `teamId` /
`maxTeamSize` for free. But teams are GDD-level new scope (the GDD is one-ship-per-player FFA) and
building them here would blow the story open.
*Recommendation:* **do not build teams**, but do not design them out either — carry `teamId` through
the queue's client options as an unused passthrough so 6.2/6.6 inherit the seam. Say the word if you
want teams designed properly now instead; that is a much larger story and probably its own.

**Q14. Does 6.1 scaffold `SoloVsAiQueueRoom`, or is that strictly 6.5?**
D6 names both files. 6.5's AC says the arena *"never knows the mode"*, which is only provable with
two queues.
*Recommendation:* 6.1 builds the **shared queue base + Standard only**, and proves mode-agnosticism
by construction (no `mode` string reaches arena code). 6.5 adds the second room.

**Q15. Player-facing naming.** Internally this is `StandardQueueRoom`; the home sub-line says
`· SOLO`; 6.6's AC offers *"Solo and Solo vs AI"*; EXPERIENCE.md:256 still owes a *"Solo vs Bots" →
"Solo vs AI"* correction.
*Recommendation:* keep internal names as D6 wrote them (`StandardQueueRoom`), leave all player-facing
copy alone in this story, and let 6.6 rule on the register. Flagged only so the mismatch is a known
choice rather than a drift.

**Q16. `PROTOCOL_VERSION` — bump or not?**
My read is **no bump**: `WelcomeMsg`, frames, `ArenaState` and every wire type are untouched; what
changes is the *matchmaking handshake*, which is not the protocol the constant versions. But the
join sequence changing shape while `pv` stays 36 means a stale client meets the new queue with a
matching version number, which is exactly what Q8's gate is for.
*Recommendation:* no bump; Q8's gate carries the compatibility burden. Overrule me if you would
rather the constant mark the flow change.

---

## What is already correct and needs no work (recorded so it is not re-audited)

- **Zero bot-fill is done.** The match-start drone fill was deleted outright in cycle 83 (epic-5
  amendment 41, Eric's ruling against the orchestrator's recommendation). `MatchHooks` has no fill
  hook (`match.ts:77-79`), `Match.activate()` fills nothing, and fleet ships are off the roster
  entirely (amendment 39). FR34's *"never roster fill"* is already literally true.
- **Cap 20 has one authority** — `ArenaRoom.maxClients = CONFIG.map.playerCap`. Note `world.addShip`
  enforces **no cap at all** (`world.ts:1126`), so whatever reserves seats must respect it; the
  framework does help here — `_reserveSeat` refuses past `maxClients` and `reserveSeatFor` throws
  `SeatReservationError`.
- **`sanitize*` helpers are reusable verbatim** — `sanitizeName`, `sanitizeClassId`, `sanitizeHornId`,
  `sanitizeColorPref` are pure and Colyseus-free (`roomOptions.ts`), so a queue can validate at its
  own door and pass clean options through the reservation.
- **`bindRoom` is room-agnostic** — it binds to a `Connection`, not a room name, and ArenaState is
  **polled** per frame with fail-safe defaults rather than listened to. The entire message/render
  layer needs zero changes under a two-room design.
- **Reconnection is unaffected.** Token resume goes through `matchMaker.reconnect()` straight to the
  arena and never touches the queue (`ArenaRoom.ts:556-593`, `dropPolicy`).
- **`CONFIG.match.fillTo: 20` is already dead in production** (`deferred-work.md:1003`) and its
  comment still says *"drones fill the rest"*. Deleting it end to end is a natural FR34 tidy-up to
  ride along here — flagged, not assumed.

## Size estimate, once the rulings land

| Area | Size under Q1(b) | Size under Q1(a) |
|---|---|---|
| Queue room (base + Standard), rank/compare neutralised, min-2 override | **medium** | **medium** |
| PV gate + JOINING guard ported to the new door (Q8/Q9) | **small** | **small** |
| Client two-stage connect + timeout split + cancel (Q11/Q12) | **medium** | **medium** |
| Arena front-door close + dev door (Q5/Q6) | **small** | **small** |
| `Match` gathering deletion + 4 client readers (Q3) | — | **medium** |
| Ready-room UX replacement (DOM queue panel) | — | **large** |
| Smoke rewrite (`matchSmoke` + new `queueSmoke`) | **medium** | **medium** |
| D8 lint seam (Q10) | **small** | **small** |

## What I did NOT do

No code, CONFIG, wire, test or planning-artifact change. No amendment was written — every ruling
above is Eric's, and `epic-6-context-amendments.md` gets created once he has ruled. The only file
written is `epic-6-context.md`, which the workflow requires before planning and which did not exist.
Stories 5.4 (Fog Banks) and 5.5 (Whirlpools) remain `backlog`, still deferred by the cycle-83
invocation rather than cancelled.
