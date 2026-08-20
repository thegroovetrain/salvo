# Bot evidence — cycle 110, the Solo vs AI doctrine pass (2026-08-20)

Companion to `spec-solo-ai-doctrine-pass.md` and epic-7 amendment 29. Campaign scale is
deliberately modest per Eric's instruction (*"you don't need to do a metric fuckton of them, just
enough"*): 30-match legs, against the 50/200/250-match campaigns of prior cycles.

All numbers below were measured on the FINAL tree (`5bac4bf`), after both review gates. Where an
earlier measurement is quoted it is labelled as such.

Harness: `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs`. Note a fresh worktree needs `npm ci`
AND `npm run build -w shared` before the harness or the type-check will run.

---

## 1. The gate

`npm run check` — **5439 tests green** (shared 768 / server 1551 / client 3120), lint 0 errors.
Baseline at `d12ca0a` was 5392 (768 / 1504 / 3120), so the cycle added **47 tests**. The 3 lint
warnings are pre-existing and all in `client/`, which this cycle did not touch.

`PROTOCOL_VERSION` unchanged at **43**. No file under `client/` changed.

---

## 2. Bot-vs-bot quality bars

`--captains 0 --bots 20 --matches 30 --seed 7`

| # | Bar | Threshold | Measured | |
|---|---|---|---|---|
| 1 | matches resolving before the 16:00 collapse | > 95 % | **100.0 %** | PASS |
| 2 | mean per-match max single-bot kill share | ≤ 40 % | **29.6 %** | PASS |
| 3 | bots scoring ≥ 1 participant kill | ≥ 60 % | **44.8 %** | FAIL |
| 4 | storm deaths as a share of all bot deaths | 5–20 % | **1.6 %** | FAIL |
| 5 | afloat bot-ticks in land contact | < 1 % | **0.6 %** | PASS |
| 6 | banked levels spent before death | > 90 % | **100.0 %** | PASS |

**THE TWO FAILURES ARE NOT REGRESSIONS.** Both bars were already failing at Story 6-4
(`bot-evidence-2026-08-16.md`): bar 3 at **45.8 %** and bar 4 at **3.3 %**, where they were diagnosed
as questionable bars rather than bot defects — bar 3 is close to arithmetically unreachable, because
a 20-hull match has ~19 participant kills to distribute and any concentration at all puts it under
60 %. This cycle reads 44.8 % and 1.6 %, the same regime.

Bar 5 **improved**: 0.9 % → 0.6 %. (A 2-match smoke taken at the review gate read 1.9 % and was
flagged as a possible regression; at n=30 it is not one. n=2 was noise.)

---

## 3. The new verbs are live on the water

From the same campaign's ordnance ledger — every one of these was **structurally impossible before
this cycle**, because the buoy had no tactic and `chooseShot` walked a hardcoded ladder rather than
the fitted loadout:

```
launched: broadside=2534 captiveTorpedo=108 gun=22338 shell:1=5908 starShell=1377 torpedo=583
mines laid: 1723 | buoys deployed: 655
```

- **655 buoys deployed.** Bots never placed one before; `tactics.ts` carried a comment saying buoy
  tactics were "a later agent's".
- **108 captive torpedoes** — the CAPTIVE MINES doctrine actually firing.
- `bulwark` fits `starDazzle=10 starDuration=7 starIncendiary=5`, i.e. a Battleship using the star
  shells it has always carried and was previously flagged never to fire.

Card ledger: **`NEVER OFFERED: (none)`** and **`OFFERED BUT NEVER FITTED: (none)`** — all 29 catalog
lines are both offered and fitted under bot policy. Every acquisition line is now fitted in play
(3–13 fits across 30 matches) where the extra slot previously filled only when a hand was all junk.

---

## 4. THE BLIND-VACUUM A/B — the rig's first finding

Two arms, **matched seed and roster** (`--bots 18 --matches 30 --seed 11`), differing only in spend
policy. The random arm adds `--bot-profile random`, which sails the same tactics at the same
competence and picks uniformly at random from each offer (damage control still fires by rule, so it
is not a confound).

| class | wins, WEIGHTED | wins, RANDOM | kills w → r | kill% w → r | alive% w → r |
|---|---|---|---|---|---|
| Torpedo Boat | **15 / 30** | **5 / 30** | 1.15 → 0.53 | 43.2 → 35.0 | 8.2 → 2.8 |
| Battleship | 11 / 30 | 13 / 30 | 0.90 → 1.26 | 44.8 → 55.6 | 6.0 → 7.2 |
| Mine Layer | **4 / 30** | **12 / 30** | 0.68 → 0.92 | 37.4 → 48.3 | 2.3 → 6.7 |

Match length: weighted mean 422.9 s (p50 427.5), random mean 529.1 s (p50 521.7) — random builds
kill each other more slowly, as expected.

### Two readings, and they are different claims

**(a) The Torpedo Boat is the build-sensitive hull.** It is the strongest class with a curated build
and the weakest with a random one — a 15 → 5 win swing and less than half the kills. Its identity
(one 30 s torpedo, thin hull, speed) rewards the right cards and punishes the wrong ones far more
than the other two hulls. **This is a statement about the HULL and the CATALOG, and it is Eric's to
rule on, if anything is to be done about it at all.** Nothing was changed for it in this cycle.

**(b) The Mine Layer's bots build it WORSE THAN CHANCE — and that is a bot-policy finding.** It is
the weakest hull under `forager`/`trapper` (4 wins) and the second-strongest under random picks
(12 wins), nearly tripling its win share by having its weight tables ignored. A profile that
underperforms a coin flip is evidence about the WEIGHT TABLE, not about the hull. **Not acted on in
this cycle** — retuning `forager`/`trapper` on a single 30-match A/B would be exactly the
"tune first, measure later" mistake the rig exists to prevent, and the cycle's ruled scope was to
teach behaviour, not to re-balance profiles. Recorded as the first thing a follow-up should chase.

### Honesty bounds on this A/B

- One seed, 30 matches per arm. Directionally large (15 vs 5; 4 vs 12), but a single seed pair.
- **Bot behaviour, not human behaviour.** A human's build is neither weighted-table nor uniform.
- The random rows carry *more* levels and boons (6.6 vs 5.1 lvl) purely because their matches run
  ~106 s longer; per-kill comparisons already normalise for that, win share does not.
- An earlier arm pair measured before the cross-model fixes read 16 / 10 / 4 and 5 / 13 / 12 — the
  same picture, so the C1 stacking fix did not move class outcomes at this sample size.

---

## 5. Determinism and the surviving control

- Two identical `--captains 0 --bots 20 --matches 2 --seed 7` runs produce **byte-identical report
  bodies** excluding the trailing `meta:` line (verified at the review gate).
- `--bot-profile raider` is **refused** — the CLI accepts test ids only, so the blind-vacuum rows
  cannot be confused for in-game profiles at the command line, and `CONFIG.bots.profiles` cannot
  reach them at all.
- `--bot-engage endgame` resolves its matches and reports 100 % resolved-past-endgame, replacing the
  retired omniscient `endgame` pilot as the Story 3.4 instrument.
- `--control pacifist` still runs the full storm timeline; `--pilot` now throws a usage error.
- `--deck-only --draws 50000 --seed 7` runs unchanged (its run key carries no roster segment, so
  pre-cycle deck-only bodies remain comparable byte-for-byte).

---

## 6. Report-body changes of record

Batch-mode bodies from before this cycle will not diff clean against new ones. Three deliberate
changes:

1. `main.ts` run-key header: ` pilot=X` → ` control=X` (plus a ` botProfile=` segment when non-default).
2. `catalogReport`'s policy sentence now names `spendPolicy.pickSpendChoice` rather than
   `pilots.pickSpendChoice`.
3. A new `FITS BY CLASS / SPENDER` block, and the deck-composition block now prints in batch mode.

Deck-only bodies are unaffected by (1).
