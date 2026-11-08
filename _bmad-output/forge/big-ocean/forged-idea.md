# Forged: The Big Ocean (2026-11-07 brainstorm) — HARDENED

Source: `_bmad-output/brainstorming-session-2026-11-07.md` (PR #326). Anything there this file does not touch stands as Eric ruled it on Friday. Every number is a dial for Eric's rendered-math page and harness. Session 2026-11-07, memlog `.memlog.md` beside this file (19 entries, 12 locks, 1 kill).

## The pillar, restated (Eric)
**"A marine radar simulator that happens to have a naval battle royale attached."** The set works like a real marine radar; realism of the set decides every knob question. The game's goal is fun; realism is the idea source and RATIOS are what is kept, not kilometers.

## Locks
1. **Clear-day dark is RESOLUTION, not range.** Radar and guns reach about equally far (real: Iowa 38.7 km / Yamato 42 / Bismarck 36.5 / Warspite 30; SG set ~40 km on a battleship). A contact is an ARC: sharp in range, wide in bearing, wider than a salvo pattern at gun reach. No fire-control set (a written-down departure from realism); splashes are what sharpen the arc. Supersedes Friday's "radar 35 / guns 25–30" spread.
2. **No AIM row.** Five index rows (ARMOR, POWER, RELOAD, ENGINES, INTEL). Arm (b) is the design, not an experiment. If clear-day gunnery is too random the dial is the dispersion curve in CONFIG, never a row. Maxed-hull random-row rule rolls five.
3. **Dispersion**: ellipse growing linearly with range, ~1 % of range along the shot, ~1/3 of that across; small floor at point blank; flat damage in the pattern; same function for secondaries; pure shared function seeded from the match stream; the two percentages are CONFIG dials. Point-blank is a no-miss knife fight, accepted. Error ranking at gun reach: arc > lead over ~20 s flight > pattern.
4. **Time compression is explicit.** One factor over real time on every RATE (hull speed, shell flight, reload, sink); "knots" is a label (the July "1 u/s = 1 kn" and the 10.4 hull scale disagree by ~4.2×, and the game has run that way since). Clock stays 16 min.
5. **The board STAYS 10,000 u** (22 km at hull scale). The "big ocean" is real REACH on today's ocean. One scale factor (~0.5) maps real distances onto it; reaches, optics and torpedo runs are set by real ratio to the board, never by km. Targets: radar ~9,000 u, guns ~8,700 u, hull visible ~4,600 u, class-ID by eye ~3,000 u. Hulls stay real size. Ring ladder, center-shift cap and reveal beat stay (today's tuning already sits at the playable limit: worst chase 0.6 R ≈ 2 min × 30 u/s × 85 %). Map gen, raster, islands untouched. Friday's 40–50 km / 18,000–23,000 u numbers are superseded.
6. **Beacon placement**: a beacon is charted at the MIDPOINT between two neighboring hulls (cycle 0 = adjacent spawn pairs, two players equidistant each; later cycles pair survivors, nearest unpaired neighbor), nudged toward the ring center until inside the hypothetical next ring by at most one TIME dial (30 s of baseline sailing). Keeps min spacing and the captain keep-out disc. Replaces the fleet-anchor max-min rule, which pushed beacons AWAY from hulls. Counts 8/4/2 stand; "10k band" retired.
7. **Gain = server-made false returns.** Above a gain threshold the server adds seeded ghost returns to that observer's frame, indistinguishable from a one-sweep real return; rate rises with gain and weather; a ghost never repeats in place, a ship does (persistence is the skill, phosphor memory the tool); ghosts must sometimes land near real ships. Client draws nothing it wasn't sent. EVERY knob that shapes the paint is a server-side input via `inputs.ts` (PV bump).
8. **The set**: a modern chart-overlay display (what the client already paints: color echoes on the chart, trails, range scale = zoom, hectometer rings) with a WWII ANTENNA: one fixed wide beam (~5–6°), 15 rpm base (INTEL tunes it). Player knobs, all real marine controls: **gain, sea clutter, rain clutter, pulse length, range scale**. Beam width and sector scan are NOT player knobs (Friday's #15 re-ruled); **beam width is a CONFIG dial** for the page and harness.
9. **Splash = a one-sweep radar return** (a short-lived scatterer the size of the column; same arc fuzz, no owner; goes through `observe` with its own perception-invariant line, not a seventh exception). **Shells in flight stay sight-only.** The miss is information for both sides.
10. **Weather**: a return-STRENGTH model (falls with range, target size, rain on the path; painted iff it clears the gain threshold; ghost rate rises with gain and local clutter). Two axes, light × precipitation. **First build = RAIN (day) only**: the fog field is the rain (sight cut in bands as today + weakened real returns + raised ghosts; rain clutter knob trades the band for weak returns). Clear, night/clear, night/rain are TEST ARMS after the primary works. Night optics ≈ today's 500 u sight. Server rolls once at room creation, on the welcome beside `fogSeed`, nothing on the schema; unknown at queue (#100 ruled).
11. **Min zoom = whole board.** Markers hold screen size. Phone is not a target.
12. **Pillar statement** (above) is itself a lock.

## Killed / rejected
- **MARPA** (drawn course/speed vector): realistic on modern sets, erodes "lead in your head"; out, like fire control.
- AIM index row; beam-width and sector-scan knobs; a km-fixed beacon band; the fleet-anchor beacon rule.
- True knots + 10 km board (kills the slice); true knots + hour-long match (not a browser game); 44 km board (needs an earlier reveal AND a half-step cap and is a full-cycle storm chase).
- The 40–50 km board as such.

## Verified against code (not the brainstorm summary)
- Client paint ∝ range² over the whole swept wedge (rays ∝ range × cells ∝ range / 9 u) — the bill is ~36× at 9,000 u with a fixed cell; the range-scaled cell is still required; measure on staging first.
- The blip on the wire is ALREADY a fuzzed 9 u cell rect with no id/heading/exact position — the arc is an extension of `paintCoverage` in `signals.ts`, not a new channel.
- `fogSeed` (welcome) + `fogCut` (schema) already give the server a per-match weather seat. Zone: reveal at 2:00 of the group, close 3:00–4:00, offset = rng × cap × step. `placeBeacons` = `pickFleetAnchor` max-min from hulls.

## Build order for correct-course (bench order, amended)
1. Rendered-math page FIRST (dispersion ellipse + arc paint at 20 km on real seeds, beam-width and ghost-rate dials) for Eric's yes.
2. Dispersion as a shared pure function + seeded test; distance decay retired.
3. Hectometer ruler, twelfths ladder retired (rung-ratio zone tests retired as a ruling); reaches up by ratio (radar / guns / optics / class-ID / torpedo range tiers); RANGE row out, five rows.
4. Arc fuzz server-side (beam CONFIG dial); measure the frame on staging at 9,000 u; range-scaled cell / zoom lattices only if the frame demands.
5. Knobs through `inputs.ts` (gain, sea clutter, rain clutter, pulse length, range scale) + strength model + ghosts; invariant test: nothing below the observer's gain leaves the server, ghosts are fiction. Bots: one honest setting; bots need the persistence read and a hit-probability hold fraction (needs the dispersion fn).
6. Splash return event. Beacon midpoint placement. Rain-first weather on the fog field. Camera: free, whole board, splash pegs, screen-size markers.
7. Arms afterwards: clear; night/clear; night/rain (flash size at 20 km is the night dial, parked).

## Weak points that survived
- Clear day may be a turkey shoot (a 20 km gun on a 22 km pond at 0:00); the dial is the ghost floor at zero gain. Untested.
- Ghost rate numbers and the "ghost near a real ship" rule are unmeasured; a modified client gains nothing, but an honest player's reading load is unknown.
- Equidistant beacons favor the faster hull; the neighbor-ambush meta is accepted as "the game."
- A beacon can still end up in the storm after the real ring shifts; the nudge is not a safety promise.
- A 9,000 u set with a range-scaled cell is lumpy up close; zoom-level lattices (#30) are unbuilt and unmeasured.
- Bots see ghosts too.
- Point-blank is no-miss by construction.

Feeds: `gds-correct-course` (the whole slice, one epic). Then the rendered-math page before any build.
