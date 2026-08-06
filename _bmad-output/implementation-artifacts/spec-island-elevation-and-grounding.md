---
title: 'Fractal Terrain — fBm Height Field, Contours, and the Grounding Fix'
type: 'feature'
created: '2026-08-06'
status: 'ready-for-dev'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** Cycle 51 shipped "fractal islands" that are not fractal terrain: each landmass is a 1-3 point spine at uniform width (a capsule) with fractal noise painted on its OUTLINE. The silhouette is always a blob or a sausage — it can never produce a lobe, an arm, a hook or a bay — and it carries no elevation, so height had to be bolted on as a separate erosion pass. Separately, land coverage overshot at 3-5%, and ships were being pinned "in open ocean" by a collision defect.

**Approach:** Replace the capsule generator with a genuine **fBm height field**. Layered integer-hashed gradient noise with domain warping produces a height field over the map disc; thresholding it at sea level yields coastlines (bays, hooks and headlands fall out for free), and higher isolines of the SAME field yield the topographic contour bands. Shape and elevation stop being two systems. The height raster is RETAINED (quantized, plus a max-height pyramid) so a future cycle can compute radar shadows as a cheap hierarchical raymarch.

## Boundaries & Constraints

**Always:**
- `generateMap(seed, playerCap)` stays **pure and deterministic** — identical `(seed, playerCap)` yields a deep-equal map on server and client. Map geometry never travels on the wire; only `mapSeed` does.
- **No transcendentals on the generation path.** Integer-hashed gradient noise, exact float literals, polynomial smoothstep, rational circle parametrisation. `Math.sin/cos/pow/exp/hypot` are FORBIDDEN in generation — this is what makes the ocean identical across V8 and JavaScriptCore, and it retires the open cross-engine float-determinism ledger risk rather than deepening it.
- The **rendered coastline is the collided coastline**, vertex for vertex. Contours are interior decoration: never collided, never LOS-tested.
- **Vertex count is the scarce resource** (paid per tick by LOS/collision/shells, per frame by the client radar bake). Target ~34 verts/island average; the prototype achieves 627 verts/map against ~1,500 shipped, so per-tick geometry cost must go DOWN, not up.
- All polygon math reuses `shared/src/sim/silhouette.ts`. **Do not author a second polygon library.** The one genuinely new primitive is `simplifyLoop` (Visvalingam-Whyatt — chosen over Douglas-Peucker because vertex COUNT is the constraint and VW gives a direct count dial).
- Island-geometry branching stays confined to the existing helpers (`losClear`, `islandClearance`, `blockedWater`, `earliestIsland`, `pushOutOf`, ...). Never inline edge iteration into a `visible()`/`materialize()` row in `signals.ts` — that isolation is what keeps those rows under ESLint `complexity: 10`.
- `PROTOCOL_VERSION` bumps **28 -> 29**: the same seed now builds a completely different ocean.
- Every generation tunable lives in ONE clearly-named place — Eric expects to adjust the noise by eye after landing.

**Block If:**
- Generation cost cannot be held near the measured prototype budget (38ms server / 44ms client vs 22ms shipped; 96ms was explicitly rejected because the client rebuilds the map at join) — HALT and report the real number.
- The navigability / no-lagoon / spawn-clearance / channel-width invariants cannot all hold at 2-3% coverage — HALT rather than silently relaxing one.
- Per-tick perception or collision cost REGRESSES versus shipped — HALT. The prototype says it should improve; a regression means something is wrong.

**Never:**
- Never make elevation gameplay-authoritative this cycle. Radar shadows are a FUTURE cycle; this cycle ships the coastline, the contour presentation, and the retained height data ONLY.
- Never store height only as contour polygons — the raster + max-height pyramid is the radar-shadow substrate (Eric ruling 2026-08-06).
- Never change the water disk into a polygon — the map edge stays a circle.
- Never touch the radar/`returnMarks.ts`/`radarHeatmap.ts` coast-return path beyond what the `Island` type change forces; the radar rework owns it.
- Never touch fog compositing, the storm timeline, perception's declared invariant exceptions, the XP economy, or weapon tuning.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Deterministic rebuild | Same `(seed, playerCap)`, separate processes, `--jitless` | Byte-identical polygons, poles, cores, contours, height raster | No error expected |
| Land budget | 100 seeds | Shoelace area / disc area in [0.02, 0.03] | Threshold rank-selection; HALT if unconvergeable |
| Enclosed lagoon | Field thresholds to a ring of land around water | Closure pass fills unreachable water BEFORE extraction; zero lagoons survive | Structural — cannot occur post-closure |
| Channel width | Any generated map | No navigable gap narrower than widest hull beam + margin | Closure/weld pass; validated, reroll as last resort |
| Hook island | Island whose centroid falls in its own bay | `pole` is inside the polygon; `core` measured about `pole`, > 0 | Pole-of-inaccessibility guarantees interior |
| Ship grounded in a cove | Hull at full throttle in worst concavity | Push-out to nearest boundary point; escapes under helm; never penetrates | 3-step rollback bounds penetration |
| Degenerate seed | `seed = 0` | >=1 island, all invariants hold, no crash | Floor of 1 island |
| Contour split | Elongated island, upper isoline | Band may emit MULTIPLE disjoint polygons (two peaks) — desired | Each component validated independently |
| Flat rock | Small island below the first contour threshold | Zero contours; renders as flat land | No error expected |
| Height lookup (future) | Any world point | O(1) quantized raster read; max-pyramid gives per-tile ceiling | Out-of-disc reads clamp to sea level |

</intent-contract>

## Code Map

- `tmp-fbm/` -- **the validated prototype**: `params.mjs` (tuned parameters), noise, field, closure, marching squares, `simplifyLoop`, contours, `bench.mjs`, `validate.mjs`, `determinism.mjs`. Port from here; do not re-derive.
- `shared/src/types.ts` -- `Island`: DELETE `skeleton`; ADD `pole: Vec2`; `core` now measured about `pole`. `GameMap` gains the height raster + pyramid. New `Contour { level, polys }`.
- `shared/src/sim/map.ts` -- **the rewrite**: field -> closure -> label -> trace -> simplify -> contours -> validate. Replaces the capsule budget/placement/reroll loop.
- `shared/src/sim/islandShape.ts` -- capsule/skeleton machinery **deleted**; replaced by the noise + field + extraction modules.
- `shared/src/sim/noise.ts` (NEW) -- integer-hashed gradient noise, fBm, ridged, domain warp. Zero transcendentals.
- `shared/src/sim/heightField.ts` (NEW) -- field build (coarse + coastal refinement), quantized raster, max-height pyramid, sampling API.
- `shared/src/sim/island.ts` -- the geometry seam; `nearestOnSkeleton` retired, push-out moves to nearest boundary point.
- `shared/src/sim/collision.ts` -- `pushOutOf` -> nearest-boundary-point (skeleton normal is gone). **NOTE: the grounding fix already landed here this cycle — preserve it exactly.**
- `shared/src/sim/silhouette.ts` -- reuse; gains `simplifyLoop` + `polygonFitLimit` (already added by the grounding fix).
- `shared/src/sim/shell.ts`, `aim.ts` -- broadphase then exact polygon, unchanged in shape.
- `server/src/game/signals.ts` -- `losClear` only; `core` early-out now keyed on `pole`.
- `server/src/game/spawn.ts`, `world.ts` (mine legality/clamp), `drones.ts`, `server/scripts/batchsim/pilots.ts` -- island consumers.
- `client/src/render/map.ts` -- `drawIslands` gains contour bands: each stroked in its solid scale colour, filled with the darker version. Static build at join.
- `client/src/config.ts` -- contour ramp tokens (strokes `#4A6B33`/`#7B8A3E`/`#AE9C58`/`#DCD2AC`, fills `#242f22`/`#363c29`/`#484534`/`#5b5a52`).
- `client/src/render/radarHeatmap.ts`, `returnMarks.ts` -- consume `pole`/`core`; minimum necessary change only.
- `client/src/sim/prediction.ts` -- `CollisionMap.islands` type; grounding damp already shared.
- `shared/src/index.ts` -- `PROTOCOL_VERSION` 28 -> 29; export `Island`, `Contour`.
- Tests: `shared/src/__tests__/{map,collision,shell}.test.ts`, `server/src/__tests__/{spawn,drones,perception}.test.ts`, `client/src/__tests__/{aimPreview,prediction}.test.ts` -- island fixtures move off `skeleton`.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/noise.ts` -- port integer-hashed gradient noise, fBm, ridged multifractal, two-scale domain warp from `tmp-fbm/`. Zero transcendentals; unit-test determinism.
- [ ] `shared/src/sim/heightField.ts` -- coarse field + coastal-band refinement; quantized Uint8 raster; max-height pyramid; O(1) sample + per-tile ceiling API. **The pyramid is the radar-shadow substrate (Eric ruling) — build it now even though nothing reads it yet.**
- [ ] `shared/src/sim/map.ts` -- rewrite `generateMap`: field -> lagoon closure (flood open water from the spawn ring, fill the unreached; second phase must spread only through TIGHT water or a 1-cell strait leaks the fill) -> connected-component label -> marching squares (clamp crossings off grid corners, `t` in [0.25, 0.75], or two crossings can land 0.5u apart) -> `simplifyLoop` to the per-island vertex cap -> pole/core -> contours -> validate.
- [ ] `shared/src/sim/map.ts` -- coverage by histogram rank-selection on the field to hit [0.02, 0.03] in one pass; keep `MAP_RULES` exported.
- [ ] `shared/src/types.ts` + `shared/src/index.ts` -- `Island` gains `pole`/`contours`, loses `skeleton`; `Contour` added; PV 28 -> 29.
- [ ] `shared/src/sim/silhouette.ts` -- add `simplifyLoop` (Visvalingam-Whyatt, count-driven).
- [ ] `shared/src/sim/island.ts` + `collision.ts` -- retire `nearestOnSkeleton`; `pushOutOf` pushes to the nearest boundary point. **Preserve the grounding fix (heading-aware `polygonFitLimit` clamp, land-only `contact`, `headOn` directional damp) byte-for-byte.**
- [ ] `server/src/game/signals.ts`, `spawn.ts`, `world.ts`, `drones.ts`, `scripts/batchsim/pilots.ts` -- migrate island consumers; `core` early-out keyed on `pole`.
- [ ] `client/src/render/map.ts` + `config.ts` -- draw contour bands in the ratified grammar; still one static build at join.
- [ ] `client/src/render/radarHeatmap.ts`, `returnMarks.ts`, `sim/prediction.ts`, `render/aimPreview.ts` -- minimum necessary migration off `skeleton`.
- [ ] `shared/src/__tests__/map.test.ts` -- rewrite as the invariant suite: determinism (incl. separate-process fingerprint), coverage band, channel width, zero lagoons, spawn clearance, polygon simplicity/CCW, pole-inside-polygon, vertex budget, contour containment + sibling-disjointness.
- [ ] All other test files -- port island fixtures off `skeleton`, preserving each test's original intent.
- [ ] `shared/src/__tests__/map.test.ts` -- generation-time guard and a per-tick geometry guard proving LOS/collision did not regress.
- [ ] `VERSION`, `package.json` files, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad/gds/.../gds-workflow-status.yaml` -- bump to `0.17.59` (cycle 59) and record the cycle in **both** tracker files in this same PR.
- [ ] `CLAUDE.md` + `HULLCRACKER_NOTES.md` -- record the height-field key decision, the retired star-shape invariant, and the PV bump.
- [ ] DELETE all `tmp-*/` scratch directories before the PR — they currently break `npm run lint`.

**Acceptance Criteria:**
- Given any `(seed, playerCap)`, when `generateMap` runs in separate processes and under `--jitless`, then every vertex, pole, core, contour point and height cell is byte-identical.
- Given 100 seeds, when land coverage is measured by shoelace area, then every map falls in [2%, 3%].
- Given 120 seeds, when the invariant suite runs, then zero failures across navigability, enclosed lagoons, spawn clearance, >=1 island, coverage, polygon simplicity/CCW, and pole-inside-polygon.
- Given a full production map, when per-tick LOS and ship-island collision are measured, then both are no more expensive than the shipped capsule generator.
- Given a client at `PROTOCOL_VERSION` 28, when it attempts to join, then matchmaking rejects it before a seat is reserved.
- Given the full suite, when `npm run check` runs, then lint (complexity <=10), all three type-checks, and every test pass.

## Spec Change Log

**2026-08-06 — rulings surfaced at the pre-implementation gate**, per Eric's instruction and the cycle-51 precedent.
1. **Grounding fix = boundary + directional damp.** LANDED AND VERIFIED this cycle: map-edge clamp is hull-exact per heading and no longer reports as grounding; the damp is a head-on-scaled speed CAP (not a compounding per-tick multiplier) living in `shared/` so server and client cannot diverge. Boundary press 0.083 u/s / 0.24 deg/s -> 35 u/s / 22.9 deg/s; dead-on coastal ram holds 8.95 u/s (above steerage) and clears in ~4s; grazing now costs nothing. 3221 tests pass.
2. **The playerCap framing was invalid.** `ArenaRoom.ts:252` builds `new World(seed, CONFIG.match.fillTo, ...)` with `fillTo` a CONSTANT 20, so `generateMap` is ALWAYS called at cap 20. One ocean size in production; roster never regenerates it. All roster-scaled analysis was measuring dead code.
3. **Palette = HYPSOMETRIC, all islands.** Chosen from rendered comparison on real output. The shipped `#8B7520` yellow was never a decision (DESIGN.md:41 marks island tokens *"provisional carry-over — Open Question"*). Slate-for-rocks and independent-height sea stacks DEFERRED to the living-ocean epic.
4. **Contour grammar:** each band stroked in its solid scale colour, filled with a darker, less intense version. Max 4 bands ("I don't want too many different heights").

**2026-08-06 — THE PIVOT: capsule generator replaced by an fBm height field (Eric ruling).** Eric: *"Really, its that I wanted fractal island generation. You didn't really create fractal... We could do that and then convert to a contour map."* He was right: cycle 51's generator is a parametric capsule with noise on its outline, structurally incapable of lobes, arms, hooks or bays. Three earlier workstreams are SUPERSEDED and their output discarded: (a) the coastline-sharpness levers (amplitude/roughness/vertex-count) were the wrong dial — they change bumpiness, never structure; (b) the skeleton-radial contour EROSION algorithm is unnecessary because contours are now isolines of the same field; (c) the articulated/branching-skeleton research was cancelled before dispatch. Prototype validated in `tmp-fbm/`: 38ms server / 44ms client per map, **627 verts/map vs ~1,500 shipped** (per-tick geometry gets CHEAPER), coverage 2.48%, zero invariant failures over 120 seeds, byte-identical across processes and JIT modes. Eric on seeing the renders: *"That. Looks. EXCELLENT!"*

**2026-08-06 — height storage ruled for future radar shadows (Eric).** Eric: *"I am going to use those heights in a separate future pass so that islands create a realistic radar shadow... however this gets stored we should make sure that we will be able to run that math as cheaply as possible."* RULING: the authoritative height data is the **quantized raster plus a max-height pyramid**, NOT the contour polygons. Radar shadowing is a ray march asking whether terrain rises above the sightline — O(1) per step against a grid, versus point-in-polygon per band per sample against contours. The pyramid lets a ray skip an entire empty tile in one test, so open water costs almost nothing. ~118KB at 14u cells, never on the wire (both sides build it from the seed). Contours remain a RENDERING artifact only. Build the pyramid this cycle even though nothing reads it yet — retrofitting the storage later is the expensive path.

**2026-08-06 — the star-shape invariant is RETIRED.** Cycle 51 made every island star-shaped about its skeleton, which structurally guaranteed no intra-island lagoons and a always-valid push-out direction. A thresholded noise field has arbitrary topology, so both guarantees move: lagoons are eliminated by a generation-time closure pass (flood open water from the spawn ring; fill whatever it cannot reach), and push-out becomes nearest-boundary-point (measured 11 escape failures in 260,637 trials at 0.5-6u depth = 0.004%, with max real penetration 2.25u and the 3-step rollback making a bad direction non-fatal). Scope note established during planning: the invariant only ever constrained LAND — a bay is open water and push-out never acts there, so concave coastline that opens to the sea was always legal. `skeleton` is deleted from `Island`; `pole` (pole of inaccessibility) replaces it and `core` is measured about the pole, because on a hook the centroid falls in its own bay and the shipped `core` would be 0 on exactly the islands whose LOS early-out matters most.

## Review Triage Log

## Design Notes

**Why the height field is cheaper, not more expensive.** The intuition says "more interesting coastline = more geometry", and it is backwards here. The capsule generator sampled a FIXED N points per island regardless of how much shape there was to describe, then displaced them. The field generator traces the coastline that exists and then simplifies to a per-island budget proportional to perimeter — a rock gets 8 vertices, a 700u landmass gets 92. Result: 627 verts/map against ~1,500 shipped, for far more structure. This is what makes the radar-bake ceiling (which killed the sharpest capsule option at p99 81% of a 60fps frame) stop being a constraint.

**Three economies got generation under budget.** Permutation-table Perlin (17.1ns vs 31.7ns per sample); coarse-grid evaluation of the low-frequency warp and region terms; and the decisive one — the whole field at half resolution, then true full-resolution samples only in a band around the isolines actually extracted. That took the field stage 56ms -> 22ms with visually indistinguishable output.

**The two subtle correctness traps, both found by rendering rather than by tests.** (1) The lagoon closure must spread only through TIGHT water in its second phase; spreading through any water lets a one-cell strait leak the fill into a landlocked bay, which made the closure a no-op and left 28% of maps failing. (2) Marching-squares crossings must be clamped away from grid CORNERS (`t` in [0.25, 0.75]) — two crossings on the edges meeting at a corner can otherwise land 0.5u apart, which is what sets the minimum local feature size (measured 4.8u) that makes nearest-boundary push-out safe.

**Composition that produced the approved look** (`tmp-fbm/params.mjs`): warped fBm lobes 0.76 (lambda 820, 5 octaves, **persistence 0.68** — the shape lever; 0.5 gives smooth blobs, 0.68 carves arms and bays) + ridged multifractal 0.24 (lambda 1100) + coastal detail 0.11 (lambda 250) + region term 0.05 (lambda 2400), over a two-scale domain warp (lambda 1500 x 240u, lambda 420 x 140u). Cell size 14u is the single cost/quality dial, cost O(1/cell^2).

**Known open item, deliberately not fixed:** islands CLUSTER — some oceans have a busy quarter and a nearly empty one. Natural noise behaviour, shown to Eric, and a parameter rather than an architecture decision. Leave as-is unless he rules otherwise.

## Verification

**Commands:**
- `npm run check` -- expected: lint (complexity <=10) + three type-checks + full suite green. NOTE: `tmp-*/` scratch dirs currently fail lint and MUST be deleted first.
- `npm test -w shared` -- expected: map invariant suite green across >=100 seeds, incl. determinism fingerprint, coverage band, vertex budget, contour containment.
- `npm test -w server` -- expected: perception invariants, spawn clearance, drone steering green.
- `npm test -w client` -- expected: prediction/server island parity, aim-preview clipping, grounding-damp parity green.
- `npm run build` -- expected: shared -> client -> server clean.
- `node tmp-fbm/determinism.mjs` (before deleting scratch) -- expected: identical SHA-256 across processes and JIT modes.

**Manual checks:**
- Join a live match: coastlines read as real islands with bays and headlands; contour bands read as elevation in the hypsometric grammar; ocean dominates the view at 2-3% land.
- Drive a battleship hard into the map edge and into a coastline: neither produces a speed collapse that removes helm authority.
