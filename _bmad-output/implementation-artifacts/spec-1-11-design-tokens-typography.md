---
title: 'Design Tokens & Typography'
type: 'feature'
created: '2026-07-23'
status: 'in-progress'
baseline_revision: '0260f7015894a4aeb46b23cd0d21f4502ef39d41'
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

**Problem:** Story 1.11 (epics.md). Client styling is ~107 scattered literals (48 Pixi `0x` numbers, 43 `#hex` strings, 15 `rgba()`, 1 in index.html) wearing prototype colors: two different denied reds (`0xFF3B3B` Pixi vs `#FF3B30` DOM), 9 deprecated `#111111` surface sites, 11 pre-validation `#5A6478` sites, no token layer, and per-element hand-tuned typography.

**Approach:** Land DESIGN.md's frontmatter tokens as the single styling source — one authored table in `CLIENT_CONFIG` (numeric, for Pixi) projected into `:root` CSS custom properties at bootstrap (for DOM chrome) — then sweep every literal onto it: ratified tokens where DESIGN.md pins the role, a clearly-marked byte-identical `legacy` group for renders owned by later stories. Typography registers (Geist / Geist Mono, uppercase tracked labels, `tabular-nums`) tokenize alongside. A guard test makes "no color literal outside the token source" permanent (UX-DR1).

## Boundaries & Constraints

**Always:** Client-only (`client/` and its tests). Ratified token names/values copied verbatim from DESIGN.md frontmatter. Legacy-group values byte-identical to today's literals. Complexity ≤ 10; one-way data flow (`state.ts` stays a leaf; the token module imports nothing heavy). Alpha variants compose from tokens via helper — never a raw literal.

**Block If:** A site's mapping would require inventing a color value that is neither in DESIGN.md frontmatter nor already in the code. DESIGN.md frontmatter and prose disagree on a token value. Anything would require a shared `CONFIG`, wire, or `PROTOCOL_VERSION` change.

**Never:** No `shared/` or `server/` changes; PV stays 10. No HUD layout/component rebuilds (hotbar, HP rail banding, telegraph, kill-feed restyle = later stories). No hull personal colors (1.12), silhouettes (1.13), or home/class-select chrome rebuild (1.14). No self-hosted fonts — Google Fonts CDN is the ratified delivery. Never resurrect `#66FFAA` for splashes (blip-decay only). No visual redesign beyond what token adoption itself changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token render | Client boots | Every DOM/Pixi color resolves from the token source; `#111111`, `#232937`, `#FF3B30`, `#5A6478` absent from client code | No error expected |
| Stray literal | A hex/`0x`/`rgba` literal added outside the token source | Guard test fails CI | Test failure names file:line |
| Font CDN down | Google Fonts unreachable | Fallback stacks render (Geist→system sans; Geist Mono→monospaced); no invisible text | Graceful degrade |

</intent-contract>

## Code Map

- `client/src/config.ts` -- `CLIENT_CONFIG` gains the token table: `colors` (ratified groups: surfaces, linework/text, functional, combat-effects, drone greys, 20 Regatta hues; plus `legacy` subgroup) authored as `0xRRGGBB`, and `type` (families with fallback stacks + the documented ramp registers). Existing `wake.color`/`ship.sunkTint` re-point at tokens.
- `client/src/util/color.ts` -- NEW tiny helpers: `cssHex(0x…)→'#…'`, `cssRgba(0x…, a)→'rgba(…)'` (no string→number parser needed; authoring stays numeric).
- `client/src/ui/theme.ts` -- NEW: injects `--hc-*` custom properties (colors + type registers) into `:root` at bootstrap; called from `main.ts` before any UI builds; sets `font-variant-numeric: tabular-nums` for DOM chrome.
- `client/src/ui/` (menu, results, upgradeMenu, upgradeToast, killFeed) + `client/src/util/banner.ts` -- cssText sweeps to `var(--hc-*)`; `#FF3B30`→`denied`, `#111111`→`panel`, `#5A6478`→`text-muted`; type registers applied to existing elements (no layout rebuild).
- `client/src/render/` (hud, effects, map, ships, projectiles, firing, zone, radar, phosphor, mines, litZones, decoys, stage, fog, textures) -- `0x` literals → token refs per the mapping in Design Notes; `textures.ts` RGB-string constants derive from tokens.
- `client/index.html` -- body background becomes `void` `#050807` — the ONE sanctioned literal outside `config.ts` (pre-JS FOUC guard; guard test allowlists exactly this value here); font links already load the exact ratified weights — keep.
- `client/src/__tests__/` -- hud/litZones/phosphor color pins re-pointed at tokens (values unchanged); NEW `tokens.test.ts`: guard scan (no color literal in `client/src`+`index.html` outside `config.ts`), retirement asserts, ratified-value spot pins (`denied=0xff3b3b`, `text-muted=0x7a8496`, panel, 20-hue count).
- Docs (same PR): `sprint-status.yaml` → `1-11-design-tokens-typography: done`; `_bmad-output/gds-workflow-status.yaml` next_expected → 1-12 + last_updated; `epic-1-context.md` already recompiled this run (rides the PR).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` + `client/src/util/color.ts` + `client/src/ui/theme.ts` + `client/index.html` + `client/src/main.ts` -- token table, helpers, CSS-var injection, fallback stacks -- the source lands first.
- [x] `client/src/render/*` -- Pixi sweep per Design-Notes mapping (ratified roles + legacy group) -- byte-identical where no ratified role exists.
- [x] `client/src/ui/*` + `client/src/util/banner.ts` -- DOM sweep to `var(--hc-*)` + type registers; reds→`denied`, surfaces→`panel` family, `#5A6478`→`text-muted`.
- [x] `client/src/__tests__/` -- update pinned values; add guard + identity tests.
- [x] Docs sweep + `npm run check` green (record the pre-change passing test count first; it must not shrink and grows with the new tests).

**Acceptance Criteria:**
- Given the shipped client code, when scanned, then every color literal lives in the token source (sole sanctioned exception: index.html's `void` FOUC guard), and `#111111`/`#232937`/`#FF3B30`/`#5A6478` (and `0x` twins) appear nowhere (UX-DR1).
- Given DESIGN.md frontmatter, when compared to the token table, then every ratified name/value matches verbatim, `denied` is the single red, and the legacy group is byte-identical to pre-story literals.
- Given the guard test, when any color literal is introduced outside the token source, then the client test suite fails.
- Given DOM chrome and Pixi HUD text, when rendered, then families are Geist / Geist Mono with fallbacks, labels stay uppercase + letter-spaced, DOM digits are `tabular-nums`, and ramp registers come from the type tokens (UX-DR2).
- Given `git diff`, when the PR is reviewed, then `shared/` and `server/` are untouched (styling-only, no wire change).
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Ratified per-site mapping (all pinned by DESIGN.md prose):** stage bg + ocean disc → `void` ("black void ocean"; surfaces role "page/canvas base"); fog composite base rgba → `fog-base`; `#111111` panels/backings → `panel` (locked mocks win, line 151); results fullscreen dim stays (sanctioned "behind results only") composed via `cssRgba(black,…)`; `#5A6478` → `text-muted` `#7A8496` everywhere including dim linework (validation lineage, frontmatter comment); both reds → `denied #FF3B3B` (Don'ts line 259); storm fill `storm`, on-water edge stroke + readout text `storm-readout` (contrast ruling, line 140); blips → `blip-fresh`/`blip-faded` (same values); miss splash → `splash`, muzzle → `muzzle`, hit flash → `hit-bloom`, sink ring → `damage-marker`, torpedo body → `torpedo` (Components · Combat Effects); islands → `island-fill`/`island-stroke`; chart rings/grid → `silver` + alpha helper.
- **Legacy group (byte-identical carry-overs, deleted by the story that owns each render):** own/enemy hull `0x00ff88`/`0xffb800` (→1.12 Regatta), mine/litZone/decoy own-green `0x2f7d5a`, projectile secondary tones `0xffe08a`/`0x3fbf8f`/`0x9fd8c4`, hpColor banding keeps `damage` third band (HP-rail redesign owns the `damage-marker` switch). Precedent: DESIGN.md's own island "provisional carry-over" tokens. `#232937` is net-new-unused — do NOT introduce it.
- **Delivery:** one numeric table → two projections (CLIENT_CONFIG for Pixi, injected CSS vars for DOM) matches the AC's "CLIENT_CONFIG/CSS custom properties" and the Pixi-numeric idiom (existing tests assert numbers). `tabular-nums` is DOM-only; Geist Mono digits are inherently tabular in Pixi canvas text.
- **Typography scope:** current HUD sizes already embed the post-playtest ~1.6× register (DESIGN.md line 197) — tokenize families/registers, keep component sizes; per-component restyles belong to later stories.
- Eric directive: route subagent model selection via `/orchestrate` (as 1.3–1.10).

## Verification

**Commands:**
- `npm test -w client` -- expected: green incl. new guard/identity tests; updated color pins.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green; `shared/`/`server/` diffs empty.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): surfaces read slightly deeper (void/panel family), denied feedback is one red everywhere, menus/results/kill feed render in Geist/Geist Mono with steady digits; no layout shifts.
