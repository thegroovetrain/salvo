---
title: 'Story 4.8 — Attention Priority & the Readability Gate'
type: 'feature'
created: '2026-08-11'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/bmad-dev-auto-result-4-8-attention-priority-questions.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Epic 4's closing guardrail — *information noise must never bury the hunt* — has no
mechanism. 31 animated channels ship; exactly 2 are wired to the attention seam, 0 Tier-3 channels
are implemented, and the ratified aggregate photosensitivity floor (*no element or screen region
flashes >3×/s regardless of how many compliant events stack*) has never existed in code.

**Approach:** Generalize the existing Tier-1→Tier-2 seam into the full three-tier arbitration over
HUD chrome (amendment 241), add one shared client flash-budget module that every one-shot flash site
calls — coalescing co-located same-kind flashes, then degrading over-budget flashes to a flat
non-flashing mark rather than deleting them (amendment 240) — and produce the staged worst-case
readability capture as a reviewable artifact (amendment 242).

## Boundaries & Constraints

**Always:**
- Tier-1 HP is the CRIMSON band (`frac < criticalBelow`, 25%) per amendment 239. `railPulsing`
  (50%) is UNTOUCHED — the rail's display grammar does not move; only when it claims the threat
  tier changes.
- `attention.ts` stays PURE and composes predicates their owning modules export. A new tier input is
  one more input, never a second threshold declared in the seam (amendment 16).
- The budget DEGRADES, never deletes. A degraded flash keeps presence, position and weight; only the
  luminance RAMP is spent. Information channels (`muzzle`, `spark`, `splash`, hull hit flash) must
  remain visible at full stack.
- Client-only. No `shared/` CONFIG change, no wire change, no server change, `PROTOCOL_VERSION`
  stays 33. New tunables live in `client/src/config.ts` (`CLIENT_CONFIG`).
- Reuse existing floors — `pulseCapHz`, the 300 ms same-source floor, the 80 ms pulse — rather than
  inventing siblings (amendment 37's standing rule).
- Complexity ≤ 10 per function (ESLint enforced).

**Block If:**
- The budget's degrade path cannot be made to preserve a channel's information for any site (that is
  a design ruling, not an implementation choice).
- Tier assignment appears to require a channel not named in EXPERIENCE.md's table — record it in the
  channel ledger as untiered and report; do not invent a tier membership.
- The staged scene requires a server/wire change to build.

**Never:**
- No tier assignment for on-water world effects (amendment 241) — they answer to the budget only.
- No edits to DESIGN.md / EXPERIENCE.md / epics.md; the seven disagreements (amendment 243) are
  reported for the Eric-gated 7-5 batch, not fixed here.
- No new animated channel is introduced by this story. The kill-leader glow stays static
  (amendment 224). The Bounty Bloom is not a channel (amendment 216).
- No re-tuning of any shipped channel's rate, amplitude or duration; this story arbitrates existing
  channels, it does not restyle them.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Healthy hull, no threat | `hpFrac 0.8`, no denied pulse | `tier1Active` false; Tier 2 breathes; Tier 3 breathes | No error expected |
| Amber rail, no threat | `hpFrac 0.4` | `tier1Active` FALSE (amber is not threat); rail still breathes (`railPulsing` true) | No error expected |
| Crimson rail | `hpFrac 0.2` | `tier1Active` true; Tier 2 holds LIT; Tier 3 freezes DIM | No error expected |
| Exact band edges | `hpFrac` exactly 0.25 / 0.5 | 0.25 is NOT critical (exclusive lower bound, matches `hpColor`); 0.5 is not pulsing | No error expected |
| No own hull | `hpFrac null` (spectate / respawn gap) | `tier1Active` false — NULL IS NOT ZERO; nothing pins lit | Guard `null` + non-finite |
| Denied pulse on a slot | hotbar slot denied live, hull healthy | `tier1Active` true — all denied pulses are Tier 1, not just the on-water one | No error expected |
| Amber corollary | ring urgent AND rail amber, both would pulse | Ring pulses; amber rail holds at LIT | No error expected |
| Tier 3 under Tier 2 alone | in-storm, hull healthy | Chip freezes at DIM (literal reading of "any higher tier", amendment 243) | No error expected |
| Budget under threshold | 2 muzzle flashes in a region in 1 s | Both animate normally | No error expected |
| Budget binds | 12 muzzle flashes in one region in 1 s | First 3 animate; rest render as flat non-flashing marks, still visible at true position | No error expected |
| Coalescing | 3 same-kind flashes at one point in one frame | One draw; budget charged once | No error expected |
| Budget + motion:off | `motion: 'off'`, heavy stack | Already-static channels unchanged; budget never makes anything MORE visible | No error expected |
| Clock jump / tab restore | large `nowMs` gap | Stale timestamps expire; no burst of degrades on resume | Prune window by timestamp, not by count |

</intent-contract>

## Code Map

- `client/src/render/attention.ts` -- the seam being generalized; today exports `Tier1Input`,
  `tier1Active`, `holdAtLitKeyframe` (the last is an orphan — tests only).
- `client/src/render/hud.ts` -- owns `railPulsing` (50%, UNTOUCHED) and `hpColor`; needs a
  `railCritical` sibling (25%) so the seam still composes an owner-exported predicate. Also draws
  the chrome-bar ring row (`breatheRing`) and the HP rail.
- `client/src/render/zone.ts` -- Tier-2 consumer #1 (storm vignette, `easeHold` 240 ms).
- `client/src/ui/chromeBar.ts` -- pure composer for the ring segment; `ringSegmentAlpha`,
  `advanceRingPhase`, urgency flag.
- `client/src/render/xpRail.ts` -- the one real Tier-3 channel (bank-chip breath, `chipAlpha`).
- `client/src/render/deniedFire.ts` -- `DeniedPulse` (80 ms / 300 ms floor) and `liveAt`; the
  per-slot instances live in `client/src/main.ts`.
- `client/src/render/effects.ts` -- world one-shot flashes (`SPECS`, `isJuiceEffect`, spawn + age).
- `client/src/render/ships.ts` -- 130 ms hull hit flash, per hull.
- `client/src/render/foghorn.ts`, `client/src/ui/upgradeMenu.ts` -- element-scoped one-shots.
- `client/src/main.ts` -- the single per-frame tier read (`ownTier1`) and every pulse instance.
- `client/src/config.ts` -- `CLIENT_CONFIG`; new `attention` + `flashBudget` blocks.
- `client/src/settings/store.ts` -- `motionIntensity` / `motionScaled` / `motionAllowed`.

## Tasks & Acceptance

**Execution:**
- [ ] `client/src/render/hud.ts` -- add pure `railCritical(frac): boolean` (`frac < V.criticalBelow`)
  beside `railPulsing`, documented as the Tier-1 gate; leave `railPulsing`, `hpColor`, `railSig` and
  the pulse envelope byte-identical -- so the threat threshold has ONE source in the rail's own module.
- [ ] `client/src/render/attention.ts` -- generalize to the three-tier seam: `Tier1Input` gains the
  slot-denied inputs; add `tier2Active`, `freezeAtDimKeyframe`, and the amber-corollary resolver
  (`amberPulseWinner`); `tier1Active`'s HP clause moves to `railCritical`. Keep the module pure, no
  clock, no Pixi -- it is the one place the tier table's rules are named.
- [ ] `client/src/render/flashBudget.ts` -- NEW. Pure, clock-injected: per-key sliding-window
  counter (`claimFlash(key, nowMs) -> 'animate' | 'degrade'`) plus a per-frame coalescer keyed by
  (kind, quantized position). Region keys from a viewport grid; element keys are named constants.
  Prune by timestamp so a tab restore cannot burst-degrade.
- [ ] `client/src/config.ts` -- add `CLIENT_CONFIG.attention` (tier documentation + amber rank) and
  `CLIENT_CONFIG.flashBudget` (`regionCols`, `regionRows`, `maxPerSecond: 3`, `windowMs: 1000`,
  `degradeAlphaFactor`, coalesce quantum). Document each against its ratified source.
- [ ] `client/src/render/effects.ts` -- route one-shot spawns through the budget; a degraded effect
  draws a FLAT alpha for its full life instead of the peak→fade ramp (mark survives, flash does not).
- [ ] `client/src/render/ships.ts` -- route the 130 ms hull hit flash through the budget per hull region.
- [ ] `client/src/render/deniedFire.ts` + `client/src/main.ts` -- feed ALL denied pulses (on-water +
  per-slot) into `Tier1Input`; route element-scoped one-shots through the budget.
- [ ] `client/src/render/zone.ts`, `client/src/render/hud.ts` -- replace the two inline
  `tier1 ? 1 : 0` sites with `holdAtLitKeyframe`, and apply the amber corollary to the ring segment.
- [ ] `client/src/render/xpRail.ts` -- Tier-3 freeze at the DIM keyframe under any higher tier;
  preserve the existing 10 s decay-to-static.
- [ ] `client/src/render/foghorn.ts`, `client/src/ui/upgradeMenu.ts` -- element-scoped budget claims.
- [ ] `client/src/__tests__/` -- unit-test the I/O matrix: band edges, null-hull, amber corollary,
  Tier-3-under-Tier-2, budget threshold/coalescing/window-pruning, and a degrade-preserves-presence test.
- [ ] Staged worst-case scene + capture -- dev-only staging that populates the render state with the
  worst case (multiple contacts, torpedoes inbound, storm closing, kill leader active, own hull
  critical, heavy flash stack), captured at both zoom extremes, with measured per-frame cost.
- [ ] `_bmad-output/implementation-artifacts/readability-gate-2026-08-11.md` -- NEW. The documented
  squint test: the captures, the channel ledger (all 31 with tier/budget disposition), the measured
  frame cost against the 16.6 ms budget, and the verdict.
- [ ] Bookkeeping -- `VERSION` + `package.json` to 0.17.75; `sprint-status.yaml` and
  `gds-workflow-status.yaml` one-line stamps; `deferred-work.md` (close the 25/50 drift entry as a
  misdiagnosis per amendment 239, close the aggregate-budget entry, record the 7-5 doc drift).

**Acceptance Criteria:**
- Given a hull at 30% with no other threat, when the frame renders, then Tier 1 is INACTIVE, the
  storm vignette breathes, and the rail still breathes — proving the rail's grammar did not move.
- Given a hull at 20%, when the frame renders, then Tier 1 is active, both Tier-2 channels hold at
  their lit keyframe, and the Tier-3 chip holds at its dim keyframe.
- Given `motion: 'off'` at any tier state, then every channel's presence, position and weight are
  unchanged from the motion:'full' static keyframes — no information is lost at any setting.
- Given 20 hulls flashing inside one screen region for 3 s, when the budget binds, then no region
  exceeds 3 flash onsets/s AND every flash's mark is still drawn at its true position.
- Given the staged worst-case scene, when captured at both zoom extremes, then the artifact records
  threat channels reading first and the frame cost against sim ≤ 3 ms / render ≤ 10 ms / headroom ≥ 3.6 ms.
- Given `npm run check`, then lint, type-check and all tests pass with no complexity violations.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the tier table's members are fixed, not extended.** Tier membership comes from
EXPERIENCE.md:88-96 verbatim. The one non-obvious inclusion: the table says *"denied pulses"*
plural, so the per-slot hotbar denied pulses are Tier 1 alongside the on-water one — today only the
on-water pulse feeds the seam, which is a shipped gap this story closes. Of the three named Tier-3
channels, only the bank-chip actually breathes; toasts fade on TTL and the XP wrap does not animate,
so they are recorded in the ledger as having nothing to freeze rather than given invented animation.

**The amber corollary needs a rank, and this is the one place this story picks a number.** Two amber
channels can be simultaneously active: the ring's final-10s pulse (Tier 2) and the rail's amber band
(25-50%, untiered by amendment 239). The corollary says only the highest-tier active amber pulses,
so the ring wins and the amber rail holds lit. Read as design: at 40% hull with the storm closing in
8 s, the storm is what kills you. When the rail drops below 25% it turns crimson — it is no longer an
amber channel at all, it becomes Tier 1, and both ambers hold lit under it. Amber therefore keeps
meaning "look here" at the climax, which is the corollary's stated purpose.

**Degrade = flat, not gone.** A flash is a rapid luminance CHANGE. Drawing an over-budget effect at a
constant alpha for its normal life removes the change while keeping the mark, so a muzzle flash at
full stack still tells you where the shot came from. This is why the budget can bind on declared
information without violating *removes MOTION, never INFORMATION*.

```ts
// effects.ts, degraded draw — same life, same position, no ramp
const k = age / spec.life;
gfx.alpha = degraded ? peak * FB.degradeAlphaFactor : peak * (1 - k);
```

**Breathing channels are exempt from the budget by construction** — every one is capped at
`pulseCapHz` (1.1 Hz) or below, well under 3 flashes/s. The budget governs one-shots. State this in
the ledger so a later reader does not "fix" the omission.

## Verification

**Commands:**
- `npm run lint` -- expected: clean, no complexity errors
- `npm run check` -- expected: lint + type-check (shared/server/client) + all tests pass
- `npm test -w client` -- expected: new attention/flashBudget suites pass

**Manual checks:**
- The staged capture artifact exists, shows both zoom extremes, and records measured frame cost.
- `git diff` touches no `shared/` gameplay CONFIG and no `server/` file; `PROTOCOL_VERSION` unchanged.
