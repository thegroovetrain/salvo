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
