# Sprint Change Proposal — 2026-10-13 (second of the day): Story 9.8 The Twelfths Ladder — sensor ranges, dropout attenuation, weapon-range dials, ring-fit camera

**Workflow:** `gds-correct-course` · **Mode:** Batch · **Author:** Claude (Developer) · **Decider:** Eric
**Trigger:** the forge session `_bmad-output/forge/realistic-vision-range/` (HARDENED 2026-10-13; `forged-idea.md` is the hand-off). Eric, verbatim: *"I really want the feel of hunting around in the dark … I want a lot more radar vision than I do actual vision … a lot of my battles end up being just within or without vision range, circling each other at what would be very close range in naval terms. And I can fire at someone's radar shadow at any point that I can see them with my radar. I feel like it would help with survivability a bit to encourage a further encounter distance, so there is more time to dodge/navigate."*

**Rulings taken in this run (AskUserQuestion, 2026-10-13, all recommended options):**
1. One story, slotted after 9.7 Armor as **9.8**; the cleanup tail renumbers 9.9–9.12. Batch mode.
2. The foghorn becomes **twelve bands** of 125 u.
3. The zoom-in limit is **today's close framing**; the default framing is a dial at the spec step.
4. Weapon-range dials **default to today's values** on the day they are decoupled; Eric sets the real numbers at spec.
5. **Small fixed distances stay absolute** (smoke puff 165, captive ring 120, mine leash 150; lit radius keeps `sight / 2`).

---

## 1. Issue Summary

Every sensor boundary is an eighth of a 660 u radar range, sight is half of it, and every gun's base range is *derived from* the radar rung. Two things follow by construction: the first radar paint and the first shot are the same distance, and the scope and the viewport are the same circle (the camera fits the radar diameter to the screen). Eric's playtest reading is that fights collapse to the edge of the 330 u sight bubble, naval point-blank, with no approach phase, and that the 10 % land board gives radar shadow less to do than it could.

The forge established, against the code and the record, that realism cannot set the numbers (with the same mast on every ship a real surface radar reaches ~37 km, eyes ~30 km, a 5-inch gun 16–24 km, all past every edge of the 8,000 u ocean), that far returns are *more* useful than near ones as position fixes (blip staleness is a fixed 180 u per 4 s sweep at any range) but are strategy rather than targeting, and that whole-map radar would turn the hunt into a minimap. Eric set the ladder in round numbers:

| rung | today (eighths of 660) | locked (twelfths of 1,500) |
|---|---|---|
| one rung | 82.5 u | 125 u |
| sight; mine / torpedo detection | 330 (4/8) | **500 (4/12)** |
| muzzle flash; wounded smoke; haze halo | 412.5 (5/8) | **750 (6/12)** |
| far-radar fit anchor (red → blue) | 577.5 (7/8) | 1,000 (8/12) `[DRAFT]` |
| attenuation band | none | **1,000–1,500 (8/12–12/12)** |
| radar | 660 (8/8) | **1,500 (12/12)** |

Attenuation is **dropout, not dimming**: from 8/12 outward a sweep increasingly fails to paint the target at all, flat to about 1,250 then a cliff to 1,500, small hulls first — the real-world detection-probability shape, which Eric chose over a dimming curve (*"The realistic way is the way."*). Brightness stays on the shipped 1/d⁴ curve; colour stays intensity.

Firing at radar ghosts stays (*"I think its fun"*). Weapon ranges stop riding the radar rung and become per-weapon dials Eric sets. The camera gains the zoom-out Eric has asked for repeatedly without it ever reaching the ledger: the current storm ring centred with a margin, and zoom-in back to own ship.

## 2. Impact Analysis

### Epic impact

Epic 9 goes from eleven stories to twelve. 9.8 is inserted after 9.7 Armor; 9.8–9.11 become 9.9–9.12. Epic 10 is untouched. The epic's goal sentence ("breaking off is a real option") is exactly what the approach phase buys.

### Story impact

- **9.8 The Twelfths Ladder (new).** Full text §4.1. Build order inside the cycle: dials decoupled → ladder → dropout → camera → foghorn.
- **9.7 Armor.** Unchanged; 9.8 lands after it.
- **9.3 Multi-Spectral Countermeasure (in review).** Its haze halo rides `muzzleFlashFactor` (amendment 59) and so moves 412.5 → 750 by derivation; its cloud delivery by `radarRange` widens to 1,500. No text change; the derivation does the work.
- **9.4 Fouling Shell (in review).** "Fires to radar range" becomes its own dial at 660 (amendment 105). The region's reach is untouched.
- **9.5 Ramming (done).** Untouched.
- **9.9–9.12 (renumbered).** 9.12 How-to-Play and Record gains the sensor entry and the ladder/camera stamps; its AC's "9.1–9.10" / "mechanics sections 9.1–9.6" read 9.1–9.11 / 9.1–9.8.
- **Bots.** Engagement bands are fractions of `radarRange` today (`profiles.ts`); under a 1,500 u scope with 660 u guns they must re-anchor on the bot's own gun `rangeU` `[DRAFT, offered at spec]`. Bot plot persistence (`sweepRpm`) is unaffected. The sweep-miss tactic reads sight and radar and follows.

### Artifact conflicts

| Artifact | Conflict | Resolution |
|---|---|---|
| `planning-artifacts/epics.md` Epic 9 | eleven stories; tail numbered 9.8–9.11; 9.11's AC ranges | 9.8 inserted (§4.1); tail renumbered with "was 9.N until 2026-10-13" notes; 9.12's AC ranges widened |
| `implementation-artifacts/epic-9-context.md` | story list, Technical Decisions, dependencies | regenerable file; edited in place (§4.2); amendments 102–109 appended |
| `implementation-artifacts/epic-9-context-amendments.md` | none yet | amendments 102–109 appended (§4.3) |
| `implementation-artifacts/sprint-status.yaml` | tail keys 9-8…9-11 | new `9-8-the-twelfths-ladder: backlog`; tail keys renumbered (§4.4) |
| `gds-workflow-status.yaml` | correct-course row | one-line stamp (§4.4) |
| GDD `gdd.md` E9 row (464) | no mention of sensors | dated "superseded in part" clause naming this file and 102–109; the mechanics sentences (150, 156, 194/196, 252–256, 283, 76/322/370/458 "two truesight diameters") are stamped at 9.12 |
| `EXPERIENCE.md` 168, 223, 225, 230, 235, 249; decision-log #16/#17 | eighths ladder, 0.5×–1.5× zoom, 3/8 detect (already stale) | stamped at 9.12 per the amendment-89(k) pattern; a `gds-ux` pass is NOT required (no new surface; the camera is a range change) |
| `deferred-work.md` 714 (frame cost at zoom), 1554 (vacuous ladder-ordering pin), 1559 (observer-anchored resolvers), 1694 (broadside is the shortest gun) | all touched by this story | left standing; 9.8's spec triages them (714 is closed or re-opened by the measurement; 1694 is answered by the broadside dial; 1554/1559 by the re-based pins) |
| `catalog-v3.md` | none (no card changes) | — |
| `game-architecture.md` | none (no new pattern; the chokepoint is untouched) | — |

### Technical impact

- **`shared/src/constants.ts`:** `SIGHT` 330 → 500; `vision.radar = SIGHT * 3`; `muzzleFlash = SIGHT * 1.5`, `muzzleFlashFactor` 0.5; `farRadar = SIGHT * 2` `[DRAFT]`; `detect = SIGHT`, `detectFactor` 1 unchanged; `radarMastQ` 64 unchanged; new `CONFIG.vision.dropout` block (curve dials `[DRAFT]`); new per-weapon `rangeU` literals on `gun`, `machineGun`, `flak`, `starShells`, phosphor, `foulingShell`, `broadside`; the stale "farRadar has no caller" comment corrected (it feeds the heatmap fit). Doc-comment ladder table rewritten in twelfths.
- **`shared/src/sim/stats.ts` + `boons.ts`:** `sightRange = radarRange / 3`; the post-fold `rangeU` re-derivation from `radarRange` is deleted — each weapon's `rangeU` is its own CONFIG literal through the one fold.
- **`shared/src/sim/radarShadow.ts`:** nothing; `K = radar² / 4` and `R = radar² / (8H)` re-derive.
- **`server/src/game/signals.ts` / `perception.ts`:** `hornBandFor` → twelve bands; the dropout gate inside `observe()` (a seeded per-sweep roll against the detection curve, deterministic per `(observer, subject, sweep index)` so a replay and the invariants' oracle agree); muzzle flash / wounded smoke / haze reach follow `muzzleFlashFactor`. Perception invariants: a non-paint is not an event; SIX exceptions unchanged; the oracle mirror learns the curve.
- **`client/src/render/camera.ts`:** zoom-out limit = ring fit (live `ringRadius`, short axis, margin), zoom-in limit = today's close framing, default = dial; `setRadarRange` no longer drives `baseZoom`; the radar rings, fog bake, lattice viewport bounds and `radarMarch` windows follow `radarRange`. **Cost:** the return lattice at full scope zoom holds ~5× today's cells; measured on the reference device against the 2 ms budget before the gate (deferred-work 714).
- **`client/src/config.ts`:** `HEAT_POINT_REF` fit crossover follows `farRadar`; `HEAT_WAKE_REF` reach follows `muzzleFlash`; foghorn `bandGain` 1..12; `blip.dim.outerFactor` = 750/500 = 1.5 by derivation; zoom `{min, max}` replaced by the two derived limits.
- **Wire:** nothing new leaves the server; `PROTOCOL_VERSION` bumps (the client reads the vision block and the weapon ranges).
- **Tests:** `zone.test.ts` ladder pins re-based to twelfths (derivations, not literals); `stats.test.ts` 660/412.5/radar÷2 pins re-based; `camera.test.ts`, `spectate.test.ts`, `revealFraming.test.ts` fit pins re-based; `radarFalloff` / `radarHeatmap` crossover pins follow `farRadar`; `foghorn.test.ts` eight → twelve; `shell.test.ts` `GUN_RANGE` reads `CONFIG.gun.rangeU`; every 660 literal in server tests reads the weapon's dial. No vocabulary pins.

## 3. Recommended Approach

**Direct adjustment.** One story inserted into a settled order; no rollback, no MVP change. Effort is one build cycle after 9.7, larger than a typical Epic 9 story because the ladder touches ~40 production consumers and ~35 test files (all listed in the sweep that produced this proposal), but each change is a derivation following one base. Risk sits in two places: the client lattice cost at ring-fit zoom (measured, not assumed) and the bot engagement bands (re-anchored on gun range). The sequencing hazard — guns silently inheriting 1,500 u — is removed by decoupling first.

## 4. Detailed Change Proposals

### 4.1 Story 9.8 — The Twelfths Ladder *(new; inserted after 9.7 Armor)*

```
Story: 9.8 (new)
Section: whole story (inserted); 9.8–9.11 renumber to 9.9–9.12

NEW:
```

### Story 9.8: The Twelfths Ladder *(inserted 2026-10-13 — `sprint-change-proposal-2026-10-13-twelfths-ladder.md` §4.1; lands after 9.7; forge record `_bmad-output/forge/realistic-vision-range/forged-idea.md`)*

As a captain hunting in the dark,
I want radar to reach far beyond my eyes and my guns, with far returns that come and go,
So that an encounter starts with a long approach I can act on instead of a point-blank circle, and I can zoom out to see the whole ring I am fighting in.

**Eric (2026-10-13, verbatim):** *"I really want the feel of hunting around in the dark … I want a lot more radar vision than I do actual vision … I feel like a lot of my battles end up being just within or without vision range, circling each other at what would be very close range in naval terms."* The numbers: *"radar range is now 1500. I can see 500 of it (4/12), and muzzle flash/smoke should go up to 6/12 … lets say its 8/12 - 12/12 for attenuation"*; on the curve: *"The realistic way is the way."*; on guns: *"I don't have an explicit issue with firing at radar ghosts. I think its fun."*; on the camera: *"zoom out to the point that the entire current ring is centered with bit of a margin to any edge of the viewport. And when zoom back in, it zooms back in to my ship."* Ruled the same day (epic-9 amendments 102–109): one story, after Armor; weapon dials default to today's values; twelve foghorn bands; small absolutes stay; innermost zoom = today's close framing.

**Acceptance Criteria:**

**Given** 9.7 has landed and every gun's `rangeU` is still derived from `CONFIG.vision.radar` post-fold (the broadside from `radar × muzzleFlashFactor`)
**When** the story lands, in this order inside one cycle
**Then** FIRST every weapon range is its own `CONFIG.<weapon>.rangeU` dial — deck gun, machine gun, flak, star shells, phosphor and the fouling shell at 660, broadside at 412.5, mines at 150, torpedoes unbounded — with `effectiveStats()` still the one fold and NO range read from the vision block; Eric's real numbers are offered at the spec step and written as his ruling (amendment 105)
**And** THEN the ladder is twelfths of 1,500 u: `SIGHT` 500, `radar = SIGHT × 3`, sight and detection 500 (4/12, `detectFactor` 1), muzzle flash + wounded smoke + haze halo 750 (6/12, `muzzleFlashFactor` 0.5), far-radar fit anchor 1,000 (8/12) `[DRAFT]`; `sightRange = radarRange / 3` in `stats.ts` and `boons.ts`; the shadow law's `K` and `R` re-derive by construction and `radarMastQ` stays 64; no card widens any rung (amendment 103)
**And** from 8/12 outward a sweep increasingly fails to paint a target — a probability-of-detection curve, flat to ~1,250 then a cliff to 1,500, weaker returns dropping out first through the existing reflectivity — decided inside `perception.observe()` so a missed paint never leaves the server; brightness stays on the 1/d⁴ curve, colour stays intensity with no threshold branch; curve parameters are Eric's dials at spec (amendment 104)
**And** the camera's zoom-out limit fits the LIVE storm ring to the short axis with a margin (derived like the reveal's `mapFitMargin`, re-fitting as the ring closes), the zoom-in limit is today's close framing, the default framing is a dial at spec, the radar-diameter `baseZoom` anchor is retired, and the reveal, the wheel gating and "paint recorded zoomed-in appears on zoom-out" are unchanged (amendment 106)
**And** the foghorn discloses twelve 125 u bands with the plateau floor and island step re-read at spec (amendment 107); smoke puff 165, captive ring 120 and mine leash 150 stay absolute, the lit radius keeps `sight / 2` (amendment 108)
**And** bots engage by their own gun's `rangeU`, not by radar range `[DRAFT]`; the wake, countermeasure and fouling gates that read `radarRange` / `sightRange` follow the new rungs by derivation
**And** the client radar lattice (9 u cells) at full scope zoom is costed on the reference device against the 2 ms budget and the number is recorded (deferred-work spec-4-10 entry re-opened or closed by that measurement); the stale "farRadar has no caller" comment in `constants.ts` is corrected (it feeds `HEAT_POINT_REF`)
**And** every ladder, camera and range pin in the tests is re-based citing the amendment, never pinning 1,500 as a literal; the perception invariants keep exactly SIX exceptions; `PROTOCOL_VERSION` bumps (the client reads the vision block); both trackers stamped
**And** no in-game copy is added; the How-to-Play sensor entry and the GDD / EXPERIENCE.md stamps (eighths → twelfths, "two truesight diameters", "radar = sight × 2", the zoom range) are 9.12's

```
Story: 9.11 → 9.12 How-to-Play and Record
Section: Acceptance Criteria

OLD:
**Given** Stories 9.1–9.10 landed
… the mechanics sections 9.1–9.6 changed carry dated supersession stamps …

NEW:
**Given** Stories 9.1–9.11 landed
… the mechanics sections 9.1–9.8 changed carry dated supersession stamps (incl. the eighths → twelfths ladder, "two truesight diameters", "radar = sight × 2", the 0.5×–1.5× zoom range, and EXPERIENCE.md's ladder lines) …

Rationale: 9.8 adds a sensor entry and the ladder/camera stamps to the record story.
```

### 4.2 `epic-9-context.md` (regenerable; edited to match)

- Stories list: `Story 9.8: The Twelfths Ladder` inserted after Armor; the tail renumbered 9.9–9.12.
- Technical Decisions: new **Twelfths Ladder (9.8)** paragraph (the table above, dropout, dials, camera, foghorn, absolutes).
- Cross-Story Dependencies: `9.8 lands after 9.7; the dials decouple before the ladder moves; 9.12 needs 9.1–9.11`.
- Amendments 102–109 appended under a new `## Story 9.8 inserted — correct-course 2026-10-13` section.

### 4.3 `epic-9-context-amendments.md` — new section, amendments 102–109

102. STORY 9.8 IS THE TWELFTHS LADDER; THE TAIL RENUMBERS 9.9–9.12.
103. THE SENSOR LADDER IS TWELFTHS OF 1,500 u, ONE RUNG = 125 u (sight 500, flash/smoke/haze 750, far-radar anchor 1,000 `[DRAFT]`, radar 1,500; frozen at base; supersedes the eighths denominator of epic-4 113/119/123).
104. ATTENUATION IS DROPOUT, NOT DIMMING — a detection-probability curve 8/12–12/12, small hulls first; colour stays intensity; decided inside `observe()`.
105. BLIP-FIRE STAYS; EVERY WEAPON RANGE IS A PER-WEAPON DIAL, decoupled before the ladder moves; defaults = today's values (supersedes the 2026-07-21 "gun rides radar" derivation and epic-8 103's "derived like gun.rangeU").
106. THE CAMERA ZOOMS OUT TO THE CURRENT STORM RING AND BACK IN TO OWN SHIP; the radar-diameter fit is retired (supersedes epic-2 amendment 8's range).
107. THE FOGHORN DISCLOSES TWELVE BANDS OF 125 u.
108. SMALL FIXED DISTANCES STAY ABSOLUTE; the terminal ring is inside radar by accepted consequence; GDD/EXPERIENCE stamps at 9.12.
109. WHOLE-MAP RADAR AND "REALISTIC" RANGES ARE REJECTED; NIGHT IS PRESENTATION ONLY.

(Full text in the amendments file.)

### 4.4 Trackers and GDD

- `sprint-status.yaml`: `9-8-the-twelfths-ladder: backlog  # 2026-10-13 radar 1500 = 12/12, sight 500, flash/smoke 750, dropout 1000-1500, weapon-range dials (today's values until Eric sets them), ring-fit zoom-out / own-ship zoom-in, 12 foghorn bands (amendments 102-109); after 9-7`; tail keys `9-9-test-purposefulness-audit`, `9-10-smoke-flakes-fixed`, `9-11-harness-and-ledger-hygiene`, `9-12-how-to-play-and-record` each noting `was 9-N until 2026-10-13`; the `epic-9` line notes the re-cut.
- `gds-workflow-status.yaml`: one-line stamp on the `correct-course` row; `last_updated` 2026-10-13.
- GDD E9 row: a dated "superseded in part 2026-10-13 (second)" clause naming this file and amendments 102–109; mechanics sentences at 9.12.

## 5. Implementation Handoff

**Scope: Moderate** — one story inserted and the tail renumbered; the build itself is wide (one base, ~40 consumers, ~35 test files) but mechanical. Routed to `gds-create-story` for 9.7 Armor next (unchanged), then 9.8; every `[DRAFT]` above (far-radar anchor, dropout curve, default framing, bot bands, foghorn floor/step, the weapon dials themselves) is Eric's at 9.8's spec step and never filled in by the author. Dev-story only when Eric says. Success: 9.8 lands after 9.7 with `npm run check` green, no gun's range read from the vision block, a hull at 1,400 u painted on some sweeps and not others while a hull at 900 u is painted on every clear sweep, the ring fitting the viewport at full zoom-out and closing with the storm, the lattice cost recorded on the reference device, the perception exception count still SIX, both trackers stamped, and Eric's staging play confirming the approach phase exists.

**Memory of the session (for the next agent):** the ladder is twelfths of 1,500 and frozen at base; dropout is intermittency, never dimming; blip-fire is fun and stays; the dials are Eric's and sit wherever he puts them; the ring-fit zoom is a standing request finally on the record; whole-map radar, horizon-derived radar and the mast-height card are dead; night is presentation only; never pin 1,500 as a literal.
