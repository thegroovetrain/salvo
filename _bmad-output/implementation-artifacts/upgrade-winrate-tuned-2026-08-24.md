# Upgrade Winrates Under Tuned Profiles — 2026-08-24 (companion to the vacuum report)

**999 mixed matches with the six shipped bot temperaments and uniformly random card picks — the second, higher-fidelity instance of the randomized-pick measurement design.** Same day, same branch (`worktree-balance-upgrade-stats`, post-PR-#197 merge), same catalog. This is the cross-check the vacuum report promised: which of its findings were rig artifacts, and which are properties of the cards.

## Instrument

- **Rig**: `--bot-spend random --roster even --raw`, 20 bots/match. Every bot rolls one of the six shipped in-game profiles for its dealt hull (raider/duelist, bulwark/siege, forager/trapper) and keeps its **full temperament** — band, targeting, disengage/heal thresholds, appetite — while the **card pick alone** is uniform-random over the offered hand. The heal rule fires before the random fork by construction (Eric's original policy ruling, preserved).
- **Sample**: 999 matches in two batches (498 seed-base 42, 501 seed-base 900000042; merged under one arm label), roster exactly even (6,657/6,666/6,657), 998 resolved + 1 draw, zero shard failures, zero duplicate match seeds, zero validity warnings, ±5pp tier supported.
- **Metric**: ordinal-matched, class-conditioned lift, identical to the vacuum report (1.00 = an average pick at that moment; removes the survival and class confounds because pick-#i assignment is random). The vacuum column below pools that campaign's mixed per-class scopes, so the comparison is mixed-vs-mixed, apples to apples.

## Class share — temperament carries a lot, and the remainder is the broadside

| | vacuum rig | tuned profiles (n=999) | 31–35% band |
|---|---|---|---|
| Battleship | 69.2% | **44.6%** (41.5–47.7) | over, decisively |
| Mine Layer | 15.7% | **32.5%** (29.6–35.4) | **in band** |
| Torpedo Boat | 15.1% | **22.9%** (20.4–25.7) | under, decisively |

Restoring the shipped temperaments recovered 25pp of the Battleship's vacuum dominance — and it still sits ~10pp over the band. Cycle 122 measured a 2.8pp spread with tuned profiles **and weighted spending**, so the residual BS edge under random spending is the kit itself (plus whatever share of balance the weighted spend policy was quietly carrying). Pool texture agrees: TB kills nearly doubled vs vacuum (0.50 → 0.88/bot), BS mean life collapsed 483s → 397s (it gets kited now), and the ML is the survivor class (478s) with wins to match. Attrition: 73.6% alive @4:00 (target 50%), 37.2% @8:00 (25%), 14.7% @12:00 (12.5%) — random spending still slows the early game; on-target by ring 3; median match 911s.

## The comparison table

Pooled class-conditioned lift, vacuum vs tuned; per-class columns are the tuned arm. `·` = class can't hold the card or n < 15.

| Card | vac | tuned (95% CI) | Δ | tuned TB / BS / ML |
|---|---|---|---|---|
| BROADSIDE BARRAGE (acq.) | 2.20 | **1.92** (1.71–2.16) | −0.27 | 1.99 / · / 1.88 |
| BARREL I–II | 1.72 | **1.79** (1.69–1.90) | +0.07 | 1.89 / 1.81 / 1.70 |
| PHOSPHOR SHELLS | 1.14 | 1.19 (1.07–1.32) | +0.05 | 1.15 / 1.20 / 1.10 |
| BROADSIDE TURRETS I–II | 1.10 | 1.15 (1.05–1.25) | +0.04 | 1.42 / 1.04 / **1.74** |
| CAPTIVE MINES | 1.08 | 1.10 (0.96–1.26) | +0.02 | **0.74** / 1.06 / 1.14 |
| RELOAD I–V | 1.04 | 1.03 (0.97–1.10) | −0.00 | 1.03 / 1.02 / 1.06 |
| BROADSIDE SPREAD I–IV | 1.00 | 1.03 (0.95–1.12) | +0.03 | 1.44 / 0.94 / 1.34 |
| GUN BUOY | 1.02 | 1.03 (0.89–1.19) | +0.01 | 0.71 / 0.98 / 1.07 |
| DAZZLE SHELLS | 0.98 | 1.00 (0.89–1.12) | +0.02 | 0.78 / 1.02 / 0.90 |
| ACOUSTIC HOMING | 1.10 | 0.99 (0.84–1.16) | −0.12 | 0.98 / 1.08 / 0.84 |
| EXTRA TUBE | 1.10 | 0.98 (0.83–1.14) | −0.13 | 1.00 / 1.07 / 0.73 |
| HULL I–IV | 0.99 | 0.97 (0.91–1.04) | −0.02 | 1.06 / 0.94 / 0.97 |
| TORPEDO TUBES (acq.) | 1.11 | 0.96 (0.83–1.11) | −0.15 | · / 1.02 / 0.85 |
| EXTRA TURRET | 0.92 | 0.93 (0.85–1.02) | +0.01 | 0.95 / 0.94 / 0.91 |
| TORPEDO I–IV | 0.92 | 0.93 (0.83–1.05) | +0.01 | 0.92 / 1.07 / 0.82 |
| SPEED I–IV | 0.93 | 0.93 (0.87–0.99) | +0.00 | 0.89 / 0.95 / 0.93 |
| STAR SHELLS I–IV | 0.90 | 0.92 (0.84–1.01) | +0.02 | 0.71 / 0.94 / 0.86 |
| BUOY I–IV | 0.87 | 0.92 (0.83–1.02) | +0.05 | 0.77 / 0.78 / 0.96 |
| MINE RACKS (acq.) | 0.97 | 0.91 (0.78–1.07) | −0.06 | 0.86 / 0.94 / · |
| PROP FOULING MINES | 0.81 | 0.88 (0.76–1.02) | +0.07 | **0.42** / 0.85 / 0.92 |
| MINES I–IV | 0.92 | 0.88 (0.79–0.98) | −0.04 | 0.72 / 0.94 / 0.88 |
| INTEL I–V | 0.88 | **0.87** (0.82–0.94) | −0.00 | 0.88 / 0.88 / 0.86 |
| JAMMING BUOY | 0.89 | 0.87 (0.74–1.02) | −0.02 | 0.56 / 0.77 / 0.92 |
| BOOST DURATION I–IV | 0.84 | 0.82 (0.73–0.93) | −0.02 | 0.91 / 0.74 / **0.51** |
| BOOST SPEED I–II | 0.80 | 0.81 (0.70–0.94) | +0.01 | 0.83 / 0.79 / 0.72 |
| STAR SHELL MORTAR (acq.) | 0.82 | 0.79 (0.64–0.96) | −0.04 | 0.72 / · / 0.83 |
| RADAR BUOY (acq.) | 0.83 | 0.76 (0.63–0.90) | −0.07 | 0.68 / 0.79 / · |
| EMERGENCY THROTTLE (acq.) | 0.81 | **0.74** (0.63–0.87) | −0.06 | · / 0.84 / 0.60 |

## Revised tiers

The tuned rig is the higher-fidelity instrument, so tiers now read off its pooled lift (same bands as the vacuum report: S ≥1.6 · A 1.25–1.6 · B 1.05–1.25 · C 0.90–1.05 · D 0.75–0.90 · F <0.75), with the vacuum as corroboration. The A band is empty — this catalog splits into two S outliers, a competent B cluster, a broad average middle, and a long weak tail.

- **S** — BROADSIDE BARRAGE (acq.) 1.92 · BARREL 1.79
- **B** — PHOSPHOR SHELLS 1.19 · BROADSIDE TURRETS 1.15 · CAPTIVE MINES 1.10
- **C** — RELOAD, BROADSIDE SPREAD, GUN BUOY, DAZZLE, ACOUSTIC HOMING, EXTRA TUBE, HULL, TORPEDO TUBES (acq.), EXTRA TURRET, TORPEDO I–IV, SPEED, STAR SHELLS I–IV, BUOY I–IV, MINE RACKS (acq.) — 0.91–1.03
- **D** — PROP FOULING, MINES I–IV, INTEL, JAMMING BUOY, BOOST DURATION, BOOST SPEED, STAR SHELL MORTAR (acq.), RADAR BUOY (acq.) — 0.76–0.88
- **F** — EMERGENCY THROTTLE (acq.) 0.74

Tier moves vs the vacuum report: CAPTIVE MINES A→B (the vacuum's A was the TB knife-range artifact, below), the torpedo trio B→C, INTEL C→D, RADAR BUOY acq. D→D-floor, EMERGENCY THROTTLE D→F. Everything else held.

## What the full sample settles

1. **The tier structure is rig-independent.** 24 of 28 cards moved less than ±0.08 between rigs. Card quality was never the thing the vacuum was distorting — class posture was.
2. **BARREL is statistically the strongest card in the game** — 1.79 (1.69–1.90) on n=3,712 builds, *up* under realistic play, top-3 for every class in both rigs. The spacing-under-burst geometry (12u < 15u ⇒ pure damage multiplier) is the mechanism, and it is now the single best-evidenced tuning target in the catalog.
3. **CAPTIVE MINES on the TB was a rig artifact** — vacuum 1.63, tuned 0.74. A vacuum TB forced to brawl at knife range sat on top of its own minefield; a real raider/duelist kites away from it. On its native ML (1.14) and the BS (1.06) it's a solid B. The "mine ladder is the ML's wincon fix" argument from the design discussion strengthens — the ML is *already* in band here, surviving longest and winning through attrition.
4. **The vacuum's "torpedoes migrate to the BS" story dissolves** — acquireTorpedo 1.11→0.96, EXTRA TUBE and ACOUSTIC HOMING both ~0.99. Torpedo cards are simply average, everywhere.
5. **INTEL (0.87, CI 0.82–0.94, n=6,731), SPEED (0.93, 0.87–0.99), and the whole boost family (0.74–0.82) are now solid negatives under temperaments that genuinely kite and disengage.** The "bots can't use mobility/intel" defense is spent — these are under-budget, with one residual caveat that profile boost usage may still be crude.
6. **The broadside conclusion is as strong as this instrument can make it**: its cards on the BS are ~neutral (SPREAD 0.94, TURRETS 1.04) while enormous on acquirers (ML TURRETS 1.74, TB SPREAD 1.44), the acquisition is the best card either eligible class can take (1.9–2.0), and the BS holds 44.6% with spending randomized. The weapon is over budget; its ladder is not.
7. **The TB hates off-kit utility more than any class** — PROP FOULING 0.42, JAMMING 0.56, STAR SHELLS I–IV 0.71 on TB. A fast kiting hull wants throughput or nothing, which is also why its two S-cards (BARREL 1.89, acquireBroadside 1.99) are its *most* extreme.

## Standing caveats

Random spending still slows the early game relative to the shipped weighted policy (the attrition curve above), heals+banking still absorb ~90% of level flow, and one card-level caveat survives: boost value depends on profile boost *usage*, which the tuned rig exercises but may under-exploit. Cross-rig deltas smaller than ~±0.15 at these CIs should not be narrated. No CONFIG was touched; every tuning direction here is Eric's call through the normal pipeline.

## Reproduction

`run_campaign.py --bots 20 --extra --bot-spend random --roster even --raw`, arms 498 (seed 42) + 501 (seed 900000042), label `tunedMixed`, 12 shards; analyzer `upgrade_stats.py` (ordinal-matched class-conditioned lift); comparison `compare_tuned.py`. Full vacuum methodology and tables: `upgrade-winrate-report-2026-08-24.md`.
