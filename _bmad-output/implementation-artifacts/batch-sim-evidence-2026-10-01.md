# Batch-sim evidence — 2026-10-01 / 02 (balance-sim run, pool era)

Instrument run by the `/balance-sim` skill on `development` @ `433fd485` (0.18.28, cycle 163, PV 69) from the worktree branch `worktree-balance-sim-gun-tiers`. Eric's three targets for this run, in his words: (1) ~50 % of ships sunk every ring; (2) machine gun strongest at Tier I, cannon strongest at Tier V, flak average-ish at all tiers; (3) roughly equal win rate between all hull classes and their Shifts. **Eric rules on every number below; nothing here has been applied to `CONFIG`.** Rulings are stamped as they land.

The previous ledger (2026-09-30, measured at 0.18.20) is superseded on every lethality dial: the machine-gun retune, the cannon and flak ladders, flak reload 6 → 4 s, the star/phosphor swap, mine hp, supercav 85, regen 15 s and drone drops all landed after it.

## 0. Instrument changes made for this run (harness only, no gameplay change)

- `server/scripts/batchsim/botMetrics.ts`: every bot sample now carries `gun`, `gunTier` (1–5, the tier at death or finish) and `killsByTier` (the killer's tier at the moment of each kill). `--raw` rows carry them.
- `server/scripts/batchsim/botReport.ts`: `byGun[]` and `byGunTier[]` groups (a win = placement 1 on a resolved match; draws are not wins) and a gun × tier table in the text report.
- `server/scripts/batchsim/main.ts`: each JSON variant records `botGun` / `botHull` / `botSpend`, so a report is self-describing.
- `--bot-spend gun` (harness-only, wired exactly like `random`): the bot takes its mounted gun's ladder card whenever it is dealt, otherwise its profile scorer. Purpose: tier V exposure. Under profile spend bots reach tier V in 0.9–2.1 % of bot-matches (10–23 bot-minutes at V per gun per 99 matches); under gun-first 7–16 % (84–172 bot-minutes).
- `.claude/skills/balance-sim/scripts/gun_tier_analysis.py` (new, stdlib): exact attrition from per-bot life values, Wilson class shares, gun × final tier, **time-at-tier kill rate** (kills per 10 bot-minutes spent at that tier, Poisson 95 % CI — not survivorship-biased), and arm-vs-baseline differences with CIs.
- Raw outputs: `~/hc-campaigns/2026-10-01-gun-tiers/` (`c1/`, `c2/`, the chain scripts, `armtable.py`).

Every arm: **99 matches** (the standing cap), 20 bots, `--roster even`, `--raw`, 12 shards, base seed 20261001, 0 failures. Precision tier: **±10 pp** on class share (coarse). The strongest claim available at this tier is "consistent with the 31–35 % band", never "in the band".

Bot quality bars on the baseline: 5 of 6 pass. "Bots scoring ≥ 1 participant kill" reads 49.2 % against the 60 % bar (same reading as 2026-09-30; Eric ruled on 2026-09-30 that pool-era readouts are measurements, not gates). Afloat ticks in land contact averaged 0.97 % (one shard 1.4 %). Storm deaths 6 % of bot deaths.

## 1. Baseline (profile spend — the realistic lobby)

### 1a. Attrition pacing — target 1

| checkpoint | alive mean [95 % CI] | of roster | target | matches still running |
| --- | --- | --- | --- | --- |
| 4:00 (ring 1 closed) | 11.76 [11.39–12.12] | 58.8 % | 10.0 (50 %) | 100 % |
| 8:00 (ring 2 closed) | 3.25 [2.99–3.51] | 16.3 % | 5.0 (25 %) | 93.9 % |
| 12:00 (ring 3 closed) | 1.20 [1.10–1.30] | 6.0 % | 2.5 (12.5 %) | **21.2 % — unmeasurable** |

Match duration: mean 623 s, p50 617 s, p95 791 s, max 944 s; every match ended `fieldCleared`. Reading: **ring 1 sinks 41 % (target 50 %), ring 2 sinks 72 % of what is left (target 50 %), and the field is gone before ring 3 closes.** Per-class alive at 4:00 is even (3.8 / 4.1 / 3.8).

### 1b. Class win share — target 3

| class | bot-matches | win share [Wilson 95 %] | mean placement | kills / bot-match | mean life s | storm-death share |
| --- | --- | --- | --- | --- | --- | --- |
| SPEEDBOAT (torpedoBoat) | 657 | 25.3 % [17.7–34.6] | 10.85 | 0.77 | 286 | 5.5 % |
| DREADNOUGHT (battleship) | 666 | 28.3 % [20.4–37.8] | 10.15 | 0.87 | 309 | 7.2 % |
| REPEATER (mineLayer) | 657 | **46.5 % [37.0–56.2]** | 10.50 | 1.02 | 306 | 4.3 % |

The REPEATER's lower bound clears the band. Across all nine arms of this run (including arms that do not touch it) it reads 37–48 %, so the over-performance is robust; the baseline draw is at the high end and the honest magnitude is about +8 pp over the band.

### 1c. Guns — target 2 (in BOT hands; see the caveat)

Time-at-tier kill rate, kills per 10 bot-minutes at that tier (profile spend, six arms pooled for tier I ≈ 16,000 bot-minutes per gun):

| tier | machine gun | flak | cannon |
| --- | --- | --- | --- |
| I (6 arms pooled) | 1.52 | **1.81** | 1.37 |
| I (baseline alone) | 1.59 [1.44–1.74] | 1.77 [1.62–1.93] | 1.44 [1.30–1.59] |
| III (baseline) | 3.04 [2.00–4.43] | 3.47 [2.37–4.90] | 3.83 [2.59–5.47] |
| V (baseline, 10–23 min) | 4.44 [2.13–8.17] | 4.87 [1.57–11.37] | 1.69 [0.34–4.93] |

Gun overall (baseline): win rate MG 5.2 % / flak 5.5 % / cannon 4.4 %; mean placement 10.37 / 10.41 / 10.71.

**Bot-aim caveat (Eric, 2026-10-01, accepted):** bots re-aim on `CONFIG.bots.decisionCadenceMs` 250 ms with `reactionMs` 400 ms, so a bot streaming a machine gun at a moving hull dumps part of each magazine into the water. Every gun reading here measures the gun in bot hands, not its ceiling. Eric rates the MG clearly best at tier I in human hands, and the paper numbers agree (next table). **No MG buff is to be proposed off bot evidence.**

Paper DPS by Eric's method (damage per reload cycle ÷ cycle time; cannon and flak rounds regenerate one per reload period, so extra rounds bank shots without raising sustained output; MG = shots × delay + full reload):

| tier | MG | cannon (sustained / banked opener) | flak (sustained / banked opener) |
| --- | --- | --- | --- |
| I | **4.10** | 3.00 / 15 | 3.00 / 12 |
| II | 5.97 | 3.37 / 16 | 3.68 / 14 |
| III | 8.33 | 3.78 / 34 | 4.44 / 32 |
| IV | 11.36 | 4.24 / 36 | 5.29 / 36 |
| V | **15.00** | 10.00 / 80 | 6.25 / 60 |

Against target 2 on paper: MG leads at I (met) **and still leads at V by 50 % over the cannon (not met)**; the cannon is flat from I to IV (3.0 → 4.2) and only the tier V second barrel lifts it; flak is the middle gun at no tier (ties the cannon at I, above it II–IV, last at V).

Also found while checking this table and ruled by Eric: a hull that bodyblocks a cannon or flak shell early still takes the smaller `contactDamage` (6 / 4) instead of the full amount. **Eric: bodyblocking must never reduce damage output; this should have been removed.** Work item written to `deferred-work.md` (2026-10-01 balance-sim heading).

## 2. Measured arms (one dial each unless stated; n = 99 each; diff vs baseline with 95 % CI)

### 2a. Class dials (profile spend)

| arm | dial | SPEEDBOAT | DREADNOUGHT | REPEATER | alive@4:00 diff | alive@8:00 diff |
| --- | --- | --- | --- | --- | --- | --- |
| baseline | — | 25.3 | 28.3 | 46.5 | — | — |
| ir90 | `instantReload.reloadMs` 45000 → 90000 | 24.2 | 33.3 | 42.4 (−4.0 [−17.9, +9.8]) | +0.37 [−0.15, +0.90] | +0.07 |
| mlhp275 | `shipClasses.mineLayer.hp` 300 → 275 | 28.3 | 33.3 | 38.4 (−8.1 [−21.8, +5.6]) | **−0.60 [−1.12, −0.07]** | −0.24 |
| tbhp275 | `shipClasses.torpedoBoat.hp` 250 → 275 | 34.3 (+9.1 [−3.6, +21.8]) | 28.3 | 37.4 | **+0.65 [+0.16, +1.14]** | +0.07 |
| boost15 | `boost.reloadMs` 25000 → 15000 | 22.2 (−3.0) | 40.4 (+12.1 [−1.0, +25.2]) | 37.4 | +0.61 [+0.07, +1.14] | −0.01 |
| **cls_combo** | **mineLayer.hp 275 + torpedoBoat.hp 275** | **37.4 [28–47]** | **33.3 [25–43]** | **29.3 [21–39]** | +0.23 [−0.29, +0.75] | −0.10 |

cls_combo kills per bot-match 0.94 / 0.83 / 0.92 (baseline 0.77 / 0.87 / 1.02). All three classes are consistent with the band in the combo arm; none is in it with confidence at this tier.

### 2b. Attrition dial

| arm | dial | alive@4:00 | alive@8:00 | matches running @12:00 | duration mean |
| --- | --- | --- | --- | --- | --- |
| baseline | — | 11.76 | 3.25 | 21 % | 623 s |
| ring045 | `zone.ringSteps.0` 0.333 → 0.45 (first ring 1730 u → ~1460 u) | **10.82 [10.43–11.21]** (−0.94 [−1.47, −0.41]) | 2.72 (−0.54 [−0.87, −0.21]) | 11 % | 597 s |

A tighter first ring hits the 4:00 target but pushes ring 2 further past its target and ends matches sooner. It fixes the first half of target 1 and worsens the second.

### 2c. Gun dials (gun-first spend, so tier V is real; class and attrition columns of these arms are NOT the realistic lobby)

| arm | dial | T1 MG / flak / cannon | T5 MG / flak / cannon (bot-min at V) | gun win % MG / flak / cannon |
| --- | --- | --- | --- | --- |
| gf_base | — | 0.85 / **1.15** / 0.91 | 6.40 [5.1–8.0] / 6.58 [5.3–8.1] / 6.23 [4.7–8.2] (125 / 140 / 84) | 3.8 / 7.5 / 3.8 |
| gf_flakrl5000 | `flak.reloadMs` 4000 → 5000 | **0.98** / 0.88 / 0.85 | 6.00 / 5.15 / 6.39 (172 / 130 / 83) | 5.8 / 6.9 / 2.4 |
| gf_gundmg17 | `gun.damage` 15 → 17 | 0.91 / 1.29 / 0.81 | 5.78 / 6.11 / 6.18 (132 / 132 / 112) | 5.8 / 5.0 / 4.2 |

Readings: at tier V in bot hands **all three guns are equal within CI** (≈ 6.2–6.6). The flak reload nerf moves flak from first to middle at tier I (1.15 → 0.88, CIs just separate) and at tier V on point estimate, leaving the MG top at I; this is the only gun dial with a measured effect. Cannon damage +2 (+13 % at I, +10 % at V) produced **no measurable change** at any tier at n = 99. Tier I rates are lower under gun-first because tier I time is then early-match only.

## 3. Proposals (ranked by measured effect; Eric rules line by line)

| # | dial | current → proposed | measured effect (both targets) | sample | cost elsewhere | ruling |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | `shipClasses.mineLayer.hp` + `shipClasses.torpedoBoat.hp` together | 300 → 275 and 250 → 275 | class share 25/28/46 → 37/33/29 (all consistent with band); attrition unchanged (+0.2 alive@4:00, n.s.) | 99 + 99 + 99 | flat heals and ARMOR (+25) are worth proportionally more to the 250 hp hull; the SPEEDBOAT at 275 narrows its hp gap to the REPEATER to 0 | PENDING |
| P2 | `zone.ringSteps.0` | 0.333 → 0.45 | alive@4:00 11.8 → 10.8 (hits 10); alive@8:00 3.3 → 2.7 (worse); matches 26 s shorter | 99 | fixes ring 1, worsens ring 2; the geometry is amendment 5's pure-geometric shrink | PENDING |
| P3 | `flak.reloadMs` | 4000 → 5000 | flak T1 kill rate 1.15 → 0.88 (sig.); T5 6.6 → 5.2; MG becomes T1 leader on point estimate; paper flak DPS 3.0 → 2.4 at I, 6.25 → 5.0 at V | 99 gun-first | flak was just cut 6 → 4 s on 2026-10-01 (amendment 210); this gives back half | PENDING |
| P4 | `instantReload.reloadMs` | 45000 → 90000 | REPEATER −4 pp (null at this tier) | 99 | — | NOT RECOMMENDED (no measured effect) |
| P5 | `boost.reloadMs` | 25000 → 15000 | SPEEDBOAT −3 pp, DREADNOUGHT +12 pp | 99 | — | NOT RECOMMENDED (did not help the SPEEDBOAT) |
| P6 | `gun.damage` | 15 → 17 | no measurable cannon change at any tier | 99 gun-first | — | NOT RECOMMENDED (null) |

**Unmeasured, flagged as reasoning only:** the thing that would make the cannon strongest at V is its ladder step, which lives in the frozen catalog (`shared/src/sim/catalog.ts` `cannonDamage` +1.25 per rung), not in `CONFIG`, so `--tune` cannot reach it. On paper, +2.5 per rung gives 15 / 17 / 20 / 22 / 25 → tier V 50 hp per click, 12.5 sustained DPS — still below the MG's 15. Reaching "cannon strongest at V" on paper needs the MG's top end to come down as well (its ladder is also catalog: +1 damage, +2 magazine, −40/−40/−40/−30 ms per rung). I did not measure either: the temporary catalog edit for a measurement arm was refused by the harness permission gate. If Eric wants numbers, the next run can carry a catalog-step arm after he authorizes the edit.

**Unmeasured for target 1's second half (ring 2 too lethal):** no dial in this run slowed the 4:00–8:00 window. Candidates for the next cycle, none measured: `zone.ringSteps.1` (a larger second ring, paired with P2), `drones.*` wave sizes (drone kills feed levels, which feed tiers), `hullRepair.*`. Regen delay 10 s is **not** a candidate (Eric rejected it on 2026-09-30, amendment 175).

## 4. Standing limits carried forward

- ±10 pp tier only (99-match cap); class claims are "consistent with", never "in band".
- Gun readings are bot-hand readings (bot-aim caveat above); paper DPS is the ceiling.
- Ring 3 is unmeasurable while matches end around 10:20; it becomes measurable only after ring 2 is fixed.
- The `anyKill` bar (49 %) stays failing; Eric's 2026-09-30 ruling treats pool-era bars as measurements.
- Bodyblock contact damage is live and reduces cannon/flak output; work item open.
