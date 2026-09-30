---
title: 'Story 8.19: Wake Drafting'
type: 'feature'
created: '2026-09-30'
status: 'done'
final_revision: 'PENDING'
baseline_revision: '2c57a99'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context-amendments.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Formation and pursuit have no physical reward: a hull tailing another gets nothing from the water it sails in. FR50 / D23 make wake drafting a base rule of the shared sim, and its numbers were gated on Eric.

**Approach:** A shared `draftLift` reads every OTHER hull's wake ribbon as it stood after last tick's `sampleWakes` and returns the best single lift (MAX, never a sum); a new `draftedKinematics` step folds it into the forward speed cap between the slow and the hooks, on the server and in the client predictor alike; the server sends the scalar self-privately as `OwnShip.draft`. Eric ruled the REALISTIC package (2026-09-30): a small lift, a lane as wide as the hull that made it, fading as the water ages, scaled by how well the rider's heading matches the wake's direction. `PROTOCOL_VERSION` 61 → 62, one bump.

## Boundaries & Constraints

**Always:**
- **Eric's rulings of 2026-09-30 (this run; recorded as epic-8 amendments 151–155 in the docs wave):**
  - (151) **Lift = 5 % of the rider's own per-tick forward cap.** `CONFIG.wake.draft.lift = 0.05`.
  - (152) **The lane is the wake-maker's own hull width each side of the trail's centre line** (9 / 20 / 32 u for the three captain hulls): half-width = `ribbon.widthU × CONFIG.wake.draft.halfWidthBeams`, `halfWidthBeams = 1`. There is NO fixed `halfWidthU` — supersedes FR50 / AR42 / D23 / the Story 8.19 AC's `cfg.halfWidthU`.
  - (153) **The lift fades with the water's age**: full at the fresh end, zero at the end of the ribbon's life.
  - (154) **Heading matters**: full lift sailing the way the wake was laid, fading to zero when crossing, zero when opposed, NEVER negative. `draftLift` therefore takes the rider's heading — supersedes D23's position-only signature.
  - (155) **The lift is tied to the WAKE, not the SHIP** (verbatim: *"this is tied to the WAKE not to the SHIP"*): leftover water of a wreck, a departed ship or a respawned ship lifts like any other; a SINKING rider is lifted like an afloat one ("water is water"); a sinking hull keeps laying wake exactly as today (epic-5 amendment 15 stands, untouched).
- **The lift function** (`shared/src/sim/wake.ts`): `draftLift(ribbons, own, x, y, heading, now, cfg)` → number in `[0, cfg.lift]`. For each ribbon that is not `own` (reference equality) and not `torp`, for each LIVE segment a(older)→b(newer): project the point onto the segment (`t` clamped to [0,1]); if the squared distance ≤ `(widthU × cfg.halfWidthBeams)²`, candidate = `cfg.lift × ageFactor × headFactor` where `ageFactor = clamp01(1 − (now − (ts_a + t × (ts_b − ts_a))) / lifeMs)` (age INTERPOLATED at the projection — no 12 u steps) and `headFactor = max(0, (cos(heading) × dx + sin(heading) × dy) / |ab|)`. Return the MAX candidate. Pure, allocation-free on the hot path, never throws; any non-finite input, a degenerate segment, `lifeMs ≤ 0` or `widthU ≤ 0` contributes 0.
- **The fold** (`shared/src/sim/draft.ts`, the sibling of `boost.ts` / `slow.ts`): `draftedKinematics(kin, lift, active)` returns the SAME reference when `!active || lift === 0`, else `{ ...kin, maxSpeed: kin.maxSpeed + kin.maxSpeed * lift }` — that expression PINNED (the boost's law). Forward cap only. The pinned composition is `boostedKinematics → slowedKinematics → draftedKinematics → hookKinematics` at exactly two call sites: `world.ts stepShips` and `prediction.ts tickKin`; the three module headers and both call-site comments state it.
- **Server:** `ShipRecord.draft: number` (0 at add / redeploy / respawn / match reset). In `stepShips`, for every hull on the water (afloat OR sinking), BEFORE its step: `ship.draft = draftLift(ribbons, ship.wake, x, y, heading, now, CONFIG.wake.draft)`, where `ribbons` is `world.wakeRibbons` captured ONCE per `stepShips` call (the getter allocates). `stepShips` precedes `sampleWakes` in `STEP_ORDER`, so the ribbons are one tick old — that IS the definition, pinned by a test; no new `STEP_ORDER` row. `active` = `ship.draft > 0`.
- **Wire:** `OwnShip.draft?: number` — the exact double the server used, conditional-spread in `toOwnShip` (`ship.draft > 0`), never `draft: undefined`. Self-private: absent from every contact and from a frame without `you`. Not a registry row, not a perception exception — the count stays SIX. `PROTOCOL_VERSION` = 62 with its header line and every pin.
- **Client:** `Predictor.setDraft(lift)` stores the latest scalar; `onServerState` calls it with `you.draft ?? 0` BEFORE `replayFrom` (the `authSlowFactor` adoption pattern — a setter beside `setBoostStats` would not fire per frame); `forceSnap` resets it to 0; `tickKin` applies the latest scalar to every tick, replayed or live. NO HUD readout, no glyph, no copy, no toast: drafting is felt only.
- **Headroom:** every place that provisions for "the fastest a hull can go" by folding the boost (`World.wakeTopSpeed`, the client's `FASTEST_BOOSTED_HULL_SPEED` and its users in `render/wake.ts`) folds the draft lift too, through `draftedKinematics` — server and client land on the same double. The helm globe's drawn cap is NOT raised (no readout); it must merely not misbehave when speed exceeds it.
- **Harness:** `draftTicks` beside `landTicks` in the batch-sim bot collector; a `draft%` column in the by-profile and by-class tables.
- **Docs wave:** `VERSION` + root `package.json` + lock → `0.18.19` (cycle 154); `CHANGELOG.md`; ONE-LINE stamps in both trackers (8-19 → done, next 8-20); amendments 151–156 appended to `epic-8-context-amendments.md` AND condensed under `## Ratified Amendments` in `epic-8-context.md` (whose "Still open" / "Later seams" lines are corrected); `deferred-work.md` 8.19 section (D23 disclosure entry marked landed; the 9.11 reconciliation list gains FR50 / AR42 / D23's `halfWidthU` and position-only signature); a dated stamp on `gdd.md`'s wake-drafting paragraph (numbers filled). How-to-Play untouched (8.22).

**Block If:** any need for a number or rule not listed above; any reading in which `draft` reaches a client other than its owner; a seventh perception exception; a per-side fork of the fold; a HUD surface for drafting.

**Never:** changing who lays wake or for how long; a client-side recomputation of the lift from rendered wakes; a registry row or `HOOK_REGISTRY` entry for drafting; bot tactics that seek wakes (8.20 owns bots); How-to-Play copy; batch sims; editing `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dead astern, fresh | rider on the centre line at the newest sample, same heading | lift ≈ 0.05 (age ≈ 0) | none |
| Half-aged water | same, at the point where the water is half its life old | 0.025 | none |
| End of life | at water exactly `lifeMs` old / older | 0 (expired segments are not walked) | none |
| Lane edge | battleship ribbon (`widthU` 32): rider 31 u off the line / 33 u off | lifted / 0; torpedo-boat ribbon (9): 8 u lifted, 10 u not | none |
| Crossing | heading 90° to the segment | 0 | none |
| Opposed | heading 180° to the segment | 0, never negative | none |
| Oblique | heading 60° off | × 0.5 | none |
| Two wakes | rider inside two ribbons worth 0.04 and 0.03 | 0.04 (MAX), never 0.07 | none |
| Own wake | `own` ribbon under the rider | 0 | none |
| Torpedo water | only a `torp` ribbon under the rider | 0 | none |
| Leftover water | an orphan ribbon (departed / respawned ship) or a wreck's ribbon | lifts like any other | none |
| Sinking rider | sinking hull in a wake | `draft > 0`, folded; the sinking ramp still uses the post-fold cap | none |
| Garbage | NaN x / y / heading / now; NaN stored sample; `count < 2` | 0, no throw | skip |
| Fold inactive | `lift = 0` or `active = false` | same `kin` reference | none |
| Fold order | boost open + fouled 0.75 + draft 0.05, max 45 | `(45 + 45×0.25) × 0.75`, then `m + m × 0.05`, reverse cap slowed only | none |
| Wire omit | `ship.draft === 0` | no `draft` key in `you` | none |
| One tick old | leader lays its first segment on tick N | the rider's `draft` first rises on tick N+1 | none |
| Replay | `you.draft = 0.03`, 4 un-acked inputs | all four replayed ticks use 0.03 | none |
| Snap | `forceSnap()` | predictor draft = 0 | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- NEW top-level `CONFIG.wake.draft { lift: 0.05, halfWidthBeams: 1 }` (no `CONFIG.wake` exists today; wake clocks stay in `CONFIG.vision`)
- `shared/src/sim/wake.ts` -- add `draftLift` (+ `DraftConfig` type); ring walk like `eachWakeSegment` (:291) but needs both endpoint timestamps; module header gains the drafting paragraph
- `shared/src/sim/draft.ts` -- NEW `draftedKinematics`; `shared/src/sim/boost.ts` (:20), `slow.ts` (:16), `hooks.ts` -- pinned-order headers
- `shared/src/types.ts` -- `OwnShip.draft?: number` (after `shield?`, :565); `shared/src/index.ts` -- exports, `PROTOCOL_VERSION` 62 (:743) + header line (:6)
- `shared/src/__tests__/` -- NEW `draft.test.ts`; `wake.test.ts` (draftLift matrix); `barrel.test.ts` :346-370, `radarRaster.test.ts` :186-187 (PV pins)
- `server/src/game/world.ts` -- `ShipRecord.draft` (init beside `inSmoke` :815/:1818, resets :2146 and respawn / match reset), `stepShips` (:3576-3609) fold + one ribbon capture, `wakeTopSpeed` (:3669)
- `server/src/game/frames.ts` -- `toOwnShip` conditional spread (:121-163)
- `server/scripts/batchsim/botMetrics.ts` (:147-225, :287-300, :370-395), `botReport.ts` (:166-169, :239-242, :360), `__tests__/botHarness.test.ts` (:123) -- `draftTicks` / `draft%`
- `server/src/__tests__/` -- NEW `draft.test.ts` (world-level); `perception.test.ts` :2404-2425 (self-private clause) + header note (declared disclosure); `denials.test.ts` :273-276, `colyseus018.test.ts` :168-199 (future-pv case → 63) (PV pins); `goldenFrames` must stay byte-identical
- `client/src/sim/prediction.ts` -- `ServerKinematics.draft?`, `setDraft`, `onServerState` (:394-428), `forceSnap` (:334-352), `tickKin` (:518-522) + its doc (:490-516)
- `client/src/config.ts` (:516-531), `client/src/render/wake.ts` (:91, :387) -- headroom; `client/src/render/helmGlobe.ts` (:301) -- verify only
- `client/src/__tests__/prediction.test.ts` (:627-852 slow describe is the template), `ordnanceMasksAreServerOnly.test.ts` :77/:97 (PV pin)
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-8-context.md,epic-8-context-amendments.md,deferred-work.md}`, `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` (:146)

## Tasks & Acceptance

**Execution:**
- [ ] Wave 1 `shared/` (Opus) -- CONFIG block, `draftLift`, `sim/draft.ts`, `OwnShip.draft`, PV 62 + header, exports, pinned-order headers, tests -- `npm run build -w shared && npm test -w shared`
- [ ] Wave 2 `server/` (Opus, parallel with 3, shared frozen) -- record field + resets, `stepShips` fold, `wakeTopSpeed`, `toOwnShip`, harness metric, tests + PV pins -- `npm test -w server`; `tsc` on `server/scripts/batchsim`
- [ ] Wave 3 `client/` (Fable — prediction/replay contract; parallel with 2) -- predictor adoption + fold + snap, headroom, tests + PV pin -- `npm test -w client`
- [ ] Wave 4 docs (Sonnet) -- version 0.18.19, changelog, both trackers, amendments 151–156 in both homes, deferred-work, GDD stamp -- `npm run check` exit 0
- [ ] Unit-test every row of the I/O matrix

**Acceptance Criteria:**
- Given a test that runs the server's composition and the predictor's `tickKin` over the same inputs, when `draft = 0`, then every tick is byte-identical to the pre-8.19 `boosted → slowed → hooks` result; when `draft > 0`, both sides produce the identical doubles in the pinned order.
- Given a leader under way and a same-class rider on its trail sailing the same way, when ticks run, then the rider's speed exceeds its rated cap and never exceeds `cap + cap × 0.05` (boost and slow aside), and returns to the cap after it leaves the lane.
- Given any frame, then `draft` appears only inside `you`, only when positive; the perception suite still counts six exceptions; the golden frames are unchanged.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `PROTOCOL_VERSION` is 62; no HUD element, glyph or string mentions drafting.

## Spec Change Log

## Review Triage Log

### 2026-09-30 — Review pass (Blind Hunter + Edge Case Hunter on Fable, Codex `gpt-5.6-sol`)
- intent_gap: 0 (one gap in Eric's rulings — the lane covered the wake-maker's own hull, so stacked or abreast hulls lifted each other forever — was flagged CONFIRMED by all three reviewers and CLOSED IN-RUN by Eric's ruling of 2026-09-30, amendment 159: the wake starts behind the maker's stern and a rider is lifted only while its whole hull is behind it; re-derived as a patch below)
- bad_spec: 0
- patch: 6: (high 1, medium 3, low 2)
- defer: 1: (low 1)
- reject: 8: (low 8)
- addressed_findings:
  - `[high]` `[patch]` Lane reached one half-width past the newest sample, i.e. over the maker's own hull (samples are laid at the hull center; hulls do not collide) — a chaser stacks on its leader and both draft each other; abreast hulls within a hull width lift each other (Blind 1, Edge 1; reproduced on the real World by both). Fixed per amendment 159: `WakeRibbon.hullAheadU` (maker half length while attached, 0 once detached), `draftLift` gains `riderHalfLenU`, the freshest `hullAheadU + riderHalfLenU` of arc is cut, the cap sits at the lane head.
  - `[low]` `[patch]` On/off sawtooth of `you.draft` at the lane head in the overlapped positions (Blind 2) — removed with the fix above; residual flicker at the nose-to-tail boundary is bounded by one sample cadence.
  - `[medium]` `[patch]` `draft.test.ts` (a) pinned "the leader sails clean water" only because it stopped at 160 ticks; the leader was lifted from tick ~868 (Blind 3, Edge 1) — replaced by ≥ 1400-tick stern-chase pins (leader 0 every tick, nose-to-tail gap, never stacked) plus abreast and stacked cases.
  - `[medium]` `[patch]` Perception draft clause compared the wire to the record itself and its non-vacuity was satisfied by a planted value with a misleading comment (Blind 4) — an independent lifecycle check and a sink-with-stale-draft case added; comment corrected.
  - `[medium]` `[patch]` The declared disclosure understated what a modified client can recover from the exact scalar (direction and rough age of a hidden wake ≈ a bearing toward a hidden hull within ~250 u) (Blind 8) — Eric ruling 2026-09-30 (amendment 160): accepted, recorded honestly in `OwnShip.draft`'s doc, the perception test header and the ledger.
  - `[low]` `[patch]` `Predictor.setDraft` accepted any finite value; `Number.MAX_VALUE` would make the sinking cap NaN (Codex 2) — clamped to `[0, CONFIG.wake.draft.lift]`.
- deferred: harness `draft%` counts lane OCCUPANCY (stopped, reversing or abreast hulls included), not benefit (Blind 9, Edge 4) — ledgered for 8.20 tuning.
- rejected: `draftLift` throws on `undefined as any` cfg / a ribbon without `xs` (Codex 1 — not a reachable input; TS-typed, server-owned data); per-tick scan cost "quadratic" (Codex 3, PLAUSIBLE — both Fable reviewers costed it at 20–30 samples per ribbon, negligible; no spatial index warranted); `forceSnap` draft reset only observable by a private peek (Blind 5 — harmless belt-and-braces); helm "drafting pins the needle" test cannot fail on this diff (Blind 6 — harmless); intent-contract text says `t` clamped to [0,1] while the code caps at the newer end only (Blind 7 — the contract is read-only history; amendments 158(b)/159 are the record); needle offset at partial throttle while drafting (Edge 2 — Eric ruling 157: true speed is shown, same as the boost); lift drops to 0 when a segment's OLDER endpoint expires under a creeping maker (Edge 3 — the spec's own "expired segments are not walked" rule; negligible at any real speed); stale `shared/dist` in the worktree (Edge env note — rebuilt before the final gate).

## Design Notes

Orchestrator readings of record (amendment 156; Eric may veto any): (a) the age fade is LINEAR and interpolated along the segment; (b) own exclusion is by ribbon reference, so a ship's own DETACHED water (after a respawn) counts as water — consistent with ruling 155; (c) the rider's test point is its centre and its heading is the pre-step heading; (d) the scalar travels as the exact double (a few bytes, only while drafting) because a rounded value would desync the fold; (e) replay applies the LATEST scalar to every un-acked tick — an approximation D23 accepts, bounded by the lift, exactly 0 outside a wake; (f) a segment is capped at its NEWER end only (a projection behind its older end contributes 0), so a rider always reads the age of the water at its own spot, the outer wedge of a turn is covered at the joint age, and (SUPERSEDED at the review gate by Eric's amendment 159) the lane's head now sits `hullAheadU + riderHalfLenU` of arc behind the newest sample — behind the maker's stern with the rider's bow clear — with the cap at that head.

Cost: ≤ (hulls × ribbons × ~25 segments) point-segment tests per tick — about 10 k multiplies at 20 hulls; no spatial index.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green, PV 62 pins
- `npm test -w server` / `npm test -w client` -- expected: green, golden frames untouched
- `npm run check` -- expected: exit 0

## Auto Run Result

Status: done — PR opened, NOT merged (Eric's call).

**Summary.** Wake drafting is a base rule of the shared sim: a hull whose whole hull sits behind another hull's stern, inside a lane as wide as that hull, sailing the way the wake runs, gets up to 5 % more forward speed cap, fading as the water ages (Eric's "realistic package", 2026-09-30, amendments 151–155; stern rule 159 at the review gate). The lift is the MAX over every other hull's ribbon as it stood after last tick's `sampleWakes`, folded `boosted → slowed → drafted → hooks` on the server and in the client predictor, sent as the self-private exact double `OwnShip.draft` (omitted at 0), parity-pinned at zero. No HUD readout was added; the helm's speed number shows true speed (157). Torpedo water gives no lift and torpedoes are never lifted (156). `PROTOCOL_VERSION` 61 → 62; version 0.18.19 (cycle 154).

**Files changed.**
- `shared/src/sim/wake.ts` — `draftLift`, `DraftConfig`, `WakeRibbon.hullAheadU`, `createWakeRibbon`/`createShipWake` half-length, dust floor
- `shared/src/sim/draft.ts` — NEW `draftedKinematics`; `boost.ts`/`slow.ts`/`hooks.ts` pinned-order headers
- `shared/src/constants.ts` — `CONFIG.wake.draft { lift: 0.05, halfWidthBeams: 1 }`; `shared/src/types.ts` — `OwnShip.draft` (honest disclosure doc); `shared/src/index.ts` — exports, PV 62
- `server/src/game/world.ts` — `ShipRecord.draft`, `tickKinematics` fold, ribbons captured once, resets, `wakeTopSpeed` headroom, orphan `hullAheadU = 0`; `server/src/game/frames.ts` — `ownDraft`
- `server/scripts/batchsim/botMetrics.ts`, `botReport.ts` — `draftTicks` / `draft%`
- `client/src/sim/prediction.ts` — `setDraft` (clamped), adoption before replay, four-step `tickKin`, `forceSnap`, `dropAcked`; `client/src/config.ts`, `client/src/main.ts`, `client/src/render/wake.ts` — headroom
- Tests: NEW `shared/__tests__/draft.test.ts`, `draftLift.test.ts`, `server/__tests__/draft.test.ts`; extended `wake`, `barrel`, `radarRaster`, `frames`, `perception`, `denials`, `colyseus018`, `wakeStore`, `goldenFrames` (fixture field only), `smokeScreen` (fixture), `botHarness`, client `prediction`, `wake`, `helmGlobe`, `ordnanceMasksAreServerOnly`
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, both trackers, `epic-8-context.md`, `epic-8-context-amendments.md` (151–161), `deferred-work.md` (8.19 section), `gdd.md` (stamp)

**Review findings.** Patches applied: 6 (the stern rule after Eric's ruling; sawtooth absorbed; long stern-chase pins; independent perception clause; honest disclosure wording; `setDraft` clamp). Deferred: 1 (harness `draft%` counts occupancy). Rejected: 8 (see the triage log). Cross-model: the lane gap was found by both Fable reviewers and not by Codex; Codex alone raised the clamp (confirmed, fixed) and the scan cost (refuted).

**Follow-up review recommended: true** — the review gate changed the lane's geometry (the stern rule, `hullAheadU`, the arc cut) and rewrote the server steady-state tests; an independent pass over `shared/src/sim/wake.ts` `ribbonLift`/`segmentLift` and `server/src/__tests__/draft.test.ts` would be worth it.

**Verification.** `npm run check` exit 0 after the review fixes (lint 0 errors / 3 pre-existing warnings; tsc ×3; shared 40 files / 1017 tests, server 80 / 2220, client 115 / 3748; hook test 266). Golden-frame snapshots untouched. No dev server, smoke or batch sim was run.

**Residual risks.** (1) Steady-state lift in a same-class chase averages under 2 % (the chaser can only match the leader once nose-to-tail) — whether 5 % "is felt" is Eric's eye on staging. (2) Prediction shimmer at lane entry/exit is bounded by the lift and smoothed; not seen in a browser. (3) The client wake-stamp rebuild floor shortened ~5 % (headroom), not measured. (4) A modified client can infer a hidden wake's direction from the scalar (accepted, amendment 160).

