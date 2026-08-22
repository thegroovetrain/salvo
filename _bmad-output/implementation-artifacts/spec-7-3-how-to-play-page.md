---
title: 'Story 7-3: How-to-Play Page'
type: 'feature'
created: '2026-08-19'
status: 'done'
baseline_revision: '362e7e7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-7-3-how-to-play-page-questions.md'
warnings: ['multiple-goals']
---

<intent-contract>

## Intent

**Problem:** A stranger arriving at Hullcracker has no onboarding surface at all. Home's
HOW TO PLAY link paints `FIELD MANUAL ARRIVES IN A LATER REFIT` and goes nowhere, and the
win condition is stated NOWHERE a new player can read it (epic-5 amendment 46(c)) — the
only statement in the product is a winner-only results banner. This is a beta gate, not
polish. Separately, Eric believed the pre-`return` radar had already been deleted; it had
not, so the codebase carries two radars while production runs one.

**Approach:** Ship a third static page at `/how-to-play`, inheriting the page chrome Story
7-2 minted for exactly this purpose, teaching only the basics Eric scoped — steer, select
weapons, shoot, upgrade — plus the win condition. Wire home's link to it. Correct the
in-game binding reference so the two controls surfaces agree. And delete the old radar
grammar end to end, so there is exactly one radar in the code.

## Boundaries & Constraints

**Always:** Author every fact from the CODE, never from CLAUDE.md / DESIGN.md /
EXPERIENCE.md — all three are verifiably stale on the controls. Keys render as KEYCAPS
(Eric, 2026-08-19). Zero colour literals anywhere under `client/src` (`tokens.test.ts`
fails the whole suite on one). Never the `border:`/`background:` CSS shorthand in
`ui/page.ts` (CSSOM blob hazard). Complexity ≤ 10, enforced as an ESLint error. The page's
module graph stays free of Pixi, the socket, the sim and analytics.

**Block If:** the copy register or any player-facing sentence needs a ruling beyond the
scope Eric already gave — epic-6 amendment 41 is standing law. Deleting the old radar
changes any RETURN-grammar behaviour (that would be a retune, not a deletion).

**Never:** ship a boon glossary (struck by name — *"NO FUCKING GLOSSARY"*). Ship an ad
slot (7.4 owns ads; DESIGN.md defines none). Teach the `P` debug key. Touch
`shared/src/sim/silhouette.ts` during the radar deletion — that is the POLYGON GEOMETRY
library that merely shares a name with the deleted grammar mode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Direct visit | GET `/how-to-play` | 301 to `/how-to-play/`, page renders in standard chrome | n/a |
| Shared link | `/how-to-play?utm_source=x` | Query string survives the redirect | n/a |
| From home | Click HOW TO PLAY | Real anchor navigation; middle-click and new-tab work | n/a |
| Leaving | ESC, or BACK TO PORT | Navigates to `/`, never `history.back()` | Listener torn down |
| Double boot | `mountHowToPlayPage()` twice | Exactly one `#how-to-play-page` root; ESC fires `onBack` once | Previous mount torn down |
| Old radar client | Client at PV 40 joins PV 41 server | Refused at matchmake by the existing PV gate | Existing error path |

</intent-contract>

## Code Map

- `client/how-to-play/index.html` -- the third Rollup entry; fonts non-render-blocking, FOUC guard, one script tag
- `client/src/how-to-play/main.ts` -- boot: `injectTheme()` then `renderPage()`; builds the footer link
- `client/src/how-to-play/copy.ts` -- the content as pure data. DRAFT pending Eric's pass, then frozen
- `client/src/ui/page.ts` -- gains `makePageLink`, `KeyBinding`, `makeKeyTable`; the mount-lifetime defect fixed
- `client/vite.config.ts` -- third rollup input; the dev/preview redirect generalized to `STATIC_PAGE_PATHS`
- `client/src/ui/home.ts` -- HOW TO PLAY becomes a real `<a>`; `NOTE_HOWTO` deleted
- `client/src/ui/settings.ts` -- `bindingRows()` completed (digit 5, arrows, numpad, the keyless gun)
- `shared/src/{index,types}.ts` -- `RadarGrammar`/`RadarIdentity` and the `WelcomeMsg` fields deleted; PV 40 -> 41
- `server/src/game/{world,perception,signals}.ts`, `server/src/rooms/ArenaRoom.ts` -- the mode branches collapse to the surviving behaviour
- `client/src/{config,render/radar}.ts`, `render.yaml` -- the silhouette render path and both env flags deleted
- tests -- `howToPlay.test.ts` (new), `home.test.ts` (stub pin inverts), `analytics.test.ts` (guard becomes a table), `page.test.ts`, `settings.test.ts`, and the radar suites

## Tasks & Acceptance

**Execution:**
- [x] `client/src/how-to-play/copy.ts` -- draft the content from code-verified facts -- the page's substance
- [x] `client/how-to-play/index.html` + `client/src/how-to-play/main.ts` -- the entry and boot -- mirrors `/privacy`
- [x] `client/vite.config.ts` -- third entry + generalized redirect -- so a fourth page is one row
- [x] `client/src/ui/home.ts` -- real anchor, stub deleted -- the link finally means something
- [x] `client/src/ui/settings.ts` -- complete the binding reference -- the two controls surfaces must agree
- [x] `client/src/ui/page.ts` -- `makePageLink`, keycap `makeKeyTable`, mount-lifetime fix -- the AC needs a link; Eric ruled keycaps
- [x] radar deletion across `shared/`, `server/`, `client/`, `render.yaml` -- one radar, PV 40 -> 41
- [x] tests -- new page tests; the home stub pin inverted; the script guard generalized
- [x] `VERSION` + `package.json` -> `0.17.106`; both tracker files; epic-7 amendments entry

**Acceptance Criteria:**
- Given a new player on home, when they click HOW TO PLAY, then a real page loads at
  `/how-to-play` and ESC or BACK TO PORT returns them to the port.
- Given the page, when it is read, then it states the win condition explicitly, covers
  steering, shooting, weapons and upgrading, positions SOLO VS AI as the tutorial, links
  the privacy policy, and contains no boon glossary and no ad surface.
- Given a key is named on the page, then it renders as a keycap in the in-game chip
  treatment, not as bare text.
- Given the built artifact, then `dist/how-to-play/index.html` exists and carries exactly
  one script element, naming no origin but the font CDN.
- Given the radar deletion, then a grep for the grammar/identity symbols returns nothing,
  the RETURN golden frame is byte-identical, and `PROTOCOL_VERSION` is 41.
- Given `npm run check`, then lint, three type-checks and the full suite pass.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the scope is narrower than the AC.** The AC asked for the three sensor tiers, the
storm rhythm, classes and slot grammar, the boon economy and a boon glossary. Eric cut all
of it on 2026-08-19: *"This page needs to give people the basics on how to steer their
ship, select weapons, upgrade, and shoot. They can figure the rest out through play."* That
supersedes the AC's coverage list and strikes UX-DR29's glossary clause. The win condition
survives because FR39 exists to close a named defect, and because Eric separately ruled on
2026-08-14 that the win-condition copy moves to this page.

**Why the glossary could not have been hand-written anyway.** Card rules-text is not a
string — `boonDescription()` renders a live `effectiveStats()` diff against the reader's
own ship, and a static page has no ship. Story 7.5 then rewrites the catalog wholesale. So
the two options were "generate from source" or "ship something that goes stale silently";
Eric's cut removes the question.

**Why the radar deletion rides in this story.** It arrived as a correction to this page's
content — the page cannot honestly describe "your radar" while the code holds two of them
and only one is reachable. Deleting the road not taken is what makes the page's one
paragraph on radar true by construction rather than by an env var nobody reads.

## Verification

**Commands:**
- `npm run check` -- expected: lint clean, three type-checks clean, full suite green
- `npm run build` -- expected: succeeds, and `client/dist/how-to-play/index.html` exists
- `node client/scripts/readabilityCapture.mjs --verify-bundle` -- expected: still passes
- `grep -rn "radarGrammar\|radarIdentity\|HC_RADAR_" shared/src server/src client/src render.yaml` -- expected: empty

**Manual checks (if no CLI):**
- Load `/how-to-play` cold and confirm the keycaps render as boxes, the privacy link works,
  ESC returns to port, and no horizontal scroll appears at 1366x768.
