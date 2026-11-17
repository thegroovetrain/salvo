---
title: 'Game Brainstorming Session'
date: '2026-11-07'
author: 'Eric'
version: '1.0'
stepsCompleted: [1, 2, 3, 4]
status: 'complete'
---

# Game Brainstorming Session

## Session Info

- **Date:** 2026-11-07
- **Facilitator:** Game Designer Agent
- **Participant:** Eric

---

## Brainstorming Approach

**Selected Mode:** Freeform — open exploration, techniques pulled in as needed

**Techniques Available:**
- MDA Framework Exploration (mechanic → dynamic → feel)
- Player Fantasy Mining (the battleship captain who shoots over the horizon)
- Core Loop Brainstorming (detect → close or hold → fire → survive the ring)
- Emergence Engineering (weather × islands × storm × sensors)
- Failure State Design (how a long-range board kills you)
- Constraint-Based Creativity (the 16-player roster, the 20 Hz sim, the browser)
- What If Scenarios, Reference Blending, Remix an Existing Rule, Spectator Experience

**Focus Areas:**
- Map scale: a 40–50 km-equivalent ocean (18,000–23,000 u) and a ring ladder that steps ~10 km a close
- Sensing: radar and sight far short of real (3.3 km radar, 1.1 km sight at the 0.4585 u/m hull scale) against guns that really reached ~40 km
- Weather as the gate: night / rain / clear as per-match conditions; fog banks as light storm bands that also degrade radar
- What still forces proximity and death on a big board: islands, the storm, beacons, airdrops
- On record, not a verdict: the 11,000 u board felt too big with perf hits in October, at 660 u radar

**Anchors (today's CONFIG, converted at U_PER_M = 0.4585):** map diameter 10,000 u ≈ 21.8 km; ring ladder 10,000 → 7,000 → 4,000 → 2,000 → 0 u; radar 1,500 u ≈ 3.3 km; sight 500 u ≈ 1.1 km; main battery 1,000–1,250 u ≈ 2.2–2.7 km; baseline top speed 30 u/s ≈ 65 m/s equivalent (≈ 4× real, time-compressed). Real: Yamato/Iowa guns ≈ 40 km; surface-search radar 30–40 km; clear-day optics 20–30 km.

---

## Ideas Captured So Far (running list, pre-organization)

**Eric's opening (verbatim gist):** Hullcracker began as a Battleship clone; the pillar is "shoot around in the dark." In Battleship reach is the whole board and information is nothing; today's Hullcracker inverted that (radar out-sees guns, both tiny against the board). Make ranges more realistic — compressed, but not to today's degree — *cheaply in performance terms*, trusting the rest of the mechanics to force proximity.

### Pillars
1. **Reach beyond sight** — guns reach past sensors; firing at water you have no contact in is the game.
2. **The miss is information** — a long shot that lands teaches you something.
3. **Weather is the fog of war** — night / rain / clear decide what sees; clear is the hard match.

### Radar system (cost + model)
4. **Range-scaled lattice** — radar cell grows with range so cell count (and client paint cost) stays constant.
5. **Polar scope** — contacts as bearing bin × range bin × strength; a 2–4° beam smears a 30 km target over 1–2 km.
6. **Range scale knob** (collapsed into #30).
7. **Splash return** — a shell's splash column is a brief scatterer / visible plume; sweep it and see your fall of shot. *(Eric: "maybe I should get information" — specifics open.)*
8. **Rain clutter** — rain bands are weak volume scatterers; real returns hide in noise.
9. **Gain knob** — pulls far returns out of the floor, floor rises (speckle / rain / sea clutter).
10. **Beam width** — wide finds, narrow fixes.
11. **Sector scan** — stop rotating, sweep 60°, fast revisit, blind elsewhere.
12. **Pulse length** — reach vs resolving two close ships.
13. **Clutter controls** — rain / sea suppression as weather counterplay.
14. **The radar operator fantasy** — tune, find a smear, lay turrets, fire, read splash, retune, correct.
15. **RULING: every mode on the set** exists (gain, beam, sector, pulse, clutter).
16. **RULING: knobs free and instant** — no dead time, no vulnerability window.

### Weather and the clock
17. **RULING: weather fixed per match** — rolled once; three match types.
18. **RULING: optics realistic** — battleship visible ~20+ km clear day, hull-down, class-identifiable ~12–15 km.
19. **RULING: night light sources both work** — star shells stay; your muzzle flash gives you away.

### Camera and view
20. Chart table (superseded by #23).  21. Two instruments (REJECTED: no scope). 22. Hull-down marks.
23. **RULING: free camera** — pan anywhere, zoom anywhere, one key snaps home; no scope, no first-person, no vision subsystem; the map is the only instrument.
24. **RULING: markers hold screen size** when zoomed out — own hull and held contacts always findable.
25. **RULING: lead lives in your head** — no fire-control solution; read the scope, predict, click the water.
26. **Splash pegs** — every salvo leaves a fading white/red mark on the chart; read your shot history.
27. **Follow a contact** — camera rides a blip.
28. **Range ring on the chart** — own gun reach and radar reach as faint rings, no numbers.
29. **Fire where you look** — click fires at any pan; beyond reach falls at max range on that bearing.
30. **Zoom IS the Garmin range scale** — paint resolution follows camera zoom; one lattice per zoom level.
31. **RULING: clock stands** (fix if it bites).  32. **RULING: spawns stand** (islands between spawns if it bites).

### Guns, dispersion, index
33. **Real dispersion** — pattern grows with range; damage flat; replaces distance damage decay.
34. **Salvo as a shotgun of pegs** — nine pegs show you your dispersion.
35. Hull-true reach (REJECTED by #40).
36. **Flight time is the dodge** — ~20 s of flight at 4× compression; lead guesses dodge, dodge guesses lead.
37. **The fog field becomes the rain** — existing fractal density field = rain bands + one radar clutter term; clear/night run it at zero. (The "cheap.")
38. **Torpedoes at scale** — real 10–20 km runs = 4,500–9,000 u; a slow long shot.
39. **RULING: real dispersion, secondaries included;** distance decay goes; beacons + ring do the pulling.
40. **RULING: one shared reach;** RANGE the only difference (later superseded by #74).
41. **RULING: torpedoes get a range that tiers up.**
42. RANGE is hectometers → **48. RULING: RANGE is hectometers** (250 = 25.0 km); radar on the same ruler (#44).
43. RANGE 100 = 20 km (not chosen).  45. INTEL is horizon (not chosen).  46. INTEL is signal strength (**back pocket**).
47 → **49. RULING: INTEL stays sweep speed.**
50–56. **The pulls:** ring, beacons, airdrops, dispersion, islands, rain bands, hunting the flash.
57. **Island heights at real scale** → **60. RULING: island heights are real;** flattening is rendering only; shadows/radar/sight use true heights.
58. The horizon as a torpedo wall (chokepoints belong to the slow weapon).  59. Smoke at scale (a km-long wall).
61. **RULING: the ring does not change.**
62. **Bots run one honest radar setting** → **69. RULING** (knobs open to bots later / RL).
63. Bots don't snipe — hold fraction becomes hit-probability fraction.  64. Bots turn toward the flash bearing.
65. **Delayed thunder** — flash now, boom later at compressed speed of sound.  66. Distant battle as a compass.
67. **Everything on one ruler** — every consumable / carry range re-read in hectometers, not multiplied blindly.
68. **RULING: the twelfths ladder can go** — a simplification for a tiny board.
70. RANGE as dispersion ruler (not chosen).  71. RANGE weighted out late (not chosen).  72. RANGEFINDING rename (not chosen).  73. Torpedo reach rides RANGE (moot).
74. **RULING: RANGE is dropped.** Reach is a weapon fact in hectometers.
75. AIM row / 76. five rows / 77. **STRUCK** (no gun tiers — amendment 12 R3; code matches) / 78. clock-tightened dispersion (not chosen).
79. **RULING: two arms to try** — (a) AIM index, 100 for all, 200 = half pattern; (b) no sixth row, skill is the only accuracy. Playtest both. Arm (b) makes the maxed-hull random-row rule roll five.

### The picture of a contact
80. **Three states of a contact** — smear / sighted silhouette / full hull.
81. **Phosphor memory at scale** — three smears make a line; the line is the course.
82. **No heading on a smear** — only sight gives a hull with a direction.
83. **Shell in flight is a mark** on the chart.
84. **RULING: shells stay visible in flight** (it's a projectile).
85. **Emergent: night shells arrive unseen; flashes are the warning.**
86. **Flash bearing, no range** — count seconds flash-to-splash for range.
87. **Star shell as the long-range eye** — two-step gunnery verb.

### Objectives, map, spectating, teaching
88. Beacons paint on radar (a strong steady return, a lure).  89. Beacon radius in hectometers.  90. Airdrops fall where the fight isn't.
91. Islands keep their size, the sea grows (5× cells, pay once).  92. Coarser raster for shadow/radar, fine for render.  93. Fewer bigger islands (not chosen).
94. **RULING: beacons stay proximity objectives.** Placement (verbatim): *"while the ring size at each closing is known but not its center/location until its revealed, we just pretend that the 'next ring' center is the current ring's center and put them within that 'hypothetical next ring's outer 10k band. This way players aren't forced to go from the edge to the middle right off the bat."* Forge question: "10k band" in diameter steps (5 km of radius) or radius.
95. **RULING: islands look right at today's scale** — same islands on more sea; look again on a rendered map.
96. Beacons as the next ring's rumor.  97. The beacon walk is the Battleship turn (predictable inbound tracks = the first-salvo window).
98. **The admiral's chart** — spectators get the free camera over the followed ship's perception.
99. **The five things to learn** — read the smear, lead in your head, watch your splashes, tune the set, weather decides what sees.
100. **RULING (provisional): weather unknown at queue time,** rolled when the map generates.

### Open rulings (not yet Eric's)
- The dispersion curve (width at max reach, at point blank).
- Gain's noise: can a false blip look exactly like a ship?
- What radar paints of a splash (#7 specifics).
- Minimum zoom: whole board at once, or capped.
- INTEL-as-signal-strength (back pocket).
- Beacon band reading (#94).
- Gain as a server-side input: the exact wire shape of the five knobs (bench).
- The flash's rendered size at 20 km (the night-target dial, bench).
- Owner of the weather roll (Murat #10).

## Perspectives from the Bench (Party Mode, accepted by Eric)

Room: Samus Shepard (game designer), Cloud Dragonborn (game architect), Link Freeman (game dev), Murat (test architect), Indie (solo dev), Dr. Quinn (problem solver), Grumbal (from the bar).

- **Gain is a server-side perception input** (Cloud). If the server sent every return and the client hid the weak ones, a modified client would see everything. The radar knobs enter through `inputs.ts` (clamped), observe applies them; **noise / speckle is client-side** (carries no information), **the threshold on real returns is server-side**; gain is the one number that crosses. Five knobs = five intents on the wire + a PV bump. The six-exception perception invariant does not move.
- **AIM is a mandatory-pick trap** (Grumbal). RANGE was dropped because it stops mattering; AIM never stops mattering, so everyone takes it. **Order of operations:** try arm (b) first (nothing built); build AIM only when a playtest says why. Samus: "he's not wrong and I hate it."
- **Two experiments, one number each, measured** (Indie + Murat + Cloud). (1) `baseRadius` up + reaches in hectometers, existing cartesian paint at a bigger cell → measure the frame on staging (never a Vite dev build, never Eric's MacBook). (2) Polar scope ONLY if (1)'s frame says so. **Dispersion cannot wait** — arm (b) is meaningless without it; it is a pure function in `shared`, both sides.
- **The night target's dial is the SIZE of the flash at 20 km** (Samus), not a system. Dread-with-agency if the flash reads with a bearing; boredom if it's a pixel.
- **The 50 km horizon will not be the dark** on a 40 km board (Quinn). Weather, islands, the gain floor, dispersion and the ring carry the whole load. Write it on the wall for the forge.
- **Smoke is already multi-spectral** (Eric; Quinn withdrew). A kilometer-long smoke wall is a wall on the scope too — possibly the strongest ability on the big board, at no new cost.
- **Two tests before the first commit** (Link): a seeded dispersion test; a perception-invariant test that a return below the observer's gain never leaves the server. The zone tests pinning rung ratios against radar/12 die on purpose when the ladder retires — record it as a ruling, not a failing build.
- **Boss-fight list** (Link): the ladder tests; the maxed-hull random-row rule (six rows → five under arm (b), touches 10.7's records); bot hold fraction redefined as a hit-probability fraction, which needs a dispersion model bots can read.
- **Murat's homeless find #10:** who owns the weather roll (server, at map gen; the fog field's per-match wind seed is the seat on the wire).
- **Eric, in the room:** night-target feel "idk"; AIM "idk — find the most fun iteration, willing to try things"; **ready for the forge.**

---
### Facts checked in code during the session
- Server radar cost: per (observer, target) pair in this tick's sweep wedge, one ray marched through a height pyramid (open water ≈ 6 tile tests; land per cell). Grows ~linearly with ray length. Not the bottleneck.
- Client radar cost: the scope paints everything swept via rays through a 9 u world lattice, ray spacing ≈ one cell at the rim → cost ∝ range². 1,500 → 16,000 u ≈ 100× paint work at a fixed cell. THIS is the bill; #4/#30 fix it.
- Height raster covers the disc → 2.2× diameter ≈ 5× cells at today's resolution.
- Radar range is already pinned to the sea horizon in the shadow math; with 35 m masts both ends the geometric horizon is ~50 km, past the board — the horizon will NOT be the dark on a clear day.
- No main-gun tier path is dealt (amendment 12 R3); the `deckGun` ladder in `catalog.ts` is a reference row for drones only.
- Today's fog field is sight-only and never touches radar (amendment 162–176).

---


## Session Summary

### Most Promising Concepts

**Top Pick: The Battleship inversion on a real-distance board.** Reach past sight, weather as the fog of war, the miss as information. The pillar restated; every other idea serves it. Cheapest in Eric's sense (performance) because realism *removes* mechanics: distance damage decay goes, the twelfths ladder goes, RANGE goes, no scope is ever built.

**Runner-up: The operated radar — polar, range-scaled, every knob free.** Turns the client's range² paint cost into a constant and hands the skill ceiling to the operator. Bench correction carried: gain is a server-side perception input; noise is client-side.

**Honorable Mention: The free camera, the map as the only instrument.** Splash pegs, screen-sized markers, zoom as the Garmin range scale. Purely client, zero anti-cheat exposure; where the long-range game becomes readable.

### Key Insights

- Realism is the cheap path here: the real set and the real gun each delete a system rather than add one.
- Skill lives in reading, never in a stat that reads for you: no fire-control solution, lead in your head.
- Clear day is the hard match. The 50 km geometric horizon will not hide anyone on a 40 km board; weather, islands, the gain floor, dispersion, the ring and beacons carry the load.
- Order of operations (bench): dispersion as a shared pure function → hectometers + ladder retired (rung tests retired as a ruling) → board up → MEASURE on staging → polar scope only if the frame demands it → gain's server seam → AIM only after arm (b) has been played.

### Rulings tally

28 rulings on the spot (#15–19, 23–25, 31–32, 39–41, 48–49, 60–61, 68–69, 74, 79, 84, 94–95, 100), 1 struck idea (#77), 6 open rulings handed to the forge (listed above under *Open rulings*).

### Recommended Next Steps

1. `/bmad-forge-idea` on this session as ONE slice: the big ocean, the operated radar, dispersion, the camera. The forge attacks the pulls list (#50–59), the AIM trap, the cost claims, and the open rulings.
2. `/gds-correct-course` after the forge to place it in the roadmap (Epic 10 still has 10.9–10.14 open and 10.8's PR #325 open).
3. The rendered-math rule applies before any build: a live page bundling the dispersion function and a polar paint at 40 km on real map seeds, for Eric's yes.

---

## Session Complete

**Date:** 2026-11-07
**Duration:** Brainstorming session
**Participant:** Eric

### Output

This brainstorming session generated:

- 100 raw ideas (28 of them Eric's rulings)
- 3 developed concepts
- 4 emerging themes

### Document Status

Status: Complete
Steps Completed: [1, 2, 3, 4]
