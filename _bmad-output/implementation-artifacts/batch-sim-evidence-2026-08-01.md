# Batch-Sim Evidence — Story 3-1 Phased Zone Timeline (2026-08-01)

Campaign run on the wave-1 implementation (phased 3-group offset-ring timeline; CONFIG design targets: map.baseRadius 2400 @ capRef 20, match.fillTo 20, zone.beatMs 60000, offsetCap 1.0, terminalSightFactor 2 → 660u, geometric ringSteps). All runs seeded and byte-identical on rerun (report bodies deterministic per run key; harness reproducibility pinned by tests). Harness: `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs`.

## Standing honesty caveats (amendment 2 / 2-10 ledger)

Gunner pilots are omniscient and near-optimal: their match lengths are LOWER bounds and kill rates UPPER bounds on human play. Pacifist pilots (new this story: sail the rhythm, never fire) bound the other side: their picks curve is the no-combat-time-loss ceiling shape. Humans land between the two. `endedBy: unresolved` = match hit the harness tick cap (zone closed + 600s slack) with no winner — structurally expected for pacifist lobbies (weaponless drones + no-fire captains cannot produce a winner; the endgame-conclusion guarantee is Story 3.4's evidence, not this story's).

## Run 1 — Lethal baseline (`--matches 200 --seed 1`, gunner)

- Match length s: p50 **178.4** (mean 190.4, p95 279.3, max 705.5) — vs 0:40–1:20 p50 on the pre-3.1 config (2-10 evidence): the bigger board roughly **tripled** even omniscient-lethal matches.
- endedBy: fieldCleared=190, lastHumanSunk=10. Storm deaths: 6 total/200.
- Picks per captain: p50 **4** (mean 4.2, p95 7) — vs 0.72–2.31 pre-3.1. Band (12–20) still unreached under omniscient lethality, as the lower-bound caveat predicts.
- Kill mix: captain=407, drones=3383 (large 990 / medium 1198 / small 1195) — the 17-drone fill is the dominant XP source for hunters (piñata effect measured, no dial change proposed; drone XP stays tiered per amendment 31).
- First exclusive FITTED: 45.0% reach, timeS p50 70.0.

## Run 2 — Pacifist control (`--pilot pacifist --matches 50 --seed 2`)

- Match length: all 50 ran to the 1320s cap (720s closure + 600s slack); endedBy unresolved=50 (structural, see caveats).
- **Picks p50 = 12.0 at t=720s (ring-closed 12:00) — the 12–20 band floor is reached exactly at closure**; by the cap, picks p50 = 21 (band top ~1 min after). Level curve is clockwork (time-to-N-boons at exact 60s multiples): the passive ~1 level/min shape survives the timeline intact.
- Final level p50 22; boons fitted p50 21; deck cards remaining p50 65 (no deck exhaustion at full-rhythm depth); copy-capped lines p50 4, 100% of captains cap ≥1 line.
- First exclusive: 100% reach (OFFERED p50 240s, FITTED p50 240.1s) — exclusives reliably reachable in full-length matches.
- Storm deaths: 51 total / 50 matches (mean 1.0, max 5) among 20-ship lobbies of non-fighting sailors — the storm has real teeth during closes yet is survivable by anyone who commits (closing-rate criterion behaving as designed).

## Run 3 — Map-radius sweep (`--sweep map.baseRadius=1600,2400,3200 --matches 100 --seed 3`, gunner)

| | 1600u | 2400u | 3200u |
|---|---|---|---|
| match length p50 s | 145.3 | 181.9 | 232.5 |
| picks p50 | 4 | 4 | 5 |
| storm deaths total | 1 | 7 | 10 |
| endedBy fieldCleared | 99 | 96 | 98 |

Match length now rises monotonically with map size — the 2-10 "zone-insensitivity at current pilot lethality" finding is over; the board and the ring now bind pacing even for omniscient hunters.

## Analytic closing-rate table (offsetCap 1.0, terminal 660u, geometric steps; battleship-minute = 2100u)

| map R | radii | worst-case escape per close (2Δr) | % of battleship-minute |
|---|---|---|---|
| 1600 | 1600→1191→887→660 | 818 / 609 / 453 | 38.9 / 29.0 / 21.6 |
| **2400** | **2400→1561→1015→660** | **1679 / 1092 / 710** | **79.9 / 52.0 / 33.8** |
| 3200 | 3200→1891→1117→660 | 2619 / 1547 / 914 | **124.7** / 73.7 / 43.5 |

2400u lands the ratified "neither dilly nor dally" target on close 1 (~80%, pinned by the shared closing-rate test); 3200u makes close 1 unescapable for a worst-placed battleship (>100%) and is rejected; 1600u is escapable at quarter-throttle everywhere (toothless).

## Recommendation (for the amendment-55-pattern checkpoint)

Commit the wave-1 design targets unchanged: `map.baseRadius 2400 / capRef 20 / match.fillTo 20`, `zone.beatMs 60000 / offsetCap 1.0 / terminalSightFactor 2 / geometric ringSteps`, `stormDps 4`. Every ratified criterion is met at these values; no XP or deck dial is touched (amendment 2 honored — the picks band was reached by match length alone).

## Post-review addendum (2026-08-02): island scaling (amendment 12) + perf leg

The review gate scaled the island field with the map (amendment 12: cluster budget ~× map-area ratio; sizes 30–90u; the 2400u board realizes ~37 islands / 2.22% cover vs the old 900u board's ~5.6 / 1.40%). Both evidence runs were re-executed on the final code state (same run keys; byte-identical rerun property re-verified):

| | Lethal 200 (seed 1) old → new | Pacifist 50 (seed 2) old → new |
|---|---|---|
| match length p50 s | 178.4 → **293.3** | 1320 cap (unchanged; one lobby storm-ended at 502s) |
| endedBy | fieldCleared 190→183, lastHumanSunk 10→17 | unresolved 50→49, lastHumanSunk 0→1 |
| storm deaths total | 6 → **90** | 51 → **311** (mean 6.2/match) |
| picks p50 | 4 → 5 | 21 at cap (unchanged) |
| **picks p50 at t=720s (12:00 closure)** | — | **12.0 (unchanged — the band floor still lands exactly at closure)** |
| first exclusive FITTED reach | 45.0% → 54.8% | 100% → 95.3% (early-ended-lobby tail) |

Reading: cover slows even omniscient hunters (~65% longer matches) and the denser field materially raises storm lethality during closes (escape lanes blocked) — the ring now kills sailors who don't commit, exactly the "neither dilly nor dally" intent. The picks-band conclusion is unchanged and slightly strengthened.

**Amendment 7's perf leg (measured at the review gate):** in-process probe, 20 human gunner captains (production ceiling: every hull a frame-receiving client), damage suppressed so all 20 stay alive and firing, 6,000 ticks, real per-observer `observe()`/frame build ×20 per tick. **Total per tick p50 1.330ms / p95 1.846ms / p99 2.169ms** (sim p50 1.264ms; frames×20 p50 0.057ms) against the ~3ms sim budget — comfortable headroom at the new scale on this hardware; per-observer perception cost is negligible next to the sim step.
