---
baseline_commit: 8f05716f
---
# Story 9.15: Smoke Flakes Fixed

Status: ready-for-dev

<!-- Created 2026-10-22 by gds-create-story on development @ 8f05716f (0.18.69, PV 91). Every number below is a reading of CONFIG or the scripts on that commit, quoted so the dev agent knows what the smokes LEAN ON — none is a value to pin. The mechanism recommended in Dev Notes is a dev-door change (headless harness plumbing behind HC_DEV_OPTIONS=1), not a game mechanic; where it needs Eric's word, the question is collected at the end, not scattered. -->

## Story

As the person running the gate,
I want matchSmoke and weaponsSmoke to pass or fail on what they claim to test,
so that a flake is never "ledgered as awareness" again (the Epic 7 "flake is P1" agreement).

**The agreement (Epic 7 retro, 2026-08-27, `epic-7-retro-2026-08-27.md:51`, verbatim):** *"A flaky gate is worse than no gate. It trains the exact habit that lets regressions through. Flakes are P1 the day they appear, not cycle-20 cleanup."* Standing agreement 4 (`:101`): *"Treat any new gate flake as P1 the day it appears."*

**What the Epic 8 retro recorded (`epic-8-retro-2026-10-06.md:48`, verbatim):** *"Smoke flakes logged, not fixed: matchSmoke needed retries in 8-1/8-2/8-3; weaponsSmoke (piloting-dependent) passed on run 4 in 8-14, failed four times in 8-16 including on the untouched baseline, and was skipped in 8-17 and 8-18 — against the Epic 7 'flake is P1' agreement."* Action 7 (`:110`): *"Fix or rewrite matchSmoke / weaponsSmoke so the outcome does not depend on bot piloting; three clean first-try runs."*

**Why this is the end-to-end layer and not optional:** Story 9.14 (amendment 213, `test-audit-2026-10-22.md:320`) declared the pyramid: unit tests on pure functions, integration tests on compositions, and *"the END-TO-END layer is the headless socket smokes in `server/scripts/*.mjs` (matchSmoke, weaponsSmoke, fogSmoke; 9.15's), outside `npm run check`."* An end-to-end layer that is re-run until green is not a layer.

## Acceptance Criteria

1. **No outcome depends on piloting.** Given `server/scripts/matchSmoke.mjs` and `server/scripts/weaponsSmoke.mjs` as they stand (racetrack strafing, island-avoidance rudder bias, rendezvous-to-midpoint, hold-station loiter, nearest-mine chase — a heuristic pilot per hull, on a random map, with the 60 s PvE fleet wave arriving mid-fight), when the rewrite lands, then every hull in both smokes is placed where the scenario needs it by dev options and driven by SCRIPTED inputs sent through the ordinary `i` channel (so they pass `inputs.ts`' `sanitizeInput` like any client's), the map is a FIXED seed (`mapSeed` dev option), the weapons are the `fitOverride` dev fit (epic-8 amendment 65), and no fleet hull, bot or storm takes part in any phase that asserts a hit or a sink. Nothing in either script steers by a heuristic any more (no `islandBias`, `islandAvoid`, `unstickInput`, `strafeFire`, `rendezvous`, `holdAt`, `nearestEnemyMine` or their equivalents).
2. **Every assertion names a contract.** Each phase asserts the behavior it exists to prove and nothing a pilot chose: a torpedo launched at a hull dead ahead inside its arc STRIKES it (`boom` on the target, `dmg` of the fish's CONFIG damage); a hull whose hp reaches 0 SINKS (`sunk` event with `by` = the shooter) and its killer's roster row books the kill; a two-captain match whose last opponent sinks ENDS (results broadcast, winner = the survivor, captains-only rows, dense placements, room disposes after `resultsMs`); the ready room suppresses hull damage while weapons fire; a laid mine is seen by its owner at any range and by an enemy only inside detect; a hull sailing onto an armed mine takes the mine's CONFIG damage; a torpedo id never appears as a radar blip; a gun's hit lands its CONFIG damage and its shell reveals carry the gun's family `w`; the machine gun is a level, never a click. Every damage number is READ from `CONFIG` (and, where tiers apply, from the same fold `effectiveStats()` uses) at run time — never typed into the script. Time budgets are derived from the CONFIG cadence they wait on (reload × fish needed, plus one slack cycle), with the derivation in a comment, never a bare literal.
3. **Three consecutive clean first-try runs on a quiet box are recorded in the spec.** Each run is a fresh server boot (matchSmoke boots its own; weaponsSmoke against a server the dev agent booted on a scratch port and killed by PID) with nothing else heavy running; the three run logs (the `… SMOKE OK:` line with its trace and the wall time) are pasted into `spec-9-15-smoke-flakes-fixed.md` § Verification. A single red run during development is a bug to fix in the script or the plumbing, never a re-run.
4. **The ledger is stamped.** Every `deferred-work.md` entry about the two smokes' flakiness (the list is in Dev Notes § Ledger entries, with line numbers at 8f05716f) is appended `status: RESOLVED 2026-10-<dd> (Story 9.15, cycle <n>): …` in the ledger's own format with a pointer to the run log; the fogSmoke shell-reveal bookkeeping entry (`:343`) is resolved too if its one-line fix is applied (see Task 5), else re-pointed; old text is never rewritten. The stale "seedable-map dev option previously ruled out as new server plumbing" reading (`:64`) is answered in the stamp by the `mapSeed` option that already exists (`roomOptions.ts:242-250`).
5. **The dev door stays a dev door.** Every option the smokes use is honored only under `HC_DEV_OPTIONS=1` and stripped (and reported in `rejectedKeys`) otherwise, exactly as `matchOverride`/`zoneOverride`/`mapSeed`/`fitOverride` are today; `sanitizeRoomOptions`' unit tests (`server/src/__tests__/roomOptions.test.ts`) gain a case per new key proving the strip; the perception invariants, `applyDamage` as the only hp write, `inputs.ts` as the only intent path and the SIX frame exceptions are untouched (a dev option that teleports or pre-fits a hull is a PLACEMENT, not a new way to write hp or to leak position). `PROTOCOL_VERSION` is unchanged unless a wire message changes (none is expected). No production behavior changes; no gameplay number moves.
6. **Both smokes keep their operating contract.** matchSmoke still boots its own server on `PORT` 2599 with the pre-boot foreign-listener guard, kills only its own process group (SIGTERM, then SIGKILL fallback) and verifies the port is free; weaponsSmoke still runs against `WS_URL` (default `ws://localhost:2567`) and never kills anything. Both print a trace on failure. `npm run check` green (the smokes are outside it and stay outside it — see Questions); lint complexity unchanged (`server/scripts/*.mjs` is outside ESLint today, `deferred-work.md` ~1808, 9.16's); both trackers stamped with ONE-LINE stamps; `CHANGELOG.md` entry; `VERSION` + root `package.json` +1 cycle.

## Tasks / Subtasks

- [ ] **Task 0 — Branch, install, baseline (AC: 3).** Work on `worktree-create-story-9-15-smoke-flakes` (cut from `development` @ 8f05716f) or a fresh branch from `development`; `git fetch origin` first and again before the PR (parallel cycles collide). Fresh worktree: `npm install --include=dev && npm run build -w shared`. Cycle number: next after 204 (expect 205 → 0.18.69 → 0.18.70; re-check `origin/development` before numbering). Run BOTH smokes ONCE as they stand to see the failure shape on this box (`node server/scripts/matchSmoke.mjs`; for weaponsSmoke boot `HC_DEV_OPTIONS=1 PORT=2699 npx tsx server/src/index.ts` from `server/` or with `--tsconfig server/tsconfig.json`, then `WS_URL=ws://localhost:2699 node server/scripts/weaponsSmoke.mjs`, then kill ONLY that PID). Record the result; do not re-run. Read the two scripts in full and `server/scripts/latencyHarness.mjs:1-60, 300-360` (the one scripted-scenario precedent: pinned `mapSeed`, shooter sails to the center and stops).
- [ ] **Task 1 — The dev door gains what a scripted scenario needs (AC: 1, 5).** Three dev-only room/join options, all behind the existing `sanitizeRoomOptions(options, devEnabled)` gate, each stripped + reported in `rejectedKeys` without the env, each with a strip test and an honor test in `roomOptions.test.ts`:
  - [ ] 1a `spawnOverride?: { x: number; y: number; heading: number }` — a captain's placement pose. Honored at EVERY placement edge the captain crosses: `World.addShip(…, at, …)` already takes `at: Vec2 | undefined` (`world.ts:2287-2288`) so the first spawn is plumbing only; the countdown→active REDEPLOY (`world.ts:~2652`, `pickSpawn` on the ring, `holdStartLine` false on the dev door) and any respawn (`world.ts:~7503`) must honor the same pose for a hull that carries one, the way `applyDevFit`/`redeployEconomy` already carry the dev fit across the redeploy (amendment 65). Value-sanitized even when honored: finite numbers, inside the map radius, else stripped. Heading sets `state.heading`. It never changes hp, ammo, fit or anything `applyDamage` owns.
  - [ ] 1b `matchOverride.fleetWaves?: false` (or a sibling flag — name is the dev's; keep it inside `matchOverride` so the one dev gate strips it) → `World` option that makes `spawnFleetWaves()` (`world.ts:5035`) a no-op. Today the wave scheduler fires `CONFIG.fleet.waves[0]` (16 fleets × 6 hulls) at ZONE START + 60 s whenever `zoneStartT !== null && damageEnabled` — in matchSmoke that is 60 s into the active fight (budget 240 s), and in weaponsSmoke's sandbox the zone starts at the 2nd join with damage on, so 96 omniscient fleet hulls arrive one minute into EVERY run. spec-8-0 `:165` already listed "no `fleet: false` dev switch" as a residual risk. The flag is read ONLY by the scheduler; bots/`solo`/`botFill` are untouched.
  - [ ] 1c Confirm `mapSeed` (exists: `roomOptions.ts:242-250`, sanitized `:382, :424`) and `fitOverride` (exists) need no change. If a seat's `gun` join option and `cls` are used, they are plain join options (not dev-gated) and stay that way.
  - [ ] 1d Thread the sanitized values: `roomOptions.ts` (`RoomOptions`/`JoinOptions`, `SanitizedRoomOptions`, `sanitizeRoomOptions`) → `ArenaRoom.onJoin` / `finishCreate` (`ArenaRoom.ts:~330-390, ~465-512`) → `World`. `ArenaRoom` stays a thin adapter; `world.ts`/`match.ts` keep zero Colyseus imports. New `World` fields go through `WorldOptions` (`world.ts:259-296`) or a setter, not a global.
- [ ] **Task 2 — matchSmoke rewritten as a script (AC: 1, 2, 6).** Keep the six-step lifecycle proof (it is the ONLY socket test of the dev door's gathering window, lock, redeploy, sinking-window hold, captains-only results and autoDispose); replace the two piloting steps:
  - [ ] 2a Pose the pair: B stationary at a chosen water point on the pinned map, A `TORP_RANGE`-ish ahead of it with heading = bearing to B, both on clear water with a clear lane (pick the point once from `generateMap(mapSeed, playerCap)` in the script and assert the lane is clear with `islandBlocksSegment` as a PRECONDITION — a failed precondition is a script bug, printed as such, not a smoke failure). Both poses honored across the redeploy (1a), so step 3's "redeployed to the spawn ring" assertion becomes "redeployed to the dev pose at full hp" — the contract is the teleport + full hp + zone anchored, not the ring.
  - [ ] 2b Step 2 (weapons-safe ready room): A sends `throttle 0, rudder 0, aim = bearing, slot 2, fireSeq++` once per tick until `b.boomsOnMe >= 1`; assert zero hp lost. Budget: the fish flight time at `CONFIG.torpedo` speed over the lane + one reload, derived.
  - [ ] 2c Step 4 (A sinks B): the same scripted click until `b.sunkSeen`; `fleetWaves: false`; the storm beats stay as tuned (the smoke's own `ZONE_OVERRIDE`). Compute the kill plan from CONFIG IN THE SCRIPT and print it: hull hp (`CONFIG.shipClasses.torpedoBoat.hp`, 300 today), fish damage (`CONFIG.torpedo.damage`, 90 today), tubes at the fitted tier (`maxAmmo` ladder 1,1,2,2,2 — `fitOverride` may list `heavyTorpedo` more than once to climb tiers; a line held at its cap is dropped), reload (`CONFIG.torpedo.reloadMs`, 30 s), AND passive regen between hits (`CONFIG.regen`: 2 % of MISSING hull per second after 15 s out of combat — a 30 s reload gives ~15 s of regen per cycle, so the fish count is NOT hp ÷ damage; derive it or, simpler, fit enough tubes that a salvo lands inside the regen wait). The budget is `fishNeeded × reloadMs + one reload` of slack. The countdown override shrinks to what step 2 needs (180 s was a sailing budget).
  - [ ] 2d Delete `control`, `strafeFire`, `huntPeer`, `islandBias`, `losClear`, `unstickInput`, `backOff`, `ISLANDS`-as-avoidance and their constants; keep `idle`, the lifecycle plumbing, the pre-boot guard and the teardown. Update the header comment to describe the scripted scenario and name amendment 65 (epic 8) correctly.
- [ ] **Task 3 — weaponsSmoke rewritten as a script (AC: 1, 2, 6).** Same mechanism, one fresh room per phase (`client.create` + `joinById`, as phases 5–7 already do) so no wreck, mine or regen state leaks between phases; `mapSeed` pinned, `fleetWaves: false`, `sandbox: true` as today:
  - [ ] 3a Torpedo kill + never-a-blip: A posed ahead of a stationary B inside the bow arc; scripted clicks; assert ≥ 1 `dmg` at `CONFIG.torpedo.damage`, the roster death, and torpedo ids ∩ blip ids = ∅ with the non-vacuity guard kept.
  - [ ] 3b Mine visibility + no eviction: the mine layer posed, laying astern on the click channel (`dropMines` minus steering); the observer posed at a FIXED trailing offset inside detect (no `holdAt` — a stationary observer at a known distance is the point); assert SIX own mines live at once and zero enemy-mine sightings beyond detect. Budget derived from `CONFIG.mine.reloadMs` × 6 + `armDelay`.
  - [ ] 3c Mine ambush: the victim posed on a straight course THROUGH the laid mine's position (`throttle 1, rudder 0`, heading pre-aimed at the mine point read from the layer's own `mines` list); assert the `CONFIG.mine.damage` drop + boom and first-sighting-inside-detect.
  - [ ] 3d Light torpedo: the target posed on the shooter's PORT BEAM at a fixed range (heading = bearing − π/2 set by the pose, no steering), scripted clicks when `|off − π/2| < CONFIG.lightTorpedo.halfArc` (true by construction — assert it as a precondition); kill plan from CONFIG incl. regen.
  - [ ] 3e Captive mine: layer posed, one click; victim posed on a straight course through the trip ring; assert `CONFIG.captiveMines.damage`.
  - [ ] 3f The three guns: shooter and target posed at a fixed range inside the gun's tiered range (read from `effectiveStats`/CONFIG, not typed), dead stop; cannon/flak one click per `reloadMs`, machine gun `held: true` for a derived window; assert the CONFIG damage, the family `w`, and `fireSeq === 0` for the MG.
  - [ ] 3g Delete `steerToward`, `holdAt`, `engageTorp`'s steering half, `engageLightTorp`'s steering half, `islandAvoid`, `rendezvous`, `nearestEnemyMine`, `sailTo`; keep the frame bookkeeping, the trace, `WS_URL`. Fix the header (the torpedo arithmetic comment still says 50 dmg / 300 hp / six fish; the "ambush: B.hp 250->195" example is pre-9.6 numbers).
- [ ] **Task 4 — Three clean first-try runs (AC: 3).** On a quiet box, nothing else heavy running: three fresh runs of each smoke, each a fresh server boot. Paste the three `OK` lines with traces and wall times into the spec. If any run is red, fix the cause and restart the count at one. Never run the smokes concurrently with `npm run check` or a batch sim (9.13's gate showed a shard-loaded box skews socket timing).
- [ ] **Task 5 — fogSmoke's one-line bookkeeping fix (AC: 4; cheap, handed here by 9.14).** `deferred-work.md:343`: the shell-reveal assertion reads `b.you` at ASSERT time instead of at REVEAL-record time, so a hull that moved between the two reads can "reveal 3493 u from B". Snapshot the observer pose when the reveal is recorded. Run fogSmoke once after; record it. If the fix is not that one line, leave fogSmoke alone and re-point the entry at 9.16 — no scope creep.
- [ ] **Task 6 — Record, gate, PR (AC: 4, 6).** `spec-9-15-smoke-flakes-fixed.md` (house style, see `spec-9-13-bot-posture-workover.md`): what changed in the door, what each smoke now proves, § Verification with the three run logs per smoke and the kill-plan printouts, residual risks. `epic-9-context-amendments.md`: ONE appended entry (next number after 213) recording the dev-door additions, their gate, the scripted-scenario rule for smokes ("a smoke places, it does not sail"), and any Eric rulings from the Questions. `deferred-work.md`: the stamps of Task AC 4 (list in Dev Notes). `project-context.md` Platform & Build Rules: the dev-options sentence lists `matchOverride`/`zoneOverride` only — add `mapSeed`, `fitOverride` and the new keys to that one sentence (it is the rule agents read; `docs/key-decisions.md:73` is archived and stays). `CHANGELOG.md` 0.18.70 (tests are not player-facing — one short "Changed" line that the two end-to-end smokes are now scripted scenarios, no gameplay change). Both trackers: `sprint-status.yaml` `9-15-smoke-flakes-fixed: review  # <date> cycle 205, 0.18.70, PV 91 unchanged, amendment <n>; spec-9-15-smoke-flakes-fixed.md; PR open to development` + its `last_updated` line; `gds-workflow-status.yaml` `last_updated` + `next_expected`. `npm run check` green. Commit and push continuously; ONE non-draft PR to `development` at the end; NEVER merge — the run ends at the open PR.

## Dev Notes

### Scope, in one line

Turn two heuristic-pilot choreographies into scripted scenarios (place by dev option, drive by scripted input, assert the contract), by adding the two dev-door options a scripted scenario still lacks (a spawn pose; a fleet-waves-off switch), behind the one existing `HC_DEV_OPTIONS=1` gate. No gameplay change, no CONFIG change, no wire change.

### Why they flake — the root cause, from the code at 8f05716f

Every historical failure line (`no torpedo struck B during the ready room`, `B sunk by undefined, expected A`, `timeout: mine ambush`, `B saw 0 distinct A-mines`, `timeout: light torpedo kill`) is a PILOTING outcome, not a sim defect. The smokes were written when the ocean was R 2400–2800 and have been re-budgeted at every growth (`matchSmoke.mjs:66-110` is a diary of it). Today:

- The ocean is R 5000, the spawn ring 0.8 R = 4000 u, 16 lattice slots on ONE shared phase per match (`spawn.ts:27-60`); two captains land max-min apart — ~8000 u. A Torpedo Boat at 45 u/s needs ~180 s just to CLOSE, through a fractal island field, before the first shot — that is what matchSmoke's 180 s ready room and 240 s fight budget are spending.
- Both smokes carry their own pilots: `strafeFire` racetrack + `islandBias` + `unstickInput` + `losClear` (matchSmoke), `rendezvous` to the midpoint + `holdAt` + `islandAvoid` + `nearestEnemyMine` (weaponsSmoke). Each is a heuristic over a RANDOM map (`mapSeed` unset in both — only fogSmoke and latencyHarness pin it). The ledger's own words: "the rendezvous/hold geometry on a random map" (`deferred-work.md:2482`), "A pinned orbiting at ~165u with island-blocked LOS" (`:965`).
- The PvE wave scheduler (`world.ts:5035-5050`) fires `CONFIG.fleet.waves[0] = { atMs: 60000, fleets: 16 }` off ZONE START whenever damage is enabled. matchSmoke's zone anchors at activation → 96 fleet hulls (omniscient AI, `drones.ts`) arrive 60 s into the 240 s fight; `B sunk by undefined` is consistent with a fleet or storm kill landing first. weaponsSmoke's sandbox starts the zone at the 2nd join with damage on → the same wave 60 s into every run. Neither smoke knows.
- Passive healing (Story 9.6, `CONFIG.regen`: 2 % of missing hull per second after 15 s out of combat) now races every single-tube kill: with a 30 s reload the target heals ~15 s between fish. The 8.14 ledger entry already noticed the light-torpedo phase "racing the out-of-combat regen" (`:2482`). A kill plan that ignores regen under-budgets; one that pins a fish count will break on the next balance pass. Derive it from CONFIG in the script, or fit enough tubes to land the kill inside one regen wait.

A scripted scenario removes every one of those variables: fixed map, fixed poses, no sailing, no fleet, a kill plan read from CONFIG.

### The mechanism — what exists and what is missing

| Need | Exists today | Missing |
|---|---|---|
| Deterministic map | `mapSeed` dev option — `roomOptions.ts:242-250`, sanitized `:370/:382/:424-426`, rides the welcome (`ArenaRoom.ts:337, :491, :898`); fogSmoke pins 265, latencyHarness pins its own | nothing — the 2026-07-17 ledger note "ruled out as new server plumbing" (`deferred-work.md:64`) predates story 1.5's harness; say so in the stamp |
| The fitted weapon at spawn | `fitOverride` (epic-8 amendment 65) — `roomOptions.ts:91-108`, `World.applyDevFit` (`world.ts:2543`), survives the activation redeploy via `redeployEconomy` | nothing |
| Shrunken lifecycle | `matchOverride.countdownMs/resultsMs/joinWindowMs/minHumans/mulligan/sandbox` (`roomOptions.ts:205-223`) | nothing |
| Harmless storm | `zoneOverride` (`ZoneTimeline` subset, never `stormDps`) | nothing |
| **A hull where the scenario needs it** | `World.addShip(id, name, role, hullId, horn, at: Vec2 \| undefined, gun, fit)` already accepts a point (`world.ts:2287-2288`); `ArenaRoom.onJoin` passes `undefined` | a dev-gated `spawnOverride` pose on the join bag, threaded to `at` AND honored at the redeploy (`world.ts:~2652`) and respawn (`~7503`) edges for a hull that carries one; heading applied |
| **No fleet in a scripted fight** | — (spec-8-0 `:165`: "no `fleet: false` dev switch") | a dev-gated flag the wave scheduler reads (`spawnFleetWaves` early return) |
| Scripted intent | `inputs.ts` `sanitizeInput` — every field finite, `seq` strictly increasing, `slot`/`actSlot` integer in `[0, SLOT_COUNT)`, `held` a required boolean, 40 msgs/s cap; both scripts already build legal `InputMsg`s (`neutralInput()` shape) | nothing — keep sending on `'i'` once per `CONFIG.tick.simDtMs` |

The one line that makes the door safe is unchanged: `sanitizeRoomOptions(options, devEnabled)` with `devEnabled = process.env.HC_DEV_OPTIONS === '1'` (`ArenaRoom.ts:330-331, :1016`). A new key goes INSIDE that branch, is reported in `rejectedKeys` outside it, and gets the two tests every existing key has. `spawnOverride` is a placement, exactly like the `at` argument unit tests already pass; it must never touch hp (`applyDamage` is the only hp write — `damageGate.test.ts` scans the source for that), never add a wire field, never be readable from a frame.

### Slot and input facts the scripts lean on (verify, do not pin)

- Nine fixed slot roles since Story 8.5: slot 0 = the seat's gun, slot 1 = the Shift boost, slot 2 = the FIRST fitted weapon (Q) — the dev fit lands there (`weaponsSmoke.mjs:339-345` comment). `SLOT_COUNT` from `@salvo/shared` is the bound `isSlotIndex` checks.
- Click weapons fire on a `fireSeq` EDGE (`lastFireSeq = max(...)` — a stale value is "no new click"); the machine gun is a LEVEL (`held: true`, amendment 103) and the smoke asserts its `fireSeq` stays 0.
- Torpedoes launch straight at `aim` whenever `aim` sits inside the bow arc (`CONFIG.torpedo.halfArc` 30°; heavy), into the twin beam sectors for the light fish (`CONFIG.lightTorpedo.halfArc` 45° about ±90°), ±15° for the supercav. A posed shooter whose heading IS the bearing satisfies the heavy arc by construction; assert the arc condition as a precondition anyway so a wrong pose prints as a script bug.
- Mines are click-fired astern inside `CONFIG.mine.placeRange` (150 u), arm after `armDelay` (3000 ms), reload `CONFIG.mine.reloadMs`; the captive rack shares the chassis; naval mine `damage` 90 today. A mine has 10 hp and is hurt only by a deck-gun shell on its marker (auto-memory `project_mines_burst_only`) — irrelevant here unless a phase shoots one.
- `vision.detect === vision.sight` (500 u, Story 9.8, `detectFactor 1`); radar 1500 u with dropout. The "enemy mine never seen beyond detect" pin reads `CONFIG.vision.detect`.
- Fire-time claims (`fireT`) are clamped server-side (`inputs.ts` `clampFireTime`); the scripts send 0 (no claim) today and should keep doing so.
- Class hp today: torpedoBoat 300, battleship 350, mineLayer 300 (`constants.ts:141-180`). Heavy torpedo 90 dmg / 30 s / 1 tube at tier I (`:1497-1503`), tubes 1,1,2,2,2 by tier; light 80 / 25 s; supercav 150; deck gun 8/shell at 5 s; MG 5/shell, 12.5 s magazine; flak 16 at 3.5 s. **Read, never type.**

### What the smokes already do right — keep it

- matchSmoke: self-boot on 2599 with `HC_DEV_OPTIONS=1` in the child env, `portOpen` pre-boot guard (IPv4 + IPv6), `detached: true` + `process.kill(-pid)` (own group only), SIGTERM→SIGKILL teardown with a leaked-port exit code, `runUntil` with labeled timeouts, the anti-cheat spec-frame checks (`specBeforeFinish`), the amendment-39/41 roster oracle, the dense-placement partition check. Steps 1, 3 (minus the ring literal), 5 and 6 are lifecycle contracts and stay.
- weaponsSmoke: `WS_URL`, fresh room per late phase (`create` + `joinById`), the frame bookkeeping (`dmg`/`boom`/`torp`/`blip`/`shell` tallies), the two-tally mine logic (own = board count, enemy = fog pin), the non-vacuity guards, the hoisted `TRACE` printed on failure, the CONFIG-read damage tables (`GUN_DAMAGE`, `GUN_W`).
- Both: every input is a full legal `InputMsg`; both already read `CONFIG.tick.simDtMs` for their send cadence.

### Ledger entries this story stamps (`deferred-work.md` at 8f05716f — re-grep before editing, lines drift)

| Line | Source | Status today | Gist |
|---|---|---|---|
| `:20-22` | Story 0.1 prose section | (none) | matchSmoke timing/physics-flaky; torpedo-connect luck steps 2/4 |
| `:63-65` | spec-deferred-work-cycle | (none) | residual step-2 map-geometry flake; "seedable-map dev option previously ruled out" |
| `:515-516` | spec-weapon-balance-and-radar-vector-length | (none) | step 4 still fails; balance pass aggravated; stopped bumping numbers |
| `:948-949` | spec-5-1 | (none) | half the ledger retired (drone camp gone); torpedo luck remains |
| `:965-966` | spec-5-2 | (none) | four runs to pass; "treat a single failure as inconclusive" |
| `:2122-2124` | spec-8-5 | (none) | "A sinking B" marginal by arithmetic; fix is smoke tuning |
| `:2264-2266` | spec-8-10 | (none) | both smokes depend on `fitOverride` (informational — stamp as confirmed, still true) |
| `:2480-2483` | spec-8-14 | OPEN — awareness | weaponsSmoke piloting-flaky across phases |
| `:2578-2581` | spec-8-16 | OPEN — awareness | four failures incl. untouched baseline |
| `:2639-2642` | spec-8-18 | OPEN — awareness | matchSmoke's client-side `losClear` copy (deleted with the pilot) |
| `:343-344` | spec-3-1 | (none) | fogSmoke shell-reveal bookkeeping race (Task 5) |
| `:76`, `:1999` | spec-1-4, spec-8-1 | (none) / OPEN | combatSmoke seed-flaky; same class — see Question 3 |

Format: append a `status:` line in the entry's own style (`RESOLVED 2026-10-<dd> (Story 9.15, cycle <n>): … Was: <old status>`), as `:1535` and `:2557` show; prose sections (`:20`) get one appended line. Never rewrite old text.

### Architecture invariants this story must leave standing

- Intent enters only through `inputs.ts` — the scripts SEND inputs; they never gain a back door. A "teleport" is a placement at a spawn edge, not an input.
- `frames.ts`/`perception.observe()` untouched; SIX exceptions; nothing new on the wire. `goldenFrames` snapshot byte-identical (`npm test -w server`).
- `world.ts`/`match.ts` zero Colyseus imports; `ArenaRoom` thin adapter.
- Bots (`server/src/game/ai/`) untouched and still never import `world.js`.
- `CONFIG` untouched. If a derived budget in a script seems to want a CONFIG change, that is a smoke-tuning matter (the `:2123` ruling: "a smoke tuning, never a CONFIG change").
- Dev options honored only under `HC_DEV_OPTIONS=1` (project-context Platform & Build Rules); the solo/private doors (`solo`, `botFill`, `lobbyTicket`) are not dev options and are not touched.

### Previous-story intelligence (9.14, cycle 204)

- 9.14 declared the socket smokes the end-to-end layer and explicitly handed this story the fogSmoke flake (`test-audit-2026-10-22.md:277`; `9-14-test-purposefulness-audit.md:73`). Its rubric row SEED-OUTCOME says *"Scripted-sink `winnerId` pins … are contracts — the test scripted the sink"* — the exact shape this story builds at the socket layer.
- 9.14's gate lesson: wall-clock pins fail under a loaded box. A smoke's time budget is a TIMEOUT derived from cadence, not a performance claim; print the derivation.
- 9.14 commit style (PR #302): code per area in its own commit, then one docs/record commit stamping amendment + ledger + CHANGELOG + both trackers. Follow it: (1) door + tests, (2) matchSmoke, (3) weaponsSmoke (+ fogSmoke line), (4) spec/ledger/amendment/trackers/CHANGELOG/VERSION.
- Eric's standing word is the moratorium unlock on `CLAUDE.md` only when he says so in-conversation; nothing in this story touches it (its smokes line is still true).
- 9.13's gate showed the smokes must run ALONE on a quiet box (auto-memory `feedback_headless_smokes`): weaponsSmoke needs a booted server + `WS_URL`; kill only your PID; matchSmoke was "a ledgered flake" — this story is what retires that phrase.

### Git intelligence (last 8 commits on development)

All eight are 9.14 (tests + record). The last code change under `server/scripts/` was 2026-10-14 (fogSmoke/weaponsSmoke/zoneSmoke/soloSmoke touched by 9.8's twelfths ladder — `vision.detect`, radar band). Nothing on this branch collides with 9.16 (harness/ledger hygiene) except the ledger file itself — append only, so a merge is clean.

### Project Structure Notes

- Scripts stay in `server/scripts/` as `.mjs` importing `@salvo/shared` (needs `npm run build -w shared`); no new script files unless a shared helper (e.g. `server/scripts/lib/scenario.mjs` for pose/join/tick plumbing both smokes use) removes real duplication — one helper file is fine, a framework is not.
- Door code: `server/src/rooms/roomOptions.ts` (types + sanitizer, pure), `server/src/rooms/ArenaRoom.ts` (thread-through), `server/src/game/world.ts` (`WorldOptions`, placement edges, wave scheduler). Tests: `server/src/__tests__/roomOptions.test.ts` (+ a World unit test that a posed hull is placed at the pose on spawn AND redeploy, and that the wave scheduler is silent under the flag).
- Spec: `_bmad-output/implementation-artifacts/spec-9-15-smoke-flakes-fixed.md`. Rulings: `epic-9-context-amendments.md` (append, next after 213). Threads: `deferred-work.md` (append). Trackers: one-line stamps, both, same PR.
- `CLAUDE.md` frozen; `docs/*` archived (do not update `codebase-map.md`; it has no scripts entry anyway).
- American spelling everywhere this story writes.

### Project Context Rules (from `_bmad-output/project-context.md`)

- Testing Rules: `npm run check` is the gate (smokes are outside it); a test asserts a CONTRACT, never a seed-produced number — a scripted scenario's outcome is a contract because the script made it so; "the socket smokes end to end".
- Platform & Build: dev options honored only under `HC_DEV_OPTIONS=1`, `sanitizeRoomOptions()` gates everything client-supplied; the server boots from `server/` (tsconfig decorators); branch from `development`, PR to `development`; never start a server in Eric's checkout — boot your own on a scratch port in the worktree and kill it after.
- Anti-Cheat: intent only through `inputs.ts`; nothing spatial outside `frames.ts`; no range-derivable wire fields.
- Engine: `world.ts`/`match.ts` zero Colyseus; no `Math.random`/`Date.now` in sim code (a smoke SCRIPT may use wall time for its timeouts — it is not sim code).
- Critical Don't-Miss: never invent mechanics or numbers; halt on ANY error and surface it; ONE PR; fleet hulls and bots are ordinary ships through the same input pipeline (the fleet switch stops them being SPAWNED, it never special-cases one that exists).

### References

- Story text: `_bmad-output/planning-artifacts/epics.md:2464-2476`; origin `sprint-change-proposal-2026-10-06.md:43`.
- Agreements: `epic-7-retro-2026-08-27.md:51, :101`; `epic-8-retro-2026-10-06.md:37, :41, :48, :66, :110`.
- `fitOverride`: `epic-8-context-amendments.md:163` (amendment 65 — EPIC 8; epic-9's 65 is the fouling-shell bot row, unrelated); `roomOptions.ts:91-108, :162-171`; `world.ts:2543`.
- Dev door: `roomOptions.ts:185-300` (MatchOverride, RoomOptions, SanitizedRoomOptions), `:300-390` (`sanitizeRoomOptions`), `:424` (`sanitizeMapSeed`); `ArenaRoom.ts:211-250` (static onAuth, dev-only direct join), `:326-337`, `:465-512`, `:1016`; `docs/key-decisions.md:73` (archived).
- Placement: `server/src/game/spawn.ts:1-110` (lattice, one phase per match), `world.ts:1981-1990` (seed streams), `:2287-2288` (`addShip` `at`), `~2652`, `~7503`.
- Fleet waves: `world.ts:5025-5050`; `constants.ts:316-345` (`fleet.waves`).
- Inputs: `server/src/game/inputs.ts` (`sanitizeInput`, `neutralInput`, rate cap).
- Regen: `constants.ts:2646-2650`; torpedo/mine/gun blocks `:1231-1800`.
- Scripts: `server/scripts/matchSmoke.mjs` (637 lines), `weaponsSmoke.mjs` (663), `fogSmoke.mjs:1-110` (mapSeed 265 pin), `latencyHarness.mjs:1-60, :300-360, :589` (scripted-scenario precedent), `predictionSmoke.mjs`; recipes in `spec-8-10-the-opening.md:161`, `spec-8-13-catalog-v3-torpedoes-and-mines.md:158`.
- Ledger lines: table above; `test-audit-2026-10-22.md:277, :320`.
- Auto-memory: `feedback_headless_smokes`, `feedback_never_move_past_errors`, `feedback_pr_at_end_only`, `feedback_merge_pr_to_development` (never merge), `feedback_gds_workflow_status` (both trackers), `project_parallel_cycle_collisions`.

## Questions for Eric (collected; none blocks starting Task 1 under the defaults)

1. **Two new dev-door options.** The rewrite needs a dev-gated spawn pose (`spawnOverride`) and a dev-gated fleet-waves-off switch. Both are harness plumbing behind the existing `HC_DEV_OPTIONS=1` gate, stripped in production like `matchOverride`. Default: build both. Alternative (no server change): pre-compute a scripted sailing plan on a pinned seed — longer runs, still a sailing choreography, and the fleet wave still arrives at 60 s. Confirm the default?
2. **Smokes in the gate.** They stay outside `npm run check` today (minutes of wall time, a booted server). Default: stay outside, but the dev-story and every later gate run them once, first-try, before a PR. Or add an `npm run smoke` script that runs both (matchSmoke self-boots; weaponsSmoke would need a boot wrapper) — still outside `check`?
3. **combatSmoke and the rest.** The same mechanism (pin `mapSeed`, pose the pair) would retire combatSmoke's seed flake (`deferred-work.md:76, :1999`) and could be applied to the other heuristic-pilot smokes (combat, zone, solo, opening). Default: matchSmoke + weaponsSmoke + the fogSmoke one-liner only; list the rest for 9.16. Widen?
4. **Kill arithmetic vs regen.** With passive healing (9.6), a one-tube heavy torpedo kill on a parked 300 hp hull takes more fish than hp ÷ damage. Default: the script derives the fish count from CONFIG including regen and prints the plan; `fitOverride` may stack `heavyTorpedo` cards to tier III (two tubes) so a salvo lands inside the regen wait. Any objection to fitting tiered weapons in a smoke?

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Implementation Plan

### Completion Notes List

### File List

### Change Log
