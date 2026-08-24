# Upgrade Winrate Report — 2026-08-24

**2,499 bot matches, ~50,000 bot-lives, every card in the catalog measured.** Run against `development` (post-cycle-129: XP assist split + per-level auto-heal). Instrument: the batch-sim harness with new per-upgrade evidence surface (`--raw`), blind-vacuum test profiles (`--bot-profile random*`) — flat temperament, **uniformly random card picks**, profile heal thresholds kept (Eric's chosen policy: heals by need, cards at random).

## The instrument, and how to read the numbers

- **Arms**: `mixed` — 1,000 matches, 20 bots, classes dealt 7/7/6 rotating per match (campaign totals exactly even: 6,672/6,664/6,664). `monoTB`/`monoBS`/`monoML` — 500 matches each of 20 identical hulls (monoTB 499: one match failed at runner level and was recorded-and-skipped, 1 of 2,500).
- **Win** = placement 1 off the authoritative `Match.placements` (the same map the death banner uses) in a resolved match. All 2,499 matches resolved (`fieldCleared`), zero draws, zero shard failures, zero duplicate match seeds across arms.
- **Raw winrate is survival-confounded**: winners live longer and buy more cards, so *every* card's raw winrate sits above the 5% baseline. The quality metric is the **ordinal-matched lift**: because picks are uniformly random among the 4 offered, the card taken at pick #i is effectively randomly assigned — so comparing a card's wins against the pool's win probability *at the same pick ordinal, within the same class* removes both the survival confound and the class confound. **Lift 1.00 = an average pick at that moment.** Lift is opportunity-relative: a card below 1.00 isn't necessarily "does nothing" — it means picking it was worse than what the average alternative delivered.
- **Pooled lift** in the master table sums wins and expected wins across the six class-conditioned scopes (mixed per-class × 3, mono arms × 3). CIs are Wilson intervals scaled to lift (approximate).

### What the vacuum rig is and is not

This measures card value **with the picker's taste and temperament removed**, in bot hands. It is *not* the shipped game's balance: the shipped bots run tuned profiles, and humans differ again. Two structural consequences to keep in mind:

1. **Class share under the rig: Battleship 69.2%, Mine Layer 15.7%, Torpedo Boat 15.1%** (mixed arm). Cycle 122 measured a 2.8pp spread *with the tuned in-game profiles* — so the shipped class balance is carried substantially by profile temperament (band, disengage, target weights), not by hull+kit alone. With temperament flattened to one knife-range band (0.15–0.55R), the BS's kit is intrinsically dominant. This is instrument context, not a shipped-balance claim — but it is real evidence about the hulls.
2. **Cards whose value is pilot skill (mobility, intel) will under-measure here.** Bots don't kite, don't exploit radar paints tactically, and don't juke with boost. Low lifts on speed/intel/buoy/boost cards are honest *in bot hands* and a lower bound on human value — buffing them on this evidence alone would be premature.

Other reading notes: profile heals + cycle 129's free auto-heal mean only ~10% of offered hands convert to a card pick (heals and banking absorb the rest); mono-arm baselines are also exactly 5% but the meta is a class mirror-match; per-class cells with builds < ~100 have wide CIs (the master CI is the pooled one).

## Tier list

Bands on pooled lift: **S** ≥1.6 · **A** 1.25–1.6 · **B** 1.05–1.25 · **C** 0.90–1.05 (pool-average filler) · **D** 0.75–0.90 (below average) · **F** <0.75 (actively bad — taking it costs you the match more often than not, relative to alternatives).

| Tier | Card | Pooled lift (95% CI) | TB | BS | ML | Verdict |
|---|---|---|---|---|---|---|
| **S** | BROADSIDE BARRAGE (acq.) | 2.09 (1.94–2.25) | 2.19 | — | 2.20 | Best pick a TB/ML can make |
| **S** | BARREL I–II | 1.77 (1.70–1.84) | 1.81 | 1.65 | 1.99 | Best card in the game, for every class |
| **A** | CAPTIVE MINES | 1.28 (1.17–1.39) | 1.63 | 1.02 | 1.04 | Strongest on *acquirers*, ~neutral on ML |
| **B** | BROADSIDE TURRETS I–II | 1.14 (1.07–1.20) | 1.46 | 1.06 | 1.46 | Big on acquirers, mild on BS |
| **B** | PHOSPHOR SHELLS | 1.12 (1.04–1.20) | 1.31 | 1.13 | 1.21 | The good star-shell rare |
| **B** | EXTRA TUBE | 1.11 (1.01–1.22) | 1.05 | 1.24 | 0.89 | Better on a BS that acquired torps than on the TB |
| **B** | ACOUSTIC HOMING | 1.06 (0.97–1.16) | 1.11 | 1.15 | 0.81 | Mild everywhere |
| **B** | TORPEDO TUBES (acq.) | 1.06 (0.96–1.16) | — | 1.20 | 0.72 | Good on BS, bad on ML |
| **C** | RELOAD I–V | 1.03 (0.99–1.08) | 0.99 | 1.04 | 1.07 | Neutral-plus; the safe common |
| **C** | BROADSIDE SPREAD I–IV | 1.03 (0.98–1.08) | 1.33 | 0.95 | 1.64 | Neutral on BS, strong on acquirers |
| **C** | HULL I–IV | 1.00 (0.95–1.04) | 0.99 | 0.99 | 0.99 | Exactly average, everywhere |
| **C** | DAZZLE SHELLS | 0.96 (0.88–1.03) | 0.78 | 0.98 | 1.08 | Defensive twin of PHOSPHOR, measurably worse |
| **C** | MINE RACKS (acq.) | 0.96 (0.87–1.05) | 0.95 | 0.98 | — | Fair, mostly as a road to CAPTIVE |
| **C** | GUN BUOY | 0.93 (0.84–1.04) | 0.67 | 0.94 | 1.10 | Only buoy card that pays on ML |
| **C** | JAMMING BUOY | 0.92 (0.83–1.02) | 0.94 | 0.94 | 0.87 | Fakes don't convert in bot hands |
| **C** | SPEED I–IV | 0.92 (0.88–0.96) | 0.84 | 0.94 | 0.94 | Mobility under-measures in bot hands |
| **C** | EXTRA TURRET | 0.90 (0.85–0.96) | 1.13 | 0.91 | 0.79 | TB likes it; ML doesn't |
| **C** | INTEL I–V | 0.90 (0.86–0.94) | 0.84 | 0.90 | 0.82 | Sweep rate doesn't convert for bots |
| **D** | TORPEDO I–IV | 0.89 (0.82–0.95) | 0.91 | 1.01 | 0.62 | Fish speed pays only where fish land |
| **D** | MINES I–IV | 0.88 (0.82–0.95) | 0.73 | 0.97 | 0.91 | Bigger rings, same problem: enemies must come to you |
| **D** | BUOY I–IV | 0.88 (0.81–0.95) | 0.88 | 0.95 | 0.83 | Duration on a weak platform |
| **D** | BOOST SPEED I–II | 0.88 (0.80–0.96) | 0.83 | 0.83 | 0.39 | — |
| **D** | STAR SHELLS I–IV | 0.86 (0.81–0.91) | 0.77 | 0.90 | 1.07 | Duration ladder trails both rares |
| **D** | PROP FOULING MINES | 0.85 (0.76–0.94) | 0.64 | 0.95 | 0.73 | A pure add that still loses to the field |
| **D** | BOOST DURATION I–IV | 0.83 (0.77–0.90) | 0.91 | 0.82 | 0.30 | — |
| **D** | RADAR BUOY (acq.) | 0.75 (0.67–0.84) | 0.51 | 0.90 | — | Worst thing a TB can put in its R slot |
| **F** | EMERGENCY THROTTLE (acq.) | 0.74 (0.66–0.82) | — | 0.88 | 0.42 | Forecloses BROADSIDE for a tool bots can't use |
| **F** | STAR SHELL MORTAR (acq.) | 0.71 (0.62–0.81) | 0.74 | 0.92 | — | Worst card in the game (monoML lift 0.16) |

Mono-arm corroboration (500 matches each, within-class): the ordering holds — `acquireBroadside` monoTB 1.88 / monoML 2.08, `gunBarrel` 1.76–1.96 across all three, `acquireStarShells` monoML **0.16** (3 wins in 184 builds), buoy and boost families bottom-quartile everywhere.

## What makes them good (or bad) — my read

**BARREL (S).** It multiplies damage on the one weapon every hull carries, fires every ~5s (2.5s at max RELOAD), needs no aim change, no behavior, no slot. The known geometry note is the mechanism: `barrelSpacingU` 12u < the 15u burst radius, so extra barrels are a stacked damage multiplier rather than a visible pattern (already ledgered at Story 7-5). A universal, always-on multiplier is exactly what a winrate table rewards — and at avg first pick 3.2 it's bought early enough to compound all match.

**BROADSIDE BARRAGE, the acquisition (S).** The broadside is the game's dominant weapon system — 60 alpha at 4×15, 18s reload, 412.5u reach — and the acquisition puts it on hulls that otherwise lack a second heavy weapon, for one level, into an otherwise-empty R slot. Its 2.1–2.2 lift on both eligible classes is the largest effect in the dataset. The same fact read from the other side: the BS's 69% vacuum win share and the ~neutral lifts of the broadside *cards on the BS itself* (SPREAD 0.95, TURRETS 1.06) say the power is the **weapon**, not its upgrade ladder.

**The acquisition slot is a one-shot decision, and that's most of the acquisition story.** There is one R slot and taking any acquisition scrubs the rest from the deck. So every acquisition's lift carries the *option value* of the ones it forecloses — EMERGENCY THROTTLE at 0.42 on ML isn't just "boost is weak", it's "you gave up ever drawing BROADSIDE BARRAGE." The three F/D acquisitions (star shells, boost, radar buoy) are all double losses: a tool the bot can't convert, plus the foreclosed broadside. If the deck model ever changes to let acquisitions be replaced or stack, this entire column moves.

**CAPTIVE MINES (A) is an acquirer's card.** TB lift 1.63 (and monoBS 0.400 raw wr): captive turns the mine into an autonomous torpedo turret with a 144u trip ring and a fish with no max range — an auto-attack that doesn't compete with the owner's aim budget. On the ML itself it's ~neutral (1.02–1.04): ML bots already lay mines defensively, and captive changes the mine's job without changing where they put them.

**Torpedo cards migrate value to the Battleship.** On the native TB they're mild (TUBE 1.05, HOMING 1.11, TORPEDO I–IV 0.91); on a BS that acquired torpedoes they're the best follow-ups in its deck (acq. 1.20, TUBE 1.24, HOMING 1.15) — a burst weapon layered on the broadside platform with the HP to use it at knife range. On ML everything torpedo is bad (0.62–0.89).

**PHOSPHOR over DAZZLE (1.12 vs 0.96).** Phosphor converts a flare into damage-over-time — direct, unconditional. Dazzle halves the *victim's* detect — a defensive, information effect a bot never exploits. Same slot, same rarity, one measurably better in machine hands; in human hands dazzle should close some of the gap but I'd still bet on phosphor.

**HULL is exactly 1.00 on all three classes.** Striking and probably not a coincidence: flat heals (100 hp/level menu, 10%-of-missing auto-heal per level) mean effective durability is dominated by the heal economy, and +max-HP only helps at the margin the heals don't cover. It's the definition of filler.

**RELOAD (1.03) is real but modest in bot hands** — bots' fire cadence is limited by tactics and target availability, not just cooldowns, and heals absorb a third of the level flow. For a human who actually fires on cooldown, this is plausibly a solid B; the additive −0.1/copy also means the value is back-loaded into deep stacks the bots rarely assembled (avg 1.32 copies held).

**The mine, buoy, and boost families under-perform on their own carriers.** Mines demand the enemy come to you in a game whose ring does eventually force that — but the payoff mostly arrives late and the pick costs an early-game-relevant alternative. The radar buoy is pure intel on a 20s life; bots gain nothing they don't already get from their every-tick observe. Boost is an escape/chase tool that flat-band bots simply don't use — ML's 0.30–0.42 boost numbers are the worst family-on-class cells in the dataset. **These are the cells where the vacuum rig's blind spot is largest**: intel and mobility are skill multipliers, and this instrument has no skill. I'd want human or tuned-profile data before touching any of them downward-or-upward.

**PROP FOULING (0.85) deserves a note**: since cycle 95 it's a pure behaviour add (no damage penalty), so its below-average lift is entirely opportunity cost — a 1-copy rare whose occasion (a slowed enemy you then exploit) bots essentially never cash in.

## Timing and exposure facts (mixed arm)

- Everything is first-bought between pick 2.7 and 4.9 on average (sim-time 210–292s) — random picking spreads exposure evenly; acquisitions skew earliest (they're in the deck from card one), star-shell/broadside rares latest (subdecks enter after acquisition or sit behind bigger subdecks).
- Offered→picked conversion is ~0.10 across the board (uniform, as designed — deviations are exposure structure, not preference): the other ~90% of the level flow went to profile-threshold heals and banking. RELOAD/INTEL were each offered in ~88k hands, the 1-copy equipment rares in ~8k.
- Placement distribution extremes: PHOSPHOR builds finish 1st 28.3% of the time (survivor-selected *and* good); STAR SHELL MORTAR builds average placement 8.9 with 0.84 kills (pool 0.87) — the only card whose holders kill *less* than average.

## The two standing targets (skill contract)

- **Class win share** (mixed, ±3pp tier supported, roster even, zero warnings): BS 69.2% (CI 66.3–72.0), ML 15.7%, TB 15.1% — far outside the 31–35% band, **by design of the vacuum rig**; not comparable to cycle 122's tuned-profile reading and not a regression claim.
- **Attrition** (exact survivorship, n=20,000): alive 80.2% @4:00 (target 50%), 37.6% @8:00 (target 25%), 12.9% @12:00 (target 12.5%). Random spending slows the early game (damage cards arrive by chance, heals absorb levels); converges on target by ring 3. Median duration 839s. Mono note: all-BS oceans are the bloodiest (mean life 361s vs TB 473s / ML 483s).

## Caveats and flags

1. **Vacuum rig ≠ shipped game** (see above). Intel/mobility/denial cards under-measure; class share here is not the shipped balance.
2. One monoTB match (of 2,500) failed at runner level and was skipped — recorded, negligible, reproducible from `campaign2/monoTB-shard06` (seed 506000019) if ever wanted.
3. Instrument change of record: `botProfileFor`'s `random` scheme deal is now offset by match index (the `rotate()` representation fix on the one path `--roster even` can't reach). Pre-existing `--bot-profile random` run keys are NOT byte-identical across this change; named-profile keys are.
4. Pre-existing, not mine, worth a look: `server/scripts/batchsim/encounterSpan.ts` fails `tsc` under the batchsim tsconfig (cycle 129 file; `npm run check` doesn't cover that tsconfig, so CI is green). And `catalogMetrics.ts`'s damage-attribution table still says broadside = 20 hp/shell — stale since cycle 122 set 15, which is also the gun's constant, so the damage ledger's gun/broadside split is currently unreliable (this report doesn't use it).
5. Per Eric's standing rule: **no CONFIG was touched**. Any tuning that follows from this report is his ruling, through the normal pipeline.

## Where the evidence points next (unmeasured — candidates, not proposals)

Ranked by measured effect size of the thing they'd address; none of these has a measured arm yet:

1. **BARREL geometry** — the S-tier outlier is a pure damage multiplier because barrel spacing (12u) sits under the burst radius (15u). Raising spacing above the burst radius turns the second barrel into a *pattern* instead of stacked damage — the ledgered Story 7-5 observation, now with winrate evidence behind it. One `--tune` arm would price it.
2. **Acquisition slot economics** — the R slot's winner-take-all scrub makes one acquisition S-tier and three of the other five D/F. That's a structure question (Eric's), not a scalar: the data says the slot is really a bet on drawing BROADSIDE.
3. **Broadside reload** — if the vacuum BS share reads as too much intrinsic hull+kit power, cycle 122 already established reload as the one dial that moves BS win share (~+2.5pp per 2s). A tuned-profile arm with `--tune broadside.reloadMs` would separate hull from temperament.
4. **Boost/buoy/star-shell acquisitions** — bottom tier here, but skill-shaped; measure with tuned profiles (or wait for human telemetry) before ruling.

## Reproduction

Harness: branch `worktree-balance-upgrade-stats` (PR to `development`). Campaign: `run_campaign.py --bots 20 --extra --bot-profile <random|randomTorpedoBoat|randomBattleship|randomMineLayer> --raw`; arms mixed(seed 1)/monoTB(1e8+1, 5e8+1)/monoBS(2e8+1, 6e8+1)/monoML(3e8+1, 7e8+1), 12 shards. Analysis: `upgrade_stats.py` (ordinal-matched lift; in the balance-sim skill scripts). Full per-card tables (raw winrates per arm, timing/exposure, placement distributions) follow in the appendix.

---

## Appendix — full tables

## Master tier table (pooled class-conditioned lift; 1.00 = average pick)

| Tier | Card | Cat | Rarity | Lift (95% CI) | Builds | Wins | TB lift | BS lift | ML lift |
|---|---|---|---|---|---|---|---|---|---|
| S | BROADSIDE BARRAGE (acq.) (`acquireBroadside`) | broadside | rare×1 | 2.09 (1.94–2.25) | 3075 | 565 | 2.19 | · | 2.20 |
| S | BARREL I–II (`gunBarrel`) | guns | rare×2 | 1.77 (1.70–1.84) | 9689 | 2053 | 1.81 | 1.65 | 1.99 |
| A | CAPTIVE MINES (`mineCaptive`) | mines | rare×1 | 1.28 (1.17–1.39) | 2304 | 414 | 1.63 | 1.02 | 1.04 |
| B | BROADSIDE TURRETS I–II (`broadsideTurrets`) | broadside | rare×2 | 1.14 (1.07–1.20) | 4288 | 963 | 1.46 | 1.06 | 1.46 |
| B | PHOSPHOR SHELLS (`starIncendiary`) | starShells | rare×1 | 1.12 (1.04–1.20) | 2352 | 559 | 1.31 | 1.13 | 1.21 |
| B | EXTRA TUBE (`torpedoTube`) | torpedoes | rare×1 | 1.11 (1.01–1.22) | 2264 | 378 | 1.05 | 1.24 | 0.89 |
| B | ACOUSTIC HOMING (`torpedoHoming`) | torpedoes | rare×1 | 1.06 (0.97–1.16) | 2276 | 381 | 1.11 | 1.15 | 0.81 |
| B | TORPEDO TUBES (acq.) (`acquireTorpedo`) | torpedoes | rare×1 | 1.06 (0.96–1.16) | 3065 | 397 | · | 1.20 | 0.72 |
| C | RELOAD I–V (`shipCooldown`) | ship | common×5 | 1.03 (0.99–1.08) | 17615 | 2003 | 0.99 | 1.04 | 1.07 |
| C | BROADSIDE SPREAD I–IV (`broadsideSpread`) | broadside | common×4 | 1.03 (0.98–1.08) | 6169 | 1145 | 1.33 | 0.95 | 1.64 |
| C | HULL I–IV (`shipHull`) | ship | common×4 | 1.00 (0.95–1.04) | 15457 | 1881 | 0.99 | 0.99 | 0.99 |
| C | DAZZLE SHELLS (`starDazzle`) | starShells | rare×1 | 0.96 (0.88–1.03) | 2358 | 495 | 0.78 | 0.98 | 1.08 |
| C | MINE RACKS (acq.) (`acquireMine`) | mines | rare×1 | 0.96 (0.87–1.05) | 2914 | 351 | 0.95 | 0.98 | · |
| C | GUN BUOY (`buoyGun`) | radarBuoy | rare×1 | 0.93 (0.84–1.04) | 2359 | 313 | 0.67 | 0.94 | 1.10 |
| C | JAMMING BUOY (`buoyJamming`) | radarBuoy | rare×1 | 0.92 (0.83–1.02) | 2403 | 322 | 0.94 | 0.94 | 0.87 |
| C | SPEED I–IV (`shipSpeed`) | ship | common×4 | 0.92 (0.88–0.96) | 15744 | 1758 | 0.84 | 0.94 | 0.94 |
| C | EXTRA TURRET (`gunTurret`) | guns | rare×1 | 0.90 (0.85–0.96) | 6057 | 856 | 1.13 | 0.91 | 0.79 |
| D | INTEL I–V (`intelSweep`) | intel | common×5 | 0.90 (0.86–0.94) | 17771 | 1858 | 0.84 | 0.90 | 0.82 |
| D | TORPEDO I–IV (`torpedoSpeed`) | torpedoes | common×4 | 0.89 (0.82–0.95) | 5725 | 632 | 0.91 | 1.01 | 0.62 |
| D | MINES I–IV (`mineBlast`) | mines | common×4 | 0.88 (0.82–0.95) | 6224 | 643 | 0.73 | 0.97 | 0.91 |
| D | BUOY I–IV (`buoyDuration`) | radarBuoy | common×4 | 0.88 (0.81–0.95) | 6019 | 611 | 0.88 | 0.95 | 0.83 |
| D | BOOST SPEED I–II (`boostSpeed`) | speedBoost | common×2 | 0.88 (0.80–0.96) | 3585 | 428 | 0.83 | 0.83 | 0.39 |
| D | STAR SHELLS I–IV (`starDuration`) | starShells | common×4 | 0.86 (0.81–0.91) | 5989 | 904 | 0.77 | 0.90 | 1.07 |
| D | PROP FOULING MINES (`minePropFouling`) | mines | rare×1 | 0.85 (0.76–0.94) | 2342 | 298 | 0.64 | 0.95 | 0.73 |
| D | BOOST DURATION I–IV (`boostDuration`) | speedBoost | common×4 | 0.83 (0.77–0.90) | 5790 | 578 | 0.91 | 0.82 | 0.30 |
| F | RADAR BUOY (acq.) (`acquireRadarBuoy`) | radarBuoy | rare×1 | 0.75 (0.67–0.84) | 3029 | 276 | 0.51 | 0.90 | · |
| F | EMERGENCY THROTTLE (acq.) (`acquireBoost`) | speedBoost | rare×1 | 0.74 (0.66–0.82) | 3093 | 280 | · | 0.88 | 0.42 |
| F | STAR SHELL MORTAR (acq.) (`acquireStarShells`) | starShells | rare×1 | 0.71 (0.62–0.81) | 3090 | 196 | 0.74 | · | 0.92 |

## Raw winrates (survival-confounded — see lift for quality)

| Card | Overall wr (mixed) | TB wr | BS wr | ML wr | monoTB | monoBS | monoML |
|---|---|---|---|---|---|---|---|
| BROADSIDE BARRAGE (acq.) | 0.127 | 0.127 | · | 0.126 | 0.232 | · | 0.198 |
| BARREL I–II | 0.211 | 0.119 | 0.330 | 0.122 | 0.195 | 0.260 | 0.195 |
| CAPTIVE MINES | 0.128 | 0.308 | 0.373 | 0.088 | 0.317 | 0.400 | 0.188 |
| BROADSIDE TURRETS I–II | 0.247 | 0.327 | 0.240 | 0.272 | 0.452 | 0.151 | 0.388 |
| PHOSPHOR SHELLS | 0.283 | 0.229 | 0.287 | 0.250 | 0.200 | 0.190 | 0.237 |
| EXTRA TUBE | 0.145 | 0.091 | 0.505 | 0.167 | 0.170 | 0.254 | 0.221 |
| ACOUSTIC HOMING | 0.163 | 0.099 | 0.508 | 0.146 | 0.156 | 0.347 | 0.221 |
| TORPEDO TUBES (acq.) | 0.150 | · | 0.229 | 0.043 | · | 0.145 | 0.090 |
| RELOAD I–V | 0.117 | 0.060 | 0.195 | 0.063 | 0.109 | 0.130 | 0.100 |
| BROADSIDE SPREAD I–IV | 0.199 | 0.233 | 0.194 | 0.247 | 0.396 | 0.123 | 0.345 |
| HULL I–IV | 0.124 | 0.067 | 0.204 | 0.065 | 0.118 | 0.142 | 0.106 |
| DAZZLE SHELLS | 0.248 | 0.156 | 0.253 | 0.196 | 0.256 | 0.168 | 0.188 |
| MINE RACKS (acq.) | 0.137 | 0.048 | 0.190 | · | 0.080 | 0.142 | · |
| GUN BUOY | 0.128 | 0.120 | 0.398 | 0.093 | 0.150 | 0.184 | 0.131 |
| JAMMING BUOY | 0.109 | 0.147 | 0.377 | 0.078 | 0.149 | 0.253 | 0.139 |
| SPEED I–IV | 0.116 | 0.057 | 0.192 | 0.061 | 0.102 | 0.133 | 0.098 |
| EXTRA TURRET | 0.151 | 0.098 | 0.236 | 0.075 | 0.130 | 0.162 | 0.118 |
| INTEL I–V | 0.105 | 0.054 | 0.178 | 0.051 | 0.098 | 0.127 | 0.094 |
| TORPEDO I–IV | 0.100 | 0.061 | 0.367 | 0.097 | 0.101 | 0.282 | 0.172 |
| MINES I–IV | 0.088 | 0.090 | 0.329 | 0.056 | 0.218 | 0.289 | 0.097 |
| BUOY I–IV | 0.085 | 0.111 | 0.323 | 0.055 | 0.156 | 0.225 | 0.102 |
| BOOST SPEED I–II | 0.091 | 0.065 | 0.307 | 0.047 | 0.130 | 0.222 | 0.123 |
| STAR SHELLS I–IV | 0.185 | 0.146 | 0.188 | 0.161 | 0.148 | 0.117 | 0.149 |
| PROP FOULING MINES | 0.104 | 0.138 | 0.391 | 0.061 | 0.222 | 0.281 | 0.125 |
| BOOST DURATION I–IV | 0.085 | 0.062 | 0.285 | 0.033 | 0.102 | 0.215 | 0.103 |
| RADAR BUOY (acq.) | 0.110 | 0.030 | 0.167 | · | 0.061 | 0.100 | · |
| EMERGENCY THROTTLE (acq.) | 0.110 | · | 0.171 | 0.023 | · | 0.105 | 0.053 |
| STAR SHELL MORTAR (acq.) | 0.050 | 0.046 | · | 0.054 | 0.073 | · | 0.069 |

## Timing, stacking and exposure (mixed arm)

| Card | Avg first pick # | Avg first pick T (s) | Avg copies held | Offered (hands) | Picked | Pick-through | Avg placement | Avg kills | Avg life (s) |
|---|---|---|---|---|---|---|---|---|---|
| BROADSIDE BARRAGE (acq.) | 2.71 | 210.6 | 1.0 | 11048 | 1081 | 0.098 | 7.23 | 1.63 | 551.2 |
| BARREL I–II | 3.22 | 223.8 | 1.15 | 43067 | 4422 | 0.103 | 6.44 | 2.27 | 579.5 |
| CAPTIVE MINES | 4.1 | 249.7 | 1.0 | 8278 | 813 | 0.098 | 7.13 | 1.81 | 554.9 |
| BROADSIDE TURRETS I–II | 4.45 | 270.0 | 1.14 | 20230 | 2216 | 0.11 | 5.8 | 2.68 | 607.6 |
| PHOSPHOR SHELLS | 4.85 | 283.4 | 1.0 | 10105 | 1151 | 0.114 | 5.66 | 2.78 | 611.1 |
| EXTRA TUBE | 4.07 | 270.7 | 1.0 | 8318 | 787 | 0.095 | 7.37 | 1.49 | 545.6 |
| ACOUSTIC HOMING | 4.33 | 291.7 | 1.0 | 8231 | 800 | 0.097 | 7.26 | 1.58 | 551.3 |
| TORPEDO TUBES (acq.) | 3.23 | 216.1 | 1.0 | 11956 | 1306 | 0.109 | 7.16 | 1.76 | 557.9 |
| RELOAD I–V | 2.99 | 211.7 | 1.32 | 87717 | 9151 | 0.104 | 7.88 | 1.48 | 531.2 |
| BROADSIDE SPREAD I–IV | 3.91 | 250.4 | 1.32 | 33723 | 3747 | 0.111 | 6.46 | 2.29 | 585.0 |
| HULL I–IV | 3.27 | 223.0 | 1.26 | 73393 | 7580 | 0.103 | 7.36 | 1.53 | 554.1 |
| DAZZLE SHELLS | 4.89 | 290.1 | 1.0 | 10132 | 1129 | 0.111 | 5.6 | 2.65 | 619.5 |
| MINE RACKS (acq.) | 3.11 | 223.4 | 1.0 | 12145 | 1223 | 0.101 | 7.73 | 1.75 | 535.5 |
| GUN BUOY | 4.25 | 262.8 | 1.0 | 8150 | 820 | 0.101 | 7.12 | 1.41 | 566.8 |
| JAMMING BUOY | 4.15 | 260.2 | 1.0 | 8350 | 805 | 0.096 | 7.52 | 1.25 | 552.9 |
| SPEED I–IV | 3.24 | 223.1 | 1.26 | 73572 | 7749 | 0.105 | 7.71 | 1.48 | 539.7 |
| EXTRA TURRET | 4.15 | 264.2 | 1.0 | 23486 | 2343 | 0.1 | 7.34 | 1.7 | 552.6 |
| INTEL I–V | 3.12 | 216.1 | 1.31 | 88711 | 9140 | 0.103 | 8.1 | 1.39 | 522.8 |
| TORPEDO I–IV | 3.53 | 247.6 | 1.2 | 25860 | 2436 | 0.094 | 8.13 | 1.21 | 524.0 |
| MINES I–IV | 3.45 | 234.3 | 1.22 | 26754 | 2750 | 0.103 | 8.03 | 1.19 | 528.4 |
| BUOY I–IV | 3.51 | 233.3 | 1.21 | 26502 | 2585 | 0.098 | 8.1 | 1.15 | 525.6 |
| BOOST SPEED I–II | 3.66 | 253.1 | 1.08 | 13901 | 1322 | 0.095 | 8.04 | 1.17 | 524.8 |
| STAR SHELLS I–IV | 3.94 | 248.0 | 1.3 | 32865 | 3632 | 0.111 | 6.67 | 2.18 | 574.3 |
| PROP FOULING MINES | 4.31 | 267.8 | 1.0 | 8311 | 771 | 0.093 | 7.19 | 1.42 | 564.7 |
| BOOST DURATION I–IV | 3.35 | 244.2 | 1.21 | 25253 | 2462 | 0.097 | 8.24 | 1.1 | 515.9 |
| RADAR BUOY (acq.) | 2.97 | 209.7 | 1.0 | 11966 | 1216 | 0.102 | 7.94 | 1.47 | 532.4 |
| EMERGENCY THROTTLE (acq.) | 3.17 | 215.1 | 1.0 | 12105 | 1298 | 0.107 | 7.79 | 1.5 | 535.2 |
| STAR SHELL MORTAR (acq.) | 2.76 | 212.2 | 1.0 | 11039 | 1084 | 0.098 | 8.9 | 0.84 | 493.0 |

## Placement distribution in builds containing the card (mixed arm)

| Card | 1st | 2nd | 3rd | 4–5 | 6–10 | 11–20 |
|---|---|---|---|---|---|---|
| BROADSIDE BARRAGE (acq.) | 12.7% | 10.6% | 9.2% | 14.4% | 25.5% | 27.6% |
| BARREL I–II | 21.1% | 10.0% | 8.4% | 13.3% | 24.9% | 22.3% |
| CAPTIVE MINES | 12.8% | 9.8% | 8.6% | 14.6% | 29.2% | 25.0% |
| BROADSIDE TURRETS I–II | 24.7% | 11.3% | 9.0% | 14.1% | 21.3% | 19.7% |
| PHOSPHOR SHELLS | 28.3% | 10.3% | 8.3% | 11.8% | 22.5% | 18.8% |
| EXTRA TUBE | 14.5% | 9.0% | 7.1% | 14.0% | 27.8% | 27.6% |
| ACOUSTIC HOMING | 16.2% | 7.8% | 7.9% | 13.9% | 26.9% | 27.4% |
| TORPEDO TUBES (acq.) | 15.0% | 8.7% | 9.2% | 14.5% | 25.7% | 26.8% |
| RELOAD I–V | 11.7% | 8.3% | 7.7% | 13.8% | 26.8% | 31.7% |
| BROADSIDE SPREAD I–IV | 19.9% | 10.4% | 7.6% | 14.9% | 24.4% | 22.7% |
| HULL I–IV | 12.4% | 9.4% | 8.7% | 14.7% | 27.1% | 27.8% |
| DAZZLE SHELLS | 24.8% | 11.9% | 7.6% | 15.4% | 22.6% | 17.7% |
| MINE RACKS (acq.) | 13.7% | 8.3% | 5.7% | 13.1% | 28.2% | 31.0% |
| GUN BUOY | 12.8% | 10.6% | 9.8% | 13.9% | 25.9% | 27.1% |
| JAMMING BUOY | 10.9% | 10.1% | 10.2% | 13.7% | 26.6% | 28.6% |
| SPEED I–IV | 11.6% | 9.1% | 8.0% | 13.7% | 27.5% | 30.2% |
| EXTRA TURRET | 15.2% | 9.0% | 7.7% | 14.7% | 25.2% | 28.3% |
| INTEL I–V | 10.5% | 8.3% | 7.4% | 13.2% | 27.3% | 33.3% |
| TORPEDO I–IV | 10.0% | 8.5% | 7.4% | 14.0% | 26.8% | 33.3% |
| MINES I–IV | 8.8% | 8.8% | 8.0% | 14.1% | 28.3% | 31.9% |
| BUOY I–IV | 8.5% | 8.1% | 8.4% | 14.3% | 28.4% | 32.4% |
| BOOST SPEED I–II | 9.1% | 7.9% | 8.5% | 13.5% | 29.5% | 31.4% |
| STAR SHELLS I–IV | 18.5% | 10.5% | 7.8% | 13.7% | 25.0% | 24.5% |
| PROP FOULING MINES | 10.4% | 9.1% | 10.4% | 17.6% | 26.6% | 25.9% |
| BOOST DURATION I–IV | 8.5% | 7.7% | 7.8% | 14.0% | 28.8% | 33.4% |
| RADAR BUOY (acq.) | 11.0% | 8.6% | 6.7% | 13.7% | 27.9% | 32.2% |
| EMERGENCY THROTTLE (acq.) | 11.0% | 8.6% | 8.2% | 14.5% | 27.3% | 30.3% |
| STAR SHELL MORTAR (acq.) | 5.0% | 6.9% | 8.9% | 11.5% | 30.0% | 37.6% |

