---
title: 'Home mode buttons: delete the sub-lines (they escaped the settings yield)'
type: 'bugfix'
created: '2026-08-19'
status: 'done'
baseline_revision: '4d60f3d7716b3a2bc61ef0154df08975f33fd457'
review_loop_iteration: 0
followup_review_recommended: false  # 7 patches, all localized comment/test-precision fixes; no behavior, API, security or data impact
context: []
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The two mode-button sub-lines — `N/20 QUEUED` on SOLO and the constant `STARTS INSTANTLY` on SOLO VS AI — render ON TOP of the settings overlay. `client/src/ui/home.ts` `paintModeSubline()` assigns `el.style.visibility = 'visible'` on those spans, and `visibility` is an INHERITED property whose descendant `visible` overrides an ancestor's `hidden`. The home overlay yields to settings by setting `visibility:hidden` on its ROOT (`homeYieldStyle`), and home sits at z 1100 above settings at 1050 — so those two spans are the only descendants in the whole home tree that survive the yield, and they float over the open panel.

**Approach:** Eric ruled the text out rather than the layering fixed (*"Just get rid of that text entirely… it doesn't need to be there"*). Delete both sub-lines and the whole reserved-slot machinery they needed, returning both mode buttons to the bare mono uppercase labels of epic-6 amendment 31. That removes the only escape hatch from the yield, so the defect goes by construction rather than by a second rule.

## Boundaries & Constraints

**Always:**
- Delete, never reword or hide — no dead knob survives (the standing rule that removed grey NO-DATA in cycle 69 and the storm radar return in cycle 72). Tests that pinned the deleted copy are RETIRED, not adapted.
- The bottom-left `PLAYERS ONLINE` / `LIVE GAMES` register (`livenessLines`) is UNTOUCHED and keeps rendering, including its honest zero (epic-6 amendment 39).
- The queue MODAL's own `N/20 QUEUED` (`ui/queueModal.ts`, epic-6 amendment 42) is UNTOUCHED — it is a different, ratified surface. `queuedCountLine` stays exported there.
- The yield contract (`homeYieldStyle`) keeps its ratified z register: settings 1050 < home 1100. Do not re-cut the register.
- Ship a STRUCTURAL regression pin so a future descendant cannot re-break the yield the same way.

**Block If:**
- Removing the sub-lines is found to require re-cutting the z register or changing settings' own stacking.
- Deleting them cannot be done without touching `shared/` types or the server (it must not — this is client-only, PV stays 40).

**Never:**
- Do not delete `LivenessPayload.queue` from `shared/src/types.ts`, `client/src/net/liveness.ts`, or the server's `/liveness` handler. This change orphans its last client consumer, but that is a wire/shape decision with no ruling — ledger it, do not take it unattended.
- Do not add replacement copy anywhere for the retired dead-queue steer. A ruling to remove text is not a licence to author new text (epic-6 amendment 41's process rule).
- Do not touch the consent bar (z 1250, ratified above settings) or the class bay (1200).
- No new timers, no layout re-tuning of the port column beyond what removing a line naturally does.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Home at rest | Liveness poll returns a payload with a queue block | Both mode buttons show ONLY their label (`SOLO`, `SOLO VS AI`); no `QUEUED`, no `STARTS INSTANTLY` anywhere in the home subtree | No error expected |
| Liveness unavailable | `setLiveness(null)` | Buttons unchanged (they never carried liveness copy); bottom-left register hides as before | No error expected |
| Settings opened from home | `setYielded(true)` | EVERY element in the home subtree is invisible and non-hit-testing — no descendant asserts `visibility:visible` | No error expected |
| Settings closed | `setYielded(false)` | Home returns unchanged, buttons still label-only | No error expected |
| Queue joined | Queue modal opens (z 1150) | Modal still shows its own `N/20 QUEUED` + `STARTS IN m:ss` + `CANCEL`, unchanged | No error expected |

</intent-contract>

## Code Map

- `client/src/ui/home.ts` -- owns the mode buttons, the sub-line slot machinery (`SOLO_AI_SUBLINE`, `queueButtonSubline`, `makeModeSubline`, `paintModeSubline`, `sublineOf`), `paintLiveness`, and the yield (`homeYieldStyle`, applied at the `setYielded` handler). All deletions land here.
- `client/src/__tests__/home.test.ts` -- pins the deleted copy (the `queueButtonSubline` describe block, the subline visibility/shape/text assertions). Retire those; add the button-shape and yield-escape pins.
- `client/src/ui/queueModal.ts` -- exports `queuedCountLine`, imported by home today. Home's import goes; the module is otherwise untouched.
- `client/src/net/liveness.ts` -- payload parse/localize. Untouched; its `queue` block simply loses its last client reader.
- `_bmad-output/implementation-artifacts/epic-6-context-amendments.md` -- durable home for this reversal (it supersedes epic-6 amendments 37 and 41's sub-line halves).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/ui/home.ts` -- delete `SOLO_AI_SUBLINE`, `queueButtonSubline()`, `makeModeSubline()`, `paintModeSubline()`, `sublineOf()`; drop `makeModeButton`'s `subline` parameter so the button holds only its label span; drop the sub-line argument at `makeSoloButton`; drop the sub-line paint from `paintLiveness`; drop the now-unused `queuedCountLine` import -- the ruled deletion, and it is what closes the yield escape.
- [x] `client/src/ui/home.ts` -- rewrite the module header and the surviving doc comments to record the reversal AND the root cause (inherited `visibility`; a descendant `visible` beats an ancestor `hidden`), so a future agent restoring a sub-line knows what it would re-break -- the comments currently argue at length FOR the sub-lines and would otherwise mislead.
- [x] `client/src/__tests__/home.test.ts` -- RETIRE the `queueButtonSubline` describe block and every sub-line visibility/shape/text assertion; keep and extend the negative pins (`home().textContent` contains neither `QUEUED` nor `STARTS INSTANTLY`); pin each mode button to exactly ONE child element -- the copy is gone, so its pins go with it rather than being bent onto new copy.
- [x] `client/src/__tests__/home.test.ts` -- add the STRUCTURAL yield pin: with `setYielded(true)`, no element in the home subtree carries an inline `visibility: visible`. Assert on INLINE style, not `getComputedStyle` -- jsdom has no layout engine and its inheritance of `visibility` is not a dependable oracle; the inline write is the actual defect mechanism.
- [x] `_bmad-output/implementation-artifacts/epic-6-context-amendments.md` -- append the amendment recording Eric's ruling, the root cause, what it supersedes (A37/A41 sub-line halves; A31's bare buttons restored), and the two ledgered consequences below.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- ledger (a) `LivenessPayload.queue` now has NO client consumer (`deadlineAt` already had none after A41) and its removal needs a ruling; (b) `epics.md:1197`'s D6 dead-queue steer loses its copy — the SOLO VS AI door itself and the bottom-left register are what remain of it.
- [x] `VERSION`, `package.json` -- 0.17.104 -> 0.17.105 -- cycle 105.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- one-line interstitial-cycle stamp each (date, cycle, version, PV, amendment pointer). Status trackers only — no narrative.
- [x] `CLAUDE.md` -- one concise cycle entry in Key Decisions.

**Acceptance Criteria:**
- Given the home screen is up with a live liveness payload, when the settings overlay is opened, then no home text is visible over it — specifically neither `QUEUED` nor `STARTS INSTANTLY`.
- Given the home screen is up in any liveness state, when the mode buttons are inspected, then each contains exactly one child element and its text is exactly its mode label.
- Given a player joins the standard queue, when the queue modal opens, then its `N/20 QUEUED` line is unchanged.
- Given `npm run check` is run, then lint, all three type-checks and the whole suite pass, with no reference to the deleted symbols remaining anywhere.
- Given the change is built, then `shared/` and `server/` are untouched and `PROTOCOL_VERSION` is still 40.

## Spec Change Log

## Review Triage Log

### 2026-08-19 — Review pass

- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 3, low 4)
- defer: 4: (high 0, medium 2, low 2)
- reject: 5: (high 0, medium 0, low 5)
- addressed_findings:
  - `[medium]` `[patch]` `queueModal.ts` `paintSlot()`'s docstring cited the deleted `paintModeSubline` in the PRESENT tense (*"the same rule the mode buttons' sub-line obeys"*) — documentation pointing at the exact mechanism this cycle declares a bug, in the one place a future agent looks for precedent. Rewritten into an explicit DO-NOT-CITE-AS-PRECEDENT warning naming the inherited-`visibility` defect, why this call site is structurally safe (a `document.body` sibling, never a home descendant), and which incidental guards would have to be revisited.
  - `[medium]` `[patch]` The new yield-escape pin guarded only HALF the mechanism. `homeYieldStyle` writes TWO inherited properties, and a descendant asserting `pointer-events:auto` would defeat the "PLAY and the class chip are unreachable while yielded" guarantee exactly as `visibility:visible` defeated the paint half. `inlineVisibilityWrites()` → `yieldEscapes()`, now scanning both vectors.
  - `[medium]` `[patch]` Four comments still described the deleted surface as live: `liveness.ts:15` (*"no button sub-line"*), `liveness.ts:26-28` (*"`deadlineAt` has no consumer"* — now materially wrong, it is the WHOLE `queue` block), `queueModal.ts:11` (*"the same derivation the SOLO button's sub-line takes"*), `home.test.ts:1041` (*"the sub-line is a bare count now"*). All corrected; the AC required no stale reference to the deleted surface anywhere.
  - `[low]` `[patch]` The pin was also OVER-broad in the other direction — it banned `visibility:hidden` on any descendant, which cannot escape a hidden root and is a legitimate reserved-slot pattern. Narrowed to the ASSERTING values only.
  - `[low]` `[patch]` Added a non-vacuity assertion to the pin (`querySelectorAll('*').length > 10`) so it cannot pass against an empty or unmounted tree, and a scope note stating honestly that it walks the home SUBTREE and cannot speak for the three sibling surfaces.
  - `[low]` `[patch]` The rewritten *"THE BOX HUGS ITS CONTENT"* comment had gone INERT — with the sub-line deleted the label measures ~57px against a 64px `min-height`, so hugging never engages and both buttons are fixed 64px boxes. Left standing it was the same vacuity this diff criticises two blocks below. Corrected to say what is true today and why the rule is kept anyway.
  - `[low]` `[patch]` Bare *"amendment 47"* was re-stamped into that rewritten paragraph, and in an epic-6-citing file it reads as epic-6's amendment 47 (the departure scuttle) rather than **epic-2**'s container-fit law. Disambiguated at the site this cycle rewrote.

Deferred (4): the `parseLiveness` all-or-nothing guard now failing closed on a field nothing reads (raised by BOTH agents; resolving it is the same ruling as the `queue` block's fate); `queueModal.ts` `paintSlot` carrying the same inherited-`visibility` mechanism, latent and protected only by unasserted incidentals (raised by BOTH agents); `showHome()` mounting unyielded even when settings is already open; and ESLint ignoring `**/__tests__/**` project-wide, which makes every cycle's "lint clean" claim narrower than it sounds.

Rejected (5): the replacement pins being "largely tautologies" (inherent — nothing writes to the buttons any more, and the adversarial agent separately confirmed the yield pin itself is NOT vacuous); the shape record losing a now-meaningless property; the F3 block being a pure duplicate (its fake-timer assertion is unique and guards the no-timer ruling — verified directly, the claim was overstated); `queuedCountLine`'s `pooled` parameter name; and `localizeDeadline` as dead code (already covered by the `LivenessPayload.queue` ledger entry).

## Design Notes

**Why deleting the text IS the fix, not a dodge.** The layering has two candidate repairs: re-cut the z register (forbidden — the 1050/1100 ordering is ratified and `homeYieldStyle`'s docstring explains why the home yields instead), or stop writing `visibility:visible` on the spans. The second is what deletion accomplishes, and it removes the mechanism rather than the symptom. After this change the home subtree contains zero inline `visibility` writers, so the root's `hidden` governs every pixel of it.

**Why the sub-lines existed, and why the reason does not survive.** Epic-6 A37 restored sub-lines one day after A31 deleted them, on the reasoning that a live queue count is information *available nowhere else on the page*. That reasoning was sound at the time and is now moot: A42 moved the pooled wait into its own modal (which carries the count), and A43 put the population register bottom-left. The count a player actually needs is on both of those surfaces. Eric's ruling closes the loop.

**The slot machinery goes with the copy.** `paintModeSubline`'s reserved-slot design (a non-breaking space plus `visibility` toggling, so an async payload could never reflow the deploy stack mid-click) existed ONLY to carry an asynchronously-arriving line. With nothing async on the button there is no slot to reserve, so keeping it would leave exactly the dead knob the project rule forbids — and it is the defect.

**Layout moves in the safe direction.** `makeModeButton` sets `min-height:64px` with `padding:8px 0`; A31 measured a bare-label button at 64px and a sub-lined one taller. Removing a line therefore SHRINKS the port column, increasing the headroom `containerFit.test.ts` guards. No re-tuning is needed or wanted.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, all three workspaces type-check, full suite green (5127+ baseline, minus the retired sub-line tests, plus the new pins).
- `grep -rn "STARTS INSTANTLY|queueButtonSubline|paintModeSubline|makeModeSubline|SOLO_AI_SUBLINE" client/ --include='*.ts'` -- expected: no matches outside retirement comments.
- `git status --porcelain shared server` -- expected: empty (client-only change).

**Manual checks (browser — Eric asked for this explicitly):**
- Home screen: both mode buttons show ONLY `SOLO` and `SOLO VS AI`; no second line on either.
- Open settings from the gear: the entire home surface disappears behind it — no stray text anywhere over the panel. Close settings: home returns intact.
- Press SOLO: the queue modal still shows `N/20 QUEUED` and `CANCEL`.

## Auto Run Result

Status: done

**Change.** Deleted the two home mode-button sub-lines — `N/20 QUEUED` (SOLO) and the constant `STARTS INSTANTLY` (SOLO VS AI) — and the whole reserved-slot machinery behind them, per Eric's 2026-08-19 ruling. That is also the BUGFIX: `paintModeSubline()` wrote an inline `visibility:'visible'` on those spans, and because `visibility` is INHERITED, a descendant asserting `visible` overrides an ancestor's `hidden` — so when the home yielded to the settings overlay (`visibility:hidden` on its root, home z 1100 over settings z 1050) those two spans were the ONLY descendants in the tree that survived, and they floated over the open panel. Removing the copy removes the only writer, so the defect goes by construction. Cycle 105, 0.17.105. Client-only; `PROTOCOL_VERSION` unchanged at 40; `shared/` and `server/` untouched.

**Files changed.**
- `client/src/ui/home.ts` — deleted `SOLO_AI_SUBLINE`, `queueButtonSubline()`, `makeModeSubline()`, `paintModeSubline()`, `sublineOf()` and `makeModeButton`'s `subline` param; `paintLiveness()` now paints only the bottom-left register; header + docs rewritten to record the ruling and the inherited-`visibility` root cause.
- `client/src/__tests__/home.test.ts` — retired the `queueButtonSubline` block, the F9 reserve-the-slot block and the two `STARTS INSTANTLY` pins; re-took the bare-button shape pin (one child, exact label); added the structural yield-escape pin covering BOTH inherited yield properties.
- `client/src/ui/queueModal.ts` — comments only: stale cross-references corrected, plus a do-not-cite-as-precedent warning on `paintSlot`.
- `client/src/net/liveness.ts` — comments only: corrected two now-false statements and recorded the ledgered guard consequence.
- `epic-6-context-amendments.md` (Amendment 50), `deferred-work.md` (6 entries), `sprint-status.yaml`, `gds-workflow-status.yaml`, `VERSION`, `package.json`, `package-lock.json`, `CLAUDE.md`.

**Review.** Two adversarial agents in parallel. 7 patches applied, 4 deferred, 5 rejected, 0 intent_gap, 0 bad_spec, 0 loopbacks. Both agents independently confirmed the root-cause claim (exactly two `visibility` writes exist in the whole client; the second is on a `document.body` sibling), no dangling code references, no layout regression, and no assertions weakened by stealth.

**Verification.**
- `npm run check` exit 0 — lint 0 errors (3 pre-existing warnings), all three workspaces type-check, 5200 tests (shared 746, server 1505, client 2949).
- The yield-escape pin was FAIL-PROVEN twice: against pre-fix `home.ts` it fails (exit 1), against the fix it passes.
- **Browser, against a LIVE liveness payload** (`queue:{pooled:0,cap:20}` — the null path would have proved nothing, since the defect only appeared once a payload arrived). Pre-fix build: `0/20 QUEUED` rendered over the MONO AUDIO row and `STARTS INSTANTLY` over PRIVACY, reproducing the report exactly. Fixed build: panel clean, home root `visibility:hidden` / `pointerEvents:none` with ZERO descendant visibility writes. Queue modal still reads `1/20 QUEUED · CANCEL`.

**Residual risks.** All four are ledgered in `deferred-work.md`, none reachable today: `parseLiveness` still fails the whole payload closed on the `queue` block nothing reads (needs the same Eric ruling as the block's fate); `queueModal.ts`'s `paintSlot` still carries the same inherited-`visibility` mechanism, safe only because the modal is a body sibling and protected by two unasserted incidentals; `showHome()` mounts unyielded regardless of settings state; and ESLint ignores `**/__tests__/**`, so the lint leg covered none of the ~2/3 of this diff that is test code.
