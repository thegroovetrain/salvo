---
title: 'Home Page Maintenance Patch — hoist to bay, random color identity, slim chip, confirm-not-deploy'
type: 'chore'
created: '2026-08-01'
status: 'done'
baseline_revision: 'a41d619a09a5a68994d59dd0176ea2467ed3816b'
final_revision: '229ec75'
review_loop_iteration: 0
followup_review_recommended: false
context: ['{project-root}/_bmad-output/project-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The home page carries visual clutter Eric has ruled off it: a duplicate color picker, an oversized Ship Selector chip with a redundant loadout line, a claim-caveat caption in the SELECT CLASS modal, and a modal SET SAIL button that launches a match when the modal's only job is choosing a ship. Unset color preference also falls back to amber, so new players see a non-identity accent.

**Approach:** Client-only chrome patch (5 Eric-ruled changes, this run's AskUserQuestion rulings included): color picker lives ONLY in the SELECT CLASS modal; absent/invalid `hullcracker.color` gets a random Regatta hue that is PERSISTED immediately and tints the interface (Eric: broader home tinting); the chip loses its loadout line and slims; the modal caption dies and "COLOR PREFERENCE:" sits left of the swatches; SET SAIL becomes CONFIRM SELECTION (same amber chrome — Eric ruling) which saves and returns home without deploying.

## Boundaries & Constraints

**Always:**
- Client-only. No `shared/` or `server/` changes, no wire/`PROTOCOL_VERSION` change. `colorPref` keeps flowing via join options exactly as today; server FCFS assignment (`regatta.ts`) untouched.
- Random pick = uniform index over `REGATTA_HUES.length` (client chrome, `Math.random` legal here — not sim code), written to `hullcracker.color` via the existing `saveColorPref` path before first paint, so home/modal/join all agree.
- Tinting uses the existing imperative channel (`cssHex`/`cssRgba` inline styles from `PLAYER_HUES`/`PLAYER_FILLS`); personal color as TEXT goes through `textSafe()` (≥4.5:1 vs void). Do not invent a global `--player-color` var (EXPERIENCE.md Open Question #10 stays open).
- Amber stays the action register: PLAY button and CONFIRM SELECTION keep amber outline+glow chrome; phosphor HUD/status text unchanged. Amber as in-match roster-miss render fallback untouched.
- Amendments bind: type ≥14px floor (a15), no grey load-bearing text (a17), container-fit law (a47) — the slimmed chip and the new label row must not overflow their boxes at the 1366×768 floor.
- All colors/type from `CLIENT_CONFIG` tokens (tokens guard test); ESC still closes the modal without a class change; Enter in the modal ≡ CONFIRM SELECTION (pick semantics per EXPERIENCE.md:124).
- Superseded design-doc pins (DESIGN.md:157/240–243, EXPERIENCE.md:35/36/66; spec-1-14 SET SAIL + amber-unset pins; deferred-work:153 chip sub-line carve-out) are recorded as deferred-work doc-sync entries — design docs are NOT edited in-story.

**Block If:** Any task turns out to require a server or wire change; or a design decision surfaces beyond this run's three recorded rulings (persist random / broader tint / amber confirm chrome).

**Never:** No mode selector resurrection (`· SOLO` stays hardcoded), no GUN row on class cards, no changes to connect/startGame flow for PLAY, no design-doc edits, no reroll of a valid stored preference.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First visit | `hullcracker.color` absent | Random idx 0–19 persisted before first paint; home chrome tinted that hue; no amber accents | No error expected |
| Returning player | Valid stored idx | Stored hue used verbatim, never rerolled | No error expected |
| Corrupt pref | Key holds garbage/out-of-range | Treated as absent → reroll + persist (via existing `loadColorPref` validation) | Silent recovery |
| Modal color pick | Player clicks swatch | Pref overwritten, live tint update (modal + home chip on return) | No error expected |
| CONFIRM SELECTION | Highlighted class, click or Enter | Class persisted, modal closes to home; NO connection/`startGame` call | No error expected |
| ESC in modal | Any highlight state | Closes, class unchanged (color picks already applied — existing semantics) | No error expected |

</intent-contract>

## Code Map

- `client/src/net/connection.ts` — `COLOR_PREF_KEY`/`loadColorPref` (:23,:31), join opts `colorPref` (:144–150). New `ensureColorPref()` home.
- `client/src/ui/classSelect.ts` (721 LOC) — `ColorHoist` (:173 ctor null→amber, `accentNum` :142), `saveColorPref` :154, `HOIST_CAPTION` :65, `makeHoistRow` :245, `chipLoadoutLine` :105, `buildSetSail` :544, `setSail` closure :682, `buildFooter` :556.
- `client/src/ui/home.ts` (594 LOC) — `mountHome` hoist mount :468, `makeChip` :264 (loadout line via `repaintChip` :401, padding :266), callsign row, `openLayer` onSetSail wiring :448 (calls `deploy(h)` — the launch path to cut).
- `client/src/util/color.ts` — `cssHex`/`cssRgba`/`textSafe`.
- `client/src/__tests__/classSelect.test.ts` — SET SAIL pins :190,:203–218,:253; ColorHoist null/amber round-trip :109–141.
- `client/src/__tests__/connection.test.ts`, `home.test.ts`, `homePersistence.test.ts` — pref validation / home DOM pins.
- `_bmad-output/implementation-artifacts/deferred-work.md` — doc-sync ledger.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/net/connection.ts` — add exported `ensureColorPref(): number` (valid stored idx, else uniform random idx persisted via localStorage write) — single owner of the no-pref case
- [x] `client/src/ui/classSelect.ts` — `ColorHoist` seeds from `ensureColorPref()` (index never null; amber-unset branch removed); delete `HOIST_CAPTION` + caption node; `makeHoistRow` footer variant gains left-side `COLOR PREFERENCE:` mono label (≥14px, non-grey token); delete `chipLoadoutLine`; `buildSetSail` → confirm button, label `CONFIRM SELECTION`, same amber chrome; modal close returns home without deploy
- [x] `client/src/ui/home.ts` — remove home hoist mount (hoist object stays shared state so chip repaints on modal picks); chip: drop loadout line + slim padding/intrinsic width (container-fit at floor viewport); tint callsign field border/focus + chip border/glow/name (textSafe for text) in personal color; `openLayer` confirm wiring stops calling `deploy(h)`
- [x] `client/src/__tests__/` — re-take pins deliberately: classSelect (CONFIRM SELECTION text, confirm-does-not-deploy, hoist-never-null, label row), connection (`ensureColorPref` absent/valid/corrupt), home/homePersistence (chip line gone, no home hoist), all per I/O matrix
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` — record doc-sync debt (DESIGN.md:157/241/242/243, EXPERIENCE.md:35/36/66 supersessions; spec-1-14 SET SAIL + amber-unset pins re-taken; :153 chip-sub-line carve-out reversed by this ruling)

**Acceptance Criteria:**
- Given a fresh browser profile, when the home page mounts, then a random Regatta hue is already persisted and visible on chip + callsign chrome, and no color picker exists anywhere on home.
- Given the SELECT CLASS modal, when it renders, then no "PREFERENCE PICK…" caption exists, `COLOR PREFERENCE:` sits left of the 20 swatches, and the footer button reads `CONFIRM SELECTION` in amber primary chrome.
- Given a highlighted class, when CONFIRM SELECTION (or Enter) fires, then the class persists, the modal closes to the home page, and no room connection is attempted; PLAY remains the only deploy path.
- Given any viewport ≥1366×768, when home renders, then the slimmed chip and modal label row fit their containers (no overflow/overlap).

## Spec Change Log

## Review Triage Log

### 2026-08-01 — Review pass (2 Fable hunters + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 6: (high 0, medium 2, low 4)
- defer: 1: (high 0, medium 0, low 1)
- reject: 2
- addressed_findings:
  - `medium` `patch` Blocked-storage identity divergence (ALL THREE reviewers): `ensureColorPref()` swallowed a failed `setItem` while `connect()` re-read raw storage — home tints hue A, join sends nothing, server assigns hue B; remounts rerolled. Fixed: module-level session cache; `connect()` reads through `ensureColorPref()` and always sends `colorPref`. Fail-proven regression tests; three test files gained the cache reset (orchestrator-applied fallout fix).
  - `medium` `patch` Swatch-click keyboard death (Blind Hunter CONFIRMED): the key guard swallowed EVERY key while any layer button held focus — ESC/Enter/arrows dead after clicking a swatch in the app's now-only color picker. Fixed: guard narrowed to Enter/Space only + swatches blur on click. Fail-proven.
  - `low` `patch` Modal footer clipped below ~700px width (Edge Hunter + Codex agreed): nowrap row + vertical-only panel scroll made CONFIRM partially unreachable. Fixed: `flex-wrap:wrap`; 1366×768 floor unchanged.
  - `low` `patch` Chip text bled past its border box below ~430px width (nowrap name/divider in a max-width box). Fixed: ellipsis + `min-width:0`; no ellipsis at the floor.
  - `low` `patch` Test pin overclaimed (Codex): "native activation wins" test dispatched on `window` and cannot prove native activation in jsdom. Renamed to what it proves + extended with the narrowed-guard assertions.
  - `low` `patch` home.ts header comment claimed `repaintAccent` is "resubscribed on every hoist change" — it's a single mount-time subscription. Comment corrected.

Deferred (ledger entry filed): CVD-assist toggle leaves already-painted home tint stale (`PLAYER_HUES` swap repaints only on hoist change) — pre-existing pattern, surface widened by broader tinting. Rejected: cross-tab first-run roll race (menu-pref live-sync out of scope; join reads current storage at PLAY); "reuse saveColorPref" note (would create a connection→classSelect import cycle; behavior identical).

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + full suite green (client tests updated, zero skips)
- `npm test -w client` -- expected: new/re-taken pins pass; no lingering `SET SAIL` assertion in classSelect tests

**Manual checks (if no CLI):**
- jsdom covers DOM pins; visual container-fit at 1366×768 spot-checked via test assertions on computed styles where practical.

## Auto Run Result

**Status:** done. **Summary:** All five Eric-ruled home-page changes shipped, plus this run's three AskUserQuestion rulings (persist the random hue; broader home tinting — callsign field + chip; CONFIRM SELECTION keeps amber chrome): the color picker now lives only in the SELECT CLASS modal; absent/corrupt `hullcracker.color` rolls a random Regatta hue, persists it, and tints home chrome (amber-unset accents are gone); the class chip lost its "STD GUN · …" line and slimmed; the modal caption was replaced by a left-side `COLOR PREFERENCE:` label; SET SAIL became CONFIRM SELECTION (saves class, returns home — PLAY is the only deploy path, restoring EXPERIENCE.md's original pick-returns-home contract).

**Files changed:** `client/src/net/connection.ts` (ensureColorPref + session cache; connect always sends colorPref) · `client/src/ui/classSelect.ts` (hoist never-null, caption→label, chipLoadoutLine deleted, confirm button, narrowed key guard + swatch blur, footer wrap) · `client/src/ui/home.ts` (hoist unmounted, chip slimmed + ellipsis guard, callsign/chip personal-color tinting, confirm wiring without deploy, comment fix) · test files re-pinned/extended: `classSelect.test.ts` 26→34, `home.test.ts` 22→33, `homePersistence.test.ts` 10→13, `connection.test.ts` 13→20, `containerFit.test.ts` (mechanical rename) · ledgers: `deferred-work.md` (doc-sync debt, dead-server-branch awareness, CVD-stale-tint defer), `gds-workflow-status.yaml` (last_updated note).

**Review:** 2 Fable hunters + Codex cross-model. 6 patches applied (2 medium, both fail-proven with regression tests: blocked-storage identity divergence — all three reviewers agreed; swatch-click keyboard death; 4 low: footer flex-wrap, chip ellipsis, test-pin honesty, comment fix), 1 defer (CVD-assist stale home tint — ledgered), 2 rejects. 0 intent gaps, 0 bad_spec.

**Follow-up review:** false — two medium fixes are narrow, regression-pinned, and behaviorally verified; remainder cosmetic. (Epic-2 retro also retired the flag as a category.)

**Verification:** `npm run check` green at final revision — lint 0 errors (2 pre-existing max-lines-per-function warnings), tsc clean ×3 workspaces, 2342 tests (351 shared / 792 server / 1199 client), up from 2305 at baseline.

**Residual risks:** displaced-preference case (pref taken → nearest-free hue) now has no UI explanation anywhere pre-join (caption deleted by ruling; ledgered); server no-pref branch is production-dead for current clients (deliberate, ledgered); harness cannot verify real-browser layout — Eric's live-play eye is the ratified visual-acceptance mechanism.
