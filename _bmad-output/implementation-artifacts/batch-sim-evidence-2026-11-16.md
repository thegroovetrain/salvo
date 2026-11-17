# Batch-sim evidence 2026-11-16 — Story 11.9 bot posture (the 20 % hit bar)

Eric-approved (AskUserQuestion 2026-11-16: "Yes, 50 matches each"). Both arms: `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 16 --matches 50 --seed 7 --roster even`. Baseline = `development` at b523abec (a `git archive` copy); branch = Story 11.9 at 8d783c6c (with the review fixes: hold at 90 % of bar range, kite at the bar, old boost trigger). Measured, never judged.

## The 9.13 yardstick

| measure | baseline | 11.9 |
|---|---|---|
| match length, mean s | 769.4 | 707.6 |
| deaths (participant / ram / aground / storm) | 679 / 21 / 9 / 43 | 705 / 20 / 7 / 21 |
| storm deaths, total (per match mean) | 60 (1.2) | 34 (0.7) |
| grounded (sim land contact), share of afloat ticks | 0.7 % | 0.7 % |
| stuck episodes | 777 | 714 |
| outside the live ring, share of ticks | 1.0 % | 0.6 % |

## Placement and win share by hull (200 bot-matches each)

| hull | place (base → 11.9) | win % (base → 11.9) | main-battery shots / bot |
|---|---|---|---|
| Bismarck | 8.2 → 7.5 | 7.5 → 7.5 | 158.4 → 152.6 |
| Iowa | 9.5 → 8.8 | 3.5 → 6.0 | 104.5 → 99.4 |
| Warspite | 8.9 → 9.6 | 4.5 → 3.0 | 141.6 → 118.0 |
| Yamato | 7.4 → 8.2 | 9.5 → 8.5 | 100.3 → 85.1 |

## Main-battery hit share by range band (of each hull's reach; shells, hit share)

| band | baseline | 11.9 |
|---|---|---|
| 0–25 % | 136,347 · 32.5 % | 137,645 · 33.0 % |
| 25–50 % | 47,513 · 11.2 % | 28,089 · 12.4 % |
| 50–75 % | 3,915 · 3.2 % | 0 |
| 75–100 %+ | 343 · 0.6 % | 0 |

Main-battery clicks per bot per match (11.9 only — the readout is new): mean 86.9, p50 81, p95 174.

Shots at ghosts: not measurable — there are no ghosts (11.4 not built).

## Readings

- No bot fires past half its reach any more; the long-range shells (4,258 of 188,118, about 2 %) are gone and the 25–50 % band shrank by 41 %. Total main-battery shells fell about 12 %; the hit share in every remaining band rose slightly.
- Matches are about 1 minute shorter and storm deaths fell by about 43 % (fewer bots linger outside the ring: 1.0 → 0.6 % of ticks).
- Warspite lost ground (win 4.5 → 3.0 %, place 8.9 → 9.6): its long reach (1.25 ×) no longer buys shots, and it is the smallest hull, so its bar range is the shortest. Iowa gained (3.5 → 6.0 %). 50 matches per arm; win shares at this size are noisy.

## Tick cost (`HC_DEV_OPTIONS=1 node server/scripts/tickCost.mjs`, seed 7, 16 hulls, same loaded machine, back to back)

| | mean ms | p95 | p99 | max | live shells (mean) |
|---|---|---|---|---|---|
| baseline | 5.42 | 9.54 | 13.78 | 30.23 | 69.1 |
| 11.9 | 4.87 | 8.61 | 12.51 | 17.16 | 56.4 |


## Acoustic homing (2026-11-16, Eric's experiment; epic-11 amendment 20)

**Arms** (91 matches each, 16 bots, even roster, `--bot-spend random`, seed 500; branch `worktree-acoustic-homing`; shards `~/hc-campaigns/acoustic-2026-11-16/`; `category.py` / `torp_eff.py` / `lines.py` as in `batch-sim-evidence-2026-11-15.md`):

| Arm | Code | Torpedo kills / holder (light / heavy / supercav) | light vs supercav, 4:00 / 8:00 | heavy vs supercav, 4:00 / 8:00 | Iowa win % | alive 4 / 8 / 12 min |
|---|---|---|---|---|---|---|
| `shipped` | development before 11.9 | 0.09 / 0.16 / 0.53 | **−6.5 / −3.5** | **−8.7 / −4.1** | 19.8 | 13.5 / 7.2 / 2.1 |
| `acoustic` | + acoustic homing, before 11.9 | 0.19 / 0.51 / 0.43 | **−8.4 / −3.3** | −1.4 / −2.2 | 14.3 | 13.4 / 7.0 / 2.0 |
| `acousticB` | + acoustic, with 11.9 bots | 0.22 / 0.56 / 0.43 | **−7.3 / −3.3** | −1.9 / −1.0 | 18.7 | 12.8 / 5.6 / 1.2 |
| `acoustic2` | `acousticB` + heavy reload 40 s, light damage 250, Iowa ARMOR 100 | 0.31 / 0.40 / 0.39 | −1.4 / **−4.0** | −0.5 / **−4.1** | 30.8 [22.2, 40.9] | 12.9 / 6.1 / 1.4 |

Bold = the 95 % CI excludes 0. Readings: acoustic homing alone lifts the heavy torpedo level with the supercav; the light stays behind until its damage rises; with the three dials the three torpedoes are level at 4:00 and even in kills, the supercav keeps a ~4-point lead at 8:00 (one arm). Iowa is the loudest hull at full throttle (ENGINES 120) and fell under acoustic homing; ARMOR 100 lifted it to 30.8 % — Eric ruled **95** (not measured). The 11.9 bots shorten the late game (≈ 40 % of matches over before 12:00) — a pacing reading for the next balance pass, not caused by this change. Land-contact bar fails 1.2–2.1 % in every random-spend arm, as before.

**Rulings 2026-11-16:** acoustic homing standard (light / heavy at the old Tier V 0.5, captive at its old Tier V 0.3), heavy reload 40 s, light damage 250, Iowa ARMOR 95 — built as amendment 20.
