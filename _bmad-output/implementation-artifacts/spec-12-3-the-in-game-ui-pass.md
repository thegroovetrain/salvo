---
title: 'Story 12.3 The In-Game UI Pass — dark-gray hulls, brackets everywhere, the near radar fade, fitted names + the hull health bar, the special-shell area, and the one vertical HUD bar'
type: 'feature'
created: '2026-11-19'
status: 'done'
baseline_revision: 'f905edc1'
final_revision: 'PR #367'
cycle: '243'
version: '0.20.1 (Eric)'
protocol_version: '110 -> 111'
amendments: 'epic-12 amendments 2-4 (rulings), 7 (build)'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/12-3-the-in-game-ui-pass.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-12-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
---

# Story 12.3 — cycle record

The story file (`12-3-the-in-game-ui-pass.md`) holds the ACs and Eric's verbatim sitting; epic-12 amendments 2–4 hold the rulings, amendment 7 the build-time rulings and readings. This file records what was built and how it was verified.

## What was built

**Part A (AC 1–26)**
- Hull linework dark gray `#212121` on every ship through one seam (`relationColor.ts` `hullLineColor`), in a match, the ambient scene and the menu SVG art; brackets and names keep cyan / red.
- Corner brackets on every in-sight hull at every zoom, framing the hull (`bracketHalfPx`, `bracketTickLenPx`); a pooled bracket re-strokes only when its snapped half changes.
- Near-ship radar fade restored: `dimSlideU = max(0, innerU − reach) × fogLift`; the reach fan is cast only out to `innerU` (≈ 9× cheaper).
- Names fitted to the bracket, one size per zoom, falling to a 5×7 pixel font (`render/pixelFont.ts`, built once per name) — never hidden; the A2 four-block hull bar (`render/hullBars.ts`) with a slight glow, independent of the name latch.
- Wire: pure `hullBlocks(hp, maxHp)` (`shared/src/sim/hullBlocks.ts`), `CONFIG.hullBar.blocks`, `Contact.hb` appended last, present only within the name-tag reach (`nameTagHeld`, the server twin of `plateInSight`); invariant fuzz extended (present iff in name reach, non-vacuous both ways); PV 110 → 111.
- Special-shell area preview: one AREA register for star / phosphor / fouling / flash, a constant 2 screen-px stroke (`burstInk`), `.85` / `.08` in AIM COLOR.

**Part B (AC 27–40)**
- One vertical HUD bar (Pixi, `render/console/hudBar.ts` + `barWeapons` / `barShip` / `barGauges` / `barDraw` / `slots` / `skins`) replacing the Ship and Weapons consoles; fixed slot geometry from hull turret count + mine kind only; the one tier mark column (amendment 4); refill bars with fixed READY / seconds slots; footer gauges HULL / THROTTLE / LEVEL with fixed LEVEL slots.
- `HUD SIDE` setting (left / right); Space-home and follow centre the hull in the open water (`camera.focus`); spawn never slides, a side change glides; zoom-out fit honours the offset.
- Hover-only stats in a DOM flyout (`ui/hudFlyout.ts`, display-only, destroyed with the session); offer group along the bottom (236×88 cards, tier-color border, the lift on an inner face); `offerPos` retired.
- Short / narrow screens scale the bar and the offer group uniformly (Eric, amendment 7(b)).

## Verification

- `npm run check` green on the merged branch (shared / server / client / hook test) — final counts in the PR body.
- Review gate: Fable adversarial review + Codex cross-check. Both flagged the moving LEVEL chip; Codex alone the narrow-screen card overlap (resolved by Eric's scale ruling) and the name-gated hull bar; Fable alone the flyout lifecycle / pointer gating, pixel-name centring, spawn glide, card jump, hover flicker and zoom fit, plus the `hb` haze-band question (Eric: tight). All fixed with 17 regression tests that failed before their fixes.
- Pre-PR: `tickCost.mjs` old vs new, `glBudget.mjs`, `playCheck.mjs`, `matchSmoke` + `weaponsSmoke` — results in the PR body.

## Deferred

See `deferred-work.md` (2026-11-19, Story 12.3): the stale privacy line for `hullcracker.helm`; the bar's per-frame tile redraw (measure on staging); the zoom-limit re-clamp on first bar offset.
