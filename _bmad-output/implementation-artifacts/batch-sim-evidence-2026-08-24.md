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

## Design rulings (Eric, 2026-08-24, post-campaign discussion)

1. **WEAPON RE-TIER IS GO** — acquisition card = tier I = the base weapon (a native carrier effectively spawns holding tier I), with 4–5 rungs above it that genuinely level the weapon. **A separate session builds it** — this session's contract was evidence and mechanisms only.
2. **BROADSIDE ARC LADDER, ruled direction** — at tier I the per-turret arcs have **ZERO overlap** (*"it fires out and if you wanna hit something closing in on you, you need to aim your ship"*); by tier V the arcs overlap enough that all turrets converge on a perpendicular target at arc center, with fewer connecting off-center. *"Not a short-cooldown delete-ships button — an inaccurate shotgun that gradually gets better."* This moves the weapon's budget from ALPHA into RELIABILITY — it de-conditionalizes the S-tier problem at its root. Structurally it is a retune of the cycles-113-115 emergent-arc machinery (turrets already fire as close to the click as their arc allows), NOT new machinery; the cycle-114 pin `mountSpread + base traverse ≥ arcHalfArcDeg` ("one shell absolutely hits the click") becomes **tier-dependent and deliberately false at tier I** and must be rewritten per-tier, not deleted.
3. **MINE LETHALITY BOOST IS GO** (the ML wincon inside the re-tier's own framework). BARREL spacing: **undecided** — re-measure after the broadside rework lands before ruling.
4. **PROPORTIONAL HEALS: REJECTED — ALREADY TRIED**, it favored the battleship heavily. **Do not re-propose.** In its place Eric floated the larger direction to mull: **per-class ULTIMATE weapons** — each class chooses one of two class-designed ultimates instead of universal acquisitions (*"might change the game back to balancing ships rather than balancing all the many upgrade choices"*). Heavy design work, unruled. Note it composes with the re-tier (an ultimate IS an equipment with a tier-I card and a ladder — same machinery), and it deletes the acquireBroadside outlier by construction. A cheap scoping measurement exists: an acquisitions-removed arm shows the no-cross-acquisition world's balance.
5. **Variable card pricing: "potentially very interesting"**, especially escalating heal costs — which would also economically bound the ledgered open question about heal-hoarding past sudden death. Copies-as-a-dial: declined (*"I'd rather just make the choices better"*).
6. **Telemetry beacon: yes.** Direction discussed: one structured JSON document per match at `match.end` (the harness raw-row schema — builds with pick order, placements, class, duration), appended to JSONL on a persistent disk or object storage; a database only when match history becomes player-facing. **Freeze the schema first; storage is swappable.**

### Warning packet for the re-tier session

- **The catalog is wire contract** — any line change bumps `PROTOCOL_VERSION`.
- **Card names are Eric's, verbatim** (the naming law / KILL LEADER precedent). The new rung ladders need HIS copy — do not invent rung names or reword survivors.
- **`EquipmentTactic` is a total `Record<EquipmentId, …>`** — a new/changed equipment id fails the build until `ai/equipment.ts` carries its tactic row. Bot boon-weight tables in `CONFIG.bots.boonWeights` also name card ids.
- **Deck-model tests pin exact deck sizes per hull** (`sim/deck.ts` composition, catalog copies); the re-tier changes both. Expect and update those pins deliberately, not incidentally.
- **`catalogMetrics.ts` DAMAGE_SOURCES is ALREADY stale** (says broadside 20 hp; cycle 122 set 15 = the gun's constant) — damage rungs on any weapon will corrupt that attribution ledger further unless it learns per-source constants from CONFIG.
- **Cycle-114/115 pins on the broadside**: the coverage pin above, `sim/spread.ts`'s straddle law (spaces the GUNS — muzzles + mount bearings), and `turretSpanFactor`/`turretMountSpreadDeg`. Eric personally tuned base convergence at cycle 115 (~386u); the zero-overlap ladder supersedes those traverse numbers but not the mount geometry.
- **Measurement discipline**: every balance-touching PR gets a same-night campaign before merging (`run_tuned_campaign.sh` / `--bot-spend random --roster even --raw`, analyzer `upgrade_stats.py` in the balance-sim skill). Compare against this file's two campaigns.
