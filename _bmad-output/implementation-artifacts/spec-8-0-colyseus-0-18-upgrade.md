---
title: 'Story 8.0: Colyseus 0.18 Upgrade (floor story)'
type: 'chore'
created: '2026-09-14'
status: 'in-progress'
baseline_revision: 'ad1ed35f5cbd6b9e45a3e9d0f6ed3f3a0b90404f'
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
