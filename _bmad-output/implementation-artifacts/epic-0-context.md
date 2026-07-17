# Epic 0 Context: Stable Ground (Colyseus 0.17 Foundation)

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Move the game onto a current, supported networking layer and lay the operational foundations every later epic builds on. Concretely: upgrade Colyseus 0.16 → 0.17 (the mandated "work item #0" — doing it first avoids redoing the adapter against 0.17 later), add token-authenticated mid-match reconnection so a wifi hiccup on school-grade networks isn't a death sentence, stand up structured logging + a `/metrics` route + a contained tick-error boundary so a broken match is a diagnosable bug report instead of a silent hang, and install the portal-adapter seam as a null implementation now so portal SDKs slot in at Epic 7 without a retrofit. The Track-2 hosting move (Colyseus Cloud, Redis Presence/Driver, static client hosting) is explicitly NOT in this epic — it is trigger-based, deferred to "before the first public/stranger link" at Eric's call. Render stays fine for friends-scale playtests throughout.

## Stories

- Story 0.1: Colyseus 0.17 Upgrade
- Story 0.2: Reconnect Into Your Own Ship
- Story 0.3: Server Operability Baseline
- Story 0.4: Portal Adapter Seam (Null Implementation)

## Requirements & Constraints

- **The upgrade is contained to the adapter layer.** `World` and `Match` must stay untouched with zero Colyseus imports; the migration touches only the room/adapter code. Acceptance is `npm run check` green across all workspaces plus every headless smoke in `server/scripts/` completing over real sockets, and a full local match (join → countdown → live → win) playing end-to-end.
- **Transport-level input rate limiting** (`maxMessagesPerSecond`) is enabled with a CONFIG-declared limit tuned so normal play — including held rudder and rapid fire — never trips it.
- **Reconnection is a live-ship resume, not a pause.** On disconnect the ship keeps being simulated under its last input (set-and-forget telegraph keeps its heading/throttle; it does not freeze), stays a visible/huntable participant, and still counts toward the win check while its lifecycle is `alive` or `sinking`. A disconnected ship is a vulnerable target that can be hunted and killed while its captain is away.
- **Resumption must be authenticated by the 0.17 reconnection token** — a guessable or replayable session id can never seize a ship. Rationale: without token auth, "hunt a disconnected captain" would silently include *becoming* one. On success the player resumes the same ship with state listeners intact. If the ship reached `sunk` while away, reconnect routes into the normal post-death flow (reveal → results).
- **Structured stdout logging only** — format `level event {fields}`, every server line carrying `matchId`/`roomId`/`tick` context; no files, no third-party service at beta. Hot-path law: nothing logs inside per-tick/per-frame loops except throttled aggregates (e.g. once-per-second tick-duration summaries); one `info` line per match lifecycle event. Zero PII (no player DB at beta).
- **Match telemetry lines:** `match.end { matchId, mode, rosterSize, rosterByClass, durationS, winnerClass, killsByClass, stormDeaths }` and `match.abort { matchId, reason, tick }` (abort lines exist so disposed matches don't create survivorship bias in balance data).
- **Tick-error containment:** errors inside `World.step()` are caught at the room's tick boundary, logged with context; at `HC_TICK_ERROR_TOLERANCE` consecutive failures (default 1 in dev/friend builds, 3 in public) the room disposes gracefully (players → banner → menu) while the process and all other rooms survive.
- **`/metrics`** is a 0.17 typed HTTP route returning room/player counts, tick-duration p50/p95/max, and message rates.
- **Portal seam:** every loading and match-start/end moment routes through a `PortalAdapter` interface (`init`, `loadingProgress`, `matchStart`, `matchEnd`, `requestAdBreak`) backed by `nullAdapter.ts`; the death→requeue flow calls `requestAdBreak()` (a no-op today). No game code imports any portal SDK directly — the seam is the rule.
- **Scale-out posture (constraints now, infrastructure later):** no single-process assumptions; Presence/Driver stays injectable (memory now, Redis-as-config later). Each World owns its own clock — scale-out is always more Worlds, never a shared one. Do not enable Render autoscaling.

## Technical Decisions

- **New server homes:** `server/src/log.ts` (structured logger), `server/src/metrics.ts` (`/metrics` payload assembly). The tick-error boundary lives in `ArenaRoom.ts` (still a thin adapter). Client gains a `portal/` home (adapter interface + null impl).
- **0.17 capabilities being adopted here:** automatic reconnection (feeds Story 0.2's token-authenticated resume), `maxMessagesPerSecond` rate limiting, and typed HTTP routes (for `/metrics`). QueueRoom matchmaking and `room.ping()` RTT exist in 0.17 but are consumed by later epics (6 and 1 respectively), not Epic 0.
- **Env config:** `HC_TICK_ERROR_TOLERANCE` is the env knob for the failure threshold; `HC_DEBUG=1` gates server `debug` logs. Anything client-supplied still passes `sanitizeRoomOptions()`.
- **No event bus** — server systems communicate through the tick's explicit step order and per-tick event arrays; the client keeps one-way data flow (net → sim → render). This absence is a deliberate decision; do not introduce pub/sub.
- **Roster-only schema law stands:** Colyseus schema syncs the roster only; all spatial state travels in per-client frames. `PROTOCOL_VERSION` gates any wire-contract change.

## Cross-Story Dependencies

- Story 0.1 (the 0.17 upgrade) is the first thing built and unblocks everything else in this epic and all later epics.
- Story 0.2's token-authenticated reconnection depends on the 0.17 reconnection primitive delivered in 0.1. Full reconnection UX (grace window, "RECONNECTING" banner, abandon-after-timeout for a never-returning captain) is deferred to Epic 6 — Story 0.2 delivers the mechanism, not the polished UX.
- Story 0.4's seam is a forward dependency for Epic 7 (where real Poki/CrazyGames SDKs land behind the same interface); installing it now is the whole point.
