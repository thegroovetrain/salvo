# Batch-sim evidence — balance cycle 1 (2026-08-20)

**Instrument:** `/balance-sim`. **Status: MEASUREMENT ONLY — no CONFIG value has been changed.**
Every number below is a reading or a *proposal awaiting an Eric ruling*. `shared/src/constants.ts`
is untouched on this branch.

**Session framing (Eric, 2026-08-20):** *"ANY AND ALL SUGGESTIONS are on the table, including changes
to the size of the map, where ships spawn, and changes to equipment mechanics beyond numbers, though
of course we should try and hit targets without these if possible. The goal is a fun game."* And:
*"I don't expect to finish the balance during this session… start moving the needle… finish up
tomorrow."* So this entry is written to be resumed cold.

## The two targets

1. **Class win share** — torpedoBoat / battleship / mineLayer each in **31–35 %**.
2. **Attrition pacing** — about half the field gone per ring cycle: 20 → ~10 → ~5 → ~2–3.

Ring-cycle boundaries were **derived from `CONFIG.zone`**, not assumed: `beatMs` 60000 × 4 beats ×
3 ring groups puts group closes at **4:00 / 8:00 / 12:00**, with sudden death running 12:00 → 16:00
(`zoneClosedAtMs` = 960000) beyond the target curve. That matches the skill's default, so the
default was used.

## Method and instrument fixes

Campaigns are `server/scripts/batchSim.mjs`, 20 bots, `--captains 0`, sharded 12 ways, merged by
variant label. **`--roster even` was passed on every run** — without it each bot rolls its own hull
and over-represented classes take wins for free, which invalidates win share outright.

Three instrument defects were found and fixed before any campaign was believed:

| fix | why it mattered |
|---|---|
| `run_campaign.py` now sets `HC_BALANCE=1` alongside `HC_DEV_OPTIONS=1` | `--tune` carries its own env gate; without it every equipment arm would have died at argv parse |
| `check_preconditions.py` roster check rewritten | it looked for a bare `addBot()`; the harness moved to a `--roster` flag, so a *passing* harness reported FAIL |
| `analyze_campaign.py` now uses exact `lifeSamples` | attrition was pooled from per-class quantile summaries (approximate). The harness emits per-bot life values, so the survivorship curve is now **exact**, with a per-class split and a `matches_reaching` censoring guard |

**Censoring, stated rather than hidden:** a bot still afloat when its match ends is recorded with
`life == match duration`, so past that point it counts as dead. Only the winner(s) are censored this
way (~1 in 20), and the bias always *understates* how many are alive late. `matches_reaching` is
what says whether a cycle happened at all.

**Operational note for the next session:** a `nohup`'d campaign is reaped when the tool call returns
but leaves orphan `node` **and** `tsx` grandchildren that keep running and write the *same* shard
filenames. This cost ~45 min of half-speed contention here. Launch campaigns with the harness's own
background mode, and if it happens kill **both** process layers. Shards write only on completion, so
a killed campaign loses everything — prefer several smaller arms over one huge one.

## Per-class equipment fit — DERIVED FROM CODE, not from docs

`CLAUDE.md`'s *"universal weapon fit… every class shares CONFIG.gun/torpedo/mine"* is **stale**.
`shared/src/sim/loadout.ts` is authoritative:

| hull | slots | hp | max speed | turn |
|---|---|---|---|---|
| torpedoBoat | gun, **torpedo**, **speedBoost** | 125 | 45 | 0.8 |
| battleship | gun, **broadside**, **starShells** | 175 | 35 | 0.4 |
| mineLayer | gun, **mine**, **radarBuoy** | 150 | 40 | 0.6 |

**Blast radius of each dial family** (measurement context, never a gate):
`gun.*` → all three, so it can only move *relative* balance second-order.
`torpedo.* speedBoost.*` → TB only · `broadside.* starShells.*` → BS only ·
`mine.* radarBuoy.*` → ML only · `shipClasses.<id>.*` → that hull only.
Acquisition cards can cross these lines in principle. The 7-5 evidence pass measured bots fitting
**none** of 2,495 acquisition offers — but that pass predates Eric's AI-tactics work, **this campaign
did not re-measure it**, and the harness emits no per-line pick breakdown to check it against. Treat
the fit above as exact for bot campaigns *provisionally*; re-measuring it is on the open list.

## Baseline — 360 matches, even roster, 100 % resolution

Roster spread **0.0** (2400 bot-matches per class), 360/360 resolved. Worst half-width **±5.13 pp**,
so the supported tier is the coarse one; treat the ranking as solid and the third decimal as noise.

| class | wins | share | 95 % CI | in 31–35 %? |
|---|---|---|---|---|
| **torpedoBoat** | 187 | **51.9 %** | 46.8 – 57.1 | **no — far over** |
| battleship | 114 | **31.7 %** | 27.1 – 36.6 | consistent |
| **mineLayer** | 59 | **16.4 %** | 12.9 – 20.6 | **no — far under** |

**The gap is 35 pp wide**, many times the CI. This is not a noise artifact.

### Attrition — every match ended by field-clearing

| checkpoint | alive | target | delta | matches still running |
|---|---|---|---|---|
| 4:00 | **7.8** | 10 | −2.2 | 100 % |
| 8:00 | **1.8** | 5 | −3.2 | 61 % |
| 12:00 | **0.2** | 2.5 | −2.3 | **10.8 %** |

Median match **506 s (8:26)**; duration p95 775 s. **All 360 matches ended `fieldCleared`** — not one
ended by storm or timeout. The 12:00 row is therefore **unmeasurable rather than unmet**: only 11 %
of matches still exist at that point.

### Validity gates — 2 of 6 bot-quality bars FAIL

| bar | measured | bar | verdict |
|---|---|---|---|
| matches resolving before 16:00 | 100 % | > 95 % | PASS |
| max single-bot kill share | 35.0 % | ≤ 40 % | PASS |
| **bots scoring ≥ 1 participant kill** | **41.5 %** | ≥ 60 % | **FAIL** |
| **storm deaths / all deaths** | **2.9 %** | 5–20 % | **FAIL** |
| afloat ticks in land contact | 0.67 % | < 1 % | PASS |
| banked levels spent before death | 99.9 % | > 90 % | PASS |

**Both failures are the same finding as target 2, not independent problems:** the field is cleared by
gunfire long before the ring does any work, so almost nobody drowns and kills concentrate in a
minority of bots. The win-share *ranking* is still actionable — a 35 pp gap cannot be manufactured by
these bars — but any claim that the *shape* of the curve reflects equipment rather than pacing must
wait until matches actually reach 12:00.

### Why TB wins and ML loses (per bot-match, n = 2400 each)

| | battleship | mineLayer | torpedoBoat |
|---|---|---|---|
| kills | 0.89 | **0.49** | **1.36** |
| damage | 460 | 434 | **555** |
| shots | 48.5 | **60.6** | **43.9** |
| **damage per shot** | 9.5 | **7.2** | **12.7** |
| life (s) | **202.6** | **243.2** | 224.5 |
| levels earned | 5.00 | 5.29 | **6.16** |
| boons fitted | 2.27 | 2.30 | **3.14** |

**The Mine Layer is not fragile — it lives the longest of the three and still wins least.** It fires
the most shots for the least damage and cannot *close*. The Torpedo Boat is the mirror: fewest shots,
most damage, most kills, and because kills pay XP it also ends with **~0.9 more boons** than either
rival, so it snowballs.

**A structural observation worth Eric's attention:** the Mine Layer's fantasy is trapping corridors as
the ring compresses — but matches end at 8:26 with the ring still large, and the 660 u endgame ring
is reached in only ~11 % of matches. *The Mine Layer's win condition mostly never happens.* The
Battleship's `starShells` is utility rather than damage, so **bot BS win share is a lower bound
against human play**, while TB's is not. Whether the same is true of ML depends on how much its
`radarBuoy` is actually contributing — measured by the buoy probe below, not assumed.

## Arm 1 — `gun.damage` 15 → 11 (−27 %), 180 matches

One dial per arm, so effects stay attributable. Same seed lattice as baseline (base 1, stride
1000003), so the arm's matches are a paired subset of the baseline's maps.

| | baseline (360) | gun.damage 11 (180) | effect | 95 % CI on the difference |
|---|---|---|---|---|
| torpedoBoat | 51.9 % | 46.4 % | −5.6 pp | −14.5 … +3.4 — **not significant** |
| battleship | 31.7 % | 38.0 % | +6.3 pp | −2.3 … +14.9 — **not significant** |
| mineLayer | 16.4 % | 15.6 % | −0.7 pp | −7.3 … +5.8 — **not significant** |
| alive @ 4:00 | 7.8 | **9.1** | +1.3 | target 10 |
| alive @ 8:00 | 1.8 | **2.3** | +0.5 | target 5 |
| alive @ 12:00 | 0.2 | 0.3 | +0.1 | target 2.5 |
| median duration | 506 s | **537 s** | **+6 %** | — |
| mean life | TB 224 / ML 243 / BS 203 | TB 250 / ML 272 / BS 233 | **+15 %** | — |

### The finding: `gun.damage` is a WEAK lever for attrition

**A 27 % cut to the game's universal weapon bought only 6 % more match length** and moved
alive @ 8:00 from 1.8 to 2.3 against a target of 5. Lives lengthened 15 %, but matches barely did —
because the gun is not what closes matches out. Torpedoes (70), mines (55) and a broadside
(3 × 20 = 60) are each several gun bursts' worth of damage in one action, and bots simply fire more
often when each shot does less.

**Consequence for the plan:** target 2 will not be reached by shaving the gun. The lever has to
scale time-to-kill against *every* damage source at once — which is what arm 4 (global hull HP)
tests, and why it was queued the moment this result landed.

**On the "ML is weak because matches end early" hypothesis:** this arm does *not* support it
(ML −0.7 pp) — but it also **did not test it**, because duration moved only 6 %. The hypothesis is
still open and needs an arm that genuinely extends matches.

## Structural finding — the mine is a DEFENSIVE weapon in an aggressive game

This is not a tuning observation; it comes straight off the mine's placement contract in
`shared/src/constants.ts`:

```
offset: deg(180)        // placed BEHIND you
placeHalfArcDeg: 60     // a rear wedge, ±60°
placeRange: 150         // within 150u astern
armDelay: 3000          // and it cannot trigger for 3s
```

**To score a mine kill you need an enemy to follow you, into your own wake, within 150 u, and stay
there for three seconds.** That is a counter-punch — it pays only when you are being *chased*.

This explains the Mine Layer's whole statistical signature without appealing to any number being
mistuned: it has the **longest life of the three hulls** (243 s) because mines genuinely deter
pursuit, and the **fewest kills** (0.49) because it has no way to *initiate*. Its 60.6 shots per
bot-match — the most of any class — are its gun, doing 7.2 damage per shot, the worst rate in the
game. The Mine Layer is fighting with one real offensive weapon while the Torpedo Boat fights with
two plus mobility.

Two compounding effects make it worse in this campaign specifically:

- **Its third slot — status CORRECTED, see below.** An earlier draft of this entry repeated the 7-5
  ledger's "0 buoy deployments" figure. **That is stale and was withdrawn** (Eric, same day: *"I
  specifically ran a go on the AI tactics and made sure there was buoy play… bots should have buoy
  tactics now"*). `server/src/game/ai/equipment.ts` now carries a full `radarBuoyTactic` — recon
  available to every doctrine, plus picket siting where the buoy's own gun can serve and cover siting
  for the jamming verb — and `tactics.ts` resolves placements **above** the target guard precisely so
  a buoy gets sited when the scope is empty. The tactics exist. Whether they FIRE is measured by the
  buoy probe below, not assumed in either direction.
- **Its win condition rarely happens.** Mines pay off when space is tight; the 660 u endgame ring is
  reached in **10.8 %** of matches. The compression the Mine Layer is built for arrives after the
  match is already over.

**Therefore ML's 16.4 % is a lower bound against human play, and part of the fix may be target 2's
fix.** Any mine *number* Eric rules on should be understood against this: raising mine damage makes
a rarely-landed weapon hit harder, whereas raising the trip ring (or the placement contract) changes
how often it lands at all. Arm 3 measures the first half of that distinction.

## Arm 2 — `torpedo.damage` 70 → 50 (−29 %), 180 matches

| class | baseline | arm | effect | 95 % CI on the difference | significant? |
|---|---|---|---|---|---|
| **torpedoBoat** | 51.9 % | **40.6 %** | **−11.4 pp** | −20.2 … −2.6 | **YES** |
| **battleship** | 31.7 % | **44.4 %** | **+12.8 pp** | +4.1 … +21.5 | **YES** |
| mineLayer | 16.4 % | 15.0 % | −1.4 pp | −7.9 … +5.1 | no |

Attrition: median duration 506 → 523 s (+3 %); alive @ 4:00 7.8 → 8.4, @ 8:00 1.8 → 2.1.

### The finding: the torpedo is a real lever on TB — and it hands the win to the BATTLESHIP, not the Mine Layer

This is the **largest measured effect of the session** and the first significant one. It also carries
the session's most important negative result:

**Nerfing the Torpedo Boat does not help the Mine Layer.** ML moved −1.4 pp (indistinguishable from
zero) while the Battleship absorbed essentially the entire 11 pp the Torpedo Boat gave up, overshooting
straight past the band to 44 %. The two problems are **independent**: TB is over because its kit is
strong, and ML is under for its own reasons (it cannot initiate — see the structural finding above).

**So the plan needs two separate corrections, not one.** A TB nerf sized to land TB at ~35 % will,
on this evidence, push BS to ~40 %+ unless BS is trimmed in the same pass — and it will leave ML
roughly where it started. Any proposal that treats "bring TB down" as the whole fix is wrong.

**Sizing, stated as arithmetic rather than as a measurement:** TB needs about −17 pp to reach the top
of the band, and −29 % torpedo damage bought −11.4 pp. Linear extrapolation is *not* justified here
(one arm, one dial, wide CI), but it does say a torpedo-only correction would have to be severe, and
severe enough to reshape the weapon's identity. A smaller torpedo cut combined with a second TB dial
is the more likely shape — **untested, and named as untested**.
