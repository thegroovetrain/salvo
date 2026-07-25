---
title: 'Story 2.1: The New Input Scheme'
type: 'feature'
created: '2026-07-24'
status: 'done'
baseline_revision: '02e8ed51e9b121287d90335e2f8ef20777e74778'
final_revision: '718da8e6d385e96cb6948fb89259d46e43a0888e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The client still runs the interregnum bindings — digits 1/2/3 prime/activate slots, bare-CTRL toggles the spend menu, CTRL+1/2/3/E spend — with no browser hygiene: four scattered window keydown listeners, almost no preventDefault, no text-input guard in the sim keyboard, and a window-level pointerdown that fires the gun even when clicking DOM overlays (an upgrade-card click literally fires). The ratified Q/E/R/F scheme and Eric's 2026-07-24 rulings (TAB-toggle refit, full combat lockout, no repair, X/Z zoom) are unimplemented, and two Epic-1 press-swallow debts are routed here.

**Approach:** Rebuild the in-match keyboard as ONE keydown chokepoint implementing the fixed v1 bindings; make mouse fire canvas-target-only with contextmenu suppressed; convert the upgrade menu to a TAB-toggled modal (digits 1–4 / click picks, REPAIR deleted end-to-end); add alive camera zoom (wheel + X in / Z out, 0.5–1.5×); close both press-swallow debts (client FIFO denied feedback; server evaluates every received input's fire/act intent per tick).

## Boundaries & Constraints

**Always:**
- Gun (slot 0) is default and always selected. Weapon slot keys are switch-to: pressing primes, pressing again reverts to gun, firing auto-reverts to gun (a predicted-denied click keeps the prime — existing behavior). Ability slot keys activate immediately. Weapon-vs-ability is decided by `EQUIPMENT_IS_WEAPON`, never by hull id or slot literals.
- Bindings: Q = slot 1, E = slot 2, R = slot 3 (inert while empty — no feedback), F reserved for the Foghorn (fully inert, prevented), TAB toggles the refit modal, digits 1–4 pick cards ONLY while the modal is open (refit-or-nothing; digit meaning evaluated against modal state at its own keydown), ESC closes the topmost surface (in-match: the modal; otherwise nothing until Story 2.3), W/S telegraph ±1 edge-only, A/D held rudder, Z/X + wheel zoom, M mute, P prediction debug toggle. Space and CTRL are unbound but Space keydown is still prevented (page scroll).
- Refit modal = full combat lockout: while open, NO pointerdown fires anything, slot keys (Q/E/R/F) are suspended, helm stays live, the sim never pauses; closes only via pick / TAB / ESC (existing auto-close on zero points, death, spectate stays). A card click spends and closes and must never fire the gun.
- Single chokepoint hygiene: every bound key preventDefault-ed there (incl. TAB focus-cycle and Space scroll); contextmenu suppressed on the canvas; a focused text input or DOM button suppresses all sim keys while the sim keeps running. Pre-join surfaces (home, class select) keep their own scoped, guarded handlers.
- REPAIR/heal spend is deleted end-to-end: client row/bindings/canHeal, `HEAL_CHOICE`, `World.spendHeal` + the HEAL branch in `spendPoint`, and the `heal` self-private event/signal row. Bump `PROTOCOL_VERSION` 11 → 12.
- Server press fix stays inside `game/inputs.ts` + `game/world.ts` (zero Colyseus imports): keep latest-wins for kinematics, additionally queue each accepted input's intent fields; fire/activation controls evaluate ALL drained intents in seq order (bounded — rate cap yields ≤2/tick; hard-cap the drain at 4) so an older press fires or is denied, never silently swallowed. All sanitization rules unchanged.
- Client FIFO cap (`pendingActs` ≥ SLOT_COUNT) produces denied feedback (existing denial pulse/tone path), not silence.
- Zoom is client-render-only (CLIENT_CONFIG, not shared CONFIG): alive factor clamped 0.5×–1.5× over the base radar-fit framing; spectate zoom code path untouched. Fog/perception untouched.
- Key glyphs touched this story (upgrade-modal digit prefixes, HUD chip keys, PTS prompt) render in one mono key-chip family; HUD chips: gun keyless, specials show Q/E, empty extra slot renders nothing.
- Complexity ≤ 10; one-way client data flow; `npm run check` green.

**Block If:**
- Offer shape (3 cards) would need to change — offer content/size is Story 2.7.
- `perception.ts`/`frames.ts` would need changes.
- Any gameplay value or mechanic beyond the rulings recorded in epic-2-context-amendments.md (entries 1–9) turns out to be needed.

**Never:**
- No hotbar visuals/state grammar (2.2), no settings overlay and no ESC-opens-settings (2.3), no vitals cluster (2.4), no foghorn behavior, no key-remapping UI, no offer rerolls, no resurrecting REPAIR or the closed-window digit spend or digit slot-priming, no Space/CTRL bindings, no design-doc edits (DESIGN.md/EXPERIENCE.md/GDD/epics.md are Eric-gated).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Switch-to | TB alive, gun selected; Q keydown | Torpedo primed | — |
| Un-prime | Torpedo primed; Q keydown | Reverts to gun | — |
| Auto-revert | Torpedo primed; fireable click | Torpedo fires; selection reverts to gun | Predicted-denied click keeps prime + denial feedback |
| Ability | E keydown (ability slot, e.g. boost/decoy) | Activates immediately via FIFO | 5th same-window press → denied feedback, never silence |
| Class spread | BS: Q/E; ML: Q/E | BS cannon & star shells both switch-to; ML mines & decoy both activate | — |
| Inert keys | R (empty slot 3), F, Space | Nothing; default prevented | — |
| Modal open | TAB keydown, modal closed | Modal opens only when a banked point exists (existing visibility rule); at 0 pts nothing happens | — |
| Modal close | TAB or ESC, modal open | Closes, nothing spent | — |
| Card pick | Modal open; digit 1–3 or card click | That card spends, modal closes, gun does not fire | Digit 4 with 3-card offer → nothing |
| Refit-or-nothing | Modal closed; digit 1–4 | Nothing | — |
| Lockout | Modal open; pointerdown on water | Nothing fires; modal stays open | — |
| Text guard | Text input/button focused | Zero sim input; sim keeps running | — |
| Zoom | Wheel / X / Z while alive | Smooth / in / out, clamped [0.5, 1.5] | Spectate wheel path unchanged |
| Coalesced presses | Server: 2 inputs land in one tick (fireSeq/actSeq n, n+1) | Both intents evaluated in seq order; older press fires or gets a wire denial | Never silent |
| Hostile heal | MSG.spend `{choice: 3}` | `spendPoint` returns false; point untouched | Client latch releases via existing 1500 ms fallback |

</intent-contract>

## Code Map

- `client/src/input/keyboard.ts` — THE chokepoint rebuild: binding table, preventDefault, text-input guard, Q/E/R routing (`nextPrimedSlot`, `slotHoldsAbility`), digit→refit picks, TAB/ESC/Z/X/M/P callbacks, modal suspension, FIFO cap feedback (cap at :292)
- `client/src/input/mouse.ts` — canvas-target-only pointerdown (:50-57), contextmenu suppression, lockout check
- `client/src/input/telegraph.ts` — already edge-only (:40-45); do not change
- `client/src/main.ts` — remove ad-hoc P/M listener (:1402-1405); wire toggle/zoom/lockout; keep `consumePrimeOnFire` (:1070-1088); drop heal path (:379); PTS/chip label data
- `client/src/ui/upgradeMenu.ts` — TAB-toggle wiring (toggle at :193-201), digit key-chip prefixes, REPAIR row deleted (:188), click hygiene (no focus retention; card click never reaches the fire path)
- `client/src/render/hud.ts` — chip glyphs (:114-117 `chipLabel`), PTS prompt "TAB" (:190-193), shared mono chip style
- `client/src/render/camera.ts` + `client/src/config.ts` — alive user-zoom factor over base (:97-100); `CLIENT_CONFIG.zoom` {min 0.5, max 1.5, key step, wheel rate}; spectate clamps (:34-35) untouched
- `shared/src/types.ts` — delete `HEAL_CHOICE` (:129) + heal event type; `shared/src/index.ts` — `PROTOCOL_VERSION` 12
- `server/src/game/world.ts` — `spendPoint` (:581-589) drops HEAL branch; delete `spendHeal` (:597-604); `fireControl`/`activationControl` (:991-1059) iterate drained intents in seq order
- `server/src/game/inputs.ts` — `InputStore` (:168-182) additionally queues accepted intents; drain API; sanitization unchanged
- `server/src/game/signals.ts` — remove the heal signal row (self-private; can no longer fire)
- Tests: `client/src/__tests__/` (new chokepoint suite; upgradeMenu; camera), `server/src/__tests__/` (inputs queue, coalescing regression, denials extension, spendPoint heal rejection), goldenFrames if event set changes

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/types.ts` + `shared/src/index.ts` -- delete HEAL_CHOICE + heal event; PV 11→12 -- wire contract matches the ruling
- [x] `server/src/game/world.ts` -- spendPoint rejects non-0..2; delete spendHeal + heal event emission -- server authority matches ruling
- [x] `server/src/game/signals.ts` -- remove heal signal row + its invariant/test references -- no dead wire event
- [x] `server/src/game/inputs.ts` -- per-tick accepted-intent queue with bounded drain (≤4), latest-wins kinematics unchanged -- closes transport-coalescing swallow
- [x] `server/src/game/world.ts` -- fireControl/activationControl consume drained intents in seq order, per-press denials, lastFireSeq/lastActSeq stay monotonic (never reset on death) -- every press fires or is denied
- [x] `server/src/__tests__/` -- coalescing regression (two inputs one tick → older evaluated/denied), spend heal-rejection, denials extension -- pins the fixes
- [x] `client/src/input/keyboard.ts` -- chokepoint rebuild per Always rules -- one dispatcher, full hygiene
- [x] `client/src/input/mouse.ts` -- canvas-only fire + contextmenu + modal lockout -- clicks on chrome never fire
- [x] `client/src/ui/upgradeMenu.ts` -- TAB toggle, digits 1–4, REPAIR row gone, click hygiene -- ruled modal behavior
- [x] `client/src/main.ts` -- rewire callbacks, remove ad-hoc listeners + heal path, modal lockout state -- one-way flow preserved
- [x] `client/src/render/camera.ts` + `client/src/config.ts` -- alive zoom (wheel + X/Z, clamp 0.5–1.5) -- ruled zoom
- [x] `client/src/render/hud.ts` -- Q/E chip glyphs, keyless gun chip, "TAB" PTS prompt, mono chip family -- HUD stops lying about keys
- [x] `client/src/__tests__/` -- chokepoint suite (prime toggle/auto-revert, refit-or-nothing digits, text-input guard, FIFO denied feedback, lockout), upgradeMenu, camera clamp -- pins the scheme
- [x] Run full verification -- `npm run check` green

**Acceptance Criteria:**
- Given any hull class, when Q/E/R are pressed, then behavior follows EQUIPMENT_IS_WEAPON per fitted slot (TB Q switch-to + E immediate; BS both switch-to; ML both immediate; R inert while empty).
- Given the story lands, when digits or CTRL are pressed outside the modal, then nothing happens anywhere in-match, and W/S/A/D telegraph/rudder behavior is unchanged.
- Given a focused text input on any surface, when W/A/S/D/Q/E/TAB are typed, then the ship does not move, prime, or open surfaces, and the sim never pauses.
- Given a stale pre-2.1 bundle, when it joins, then the PV gate rejects it with the refresh message (PV 12).
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

### 2026-07-24 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 1, medium 1, low 5)
- defer: 2: (high 0, medium 0, low 2)
- reject: 11
- addressed_findings:
  - `[high]` `[patch]` Intent-queue burst overflow (flagged by ALL THREE reviewers): the fixed-window rate cap admits up to 40 accepted inputs in one 50 ms tick, so `INTENT_QUEUE_CAP = 4` could still silently swallow presses — the exact class this story closes. Fixed by `INTENT_QUEUE_CAP = INPUT_RATE_CAP` (overflow now impossible for accepted inputs) + burst regression test proven to FAIL at cap 4 (press seq 5 of 6 swallowed) and pass at the fix. Note: the intent-contract's "hard-cap the drain at 4" clause was a spec-authoring arithmetic error (average vs burst); the binding intent — amendment 9 / "never silently swallowed" — is unambiguous and wins.
  - `[medium]` `[patch]` Reconnect kept a stale client-side weapon prime (Codex): `onReconnect` now calls `resetPrime()` exactly like the sunk path; pinned by a roomBindings test.
  - `[low]` `[patch]` Shift+Tab fired the refit toggle — now preventDefault + no action; pinned.
  - `[low]` `[patch]` Zoom alive-gate passed while `you` was still null — extracted pure `canUserZoom(spectating, alive)` (missing ship = not alive); pinned.
  - `[low]` `[patch]` `Camera.setUserZoom` let NaN through the clamp permanently — non-finite factors ignored; pinned.
  - `[low]` `[patch]` Fog zoom-rebake hygiene: stale fog.ts header comment corrected; pending debounce timer now cancelled on spectate entry / return-to-port / room leave.
  - `[low]` `[patch]` `isSlotFitted` hook defaulted fail-open (bare KeyboardInput could prime the empty R slot) — now fail-closed; tests re-pinned.

## Design Notes

- Chokepoint shape: a declarative binding table (code → {handler, contexts}) evaluated in one window keydown listener owned by `KeyboardInput`; contexts = {modalOpen, textFocus, spectating, alive}. P/M fold in as callbacks; home/classSelect stay separate pre-join surfaces (already guarded).
- Server intent queue: rate cap (40 msg/s) already bounds arrivals to ~2/tick, so the drain cap of 4 is a hard backstop, not a gameplay surface; kinematics stay latest-wins so movement is unaffected.
- All design decisions here are Eric-ruled 2026-07-24 — see `epic-2-context-amendments.md` entries 1–9 (TAB toggle, lockout, no repair, zoom values, debt scope). The SPACE-hold AC text in epics.md and the DESIGN/EXPERIENCE refit-flow text are superseded on those points; doc-sync is Eric's call, not this story's.
- Heal removal does not foreclose the future heal boon (epic constraint targets the 2.8 catalog); `CONFIG.upgradePoints.healHp` goes only if nothing else consumes it.

## Auto Run Result

**Status:** done — implemented, adversarially reviewed (2 Fable hunters + Codex cross-model), 7 patches applied, gate green.

**Summary:** The fixed v1 input scheme is live: a single keyboard chokepoint binds Q/E/R (weapon switch-to with auto-revert / ability activate-immediately via EQUIPMENT_IS_WEAPON), F+Space bound-inert, TAB toggles the refit modal (digits 1–4 or click pick under full combat lockout; REPAIR deleted end-to-end, PV 11→12), ESC closes topmost, W/S/A/D unchanged, Z/X+wheel alive zoom (0.5–1.5×), M/P folded in; every bound key preventDefault-ed, canvas-only mouse fire + contextmenu suppression, text-entry guard with the sim never pausing. Both Epic-1 press-swallow debts closed: client ability-FIFO cap now emits denied feedback, and the server evaluates EVERY accepted input's fire/act intent per tick (queue bound = rate cap after the review-gate fix). Tests 1444 → 1474.

**Files changed:** shared (types/index/constants — heal + PV), server (inputs intent queue, world per-intent fire/activation + heal deletion, signals heal row, 7 test files + new intentQueue.test.ts), client (keyboard chokepoint rebuild, mouse, main wiring, upgradeMenu TAB modal, camera/config zoom, hud glyphs, roomBindings, upgradeToast, 8 test files).

**Review breakdown:** 7 patches applied (1 high — intent-queue burst overflow, flagged by all three reviewers, regression-proven; 1 medium — reconnect prime reset; 5 low), 2 deferred to the ledger (pre-existing sampler click coalescing; text-entry-guard footgun convention for 2.2/2.3 chrome), 11 rejected as noise. 0 intent gaps, 0 bad-spec loopbacks.

**Verification:** `npm run check` run independently by the orchestrator after implementation AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 261 / server 647 / client 566 all green. P1's burst regression proven to fail at the old cap. Server diff (intent queue, withInput, spendPoint) hand-reviewed.

**Residual risks / notes for Eric:** (1) M/P/zoom stay live while the refit modal is open and wheeling over the modal zooms the battlefield — consistent with the lockout ruling but yours to veto; (2) zoom persists across waiting-phase respawn (resets on spectate) — unratified nicety; (3) hold-to-zoom speed rides OS key auto-repeat; (4) fog sight-hole radius lags a fast zoom burst by the 150 ms debounce (cosmetic). Design-doc text (epics.md 2.1 AC SPACE-hold clause, DESIGN/EXPERIENCE refit flow) is now superseded by the amendments file — doc-sync is your call.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all tests green across shared/server/client
- `npm test -w server` -- expected: coalescing regression + spend heal-rejection pass
- `npm test -w client` -- expected: chokepoint/upgradeMenu/camera suites pass
