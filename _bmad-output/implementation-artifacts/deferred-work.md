# Deferred Work

Append-only log of work items deliberately deferred by bmad-dev-auto runs.

- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-colyseus-0-17-upgrade.md`
  summary: PROTOCOL_VERSION has no runtime enforcement — add a join-time version check (client sends its PROTOCOL_VERSION in join options, server rejects mismatches cleanly) plus a "please refresh" UX path, so stale bundles fail with a clear rejection instead of a cryptic schema-decode error.
  evidence: Verified by both review hunters and the orchestrator — PROTOCOL_VERSION appears in no join options, no WelcomeMsg field, and no server-side gate; the gap is pre-existing (v2 was equally unenforced) but the schema-4 wire break makes stale-bundle failures certain after deploys (Render auto-deploy on push to main). Natural home: Story 0.2 (reconnect auth touches the same join path) or 6.7 (reconnection UX).

## 2026-07-17 — matchSmoke reliability hardening (from Story 0.1)

`server/scripts/matchSmoke.mjs` is timing/physics-flaky on this hardware: A/B testing showed 0/3 clean passes on the 0.16 baseline (`1f81f70`) and the same scattered-timeout taxonomy on 0.17 — torpedo-connect luck (steps 2/4) and the storm's r=90 endgame pocket letting a drone camp past the results timeout (step 5, `server/src/game/match.ts` finish check). The lifecycle itself is proven working (full results broadcast observed on 0.17). Deferred because retuning smoke timing/geometry changes test semantics — out of Story 0.1's upgrade scope. Candidate fixes: deterministic drone seeding for the smoke, longer step budgets, or a zoneOverride whose end radius clears every camping spot. Consider folding into Story 0.3 (operability) or a standalone test-hardening chore.
