# Batch-sim evidence — 2026-10-06 (Story 9.1 tuning pass, session 1: the map)

**Who asked, what for.** Eric, `/balance-sim`, 2026-10-06 (Story 9.1 is his to steer; this session is his own harness session, before any dev-story run). His targets and diagnosis, verbatim: *"I want ~50% of the field gone at each ring, on average. So 20 becomes 10 becomes 5 becomes 2-3. Games are ending around 6-8 minutes. The game is deadly again, which isn't bad. But the other issue is that there's no real easy way to escape combat."* Three map experiments, singly first and then in combination: **map radius ×1.5 and ×2**; **more islands and landmasses** (less open ocean, more things that block vision/radar and maneuvering); **two spawn rings of 12 and 8 instead of one ring of 20**.

**Rulings taken before the run (AskUserQuestion, Eric 2026-10-06):** inner ring at **0.4 of the map radius** (outer stays 0.8); island cover arms at **5 % and 10 %** of the ocean (today 2.5 %, band 2–3 %); **91 matches per arm** (the ±10 pp coarse tier, under the 99 cap), even roster, singles first and combinations after he reads the singles.

**Standing limits.** ±10 pp tier: class claims are "consistent with the band", never "in band". Gun numbers are Eric's math, never sim (2026-10-02) — no gun reading is made here. The sim measures attrition and class share only. Bots are the lobby: two of the six bot quality bars fail on the baseline (below), as they did on 2026-09-30 and 2026-10-01; Eric's 2026-09-30 ruling treats the pool-era bars as measurements, not gates. The storm-closing-rate band pin in `zone.test.ts` is NOT a design input (Eric 2026-10-06: ~4 min to the next ring, nobody fails to outrun it unless bad); a radius change failing that pin is a stale pin.

Campaign JSONs: `~/hc-campaigns/tune-2026-10-06/<arm>-shardNN.json`. Analysis: `analyze_campaign.py analyze` over all arms, `--cycles 240,480,720` (default; `CONFIG.zone` untouched in every arm).

## 0. Instrument changes made for this run (harness only, no gameplay change)

Branch `worktree-create-story-9-1-tuning-pass`, commit `535440fe`:

- `--set terrain.<key>` — the map-generation panel `TERRAIN_PARAMS` (`shared/src/sim/heightField.ts`) joins the `--set` surface: `coverTarget` / `coverMin` / `coverMax` (fractions in (0, 1); `coverMin ≤ coverTarget ≤ coverMax` is checked on the finished panel) and `regionWavelength`. Same undo/restore closure as every other dial.
- A `--set map.baseRadius` override now **drags `terrain.regionWavelength` with it** unless the arm sets the wavelength itself. Before this, a radius arm measured a board whose macro land-clustering term was still sized for 2800 u — not the board a `CONFIG` change would ship.
- `--spawn-rings 12@0.8,8@0.4` — a harness-only multi-ring candidate lattice installed on `server/src/game/spawn.ts` (`setSpawnLayout`; `null` = the shipped single ring, candidate for candidate; no production path calls the setter). Every ring shares the per-match phase; placement is the same greedy max-min with island clearance. The JSON variant carries `spawnRings` and `spawnDiag` = hulls the coarse lattice could not seat (they took the validated fallback ladder). **Known limit:** mapgen's coastline keep-clear band exists only around the shipped ring, so inner slots can sit near land.
- Feasibility probe before the run (12 seeds each): mapgen validates at 2800 u / 5 %, 7.5 %, 10 %; 4200 u / 2.5 %; 5600 u / 2.5 % and 5 %. Islands per map ≈ 24 (today) → 31 (5 %) → 41 (10 %) at 2800 u; ≈ 52 at 4200 u and ≈ 91 at 5600 u at today's 2.5 % — a bigger map at the same percentage already has more islands, so the two experiments overlap. Generation ≈ 96 ms/map today, 200 ms at 4200 u, 360 ms at 5600 u.
- Tests: `server/src/__tests__/spawnLayout.test.ts` (4), `server/scripts/batchsim/__tests__/terrainDials.test.ts` (6); the existing batchSim and spawn suites pass unchanged (100).

## 1. Baseline (0.18.33 numbers, profile spend, even roster, n = 91, seed 20261006)

### 1a. Attrition pacing — Eric's target (20 → 10 → 5 → 2-3)

| checkpoint | alive (of 20) | target | matches still running |
| --- | --- | --- | --- |
| 4:00 | **7.4** (BS 2.9 · ML 2.2 · TB 2.3) | 10 | 100 % |
| 8:00 | **1.3** | 5 | 52 % |
| 12:00 | 0.0 | 2.5 | 1 % |

Median match **8:04** (p25 7:15, p75 8:45, max 10:18); every match resolved by field cleared; pooled bot life median 199 s (exact survivorship, n = 1,820). This matches Eric's "6-8 minutes" and is markedly deadlier than the 2026-10-01 baseline (11.8 / 3.3 alive, median ≈ 10:20) — the 2026-10-02 gun retune (cycle 166) sits between them. Ring 1 kills 63 % of the field instead of 50 %; ring 2 kills 82 % of what is left instead of 50 %; ring 3 is **unmeasurable** (the analyzer's own warning: later cycles never happen).

### 1b. Class win share

BS 38.5 % [29–49] · ML 33.0 % [24–43] · TB 28.6 % [20–39] — all three consistent with the 31–35 % band at this tier; roster even (613 / 601 / 606 hull-matches).

### 1c. Bot quality bars (validity context)

PASS: resolution before collapse 100 %; max single-bot kill share 23 %; land contact 0.6 %; levels spent 100 %. **FAIL:** bots scoring ≥ 1 kill 46.9 % (bar ≥ 60 %, failing since the pool era); **storm deaths 3.3 % of bot deaths** (bar 5–20 %) — the storm barely kills anyone because the guns do first, which is the same fact as 1a.

## 2. Single-dial arms (n = 91 each; diff vs baseline with 95 % CI)

Alive-at-T is the exact bot-level survivorship (1,820 bot-lives per arm); the CI on a difference is bot-level and ignores within-match clustering, so it is a touch optimistic. Class share effects are the analyzer's own (pp vs baseline, 95 % CI). Every match in every arm resolved by field cleared; no hull in any arm fell off the spawn lattice (`spawnDiag` 0 / 1,820).

### 2a. The three arms that have landed (19:40)

| arm | dial | alive@4:00 (Δ vs 7.44) | alive@8:00 (Δ vs 1.29) | matches running @8:00 | median match | mean bot life | BS / ML / TB share (Δ pp) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | — | 7.44 ± 0.44 | 1.29 ± 0.23 | 52 % | 8:04 | 220 s | 38 / 33 / 29 |
| r150 | `map.baseRadius` 2800 → 4200 (×1.5) | 7.97 (+0.53 [−0.10, +1.16]) | 1.58 (+0.30 [−0.04, +0.63]) | 64 % | 8:40 | 240 s | 37 / 38 / 24 (−1 / +6 / −4, all n.s.) |
| r200 | `map.baseRadius` 2800 → 5600 (×2) | **8.23 (+0.79 [+0.16, +1.43])** | **2.09 (+0.80 [+0.44, +1.16])** | 80 % | 9:21 | 261 s | 37 / 38 / 24 (same totals as r150 by coincidence — per-shard tallies differ) |
| cov05 | cover 2.5 % → 5 % (band 4–6 %) | 7.73 (+0.29 [−0.34, +0.92]) | 1.54 (+0.25 [−0.08, +0.59]) | 61 % | 8:22 | 225 s | 45 / 30 / 25 (+7 / −3 / −3, all n.s.) |

**Readings.**
- **Doubling the map is the one dial that moved both checkpoints with confidence**, and it is still far from the target: 8.2 alive at 4:00 against 10, 2.1 at 8:00 against 5. It stretches the match by about 1:15 at the median and lifts the mean bot life by 40 s. The storm timeline did not move (`CONFIG.zone` untouched), so the rings close twice as fast in absolute terms and nothing in the data says that hurt anyone — storm deaths stayed a small share (see 1c).
- **×1.5 is half of ×2's effect in the same direction and does not clear its own CI at this tier**; a ±5 pp campaign would resolve it, but the ×2 reading already says the direction and the size.
- **Doubling the islands at today's map size did roughly what ×1.5 did, also inside its CI.** It is the first arm to nudge the DREADNOUGHT's share up (+7 pp, n.s.) — a heavier hull may like cover more than a fast one does; one arm is not evidence of that.
- None of the three changes the shape of the problem: ring 1 still kills ~60 % of the field and ring 2 still kills ~75 % of what is left. The map dials are a slow lever on time-to-kill; they do not make the first half of the match a half.

### 2b. The last two arms (20:34) — the full single-dial table

| arm | dial | alive@4:00 (Δ vs 7.44) | alive@8:00 (Δ vs 1.29) | matches running @8:00 | median match | mean bot life | BS / ML / TB share (Δ pp) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | — | 7.44 ± 0.44 | 1.29 ± 0.23 | 52 % | 8:04 | 220 s | 38 / 33 / 29 |
| r150 | radius ×1.5 (4200 u) | 7.97 (+0.53 [−0.10, +1.16]) | 1.58 (+0.30 [−0.04, +0.63]) | 64 % | 8:40 | 240 s | 37 / 38 / 24 (n.s.) |
| r200 | radius ×2 (5600 u) | **8.23 (+0.79 [+0.16, +1.43])** | **2.09 (+0.80 [+0.44, +1.16])** | 80 % | 9:21 | 261 s | 37 / 38 / 24 (n.s.) |
| cov05 | cover 5 % | 7.73 (+0.29 [−0.34, +0.92]) | 1.54 (+0.25 [−0.08, +0.59]) | 61 % | 8:22 | 225 s | 45 / 30 / 25 (n.s.) |
| cov10 | cover 10 % (band 8–12 %) | **8.15 (+0.71 [+0.08, +1.35])** | **2.20 (+0.91 [+0.55, +1.28])** | 78 % | 9:17 | 268 s | 40 / 33 / 27 (n.s.) |
| rings | spawn 12 @ 0.8 R + 8 @ 0.4 R | **6.47 (−0.97 [−1.59, −0.35])** | 1.33 (+0.04 [−0.28, +0.37]) | 56 % | 8:15 | 231 s | 32 / 37 / 31 (BS −7 n.s.) |

**Readings, ranked by measured effect on attrition.**
1. **Cover 10 % ≈ radius ×2.** Quadrupling the land at today's size did what doubling the map did: +0.7 alive at 4:00, +0.9 at 8:00, the median match to ~9:20, mean bot life +45 s. Both clear their CIs; neither reaches the target (10 / 5). Cover 10 % costs nothing in generation time that matters (147 ms/map) and does not change the storm's absolute closing speed, which the ×2 map does. Class share is flat on cov10 (40 / 33 / 27), so the +7 pp DREADNOUGHT nudge on cov05 reads as noise.
2. **Radius ×1.5 and cover 5 %** are each about half of the above and inside their CIs at n = 91.
3. **The two-ring spawn HURT ring 1**: −1.0 alive at 4:00 with confidence, nothing at 8:00. At today's radius the inner ring's 8 slots are 857 u apart and 1,120 u from the outer ring — every inner hull starts with neighbours inside radar reach at the first sweep, so the first fights come sooner. The lattice itself seated every hull (0 fallbacks across 1,820). Class share moved toward the SPEEDBOAT (+2) and away from the DREADNOUGHT (−7), neither significant; a plausible story (the heavy hull is the one that cannot leave an early brawl) but one arm is not evidence. On a ×2 map the same layout spaces the inner ring at 1,714 u, outside radar — the ring effect may invert there; unmeasured.

**What none of the singles did:** change the SHAPE. Ring 1 kills 59–67 % of the field in every arm (target 50 %); ring 2 kills 73–82 % of what is left (target 50 %). The map dials buy time at the rate of about one extra survivor per checkpoint for a doubling of either map area or land fraction. Reaching 10 alive at 4:00 on map dials alone would need more than the ×2 / 10 % arms deliver, which points at hull hp or the heal channels for the rest — not measured this session, and Eric's dials to choose.

## 3. Combination arm — C1: map ×2 + cover 10 % (Eric picked C1 alone; landed 22:34)

Candidates offered after the singles: C1 r200 + cov10; C2 r150 + cov10; C3 r200 + cov10 + rings; C4 r200 + rings. **Eric ran C1 only.** (`--set map.baseRadius=5600 --set terrain.coverTarget=0.10 --set terrain.coverMin=0.08 --set terrain.coverMax=0.12`, seed 20261300, 91 matches asked.)

| arm | alive@4:00 (Δ vs 7.44) | alive@8:00 (Δ vs 1.29) | running @8:00 | alive@12:00 | running @12:00 | median match | mean bot life | BS / ML / TB share (Δ pp) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 7.44 | 1.29 | 52 % | 0.0 | 1 % | 8:04 | 220 s | 38 / 33 / 29 |
| r200 | 8.23 (+0.79) | 2.09 (+0.80) | 80 % | 0.3 | 14 % | 9:21 | 261 s | 37 / 38 / 24 |
| cov10 | 8.15 (+0.71) | 2.20 (+0.91) | 78 % | 0.4 | 17 % | 9:17 | 268 s | 40 / 33 / 27 |
| **C1 r200 + cov10** | **11.18 ± 0.46 (+3.74 [+3.10, +4.38])** | **2.74 ± 0.32 (+1.45 [+1.06, +1.85])** | 92 % | 0.5 | 23 % | **9:51** | 294 s | 36 / 37 / 28 (−3 / +4 / −1, all n.s.) |

**Readings.**
- **The two dials are more than additive at ring 1.** Singly they gave +0.8 and +0.7; together +3.7 — the first arm this session to reach Eric's 4:00 target (11.2 alive against 10; the target band is now crossed from above). A 2× board at 10 % land is ~145 islands (the eye-check renders in `~/hc-campaigns/tune-2026-10-06/maps/`): captains spend the first four minutes finding each other.
- **Ring 2 is still far too lethal:** 2.7 alive at 8:00 against 5, i.e. 76 % of the 4:00 survivors die in the second cycle (baseline 83 %). The combination buys time before the first fight, not inside it. 23 % of matches now reach 12:00 (ring 3 is becoming measurable; 0.5 alive against 2.5).
- **Class share flat** (36 / 37 / 28, every delta inside its CI). No hull fell off the lattice (0 / 1,760).
- **Three of 91 seeds could not generate a map at 5600 u / 10 % land** — `MapGenerationError … after 4 repair attempts (coverage band [0.08, 0.12] + navigability + ≥1 landmass)`, match seeds 2675118670, 4043286079, 3028359684; the harness recorded them as failures and the arm stands on 88 matches. The single arms (2800 u / 10 %, 5600 u / 2.5 %) had **zero** failures in 91, and the 12-seed feasibility probe missed it. **This is the map-gen throw Eric deferred on 2026-09-16** (a throw at the retry cap kicks a queued group, "QUEUE CLOSED"); at these settings it would fire on roughly 1 lobby in 30. Not fixed here — his open thread, now with a settings pair that makes it frequent. One C1 match ended `lastHumanSunk` rather than `fieldCleared` (a bot-only lobby; the harness end-cause edge at the tick budget), 87 / 88 resolved by field cleared.

## 4. Proposals (ranked by measured effect; Eric rules line by line)

| # | dial(s) | current → proposed | measured effect (both targets) | sample | cost elsewhere | ruling |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `CONFIG.map.baseRadius` + `TERRAIN_PARAMS.cover{Target,Min,Max}` together | 2800 → 5600 and 0.025 / 0.02 / 0.03 → 0.10 / 0.08 / 0.12 | alive@4:00 7.4 → 11.2 (target 10, **met**); alive@8:00 1.3 → 2.7 (target 5, not met); median match 8:04 → 9:51; class share flat | 88 | mapgen throws on ~3 % of seeds at this pair (the deferred throw becomes live); mapgen ~0.5 s/map and a 810×810 height raster on every client; the storm closes twice as fast in absolute terms (`CONFIG.zone` untouched — Eric: not a concern); PV bump (same seed, different ocean); `heightField.test`/`map.test`/`zone.test` pins re-based | PENDING |
| P2 | `TERRAIN_PARAMS.cover*` alone | 0.025 → 0.10 (band 0.08–0.12) | +0.7 / +0.9 alive; median 9:17 | 91 | none measured; 0 generation failures in 91 at 2800 u; map is ~47 islands (seed 42 render) | PENDING |
| P3 | `CONFIG.map.baseRadius` alone | 2800 → 5600 | +0.8 / +0.8 alive; median 9:21 | 91 | storm closes 2× faster in absolute terms; mapgen cost ×4; PV bump | PENDING |
| P4 | two spawn rings 12 @ 0.8 R + 8 @ 0.4 R | one ring of 20 | **−1.0 alive at 4:00** (worse), 0 at 8:00 | 91 at 2800 u | inner hulls start inside radar reach | NOT RECOMMENDED at today's radius; **unmeasured** on a 2× board (inner spacing 1,714 u, outside radar) |
| — | radius ×1.5; cover 5 % | | each ≈ half of P2/P3, inside CI | 91 each | | no proposal (null at this tier) |

**Unmeasured, stated as reasoning only:** nothing in this session touched what kills people inside ring 2 — hull hp, the heal channels, gun numbers (Eric's math, off limits to the sim). Every map arm leaves ring 2 killing ≥ 75 % of its entrants. Reaching 5 alive at 8:00 is not a map-dial outcome on this evidence. C2 / C3 / C4 remain unrun; C3 (C1 + rings) is the one that would answer whether the ring layout inverts on the big board.

## 6. The proportional storm — Eric's ruling and two arms (2026-10-07)

**Eric, 2026-10-07, on the ring sizes (ocean 11,200 → rings 5,491 / 2,692 / 1,320 diameter at 2×, against 5,600 / 3,459 / 2,137 / 1,320 today):** *"It should really be proportional. Its closing far too much at ring 2 and 3. The fixed 1320 no longer makes sense. Perhaps the map drops 50% of its remaining radius each ring? So 11200 -> 5600 -> 2800 -> 1400 -> 0? Try a run with that, and lets also try 12000 -> 6000 -> 3000 -> 1500 -> 0."* Cover 10 % for both (his pick, so the board is C1's).

**Instrument:** no code change. `zoneRingRadii` already steps geometrically from R to the terminal ring with `ringSteps [1/3, 2/3]`; setting the terminal ring to R/8 (`--set zone.terminalSightFactor = R / 8 / 330` → 2.121212 at 5600, 2.272727 at 6000) makes every close exactly a halving. Verified before launch: 11200 → 5600 → 2800 → 1400 → 0 and 12000 → 6000 → 3000 → 1500 → 0.

**A fact that should have been said before the run, not after:** at R = 5600 the shipped ladder was ALREADY a halving to within 4 % (5,491 / 2,692 / 1,320 vs 5,600 / 2,800 / 1,400). The "closing far too much at ring 2 and 3" reading was the shipped ladder at today's 2,800 radius (62 % of the radius kept per close, 1,320 terminal), which the ×2 board had already fixed by accident. So `h5600` is C1 with rings 2–6 % larger — a near-null test by construction, and it measured as one.

| arm | board | ring diameters | alive@4:00 | alive@8:00 | running @12:00 | median | storm deaths (share of bot deaths) | BS / ML / TB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 2800 / 2.5 % | 5600 / 3459 / 2137 / 1320 | 7.44 | 1.29 | 1 % | 8:04 | 1.8 % | 38 / 33 / 29 |
| C1 | 5600 / 10 % | 11200 / 5491 / 2692 / 1320 | 11.18 | 2.74 | 23 % | 9:51 | **15.4 %** | 36 / 37 / 28 |
| **h5600** | 5600 / 10 % | 11200 / 5600 / 2800 / 1400 | 11.52 (+0.34 vs C1, n.s.) | 2.84 (+0.10 vs C1, n.s.) | 25 % | 9:50 | 16.6 % | 47 / 30 / 23 (BS +8 vs baseline, n.s.) |
| h6000 | 6000 / 10 % | 12000 / 6000 / 3000 / 1500 | 11.85 (+0.67 vs C1, n.s.) | 2.92 (+0.18 vs C1, n.s.) | 24 % | 9:34 | 15.4 % | 47 / 34 / 18 (BS +9, TB −10 vs baseline; neither clears its CI) |

| **w5500** (Eric: *"11000 -> 7000 -> 4000 -> 2000 -> 0"*) | 5500 / 10 % | 11000 / 7000 / 4000 / 2000 | 11.26 (+0.08 vs C1, n.s.) | **3.77 ± 0.36 (+1.03 vs C1 [+0.55, +1.51]; +2.48 vs baseline)** | **47 %** (1.2 alive) | **11:20** | 12.9 % | 41 / 26 / 33 (all n.s.) |

Dials for w5500: `map.baseRadius 5500`, `zone.terminalSightFactor 3.0303030` (terminal 1,000 u), `zone.ringSteps.0 0.2651331`, `zone.ringSteps.1 0.5934020` — verified to reproduce the ladder exactly before launch. 1 of 91 seeds threw the map-gen error; 90 stand.

**Readings (w5500, landed 14:14).** The wider ladder is the first arm to move ring 2: 3.8 alive at 8:00 against C1's 2.7 (a +1.0 difference that clears its CI), 95 % of matches still running at 8:00, and **47 % of matches reach 12:00** (23 % on C1) with 1.2 alive there — ring 3 becomes a measurable cycle for the first time. Median match 11:20 (C1 9:51). Ring 1 unchanged (11.3). Storm share eases to 12.9 % because each close sweeps less water. Against Eric's 20 → 10 → 5 → 2-3: ring 1 met, ring 2 at 3.8 of 5, ring 3 at 1.2 of 2.5 — the gap is now one to two hulls per checkpoint instead of three. Class share 41 / 26 / 33, every delta inside its CI; the SPEEDBOAT drift seen on the two halving arms did not repeat here.

**Readings (h6000, landed 13:20).** Same story one size up: ring 1 a hair better (11.9 alive), ring 2 unchanged (2.9), storm share unchanged. 4 of 91 seeds threw the map-gen error at 6000 u / 10 % (87 matches stand) — the throw rate rises with the board. **The SPEEDBOAT drifts down on both halving arms** (23 % → 18 % share; −10 pp vs baseline, CI just touching zero) while the DREADNOUGHT drifts up (+9) — two arms pointing the same way is a flag for Eric, not a finding; a ±5 pp campaign on the chosen board would settle it.

**Readings (h5600).**
- Attrition identical to C1 within noise, as the geometry predicts. 1 of 91 seeds threw the map-gen error (vs 3 in C1); 90 matches stand.
- **The storm IS a killer on the 2× board**: 15–17 % of bot deaths against 1.8 % today, because the beat did not change and each close now sweeps twice the distance. That is the number to watch when the ladder or `zone.beatMs` moves; it does not by itself contradict Eric's "nobody fails to outrun it unless bad" — bots are not people.
- DREADNOUGHT share drifted up (+8 pp vs baseline, +11 vs C1, neither significant at n = 90). A larger terminal ring (1,400 vs 1,320) is a small thing; one arm is not evidence of a class effect.

## 7. Time and cause of every death (Eric's ask, 2026-10-07) — raw replays of w5500 and C1

Exact replays of the first 3 matches per shard (36 each, same seeds) with `--raw` per-bot rows; `~/hc-campaigns/tune-2026-10-06/raw/`. Storm schedule (zone.ts header): each ring group is CLEAR / SUPPLY / REVEAL / CLOSING minutes, so the live ring shrinks during 3:00–4:00, 7:00–8:00, 11:00–12:00 and the collapse 15:00–16:00. Bot deaths only (drones excluded); `lifeS` is seconds from activation.

| minute | w5500 ship / storm | C1 ship / storm | |
| --- | --- | --- | --- |
| 0–1 | 0 / 0 | 0 / 0 | |
| 1–2 | 37 / 0 | 36 / 0 | |
| 2–3 | 141 / 0 | 121 / 0 | |
| 3–4 | 141 / 1 | 138 / 5 | ring 0 → 1 closes |
| 4–5 | 99 / **11** | 99 / **46** | |
| 5–6 | 62 / **14** | 70 / **33** | |
| 6–7 | 51 / 1 | 30 / 4 | |
| 7–8 | 23 / 0 | 20 / 1 | ring 1 → 2 closes |
| 8–9 | 18 / **17** | 11 / **8** | |
| 9–10 | 16 / **15** | 7 / **8** | |
| 10–11 | 6 / 2 | 7 / 1 | |
| 11–12 | 4 / 0 | 7 / 2 | ring 2 → 3 closes |
| 12–13 | 7 / 5 | 5 / 3 | sudden death group |
| 13–14 | 1 / 4 | 2 / 1 | |
| 14–18 | 3 / 5 | 0 / 0 | collapse 15–16 |

| window | w5500 ship / storm (storm share) | C1 ship / storm (storm share) |
| --- | --- | --- |
| 0:00–4:00 | 319 / 1 (0.3 %) | 295 / 5 (1.7 %) |
| 4:00–8:00 | 235 / 26 (9.9 %) | 219 / 84 (27.7 %) |
| 8:00–12:00 | 44 / 34 (43.6 %) | 32 / 19 (36.5 %) |
| 12:00–16:00 | 11 / 9 (45 %) | 7 / 4 (36 %) |
| totals (36 / 35 matches) | 609 ship, 75 storm, 2 fleet, 34 alive at the end | 553 ship, 112 storm, 1 fleet, 34 alive |

**Reading.** Storm deaths are ring-related and they are NOT during the close — they land in the one to two minutes AFTER each close (4–6, 8–10, 12–14), which is how long 4 hp/s takes to sink a hull left outside the new ring. On C1's shipped-shape ladder the first close (11,200 → 5,491) is the killer: 79 of 112 storm deaths fall in 4:00–6:00, a quarter of all deaths in that window. The wide ladder (first close 11,000 → 7,000) cuts that first-close toll to 25 and moves the storm's weight to the second close (8:00–10:00: 32 of 75), where the field is already small. Storm deaths by class, w5500: DREADNOUGHT 44 · REPEATER 17 · SPEEDBOAT 14 (C1: 54 / 34 / 24) — the slow hull is the one that does not get out. Guns remain the killer everywhere before 8:00 (≥ 90 % of deaths in minutes 0–8 on w5500).

## 5. Standing limits carried forward

- ±10 pp tier only; class claims are "consistent with", never "in band".
- No gun readings this session (Eric 2026-10-02).
- Attrition CIs are bot-level (1,820 lives per arm) and ignore within-match clustering.
- Two bot bars fail on every arm (anyKill < 60 %, storm deaths < 5 %); Eric's 2026-09-30 ruling: measurements, not gates.
- Ring 3 is measurable only in the C1 arm (23 % of matches reach 12:00) and only barely.
- The map-gen throw is live at 5600 u / 10 % (3 / 91): Eric's deferred thread, now with numbers.

## 8. Closing ruling on the generator (Eric, 2026-10-07)

The arms above recorded map-generation failures as harness `failures` (3/91 on C1, 1/91 on w5500 and h5600, 4/91 on h6000). Eric, on the PR text calling that an accepted cost: *"There is no 'give up.' Generate maps until you have a valid fucking map."* Built in cycle 169: `generateMap` reseeds deterministically on an invalid draw and continues (epic-9 amendment 10). Future arms will show 0 failures; the attrition and class readings above stand (a failed match was simply not played, and 88–91 matches per arm is the sample stated in each table).

## 9. The shipped board after Eric's staging test (cycle 170, 0.18.35): 8,000 wide, rings 8000 → 5000 → 3000 → 2000 → 0, storm ramp 1 / 2 / 3 / 4 / 5 hp/s

Run AFTER PR #260 merged, on the merged code, shipped CONFIG with no overrides (`e8000ramp`, seed 20261900, 91 matches, even roster, `--raw`). Eric's order of operations: ramp → ladder → PR → merge → this run.

| arm | board / storm | alive@4:00 (target 10) | alive@8:00 (target 5) | alive@12:00 (target 2.5) | matches reaching 12:00 | median match | storm deaths (share) | BS / ML / TB |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| baseline 0.18.33 | 2800 / 2.5 % / flat 4 | 7.44 | 1.29 | 0.0 | 1 % | 8:04 | 1.8 % | 38 / 33 / 29 |
| C1 | 5600 / 10 % / flat 4 | 11.18 | 2.74 | 0.5 | 23 % | 9:51 | 15.4 % | 36 / 37 / 28 |
| w5500 (0.18.34) | 5500 / 10 % / flat 4, 11000 → 7000 → 4000 → 2000 | 11.26 | 3.77 | 1.2 | 47 % | 11:20 | 12.9 % | 41 / 26 / 33 |
| **e8000ramp (0.18.35)** | **4000 / 10 % / ramp 1-2-3-4-5, 8000 → 5000 → 3000 → 2000** | **9.89 ± 0.46** (+2.45 vs baseline) | **3.33 ± 0.34** (+2.04 vs baseline) | **0.8** | **33 %** | **11:14** | **7.0 %** | 40 / 41 / 20 |

**Readings.**
- Ring 1 lands just under the target (9.9 against 10, inside its CI); ring 2 at 3.3 against 5 (w5500 had 3.8 on the bigger board); a third of matches reach 12:00 with ~1 hull alive. Median match 11:14 — the smaller ocean cost ~nothing in match length because the ramp keeps the storm gentle early.
- **The ramp moved the storm's kills late**, which is the point of it: storm deaths are 0.3 % of ring-1 deaths and 4 % of ring-2 deaths (C1 on the flat 4 hp/s: 28 % in 4:00–8:00), then 41 % of deaths in 8:00–12:00 and the collapse. Overall storm share 7.0 % of bot deaths (flat-4 boards: 13–17 %). The storm still takes the DREADNOUGHT most (78 of 121).
- Class share 40 / 41 / 20: the SPEEDBOAT reads low (−9 pp vs baseline, CI touching zero) for the second time on a 10 % board; the REPEATER up. Two readings pointing one way on this board; a ±5 pp run would settle it if Eric wants.
- **Bots beach far more on this board**: afloat bot-ticks in land contact **7.3 %** (bar < 1 %; 0.6 % on the 2.5 % ocean). The 10 % archipelago at 4,000 u has narrow channels and the bot helm grounds in them. That is a bot-quality finding (the land-contact bar fails for the first time) and it depresses every bot reading a little: a hull aground is not fighting. Not fixed here; Eric's call whether a bot-helm pass belongs in Story 9.x.

Death timeline (bot deaths by minute, gun / storm): 1–2 min 245 / 0 · 2–3 352 / 0 · 3–4 314 / 3 · 4–5 260 / 6 · 5–6 142 / 0 · 6–7 87 / 3 · 7–8 74 / 16 · 8–9 52 / 21 · 9–10 26 / 13 · 10–11 12 / 20 · 11–12 15 / 21 · 12–13 16 / 4 · 13–14 2 / 7 · 14–15 3 / 2 · 16–17 0 / 5. Totals: 1605 gun, 121 storm, 4 fleet, 90 alive at the end.
