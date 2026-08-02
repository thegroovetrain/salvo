---
title: 'Tracking Mines Fix + Ordnance Aim Previews'
type: 'feature'
created: '2026-08-02'
status: 'in-progress'
review_loop_iteration: 0
baseline_revision: '630045eb8df4de746eda35b8d9481512ce80ae5b'
followup_review_recommended: false
context:
  [
    '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md',
  ]
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** (1) Self-propelled ("tracking") mines never acquire targets: acquisition measures mine→ship CENTER at `creepAcquireRange` 60u while the trip test measures mine→hull SILHOUETTE at 32u+, and hulls are 85–124u long — ships trip the mine at 74–94u center distance, outside the acquire ring; trigger boons widen the pre-empting ring further. (2) Weapon outcomes are visually illegible: no pre-click blast-radius preview, no owner-visible mine radii, no projectile travel lines.

**Approach:** Fix acquisition to the same silhouette metric as the trigger with a larger range and faster creep (Eric-ruled values). Add a client-only "ordnance aim preview" layer (blast circles at the true burst point, travel lines for all projectile weapons, owner-private always-on mine radius rings) derived entirely from own `CONFIG` + `effectiveStats()` + the local map — zero wire changes.

## Boundaries & Constraints

**Always:** All preview geometry uses `effectiveStats()` (never raw CONFIG for boon-scalable values); mine rings render in the owner's personal hue, radii distinguished by line style (dual-coding law), static-legible with motion off; preview lines/circles live on fog-immune chart-side layers like the existing aim reticle; complexity ≤ 10; VERSION → 0.17.32 (cycle 32).

**Block If:** Any part of the preview turns out to require a new wire field or a change to `perception.ts`/`frames.ts`/signal shapes; any perception/goldenFrames invariant test needs weakening.

**Never:** No PROTOCOL_VERSION bump, no new frame/event fields; no enemy-visible radii or previews (owner/self-private only); no reuse of the name "telegraph" (taken by the engine-order telegraph); no gameplay changes beyond the three ruled mine values/metric; no design-doc edits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Acquire on approach | Armed self-propelled mine; enemy approaches bow-on to ≤150u silhouette distance | Mine acquires nearest silhouette, creeps at 14 u/s toward it | No error expected |
| Boon-stacked trigger | Owner has max `mineTrigger` (trigger 51.5u); battleship approaches | Acquisition still precedes trip (150 > 51.5 + 62 half-length) | No error expected |
| AP aim | Cannon `ap` doctrine primed | No blast circle; pierce line muzzle→`rangeU`, clipped at first island | — |
| Plunging aim over island | Cannon `arcing` primed, aim beyond island | Line + burst circle unclipped (shell overflies) | — |
| Blocked path | Standard gun/cannon aim where an island blocks short of burst point | Line clips at the island; burst circle renders dimmed (blocked tell) | — |
| Mine placement aim | Mine primed, cursor in rear arc | Blast + trigger rings preview at clamped drop point | Out-of-arc keeps existing denied treatment |
| Arming mine | Own mine placed <3s ago | Rings extra-dim; snap to full at client-inferred arm time | — |
| Enemy observer | Enemy sights my mine | Marker as today; no rings | — |

</intent-contract>

## Code Map

- `shared/src/constants.ts` — `CONFIG.mine.creepAcquireRange` 60→150 (:271), `creepSpeed` 8→14 (:270)
- `server/src/game/world.ts` — `creepMines`/`nearestEnemyCenter` (:1332–1364): switch to silhouette-distance acquisition (`pointPolygonDistance`)
- `server/src/game/equipment/ballistics.ts` — `hullClearOffset`/`muzzleSpawn` (:40,:59) promote to shared
- `server/src/game/equipment/guns.ts` — `clampInsideMap`/`burstPointAlong` (:46,:79) promote to shared; barrel fan step :127
- `shared/src/sim/` — new `aim.ts` (or extension of existing sim modules): promoted spawn/burst-point/clamp helpers, barrel-exported
- `client/src/render/firing.ts` — current aim UX (reticle, bearing line, sector wedges, range-clamp marker :177) — integrate or delegate to new module
- `client/src/render/aimPreview.ts` — NEW: blast circles, travel lines, homing acquire band, mine placement preview
- `client/src/render/mines.ts` — own-mine ring overlays (`drawMarker` :231, `MineSprite.own` :96); arming timer from add-diff + `CONFIG.mine.armDelay`
- `client/src/main.ts` — retain `map.islands` on `Game` (:200,:1303); feed preview update (:1730–1760)
- `client/src/render/effects.ts` — :96 burst ring: own-correlated bursts (existing `latchOwnFire` 400ms latch) use effective burst radius; uncorrelated keep CONFIG default (enemy builds are private)
- `client/src/config.ts` — new `CLIENT_CONFIG.aimPreview` + mine-ring tunables (alphas, dash counts, widths)
- `client/src/render/weaponArc.ts` — `weaponRangeU` torpedo fallback caveat (:71–86): gate travel-line code by weapon id
- `server/src/__tests__/doctrines.test.ts` — :379–460 tracking tests mock around the bug (stationary, exactly-beam-on prey); replace with real-approach coverage
- `VERSION`, `package.json` — 0.17.32

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/constants.ts` — set `creepAcquireRange: 150`, `creepSpeed: 14` — Eric ruling R1
- [x] `server/src/game/world.ts` — acquisition via nearest hull-silhouette distance ≤ `creepAcquireRange` (same `pointPolygonDistance` metric as the trigger) — fixes root cause
- [x] `server/src/__tests__/doctrines.test.ts` — regression test: bow-on approach at >60u center acquires and creeps (must FAIL pre-fix); boon-stacked-trigger acquisition test — kill the mocked-around geometry
- [x] `shared/src/sim/aim.ts` + `shared/src/index.ts` — promote `hullClearOffset`/`muzzleSpawn`/`clampInsideMap`/`burstPointAlong` from server equipment (byte-identical behavior); server re-imports — client/server preview parity
- [x] `client/src/render/aimPreview.ts` — blast circles at true burst point for gun (per-barrel fan)/cannon standard+arcing/command torpedo (min-floor honored)/mine placement; travel lines for ALL projectile weapons (gun+cannon muzzle→burst, AP muzzle→rangeU, torpedo spawn→first obstacle/map edge); homing: initial-track line + 120u acquisition band; island clipping (arcing exempt); blocked-path dim tell — Eric rulings R2/R3
- [x] `client/src/render/mines.ts` — own-only always-on rings: solid dim blast, dashed trigger, sparse-dot acquisition (iff own `stats.mine.mode === 'selfPropelled'`), owner hue, arming extra-dim — Eric ruling R4
- [x] `client/src/main.ts` + `client/src/config.ts` — plumb islands/stats into preview; add `CLIENT_CONFIG.aimPreview` block
- [x] `client/src/render/effects.ts` — own-correlated burst ring uses effective radius — fixes stale-radius inconsistency
- [x] `client/src/__tests__/` — pure-logic tests: burst-point clamp parity with shared helpers, island clip incl. arcing exemption, homing band gating, mine ring radii/mode/arming selection
- [x] `VERSION` + `package.json` — 0.17.32 — cycle 32 per versioning ruling

**Acceptance Criteria:**
- Given an armed self-propelled mine and any hull approaching on any aspect, when its silhouette comes within 150u, then the mine acquires and closes at 14 u/s until trip (server test, fails pre-fix).
- Given any primed blast weapon, when aiming, then a circle of the weapon's effective blast radius renders at the exact server-truth burst point (range- and map-clamped); AP shows none.
- Given any primed projectile weapon, when aiming, then its true travel line renders from the real spawn/muzzle point, island-clipped except plunging.
- Given my own mine on the water, when I observe it (any fog state), then blast/trigger(/acquisition) rings render always-on in my hue, dash-coded, dimmer while arming; enemies of that mine see only the existing marker.
- Given motion setting off, when any preview renders, then all information is static (no pulse-only signal).
- Given `npm run check`, then lint (complexity ≤ 10), all type-checks, and all tests pass; perception/goldenFrames/signals tests unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**Eric rulings 2026-08-02 (AskUserQuestion, this run):** R1 mine fix = silhouette acquire + 150u + creep 14 u/s. R2 travel lines = ALL projectile weapons (incl. deck gun + standard/plunging cannon), homing torpedo gets the 120u acquisition band. R3 blast preview = every blast weapon incl. deck gun 15u and mine placement. R4 mine rings = always-on + arming-state dim (client-inferred; `armedAt` is not on the wire — safe for own mines, which never leave the owner's list).

Key facts: server reads mine radii live from owner stats each tick (`world.ts:1420,:1474`) so own `effectiveStats` IS ground truth for the rings. `WelcomeMsg.config` ships full CONFIG; islands rebuild from `mapSeed` — preview needs zero new data. Homing steers toward hull centroids within 120u at 0.5 rad/s (`shell.ts:289`); the straight line is only the initial track — the band is the honesty device. Wire-shape tests pin `MineView` keys exactly (`signals.test.ts:176`) — do not touch. `creepAcquireRange`/`creepSpeed` stay raw CONFIG (no boon scales them today); note for a future catalog pass.

## Verification

**Commands:**
- `npm run check` — expected: lint + tsc (3 workspaces) + full suite green (2391+ tests, new ones included)
- `npm test -w server` — expected: new tracking-approach regression tests pass; doctrines/perception/goldenFrames/signals green
- `npm test -w client` — expected: new preview pure-logic tests pass

**Manual checks (if no CLI):**
- If the dev client is already running (curl :5173 first, never start it): prime each weapon/doctrine and confirm circles/lines; place mines and confirm owner rings + arming dim.
