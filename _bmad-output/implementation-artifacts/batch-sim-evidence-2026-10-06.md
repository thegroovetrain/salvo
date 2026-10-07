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

## 3. Combination arms — Eric's call (singles read 20:40)

Candidates, in the order the singles suggest (none run yet; 91 matches each):
- **C1 r200 + cov10** — the two significant movers together. If they add, alive@4:00 ≈ 9, alive@8:00 ≈ 3; if they overlap (a bigger map already has more islands), less.
- **C2 r150 + cov10** — the cheaper map with the strong cover arm.
- **C3 r200 + cov10 + rings** — whether the two-ring spawn stops hurting once the inner ring is outside radar reach.
- **C4 r200 + rings** — the ring question on its own at the larger size.
