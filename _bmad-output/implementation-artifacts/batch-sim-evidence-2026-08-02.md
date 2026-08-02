# Batch-Sim Evidence — Story 3-4 The Endgame Guarantee (2026-08-02)

Campaign run on the final 3-4 code state: `CONFIG.vision.radar` DERIVED `SIGHT * 2` (= 660u, amendment 22 — gun base range and star-shell flare range ride the same number, 650 → 660) and the scripted pilots carrying amendment-25 un-beach seamanship v2 (stuck-detect → rotate-away astern burst → heading-hold grace; deterministic, rng-free). All runs seeded and byte-identical on rerun. Harness: `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs`. New evidence surfaces this story: `winnerClass` per match, resolved-only duration percentiles, and the past-closure rate.

## Standing honesty caveats (amendment 2 / 24 / 25)

Gunner pilots are omniscient and near-optimal: lethal match lengths are LOWER bounds and kill rates UPPER bounds on human play. The `endgame` pilot is a MODELING INSTRUMENT, not a human model: it forbids all combat until full closure (720s), so its conclusion times are the conservative side of the endgame question — real captains skirmish long before 12:00 and finish sooner. Pacifist `unresolved` cap-outs are STRUCTURAL by design (weaponless drones + no-fire captains cannot produce a winner; amendment 24's geometric bar). The tick cap is closure + 600s slack = 1320s.

## Run 1 — THE PILLAR: endgame campaign (`--pilot endgame --matches 50 --seed 4`)

- **50/50 matches resolved, endedBy fieldCleared=50, zero cap-outs; 100% of resolved matches concluded PAST full closure.**
- Resolved match length s: p50 **830.0** (13:50), p25 796.7, p75 883.1, p95 1028.1, max 1169.1 (19:29) — min 755.2, structurally past the 720s closure by construction of the instrument. The ~15:00 start-to-results contract holds at the median with an honest tail; the instrument's no-combat-before-closure handicap makes these conservative.
- Winner class: battleship=25, mineLayer=13, torpedoBoat=12 — **no range class shut out of the 660u endgame** (the "no free win" pillar clause, measured).
- Storm deaths 5.6/match (the ring has teeth through the closes); picks per captain p50 **14** — inside the 12–20 band, corroborating 3-1's band-by-match-length finding.

## The instrument iteration (amendment 25) — why the pilots changed mid-story

- v0 (forward-only pilots): 48/50 resolved. Probe diagnosed both cap-outs as **island-beaching permalocks**: grounded hulls take `islandSpeedMult` every contact tick, rudder authority scales with speed, and the pilots never command astern — pinned forever (one match also island-LOS-shadowed). Humans carry full astern (9-detent telegraph to −1); the game has no permalock — the instrument did. Eric ruled: fix the instrument, rerun (amendment 25).
- v1 (astern burst, rudder amidships): 47/50 + 1/200 gunner cap-out. Probe: all four residual failures were the **metronome** — backing retraces the same line, target-seek re-beaches on the same rock (inter-burst gaps of exactly ~139–158 ticks, 60–97% of the endgame immobile); every blocked drone was killable once LOS opened (78–153u of lateral shift sufficient).
- v2 (rotate-away rudder during astern — islandAvoid cross-product sign, negated for signed sternway authority — plus heading-hold through the grace): **50/50 endgame, 200/200 gunner. Metronome eliminated.**
- Read: the geometric no-stalemate claim never failed — zero mutual-avoidance failures in ANY leg at ANY iteration; every cap-out was a seamanship gap in the instrument, and minimally competent seamanship (reverse off a rock, don't re-ram it) resolves 100% of matches.

## Run 2 — Lethal gunner baseline (`--matches 200 --seed 1`), radar-660 + seamanship

| | 2026-08-01 baseline (radar 650) | radar 660 only (interim) | final (radar 660 + seamanship v2) |
|---|---|---|---|
| match length p50 s | 293.3 | 288.0 | **235.5** |
| endedBy | fieldCleared 183 / lastHumanSunk 17 | 187 / 13 | **fieldCleared 196 / lastHumanSunk 4 / unresolved 0** |
| storm deaths total | 90 | 68 | 37 |
| picks p50 | 5 | 5 | 5 |
| first exclusive FITTED reach | 54.8% | 55.5% | 51.3% |

Attribution: the radar/gun bump alone moved the baseline ~−1.8% (economically invisible — picks and exclusive-reach unchanged within noise); the seamanship mobility is the larger effect (−18%, hunters spend less time aground). No dial touched, none proposed.

## Run 3 — Pacifist control (`--pilot pacifist --matches 50 --seed 2`), radar-660 + seamanship

- endedBy: **unresolved=50 — pure structural**, as amendment 24 defines (the earlier one-off storm-ended lobby now survives with seamanship; matches n=0 resolved, and the report's all-unresolved guard renders it correctly).
- **Picks p50 at t=720s (12:00 closure) = 12.0 — the band floor still lands exactly at closure**, unchanged through both the radar change and both seamanship iterations (the 3-1 headline invariant is robust).
- Picks p50 at cap = 21; final level p50 22; copy-capped lines p50 5, 100% of captains cap ≥1 line.

## Sensor-constraint verification (the pillar inequalities, now pinned)

`shared/src/__tests__/zone.test.ts` ("Endgame Guarantee (Story 3.4)"): `radar === 2 × sight` (derivation, amendment 22), `radar ≥ zoneTerminalRadius` (blips stay meaningful — structural equality today: radar from the ring center exactly covers the 660u ring), `sight < zoneTerminalRadius` (no hull auto-visible across the ring from center). Retuning truesight now moves gun base range, star-shell flare, radar paint, AND the endgame ring together; a one-sided retune fails loudly.

## Observations ledgered, no change proposed

- **Island pockets inside the terminal ring**: islands inside the 660u endgame ring create no-fire LOS shadows with zero storm pressure to dislodge a hull sitting in them (island-LOS blocking is Eric-ratified doctrine 2026-08-02). Real captains maneuver around them (and did, in-instrument, once given seamanship) — awareness entry for endgame feel review, not a defect claim.
- **Drones never un-beach**: `server/src/game/drones.ts` server AI has no astern behavior; beached drones sat immortal-behind-cover in the v0/v1 probes until captains flanked them. Epic 6's combat-bot AI (6-4) is the natural home for real bot seamanship.
- `ENDGAME_SLACK_MS` 600s is adequate: slowest resolved endgame match 1169.1s vs the 1320s cap.
