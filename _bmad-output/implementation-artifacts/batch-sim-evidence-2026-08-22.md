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
