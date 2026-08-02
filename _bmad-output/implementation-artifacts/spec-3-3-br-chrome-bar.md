---
title: '3-3 BR Chrome Bar'
type: 'feature'
created: '2026-08-02'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false # flag retired (Epic 2 retro Ruling 1) — residuals are ledger entries with evidence + named home
baseline_revision: 'aa67e6c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The match has no top-center BR chrome — the interim 3.1 `zoneHud()` register (`STORM M:SS` / `STORM CLOSING` / `STORM CLOSED` in `main.ts`) is placeholder copy that carries none of the ratified bar (afloat count, own kills, match timer), uses drifted phase semantics, and Story 3.3 is the designated replacement (UX-DR16).

**Approach:** Ship the BR Chrome Bar: one restrained mono row top-center — `n AFLOAT · n KILLS · T+mm:ss · <ring readout>` — built from data already on the wire (roster `alive`/`kills`, `zoneStartT`, `ZoneView`); zero shared/server changes, PROTOCOL_VERSION stays 19. Ring readout follows the Eric-ratified urgency-override grammar (amendment 20), the amber final-10s pulse is the attention seam's second Tier-2 consumer, and the bar joins the ratified reveal-HUD survivor set (persists through death/spectate; hotbar/XP/vitals still die with the hull).

## Boundaries & Constraints

**Always:**
- Client-only: ZERO diffs under `shared/` or `server/`; no wire change; PV stays 19. All inputs are existing client data: roster metas (`alive`, `kills`, drone sentinel color), `ZoneView {state, cur, next, startT, closesInMs}`, `ServerClock.serverNow()`, match phase.
- Amendment 19: `n AFLOAT` counts ALL alive hulls (humans + drones). The placement/results humans-only doctrine (`score.ts` `isLiveRival`, `othersAlive`) is untouched — the asymmetry is deliberate and documented in-code.
- `n KILLS` = own roster `kills` tally (server-authoritative, drones included — matches the results modal). No client-side recount.
- `T+mm:ss` = `serverNow() − zv.startT`, minutes zero-padded, up-counting, clamped ≥ 0 — derived every frame from schema + clock (reconnect-safe by construction; no local accumulator).
- Amendment 20 grammar exactly (see I/O matrix): `RING CLOSES m:ss` pre-close; `RING REVEALED` through the reveal beat EXCEPT the last 10s before close start, which return to `RING CLOSES 0:0x` + amber pulse; `RING CLOSING m:ss` during the shrink (no amber); `RING CLOSED` after; urgency window defined by `closesInMs ≤ chromeBar.urgentMs` during any pre-close beat (robust under test beat configs).
- Amber pulse: exactly 1 Hz as `export const RING_PULSE_HZ = Math.min(1, CLIENT_CONFIG.settings.pulseCapHz)` — one shared ceiling, no second literal (hud.test.ts:136 convention). Opacity breathing only, phase-gated so onset starts from the lit keyframe (advancePulsePhase pattern — no mid-phase snap).
- Tier-2 law (EXPERIENCE.md tier table; attention.ts is the ratified seam): while Tier-1 is active (`ownTier1` — low-HP rail pulse or live denied pulse), the amber readout holds steady at its lit keyframe; transitions ease with the 3.2 hold precedent (τ ≈ 240ms) so denied-click spam can't square-wave the segment. Spectators have no Tier-1 channel (existing `renderSpectate` hardcodes false — keep).
- motion=off: breathing amplitude goes to zero, the amber COLOR and lit-alpha state remain (base is information, motion is the breath — hud.ts:330 ruling; `motionScaled` pattern).
- Colors per amendments 17/21: AFLOAT/KILLS/T+ numbers phosphor tabular (`colors.phosphor`, Geist Mono tabular for free); their labels dim-alpha phosphor (`TEXT_DIM_ALPHA` idiom — NEVER `textMuted`, grey text is retired for load-bearing HUD text); separators dimmer; ring segment (label + number) `stormReadout` #B06EE8, amber only during the pulse window.
- Survivor set (ratified, .decision-log 2026-07-16): bar renders from BOTH `Hud.update()` and `Hud.updateSpectate()`; its Pixi Texts parent to `hudLayer` (NEVER `this.root`, whose visibility is the instruments kill switch). Persists until return to port.
- Visibility gate: bar hidden while `zv.state === 'idle'` (waiting/gathering/countdown keep today's `drawMatch` lines at top-center); appears when the match goes live (zone anchor set) and stays through `finished`.
- Supply beat keeps ZERO HUD trace: `supply` renders byte-identical to `clear` (the countdown just continues).
- Container-fit law (epic-2 amendment 47): the bar must fit inside the screen width at the 1366×768 floor with worst-case strings; UI-scale (90/100/125%) applies via the existing hud layer scale.
- Interim register removed: `zoneHud()` + `fmtClock` in main.ts and the `zoneLine` Text in hud.ts are deleted/replaced; the bottom-right "IN STORM" `stormWarn` and the in-storm vignette are UNTOUCHED.
- Epic-3 amendments 1–21 bind; complexity ≤ 10 (split pure composer functions); `npm run check` green; one PR, never split.

**Block If:**
- Any AC seems to require a shared/server/wire change.
- The ratified grammar (amendments 19–21) proves ambiguous in a way the I/O matrix doesn't settle — surface to Eric, do not improvise copy semantics beyond the drafted register strings.

**Never:**
- No supply-drop surface of any kind; no audio cue (OQ#8 stays open); no omniscient-reveal camera work (Epic 5 completes reveal wiring — this story only makes the bar survive death); no listening ring / Epic-4 tiers; no generalized tier arbitration (4-8); no design-doc edits (mock's grey-label + white-T+ drift routes to the doc-sync ledger, not this PR); no changes to placement/results counting.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-live | `zv.state === 'idle'` (waiting/gathering/countdown) | Bar hidden; match-phase lines render as today | No error |
| Live, clear beat | state `clear`, closesInMs 154000 | `12 AFLOAT · 2 KILLS · T+04:12 · RING CLOSES 2:34` | No error |
| Supply beat | state `supply` | Byte-identical register to clear (countdown continues) — no supply trace | No error |
| Reveal beat, early | state `reveal`, closesInMs 47000 | Ring segment reads `RING REVEALED` (violet, steady) | No error |
| Urgency window | pre-close state, closesInMs 9400 | `RING CLOSES 0:10` amber, breathing at RING_PULSE_HZ | No error |
| Shrink | state `closing`, closesInMs 41000 | `RING CLOSING 0:41` violet, counting to close end, no amber | No error |
| Fully closed | state `closed` | `RING CLOSED` violet, steady | No error |
| Tier-1 during pulse | urgency window + ownTier1 true | Amber holds lit keyframe (eased), resumes breathing when Tier-1 clears | No error |
| motion off | settings.motion 'off' during urgency window | Static amber at lit alpha; no breath; all text renders | No error |
| Own death | spectating, match live | Bar keeps rendering with live values; hotbar/XP/vitals dead | No error |
| Match finished | results modal open, still in room | Bar persists until return to port | No error |
| Drone sinks | any drone's `alive` flips false | AFLOAT decrements (all-hulls count, amendment 19) | No error |
| Reconnect mid-match | fresh join, schema resync | T+ and ring readout correct immediately (derived, not accumulated) | No error |
| Degenerate clock | closesInMs 0 / negative, startT 0 mid-race | Clamp to 0:00 / `T+00:00`; no NaN, no negative strings | Guarded |

</intent-contract>

## Code Map

- `client/src/ui/chromeBar.ts` — NEW pure composer (zero Pixi, `phase.ts` precedent): `fmtBarClock(ms)` (padded mm:ss), `ringReadout(state, closesInMs, urgentMs)` → `{text, urgent}`, `RING_PULSE_HZ`, `chromeBarSegments(...)` → styled segment list. Each function small (complexity ≤ 10).
- `client/src/score.ts` — add pure `afloatCount(metas)` counting ALL alive hulls (doctrine comment: placement stays humans-only; amendment 19).
- `client/src/render/hud.ts` — chrome-bar Text row on `hudLayer` (multi-Text, measured, centered at `(screenW/2, MARGIN)`); `drawChromeBar(...)` called from `update()` AND `updateSpectate()`; delete `zoneLine`/`ZONE_STYLE` line path from `drawZone` (keep `stormWarn`); amber alpha via phase-gated pulse + eased Tier-1 hold + `motionScaled`.
- `client/src/main.ts` — delete `zoneHud()`/`fmtClock`; build the bar payload in `renderAlive` + `renderSpectate` (`afloatCount(publicState)`, existing `ownKills`, `matchMs = serverNow − zv.startT`, `ownTier1`/false); visibility gate `zv.state !== 'idle'`.
- `client/src/config.ts` — new `CLIENT_CONFIG.chromeBar` block: y, fontSize, letterSpacing, gap, label/sep alphas, pulse floor alpha, holdEaseMs, `urgentMs: 10000` (JSDoc each with story/amendment cites).
- `client/src/render/attention.ts` — consumed unchanged (`tier1Active` already computed per-frame in main.ts).
- `client/src/__tests__/chromeBar.test.ts` — NEW: every I/O matrix row as a pure test; register strings; padding; urgency boundary; pulse-ceiling pin (shares ONE ceiling, no second 1.1/1 literal). `score.test.ts` — `afloatCount` incl. drones/dead/own. `hud.test.ts` — extend if any hud pure export changes.
- `VERSION` + root `package.json` — 0.17.36 (cycle 36 — baseline aa67e6c already carries cycle 35, PR #81's star-shell preview interstitial). `sprint-status.yaml` 3-3 → done; `gds-workflow-status.yaml` next_expected → create-story 3-4; CLAUDE.md client list + chrome-bar decision line — all ride the PR at finalize.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` — add `CLIENT_CONFIG.chromeBar` block — single tunable home, config-read tests.
- [x] `client/src/ui/chromeBar.ts` + `client/src/score.ts` — pure composer + `afloatCount` — the story's testable core.
- [x] `client/src/render/hud.ts` — bar row on `hudLayer`, drawn from both update paths; retire `zoneLine`; amber pulse/hold/motion wiring — the render half.
- [x] `client/src/main.ts` — payload assembly + visibility gate; delete the interim register — the only integration point.
- [x] `client/src/__tests__/chromeBar.test.ts` (+ `score.test.ts` extension) — all I/O matrix rows + pulse-ceiling pin + segment style registers.
- [x] Docs/bookkeeping — VERSION 0.17.36 (cycle 36; baseline already carries 0.17.35), sprint-status, gds-workflow-status (→ create-story 3-4), CLAUDE.md — in the PR.

**Acceptance Criteria:**
- Given a live match, when the bar renders, then it reads `n AFLOAT · n KILLS · T+mm:ss · <ring readout>` top-center — AFLOAT = all alive hulls (drones included), KILLS = own roster tally, T+ zero-padded and up-counting from the live anchor.
- Given the minute beats, when phases change, then the ring readout follows amendment 20 exactly (matrix rows), the supply beat is indistinguishable from clear, and copy uses the drafted register strings.
- Given the urgency window, when it opens, then the ring segment turns amber breathing at exactly `RING_PULSE_HZ`; given Tier-1 active it holds lit (eased); given motion=off it renders static amber — information never disappears.
- Given own death and the results modal, when they occur, then the bar persists (survivor set) while hotbar/XP rail/own-vitals die with the hull; return to port removes it.
- Given the style registers, when segments render, then numbers are phosphor tabular, labels dim-alpha phosphor (no `textMuted` text anywhere in the bar), ring segment storm-violet, and the bar fits the 1366-wide floor at every UI scale (container-fit law).
- Given `git diff` against baseline `aa67e6c`, when the PR is assembled, then nothing under `shared/` or `server/` changes and PROTOCOL_VERSION stays 19.

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass (2 Fable hunters + Codex cross-model; verdicts: build-on-it ×2; Codex 2×P2, both overlapping a hunter finding)
- intent_gap: 0
- bad_spec: 0
- patch: 8: (high 0, medium 1, low 7)
- defer: 2: (low 2)
- reject: 2: (low 2)
- addressed_findings:
  - `[medium]` `[patch]` The elapsed T+ match clock CEILed seconds (Codex + Edge Case Hunter independently), reading one second fast the entire match (`matchMs=1` → `T+00:01`) — split `elapsedSeconds` (floor) from the countdown `clockSeconds` (ceil); ring countdowns unchanged. Fail-proven (`expected '00:01' to be '00:00'`).
  - `[low]` `[patch]` The spec matrix's "startT 0 mid-race → Guarded" row was not implemented (ALL THREE reviewers): non-idle zone state with the `zoneStartT=0` sentinel would print a huge T+ — new pure `barVisible(state, startT)` gate (`state !== 'idle' && startT > 0`), tested across every phase × 0/negative/NaN/real anchors.
  - `[low]` `[patch]` `advanceRingPhase` integrated while motion=off (amp 0), so re-enabling motion mid-urgency-window applied full amplitude at an arbitrary phase — a 1.0→0.45 snap violating the lit-onset rule (Edge Case Hunter, CONFIRMED) — amp is now a required parameter; phase holds 0 whenever `!urgent || amp <= 0`. Fail-proven.
  - `[low]` `[patch]` The one-Tier-1-read hoist put the read BEFORE the denied-pulse driver (Blind Hunter, CONFIRMED): a denial born this frame was missed by both Tier-2 consumers for one frame and the same-frame comment went stale — read moved to after `renderFiring` inside `renderOwn` (returned to `renderAlive` for `updateZone`); same-frame invariant restored, comment true again.
  - `[low]` `[patch]` `layoutChromeBar` text/position loops indexed the fixed Text pool unguarded past `CHROME_BAR_SEGMENTS` on composer drift — bounded by `Math.min`.
  - `[low]` `[patch]` `ringReadout(state: string)` was stringly-typed — now `ZonePhase`, so a future phase fails at compile time instead of rendering fallthrough copy.
  - `[low]` `[patch]` `lastBarSig` joined space-bearing texts with a literal NUL BYTE embedded in the source (made hud.ts read as binary to grep/file) — rewritten as the an explicit backslash-u0000 escape; same collision-proof semantics, file is text again.
  - `[low]` `[patch]` Spec Tasks line said VERSION 0.17.35 while the Code Map correctly said 0.17.36 (baseline aa67e6c already carries cycle 35) — Tasks line corrected; plus one new hud test pinning the alive→spectate pulse seam (Blind Hunter's only reasoning-alone gap).
- defer: the 2026-07-16 HUD-composite mock's grey labels + white T+ number vs the shipped amendment-17/21 registers (doc-sync batch, Eric-gated); pre-existing literal 0x01 byte in `results.ts` `scoreSignature` (same binary-file hazard the NUL patch fixed in hud.ts).
- reject: layout-model hairline gaps (~2px/boundary, conservative-safe direction, reads as tracking on a letter-spaced mono row); one-frame amber→violet snap at urgency-window close (amendment-20-by-design, single non-repeating state transition).

## Design Notes

- **Layout:** fixed segment list rendered as individual Pixi Texts (multi-color row; Pixi Text is single-style), widths measured after text set, row centered on `screenW/2` at `y = chromeBar.y` (the retired `zoneLine` slot, `MARGIN`). Re-measure only when a segment's string changes (T+ ticks once per second) or screenW/scale changes — signature-diff like `railSig`/`lastZoneLine`.
- **Pulse mechanics:** follow `railPulsing`-gated phase accumulation (hud.ts:302 JSDoc) — hold phase 0 while inactive so the first amber breath starts at the lit keyframe; alpha swings lit→floor with `motionScaled` amplitude; Tier-1 hold eases toward lit with τ ≈ `chromeBar.holdEaseMs` (mirror the 3.2 vignette-hold precedent; the shared per-frame timestamp already threads through `renderFiring`/`ownTier1`/`updateZone`).
- **Register strings (draft copy, canon later per the standing draft-copy rule):** `RING CLOSES m:ss` / `RING REVEALED` / `RING CLOSING m:ss` / `RING CLOSED`. `closesInMs` is dual-meaning by design (pre-close → to close START; closing → to close END; zone.ts:96) — the composer takes it verbatim, never re-derives.
- **Why `zv.state !== 'idle'` as the gate:** the zone anchors at the exact `active` transition (match.ts:298) and `zoneStartT` is public schema — one gate covers live, finished, spectate, and reconnect without touching match-phase plumbing. The new `gathering` phase (PV 19) is covered for free (zone still idle).
- **Mock drift handled deliberately:** the 2026-07-16 mock's grey labels and white T+ number predate the 2.3 de-grey ruling (epic-2 amendment 17) and the epics AC's "numbers phosphor" — labels become dim-phosphor, T+ number phosphor. Ledger a doc-sync note; no design-doc edits in-story.

## Verification

**Commands:**
- `npm run check` — expected: lint (0 complexity errors) + tsc ×3 + full suite green, client count grows by the new tests.
- `git diff --stat aa67e6c -- shared/ server/` — expected: empty.

**Manual checks (if no CLI):**
- Worktree diff contains no unrelated files (HULLCRACKER_NOTES.md untouched); grep confirms no `textMuted` usage in the bar path and no second pulse-rate literal.

## Auto Run Result

**Status:** done. **Branch:** worktree-dev-auto-3-3-br-chrome-bar (final_revision in frontmatter).

**Summary.** The match now wears its BR chrome: one restrained mono row top-center — `n AFLOAT · n KILLS · T+mm:ss · <ring readout>` — replacing the 3.1 interim `STORM m:ss` register. Three pre-implementation Eric rulings (amendments 19–21, all the presented recommendations) settled the forks: AFLOAT counts ALL hulls including drones (the BR reading; deliberate asymmetry with humans-only placement), the ring readout runs the URGENCY-OVERRIDE grammar (`RING CLOSES` to close start through clear/supply; `RING REVEALED` through the reveal beat until its final 10s yield back to the countdown with the amber exactly-1 Hz pulse; `RING CLOSING` to close end, no amber; then `RING CLOSED`), and the ring segment wears storm-violet outside the amber window. The headline architectural fact from investigation: every input was already on the wire (roster `alive`/`kills` sync live per tick, `zoneStartT` is public schema, ZoneView ships since 3.1) — so the story landed client-only, zero shared/server diffs, PROTOCOL_VERSION untouched at 19. The amber pulse is the attention seam's second Tier-2 consumer (eased 240ms hold at the lit keyframe under Tier-1, motion=off = static lit amber, phase-gated lit onset), and the bar is the first shipped member of the ratified reveal-HUD survivor set: hudLayer texts drawn from BOTH alive and spectate paths, visible whenever the zone timeline is anchored, gone only at return to port. Labels render dim-alpha phosphor per the amendment-17 de-grey doctrine (the 2026-07-16 mock's grey labels ledgered as doc drift).

**Files changed (grouped).** NEW `client/src/ui/chromeBar.ts` (pure composer: fmtBarClock floor-elapsed / fmtRingClock ceil-countdown, ringReadout over ZonePhase, chromeBarSegments/chromeBarLayout, RING_PULSE_HZ = min(1, pulseCapHz), advanceRingPhase amp-gated, ringSegmentAlpha, barVisible); `client/src/render/hud.ts` (chrome-bar Text pool on hudLayer, drawChromeBar from update() AND updateSpectate(), signature-gated layout, breatheRing w/ eased Tier-1 hold via zone.ts easeHold; zoneLine/ZONE_STYLE retired, drawZone → drawStormWarn); `client/src/main.ts` (chromeBarView payload, tier-1 read restored to after the denied-pulse driver inside renderOwn, interim zoneHud/fmtClock deleted); `client/src/score.ts` (afloatCount + isAfloatHull beside the untouched humans-only placement doctrine); `client/src/config.ts` (CLIENT_CONFIG.chromeBar block); tests: NEW chromeBar.test.ts (43), hud.test.ts chrome/seam suites, score.test.ts afloatCount suite; bookkeeping: VERSION/package.json/lockfile 0.17.36 (cycle 36), sprint-status 3-3 done, gds-workflow-status (cycle entry + next_expected → create-story 3-4), CLAUDE.md (ui list + 3.3 grammar bullet), amendments 19–21, 2 deferred-work entries.

**Review findings breakdown.** 2 Fable hunters + Codex cross-model (Codex 2×P2, both overlapping a hunter finding — full agreement picture, no disagreements to adjudicate). 8 patches applied, key ones fail-proven: 1 medium — the elapsed T+ clock CEILed seconds and read one second fast all match (Codex + Edge Case Hunter); 7 low — the startT=0 sentinel gate the spec matrix promised but the code lacked (flagged by ALL THREE reviewers → barVisible), motion-off phase integration (re-enable snapped mid-phase; amp now gates the integrator), the Tier-1 read hoisted before the denied-pulse driver (one-frame onset lag for both Tier-2 consumers; read-after-drive restored), unguarded Text-pool indexing, stringly-typed ringReadout → ZonePhase, a LITERAL NUL BYTE in source that made hud.ts binary to grep (rewritten as an escape), and the spec's own stale 0.17.35 Tasks line. 2 defers ledgered (mock register drift → doc-sync batch; pre-existing 0x01 byte in results.ts). 2 rejects (layout-model hairline gaps — conservative-safe direction; the one-frame snap at urgency-window close — amendment-20-by-design). 0 intent gaps, 0 bad-spec. Verdicts: build-on-it ×2.

**Verification.** `npm run check` green at every wave, independently re-run by the orchestrator after each: final 2596 tests — 395 shared / 820 server / 1381 client (baseline 2535 on main; +61), lint 0 errors. Scope pin `git diff aa67e6c -- shared/ server/` empty throughout. No dev server or external process touched; no design docs edited.

**Residual risks.** chromeBar config values (fontSize 18, labelAlpha 0.55, sepAlpha 0.35, pulseFloorAlpha 0.45) are implementer-drafted within ratified envelopes — Eric's live-play eye remains the acceptance mechanism of record; the layout width model slightly over-bounds Pixi's true advance (~2px/boundary slack, centering conservative — worth an eyeball on the water, never an overflow). The bar's Epic-5 obligation (persisting through the full omniscient-reveal camera work) is wired-ready but verified there, per the epic's cross-story contract.
