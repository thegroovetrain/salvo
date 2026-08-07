---
title: 'The Beam March — radar paints everything it sweeps (cycle 62, corrective)'
type: 'refactor'
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

**Problem:** Cycle 61's radar asks each OBJECT what it looks like and bakes a per-object coverage list.
That primitive cannot express what the story asked for. Eric, on the shipped build: *"What I wanted you
to accomplish was to have the radar correctly paint **everything** it sweeps over."* Concretely, large
stretches of coastline go unpainted along an arbitrary diagonal, because `faceShadow` is the near-face
criterion **for a disc** and a lateral tip of an elongated island scores `m = −ρ²/(d·r)` ≈ −0.6 against
a 0.3 ramp and clamps to zero — so every long tail and side extremity of every stretched island is
suppressed regardless of facing. Ships are still painted by a bespoke ellipse kernel rather than by the
same rules as everything else, and a flat ±30% jitter puts static in the interior of a landmass, which
is the one place a real scope is rock-steady.

**Approach:** Invert the primitive. Radar stops asking each object what it looks like and asks each
BEARING what is out there: as the beam advances, march rays from own hull to the radar terminus,
sampling a world raster that carries terrain, ships, the storm wall and sea clutter, and paint every
sample from the cycle-61 return model. Nothing occludes anything this cycle — Story 4.11 restores
occlusion as a height-derived shadow length, which is a strictly better answer than the binary segment
tests being removed.

## Boundaries & Constraints

**Always:**
- **CLIENT-ONLY.** No wire field, no server file, `PROTOCOL_VERSION` unchanged. No `CONFIG.vision`
  constant, no combat tunable. The `silhouette` grammar is untouched (it has no heatmap).
- **A paint is a historical record (amendment 83).** A march freezes its observer and its samples at
  creation. Only alpha changes afterwards, via phosphor decay. Nothing may be re-evaluated against live
  state — not the live observer position, not the live beam angle, not the live grid anchor.
- **Nothing viewport-derived may touch paint creation or retirement (amendment 97).** The camera decides
  exactly one thing: which rectangle of world is rasterized this frame. A paint recorded off-screen at
  high zoom MUST appear on zoom-out. Culling a slice from RASTERIZATION by viewport is fine; culling it
  from the LIST is not.
- **Colour is intensity, never category (amendment 105);** intensity is reflectivity × falloff chosen by
  the target's geometry (amendment 106), through the existing `radarFalloff.ts`. That module is the one
  model and stays the one model.
- **`CONFIG.vision.farRadar` remains a curve-FIT input only** — never a comparison on a paint path.
- **The march is gated only by the sweep and radar range.** A ray paints every sample along its length,
  near side and far side alike.
- Reuse the shared seams: `sampleHeight` for elevation, `hullSilhouette`/`transformPolygon` for hull
  footprints, `pointInIsland` only where a polygon test is genuinely needed. Never re-implement polygon
  or raster math; never use an island's bounding circle as its coastline.
- ESLint complexity ≤ 10 per function.

**Block If:**
- The measured per-frame heatmap cost at min zoom (0.5×) exceeds **2.5 ms** after tuning ray spacing and
  step size. (Raised from cycle 61's 2.0 ms because the march replaces the bakes rather than adding to
  them; if it cannot be brought inside 2.5 ms, the resolution trade is Eric's call, not mine.)
- Holding amendment 83 would require keeping a persistent world-anchored history buffer that re-centres
  on the observer — that is the cycle-57 trap and must not be reintroduced to hit a perf number.

**Never:**
- No occlusion of any kind: no near-face terminator, no `islandBlocksSegment` on a paint path, no
  clutter occluder mask, no ship shadowing (amendments 140, 141). Story 4.11 owns all of it.
- **No server-side sensor gate moves.** `blipGate`, `pointSighted`, `pointDetected`, the muzzle-flash
  and smoke halos and the foghorn muffle all still enforce LOS and are untouched. This cycle changes
  what the client DRAWS from what it already holds, never what the server discloses.
- No terracing of height to contour levels (amendment 142), and no contour POLYGON is ever read.
- No flat noise amplitude (amendment 143).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| The reported defect | Elongated island, observer off one flank | Its FULL extent paints — tails and lateral tips included; no straight-line cut anywhere | Regression test built from a stretched polygon |
| Far side of an island | Sample beyond the near face | Paints (nothing occludes this cycle) | — |
| Island behind an island | Two islands on one bearing | BOTH paint | — |
| Height gradient | Steep headland vs low flat island, equal size | Steep reads red-cored, flat reads blue/green — continuous height, no terracing | Height clamped to [0,1] of `refHeight` |
| Colour regions | A landmass at rest | Band boundaries fall on iso-height lines (i.e. on the contours) rather than dithering across the interior | — |
| Strong return grain | Island interior at saturation | Solid — noise amplitude → 0 as intensity rises | — |
| Weak return grain | Fringe cells and sea clutter | Grainy — noise amplitude largest at the detection floor | — |
| Ship return | Any hull, any aspect | Falls out of its raster footprint under POINT falloff; a broadside paints broader than a bow-on | Unknown hull id paints nothing, never throws |
| Ship occlusion | Hull between observer and a contact | The far contact still paints (amendment 141) | — |
| Both paint sources | Hull inside truesight vs beyond it | Identical treatment — `contactEcho` and `ReturnBlipEvent` both feed the same raster stamp | Neither may double-stamp one hull |
| Sweep gating | Bearing not yet crossed this revolution | Unpainted until the beam reaches it | Zero-width advance paints nothing |
| Persistence | A cell swept 3 revolutions ago | Decayed but present; leaving radar range never un-paints | Dead slices pruned by time only |
| Zoom-out reveal | Paint recorded off-screen at 1.5×, then zoom to 0.5× | Appears (amendment 97) | — |
| Storm wall | Live ring band in range | Volume falloff; the dashed next-ring telegraph paints nothing | `idle`/absent zone → no paint |
| Degenerate | Observer aground; non-finite ring; raster absent; stalled clock | No paints created; existing paints keep decaying | No NaN may reach a cell write |

</intent-contract>

## Code Map

- `client/src/render/radarHeatmap.ts` -- grid, `writeCell`, `quantizeInto`, noise, and the per-object
  bakes being retired (`buildIslandCoverage`, `coverIntensity`, `faceShadow`, `solidity`, `stampShip`,
  `stampIsland`, `occluderCandidates`). The grid/quantization half stays; the bake half goes.
- `client/src/render/radarMarch.ts` -- NEW. The beam march: ray generation over a swept arc, sampling,
  and the slice record. Pure, no Pixi.
- `client/src/render/radarField.ts` -- NEW. The world raster the march samples: terrain height plus the
  per-frame ship stamp, storm wall and sea clutter, behind one `sampleAt(x, y)`-shaped seam.
- `client/src/render/radarFalloff.ts` -- the one model (POINT/SURFACE/VOLUME, `fitPointRef`,
  `heightReflectivity`). Unchanged in substance; gains the SNR noise envelope.
- `client/src/render/radarSources.ts` -- clutter and storm wall; folded into the field rather than
  emitting their own paints.
- `client/src/render/radar.ts` -- the Pixi adapter: paint lifetime, sweep bookkeeping, texture upload.
- `client/src/config.ts` -- `CLIENT_CONFIG.blip.heatmap`: ray spacing, step size, the noise envelope,
  band alphas (more translucent), the model coefficients.
- `client/src/__tests__/radarHeatmap.test.ts`, `radarFalloff.test.ts`, `radarViewport.test.ts`,
  `radarEcho.test.ts` -- existing suites; `radarViewport` is the adapter-level placement pin.
- `shared/src/sim/heightField.ts` -- `sampleHeight` (read-only; do not modify).

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/render/radarField.ts` -- NEW. One queryable world field behind a single seam: terrain
  reflectivity from `sampleHeight` (CONTINUOUS, never terraced), a per-frame ship stamp built from the
  contact/blip set via `hullSilhouette` + `transformPolygon`, the storm wall band, and sea clutter.
  Each answer carries its material coefficient AND its geometry class, so the march never decides what
  kind of thing it hit. -- This is the "put the ships on the raster" ruling (amendment 141) made
  structural: one place decides what is at a point.
- [ ] `client/src/render/radarMarch.ts` -- NEW. Given (observer, swept arc, field, radar range, opts),
  emit slice records: rays at a fixed angular quantum across the arc, marched outward to the terminus,
  each sample painting `reflectivity × falloff(dist, geometry)` with the SNR noise envelope applied.
  Angular quantum should put adjacent rays ≲1 cell apart at radar range (~0.5° at today's numbers) and
  slice emission should key off a fixed ANGULAR quantum, not the frame rate, so slice count is
  independent of fps. -- The whole story: ask each bearing what is out there.
- [ ] `client/src/render/radarFalloff.ts` -- add the SNR noise envelope: amplitude largest at the
  detection floor, falling toward zero as intensity saturates (amendment 143). Keep the existing
  geometry exponents, `fitPointRef` and `heightReflectivity` intact. -- The grain now reports that a
  return is MARGINAL, which is a consequence of amendment 105, not a new channel.
- [ ] `client/src/render/radarHeatmap.ts` -- DELETE the per-object bake path: `buildIslandCoverage`,
  `coverIntensity`, `faceShadow`, `solidity`, `inLand`, `occluderCandidates`, `stampShip`, `stampIsland`,
  `IslandPaint`, `ShipPaint` and the surf branch. KEEP the grid, `anchorGrid`, `writeCell`,
  `sampleGrid`, `quantizeInto`, `bandIndex`, `cellNoise`/`paintSeed` and the sweep helpers. Add the
  slice stamp. -- Retiring the primitive is the point; leaving it beside the march guarantees drift.
- [ ] `client/src/render/radarSources.ts` -- fold clutter and the storm wall into `radarField` as
  materials rather than independent paint kinds, and drop clutter's occluder mask (amendment 140). Keep
  their coefficients and bounds. -- One field, one march, one set of rules.
- [ ] `client/src/render/radar.ts` -- drive the march from the sweep advance; hold slices as the paint
  list; prune by time only. Delete the island/contact/weather paint-opening paths. Slices may be culled
  from RASTERIZATION by viewport bbox but never from the list. -- Paint lifetime already lives here.
- [ ] `client/src/config.ts` -- add ray spacing, march step, the SNR noise envelope, and the ship-stamp
  knobs; REMOVE the retired island/ship kernel knobs (`depthFullU`, `minLand`, `gain`, `terminator`,
  `maxCells`, `surfMaxCells`, `minExtent`, `depthFrac`, `minDepth`, `strongExtent`, `paintsPerIsland`).
  Lower the band alphas for more translucency. Keep every surviving comment's standard — it explains
  WHY each number is what it is. -- Dead knobs are worse than dead code; they read as tunable.
- [ ] `client/src/render/radarFalloff.ts` + `config.ts` -- re-derive the sea-clutter bounds against the
  NEW noise envelope. Amendment 135 binds: state each bound with the worst-case noise factor explicit
  and pin it. -- The envelope changed, so every bound proved against the old one is unproven.
- [ ] `client/src/__tests__/radarMarch.test.ts` -- NEW. The I/O matrix's march rows: the elongated-island
  regression (full extent paints, no straight cut), far-side paints, island-behind-island paints, the
  sweep gate, zero-width advance, degenerate inputs, and that no NaN reaches a cell write.
- [ ] `client/src/__tests__/radarHeatmap.test.ts` -- rework for the march: continuous-height gradient,
  band boundaries on iso-height lines, solid strong cores vs grainy weak fringes, the clutter bounds at
  shipped noise, the storm wall's band ceiling at shipped noise. Delete tests of the retired bakes
  rather than adapting them into something that no longer means anything.
- [ ] `client/src/__tests__/radarViewport.test.ts` -- RE-DERIVE the adapter pins against the new
  primitive (amendment 98): a marched return at a known world position renders there, at both zoom
  extremes and while the camera moves; and a slice recorded off-screen at max zoom appears on zoom-out
  (amendment 97). Do not assume the cycle-58 pins carry over — the thing being placed changed.
- [ ] `client/src/config.ts` (perf) -- re-measure per-frame cost at 1.5× / 1.0× / 0.5× and update the
  cost-table comment. -- Amendment 99; the primitive changed, so the old table is void.

**Acceptance Criteria:**
- Given an elongated island and an observer off its flank, when the beam crosses it, then its full
  extent paints with no straight-line cut — the reported defect, as a test.
- Given anything within radar range on a swept bearing, when the beam crosses it, then it paints,
  regardless of what else lies on that bearing.
- Given the codebase, when the cycle lands, then no occlusion test exists on any paint path (grep:
  `faceShadow`, `islandBlocksSegment` and `pointInIsland` appear in no radar RENDER module), while every
  SERVER-side LOS gate is byte-identical.
- Given a hull, when its echo paints, then it came from the same field and the same march as terrain —
  no bespoke ship kernel exists.
- Given a landmass at rest, when it paints, then its interior is solid and its fringe is grainy.
- Given `HC_RADAR_GRAMMAR=silhouette`, when a match runs, then rendering is byte-identical to today.
- Given `npm run check`, then lint, type-check and all tests pass with no complexity violations.
- Given `PROTOCOL_VERSION` and `server/`, when the cycle lands, then both are unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the march and not a corrected `faceShadow`.** The near-face criterion is exactly right for a
disc and has no correct generalization to an arbitrary polygon that is also cheap — and under
amendment 140 nothing occludes anything this cycle anyway, so the correct move is deletion. Story 4.11
then reintroduces occlusion ONCE, as a height-derived shadow length along the same ray, which is both
the better answer and the cheaper one.

**Why terraces were rejected, recorded because it will be re-proposed.** `sampleHeight` is an O(1)
`Uint8Array` read that already returns 256 levels; terracing means mapping that byte down to 4 bands
via an extra comparison chain on an identical read. It costs more and discards 98% of the elevation
data. It would also quantize Story 4.11's shadow lengths to four values and land the hard-cover
threshold `H` on a terrace boundary, flipping a whole band of the map from soft to absolute cover at
once. And the look it promised is free: on a continuous field a colour-band boundary IS an iso-height
line, so the regions land on the contours by construction once the flat jitter stops smearing them.

**Persistence shape.** History lives in the slice list and the buffer stays a scratch surface
re-rasterized every frame (amendment 96). Emit one slice per fixed ANGULAR quantum rather than per
frame, so slice count is a function of the sweep rate and persistence depth rather than of the frame
rate. Store slice cells in flat typed arrays; cull a slice from rasterization by bounding box, never
from the list.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green, no complexity errors.
- `grep -rn "faceShadow\|islandBlocksSegment\|pointInIsland" client/src/render/` -- expected: no hits.
- `grep -rn "farRadar" client/src/render/` -- expected: no hits.
- `git diff --stat origin/main -- server/ shared/` -- expected: empty.

**Manual checks:**
- `HC_RADAR_GRAMMAR=return`: an elongated island paints end to end with no diagonal cut; a tall island
  reads red-cored and a low one blue/green; interiors are solid and fringes grainy; band edges follow
  the contours; ships paint from their footprint; the live storm ring bands and the telegraph does not.
- Record per-frame cost at all three zoom levels in the PR body.
