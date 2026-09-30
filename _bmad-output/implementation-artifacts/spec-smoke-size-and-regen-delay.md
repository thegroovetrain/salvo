---
title: 'Smoke puffs sized to intel range; out-of-combat regen delay 15 s'
type: 'feature'
created: '2026-09-30'
status: 'in-progress'
baseline_revision: '0bccb8a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** Eric (2026-09-30): *"Smokes are too small. I expected that they would actually cover the ship that deploys them."* A SMOKE SCREEN puff is r40 → r60 u (Story 8.18, amendment 139); a battleship is 124 u long. Separately, Eric asked how long a hull must be out of combat before regen starts (30 s) and ruled it *"far too long given the current deadliness of the game."*

**Approach:** Two CONFIG rulings, one cycle (Eric: same PR). (1) A puff starts at **1/8 of intel range** and grows to **2/8 of intel range** (Eric's first numbers were 0.5/8 → 1/8; he then ruled *"make the Radii 1/8 intel range growing to 2/8 intel range. Bigger."*). Intel range is `CONFIG.vision.radar` (660 u, a global constant no card raises), so r0 = 82.5 u and r1 = 165 u, authored in `CONFIG.smokeScreen` as fractions of that constant; the growth curve, cadence, life and every gate stay as built. (2) `CONFIG.regen.outOfCombatMs` 30000 → **15000**; the 1 %/s-of-missing rate stays. The client evaluates the shared puff curve from its bundled CONFIG (render + wake-stamp mirror), so `PROTOCOL_VERSION` bumps 62 → 63 (the PV 47 / PV 54 precedent). Version 0.18.21, cycle 156.

## Boundaries & Constraints

**Always:** the radius rides no wire — both sides derive it from `puffRadius(bornAt, now)` in `shared/src/sim/smoke.ts`; the perception fuzz's independent `puffRadiusOracle` literals move to the new curve (82.5 + 82.5·f) so the oracle stays independent of production; every perception invariant stays green with the exception count at SIX; test GEOMETRY may be re-laid so the pins still test what they claim (e.g. the perf pin's far puffs move out so they still miss the ring; fuzz seeds keep every non-vacuity counter struck); comments and test titles that state 40/60 or 30 s are made truthful (no stale numbers left in touched files); How-to-Play's regen sentence becomes true copy ("fifteen seconds") per the amendment-50 precedent — no other in-game copy changes; American spelling.

**Block If:** the perception fuzz or the 200-puff perf pin cannot be made to pass without changing a GATE's semantics or a pinned budget (a design question for Eric, not a test fix); any wire shape beyond the PV literal would change.

**Never:** change `expandMs`, `lifeMs`, `layMs`, `puffIntervalMs`, `inSmokeSightFraction` or the regen rate; make the radius a per-ship post-fold stat (nothing raises radar range; a per-owner radius would need a wire field); re-open the smoke delivery/occlusion rules of amendments 142–149; edit `CLAUDE.md`; rewrite amendments 46 or 139 (append superseding entries); edit `epics.md` / `game-architecture.md` / UX docs (Story 9.11 reconciles — the GDD and catalog-v3 get dated stamps only); launch a batch sim.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh puff | `puffRadius(t0, t0)` | 82.5 u (= 660 × 1/8) | No error expected |
| Half grown | `now = t0 + 15 s` | 123.75 u | No error expected |
| Full / past life | `now ≥ t0 + 30 s` | 165 u (= 660 × 2/8), clamped | No error expected |
| Clock behind stamp | `now < t0` | 82.5 u | No error expected |
| In-smoke boundary | fresh puff at origin; hull centres at 82.5 u and 83 u | 82.5 u hull is `inSmoke`; 83 u hull is not | No error expected |
| Regen start | hull last damaged at `t`, undamaged since | first regen tick at `t + 15000` (whole-tick multiple of 50 ms), none before | No error expected |
| Card row | SMOKE SCREEN refit card | `RADIUS 82.5 → 165 U` via the existing `num()` one-decimal formatter | No error expected |

</intent-contract>

## Code Map

- `shared/src/constants.ts:1815-1816` -- `CONFIG.smokeScreen.r0/r1` (author as fractions of the radar constant; see how `vision.radar` is defined near the top of the file); `:2087` `regen.outOfCombatMs`
- `shared/src/index.ts:749` -- `PROTOCOL_VERSION` 62 → 63 + the history comment (lines 5–18)
- `shared/src/sim/smoke.ts` -- `puffRadius` (reads CONFIG; no logic change); `shared/src/sim/catalog.ts:484` comment
- `shared/src/__tests__/smoke.test.ts:11-47`, `barrel.test.ts:375,:466`, `hullRepair.test.ts:77-78`, `radarRaster.test.ts:186-187` -- pins to re-pin
- `server/src/__tests__/smokeScreen.test.ts` (:7,:82,:126-127,:285-291,:480,:492,:572-580 and every layout that assumed a fresh puff ≤ 60 u — 60/100/150 u neighbours now sit INSIDE a fresh 82.5 u puff, re-lay them), `perception.test.ts` (:153,:165-168 oracle,:3945-3967 fuzz seeds — ODD-world `pq` at 40–80 u and the EVEN straddle puff at the midpoint of 120–300 u are now inside/overlapping; re-lay distances so the seeds still exercise SMOKE_OCCLUDED, SMOKED_BLIP and IN_SMOKE_SEES, :4068-4097), `smokePerf.test.ts:33-35` (far puffs at ≥ 320 u with r ≤ 165 DO reach a 220 u ring — move them to ≥ 400 u so 400 − 165 = 235 > 220; the budget stays), `regen.test.ts` (:4,:68,:81,:84 comments/titles), `denials.test.ts:273-275`, `colyseus018.test.ts:177`, `frames.test.ts:245-247` -- pins, oracle, fuzz, comments
- `server/src/game/equipment/consumables/smokeScreen.ts:5-6` -- comment
- `client/src/ui/boonCopy.ts:1098` -- doc comment; `client/src/__tests__/cardStatRows.test.ts:485-487` -- expect the `num()`-formatted row; `client/src/render/wake.ts:601-607` -- bucket comment (rate = 82.5/30 = 2.75 u/s, ≤ 1.375 u stale per 500 ms bucket — still under a 9 u radar cell, constant stays); `client/src/render/equipmentIcons.ts:269` comment; `client/src/__tests__/smokeScreen.test.ts:163,:192-196,:255` (re-lay the 60 u / 50 u geometry: a fresh puff is now 82.5 u); `client/src/__tests__/ordnanceMasksAreServerOnly.test.ts:94-100` PV pin
- `client/src/how-to-play/copy.ts:93` -- "thirty seconds" → "fifteen seconds"; `client/src/__tests__/howToPlay.test.ts:73`
- Docs wave: `VERSION`, `package.json`, `package-lock.json` (0.18.21), `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml, epic-8-context.md (items 46/47/139 + Ratified section), epic-8-context-amendments.md (append 174–175), deferred-work.md (:2229 note)}`, GDD `gdd.md:178`, `catalog-v3.md:176,:178,:253` dated stamps

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/constants.ts` -- set `smokeScreen.r0`/`r1` to 1/8 and 2/8 of the radar constant with comments citing Eric 2026-09-30; set `regen.outOfCombatMs` 15000 -- the two rulings
- [ ] `shared/src/index.ts` -- PV 62 → 63 with a history line -- the client reads the smoke numbers
- [ ] `shared/src/__tests__/*` -- re-pin r0/r1, the curve values, PV, regen 15000; fix stale titles -- pins tell the truth
- [ ] `server/src/__tests__/*` -- re-pin CONFIG, boundary test at 82.5/83, oracle curve literals, PV describes; re-lay smoke/fuzz/perf geometry that assumed ≤ 60 u puffs; refresh stale comments; run the fuzz and perf pin -- oracle independence, invariants green
- [ ] `client/src/**` -- card-row test via `num()`, PV pin, How-to-Play copy + test, re-laid smoke render test geometry, comments -- client mirrors and copy truthful
- [ ] Docs wave (files in Code Map) -- version, changelog, both trackers, amendments 174–175 in both homes, GDD/catalog stamps, deferred-work note -- the landing record

**Acceptance Criteria:**
- Given the shared CONFIG, when `CONFIG.smokeScreen.r0`/`r1` are read, then they equal `CONFIG.vision.radar × 1/8` and `× 2/8` exactly (82.5 / 165), and `inSmokeSightFraction`, `expandMs`, `lifeMs`, `layMs`, `puffIntervalMs` are unchanged
- Given a fresh puff, when a hull's centre is 82.5 u from it, then the hull is in smoke; at 83 u it is not (server pin)
- Given the perception fuzz with its oracle on the new curve, when it runs, then every invariant holds with the non-vacuity counters (occlusion, smoked blip, in-smoke sees) all struck and the exception count SIX
- Given the 200-puff perf pin, when it runs, then it passes under the same budget with far puffs laid where a 165 u puff still misses the ring, and the comment states the margin
- Given a hull last damaged at `t`, when 15 s pass with no landed damage, then regen begins on the first tick at or after `t + 15000`; storm bites still reset the clock
- Given a stale 0.18.20 client, when it joins, then the PV gate refuses it (63 ≠ 62)
- Given How-to-Play, when the regen sentence renders, then it says fifteen seconds; no other copy changes
- Given `npm run check`, when run, then lint (complexity ≤ 10), all three type-checks, all tests and the hook test pass

## Spec Change Log

## Review Triage Log

## Design Notes

Why constants, not a post-fold stat: radar range is `CONFIG.vision.radar` for every hull (`stats.ts:606`); no catalog line targets it since the RANGE card was deleted. A puff belongs to the water, not an observer, and its radius rides no wire (the client derives it from `t0`), so the only way to express "fraction of intel range" is as a fraction of that constant. If a card ever raises radar range again, a per-owner radius would need a wire field — a design question, not this cycle's.

Coincidence to note in comments: r0 (82.5) now equals the in-smoke sight (radar × 1/8). They are separate dials that happen to match; test comments that say "82.5" for the sight bubble stay. Consequence worth a comment in the smoke-channel gate: a non-owner receives a puff within `sight + puffRadius`, now up to sight + 165 u.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green, including `smoke.test.ts`, `hullRepair.test.ts`, `barrel.test.ts`
- `npm test -w server` -- expected: green, including `perception.test.ts` fuzz, `smokePerf.test.ts`, `smokeScreen.test.ts`, `regen.test.ts`
- `npm test -w client` -- expected: green, including `cardStatRows`, `howToPlay`, `smokeScreen`, PV pin
- `npm run check` -- expected: lint + tsc ×3 + all tests + hook test pass
