---
title: 'Story 6-4 — Combat-Bot AI'
type: 'feature'
created: '2026-08-16'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-6-4-combat-bot-ai-questions.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Solo vs AI (Story 6-5) is the launch-day first match for most players, and there is no
combat AI to fill it. The only AI in the repo is the PvE fleet mind (`drones.ts`), which is
omniscient by design (reads `world.ships` directly), gun-only, and never hunts. Bot quality sits on
the retention critical path.

**Approach:** A new `server/src/game/ai/` module driving `role: 'bot'` ships whose ONLY world
knowledge is `perception.observe()` and whose only output is a validated `InputMsg` — structurally
unable to cheat. Utility scoring over that perception picks a target and a posture; per-class
**priority profiles** (Eric ruling) decide what each bot wants; a class-doctrine weight table spends
banked levels through the public `World.spendPoint`. A `combat` batch-sim pilot driving the real
brain measures quality.

## Boundaries & Constraints

**Always:**
- A bot's world knowledge comes EXCLUSIVELY from `perception.observe(world, botId)`, called at most
  once per bot per tick. Never read `world.ships`, `world.shells`, `world.mines`, `world.decoys` or
  any other world collection for perception. (`ShipRecord` self-reads for the bot's OWN hp/ammo/
  reload/boons/offer are legitimate — that is the bot's own `OwnShip` equivalent.)
- Intent leaves ONLY through `world.submitInput(botId, msg)` with a complete `InputMsg`, `fireT: 0`.
  No privileged setter, no direct state mutation.
- `server/src/game/ai/` may import from `./perception.js`, `./inputs.js`, `./participants.js`,
  `./signals.js` (types only), `@salvo/shared`, and its own files. It may NOT import `world.js`,
  `match.js`, `drones.js`, `frames.js`, `equipment/*` or anything under `../rooms/`. `World` is
  reachable only as a TYPE (`import type`) plus the two narrow methods the driver is handed.
- `isHuman` must stay FALSE for `'bot'` — FR34 (`minHumans`/countdown counts people only).
- One `botsTick` row in `STEP_ORDER`, immediately BEFORE `applyInputs`, beside `dronesTick`.
  Never in `ArenaRoom` — `World` stays Colyseus-free and headless.
- Every bot-facing tunable lives in `CONFIG.bots` in `shared/src/constants.ts`.
- `PROTOCOL_VERSION` does NOT move. No wire shape changes.

**Block If:**
- Any change would require a new wire field, a `PlayerMeta` schema change, or a PV bump.
- The `ai/` import boundary cannot be expressed without a new ESLint plugin dependency.
- A bot needs information `observe()` does not return (report it; do not widen perception).

**Never:**
- No room option, no queue change, no mode plumbing, no client change — Story 6-5 owns all of it.
  Nothing in production may construct a bot this cycle (harness + tests only). This is deliberate.
- Do not modify `drones.ts` / `FleetController`, or `perception.ts` / `signals.ts` behaviour.
- Do not "fix" the `mineDamage`×`minePropFouling` pick-order bug or special-case bots around it
  (Eric-confirmed: bots eat it exactly as humans do).
- Do not retire the omniscient batch-sim pilots (`gunner`/`pacifist`/`endgame`) — they are pinned
  storm-evidence controls.
- No bot coordination, no focus-fire packs, no foghorn use, no respawn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| No contacts | `observe()` returns empty | Bot patrols toward the live ring centre, throttle > 0, never fires | No error |
| Contact in sight | Live `Contact` inside the utility horizon | Selects best target by profile-weighted utility, steers to its engagement band, fires when a weapon is loaded and legal | No error |
| Blip only (`silhouette`) | Radar blip, no live contact | Treats as a low-confidence contact at last-known pose, decaying over `CONFIG.bots.contactMemoryMs` | No error |
| Blip only (`return` grammar) | Raster mask, no identity | Derives a bearing/position from cell geometry only; no id, class, heading or speed | Must not crash on either grammar |
| Frozen boarding room | `helmEnabled === false` | Brain no-ops; emits neutral input; never advances `fireSeq` | No error |
| Outside the live storm ring | `isOutside(pose, ring)` | Ring escape overrides all other steering | No error |
| Low HP | `hp / maxHp < disengageFrac` | Disengages; spends a banked level on HEAL if `hp/maxHp < healFrac` | No error |
| Level banked | `bankedLevels > 0` | Calls `world.spendPoint(botId, choice)` once per tick at most | `spendPoint` returning false is non-fatal |
| Grounded | Land contact, `headOn > 0` | Reverses and turns off the coastline within `stuckMs` | Must not beach permanently |
| Sinking / sunk | `isSinking`/`isSunk` | Brain releases per-bot state; emits nothing | No error |
| Bot id unknown to World | `observe()` fail-closed empty view | Neutral input, no crash | Fail-closed |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- add `CONFIG.bots` (profiles, weights, scatter, latency, thresholds,
  cadence, callsign pool). The single source of truth for every bot tunable.
- `server/src/game/participants.ts` -- add `'bot'` to `ShipRole`. `isParticipant` (`!== 'fleet'`)
  and `isHuman` (`=== 'captain'`) already give the right answers unchanged.
- `server/src/game/world.ts` -- `botsTick` STEP_ORDER row before `applyInputs`; `BotController`
  construction beside `FleetController`; `addBot(...)` spawn helper.
- `server/src/game/ai/types.ts` -- `BotMind`, `BotProfileId`, `BotView`, the driver's narrow World
  port. NEW.
- `server/src/game/ai/profiles.ts` -- the six priority profiles + per-class boon weight tables. NEW.
- `server/src/game/ai/utility.ts` -- target scoring, threat, posture selection. NEW.
- `server/src/game/ai/tactics.ts` -- steering, lead solving, per-weapon fire decisions, island and
  boundary avoidance, un-beaching. NEW.
- `server/src/game/ai/spending.ts` -- boon pick policy + heal decision. NEW.
- `server/src/game/ai/botDriver.ts` -- `BotController`: per-bot state, staggered observe cadence,
  `InputMsg` emission. THE perception chokepoint. NEW.
- `eslint.config.js` -- `no-restricted-imports` boundary for `server/src/game/ai/**`.
- `server/scripts/batchsim/pilots.ts` -- a `combat` pilot driving the REAL brain.
- `server/scripts/batchsim/runner.ts` + `args.ts` + `report.ts` -- bot lobby construction, `--bots N`,
  bot-vs-bot metrics.
- Reference only (do not edit): `server/src/game/drones.ts` (port the maths, not the module),
  `shared/src/sim/aim.ts` (`burstPointAlong`, `blockedWater`), `shared/src/sim/loadout.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `server/src/game/participants.ts` -- add `'bot'` to `ShipRole` -- the participant seam
      amendment 13 built for exactly this; update the file header's "HOW 6.4 EXTENDS THIS" note.
- [ ] `shared/src/constants.ts` -- add the `CONFIG.bots` block -- every tunable in one place, per the
      project's CONFIG-is-truth rule.
- [ ] `server/src/game/world.ts` -- add `botsTick` to `STEP_ORDER` immediately before `applyInputs`,
      construct `BotController` beside `FleetController` on a decorrelated seed, add `addBot()` --
      bot input must be consumed the same tick, exactly as fleet input is.
- [ ] `server/src/game/ai/types.ts` + `botDriver.ts` -- the controller and its perception contract --
      one `observe()` per bot per cadence tick, round-robin stagger, per-bot mind state.
- [ ] `server/src/game/ai/profiles.ts` -- the six profiles and the boon weight tables.
- [ ] `server/src/game/ai/utility.ts` -- target selection and posture scoring over the perception view.
- [ ] `server/src/game/ai/tactics.ts` -- steering and weapon handling per class/profile.
- [ ] `server/src/game/ai/spending.ts` -- doctrine-weighted boon picks + the heal rule.
- [ ] `eslint.config.js` -- the `ai/` import boundary via built-in `no-restricted-imports`.
- [ ] `server/scripts/batchsim/*` -- the `combat` pilot + bot lobby + bot-vs-bot metrics.
- [ ] `server/src/__tests__/bots.test.ts` -- unit + property tests incl. every I/O matrix row.
- [ ] `server/src/__tests__/stepOrder.test.ts` -- extend the order-identity pin with `botsTick`.
- [ ] `server/src/__tests__/participants.test.ts` -- promote the hypothetical `'bot'` row to real.

**Acceptance Criteria:**
- Given a bot ship, when it acts, then its only perception source is `perception.observe()` and its
  only output is `world.submitInput` — proven by a test that stubs the world collections and shows
  the bot's behaviour is unchanged, and by the lint boundary failing the build on a forbidden import.
- Given 19 bots, when the world steps, then `observe()` is called at most once per bot per tick and
  on average ~`botCount / (cadenceMs / simDtMs)` times per tick — measurably at or below the 20
  calls/tick a full human lobby already costs.
- Given a bot of each class, when it holds a banked level, then it spends it through
  `World.spendPoint` and its fitted boons reflect its class weight table.
- Given a bot-only lobby in the batch-sim, when matches run, then the quality bar in Verification is
  met and reported.
- Given `isHuman`, when applied to a bot, then it returns false and no bot can arm a countdown.
- Given the storm ring closing, when a bot is outside it, then ring escape overrides target pursuit.
- Given a bot driven onto a coastline, when it grounds, then it clears within `CONFIG.bots.stuckMs`.

## Spec Change Log

## Review Triage Log

## Design Notes

**Eric's rulings (2026-08-16) that shape this — full text in the question-gate artifact:**
A1 no playable path (harness + tests only; 6-5 wires it). B3 no targeting preference — best target
by the bot's own reckoning. C1 TB hit-and-run, TB-vs-TB becomes a rear-quarter dogfight. C2 BS
maximizes survivability, and DOES use star shells (on `siege`). C3 ML clears fleets for a level lead.
D1 class-doctrine weights. E1/E2 **not a difficulty ladder — 2-3 priority profiles per class at ONE
competence level.**

**The six profiles** (assigned per-bot at spawn off the seeded RNG):

| Class | Profile | Priority |
|---|---|---|
| TB | `raider` | Isolated/damaged targets, torpedo opener at credible range, boost out |
| TB | `duelist` | Rear-quarter turn-fight vs peers; guns through the 30s torpedo reload |
| BS | `bulwark` | Attrition; holds ground, trades on HP, disengages late, hull/repair boons |
| BS | `siege` | Standoff; cannon-led, star shells to resolve stale contacts into live sight |
| ML | `forager` | Fleet clearing for the level lead; avoids captains early |
| ML | `trapper` | Mines astern while withdrawing; decoy to break locks; fights near its field |

**Why the rear-quarter dogfight is more than flavour:** the torpedo's bow ±30° arc means being
behind a TB denies its best weapon while keeping yours available; the mine's astern ±60° arc means
the same manoeuvre against a Mine Layer is dangerous. The geometry already rewards it.

**Difficulty is ONE level, expressed through two knobs** (`CONFIG.bots`): an aim-point scatter (the
fleet AI's precedent — `CONFIG.fleet.aimScatterU` is 8-25u; a captain-grade bot should be tighter,
~6u at 250u, range-scaled) and a reaction latency (a contact must persist `reactionMs` before the
bot acts on it). Both are expected to be retuned by eye later.

**Port the maths, not the module.** `drones.ts` already has a working 3-iteration intercept solver
(`aimPoint`), nearest-coastline island avoidance (`islandBias`), boundary bias and un-beaching. The
ledger explicitly warns `fleetAI` is not reusable as combat bots (different perception boundary), so
re-implement in `ai/` against the perception view rather than sharing the module.

**Known trap, deliberately unmitigated:** a doctrine-preferring ML bot hits the unruled
`mineDamage`×`minePropFouling` pick-order bug (53 vs 45 hp) systematically. Eric-confirmed: leave it.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, including the new `ai/` boundary rule; complexity ≤ 10 holds.
- `npm run check` -- expected: lint + type-check + all tests pass (4309 + new).
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --bots 20 --matches 50 --seed 7` -- expected:
  the quality table below.

**Quality bar (report the measured table):**
- Matches resolving before the 16:00 collapse: > 95%
- No single bot takes > 40% of a match's kills; ≥ 60% of bots score ≥ 1 kill
- Storm deaths: 5-20% of all deaths
- Bot-ticks in land contact: < 1%
- Banked levels spent before death: > 90%

**Manual checks:**
- `git grep -n "world\." server/src/game/ai/` -- expected: only the narrow port methods
  (`submitInput`, `spendPoint`, and read-only `now`/`map`/ring accessors), never a collection scan.
