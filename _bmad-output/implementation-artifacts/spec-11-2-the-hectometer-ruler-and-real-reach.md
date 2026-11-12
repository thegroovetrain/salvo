---
title: 'Story 11.2: The Hectometer Ruler and Real Reach'
type: 'feature'
created: '2026-11-12'
status: 'in-progress'
baseline_revision: '84008761d3b6f87a5595c15a789388a4c433eb6d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Every reach is a multiple of a 125 u "twelfths" rung sized for a 1,500 u radar, sight is hard-wired to radar / 3, gun reach is an index row, and nothing on screen says how far anything is. Epic 11 needs real reach on the same 10,000 u board, on one ruler in hectometers.

**Approach:** Replace the ladder with named hectometer facts in `CONFIG` (one ruler constant), split sight into two tiers through `perception.observe()`, remove the RANGE row and the radar dropout, give torpedoes a run that tiers up, and redraw the radar display as a real set (own-ship range rings labelled in hm, restyled sweep). A reach bench page built from the real shared code goes to Eric BEFORE any game wiring is committed; he sets the open numbers and picks the look there.

## Boundaries & Constraints

**Always (Eric's rulings, AskUserQuestion x2 + chat, 2026-11-12, R1–R12):**
- R1 The ruler: 1 hm = 10,000 / 440 u (≈ 22.73 u; a real 44 km board). Reaches are TIDY hectometers: radar 400 hm, main battery 380 hm, full-hull sight 200 hm, class-ID sight 130 hm.
- R2 Per-hull main-battery reach keeps today's ratios as a fact on the hull's battery, not a row: Bismarck 95 %, Yamato / Iowa 100 %, Warspite 125 % of 380 hm. A reach past the board is fine (the aim is already clamped to the map).
- R3 Sight tiers: inside the class-ID reach a contact is today's full contact; between class-ID and hull reach it is a PLAIN HULL, LIVE — one generic shape at true position / heading / speed with no class, no real id, no name, no turret or launcher angles. (The epics AC sentence has the tiers inverted; this reading is the forge's and Eric's.)
- R4 "Whatever would be realistic" for small things — author's reading, every figure a bench dial for Eric's yes: splashes / bursts / sinkings at hull reach; shells in flight at class-ID reach; torpedoes ≈ 15 hm; mines a few hm; a crate visible far, its kind only close.
- R5 Torpedoes get a run in hm that grows by tier, per kind, by real ratio (bench candidates: heavy ≈ 55 hm at tier I → ≈ 140 hm at tier V); straight-runners no longer run to the map edge.
- R6 Bots use full reach now; no interim hold. 11.9 tunes them. They must stay functional.
- R7 Radar shadows stay the real curved-sea model: `K` keeps following `CONFIG.vision.radar` (terrain above the mast is a wall; lower islands are seen over). Shown on real seeds on the bench page for veto.
- R8 The radar dropout is REMOVED now (`dropout.ts`, `CONFIG.vision.dropout`, its three gates, `ai/sweepMiss.ts`); 11.4's strength model replaces it.
- R9 RANGE leaves the index: five rows; its card leaves the catalog; the maxed-hull roll and the airdrop crate kinds (same list) become five.
- R10 Display (chat): range rings centered on the own ship, spacing FOLLOWS ZOOM in round hm, labelled (small numerals accepted for ring labels only), clear white like a real set; the sweep is restyled to look authentic; candidates rendered WITH and WITHOUT a bearing scale + heading line; Eric picks before commit.
- R11 (reading, for veto) Camera: default zoom unchanged; the zoom-out is fixed so the whole-board view still centers correctly at 400 hm radar. Free camera stays 11.8.
- R12 (reading, for veto) A time-compression factor is named in `CONFIG` as documentation of today's rates; no rate changes value. Its number is shown on the bench page.
- The perception invariant keeps exactly SIX exceptions; the outer tier gets its own invariant line (an outer-tier contact carries no `cls`, `tu`, `lu` or roster id; identity-bearing fields of `boom` / `spawn` / `sunk` gate at the class-ID reach).
- Tests that pin ladder ratios or "neighbors spawn outside radar" are DELETED as a ruling recorded in the amendments, never patched to pass.
- Numbers (amendment, cycle, version, PV) are taken at PR time after `git fetch`.

**Block If:** Eric changes a ruling on the bench page in a way R1–R12 do not cover; the outer tier cannot be built without a seventh exception; the gate fails for a reason outside this story.

**Never:** touching map gen, the height raster, islands, `CONFIG.zone`, spawns, hull polygons, `radarMastQ`, the dispersion dials or `aimScatterU`; an AIM row; player radar knobs, the arc, ghosts (11.3 / 11.4); the free camera (11.8); bot tuning (11.9); in-game copy or How-to-Play text; a batch sim; a local perf verdict; editing `CLAUDE.md`; merging.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ruler | 9,090.9 u | formats as `400` hm; `hmToU(400)` returns it | non-finite → empty text |
| Inner tier | hull at 100 hm, clear LOS | full contact (id, class, turrets) | none |
| Outer tier | hull at 160 hm, clear LOS | plain contact: anonymous handle, pose only | none |
| Beyond eyes | hull at 250 hm | no contact; radar paint only | none |
| Tier crossing | hull moves 140 → 120 hm | plain contact ends, full contact begins; client shows one hull, no duplicate | none |
| Warspite reach | 475 hm aim | landing clamped inside the map disk | none |
| Torpedo run | straight-runner, tier I | expires at its run distance, not the map edge | none |
| Maxed hull roll | any seed | one of five rows, never `range` | none |
| Stale client | PV below current | join refused | existing gate |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `SIGHT` / `RUNG` :12-26, `CONFIG.vision` :849-1172 (dropout :997-1022), every `rangeU` (`mainBattery` :1509, `secondaries` :1549, shells :2193-2296), `torpedo.homingMaxRangeU` :1640, hull `index` / `battery` :243-357, `RANDOM_INDEX_STATS` :87, `INDEX_IDS` :3176, `beacons` :2944
- `shared/src/sim/hm.ts` -- NEW: `HM_U`, `hmToU`, `uToHm`, `formatHm`
- `shared/src/sim/stats.ts` :826-845, :1011, :1025-1029 + `boons.ts:179` -- `sightRange = radar / 3` re-pin (two homes); add `classIdRange`; RANGE scale
- `shared/src/sim/indexStats.ts:71,129` -- `RANGE_ROWS`, `scaleDeckGunRange`: remove
- `shared/src/sim/catalog.ts:283,967`, `draw.ts:431`, `drops.ts`, `effects.ts:184` -- the RANGE line, the five-row roll, crate kinds
- `shared/src/sim/dropout.ts`, `radarShadow.ts:221`, `sight.ts:80`, `shell.ts:497-536`, `zone.ts:240-253`
- `server/src/game/signals.ts` -- `sightOf` :361, contact :694-738, detect :394, flash :425, dropout gates :540-593, boom / spawn / sunk :1625-1802, foghorn :1982; `perception.ts:166,473`; `frames.ts:294`; `world.ts:2199` (`pseudonymFor`), `:5299` (beacon keep-out), `:1458`
- `server/src/game/equipment/torpedoCore.ts:95`, `mines.ts:374` -- torpedo run
- `server/src/game/ai/` -- `sweepMiss.ts`, `torpedoThreat.ts:59`, `tacticKit.ts:58`, `posture.ts:327`, `utility.ts:518`
- `client/src/render/` -- `radar.ts:532` (rings, sweep), `map.ts:107` (chart rings), `textures.ts:81,121` (sweep wedge), `radarMarch.ts:349` (`rayStep`), `contacts.ts` / `ships.ts` (plain hull), `fog.ts:255`, `projectiles.ts:276`, `camera.ts:175,226`; `main.ts:2200`; `config.ts:548,1508,2794,3345`
- `client/src/ui/boonCopy.ts:673-729`, `render/console/readouts.ts:129-276`, `shipConsole.ts:250`, `loadoutBlock.ts:95`, `equipmentIcons.ts:514`, `render/drops.ts` -- distance text and the RANGE row
- `client/scripts/dispersionBench.mjs` + `dispersionBench/` -- the page recipe to copy
- Tests to delete / re-cut: shared `zone`, `dropout`, `stats`, `barrel`, `damageBands`, `radarShadow`, `foghorn`, `catalog*`, `draw`; server `spawn.test.ts:116`, `perception`, `signals`, `radarWire`, `foghorn`, `goldenFrames` (re-record), `upgrades`; client `radarFalloff`, `hullOverRadar`, `radarViewport`, `projectiles`, index-row fixtures
- Smokes: `weaponsSmoke.mjs` (`GUN_RANGE_FRAC`, 750 u pose disc), `fogSmoke.mjs:279`, `zoneSmoke.mjs:59`, `batchsim/overrides.ts`, `balanceProbe.ts:198`

## Tasks & Acceptance

**Execution — Phase A (then STOP for Eric's yes):**
- [ ] `shared/src/sim/hm.ts`, `shared/src/index.ts`, `shared/src/__tests__/hm.test.ts` -- the ruler and its formatter, with round-trip and format contracts -- R1
- [ ] `client/scripts/reachBench.mjs` + `client/scripts/reachBench/` -- one self-contained page from the real `generateMap`, radar-shadow walk and `hm.ts`: a real seed, a ship, every reach as a ring with a dial in hm (radar, guns per hull, secondaries, each shell type, muzzle flash, both sight tiers, shells / torpedoes / mines / crate kind, foghorn, star-shell lit radius, torpedo run per kind and tier), the radar shadow drawn at the chosen radar, shell and torpedo travel times, the time-compression readout, and the display candidates (zoom-following labelled rings; sweep styles; with / without bearing scale + heading line) -- R4, R5, R7, R10, R12
- [ ] Publish privately; record Eric's numbers and picks in the Spec Change Log; HALT

**Execution — Phase B (after the yes):**
- [ ] `shared` -- named hm facts replace `SIGHT` / `RUNG`; two sight stats; per-hull battery reach; RANGE row, card and roll out; dropout out; torpedo run rows; time-compression name; dated retirement notes; tests deleted or re-cut
- [ ] `server` -- two-tier contact through `observe` with the anonymous handle; point gates per R4; identity fields gated at class-ID; torpedo run; dropout gates and `sweepMiss` out; beacon keep-out on its own named fact; bots fold the plain contact as a class-less track; perception invariant line; golden frames re-recorded; smokes re-posed
- [ ] `client` -- plain-hull contact view and handoff; hm text on cards and consoles; five index rows; the picked rings and sweep; camera zoom-out fix; fog-canvas margin cap; radar march rays clipped to the map disk
- [ ] Records -- PV bump, `VERSION`, `package.json`, both trackers, `epic-11-context-amendments.md` (rulings + the deleted tests as a ruling), `docs/codebase-map.md`, `project-context.md`

**Acceptance Criteria:**
- Given `grep -rn "RUNG\|twelfth" shared/src server/src client/src`, then only dated retirement notes match.
- Given any frame, when a contact lies in the outer band, then it carries no class, turret, launcher or roster id, and the perception suite holds with six exceptions.
- Given a hull's battery, when stats fold, then its reach is its own hm fact and no index row or card changes it.
- Given a bot match, when it runs, then bots sail, fire and finish (both smokes first try).
- Given the client at any zoom, when the scope draws, then range rings are centered on the own ship and labelled in hm.

## Spec Change Log

- **2026-11-12 — Eric (chat), ruling R13; it OVERRIDES R7 in the intent contract.**
  - R13 Islands keep casting radar shadows on the big ocean. Eric: "the islands are actually supposed to be casting radar shadows. The 'scale' of the game is somewhat compressed, but hiding in radar shadows is part of the game. Vision and intel management IS the game." Reading: the shadow constant `K` is FROZEN at today's value (1,500² / 4) as its own named `CONFIG` fact and no longer follows `CONFIG.vision.radar`, so every island hides a ship from radar exactly as it does today. The author's first reading of his AskUserQuestion answer ("let it follow radar") was wrong. Whether shadows should be STRONGER than today at 400 hm is his to say on the bench page, which draws both.
  - Known-bad state avoided: at 400 hm radar a `K` that follows radar grows 36×, and only terrain above the mast would still hide a ship.
  - KEEP: `radarMastQ` 64 and the walk itself untouched.

## Design Notes

- `sightRange` stays the INNER (class-ID) reach so the ~15 existing sight gates keep one meaning; the hull reach is a new stat read only by the contact gate and the R4 rows that name it.
- The outer handle is per observer and per visit; `World.pseudonymFor` is the seam. A stable handle would link a hull to its class after one close pass.
- Muzzle flash is ordered ABOVE hull sight today by construction (radar × 0.5); at 400 hm radar it falls below 200 hm sight only by rounding — its reach becomes its own fact, set on the bench page.
- Client radar march cost rises with range; only correctness fixes land here (clip to the map disk, no rim gaps). The frame is measured on staging; the range-scaled cell is 11.3's.

## Verification

**Commands:**
- `node client/scripts/reachBench.mjs --selftest` -- expected: one self-contained HTML file, no page errors
- `npm test -w shared` -- expected: green
- `npm run check` -- expected: green (Phase B gate)
- `HC_DEV_OPTIONS=1` matchSmoke + weaponsSmoke against a self-booted server -- expected: pass first try (Phase B)

**Manual checks:**
- Eric's yes on the bench page numbers and the ring / sweep look before Phase B is committed.
