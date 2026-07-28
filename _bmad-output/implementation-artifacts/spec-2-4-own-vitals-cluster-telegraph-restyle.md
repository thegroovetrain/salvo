---
title: 'Story 2.4: Own-Vitals Cluster & Telegraph Restyle'
type: 'feature'
created: '2026-07-27'
status: 'done'
baseline_revision: 'cf2730e'
final_revision: '070f59f'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** The own-vitals cluster moved to the bottom-right in Story 2.2 in its prototype style — a horizontal 240×16 HP bar with a filled `panel` backing (no `HULL n/n` header, no pulse), 28px readouts with prefix captions, a color-only telegraph (solid phosphor ordered marker vs solid amber needle), a green rudder tick on a 60px track, and no helm key glyphs. None of it matches the Eric-confirmed v2 composite anatomy (UX-DR15, DESIGN.md Components · HP Rail / Telegraph Cluster, `mockups/hud-composite-2.html`) or the Afterimage register.

**Approach:** Restyle the cluster in place per the v2 composite: vertical ~6px HP rail (amendment 27) on the cluster's right edge with threshold colors, an accelerating motion-gated opacity-breathing pulse, and a `HULL n/n` mono header; 22px tabular HDG/KTS with unit suffixes; 110px rudder track with amber position tick; shape-coded telegraph (hollow ordered rung outline vs solid amber needle); W/S · A/D key glyphs in the one mono key-chip family that fade permanently after 3 successful inputs per pair (amendment 26); floating linework only — the HP bar's panel fill dies.

## Boundaries & Constraints

**Always:**

- **Cluster anatomy (v2 composite, Eric-confirmed 2026-07-16):** `HULL n/n` mono header on top; body = helm block (HDG/KTS readouts + rudder gauge beside the 9-detent telegraph ladder with FULL/¾/½/¼/STOP rung labels and AHEAD/ASTERN captions) with the vertical HP rail climbing the body's right edge. Bottom-right anchored via `vitalsLayout()`; PTS line and storm readouts keep stacking above the cluster.
- **HP rail (UX-DR15 + amendments 24–27):** ~6px wide vertical rail, dim phosphor track (~0.12 alpha), fill climbing bottom-up = `hp/maxHp`. Fill color: `phosphor` ≥ 50% → `amber` < 50% → `damageMarker` < 25% (replaces the current 0.6/0.3 bands and the `damage` crimson). Opacity-breathing pulse only below 50%: rate ramps ~0.5 Hz at 50% → hard cap 1.1 Hz at ≤ 10% (clamped below), never on/off strobing. Motion doctrine (zone.ts vignette shape): amplitude is motion (`full`=1, `reduced`=0.5, `off`=0 via `motionScaled`), the base fill alpha is information and never disappears. Header reads `HULL <hp>/<maxHp>` (e.g. `HULL 72/100`).
- **Readouts (amendments 24–25):** HDG/KTS values mono 22px tabular (`type.registers.hudReadout`), `phosphor`, suffix-form per the mock (`HDG 025`, `14.2 KTS`) with unit suffixes/labels smaller and **dim phosphor ~0.7 alpha — never grey**. Same dim-phosphor treatment for the HULL caption, RUDDER label, and AHEAD/ASTERN captions. No `textMuted`/`textSecondary`/white text anywhere in the cluster; `textMuted` may remain only as linework DIM strokes.
- **Rudder:** 110px track, hairline-weight stroke, center detent mark, amber position tick (~2×8px + glow) replacing the green tick; RUDDER micro label.
- **Telegraph shape-coding:** ordered marker = **hollow** 1px phosphor rung outline (~26×7px + glow); actual speed = **solid** amber pointer needle — never color alone. Keep the existing detent math (`detentIndexOf`, `speedLadderFraction`, boosted denominator) and set-and-forget input semantics untouched.
- **Helm key glyphs (amendment 26 + UX-DR33):** W/S chips at the ladder extremes, A/D chips at the rudder track extremes, rendered by a key-chip drawer **extracted from hotbar.ts into a shared module** so all key glyphs stay one family (22px box / 14px mono glyph). Visible from the weapons-safe waiting room; each pair fades permanently (a short alpha fade, motion-gated to instant at `off`) after 3 successful inputs — W/S = telegraph steps that changed the detent, A/D = rudder key activations. Progress persists in a standalone `hullcracker.*` localStorage key (home.ts idiom: pure load/sanitize helper, corrupt → unfaded) that RESET SETTINGS does **not** touch.
- **Afterimage register:** floating linework only — remove the HP bar's `panel` backing fill; no filled panel behind anything; 0-radius rectangles; water shows through.
- **Config/token law:** new geometry, alphas, Hz values, glyph-fade count, and the persistence key live in a new `CLIENT_CONFIG.vitals` group (hotbar group is the shape precedent); the 1.1 Hz photosensitivity ceiling is promoted to config and consumed by BOTH the HP pulse and zone.ts's vignette (delete its module const). No color literals outside config.ts (tokens.test guard).
- **Pure-logic testing pattern:** `hullPulseHz(frac)`, pulse-alpha (vignetteAlpha shape), the re-banded `hpColor`, glyph-fade counter/sanitizer, and layout stay pure exported functions with unit tests; Pixi objects are thin shells. `Hud.update()` gains a time parameter (single callsite main.ts renderOwn); the telegraph signature-guard must not suppress the pulse (animate alpha on a separate layer or include time only where needed).
- **Layout discipline:** 1366×768 floor viewport stays overlap-free (hud.test.ts `vitalsLayout` pins: right-half, no hp/cluster/pts/storm overlap, hotbar clearance); size the taller cluster against the 125%-tier logical height (~614px) too. Type sizes respect amendment 15 (micro floor 14px; AHEAD/ASTERN 9→14) and the 9px post-scale mono floor.
- Cross-cutting: complexity ≤ 10; one-way data flow (hud reads `settings.current.motion` at draw time like zone.ts — no new subscriptions); client-only, zero wire/server change; `npm run check` green; no version bump.

**Block If:**
- Any wire-contract, perception, server, or shared-sim change turns out to be needed — this story is pure client render + input-counter + persistence.
- The v2 anatomy cannot fit the 1366×768 floor (or the 125% logical height) without violating a ratified layout rule (hotbar corner, PTS/storm stack, chrome max-width).

**Never:**
- No XP rail, banked-level chip, or gutter content (Story 2.6 — but the HP rail establishes the vertical-rail idiom 2.6 inherits: document track alpha/glow in config comments). No boon/economy work (2.5+). No hotbar visual changes beyond consuming the extracted key-chip drawer (pixel-identical output, pinned suites stay green). No telegraph/rudder input-semantics changes. No new entry in the settings overlay (glyph fade is not a setting). No DOM tactical UI. No design-doc edits (rulings live in amendments; DESIGN.md typography doc-sync stays ledgered). No `P`-prediction, spectate-HUD, or sunk-overlay rework beyond what the restyle forces.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Healthy | hp 80/100 | Rail 80% phosphor fill, steady (no pulse); header `HULL 80/100` | — |
| Wounded | hp 49/100 | Amber fill, breathing ~0.5 Hz | — |
| Critical | hp 24/100 | `damageMarker` fill, rate between 0.5 and 1.1 Hz | — |
| Floor cap | hp ≤ 10/100 | Pulse exactly 1.1 Hz — never faster, at 5% or 1% | — |
| Motion off | hp 20/100, motion=off | Steady base alpha — fill/color info fully present, zero oscillation | — |
| Motion reduced | hp 20/100, motion=reduced | Same base, half amplitude | — |
| Boundary | hp exactly 50/100, 25/100 | ≥50% phosphor+no pulse; <50% amber; <25% damageMarker (0.5/0.25 exclusive bounds) | — |
| Shape code | ordered ¾, actual ½ | Hollow phosphor outline at ¾ rung, solid amber needle at actual fraction | — |
| Glyph fade | 3rd successful W/S telegraph step | W/S chips fade permanently; A/D chips unaffected until their own 3rd | — |
| Persistence | Reload after fade | Chips stay gone (localStorage); RESET SETTINGS does not resurrect them | — |
| Fresh player | Weapons-safe waiting room, no prior inputs | All four chips visible at gauge extremes | — |
| Corrupt key | Glyph-fade key holds garbage | Sanitizer → unfaded (chips visible); no throw | Silent reset |
| No-op input | W pressed at FULL (no detent change) | Does not count toward fade | — |
| Suppressed input | Overlay open, keys suppressed | No fade progress (inputs never reach the sim) | — |
| Zero HP | hp 0 (sunk) | Vitals die with the hull (existing `setInstrumentsVisible` path unchanged) | — |
| UI scale | 90/125% tiers | Cluster scales via the HUD-root seam; no mono < 9px post-scale; floor viewport overlap-free | — |

</intent-contract>

## Code Map

- `client/src/render/hud.ts` — the restyle: cluster-local vertical HP rail (kill the `bars`-on-hudLayer split + panel fill), `HULL n/n` header, 22px suffix readouts, 110px rudder, hollow ordered marker, key glyphs, pulse plumbing; pure fns `hullPulseHz`, pulse alpha, re-banded `hpColor`
- `client/src/config.ts` — NEW `vitals` group (rail w/track alpha/glow, cluster geometry, pulse Hz endpoints + thresholds, glyph fade count, persistence key, label alpha 0.7); promote `pulseCapHz: 1.1` shared token
- `client/src/render/zone.ts` — consume the promoted 1.1 Hz ceiling (delete `VIGNETTE_PULSE_HZ`)
- `client/src/render/keyChip.ts` — NEW: key-chip drawer extracted from hotbar's private `drawKeyChip` (one family)
- `client/src/render/hotbar.ts` — consume the shared drawer; zero visual change
- `client/src/input/keyboard.ts` (+ `input/telegraph.ts` if cleanest) — surface "successful input" signals (telegraph step changed; rudder activation) to feed the fade counter without changing input behavior
- `client/src/render/helmGlyphs.ts` or colocated in hud.ts — fade-counter state + localStorage load/save/sanitize (home.ts standalone-key idiom)
- `client/src/main.ts` — pass `now` into `g.hud.update(...)` (renderOwn callsite); wire successful-input signals to the counter
- `client/src/__tests__/hud.test.ts` — rewrite `hpColor` bands (0.5/0.25, damageMarker), add pulse/ramp/cap suite, glyph-fade suite, updated `vitalsLayout` pins
- `client/src/__tests__/motion.test.ts` — HP-rail pulse motion-gating (vignette-test template: off holds base, reduced halves swing)
- `client/src/__tests__/tokens.test.ts` — pin new vitals tokens; guard scan must stay clean
- `client/src/__tests__/hotbar.test.ts` — stays green (extraction is behavior-neutral)
- Bookkeeping: `sprint-status.yaml` (2-4 → done), `_bmad-output/gds-workflow-status.yaml` (next_expected + last_updated), `deferred-work.md` (new entries if any), amendments 24–27 already recorded

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` -- add `vitals` group + promoted pulse ceiling -- token law, zone.ts shares the cap
- [x] `client/src/render/keyChip.ts` + `hotbar.ts` -- extract shared key-chip drawer -- one family, hotbar pixel-identical
- [x] `client/src/render/hud.ts` -- cluster restyle (rail + header + readouts + rudder + telegraph shapes + glyphs + pulse) -- UX-DR15, amendments 24–27
- [x] `client/src/input/keyboard.ts`/`telegraph.ts` + glyph-fade persistence module -- successful-input counting + standalone key -- amendment 26
- [x] `client/src/main.ts` -- time param + counter wiring -- pulse clock, fade signals
- [x] `client/src/render/zone.ts` -- consume promoted ceiling -- one 1.1 Hz truth
- [x] Tests: hud (bands/pulse/glyphs/layout), motion (rail gate), tokens (new group), I/O matrix edge cases -- pure-logic pattern
- [x] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- full gate green

**Acceptance Criteria:**
- Given the bottom-right cluster renders, then the HP rail climbs the body's right edge (~6px, threshold colors phosphor/amber/damageMarker at 50%/25%, `HULL n/n` header), the pulse breathes only below 50% ramping ~0.5→1.1 Hz hard-capped, and motion off/reduced holds/halves it with base fill intact.
- Given any HUD state, then ordered-vs-actual is shape-coded (hollow outline vs solid needle), HDG/KTS render 22px tabular phosphor with dim-phosphor suffixes, the rudder tick is amber on a 110px track, and no grey (`textMuted`/`textSecondary`) text and no filled panel appear anywhere in the cluster.
- Given a fresh player in the weapons-safe room, then W/S and A/D chips (shared key-chip family) sit at the gauge extremes; each pair fades permanently after its 3rd successful input, survives reload and RESET SETTINGS, and a corrupt key resets to visible without a throw.
- Given the hotbar after the key-chip extraction, then its rendering and pinned suites are unchanged.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass; no color literals outside config.ts; 1366×768 stays overlap-free.

## Spec Change Log

## Review Triage Log

### 2026-07-28 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 11: (high 2, medium 1, low 8)
- defer: 0
- reject: 2: (high 0, medium 0, low 2)
- addressed_findings:
  - `[high]` `[patch]` Pulse phase discontinuity (both hunters, CONFIRMED): alpha = sin(t·hz(frac)·2π) with frac-dependent hz meant every hp change jumped the phase by t·Δhz·2π — under storm drain past ~3 min of room uptime the rail re-rolled its alpha ~randomly at 20 Hz, a strobe in the exact low-hull alarm scenario the 1.1 Hz cap guards. Fixed: `advancePulsePhase` integrates phase (dt clamped, wrapped, held at 0 above the band so the pulse fades in from the steady base); regression test simulates a 10-minute-old match draining under storm dot and bounds per-frame |Δalpha| to the cap — fails under the old formula.
  - `[high]` `[patch]` Spectate/dead WASD burned the helm-glyph coach marks (both hunters AND Codex's sole finding): records ran unconditionally while spectate pan and dead-awaiting-respawn presses stepped the telegraph — three camera pans permanently retired the marks. Fixed: one shared `conningLive`/`helmInputCounts` predicate (own ship present + alive + not spectating) now gates BOTH the telegraph bell and the fade counters.
  - `[medium]` `[patch]` `HULL 0/100` on a live sliver hull: `Math.round` displayed 0 for fractional storm-dot hp (0.4) and 50 beside an amber rail (49.6). Fixed: floor + clamp-to-1 while hp > 0.
  - `[low]` `[patch]` ×8: band/pulse redraw signature now includes band color + pulse gate (no pulsing-phosphor window at 0.5/0.25); rudder re-latch after overlay close counts as an activation (`!keys.has` alone); multi-tab persistence merges per-pair max on write (no regression of another tab's progress); a pair fading while instruments were hidden seeds as already-faded (no replay at respawn); rudder tick + halo clamped inside the 110px track; vitals height 246→254 so the layout box truly contains the ASTERN caption (all four ratified layout pins re-verified); arrow keys no longer count toward the fade (labeled W/S/A/D only — tone and steering unchanged); stale `updateHpRail` doc comment corrected.
  - Rejected (noise): `vitalsLayout` computed 3× per frame (pre-existing pattern, trivial churn); hardcoded HULL header x-offset (safe for all current digit widths).

## Design Notes

- All contested design points were ruled by Eric this run (amendments 24–27); the anatomy source is the Eric-confirmed v2 composite (`_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/hud-composite-2.html:343-431,805-838`). Its `[ASSUMPTION]` tags are stale — DESIGN.md:231/EXPERIENCE.md:165 record the confirmation. Its white readouts and grey labels are superseded by amendments 24–25; its 3px rail by 27.
- The telegraph `updateTelegraph` signature-guard (`hud.ts:471`) only redraws on state change — the breathing pulse must live on a separately-animated alpha (mirroring how zone.ts animates per-frame), not force full redraws.
- `speedLadderFraction` is imported by `upgrades.test.ts` — keep its signature.
- The HP rail is the first vertical rail; Story 2.6's XP rail inherits the idiom (track alpha, glow, bottom-up fill) at 3px — leave a config comment saying so.
- "Successful input" defined: W/S = a `Telegraph.step()` that changed the detent (the existing changed-boolean); A/D = a rudder keydown activation that reached the sim (suppressed input never counts). Count per activation, not per held-frame.
- DESIGN.md:233's "AHEAD/ASTERN captions mono 9px" is superseded by amendment 15's lift (9→14). DESIGN.md/EXPERIENCE.md remain unedited per standing rule; typography doc-sync stays in the existing ledger entry.

## Auto Run Result

**Status:** done — implemented, Eric-ruled pre-implementation (amendments 24–27 via AskUserQuestion), adversarially reviewed (2 Fable hunters + Codex cross-model), 11 patches applied, gate green.

**Summary:** The own-vitals cluster is restyled in place to the ratified Afterimage register per the Eric-confirmed v2 composite. The horizontal HP bar (and its panel fill) is replaced by a vertical ~6px HP rail on the cluster body's right edge — dim phosphor track, bottom-up fill, threshold bands phosphor ≥50% / amber <50% / damageMarker <25%, `HULL n/n` header (floor, never 0 while alive), and an opacity-breathing pulse below 50% whose rate ramps 0.5→1.1 Hz (integrated phase — cap provably holds under continuous damage) and whose amplitude is motion-gated (off = steady base, information intact). HDG/KTS render 22px tabular phosphor in suffix form with dim-phosphor (~0.7) labels — no grey text anywhere in the cluster. Rudder: 110px hairline track, center detent, clamped amber tick. Telegraph: ordered marker is now a hollow phosphor rung outline vs the solid amber needle (shape-coded, never color alone). W/S and A/D key chips (drawer extracted to shared `render/keyChip.ts`, one family with the hotbar — pixel-identical there) sit at the gauge extremes and fade permanently after 3 successful LIVE-helm inputs per pair (labeled keys only, spectate/dead/arrow presses never count), persisted in a standalone `hullcracker.*` key that RESET SETTINGS leaves alone, with per-pair-max merge across tabs. The 1.1 Hz photosensitivity ceiling was promoted to one shared config token consumed by both the rail pulse and the storm vignette. Client-only; no wire change, PV unchanged, no version bump. Tests 1688 → 1754 (client 768 → 834).

**Files changed:** client — NEW render/keyChip.ts (shared key-chip drawer), render/helmGlyphs.ts (fade counters, sanitizer, merge-on-write persistence, live-helm predicate); config.ts (vitals group, shared pulseCapHz), render/hud.ts (cluster restyle + pure fns hullPulseHz/advancePulsePhase/hullFillAlpha/hullHeaderValue/railSig/rudderTickCenter, re-banded hpColor, rebuilt vitalsLayout, time-parameterized update), render/hotbar.ts (consumes shared drawer), render/zone.ts (shared ceiling), input/keyboard.ts (onRudder activation hook, labeled-key flag on onDetent), main.ts (conningLive gate, now-threading, counter wiring); tests — hud/motion/tokens suites extended (+66 net). Bookkeeping — sprint-status 2-4 done, gds-workflow-status advanced, amendments 24–27 recorded durably pre-implementation.

**Review breakdown:** 11 patches (2 high — pulse-phase strobe under sustained damage, spectate/dead input burning the glyph coach marks; 1 medium — `HULL 0/N` on a live sliver hull; 8 low), 0 deferred, 2 rejected, 0 intent gaps, 0 bad-spec loopbacks. Cross-model agreement: the spectate glyph-burn was flagged independently by both Fable hunters AND was Codex's sole finding; the pulse-phase strobe was found independently by both Fable hunters. Every behavioral patch carries a regression test shown to fail without the fix (both high fixes fail-without-fix validated).

**Verification:** `npm run check` run independently by the orchestrator after implementation AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 263 / server 657 / client 834 = 1754 green. Pulse-integrator and live-helm-gate diffs hand-reviewed.

**Residual risks / notes for Eric:** (1) No browser eyeball pass — the restyle is pinned by pure-logic tests only; the cluster (rail width, chip placement, label alphas) deserves your eyes, and W/S chips sit LEFT of the ladder (right side collided with rung labels — implementer judgment within the register). (2) A stray one-line `##### DEPRECATED #####` edit to root DESIGN.md appeared in the worktree from outside this story's work; it was reverted, not shipped — flagging in case you meant it to land somewhere. (3) The telegraph bell now shares the live-helm predicate with the fade counters, so it no longer rings on the brief pre-first-frame gap — deliberate unification, veto if you want the old edge back. (4) Arrow-key helm input steers but never fades the chips (they teach the labeled keys) — veto invited if you'd rather any successful steer count.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green
- `npm test -w client` -- expected: new hud pulse/glyph/band suites + re-pinned vitalsLayout/motion/tokens suites pass
