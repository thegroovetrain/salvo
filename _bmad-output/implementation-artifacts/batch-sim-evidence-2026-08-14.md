# Batch-sim evidence — Sudden Death, the final collapse (cycle 81, 0.17.81)

Instrument: `HC_DEV_OPTIONS=1 node server/scripts/batchSim.mjs --pilot <p> --matches 12 --seed 4141 --quiet`
Roster: 3 scripted captains + drone fill (20 hulls). No `--set` overrides — shipped CONFIG, `suddenDeath: true`.

**Tree caveat:** both campaigns ran on this branch immediately BEFORE it was rebased onto cycle 80
(`799b14f`, the lazy front-offer draw). Cycle 80 changes no balance tunable, no wire shape and nothing
in the zone timeline, so these zone results carry over unchanged; the deck-side picks figure below is
the only line that touches what cycle 80 moved, and it is reported as context rather than as a claim.

## The claim under test

Eric's ruling: *"…forcing the match to end… map is now 100% storm at 16:00 and someone will die."*
Epic-3 amendment 24 had ratified the opposite — a purely GEOMETRIC no-stalemate bar — and explicitly
documented the pacifist control's `unresolved` tick-cap outcome as **structural**: *"non-combatants
cannot produce a winner, by design."* That sentence is what this cycle set out to falsify.

## Result 1 — the pacifist control now RESOLVES (the headline)

| | before (amendment 24) | after (this cycle) |
|---|---|---|
| `endedBy` | `unresolved` cap-outs, structural | **`fieldCleared` = 12/12** |
| resolved n | — | 12 |
| p50 | — | **987.0 s (16:27)** |
| max | — | **1002.7 s (16:43)** |
| min | — | 527.5 s (8:47) |
| storm deaths | — | 220 across 12 matches (~92% of all hulls) |

Twelve of twelve matches conclude, by pilots that never fire a shot. The storm alone produces a winner.
`min` 527.5 s is not a collapse result: with only 3 captains, storm attrition can clear the human field
before 12:00 in an unlucky match — the same seed produces the same early match in the endgame leg below.

**The predicted ceiling holds empirically.** The spec's acceptance criterion argued from HP arithmetic
that a match cannot outlive ~17:00 (battleship max 175 hp — `maxHp` does not scale with boons — at
4 hp/s, against a passive XP tick funding at most ~0.83 hp/s of heal). Measured max is **16:43**, inside
that bound with room to spare. NFR6's *"inside ~15:00"* is now wrong in the worst case, but wrong in the
right direction: before this cycle the worst case was **unbounded**.

## Result 2 — the endgame instrument still measures the ENDGAME, not the collapse

| | value |
|---|---|
| `endedBy` | `fieldCleared` = 12/12 |
| resolved p50 | 765.8 s (12:46) |
| resolved max | 825.3 s (13:45) |
| past endgame ring | 91.7% |
| storm deaths | 56 |

This is the regression guard on the pilot re-gate. The `endgame` pilot is pacifist until the endgame ring
and hunts after (epic-3 amendment 23); its gate used to be `zonePhase === 'closed'`, which WAS the
endgame ring until sudden death separated the two by a whole ring group. Left alone it would have stayed
pacifist until 16:00 and measured the collapse instead of the endgame. Re-gated onto
`World.zoneEndgameReached`, matches conclude at **12:46 p50** — just past the 12:00 endgame ring, exactly
where Story 3.4's instrument has always put them, and four minutes before the collapse ever bites.

`resolved past endgame ring` is also a corrected metric this cycle: it measured `durationS >
zoneClosedAtMs`, which silently became "past 16:00" and would have scored this healthy campaign at 0%.
It now reads `zoneEndgameAtMs` (12:00), identical on a non-collapsing timeline.

## Result 3 — the collapse over a real socket (`zoneSmoke.mjs`)

```
collapse: group 3 opened on r=660u, next stayed zeroed, drift 0.0e+0u, closed at zoneCurR=0
all storm: B (on the collapse point, untouched for the whole match) is down to 122.8 HP
```

Three things proven end to end on a live connection: the collapse group opens ON the terminal 660u ring;
the wire's `zoneNext*` **stays the zeroed unrevealed sentinel through the entire collapse** (the client
synthesizes the ring rather than receiving it — no new schema field); and centre **drift is exactly zero**,
i.e. the collapse is genuinely concentric. The last line is the *"100% storm"* clause in its strictest
form: ship B parked on the collapse point — the safest coordinate on the map, untouched all match — still
bleeds. There is no safe cell at full closure.

## Context, not a claim

`picks per captain` p50 16 (mean 14.7) in the pacifist leg, against the 12–20 design band. Matches that
run the full timeline are 4 minutes longer than before, so the passive tick pays out more. This is a
*pacing consequence* of a longer worst case, not evidence about the collapse, and it is only visible in
matches that reach 12:00 at all — the lethal baseline is unaffected. Flagged for the ledger rather than
acted on: no XP dial was touched.
