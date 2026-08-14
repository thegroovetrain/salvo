---
title: 'The Home Scene — the menu backdrop becomes a real scene from the game'
type: 'feature'
created: '2026-08-14'
status: 'in-review'
baseline_revision: '45ce489be9c6b4573af82b73e050fa07956118f5'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/project-context.md']
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The pre-join background is Story-1.14-era and now advertises a game that no longer exists: fake drifting ellipse "islands" painted in the RETIRED `islandFill`/`islandStroke` yellow, viewport-FRACTION geometry instead of world units, and anonymous sprite-dot blips. Everything it imitates has since been replaced — fractal height-field maps with the hypsometric terrain ramp (cycle 59), the physical return model with height-aware radar shadows (Stories 4.10/4.11), radar wakes and on-water foam (4.12) — so the menu contradicts the standing Eric ruling of 2026-07-24 that the ambient "must not be *its own thing with its own rules*".

**Approach:** Rebuild the ambient as a real, seeded, WORLD-UNIT scene driven entirely by the SHIPPED renderers — `generateMap` + `render/map.ts` terrain, the real `Radar` in `return` grammar (heatmap march, height-raster shadows, wake returns), real `ShipView` hulls on real `stepShip` kinematics laying real wakes through `WakeSources`/`Effects`, the real `Fog` bubble and `Camera` — split into a PURE unit-tested composer plus a thin Pixi shell, exactly the split `stage/worstCaseScene.ts` + `stage/worstCase.ts` already uses for the readability gate.

## Boundaries & Constraints

**Always:**
- **Client-only.** No `shared/` or `server/` change, no wire change, no `PROTOCOL_VERSION` bump, no Colyseus connection. The scene is wholly local and seeded; `Math.random` stays legal here (render, not sim) but the world build MUST be seeded (`mulberry32`) so the picture is reproducible.
- **Every system is the shipped one, called through its public API** — `generateMap`, `buildMap`, `Radar`, `ShipView`, `WakeSources` + `Effects`, `Fog`, `Camera`, `stepShip`. Nothing may re-implement a radar, terrain, wake or kinematics rule locally: that is precisely what the 2026-07-24 ruling forbids and the whole point of this cycle.
- **The split is mandatory:** a PURE composer (zero Pixi/DOM/clock/I/O) that is unit-tested, plus a Pixi shell left to visual QA — the repo pattern stated in `render/ambient.ts:1-6` and `stage/worstCaseScene.ts:10-16`.
- **The radar obeys the real rules.** Ranges come from `effectiveStats(CONFIG.shipClasses[cls])` and the sweep period from base `CONFIG.vision.sweepRpm` — never a literal. A hull BEYOND truesight paints only when the beam crosses its bearing, shaped by the SHIPPED `paintCoverage(cls,x,y,heading,CONFIG.vision.radarCellU,t)` and fed through `Radar.onBlip`; a hull INSIDE truesight reaches the radar only via a real `ContactStore.pushFrame`, sampled `CLIENT_CONFIG.net.interpDelayMs` in the past exactly as the game does. `onSweepSample` must be anchored or the march never runs.
- `Radar.setHeightRaster(map.heightRaster)` and `Radar.setWakeSources(sources, map.islands)` are wired, so the shadows and wake returns on the menu are the real ones.
- **Colors are tokens only.** `client/src/__tests__/tokens.test.ts` auto-scans every new file under `client/src`; terrain must render through `render/map.ts`'s ratified hypsometric `CLIENT_CONFIG.colors.terrain[]` ramp, never the retired `islandFill`/`islandStroke`.
- **Photosensitivity + motion.** Nothing in the scene flashes (the standing `ambient.ts:22-24` law + EXPERIENCE.md:138 accessibility floor). The scene MUST consult the motion setting via `motionIntensity`/`motionScaled` from `settings/store.js` — at `off`, scene MOTION stops (hull travel and camera drift) while the picture and every information channel remain. This closes the gap that today's `ambient.ts` reads the motion setting nowhere.
- **DOM legibility is a gate, not a nicety.** The centered home column (~480×668px, and only ~50px of vertical slack at the 1366×768 floor) must stay readable over the scene: the radial legibility scrim survives, and the observer hull is seated OFF-CENTRE so the bright truesight bubble lands on a free flank rather than behind the text.
- **Teardown is total.** The scene owns `worldRoot`, `chartRoot` and the fog sprite pre-join; `stopAmbient()` is the ONLY teardown path before the real game claims those same roots, so `destroy()` must leave every layer it touched empty and every listener/ticker removed.
- ESLint complexity ≤ 10 (error, never suppressed); ~500 LOC/file soft cap; one-way client data flow preserved (render modules never drive net/sim).

**Block If:**
- The scene cannot be made legible behind the home column without dropping one of the shipped renderers — that is a design tradeoff, not an implementation choice.
- Any task turns out to require a `shared/` or `server/` change, a wire change, or a live server connection.
- Boot cost forces a user-visible delay to first paint that only a design tradeoff (e.g. deferring the menu scene entirely) can resolve.

**Never:**
- **No combat on the menu** — no muzzle flashes, bursts, hull-hit flashes, splashes, wounded smoke, torpedoes, denied pulses, or kill feed. Introducing flashing to a menu is a photosensitivity-relevant DESIGN decision reserved for Eric; ledger it in `deferred-work.md` rather than inventing it.
- No storm/zone ring, storm fill, or in-storm vignette.
- No HUD, hotbar, BR chrome bar, nameplates, or any change to the DOM home layout/markup.
- No `buildGame`, no stub Colyseus `Room`, no `ContactViews` (net-coupled) — the scene composes renderers directly and never boots the whole game.
- No design-doc edits in-story (standing rule); supersessions and the retired-token doc-sync go to `deferred-work.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh home load | No localStorage, no connection | A world-unit ocean with fractal islands in the hypsometric ramp, hulls under way laying wakes, the real sweep painting returns with terrain shadows behind islands; home DOM legible over it | No error expected |
| Hull beyond truesight | Hull in the radar annulus, beam has NOT crossed its bearing this frame | No new paint; the previous paint keeps phosphor-decaying | No error expected |
| Hull beyond truesight | Beam crosses its bearing | Exactly one `paintCoverage`-shaped `onBlip` at the hull's pose, stamped at paint time | No error expected |
| Hull behind an island | Bearing blocked by terrain taller than the mast instance | Return attenuates/vanishes per the shipped shadow march — never a hand-rolled cutoff | No error expected |
| Hull inside truesight | Within `sight` of the observer | Draws as a real `ShipView` silhouette with on-water wake; reaches radar only through `ContactStore` | Contact sample older than `interpDelayMs` returns null → hull simply not stamped |
| Motion = off | Settings store reports `off` | Hull travel and camera drift stop; terrain, returns, phosphor state and the picture all remain | No error expected |
| Motion = reduced | Settings store reports `reduced` | Scene motion at half amplitude | No error expected |
| PLAY pressed | `stopAmbient()` runs | Every scene layer emptied, ticker callback and resize listener removed, before the real world claims the roots | Double-`destroy()` must be a safe no-op |
| Connect FAILS after PLAY | `startGame` rejects | Scene keeps running behind the still-live home (today's behavior at `main.ts:3747`) | No error expected |
| Viewport resize | Window resized, incl. the 1366×768 floor | Camera viewport + fog re-baked; scene stays composed and the home column stays legible | Degenerate 0-size viewport must not throw |

</intent-contract>

## Code Map

- `client/src/render/ambient.ts` (259 LOC) — **REWRITE** as the Pixi shell. Today: fake ellipse islands, viewport-fraction layout, sprite blips. Keeps `sweepAngleAt`/`sweepCrossed` (move to the composer); `ambientScale`/`ringLayout` retire with the fraction-space layout.
- `client/src/render/ambientScene.ts` — **NEW, PURE.** Seeded world build (hulls, routes), per-tick `stepShip` helm, contact/blip decisions, camera target. Zero Pixi/DOM/clock. Model: `stage/worstCaseScene.ts`.
- `client/src/main.ts:3839-3850` — ambient construction/ticker/teardown; `:3750` + `:3878` are the two `stopAmbient()` call sites. `applyCamera` at `:502` (called `:3525`) is the transform the scene needs.
- `client/src/render/stage.ts` — `StageLayers`, `WORLD_LAYER_ORDER` (:121), `CHART_LAYER_ORDER` (:124), `HUD_LAYER_ORDER` (:137), `createStage` (:214). Natural home for an extracted `applyCamera`.
- `client/src/render/radar.ts` — `Radar` ctor (:474), `render(own, serverNow, contacts, view)` (:1082), `setRanges` (:524), `setHeightRaster` (:633), `setWakeSources` (:1286), `onSweepSample` (:714), `onBlip` (:727), `onWakeBlip` (:900). Grammar `'return'`.
- `client/src/render/map.ts` — `buildMap(map, layers, zoom)` (:203), `MapChart.update(zoom)` (:185). Self-contained.
- `client/src/render/ships.ts` — `ShipView(style, hullId)` (:254), `update(x,y,heading)` (:372), `contactStyle` (:109). Plain-object drivable.
- `client/src/render/wake.ts` — `WakeHull` (:93), `WakeSources.observe(h, nowMs)` (:243). `client/src/render/effects.ts` — `Effects(wakeLayer, fxLayer, burstLayer)` (:440), `update(dt, nowMs, hulls)` (:658).
- `client/src/render/fog.ts` — `Fog(layer)` (:111), `setSightRange` (:120), `rebake(w,h,zoom)` (:150), `update(x,y)` (:158). `client/src/render/camera.ts` — `Camera(opts)` (:100), `setViewport` (:285), `snapTo` (:308), `update(dt, ship)` (:355), `worldView` (:270), `tickZoom(dt, motionScale)` (:218).
- `client/src/net/snapshots.ts` — `ContactStore` (:110), `pushFrame(t, contacts)` (:118). A plain local class; no room needed.
- `shared/src/sim/` — `generateMap` (map.ts:583) → `GameMap {radius, spawnRing, islands, heightRaster}`; `stepShip` (ship.ts:62); `islandDistance` (island.ts:71) for open-water routing; `paintCoverage` (radarRaster.ts:819); `effectiveStats` (stats.ts:282).
- `client/src/config.ts:903-952` — the `CLIENT_CONFIG.home.ambient` block to replace; `COLORS.islandFill`/`islandStroke` (:55-57) retire with their last consumer.
- `client/src/__tests__/ambient.test.ts` (95 LOC) — pins the four old pure helpers; `client/src/__tests__/tokens.test.ts` — the color-literal scan; `client/src/__tests__/radarViewport.test.ts:65,118` — the existing proof the `return` stack drives with zero network (`rasterFrom`, camera transform).
- `client/src/settings/store.ts` — `motionIntensity` (:99), `motionScaled` (:104), `motionAllowed` (:109), `settings` singleton (:273).
- `_bmad-output/implementation-artifacts/deferred-work.md` — ledger for the combat-on-menu question + retired-token doc-sync.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/stage.ts` -- extract `applyCamera(camera, world, chart)` out of `main.ts:502` and export it here -- the scene needs the camera transform and must not import `main.ts` (which self-bootstraps at import); duplicating it would be exactly the two-derivations desync class the project forbids.
- [x] `client/src/main.ts` -- import the extracted `applyCamera`; construct the scene as `new AmbientScene(stage)` (it now needs all layer roots + the fog sprite, not just `worldRoot`) -- keep both `stopAmbient()` call sites and the connect-failure behavior byte-identical.
- [x] `client/src/render/ambientScene.ts` -- NEW pure composer: seeded world (map seed, observer + rival hulls, open-water routes via `islandDistance`), per-tick helm + `stepShip`, `sweepAngleAt`/`sweepCrossed` (moved), the beyond-truesight paint decision, and the off-centre camera target -- pure so the scene's composition is unit-tested rather than eyeballed.
- [x] `client/src/render/ambient.ts` -- REWRITE as the Pixi shell: own `generateMap`, `buildMap`, `Camera`, `Radar('return')` with height raster + wake sources, `ShipView`s, `WakeSources`+`Effects`, `Fog`, the legibility scrim, the master dimmer, `update(dtMs)` and a total `destroy()` -- one shell, every renderer the shipped one.
- [x] `client/src/config.ts` -- replace the `home.ambient` block with the new scene's knobs (seed, hull count, sight/observer offset, scrim + dimmer alphas, sweep anchor); delete `islandFill`/`islandStroke` once their last consumer is gone -- cycle-69 standing style: remove end to end so no dead knob survives.
- [x] `client/src/__tests__/ambient.test.ts` -- retire the `ambientScale`/`ringLayout` cases with the fraction-space layout they pinned; keep and extend `sweepAngleAt`/`sweepCrossed`; add composer tests for the I/O Matrix edge cases (beam-crossing paint decision, motion=off freeze, open-water routing clearance, determinism from one seed).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger two entries: the combat-on-the-menu design question for Eric, and the `islandFill`/`islandStroke` + DESIGN.md:149 "provisional carry-over" Open Question now resolved by deletion.
- [x] `VERSION`, root `package.json`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- stamp cycle 82 / 0.17.82 -- EVERY landed PR must update BOTH tracker files in the same PR.

**Acceptance Criteria:**
- Given a fresh browser at the home page, when the scene runs, then the ocean, its fractal islands and their hypsometric contour bands are drawn by the SHIPPED `render/map.ts` from a real `generateMap`, in world units under the real camera transform — no viewport-fraction geometry and no ellipse stand-ins survive anywhere in the scene.
- Given the scene is running, when a hull sails behind terrain taller than the mast instance, then its return attenuates through the SHIPPED height-aware shadow march (`setHeightRaster` wired) rather than any local cutoff.
- Given the scene is running, when a TRUESIGHTED hull is under way, then it lays a real wake through `WakeSources`/`Effects` on the water and the radar stamps that same wake on the scope (`setWakeSources` wired). A hull beyond truesight lays NO wake in either place — deliberately, and this is the shipped behavior rather than a shortfall: a far hull's water reaches a real client only because the SERVER rasterizes it per segment (the `wk` row), and with no server the alternatives were to synthesize a disclosure nobody made or to let a fogged hull lay visible foam on the water. The scene does neither; the reasoning is recorded at `render/ambient.ts` (`paintReturns`) and must be preserved.
- Given a full-repo scan, when `npm run check` runs, then `tokens.test.ts` reports zero color literals in the new files and no source references the deleted `islandFill`/`islandStroke` tokens.
- Given `stopAmbient()` runs, when the real game claims `worldRoot`/`chartRoot`/the fog sprite, then every scene layer is empty and no scene ticker callback or resize listener remains — and a second `destroy()` is a safe no-op.
- Given the home page at the 1366×768 floor, when the scene is at its brightest phase, then the centered home column's text remains legible over it (visual verification with screenshots at 1366×768 and 1920×1080).
- Given `npm run check`, when it completes, then lint, all three type-checks and the full suite pass with the ambient composer's new tests included.

## Design Notes

**Why this is a continuation, not a new invention.** The 2026-07-24 Eric ruling already moved the ambient from a mock-CSS pastiche onto the game's real sweep texture, real sweep RPM, real blip sprite and real phosphor math. Every system named here post-dates that ruling; applying it to them is the same rule, not a new one. No planning doc anticipates an attract-mode, and none forbids one — DESIGN.md carries no ambient component row at all, so the binding constraints are the accessibility floor, the token law, and EXPERIENCE.md's "home renders over a live ambient CIC canvas (never a blank page)".

**Why not `buildGame` + a stub room** (the `stage/worstCase.ts` route): it is the proven mechanism, but it boots the WHOLE game — HUD, hotbar, BR chrome bar, kill feed, nameplates — over the menu. A backdrop needs the water and the scope, not the chrome. Composing the renderers directly is both lighter and the only way to get the "Never" list for free.

**The three darkening layers must be tuned by eye, not by argument.** The master dimmer (Eric 2026-07-24: "the idle radar reads at half strength on the menu"), the legibility scrim, and now the game's own fog all darken the picture. Ship them as config knobs and set the final values from screenshots; the observer sits off-centre precisely so the one BRIGHT region (the truesight bubble) lands on a free flank instead of behind the DOM column.

**Two traps.** (1) `update(dtMs)` receives raw `Ticker.deltaMS` with no `MAX_FRAME_DT` clamp (unlike `app/loop.ts:28`), so a background-tab stall delivers a huge dt — the composer must clamp before integrating or hulls teleport. (2) `Radar.render` paints nothing unless `onSweepSample` has been anchored at least once AND `own !== null`; both are silent no-paint failures, not errors.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean (complexity ≤ 10), all three workspaces type-check, full suite green including the new composer tests.
- `npm run build` -- expected: shared → client → server build clean; confirms nothing dev-only leaked into the scene's import graph.

**Manual checks:**
- Start a dev server IN THIS WORKTREE on non-default ports (never the user's), load the home page, and screenshot at 1366×768 and 1920×1080: confirm fractal islands with hypsometric bands, hulls under way with wakes, sweep painting returns, a visible terrain shadow behind an island, and legible home text.
- Press PLAY and confirm the scene tears down cleanly with no leftover sprites and no console errors.
