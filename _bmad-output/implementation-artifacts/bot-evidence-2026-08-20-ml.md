# Bot evidence — cycle 111, the Mine Layer posture pass (2026-08-20)

Companion to `spec-ml-posture-and-prepared-placement.md` and epic-7 amendment 30. Follows
`bot-evidence-2026-08-20.md` (cycle 110), whose blind-vacuum A/B produced the hypothesis this cycle
tests.

**The hypothesis under test:** the Mine Layer's bots build and sail it worse than chance because it
DIES BEFORE ITS PAYOFF, not because it picks the wrong targets. Eric's playtest named the class —
*"hang back and be safe/strategic… it wants certain things, and when it gets them it is a powerhouse,
it just needs to survive until then."*

---

## 1. THE RESULT — parity with chance, from well below it

Two arms, matched seed and roster (`--captains 0 --bots 18 --matches 30 --seed 11`), differing only
in spend policy. **Both arms re-run on cycle-111 code** — see §2 for why the cycle-110 random arm is
NOT a valid comparison.

### Mine Layer

| | weighted | random (control) | gap |
|---|---|---|---|
| **cycle 110** | 181.1s · 4/30 wins · 1.97 boons | 264.0s · 12/30 wins · 2.96 boons | **82.9s · 8 wins** |
| **cycle 111** | **264.4s · 8/30 wins · 2.89 boons** | 268.1s · 8/30 wins · 2.62 boons | **3.7s · 0 wins** |

**The survival gap is closed.** The weighted Mine Layer now lives as long as a randomly-built one
(264.4s vs 268.1s) and wins as often (8 vs 8), where it previously lived 46% less long and won a
third as often. Boons fitted rose 1.97 → 2.89 (+47%) and levels earned 4.29 → 6.14 (+43%) — it
survives long enough to reach the payoff Eric describes.

**It is also playing the way he described.** PvE kills rose 3.19 → 4.32 (+35%) while participant
kills edged DOWN 0.68 → 0.62: it hangs back and farms rather than trading early. `forager` is now the
longest-lived profile in the game at **296.6s** (7.24 levels, 3.79 boons, 8.7% still afloat).

### Full weighted arm, by class

```
  group           n kills   pve kill% alive%  lifeS   lvl boons spent%  shots     dmg dmg/shot
  battleship    183  0.95  3.68 46.4%   5.5%  216.9  5.70  2.77  99.9%   50.5   510.8    10.12
  mineLayer     174  0.62  4.32 34.5%   4.6%  264.4  6.14  2.89 100.0%   62.0   507.9     8.19
  torpedoBoat   183  1.17  3.44 44.8%   5.5%  208.2  5.54  2.68  99.7%   40.7   519.1    12.74
winner class: battleship=10 mineLayer=8 torpedoBoat=12
match length s: n=30 mean=543.6 p50=500.6 max=915.0
```

Quality bars, weighted arm: **4 of 6 PASS** (resolution 100%, max kill share 37.3%, land contact
0.6%, levels spent 99.9%). The two failures are the same pair that has failed since Story 6-4 and
were diagnosed there as questionable bars — bots scoring ≥1 participant kill 42.0% vs ≥60%, storm
deaths 1.6% vs 5–20%. Not regressions.

---

## 2. A METHOD CORRECTION THAT MATTERS MORE THAN THE NUMBER

The cycle-111 orchestrator instructed that the random control **must come back unchanged** from
cycle 110, and that any movement was a defect. **That instruction was WRONG, and the control did
move** (ML 12/30 → 8/30 wins; match length 529.1s → 598.6s).

It is not a leak. The test-profile rows are byte-identical (`testRow` / `TEST_APPETITE` untouched,
verified by diff). What moved is the **EQUIPMENT AXIS** — the churn bound and the prepared lay both
live in `EQUIPMENT_TACTICS`, which by the two-axis design (epic-7 amendment 29) is shared by every
profile carrying that equipment. The test rows run every appetite at EAGER, so they pick up prepared
laying too. The control was only ever going to hold if the cycle were confined to profile rows and
weights.

**THE DURABLE RULE:** the blind-vacuum rig's control is stable across cycles ONLY for PROFILE and
WEIGHT changes. Any EQUIPMENT-AXIS change moves both arms, so **the control must be re-run in the
same cycle** or the comparison is invalid. This cycle's headline uses the within-cycle comparison for
exactly that reason.

**Ruled not worth chasing (Eric, 2026-08-20):** the random arm's ML win count fell 12 → 8 and the BS
rose 13 → 17. At n=30 a 12-vs-8 win split is roughly 1.5σ on a binomial — *"its fine. its random.
nothing really changed on stats in this time. we know the behavior is an improvement."* Recorded
rather than investigated.

---

## 3. Determinism

Two identical-seed weighted runs (`/tmp/c111-weighted-1.txt`, `-2.txt`) produce **byte-identical
report bodies** excluding the trailing `meta:` line and stderr warnings. Verified by `diff`.

---

## 4. The gate, stated honestly

`npm run check` — shared **768** and server **1558** deterministically green. Client **3120** green
on a quiet machine (100/100 files).

**BUT `client/src/__tests__/radarHeatmap.test.ts` IS FLAKY, AND IT PREDATES THIS BRANCH.** Measured
in isolation on a quiet machine:

- on cycle-111 code: **1 of 5 runs failed** (2 tests)
- on cycle-110 code (`fcfcffe`, before any of this cycle's changes): **3 of 6 runs failed** (2–3 tests)

Always the same pair: *"every class at every aspect reads the SAME register at the same range"* and
its companion about no mask-derived quantity feeding intensity. This is a REAL DEFECT in the project
gate, not this cycle's: `npm run check` is the stated ship gate and currently has a material chance of
failing on a clean tree for reasons unrelated to the change under test. That trains re-run-until-green,
which is how a genuine regression eventually rides through. Ledgered in `deferred-work.md`; NOT fixed
here, because it is client rendering code untouched by this cycle and diagnosing a rasterization flake
needs its own evidence.

---

## 5. What did NOT move

`PROTOCOL_VERSION` **43**. No file under `client/`. No hull stat, card magnitude or combat constant —
Eric: *"A lot of this is what the balance pass is going to be for! But it still needs to play
intelligently."* The four non-ML profiles, `CONFIG.bots.profiles`, and all three test-only rows are
untouched.

---

## 6. Open, carried forward

- **`trapper` is still the weak profile.** Survival improved (228.1s) but it kills least of any
  profile (0.41) and finished **0% alive**. The re-band let it live; it has not made it dangerous.
- **The unverified `trapper`-under-buys-the-gun hypothesis** from cycle 110 is still unexamined: the
  gun dealt ~73% of participant damage in that campaign while `trapper` weights `guns` lowest of its
  five categories. It may dissolve entirely once the balance pass moves mine numbers.
- **Match length rose 29%** in the weighted arm (422.9s → 543.6s) because the Mine Layer stops dying
  early. A real pacing consequence, worth feeling on the water before it is called good.
