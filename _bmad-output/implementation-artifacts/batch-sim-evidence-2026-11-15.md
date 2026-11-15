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
