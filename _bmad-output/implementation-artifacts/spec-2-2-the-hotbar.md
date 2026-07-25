---
title: 'Story 2.2: The Hotbar'
type: 'feature'
created: '2026-07-25'
status: 'in-progress'
baseline_revision: '7df936ae4bf2031c91d242252ea3ecdaa8bed347'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The loadout UI is still the interregnum stopgap — a flat 20px chip row bottom-right (`hud.ts` header: "Epic 2 rebuilds the hotbar") with no state grammar, no tooltip, no names; and the ratified bottom-left hotbar corner is occupied by the telegraph cluster. The ratified Afterimage hotbar (DESIGN.md Components · Hotbar Slot; UX-DR11/12/13) is unimplemented.

**Approach:** Build the Pixi hotbar: four 54px vertical slots bottom-left, top-to-bottom **Gun (keyless) – Q – E – R** (amendment 10), full state grammar (ready weapon / ready ability / selected / cooling / activated flash / empty / denied), ammo badge on >1-round systems, hover tooltip, and key-equivalent slot clicks that never fire the gun (amendment 11). Move telegraph/rudder/HDG/KTS to bottom-right in current style (amendment 12). Delete the old chip row.

## Boundaries & Constraints

**Always:**
- Slot order/keys: index 0 Gun (ghost key chip — no glyph, alignment kept), 1 Q, 2 E, 3 R. Weapon-vs-ability via `EQUIPMENT_IS_WEAPON` only. Selected = client `primedSlot` (gun when none primed).
- State grammar per DESIGN.md Components · Hotbar Slot, tokens only (`CLIENT_CONFIG.colors` — the tokens test bans literals): idle silver .28; ready weapon phosphor .4 outline + 10px glow; ready ability phosphor .65 + 14px glow + top-right chamfer (9px cut — shape mark, weapons never chamfer); selected amber outline + `0 0 16px` glow + inset wash + **filled amber key chip** (dual-coded; hue secondary); cooling dimmed icon + card-scrim interior + 2px conic perimeter track (phosphor elapsed / .14 remaining) + seconds countdown in quick-info; activated flash one ≤80 ms phosphor pop (reuse the 80/300 ms `DeniedPulse` timing constants' register) decaying to cooling; empty slot 3 dashed slate .45 + `+` glyph + "— awaiting refit —"; denied 1→2px denied-red edge pulse + icon flash — never silence.
- Slot anatomy (composite-2 register): key chip 16×16 mono left of square, 54×54 slot, label column right — name 13px/600 (amber when selected, dim when cooling), quick-info mono ~10px. Stack gap ~14px, anchored bottom-left (~44px left, ~26px bottom), laid out per frame from screen size like `Hud.update`. Geometry knobs live in a new `CLIENT_CONFIG.hotbar` group. Reserve a left gutter (~16px) for 2.6's XP rail/bank chip — render nothing there.
- Quick-info (amendment 13): weapons `DMG n · CD ns`, abilities `CD ns`; while cooling, the seconds count down live. Values from `effectiveStats()` (reload/ammo) + `CONFIG.<id>.damage` via one pure helper — never hand-copied numbers. Reload/cooling renders on every slot regardless of selection.
- Ammo badge only when the system's effective `maxAmmo > 1` (torpedo/mine after ammo upgrades): 16px scrim square overhanging top-right (−7px), phosphor mono count; counts down on fire, up on reload completion.
- Icons: procedural vector linework (Pixi Graphics) per equipment id, ~28px, `currentColor`-style tinted by state — no image assets.
- Tooltip on hover (short CLIENT_CONFIG-tunable delay): 236px panel (near-opaque `panel` scrim .97 register, silver .4 border, pointer notch), anatomy: name (mono 11 caps) → interaction line (mono 9 amber caps: `WEAPON · Q · SWITCH-TO` / `ABILITY · E · ACTIVATES` / gun `WEAPON · ALWAYS SELECTED`) → description. Boons don't exist: the BOONS ACCRUED divider/list and `◆n` compression render as **absence** (structure ready, nothing drawn). Names/descriptions come from a new client equipment-info table; copy is draft placeholder (amendment 13). Tooltip flanks the stack (right/above) and never leaves the viewport.
- Slot clicks are key-equivalent and swallowed (amendment 11): route through the SAME slot-action path as Q/E/R (prime toggle via `nextPrimedSlot`, ability FIFO incl. cap-denied feedback); gun-slot click selects gun; empty-slot click inert; clicks over any slot never reach the fire path. Hit-test via a pure `slotAtPoint` consulted by the existing mouse-gate injection (`MouseInput` lockout predicate pattern) — no Pixi eventMode.
- Refit-modal lockout unchanged: while open, slot keys AND slot clicks are suspended, and the hotbar (incl. tooltip) dims to 38%.
- Hotbar + tooltip render only while alive in-match (waiting room weapons-safe included); they die with the hull (death/spectate/reveal) and on return to port.
- Vitals move (amendment 12): telegraph ladder, rudder gauge, HDG/KTS readouts, and the adjacent `IN STORM` warning move to bottom-right joining the HP bar — current visual style, no overlap at the 1366×768 floor; the `PTS ×N — TAB` prompt stays bottom-right. Story 2.4 restyles; 2.2 only relocates.
- Denied wiring reuses the existing per-slot machinery (`abilityFlash`, `DeniedPulse`, `DenialDedup`, server `denied` frames); activated flash fires on the optimistic ability-press edge (the boost-prediction precedent).
- Pure-logic testing pattern: hotbar exposes pure functions (slot state mapping, layout/`slotAtPoint`, quick-info strings, tooltip model, click routing decision) with the Pixi class as a thin shell; no Pixi instantiation in tests.
- New Geist Mono sizes (if any) preload in `stage.ts`; complexity ≤ 10; one-way data flow (hotbar reads state, never drives net/sim except via the sanctioned input paths); `npm run check` green.

**Block If:**
- Any wire-contract (`shared/src/types.ts`) or `perception.ts`/`frames.ts` change turns out to be needed — this story is client-only (plus at most a shared read-only helper).
- Any gameplay value or mechanic beyond amendments 10–13 is needed.
- The XP rail / banked-level chip / cue line turn out to be required to satisfy an AC (they are Story 2.6).

**Never:**
- No XP rail, banked-level chip, or cue line (2.6). No settings overlay (2.3). No vitals restyle beyond relocation (2.4). No boon data/content, no `◆n` rendering, no offer changes (2.5–2.8). No DOM for the hotbar (Pixi only). No Pixi eventMode/interactivity system. No key remapping, no foghorn. No design-doc edits (Eric-gated). No resurrecting the old chip row, digit slot keys, or the mocks' stale Q-on-gun/F-slot mapping.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Render | TB alive, nothing primed | Gun slot selected-grammar; Q torpedo ready-weapon; E boost ready-ability (chamfer); R empty dashed | — |
| Select | Q pressed or Q-slot clicked | Torpedo slot flips selected (amber + filled chip); gun slot drops to ready | — |
| Revert | Torpedo primed; Q-slot clicked again (or gun slot clicked) | Selection reverts to gun | — |
| Ability click | E-slot (boost, ready) clicked | Activates via same FIFO as key; ≤80 ms activated flash → cooling | Cap/full FIFO → denied pulse |
| Swallow | Click anywhere over a hotbar slot | Gun never fires at the water beneath | — |
| Cooling | Torpedo fired; gun selected | Torpedo slot conic track fills, quick-info counts `CD 11.9s…` down while unselected | — |
| Denied | Ability pressed/clicked while cooling; or server denial for a slot | That slot pulses denied-red ≤80 ms + icon flash | Never silence |
| Ammo badge | `torpedoAmmo` upgrade owned (max 2) | Badge "2" appears; fire → "1"; reload complete → "2"; gun (max 1) never shows a badge | — |
| Tooltip | Hover Q slot ~delay | Tooltip: name, `WEAPON · Q · SWITCH-TO`, description; zero boons → no divider, no rows | Leaves slot → hides |
| Modal | TAB modal open | Hotbar dims to 38%; slot keys and slot clicks do nothing; modal stays | — |
| Death | Own hull sinks / spectate / reveal | Hotbar + tooltip hidden; vitals per existing behavior | — |
| Corner | Any viewport ≥ 1366×768 | Hotbar bottom-left; telegraph/rudder/HDG/KTS + IN STORM bottom-right with HP bar, no overlap | — |

</intent-contract>

## Code Map

- `client/src/render/hotbar.ts` — NEW: `Hotbar` Pixi class + pure core (`slotViewModel`/state union, `hotbarLayout`, `slotAtPoint`, `quickInfoLine`, `tooltipModel`, click-routing decision); consumes `OwnStatus` + per-slot flash/denied arrays + `mouse.screenPos`
- `client/src/render/equipmentInfo.ts` — NEW: per-equipment display name, draft description, interaction label, damage lookup (single pure path over `CONFIG`/`effectiveStats`)
- `client/src/render/hud.ts` — delete chip row (`drawWeaponChips`/`drawOneChip`/`drawCooldownChip`/`drawAmmoChip`/`drawChip`/`chipTint`/`chipLabel`/`chipUsesCooldownGrammar`/`AmmoChipView`, `SLOT_KEY_GLYPHS`/`EQUIPMENT_LABEL` :104/:119); relocate telegraph/rudder/readouts root + `IN STORM` (:423) bottom-right; keep `OwnStatus`, `reloadFraction`, `hpColor`, PTS line
- `client/src/main.ts` — construct/update `Hotbar` in `renderOwn` (:993 region); route slot clicks (mouse gate → keyboard slot-action path, :792 lockout injection); pass modal-dim + alive state; hide on death/spectate/port
- `client/src/input/mouse.ts` — extend the injected gate (:56–68): pointerdown over a slot → routed to hotbar action, not fire; hover position already tracked (:86)
- `client/src/input/keyboard.ts` — expose the slot-action entry (prime/ability incl. suspension + cap feedback) for click reuse; no binding changes
- `client/src/config.ts` — `CLIENT_CONFIG.hotbar` (slot 54, gap, margins, gutter, dim 0.38, tooltip delay, badge/chip geometry)
- `client/src/render/stage.ts` — font preloads for new mono sizes (:77–92) if needed
- `client/src/__tests__/hotbar.test.ts` — NEW pure-logic suite; `hud.test.ts` — drop deleted helpers, keep telegraph/HP/PTS pins; `mouse.test.ts`/`keyboard.test.ts` — click-routing + suspension extensions; `tokens.test.ts` must stay green

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/equipmentInfo.ts` -- add name/description/interaction/damage table (draft copy) -- single source for hotbar + tooltip text
- [x] `client/src/config.ts` -- add `CLIENT_CONFIG.hotbar` group -- geometry/behavior knobs, token-sourced
- [x] `client/src/render/hotbar.ts` -- build pure core (7-state mapping, layout, hit-test, quick-info, tooltip model, click routing) + thin Pixi shell (slots, chips, chamfer, conic track, badge, tooltip, dim) -- the ratified hotbar
- [x] `client/src/input/keyboard.ts` -- expose key-equivalent slot-action entry -- clicks reuse the exact key semantics
- [x] `client/src/input/mouse.ts` -- gate pointerdown over slots → hotbar action, never fire -- amendment 11
- [x] `client/src/render/hud.ts` -- delete chip row; move telegraph/rudder/readouts + IN STORM bottom-right (current style, no overlap at floor viewport) -- frees the ratified corner
- [x] `client/src/main.ts` -- wire hotbar lifecycle (update, clicks, modal dim, alive/death/spectate/port visibility) -- one-way flow preserved
- [x] `client/src/render/stage.ts` -- preload any new mono sizes -- no FOUT in HUD text
- [x] `client/src/__tests__/` -- hotbar suite (state grammar incl. all 7 states, order Gun–Q–E–R, hit-test, click routing/swallow, quick-info strings, tooltip model incl. boons-absence, modal suspension, badge >1 rule); update hud/mouse/keyboard tests -- pins the grammar
- [x] Run full verification -- `npm run check` green

**Acceptance Criteria:**
- Given each class (TB/BS/ML), when alive, then slots render Gun–Q–E–R top-to-bottom with correct weapon/ability grammar per `EQUIPMENT_IS_WEAPON` (chamfer only on abilities), gun keyless with ghost chip alignment.
- Given any selection change via key OR slot click, then selected grammar tracks `primedSlot` (gun when none) and clicks over the hotbar never fire the gun.
- Given any slot reloading, then its conic track + countdown tick regardless of which slot is selected.
- Given the refit modal open, then the hotbar dims to 38% and slot keys and clicks are suspended.
- Given death, spectate, reveal, or return to port, then hotbar and tooltip are gone; telegraph/rudder/HDG/KTS + IN STORM render bottom-right beside the HP bar at every supported viewport without overlap.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass with no new color literals.

## Spec Change Log

## Review Triage Log

## Design Notes

- All design decisions are Eric-ruled: amendments 10–13 (hotbar order + keyless gun, clickable key-equivalent slots, interim vitals move, quick-info shape). Visual grammar is DESIGN.md Components · Hotbar Slot / Ammo Badge / Slot Tooltip + hud-composite-2 register; the mocks' key mapping (Q-on-gun, F slot) is stale — amendments win.
- Damage stays a `CONFIG` read (not added to `EffectiveStats`): no damage upgrade exists; the single `equipmentInfo` helper is the one seam to migrate when 2.5's stat path makes damage boon-able.
- Hover/hit-test uses `mouse.screenPos` + pure `slotAtPoint` — no Pixi eventMode; this also gives the click gate for free and keeps the module testable without Pixi.
- Bank-chip/XP-rail gutter is reserved dead space this story; 2.6 fills it.
- The 2-1 review's text-entry-guard convention note doesn't bite: the hotbar is Pixi, no new focusable DOM chrome ships here.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green across shared/server/client
- `npm test -w client` -- expected: new hotbar suite + updated hud/mouse/keyboard suites pass
