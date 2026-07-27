---
title: 'Story 2.4: Own-Vitals Cluster & Telegraph Restyle'
type: 'feature'
created: '2026-07-27'
status: 'in-progress'
baseline_revision: 'cf2730e'
review_loop_iteration: 0
followup_review_recommended: false
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
- [ ] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- full gate green

**Acceptance Criteria:**
- Given the bottom-right cluster renders, then the HP rail climbs the body's right edge (~6px, threshold colors phosphor/amber/damageMarker at 50%/25%, `HULL n/n` header), the pulse breathes only below 50% ramping ~0.5→1.1 Hz hard-capped, and motion off/reduced holds/halves it with base fill intact.
- Given any HUD state, then ordered-vs-actual is shape-coded (hollow outline vs solid needle), HDG/KTS render 22px tabular phosphor with dim-phosphor suffixes, the rudder tick is amber on a 110px track, and no grey (`textMuted`/`textSecondary`) text and no filled panel appear anywhere in the cluster.
- Given a fresh player in the weapons-safe room, then W/S and A/D chips (shared key-chip family) sit at the gauge extremes; each pair fades permanently after its 3rd successful input, survives reload and RESET SETTINGS, and a corrupt key resets to visible without a throw.
- Given the hotbar after the key-chip extraction, then its rendering and pinned suites are unchanged.
- Given `npm run check`, then lint, type-checks, and all workspace tests pass; no color literals outside config.ts; 1366×768 stays overlap-free.

## Spec Change Log

## Review Triage Log

## Design Notes

- All contested design points were ruled by Eric this run (amendments 24–27); the anatomy source is the Eric-confirmed v2 composite (`_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/mockups/hud-composite-2.html:343-431,805-838`). Its `[ASSUMPTION]` tags are stale — DESIGN.md:231/EXPERIENCE.md:165 record the confirmation. Its white readouts and grey labels are superseded by amendments 24–25; its 3px rail by 27.
- The telegraph `updateTelegraph` signature-guard (`hud.ts:471`) only redraws on state change — the breathing pulse must live on a separately-animated alpha (mirroring how zone.ts animates per-frame), not force full redraws.
- `speedLadderFraction` is imported by `upgrades.test.ts` — keep its signature.
- The HP rail is the first vertical rail; Story 2.6's XP rail inherits the idiom (track alpha, glow, bottom-up fill) at 3px — leave a config comment saying so.
- "Successful input" defined: W/S = a `Telegraph.step()` that changed the detent (the existing changed-boolean); A/D = a rudder keydown activation that reached the sim (suppressed input never counts). Count per activation, not per held-frame.
- DESIGN.md:233's "AHEAD/ASTERN captions mono 9px" is superseded by amendment 15's lift (9→14). DESIGN.md/EXPERIENCE.md remain unedited per standing rule; typography doc-sync stays in the existing ledger entry.

## Verification

**Commands:**
- `npm run check` -- expected: lint + type-check + all workspace tests green
- `npm test -w client` -- expected: new hud pulse/glyph/band suites + re-pinned vitalsLayout/motion/tokens suites pass
