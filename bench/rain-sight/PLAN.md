# Rain-sight test page — plan (Story 11.6 pre-spec, throwaway)

Eric 2026-11-14: rain bands should cut sight REALISTICALLY (partial, gradual), not the
League-brush on/off of today. He wants to "see the parts of the ship I can see, however
occluded/faded", and "it's gotta look good in motion". He is not overly worried about hacked
clients: a ship with ANY visible part is sent whole; the client fades it. This page lets him
watch candidate looks move and pick one. NOTHING in game code changes.

## §1 Scope / ownership
- Everything lives in `bench/rain-sight/` (this dir). Do NOT edit shared/, server/, client/.
  Import real modules from them read-only.
- Output: ONE self-contained `bench/rain-sight/rain-sight.html` (esbuild IIFE inlined, no
  network except nothing; must stay < 10 MB). Build script `bench/rain-sight/build.mjs`.

## §2 Real ingredients (import, never copy)
- Rain field: `shared/src/sim/fog.ts` (`makeFogField`, `fogDensityAt`, `fogCutForTarget`,
  `fogLattice`) with `CONFIG.fog` from `shared/src/constants.ts` as the starting dials.
- Rain drawing: reuse the client's real fog render if it can be driven standalone
  (`client/src/render/fogField.ts`, `fogPuffTile.ts`, `fog.ts`); otherwise draw density
  yourself as a soft gray-white overlay and say so in the report.
- Ships: the real hull art, `client/src/render/hullArt/pixiArt.ts` (`deckContext`,
  `outlineContext`, `turretContext`, `launcherContext`) + palette, as `client/src/render/ships.ts`
  composes them. Real ship classes, real sizes, real speeds from CONFIG.
- Pixi 8 from node_modules. esbuild recipe that worked before:
  `--alias:pixi.js=<worktree>/node_modules/pixi.js --alias:@salvo/shared=<worktree>/shared/src/index.ts
  --define:__APP_VERSION__='"x"' --define:__HC_PERF__=false`.

## §3 The visibility model (orchestrator ruling — page-only math)
- Observer = own ship at screen center (drawn normally). NO brush rule: the observer's own band
  is NOT free; every unit of rain on the line counts.
- Optical depth τ(P) = ∫ density ds along observer → P (midpoint march, `marchStepU`), times a
  slider "rain thickness" k (per u at density 1). Visibility V(P) = exp(−k·τ) (Math.exp is fine
  on the page; the game version will need a transcendental-free form — note only).
- PER-PART: V is evaluated on a small grid over each hull (e.g. ~6 along × 2 across, slider for
  resolution) and interpolated across the hull, so a ship half inside a band fades at that end.
  This is the core of what Eric asked ("the parts I can see").
- Vanish cutoff slider: where V < cutoff the part draws nothing at all.
- Clear water (density 0) ⇒ V = 1 ⇒ ship drawn exactly as in the game today.

## §4 The looks (side by side, same synced scene, 4 panels; a "solo" button enlarges one)
- A. Fine-grain dissolve — a fixed noise pattern LOCKED TO THE HULL (moves/turns with the ship,
  never re-rolled per frame); a hull pixel survives where noise < local V. Soft threshold edge.
- B. Coarse blotchy dissolve — same, larger grain (grain size slider shared by A/B).
- C. Plain fade — alpha = local V.
- D. Fade + blur — alpha = local V, blur grows as V drops.
- Toggle: rain overlay ON TOP of ships (default on) — the overlay sells "weather" not "damage".
- Implementation is yours (Pixi custom Filter/GLSL is the natural path: hull rendered to a
  render texture in hull-local space so the noise is hull-locked; per-part V passed as a small
  uniform array or texture). Must not shimmer frame to frame.

## §5 Scene + dials
- Several (4–6) real enemy hulls of different classes sailing smooth curving courses that
  cross bands, entering and leaving rain, near and far (within ~ today's sight reach).
- Sliders: rain thickness k; rain coverage (target share → `fogCutForTarget`); time speed
  (1× real … 60×) so slow band drift is watchable; grain size; per-part grid resolution;
  vanish cutoff; zoom. Buttons: reseed, pause, solo/compare. Live readout per ship of its
  min/max V (small dev text is fine on this page — it is a bench, not the HUD; ≥ 13 px).
- Dark page, game-like water color; no copy beyond labels.

## §6 Verification
- `node bench/rain-sight/build.mjs` builds clean; the HTML opens with no console errors.
- Headless look: macOS Chrome `--headless=new --mute-audio --use-angle=swiftshader
  --screenshot` (or equivalent) — MUTED, kill what you start. Capture two screenshots a few
  seconds apart to prove motion and that a ship partly in rain shows partial fade.
- No commits. Report: files, how each look is built, screenshots' paths, anything that fell back.

## §7 Storm motion (Eric 2026-11-14 — the eye of the storm)
Eric's model: the battle is in the EYE of a hurricane closing around you. Rulings (his):
- The field is anchored to the LIVE ring (center + radius from `zoneStateAt` on a real
  `rollZoneRings` timeline with real `CONFIG.zone` / `mapRadius`): the eye's center IS the live
  ring's center and moves with it, linearly, during each closing beat.
- Spin about that moving center; angular motion rises from calm at the center to FASTEST at the
  ring edge. Outside the ring speed is unimportant to Eric — pick what is cheap and looks right
  (default: hold the edge speed). Direction: per-match COIN FLIP. NO wind drift.
- Density: a TRUE EYE (zero rain in a central disc, soft edge) → thicker toward the ring →
  densest at the ring edge; OUTSIDE the ring: "heavy rain with gaps, so if a ship is out there
  you can still catch a glimpse of it". Rain extends out through the storm water to the map edge.
- This REPLACES the coverage-target machinery (`fogCutForTarget`, coverageMin/Max,
  targetPeriodMs) entirely: density is a function of ρ = distance / live ring radius.
- Keep the slow shape morph (two layers cross-fading) and the fbm noise from shared/.
Orchestrator rulings (engineering):
- Write the new field as a PURE module `bench/rain-sight/src/stormField.ts` in the shared/ posture
  (deterministic, plain objects, time as an argument; no Math.sin/cos/exp/pow/random — use
  `fogSinCos` from shared/src/sim/fog.ts) so it can move to shared/ later nearly verbatim.
  Reuse `fbm`/`makeLayer` from shared/src/sim/noise.ts.
- Bounded shear: differential rotation must not wind the pattern infinitely — measure each layer's
  accumulated twist from its last invisible morph instant (the trick fog.ts already uses), so
  spiral bands form and refresh. Sample noise relative to the MOVING eye center so clouds travel
  with the eye.
- Density from ρ via a coverage-to-cut map (precompute the fbm value distribution once), so the
  dials read as shares: eye radius (fraction of ring R), coverage just inside the ring edge,
  coverage outside the ring, plus the soft-edge width. Thin → thick ramp between eye and edge.
- Dials (all Eric's numbers, page defaults are only a start): edge speed (u/s), center speed
  fraction, eye radius fraction, coverage at edge, coverage outside, morph period, match clock
  speed (1–60×) + a match-clock scrub slider (0 → full timeline incl. collapse), reseed (new
  rings + new coin flip). The §3 sight model and A+D look stay exactly as they are.
- New "Storm" view (mode toggle beside Compare): the WHOLE map, live ring drawn as a thin line,
  the next ring's reveal optional, rain field over the ocean, clock readout. The ship-look view
  also uses the new field, observer placed inside the live ring.
