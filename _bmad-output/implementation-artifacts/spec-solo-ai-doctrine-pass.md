---
title: 'Solo vs AI: the doctrine pass — bots that use the finalized cards, and a blind-vacuum test rig'
type: 'feature'
created: '2026-08-20'
status: 'done'
baseline_revision: 'd12ca0a0da95649e5a3b0871573b6115e517a2aa'
review_loop_iteration: 1
final_revision: '5bac4bf'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Story 7-5 finalized the weapons and the 23-line card catalog, but the combat bots were only *mechanically* re-pointed at the surviving card ids — no behaviour was taught. Bots read **zero** doctrine verbs (`mine.captive`, `torpedo.homing`, `starShells.dazzle`, `radarBuoy.jamming`, `broadside.spreadRung` are all in scope on `BotSituation.stats` and never accessed), never deploy the RADAR BUOY at all, never fill their extra slot because every acquisition card scores the 0.5 unlisted default, and `forager` weights `mineCaptive` at 2.4 on a rationale the shipped mechanics contradict. Meanwhile the batch-sim's lethality baseline is an **omniscient** scripted pilot that reads `world.ships` directly, so it cannot evaluate the intel/counter-intel half of the very catalog this cycle must measure.

**Approach:** One cycle, three coupled moves. (1) Retire the omniscient `gunner` and the lethal half of `endgame`; keep `pacifist` as a frozen storm-pacing control and rehome `pickSpendChoice` so `--deck-only` survives. (2) **Split bot policy onto two axes (Eric ruling, 2026-08-20).** A SHIP profile owns temperament, targeting and where the hull wants to fight; an EQUIPMENT TACTIC owns how one weapon is used and travels WITH THE WEAPON, so a Battleship that acquires mines inherits real mine knowledge instead of having none. Every doctrine verb gets exactly one behavioural consumer, inside its equipment's tactic. (3) Add three **test-only** random-spend profiles — one per hull, outside `CONFIG.bots.profiles` so they can never be assigned to a real Solo vs AI opponent — for an unbiased blind-vacuum read on card performance.

## Boundaries & Constraints

**Always:**
- `ai/` may import ONLY `@salvo/shared`, `../inputs.js`, `../participants.js`, `../signals.js` (types), `import type` from `../perception.js`, and siblings. `world.js` is banned including type imports; the token `observeSpectator` may not appear in any file under `ai/` (pinned: `bots.test.ts:278-299`).
- A bot's only world knowledge remains `perception.observe()` and its own `ShipRecord`. **A fairness or realism change may slow a bot's reactions; it may never widen its perception** beyond parity with what a human client is sent (epic-6 amendment 32).
- Determinism: `mulberry32` only, no `Math.random`/`Date.now`. `enroll()` must keep performing its class roll even when overridden, or every downstream bot's callsign and mind seed shifts (pinned: `bots.test.ts:172-178`). A random spend policy takes its **own decorrelated stream** — never `mind.rng`, whose only consumer is aim scatter.
- `chooseSpend`'s weighted path stays pure and rng-free; only the random-spend profiles may draw.
- Ranges stay fractions of the bot's own `stats.radarRange` (the eighths ladder). No literal ranges in `profiles.ts`.
- Every per-line key in `CONFIG.bots.boonWeights` must name a real catalog line (pinned: `botPolicy.test.ts:656`).
- `BotProfile` fields must each have a consumer — the deleted `aggression` dial precedent.
- The two axes stay separated: weapon geometry, arcs, placement and doctrine handling live ONLY in `EQUIPMENT_TACTICS`; the ship profile may express appetite, targeting, band and posture and nothing else. A per-(profile × equipment) override table is the flat model this replaces and is forbidden.
- Cyclomatic complexity ≤ 10 (ESLint error).

**Block If:**
- A change would require widening `BotWorldPort` beyond facts the client already receives via `ArenaState` (i.e. beyond parity). `zoneEndgameReached` is authorized by this spec as parity; anything further is not.
- Re-tuning a shipped combat constant in `CONFIG.gun`/`torpedo`/`mine`/`broadside`/`starShells`/`radarBuoy`/`speedBoost`/`shipClasses`, or any card's effect magnitude. This cycle tunes BOT POLICY only.
- A profile's identity would have to change to make a doctrine work (e.g. making `forager` stop farming fleets).

**Never:**
- Do NOT add test-only profile ids to `CONFIG.bots.profiles` — that table is what in-game Solo vs AI draws from (`ArenaRoom.buildBotFleet` → `botDriver.ts:165`).
- Do NOT bump `PROTOCOL_VERSION` (stays 43). `CONFIG.bots` rides `WelcomeMsg.config` but has zero readers in `client/` — same adjudication as epic-6 amendment 24.
- Do NOT import the batch-sim's `pickSpendChoice` into `ai/` (`spending.ts:30-31` refuses it by design: measurement instrument, not canon).
- Do NOT build bracket-and-walk fire (the `sp` splash consumer) — ledgered as needing its own cycle with a measured hit-rate shift.
- Do NOT add a staleness budget to blip shooting. Eric ruling (cycle 99): *"shooting at radar blips is definitely a skill"*.
- No client changes. No wire-shape changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Buoy sited with nothing tracked | ML bot, `reposition` posture, buoy slot loaded | `buoyShot` returns a placement in the astern sector within `CONFIG.mine.placeRange`; reached because the buoy branch sits ABOVE `chooseShot`'s `target === null` guard | Blocked water → no shot, pool untouched |
| Buoy vs mine same tick | Both slots loaded, `disengage`, pursuer astern | Mine wins (answers an immediate threat); buoy waits — only one `fireSlot` per tick | n/a |
| Captive mine held | `stats.mine.captive === true` | Placement moves to full `placeRange` (trip ring is 144u, not 32u) and laying becomes proactive; profile does NOT lay captive mines to farm fleet | Fleet-only target → no lay |
| Homing torpedo held | `stats.torpedo.homing === true` | Credible-range gate widens; still capped by `homingMaxRangeU` and never fired at a plot requiring more than the 120u turn radius to correct | Out of bow arc → denial avoided, no consume |
| Dazzle held, live contact in sight | `stats.starShells.dazzle === true` | Flare becomes offensive: fired at a LIVE contact inside sight rather than only at a stale far plot | No live contact → falls back to sensor use |
| Enemy jamming buoy | 10 fake blips/revolution in a 330u disc | Long-reload ordnance (torpedo/broadside) is not committed to a plot lacking persistence; gun fire unchanged (blip shooting is a skill) | Fake never appears inside truesight — structural |
| Acquired equipment | TB bot fits star shells via `acquireStarShells` | Bot fires them — `chooseShot` iterates fitted slots through `EQUIPMENT_TACTICS`, so capability is read from the loadout, never from the hull | Slot empty → `readySlot` returns -1 |
| BS acquires mines | `siege` fits mine in the extra slot | Runs the SHARED mine tactic (same placement, same doctrine handling as `trapper`) but at siege's appetite: lays when something is closing, not as a standing plan | No threat closing → no lay |
| Band pull | `siege` (band 0.4–0.6R) with a READY acquired torpedo (reach ~250u) | Band's near edge tugs toward the torpedo's reach, capped at halfway; reverts the moment the tube is empty | Weapon not ready → band unchanged |
| Pickup ranking | Offer contains a profile's 3rd-choice acquisition and no better card | Bot SETTLES and takes it — every acquisition scores above the junk floor | Preferred acquisition absent → still no pass |
| Random-spend test profile | Test profile id, offer of 4 | Uniform pick over the offer from a decorrelated stream; heal still fires at `healHpFrac` | No offer → null (heal path still live) |
| Test profile requested in-game | `ArenaRoom.buildBotFleet` | Impossible by construction — test ids are not in `CONFIG.bots.profiles` | Pinned by test |
| Endgame-gate bot | `--bot-engage endgame` | Bot holds ring rhythm and never targets until `zoneEndgameReached`, then fights normally | Idle phase → never degenerates to always-engage |

</intent-contract>

## Code Map

- `server/src/game/ai/profiles.ts` -- the six SHIP profile rows: bands, target weights, and the new per-equipment appetite table; gains the three test-only rows in a separate id space.
- `server/src/game/ai/equipment.ts` -- NEW: the EQUIPMENT axis. One `EquipmentTactic` per `EquipmentId`, owning that weapon's want/solve/reach and all of its doctrine branches.
- `server/src/game/ai/types.ts` -- `BotProfileId` (derived from CONFIG), `BotWorldPort`, `BotProfile` consumers; needs `AnyProfileId`, `spend` mode, `zoneEndgameReached`.
- `server/src/game/ai/tactics.ts` -- `chooseShot` ladder, `mineShot`/`wantsMine`, `torpedoShot`, `flareShot`/`flareTarget`, `broadsideShot`, `chooseAct`; the new `buoyShot` and every doctrine branch.
- `server/src/game/ai/spending.ts` -- `chooseSpend`/`boonWeightFor`; gains the random-spend mode without touching the weighted path.
- `server/src/game/ai/botDriver.ts` -- `enroll()` at :161-183, the profile seam; needs an optional profile override preserving stream position, plus the spend rng stream.
- `server/src/game/ai/utility.ts` -- `foldView`/`foldEvent`, `RememberedContact`, `choosePosture`; track persistence for the jamming counter.
- `server/src/game/world.ts` -- `addBot(hull?)` at :1297, `botEntries()` at :1336; port surface.
- `shared/src/constants.ts` -- `CONFIG.bots` (key set pinned) and `boonWeights` re-tune.
- `server/scripts/batchsim/pilots.ts` -- 558 lines; `gunner`/`endgame` deleted, `pacifist` survives, file renamed to `controls.ts`.
- `server/scripts/batchsim/spendPolicy.ts` -- NEW home for `pickSpendChoice`/`SPEND_TOP_P`/`preferenceRank`.
- `server/scripts/batchsim/{runner,main,args}.ts` -- `:322` gunner default, `:76` registry lookup, `:68` flag default; new `--bot-profile`/`--bot-engage`.
- `server/scripts/batchsim/{catalogMetrics,catalogReport}.ts` -- the blind-vacuum ledger; `:124` prints a policy sentence into the deterministic body.
- `server/src/__tests__/{bots,botPolicy,botTactics}.test.ts` -- 2387 lines of pins; `botTactics.test.ts:1288` pins per-seed determinism.
- `server/scripts/batchsim/__tests__/batchSim.test.ts` -- pilot blocks at `:59`, `:208`, `:335`, `:376`, `:522`, `:870`.

## Tasks & Acceptance

**Execution:**

*Wave 1 — retire the omniscient pilot (no behaviour change to bots)*
- [x] `server/scripts/batchsim/spendPolicy.ts` -- NEW: move `SPEND_TOP_P`, `RARITY_RANK`, `preferenceRank`, `pickSpendChoice` verbatim out of `pilots.ts` -- `--deck-only` builds no World and must outlive the pilots.
- [x] `server/scripts/batchsim/deckSim.ts` -- re-point the import to `spendPolicy.js` -- no behaviour change.
- [x] `server/scripts/batchsim/controls.ts` -- RENAME from `pilots.ts`; delete `gunner` and `endgame` from the registry and delete the hunt-policy plumbing they alone used; keep `pacifist` and the shared un-beach seamanship it exercises; rewrite the header to state it is a frozen storm-pacing CONTROL, not an AI -- its omniscience is inert because it never targets.
- [x] `server/scripts/batchsim/{runner,main,args}.ts` -- default becomes `pacifist`; `--pilot` becomes `--control`; USAGE rewritten -- `runner.ts:322` executes on every run including bot-only.
- [x] `server/scripts/batchsim/catalogReport.ts` -- update the printed policy sentence at `:124` -- it lands in the deterministic report body, so it is a deliberate golden change.

*Wave 2 — the equipment axis (Eric ruling: profiles live on the equipment as well as the ship)*
- [x] `server/src/game/ai/equipment.ts` -- NEW: an `EquipmentTactic` interface + `EQUIPMENT_TACTICS: Record<EquipmentId, EquipmentTactic>` registry, mirroring the server's own one-interface-one-registry pattern in `game/equipment/index.ts`. Each tactic owns `want()` (spend it now?), `solve()` (the `Shot`), and `reachU(stats)` (its effective reach, for the band pull). A `Record<EquipmentId, …>` is the completeness gate -- a new equipment cannot ship without a bot tactic.
- [x] `server/src/game/ai/tactics.ts` -- `chooseShot` iterates the bot's ACTUAL fitted slots through the registry instead of a hardcoded weapon ladder -- this is what makes an acquired R-slot weapon work at all. Ordering comes from the ship profile's appetite table, with the flare/mine/buoy class of placements still resolved ABOVE the `target === null` guard at `:533`.
- [x] `server/src/game/ai/equipment.ts` -- the RADAR BUOY tactic (there is none today). Re-derive placement from `CONFIG.mine.placeRange` + `sectorArcFor('radarBuoy')`; the equipment row is import-banned.
- [x] `server/src/game/ai/profiles.ts` -- replace `usesStarShells`/`usesMinesProactively`/`usesBoost` with `appetite: Partial<Record<EquipmentId, number>>`. RULED (Eric, 2026-08-20): temperament modulates **PROACTIVITY ONLY** -- one mine tactic shared by everyone, with `trapper` laying as a plan and `siege` laying only when something is closing. A profile may NOT override placement, doctrine choice or target selection; that is the flat table this replaces. Every appetite entry is consumed by `want()` and by the ordering, satisfying the deleted-`aggression` rule.
- [x] `server/src/game/ai/utility.ts` -- the BAND PULL. RULED (Eric, 2026-08-20): a fitted weapon that is READY and whose `reachU` lies outside the hull's band tugs the relevant band edge toward its reach, and only while loaded. BOUNDED so identity survives: the edge moves at most halfway toward the weapon's reach, and `engagementBand`'s profile fractions remain the anchor. A `siege` BS closes somewhat with a loaded torpedo and drifts back out after firing; it never becomes a `duelist`.
- [x] `shared/src/constants.ts` -- give every profile a FULL RANKING over all six acquisition cards, every entry scored ABOVE `UNLISTED_SCORE`. RULED (Eric, 2026-08-20): a bot prefers its favourite pickup but SETTLES for the best on offer -- it never passes out of pickiness. Today all six inherit the target equipment's category, which no profile's `cat` table names, so they all score the 0.5 unlisted default and the R slot stays empty by accident.

*Wave 3 — doctrine changes behaviour (one consumer per verb, inside its equipment's tactic)*
- [x] `server/src/game/ai/equipment.ts` -- `mine.captive`: lay at full `placeRange` (trip ring is 144u) and proactively; `mine.propFouling`: prefer laying against a closing pursuer.
- [x] `server/src/game/ai/equipment.ts` -- `torpedo.homing`: widen the credible-range gate, bounded by `homingMaxRangeU` and the 120u turn radius.
- [x] `server/src/game/ai/equipment.ts` -- `starShells.dazzle`: flare becomes offensive (live contact in sight); `starShells.phosphor`: prefer a slow/engaged target, and account for the ×0.8 lit-radius cost.
- [x] `server/src/game/ai/equipment.ts` -- `radarBuoy.jamming`/`.gun`: siting preference differs from a plain sensor buoy.
- [x] `server/src/game/ai/equipment.ts` -- `broadside.spreadRung`: a wide fan may be spent on a less certain plot; a tight fan demands a live track.
- [x] `server/src/game/ai/utility.ts` -- add track persistence and require it before committing a 30s-reload weapon -- the honest counter to jamming fakes, which re-scatter wholesale each buoy revolution.
- [x] `shared/src/constants.ts` -- re-tune `boonWeights`. RULED: `forager.mineCaptive` drops from 2.4 to at most the held-line neutral (it must not be a *wanted* line) and `trapper` becomes its home, because captive mines trip on HOSTILES ONLY — a neutral fleet drone walks over them and CAPTIVE disarms the fleet-farming forager exists to do. Delete the CONFIG comment claiming forager "prefers CAPTIVE… and so farms without re-positioning": that rationale is contradicted by `isCaptiveMineHostile`.
- [x] `server/src/game/ai/profiles.ts` -- re-band against the finalized reaches. RULED: `siege.bandMaxFrac` must stay at or below 0.625 (`broadside.rangeU` = 0.625R) so its heavy weapon reaches its own preferred water; every other band moves only if a doctrine branch makes it wrong, and any move is recorded in the spec change log with its reason.

*Wave 4 — the test-only rig*
- [x] `server/src/game/ai/types.ts` + `profiles.ts` -- add `TestProfileId` in a SEPARATE id space with `AnyProfileId = BotProfileId | TestProfileId`; keep `BOT_PROFILES`'s `Record<BotProfileId, …>` completeness gate intact; add `BotProfile.spend: 'weighted' | 'random'`.
- [x] `server/src/game/ai/profiles.ts` -- three test rows, one per hull. RULED, so the read is not shaped by a doctrine preference: band `0.15`–`0.55` (spanning knife range to just inside the broadside rung) for all three; `targetWeights` flat at `{ captain: 1.0, fleet: 1.0, damaged: 1.0, isolated: 1.0 }`; `disengageHpFrac`/`healHpFrac` at the CONFIG defaults; every preference flag ON so every verb is exercised; `spend: 'random'`.
- [x] `server/src/game/ai/spending.ts` -- random mode: uniform pick over the offer; heal still fires at `healHpFrac`; weighted path byte-identical and still rng-free.
- [x] `server/src/game/ai/botDriver.ts` + `server/src/game/world.ts` -- optional profile override threaded `addBot(hull?, profile?) → enroll`, drawing and DISCARDING the class roll to preserve stream position; mint the spend rng on a distinct multiplier.
- [x] `server/src/game/ai/types.ts` + `world.ts` -- `BotWorldPort.zoneEndgameReached` (parity: the client already receives ring state via `ArenaState`) and a controller-level engage gate.
- [x] `server/scripts/batchsim/args.ts` + `runner.ts` -- `--bot-profile NAME` (test ids only) and `--bot-engage always|endgame`.
- [x] `server/scripts/batchsim/catalogMetrics.ts` + `catalogReport.ts` -- slice fits by class/profile and print the deck-composition block in batch mode -- gives the structural denominator beside the observed one.

*Wave 5 — tests + evidence*
- [x] `server/src/__tests__/{bots,botPolicy,botTactics}.test.ts` -- extend for the new profile field, the test-id space, `buoyShot`'s ladder position, and each doctrine branch; keep `botTactics.test.ts:1288` determinism green.
- [x] `server/scripts/batchsim/__tests__/batchSim.test.ts` -- retarget the un-beach block and the determinism block onto `pacifist`; retire the gunner/endgame pins; keep the `pickSpendChoice` pins against the new module.
- [x] `_bmad-output/implementation-artifacts/bot-evidence-2026-08-20.md` -- NEW: a MODEST campaign (see Verification), reporting the six quality bars and the blind-vacuum card table.
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- append Amendment 19; `sprint-status.yaml` + `gds-workflow-status.yaml` one-line stamps; `VERSION`/`package.json` → 0.17.110.

**Acceptance Criteria:**
- Given a bot holding any doctrine verb, when it acts, then at least one decision differs from the same bot without the verb — proven per verb by a unit test that fails when the branch is removed.
- Given a Mine Layer bot with a loaded buoy slot and no tracked contact, when it deliberates, then it sites a buoy in the astern sector within `placeRange` on legal water.
- Given a bot that acquired an equipment into the extra slot, when that weapon is ready and its conditions are met, then it fires it — asserted for at least one non-native pairing per hull (e.g. Battleship with mines).
- Given two profiles holding the SAME equipment, when both are in the same situation, then their placements are identical and only their eagerness differs — a profile may not override an equipment tactic's geometry.
- Given a profile whose preferred acquisition is absent from an offer, when it spends, then it takes the best acquisition present rather than passing, provided no normal card outranks it.
- Given the in-game Solo vs AI path (`ArenaRoom.buildBotFleet`), when 19 bots enroll, then no bot carries a test-only profile id — asserted structurally, not by sampling.
- Given identical `--seed` and roster, when the harness runs twice, then the report bodies are byte-identical excluding the `meta:` line.
- Given `npm run check`, when it runs, then lint, all three type-checks and the whole suite pass.
- Given the batch campaign, when the six quality bars are computed, then each is reported with PASS/FAIL and any regression against the 7-5 baseline is explained rather than absorbed.

## Review Triage Log

**Pass 1 — 2026-08-20, two reviewers in parallel (Fable adversarial + Codex cross-model).**

Counts: intent_gap 0 · bad_spec 0 · patch 4 · defer 1 · reject 0.

| Finding | Source | Severity | Decision |
|---|---|---|---|
| PHOSPHOR closed the sensor-flare window entirely for non-eager holders (floor 3000ms > cap 2933ms) | Fable, CONFIRMED | high | patch — cap wins, reluctance degrades to the eager floor |
| CAPTIVE deleted the base mine's unconditional withdrawal lay | Fable, CONFIRMED | medium | patch, NARROWED — the fleet-only refusal is deliberate and kept; only the no-target case moved |
| `alreadyHeld` demoted every held line, not just one-copy (pre-existing since 6-4) | Codex, CONFIRMED | high | patch — `copies === 1`; a stackable ladder must stay climbable |
| `mineWant` bypassed PROP-FOULING's widened window for a CAPTIVE holder | Codex, CONFIRMED | medium | patch — the two verbs stack by design |
| Track persistence gate does not test persistence-of-association | Fable, PLAUSIBLE | low | defer — redundant against its stated adversary today (anon tracks carry no pose, and both long-reload solves refuse a poseless plot); the documented rationale is wrong, the behaviour is not |
| No RUNTIME guard on `enroll` accepting a `TestProfileId` | Codex, PLAUSIBLE | low | defer — containment is the type split + table disjointness + a structural test; a runtime guard needs a "test mode" flag, itself a new production surface |
| Land-contact bar 1.9% in a 2-match smoke | Fable, PLAUSIBLE | low | reject at n=30 — measured 0.6% (PASS), and improved on the 6-4 baseline of 0.9%. n=2 was noise |

Every patch carries a regression test **proven** to fail without its fix, by reverting each fix in
turn and confirming only that test went red.

**Process note of record:** the buoy-recon downgrade was caught by the orchestrator before the gate,
PHOSPHOR and CAPTIVE by Fable, and the remaining two by Codex — five instances of ONE defect class
(*a doctrine branch written as a replacement for the base behaviour rather than an addition*), found
by three different readers. No single reviewer found more than two. That is the argument for the
cross-model gate, and the class is now stated as a rule in the code and in amendment 29.

## Design Notes

**The two axes, and why the split is the fix.** The flat profile table conflated two different questions: *what kind of captain am I* (temperament, targeting, where I fight) and *how is this weapon used* (arc, placement, doctrine). Conflating them meant weapon knowledge was keyed by HULL, so a Battleship that acquired mines had no idea what a mine was, and `bulwark` — which carries star shells natively — was flagged never to fire them. Splitting the axes puts weapon knowledge on the weapon: `EQUIPMENT_TACTICS` is keyed by `EquipmentId`, so any bot holding a thing knows how to use it, and a new equipment cannot ship without a bot tactic because the `Record` is a completeness gate.

**Why capability had to move off the profile.** `readySlot` already searches the loadout by `equipmentId`, so an acquired weapon is *mechanically* usable today — it is the profile's static boolean that suppresses it. Acquisition cards inherit the target equipment's category (`boons.ts:300`), and no profile's `cat` table names a category it does not already carry, so all six score `UNLISTED_SCORE` 0.5 and are taken only when the rest of the hand is junk. Fixing capability without fixing the weights leaves the extra slot empty; fixing the weights without fixing capability fills a slot the bot never uses. Both halves are required.

**The band pull is bounded on purpose.** An acquired weapon that could re-band its hull outright would let one card erase a profile's identity. Capping the pull at halfway toward the weapon's reach, and only while that weapon is loaded, keeps the profile fractions as the anchor while making pickups genuinely useful — the observable behaviour is a standoff battleship easing in with a loaded torpedo and drifting back out once the tube is empty.

**Why the buoy sits above the target guard.** `chooseShot` returns null for `target === null` at `:533`. `reposition` — the no-target posture — is exactly when a sensor buoy is most valuable. Placing the branch below the guard makes it unreachable in its best case.

**The jamming counter must be structural, not a staleness rule.** A jamming buoy scatters 10 fakes per revolution, wire-indistinguishable from real returns, folded into bot memory as ordinary tracks. Two discriminators already exist in the gate: a fake can never appear inside the observer's truesight bubble, and fakes re-scatter wholesale rather than moving coherently. Requiring persistence before committing a 30s-reload weapon uses the second; it does NOT gate the gun, because blip shooting is a ruled skill.

**Stream discipline, concretely.** `enroll()` rolls a class even when one is supplied purely so the stream does not shift. A profile override must do the same. The random spend policy mints a sibling stream (`mulberry32((seed + enrollCounter × K) >>> 0)` with a distinct `K`) rather than borrowing `mind.rng`, whose only consumer is aim scatter — sharing it would silently change gunnery and make the profile non-comparable to a weighted one.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, zero complexity errors.
- `npm run check` -- expected: lint + 3 type-checks + full suite green. BASELINE taken 2026-08-20 on a clean worktree: **5392 tests / 191 files** (shared 768/34, server 1504/57, client 3120/100). NOTE: a fresh worktree needs `npm ci` AND `npm run build -w shared` first — `server` type-checks against `shared/dist`, and without it the baseline reports ~30 phantom errors in `server/src/game/equipment/`.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 30 --seed 7` -- expected: six quality bars reported; resolution rate > 95%.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 30 --seed 7` (repeat) -- expected: byte-identical body excluding `meta:`.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 18 --bot-profile random --matches 30 --seed 11` -- expected: the blind-vacuum card table, with `NEVER OFFERED` / `OFFERED BUT NEVER FITTED` lists.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 3 --matches 30 --seed 7 --control pacifist` -- expected: storm-pacing control still runs the full timeline.
- `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --deck-only --draws 50000 --seed 7` -- expected: unchanged from pre-cycle (the rehome is a move, not a behaviour change).

Scale is deliberately modest per Eric's instruction ("just enough"): ~30-match legs rather than the 50/200/250-match campaigns of prior cycles. Note `npm ci` is required in this worktree before the harness can run.

**Manual checks:**
- Confirm `PROTOCOL_VERSION` is still 43 and no file under `client/` changed.
- Confirm no file under `server/src/game/ai/` contains the token `observeSpectator` or imports `world.js`.
