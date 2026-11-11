# Bot posture under the four hulls — Story 10.12 before / after ledger (2026-11-11)

**What was run (Eric, epic-10 amendment 21 R7, and one re-run he approved the same day):** three arms of **48 matches** each (12 shards × 4, 16 bots, even roster — 4 of each hull a match — `--raw`, base seed **20261111**, so every arm plays the same maps and seeds). `base1012` on the untouched tree (7ebf5aa3); `after1012` on the pre-review tree (9ecf8cd9 — interim, kept because it shows what the review-gate fixes changed); `final1012` on the shipped tree. Shards: `~/hc-campaigns/bots-10-12/<label>-shard00..11.json`. Command: `run_campaign.py --matches 48 --shards 12 --bots 16 --base-seed 20261111 --label <arm> --extra --raw --roster even` (about 9 minutes an arm). No weapon, hull or storm number moved between arms; the sim measured bot behavior only.

**Validity.** 48 matches is trend size: per-hull win share rests on 192 bot-lives a hull (roughly ±4 pp), so **placement and win share by hull are not a balance verdict**. Per-bot rates rest on 768 bot-lives an arm. Readings are paired on identical seeds; no interval was computed on the deltas. The personality roster changed between arms (six personalities before, five after — `forager` retired), so the arms differ in more than helm code. The four readouts marked *new* did not exist on the baseline tree and have no before column. The numbers below were aggregated from the shard JSON by a throwaway script; `analyze_campaign.py` still assumes three classes (ledger, `deferred-work.md` 2026-11-11).

## The 9.13 yardstick

| Measure | base1012 | after1012 (interim) | **final1012** |
|---|---|---|---|
| Land contact (sim `landContact` ticks / afloat ticks) | 24,382 / 4,458,731 = **0.55 %** | 0.35 % | 6,940 / 4,308,476 = **0.16 %** |
| Stuck episodes (≥ `CONFIG.bots.stuckMs`) | 355 | 225 | **108** |
| Ticks outside the live ring | 0.29 % | 0.21 % | **0.21 %** |
| Storm share of deaths | 9 / 723 = 1.2 % | 8 / 723 = 1.1 % | 5 / 728 = **0.7 %** |
| Ram deaths (`sunkByContact`) | 40 (5.5 %) | 23 (3.2 %) | **23 (3.2 %)** |
| Ran aground | 11 | 3 | 5 |
| Sunk by a ship | 663 | 689 | 695 |
| Median match | 598.0 s | 603.5 s | 612.2 s |
| Alive at 4:00 / 8:00 (matches reaching) | 8.48 (48) / 3.00 (38) | 7.98 (48) / 3.02 (42) | 7.62 (48) / 2.88 (41) |
| Ended by | fieldCleared 48 | fieldCleared 48 | fieldCleared 48 |

No yardstick measure got worse. Land contact and stuck episodes fell by about two thirds; the likely causes are the arc opening (a closing hull no longer drives nose-on at a target standing off a coast) and the solid-beacon avoidance, but the sim does not separate them. Storm share stays far under the old 5–20 % bar's floor — the 9.13 ledger already recorded that as a design question for Eric, not a bot defect.

## Kills by source

| Source | base1012 | after1012 | final1012 |
|---|---|---|---|
| Main battery and secondaries (`burst` + `shell`) | 374 | 396 | 410 |
| Torpedo | 242 | 260 | 261 |
| Mine | 41 | 21 | **10** |
| Ram (`contact` + `grind`) | 28 | 19 | 17 |
| Burn | 6 | 12 | 14 |

Mine kills fall from 41 to 10 as the bots sweep. The interim arm's 21 was measured with the self-detonation defect still in the tree (a bot shooting a mine inside its own blast, caught at the review gate); the final arm has the stand-off fix. The sim does not say how many of the 21 that defect caused.

## Placement and win share by hull (192 bot-lives a hull; trend only)

| Hull | base place / win | after place / win | final place / win | final guns bearing *(new)* |
|---|---|---|---|---|
| Yamato | 7.69 / 6.8 % | 7.36 / 9.4 % | 7.80 / 6.8 % | 89.8 % |
| Bismarck | 8.13 / 7.8 % | 8.29 / 8.3 % | 8.59 / 5.7 % | 87.2 % |
| Warspite | 8.19 / 7.3 % | 8.81 / 3.1 % | 8.18 / 8.3 % | 88.1 % |
| Iowa | 9.99 / 3.1 % | 9.55 / 4.2 % | 9.43 / 4.2 % | 89.9 % |

Iowa places last in all three arms; that is a hull reading for Eric, not this story's. The Warspite and Bismarck swings between the interim and final arms are the size of the noise.

## The new readouts (final1012; no baseline exists)

- **Guns bearing** on the nearest hull inside main-battery reach: **88.7 %** of gun-ticks (measured on the hull's center, without a line-of-fire term; the guns aim at a lead point, so this slightly overstates what the click sees).
- **Mines swept by bot secondaries: 2,432** (about 51 a match). A trend readout — it over-credits a mine that trips on the tick a round lands, and misses a round created and spent inside one tick.
- **Hull at a HULL REPAIR press:** early personalities 58.2 % mean over 1,312 presses; late 37.4 % over 606. (An early bot presses at 80 % only when the ability is ready; on cooldown it presses lower, which is why the mean sits under 80 %.)
- **Shift dealt by personality** (R5: the fitting one half the time): raider boost 49 %, duelist boost 48 %, siege INSTANT RELOAD 56 %, bulwark HUNKER 56 %, trapper HUNKER 48 %; every other cell 19–30 %.
- **Beacon XP** per bot: 0.60 levels (base) → 0.72 (final). **Posture shares** barely moved (engage 29.0 → 29.1 %, farm 20.3 → 22.1 %, disengage 19.4 → 19.0 %).
