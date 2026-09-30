---
title: 'Story 8.19: Wake Drafting'
type: 'feature'
created: '2026-09-30'
status: 'in-review'
baseline_revision: '2c57a99'
review_loop_iteration: 0
followup_review_recommended: false
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

## Design Notes

Orchestrator readings of record (amendment 156; Eric may veto any): (a) the age fade is LINEAR and interpolated along the segment; (b) own exclusion is by ribbon reference, so a ship's own DETACHED water (after a respawn) counts as water — consistent with ruling 155; (c) the rider's test point is its centre and its heading is the pre-step heading; (d) the scalar travels as the exact double (a few bytes, only while drafting) because a rounded value would desync the fold; (e) replay applies the LATEST scalar to every un-acked tick — an approximation D23 accepts, bounded by the lift, exactly 0 outside a wake; (f) a segment is capped at its NEWER end only (a projection behind its older end contributes 0), so a rider always reads the age of the water at its own spot, the outer wedge of a turn is covered at the joint age, and the lane reaches one half-width past the newest sample toward the leader's stern.

Cost: ≤ (hulls × ribbons × ~25 segments) point-segment tests per tick — about 10 k multiplies at 20 hulls; no spatial index.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- expected: green, PV 62 pins
- `npm test -w server` / `npm test -w client` -- expected: green, golden frames untouched
- `npm run check` -- expected: exit 0
