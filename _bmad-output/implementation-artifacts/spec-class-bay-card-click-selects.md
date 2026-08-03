---
title: 'Class bay: card click selects without closing'
type: 'feature'
created: '2026-08-03'
status: 'done'
review_loop_iteration: 0
baseline_revision: '6f22818ae61f3219dd845c85772b61f2e54b73bd'
final_revision: 'b69fca6'
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** In the class-select bay, clicking a ship card picks the class AND closes the layer, so changing ship and color in one visit is impossible — you open the bay twice. Eric ruling 2026-08-03 (invocation + AskUserQuestion, this run): a card click only SELECTS (highlights); the bay closes only via ESC, the backdrop dismiss, or CONFIRM SELECTION (Enter ≡ CONFIRM).

**Approach:** Rewire the card click (and its in-card SELECT button, same element) to the highlight path the digit keys already use — set `highlight`, repaint, stay open. Retire the `pick()`/`onPick` exit entirely; CONFIRM/Enter remains the sole class commit, ESC/backdrop remains close-without-class-change.

## Boundaries & Constraints

**Always:**
- Eric rulings (2026-08-03, this run): (1) backdrop (dimmer) click KEEPS dismissing — ESC-equivalent; (2) Enter stays ≡ CONFIRM SELECTION; (3) ESC/backdrop discard a clicked-but-unconfirmed class — CONFIRM is the only class commit; color swatch picks keep persisting instantly (prior ratified ESC semantics unchanged).
- The bay never deploys; PLAY stays the single launch path (home-page-maintenance ruling).
- A clicked card shows the existing highlight treatment (accent border, `SELECTED ✓` pick button) — no new visual grammar.
- Client-only; no wire contract, no `PROTOCOL_VERSION` change.
- Versioning ruling: bump `VERSION` + root package.json 0.17.38 → 0.17.39 (this is a landed dev-auto cycle).

**Block If:**
- The change turns out to require altering color-hoist persistence timing (staged colors) — Eric explicitly declined that option.
- Any need to edit DESIGN.md/EXPERIENCE.md in-story — doc-sync is deferred-work only (minimal design-doc-edits ruling).

**Never:**
- No modal-wide redesign, no new buttons/copy, no changes to home chip, callsign, settings, or in-match surfaces.
- Don't touch keyAction's digit/arrow/Enter/ESC mapping — it is already correct.
- Don't edit `EXPERIENCE.md`/`DESIGN.md` (their "pick returns to home" contract — EXPERIENCE.md:66/115/124 — is superseded by this ruling; record as doc-sync debt in deferred-work.md).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Card click | Bay open, click any class card | Card becomes the highlight (accent chrome, `SELECTED ✓`); bay stays open; no callback fires | No error expected |
| Confirm after click | Card B clicked, then CONFIRM or Enter | `onConfirm(B)` fires once; class persists; bay closes | No error expected |
| ESC after click | Card B clicked (was A), then ESC | `onClose()` fires; class stays A; bay closes | No error expected |
| Backdrop after click | Card B clicked, then dimmer click | Same as ESC: `onClose()`, class stays A | No error expected |
| One-visit flow | Click card + click swatch + CONFIRM | Class persists via confirm; color already persisted at swatch click; single open | No error expected |
| Re-click highlighted card | Click the already-highlighted card | No-op (stays highlighted, stays open) | No error expected |

</intent-contract>

## Code Map

- `client/src/ui/classSelect.ts` — the bay layer. `buildCard` wires `root` click → `onPick` (line ~412); `openClassSelect` has local `pick()` (close + `opts.onPick`), `confirmPick()`, `dismiss()`; `ClassSelectOpts.onPick` to retire; header/doc comments describe click-picks-and-closes.
- `client/src/ui/home.ts` — sole `openClassSelect` call site (~481); `onPick` and `onConfirm` bodies are identical today — delete `onPick`.
- `client/src/__tests__/classSelect.test.ts` — `:313 'a card click picks that class'` must be rewritten; `:332` dimmer-dismiss and `:342` ESC tests must stay green unchanged.
- `client/src/__tests__/containerFit.test.ts` — `:88` passes a no-op `onPick`; update for the removed field.
- `client/src/__tests__/home.test.ts` — layer tests use digits+Enter, expected untouched.
- `VERSION`, `package.json` — 0.17.40 (renumbered at landing: PR #87 took cycle 39 / 0.17.39 in parallel).
- `_bmad-output/implementation-artifacts/deferred-work.md` — doc-sync entry for the superseded EXPERIENCE.md pick-returns-home lines.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/ui/classSelect.ts` — card click (whole card incl. SELECT button) sets `highlight` to that card's index + `repaint()`, never closes; delete local `pick()` and `ClassSelectOpts.onPick`; keep dimmer `dismiss` wiring; update the header comment + `ClassSelectOpts` doc comments to the new grammar — the ruling's core.
- [x] `client/src/ui/home.ts` — drop the `onPick` callback from `openLayer` (confirm path already persists via `setClass`); update the openLayer/showHome comments.
- [x] `client/src/__tests__/classSelect.test.ts` — rewrite the card-click test: click highlights (SELECTED ✓ on the clicked card), layer stays mounted, no `onPick`/`onConfirm`/`onClose` call; add click→CONFIRM hands back the clicked class, and click→ESC fires `onClose` only; assert the one-visit flow (card click + swatch click + confirm in a single open); keep dimmer/ESC/Finding-A/teardown tests green.
- [x] `client/src/__tests__/containerFit.test.ts` — remove the now-dead `onPick` option from the bay fixture.
- [x] `VERSION` + `package.json` — 0.17.38 → 0.17.40 (the contract's 0.17.39 target was renumbered at landing; PR #87 landed cycle 39 in parallel).
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append doc-sync entry: EXPERIENCE.md:66/115/124 "pick returns to home" superseded by Eric ruling 2026-08-03 (card click selects, confirm/ESC close).

**Acceptance Criteria:**
- Given the bay is open, when any class card is clicked, then it takes the highlight treatment and the bay remains open with no callback fired.
- Given a clicked card, when CONFIRM SELECTION or Enter fires, then exactly that class is handed to `onConfirm` and the bay closes; PLAY remains the only deploy path.
- Given a clicked card, when ESC or a backdrop click fires, then `onClose` fires and the previously-saved class is unchanged.
- Given one bay visit, when the player clicks a card, a color swatch, and CONFIRM, then both ship and color are changed without reopening the bay.
- Given the full client suite, when `npm run check` runs, then lint, type-checks, and all tests pass.

## Spec Change Log

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 9: (high 0, medium 1, low 8)
- defer: 0
- reject: 4
- addressed_findings:
  - `[medium]` `[patch]` `gds-workflow-status.yaml` not advanced (the every-landed-cycle rule) — chained the cycle-39 narrative into `last_updated`
  - `[low]` `[patch]` deferred-work doc-sync entry over-cited EXPERIENCE.md lines (115/124 already describe the NEW behavior) — narrowed to line 66 with an explicit do-not-"fix" note
  - `[low]` `[patch]` `select()` assigned unguarded `indexOf` (-1 possible in principle; both hunters) — now `Math.max(0, …)`, parity with the `initial` path
  - `[low]` `[patch]` openClassSelect doc comment sat above `makeLayerShell` and claimed "only two exits" (handle.close() is a third, callback-free path) — moved and corrected
  - `[low]` `[patch]` `isSwallowedKey` comment still said "pick/confirm" — reworded to the confirm-era vocabulary (LayerAction `kind: 'pick'` deliberately NOT renamed)
  - `[low]` `[patch]` I/O-matrix "re-click highlighted card" row had no test — added no-op re-click test
  - `[low]` `[patch]` Enter-after-mouse-click path untested (existing Enter test used digits) — added click→Enter confirm test
  - `[low]` `[patch]` in-card SELECT button bubbling assumption untested — added direct `.hc-pickbtn` click test
  - `[low]` `[patch]` one-visit test could pass vacuously when the random color seed rolled the asserted hue — pinned `COLOR_PREF_KEY` to 0 first

Rejected (noise): route-digits-through-select parity refactor (no defect); LayerAction `pick` rename (cosmetic churn against the spec's Never); spec-frontmatter "bookkeeping incomplete" (workflow in-flight state, by design); "SELECTED ✓ now labels staged state" (Eric ruled no new visual grammar — carried as a residual note below). Codex cross-check: zero findings, verdict build-on-it; the select()-guard finding was corroborated by both Fable hunters.

## Verification

**Commands:**
- `npm run check` — expected: lint clean (complexity ≤ 10), all three workspaces type-check, full test suite green (client suite grows by the new bay tests).
- `npm test -w client` — expected: classSelect/home/containerFit suites green.

## Auto Run Result

**Summary:** The class bay no longer closes on a ship-card click. A card click (or its in-card SELECT button, via bubbling) only moves the highlight; the bay closes solely via CONFIRM SELECTION/Enter (the one class commit), ESC, or the backdrop dismiss — so ship and color change in a single visit. Eric rulings taken pre-implementation via AskUserQuestion: backdrop keeps dismissing; Enter stays ≡ CONFIRM; ESC discards the unconfirmed class while color swatch picks keep persisting instantly. Client-only, no wire change (PV stays 19). Cycle 40 → 0.17.40 (authored as cycle 39; PR #87's TTK/pip rebalance took 39 in parallel, so this renumbered at landing — the intent-contract's 0.17.39 line is superseded by that renumber).

**Files changed:**
- `client/src/ui/classSelect.ts` — `pick()`/`ClassSelectOpts.onPick` retired; new `select()` highlight path (index-guarded); doc comments corrected and relocated.
- `client/src/ui/home.ts` — `onPick` dropped from the sole `openClassSelect` call site; comments updated.
- `client/src/__tests__/classSelect.test.ts` — card-click test rewritten to the new grammar + 6 new pins (click→CONFIRM, click→ESC discard, one-visit ship+color flow [determinism-pinned], re-click no-op, click→Enter, SELECT-button bubbling).
- `client/src/__tests__/containerFit.test.ts` — dead `onPick` fixture option removed.
- `VERSION` + `package.json` (+ lockfile version fields) — 0.17.38 → 0.17.40.
- `_bmad-output/implementation-artifacts/deferred-work.md` — EXPERIENCE.md:66 doc-sync debt entry.
- `_bmad-output/gds-workflow-status.yaml` — cycle-39 narrative chained into `last_updated`.

**Review findings:** 2 Fable hunters + Codex cross-check. 9 patches applied (1 medium — the workflow-status ledger; 8 low), 0 deferred, 4 rejected, 0 intent gaps, 0 bad-spec. Codex: zero findings, verdict build-on-it (traced and cleared the focus/Enter-swallow and openedAt-guard suspicions).

**Verification:** `npm run check` run independently by the orchestrator after each wave — final: lint 0 errors (2 pre-existing max-lines warnings), all three workspaces type-check, 2620 tests green (shared 399 / server 834 / client 1387; was 2614 at baseline). Re-run after merging main (PR #87, the parallel TTK/pip rebalance cycle): 2624 green (400/834/1390) — the two cycles coexist, only the classSelect test-file import line and the two ledger files conflicted.

**Residual risks:** (1) "SELECTED ✓" chrome now labels a STAGED (unconfirmed) class rather than a saved one — Eric ruled no new visual grammar, but the treatment's meaning shifted; if playtests show players ESC-ing away picks they believed saved, a staged-vs-committed visual distinction is the follow-up. (2) The worktree needed a fresh `npm install`; `package-lock.json` carries only its two version-field bumps, no dependency changes.
