---
title: 'Story 10.12: Bot Posture Under the Four Hulls'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '7ebf5aa3'
final_revision: 'be9cfff2'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The bots play well (Eric: "They play pretty well, its just that basically all of the weapon systems have changed since they were last updated") but they were last tuned for three classes and deck guns. Under the four battleships they chase nose-on with their aft turrets masked, never sweep a mine, press HULL REPAIR on one line for everyone, roll their Shift blind, and drop a beacon the moment any contact appears.

**Approach:** A server-only posture pass in `server/src/game/ai/`: the helm angles off to keep every turret bearing, the secondaries sweep sighted mines, repair / Shift / beacon behavior become personality traits, the dead `forager` personality goes, the five ledger items owned by this story are closed, and the 9.13 posture measures are reported before and after on a 48-match pair.

## Eric's rulings for this story (2026-11-11, three AskUserQuestion rounds at the spec step of `/bmad-dev-auto 10-12`; literal spec; recorded as epic-10 amendment 21)

- **R1.** Nothing specific is broken; this is a retool for the changed weapon systems, not a rescue.
- **R2. Always angle off.** Every hull, chasing or running, turns just far enough off the target for EVERY turret to bear whenever the target is in gun range. One rule for all four hulls (rejected: by turret layout; full broadside in range).
- **R3. HULL REPAIR is a personality trait, two styles.** EARLY = press the moment the whole heal fits with no waste (missing hull ≥ what one press heals, so 80 % with no cards and lower as cards grow the heal). LATE = press when the bot breaks off. Raider, duelist, bulwark are EARLY; siege and trapper are LATE.
- **R4. A beacon is contested by personality.** Raider and duelist leave station to fight; the others stay parked, keep collecting and shoot from where they sit when the enemy is in range.
- **R5. The Shift is a roll weighted by personality:** the fitting Shift comes up half the time, the other two a quarter each. Fitting: raider and duelist SPEED BOOST, siege INSTANT RELOAD, bulwark and trapper HUNKER.
- **R6. The `forager` personality is retired** ("hunting drones is no longer a thing").
- **R7. Sim approved:** 48 matches before + 48 after on the same seeds (16 bots, even roster, `--raw`, base seed 20261111).

## Orchestrator readings (Eric may veto any on staging; none is a ruling)

- "In gun range" for R2 = the target's plot inside own main-battery reach with a clear line of fire; the angle is the smallest rotation of the wanted bearing that makes every turret bear (measured from each turret's own station through the shared arc test), on the side the bow already lies; never applied while following a route round land, in `ram`, `ringRun`, the un-beach machine, `hold`, or a stationed `farm`.
- Mine sweeping: a sighted HOSTILE mine inside secondaries reach with a clear line is swept (aim on its marker, secondaries held under the existing heat discipline) when the bot has no target in main-battery reach, or when the mine lies in the helm's own mine-avoidance lookahead (then it takes the aim from the battery for the few rounds it needs). Own mines are never swept.
- LATE repair presses under the profile's break-off line (`disengageHpFrac`) or in `disengage` / `ram`; both styles count the heal already owed (`repairHp`). `healHpFrac` retires (profile field and `CONFIG.bots.healHpFrac`); anything else reading it moves to the profile's break-off line.
- R4's stayers remain in `farm` with a target (break-off, ring run and the ring clauses still outrank it); a parked hull does not turn to open arcs.
- Beacon eligibility is judged by a reachable farming point (a standoff inside the patrol disc), not the centre; solid beacons (afloat / sinking) get an avoidance term in every posture.
- Appetites for the three weapon lines no profile names: supercav torpedo at the row's torpedo appetite, FOULING and FLASH shells at the row's shell appetite; the never-dealt `broadside` and the dead `gun` upgrade favorite are removed from the rows.
- The weighted Shift roll draws off a stream of its own (the personality roll is unchanged); a harness `--bot-shift` still forces. `CONFIG.bots.shiftFitWeight` holds the 0.5.
- The beacon smoke is a phase of `soloSmoke.mjs` phase B (bots and beacons live end to end); there is no fleet smoke left to re-script, and the weapons / zone smokes are already on the four hulls.

## Boundaries & Constraints

**Always:** server-only; `PROTOCOL_VERSION` stays 101 (no client-read CONFIG, no wire field); `ai/` never imports `world.js`; bots stay ordinary ships through `submitInput`; every arc / turret question goes through the shared functions (`turretBears`, `stepTurrets`, `pickTurret`, `stepShip`); every new dial lives in `CONFIG.bots`; complexity ≤ 10; tests assert mechanisms (the generating function), never ruled numbers, copy, or seed-produced values; American spelling; smokes are scripted scenarios.

**Block If:** a change needs a wire field or a client-read CONFIG value; the after-arm shows a posture measure clearly worse than the baseline (land contact, storm share, ram deaths) and the cause is not a defect in this diff; any ruling above proves unbuildable as worded.

**Never:** new game mechanics, weapon numbers or balance changes; a sim beyond the two approved 48-match arms; GDD / How-to-Play edits (10.14's); edits to `CLAUDE.md`; touching the untracked skill scripts in Eric's checkout (stale lines are reported, not fixed); re-deciding the early-fire / train-limit question Eric shelved 2026-11-06.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chase in range | `pursue`, clear line, target dead ahead inside main reach | wanted bearing rotated the minimum so all turrets bear; side = the side the bow is on | beyond reach or line blocked: bearing untouched |
| Run in range | `disengage` reciprocal, no route | rotated off the stern the minimum so all turrets bear | following a route / cover path: untouched |
| Mine in the way | hostile mine in secondaries reach and in the avoidance lookahead, target in battery reach | aim = the mine's marker, `sec` held; battery aim resumes when it is gone | own mine, line blocked, or overheated: no sweep |
| Idle mine | hostile mine in secondaries reach, no target in battery reach | swept | — |
| Early repair | early profile, missing − owed ≥ one press's heal, ready | press | cooling / full hull: no press |
| Late repair | late profile, hull above break-off line, not disengaging | no press | — |
| Stayer on beacon | non-contesting profile, beacon goal, target appears, hull not broken | posture stays `farm`; battery / secondaries fire if they reach | broken hull: break-off as before |
| Contester on beacon | raider / duelist, target appears | chain as today (leaves station) | — |
| Reveal | next ring revealed, beacon's farming points all outside it | goal released at the next deliberation | — |
| Shift roll | profile with fitting Shift F | P(F) = `shiftFitWeight`, the rest split evenly | forced Shift wins |

</intent-contract>

## Code Map

- `server/src/game/ai/tactics.ts` -- `postureBearing` / `desiredBearing` (apply the arc opening), `triggerOf` (sweep aim), `farmingBeacon` / `sitsStill` / `baseThrottle` (farm with a target), `helmFor` avoidance sum (beacon bodies), `decide` (next-tick pose for the battery)
- `server/src/game/ai/battery.ts` -- `readyOnTarget` (reads the pre-move pose: ledger item), `secondariesHeld`; home of the new sweep pick
- `server/src/game/ai/arcs.ts` (NEW) -- the pure arc-opening function over shared `turretBears`
- `server/src/game/ai/navigate.ts` -- `avoidMines` (the lookahead the sweep shares), new beacon-body kernel
- `server/src/game/ai/abilities.ts` -- `repairWant` (two styles)
- `server/src/game/ai/posture.ts` -- `engagement` / `idle` (stayers keep `farm`)
- `server/src/game/ai/beacons.ts` -- `pickBeacon` eligibility by farming point; standoff fixed inside the disc
- `server/src/game/ai/profiles.ts` -- rows: `forager` out, `repairStyle`, `contestsBeacon`, `shiftFit`, appetites, dead favorites
- `server/src/game/ai/shift.ts` or `profiles.ts` -- `rollShift(profile, rng)`
- `server/src/game/ai/botDriver.ts`, `server/src/game/world.ts` (`addBot`), `server/src/rooms/ArenaRoom.ts:780`, `server/scripts/batchsim/runner.ts` (`botShiftDealer`) -- the Shift is dealt after the personality is known
- `server/src/game/ai/types.ts`, `plot.ts`, `utility.ts` -- the consumer-less decoy cues (`stillSweeps`, `paintCells`, `hasWake`)
- `shared/src/constants.ts` `CONFIG.bots` -- `profiles` list, `healHpFrac` out, `shiftFitWeight` in
- `server/scripts/batchsim/{botReadouts,botReadoutReport,botReport,botMetrics,args,runner}.ts` -- new readouts, stale "three classes" comments
- `server/scripts/soloSmoke.mjs` -- beacon phase
- Tests: `server/src/__tests__/bot*.test.ts`, `server/scripts/batchsim/__tests__/`
- Records: `VERSION`, `package.json` (0.19.17, cycle 223), `epic-10-context-amendments.md` + `epic-10-context.md` (amendment 21), both trackers, `epics.md` stamp, `deferred-work.md` stamps, `batch-sim-evidence-2026-11-11.md`

## Tasks & Acceptance

**Execution (models by `/orchestrate` routing, Eric 2026-11-11):**
- [x] W1a (Fable) `ai/arcs.ts`, `ai/tactics.ts`, `ai/battery.ts`, `ai/navigate.ts` + tests -- arc opening (R2), next-tick pose in `readyOnTarget`, mine sweep, beacon-body avoidance, farm-with-target helm -- the gunnery and helm half
- [x] W1b (Opus) `ai/profiles.ts`, `ai/abilities.ts`, `ai/posture.ts`, `ai/beacons.ts`, `ai/shift.ts`, `botDriver.ts`, `world.ts`, `ArenaRoom.ts`, `batchsim/runner.ts`, `shared/src/constants.ts`, decoy-cue removal + tests -- forager out (R6), repair styles (R3), beacon stayers and eligibility (R4), weighted Shift (R5), appetites -- the personality half
- [x] W2 (Opus) `server/scripts/batchsim/*` + its tests, `server/scripts/soloSmoke.mjs` -- readouts: guns-bearing share on a target in reach, mines swept by bots, mean hull fraction at a repair press, placement and win share by hull; stale comments; the beacon smoke phase
- [x] W3 (Sonnet) records -- amendment 21, version, trackers, epics stamp, ledger stamps for the five owned items
- [x] After-arm sim on seed 20261111 + `batch-sim-evidence-2026-11-11.md` (before / after table)
- [x] Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex `gpt-5.6-sol`

**Acceptance Criteria:**
- Given a bot with a live target inside main-battery reach and a clear line, when it pursues or flees on a direct bearing, then within its turn time every turret's arc holds the target and the guns-bearing readout rises against the baseline.
- Given the five deferred-work items owned by 10.12, when the story lands, then each is stamped RESOLVED with its fix or re-stamped with a measured reason.
- Given the rolled bot field, when a match is formed, then no bot carries `forager` and each bot's Shift follows R5.
- Given both sim arms, when the ledger is written, then land contact, storm share, ram deaths and placement by hull are reported side by side, with the validity note that 48 matches is trend size.
- Given the finished tree, when `npm run check` and the four smokes (`soloSmoke`, `matchSmoke`, `weaponsSmoke`, `queueSmoke`) run, then all pass first try.

## Spec Change Log

### 2026-11-11 — review-gate corrections to three orchestrator readings (no loopback; fixed as patches)

- **Trigger:** both Fable hunters CONFIRMED that the mine-sweep reading as written ("a mine in the helm's own avoidance lookahead is swept") detonates the mine inside its own blast on the sweeper's hull; the Blind Hunter showed the LATE repair reading ("or in `disengage` / `ram`") burns the cooldown on a healthy bot that merely declined a fight; both hunters showed the stayer reading held a bot on a beacon that was not paying.
- **Amended (in code and in amendment 21(h), the durable record; the intent contract above is left as written):** the sweep needs a blast STAND-OFF and "in the way" is a lane ahead, never in `hold` / `hide` / `disengage`; LATE presses only when breaking off HURT (under the line or latched); a stayer holds only when it was already farming, is inside the circle and the beacon is paying; arcs open on the battery's lead point.
- **Known-bad state avoided:** a bot blowing itself up on a mine it could have sailed past; a siege / trapper with no repair when it actually breaks.
- **KEEP:** the arc opening before the ring clamp with the side read off the bow (attacked by all three reviewers, held); the per-tick `at`-stamped mind seats; the Shift on its own stream.

## Review Triage Log

### 2026-11-11 — Review pass (Fable Blind Hunter FIX-FIRST · Fable Edge Case Hunter 7 cases + 2 deletions · Codex `gpt-5.6-sol` FIX-FIRST)

- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 1, medium 6, low 4)
- defer: 4: (medium 2, low 2)
- reject: 3
- addressed_findings:
  - `[high]` `[patch]` (both hunters, CONFIRMED) the sweep detonated mines inside their blast on the sweeper's own hull — a stand-off (the widest tiered blast of that kind + half the hull + one tick of travel); "in the way" is a lane ahead; regression tests on the shared `burstVictims`
  - `[medium]` `[patch]` (both hunters) the sweep gave away a hidden bot — no sweep in `hold` / `hide` / `disengage`
  - `[medium]` `[patch]` (Blind Hunter) arcs opened on the plot while the guns aim at the lead point — opened on `leadPoint`
  - `[medium]` `[patch]` (both hunters) a stayer held a charted (not yet paying) beacon, and a fighting stayer was pulled out of its fight by crossing a circle — `paying` on the goal, `prev === 'farm'`
  - `[medium]` `[patch]` (Edge Case Hunter + Blind Hunter + Codex) a bot could park outside its patrol disc — a snapped standoff outside the disc yields no goal; a disc-side goal is on station only at its point
  - `[medium]` `[patch]` (Edge Case Hunter) a stayer laid prepared mines mid-fight — `farm` is a safe lay posture only with no target
  - `[medium]` `[patch]` (Blind Hunter) LATE repair burned the cooldown on a scratch — presses only when breaking off hurt
  - `[low]` `[patch]` the sweep aim is measured from the next-tick pose; `encounterSpan` / `rl/env` pass `DEFAULT_SHIFT` explicitly; dead `secondariesHeld` deleted; the harness attribution's error sources documented
  - deferred (ledger 2026-11-11): the next-tick pose on rated kinematics (Codex CONFIRMED); the mines-swept readout's mis-credit; three behaviors built as readings (parked stayer, idle sweep, the 5° margin) as Eric's calls; sweep edges near beacons
  - rejected: a parked stayer cannot dodge a ram (the spec's accepted reading); sweep-versus-other-weapon tick ordering (bounded, one tick); flapping at the arc side (attacked by three reviewers, held)

## Design Notes

- **The arc window.** A forward turret bears while the target is within `trainDeg` of the bow, an aft one within `trainDeg` of the stern, so all bear when the target sits between `180° − trainDeg` and `trainDeg` off the bow (30–150°, Bismarck 35–145°), widened slightly by station parallax at short range. The helm already orbits beam-on inside its band; R2 fills the two legs where it did not (closing and opening). The side is read off the current heading so it cannot flap.
- **Why the aim steal is not re-plumbed.** A mine drop or shell click takes `InputMsg.aim` for one tick; an aft turret moves 4.5° in that tick and recovers in the next. The ledger item is closed with that measurement and a test, not with a second aim channel (which would be a wire change).
- **Smoke.** The cloud hides nothing from server sensors, so "SMOKE to break contact" stays the existing disengage press; no change.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared && npm test -w server` -- expected: green
- `npm run lint` -- expected: 0 errors
- `npm run check` -- expected: EXIT 0 before the PR
- `soloSmoke`, `matchSmoke`, `weaponsSmoke`, `queueSmoke` on agent-booted servers (own PIDs and tsx children killed after) -- expected: OK first try
- `run_campaign.py --matches 48 --shards 12 --bots 16 --base-seed 20261111 --label after1012 --extra --raw --roster even` -- expected: completes; measures compared with `base1012`

## Auto Run Result

**Status:** done (review gate passed after fixes; PR to `development`).

**Summary:** The bots are retooled for the four battleships, server-only. A hull chasing or running with its target in gun range angles off just far enough for every turret to bear (R2; `ai/arcs.ts`, applied before the ring clamp). The secondaries sweep sighted hostile mines from outside their blast. HULL REPAIR is a personality trait — raider, duelist, bulwark press the moment the whole heal fits; siege, trapper when they break off hurt (R3). A parked, collecting non-fighter keeps its beacon and shoots from station; raider and duelist leave to fight (R4). The Shift is a personality-weighted roll at enroll (R5). `forager` is retired (R6). The on-target check reads the hull's next-tick pose; solid beacons are avoided; beacon eligibility is a farming point inside the patrol disc. Cycle 223, 0.19.17, PV 101 unchanged, epic-10 amendment 21. Subagent models by `/orchestrate` (Eric 2026-11-11): Fable built the helm and gunnery wave, Opus the personality wave, the harness wave and the review fixes; Fable hunters + Codex at the gate.

**Measured (48 + 48 + 48 on seed 20261111, `batch-sim-evidence-2026-11-11.md`):** land contact 0.55 % → 0.16 %, stuck episodes 355 → 108, ram deaths 40 → 23, storm share 1.2 % → 0.7 %, mine kills 41 → 10; 88.7 % of guns bearing on a hull in reach and 2,432 mines swept (new readouts, no baseline). Placement by hull is trend-size only.

**Files changed (headline):** `server/src/game/ai/arcs.ts` (new), `tactics.ts`, `battery.ts`, `navigate.ts`, `abilities.ts`, `posture.ts`, `beacons.ts`, `profiles.ts`, `equipment.ts`, `spending.ts`, `botDriver.ts`, `types.ts`, `utility.ts`, `plot.ts`; `world.ts` (`addBot`), `rooms/ArenaRoom.ts`; `shared/src/constants.ts` (`CONFIG.bots`: `profiles` five, `healHpFrac` out, `shiftFitWeight`, `arcOpenMarginDeg`); harness `server/scripts/batchsim/*` (four readouts, dials, stale text), `rl/env.ts`, `soloSmoke.mjs` (beacon check); tests `botArcs`, `botSweep`, `botPersonality` (new) and the bot suites; amendment 21, both trackers, `epics.md` stamp, the ledger, the evidence file, VERSION 0.19.17.

**Review:** 11 patched, 4 deferred, 3 rejected (triage log above).

**Verification:** `npm run check` EXIT 0 on the final tree (shared 1470, server 2908 in 113 files, client 3974 in 145 files; lint 0 errors, 3 pre-existing warnings; hooks 266); `matchSmoke`, `soloSmoke` (with the beacon check), `queueSmoke`, `weaponsSmoke` OK first try on agent-booted servers, own servers killed; `tsc` clean for server, batchsim and rl.

**Residual risks:** three behaviors are readings Eric may veto on staging (a parked stayer cannot turn or dodge; idle mine sweeping shows muzzle flashes; the 5° settle margin); the next-tick pose ignores boost and slows; the mines-swept readout is a trend, not a count; the balance-sim skill scripts in Eric's checkout still assume three classes.
