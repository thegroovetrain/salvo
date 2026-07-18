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
