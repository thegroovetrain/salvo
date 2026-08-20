# Batch-sim evidence — Upgrade Cards v2 (Story 7-5, cycle 106)

**Date:** 2026-08-19
**Change under test:** the wholesale catalog rewrite (Story 7-5 waves 1+2) — 33 → 29 lines, the
cannon replaced by the BROADSIDE BARRAGE, the decoy replaced by the RADAR BUOY, CAPTIVE MINES,
star-shell gun reach, ADDITIVE speed/range ladders, exclusivity deleted, and the gun / torpedo /
mine damage cards plus the mine max-live card deleted outright.
**Design of record:** `7-5-decks.md` (Eric) + `plan-7-5-wave-2.md` (rulings R2.1–R2.21).
**Harness:** `server/scripts/batchSim.mjs` (the Story 2.10 economy batch-sim), extended this pass —
see *What was added to the harness*.

This pass discharges the story's own acceptance criterion: *"a batch-sim evidence pass runs — the
cycle-39/2.10 mould — because the last catalog change (cycle 42) shipped explicitly unmeasured and
that debt is still ledgered."*

---

## Run keys

Every body below is deterministic per run key; only the trailing `meta:` line carries wall clock.
Shipped CONFIG throughout — **no `--set` overrides, no zone override, no tuning of any kind.**

```
AFTER  bots      HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50  --seed 7    --quiet
AFTER  bots (x)  HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 50  --seed 4141 --quiet
AFTER  bots (y)  HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --captains 0 --bots 20 --matches 30  --seed 11   --quiet
AFTER  gunner    HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 200 --captains 3 --seed 7 --pilot gunner  --quiet
AFTER  endgame   HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 50  --captains 3 --seed 7 --pilot endgame --quiet
AFTER  deck      HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --deck-only --draws 200000 --seed 7 --quiet
BEFORE bots/gunner/deck — the SAME three commands, run against a clean checkout of `9a7d37b`
                 (the merge of Story 7-4, i.e. the last commit before any 7-5 work) in a scratch tree.
PROBE            node_modules/.bin/tsx --tsconfig server/scripts/batchsim/tsconfig.json \
                   server/scripts/batchsim/balanceProbe.ts
```

A third bot campaign (`--bots 20 --matches 30 --seed 11`) was run after the gun-click ledger was
added to the harness — it carries one block the first two do not, and is otherwise a third seed.

**Sample sizes.** AFTER bots: 1 000 bot-matches per seed at seeds 7 and 4141, plus 600 at seed 11 —
**2 600 bot-matches over 130 matches**. AFTER gunner: 200 matches / 600 captain-matches. AFTER
endgame: 50 matches / 150 captain-matches. Deck-only: 200 024 draws over 4 546 simulated economies.
The probe is analytic (no sampling).

**The BEFORE tree is a real measurement, not a memory.** `git archive 9a7d37b` into a scratch
directory with the workspace `node_modules` copied in; the harness runs from source (`tsx` maps
`@salvo/shared` onto `shared/src`), so no build artifact is involved. It runs with **its own,
unmodified harness** — deliberately: the spend policy `pickSpendChoice` legitimately CHANGED with
the catalog (the doctrine-rival demotion died with exclusivity), so porting the new policy backwards
would have measured a policy that never shipped. Only rows whose aggregation code is byte-identical
across the two trees are compared below (match length, `endedBy`, winner class, the whole bot
quality table, the deck-only economy rows). The new per-line block exists only in the AFTER tree and
is never compared.

**Honesty caveats inherited from the mould, and they still hold.**
- Scripted pilots are OMNISCIENT and more lethal than humans, so **every match length here is a
  lower bound** on a human match.
- The `gunner` pilot fires **slot 0 only**. It cannot see the broadside, the torpedo, the mine, the
  buoy or the star shell. Its numbers are an economy and pacing instrument, never a weapon one.
- The deck-only mode's stopping rule ("play until the deck is empty") is a MODEL. Production has no
  economy termination; per-economy totals are model numbers, cross-variant deltas are comparable.
- Bots are the only instrument in this pass that fires every fitted weapon, and their picks come
  from `CONFIG.bots.boonWeights`, not from taste. A bot pick rate measures the PROFILE, not the card.

---

## What was added to the harness

All of it under `server/scripts/` — no `server/src`, `shared/` or `client/` file was touched.

| File | What it does | Why it was needed |
|---|---|---|
| `batchsim/catalogMetrics.ts` (new) | Read-only per-tick observer folded into every `MatchSample`: per-line OFFER and FIT tallies, ordnance launched by type, damage attributed by amount, and per-victim per-tick damage aggregation. | The shipped report has **no per-line resolution at all** — a card that is never offered, never picked, or picked every time is invisible in every existing row. The story's AC is exactly about that. |
| `batchsim/catalogReport.ts` (new) | Renders three blocks: the STRUCTURAL deck composition (`buildDeck` per class, no simulation), the in-play offer/fit table, and the ordnance + one-hit-kill ledger. | Same. The structural block is the strongest answer to "is any card unreachable" and costs nothing. |
| `batchsim/balanceProbe.ts` (new) | Analytic probe: max-stack stat envelope per class, the broadside fan's shell separation and **how many shells actually land on one hull** (via the shipped `fanTargets`/`burstVictims`), and the same for BARREL's parallel tracks. | The two `[DRAFT]` spread numbers are not `--set` tunables, so a campaign can only report that damage was low — never *why* a fan misses. |
| `batchsim/runner.ts`, `report.ts`, `main.ts`, `deckSim.ts` (edits) | Thread the new collector through; add `first doctrine OFFERED/FITTED` reach rows; add per-line tallies to deck-only mode. | The shipped `first exclusive OFFERED/FITTED` rows now read **0.0 % structurally** — the `exclusive` rarity is extinct (R2.6). Left alone, the mould's "how long until a build commits" row would have silently become a dead line. |

Damage is attributed **by amount**, because `DamageEvent` carries no weapon field and adding one
would mean editing `server/src`. It does not need one: with the gun / torpedo / mine damage cards
deleted, every source in the game emits a unique boon-invariant constant (gun 15, gun bodyblock 6,
broadside 20, torpedo 70, mine **and** captive-mine torpedo 55, buoy gun 5, fleet gun 1, storm
0.2/tick, incendiary 0.25/tick). Anything that does not match is bucketed as `other:<amount>` and
printed, so a future damage card cannot silently corrupt the attribution.

`npm run check` stays green with these additions (harness tests 74 passed; the one existing
`CaptainSample` literal in `batchSim.test.ts` gained the two new fields).

---

## Q1 — Does the economy still resolve matches?

**Yes, and by a slightly wider margin than before.** Nothing failed, nothing hung, and no run
produced a single `unresolved` cap-out.

| | BEFORE (`9a7d37b`) | AFTER (this branch) |
|---|---|---|
| gunner 200 matches — completed / failed | 200 / 0 | **200 / 0** |
| gunner `endedBy` | `fieldCleared` = 200 | **`fieldCleared` = 200** |
| gunner match length p50 | 161.3 s | **154.5 s** (−4.2 %) |
| gunner mean / max | 194.3 / 842.8 s | **191.8 / 742.8 s** |
| bot campaign (seed 7) — completed / failed | 50 / 0 | **50 / 0** |
| bot `endedBy` | `fieldCleared` = 50 | **`fieldCleared` = 50** |
| bot match length p50 | 477.2 s | **460.7 s** (−3.5 %) |
| bot mean / max | 497.0 / 961.6 s | **460.9 / 764.3 s** |
| bots resolving before the 16:00 collapse | 98.0 % | **100.0 %** |

Cross-seed AFTER: seed 4141 p50 484.4 s, seed 11 p50 472.8 s, both `fieldCleared` 50/50 and 30/30,
both 100 % resolving. **Every AFTER campaign resolved every match.**

**Pacing did not move.** A ±4 % shift in the median at n=200 is inside the noise this instrument
produces between seeds, and the direction (slightly shorter) is the opposite of a "matches drag on"
regression. The longest single AFTER match shortened by ~100 s in the bot campaign and ~100 s in the
gunner campaign — the tail got shorter, not longer.

**The economy itself is unchanged in shape, and still short of its design band.** Gunner picks per
captain: mean 4.5 / p50 3 BEFORE, **mean 4.5 / p50 3 AFTER** — byte-for-byte the same story, and the
same story cycle 39 told: the 12–20 picks band needs ~10 minutes of active play, and omniscient
pilots end matches at 2:35. Nothing in this catalog change moved it either way.

**Why deleting the gun's damage ladder did not lengthen matches, which is the result that most
deserves an explanation.** BEFORE, `gunDamage` (common ×5, `+3`) could take a burst from 15 to 30 hp,
so a maxed BARREL click was 3 × 30 = **90 hp**; AFTER, the gun is a flat 15 and the same click is
**45 hp** — a halving of the theoretical ceiling. The gunner campaign's median match still moved only
−4.2 %. The reason is picks: a captain in these matches fits **4.5 boons**, spread across a 41-card
deck, so the five-copy damage ladder was almost never stacked deep enough to matter before the field
was cleared. The deletion removes a ceiling that short matches never reached.

### The no-stalemate guarantee still holds, and the picks band is reached when matches run long

The `endgame` pilot (pacifist until the endgame ring is reached, then hunts) is Story 3.4's
instrument, and it had to be re-run because it is a GUNNER and **this catalog deleted the gun's
damage ladder**: `gunDamage` (common ×5, `+3` to `gun.damage`) is gone, so a fully-stacked gun went
from 30 hp per burst to a flat 15. Re-running it was mandatory, not optional — the same reasoning
cycle 44 used when it cut gun damage 25 → 15.

| endgame pilot, 50 matches, seed 7 | 2026-08-14 (cycle 82) | **AFTER (this pass)** |
|---|---|---|
| matches resolved / failed | 12 / 0 | **50 / 0** |
| `endedBy` | `fieldCleared` 12/12 | **`fieldCleared` 50/50** |
| unresolved cap-outs | 0 | **0** |
| resolved p50 | 765.8 s (12:46) | **790.3 s (13:10)** |
| resolved max | 825.3 s (13:45) | **966.7 s (16:07)** |
| past the endgame ring | 91.7 % | **96.0 %** |
| storm deaths | 56 | 640 (12.8/match) |

**All 50 resolve, none caps out, 96 % conclude past the 12:00 endgame ring** — the geometric bar of
epic-3 amendment 24 is met and nothing about this catalog change threatens it. The longest match ran
16:07, i.e. into the sudden-death collapse, exactly as cycle 82 designed.

This campaign also answers a question the short campaigns cannot: **when matches actually run the
full storm timeline, the economy DOES reach its ratified band — picks per captain mean 19.7, p50 20
(design band 12–20)**, with 6.2 copy-capped lines per captain and 100 % of captains capping at least
one line. The 41-card deck is not a constraint even then: p50 24 cards still in the deck at the
finish, against the 44 draws it takes to exhaust one.

**One economy row DID move, and it is structural rather than behavioural:** deck cards remaining per
captain p50 **53 → 40**, because a hull's deck went from 53–58 cards to exactly 41. The deck-only
mode measures the same collapse cleanly: an economy played to exhaustion runs **72.2 draws (55–105)
BEFORE → exactly 44 AFTER**, with zero variance. 44 is arithmetic, not luck: 41 cards, less the one
acquisition fitted and the 3 acquisitions its fit purges, plus the 6-card subdeck the acquisition
shuffles in.

---

## Q2 — Are the three hulls still competitive? (and what happened to the Battleship)

The bot campaign is the only instrument here that fires every fitted weapon, so it is the only one
that can see this. Same seed, same roster, same bot brains — only the catalog differs.

### Wins per campaign

| | BS | ML | TB |
|---|---|---|---|
| BEFORE, seed 7 (50 matches) | **26 (52 %)** | 6 (12 %) | 18 (36 %) |
| AFTER, seed 7 (50) | 17 (34 %) | 13 (26 %) | 20 (40 %) |
| AFTER, seed 4141 (50) | 16 (32 %) | 9 (18 %) | 25 (50 %) |
| AFTER, seed 11 (30) | 12 (40 %) | 5 (17 %) | 13 (43 %) |
| **AFTER, all 130 matches** | **45 (34.6 %)** | **27 (20.8 %)** | **58 (44.6 %)** |

**The field got FLATTER and the Battleship lost the top seat.** BEFORE, one class took a majority of
matches (52 %) and the Mine Layer was a 12 % also-ran — the exact complaint the cycle-96 bot evidence
recorded ("the Mine Layer is still the weakest class"). AFTER, the spread is 35/21/45 across 130
matches: still not equal, but the worst class nearly doubled its share and no class dominates.

### Per-hull combat, seed 7, like for like (per bot-match; n≈340 each)

| | BS BEFORE | BS AFTER | Δ | ML BEFORE | ML AFTER | TB BEFORE | TB AFTER |
|---|---|---|---|---|---|---|---|
| kills (participants) | 1.23 | **0.91** | **−26 %** | 0.52 | **0.71** (+37 %) | 1.03 | **1.19** (+16 %) |
| damage dealt (hp) | 594.8 | **441.2** | **−26 %** | 351.2 | **378.5** (+8 %) | 462.2 | **515.9** (+12 %) |
| levels earned | 5.99 | **4.74** | **−21 %** | 3.78 | 3.90 | 4.97 | **5.70** |
| life (s) | 213.6 | **183.9** | **−14 %** | 168.0 | 166.8 | 191.6 | **211.3** |
| alive at finish | 7.6 % | **5.0 %** | −2.6 pp | 1.8 % | **3.9 %** | 5.5 % | 5.5 % |
| damage per fire request | 13.18 | 11.45 | −13 % | 9.67 | 10.37 | 13.13 | 13.19 |

Seed 4141 agrees on every sign (BS 0.94 kills / 442.4 dmg; ML 0.69 / 420.1; TB 1.18 / 489.0).

### Yes, the Battleship got worse — by about a quarter, and it is concentrated in `siege`

| profile (hull) | kills BEFORE → AFTER | damage BEFORE → AFTER | level BEFORE → AFTER | alive BEFORE → AFTER |
|---|---|---|---|---|
| **siege** (BS, broadside-led standoff) | 0.94 → **0.53 (−44 %)** | 566.8 → **366.5 (−35 %)** | 5.71 → **3.93** | 5.6 % → **2.3 %** |
| bulwark (BS, attrition) | 1.54 → 1.31 (−15 %) | 625.1 → 521.8 (−17 %) | 6.29 → 5.61 | 9.8 % → 7.9 % |
| duelist (TB, guns) | 1.78 → **2.07** | 638.5 → 705.1 | 6.49 → 7.46 | 10.5 % → 9.9 % |
| trapper (ML, mines) | 0.53 → **0.83 (+57 %)** | 353.9 → 375.4 | 3.72 → 3.83 | 0.6 % → 3.9 % |
| forager (ML, PvE farm) | 0.50 → 0.57 | 348.0 → 382.1 | 3.85 → 3.99 | 3.2 % → 3.9 % |
| raider (TB, torpedo opener) | 0.29 → 0.32 | 288.0 → 329.1 | 3.46 → 3.96 | 0.6 % → 1.2 % |

**`siege` is where the Battleship's loss lives, and the reach cut is the obvious cause.** Its whole
thesis is standoff at intel range, and its weight table buys `intelRange` at 2.4 — but the broadside
no longer reaches intel range. The probe's stat envelope makes the mismatch exact:

```
battleship base   gun rangeU 660.0   broadside rangeU 412.5   (the 5/8 rung)
battleship MAXED  gun rangeU 860.0   broadside rangeU 537.5
```

Every RANGE card a `siege` bot buys widens its gun by 50u and its main weapon by 31.25u, and the
weapon it is named after now reaches 62.5 % of where its gun reaches. **The instrument cannot
separate "the weapon is weaker" from "the profile was never retuned for the new weapon"** — the
`siege` weight table still names `broadsideTurrets` and `intelRange` exactly as it did when the
cannon reached full radar. Read the −44 % as an upper bound on the weapon's own loss.

**What the broadside actually contributes** (seed 7, 50 matches): 4 449 shells launched, 2 389 hits,
**47 780 hp — 10.1 % of all damage dealt in the campaign**, at 10.74 hp per shell launched (the gun
manages 8.48 per shell but fires 8.6× as often). Per barrage that is ~36.8 hp on a 30 s cooldown,
about 1.2 hp/s — against a gun that is the same hull's other weapon. The Battleship's two
distinguishing weapons together account for **10.1 % (broadside) and 0.08 % (star-shell PHOSPHOR
burn, 369 hp) of the campaign's damage**; the plain universal gun accounts for 68.9 %.

---

## Q3 — Is any card dead, dominant, or never picked?

### Structurally: nothing is unreachable. The catalog is clean.

`buildDeck` over each class's fresh fit, printed with no simulation involved:

```
catalog lines: 29
  torpedoBoat  deck= 41 cards across 16 lines
  battleship   deck= 41 cards across 16 lines
  mineLayer    deck= 41 cards across 17 lines
```

Every one of the 29 lines appears in at least one class's deck; 41 = 22 universal + 3 gun + 6 + 6
(the two carried equipment subdecks) + 4 acquisitions. One correction of record for anyone reading
the plan's summary: **the "every equipment subdeck is exactly 6" rule holds for the six ACQUIRABLE
equipments only** — the gun's subdeck is 3 cards (BARREL ×2 + EXTRA TURRET ×1), because the gun is
never acquirable and has no acquisition card. The arithmetic works out to 41 either way.

### In play: no line went unoffered in any campaign

`NEVER OFFERED: (none)` in all five AFTER campaigns (gunner 2 721 hands, endgame 2 959; bots 4 854 /
4 996 / 2 930 hands). Offer rate spans **45.1 % (intelSweep) down to 2.7 % (mineCaptive)** — a 17× spread, entirely
explained by copies (5 vs 1) and by class membership (a universal line is in all three decks, a mine
doctrine in one). Nothing is starved; the tail is thin by design.

Deck-only, 200 024 draws, offer rate per line by class (the policy-free column):

| tier | lines | offer % (all classes) |
|---|---|---|
| universal ×5 | intelSweep, shipCooldown | 48.1 %, 47.6 % |
| universal ×4 | shipSpeed, shipHull, intelRange | 39.4 %, 39.2 %, 38.9 % |
| carried common ×4 | mineBlast / starDuration / broadsideSpread / buoyDuration / boostDuration / torpedoSpeed | 18.7–19.8 % overall, **38.2–39.5 % for the class that carries it** |
| carried common ×2 | boostSpeed, (broadsideTurrets ×2 rare) | 9.9 %, 6.7 % |
| carried rare ×1 | the seven doctrines + gunTurret | 1.6–3.3 % overall, 3.3–3.5 % for the carrying class |
| acquisitions ×1 | six lines | 0.6–0.7 % overall, ~1.0 % for a class whose deck holds it |

### Dominant: `shipCooldown`, and only in the bots' hands

`shipCooldown` is the single most-fitted line in the bot campaign — **394 of 4 774 levels (8.3 % of
every boon fitted)**, and every one of the six profiles names it at 2.0–2.6 in `CONFIG.bots.boonWeights`.
That is a bot-policy fact, not a card fact: in the captain campaign, whose spend policy only ranks by
rarity, `shipCooldown` converts at 0.146 — the same as every other common.

### Never picked, and the finding is about the SPENDERS, not the cards

`OFFERED BUT NEVER FITTED` in all three bot campaigns: **all six acquisition lines — 0 fits out of
2 495 offers (seed 7)**. This is structural in the bot policy, not a coincidence: an acquisition card
carries its TARGET equipment's category (`EQUIPMENT_CATEGORY[equipmentId]`), a profile's weight table
only names categories that profile's hull already carries, and an unnamed category scores
`UNLISTED_SCORE = 0.5` — below every real weight. So a bot can only take an acquisition when the
whole hand is unlisted, which the universal lines make almost impossible. **A bot never fields a
third weapon**, and ~12 % of every offer hand it sees is dead to it.

The captain campaign is the control that proves the cards themselves are fine: acquisitions convert
at **0.50–0.60 fits per offer**, the highest conversion of any tier.

### Four lines that were bought and did nothing

- **`buoyDuration` / `buoyGun` / `buoyJamming` — 82 fits across 1 000 bot-matches, and `buoys
  deployed: 0`.** Not a catalog defect: `server/src/game/ai/tactics.ts` says so in its own comment —
  *"THE BUOY PRESS IS GONE… the RADAR BUOY replacing it is a CLICK-PLACED WEAPON on the mine's rear
  sector (R2.7), not an actSeq ability. Its tactics belong with the buoy itself and are a later
  agent's."* The bots have no buoy tactics at all, so **the entire RADAR BUOY feature — relay,
  jamming and the autonomous gun — is UNEXERCISED by this evidence pass**, and the Mine Layer's
  numbers above are depressed by whatever fraction of its picks went into a weapon it never used.
- **`starIncendiary` (PHOSPHOR SHELLS)** — 23 fits, and the total incendiary burn across 50 matches
  is **369 hp, 0.08 % of all damage**. The flare itself is damageless by ruling, so this is the whole
  of what the doctrine contributes offensively. (Those are the `other:<amount>` rows in the ledger:
  the phosphor DoT is emitted as an AGGREGATED bucket on a flush window, so it lands as fractional
  multiples of the 0.25 hp/tick burn — 2.75 hp being a full 11-tick window. Nothing else in the sim
  emits a fractional amount, so the attribution is unambiguous.)

---

## Q4 — Did the deletions break the damage guardrail in practice?

**The law holds on class hulls, and the BARREL click does exactly what the analytic pin says it
does to a small drone — 45 damage, on the nose, routinely.**

### The per-event law (the one the guardrail actually states)

| | measured |
|---|---|
| largest single `DamageEvent` anywhere, 130 bot matches | **70.0 hp** (a torpedo) |
| lightest CLASS hull | 125 hp (Torpedo Boat) |
| class-hull kills observed | 940 (BS 319+324+187, ML 318+305+187, TB 303+312+190 across the three campaigns) |
| class-hull kills **from full hp inside one tick** | **0** |

No single hit came within 55 hp of killing an undamaged class hull. The shared analytic pin
(`damageGuardrail.test.ts`) and the live sim agree.

### The per-TICK figure, which is NOT the law but is worth stating

The largest damage any hull took in a single 50 ms tick was **140.0 hp — two torpedoes landing
together**, which is above the 125 hp Torpedo Boat. It never landed on a full-health class hull in
940 class-hull kills, but it is reachable in principle. This is the same class of statement the
guardrail test already makes about a multi-barrel click ("THE LAW IS PER SHELL"), extended to two
shooters coinciding; flagged, not treated as a defect.

### The BARREL click vs the 45 hp small drone: measured, and it one-shots

The gunner campaign is the clean instrument — that pilot fires the gun and nothing else, so every
number in its ledger is gun damage:

```
gunner, 200 matches:  largest single DamageEvent 15.0    largest per-victim PER-TICK total 45.0
  droneSmall  kills=1375  fromFull-in-ONE-TICK=50 (3.6%)  of which SINGLE-EVENT=0   maxTick=45.0
  torpedoBoat kills= 198  fromFull-in-ONE-TICK= 0         maxTick=45.0
```

All 50 of those small-drone kills were **multi-event 45 hp ticks — three 15 hp bursts inside one
tick, i.e. the maxed TWIN + TRIPLE MOUNT click**, killing a full-health small drone outright. The
dedicated gun-click ledger in the seed-11 bot campaign confirms it independently:

```
THE BARREL CLICK (gun-only multi-burst ticks):
  droneSmall   multi-burst ticks=217  maxGunOnlyTick=45.0  fromFull kills by such a tick=5
  torpedoBoat  multi-burst ticks=120  maxGunOnlyTick=45.0  fromFull kills by such a tick=0
  battleship   multi-burst ticks=172  maxGunOnlyTick=45.0  fromFull kills by such a tick=0
```

The `endgame` campaign, whose pilots reach level ~20 and therefore routinely hold both BARREL
copies, is the strongest reading of all — and it is a gun-only pilot, so there is no other weapon in
the ledger to confuse it:

```
endgame, 50 matches:  droneSmall  kills=1292  fromFull-in-ONE-TICK=168 (13.0%)  SINGLE-EVENT=0
                      droneSmall  multi-burst ticks=1191  maxGunOnlyTick=45.0  fromFull kills=168
                      torpedoBoat / mineLayer / battleship  maxGunOnlyTick=45.0  fromFull kills=0
```

**168 full-health small drones killed by a single 45 hp BARREL click**, and not one class hull.

`maxGunOnlyTick = 45.0` on **every** hull type: when three barrels are fitted and the click lands,
all three bursts connect. (Two rows in that campaign read 60.0 and 75.0 on the larger drones — four
and five gun bursts in one tick, which is above the three-barrel maximum. That is the known
contaminant this ledger discloses rather than hides: two shooters landing on the same hull inside
the same 50 ms tick. It never happens on a small drone, whose 45.0 ceiling is therefore clean.) The probe explains why with no sampling at all — **`barrelSpacingU` 12u is
smaller than the burst RADIUS 15u**, so the three burst circles overlap and any hull covering the
clicked point is inside all three:

```
== BARREL PARALLEL TRACKS (barrelSpacingU = 12u, burstRadius 15u) ==
spacing 12u vs burst DIAMETER 30u: adjacent bursts OVERLAP
  1 barrel  → 15 hp   2 barrels → 30 hp   3 barrels → 45 hp   (on EVERY hull, aim = hull centre)
OFF-CENTRE CLICK, 3 barrels, R=300u — shells on target vs lateral miss:
  torpedoBoat   0u:3  10u:2  20u:1  30u:1  40u:0
  battleship    0u:3  10u:3  20u:2  30u:2  40u:1
  droneSmall    0u:3  10u:3  20u:2  30u:1  40u:0
```

So the 45 = 45 coincidence the guardrail test documents as "the click still kills a 45hp small
drone" is not a corner case — it is the ordinary outcome of an accurate 3-barrel click, and it needs
about 10–15u of aim accuracy to hold. **Against class hulls it is harmless**: 45 hp is 36 % of the
lightest hull, and the ledger recorded zero one-tick-from-full class kills by a gun click.

### The deletions MOVED THE GUARDRAIL THE SAFE WAY

Worth stating plainly, because the question was framed as "did the deletions break it": they did the
opposite. The three deleted damage ladders were all ADDITIVE ceilings on single hits.

| max single hit / click | BEFORE (`9a7d37b`) | AFTER | vs 125 hp TB |
|---|---|---|---|
| gun burst | 15 + 5×3 = **30** | **15** | 12 % |
| gun CLICK (3 barrels) | 3 × 30 = **90** | 3 × 15 = **45** | 72 % → **36 %** |
| torpedo | 70 + 5×1 = **75** | **70** | 56 % |
| mine | 55 + 5×4 = **75** | **55** | 44 % |

`gunDamage` ×5, `torpedoDamage` ×5 and `mineDamage` ×5 are all gone; every one of those numbers is
now a boon-invariant constant. **The margin between the largest possible single hit and the lightest
class hull widened from 50 hp to 55 hp, and the largest possible CLICK fell from 72 % of a Torpedo
Boat to 36 %.**

### Drone one-shots generally (context, not a violation)

Small drones died from full inside one tick in 15.5–18.5 % of their deaths, almost all of them
SINGLE-EVENT — a base mine (55) or a torpedo (70) against 45 hp. That is the ratified Story 5.6
position (drones traded the one-hit floor for the farming economy), unchanged by this catalog.

---

## Q5 — What the [DRAFT] values got wrong

### The broadside fan `[12, 9, 6.5, 4.5, 3]` — the ladder works, but its top end erases the fan

Adjacent-shell separation is `2 × halfAngle × R / (turrets − 1)`. Two bounds matter: the burst
DIAMETER is 30u (below that separation the bursts merge into one blob), and a hull is 88–124u long
(above that separation a broadside-exposed hull can slip between shells).

```
turrets | spread | halfDeg |   R=100 |   R=200 |   R=300 | R=412.5 | R=537.5   (separation, u)
      3 |      0 |    12.0 |    20.9 |    41.9 |    62.8 |    86.4 |   112.6
      3 |      4 |     3.0 |     5.2 |    10.5 |    15.7 |    21.6 |    28.1
      5 |      0 |    12.0 |    10.5 |    20.9 |    31.4 |    43.2 |    56.3
      5 |      4 |     3.0 |     2.6 |     5.2 |     7.9 |    10.8 |    14.1
```

Shells that actually land on one stationary hull, counted with the shipped `fanTargets` +
`burstVictims` (aim = hull centre):

| battleship target | R=150 | R=300 | R=412.5 | R=537.5 |
|---|---|---|---|---|
| 3 turrets, spread 0, **broadside-on** | 3 | 3 | 1 | 1 |
| 3 turrets, spread 4, broadside-on | 3 | 3 | 3 | 3 |
| 5 turrets, spread 0, broadside-on | 5 | 5 | 3 | 3 |
| **5 turrets, spread 4, broadside-on** | **5** | **5** | **5** | **5** |
| 3 turrets, spread 0, **bow-on** | 1 | 1 | 1 | 1 |
| 5 turrets, spread 4, bow-on | 5 | 5 | 5 | 5 |

**Two findings, in Eric's own terms.**

1. **The BASE fan (spread 0) matches his brief closely.** *"You definitely can't hit a single ship
   with all the shots from this unless they are close and exposing their broadside to you."* At
   spread 0 that is exactly true past ~300u — an un-upgraded barrage puts 1 of 3 shells on a
   broadside-on battleship at its own max range, and 1 of 3 on a bow-on target at every range. The
   base value 12° needs no change.
2. **The TOP of the ladder (3°) deletes the weapon's identity, at EVERY range.** With SPREAD ×4 and
   TURRETS ×2, all five shells land on any hull, at any aspect, at any range out to 537.5u — 100 hp
   per barrage, unconditionally, on a target that would need to be *close and broadside-on* at the
   base value. The 5-turret separation at 3° is **2.6–14.1u, below the 30u burst diameter at every
   range**: the five bursts physically merge into one crater. That is arguably what *"nearish to
   the targeted location"* asks for, but the consequence is worth Eric's eye: **a maxed broadside is
   a 100 hp point-strike, 80 % of a Torpedo Boat's health, not a fan.** If the intent was for SPREAD
   to *tighten* rather than to *guarantee*, the top rung wants to sit where separation is ~30u —
   about 6.5° at 5 turrets / 412.5u, i.e. the existing spread-2 value.

The 15u burst radius itself looks right: it is the gun's, it makes a base 3-shell fan land 3 on a
close broadside target and 1 at long range, and the spread ladder has room to work against it.

### `barrelSpacingU = 12u` — undersized against its own burst radius

Covered in Q4. 12u < 15u means the three bursts always overlap, so a 3-barrel click is a single
45 hp hit rather than a 12u-wide pattern, and BARREL is a pure damage multiplier with no aiming
trade-off. If BARREL is meant to be a *spread* (Eric: *"fires +1 bullet at once… in parallel lines"*)
the spacing needs to exceed 30u for the tracks to read as separate; if it is meant to be a damage
upgrade that also forgives 10–15u of aim error, 12u is already correct. **This is a design question,
not a defect** — but it is the reason the max click is exactly 45 hp in practice and not "45 hp if
you are lucky."

### The 15u broadside burst and 10 jamming fakes — one measured, one NOT measurable here

`broadside.burstRadius = 15u`: exercised heavily (4 449 shells, 2 389 hits, 10.74 hp/shell launched);
nothing about it looks off.

**`jamFakes = 10` is entirely unmeasured and cannot be measured by this harness.** Zero buoys were
deployed in 2 600 bot-matches (the bots have no buoy tactics — see Q3), and the batch runner builds
no perception frames for captains at all, so no false return was ever generated, delivered or acted
on in this pass. The same applies to the buoy's relay, its 330u radar, its autonomous gun and its
20 s/30 s duty cycle. **Anything Eric wants to know about the RADAR BUOY has to come from play, not
from here.**

### CAPTIVE MINES — fires, lands, but its lead quality cannot be isolated

The captive torpedo does exist in the water: **233 / 269 / 155 launched** across the three bot
campaigns (from 35 / 43 fits of `mineCaptive`), so the trigger, the 3× ring and the launch all work
in a real match. Its ACCURACY cannot be separated from an ordinary mine's, because both deal exactly
55 hp and `DamageEvent` carries no weapon field — the 703 mine-damage hits in the seed-7 campaign are
ordinary blasts and captive torpedo hits mixed together. Splitting them would need a wire field or a
server-side counter; neither belongs in a `server/scripts` extension.

---

## What this pass could NOT measure

Stated plainly, because a stated gap is worth more than a fabricated figure.

1. **The RADAR BUOY, in its entirety.** Zero deployments in 2 600 bot-matches. The bot brain has no
   buoy tactics by design (`ai/tactics.ts` defers them to "a later agent"), and the scripted captain
   pilots fire slot 0 only. Relay, jamming density, the autonomous gun, the 20 s life on a 30 s
   reload, and the destructible 50 hp hull are all untested by this pass.
2. **CAPTIVE MINES' torpedo lead quality** — it fires and it hits, but its hits are indistinguishable
   from an ordinary mine blast in the event stream (both 55 hp).
3. **STAR-SHELL GUN REACH (R2.15).** Star shells are fired (852–1 329 per campaign) but nothing in
   the harness reports whether a gun click was legalised by a friendly lit zone. The bots' fire path
   would have to expose it.
4. **PROP FOULING's slow, DAZZLE's sight halving, HOMING's steering** — all behaviour changes with no
   damage signature, so no row here sees them. Their cards are fitted (32–90 fits per campaign), so
   they are in play; their effect is not quantified.
5. **Any human-facing question** — card legibility, whether a build "feels" like a build, whether the
   4-card offer reads. Not a harness question at all.
6. **Human match length.** Every duration here is a lower bound: these pilots and bots are more
   lethal and far less cautious than people.
7. **BEFORE/AFTER on anything the new per-line block reports.** The BEFORE tree runs the old harness,
   so per-line offer/fit rates, the ordnance ledger and the guardrail ledger have no BEFORE column.
   Only the shared rows (length, `endedBy`, winner class, the bot quality table, deck-only economy)
   are compared.

---

## Findings, in priority order

1. **The economy resolves and the pacing did not move.** 380 matches across five AFTER campaigns,
   zero failures, zero `unresolved`, 100 % resolution in every bot campaign (98 % BEFORE), and the
   Story 3.4 endgame guarantee re-verified at 50/50 resolved and 96 % past the endgame ring. No action.
2. **The Battleship lost about a quarter of its output and its win share** (52 % → 35 % of matches,
   kills −26 %, damage −26 %, level −21 %), concentrated in the broadside-led `siege` profile
   (−44 % kills). The reach cut from full radar to the 5/8 rung is the plain cause, but the bot
   profile was never retuned for the new weapon, so **−44 % is an upper bound on the weapon's own
   loss.** The field is flatter than before, which may well be the intended trade — **this is Eric's
   call, not the harness's.**
3. **The max BARREL click one-shots a full-health small drone, routinely** — 50 such kills in 200
   gunner matches, `maxGunOnlyTick` exactly 45.0 on every hull. The class-hull guardrail is untouched
   (0 one-tick-from-full class kills in 940). The 45 = 45 equality the analytic pin documents is a
   normal outcome, not a corner case, because `barrelSpacingU` 12u sits inside the 15u burst radius.
4. **The broadside's top SPREAD rung guarantees a 100 hp point-strike at every range and aspect.**
   The base fan matches Eric's brief; the ×4 rung does not, and the five bursts merge below the burst
   diameter. **Recommend Eric look at the top rung** (3° → ~6.5° at 5 turrets would keep separation
   at ~30u, i.e. bursts that touch rather than stack).
5. **Bots never take an acquisition card — 0 fits of 2 495 offers — and it is structural.** 12 % of
   every bot offer hand is dead, no bot ever fields a third weapon, and the Mine Layer additionally
   spends ~82 picks per 1 000 bot-matches on a buoy it never deploys. **This is a bot-tuning finding,
   not a catalog finding** (captains convert acquisitions at 50–60 %), but it biases every per-class
   number in Q2 and should be fixed before the next balance campaign is trusted to that resolution.
6. **PHOSPHOR SHELLS contribute 0.08 % of all damage.** Fitted 23–32 times per campaign; total burn
   369 hp against 472 000 hp of ordnance damage. Not necessarily wrong (it is a zone-denial verb, not
   a damage verb) — recorded so nobody has to guess later.
7. **Deck lifetime fell 39 %** (72.2 → exactly 44 draws to exhaustion) and the escalating soft pity
   **inverts past dry=3**: rare-landing rate runs 46 % / 51 % / 48 % / 35 % / 21 % / 9 % / 3 % as dry
   levels climb, where BEFORE it rose 57 % → 68 %. A 41-card deck simply runs out of rare copies.
   **Real matches rarely reach that far** (gunner picks p50 3, mean 4.5; bots 2.4 boons mean), so
   this is a tail property of the model, not a live problem — but `deck.rareWeightPerDryLevel = 0.7`
   was ratified in cycle 39 against a 53–58 card deck, and it no longer does what it was tuned to do.

## Recommendations (for Eric — none taken unilaterally)

- **Broadside SPREAD top rung 3° → ~6.5°** if SPREAD is meant to tighten rather than guarantee.
  Evidence: Q5's separation table and shells-on-hull table.
- **Leave `barrelSpacingU` at 12u** unless BARREL is meant to read as a visible spread pattern, in
  which case it must exceed 30u. Either way the 45 hp click is deliberate and safe.
- **Leave the base broadside fan (12°), the 15u broadside burst, damage 20 and the 30 s reload
  alone** — they behave as briefed.
- **Retune the `siege` bot profile for a 5/8-rung weapon** before the next campaign, and give the
  bots buoy tactics + an acquisition weight, so the next balance read is not measuring the AI's gaps.
- **No catalog change is indicated by this pass.** No dead line, no unreachable line, no line the
  offer roll starves.

---

## Reproducibility

The harness's determinism contract survives the additions: two runs of the same run key
(`--matches 2 --captains 3 --seed 99`) produce **byte-identical report bodies** once the trailing
`meta:` line is stripped. Harness unit tests: 74 passed. `npx tsc --noEmit -p server/tsconfig.json`
and `npx eslint server/scripts/` both clean.

Raw campaign outputs were written to a scratch directory and are not checked in; every number above
is reproducible from the run keys at the top of this document. The BEFORE tree is
`git archive 9a7d37b` — no branch, no worktree, nothing committed.
