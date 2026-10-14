---
title: 'Story 9.8: The Twelfths Ladder'
type: 'feature'
created: '2026-10-13'
status: 'in-review'
baseline_revision: 'cc1e998d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-9-7-armor.md'
  - '{project-root}/_bmad-output/forge/realistic-vision-range/forged-idea.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Every sensor boundary is an eighth of a 660 u radar range, sight is half of it and every gun's reach IS the radar rung, so the first paint and the first shot are the same distance and fights collapse to the edge of the 330 u sight bubble. Eric wants "the feel of hunting around in the dark": far more radar than eyes, far returns that come and go, guns with their own reach, and a camera that can show the whole ring.

**Approach:** In this order inside one cycle: (1) every weapon range becomes its own CONFIG dial on the twelfths ruler, TIERED per card (Eric 2026-10-13, this spec step); (2) the ladder becomes twelfths of 1,500 u (`SIGHT` 500, `radar = SIGHT × 3`, flash / smoke / haze 750, far-radar anchor 1,000, `sightRange = radarRange / 3`); (3) a server-side DROPOUT roll inside `perception.observe()` makes every radar delivery increasingly fail to paint between 1,000 and 1,500 u (flat then cliff, each sweep its own deterministic roll, no size weighting this cycle); (4) the camera's zoom-out limit fits the live storm ring, the zoom-in limit is today's close framing, the default is today's scale, and the centre slides from own ship to the ring centre; (5) the foghorn discloses twelve bands. Bots trust a missed sweep only inside 1,000 u and anchor their bands on their own gun's range as a stopgap; the bot posture workover is a NEW Story 9.9.

## Boundaries & Constraints

**Always:**
- **Rulings of this spec step (Eric 2026-10-13, AskUserQuestion; recorded as epic-9 amendments 121–129 in BOTH homes):**
  - **121 Dropout curve = flat then cliff.** `p(paint)` is 1 up to 1,000 u (8/12), 0.9 at 1,250 u (10/12), 0.1 at 1,500 u (12/12); smooth between (two polynomial smoothsteps, no transcendentals); the far-radar brightness anchor is 1,000 u (the DRAFT confirmed). Each sweep REVOLUTION is its own roll. Dials: `CONFIG.vision.dropout = { startU: RUNG × 8, kneeU: RUNG × 10, kneeP: 0.9, rimP: 0.1 }` where `RUNG = radar / 12`.
  - **122 No radar cross-section this cycle.** Eric: *"You're overcomplicating it. Just make it all simple, and if we need to tweak it later, we know how. Radar Cross Section could very much be a 'hidden stat' that players have to take into account, but for now lets not assume so."* Reading of record: every return (hull, decoy, wake, cloud) sees the SAME curve; the decoy flickers exactly like a hull. (His earlier batch-1 pick "its own tiny footprint" is superseded by this sentence.)
  - **123 Everything radar delivers rolls:** ship blips, decoy paints, the wake's radar half, the countermeasure cloud's radar delivery. The lit / burn / foul zone circles are drawn hazards, never returns, and keep `zoneCircleVisible`. Contacts in sight are untouched (the roll lives beyond sight by construction: it multiplies the radar gate only).
  - **124 Bots trust a missed sweep only inside `dropout.startU`.** Beyond 1,000 u the sweep-miss tactic ignores an empty sweep and the plot ages on its normal clock.
  - **125 Weapon ranges are TIERED on the twelfths ruler, even split per card, RANGE row printed.** Tier I → Tier V over each line's four cards: BROADSIDE 5/12 → 6/12 (625 → 750); FLAK 5/12 → 6/12; MACHINE GUN 6/12 → 7/12 (750 → 875); CANNON 8/12 → 10/12 (1,000 → 1,250); STAR SHELLS 11/12 → 12/12 (1,375 → 1,500, keeping the lit-zone deck-gun lift); PHOSPHOR SHELLS 8/12 → 10/12; FOULING SHELL fixed 8/12 (1,000). Mines keep the 150 u leash; torpedoes unbounded. Per-card step = (V − I) / 4 (cannon and phosphor +62.5 u, the others +31.25 u). **Supersedes** amendment 105's "defaults = today's values".
  - **126 The bot posture workover is its own story,** inserted as **Story 9.9 "Bot Posture Workover"** (the cleanup tail renumbers 9.10–9.13); seed = Eric's three questions: *"do I move in and try to engage?" / "do i try to get away?" / "do i try to kite them?"* with intel beyond gun reach. STOPGAP this cycle: engagement bands become fractions of the bot's own mounted gun `rangeU` (today's `bandMin/MaxFrac` kept, re-based on the gun so today's absolute distances hold at a 660-ish reach; with the cannon at 1,000 they widen with the gun, which is the intent).
  - **127 Default framing = today's scale** (1,320 u across the short axis); zoom-in limit = today's close framing (880 u across); zoom-out limit = the live ring fitted to the short axis with `reveal.mapFitMargin`.
  - **128 The camera centre SLIDES from own ship to the ring centre** as the user zooms out past the default framing, arriving at the ring centre at the limit; at and below the default framing the ship is centred.
  - **129 Foghorn: twelve bands, proportional re-read.** Full volume through band 4 (sight), gains stepping evenly to 0.5 at band 12 (`1 − 0.5 × (b − 4) / 8` for b ≥ 4), island muffle +3 bands, silent past 12.
- **Layering:** the ladder, the dials, the dropout curve and the roll are pure shared functions (`shared/src/sim/dropout.ts`: `dropoutPaintP(dU, cfg)` and `dropoutRoll(seed, observerKey, targetKey, rev)` from `mulberry32` + `hashSeedText`, integer mixing only); the server applies them inside `observe()`; a missed paint never leaves the server; the SIX perception exceptions are untouched; nothing new rides the wire.
- **Determinism:** the roll is a STATELESS hash (world seed ⊕ observer key ⊕ target key ⊕ sweep revolution index), never a consumed stream (`observe()` runs once per client and per bot thunk). `ShipRecord.sweepRev` increments when `advanceSweeps` wraps the angle; a swept target rolls once per revolution.
- **`effectiveStats()` stays the one fold:** `rangeU` becomes a stat-addressable equipment path (`effects.ts` whitelist) seeded from `CONFIG.<weapon>.rangeU` (the Tier I value) with the catalog authoring `statEffect('equipment.<weapon>.rangeU', { add: step })` on each of the four cards; the post-fold re-pins in `clampStats` and `boons.rePinDerived` are DELETED; `sightRange = radarRange / 3` in both homes; `muzzleFlashFactor` 0.5; `farRadar = SIGHT × 2`; `detectFactor` 1; `radarMastQ` 64 untouched; `litRadius = SIGHT / 2` (250, amendment 108).
- **Client:** camera limits are ABSOLUTE spans in world units (`CLIENT_CONFIG.zoom = { closeSpanU: 880, defaultSpanU: 1320, keyStep, wheelRate }`), `baseZoom = shortAxis / defaultSpanU`, zoom-out limit `shortAxis / (2 × ringRadius × mapFitMargin)` re-fitted as the ring closes (hysteresis on the fog rebake, `redrawZoomFrac` precedent; `ringRadius` fed from the per-frame zone view, guarded r → 0 and never below the close limit); the reveal, spectate clamps and perfCapture framings become absolute too; `surfaceRef` is re-fitted so tall islands keep today's red share at the new rim (900 × 1500 / 660 ≈ 2045, the doc's own arithmetic); `HEAT_POINT_REF` / `HEAT_WAKE_REF` / `blip.dim` / `leadMax` / `audio` reach follow by derivation; foghorn `bandGain` and chevron weights 1..12; the fouling shell's aim and arc read a `rangeU` dial, never `radarRange`.
- **Harness:** `--tune <weapon>.rangeU` reachable for every weapon (remove from `DERIVED_TUNE_KEYS`, floor 1), `--tune vision.dropout.*` (`startU`/`kneeU` floor 1, probabilities clamped 0..1), `phosphorShells.` family added; `balanceProbe` prints the Tier I / V reach per gun.
- **Tests assert contracts, cite amendments, never pin 1,500 / 500 / 750 as literals** (epic-9 amendment 8): ladder pins read `radar / 12` ratios 4 / 6 / 8 / 12; the perception oracle re-derives the roll through the exported pure function and keeps its own sight/radar helpers; non-vacuity ledgers: a hull at 1,400 u painted on SOME revolutions and not others, a hull at 900 u painted on every clear sweep, a decoy at 1,400 u rolling like a hull; placements that sat in the (330, 660] annulus move to (500, 1,000]; the fixed invariant arena (2,380 u) stays; `goldenFrames` re-recorded ONCE with the diff explained; `radarShadow` "situational" band re-measured and re-based with the number recorded.
- **Lattice cost:** measured on THIS machine (the ratified reference `MacBookPro16,1`) with `client/scripts/perfCapture.mjs` at the new framings (close / default / ring-fit at match start) and recorded in the spec and `deferred-work.md` (the 2026-08-07 cycle-61 entry closed or re-opened by the number against the 2.5 ms Block-If bar — there is no 2 ms budget in client code; the AC's "2 ms" is read as that bar).
- `PROTOCOL_VERSION` 81 → 82; version 0.18.50, cycle 185; amendments 121–130 in BOTH homes; both trackers ONE line; `epics.md` 9.8 stamp + new 9.9 + tail renumber; CHANGELOG; How-to-Play, GDD and EXPERIENCE.md untouched (9.13's, was 9.12).
- One PR to `development` at the end, never merged.

**Block If:** any further design gap (a number, copy, a visual) these rulings and amendments 102–109 do not cover → AskUserQuestion before the PR, never a ledger entry; the perfCapture number exceeds the 2.5 ms bar at any framing → ask Eric (cell size, framing cap) before the PR.

**Never:** a radar cross-section / per-class weighting (122); confining guns to sight; a threshold branch on `farRadar` (colour is intensity); a seventh perception exception; per-ship spatial schema fields; bot posture logic beyond the band stopgap and the miss rule (126); in-game copy; editing How-to-Play prose; GDD / EXPERIENCE stamps; whole-map radar; merging the PR; CLAUDE.md edits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ladder | base stats | `radarRange` 1,500; `sightRange` 500; flash/smoke/haze reach 750; detect 500; far anchor 1,000; `RUNG` 125 | — |
| Gun fold | cannon 0 / 2 / 4 cards | `gun.rangeU` 1,000 / 1,125 / 1,250; MG 750 / 812.5 / 875; flak & broadside 625 / 687.5 / 750; star 1,375 / 1,437.5 / 1,500; phosphor 1,000 / 1,125 / 1,250 | unknown path fails closed |
| Fouling | any | burst to `CONFIG.foulingShell.rangeU` 1,000 on server, arc and aim preview | — |
| Dropout p | d = 900 / 1,000 / 1,125 / 1,250 / 1,375 / 1,500 | 1 / 1 / ~0.95 / 0.9 / ~0.5 / 0.1 (monotone, smooth) | d ≤ startU → 1; non-finite → 0 |
| Roll determinism | same (seed, obs, tgt, rev) | identical boolean on every call and on the oracle | — |
| Roll independence | rev k vs k+1 | may differ; over 200 revs at 1,400 u the paint share ≈ p ± 0.1 | — |
| Blip at 900 u | swept, clear | painted on EVERY revolution | — |
| Blip at 1,400 u | swept, clear, 200 revs | painted on some, missed on others; a miss emits NOTHING | — |
| Decoy at 1,400 u | same | same curve as a hull (122) | — |
| Wake / cloud radar half | at 1,400 u | roll applies; sighted delivery unaffected | — |
| Zone circles | centre at 1,400 u | delivered as today (no roll) | — |
| Bot miss | track at 1,200 u, empty sweep | NOT marked gone; at 900 u, marked gone as today | — |
| Bot band | duelist, cannon 1,000 | engage band 80–300 u (0.08–0.3 × gun `rangeU`) | — |
| Camera default | 1600×900, zoom reset | 900 / 1320 px per u; ship centred | — |
| Camera close limit | zoom in fully | 900 / 880 px per u | — |
| Camera out limit | ring r 4,000 | 900 / (8,000 × 1.05) px per u; centre = ring centre; re-fits as r closes; r 0 clamps to the close limit | NaN/0 guarded |
| Centre slide | span halfway between default and ring span | centre halfway ship → ring centre | — |
| Foghorn | d = 400 / 500 / 750 / 1,000 / 1,500 / 1,501 | band 4 / 4 / 6 / 8 / 12 / silent; island at band 4 → 7; gains 1 / 1 / .875 / .75 / .5 | non-finite intel → silent |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `SIGHT` 500; `RUNG = SIGHT * 3 / 12` (125); vision block rewritten in twelfths (`radar = SIGHT * 3`, `muzzleFlash = SIGHT * 1.5`, `muzzleFlashFactor 0.5`, `farRadar = SIGHT * 2` with the stale "no caller" comment corrected: it feeds `HEAT_POINT_REF`); new `vision.dropout`; `rangeU` on `gun` (RUNG×8), `machineGun` (×6), `flak` (×5), `broadside` (×5), `starShells` (×11), `phosphorShells` (×8), `foulingShell` (×8); stale 247.5 / 660 / "3/8" prose fixed where touched
- `shared/src/sim/dropout.ts` (new) -- `dropoutPaintP`, `dropoutRoll`; exported from `index.ts`
- `shared/src/sim/stats.ts`, `sim/boons.ts`, `sim/effects.ts` -- `rangeU` seeded from CONFIG, addressable; re-pins deleted; `sightRange = radarRange / 3`; `RANGE` row prints from the folded stat (already does)
- `shared/src/sim/catalog.ts` -- `statEffect('equipment.<w>.rangeU', { add: step })` on every card of `deckGun`, `machineGun`, `flak`, `broadside`, `starShells`, `phosphorShells`
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 82 + history line
- `shared/src/__tests__/{zone,stats,barrel,arcs,shell,radarShadow,foghorn,...}.test.ts` -- twelfths pins (ratios), dials present, `GUN_RANGE = CONFIG.gun.rangeU`, K = radar²/4 by derivation, 12-band enum, situational band re-measured
- `server/src/game/signals.ts` -- `blipGate` ∧ `dropoutRoll`; `wakeGate`, `discRadarDetected` likewise; `hornBandFor` 12 bands / floor 4 / +3 / silent > 12; `muzzleFlashReach` unchanged (factor moves); `foggedContext` carries the seed
- `server/src/game/perception.ts` -- thread seed + observer key into the context; nothing else
- `server/src/game/world.ts` -- `ShipRecord.sweepRev` (++ on wrap in `advanceSweeps`, reset with the angle); `captainDiscs` rides `radarRange` (recorded consequence)
- `server/src/game/equipment/consumables/foulingShell.ts`, `shared/src/sim/arcs.ts` -- `CONFIG.foulingShell.rangeU`
- `server/src/game/ai/profiles.ts`, `utility.ts`, `tactics.ts`, `shift.ts`, `sweepMiss.ts`, `consumables.ts` -- bands × own gun `rangeU`; miss rule inside `dropout.startU`; fouling reach dial
- `server/scripts/batchsim/{overrides,balanceProbe}.ts` -- dials reachable, floors, probe columns
- `server/src/__tests__/{perception,signals,foghorn,goldenFrames,botTactics,botPlot,broadside,...}.test.ts` -- oracle mirrors the roll; placements re-based; non-vacuity ledgers; horn oracle 12-band; golden re-recorded once
- `client/src/render/camera.ts` -- absolute limits, `setRingRadius`, centre slide, reveal/spectate absolute; `client/src/main.ts` -- feed `zv.cur.r`, zoom wheel/keys over the new limits, rebake hysteresis
- `client/src/config.ts` -- zoom block, `surfaceRef` refit, `bandGain` 1..12, stale prose; `render/foghorn.ts` 12 bands; `render/weaponArc.ts`, `render/aimPreview.ts` -- fouling via `rangeU`; `render/ambient.ts` framing
- `client/scripts/perfCapture.mjs`, `stage/worstCase.ts` -- framings `close / default / ring-fit`
- `client/src/__tests__/{camera,spectate,revealFraming,foghorn,radarFalloff,radarHeatmap,weaponArc,aimPreview,...}.test.ts` -- re-based
- Records: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-9-context-amendments.md,epic-9-context.md,deferred-work.md}`, `_bmad-output/planning-artifacts/epics.md` (9.8 stamp, NEW 9.9, tail 9.10–9.13)

## Tasks & Acceptance

**Execution (wave 1 — shared, one agent, Opus):**
- [x] `shared/src/constants.ts`, `sim/{dropout,stats,boons,effects,catalog}.ts`, `index.ts` -- dials FIRST (commit), then the ladder (commit), then dropout + PV 82 -- the one source both sides run
- [x] `shared/src/__tests__/*` -- matrix rows (fold, curve, roll determinism/independence), ratio pins citing 103/121/125; `npm test -w shared`, `npm run build -w shared`

**Execution (wave 2 — server Opus and client Opus in parallel, shared frozen):**
- [x] server: `signals.ts`, `perception.ts`, `world.ts` (sweepRev), fouling, bots, harness; perception oracle + ledgers, foghorn 12, placements, golden once; `npm test -w server`
- [x] client: camera limits + slide + ring feed, config derivations + `surfaceRef`, foghorn tables, fouling via dial, perfCapture framings; tests; `npm test -w client`; then the orchestrator runs `npm run build:perf -w client && node client/scripts/perfCapture.mjs` on this machine and records the numbers

**Review gate (orchestrator):** Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol` on the same diff; seed: the roll's determinism across `observe()` callers and the oracle; the fog-rebake churn at the ring limit; a gun card's RANGE step vs the aim clamp mid-flight.

**Execution (wave 3 — record, Sonnet):**
- [x] `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `epics.md` (stamp + 9.9 + renumber), both trackers, amendments 121–137 in BOTH homes, `deferred-work.md` (cycle-61 cost entry, 1552/1557/1692 stamps, new 9.8 entries) -- 0.18.50 / cycle 185 / PV 82
- [x] `npm run check` green; branch pushed; ONE PR to `development`, never merged

**Acceptance Criteria:**
- Given base stats, when `effectiveStats` runs, then `radarRange / sightRange = 3`, the flash reach is `radarRange × 0.5`, `litRadius = sightRange / 2`, and no `rangeU` equals `radarRange` by derivation (each is its CONFIG dial plus its card steps).
- Given a hull 1,400 u from an observer with a clear bearing over 200 sweep revolutions, then it is painted on some and missed on others, every miss emits no frame content for it, and the test oracle agrees on every revolution; at 900 u it is painted on every revolution.
- Given a bot with a track at 1,200 u and an empty sweep, then the track is not marked gone; at 900 u it is.
- Given the camera at 1600×900, then zoom reset shows 1,320 u on the short axis with the ship centred, full zoom-in 880 u, full zoom-out `2 × ringRadius × 1.05` centred on the ring, and the limit re-fits as the ring closes.
- Given the foghorn, then bands run 1..12 with the floor, +3 island step and silence as the matrix.
- Given `npm run check`, then lint (complexity ≤ 10), tsc ×3, every test and the hook test pass; `PROTOCOL_VERSION` is 82; the perception master invariant still lists exactly SIX exceptions.
- Given perfCapture on this machine at close / default / ring-fit, then the numbers are recorded in this spec and the ledger.

## Spec Change Log

### 2026-10-13/14 — build-gate rulings folded in (Eric's, not the author's; the intent contract is read-only)
- Eric ruled seven things at the build gate that the spec step had not reached: 16 captains on a 10,000 u ocean with rings 10000 → 7000 → 4000 → 2000 → 0 (amendment 130); cannon 12/12/15/15/18 and flak 20/28/36/44/52 as an experiment (131); flak burst damage D → D − 10 at the rim by the hull's nearest outline point (132); a six-row card grid, faint green inside the dropout cliff, and the whole-ring zoom shipped at the reveal's cost (133); fleet denial inside the dropout start (134); RANGE one decimal when needed (135); fleet waves 16 → 8 → 4 (136). The Code Map's "amendments 121–130" is now 121–137.
- The matrix row "Camera out limit … r 0 clamps to the close limit" was the author's reading and is superseded by the review gate: the ring fit is a zoom-OUT limit only and never pulls tighter than the default framing (137g).
- KEEP: the per-revolution stateless roll keyed on a server-private seed; the fold with `rangeU` as an addressable path and the steps authored in the catalog; the absolute camera spans; the oracle mirroring the roll through the exported function.

## Review Triage Log

### 2026-10-14 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol on the same diff cc1e998d..06af75f2; Codex FIX-FIRST, both hunters BUILD-ON-IT)
- intent_gap: 0 (the two ruling gaps — the fleet denial disc at 1,500 u × 16 on the 5,000 u ocean, and the quarter-rung RANGE copy — were put to Eric live and ruled, amendments 134–135)
- bad_spec: 0
- patch: 8: (high 2, medium 3, low 3)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` ALL THREE, CONFIRMED: a countermeasure cloud whose bearing span straddles the sweep wrap was rolled under two revolution indices in one beam pass (paint then miss). Fixed: a disc rolls on the revolution in which the beam ENTERED it (`discRollRev`); the oracle mirrors it independently; 50+ wrap passes all-paint or all-miss, red-then-green.
  - `[high]` `[patch]` Codex, CONFIRMED: a far cloud, once delivered, kept painting the client's radar from its held copy on every later sweep, so only its first disclosure flickered (ruling 123 says everything radar delivers rolls). Fixed: the radar return source reads a held cloud only while a row arrived within the last 1.5 revolutions (`cloudReturnGate`); sight-range clouds always return; haze, held set and wake mirror untouched; red-then-green.
  - `[medium]` `[patch]` Codex, CONFIRMED: the bot miss rule tested the plot's predicted centre, not its uncertainty band. Fixed: `d + predictedAssocRadius ≤ startU`; red-then-green.
  - `[medium]` `[patch]` Edge Case Hunter, PLAUSIBLE (orchestrator ruling): at the out limit a captain outside the ring could leave the screen. Fixed: the own hull is clamped 82 u inside every edge while the slide is engaged; red-then-green.
  - `[medium]` `[patch]` Edge Case Hunter + Blind Hunter, PLAUSIBLE (orchestrator ruling): once the ring's fitted span fell below the default framing the "zoom-out limit" force-zoomed a captain IN during the last close. Fixed: the ring fit never pulls tighter than the default framing; red-then-green.
  - `[low]` `[patch]` Edge Case Hunter, CONFIRMED (harness only): `rimP > kneeP` made a non-monotone curve; `kneeU ≥ radar` silently collapsed the band. Fixed: the pure function collapses a non-curve to the documented step and the harness refuses the dial set on the FINAL values; red-then-green.
  - `[low]` `[patch]` Blind Hunter, PLAUSIBLE (harness only): a 0-hp flak blow (edgeFalloff ≥ D) still ran the damage gate, aggroed drones and emitted `dmg 0`. Fixed: a 0-hp blow is no blow; red-then-green.
  - `[low]` `[patch]` Blind Hunter: `CONFIG.match.fillTo`'s comment claimed to be the lobby fill; it is harness-only (amendment 41 deleted the room's fill). Reworded.
  - Live Eric rulings at the gate: fleet waves denied inside the dropout start, not radar (134, Blind Hunter's gap); RANGE prints one decimal only when needed (135, Blind Hunter's gap).
  - Cross-model picture: all three flagged the cloud-at-the-wrap roll independently (CONFIRMED-tier, fixed without debate). Codex alone raised the held-cloud radar paint and the miss-rule radius (both confirmed by trace against ruling 123/124, fixed). The Edge Case Hunter alone raised the harness non-curve guards and the two camera behaviours (confirmed, fixed as orchestrator rulings Eric may veto on staging). The Blind Hunter alone raised the fleet discs and the RANGE copy (Eric ruled live) and the 0-hp blow and fillTo (fixed). Nothing rejected.
## Design Notes

- **Why the roll is per revolution, not per tick:** a target is swept over one or two ticks (half-open beam window); rolling per tick would paint on one tick and miss the next within the same pass. One roll per (observer, target, revolution) reads as "this sweep saw it or didn't".
- **Why a stateless hash:** `observe()` is called once per connected client and per bot each tick; a consumed stream would make the sim depend on client count.
- **Why the bands anchor on the gun, not radar:** with 1,500 u radar and 625–1,250 u guns a radar-fraction band (0.08–0.8) puts bots at 120–1,200 u, mostly unable to fire; the gun fraction preserves today's distances and follows the dials. The real posture logic is Story 9.9.
- **Curve:** `p = 1` for `d ≤ startU`; `1 − (1 − kneeP) × S((d − startU)/(kneeU − startU))` to the knee; `kneeP − (kneeP − rimP) × S((d − kneeU)/(radar − kneeU))` to the rim; `S(x) = x²(3 − 2x)` clamped. Radar's own annulus excludes `d > radar`.

## Verification

**Commands:**
- `npm test -w shared` -- green; ratio pins; curve/roll rows
- `npm test -w server` -- green; oracle agreement; non-vacuity ledgers; golden re-recorded once
- `npm test -w client` -- green; camera limits; foghorn 12
- `npm run build:perf -w client && node client/scripts/perfCapture.mjs` -- numbers recorded (reference device = this machine)
- `npm run check` -- lint 0 errors, tsc ×3, all tests, hook test

**Manual checks:**
- Eric judges on staging: the approach phase, rim flicker, gun RANGE rows and reach rings, the ring-fit zoom and the slide, the foghorn.
