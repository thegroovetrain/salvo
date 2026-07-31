---
title: 'Story 2.9: The Build Must Be Felt'
type: 'feature'
created: '2026-07-31'
status: 'done'
baseline_revision: '836b5ef'
final_revision: '066f15d'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** 2.8 shipped the deck economy's mechanics without identity: the client is doctrine-blind (zero render code reads any `stats.<weapon>.mode`), self-propelled mines render frozen at their drop point, the hotbar tooltip renders accrued boons as ABSENCE, every one of the 42 catalog lines lands with the same generic two-note tone + toast, and fouled/dazzled victims get no tell. FR22: a presentation-silent boon is a defect.

**Approach:** A presentation-only pass (one deliberate wire change): tiered fit feedback (category-varied tones + slot fit flash), the tooltip accrued-boon list + `◆n` quick-info compression, the ratified eighth ACTIVE hotbar state (amendment 48), per-doctrine on-water identity for all 8 doctrines (fixing the frozen-mine renderer), victim SLOWED/DAZZLED tells, doctrine-distinct lit zones via a new zone-mode wire field (amendment 50, PV 16→17), the cannon-reads-heavier own-side feel fix (ratified tester feedback, brainstorm doc), and a structural fit-check test walking the catalog so no line can ship silent.

## Boundaries & Constraints

**Always:**

- **Rulings bind:** amendments 48–52 (recorded this run) — 8th ACTIVE state with breathing outline + countdown; EXCLUSIVE keeps storm purple (NO recolor — status quo is now ratified); zones doctrine-distinct to everyone; hull visuals slot-side only; dazzle stays optics-only.
- **Audio discipline:** new tones are procedural specs in `TONES` (≤150 ms — test-enforced; added to the `ToneId` union AND the exhaustiveness test), played only through the existing bus graph (mute/master/effects/mono all apply). Every audio cue gets a visual twin, pinned by a new in-code audio↔visual twin table + test (the EXPERIENCE.md two-column-table requirement, satisfied in code — no doc edits). Fit cues vary by category and weight by tier (common < rare/exclusive) — specs are implementer-drafted placeholders (draft-copy rule).
- **Juice discipline:** breathing surfaces read `CLIENT_CONFIG.settings.pulseCapHz` (never a literal) with integrated phase (hud.ts precedent); one-shots use the 80 ms/300 ms grammar (reuse the `DeniedPulse` primitive); ≤3 flashes/s per region; motion gates at the SPAWN site per existing convention (`motionAllowed`/`motionIntensity`/`isJuiceEffect`); reduced halves intensity, never duration; fit/economy feedback is Tier-3 attention (follows existing patterns, never competes with threat channels). Dual-coding throughout: SLOWED/DAZZLED/ACTIVE are shape+text, never color alone.
- **Color registers:** no new reds (denied red stays unique); burn/damage feedback stays in the desaturated-crimson family; phosphor = HUD; amber untouched; storm purple only for storm + the amendment-49 EXCLUSIVE carve-out.
- **Container-fit law (amendment 47):** every new line (tooltip rows, quick-info `◆n`/countdown, HUD tells) fits its box; extend computable fit pins (tooltip panel height is dynamic — pin list growth; hotbar quick-info width budget); `refitCardFit` untouched (no card copy changes).
- **Wire discipline:** the ONLY wire change is the zone view's mode field (`standard`/`incendiary`/`dazzle`) + PV 16→17 + changelog; perception/goldenFrames/spectator invariants extend to it. `BallisticEvent`/`torpU` shape stays constant-free; `boons`/`slowedUntil`/`dazzledUntil` stay self-private on `you`. Enemy-side doctrine identity comes ONLY from legal inference: pierce booms' derived `#pN` ids, torpU-updated tracks render as steering, creeping `MineView` positions animate (frozen-renderer defect fix), zone mode per amendment 50. Own-side identity keys off `g.ownStats.<weapon>.mode` via `applyOwnStats` — the established chokepoint.
- **No sim behavior changes.** Server work = carrying the star shell's doctrine mode onto the zone record/view; everything else is client render/audio/UI. Prediction untouched.
- Cross-cutting: complexity ≤ 10; shared pure; seeded RNG only; single keydown chokepoint untouched; `npm run check` green; no VERSION bump; all new copy (SLOWED/DAZZLED, tone character, effect looks) implementer-drafted under the draft-copy rule.

**Block If:**
- Any presentation need requires enemy build/boon info on the wire beyond amendment 50's zone mode.
- The ACTIVE state or any new juice cannot be expressed inside the pulse caps / flash budget.
- Any NEW design decision beyond amendments 48–52 surfaces (new states, new registers, mechanics tweaks) — Eric's call.

**Never:**
- No hull sprite changes (amendment 51). No dazzle radar suppression (amendment 52). No mechanics/balance changes (damage, speeds, ranges, timings). No sound files (WebAudio synthesis only). No new toast types (existing toast rules stand). No spectate surfaces. No design-doc edits (amendment 49's carve-out is doc-synced separately). No batch-sim work (2.10). No per-boon card art. No smoke screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Common fit | `bn` for HEAVY SHELLS II | category fit tone + slot fit flash (80/300) + toast `◆ HEAVY SHELLS II FITTED` + tooltip row appears immediately | — |
| Rare/exclusive fit | `bn` for TWIN MOUNT / a doctrine | weightier tier cue, same channels; doctrine fit also updates slot identity | — |
| Tooltip | 3 accrued gun boons | full `◆ Name` + effect line list; quick-info shows `◆3`; panel fits (container-fit pin) | — |
| Boost active | ability fires, `you.boostUntil` future | slot enters ACTIVE: phosphor breathing outline (≥2 s cycle) + countdown seconds in quick-info; ends at expiry | motion=off: outline static, countdown stays |
| Decoy active | own decoy `until` in future | same ACTIVE grammar on the decoy slot (latest `until` wins) | — |
| AP pierce | boom id `<id>#p2` observed | pierce-styled impact distinct from terminal boom, any legit observer | unknown suffix → generic boom |
| Homing fish | `torpU` received on a track | track renders steering identity from first update (own fish styled from own mode at launch) | — |
| Creeping mine | `MineView` position changes | mine sprite MOVES (reconcile gains a move path) — frozen-renderer defect fixed | — |
| Fouled victim | `you.slowedUntil` active | SLOWED tell (dual-coded text line, Tier-3 placement) + cue with visual twin; clears at expiry | refresh extends, never stacks |
| Dazzled victim | `you.dazzledUntil` active | DAZZLED tell + existing fog shrink; radar untouched (amendment 52) | — |
| Zone modes | `LitZoneView.mode` | incendiary reads burning, dazzle reads glaring, standard reads as today — for EVERY observer; flicker obeys flash caps | missing mode → standard |
| Burn damage | `dmg` while inside enemy burning zone | burn-tinted damage treatment (desaturated crimson family) | — |
| Cannon fire (own) | own click fires cannon slot | heavier own-side read than gun (muzzle intensity/shell weight, draft) — no wire change; observers unchanged | — |
| Muted / motion off | any cue/juice | visual twin still lands / positional info survives, juice suppressed at spawn site | — |
| Fit-check | walk `BOON_CATALOG` | every line maps to a fit cue + non-empty tooltip effect line; doctrines additionally to an identity entry; test FAILS on any silent line | — |
| Wire at PV 17 | any enemy/spectator frame | zone mode is the only new field; nothing else about builds leaves `you` | invariant suites |

</intent-contract>

## Code Map

- `shared/src/types.ts` + `index.ts` -- `LitZoneView.mode` (+`StarShellMode` reuse), PV 16→17 + changelog
- `server/src/game/equipment/starShells.ts` + `game/world.ts` -- carry doctrine mode onto the zone record → view
- `server/src/game/frames.ts` / perception + goldenFrames/spectator tests -- mode field ratified into invariants, goldens regenerated + audited
- `client/src/audio/tones.ts` -- new tone specs (category fit tiers, slowed/dazzled tells) + `ToneId` union + tests; new in-code audio↔visual twin table + test
- `client/src/net/roomBindings.ts` -- `handleBoonFit` tier/category routing; burn-dmg-in-zone detection; slowed/dazzled edge detection → tells
- `client/src/render/hotbar.ts` + `equipmentInfo.ts` -- tooltip accrued-boon list (`TooltipModel.boons` seam), `◆n` quick-info, 8th ACTIVE `SlotState` + skin + countdown, fit flash (activated-pulse family)
- `client/src/render/projectiles.ts` -- pierce-boom styling (`#pN` parse), homing track identity, own-mode shell looks (arcing/AP), cannon-heavier own-side weight
- `client/src/render/mines.ts` -- move path in reconcile (frozen-renderer fix); creep identity
- `client/src/render/litZones.ts` -- per-mode zone looks (burning/glaring/standard) under flash caps
- `client/src/render/hud.ts` + `main.ts` -- SLOWED/DAZZLED tells; ACTIVE window wiring (`boostUntil`, own decoys); `applyOwnStats` mode fan-out
- `client/src/ui/boonCopy.ts` -- tooltip effect-line helper (reuses `statSentence`/doctrine text)
- Tests: shared (types/PV), server (zone mode + invariants), client (tones exhaustiveness + twin table, hotbar 8-state + tooltip fit pins, projectiles/mines/litZones identity, roomBindings routing, fit-check catalog walk)
- Bookkeeping: sprint-status (2-9 done), gds-workflow-status (next_expected → 2-10), deferred-work (close: 2.2 active-window entry, 2.8 "2.9 presentation seams", dazzle-radar flag), amendments 48–52 (already recorded)

## Tasks & Acceptance

**Execution (dependency order):**
- [x] `shared` + `server` -- zone mode on the wire (PV 17), invariants + goldens -- the one wire change, everything client-side reads it
- [x] `client` audio -- tones + twin table + tests -- the audible half of every channel
- [x] `client` hotbar/tooltip -- accrued list, `◆n`, ACTIVE state, fit flash -- the slot-side visible change (amendments 48/51)
- [x] `client` on-water -- projectiles/mines/litZones/tells/cannon-weight -- doctrine identity + defect fix
- [x] Fit-check structural test + I/O matrix coverage -- "no boon is presentation-silent" pinned
- [x] Bookkeeping files -- per-PR protocol
- [x] `npm run check` -- gate green (baseline 2104, now 2246)

**Acceptance Criteria:**
- Given any of the 42 catalog lines fitted, then an audible cue (mute-aware, ≤150 ms, category/tier-appropriate) and a visible slot change (fit flash + tooltip row + toast) land together, and a catalog-walking fit-check test fails the build on any presentation-silent line.
- Given accrued boons, then the slot tooltip lists `◆ Name` + effect line immediately on fit and quick-info compresses to `◆n`, all inside their boxes (container-fit pins).
- Given a running boost/decoy window, then its slot shows the ACTIVE state per amendment 48 (breathing outline under `pulseCapHz` + countdown), dual-coded and motion-aware.
- Given each of the 8 doctrines, then its on-water identity matches the matrix under all motion/accessibility settings — including moving self-propelled mines and doctrine-distinct zones for every observer.
- Given any frame at PV 17, then zone mode is the only new wire surface and enemy builds remain inferable only from observable behavior (perception/goldenFrames/spectator suites green).
- Given `npm run check`, then lint, type-checks, and all workspace tests pass.

## Spec Change Log

## Review Triage Log

### 2026-07-31 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model)
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 0, medium 4, low 6)
- defer: 0
- reject: 3: (low 3)
- addressed_findings:
  - `[medium]` `[patch]` Own-fire misattribution (all three reviewers, CONFIRMED): the 400ms cannon latch was never consumed and near-hull torpedoes were claimed unconditionally — an enemy shell could wear the own-cannon look/report and an enemy straight-runner could render torpHoming when the player holds that doctrine. Latch extracted to a pure one-shot `OwnFireLatch` (client/src/sim/ownFire.ts), torp look latch-gated (pre-2.9 near-hull whoosh deliberately preserved and pinned), cleared at the sunk/spawn boundary. Fail-proven regressions for claim-consume, enemy-fish-generic, and boundary clear.
  - `[medium]` `[patch]` Burn misclassification both directions (all three; Codex traced the expiry-tick direction server-side): burn treatment now requires in-zone-now-or-600ms-grace AND amount ≤ a CONFIG-derived cap (incendiaryDps × 0.5s window × 4, draft-flagged) — a torpedo slam inside a fire reads full, a DoT flush just after zone exit/expiry reads burn.
  - `[medium]` `[patch]` `fireStarShells` was a dead tone — own star-shell launches played the gun crack (both hunters; the story's own thesis). starShells is now a claimable own-fire id with its own report; look stays generic by ruling.
  - `[medium]` `[patch]` Tooltip render honesty (both hunters): boons block was positioned from the modelled (not measured) description height, and the panel never re-fit below the 614px design floor. drawTooltip now lays out from max(modelled, measured) and re-trims rows against the real viewport (amendment 47).
  - `[low]` `[patch]` `+n MORE` counted the SHIP divider as a hidden boon and could dangle/lead a divider; trimmedBoonRows counts non-divider rows, pops orphan dividers, folds nested trims.
  - `[low]` `[patch]` Mine creep wake dots all stacked at the endpoint; dropWake now interpolates each dot along the covered leg.
  - `[low]` `[patch]` ACTIVE breath used absolute-time phase against the spec's integrated-phase mandate; now a clamped per-frame integrator (docstring corrected).
  - `[low]` `[patch]` Dazzle halo extended 28% past the true hazard circle; dazzleRadii structurally clamps both discs ≤ r (the firer-hue ring stays the boundary).
  - `[low]` `[patch]` Redundant `×n` on rung-named ladders removed (every ladder name encodes its position); pinning test rewritten knowingly.
  - `[low]` `[patch]` Hover tooltip rebuilt the full model every frame; now memoized on (slot, id, stats identity, boons identity).
  - Rejected (3): two-clocks-for-tells (display uses the standard countdown idiom, edges use frame-time to avoid double tones — the split is principled); fit-flash suppression at motion=off (the ratified juice-vs-information doctrine; toast + tooltip row are the surviving visual twins); second same-slot flash inside 300ms coalesced (the ratified same-source floor IS the law).

## Design Notes

- **Why the zone mode field is legal:** the zone is observable behavior of a fired shell (like a torpedo's visible curve); its nature is part of that behavior — Eric ruled counterplay over concealment (amendment 50). Everything else stays inference-only, so no other doctrine leaks pre-behavior.
- **Own vs observer identity split:** own client knows `ownStats.<weapon>.mode` (self-private) and styles own ordnance fully; observers get only what geometry/events already say. An enemy cannot distinguish an un-fired AP cannon from a stock one — correct per information discipline.
- **Fit-cue shape:** keep the `upgrade` two-note as the family template (the "template all audio must match"); category variants transpose it, tier weights it — draft specs, canon later.
- **Cannon-heavier is own-side only** because the wire's constant-free ballistic shape cannot (and must not) say "cannon"; the tester complaint is about firing feel, which is own-side.

## Auto Run Result

**Status:** done — planned against the 2.8 residuals + ledger docket, Eric-ruled pre-implementation (amendments 48–52 via AskUserQuestion: 8th ACTIVE hotbar state; EXCLUSIVE keeps storm purple — a deliberate DESIGN.md overrule; zones doctrine-distinct to everyone; hull visuals slot-side only; dazzle stays optics-only), implemented in four orchestrated waves (Fable wire wave → 2× Opus client waves → Sonnet fit-check/bookkeeping), adversarially reviewed (2 Fable hunters + Codex cross-model, strong agreement), 10 patches applied with fail-proven regressions, gate green.

**Summary:** FR22 is closed over the full 42-line catalog — no boon is presentation-silent, and a structural fit-check test keeps it that way. Fits now land with tier-weighted, category-transposed cues (fitCommon/fitRare/fitExclusive × ±4-semitone fitDetune; the generic `upgrade` two-note is retired) plus a per-category slot fit flash (shipwide lines flash the rank frame), the tooltip finally renders the accrued build (`◆ Name` + live effect line, shipwide under the gun's `— SHIP —` divider, `◆n` quick-info compression, modelled + measured + viewport-clamped fit per amendment 47), and the hotbar gained the ratified 8th ACTIVE state (integrated-phase phosphor breathe under pulseCapHz + countdown). All 8 doctrines have on-water identity: AP pierce = contracting crimson rings on derived #pN booms (survives motion=off), homing = restyled steering tracks (own fish from launch via the honest one-shot own-fire latch), arcing = own-side swell, self-propelled mines MOVE (the frozen renderer was a real defect — fixed, with creep tick + leg-interpolated wake), prop-fouling/dazzle = SLOWED/DAZZLED vitals tells with rising-edge tones, incendiary = breathing ember zones + burn-classified damage (amount-capped + 600ms grace), dazzle zones = contained glare. Lit zones are doctrine-distinct to every observer via the story's one wire change (`LitZoneView.mode`, PV 16→17, invariants extended, goldens audited). The cannon finally reads heavier than the gun own-side (muzzleHeavy, bigger dot, and the never-wired `fireCannon` tone now plays). An audio↔visual twin table + test satisfies the EXPERIENCE.md sound-map requirement in code.

**Files changed:** shared — types.ts (LitZoneView.mode), index.ts (PV 17 + changelog). server — signals.ts (mode materialized, key order preserved), world.ts (comments), perception/signals/starShells/denials tests + regenerated goldens. client — audio/tones.ts (FIT family + burn/slowed/dazzled tones + fitDetune), audio/twinMap.ts (NEW), audio/context.ts (play detune), sim/ownFire.ts (NEW one-shot latch), net/roomBindings.ts (fit routing, own-fire claims, burn classifier, victim tells), render/hotbar.ts (ACTIVE state, tooltip boons + fit model + memo), equipmentInfo.ts (slot routing), projectiles.ts (looks + pierce + lookForReveal), mines.ts (add/move/remove + wake), litZones.ts (per-mode looks + dazzleRadii), hud.ts (tells), effects.ts (pierce/muzzleHeavy), main.ts (wiring), config.ts (litZone/ordnance draft knobs), ui/boonCopy.ts (boonEffectLine), __tests__/fitCheck.test.ts (NEW structural gate). Bookkeeping — sprint-status 2-9 done, gds-workflow-status → 2-10, deferred-work 3 closures + 3 new entries, amendments 48–52 recorded pre-implementation.

**Review breakdown:** 10 patches (4 medium, 6 low), 0 deferred, 3 rejected, 0 intent gaps, 0 bad-spec loopbacks. Cross-model picture: all three reviewers independently confirmed the own-fire misattribution, burn misclassification, and stacked mine wake; Codex added the server-side trace proving the burn expiry-tick direction. Every behavioral patch carries a regression test proven to fail without the fix.

**Verification:** `npm run check` run independently by the orchestrator after every wave AND after the patch round — lint 0 errors (2 pre-existing warnings), shared 351 / server 758 / client 1171 = 2280 green (baseline 2104). Wave diffs spot-checked hunk-by-hunk (wire key order, fit routing, mine move path, patch highlights).

**Residual risks / notes for Eric:** (1) Every new feel value is a draft handwave (fit-tone envelopes, detune table, tell copy, ember/glare fractions, creep tick, pierce curve, cannon weight) — ledgered for a canon identity/audio pass. (2) COMMAND DETONATION is deliberately the one doctrine with a generic projectile look — its identity is the click-point blast itself; pinned in fitCheck as a conscious choice, flag if you want a det telegraph. (3) The own-cannon/star-shell correlation is an honest client-side one-shot latch, not server truth — ledgered; revisit if a multi-round cannon ships. (4) Amendment 49 (EXCLUSIVE keeps storm purple) contradicts DESIGN.md's purple law by your explicit ruling — the doc-sync batch owes the carve-out text. (5) Fit flashes are suppressed at motion=off per the juice doctrine; the toast + tooltip row are the surviving visual twins — flag if you want a static residue instead.

## Verification

**Commands:**
- `npm run check` -- expected: lint + 3× type-check + all workspace tests green (2104 baseline grows)
- `npm test -w client` -- expected: tones/twin-table, hotbar 8-state + tooltip fit, doctrine identity, fit-check catalog walk pass
- `npm test -w server` -- expected: zone-mode invariants + regenerated goldens pass at PV 17
