---
title: 'Story 8.0: Colyseus 0.18 Upgrade (floor story)'
type: 'chore'
created: '2026-09-14'
status: 'done'
baseline_revision: 'ad1ed35f5cbd6b9e45a3e9d0f6ed3f3a0b90404f'
final_revision: 'a16ecca'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The game runs on Colyseus 0.17 (`@colyseus/core` 0.17.44, `@colyseus/schema` 4.0.27, `@colyseus/sdk` 0.17.43). `@colyseus/database` and `@colyseus/admin` exist only on 0.18, and Epics 8–9 must build on a current runtime — so the upgrade lands FIRST, alone, with no player-visible change (the Story 0.1 precedent; a framework upgrade and a feature never share a PR).

**Approach:** Move every `@colyseus/*` package on both sides to the 0.18 set — as ruled by Eric 2026-09-14: `colyseus` 0.18.5, `@colyseus/core` **0.18.13** (the onAuth security fix, superseding the AC's 0.18.12), `@colyseus/schema` **5.0.32** (superseding 5.0.27), `@colyseus/tools` 0.18.3, `@colyseus/sdk` 0.18.2, `@colyseus/monitor` 0.18.3, `@colyseus/playground` 0.18.4, plus `@colyseus/auth` 0.18.2 / `@colyseus/database` 0.18.3 / `@colyseus/admin` 0.18.5 as **unmounted `dependencies`**; `postgres` and `drizzle-kit` are **deferred to Story 9.1**. Convert the measured touchpoints in the adapter layer, bump `PROTOCOL_VERSION` 49 → 50, update (never delete) every Colyseus-importing test and smoke, and prove the result over real sockets.

## Boundaries & Constraints

**Always:**

- Containment: `server/src/game/**` keeps ZERO Colyseus imports. Code changes are limited to the adapter layer (`server/src/rooms/**`, `app.config.ts`, `index.ts`, `metrics.ts`/`liveness.ts` only where types force it), package manifests + lockfile, `shared/src/index.ts` (PV only), the client net layer, tests, smokes, and docs.
- Server and client move in ONE change: the 0.18 JOIN_ROOM handshake is a wire break a 0.17 client fails BEFORE `protocolVersionError` can run, so the PV gate cannot cover a split deploy.
- `PROTOCOL_VERSION` 49 → 50 with a dated line in the wire-change log (schema 5 encoder + handshake). The join gate must still refuse a mismatched `pv`.
- `setSimulationInterval` → `setTimestep` is a REAL conversion at its one call site; leaving the deprecated forwarder in place does not satisfy the AC.
- `setMetadata` is now a full REPLACE: both rooms keep writing whole listing-metadata objects, and every comment claiming core shallow-merges is corrected.
- `@colyseus/database` is pinned EXACTLY (it carries the tree's only pre-release, `drizzle-orm` 1.0.0-rc.2); every other Colyseus package uses the repo's caret convention with the lockfile resolving to the ruled set.
- Schema 5's 63-field cap is pinned by a test over every `Schema` class (`ArenaState` 14, `PlayerMeta` 8 today).
- The Story 0.1 re-verification list runs green: PV join gate, JOINING guard + `_enqueuedMessages`, seat-reservation timing (15s default), reconnection with a rotated token (the SDK line the ledger cites is re-located: token assignment is now `sdk/build/Room.mjs:485`, `onReconnect.invoke()` still fires BEFORE it — the microtask persister stays), and the queue door's `reserveMultipleSeatsFor` still does NOT call `onAuth` (the PV + staging gates are duplicated on both rooms for exactly that reason).
- Every Eric ruling this cycle is recorded in `epic-8-context-amendments.md` and re-applied to `epic-8-context.md`.
- Version 0.17.132 → 0.17.133 (`VERSION` + root `package.json`), CHANGELOG entry, one-line stamps in BOTH `sprint-status.yaml` and `gds-workflow-status.yaml`.
- Process hygiene: boot servers only on ports you verified free; kill every process you start; never kill a listener you did not start.

**Block If:**

- Containment fails — a fix would need `world.ts`/`match.ts` changes or a Colyseus import outside the adapter layer.
- A ruled package requires Node > 22 or Express 5.
- 0.18 changes seat-reservation or `onAuth` ordering so the queue door double-gates or the direct arena door goes ungated — that is a security-posture decision, not an adapter fix.
- A smoke that passes at the 0.17 baseline fails on 0.18 for a cause inside Colyseus with no adapter-layer fix.

**Never:**

- Mount `auth`/`database`/`admin`: no routes, no DB, no migrations, no env vars, no `render.yaml` change.
- Install `postgres` or `drizzle-kit` (Eric 2026-09-14 — Story 9.1 owns them at the version verified against the ORM it ships with).
- Any deck/Epic 8 feature code, gameplay or `CONFIG` value change, new schema field, or `shared/src/types.ts` change.
- Adopt `@colyseus/testing`, `setFixedTimestep`, `defineInput`, the predict/reconcile layer, or the `schema()` builder — additive 0.18 features are out of scope.
- Rewrite the bare-`new ArenaRoom()` test idiom to boot real servers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Full match over 0.18 | Every headless smoke in `server/scripts/*.mjs` against a self-booted `HC_DEV_OPTIONS=1` server | Each completes join → play → assertions over real sockets; matchSmoke's known pre-existing flake is A/B'd, not hidden | Smoke exits non-zero; report, do not skip |
| Stale client pv | Client sends `pv: 49` to the PV-50 server | Refused at matchmake by `protocolVersionError` before any seat is reserved | `ServerError` + clean SDK error |
| Rotated token resume | Page refresh mid-match with a persisted `roomId:token` | `client.reconnect` succeeds; persister re-writes the rotated token on ack | Failure clears the token (existing behavior) |
| Listing metadata | `publishListing()` in either room | Every key of the room's listing-meta type written on every call; no key ever silently dropped | n/a |
| Schema boot | Server boots with `ArenaState` + `PlayerMeta` | Class definition never throws the `MAX_FIELDS` guard | Boot failure = test failure |
| Rate limit + dev options | Held rudder + rapid fire; `matchOverride` with/without env flag | Identical to 0.17 | Unchanged |

</intent-contract>

## Code Map

- `server/package.json`, `client/package.json`, `package-lock.json` -- the 0.18 manifests; `@colyseus/database` exact-pinned
- `shared/src/index.ts:553` -- `PROTOCOL_VERSION` 49 → 50 + wire-change log line
- `server/src/rooms/ArenaRoom.ts` -- `:582` `setSimulationInterval` → `setTimestep`; `:494` shallow-merge comment; `Room<{state}>` generic; `ClientState`/`CloseCode`/`ErrorCode`/`ServerError`/`AuthContext` imports
- `server/src/rooms/StandardQueueRoom.ts` -- `:295` `setMetadata` (whole object); `:66` `RoomCache` derived from `matchMaker.createRoom`; `:336-364` `createRoom`/`reserveMultipleSeatsFor`/`buildSeatReservation`
- `server/src/rooms/schema/ArenaState.ts` -- the only Schema file (`@type`, `MapSchema`); `experimentalDecorators` + `useDefineForClassFields:false` stay
- `server/src/app.config.ts` -- `config()`/`createRouter`/`monitor()`/`playground()` (return type changed from `express.Router`)
- `server/src/metrics.ts:236`, `server/src/liveness.ts:317,389` -- `matchMaker.stats.local`, `matchMaker.presence` duck-type, `matchMaker.query`
- `server/src/rooms/soloThrottle.ts:84-87` -- comment pinned to 0.17.44 `AuthContext` shape
- `client/src/net/connection.ts` -- `:441-470` token persister (comment cites `Room.mjs:241/:243` → now `:485`); `:497` `room.reconnection`; `:382` `client.create` (never `joinOrCreate`)
- `client/src/net/resumeToken.ts`, `roomBindings.ts:461-482` -- token format + signal `.remove` shape (unchanged, verify)
- `server/src/__tests__/liveness.test.ts:911` -- reads `colyseus.__globalEndpoints`, REMOVED in 0.18
- 10 other Colyseus-importing tests: `joiningGuard`, `operability`, `queue`, `reconnect`, `regatta`, `rtt`, `solo`, `soloThrottle`, `metrics` (server), `connection.test.ts` (client); `boarding.test.ts:150` hardcodes the 15s seat reservation
- `server/scripts/*.mjs` (15) -- `reconnectSmoke.mjs:296-301` reaches `room.reconnection` + `room.connection.transport.ws`; `loadTest.mjs:99` header-merge internal
- `_bmad-output/project-context.md` -- stack lines say 0.17. (`CLAUDE.md` is OFF-LIMITS by Eric's standing instruction, reaffirmed 2026-09-14 mid-cycle: every edit to it was reverted and its stack lines are left as they are.)
- `VERSION`, `package.json`, `CHANGELOG.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml`, `deferred-work.md:1797`, `epic-8-context-amendments.md`

## Tasks & Acceptance

**Execution:**
- [x] `server/package.json` + `client/package.json` + `package-lock.json` -- move every `@colyseus/*` to the ruled set (core `^0.18.13`, schema `^5.0.32` both sides, `@colyseus/database` `0.18.3` exact, auth/admin as unmounted `dependencies`, monitor/playground stay dev); `npm install`; record the resolved versions -- the pinned target set is the AC
- [x] `shared/src/index.ts` -- `PROTOCOL_VERSION` 49 → 50 with a dated log line -- schema 5 encoder + JOIN_ROOM layout are a wire break
- [x] `server/src/rooms/ArenaRoom.ts` -- `setTimestep` at the one call; fix the `:494` merge comment; anything else tsc flags -- the AC's named conversions
- [x] `server/src/rooms/StandardQueueRoom.ts`, `schema/ArenaState.ts`, `app.config.ts`, `metrics.ts`, `liveness.ts`, `soloThrottle.ts` -- compile under 0.18 with minimal, comment-honest edits; verify `reserveMultipleSeatsFor` still skips `onAuth` in 0.18.13 -- adapter containment
- [x] `client/src/net/connection.ts` -- re-pin the token-ordering comment to the 0.18 SDK lines; confirm `reconnection` + `onMessage` unbind shapes -- resume flow is the riskiest client path
- [x] `server/src/__tests__/liveness.test.ts` -- replace the `__globalEndpoints` pin with a 0.18-valid assertion that both endpoints are registered on the router -- symbol removed upstream
- [x] 10 remaining Colyseus-importing tests + `boarding.test.ts` -- update rather than delete; re-verify the 15s constant -- the AC says updated, not deleted
- [x] new tests -- (a) every Schema class stays under `MAX_FIELDS` 63; (b) PV gate refuses `pv: 49`; (c) both rooms' listing writes carry every meta key -- the three 0.18-specific regressions
- [x] `server/scripts/*.mjs` -- run all 15 over 0.18 sockets; re-pin `reconnectSmoke`'s transport internal -- the AC's socket proof
- [x] `project-context.md` (NOT `CLAUDE.md` — Eric ruling), `VERSION`, `package.json`, `CHANGELOG.md`, both trackers, `deferred-work.md` (resolve `:1797`; ledger the postgres/kit deferral + the ORM/kit mismatch), `epic-8-context-amendments.md` -- doc + tracker discipline
- [x] `npm run check` green; `grep -r colyseus server/src/game/` empty -- the gate

**Acceptance Criteria:**
- Given the upgraded workspaces, when `npm run check` runs, then lint + tsc + every test passes in shared, server and client.
- Given a self-booted 0.18 server with `HC_DEV_OPTIONS=1`, when every smoke in `server/scripts/` runs, then each completes over real sockets.
- Given `world.ts`/`match.ts`/`game/**`, when grepped for Colyseus imports, then there are zero.
- Given a client on `pv: 49`, when it matchmakes against the server, then it is refused before any seat is reserved.
- Given the manual-match clause of the AC (a full match on the dev host), then it is left for Eric post-merge, as Story 0.1 did — an unattended run cannot drive a browser.

## Spec Change Log

## Review Triage Log

### 2026-09-14 — Review pass (Blind Hunter + Edge Case Hunter at session model, plus Codex `gpt-5.6-sol` cross-model review — gate PASS, 0 P1)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 5, low 6)
- defer: 3: (high 0, medium 1, low 2)
- reject: 1
- addressed_findings:
  - `[medium]` `[patch]` (both hunters) fogSmoke band-accuracy assert was tautological — `blipsIn` pre-filtered to `< ATTRIBUTE_U` and the loop asserted the same bound → band phase now takes the UNFILTERED window and asserts no return in the 60–120u shell around the subject; fail-proven by shifting a paint 90u
  - `[medium]` `[patch]` (both hunters) hard cover proven only at nominal park positions with 45u park slop → `parkShadowedBand()` re-evaluates `visibilityTo` on the actual parked poses, re-parks up to 3× per candidate over 3 candidates
  - `[medium]` `[patch]` island filter ignored the 2×45u park tolerance → `PARK_TOL` declared once, reused by `settle`/`parkAcross`, folded into the truesight filter (run picked r=67u where r≤110 was previously admitted)
  - `[medium]` `[patch]` leak assertion narrowed to the subject id lost any-hull coverage → every contact in every held frame must be within `SIGHT + 15` of the observer (the real `contactSignal` claim); subject clause kept
  - `[medium]` `[patch]` (Codex) schema-cap registry guard compared a hand list to itself → derived from the schema module's real `Schema` exports, asserted both ways; fail-proven with a temporary third class
  - `[low]` `[patch]` `blipsIn` with a null subject pose was vacuous → asserts the pose
  - `[low]` `[patch]` combatSmoke done predicate satisfiable by a fleet hull sinking B → requires a `sunk` event with `id === B && by === A`
  - `[low]` `[patch]` cap pin off by one (63 fields are legal; index 63 throws) → `toBeLessThanOrEqual(MAX_FIELDS)`, 63-legal and 64-throws probes
  - `[low]` `[patch]` (Blind Hunter) `liveness.test.ts` router pin recorded a false invariant (`.extend` merges in 0.18) → rationale rewritten to declaration-completeness, citing better-call `router.mjs:117` and core `Server.mjs:152-159`
  - `[low]` `[patch]` (Blind Hunter) intent contract promised a CHANGELOG entry the delivery skipped → `## [0.17.133]` entry added (renumbered `[0.17.134]` after the merge)
  - `[low]` `[patch]` stale 0.17 line citations in `reconnect.test.ts` (×2), `soloThrottle.test.ts`, `connection.test.ts` (×3), `roomBindings.test.ts` (×3), `ArenaRoom.ts`, `livenessSmoke.mjs` → re-pinned to verified 0.18.13 / 0.18.2 lines
- deferred (pre-existing, ledgered in `deferred-work.md`): reconnectSmoke's close path yields 1005 not 1006 on Node 22's global WebSocket; `onDrop` hold branch for a never-JOINED client; no `onUncaughtException` on `ArenaRoom` (one throwing tick kills the process — unchanged 0.17 → 0.18)
- rejected: an orphaned `@colyseus/clock` 2.0.3 lockfile entry with no dependant (npm does not call it extraneous; a future full re-resolve drops it)

## Design Notes

- The 0.17.44 baseline is a LATE 0.17: `onDrop`/`onReconnect`, `maxMessagesPerSecond`, `"type":"module"` and the deprecations of `setState`/`setPatchRate`/`setSeatReservationTime` are already in place, so the true delta is small. Verified byte-identical between 0.17.44 and 0.18: `@colyseus/tools` `config()`/`listen()`, `matchMaker.*`, `IRoomCache`, `ISeatReservation`, `static onAuth(token, options, context)`, `allowReconnection`, `ClientState`/`CloseCode`/`ErrorCode`, `Presence`, `createRouter`, the reconnection-token format, `patchRate` 50 ms, the 15 s seat reservation.
- Silent runtime breaks with no compiler help: `setMetadata` merge → replace; `ClientArray` gained a `_byId` index that `clients[i] = x` / `.length = 0` desync (use push/splice); msgpack library swap; `AuthContext.ip` may be `undefined` (no reader in this repo).
- The client polls `room.state` duck-typed and imports no schema symbols, so Schema 5 has no client callback surface to migrate.
- Correction of record (wave 1 count): `ArenaState` declares 15 `@type` fields, not the 14 the intent contract's parenthetical says (`PlayerMeta` 8 is right); the cap test pins the real number. `CHANGELOG.md` is deliberately untouched — it has had no per-cycle entry since 0.17.0; cycles are recorded in the two trackers.
- Install note: `npm@10.9.3` crashes resolving this monorepo without a lockfile (vitest peer set), so wave 1 re-resolved only the Colyseus subtree inside the existing lockfile; `npm ci --include=dev` then passes from it, which is the proof Render's `npm install --include=dev` build will too.

## Verification

**Commands:**
- `npm install` -- expected: lockfile resolves with no peer errors; `npm ls @colyseus/core @colyseus/schema @colyseus/sdk` shows the ruled set
- `npm run check` -- expected: lint + tsc + all tests green (5716 at baseline, plus the new pins)
- `HC_DEV_OPTIONS=1 PORT=<free> node server/scripts/<each>.mjs` -- expected: every smoke passes; matchSmoke flake A/B'd against baseline if it fails
- `grep -rn "colyseus" server/src/game/` -- expected: no matches
- `grep -rn "__globalEndpoints\|setSimulationInterval" server/src client/src` -- expected: no matches

## Auto Run Result

**Status:** done (2026-09-14, build cycle **134**, version **0.17.134** — the intent contract says 0.17.133 because that was the next number when the run started; PR #216 (the CLAUDE.md rewrite) landed on `development` as cycle 133 mid-run, so this cycle was renumbered at merge time and `origin/development` was merged into the branch.)

**Summary:** Colyseus upgraded 0.17 → 0.18 across the monorepo, contained to the adapter layer: server on `colyseus` 0.18.5 / `@colyseus/core` 0.18.13 / `@colyseus/schema` 5.0.32 / `@colyseus/tools` 0.18.3, client on `@colyseus/sdk` 0.18.2 (sharing the same schema 5.0.32), with `@colyseus/auth` 0.18.2 / `@colyseus/database` 0.18.3 (exact pin) / `@colyseus/admin` 0.18.5 installed as unmounted `dependencies` and `postgres` + `drizzle-kit` deferred to Story 9.1 — all three by Eric ruling 2026-09-14 (epic-8 amendments 1–3). `setSimulationInterval` → `setTimestep` at its one call, `setMetadata` replace semantics documented and pinned, `PROTOCOL_VERSION` 49 → 50, 11 test files updated, 15 headless smokes green over real 0.18 sockets, `server/src/game/**` still imports zero Colyseus.

**Files changed:** `server/package.json`, `client/package.json`, `package-lock.json` (0.18 set; only the Colyseus subtree re-resolved — npm 10.9.3 crashes on a lockfile-less resolve of this repo; `npm ci` proves the result); `shared/src/index.ts` (PV 50 + log line); `server/src/rooms/ArenaRoom.ts` (`setTimestep`, replace-semantics comment, 0.18 citations, `ArenaListingMeta` exported for the pin); `server/src/rooms/StandardQueueRoom.ts` (comments, `QueueListingMeta` exported); `server/src/app.config.ts`, `liveness.ts`, `metrics.ts`, `rooms/soloThrottle.ts` (comment honesty under 0.18); `client/src/net/connection.ts`, `resumeToken.ts`, `roomBindings.ts` (SDK 0.18.2 citations; no behaviour change); tests `liveness`, `solo`, `denials`, `operability`, `boarding`, `reconnect`, `soloThrottle`, `connection`, `roomBindings`, shared `barrel` + `radarRaster` (PV 50), new `server/src/__tests__/colyseus018.test.ts` (schema cap, PV gate, every-key listing writes); smokes `fogSmoke` (repaired for cycle-105 blip grammar, cycle-68 height-aware radar, fleet hulls; then hardened at the review gate), `combatSmoke` (300s budget after cycle-122 HP doubling; done predicate names both parties), `reconnectSmoke`, `loadTest`, `livenessSmoke` (citations); `VERSION`, root `package.json`, `CHANGELOG.md`, `_bmad-output/project-context.md`, both trackers, `deferred-work.md`, `epic-8-context.md`, `epic-8-context-amendments.md` (new). **`CLAUDE.md` is untouched** — every edit made to it mid-cycle was reverted on Eric's instruction and the file is now hook-frozen by PR #216.

**Review findings breakdown:** Blind Hunter + Edge Case Hunter (session model) + Codex (`gpt-5.6-sol`, 87k tokens, gate PASS, 0 P1). 11 patches applied (5 medium: fogSmoke band-accuracy tautology, hard cover on nominal poses, park tolerance, leak coverage narrowed, self-referential schema registry; 6 low), 3 deferred (all pre-existing), 1 rejected, 0 intent gaps, 0 bad-spec loopbacks. Both hunters independently found the two fogSmoke defects; Codex alone found the registry tautology; Blind Hunter alone found the false router invariant and the CHANGELOG contract miss. Nobody found a runtime regression in the adapter layer, wire path or lockfile.

**Verification performed:** `npm ci --include=dev` exit 0 from the resulting lockfile (the proof Render's `npm install --include=dev` build resolves); `npm run check` exit 0 on the merged tree — lint 0 errors, tsc clean ×3, **784 / 1745 / 3260** tests, plus PR #216's `check:hooks`; `npm ls` shows the ruled set exactly (core 0.18.13, schema 5.0.32 deduped to one copy for both sides); all 15 smokes PASS (matchSmoke first try, no flake); the three gate-patched smokes re-run green; server boots from `server/` and answers `/liveness`; `grep colyseus server/src/game/` empty; seat reservation verified NOT to call `onAuth` in 0.18.13 (`MatchMaker.mjs:438/:461` vs `callOnAuth` :509); SDK `onReconnect.invoke()` `Room.mjs:483` still precedes the token assignment `:485`.

**Residual risks:** (1) the in-browser full match on the dev host is Eric's post-merge step, as it was for Story 0.1; (2) `weaponsSmoke.mjs` has a VACUOUS "torpedo never appeared as a blip" assertion (blips carry no id since cycle 105) — reported, not fixed, needs a ruling on geometric attribution; (3) `latencyHarness` advisory D1 agreement misses (60% vs the unratified 90% target) on the full run, pass at short runs — Eric's numbers; (4) fogSmoke's band oracle is an annulus, so a non-subject hull loitering 60–120u from the subject during the band window would false-fail (probabilistically excluded, not structurally — cost of a blip wire with no identity); (5) `MatchOverride` has no `fleet: false` dev switch, which would be the clean fix for (4); (6) wave 2 killed its own server with `pkill -f "tsx src/index.ts"`, a pattern kill — harmless here (no dev server was up) but the smoke runbook should name PIDs.
