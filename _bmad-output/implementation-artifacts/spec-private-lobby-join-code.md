---
title: 'Private lobbies: create with a join code, join by code, host seed / bot-fill / force start, ready-up countdown'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_revision: '4dc617e6'
final_revision: '2a98a5b6'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-queue-based-lobbies.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Hullcracker has two doors — the Standard queue (strangers, fill-or-timer, no parties by FR34 / Story 6.1) and Solo vs AI. There is no way for a group of friends to play together on purpose. Eric (2026-10-02, verbatim): *"I need the ability to create a private lobby with a join code, and then join a lobby using a join code I have been given. As the host of the lobby, i should be able to enter an optional seed for the map, i should be able to select an option to bot-fill empty slots, and i should be able to force the game to start regardless of ready status. as a player in the lobby (including the host) i should be able to indicate that I am ready. When all players have indicated they are ready, a 10 second countdown will occur, and then the game will start. If any players de-select their ready status before that countdown finishes, the countdown stops."*

**Approach:** A third door. A new Colyseus `lobby` room (modeled on `StandardQueueRoom`) holds a roster with ready flags, a host, a seed text and a bot-fill toggle; it forms the arena the same way the queue does (`matchMaker.createRoom('arena', …)` + `reserveMultipleSeatsFor`). The home screen gains a third mode-row line with CREATE and JOIN. Private arenas are mode `'private'`.

### Eric's rulings (2026-10-02, this run — all via AskUserQuestion)

1. **Countdowns stack.** Lobby all-ready 10 s → captains board the arena (existing frozen boarding hold) → the arena's existing 10 s countdown → active. The arena is reused unchanged in this respect.
2. **Force start needs 2 humans unless bot-fill is on.** START NOW is disabled with 1 human and bot-fill off (reason copy below). With bot-fill on, the host may start alone. The same eligibility gates the automatic all-ready countdown: it only arms when a start would be legal.
3. **Seed is free text, hashed, validated on entry, with a deterministic retry suffix.** The host types anything. The server hashes it to a uint32 and test-generates the map. If generation throws (the deferred map-gen bug, ~1 in 3000 seeds — the throw itself stays UNFIXED, Eric 2026-09-16), the server silently tries the text with `0` appended, then `1`, `2`, … until one generates. Same failing text → same final seed. **A blank seed means no seed: the arena rolls its usual random map.**
4. **Fixed 20 slots; bot-fill fills to 20** with combat bots (like Solo vs AI), added before `activate()`.
5. **Join code: 6 characters, A–Z only, case-insensitive.** Our own id, never the Colyseus roomId (E6 A46).
6. **Host leaves → host passes to the longest-present player.** If nobody is left the lobby closes.
7. **Door: two buttons on a third mode-row line, CREATE and JOIN.** CREATE opens the lobby with the code displayed. JOIN opens a modal asking for the code; it fails with a reason for an invalid code or a full lobby.
8. **Private play counts toward PLAYERS ONLINE / LIVE GAMES, and lobby creation shares the per-IP create throttle** (`soloThrottle.ts`, 6 per 60 s).
9. **Copy (Eric accepted with two edits):** heading `LOBBY` (not "PRIVATE LOBBY"); code line `CODE K7XQ2M` (click copies); roster `N/20 ABOARD` with each captain's callsign and a READY mark; buttons `READY` / `UNREADY`; host-only controls: seed field with placeholder `SEED (OPTIONAL)`, toggle `BOT-FILL`, `START NOW` (disabled with the reason `2 CAPTAINS OR BOT-FILL REQUIRED`); `LEAVE` for everyone; countdown line `STARTS IN 0:0s`; join modal `ENTER CODE` / `JOIN`, failures `NO SUCH LOBBY`, `LOBBY FULL`, `MATCH STARTED`; host hand-off notice `YOU ARE HOST`. **Every player sees the seed text even when they cannot edit it.**
10. **Late join during the countdown is allowed and stops the countdown** (the newcomer is not ready).
11. **After the match everyone goes to the home screen; the code dies when the match starts.** Joining with a dead code answers `MATCH STARTED` while the lobby lingers, `NO SUCH LOBBY` after it is gone.
12. **(Review gate, same day) Seed is checked ONCE, when the match forms** — "Yes, check at start". The per-entry probe was a full synchronous map generation that one host could repeat every second against the shared event loop. Players see no difference: the typed text shows at once, the suffix retry and the map are identical.
13. **(Review gate, same day) A no-show in a bot-filled lobby is acceptable** — "Acceptable, leave it". If a reserved captain never boards, the match starts after the boarding grace with 20 − 1 hulls; no bot top-up.

## Boundaries & Constraints

**Always:**
- `shared/` stays pure and deterministic; seed hashing has no transcendentals and no `Math.random`.
- The lobby's countdown is server-authoritative (`countdownEndT` in the lobby schema); the client only renders it.
- Every new front door re-runs the `PROTOCOL_VERSION` gate and the staging-cookie gate in its own `onAuth` (E6 A5, D8) — seat reservations bypass the arena's `onAuth`.
- Queue/lobby code talks to the arena ONLY through `matchMaker.createRoom` / `reserveMultipleSeatsFor` (D8: no same-process room handles).
- A host seed reaches the arena through a server-private trust ticket; `sanitizeRoomOptions` keeps stripping `mapSeed` from every untrusted (client-originated) option bag — the existing "production clients can never pin a map" tests stay green.
- Bots exist before `activate()`; 1 human + 0 bots + 0 other humans is never allowed to become a match.
- Non-host control messages (seed, bot-fill, start) are silently dropped, like malformed inputs.
- `PROTOCOL_VERSION` 70 → 71 (the client reads the new `CONFIG.lobby` block and the arena carries a new mode).
- DESIGN.md tokens for every new DOM: Geist / Geist Mono uppercase `tabular-nums`, void/panel/hairline colors, amber for the one primary action, phosphor secondaries, radius md 8 px on buttons/inputs, lg 12 px on the modal, no filled slabs, modals never stack (z 1150 like the queue modal; the lobby modal REPLACES the queue modal position in the stack, it does not sit on top of it).
- Lint complexity ≤ 10; new code in new files (every file this touches except `queue.ts` and `ArenaState.ts` is already over the 500 LOC soft cap).

**Block If:**
- Any mechanic not covered by rulings 1–11 is needed to proceed (kick, lobby chat, team assignment, per-lobby size, spectators) — HALT, do not invent.
- Any new player-facing text beyond ruling 9 would be needed — HALT; copy is Eric's (E6 A41).

**Never:**
- Never add a seventh perception exception, never add per-ship spatial fields to any schema, never let the lobby import `world.js` / `match.js`.
- Never fix the map-gen throw itself (deferred, Eric 2026-09-16); the retry suffix routes around it.
- Never make Standard or Solo behave differently; never change the queue's anti-hostage deadline rule.
- Never ship a match URL / link form of the code (E6 A46 withdrew match URLs; the code is typed).
- Never add How-to-Play, README or in-game explanatory sentences (no in-game copy unasked) — flag the How-to-Play gap in the run report instead.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | Home CREATE click, valid callsign/class/gun | `client.create('lobby', joinOptions)`; server mints a 6-letter A–Z code unique among live lobbies, creator is host; lobby modal shows `LOBBY`, `CODE XXXXXX`, `1/20 ABOARD`, host controls | PV mismatch → same stale-bundle refusal copy as the queue door; throttle → the existing throttle refusal path |
| Join ok | JOIN modal, code `k7xq2m` (any case) | `GET /lobby/resolve?code=K7XQ2M` → `{roomId}`; `joinById`; roster gains the captain, not ready | — |
| Join: unknown | code with no live lobby | 404 `{reason:'NO SUCH LOBBY'}`; modal shows `NO SUCH LOBBY`, field stays | — |
| Join: full | 20 aboard | `{reason:'LOBBY FULL'}`; if a race makes `joinById` fail on `maxClients`, the client maps it to `LOBBY FULL` too | — |
| Join: started | lobby formed ≤ 60 s ago (lingering) | `{reason:'MATCH STARTED'}` | after linger: `NO SUCH LOBBY` |
| Join: malformed | not exactly 6 letters after uppercasing | client refuses locally with `NO SUCH LOBBY`; server resolve also answers `NO SUCH LOBBY` (never 500) | — |
| Ready toggle | `MSG.lobbyReady {ready:true/false}` | schema `ready` flips; roster READY mark updates for all | non-boolean dropped |
| All ready, eligible | every aboard captain ready AND (humans ≥ 2 OR botFill) | `countdownEndT = now + CONFIG.lobby.countdownMs (10000)`; everyone sees `STARTS IN 0:0s` ticking | — |
| All ready, not eligible | 1 human, botFill off, ready | no countdown; START NOW disabled with `2 CAPTAINS OR BOT-FILL REQUIRED` | — |
| Un-ready during countdown | any captain sends ready:false | `countdownEndT = 0`; countdown line disappears | — |
| Late join during countdown | new captain joins | countdown cancelled (ruling 10) | — |
| Leave during countdown | a captain leaves; remaining all ready & eligible | countdown RESTARTS from 10 s (a fresh all-ready moment); if no longer eligible it stops | — |
| Countdown elapses | server tick sees now ≥ countdownEndT | lobby forms the arena: `createRoom('arena', {expectedCaptains:n, lobbyTicket, mapSeed?, botFill, mode:'private'})`, reserves n seats, sends `MSG.seat` to each, sets metadata `phase:'started'`, lingers 60 s, disposes | arena create throws → `failSeats` path as the queue: everyone gets the existing QUEUE CLOSED-style error and lands home |
| Force start | host sends `MSG.lobbyStart` while eligible | forms immediately (no lobby countdown; the arena's own hold + 10 s still run) | not host / not eligible → dropped |
| Seed set | host sends `MSG.lobbySeed {text}` (≤ 32 chars after trim) | server resolves `{text, seed}` via hash + probe + suffix retry; schema `seedText` = the text the host typed, `seedResolved` = the final text that generated (e.g. `bananas0`); every captain sees the seed text | > 32 chars truncated; control chars stripped; non-host dropped; blank → `seedText=''`, no seed |
| Seed that throws | text whose hash hits a `MapGenerationError` | tries `text+'0'`, `text+'1'` … until one generates; deterministic | never surfaces an error |
| Bot-fill toggle | host sends `MSG.lobbyBotFill {on}` | schema `botFill` flips; eligibility re-evaluated; a running countdown is cancelled if it becomes ineligible | non-host dropped |
| Host leaves | host disconnects | host = the remaining captain with the lowest join sequence; that client's modal shows `YOU ARE HOST` and the host controls; last captain leaves → room disposes | — |
| Arena side: private | `mode:'private'`, `expectedCaptains:n`, `botFill` | `lock()` at birth as every boarding room; if `botFill`, `buildBotFleet(playerCap - n)` BEFORE activate; `minHumans` = 1 if botFill else 2; listing metadata `{mode:'private', humans}`; liveness counts it | cohort collapse in a private arena without bots (drops below 2 humans during the hold) → existing `MSG.requeue` path, but the client does NOT auto-requeue: it returns home |
| Liveness | lobby rooms exist | PLAYERS ONLINE includes lobby clients; LIVE GAMES counts private arenas like standard ones | — |

</intent-contract>

## Code Map

- `shared/src/types.ts` -- `MSG` channel ids, `MatchPhase`; ADD lobby message shapes + `MSG.lobbyReady 'lr'`, `lobbySeed 'ls'`, `lobbyBotFill 'lb'`, `lobbyStart 'lg'`; `LobbyResolveResponse`; arena `mode` union gains `'private'`.
- `shared/src/constants.ts` -- `CONFIG.match` (countdown 10000, minHumans 2); ADD `CONFIG.lobby { codeLength: 6, countdownMs: 10000, seedTextMax: 32, startedLingerMs: 60000 }`.
- `shared/src/sim/seedText.ts` (NEW) -- `hashSeedText(text): number` (FNV-1a 32-bit over UTF-16 code units, `>>> 0`); `resolveSeedText(text, probe): { text, seed }` — probe is injected `(seed) => boolean`; candidates `text, text+'0', text+'1', …`; blank → `null`.
- `shared/src/sim/map.ts:568` -- `MapGenerationError`; `generateMap(seed, radius)` is the real probe the server injects.
- `shared/src/index.ts:791` -- `PROTOCOL_VERSION` 70 → 71; barrel-export seedText.
- `server/src/rooms/queue.ts` -- pure queue policy; the model for `rooms/lobby.ts`.
- `server/src/rooms/lobby.ts` (NEW, pure) -- `LobbyPolicy`: roster `{id, name, ready, joinSeq}`, `hostId`, `botFill`, `countdownEndT`; `startEligible()`, `allReady()`, `evaluate(now)` → `'idle' | 'counting' | 'form'`, `onJoin/onLeave/onReady/onBotFill`, `nextHost()`; `mintCode(rng, taken: Set<string>)` (A–Z, 6).
- `server/src/rooms/StandardQueueRoom.ts:350-420` -- `formMatch` / `buildSeatReservation` / `failSeats`; EXTRACT the createRoom + reserve + seat/fail routine into `server/src/rooms/formArena.ts` (NEW) used by both rooms.
- `server/src/rooms/LobbyRoom.ts` (NEW) -- Colyseus adapter: `onAuth` (PV gate + staging gate + create throttle for the creator), `onCreate` (mint code, `setMetadata({code, phase:'open'})`, 1 Hz evaluate), `onJoin/onLeave`, message handlers, `form()` via `formArena`, started-linger then `disconnect()`.
- `server/src/rooms/schema/LobbyState.ts` (NEW) -- `LobbyPlayer {id, name, ready}`; `LobbyState {code, hostId, seedText, seedResolved, botFill, countdownEndT, phase}`.
- `server/src/rooms/lobbyTicket.ts` (NEW) -- per-process random ticket string; `isTrustedTicket(x)`.
- `server/src/rooms/roomOptions.ts:238-322` -- `RoomOptions` gains `botFill?`, `mode?`, `lobbyTicket?`; `sanitizeRoomOptions(options, devEnabled)` admits `mapSeed`/`botFill`/`mode:'private'` when the ticket is trusted, else strips them (and still reports `rejectedKeys`).
- `server/src/rooms/soloThrottle.ts` -- reuse the bucket for lobby creation.
- `server/src/rooms/ArenaRoom.ts:406-605, 725-760, 830` -- `onCreate` seed choice, `finishCreate` (mode tag, bots), `timings()`/`minHumansFor`, `buildBotFleet` gains a count parameter.
- `server/src/app.config.ts:57-73` -- `define('lobby', LobbyRoom)`; the `/lobby/resolve` route on the SAME router object as `/metrics` + `/liveness` (colyseus018.test pins one router).
- `server/src/liveness.ts:54-55, 87` -- room names + known modes; add `'lobby'` to PLAYERS ONLINE and `'private'` as a counted arena mode.
- `server/src/game/match.ts:485, 692` -- `notifyRosterChanged`, `startCountdown`; unchanged behavior, verify minHumans plumbing for private.
- `client/src/net/connection.ts:270, 345, 415, 573` -- `joinOptions()`, `waitForSeat`, `acquireArena`, `connect`; ADD `client/src/net/lobby.ts` (NEW): `createLobby(opts, hooks)`, `joinLobby(code, opts, hooks)` (resolve → `joinById`), `LobbyHooks { onLobby(state), onSeat, onError(reason) }`, reusing `consumeSeatReservation` and the seat wait.
- `client/src/ui/queueModal.ts` -- z-index/backdrop pattern and its pinned-text test; model for `client/src/ui/lobbyModal.ts` (NEW: roster, READY/UNREADY, host controls, STARTS IN, LEAVE, YOU ARE HOST) and `client/src/ui/joinCodeModal.ts` (NEW: ENTER CODE field, JOIN, failure line).
- `client/src/ui/home.ts:222-250, 683-700, 878` -- `DeployMode` (+ `'private'` is NOT a persisted mode: CREATE/JOIN never write `hullcracker.mode`), `makeDeployStack` gains the third line built by `client/src/ui/privateRow.ts` (NEW: CREATE + JOIN buttons, disabled while a join is in flight like the other doors).
- `client/src/main.ts:5374-5420, 2219` -- `startGame`, connect hooks, `makeRequeue`; wire the two new doors; private arenas never auto-requeue on `rq`.
- `client/src/net/liveness.ts` -- no change expected; verify the payload shape still parses.
- Tests to extend/model: `server/src/__tests__/queue.test.ts`, `roomOptions.test.ts`, `solo.test.ts`, `soloThrottle.test.ts`, `liveness.test.ts`, `colyseus018.test.ts`; `client/src/__tests__/queueModal.test.ts`, `home.test.ts`, `connection.test.ts`, `requeue.test.ts`; smoke model `server/scripts/queueSmoke.mjs` (port 2603).

## Tasks & Acceptance

**Execution (wave 1 — shared contract, Opus):**
- [x] `shared/src/types.ts` -- add `MSG.lobbyReady/lobbySeed/lobbyBotFill/lobbyStart`, `LobbyReadyMsg {ready:boolean}`, `LobbySeedMsg {text:string}`, `LobbyBotFillMsg {on:boolean}`, `LobbyResolveResponse = {roomId:string} | {reason:'NO SUCH LOBBY'|'LOBBY FULL'|'MATCH STARTED'}`, `LobbyPhase = 'open'|'started'`, arena mode union + `'private'` -- the wire contract both sides compile against.
- [x] `shared/src/constants.ts` -- add `CONFIG.lobby` block (values above) with comments naming the 2026-10-02 rulings -- single source of truth.
- [x] `shared/src/sim/seedText.ts` + `shared/src/__tests__/seedText.test.ts` -- hash + resolve with injected probe; tests: determinism, blank → null, suffix order `''`,`0`,`1`,`2`, same failing text → same result, hash is uint32 for unicode input.
- [x] `shared/src/index.ts` -- export seedText, `PROTOCOL_VERSION = 71` with the comment convention used by the previous bumps.

**Execution (wave 2a — server, Opus; shared frozen):**
- [x] `server/src/rooms/lobby.ts` + `server/src/__tests__/lobby.test.ts` -- pure policy per the I/O matrix (eligibility, all-ready arm, un-ready cancel, late-join cancel, leave re-arm, host succession by joinSeq, `mintCode` uniqueness/alphabet).
- [x] `server/src/rooms/lobbyTicket.ts` -- per-process ticket.
- [x] `server/src/rooms/roomOptions.ts` + `roomOptions.test.ts` -- trusted-ticket admission of `mapSeed`/`botFill`/`mode:'private'`; untrusted bags still strip (existing pins green; add: a client bag carrying a guessed ticket of the wrong value is stripped).
- [x] `server/src/rooms/formArena.ts` -- extracted from `StandardQueueRoom.formMatch`; `StandardQueueRoom` calls it; `queue.test.ts` and `queueSmoke.mjs` stay green.
- [x] `server/src/rooms/schema/LobbyState.ts` -- schema.
- [x] `server/src/rooms/LobbyRoom.ts` -- adapter; seed resolution injects `generateMap(seed, CONFIG.map.baseRadius)` as the probe (catch only `MapGenerationError`); started-linger via `this.clock.setTimeout`, `autoDispose` handling so the lingering room disposes on its own.
- [x] `server/src/rooms/ArenaRoom.ts` -- private mode: `buildBotFleet(count)`, `minHumansFor` (private: botFill ? 1 : CONFIG default), metadata mode `'private'`, seed from trusted options; `solo.test.ts`-style test for "private + botFill adds exactly playerCap − expectedCaptains bots before activate" and "private without botFill adds none".
- [x] `server/src/app.config.ts` -- `define('lobby', LobbyRoom)`; `GET /lobby/resolve?code=` via `matchMaker.query({name:'lobby'})` filtered on `metadata.code`; answers per the matrix; add to `colyseus018.test.ts` router pin.
- [x] `server/src/liveness.ts` + `liveness.test.ts` -- count lobby clients and private arenas.
- [x] `server/scripts/lobbySmoke.mjs` (port 2613, self-booting, `HC_DEV_OPTIONS` not required) -- host creates, reads code from state, second client resolves + joins, both ready, countdown arms, un-ready cancels, re-ready, countdown fires, both receive seats, both land in an arena with `mode:'private'`; a second run with botFill and START NOW from a lone host lands in an arena with 19 bots. Wire into `package.json` smoke scripts the way `queueSmoke` is.

**Execution (wave 2b — client, Opus; shared frozen; parallel with 2a, touches only `client/`):**
- [x] `client/src/net/lobby.ts` -- create/join/resolve/bindings; `rq` in a private arena → home, no auto-requeue (mode flag carried from the lobby path).
- [x] `client/src/ui/privateRow.ts` + `home.ts` -- third mode-row line CREATE / JOIN; disabled with the other doors while a deploy is in flight; never persists a mode.
- [x] `client/src/ui/joinCodeModal.ts` -- ENTER CODE (uppercases as typed, 6 max), JOIN, failure line; ESC closes.
- [x] `client/src/ui/lobbyModal.ts` -- everything in ruling 9; host controls rendered only for `hostId === sessionId`; seed shown read-only to non-hosts; READY/UNREADY toggles; STARTS IN only while `countdownEndT > now`; LEAVE leaves the room and returns home; ESC = LEAVE.
- [x] `client/src/main.ts` -- wire doors and the seat → arena hand-off through the existing `consumeSeatReservation` flow.
- [x] `client/src/__tests__/lobbyModal.test.ts`, `joinCodeModal.test.ts`, `privateRow.test.ts`, extend `home.test.ts` -- pinned copy of ruling 9, host/non-host control visibility, countdown line presence rule, failure reasons.

**Execution (wave 3 — docs/trackers, Sonnet):**
- [x] `VERSION`, `package.json` -- 0.18.32; `CHANGELOG.md` -- `[0.18.32] - 2026-10-02` Added entry (player-facing) + Internal (PV 70 → 71, new rooms/routes, test counts).
- [x] `_bmad-output/implementation-artifacts/epic-8-context-amendments.md` -- append amendments 235+ recording rulings 1–11 verbatim with the build facts; `_bmad-output/gds-workflow-status.yaml` + `sprint-status.yaml` -- one-line cycle 167 stamps in the existing format.

**Acceptance Criteria:**
- Given a client on the home screen, when it clicks CREATE, then a lobby modal shows `LOBBY`, a 6-letter A–Z code, `1/20 ABOARD`, and the host controls.
- Given a live lobby with code X, when a second client enters `x` in lowercase in the JOIN modal, then it joins and both rosters show 2/20 ABOARD.
- Given a code with no lobby / a full lobby / a formed lobby within 60 s, when JOIN is pressed, then the modal shows `NO SUCH LOBBY` / `LOBBY FULL` / `MATCH STARTED` respectively.
- Given 2 captains both ready, when the last READY arrives, then `countdownEndT` is set 10 s out and both see `STARTS IN`; when one sends UNREADY at 4 s, then the countdown is cleared on both.
- Given a lone host with bot-fill off, when they press READY, then no countdown arms and START NOW is disabled with `2 CAPTAINS OR BOT-FILL REQUIRED`; when they turn BOT-FILL on, then START NOW enables and pressing it lands them in a private arena with 19 bots before activation.
- Given a host who typed a seed whose hash throws in `generateMap`, when the seed is set, then the resolved seed is the first of `text0`, `text1`, … that generates, every captain sees the typed text, and the arena the lobby forms uses that resolved seed (`ArenaState.mapSeed` equals the hash of the resolved text).
- Given a blank seed, when the lobby forms, then the arena's `mapSeed` is random (not derived from any text).
- Given the host leaves with others aboard, when the room updates, then `hostId` is the captain with the lowest join sequence and their modal shows `YOU ARE HOST` and the host controls.
- Given a client-originated arena option bag containing `mapSeed` or `botFill` without the server ticket, when sanitized in production, then both are stripped (existing pins green).
- Given a lobby and a private arena exist, when `/liveness` is read, then PLAYERS ONLINE includes the lobby's clients and LIVE GAMES includes the private arena.
- `npm run check` green; `node server/scripts/lobbySmoke.mjs` passes; `queueSmoke.mjs` and `soloSmoke.mjs` still pass.

## Spec Change Log

## Review Triage Log

### 2026-10-02 — Review pass (Blind Hunter + Edge Case Hunter on Opus 5.5 at Eric's instruction — low weekly Fable credits — and Codex `gpt-5.6-sol`; all three FIX-FIRST; the trust ticket held under all three)
- intent_gap: 0
- bad_spec: 0
- patch: 13: (high 2, medium 5, low 6)
- defer: 3: (medium 1, low 2)
- reject: 3: (low 3)
- addressed_findings:
  - `[high]` `[patch]` Seed probe per entry stalled the shared event loop (all three reviewers) → probed once at form time, any throw falls back to a random map, tick never leaks an exception (Eric ruling 12).
  - `[high]` `[patch]` Private flag lost on refresh → cohort collapse auto-queued into Standard (all three) → `hullcracker.resumePrivate` beside the resume token, restored in `tryResumeMatch`.
  - `[medium]` `[patch]` Late joiner whose seat was reserved just before the form sat unseated in a dead lobby (BH + ECH) → `onJoin` after `started` answers `MATCH STARTED` + leave; a failed form disconnects stragglers.
  - `[medium]` `[patch]` Session lock never released on a private collapse (BH) → released when landing home without auto-queue.
  - `[medium]` `[patch]` Colyseus "is locked" read as LOBBY FULL (all three) → locked → MATCH STARTED, "already full" → LOBBY FULL, gone → NO SUCH LOBBY.
  - `[medium]` `[patch]` READY / BOT-FILL double-click resent the stale value (ECH) → local intent until the server view matches.
  - `[medium]` `[patch]` ESC during an in-flight join still opened the lobby (BH) → cancel token; the arriving lobby is left at once.
  - `[low]` `[patch]` Code-mint race between the live-codes query and the listing (Codex + ECH) → in-process reservation, released on dispose.
  - `[low]` `[patch]` A throw inside the form after `phase='started'` wedged a listed, unlocked lobby (ECH) → covered by the form-time try/catch.
  - `[low]` `[patch]` Seed typed during the countdown without Enter/blur was lost (ECH) → debounce-sent at 400 ms (`LOBBY_SEED_DEBOUNCE_MS`).
  - `[low]` `[patch]` Blank callsign read CAPTAIN-n in the lobby and a different draw in the arena (ECH) → resolved at the lobby door, carried on the seat.
  - `[low]` `[patch]` Pasted "CODE ABCDEF" normalized to CODEAB (ECH) → the last 6 letters win.
  - `[low]` `[patch]` Tab could reach the home doors under the join modal (BH) → doors busy while a modal is up.
  - deferred: leave during the async arena form strands a 2-cohort below minHumans (Codex; pre-existing boarding semantics shared with Standard: "a grace expiry below minHumans arms nothing"); `/lobby/resolve` has no rate limit (BH); a joiner racing a lobby that just hit 20 reads MATCH STARTED because Colyseus auto-locks at maxClients (client patch agent).
  - rejected: dev-mode client `mapSeed` admission (Codex; by design, `HC_DEV_OPTIONS` only); countdown readout lag on a throttled tab (ECH; cosmetic, the server owns the truth); a no-show in a bot-filled lobby leaving 19 hulls (ECH; Eric ruling 13 accepts it).

## Design Notes

- **Why an HTTP resolve + `joinById` rather than Colyseus `filterBy`.** `filterBy` matches a joiner's options against the options the room was CREATED with; the code is minted server-side after creation, so it is not in those options. A resolve route also answers `LOBBY FULL` / `MATCH STARTED` cleanly before any socket work.
- **Why a trust ticket.** `mapSeed` is dev-gated because `client.create('arena', {solo:true})` lets client options reach `onCreate`. A per-process random ticket, known only to server modules, lets the lobby's server-side `createRoom` pass `mapSeed`/`botFill` while every client bag is still stripped. Do not use an env secret; a process-local random string is sufficient and needs no deploy change.
- **Seed resolve example.** `resolveSeedText('bananas', probe)`: probe(hash('bananas')) false → probe(hash('bananas0')) true → `{text:'bananas0', seed:hash('bananas0')}`. The schema shows `seedText:'bananas'` to players and `seedResolved:'bananas0'` is informational.
- **Countdown restart on leave.** A leave can make the remaining set all-ready; treat it as a fresh all-ready moment (restart from 10 s) rather than continuing a count the departed captain was part of.
- **Keep the lobby room ignorant of the sim** — it never imports `world.js`/`match.js`; its whole picture of the arena is the `createRoom` option bag.

## Auto Run Result

**Summary.** Private lobbies landed as a third door: a `lobby` Colyseus room (pure policy in `rooms/lobby.ts`) with a 6-letter A–Z join code resolved over `GET /lobby/resolve`, READY/UNREADY with a server-authoritative 10 s all-ready countdown that any un-ready or late join cancels, host controls (free-text seed hashed FNV-1a and probed once at form time with the deterministic `0/1/2…` suffix retry; BOT-FILL to 20; START NOW gated on 2 captains or bot-fill), host succession to the longest-present captain, and a `private` arena formed through the extracted `formArena` with a per-process trust ticket that is the only way `mapSeed` / `botFill` / `mode` reach the arena. Client: CREATE / JOIN on the home's third line, join-code modal, lobby modal in Eric's words, private collapse goes home.

**Files.** shared: `types.ts` (MSG lr/ls/lb/lg + lobby types), `constants.ts` (`CONFIG.lobby`), `sim/seedText.ts` (+test), `index.ts` (PV 71). server: `rooms/lobby.ts`, `LobbyRoom.ts`, `schema/LobbyState.ts`, `lobbyTicket.ts`, `formArena.ts`, `createThrottle.ts`, `roomOptions.ts` (trusted admission), `ArenaRoom.ts` (private mode, `buildBotFleet(count)`, minHumans), `app.config.ts` + `lobbyResolve.ts` (route), `liveness.ts`; tests `lobby.test.ts`, `roomOptions`, `solo`, `liveness`, `colyseus018`, `denials`, `stagingGate`; `scripts/lobbySmoke.mjs`. client: `net/lobby.ts`, `app/privateLobby.ts`, `ui/privateRow.ts`, `ui/joinCodeModal.ts`, `ui/lobbyModal.ts`, `ui/portModal.ts`, `net/connection.ts` (`arenaFromSeat`), `net/resumeToken.ts` (`hullcracker.resumePrivate`), `app/requeue.ts`, `ui/home.ts`, `main.ts`, `config.ts`; tests for each. docs: `VERSION` / `package.json` 0.18.32, `CHANGELOG.md`, epic-8 amendments 235–239, `epic-8-context.md` pointers, `deferred-work.md` (3 entries), both trackers.

**Review.** 13 patches applied, 3 deferred, 3 rejected (see the triage log). The trust ticket held under all three reviewers.

**Follow-up review recommended:** true — the gate produced thirteen patches across both sides, two of them high (seed-probe timing, private flag on refresh), touching lifecycle and session-lock behavior; an independent pass on staging QA is worth it.

**Verification.** `npm run check` green after the patches: shared 1034, server 2486, client 3906, lint 0 errors (2 pre-existing warnings), hook test green. `lobbySmoke.mjs` PASS (A1 create/resolve/join by code, A2 ready/unready/countdown → seats, A3 MATCH STARTED + one private arena with 2 rows, B lone host + BOT-FILL + seed 'bananas' + START NOW → 20 rows, `mapSeed` = `hashSeedText('bananas')`), `queueSmoke.mjs` and `soloSmoke.mjs` still PASS.

**Residual risks.** Not exercised in a browser this run (no dev server; staging QA is the gate): the home's deploy stack is ~76 px taller than the documented 768 px headroom and relies on the safe-center scroll; the lobby countdown readout is anchored locally at patch arrival (cosmetic). Deferred: leave-during-form strands a 2-cohort (pre-existing, shared with Standard); `/lobby/resolve` is unthrottled; a full-lobby `joinById` race reads MATCH STARTED. Open for Eric: How-to-Play has no private-lobby section (no copy authored unasked).

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean (run first; server/client resolve shared from dist).
- `npm run lint` -- expected: 0 errors (complexity ≤ 10).
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: all green, counts recorded in CHANGELOG.
- `node server/scripts/lobbySmoke.mjs` -- expected: PASS lines for both scenarios; then `node server/scripts/queueSmoke.mjs` and `node server/scripts/soloSmoke.mjs` -- expected: still PASS (run one at a time on a quiet box; kill only PIDs you started).
- `npm run check` -- expected: green, the gate before the PR.
