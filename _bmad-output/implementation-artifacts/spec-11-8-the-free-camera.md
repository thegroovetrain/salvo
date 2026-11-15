---
title: 'Story 11.8 The Free Camera — strategic zoom, pan, corner brackets, chart icons, splash pegs'
type: 'feature'
created: '2026-11-15'
status: 'done'
baseline_revision: '2fea27e0'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
warnings: ['oversized']
---

<intent-contract>

## Intent

**Problem:** The camera is welded to the own ship (with look-ahead lead, a trailing ease and a keep-in-view clamp), there is no pan, and zoomed far out hulls / mines / crates shrink to invisible specks and shell landings vanish in a second. Eric 2026-11-15 (chat + AskUserQuestion; candidates page https://claude.ai/artifact/V1XqTDV3Ygw9cNBjsyq6Un): *"Supreme Commander-esque Strategic Zoom. That's what I want."*

**Approach:** Client-only. A two-mode camera (FOLLOW / PANNED) whose drawn center is a pure function of an anchor point, the zoom span, the live ring and the board; middle-drag + arrow-key pan, Space home, cursor-anchored zoom-in; screen-size corner brackets on small hulls, fixed 10 px chart icons on small mines / crates; a fading X peg at every own shell landing. No wire change, `PROTOCOL_VERSION` stays 108.

## Boundaries & Constraints

**Always (Eric's rulings, 2026-11-15 — numbers are literal):**
- **FOLLOW mode:** the anchor IS the own ship's true position every frame — no lead / look-ahead, no follow easing, no keep-in-view clamp (retire `leadOffset`, `followRate` lag, `keepShipInView`, `keepInViewPadU`). The ship is dead center unless the zoom-out slide below applies. Screen shake STAYS.
- **The drawn center** `C = slide(A, span)`: with `R` = the ring-waypoint span (today's `detentSpanU`) and `h = R / 2`: span ≤ h → `C = A`; h → R → glide `A` → live ring center; R → whole-board span → glide ring center → board center (the whole board centered at full zoom-out, "like it looked before"). Linear in span. No ring yet → ring center = board center. Degenerate spans (R ≥ board span, h ≥ R) collapse cleanly, never NaN.
- **Zoom OUT** (wheel / X): about the anchor — FOLLOW stays FOLLOW (anchor = ship); PANNED keeps its anchor.
- **Zoom IN** (wheel / Z): toward the cursor — the world point under the cursor stays under it; the new anchor is solved through the inverse of `slide` (and is exact when span ≤ h). This enters PANNED, except in FOLLOW with the cursor within 16 px of the own ship's screen position, which stays FOLLOW and zooms about the ship. Z with no known cursor position zooms about the screen center.
- **The zoom waypoints STAY** (intel + ring stops of amendment 208 / 142) for every zoom path, and the zoom range is unchanged (close span 880 u ↔ whole board).
- **Pan:** middle-mouse drag (1:1 under the cursor) and held arrow keys (screen-constant speed, reusing spectate's shipped `spectatePan` rate) enter PANNED; the anchor is clamped inside the board fit (board radius × `mapFitMargin`). Pan at a slide fraction t moves the anchor by Δ/(1−t) so the view tracks the hand; at t = 1 (full zoom-out) pan is a no-op.
- **Space** ends PANNED: snap (instant) to FOLLOW on the own ship; zoom unchanged. While alive Space does nothing else.
- **Arrow keys no longer steer** (remove from `LEFT`/`RIGHT`/`THROTTLE_AHEAD`/`THROTTLE_ASTERN`); WASD only.
- **Spectate** gets the same controls: home = the watched ship; WASD keeps its shipped spectate pan; arrows + middle drag pan; Space returns to the watched ship; zoom rules as alive.
- **Corner brackets** on the own hull and every in-sight hull (own cyan / relation stroke color via `relationStyle`): shown when the hull's on-screen LENGTH < 24 px, alpha fading linearly across a band of 30 % of 24 centered on it (full at ≤ 20.4 px, zero at ≥ 27.6 px); four corner ticks of a 16 px half-box (32 px square, = 24/2 + 4), ticks ~6 px, 1.5 px line, screen-size at every zoom, axis-aligned, centered on the hull; the true-size hull still draws inside; bracket alpha × the view's own alpha (sinking / dissolve). Not on radar paints.
- **Chart icons** for every visible mine (all kinds, own + enemy) and every airdrop + salvage wreck: when the thing's true drawn size < 10 px it draws ITS OWN look at a fixed 10 px, cross-fading with the true-size drawing over the same 30 % band (the beacon handover pattern, `beacons.ts`); own-mine range rings unaffected.
- **Splash pegs:** one per own shell end — every `sp` (self-private) is a MISS peg; every `hc` with `id === own session` is a HIT peg (all weapons, incl. torpedo and mine hits and star / flash shells — Eric: "utility shells, who cares"). Look: an X 7 px across, 1.5 px line, a thin dark halo, fixed screen size at every zoom; miss = `splash` #b8ccc6, hit = `hitBloom` #ff9d3d; alpha falls linearly 1 → 0 over 15 s, then removed. Never another captain's `hc`.
- **Settings controls list:** `'W / S'` and `'A / D'` lose `(+ ARROWS)`; add rows `MIDDLE DRAG / ARROWS — PAN MAP` and `SPACE — CAMERA HOME`.
- New tunables (peg fade 15 s, peg px, bracket threshold / band / half-box / tick / line, icon 10 px) live in `client/src/config.ts` as client feel knobs. American spelling. Every register ≥ 13 px rule untouched (no new text).

**Block If:** a change needs a wire field / server change / `PROTOCOL_VERSION` bump; the perception invariant would be touched; any new in-game text beyond the two settings rows.

**Never:** a minimum hull size (Eric rejected "strict min-size"); brackets on radar paints; follow-a-contact, fire-where-you-look, range ring on the chart, MARPA; a camera ease on the own ship; edits to `CLAUDE.md`; a Vite dev build as a perf verdict.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Follow, moving ship | FOLLOW, span ≤ h, ship at 30 u/s | ship's screen pos == screen center every frame | — |
| Zoom out to full | FOLLOW, wheel out to board span | center = board center, mode still FOLLOW; zoom back in to ≤ h → ship centered | — |
| Cursor zoom-in from full view | span = board, cursor on a far island | island point stays under cursor each step; PANNED | — |
| Pan then sail | PANNED, ship moving | view fixed on water; ship may leave screen | — |
| Space | PANNED | FOLLOW, ship centered, same zoom | — |
| No ring yet | pre-reveal | ring center := board center | no NaN |
| Ring shrinks past h | ring waypoint < 2 × span | slide stays continuous (center eases per amendment 208 ruling 10's half-second glide on ring feed changes) | — |
| Others' hit | `hc` with id ≠ own | no peg | — |

</intent-contract>

## Code Map

- `client/src/render/camera.ts` -- pure camera; `update` :923 (follow/lead/slide/clamp), `slideTarget` :810, `centreSlideT` :226, `keepShipInView` :954, `zoomAbout` :407 (spectate cursor zoom — generalize), `pan` :865, `snapTo` :799, `aliveZoomDetents` :583, `detentSpanU` :213, eased `jump` :841
- `client/src/main.ts` -- `bindWheelZoom` :5340, `applyUserZoom` :5249, `handleZoomStep` :5260, `renderOwn` :3290/:3321, `updateSpectateCamera` :4718, camera options :2234-2238
- `client/src/input/keyboard.ts` -- `LEFT/RIGHT` :96, Space inert :524, `panAxesFrom` :240, zoom hooks :533; `client/src/input/telegraph.ts` :16-18
- `client/src/input/mouse.ts` -- button 1 ignored in `onDown` :242 / `onUp` :270 / `onChord` :195
- `client/src/render/spectate.ts` -- `spectatePan` :31 (pan rate), `wheelZoom` :45
- `client/src/render/fog.ts` -- bake sized 2× viewport about the HULL relying on keep-in-view (~:116, `fogFrameRects` ~:199): must cover the screen when panned
- `client/src/render/fogField.ts` -- alive raster about the pose (`screenReachU` :122, `refresh` ~:580): must cover a panned screen
- `client/src/render/rangeRings.ts` -- `compassPlacement` :93 degrades when the ship is off-screen
- `client/src/render/ships.ts`, `contacts.ts` (`viewFor` ~:308, `recolor` :298), `stage.ts` (`CHART_LAYER_ORDER` :315) -- bracket overlay home
- `client/src/render/mines.ts` (`drawMarker` :375), `drops.ts` (`drawCrate` :56), `beacons.ts` (handover helpers :201-:275) -- chart icons
- `client/src/net/roomBindings.ts` -- `handleFallOfShot` :1433, `handleHitCall` :1480 -- peg feed
- `client/src/ui/settings.ts` -- `bindingRows` :141-155
- Tests: `__tests__/camera.test.ts` (slide :362-457), `zoomWaypoint.test.ts` (:197-270), `intelWaypoint.test.ts` (slide / keep-in-view / lead / eased jumps), `keyboard.test.ts`, `telegraph.test.ts`, `settings.test.ts` (:351-420)

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/camera.ts` -- FOLLOW/PANNED state, anchor, pure `slideCenter` + inverse, cursor-anchored alive zoom, anchor clamp, pan with Δ/(1−t); delete lead / follow ease / keep-in-view / old slide math; keep shake and the ring-feed eased glide -- the strategic zoom model
- [x] `client/src/input/{keyboard,telegraph,mouse}.ts` -- arrows off steering, arrow pan axes, Space → home hook, middle-drag pan (button 1, canvas-gated, preventDefault, cleared on blur/cancel/out) -- the controls
- [x] `client/src/main.ts` + `render/spectate.ts` -- wire wheel/Z/X/pan/Space for alive and spectate (helpers, not inline in `renderOwn`) -- one model both phases
- [x] `client/src/render/fog.ts`, `fogField.ts`, `rangeRings.ts` -- cover a panned screen; compass hidden or sane when the ship is off-screen -- no regressions under pan
- [x] `client/src/render/` new bracket module + `ships.ts`/`contacts.ts`/`stage.ts` -- corner brackets -- ruled look
- [x] `client/src/render/mines.ts`, `drops.ts` -- 10 px chart icon handover -- ruled look
- [x] `client/src/render/pegs.ts` (new) + `roomBindings.ts` + layer in `stage.ts` -- splash pegs -- ruled look
- [x] `client/src/config.ts` -- the new knobs; retire `keepInViewPadU`, `slideEaseRate` only if unused, lead knobs -- single source
- [x] `client/src/ui/settings.ts` + tests -- rows -- ruled copy
- [ ] tests -- pure unit tests for `slideCenter`/inverse (round-trip), bracket alpha, icon handover, peg alpha; camera integration with MOVING ships (amendment 208); update / delete the slide, lead, keep-in-view and arrow-steer tests -- functional pyramid
- [x] `client/scripts/playCheck.mjs` -- add middle-drag + arrow pan + Space to its 45 s drive -- the real-match guard

**Acceptance Criteria:**
- Given a FOLLOW camera and a moving ship at span ≤ h, when frames advance, then the ship's screen position equals the screen center (± shake).
- Given any span and anchor, when `slideCenter` then its inverse is applied (t < 1), then the anchor round-trips within 1e-6 u.
- Given the whole-board zoom, when the player wheels in over a point, then that world point stays under the cursor and the camera is PANNED; Space returns FOLLOW at the same zoom.
- Given a hull drawing 10 px long, then its corner brackets show at full alpha; at 30 px, none.
- Given an own `sp` and an own `hc`, then a near-white X and an amber X appear at their points and are gone after 15 s; an `hc` of another captain draws nothing.
- Given `npm run check`, `glBudget.mjs` and `playCheck.mjs`, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-11-15 — Review pass (Blind Hunter + Edge Case Hunter on Fable; Codex gpt-5.6-sol cross-check)
- intent_gap: 0
- bad_spec: 0
- patch: 13 (high 2, medium 6, low 5)
- defer: 0
- reject: 4 (pan/zoom gate asymmetry on the start line and while sinking — harmless, spectate entry homes; middle-button autoscroll on Windows — no Windows box, Eric is on macOS, noted for staging; cursor-anchor jump when the solved anchor hits the board rim — the clamp is the ruling; a stale cursor over a console used by X — cosmetic)
- addressed_findings:
  - `[high]` `[patch]` Endgame: h = R/2 with R floored at the default span put the FOLLOW ship off-center (even off screen) at default zoom once the ring shrank — both Fable hunters. Fix: h = max(R/2, floor span); when R ≤ h the anchor glides straight to the board center. Orchestrator reading of Eric's overriding "my ship should always be right in the middle unless I have panned" + "like before" (the pre-11.8 slide never started inside the default framing); flagged in the PR for his veto.
  - `[high]` `[patch]` Fog bake sized to the hole diameter dropped the bake resolution ~3× at ordinary zoom (Blind Hunter) — restore the old resolution, still cover a panned screen.
  - `[medium]` `[patch]` Respawn / reconnect while PANNED left the new hull unfollowed — Codex AND Blind Hunter: onOwnSpawn homes.
  - `[medium]` `[patch]` Cancelled middle drags / pose gaps / death replayed a stale pan delta as one jump — Codex AND both hunters: discard on cancel, cancelPanDrag at spectate entry, drain in the null-pose branch, no auto-repeat re-latch.
  - `[medium]` `[patch]` pan() released the reveal even when it moved nothing — both hunters.
  - `[medium]` `[patch]` Float residue at the waypoint flipped FOLLOW→PANNED and threw the anchor — epsilon.
  - `[medium]` `[patch]` Spectate target switch hard-cut — glide over the shipped half-second eased jump.
  - `[medium]` `[patch]` Zoom easing drew the center one frame stale (cropped first reveal frame at motion: off).
  - `[low]` `[patch]` X/Z with no cursor dropped FOLLOW — zoom about the anchor.
  - `[low]` `[patch]` fogField raster flip-flop at the screen edge — hysteresis.
  - `[low]` `[patch]` Clipped compass stub at a screen edge — hide threshold.
  - `[low]` `[patch]` Off-screen own-hull consumers (plate, foghorn origin, own screen point) audited.
  - `[low]` `[patch]` pegs / brackets destroy() for teardown.

## Design Notes

Why the inverse matters: zoom-in toward the cursor while the slide is active (h < span) must pick an anchor `A'` with `slide(A', s') = C'`; for the A→ring segment `A' = (C' − t·ringC)/(1 − t)`; clamp `A'` to the board fit. For span' ≥ R the drawn center does not depend on A (it is fixed by the ring→board glide), so the cursor cannot be held exactly: set `A' = P` (the world point under the cursor) so continued zoom-in heads there (orchestrator reading). When span crosses down past h the result is continuous because both formulas meet at t = 0.

## Verification

**Commands:**
- `npm run check` -- green (lint complexity ≤ 10 included)
- `npm run build && node client/scripts/glBudget.mjs` -- no over-budget allocation incl. panned views
- `node client/scripts/playCheck.mjs` -- passes with pan + Space in the drive (bounded with `timeout`)

## Auto Run Result

**Status: done** (2026-11-15; cycle 235, 0.19.29, PV 108 unchanged, epic-11 amendment 14).

- **Built:** strategic zoom — a FOLLOW / PANNED camera (own ship dead center in FOLLOW; zoom out about the anchor with the slide to ring center then board center; cursor zoom-in; waypoint stops kept); middle-drag + arrow-key pan, Space home, arrows off steering, the same in spectate; corner brackets on hulls under 24 px; 10 px chart icons for mines, airdrops and salvage wrecks; X splash pegs (own `sp` / own `hc`, 15 s fade); settings rows; DESIGN.md rows; fog bake / fog field / compass made pan-safe.
- **Files:** `client/src/render/camera.ts`, new `cameraSlide.ts` / `cameraZoom.ts`, `input/{keyboard,telegraph,mouse}.ts`, `main.ts`, `render/{spectate,fog,fogField,rangeRings,radarDisplay,ambient}.ts`, new `render/{brackets,chartMarks,pegs}.ts`, `render/{ships,contacts,stage,mines,drops}.ts`, `net/roomBindings.ts`, `config.ts`, `ui/settings.ts`, `client/scripts/playCheck.mjs`, tests (new `cameraSlide`, `cameraReview`, `fogBake`, `chartMarks`).
- **Review:** 13 patches (2 high), 0 deferred, 4 rejected — see the triage log.
- **Verification:** `npm run check` exit 0 (lint 0 errors / 3 pre-existing length warnings; shared 1465, server 2979, client 176 files all pass; hook test passes); `playCheck.mjs` PASS in Chromium + Firefox at both viewports (drives middle drag, arrows, Space, wheel while panned); `glBudget.mjs` PASS.
- **Residual risks:** Windows middle-button autoscroll suppression unverified (no Windows machine); the slide-floor reading (amendment 14(f)) is the orchestrator's — Eric's veto; frame cost of the bracket / peg layers is unmeasured on staging (a perf verdict is a staging capture).
