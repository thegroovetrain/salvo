# Bot evidence — Combat-Bot AI (Story 6-4, cycle 95, 0.17.95)

**Measured against HEAD** (`a9457c9` + this artifact), i.e. after the review gate's two blocker fixes.
An earlier draft of this file measured the wave-4 code state and was superseded outright — see
"Corrections of record" at the bottom, which is the most important section here for anyone re-reading
the numbers later.

Instrument: the batch-sim harness's **bot lobby mode** (`--bots N`), built this cycle. Shipped CONFIG
throughout — **no `--set` overrides, no zone override, no tuning of any kind.**

```
# Leg A — the headline campaign (bot-only lobby)
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50 --seed 7 --quiet

# Leg B — the same on a decorrelated seed (cross-seed check)
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50 --seed 4141 --quiet
```

Sample size: **1000 bot-matches per leg** (20 bots × 50 matches). Wall clock ~15 min per leg
in-process.

**Why `--captains 0` is the headline.** The spec writes the command as `--bots 20 --matches 50`, and
`--captains` defaults to **3** — those three are the omniscient `gunner` pilots, which read
`world.ships` directly and are not bots. Their kills would land in the same water and contaminate a
"bot-vs-bot" reading, so the headline pins captains to zero.

---

## The quality bar

| Bar | Target | Leg A | Verdict |
|---|---|---|---|
| Matches resolving before the 16:00 collapse | > 95 % | **100.0 %** | **PASS** |
| Mean per-match max single-bot kill share | ≤ 40 % | **27.7 %** | **PASS** |
| Bots scoring ≥ 1 participant kill | ≥ 60 % | **45.3 %** | **FAIL** |
| Storm deaths as a share of all bot deaths | 5–20 % | **2.7 %** | **FAIL** |
| Afloat bot-ticks in land contact | < 1 % | **1.0 %** | **PASS** (borderline) |
| Banked levels spent before death | > 90 % | **99.8 %** | **PASS** |

**These six bars are the ORCHESTRATOR'S, not Eric's.** They were proposed at the question gate
(section F1) and taken under the "take your recommendations" latitude. Two of them turn out to be
questionable as written — see the diagnosis below. A failing bar here is a finding, not a defect.

Headline totals (Leg A): 50/50 matches `fieldCleared`; match length mean 445.3 s, median 441.2 s,
max 930.9 s; 919 bot-vs-bot kills and 2,868 PvE fleet kills; 952 deaths = 919 by participant + 7 by
PvE fleet + 26 by storm; 4,248 levels earned with **7 still banked at death across 1000 bot-matches**.

---

## By profile — the story's core design claim

| profile | n | kills | pve | kill % | alive % | life s | lvl | boons | shots | dmg/shot | land % | maxRun s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bulwark | 164 | **1.85** | 4.22 | 69.5 % | **12.8 %** | 205.1 | **6.65** | 3.62 | 40.1 | 15.62 | 1.6 % | 5.8 |
| duelist | 162 | 1.36 | 2.72 | 61.7 % | 6.2 % | 143.7 | 4.45 | 2.61 | 28.2 | **15.65** | 1.3 % | 3.7 |
| siege | 177 | 1.07 | 3.54 | 54.8 % | 6.2 % | 203.0 | 5.49 | 3.34 | **46.3** | 12.05 | 0.9 % | 8.7 |
| trapper | 178 | 0.49 | 2.68 | 32.0 % | 1.1 % | 140.9 | 3.26 | 1.64 | 31.0 | 10.62 | **0.2 %** | 3.3 |
| forager | 155 | 0.45 | 2.68 | 31.0 % | 1.3 % | 140.1 | 3.17 | 1.66 | 28.5 | 10.75 | 1.0 % | 4.7 |
| raider | 164 | **0.29** | 1.33 | 22.6 % | 1.2 % | 124.2 | **2.40** | 1.00 | 20.5 | 11.74 | 0.5 % | 6.3 |

By class: battleship 1.45 kills / **34 of 50 wins**; torpedoBoat 0.83 / 12; mineLayer 0.47 / **4**.

**The profiles do play differently, and the differences are legible.** `siege` fires the most shots
at the worst damage-per-shot (standoff, as designed); `duelist` matches `bulwark`'s marksmanship on
70 % of the shots; `trapper` spends the least time near land. That part of the design works.

**Two of Eric's C-rulings are NOT borne out by the numbers, and this survived the grounding fix.**
Both were visible before the fix and are unchanged after it, so neither is an artifact of the defect:

1. **`raider` is the weakest profile in the game** — 0.29 kills, 22.6 % survival, 1.2 % win rate,
   and the lowest level reached (2.40). The C1 hit-and-run torpedo opener is not landing: a 30 s
   reload against a 4 s flight time and a manoeuvring target is a poor trade, and the profile spends
   its cheapest weapon time disengaging.
2. **`forager` does NOT out-level the field off PvE fleets** — the C3 claim. It takes 2.68 PvE kills
   and reaches level 3.17, while `bulwark` takes **4.22** and reaches **6.65**. The battleship is
   out-farming the mine layer at the mine layer's own job, because it survives ~65 s longer per life
   and the gun is what actually clears fleet hulls.

**Nothing was tuned in response.** Adjusting profile weights or engagement bands to move these
numbers is a balance decision reserved to Eric, and doing it in the same cycle that produced the
measurement would destroy the measurement's value. This is the evidence for that conversation.

---

## The two failing bars, diagnosed

**Bots scoring ≥ 1 kill — 45.3 % vs a 60 % bar.** Structurally tight: a 20-bot match yields at most
19 participant kills, so even a perfectly even distribution tops out near 95 %, and any concentration
pulls it down fast. The measured concentration is real and is the same finding as the profile table —
`bulwark`/`duelist`/`siege` take 1.07–1.85 kills each while `raider`/`forager`/`trapper` take
0.29–0.49. **The bar is measuring profile balance, not bot competence**, which is not what it was
written to measure. Recommend re-deriving it (or replacing it with a per-profile floor) rather than
tuning bots to satisfy it.

**Storm deaths — 2.7 % vs a 5–20 % band.** Bots are lethal to each other: 919 of 952 deaths are
participant kills, and only **2.0 %** of matches reach the endgame ring at all, at a 441 s median.
The band assumed matches would routinely run long enough for the ring to bite; they do not, because
the bots resolve the field first. Ring escape IS exercised (26 storm deaths, and the ring-escape path
is unit-pinned as dominating all other steering). **This reads as decisive matches, not ring
blindness** — arguably the bar is wrong rather than the bots.

---

## Corrections of record — read this before trusting any older bot number

Three measurements in this project's history of Story 6-4 are now superseded, and each was wrong for
a reason worth keeping:

1. **"0.00 % land contact" (wave 3's end-to-end test) was an artifact.** Its covering test hand-set
   `speed = 0` to simulate grounding, under a comment asserting the grounding damp "caps a beached
   hull low." It caps it **high** — `maxSpeed × 0.25` = 8.75–11.25 u/s, 3–4× above the 3 u/s stuck
   trip, so the entire un-beach path was unreachable dead code. Real figure at the time: **10.3 %**,
   with a longest unbroken contact run of **552.6 s** — longer than a median match.
2. **The first version of this file measured deleted code.** It documented the `STUCK_SPEED` dead-code
   narrative and asserted `landContact` was "never stored" — both false at HEAD. The review gate
   called this a blocker, correctly: four of six bars had no evidence against the code that would
   ship.
3. **Every bot number taken before the cadence fix understates radar-driven behaviour.** Until the
   review gate, bots observed 1 tick in 5 and radar blips live for exactly one tick, so ~80 % of
   paints were dropped — and it **resonated** (15 rpm = 80 ticks, 80 ≡ 0 mod 5), so a bot could be
   *permanently* blind to a hull a human saw every 4 s. Measured: 30 paints vs **0**. `siege`'s
   standoff band and its stale-track star-shell flare were running on truesight contacts almost
   entirely.

Land contact across those three states: **10.3 % → 8.0 % → 1.0 %**, longest unbroken run
**552.6 s → 272.2 s → 8.7 s**.

---

## What this does NOT prove

- **No human has played against these bots.** This is a headless in-process simulation with no human
  in the loop; the project's standing convention is that harness numbers are lower bounds and that
  no eye-on-the-water claim is ever made from a sim. Whether a bot *reads* as a competent captain —
  the story's actual ask, *"appear to know how to play"* — is unmeasured and unmeasurable here.
- **Nothing in production constructs a bot** (Eric ruling A1), so none of this has been exercised
  through a real room, a real socket, or the client. Story 6-5 is the first time any of it is
  player-facing.
- **Land contact 1.0 % against a `< 1 %` bar is borderline**, and the metric is a geometric proxy
  (hull silhouette within 1 u of a coastline) that over-counts by construction. It is the same proxy
  used for every leg, so the 10.3 → 1.0 trend is like-for-like, but the absolute figure is
  pessimistic and the bar is effectively met at the noise floor rather than cleared.
- **Single-seed profile rankings are indicative, not settled.** Leg B is a cross-seed check on the
  aggregate bars; a balance decision on `raider` or `forager` deserves its own campaign.
- **`--bots 0` and `--bots N` runs are not seed-comparable.** `addBot` places through `pickSpawn`,
  which draws from the shared world RNG, so bot count shifts later PvE fleet-wave anchors for the
  same seed — exactly the class of RNG-stream shift epic-6 amendment 19 ledgered for captains.
  Captains consume identically, so a bot lobby *is* comparable to a captain lobby of the same size.
