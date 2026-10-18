# Bot posture workover — Story 9.13 before/after ledger (2026-10-17)

**What was run (Eric, amendment 203):** three arms of **48 matches** each (12 shards × 4, 16 bots, even roster, `--raw`, seed **20261017** so every arm plays the same maps and seeds), run by an Opus agent: `base913` on the untouched tree (f78405d1), an interim `after913` on the pre-review tree (076d3d80, superseded — kept here because it shows what the review-gate patches changed), and `final913` on the shipped tree (b32037fd). Shards: `~/hc-campaigns/bots-9-13/<label>-shard00..11.json`. No CONFIG was changed between arms; the sim measured bot behaviour only (guns are Eric's math, never the sim's).

**Validity.** 48 matches is below the coarse ±10 pp tier (±13.6 pp measured), so **class share is not a verdict** anywhere in this ledger. Per-bot rates rest on 768 bot-lives per arm. The baseline's median match ended before 12:00, so its 12:00 figure is unmeasurable, not unmet; both after arms reach the final cycle. Readings are paired on identical seeds; no CI was computed on the deltas (bot-level counts, within-match clustering ignored, as the earlier ledgers say).

## Attrition (Eric's target ~8 / 4 / 2 alive at 4:00 / 8:00 / 12:00)

| Arm | Alive 4:00 | 8:00 | 12:00 | Matches reaching | Median match | Ended by |
|---|---|---|---|---|---|---|
| base913 | 8.44 | 3.50 | 0.92 | 48 / 47 / 20 | 667.6 s | fieldCleared 47, lastHumanSunk 1 |
| after913 (interim) | 10.08 | 5.69 | 1.88 | 48 / 48 / 40 | 769.8 s | fieldCleared 48 |
| **final913** | **10.31** | **5.62** | **1.88** | 48 / 48 / 35 | **771.4 s** | fieldCleared 47, lastHumanSunk 1 |

Bots that no longer die on land live longer: the field is now ~2 hulls ABOVE Eric's 4:00 and 8:00 targets (was below). That is a pacing dial for Eric, not this story's (no weapon or storm number moved). The one `lastHumanSunk` ending in a bot-only match (base seed 3675787743, final seed 1024203792: no winner, nobody afloat at the end) is a harness/match-end oddity recorded in deferred-work.

## The six bot bars

| Bar | base913 | after913 | final913 | Result (final) |
|---|---|---|---|---|
| Resolution > 95 % | 48/48 | 47/48 | 48/48 | PASS |
| Max single-bot kill share ≤ 40 % | 28.2 % | 25.6 % | 25.2 % | PASS |
| Bots with ≥ 1 kill ≥ 60 % | 338/768 = 44.0 % | 52.7 % | 408/768 = 53.1 % | FAIL (improving) |
| Storm share of deaths 5–20 % | 30/723 = 4.1 % | 1.7 % | **6/722 = 0.8 %** | FAIL — the bots now beat the storm almost always; the bar's floor is a design question for Eric |
| Land-contact ticks < 1 % | 252,667/4,703,669 = **5.37 %** | 1.08 % | **48,769/5,936,129 = 0.82 %** | **PASS — first time on the 10 % archipelago** (the 2026-10-08 open thread) |
| Levels spent > 90 % | 99.9 % | 99.9 % | 99.96 % | PASS |

## Deaths and grounding

| | base913 | after913 | final913 |
|---|---|---|---|
| Deaths (ship / fleet / ram / **run aground** / storm) | 445 / 2 / 94 / **152** / 30 (723) | 507 / 3 / 174 / 28 / 12 (724) | 534 / 3 / 166 / **13** / 6 (722) |
| Land damage per bot-match | 99.9 hp | 23.5 | **15.7** |
| Ram damage per bot-match | 13.8 hp | 28.1 | 28.5 |
| Sim `landContact` ticks (new readout) | — | 0.84 % | **0.69 %** (40,794) |
| Stuck episodes (≥ `stuckMs`) | — | 890 (BS 625 / ML 116 / TB 149) | **612** (BS 245 / ML 147 / TB 220) |
| Longest single aground run | 30.4 s | **390.7 s** (MOONRAKER, siege battleship, seed 1026202030 — wedged in a notch, storm death) | **64.2 s** (CORSAIR, a proxy-only graze: 0 episodes); next 60.7 s (ASTROLABE, 24 episodes, ran aground) |
| Storm deaths while aground or outside the ring | — | 11/12 | 6/6 (0 aground) |
| Ticks outside the live ring | — | 1.07 % | **0.53 %** |
| Bot-on-bot kills / PvE kills | 520 / 6,023 | 644 / 7,651 | 674 / 7,581 |

Per class land contact (base → final): battleship 8.78 → **0.89 %**, mine layer 3.89 → 0.58 %, torpedo boat 2.17 → 1.02 %. Storm deaths: BS 21 → 3, ML 5 → 2, TB 4 → 1. Stuck episodes rose for the torpedo boat (149 → 220) and the forager profile (93 → 211) between the two after arms — short grazes, not pins (no run over 61 s) — recorded for the next helm pass.

**The three replayed wedges (final arm):** MOONRAKER (1026202030) was alive at the end (867.8 s), 0 stuck episodes, longest run 2.0 s (was 390.7 s and a storm death); DOLDRUM (1027432045) lived 463 s and was sunk by a ship, 0 episodes (was aground at 274 s); CROWSNEST (3676774083) lived 429 s, sunk by a ship, 0 episodes, 0 grounded ticks (was 40 episodes). The two skipped unit fixtures (MOONRAKER 56.9 u / CROWSNEST 13.2 u at 30 s in isolation, re-entering the bay on the patrol route) did not reproduce in the campaign because the live match gave those bots a target; the fixtures stay skipped with their numbers (deferred-work 2026-10-17).

## Per profile and per gun (alive rate / land % / storm deaths / kills; base → final)

| Profile | n | Alive | Land % | Storm | Kills |
|---|---|---|---|---|---|
| raider | 124 | .065 → .040 | 6.07 → 1.04 | 9 → 1 | 76 → 125 |
| duelist | 152 | .099 → .033 | 5.43 → 0.97 | 2 → 1 | 133 → 116 |
| bulwark | 148 | .054 → .068 | 5.33 → 0.65 | 5 → 3 | 112 → 135 |
| siege | 114 | .009 → .088 | 5.34 → 0.36 | 4 → 0 | 65 → 115 |
| forager | 109 | .055 → .110 | 5.92 → 1.49 | 7 → 0 | 63 → 116 |
| trapper | 121 | .058 → .033 | 3.96 → 0.55 | 3 → 1 | 71 → 67 |

| Gun | n | Alive | Land % | Storm | Kills |
|---|---|---|---|---|---|
| cannon | 247 | .036 → .073 | 4.96 → 1.34 | 6 → 3 | 138 → 227 |
| flak | 274 | .088 → .047 | 5.49 → 0.29 | 12 → 1 | 231 → 221 |
| machine gun | 247 | .049 → .061 | 5.61 → 0.71 | 12 → 2 | 151 → 226 |

Class share (NOT a verdict, n = 47 resolved): base BS 40.4 / ML 42.6 / TB 17.0 → final 38.3 / 40.4 / 21.3 (95 % CIs ≈ ±14 pp; no delta significant).

## What the bots did (final arm; the new readouts, no bars)

- **Posture share of afloat ticks:** engage 41.0 %, disengage 14.1, reposition 8.5, hide 8.4, hold 7.7, pursue 7.6, ringRun 6.2, farm 3.7, kite 2.1, ram 0.8. Transitions: opened 10,926; brokenOff 8,332; hid 6,085; kited 1,919; rammed 727; held 325.
- **Fog:** 23.3 % of ticks in solid fog (the field covers 20–25 % of the ring).
- **Kills by source (674):** burst 202, contact 134, torpedo 131, mine 102, shell 85, burn 14, grind 6. Contact (ram + grind) is a fifth of kills — Eric reads this beside the `[DRAFT]` ram trigger (amendment 77) on staging.
- **Decoys:** 2.58 % of gun shells aimed at a decoy (2,139/82,809), 338 at an OWN decoy (a plot still inside the exclusion fuzz; was unmeasured before).
- **Flare-to-shoot:** 15.1 % of deck-gun shells fired into an own lit zone (12,530); 4,664 star shells.
- **Specials (activations):** star zones 4,655, HUNKER 2,853, phosphor 2,239, boost 1,814, heals 1,417, countermeasure 1,361, foul zones 1,255, shields 1,124. Presses by item leave 3,273 of 10,278 as 'empty' (a last-copy press cannot be attributed — harness gap, deferred-work).
- **Endgame:** the last-two phase lasts a median 86.6 s per match (5–347 s); the longest gap with no hit on either survivor is a median 19.0 s (3–202 s). Eric's "the other one is stuck on an island" case: 0 storm deaths aground in the final arm.
- **Drones:** grounded ticks 670,292 over 48 matches (median 13,025 per match, ~4 s per drone-life); drone storm deaths 319 (median 6). Routing did not move these numbers — the next drone pass has its baseline here.

## Open after this ledger

Storm share at 0.8 % against a 5 % floor (the bar predates bots that leave in time — Eric's call whether the bar or the storm moves); ≥ 1-kill at 53 % against 60 %; the field ~2 hulls above the 8 / 4 targets; ram deaths doubled from the baseline; drone grounding unchanged; the two isolated wedge fixtures. All in `deferred-work.md` 2026-10-17.
