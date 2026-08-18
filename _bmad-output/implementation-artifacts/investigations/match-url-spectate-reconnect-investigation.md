# Investigation: Match-addressable URLs — `hullcracker.io/<game-id>` for spectate, play, and refresh-resume

## Hand-off Brief

1. **What was asked.** How hard is it to make `hullcracker.io/<game-id>` a real address — one that a queued player is
   moved to when their match starts, that they can play from, that they can *refresh* to get back into a match after a
   drop, and that might one day serve a replay.
2. **Where the case stands.** Concluded, exploration case, **Confirmed** evidence throughout. The request splits into
   four capabilities with wildly different costs: **the URL, the redirect, and refresh-resume are cheap and belong in
   Story 6-7** (three small pieces, one of which — a welcome re-send on reconnect — is the only genuinely new server
   code); **spectating someone else's live match is blocked in four independent places**, one of which is the master
   perception invariant, and is a design ruling rather than an engineering task.
3. **What's needed next.** Hand the A/B/C bundle to the 6-7 agent as scoped below, and **split D (live spectate) into
   its own story gated on an Eric ruling** about what a spectator is allowed to see. One decision (which id the URL
   carries) should be made *before* 6-7 writes the URL, because it is the only part that is expensive to change later.

## Case Info

| Field            | Value                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Ticket           | N/A — feasibility question ahead of Story 6.7 (Reconnection UX)                                          |
| Date opened      | 2026-08-18                                                                                               |
| Status           | **Concluded**                                                                                            |
| Case type        | Exploration (feasibility / area model). No symptom, no defect under investigation.                        |
| System           | Hullcracker.io 0.17.x · TS monorepo · Colyseus `@colyseus/core` 0.17.44 / `@colyseus/sdk` 0.17.43 · Render |
| Code baseline    | `origin/main` @ `3c51ddc` (PR #160, Story 6-6). **All `path:line` citations are against this commit.**    |
| Evidence sources | Source code, installed `@colyseus/core` + `@colyseus/sdk` build output, `render.yaml`, epics.md, deferred-work.md, CLAUDE.md ledger |

> **Baseline note for the next agent.** Eric's local `main` checkout was at `51e0260` when this investigation opened —
> **one cycle behind** `origin/main` (`3c51ddc`, Story 6-6 queue liveness). Story 6-6 touched `app.config.ts`,
> `StandardQueueRoom.ts`, `ArenaRoom.ts`, `main.ts`, `home.ts` and added `server/src/liveness.ts` — all files this
> investigation cites. Cite against `origin/main` or newer, and `git pull` before starting.

## Problem Statement

Eric, verbatim:

> how difficult would it be to add an endpoint that takes a game id (i.e. hullcracker.io/&lt;game-id&gt;) and lets me
> spectate that game? When I am queued and a player in the game, I'd like to be taken to that URL once the game starts,
> and as a player I want to be able to play from that link. If I get disconnected I should be able to refresh that link
> to go back to the game. This would be part of the 6-7 story reconnection UX. At some point in the future, when/if i
> move to accounts and match history tracking, visiting that link might result in a replay of the game, too.. I just
> want an investigation and report that I could pass to the 6-7 story agent(s) (or not).

Decomposed into five separable capabilities, because the evidence prices them very differently:

| ID | Capability | Verdict |
| -- | ---------- | ------- |
| **A** | `hullcracker.io/<id>` serves the app instead of 404 | **S** — ~10 lines, one file, one real hazard |
| **B** | A player is moved to that URL when the match starts, and can play from it | **XS** — one `history.replaceState`; but see the id-space decision |
| **C** | Refresh that URL to resume a live match | **M** — the door is already open server-side; one new hook + client persistence |
| **D** | Spectate *someone else's* live match from that URL | **L, and BLOCKED** — needs an Eric ruling on fog; four independent blockers |
| **E** | The URL serves a replay, later | Not costed. Cheaper than it looks (the sim is deterministic), but it constrains A/B's id choice **now** |

Eric's own framing ("This would be part of the 6-7 story reconnection UX") is treated as a hypothesis and is
**partly refuted**: A, B, C sit naturally in 6-7; D does not belong in a reconnection story at all.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Client connection path | **Available** | `client/src/net/connection.ts` (534 lines), read in full at the join/reconnect region |
| Arena room lifecycle | **Available** | `server/src/rooms/ArenaRoom.ts` — `onAuth`/`onCreate`/`onJoin`/`onDrop`/`onLeave` all read |
| Queue room + seat reservation | **Available** | `server/src/rooms/StandardQueueRoom.ts` |
| Production HTTP surface | **Available** | `server/src/app.config.ts`, `render.yaml` |
| Perception / frame gating | **Available** | `server/src/game/frames.ts`, `server/src/game/perception.ts` |
| Installed Colyseus internals | **Available** | `@colyseus/core` 0.17.44 `build/MatchMaker.mjs` + `build/Room.d.ts`; `@colyseus/sdk` 0.17.43 `build/Room.mjs`, `build/Client.d.ts` |
| Story 6.7 acceptance criteria | **Available** | `_bmad-output/planning-artifacts/epics.md:1197-1211` |
| Prior reconnect work (Story 0.2) | **Available** | Shipped. `server/src/__tests__/reconnect.test.ts` is the existing regression net |
| Deferred-work ledger | **Available** | Two entries already homed on 6-7 (see Findings 11) |
| Existing tracked work on match URLs / spectate links / replay | **MISSING — and that is a finding** | Nothing in `deferred-work.md`, `epics.md`, or any epic-context amendment file mentions a match-addressable URL, a shareable link, or a replay endpoint. This is a **new thread**, not a parked one |
| Runtime evidence (live prod behavior of `hullcracker.io/<anything>`) | **MISSING** | Deduced from `app.config.ts:66` + `render.yaml`, not observed. See Missing Evidence |
| Multi-process / driver configuration | **Available (negative)** | No driver or presence configured — Colyseus defaults apply. See Finding 10 |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Does production 404 on `/<id>` today? | High | **Done** | Finding 1 — Deduced with high confidence; one `curl` would make it Confirmed |
| 2 | Can a client address a live arena by id? | High | **Done** | Finding 2 — no: `joinById` refuses locked rooms |
| 3 | Is the reconnect door lock-gated / auth-gated? | High | **Done** | Finding 3 — neither. This is what makes C cheap |
| 4 | Is a reconnection token persisted anywhere? | High | **Done** | Finding 4 — no, in-memory only. This is what makes refresh fail today |
| 5 | Does the client know its arena roomId? | High | **Done** | Finding 5 — yes, two ways |
| 6 | What does a shipless observer see? | High | **Done** | Finding 7 — an empty ocean. Fails closed |
| 7 | Does a reconnect get a fresh welcome? | High | **Done** | Finding 6 — **no**, and this is the one new server piece C needs |
| 8 | Is there an id durable enough for replay? | Medium | **Done** | Finding 9 — `matchId` exists but is log-only and not addressable |
| 9 | Does anything already rule on multi-tab? | Medium | **Done** | Finding 8 — yes, Eric ruled on it 2026-08-17 |
| 10 | Cross-process addressability | Medium | **Done** | Finding 10 — single-process defaults; URLs die at redeploy |
| 11 | Vite dev-server parity for the new route | Low | **Open** | Vite's default `appType: 'spa'` should already serve `index.html` on unknown paths, so dev likely needs nothing. **Unverified** — cheap to check during implementation |
| 12 | Whether sessionLock races its own release across a refresh | Low | **Open** | Web Locks release on navigation, so expected clean; worth one manual test in 6-7 |

## Confirmed Findings

### Finding 1: `hullcracker.io/<game-id>` returns 404 today, and the code says why in a comment

**Evidence:** `server/src/app.config.ts:60-67`

```
// In production the game server IS the web server: Vite only exists in
// dev, so the built client must be served from here or the site 404s.
// express.static also serves index.html at '/'; no catch-all route, so
// Colyseus's own matchmaking endpoints are never shadowed.
app.use(express.static(resolve(__dirname, '../../client/dist')));
```

**Detail:** There is no SPA history fallback anywhere. `render.yaml` is a `type: web` Node service with **no rewrite
rules** — Express is the whole HTTP surface, so this is not a hosting-config problem and cannot be fixed at the Render
layer. The comment also names the hazard for whoever adds the route: a naive `app.get('*')` would shadow Colyseus's
matchmaking endpoints, and the same route table carries `/health`, `/metrics`, `/liveness`, and (dev only)
`/playground` + `/monitor`.

### Finding 2: A client cannot address a live arena by id — every arena is locked at birth, and `joinById` refuses locked rooms *before* auth

**Evidence:** `@colyseus/core` 0.17.44 `build/MatchMaker.mjs:151-159`

```js
async function joinById(roomId, clientOptions = {}, authContext) {
  const room = await driver.findOne({ roomId });
  if (!room) { throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, `room "${roomId}" not found`); }
  else if (room.locked) { throw new ServerError(ErrorCode.MATCHMAKE_INVALID_ROOM_ID, `room "${roomId}" is locked`); }
  const authData = await callOnAuth(room.name, clientOptions, authContext);
  return reserveSeatFor(room, clientOptions, authData);
}
```

and `server/src/rooms/ArenaRoom.ts:413` — `if (sanitized.expectedCaptains !== undefined) void this.lock();` inside
`onCreate`.

**Detail:** The lock check runs **before** `callOnAuth`, so `ArenaRoom.static onAuth` never even gets the chance to
decide. Every queue-created arena carries `expectedCaptains` and therefore locks inside `onCreate`, before its listing
is persisted to the driver — the property CLAUDE.md records as independently verified twice at the Story 6-5 review
gate. Solo arenas are `create()`d, which is likewise private and locked at birth.

**Consequence:** `client.joinById('<game-id>')` is not a viable spectate path. Not "discouraged" — structurally
refused, and refused by design, since that lock is the safety argument for letting `solo: true` ride on
client-supplied join options at all.

### Finding 3: The *reconnect* door checks neither the lock nor auth — this is what makes refresh-resume cheap

**Evidence:** `@colyseus/core` 0.17.44 `build/MatchMaker.mjs:127-149`

```js
async function reconnect(roomId, clientOptions = {}) {
  const room = await driver.findOne({ roomId });
  if (!room) { throw ... `room "${roomId}" has been disposed.` }
  const reconnectionToken = clientOptions.reconnectionToken;
  if (!reconnectionToken) { throw ... `'reconnectionToken' must be provided for reconnection.` }
  const sessionId = await remoteRoomCall(room.roomId, "checkReconnectionToken", [reconnectionToken]);
  if (sessionId) { return buildSeatReservation(room, sessionId); }
  else { throw ... `reconnection token invalid or expired.` }
}
```

Corroborated in-repo at `server/src/rooms/ArenaRoom.ts:164-165`: *"matchMaker.reconnect() never calls onAuth, so a
mid-match resume is not re-gated (the reconnection token is the auth)."*

**Detail:** No `room.locked` test and no `callOnAuth` on this path. **The token is the credential**, and it is checked
by `remoteRoomCall` against the room's own live reconnection table. So a locked, private, mid-match arena is reachable
by a holder of a valid token and by nobody else — precisely the security shape capability C wants, already in place.

The room side is shipped too: `ArenaRoom.onDrop` (`server/src/rooms/ArenaRoom.ts:894-940`) calls
`this.allowReconnection(client, CONFIG.net.reconnectGraceSeconds)`, and the grace window is **60 seconds**
(`shared/src/constants.ts:1476`). That is a generous budget for a page reload.

### Finding 4: No reconnection token is persisted, so a page refresh is currently a *new join* — the token dies with the tab's JS heap

**Evidence:** `client/src/net/connection.ts:436-437`

```ts
room.reconnection.enabled = true;
room.reconnection.maxRetries = RECONNECT_MAX_RETRIES;   // 18, connection.ts:170
```

and an exhaustive sweep of client persistence — `grep -rn "localStorage\|sessionStorage" client/src` returns **only**
callsign (`ui/home.ts:95-103`), class (`:116-135`), mode (`:168-177`), color preference
(`ui/classSelect.ts:152`), and the settings blob (`settings/store.ts`). No token, no roomId, no session id.

**Detail:** What ships today is the **SDK's same-`Room` auto-reconnect**: on an abnormal close the SDK retries the same
room with the token it holds *in the live `Room` object*, all `onMessage` bindings surviving. That covers a wifi blip
in a page that stays loaded. It cannot possibly cover a refresh, an accidental tab close, or a browser crash, because
the `Room` object and its token are gone.

**This is the exact gap Eric described** ("If I get disconnected I should be able to refresh that link to go back to
the game"), and it is a client-side persistence gap, not a protocol or server one.

### Finding 5: The client already holds the arena roomId, twice — and the reconnection token already embeds it

**Evidence:**
- `@colyseus/sdk` 0.17.43 `build/Room.mjs:243` — ``this.reconnectionToken = `${this.roomId}:${reconnectionToken}`;``
- `@colyseus/sdk` 0.17.43 `build/Client.d.ts:78` — `reconnect(reconnectionToken: string, roomName?: R): Promise<Room<…>>`
- `server/src/rooms/StandardQueueRoom.ts:352` — `pooled.client.send(MSG.seat, matchMaker.buildSeatReservation(arena, pooled.client.sessionId))`
- `client/src/net/connection.ts:402` — `return await client.consumeSeatReservation(reservation);`

**Detail:** After `consumeSeatReservation` the client holds a `Room` whose `roomId` is the arena's, and whose
`reconnectionToken` is **already** `"<roomId>:<secret>"` — `Client.reconnect(token)` splits on `:` and routes itself
(`Room.mjs:350`). So the token is self-addressing: it needs no companion roomId field, and a stored token can be
validated against the URL's id by simple prefix comparison before any network call.

**Consequence:** capability B needs no wire change and no server change at all. Nothing new has to be published for
the client to know what to put in the address bar.

### Finding 6: A reconnect never re-sends the welcome — and `onJoin` cannot simply be re-run, because it spawns a ship

**Evidence:** `server/src/rooms/ArenaRoom.ts:815` is the **only** `client.send(MSG.welcome, …)` in the file, and it sits
inside `onJoin`. `onJoin` also calls `this.world.addShip(client.sessionId, name, 'captain', classId, horn)`
(`ArenaRoom.ts:784`). `ArenaRoom.ts:837` records the core behavior: *"re-runs onJoin (core's reconnection branch calls
onReconnect only)"*, and `:884`: *"so no onReconnect hook and no welcome re-send are needed"*.

**Detail:** That last comment is **true of the in-page reconnect and false of a refresh reconnect**, and the distinction
is the crux of capability C. The in-page case needs no welcome because the page still holds the one it got: the map is
already built from `mapSeed`, the clock is seeded, `CONFIG` is in hand. A refreshed page holds none of that — it needs
`sessionId`, `mapSeed`, `mapRadius`, `playerCap`, `t`, `config`, `radarGrammar`, `radarIdentity`
(`shared/src/types.ts:1290-1299`) or it cannot render a single frame.

Re-running `onJoin` is not the fix and would be a serious bug: it would add a **second hull** for the same captain.
Core is deliberately protecting against exactly that by calling only `onReconnect`.

**The hook exists and `ArenaRoom` does not implement it:** `@colyseus/core` 0.17.44 `build/Room.d.ts:244` —
`onReconnect?(client: ExtractRoomClient<T>): void | Promise<any>;`. Sending the welcome there is the clean, small fix,
and it is the **only genuinely new server-side code** the A/B/C bundle needs.

There is even a precedent for "re-send on resume" one block away: `ArenaRoom.ts:922` —
`if (this.lastResults) newClient.send(MSG.results, this.lastResults);`, added as Story 0.2 finding F2 for exactly this
class of problem.

### Finding 7: A shipless observer sees an empty ocean — the perception layer fails closed

**Evidence:** `server/src/game/frames.ts:139-142`

```ts
function spectates(phase: MatchPhase, ship: ShipRecord | undefined): boolean {
  if (phase === 'finished') return true;
  return phase === 'active' && ship !== undefined && isSunk(ship.lifecycle);
}
```

**Detail:** The unfogged `observeSpectator` view (`server/src/game/perception.ts:430`) is reachable on exactly two
conditions: the match is `finished`, or the match is `active` **and the requesting client's own ship exists and is
sunk**. A hypothetical URL visitor with no `ShipRecord` matches neither, falls through to `observe(world, playerId)`
(`perception.ts:412`), and — having no ship, hence no sight bubble and no radar — receives essentially nothing.

**This is good news and bad news in one fact.** Good: there is no accidental omniscience leak waiting behind a new
join path; the fog machinery is keyed on the observer's own hull and degrades to silence, not to disclosure. Bad: it
means capability D cannot be delivered by "just letting them in" — a working spectator requires a **third observer
class** in `frames.ts`, which is a new disclosure category weighed against the master perception invariant that
currently has exactly **six** declared exceptions (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`).

### Finding 8: Eric has already ruled on the adjacent behavior — one match per browser, decided 2026-08-17

**Evidence:** `client/src/app/sessionLock.ts:1-12`, quoting the ruling verbatim:

> *"Honestly I just don't want people to be able to play from multiple tabs or windows on the same computer. I have been
> leaving that enabled for testing purposes, but with Solo vs AI and more playtesters, that is less relevant."*

**Detail:** The mechanism is a Web Locks exclusive lock (`navigator.locks.request`, `ifAvailable: true`) with a
localStorage-heartbeat fallback, taken at deploy and released at return-to-port, disconnect, failed connect, or tab
close. The file is emphatic that it is **"PLAYTESTER HYGIENE, NOT ANTI-CHEAT"**, entirely client-side, and **fails
open** by design.

**Why it matters here:** "open the link in a second tab to watch the match I am playing" is precisely the shape that
ruling closed, one day before this investigation. Because the lock is client-side and fails open it would not *stop*
a spectate tab — but the intent is on record, and a live-spectate feature has to be reconciled with it rather than
shipped past it. It also means the spectate tab and the play tab would contend for the lock, so 6-7 must not
accidentally make a spectator's arrival evict the player.

### Finding 9: There are two candidate ids, and only one of them is addressable

**Evidence:** `server/src/rooms/ArenaRoom.ts:227` (`private matchId = ''`) and `:525` (`this.matchId = generateId();`).
Every use is a log field — `:527`, `:1112` (`match.end`), `:1124` (`match.abort`). `matchId` appears nowhere in
`shared/src/types.ts`; `WelcomeMsg` (`types.ts:1290-1299`) does not carry it.

**Detail:**

| | `roomId` | `matchId` |
| - | -------- | --------- |
| Generated by | Colyseus, at room creation | `ArenaRoom.onCreate`, `generateId()` |
| Addressable by the matchmaker | **Yes** — `driver.findOne({roomId})` | No |
| On the wire | Implicitly, via `room.roomId` / the token prefix | **No** |
| Lifetime | The room's; dies at dispose and at every redeploy | The same today, but it is the natural *match* identity |
| Right key for a replay | No | **Yes** |

**Consequence — the one decision that is expensive to defer.** Capability A/B can ship on `roomId` in an afternoon.
But if the URL later has to serve a replay (capability E), the durable key is `matchId`, and routing on `matchId`
requires a `matchId → roomId` lookup, i.e. persistence, i.e. out of 6-7's scope. Either publish `matchId` and route on
it now (paying a small wire change and a lookup map for a benefit that only lands with accounts), or ship on `roomId`
and accept that live URLs and replay URLs will be two id spaces. **This is Eric's call and it should be made before
6-7 writes the URL**, because it is the only part of this whole investigation that is cheap now and awkward later.

### Finding 10: Single-process defaults — a match URL is valid only for the life of the server process

**Evidence:** `server/src/index.ts` is four lines (`listen(appConfig, port)`); `server/src/app.config.ts` configures
`routes`, `initializeGameServer`, `initializeExpress` and **no `driver` and no `presence`**. Colyseus therefore uses
its defaults (`LocalDriver` + `LocalPresence`).

**Detail:** Room ids live in process memory. Consequences worth stating in the 6-7 story so nobody is surprised:
- A Render redeploy or restart **invalidates every outstanding match URL**. Not a defect — the matches are gone too —
  but the failure copy must handle "this match no longer exists" as a completely ordinary case, not an error.
- `matchMaker.reconnect` uses `remoteRoomCall`, and `StandardQueueRoom.ts:309` already notes its seat handoff is
  *"process-agnostic by construction"* — so the design would survive a future move to a Redis driver without rework.
- `CONFIG.net.reconnectGraceSeconds` = 60s bounds the useful lifetime of a URL-for-resume anyway.

### Finding 11: Two ledger entries are already homed on Story 6-7, and refresh-resume makes both strictly worse

**Evidence:** `_bmad-output/implementation-artifacts/deferred-work.md:30-31` and `:518-519`.

**Detail:**
- **`:30` (from spec-0-2)** — a captain sunk *while away* resumes with the death moment skipped: no killer-follow
  spectate target, no sink feedback, no kill-feed line, because the `sunk` event arrived while they were gone.
- **`:518`** — *"THE 'EVERY CAPTAIN'S SINKING REACHES EVERY CLIENT' GUARANTEE IS VOID ACROSS A RECONNECT, AND AN
  OWN-SINKING DURING THE GRACE WINDOW NEVER REPLAYS ITS ELIMINATION MODAL."* Frames are per-tick sends with no
  catch-up buffer; only `MSG.results` is cached and re-sent. The entry names 6-7 as the natural home and suggests a
  roster-delta-derived catch-up, since `kills`/`deaths`/`alive` survive the gap in the schema.

**Why capability C amplifies both:** an in-page reconnect at least keeps local state — `client/src/score.ts`
`scoreAfterReconnect` exists for that case. A **refreshed** client has lost its score, its prediction ring, its
kill-feed history and its local match model as well as the events it missed. So the catch-up problem 6-7 already owns
gets larger the moment refresh-resume ships, and the two should be designed together rather than sequentially.

## Deduced Conclusions

### Deduction 1: The A + B + C bundle is small, and its cost is concentrated in three named places

**Based on:** Findings 1, 3, 4, 5, 6.

**Reasoning:** A needs one narrowly-scoped Express route (Finding 1). B needs no server change and no wire change at
all, because the client already holds `roomId` (Finding 5). C's server door is already open and already
token-authenticated with a 60s grace (Finding 3); what is missing is only (i) client-side token persistence
(Finding 4) and (ii) a welcome re-send via the unimplemented `onReconnect` hook (Finding 6).

**Conclusion:** three small pieces, each in a different file, with one new server hook. There is no protocol break: no
`PROTOCOL_VERSION` bump is implied by A, B, or C, since `WelcomeMsg` is re-sent unchanged rather than extended. Sizing:
**A = S, B = XS, C = M**, with C's real weight in edge cases (Finding 11) rather than in mechanism.

### Deduction 2: Capability D is a design ruling wearing an engineering costume

**Based on:** Findings 2, 7, 8, plus `ArenaRoom.ts:406`.

**Reasoning:** Four independent blockers stand in front of live spectate, and only the first two are engineering:

1. **The lock.** `joinById` refuses locked rooms before auth (Finding 2). Bypassing it means a custom route calling
   `matchMaker.reserveSeatFor` directly — mechanically possible, with a precedent in
   `StandardQueueRoom.ts:324-325` — but that route would be **a new unauthenticated public door onto a live match**,
   and the security argument that justifies `solo: true` ("the worst it buys a hostile client is its own room") does
   not transfer to it at all.
2. **Seat accounting.** `ArenaRoom.ts:406` records that *"_reserveSeat checks maxClients and never consults `locked`"*,
   and `maxClients = CONFIG.map.playerCap` (`:147`) = 20. A spectator seated this way consumes a **captain's** seat, so
   spectators would deny players entry unless seat accounting is widened above the cap.
3. **The fog.** A shipless observer sees nothing (Finding 7). Making spectate *work* means a third observer class in
   `frames.ts` — a new disclosure category against an invariant that currently has exactly six declared exceptions.
   And the naive version (grant `observeSpectator`) hands **omniscient vision to any URL visitor**, which a captain
   can trivially become in a second browser. That is a live cheat vector, not a theoretical one.
4. **The standing ruling.** Eric closed multi-tab play the day before this investigation (Finding 8).

**Conclusion:** blockers 1 and 2 are ordinary work. Blocker 3 cannot be resolved by an implementing agent at all — it
requires Eric to rule on *what a spectator is allowed to see*, and the plausible answers differ enormously in cost:

| Option | Cheat exposure | Cost |
| ------ | -------------- | ---- |
| Spectate only **after** the match ends | None — `spectates()` already returns true on `finished` | Lowest; closest to shipped behavior |
| Spectate live but **fogged to one chosen captain's view** | None — reuses `observe()` with a different observer id | Moderate; arguably the most watchable option |
| Spectate live **unfogged** | **Severe** — a second browser is a wallhack | Moderate mechanically, unacceptable without a ruling |
| Spectate live unfogged on a **broadcast delay** | Bounded by the delay | Highest — needs a frame ring buffer the server does not have |

**Recommendation: split D into its own story.** It is not reconnection UX, it has an unresolved design question at its
centre, and bundling it would put a 6-7 agent in the position of inventing a perception rule — which
`project-context.md` forbids outright (*"Never invent game mechanics, balance values, or design decisions without
consulting Eric"*).

### Deduction 3: Replay is cheaper than it looks, and the sim's determinism is why

**Based on:** Finding 9, Finding 10, and the architecture's determinism invariant.

**Reasoning:** `shared/` is a pure deterministic sim; the map rebuilds from `mapSeed` alone (islands never travel on the
wire); no `Math.random()` or `Date.now()` exists in sim code; and **player intent enters the sim through exactly one
validated chokepoint**, `game/inputs.ts`. So the complete entropy of a match is `mapSeed` + the seeded RNG streams +
the ordered input log. A replay is therefore an *input log*, not a frame recording — orders of magnitude cheaper, and
it re-derives the whole match by running the same `stepShip`/`stepShell`/zone functions the client already ships.

**Conclusion:** capability E is genuinely tractable later and should not be over-planned now. Two things are worth
recording so 6-7 does not foreclose it:

- **The id-space decision (Finding 9) is the only real coupling.** Decide it now.
- **The trap: a replay is only valid against the `PROTOCOL_VERSION` *and* `CONFIG` it was recorded under.** Determinism
  is a property of a *fixed* set of tunables; `PROTOCOL_VERSION` is at 40 after 40 cycles of exactly such changes. Any
  future recording must stamp its protocol version and refuse to replay across a mismatch, or it will desync
  silently — which is the worst possible failure mode for a feature whose entire promise is fidelity.

## Hypothesized Paths

### Hypothesis 1 (Eric's framing): all four capabilities belong in Story 6-7

**Status:** **Partly Refuted**

**Theory:** The URL, the redirect, refresh-resume and spectate are one feature and land together in the reconnection
UX story.

**Resolution:** A, B and C are confirmed to fit — they are reconnection mechanics and share the 6-7 acceptance criteria
almost line for line (`epics.md:1197-1211` already asks for the RECONNECTING banner, seamless resume, and a
never-dead-screen failed-reconnect route; A/B/C are the same feature reached from a URL). **D is refuted as a 6-7
member** by Findings 2, 7 and 8: it is not reconnection, its central question is a perception ruling only Eric can
make, and it collides with a ruling made 2026-08-17. Refutation attempted and failed — I looked for a cheap version of
D that avoids the fog question and could not construct one; the closest, "spectate only after the match ends," is
already what ships (`spectates()` returns true on `finished`) and does not answer Eric's actual ask, which is watching
a *live* game.

### Hypothesis 2: the 404 could be fixed at the Render layer instead of in code

**Status:** **Refuted**

**Theory:** A static-host rewrite rule (`/* → /index.html`) handles the routing with no code change.

**Resolution:** Refuted by `render.yaml` — the service is `type: web, runtime: node`, not a static site, so Render
rewrites do not apply; and by `app.config.ts:60-66`, where Express is deliberately the whole web surface. The route has
to be code. This is a *better* outcome than a rewrite rule: it means the pattern can be scoped tightly enough to keep
Colyseus's own endpoints unshadowed (the hazard the existing comment warns about).

### Hypothesis 3: refresh-resume needs a wire-contract change

**Status:** **Refuted**

**Theory:** Resuming from a fresh page load needs new fields on the wire, hence a `PROTOCOL_VERSION` bump.

**Resolution:** Refuted by Findings 5 and 6. The reconnection token is self-addressing (`"<roomId>:<secret>"`,
`Room.mjs:243`), so nothing new must be published for the client to store or route. And the welcome the refreshed page
needs is the **existing** `WelcomeMsg`, re-sent unchanged from a hook that does not yet run
(`Room.d.ts:244`) — a new send site, not a new message and not a new field. A/B/C are protocol-neutral.

### Hypothesis 4: sessionStorage is the right home for the token

**Status:** **Open** (recommended, not proven)

**Theory:** `sessionStorage` beats `localStorage` here: it survives a refresh (which is the whole point), is scoped
per-tab (so a second tab cannot pick up a token that is not its own), and is discarded when the tab closes (so a stale
token cannot resurrect a long-dead match).

**Would confirm:** a manual test — refresh mid-match resumes; opening a second tab does not inherit the session;
closing and reopening the browser does not attempt a resume.

**Would refute:** any requirement to resume after a genuine tab *close* (Eric said "refresh", so this looks out of
scope) — that would force `localStorage` plus an explicit expiry stamp, since `localStorage` has no natural lifetime and
the 60s grace would have to be enforced client-side.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| Live production response for `GET https://hullcracker.io/abc123` | Would promote Finding 1 from Deduced to Confirmed. Low risk of being wrong — the code has no fallback route at all | `curl -s -o /dev/null -w '%{http_code}' https://hullcracker.io/abc123` |
| Whether the Vite dev server already serves `index.html` on unknown paths | Determines whether A needs a dev-parity change or nothing. Vite's default `appType: 'spa'` suggests nothing is needed | One dev-server request to `/abc123` once `npm run dev` is up (Eric runs the dev server) |
| Whether a refresh races `sessionLock`'s own release | Could make a refreshed player briefly refuse itself. Web Locks release on navigation, so expected clean; it fails open regardless | Manual test during 6-7: refresh mid-match, confirm no lock warning |
| Actual wall-clock cost of a cold page load vs the 60s grace | Sets whether the grace window needs raising for refresh-resume. Almost certainly not — 60s is very generous | Measure reload-to-first-frame during 6-7; compare against `reconnectGraceSeconds` |
| Any accounts / match-history design | Determines whether the `matchId` decision (Finding 9) should be paid now or deferred | Eric — it is a product question, not discoverable in code |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Entry point (routing) | `server/src/app.config.ts:52-67` — `initializeExpress`; static-only, no fallback |
| Entry point (join) | `client/src/net/connection.ts:376-403` — `acquireArena`: solo `create` / dev `?direct=1` / queue → `consumeSeatReservation` |
| Entry point (resume) | `client/src/net/connection.ts:436-437` — SDK same-`Room` auto-reconnect, in-page only |
| Server resume | `server/src/rooms/ArenaRoom.ts:894-940` — `onDrop` → `dropPolicy` → `allowReconnection(60s)`; re-sends `MSG.results` only |
| The missing hook | `ArenaRoom` implements no `onReconnect`; core declares it at `@colyseus/core/build/Room.d.ts:244` |
| The welcome send | `server/src/rooms/ArenaRoom.ts:815`, inside `onJoin` — the sole send site |
| The lock | `server/src/rooms/ArenaRoom.ts:413` (`onCreate` → `this.lock()`); `maxClients` at `:147` |
| The doors | `@colyseus/core/build/MatchMaker.mjs` — `joinById` :151 (lock-gated), `reconnect` :127 (token-gated only), `create` :112 |
| Perception gate | `server/src/game/frames.ts:139-142` (`spectates`), `:159` (`observeSpectator`); `server/src/game/perception.ts:412`/`:430` |
| Id sources | `ArenaRoom.ts:525` (`matchId`, log-only); `@colyseus/sdk/build/Room.mjs:243` (token embeds `roomId`) |
| Multi-tab ruling | `client/src/app/sessionLock.ts:1-40` |
| Existing regression net | `server/src/__tests__/reconnect.test.ts` (drop-policy matrix, `allowReconnection` wiring); `client/src/__tests__/connection.test.ts` |
| Related config | `shared/src/constants.ts:1476` (`reconnectGraceSeconds: 60`); `client/src/net/connection.ts:170` (`RECONNECT_MAX_RETRIES = 18`) |
| Deploy surface | `render.yaml` — Node web service, no rewrites |

## Conclusion

**Confidence: High.** Every load-bearing claim is Confirmed against source or against installed Colyseus build output;
the single Deduced claim (production 404s on `/<id>`) rests on there being no fallback route in a file whose own comment
explains why, and one `curl` would close it.

**The answer to "how difficult":** three of the four capabilities are **easy, and easier than they look**, because the
hard part — a token-authenticated resume door that ignores both the room lock and `onAuth`, backed by a 60-second
server-side grace — **is already shipped** as Story 0.2. What is missing is unglamorous: a narrowly-scoped Express
route, one `history.replaceState`, a token in `sessionStorage`, and a welcome re-send from a lifecycle hook the room
does not yet implement. No wire change, no `PROTOCOL_VERSION` bump.

The fourth — **spectating someone else's live match — is blocked, and not by difficulty.** It is blocked by a room lock
that exists on purpose, by seat accounting that would have spectators eating captains' seats, by a standing multi-tab
ruling one day old, and above all by an unanswered design question: *what is a spectator allowed to see?* The naive
answer hands a wallhack to anyone with a second browser. That question is Eric's, and until it is answered there is
nothing for an implementing agent to build.

**Recommended split:**

- **Into Story 6-7 (Reconnection UX):** A (the route), B (the URL stamp), C (refresh-resume). These *are* reconnection
  UX; they extend 6-7's existing acceptance criteria rather than competing with them, and they should be designed
  alongside the two ledger entries already homed there (`deferred-work.md:30`, `:518`), which refresh-resume makes
  strictly worse.
- **Into its own story, gated on an Eric ruling:** D (live spectate). The ruling needed is the four-option table in
  Deduction 2.
- **Decide before 6-7 writes the URL:** which id it carries (Finding 9). Cheap now, awkward later.

## Recommended Next Steps

### Direction for the Story 6-7 agent

**A — serve the app at `/<game-id>` (S).** One route in `server/src/app.config.ts`, registered **after**
`express.static` so real assets always win, and matched by a **strict pattern**, never `'*'`. Colyseus room ids are
`generateId()` — 9 URL-safe characters — so a pattern like `/^\/[A-Za-z0-9_-]{9}$/` is tight enough that
`/matchmake/*`, `/health`, `/metrics`, `/liveness`, `/playground` and `/monitor` are structurally out of reach rather
than merely ordered behind it. `res.sendFile(index.html)`. The hazard is named in the existing comment at
`app.config.ts:63` — honour it, and add a test asserting those six paths still resolve. Check dev parity (backlog #11);
Vite's `appType: 'spa'` default probably already covers it.

**B — stamp the URL at match start (XS).** `history.replaceState(null, '', '/' + room.roomId)` when the match goes
live. `replaceState`, not `pushState` — a Back press should not walk out of a live match into a phantom history entry.
No server change, no wire change. Clear it at return to port (`client/src/app/returnToPort.ts` already reloads, so this
may be free).

**C — refresh-resume (M).** Three parts:
1. **Persist** `room.reconnectionToken` to `sessionStorage` on connect (Hypothesis 4). The token already embeds the
   roomId, so before any network call, compare its prefix against the URL's id — a mismatch means the stored session
   belongs to a different match and must be ignored, not attempted.
2. **On load,** if the URL carries a game id *and* a matching stored token exists, call `client.reconnect(token)`
   instead of entering the queue. Every failure — expired token, disposed room, redeployed server — is an **ordinary**
   outcome, not an error: fall back to home with a plain explanation. 6-7's own AC already demands this
   (*"a failed reconnect … routes to results or home with a plain explanation — never a dead screen"*), so the copy
   requirement is already ratified.
3. **Implement `onReconnect(client)` on `ArenaRoom`** and send `MSG.welcome` from it (Finding 6). Do **not** refactor
   `onJoin` to be reusable — it calls `world.addShip`, and re-running it would spawn a second hull for the same
   captain. Extract only the welcome payload construction. Extend `server/src/__tests__/reconnect.test.ts` with a
   resume-gets-a-welcome case, and add one asserting the ship count is unchanged across a resume — that is the
   regression that would hurt most and show up least.

**Design together, not sequentially:** `deferred-work.md:30` and `:518`. A refreshed client has lost not only the
events it missed but its whole local model (score, prediction ring, kill feed). The ledger's own suggestion — a
roster-delta-derived catch-up, since `kills`/`deaths`/`alive` survive in the schema — becomes more attractive once
refresh-resume exists, because the schema is the *only* state that reliably survives a reload.

### Decision needed from Eric (before implementation)

1. **Which id does the URL carry — `roomId` or a published `matchId`?** (Finding 9.) `roomId` ships immediately;
   `matchId` costs a small wire change and a lookup map now but is the key a replay would need later. Only worth
   paying if accounts/match-history is genuinely on the roadmap.
2. **What is a spectator allowed to see?** (Deduction 2's four-option table.) This gates capability D entirely.
3. **Is resuming after a tab *close* in scope, or only after a refresh?** (Hypothesis 4.) "Refresh" reads as
   `sessionStorage`; tab-close survival would force `localStorage` plus a client-side expiry stamp.

### Diagnostic (cheap confirmations, none blocking)

- `curl -s -o /dev/null -w '%{http_code}' https://hullcracker.io/abc123` → expect 404, promoting Finding 1 to Confirmed.
- Request `/abc123` against the running dev server → settles backlog #11.
- Time a cold reload to first frame → confirms 60s of grace is ample (expected comfortably).

## Reproduction Plan

Verification plan for the exploration claims, in ascending cost. All of A/B/C is testable without a second human.

1. **The 404 (Finding 1).** `curl` production or the built client at any 9-character path. Expect 404. *Confirms A is
   needed at all.*
2. **The locked door (Finding 2).** From a browser console against a live dev arena, `new Client(ws).joinById('<id>')`.
   Expect `MATCHMAKE_INVALID_ROOM_ID: room "<id>" is locked`. *Confirms the spectate blocker empirically rather than
   by reading core.*
3. **The reconnect door (Finding 3).** Mid-match, kill the socket via devtools; watch the SDK's in-page retry succeed
   and the server log `client.drop` then `client.resume` (`ArenaRoom.ts:910`, `:914`). *Confirms the 60s grace and the
   token-only gate are live.*
4. **The refresh gap (Findings 4 + 6).** Mid-match, capture `room.reconnectionToken` from the console, then refresh.
   Observe: the page returns to home (no persisted token), and a hand-run `client.reconnect(token)` from the console
   *succeeds at the transport level but renders nothing*, because no welcome arrives. **This is the single most
   valuable pre-implementation experiment in the whole report** — it demonstrates both halves of C's work in one
   sitting, and confirms Finding 6 is real rather than inferred.
5. **The shipless observer (Finding 7).** Server-side unit test: `buildFrame(world, 'no-such-id', 'active')`. Expect a
   frame with no `spec` flag and empty contacts. *Confirms the fog fails closed and quantifies what D must overcome.*
6. **Post-implementation acceptance for C.** Two clients in a dev arena; refresh one mid-match; it returns to its own
   hull with correct pose, HP, boons and map, inside the grace window; the other client observes no second hull and no
   roster change. Then repeat past 60s and confirm a clean, explained landing on home.

## Side Findings

- **`project-context.md` is stale and will mislead an agent that trusts it.** It states `PROTOCOL_VERSION` is
  *"currently 3"* (actually **40**), points at `server/src/game/weapons/` with a `WeaponSystem` interface (the
  directory is `equipment/` with an `Equipment` interface), and cites *"all 653 tests"* (CLAUDE.md says 4309). Last
  updated 2026-07-17, i.e. before Epics 3-6. CLAUDE.md is the current record. Not caused by this work and not fixed
  here — flagged because it is loaded as *persistent facts* by every `gds-*` skill, which is the worst possible place
  for stale numbers. **Confirmed** (`_bmad-output/project-context.md:44`, `:71`, `:76`).
- **Nothing anywhere tracks match URLs, shareable links, or replay.** `deferred-work.md`, `epics.md` and the six
  epic-context amendment files contain no entry for any of it. Eric's question opens a genuinely new thread, which is
  worth knowing before an agent goes looking for prior rulings that do not exist. **Confirmed** (negative search).
- **A URL-addressable match interacts with an already-ledgered, unruled exposure.** CLAUDE.md records (epic-6
  amendment 31) that an unauthenticated `POST /matchmake/create/arena` can already mint a full 20-hull simulating room
  with no websocket and no rate limit. Capability A adds no new matchmaking surface — it serves a static file — but
  any implementation of D that reaches for a custom `reserveSeatFor` route would widen exactly that exposure, and
  should be reviewed against that entry rather than in isolation. **Confirmed** in the ledger, **Hypothesized** as to
  severity.
- **`matchId` is generated and then almost unused.** Three log lines
  (`ArenaRoom.ts:527`, `:1112`, `:1124`) are its only consumers. If Finding 9 resolves toward `matchId`, it is nearly a
  greenfield field rather than a rename with call sites — cheaper than it looks. **Confirmed.**
- **The `?direct=1` dev escape is a useful model for A's testing story.** `connection.ts:332` reads a query param, is
  stripped from production by `import.meta.env.DEV`, and is independently gated server-side by `HC_DEV_OPTIONS`. That
  double-lock idiom (bundle-strip **plus** server refusal) is the established pattern if any part of A/B/C wants a
  dev-only shortcut. **Confirmed.**
