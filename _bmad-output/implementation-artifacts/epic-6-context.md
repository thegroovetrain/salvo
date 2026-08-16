# Epic 6 Context: Honest Lobbies & Modes

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 6 (GDD E5) delivers two real, honest match modes on the 0.17 substrate: Standard BR (humans only, min-2 fill-or-timer, cap 20, zero bot-fill) and Solo vs AI (fills to cap with genuine combat bots). It formalizes the participants-only win check across modes, scales the ocean to the actual roster at countdown instead of a fixed size, ships combat-bot AI that can only see what `perception.observe()` reveals (structurally cheat-proof), and closes the UX loop with mode select, honest queue-liveness signaling, and a clear reconnection experience. Solo vs AI is the launch-day first match for most players — bot quality sits on the retention critical path, never as filler.

## Stories

- Story 6.1: Queue-Based Lobbies
- Story 6.2: Roster-Scaled Oceans
- Story 6.3: The Participants-Only Win Check
- Story 6.4: Combat-Bot AI
- Story 6.5: Solo vs AI Mode
- Story 6.6: Mode Select & Queue Liveness
- Story 6.7: Reconnection UX

## Requirements & Constraints

- Standard BR arms at 2 human captains, fill-or-timer, capped at 20; zero bot-fill — roving PvE fleets are world content, never roster fill. Pure quick play: no skill matching, parties, or ranked. Arena logic never forks on mode; mode is entirely a queue choice, and no code path may assume same-process room co-residency. **The timer is no longer a design target — amendment 2 sets it: 2:00 in the queue, then a 0:10 countdown in the arena, with a full lobby skipping straight to the countdown.**
- Solo vs AI fills the lobby to cap with AI combatants (reference: 1 human + 19 bots) who pick classes and personal colors like players; PvE fleets, storm, economy, and win check run identically to Standard — the arena never knows the mode.
- Map size scales from the actual roster at countdown (scaling curve = CONFIG design target) — no ghost oceans. Spawns stay outer-ring, max-min mutual distance, island-clear at every roster size (2–20); both sides rebuild the identical map from the seed. The phased storm ring timeline scales coherently with map radius down to the same Endgame Guarantee diameter (2× truesight).
- Win = last match participant afloat, counting participants only: human captains (Standard) or human + AI combatants (Solo vs AI). PvE fleet ships are never participants — can never win, never need destroying. Covers last-human-among-drones, all-participants-sinking, and same-tick draw.
- Combat bots' only world knowledge is `perception.observe()` output (same function client frames use — structurally unable to wallhack); intent enters via the same validated input pipeline as humans. Staggered ~250ms observe cadence (round-robin across ticks), cost-bounded at/below a full human lobby. Utility scoring drives hunt/position/strike/evade/storm-avoid over contacts + blips; bots use full class loadouts (arcs, specials, refit spending).
- PvE fleet drones use a cheaper threat-check tier (react to being hit or truesight proximity) — never full `observe()`, never hunting — but still ride the same input pipeline. Rule for every non-human ship: no special code paths, same perception rules as humans.
- Bot quality is measured, not felt: the batch-sim harness's third duty is bot-vs-bot evaluation scored on kill distributions, match lengths, storm deaths.
- Disconnection: ship keeps simulating under its last input, stays a huntable participant; player resumes via token-authenticated reconnection while alive/sinking; a sunk ship routes to the post-death flow. Grace window and abandon-after-timeout are CONFIG design targets with tested semantics. Other captains' mid-match disconnects are invisible beyond ship behavior — no wire field advertises a disconnected target.
- All specific numbers (min-2, cap-20, timers) are design targets/prototype reference values, explicitly tunable.

## Technical Decisions

- **D6 Lobby/Matchmaking:** Two Colyseus 0.17 QueueRooms — `StandardQueueRoom.ts`, `SoloVsAiQueueRoom.ts` — do seat reservation into arena rooms. Map seed/gen params derive from the actual roster at countdown.
- **D5 Combat-Bot AI:** Lives in `server/src/game/ai/` (`utility.ts`, `botDriver.ts`); `pveFleet.ts` holds the drone threat-check tier. Lint-enforced import boundary: `ai/` may import `perception` and `inputs` only — never `world` internals.
- **D8 Scale plumbing:** Presence/Driver constructed via config injection (memory on Render today, `@colyseus/redis-*` only at a future Colyseus Cloud move); no same-process room co-residency assumption anywhere, including the new queue layer.
- **AR2:** Adopt 0.17's automatic reconnection (token-authenticated resume), QueueRoom matchmaking, transport rate limiting, typed `/metrics` route, `room.ping()` RTT.
- **AR8 STEP_ORDER as data:** `world.step()` iterates a named array; bot-driven updates ride the existing step order, no special path.
- **AR12:** `server/scripts/batchSim.mjs` harness is triple-duty (economy tuning, load test, bot-vs-bot evaluation); a simulated-latency harness gates feel; sim-parity property tests mandatory for new shared-sim features.
- Other relevant homes: `server/src/log.ts`, `server/src/metrics.ts`; `shared/src/sim/map.ts` evolves to accept roster-scaled params; `shared/src/sim/zone.ts` phased rings scale with derived map radius; the win predicate is one predicate over lifecycle states in `match.ts` (built on Epic 5's `lifecycle.ts`).

## UX & Interaction Patterns

- Home mode pick: Solo and Solo vs AI both offered minimally (chrome grows only when more modes exist); Primary Button sub-line always states shown mode + class; pick persists in localStorage.
- Menu must surface queue liveness (player counts / wait honesty) and steer toward Solo vs AI when Standard is empty (dead-queue mitigation) — flagged as an open UX-design item, not a finished spec.
- **SUPERSEDED IN PART by amendment 1 — read that first.** The sailable weapons-safe waiting room ("AWAITING CAPTAINS n/2" + "WEAPONS SAFE", full live HUD, weapons fire with damage suppressed) is **no longer the standard-play waiting experience**: Eric ruled the queue replaces it, so captains now wait in the queue before any ocean exists. That grammar survives only for the dev/sandbox door. What still binds: fill-or-timer state must be visible and the room never lies about why it is waiting; the arena countdown still reads "MATCH STARTING" with a big center count.
- Reconnection: dropping client shows a "RECONNECTING" banner with auto-reconnect attempts; success returns seamlessly to the live HUD. Failed reconnect (match over/sunk) routes to results or home with a plain explanation — never a dead screen.

## Cross-Story Dependencies

- Story 6.3's win predicate builds on Epic 5's lifecycle-based win predicate (Story 5.1) and the sinking/reversibility semantics — formalizes it across modes rather than introducing a new one.
- Story 6.2's roster-scaled maps must keep the Epic 3 phased storm timeline and Endgame Guarantee diameter coherent as map radius changes.
- Stories 6.4/6.5 bots reuse the exact `perception.observe()` → validated input pipeline (Epic 1/4) and full class loadouts/refit economy (Epic 2).
- Story 6.5 (Solo vs AI) depends on 6.1, 6.2, 6.3, and 6.4 landing first — it's the integration story proving the arena never forks on mode.
- Story 6.6 extends the home page from Story 1.14; Story 6.7 builds on Story 0.2's reconnection mechanics.
- AR12's batch-sim harness is shared infrastructure with Epic 2 (economy tuning) and Epic 4/NFR3 (latency harness).

## Ratified Amendments (durable — survives recompiles)

The authority for these is `epic-6-context-amendments.md`, not this file. This section is a pointer
list; read the amendments file for the full text, sources and rationale. On any conflict between an
amendment and the planning-artifact-derived content above, **the amendment wins**.

- **A1 (Eric, 2026-08-14)** — the queue REPLACES the in-game weapons-safe ready room for standard
  play. Taken against the orchestrator's recommendation to keep it.
- **A2 (Eric, 2026-08-14)** — 2:00 queue timer, then a 0:10 arena countdown; a full lobby (cap 20)
  skips straight to the countdown. `queueTimerMs` 120000 (new), `countdown` 15000→10000,
  `joinWindow` 30000→0. Retires the arena's gathering phase in production and settles the
  full-room early-arm question the join-window spec deferred to Epic 6.
- **A3 (Eric, 2026-08-14)** — the 2:00 clock arms at the SECOND captain and is a hard deadline that
  no later join, leave or rejoin ever extends. Resolves the hostage-cycling entry at
  `deferred-work.md:319`.
- **A4 (Eric, 2026-08-14)** — a lone captain waits indefinitely and the queue reports it honestly
  (no countdown that cannot fire). Known cost until Story 6.5 ships Solo vs AI.
- **A5 (orchestrator, verified against @colyseus/core 0.17.10)** — seat reservation never calls
  `onAuth`, so the `PROTOCOL_VERSION` gate and the Story 0.3 JOINING-deadline guard both move to the
  queue's door; `ArenaRoom.onAuth` consequently becomes the right place to close the arena's public
  door behind `HC_DEV_OPTIONS`.
- **A6 (orchestrator)** — `PROTOCOL_VERSION` stays 36; the arena wire contract is untouched and the
  new channels ride the queue room only.
- **A7 (orchestrator)** — corrects `deferred-work.md:365`: the lobby-convergence complaint was caused
  by the 45 s hard deadline, not by room topology. A queue does not fix it by existing; the timer is
  the lever.
- **A19 (Eric, 2026-08-16)** — the boarding placement IS the match spawn; the countdown→active
  re-roll (measured: 20/20 captains, median ~2140u) is a defect against A8 point 3 and Story 6-1's
  own AC. Gated to queue-formed rooms; the dev/sandbox re-roll is untouched.
- **A20 (Eric, 2026-08-16)** — `SPAWN_CANDIDATES` derives from `CONFIG.map.playerCap` AND the lattice
  phase is drawn once per World: 20 hulls in 32 per-call-rotated lattices put a pair inside the 660u
  radar range in 100% of full lobbies. BOTH halves are required — the count alone measurably changes
  nothing. Even spacing at 700.8u, but only a ~6% margin, and the ring is saturated at cap 20, so
  teams reopen the map-size question A11 left the curve in place for.
- **A21 (Eric, 2026-08-16)** — a hull's radar sweep starts at its HEADING. Story 6-1's radar freeze
  had phase-locked every captain's sweep at 0, making first-detection a function of world position.
  Chosen over randomizing: it does not equalize timing, it makes the formation rotationally
  symmetric.
