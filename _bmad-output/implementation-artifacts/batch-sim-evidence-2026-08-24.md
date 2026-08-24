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
