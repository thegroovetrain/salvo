---
title: 'Story 4.11 — Height-Aware Radar Shadows'
type: 'feature'
created: '2026-08-08'
status: 'done'
baseline_revision: 'd7c1242'
final_revision: 'PENDING'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Terrain occlusion on radar is currently in two wrong states at once. The SERVER deletes any
blip whose line crosses an island polygon — at any range, however low the island — so terrain is a
binary wall. The CLIENT paints straight through everything, because cycle 62 removed occlusion from the
paint path on the explicit promise that this story would restore it properly (amendment 140). So the two
sides disagree, and neither expresses what a radar actually does.

**Approach:** Replace both with ONE shared pure model. A ray marching outward folds each land sample it
crosses into a single running scalar; that scalar answers "how much of a target at distance `D` is
illuminated" — full, partially, or not at all. The client multiplies it into sample intensity (so returns
fade through the weakest band rather than cutting at a line) and fills what is left with a grey NO-DATA
speckle out to the rim; the server evaluates the same function along one observer→target ray and uses it
as the radar blip gate. Separately, a live radial transparency mask quiets the scope inside the range
where the player aims by eye.

## Boundaries & Constraints

**Always:**
- **ONE implementation.** The model lives in exactly one new `shared/` module. `server/src/game/signals.ts`
  and the client march both call it. A second implementation is a desync or a leak — this is the story's
  central architectural constraint.
- **The march is an ACCUMULATOR, not a one-shot.** `vis(D) = clamp01(D · (aMin − D/K))` where
  `aMin = min over crossed land samples of (u_i/d_i + d_i/K)`, `u_i = 1 − h_i/H`, `K = radarRange²/4`.
  O(1) per sample, no obstacle list. Derivation and rationale in Design Notes.
- **A sample is evaluated against the accumulator as it stood BEFORE that sample was folded in**, so an
  obstacle's own near face always paints at full strength and only what is behind it is masked.
- **`K` uses BASE `CONFIG.vision.radar`, never an observer's boon-widened range** (amendment 185).
- **`H` is `CONFIG.vision.radarMastQ = 64`**, in the raster's own 0–255 quantized units (amendment 184).
  Nothing may make it purchasable — no stat, boon or card may touch it (amendment 116, "land is sacred").
- **Only the radar blip gate changes on the server.** `pointSighted`, `pointDetected`, the muzzle-flash
  halo, the wounded-smoke halo and the foghorn muffle keep binary island LOS byte-identical. `losClear`
  itself is not modified and not routed through the new model.
- **Ships never shadow ships.** Only terrain occludes. Verified true today and kept deliberately
  (amendment 107/141).
- **Observer and target are both at mast height `H`**, so the model is symmetric — A paints B exactly when
  B paints A. Decoys use the same target height as hulls (amendment 11 indistinguishability).
- **Grey NO-DATA carries no strength channel**: one colour, one fixed opacity, no ramp, no band index.
  Age still decays it exactly as it decays a return (amendment 161).
- The master perception invariant still holds, and every existing perception oracle stays independently
  reimplemented (never importing production code).

**Block If:**
- The measured server cost of the new gate exceeds the cost of the `islandBlocksSegment` path it replaces
  at the worst realistic pair count. (Budget it; if it regresses, HALT rather than shipping a 20Hz cost.)
- Making the perception oracle agree EXACTLY with production requires importing production code, or the
  two disagree on any seeded invariant world. Exact multiplicity is asserted by `verifyBlipCompleteness`,
  so "close enough" is not available.
- A grey no-data appearance cannot be added without either a fourth entry in `bands` or a per-band alpha
  ramp. Both are struck out (amendments 77, 160) and neither may be reintroduced to make this fit.

**Never:**
- Do NOT bump `PROTOCOL_VERSION`. The `blip` payload shape does not move; only which blips exist does, and
  a stale client renders an unshadowed scope rather than misreading the wire. Stays at **31**.
- Do NOT widen any sensor other than radar, and do NOT touch `CONFIG.vision.farRadar` (reserved, and
  branching on it violates amendment 105/118).
- Do NOT fold the shadow scalar into the grid's alpha channel — `writeCell`'s freshest-wins compare reads
  pure age and must keep doing so (amendment 164).
- Do NOT implement the near-range dimming as a per-cell recompute inside `quantizeInto`, and do NOT let it
  reach paint creation or retirement (amendments 83, 97).
- Do NOT terrace the height field (amendments 142, 162). Continuous 256-level height feeds the model.
- Do NOT design radar wakes, rain squalls, low-band sets, Doppler, or any sensor card (amendment 112).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open water bearing | No land on the ray | `vis = 1` at every distance; paint and gate exactly as today | No error expected |
| Sea-level fringe | Land at `h = 0`-ish, any `d₀` | Reach ≥ `radarRange`: a beach never shadows inside the scope | No error expected |
| Soft cover | `0 < h < H` at `d₀` | Reach `= d₀ + K(1 − h/H)/d₀`; returns fade to nothing across the approach to it | No error expected |
| Hard cover | `h ≥ H` | `u ≤ 0` ⇒ root at or before `d₀` ⇒ dark immediately past the obstacle; no separate branch | No error expected |
| Near face | Sample AT the obstacle | Paints at full strength (accumulator not yet folded) | No error expected |
| Two obstacles | Low near, tall far | `aMin` takes the stronger constraint; result is the min of both curves | No error expected |
| Fully shadowed slice | Every sample past reach | Slice holds only NO-DATA cells and must still be enrolled | `freeze` must not return `null` on a no-data-only slice |
| Aground observer | Own hull on land | Existing `aground` gate suppresses paint creation; accumulator never runs | Unchanged behaviour |
| Off-raster ray | Ray leaves the grid | `sampleHeight` clamps to `SEA_HEIGHT`; ray is transparent beyond the disc | Documented, not an error |
| Degenerate inputs | `H ≤ 0`, non-finite `K`/`d`, `d = 0` | Model returns full visibility (fail OPEN on the client paint, and fail CLOSED is wrong here since the server gate would hide contacts) | Finiteness-checked; never NaN into `writeCell` |
| Boon-widened scope | `stats.radarRange` > base | Annulus grows; `K` does not. Soft shadows unchanged | No error expected |
| Fixture world | Test clears `map.islands` | Raster still real. Tests must control the raster explicitly | New fixture seam required |

</intent-contract>

## Code Map

- `shared/src/sim/radarShadow.ts` -- **NEW.** The one model: accumulator state, `foldSample`, `visibilityAt`,
  `reachOf`, and the marcher both sides call. Pure, no I/O, no transcendentals on the hot path.
- `shared/src/constants.ts` -- `CONFIG.vision` gains `radarMastQ: 64`. `CONFIG.vision.radar` (`SIGHT*2`) is
  the base range `K` derives from; `radarCellU`/`radarFuzz` are the shape of the sibling block to follow.
- `shared/src/sim/heightField.ts` -- `sampleHeight` (O(1), nearest-sample, off-raster ⇒ `SEA_HEIGHT`),
  `tileCeilingAt`/`tileCeiling`/`tileSize` (the max-height pyramid, built for exactly this march).
- `shared/src/index.ts` -- barrel export for the new module.
- `shared/src/__tests__/zone.test.ts` -- the eighths-ladder pins (lines ~69-118). ADD beside them; do not
  edit them. This is where the build-failing `2RH = radarRange²/4` assertion belongs.
- `server/src/game/signals.ts` -- `blipGate` (:287-289) is the ONE gate that changes; `losClear` (:175-180)
  and its five other callers stay byte-identical. `SignalContextBase` (:81-107) gains the raster.
- `server/src/game/perception.ts` -- `foggedContext` (:55-72) and `spectatorContext` (:76-92) pass
  `world.map.heightRaster`.
- `server/src/game/world.ts` -- `this.map = generateMap(...)` (:702); `map.heightRaster` already exists and
  is currently read by nothing server-side.
- `server/src/__tests__/perception.test.ts` -- `blipPredicate` (:1182-1191) is the oracle to re-derive;
  `verifyBlipCompleteness` (:1046) demands exact multiplicity; the invariant sweep is :1781-1911.
- `server/src/__tests__/islandFixture.ts` -- `circleIsland` builds an `Island` with NO raster presence.
  Needs a raster-aware sibling, mirroring `rasterFrom`/`ridge` in `client/src/__tests__/radarEcho.test.ts`.
- `client/src/render/radarMarch.ts` -- `marchRay` (:359-385) is where the accumulator runs; `MarchSlice`
  (:132-148), scratch (:270-274), `growScratch` (:276), `pushCell` (:290), `freeze` (:388-407).
- `client/src/render/radarField.ts` -- `solidAt` (:445-452) already reads `sampleHeight`; the header
  (:62-71) carries the amendment-140 promise this story cashes and must be rewritten.
- `client/src/render/radarHeatmap.ts` -- `HeatGrid` (:204-219), `writeCell` (:350-365, freshest-wins),
  `quantizeInto` (:391-414), `stampSlice` (:580-585), `rasterize` (:595-601).
- `client/src/render/radar.ts` -- `marchBeam` (:886-923), `paintHeat` (:1050-1079), `fitHeat` (:467-495,
  DESTROYS the sprite on resize), `blipLayer` (the mask's correct parent), `this.own` (:847).
- `client/src/render/textures.ts` -- `bakeFogTexture`/`bakeVignetteTexture` use `createRadialGradient`;
  the precedent for baking the dim-mask texture. The sweep sprite is the world-anchored-sprite precedent.
- `client/src/config.ts` -- `COLORS` (:21-91, where the no-data grey token goes) and
  `CLIENT_CONFIG.blip.heatmap` (:1424+, gains the no-data + dimming blocks).
- `client/src/__tests__/tokens.test.ts` -- fails on any hex literal in `client/src`; the grey MUST be a token.
- `VERSION`, `package.json`, `_bmad-output/gds-workflow-status.yaml`,
  `_bmad-output/implementation-artifacts/sprint-status.yaml`, `CLAUDE.md` -- cycle-close bookkeeping.

## Tasks & Acceptance

**Execution:**

- [ ] `shared/src/constants.ts` -- add `CONFIG.vision.radarMastQ = 64` with the amendment-177/184 rationale
  (what it is, that it is fixed, that nothing may buy it). -- One knob, in the one CONFIG.
- [ ] `shared/src/sim/radarShadow.ts` -- NEW: the accumulator model and its marcher. Export `K` derived from
  base `CONFIG.vision.radar`, a reset/fold/query triple, and a `marchVisibility(raster, ox, oy, tx, ty)`
  convenience the server uses for one ray. Finiteness-check every externally supplied scalar. Keep each
  function under complexity 10. -- The single implementation both sides call.
- [ ] `shared/src/index.ts` -- export the new module. -- Barrel is the only import surface.
- [ ] `shared/src/__tests__/radarShadow.test.ts` -- NEW: unit-test the I/O matrix rows above (open water,
  sea-level fringe, soft cover, hard cover, near face, two obstacles, degenerate inputs), and pin the two
  closed forms: worst-case reach `= radarRange·√(1 − h/H)` attained at half that distance, and
  `h = 0 ⇒ reach ≥ radarRange`. -- The matrix is the contract.
- [ ] `shared/src/__tests__/zone.test.ts` -- ADD (do not edit the ladder pins) the BUILD-FAILING assertion
  that `2RH = radarRange²/4` holds by construction, and that `radarMastQ` is a fixed literal rather than a
  computed quantity. -- `radarRange` drives gun/cannon/star-shell range; an unpinned `R` silently
  rebalances every gun in the game.
- [ ] `server/src/game/signals.ts` -- add `heightRaster` to `SignalContextBase`; replace `blipGate`'s
  `losClear` term with the shared march. Leave `losClear` and its five other call sites untouched. Restate
  the "sight wins inside its radius" coherence comment (:262-269), which no longer follows from a single
  geometric predicate. -- The one disclosure change, kept surgical.
- [ ] `server/src/game/perception.ts` -- pass `world.map.heightRaster` in `foggedContext` and
  `spectatorContext`. -- The only plumbing on the path.
- [ ] `server/src/__tests__/islandFixture.ts` -- add a raster-aware fixture (a synthetic `HeightRaster` with
  a placed obstruction of chosen height, plus a flat/empty raster for worlds that clear `map.islands`).
  -- 30 test files clear islands but keep a real raster; without this seam they would shadow off terrain
  the test believes is absent, and fixture islands would cast no shadow at all.
- [ ] `server/src/__tests__/perception.test.ts` -- re-derive `blipPredicate`'s LOS term as an INDEPENDENT
  reimplementation of the shadow march (literals, not CONFIG; no production imports). Update the directed
  cases that encode the old rule (:346 "an island blocks radar exactly like sight"). -- The oracle binds
  the gate in both directions.
- [ ] `server/src/__tests__/goldenFrames.test.ts` + `__snapshots__/` -- re-record snapshots and fix the two
  directed island cases (:345, :777). -- Blips move; snapshots must move deliberately.
- [ ] `client/src/render/radarMarch.ts` -- run the accumulator in `marchRay`, multiply `vis` into sample
  intensity, and emit NO-DATA cells past the reach. Add the third parallel channel through scratch →
  `growScratch` → `pushCell` (with an explicit merge rule) → `freeze` → `MarchSlice`. `freeze` must NOT
  return `null` for a no-data-only slice. -- The march is where occlusion belongs.
- [ ] `client/src/render/radarField.ts` -- expose terrain height on the sample seam (or hand the march the
  raster) so the accumulator and `solidAt` share ONE land answer. Rewrite the amendment-140 header block:
  the promise is now kept. -- Two land answers is a divergence surface.
- [ ] `client/src/render/radarHeatmap.ts` -- `HeatGrid` gains the no-data channel; `writeCell` keeps
  comparing pure age and at EQUAL age lets a return beat a no-data mark; `quantizeInto` emits the grey at
  `bandAlpha × age` for a no-data cell with no return. -- Grey must not become a fourth register.
- [ ] `client/src/config.ts` -- add the no-data grey to `COLORS`, and a `heatmap.noData` + `heatmap.dim`
  block whose radii are DERIVED from the ladder (1/8 and 5/8 of `CONFIG.vision.radar`), never literals.
  -- The ladder exists so no boundary is an independent literal.
- [ ] `client/src/render/textures.ts` -- bake the radial dim-mask texture (20% at centre out to 1/8, ramping
  to 100% at 5/8, flat beyond). -- Follows `bakeFogTexture`'s `createRadialGradient` precedent.
- [ ] `client/src/render/radar.ts` -- attach the dim mask to `blipLayer` (NOT `heat.sprite`, which `fitHeat`
  destroys on resize), position it from `this.own` every frame including frames that paint nothing, and
  scale it in world units so it is zoom-invariant. Ensure `paintHeat`'s empty-paint early return (:1065-66)
  does not leave the mask stale, and that `hideHeat`/`clearBlips` tear it down. -- Display-time only; it
  must never touch `paints` or the grid.
- [ ] `client/src/__tests__/radarHeatmap.test.ts` + `radarMarch.test.ts` -- cover the shadow fade, the
  no-data channel, the equal-age arbitration rule, and that a shadowed fresh paint still beats an
  unshadowed stale one. Assert bounds at the SHIPPED noise level, not at nominal (amendment 135).
  -- Every earlier cycle's bug lived in exactly these seams.
- [ ] `client/src/__tests__/radarViewport.test.ts` -- assert the mask at the ADAPTER (`Radar.render`), on the
  mask object's own position/scale, since a display mask is invisible to grid-level assertions.
  -- Amendment 145's standing lesson: test where the adapter can actually reach it.
- [ ] Perf measurement -- measure client per-frame ms at 0.5×/1.0×/1.5× zoom and server µs per gate call at
  a realistic and an adversarial pair count. No committed harness exists; build one (throwaway is
  acceptable) and record the numbers in the spec's Auto Run Result. -- The AC requires measured, not assumed.
- [ ] `VERSION` + `package.json` -- 0.17.67 → **0.17.68**. -- One cycle, one increment.
- [ ] `_bmad-output/gds-workflow-status.yaml` AND
  `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark 4.11 done in BOTH. -- Both trackers,
  same PR, every time.
- [ ] `CLAUDE.md` -- add the Story 4.11 key decision. -- The architecture record.

**Acceptance Criteria:**
- Given a bearing crossing terrain of height `h` at distance `d₀`, when the model is evaluated, then reach is
  `d₀ + (radarRange²/4)(1 − h/H)/d₀` and is INFINITE-in-effect (dark to the rim) when `h ≥ H` — and the
  formula lives in exactly one shared function called by both `signals.ts` and the client march.
- Given a ship crossing into a shadow, when it is painted, then its return fades through the weakest band
  rather than cutting at a line, and the fade's zero is the same reach the gate uses — one function, one root.
- Given a shadowed region, when the scope draws it, then it reads as grey NO-DATA out to the rim, visually
  distinct from every return band AND from empty water, at one fixed opacity with no strength channel.
- Given two ships and no terrain between them, when either paints the other, then neither occludes the other
  — ships never shadow ships, at any range or aspect.
- Given a low island between an observer and a distant ship, when the sweep crosses that bearing, then the
  server DOES disclose the blip where today it does not; and given hard cover on the same bearing, then it
  does not.
- Given the seeded random-world perception invariant, when it runs under all four radar-mode combinations,
  then nothing reaches a client that its sight or this-tick paints have not legitimately revealed, and blip
  multiplicity is exact.
- Given the near-range dimming, when own ship moves away from an existing paint, then that paint is displayed
  MORE brightly while continuing to decay — and its stored record is byte-identical throughout.
- Given `npm run check`, when it runs, then lint (complexity ≤ 10), all three type-checks, and all tests pass.

## Spec Change Log

## Review Triage Log

### 2026-08-08 — Review pass

Two adversarial reviewers (Blind Hunter, Edge Case Hunter) plus a cross-model Codex pass on the same
diff. Verdict: **build-on-it** — nothing found corrupts state, desyncs prediction, or leaks perception.

- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 5, low 2)
- defer: 5: (high 0, medium 2, low 3)
- reject: 1: (high 0, medium 0, low 1)
- addressed_findings:
  - `[medium]` `[patch]` **The model was asymmetric — a one-way radar-stealth pocket.** `visibilityTo`
    folded the TARGET's own raster cell (the observer's was exempt, the target's was not), so a hull
    whose centre rounds into a hard-cover cell read visibility 0 from every bearing while reading 1 in
    reverse — contradicting the spec's Always clause. Flagged by both Fable reviewers. Fixed with a
    two-ended exemption (a cell never occludes a query point inside it), pinned by a 16-bearing symmetry
    ring, a 4,000-pair randomized sweep, and a test that the exemption is exactly one cell wide.
  - `[medium]` `[patch]` **The annulus tier cut where the AC requires a fade.** Beyond truesight a hull
    arrives only as a wire echo, and my implementation ruling left that path unshadowed on amendment
    127's grounds — so a 5%-illuminated hull painted at full strength then vanished. Flagged
    independently by Blind Hunter and Codex. Fixed by attenuating the echo by its own visibility with a
    floor at `min(raw, minPeak)`: suppression stays forbidden, dimming does not, and the floor is what
    discharges amendment 127.
  - `[medium]` `[patch]` **The cross-seed guardrail amendment 184 promised was never built.** Added; it
    measures the shipped generator at 45.2% pooled absolute cover (not the 38.8% amendment 177 recorded
    — my original probe stopped marching once a bearing went dark and undercounted). Pinned against
    measured truth with derived bands; see amendment 191.
  - `[medium]` `[patch]` **A non-finite own pose blanked the ENTIRE radar layer.** A Pixi sprite mask
    clips to its own frame, so a NaN pose hid every heat and silhouette blip rather than degrading. The
    codebase already treats a non-finite observer as reachable (`marchable` guards it). Now detaches the
    mask — an undimmed scope beats a hidden one.
  - `[medium]` `[patch]` **The perception oracle no longer mirrored the gate.** Its far-end rule excluded
    cells entered past the target but not the cell CONTAINING it; it passed only because no seeded world
    had yet placed a hull centre inside a land cell. Re-derived from slab geometry (exit ≤ len), not
    copied from production, with a directed 16-bearing test.
  - `[low]` `[patch]` **Three overstated parity claims** in load-bearing comments — "agree bit-for-bit",
    a "half a raster cell" lag bound that is really ~13u (up to ~17u diagonal), and "fails open
    identically on both sides". In this module an overclaiming comment is a documented hazard
    (amendment 148). Corrected to state that the divergence is safe by DIRECTION, not absent.
  - `[low]` `[patch]` **The perf Block-If was undischarged in the deliverable** — measured but not
    recorded. Numbers now in Auto Run Result below.

## Auto Run Result

**Status: done.** Cycle 68, version 0.17.68, `PROTOCOL_VERSION` unchanged at 31.

**What changed.** Terrain occlusion was in two contradictory states: the server deleted any blip whose
line crossed an island polygon at any range however low, while the client painted straight through
everything (cycle 62 removed occlusion on the promise 4.11 would restore it). One shared pure module now
answers both. A ray folds each land cell it enters into a single running scalar
`aMin = min(u_i/d_i + d_i/K)`; `vis(D) = clamp01(D·(aMin − D/K))` is the illuminated fraction of a target
at `D`, **and its root is the reach**, so the soft edge and the gate are the same function rather than
two rules that can drift. O(1) per sample. Plus Eric's side task: a live radial dim mask that quiets the
scope inside the range where he aims by eye.

**Files changed:**
- `shared/src/sim/radarShadow.ts` (NEW) — the one model: two-ended cell exemption, DDA over the 14u
  raster with pyramid skips, `beginShadowWalk`/`advanceTo`/`visibilityAt`/`reach`/`visibilityTo`.
- `shared/src/constants.ts` — `CONFIG.vision.radarMastQ = 64`, fixed and unpurchasable.
- `shared/src/__tests__/radarShadow.test.ts` (NEW), `zone.test.ts` — the I/O matrix, both closed forms,
  the symmetry sweep, the cross-seed hard-cover pin, and the build-failing `2RH = radarRange²/4` pin.
- `server/src/game/signals.ts` — `blipGate`'s LOS term becomes `visibilityTo(...) > 0`; `losClear` and
  its five other callers byte-identical. `SignalContextBase` carries the raster.
- `server/src/game/perception.ts` — both contexts pass `world.map.heightRaster`.
- `server/src/__tests__/islandFixture.ts` + 11 test files — the raster fixture seam (`rasterFrom`,
  `flatRaster`, `ridgeField`); the blip oracle re-derived independently; golden frames re-recorded.
- `client/src/render/radarMarch.ts`, `radarField.ts`, `radarHeatmap.ts`, `radar.ts`, `textures.ts`,
  `config.ts` — the shadow in the march, the NO-DATA third channel, the grey token, the dim mask.
- `VERSION`, `package.json`, both trackers, `CLAUDE.md`.

**Review findings:** 7 patches applied (5 medium, 2 low), 5 deferred, 1 rejected, 0 intent gaps, 0 spec
defects. Each patch carries a regression test observed FAILING before its fix.

**Verification:** `npm run build -w shared` then `npm run check` — **exit 0, 3,584 tests** (624 shared /
1,000 server / 1,960 client), lint clean at complexity ≤ 10, all three type-checks clean.

**Measured cost (the AC required measured, not assumed):**
- *Server* — the new gate is CHEAPER than the `islandBlocksSegment` path it replaces, measured on the
  same fixture in the same run: 0.54 µs vs 0.74 µs on open water, 1.43 µs vs 2.58 µs on a land-crossing
  bearing. Adversarial 20×20 pair count: 278 µs vs 423 µs per tick — 0.6% of a 50 ms tick.
- *Client* — DEARER, not cheaper: 1.55 / 0.81 / 0.80 ms at 0.5× / 1.0× / 1.5× zoom on a median-land
  observer, and 1.97 / 1.38 / 1.24 ms on the most-coastal observer, against a pre-change baseline of
  1.50 / 0.89 / 0.84 ms and a 2.5 ms bar. Live cells +92% on a coastal scope, because no-data cells are
  stored. **Amendment 183's prediction that the reach short-circuit would make the march cheaper is
  FALSE** — the saved field queries do not pay for the stored grey.

**Residual risks:**
1. **Client headroom at min zoom is now thin** — 1.97 ms against 2.5 ms on an adversarial coastal
   position, and the dim mask routes `blipLayer` through a Pixi `MaskFilter` render-target pass that a
   headless harness cannot see and which is NOT in that number. First thing to watch on real hardware.
2. **Invisible occluders** (deferred): sub-`minIslandArea` blobs are dropped from `islands[]` but stay
   LAND in the raster, so they now delete blips from water that draws as empty.
3. **The visual change is larger than anything predicted it** — a tall island paints a ~12-32u seaward
   rim with a grey body behind it (amendment 188). Correct and still legible, but Eric approved the
   current island look as recently as cycle 66 and should see this before it is called right.
4. **Amendment 102's ratified "coast-hugging carries a real cost" does not hold for low terrain**
   (amendment 186) — the formula says you look over it. Hard cover is unaffected.
5. The gate is a point predicate while the paint is a footprint (deferred) — bounded and not
   exploitable, but they are not the same predicate.

## Design Notes

**The formula's semantics were being misread, and that is the most expensive thing this spec fixes.**
`shadowLength` is a RESIDUAL REACH, not a dark band followed by clear water. From amendment 101's uniform
antenna height, the clearance of a ray between two points at height `H` separated by `D` is
`z(x) = H − x(D−x)/(2R)`, so `visible ⟺ z(d₀) ≥ h₀ ⟺ D ≤ d₀ + 2R(H−h₀)/d₀`. `z(d₀)` strictly decreases in
`D`: once a bearing is blocked it stays blocked, to the rim. See amendment 176.

**The soft edge is derived, not tuned — no new constant.** Solving the same clearance condition for the
minimum visible TARGET height at distance `D` gives the illuminated fraction directly:

```
u_i  = 1 − h_i/H                      // per land sample
a_i  = u_i/d_i + d_i/K                // K = radarRange² / 4
vis(D) = clamp01( D · (min_i a_i − D/K) )
```

`vis` equals `u_i` at the obstacle, falls monotonically, and hits exactly 0 at `d_i + shadowLength_i` — so
the gate's reach is this function's own root rather than a second rule beside it. Because the per-obstacle
form factors as `D·(a_i − D/K)`, the minimum over every obstacle crossed is a SINGLE RUNNING SCALAR. That
is what makes it affordable server-side at 20Hz.

**Per-cell accumulation is correct here, and per-step would be wrong to insist on.** `marchRay` dedups
consecutive samples landing in the same cell. For an INTEGRAL (optical depth) that would under-integrate;
for a MIN over obstacles it cannot, because the same cell yields the same height. Do not "fix" the dedup.

**Why the client and server can share one function while asking different questions.** The client asks "how
bright is this sample" and the server asks "may this blip exist". Neither leaks: the client's beam march
paints ships only from data the server already disclosed (sighted `Contact`s, and resolved wire echoes), so
a client-side shadow is presentation over authorised data, while the server's is authoritative. The shared
function is what stops the two answers drifting.

**The three traps that would silently undo this work**, all found in the survey and all previously shipped
in this module's history:
1. A no-data marker cannot ride the intensity channel — `minStore` (`radarMarch.ts:382`) drops anything
   below `bands[0].at`, and `quantizeInto` skips `!(w > 0)`.
2. It cannot ride the alpha channel either — `writeCell` uses `Math.fround(alpha)` as its PRIMARY compare,
   and alpha only works as an ordering key because `blipAlpha` is monotone in age. Anything else in there
   re-creates the "repainting doesn't repaint it" bug of cycles 61–64.
3. `pushCell`'s max-wins merge across adjacent rays will let an unshadowed neighbour overwrite a shadowed
   reading and soften the edge. The third channel needs its own explicit merge rule.

**And the mask trap:** `fitHeat` calls `sprite.destroy()` and `addChild`s a NEW sprite whenever the buffer
resizes, so a mask assigned to `heat.sprite` vanishes on the next zoom change. Attach to `blipLayer` — which
also covers the `silhouette` grammar's Graphics pool, and correctly leaves the sweep wedge and range rings
(in `sweepLayer`) unmasked.

## Verification

**Commands:**
- `npm run check` -- expected: lint + all three type-checks + all tests green, no complexity errors.
- `npm test -w shared` -- expected: the new `radarShadow` suite and the extended `zone` ladder pins pass.
- `npm test -w server` -- expected: the perception invariant passes under all four radar-mode combos with
  the re-derived blip oracle; golden-frame snapshots updated deliberately, not blanket-refreshed.
- `npm test -w client` -- expected: heatmap/march/viewport suites pass, including the shadow fade, the
  no-data channel and the adapter-level mask pin.

**Manual checks:**
- Confirm on the water that a shadow reads as grey NO-DATA to the rim, that a coastal graze costs almost
  nothing, and that standing off a soft-cover island visibly lengthens reach on that bearing.
- Confirm the near-range dimming quiets the scope inside truesight without hiding anything, and that a paint
  brightens as own ship pulls away from it while still fading with age.
