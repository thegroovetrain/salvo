---
title: 'Story 1.6: Torpedo Boat Loadout'
type: 'feature'
created: '2026-07-21'
status: 'in-progress'
baseline_revision: 'e26dac25449834f4a06cfabc071c83df19119142'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** Every class still sails the interregnum universal fit (`[gun, torpedo, mine, empty]`) — the Torpedo Boat's ratified identity (tubes + activated speed boost, inherited from the cut gunboat) exists only on paper, and no timed-stat mechanism exists anywhere: `effectiveStats()` is time-invariant and client prediction holds a static kinematics snapshot, so an activated "+speed for 6s" has no legal path into the sim on either side. Separately, Eric re-ruled hull speeds to knot-realistic values (2026-07-21, this story's Q&A): TB 45, ML 40, BS 35, torpedo 60, boost +10.

**Approach:** Rescale the four CONFIG speeds; make the loadout per-hull (TB = `[gun, torpedo, speedBoost, empty]`; BB/ML/drones keep the universal fit until 1.7/1.8); add a `speedBoost` Equipment (`isWeapon: false`, 1-charge pool, 18s reload via the existing ammo machinery) whose activation opens a 6s window during which a shared pure helper raises `maxSpeed` by `CONFIG.speedBoost.speedBonus` — server `stepShips` and client prediction/replay both derive per-tick kinematics from the same (stats, boostUntil, now). Wire: `InputMsg` gains an activation counter (`actSeq`/`actSlot`, instant key-press activation — abilities are not aimed and never prime), `OwnShip` gains owner-only `boostUntil`; PROTOCOL_VERSION → 7.

## Boundaries & Constraints

**Always:**
- Eric's ruled numbers verbatim, as CONFIG design targets: TB/ML/BS maxSpeed 45/40/35, torpedo speed 60, boost +10 for 6000 ms on an 18000 ms cooldown. Boost raises the forward maxSpeed CAP only (option a: hull accelerates toward it at class accel, decays back naturally on expiry; reverseSpeed untouched; telegraph still commands — half-ahead gets ~half the bonus).
- The boost's speed effect flows through ONE shared pure helper both sides call per-tick; nothing re-derives a boosted stat ad hoc. Prediction replay applies the identical per-tick kinematics the server used (boost-active keyed off the server-clock estimate vs `boostUntil`); reconcile transients fold into the existing visual-error decay.
- Owner-only wire state: `boostUntil` rides `OwnShip` via `frames.ts` only; NO field on contacts/blips/events reveals boost beyond observed kinematics. Perception invariant + goldenFrames tests stay green (goldenFrames regen is deliberate, same PR as PV7).
- `actSeq` is validated in `inputs.ts` like every input field (finite int ≥ 0, monotonic gate vs `lastActSeq`, malformed message dropped whole); it activates ONLY `isWeapon: false` equipment, routes through the sinking-activation gate, and is structurally inert for drones (they send 0) and for weapon slots.
- Torpedo laws unchanged: permanent owner immunity (the boost × torpedo ruling: immunity covers it, NO new rule, no new test needed per Eric), bow clearance, never radar-painted; `damageGuardrail` outrun pins hold (60 > 46 fastest drone > 45 fastest class).
- Denied activation (cooling/dead) gives explicit client feedback via the existing denied-pulse path — never silence. Boost activation while active is impossible by construction (reload 18s ≥ duration 6s ⇒ active implies cooling ⇒ `no-ammo`).
- Controls stay deferred to Epic 2 (Eric, this Q&A): current bindings extended minimally — the existing slot-2 key ("3") activates the boost on TB instead of priming; no Q/E/R/F rebinding in this story. The Epic 2 ruling is recorded in epics.md Story 2.1 (already edited).
- Legacy upgrades never touch the boost (no boost category); `maxSpeed` upgrade stacks multiply the base cap before the additive bonus.
- Sim purity, complexity ≤ 10, `npm run check` green, one PR.

**Block If:**
- The drone envelopes appear to need changing (they stay byte-for-byte pinned; the TB-45-vs-droneSmall-46 inversion is FLAGGED for Eric, not fixed here).
- Any wire field beyond `actSeq`/`actSlot`/`boostUntil` seems necessary, or boost state seems to need enemy visibility.
- Any CONFIG number beyond the five ruled values (4 speeds + boost trio) seems to need changing.

**Never:**
- No Q/E/R/F rebinding, no hotbar, no new economy behavior (offers still roll all 5 categories — dead mine picks on TB are a known interregnum wart, flagged).
- No fireT back-dating for ability activation (boost starts at server apply time; note the ~½RTT prediction transient in Design Notes).
- No BB/ML loadout changes (1.7/1.8), no new perception/registry rows (boost emits nothing spatial).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Activate ready boost (TB) | actSeq advances, slot 2, pool full | consume charge, `boostUntil = now + 6000`, cap +10; reload starts | none |
| Activate while cooling/active | actSeq advances, `reloadMsLeft > 0` | no state change; client denied pulse | `no-ammo` (test-only reason) |
| Activate while dead / while sinking-gated | actSeq advances, `!alive` | no state change | `dead` from the gate |
| actSeq on a weapon slot (BB/ML slot 2, or forged) | actSeq advances, `actSlot` holds weapon/empty | no state change, input otherwise applied | silently inert |
| Malformed actSeq/actSlot | non-finite / negative / non-int slot | whole message dropped (sanitize law) | drop, no log |
| Boost expiry | `now ≥ boostUntil`, speed 55 | cap back to 45; speed decays at class decel | none |
| Death/respawn/redeploy during boost | ship sinks mid-window | `boostUntil` reset to 0 with loadout reset | none |
| Drone tick | drone input `actSeq: 0` | never activates (monotonic gate never passes) | none |
| Prime interaction | torpedo primed, boost activated | prime untouched; click still fires torpedo | none |
| pv-6 client joins | old PROTOCOL_VERSION | rejected at matchmake | existing `protocolVersionError` |

</intent-contract>

## Code Map

- `shared/src/constants.ts:35,47,59,163` -- rescale maxSpeed 45/40/35 + torpedo.speed 60 (fix stale comments); NEW `CONFIG.speedBoost { speedBonus: 10, durationMs: 6000, maxAmmo: 1, reloadMs: 18000 }` as a peer of gun/torpedo/mine.
- `shared/src/types.ts` -- `InputMsg.actSeq`/`actSlot` (doc: instant ability activation, 0-sentinel); `OwnShip.boostUntil` (owner-only, 0 = inactive, server-clock ms).
- `shared/src/index.ts` -- PROTOCOL_VERSION 7; barrel exports for new modules.
- `shared/src/sim/loadout.ts` -- `EquipmentId` += `'speedBoost'`; `EQUIPMENT_IS_WEAPON: Record<EquipmentId, boolean>` (single source — server rows read it); `defaultLoadout(stats)` → `loadoutFor(hullId, stats)`: TB gets `[gun, torpedo, speedBoost, empty]`, every other hull (BB/ML/drones) the universal fit; extend `equipmentMaxAmmo`/`equipmentReloadMs`.
- `shared/src/sim/boost.ts` -- NEW pure helper `boostedKinematics(kin, bonus, active): ShipConfig` (forward maxSpeed only) — THE shared hook both sides call.
- `shared/src/sim/stats.ts` -- `EffectiveStats.boost: EffectiveBoost` pass-through from `CONFIG.speedBoost` (no upgrade touches it).
- `server/src/game/equipment/boost.ts` -- NEW row: `isWeapon: false`, `tick` = shared reload machinery, `activate` = consume + `ctx.ship.boostUntil = ctx.now + durationMs` (ignores `ctx.fireT`). Register in `equipment/index.ts` (`EQUIPMENT` record forces it).
- `server/src/game/world.ts` -- `ShipRecord.boostUntil`/`lastActSeq` (reset on spawn/respawn/redeploy); ability-activation control beside `fireControl` (monotonic actSeq gate → sinking gate → `isWeapon:false` check → activate); `stepShips` feeds `boostedKinematics(ship.stats.kinematics, …, now < ship.boostUntil)`; loadout builds via `loadoutFor`.
- `server/src/game/inputs.ts` -- sanitize `actSeq` (finite int ≥ 0) + `actSlot` (`isSlotIndex`); `neutralInput` gains both.
- `server/src/game/frames.ts` -- `toOwnShip` += `boostUntil`.
- `server/src/game/drones.ts:129` -- `buildInput` += `actSeq: 0, actSlot: 0`.
- `server/scripts/*.mjs` (10) -- add `actSeq: 0, actSlot: 0` to every input literal.
- `client/src/input/keyboard.ts` -- slot-2 keydown consults own loadout: `isWeapon:false` ⇒ emit activation press (local actSeq++), weapon ⇒ prime as today; prime state never lands on an ability slot.
- `client/src/sim/inputSampler.ts` -- thread `actSeq`/`actSlot` on BOTH send paths; predicted denied check for activation (cooling/dead) drives the denied pulse.
- `client/src/sim/prediction.ts` -- carry `boostUntil` (predicted at press from the clock estimate, overwritten by authoritative `you.boostUntil` each frame); `localTick` and `replayFrom` compute per-tick kin via `boostedKinematics` with each tick's server-time estimate.
- `client/src/main.ts` / `net/roomBindings.ts` -- wire keyboard activation → sampler; own-loadout derivation from `you.cls` (via `loadoutFor`); pass `boostUntil` into predictor + HUD.
- `client/src/render/hud.ts` -- chip row becomes loadout-driven (labels from own loadout, not the hardcoded gun/torpedo/mine trio): TB slot 2 renders a BOOST cooldown chip (gun-style sweep) + active-window state; speed-needle denominator uses the boosted cap while active.
- `_bmad-output/planning-artifacts/epics.md` -- Story 2.1 controls re-ruling (DONE, keep).
- Tests: shared `shipClasses.test.ts` (deliberate class-table update 45/40/35), `damageGuardrail.test.ts` (60 outruns all), `loadout`/`stats`/`boost` suites, `barrel.test.ts` PV7; server `boost` equipment suite (matrix rows), `inputs.test.ts` (actSeq sanitize + monotonic), `world` boost-kinematics + reset suite, `frames`/perception owner-only + goldenFrames regen, `torpedoSelfHit`/`drones` stay green; client `keyboard` (activate-vs-prime), `inputSampler` (actSeq both paths), `prediction` (boost window survives replay), `hud` label logic.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/` (constants, types, index, sim/loadout, sim/boost, sim/stats) -- rescale + speedBoost config/equipment-id/is-weapon map + per-hull loadout + shared boost hook + PV7 -- the deterministic spine both sides share, unit-tested (incl. deliberate class-table update).
- [ ] `server/src/game/` (equipment/boost + index, world, inputs, frames, drones) + `server/scripts/*.mjs` -- activation control, boosted stepShips, owner-only boostUntil, sanitize, smoke re-keys -- authoritative boost complete against the full I/O matrix, goldenFrames regenerated deliberately.
- [ ] `client/src/` (input/keyboard, sim/inputSampler, sim/prediction, main, net/roomBindings, render/hud) -- instant activation, actSeq threading, boost-aware prediction/replay, loadout-driven HUD chips + denied feedback -- prediction parity and explicit feedback end-to-end.
- [ ] Test sweep -- suites in Code Map + `npm run check` green.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-6-torpedo-boat-loadout` status transition at completion.

**Acceptance Criteria:**
- Given a TB spawn, when the loadout builds, then it is `[gun, torpedo, speedBoost, empty]` while BB/ML/drones keep `[gun, torpedo, mine, empty]` — and the TB's slot-2 key activates instantly (never primes), with torpedo prime+click untouched.
- Given the rescale, when CONFIG loads, then TB/ML/BS = 45/40/35 and torpedo = 60, with ordering invariants, outrun guardrails, and self-hit immunity all green and the drone envelopes byte-identical.
- Given a boost activation at full ahead, when 6s elapse, then the hull accelerated toward 55 at class accel and decays back at class decel after expiry — and server positions match client prediction within the existing reconcile tolerances (no persistent fight).
- Given any enemy observer during a boost, when frames build, then no field beyond observed kinematics reveals it; `boostUntil` appears only in the owner's `you`.
- Given a pv-6 client, when it joins, then matchmake rejects it; goldenFrames regenerate deliberately in the same PR.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why cap-raise (option a):** ratified by Eric this Q&A — natural kinematics (≈1.1s to gain the +10 at TB accel 12, then ~4.9s at 55), cleanest prediction story, decay for free from `stepShip`'s existing speed-toward-target behavior.
- **Why a separate actSeq instead of reusing fireSeq:** a click fires the PRIMED weapon; an ability press must not steal or race the click within a tick. Two independent monotonic counters keep both semantics, mirror the proven fireSeq gate, and stay drone-inert by the same structural argument (constant 0).
- **Boost activation is NOT latency-compensated** (ignores `ctx.fireT`): nothing is aimed, so D1's rationale doesn't apply; the client predicts the window at press time and the authoritative `boostUntil` arrives ~½RTT later — worst case a ~2-tick cap mismatch folded into visual-error decay. Revisit only if the harness ever shows it matters.
- **Boosted TB (55) stays under its fish (60)** by Eric's rescale, and permanent owner immunity covers every faster combination (upgrade stacks × boost) — ruled: no new rule, no new test.
- **FLAGGED FOR ERIC (not in scope):** (1) droneSmall (46, pinned) now out-paces the fastest player hull (TB 45) — drones only wander, never flee, so impact is flavor-level, but the "TB is the fastest thing afloat" fantasy technically breaks until re-ruled; (2) offers still roll mine-category upgrades for a TB that carries no mines (dead pick; dies with the Epic 2 economy).
- Eric directive: route implementation-agent model selection via `/orchestrate` (task-complexity-based), as in 1.3/1.4/1.5.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. new class table, guardrails, loadoutFor, boost helper, PV7 pin.
- `npm test -w server` -- expected: green incl. boost equipment matrix, actSeq sanitize/monotonic, boosted stepShips, owner-only boostUntil, deliberate goldenFrames regen, torpedoSelfHit/drone suites untouched-green.
- `npm test -w client` -- expected: green incl. activate-vs-prime, actSeq threading, boost-window replay, HUD labels.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.
- `HC_DEV_OPTIONS=1 node server/scripts/latencyHarness.mjs` -- expected: boots, A/B completes, agreement metrics still favor compensation (advisory; speeds changed, so absolute numbers may shift — structural pass is the bar).

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): pick TB, press the slot-2 key — speed climbs to 55 and falls back ~6s later with no rubber-banding; pressing again while cooling gives the denied pulse; BB/ML unchanged (key 3 still primes mine).
