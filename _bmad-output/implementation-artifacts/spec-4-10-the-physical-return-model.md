---
title: 'Story 4.10 — The Physical Return Model'
type: 'feature'
created: '2026-08-07'
status: 'done'
baseline_revision: '47b5575'
review_loop_iteration: 0
followup_review_recommended: true
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
- **Clutter can never outrank a real return** (amendment 130). *(CORRECTED IN-CYCLE by amendments 133
  and 136 — see the Spec Change Log. The bound as first written here, "strictly below `bands[0].at`",
  was a mis-derivation: that is the TRANSPARENCY threshold, so it made clutter invisible rather than
  safe. The ruling is unchanged; the bound is now three-sided — clutter must straddle `bands[0].at` so
  the noise speckles it, never reach `bands[1].at`, and never exceed the faintest real echo's worst
  draw.)*
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
| Clutter vs a faint echo | Clutter cell coincident with a `minPeak` ship kernel cell | The ship wins `writeCell` (max-wins) at every noise draw | Pin `clutter × (1+noise) < minPeak × (1−noise)`, and the straddle/green bounds (amendments 133, 136) |
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
- [x] `client/src/render/radarFalloff.ts` -- NEW pure module: the ONE model. Exports the geometry
  exponents (`POINT` 4 / `SURFACE` 3 / `VOLUME` 2), `attenuation(dist, ref, exponent, floor)` as the
  generalized form of the shipped curve (`floor + (1-floor)/(1 + (d/ref)^n)` — today's curve is exactly
  `n = 1`), `fitPointRef(...)` solving for the reference range that puts the calibration hull's peak on
  the red→blue boundary at a given crossover distance, and `heightReflectivity(h, opts)`. Integer powers
  by multiplication, no `Math.pow`. -- A separate module is what makes "one model" structurally true
  rather than a claim; every source imports from here.
- [x] `client/src/config.ts` -- extend `blip.heatmap` with a `model` block: per-material coefficients
  (ship, land-flat, land-steep, surf, clutter, storm), the surface/volume reference ranges, `refHeight`,
  `surfBandU`, `clutterRangeU`, `stormBandU`, and `pointRef` computed by `fitPointRef` from
  `CONFIG.vision.farRadar`. Lower `ship.attenFloor` from 0.45 to a small asymptote and document why:
  under `n = 4` the old floor sits so close to the crossover value that the calibration becomes
  ill-conditioned. `minPeak` is UNCHANGED and is now the real visibility guarantee (amendment 127). --
  Every number this story adds is a tunable in one place; the fit is evaluated once, not per frame.
- [x] `client/src/render/radarHeatmap.ts` -- swap `rangeAttenuation` to the model: ships take POINT,
  island coverage takes SURFACE. Multiply a `heightReflectivity(sampleHeight(...))` term into
  `coverIntensity` alongside the existing `solidity` (amendment 129 — multiply, never replace). Extend
  the island bake to also emit SURF cells: widen the bbox scan by `surfBandU`, and for water cells
  within that distance of the coast emit a weak surface return inheriting the same `faceShadow` and
  cross-island LOS. Thread the raster through `buildIslandCoverage`. -- The island bake is already the
  right loop for surf; a second scan would double the only expensive thing in the file.
- [x] `client/src/render/radarSources.ts` -- NEW: `ClutterPaint` and `StormPaint` records plus their
  stamps. Both freeze observer position (and the ring's centre/radius) at creation and are arc-gated by
  the same `sweepCrossed`/`arcOverlaps` bookkeeping islands use. Clutter stamps procedurally over a
  bounded disc (no baked cover list); the storm stamps the band, clipped to radar range from the frozen
  observer. -- Keeps `radarHeatmap.ts` from growing a third and fourth concern; both are weather-ish
  sources with the same shape.
- [x] `client/src/render/radar.ts` -- add `setHeightRaster()` and accept a `ZoneView` in `render()`;
  open/advance/prune clutter and storm paints inside `renderReturn` alongside `sweepIslands`; extend
  `rasterize`'s dispatch to the two new paint kinds. -- One place already owns paint lifetime; the new
  sources join it rather than inventing a parallel path.
- [x] `client/src/main.ts` -- pass `map.heightRaster` at the existing `setIslands` site and the already-
  computed `ZoneView` into `g.radar.render(...)`. -- Both values exist at those call sites already.
- [x] `client/src/__tests__/radarFalloff.test.ts` -- NEW: pin the exponents, the curve's monotonicity and
  strict decrease, that `n = 1` reproduces the shipped curve, the fit's crossover landing, and
  `heightReflectivity`'s clamped ends. -- The model is the story; it gets its own suite.
- [x] `client/src/__tests__/radarHeatmap.test.ts` -- extend with the I/O matrix rows: the crossover, the
  rim floor, the big-hull-at-rim read, steep-vs-flat islands of equal size, the amendment-78 big-red-mass
  regression pin, surf placement (seaward only, near face only), and the clutter-never-outranks pin
  asserted against `bands[0].at` at the worst-case noise draw. -- The I/O matrix's edge cases, tested.
- [x] `client/src/__tests__/radarViewport.test.ts` -- extend the ADAPTER-level pins to the new sources: a
  storm-wall cell and a clutter cell at known world positions render at those world positions, at both
  `USER_ZOOM_MIN` and `USER_ZOOM_MAX` and while the camera moves. -- Amendment 98: a pure-rasterizer
  test does not discharge placement, and that is exactly how cycle 57 reached production.
- [x] `client/src/config.ts` (perf note) -- after measuring, update the `cellU` cost table comment with
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

### 2026-08-07 — clutter bound corrected mid-implementation (amendments 133, 136)

**Triggering finding:** the first implementation followed this spec's clutter bound faithfully and
produced a haze that contributes to the intensity field and lights **zero pixels**. `bands[0].at` is
the TRANSPARENCY threshold, so "peak strictly below `bands[0].at`" does not make clutter safe — it
makes it invisible. That is neither option Eric was shown at the question gate (he chose "textural
only" and explicitly declined "no clutter this cycle").

**What was amended:** the bound only — Eric's ruling is untouched. It is now three-sided: clutter must
STRADDLE `bands[0].at` so the noise speckles it into a haze, must never reach `bands[1].at` (green
only — blue would put "probably a thing" on empty water), and must never exceed the faintest real
echo's worst draw (`minPeak × (1 − noise)`), because `writeCell` is max-wins on intensity and hands
the winner its ALPHA too. Shipped at `clutter: 0.105`. The corresponding clause inside
`<intent-contract>` was annotated rather than silently rewritten, so the mis-derivation stays visible.

**Known-bad state avoided:** shipping a mechanic Eric chose, in a form he was never offered — and the
subtler one, a coefficient "safely" above the threshold, which paints a solid uniform green disc
around own hull (band colour is verbatim and alpha carries age, not intensity, so every lit clutter
cell is the same pixel) and reads as a drawn circle rather than as sea.

**KEEP (must survive any re-derivation):** the clutter coefficient is the ONE value in this block
deliberately tuned to sit ON a threshold rather than clear of one — that is the mechanism, not
sloppiness. Both sides of the straddle must be asserted; a one-sided assertion is exactly what let the
invisible version pass its own test.

**General lesson recorded in amendment 133:** an amendment that states a ruling AND its implementation
bound can be right about the ruling and wrong about the bound — and the bound is what gets
implemented. A numeric constraint is the spec author's claim and is reviewable; it does not inherit
the ruling's authority.

## Review Triage Log

### 2026-08-07 — Review pass (Blind Hunter + Edge Case Hunter, run at Fable)

- intent_gap: 0
- bad_spec: 0
- patch: 17: (high 5, medium 10, low 2)
- defer: 2: (high 0, medium 2, low 0)
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` **Surf painted BLUE on open water.** `surf` 0.3 × noise 1.3 = 0.39 > `bands[1].at` 0.36 within ~310u. Coefficient → 0.26 and the comment restated with the noise factor.
  - `[high]` `[patch]` **The storm wall painted RED, out-reading a hull** (against amendment 128, and against its own comment claiming it was below the ceiling "by construction"). `storm` 0.6 × 1.3 = 0.78 > 0.7. Coefficient → 0.5.
  - `[high]` `[patch]` **Every bound assertion ran the noise-OFF `CLEAN` fixture**, which is why the two above survived a green 1,868-test suite — the cycles 54/55/57 shape again. Added worst-draw arithmetic bounds and a rasterized band-histogram test per source at SHIPPED noise. Recorded as amendment 135.
  - `[high]` `[patch]` **One-frame weather collapse.** Both weather paints opened with the frame's `from`, a sliver short of the anchor; on the last frame of a revolution `wrapPositive(to − from)` wrapped a near-full arc to ~0.03 rad — measured at 3,574 lit texels → 17, roughly every other revolution. Fixed structurally (the anchor is set internally; `from` is no longer an argument) so it is unrepresentable rather than merely corrected.
  - `[high]` `[patch]` **`VERSION`/`package.json` were not bumped for cycle 61, and neither tracker was updated.** Both trackers and the version now land in this PR.
  - `[medium]` `[patch]` Clutter could claim a faint echo's cell AND its alpha (0.169 vs 0.14), re-aging a decaying return. Coefficient → 0.105; the guarantee now holds outright.
  - `[medium]` `[patch]` Clutter's disc edge was a hand-placed circle, not a curve-decided fade (99.7% of peak at the cutoff) — against amendment 130. Added `clutterRef: 150`, so the haze dies at ~79u on its own and `clutterRangeU` is a pure compute bound.
  - `[medium]` `[patch]` Clutter painted on LAND and through islands. It is SEA state — now carries a frozen occluder shortlist and masks both.
  - `[medium]` `[patch]` Three live clutter paints with independent seeds lit ~87% of the disc under max-wins instead of ~26%, re-creating the solid disc the straddle prevents. One stable seed makes stacking idempotent and the speckle a property of the PLACE.
  - `[medium]` `[patch]` `STORM_MAX_CELLS` was a fixed 8,000 sized against BASE radar range; a boosted scope (~1327u) or a lowered `cellU` blew past it and the bake silently dropped the wall's outer radii. Cap now derived at bake time, with an absolute runaway backstop.
  - `[medium]` `[patch]` `occluderCandidates` was not widened by `surfBandU`, so an occluder crossing only the obs→surf-cell corridor was missed and the per-cell LOS test never ran.
  - `[medium]` `[patch]` `maxCells: 2600` was shared between land and surf on a widened scan, so a big island could truncate row-major and lose its southern edge. Surf given its own budget.
  - `[medium]` `[patch]` The clutter placement test pinned via `radar.intensityAt` — a grid-space read that bypasses the sprite transform entirely, which is amendment 98's exact trap. Now round-trips lit texels through `measure()` at both zoom extremes.
  - `[medium]` `[patch]` The `wetCells` regression oracle was weakened by an INTENSITY filter (≤ `model.surf`), which would excuse a future land-path leak onto open water. Now filters POSITIONALLY (within `surfBandU` of the coast).
  - `[medium]` `[patch]` A stale header comment in `radarViewport.test.ts` asserted "CLUTTER LIGHTS NO TEXEL" (the retired amendment-130 bound) while the same file carried skip-disc machinery that exists because it does. Deleted.
  - `[low]` `[patch]` Spec Design Notes drift: "saturates red by ~330u" vs the shipped ~465u, and the clutter pin cited `bands[0].at`. Both corrected.
  - `[low]` `[patch]` The perf gate had been discharged by cross-environment extrapolation. Re-measured after the fixes: the harness's buffer-only figure now agrees with the reference-device number within noise, and the full frame is 1.70 ms at 0.5× — inside the 2.0 ms Block-If, taken rather than inferred.

## Auto Run Result

Status: **done**

**Implemented change.** Story 4.10 replaces the `return` heatmap's hand-tuned intensity lookup with
ONE physical model: a per-material reflectivity coefficient × a falloff whose exponent is chosen by
the target's geometry (point/ship 1/d⁴, surface/coast+surf+clutter 1/d³, volume/storm 1/d²), in one
new pure module every return source calls. The curve generalizes the shipped one, so `n = 1`
reproduces cycle 52's hyperbola exactly and that identity is pinned as the safety net. Coast strength
now multiplies terrain height into the existing depth solidity; surf, sea clutter and the storm wall
join as three new paint sources under the existing sweep/freeze/decay rules.

**Files changed.**
- `client/src/render/radarFalloff.ts` (new) — the one model: geometry exponents, the generalized
  attenuation, `fitPointRef`, `heightReflectivity`.
- `client/src/render/radarSources.ts` (new) — `ClutterPaint` and `StormPaint` records and stamps.
- `client/src/render/radarHeatmap.ts` — ships on POINT, coast on SURFACE, height folded into
  `coverIntensity`, surf emitted from the island bake, separate land/surf budgets, padded occluder
  shortlist.
- `client/src/render/radar.ts` — height raster and `ZoneView` inputs; weather paint lifetime.
- `client/src/config.ts` — the `model` block, the fitted `pointRef`, re-measured cost table.
- `client/src/main.ts` — plumbs the raster and the zone view at the two existing call sites.
- `client/src/__tests__/radarFalloff.test.ts` (new) + extensions to `radarHeatmap`, `radarViewport`,
  `radarEcho` — including the noise-ON fixtures that were the review's central lesson.
- `VERSION`, `package.json`, `package-lock.json` → 0.17.61; both trackers; amendments 127-137;
  two deferred-work entries.

**Verification.** `npm run check` green — **3,456 tests** (shared 571 / server 997 / client 1,888),
0 lint errors (3 pre-existing `max-lines-per-function` warnings, untouched).
`grep -rn "farRadar" client/src/render/` empty. `git diff --stat origin/main -- server/ shared/`
empty; `PROTOCOL_VERSION` 30. Per-frame heatmap cost measured at all three zoom levels; 1.70 ms at
0.5× against the 2.0 ms gate.

**Residual risks.**
- The storm wall has no island LOS (deferred to 4.11, ledgered) — it is the one return that paints
  through terrain.
- The per-frame budget has still never been taken on the reference device (ledgered); the harness now
  agrees with the recorded reference figure within noise, which is why this cycle's gate was passed on
  measurement rather than extrapolation.
- Every number in the coefficient table is expected to be tuned on sight (amendment 118); the three
  band-bound relationships are what is pinned, not the values.

**Follow-up review recommended: true.** The review pass applied 17 patches across five source files
and four test files, two of them high-severity band-ceiling violations that changed shipped
coefficients, one a structural fix to paint lifetime, plus a mid-cycle correction to a ratified
amendment. That is enough breadth and consequence to be worth an independent look — and this cycle's
own record (amendment 61) says to run the cross-model gate even when the in-family gate comes back
clean.

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
`strongExtent` 60, red at 0.7) puts the point reference at **558.505u**. At that fit a mid hull
saturates red at ~465u and still reads blue (0.5165) at the 660u rim; a `minExtent` needle at the rim
falls to `minPeak` and paints green; a battleship broadside still reads red (0.7279) at the rim. Those
four readings are the matrix rows above and are what the suite pins — not the intermediate constant.

**Every coefficient bound must carry the noise factor.** `noiseMul` multiplies a cell's intensity by
`1 ± noise` AFTER the coefficient is applied, so a bound written at the nominal value is not a bound.
State each as `coefficient × (1 + noise) < threshold` and pin it with a test that rasterizes at the
SHIPPED noise level and asserts the forbidden band's cell count is zero — a noise-off fixture proves a
strictly weaker statement (amendment 135, learned the hard way at this cycle's review gate).

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
