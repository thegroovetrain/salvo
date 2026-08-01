# Batch-Sim Evidence Report — Story 2-10 (2026-07-31)

First evidence campaign of the triple-duty harness (`server/scripts/batchSim.mjs`). All runs seeded (`--seed 7`), deterministic (byte-identical reruns verified), over the REAL sim (in-process `World`+`Match`, production CONFIG except countdown 1000ms). 500 matches per batch variant; ≥10,000 simulated economies per deck-only variant. Scripted omniscient gunner captains + drone fill per amendment 54 — pilot lethality exceeds human play, so match lengths are LOWER BOUNDS on human matches.

## Campaign matrix

**Roster baselines (current dials):**

| Roster | len p50/p95 (s) | level p50/p95 | picks p50 (mean) | excl offered/fitted reach | endedBy |
|---|---|---|---|---|---|
| 1 captain v 5 drones | 77.6 / 166.3 | 2 / 4 | 2 (2.31) | 35% / 25% | 487 fieldCleared, 13 lastHumanSunk |
| 2v4 | 49.5 / 142.0 | 2 / 3 | 1 (1.32) | 28% / 18% | 492 / 8 |
| 3v3 | 40.4 / 131.7 | 1 / 3 | 1 (0.92) | 19% / 11% | 492 / 8 |
| 6v0 | 30.9 / 130.5 | 1 / 3 | 1 (0.72) | 13% / 9% | 468 / 32 |

> **Caveat — the 1v5 row models a lobby that does not ship today.** The runner drives matches with `minHumans: 1` (production `CONFIG.match.minHumans` is 2). A real solo captain never leaves the weapons-safe ready room, so the 1-captain baseline reads as the FUTURE solo-vs-AI shape (Epic 6) / the dev-override lobby, not a live configuration. The 2v4 / 3v3 / 6v0 rows are unaffected.

**xp.levelMs sweep** (30000 / 45000 / 60000): at 1v5, picks mean 3.80 / 2.79 / 2.31 and excl-fitted reach 42% / 32% / 25%; at 3v3, picks mean 1.62 / 1.18 / 0.92. Match lengths unchanged (the dial does not alter combat).

**zone.shrinkDuration sweep** (180s / 420s / 720s, 3v3): picks mean 0.92 / 0.97 / 0.98 — the zone is NOT the binding constraint at this pilot lethality; elimination ends matches at ~40s p50 long before any storm close.

**deck.rareWeightPerDryLevel sweep** (deck-only, full-deck economies, ~10k each):

| dial | pity curve (rareRate by dry 0→6) | first-exclusive OFFERED draw p50/p95 |
|---|---|---|
| 0 (no pity) | 0.54 → 0.35 → 0.31 → 0.29 → 0.27 → 0.26 → 0.25 (falls — natural depletion) | 5 / 16 |
| **0.35 (current)** | 0.50 → 0.39 → 0.40 → 0.42 → 0.43 → 0.44 → 0.46 (≈flat — pity only offsets depletion) | 4 / 12 |
| 0.7 | 0.48 → 0.43 → 0.47 → 0.51 → 0.53 → 0.54 → 0.57 (genuinely rising) | 4 / 11 |
| 1.5 | 0.46 → 0.52 → 0.59 → 0.64 → 0.67 → 0.67 → 0.68 (steep) | 3 / 9 |

## Findings

1. **The XP dials are not the problem; match length is.** Passive ~1 level/min + kill fractions behave exactly as ratified (drone tiers ¼/⅓/½ + captain 1 observed in level accounting). The 12–20 picks-per-match draft band arithmetically requires ~10+ minutes of active play — NFR6's intended shape (ring closed ~12:00) — while today's matches run 0:40–1:20 p50: the shipped storm closes at 3:45 (Story 3.1's scope) and omniscient pilots kill far faster than humans will. Lowering `xp.levelMs` to force 12–20 picks into a 40-second match would mean a level every ~3 seconds — nonsense. The dial is consistent with its design target at design-length matches.
2. **`killLevels=1` + drone tiers: verified, no counter-evidence.** Kill XP dominates short matches as designed (kills accelerate, the passive floor never zeroes out — the Rat Covenant shape holds).
3. **The current pity dial (0.35) is pity in name only.** Without escalation the rare rate FALLS as the deck's rares depelete; 0.35 merely cancels that fall. Amendment 38's ratified intent — "escalating rare weight (invisible soft pity)" — only actually escalates at ≥0.7.
4. **Structural (deck): doctrine-rival cards never leave circulation.** Once a doctrine is fitted, its rival presents as a free REPLACE forever (ping-pong is legal, ratified); decks floor at those cards instead of emptying. Reported for awareness; no rule change proposed.
5. **endedBy classification works end-to-end** (amendment 53): quit-outs are now distinguishable from fought-out endings in `match.end`; the harness surfaces the split per batch.
6. **Zone-length conclusions are deliberately NOT drawn** (Story 3.1 owns NFR6); the sweep is included only to show the economy's insensitivity to it at current pilot lethality.

## Recommendations (for Eric's ratification — amendment 55)

- `xp.levelMs`: **KEEP 60000** (confirm-as-is; the shape is right, the shortfall belongs to match length / 3.1).
- `xp.killLevels`: **KEEP 1**; `xp.droneTierLevels`: **KEEP ¼ / ⅓ / ½**.
- `deck.rareWeightBase`: **KEEP 1**.
- `deck.rareWeightPerDryLevel`: **RAISE 0.35 → 0.7** — makes the ratified escalating pity actually escalate against depletion, trims the first-exclusive tail (p95 12→11 draws full-deck; the improvement concentrates exactly in the early draws real matches reach), without flooding offers (dry-0 rate actually dips 0.50→0.48).

## Ratified outcome (recorded post-checkpoint)

Eric ratified both recommendations at the amendment-55 checkpoint (2026-07-31, recorded as amendment 57):

- **CONFIG.xp confirmed as-is** (`levelMs` 60000, `killLevels` 1, `droneTierLevels` ¼/⅓/½) — this is the committed tuning pass of FR18's values: evidence-confirmed rather than changed, with the picks-band shortfall attributed to match length (Story 3.1's scope).
- **`deck.rareWeightPerDryLevel` raised 0.35 → 0.7** (`rareWeightBase` stays 1) — committed in `shared/src/constants.ts` with the `barrel.test.ts` pin updated knowingly. The 1.5 steep-pity option was declined.

## Review-gate adjudications (2026-07-31)

Two honesty caveats raised at the 2-10 review gate, recorded here so the evidence above is read with them attached. Neither changes a number in this report.

**(a) The deck-only stopping rule is a MODELING choice, absent from production.** The deck-only mode ends an economy when the deck is empty *or* holds only terminal rival cards. **Production has no economy termination at all**: once a doctrine is fitted, its rival card is a permanent REPLACE offer — `world.ts` `settleSpend` returns the swapped-out rival to the deck — so a rivals-only deck cycles forever at net-zero depletion. Only the match ends, never the deck. Codex's cross-model challenge on this point was **adjudicated as documentation-honesty, not evidence invalidation**:

- every dial variant ran under the *identical* rule, so the comparative flat-vs-escalating-pity conclusion (Finding 3, Recommendation `rareWeightPerDryLevel` 0.35 → 0.7) is apples-to-apples;
- the buckets that drove ratification are the early-draw ones (dry 0–6), which are dominated by **pre-exhaustion** draws — the rule truncates only the deep tail;
- the batch mode (real `World` + `Match`, no stopping rule whatsoever) corroborates the same direction independently.
- What the rule *does* bias, and what must therefore never be quoted as a production lifetime: "draws played per economy", the "empty-or-rivals-only" rate, and the deep-dry (≥ ~10) pity rows. Those are harness-model numbers.

The rule is now stated in the deckSim module header, printed in the deck-only report body itself, and reflected in the renamed labels ("decks empty-or-rivals-only at stop"; depletion is "after draw k AND its immediate spend, give-backs included").

**(b) `minHumans: 1` caveat** — see the campaign-matrix note above: the 1v5 baseline models the future solo-vs-AI mode / dev-override shape, not a lobby that ships today (production requires 2 humans to arm the countdown).

## Reproduction

`HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --matches 500 --seed 7 --captains C --drones D [--sweep key=v1,v2,...]` and `--deck-only --draws 1000000 --seed 7 --sweep deck.rareWeightPerDryLevel=0,0.35,0.7,1.5`. Same run key → byte-identical report body.
