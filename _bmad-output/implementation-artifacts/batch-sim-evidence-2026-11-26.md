# Batch-sim evidence 2026-11-26 — PR #392 settings as shipped

Eric 2026-11-26: *"Run a balance Sim on these settings and get me some numbers. 200 games."*

**Arm `pr392`:** branch `torpedo-tubes-by-kind` at d220cbf3 (PR #392, 0.20.14, PV 116), untuned. Settings:
- torpedoes 100 / 150 / 300 with 3 / 2 / 1 tubes per launcher, and no SECOND TUBE card;
- a 3 s drop wait per mine rack;
- captive trip ring 250;
- **phosphor 20 burst + 10/s as shipped.** This is the first campaign ever on this value; every earlier arm pinned 30 / 12.

**Run:** 200 matches, base seed 2000 (fresh), `--bots 16 --shards 12 --extra --roster even --raw`.

**Validity:**
- The roster was exactly even, and 198 of 200 matches resolved.
- Three bot quality bars passed in 12/12 shards. "Afloat bot-ticks in land contact" failed marginally (1.0–1.2 % against < 1 %) in 2/12 shards, the same marginal failure seen since 2026-11-23.
- Median match 667 s, before the 12:00 ring, so 12:00 attrition is unmeasurable, not unmet.
- Tier supported: ±10 pp.

## Hull win share (Wilson 95 %)

| Yamato | Bismarck | Warspite | Iowa |
|---|---|---|---|
| 29.8 (24–37) | 24.2 (19–31) | 22.7 (17–29) | 23.2 (18–30) |

- All four hulls are consistent with the 23–27 % band (`all_consistent` true). That means consistent with the band, not in it.
- Yamato reads highest again. Its readings in the last four campaigns: 31.1, 22.3, 30.8, 29.8.
- Iowa reads 23.2. Its earlier readings: 15.8 (seed 7) and 17.8 (seed 1000) under the old torpedo setup, and 19.2 with the experiment arm on seed 1000. This arm also differs in phosphor, the drop wait and the captive ring, so this is no attribution.
- Mean life: Yamato 384 s, Bismarck 381 s, Warspite 355 s, Iowa 342 s.

## Pacing

| Checkpoint | 4:00 | 8:00 | 12:00 |
|---|---|---|---|
| Alive (of 16) | 10.8 | 4.0 | 0.6 |
| Target | 8 | 4 | 2 |

- 4:00 is slow by about 2.8 ships; 8:00 is on target.
- 12:00 is unmeasurable: only 28 % of matches reach it.

## Kills by source

| Burst | Torpedo | Shell | Mine | Burn | Contact |
|---|---|---|---|---|---|
| 55.1 % | 23.9 % | 9.6 % | 5.7 % | 3.0 % | 2.8 % |

## Loadout (per-bot win %, fair = 6.3 %)

| Family | Readings |
|---|---|
| Torpedo | heavy 7.8 [6.3, 9.7], light 5.9 [4.6, 7.6], supercav 6.3 [5.0, 8.0] |
| Mine | captive 7.3 [5.8, 9.1], fouling 6.4, naval 6.3 |
| Special shell | **phosphor 10.7 [8.6, 13.1]**, flash 6.4, fouling 4.9, **star 4.1 [2.9, 5.8]** |
| Shift | hunker 7.6 [6.2, 9.3], boost 5.9, instant reload 4.9 [3.7, 6.5] |

**Phosphor at 20 / 10 still reads 10.7 %.** At 30 / 12 it read 10.7 % (seed 7) and 10.1 % (seed 1000 experiment arm). Damage per phosphor bot is 2529, against 2605–2676 at 30 / 12. The 20 / 10 cut did not measurably lower its win rate. The comparison is across campaigns with other differences (torpedo setup, mine wait), so it is a strong hint, not a controlled measurement.

## Proposals

None measured; all are unmeasured candidates for Eric's ruling.

**Ruling:** none yet.

**After this campaign (Eric 2026-11-26):** *"Take out the 3s wait on mines. I changed my mind."* The drop wait was removed from PR #392 before landing, so this arm measured a mine rule that does not ship. Its mine readings (mine kills 5.7 %; captive / fouling / naval 7.3 / 6.4 / 6.3 %) include the wait.

## Phosphor all burn, no burst (Eric 2026-11-26: "run a 100 match sim on removing all of the initial burst damage from the phosphor shells and having it be all DOT")

**Arm `phos-dot`:** `--tune phosphorShells.damage=0` (burst 20 → 0), with the burn unchanged at 10/s. That is a reading: the burst is removed and its 20 hp is not moved into the burn.
- Branch `torpedo-tubes-by-kind` at b5f301ec, **after the drop wait was withdrawn**.
- 100 matches, base seed 2000 (the shard seeds overlap the first matches of `pr392`), even roster.
- 100/100 resolved; all four quality bars passed in 12/12 shards.

**Confound:** the comparison arm `pr392` (above) still had the mine drop wait. The two arms therefore differ in two things, phosphor burst and the mine wait.

| arm | n | Yamato | Bismarck | Warspite | Iowa | median s | alive 4:00 / 8:00 |
|---|---|---|---|---|---|---|---|
| pr392 (burst 20, wait on) | 198 | 29.8 (24–37) | 24.2 (19–31) | 22.7 (17–29) | 23.2 (18–30) | 667 | 10.8 / 4.0 |
| phos-dot (burst 0, no wait) | 100 | **39.0 (30–49)** | 28.0 (20–37) | 22.0 (15–31) | **11.0 (6–19)** | 669 | 10.9 / 4.1 |

Differences, phos-dot − pr392 (pp, 95 % CI): Yamato +9.2 [−2.3, +20.7], Bismarck +3.8 [−6.9, +14.4], Warspite −0.7 [−10.7, +9.3], **Iowa −12.2 [−20.7, −3.7], significant**.

The Iowa drop cannot be attributed to phosphor: the mine wait also left between the arms, and Iowa read 15.8 and 17.8 in two earlier no-wait baselines.

**Special shells** (per-bot win %, fair 6.3 %):

| arm | phosphor | flash | fouling | star |
|---|---|---|---|---|
| pr392 | 10.7 [8.6, 13.1] | 6.4 | 4.9 | 4.1 |
| phos-dot | **7.6 [5.2, 10.8]** | 7.1 | 6.6 | 5.0 |

- Phosphor kills per bot fell from 1.25 to 1.08, and damage per bot from 2529 to 2323.
- Burn kills: 3.0 % → 2.6 %.
- Kills by source are otherwise unchanged: burst 55.0, torpedo 24.2, shell 9.7, mine 6.4 %.

**Reading:** with no burst, phosphor's interval covers the fair rate for the first time in any campaign, and the four special shells sit within about 2.6 pp of one another. The hull readings moved too: Yamato up and Iowa down, with Iowa's drop significant. That hull shift is confounded and needs a clean baseline before anyone believes it.

**Ruling:** none yet.
