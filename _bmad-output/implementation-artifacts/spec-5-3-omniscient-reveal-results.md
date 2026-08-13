---
title: 'Story 5.3: Omniscient Reveal & Results'
type: 'feature'
created: '2026-08-13'
status: 'ready-for-dev'
baseline_revision: '5ba1c7d600c204f497c15ebcd8f20ae8abe99b9d'
final_revision: ''
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context-amendments.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/death-reveal-results-1.html'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 5.2 built the front half of the death beat — five seconds of going down shooting.
The back half does not exist. At founder the client hides your hull, turns the fog sprite off, and
drops a near-opaque black modal (`rgba(0,0,0,0.88)`) over the water — so the "omniscient reveal" the
epic is named for is technically happening behind a curtain nobody can see through, at combat
framing, following your killer. The results modal itself carries two counts and a placement, with no
sense of when anything happened.

**Approach:** Make the reveal *visible* and make the results *readable*. Three moves, all
client-side except one CONFIG number: the camera pulls back to frame the whole ocean (its own
framing mode, the game's first animated zoom); the modal's dim drops to `0.62` so the reveal it sits
over is actually the backdrop; and the modal gains the ratified mockup-F3 composition — a `SUNK`
banner, an identity line, three stat tiles, and a **MATCH LOG** stamping every kill and your own
death with `T+mm:ss`.

**What this story is NOT:** it does not touch the modal's verbs (amendment 23), does not add a
reveal *stage* you press through (amendment 24), and adds **no wire field** — `PROTOCOL_VERSION`
stays **34**.

## Boundaries & Constraints

**Always:**
- **Amendments 23-30 in `epic-5-context-amendments.md` are BINDING.** On any conflict between this
  spec and that file, the amendment wins. Read it before writing code.
- **Mockup frame F3** (`death-reveal-results-1.html:963-1131`) is the ratified visual contract for
  the modal. Deviations need a reason recorded here, not an implementer's preference.
- The reveal is **client presentation only**. Spectator frames already carry every afloat-or-sinking
  hull unfogged; nothing on the server or the wire moves except `CONFIG.match.resultsSeconds`.
- The master perception invariant keeps **exactly SIX** declared exceptions.
- Cyclomatic complexity ≤ 10; `npm run check` fully green is the ship gate.
- Every gameplay-authoritative tunable lives in `shared/src/constants.ts` `CONFIG`; client-only feel
  knobs live in `client/src/config.ts`.

**Block If:**
- Any change would require a wire field, a `PROTOCOL_VERSION` bump, or a seventh perception
  exception. All three of the modal's new content blocks derive from data the client already holds.
- Delivering the reveal would require disclosing a hull the server does not already send to a
  spectator.

**Never:**
- **Never add a re-queue path from the results modal** (amendment 30, stated as a MUST). RETURN TO
  PORT goes to home; home is the only place a match starts.
- Never change the modal's actions, `escapeAction`'s topmost-close law, the `canSpectate` gate, the
  400 ms `resultsKeysArmed` grace, or the Enter/`matchOver` predicate (amendment 23).
- Never insert a reveal stage the player presses through (amendment 24).
- Never exempt the reveal zoom from the motion setting (amendment 26).
- Never move `SPECTATE_ZOOM_MIN`/`MAX` or the alive user-zoom clamp (amendment 25).
- Never fade the fog composite to reveal the map — `plateRoot` sits BELOW `fogSprite` while hulls sit
  above it, so a fade dims every nameplate while the hulls stay bright. `setVisible(false)` only.
- Never draw a plume, plate or spatial mark for an unwitnessed sinking — the `seen` gate is absolute
  (epic-4 amendment 29, epic-5 amendment 21).
- Never put drones in the results table, and never make placements drone-relative (amendment 9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Founder, mid-match | Own hull founders; match still `active` | Fog off (as today); camera animates to the reveal framing; own wreck + its plate now VISIBLE; every afloat/sinking hull wears a plate; modal opens at founder as today, over a `0.62` dim | No error expected |
| Founder, match ends same tick | `resultsFinal` already true | Game-end modal path wins exactly as today; the reveal framing still applies | Existing `resultsFinal` guard unchanged |
| Winner at finish | Player never sank | Winner also receives `spec: true` frames; reveal framing applies at finish for them too | No elimination modal — `matchOver` path |
| Motion = `full` | Reveal begins | Zoom animates over `revealZoomMs` | — |
| Motion = `reduced` | Reveal begins | Zoom animates over `revealZoomMs × 0.5` | — |
| Motion = `off` | Reveal begins | Camera SNAPS to the reveal framing on the first frame — same view, no travel | — |
| Manual camera input | Player wheels or pans during/after the reveal | Reveal framing is released; the clamped [0.5, 1.0] spectate path takes over (documented pop) | — |
| Match log, seen kill | Own player sinks a named captain | `T+mm:ss   SANK <NAME>` | — |
| Match log, unseen kill | Own kill with no LOS, victim name unresolvable | Line omitted (inherits the shipped `SHIPS YOU SANK` limitation — `deferred-work.md:211`) | Never renders a blank or id-leaking name |
| Match log, own death | Own hull founders | `T+mm:ss   SUNK BY <NAME>` appended last | Killer unknown (storm) → `SUNK BY THE STORM` |
| Match log, victory | Player never sank | No death line; log ends on the last kill | Empty log → block omitted entirely |
| Time afloat | Any results open | `m:ss` from `zoneStartT` to own founder, or to now if never sank | `zoneStartT` 0 → tile omitted |
| Modal re-render | `updateOpenResults` refines placement | In-place update must not rebuild or reorder the match log | Existing signature guard extended |

</intent-contract>

<solution-design>

## Approach

Four independent seams, only one of which is shared:

1. **`shared/src/constants.ts`** — `CONFIG.match.resultsSeconds` 10 → 45 (amendment 27). One line.
   This is the only non-client change in the story.

2. **`client/src/render/camera.ts`** — a REVEAL framing mode. `revealZoomFactor(mapRadius)` returns
   the factor that fits the map diameter to the short axis, derived from the same `baseZoom` the
   camera already computes, and is **exempt from `SPECTATE_ZOOM_MIN`** (amendment 25). Plus the
   game's first animated zoom: an exponential ease toward a target factor, its duration scaled by
   `motionIntensity()` and collapsing to a snap at `off` (amendment 26). Manual wheel/pan releases
   the mode.

3. **`client/src/score.ts`** — two additions to `PersonalScore`: `afloatMs` and `matchLog`, a
   readonly list of `{ tMs, kind: 'sank' | 'sunkBy', name }`. Both derive from `zoneStartT` and the
   sunk events the client already folds. Pure, testable, zero net.

4. **`client/src/ui/results.ts`** — the mockup-F3 restyle and the new content blocks.

`client/src/main.ts` is the wiring only: un-hide the own wreck and its plate at spectate entry,
start the reveal framing, and feed the new score fields in.

## Code Map

| File | Change |
|------|--------|
| `shared/src/constants.ts` | `match.resultsSeconds` 10 → 45, with the amendment-27 rationale on the line |
| `client/src/config.ts` | New `CLIENT_CONFIG.reveal` block: `zoomMs`, `mapFitMargin`; `results.dimAlpha` |
| `client/src/render/camera.ts` | `revealZoomFactor()`, `setRevealTarget()`, per-frame `tickZoom()`; reveal factor bypasses the spectate clamp; manual input clears the target |
| `client/src/render/spectate.ts` | `wheelZoom`/`spectatePan` signal that manual control was taken |
| `client/src/score.ts` | `PersonalScore.afloatMs`, `PersonalScore.matchLog`; `MatchLogEntry`; fold helpers |
| `client/src/ui/results.ts` | Banner → `SUNK` + placement line; identity line; three stat tiles; MATCH LOG block; boons list; last-offer cards; button restyle (no sub-line); panel + dim to mockup F3 |
| `client/src/main.ts` | Spectate entry: own hull + own plate stay visible; kick the reveal framing; pass `mapRadius`; thread the new score fields |
| `client/src/__tests__/*` | New: reveal framing, match log, time afloat, the no-requeue action-set pin, nameplates-on-all-hulls, fog-drops-on-death. Existing camera/spectate clamp tests stay green untouched |

## Key Design Decisions

- **The dim is the feature.** `0.88` → `0.62` (mockup F3) is what makes the reveal visible at all
  under amendment 24. It is not a styling detail and must not be "tidied" back.
- **The reveal factor is derived, never a literal.** `mapRadius` already lives on the Game and is
  itself derived from `CONFIG.map`; the factor is `baseZoomFit / mapFit`, so a map-size retune moves
  the reveal with it. Story 6.2 makes map sizing roster-dynamic — this must not need touching then.
- **Motion scaling is applied to DURATION, never to the destination.** At `off` the camera arrives
  at the identical framing on frame one. This is the mechanical form of *"off removes motion, never
  information"* (`settings/store.ts:17-18`).
- **The match log is built from folds the client already does**, not from a new event stream — the
  same `handleSunkObserved` path that feeds `SHIPS YOU SANK`, plus a timestamp.
- **`SHIPS YOU SANK` is kept alongside the MATCH LOG.** Amendment 23 (epic-2) ratified that roll by
  name; the mockup predates it. The log is additive.
- **Boons + last offer are built to the mockup but flagged as an open owner decision** (amendment
  28) — implemented as two self-contained render functions so cutting them is a two-line deletion.

</solution-design>

<implementation-plan>

## Tasks

- [ ] **T1 — `CONFIG.match.resultsSeconds` 10 → 45** (`shared/src/constants.ts`). Add the
      amendment-27 note on the line. Confirm no shared/server test asserts the literal 10.
- [ ] **T2 — Reveal framing + animated zoom** (`client/src/render/camera.ts`,
      `client/src/render/spectate.ts`, `client/src/config.ts`). `revealZoomFactor(mapRadius, margin)`
      pure and exported; `setRevealTarget(factor)` + `tickZoom(dtMs, motionLevel)`; the reveal factor
      bypasses `SPECTATE_ZOOM_MIN` while the target is live; any manual wheel/pan clears it. Do NOT
      change `SPECTATE_ZOOM_MIN`, `SPECTATE_ZOOM_MAX`, `USER_ZOOM_MIN`, `USER_ZOOM_MAX`.
- [ ] **T3 — Score data** (`client/src/score.ts`). Add `MatchLogEntry`, `PersonalScore.matchLog`,
      `PersonalScore.afloatMs`. Pure fold helpers; no imports beyond what the module has.
- [ ] **T4 — Modal composition** (`client/src/ui/results.ts`). To mockup F3: dim `0.62`; panel 620px
      max-width, `rounded.lg` 12px, hairline border (retire the phosphor border); banner `SUNK` mono
      40/600/.3em amber with glow + `9TH OF 14` line; identity line `<CALLSIGN> · <CLASS>` with the
      callsign in the own hue's text-safe variant; three stat tiles KILLS (phosphor) / PLACEMENT /
      TIME AFLOAT; MATCH LOG block; boons list; last-offer cards; primary button transparent + amber
      outline + glow + `rounded.md` + `⏎` chip and **no sub-line**. Keep SPECTATE/RETURN TO PORT and
      every handler byte-identical.
- [ ] **T5 — Wiring** (`client/src/main.ts`). At spectate entry stop hiding the own hull and its
      nameplate (amendment 24 / mockup F2's wreck treatment carried onto F3's backdrop); start the
      reveal framing with the map radius; thread `afloatMs`/`matchLog` into the results view.
- [ ] **T6 — Tests.** New coverage for: the reveal framing factor and its motion behaviour
      (full/reduced/off); the match log's ordering, stamps and omissions; time afloat; the
      **no-requeue action-set pin** (amendment 30); nameplates present for every spectate contact;
      fog hidden on death. Keep `camera.test.ts`/`spectate.test.ts` clamp assertions green untouched.
- [ ] **T7 — `npm run check` green**, then bookkeeping: `VERSION` + package.json to 0.17.79,
      `sprint-status.yaml` and `gds-workflow-status.yaml` both updated in the same PR, `deferred-work.md`
      entries for the ledgered reveal-framing pop and the open boons decision, and CLAUDE.md's stale
      test count corrected.

## Test Strategy

Pure-logic first, in the project's established style: `revealZoomFactor` and the match-log folds are
pure functions tested directly; the modal is tested through its existing DOM-assertion harness
(`client/src/__tests__/results.test.ts`); the no-requeue pin asserts the rendered action set rather
than any internal. No new server or shared tests beyond confirming T1 breaks nothing.

</implementation-plan>
