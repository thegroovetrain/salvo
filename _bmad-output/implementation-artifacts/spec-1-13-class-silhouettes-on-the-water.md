---
title: 'Class Silhouettes on the Water'
type: 'feature'
created: '2026-07-23'
status: 'in-progress'
baseline_revision: '30720e6324d0a0cb8193c77dcfb7e6d7c3ed0988'
review_loop_iteration: 0
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md',
  ]
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Story 1.13 (epics.md, UX-DR9/UX-DR22 truesight scope). The class-silhouette half of the story already holds by construction — Story 1.3 shipped `shared/src/sim/silhouette.ts` as the single geometry source feeding server collision, shells/mines, client prediction AND `ShipView.draw()` (three board silhouettes + drone chevron), all test-pinned. What does NOT exist: nameplates. No hull on the water says who anyone is.

**Approach:** Pure client render story (zero wire/server change, no PV bump). Add a truesight nameplate system: callsign in the hud-micro register (mono 9 px, 0.18 em tracking, uppercase), colored with the owner's text-safe personal variant, floated above the hull, holding SCREEN-SPACE size at any zoom, fading exactly with truesight resolution; drones tagged "DRONE" in drone-outline grey. Plus Eric's ruling (2026-07-23): callsign entry cap tightens 16 → 14 now (matches kill feed + DESIGN's proposed entry-enforcement). Verify the silhouette/hitbox ACs via the existing pins.

## Boundaries & Constraints

**Always:** Client-only — no shared/server/wire change; `PROTOCOL_VERSION` untouched. `hullSilhouette` remains the SOLE hull geometry source — no new/parallel geometry anywhere ("silhouette IS the hitbox" stays true by construction; existing silhouette/collision/prediction/shipClasses pins stay green). Plates attach ONLY to `ShipView`-backed truesight entities (own ship + contacts) — structurally unreachable from blips/radar paints. Plate pose + fade come from the SAME snapshot sample and `Fader` alpha as the hull view (never a second interpolation path). Text renders at constant screen px (hud-micro: 9 px, letterSpacing ≈ 1.62 px, uppercased in code) with the plate floated above the hull: bottom-center anchored at `shipScreen.y − polygonMaxRadius(hull)·zoom − pad` (pad = new `CLIENT_CONFIG.nameplate` knob). Human plate color = `textSafe(PLAYER_HUES[idx])`; drone plate = literal `DRONE` in `droneOutline` VERBATIM (never textSafe, never the roster "DRONE-NN" name). All colors via `CLIENT_CONFIG.colors.*` (tokens guard scan stays green). Names are display-ellipsized to exactly 14 code points (mid-ellipsis, surrogate-safe — reuse `ellipsizeName`, hoisted to a shared util; kill-feed behavior byte-identical). Per-frame budget: plate text/color set once and latched (diff before `.text` — Pixi re-rasterizes on assignment); per-frame work limited to position/alpha writes. Complexity ≤ 10.

**Block If:** Any server/shared/wire change becomes necessary. A needed visual value is neither DESIGN-documented nor a client-only feel knob. Plates turn out to require touching `perception.ts`/`frames.ts` in any way.

**Never:** No blip class-shapes/coloring or plate-on-blip (Epic 4). No omniscient-reveal plates (Story 5.3). No results-screen or class-card work (1.14/Epic 5 — neither renders hulls today). No Color Hoist picker UI (1.14). No contested-hoist toast — Eric REJECTED the EXPERIENCE.md proposal outright 2026-07-23 (log doc-sync to deferred-work; do not build, ever, absent a new ruling). Never special-case drone physics/visibility — drone difference is plate text + color only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Human contact | sighted, roster synced | plate = callsign uppercase, textSafe hue, above hull, alpha = hull fade | — |
| Roster not yet synced | contact sighted, name/color unresolved | NO plate (never a session id); latch-retry per frame, appear on resolve | no throw |
| Player left roster | hull still sighted, roster miss | latched plate persists; if never latched, no plate | no throw |
| Drone contact | `isDroneHull(cls)` | plate = `DRONE`, `droneOutline` verbatim | — |
| Own hull | alive (incl. ready room) | own callsign plate in own textSafe hue; hidden exactly when hull hidden (sunk/spectate) | — |
| Contact lost | pruned from store | plate fades out with the 150 ms fader, destroyed with the view | — |
| Radar blip / paint | phosphor path | never a plate (no id-carrying view exists — structural) | — |
| Spectate zoom | zoomFactor 0.5 | plate holds 9 px screen size; offset tracks the scaled hull | — |
| Long name | roster name > 14 cps (legacy/hostile — server never caps) | mid-ellipsized to exactly 14 code points, surrogate-safe | — |
| Entry cap | menu typing / stored legacy 16-char name | maxLength 14; sanitize slices to 14 incl. re-slice of stored value on load | — |

</intent-contract>

## Code Map

- `client/src/util/text.ts` -- NEW: `NAME_MAX = 14` + `ellipsizeName` (hoisted from killFeed.ts, byte-identical behavior) — single display-cap source.
- `client/src/ui/killFeed.ts` -- import `NAME_MAX`/`ellipsizeName` from util/text; delete local copies; zero behavior change (tests pin).
- `client/src/ui/menu.ts` -- `NAME_MAX` 16 → import from util/text (14); `sanitizeName` + `input.maxLength` enforce; stored localStorage name re-sliced on load.
- `client/src/config.ts` -- `nameplate` knobs (offset pad px; anything else needed stays client-only feel).
- `client/src/render/nameplates.ts` -- NEW: `NameplateLayer` (screen-space container; one Text per hull id, created/destroyed with its view) + pure exported helpers: `plateText(name)` (uppercase + ellipsize), `plateColor(hueIdx | drone)` (textSafe vs droneOutline), `plateScreenY(shipScreenY, hullId, zoom, pad)` (uses shared `polygonMaxRadius(hullSilhouette(id))`).
- `client/src/render/stage.ts` -- add the screen-space plate container above the world/fog composite, below the Pixi HUD text (mirrors `preloadFonts` warm set if 9 px mono needs warming).
- `client/src/render/contacts.ts` -- `ContactViews` drives the plate layer per contact from its existing sample + fader (new deps: `nameOf: (id) => string | null` beside the existing `rosterIndex`); latch pattern mirrors `tryRecolor`.
- `client/src/main.ts` -- thread `nameOf` (roster name or null — NOT the id-fallback `rosterName`); wire own plate in `renderAlive`/`updateOwnColor` path; spectate reuses the contact pipeline so plates ride free.
- Tests: `client/src/__tests__/nameplates.test.ts` (NEW — full I/O matrix incl. latch, drone verbatim, code-point ellipsis, screenY math); killFeed tests keep passing unmodified (import hoist is invisible); menu sanitize cases → 14; verify AC-1/2/4 pins already exist (silhouette.test, shipClasses.test, prediction.test, ships.test) and extend ships.test ONLY if a class→silhouette draw pin is missing.
- Docs (same PR): `sprint-status.yaml` 1-13 → done; `_bmad-output/gds-workflow-status.yaml` next_expected → 1-14 + last_updated; `deferred-work.md` += 3 entries: (a) EXPERIENCE.md contested-hoist toast REJECTED by Eric 2026-07-23 — doc sync is Eric's; (b) DESIGN.md nameplate 14-char entry cap [PROPOSAL] now ratified/implemented — doc sync is Eric's; (c) hardening note: server never length-caps `options.name` (display paths defend; a join-time cap would be cheaper).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/util/text.ts` + `killFeed.ts` + `menu.ts` -- hoist ellipsis util, tighten entry cap to 14 -- single-source the cap before consumers.
- [x] `client/src/config.ts` -- nameplate knobs -- tunables before renderer.
- [x] `client/src/render/nameplates.ts` + `stage.ts` -- plate layer + pure helpers -- the new system.
- [x] `client/src/render/contacts.ts` + `main.ts` -- drive contact + own plates from the existing sample/fade/latch seams.
- [x] `client/src/__tests__/nameplates.test.ts` + menu/killFeed/ships test touches -- pin the matrix + AC coverage.
- [x] Docs sweep + `npm run check` green.

**Acceptance Criteria:**
- Given the three classes and drones anywhere hulls render (water, spectate, ready room), when drawn, then geometry is `hullSilhouette`'s identity-board polygons / legacy chevron, the same source the server hitbox uses — existing pins stay green and no second geometry source exists in the diff.
- Given a sighted human combatant hull (own or contact), when rendered, then its plate shows the callsign uppercase in hud-micro at constant 9 px screen size, in that player's ≥ 4.5:1 text-safe variant, floated above the hull, and its alpha always equals the hull's truesight fade alpha.
- Given a drone hull, when rendered, then its plate is exactly "DRONE" in `droneOutline` grey.
- Given radar blips and phosphor paints, when rendered, then no plate exists on them (structurally impossible, and no plate code is reachable from the radar path).
- Given the callsign field, when typing or loading a stored longer name, then entry is capped at 14 and any roster name > 14 code points still mid-ellipsizes on display.
- Given `npm run check`, when run, then lint (complexity ≤ 10) + tsc ×3 + all tests pass, tokens guard scan included, with `PROTOCOL_VERSION` and golden frames untouched.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Eric rulings (2026-07-23, this run):** entry cap 14 NOW (supersedes menu's 16; DESIGN's [PROPOSAL] tag ratified); contested-hoist toast REJECTED outright ("most pointless toast imaginable" — color is assigned at join, first-come). AskUserQuestion answers are the authority.
- **Why the story shrank:** recon proved 1.3 already delivered every silhouette AC (silhouette.ts is the sole source; `ShipView.draw` traces it verbatim; results/class-card surfaces render no hulls today — cards are 1.14, reveal is 5.3). 1.13 = nameplates + pins, per the epics AC text.
- **Screen-space plates are ratified:** death-reveal mockup footnote — "nameplates hold screen-space size (hud-micro register)"; spectate zooms to 0.5×, and world-space 9 px text would break the "no mono below 9 px post-scale" law. Camera never rotates (verified), so plates never tilt; `ShipView.gfx` DOES rotate with heading, which is why plates live in a separate screen-space layer, not as Graphics children.
- **hud-micro in Pixi is new ground:** the register exists only as a CLIENT_CONFIG token (DOM-projected, unused). Translate: fontFamily mono, fontSize 9, letterSpacing 9 × 0.18 = 1.62, uppercase in code (Pixi has no text-transform). Mirror hud.ts's Text conventions (diff-before-assign).
- **Own plate included:** DESIGN resolved nameplate scope 2026-07-16 as ALL truesight combatant hulls — own hull too.
- Eric directive: route subagent model selection via `/orchestrate` (as 1.3–1.12).

## Verification

**Commands:**
- `npm test -w client` -- expected: green incl. new nameplates matrix, menu cap, unchanged killFeed pins.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green; shared/server test counts unchanged (client-only story).

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): two tabs — each hull floats its uppercase callsign in its lightened hue above the bow at constant size; drones say DRONE in grey; plates fade with contacts at sight edge; no plates on radar blips; spectate zoom-out keeps plates 9 px.
