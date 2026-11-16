# Baseline under the four hulls, and the supercav question (2026-11-15)

**Why it was run (Eric, /balance-sim, 2026-11-15):** "the game has massively changed since the last time we really ran this. I feel like supercav torpedoes are *way* too strong … We need a solid baseline for what ship classes and what weapons and upgrades are performing the best." Tree: `development` at dfbf254b (0.19.28, PV 108, after Story 11.6). No CONFIG number moved; this is a measurement, nothing was proposed into code.

**What was run.** Two arms of **91 matches** (the ±10 pp tier; Eric's ≤ 99-a-arm cap), 12 shards, **16 bots** (`CONFIG.map.playerCap`), even roster (4 of each hull a match), `--raw`.

| Arm | Spend policy | Base seed | Use |
|---|---|---|---|
| `shipped` | the bots' shipped per-personality picks | 1 | hull win share, attrition, bot bars |
| `randomSpend` | `--bot-spend random` (uniform picks) | 500 | per-line effect: a line is owned at random, so its effect is not a personality's |

Command: `run_campaign.py --matches 91 --shards 12 --bots 16 --base-seed <S> --label <arm> --extra --roster even --raw --quiet [--bot-spend random]`. Shards and the analysis script (`lines.py`) live in `~/hc-campaigns/baseline-2026-11-15/`. The `shipped` shards carry the label `baseline` (their launcher was killed by a timeout; the workers finished and wrote valid reports — 91 matches, 16 bots, even roster, verified per shard). `analyze_campaign.py` still assumes three classes (2026-11-11 ledger), so every number below is from `lines.py`.

**Runs thrown away (do not reuse):** a first pair at **20 bots** (the runner's default, wrong for a 16-cap ocean) in `$CLAUDE_JOB_DIR` only, discarded unread for attrition and balance. Harness lessons in the last section.

## The supercav, from the code (exact, not sampled)

Every hull is 1000 hp. Damage × `damageMultiplierFor(victim ARMOR − attacker POWER)`, K = 100; when POWER exceeds ARMOR the multiplier is (K − 2E)/(K − E), up to ×2. Supercav damage is 400 / 500 / 600 / 700 / 800 by tier; POWER is +20 a tier on the hull's seed (Yamato 140).

| Attacker → victim | Multiplier | Tier V hit | Tier V that stays < 1000 | Tier V that stays < 500 |
|---|---|---|---|---|
| Yamato bare (POWER 140) → Iowa (ARMOR 85) | ×1.355 | **1083** | 737 | 368 |
| Yamato bare → Warspite (100) | ×1.286 | **1028** | 776 | 388 |
| Yamato POWER V (240) → Iowa | ×1.608 | **1286** | 621 | 310 |
| Yamato POWER V → Bismarck (120) | ×1.545 | **1236** | 646 | 322 |
| Yamato POWER V → Yamato ARMOR V (230) | ×1.091 | 872 | 915 | 457 |

Eric's example holds with no POWER at all: a bare Yamato's Tier V supercav deletes a full Warspite or Iowa in one hit. With two POWER tiers, Tier IV (700) already does 1011 to Warspite.

## Hull win share (parity 25 %; 91 matches an arm; Wilson 95 %)

| Hull | `shipped` win | `shipped` mean place | `randomSpend` win | pooled (182) |
|---|---|---|---|---|
| Bismarck | 31.9 % [23.2, 42.0] | 7.90 | 18.7 % [12.0, 27.9] | 25.3 % |
| Yamato | 24.2 % [16.5, 33.9] | 8.42 | 30.8 % [22.2, 40.9] | 27.5 % |
| Warspite | 24.2 % [16.5, 33.9] | 8.54 | 20.9 % [13.8, 30.3] | 22.5 % |
| Iowa | 19.8 % [12.9, 29.1] | 9.15 | 28.6 % [20.3, 38.6] | 24.2 % |

**No hull verdict.** Every interval in both arms contains 25 %, and the leader flips between arms (Bismarck → Yamato), which is what ±10 pp noise looks like. Pooling two different spend policies is indicative only. The skill's "31–35 %" band was written for three classes and is stale; the four-hull band is Eric's to restate. One `randomSpend` match ended with no winner (mutual sink).

## Attrition pacing (exact: per-bot life from `--raw`, ring closes 4:00 / 8:00 / 12:00 from `CONFIG.zone`)

| Alive at | target (half per ring) | `shipped` | `randomSpend` |
|---|---|---|---|
| 0:00 | 16 | 16 | 16 |
| 4:00 | ~8 | **13.10** | **13.62** |
| 8:00 | ~4 | 5.93 | 6.78 |
| 12:00 | ~2 | 1.40 (35 of 91 already over) | 2.11 (17 over) |
| median end | — | 12:16 | 13:05 |

Ring 1 kills ~18 % (target 50 %); ring 2 is on target; ring 3 overkills and many matches are over before 12:00. The 12:00 reading is measured (all matches reach 8:00; ended matches count as 0 alive at 12:00, not missing).

## Bot quality bars

`shipped`: all four PASS (collapse resolution 100 %, max kill share 25.6 %, land contact 0.9 %, levels spent 99.9 %). `randomSpend`: land contact **FAIL 1.5 %** (bar < 1 %), the rest pass. The land bar is navigation, not combat; the supercav signal below also appears in the all-pass `shipped` arm, so it does not rest on the failing arm alone — but the `randomSpend` per-line table is read with that caveat.

## What performs best: per line (landmark regression)

Method: bots alive at the landmark; each line's tiers owned *by that time*; outcome = final placement as a percentile (1 = winner, 0 = first out); linear fit with hull controls; 95 % CI from 300 bootstrap resamples **by match**. "Per tier" is the effect of one more tier. Landmarking removes most of the "long-lived bots own more of everything" bias; it does not remove all of it. Lines whose CI excludes zero are bold.

**`randomSpend` (the fair comparison), alive at 4:00 — 1239 bots:**

| Line | per tier | 95 % CI | holders |
|---|---|---|---|
| **supercavTorpedo** | **+8.1** | **[+4.2, +12.2]** | 234 |
| secondMineRack | +5.0 | [−0.6, +10.6] | 90 |
| phosphorShells | +3.0 | [−0.3, +6.3] | 227 |
| armor | +2.7 | [−0.5, +6.0] | 370 |
| foulingMines | +2.6 | [−1.5, +6.8] | 232 |
| … every other line | −4.3 … +1.6 | all include 0 | |
| dazzleShells (lowest) | −3.5 | [−7.1, +0.6] | 195 |
| expandedMineRacks | −4.3 | [−10.4, +3.4] | 72 |

**`randomSpend`, alive at 8:00 — 617 bots:** **supercavTorpedo +2.7 [+0.6, +4.7]**, **phosphorShells +2.3 [+0.2, +4.4]**, **armor +1.9 [+0.5, +3.5]**; all others include 0 (lowest: navalMines −1.5, heavyTorpedo −1.4).

**`shipped`, alive at 4:00:** **phosphorShells +7.2 [+4.4, +10.0]**; supercav +2.6 [−0.1, +5.6]. **At 8:00:** 14 lines significant at +1.7 … +4.2 (secondLauncherTube, heavyTorpedo, armor, phosphor, mines, supercav +2.6 [+1.2, +4.0]) — in the shipped arm a line's owners are a personality, so these read as "this build's bots do well", not "this line is strong".

**Supercav by final tier (descriptive, survivorship-biased):** `randomSpend` win rate 3.7 % at tier 0 (n 1086), 4.9 % tier I (204), **19.0 % tier II** (105), **34.9 % tier III** (43); parity in a 16-ship lobby is 6.25 %. Damage dealt 2118 → 3655 → 4199.

**Kills by source** (`shipped` / `randomSpend`): burst 516 / 603, **torpedo 481 / 374**, shell 103 / 100, burn 87 / 58, mine 67 / 64, ram 24 / 42. The `torpedo` tag does not split heavy / light / supercav.

## Readings

1. **The supercav is the strongest line in the game, measured two ways.** By the code, a Tier V hit one-shots every full hull except an ARMOR-V Yamato. In play, with picks randomized, it is the only line with a significant 4:00 effect and its effect is ~2.7× the next line's; it stays first at 8:00.
2. **Hulls are not separable at this precision.** No hull is outside parity in either arm.
3. **Ring 1 is too quiet, ring 3 too fast.** About 3 of 16 die before 4:00.
4. **Phosphor shells and ARMOR are the next-strongest lines**; nothing measured is significantly harmful.

## Proposals (pending Eric — nothing measured for any candidate value)

| # | Dial | Current → candidate | Evidence | Blast radius / cost |
|---|---|---|---|---|
| P1 | `supercavTorpedo` damage ladder (sim/catalog.ts, epic-10 amendment 8(e)) | 400 → 800 → **his number**; the table above gives the Tier V that keeps the worst hit under 1000 (621–776) or under 500 (310–388) | code-exact one-shot table; `randomSpend` +8.1 / tier at 4:00 | supercav only; it is a torpedo-slot pick on every hull, so relative hull balance moves only second-order. **Unmeasured** — `--tune` cannot reach `supercavTorpedo.*` (harness gap H1) |
| P2 | `supercavTorpedo.reloadMs` | 45 s → his number | same | supercav only; lowers rate, not the one-shot — does not answer Eric's complaint by itself |
| P3 | ring-1 pacing (zone or engagement dials) | — | 13.1 alive at 4:00 vs ~8 | every hull; **no dial measured**; a design question before a number |

No proposal on hulls: nothing is outside parity.

## Harness gaps found (open threads, not fixed here)

- **H1** `--tune` has no `supercavTorpedo.*` (nor `lightTorpedo.*` / `phosphorShells.*`) family — candidate supercav values cannot be A/B'd.
- **H2** `run_campaign.py` defaults to `--bots 20`; the lobby is 16. Pass `--bots 16`.
- **H3** A timeout that kills `run_campaign.py` orphans the `tsx` workers (they keep running and write label-less `baseline` reports). Bound runs ≥ 60 min at 12 shards × 8 matches and clean up workers on exit.
- **H4** `killsBySource.torpedo` does not split the three torpedo kinds; the catalog damage ledger (one-hit kills in play) is not emitted for bot lobbies.
- **H5** `analyze_campaign.py` still assumes three classes.

## Rulings

*(Eric's line-by-line rulings go here.)*

- **2026-11-15, Eric (in place of P1/P2): "For damage on all weapons … each Tier grants +10 power that *only* applies to that weapon. +10 or +15 … Lets try that and see how that goes, and if that reigns in supercavs. … I'd like everything to have its niche, and at least for there not to be a 'bad choice' among all the weapons in a particular category."** Built as an experiment (below); not merged.

## Experiment: WEAPON POWER per tier (2026-11-15, same day)

**Mechanism (branch `experiment-weapon-power`, 817a91a3, not merged, no PR):** every weapon damage ladder removed — light / heavy / supercav torpedo, naval / captive / fouling mines, star and phosphor shells (burst and burn) stay at their Tier I base. At the server damage gate, E = victim ARMOR (+ HUNKER) − (attacker POWER + `CONFIG.armor.weaponPowerPerTier` × (that weapon's tier − 1)), the weapon's tier read live at impact like POWER. Reading made by the implementer and not yet confirmed by Eric: **Tier I adds nothing; tiers II–V add the step** ("the weapon's power from upgrades"). Non-damage tier effects (run, speed, homing, blast, zone, lit time) unchanged. The client still shows row damage (the Tier I base) — not updated, an experiment only.

**Code-exact Tier V torpedo hits (all hulls 1000 hp):**

| Hit | today (800 / 600 / 400) | +10 a tier | +15 a tier |
|---|---|---|---|
| Yamato bare → Warspite: supercav / heavy / light | **1028** / 771 / 514 | 577 / 433 / 288 | 600 / 450 / 300 |
| Yamato POWER V → Iowa (worst case) | **1286** / 964 / 643 | 664 / 498 / 332 | 673 / 504 / 336 |

No torpedo one-shots any hull at either step. The ratio between the three torpedoes is unchanged at every tier (the bases 400 : 300 : 200 are multiplied by the same curve).

**Arms:** `wp10`, `wp15` — 91 matches each, 16 bots, even roster, `--bot-spend random`, base seed 500 (**the same seeds as `randomSpend`**, so maps and spawns are paired), `--tune armor.weaponPowerPerTier=10|15`. Shards: `~/hc-campaigns/weapon-power-2026-11-15/`. Analysis: `category.py` (new) + `lines.py`.

**Within-category gap to the category's best** (OWNS-the-weapon landmark regression, hull + total-tiers controls, placement percentile points, 95 % match bootstrap; bold = CI excludes 0):

| Gap (4:00 / 8:00) | `randomSpend` (today) | `wp10` | `wp15` |
|---|---|---|---|
| heavy vs supercav | **−10.5 / −8.1** | **−9.1 / −6.3** | **−6.3 / −4.8** |
| light vs supercav | **−10.4 / −6.6** | **−10.8 / −8.0** | **−9.0 / −5.4** |
| worst shell vs phosphor | **−7.4** (flash) / **−5.1** (fouling) | **−5.7** (flash) / **−5.5** (fouling) | **−7.8** (flash) / **−5.5** (star) |
| naval mines vs best mine | −2.2 / **−2.8** | **−3.8 / −3.7** | −3.3 / **−3.7** |

| Other readings | `randomSpend` | `wp10` | `wp15` |
|---|---|---|---|
| Alive at 4:00 / 8:00 / 12:00 | 13.62 / 6.78 / 2.11 | 13.59 / 7.02 / 2.19 | 13.62 / 6.99 / 2.27 |
| Yamato / Bismarck / Warspite / Iowa win % | 30.8 / 18.7 / 20.9 / 28.6 | 28.6 / 19.8 / 26.4 / 25.3 | 30.8 / 28.6 / 29.7 / **11.0 [6.1, 19.1]** |
| Kills by torpedo (of all) | 374 | 360 | 354 |
| Land-contact bar (< 1 %) | FAIL 1.5 % | FAIL 1.6 % | FAIL 1.3 % |

**Readings.**
1. **Weapon power ends the one-shot** (code-exact) and does not move attrition.
2. **It does not end supercav's lead in the torpedo slot.** The gap is largest at 4:00, when almost every holder is still Tier I — so the lead comes from the weapon's own Tier I kit (400 damage, 195 u/s straight runner, 45 s reload; heavy 300, light 200), not from its ladder. +15 narrows the gap a little; it does not close it.
3. **Phosphor still leads the shell slot**, and naval mines trail the mine slot slightly in every arm.
4. **Iowa at +15 (11.0 %) is the only hull interval all day outside 25 %** — one of twelve hull readings across the three arms; Iowa has the lowest ARMOR (85), so a mechanism is plausible, but it is unconfirmed until a second arm repeats it.

**Not measured:** any change to a weapon's Tier I numbers. `--tune` still cannot reach `lightTorpedo.*`, `supercavTorpedo.*`, `starShells.*`, `phosphorShells.*` (gap H1); `torpedo.*` is the heavy line's.
