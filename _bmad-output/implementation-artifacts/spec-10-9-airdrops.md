---
title: 'Story 10.9: Airdrops'
type: 'feature'
created: '2026-11-08'
status: 'done'
baseline_revision: 'dd14beff'
final_revision: 'the closing records commit at the PR head on worktree-story-10-9-airdrops (code: 9b844420, gate patch 2)'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The ocean between beacons is empty; a captain on the way somewhere has nothing worth a small detour (Eric, 2026-11-03 brainstorm #13–#23, #48–#49; forge premise 5: airdrops are FLAVOR — litter on purpose, taken when on your line, never a route).

**Approach:** The server scatters AIRDROPS — small intangible crates on the water — 2 per minute remaining to 12:00 at every match minute from 0:00 (24, 22, … 2 = 156), uniform inside the live ring, clear of land and of every live beacon's signal circle. Each carries one random index stat and a random +1..+5. An afloat hull whose silhouette touches a crate collects it; the points land on the hull's existing `indexBonus` (Story 10.7's seat, folded once by `effectiveStats()`, uncapped). A sunk participant leaves ONE wreck pickup carrying three ordinary rolls. The storm destroys every drop it closes over. A drop is seen through ordinary perception: sighted like a mine (a new sight-gated contact-like channel `drops`) and painted on radar as an anonymous one-cell stationary blip through the existing `blip` gate. Bots take a drop on their line. Harness and `MatchRecord` report drops taken.

## Eric's rulings for this story (2026-11-08, one AskUserQuestion round at the spec step of `/bmad-dev-auto 10-9`; literal spec; recorded as epic-10 amendment 18; the story text and amendment 6(h) stand wherever these do not rule)

- **R1 Beacon bias = HARD KEEP-OUT, 500 u.** A drop never lands inside any live beacon's signal circle (`CONFIG.beacons.rangeU`; charted, afloat or sinking); the uniform draw is re-sampled. Rejected: soft "farthest of four"; no bias.
- **R2 Wreck pickup = THREE ORDINARY ROLLS.** One pickup at the wreck granting three independent +1..+5 rolls, each on its own random stat. Nothing of the victim's leaks. Rejected: the victim's collected points; one ordinary drop.
- **R3 Stat glyph at SIGHT ONLY.** Inside truesight the crate shows its stat and amount; on radar it is an anonymous small blip (the same `blip` paint as a hull, one cell, never moving). No new sight-independent wire row. Rejected: glyph at radar range; surprise on pickup.
- **R4 Crate = 15 u intangible disc.** Not solid, not shootable, never a target or a body; a hull collects it when its silhouette touches the 15 u disc (`pointPolygonDistance ≤ 15`). Rejected: 10 u; 6 u; a solid shootable body.

## Eric's dev-step rulings (2026-11-08, AskUserQuestion on the rendered candidate https://claude.ai/artifact/7aNqNHR8rKMxvCw39z9gMb; literal spec)

- **R5 Crate body = variant A, the square.** Rejected: B float (circle); C parachute.
- **R6 Pickup tell = the existing phosphor toast** (`+3 ARMOR`; a wreck pickup `+3 ARMOR · +1 INTEL · +5 RANGE`), no tone. Rejected: none; toast + the point tone.
- **R7 THE AMOUNT IS ROLLED AT PICKUP; A CRATE SHOWS ONLY ITS KIND (ICON + COLOR); THE WRECK PICKUP HAS A UNIQUE ICON AND COLOR.** Eric, verbatim: *"Why are the numerals there? The bonus is rolled AFTER I pick it up. I only need to know that its there, and what type of upgrade it is (icon + color). The one I pick up from a sunk ship should maybe be a unique icon and color, because its not limited to a specific 'type.'"* Model consequence: `DropState.kind: IndexId | 'wreck'`; `DropView {id,x,y,c}`; the roll (`+1..+5`, and the wreck's three stats) happens in `collectDrop` on a pickup sub-stream; the `dp` event carries the rolls. Supersedes this spec's "each carries one random index stat and a random +1..+5" and the W1/W2 `rolls`-at-spawn build. The kind colors and the wreck glyph are shown on a v2 candidate for his pick.
- **R8 Radar imprint accepted as is:** with the hull's fuzz law a 15 u crate paints a fuzzy blob 5–8 cells across (about 40–70 % of a Bismarck's cell count; measured on the page), not one cell; stillness across sweeps is the tell. Rejected: a sharp 17-cell disc; a single cell.

- **R9 Colors (2026-11-09, on the v2 page https://claude.ai/artifact/72PpLQwtXgbo2AWyDBxPxh):** *"make Armor pink. Also give all of them a small glow effect in their color."* — ARMOR pink; POWER orange (`alertOrange`), RELOAD amber, ENGINES blue (`info`), INTEL phosphor green, RANGE purple (the tier-III `stormReadout`), WRECK white stand as shown; every crate carries a small glow in its kind color. The tier-color overlap was put to him and not objected to.
- **R10 Wreck icon = 'salvage'** (a braced crate with a three-line star, the "any stat" mark). Rejected: the broken-hull silhouette.

## Orchestrator rulings at the dev step (Eric may veto any on staging)

- **O1** `spawnDrops` runs AFTER `placeBeacons` (last in `STEP_ORDER`), not before: ring cycles start on minute marks, so the opening batch must test the keep-out against the NEW beacon set.
- **O2** `dropsLive()` keeps the `xpEnabled` term (the zone clock keeps running in the finished window; no drops after the match ends); the minute clock reads `zoneCfg.beatMs` so a dev `zoneOverride` keeps drops in step with the rings.
- **O3** The wreck pickup is placed only once the zone has started (`zoneStartT !== null`): a pre-zone sink is a ready-room / sandbox practice sink, and the respawned hull would otherwise collect its own wreck and carry the points into the match (found by the W2a agent). A dev `matchOverride.drops:false` still leaves wreck pickups.
- **O4** Bots never fold a crate-sized radar return into a hostile track: a return whose fuzzed footprint's longest side is below `CONFIG.bots.cratePaintMaxU` (85 u; a hull paint is ≥ ~99 u even for Warspite, a crate ≤ 72 u) is ignored by the plot — human parity with "a small still return". Found at the gate: farming bots chased crate blips off station.
- **O5** The crate's disc blip joins the blip subsequence before the payload-only sort (no source-order leak); `drops` is the LAST optional frame channel.

## Boundaries & Constraints

> **Model note (R7, 2026-11-08):** wherever this contract says a crate "carries" a stat and a +1..+5 or a `g` list, read: a crate carries its KIND (`DropView.c`); the rolls happen at pickup and ride only the collector's `dp` event. The W2d re-cut is the built truth.

**Always:**
- Shared layering: the drop model (`DropState`, rolls, count law `2 × (12 − minute)`, schedule, roll law) is pure in `shared/src/sim/drops.ts`; every number in `CONFIG.drops`; both sides and the harness read it. No `Math.random` / `Date.now`.
- A drop is NEVER a `ShipRecord`, a `Target` of `hitTargets`, a contact body, a storm "victim" in the ship sense, a `sunk` row or a bounty. It is its own store on `World` (`Map<string, DropState>`), like mines.
- Perception: a drop reaches a client ONLY through `perception.observe()`: (a) a new contact-like pseudo-row `drop` → `FrameMsg.drops?: DropView[]` (optional channel, omitted when empty, like `litZones`), visible to a spectator always, else `pointDetected` (sight × detectFactor + island LOS) or `ownZoneCovers`; (b) a radar paint through the EXISTING `blip` row's gate (`blipGate(ctx, drop, drop.id)` when `world.radarEnabled`, fogged mode) materialized as a `blip` whose coverage is a DISC raster of the crate radius (new shared `paintDiscCoverage(x, y, rU, cellU, t)` in `radarRaster.ts`, same fuzz law as the hull mask) — carrying nothing but the rect. The six declared exceptions stay SIX; the invariant suite is EXTENDED (`CONTACT_LIKE` += `drop`, `REGISTRY_KEYS`, a `verifyDrop` oracle, the blip oracle accepts a drop-explained rect, `PSEUDO_ROWS` += `drop`).
- The pickup tell is a NEW self-private event `dp` (`{k:'dp', t, g:[[IndexId, n], …]}`, `selfPrivateSignal('dp', false)` like `pt`), delivered only to the collector; an `EVENT_VERIFIERS` entry pins it. (Whether the client shows it is Eric's on the rendered candidate.)
- Collection is server-authoritative each tick in a new `STEP_ORDER` row `collectDrops` directly after `stepMines`: for every drop, the first AFLOAT participant hull (captains and bots; insertion order) whose silhouette polygon is within `CONFIG.drops.radiusU` of the drop center collects it: each roll does `ship.indexBonus[i] += n`, then `refoldCards(ship)` + `settleRefold(ship, prev)` (the Story 10.7 seat, `world.ts:3398-3410` / `:3630` / `:3577`), `ship.dropsTaken += 1`, the drop is deleted, the `dp` event is pushed. A sinking or sunk hull collects nothing.
- Spawning in a new `STEP_ORDER` row `spawnDrops` directly before `placeBeacons` (last-but-one): with the zone running (`zoneStartT !== null`) and drops enabled, every match minute `m = floor((now − zoneStartT) / CONFIG.zone.beatMs)` not yet spawned (catch-up on a long step) spawns `max(0, CONFIG.drops.perMinuteRemaining × (CONFIG.drops.untilMinute − m))` drops: `untilMinute` 12, so 24 at 0:00 … 2 at 11:00, none from 12:00 on; 156 for the shipped ladder (derived, never pinned as a literal in a test — test the law against CONFIG).
- Placement: uniform over the live ring disc of radius `ring.r − radiusU` (sqrt-radius sampling), rejected when `islandClearance ≤ SPAWN_ISLAND_CLEARANCE` (`spawn.ts`), or within `CONFIG.beacons.rangeU` of any beacon whose phase is not `gone`, up to `CONFIG.drops.placeAttempts` (64) attempts; a drop that finds no spot is skipped and logged `drops.placeSkipped` (never a throw). Positions `Math.fround`ed like beacons. Stream: PRIVATE (`(opts.pseudonymSeed ?? (seed ^ 0x1b873593)) ^ <new unused constant>`), one sub-stream per minute batch via `Math.imul(m + 1, 0x9e3779b9)`; the per-ship `drawRng` is never touched (it would shift later offers).
- Storm: a new `STEP_ORDER` row `stormDrops` directly after `applyStorm` deletes every drop with `isOutside(drop, zoneLiveRing)`.
- Wreck pickup: in `sinkShip`, after the lifecycle transition, for every participant hull (captain or bot) one drop with `CONFIG.drops.wreckRolls` (3) rolls is placed at the hull's center (no land / keep-out check — the hull was there); if it lies in the storm, `stormDrops` removes it next tick (accepted). Rolls use the private drop stream.
- Roll law (shared): stat uniform over `CONFIG.drops.indices` (the six of `CONFIG.offer.exhausted.indices`), amount integer uniform in `[bonusMin, bonusMax]` = [1, 5].
- Wire: `DropView = {id, x, y, g}` with `g: ReadonlyArray<readonly [IndexId, number]>` — one entry for an ordinary drop, three for a wreck bundle; key order load-bearing (msgpack). `FrameMsg.drops?` optional. `PROTOCOL_VERSION` 100 → 101 (new channel + new event kind). Version 0.19.11 → 0.19.13, cycle 219, epic-10 amendment 18.
- Dev door: `matchOverride.drops: false` disables spawning (honoured only under `HC_DEV_OPTIONS=1`, the `beacons` pattern); production never depends on it.
- Client: `drops` channel ingested in `syncContactLike`; a `Drops` renderer (one Graphics per id, add/remove reconcile like `Mines`) on a new fogged world layer `dropWorld` beside `mineWorld` (chart handover not needed — a drop is sight-only); glyphs through `drawEquipmentIcon` (the six index glyphs exist); a radar paint of a drop needs NO client change (it is a plain blip). `ib` already reaches prediction via `applyOwnStats`.
- Bots: `PerceptionView.drops` (the sighted list, no port widening — human parity); in non-combat postures only (idle / farm / patrol, never while engaged or breaking off), a sighted drop within `CONFIG.bots.dropLaneU` lateral of the current goal line and within `CONFIG.bots.dropAheadU` ahead is steered to (`steerToward`); first numbers 100 u / 600 u as readings, 10.12 tunes.
- Harness: `CaptainSample.dropsTaken` + per-index bonus totals, `BotSample.dropsTaken`; `report.ts` prints drops taken per hull and the index spread (bonus points per stat) at end; `botReport` gains a `drops` column. `ParticipantRecord.dropsTaken` on `MatchRecord`. `matchRecord.test.ts` extended.
- Every landed PR updates both trackers with one-line stamps; amendment 18 appended to `epic-10-context-amendments.md`; `sprint-status.yaml` 10-9 → review; `gds-workflow-status.yaml` `next_expected`.
- American spelling; complexity ≤ 10; no word-police tests; no tests pinning Eric's numbers (test the mechanism against CONFIG); every reviewer fix lands with a test shown red first.

**Block If:**
- The crate look (sight glyph: crate body, stat glyph, amount; the wreck bundle; the pickup tell) has not been shown to Eric as a RENDERED candidate from the real render module and approved — required before the client art and the `dp` tell are committed as final.
- A seventh perception exception, a schema field, or any per-ship fact outside the collector's own `you` row appears necessary.
- Any unruled mechanic or number surfaces (ask Eric interactively).

**Never:**
- No solid or shootable crate; no weapon in a drop (#57); no cap on collected points; no location-taught stats; no in-game copy unasked (How-to-Play is 10.14); no bot appetite tuning beyond the lane nudge (10.12); no sound (10.13); no GDD / `game-architecture.md` stamps (10.14); no `CLAUDE.md` edit.
- No merge of any PR. No batch sims. No change to beacon placement or payout.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Minute batch | zone running, minute m first reached | `2 × (12 − m)` drops placed uniformly in the live ring, land-clear, ≥ 500 u from every live beacon, each `{stat, +1..+5}` | A spot not found in 64 tries is skipped + logged, never thrown |
| 12:00 and later | m ≥ 12 | zero drops spawn | — |
| Long step | two minute marks crossed in one step | both batches spawn, in order | — |
| Sail-over | afloat hull polygon within 15 u of a drop | `indexBonus[stat] += n`, refold + settle, drop deleted, collector gets `dp`; nobody else gets any event | two hulls touch the same tick: first in ship insertion order wins |
| Sinking hull over a drop | lifecycle sinking/sunk | nothing happens | — |
| Storm | drop outside the live ring | deleted that tick | — |
| Wreck | participant sinks (any cause) | one 3-roll pickup at the wreck center | in the storm → gone next tick |
| Perception, sighted | drop within detect range + LOS (or in an owned lit zone), or spectator | `drops[]` carries `{id,x,y,g}` | outside → absent (channel omitted when empty) |
| Perception, radar | drop inside radar range, swept this tick, shadow-visible, dropout roll passes | one anonymous `blip` with a disc rect at the drop | radar disabled / spectator → no blip |
| Dev door | `matchOverride.drops:false` under `HC_DEV_OPTIONS=1` | no scheduled drops; wreck pickups still placed | without the env the key is stripped |
| Malformed view | client receives a `g` entry with an unknown stat or non-integer n | entry ignored at ingest (`bonusCount`-style fail-closed) | no throw |

</intent-contract>

## Code Map

- `shared/src/sim/drops.ts` -- NEW: `DropConfig`, `DropRoll`, `dropCountFor(minute, cfg)`, `rollDrop(rng, cfg)`, `rollBundle(rng, n, cfg)`, `dropMinuteAt(now, zoneStartT, beatMs)`, `dropTouches(drop, poly, rU)`; exported from the barrel
- `shared/src/sim/radarRaster.ts` -- `paintCoverage` (:822) precedent; NEW `paintDiscCoverage`
- `shared/src/constants.ts` -- NEW `CONFIG.drops`; `CONFIG.bots.dropLaneU/dropAheadU`; `CONFIG.offer.exhausted` (:2679) the indices; `CONFIG.beacons.rangeU` (:2909)
- `shared/src/types.ts` -- `MineView` (:1391), `FrameMsg` (:1607), `OwnShip.ib` (:534), `GameEvent` (:1583), `PointEvent`; NEW `DropView`, `DropPickupEvent` (`dp`)
- `shared/src/index.ts` -- `PROTOCOL_VERSION` (:1026) + changelog block (:5–19)
- `shared/src/sim/silhouette.ts` -- `pointPolygonDistance` (:232), the overlap test (mines' `firstTripper`)
- `shared/src/sim/zone.ts` -- `isOutside` (:522), beat arithmetic (:438)
- `server/src/game/world.ts` -- `STEP_ORDER` (:3858–4065), `mines` store (:1478), `applyStorm` (:5013), `sinkShip` (:2852–2928), `convertBank` / `refoldCards` / `settleRefold` (:3398/:3630/:3577), `indexBonus` (:673), `placeBeacons` (:7359), stream constants (:2001–2038, retired list :1965), `WorldOptions.beacons` (:297)
- `server/src/game/beacons.ts` -- `BeaconField` (:122) the store precedent; `chart` for the keep-out
- `server/src/game/spawn.ts` -- `islandClearance` (:143), `SPAWN_ISLAND_CLEARANCE` (:128)
- `server/src/game/signals.ts` -- `mineSignal` (:750), `blipGate` (:536), `blipShape`/`paintRect` (:664–674), `selfPrivateSignal`, `SIGNAL_REGISTRY` (:2049), `PSEUDO_ROWS` (:2129)
- `server/src/game/perception.ts` -- `mineScan` (:265), `view()` (:438–480), `PerceptionView` (:57)
- `server/src/game/frames.ts` -- `optionalChannels` (:291), `buildFrame` (:300)
- `server/src/rooms/roomOptions.ts` -- `MatchOverride` (:258–286); `server/src/rooms/ArenaRoom.ts` (:388–394) the `beacons` wiring
- `server/src/game/match.ts` / `matchRecord.ts` -- `beaconXpMs` precedent (:325/:350/:1144; :49/:107)
- `server/src/game/ai/` -- `tactics.ts` `postureBearing` (:663) / `idleBearing` (:609–620), `navigate.ts` `steerToward` (:330), `types.ts` `BotMind`; `botDriver.ts` view read (:383)
- `server/scripts/batchsim/` -- `runner.ts` `CaptainSample` (:203), `botMetrics.ts` `BotSample` (:86), `report.ts` (:120, :221–238), `botReport.ts` (:187, :426)
- `server/src/__tests__/` -- `perception.test.ts` (`CONTACT_LIKE` :5123, `EVENT_VERIFIERS` :5158, `verifyFrame` :2572, `verifyMine` :2968, THE INVARIANT :4120), `signals.test.ts` (:103–150, :321), `frames.test.ts` (:241), `goldenFrames.test.ts` (re-record with a dated note), `stepOrder.test.ts` (:25), `beaconPerception.test.ts` (template), `matchRecord.test.ts`, `botBeacons.test.ts` + `beaconFixture.ts`
- `client/src/net/roomBindings.ts` -- `syncContactLike` (:789/:799), `handleEvents` (:985–1041), `handlePoint` (:1442)
- `client/src/render/mines.ts` -- the renderer precedent (`Mines` :239, glyph at :375); `render/stage.ts` layer orders (:292/:310, `EVERY_LAYER_PLACED` :340); `render/equipmentIcons.ts` (`drawEquipmentIcon` :618, `LINE_GLYPHS` :567); `ui/upgradeToast.ts` (`pushUpgradeToast` :58); `audio/twinMap.ts`; `client/src/config.ts` (`COLORS` :30)
- `client/src/main.ts` -- renderer block (:2733–2771), per-frame render calls (:4381/:4892), `applyOwnStats` (:2886)
- `client/src/__tests__/` -- `mines.test.ts`, `beacons.test.ts`, `roomBindings.test.ts`
- Trackers / records: `VERSION`, `package.json`, `_bmad-output/implementation-artifacts/{epic-10-context-amendments.md, sprint-status.yaml}`, `_bmad-output/gds-workflow-status.yaml`

## Tasks & Acceptance

**Execution (waves; `/orchestrate` routing in Design Notes):**
- [x] W1 `shared/` -- `CONFIG.drops`, `sim/drops.ts`, `paintDiscCoverage`, `DropView` / `dp` types, `FrameMsg.drops?`, PV 101 + changelog, barrel; unit tests on the count law, the roll law (bounds, stat ∈ indices), the disc raster (cell count for 15 u at 9 u cells), `dropTouches`
- [x] W2a `server/` sim -- `World.drops` store + private stream, `spawnDrops` / `collectDrops` / `stormDrops` rows, wreck pickup in `sinkShip`, `dropsTaken`, `dp` push, `WorldOptions.drops` + `matchOverride.drops`; `stepOrder.test.ts` pin amended; world tests (schedule incl. catch-up and the 12:00 stop; placement rejections land / keep-out / ring; sail-over → `indexBonus` + refold; sinking hull collects nothing; storm deletes; wreck bundle of 3; skip-and-log)
- [x] W2b `server/` perception -- `drop` pseudo-row, `dropScan` (sight + radar paint via `blipGate` + disc rect), `PSEUDO_ROWS`, `dp` self-private row, `optionalChannels`, `PerceptionView.drops`; invariants extended (`CONTACT_LIKE`, `REGISTRY_KEYS`, `verifyDrop`, blip oracle, `EVENT_VERIFIERS.dp`, key-order pins); a two-world differential test: frames identical except the collector's `you.ib` and its `dp`; goldenFrames re-recorded with a dated note
- [x] W2c `client/` -- `drops` ingest (fail-closed on a malformed `g`), `Drops` renderer + `dropWorld` layer, `dp` handling scaffold; `Game` field; tests (reconcile add/remove, glyph per stat, malformed entry dropped)
- [x] W3 rendered candidate -- throwaway esbuild page under `$CLAUDE_JOB_DIR/tmp` from the real `Drops` module (+ pixi): crate variants A/B/C at game zoom, the wreck bundle, a radar-painted drop beside a hull paint, the pickup tell options (toast `+3 ARMOR` glyph row / none); publish as an artifact; Eric's yes BEFORE the client art and the tell are final
- [x] W4 bots + harness + record -- lane nudge in `tactics.ts` + `CONFIG.bots.dropLaneU/dropAheadU`; `dropsTaken` on `MatchRecord` / `CaptainSample` / `BotSample`; report lines; tests (bot steers to a lane drop when idle, ignores it when engaged; record field)
- [x] W5 records -- amendment 18, `VERSION` / `package.json` 0.19.13, both trackers, this spec's result; review gate (two Fable hunters + Codex `gpt-5.6-sol`), smokes, PR

**Acceptance Criteria:**
- Given the zone starts, when the match clock crosses minute m < 12, then exactly `2 × (12 − m)` drops are added (minus any logged skips), each inside the live ring, island-clear, ≥ 500 u from every non-gone beacon, with one stat from the six and n ∈ [1, 5].
- Given an afloat hull touches a drop, when the tick runs, then its `indexBonus[stat]` grows by n, `effectiveStats()` is refolded, its next own frame carries the new `ib`, it alone receives `dp`, and the drop is in nobody's next frame.
- Given a drop outside the live ring, when `stormDrops` runs, then it is gone.
- Given a participant sinks, when `sinkShip` runs, then one pickup with three rolls sits at its center.
- Given any observer, when a frame is built, then a drop appears in `drops` only if sighted (or spectator), and as a blip only through the radar gate; no drop id, stat or position reaches a frame otherwise (property test over seeded worlds).
- Given the harness runs, when a match ends, then the report prints drops taken per hull and the index spread, and `MatchRecord.participants[].dropsTaken` is set.
- Given a bot idling toward a goal, when a sighted drop lies in its lane, then it steers to it; given the same bot engaged, it does not.

## Spec Change Log

- 2026-11-08 (dev step, Eric's R7 on the rendered candidate): the drop model moved from rolls-at-spawn to kind-at-spawn / roll-at-pickup. Known-bad state avoided: a crate advertising its amount (Eric: the bonus is rolled after pickup). KEEP: the sight-only `drops` channel, the anonymous disc blip, the `dp` self-private tell, the hard 500 u keep-out, the three-roll wreck.

## Review Triage Log

### 2026-11-10 — Review pass (Fable Blind Hunter BUILD-ON-IT · Fable Edge Case Hunter 5 cases · Codex `gpt-5.6-sol` FIX-FIRST on one finding)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 3, low 3)
- defer: 2: (high 0, medium 0, low 2)
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Codex (CONFIRMED): a live ring smaller than the crate radius clamped the placement domain to the centre and parked crates in the storm (dev `zoneOverride` only) — `pickDropSpot` now places none below `radiusU`; regression test shown red first.
  - `[medium]` `[patch]` Both hunters (CONFIRMED, design gap → Eric R11): a quitter's scuttle left a 3-roll wreck crate — now only when the hull was in combat (assist ledger inside `assistWindowMs`); tests red first; Eric's "denied XP" half is on the ledger for his ruling.
  - `[medium]` `[patch]` Edge Case Hunter (reachable): `collectDrops` ran in the results window (`xpEnabled` false) — gated; test red first.
  - `[low]` `[patch]` Edge Case Hunter (latent, sandbox): a respawning hull collected its own wreck crate — no wreck crate while `respawnEnabled`; test red first.
  - `[low]` `[patch]` Edge Case Hunter (latent, `--tune` / fixtures): reversed `bonusMin/Max` or empty `indices` produced a negative amount / an undefined kind — fail-safe guards; tests.
  - `[low]` `[patch]` Blind Hunter: comment drift `{id,x,y,g}` → `{id,x,y,c}` in frames/perception/signals/tests and a model note in this spec.
  - Ruled by Eric at the gate, not patched: beacons placed over existing crates are LEFT (R12); a close-minute batch scatters in the outgoing ring as ruled (R13).
  - Deferred (ledger): spectator frames carry every live crate; the scuttle pays no kill XP (Story 6.7) — Eric's call.

## Design Notes

- **Why a sight channel + the blip gate, not a schema field.** Brainstorm #48: drops are on the chart only once sighted (beacons are global; drops are not). The anonymous blip is exactly "paint by imprint": a one-cell rect that never moves reads as a crate by size and stillness; nothing on the wire says so (R3).
- **Why `dp` and not an `ib` diff on the client.** Story 10.7's maxed-hull conversion also moves `ib` and was ruled silent; a dedicated self-private event keeps the two apart and lets Eric choose the tell.
- **Why a private stream.** Drawing on the public map seed would let a seed-knower predict stats and positions; the per-ship `drawRng` must not shift later offers.
- **Waves (orchestrator):** W1 shared (Opus) → W2a server sim (Opus) ∥ W2b perception + invariants (Fable — chokepoint) ∥ W2c client (Opus) → W3 candidate page (Opus; Eric's yes) → W4 bots + harness (Opus) → W5 records (Sonnet) → gate (two Fable hunters + Codex `gpt-5.6-sol`).

## Verification

**Commands:**
- `npm test -w shared && npm run build -w shared` -- expected: green after W1
- `npm test -w server` / `npm test -w client` -- expected: green after each wave that touches them
- `npm run lint` -- expected: clean (complexity ≤ 10)
- `npm run check` -- expected: EXIT 0 before the PR
- `matchSmoke`, `weaponsSmoke` against an agent-booted worktree server (`HC_DEV_OPTIONS=1`, own PID and its tsx child killed after) -- expected: OK first try

**Manual checks (if no CLI):**
- Eric's yes on the rendered crate candidate (artifact page from the real `Drops` module).

## Auto Run Result

**Status:** done (review gate passed; PR to `development` open; Eric's visual rulings taken on three rendered candidates, "v3 looks good").

**Summary:** Airdrop crates built on all three sides. The server scatters 2 × (minutes remaining to 12:00) crates at every match minute (24 … 2, 156 derived), uniform in the live ring, island-clear and ≥ 500 u from every live beacon (R1), on a private seeded stream; a crate carries only its kind (six index stats or 'wreck') as a 15 u intangible disc (R4, R7); an afloat participant hull touching it collects it, the +1..+5 (a wreck: three rolls, R2) is rolled at pickup onto `indexBonus` through the one fold, the collector alone gets the self-private `dp` toast (R6); a hull sunk by damage leaves a wreck crate, a quitter only if in combat (R11); the storm deletes crates outside the ring (R13 keeps the close-minute batch in the outgoing ring); beacons placed over crates leave them (R12). Perception: a sight-gated `drops` channel plus an anonymous fuzzed-disc radar blip under the hull gate (R3/R8); the six exceptions stay six, the invariants are extended. Bots ignore crate-sized returns and steer to a sighted crate in their lane when not in combat; harness + `MatchRecord` count drops taken and the index spread. Client: the square crate per kind in its color with a glow (ARMOR pink, R9), the salvage wreck icon (R10), on a fogged `dropWorld` layer. Cycle 219, 0.19.13, PV 101, epic-10 amendment 18 (renumbered after Story 10.10 landed as cycle 218 mid-run).

**Files changed (headline):** `shared/src/sim/drops.ts` (new), `CONFIG.drops`, `CONFIG.bots.cratePaintMaxU / dropAheadU / dropLaneU`, `paintDiscCoverage`, `DropView` / `DropPickupEvent`, PV 101; `server/src/game/world.ts` (store, `spawnDrops` / `collectDrops` / `stormDrops` rows, wreck pickup, `inCombat`, scuttle flag), `signals.ts` / `perception.ts` / `frames.ts` (drop row, `dropPaint`, `dp` row, `drops` channel), `ai/drops.ts` (new) + `tactics.ts` + `plot.ts` / `utility.ts` (crate filter), `match.ts` / `matchRecord.ts`, `roomOptions.ts` / `ArenaRoom.ts` (`matchOverride.drops`), batchsim readouts; `client/src/sim/dropView.ts` (new), `render/drops.ts` (new), `render/stage.ts` (`dropWorld`), `equipmentIcons.ts` (salvage glyph), `config.ts` (`drops`, `COLORS.pink`), `net/roomBindings.ts`, `ui/boonCopy.ts`; tests in every workspace (shared 1436 → 1470, server 2708 → 2762, client +~40); amendment 18, both trackers, the ledger, VERSION 0.19.13.

**Review:** 6 patched, 2 deferred, 0 rejected (triage log above); no confirmed defect in the chokepoint, the sim rows or the schedule.

**Verification:** `npm run check` EXIT 0 on the merged, patched tree (shared 1470, server 2762, client 145 files; lint 0 errors, 3 pre-existing warnings); matchSmoke, openingSmoke and weaponsSmoke OK before the merge (first try) and OK again after it; a 2-match harness smoke shows bots collecting crates; every gate fix with a test shown red first.

**Residual risks:** the glow is about one pixel at the default zoom (dials exposed; judged on staging); a scuttle pays the assist share but no killer share (existing Story 6.7 rule, Eric's "denied XP" sentence — his to rule); spectator frames carry every live crate (ledger); 10.12 tunes bot appetite; How-to-Play has no airdrop entry (10.14).
