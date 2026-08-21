---
title: 'Nameplates draw above terrain and hulls'
type: 'bugfix'
created: '2026-08-21'
status: 'done'
baseline_revision: '7a8cbfce2e4b1f7d3ff90c75dbee283bf9b7b267'
final_revision: 'cfdff1e4a2c232ca43ee6f07049f92b43a5a3ab5'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Eric: *"in game, names need to appear above all players and in front of islands, not behind. they should never be obscured by terrain."* `createStage()` mounts the stage roots `worldRoot, plateRoot, fogSprite, chartRoot, hudRoot`, so `plateRoot` sits below **everything** in `chartRoot` — including `map` (island bodies and contour bands, drawn with opaque `alpha: 1` fills at `render/map.ts:152-155`) and `ship`. Every callsign is therefore painted over by any island it crosses and by every hull silhouette.

**Approach:** Move the nameplate container out of its own stage root and into `CHART_LAYER_ORDER` as the `plate` layer, seated directly between `ship` and `aim` — one array index that carries both halves of the ruling (over terrain and hulls, under the reticle). Its contents stay screen-space via an inverse transform written in `applyCamera`. Carry the fog's sight-boundary feather onto the plate's own alpha — the exact move made for hulls in epic-5 amendment 22, which keeps DESIGN.md's *"plates fade in/out with truesight resolution"* true now that the fog composite no longer covers them. Promote the root mount order to a declared, exported array that `createStage` actually builds from, so the new order is assertable — closing the `deferred-work.md` entry that named this gap by name.

## Boundaries & Constraints

**Always:**
- The root mount order becomes declared data (`STAGE_ROOT_ORDER`) that `createStage` *iterates* to build and mount the roots, with a build-failing exhaustiveness constant in the style of `EVERY_LAYER_PLACED`. The array must BE the order, not a comment about it.
- The nameplate container becomes the `plate` CHART LAYER, seated in `CHART_LAYER_ORDER` directly between `ship` and `aim` (Eric, 2026-08-21: *"i think i should be able to see aiming reticles over it. Just not terrain."*). The `plateRoot` stage root is retired; new root order `worldRoot, fogSprite, chartRoot, hudRoot`, with the other four keeping their relative order byte-identical.
- The plate layer's contents stay in SCREEN space: `applyCamera` — the one documented site the camera transform is written — also writes its exact inverse onto that container, so a plate placed at screen `(x, y)` renders at screen `(x, y)` at every zoom and under shake. It must degrade to identity on a zero or non-finite zoom rather than dividing to Infinity.
- A contact plate's alpha becomes `fader × softness(x, y)` — the SAME `HullSoftness` product `ContactViews.render` already applies to the hull (`contacts.ts:255`) and to the aggro mark (`contacts.ts:281`). One softness value per hull per frame; do not compute a second one.
- The own-ship plate stays at alpha `1` (`main.ts` `updateOwnPlate`) — the observer is at distance 0, so its softness is 1 by construction.
- The omniscient reveal still HIDES the fog rather than fading it (`Fog.setVisible(false)`). Behaviour unchanged; the *rationale comments* that justified it by "plateRoot sits below fogSprite" are now false and must be rewritten.
- Client-only. `PROTOCOL_VERSION` stays **47**. No `CONFIG` value, no gameplay tunable, no perception rule moves.
- ESLint complexity ≤ 10; `npm run check` green.

**Block If:**
- Achieving the ruling would require plates above `aim`/`hudRoot`, or would require changing what the server discloses. Neither should arise — this is pure paint order over data the client already holds — but HALT rather than widen if either does.

**Never:**
- Never lift plates above `aim`, `burstFx` or `sweep`: the reticle, aim preview, burst rings and sweep read OVER a name (Eric's second clause), which extends the hull lift's own rule to labels rather than breaking it.
- Never lift plates above `hudRoot`: the chrome bar, hotbar, vitals, vignette and foghorn chevrons must stay on top of a floating callsign.
- Never change which hulls get a plate, nor plate text, colour, latch discipline, `NAME_MAX`, `DRONE_PLATE_TEXT`, or `plateScreenY` geometry.
- Never edit `WORLD_LAYER_ORDER` / `HUD_LAYER_ORDER`, nor the relative order of any existing `CHART_LAYER_ORDER` entry — `plate` is inserted, nothing is reshuffled.
- No new wire field, no PV bump, no new CONFIG knob, no `Container.zIndex`/`sortableChildren` (the scene's stacking rule is mount order, and mixing the two makes it unreadable).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plate over terrain | contact hull in front of / behind an island band | plate text draws ON TOP of the opaque island fill and contour bands | none needed |
| Plate over a hull | two hulls overlapping on screen | both plates draw above both silhouettes | none needed |
| Reticle over a plate | crosshair / aim preview overlapping a callsign | the reticle draws ON TOP of the name | none needed |
| Screen-space round trip | plate placed at screen `(x, y)`, chart at any zoom 0.26-1.5, with or without shake | renders at screen `(x, y)` — the inverse cancels the parent exactly | zoom `0` / NaN / Infinity ⇒ inverse skipped, container left at identity, plates still drawn |
| Bubble-rim softening | contact at `dist ≥ sightU` from own pose | plate alpha = `fader × (1 − FOG_FILL_ALPHA)` — numerically what the fog composite used to give it | non-finite dist/sight ⇒ `hullSightSoftness` returns 1 (fail toward VISIBLE) |
| Clear centre | contact at `dist ≤ sightU × HOLE_FEATHER_START` | plate alpha = `fader × 1` — unchanged from today | none needed |
| Own star-shell lit zone beyond the bubble | contact inside an owned `OwnZone` | softness exempted to 1, so the plate stays full — same exemption the hull gets | none needed |
| Own ship | own pose, any zoom | alpha `1`, position unchanged | none needed |
| Spectate / omniscient reveal | `g.hullSoftness = NO_SOFTENING`, fog hidden | every revealed plate at its fader alpha, drawn above the full-disc island chart | none needed |
| Fading-out contact | contact pruned, `fader` decaying | plate fades with the hull; product never inverts the fade (softness ∈ (0, 1]) | none needed |

</intent-contract>

## Code Map

- `client/src/render/stage.ts` -- `createStage()` mounts the five roots inline (`app.stage.addChild(worldRoot, plateRoot, fogSprite, chartRoot, hudRoot)`, ~line 327); the header comment block documents the z-order contract; `EVERY_LAYER_PLACED` is the pattern to mirror for roots.
- `client/src/render/contacts.ts` -- `ContactViews.render` computes `softness(p.x, p.y)` once (line 255) and passes it to the hull and `driveAggro`; `drivePlate` (line ~288) currently places the plate with bare `fv.fader.alpha`.
- `client/src/render/nameplates.ts` -- `NameplateLayer.place(id, x, y, alpha)`; no change needed, it already takes an alpha.
- `client/src/render/fog.ts` -- `hullSightSoftness(distU, sightU)`, the exported feather curve; `Fog.setVisible`.
- `client/src/main.ts` -- `updateOwnPlate` (own plate, alpha 1); `hullSoftnessFor` (~line 3473) builds the per-frame `HullSoftness`; `enterSpectateVisuals` (~line 3779) carries the now-false "plateRoot sits BELOW fogSprite" rationale.
- `client/src/render/map.ts:152-155` -- island bands filled `alpha: 1` into `layers.map`; the thing that was covering the plates.
- `client/src/__tests__/hullOverRadar.test.ts` -- the precedent pin for the `ship` lift and the declared-order assertions; the new test mirrors its shape.
- `client/src/__tests__/fog.test.ts:70-82` -- comment stating the root mount order is *"asserted only by inspection ... rather than by a test here"*; false once `STAGE_ROOT_ORDER` exists.
- `client/src/render/ambient.ts:221,239` -- the home/ambient scene reuses `layers.map` and `layers.ship` on the same stage but adds NOTHING to `plateRoot`, so it renders no plates and the reorder cannot affect it. Confirm, do not change.
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md:210` -- the z-order row whose closing clause (*"nameplates did NOT follow it and stay under the fog"*) this ruling supersedes.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the open entry "THE STAGE'S TOP-LEVEL LAYER ORDER IS NOT ASSERTABLE" that this closes.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/stage.ts` -- retire the `plateRoot` root and add `plate` to `StageLayers` + `CHART_LAYER_ORDER` between `ship` and `aim`; add `StageRootName`, `STAGE_ROOT_ORDER` (`worldRoot, fogSprite, chartRoot, hudRoot`) and `EVERY_ROOT_PLACED`, and build the roots by iterating that array; extend `applyCamera` to write the inverse chart transform onto the plate container, skipping it on a zero/non-finite zoom. Rewrite the header z-order block and the layer doc comments. -- One array index expresses both halves of the ruling; the declared root order closes the deferred-work gap for the same cost the three sub-orders already pay.
- [x] `client/src/render/contacts.ts` -- thread the frame's `softness` into `drivePlate` and place the plate at `fv.fader.alpha * softness(gp.x, gp.y)`, reusing the position it already reads. Document that the feather moved onto the plate because the plate moved above the fog. -- Preserves DESIGN.md's "plates fade with truesight resolution" now that the fog composite no longer dims them; identical treatment to the hull and aggro mark.
- [x] `client/src/main.ts` -- rewrite `enterSpectateVisuals`'s "THE FOG IS HIDDEN, NEVER FADED" rationale paragraph: the conclusion (hide, never fade) stands, but its premise (plates under the fog, hulls above it) is dead — both are above it now, so a fade would dim the whole revealed water uniformly and still be wrong. Leave `updateOwnPlate` alone. -- A comment asserting a stacking that no longer exists is the next agent's trap.
- [x] `client/src/__tests__/nameplatesAboveTerrain.test.ts` -- new file pinning: (a) `plate` sits above `ship` and `map` and below `aim`/`burstFx`/`sweep`, exactly `ship + 1` and `aim - 1`, with `ship === blip + 1` re-pinned; (b) `STAGE_ROOT_ORDER` is the four roots, chart above fog, no duplicates, `EVERY_ROOT_PLACED` true; (c) `applyCamera`'s inverse ROUND-TRIPS a child point back onto itself at zoom 0.26-1.5 and under shake, writes scale exactly `1/zoom`, leaves the forward world/chart transform unchanged, and degrades to identity on zoom `0`/negative/NaN/Infinity; (d) no HUD layer is in the chart order; (e) the plate feather matrix — full alpha in the clear centre, `1 − FOG_FILL_ALPHA` at the rim, never 0, monotone, and 1 on non-finite input — exercised through `hullSightSoftness` exactly as a plate consumes it; (f) `NameplateLayer.place` writes the composed alpha and sets `visible = alpha > 0`. -- The I/O matrix's edge cases, and the assertion the deferred-work entry asked for.
- [x] `client/src/__tests__/hullOverRadar.test.ts` -- split its "nothing slipped in on either side" assertion: `ship === blip + 1` stays as its own case, and the `aim === ship + 1` half becomes `plate === ship + 1` / `aim === plate + 1`, with a comment recording that the plate deliberately took that seat and that the RULE (a hull never occludes the aim marks) is unchanged. -- A ratified pin updated knowingly rather than silently broken.
- [x] `client/src/__tests__/fog.test.ts` -- update the comment at ~lines 70-82 that says the root mount order is *"asserted only by inspection ... rather than by a test here"*; point it at `STAGE_ROOT_ORDER` and the new test file. Change no assertion in that file. -- The statement becomes false with this cycle, and a stale "we can't test this" note invites the next agent to re-derive the same gap.
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` -- amend ONLY the closing clause of the z-order line (~210) so it records that nameplates now sit above the chart layer and below the Pixi HUD, carrying the fog feather as a plate alpha (Eric ruling 2026-08-21). Touch nothing else on that line or in the Nameplate component row (~232), which already says plates fade with truesight resolution and stays true. -- The ruling is precisely what that line rules on; minimal edit, per the standing design-doc rule.
- [x] `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` -- append a dated, source-attributed amendment recording the ruling, what moved, what did NOT move (PV, disclosure, own-plate alpha, the three sub-orders), and the two traps (the feather must ride the plate or the rim fade is lost; `hudRoot` must stay on top). -- Durable home for a ratified correction; epic context is regenerable.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the "STAGE'S TOP-LEVEL LAYER ORDER IS NOT ASSERTABLE" entry RESOLVED with a pointer to `STAGE_ROOT_ORDER` and the new test. -- It is closed by this work, verbatim as it was written.
- [x] `VERSION`, `package.json` -- bump `0.17.122` → `0.17.123`. -- One increment per landed dev-auto cycle.
- [x] `client/src/__tests__/nameplatesAboveTerrain.test.ts` (menu pins) -- Eric, 2026-08-21: *"make extra sure that things like the upgrade and settings menu are not obscured by the name."* Verified and pinned on BOTH sides of the canvas boundary: the Pixi side (`chartRoot` below `hudRoot`, so every Pixi HUD surface outranks a plate) and the DOM side (the refit window mounts to `document.body` with a positive z-index, settings' rung is `CLIENT_CONFIG.settings.zIndex`, and `#app` declares NO z-index — which is the whole reason those rungs win). The `#app` pin is fail-proven. -- The ask is precisely that a plate now draws over things it never could, so the list of things it still may not draw over wants an assertion rather than an argument.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- add the one-line interstitial cycle 123 stamp to each (date, cycle, version, PV unchanged at 47, amendment pointer). -- Both trackers must move in the same PR; no narrative in either.

**Acceptance Criteria:**
- Given a contact hull whose screen position overlaps an island body, when a frame renders, then its callsign is fully legible over the island's fill and contour bands rather than hidden behind them.
- Given two hulls overlapping on screen, when a frame renders, then neither silhouette covers either callsign.
- Given the aim reticle, the aim preview or a gun-burst ring overlapping a callsign, when a frame renders, then the reticle/ring draws on top of the name.
- Given a plate placed at a screen position, when the camera is at any zoom in 0.26-1.5 and shaking, then the plate renders at exactly that screen position — the chart transform is fully cancelled.
- Given the HUD chrome bar, hotbar and foghorn chevrons, when a callsign would overlap them, then the chrome draws on top — plates gained the chart layer, not the HUD.
- Given a contact at the edge of the observer's (possibly dazzled or lit-zone-exempt) sight bubble, when a frame renders, then its plate is softened by exactly the curve the fog composite used to apply, and is never driven to zero by the feather alone.
- Given the omniscient reveal, when spectate visuals engage, then the fog is hidden (not faded) and every revealed plate draws above the full-disc island chart at its fader alpha.
- Given `npm run check`, when it runs, then lint, all three type-checks and the whole suite pass, with `PROTOCOL_VERSION` still 47.

## Spec Change Log

- **2026-08-21 — Eric ruling, mid-implementation.** On being shown the first draft of the stack (`plateRoot` lifted above `chartRoot`, which also carried plates above `aim`/`burstFx`/`sweep` and was ledgered in Design Notes as an accepted consequence), Eric ruled: *"i think i should be able to see aiming reticles over it. Just not terrain."* **Amended:** the nameplate container is no longer a stage root at all — it is the `plate` CHART LAYER between `ship` and `aim`, made screen-space by an inverse transform in `applyCamera`. The `plateRoot` root is retired, so `STAGE_ROOT_ORDER` is four names. **Known-bad state avoided:** shipping a stack where a floating 14px label occludes the crosshair, the aim preview and the burst rings — the marks epic-5 amendment 22 explicitly ruled must never be occluded, a rule the accepted-consequence framing silently widened from hulls to labels without a ruling. **KEEP on any re-derivation:** the fog-feather-on-plate-alpha half (unchanged and still required, since `chartRoot` sits above `fogSprite` wherever inside it the plate lands); the promotion of the root order to declared `STAGE_ROOT_ORDER` data (it closes a named deferred-work entry, and retiring a root is exactly the change that entry left unguarded); and the rewrite of the stale "plates under the fog" rationale in `enterSpectateVisuals` / `fog.test.ts` / `stage.ts`.

## Review Triage Log

### 2026-08-21 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 4, low 6)
- defer: 2: (high 0, medium 1, low 1)
- reject: 4: (high 0, medium 0, low 4)
- addressed_findings:
  - `[medium]` `[patch]` THE DEGENERATE-ZOOM GUARD DID NOT DO WHAT ITS OWN COMMENT CLAIMED. It wrote the forward transform and THEN reset the plate to identity — but `plate` is a CHILD of `chart`, so a NaN already committed to `chart.scale` composes straight through an identity child and the plates land at NaN anyway (at `zoom = 0` they collapse onto one point). Hoisted the check above every write and returns, leaving the whole camera at its last good state. Strictly less code for a guarantee that is actually met.
  - `[medium]` `[patch]` ...AND ITS TEST ASSERTED THE WRONG THING, so it passed while the guarantee failed: it checked `plate.scale === 1` on a container that was ALREADY at identity (a virgin `Container`). Now drives a good frame first, then the bad one, and asserts the COMPOSED round trip plus that the bad zoom never reached `world`/`chart`. Fail-proven by deleting the guard.
  - `[medium]` `[patch]` NOTHING PINNED THAT THE FEATHER IS SAMPLED AT THE HULL'S WORLD POSE — a `drivePlate` fed the projected screen point would have shipped with every existing assertion green, since they all exercise `hullSightSoftness` in isolation. Added a `ContactViews`-level suite driven through a camera where screen != world, plus a ratio pin on the multiply. Fail-proven by swapping `gp` for `sc`.
  - `[medium]` `[patch]` AN OVERCLAIM OF MY OWN: `stage.ts`, `contacts.ts` and a test title said the plate's alpha reproduced the fog composite *"numerically"*. It does not — a plate is drawn ~73u above its hull in world terms against an 82.5u feather band, and the fog is a screen-space texture, so it faded a plate by the PLATE's position. Sampling at the hull is kept (a label should fade with the thing it labels; the alternative is a 4x brightness split between two contacts at equal range depending on bearing) and the claim was corrected everywhere instead.
  - `[low]` `[patch]` `camera.zoom` is a RECOMPUTING getter and was read five times, so the guard tested a different read from the one already committed to `chart.position`. Hoisted to one `const`.
  - `[low]` `[patch]` `1/Infinity` is a perfectly finite `0`, so a `Number.isFinite(inv)` test alone let `zoom = Infinity` through; a subnormal `5e-324` is finite and positive while its reciprocal overflows. Both ends now checked, both load-bearing, both in the test matrix.
  - `[low]` `[patch]` The round-trip pin hand-rolled `position + scale · p`, guarded by a comment asserting the very thing most likely to break later (no rotation/skew/pivot). Swapped for Pixi's own `getGlobalPosition()`, which works in jsdom with no renderer.
  - `[low]` `[patch]` TWO FILES ASSERTED ONE FACT: `hullOverRadar.test.ts` re-pinned `plate === ship + 1` byte-identically to `nameplatesAboveTerrain.test.ts` while its own comment said the latter owned it. Removed; a comment where it stood records why.
  - `[low]` `[patch]` LEDGERED, not absorbed: `plate` sits above `blip`, so a callsign now paints over radar returns. Eric ruled on terrain and reticles, not on radar paint — named in amendment 34 as a consequence of the seat, with the cost of the alternative stated.
  - `[low]` `[patch]` `clearAmbientLayers` sweeps `StageLayers` unconditionally and `plate` just joined it; unlike every other layer its children are owned by a long-lived `NameplateLayer` map rather than recreated per frame. Safe today only by boot ordering. Documented in `ambient.ts` and deferred rather than carved out, since that function's own doc explicitly argues against curated exemptions.
  - `[medium]` `[defer]` The ambient-sweep coupling above — the structural fix touches a ratified decision and wants an explicit call.
  - `[low]` `[defer]` `applyCamera(cam, world, chart, chart)` compiles: four bare `Container`s, and the fourth now receives the inverse of the third.
  - `[low]` `[reject]` `plate.scale.set(inv)` assumes uniform zoom — no anisotropic zoom exists and none is planned; the `getGlobalPosition` pin would now catch it if one arrived.
  - `[low]` `[reject]` `expect(EVERY_ROOT_PLACED).toBe(true)` cannot fail at runtime — true, and existing precedent (`hullOverRadar.test.ts`); the comment beside it already calls it the compile-time half.
  - `[low]` `[reject]` The "hide, never fade" rationale is now taste rather than structure — accurate, and the rewritten comment says exactly that rather than presenting it as an equal-strength argument.
  - `[low]` `[reject]` `updateOwnPlate`'s hard-coded alpha `1` is a second derivation — provably identical (`hullSightSoftness(0, sight) === 1`), and the spec forbade touching it.

## Design Notes

**Why the feather has to move with the plate.** Under the shipped order the fog composite physically painted over `plateRoot`, so a plate near the rim of the sight bubble dimmed for free. Lifting it above `chartRoot` also lifts it above `fogSprite`, so that dimming disappears — and DESIGN.md's Nameplate row still promises plates *"fade in/out with truesight resolution"*. This is the identical bill epic-5 amendment 22 paid when `ship` moved: `hullSightSoftness` reproduces the composite's own curve from the fog texture's own two constants (`HOLE_FEATHER_START`, `FOG_FILL_ALPHA`), and `ContactViews.render` already has the value in hand. Multiplying it into the plate is a one-argument change, not a new mechanism.

```ts
// contacts.ts — render() already computed `softness` for the hull:
fv.view.setFade(fv.fader.update(dtMs) * softness(p.x, p.y));
this.drivePlate(id, fv, rosterIndex, plates, softness);   // <- same value, same frame
// ...and in drivePlate, at the position it already reads:
this.nameplates.place(id, sc.x, plateScreenY(...), fv.fader.alpha * softness(gp.x, gp.y));
```

**Why a screen-space layer inside a camera-transformed root.** Plates are placed in raw screen pixels by `camera.worldToScreen` and hold a constant 14px at any zoom precisely so the text never scales or tilts, so they cannot inherit `chartRoot`'s transform — which is why the first draft made the container a root and accepted plates over the reticle. Eric declined that trade. Pixi composes `parent ∘ child` as `position + scale · p`, so writing the exact inverse of the chart transform onto the one plate container cancels the parent out: `px + zoom·(−px/zoom + p/zoom) = p`. The layer's z-position lives in the chart stack; its contents live in screen space. The inverse goes in `applyCamera` and nowhere else, for the same reason the forward transform does — one site, impossible for a future caller to forget. The alternative (splitting `chartRoot` into two camera-transformed roots to thread a screen-space root between them) costs a fourth root, a fourth declared array, a wider `applyCamera` and a split of a ratified order array, all to express a stacking one array index already says.

**Why a declared root array rather than just re-ordering the `addChild` call.** `deferred-work.md` records that the root mount order is the one part of the scene's stacking no test can see, *"which leaves the reveal's 'hide, never fade' rule unpinned"* — and this cycle changes exactly that order. Re-ordering the inline call would ship the fix with the same blind spot. Building the roots by iterating an exported array makes the array the order rather than a comment about it, and `EVERY_ROOT_PLACED` (keyed off `Exclude<keyof Stage, 'app' | 'layers'>`) turns "someone added a sixth root and forgot the array" into a compile error, exactly as `EVERY_LAYER_PLACED` already does for layers.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three workspaces type-check, full suite green including the new `nameplatesAboveTerrain` file.
- `npm test -w client` -- expected: green; `hullOverRadar.test.ts` unchanged and still passing (the three sub-orders did not move).
- `grep -n 'PROTOCOL_VERSION = ' shared/src/index.ts` -- expected: still `47`.

**Manual checks (if no CLI):**
- `createStage` returns roots mounted in `STAGE_ROOT_ORDER`; `app.stage.children` order matches the array index-for-index (asserted indirectly — jsdom has no WebGL, so the array is the pin).
