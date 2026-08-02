---
title: '3-2 Ring Reveal & Storm Rendering'
type: 'feature'
created: '2026-08-02'
status: 'in-review'
review_loop_iteration: 0
baseline_revision: '630045e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context-amendments.md'
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/EXPERIENCE.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** 3.1 shipped interim zone visuals that contradict the design contract: the current ring is a phosphor-GREEN "safe ring" (UX-DR5 requires the on-water edge at storm-readout violet — the #7B2FBE fill measures 2.87:1 and fails the 3:1 graphics threshold, so the edge must carry legibility), the storm is a 70u annulus band instead of a fill, every stroke is world-unit and thins to ~1px at 0.5× zoom, the in-storm vignette ignores the attention-priority tiers (no arbitration exists anywhere in code), and UX open question #7 (storm edge treatment) was still unresolved.

**Approach:** Replace the interim treatment with the Eric-ratified grammar (amendments 14–17): solid storm-readout current edge + dashed storm-readout next-ring telegraph (solid-vs-dashed = the non-color channel; green ring retired), full-area low-alpha storm fill, screen-locked (zoom-compensated) stroke widths across the shipped 0.5×–1.5× range, a minimal pure Tier-1→Tier-2 attention seam (vignette holds at lit keyframe while a threat channel is live), and a subtle motion-gated one-shot at the reveal beat. Promote zone render tunables into CLIENT_CONFIG; pin every pure mapping with tests; close the design gate with an in-run screenshot checkpoint with Eric before finalize. Client-render-only.

## Boundaries & Constraints

**Always:**
- Client-render-only: ZERO diffs under `shared/` or `server/`; no wire-contract change, no PROTOCOL_VERSION bump; the renderer consumes only what `zoneView`/schema already deliver (never imply unrevealed geometry — pre-reveal there is nothing to draw and nothing to leak).
- Amendment 14 grammar exactly: current ring = solid `stormReadout` stroke, screen-locked ~2px; next ring = dashed `stormReadout` at ~50% alpha; both violet; phosphor safe ring deleted.
- Amendment 15: full-area storm fill at low-alpha `storm` out past the map edge; fill alpha implementer-tuned so blips/contacts (they draw above `layers.zone` in chartRoot) stay legible; the EDGE carries the 3:1 contrast, never the fill.
- Zoom-invariant legibility: on-screen stroke px constant across camera zoom ∈ [0.5, 1.5] (divide world-space width by zoom at draw time; redraw on zoom delta past an epsilon); pinned by pure test at 0.5×/1.0×/1.5×.
- Accessibility floor: vignette breathes at ≤ `CLIENT_CONFIG.settings.pulseCapHz` (read from config, NEVER a literal — hud.test.ts pins one shared ceiling); reveal one-shot obeys the 80ms/≥300ms/≤3-flashes-per-region grammar; motion gates at the spawn site via the settings store (`off` = static base alpha, telegraph appears without flourish — information is never deleted); every state dual-coded (solid-vs-dash; vignette + "IN STORM" text).
- Amendment 16 seam: a pure attention helper computes Tier-1-active (low-HP HP-rail pulse OR live denied-fire pulse) → vignette holds steady at its LIT (max-alpha) keyframe; nothing else arbitrates.
- All new/promoted tunables live in a `CLIENT_CONFIG.zone` block; tests read config values instead of mirrored literals (retire zone.test.ts's BASE/AMP drift-mirror).
- Supply beat keeps ZERO render/HUD trace; the interim `zoneHud()` phase→countdown mapping in main.ts stays semantically unchanged (3.3 owns the chrome bar).
- Design-gate checkpoint (amendment-55 pattern): before finalize, capture screenshots (reveal beat + mid-close + in-storm, at 0.5×/1.0×/1.5× zoom) on a self-booted scratch-port stack and present to Eric via AskUserQuestion for the ring-legibility sign-off. Never touch ports 2567/5173 or any process this run didn't start.
- Epic-3 amendments 1–17 bind; complexity ≤ 10; `npm run check` green.

**Block If:**
- The design-gate checkpoint cannot reach Eric, or Eric rejects the rendered grammar — do not self-modify ratified amendments 14–17.
- Any change under `shared/` or `server/` appears necessary to satisfy an AC.
- The screenshot harness proves structurally impossible (no headless render path) — fall back to surfacing the gate with test evidence + a described render, and let Eric rule; do not silently skip the gate.

**Never:**
- No chrome bar / top-center countdown redesign (3.3); no endgame-constraint evidence (3.4); no supply-drop surface of any kind; no audio cues (OQ#8 — `stormWarn` stays as-is); no generalized three-tier arbitration or economy-tier freeze (4-8); no retrofit of DESIGN.md's non-scaling-1px rule onto blips (out of scope — note it for the ledger if observed); no design-doc edits (stale DESIGN.md purple-exclusivity text routes to the gated doc-sync batch, not this PR).
- One PR; never split.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-reveal | phase clear/supply, next=null | solid current edge + full fill only; no telegraph anywhere | No error |
| Reveal beat | phase reveal, next≠null (rising edge) | dashed telegraph appears + one 80ms flash-then-settle one-shot (motion-gated) | No error |
| Closing | phase closing, cur interpolating | solid edge + fill track the interpolated ring; redraw throttled by epsilon | No error |
| In storm | own pos strictly outside live ring | vignette breathes at cap; "IN STORM" visible; fill visible around own hull | No error |
| Tier-1 while in storm | hp below HP-rail pulse threshold OR denied pulse live | vignette holds lit keyframe (steady max alpha), resumes breathing when clear | No error |
| Motion off | settings.motion='off' | vignette static at base alpha; no one-shot; rings render static and fully readable | No error |
| Zoom extremes | userZoom 0.5 / 1.5 | identical on-screen stroke px; edges legible vs fog/blips at both | No error |
| Closed | phase closed | terminal ring solid edge + fill hold; no telegraph | No error |
| Idle / degenerate | phase idle; r=0 sentinel rings | nothing drawn / fail-safe exactly as today; no NaN alpha or width | Guarded |

</intent-contract>

## Code Map

- `client/src/render/zone.ts` — the core rewrite: solid current edge, dashed next, full-area fill (replaces `STORM_BAND` annulus + `SAFE_RING` phosphor), zoom-compensated stroke widths (new zoom param), reveal one-shot state, vignette hold-at-lit input; `vignetteAlpha` stays pure/exported.
- `client/src/render/attention.ts` — NEW pure module: `tier1Active(...)` predicate + vignette hold semantics (first consumer of the EXPERIENCE.md tier table); zero Pixi imports.
- `client/src/config.ts` — new `CLIENT_CONFIG.zone` block: fill alpha, edge/telegraph stroke px + alpha, dash count/duty, redraw epsilon, vignette base/amp, reveal one-shot ms/intensity (promote zone.ts bare consts; JSDoc each with story/amendment).
- `client/src/main.ts` — pass camera zoom + tier-1 state into `g.zone.update(...)`; reveal rising-edge detection for the one-shot; `zoneHud()` untouched semantically.
- `client/src/render/hud.ts` — export a pure "HP-rail pulse active" predicate for attention.ts (extract from the existing `hullPulseHz` path; no visual change to the rail); "IN STORM" line unchanged.
- `client/src/render/deniedFire.ts` — expose a pure "denied pulse live at t" predicate for attention.ts.
- `client/src/render/textures.ts` — `bakeVignetteTexture` only if the lit-keyframe hold needs a bake change (expect: no change).
- `client/src/render/stage.ts` — fix the stale "red vignette" comment (line ~55); NO layer-order changes (zone stays chartRoot child #2 — fog-immunity and blips-above are structural facts to pin, not build).
- `client/src/__tests__/zone.test.ts` — extend: grammar (solid/dash roles), zoom-locked px, fill extent, one-shot timing/motion gating, config-driven (drift-mirror retired); `client/src/__tests__/attention.test.ts` — NEW; `hud.test.ts` — re-pin shared pulse ceiling + predicate extraction.
- `server/scripts/` screenshot rig (dev-only, scratch ports, HC_DEV_OPTIONS=1) — only if a throwaway helper is needed for the checkpoint; delete or clearly mark dev-only before finalize.
- `VERSION` + root `package.json` — 0.17.32 (cycle 32, amendment 13); `sprint-status.yaml` + `gds-workflow-status.yaml` + CLAUDE.md zone-render line ride the PR at finalize.

## Tasks & Acceptance

**Execution:**
- [x] `client/src/config.ts` — add `CLIENT_CONFIG.zone` block; promote zone render consts — single tunable home, config-read tests.
- [x] `client/src/render/zone.ts` — implement amendment 14/15/17 visuals + zoom-locked strokes + vignette hold input — the story's core. (hud.ts untouched: its pure `railPulsing()` already existed — the ruling's "owning-module predicate" verbatim.)
- [x] `client/src/render/attention.ts` + `deniedFire.ts` predicate — amendment 16 minimal seam — pure, testable, 4-8-extensible.
- [x] `client/src/main.ts` — wire zoom, tier-1 state, reveal rising edge (`updateZone`/`ownTier1`) — the only integration point.
- [x] `client/src/__tests__/{zone,attention,hud}.test.ts` — grammar, zoom px @ 0.5/1.0/1.5, fill, one-shot grammar + no-retrigger, hold semantics, motion=off statics, all I/O matrix rows — client 1203→1248 (+45).
- [x] Screenshot checkpoint — 8 live captures (clear/reveal/mid-close/in-storm × 0.5/1.0/1.5×) on scratch stack (:2599/:4199, torn down); design-gate artifact published; Eric RATIFIED as captured (amendment 18); rig script deleted.
- [x] Docs/bookkeeping — VERSION 0.17.33 + package.json (cycle 33 — the in-spec 0.17.32 was taken mid-run by the join-window interstitial, PR #78), CLAUDE.md storm-rendering bullet + render-list attention entry, sprint-status 3-2 done, gds-workflow-status next_expected → create-story 3-3, tier-table doc-drift ledger entry, stage.ts comment fix — all in the PR.

**Acceptance Criteria:**
- Given the reveal beat, when the next ring appears, then it renders dashed `stormReadout` distinct from the solid `stormReadout` current edge, both above the fog composite (chart layer) and legible at every zoom in [0.5, 1.5].
- Given any live phase, when the zone renders, then the storm region outside the live ring is a full-area low-alpha `storm` fill (no open water beyond a band) and blips/contacts/sweep draw above it unoccluded.
- Given in-storm with no Tier-1 channel active, when frames render, then the vignette breathes at the config pulse cap; given a live Tier-1 channel, it holds steady at the lit keyframe until the channel clears.
- Given motion=off, when any 3.2 treatment triggers, then all information renders statically (base-alpha vignette, flourish-free telegraph) — nothing disappears.
- Given the supply beat, when it runs, then no render/HUD trace distinguishes it from clear seas.
- Given the finished rendering, when the screenshot checkpoint runs, then Eric ratifies ring-edge legibility (current vs next vs fog vs blips, at 0.5×/1.0×/1.5×) before finalize.
- Given `git diff` against baseline, when the PR is assembled, then no file under `shared/` or `server/src/` changes (scripts-only exception for the dev-only screenshot rig if used).

## Spec Change Log

## Review Triage Log

### 2026-08-02 — Review pass (2 Fable hunters + Codex cross-model; verdicts: build-on-it ×2, Codex fix-first on the fill bound — resolved by patching)
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 0, medium 2, low 2)
- defer: 0
- reject: 2: (low 2)
- addressed_findings:
  - `[medium]` `[patch]` Storm-fill containment bound fails on short-wide viewports and unclamped spectate free-pan (ALL THREE reviewers; Codex arithmetic: 3440×720 @ min zoom + maxed radar needs ~17.8k u vs 16.8k drawn) — `fillOuterRadius` made dynamic and exact (camera↔ring distance + half-diagonal/zoom + margin, bucketed grow-only at 2000u steps, factor-7×mapRadius floor kept; degenerate camera → floor); containment test rewritten to the dynamic guarantee incl. ultrawide, far-panned spectator (to 5M u), and the TRUE max radar stack 1.15⁵ (the old ×2 premise undershot it — Blind Hunter). Fail-proven (16800 < 17563 before fix).
  - `[medium]` `[patch]` In-storm denied-click spam square-waved the full-screen vignette up to 3.3 discontinuous flashes/s via the 80ms Tier-1 hold (Blind Hunter traced; Codex independently found the one-frame clock desync half — two `performance.now()` samples per frame) — one shared frame timestamp threaded through renderFiring/ownTier1/updateZone/updateHotbar, and the hold became a 240ms-τ eased BLEND between the two pure `vignetteAlpha` endpoints (an 80ms blip now moves <35% of the hold delta; sustained hold converges lit; breathing amplitude untouched at hold 0; no-op at motion=off). Amendment 16's hold semantics preserved; the ratified photosensitivity floor is the superior law — reconciliation documented in-code. Fail-proven + click-spam regression test over the real DeniedPulse.
  - `[low]` `[patch]` RevealOneShot's latched amplitude let ≤80ms of flash continue after motion→off mid-envelope (Edge Case Hunter) — returned flash clamped to `min(firedAmp, current amp)`; fail-proven.
  - `[low]` `[patch]` `dashSpans` had no degenerate-config guard (segments ≤0/fractional → invisible telegraph; duty ≥1 → solid circle = grammar-channel collapse) (Edge Case Hunter) — segments floored ≥1, duty clamped [0.05, 0.95]; fail-proven.
- reject: finalize-bookkeeping-missing-at-HEAD observation (the spec's own planned sequencing, not a defect); codex CLI internal cache-TTL log noise.

## Design Notes

- **Ratified grammar (amendments 14–17):** solid current / dashed next, both `stormReadout` (#B06EE8); full-area `storm` (#7B2FBE) fill; minimal Tier-1→vignette hold; subtle reveal one-shot. The treatment CHOICE is closed; the on-sight legibility sign-off happens at the in-run screenshot checkpoint.
- **Zoom compensation sketch:** stroke world-width = desiredPx / cameraZoom, recomputed when zoom changes beyond epsilon (zone.ts already throttles redraws by radius delta — extend the throttle key with zoom). This is the codebase's first screen-locked stroke; keep it local to zone.ts (no shared helper until a second consumer exists — blips retrofit is 4.x scope).
- **Fill implementation sketch:** one Graphics path — outer circle at (map radius × ~1.5, beyond any visible corner at min zoom) minus inner live-ring hole (even-odd fill), centered per live ring; position-only updates between redraws, exactly like today's annulus.
- **Tier-1 predicate definition (amendment 16):** `hpFraction < hud's existing low-HP pulse threshold` OR `deniedFire pulse live at now` — extracted as pure exports from their owning modules so attention.ts stays dependency-light and 4-8 can add channels without rework.
- **Reveal one-shot:** rising edge = `next` transitions null→non-null on the client view (this is latency-honest — it fires when the client learns, which is the reveal's meaning); one bright-alpha flash decaying to settle inside 80ms envelope; suppressed entirely at motion=off; never re-fires for the same group (stale-boundary guard re-derivations must not retrigger it).
- **Checkpoint rig:** `npm run build`, boot server from `server/` with `HC_DEV_OPTIONS=1 PORT=<scratch>`, serve `client/dist` on a scratch port (e.g. `npx vite preview`), drive with the gstack browse skill using `zoneOverride` (dev-gated) to reach reveal/closing/in-storm fast; kill everything booted; screenshots attached to the AskUserQuestion.

## Verification

**Commands:**
- `npm run check` — expected: lint + type-check + full suite green (client test count grows; no complexity errors).
- `git diff --stat 630045e -- shared/ server/src/` — expected: empty (client-render-only pin).
- Screenshot checkpoint per Design Notes — expected: images captured at 3 zooms × 3 states; Eric sign-off recorded before finalize.

**Manual checks (if no CLI):**
- Worktree diff contains no unrelated files (Eric's HULLCRACKER_NOTES.md untouched); supply beat greps to zero client-visible strings; no `pulseCapHz` literal duplicated.

## Auto Run Result

**Status:** done. **Branch:** worktree-dev-auto-3-2-ring-reveal-storm-rendering (final_revision in frontmatter).

**Summary.** The storm now wears its ratified face. Four pre-implementation Eric rulings (amendments 14–17) settled the grammar — SOLID storm-readout live edge / DASHED storm-readout telegraph (solid-vs-dashed is the non-color channel; the 3.1 phosphor safe ring retired), full-area low-alpha fill, a minimal Tier-1→Tier-2 attention seam, and a subtle motion-gated reveal one-shot — and the implementation shipped them with screen-locked ~2px strokes across the whole 0.5×–1.5× zoom range (the codebase's first zoom-compensated stroke). The design gate the AC assigns to Eric was closed IN-RUN: 8 live captures from the built client on a self-booted scratch stack (production timeline, no dev overrides — clear/reveal/mid-close/in-storm at 3 zooms, including a real storm death, "LOST WITH ALL HANDS") were published as a review artifact and Eric ratified verbatim: "Ratified — ship it" (amendment 18; UX open question #7 resolved). Client-render-only: zero shared/server diffs, no PV change (main's mid-run PV 19 join-window landing merged cleanly).

**Files changed (grouped).** client render: zone.ts (rewrite: fill-with-cut-hole, solid edge, dashed telegraph, screen-locked strokes, RevealOneShot, eased vignette hold, dynamic fill bound), NEW attention.ts (tier1Active/holdAtLitKeyframe over hud.railPulsing + deniedFire liveness), deniedFire.ts (pure pulseLiveAt/liveAt read-only query), stage.ts (stale comment); wiring: main.ts (ZoneFrame with camera center/zoom/mapRadius, ownTier1, single shared per-frame timestamp threaded through renderFiring/ownTier1/updateZone/updateHotbar); config.ts (CLIENT_CONFIG.zone: fillAlpha 0.12, edgePx/telegraphPx 2, edgeAlpha 0.9, telegraphAlpha 0.5, 48 dashes @ 50% duty, redrawEpsU 1 + redrawZoomFrac 0.02, vignette 0.27+0.17, reveal 80ms/300ms/0.4, holdEaseMs 240, fillOuterFactor 7 floor + fillBucketU 2000 + fillMarginPx 96); tests: zone.test.ts (10→51), NEW attention.test.ts (11), hud.test.ts re-pins; artifacts: amendments 14–18, deferred-work tier-table doc-drift entry, sprint-status (3-2 done), gds-workflow-status (→ create-story 3-3), CLAUDE.md (3.2 bullet + render list), VERSION/package.json 0.17.33.

**Review findings breakdown.** 2 Fable hunters + Codex cross-model. 4 patches applied, ALL fail-proven with regression tests: 2 medium — the storm-fill containment bound (flagged by ALL THREE reviewers; Codex's arithmetic confirmed a 3440×720 viewport outruns the constant bound, and unclamped spectate pan outruns any constant → replaced with an exact dynamic camera-geometry bound, bucketed grow-only) and the vignette-hold strobe (Blind Hunter traced in-storm denied-click spam to a 3.3 flashes/s full-screen square wave — above the story's own photosensitivity floor; Codex independently caught the one-frame double-clock desync → one shared frame timestamp + a 240ms eased hold blend that preserves amendment 16's semantics under the superior ratified floor). 2 low — reveal-flash amp clamp on mid-envelope motion→off; dashSpans degenerate-config guard. 0 intent gaps, 0 bad-spec, 0 defers from review (one implementer-flagged doc drift ledgered), 2 rejects. Verdicts: build-on-it ×2; Codex's fix-first was satisfied by patching its finding. followup_review_recommended: retired category (Epic 2 retro Ruling 1).

**Verification.** `npm run check` green at every wave; final merged tree (origin/main a890682 merged, zero conflicts, shared rebuilt): 2455 tests — 379 shared / 816 server / 1260 client, lint 0 errors. Scope pin `git diff baseline -- shared/ server/src/` empty throughout. Design gate: 8 screenshots reviewed and ratified by Eric (artifact c519d77a). Screenshot rig (scratch ports 2599/4199) fully torn down; rig script deleted.

**Residual risks.** The vignette-hold easing constant (240ms) and fill bucket (2000u) are implementer-drafted feel values inside ratified envelopes — Eric's live-play eye remains the acceptance mechanism of record. The tier seam covers exactly the two shipped Tier-1 channels; Story 4-8 owns generalization (economy tier, listening-ring channel). EXPERIENCE.md's "<25%" tier-table wording vs the shipped 50% rail threshold is ledgered for the doc-sync batch. The 3.1 interim HUD countdown register is untouched by design — Story 3-3's chrome bar replaces it (handoff note written into gds-workflow-status).
