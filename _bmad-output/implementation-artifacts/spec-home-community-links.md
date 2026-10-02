---
title: 'Home page DISCORD + REDDIT community links (env-templated)'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
baseline_revision: '89c0ad5'
final_revision: '77be563'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/client/src/ui/home.ts'
  - '{project-root}/client/src/analytics/ga.ts'
  - '{project-root}/render.yaml'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The port (home screen) has nowhere to send a player to the community. Eric wants links to the official Discord and subreddit on the home page, with the URLs built from templates in code plus build-time environment variables — never literal URLs in source.

**Approach:** Add DISCORD and REDDIT anchors to the existing underplay link row (HOW TO PLAY · PRIVACY · DISCORD · REDDIT), each rendered ONLY when its `VITE_*` var is set, on the exact mechanism `VITE_GA_MEASUREMENT_ID` already proves (Vite inlines `VITE_`-prefixed vars at build time; Render exposes them to the build). Templates live in one pure client module; `render.yaml` gains the two keys commented out.

### Eric rulings (2026-08-28, taken in-session via AskUserQuestion)

- **R1 Placement:** join the underplay link row beside HOW TO PLAY · PRIVACY — same hudMicro underlined phosphor treatment (`UNDERPLAY_LINK_CSS`). The row's "exactly two children" test pin is UPDATED, not deleted: the row is still "places you can go" and nothing else.
- **R2 Env shape — code + template:** `VITE_DISCORD_INVITE` holds the Discord invite CODE → `https://discord.gg/{code}`; `VITE_SUBREDDIT` holds the subreddit NAME (no `r/`) → `https://www.reddit.com/r/{name}/`. The templates are code; the identity is config.
- **R3 Unset var → hide that link.** Absence-gated exactly like GA4/AdSense: no var → no anchor rendered, nothing else changes. Staging, forks and local `npm run dev` therefore show no community links unless configured.
- **R4 Labels `DISCORD` / `REDDIT`; values LEFT UNSET for now.** Both keys ship COMMENTED OUT in `render.yaml`'s production `envVars` (the `VITE_ADSENSE_SLOT_RESULTS` precedent). No invite code or subreddit name is invented or committed.

## Boundaries & Constraints

**Always:**
- Anchors are REAL `<a>` elements (crawlable, middle-clickable), `target="_blank"`, `rel="noopener noreferrer"` — external destinations must not get a window handle to the game tab.
- Env is read at CALL time through `import.meta.env` (the `ga.ts` `measurementId()` shape), with the reader accepting an env record parameter so tests stub it; values are trimmed. A malformed value (characters outside a Discord invite code's `[A-Za-z0-9_-]`, or a subreddit outside `[A-Za-z0-9_]{2,21}`) is treated as UNSET (link hidden) — never rendered into an href.
- Tolerate the two paste mistakes a human makes: a full invite link (`https://discord.gg/<code>` or `https://discord.com/invite/<code>`) yields `<code>`; a leading `r/` or `/r/` on the subreddit is stripped. Anything else that fails validation hides the link.
- Row order is fixed: `HOW TO PLAY`, `PRIVACY`, then `DISCORD`, then `REDDIT` — community links follow the static-page links, and a missing one simply drops out without reordering the rest.
- Zero-config behaviour is byte-identical to today: with neither var set the row is exactly `['HOW TO PLAY', 'PRIVACY']` and every existing home test passes unchanged in meaning.
- ESLint complexity ≤ 10; the templating module is pure (no DOM), the DOM assembly stays in `home.ts`.
- This is a dev-auto build cycle: `VERSION` and root `package.json` → `0.17.132` (the workspace package.jsons stay at their own `0.1.0`); `sprint-status.yaml` interstitial index + header stamp and `gds-workflow-status.yaml` `last_updated`/`next_expected` prefix are updated in THIS change (one-line stamps only). `PROTOCOL_VERSION` is untouched (client-only, nothing on the wire). Epic 7 is closed, so this is recorded as an interstitial cycle with "no amendment"; the rulings above are the durable record and are ALSO written to `bmad-dev-auto-result-home-community-links-questions.md`.

**Block If:**
- The change would require a literal Discord/Reddit URL committed in source, or any new in-game copy beyond the two labels `DISCORD` / `REDDIT`.
- `render.yaml` needs an UNcommented value (none exists yet — R4).

**Never:**
- Touch the How-to-Play page, the privacy page, `shared/`, `server/`, the wire, or DESIGN.md.
- Render a link with a fallback/default URL when its var is unset (R3).
- Add icons, a new row, a corner register, or any layout beyond appending anchors to the existing row (R1).
- Read the env at module load (breaks test stubbing and the fold-away guarantee).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Neither configured | `VITE_DISCORD_INVITE`, `VITE_SUBREDDIT` both unset/empty | Row = `HOW TO PLAY`, `PRIVACY` (2 children), byte-identical to today | No error |
| Both configured | `VITE_DISCORD_INVITE=abc123`, `VITE_SUBREDDIT=hullcracker` | Row = 4 anchors; `DISCORD` → `https://discord.gg/abc123`, `REDDIT` → `https://www.reddit.com/r/hullcracker/`; both `target=_blank`, `rel=noopener noreferrer` | No error |
| Only one configured | `VITE_SUBREDDIT=hullcracker` only | Row = `HOW TO PLAY`, `PRIVACY`, `REDDIT` (3 children) | No error |
| Full invite pasted | `VITE_DISCORD_INVITE=https://discord.com/invite/abc123` (or `https://discord.gg/abc123`, trailing slash tolerated) | `https://discord.gg/abc123` | No error |
| `r/` prefix pasted | `VITE_SUBREDDIT=r/hullcracker` or `/r/hullcracker` | `https://www.reddit.com/r/hullcracker/` | No error |
| Whitespace | `VITE_SUBREDDIT="  hullcracker "` | Trimmed, rendered | No error |
| Malformed | `VITE_DISCORD_INVITE="a b/../x"`, `VITE_SUBREDDIT="hull cracker"` or `"h"` (too short) | That link HIDDEN; the other unaffected | Silent (no throw, no console noise in production) |
| env accessor throws | `import.meta.env` unavailable (non-Vite host) | Both hidden | try/catch → unset |

</intent-contract>

## Code Map

- `client/src/ui/communityLinks.ts` -- NEW pure module: `communityLinks(env?)` → ordered `{ label, href }[]`; `discordHref(raw)` / `subredditHref(raw)` template + validate (return `null` when unset/invalid). Default env param reads `import.meta.env` inside try/catch (`ga.ts` `measurementId()` shape).
- `client/src/ui/home.ts` -- `makeUnderplay()` appends one anchor per `communityLinks()` entry after PRIVACY, built with `UNDERPLAY_LINK_CSS` + `target`/`rel`; header comment gains the row's new membership + R1/R3 note.
- `client/src/__tests__/communityLinks.test.ts` -- NEW: every I/O matrix row against the pure module (pass env records explicitly; also `vi.stubEnv` once to prove the default path reads `import.meta.env`).
- `client/src/__tests__/home.test.ts` -- update the "two static-page links, and nothing else" pin: unset → still exactly `['HOW TO PLAY','PRIVACY']`; add a stubbed-env case asserting `['HOW TO PLAY','PRIVACY','DISCORD','REDDIT']`, hrefs, `target="_blank"`, `rel` — and that the status line is untouched.
- `render.yaml` -- production `envVars`: two COMMENTED-OUT keys `VITE_DISCORD_INVITE` / `VITE_SUBREDDIT` with rationale (template in code, absence-gated, not a secret, left unset by Eric ruling 2026-08-28); staging "deliberately absent" comment block gains one line for the pair.
- `VERSION`, `package.json` -- `0.17.131` → `0.17.132` (root only; `client/package.json` is `0.1.0` and not bumped).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- header `last_updated` + one interstitial-index line for cycle 132.
- `_bmad-output/gds-workflow-status.yaml` -- `last_updated` stamp; prefix `next_expected` with a CYCLE 132 sentence.
- `_bmad-output/implementation-artifacts/bmad-dev-auto-result-home-community-links-questions.md` -- NEW: the four rulings verbatim (R1–R4) with the question text and the date.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/ui/communityLinks.ts` -- create the pure template/validate module -- one home for the templates; testable without DOM
- [x] `client/src/__tests__/communityLinks.test.ts` -- cover every I/O matrix row -- the validation is the only place a bad env value could reach an href
- [x] `client/src/ui/home.ts` -- append community anchors in `makeUnderplay()`; update header comment -- R1 placement, R3 absence gating
- [x] `client/src/__tests__/home.test.ts` -- update the row pin + add the configured-env case -- the pin stays meaningful ("navigation and nothing else")
- [x] `render.yaml` -- commented-out production keys + staging absence note -- R4; the file is the live Blueprint source of truth
- [x] `VERSION`, `package.json` -- bump to 0.17.132 -- one cycle, one increment
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` -- one-line stamps for cycle 132 -- both trackers, same PR (standing Eric directive)
- [x] `_bmad-output/implementation-artifacts/bmad-dev-auto-result-home-community-links-questions.md` -- record R1–R4 -- durable home for in-session rulings

**Acceptance Criteria:**
- Given a build with no `VITE_DISCORD_INVITE`/`VITE_SUBREDDIT`, when the home mounts, then the underplay row has exactly the two static-page anchors and the server-status line beneath is unchanged.
- Given `VITE_DISCORD_INVITE=abc123` and `VITE_SUBREDDIT=hullcracker` at build time, when the home mounts, then `DISCORD` and `REDDIT` anchors follow `PRIVACY`, point to `https://discord.gg/abc123` and `https://www.reddit.com/r/hullcracker/`, open in a new tab with `rel="noopener noreferrer"`, and wear the same style as HOW TO PLAY.
- Given a malformed value in either var, when the home mounts, then that link is absent and nothing throws.
- Given the repo at this change, when `npm run check` runs, then lint (complexity ≤ 10), all three type-checks and all tests pass, and `grep -rn "discord.gg\|reddit.com" client/src` matches only the template module and its test.
- Given `render.yaml`, when read, then both new keys are present ONLY as comments under the production service and named in the staging absence block; no uncommented value exists.

## Spec Change Log

## Review Triage Log

### 2026-08-28 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 2, low 5)
- defer: 1: (high 0, medium 0, low 1)
- reject: 6: (high 0, medium 0, low 6)
- addressed_findings:
  - `[medium]` `[patch]` Zero-config test pins were environment-dependent (both Fable reviewers; Blind Hunter REPRODUCED with `VITE_SUBREDDIT=… npx vitest`): Vitest merges shell `VITE_*` / `client/.env*` into `import.meta.env`, so a developer QA-ing the row failed `npm run check`. Fixed: both vars stubbed EMPTY in the unconfigured pins (`noCommunityVars()` in home.test.ts, inline in communityLinks.test.ts — the ads/analytics house pattern); re-verified with both vars exported in the shell.
  - `[medium]` `[patch]` `DISCORD_URL` rejected real Discord-issued link shapes (both Fable reviewers): `?event=…` share links, legacy `discordapp.com`, `canary.`/`ptb.` hosts, scheme-less and mixed-case pastes all silently hid the link. Widened the EXTRACTION regex; the code validation that follows is unchanged in character set.
  - `[low]` `[patch]` Reddit side rejected a pasted full URL, `R/`, a trailing slash and `r/ name` (Edge Case Hunter): `SUBREDDIT_HOST` + case-insensitive prefix + trailing-slash strip + re-trim.
  - `[low]` `[patch]` `vi.unstubAllEnvs()` was scoped to one describe in a 69-`showHome` file (Blind Hunter): promoted to a file-level `afterEach`.
  - `[low]` `[patch]` `DISCORD_CODE` unbounded / accepted a lone `-` (Blind Hunter): `{2,64}`.
  - `[low]` `[patch]` Zero-width characters (U+200B–U+200D, U+FEFF) from a rich-text paste survived `trim()` (Edge Case Hunter): stripped in `trimmed()`.
  - `[low]` `[patch]` `render.yaml` placeholder values unquoted, so a subreddit named `on`/`no`/`yes` could be YAML-coerced (Edge Case Hunter): placeholders quoted with a note; the "malformed" home pin now runs in BOTH directions (bad DISCORD beside good REDDIT, then the reverse).
- rejected (recorded for the record, no action): `viteEnv()` try/catch "dead" — it is the intent-contract's own matrix row and the `ga.ts` house shape; `communityLinks(null)` — forbidden by the type; row `flex-wrap` at 4 items — ~400px fits the 1366px floor; `outerHTML` byte-identity pin — the zero-iteration loop is byte-identical by construction and the count+text pin is the house shape; GA4 outbound-click policy sentence now operative — informational, no change; `SUBREDDIT_NAME` not Reddit's full creation rule — the intent contract fixes `{2,21}`, and the comment now says exactly what the regex guarantees.
- Codex cross-model verdict: no confirmed or plausible defects, build-on-it. Agreement picture: both Fable reviewers flagged the env-dependent pins and the Discord-URL shapes (fixed as CONFIRMED-tier); Codex alone flagged nothing; nothing was disputed between models.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, type-checks clean, all tests pass (existing count + the new community-link tests)
- `npm test -w client -- communityLinks home` -- expected: new and updated home tests pass
- `grep -rn "discord.gg\|reddit.com" client/src --include='*.ts'` -- expected: hits only in `ui/communityLinks.ts` and `__tests__/communityLinks.test.ts`
- `grep -n "VITE_DISCORD_INVITE\|VITE_SUBREDDIT" render.yaml` -- expected: comment lines only

## Auto Run Result

**Summary:** The port's underplay link row now reads HOW TO PLAY · PRIVACY · DISCORD · REDDIT, with the two community anchors built from templates in `client/src/ui/communityLinks.ts` and the identity from build-time `VITE_DISCORD_INVITE` (invite code) / `VITE_SUBREDDIT` (subreddit name). An unset or malformed var hides its link and nothing else; both vars ship commented out in `render.yaml` by Eric's ruling, so the shipped home is byte-identical until he sets them. Client-only; `PROTOCOL_VERSION` unchanged at 49. Cycle 132, `0.17.132`.

**Files changed:**
- `client/src/ui/communityLinks.ts` — NEW pure template/validate module (`discordHref`, `subredditHref`, `communityLinks`).
- `client/src/ui/home.ts` — `makeCommunityLink()` + the append loop in `makeUnderplay()`; header ruling paragraph.
- `client/src/__tests__/communityLinks.test.ts` — NEW, 19 tests over the I/O matrix + paste tolerances + the `import.meta.env` default path.
- `client/src/__tests__/home.test.ts` — file-level env cleanup; zero-config pin made env-independent; configured-env and two-direction malformed pins.
- `render.yaml` — production keys commented out with rationale (quoted placeholders); staging absence note.
- `VERSION`, `package.json` — 0.17.132.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, `_bmad-output/gds-workflow-status.yaml` — one-line cycle-132 stamps.
- `_bmad-output/implementation-artifacts/bmad-dev-auto-result-home-community-links-questions.md` — NEW, the four Eric rulings verbatim.
- `_bmad-output/implementation-artifacts/deferred-work.md` — one entry (`client/.env.local` not gitignored).

**Review findings:** 7 patched (2 medium, 5 low), 1 deferred, 6 rejected; 0 intent gaps, 0 bad-spec loopbacks. Codex: build-on-it.

**Follow-up review recommended:** false — the patches are localized (two regexes, test stubbing, a YAML comment), none touch behaviour a configured production build would show differently except accepting MORE paste shapes.

**Verification:** `npm run check` exit 0 — lint 0 errors (3 pre-existing warnings), all three type-checks clean, shared 784 / server 1728 / client 3260 = 5772 tests. `npm test -w client -- communityLinks home` 115/115 in a clean shell AND with `VITE_SUBREDDIT`/`VITE_DISCORD_INVITE` exported (the reproduced failure is closed). `grep -rn "discord.gg\|reddit.com" client/src` → only the template module and its two test files. `grep -n VITE_DISCORD_INVITE\|VITE_SUBREDDIT render.yaml` → comment lines only.

**Residual risks:** the feature is invisible until Eric sets the two vars (build-time — the next deploy after setting them, not immediately); a value set only in the Render dashboard rather than `render.yaml` is Blueprint drift of the kind cycle 127 cleaned up. `SUBREDDIT_NAME` deliberately keeps the intent contract's `{2,21}` rather than Reddit's 3-21/no-leading-underscore creation rule, so a typo like `_ab` renders a link to a 404 rather than hiding — a legibility choice, not a security one.

