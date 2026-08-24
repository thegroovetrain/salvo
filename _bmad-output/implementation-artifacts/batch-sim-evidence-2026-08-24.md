# Batch-sim evidence — 2026-08-24

## Campaign: per-upgrade winrates under random picks (Eric-directed, /balance-sim)

**Ask** (Eric, 2026-08-24): winrate/timing/placement stats for every card, overall and per class, S–F tiers, run on `development`. Interactive rulings: profile heals + random cards; natural deck draws; 1,000 mixed + 500 per mono-class arm (revised up from 100 mid-run: *"i want data and this is running overnight"*); instrumentation lands as a PR to `development`.

**Instrument.** New `--raw` per-bot evidence surface (builds with pick order + sim-time, offers seen, authoritative `Match.placements` placement) + the blind-vacuum test rows (`spend: 'random'`, flat temperament). `botProfileFor`'s `random` scheme deal gained the match-index offset (roster-evenness fix; pre-existing `--bot-profile random` run keys not byte-identical — named-profile keys unchanged). Branch `worktree-balance-upgrade-stats`, PR to `development`.

**Sample.** 2,499/2,500 matches (1 monoTB runner-level failure, recorded-and-skipped): mixed 1,000 (roster exactly even 6,672/6,664/6,664), monoTB 499 / monoBS 500 / monoML 500. 100% resolved, 0 draws, 0 shard failures, 0 duplicate match seeds. Analyzer: ordinal-matched, class-conditioned win lift (random picks ⇒ randomized assignment at each spend; removes the survival + class confounds). ~25.4s/match single-process; ~4× aggregate at 12 shards on 6 cores; ~4.8h wall total.

**Standing target 1 — class win share** (±3pp tier supported, zero validity warnings): **BS 69.2% (66.3–72.0) / ML 15.7% / TB 15.1%** under the vacuum rig. NOT comparable to cycle 122's 2.8pp spread (tuned profiles): the reading is that shipped class balance is carried substantially by profile temperament, and at a flat 0.15–0.55R band the BS kit is intrinsically dominant. No proposal made; no CONFIG touched.

**Standing target 2 — attrition** (exact survivorship, n=20,000): 80.2% alive @4:00 (target 50%), 37.6% @8:00 (target 25%), 12.9% @12:00 (target 12.5%). Random spending slows the early game; on-target by ring 3. Median duration 839s. All-BS oceans bloodiest (mean life 361s vs TB 473 / ML 483).

**Headline card results** (pooled class-conditioned lift, 1.00 = average pick; full 28-card tables + tiers in `upgrade-winrate-report-2026-08-24.md`):
- **S**: BROADSIDE BARRAGE acquisition 2.09 (2.19 TB / 2.20 ML) — largest effect in the dataset; BARREL 1.77 (1.65–1.99 across all classes).
- **A**: CAPTIVE MINES 1.28 (1.63 on TB acquirers; ~neutral on ML itself).
- **B**: BROADSIDE TURRETS 1.14, PHOSPHOR 1.12, EXTRA TUBE 1.11, ACOUSTIC HOMING 1.06, TORPEDO TUBES acq. 1.06 (1.20 on BS).
- **F**: EMERGENCY THROTTLE acq. 0.74 (0.42 on ML), STAR SHELL MORTAR acq. 0.71 (monoML lift 0.16 — 3 wins in 184 builds; worst card in the game).
- Broadside cards ON the BS are ~neutral (SPREAD 0.95, TURRETS 1.06): the power is the weapon, not its ladder. HULL is exactly 1.00 on all three classes (heal economy dominates durability). Mine/buoy/boost families D-tier on their own carriers — flagged as the cells where the no-skill instrument under-measures (intel/mobility are skill multipliers); do not tune on this evidence alone.

**Candidates surfaced, none measured, none proposed as numbers** (Eric's call): BARREL's spacing-under-burst geometry (12u < 15u — the ledgered Story 7-5 note now has winrate evidence); the R-slot winner-take-all scrub (one S-tier acquisition, three D/F — the slot is a bet on drawing BROADSIDE); broadside reload as the hull-vs-temperament separator (cycle 122's dial); the skill-shaped bottom tier (needs tuned-profile or human data).

**Also flagged**: pre-existing `encounterSpan.ts` tsc error under the batchsim tsconfig (cycle 129; `npm run check` doesn't cover it); `catalogMetrics.ts` DAMAGE_SOURCES still says broadside 20 hp (stale since cycle 122 set 15 = the gun's constant, so that ledger's gun/broadside attribution is unreliable — unused by this campaign).

**Eric rulings on this evidence**: none yet — report delivered for review.

## Campaign 2: the tuned-profile rerun (same day, Eric-directed)

**Ask** (Eric, 2026-08-24 morning): rerun the randomized-pick design on the shipped bot temperaments — 498 then +501 more mixed matches ("i want data"). Instrument: the new `--bot-spend random` mode (PR #197, merged same morning): rolled in-game profiles keep full temperament, card pick alone uniform-random, heal rule untouched by construction. `--roster even`, `--raw`, 12 shards, seed bases 42 + 900000042, one arm label.

**Sample.** 999 matches (998 resolved + 1 draw), roster exactly even (6,657/6,666/6,657), zero failures, zero duplicate seeds, zero validity warnings, ±5pp tier supported.

**Standing target 1 — class win share**: **BS 44.6% (41.5–47.7) / ML 32.5% (29.6–35.4, IN BAND) / TB 22.9% (20.4–25.7)**. Temperament recovered 25pp of the vacuum's BS dominance; the ~10pp residual over the band under randomized spending points at the kit itself (cycle 122's 2.8pp spread had tuned profiles AND weighted spending). TB kills 0.50→0.88/bot vs vacuum, BS mean life 483→397s, ML the survivor class at 478s.

**Standing target 2 — attrition** (exact survivorship, n=19,980): 73.6% @4:00 (target 50%), 37.2% @8:00 (25%), 14.7% @12:00 (12.5%) — random spending slows the early game; on-target by ring 3; median 911s.

**Cross-rig verdict** (full tables: `upgrade-winrate-tuned-2026-08-24.md`): **24 of 28 cards moved <±0.08 — the tier structure is rig-independent.** Confirmed: acquireBroadside 1.92 + gunBarrel 1.79 (statistically the strongest card, n=3,712, CI 1.69–1.90) as S; broadside cards ~neutral ON the BS; the boost/buoy/star acquisition tail. **Corrections of record vs the vacuum report**: CAPTIVE MINES on the TB was a knife-range rig artifact (1.63 → 0.74; it's an ML/BS card); the "torpedoes migrate to the BS" reading dissolves (acquireTorpedo 1.11→0.96, tube/homing ~0.99); INTEL 0.87 (0.82–0.94) and SPEED 0.93 (0.87–0.99) are now solid negatives under temperaments that kite — under-budget, not under-measured. Revised tiers: A band empty; EMERGENCY THROTTLE acq. sole F at 0.74.

**Eric rulings on this evidence**: none yet — the fix-direction discussion (re-tier weapons so acquisition = tier I; rungs buy the weapon's distinctive dimension, not alpha; mine-ladder lethality as the ML wincon; proportional heals for HULL value; broadside budget) predates this data and every direction survived it.
