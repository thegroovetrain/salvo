# Batch-sim evidence — 2026-08-27 (cycle 130: broadside zero-overlap arc ladder)

Change under measure: the SPREAD ladder re-cut to zero overlap at base (spec:
`spec-broadside-zero-overlap-arcs.md`; PV 48 → 49; 0.17.130). CONFIG.broadside:
`turretMountSpreadDeg` scalar 28 → per-rung `[28, 25, 22.5, 15, 6]`, `traverseDeg`
`[33.5, 39.5, 45.5, 51.5, 57.5]` → `[6, 7, 7.5, 9, 14]` (both DRAFT). No other
combat scalar moved (damage 15 / reload 18s / turrets 4→6 / 5/8-rung range all
stand at cycle-122 values).

## Eric rulings (2026-08-27, interactive question gate)

1. **Overlap schedule:** base + card 1 + card 2 = ZERO overlap (dead gaps shrink;
   card 2 exactly touching); overlap starts at card 3; heavy at card 4.
2. **Max choke = TRUE CONVERGENCE:** mounts rotate inward AND traverse widens, so
   at ×4 SPREAD all guns angle onto one abeam click from mid range out (~265u+).
3. **TURRETS card:** emergent gap-closing from denser guns is ACCEPTED; the
   zero-overlap promise is stated at the base 4-gun battery. No per-count traverse.
4. **Arc display:** bright per-turret wedges from each gun's real muzzle + the
   ±60° legal sector reduced to a thin outline; aim preview distinguishes
   on-click from arc-clamped shells.

## Measurement-scale rulings (2026-08-27) — SUPERSEDES the 2026-08-24 discipline row's scale

Three escalating corrections, now standing law: **no sim run is ever launched
unprompted — ask first**; an approved quick check is **≤99 matches, hard cap**
(*"Do not EVER do more than 99 matches on your own. EVER."*); full campaigns are
dedicated sessions Eric names, with the count he names. The 08-24 "same-night
campaign before merging" row's *intent* (measure balance-touching changes)
stands; its *scale* was never meant per-patch. Batching several changes and
measuring once is fine.

## Geometry evidence (balanceProbe, deterministic, no rng)

Overlap schedule at the base 4-gun battery — the ruled shape holds exactly:

```
rung | mountSpread | traverse | gap = 2*spread/3 | 2*traverse | verdict
  1  |       28.00 |     6.00 |           18.667 |      12.00 | gap
  2  |       25.00 |     7.00 |           16.667 |      14.00 | gap
  3  |       22.50 |     7.50 |           15.000 |      15.00 | touching
  4  |       15.00 |     9.00 |           10.000 |      18.00 | OVERLAP
  5  |        6.00 |    14.00 |            4.000 |      28.00 | OVERLAP
```

Guns ON the click (battleship, port beam, R=100/200/300/412.5): rung 1 abeam is
0/0/0/0 (dead gap dead-abeam — you aim a wedge, not the target); rung 5 abeam is
2/2/4/4 — the ruled convergence from ~300u. Shells landed on a stationary
broadside-aspect TB with hull-centre aim: rung walk 0 → 2 → 2 → 2 → 4. The
budget genuinely moved from alpha into reliability. Odd-count note (ledgered in
deferred-work): at 5 turrets the centre mount sits on the beam and always bears.
Also measured: "6 turrets ≥ 4 turrets on-click everywhere" is FALSE (86
counterexample geometries) — densification re-spaces the whole battery.

## Trend campaign (96 matches — Eric-approved quick check, NOT a full campaign)

Rig: `--bot-spend random --roster even --raw`, seed 42, 20 bots — same rig/seed
family as the 08-24 tuned campaign, at trend precision only (no card CIs).
96/96 resolved.

| class | 08-24 baseline (999) | this run (96) | 95% CI |
|---|---|---|---|
| battleship | 44.6 % | **24.0 %** | 16.5–33.4 |
| mineLayer | 32.5 % | **44.8 %** | 35.2–54.7 |
| torpedoBoat | 22.9 % | **31.3 %** | 22.9–41.1 |

**Read:** the Battleship's ~20 pp drop is outside CI overlap even at this sample
— real for BOTS. **Caveat that bounds the claim:** bot broadside play aims at
hull centres and its weights/gating predate the ladder (deferred-work entries),
so bots take the low-rung weapon at its worst and cannot do the "aim your ship"
counterplay the design is built on. This number is closer to an UPPER bound on
the loss than an estimate of human play. No rebalance taken — Eric's call,
matching the 7-5 evidence-pass posture. Card-level winrates deliberately not
reported at n=96.

## Visual QA (headless client, worktree dev server, PV-49 solo match)

Verified by screenshot: per-turret wedges spring from separate real muzzle
points along the hull, narrow with visible dead-zone gaps; aimed beam lit amber,
far beam dim; hotbar/priming/denial flows normal; no console errors. NOT
verified by eye (unit-tested only): the clamped-shell preview alpha distinction
(illegible in software-GL screenshots) and the rung-5 converged display (no
dev route to grant 4 SPREAD cards mid-match).
