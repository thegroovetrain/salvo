---
title: 'Interstitial: the HUD glow is a real blur'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '6e3efd3c'
final_revision: 'PR pending (2026-10-11)'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** On the 0.18.37 bar Eric saw "extra white/yellow boxes around the main weapon icons": the three stacked outline rings Story 8.6 drew to approximate the mock's `box-shadow` glow read as hard boxes in Pixi.

**Approach:** Eric (2026-10-11): *"I don't want an emulated shadow glow... that glow should be pretty easy to do without it being janky right?"* Draw every lit square's halo as a filled ring on one Graphics layer under the squares and blur that layer once per frame with a Pixi `BlurFilter` — a true bloom in the skin's own color and alpha, outside the box like a shadow. The fit pulse rides the same layer. Cycle 173, 0.18.38, PV unchanged. Epic-9 amendment 39.

## Boundaries & Constraints

**Always:** the skin table's `glowPx` / `glowAlpha` (the mock's numbers), motion scaling, ACTIVE breath and the flat-flash rule are untouched; one filter over the bar per frame, never per square; the blur reach is a client feel knob (`CLIENT_CONFIG.hudBar.glowBlurPx`); tests assert the contract (one filled ring per lit square, a cut hole, no outline rings, no halo on zero-stock/empty), never pixels of the blur.

**Block If:** the glow would need a per-square filter, or a DESIGN.md glow VALUE would have to change.

**Never:** remove the glow outright (Eric's second message overrides his first); touch the DOM twins; pre-render in a browser that is not there — the bloom is judged on staging.

</intent-contract>

## Code Map

- `client/src/render/hotbar.ts` -- `glowGfx` + `BlurFilter` (constructor), `glowGfx.clear()` per frame, `drawGlow(square, skin)` ring + cut, `drawFitPulse(square)` on the same layer, `inflate` deleted, `GLOW_BLUR_QUALITY`, `FIT_PULSE_ALPHA`.
- `client/src/config.ts` -- `hudBar.glowBlurPx` 8.
- `client/src/__tests__/hotbar.test.ts` -- probe reads child 1 (squares) / child 0 (glow), `holes` captured from `cut()`; two bloom contract tests; the text-above-graphics pin reads "above both layers".
- Record: `VERSION`, `package.json` + lock, `CHANGELOG.md`, both trackers, epic-9 amendment 39 (+ `epic-9-context.md` mirror).

## Tasks & Acceptance

**Execution:**
- [x] `client/src/render/hotbar.ts` -- glow layer + blur, ring + cut, fit pulse -- the real bloom
- [x] `client/src/config.ts` -- `glowBlurPx` knob
- [x] `client/src/__tests__/hotbar.test.ts` -- probes re-pointed, bloom contracts
- [x] record files -- 0.18.38 / cycle 173 / amendment 39

**Acceptance Criteria:**
- Given a ready, selected or activated square, when the bar paints, then its halo is one filled ring on the blurred layer in the skin's border color at its glowAlpha with the square cut out, and no outline rings are stroked around it.
- Given a zero-stock or empty square, when the bar paints, then nothing is drawn for it on the glow layer.
- Given `npm run check`, then it is green.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 0
- addressed_findings:
  - none
- note: a two-file client render change landed off Eric's direct instruction; the gate is `npm run check`; no hunter pass was run (Eric's staging look is the review, amendment 37's precedent).

## Verification

**Commands:**
- `npm run check` -- expected: green (results in CHANGELOG / Auto Run Result)

## Auto Run Result

Status: done — PR pending to `development`; Eric judges the bloom on staging.
