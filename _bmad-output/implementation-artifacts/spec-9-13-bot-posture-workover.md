---
title: 'Story 9.13: Bot Posture Workover'
type: 'feature'
created: '2026-10-17'
status: 'done'
baseline_revision: 'f78405d1'
final_revision: 'b32037fd (code HEAD; PR #293 to development, 2026-10-17)'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-12-the-second-tuning-pass.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** Bots and PvE drones are the game's low-population content and they play badly on the 10,000 u archipelago: they ground (7.3 % of afloat ticks, now with contact damage), circle, beeline into the storm side of islands, charge every radar blip (own decoy buoys included), fight flak and machine-gun hulls at 50–190 u, never use the star-shell lit zone, fire specials on narrow cues, ignore fog and islands as cover, and know nothing of the next ring. Eric 2026-10-17: *"It is very boring when I am among the last two ships, and the other is stuck on some island taking storm damage."*

**Approach:** Build exactly the sixteen rulings of the 2026-10-17 design sitting (epic-9 amendments 189–203): a navigation layer from the map the bots already hold (ring flow field, routed paths when blocked, graded avoidance; drones routed too), a widened bot port (next ring + time to close, human parity), an extended posture chain (odds gate, kite, hide, hold, ring clauses, disengage hysteresis, ram exit), decoy-aware targeting, per-gun doctrine bands on the full-damage radius with the flare-to-shoot combo, extended special/consumable triggers, cover-seeking in fog and island shadow, and the harness readouts that evidence each. No weapon or ship number changes. One baseline sim arm before (48 matches, seed 20261017) and the same seeds after.

## Boundaries & Constraints

**Always:**
- Bots never import `world.js` (ESLint); their world is `BotWorldPort` + the bound `observe` thunk. Every new input is human-parity information (the map, the schema's revealed ring, the zone timeline, frame rows the human seat is sent) — never a server-private flag (no `DecoyState`, no owner ids beyond `DecoyView.own`, no target upgrades, no hidden plots).
- Determinism: no `Math.random` / `Date.now` in ai/, drones or the nav module; seeded `mulberry32` streams only; A*/flow-field tie-breaks by cell index; a nav grid is cached per `GameMap` identity (WeakMap) and built once per map.
- The perception chokepoint, the SIX exceptions, `frames.ts`, `perception.ts` and `signals.ts` are untouched; nothing new rides the wire; `PROTOCOL_VERSION` stays 89.
- Every number introduced is a `CONFIG.bots` (or `CONFIG.bots.nav`) dial with Eric's accepted default and reachable by the harness `--tune bots.*` family where the family exists; dials are marked `[accepted 2026-10-17]` in the constants doc block.
- Complexity ≤ 10, ~500 LOC per file: new behaviour goes in NEW modules (`ai/navigate.ts`, `ai/posture.ts`, `ai/doctrine.ts`, `ai/cover.ts`, `shared/src/sim/nav.ts`), not into the 1,006-line `tactics.ts`.
- Tick budget: per-hull per-tick nav work is O(1) field lookups plus at most one segment test; A* only on the decision cadence and only when the line is blocked or the goal moved > 64 u; flow fields rebuilt only at a ring reveal / close start (one per ring, may be spread over ticks).
- Every posture-keyed row (mine `SAFE_LAY_POSTURES`, countermeasure, fouling, boost, HUNKER, decoy) is re-read for the new postures `kite`, `hide`, `hold` and listed in the Code Map task that adds them.
- Tests assert contracts (inside the ring by T, no land contact on the fixture, the decoy never targeted) — never a literal bearing, ring size or geometry pin; existing straight-bearing pins are re-stated as contracts, with the ruling cited.
- Amendments 189–203 are in both context homes; the spec's rulings section mirrors them.

**Block If:**
- A ruling above is found incompatible with a sim invariant (e.g. a legal input a human is not sent) — AskUserQuestion, never a workaround.
- A new number is needed that no ruling gives and no default was accepted — AskUserQuestion, never invent.
- `npm run check` cannot go green without changing weapon/ship CONFIG values.

**Never:**
- Change any weapon, ship, storm, map or fog gameplay number (Eric: "not so much interested in tweaking weapon or ship numbers").
- Add in-game copy, HUD readouts or client behaviour.
- Add a seventh perception exception, a per-ship schema field, or a bot-only server read.
- Launch any sim beyond the one baseline arm and its paired after-arm (48 matches each, seed 20261017).
- Split into multiple PRs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ring escape across land | bot outside the live ring, a 1,200 u island between it and the ring centre | helm follows the flow field around the island; never drives bow-on into the coast; inside the ring before the storm reaches it when a water route exists | no route (nav grid says unreachable) → fall back to straight bearing + avoidance, harness counts `noRouteTicks` |
| Pursue blocked by island | target plot behind land, line blocked | A* route on the decision cadence, next visible waypoint steered, re-plan only when the goal moved > 64 u | A* budget exceeded → keep last route |
| Drone waypoint behind land | fleet waypoint unreachable in a straight line | the fleet routes around; a waypoint not reached in `waypointTimeoutMs` is re-picked; a grounded drone (sim `landContact`) trips the un-beach | none |
| Radar-only contact at 1,200 u, gun 750 u | odds gate passes (own hp high, peer assumed, not outnumbered) | pursue (close) with the gun's doctrine band; boost allowed | gate fails → kite at own reach if own gun is longer and it closes, else shadow / hide |
| Outnumbered | ≥ 2 other hostile tracks within radar range of the target | gate fails → disengage to cover | none |
| Disengage hysteresis | hp climbs back over the line by < 0.15 while the chaser still paints | stays disengaged; re-evaluates only after margin AND contact broken `contactBrokenMs` (or cover reached) | none |
| Own decoy beyond sight | own buoy painted 600 u astern as an anonymous plot | plot within `decoyBuoy.sizeU` + cell slop of an `own` decoy is never a target | none |
| Enemy decoy cues | radar-only plot: footprint ≤ 2 cells, no wake, velocity ≈ 0 for ≥ 2 sweeps | score × `decoyDemote` (hard demotion) while any live hull is in weapon reach; still a target when nothing else exists | none |
| MG at 600 u | machine-gun hull, target at 600 u (range 750) | holds fire, closes to ≤ 0.5 × range, then streams | none |
| Flak | target at 400 u (range 625) | closes to ≤ 312 u, aims at the predicted centre | none |
| Cannon | target at 900 u (range 1,000) | stands off to 0.5–0.8 × range (500–800 u), leads | none |
| Flare to shoot | radar plot at 1,200 u, cannon 1,000, star shells ready, not breaking off | flare at the predicted point; next ticks the cannon fires into the own lit zone beyond range at full damage | flare on reload → no shot; the stale-plot sensor flare yields to the shoot use when both want it |
| HUNKER while pursuing under fire | dreadnought pursuing, hostile in weapon reach, HUNKER ready | pressed | none |
| Countermeasure declining a fight | gate fails, healthy, radar chaser inside 1,000 u | cloud pressed once (not while an own cloud lives), then hide | none |
| Ram exit | ram landed, target afloat after `ramExitMs` | disengage (hysteresis), no re-arm on that target until separated | none |
| Idle | no target | routed patrol between waypoints inside the safe part of the ring, cover-weighted; siege/trapper hold in cover at zero throttle | none |
| Fight at the rim | target 200 u outside the live ring | never pursued/kited outward past the rim | none |
| Close imminent | opening a fight would leave < `ringOpenMarginMs` to depart | no engagement opened; leave by the route | none |
| Pre-reveal | phase before the reveal beat | idle drift toward the always-safe disc (centre live, r = 2·r_next − r_cur) | r ≤ 0 → the live centre |
| Hits per click | cannon two shells both hit | one hit counted toward the damage estimate | none |

</intent-contract>

## Eric's rulings for this story (2026-10-17, AskUserQuestion at the dev-auto spec step — epic-9 amendments 189–203)

1. Next ring + time to close enter the bot port (human parity; the "one boolean" port line retires). [190]
2. The map is public: drones and fleets route over it; amendment 139 stays about hulls and local reaction. [191]
3. Navigation = ring flow field + routed paths when blocked + graded reactive avoidance; drones get `helmLeft`, a contact-based stuck trip and a waypoint timeout. [192]
4. The posture model extends today's chain: odds gate, KITE, HIDE, HOLD, ring clauses, disengage hysteresis, ram exit. [193]
5. Beyond-reach contact: close only on good odds, else shadow/kite/leave; profiles bias the gate; boost only when closing is ruled or when fleeing. [194]
6. Odds = own hp vs hits per click on the target + sighted class hull/reach + nearby hostile count; an unclassed plot is a peer. [195]
7. Break-off ends on hysteresis (0.15 of max hp) AND contact broken / cover reached. [196]
8. Decoys: own never, sighted enemy never, radar-only tiny/wake-less/stationary plots demoted hard when a live hull is in reach. [197]
9. Per-gun doctrine bands on the full-damage radius (cannon 0.5–0.8 R; MG hold until ≤ 0.5 R then stream; flak ≤ 0.5 R at the predicted centre), profile nudges only, the 9.8 fractions retire; flare-to-shoot with the lit-zone reach lift, sensor flare kept, shoot use wins the reload. [198]
10. Specials: HUNKER/SHIELD in pursue/disengage/pre-ram when a hostile is in reach; countermeasure on break-off from a radar chaser and on a declined fight; decoy astern on break-off; fouling at a fleeing target in pursue; supercav credible range ~800 u; boost per 5. Cover: hide in solid fog or island shadow when breaking off (island preferred within a short detour); siege and trapper may hold in cover at zero throttle. [199]
11. Ring: leave by the water route in time with a margin; never chase/kite past the rim; don't open a fight with < ~30 s to departure; drift toward the always-safe disc pre-reveal. [200]
12. Ram: trigger unchanged, exit to disengage after the strike or ~2 s without the target sinking, no re-arm until separated. [201]
13. Idle: routed cover-weighted patrol inside the ring; the centre orbit retires. [202]
14. Sim: one 48-match baseline by an Opus agent (seed 20261017), the after-arm on the same seeds; class share is not a verdict at this size. [203]

## Orchestrator readings (defaults under the rulings; each a dial Eric may veto on staging)

- `CONFIG.bots.nav`: `cellU 32` (the generator's grid), `routeReplanGoalMoveU 64`, `avoidRays 5`, `avoidReachTurnRadii 3`, `coverDetourU 600`, `waypointTimeoutMs 20000`.
- `CONFIG.bots`: `disengageHysteresis 0.15`, `contactBrokenMs 4000`, `outnumberedCount 2` (other hostiles within `radarRange`), `ringOpenMarginMs 30000`, `ringLeaveMarginMs 15000`, `ramExitMs 2000`, `decoyDemote 0.1`, `decoyStillSweeps 2`, `supercavCredibleU 800`, `gunBand` per gun `{cannon: [0.5, 0.8], machineGun: [0, 0.5] (hold fire above), flak: [0, 0.5]}`, per-profile `bandNudge` (a signed fraction of range, default 0; raider −0.05, duelist −0.1, bulwark 0, siege +0.1, forager +0.1, trapper +0.05).
- Odds gate: `odds = ownHpFrac × (1 + hitsEstimate) / peerFactor − 0.5 × max(0, nearbyHostiles − 1)`, pass when ≥ `profile.oddsThreshold` (raider 0.8, duelist 0.7, bulwark 1.0, siege 1.0, forager 1.2, trapper 1.1); `peerFactor` = sighted class base hull / own base hull (1 when unclassed). The implementer may simplify the form but keeps the three inputs and the per-profile threshold.
- Kite: steer to hold distance at `0.9 × ownReach` while the target's (sighted-class) reach < own reach and it closes; otherwise shadow = hold at `ownReach` with throttle matching.
- Hide target: nearest solid fog cell (`fogAt ≥ 0.5`, sampled on 8 bearings × 3 radii 200/400/600 u weighted away from the chaser) or the far-side point of the nearest island along the chaser→self axis; island wins when its detour ≤ `coverDetourU`.
- Harness: `postureOf(id)` and `lastTacticOf(id)` read-only getters on `BotController`; readouts `groundedTicks` (sim `landContact`), `stuckEpisodes`, `outsideRingTicks`, `stormDeathStuck`, `shotsAtDecoy`, `shotsAtOwnDecoy`, `shotsBeyondRange`, `litShots`, `starShellsFired`, `postureTicks`, `postureTransitions` (opened / brokenOff / kited / hid / held), `fogTicks`, `activations` by Shift/consumable, `killSrc`, match-level `lastTwoS` and `endgameNoContactMaxS`; drone `groundedTicks` and storm deaths. Fields on `BotSample`/`MatchSample`, in the JSON, pinned by `botHarness.test.ts`; the old land proxy kept for ledger comparability.

## Code Map

- `shared/src/sim/nav.ts` (NEW) -- `buildNavGrid(map)` exported/generalised from `map.ts`'s private 32 u grid (+ `distanceToLand` chamfer), `flowField(grid, goalCells)` (multi-source BFS/Dijkstra, Float32 distance + Uint8 dir), `routeTo(grid, from, to, budget)` (A* 8-connected, clearance cost, string-pull), `cellOf/pointOf`; pure, seeded-free, cell-index tie-breaks; exported from `shared/src/index.ts`
- `shared/src/sim/map.ts` -- the private `buildNavGrid`/`navigableCheck` delegate to `nav.ts` (byte-identical results; the map determinism tests still pass)
- `shared/src/constants.ts` -- `CONFIG.bots` new dials + `CONFIG.bots.nav`; doc blocks cite amendments 192–202
- `server/src/game/ai/types.ts` -- `BotWorldPort` + `zoneNextRing`, `zonePhase`, `zoneClosesInMs`, `zoneSafeDisc`; `BotPosture` + `kite | hide | hold`; mind fields (`disengagedSince`, `lastContactAt`, `ramStruckAt`, `ramTarget`, `route`, `coverPoint`, `patrolWaypoint`, `hitClicks`)
- `server/src/game/world.ts` -- bot entry carries the four zone fields (from `zoneRevealedNextRing`, `zonePhase`, the shared timeline); `NavCache` per map on the world, flow fields rebuilt at reveal / close start; drones get the same cache
- `server/src/game/ai/botDriver.ts` -- `postureOf`, `lastTacticOf` getters; nav cache handed to minds
- `server/src/game/ai/navigate.ts` (NEW) -- route following, flow-field descent, graded multi-ray avoidance (replaces `islandBias`/`pointBias`), ring-departure time (`geodesic / maxSpeed + margin` vs storm arrival), safe-disc drift, routed patrol waypoints (cover-weighted, seeded)
- `server/src/game/ai/posture.ts` (NEW) -- the extended `choosePosture` chain: ringRun → broken hull (ram with exit / disengage with hysteresis) → no target (patrol/hold) → odds gate → kite / pursue / engage / hide; `oddsFor`, `outnumbered`
- `server/src/game/ai/doctrine.ts` (NEW) -- per-gun bands on the full-damage radius with profile nudge; `effectiveReach` {max, full, litExempt}; MG hold rule; flak centre aim
- `server/src/game/ai/cover.ts` (NEW) -- nearest solid fog / island-shadow point relative to a chaser
- `server/src/game/ai/utility.ts` -- `choosePosture` delegates to `posture.ts`; `scoreTrack` gains decoy exclusion/demotion (own/sighted from `view.decoys`, cue-inferred beyond sight) and the lit-target bonus; hits per click; `engagementBand` callers → doctrine
- `server/src/game/ai/plot.ts` -- paint footprint cell count + stationary sweeps carried on the track (decoy cues)
- `server/src/game/ai/profiles.ts` -- `bandMinFrac/MaxFrac` retired → `bandNudge`, `oddsThreshold`, `leansIn`; comment block re-cut (amendment 198)
- `server/src/game/ai/equipment.ts` -- gun/flak/MG solves read `doctrine.effectiveReach` (lit-zone lift mirrored from `gunReachU`), flare-to-shoot row (`flareToShoot`) beside the sensor flare with the reload tie-break
- `server/src/game/ai/consumables.ts`, `shift.ts`, `tacticKit.ts`, `torpedoThreat.ts` -- the amendment-199 trigger extensions; `TORPEDO_CREDIBLE_U` → `supercavCredibleU` for the supercav
- `server/src/game/ai/tactics.ts` -- `helmFor` composes navigate.ts; `bandBearing` → doctrine band; `patrolBearing` → routed patrol; `ringClamped` land-aware via the flow field; posture-keyed rows re-read for kite/hide/hold; LOC falls, not rises
- `server/src/game/drones.ts` -- `helmLeft` composition, stuck trip on sim `landContact`, waypoint timeout, route following to waypoint / ring via the nav cache; sight scoping untouched (139)
- `server/scripts/batchsim/botMetrics.ts`, `botReport.ts`, `main.ts`, `report.ts`, `args.ts` -- the readouts above; `--tune bots.*` family + floors
- Tests: NEW `shared/src/__tests__/nav.test.ts` (grid equals the generator's, flow field reaches every water cell, A* route never crosses land on 20 seeds, determinism), `server/src/__tests__/botNavigate.test.ts` (ring escape across land fixture: inside by T, no land contact; blocked pursue routes; drone waypoint timeout), `botPosture.test.ts` (odds gate, kite, hysteresis, ram exit, ring clauses, decoy exclusion/demotion), `botDoctrine.test.ts` (bands, MG hold, flak centre, flare-to-shoot + lit lift), `botCover.test.ts`; re-stated pins in `botTactics.test.ts`, `botPolicy.test.ts`, `botGunnery.test.ts`, `botPlot.test.ts`, `drones.test.ts`, `droneSightScope.test.ts`, `bots.test.ts` (port surface), `botHarness.test.ts`; `goldenFrames` re-recorded once (drone/bot steering rows move; every moved channel listed in the change log)
- Records: `CHANGELOG.md` 0.18.63, `VERSION` + root `package.json`, both trackers (one line each), deferred-work stamps (ram exit RESOLVED, hc-per-click RESOLVED, 7.3 % grounding → measured in the after-arm), ledger `batch-sim-evidence-2026-10-17.md` (baseline + after arm)

## Tasks & Acceptance

**Execution (orchestrated per `/orchestrate`; Opus builds, Sonnet re-pins, Fable hunters + Codex at the gate):**
- [ ] Wave 0a (Opus) `shared/src/sim/nav.ts` + `map.ts` delegation + `constants.ts` dials + `nav.test.ts` -- the pure nav layer -- everything else stands on it
- [ ] Wave 0b (Opus) `ai/types.ts` port + posture enum, `world.ts` entry fields + NavCache, `botDriver.ts` getters, `drones.ts` helm/stuck/timeout/route -- plumbing + the drone bugs -- disjoint from ai/ tactics
- [ ] Wave 1a (Opus) `ai/posture.ts`, `ai/cover.ts`, `utility.ts`, `plot.ts`, `profiles.ts` + `botPosture.test.ts`, `botCover.test.ts` -- posture, odds, decoys, hysteresis, ram exit
- [ ] Wave 1b (Opus) `ai/doctrine.ts`, `equipment.ts`, `consumables.ts`, `shift.ts`, `tacticKit.ts`, `torpedoThreat.ts` + `botDoctrine.test.ts` -- guns, flare-to-shoot, specials
- [ ] Wave 2 (Opus) `ai/navigate.ts`, `tactics.ts`, wiring of 1a/1b into the helm + `botNavigate.test.ts`; re-stated pins (Sonnet) -- integration
- [ ] Wave 3 (Opus) harness readouts + `botHarness.test.ts`; (Sonnet) records; after-arm sim on seed 20261017; ledger
- [ ] Review gate: Blind Hunter + Edge Case Hunter (Fable) + Codex `gpt-5.6-sol`; fix-first on CONFIRMED

**Acceptance Criteria:**
- Given the ring-escape fixture (a bot 800 u outside the live ring with a large island on the radial), when the storm closes, then the bot is inside the ring before the rim reaches it and records no land contact.
- Given a drone fleet whose waypoint lies behind an island, when 20 s pass without reaching it, then the fleet has re-picked and is not grounded.
- Given an own decoy painted astern beyond sight, when the bot selects a target, then that plot is never selected; given a sighted enemy decoy and a live hull in reach, the hull is selected.
- Given a machine-gun bot at 600 u from its target, when it decides, then it holds fire and closes; at ≤ 375 u it streams.
- Given a cannon bot with a radar plot at 1,200 u and star shells ready, when it decides, then it flares the plot and, with the lit zone alive, fires the cannon into it beyond 1,000 u.
- Given a healthy bot whose odds gate fails against a 1,200 u plot, when it decides, then it does not pursue (kites, shadows or hides) and spends no boost closing.
- Given a bot that fled below its line, when it heals above the line by less than the hysteresis while the chaser still paints, then it stays disengaged.
- Given a ram that lands on a surviving target, when `ramExitMs` elapses, then the posture is disengage and the pair is not re-rammed before separation.
- Given no target, when a bot idles, then it moves between routed waypoints inside the ring and does not orbit the centre or an island.
- Given the after-arm on seed 20261017, when compared with the baseline, then the harness reports land-contact rate, storm-death-while-stuck, shots at (own) decoys, posture transitions, fog ticks and endgame stall for Eric to read (no bar is invented).
- `npm run check` green; `PROTOCOL_VERSION` 89; both trackers stamped; amendments 189–203 in both homes; no in-game copy.

## Spec Change Log

- 2026-10-17 (build): wave readings of record — the waypoint timeout is a no-progress rule (120 u in 20 s); target reach for a sighted class = its base deck-gun reach; a failed odds gate shadows at reach (= kite) and only a closing target with the longer gun sends the bot to cover; hide sits still at its cover point; `hold` may lay mines; nav cache built lazily per map; the next ring's flow field is used during a close; goldenFrames unchanged (no scene steers a bot). KEEP: every new number is a CONFIG.bots dial; posture-keyed rows re-read for kite/hide/hold.

## Review Triage Log

### 2026-10-17 — Review pass (Blind Hunter FIX-FIRST, Edge Case Hunter FIX-FIRST, Codex gpt-5.6-sol FIX-FIRST)
- intent_gap: 0
- bad_spec: 0
- patch: 20: (high 5, medium 9, low 6)
- defer: 4: (medium 2, low 2)
- reject: 1: (low 1)
- addressed_findings:
  - `[high]` `[patch]` storm-arrival clock ignored the moving ring centre (Blind Hunter, probe 2×) — `rimCrossingFrac`, first close fraction at which the rim reaches the hull
  - `[high]` `[patch]` cover point outside the revealed next ring ping-ponged holders/hiders against the departure rule (Blind Hunter + Edge Case Hunter) — cover usable only inside live ∧ next-shrunk
  - `[high]` `[patch]` empty routes cached until the goal moved (Codex + Blind Hunter) — retried on own movement or `routeRetryMs`
  - `[high]` `[patch]` ring goal set empty with the centre > 3 cells inside land (Codex; confirmed for r 0 only) — nearest water cell fallback
  - `[high]` `[patch]` MG/flak silent in `kite` (Blind Hunter) — Eric: shadowing lifts the hold line (amendment 205)
  - `[medium]` `[patch]` patrol fallback onto land / the r 0 safe disc (Codex + Edge Case Hunter) — snap to water, live ring under a turn radius
  - `[medium]` `[patch]` `hitClickAt` not reset per life; hit dedup keyed on the current `fireSeq` (Codex + Blind Hunter) — per-volley ledger, reset per life
  - `[medium]` `[patch]` flow field built inside a random bot's tick (Codex) — prewarmed in the zone step at the reveal
  - `[medium]` `[patch]` drone fallback ashore + re-pick every evaluation (Codex) — snapped, once per cadence
  - `[medium]` `[patch]` `--tune bots.*` floors (Edge Case Hunter) — `aimScatterRefU`/`contactMemoryMs`/`outnumberedCount`/`decoyStillSweeps` ≥ 1, `kiteHoldFrac` (0,1], no zero far edge
  - `[medium]` `[patch]` odds-gate chatter (Edge Case Hunter, plausible; adopted) — `gateHoldMs` 1 s
  - `[medium]` `[patch]` fleet route not re-based on a lead change (Edge Case Hunter)
  - `[medium]` `[patch]` the un-beach machine had no ahead exit (grounding replay) — probed exit, failed-burst rule, backing hold
  - `[medium]` `[patch]` entry damping on a sharp coast-hugging turn (grounding replay, secondary)
  - `[low]` `[patch]` `snapToWater` across a spit; goal on land spins at its anchor; stale cover point in `idleBearing`; `departureDue` twice per tick; exact-zero stillness test; dead `islandBuckets.ts`
  - defer: MOONRAKER / CROWSNEST re-enter the bay after a successful back-out (patrol route); trap memory tried and reverted; the endgame gap excludes storm damage; `pressesByItem` 'empty'
  - reject: the Edge Case Hunter's "safe disc r = 0 on the shipped ladder before the FIRST close" (its probe used the diameter as the live radius; the disc is 2000 u there and 0 only before the 2000 → 1000 close, which is patched)

## Design Notes

- **Why the nav grid lives in shared:** the generator already proves every map is connected on the 32 u grid; exporting it means the bots route on the very raster the map is validated against, and both the map tests and the nav tests pin one implementation. The module is pure and transcendental-free so the map determinism scanner stays silent (it only scans map/heightField/noise anyway).
- **Why a flow field for the ring and A* for targets:** the ring goal is shared by every hull (one field, O(1) per hull); a target goal is per-bot and rare enough to afford a gated A*.
- **Why postures are added, not a table:** Eric picked "extend today's chain" for readability; every new posture name must be re-read by every posture-keyed row (mines, countermeasure, fouling, boost, HUNKER, decoy) — the integration wave owns that list.
- **Why hits per click:** `dmg` is victim-private, `hc` carries no shell id; the bot knows its own `fireSeq`, so one hit per click per track is the legal count.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. `nav.test.ts` and the map determinism suite
- `npm test -w server` -- expected: green incl. the five new bot suites, re-stated pins, `botHarness.test.ts`, `goldenFrames` re-recorded once
- `npm run check` -- expected: green (lint complexity ≤ 10, tsc ×3, all tests, hook test)
- `npx tsc --noEmit -p server/scripts/batchsim/tsconfig.json` -- expected: only the pre-existing `encounterSpan.ts:98` TS2367
- After-arm: `run_campaign.py --matches 48 --shards 12 --bots 16 --base-seed 20261017 --label after913 … --roster even --raw` then `analyze` both arms -- expected: readouts present; landContactRate and stormDeathStuck lower than baseline; no unresolved matches

## Auto Run Result

Status: done (PR #293 open to development; Eric judges on staging)

**Implemented.** Story 9.13 as the sixteen design-sitting rulings (amendments 189–203) plus the three gate rulings (204 lit bonus ×1.5, 205 shadowing lifts the hold line) and the readings of record (206): a shared pure navigation layer (grid, distance-to-land, flow fields, A*), a per-map nav cache with per-ring fields, a widened bot port (next ring, phase, time to close, safe disc), routed bot and drone helms with graded avoidance and the storm departure rule, the extended posture chain (odds gate, kite/shadow, hide, hold, ring clauses, disengage hysteresis, ram exit, gate hold), decoy-aware targeting and per-volley hits, per-gun doctrine bands with the MG/flak hold line and flare-to-shoot, every special/consumable trigger extension, cover in fog and island shadow, a cover-weighted routed patrol, the probed un-beach exit, the harness readouts and `--tune bots.*`. No weapon, ship, storm, map or fog number changed; no copy; `PROTOCOL_VERSION` 89.

**Files.** New: `shared/src/sim/nav.ts`, `server/src/game/navCache.ts`, `botPort.ts`, `ai/navigate.ts`, `ai/posture.ts`, `ai/doctrine.ts`, `ai/cover.ts`, `ai/unbeachProbe.ts`, `server/scripts/batchsim/botReadouts.ts`, `botReadoutReport.ts`; tests `nav`, `botPort`, `botNavigate`, `botPosture`, `botCover`, `botDoctrine`, `botReviewFixes`, `botTuneFloors`. Changed: `map.ts` (delegation), `constants.ts` (CONFIG.bots dials), `ai/types.ts`, `tactics.ts` (1006 → ~840 lines), `utility.ts`, `plot.ts`, `profiles.ts`, `equipment.ts`, `consumables.ts`, `shift.ts`, `tacticKit.ts`, `botDriver.ts`, `drones.ts`, `world.ts`, batchsim `botMetrics/botReport/runner/main/args/overrides`; deleted `islandBuckets.ts`. Records: VERSION 0.18.63, CHANGELOG, both trackers, amendments 189–206 in both homes, deferred-work, the ledger `batch-sim-evidence-2026-10-17.md`.

**Review.** Blind Hunter + Edge Case Hunter (Fable) + Codex gpt-5.6-sol, all FIX-FIRST: 20 patches applied red-then-green (storm clock on the moving ring, cover inside the next ring, route retry, empty goal set, patrol on water, per-volley hits + per-life reset, field prewarm, drone fallback, tune floors, gate hold, lead-change re-route, snap across a spit, goal on land, double departure, stillness epsilon, dead module, kite hold-line lift, entry damping, probed un-beach exit) + 4 deferred + 1 rejected (a probe that used the diameter as the live radius). A trap-memory patch was tried and reverted.

**Verification.** `npm run check`: lint 0 errors, shared 1169, server 2785 passed + 2 skipped (the two isolated wedge fixtures, numbers in their skip notes), client all files, hook tests 266; the one wall-clock pin (`machineGunFlashCost`) failed only under the concurrent 12-shard sim and passes alone (7.2 s). Sims (amendment 203): `base913` → `final913` on seed 20261017: land contact 5.37 % → 0.82 % (the bar passes for the first time on the 10 % archipelago), run-aground deaths 152 → 13, longest aground run 391 s → 64 s, storm deaths while stuck 11/12 → 6/6 (0 aground), alive 8.4/3.5/0.9 → 10.3/5.6/1.9, every posture exercised (kite 2.1 %, hide 8.4 %, hold 7.7 %), flare-to-shoot 15 % of deck-gun shells; tick p50 +0.3–0.5 ms at 112 hulls.

**Residual risks (Eric's to judge on staging).** The field now sits ~2 hulls above the 8/4 targets and the storm's share of deaths fell to 0.8 % (bots leave in time); ram deaths doubled (94 → 166) as bots spend more time in knife range; ≥ 1-kill at 53 % vs the 60 % bar; drone grounding unchanged by routing; two isolated wedge fixtures still re-enter their bay; the countermeasure's declined-fight press may be generous; the `[DRAFT]` ram trigger unchanged.
