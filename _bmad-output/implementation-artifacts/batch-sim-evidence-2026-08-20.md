# Batch-sim evidence — balance cycle 1 (2026-08-20)

**Instrument:** `/balance-sim`. **Status: MEASUREMENT ONLY — no CONFIG value has been changed.**
Every number below is a reading or a *proposal awaiting an Eric ruling*. `shared/src/constants.ts`
is untouched on this branch.

**Session framing (Eric, 2026-08-20):** *"ANY AND ALL SUGGESTIONS are on the table, including changes
to the size of the map, where ships spawn, and changes to equipment mechanics beyond numbers, though
of course we should try and hit targets without these if possible. The goal is a fun game."* And:
*"I don't expect to finish the balance during this session… start moving the needle… finish up
tomorrow."* So this entry is written to be resumed cold.

## The two targets

1. **Class win share** — torpedoBoat / battleship / mineLayer each in **31–35 %**.
2. **Attrition pacing** — about half the field gone per ring cycle: 20 → ~10 → ~5 → ~2–3.

Ring-cycle boundaries were **derived from `CONFIG.zone`**, not assumed: `beatMs` 60000 × 4 beats ×
3 ring groups puts group closes at **4:00 / 8:00 / 12:00**, with sudden death running 12:00 → 16:00
(`zoneClosedAtMs` = 960000) beyond the target curve. That matches the skill's default, so the
default was used.

## Method and instrument fixes

Campaigns are `server/scripts/batchSim.mjs`, 20 bots, `--captains 0`, sharded 12 ways, merged by
variant label. **`--roster even` was passed on every run** — without it each bot rolls its own hull
and over-represented classes take wins for free, which invalidates win share outright.

Three instrument defects were found and fixed before any campaign was believed:

| fix | why it mattered |
|---|---|
| `run_campaign.py` now sets `HC_BALANCE=1` alongside `HC_DEV_OPTIONS=1` | `--tune` carries its own env gate; without it every equipment arm would have died at argv parse |
| `check_preconditions.py` roster check rewritten | it looked for a bare `addBot()`; the harness moved to a `--roster` flag, so a *passing* harness reported FAIL |
| `analyze_campaign.py` now uses exact `lifeSamples` | attrition was pooled from per-class quantile summaries (approximate). The harness emits per-bot life values, so the survivorship curve is now **exact**, with a per-class split and a `matches_reaching` censoring guard |

**Censoring, stated rather than hidden:** a bot still afloat when its match ends is recorded with
`life == match duration`, so past that point it counts as dead. Only the winner(s) are censored this
way (~1 in 20), and the bias always *understates* how many are alive late. `matches_reaching` is
what says whether a cycle happened at all.

**Operational note for the next session:** a `nohup`'d campaign is reaped when the tool call returns
but leaves orphan `node` **and** `tsx` grandchildren that keep running and write the *same* shard
filenames. This cost ~45 min of half-speed contention here. Launch campaigns with the harness's own
background mode, and if it happens kill **both** process layers. Shards write only on completion, so
a killed campaign loses everything — prefer several smaller arms over one huge one.

## Per-class equipment fit — DERIVED FROM CODE, not from docs

`CLAUDE.md`'s *"universal weapon fit… every class shares CONFIG.gun/torpedo/mine"* is **stale**.
`shared/src/sim/loadout.ts` is authoritative:

| hull | slots | hp | max speed | turn |
|---|---|---|---|---|
| torpedoBoat | gun, **torpedo**, **speedBoost** | 125 | 45 | 0.8 |
| battleship | gun, **broadside**, **starShells** | 175 | 35 | 0.4 |
| mineLayer | gun, **mine**, **radarBuoy** | 150 | 40 | 0.6 |

**Blast radius of each dial family** (measurement context, never a gate):
`gun.*` → all three, so it can only move *relative* balance second-order.
`torpedo.* speedBoost.*` → TB only · `broadside.* starShells.*` → BS only ·
`mine.* radarBuoy.*` → ML only · `shipClasses.<id>.*` → that hull only.
Acquisition cards can cross these lines in principle. The 7-5 evidence pass measured bots fitting
**none** of 2,495 acquisition offers — but that pass predates Eric's AI-tactics work, **this campaign
did not re-measure it**, and the harness emits no per-line pick breakdown to check it against. Treat
the fit above as exact for bot campaigns *provisionally*; re-measuring it is on the open list.

## Baseline — 360 matches, even roster, 100 % resolution

Roster spread **0.0** (2400 bot-matches per class), 360/360 resolved. Worst half-width **±5.13 pp**,
so the supported tier is the coarse one; treat the ranking as solid and the third decimal as noise.

| class | wins | share | 95 % CI | in 31–35 %? |
|---|---|---|---|---|
| **torpedoBoat** | 187 | **51.9 %** | 46.8 – 57.1 | **no — far over** |
| battleship | 114 | **31.7 %** | 27.1 – 36.6 | consistent |
| **mineLayer** | 59 | **16.4 %** | 12.9 – 20.6 | **no — far under** |

**The gap is 35 pp wide**, many times the CI. This is not a noise artifact.

### Attrition — every match ended by field-clearing

| checkpoint | alive | target | delta | matches still running |
|---|---|---|---|---|
| 4:00 | **7.8** | 10 | −2.2 | 100 % |
| 8:00 | **1.8** | 5 | −3.2 | 61 % |
| 12:00 | **0.2** | 2.5 | −2.3 | **10.8 %** |

Median match **506 s (8:26)**; duration p95 775 s. **All 360 matches ended `fieldCleared`** — not one
ended by storm or timeout. The 12:00 row is therefore **unmeasurable rather than unmet**: only 11 %
of matches still exist at that point.

### Validity gates — 2 of 6 bot-quality bars FAIL

| bar | measured | bar | verdict |
|---|---|---|---|
| matches resolving before 16:00 | 100 % | > 95 % | PASS |
| max single-bot kill share | 35.0 % | ≤ 40 % | PASS |
| **bots scoring ≥ 1 participant kill** | **41.5 %** | ≥ 60 % | **FAIL** |
| **storm deaths / all deaths** | **2.9 %** | 5–20 % | **FAIL** |
| afloat ticks in land contact | 0.67 % | < 1 % | PASS |
| banked levels spent before death | 99.9 % | > 90 % | PASS |

**Both failures are the same finding as target 2, not independent problems:** the field is cleared by
gunfire long before the ring does any work, so almost nobody drowns and kills concentrate in a
minority of bots. The win-share *ranking* is still actionable — a 35 pp gap cannot be manufactured by
these bars — but any claim that the *shape* of the curve reflects equipment rather than pacing must
wait until matches actually reach 12:00.

### Why TB wins and ML loses (per bot-match, n = 2400 each)

| | battleship | mineLayer | torpedoBoat |
|---|---|---|---|
| kills | 0.89 | **0.49** | **1.36** |
| damage | 460 | 434 | **555** |
| shots | 48.5 | **60.6** | **43.9** |
| **damage per shot** | 9.5 | **7.2** | **12.7** |
| life (s) | **202.6** | **243.2** | 224.5 |
| levels earned | 5.00 | 5.29 | **6.16** |
| boons fitted | 2.27 | 2.30 | **3.14** |

**The Mine Layer is not fragile — it lives the longest of the three and still wins least.** It fires
the most shots for the least damage and cannot *close*. The Torpedo Boat is the mirror: fewest shots,
most damage, most kills, and because kills pay XP it also ends with **~0.9 more boons** than either
rival, so it snowballs.

**A structural observation worth Eric's attention:** the Mine Layer's fantasy is trapping corridors as
the ring compresses — but matches end at 8:26 with the ring still large, and the 660 u endgame ring
is reached in only ~11 % of matches. *The Mine Layer's win condition mostly never happens.* The
Battleship's `starShells` is utility rather than damage, so **bot BS win share is a lower bound
against human play**, while TB's is not. Whether the same is true of ML depends on how much its
`radarBuoy` is actually contributing — measured by the buoy probe below, not assumed.

## Arm 1 — `gun.damage` 15 → 11 (−27 %), 180 matches

One dial per arm, so effects stay attributable. Same seed lattice as baseline (base 1, stride
1000003), so the arm's matches are a paired subset of the baseline's maps.

| | baseline (360) | gun.damage 11 (180) | effect | 95 % CI on the difference |
|---|---|---|---|---|
| torpedoBoat | 51.9 % | 46.4 % | −5.6 pp | −14.5 … +3.4 — **not significant** |
| battleship | 31.7 % | 38.0 % | +6.3 pp | −2.3 … +14.9 — **not significant** |
| mineLayer | 16.4 % | 15.6 % | −0.7 pp | −7.3 … +5.8 — **not significant** |
| alive @ 4:00 | 7.8 | **9.1** | +1.3 | target 10 |
| alive @ 8:00 | 1.8 | **2.3** | +0.5 | target 5 |
| alive @ 12:00 | 0.2 | 0.3 | +0.1 | target 2.5 |
| median duration | 506 s | **537 s** | **+6 %** | — |
| mean life | TB 224 / ML 243 / BS 203 | TB 250 / ML 272 / BS 233 | **+15 %** | — |

### The finding: `gun.damage` is a WEAK lever for attrition

**A 27 % cut to the game's universal weapon bought only 6 % more match length** and moved
alive @ 8:00 from 1.8 to 2.3 against a target of 5. Lives lengthened 15 %, but matches barely did —
because the gun is not what closes matches out. Torpedoes (70), mines (55) and a broadside
(3 × 20 = 60) are each several gun bursts' worth of damage in one action, and bots simply fire more
often when each shot does less.

**Consequence for the plan:** target 2 will not be reached by shaving the gun. The lever has to
scale time-to-kill against *every* damage source at once — which is what arm 4 (global hull HP)
tests, and why it was queued the moment this result landed.

**On the "ML is weak because matches end early" hypothesis:** this arm does *not* support it
(ML −0.7 pp) — but it also **did not test it**, because duration moved only 6 %. The hypothesis is
still open and needs an arm that genuinely extends matches.

## Structural finding — the mine is a DEFENSIVE weapon in an aggressive game

This is not a tuning observation; it comes straight off the mine's placement contract in
`shared/src/constants.ts`:

```
offset: deg(180)        // placed BEHIND you
placeHalfArcDeg: 60     // a rear wedge, ±60°
placeRange: 150         // within 150u astern
armDelay: 3000          // and it cannot trigger for 3s
```

**To score a mine kill you need an enemy to follow you, into your own wake, within 150 u, and stay
there for three seconds.** That is a counter-punch — it pays only when you are being *chased*.

This explains the Mine Layer's whole statistical signature without appealing to any number being
mistuned: it has the **longest life of the three hulls** (243 s) because mines genuinely deter
pursuit, and the **fewest kills** (0.49) because it has no way to *initiate*. Its 60.6 shots per
bot-match — the most of any class — are its gun, doing 7.2 damage per shot, the worst rate in the
game. The Mine Layer is fighting with one real offensive weapon while the Torpedo Boat fights with
two plus mobility.

Two compounding effects make it worse in this campaign specifically:

- **Its third slot — MEASURED, see the buoy section below. Bots deploy 4.46 buoys per bot-match.** An earlier draft of this entry repeated the 7-5
  ledger's "0 buoy deployments" figure. **That is stale and was withdrawn** (Eric, same day: *"I
  specifically ran a go on the AI tactics and made sure there was buoy play… bots should have buoy
  tactics now"*). `server/src/game/ai/equipment.ts` now carries a full `radarBuoyTactic` — recon
  available to every doctrine, plus picket siting where the buoy's own gun can serve and cover siting
  for the jamming verb — and `tactics.ts` resolves placements **above** the target guard precisely so
  a buoy gets sited when the scope is empty. The tactics exist. Whether they FIRE is measured by the
  buoy probe below, not assumed in either direction.
- **Its win condition rarely happens.** Mines pay off when space is tight; the 660 u endgame ring is
  reached in **10.8 %** of matches. The compression the Mine Layer is built for arrives after the
  match is already over.

**Therefore ML's 16.4 % is a lower bound against human play, and part of the fix may be target 2's
fix.** Any mine *number* Eric rules on should be understood against this: raising mine damage makes
a rarely-landed weapon hit harder, whereas raising the trip ring (or the placement contract) changes
how often it lands at all. Arm 3 measures the first half of that distinction.

## Arm 2 — `torpedo.damage` 70 → 50 (−29 %), 180 matches

| class | baseline | arm | effect | 95 % CI on the difference | significant? |
|---|---|---|---|---|---|
| **torpedoBoat** | 51.9 % | **40.6 %** | **−11.4 pp** | −20.2 … −2.6 | **YES** |
| **battleship** | 31.7 % | **44.4 %** | **+12.8 pp** | +4.1 … +21.5 | **YES** |
| mineLayer | 16.4 % | 15.0 % | −1.4 pp | −7.9 … +5.1 | no |

Attrition: median duration 506 → 523 s (+3 %); alive @ 4:00 7.8 → 8.4, @ 8:00 1.8 → 2.1.

### The finding: the torpedo is a real lever on TB — and it hands the win to the BATTLESHIP, not the Mine Layer

This is the **largest measured effect of the session** and the first significant one. It also carries
the session's most important negative result:

**Nerfing the Torpedo Boat does not help the Mine Layer.** ML moved −1.4 pp (indistinguishable from
zero) while the Battleship absorbed essentially the entire 11 pp the Torpedo Boat gave up, overshooting
straight past the band to 44 %. The two problems are **independent**: TB is over because its kit is
strong, and ML is under for its own reasons (it cannot initiate — see the structural finding above).

**So the plan needs two separate corrections, not one.** A TB nerf sized to land TB at ~35 % will,
on this evidence, push BS to ~40 %+ unless BS is trimmed in the same pass — and it will leave ML
roughly where it started. Any proposal that treats "bring TB down" as the whole fix is wrong.

**Sizing, stated as arithmetic rather than as a measurement:** TB needs about −17 pp to reach the top
of the band, and −29 % torpedo damage bought −11.4 pp. Linear extrapolation is *not* justified here
(one arm, one dial, wide CI), but it does say a torpedo-only correction would have to be severe, and
severe enough to reshape the weapon's identity. A smaller torpedo cut combined with a second TB dial
is the more likely shape — **untested, and named as untested**.

## The buoy question — MEASURED, after building the counter that was missing

**Eric, on reading the draft:** *"I specifically ran a go on the AI tactics and made sure there was
buoy play… bots should have buoy tactics now. and if they don't i will need to revisit that."*

He was right, and the draft was wrong to repeat the 7-5 ledger's "0 deployments in 2,600 bot-matches"
figure — that pass predates his AI-tactics work.

**Why it could not simply be looked up.** `botMetrics.ts` had no buoy instrumentation of any kind, and
`aggregate.picks` is a Summary rather than a per-line breakdown. Worse, the obvious workaround was
unsound: a probe raising `radarBuoy.reloadMs` to detect a drop in `shots` cannot work, because `shots`
is `ship.lastFireSeq` and `world.ts` is explicit that *"consumption is unconditional — lastFireSeq
advances even dead or denied."* **A bot refused a buoy every tick reads identically to one deploying
on cooldown.** The probe was cancelled unrun rather than produce a meaningless number.

**So the counter was built** (this branch): `BotCollector` diffs the World's own `buoys` / `mines`
maps by id each tick and credits the owner, surfacing `buoysDeployed` / `minesLaid` per bot-match plus
`buoys` / `mines` table columns. Read-only over World state; 1593 server tests green; the tests are
fail-proven and pin the discrimination in BOTH directions.

### Result — 24 matches, even roster, per bot-match

| class | n | **buoys** | **mines** | shots | kills | life (s) |
|---|---|---|---|---|---|---|
| battleship | 162 | 0.00 | 0.09 | 44.8 | 0.91 | 186.9 |
| **mineLayer** | 156 | **4.46** | **6.14** | 57.6 | **0.38** | 231.0 |
| torpedoBoat | 162 | 0.00 | 0.00 | 42.3 | 1.45 | 215.7 |

| profile | buoys | mines | kills |
|---|---|---|---|
| forager (ML) | **4.87** | 6.19 | 0.41 |
| trapper (ML) | **4.07** | 6.10 | 0.36 |

**The buoy tactics work.** Both Mine Layer profiles deploy, at ~4.5 buoys per bot-match — roughly one
every 50 s of life, which against a 30 s reload and a 20 s duration is close to as often as the
equipment allows. **The "0 deployments" figure is dead and must not be cited again.**

### And this INVERTS the Mine Layer diagnosis

The earlier draft guessed ML was playing "2-slot against TB's 3". The opposite is true: **the Mine
Layer uses its whole kit harder than any other hull** — 4.5 buoys *plus* 6.1 mines *plus* the most
gun shots of any class (57.6) — and converts that into **0.38 kills**, a quarter of the Torpedo Boat's
1.45 off a third more actions.

**ML's problem is CONVERSION, not usage or engagement.** Six mines laid per bot-match against 0.38
kills is roughly **16 mines per kill**, and those kills include gun kills, so the true mines-per-mine-
kill figure is worse still. The mines are being laid, in quantity, by an aggressive brain — and they
are not connecting. That is consistent with the placement contract (astern, ≤150 u, 3 s arm delay)
being the binding constraint rather than any mine *number*, which is exactly what the
`mine.placeHalfArcDeg` 60 → 180 arm now queued is built to test.

**Incidental finding:** battleships laid 0.09 mines per bot-match despite mines not being in the BS
fit — so acquisition cards DO fire occasionally, and the flat claim that "bots never fit one" is also
too strong. Rare, but non-zero.

## Arm 3 — `mine.blastRadius` 48 → 64 (+33 %), 180 matches — THE BEST RESULT OF THE CYCLE

Note this dial moves **two** rings, because the trip ring is derived: `triggerRadius = blastRadius ×
CONFIG.mine.triggerFactor (2/3)`, so 32 → 42.7 u. That derivation is the cycle-95 Eric ruling and is
re-pinned post-fold, so it cannot be tuned independently — which is precisely why this dial addresses
*connection probability* and not just damage area.

| class | baseline | arm | effect | 95 % CI on the difference | significant? |
|---|---|---|---|---|---|
| **torpedoBoat** | 51.9 % | **40.6 %** | **−11.4 pp** | −20.2 … −2.6 | **YES** |
| battleship | 31.7 % | 31.1 % | −0.6 pp | −8.9 … +7.7 | no |
| **mineLayer** | 16.4 % | **28.3 %** | **+11.9 pp** | +4.3 … +19.6 | **YES** |

Attrition: median 506 → 519 s; alive @ 4:00 7.8 → 7.3, @ 8:00 1.8 → 1.8. **Essentially unmoved** —
this dial is close to attrition-neutral, which is a virtue here.

### Why this is the standout

**It fixes both ends of the spread at once and leaves the middle alone.** Class spread collapses from
**35.5 pp** (51.9 − 16.4) to **12.3 pp** (40.6 − 28.3) on a single dial, with the Battleship — the
one class already in band — statistically untouched at 31.1 %.

Contrast arm 2: `torpedo.damage` moved TB by an identical −11.4 pp but handed all of it to the
Battleship and left ML at 15 %. **Same-sized nerf to the same class, completely different
redistribution.** That is the cycle's clearest evidence that *which* dial you pick matters more than
how hard you pull it.

**And it is targeted rather than lucky.** The buoy instrumentation showed ML laying ~16 mines per
kill — laying plenty, connecting rarely. Widening the trip ring attacks exactly that, and the
predicted effect appeared. The Torpedo Boat pays for it twice over: it is the fastest hull (most
likely to run into a trip ring it did not see) and the thinnest at 125 hp, so a 55-damage mine is
44 % of its life. The dial taxes the over-performing class hardest **by construction**, not by
coincidence.

### What it does NOT do, and the risks to weigh

- **It does not fix attrition.** Like every other dial this cycle, match length barely moved.
- **The resulting split is 41 / 31 / 28, not 33 / 33 / 33.** TB is still ~6 pp over the band and ML
  ~3 pp under. This is a large step, not a landing.
- **Feel risk, unmeasured and flagged rather than hidden:** a 64 u blast with a 42.7 u trip ring is a
  big object. Bots cannot tell us whether that reads as fair or as an invisible minefield to a human
  who never sees the mine before it arms. **A smaller step (56 u → trigger 37.3 u) was not tested**
  and is the obvious candidate if 64 feels oppressive in the water.

## The pattern across every arm: lethality dials do not control match length

| arm | dial | Δ median duration | alive @ 4:00 | alive @ 8:00 |
|---|---|---|---|---|
| baseline | — | 506 s | 7.8 | 1.8 |
| arm 1 | `gun.damage` −27 % | 537 s (**+6 %**) | 9.1 | 2.3 |
| arm 2 | `torpedo.damage` −29 % | 523 s (**+3 %**) | 8.4 | 2.1 |
| arm 3 | `mine.blastRadius` +33 % | 519 s (**+3 %**) | 7.3 | 1.8 |

**Three dials, two of them large cuts to a hull's main weapon, and match length moved by at most 6 %.**
Individual lives lengthen (arm 1: +15 %) but the match still ends at roughly the same time. Target 2
is **untouched by everything measured this cycle**, and the target needs alive @ 8:00 to roughly
triple.

**The hypothesis this points to:** if time-to-kill barely moves match length, then match length is not
set by how fast bots *kill* — it is set by how fast they *find each other*. **Encounter rate, not
lethality, is the binding constraint.** Bots hunt continuously, so lowering damage buys longer
individual fights while the same sequence of eliminations proceeds on roughly the same clock.

Two arms now queued test this from opposite ends: **global hull HP +50 %** (the strongest possible
time-to-kill lever — it scales against *every* damage source at once, which is what `gun.damage`
alone could not do), and **`map.baseRadius` 2800 → 3600** (+65 % water at the same roster, attacking
encounter rate directly while leaving the 660 u endgame ring and its clock untouched, so only the
early and mid game get sparser — exactly where the curve misses).

**Caveat that belongs with any attrition conclusion:** bots hunt more relentlessly than humans do.
Human players hide, disengage, and rotate with the ring. Bot attrition is therefore plausibly an
*upper* bound on real attrition, and a curve tuned to satisfy bots may over-correct for humans. This
cannot be resolved with this instrument — it needs a playtest.

## Proposals — cycle 1, ranked purely by measured effect size

**Nothing here has been applied. Every line is awaiting an Eric ruling**, and `shared/src/constants.ts`
is untouched on this branch.

### 1. `mine.blastRadius` 48 → 64 — the strongest measured result

- **Effect:** ML **+11.9 pp** (16.4 → 28.3, significant) · TB **−11.4 pp** (51.9 → 40.6, significant) ·
  BS −0.6 pp (unchanged). Class spread **35.5 pp → 12.3 pp**.
- **Sample:** 180 matches vs a 360-match baseline, even roster, 100 % resolution.
- **Attrition cost:** none measurable (median 506 → 519 s).
- **Blast radius:** ML fit only — but it *taxes* TB hardest, because TB is the fastest hull and the
  thinnest at 125 hp.
- **Also moves:** the trip ring, derived at `× 2/3` → 32 → 42.7 u. That coupling is the point, not a
  side effect: it addresses ML's measured failure (≈16 mines laid per kill).
- **Risk:** a 64 u blast with a 42.7 u trip ring is a large object and its *feel* is unmeasured.
  **Untested fallback: 56 u** (trigger 37.3 u) if it reads as oppressive on the water.

### 2. `torpedo.damage` 70 → 50 — effective on TB, but redistributes wrongly

- **Effect:** TB **−11.4 pp** (significant) · BS **+12.8 pp** (significant, overshoots to 44.4 %) ·
  ML −1.4 pp (nothing).
- **Recommendation: do not take this alone.** It fixes TB by breaking BS, and leaves ML where it was.
  It is listed second because its effect size is real and equal to arm 3's on TB — the difference is
  entirely in *where the wins go*.
- Useful only as part of a paired change that also trims BS.

### 3. `gun.damage` 15 → 11 — weak on both targets

- **Effect on win share:** nothing significant (TB −5.6, BS +6.3, ML −0.7; every CI crosses zero).
- **Effect on attrition:** the best of the three, and still small — +1.3 alive @ 4:00, +0.5 @ 8:00,
  +6 % duration.
- **Recommendation: not worth taking for balance.** The gun is universal, so it can only move relative
  standing second-order, and the measurement agrees.

### Open, queued, or unmeasured — carried into cycle 2

| item | status |
|---|---|
| global hull HP +50 % | **running** — the real time-to-kill lever for target 2 |
| broadside 4 turrets → 6 at 15 dmg (Eric's request) | **queued** |
| `mine.placeHalfArcDeg` 60 → 180 | **queued** — tests whether ML's deficit is the rear-only contract |
| `map.baseRadius` 2800 → 3600 | **queued** — the encounter-rate hypothesis for target 2 |
| combined TB-down + ML-up pass | **not run** — arms 2 and 3 say the two need separate dials |
| feel of a 64 u mine blast | **unmeasurable here** — needs a playtest |
| whether bot attrition over-states human attrition | **unmeasurable here** — needs a playtest |
| per-line boon pick breakdown | **harness gap** — `aggregate.picks` is a Summary, so "what do bots actually build" is still unanswerable |

## Arm 4 — global hull HP +50 % (TB 125→188, BS 175→263, ML 150→225), 180 matches

**This is the attrition lever. It is also a correction to the hypothesis in the section above.**

### Attrition — the first arm to move the curve at all

| checkpoint | baseline | arm 4 | target | matches reaching (base → arm) |
|---|---|---|---|---|
| 4:00 | 7.8 | **11.1** | 10 | 100 % → 100 % |
| 8:00 | 1.8 | **4.0** | 5 | 61 % → **95 %** |
| 12:00 | 0.2 | **1.0** | 2.5 | 11 % → **42 %** |
| median duration | 506 s | **668 s (+32 %)** | — | — |

Mean life rose on every hull (BS 203→271, ML 243→347, TB 225→295). **Alive @ 4:00 now slightly
overshoots the target**, @ 8:00 lands at 4.0 against 5, and @ 12:00 is still short — but the third
cycle went from essentially never happening (11 % of matches) to happening in **42 %**, so it is
becoming measurable rather than hypothetical.

### Win share

| class | baseline | arm | effect | 95 % CI | significant? |
|---|---|---|---|---|---|
| torpedoBoat | 51.9 % | 43.9 % | −8.1 pp | −17.0 … +0.8 | no |
| battleship | 31.7 % | 26.1 % | −5.6 pp | −13.6 … +2.5 | no |
| **mineLayer** | 16.4 % | **30.0 %** | **+13.6 pp** | +5.9 … +21.3 | **YES** |

### CORRECTION: "lethality dials do not control match length" was too broad

The section above generalised from three arms — `gun.damage`, `torpedo.damage`, `mine.blastRadius` —
that all moved duration by ≤ 6 %, and concluded that **encounter rate** rather than lethality must be
the binding constraint on match length. **Arm 4 shows that conclusion was wrong, or at least
premature.** Hull HP is a pure time-to-kill lever and it moved median duration **+32 %**, five times
anything before it.

The honest explanation is narrower and does not need a new mechanism: **the first three dials were
each too narrow.** Every one touched a single weapon, and no single weapon is most of the damage in
this game — the gun, the torpedo, the mine and the broadside all contribute, so cutting one by ~30 %
cuts total lethality by far less, and bots partly compensate by firing more. HP scales against *every*
damage source simultaneously, which is why it is the first dial to actually bite.

**The `map.baseRadius` arm is still queued and still worth running**, because encounter rate remains
an untested independent lever — but it is no longer the leading explanation, and it should not be
described as such.

### And it confirms the ML/pacing coupling that arm 1 failed to test

The baseline section proposed that the Mine Layer is weak *partly because matches end before its win
condition arrives*. Arm 1 appeared to refute it (ML −0.7 pp) — but arm 1 moved duration only 6 %, so
it never actually tested the claim, which was flagged at the time.

Arm 4 moved duration 32 % and **ML gained +13.6 pp, the only significant class effect in the arm.**
That is the coupling, measured: **give the Mine Layer a longer match and it converts.** Targets 1 and
2 are not independent problems for this hull.

**Resulting split 43.9 / 30.0 / 26.1** — spread 17.8 pp, better than baseline's 35.5 but worse than
arm 3's 12.3 pp. TB remains the outlier in every arm run so far.

**Untested and now the obvious candidate: `mine.blastRadius` 64 AND global HP +50 % together.** Arm 3
fixes the spread, arm 4 fixes the pacing, and both independently help ML. Whether they compose or
double-count on ML is exactly the kind of thing that must be measured rather than assumed.

## Arm 5 — the broadside redesign (Eric's request): 4 turrets → 6, 15 dmg/shell

**Eric, 2026-08-20:** *"making the broadside start with 4 guns and go up to 6 through upgrades, but
only does 15 damage per projectile (instead of 20)."*

Expressible as exactly **two** dials — `broadside.turrets` 3 → 4 and `broadside.damage` 20 → 15 —
because `broadsideTurrets` is a rare ×2 card at +1 each, so a base of 4 yields a maxed 6 for free with
no card change. **Base barrage alpha is unchanged at 60** (3×20 → 4×15); a maxed barrage falls
100 → 90. The two dials move together as one design, so their individual contributions are **not**
separable from this arm.

| class | baseline | arm | effect | 95 % CI | significant? |
|---|---|---|---|---|---|
| torpedoBoat | 51.9 % | 51.1 % | −0.8 pp | −9.8 … +8.1 | no |
| battleship | 31.7 % | 30.0 % | −1.7 pp | −9.9 … +6.6 | no |
| mineLayer | 16.4 % | 18.9 % | +2.5 pp | −4.4 … +9.4 | no |

Attrition: median 506 → 505 s. Battleship mean life 202.6 → 201.4 s. **Nothing moved.**

### The weapon DID change — the change just does not reach win share

| battleship, per bot-match | baseline | arm 5 |
|---|---|---|
| damage dealt | 460.08 | **451.44** (−1.9 %) |
| kills | 0.89 | **0.95** (+6.7 %) |
| shots | 48.49 | 48.16 |
| damage per shot | 9.49 | 9.37 |

**Slightly less damage, slightly more kills** — which is exactly the consistency-for-spike trade the
design predicts. A denser fan of weaker shells lands *some* shells more often, so less of the barrage
is wasted as overkill on a hull that was already dying, and more of it arrives as a finishing blow.
The effect is real and in the predicted direction; it is simply far too small to move a win share.

### Reading: this is a FREE design change, not a fix

It costs nothing in balance terms — every class effect is inside noise, pacing is untouched, and the
Battleship's standing is statistically identical. **So if Eric wants 4→6 at 15 for feel, the evidence
says he can have it without paying for it elsewhere.** What it will not do is help with either target.

Two caveats worth keeping: bots may under-exploit the consistency gain (they do not choose engagements
the way a human does, so a more reliable weapon is worth more in human hands than this measures), and
the **maxed** case is where the change actually bites — 6×15 = 90 against 5×20 = 100 — which no arm
here isolates, because only some bots reach a full turret stack.

## Arm 6 — `mine.placeHalfArcDeg` 60 → 180 — MY HYPOTHESIS, REFUTED

| class | baseline | arm | effect | 95 % CI | significant? |
|---|---|---|---|---|---|
| torpedoBoat | 51.9 % | 53.9 % | +1.9 pp | −7.0 … +10.9 | no |
| battleship | 31.7 % | 31.7 % | +0.0 pp | −8.3 … +8.3 | no |
| **mineLayer** | 16.4 % | **14.4 %** | **−1.9 pp** | −8.3 … +4.5 | no |

Median duration 506 → 494 s. **The Mine Layer did not improve — it drifted slightly the wrong way.**

**This refutes the structural claim made earlier in this entry.** The baseline section argued that the
mine's rear-only placement sector (`offset` 180°, ±60°) was the binding constraint on ML — a
counter-punch weapon that only pays when you are chased. Opening placement to the **full circle**
should have released exactly that, and it did nothing.

**What the refutation leaves standing, and what it points at.** Widening the *arc* without widening the
*range* is a smaller change than it sounds: `placeRange` is 150 u, so a Mine Layer can now mine its own
forward path but still cannot put a trap on anybody else's water. The ability to *project* a mine was
never granted, so "ML cannot initiate" survives as an explanation while "the rear sector is why"
does not.

`mine.placeRange` 150 → 400 is queued as the direct test of the surviving half. **Recorded as a
refuted hypothesis rather than quietly dropped**, because the next session should not spend another
campaign rediscovering that the arc is not the lever.

## Arm 7 — `map.baseRadius` 2800 → 3600 (+65 % water), 180 matches

The independent test of the encounter-rate idea, kept in the queue after arm 4 undercut it.

| | baseline | map 3600 | target |
|---|---|---|---|
| alive @ 4:00 | 7.8 | **9.1** | 10 |
| alive @ 8:00 | 1.8 | **2.4** | 5 |
| alive @ 12:00 | 0.2 | 0.3 | 2.5 |
| median duration | 506 s | **529 s (+5 %)** | — |
| mean life | BS 203 / ML 243 / TB 225 | BS 228 / ML **288** / TB 244 | — |

Win share TB 51.1 % / BS 27.2 % / ML 21.7 % — **no significant class effect** (largest, ML +5.3 pp,
CI −1.9 … +12.4).

### Encounter rate is a real lever, but a weak one — and the ring is why

**+65 % water bought +5 % match length.** That is real and correctly signed, but it sits alongside
`gun.damage`'s +6 % and far below hull HP's **+32 %**. Arm 4's correction stands and is now confirmed
from a second, independent direction: **time-to-kill dominates; encounter rate is secondary.**

The instructive part is the gap between the two rows. Individual lives lengthened substantially —
the Mine Layer gained **+19 %** (243 → 288 s) — while the match itself gained only 5 %. Ships spend
longer alive and further apart, and the match still ends at about the same time.

**The reason is that the ring's clock does not care how big the map is.** Ring radii are geometric
steps from map radius down to a terminal 660 u fixed at 4:00 / 8:00 / 12:00, so enlarging the map
lengthens the *early* transits and then compresses everyone into the same endgame on the same
schedule. A bigger ocean buys time before the first ring and almost nothing after it.

**Consequence for tuning:** reaching the 8:00 and 12:00 targets by map size alone would need an
enormous map, which costs long empty transits — a fun problem, not just a balance one. **If pacing is
to be bought with geometry, the honest dial is the ring's clock (`zone.beatMs`) rather than the map's
radius** — untested this cycle, and named as untested. That is a bigger decision than a number: it
moves the ratified 4:00 / 8:00 / 12:00 / 16:00 timeline, which is Eric's to rule on.

## Arm 8 — COMBINED: `mine.blastRadius` 64 + hull HP +50 %, 180 matches

The two best single arms together. **They compose on the Mine Layer — and overshoot.**

| class | baseline | arm 3 alone | arm 4 alone | **combined** | effect vs baseline | significant? |
|---|---|---|---|---|---|---|
| torpedoBoat | 51.9 % | 40.6 % | 43.9 % | **41.1 %** | −10.8 pp | **YES** |
| battleship | 31.7 % | 31.1 % | 26.1 % | **22.2 %** | −9.4 pp | **YES** |
| mineLayer | 16.4 % | 28.3 % | 30.0 % | **36.7 %** | **+20.3 pp** | **YES** |

Attrition: median **673 s**; alive @ 4:00 **10.7** (target 10), @ 8:00 **3.6** (target 5), @ 12:00 1.0
(target 2.5); matches reaching 8:00 **94 %**, reaching 12:00 **41 %**.

### It composes sub-additively, and the spread gets WORSE

ML's two gains were +11.9 and +13.6 separately, and **+20.3 together** — real composition, well short
of the +25.5 naive sum, which is what should be expected as a share approaches saturation.

**But the class spread widened: 12.3 pp (arm 3 alone) → 18.9 pp (combined).** ML overshoots the band
to 36.7 % and **the Battleship collapses to 22.2 %**, becoming the worst class in the game — it lost
ground in *both* component arms (−0.6 and −5.6) and those losses compounded. Meanwhile TB is still
6 pp over.

**So the combination is the best PACING result of the cycle and NOT the best BALANCE result.** Taking
both at full strength would trade a Torpedo Boat problem for a Battleship problem.

## Arm 9 — `mine.placeRange` 150 → 400 — the second placement hypothesis, ALSO REFUTED

| class | baseline | arm | effect | significant? |
|---|---|---|---|---|
| torpedoBoat | 51.9 % | 52.8 % | +0.8 pp | no |
| battleship | 31.7 % | 33.9 % | +2.2 pp | no |
| **mineLayer** | 16.4 % | **13.3 %** | **−3.1 pp** | no |

Median duration 506 → 500 s. **Nothing.** As with the arc, ML drifted slightly the wrong way.

### Both placement hypotheses are dead — and that is a positive finding about what ML IS

Two independent attempts to let the Mine Layer *project* a trap — a full-circle placement sector
(arm 6) and a 2.7× placement range (arm 9) — produced no improvement whatsoever. What *did* work was
a bigger trip ring (+11.9 pp) and a longer match (+13.6 pp).

**The Mine Layer is a zone-control hull whose payoff scales with mine FOOTPRINT × TIME, not with
mobility or reach.** Giving it a longer arm does nothing; giving its threat more area, or more match
to apply it in, works. That is a design characterization worth having, and it was not obvious before
the measurements — the earlier draft of this ledger argued the opposite case with some confidence.

**Methodological caveat, stated because it weakens these two null results specifically:** `blastRadius`
works *passively* — it needs no new bot behaviour to pay off — whereas a wider arc and a longer
placement range only pay if the AI actually exploits them. A bot policy that keeps dropping mines
close and astern would mask a real effect. **These two nulls are therefore weaker evidence than arm
3's positive**, and if Eric believes in the mechanic, the honest next step is to check the bot's mine
tactic before concluding the mechanic is worthless to a human.

## Where cycle 1 leaves the two targets

| configuration | TB | BS | ML | spread | alive 4:00 | alive 8:00 | median |
|---|---|---|---|---|---|---|---|
| target | 31–35 | 31–35 | 31–35 | ~4 | 10 | 5 | — |
| **baseline** | 51.9 | 31.7 | 16.4 | 35.5 | 7.8 | 1.8 | 506 s |
| `mine.blastRadius` 64 | 40.6 | 31.1 | 28.3 | **12.3** | 7.3 | 1.8 | 519 s |
| hull HP +50 % | 43.9 | 26.1 | 30.0 | 17.8 | **11.1** | **4.0** | **668 s** |
| both | 41.1 | 22.2 | 36.7 | 18.9 | 10.7 | 3.6 | 673 s |

**Neither target is met, and the cycle was not expected to meet them.** What it produced is a
measured map of which dials move what:

- **`mine.blastRadius` is the best balance dial found** — one number, spread 35.5 → 12.3 pp.
- **Hull HP is the only real pacing dial found** — +32 % duration where every single-weapon dial
  managed ≤ 6 %.
- **The Torpedo Boat is over in every single configuration tested.** Nothing yet brings it into band
  without breaking another class.

### The recommended cycle-2 experiment (not a proposal — a test)

Starting from **hull HP +50 %** (43.9 / 26.1 / 30.0), the remaining gap is *TB down ~9 pp, BS up
~7 pp* — which is very close to the shape arm 2 produced on its own (`torpedo.damage` gave TB −11.4,
BS +12.8, ML −1.4). **`HP +50 % + a moderate torpedo cut` is therefore the most promising untested
combination**, with a milder cut (70 → 60) the more likely landing than the 70 → 50 already measured.

**This is arithmetic on separate arms, not a measurement.** Arm 8 has just demonstrated that effects
compose sub-additively and that losses compound on a third class, so the combination must be run
before any of it is believed.

### Open questions only Eric can answer

1. **Is a 64 u mine blast (42.7 u trip ring) acceptable to feel?** The strongest balance dial found is
   also the one bots cannot evaluate. 56 u is the untested fallback.
2. **May the ring clock move?** `zone.beatMs` is the honest pacing dial if geometry is to carry it,
   and it changes the ratified 4:00 / 8:00 / 12:00 / 16:00 timeline.
3. **Should the Battleship be protected?** Every configuration that fixes TB and ML pushes BS down.
   It may need a compensating buff in the same pass rather than being left to absorb the change.
4. **Do the bots' mine tactics use a wider arc or longer range at all?** Two null results depend on it.
