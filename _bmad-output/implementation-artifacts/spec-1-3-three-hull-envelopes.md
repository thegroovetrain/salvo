---
title: 'Story 1.3: Three Hull Envelopes'
type: 'feature'
created: '2026-07-19'
status: 'done'
baseline_revision: '4c4d7cbe7677a50f1068402e52255af8de3abcfb'
final_revision: '43a3139f61c32444410f900667d756f0cc84cc1a'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** CONFIG still carries the three prototype classes (destroyer/cruiser/battleship, 34–46 u hulls) — the lobby pick barely changes how the ship feels, the ratified beta classes don't exist, hulls are capsules that disagree with the rendered chevron, and playtest finding #64 (ship wedged on islands, no forward/reverse escape) is unfixed.

**Approach:** Replace the prototype classes with the ratified Torpedo Boat / Battleship / Mine Layer envelopes at literal board scale (Eric-approved 2026-07-19: hull dims 100×9 / 124×32 / 88×20 u, stat table below), introduce shared per-hull silhouette polygons that ARE the hitbox (render, projectile/mine hit-tests, and island collision all derive from one shared source), move drones to their own non-pickable `CONFIG.drones` envelope table (legacy chevron in three sizes, scaled up ~2.5×), rework ship-island resolution to an iterative overlap-free algorithm that fixes #64, and extend the existing menu minimally. Wire `cls` values change → PROTOCOL_VERSION 3→4.

## Boundaries & Constraints

**Always:**
- **Eric-approved class table (design targets, every number tunable):**
  | | torpedoBoat | battleship | mineLayer |
  |---|---|---|---|
  | hull length×beam (u) | 100×9 | 124×32 | 88×20 |
  | hp | 70 | 150 | 105 |
  | maxSpeed / reverseSpeed (u/s) | 50 / 15 | 28 / 9 | 38 / 14 |
  | accel / decel (u/s²) | 12 / 18 | 5 / 9 | 8 / 15 |
  | turnRate (rad/s) | 0.8 | 0.4 | 0.6 |
  | steerageSpeed (u/s) | 12 | 8 | 10 |
- **Drone envelopes (NEW `CONFIG.drones`, design targets):** small 85×25 / medium 100×30 / large 115×35 u (chevron proportions from the old 34×10/40×12/46×14 trio ×2.5); hp 80/100/120 and kinematics byte-for-byte the old destroyer/cruiser/battleship values. Drones are NOT in `shipClasses`, never pickable, never upgradeable-by-design (no code change needed — they simply never earn points).
- **Silhouette IS the hitbox (UX-DR9, Eric-confirmed):** one shared polygon per hull id in NEW `shared/src/sim/silhouette.ts`, from the board SVG outlines normalized to exact ratified length/beam, bow aligned to heading, centered on ship origin; drone chevrons generated procedurally from the same proportions as today's `traceHull`. Client render draws these polygons; server collision/hit-tests consume them. No independent geometry anywhere.
- Hit-tests are polygon-accurate and concave-safe (TB stern notch, ML transom notch): swept shell/torpedo = min distance from travel segment to polygon edges ≤ hitRadius, or endpoint inside; mine trigger = point-to-polygon distance ≤ triggerRadius; island contact = polygon-vs-circle penetration.
- **#64 fix (amended in review per Eric ruling "boats should be blocked by islands completely"):** pose-validity rollback — the candidate pose after kinematics resolves against the previous (induction-valid) pose: push-out passes with penetration-true capped displacement, else previous-heading retry (rudder blocked by rock), else full revert. POST-INVARIANT: no tick ever ends with a hull overlapping an island; no silent give-up. `islandSpeedMult` damping applies ONCE per tick. Mapgen `SEPARATION` 15→40 u; spawn poses are validated (island-clear fallback ladder) so the induction premise holds.
- **Owner immunity (Eric ruling, mid-review 2026-07-19):** a ship can NEVER be damaged by its own gun shells, torpedoes, or mines — permanent owner exclusion replaces the timed selfHitGrace machinery (fields removed from CONFIG). Enemy behavior unchanged; spawn/bow clearance retained.
- Wire: `Contact.cls` widens to `HullId = ShipClassId | 'droneSmall' | 'droneMedium' | 'droneLarge'`; `OwnShip.cls` stays `ShipClassId`; `PROTOCOL_VERSION` 3→4. No other wire-shape changes.
- `SHIP_CLASS_IDS = ['torpedoBoat', 'battleship', 'mineLayer']`; `sanitizeClassId` fallback `'torpedoBoat'` (legacy localStorage ids sanitize to it).
- Interregnum: legacy 14-upgrade economy keeps multiplying the new stat blocks through `effectiveStats()` unchanged in structure; spend stays enabled. `defaultLoadout` keeps the universal fit with NO class parameter (Story 1.6 owns that).
- Shared-sim purity: silhouette + collision math is pure shared code called identically by server world and client Predictor at the same 50 ms dt (prediction parity by construction). No Math.random/Date.now.
- FR7 guardrails hold and extend: torpedo speed 70 outruns every hull INCLUDING drones (max 50 player / 46 drone); torpedo damage 55 < min hp 70; extend `damageGuardrail.test.ts` to iterate `CONFIG.drones` too.
- Golden-frames fixture is REGENERATED deliberately (wire cls values changed) in the same commit as the PROTOCOL_VERSION bump; `frames.ts` stays the sole spatial chokepoint and contacts still come exclusively from `perception.observe()` (invariant tests stay green).
- Complexity ≤ 10; new geometry helpers reuse `segSegClosest`/`segCircleHit` where possible.

**Block If:**
- The wedge regression test cannot pass without changing helm/rudder mechanics (steerage scaling, turn rules) — that is a game-design change needing Eric.
- Polygon hitboxes force wire-shape changes beyond the `cls` union widening.
- Any gun/torpedo/mine balance value would need to change beyond the approved tables.

**Never:**
- No per-class loadouts (1.6–1.8), no class-select chrome/pips (1.14), no nameplates or drone-render redesign beyond scaling (1.13), no Regatta colors (1.11/1.12), no latency work (1.5).
- No XP/economy changes — Eric's drone XP tiering (small ¼ / medium ⅓ / big ½ level) is Epic 2 design, recorded in Design Notes only.
- Do not strip or weaken upgrade spend; do not edit DESIGN.md/EXPERIENCE.md; no CLIENT_CONFIG gameplay leakage.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick & sail each class | Join with `cls: 'torpedoBoat' \| 'battleship' \| 'mineLayer'` | Ship spawns with that envelope; `OwnShip.cls` echoes it; effectiveStats block complete | No error |
| Legacy/garbage cls | Join with `cls: 'cruiser'` or junk | Sanitized to `'torpedoBoat'` | Silent fallback |
| Stale client | Join with `pv: 3` | Rejected by existing protocol gate | Join error, as today |
| Concave miss | Shell path crosses TB stern-notch or ML transom-notch cavity without touching hull | No hit (polygon-accurate) | No error |
| #64 wedge | Ship driven into a 2-island channel, speed collapsed | Full-astern (or helm) escapes within bounded ticks; resolution leaves tick overlap-free | No stuck state |
| Drone contact | Drone in sight range | `Contact.cls: 'droneMedium'` (round-robin size); client draws scaled legacy chevron | No error |
| Interregnum spend | maxSpeed upgrade on mineLayer | 38 × 1.08^n via effectiveStats; HUD agrees | No error |

</intent-contract>

## Code Map

- `shared/src/constants.ts:27-65` -- `shipClasses` replaced; NEW `drones` table; `SHIP_CLASS_IDS`/`sanitizeClassId` (fallback change); NEW `HullId` export.
- `shared/src/sim/silhouette.ts` -- NEW: per-hull-id closed polygons (board verts normalized; procedural drone chevron), transform + polygon geometry helpers (seg-to-polygon distance, point-in/to-polygon, polygon-vs-circle penetration, max radius); barrel-export.
- `shared/src/sim/collision.ts` -- polygon-vs-circle island resolution, iterative multi-pass, single damp/tick; boundary clamp via polygon max radius. `SHIP_RADIUS` default retired.
- `shared/src/sim/shell.ts:89-104` -- capsule `hullEndpoints`/`HullTarget` → silhouette polygon hit-test (keep swept math via per-edge `segSegClosest`).
- `shared/src/sim/map.ts:20` -- `SEPARATION` 15→40.
- `shared/src/index.ts:10` -- `PROTOCOL_VERSION` 3→4; silhouette barrel export.
- `shared/src/types.ts:121,152` -- `Contact.cls: HullId`.
- `server/src/game/world.ts:232,496,525` -- `addShip` classId default → `'torpedoBoat'`; drone ships get drone envelopes; per-tick transformed polygons replace `aliveHulls()` capsules; island resolution call site.
- `server/src/game/drones.ts` + `server/src/rooms/ArenaRoom.ts:285-299` -- drones round-robin `droneSmall/Medium/Large` instead of player classes.
- `server/src/game/equipment/mines.ts:111-122`, `equipment/ballistics.ts:30` -- polygon trigger check; `hullClearOffset` from hull length (unchanged formula, new dims).
- `server/src/game/spawn.ts:16-24` -- clearance derives from max hull length (auto; verify vs 124).
- `server/src/game/frames.ts:30` -- `cls` passes hull id (drones included).
- `client/src/render/ships.ts` -- draw shared silhouette polygons (replaces `traceHull` geometry; keep styling).
- `client/src/ui/menu.ts` -- three buttons TORPEDO BOAT / BATTLESHIP / MINE LAYER, captions `FAST · FRAGILE` / `SLOW · ARMORED` / `AREA DENIAL`.
- `client/src/main.ts:461,600,716`, `client/src/sim/prediction.ts:41,81` -- Predictor consumes shared polygon collision; `HARD_SNAP_U` re-derived from max class length ×3.
- `client/src/net/roomBindings.ts:52`, `client/src/render/effects.ts:63-77`, `client/src/render/firing.ts:66` -- hull-dim consumers re-derived over all hull ids.
- Tests: `shared/src/__tests__/shipClasses.test.ts` (rewritten — Cruiser byte-identity pin deliberately retired, its guard purpose is fulfilled), `collision.test.ts` (+wedge regression), `damageGuardrail.test.ts` (+drones), NEW `silhouette.test.ts`; `server/src/__tests__/goldenFrames.test.ts` fixture regen; ~20 files with class-name references updated mechanically (world, combat, matchTelemetry, zone, weapons, match, ballistics, upgrades, torpedoSelfHit, operability, frames, spectator, perception, shell, ship, stats, loadout, client menu/prediction/hud/snapshots/upgrades).

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/sim/silhouette.ts` (+ `geom.ts` helpers if cleaner) -- NEW polygon registry + geometry math, with tests pinning exact lengths/beams, closedness, bow orientation, concavity behavior -- the single geometry source everything else consumes.
- [x] `shared/src/constants.ts` + `types.ts` + `index.ts` -- new class/drone tables, `HullId`, sanitize fallback, PROTOCOL_VERSION 4 -- the approved envelopes land.
- [x] `shared/src/sim/collision.ts` + `map.ts` + `shell.ts` -- polygon collision/hit-tests, iterative island resolution, single damp, SEPARATION 40; wedge + concave-miss tests -- silhouette-is-hitbox + #64 fixed at the sim root.
- [x] `server/src/game/*` (world, drones, frames, spawn, equipment/mines, equipment/ballistics) + `ArenaRoom` -- consume polygons, drone envelope assignment, defaults -- authoritative side complete.
- [x] `client/src/*` (render/ships, ui/menu, main, sim/prediction, net/roomBindings, render/effects, render/firing) -- render from shared polygons, menu extension, prediction parity -- pickable and sailable end-to-end.
- [x] Test sweep -- rewrite/extend the named suites, regenerate golden frames deliberately, mechanical class-name updates everywhere -- `npm run check` green.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-3-three-hull-envelopes` status transition at completion.

**Acceptance Criteria:**
- Given any of the three classes picked in the menu, when the match runs, then the ship sails with its approved envelope and `effectiveStats()` yields a complete stat block (all 14 legacy upgrades still applying).
- Given any rendered hull (player or drone), when compared against server hit/collision geometry, then both derive from the same shared silhouette polygon (no independent dims).
- Given a ship wedged against or between islands (#64 repro), when the player orders full astern or helm, then it escapes within bounded ticks and every tick ends overlap-free.
- Given the perception invariant suites, when run against the new hulls, then nothing outside sight ∪ this-tick paints appears in any frame (suites green, fixture regen deliberate).
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

### 2026-07-19 — Mid-review Eric rulings (live), intent-contract amended under user authority
- **Trigger:** review pass confirmed (2× Fable hunters + Codex, independent traces) that the contract's original "≤4 passes until overlap-free" mechanism could not meet its own overlap-free AC — rudder rotation was never collision-checked, so perpendicular-wedge poses with no translation escape were constructible (#64 recreated at board scale), the resolver gave up silently, and deep-overlap pushes teleported (97 u measured).
- **Amended:** the #64 Always clause now specifies the pose-validity rollback algorithm (Eric: "boats should be blocked by islands completely"); an owner-immunity Always clause was added (Eric: "just turn off friendly fire altogether — I don't ever want to take damage from my own weapon"). The revert-and-halt intent_gap protocol was superseded by Eric's live rulings; code was patched forward, not re-derived.
- **Known-bad state avoided:** free rotation through islands + silent resolver give-up (wedge states with no escape); timed-grace self-hits returning at ≥5 maxSpeed stacks (50×1.08⁵ ≈ 73.5 > torpedo 70).
- **KEEP:** silhouette polygon registry + geometry helpers; class/drone CONFIG tables verbatim; graze-slide feel along single islands; single-per-tick damping; prediction parity via the one shared resolve function; deliberate golden-frames regen.
- **Also ruled, deferred:** hull-aware perception (Eric: see any part of a ship inside the sight bubble; radar picks up any part in radar range) — recorded in deferred-work; perception.ts untouched this story.

## Review Triage Log

### 2026-07-19 — Review pass (Blind Hunter + Edge Case Hunter + Codex cross-model; patch round on Opus per Eric's Fable-budget constraint, orchestrator-reviewed + Codex re-check)
- intent_gap: 1: (high 1, medium 0, low 0) — resolved LIVE with Eric (rollback ruling) instead of revert-and-halt; contract amended (see Spec Change Log)
- bad_spec: 0
- patch: 7: (high 1, medium 3, low 3)
- defer: 2: (high 0, medium 2, low 0)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[high]` `[patch]` Collision rewritten to pose-validity rollback (all three reviewers confirmed wedge/overlap defects; Codex re-check of the patch: call sites "semantically aligned", parity + damping correct). Strengthened suite proven to bite against a scaffolded copy of the old resolver.
  - `[medium]` `[patch]` Permanent owner immunity for gun/torpedo/mine (Eric ruling; retires Codex's ≥5-stack self-hit finding); selfHitGrace removed; torpedoSelfHit suite repurposed to pin the new law incl. the 73.5 u/s case.
  - `[medium]` `[patch]` Spawn safety: clearance from true polygon max radius (62.29 > length/2), stale "Unreachable" comment fixed, fallback rewritten as an inward ladder that ALWAYS returns island-clear (Codex-confirmed residual on first patch: `best ?? safest` could return an overlapping point and poison the rollback induction — fixed by orchestrator, pinned by a pathological-map test); mapgen SPAWN_MARGIN 40→64.
  - `[medium]` `[patch]` frames.ts toOwnShip now throws on a drone hull id (two reviewers flagged the unguarded `as ShipClassId` cast); pinned by test.
  - `[low]` `[patch]` Deep-overlap push math corrected (penetration-true, capped — no 97 u teleports); anti-teleport test pin.
  - `[low]` `[patch]` Allocation scratch threaded through the island-resolve path and predictor replay ring (the two hot paths that re-transformed per call).
  - `[low]` `[patch]` False geometry comments corrected (hullClearOffset "maximal reach" claim; collision header documents the rollback invariant); golden-frames/PV4 same-commit clause satisfied by history rebuild before push.
- deferred (to deferred-work.md): gun dead ring at hull scale (BB ~64 u un-shootable ring → Story 1.4 gun tuning, Eric-confirmed); hull-aware sight/radar perception (Eric ruling recorded verbatim, needs its own reviewed story in perception.ts).
- rejected as noise: telemetry key-space now includes drone hull ids (deliberate, documented, shape unchanged); ML "AREA DENIAL" caption (cosmetic, 1.14 rebuilds class select); boundary bounding-circle per-class effective map radius nit (spec-sanctioned, folded into rollback clamp).

## Design Notes

- Eric rulings (2026-07-19, this run): literal board scale; stat table approved as tweakable handwaves; polygon literally the hitbox (decoupling stays the named fallback if TB balance breaks); board verts as v1 art; drones keep the scaled legacy chevron trio. Drone XP tiering (small ¼ / medium ⅓ / big ½ level) is FUTURE Epic-2 economy design — recorded here so it isn't lost; do not implement.
- Drones-as-`CONFIG.drones` (not hidden shipClasses entries) is an engineering call answering Eric's expressed uncertainty: keeps class-select/pips/sanitize purely player-facing while drones stay ordinary ships through the same input pipeline (no physics special-casing — only their envelope source differs).
- Board TB path spans 88 of its 100 u frame — normalize so bow-to-stern = exactly 100 u (ratified length wins over raw verts; board is "proposals for reaction").
- Camera zoom pins radar range to the screen, so bigger hulls render bigger with zero camera work — this is the mechanism that makes literal scale land visually.
- Polygon transform per ship per tick is ~10–14 verts × ≤20 ships — cache transformed verts per tick server-side; client pools per-frame arrays (`util/pool.ts`).
- Eric rulings (mid-review 2026-07-19): islands block boats COMPLETELY (rollback collision — a hull can neither move nor rotate into rock; it grinds to a stop and backs off); own weapons NEVER damage their owner (permanent immunity, all three weapons — moots the self-hit half of 1.6's boost × torpedo question; the dodge-balance half remains); hull-aware sight/radar wanted ("see any part of the ship in my sight bubble; radar picks up any part in radar range") — deferred to its own story because it rewrites perception.ts after this story's review gate had run and Fable review budget was exhausted for the week.
- Client feel knobs flagged for later (unchanged, per Wave-2b report): splash/sink ring radii, wake spacing — tuned for small hulls, may read small at board scale.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. new silhouette suite, wedge regression, rewritten shipClasses pins, extended damageGuardrail.
- `npm test -w server` -- expected: green incl. perception invariants and deliberately-regenerated golden frames.
- `npm test -w client` -- expected: green incl. menu labels and prediction parity suites.
- `npm run check` -- expected: lint (complexity ≤ 10), tsc all workspaces, all tests green.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): pick each class, sail, confirm silhouettes render at literal scale and islands can't wedge you.

## Auto Run Result

Status: done

**Summary:** Story 1.3 delivered: the three beta classes (Torpedo Boat / Battleship / Mine Layer) replace the prototypes at literal board scale with Eric-approved envelopes; one shared silhouette polygon per hull id drives render, all weapon hit-tests, and island collision (silhouette IS the hitbox, concave-safe); drones live in their own non-pickable CONFIG.drones table (three legacy-chevron sizes ×2.5) and ride the wire as drone hull ids; island collision is pose-validity rollback (Eric mid-review ruling: boats blocked completely — no tick ever ends overlapping, #64 fixed with a bite-proven regression suite); own weapons can never damage their owner (Eric mid-review ruling — selfHitGrace retired); PROTOCOL_VERSION 4 with a deliberate golden-frames regen; menu minimally extended; legacy upgrade economy intact (interregnum). Implementation orchestrated per /orchestrate routing: Fable (shared core, server/anti-cheat wave), Opus (client wave, review patch round after Eric's Fable-budget constraint), Codex cross-model at both review gates.

**Files changed (one-liners):** shared — silhouette.ts NEW (polygon registry + geometry), constants.ts (class/drone tables, HullId, PV comment), collision.ts (rollback rewrite), shell.ts (polygon hit-tests, owner immunity), map.ts (SEPARATION 40, SPAWN_MARGIN 64), types.ts (Contact.cls: HullId), index.ts (PV4, barrel); server — world.ts (hullId identity, prevPose, polygon targets), drones/ArenaRoom (drone hull round-robin), frames.ts (drone-id guard), spawn.ts (true-radius clearance, validated fallback ladder), equipment/* (owner immunity, polygon mines, comment fixes), golden-frames fixture regen; client — render/ships+contacts (shared polygons verbatim), menu (new classes/captions), prediction/main (same shared resolve as server — parity pinned), roomBindings/effects/firing (hull-dim re-derivations); tests — 653→892 across 15/26/29 files incl. new silhouette, wedge/rollback, owner-immunity, spawn-ladder, chokepoint-guard suites.

**Review findings breakdown:** 1 intent_gap (high — collision mechanism couldn't meet its own overlap-free AC; resolved live with Eric, contract amended, patched forward), 7 patches applied (1 high, 3 medium, 3 low), 2 deferred (gun dead ring → Story 1.4; hull-aware sight/radar → own story, Eric ruling recorded), 3 rejected as noise. Codex re-check of the patch round confirmed parity/immunity/guard clean and caught one residual (overlapping spawn fallback) — fixed and pinned.

**Follow-up review recommended: true** — the review pass drove a full rewrite of the collision core plus a new combat rule (owner immunity); the patch round ran on Opus (Eric's Fable-budget constraint) with orchestrator + Codex verification rather than a fresh Fable hunter pass.

**Verification:** `npm run check` green end-to-end (892 tests: shared 188, server 409, client 295; eslint 0 errors; tsc clean ×3) after every wave and after the patch round; netcode + drones headless smokes pass over real sockets (scratch ports, killed after); wedge suite proven to bite against a scaffolded copy of the old resolver; golden frames byte-stable except the deliberate PV4 regen.

**Residual risks:** hull-aware perception deferred — until that story lands, up to ~62u of a big hull can sit invisibly inside the sight bubble (cosmetic booms on empty water, no info leak); gun dead ring at board scale awaits 1.4; client feel knobs (splash/sink rings, wake spacing) tuned for small hulls; slot-index==WeaponId interregnum debt unchanged from 1.2; the rollback's induction premise depends on validated spawns (pinned by the pathological-map test).
