# Batch-sim evidence 2026-11-25: torpedo tubes by kind

Eric asked for this in chat on 2026-11-25: "Light Torpedoes 100 damage each, 3 tubes per launcher, max of two launchers. Heavy 150 each, 2 tubes per launcher … Supercavitating Torpedoes 300 each, 1 tube per launcher … no more extra tube card, while the aft launcher upgrade card stays". He also said: "use the final results from the last time … to save time". So the baseline is not re-run. It is the 2026-11-24 `new-baseline` (198 matches, seed 7, branch `worktree-torp-phosphor-cut`: torpedoes 200 / 150 / 200 at one tube each, phosphor 30 + 12/s), from `batch-sim-evidence-2026-11-24.md` §3.

**Experiment arm:** branch `worktree-balance-sim-torpedo-tubes` (commit 9df97c64, experiment-only, not for merge). Each torpedo kind sets its own tubes per launcher. The SECOND LAUNCHER TUBE card is stubbed out of the deal. AFT TORPEDO LAUNCHER is unchanged. Phosphor is pinned back to 30 / 12 (`--tune phosphorShells.damage=30 --tune phosphorShells.dps=12`) so that the torpedo change is the only difference from the baseline. The run used 99 matches (the quick-run cap), seed 7, `--bots 16 --shards 12 --extra --roster even --raw`. The roster was exactly even. All four bot quality bars passed in 12/12 shards. Probe-checked pools: light 3 (6 with aft), heavy 2 (4), supercav 1 (2).

| arm | n | Yamato | Bismarck | Warspite | Iowa | median s | alive 4:00 / 8:00 | torpedo share of kills |
|---|---|---|---|---|---|---|---|---|
| 2026-11-24 baseline | 198 | 31.1 (25–38) | 28.6 (23–35) | 24.5 (19–31) | 15.8 (11–22) | 676 | 10.8 / 4.0 | 19.5 % |
| tubes by kind | 99 | 26.5 (19–36) | 27.6 (20–37) | 23.5 (16–33) | 22.4 (15–32) | 658 | 10.4 / 3.8 | 24.1 % |

Differences from the baseline (pp, 95 % CI): Yamato −4.6 [−15, +6], Bismarck −1.0 [−12, +10], Warspite −1.0 [−11, +9], Iowa +6.6 [−3, +16]. **None is significant.** Per the 2026-11-24 lesson, a 99-match arm cannot judge a hull shift this size.

Torpedo kinds, per-bot win % (a fair rate is 6.3 %):

| arm | heavy | light | supercav |
|---|---|---|---|
| baseline | 6.7 [5.2, 8.5] | 6.0 [4.7, 7.7] | 7.4 [5.9, 9.2] |
| tubes by kind | 7.6 [5.6, 10.4] | 6.5 [4.7, 9.1] | 6.0 [4.2, 8.5] |

Damage per bot changed by less than 80 hp for every kind (heavy 2224 → 2185, light 2148 → 2148, supercav 2225 → 2145).

**Reading.** Torpedoes take more of the kills (19.5 → 24.1 %, at the main battery's expense: burst 60.0 → 54.5 %). Pace is slightly faster (median match 676 → 658 s). All three kinds stay inside the fair band, with overlapping CIs. Iowa's point estimate rises toward fair share, but that is not significant. Matches end before 12:00, so 12:00 attrition is unmeasurable, not unmet. Pacing at 4:00 and 8:00 is essentially unchanged.

**Ruling:** none yet.

## Fresh-seed confirm (Eric: "lets rule out luck"; he approved 2 × 198 in chat)

Two arms on the SAME fresh seeds (base seed 1000), 198 matches each. Both arms pin phosphor at 30 + 12/s. Baseline = `development` bca61b29, whose sim code is identical to the experiment's base 5383375e. Experiment = 9df97c64. The roster was exactly even. Three bars passed in 12/12 shards on both arms. "afloat bot-ticks in land contact" failed marginally (1.0–1.5 % against < 1 %) in 2/12 baseline shards and 3/12 experiment shards. That is the same marginal failure seen on 2026-11-23, and it hits both arms alike.

| arm | n | Yamato | Bismarck | Warspite | Iowa | median s | alive 4:00 / 8:00 | torpedo share of kills |
|---|---|---|---|---|---|---|---|---|
| baseline, seed 1000 | 198 | 22.3 (17–29) | 26.4 (21–33) | 33.5 (27–40) | 17.8 (13–24) | 665 | 11.1 / 4.0 | 18.5 % |
| tubes by kind, seed 1000 | 198 | 30.8 (25–38) | 25.3 (20–32) | 24.7 (19–31) | 19.2 (14–25) | 670 | 10.6 / 3.9 | 23.5 % |

Same-seed differences (pp, 95 % CI): Yamato +8.5 [−0.2, +17.1], Bismarck −1.1 [−9.8, +7.5], Warspite −8.8 [−17.7, +0.2], Iowa +1.4 [−6.2, +9.1]. **None is significant.**

**Pooled over both seeds** (baseline 393 resolved matches vs experiment 296): Yamato 26.7 → 29.4 (+2.7 ± 6.8), Bismarck 27.5 → 26.0 (−1.5 ± 6.7), Warspite 29.0 → 24.3 (−4.7 ± 6.6), **Iowa 16.8 → 20.3 (+3.5 ± 5.9)**.

Torpedo kinds on seed 1000 (per-bot win %, baseline → experiment): heavy 7.3 → 7.5, light 5.9 → 6.0, supercav 7.0 → 7.0. All three stayed fair.

**Verdict:** the first run's Iowa +6.6 pp **did not replicate** (+1.4 on fresh seeds; +3.5 pooled, inside the noise). Tubes by kind does not measurably move hull balance or torpedo-kind balance. Its one consistent effect is that torpedoes take about +5 pp of kills from the main battery (19.5 → 24.1 % and 18.5 → 23.5 %). Pace is unchanged. The baseline itself swung between seeds (Warspite 24.5 vs 33.5, Yamato 31.1 vs 22.3), which is a reminder that a ±7 pp hull reading is noise at these sample sizes.

**Ruling:** none yet.
