---
title: 'Class bay: card click selects without closing'
type: 'feature'
created: '2026-08-03'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '6f22818ae61f3219dd845c85772b61f2e54b73bd'
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
- `VERSION`, `package.json` — 0.17.39.
- `_bmad-output/implementation-artifacts/deferred-work.md` — doc-sync entry for the superseded EXPERIENCE.md pick-returns-home lines.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/ui/classSelect.ts` — card click (whole card incl. SELECT button) sets `highlight` to that card's index + `repaint()`, never closes; delete local `pick()` and `ClassSelectOpts.onPick`; keep dimmer `dismiss` wiring; update the header comment + `ClassSelectOpts` doc comments to the new grammar — the ruling's core.
- [x] `client/src/ui/home.ts` — drop the `onPick` callback from `openLayer` (confirm path already persists via `setClass`); update the openLayer/showHome comments.
- [x] `client/src/__tests__/classSelect.test.ts` — rewrite the card-click test: click highlights (SELECTED ✓ on the clicked card), layer stays mounted, no `onPick`/`onConfirm`/`onClose` call; add click→CONFIRM hands back the clicked class, and click→ESC fires `onClose` only; assert the one-visit flow (card click + swatch click + confirm in a single open); keep dimmer/ESC/Finding-A/teardown tests green.
- [x] `client/src/__tests__/containerFit.test.ts` — remove the now-dead `onPick` option from the bay fixture.
- [x] `VERSION` + `package.json` — 0.17.38 → 0.17.39.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — append doc-sync entry: EXPERIENCE.md:66/115/124 "pick returns to home" superseded by Eric ruling 2026-08-03 (card click selects, confirm/ESC close).

**Acceptance Criteria:**
- Given the bay is open, when any class card is clicked, then it takes the highlight treatment and the bay remains open with no callback fired.
- Given a clicked card, when CONFIRM SELECTION or Enter fires, then exactly that class is handed to `onConfirm` and the bay closes; PLAY remains the only deploy path.
- Given a clicked card, when ESC or a backdrop click fires, then `onClose` fires and the previously-saved class is unchanged.
- Given one bay visit, when the player clicks a card, a color swatch, and CONFIRM, then both ship and color are changed without reopening the bay.
- Given the full client suite, when `npm run check` runs, then lint, type-checks, and all tests pass.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run check` — expected: lint clean (complexity ≤ 10), all three workspaces type-check, full test suite green (client suite grows by the new bay tests).
- `npm test -w client` — expected: classSelect/home/containerFit suites green.
