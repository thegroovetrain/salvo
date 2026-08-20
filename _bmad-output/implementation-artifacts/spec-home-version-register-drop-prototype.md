---
title: 'Home version register drops the RT PROTOTYPE prefix'
type: 'chore'
created: '2026-08-20'
baseline_revision: '7157dc42f959bb05b496d9f22e4954eb19156656'
final_revision: '5dac3cea30ef9f8a0d10a4272732f2c6a40bc9bc'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** The home screen's version register under the wordmark reads `RT PROTOTYPE // v0.17.117`. Eric ruled the `RT PROTOTYPE // ` prefix out — the line should carry the version and nothing else.

**Approach:** Drop the prefix from the one string that builds it (`makeWordmark` in `client/src/ui/home.ts`), leaving `v${version}`. Retire the test pin that asserts the prefix and replace it with a negative pin so the copy cannot drift back.

## Boundaries & Constraints

**Always:** The wordmark stays exactly three children in order `[mark, tagline, ver]`. The `ver` element keeps its existing styling byte-for-byte (`registerCss('hudMicro')`, `color:var(--hc-phosphor)`, `letter-spacing:0.2em`) — this is a COPY change, not a styling change. The version value still comes from the `version` argument `showHome()` already receives, so the `v` prefix and the build-time single-sourcing are unchanged.

**Block If:** Nothing here requires a decision. The intent names one string and one outcome.

**Never:** Do not touch the tagline, the wordmark mark, the mode row, or any other home element. Do not rename or restyle the `ver` element, remove it, or move it. Do not edit the historical UX mockup (`mockups/home-class-picker-1.html`) or the `.working/extract-current-ui.md` extract — those are dated artifacts recording what the UI looked like at the time, not a live contract. Do not bump `PROTOCOL_VERSION` (client-only text, zero wire).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal build | `showHome('0.17.117', …)` | `ver.textContent === 'v0.17.117'` | No error expected |
| Test build | `showHome('0.0.0-test', …)` | `ver.textContent === 'v0.0.0-test'` | No error expected |
| Prefix retired | any version | `home().textContent` contains no `RT PROTOTYPE` and no `//` from this line | No error expected |

</intent-contract>

## Code Map

- `client/src/ui/home.ts:427` -- `makeWordmark()` builds the `ver` div; the ONLY site that composes this string.
- `client/src/__tests__/home.test.ts:789` -- the `wordmark is still exactly [mark, tagline, ver], style untouched` pin asserts `ver.textContent` contains `RT PROTOTYPE`; it fails on the change and must be re-aimed.
- `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` / `EXPERIENCE.md` -- checked: NEITHER carries a row for the version register, so no ratified design contract governs this copy and no design-doc edit is authorized.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/ui/home.ts` -- change `ver.textContent` from `` `RT PROTOTYPE // v${version}` `` to `` `v${version}` `` -- the single-line copy removal Eric ruled.
- [x] `client/src/__tests__/home.test.ts` -- replace the `expect(ver.textContent).toContain('RT PROTOTYPE')` pin with `expect(ver.textContent).toBe('v0.0.0-test')` plus a negative `expect(home().textContent).not.toContain('RT PROTOTYPE')` -- pins the new copy exactly and stops the retired prefix drifting back, matching the retirement-pin style already used for `LAST HULL FLOATING WINS` two tests above.

**Acceptance Criteria:**
- Given the home screen is shown with version `0.0.0-test`, when the wordmark renders, then its third child's text is exactly `v0.0.0-test`.
- Given the home screen is shown, when its full text content is read, then it contains no occurrence of `RT PROTOTYPE`.
- Given the home screen is shown, when the wordmark's children are counted, then there are still exactly three (`mark`, `tagline`, `ver`) and the `ver` element's inline style is unchanged.

## Verification

**Commands:**
- `npm install && npm run build -w shared` -- PREREQUISITE in a fresh worktree. `shared/dist/` is gitignored, and both the server and client type-checks resolve `@salvo/shared` to it; without the build, `npm run check` reports dozens of errors about `broadside` / `radarBuoy` / `turretMuzzles` that are stale-artifact noise, not defects.
- `npm test -w client -- home` -- expected: the home suite passes, including the dedicated retirement test.
- `npm run check` -- expected: lint + type-check + full test suite green (3 pre-existing `max-lines-per-function` warnings in `main.ts` / `classSelect.ts` are untouched by this change).

## Review Triage Log

### 2026-08-20 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 1: (high 0, medium 1, low 0)
- reject: 11: (high 0, medium 3, low 8)
- addressed_findings:
  - `[medium]` `[patch]` The retirement pin was bolted inside `wordmark is still exactly [mark, tagline, ver], style untouched`, a test whose describe header documents only the cycle-87 tagline ruling — a future re-scope of that test would silently drop this ruling's only guard. Split into its own `version register is the bare version — the RT PROTOTYPE prefix is retired` test with a dated comment naming the ruling, matching the file's own `LAST HULL FLOATING WINS` pattern two tests above.
  - `[medium]` `[patch]` The retirement assertion was case- and whitespace-exact (`not.toContain('RT PROTOTYPE')`), so a `Rt Prototype` or `RT  PROTOTYPE` variant would pass it. Now `not.toMatch(/rt\s*prototype/i)`.
  - `[low]` `[patch]` Dropped the now-unused `ver` binding from the structure test after the split, which would otherwise trip lint.
  - `[low]` `[patch]` The spec's Verification section claimed `npm run check` green with no note that a fresh worktree needs `npm install && npm run build -w shared` first — without it the run reports dozens of stale-`shared/dist` errors naming `broadside`/`radarBuoy`/`turretMuzzles` that are artifact noise, not defects. Prerequisite now recorded.

Rejected (summary): the `'dev'`/empty-string/leading-`v` version-input cases (root `package.json` supplies a plain semver and the `v${version}` template predates this change); an `aria-label` on the register (scope beyond the ruling, and the visible text already reads correctly); a separate `not.toContain('//')` assertion (the exact `toBe` pin on `ver.textContent` is strictly stronger for that line); container-fit/visual-regression risk (the string got SHORTER, and removing text cannot overflow a centered flex child); and editing the dated UX mockup or `.working` extract (forbidden by this spec's Never clause).

## Auto Run Result

Status: done

**Implemented change.** The home wordmark's version register drops the `RT PROTOTYPE // ` prefix and now reads `v{version}` alone, per Eric's ruling. One production line; styling, the three-child wordmark structure, and the `__APP_VERSION__` → root `package.json` version plumbing are all byte-identical.

**Files changed.**
- `client/src/ui/home.ts` — `makeWordmark()`'s `ver.textContent` is now `` `v${version}` ``.
- `client/src/__tests__/home.test.ts` — retirement pin split into its own dated test asserting the exact rendered string and negatively matching `/rt\s*prototype/i`; unused `ver` binding dropped from the structure test.
- `VERSION`, `package.json`, `package-lock.json` — 0.17.117 → 0.17.118 (cycle 118).
- `_bmad-output/implementation-artifacts/epic-7-context-amendments.md` — amendment 30 records the ruling, what deliberately did not move, and the fresh-worktree `shared/dist` trap.
- `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/sprint-status.yaml` — cycle-118 stamps in both.
- `_bmad-output/implementation-artifacts/deferred-work.md` — one entry routing the surviving prototype-era copy (README, dated mockup) to Story 7-6.

**Review findings.** 4 patches applied, 1 deferred, 11 rejected; no intent gaps and no spec repair loopback. See the Review Triage Log above.

**Verification.** `npm run check` — lint 0 errors (3 pre-existing `max-lines-per-function` warnings in untouched files), all three type-checks clean, full suite green. The first check run failed against a missing `shared/dist` in this fresh worktree; `npm install && npm run build -w shared` resolved it and the lockfile was NOT rewritten by the install, confirming the earlier "package.json vs package-lock drift" report was mistaken — `@colyseus/sdk` is present in the lockfile at `client/node_modules/@colyseus/sdk`.

**Residual risks.** Only jsdom-level verification of the register: the suite proves text content, not layout. The risk is minimal in kind because the string SHRANK (~26 chars → ~10) in a centered flex column, which cannot overflow a container — but no browser check was performed, and the project rule is that the dev server is Eric's to start.
