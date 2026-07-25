---
title: 'Story 2.2: The Hotbar'
type: 'feature'
created: '2026-07-25'
status: 'in-review'
baseline_revision: '7df936ae4bf2031c91d242252ea3ecdaa8bed347'
review_loop_iteration: 0
followup_review_recommended: true
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

### 2026-07-25 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 14: (high 2, medium 3, low 9)
- defer: 1: (high 0, medium 1, low 0)
- reject: 6
- addressed_findings:
  - `[high]` `[patch]` Square-only hit test (flagged by Blind Hunter AND Codex): clicking the key chip, label column, or ammo-badge overhang fell through and fired the gun — amendment 11 violation. Hit region expanded to the full row footprint (chip → slot → labels, badge overhang included); full row swallows and acts; inter-row gaps deliberately stay water. Pinned by hit/miss tests.
  - `[high]` `[patch]` Per-PR bookkeeping: sprint-status.yaml `2-2-the-hotbar: done`; gds-workflow-status.yaml `last_updated` 2026-07-25 + story 2-2 summary + `next_expected: create-story 2-3`.
  - `[medium]` `[patch]` Mine (ability) showed `DMG 45 · CD …` — unilateral deviation from amendment 13 (flagged by Blind Hunter AND Codex, plus the implementer's own note). `quickInfoLine` now keys on `EQUIPMENT_IS_WEAPON`; mine reads `CD 8s`, damage moved to tooltip description draft copy.
  - `[medium]` `[patch]` Multi-round availability (Edge Case Hunter): a partially-loaded reloading pool (upgraded torpedo/mine, n ≥ 1) read `cooling`, misreporting a fireable slot. State now derives from `n <= 0 && reloadMsLeft > 0`; pinned.
  - `[medium]` `[patch]` Reconnect/null-pose gap (Codex): stale hotbar stayed visible and click-routable while `ownPose()` was null after forceSnap. Null-pose branch hides the hotbar; `hide()` clears the cached layout so `slotAtPoint` misses; pinned.
  - `[low]` `[patch]` ×9: click-gating de-duplicated onto the one `keyboard.slotAction` path (decorative `slotClickAction` deleted); null-ammo badge no longer fabricates "0"; cooling track drawn at coolFrac 0 incl. `reloadMsLeft ≥ reloadMs` clamp; tooltip requires pointer-inside-window (aim path untouched); tooltip fully suppressed under the refit modal; cooling border uses the DESIGN silver .28 recipe; `fmtRemaining` floors at 0.1s matching its doc; per-frame `style.fill` writes equality-guarded; polygon tracers extracted to `util/poly.ts` (+6 tests).
- Rejected as noise: coordinate-space assumption (architectural fullscreen canvas, same as the aim path), denied 1→2px pulse (the 80 ms 2px window IS the pulse), vitals hand-measured constants (interim; 2.4 restyles), VERSION bump (release chore, separate from story PRs per repo history), activated-pop 300 ms rate floor (that floor is the ratified accessibility rule), workflow bookkeeping-in-progress note.

## Design Notes

- All design decisions are Eric-ruled: amendments 10–13 (hotbar order + keyless gun, clickable key-equivalent slots, interim vitals move, quick-info shape). Visual grammar is DESIGN.md Components · Hotbar Slot / Ammo Badge / Slot Tooltip + hud-composite-2 register; the mocks' key mapping (Q-on-gun, F slot) is stale — amendments win.
- Damage stays a `CONFIG` read (not added to `EffectiveStats`): no damage upgrade exists; the single `equipmentInfo` helper is the one seam to migrate when 2.5's stat path makes damage boon-able.
- Hover/hit-test uses `mouse.screenPos` + pure `slotAtPoint` — no Pixi eventMode; this also gives the click gate for free and keeps the module testable without Pixi.
- Bank-chip/XP-rail gutter is reserved dead space this story; 2.6 fills it.
- The 2-1 review's text-entry-guard convention note doesn't bite: the hotbar is Pixi, no new focusable DOM chrome ships here.

## Auto Run Result

**Status:** done — implemented, adversarially reviewed (2 Fable hunters + Codex cross-model), 14 patches applied, gate green.

**Summary:** The ratified Afterimage hotbar is live: four 54 px slots bottom-left, top-to-bottom Gun (keyless, ghost chip) – Q – E – R per amendment 10, with the full 7-state grammar (ready weapon / ready ability+chamfer / selected amber+filled chip / cooling with conic perimeter track + live countdown / ≤80 ms activated pop / dashed "— awaiting refit —" empty / denied red pulse — never silence), ammo badge on >1-round pools, and a hover tooltip (name, interaction line, draft description; boons render as absence). Slot clicks are key-equivalent through the one `keyboard.slotAction` chokepoint and are swallowed across the full row footprint — a click over the hotbar can never fire the gun (amendment 11). Quick-info follows amendment 13 (weapons `DMG n · CD ns`, abilities `CD ns`, live with upgrades). The telegraph/rudder/HDG-KTS cluster + IN STORM warning moved bottom-right beside the HP bar in current style (amendment 12; 2.4 restyles). Old chip row deleted. Client-only; no wire change, PV stays 12. Tests 1474 → 1528.

**Files changed:** client (NEW render/hotbar.ts + render/equipmentInfo.ts + render/equipmentIcons.ts + util/poly.ts; hud.ts chip-row deletion + vitals relocation; main.ts hotbar lifecycle/click routing/activated channel; input/keyboard.ts slotAction entry; input/mouse.ts slot-press gate + pointer-presence flag; config.ts CLIENT_CONFIG.hotbar; stage.ts font preloads; NEW __tests__/hotbar.test.ts + poly.test.ts, updated hud/mouse/keyboard tests), bookkeeping (sprint-status.yaml 2-2 done; gds-workflow-status.yaml advanced to create-story 2-3; epic-2-context.md + epic-2-context-amendments.md — amendments 10–13 recorded durably).

**Review breakdown:** 14 patches applied (2 high — full-row hit-test swallow flagged by two reviewers independently, per-PR bookkeeping; 3 medium — amendment-13 conformance, multi-round availability state, reconnect stale-hotbar lifecycle; 9 low), 1 deferred to the ledger (active-ability-window state absent from the ratified grammar — Eric ruling needed, likely 2.9), 6 rejected as noise. 0 intent gaps, 0 bad-spec loopbacks.

**Verification:** `npm run check` run independently by the orchestrator after implementation AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 261 / server 647 / client 620 all green. Input-path diffs (mouse gate ordering vs modal lockout, slotAction suspension/fail-closed semantics, null-pose hide) hand-reviewed.

**Residual risks / notes for Eric:** (1) No browser eyeball pass — the Pixi rendering is pinned by pure-logic tests only; worth a look when you next run the worktree (dev server untouched per standing rule). (2) The mine's 45 damage now lives only in its tooltip description per the literal amendment 13 — say the word if you want ability damage surfaced differently. (3) A running speed-boost/decoy window has no persistent hotbar indication (ledger entry; the ratified grammar has no such state — your call, likely at 2.9). (4) Equipment names/descriptions are draft placeholder copy per amendment 13. (5) Inter-row gaps (14 px minus badge overhang) deliberately stay live water for clicks; the row rects themselves swallow.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green across shared/server/client
- `npm test -w client` -- expected: new hotbar suite + updated hud/mouse/keyboard suites pass
