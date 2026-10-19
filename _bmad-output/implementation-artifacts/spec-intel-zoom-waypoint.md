---
title: 'The intel waypoint: zoom out to the radar disc above the HUD bar before the ring'
type: 'bugfix'
created: '2026-10-19'
status: 'done'
baseline_revision: 'cb88ac88bca3aad171bf30d377df7c92cdad8a43'
final_revision: '85891af9'
review_loop_iteration: 0
followup_review_recommended: true
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
- [x] `client/src/render/hudBar.ts` -- export a pure `hudBarTopInset(): number` (logical px from viewport floor to bar top = `B.floor + HUD_BAR_HEIGHT`) and have `hudBarLayout` use it for `y` -- one source for the bar's vertical footprint.
- [x] `client/src/render/camera.ts` -- (a) pure `intelFitSpanU(viewW, viewH, bottomInsetPx, radiusU, margin)` per Design Notes, NaN when unusable; (b) optional `CameraOptions.intelRadiusU` (omitted = no intel waypoint) plus `setBottomInset(px)` (REAL px; non-finite/negative ignored, default 0); (c) getter `intelSpanU` = `max(defaultSpanU, fit)` if usable, else `defaultSpanU`; (d) alive ring detent span = `detentSpanU(intelSpanU, ring)`; new getter `aliveZoomDetents: number[]` = [intel factor, alive ring factor] (a merged pair may repeat); `zoomDetent` stays the spectate ring detent, unchanged; (e) `slideT` = `centreSlideT(userSpan, intelSpanU, ring)`, `mapSlideT` = `centreSlideT(userSpan, aliveRingDetentSpan, map)`; (f) `rideableDetent` takes the floor span so the alive value rides the alive ring detent (floor = intel) and the spectate factor rides `zoomDetent` (floor = default); `reclamp` settles each with its own pair; `setViewport` and `setBottomInset` ride a zoom parked on the intel detent to the re-fitted one (same capture-then-reclamp shape as `setRing`); (g) `stepZoom(factor, amount, detents?: number | readonly number[])`: among usable detents strictly crossed by factor→next, land on the one nearest `factor`; a step starting on a detent moves on; (h) `keepShipInView`: bottom half-extent = `max(0, halfH − bottomInsetPx/zoom − pad)`, top and sides unchanged; (i) update doc comments (ruling numbers 127/128/142 + amendment 208) -- the whole fix lives in the pure camera.
- [x] `client/src/main.ts` -- pass `intelRadiusU: CONFIG.vision.radar` at construction and call `camera.setBottomInset(hudBarTopInset() * g.uiScale)` right after (scale 1 before any setting is applied); in `applyUiScale`, after `g.uiScale = factor`, call `g.camera.setBottomInset(hudBarTopInset() * factor)`; alive `handleZoomStep` and the alive wheel branch pass `g.camera.aliveZoomDetents`; spectate branches keep `zoomDetent` -- the inset changes only with the UI scale (the logical inset is constant), and the span getter reads the live viewport.
- [x] `client/src/__tests__/zoomWaypoint.test.ts` + `client/src/__tests__/camera.test.ts` -- keep existing contracts green (they construct without `intelRadiusU`, which means today's behavior); add a new `describe` (in zoomWaypoint.test.ts or a new `intelWaypoint.test.ts`) covering every I/O-matrix row. Use synthetic viewports/insets and derive expectations from the formula. Include: the disc's bottom edge in screen px ≤ the bar top at the intel span (via `worldToScreen`); stepping out from the default with keys and with one huge wheel spin lands on intel, then on ring, then runs free; stepping in mirrors it; slideT is 0 at intel and 1 at ring; merge; the spectate `zoomDetent`/`wheelZoom` unchanged with an intel-configured camera; the hull's screen y stays ≤ bar top − pad·zoom with the inset set, at every span out to the map fit, anywhere on the map -- the contracts in Eric's terms.
- [x] Bookkeeping (same PR) -- `VERSION` + root `package.json` 0.18.64 → 0.18.65 (cycle 200); `CHANGELOG.md` `## [0.18.65] - 2026-10-19` in the 0.18.64 format (Changed / Not changed; protocol unchanged 89); amendment **208** appended to `_bmad-output/implementation-artifacts/epic-9-context-amendments.md` AND under a new `## Story 9.8 — staging fix 5, the intel waypoint (2026-10-19; cycle 200, 0.18.65, PV 89 unchanged)` heading at the end of `## Ratified Amendments` in `epic-9-context.md`, recording Eric's ask and the eight 2026-10-19 rulings plus the clamp reading; one-line stamps in `_bmad-output/gds-workflow-status.yaml` (`last_updated` prefix + `next_expected`) and `_bmad-output/implementation-artifacts/sprint-status.yaml` (header `# last_updated` + the `9-8-the-twelfths-ladder` line), mirroring the cycle-199 / PR #294 phrasing. How-to-Play is NOT touched.
- [x] R9 LEAD IN THE FIT (review gate) -- `intelFitSpanU` gains `leadU` (default 0) and fits an effective radius `R·m + leadU`; `Camera.intelSpanU` passes `opts.leadMax`; Design Notes formula comment in camera.ts and the worked examples below redone; contract test: a ship at full speed on every heading (lead straight up the screen, toward the bar, and down), settled at the intel span with the follow converged, keeps the disc above the bar and inside the sides; a still ship too.
- [x] R10 EASED CENTER JUMPS (review gate) -- `CameraOptions.slideEaseRate` (omitted = no easing) fed from the new client knob `CLIENT_CONFIG.camera.slideEaseRate` = 6 /s; a private `slideTarget()`; `setRing`, `setViewport` and `setBottomInset` add (target before − target after) to a decaying `jump`; `update` decays it with `expDecay` and sets center = target + jump before `keepShipInView`; `snapTo`, `resetUserZoom` and the reveal target zero it; contract tests: the merge glides (within 15 % of the jump after one frame, monotonic, within 1 % after 1.5 s), a UI-scale change glides, a player zoom step lands directly, and without the option the merge lands at once.
- [x] P1 -- `keepShipInView`: no floor on the bottom half-extent; the bar edge wins when the bounds cross; test on 280 px and 140 px tall viewports.
- [x] P2 -- `setViewport` / `setBottomInset` (one private `refit`) ride nothing when the re-fit is the fallback; test: a transient 300 px-tall viewport leaves a parked intel zoom alone.
- [x] P3 -- `aliveZoomDetents` is `[ring]` without a real intel stop; the omitted-option test now expects `[zoomDetent]`, plus a fallback test.
- [x] P4 -- `intelSpanU` capped at the whole-map fit when that is known; the tiny-map test now expects the intel span to equal the map fit (on the out limit).
- [x] P5 -- `refit` also rides a zoom parked on the alive ring stop (second `reclamp`, `aliveTo: 'ring'`, ring factor captured before the mutation); test: a resize that lifts intel over the ring fit lands on the merged stop.
- [x] P6 -- `setBottomInset` returns the moved flag; `applyUiScale` ignores it with a one-line comment (the ring-fed hysteresis re-bakes); test.

**Acceptance Criteria:**
- Given an alive captain at the default framing, when they press Z or spin the wheel out, then the zoom stops exactly at the intel waypoint with the own ship at the exact screen center and the whole radar disc above the HUD bar; the next step out starts the slide toward the ring center.
- Given a late ring whose fit is ≤ the intel span, when the captain zooms out, then there is one stop (intel), and the next step out slides from the ship toward the map center.
- Given a spectator, when they zoom, then the behavior is identical to 0.18.64 (ring detent floored at the default framing, map limit, cursor anchor).
- Given any viewport size or UI scale, when the window is resized or the scale setting changes, then the intel waypoint re-fits so the disc still clears the bar.
- Given the center has slid, when the own hull is anywhere on the map at any span out to the map fit, then the hull never sits under the bar's top edge.
- Given an alive captain parked on the intel waypoint, when the ship steams at full speed on any heading (the follow lead at its 250 u maximum), then the whole radar disc still clears the HUD bar and the screen sides (ruling 9).
- Given a center jump caused by the ring feed, a resize or a UI-scale change (for example the ring stop merging into the intel stop), when the next frames render, then the center glides to its new spot over about half a second instead of popping; a zoom step by the player still moves the center directly (ruling 10).

## Spec Change Log

### 2026-10-19 — review gate
- **Eric's rulings (AskUserQuestion, final):** R9 LEAD IN THE FIT — the intel fit covers the radar disc × the margin PLUS the maximum follow lead (`camera.leadMax`, 250 u), so the disc clears the bar at any speed and heading (rejected: shrink the lead near the stop; accept the dip). R10 EASING — event-driven center jumps (ring feed, resize, UI scale) glide over about half a second (`camera.slideEaseRate` 6 /s); the player's own zoom stays direct (rejected: accept the pops). Consequence: the I/O-matrix row "At intel" now clears the bar by (R·(m−1) + lead)·zoom for a still ship, and the row "Intel > out limit" no longer applies (P4 caps intel at the map fit); both rows are inside the frozen intent contract and are superseded here.
- **Patches:** P1 the short-viewport clamp prefers the bar edge (no floor at 0); P2 the fallback never rides; P3 no detent at the spawn framing in the fallback; P4 intel capped at the whole-map fit; P5 a zoom parked on the alive ring stop rides a resize / UI-scale change; P6 `setBottomInset` returns the moved flag.
- **KEEP:** the pure getters (no cached span), the detent list in `stepZoom`, the two-ride record (`Rides` + `reclamp`), the stationary contracts (still-ship disc clearance, slideT 0 inside intel, linear slide, merge, spectate unchanged, hull above the bar).

## Review Triage Log

### 2026-10-19 — Review pass
- intent_gap: 2: (high 1, medium 1) — resolved live by Eric (rulings 9 lead-in-the-fit, 10 easing), so no halt; the code is patched, not re-derived
- bad_spec: 0
- patch: 6: (high 0, medium 0, low 6)
- defer: 0
- reject: 2 (reviewer coverage/API-asymmetry notes with no behavioral effect today: the spectate reclamp on resize is a provable no-op; the fog re-bake after a scale ride is covered by the ring-fed hysteresis)
- addressed_findings:
  - `[high]` `[patch]` both Fable hunters CONFIRMED: the follow lead (up to 250 u) exceeds the 75 u clearance, so a ship steaming toward the bar put 8–31 px of the radar disc under it — Eric ruled: fit the disc PLUS the maximum lead (ruling 9)
  - `[medium]` `[patch]` both hunters: the center pops ring-center → ship at the merge moment and on a resize / UI-scale change — Eric ruled: ease event-driven jumps over about half a second, player zoom stays direct (ruling 10)
  - `[low]` `[patch]` Codex CONFIRMED: on a viewport shorter than the bar needs, the bottom half-extent floored at 0 left the ship under the bar — the bar edge now wins
  - `[low]` `[patch]` Edge Case Hunter: a transient degenerate viewport rode a parked intel zoom to the spawn framing and never back — the fallback never rides
  - `[low]` `[patch]` Edge Case Hunter: the fallback detent list added a hard stop at the spawn framing — no real intel stop, no detent
  - `[low]` `[patch]` Edge Case Hunter: an intel fit wider than the map fit disabled the slide on very short viewports — capped at the map fit
  - `[low]` `[patch]` Edge Case Hunter + Blind Hunter: a resize that lifts intel over a parked ring stop left the zoom off every detent — the ring-parked value rides too
  - `[low]` `[patch]` Blind Hunter: setBottomInset discarded the moved flag — returns it like setRing

## Design Notes

**Intel fit (real px).** At rest the ship is at screen center `H/2`; under way the camera centers on ship + lead, so the ship sits up to `L` = `camera.leadMax` (250 u) off center (ruling 9). Zoom `z` in px/u, effective radius `E = R·m + L` (m = `reveal.mapFitMargin`). Bottom: `H/2 + E·z ≤ H − inset` → `z ≤ (H/2 − inset)/E`. Sides: `z ≤ (W/2)/E` (the top is symmetric with the bottom and is implied). So `z_intel = min(H/2 − inset, W/2)/E`, and as a span across the short axis `intelFitSpanU = min(W,H)·E / min(H/2 − inset, W/2)` (NaN if the denominator ≤ 0), capped at the whole-map fit once known (P4). `inset` is REAL px = `hudBarTopInset()` (154 logical) × `uiScale`, because the camera's viewport is real px while the bar is laid out in logical px.

- 1920×1080, scale 1: inset 154 → min(386, 960) = 386; E = 1,575 + 250 = 1,825 u; z = 386/1825 ≈ 0.2115 px/u; span ≈ 1080 × 1825 / 386 ≈ 5,106 u (factor ≈ 0.259). A still ship clears the bar by (75 + 250) u ≈ 69 px; at full lead toward the bar, by the 75 u margin ≈ 16 px.
- 1280×614 floor, scale 1: min(153, 640) = 153; z = 153/1825 ≈ 0.0838; span ≈ 614 × 1825 / 153 ≈ 7,324 u (factor ≈ 0.180). A short screen needs a much wider zoom-out because only 153 px sit between the center and the bar.
- 900×1600 portrait: min(646, 450) = 450 → span = 2·E = 3,650 u.

**Clamp reading (vetoable).** `keepShipInView` treats the bar's top edge as the view's bottom edge across the WHOLE width, not just the 868 px column. The column-aware version needs the bar's x-extent in real px and two-branch logic for a cost of at most ~154 px of bottom band. Full width is one subtraction and is never wrong (only conservative). The clamp still runs only while a slide is engaged (past intel). At and inside intel the ship is above the bar by construction, lead included (ruling 9). On a viewport too short for the bar the bottom bound is not floored, so the bar edge wins (P1).

**Merged detents and the map slide.** When ring ≤ intel, `centreSlideT` returns 0 (room ≤ 0), so the map slide lerps from the follow point to the origin. This is today's "ring under the default framing" path with intel as the floor. It is continuous; jumping to the ring center would be a pop.

**Riding (orchestrator ruling, Eric may veto).** A captain parked on the alive ring detent still rides it as the ring closes, and lands on intel when the ring fit drops below it. A captain parked on the intel detent RIDES it when the viewport or the UI scale changes (`setViewport` / `setBottomInset` capture the intel factor before and `reclamp` after, exactly as `setRing` does for the ring detent): the disc must never end up back under the bar after a resize, and the ride mechanism already exists. Since the review gate a zoom parked on the alive ring waypoint rides too (P5), and nothing rides when the re-fit is the fallback (P2).

## Verification

**Commands:**
- `npm install --include=dev && npm run build -w shared` -- fresh worktree only.
- `npm run lint` -- expected: 0 errors (complexity ≤ 10).
- `npx tsc --noEmit -p client/tsconfig.json` -- expected: clean.
- `npm test -w client` -- expected: all green, including the new intel contracts.
- `npm run check` -- expected: green (lint + three type-checks + all workspace tests + hook test).

**Manual checks (if no CLI):**
- On staging (Eric): zoom out from spawn: one stop with the ship centered and the radar disc above the bar, then the ring stop, then the map. Spectate zoom is unchanged.

## Auto Run Result

**Status:** done (cycle 200, 0.18.65, PV 89 unchanged; epic-9 amendment 208; PR #296 open to development).

**Implemented:** the alive camera's zoom-out gains an INTEL waypoint — a hard detent at the span where the radar disc (`CONFIG.vision.radar` × the 1.05 fit margin, plus the maximum follow lead) around the screen-centered own ship has its bottom edge on the live HUD bar's top edge (real px = logical inset × UI scale). The ship → ring-center slide starts there instead of at the default framing; the ring stop is never tighter than it (merged = one stop, then the slide runs ship → map center); ring- or viewport-driven center jumps ease out at `camera.slideEaseRate`; the own-hull clamp treats the bar as the bottom edge. Spectate is unchanged.

**Files:**
- `client/src/render/camera.ts` — `intelFitSpanU`, `intelRadiusU` / `slideEaseRate` options, `setBottomInset`, live `intelSpanU` / `aliveDetentSpanU` / `aliveZoomDetents`, two-ride `reclamp` + `refit`, detent-list `stepZoom`, the eased jump, the bar-edge clamp.
- `client/src/render/hudBar.ts` — `hudBarTopInset()`, one source for the bar's vertical footprint.
- `client/src/main.ts` — feeds the radius, the lead, the ease rate and the real-px inset; alive key/wheel pass `aliveZoomDetents`.
- `client/src/config.ts` — `camera.slideEaseRate` 6.
- `client/src/__tests__/intelWaypoint.test.ts` — 36 contract tests on synthetic input.
- `VERSION`, `package.json`, `CHANGELOG.md`, epic-9 amendments (208, both homes), both trackers.

**Review:** Blind Hunter + Edge Case Hunter on Fable, Codex gpt-5.6-sol. Both Fable hunters flagged the follow lead (Codex did not); Codex alone flagged the short-viewport clamp (confirmed). Eric ruled live at the gate: lead in the fit (ruling 9), eased event jumps (ruling 10). 6 patches applied, 0 deferred, 2 rejected (no-effect notes). Follow-up review recommended: the gate added a new easing mechanism and two rulings.

**Verification:** `npm run check` exit 0 on the orchestrator's own run — lint 0 errors (2 pre-existing max-lines warnings), shared 1169, server 2785 + 2 skipped, client 4167 across 135 files, hooks 266. Each new contract test was shown to fail with its fix reverted.

**Residual risks (Eric judges on staging):** the orchestrator readings in amendment 208 (full-width bar clamp, merged-stop slide to the map center, which zooms ride a resize); the half-second ease rate is a feel number; the 1280×614 floor needs a ~7,300 u stop, so short windows zoom far out to clear the bar.

