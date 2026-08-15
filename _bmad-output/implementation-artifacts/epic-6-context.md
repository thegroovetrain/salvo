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

- Standard BR arms at 2 human captains, fill-or-timer (CONFIG design target), capped at 20; zero bot-fill — roving PvE fleets are world content, never roster fill. Pure quick play: no skill matching, parties, or ranked. Arena logic never forks on mode; mode is entirely a queue choice, and no code path may assume same-process room co-residency.
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
- Waiting room shows "AWAITING CAPTAINS n/2" + "WEAPONS SAFE" truthfully, full live HUD already visible; weapons fire but damage is suppressed (not a denied state). Fill-or-timer state must be visible. Countdown reads "MATCH STARTING" + big center count.
- Reconnection: dropping client shows a "RECONNECTING" banner with auto-reconnect attempts; success returns seamlessly to the live HUD. Failed reconnect (match over/sunk) routes to results or home with a plain explanation — never a dead screen.

## Cross-Story Dependencies

- Story 6.3's win predicate builds on Epic 5's lifecycle-based win predicate (Story 5.1) and the sinking/reversibility semantics — formalizes it across modes rather than introducing a new one.
- Story 6.2's roster-scaled maps must keep the Epic 3 phased storm timeline and Endgame Guarantee diameter coherent as map radius changes.
- Stories 6.4/6.5 bots reuse the exact `perception.observe()` → validated input pipeline (Epic 1/4) and full class loadouts/refit economy (Epic 2).
- Story 6.5 (Solo vs AI) depends on 6.1, 6.2, 6.3, and 6.4 landing first — it's the integration story proving the arena never forks on mode.
- Story 6.6 extends the home page from Story 1.14; Story 6.7 builds on Story 0.2's reconnection mechanics.
- AR12's batch-sim harness is shared infrastructure with Epic 2 (economy tuning) and Epic 4/NFR3 (latency harness).
