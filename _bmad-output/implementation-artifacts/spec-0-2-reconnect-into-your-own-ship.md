---
title: 'Story 0.2: Reconnect Into Your Own Ship'
type: 'feature'
created: '2026-07-18'
status: 'done'
baseline_revision: 'f339c7ad122132fbfd853b02ae9647cc6cab8a06'
final_revision: '77f4770e69efe8b0bd4c9fa5cc02678cce82b0fe'
review_loop_iteration: 0
followup_review_recommended: true
context:
  [
    '{project-root}/_bmad-output/project-context.md',
    '{project-root}/_bmad-output/implementation-artifacts/epic-0-context.md',
  ]
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** A dropped connection is a death sentence: `ArenaRoom.onLeave` instantly records the player as sunk-at-leave (`match.onPlayerLeave` → irreversible `recordSink`) and destroys the ship, and the client-side auto-reconnect staged in Story 0.1 is disabled (`room.reconnection.enabled = false`). Separately, `PROTOCOL_VERSION` still has no runtime gate (deferred-work pickup naming this story as its home).

**Approach:** Route non-consented drops through `onDrop` → `allowReconnection(client, grace)` during an active match, deferring ALL leave teardown until grace expiry, so the ship keeps sailing under its last telegraph order as a huntable participant. Re-enable the SDK's same-Room auto-reconnect on the client (token-authenticated, listeners intact). Add a join-time `pv` (PROTOCOL_VERSION) gate with a clean "please refresh" rejection.

## Boundaries & Constraints

**Always:**

- `World` and `Match` keep ZERO Colyseus imports; reconnection plumbing lives in the adapter layer. New room-side decision logic must stay unit-testable (pure helper or Match-side pure method).
- Grace window is CONFIG-declared: `CONFIG.net.reconnectGraceSeconds = 60` [autonomous ruling]. Grace applies ONLY to active-match participants; drops during waiting/countdown/results run today's immediate-leave teardown (a ghost must never arm/hold the countdown).
- Consented leaves (`room.leave(true)`, e.g. matchSmoke) keep today's immediate teardown — never offer them grace.
- A disconnected ship holds its last stored input verbatim (set-and-forget telegraph; no neutralization). Held `fireSeq` must not re-fire (edge-triggered semantics preserved).
- Reconnection resumes the SAME ship keyed by the preserved sessionId, authenticated solely by the Colyseus 0.17 reconnection token; teardown at grace expiry is exactly the current `onLeave` body (recordSink → removeShip → notifyRosterChanged → checkWin), and if the ship was already sunk in-world, `recordSink`'s existing dedupe guard must keep the real placement.
- The `pv` gate rejects mismatched AND missing `pv` with a `ServerError` whose message the menu status line renders (client maps it to "version mismatch — refresh the page"). Reconnects (which bypass onAuth) are not re-gated.
- `afterStep` skips clients whose state is not JOINED (bounds the reconnect-ack buffering window) [narrow pickup of deferred item; the JOINING-deadline kick stays deferred to 0.3].
- Process hygiene: boot temp servers only on ports you verified free; kill everything you start; never kill a listener you didn't start.

**Block If:**

- Holding the ghost ship requires modifying `World`/`Match` in ways that change sim behavior for connected players, or the perception invariants can't stay green.
- The installed `@colyseus/core` 0.17 onDrop/allowReconnection contract materially differs from spec assumptions (e.g. onDrop hook absent, token not validated server-side).

**Never:**

- No reconnection UX polish (countdown timers, abandon-flow, page-reload/sessionStorage resume) — Epic 6.7. A minimal "RECONNECTING…" banner via the existing banner util is in scope; nothing more.
- No structured logging/metrics (0.3), no portal seam (0.4), no PROTOCOL_VERSION bump (the gate is enforcement, not a wire break), no new schema fields, no gameplay/balance changes.
- No welcome-message re-send machinery or manual `client.reconnect()` flow (same-Room auto-reconnect only).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mid-match drop | Abnormal close during live phase | Ship sails on under last input, visible/huntable, counts in win check; teardown deferred | No error |
| Resume in grace | Same client auto-reconnects with valid token | Same sessionId/ship, control restored, listeners intact; client clears prediction ring + forceSnaps | No error |
| Bad/replayed token | Forged or stale token hits reconnect endpoint | Rejected by Colyseus token validation; ship untouched | Clean matchmake rejection |
| Grace expires | No reconnect within `reconnectGraceSeconds` | Full leave teardown runs (sunk-at-leave placement, removeShip, checkWin) | No error |
| Sunk while away | Ship killed during grace, then client resumes | Client lands in normal post-death flow (spec frames → spectate → results); real placement kept | No error |
| Drop outside live | Abnormal close in waiting/countdown/results | Immediate teardown, today's behavior | No error |
| Stale bundle joins | Join options missing `pv` or `pv !== 3` | Join rejected pre-seat; menu shows refresh message | ServerError, no socket work |
| Match ends during grace | Win/dispose while reconnection pending | Room disposal rejects pending reconnection cleanly; no hang | Colyseus dispose path |

</intent-contract>

## Code Map

- `server/src/rooms/ArenaRoom.ts:138-199` -- onJoin/onLeave/afterStep; add `onDrop` + `allowReconnection` + `onReconnect` hook; extract shared teardown; static `onAuth` pv gate; afterStep JOINED guard. Story-0.2 caution comment at :168-171 (rate-limit kicks route to onDrop too — SDK won't auto-reconnect on 4002; grace simply expires)
- `server/src/game/match.ts:112-121,215-226` -- `onPlayerLeave` (the teardown to defer), win check counts `world.ships` (ghost counts automatically); add pure "drop policy" query if needed
- `shared/src/constants.ts:198-210` -- `CONFIG.net`: add `reconnectGraceSeconds: 60`
- `client/src/net/connection.ts:57-80` -- flip `room.reconnection.enabled` → true; add `pv: PROTOCOL_VERSION` to join options; surface ServerError message
- `client/src/net/roomBindings.ts` + `client/src/main.ts:367-378,875-880` -- bind SDK `onDrop`/`onReconnect` signals: RECONNECTING banner on/off, prediction-ring clear + `forceSnap` on resume; retries-exhausted → existing handleRoomLeave; menu error mapping for version rejection
- `server/src/rooms/roomOptions.ts` -- join-option surface (pv validated in onAuth, not here — confirm no interference)
- `server/scripts/reconnectSmoke.mjs` -- NEW smoke: real-socket drop → ship-still-sailing proof → token resume → control proof → forged-token reject
- `server/src/__tests__/` + `client/src/__tests__/connection.test.ts:47-55` -- drop-policy unit tests; update reconnection-disabled test to enabled-with-settings

## Tasks & Acceptance

**Execution:**

- [x] `shared/src/constants.ts` -- add `CONFIG.net.reconnectGraceSeconds: 60` with derivation comment -- single source of truth
- [x] `server/src/rooms/ArenaRoom.ts` -- extract current onLeave body into one teardown fn; add `onDrop` (active-match participants → `allowReconnection(client, CONFIG.net.reconnectGraceSeconds)`, resume = no-op server-side, reject/timeout → teardown; everyone else → teardown now); verify hook signatures against installed `@colyseus/core` -- the core mechanism
- [x] `server/src/rooms/ArenaRoom.ts` -- static `onAuth` pv gate + `afterStep` JOINED guard -- deferred-work pickups riding the same join path
- [x] `client/src/net/connection.ts` -- enable auto-reconnect (explicit settings incl. retries; note `minUptime` 5000ms means drops <5s after join don't auto-resume — accepted); send `pv` -- client half of both features
- [x] `client/src/main.ts` + `client/src/net/roomBindings.ts` -- onDrop/onReconnect wiring (banner, ring clear + forceSnap); version-rejection menu message -- resume must feel seamless, not teleport-y
- [x] `server/scripts/reconnectSmoke.mjs` -- new smoke covering matrix rows 1-4 over real sockets -- the AC proof
- [x] server + client unit tests -- drop-policy decisions, teardown-once semantics, connection.test.ts update, pv gate accept/reject -- regression net for the I/O matrix

**Acceptance Criteria:**

- Given a live match with a non-consented disconnect, when the grace window is open, then the ship remains in `world.ships` under its last input, appears in other players' frames, and the win check still counts it (FR38).
- Given the disconnected client, when it auto-reconnects within grace, then resumption succeeds only via the 0.17 reconnection token, lands on the same sessionId/ship with listeners intact, and frames resume.
- Given `npm run check` and all smokes in `server/scripts/` (including the new reconnectSmoke), when run, then everything passes; `grep -r colyseus server/src/game/` stays empty.
- Given a mismatched or missing `pv`, when joinOrCreate runs, then the join is rejected with a message the menu renders; reconnects are not re-gated.

## Spec Change Log

## Review Triage Log

### 2026-07-18 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)

- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 1, medium 2, low 8)
- defer: 3: (high 0, medium 1, low 2)
- reject: 2
- addressed_findings:
  - `[high]` `[patch]` onDrop ignored the close code, so punitive kicks (rate-limit 4002, malformed messages) also earned the 60s grace — and matchMaker.reconnect bypasses onAuth, so a kicked malicious client could token-reconnect back in or stall the endgame as a headless ghost (CONFIRMED independently by Blind Hunter AND Codex) → dropPolicy gained a reconnectableClose dimension; grace now only for the SDK's own auto-reconnect close set {1001, 1005, 1006, 4010}; full 4-D policy matrix + wiring tests added
  - `[medium]` `[patch]` Match finishing during grace lost the one-shot results broadcast — a captain resuming in the results window got a DISCONNECTED dead end instead of placements → ArenaRoom caches the last ResultsMsg and re-sends it to a successfully resumed client
  - `[medium]` `[patch]` onReconnect mirrored handleSpawn incompletely (no camera snap) — a 60s-away hull meant a cross-map camera chase → pendingSnap flag consumes the first post-resume own frame and fires onOwnSpawn(x, y); tested
  - `[low]` `[patch]` connectErrorStatus keyed on a loose /version|mismatch/ regex → now discriminates on MatchMakeError.code === 525 (AUTH_FAILED) with exact-phrase fallback
  - `[low]` `[patch]` void-ed allowReconnection bet on core internals for rejection handling → .then/.catch chain with version-pinned comment (verified @colyseus/core 0.17.44)
  - `[low]` `[patch]` RECONNECTING banner displaced by M/P auto-hide toasts (single banner slot) → reconnecting flag suppresses transient toasts during an outage
  - `[low]` `[patch]` Comments misdescribed the failure route (fast-fail on refused seat vs retry exhaustion) → both routes documented in connection.ts/roomBindings.ts
  - `[low]` `[patch]` Retry-budget test (>= 16) didn't guard the derivation → test now reproduces the SDK backoff formula and asserts cumulative span ≥ grace + skew
  - `[low]` `[patch]` Spec's "replayed token" matrix row untested → reconnectSmoke replays the consumed token post-resume and asserts rejection; port-leak check now fails the smoke; SDK-internal ws access annotated
  - `[low]` `[patch]` onDrop glue untested + teardown OR-guard's silent contracts → wiring tests (hold/punitive/phase/sunk/results-resend) + assumptions comment
  - `[low]` `[patch]` Prediction keeps applying local input during an outage (diverge-then-snap) → documented as an accepted 0.2 limitation in code and tests; freeze/flag UX belongs to Epic 6.7
- Deferred: unlimited grace chaining (per-match grace budget is a game-design decision for Eric); half-resume token-rotation double-fault (degrades to pre-0.2 disconnect, no seizure); sunk-while-away client death-flow polish (killer-follow/kill-feed on resume) — all logged in deferred-work.md.
- Rejected (verified noise): stale contact ghosts after resume (last-seen rendering is the fog-of-war design and self-heals via TTL); reviewer "verified-clean" notes (not defects).

## Design Notes

- **Same-Room auto-reconnect is the whole client strategy:** welcome is onJoin-only and onJoin never re-runs on reconnect, so any fresh-Room path (page reload, `client.reconnect()`) would need welcome-resend machinery — out of scope. Consequence [known limitation, accepted]: a mid-match page reload joins as a NEW ship while the old ghost sails until grace expiry (bounded 60s); real page-reload resume is Epic 6.7.
- **Teardown-once discipline:** onDrop-then-failed-reconnection also fires `onLeave` in core (Room.ts:1750-1765) — the extracted teardown must be idempotent/guarded so the pair can't double-run recordSink or removeShip.
- **Input store survives the drop** (only `removeShip` clears it), which is exactly what holds the telegraph. Same-page resume preserves sampler seq continuity, so the strictly-increasing seq check keeps working with zero changes.
- **Autonomous rulings for Eric's morning review:** grace = 60s; grace only during active match; pv gate rejects missing pv (a stale-but-wire-compatible tab gets "refresh" — conservative by design); minimal RECONNECTING banner now, full UX in 6.7; afterStep JOINED guard pulled forward from deferred item #2 (deadline-kick half stays deferred).

## Verification

**Commands:**

- `npm run check` -- expected: lint + tsc + all tests green, all three workspaces
- `node server/scripts/reconnectSmoke.mjs` -- expected: drop/hold/resume/forged-token matrix proven over real sockets
- `node server/scripts/matchSmoke.mjs` + remaining smokes vs self-owned `HC_DEV_OPTIONS=1` server -- expected: consented-leave behavior unchanged (matchSmoke keeps its pre-existing flakiness caveat)
- `grep -rn "colyseus" server/src/game/` -- expected: no matches

## Auto Run Result

**Status:** done (2026-07-18)

**Summary:** A dropped connection is no longer a death sentence. Non-consented network drops during an active match now route through `ArenaRoom.onDrop` → `allowReconnection(client, CONFIG.net.reconnectGraceSeconds = 60)`: the ship keeps sailing under its last telegraph order as a visible, huntable participant that still counts in the win check, and all leave teardown (sunk-at-leave placement, removeShip, checkWin) is deferred to grace expiry. Resumption is authenticated solely by the Colyseus 0.17 reconnection token (nanoid, server-validated; forged AND replayed tokens proven rejected over real sockets) and lands on the same sessionId/ship with listeners intact via the SDK's same-Room auto-reconnect (re-enabled client-side, 18 retries spanning grace + skew). Grace is offered ONLY for genuine abnormal closes ({1001, 1005, 1006, 4010} — the SDK's own auto-reconnect set); punitive kicks (rate-limit 4002, malformed messages) tear down immediately. Deferred-work pickups shipped alongside: the PROTOCOL_VERSION join gate (static onAuth rejects missing/mismatched `pv` pre-seat with a "please refresh" message the menu renders; reconnects are not re-gated) and the afterStep JOINED guard (frames no longer pile into the unbounded transport buffer during handshake/reconnect-ack windows).

**Files changed:** `shared/src/constants.ts` (CONFIG.net.reconnectGraceSeconds); `server/src/game/match.ts` (pure dropPolicy with close-code dimension); `server/src/rooms/ArenaRoom.ts` (onDrop/teardown/onAuth pv gate/afterStep guard/results re-send on resume); `server/src/rooms/roomOptions.ts` (pv option + protocolVersionError); `client/src/net/connection.ts` (auto-reconnect enabled + retry derivation, pv, connectErrorStatus keyed on code 525); `client/src/net/roomBindings.ts` (onDrop/onReconnect wiring, ring clear + forceSnap + camera snap on first post-resume frame); `client/src/main.ts` (RECONNECTING banner, toast suppression while reconnecting, version-mismatch menu message); `server/scripts/*.mjs` ×8 (pv in join options); NEW `server/scripts/reconnectSmoke.mjs`, `server/src/__tests__/reconnect.test.ts` (23 tests), `client/src/__tests__/roomBindings.test.ts`; updated `client/src/__tests__/connection.test.ts`.

**Review findings breakdown:** three parallel reviewers (Blind Hunter, Edge Case Hunter, Codex cross-model challenge). 11 patches applied (1 high: punitive kicks earned grace + token walk-back — flagged independently by two models; 2 medium: lost results broadcast on resume-during-results, missing camera snap on resume; 8 low), 3 deferred to deferred-work.md (grace-chaining budget [design decision for Eric], half-resume token-rotation double-fault, sunk-while-away death-flow polish), 2 rejected as verified noise. No intent gaps, no bad_spec loopbacks.

**Verification performed:** `npm run check` exit 0 — 685 tests green (129 shared + 275 server + 281 client; +32 over baseline), lint + tsc clean all workspaces. reconnectSmoke passes over real sockets (pv rejection → live match → abnormal drop → 3.5s hold with ship sailing pilotless in the other client's view → forged token rejected → same-sessionId resume with control re-proven → replayed token rejected). All 7 other deterministic smokes pass (smoke, combat, weapons, fog, prediction vs self-owned :2611 server; zone, drones self-booting). matchSmoke failed once on "suppressed torpedo impact" — a documented pre-existing flake reproduced on the pristine baseline commit during this run (not a 0.2 regression). `grep -rn colyseus server/src/game/` clean.

**Residual risks:** (1) mid-match page reload joins as a NEW ship while the old ghost sails out its grace (accepted; real page-reload resume is Epic 6.7); (2) drops within 5s of joining don't auto-resume (SDK minUptime default, accepted); (3) matchSmoke remains an unreliable regression signal until hardened (deferred since 0.1); (4) the three deferred items above.

**Autonomous rulings for Eric's morning review:** grace = 60s (CONFIG-declared); grace only during the active phase; punitive-kick close codes get no grace; pv gate rejects MISSING pv too (stale-but-compatible tabs get "refresh" — conservative); minimal RECONNECTING banner now, full UX in 6.7; PROTOCOL_VERSION gate + afterStep guard pulled forward from deferred-work as spec'd riders on the same join path.
