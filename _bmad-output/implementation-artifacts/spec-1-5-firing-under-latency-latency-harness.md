---
title: 'Story 1.5: Firing Under Latency (D1) + Latency Harness'
type: 'feature'
created: '2026-07-21'
status: 'in-progress'
baseline_revision: '4c18e03ecbc6eda14df09bfd8ac576d3740f66f4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** A shot today spawns when the fire input arrives — a 150 ms captain eats a full input-delay penalty on every trigger pull (their shell launches ~RTT late and bursts late), and nothing measures whether gunnery "feel" survives real latency: there is no RTT measurement, no client fire timestamp, and no harness — the NFR3 gate ("hit-registration agreement %, prediction-error bounds on a simulated ~150 ms harness — never localhost feel") cannot even be evaluated.

**Approach:** Land D1 (AR3, ratified in `game-architecture.md` §"D1 — Firing Under Latency"): fire commands carry a client timestamp on the server-clock estimate; the server clamps the claimed latency to `min(claimed, measured RTT + jitter allowance)`, never earlier than the previous input, hard ceiling 150 ms; the projectile spawns back-dated along its trajectory (pre-stepped through the normal swept-collision path against LIVE server state — no victim rewind, ever); torpedoes/mines follow the same spawn rule. Build `server/scripts/latencyHarness.mjs` (~150 ms + jitter + loss over real sockets) that drives full flows and reports the NFR3 metrics. Wire contract changes → PROTOCOL_VERSION 5→6.

## Boundaries & Constraints

**Always:**
- **AR3 verbatim law:** clamp = `min(claimed, server-measured RTT + jitter allowance)`, never earlier than the previous input, hard ceiling 150 ms — a client claiming more latency than it has gets its *measured* reality (claim-the-cap = free shell speed is closed by construction). Hits ALWAYS resolve against live server state — no victim rewind, ever (the Narrow Escape behind an island can never be retroactively undone). Tick stays 20 Hz.
- **RTT mechanism substitution (flag for Eric in PR):** AR2/AC assume `room.ping()`; Colyseus 0.17.44 exposes NO ping/RTT API (verified against `@colyseus/core` `Room.d.ts` — `pingInterval` is a dead-socket keepalive, not surfaced). Implement an app-level ping: server → client `MSG.ping 'p'` `{n, t}` on an interval, client echoes `{n}` immediately, server computes RTT (windowed-min + jitter allowance = the clamp bound). Same "server-measured reality" intent; mechanism documented, not silently swapped.
- **Wire (PV 5→6):** `InputMsg` gains `fireT: number` — the client's `serverNow()` estimate captured at pointerdown of the most recent click; `fireT = 0` is the explicit "no claim" sentinel → zero compensation. Finite-checked in `inputs.ts` (malformed → whole message dropped, existing law). New `'p'` ping channel. NO new fields on any spatial event: the back-dated spawn rides the EXISTING `BallisticEvent.t` (= back-dated `bornAt`; client dead-reckoning `pos=(x,y)+v·(serverNow−t)` renders it for free). Range/target/launch-derivable wire fields remain forbidden.
- **Back-date = pre-step, not teleport:** at spawn, advance the projectile by the validated compensation in ≤50 ms sub-steps via shared `stepShell` against current `aliveHulls()` + islands + map edge, routing any non-travel outcome through the exact same resolve path as `stepShells` (burst/hitShip/hitIsland/expired all possible on spawn tick). `bornAt` = validated fire time.
- **"Never earlier than the previous input":** validated fire time ≥ the server time at which that client's previous (distinct-seq) input was applied, and ≥ the previous accepted fire time (monotonic) — intent history cannot be reordered.
- **Mines:** same spawn rule expressed as `armedAt = validatedFireT + armDelay` (drop point unchanged; negligible at a 3000 ms arm delay, but the law is uniform). Torpedoes: back-dated `bornAt` + pre-step, identical to shells; FR7 self-hit immunity laws untouched.
- **CONFIG (shared, single source):** ceiling `150` ms is RATIFIED (AR3). PROPOSED tunables (flag for Eric in PR): `fireJitterAllowanceMs: 30`, `pingIntervalMs: 1000`, `rttWindowMs: 10000`. All live under `CONFIG.net`.
- **World stays Colyseus-free:** `ArenaRoom` owns the ping loop and pushes per-client RTT into `World` (setter); no measurement → RTT 0 → zero compensation (conservative; also covers drones, which never fire).
- **Harness (`server/scripts/latencyHarness.mjs`):** self-booting on the `zoneSmoke.mjs` pattern (own scratch port, `HC_DEV_OPTIONS=1`), two scripted clients over real `@colyseus/sdk` sockets with a latency shim at the SDK boundary (per-direction delay = RTT/2 ± jitter, drop % on the coalescable `'i'`/`'f'` channels — latest-wins/interp recover by design). Runs an A/B (compensation honest vs `fireT:0`) and reports: **hit-registration agreement %** (shooter clicks the target's client-rendered position; agreement = shots whose victim client receives `dmg` within flight time + slack ÷ shots taken) and **prediction-error bounds** (mean/p95/max own-ship predicted-vs-acked pose error, `predictionSmoke.mjs` technique). Metrics are REPORTED as the gate; any pass/fail thresholds printed are ADVISORY and marked PROPOSED — Eric owns gate numbers. Deterministic water: pin the map via a new `HC_DEV_OPTIONS`-gated `mapSeed` room option (sanitized int; also the ledger's named fix candidate for the combatSmoke seed flake).
- Shared-sim purity (no `Math.random()`/`Date.now()` in sim; harness RNG seeded), complexity ≤ 10, `frames.ts` sole spatial chokepoint, contacts/events exclusively from `perception.observe()`, perception invariant suites stay green (no new signal rows expected).
- Golden-frames fixture regenerated deliberately in the same PR as the PV6 bump; all 10 existing `server/scripts/*.mjs` smokes gain `fireT: 0`; drone `buildInput` gains `fireT: 0`.
- Eric directive: route implementation-agent model selection via `/orchestrate` by task complexity (as in 1.3/1.4).

**Block If:**
- The back-dated spawn cannot resolve hits without rewinding or interpolating any victim/hull state to a past time (would violate "no victim rewind, ever").
- The clamp cannot be enforced with server-measured RTT (e.g. the app-level ping proves unable to bound the claim) — do not ship an unclamped client-trusted timestamp.
- Reporting the harness metrics would require adding range/target/launch-derivable fields to any wire event.

**Never:**
- No muzzle-flash masking or client-side fire/muzzle prediction (Epic 4 tie-in); no hotbar/Q-E-R-F scheme (Epic 2); no hull-aware perception (own deferred story).
- No retuning of `shellSpeed`, gun numbers, or any combat balance — the harness MEASURES for Eric's tuning pass (shellSpeed 130 vs 650 u range is a flagged 1.4 residual; report, don't fix).
- No changes to torpedo/mine combat behavior (arcs, damage, reload, caps, drop points) beyond the spawn-timestamp rule.
- No hard-coded pass/fail gate numbers presented as ratified; no gameplay values in CLIENT_CONFIG; no edits to DESIGN.md/EXPERIENCE.md; no real-network dependence in `npm run check` (the harness is an operator script like the other smokes, not a vitest suite).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Honest 150 ms captain | `fireT = now−150`, measured RTT ≈ 150 | Compensation ≈ min(150, RTT+30, 150); shell `bornAt = now−comp`, pre-stepped ~comp along trajectory | No error |
| Claim-the-cap liar | `fireT = now−150`, measured RTT 40 | Compensation clamped to 40+30=70 ms — measured reality wins | No error |
| No claim / legacy driver | `fireT = 0` (smokes, drones) | Zero compensation; spawn exactly as today | No error |
| Future/absurd claim | `fireT > now` | Compensation clamped to 0 | No error |
| Back-date reaches target | Click ≤ comp·shellSpeed from muzzle | Pre-step bursts on the spawn tick via normal resolve path (dmg per victim, burst event) | No error |
| Narrow Escape | Victim's hull now behind an island; claimed fire time predates the dodge | Pre-step swept path hits the island (live state) — no rewind kill | No error |
| Reordering attempt | `fireT` earlier than previous input's applied time or previous accepted fireT | Fire time floored to that bound | No error |
| Malformed fireT | NaN / missing / negative | Whole message dropped (existing sanitize law) | Silent drop |
| Ping echo | Server `{n,t}` → client echoes `{n}` | Server RTT sample; windowed-min updates clamp bound | Unknown/stale nonce ignored |
| No RTT yet | Fire before first echo lands | RTT 0 → zero compensation | No error |
| Torpedo under latency | Primed slot 1 fire, comp 120 ms | `bornAt` back-dated + pre-step; owner grace/self-hit laws hold | No error |
| Mine under latency | Primed slot 2 fire, comp 120 ms | `armedAt = fireT + armDelay` (arms ≤150 ms sooner) | No error |
| Harness A/B | 150±30 ms, 2% loss, honest vs `fireT:0` | Structured metrics block; agreement % higher with compensation; nonzero exit only on structural failure | Timeout/disconnect → nonzero exit |
| Stale client | Join with pv 5 | Rejected by protocol gate | Join error, as today |

</intent-contract>

## Code Map

- `shared/src/types.ts:11-17,40-67` -- `MSG.ping: 'p'`; `InputMsg.fireT` (+ doc: 0-sentinel, back-date budget); ping payload types.
- `shared/src/index.ts:13` -- PROTOCOL_VERSION 6.
- `shared/src/constants.ts:250-275` -- `CONFIG.net` additions: `fireBackdateCeilingMs: 150` (ratified), `fireJitterAllowanceMs: 30`, `pingIntervalMs: 1000`, `rttWindowMs: 10000` (PROPOSED).
- `server/src/game/inputs.ts:27,77-93` -- `fireT` finite-check (≥0) in `sanitizeInput`; new pure `clampFireTime({claimed, now, rttMs, jitterMs, ceilingMs, prevInputAt, prevFireT})` exported here (AR ownership: "fire-timestamp clamping lands in inputs.ts").
- `server/src/game/world.ts:122-131,503-511,694-745` -- `ShipRecord` gains `rttMs`, `prevInputAt`, `lastFireT`; `applyInputs` stamps `prevInputAt` on seq advance; `fireControl` computes validated fire time on click edge and passes it via `activationContext` (`ctx.fireT`); `spawnBallistic` pre-steps by `now − fireT` in ≤50 ms sub-steps, reusing the `stepShells` outcome handling (`world.ts:596-599`) verbatim; `setRtt(id, ms)` setter.
- `server/src/game/equipment/ballistics.ts:107-132` -- `makeBallistic` takes the validated fire time as `bornAt` (callers pass `ctx.fireT`).
- `server/src/game/equipment/guns.ts / torpedoes.ts / mines.ts` -- thread `ctx.fireT` (guns/torps → `bornAt`; mines → `armedAt = fireT + armDelay`).
- `server/src/rooms/ArenaRoom.ts` -- ping loop per client (interval from CONFIG), nonce bookkeeping, RTT windowed-min estimator (extract pure `RttEstimator` into `server/src/game/rtt.ts` for unit tests), `world.setRtt` push; cleanup on leave.
- `server/src/rooms/roomOptions.ts` -- `mapSeed` dev option: sanitized integer, honored only under `HC_DEV_OPTIONS=1`.
- `server/scripts/latencyHarness.mjs` -- NEW: self-boot (zoneSmoke pattern, scratch port), latency/jitter/loss shim over the SDK boundary, seeded RNG, shooter + mover clients, A/B run, metrics block (hit-registration agreement %, prediction-error mean/p95/max), PROPOSED-advisory thresholds, structural-failure exit codes.
- `server/scripts/*.mjs` (10 existing) -- add `fireT: 0` to every input literal.
- `server/src/game/drones.ts:121-128` -- `buildInput` gains `fireT: 0`.
- `client/src/net/clock.ts` -- unchanged (API already sufficient: `serverNow()`).
- `client/src/input/mouse.ts:40-42` -- capture `serverNow()` at pointerdown (`nowServer` injected); expose `lastClickT`.
- `client/src/sim/inputSampler.ts:16-21,52-62,103-110` -- `Aiming.fireT`; `buildInput` threads it; `sendNeutralNow` threads it (both send paths).
- `client/src/main.ts:527,850-869` -- wire `mouse.lastClickT` → sampler; inject clock into `MouseInput`.
- `client/src/net/roomBindings.ts` / `connection.ts` -- register `'p'` handler: echo `{n}` immediately on receipt.
- Tests: server `inputs.test.ts` (fireT sanitize + full clamp table incl. liar/sentinel/future/monotonic/ceiling), `rtt.test.ts` (estimator), new back-date suite in `combat.test.ts`/`world.test.ts` (pre-step position, spawn-tick burst, Narrow-Escape island block, torpedo bornAt, mine armedAt, respawn/state reset), `roomOptions.test.ts` (mapSeed gating), `goldenFrames` deliberate regen, smoke re-key; shared `barrel.test.ts` (PV6); client `mouse.test.ts` (click-time capture, injected clock), `inputSampler.test.ts` (fireT both paths), `roomBindings.test.ts` (ping echo).

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/` (types, index, constants) -- fireT + ping channel + PV6 + CONFIG.net tunables -- the wire contract both sides share.
- [x] `server/src/game/` (inputs, world, equipment/*, rtt, drones) + `rooms/` (ArenaRoom, roomOptions) -- clamp law, RTT measurement, back-dated pre-step spawn through live-state resolve, mapSeed dev option -- authoritative D1 complete, unit-tested against the full I/O matrix.
- [x] `client/src/` (input/mouse, sim/inputSampler, main, net/roomBindings|connection) -- click-time capture on the server-clock estimate, fireT on both send paths, ping echo -- honest timestamps end-to-end.
- [x] `server/scripts/latencyHarness.mjs` + 10 smoke re-keys -- the NFR3 harness with A/B + metrics -- the story's acceptance gate exists and runs.
- [x] Test sweep -- suites above + golden-frames regen (same PR as PV6) -- `npm run check` green.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-5-firing-under-latency-latency-harness` status transition at completion.

**Acceptance Criteria:**
- Given a fire command carrying a client timestamp, when `inputs.ts` validates it, then the timestamp is clamped to `min(claimed, server-measured RTT + jitter allowance)`, never earlier than the previous input, hard ceiling 150 ms — and a client claiming more latency than measured gets its measured reality (unit-tested liar case).
- Given a validated fire time, when the projectile spawns, then it is back-dated along its trajectory via the shared swept-collision step against live server state — a victim that moved behind cover since the claimed time is never rewound into a hit.
- Given torpedoes and mines, when fired under latency, then they follow the same spawn rule (back-dated `bornAt` / `armedAt`) with no change to their combat behavior.
- Given `latencyHarness.mjs` at ~150 ms + jitter + loss, when it drives the A/B flow, then it reports hit-registration agreement % and prediction-error bounds as a structured block, compensation measurably improves agreement, and no threshold is presented as ratified.
- Given the wire change, when a pv-5 client joins, then it is rejected at matchmake; golden frames regenerate deliberately in the same PR.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces with no real-network dependence.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why pre-step instead of spawn-then-fast-forward on next tick:** `fireControl` runs after `stepShells`, so a fresh shell is otherwise first stepped 50 ms later with `bornAt = now` — the compensation must be applied at spawn, through the same outcome handling, or the first sub-tick's collisions are skipped and `BallisticEvent.t` lies to the client's dead-reckoner.
- **`fireT` is per-click, captured at pointerdown** (not sample time): a click can sit ~50 ms in the sampler; pointerdown capture is the honest instant. Multiple clicks per tick collapse to one shot (existing counter model) — one timestamp per tick is consistent.
- **RTT bound uses windowed-MIN + jitter allowance** (mirrors `clock.ts` rolling-min philosophy): min RTT is the provable floor of the client's real latency; granting `min + jitter` compensates honest jitter without letting a throttling client bank compensation.
- **`fireT = 0` sentinel** keeps every existing driver (10 smokes, drones, tests) valid with one added field and makes "no compensation" an explicit, testable state rather than an accident of clock values.
- **Harness measures, Eric gates:** NFR3 names the metrics but no ratified thresholds exist anywhere in planning. Printing PROPOSED advisories (e.g. "agreement ≥ 90%") keeps the gate human. The A/B (honest vs `fireT:0`) is what makes the number meaningful — it isolates D1's effect from aim-bot quality.
- **`mapSeed` dev option** serves harness determinism AND is the deferred-work ledger's named candidate fix for the combatSmoke seed flake — same gated, sanitized pattern as `matchOverride`/`zoneOverride`. Converting combatSmoke itself to use it is a follow-up, not this story.
- Eric directive for implementation: route model selection for implementation agents via `/orchestrate` (task-complexity-based), as in 1.3/1.4.

## Verification

**Commands:**
- `npm test -w server` -- expected: green incl. clamp table, RTT estimator, back-date suite (spawn-tick burst, Narrow Escape, torp/mine rules), mapSeed gating, deliberate golden-frames regen.
- `npm test -w shared` -- expected: green incl. PV6 barrel pin.
- `npm test -w client` -- expected: green incl. click-time capture, fireT threading, ping echo.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.
- `node server/scripts/latencyHarness.mjs` -- expected: boots scratch server, runs A/B at ~150 ms ± jitter + loss, prints metrics block (agreement % with > without compensation; prediction-error mean/p95/max), exit 0.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): fire while artificially throttled (browser devtools) — shell should appear back-dated (slightly ahead of muzzle) and burst timing should feel un-delayed; prime torpedo/mine and confirm unchanged behavior.
