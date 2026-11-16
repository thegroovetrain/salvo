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
