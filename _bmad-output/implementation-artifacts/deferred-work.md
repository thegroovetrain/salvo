# Deferred Work

Append-only log of work items deliberately deferred by bmad-dev-auto runs.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-colyseus-0-17-upgrade.md`
  summary: PROTOCOL_VERSION has no runtime enforcement — add a join-time version check (client sends its PROTOCOL_VERSION in join options, server rejects mismatches cleanly) plus a "please refresh" UX path, so stale bundles fail with a clear rejection instead of a cryptic schema-decode error.
  evidence: Verified by both review hunters and the orchestrator — PROTOCOL_VERSION appears in no join options, no WelcomeMsg field, and no server-side gate; the gap is pre-existing (v2 was equally unenforced) but the schema-4 wire break makes stale-bundle failures certain after deploys (Render auto-deploy on push to main). Natural home: Story 0.2 (reconnect auth touches the same join path) or 6.7 (reconnection UX).

- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-colyseus-0-17-upgrade.md`
  summary: Guard against JOINING-state clients — skip frame sends to clients that haven't confirmed join (state !== JOINED) in ArenaRoom.afterStep, and add a room-clock deadline that kicks clients stuck in JOINING, so a client that never sends the join confirmation can't grow the transport's unbounded _enqueuedMessages buffer at 20Hz while squatting a playerCap roster slot.
  evidence: Adversarial review (ship pipeline) traced @colyseus/core 0.17.10 — clients.push happens before onJoin, seat-reservation timeout is already consumed at that point, the ping reaper is defeated by auto-pong, and WebSocketClient.enqueueRaw buffers unboundedly for JOINING clients. Pre-existing shape (0.16 had it too), slow growth (~0.5–1 MB/hour/socket), but it is the one live exploit path found. Natural home: Story 0.3 (operability) or a standalone hardening chore.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-colyseus-0-17-upgrade.md`
  summary: Recorded decision — Colyseus 0.17 force-disconnects (instead of log-and-drop) on unknown message types and undecodable msgpack in production; accepted for now since production clients only send registered types, but the "malformed messages are silently dropped" invariant now holds only inside game/inputs.ts (field-level validation), not at the transport. Revisit alongside the PROTOCOL_VERSION join gate so stale clients get a clean rejection rather than a transport kick.
  evidence: @colyseus/core 0.17 __no_message_handler fallback calls client.leave(WITH_ERROR) outside devMode; verified in installed package source during the ship adversarial review.

## 2026-07-17 — matchSmoke reliability hardening (from Story 0.1)

`server/scripts/matchSmoke.mjs` is timing/physics-flaky on this hardware: A/B testing showed 0/3 clean passes on the 0.16 baseline (`1f81f70`) and the same scattered-timeout taxonomy on 0.17 — torpedo-connect luck (steps 2/4) and the storm's r=90 endgame pocket letting a drone camp past the results timeout (step 5, `server/src/game/match.ts` finish check). The lifecycle itself is proven working (full results broadcast observed on 0.17). Deferred because retuning smoke timing/geometry changes test semantics — out of Story 0.1's upgrade scope. Candidate fixes: deterministic drone seeding for the smoke, longer step budgets, or a zoneOverride whose end radius clears every camping spot. Consider folding into Story 0.3 (operability) or a standalone test-hardening chore.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-2-reconnect-into-your-own-ship.md`
  summary: Grace chaining is unlimited — a player can cycle drop → 59s ghost → resume-for-a-tick → drop all match, staying functionally absent yet alive for placement; a per-match grace budget (count or cumulative seconds) is a game-design decision for Eric, natural home Epic 6.7 (reconnection UX) alongside the abandon flow.
  evidence: Blind Hunter traced that nothing counts reconnections per session; CONFIG's "bounded liability" comment is per-incident only. Metrics visibility arrives with Story 0.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-2-reconnect-into-your-own-ship.md`
  summary: Half-resume double-fault — if the socket dies between the server resolving allowReconnection and the client's JOIN_ROOM ack, the rotated reconnection token was never delivered, so the client's retries carry a stale token and fast-fail to DISCONNECTED while the ghost is held for another grace window; consider acking-aware hold policy or token-retry tolerance in Epic 6.7.
  evidence: Edge Case Hunter traced core's token rotation at reconnection resolve vs SDK token update on JOIN_ROOM ack; consequence is a failed resume degrading to pre-0.2 behavior (no seizure, no crash), hence deferred not patched.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-2-reconnect-into-your-own-ship.md`
  summary: Sunk-while-away resume skips the client's normal death moment — the missed 'sunk' event means no killer-follow spectate target, no sink feedback, no kill-feed line; a resume-into-spectate should synthesize the death-flow entry. Natural home: Epic 6.7 or Epic 5 sinking-window work.
  evidence: Edge Case Hunter verified spectate entry itself works (spec:true frames drive it) but the event-driven death UX (killerId, telegraph reset, feedback) hangs off a message the dropped client never received.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-3-server-operability-baseline.md`
  summary: The `match.abort {reason:'abandoned'}` path is unreachable through any real room flow — every dispose of an active match drives the leave cascade into `finish()` first (last human's teardown → checkWin → 0 alive humans → finish), so quit-out/abandoned matches are recorded in telemetry as `match.end` with a winnerClass and duration; whether such matches should be distinguished (e.g. an `endedBy` field or reclassification) is a game-design/telemetry decision for Eric before balance conclusions are drawn from match.end data.
  evidence: Blind Hunter traced every dispose path in @colyseus/core 0.17 (disconnect() force-closes clients before dispose; dispose requires zero clients) and the finding was live-proven by metricsSmoke's own choreography — both captains leave and stdout shows match.end winnerClass:"cruiser" rather than an abort. The 'abandoned' branch stays as defensive fallback (it fires if a tick-error abort's dispose finds the match still active).

- source_spec: `_bmad-output/implementation-artifacts/spec-0-4-portal-adapter-seam.md`
  summary: The five-method PortalAdapter seam (the epic's approved shape) omits hooks real portal SDKs demand, so Epic 7 will likely need to extend the interface — no pause/resume around ad breaks (Poki/CrazyGames require muting audio and suspending input while an ad plays), no matchStart/matchEnd pairing on mid-match disconnect (gameplayStart/gameplayStop must pair), unclear gameplay semantics during the death→spectate window, and a loadingProgress bracket that covers only the pre-menu stage load while the actually slow path (post-PLAY connect → first frame) reports nothing; whether and how to extend the seam is a design decision for Eric at Epic 7 (portals are speculative until then).
  evidence: Blind Hunter mapped the seam against documented Poki/CrazyGames SDK lifecycle requirements; acceptance criterion 4 ("only portal/ and the construction site change at Epic 7") holds for adapter implementations but not for interface extensions, so recording the likely extension points now is what keeps Epic 7 honest about scope. Mitigation already in place: safeAdapter guarantees any adapter misbehavior is contained, and all call sites are single choke points that are easy to relocate.
