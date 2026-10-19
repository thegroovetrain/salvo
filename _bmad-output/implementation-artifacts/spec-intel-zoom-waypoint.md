---
title: 'The intel waypoint: zoom out to the radar disc above the HUD bar before the ring'
type: 'bugfix'
created: '2026-10-19'
status: 'in-progress'
baseline_revision: 'cb88ac88bca3aad171bf30d377df7c92cdad8a43'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** Zooming out goes straight from "close in on the ship" to "the current ring": the center starts sliding toward the ring center the moment the span passes the default framing, so water the captain needs to shoot at drifts under the HUD bar. Eric 2026-10-19: *"insert a 'waypoint' in between them that keeps the camera centered until I have zoomed out to my entire intel area, which should have a bit of clearance around it so that the hotbar isn't covering it up."*

**Approach:** Add an INTEL waypoint to the alive camera: the span where the radar sweep disc (radius `CONFIG.vision.radar`, × the 1.05 fit margin), drawn around the exactly-centered own ship, has its bottom edge at the live HUD bar's top edge. It is a hard detent like the ring waypoint. The ship→ring-center slide now starts at the intel span instead of the default span. The ring waypoint is never tighter than the intel waypoint. The own-hull keep-on-screen clamp treats the bar's top edge as the bottom of the view.

## Boundaries & Constraints

**Always:** Client-only (`client/src`). Strict one-way flow: camera.ts stays pure math with no config import (main.ts feeds the radius and the bar inset). ESLint complexity ≤ 10 for every function. American spelling in new prose ("center", even beside the existing "centre" identifiers; do not rename them). Tests check the generating functions on synthetic input. Never pin a ring size, a bar height or a computed span as a rule. PROTOCOL_VERSION stays 89.

**Block If:** The fix needs any `shared/` or `server/` change, a new HUD element or any DOM, or a ruling below turns out to contradict the code in a way that cannot be resolved by an engineering choice.

**Never:** Change `defaultSpanU` (1,320 u stays the spawn framing, ruling 127), `closeSpanU`, the whole-map out limit, the reveal, or anything the spectate zoom does (`render/spectate.ts` `wheelZoom` and `Camera.zoomDetent` keep the ring-only detent, floored at the default framing). No How-to-Play or in-game copy. No cached span that goes stale on resize.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inside intel | span ≤ intel span | slideT = 0, center = follow point (ship + lead) | — |
| At intel | span = intel span | slideT = 0; disc bottom px = bar top px − R·(m−1)·zoom (clears it) | — |
| Between | intel < span < ring | slideT = (span − intel)/(ring − intel), linear | — |
| Merge | ring fit ≤ intel span | alive ring detent = intel span (one stop); slideT ≡ 0; mapSlideT runs intel → map fit, ship → origin | — |
| Step crossing | key/wheel step from either side crosses intel or ring | lands exactly on the FIRST detent crossed; the next step leaves it | — |
| No ring yet | ring span NaN | intel detent still applies; ring detent = intel | — |
| Resize / UI scale | viewport or `uiScale` changes | intel span re-derived from live viewW/viewH/inset (getter, no cache); a zoom parked on the intel detent rides to the new one | — |
| Portrait | W < H | width bound `W/2` governs when smaller than `H/2 − inset` | — |
| Degenerate | `H/2 − inset ≤ 0`, radius NaN/≤ 0, option omitted | intel fit NaN → intel span = default span (today's behavior) | no NaN reaches zoom |
| Intel > out limit | tiny map | detent beyond the limit; `setUserZoom` clamps as today | — |

</intent-contract>

## Code Map

- `client/src/render/camera.ts` -- spanFactor, ringFitSpanU, userZoomLimits, zoomOutSpanU, detentSpanU, centreSlideT, stepZoom; Camera (setViewport, zoomDetent, rideableDetent, slideT, mapSlideT, reclamp, update, keepShipInView).
- `client/src/render/hudBar.ts` -- `hudBarLayout`: bar top = `screenH − floor − HUD_BAR_HEIGHT` in LOGICAL px; HUD_BAR_HEIGHT (104 + 8 + 24) is not exported.
- `client/src/main.ts` -- camera construction (~2313), `applyUiScale` (~4639, runs every frame, early-outs when unchanged), `bindResize` (~4916), `handleZoomStep` (~5015), `bindWheelZoom` (~5105).
- `client/src/render/spectate.ts` -- `wheelZoom(current, deltaY, detent?)`; behavior unchanged.
- `client/src/__tests__/zoomWaypoint.test.ts`, `client/src/__tests__/camera.test.ts` -- existing detent/slide/clamp contracts.

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/render/hudBar.ts` -- export a pure `hudBarTopInset(): number` (logical px from viewport floor to bar top = `B.floor + HUD_BAR_HEIGHT`) and have `hudBarLayout` use it for `y` -- one source for the bar's vertical footprint.
- [ ] `client/src/render/camera.ts` -- (a) pure `intelFitSpanU(viewW, viewH, bottomInsetPx, radiusU, margin)` per Design Notes, NaN when unusable; (b) optional `CameraOptions.intelRadiusU` (omitted = no intel waypoint) plus `setBottomInset(px)` (REAL px; non-finite/negative ignored, default 0); (c) getter `intelSpanU` = `max(defaultSpanU, fit)` if usable, else `defaultSpanU`; (d) alive ring detent span = `detentSpanU(intelSpanU, ring)`; new getter `aliveZoomDetents: number[]` = [intel factor, alive ring factor] (a merged pair may repeat); `zoomDetent` stays the spectate ring detent, unchanged; (e) `slideT` = `centreSlideT(userSpan, intelSpanU, ring)`, `mapSlideT` = `centreSlideT(userSpan, aliveRingDetentSpan, map)`; (f) `rideableDetent` takes the floor span so the alive value rides the alive ring detent (floor = intel) and the spectate factor rides `zoomDetent` (floor = default); `reclamp` settles each with its own pair; `setViewport` and `setBottomInset` ride a zoom parked on the intel detent to the re-fitted one (same capture-then-reclamp shape as `setRing`); (g) `stepZoom(factor, amount, detents?: number | readonly number[])`: among usable detents strictly crossed by factor→next, land on the one nearest `factor`; a step starting on a detent moves on; (h) `keepShipInView`: bottom half-extent = `max(0, halfH − bottomInsetPx/zoom − pad)`, top and sides unchanged; (i) update doc comments (ruling numbers 127/128/142 + amendment 208) -- the whole fix lives in the pure camera.
- [ ] `client/src/main.ts` -- pass `intelRadiusU: CONFIG.vision.radar` at construction and call `camera.setBottomInset(hudBarTopInset() * g.uiScale)` right after (scale 1 before any setting is applied); in `applyUiScale`, after `g.uiScale = factor`, call `g.camera.setBottomInset(hudBarTopInset() * factor)`; alive `handleZoomStep` and the alive wheel branch pass `g.camera.aliveZoomDetents`; spectate branches keep `zoomDetent` -- the inset changes only with the UI scale (the logical inset is constant), and the span getter reads the live viewport.
- [ ] `client/src/__tests__/zoomWaypoint.test.ts` + `client/src/__tests__/camera.test.ts` -- keep existing contracts green (they construct without `intelRadiusU`, which means today's behavior); add a new `describe` (in zoomWaypoint.test.ts or a new `intelWaypoint.test.ts`) covering every I/O-matrix row. Use synthetic viewports/insets and derive expectations from the formula. Include: the disc's bottom edge in screen px ≤ the bar top at the intel span (via `worldToScreen`); stepping out from the default with keys and with one huge wheel spin lands on intel, then on ring, then runs free; stepping in mirrors it; slideT is 0 at intel and 1 at ring; merge; the spectate `zoomDetent`/`wheelZoom` unchanged with an intel-configured camera; the hull's screen y stays ≤ bar top − pad·zoom with the inset set, at every span out to the map fit, anywhere on the map -- the contracts in Eric's terms.
- [ ] Bookkeeping (same PR) -- `VERSION` + root `package.json` 0.18.64 → 0.18.65 (cycle 200); `CHANGELOG.md` `## [0.18.65] - 2026-10-19` in the 0.18.64 format (Changed / Not changed; protocol unchanged 89); amendment **208** appended to `_bmad-output/implementation-artifacts/epic-9-context-amendments.md` AND under a new `## Story 9.8 — staging fix 5, the intel waypoint (2026-10-19; cycle 200, 0.18.65, PV 89 unchanged)` heading at the end of `## Ratified Amendments` in `epic-9-context.md`, recording Eric's ask and the eight 2026-10-19 rulings plus the clamp reading; one-line stamps in `_bmad-output/gds-workflow-status.yaml` (`last_updated` prefix + `next_expected`) and `_bmad-output/implementation-artifacts/sprint-status.yaml` (header `# last_updated` + the `9-8-the-twelfths-ladder` line), mirroring the cycle-199 / PR #294 phrasing. How-to-Play is NOT touched.

**Acceptance Criteria:**
- Given an alive captain at the default framing, when they press Z or spin the wheel out, then the zoom stops exactly at the intel waypoint with the own ship at the exact screen center and the whole radar disc above the HUD bar; the next step out starts the slide toward the ring center.
- Given a late ring whose fit is ≤ the intel span, when the captain zooms out, then there is one stop (intel), and the next step out slides from the ship toward the map center.
- Given a spectator, when they zoom, then the behavior is identical to 0.18.64 (ring detent floored at the default framing, map limit, cursor anchor).
- Given any viewport size or UI scale, when the window is resized or the scale setting changes, then the intel waypoint re-fits so the disc still clears the bar.
- Given the center has slid, when the own hull is anywhere on the map at any span out to the map fit, then the hull never sits under the bar's top edge.

## Spec Change Log

## Review Triage Log

## Design Notes

**Intel fit (real px).** The ship is at screen center `H/2`, zoom `z` in px/u, intel radius `R·m` (m = `reveal.mapFitMargin`). Bottom: `H/2 + R·m·z ≤ H − inset` → `z ≤ (H/2 − inset)/(R·m)`. Sides: `z ≤ (W/2)/(R·m)` (the top is symmetric with the bottom and is implied). So `z_intel = min(H/2 − inset, W/2)/(R·m)`, and as a span across the short axis `intelFitSpanU = min(W,H)·R·m / min(H/2 − inset, W/2)` (NaN if the denominator ≤ 0). `inset` is REAL px = `hudBarTopInset()` (154 logical) × `uiScale`, because the camera's viewport is real px while the bar is laid out in logical px.

- 1920×1080, scale 1: inset 154 → min(386, 960) = 386; z = 386/1575 = 0.2451 px/u; span = 1080/0.2451 ≈ 4,407 u (factor ≈ 0.300). The 75 u margin is ≈ 18 px of clearance.
- 1280×614 floor, scale 1: min(153, 640) = 153; z ≈ 0.0971; span ≈ 6,321 u (factor ≈ 0.209). A short screen needs a much wider zoom-out because only 153 px sit between the center and the bar.
- 900×1600 portrait: min(646, 450) = 450 → span = 2·R·m = 3,150 u.

**Clamp reading (vetoable).** `keepShipInView` treats the bar's top edge as the view's bottom edge across the WHOLE width, not just the 868 px column. The column-aware version needs the bar's x-extent in real px and two-branch logic for a cost of at most ~154 px of bottom band. Full width is one subtraction and is never wrong (only conservative). The clamp still runs only while a slide is engaged (past intel). At and inside intel the centered ship is above the bar by construction.

**Merged detents and the map slide.** When ring ≤ intel, `centreSlideT` returns 0 (room ≤ 0), so the map slide lerps from the follow point to the origin. This is today's "ring under the default framing" path with intel as the floor. It is continuous; jumping to the ring center would be a pop.

**Riding (orchestrator ruling, Eric may veto).** A captain parked on the alive ring detent still rides it as the ring closes, and lands on intel when the ring fit drops below it. A captain parked on the intel detent RIDES it when the viewport or the UI scale changes (`setViewport` / `setBottomInset` capture the intel factor before and `reclamp` after, exactly as `setRing` does for the ring detent): the disc must never end up back under the bar after a resize, and the ride mechanism already exists.

## Verification

**Commands:**
- `npm install --include=dev && npm run build -w shared` -- fresh worktree only.
- `npm run lint` -- expected: 0 errors (complexity ≤ 10).
- `npx tsc --noEmit -p client/tsconfig.json` -- expected: clean.
- `npm test -w client` -- expected: all green, including the new intel contracts.
- `npm run check` -- expected: green (lint + three type-checks + all workspace tests + hook test).

**Manual checks (if no CLI):**
- On staging (Eric): zoom out from spawn: one stop with the ship centered and the radar disc above the bar, then the ring stop, then the map. Spectate zoom is unchanged.
