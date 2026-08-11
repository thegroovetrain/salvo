---
stepsCompleted: [1, 2, 3, 4, 5, 6]
inputDocuments: []
workflowType: 'research'
lastStep: 6
research_type: 'technical'
research_topic: 'Realistic Ocean Currents in Hullcracker'
research_goals: 'Determine whether a physically-grounded ocean current field is feasible and affordable inside Hullcracker''s deterministic 20Hz shared simulation with client prediction, and what gameplay it buys — delivered as an implementation-ready blueprint covering ship drift, torpedo/mine deflection, radar wake advection and water render, and storm/zone interaction.'
user_name: 'Eric'
date: '2026-08-11'
web_research_enabled: true
source_verification: true
---

# Research Report: technical

**Date:** 2026-08-11
**Author:** Eric
**Research Type:** technical

---

## Research Overview

This report answers three questions Eric asked about ocean currents in Hullcracker: **is it feasible**, **what does it cost**, and **what gameplay does it buy**. It is scoped as an implementation-ready blueprint, covering four affected systems — ship drift, torpedo/mine deflection, radar-wake advection and water render, and storm/zone coupling.

The report combines current public sources (cited inline) with **direct measurement against Hullcracker's own code**. Where a cost number appears, it was benchmarked on this machine using the project's actual `shared/src/sim/noise.ts` primitives, not estimated. The benchmark harness validated itself against the project's own recorded figure: `noise.ts` documents perlin at 17.1 ns/sample; the harness measured 16.81 ns on identical code (−1.7%).

**Confidence conventions used throughout:**

- **[HIGH]** — verified by direct measurement in this repo, or by multiple independent published sources.
- **[MEDIUM]** — single authoritative source, or measured but extrapolated to an unmeasured configuration.
- **[LOW]** — inference from adjacent evidence; flagged where a design decision would depend on it.

**Standing constraint on this report:** currents that affect ship movement are a *gameplay mechanic*. Per project rule, this report presents options, costs and consequences with recommendations — it does not decide the mechanic. Every gameplay call is deferred to Eric at synthesis.

**Headline result, in one line:** a boundary-respecting, divergence-free current field costs **2.2 µs/tick and 64 KB/room** — two orders of magnitude under shipped features — and at *physically honest* strengths it throws a torpedo 11–27 u off over a long run while being only 4–6% of hull top speed. **See the [Research Synthesis](#research-synthesis-the-ocean-was-always-going-to-be-cheap--the-question-is-what-you-do-with-it) at the end of this document for the full executive summary, the phased roadmap, and the open questions left for Eric.**

---

## Technical Research Scope Confirmation

**Research Topic:** Realistic Ocean Currents in Hullcracker

**Research Goals:** Determine whether a physically-grounded ocean current field is feasible and affordable inside Hullcracker's deterministic 20Hz shared simulation with client prediction, and what gameplay it buys — as an implementation-ready blueprint covering ship drift, torpedo/mine deflection, radar wake advection and water render, and storm/zone interaction.

**Technical Research Scope:**

- Architecture Analysis — current-model landscape scored against deterministic shared-sim constraints
- Implementation Approaches — steady vs time-varying, analytic vs baked, boundary handling
- Technology Stack — numerical methods, field representation, browser runtime
- Integration Patterns — the `stepShip`/prediction seam, wire impact, perception impact
- Performance Considerations — measured per-sample and per-tick cost against the 50ms budget

**Research Methodology:**

- Current web data with rigorous source verification
- Multi-source validation for critical technical claims
- Confidence level framework for uncertain information
- Direct benchmarking against the project's own primitives

**Scope Confirmed:** 2026-08-11

---

## Technology Stack Analysis

### Numerical Methods — the Real "Language" Layer

For a browser game the meaningful stack is not languages (TypeScript is fixed) but **which numerical model generates the flow**. Four families are viable, and they differ by orders of magnitude in cost and in whether they can survive a deterministic shared sim.

**1. Curl noise (procedural, divergence-free) — the leading candidate.** Bridson, Hourihan and Nordenstam's SIGGRAPH 2007 method constructs velocity as the curl of a noise potential. The critical property: the curl of a smooth potential is *automatically* divergence-free, so the field is incompressible with no globally coupled linear system and no discretization — it can be "cheaply and repeatedly evaluated anywhere in space and time." In 3D the potential is vector-valued; **in 2D it collapses to a single scalar field** — the classical *stream function*, whose isocontours are the streamlines of the flow, giving `v(x,y) = (∂ψ/∂y, −∂ψ/∂x)`. Hullcracker is 2D, so it gets the cheapest case of the method. Derivatives are taken by simple finite differences.
_Source: [Bridson et al., Curl-Noise for Procedural Fluid Flow, SIGGRAPH 2007](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf) · [ACM TOG](https://dl.acm.org/doi/10.1145/1276377.1276435)_ **[HIGH]**

**2. Shallow-water equations (SWE).** Navier-Stokes reduced to 2D by dimensional reduction; the standard real-time water model in games, achieving real-time performance at the cost of 3D effects like breaking waves, and typically run on the GPU in ~three passes per timestep with pixel shaders. Fluid Flux in Unreal Engine 5 was validated against a real-scale river experiment, confirming that simplified SWE reproduces real flow patterns.
_Source: [Fast Water Simulation Methods for Games](https://www.researchgate.net/publication/322092770_Fast_Water_Simulation_Methods_for_Games) · [Shallow water equations in real-time computer graphics (Abertay)](https://rke.abertay.ac.uk/en/studentTheses/shallow-water-equations-in-real-time-computer-graphics/) · [Digital Twin of River Infrastructure, MDPI 2026](https://www.mdpi.com/2076-3417/15/23/12507)_ **[HIGH]**

**3. Analytic potential flow (superposition of primitives).** Uniform flow + doublets gives exact flow around a circular obstacle: `ψ = U₀ r sinθ (1 − a²/r²)`. Attractive because it is closed-form and physically exact for the inviscid case, and Hullcracker already carries a bounding circle per island. The blocking limitation for this project: for **multiple** circular obstacles, solving Laplace's equation with multiple boundary conditions "is analytically impossible in general cases" — remedies are conformal mapping or the method of image doublets, which grow badly with ~18 islands per map.
_Source: [Potential flow around a circular cylinder (Wikipedia)](https://en.wikipedia.org/wiki/Potential_flow_around_a_circular_cylinder) · [Stirring by multi-cylinder in potential flow, arXiv](https://arxiv.org/pdf/1411.4361) · [Oxford A10, Two-dimensional incompressible irrotational flow](https://courses.maths.ox.ac.uk/pluginfile.php/22368/mod_resource/content/1/A10chapter2.pdf)_ **[HIGH]**

**4. Physical oceanography models (Ekman / geostrophic).** The real-world sources of ocean currents: geostrophic currents arise where the pressure-gradient force balances the Coriolis force, flowing parallel to isobars; Ekman's wind-driven theory balances wind stress against Coriolis acceleration, producing the spiral where each deeper layer moves further right and slower. Most relevant to Hullcracker: **flow direction is shaped by geological features including island arcs, and underwater topography in straits between islands measurably enhances flow velocity.** That is the physical justification for currents that accelerate through channels — the single most gameplay-relevant real effect available.
_Source: [Ocean current — Geostrophic (Britannica)](https://www.britannica.com/science/ocean-current/Geostrophic-currents) · [Wind-Driven Current (ScienceDirect)](https://www.sciencedirect.com/topics/earth-and-planetary-sciences/wind-driven-current) · [Marine current power (Wikipedia)](https://en.wikipedia.org/wiki/Marine_current_power) · [Ocean Gyres and Geostrophic Flow](https://scienceprimer.com/ocean-gyres-and-geostrophic-flow)_ **[HIGH]**

_Language Evolution:_ the trend in graphics is away from full simulation toward procedural fields for anything not requiring true interaction — Bridson's stated motivation is that simulation is "frustratingly slow and unwieldy to direct" where procedural methods are fast and controllable. **[HIGH]**
_Performance Characteristics:_ measured below; curl noise is 3 noise evaluations per velocity sample with forward differences.

### Development Frameworks and Libraries

**The finding that dominates this section: Hullcracker does not need a new library.** Every primitive curl noise requires is already in the repo, shipped, tested, and paid for.

| Curl-noise requirement | Already present in Hullcracker | Location |
|---|---|---|
| Gradient noise, IEEE-exact | `perlin()`, `fbm()`, `ridged()` | `shared/src/sim/noise.ts` |
| Smooth quintic interpolant | `fade()` — same polynomial family as Bridson's ramp | `shared/src/sim/noise.ts:58` |
| Distance to nearest solid boundary `d(x)` | `islandDistance()` — signed, broadphase-gated | `shared/src/sim/island.ts:71` |
| Nearest boundary point | `closestPointOnPolygon()` / `coastNormal()` | `shared/src/sim/silhouette.ts:193`, `island.ts:98` |
| Bathymetry for depth-driven flow | `sampleHeight()` — O(1) raster read | `shared/src/sim/heightField.ts:797` |
| Generation-time bake pattern | `buildHeightRaster()` + pyramid | `shared/src/sim/heightField.ts:771` |
| Seeded determinism, never on the wire | map rebuild from `welcome.mapSeed` | `client/src/net/connection.ts` |

Bridson's boundary constraint is `ψ_constrained(x) = ramp(d(x)/d₀) · ψ(x)`, where the ramp (eq. 4) is `(15/8)r − (10/8)r³ + (3/8)r⁵` for |r|<1. **That is a quintic polynomial — zero transcendentals** — which means the entire boundary-respecting construction is compatible with the project's cross-engine determinism rule *as written*, with no approximation or substitution. This is an unusually clean fit. **[HIGH]**

_Ecosystem Maturity:_ curl noise is 18 years old, widely reimplemented (Unity graphics literature, R's `ambient` package, numerous engine ports), and has a recent boundary-improvement follow-up — Differentiable Curl-Noise (ACM 2023) addresses discontinuities in boundary handling, relevant if sharp coastline features produce artifacts.
_Source: [Curl Noise — Unity Graphics Programming](https://freder.github.io/UnityGraphicsProgrammingBook1/html-translated/vol2/Chapter%206%20_%20Curl%20Noise-Explanation%20of%20Noise%20Algorithms%20for%20Pseudo-Fluids.html) · [Differentiable Curl-Noise, ACM CGIT 2023](https://dl.acm.org/doi/10.1145/3585511) · [R ambient::curl_noise](https://search.r-project.org/CRAN/refmans/ambient/html/curl_noise.html)_ **[HIGH]**

### Field Representation and Storage

The storage question for a current field is the direct analogue of the decision already ratified for terrain: **the authoritative data is a raster, and polygons/contours are a rendering artifact**. Three representations:

| Representation | Per-sample cost (measured) | Memory | Notes |
|---|---|---|---|
| **Analytic** (evaluate curl noise on demand) | 291.7 ns (4 oct, no boundary) / 914.6 ns (+ coast distance) | 0 | Infinite resolution; cost scales with octaves and island count |
| **Baked raster** (Float32 vx/vy lattice, bilinear) | **26.3 ns** | 128 KB @128² · 512 KB @256² · 2 MB @512² | Cost independent of octaves *and* island count |
| Hybrid (baked base + analytic local detail) | ~50–300 ns | as above | Only if a moving/time-varying local term is wanted |

Bake cost, one-off at map generation (measured): **4.2 ms @128², 15.7 ms @256², 67.4 ms @512²**. For reference the map disc is ~2400u radius (4800u across), so a 256² lattice is an 18.8u cell — finer than the 14u height raster's neighbourhood and far finer than any ship. **[HIGH]**

The baked raster is ~35× cheaper per sample than the analytic form with boundaries, and — critically — its cost does not grow with island count, whereas the analytic form's boundary term is O(islands near the sample). Precedent strongly favours the bake: the height raster is already built every generation, never travels the wire, and both sides rebuild it from the seed.

### Development Tools, Determinism Tooling and Measurement

**The determinism finding that decides the architecture.** Published sources confirm the hazard the project already codified: V8, JavaScriptCore and SpiderMonkey can return different results for the same input on transcendental functions, because IEEE 754 does not pin them down; basic floating-point operations are otherwise reliably deterministic in practice.
_Source: [Making JS deterministic for fun and glory (Rune)](https://developers.rune.ai/blog/making-js-deterministic-for-fun-and-glory) · [Floating Point Determinism (Gaffer On Games)](https://gafferongames.com/post/floating_point_determinism/) · [Is JavaScript floating-point math deterministic? (GameDev.net)](https://www.gamedev.net/forums/topic/609592-is-javascript-floating-point-math-deterministic/)_ **[HIGH]**

But a repo audit surfaces a distinction that is **not** currently written down anywhere in the project docs, and that determines which current designs are legal:

> **The zero-transcendental rule is a *generation-path* rule, not a *runtime* rule.**
> `shared/src/sim/ship.ts:72-73` — `stepShip` calls `Math.cos`/`Math.sin` **every tick, on both sides**, and has since the beginning. `collision.ts`, `aim.ts`, `zone.ts` and `silhouette.ts` all use transcendentals at runtime. Only `noise.ts` and the generation primitives beneath it are transcendental-free, and `silhouette.ts:186` states the reason explicitly: `closestPointOnPolygon` uses `Math.sqrt` rather than `Math.hypot` because it "sits on the map GENERATION path, where cross-engine byte-determinism is absolute."

The underlying principle is reconciliation coverage. Runtime kinematics divergence is corrected by the server every frame through reconcile-and-replay, so a 1-ulp `cos` difference self-heals. Generated geometry is *never transmitted* — islands rebuild from the seed on both sides — so a 1-ulp difference there is permanent and unbounded. **This yields a hard, checkable rule for current work: an analytically-sampled runtime field may use transcendentals at the same level `stepShip` already does; a generation-time baked field may not.** Note that `islandDistance()` (`island.ts:72`) uses `Math.hypot` in its broadphase, so a bake path must call `closestPointOnPolygon` directly or use a hypot-free variant. **[HIGH]**

_Testing Frameworks:_ the project's existing property-style invariant tests are the natural home for current-field pins (field agrees across a rebuild from the same seed; flow is tangent at coastlines; no cell exceeds a max drift). Vitest 2.x for shared/server, 4.x for client.
_Measurement:_ `process.hrtime.bigint()` harness as used for this report; the project has prior art in per-tick µs budgeting (radar shadows, wakes).

### Runtime Platform: Browser CPU, GPU, and the 20Hz Tick

**Server (CPU, authoritative, 50ms budget).** Node v22, single fixed tick. Currents must be sampled on the CPU here because they affect authoritative motion. Measured cost is negligible (below).

**Client (CPU prediction + GPU render).** Prediction must sample the identical field on the CPU. *Rendering* surface flow is a different problem and the GPU is well-suited: WebGL flow-field visualization advects thousands of Lagrangian particles entirely on the GPU at high frame rates even on mobile, with propagation and visualization both GPU-side and little CPU assistance; a standard optimization is to solve the field at lower resolution and subsample.
_Source: [Fluid Simulation in WebGL: The Advection Step](https://ostefani.dev/tech-notes/webgl-fluid-advection) · [Visualize and animate flow with a custom WebGL layer (Esri)](https://www.esri.com/arcgis-blog/products/js-api-arcgis/developers/visualize-and-animate-flow-in-mapview-with-a-custom-webgl-layer) · [webgl-streamline-visualizer (Deltares)](https://github.com/Deltares/webgl-streamline-visualizer) · [A Guide to Particle Advection Performance, arXiv](https://arxiv.org/pdf/2201.08440)_ **[HIGH]**

**Measured per-tick cost at realistic entity counts** (20 hulls + 12 torpedoes in flight + 20 wake head samples = 52 samples/tick):

| Approach | µs/tick | % of 50 ms budget |
|---|---|---|
| Analytic curl, 4 oct, no boundary | 15.17 | 0.030% |
| Analytic curl, 4 oct + boundary distance | 47.56 | 0.095% |
| Baked raster, bilinear | **1.37** | **0.003%** |

_Benchmark: node v22.19.0 x64, 2M iterations/case after 50k warmup, using `noise.ts` primitives verbatim._ **[HIGH]**

For calibration against shipped features: radar shadows measured ~278 µs/tick adversarial, and radar wakes added ~425–470 µs/tick (0.9% of the tick). **A current field is roughly 10–300× cheaper than the wake system already in production.** Raw sampling cost is not the constraint on this feature and should not be treated as one.

### Adoption Trends: What Shipping Naval Games Actually Do

Prior art here is thin, and the gap is itself a finding. Sea of Thieves — the most-played modern sailing game, with genuinely deep sailing systems (sail raising/angling, helm, anchor, bailing, repair) — **has no ocean currents**; it has consistent wave patterns that always run south-easterly regardless of wind. Currents appear repeatedly as a *community content request*, with players proposing drift onto rocks and beaches, and drift as a source of movement while becalmed.
_Source: [Sea of Thieves forums — Ocean Currents](https://www.seaofthieves.com/community/forums/topic/71033/ocean-currents) · [Sea of Thieves forums — Fixed Sea Currents suggestion](https://www.seaofthieves.com/community/forums/topic/121502/content-suggestion-fixed-sea-currents) · [Sea of Thieves gameplay overview](https://www.playseaofthieves.com/sea_of_thieves_gameplay/)_ **[MEDIUM]** — forum posts evidence demand, not design validation.

_Migration Patterns:_ the wider trend is environmental forces as *readable, fixed* features rather than chaotic simulation — Sea of Thieves' invariant south-easterly waves are a deliberate legibility choice of exactly the kind Hullcracker made when it cut the physically-honest 12 s wake to 5.5 s for readability.
_Emerging:_ divergence-free field construction is an active research area beyond graphics — Gaussian-process and neural-operator methods now model real ocean currents with Helmholtz/divergence-free structure, confirming that the divergence-free constraint is the physically correct one for surface currents.
_Source: [Gaussian processes at the Helm(holtz), arXiv](https://arxiv.org/pdf/2302.10364) · [Project and Generate: Divergence-Free Neural Operators, arXiv](https://arxiv.org/pdf/2603.24500)_ **[MEDIUM]**

**Cross-technology synthesis:** the four model families converge on one recommendation for this project. SWE is GPU-oriented and stateful (hostile to a deterministic 50 ms CPU tick and to reconciliation); analytic potential flow does not survive ~18 islands; physical oceanography supplies *justification* (channel acceleration, topographic steering) rather than an implementation; and curl noise supplies an implementation that is divergence-free by construction, evaluable at any point, boundary-respecting via a polynomial ramp, and buildable entirely from primitives already in the repo. **Research gap identified:** no source measures curl noise inside a rollback/reconciliation netcode loop — the prediction interaction is analysed from first principles in Step 3 and is the genuine risk area, not cost.

---

## Integration Patterns Analysis

The generic integration vocabulary (REST, message brokers, service mesh) does not apply to a single-process fixed-tick simulation. The equivalent questions for this project, and the ones analysed here, are: **where does drift enter the sim**, **how does it survive prediction**, **what does it cost the wire**, **how does it interact with the four affected systems**, and **what does it do to the perception/anti-cheat boundary** — which is this project's real security architecture.

### The `stepShip` Seam — Where Drift Enters

`stepShip` (`shared/src/sim/ship.ts:62`) is a pure, allocation-free function of `(ShipState, ShipInput, ShipConfig, dt)`. Drift is a **positional displacement**, not a kinematics modifier, which separates it cleanly from the existing modifier chain. The project already pins a composition order for kinematics modifiers — `boostedKinematics → slowedKinematics → hookKinematics` (`shared/src/sim/slow.ts` header) — and current does *not* belong in it: those functions transform a `ShipConfig` (max speed, turn rate), whereas current adds a velocity to the water itself.

Two integration options:

**Option A — fold into `stepShip`.** Add an optional current vector parameter; the integration becomes `x += (cos(h)·speed + vx)·dt`. One site, guaranteed identical on both sides, and it composes with the existing modifier chain without touching it.
**Option B — a separate `applyCurrentDrift` step** between `stepShips` and `resolveCollisions` in the world step order, mirrored in the client's `localTick`/`replayFrom`.

Option A is the better fit for the project's stated invariant that both sides run the *same* shared function; Option B risks the two sides drifting apart in step order, which is exactly the failure the shared-sim rule exists to prevent. **[MEDIUM]** — an architecture judgement, not a measured result.

**The step-order position is load-bearing and has a directly applicable precedent.** Wake sampling is deliberately placed *after* `resolveCollisions` because "a wake sample must record the RESOLVED pose (water where the hull actually is), never a rolled-back candidate inside land" (`server/src/game/world.ts:1562-1566`). Current drift must be applied **before** `resolveCollisions`, so that a current pushing a hull toward a coast is resolved by the existing grounding machinery rather than teleporting a hull into land. Since `resolveShipPose` already returns `{contact, headOn}` and the head-on-scaled speed cap is stateless and shared (`applyGroundingDamp` in `shared/`), drift-into-coast is handled by machinery that already exists. **[HIGH]**

### Prediction and Reconciliation Integration

**This is the genuine risk area, and the codebase has already solved the hard version of it.**

Published sources establish the general hazard: fixed timestep is necessary but not sufficient for determinism, floats diverge across machines, and divergence is intrinsic to prediction-based netcode — though under normal latency it stays imperceptible, and prediction horizons beyond ~100–150 ms become unplayable from mispredicted input.
_Source: [Netcode Architectures Part 2: Rollback (SnapNet)](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/) · [Formalizing Rollback Netcodes, OPODIS 2025 (LIPIcs)](https://drops.dagstuhl.de/storage/00lipics/lipics-vol361-opodis2025/LIPIcs.OPODIS.2025.11/LIPIcs.OPODIS.2025.11.pdf) · [Client-side prediction (Wikipedia)](https://en.wikipedia.org/wiki/Client-side_prediction)_ **[HIGH]**

Hullcracker's reconciliation (`client/src/sim/prediction.ts:1-28`) drops acked inputs, replays pending ones from the server's authoritative `you` kinematics, and folds error with three bands: `< 0.01u` ignore, `> 3 ship lengths` hard snap, otherwise adopt and decay a render-only `visualError` at `exp(-12·dt)`.

Two cases, with sharply different costs:

**A steady (time-invariant) field is free.** The field is a pure function of position, `v = f(x, y)`, identical on both sides because both rebuild it from `mapSeed`. Replay from the authoritative pose therefore reproduces the drift exactly. This is architecturally identical to the `cos`/`sin` already in `stepShip` — no new class of divergence is introduced, and ulp-level differences self-heal through the existing reconcile every frame. **[HIGH]**

**A time-varying field is affordable because the pattern already exists.** `v = f(x, y, t)` requires each replayed tick to evaluate at *its own* recorded server time, not at "now". The project already does exactly this twice: each pending input "records its own server-time estimate + actSeq, so replays re-make the exact boost decisions the original ticks made", and the prop-fouling slow gates on whether "a tick's OWN recorded server-time estimate is inside the last frame's window ... which makes `localTick` and `replayFrom` agree by construction." A time-varying current follows that precedent verbatim: sample at the tick's recorded time. **[HIGH]**

**The failure mode to avoid, stated precisely:** sampling a time-varying field at wall-clock "now" during replay. Every replayed tick would then evaluate a *different* field than the original tick did, producing a systematic (not ulp-level) divergence that grows with the number of pending inputs — i.e. with latency. This is the one design error that would make currents feel broken under lag while looking fine on localhost.

### Wire Contract and Data Formats

**Expected wire cost: zero.** The field is generated from `mapSeed`, which the client already receives in `welcome` and already uses to rebuild islands and the height raster deterministically. Islands never travel on the wire; a current field built from the same seed inherits that property exactly. No new frame fields, no schema additions, and — critically — **no `PROTOCOL_VERSION` bump** for the field itself. **[HIGH]**

Two carve-outs where wire cost could appear, both avoidable:

1. **A server-rolled current seed.** If currents should not be derivable from the client-known map seed (the way storm rings use a server-private nonce), the field's seed must reach clients via `ArenaState` — small, identity-only, but a wire change. Only needed if hiding the field is a design goal; for a *visible* current the map seed suffices.
2. **Wake advection.** Wake segments are server-owned world state (`wk` registry row). If the server advects them, the geometry it sends already reflects the current and nothing changes. If the *client* is expected to advect them locally, it must hold the same field — which it does, from the seed.

_Data formats:_ the field is a `Float32Array` pair (vx, vy) if baked, or nothing at all if analytic. Both are internal representations, never serialized. This mirrors the height raster's ratified position: "~118 KB, never on the wire — both sides rebuild it from the seed."

### Cross-System Interoperability — the Four Affected Systems

| System | Integration point | Prediction risk | Notes |
|---|---|---|---|
| **Ship drift** | `stepShip` + before `resolveCollisions` | Real but solved (above) | The only client-predicted consumer |
| **Torpedoes / mines** | `stepShells`, `creepMines` in world step | **None** | Verified: the client contains no `stepShell` — projectiles are server-authoritative and materialize at the sight boundary. Ordnance drift cannot desync. |
| **Radar wakes** | `sampleWakes` (server) + client ribbon render | None (server-owned) | Advection question analysed below |
| **Storm / zone** | `applyStorm`, `zoneLiveState` | None | Zone geometry already reaches clients via `ArenaState` |

**The aim-preview consequence is the sharpest integration risk, and it is a UX problem rather than a technical one.** Torpedoes deflected by current means `shared/src/sim/aim.ts` (`torpedoSpawn`, `burstPointAlong`, the client's aim preview) would show a straight line the fish does not follow. Either the preview integrates the drift along the flight path — turning a straight-line preview into a curved one, which is a visible, learnable skill expression — or the player is systematically lied to at exactly the moment precision matters. This is a design decision, flagged for Eric, not resolved here. **[HIGH]** that the problem exists; the resolution is a gameplay call.

**Wake advection has a specific numerical answer.** Advecting wake samples with the flow is physically correct — foam sits *in* the water and moves with it. The relevant scheme is semi-Lagrangian, which is "unconditionally stable and free from restrictions of the CFL condition," permitting timesteps three to six times the Eulerian CFL limit. The practical bound is a Lipschitz condition on shear (trajectories must not intersect), and error is minimized at an intermediate CFL rather than at the smallest step.
_Source: [Semi-Lagrangian Advection, UCD lecture notes](https://maths.ucd.ie/~plynch/LECTURE-NOTES/NWP-2004/NWP-CH03-2-6.pdf) · [The semi-Lagrangian technique in atmospheric modelling (ECMWF)](https://www.ecmwf.int/sites/default/files/elibrary/2014/9054-semi-lagrangian-technique-atmospheric-modelling-current-status-and-future-challenges.pdf) · [Semi-Lagrangian Advection on a Gaussian Grid, Mon. Wea. Rev. 1987](https://journals.ametsoc.org/view/journals/mwre/115/2/1520-0493_1987_115_0608_slaoag_2_0_co_2.xml)_ **[HIGH]**

At a 50 ms tick with currents in the plausible 1–5 u/s range, per-tick displacement is 0.05–0.25 u against a 12 u wake sample spacing — a CFL number of roughly 0.004–0.02, far inside any stability bound. Wake advection is numerically trivial here; the cost is that a wake ribbon's stored points become *mutable* (each sample's position must be updated every tick) rather than write-once, which changes the ribbon from an append-only ring into a per-tick-updated buffer. At the measured capacity that is ~20 hulls × tens of samples × one field lookup — still microseconds, but it is a real change to `wake.ts`'s data discipline. **[MEDIUM]** — extrapolated from measured per-sample cost, not benchmarked end-to-end.

### Perception and Anti-Cheat Integration

Hullcracker's security architecture is the perception boundary, and currents interact with it in a way that is unusually benign: **a current field carries no information about any player.** It is a property of the map, derivable by every client from a seed they already hold, exactly like island geometry.

This means currents are **not** a candidate seventh declared exception to the master perception invariant — the count stays at six (`sp`, `hc`, `mz`, `sunk`, `sm`, `fh`). The project's own precedent is directly on point: the Bounty ruling established that publishing something every client could already derive is a *reconciliation*, not a widening. A seed-derived field is the same argument in a stronger form, since the client must compute it anyway to predict its own hull.

One genuine caution: if wake advection is done **server-side** and the advected geometry is sent, nothing changes. But a hypothetical "current strength" readout on the HUD derived from *another ship's* observed drift would be a new inference channel — a client watching a contact drift could infer local flow. Since the flow is public, this leaks nothing. **[HIGH]**

### Event-Driven Integration: Storm / Zone Coupling

The zone timeline is already an event-driven system with reveal beats, and it already carries server-rolled, reveal-gated geometry through `ArenaState`. Coupling currents to it is therefore an integration with an existing event stream rather than a new mechanism. Three coupling shapes are available, in increasing wire cost:

1. **Purely geometric** — flow speed scales with proximity to the live ring, computed client-side from ring geometry it already has. Zero wire cost, zero new events.
2. **Phase-keyed** — flow intensity is a function of `zonePhase`, which clients already receive. Zero wire cost.
3. **Independently rolled** — a storm-driven flow with its own server-private roll, requiring the reveal-gated disclosure pattern the rings already use. Wire cost: one seed or intensity value on `ArenaState`.

Design literature supports keeping any escalation *telegraphed*: hazard design signals threats through changes in colour, motion and intensity, and a well-telegraphed hazard "can turn a simple hazard into a deeply rewarding game of cat and mouse", while poor telegraphing leaves players feeling blindsided.
_Source: [Telegraphing Danger (Kate Plays)](https://kateplays.substack.com/p/telegraphing-danger) · [Environmental Hazards (Meegle)](https://www.meegle.com/en_us/topics/game-design/environmental-hazards) · [The Art of Environmental Effects (RMCAD)](https://www.rmcad.edu/blog/the-art-of-environmental-effects-bringing-game-worlds-to-life/)_ **[MEDIUM]**

**Cross-integration synthesis:** the integration surface is far smaller than the feature's conceptual weight suggests. Exactly one consumer (own-ship drift) touches prediction, and its hard case has a verbatim precedent in shipped code. Everything else — ordnance, wakes, storm — is server-authoritative or client-render-only. The wire is untouched and `PROTOCOL_VERSION` need not move. The one integration issue with no existing answer is the **aim preview**, which is a design decision about whether the player is shown the curve.

---

## Architectural Patterns and Design

### System Architecture Patterns — Three Candidates

General architecture literature confirms the pattern this project already follows: fixed timesteps ensure deterministic physics and networking by decoupling simulation from rendering, and systems written as pure functions over component data are what make that determinism and parallelization possible. Overwatch 2's server runs 60 Hz with deterministic physics over thousands of entities — Hullcracker's 20 Hz tick with far fewer entities is a comfortable regime by comparison.
_Source: [Data-Oriented Design for Games: Complete ECS Architecture Guide](https://generalistprogrammer.com/tutorials/data-oriented-design-games-complete-architecture-guide) · [Architecting a Game Loop in C#](https://developersvoice.com/blog/csharp/architecting-real-time-simulation-loops-in-csharp/) · [Building a Game Loop: Architecture, Internals, and Best Practices](https://www.codingpancake.com/2026/07/building-game-loop-architecture.html)_ **[MEDIUM]**

Three architectures are viable for the current field. All three keep `shared/` pure and all three keep the field off the wire.

**Architecture 1 — Analytic runtime field (no storage).**
`currentAt(x, y, islands) → {vx, vy}`, evaluated on demand as curl noise with Bridson's boundary ramp.
_Pros:_ zero memory, infinite resolution, no bake step, trivially supports time variation.
_Cons:_ 914.6 ns/sample measured with a one-island boundary term; cost grows with the number of islands near the sample point, and the boundary term needs a broadphase of its own. Cannot amortize.
_Verdict:_ viable (47.6 µs/tick measured), but pays repeatedly for work whose inputs never change within a match.

**Architecture 2 — Generation-time baked raster (recommended).**
Build a `Float32Array` vx/vy lattice during `generateMap`, sample with bilinear interpolation.
_Pros:_ **26.3 ns/sample measured** — 35× cheaper than analytic-with-boundary, and the cost is independent of both octave count and island count, so arbitrarily expensive physics can be baked in for free at runtime. Bake measured at 15.7 ms for 256² (512 KB). Directly mirrors the ratified height-raster architecture.
_Cons:_ resolution fixed at bake time; time variation requires either multiple frames or a runtime modulation term; the bake path must obey the strict zero-transcendental rule.
_Verdict:_ best fit. It converts "how expensive is the physics" from a per-tick question into a one-off generation question, which is precisely the trade the height field already made.

**Architecture 3 — Hybrid (baked base + analytic modulation).**
Bake the boundary-respecting, terrain-driven base flow; apply a cheap analytic time-varying term at runtime.
_Pros:_ steady structure is free; slow evolution possible without storing frames.
_Cons:_ two derivation paths for one quantity — the exact class of duplication `effectiveStats()` exists to forbid. If pursued, both sides must call one shared composition function, never compose ad hoc.
_Verdict:_ only if time variation is a confirmed design requirement.

**A fourth possibility deserves explicit rejection.** A stateful fluid solver (SWE) stepped each tick would make the field part of simulation state that must be saved, restored and replayed on every reconciliation. The project's prediction model replays pending inputs from the server's authoritative kinematics — it does not snapshot and restore world state. Introducing a stateful field would require exactly that machinery, for a feature whose stateless form costs 1.37 µs/tick. **Rejected on architecture, not on cost.** **[HIGH]**

### Design Principles and Best Practices — Fit Against Project Invariants

| Ratified invariant | Fit | Note |
|---|---|---|
| `CONFIG` is the single source of truth | ✅ | A `CONFIG.current` block: strength, length scale, boundary width `d₀`, bake resolution |
| `shared/` is pure, zero I/O | ✅ | Field construction is pure functions over plain arrays |
| Both sides run the SAME shared functions | ✅ | One `currentAt()` seam called by `world.ts` and `prediction.ts` |
| One seam per geometry concern | ✅ | `island.ts` is the precedent: currents get one module, all polygon math still delegated |
| Nothing re-derives a value ad hoc | ⚠️ | The hybrid architecture is the risk; single-path composition must be enforced |
| Zero transcendentals on the generation path | ✅ | Curl noise + a quintic ramp is transcendental-free — but `islandDistance()`'s `Math.hypot` broadphase must be avoided in the bake |
| Complexity ≤ 10 per function | ✅ | Sampling and ramping are short; the bake loop should be split into build/quantize helpers |
| Fog/render costs stay client-side | ✅ | Surface-flow rendering is pure presentation |

**The strongest architectural argument for currents is that the project has already run this exact play twice.** The height raster established "bake authoritative data at generation from the seed, never send it, both sides rebuild"; radar shadows then established "one shared pure module answers for both server gate and client paint." A current field is the third instance of the same pattern, and inherits both precedents' testing approach.

### Scalability and Performance Patterns

The measured costs place currents far below the project's own shipped features:

| Feature | Measured server cost | Source |
|---|---|---|
| Radar shadows (adversarial) | ~278 µs/tick | project record, cycle 68 |
| Radar wakes (adversarial) | ~425–470 µs/tick | project record, cycle 70 |
| **Currents, baked raster** | **1.37 µs/tick** | measured, this report |
| **Currents, analytic + boundary** | **47.6 µs/tick** | measured, this report |

_Scaling behaviour:_ the baked raster is O(1) per sample regardless of island count or field complexity — it does not degrade on a dense map, which is the failure mode the analytic form has. Sample count scales linearly with entities (hulls + ordnance + wake heads); at 52 samples/tick the baked field uses 0.003% of budget, so even a 10× entity increase remains immaterial.

_Memory:_ 512 KB at 256² (18.8 u cells) versus the height raster's ~118 KB. If that is considered heavy, 128² costs 128 KB at 37.5 u cells — still finer than a battleship's 124 u length, and currents are a smooth, low-frequency field where a coarse lattice is defensible. Bilinear interpolation of a smooth field introduces no visible artifacts at these scales. **[MEDIUM]**

_Client render scaling:_ GPU advection of surface-flow particles is the established pattern and runs thousands of particles at high frame rate even on mobile, with the standard optimization being to solve at lower resolution and subsample — directly applicable here since the field is already low-frequency.

### Integration and Communication Patterns

Covered in depth in Step 3. Architecturally the decisive property is that **the field is a map property, not an entity property**: it is derivable from the seed, identical for all observers, and carries no per-player information. That single fact is why the wire cost is zero, why `PROTOCOL_VERSION` need not move, and why the perception invariant is untouched.

### Security Architecture Patterns

For this project, "security architecture" is the perception/anti-cheat boundary. The relevant patterns:

- **Derivable-not-disclosed:** the field reaches clients as a seed, exactly as islands and the height raster do. A modified client gains nothing by reading it — it must compute it anyway to predict its own hull.
- **No new exception:** the master perception invariant keeps its six declared exceptions. Currents are not a seventh.
- **Server authority preserved:** ordnance drift is computed only on the server (the client contains no `stepShell`), so a modified client cannot fake a torpedo's path.
- **The one thing to watch:** if a future design wants currents *hidden* until discovered, the field seed must be server-private and reveal-gated, following the storm-ring precedent. A visible field needs none of this.

### Data Architecture Patterns

The ratified terrain position states the principle to follow: authoritative data is the raster; polygons and contours are rendering artifacts, never collided or LOS-tested. Applied to currents:

- **Authoritative:** the vx/vy lattice (or the analytic function).
- **Rendering artifacts:** streamlines, drifting particles, surface texture flow — all client-only, never consulted by the sim.
- **Never on the wire:** both sides rebuild from `mapSeed`.
- **Storage layout:** two parallel `Float32Array`s (structure-of-arrays), matching the data-oriented pattern where tightly-packed float arrays enable vectorization, and matching `wake.ts`'s existing `xs`/`ys`/`ts` parallel-array discipline.

An open architectural question worth flagging: **should the current field derive from the height field?** Physically it should — real flow accelerates through straits between islands and over shallow topography, and `sampleHeight()` already provides O(1) bathymetry. This would make the map's terrain and its currents two views of one generated world rather than two unrelated noise fields, and it is the difference between "physics as the source" and decorative noise. Cost is zero at runtime because it is baked. **[HIGH]** on the physics; the design decision is Eric's.

### Deployment and Operations Architecture

- **Build order** unchanged: shared → client → server. The field lives in `shared/`.
- **Bake timing:** inside `generateMap`, once per match. The measured 15.7 ms at 256² is a one-off at room creation, not per tick. For context, map generation already builds the height field, coastlines, contours and navigability grid.
- **Server memory:** +512 KB per room at 256². Worth confirming against Render's instance size if many rooms run concurrently — at 100 concurrent rooms that is 50 MB. **[MEDIUM]** — flagged as a real operational consideration, the first one this feature raises. Dropping to 128² cuts it to 12.8 MB.
- **Rollout:** the field can ship dormant (built, unread) exactly as the height raster shipped unread for nine cycles before radar shadows consumed it. That precedent is explicitly cited in the project record as having paid off, and it applies here: bake the field, render it, and defer the drift mechanic to a later cycle.
- **Testing:** property-style pins — identical field from identical seed across rebuilds; flow tangent (not normal) at coastlines; no sample exceeds `CONFIG.current.maxSpeed`; server and client agree bit-for-bit on a fixed sample set.

**Architectural synthesis:** the recommended shape is a **generation-time baked, terrain-derived, divergence-free curl-noise raster in `shared/`, sampled through one seam by both `world.ts` and `prediction.ts`, with rendering as a pure client artifact.** It is the third application of a pattern this codebase has run successfully twice, it costs 1.37 µs/tick and 128–512 KB, and it requires no wire change, no protocol bump, and no new perception exception.

---

## Implementation Approaches and Technology Adoption

### Prototype Validation — Measured Evidence

A working prototype was built for this report: boundary-respecting 2D curl noise over a synthetic **concave hook island** (the arbitrary topology cycle 59's thresholded height field makes possible), using the project's `perlin`/`fbm` verbatim and `closestPointOnPolygon`'s exact arithmetic. Three properties were measured.

**1. Coastal tangency — confirmed.** Flow is parallel to the coast at the shoreline and releases with distance, which is the intended behaviour of Bridson's ramp:

| Offshore distance | mean \|v·n̂\|/\|v\| | worst | samples flowing shoreward |
|---|---|---|---|
| 1 u | **0.0258** | 0.2414 | **0 / 128** |
| 2 u | 0.0426 | 0.5593 | 2 / 128 |
| 10 u | 0.1570 | 0.9875 | 9 / 128 |
| 40 u | 0.4603 | 0.9999 | 45 / 128 |

(0 = perfectly tangent. Tangency is exact only *at* the boundary, where `ψ = 0` makes the coastline an isocontour; flow is deliberately free offshore.)

**A methodological warning worth recording, because it wasted a cycle in miniature.** A first version of this test measured tangency against the local polygon **edge** normal and produced garbage (mean 0.283, worst 0.956), which looked like the method failing. The ramp's gradient follows the **nearest boundary point**, not the local edge, so on a concave hook the two disagree badly. This is the identical correction cycle 59 already made when it retired `skeletonNormal` for `coastNormal`. Anyone testing this must use `coastNormal`. **[HIGH]**

**2. Incompressibility — exact.** Measured with a stencil matching the one used to differentiate the potential: **mean \|∇·v\| = 1.0×10⁻¹⁸, max 4.4×10⁻¹⁶** — machine precision. Apparent divergence "spikes" in a first pass (max 4.2×10⁻²) were a mismatched-stencil truncation artifact concentrated in the ramp band (d < 110 u), not a property of the field. **[HIGH]**

**3. Speed distribution — realistic from one constant.** A single strength scalar produced p10 0.56 / p50 1.45 / p90 2.68 / p99 3.70 / max 5.36 u/s. No per-region tuning was needed to land in the physically correct band (below).

### Physical Calibration — What Strength Is Realistic

Real-world figures: wind-driven surface current runs about **3% of surface wind speed** (20 kt wind → 0.6 kt current); **2 kt tidal currents are common** (Long Island Sound, the Golden Gate); tidal races reach **5 kt** (New York's East River); the Gulf Stream and Kuroshio exceed **4 kt**. Current speed increases inshore, in shallower water, and where flow is forced through a narrow opening.
_Source: [Tidal Currents: Know The Tactics (SAIL)](https://sailmagazine.com/cruising/tidal-currents-know-the-tactics/) · [Tidal streams (Sailing Issues)](https://sailingissues.com/navcourse8.html) · [Tidal Currents (Geosciences LibreTexts)](https://geo.libretexts.org/Courses/American_Meteorological_Society/Introduction_to_Ocean_Sciences_6e_(Segar)/10%3A_Tides/10.06%3A_Tidal_Currents) · [Set and drift (Wikipedia)](https://en.wikipedia.org/wiki/Set_and_drift) · [Leeway (Wikipedia)](https://en.wikipedia.org/wiki/Leeway)_ **[HIGH]**

Hullcracker's hull speeds were set by a "knot-realistic rescale" (45 / 40 / 35 u/s). Real fast light warships run ~35–40 kt and battleships ~28 kt, which puts the scale near **1 u/s ≈ 0.9 kt** — so realistic currents are roughly **1–3 u/s open water, up to ~5 u/s in a strait**. That is exactly the band the prototype produced unforced. **[MEDIUM]** — the unit mapping is inferred from the rescale note, not documented.

**Tactical consequence — torpedo cross-current deflection** (torpedo speed 60 u/s; hull beams TB 9 u, ML 20 u, BB 32 u):

| Current | @150 u | @247.5 u (detect) | @330 u (sight) | @412.5 u |
|---|---|---|---|---|
| 1 u/s | 2.5 u | 4.1 u | 5.5 u | 6.9 u |
| 2 u/s | 5.0 u | 8.3 u | 11.0 u | 13.8 u |
| 3 u/s | 7.5 u | 12.4 u | 16.5 u | 20.6 u |
| 5 u/s | 12.5 u | 20.6 u | 27.5 u | 34.4 u |

**This is the single most important number in the report.** At realistic strengths the deflection is *tactically decisive without being absurd*: a 2 u/s beam current at truesight range throws a fish 11 u — a clean miss on a Torpedo Boat (9 u beam), a graze on a Battleship (32 u). A 5 u/s strait current at the same range throws it 27.5 u, a near-miss even on a battleship. Long-range torpedo work becomes a read of the water; short-range work is barely affected. Currents produce a genuinely skill-expressive weapon interaction *at physically honest magnitudes* — no fudging required. **[HIGH]**

**Hull drift while stopped** (mine layer holding station): 1 u/s = 60 u/min; 3 u/s = 180 u/min against a 247.5 u detect radius. Holding a position becomes an active task rather than a free one.
**As a fraction of top speed:** 2 u/s is 4.4–5.7% of hull speed — imperceptible under power, decisive when stopped or over a long ballistic flight. That asymmetry is the mechanic.

### Technology Adoption Strategy — Phased, Dark-Launched

Industry practice favours incremental release: dark launching enables controlled, incremental, less disruptive deployment with an emphasis on risk mitigation, and lets an issue be caught in a small population before wider exposure.
_Source: [The Only Guide to Dark Launching You'll Ever Need (LaunchDarkly)](https://launchdarkly.com/blog/guide-to-dark-launching/) · [Dark Launches in Software Development (ConfigCat)](https://configcat.com/blog/2024/03/27/dark-launches-in-software-development/) · [Implement Incremental Feature Release Techniques (AWS)](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/dl.ads.4-implement-incremental-feature-release-techniques.html)_ **[HIGH]**

**The project has its own, stronger version of this precedent:** the height raster shipped **built but unread for nine cycles** before radar shadows consumed it, and the project record explicitly states that bet paid off because retrofitting the storage later would have been the expensive path. Currents should follow the identical pattern.

### The Corrected Architecture — Bake the Potential, Not the Velocity

Step 4 recommended baking a velocity raster. **Research and measurement corrected this.** A bilinearly interpolated velocity field is not divergence-free: "this interpolated field is continuous and differentiable (almost everywhere), but in general it will not be divergence-free." The published remedy is to recover a node-based stream function, interpolate *that*, and apply the continuous curl to get a pointwise flow field that is perfectly incompressible.
_Source: [Local divergence-free polynomial interpolation on MAC grids (UCR, PDF)](https://www.cs.ucr.edu/~craigs/papers/2021-div-free/paper.pdf) · [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0021999122005629) · [Divergence-free Interpolation of Vector Fields From Point Values](https://www.researchgate.net/publication/49943113_Divergence-free_Interpolation_of_Vector_Fields_From_Point_Values_-_ExactdivB0_in_Numerical_Simulations)_ **[HIGH]**

Measured head-to-head on a 128² lattice (15.7 u cells):

| | **A: bake velocity (vx,vy)** | **B: bake potential (ψ)** |
|---|---|---|
| mean \|∇·v\| | 9.36×10⁻⁴ | **5.78×10⁻¹⁶** |
| max \|∇·v\| | 9.81×10⁻³ | **5.00×10⁻¹⁵** |
| speed error vs exact | 0.0981 u/s (6.3%) | **0.0472 u/s (3.1%)** |
| memory | 128 KB | **64 KB** |
| per-sample cost | 66.99 ns | **43.17 ns** |
| coastal tangency @2 u | **0.0781** | 0.1277 |

**Bake the potential.** It wins decisively on incompressibility, accuracy, memory and speed. Storing one scalar per cell and taking the analytic curl of the bilinear form is exactly divergence-free *within each cell*, because the curl of a bilinear scalar is piecewise-constant-plus-linear with identically zero divergence.

**The one honest cost — and its fix.** The potential-bake is slightly *worse* at coastal tangency (0.1277 vs 0.0781 mean; 6/128 vs 2/128 samples with a shoreward component at 2 u offshore). The cause is resolution, not method: the coastline is a **sub-cell feature**, so the interpolated `ψ = 0` contour approximates the true coast only to within about half a cell. Three mitigations, in order of preference:

1. **Coastal-band refinement** — refine the lattice near coastlines. `heightField.ts` already builds this way ("coarse pass + coastal-band refinement"), so the pattern and the code shape exist.
2. **Accept it.** The residual shoreward push at 2 u from shore is a fraction of a ~5 u/s field, and `resolveShipPose` + `applyGroundingDamp` already handle a hull pressed against a coast — this is a mild extra press, not a new failure mode.
3. Analytic ramp correction within `d₀` of shore — restores exactness but reintroduces per-sample distance cost near coasts.

### Development Workflow — File-by-File Plan

**New files (`shared/src/sim/`):**
- **`current.ts`** — the single seam, mirroring `island.ts`'s role. Exports `currentAt(field, x, y): {vx, vy}` (analytic curl of the bilinear potential), `buildCurrentField(seed, islands, heightRaster, params)`, and the ramp. All noise delegated to `noise.ts`; all polygon math delegated to `silhouette.ts`. **No second noise or polygon library.**

**Modified — shared:**
- `constants.ts` — a `CONFIG.current` block: `strength`, `lengthScaleU`, `boundaryWidthU` (d₀), `lattice` resolution, `maxSpeedU` clamp.
- `map.ts` — build the field inside `generateMap`, beside the height raster; return it on the map object.
- `ship.ts` — `stepShip` takes an optional current vector (Option A from Step 3).
- `index.ts` — barrel export.

**Modified — server:**
- `game/world.ts` — sample the field in `stepShips`, **before** `resolveCollisions`; optionally advect wake samples in `sampleWakes`; optionally drift mines in `creepMines` and torpedoes in `stepShells`.

**Modified — client:**
- `sim/prediction.ts` — sample the identical field in `localTick` **and** `replayFrom`. This is the desync-critical edit.
- `net/connection.ts` — build the field during the existing seed-driven map rebuild.
- `render/` — a new `current.ts` for surface-flow presentation (client-only).
- `config.ts` — `CLIENT_CONFIG.current` for render-only knobs (particle density, streamline opacity).

**Determinism checklist for the bake path (each item silently breaks it):**
- Use `closestPointOnPolygon` (`Math.sqrt`), **never** `islandDistance` — its broadphase uses `Math.hypot`.
- No `Math.sin/cos/pow/exp/atan2` anywhere in field construction. Bridson's ramp is a quintic polynomial; keep it one.
- Seed from `mapSeed` via `mulberry32`, on a decorrelated stream (the `rollOffer` precedent).
- Build the field identically on both sides — same order, same lattice, same rounding.

### Testing and Quality Assurance

| Test | Type | Asserts |
|---|---|---|
| Seed determinism | shared, property | identical field bytes from identical seed across rebuilds |
| Cross-side identity | shared | server-built and client-built fields agree bit-for-bit on a fixed sample set |
| No transcendentals | shared, source-reading | mirrors the existing `noise.test.ts` pattern that reads the file |
| Incompressibility | shared, property | `\|∇·v\|` below tolerance on a sample grid |
| Coastal safety | shared, property | no sample within 1 u of a coast has a shoreward component above threshold |
| Speed clamp | shared | no sample exceeds `CONFIG.current.maxSpeedU` |
| Prediction parity | client | replaying N ticks with current reproduces the server pose within the 0.01 u ignore band |
| Perf budget | server | per-tick sampling cost stays under a stated µs bar |

The prediction-parity test is the one that must exist. Everything else is hygiene; that one is the feature's actual risk.

### Deployment, Operations and Cost

- **Bake:** measured 4.2 ms @128² / 15.7 ms @256², one-off inside `generateMap`.
- **Memory (potential-bake):** **64 KB @128², 256 KB @256²** per room — half the velocity-bake. At 100 concurrent rooms, 6.4 MB / 25.6 MB. Comfortable on Render.
- **Per-tick:** 43.17 ns/sample × 52 samples ≈ **2.2 µs/tick (0.005% of budget)**.
- **Wire:** zero. `PROTOCOL_VERSION` unchanged.

### Skills and Team

Single-developer feature. Required knowledge: 2D vector calculus (curl/stream function), finite differences, bilinear interpolation. No new dependency, no new language, no GPU compute requirement (surface-flow *render* could use GPU but a CPU particle layer is adequate at this field's low frequency).

### Risk Assessment and Mitigation

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| **Time-varying field sampled at "now" during replay** | **High** | Medium | Sample at each tick's recorded server time — the boost/slow precedent. Or ship a steady field, where the risk does not exist. |
| Aim preview lies about torpedo path | **High** (UX) | High if unaddressed | Design decision: integrate drift into the preview (curved), or keep the fish undeflected |
| Coastal tangency error pushes hulls ashore | Low | Medium | Coastal-band refinement; existing grounding damp absorbs the residual |
| Bake path uses `Math.hypot` and desyncs the map | **Critical** | Low | Explicit checklist item + a source-reading test |
| Two derivation paths (hybrid architecture) | Medium | Low | One shared composition function; forbid ad-hoc composition |
| Drift feels like loss of control | Medium | Medium | Telegraph the field visually; magnitudes above are only 4–6% of hull speed under power |
| Memory growth at high room counts | Low | Low | 128² lattice; measured figures above |

**The two risks that actually matter are the replay-time sampling bug and the aim preview.** Everything else is small or already handled by shipped machinery.

## Technical Research Recommendations

### Implementation Roadmap

**Phase 0 — Dark bake (small, zero gameplay risk).** Build the potential field in `generateMap` from the seed; export `currentAt`; add determinism and incompressibility tests. Ship it **unread**, exactly as the height raster shipped. Nothing in the game changes. This is the cheapest possible way to de-risk everything downstream, and it is reversible.

**Phase 1 — Render only.** Surface-flow presentation on the client: drifting particles or streamline texture. Players can *see* the current before anything is *affected* by it, which is the telegraphing the hazard-design literature asks for. Still no gameplay change, still no wire change.

**Phase 2 — Ordnance drift (recommended first gameplay step).** Apply drift to torpedoes and mines only. Server-authoritative, **zero prediction risk** (the client contains no `stepShell`), and it delivers the deflection table above — the most interesting gameplay per unit of risk in the whole feature. Requires the aim-preview decision.

**Phase 3 — Hull drift.** The prediction-touching step. Steady field first; only consider time variation after Phase 3 is stable.

**Phase 4 — Wake advection and storm coupling.** Presentation-heavy, low risk, best done once the field is proven.

This ordering deliberately puts **every zero-prediction-risk payoff before the one risky step**.

### Technology Stack Recommendations

1. **2D curl noise over a scalar stream function**, from the existing `perlin`/`fbm`.
2. **Boundary handling via Bridson's quintic ramp** on `closestPointOnPolygon` distance.
3. **Bake the potential** (one Float32 lattice), analytic curl of the bilinear form at sample time.
4. **Terrain-derived** — modulate the potential by `sampleHeight()` bathymetry so flow accelerates through straits, which is both physically correct and the reason to call it "physics as the source."
5. **Steady field first.** Time variation is affordable but is pure added risk for Phase 1–2 value.

### Success Metrics

- **Determinism:** zero prediction hard-snaps attributable to current across a full match; server/client field identity test green.
- **Performance:** < 10 µs/tick server sampling; no measurable client frame-time regression.
- **Correctness:** `\|∇·v\|` at machine precision; no hull grounded by current in open water.
- **Gameplay (Eric's call to judge):** does long-range torpedo work become a read of the water rather than a coin flip?

---

## Research Synthesis: The Ocean Was Always Going to Be Cheap — The Question Is What You Do With It

### Executive Summary

Hullcracker asked three questions about ocean currents: is it feasible, what does it cost, and is there gameplay in it. The short answers are **yes, almost nothing, and more than expected** — but the interesting result is *why*, and it is not the one the question anticipated.

The cost question, which sounds like the hard one, is closed by measurement. A boundary-respecting, divergence-free current field sampled by every ship, torpedo and wake head on the map costs **2.2 µs per 50 ms tick — 0.005% of the budget**, and **64 KB per room**. For calibration, radar shadows cost ~278 µs/tick and radar wakes ~425–470 µs/tick. **Currents are roughly two orders of magnitude cheaper than a feature that shipped last cycle.** Cost is not the constraint on this feature and should not be discussed as though it were.

Feasibility is likewise settled, and for a reason specific to this codebase: **every primitive the method needs already exists here.** 2D curl noise builds a velocity field as the curl of a scalar stream function — Hullcracker has `perlin`/`fbm`. Bridson's solid-boundary construction needs distance to the nearest coast — Hullcracker has `closestPointOnPolygon` and `coastNormal`, and cycle 59 already established nearest-boundary-point as the authority. Physically honest flow accelerates over shallow terrain — Hullcracker has an O(1) `sampleHeight()` raster that has been sitting there since cycle 59 for exactly this class of use. And the boundary ramp is a **quintic polynomial**, so the whole construction passes the zero-transcendental generation rule without substitution. A prototype built for this report confirmed the behaviour: flow is tangent at the coast (mean deviation 0.026 at 1 u offshore, **zero of 128 samples flowing shoreward**) and incompressible to machine precision (**1.0×10⁻¹⁸**).

The gameplay answer is where the real finding is, and it is quantitative. At **physically honest current speeds** — 1–3 u/s open water, ~5 u/s in a strait, which is what the prototype produced from a single constant with no tuning — a beam current throws a torpedo **11 u off over a truesight-range run and 27.5 u in a strait**. Against hull beams of 9 / 20 / 32 u, that is a clean miss on a Torpedo Boat and a graze on a Battleship. Meanwhile the same current is **4–6% of hull top speed**, so it is nearly imperceptible under power. **That asymmetry is the mechanic**: currents barely touch a ship that is driving, and dominate anything that spends time in the water — torpedoes at range, laid mines, a hull holding station. No fudging of magnitudes was required to get there, which is the strongest possible evidence for "physics as the source, tactics as the payoff."

**Key Technical Findings:**

- **Cost is a non-issue, measured:** 43.17 ns/sample baked; 2.2 µs/tick at 52 samples; 64 KB/room. Two orders of magnitude under shipped features.
- **The zero-transcendental rule is a *generation-path* rule, not a runtime rule** — `stepShip` has called `Math.cos`/`Math.sin` on both sides since day one. This distinction is not written down anywhere in the project docs and it decides which designs are legal. A runtime-sampled field may use transcendentals; a baked field may not.
- **Bake the potential, not the velocity.** Bilinearly interpolated velocity is *not* divergence-free; interpolating the stream function and taking the analytic curl is. Measured: divergence 5.78×10⁻¹⁶ vs 9.36×10⁻⁴, half the error, half the memory, 35% faster.
- **Only one consumer touches prediction.** The client contains no `stepShell`, so torpedo and mine drift are server-authoritative with **zero desync risk**. Hull drift is the sole risky integration, and its hard case (a time-varying field) has a verbatim precedent in the shipped boost/slow replay handling.
- **Zero wire cost, no `PROTOCOL_VERSION` bump, no new perception exception.** The field is a map property derived from `mapSeed`, exactly like islands and the height raster. The invariant keeps its six declared exceptions.
- **Prior art is a gap, not a guide.** Sea of Thieves — the deepest mainstream sailing game — has no currents at all, shipping invariant south-easterly waves instead. Currents are a recurring player *request*, not a solved design.

**Top Recommendations:**

1. **Bake a scalar stream-function raster in `generateMap`, terrain-modulated, and ship it dark** — built, tested, unread. The height raster set this precedent and the project record says the bet paid off.
2. **Take ordnance drift before hull drift.** It carries the best gameplay in the feature (the deflection table) at literally zero prediction risk.
3. **Ship a steady field first.** Time variation is affordable and has a known-good pattern, but it is pure added risk for the Phase 1–2 payoff.
4. **Derive the flow from the height field**, so straits accelerate. This is what makes it physics rather than decorative noise, and it costs nothing at runtime because it is baked.
5. **Decide the aim-preview question before writing Phase 2.** It is the only integration problem with no existing answer, and it is a design call, not a technical one.

### Table of Contents

| Section | Contents |
|---|---|
| Research Overview | Scope, confidence conventions, standing constraint |
| Technical Research Scope Confirmation | Goals and methodology as ratified |
| Technology Stack Analysis | Four model families; library fit; field storage; determinism tooling; runtime platform; prior art |
| Integration Patterns Analysis | The `stepShip` seam; prediction/reconciliation; wire contract; four affected systems; perception; storm coupling |
| Architectural Patterns and Design | Three candidate architectures; invariant fit; scalability; security; data architecture; deployment |
| Implementation Approaches | Prototype validation; physical calibration; the corrected bake; file-by-file plan; testing; risk register |
| Technical Research Recommendations | Phased roadmap; stack recommendations; success metrics |
| Research Synthesis | Executive summary; open questions; source register; conclusion |

### Open Questions — Eric's Calls, Not This Report's

Per the standing rule that mechanics are never invented here, these are surfaced with evidence and left open:

1. **Does the aim preview show the curved torpedo path?** Showing it makes drift a learnable skill; hiding it makes the weapon feel broken at range. The technical work is the same either way.
2. **Steady or time-varying field?** Steady is free and safe. Time-varying is affordable and has a shipped precedent, but is the one design that can produce a latency-dependent bug if implemented carelessly.
3. **Does drift apply equally to all hulls?** *The physics has an answer here:* a floating object advects with the water regardless of mass, so pure current affects a Battleship exactly as much as a Torpedo Boat. (Wind *leeway* varies by hull; current advection does not.) A design that scales drift by class would be departing from physics deliberately — which is allowed, but should be a knowing choice.
4. **Is the current visible, and where?** On-water render only, or also a HUD/instrument readout? The field is public information either way; this is a presentation and legibility question.
5. **Do currents couple to the storm?** Three shapes are available at zero-to-minimal wire cost; all can be telegraphed.
6. **Does a laid mine drift?** It is physically correct and it changes the Mine Layer's identity — a field you lay stops being a field you own.

### Research Methodology and Source Verification

**Approach:** current public sources for the technique landscape and physical figures, combined with **direct measurement against this repository's own code**. Every performance number in this report was benchmarked on this machine using `shared/src/sim/noise.ts` primitives copied verbatim; no cost figure is estimated. The harness was validated against the project's own recorded measurement (perlin 17.1 ns recorded, 16.81 ns measured, −1.7%).

**Search queries used:** curl noise / divergence-free procedural flow fields · shallow water equations real-time games · deterministic physics with client-side prediction and environmental forces · ocean current physics (geostrophic, wind-driven, flow around islands) · potential flow around circular obstacles · naval game current mechanics (Sea of Thieves, Naval Action) · WebGL flow-field visualization · JavaScript cross-browser floating-point determinism · rollback netcode reconciliation and divergence · semi-Lagrangian advection and CFL stability · environmental hazard telegraphing and player agency · real ocean current speeds in knots · deterministic simulation architecture · divergence-free interpolation on MAC grids · incremental feature rollout and dark launching.

**Primary sources:** Bridson et al. (SIGGRAPH 2007) for the method; UCR/ScienceDirect MAC-grid interpolation papers for the potential-vs-velocity correction; Britannica/ScienceDirect for ocean physics; SAIL/Sailing Issues/LibreTexts for current speeds; Gaffer On Games, Rune and SnapNet for determinism and netcode; ECMWF and UCD for semi-Lagrangian advection.

**Limitations and confidence:**
- **[HIGH]** — all cost/benchmark figures, the tangency and divergence results, the potential-vs-velocity comparison, the generation-vs-runtime determinism distinction, the zero-wire-cost conclusion, the deflection table's arithmetic.
- **[MEDIUM]** — the u/s ↔ knots mapping (inferred from a code comment, not documented); memory projections at high room counts; the extrapolated wake-advection cost; prior-art claims resting on forum evidence.
- **[LOW / unresolved]** — no published source measures curl noise inside a rollback/reconciliation loop. The prediction analysis is reasoned from first principles against this codebase's actual reconcile logic, and is the one area where a Phase 3 prototype should verify before committing.
- The prototype used a synthetic hook island, not a real `generateMap` output. Behaviour on real generated coastlines should be re-measured in Phase 0.

### Conclusion

The feature is feasible, effectively free, and lands a genuinely interesting mechanic at physically honest magnitudes. Its risk is concentrated almost entirely in **one integration point** (hull drift through prediction) and **one design decision** (the aim preview) — and the phased roadmap is constructed specifically so that every unit of gameplay value before those two can be banked without touching either.

The most valuable structural observation is that this would be the **third run of a pattern this codebase has already executed twice successfully**: generate authoritative data from the seed, keep it off the wire, let both sides rebuild it, answer with one shared pure module. The height raster did it and waited nine cycles to be consumed; radar shadows did it and made the scope cheaper in the process. A current field is the same shape, at a tenth of the cost, with the substrate — `sampleHeight()` — already sitting in the repository waiting for a second consumer.

---

**Research Completion Date:** 2026-08-11
**Source Verification:** all technical claims cited or measured; benchmark harness validated against the project's own recorded figure
**Overall Confidence:** High on cost, feasibility and architecture; Medium on tuning magnitudes; the prediction interaction is the flagged area for Phase-0 verification

_This document is a technical research report. It presents options, costs and consequences; every gameplay mechanic decision remains open for Eric._
