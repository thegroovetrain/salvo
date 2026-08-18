---
status: answered
blocking_condition: ''
answered: '2026-08-18'
rulings: 'R0 (match URL withdrawn) + R1-R13 — see §5. PROTOCOL_VERSION stays 40.'
story: 'Story 6.7 — Reconnection UX'
cycle: 102 (0.17.102 if landed)
created: '2026-08-18'
base: main @ 2652f90 (cycle 100, 0.17.100, PROTOCOL_VERSION 40)
inputs:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/match-url-spectate-reconnect-investigation.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md:1197-1211'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md:22,:26,:30,:514,:518'
---

# Story 6-7 — Reconnection UX: pre-implementation question gate

Eric asked for questions before implementation and anticipated many. There are fourteen, and
**question 1 is the only one that must be answered** — the rest have recommendations that can be
taken wholesale.

Three parallel read-only investigations were run against this worktree (`2652f90`): the client
reconnect path, the server reconnect path plus the HTTP surface, and a whole-system pass on the wire
contract and the perception chokepoint. Framework behaviour was verified by hand against the
installed `@colyseus/core` 0.17.44 and `@colyseus/sdk` 0.17.43 build output rather than taken on
report. Everything below carries `file:line`; where a claim is an inference it says so.

**Read §0 first.** It says half of this story is already shipped, and that one of its four acceptance
criteria is false against the code today.

---

## §0. THE HEADLINE

### The RECONNECTING banner already exists

The story's first acceptance clause — *"the dropping client shows a RECONNECTING banner with
auto-reconnect attempts, and successful resume returns seamlessly to the live HUD"* — is **built and
working**. On an abnormal close the SDK fires `onDrop`, and `client/src/main.ts:2596-2599` shows a
persistent `RECONNECTING…` banner; on resume `main.ts:2600-2610` hides it, snaps prediction, and
rebases the score. Give-up lands on `DISCONNECTED` and a reload (`main.ts:1751-1766`).

The retry budget is also already correct, and is guarded rather than hardcoded: 18 retries under the
SDK's exponential backoff is **71.2s** of client patience against the server's **60s** grace
(`client/src/net/connection.ts:170`, `shared/src/constants.ts:1476`), and
`client/src/__tests__/connection.test.ts:371-386` pins it as a derived inequality so it cannot erode.
The client gives up *after* the server does, which is the correct direction.

So the wifi-blip case — the one the user story actually describes — is done. **What is missing is the
refresh case**, which is exactly what Eric's investigation request was about.

### One acceptance criterion is false against the code

The story says *"a never-returning captain's ship fights on until sunk or match end."* **It does
not.** When the 60s grace expires, core drives `onLeave` → `ArenaRoom.teardown()` →
`Match.onPlayerLeave` (`server/src/game/match.ts:475-484`), which books the player a placement via
`recordSink` and then calls `world.removeShip`. The hull is **deleted**, not left fighting.

And it leaves silently. `recordSink` pushes only sink-order bookkeeping and `world.removeShip`
(`server/src/game/world.ts:1424-1435`) emits nothing, so there is **no `sunk` event, no kill-feed
line, no sink plume** — and `checkWin()` runs on the removal, so an abandoning captain can *end the
match*. This is the same defect the ledger records from the other direction at
`deferred-work.md:514` ("a mid-match quitter still vanishes silently"), which is why that entry is
marked related to this story.

This is the single largest piece of genuinely new work in 6-7, and it is a design question (Q5/Q6),
not a bug fix.

### What is genuinely absent

| 6-7 acceptance clause | State today |
| --- | --- |
| RECONNECTING banner + seamless resume | **Shipped** (`main.ts:2596-2610`) |
| Grace window is a CONFIG design target with tested semantics | **Shipped** (`constants.ts:1476`; `server/src/__tests__/reconnect.test.ts`, 396 lines) |
| Abandon-after-timeout — "fights on until sunk or match end" | **False** — the ship is deleted (`match.ts:475-484`) |
| Failed reconnect routes to results or home, never a dead screen | **Shipped for the in-page case** (`main.ts:1751-1766`); undefined for the refresh case, which cannot exist yet |
| Other captains' drops invisible — no wire field advertises them | **Holds.** `PlayerMeta` carries no connection field (`server/src/rooms/schema/ArenaState.ts:8-26`); frames are pure perception output |
| Refresh a match URL to resume (Eric's ask) | **Absent** — no route, no URL, no persisted token |

---

## §1. The investigation was right, with four corrections

The report's load-bearing claims all verified. Four things moved:

1. **Production 404 is now Confirmed, not Deduced.** `curl https://hullcracker.io/abc123` → **404**;
   `/` → 200. The report's one Deduced finding is closed.

2. **"The URL clear may be free" is wrong.** Direction §B guesses that because `returnToPort.ts`
   reloads, the URL clears itself. `location.reload()` **re-requests the same path** — a reload from
   `/abc123` lands back on `/abc123`. Four sites need explicit handling, and one is a hazard:
   `main.ts:1765` reloads *after* `DISCONNECTED`, which once refresh-resume exists becomes a
   **resume-retry loop** against a match that just refused us. Also `main.ts:1761` (match-over),
   `main.ts:4240` (requeue fallback), and `requeueToPort` (`main.ts:4220-4242`) which has no reload
   at all, so a survivor would keep the dead match's URL.

3. **The route-shadowing hazard is over-stated.** `app.config.ts:63`'s comment (and the report's
   Finding 1 framing) warn that a catch-all would shadow Colyseus's endpoints. At 0.17.44 it cannot:
   the Colyseus router registers on the **raw HTTP listener and runs before Express**
   (`@colyseus/core/build/router/index.mjs:33-44`). A strict pattern is still worth having — it
   protects the static assets — but it is belt-and-braces, not the safety argument.
   `generateId()` verified rather than assumed: nanoid at length **9** over exactly `[A-Za-z0-9_-]`
   (`@colyseus/core/build/utils/Utils.mjs:14`), so `/^\/[A-Za-z0-9_-]{9}$/` is right, and collides
   with none of `/health` (6), `/metrics` (7), `/liveness` (8), `/monitor` (7), `/playground` (10),
   `/__healthcheck` (13) or `/matchmake/…` (contains a second slash).

4. **A re-sent welcome is silently inert on today's client.** There is exactly one consumer
   (`connection.ts:222-233`) and it lives inside an already-settled promise, so the server-side
   `onReconnect` fix the report prescribes **does nothing at all** until a real second consumer is
   written. Worse, `welcome.sessionId` feeds `createGameState`, which is **not** idempotent. The
   welcome must be consumed *before* `buildGame` on the fresh-page path only — never fed into a live
   `Game`. (Note core calls `onReconnect` for **in-page** resumes too, so the re-send reaches clients
   that never needed it; the handler must stay idempotent.)

Also worth recording: `sessionStorage` is used **nowhere** in `client/src` (verified exhaustively),
and the localStorage set is nine keys, not the five the report lists — it misses `.horn`, `.helm`,
the legacy `hullcracker-muted`, and `hullcracker.session` (the session lock's own fallback key).

---

## §2. THE QUESTIONS

### Q1 — SCOPE. How much of this is cycle 101? *(the only one that must be answered)*

The story as it now stands is four separable bodies of work:

| Block | Content | Size |
| --- | --- | --- |
| **I. The match URL** | Investigation A + B + C — Express route, `history.replaceState`, token persistence, `onReconnect` welcome re-send | S + XS + M |
| **II. The abandon flow** | Make the AC true: a dropped captain's hull fights on; departures stop vanishing silently (`:514`) | M, and it touches `checkWin`/placement |
| **III. The catch-up** | The two ledger entries at `:30` and `:518` — missed sinkings, and the never-delivered own-death | M–L, and the only part that may bump PV |
| **IV. The grace mechanics** | `:22` grace-chaining budget, `:26` half-resume double-fault | S each, both need a ruling |

**Options:**

- **(a) All four.** The honest reading of "Story 6.7 + the investigation". Large cycle; III is the
  risk.
- **(b) I + II.** The URL and the abandon flow — Eric's actual ask plus the false acceptance
  criterion. III and IV stay ledgered with their questions answered for whoever picks them up.
- **(c) I only.** Ship the URL and refresh-resume; everything else stays deferred.
- **(d) II + III + IV.** Fix the reconnection semantics properly first; the URL waits.

**Recommendation: (b).** I is what Eric asked for and is genuinely small. II is a shipped acceptance
criterion that is false, and it is the one item where the *absence* is player-visible today (hulls
vanishing, matches ending on a disconnect). III is the expensive one and — per Q7/Q8 — the honest
versions of it cost a `PROTOCOL_VERSION` bump; it deserves its own cycle rather than riding along.
IV is two small rulings that can be answered here and built cheaply inside (b) if the answers are
"yes".

---

### Q2 — Which id does the URL carry: `roomId`, or a published `matchId`?

*This is the investigation's own flagged decision, and the only part that is cheap now and awkward
later (Finding 9).*

`roomId` is Colyseus's, addressable by the matchmaker, and **already embedded in the reconnection
token** as `"<roomId>:<secret>"` (`@colyseus/sdk/build/Room.mjs:243`) — so routing on it needs no
wire change and no server change whatsoever. `matchId` exists (`ArenaRoom.ts:525`) but is log-only,
appears in no type, and is the natural key a *replay* would need.

Both die at process restart today (single-process `LocalDriver`, no presence), so neither is durable
across a Render redeploy.

- **(a) `roomId`.** Ships immediately, zero wire cost. If replay ever lands, live URLs and replay
  URLs are two id spaces.
- **(b) Publish `matchId` and route on it.** Costs a `WelcomeMsg` field, a `matchId → roomId` lookup
  map, and a PV bump — for a benefit that only cashes out with accounts and match history.

**Recommendation: (a) `roomId`.** The replay argument is real but conditional on a roadmap item Eric
has described as "when/if". Paying a PV bump now against a maybe is the wrong trade, and the
migration later is a redirect, not a rewrite. **This is your call and I will not assume it.**

---

### Q3 — Refresh only, or must a *closed tab* resume too?

Eric said "refresh". That reads as `sessionStorage`: it survives a refresh, is scoped per-tab (so a
second tab cannot inherit a session — which matters for Q13 and for your multi-tab ruling), and dies
with the tab, so a stale token cannot resurrect a long-dead match.

Surviving a genuine tab *close* forces `localStorage` plus a client-side expiry stamp, because
`localStorage` has no natural lifetime and the 60s grace would have to be enforced by the client.

**Recommendation: `sessionStorage`, refresh only.** The 60s grace makes tab-close resume a narrow
window anyway, and per-tab scoping is the property that keeps the session lock honest.

---

### Q4 — A match URL looks shareable but is not. Is that acceptable?

Once B stamps `hullcracker.io/aBc123XyZ` in the address bar, it looks like a link. It is not: it
resolves for exactly one person — the holder of that match's reconnection token — and for anyone
else it can only land on home. Given that this epic is titled *Honest Lobbies* and amendment 39
ratified "the honest zero renders", a URL that silently means nothing to a friend is worth a ruling
rather than an assumption.

- **(a) Silent.** A stranger's visit just loads home, as if they typed the root. Cheapest, and
  arguably fine — the URL is a resume address, not an invitation.
- **(b) Explain it.** A stranger's visit loads home with a plain status line to the effect that the
  match is not theirs to join. Needs copy (see Q11's constraint).
- **(c) Do not stamp the URL at all** — persist the token only, and resume on a refresh of `/`.
  Loses Eric's stated "refresh that link" framing but sidesteps the question entirely.

**Recommendation: (a).** Add (b) only if live spectate (Q13) ever lands, at which point the URL
genuinely becomes an invitation and the copy has a job to do.

---

### Q5 — Should a never-returning captain's ship really fight on?

The acceptance criterion says yes; the code deletes the hull (§0). Making it true means changing
`Match.onPlayerLeave` (`match.ts:475-484`), which currently also books placement and triggers
`checkWin`.

- **(a) Build the AC.** At grace expiry the `ShipRecord` stays and keeps sailing under its last
  telegraph order until something sinks it or the match ends. Consequences that must be accepted
  with it: the roster keeps showing them afloat, `n AFLOAT` counts them, they remain a valid bounty
  and XP target, and a match can now be *won by* an absent captain whose hull happened to survive.
- **(b) Keep today's behaviour and correct the AC.** The hull is removed at grace expiry; the story
  text is amended to say so.
- **(c) Middle: the hull stays but is scuttled.** At grace expiry the ship takes a real sinking
  (`sinkShip`) rather than a silent deletion — so it produces a proper `sunk` event, a kill-feed
  line, a plume and a placement, and cannot win.

**Recommendation: (c).** (a) is the literal AC but it lets an absent player win a battle royale,
which I do not think is what the criterion intended — and 60s of unmanned straight-line sailing in a
storm mostly ends in a storm death anyway, just an invisible one. (c) makes the departure *legible*,
which is what `:514` is actually complaining about, without inventing a rule where absence pays.
**This is a game-design decision and I will not choose it for you.**

---

### Q6 — Does a departure get a register line?

`deferred-work.md:514`, unruled since 2026-08-04. Today a quit or an abandoned reconnect produces no
kill-feed line at all while `n AFLOAT` silently drops.

- **(a) A "LEFT THE BATTLE" register line** — a new feed grammar for departures.
- **(b) It reads as an ordinary sinking** — falls out for free if Q5 resolves to (c).
- **(c) Ratify the silence** — departures are deliberately invisible.

**Recommendation: (b) if Q5 = (c), else (a).** Note (a) needs copy you have to author (Q11's rule),
whereas (b) needs none — which is a point in (c)'s favour on Q5.

---

### Q7 — Catch-up fidelity: what does a resuming player learn about the sinkings they missed?

The ledger (`:518`) suggests deriving it from roster deltas, "since kills/deaths/alive survive in the
schema". **That mechanism is partially sound at best, and the project has already written down why.**
The `sunk` row's own ratification rationale says it verbatim (`server/src/game/signals.ts:1346-1349`):
kills "aggregate in the counters as (+1, +1) and **cannot be paired back from deltas**". A 60s gap is
strictly worse than the same-tick case that argument was written about. So a roster-delta digest can
say *who* went down but never *who sank them*, in what order, or when. And for the **refresh** case
there is no delta at all — a fresh page has no "before" snapshot.

- **(a) Accept the gap.** A resuming player simply missed those lines. Zero cost, zero wire.
- **(b) Degraded digest.** On resume, render unattributed, unordered "X WAS SUNK" lines from the
  roster. No wire, no PV bump. Risk: it looks like the kill feed and lies about attribution.
- **(c) Faithful catch-up.** The server retains a sunk log (`by` survives nowhere today — not on
  `ShipRecord`, not in `Match`) and re-sends it on resume. Correct in every channel. **Costs a new
  message and a `PROTOCOL_VERSION` bump**, and needs its own oracle tests because the perception
  property suite only covers `buildFrame` output and would not police it.

**Recommendation: (a) for this cycle, (c) when block III is scheduled.** (b) is the worst of the
three — it manufactures a feed that is confidently wrong about who killed whom, in a game whose kill
feed was deliberately made global and identity-exact.

---

### Q8 — Own-sinking: what does a player see if their hull sank while they were away?

Today: nothing. The own-`sunk` that latches the elimination modal and the placement is never
delivered, so a resumed player spectates with no ELIMINATED modal and no placement
(`:30`, `:518`). A **refresh** makes it worse — the score state, placement and elimination latch are
all lost, so a duplicate `sunk` could even re-open the modal.

The good news: "you are eliminated" is conveyable **with no wire at all** — spectator frames plus
your own roster row `alive=false` are sufficient for the client to notice on its first frame after
resume and synthesize the entry. What is *not* recoverable client-side is the placement (the schema
carries 0 until the match finishes), the killer, and the sink time.

- **(a) Bare synthesis, no wire.** The ELIMINATED modal opens with an approximate placement, no
  killer line, no timestamps. Free.
- **(b) Faithful.** Server conveys placement-at-death, killer and sink time. **PV bump**, and it
  rides with Q7(c).
- **(c) Leave it.** Resumed dead players spectate with no modal, as today.

**Recommendation: (a).** It closes the "mystery death" the user story names, and an approximate
placement is a smaller lie than no modal at all. Note that if the match *finished* while you were
away this is already handled — `lastResults` is re-sent (`ArenaRoom.ts:922`) and the elimination
modal is correctly suppressed.

---

### Q9 — Is there a per-match grace budget?

`deferred-work.md:22`, flagged as a game-design decision for you. Confirmed unlimited: nothing counts
reconnections, and every successful resume mints a **fresh** token and arms a brand-new 60s window
(`@colyseus/core/build/Room.mjs:660`, `:830`). A player can cycle drop → 59s ghost → resume for one
tick → drop, all match, staying functionally absent yet alive for placement.

- **(a) Leave it unlimited.** Simple; the exploit is tedious and self-punishing (your hull sails
  straight while you do it).
- **(b) Cap the count** — N reconnections per match, then the next drop is terminal.
- **(c) Cap cumulative seconds** — a per-match grace budget that depletes.

**Recommendation: (a) for now.** It is a real hole but an unattractive one, and any cap risks
punishing a genuinely bad connection — which is precisely the player this story exists to protect.
Worth revisiting if it is ever seen in the wild; the metrics to see it landed with Story 0.3.

---

### Q10 — Fix the half-resume double-fault, or keep it deferred?

`deferred-work.md:26`. **Verified still true at the installed versions.** Core rotates the token onto
the new client at reconnection-resolve (`Room.mjs:830`) and deletes the old entry (`:819-822`), all
*before* JOIN_ROOM is written (`:763-771`); the SDK only updates its token on receiving that ack
(`sdk/build/Room.mjs:243`). Die in that window and your retries carry a token that exists nowhere,
fast-failing while the ghost is held another 60s.

**This matters more than its ledger entry suggests, because persistence introduces a fresh instance
of the same fault class.** If the client persists the token once at connect, then a successful
*in-page* resume rotates it server-side, and a later **refresh carries the pre-resume token** — a
deterministic fast-fail on a session that was fully entitled to resume.

- **(a) Handle the new instance only** (mandatory either way): re-write the persisted token on every
  ack, and clear storage on any "invalid or expired". Cheap, and it is not optional if C ships.
- **(b) Also fix the original** via an acking-aware hold policy server-side.

**Recommendation: (a).** (b) is a Colyseus-internals fight for a narrow window; (a) is required
anyway and is the half that refresh-resume actually creates. I will build (a) as a matter of course
unless told otherwise — flagging it because the ledger entry is addressed-but-not-closed.

---

### Q11 — Banner copy: does the RECONNECTING banner gain a countdown or an attempt count?

The AC says "with auto-reconnect attempts". Today the banner is the bare word `RECONNECTING…`
(`main.ts:2598`) with no countdown, held for the full ~71s.

**Amendment 41 is the governing constraint here** — *"a ruling to put information somewhere is not a
licence to author the copy"* — so I am not going to invent this string.

- **(a) Leave it bare.** `RECONNECTING…`, unchanged.
- **(b) Add a countdown** against the real 60s grace, e.g. a `m:ss` register.
- **(c) Add an attempt count**, e.g. `ATTEMPT n/18`.

**Recommendation: (b) if anything, and you author the exact string.** A countdown is honest
information (the epic's whole theme) and the deadline is real and server-defined; an attempt count is
implementation trivia the player cannot act on. If (b), note the banner must be sized against the
**60s grace**, not the client's 71s patience, or it will count to zero and keep spinning.

One ordering trap for any richer banner: a drop inside the SDK's 5s `minUptime` fires `onDrop`
*before* the give-up check, so `RECONNECTING…` currently flashes and is instantly replaced by
`DISCONNECTED`. Cosmetic today; visible if a countdown is added.

---

### Q12 — Should a refreshed player's engine order be restored?

`Telegraph` resets to `NEUTRAL_INDEX` on a fresh page (`client/src/input/telegraph.ts:52-53`), while
the server still holds and is still running the last input you sent. So a refreshed captain's HUD
reads STOP while their hull sails on at flank — and the first helm touch snaps the ship to whatever
the fresh telegraph says.

- **(a) Restore it** — convey the last accepted order so the dial matches the hull.
- **(b) Accept it** — the dial reads STOP; the player re-orders.

**Recommendation: (a) if it can be done without wire** (the client can infer the order from its own
`you.` kinematics on the first frames), **(b) otherwise.** I will check the inference before
building; flagging it because a set-and-forget control that silently disagrees with the ship is a
feel bug, and this story is about a drop reading as a blip.

---

### Q13 — Live spectate stays out of 6-7. Confirm — and do you want to rule on the fog now?

The investigation recommends splitting capability D into its own story, and I agree. It is blocked in
four independent places (the room lock, seat accounting eating captains' seats, the fog failing
closed, and your own 2026-08-17 one-match-per-browser ruling), and its central question is a
perception rule an implementing agent is forbidden to invent.

The ruling it needs, when you want to make it:

| Option | Cheat exposure | Cost |
| --- | --- | --- |
| Spectate only **after** the match ends | None — already how `spectates()` behaves | Lowest |
| Spectate live, **fogged to one chosen captain's view** | None — reuses `observe()` with another observer id | Moderate; probably the most watchable |
| Spectate live **unfogged** | **Severe** — a second browser is a wallhack | Unacceptable without a ruling |
| Spectate live unfogged on a **broadcast delay** | Bounded by the delay | Highest — needs a frame ring buffer that does not exist |

**Recommendation: confirm the split; no ruling needed today.** I will add a story stub so it stops
being an untracked thread (the investigation confirmed nothing anywhere tracks match URLs, shareable
links, or replay).

---

### Q14 — Does 6-7 update `EXPERIENCE.md:106`, or does Story 7.5?

`EXPERIENCE.md:106` still reads *"Disconnect mid-match: banner + return to home"* — the
pre-auto-reconnect wording, which contradicts the resume flow shipped in Story 0.2. Story 7.5's own
acceptance criteria explicitly claim this reconciliation (`epics.md:1288`).

- **(a) 7.5 keeps it.** Leave the line; it is already assigned.
- **(b) 6-7 fixes it now**, since 6-7 is the story that makes it maximally wrong.

**Recommendation: (b), minimally** — one line, describing the shipped flow, with no other wording
touched. Leaving a design doc actively contradicting shipped behaviour for another whole epic is how
a source of truth stops being one. The standing rule that a change signal authorizes only what it
rules on means I will change that sentence and nothing else.

---

## §3. Rulings I will make myself unless you overrule them

These are engineering, not design, so I am not spending your attention on them:

1. **The SPA route is strict, and registered after `express.static`** —
   `/^\/[A-Za-z0-9_-]{9}$/` → `res.sendFile(index.html)`, with a test asserting `/health`,
   `/metrics`, `/liveness`, `/matchmake/*`, `/playground`, `/monitor` all still resolve.
2. **`history.replaceState`, never `pushState`** — a Back press must not walk out of a live match.
3. **The URL is cleared explicitly at all four exits**, not left to `location.reload()` — and
   `main.ts:1765`'s post-`DISCONNECTED` reload clears it *before* reloading, so a refused resume
   cannot loop.
4. **The welcome is consumed before `buildGame`, on the fresh-page path only** — never fed into a
   live `Game`, because `welcome.sessionId` → `createGameState` is not idempotent.
5. **`onReconnect` is total** — core wraps it rethrow-true (`Room.mjs:1129-1130`), so a throw inside
   it *aborts the resume*. It gets the `warnQuietly` posture, like every other room hook.
6. **The session lock learns about refresh.** The Web Locks path is clean, but the
   localStorage-heartbeat fallback has no unload release and a 3s stale window, so on a browser
   without `navigator.locks` a refresh-resume would deterministically refuse itself with
   `ALREADY AT SEA IN ANOTHER TAB` — at its own ghost. Fixed by persisting the holder id per-tab so a
   reloaded page adopts its own predecessor (a genuine second tab still gets refused), plus a
   `pagehide` release. A failed resume still releases the lock on its way home.
7. **No `PROTOCOL_VERSION` bump** for block I. Re-sending an unchanged `WelcomeMsg` from a new
   lifecycle hook adds no field, no channel and no new client read — the amendment-24 precedent
   ("PV moves when the client reads new bytes") and the shipped `MSG.results` re-send at
   `ArenaRoom.ts:922` both govern. Any Q7(c)/Q8(b) catch-up field flips this, which is a reason to
   keep block III separate.
8. **Regression tests that would hurt most and show up least**: a resume gets a welcome; the ship
   count is unchanged across a resume (the second-hull regression); the strict route does not shadow
   the six live endpoints; a stale persisted token fails clean to home.

---

## §4. What I will build once you answer

Assuming the recommended set (Q1=b, Q2=a, Q3=sessionStorage, Q4=a, Q5=c, Q6=b, Q7=a, Q8=a, Q9=a,
Q10=a, Q11=a-or-your-string, Q12=a-if-free, Q13=split, Q14=b):

- **Server:** the strict SPA route; `ArenaRoom.onReconnect` re-sending an extracted welcome payload
  (without re-running `world.addShip`); grace expiry routed through a real sinking rather than a
  silent `removeShip`.
- **Client:** token persisted to `sessionStorage` and re-written on every ack; `replaceState` at
  match start and explicit clears at all four exits; a resume-on-load path that validates the stored
  token's `roomId` prefix against the URL before any network call and falls back to home on every
  failure; a second, idempotent welcome consumer on the fresh-page path; the elimination-modal
  synthesis; the session-lock refresh fix.
- **Docs:** `EXPERIENCE.md:106`; epic-6 amendments **46+**; both tracker files
  (`sprint-status.yaml:210` `6-7-reconnection-ux: backlog` → done, and `gds-workflow-status.yaml`);
  a story stub for live spectate; the resolved ledger entries closed with their rulings.

Answer Q1 and correct whichever recommendations you disagree with — everything else can ride.

---

## §5. ANSWERS — Eric's rulings, 2026-08-18

**The gate is closed.** Fourteen questions became sixteen (two were created by Eric's own
clarifications) and then twelve, because the whole match-URL block was withdrawn. Rulings of record
below; the durable home for these is `epic-6-context-amendments.md` **46+**.

### R0 — THE MATCH URL IS WITHDRAWN. Investigated, considered, parked.

Eric, verbatim:

> *"Forget about considerations for parties right now. In fact forget the URL idea. We can add it
> later, but its at least investigated and considered. Lets just move ahead with the original
> reconnect scope. As we are now just always running from hullcracker.io, and only allowed to be in
> one game at once, then reconnecting to the game is pretty easy. If you want to leave it, pull up
> the menu and abandon ship properly."*

So capabilities **A (the Express route), B (`history.replaceState`) and the whole id-space question
(Q2) are OUT** — along with the party/replay considerations that were briefly pulled in and then
withdrawn in the same breath. **Capability C survives, minus its URL half**: token persistence, the
`onReconnect` welcome re-send, and resume-on-load. The investigation is not wasted — it is the
record that makes adding the URL later a decision rather than a discovery.

**Two things died with the URL, and both are worth naming so nobody re-derives them:**

- **The id-space question (Q2) is moot**, including the party argument that had just made an owned
  `matchId` the better answer. Nothing is published, so nothing is committed to.
- **The rejoin-window question (the one Eric's own clarification created) is moot.** It asked what
  `/<match-id>` means at 8:00 when you dropped at 3:00 and the 60s grace is long gone. With no URL
  there is no such address, so the answer is simply the grace window and nothing else.

**And the design it was fighting resolved itself.** Eric's earlier instinct — *"if someone goes back
to hullcracker.io/ then they probably wanted to abandon their game"* — is **superseded by his own
later message** and by a law already shipped. Because the root IS the only address, root must mean
*resume*; leaving is an explicit act. That is not new policy: `client/src/ui/settings.ts:155` has
carried the ratified leaving law since amendment 19 —

> *"the modal's RETURN TO PORT or settings' ABANDON MATCH — never ESC, never a page refresh"*

— so **a refresh was never a sanctioned way to leave a match**, and making it resume is the shipped
law's own consequence. `ABANDON MATCH` already exists, confirm-gated, in the settings overlay
(`canAbandon`, `settings.ts:158`). **No new leave UI is needed.**

### R1–R12 — the rulings

| # | Question | Ruling | Note |
| - | -------- | ------ | ---- |
| **R1** | Scope | **All four blocks, minus the withdrawn URL.** Block I collapses to refresh-resume | Blocks II, III, IV as scoped in §2 Q1 |
| **R2** | Token store | **`sessionStorage`, refresh only** | Per-tab scoping matches the one-match-per-browser ruling; tab-close resume is explicitly not offered |
| **R3** | Grace expiry on a live hull | **Scuttle it — a real sinking** | `sinkShip`, not `removeShip`: proper `sunk` event, feed line, plume, placement. An absent player cannot win |
| **R4** | Consented abandon vs timeout | **Identical — one path** | ABANDON MATCH and a 60s timeout do the same thing. One rule to explain |
| **R5** | Departure register line | **Reads as an ordinary sinking** | Falls out free from R3. **No new copy authored** — which is why R3 was the cheap ruling |
| **R6** | Catch-up fidelity | **Accept the gap** | No wire. The feed's 8s TTL means most missed lines would have expired anyway |
| **R7** | Own-sinking on resume | **Bare synthesis, no wire** | Client notices `spec` + own `alive=false` on its first resumed frame and opens ELIMINATED with an approximate placement |
| **R8** | Per-match grace budget | **Leave it unlimited** | Ledger entry `:22` closed as accepted. The exploit is self-punishing; a cap would punish bad connections |
| **R9** | Half-resume double-fault | **Fix the new instance only** | Re-write the persisted token on every ack; clear on any "invalid or expired". Ledger `:26` stays open for the original window |
| **R10** | Banner copy | **Leave it bare** — `RECONNECTING…` unchanged | No countdown, no attempt count. Amendment 41 respected: no copy invented |
| **R11** | Telegraph on refresh | **Restore it if it costs no wire, else accept the reset** | Inference from own-ship kinematics to be checked first; a wire field is NOT authorized for this |
| **R12** | Live spectate | **Split into its own story, no fog ruling today** | Story stub added so it stops being an untracked thread |
| **R13** | `EXPERIENCE.md:106` | **6-7 fixes that one line now** | One sentence only — a change signal authorizes only what it rules on |

### The consequence that matters: `PROTOCOL_VERSION` STAYS AT 40

Every ruling that could have moved the wire went the other way, independently:

- the URL is withdrawn, so no `matchId` is published (R0);
- catch-up accepts the gap, so no sunk-log channel (R6);
- own-sinking synthesizes client-side, so no placement/killer/time fields (R7);
- the telegraph restore is authorized **only** if it needs no field (R11).

So this cycle re-sends an **unchanged** `WelcomeMsg` from a new lifecycle hook and adds nothing else
to the wire. Under the amendment-24 precedent (PV moves when the client **reads** new bytes) and the
shipped `MSG.results` re-send at `ArenaRoom.ts:922`, **PV stays 40**. Anything that would move it is
out of scope by ruling, not by oversight — if a reviewer finds a new wire field in this cycle's diff,
that is a defect, not a judgement call.

### What R3 costs, stated plainly

Routing grace expiry through a real sinking is the largest behavioural change in the cycle and it
touches the win path. `Match.onPlayerLeave` currently books placement via `recordSink` then calls
`world.removeShip`, and `checkWin()` runs on the removal. After R3 the departure must produce a
genuine `sunk` — which means it flows through the Public Register's three-clause gate, reaches every
client for a captain victim, pays a killer nobody (no `by`), and must not pay bounty or XP to anyone.
The regression that would hurt most and show up least: **a scuttle must not be creditable as a kill**.

