# Batch-sim evidence — 2026-09-30 (Story 8.20, cycle 155, 0.18.20)

**One run, as Eric approved (amendment 171):** `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 99 --seed 20260930` on the merged tree (this branch + `development` after Story 8.19 landed), commit `6954cfd` code-identical. 99 matches completed, 0 failed, 52 min wall clock (~32 s per match). The report body is deterministic per run key; the JSON is at the job's scratch dir and was not committed.

## What this run is, and is not

- **Balance cycle 1's class numbers (2026-08-20) are VOID.** They were measured with hull-locked personalities, per-hull wish lists and the deck-era catalog. Nothing below is comparable to them; this run is the FIRST pool-era baseline.
- **The blind-vacuum control (`--bot-profile random*`, `spend: 'random'`) was NOT re-run** this cycle — Eric approved one run only (amendment 171). Every number below carries the personalities' taste; do not read a line's fit rate as the card's strength.
- **Killing-blow bias (`encounterSpan.ts`, deferred-work "encounterSpan.ts systematically excludes the killing blow"):** the encounter-span script was not part of this run, but the ledger entry stands open — any per-sink damage windows quoted from that script exclude the fatal hit.
- **Readout caveats (review gate, amendment 173):** the HULL REPAIR take rate's denominator counts every hand that CONTAINED the card, including hands where it was untakeable (at cap 5 or belt full), so late-match rates under-read willingness; a level earned within one deliberation (≤ 250 ms) of death reads as "wasted"; the weaponless-at-level sample is taken on the tick a level arrives, BEFORE that level's pick, so L1 always reads 100 % "≥ 1 empty".

## Headline numbers

| Readout | Value |
|---|---|
| Winner hull | Battleship 35 · Mine Layer 35 · Torpedo Boat 29 (of 99) |
| Match length | mean 574 s, p50 545 s, max 831 s; 15 % resolved past the endgame ring; every match `fieldCleared` |
| Gun mix (random deal) | cannon 644 bots, win rate 6.7 %, mean placement 10.30 · flak 629, 5.6 %, 10.48 · **machine gun 707, 3.0 %, 10.70** |
| Weaponless at level | all three Q/E/R empty: L1 22.8 % → L2 8.4 % → L3 3.9 % → L5 0.5 %; any slot empty: L3 76 % → L5 34 % → L8 6.6 % → L11 0.8 % |
| Pure gunboat at death/finish | 38 of 1,980 bot-matches (1.9 %) |
| HULL REPAIR | offered in 2,685 of 12,966 hands, taken 1,824 (67.9 % of offers) |
| Levels wasted | 11 of 12,966 (0.1 %) |
| Weapon-line spread per lobby | 8.00 distinct weapon lines taken per match (of 9 dealable); top line's share of first-copy takes 17.5 % |
| Peak live mines | mean 155 per match, max 259 (27,171 mines laid over 99 matches) |
| Storm deaths | 100 of 1,885 bot deaths (5.3 %) |

## By personality (1,980 bot-matches; personalities now dealt to any hull)

| Personality | n | kills / bot-match | PvE kills | ≥ 1 kill | alive at end | life s | levels | dmg |
|---|---|---|---|---|---|---|---|---|
| bulwark | 279 | 0.67 | 2.63 | 38.0 % | 2.5 % | 237 | 5.06 | 527 |
| duelist | 346 | 0.90 | 2.92 | 48.6 % | 2.3 % | 242 | 5.46 | 598 |
| forager | 363 | 1.15 | 4.80 | 60.1 % | 11.3 % | 355 | 8.34 | 776 |
| raider | 318 | 0.88 | 3.93 | 49.7 % | 3.5 % | 309 | 6.93 | 650 |
| siege | 316 | 1.04 | 3.84 | 53.5 % | 5.1 % | 302 | 6.93 | 694 |
| trapper | 358 | 0.67 | 3.37 | 43.0 % | 3.4 % | 295 | 6.27 | 573 |

By hull: Battleship 0.90 kills / 306 s life, Mine Layer 0.94 / 292 s, Torpedo Boat 0.83 / 279 s — the hulls are close; the personalities are not.

## What the tastes did (fits by spender, from the CATALOG LINES block)

- **Belts are stocked now.** Consumable fits across the lobby: HULL REPAIR 1,888, CHAFF 603, SMOKE SCREEN 557, DECOY BUOY 533, SHIELD BLOCK 377, FLASH SHELLS 190, SUPERCAV TORPEDO 145. Under the old wish lists every consumable scored below every upgrade (reading from the deleted tables, not measured), so this is the intended change.
- **The tastes are visible in the fits.** `trapper` (belt hunger high; SMOKE, DECOY, CHAFF favorites): chaff 384, smoke 364, decoy 290. `bulwark` (ARMOR; HULL REPAIR + SHIELD favorites): shield 294, armor 129 — the most armor of any personality. `duelist` (its gun, TURNING, RELOAD): turning 169, reload 193, gun ladders 111+63+74 machine-gun/flak rungs. `siege` (RADAR SWEEP, its weapons): radarSweep 204, star shells 317, phosphor 270. `raider` (SPEED, torpedoes): speed 176, light torpedo 323, heavy torpedo 279. `forager` (its gun, RELOAD): reload 418, cannon ladders 128/115/87, flak 159, MG 115.
- **Weapon favorites steer, not lock:** every personality took every weapon line at least 59 times; the lobby-wide spread is 8 of 9 lines per match.

## Flags for Eric (measurements, no ruling implied)

1. **Machine gun bots win half as often as cannon bots** (3.0 % vs 6.7 % win rate, worst mean placement) with an even deal. The pick is random and final (amendment 163); this is the first measurement of the three guns under bots and may be the gun, the bots' machine-gun tactic (hold the trigger inside reach), or both.
2. **`bulwark` is now the weakest personality** (fewest kills, shortest life, 2.5 % alive) despite ARMOR-first and the most SHIELD BLOCK takes; `trapper` is second-weakest (the pre-8.20 ledger already named it the weak profile). `forager` is the strongest on every column (longest life, most levels, most kills — it farms 4.8 PvE hulls per bot-match).
3. **The Story 6-4 quality bar "bots scoring ≥ 1 participant kill" reads 49.1 % against its ≥ 60 % bar (FAIL); the other five 6-4 bars pass.** That bar predates the pool, the tastes and the hull unlock; no pre-8.20 pool-era measurement of it exists to say whether this run moved it (the last recorded runs are cycle 128–131, deck era). Eric's call whether the bar still measures what he wants.
4. Mines: 27k laid, peak 155 live per match (max 259). `mineCount` is the same getter `/metrics` reads; the smoke peak was not sampled by the harness.

## Ledger status restated

Open, unchanged by this story: the Battleship −26 % balance direction (deferred-work "THE BATTLESHIP LOST ~26 %"), `trapper` weak (re-measured above: still second-weakest), `encounterSpan.ts` killing-blow bias, the light-torpedo lead guard, RL hull-repair dead levels, RL feature-vector invalidation. Resolved by this story: see the Story 8.20 section of `deferred-work.md` (eleven entries).
