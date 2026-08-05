# Batch-Sim Evidence — Weapon Balance Pass (cycle 44, 0.17.44)

**Date:** 2026-08-04
**Change under test:** the per-weapon balance retune (epic-4 amendments 21-25).
**Spec of record:** `spec-weapon-balance-and-radar-vector-length.md`
**Harness:** `server/scripts/batchSim.mjs` (Story 2.10 economy batch-sim).

This pass also closes a standing gap: **cycle 42 (the global cooldown reduction) shipped with no
batch-sim evidence at all**, which `gds-workflow-status.yaml` recorded as leaving "the early/late
TTK spread wider than any measured configuration." The BEFORE column below is the post-cycle-42
tuning, so this run measures cycles 42 and 44 together against a live baseline.

## Run keys

Both passes are deterministic per run key; only the trailing `meta:` line carries wall clock.

```
BEFORE  seed=7 mode=batch matches=200 captains=3 pilot=gunner  @ 1585727 (pre-retune)
AFTER   seed=7 mode=batch matches=200 captains=3 pilot=gunner  @ fc5072e (post-retune)
ENDGAME seed=7 mode=batch matches=50  captains=3 pilot=endgame @ post-retune
```

Identical seed, roster, mode, and overrides across BEFORE/AFTER — the only variable is the tuning.

## Headline: no structural regression

| Metric | BEFORE | AFTER | Δ |
|---|---|---|---|
| matches completed | 200 / 200 | 200 / 200 | — |
| matches **failed** | **0** | **0** | — |
| endedBy `fieldCleared` | 193 | 195 | +2 |
| endedBy `lastHumanSunk` | 7 | 5 | −2 |

Every match still resolves. No weapon became unusable, no match hung, no cap-out appeared. This is
the acceptance bar the spec set ("matches still resolve; no weapon becomes unusable") and it is met.

## Pacing: matches run ~30% longer

| Match length (s) | BEFORE | AFTER | Δ |
|---|---|---|---|
| mean | 329.8 | 428.6 | **+98.8 (+30.0%)** |
| min | 194.9 | 277.6 | +82.7 |
| p25 | 265.9 | 349.1 | +83.2 |
| **p50** | **298.6** | **405.1** | **+106.5 (+35.7%)** |
| p75 | 386.8 | 483.8 | +97.0 |
| p95 | 505.2 | 668.7 | +163.5 |
| max | 605.4 | 873.5 | +268.1 |

This is the intended direction and roughly the expected magnitude: the permanently-fitted gun lost
40% of its damage (25 → 15), and the batch pilot is `gunner` — it fires slot 0 only, so this column
is close to a pure read of the gun nerf. The heavier torpedo/mine/cannon numbers do not show up
here because the gunner pilot never uses them.

**Read this as an upper bound on the slowdown, not a typical match.** A real captain firing every
fitted slot lands between this and the BEFORE column.

## Second-order effects (all explainable, none alarming)

| Metric | BEFORE | AFTER | Reading |
|---|---|---|---|
| kills / captain | 6.2 | 6.1 | **flat** — the same fight happens, it just takes longer |
| deaths / captain | 0.7 | 0.7 | unchanged |
| final level / captain | 6.0 | 7.2 | +1.2 — longer matches mean more XP time |
| picks / captain | 5.8 | 7.0 | +1.2 — captains fit ~1 more boon per match |
| boons fitted | 5.7 | 7.0 | +1.3 |
| copy-capped lines | 1.9 | 2.3 | builds go deeper |
| captains with ≥1 cap | 91.3% | 95.5% | +4.2pp |
| first exclusive OFFERED | 73.5% | 80.8% | +7.3pp |
| first exclusive FITTED | 67.7% | 75.3% | +7.6pp |
| **storm deaths (total)** | **64** | **139** | **+117%** |
| winner class BB / ML / TB | 100 / 31 / 69 | 94 / 26 / 80 | TB +11, ML −5, BB −6 |

Two of these deserve a flag for Eric rather than silent acceptance:

1. **Storm deaths more than doubled (64 → 139).** Matches now routinely run long enough for the
   storm to become the arbiter it was designed to be, rather than ending before closure bites. Whether
   that is "the storm finally doing its job" or "too many deaths to weather rather than to captains"
   is a design judgment, not a harness verdict.
2. **The Mine Layer's win share fell (31 → 26 of 200).** Counter-intuitive, since the mine was
   buffed hardest (damage +22%, a 2-deep rack). The likely cause is that the `gunner` pilot never
   lays mines, so ML gains nothing from the buff while losing gun damage like everyone else. **This
   number should not be read as an ML nerf** — the harness cannot see the mine buff at all. It is
   listed for completeness and is a known blind spot of the instrument, not a finding.

## The endgame guarantee (Story 3.4) — re-verified under the new tuning

The no-stalemate contract rests on the `endgame` pilot (pacifist until `zonePhase === 'closed'`,
then hunts). That instrument is a **gunner**, so the 25 → 15 gun nerf cuts its post-closure kill
rate ~40% — the retune directly weakens the very instrument the pillar is measured with. Re-running
it was therefore mandatory, not optional.

| Endgame pilot (50 matches) | 2026-08-02 (Story 3.4) | 2026-08-04 (post-retune) | Δ |
|---|---|---|---|
| matches resolved | 50 / 50 | **50 / 50** | — |
| matches failed / unresolved | 0 | **0** | — |
| resolved past full closure | 100% | **100%** | — |
| **resolved p50** | **830.0s (13:50)** | **925.7s (15:26)** | **+95.7s** |
| mean | — | 940.6s (15:41) | — |
| min | — | 738.5s (12:19) | — |
| p95 | — | 1103.7s (18:24) | — |
| max | — | 1112.5s (18:33) | — |
| endedBy `fieldCleared` | 50 | 48 | −2 |
| endedBy `lastHumanSunk` | 0 | 2 | +2 |
| winner class BB / ML / TB | 25 / 13 / 12 | 20 / 19 / 11 | ML +6 |
| storm deaths / match | — | 6.2 mean | — |

**The no-stalemate guarantee HOLDS.** All 50 matches resolve, none cap out, 100% conclude past the
12:00 closure. The geometric bar of amendment 24 is met and no forcing mechanic is needed.

**But the ~15:00 contract is now exceeded at the median.** The endgame p50 moved
**13:50 → 15:26 (+95.7s)**, crossing the ~15:00 figure the Story 3.4 evidence cited as
"the ~15:00 contract at the median". The p95 is 18:24 and the longest observed match ran 18:33.

This is the single result on this page that warrants an Eric decision, and it is a **pacing**
question, not a correctness one — nothing is broken, matches just take longer to finish. Three
honest options, none of which this cycle takes unilaterally:

1. **Accept it.** Redefine the contract around ~15:30 and treat the longer endgame as the intended
   cost of a less lethal default weapon. No code change.
2. **Claw back some gun damage** (e.g. 15 → 18) and re-measure. The gun is the dominant lever here:
   the endgame pilot fires slot 0 only, so its p50 is close to a pure function of gun damage.
3. **Leave the tuning and shorten the storm timeline** instead, so closure arrives earlier and the
   endgame starts sooner.

Recorded, not decided.

The relevant bar (amendment 24): the no-stalemate guarantee is **geometric** — no post-closure
shrink, damage ramp, or forcing mechanic. Evidence is that resolved matches structurally conclude
past the 12:00 closure and inside the ~15:00 contract.

Corroborating signal from the 200-match `gunner` pass: `resolved past full closure` rose
**0.0% → 2.5%** (5 matches now conclude after the 12:00 closure, where none did before), and the
longest match observed was **873.5s = 14:33** — still inside the ~15:00 contract, but with far less
headroom than the 605.4s (10:05) maximum the old tuning produced.

## Caveats of record

- **The `gunner` pilot fires slot 0 only.** The torpedo, mine, and cannon retunes are structurally
  invisible to the BEFORE/AFTER columns. The measured +30% is the gun nerf in isolation.
- **Harness match lengths are lower bounds** (standing caveat from
  `batch-sim-evidence-2026-08-02.md`): scripted pilots converge faster than humans.
- Drones are weaponless and never un-beach, so drone-farm timings shift with the gun nerf in ways
  that do not correspond to human play.
- 200 matches at one seed. Deterministic and repeatable, but a single seed — directional reads are
  sound, tail behavior beyond p95 is thin.

## Reproduce

```
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 200 --seed 7
HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 50 --seed 7 --pilot endgame
```

Compare with `grep -v '^meta:'` — the body is byte-identical per run key.
