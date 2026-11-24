# Batch-sim evidence 2026-11-24 — torpedo and phosphor damage cuts; hull win share

Eric-approved in chat (2026-11-23: "Run two bot experiments … Feel free to run a baseline experiment"; 2026-11-24: "you can run a slightly longer sample size … Then I would like you to run some experiments on the ship class stats").

Every arm: `/balance-sim` `run_campaign.py --bots 16 --shards 12 --extra --roster even --raw` (16 bots, 4 hulls × 4 per match, exactly even). Win share is Wilson 95 %; a fair hull share is 25 %, a fair per-bot (loadout) win rate 1/16 = 6.3 %. Bot quality bars: all four PASS in every shard except "afloat bot-ticks in land contact", which failed marginally (just over 1 %) in 1 / 3 / 2 of 12 shards of the three 2026-11-23 arms and 0 / 12 of the 2026-11-24 baseline. Median matches end at ~650–680 s, before the 12:00 ring cycle, so late-cycle attrition is unmeasurable, not unmet.

## 1. Torpedo damage (2026-11-23, `development` b01a9113, 99 matches each, seed 1)

| arm | heavy / light / supercav | kills / match | torpedo share of kills | median match s | alive at 4:00 / 8:00 | Yamato / Bismarck / Warspite / Iowa win % |
|---|---|---|---|---|---|---|
| baseline | 300 / 250 / 300 | 14.4 | 26.2 % | 646 | 10.1 / 3.3 | 40.4 / 20.2 / 20.2 / 19.2 |
| −50 | 250 / 200 / 250 | 14.2 | 20.9 % | 639 | 10.3 / 3.6 | 31.6 / 29.6 / 18.4 / 20.4 |
| −100 | 200 / 150 / 200 | 14.3 | 17.4 % | 642 | 10.3 / 3.5 | 31.3 / 27.3 / 23.2 / 18.2 |

Reading: the cut moves kills from torpedoes to the main battery (burst 54 → 58 → 59 %) without changing deaths per match or pace. No hull move is significant at n = 99 (Yamato −9 pp, CI [−22, +4]). **Accepted:** Eric ruled −100 (epic-12 amendment 21).

## 2. Phosphor shells (same three arms, then the post-change baseline)

| arm | phosphor win % [95 % CI] | dmg / bot (phosphor vs star / fouling / flash) | kills / bot (phosphor vs others) |
|---|---|---|---|
| 2026-11-23 baseline | 12.1 [9.1, 15.8] | 2871 vs 2142 / 1800 / 1774 | 1.55 vs 0.70–0.83 |
| −50 torpedo | 15.3 | 2899 vs 2104 / 1805 / 1808 | 1.45 vs 0.72–0.82 |
| −100 torpedo | 15.2 | 2926 vs 2091 / 1786 / 1801 | 1.54 vs 0.71–0.81 |
| **2026-11-24 baseline (burst 30, burn 12/s)** | **10.7 [8.7, 13.3]** | 2676 vs 2213 / 1983 / 1863 | 1.29 vs 0.76–0.87 |

Phosphor led on every hull in the 2026-11-23 baseline. **Accepted:** Eric ruled burst 30 + burn 12/s (amendment 21). After the cut it is still the top special shell (10.7 % vs star 3.4, fouling 7.3, flash 5.2) — proposal in §4.

## 3. Hull win share (2026-11-24, branch `worktree-torp-phosphor-cut` = amendment 21 applied, seed 7 unless noted)

| arm | n | Yamato | Bismarck | Warspite | Iowa | median s |
|---|---|---|---|---|---|---|
| baseline | 198 | 31.1 (25–38) | 28.6 (23–35) | 24.5 (19–31) | **15.8 (11–22)** | 676 |
| Iowa ENGINES 120 → 130 | 99 | 33.3 (25–43) | 26.3 (19–36) | 21.2 (14–30) | 19.2 (13–28) | 663 |
| **Iowa INTEL 115 → 125** | 99 | 24.2 (17–34) | 24.2 (17–34) | 25.3 (18–35) | **26.3 (19–36)** | 656 |
| Iowa ARMOR 95 → 105 | 99 | 27.3 (19–37) | 23.2 (16–32) | 27.3 (19–37) | 22.2 (15–31) | 653 |
| Yamato POWER 140 → 130 | 99 | 31.6 (23–41) | 23.5 (16–33) | 24.5 (17–34) | 20.4 (14–29) | 664 |
| Iowa INTEL 125 confirm (seed 1000) | 198 | 29.3 (23–36) | 32.3 (26–39) | 24.2 (19–31) | **14.1 (10–20)** | 675 |
| Iowa ARMOR 105 confirm (seed 1000) | 198 | 29.4 (24–36) | 28.4 (23–35) | 23.9 (18–30) | **18.3 (14–24)** | 678 |

ARMOR 105 pooled over both seeds (n = 297): Iowa ≈ 19.6 % — a real but small lift (~+4 pp), not enough alone.

**The INTEL 125 arm did not replicate:** 26.3 % on seed 7 (n = 99), 14.1 % on fresh seeds (n = 198) — the first reading was noise. Lesson for the next agent: a 99-match arm (±9 pp per hull) cannot judge a single-stat hull change of this size; screen with 198+ on fresh seeds before believing one.

Baseline per-hull: Iowa deals damage at the same rate as the others (353 dmg/min vs 342–347) but dies first (mean life 346 s vs 383–385 for Yamato / Bismarck), is the least often afloat at the end (29 vs 45–58) and is sunk by contact most (36). Its deficit is survival, not firepower. Yamato POWER 130 did not move Yamato (31.6 %): POWER is not what makes Yamato win.

Stat candidates follow Eric's 2026-11-24 grid rule (steps of 10, 5 at finest).

## 4. Proposals (not ruled)

Ranked by measured effect. None ruled yet.

1. **Iowa ARMOR 95 → 105** — measured +4 pp (n = 297 pooled). Off-theme but the direct fix for its measured deficit (dies first). Not enough alone.
2. **Iowa ARMOR 105 + ENGINES 130 together** — UNMEASURED as a pair; each alone read about +3–4 pp (engines only n = 99). The on-theme half is ENGINES (fastest hull).
3. **Yamato / Bismarck at ~29–31 %** — POWER 130 did not move Yamato. Untested levers: Yamato RELOAD 70 → 60 or ENGINES 85 → 75 (its ARMOR must stay the highest, and POWER the biggest, by theme). UNMEASURED.
4. **Phosphor still top at 10.7 %** — untested candidates: burn 12 → 10 hp/s, or reload 20 → 25 s. Star shells are now the weakest special shell (3.4 %). UNMEASURED.

**Ruled after this ledger (Eric 2026-11-24):** phosphor burst 20 + burn 10/s (Tier I ceiling about 100), superseding 30 / 12 before landing. Not yet measured by its own campaign.

Rejected / not to re-propose without new evidence: Iowa INTEL 125 (did not replicate, n = 198: 14.1 %); Yamato POWER 130 (no effect, n = 99).
