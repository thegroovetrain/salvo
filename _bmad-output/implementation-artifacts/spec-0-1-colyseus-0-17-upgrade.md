---
title: 'Story 0.1: Colyseus 0.17 Upgrade'
type: 'chore'
created: '2026-07-17'
status: 'done'
baseline_revision: '1f81f70b4bf1bc4b239bfe3b47559d64eca4fbf8'
final_revision: '74dbd4c841cfce9e3c096656cf2ef15490819034'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md',
  ]
warnings: []
---

<intent-contract>

## Intent

**Problem:** The game runs on Colyseus 0.16 (EOL-bound), blocking every Epic 0+ capability (token reconnection, typed routes, queues) and shipping with zero transport-level input rate limiting.

**Approach:** Upgrade server to Colyseus 0.17.x (+ @colyseus/tools 0.17, @colyseus/schema 4.x) and client/smokes to `@colyseus/sdk` 0.17.x, containing all changes to the adapter layer, and enable `maxMessagesPerSecond` from a CONFIG-declared limit.

## Boundaries & Constraints

**Always:**

- `server/src/game/world.ts`, `game/match.ts`, and everything under `game/` keep ZERO Colyseus imports; the migration touches only the adapter layer (rooms/, app.config.ts, index.ts), package manifests, client net layer, and smoke scripts.
- Server and client schema majors move together (@colyseus/schema 4.x both sides — the SDK bundles its own; verify decode compatibility via smokes).
- Bump `PROTOCOL_VERSION` 2 → 3 in `shared/src/index.ts` (schema 4.x serializer is a wire break; old clients must not talk to the new server). [Orchestrator ruling]
- Rate limit lives in shared CONFIG as `CONFIG.net.maxMessagesPerSecond = 200`, sized for burst DELIVERY (Colyseus counts arrival in 1s windows and force-disconnects on breach; a wifi-stall TCP flush of ~8s of queued 20Hz inputs ≈ 180 msgs must never kick an honest client). [Orchestrator ruling, amended in review — see Spec Change Log]
- Process hygiene: you may boot temporary servers ONLY on ports you choose and verify free; kill every process you start; NEVER kill a listener you did not start (the user's dev server may be live on 2567/5173).

**Block If:**

- Containment fails — any fix would require modifying `world.ts`/`match.ts` or adding Colyseus imports outside the adapter layer.
- Client's direct polling of `room.state` (plain property/`.get()`/`.size` reads in `main.ts`) cannot be made to work under schema 4.x without a client rewrite beyond the net layer.
- Colyseus 0.17 requires a Node version incompatible with the installed toolchain.

**Never:**

- No reconnection logic (Story 0.2), no structured logging/metrics/typed routes (0.3), no portal seam (0.4), no QueueRoom/ping adoption (later epics).
- No gameplay/balance changes; no new schema fields (roster-only schema law); no changes to `shared/src/types.ts` message shapes.
- Do not silently drop `@colyseus/monitor`/`@colyseus/playground`; if no 0.17-compatible version exists, keep them pinned working or report the deviation explicitly.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                              | Expected Output / Behavior                                          | Error Handling                                             |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Normal play      | 20Hz input sampling + held rudder + rapid fire + spends    | No client ever tripped by rate limit; matches play end-to-end       | No error expected                                          |
| Message flood    | Client exceeds `CONFIG.net.maxMessagesPerSecond` (200/s)   | Transport forcibly disconnects that client; room/others unaffected  | Colyseus-native disconnect; no server crash                |
| Stale client     | 0.16-era client (PROTOCOL_VERSION 2) reaches 0.17 server   | Connection fails or version check rejects; no undefined behavior    | Existing PROTOCOL_VERSION gate + schema mismatch rejection |
| Dev-only options | `matchOverride`/`zoneOverride` with/without HC_DEV_OPTIONS | Behavior identical to 0.16: honored only when env flag set          | `sanitizeRoomOptions()` unchanged                          |

</intent-contract>

## Code Map

- `server/package.json` -- colyseus ^0.16 deps to bump; smokes' `colyseus.js` devDep lives here or root
- `client/package.json` -- `colyseus.js ^0.16.0` → `@colyseus/sdk`
- `server/src/app.config.ts` -- `config({initializeGameServer, initializeExpress})` → 0.17 `defineServer` form; /health, static client serving, dev-gated monitor/playground
- `server/src/index.ts` -- `listen(appConfig, port)` boot via @colyseus/tools
- `server/src/rooms/ArenaRoom.ts` -- `Room<ArenaState>` generic → 0.17 form; set `maxMessagesPerSecond`; onCreate/onJoin/onLeave/onMessage/broadcast/client.send surface
- `server/src/rooms/schema/ArenaState.ts` -- @type decorators + MapSchema under schema 4.x
- `server/tsconfig.json` -- `experimentalDecorators` + `useDefineForClassFields: false` (verify still correct for schema 4)
- `shared/src/constants.ts` -- add `CONFIG.net` block
- `shared/src/index.ts` -- PROTOCOL_VERSION bump
- `client/src/net/connection.ts` -- `colyseus.js` import → `@colyseus/sdk`; joinOrCreate/onMessage/onError
- `client/src/net/roomBindings.ts` -- room message/leave/error wiring (import source only if it imports the lib)
- `server/scripts/*.mjs` -- 8 smokes importing `colyseus.js` → `@colyseus/sdk`; self-booting ones own their server (PORT 2599)

## Tasks & Acceptance

**Execution:**

- [x] `server/package.json` -- bump `colyseus` → ^0.17.10, `@colyseus/tools` → ^0.17.19, `@colyseus/schema` → ^4.0.27; move monitor/playground to latest 0.17-compatible; replace the smokes' `colyseus.js` devDep with `@colyseus/sdk` -- current majors are 0.16/3.x
- [x] `client/package.json` -- replace `colyseus.js` with `@colyseus/sdk` ^0.17.43 -- package renamed upstream at 0.17
- [x] root -- `npm install` to refresh the workspace lockfile -- single lockfile at root
- [x] `shared/src/constants.ts` -- add `net: { maxMessagesPerSecond: 60 }` with a comment tying 60 to the 20Hz input cadence × 3 headroom -- CONFIG is the single source of truth for the limit
- [x] `shared/src/index.ts` -- bump `PROTOCOL_VERSION` 2 → 3 -- schema 4.x is a wire-contract break
- [x] `server/src/app.config.ts` -- AMENDED (verified against installed package): `@colyseus/tools@0.17.19` exports only `listen`/`getTransport` — no `defineServer`; the existing `config({initializeGameServer, initializeExpress})` + `listen()` form IS the supported 0.17 idiom and type-checks/boots unchanged (health 200, dev-gated playground/monitor, prod static). No change made; typed routes revisit this in Story 0.3.
- [x] `server/src/index.ts` -- adapt boot to the 0.17 @colyseus/tools API (keep PORT env / :2567 default) -- verified: `listen(appConfig, port)` unchanged and working under 0.17
- [x] `server/src/rooms/ArenaRoom.ts` -- update to 0.17 Room API (generic `Room<{ state: ArenaState }>`) and set `maxMessagesPerSecond = CONFIG.net.maxMessagesPerSecond` -- the one adapter bridging Colyseus and World
- [x] `server/src/rooms/schema/ArenaState.ts` + `server/tsconfig.json` -- verified: decorators/MapSchema compile and sync under schema 4.x with existing tsconfig (`experimentalDecorators` + `useDefineForClassFields: false`); no changes needed; roster polling proven live over the wire
- [x] `client/src/net/connection.ts` + `client/src/main.ts` (type import) -- switched imports to `@colyseus/sdk`; direct `room.state` polling verified live under schema 4 (players `.get()`/`.size`/field reads sync correctly)
- [x] `server/scripts/*.mjs` (all 8) -- switched `colyseus.js` imports to `@colyseus/sdk` -- smokes prove the upgrade over real sockets
- [x] run full verification (below) -- see Design Notes for the matchSmoke evidence and ruling

**Acceptance Criteria:**

- Given the upgraded workspaces, when `npm run check` runs, then lint + type-check + all tests pass in shared, server, and client.
- Given a booted 0.17 server with `HC_DEV_OPTIONS=1`, when every headless smoke in `server/scripts/` runs, then all complete successfully over real sockets (join → play → assertions), including matchSmoke's full join → countdown → live → win flow.
- Given normal play driven by the smokes (held rudder, rapid fire), when messages flow at the client's natural cadence, then no client is disconnected by the rate limiter.
- Given `world.ts`/`match.ts`, when grepping for colyseus imports, then there are zero.

## Spec Change Log

### 2026-07-17 — Rate-limit ruling amended during review (no code re-derivation needed)

- **Triggering finding:** both review hunters + orchestrator verification of installed `@colyseus/core` source: `maxMessagesPerSecond` counts messages by server-side ARRIVAL in 1-second windows and force-disconnects on breach. The original ruling (60 = 3× the 20Hz send cadence) reasoned only about send rate; a flaky-wifi TCP stall flushing 3+ seconds of queued inputs into one arrival window would kick exactly the players Epic 0 protects.
- **Amendment:** `CONFIG.net.maxMessagesPerSecond` 60 → 200 (covers the worst honest burst: ~8s dead-socket ping-timeout backlog × 20Hz + live cadence ≈ 180). Intent-contract line updated to match — an autonomous-ruling revision under the run's explicit user mandate to resolve open questions and report them; the human-authored epic AC ("normal play never trips it") is the intent being honored.
- **Known-bad state avoided:** honest clients on school-grade wifi force-disconnected mid-match by the flood guard after a transient stall.
- **KEEP:** CONFIG-declared limit (per epic AC), single source of truth in `CONFIG.net`, wired via `ArenaRoom.maxMessagesPerSecond`, burst-derivation comment in constants.ts, wiring + sizing test in `server/src/__tests__/rateLimit.test.ts`.

## Review Triage Log

### 2026-07-17 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 5: (high 1, medium 2, low 2)
- defer: 1: (high 0, medium 1, low 0)
- reject: 7
- addressed_findings:
  - `[high]` `[patch]` Rate limit 60 sized only for send cadence; Colyseus counts arrival in 1s windows and kicks on breach, so a wifi-stall burst flush would disconnect honest players → raised to 200 with burst-aware derivation comments (constants.ts, ArenaRoom.ts); spec ruling amended (see Spec Change Log)
  - `[medium]` `[patch]` PROTOCOL_VERSION comment overclaimed enforcement ("must not talk") with no runtime gate anywhere → comment rewritten to state it is documentation-only; runtime gate logged as deferred work
  - `[medium]` `[patch]` Zero test coverage for the rate-limit feature → added `server/src/__tests__/rateLimit.test.ts` (CONFIG wiring onto the room property + burst-sizing floor)
  - `[low]` `[patch]` Stale "no rate cap" comment on the spend handler contradicted the new transport guard → reworded (per-channel vs room-wide guard)
  - `[low]` `[patch]` Garbled find-replace smoke headers ("two live /sdk client") in 7 scripts + stale stack docs (CLAUDE.md, project-context.md still said Colyseus 0.16 / colyseus.js / schema 3.x) → grammar and versions corrected
- Deferred: PROTOCOL_VERSION runtime enforcement (join-time version check + clean "please refresh" rejection) — pre-existing gap (v2 was equally unenforced), now more consequential under the schema-4 wire break; natural home is Story 0.2/6.7 reconnection work.
- Rejected (verified noise): CONFIG-on-wire "doctrine violation" (the epic AC itself mandates a CONFIG-declared limit; the value is not a secret); @colyseus/sdk caret-range drift (root lockfile pins both; matches repo convention); missing VERSION bump (belongs to /ship at PR time per project workflow); zoneSmoke tsconfig comment "unverified for v4" (operationally verified by green boot/tests/smokes); client `PublicState` cast fragility (deliberate architecture, roster decode verified live under schema 4); kick-surfaces-as-freeze (client routes abnormal closes through onLeave — verified by reviewer); matchSmoke re-raise (already A/B-evidenced and logged in deferred-work.md before review).

## Design Notes

- **Verification outcome (2026-07-17):** `npm run check` green — 649 tests (129 shared + 250 server + 270 client), lint + tsc clean. 7/8 smokes pass reliably over `@colyseus/sdk` (smoke, combat, weapons, fog, prediction, zone, drones). Rate limiter wired (`ArenaRoom.maxMessagesPerSecond = CONFIG.net.maxMessagesPerSecond`); no smoke tripped it. Grep gates clean (zero Colyseus in `game/`, zero `colyseus.js` anywhere). Measured wire health on 0.17: 20.0Hz server tick under match load, input→ack median 18.5ms.
- **matchSmoke flakiness is pre-existing, NOT a migration defect (A/B proven):** on an isolated worktree at the 0.16 baseline (`1f81f70`), matchSmoke failed 3/3 runs (results-broadcast timeout ×2, suppressed-torpedo timeout ×1) — the same failure taxonomy as on the 0.17 tree (scattered timeouts across steps 2/4/5 driven by torpedo-connect luck and a drone camping the r=90 storm-safe pocket). The full lifecycle DOES work on 0.17: an isolated probe drove a real match to a results broadcast with a valid winner, and one full matchSmoke pass produced the complete results broadcast (winner A, 6 placement rows). Ruling: matchSmoke cannot discriminate this upgrade; accepted as-is, hardening deferred (see deferred-work.md).
- `maxMessagesPerSecond = 200` derivation (amended in review from 60 — see Spec Change Log): InputSampler sends at the 50ms sim cadence (20/s; fire rides the input message, spends are rare), but Colyseus counts ARRIVAL in 1s windows and kicks on breach, so the budget must absorb a wifi-stall TCP flush (~8s ping-timeout backlog ≈ 180 msgs in one window). 200 covers honest bursts; sustained floods still trip immediately. Tune only via CONFIG.
- The in-browser "full local match" AC is verified headlessly by matchSmoke; a human browser pass is left to Eric post-merge (unattended run cannot drive a real browser match).
- External-server smokes (smoke/combat/weapons/fog/prediction) expect a server with `HC_DEV_OPTIONS=1`. Boot your own instance for them on a port you verified free; if they hardcode :2567 and it is occupied, do not kill the listener — report instead.

## Verification

**Commands:**

- `npm install` -- expected: lockfile resolves, no peer-dep errors
- `npm run check` -- expected: lint + tsc + all tests green across all three workspaces
- `node server/scripts/matchSmoke.mjs` (and zoneSmoke, dronesSmoke — self-booting) -- expected: each completes with success output
- Remaining smokes against a self-owned `HC_DEV_OPTIONS=1` server boot -- expected: all pass; kill the server after
- `grep -r "colyseus" server/src/game/` -- expected: no matches
- `grep -rn "colyseus.js" client/src server/scripts` -- expected: no remaining old-package imports

## Auto Run Result

**Status:** done (2026-07-17)

**Summary:** Colyseus upgraded 0.16 → 0.17 across the monorepo, contained entirely to the adapter layer: server on `colyseus@0.17.10` / `@colyseus/tools@0.17.19` / `@colyseus/schema@4.0.27`, client and all 8 smokes on `@colyseus/sdk@0.17.43` (the renamed successor to the frozen `colyseus.js`). Transport-level flood guard enabled via `ArenaRoom.maxMessagesPerSecond` from new `CONFIG.net.maxMessagesPerSecond = 200` (burst-delivery-sized after review). `PROTOCOL_VERSION` 2 → 3. `World`/`Match` untouched, zero Colyseus imports (grep-verified). `app.config.ts` deliberately unchanged — `@colyseus/tools@0.17.19` has no `defineServer` export; the existing `config()` + `listen()` form is the supported 0.17 idiom (verified against the installed package).

**Files changed:** `server/package.json`, `client/package.json`, `package-lock.json` (dependency majors); `server/src/rooms/ArenaRoom.ts` (0.17 Room generic, rate-limit wiring, comment fixes); `shared/src/constants.ts` (`CONFIG.net`); `shared/src/index.ts` (PROTOCOL_VERSION 3); `client/src/net/connection.ts` + `client/src/main.ts` (SDK rename); `server/scripts/*.mjs` ×8 (SDK rename + header fixes); `shared/src/__tests__/barrel.test.ts` (version pin); `server/src/__tests__/rateLimit.test.ts` (new); `CLAUDE.md` + `_bmad-output/project-context.md` (stack version truthfulness).

**Review findings breakdown:** 5 patches applied (1 high: rate-limit burst sizing 60→200; 2 medium: PROTOCOL_VERSION comment honesty, missing rate-limit test; 2 low: stale comments, garbled smoke headers + stale docs), 1 deferred (PROTOCOL_VERSION runtime gate → deferred-work.md), 7 rejected as verified noise. No intent gaps, no bad_spec loopbacks.

**Verification performed:** `npm run check` exit 0 post-patch — 651 tests green (129 shared + 252 server + 270 client), lint + tsc clean. 7/8 smokes pass over real 0.17 sockets; dronesSmoke re-run green after patches. matchSmoke flakiness A/B-proven pre-existing (0/3 on an isolated 0.16 baseline worktree at `1f81f70`, same timeout taxonomy as 0.17); full lifecycle proven live on 0.17 (results broadcast, valid winner). Live wire probe: 20.0Hz tick under match load, input→ack median 18.5ms, schema-4 roster polling verified. Grep gates clean.

**Residual risks:** (1) stale production bundles fail at schema decode without a clean version-rejection UX until the deferred PROTOCOL_VERSION gate lands; (2) matchSmoke stays unreliable as a regression signal until hardened; (3) the in-browser end-to-end match is left for a human pass (headlessly covered).
