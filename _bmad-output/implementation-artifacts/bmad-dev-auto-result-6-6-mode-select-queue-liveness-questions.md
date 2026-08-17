---
status: blocked
blocking_condition: intent gaps — pre-implementation question gate (Eric rulings required)
story: 'Story 6.6 — Mode Select & Queue Liveness'
cycle: 98 (0.17.98 if landed)
created: '2026-08-17'
base: main @ aab28ca (cycle 97, 0.17.97, PROTOCOL_VERSION 40)
---

# Story 6-6 — Mode Select & Queue Liveness: pre-implementation question gate

Eric asked for questions before implementation, and named the information he wants:

> *"how many in queue, how long on the lobby timer until the next game, and how many are currently
> playing in this mode **right now** and across how many games"*

Four parallel read-only investigations were run against this worktree's `main` (server queue/room
topology + the real Colyseus 0.17.44 API surface, the client home screen, the design system, and the
deferred-work/amendments ledger). Two load-bearing framework mechanics were then verified by hand
against `node_modules` rather than taken on report. Everything below is evidenced with `file:line`;
where a claim is an inference it says so.

**Read §0 and §1 first — §0 says the feature is buildable, §1 says one third of it is degenerate and
another third will read zero for weeks.**

---

## §0. THE HEADLINE: all three numbers are buildable, and the mechanism is D8-clean

The architectural worry going in was that counting players across rooms would force the
same-process co-residency assumption that **D8 forbids** (`epic-6-context.md:57`). It does not.

**`matchMaker.query()` goes entirely through the DRIVER** — `MatchMaker.mjs:161-163` is literally
`return await driver.query(conditions, sortOptions)`. No local room-map read, no
`getLocalRoomById`. With today's `LocalDriver` the cache is an in-memory array; under a future
`@colyseus/redis-driver` the identical call hits Redis. **This is the correct, D8-safe mechanism and
it is the one the spec will use.**

Three things I verified by hand because the whole feature rests on them:

1. **Locked rooms stay queryable.** Every production arena locks at birth
   (`ArenaRoom.ts:335`, `expectedCaptains !== undefined ⇒ lock()`), so if locking removed the
   listing, "players in live matches" would be unbuildable. It does not:
   `LocalDriver.query()` filters by **only the conditions you pass** — the implicit `locked: false`
   lives in `findOneRoomAvailable`, not in `query`. `query({ name: 'arena' })` returns locked rooms.
2. **The listing is persisted after `onCreate`.** `MatchMaker.mjs:327` runs
   `driver.persist(room._listing, true)` *after* `onCreate` returns, which is also why 6-5's
   "no unlocked window" argument held.
3. **`setMetadata()` inside `onCreate` survives.** `Room.mjs:396-413` only calls
   `driver.persist` when `_internalState === CREATED`, which is not yet true inside `onCreate`
   (it is set at `MatchMaker.mjs:298`) — but it *does* write `_listing.metadata` in memory, and the
   create-time persist at `:327` then carries it. So a mode tag set at create works on both the
   local and a future Redis driver, with **zero extra writes**. (This is a real trap in the other
   direction: metadata set at create needs no persist call, metadata changed *later* does.)

`IRoomCache` (`matchmaker/driver.d.ts:36-78`) carries `name, roomId, processId, clients, maxClients,
locked, private, metadata, createdAt`. And `clients` is driver-maintained, incremented on seat
reservation (`Room.mjs:894`, `#_incrementClientCount` at `:1077-1086`), decremented on reservation
timeout. So `sum(clients)` over `{ name: 'arena' }` is a **truthful cross-process human count**.

**Bots are not clients.** A solo room has `clients === 1` and 19 invisible hulls
(`buildBotFleet`, `ArenaRoom.ts:351`). That is a feature for honesty, and it forces Q3.

---

## §1. Two facts about Eric's ask that should change what gets built

### 1.1 "Across how many games" is DEGENERATE in Solo vs AI

Solo vs AI is one human per room, always — `client.create('arena', {solo:true})`
(`connection.ts:358`) always mints a fresh room, and `expectedCaptains: 1`
(`ArenaRoom.ts:315`). So the number of Solo-vs-AI players and the number of Solo-vs-AI games are
**the same number, permanently**. A readout saying `12 PLAYING ACROSS 12 GAMES` is not informative,
it is the same fact printed twice.

"Across how many games" is only meaningful for **Standard** (and later DUO/TRIO), where 20 players
might be 1 game or 20 games spread thin. Recorded here because it changes the copy, and because it
is the sort of thing that reads fine in a spec and looks silly on the water. **See Q4.**

### 1.2 At beta population, the honest readout is mostly `0`

Standard needs **2 humans** to arm anything (`CONFIG.match.minHumans = 2`,
`constants.ts:1434`; amendment 3: the clock arms at the SECOND captain and never moves). Until
there is a real population, the truthful Standard line is `0 QUEUED · NO COUNTDOWN`.

This is not a defect — it is exactly the honesty amendment 4 ratified (*"the queue reports the
honest state … and does not run a countdown that cannot fire"*). But it means **the story's real
value is the STEER, not the counts**: the counts exist to make "nobody is here, take Solo vs AI"
credible rather than a nag. The AC agrees (`epics.md:1193`, *"steers toward Solo vs AI when Standard
is empty"*).

It also collides head-on with a ratified design rule — see **Q5**, which is the one question here
that asks Eric to override something he already ruled.

---

## §2. What exists today, and the four gaps

### Already correct, needs zero work

| Area | Status | Evidence |
|---|---|---|
| Cross-room counting mechanism | Exists, D8-clean, unused | `MatchMaker.mjs:161-163` |
| Queue pooling + honest `startsInMs: null` | Shipped and correct | `queue.ts:83-100` |
| Mode row built to hold DUO/TRIO | Shipped by 6-5 | `home.ts:486-493` |
| In-memory mode on `lastDeploy` | Shipped by 6-5 | `main.ts:4152` |
| Express + a typed route idiom to copy | Shipped | `metrics.ts:250-258`, `app.config.ts:34-50` |
| `hullcracker.*` localStorage idiom | Shipped ×6 keys | `home.ts:53-54` |

### The four gaps

**2.1 — There is no pre-join channel at all.** `MSG.queueStatus` is sent to *pooled captains only*
(`StandardQueueRoom.ts:177-185`). The home screen before you press anything has **no data source**.
`probeServer()` (`connection.ts:193-205`) is a `mode:'no-cors'` fetch that reads no body — a
boolean reachability ping, nothing more. This is the single largest piece of new plumbing. **Q1.**

**2.2 — No arena knows its own mode.** `setMetadata` has **zero hits** anywhere in `server/src` or
`client/src`. `ArenaState` carries no mode field. `finishCreate` (`ArenaRoom.ts:315`) knows
`sanitized.solo` and immediately throws that knowledge away. Without a tag, *"how many are playing
**in this mode**"* is unanswerable. **Q2.**

**2.3 — The lobby timer is a private field.** `armedAtMs` (`StandardQueueRoom.ts:113`) has no
schema, no metadata, no getter. And the queue room **does not exist when nobody is queued**
(`autoDispose = true`, `:96`) — so "0 in queue" is the *absence of a room*, not a room reporting
zero. Any query must treat empty-result and zero as the same state. **Q7.**

**2.4 — `/metrics` is the wrong source.** It reads `matchMaker.stats.local`
(`metrics.ts:218-231`) — **process-local**, which is the co-residency assumption D8 forbids — and
it is mode-agnostic and room-type-agnostic (it counts queue rooms and arenas together). Reusing it
would bake in exactly the bug the architecture rule exists to prevent. `stats.getGlobalCCU()` is the
presence-backed alternative but still has no per-mode or per-name breakdown. **The spec will not use
`/metrics` for this.**

---

## §3. QUESTIONS FOR ERIC

Each carries the orchestrator's recommendation. **Recommendations are proposals, not decisions.**
A bare `(a)`/`(b)` per question unblocks implementation.

### Q1 — How does the home screen get the numbers? ⚙️ ARCHITECTURE — the biggest one

Nothing reaches the home screen today (§2.1). Three real shapes:

- **(a) RECOMMENDED — a new public HTTP endpoint, polled by home.** A `GET /liveness` built with the
  exact `createEndpoint`/`createRouter` idiom already in `metrics.ts:250-258`, returning one small
  JSON aggregate. Server-side it is `matchMaker.query({name:'arena'})` + `query({name:'queue'})`,
  folded by a **pure aggregator over an injected query function** so it unit-tests in this repo's
  established style. Cheapest by a wide margin: no new room type, no websocket for a player who is
  only looking, no schema, no PV move. Home already has a `fetch` precedent to follow.
- **(b) A `LobbyRoom` the home screen joins.** Colyseus ships one (`build/rooms/LobbyRoom.d.ts`) and
  it is presence-backed, so it is also D8-clean, and it *pushes* rather than polls. Costs: a real
  websocket per idle home-screen visitor, it hands the client raw per-room records including
  `roomId`s to aggregate itself, and it is a second connection to reason about alongside the queue
  and the arena. **Not recommended** — more moving parts for a number that changes slowly.
- **(c) Let the home screen join the queue room read-only before committing.** Rejected outright:
  it destroys the meaning of the queue (being in it is a commitment), and amendment 3's arm-at-2nd-
  captain rule would start firing on window-shoppers.

**Recommendation: (a).**

### Q2 — May the arena room carry a `mode` tag? ⚙️ ARCHITECTURE — a ratified-principle question

To answer *"in this mode"* the driver cache must be able to tell a Standard arena from a Solo-vs-AI
one. The one-line fix is `void this.setMetadata({ mode: sanitized.solo ? 'soloVsAi' : 'standard' })`
in `finishCreate` — verified free of extra persists (§0.3).

**I believe this does NOT violate anything, and want it confirmed rather than assumed.** The
ratified line (amendment 29) is that *GAME LOGIC* never forks on mode — storm, economy, PvE,
perception and the win check are byte-identical — and that **`ArenaRoom` is already "THE ONLY FILE
THAT KNOWS THE WORD SOLO"** (`spec-6-5-solo-vs-ai-mode.md:86`). Metadata is set in that same file, in the room adapter
layer, and no `server/src/game/` file reads it. The 6-5 verification step `git grep -n "solo"
server/src/game/` still returns nothing.

- **(a) RECOMMENDED — yes, tag the room in `ArenaRoom.finishCreate`.** The word stays in the one
  file that already owns it; the simulation never learns it.
- (b) No — then per-mode live counts are impossible and the readout can only report a single
  server-wide total. (Buildable, strictly less than what was asked for.)

**Recommendation: (a).**

### Q3 — What is a "player" in the count: humans, or participants? 🎮 HONESTY

Bots hold no seat, so the driver's `clients` count is **humans only** for free. But amendment 30
ruled the opposite convention for `n AFLOAT`: *"AFLOAT counts every PARTICIPANT — human or AI
captain."*

The two are not in conflict — they answer different questions — but the story is called *honest*
lobbies and this is where honesty is decided:

- **(a) RECOMMENDED — HUMANS ONLY.** `12 PLAYING` means twelve people. Printing `240 PLAYING` when
  it is 12 humans and 228 bots is precisely the kind of population theater this epic exists to
  refuse, and a new player who joins expecting a busy server would find out in one match.
- (b) Participants, matching amendment 30's AFLOAT register (consistent internal vocabulary, but
  the number becomes marketing rather than information).

**Recommendation: (a) — and if you take it, the copy should probably say `CAPTAINS`, matching the
game's own word for a person, so it never gets confused with AFLOAT.**

### Q4 — What is a "game", and does the games count ship at all? 🎮 DESIGN

Two sub-parts.

**Q4a — which rooms count as a live game?** The driver knows `clients` per room but not match phase
(`matchPhase` lives only in `ArenaState`). So:
- **(a) RECOMMENDED — every arena room counts, any phase.** A room in `boarding`/`countdown` *is* a
  game about to start; a room in `results` is a game ending. Zero extra writes.
- (b) Only `active` matches — needs a metadata write on phase transition (~2 extra writes per match,
  cheap but real) and makes a lobby about to sail invisible.

**Q4b — do we show "across how many games" for Solo vs AI at all?** Per §1.1 it is always
`N players across N games`.
- **(a) RECOMMENDED — show the games count for Standard only; Solo vs AI shows players only.**
- (b) Show it everywhere for symmetry, and accept that the solo line prints the same number twice.

**Recommendation: (a) and (a).**

### Q5 — The zero state, and a ratified rule that points the wrong way 🎨 DESIGN — needs an override

`EXPERIENCE.md:108` ratifies: *"empty kill feed / zero kills render as **absence, not
placeholders**."* Applied literally to this feature, a Standard queue of zero would render as
**nothing at all** — which hides exactly the information the story exists to publish, at exactly the
moment (§1.2) it is most decision-relevant. The AC meanwhile *requires* the empty case to do
something specific: steer to Solo vs AI.

- **(a) RECOMMENDED — the zero is load-bearing here, so it renders.** `EXPERIENCE.md:108` governs
  decorative absences (an empty feed teaches nothing); a queue population of zero is a *fact the
  player needs*. Proposed: `STANDARD · NO CAPTAINS QUEUED` with the steer beneath it, rather than a
  blank space. This would be recorded as an amendment scoping :108 to decorative empties.
- (b) Honour :108 literally — hide the Standard line when empty, show only the Solo vs AI steer. The
  player then cannot distinguish "empty" from "broken", which is the exact failure the story's own
  user-story names (*"wondering if the game is broken"*, `epics.md:1186`).

**Recommendation: (a).** This is the only question here that asks you to override a ratified rule,
so it is stated plainly rather than slipped into a design note.

### Q6 — What does it look like? 🎨 DESIGN — the design system is silent, by admission

There is **no spec for this surface anywhere**. The implementation-readiness reviewer said so at the
time (`implementation-readiness-report-2026-07-17.md:251`): *"neither DESIGN.md nor EXPERIENCE.md
specs that surface … design work hiding in an implementation story."* Confirmed independently: the
design docs have no liveness component, no player-count token, and no register for a compound
`N players · N games` readout on port chrome.

What IS binding: Geist Mono, uppercase, letter-spaced, `tabular-nums` for every number
(`DESIGN.md:183`); load-bearing numbers may **not** use `text-muted` (`DESIGN.md:153`); port chrome
is soft/rounded, not the sharp HUD register (`DESIGN.md:217`).

- **(a) RECOMMENDED — one mono register line beneath the mode row**, borrowing the BR chrome bar's
  ratified `N LABEL · N LABEL` grammar (`DESIGN.md:235`) which is the only compound-readout grammar
  the project has. Sketch:
  `SOLO · 4 QUEUED · STARTS 1:23` / `SOLO VS AI · 12 CAPTAINS PLAYING`
  Cheapest, reuses a settled grammar, and **touches neither existing home test pin**.
- (b) Annotate each mode button with its own count. Reads well, but **breaks `home.test.ts:244-253`**,
  which pins both buttons to `children.length === 1` (bare label, no sub-line) — i.e. it would
  partially undo amendment 31's sub-line deletion barely a day after you ruled it.
- (c) A bordered card/panel above the buttons. Most room for the numbers, most new design surface
  invented without a spec.

**Recommendation: (a).**

### Q7 — Does the home screen show a live ticking lobby timer? 🎮 DESIGN + honesty

You asked for *"how long on the lobby timer until the next game."* It is showable — but there is a
subtlety worth your ruling, because the timer belongs to **a cohort you have not joined**.

If home shows `STARTS 0:47` and you press SOLO at 0:46, you inherit that deadline and sail almost
immediately (good — that is the number doing its job). If you press at 0:02, the cohort may form
without you and you land in a **fresh** pool with no countdown at all — the honest number you acted
on has already expired. Amendment 3 guarantees the deadline never extends, so this is real.

- **(a) RECOMMENDED — show it, ticking locally from an absolute deadline.** Publish
  `deadlineAt` (absolute epoch) rather than a re-polled `startsInMs`, so the client counts down
  smoothly between polls and the poll rate stays slow. Accept the near-expiry edge: it resolves into
  "you're in a fresh queue" one second later, which the same readout then reports honestly.
- (b) Show pooled counts only, no pre-join timer — strictly less than you asked for, but immune to
  the stale-deadline edge.

**Recommendation: (a).**

### Q8 — What does persisting the mode actually DO? 📋 SCOPE

UX-DR25 says *"the pick persists in localStorage"*, and `main.ts:4143` reserves the key
`hullcracker.mode` for this story. But amendment 31 shipped the home screen as **two direct-action
buttons**, not a selector with a stored selection — so there is no "current pick" to restore.

- **(a) RECOMMENDED — keep two direct buttons; persist last-used mode only, so an auto-requeue
  survives a page reload.** UX-DR25's "pick persists" is satisfied in the only way that means
  anything given your button ruling. Minimal, no visual change.
- (b) Convert the row into a real selector (mode chips + one SET SAIL). This contradicts the row you
  ruled yesterday and re-opens the sub-line question. Not recommended.
- (c) Skip persistence entirely as vestigial.

**Recommendation: (a).**

### Q9 — Poll cadence and cost ⚙️ ENG — confirm the default

Every idle home screen would poll. Proposal: **client polls every 10 s**, and the **server caches the
aggregate for ~2 s**, so a hundred home screens cost ~one driver query every 2 s rather than ten per
second. The timer stays smooth because it ticks locally off `deadlineAt` (Q7a).

**Recommendation: accept 10 s / 2 s unless you want it livelier.**

### Q10 — A public, unauthenticated population endpoint 🔒 SECURITY

Nothing in the ledger has ever discussed publishing counts, so it is surfaced rather than assumed.
`/health` and `/metrics` are already public and unauthenticated (`app.config.ts:35`,
`metrics.ts:250`). A `/liveness` route would expose "how many people are playing" to anyone —
normal for a browser game, and it publishes **aggregates only, never `roomId`s or names**.

Related, and **still unruled from 6-5** (amendment 29): an unauthenticated
`POST /matchmake/create/arena` can mint a full 20-hull simulating room with no rate limit. Adding a
public liveness counter makes that slightly easier to *observe*, not easier to *do*.

- **(a) RECOMMENDED — ship `/liveness` public, aggregates only. Leave the create-rate cap as its own
  hardening item.**
- (b) Ship the counter and fold a cheap per-IP create throttle into this story.

**Recommendation: (a).**

### Q11 — What do we CALL the standard mode in the readout? ✍️ COPY

The top button says **SOLO**, meaning "queue alone, against humans" (DUO/TRIO join it later). The
other says **SOLO VS AI**. Those two labels sit fine as buttons but read confusingly side by side in
a liveness line — `SOLO · 4 QUEUED` next to `SOLO VS AI · 12 PLAYING` invites "wait, which one is
the single-player one?". The 6-1 gate flagged the register as unresolved and handed the ruling to
this story (Q15 there); `EXPERIENCE.md:256` also still owes a *"Solo vs Bots" → "Solo vs AI"* fix.

- **(a) RECOMMENDED — keep the button words exactly** (`SOLO`, `SOLO VS AI`); the readout labels
  match the buttons the player is looking at, which is the same reasoning that killed the sub-line.
- (b) Use a different word for the queue in the readout (e.g. `STANDARD`), accepting that the
  readout and the button disagree.

**Recommendation: (a).**

### Q12 — Scope confirmations ✅ (change nothing unless you say so)

1. **No DUO/TRIO this story** — they do not exist as modes; the row stays SOLO + SOLO VS AI.
2. **`?direct=1` / `HC_DEV_OPTIONS` untouched** (amendment 9, reaffirmed by 6-5).
3. **`queue.ts` policy untouched** — the only queue change would be publishing what it already
   computes. No timer retune, no privileged position, no front-of-pool.
4. **The secondary-button treatment stays as shipped** (SOLO amber-lit, SOLO VS AI unlit phosphor).
   It is still formally UNRULED (amendment 31) — you have seen a screenshot only. Say the word if
   you want it changed while the file is open, otherwise it ships unchanged again.

---

## §4. What the spec will contain once these are ruled

Assuming every recommendation is taken, the shape is:

- `server/src/liveness.ts` — NEW. A **pure aggregator** over an injected query function
  (`(conditions) => Promise<IRoomCache[]>`), folding arena + queue cache entries into
  `{ standard: {queued, deadlineAt, playing, games}, soloVsAi: {playing} }`. Unit-testable with no
  framework, in the `metrics.test.ts` mocking idiom.
- `server/src/metrics.ts` (or a sibling) — the `GET /liveness` endpoint + a ~2 s cache.
- `server/src/rooms/ArenaRoom.ts` — one `setMetadata({ mode })` line in `finishCreate`.
- `server/src/rooms/StandardQueueRoom.ts` — publish `{ pooled, deadlineAt }` to its listing metadata
  when they change (not every tick).
- `client/src/net/liveness.ts` — NEW. Real (CORS-clean) fetch + poll + a fail-safe "unknown" path
  matching `queueStatusLine`'s existing fail-safe posture.
- `client/src/ui/home.ts` — the register line, its `HomeHandle` setter, `saveMode`/`loadSavedMode`
  on the `hullcracker.*` idiom.
- `client/src/main.ts` — read the persisted mode at boot.
- Tests: `liveness.test.ts` (aggregator + the empty-driver case), a home render test, and an
  extension of `queueSmoke.mjs` or a new `livenessSmoke.mjs` over a real socket.
- Trackers: `sprint-status.yaml` + `gds-workflow-status.yaml` in the same PR, and epic-6 amendments
  32+ for every ruling below.

`PROTOCOL_VERSION` is expected to **stay 40** — this adds an HTTP route and room metadata, neither of
which is the arena wire contract. `shared/` gains at most a shared response type; that will be
re-adjudicated at the review gate against amendment 24's precedent (a CONFIG/type bumps PV only when
the client reads it across the wire).

---

## §5. Risk ranking — what would silently ship wrong

1. **Using `/metrics`/`stats.local` because it is already there** — process-local, mode-blind, and
   it would work perfectly on one Render dyno and lie the day there are two. This is the D8 trap and
   it is the single most likely wrong turn.
2. **Counting bots as players** (Q3) — nothing throws, the number just becomes 20× and false.
3. **Metadata written every queue tick** — 1 Hz driver writes per queue room forever, invisible on
   `LocalDriver`, a real Redis cost later. Publish on change, not on tick.
4. **Treating "no queue room" as an error** rather than as zero (`autoDispose`, §2.3).
5. **A pre-join timer that keeps ticking after its cohort formed** — shows `0:00` forever unless the
   poll resets it.
6. **Breaking `home.test.ts:244-253`** by hanging counts off the buttons (Q6b), quietly undoing
   amendment 31.
7. `home.test.ts:79-82` pins that `queueStatusLine()` carries no `SOLO|MODE|VS AI` copy — if the
   liveness text lands in a *separate* element (Q6a) that pin stays true and untouched; if it is
   folded into that reducer, the pin must be deliberately revised, not deleted.

---

## §6. Answer format

Answering Q1–Q12 unblocks implementation — a bare `(a)`/`(b)` per question is enough, with any
override in your own words.

- **Q1, Q2, Q6** change the most work.
- **Q5 is the one that overrides a ratified rule** and should not be answered by reflex.
- **Q3, Q4, Q7, Q11** decide what the numbers actually mean and say.
- **Q9, Q12** are confirmations with standing recommendations to change nothing.
