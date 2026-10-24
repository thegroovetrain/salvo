---
title: 'Story 9.15: Smoke Flakes Fixed'
type: 'test-infrastructure'
created: '2026-10-22'
status: 'review'
baseline_revision: '8f05716f'
final_revision: 'd0001d9d (code HEAD; docs commit follows; PR to development, 2026-10-22)'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/9-15-smoke-flakes-fixed.md'
---

## Intent

**Problem:** `matchSmoke.mjs` and `weaponsSmoke.mjs` — the project's end-to-end layer — were piloting-flaky for a year (retries in 8-1/8-2/8-3, pass on run 4 in 8-14, four reds in 8-16 including on the untouched baseline, skipped in 8-17/8-18), against the Epic 7 "a flake is P1" agreement. Each smoke carried its own heuristic pilot (racetrack strafing, island-avoidance rudder bias, rendezvous-to-midpoint, station keeping, nearest-mine chase) over a RANDOM map, with two captains spawning ~8,000 u apart on the 4,000 u ring, the first PvE fleet wave (96 omniscient hulls) arriving 60 s into every damage-on phase, and 9.6's passive regen racing every single-tube kill.

**Approach (Eric's four rulings, 2026-10-22):** a smoke PLACES, it does not sail. Two dev-only room options behind the existing `HC_DEV_OPTIONS=1` gate — a per-captain spawn pose and a fleet-waves-off switch — plus the `mapSeed` and `fitOverride` options that already existed, turn both smokes into scripted scenarios: fixed map (seed 265), fixed poses, scripted inputs on the ordinary `i` channel every tick, kill plans and budgets derived at run time from CONFIG and `effectiveStats` including regen, assertions that name a contract. Scope: matchSmoke + weaponsSmoke + the fogSmoke shell-reveal one-liner; the smokes stay outside `npm run check` but are required first-try before every PR.

## What changed

### The dev door (`server/src`)

- `spawnOverride: { x, y, heading }` — a per-join dev option (`JoinOptions` → `SanitizedRoomOptions.spawnOverride`), honored only inside `sanitizeRoomOptions`' `devEnabled` branch, otherwise stripped and reported in `rejectedKeys` like `fitOverride`. Sanitizer: all three finite, `hypot(x, y) <= mapRadius(CONFIG.map.playerCap)`, heading wrapped; a malformed pose under dev is dropped AND reported. Stored as `ShipRecord.devPose` (captains only). `World.placement(id, pose, pick)` honors it at every placement edge — `addShip`, the countdown→active `redeployShip`, `respawn` — after validating it with the spawn picker's own predicate (`isSpawnClear(map, p)`: inside `map.radius − SPAWN_ISLAND_CLEARANCE` and island-clear); an invalid pose logs `dev.poseRejected { id, x, y }` once per placement and takes the shipped pick, so the island-clear-by-construction induction of `resolveShipPose` still holds. Overlap of two posed hulls is the script's responsibility (documented). Never touches hp, ammo or fit; nothing reaches the wire.
- `matchOverride.fleetWaves?: boolean` — `false` makes `spawnFleetWaves()` a no-op via `WorldOptions.fleetWaves`, read from the sanitized room-create bag (sandbox rooms included). Absent/true is byte-identical to before (goldenFrames unchanged).
- Tests: `roomOptions.test.ts` +7 (honor, wrap, strip + report, malformed shapes dropped + reported, disc edge, no noise when absent, `fleetWaves` rides matchOverride); `devPose.test.ts` (new, 10): pose at spawn / redeploy / respawn, unposed hull still on the ring, captain-only, island pose and off-map pose fall back + log (both red without the check — mutation-verified), valid pose logs nothing, fleet switch off/on; `spawn.test.ts` +3 (`isSpawnClear`); `operability.test.ts` +1 (`resolveDevJoin`). Server 2768 → 2789.

### The smokes (`server/scripts`)

- **matchSmoke** (637 → ~600 lines): self-boots on 2599 as before. Poses: B `{0,0,0}`, A `{−300,0,0}` (3 hull lengths), both inside the center disc with a clear lane asserted via `islandBlocksSegment` (a failed geometry check prints `MATCH SMOKE SCRIPT BUG`, never `FAILED`). Fit: the fewest `heavyTorpedo` cards that give two tubes (tier III today). Kill plan replayed at 50 ms from CONFIG + `effectiveStats`: blow = floor(damage × armor curve), reload pool one round per reload, regen on missing hull after the wait → printed in the trace (today: 4 fish in 3 salvos, sim sink 56.8 s; budget 108 s; countdown 34.7 s; storm-free 315 s checked against `zoneRingRadii`). Every pilot deleted. Kept: all lifecycle contracts (gathering window, lock, DELTA bounced, re-armed deadline, redeploy at full hp with tubes refilled, spec-frame anti-cheat, winner/placement/captains-only/dense partition/roster oracle, autoDispose). New: the redeploy is WITNESSED by own `spawn` events (the pose check is only "did not drift"); the sinking-window hold is MEASURED in server time (first spec frame − own sunk ≥ `sinkingWindowMs` − one tick; results no earlier than the first spec frame); fish count is two-sided (≥ ceil(hp / blow), ≤ plan); server-observed values (seed, pose, cards, tubes, hp) are asserts; step-1 waits are `runUntil` polls; `p` registered as a no-op; trace printed on failure.
- **weaponsSmoke** (663 → ~650 lines): eight scripted scenarios in eight fresh rooms (`create` + `joinById`), each join carrying seed 265, `{ sandbox: true, fleetWaves: false }`, the sandbox zone, `fitOverride`, `cls`, a pose. Heavy torpedo (tier III, 4 × 112 → sink in 57.4 s of an 85.3 s budget); mines (stationary layer fanning drops astern, observer posed inside detect — six live at once in 60 s of 108 s; the observer-never-beyond-detect pin was deleted at the gate as vacuous by construction); ambush (victim posed at detect + 100 u sails straight onto the mine; first sighting 499 u ≤ detect + 1 is the fog crossing; 90 dmg + boom); light torpedo (target on the port beam, tier III, 4 × 100 → 48.8 s of 72.5 s); captive (trip ring 120 u, 90 dmg, mine expended); three guns at 0.8 × fullFrac × tier-I range (deck gun 8 ×2, MG 5 ×2 as a level with `fireSeq === 0`, flak 16; family `w` on every reveal). The torpedo∩blip pin was deleted at the gate: return events carry no id (vacuous), and since amendment 196 a fish's water paints while the fish stays silent — the contract is `perception.test.ts`. Blows go through the armor curve. Geometry = PRECONDITION (`WEAPONS SMOKE SCRIPT BUG`), server values = assert.
- **fogSmoke**: the shell-reveal assertion measures against the observer pose snapshotted on the reveal tick (`seenAt`) — the ledger `:343` fix. Its own radar-band park phase is still a heuristic sail and was red on the one run taken (9.16, new ledger entry).

## Review Triage Log

### 2026-10-22 — Gate (Fable hunter ×2 + Codex gpt-5.6-sol, per diff)

Door: Fable BUILD-ON-IT (trust boundary closed on the queue, trusted-ticket, solo and reconnect paths; no wire leak; no reset dropped; tests real). Codex FIX-FIRST: an invalid pose honored as-is (CONFIRMED). Both flagged it (Fable as PLAUSIBLE) → fixed: World validation + fallback + log, mutation-checked. Fable's hardening (sanitizer disc = `mapRadius(playerCap)`) applied.

Scripts: Codex FIX-FIRST — (1) torpedo∩blip vacuous (CONFIRMED by reading the return-event shape; Fable disagreed, calling it non-vacuous; the code and amendment 196 settle it for Codex) → deleted; (2) sinking window claimed not measured → measured in server time; (3) server values labeled SCRIPT BUG → asserts. Fable FIX-FIRST small — (C1) observer-never-beyond-detect vacuous by its own precondition → deleted, ambush is the fog crossing; (C2) step 3 no longer witnessed the redeploy → own `spawn` events; (P1) armor curve missing from weapons oracles → applied; (P2) hp parity as precondition → assert; (P3) fixed sleeps → polls. Fable also judged the fogSmoke snapshot the RIGHT oracle (`ctx.you` is set before the events loop, so `seenAt` is the reveal-tick pose; it cannot mask a leak). Both: no residual flake source; the kill-plan margins (one reload per torpedo phase, ~48 s mines, ~15 s ambush) and the rate cap / seq / input shape check out. Wall-clock budgets vs tick cadence remain the one PLAUSIBLE residual (a stalled process could burn a budget without ticks advancing); every budget carries at least one full reload of slack, and the sinking hold is measured in server time.

## Verification

All on `d0001d9d`, 2026-10-22, quiet MacBook, sequential, each run a fresh server boot, nothing re-run to get green.

| Smoke | Run | Exit | Wall | Trace headline |
|---|---|---|---|---|
| matchSmoke (self-boot 2599) | 1 | 0 | 110 s (`wallMs` 108834) | plan 4 fish in 3 salvos · weapons safe: 1 boom, 0 hp · redeployed (own spawn events) at the dev poses, 2 tubes · B sunk by A on 4 fish of 112 (min 3, plan 4) · B held 5000 ms of server time (≥ 4950) before 5 spec frames · winner ALPHA 1st, B 2 of 2, captains only, dense · disconnected 4000/4000 after ~3000 ms |
| matchSmoke | 2 | 0 | 110 s (109561) | identical |
| matchSmoke | 3 | 0 | 111 s (109599) | identical |
| weaponsSmoke (own server 2699) | 1 | 0 | 216 s (trace 214.9 s) | torpedo B sank 57.4 s (budget 85.3), 4 × 112, kill 1 · mines 6 live in 60.0 s (budget 108) · ambush 600 u in 13.4 s, 300→210, boom, first seen 499 u · light LT-B sank 48.8 s (budget 72.5), 4 × 100 · captive 300→210 in 12.6 s · deckGun 8 ×2 w=cannon · machineGun 5 ×2 w=mg, fireSeq 0 · flak 16 w=flak |
| weaponsSmoke | 2 | 0 | 217 s (214.9 s) | identical (fresh boot, server pid 78540, 0 EADDRINUSE lines, port freed) |
| weaponsSmoke | 3 | 0 | 216 s (214.9 s) | identical (fresh boot, server pid 83685, 0 EADDRINUSE lines, port freed) |

Honesty note: the first series' weaponsSmoke runs 2 and 3 (216 / 215 s, both OK) ran against run 1's server because my runner killed the tsx wrapper and not its node child (the run-2/3 boots hit EADDRINUSE). Those two are NOT counted; the orphans were killed and runs 2 and 3 above were re-done on fresh boots with child-aware cleanup. Baseline on 8f05716f (one run each, as the scripts stood): matchSmoke RED `no torpedo struck B during the ready room` (3 min 11 s); weaponsSmoke RED `timeout: A hold 6 mines live at once` (7 min 24 s).

Gate: `npm run check` green on the docs commit (lint, tsc ×3, shared 1177 / server 2789 / client 4050, hooks 266 — see the PR). Smokes run alone per auto-memory `feedback_headless_smokes`.

## Residual risks / open

- fogSmoke, combatSmoke, zoneSmoke, soloSmoke, openingSmoke still carry heuristic pilots (ledger, 9.16). fogSmoke is red today on `phaseRadarBand`.
- The smokes are outside `npm run check` (Eric's ruling 2); the gate before every PR must run them first-try by hand.
- Wall-clock budgets: a stalled host process could still burn a budget without server ticks advancing; every budget carries ≥ one reload of slack.
- The kill plans' tightest point is the third fish on a ~123 hp target against a 112 / 100 blow (~11 hp margin); the fish-count contract is two-sided so a flip to three fish would still pass.
