# Balance-sim campaign — Speedboat HP and deck-gun dropoff ledger (2026-10-19)

**What was run (Eric's ask, 2026-10-19):** two questions, measured by Opus agents coordinated by a Fable session. (1) Is the SPEEDBOAT (`shipClasses.torpedoBoat`, 250 hp) underpowered for lack of hull points, and would 300 put it in a better place? (2) Can the deck-gun range dropoff ("attenuation": the damage cut a shell takes the farther it flies) be set per gun to bring the cannon, machine gun and flak level? Five arms ("arm" = one configuration run over the same set of matches):

| Arm | Question | Tune | Tree |
|---|---|---|---|
| `base1019` | Speedboat HP | none (250 hp) | `cb88ac88` (= `development`), clean |
| `tb300` | Speedboat HP | `shipClasses.torpedoBoat.hp=300` | `cb88ac88` |
| `tb350` | Speedboat HP | `shipClasses.torpedoBoat.hp=350` (a bracket to measure the slope, never a proposal) | `cb88ac88` |
| `base` | Deck gun | none | WIP `8c7500fd` on top of `cb88ac88` (agent branch, see below) |
| `cannonHarsh` | Deck gun | `gunAttenuation.perGun.cannon.fullFrac=0.3`, `…cannon.minFactor=0.25` | WIP `8c7500fd` |

Every arm: **91 matches**, 6 shards (16 + 15 × 5), **16 bots**, even roster (486 Speedboat / 485 Dreadnought / 485 Repeater per arm), `--raw`, base seed **20261019**, so every arm plays the same 91 maps and seeds and each match has a twin in every other arm. Zero failures in any arm. No CONFIG value was changed permanently, nothing was committed to `development`, `PROTOCOL_VERSION` was not bumped.

Shards: `~/hc-campaigns/speedboat-hp-2026-10-19/{base1019,tb300,tb350}-shard00..05.json` (combined `analyze-all.json`, per-bot `raw-readout-all.json`) and `~/hc-campaigns/deckgun-2026-10-19/{base,cannonHarsh}-shard00..05.json` (printout `phase2-analysis.txt`). Wall times 71–79 min per arm on a shared machine (load average 26–57 on 12 cores).

```
uv run --python 3.11 ~/Code/salvo/.claude/skills/balance-sim/scripts/run_campaign.py --repo <worktree> --matches 91 --shards 6 --bots 16 --base-seed 20261019 --label <arm> --out-dir <dir> [--tune …] --extra --raw --roster even
uv run --python 3.11 ~/Code/salvo/.claude/skills/balance-sim/scripts/analyze_campaign.py analyze --baseline base1019 <18 Speedboat shard JSONs>
python3 -I <jobs>/tmp/a6267/phase2_analyze.py ~/hc-campaigns/deckgun-2026-10-19
```

**Eric's rulings that frame this ledger (2026-10-19):** bots no longer waste the machine gun since Story 9.13, so per-gun sim data is usable evidence again (this supersedes the 2026-10-02 "guns by math, not sim" refusal for dropoff work; the gun tier ladder stays Eric's math). The deck-gun target: the three guns **roughly even in win share and average placement, each favoring a different playstyle** (cannon standoff reach, machine gun close sustained fire, flak area burst), so the pick is taste, never "one is objectively best". Direction: **trim the cannon**. The planned `cannonOff` arm (cannon dropoff removed) was **cancelled** as the wrong direction and never ran.

Terms used throughout: **pp** = percentage points. **95 % CI** = the range that would contain the true value 95 times in 100. **Significant** = the CI on a change excludes zero. **Resolved** = a match that produced a winner. **Paired** = compared match-by-match against the same seed in another arm.

## Validity

- **Sample tier.** The balance-sim skill's tiers: 91 resolved matches is the coarse ±10 pp "iterate" tier; the ±5 pp "confirm" tier needs about 360 matches per arm, above the 99-match-per-arm cap.
  - `base1019`: 90 resolved, `tier_supported` ±10 pp, **no analyze warnings**.
  - `tb300`: 89 resolved, `tier_supported` **null** (±10.1 pp).
  - `tb350`: 86 resolved, `tier_supported` **null** (±10.1 pp).
  - `base` (deck gun): 90 / 91 resolved; `cannonHarsh`: 91 / 91. The deck-gun arms were read with the agent's own paired script (`phase2_analyze.py`), not `analyze_campaign.py`; the source records no analyze warnings for them.
- **analyze warnings, verbatim:**
  - `tb300: 89 resolved matches gives +/-10.1pp, coarser than the +/-10pp floor — too noisy to act on.`
  - `tb350: 86 resolved matches gives +/-10.1pp, coarser than the +/-10pp floor — too noisy to act on.`
- **The deck-gun tree is a no-op until tuned.** The per-gun override and new readout on `8c7500fd` were proven inert: a 12-match smoke (seed 20261019) on that tree and on an untouched `cb88ac88` copy gave **12 of 12 matches identical**, all aggregates and bot blocks equal. The 91-match `base` arm reproduces `base1019` exactly (class share 15.6 / 42.2 / 42.2, same bar values below).
- **Per-gun CIs are bot-level.** They treat the 1,456 bots per arm as independent and ignore that bots in one match affect each other, so the real uncertainty is somewhat wider. Every gun reading is bot-hand evidence; the distance-band readout is the most trustworthy deck-gun output.
- **Pairing buys little.** Only 33 (`tb300`) and 38 (`tb350`) of 91 seeds keep the same winning class as `base1019`; only 35 of 90 deck-gun twins do. A single HP or damage change reshuffles the whole match, so "same seed" is not "same match". The seed-paired Speedboat cross-check reaches the same conclusions as the unpaired one.

### The six bot quality bars (pooled per arm)

| Bar | base1019 / base | tb300 | tb350 | cannonHarsh |
|---|---|---|---|---|
| Resolve before the 16:00 collapse > 95 % | 87/91 = 95.6 % PASS | 89/91 = 97.8 % PASS | 88/91 = 96.7 % PASS | 91/91 PASS |
| Mean per-match max single-bot kill share ≤ 40 % | 26.8 % PASS | 26.7 % PASS | 24.7 % PASS | 26.6 % PASS |
| Bots with ≥ 1 kill of another captain ≥ 60 % | 748/1456 = 51.4 % **FAIL** | 758/1456 = 52.1 % **FAIL** | 785/1456 = 53.9 % **FAIL** | 52.2 % **FAIL** |
| Storm share of deaths 5–20 % | 20/1371 = 1.5 % **FAIL** | 17/1370 = 1.2 % **FAIL** | 15/1378 = 1.1 % **FAIL** | 1.5 % **FAIL** |
| Afloat bot-ticks in land contact < 1 % | 119,909/11,498,850 = 1.04 % **FAIL** | 74,322/11,594,402 = 0.64 % PASS | 98,610/11,429,523 = 0.86 % PASS | 0.78 % PASS |
| Banked levels spent > 90 % | 99.9 % PASS | 99.9 % PASS | 99.9 % PASS | 99.96 % PASS |

The deck-gun agent reported the resolution bar for its `base` arm as 91/91, where the Speedboat agent's count on the identical baseline is 87/91 before the 16:00 collapse; the two agents counted the bar differently and this ledger does not reconcile them. The `cannonHarsh` 91/91 is in the deck-gun agent's convention.

The kill bar and the storm bar fail in every arm. They are the two bars Story 9.13 left open and are bot-tactics limits, not hull or gun effects: **class and gun shares here are still partly decided by bot tactics**. Land contact hovers around its 1 % line from arm to arm (seed noise; neither HP nor dropoff should change grounding). No bar flipped in either campaign.

### The mutual-ram no-winner ending (harness oddity)

Every match in every arm that did not end `fieldCleared` (8 total) ends the same way: **the last two hulls sink each other by ramming on the same tick** (`sunkByContact`, identical life to 0.1 s). Nobody is left, so the harness ends the match as `lastHumanSunk` with `winnerClass: null` and analyze excludes it from class share. Story 9.13 already recorded this in deferred-work (2026-10-17).

**It grows with Speedboat HP:** 1 (`base1019`) → 2 (`tb300`) → 5 (`tb350`). 6 of the 7 tuned-arm draws involve a Speedboat, and in 3 of the 5 `tb350` draws the Speedboat holds placement 1 with no win credited. Ramming damage follows the energy law with mass = max hull, so a heavier Speedboat both hits and is hit harder in the endgame. These draws are what pushed the tuned arms under the sample floor, and they can shave real wins off the Speedboat's count. A measurement note, not a proposal.

Seeds: `base1019` 2790982975; `tb300` 790620577, 3441840173; `tb350` 1806474295, 3021961079, 1389885742, 2041567043, 2390849062. (`cannonHarsh` resolved all 91.)

## Speedboat HP (250 / 300 / 350)

Target band: each hull wins about 31–35 % of resolved matches.

### Class win share (resolved matches; analyze's CIs)

| Arm | Resolved | Tier | Speedboat | Dreadnought | Repeater |
|---|---|---|---|---|---|
| base1019 (250) | 90 | ±10 pp | **15.6 %** (9.5–24.4), 14 wins | 42.2 % (32.5–52.5), 38 | 42.2 % (32.5–52.5), 38 |
| tb300 | 89 | null (±10.1 pp) | **20.2 %** (13.2–29.7), 18 | 43.8 % (34.0–54.2), 39 | 36.0 % (26.8–46.3), 32 |
| tb350 | 86 | null (±10.1 pp) | **34.9 %** (25.7–45.4), 30 | 38.4 % (28.8–48.9), 33 | 26.7 % (18.5–36.9), 23 |

Change vs `base1019` (analyze, arms as independent samples):

| | Speedboat | Dreadnought | Repeater |
|---|---|---|---|
| tb300 | +4.7 pp (−6.5, +15.9), n.s. | +1.6 (−12.9, +16.1), n.s. | −6.3 (−20.5, +8.0), n.s. |
| tb350 | **+19.3 (+6.8, +31.9), significant** | −3.9 (−18.3, +10.6), n.s. | **−15.5 (−29.3, −1.6), significant** |

Seed-paired cross-check (seeds where both arms produced a winner): `tb300` (88 seeds) Speedboat +4.5 (−6.8, +15.9), Dreadnought 0.0 (−14.2, +14.2), Repeater −4.5 (−19.4, +10.3); `tb350` (85 seeds) Speedboat +20.0 (+7.8, +32.2), Dreadnought −3.5 (−16.0, +8.9), Repeater −16.5 (−29.5, −3.4).

Band check (`all_consistent`): `base1019` false (the Speedboat is out of band). For the tuned arms analyze returns null because of the sample floor; read by hand, at `tb300` the Speedboat is still inconsistent with the band (its CI tops out at 29.7 %) while the other two are consistent; at `tb350` all three CIs overlap 31–35 %. That is "consistent with the band" at ±10 pp, never "in the band".

Slope: +4.7 pp for +50 hp, +19.3 pp for +100 hp. The two steps' CIs overlap, so 91 matches cannot tell a linear rise from an accelerating one.

### Attrition (Eric's target about 8 / 4 / 2 of 16 alive at 4:00 / 8:00 / 12:00)

| Arm | Alive 4:00 | 8:00 | 12:00 | Matches reaching (analyze frac; raw count at 12:00) | Median match | Ended by |
|---|---|---|---|---|---|---|
| base1019 | 10.7 (+2.7) | 5.8 (+1.8) | 1.9 (−0.1) | 100 % / 100 % / 73 % (71) | 776.8 s | fieldCleared 90, lastHumanSunk 1 |
| tb300 | 10.8 (+2.8) | 6.2 (+2.2) | 1.8 (−0.2) | 100 % / 100 % / 68 % (61) | 769.1 s | fieldCleared 89, lastHumanSunk 2 |
| tb350 | 10.6 (+2.6) | 5.6 (+1.6) | 2.0 (0.0) | 100 % / 99 % / 77 % (71) | 782.1 s | fieldCleared 86, lastHumanSunk 5 |

Counting only matches still running at that time (raw): 10.74 / 5.84 / 2.44, then 10.76 / 6.16 / 2.66, then 10.59 / 5.63 / 2.61. The final cycle is reached in every arm, so 12:00 is measurable. **Speedboat HP is not an attrition lever:** the field stays about 2–3 hulls above target at 4:00 and 8:00 (as after Story 9.13) and about on target at 12:00 in all three arms.

Alive by class (analyze), Dreadnought / Repeater / Speedboat: at 4:00, 4.23 / 3.62 / 2.88 → 4.13 / 3.35 / 3.27 → 3.93 / 3.31 / 3.36; at 12:00, 0.96 / 0.63 / 0.32 → 0.80 / 0.55 / 0.43 → 0.79 / 0.47 / 0.77. The extra HP moves survival from the Repeater to the Speedboat.

### Per Speedboat life (486 Speedboat bot-lives per arm)

| | base 250 | tb300 | tb350 |
|---|---|---|---|
| Life p25 / **median** / p75 | 116 / **262** / 481 s | 155 / **300** / 521 s | 165 / **340** / 571 s |
| Mean life | 319 s | 354 s | 385 s |
| Alive-rate at 4:00 / 8:00 / 12:00 | 54 / 25 / 6 % | 61 / 31 / 8 % | 63 / 34 / 14 % |
| Kills of other captains (total; per life) | 273; 0.56 | 348; 0.72 | 422; **0.87** |
| Bots with ≥ 1 kill | 39.7 % | 46.5 % | 55.6 % |
| Drone kills per life | 7.4 | 8.5 | 9.5 |
| Damage dealt per life | 1,003 | 1,167 | 1,344 |
| Mean finishing place | 9.86 | 9.39 | 8.71 |
| Deaths: ship fire / **ramming** / run aground / storm / drones | 296 / **136** / 31 / 2 / 7 | 317 / **123** / 21 / 3 / 5 | 269 / **166** / 24 / 1 / 2 |
| Ramming share of its deaths | 28.8 % | 26.2 % | **35.9 %** |
| Ram damage taken per life | 23.1 | 29.8 | 35.5 |
| Survived to the end | 14 | 17 | 24 |

Extra HP turns into both longer lives and more kills, roughly in step: at 350 the median life is up 30 % (262 → 340 s), kills per life up 55 % (0.56 → 0.87), and the 12:00 alive-rate more than doubles. The one cost inside its own row is **ramming**: at 350 it becomes the cause of more than a third of Speedboat deaths (166), its ram damage taken rises in step with HP, and it accounts for most of the mutual-ram draws above.

**What the HP costs the other two hulls (base / 300 / 350):**

| | Dreadnought | Repeater |
|---|---|---|
| Win share | 42.2 / 43.8 / 38.4 % | 42.2 / 36.0 / **26.7 %** |
| Median life | 472 / 473 / 412 s | 374 / 333 / 315 s |
| Alive-rate 4:00 / 8:00 / 12:00 | 79/49/18 → 78/48/15 → 74/41/15 % | 68/35/12 → 63/37/10 → 62/30/9 % |
| Kills per life | 1.05 / 0.95 / 0.92 | 0.91 / 0.92 / 0.80 |
| Deaths ship / ram / aground / storm / drones | 370/53/10/16/0 → 361/64/7/14/2 → 346/85/10/13/0 | 327/107/8/2/6 → 337/105/8/0/3 → 343/110/6/1/2 |
| Mean finishing place | 7.18 / 7.34 / 7.74 | 8.45 / 8.76 / 9.06 |

At 350 the Dreadnought loses some survival and its ramming deaths rise 53 → 85 but keeps its win share within noise; the Repeater pays most of the transfer.

## Deck-gun dropoff (base vs cannonHarsh)

### How dropoff works (code read)

All three deck guns pass through one server function, `world.ts` `shellAttenuation`. A shell's distance flown (muzzle to hit) is compared with its gun's live range, stamped at fire time. Two dials shape the curve: **`fullFrac`** = the fraction of range flown at full damage (the **knee**, where damage starts dropping), and **`minFactor`** = the damage kept at max range. Shipped CONFIG: one shared pair, `fullFrac` 0.5 / `minFactor` 0.5, for every gun. Shots aimed inside one of the firer's own lit flare zones ("own light") take no cut. The machine gun is cut only on direct hits; the cannon and flak bodyblock damage is never cut.

### Per-gun range and knee ladder (from `effectiveStats`; gun tier I = no cards, tier V = four ladder cards)

| Gun tier | Cannon range / knee / dmg per shell / shells per click / rounds / reload | Machine gun range / knee / dmg / magazine / shot delay / reload | Flak range / knee / centre dmg / rounds / reload |
|---|---|---|---|
| I | 1000 / 500 / 8 / 2 / 1 / 5.0 s | 750 / 375 / 5 / 12 / 300 ms / 12.5 s | 625 / 312.5 / 16 / 1 / 3.5 s |
| II | 1062.5 / 531 / 10 / 2 / 1 / 4.75 s | 781 / 391 / 5 / 15 / 275 ms / 11.9 s | 656 / 328 / 18 / 2 / 3.33 s |
| III | 1125 / 562.5 / 11 / 2 / 2 / 4.5 s | 812.5 / 406 / 5 / 18 / 250 ms / 11.25 s | 687.5 / 344 / 20 / 2 / 3.15 s |
| IV | 1187.5 / 594 / 12 / 2 / 2 / 4.25 s | 844 / 422 / 5 / 20 / 225 ms / 10.6 s | 719 / 359 / 22 / 2 / 2.98 s |
| V | 1250 / 625 / 13 / 2 / 2 / 4.0 s | 875 / 437.5 / 5 / 23 / 200 ms / 10.0 s | 750 / 375 / 24 / 2 / 2.8 s |

Ranges in world units (u); sight is 500 u. At tier I the cannon's full-damage zone is exactly the sight bubble; the machine gun's (375 u) and flak's (312 u) sit well inside it. Paper damage per second at tier I by Eric's method (damage per reload cycle ÷ cycle time): cannon 16 / 5 s = 3.2 (1.6 at max range), machine gun 60 / 16.1 s = 3.7, flak 16 / 3.5 s = 4.6 on the centre.

### Baseline per-gun diagnosis

Story 9.13's `final913` (48 matches, 768 bot-lives, seed 20261017; Wilson / normal 95 % ranges), read before this campaign:

| Gun | Bots | Win % | Mean life | Kills per 10 bot-min | Mean placement |
|---|---|---|---|---|---|
| Cannon | 247 | 7.7 [5.0–11.7] | 458 ± 30 s | 1.20 ± 0.16 | 7.25 |
| Machine gun | 247 | 6.1 [3.7–9.8] | 371 ± 30 s | 1.48 ± 0.19 | 8.72 |
| Flak | 274 | 5.1 [3.1–8.4] | 336 ± 28 s | 1.44 ± 0.19 | 9.43 |

Most bots in that run ended at gun tier I (cannon 153/247, machine gun 162/247, flak 193/274), so it is mostly a tier I reading. Today's 91-match `base` arm (bots per gun: cannon 479, machine gun 463, flak 514) sharpens it: **the cannon is clearly strongest** (best placement by more than 2 places, longest life by about 2 minutes); the machine gun and flak are level with each other and well behind. An even split is about 6.25 % wins per gun (1 in 16 bots).

### Damage by distance band (the new readout, captain hits)

Bands are fixed fractions of each gun's range (own light / ≤ 50 % / 50–75 % / 75–100 %); they do not move with a tuned knee, so arms compare like with like.

| Arm | Gun | Captain damage by band | Average damage kept, 50–75 / 75–100 band | Captain damage removed by dropoff |
|---|---|---|---|---|
| base | Cannon | 7 / 58 / 27 / 8 % | 0.886 / 0.644 | **7.3 %** (17,732 hp) |
| harsh | Cannon | 9 / 62 / 24 / 6 % (of a smaller total) | 0.663 / 0.407 | **19.7 %** (51,399 hp) |
| base | Machine gun | 11 / 82 / 6 / 0 % | 0.961 / 0.622 | 0.3 % |
| harsh | Machine gun | 10 / 82 / 7 / 0 % | 0.959 / 0.649 | 0.4 % |
| base | Flak | 15 / 68 / 15 / 1 % | 0.954 / 0.610 | 1.3 % |
| harsh | Flak | 14 / 67 / 17 / 1 % | 0.953 / 0.608 | 1.5 % |

Fleet hulls (drones): the cannon lost 9.4 % of its fleet damage in base and 21.1 % in harsh; the machine gun 0.3 % in both; flak about 0.7 %. Where bots aim (shells fired by band): cannon 8 / 38 / 33 / 21 % base and 8 / 40 / 32 / 20 % harsh (unchanged, since bots do not react to the knee); machine gun 20 / 40 / 39 / 1 %; flak 26 / 60 / 12 / 2 %. Aim bands and hit bands use different points (aim point vs impact point), so one is not divided by the other. In the harsh arm the cannon's average damage kept matches the tuned curve, confirming the tune was live (each shard JSON also records its `tune` block). Net cannon damage to captains fell 226.7k → 210.1k hp (−7 %) while its hits rose 28.9k → 30.7k as the twins diverged.

### Per gun, base vs cannonHarsh (bot-level 95 % ranges; paired change on twins)

| Gun | Arm | Win % | Mean life | Kills per 10 bot-min | Mean placement | Damage per bot (all weapons) |
|---|---|---|---|---|---|---|
| Cannon | base | **9.2 [6.9–12.1]** | **477 ± 21 s** | 1.12 ± 0.11 | **6.98 ± 0.37** | 1606 ± 124 |
| Cannon | harsh | 8.1 [6.0–10.9] | 470 ± 22 s | 1.13 ± 0.11 | 7.26 ± 0.39 | 1558 ± 123 |
| Cannon | change | −1.0 ± 3.5 pp | −7 ± 23 s | +0.01 ± 0.15 | +0.28 ± 0.40 | −48 ± 124 |
| Machine gun | base | 5.0 [3.3–7.3] | 348 ± 21 s | 1.46 ± 0.14 | 9.39 ± 0.42 | 1197 ± 122 |
| Machine gun | harsh | 5.0 [3.3–7.3] | 352 ± 21 s | 1.42 ± 0.14 | 9.16 ± 0.41 | 1191 ± 120 |
| Machine gun | change | 0.0 ± 2.4 pp | +3 ± 18 s | −0.04 ± 0.20 | −0.23 ± 0.35 | −6 ± 113 |
| Flak | base | 4.7 [3.2–6.9] | 361 ± 21 s | 1.30 ± 0.13 | 9.11 ± 0.41 | 1200 ± 122 |
| Flak | harsh | 5.6 [4.0–8.0] | 363 ± 21 s | 1.40 ± 0.13 | 9.06 ± 0.41 | 1226 ± 122 |
| Flak | change | +1.0 ± 2.5 pp | +3 ± 19 s | +0.10 ± 0.18 | −0.05 ± 0.34 | +27 ± 114 |

Every change points the wanted way (cannon down, flak up, machine-gun placement up), and **every change is inside its error range**. The cannon still places about 2 positions ahead.

Side effects of `cannonHarsh` on the other targets, all inside error: class share Speedboat 15.6 → 18.7 % [12.0–27.9], Dreadnought 42.2 → 50.5 % [40.5–60.6], Repeater 42.2 → 30.8 % [22.2–40.9] (paired +3.3 ± 11.4, +7.8 ± 14.6, −11.1 ± 13.3 pp); attrition 10.73 / 5.84 / 2.44 → 10.47 / 5.95 / 2.55 at 4:00 / 8:00 / 12:00 (paired −0.25 ± 0.40 at 4:00, +0.11 ± 0.34 at 8:00), median match 775 → 785 s.

### What each gun's bots do (base → harsh)

| | Cannon | Machine gun | Flak |
|---|---|---|---|
| Typical fighting distance (base) | standoff: 41 % of captain damage beyond half range | close: 82 % inside half range | close: 68 % inside half range, plus 15 % into own light |
| Time in "engage" posture | 52 → 54 % | 36 → 38 % | 27 → 28 % |
| Time in "disengage" + "hide" | 15 → 14 % | 24 → 23 % | 31 → 30 % |
| Kills per life (participants) | 0.887 → 0.885 | 0.847 → 0.834 | 0.784 → 0.850 |
| Drone kills per life | 12.3 → 11.9 | 9.0 → 9.2 | 8.9 → 9.2 |
| Average gun tier at end | 1.81 → 1.78 | 1.49 → 1.53 | 1.55 → 1.51 |
| Deaths to ships | 71 → 73 % | 64 → 64 % | 70 → 69 % |
| Deaths to contact (ram/grind) | 14 → 14 % | **26 → 27 %** | 21 → 21 % |
| Alive at end | 9 → 8 % | 4 → 5 % | 4 → 6 % |

Time to first kill is unmeasurable, not unmet: the per-bot raw rows carry no kill timestamps.

### Finding: the cannon's edge is survival, not kills

Cannon bots kill the **slowest** per minute alive (1.12 vs 1.30–1.46 per 10 bot-min). They win because they live about 2 minutes longer: they fight from standoff, spend the least time retreating or hiding, die to ramming least (14 % of deaths), and farm the most drones, so they level more and reach higher gun tiers. Nearly tripling the cannon's dropoff cut (7 → 20 % of its captain damage) left its kill rate unmoved (1.12 → 1.13): its slow killing comes from how it fights, not from the dropoff. The harsh setting kept the cannon's standoff identity (bots aim at the same distances; 30 %+ of its damage still lands beyond half range) and only made those long shots weaker. A ~20 % cut moved its placement by about a quarter of a place, inside error; closing a ~2-place gap by dropoff alone would need far harsher values, which were not measured.

### Finding: dropoff cannot level flak (or the machine gun)

Dropoff only lowers damage, and in bot hands it touches **under 2 % of machine-gun and flak damage** (0.3 % and 1.3 % of captain damage in `base`), because both guns land almost everything inside their knee or into their own light. Removing flak's dropoff entirely would hand it back at most about 1.5 % damage. Tighter knees for the machine gun or flak would only make those guns weaker, the opposite of the goal. Bringing flak up is a non-dropoff question; the agents proposed no numbers there, by brief.

## Proposals pending Eric

1. **Speedboat `shipClasses.torpedoBoat.hp` 250 → 300 — PENDING Eric.** Class share: Speedboat 15.6 → 20.2 %, **+4.7 pp (−6.5, +15.9), not significant** at 91 matches, and its CI (13.2–29.7 %) still sits wholly **under** the 31–35 % band; Repeater −6.3 pp n.s., Dreadnought +1.6 pp n.s. Attrition unchanged (10.8 / 6.2 / 1.8 alive at 4:00 / 8:00 / 12:00, still 2–3 hulls above target at 4:00 and 8:00). Tier null (±10.1 pp); mutual-ram draws 1 → 2.
2. **Speedboat `shipClasses.torpedoBoat.hp` 250 → 350 — PENDING Eric** (run as a bracket, not proposed by the agents; listed so Eric has the measured effect). Class share: Speedboat 15.6 → 34.9 %, **+19.3 pp (+6.8, +31.9), significant**, all three hulls consistent with the band at ±10 pp, but its CI runs up to 45.4 % so overshoot cannot be ruled out; **Repeater −15.5 pp (−29.3, −1.6), significant**, to 26.7 %, below the band by point estimate; Dreadnought −3.9 pp n.s. Attrition unchanged (10.6 / 5.6 / 2.0). Costs: Speedboat ramming deaths 28.8 → 35.9 % of its deaths, mutual-ram draws 1 → 5. Tier null (±10.1 pp).
3. **Cannon dropoff `fullFrac` 0.5 → 0.3, `minFactor` 0.5 → 0.25 (per-gun override, cannon only) — PENDING Eric.** Gun target: cannon win 9.2 → 8.1 % (−1.0 ± 3.5 pp), placement 6.98 → 7.26 (+0.28 ± 0.40), machine gun 0.0 ± 2.4 pp, flak +1.0 ± 2.5 pp: **all inside error**, the cannon still about 2 places ahead, its standoff identity intact. Class-share and attrition targets: Speedboat +3.3 ± 11.4, Dreadnought +7.8 ± 14.6, Repeater −11.1 ± 13.3 pp; alive −0.25 ± 0.40 at 4:00, +0.11 ± 0.34 at 8:00: **all inside error**. Shipping it needs the per-gun override, which exists only on the agent branch (below).

Eric rules on every number; this campaign measured only the values above.

## Open after this ledger

- **The ±5 pp confirm tier** needs about 360 matches per arm, above the 99-match-per-arm cap; confirming any value above is Eric's call to waive the cap.
- **The mutual-ram no-winner ending** (same-tick mutual ram sinks the last two; `lastHumanSunk`, no winner credited) scales with Speedboat HP and can shave real wins off the Speedboat; already in deferred-work since 2026-10-17.
- **Bots ignore the knee:** `ai/doctrine.ts` `effectiveReach().fullU` is computed but no bot code reads it (only a test), so every dropoff arm measures damage only, never players moving in to full-damage range. Humans would reposition.
- **The two failing bot bars:** ≥ 1-kill at 51–54 % against 60 %, storm share 1.1–1.5 % against a 5 % floor, in every arm. Class and gun shares remain partly decided by bot tactics.
- **The experimental per-gun override and distance-band readout are not shipped.** They live only on worktree branch `worktree-agent-a6267c1a6d0af191c`, WIP commit `8c7500fd` (11 files, +261 / −15: `gunAttenuationFor` in `shared/src/sim/attenuation.ts`, the read-only `shellBlowProbe` harness hook in `world.ts`, `--tune gunAttenuation.perGun.<cannon|mg|flak>.<fullFrac|minFactor>`, and the `deckGunAim` / `deckGunHits` readouts), not pushed, no PR. Its gate run had one wall-clock timing failure under load (`machineGunFlashCost.test.ts`, 63.3 ms vs < 50) that passed alone; reported, not called fixed.
