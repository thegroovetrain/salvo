---
title: 'Story 4.10 — The Physical Return Model'
type: 'feature'
created: '2026-08-07'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The `return` heatmap's intensity is a hand-tuned lookup, not a model: ships and coastline
share ONE `1/(1+d)` attenuation curve that is explicitly not physical, coastline strength reads only
depth-into-landmass so a mudflat and a headland paint identically, and surf, sea clutter and the storm
wall do not exist at all. Colour therefore "looks strong" because a knob says so, and any object nobody
wrote a rule for has no defined return.

**Approach:** Replace the single curve with ONE model — a per-material reflectivity coefficient × a
falloff whose exponent is chosen by the target's GEOMETRY (point/ship 1/d⁴, surface/coast/surf/clutter
1/d³, volume/storm 1/d²) — living in one new pure module every return source calls. Fit the point curve
so a mid-size hull's red→blue crossover EMERGES at `CONFIG.vision.farRadar`, fold terrain height into
coast reflectivity, and add surf, clutter and the storm wall as three new paint sources under the
existing sweep/decay/freeze rules.

## Boundaries & Constraints

**Always:**
- **CLIENT-ONLY.** No wire field, no server file, `PROTOCOL_VERSION` stays **30**. The `silhouette`
  grammar is untouched (it has no heatmap).
- **A paint is a historical record (amendment 83).** Every new source freezes what it needs — observer
  position, distance, bearing, ring geometry, per-cell intensity — at CREATION. Nothing may be
  re-evaluated against live state; the only per-frame change is alpha via phosphor decay.
- **Nothing viewport-derived touches paint creation or retirement (amendment 97).** Creation is gated
  only by sweep + radar range + LOS; retirement only by time.
- **Colour is intensity, never category (amendment 105).** Object type reaches colour ONLY through
  physical properties fed into the one intensity scale.
- **`CONFIG.vision.farRadar` is a CALIBRATION INPUT, never a branch (amendment 132).** It may be read
  once where client tunables are defined, to fit a coefficient. `if (d > farRadar)` — or any comparison
  against it — anywhere on a paint path is a failed AC.
- **Amendment 78 survives:** a large island still reads as a big red mass with softer edges, red out to
  the rim.
- **Clutter can never outrank a real return** (amendment 130) — its peak must stay strictly below
  `bands[0].at` even at the noise multiplier's most favourable draw.
- Reuse the shared geometry seam (`pointInIsland`, `nearestCoastPoint`, `islandBlocksSegment`,
  `sampleHeight`); never re-implement polygon or raster math locally, never use the bounding circle as
  the coastline, never key a `core` early-out on `isle.x/y` instead of `isle.pole`.
- ESLint complexity ≤ 10 per function.

**Block If:**
- The measured per-frame heatmap cost at min zoom (0.5×) exceeds **2.0 ms** after tuning — that is a
  budget decision, not an implementation one.
- Hitting the calibration target would require moving a shipped band threshold in
  `CLIENT_CONFIG.blip.heatmap.bands` or the `SIGHT`/`farRadar` constants.

**Never:**
- No shadows, no occlusion change, no `faceShadow` retune — Story 4.11 owns terrain occlusion.
- No wake — Story 4.12 owns it.
- No new `CONFIG.vision` constant; no combat tunable (damage, reload, hp, range, catalog) moves.
- No dropping `attenFloor`/`minPeak` (amendment 127 — the "signature becomes stealth" option is ruled
  out). No storm AREA fill (amendment 128). No height-replaces-depth (amendment 129). No clutter strong
  enough to mask (amendment 130).
- The dashed next-ring telegraph must not paint — only the live ring is a physical object.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Mid hull at the crossover | Mine Layer broadside (`ext` 88) at `farRadar` (577.5u) | Kernel peak lands on the red→blue boundary (`bands[2].at`) — emergent from the fitted curve | No error expected |
| Mid hull inside the crossover | Same hull at 330u | Peak saturates red | No error expected |
| Weakest legitimate return | `minExtent` needle at the 660u rim | Still paints — peak clamps to `minPeak`, above `bands[0].at` after worst-case noise (amendment 127) | Floor guarantees non-zero |
| Big hull at the rim | Battleship broadside (`ext` 124) at 660u | Still reads red — a larger RCS legitimately reaches further (amendment 68's learnable class) | No error expected |
| Steep vs flat island, same size | Two islands of equal area, one high one at sea-level-ish height | Steep reads red-cored, flat reads blue/green — depth term identical, height term differs (amendment 129) | Height clamped to [0,1] of `refHeight` |
| Large island interior at the rim | Big tall island, interior cell, 640u out | Still red (amendment 78 regression pin) | No error expected |
| Surf fringe | Water cell within `surfBandU` seaward of a coastline, near face, swept | Weak (green-band) return outside the polygon | Cells landward of the coast take the land path, not surf |
| Surf on the far face | Water cell seaward of the coast but past the terminator | Paints nothing — inherits the island's `faceShadow` | No error expected |
| Clutter vs a faint echo | Clutter cell coincident with a `minPeak` ship kernel cell | The ship wins `writeCell` (max-wins); clutter never raises the cell | Pin clutter peak < `bands[0].at` |
| Storm wall in range | Live ring, band cells within radar range, beam has crossed their bearing | Volume-falloff return along the band | Ring absent / `state: 'idle'` → no paint at all |
| Storm wall out of range | Band cells beyond `radarRange` from the frozen observer | Not baked | No error expected |
| Next-ring telegraph | Revealed but not-yet-live ring | Paints nothing | No error expected |
| Observer aground / degenerate | `pointInIsland(obs, isle)`, zero-width sweep advance, non-finite ring radius | No paints created; existing paints keep decaying | Guard returns null/empty, never NaN into `writeCell` |

</intent-contract>

## Code Map

- `client/src/render/radarHeatmap.ts` -- the pure heatmap math (grid, ship kernel, island coverage bake,
  `rasterize`). Where the ship and island falloff calls get swapped to the model and where surf joins
  the island bake.
- `client/src/render/radar.ts` -- the Pixi adapter (`Radar`): owns the paint list, the sweep bookkeeping
  (`sweepIslands`/`sweepContacts`), pruning and the texture upload. Gains the clutter and storm sources
  plus the height-raster/zone inputs.
- `client/src/config.ts` -- `CLIENT_CONFIG.blip.heatmap`: existing `bands`/`noise`/`ship`/`island`
  blocks; gains the model's coefficients and the fitted reference.
- `client/src/main.ts` -- `setIslands(map.islands)` at :1533 and `radar.render(...)` at :2293 are the two
  plumbing sites for the height raster and the `ZoneView`.
- `shared/src/sim/heightField.ts` -- `sampleHeight(raster, x, y)`, the ratified elevation authority.
- `shared/src/constants.ts` -- `CONFIG.vision.farRadar` (`SIGHT * 1.75`), shipped by Story 4.9
  deliberately unconsumed as this story's calibration target.
- `client/src/sim/zoneView.ts` -- `ZoneView`, the live/next ring geometry the storm wall reads.
- `client/src/__tests__/radarHeatmap.test.ts`, `radarEcho.test.ts`, `radarViewport.test.ts` -- existing
  suites; `radarViewport.test.ts` is the ADAPTER-level placement pin amendment 98 requires.

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/render/radarFalloff.ts` -- NEW pure module: the ONE model. Exports the geometry
  exponents (`POINT` 4 / `SURFACE` 3 / `VOLUME` 2), `attenuation(dist, ref, exponent, floor)` as the
  generalized form of the shipped curve (`floor + (1-floor)/(1 + (d/ref)^n)` — today's curve is exactly
  `n = 1`), `fitPointRef(...)` solving for the reference range that puts the calibration hull's peak on
  the red→blue boundary at a given crossover distance, and `heightReflectivity(h, opts)`. Integer powers
  by multiplication, no `Math.pow`. -- A separate module is what makes "one model" structurally true
  rather than a claim; every source imports from here.
- [ ] `client/src/config.ts` -- extend `blip.heatmap` with a `model` block: per-material coefficients
  (ship, land-flat, land-steep, surf, clutter, storm), the surface/volume reference ranges, `refHeight`,
  `surfBandU`, `clutterRangeU`, `stormBandU`, and `pointRef` computed by `fitPointRef` from
  `CONFIG.vision.farRadar`. Lower `ship.attenFloor` from 0.45 to a small asymptote and document why:
  under `n = 4` the old floor sits so close to the crossover value that the calibration becomes
  ill-conditioned. `minPeak` is UNCHANGED and is now the real visibility guarantee (amendment 127). --
  Every number this story adds is a tunable in one place; the fit is evaluated once, not per frame.
- [ ] `client/src/render/radarHeatmap.ts` -- swap `rangeAttenuation` to the model: ships take POINT,
  island coverage takes SURFACE. Multiply a `heightReflectivity(sampleHeight(...))` term into
  `coverIntensity` alongside the existing `solidity` (amendment 129 — multiply, never replace). Extend
  the island bake to also emit SURF cells: widen the bbox scan by `surfBandU`, and for water cells
  within that distance of the coast emit a weak surface return inheriting the same `faceShadow` and
  cross-island LOS. Thread the raster through `buildIslandCoverage`. -- The island bake is already the
  right loop for surf; a second scan would double the only expensive thing in the file.
- [ ] `client/src/render/radarSources.ts` -- NEW: `ClutterPaint` and `StormPaint` records plus their
  stamps. Both freeze observer position (and the ring's centre/radius) at creation and are arc-gated by
  the same `sweepCrossed`/`arcOverlaps` bookkeeping islands use. Clutter stamps procedurally over a
  bounded disc (no baked cover list); the storm stamps the band, clipped to radar range from the frozen
  observer. -- Keeps `radarHeatmap.ts` from growing a third and fourth concern; both are weather-ish
  sources with the same shape.
- [ ] `client/src/render/radar.ts` -- add `setHeightRaster()` and accept a `ZoneView` in `render()`;
  open/advance/prune clutter and storm paints inside `renderReturn` alongside `sweepIslands`; extend
  `rasterize`'s dispatch to the two new paint kinds. -- One place already owns paint lifetime; the new
  sources join it rather than inventing a parallel path.
- [ ] `client/src/main.ts` -- pass `map.heightRaster` at the existing `setIslands` site and the already-
  computed `ZoneView` into `g.radar.render(...)`. -- Both values exist at those call sites already.
- [ ] `client/src/__tests__/radarFalloff.test.ts` -- NEW: pin the exponents, the curve's monotonicity and
  strict decrease, that `n = 1` reproduces the shipped curve, the fit's crossover landing, and
  `heightReflectivity`'s clamped ends. -- The model is the story; it gets its own suite.
- [ ] `client/src/__tests__/radarHeatmap.test.ts` -- extend with the I/O matrix rows: the crossover, the
  rim floor, the big-hull-at-rim read, steep-vs-flat islands of equal size, the amendment-78 big-red-mass
  regression pin, surf placement (seaward only, near face only), and the clutter-never-outranks pin
  asserted against `bands[0].at` at the worst-case noise draw. -- The I/O matrix's edge cases, tested.
- [ ] `client/src/__tests__/radarViewport.test.ts` -- extend the ADAPTER-level pins to the new sources: a
  storm-wall cell and a clutter cell at known world positions render at those world positions, at both
  `USER_ZOOM_MIN` and `USER_ZOOM_MAX` and while the camera moves. -- Amendment 98: a pure-rasterizer
  test does not discharge placement, and that is exactly how cycle 57 reached production.
- [ ] `client/src/config.ts` (perf note) -- after measuring, update the `cellU` cost table comment with
  the new per-frame numbers at 1.5× / 1.0× / 0.5×. -- Amendment 99 requires the measurement to be
  reported, and that comment is where the last one lives.

**Acceptance Criteria:**
- Given the fitted curve, when a Mine Layer's broadside return is evaluated across range, then its
  red→blue crossover lands at `CONFIG.vision.farRadar` (577.5u) with NO range comparison against that
  constant anywhere on a paint path — verified by grepping the paint path for `farRadar`.
- Given the model module, when any return source computes intensity, then it does so as (material
  coefficient × geometry-selected falloff × its own shape term) through `radarFalloff.ts`, and no source
  carries its own private attenuation formula.
- Given `HC_RADAR_GRAMMAR=silhouette`, when a match runs, then rendering is byte-identical to today —
  the silhouette path never touches the heatmap.
- Given a full frame at both zoom extremes on the reference device, when the heatmap is rasterized with
  ships, coastline, surf, clutter and a live storm wall present, then the measured per-frame cost is
  reported in the PR and stays inside the render budget.
- Given `npm run check`, when it runs, then lint, type-check and all tests pass with no complexity
  violations.
- Given `PROTOCOL_VERSION`, when the cycle lands, then it is still 30 and no server file has changed.

## Spec Change Log

## Review Triage Log

## Design Notes

**The curve is a one-character generalization, which is why it is safe.** The shipped
`rangeAttenuation` is `floor + (1 − floor)/(1 + d/ref)`. The model is the same expression with the
ratio raised to the geometry's exponent:

```
atten(d, ref, n, floor) = floor + (1 − floor) / (1 + (d/ref)^n)
```

`n = 1` reproduces today's behaviour exactly (a pinned test), `n = 4` is the point target, `n = 3` the
surface, `n = 2` the volume. It is a true inverse-power law asymptotically, has no singularity at
`d = 0`, is strictly decreasing everywhere, and keeps `attenFloor` as an asymptote rather than a clamp —
so two different ranges still never attenuate identically (the amendment-64 one-channel rule).

**Why `attenFloor` drops.** With `n = 4` the curve does nearly all its work well inside the rim, so a
0.45 asymptote would sit within a few hundredths of the crossover value and tiny coefficient changes
would swing the crossover wildly. Lowering the asymptote conditions the fit; `minPeak` (unchanged at
0.2) is what actually discharges amendment 127's "nothing vanishes" guarantee, and the tests assert it
directly rather than trusting the curve.

**Worked calibration (the shape, not the final numbers — amendment 118 expects tuning).** Solving
`ext × atten₄(farRadar) / strongExtent = bands[2].at` for the Mine Layer broadside (`ext` 88,
`strongExtent` 60, red at 0.7) puts the point reference in the high-500s u. At that fit a mid hull
saturates red by ~330u and still reads blue at the 660u rim; a `minExtent` needle at the rim falls to
`minPeak` and paints green; a battleship broadside still reads red at the rim. Those four readings are
the matrix rows above and are what the suite pins — not the intermediate constant.

**Height folds in as reflectivity, not as geometry.** `coverIntensity` gains one factor:
`heightReflectivity(sampleHeight(raster, x, y))`, lerping a flat-terrain coefficient toward a steep one
over `refHeight`. The existing `solidity` depth term and `gain` are untouched, so amendment 78's big red
mass survives and height only decides *how* red. This also establishes the raster access pattern Story
4.11 inherits.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green, no complexity errors.
- `npm test -w client` -- expected: the new `radarFalloff` suite and the extended heatmap/viewport suites
  pass.
- `grep -rn "farRadar" client/src/render/` -- expected: zero hits (the constant is consumed only in
  `config.ts`).
- `git diff --stat origin/main -- server/ shared/src/index.ts` -- expected: empty (client-only,
  `PROTOCOL_VERSION` untouched).

**Manual checks:**
- Run with `HC_RADAR_GRAMMAR=return`: a large tall island reads as a big red mass with a graded fringe;
  a low flat island of similar size reads blue/green; a surf line sits just seaward of the near face; a
  faint near-field haze is visible but never obscures a contact; the live storm ring paints a band and
  the dashed next ring paints nothing.
- Run with `HC_RADAR_GRAMMAR=silhouette`: unchanged from today.
- Capture per-frame heatmap cost at 0.5× / 1.0× / 1.5× zoom and record the numbers in the PR body.
