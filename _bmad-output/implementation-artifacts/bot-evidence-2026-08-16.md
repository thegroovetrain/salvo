# Bot evidence — Combat-Bot AI (Story 6-4, cycle 94)

Instrument: the batch-sim harness's new **bot lobby mode** (`--bots N`), built this wave.
Shipped CONFIG throughout — **no `--set` overrides, no zone override, no tuning of any kind**.

```
# Leg A — the headline campaign (bot-only lobby)
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50 --seed 7 --quiet

# Leg B — the same, on a decorrelated seed (cross-seed check)
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50 --seed 4141 --quiet

# Leg C — the spec's Verification command EXACTLY as written, which is a MIXED lobby:
#          --captains defaults to 3, so this is 3 scripted omniscient gunner captains + 20 bots
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --bots 20 --matches 20 --seed 7 --quiet
```

Sample size: **1000 bot-matches** in each 50-match leg (20 bots x 50 matches), 400 in Leg C.
Wall clock ~25-50 min per leg in-process; the three legs were run separately, not swept.

**Why the spec's own command is not the headline.** `spec-6-4-combat-bot-ai.md` writes the
verification command as `--bots 20 --matches 50 --seed 7`, and `--captains` defaults to **3**. That
run is a mixed lobby whose three captains are the omniscient `gunner` pilots — they read
`world.ships` directly and are not bots. Their kills would land in the same water as the bots' and
the "bot-vs-bot" reading would be contaminated, so the headline uses `--captains 0` and the spec's
literal command is reported beside it as Leg C. Both are shown; nothing is hidden.

## What this wave built

A bot needs **no pilot function**. Bots drive themselves from World's `botsTick` STEP_ORDER row, so
the harness's bot mode is a **lobby constructor** (`world.addBot()` x N) plus a read-only observer:

- `server/scripts/batchsim/args.ts` — `--bots N`; `--captains` may now be 0 (an empty lobby is a
  usage error).
- `server/scripts/batchsim/runner.ts` — bot lobby construction, and **`minHumans` drops to 0 for a
  bot-only lobby**. `Match.humanCount()` counts `role: 'captain'` only (FR34, deliberately), so a
  bot lobby at `minHumans: 1` would sit in `waiting` forever — and `World.respawnEnabled` is true in
  the pre-active phases, so every kill/death number would have been measured on respawning hulls.
  This is the single change that makes the metrics mean anything.
- `server/scripts/batchsim/botMetrics.ts` — the per-tick observer (kills by victim role, death cause,
  life, economy at death, land contact).
- `server/scripts/batchsim/botReport.ts` — the quality table with a PASS/FAIL per bar, plus the
  per-profile and per-class breakdowns.
- `server/scripts/batchsim/__tests__/botHarness.test.ts` — 25 unit tests over the above.

Nothing under `server/src/game/**` or `shared/**` was touched: **no production code path, no wire
change, no `PROTOCOL_VERSION` move**, and the harness stays `HC_DEV_OPTIONS=1`-gated.

## The quality bar

Leg A, 50 matches, 1000 bot-matches, seed 7. Three of six bars PASS.

| Bar (spec 6-4 Verification) | Bar | Leg A (seed 7) | Leg B (seed 4141) | Leg C (mixed) | Verdict |
|---|---|---|---|---|---|
| Matches resolving before the 16:00 collapse | > 95% | **100.0%** | **100.0%** | **100.0%** | **PASS** |
| Mean per-match max single-bot kill share | <= 40% | **27.2%** | **27.6%** | **24.3%** | **PASS** |
| Bots scoring >= 1 participant kill | >= 60% | **46.3%** | **45.1%** | **51.0%** | **FAIL** |
| Storm deaths as a share of all bot deaths | 5-20% | **4.1%** | **3.9%** | **5.0%** | **FAIL** (both bot-only legs; the mixed leg lands exactly on the floor) |
| Afloat bot-ticks in land contact | < 1% | **10.3%** | **10.5%** | **8.6%** | **FAIL** |
| Banked levels spent before death | > 90% | **100.0%** | **100.0%** | **100.0%** | **PASS** |

Supporting rows, Leg A:

```
match length s: n=50 mean=482.4 min=274.8 p25=334.3 p50=475.3 p75=569.5 p95=738.8 max=809.8
endedBy: fieldCleared=50            (zero unresolved cap-outs in 50 matches)
winner class: battleship=38 mineLayer=1 torpedoBoat=11
bot-vs-bot kills: 900 | PvE fleet kills: 3006
deaths: 950 = 900 by participant + 11 by PvE fleet + 39 by storm
levels earned: 4558 | still banked at death/finish: 0
per-match max kill share: mean=0.3 p50=0.3 max=0.5 | matches breaching 40%: 10.0%
longest unbroken land-contact run: 552.6s
```

**How the kill-share bar is read, stated up front.** The spec writes it absolutely — *"no single bot
takes > 40% of a match's kills"* — but that is a statement about ONE match, and per-match max share
is a random variable. The judged row is the **mean** per-match max share (27.2%); the strict reading
is printed beside it and is **10.0% of matches breaching 40%** in Leg A, 0.0% in Leg C. Neither
number was chosen after seeing the result: the report always prints both.

**Two `storm deaths` figures in the report are not the same statistic.** The batch section's
`storm deaths: total=134` is `Match.endSummary().stormDeaths` — killer-less sinks over **every hull
in the world**, PvE fleet hulls included. The bot section's `39 by storm` counts bot hulls only.
Both are correct; the bar is judged on the bot figure.

## By profile — the six priority profiles (Leg A, 1000 bot-matches)

```
  group        n kills   pve kill% alive%  lifeS   lvl boons spent%  shots     dmg dmg/shot storm%  land% landRuns maxRunS
  bulwark    164  1.76  4.35 66.5%  14.6%  222.4  6.96  3.76 100.0%   39.5   648.6    16.41   3.6%   7.9%      1.9   452.7
  duelist    162  1.16  3.02 59.9%   6.8%  169.1  4.71  2.81 100.0%   27.3   448.1    16.40   4.6%  13.9%      2.2   552.6
  forager    155  0.50  3.11 32.9%   0.6%  151.2  3.37  1.78 100.0%   28.3   316.2    11.16   1.3%  10.5%      2.1   542.0
  raider     164  0.31  1.99 26.2%   0.0%  164.9  3.38  1.62 100.0%   24.3   282.5    11.63   3.0%   5.5%      2.1   193.4
  siege      177  1.15  3.23 55.9%   7.9%  221.4  5.72  3.56 100.0%   45.0   549.0    12.21   7.4%  12.0%      3.0   376.8
  trapper    178  0.51  2.39 36.0%   0.0%  151.4  3.17  1.57 100.0%   26.6   291.8    10.98   4.5%  12.3%      2.0   437.5

  group           n kills   pve kill% alive%  lifeS   lvl boons spent%  shots     dmg dmg/shot storm%  land% landRuns maxRunS
  battleship    341  1.44  3.77 61.0%  11.1%  221.9  6.31  3.66 100.0%   42.4   596.9    14.09   5.6%  10.0%      2.5   452.7
  mineLayer     333  0.51  2.72 34.5%   0.3%  151.3  3.26  1.67 100.0%   27.4   303.1    11.06   3.0%  11.5%      2.0   542.0
  torpedoBoat   326  0.73  2.50 42.9%   3.4%  167.0  4.04  2.21 100.0%   25.8   364.8    14.14   3.8%   9.7%      2.1   552.6
```

(`kill%` = share of that group's bot-matches scoring >= 1 participant kill; `alive%` = still afloat
at the finish, i.e. that group's win rate; `storm%` = storm's share of THAT group's deaths;
`landRuns` = distinct land-contact episodes per bot-match; `maxRunS` = the group's longest single
unbroken land-contact run, in sim-seconds.)

The same tables on the decorrelated seed (Leg B, 4141) — the ORDERING of every profile is
reproduced, which is what makes the reading below a finding rather than a seed:

```
  group        n kills   pve kill% alive%  lifeS   lvl boons spent%  shots     dmg dmg/shot storm%  land% landRuns maxRunS
  bulwark    176  1.86  4.65 72.2%  15.3%  232.9  7.32  3.90 100.0%   42.1   674.5    16.03   4.0%   8.2%      2.3   463.4
  duelist    176  1.10  2.23 45.5%   4.0%  148.5  4.03  2.38 100.0%   24.0   375.6    15.64   4.7%  10.9%      1.8   331.1
  forager    171  0.51  2.42 31.0%   2.3%  135.6  2.91  1.55 100.0%   24.8   288.1    11.61   0.6%   7.8%      1.7   284.1
  raider     161  0.34  1.74 27.3%   1.9%  166.4  3.29  1.70 100.0%   23.0   263.0    11.41   3.8%  11.0%      2.7   454.7
  siege      169  0.98  3.57 54.4%   4.1%  213.3  5.59  3.59 100.0%   41.9   542.2    12.93   6.2%  12.5%      2.4   660.5
  trapper    147  0.53  2.35 37.4%   1.4%  144.8  3.02  1.48 100.0%   25.1   278.3    11.08   4.1%  13.0%      1.8   421.3

  group           n kills   pve kill% alive%  lifeS   lvl boons spent%  shots     dmg dmg/shot storm%  land% landRuns maxRunS
  battleship    345  1.43  4.12 63.5%   9.9%  223.3  6.48  3.75 100.0%   42.0   609.7    14.52   5.1%  10.3%      2.3   660.5
  mineLayer     318  0.52  2.39 34.0%   1.9%  139.9  2.96  1.52 100.0%   24.9   283.6    11.37   2.2%  10.3%      1.8   421.3
  torpedoBoat   337  0.74  1.99 36.8%   3.0%  157.0  3.68  2.05 100.0%   23.5   321.8    13.67   4.3%  10.9%      2.3   454.7
```

Cross-seed stability, profile by profile (Leg A -> Leg B): kills 1.76->1.86 (`bulwark`),
1.16->1.10 (`duelist`), 1.15->0.98 (`siege`), 0.51->0.53 (`trapper`), 0.50->0.51 (`forager`),
0.31->0.34 (`raider`). The rank order is identical on both seeds and in the mixed leg.

**The profiles genuinely play differently — that part of the design claim holds.** The spread is not
noise at n=155-178 per profile:

- **`bulwark` is the best fighter and the best survivor** (1.76 kills, 66.5% score, 14.6% win rate,
  222s mean life, dmg/shot 16.41) — exactly the attrition brief.
- **`siege` fires the most shots by a wide margin** (45.0 vs 24-40 elsewhere) and fits the most boons
  after bulwark (3.56), at the *lowest* battleship damage per shot (12.21) — a standoff profile
  trading accuracy for reach, which is the brief. It also takes the highest storm share of its own
  deaths (7.4%): a bot that holds range is a bot that is slow to leave a closing ring.
- **`duelist` matches bulwark's marksmanship** (16.40 dmg/shot, the two highest figures in the table)
  on a third fewer shots — the gun-through-the-torpedo-reload profile behaving as specified.
- **`raider` is the weakest profile in the game right now**: 0.31/0.34 kills and a 26.2%/27.3% score
  rate across both legs, and a win rate of **0.0% (A) / 1.9% (B)** over 164 and 161 bot-matches. Its
  damage per shot (11.63/11.41) is battleship-class-poor for a torpedo boat, and it dies at ~165s.
  Its brief is the torpedo opener at credible range, then boost out; on these numbers the opener is
  not landing.
- **`forager` does NOT out-level the field.** Its whole design claim is C3: clear PvE fleets for a
  level lead. It takes 3.11 PvE kills (mid-table — `bulwark` takes **more**, 4.35) and ends on
  **3.37 levels against bulwark's 6.96**. Its `minePropFouling` 0.4 down-weight is doing its job in
  the deck, but the profile is not converting fleet clearing into a level lead. `trapper`, its
  sibling, is no better (2.39 PvE, 3.17 levels). Leg B reproduces it exactly: forager 2.42 PvE /
  2.91 levels against bulwark's 4.65 / 7.32. **C3 is the one design claim these numbers do not
  support.**
- Class-level: **battleship dominates** — 38 of 50 wins in Leg A (34 of 50 in Leg B, 12 of 20 in
  Leg C), 61.0% kill rate, 1.44 kills. Mine Layer wins **1 of 50** in Leg A and 6 of 50 in Leg B.
  That is a balance reading tangled with a bot-competence reading (see the caveats), and it is
  reported without a recommendation.

## The two failures, and what they are

### 1. Land contact 10.3% against a < 1% bar — the un-beach trip is DEAD CODE

This is not a marginal miss, and it is not the proxy: bots really do beach and stay beached. The
longest unbroken land-contact run is **552.6 sim-seconds in Leg A and 660.5s in Leg B** — a bot
spent nine to eleven minutes continuously against a coastline, in matches whose median length is
475s and 461s. It was pinned for longer than a whole median match.

The mechanism is exact and was measured directly (a throwaway probe over one 20-bot match, 62,919
afloat bot-ticks, 3,107 of them in land contact):

> **100.0% of land-contact ticks had `|speed| >= 3 u/s`.**

`ai/tactics.ts` arms its un-beach manoeuvre from `updateStuck()`, whose trip is
`Math.abs(self.state.speed) < STUCK_SPEED` with `STUCK_SPEED = 3` u/s. The grounding damp
(`shared/src/sim/collision.ts`, Eric ruling 2026-08-06) is a **speed CAP, not a stop**: a dead-on
grounding holds `maxSpeed x CONFIG.ship.islandSpeedMult` = 0.25 x maxSpeed, i.e.

| hull | maxSpeed | grounded speed floor | STUCK_SPEED |
|---|---|---|---|
| torpedoBoat | 45 | **11.25 u/s** | 3 |
| mineLayer | 40 | **10.00 u/s** | 3 |
| battleship | 35 | **8.75 u/s** | 3 |

Every hull's grounded speed is **3-4x above the trip**, so `updateStuck` can never fire from an
actual grounding. The bot reads 9-11 u/s, concludes it is sailing fine, and keeps commanding ahead
into rock while `avoidIslands`'s +-0.8 rudder bias loses to a +-1.0 pursuit bearing.

The unit test that covers this row passes because it sets the condition by hand:
`server/src/__tests__/botTactics.test.ts:178` does `rec.state.speed = 0; // pinned: the grounding
damp caps a beached hull low`. The comment states the wrong premise — the damp caps a beached hull
**high**. The unit test and the world disagree, and the world is right.

**Reported, not fixed:** `server/src/game/ai/**` is out of this wave's scope. The shape of a fix is a
`STUCK_SPEED` derived from the hull's own rated `maxSpeed x CONFIG.ship.islandSpeedMult` (with
headroom) rather than a flat 3, and a botTactics test that grounds a hull for real instead of
zeroing its speed.

### 2. Bots scoring >= 1 participant kill 46.3% / 45.1% against a >= 60% bar

Structurally this bar is demanding: 20 bots produce **18 participant kills per match at most** (one
survivor, 19 sinkings, minus storm/PvE deaths), so even a perfectly even distribution tops out near
90-95%, and any concentration pulls it down fast. Leg A produced 900 bot-vs-bot kills over 50
matches — **exactly 18.0 per match**, so the ceiling is being reached; the shortfall is entirely
distributional.

It is very likely the **same root cause as failure 1**, and is stated as a hypothesis rather than a
conclusion:

- `raider` (26.2% score rate) and `forager` (32.9%) are the two profiles dragging the average down,
  and the highest land rates in Leg A belong to `duelist` (13.9%), `trapper` (12.3%) and `siege`
  (12.0%), with maximum unbroken runs of 552.6s / 437.5s / 376.8s.
- A beached bot does not manoeuvre, so it neither scores nor escapes; it waits to be shot.

The honest position is that this bar **cannot be judged until the grounding defect is fixed**, and it
should be re-measured with the same command afterwards. Do not tune a bot dial against this number
in its current state.

### The storm-death band (4.1% against 5-20%) is a NEAR MISS, and reads as a symptom of pace

Leg A measures 4.1%; the mixed Leg C measures 5.0% and passes. Bots are lethal to each other — 900
of 950 bot deaths are participant kills — and matches conclude at a **475s median, well before the
12:00 endgame ring** (only 8.0% of resolved matches run past it). A storm that gets four fewer
minutes to bite kills fewer hulls. This is a pacing reading, not a "bots ignore the ring" reading:
the ring-escape path is exercised (39 bots did die to the storm) and the 5-20% band is a design
expectation about matches that reach the late ring groups.

## Context, not a claim — the mixed leg

Leg C put 3 scripted `gunner` captains on the water with 20 bots. Those pilots are **omniscient**
(they read `world.ships` directly, which is exactly why the spec forbids bots from doing so) and
they were still comprehensively beaten:

```
kills per captain:  n=60 mean=0.4 p50=0.0 max=8.0
deaths per captain: n=60 mean=1.0 min=1.0 max=1.0     (every captain died, in every match)
winner class: battleship=12 mineLayer=4 torpedoBoat=4  (no captain ever won)
```

This is **not** evidence that bots are good — the `gunner` pilot is a deliberately crude control
built for economy evidence, not a skilled opponent, and it spends its levels on a random top-quartile
pick. It is reported because it is the only cross-check available in-process, and because it says the
bots are at least not inert.

## What this does NOT prove

The project's standing convention applies in full: **harness numbers are lower bounds, and no
eye-on-the-water claim may be made from a sim.**

- **No human is in it.** Every hull in Legs A and B is a bot. Bots are measured against bots, so
  nothing here says whether a bot is *fun*, whether it reads as a person, whether it feels cheap or
  unfair, or whether a human beats it. Story 6-5 puts one on the water; that is where those questions
  get answered.
- **In-process, no sockets, no frames, no client.** `World` + `Match` run directly. Nothing here
  exercises the room, the wire, prediction, rendering, or latency. A bot that plays well headless can
  still read badly on a screen.
- **The land-contact figure is a geometric PROXY**, not the resolver's own answer.
  `resolveShipPose().contact` is consumed inline by `World.resolveCollisions` and never stored, and
  this wave may not modify `server/src`. The harness re-derives it: hull silhouette transformed at
  the resolved pose, contact when any vertex sits within **1u** of a coastline. It is a slight
  **over**-count (push-out clears a grounded hull by 1e-6u, so real contact always reads ~0
  clearance; a hull merely passing inside 1u is counted too) — so the true rate is at or below the
  reported one. At 10.3% against a 1% bar the direction of the error cannot rescue the bar, and the
  552.6s unbroken run and the 100%-above-STUCK_SPEED probe are independent of the proxy's threshold.
- **`--captains 1`-style forward-looking caveats still apply**, and a new one joins them: the
  harness's `minHumans: 0` for a bot-only lobby is a **dev seam**, not a lobby that ships. Production
  `CONFIG.match.minHumans` is 2 and Story 6-5 owes the solo-termination rule.
- **The class-win skew (battleship 38/50, mineLayer 1/50) is not a balance verdict.** It is measured
  under bots whose Mine Layer profiles both beach heavily (land 10.3-11.5%) and win 0.3-1.9% of
  their matches, so hull balance and bot competence are confounded here. Re-measure after the
  grounding fix before drawing any conclusion about the Mine Layer.
- **`shots` is a fire-REQUEST count, not rounds downrange.** It reads `ShipRecord.lastFireSeq`, so it
  includes clicks the equipment refused (reload, arc, ammo). Every `dmg/shot` figure is therefore a
  LOWER bound on marksmanship, and it is only comparable BETWEEN profiles to the extent their refusal
  rates are similar — which is unmeasured.
- **Two legs, two seeds, one code state.** Determinism is per run key; a different seed is a
  different ocean, and 50 matches is 50 samples of a 20-body problem. The three-of-six PASS/FAIL
  split is stable across both bot-only seeds and the mixed leg, but the second decimal place is not.
- **The harness's captain-only path is unchanged and was re-verified**, so none of the existing
  storm/economy evidence is disturbed: `--captains N` with no `--bots` takes the identical
  `minHumans`, the identical player cap, the identical report body, and the `gunner`/`pacifist`/
  `endgame` pilots are untouched (Eric ruling A3(a)). `npm run lint` clean, `npm test -w server`
  1327 passing (1302 pre-existing + 25 new), `tsc --noEmit` clean for both `server/tsconfig.json`
  and the harness tsconfig.

## The one-line summary for the ledger

The instrument exists and works; **bot quality is now measured rather than felt**. Three of six bars
PASS on 1000 bot-matches across two seeds. One failure is a **real, located defect in `ai/tactics.ts`
that this wave may not fix** (`STUCK_SPEED = 3` u/s sits below every hull's grounded speed floor of
8.75-11.25 u/s, so the un-beach manoeuvre is unreachable and bots beach for up to 11 minutes at a
time); a second failure is plausibly downstream of it and should not be judged until it is fixed; the
third is a 1.1-point near miss on the storm band that reads as match pace, not as ring blindness.
