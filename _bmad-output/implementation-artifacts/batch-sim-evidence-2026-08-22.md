# Batch-sim evidence — the damage→XP rule (2026-08-22)

**Instrument:** `/balance-sim`. **Status: MEASUREMENT ONLY — no shipped balance value has been
changed.** Every number below is a reading. `CONFIG.xp.damageLevels` was ADDED by this cycle but
ships at **0**, which is the shipped game exactly; nothing else in `shared/src/constants.ts` moved.

**The question (Eric, 2026-08-22):** *"i would like to see what it does to the game if we add a rule
that doing 1 damage grants 1/100 XP, and then what happens if we say doing 1 damage grants 1/300
XP."*

XP in this game is denominated in LEVELS (`CONFIG.xp.levelMs` = 60000 ms = one level), so "1/100 XP"
is read as **1/100 of a level per point of damage**. That reading is what makes the pair sensible as
a design question: at 1/300, killing an average hull outright is worth roughly one extra level — the
same order as the kill itself — while 1/100 is three times that.

---

## The rule had to be BUILT before it could be measured

No damage→XP rule existed. `ShipRecord.xpMs`'s own contract said *"Damage adds nothing"*, and XP had
exactly two inputs: the passive tick and kill credit. So this cycle added the mechanism behind a
default-off dial rather than measuring something imaginary.

**`CONFIG.xp.damageLevels`** — levels of XP per 1 point of damage dealt, **default 0**. At 0 the
credit path returns before touching `xpMs`, so the shipped economy is byte-identical; the full
suite (**1661 server + 778 shared**) passes unchanged, and a barrel pin asserts the value is 0 so it
cannot be switched on by an unrelated change. `xp.*` was already on the harness's `--set` whitelist
with a floor of 0, so no new override surface was needed.

**It hangs off `World.creditDamage`** — the ONE seam every hull-damage path already funnels through
(`hitShip` for shell/torpedo/mine impacts, `burnShip` for incendiary DoT). That is why the rule
cannot miss an ordnance type, and why its exclusions are structural rather than restated: a self-hit
is already filtered at that seam, and **the storm never routes through it at all**. It grants via
the unchanged `addXpMs`, so fleet hulls still accrue nothing and each banked level still draws a
real offer.

### Two Eric rulings landed mid-cycle and both are in the measured code

- **Overkill never pays** (*"excess damage should just not be counted. if i do 50 damage to someone
  with 1 HP left, i get 1 damage worth of XP"*). The XP-eligible figure is read BEFORE hp is applied
  and threaded to `creditDamage` as a **required** second parameter — required rather than defaulted,
  so a future damage path cannot opt back into paying for overkill merely by not knowing about it.
- **The kill bonus is untouched** (*"I \*DO\* get the kill bonus though. I don't want to remove
  that."*). It rides `creditKill`, a separate path. A killing blow therefore pays *hp actually
  removed* **plus** the full kill level. Both halves are pinned in one test together, because the
  live risk is that one silently swallows the other.
- `damageDealt` deliberately keeps counting the **full nominal** blow. It is the results-screen
  tally, not the economy, and the ruling was about XP. **Unruled:** whether that stat should be
  clamped too.

**Sub-millisecond remainders are CARRIED** (`ShipRecord.dmgXpCarryMs`), not rounded per event.
Incendiary DoT credits ~20 tiny bites a second; rounding each independently biases the economy in
one direction by ~0.15 of a level per match — silently, which is precisely the error class a balance
reading cannot survive.

**The instrument was verified before the campaign was spent** — 11 tests pinning the exact rate as
an equality, the carry, and each exclusion. A dial that silently does nothing produces confident
nonsense, which is worse than no campaign.

---

## Method

`server/scripts/batchSim.mjs`, 20 bots, `--captains 0`, 12 shards, merged by variant label.
**`--roster even` on every run** (verified: `roster.even = true`, spread 0.0196 on all three arms).
Three arms × **91 matches** = the coarse **±10pp** tier, chosen deliberately: the effects here are
gross, not subtle, so a ±3pp campaign would have bought precision nobody needed.

**All three arms were built from IDENTICAL code.** A baseline arm was already running when Eric's
overkill ruling landed; it was killed and re-run rather than compared against post-ruling code.

**Bar-pooling correction.** The harness computes its six quality bars **per shard** (~8 matches),
which is far too fine a grain to judge. Every bar below is re-derived once over the whole 91-match
arm from pooled counters. Only `landContactRate` cannot be pooled exactly from what the report
carries — it is bot-match weighted and labelled approximate rather than silently averaged.

---

## Results — three arms, 91 matches each, 100% resolved, roster even

| | baseline (off) | **1/300** | **1/100** |
|---|---|---|---|
| levels earned / bot-match | 7.99 | **10.62** (×1.33) | **22.48** (×2.81) |
| boons fitted / bot-match | 3.30 | **5.24** (×1.59) | **10.91** (×3.31) |
| mean bot life | 363.1 s | 323.8 s | **299.2 s** |
| median match duration | 735.7 s | 592.4 s | **638.7 s** |
| alive at 4:00 (target 10) | 13.40 | 13.00 | 11.20 |
| alive at 8:00 (target 5) | 5.40 | 4.00 | **3.00** |
| alive at 12:00 (target 2.5) | 1.50 | 0.50 | 0.60 |
| battleship win share | 40.7 % | 40.7 % | 50.5 % |
| torpedoBoat win share | 30.8 % | 45.1 % | 46.2 % |
| mineLayer win share | 28.6 % | **14.3 %** | **3.3 %** |
| **class spread** | **12.1 pp** | **30.8 pp** | **47.3 pp** |

### Effect on class win share, with CIs on the difference (Newcombe)

| arm | class | baseline → arm | difference | verdict |
|---|---|---|---|---|
| 1/300 | mineLayer | 28.6 → 14.3 % | **−14.3 pp** CI[−25.8, −2.3] | **significant** |
| 1/300 | torpedoBoat | 30.8 → 45.1 % | **+14.3 pp** CI[+0.2, +27.6] | **significant** |
| 1/300 | battleship | 40.7 → 40.7 % | +0.0 pp CI[−14.0, +14.0] | not significant |
| 1/100 | mineLayer | 28.6 → 3.3 % | **−25.3 pp** CI[−35.5, −15.1] | **significant** |
| 1/100 | torpedoBoat | 30.8 → 46.2 % | **+15.4 pp** CI[+1.3, +28.7] | **significant** |
| 1/100 | battleship | 40.7 → 50.5 % | +9.9 pp CI[−4.5, +23.7] | not significant |

**At 1/100 the Mine Layer won 3 of 91 matches.**

### The mechanism — per-profile levels earned

| profile | baseline | 1/300 | 1/100 | ×1/100 |
|---|---|---|---|---|
| TB duelist | 7.55 | 13.08 | **37.38** | **×4.95** |
| BS bulwark | 8.39 | 12.50 | **35.71** | **×4.26** |
| ML forager | 9.94 | 11.66 | 22.51 | ×2.26 |
| BS siege | 7.28 | 9.25 | 14.01 | ×1.92 |
| ML trapper | 7.63 | 8.77 | 11.98 | ×1.57 |
| TB raider | 7.08 | 7.93 | 9.89 | ×1.40 |

This is the whole finding. **The rule is not a uniform economy buff — it is a multiplier on
sustained close-range brawling.** At baseline the ML `forager` is the game's TOP earner (9.94),
because the shipped economy pays for *surviving* (passive tick) and for *farming* (PvE fleet tiers).
Damage XP pays for none of that. The two profiles that already stand and trade — `duelist` and
`bulwark` — take a ~4.3–5× raise while the two hang-back profiles take ~1.4–1.6×, so the Mine
Layer's entire design premise (hang back, farm, survive to the payoff — the thing cycle 121 was
built to fix) is what gets devalued.

### Quality bars, pooled per arm

| bar | baseline | 1/300 | 1/100 |
|---|---|---|---|
| matches resolving before 16:00 (> 95 %) | 95.60 PASS | 100.00 PASS | 92.31 **FAIL** |
| max single-bot kill share (≤ 40 %) | 37.55 PASS | 44.71 **FAIL** | 43.02 **FAIL** |
| bots scoring ≥ 1 kill (≥ 60 %) | 38.63 **FAIL** | 35.22 **FAIL** | 31.98 **FAIL** |
| storm deaths / all deaths (5–20 %) | 4.86 **FAIL** | 3.18 **FAIL** | 0.98 **FAIL** |
| afloat ticks in land contact (< 1 %) | 0.57 PASS | 0.51 PASS | 0.60 PASS |
| banked levels spent (> 90 %) | 99.99 PASS | 99.84 PASS | 97.67 PASS |

**Rising max-kill-share (37.6 → 44.7 → 43.0) against a falling any-kill rate (38.6 → 35.2 → 32.0) is
a snowball signature**: the rule pays the bots already winning fights, so kills concentrate in fewer
hulls. Storm deaths collapsing to 0.98 % says the storm has almost stopped being a cause of death at
1/100 — hulls die to guns first.

---

## What limits these readings — stated, not hidden

- **Two bars fail at BASELINE** (`any-kill` 38.6 % vs ≥60 %; storm deaths 4.86 % vs 5–20 %, marginal).
  Per the skill's own gate, that means **absolute** class win share here is partly decided by bot
  tactics rather than by equipment or economy. Because the condition is identical across all three
  arms, it does **not** bias the between-arm differences — which is what this question asks — but no
  arm's absolute class shares should be quoted as a balance verdict.
- **±10pp is coarser than the 4pp-wide 31–35 % band.** The strongest available claim about any class
  sitting in band is "consistent with", never "in". The ML movements are far larger than this noise;
  the BS/TB *ordering* within an arm is not callable at this tier.
- Both ON arms carry the analyzer's `tier_supported: null` by a hair (worst half-width 10.02 and
  10.06 pp against a 10.00 floor). The baseline is supported at 9.89 pp.
- **The 12:00 ring cycle mostly stops happening.** Median match duration falls to 592 s (1/300) and
  639 s (1/100), so only 19 % / 31 % of matches reach 12:00. Those late attrition targets become
  **unmeasurable rather than unmet** — a distinction that must survive into any later reading.
- Censoring: a bot afloat at match end is recorded with `life == match duration`, so the bias always
  *understates* how many are alive late.
- **Correction to `SKILL.md`:** its advisory that the attrition curve is "pooled from per-class
  quantile summaries, which is approximate" is **stale**. The analyzer reports
  `exact_survivorship: true` — the harness emits per-bot life values and the curve is exact.

---

## Reading, for a ruling that has not been made

Both rates move **both targets in the wrong direction**, and 1/100 roughly triples the whole
economy (10.9 boons per bot-match against a shipped 3.3), which is a different game rather than a
tuned one.

Neither rate is offered as a recommendation. If the *intent* behind the rule is "reward players who
actually fight rather than hide", the measured obstacle is that it rewards **damage volume**, which
is not the same thing and is what flattens the Mine Layer. Directions that were **not measured** and
would need their own campaign: paying on damage only up to some per-victim cap; paying a fraction of
the victim's *max* hp rather than raw damage (which would neutralise the hull-HP asymmetry);
crediting mine/torpedo damage at a different rate than gun damage; or lowering the passive tick to
fund the damage term instead of stacking it on top.

**Open and unruled:** whether `damageDealt` should be clamped like the XP is; and the standing
pre-existing bot-quality gap (any-kill 38.6 %, storm deaths 4.86 %) that limits every absolute class
reading in this file.

---

# Session 2 — chasing the goal behind the question (2026-08-22, same day)

Eric, on seeing the first results: *"the goal is to increase the overall number
of levels acquired… hopefully without exceeding the actual pool of cards
available"*, then, sharpening it: *"I just want to see more levels on ships, more
upgrades **without reducing the number of heals I have to spend to survive**."*
He also accepted 1/300 as a rate he likes and opened the floor to other ideas.

## THE STRUCTURAL FINDING: XP volume cannot buy you upgrades

| arm | levels / bot | → cards | → heals | heal share |
|---|---|---|---|---|
| baseline | 7.99 | 3.30 | 4.69 | **58.7 %** |
| 1/300 | 10.62 | 5.24 | 5.37 | **50.6 %** |
| 1/100 | 22.48 | 10.91 | 11.05 | **50.3 %** |

**Nearly three levels in five are spent on a heal rather than an upgrade, and
adding XP barely moves that ratio** — it scales both halves together. Bots spend
`HEAL_CHOICE` *before* considering a card (`ai/spending.ts:208`, heal test first
by ruling), so heals and upgrades compete for one pool.

The consequence is the whole session: **"more upgrades" and "more XP" are
different problems.** There are two independent levers —

- **VOLUME** (damage XP): more levels. Snowballs, widens class spread, pushes
  the top bots into the deck ceiling (56 levels / 40 boons at 1/300 vs 35/30 at
  baseline), and leaves the card:heal ratio untouched.
- **RATIO** (heal economics): each level buys more *card*. No inflation, no
  snowball, no deck-ceiling pressure.

Eric's stated goal is a RATIO statement. That reframing is this session's main
result and it was measured, not argued.

## Eric's drone-hp idea BACKFIRED, and the cause is a documented breakpoint

Proposal (his): at a rate of 1/N, a drone should be worth through damage what
its kill tier already pays, i.e. `hp = tier × N` → **75 / 150 / 225** at 1/300.

Measured (`d300drone`, 91 matches): **the Mine Layer got WORSE — 14.3 % → 9.9 %
— and the Battleship took 57.1 %.**

Cause, read out of the code rather than guessed. `shared/src/constants.ts:1257`:

> `damage: 55` … *"and it still clears the 45hp small drone at base, **which is
> the Mine Layer fleet-farming ruling (2026-08-16)**"*

A 75 hp small drone sits **above the mine's one-shot**, so the `forager` — the
ML's stronger profile, the one that farms drones — loses its entire farm. The
Battleship, with the dps and bulk to grind 150-225 hp hulls, eats the buff
instead. Attrition did not improve either (13.6 alive at 4:00 against a target
of 10, *worse* than 1/300 alone): tankier PvE means more time shooting drones
instead of each other.

**DRONE HP AND MINE DAMAGE ARE COUPLED** — the same shape as cycle 122's ruling
that hull HP and `damageControl` must move together, and the same failure mode:
moving one alone silently reprices the other. The corrected arm (`d300drone2`)
caps small at **55**, the largest value preserving the one-shot, and keeps Eric's
proportional targets for medium/large, which break nothing (the mine never
one-shot a 60 hp medium: 55 < 60 already). Going to a true 75 requires
`mine.damage` 55 → 75 as its partner — a 36 % mine buff **against players too**,
which is a far larger blast radius than the drone change it is paying for.

## Two instrument dials added this session, both DEFAULT OFF

- **`CONFIG.damageControl.levelHp`** — hp granted free on every level earned.
  Eric's own candidate (*"a weak, automatic heal that you get every level"*),
  built **in addition to** the menu heal, never instead of it: he likes the heal
  being a strategic decision and so do his players, so the fix has to target the
  SHARE it eats, not the decision.
- **`CONFIG.damageControl.levelRegenMs`** — that heal's own payout time.

**A cooldown-based global heal is REJECTED and must not be re-proposed.** Eric
has *"ruled against it many times"*; it was offered again this session in
ignorance and declined again. The distinction that keeps `levelHp` legal: it is
paced by the ECONOMY (you earn it) rather than by a CLOCK.

### The rate correction of record

Eric ruled *"25 over 5 seconds"*. Told the shared pool now drains at 10 hp/s, he
answered: *"I said 25 over 5, i meant 25 over 5. i know they are old numbers. I
intentionally gave you those numbers."* So the free heal has its OWN pool
(`ShipRecord.levelRepairHp`) at its OWN rate, `levelHp / levelRegenMs` = **5
hp/s** — deliberately HALF the menu heal's, which is what makes the free trickle
out-damageable while the paid heal still answers an emergency. The shared pool
could not deliver it: it has one global rate by construction (the anti-flask
rule), which holds inside the new channel too (pools ADD, rate fixed).

**STALE DOC FLAGGED, NOT FIXED — needs an Eric ruling.** `tickRepairs`'s own
docstring and `CLAUDE.md` both say the repair pool runs at **5 hp/s**. It does
not: `regenHp / regenMs` = 50 / 5000 = **10 hp/s**. Cycle 122 doubled `regenHp`
25 → 50 in the hull-HP pass without updating either claim, so both describe the
pre-cycle-122 game. Whether to correct the docs or restore the rate is his call
and was deliberately not taken. (CLAUDE.md's *"~25s per banked level"*
sudden-death figure is unaffected — it derives from a heal's total 100 hp
against 4 hp/s of storm, not from the drain rate.)

Also found while testing: **`tickRepairs` runs BEFORE `tickXp` in `STEP_ORDER`**,
so a level's pool is not drained in its own tick and payout begins the next one.

## Arms still running at time of writing

`heal2x` (no damage XP, heal potency doubled — also the CEILING on what a
"heal-boost card line" could buy, since a card version is a paid opt-in subset),
`d300heal`, `lvlheal25`, `d300lvl25`, `d300drone2`. Nine arms total.

---

# The full ten-arm campaign — results and ranked proposals

91 matches per arm, `--roster even` (verified on every arm), 100 % resolved,
±10pp coarse tier. Targets: each class **31-35 %** (spread < 4pp), and
**10 / 5 / 2.5** hulls alive at 4:00 / 8:00 / 12:00.

| arm | levels | cards | heals | heal % | BS | TB | ML | spread | 4:00 | 8:00 | 12:00 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 7.99 | 3.30 | 4.69 | 58.7 | 40.7 | 30.8 | 28.6 | **12.1** | 13.4 | 5.4 | 1.5 |
| heal2x | 8.13 | **4.30** | 3.83 | 47.1 | 41.8 | 27.5 | 30.8 | **14.3** | 14.1 | 5.4 | 1.4 |
| lvlheal25 | 7.78 | 4.00 | 3.77 | 48.5 | 38.5 | 39.6 | 22.0 | 17.6 | 13.5 | 4.9 | 1.1 |
| heal2xmap | 7.84 | 4.16 | 3.68 | 46.9 | 46.2 | 33.0 | 20.9 | 25.3 | **13.0** | **5.0** | 1.2 |
| dmg300 | 10.62 | 5.24 | 5.37 | 50.6 | 40.7 | 45.1 | 14.3 | 30.8 | 13.0 | 4.0 | 0.5 |
| d300heal | 12.15 | **7.30** | 4.83 | 39.8 | 54.9 | 36.3 | 8.8 | 46.2 | 14.1 | 4.2 | 0.4 |
| d300lvl25 | 10.98 | 6.56 | 4.39 | 40.1 | 46.2 | 38.5 | 15.4 | 30.8 | 12.8 | 3.5 | 0.4 |
| d300drone | 11.55 | 6.21 | 5.31 | 46.1 | 57.1 | 33.0 | 9.9 | 47.3 | 13.6 | 4.1 | 0.4 |
| d300drone2 | 11.51 | 6.12 | 5.37 | 46.7 | 49.5 | 40.7 | 9.9 | 39.6 | 13.6 | 4.2 | 0.4 |
| dmg100 | 22.48 | 10.91 | 11.05 | 50.3 | 50.5 | 46.2 | 3.3 | 47.3 | **11.2** | 3.0 | 0.6 |
| **target** | — | — | — | — | 31-35 | 31-35 | 31-35 | **< 4** | **10.0** | **5.0** | **2.5** |

## The three results that matter

**1. THE DAMAGE-XP RULE IS THE SOLE SOURCE OF THE CLASS DAMAGE.** Every arm
containing 1/300 lands at **30.8-47.3 pp** spread; every arm without it stays at
**12.1-25.3**. Across five independent combinations there is no configuration in
which damage XP is present and the field is close. Only `d300heal`'s ML movement
is individually significant (−19.8 pp, CI[−30.7, −8.5]) — but the *pattern* across
five arms is not a coincidence of one noisy reading.

**2. HEAL ECONOMICS BUYS UPGRADES ESSENTIALLY FREE.** `heal2x` is **+30 % cards
on +1.8 % levels**; `lvlheal25` is **+21 % cards on −2.6 % levels**. Neither
moves any class significantly (largest: ML +2.2 pp and −6.6 pp, both CIs
spanning zero). This is the lever that answers Eric's goal — *"more upgrades
without reducing the number of heals I have to spend to survive"* — because it
attacks the RATIO rather than the volume, and survivability goes UP rather than
being traded away.

**3. NOTHING FIXED ATTRITION, AND THE MISS IS PRE-EXISTING.** Early attrition is
3-4 hulls over target at 4:00 in **every arm including baseline** (13.4 vs 10).
Storm deaths are ~5 % of all deaths, so this is an ENCOUNTER-RATE problem, not a
storm-damage one. `map.baseRadius` 2800 → 2400 moved 4:00 only 14.1 → 13.0 and
put 8:00 exactly on target, but cost 11 pp of class spread (ML 30.8 → 20.9) — a
poor trade. **The attrition lever is not in the economy and was not found here.**

## Eric's drone-hp idea: the hypothesis was WRONG, stated for the record

Session 2 diagnosed the `d300drone` ML collapse as the mine losing its one-shot
on a 75 hp small drone (the documented 2026-08-16 fleet-farming ruling). The
corrected arm tested exactly that and **refuted it**: with small capped at 55,
preserving the one-shot, **the ML is 9.9 % in BOTH drone arms — identical.**

The correction was still worth making (BS 57.1 → 49.5, TB 33.0 → 40.7, spread
47.3 → 39.6), so the breakpoint is real; it just was not what moved the ML.

Per-profile levels give the actual mechanism:

| profile | 1/300 | drone55 | |
|---|---|---|---|
| BS bulwark | 12.50 | 14.84 | **+19 %** |
| ML forager | 11.66 | 12.56 | +8 % |
| TB duelist | 13.08 | 13.88 | +6 % |

**Raising drone hp is a BATTLESHIP buff.** The ML was already the efficient
farmer — its PvE kills barely move (4.87 → 4.93) because one-shot mines were
never its bottleneck — so making farming richer for everyone DILUTES its
comparative advantage. Drone hp is not an ML fix in any variant tested.

## Ranked proposals — none accepted, all awaiting a ruling

1. **`damageControl.instantHp`/`regenHp` 50 → 100** (`heal2x`). +30 % cards,
   +1.8 % levels, no significant class movement, survivability up. The single
   best answer to the stated goal. Cost: attrition 4:00 worsens 13.4 → 14.1.
2. **`damageControl.levelHp` 25 @ 5 hp/s** (`lvlheal25`, Eric's own idea).
   +21 % cards, −20 % heal spends, no XP inflation, and it PRESERVES the
   strategic heal decision he wants kept — the reason to prefer it over (1)
   despite the smaller card gain.
3. **Both together — UNTESTED.** Naively ~+50 % cards with no inflation, and the
   two are mechanically independent. This is the obvious next campaign and it
   was not run.
4. **`xp.damageLevels` 1/300** — only if the class cost is acceptable or the ML
   is fixed FIRST by some means not found here. It doubles cards when combined
   with a heal lever (`d300heal` +121 %, `d300lvl25` +99 %) but no tested
   combination brings spread under 30 pp.
5. **REJECTED by measurement:** drone hp at any tested value; `map.baseRadius`
   2400 as an attrition fix.

**UNTESTED and named rather than implied:** combining the two heal levers;
`zone.beatMs` / `zone.ringSteps.0` as the real attrition lever; lowering the
passive tick to FUND a damage term instead of stacking on it; a per-victim
damage cap; paying a fraction of the victim's MAX hp rather than raw damage.

## Standing caveats

- **±10pp is wider than the 4pp-wide band.** "Consistent with band" is the
  strongest claim available; individual class orderings within an arm are not
  callable at this tier. The five-arm PATTERN in result 1 is stronger than any
  single arm's CI.
- **Two bot-quality bars fail at BASELINE** (any-kill 38.6 % vs ≥60 %; storm
  deaths 4.86 % vs 5-20 %), so absolute class share is partly tactics-driven in
  every arm. Identical across arms, so between-arm differences stand.
- **The ML reading carries a known bot-tactics confound**: per CLAUDE.md the
  radar buoy has 0 deployments across 2,600 bot-matches and bots never fit an
  acquisition card, so the Mine Layer is measured with part of its kit unused.
  Its weakness may be partly a BOT problem rather than a GAME problem, and no
  campaign here can separate the two.
- Median match ends before 12:00 in every 1/300 arm, so the final ring cycle's
  attrition target is **unmeasurable rather than unmet** there.

---

# Session 3 — the split kill bounty (2026-08-22/23)

Eric: *"no XP damage bonus, instead we split the original bounty. The killer gets
1/10 of a level, and the remaining 9/10 are split proportionally between everyone
who dealt damage to that ship that contributed to the kill"*, with a recency
window so stale damage cannot claim a share. His three named variables: the
guaranteed killer fraction, the window length, and the total value of a kill.

**This is the first mechanism in the whole session that does not damage class
balance — and it may improve it.**

## Built, default off

`CONFIG.xp.assistWindowMs` is the switch AND the window (0 = shipped game, no
ledger written, killer takes everything). `CONFIG.xp.killerShare` is the
guaranteed fraction. The third variable needed no dial: it is `xp.killLevels`.
Later, `CONFIG.xp.assistEnvWeight` was added — see the dilution section.

**It REDISTRIBUTES A FIXED POT rather than minting XP per point of damage**,
which is structurally why it cannot run away the way damage→XP does. Tests pin
CONSERVATION (shares sum to the kill value), not merely each share.

Design forks resolved WITH Eric, each confirmed by him:
1. The killer also shares the remainder → a solo kill still pays full value.
2. Eligibility is a **recency gate on the attacker**, not a sliding window over
   their damage — his wording, *"if the LAST time you damaged the target was
   outside that window"* — so an eligible attacker brings their whole
   contribution. The alternative is real and deliberately not taken.
3. A storm kill still pays assists, killer share unpaid. **Recommended and
   accepted**: the guaranteed share is payment for the RISK OF CLOSING, and if
   the storm finished them nobody took that risk. Paying it anyway would make
   chip-and-let-the-storm-work as rewarding as committing.
4. Fleet damagers are ENVIRONMENT, pooled — see dilution below.
5. The bounty-holder bonus is never split (Eric: *"Yeah I'm good with that"*).
6. The ledger records CLAMPED damage, so overkill cannot inflate a share.

## Results — 91 matches per arm, roster even

| arm | killer share | window | kill value | levels | cards | BS | TB | ML | **spread** |
|---|---|---|---|---|---|---|---|---|---|
| baseline | — | — | 1.0 | 7.99 | 3.30 | 40.7 | 30.8 | 28.6 | 12.1 |
| split10w30 | 0.1 | 30 s | 1.0 | 8.13 | 3.26 | 40.7 | 29.7 | 29.7 | **11.0** |
| split10w10 | 0.1 | 10 s | 1.0 | 8.02 | 3.31 | 38.5 | 29.7 | 31.9 | **8.8** |
| split50w30 | 0.5 | 30 s | 1.0 | 8.05 | 3.28 | 37.4 | 30.8 | 31.9 | **6.6** |
| **split10w30x15** | 0.1 | 30 s | **1.5** | **8.55** | **3.53** | 36.3 | 30.8 | **33.0** | **5.5** |

**`split50w30` (6.6 pp) and `split10w30x15` (5.5 pp) are the two tightest fields
measured anywhere in this session**, against a 12.1 pp baseline and a < 4 pp
target. At 1.5× kill value all three classes sit between 30.8 % and 36.3 %, with
the **Mine Layer at 33.0 % — inside the 31-35 % band** — and levels and cards
both up 7 %.

### Why it works, and the three orthogonal knobs

Rewarding damage CONTRIBUTION rather than only the finishing blow pays the
classes that SOFTEN targets (mines, torpedoes) instead of concentrating value on
whoever lands the last hit. That is the opposite of what damage→XP did, which
paid whoever was already winning fights.

The session's structural result:

- **the SPLIT** decides *how* value is distributed → flattens the field
- **`killLevels`** decides *how much* value exists → raises levels
- **heal economics** decides how much becomes CARDS rather than heals

These are genuinely different quantities. Every earlier attempt used ONE knob to
do all three jobs, which is why damage→XP wrecked class balance and why two heal
levers compounded badly.

**And unlike damage→XP, raising `killLevels` is BOUNDED**: there are only 19
other captains, so total minted per match has a hard ceiling. `split10w30x15`'s
worst case was 37 levels; 1/100's was **187**.

### Strength of claim, stated honestly

**No individual class movement is significant at ±10pp** — the largest is ML
+3.3 pp, CI[−9.9, +16.4]. What can be said: three independent split arms all
show spread AT OR BELOW baseline, so "the split does not hurt balance" is
reasonably supported; "the split improves balance" is NOT yet established.
**This is the one result in the session worth a ±5pp campaign (360 matches),
because it is the only candidate pointing at the 31-35 % band.**

## Environment dilution — measured, and NOT interpretable on balance

Eric asked whether drone damage should reduce a player's proportional share,
framing drones as environment: *"they are technically part of the environment
just like the storm is"*. Built as `assistEnvWeight`, a WEIGHT not a flag,
because his wording was *"shouldn't count … to some extent"*.

It fixes a real edge case the un-diluted rule has: **graze a hull for 10, let the
storm take the other 240, and you collect the ENTIRE assist pot** for a graze. At
weight 1 that same graze pays 0.9 × 10/250 = 0.036.

| weight | levels | cards | BS | TB | ML | spread |
|---|---|---|---|---|---|---|
| 0 (free) | 8.13 | 3.26 | 40.7 | 29.7 | 29.7 | 11.0 |
| 0.5 | 8.06 | 3.19 | 40.7 | 19.8 | 39.6 | 20.9 |
| 1 (full) | 7.95 | 3.17 | 38.5 | 25.3 | 36.3 | 13.2 |

**THE CLASS-BALANCE COLUMN IS NOISE AND MUST NOT BE READ.** A monotonic dial
producing 11 → 21 → 13 pp is the signature of the ±10pp floor dominating, not a
real non-monotonicity. An earlier reading of this ledger's author — that
dilution specifically hurts the Torpedo Boat — fitted weight 1 and was
CONTRADICTED by weight 0.5; it is retracted here rather than left standing.

**The ECONOMY column IS readable** because it is monotonic and small: levels
8.13 → 8.06 → 7.95, cards 3.26 → 3.19 → 3.17. Full dilution costs ~2 % of levels
and ~3 % of cards. That is the honest price of the fairness fix; what it does to
class balance is UNMEASURED at this tier.

## Correction of record: the two heal levers do NOT compose

The ten-arm ledger above named "combine both heal levers" as the obvious
untested next step and predicted they were mechanically independent. **They are
not.** `healboth` (heal2x + levelHp 25, no damage XP) delivered the predicted
card gain (+42 %) but its spread was **36.3 pp** — more than double either lever
alone (14.3 and 17.6), with the Torpedo Boat collapsing to 18.7 %.

Neither individual movement clears significance (BS +14.3 pp CI[−0.2, +28.0]; TB
−12.1 pp CI[−24.2, +0.5]), so this is not proven — but it is the same magnitude
as effects called significant elsewhere, and it **falsifies the specific claim
that was made**. The safer generalisation: INDIVIDUAL levers stay tame;
COMBINATIONS do not, whichever levers they are. `d1000lvl25` shows the same
shape (35.2 pp, against 20.9 and 17.6 alone).

This also retires this ledger's earlier line that "every arm without damage XP
stays at 12-25 pp" — `healboth` is 36.3 pp with no damage XP at all.

## The 1/1000 rate (Eric: "1 XP per 10 damage")

Units agreed explicitly: 1 damage = 1 % of a level at 1/100, 3 damage at 1/300,
10 damage at 1/1000 — so "1 XP" in his phrasing means 1 % of a level.

| arm | levels | cards | spread | max levels |
|---|---|---|---|---|
| baseline | 7.99 | 3.30 | 12.1 | 35 |
| **dmg1000** | 8.86 | 3.88 | **20.9** | 38 |
| dmg300 | 10.62 | 5.24 | 30.8 | 56 |
| dmg100 | 22.48 | 10.91 | 47.3 | **187** |

**1/1000 is the first damage rate with no significant class movement** (ML −3.3
pp CI[−16.0, +9.5]). Spread cost scales roughly linearly with rate: +8.8, +18.7,
+35.2 pp. But it barely moves the ratio Eric cares about (heal share 58.7 % →
56.2 %), so it remains a WORSE DEAL than the heal levers for the same goal —
+18 % cards for +8.8 pp of spread, against heal2x's +30 % cards for +2.2 pp.

## Worst case, which Eric asked for directly

| arm | max levels | max boons |
|---|---|---|
| baseline | 35 | 30 |
| split arms | 31-37 | 22-25 |
| dmg1000 | 38 | 27 |
| dmg300 | 56 | 40 |
| **dmg100** | **187** | 40 |

**Max boons SATURATES at 40 from 1/300 upward** — those players exhaust their
deck and everything after is heals, which is exactly the ceiling Eric wanted to
stay under. The split arms are the only ones that LOWER the ceiling (max boons
22-25), because value spreads across contributors instead of concentrating on
the top earner.

Structurally the ceiling has three sources: the passive tick (hard-capped by
match length, ~16 levels), captain kills (bounded by the field, 19 others), and
**PvE fleet + damage XP — the only UNBOUNDED sources**, because fleet waves
respawn. That is what produced 187.

---

# FINAL — all 18 arms, 1,638 matches

91 matches per arm, `--roster even`, coarse ±10pp tier. Targets: each class
**31-35 %** (spread < 4pp); **10 / 5 / 2.5** alive at 4:00 / 8:00 / 12:00.

| arm | levels | cards | heals | heal % | BS | TB | ML | spread | max lv | max bn |
|---|---|---|---|---|---|---|---|---|---|---|
| baseline | 7.99 | 3.30 | 4.69 | 59 | 40.7 | 30.8 | 28.6 | 12.1 | 35 | 30 |
| heal2x | 8.13 | **4.30** | 3.83 | 47 | 41.8 | 27.5 | 30.8 | 14.3 | 35 | 29 |
| lvlheal25 | 7.78 | 4.00 | 3.77 | 48 | 38.5 | 39.6 | 22.0 | 17.6 | 37 | 34 |
| healboth | 8.23 | 4.69 | 3.54 | 43 | 54.9 | 18.7 | 26.4 | 36.3 | 33 | 31 |
| split10w30 | 8.13 | 3.26 | 4.87 | 60 | 40.7 | 29.7 | 29.7 | 11.0 | 32 | 24 |
| split10w10 | 8.02 | 3.31 | 4.71 | 59 | 38.5 | 29.7 | 31.9 | 8.8 | 35 | 25 |
| **split50w30** | 8.05 | 3.28 | 4.77 | 59 | 37.4 | 30.8 | 31.9 | **6.6** | 34 | **22** |
| **split10w30x15** | 8.55 | 3.53 | 5.02 | 59 | 36.3 | 30.8 | **33.0** | **5.5** | 37 | 29 |
| split50w30x2 | 8.63 | 3.90 | 4.71 | 55 | 42.9 | 37.4 | 19.8 | 23.1 | 50 | 40 |
| **split50w30heal** | 8.25 | **4.25** | 3.99 | 48 | 41.8 | 29.7 | 28.6 | 13.2 | 34 | 28 |
| split10w30env | 7.95 | 3.17 | 4.78 | 60 | 38.5 | 25.3 | 36.3 | 13.2 | 31 | 23 |
| split10w30env5 | 8.06 | 3.19 | 4.86 | 60 | 40.7 | 19.8 | 39.6 | 20.9 | 33 | 26 |
| dmg1000 | 8.86 | 3.88 | 4.97 | 56 | 46.2 | 28.6 | 25.3 | 20.9 | 38 | 27 |
| d1000lvl25 | 8.80 | 4.77 | 4.02 | 46 | 53.8 | 27.5 | 18.7 | 35.2 | 41 | 37 |
| dmg300 | 10.62 | 5.24 | 5.37 | 51 | 40.7 | 45.1 | 14.3 | 30.8 | 56 | 40 |
| d300heal | 12.15 | **7.30** | 4.83 | 40 | 54.9 | 36.3 | 8.8 | 46.2 | 56 | 40 |
| d300lvl25 | 10.98 | 6.56 | 4.39 | 40 | 46.2 | 38.5 | 15.4 | 30.8 | 55 | 40 |
| dmg100 | 22.48 | 10.91 | 11.05 | 49 | 50.5 | 46.2 | 3.3 | 47.3 | **187** | 40 |

## The four durable results

**1. THE ONLY MECHANISM THAT DOES NOT COST BALANCE IS THE SPLIT BOUNTY.** Four
split arms land at 5.5-11.0 pp spread against a 12.1 pp baseline — the only
family in the session at or below it. `split10w30x15` puts all three classes in
30.8-36.3 % with the Mine Layer at 33.0 %, inside the band, at +7 % levels and
+7 % cards.

**2. HEAL ECONOMICS IS THE ONLY EFFICIENT SOURCE OF UPGRADES.** `heal2x` buys
+30 % cards for +1.8 % levels and 2.2 pp of spread. Every damage-XP rate buys
fewer cards per point of spread: 1/1000 is +18 % cards for +8.8 pp.

**3. COMBINATIONS DO NOT COMPOSE — MEASURED THREE TIMES, PREDICTED WRONG THREE
TIMES.** `healboth` (14.3 + 17.6 → **36.3**), `d1000lvl25` (20.9 + 17.6 →
**35.2**), `split50w30x2` (6.6 at 1.0× kill value → **23.1** at 2.0×, the clean
single-variable case). The author of this ledger predicted independence each
time and was wrong each time. **Do not reason about combinations here; measure
them.** `split50w30heal` is the one benign case (13.2 pp ≈ baseline), and even
there the split's flattening did NOT survive — it bought the card gain and gave
back the balance gain.

**4. ATTRITION WAS NEVER FIXED AND IS NOT AN ECONOMY PROBLEM.** 4:00 sits 3-4
hulls over target in EVERY arm including baseline (13.4 vs 10). Storm deaths are
~5 % of all deaths, so it is encounter rate. `map.baseRadius` 2400 moved it 1.1
hulls and cost 11 pp of spread. The zone dials (`beatMs`, `ringSteps.0`) are the
untested lever.

## The deck ceiling

Max boons SATURATES at **40** in every arm from 1/300 up, plus `split50w30x2`
and `d1000lvl25` — those players exhaust the deck and everything after is heals,
the outcome Eric wanted to avoid. The split arms are the only ones that LOWER
the ceiling (22-29), because value spreads across contributors rather than
concentrating on the top earner.

## Ranked, for a ruling

1. **`xp.assistWindowMs` 30000 + `killerShare` 0.1 + `killLevels` 1.5**
   (`split10w30x15`). Tightest field with a real economy gain: ML into band,
   spread 5.5 pp, +7 % levels, +7 % cards, no deck saturation.
2. **Add `heal2x` on top** (`split50w30heal` shape). +29 % cards, heal share
   59 → 48 %, spread ≈ baseline. Buys the upgrades; gives back the flatness.
3. **`heal2x` alone.** Simplest change on the table. +30 % cards, no class cost.
4. **Damage XP at 1/1000** if a damage-reward feel is wanted for its own sake —
   affordable (+8.8 pp) but a worse deal than any heal lever for the same goal.
5. **REJECTED by measurement:** 1/300 and 1/100 (30.8 and 47.3 pp, ML to 14.3 %
   and 3.3 %); drone hp at any value; `killLevels` 2.0; two heal levers together.

**Everything above rests on ±10pp**, which is wider than the 4pp band. No single
class movement in the split family is individually significant. The strongest
honest claim is that **four independent split arms all sit at or below baseline
spread**, which is a pattern rather than a proof. **`split10w30x15` and
`split50w30` deserve the ±5pp campaign (360 matches each) — they are the only
candidates pointing at the band.**

**Standing caveats unchanged:** two bot-quality bars fail at BASELINE (any-kill
38.6 %, storm deaths 4.86 %), so absolute class share is partly tactics-driven;
and the Mine Layer is measured with part of its kit unused (radar buoy 0
deployments in 2,600 bot-matches, acquisition cards never fitted), so its
weakness may be partly a BOT problem rather than a GAME problem.

---

# Session 4 — percentage healing (2026-08-23)

Eric: *"instead of a flat amount of healing, lets say that the heal option
restores 10% of your maximum hull as a flat heal and 10% of your missing hull
(after the flat heal) over 5 seconds"*, sweeping each percentage to 15 % and
20 %, plus the free per-level heal at 10 % of missing.

**His motivation is FEEL, not balance**, stated explicitly: *"the reason i like
the *idea* of percentage based heals is that it makes the increased hull points
upgrade *that* much more appealing… regardless of what it does to balance (which
we can fix elsewhere) I'm more interested making the game *feel* right."*

## THE MOTIVATION IS MECHANICALLY CORRECT — the shipped heal is an ANTI-SYNERGY

`shipHull` is common ×4 at +25 maxHp = **+100 max**. Under the shipped flat heal
(50 instant + 50 pooled = 100 hp, always), stacking all four drops the heal from
**40 % of your hull to 28.6 %** — hull points make damage control
*proportionally worse*. Under percentage healing the same four cards raise the
heal **40 % in absolute hp** and hold it at a constant fraction. Hull points and
damage control stop working against each other. **That is a real design win
independent of any balance number, and it is the strongest argument in this
session for the whole direction.**

## Results — 91 matches per arm

| arm | flat % | miss % | cards | heal % | BS | TB | ML | spread |
|---|---|---|---|---|---|---|---|---|
| baseline | flat 50 | flat 50 | 3.30 | 58.7 | 40.7 | 30.8 | 28.6 | **12.1** |
| **pctauto10** | — | auto 10 | **3.65** | **53.9** | **35.2** | **35.2** | 29.7 | **5.5** |
| pct10_10 | 10 | 10 | 2.18 | 73.4 | 61.5 | 9.9 | 28.6 | 51.6 |
| pct15_10 | 15 | 10 | 2.53 | 68.8 | 53.8 | 19.8 | 26.4 | 34.1 |
| pct20_10 | 20 | 10 | 2.87 | 64.8 | 54.9 | 9.9 | 35.2 | 45.1 |
| pct10_15 | 10 | 15 | 2.34 | 71.6 | 61.5 | 12.1 | 26.4 | 49.5 |
| pct10_20 | 10 | 20 | 2.57 | 68.4 | 52.7 | 17.6 | 29.7 | 35.2 |
| pct15_40 | 15 | 40 | 3.37 | 58.5 | 53.8 | 19.8 | 26.4 | 34.1 |
| pct20_50 | 20 | 50 | **3.73** | 53.7 | 61.1 | 17.8 | 21.1 | 43.3 |
| pct05_60 | 5 | 60 | 3.66 | 55.3 | 53.3 | **21.1** | 25.6 | 32.2 |

### THE SWEEP AS SPECIFIED COULD NOT CONVERGE, and why

10-20 % undersizes the POOLED half by 3-4×: the shipped heal pools a flat 50 hp,
while 10-20 % of missing pools only 7.5-21. So every arm of the original sweep
was a net NERF (cards BELOW baseline in all five), and the nerf was tangled with
the re-proportioning. The parity arms (`pct15_40`, `pct20_50`, `pct05_60`) were
added to separate them. **The two components need very different scales**: the
flat part's parity is 14-20 %, the missing part's is ~30-40 %.

### THE FINDING: it matters WHICH heal you convert, not the flat/missing mix

**Every one of the eight MENU-heal percentage arms puts the Torpedo Boat between
9.9 % and 21.1 % and the Battleship above 52 %** — every flat/missing
combination, under-strength and at parity alike. That is the most consistent
pattern in the whole session.

Converting only the FREE PER-LEVEL heal to %missing and leaving the menu heal
flat (`pctauto10`) gives **+11 % cards, heal share 58.7 → 53.9 %, and BS and TB
dead level at 35.2 % with a 5.5 pp spread — the joint-tightest field measured
anywhere in these campaigns.**

Reading: the menu heal is the emergency spend that decides engagements, so making
it hull-proportional hands the Battleship a decisive edge in sustained fights.
The auto heal is a background trickle; proportional there costs nothing.

### Eric's small-hull hypothesis: DIRECTIONALLY RIGHT, INSUFFICIENT

*"smaller hulls might prefer more %missing health as they are more likely to have
a higher % missing"* — correct BY CONSTRUCTION. Damage is ABSOLUTE, so identical
fire leaves a small hull at a lower fraction of health, and %missing pays in
proportion to that fraction while %max is strictly proportional to hull size.

Supported by the data: at fixed flat 10 %, raising missing 10 → 15 → 20 took the
TB 9.9 → 12.1 → 17.6 (monotonic); at fixed missing 10 %, raising flat 10 → 20
left it at 9.9. The missing-heavy `pct05_60` gives the best TB of the menu-heal
family. **But it does not rescue it** — 21.1 % against a 30.8 % baseline.

### The trade, stated for a ruling

**The hull-card synergy lives in the %max component of the MENU heal** — the big
visible one. So:

- `pct20_50` → synergy + near-death scaling. Bill: ~20 pp of Battleship
  advantage (BS 61.1, TB 17.8).
- `pctauto10` → near-death scaling + balance + economy. No hull-card synergy.
- Nothing tested gets all three.

Since Eric has said balance is fixable elsewhere, `pct20_50` remains a legitimate
choice — the point is that the bill is now measured rather than unknown.

### The limit that matters most here

**THE HARNESS CANNOT MEASURE APPEAL.** Bot card choice is `bestOfferIndex()` over
FIXED per-profile weights (`ai/spending.ts`), so bots cannot perceive that a
synergy became stronger and take `shipHull` at exactly the same rate either way.
**Whether the hull upgrade FEELS better to buy is structurally unmeasurable by
batch-sim and belongs to human playtest.** Everything above is the mechanical
consequence only.

### Implementation note carried forward

Percentage mode delivers the pool BY DURATION (5 s) rather than at a fixed hp/s,
because the amount now varies with how hurt the hull is. That DEPARTS from the
anti-flask rule ("pools ADD, the RATE never changes") and does so ONLY in
percentage mode — the flat path keeps its fixed rate and its anti-flask
behaviour byte-identical, pinned by a test. Eric's *"after the flat heal"*
ordering is load-bearing and also pinned: the flat part shrinks the missing pool
measured against it, so the two percentages are not interchangeable.

---

# Session 5 — Eric's RULED CONFIGURATION, measured at ±5pp (2026-08-23)

Eric, converging: *"I want the XP split. 1/10 for the killer, 9/10 split
proportionally to whomever dealt damage in the last 30 seconds, normal kill
reward. I want automatic 10% missing HP healing over 5 seconds each level up. I
want the healing upgrade to provide 10% max HP instantly plus 15% max HP over 5
seconds. Start there and run the larger test on that configuration."*
Corrected the same session to **15 % + 15 %**.

| dial | value |
|---|---|
| `xp.assistWindowMs` | 30000 |
| `xp.killerShare` | 0.1 |
| `xp.killLevels` | 1.0 (unchanged — "normal kill reward") |
| `damageControl.levelMissingPct` | 0.10 (free, per level, over 5 s) |
| `damageControl.healFlatPct` | 0.15 (instant) |
| `damageControl.healPoolPct` | 0.15 (over 5 s) |

**`healPoolPct` was BUILT for this ruling** — a pooled half sized off MAX rather
than off MISSING. Queried as a possible slip and confirmed deliberate: *"it was
not a slip."* Both shapes now exist, and choosing between them is a ruling.

## Result — 360 matches, roster even, 360/360 resolved, worst CI half-width 5.10 pp

| class | share | 95 % CI | in the 31-35 % band? |
|---|---|---|---|
| **battleship** | **56.4 %** | 51.2 – 61.4 | **NO** |
| mineLayer | 26.1 % | 21.8 – 30.9 | **NO** |
| **torpedoBoat** | **17.5 %** | 13.9 – 21.8 | **NO** |

**Spread 38.9 pp. `all_consistent = false`. NO class CI comes near the band**,
and the Torpedo Boat's upper bound sits ~10 pp below the band's floor.

**THIS IS THE FIRST WELL-POWERED CLASS READING IN THE WHOLE CORPUS OF THESE
SESSIONS.** Every other arm here ran at 91 matches / ±10 pp, where nothing short
of a 20 pp swing was distinguishable from noise. At 360 this is not a hedge.

Economy: levels 8.25 (+3 %), cards 3.54 (+7 %), heal share 58.7 → 57.1 %,
max levels 36, max boons 33. Attrition 14.3 / 5.8 / 1.4 against 10 / 5 / 2.5.

## The mechanism, and it is specific

**Percentage healing scales with `maxHp`, and the Battleship has the most of
it.** Under the flat heal every hull got 100 hp; under 15 + 15 % the BS gets 105
and the TB 75. Doubled hull HP already produces ~720 s attrition wars, and in an
attrition war sustained healing throughput decides fights — so the largest hull
was handed the largest throughput.

Cross-checked against session 4: **every configuration with ANY %max component
on the MENU heal put the TB at 9.9-21.1 %** — nine arms now, including
`pct15_40` and `pct05_60` which used %MISSING for the pooled half. So it is the
%max **instant** component specifically, not the pooled half, and not the
strength.

The split bounty flattens on its own (5.5-11.0 pp across four arms) but is
SWAMPED here rather than preserved.

## Compensation — cycle-1 sensitivities, and their limits

Read back from `batch-sim-evidence-2026-08-20.md` at Eric's request:

| dial | move | TB | BS | ML |
|---|---|---|---|---|
| `torpedo.damage` 70→50 | −29 % | **−11.4 sig** | **+12.8 sig** | −1.4 |
| `torpedo.damage` 60→45 | −25 % | −10.0 | +2.2 | **+7.7** |
| `mine.blastRadius` 48→64 | +33 % | **−11.4 sig** | −0.6 | **+11.9 sig** |
| hull HP +50 % (global) | — | −8.1 | −5.6 | **+13.6 sig** |
| `broadside.reloadMs` 30→22 | −27 % | −0.5 | **+5.0** | −4.4 |
| `gun.damage` 15→11 | −27 % | −5.6 ns | +6.3 ns | −0.7 |
| `mine.placeHalfArcDeg` / `placeRange` | — | REFUTED, no effect | | |

**Two cycle-1 lessons govern their use here.** *Which* dial matters more than how
hard it is pulled — `torpedo.damage` and `mine.blastRadius` moved TB by an
identical −11.4 pp and handed it to different classes. And **where TB's share
goes is CONTEXT-DEPENDENT**: at 506 s the Battleship collected it, at 740 s with
doubled HP the Mine Layer did. **This config runs 722 s — the second regime**,
so a torpedo buff may come out of the already-under-band Mine Layer.

**Every figure above comes from a DIFFERENT baseline** (125 hp hulls, 506 s
matches) and is directional only.

### Probes run (one dial each, 91 matches, on top of the ruled config)

- `ruledBS26` — `broadside.reloadMs` 18 s → 26 s. Nerfs the actual
  over-performer; cycle 1 says it leaves TB alone.
- `ruledTorp65` — `torpedo.damage` 50 → 65. The question is not whether TB
  gains but **whether the gain comes from the BS or the ML.**

### KEPT IN THE BACK POCKET, Eric 2026-08-23: *"its not a bad idea"*

Scale the percentage heal off the maxHp **ADDED** rather than absolute maxHp — a
flat base plus a percentage of `(maxHp − baseMaxHp)`. The hull-card synergy Eric
wants only requires that hull cards GROW the heal; it does not require the heal
to scale with the maxHp a hull started with. Absolute scaling is precisely what
hands the Battleship an advantage it never bought. A delta rule keeps the
synergy AND is class-neutral at zero cards. **NOT BUILT — needs a ruling.**

Options 1 and 2 compensate AROUND the problem; this one removes it.
