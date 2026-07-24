---
title: 'Class Silhouettes on the Water'
type: 'feature'
created: '2026-07-23'
status: 'done'
baseline_revision: '30720e6324d0a0cb8193c77dcfb7e6d7c3ed0988'
final_revision: 'ccff028c5a1430b73e29b994f125fcfb3ffc33e5'
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

### 2026-07-23 — Review pass (Blind Hunter + Edge Case Hunter, both at session capability, parallel; patch fixes routed per /orchestrate, orchestrator-verified)

- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 0, medium 2, low 9)
- defer: 2
- reject: 3
- addressed_findings:
  - `[medium]` `[patch]` Step-01's epic-context recompile (required by the stale-cache rule) regenerated `epic-1-context.md` purely from planning artifacts and ERASED the 1.8/1.10 ratified-ruling records that lived only in that file's review-patched corrections. Fixed: restored the baseline version verbatim (`git checkout 30720e6 -- …`); the structural hazard is logged to deferred-work.
  - `[medium]` `[patch]` Plates escaped the fog — `plateRoot` sat above the fog composite, so a full-alpha callsign floated on solid fog for ~0.5 s (stale window + fade) after its hull was occluded, contradicting "fades with truesight resolution". Fixed: `plateRoot` moved below `fogSprite` (worldRoot → plateRoot → fog → chart → hud); plates now inherit fog occlusion exactly like the hulls they label.
  - `[low]` `[patch]` ×9: pruned-contact plate offset popped to the torpedoBoat radius mid-fade (`classOf` deleted at prune) — hull id now cached on `FadingView` with a fade-after-prune pin; `plateText` re-ellipsizes after uppercase ('ß'→'SS' could exceed the 14-code-point cap; pinned); `sanitizeName` slices code points, never splitting surrogate pairs (8-emoji round-trip pinned); degenerate names (controls/zero-width-only) never latch a blank or multi-line plate while emoji-ZWJ sequences survive (pinned); `plateColor` gains the 1.12-style `?? amber` bounds guard; per-frame budget honored (module-scope per-hull offset radii replace the per-frame polygon scan; PlateFrame hoisted out of the render callback); `letterSpacing` derives from `PLATE_FONT_PX * 0.18`; ships.test upgraded from constructor smoke to a rendered-geometry pin (silhouette span == CONFIG length/beam, bounds enclose hull, stroke-invariant width−height identity, ×4 hulls); NameplateLayer state machine covered via a mocked-Text suite (create-once/diff-before-assign, no-op place, hide→place re-show pinned with the own-plate discipline note, remove/recreate).
- deferred: server `options.name` has neither type nor length validation (non-string join option throws in onJoin; pre-existing, server-side); step-01 compile-epic-context regeneration hazard (erases context-file-only correction records — needs Eric doc-sync or compiler preservation).
- rejected: spec frontmatter `in-progress` vs sprint-status `done` mid-run (workflow-inherent, same class rejected in 1.11/1.12); own plate visible over the downed-but-still-visible own hull (matches the spec's "hidden exactly when hull hidden"); own/contact latch-driver duplication (architecture preference, both sites have genuinely different lifecycles).

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

## Auto Run Result

**Summary:** Story 1.13 landed. Recon proved the silhouette half already held by construction since Story 1.3 (`shared/src/sim/silhouette.ts` is the sole geometry source feeding server collision, shells/mines, prediction AND the client hull render — "silhouette IS the hitbox" verified via existing pins plus a new rendered-geometry pin). Net-new: the truesight nameplate system — every truesight combatant hull floats its callsign in the hud-micro register (mono 9 px, 0.18 em tracking, uppercase) at CONSTANT screen size in a dedicated screen-space layer BELOW the fog (plates inherit fog occlusion exactly like hulls), colored with the owner's ≥ 4.5:1 text-safe personal variant, latching on roster resolve (an unresolved human shows no plate — never a session id; a latched plate survives roster leave), alpha riding the contact Fader so plates fade with truesight; drones show literal "DRONE" in drone-outline grey verbatim; own hull plated from the same roster source. Eric rulings 2026-07-23: callsign entry cap tightened 16 → 14 (code-point-safe slice; `ellipsizeName` hoisted to `util/text.ts`); the EXPERIENCE.md contested-hoist toast REJECTED outright — never built, logged for doc-sync. Client-only: PV untouched, zero shared/server edits.

**Files changed:** client: NEW `util/text.ts` (NAME_MAX 14 + ellipsizeName, single cap source), NEW `render/nameplates.ts` (NameplateLayer + pure latch/resolve/text/color/offset helpers, per-hull offset radii precomputed), `render/stage.ts` (screen-space plateRoot below fog; 9 px mono font warm), `render/contacts.ts` (plate driving off the existing sample/Fader; hull id cached on FadingView), `main.ts` (rosterNameOrNull, own-plate latch + placement, hoisted PlateFrame), `ui/killFeed.ts` (imports hoisted util, byte-identical), `ui/menu.ts` (entry cap 14, code-point slice, stored-name re-slice), `config.ts` (`nameplate.padPx = 8`). Tests: NEW `nameplates.test.ts` (25 incl. matrix, latch, degenerate input, state machine via mocked Text), `menu.test.ts` (+cap/surrogate cases), `ships.test.ts` (rendered-geometry silhouette pin ×4 hulls). Docs: `sprint-status.yaml` (1-13 → done), `gds-workflow-status.yaml` (next_expected → 1-14), `deferred-work.md` (+5 entries), `epic-1-context.md` restored to baseline after the recompile regression.

**Review findings:** 11 patches applied (2 medium, 9 low — see Review Triage Log), 2 deferred, 3 rejected.

**Follow-up review recommended: false** — patch volume was moderate but every fix is localized hygiene (z-order move, caching, string safety, guards, test hardening); the nameplate mechanism itself survived review structurally intact, and nothing touched wire, server, or cross-cutting seams.

**Verification:** `npm run check` exit 0 after both implementation and patch passes (lint 0 errors incl. complexity ≤ 10; tsc ×3; tests 1348 → 1379: shared 261 / server 633 / client 485). Orchestrator independently re-ran the gate both times and spot-verified: zero shared/server diffs, plateRoot z-order below fog, code-point-safe sanitizeName, plateText re-ellipsis, tokens guard scan green, epic-1-context ratified-ruling records restored.

**Residual risks:** Nameplate visuals unseen in a browser this run (dev server is Eric-managed) — plate legibility over fog-adjacent water, the 8 px pad, and 9 px mono rasterization await his visual pass. The fog z-order ruling (plates occlude with fog) is design-faithful but unmocked — if Eric prefers plates readable through the feathered fog edge, it's a one-line z-order swap. Kill-feed/plate ellipsis agree on surviving characters except for case-expanding exotic names (plate re-ellipsizes post-uppercase; feed uppercases via CSS without re-ellipsis — width may differ by a glyph on adversarial names only).
