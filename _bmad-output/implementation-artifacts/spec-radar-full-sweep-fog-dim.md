---
title: 'Radar returns the entire sweep; the near-range dim follows the fogged eye'
type: 'bugfix'
created: '2026-10-21'
status: 'in-review'
baseline_commit: '4a5715e9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/investigations/fog-occludes-radar-investigation.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The server withholds radar paint for anything inside the observer's geometric sight radius (`inRadarAnnulus`, the wake inner bound, the contact-first `else if` in perception), relying on the client to synthesize echoes for sighted hulls. When fog hides a hull inside that radius, neither path delivers it: the player gets no radar information at all (Eric 2026-10-21: "That first clause ... is dead wrong. I *always* get radar information."). Epic-9 amendment 163 ("dark to both") is superseded.

**Approach:** The server returns the ENTIRE sweep: every ship, decoy and wake segment inside radar range that the beam crosses this tick, at any distance, through the usual height-aware shadow and dropout. The client stops synthesizing radar paint from sighted contacts and wake sources and draws only what the wire delivers. The near-range dim mask and its look stay exactly as they are; its inner radius becomes per-bearing, following where the observer's fog-tolled eye actually ends on that bearing, with a client dial for how far fog-blinded returns are unmuted.

## Boundaries & Constraints

**Always:**
- Fog has NO term in the radar path, anywhere (amendment 149 stands). Radar paints through fog at every range.
- Radar's island rule everywhere is the height-aware shadow march (`visibilityTo`); the eye keeps binary island LOS. Islands still block the eye; a hull behind cover ≥ mast height stays dark to radar (2026-08-02 stands at radar's own rule).
- The anti-cheat invariant (sight ∪ this-tick radar paints; SIX exceptions) holds unchanged; in-bubble paints are this-tick radar paints. No seventh exception.
- `effectiveStats`/`effectiveSight` remain the only sight derivations; `fogTollAlong` the only fog cost. The new eye-reach function lives in shared `sim/fog.ts`, pure and transcendental-free.
- The dim look with no fog is unchanged: 20 % floor across the bubble, linear to full at the flash rung (6/12). `minScale`, `innerFactor`, `outerFactor` untouched.
- The new client dial (`fogLift`, 0..1) scales how far the ramp slides inward on a fogged bearing: 0 = today's radial mask, 1 = the whole ramp starts where the fogged eye ends. Ship at 1; Eric tunes on staging.
- Sweep-gated, shadow-marched, dropout-rolled in-bubble paints use the server's existing `blipGate`/`wakeGate` clauses in their existing cost order.
- PROTOCOL_VERSION bump (client behaviour changes against the same wire: an old client would double-paint).
- Trackers stamped in this PR; amendment 210 (supersedes 163, the client synthesis of amendments 88/154, the wake inner bound) appended to epic-9 amendments; CHANGELOG + VERSION (+1 cycle).

**Ask First:**
- Ships inside the observer's OWN lit zone are today withheld from the blip row ("already a full contact"). Spec includes them in the sweep (the entire sweep); Eric may veto.
- Bots: `sweepMiss.ts` treats a plot in fog ≥ ½ as "not a sweep miss" (amendment 169, reasoned off 163). Spec deletes that clause (radar now sees through fog everywhere, so an empty sweep IS evidence); Eric may veto.
- Any change to the visible fog HOLE (render/fog.ts, radial) is out of scope unless Eric asks.

**Never:**
- No per-contact or fog term on the server's radar paint strength; no new wire fields; no schema spatial fields.
- Never recompute or mutate frozen paint records (amendment 83); the dim stays a display mask on `blipLayer`.
- Never pin ring/ladder literals in tests; derive from CONFIG.
- No in-game copy.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clear water, hull at 300 u, beam crosses | sighted contact | contact row AND a blip row (sweep-gated, shadow 1, dropout p=1) | N/A |
| Observer in solid fog, hull in clear water at 300 u | eye toll fails, d < sight | no contact; a blip each revolution | N/A |
| Observer clear, hull in a bank at 400 u | eye toll fails | no contact; a blip; the dim mask on that bearing starts at the bank's edge, so the blip is unmuted | N/A |
| Hull behind a low island at 300 u, clear | eye LOS blocked, vis > 0 | no contact; a partial blip (radar's island rule) | N/A |
| Hull behind hard cover ≥ mast at 300 u | vis = 0 | nothing | N/A |
| Torpedo wake inside the detect rung | swept, vis > 0 | wake segments disclosed like any radar return | N/A |
| No fog (cut = FOG_NO_CUT) | any bearing | eye reach = sight on every bearing; mask texture identical to today | N/A |
| `fogEyeReach` with non-finite pose / range ≤ 0 | NaN inputs | returns the range (no shortening); mask falls back to radial | never throws |
| fogLift = 0 | fog present | mask identical to today | N/A |
| Spectator (no own pose) | pose null | mask detached (as today); no reach computed | N/A |

</frozen-after-approval>

## Code Map

- `server/src/game/signals.ts:558` `inRadarAnnulus` -- the inner edge; `:1344` `wakeInnerBound`, `:1362` `wakeGate` (in-bubble torpedo-water clause :1370-1375), `:1409` `sweepMayCrossWake` inner cull, `:1077`/`:1126` own-lit-zone exclusion. Docs :543-557, :575, :1044, :1118, :1329-1361, :1450-1487, :2327.
- `server/src/game/perception.ts:177` contact-first `else if` in `shipScan`; header :15-19, :165-170.
- `server/src/game/ai/sweepMiss.ts:105` `wouldPaint` sight clause; `:26-37`, `:143-146` fog limit (169). `ai/utility.ts:638` `foldView` folds blips before contacts (in-bubble blip would smear a live plot; fold contacts first or skip blips within association range of a live contact).
- `shared/src/sim/fog.ts:273` `fogTollAlong` -- add `fogEyeReach(field, ox, oy, angle, range, tMs, cut)`: march outward from the observer along the bearing, accumulating toll per step (own-bank rule via the same `marchDensity` idiom), return the first `d` where `d + toll ≥ range`, else `range`.
- `shared/src/constants.ts:2319-2323` "NO RADAR TERM ... dark to BOTH" comment; `shared/src/sim/radarRaster.ts:1-12`, `:536-541`, `:812-818` synthesis comments; `shared/src/sim/wake.ts:104-115`.
- `shared/src/index.ts:892` PROTOCOL_VERSION 90 → 91; pins: `server/src/__tests__/denials.test.ts:275`, `colyseus018.test.ts:170,249`, `shared/src/__tests__/barrel.test.ts:475`, `radarRaster.test.ts:187`, `client/src/__tests__/ordnanceMasksAreServerOnly.test.ts:77,149`.
- `client/src/render/radar.ts` -- remove `shipStamp` (:1241), `wakeStamp` (:1224), `setWakeSources` (:1151), fields :398-403, the `contacts` param through `render`/`renderReturn`/`marchBeam` (:920-1008); keep `marchEcho`/`marchWake` (wire paths) and `sightHoleU`. `syncDimMask` (:1081) / `updateDimMask` (:1034): re-bake when the reach fan changes (fog cadence or a move past a threshold), not only on `sightHoleU`.
- `client/src/render/radarField.ts:528` `buildShipStamp`, `:276` `EchoHull`, `FieldSpec.ships` (:700) → optional/empty.
- `client/src/render/wake.ts:460-657` `WakeStampCache`, `buildTruesightWakeStamp`, `innerBoundU`, `segmentRevealable`, `nearIslands`, the three stamp constants; keep `WakeSources`.
- `client/src/render/textures.ts:199` `drawDimMask` / `:287` `bakeDimMaskTexture(sightU, into)` → `(sightU, into, reach?: Float32Array)`; per-bearing wedge fills, each with its own radial gradient (`r0 = reach_k`, `r1 = reach_k + (outerU − innerU)`), precedent `drawHaloMask`/`traceLosFan` (:335-373).
- `client/src/render/radarDim.ts` -- `dimScaleAt(distU, sightU, reachU = sightU)`: ramp translated inward by `(sightU − reachU) × fogLift`.
- `client/src/render/fogField.ts:143` `FogFieldView` -- expose a reach-fan caster (`eyeReachFan(ox, oy, sightU, tMs, rays)`) over its private field + eased cut; or a public getter for field/cut.
- `client/src/config.ts:3462` `dim` -- add `fogLift: 1`, `reachRays` (e.g. 120), `reachRecastMoveU`.
- `client/src/main.ts:4334`, `:3014`; `render/ambient.ts:256,315,325`; `render/ambientScene.ts:514` and `stage/worstCaseScene.ts:686-701` (their fake servers must emit in-sight blips too, or menu hulls lose their echo).
- Tests: server `perception.test.ts:3284` (`blipPredicate`), `:3872-3883` (`wakeDisclosed`), header :88-97, directed cases :927, :978, :2404, :2506-2581, :5100; `signals.test.ts:276-293`; `radarWire.test.ts:164-179`; `goldenFrames.test.ts:988` + snapshot re-record; `botPlot.test.ts:610-621`. Client `radarEcho.test.ts:718-881`, `wake.test.ts:372-850,1014-1046,1120+`, `radarViewport.test.ts:575-595,1052-1200`, `hullOverRadar.test.ts:164-211`, `dimMaskLifetime.test.ts`, `ambient.test.ts:324`, `worstCaseScene.test.ts:245-260`, `radarHeatmap`/`radarMarch` fixtures using `buildShipStamp`.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/fog.ts` + `shared/src/__tests__/fog.test.ts` -- add `fogEyeReach`; tests: no fog → range; solid bank ahead → shorter; own bank free; NaN → range; monotone in range.
- [x] `shared/src/constants.ts`, `sim/radarRaster.ts`, `sim/wake.ts`, `index.ts` -- comments; PV 91.
- [x] `server/src/game/signals.ts` -- drop the inner edge in `inRadarAnnulus`, `wakeInnerBound`, `wakeGate`, `sweepMayCrossWake`; drop the own-lit-zone blip exclusions; docs.
- [x] `server/src/game/perception.ts` -- independent `if`s in `shipScan`; header docs.
- [x] `server/src/game/ai/sweepMiss.ts`, `ai/utility.ts` -- `wouldPaint` uses the shadow march whenever a raster exists; delete the fog-limit clause; fold contacts before blips so an in-bubble blip never smears a live plot.
- [x] server tests -- re-cut the oracle and directed cases listed in the Code Map; re-record goldens; move PV pins.
- [x] `client/src/render/radar.ts`, `radarField.ts`, `wake.ts`, `main.ts`, `ambient.ts`, `ambientScene.ts`, `stage/worstCaseScene.ts` -- remove synthesis; widen the two fake servers' blip gates to the whole sweep.
- [x] `client/src/render/radarDim.ts`, `textures.ts`, `fogField.ts`, `config.ts`, `radar.ts` -- per-bearing reach fan, wedge bake, `fogLift` dial, re-bake cadence.
- [x] client tests -- delete synthesis suites; re-cut dim tests (radial identity at no fog; a fogged bearing's floor ends at its reach; fogLift 0 = today); PV pin.
- [x] `VERSION`, `package.json`, `CHANGELOG.md`, both trackers, epic-9 amendment 210, `docs/codebase-map.md` lines.

**Acceptance Criteria:**
- Given a swept hull at any distance ≤ radar range with vis > 0, when a frame is built, then it carries a blip for that hull (and a contact too when sighted).
- Given no fog, when the dim mask is baked, then it is texel-identical to the radial bake at the same `sightU`.
- Given a bearing whose fogged eye reach is R < sight, when the mask is baked with fogLift 1, then the floor on that bearing ends at R and full strength begins at R + (outer − inner).
- Given the property suite, when run with fog seeded, then no frame references anything outside sight ∪ this-tick paints and completeness demands every gated in-bubble paint.
- Given `npm run check`, then lint (complexity ≤ 10), tsc and all three test suites are green.

## Spec Change Log

- **2026-10-21 — Review gate (Blind Hunter + Edge Case Hunter + Acceptance Auditor on Fable, Codex gpt-5.6-sol).** Findings → changes:
  - P1: a non-float32-representable sight read every clear bearing of the Float32 fan as short, so the 120-wedge bake ran every cadence → `dimSlideU` reads `reach ≥ min(sight, fround(sight))` as clear; `dimFanSlides` follows.
  - P2: bots skipped every paint within `ANON_ASSOC_U` of a sighted hull, hiding a second hull or decoy beside it → a paint is skipped only when its coverage rect (± one cell) covers the sighted hull's cell (`paintCoversSighted`).
  - P3: with no inner bound the observer's own hull ribbon painted its own scope and fed the bot its own course → `wakeScan` skips the ribbon keyed `me.id` (own torpedo water still paints); `blipGate`/`wakeGate` return false at zero distance; the perception oracle excludes both.
  - P4: the "open water until its wire blip arrives" client test could not fail → replaced by a range-blind contract: the same wire rect inside and beyond the sight circle paints the same footprint, cell for cell.
  - P5: guards → `reachRays` clamped to a whole non-negative count; `reachDue` false on a non-finite clock; `dimRampU` writes a zero ramp for a bad sight; `fogEyeReach` reads a non-finite cost as no fog and a range ≤ one march step as one charged step (as `fogTollAlong`).
  - P6: dead wake bookkeeping → `wakeSourceObserved`, `WakeSource.observed`, `WakeSources.version`, `WAKE_OBSERVE_GRACE_MS` and `FASTEST_BOOSTED_HULL_SPEED` removed with their tests; deferred-work entry RESOLVED.
  - P7: comment drift (main.ts teardown, worstCaseScene near/far, radar.ts hull-source header, ai/types.ts `fogAt`, sim/wake.ts `torp`) → re-worded to what the code does now.
  - P8: CONFIG.fog comment still stated amendment 169's "a fogged plot is not a miss" as live → marked superseded by amendment 210.
  - P9: `FOG_COVER_DENSITY = 0.5` duplicated `FOG_SOLID_DENSITY` → now aliases it.
  - P10: a due cast reproducing the last baked fan re-baked and re-uploaded → the Radar keeps the last baked fan in a preallocated array and skips an identical bake.
  - P11: doc nits → `fogLift` doc notes the innerFactor-1 assumption; worstCaseScene says every hull paints; "amendment 213" citations read "epic-4 amendment 213".
  - P12: the bot-fold deferred-work entry → the second-hull/decoy half RESOLVED by P2; the own-zone decoy arriving twice stays OPEN (Eric's call).
  - P13: this entry.
  - Implementer readings that differ from the I/O matrix wording: (1) `fogEyeReach` returns 0 for `range ≤ 0` and NaN for a NaN range (the matrix row said "returns the range"); the mask reads both as "no slide", so the visible behaviour is the same. (2) The texel-identity AC is proven by identical recorded 2d draw-call logs (radial bake vs an all-sight / fogLift-0 fan), because jsdom cannot rasterize.
  - KEPT: the radial code path stays byte-identical; the wedge bake is reached only when a fan slides.

## Design Notes

- The ramp SLIDES, it does not step: `scale(θ, d) = radial(d + (sight − reach(θ)) × fogLift)`. With no fog every reach equals sight and the expression is today's curve. A dial at 0 is a byte-identical bake.
- Server and client fog marches differ by ≈ one cell (the server walks a 10 u memo lattice at a ≤ 500 ms stale epoch; the client marches the shared field at the eased cut). The mask is presentation only, so that tolerance is fine; the server's gate decides what exists.
- Bake cost: N wedges × one radial-gradient fill on a 1024² canvas, on the fog refresh cadence (250 ms) or a move past `reachRecastMoveU`; never per frame.

## Verification

**Commands:**
- `npm run build -w shared` -- expected: clean.
- `npm test -w shared && npm test -w server && npm test -w client` -- expected: green, counts recorded in the PR.
- `npm run check` -- expected: green.
- `grep -rn "dark to both\|inRadarAnnulus\|wakeInnerBound\|shipStamp\|buildTruesightWakeStamp" shared server/src client/src` -- expected: only history notes, no live rule.
