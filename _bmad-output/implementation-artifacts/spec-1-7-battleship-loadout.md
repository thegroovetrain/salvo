---
title: 'Story 1.7: Battleship Loadout'
type: 'feature'
created: '2026-07-21'
status: 'in-progress'
baseline_revision: '23c9f88e12dac5653e050a7af66cbfc7a6789346'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** The Battleship still sails the interregnum universal fit (`[gun, torpedo, mine, empty]`) — its ratified identity (long-range cannon + star shells) exists only on paper, and no mechanism exists for remote illumination: vision is strictly one observer-centered sight bubble + radar sweep, so "light a region like truesight for 10 s" has no legal path through perception on either side.

**Approach:** Fit the Battleship with `[gun, cannon, starShells, empty]` (Eric ruling 2026-07-21: Q = cannon, E = star shells, R/F stay empty/reserved). The cannon is a gun-pattern burst skillshot with bigger numbers (higher damage, larger burst, faster shell, 15 s reload; range = the gun's radar-based range, NOT extended — Eric Q&A). The star shell is a gun-pattern skillshot whose burst does minor damage across a large area AND spawns a server-side lit zone (~half truesight radius, 10 s, 20 s reload) granting the FIRER full truesight parity inside it (ships as contacts, mines, ballistic reveals); the zone circle itself is visible to ANY player whose radar range covers it, tagged with the firer's id. PROTOCOL_VERSION → 8.

## Boundaries & Constraints

**Always:**
- Eric's ruled values verbatim as CONFIG design targets (Q&A 2026-07-21): cannon damage 50 / contactDamage 20 / burstRadius 30 / shellSpeed 200 / reload 15000 ms; star shell damage 10 (once, at burst, full lit circle, owner excluded) / shellSpeed 130 / lit radius 110 (= half truesight 220) / duration 10000 ms / reload 20000 ms; both maxAmmo 1; both ranges = the gun's base (derived from `CONFIG.vision.radar`, 650 — no extension, no upgrade stacking on either new system).
- Both new systems are weapons (`EQUIPMENT_IS_WEAPON: true`): prime-then-click skillshots riding the existing `fireSeq`/`slot`/`aimDist`/`fireT` channel with D1 latency compensation; 360° (no arc — arcs are Story 1.10); interregnum keys 2/3 prime them on BB (no Q/E/R/F rebinding — Epic 2).
- Cannon reuses the gun's exact ballistic model (`makeBallistic` + `stepShell` burst-at-target, early-interceptor contactDamage, `interceptedInBlast` upgrade rule) with its own CONFIG block; both new shells ride the existing `shell` ballistic wire kind (first-sight materialize, current pos/vel only, no range-derivable fields).
- Lit-zone reveal semantics (Eric Q&A): "lit from above" — no island LOS term anywhere on the zone paths. FIRER-ONLY truesight parity inside the circle: enemy ships whose center is inside become ordinary contacts; enemy mines inside become mine views; un-seen ballistics inside materialize (exactly-once machinery). Non-owners NEVER gain contacts/mines/ballistics from someone else's zone.
- Zone-circle visibility (Eric Q&A): `litZones` channel row `{id, x, y, r, until, by}` emitted to the owner always, and to any observer whose effective radar range reaches the zone center (no LOS, no sweep gate — a flare in the sky); invisible beyond radar range; spectators see all. `by` is the firer's ship id (roster-resolvable — renders in the firer's personal hue come 1.12; this story uses the interregnum own=green / enemy=amber tint convention).
- Every stat flows through `effectiveStats()` (`cannon`/`starShells` pass-through blocks, boost precedent — no legacy upgrade touches either; gun-category upgrades keep applying to the standard gun only).
- Registry discipline: new `litzone` pseudo-row beside `mine`; burst flash reuses the existing `burst` event row (no new GameEvent kind). Perception-invariant oracle independently extended (owner-zone reveal sources + litZones radar-range case), signals key-order guards, goldenFrames scenario + deliberate `-u` regen, PV8 changelog line — all in this PR.
- Sim purity (no `Math.random`/`Date.now`), complexity ≤ 10, `npm run check` green, one PR.

**Block If:**
- Any wire growth beyond `LitZoneView`/`FrameMsg.litZones` seems necessary, or a new ballistic kind / GameEvent kind seems needed.
- Non-owner zone data seems to need more than the radar-gated circle (e.g. contacts leaking through someone else's zone).
- Drone envelopes, hull kinematics, or gun/torpedo/mine/speedBoost CONFIG values seem to need changing.
- Any guardrail must weaken: every single-hit damage number stays < min hull hp (70).

**Never:**
- No arc geometry (1.10), no Q/E/R/F rebinding or hotbar (Epic 2), no ML loadout change (1.8), no literal "you are lit" victim messaging (the radar-visible circle IS the tell — Eric), no new upgrade ids/categories.
- No torpedo/mine removal from shared systems — ML/drones keep the universal fit; BB torpedo/mine-category offers become dead picks via the EXISTING no-op guard (interregnum wart, dies with Epic 2 economy).
- No perception scan outside `frames.ts`/`observe()`; no client-side fog rearchitecture (lit circle renders as a world-positioned additive overlay, mines/radar precedent — not a second fog-texture hole).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Prime + fire cannon | BB, key 2, click at 400 u | shell (speed 200) flies to click, bursts 30 u for 50; 15 s reload starts | none |
| Cannon early intercept | hull crosses path outside blast | interceptor takes 20, shell stops, no burst; inside would-be blast ⇒ full 50 burst | none |
| Click beyond range | click at 1200 u | burst point clamped to the gun-equal range along aim (gun rule) | none |
| Fire star shell | BB, key 3, click | shell flies, bursts: ≤10 dmg to enemies in 110 u, lit zone (110 u, 10 s) spawns | none |
| Enemy ship inside zone | firer has no sight/radar paint of it | firer gets full contact while inside; drops on expiry/exit | none |
| Enemy mine / unseen torpedo inside zone | zone active, firer observing | mine view appears; ballistic materializes once (current pos/vel) — truesight parity | none |
| Ship behind island inside zone | island between zone center and ship | still revealed to firer (lit from above) | none |
| Ship outside zone edge | dist > 110 u from center | never revealed by the zone (invariant case) | none |
| Third party, zone in radar | dist(observer, zone center) ≤ eff. radar | sees the lit circle `{x,y,r,until,by}` — and nothing else from it | none |
| Third party, zone beyond radar | dist > eff. radar | frames byte-free of the zone | none |
| Firer dies mid-zone | BB sunk at t < until | zone persists to natural expiry (dead firer spectates and sees all anyway) | none |
| Fire while cooling / dead / unfitted forge | click, `reloadMsLeft > 0` etc. | no state change; denied pulse client-side | existing denial reasons |
| TB/ML press key 2/3 | non-BB hull | primes torpedo/mine exactly as today (byte-identical loadouts) | none |
| pv-7 client joins | old PROTOCOL_VERSION | rejected at matchmake | existing `protocolVersionError` |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- NEW `CONFIG.cannon { shellSpeed: 200, maxAmmo: 1, reloadMs: 15000, damage: 50, contactDamage: 20, burstRadius: 30, shellRadius: 2 }` and `CONFIG.starShells { shellSpeed: 130, maxAmmo: 1, reloadMs: 20000, damage: 10, litRadius: 110, litDurationMs: 10000 }` as peers of gun/torpedo/mine/speedBoost. No range fields: both ranges derive from `CONFIG.vision.radar` in `effectiveStats()` (gun parity, un-upgraded).
- `shared/src/types.ts` -- `LitZoneView { id, x, y, r, until, by }`; `FrameMsg.litZones?` (sibling of `mines`). No new GameEvent kind.
- `shared/src/index.ts` -- PROTOCOL_VERSION 8 + changelog line; barrel exports.
- `shared/src/sim/loadout.ts` -- `EquipmentId` += `'cannon' | 'starShells'`; `EQUIPMENT_IS_WEAPON` both `true`; `loadoutFor`: battleship → `[gun, cannon, starShells, empty]` (TB keeps 1.6 fit; ML/drones universal); extend `equipmentMaxAmmo`/`equipmentReloadMs`.
- `shared/src/sim/stats.ts` -- `EffectiveStats.cannon`/`.starShells` pass-throughs + `rangeU: CONFIG.vision.radar` base (comment: no upgrade multiplies these; gunRange stacks can out-range the cannon — known interregnum quirk).
- `server/src/game/equipment/cannon.ts` -- NEW row cloning guns.ts fire flow (clamp at `stats.cannon.rangeU`, muzzle-or-target spawn, `makeBallistic` with cannon params). Register in `equipment/index.ts`.
- `server/src/game/equipment/starShells.ts` -- NEW row: same fire flow with `burstRadius: litRadius`; shells tagged server-internally so burst resolution spawns a zone.
- `server/src/game/world.ts` -- `World.litZones: Map<string, {id, ownerId, x, y, r, until}>`; spawn in `resolveBurst` for star shells; expiry sweep in `step()` (mines precedent); no per-ship state.
- `server/src/game/perception.ts` -- `SignalContext.litZones` (all active zones) populated in both context builders; `ownZoneCovers(ctx, p)` helper (observer-owned zone containing p, no LOS) feeding contact/mine/ballistic checks; `litZoneScan` beside `mineScan`.
- `server/src/game/signals.ts` -- `contactSignal`/`mineSignal` visibility OR `ownZoneCovers`; `ballisticSignal` first-sight check ORs it too; NEW `litzone` pseudo-row (owner always; else zone center within effective radar range; spectator: all).
- `server/src/game/frames.ts` -- thread `litZones` channel into fogged + spectator frames.
- `client/src/render/weaponArc.ts` + `render/firing.ts` -- BREAK THE SLOT-INDEX COUPLING: branch on fitted equipment id, not `SLOT_TORPEDO`/`SLOT_MINE` literals — cannon/starShells are 360° gun-like (always in arc, range ring at their rangeU); torpedo/mine behavior byte-identical on ML/TB.
- `client/src/sim/inputSampler.ts` -- `primeFireable` consults equipment-id-aware arc/range (same helper); no wire change.
- `client/src/net/roomBindings.ts` -- `litZones.sync(f.litZones)` after `mines.sync`; state threading.
- `client/src/render/litZones.ts` -- NEW module (mines.ts pattern): soft additive lit-circle overlay above fog at world pos, radius r, fading with `until - serverNow`; tinted own-green / enemy-amber by `by` (1.12 will swap to personal hues); revealed ships/mines render for free via existing channels (contact ~300 ms stale + 150 ms fade covers zone-exit).
- `client/src/render/hud.ts` -- `EQUIPMENT_LABEL` += `cannon: 'CANNON'`, `starShells: 'FLARE'`; `chipUsesCooldownGrammar` includes both (1-round long-cooldown skillshots).
- Tests: shared `loadout` (BB fit + is-weapon map), `stats` (pass-throughs + rangeU parity + ammo/reload round-trip), `damageGuardrail` (cannon 50 & contact 20 & star 10 all < 70; contact ≤ damage), `barrel` PV8; server `equipment.test.ts` (RE-POINT its "universal fit" exemplar hull from battleship → mineLayer, then add cannon/starShells blocks), `cannon`/`starShells` matrix suites, `perception.test.ts` (oracle extension: owner-zone reveal for contacts/mines/ballistics + litZones radar-range verifier + completeness counts 14), `signals.test.ts` (litzone key-order + counts), `goldenFrames` (star-shell scenario: zone spawn, firer reveal, third-party radar view, expiry + deliberate regen); client `weaponArc`/`firing` (id-aware branching, ML/TB regression), `hud` labels, `litZones` render logic, `snapshots` untouched-green.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-7-battleship-loadout` transition at completion.

## Tasks & Acceptance

**Execution:**
- [x] `shared/src/` (constants, types, index, sim/loadout, sim/stats) -- CONFIG blocks, LitZoneView + litZones channel, PV8, BB loadout, pass-through stats -- the deterministic spine, unit-tested.
- [x] `server/src/game/` (equipment/cannon + starShells + index, world, perception, signals, frames) -- two weapon rows, lit-zone entity lifecycle, firer truesight-parity + radar-gated litzone row, invariant + signals + goldenFrames extensions -- authoritative loadout complete against the full I/O matrix.
- [x] `client/src/` (render/weaponArc, render/firing, sim/inputSampler, net/roomBindings, render/litZones NEW, render/hud) -- equipment-id-aware aim UX, lit-circle overlay with by-tint, chips -- firer feel end-to-end with ML/TB byte-identical.
- [x] Test sweep -- suites in Code Map + `npm run check` green (exit 0; 240/552/365 = 1157 tests, was 1081 at baseline).
- [ ] `sprint-status.yaml` -- status transition.

**Acceptance Criteria:**
- Given a BB spawn, when the loadout builds, then it is `[gun, cannon, starShells, empty]` while TB/ML/drones are byte-identical to 1.6, and keys 2/3 prime the new skillshots (click fires with D1 compensation).
- Given a cannon shot, when it flies and bursts, then damage/burst/speed match CONFIG targets, range clamps exactly like the gun's base, interceptor rules match the gun's, and `damageGuardrail` pins every number < 70.
- Given a star shell burst, when the zone is live, then the firer (and only the firer) gains contacts/mines/ballistic reveals for entities inside 110 u — islands notwithstanding — ending at `until`; every observer with the zone center inside effective radar range (and no one else) receives the `{id,x,y,r,until,by}` circle; no contact/mine/event outside sight ∪ radar-paint ∪ owned-zone ever appears in any frame (invariant + goldenFrames prove it).
- Given a pv-7 client, when it joins, then matchmake rejects it; goldenFrames regenerate deliberately in this PR.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Q&A record (Eric, 2026-07-21, pre-implementation):** cannon/star numbers approved as proposed; ranges NOT extended beyond radar (= gun base); lit-from-above confirmed; reveal parity is FULL truesight (ships + mines + ballistics), firer-only; the zone circle is public-at-radar-range with the firer's identity ("visible that you're in the range… highlight in the firing player's color"), no literal victim messaging; interregnum controls/upgrade assumptions all confirmed.
- **Why no new GameEvent kind:** the burst flash reuses `burst`; the zone is contact-like state, not a one-shot event — the only wire growth is `litZones`. Smallest PV8 surface.
- **Why `by` on LitZoneView:** Eric ruled the circle renders in the firing player's color; hues arrive with 1.12's roster color index, so the wire carries the firer's ship id now (roster-resolvable) and this story tints own/enemy with the existing palette convention.
- **Zone-visibility rule shape:** owner-always OR `dist(observer, center) ≤ effective radarRange` — deliberately no LOS and no sweep gate (a 10 s flare in the sky, not a hull paint); zone-center distance, not circle-edge, keeps the rule one comparison (design-target simplification).
- **Slot-index coupling is the client landmine:** `weaponArc.ts`/`firing.ts` key behavior off `SLOT_TORPEDO=1`/`SLOT_MINE=2` literals; 1.7 makes slot identity hull-dependent, so those branches must become equipment-id-driven WITHOUT changing ML/TB behavior (regression-pinned).
- **Interregnum warts knowingly extended (flagged, not fixed):** BB torpedo/mine-category offers are dead picks (existing applyGrantEffects no-op guard covers ammo grants; count/stats still apply); gun-category upgrades apply to the standard gun only, so an upgraded gun can out-range the cannon (dies with Epic 2 economy).
- Eric directive: route subagent model selection via `/orchestrate` (task-complexity-based), as in 1.3–1.6.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. BB loadout fit, pass-through stats + rangeU parity, guardrail pins, PV8.
- `npm test -w server` -- expected: green incl. cannon/starShells matrices, lit-zone visibility invariants (14 channels), deliberate goldenFrames regen, torpedo/mine/boost suites untouched-green.
- `npm test -w client` -- expected: green incl. id-aware arc/firing branches with ML/TB regressions, litZones render, HUD labels.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): pick BB — key 2 + click lobs the heavy shell (big burst), key 3 + click pops a flare that lights a fog circle for 10 s, paints hidden ships/mines as live intel, and shows the glow to anyone whose radar reaches it; TB/ML play exactly as before.
