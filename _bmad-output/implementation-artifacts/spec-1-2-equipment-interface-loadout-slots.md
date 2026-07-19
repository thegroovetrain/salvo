---
title: 'Story 1.2: Equipment Interface & Loadout Slots'
type: 'refactor'
created: '2026-07-18'
status: 'in-progress'
baseline_revision: '607eb2f8488b61286cccea30818b5f54da9f9275'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Fitted systems are a positional 3-weapon special case — `WEAPON_SYSTEMS[input.weapon]`, `ShipRecord.ammo: WeaponAmmo[]` indexed by `WeaponId` — so every future fitted system (smoke 1.6, star shells 1.7, decoy 1.8, boost 1.9) would need its own parallel plumbing, and there is no slot grammar for class loadouts to build on.

**Approach:** Port `server/src/game/weapons/` to `server/src/game/equipment/` under one `Equipment` interface (`id`, `isWeapon`, `tick()`, `activate() → ActivationResult` with denial reason) with a string-keyed registry; give ships 4-slot `loadout` state (`{ equipmentId, state }` per slot, defined in NEW `shared/src/sim/loadout.ts`) that IS the equipment runtime (one-structure law — `ShipRecord.ammo` is replaced, not duplicated); route all activation through a single sinking-activation gate passthrough. Pure behavior-preserving refactor plus empty-capable extra-slot plumbing: byte-identical wire output.

## Boundaries & Constraints

**Always:**
- Byte-identical wire output: `goldenFrames.test.ts` fixture replays unchanged; `OwnShip.ammo`/`OwnShip.weapon` wire shapes and field order untouched; `frames.ts` derives the wire ammo array from loadout slots 0–2 in slot order.
- One-structure law: `ShipRecord.ammo` is REPLACED by `loadout: LoadoutSlot[]` — no parallel ammo structure anywhere. Slot `state` today is exactly the `WeaponAmmo` shape (`{ n, reloadMsLeft }`) so wire derivation is identity.
- Slot grammar: 4 slots — slot 0 gun, slots 1–2 specials (today: torpedo, mine), slot 3 extra, `equipmentId: null` = empty. Current universal fit maps every class to `[gun, torpedo, mine, empty]`, preserving `input.weapon` (0/1/2) → slot index 0/1/2 with no wire or `inputs.ts` validation change.
- Every slot's equipment ticks every tick regardless of selection (FR5) — today's `for (const sys of WEAPON_SYSTEMS) sys.tick(...)` semantics preserved per-slot; empty slots skipped.
- `activate()` returns `ActivationResult` (`{ ok: true } | { ok: false; reason }` — reasons at minimum no-ammo / out-of-arc / empty-slot) derived from EXISTING internal outcomes without altering them (gun arc-miss still doesn't drain the pool; torpedo/mine denial paths unchanged). The result is consumed only by tests — no wire event, no new client feedback.
- The sinking-activation gate is ONE function, the only path to `activate()` (wraps today's single dispatch at `world.ts` fireControl); passthrough (always allow) with the Epic-5/D4 TBD noted in a comment.
- `game/combat.ts` compat re-export retained (target updated to `equipment/guns.js`); `game/` keeps zero Colyseus imports; complexity ≤ 10; `PROTOCOL_VERSION` unchanged.
- All existing tests stay green — mechanical import-path/structure updates allowed, assertions must not weaken. `shipClasses.test.ts` (Cruiser byte-identity), `stats.test.ts`, `damageGuardrail.test.ts` untouched. Check `barrel.test.ts` before adding the `sim/loadout.js` barrel export.
- Upgrade grant effects (`AMMO_UPGRADE_WEAPON` +1 round, clamped) and the three loadout init sites (`addShip`/`redeployShip`/`respawn`, today `freshWeaponAmmo`) keep identical semantics against slot state; `lastFireSeq` stays never-reset-on-respawn.

**Block If:**
- Byte-identical golden-frames output cannot be preserved without behavior change.
- The one-structure law or slot grammar forces a change to `shared/src/types.ts` wire shapes or `PROTOCOL_VERSION`.

**Never:**
- No new equipment (smoke/star shells/decoy/boost arrive in 1.6–1.9); no sinking policy logic; no counterIntel work.
- No client changes (client imports only shared types, which keep their names: `WeaponId`, `WEAPON`, `WeaponAmmo`, `weaponMaxAmmo`, `weaponReloadMs` all survive); no denial events on the wire; no CONFIG value changes; no changes to event generation or `signals.ts` rows.
- No behavior or balance change of any kind; no test deletion or weakening.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fire selected weapon | `input.weapon=1`, fireSeq newly incremented, torpedo ready | Slot 1 activates via gate → identical torpedo spawn as today | No error |
| Denied activation | Selected slot empty pool / arc-miss | `{ ok: false, reason }`; internal effects identical to today (arc-miss keeps pool) | Silent server-side, as today |
| Empty extra slot | Slot 3 (`equipmentId: null`) | Never ticked, never activatable; `activate` path yields empty-slot denial without dereferencing | No crash |
| Reload while deselected | Torpedo reloading, gun selected | Slot 1 reload still ticks every tick | No error |
| Respawn/redeploy | Ship re-enters | Fresh full loadout from `ship.stats`, same values as `freshWeaponAmmo` today | No error |

</intent-contract>

## Code Map

- `server/src/game/weapons/` (488 LOC: index 71, guns 94, torpedoes 59, mines 141, ballistics 76, ammo 47) -- becomes `equipment/`; `WeaponSystem`/`FireContext`/positional `WEAPON_SYSTEMS` (index.ts L22-43) are the shapes to replace.
- `shared/src/sim/loadout.ts` -- NEW: `LoadoutSlot { equipmentId, state }`, slot-grammar constants, equipment id type; export from `shared/src/index.ts` sim block (after `stats.js`).
- `server/src/game/world.ts` (706 LOC) -- `ShipRecord.ammo` L125 → `loadout`; `fireControl` L600-608 (tick loop + THE dispatch site L606 to wrap with the gate); `fireContext` L611-619; init sites L253/L308/L703; upgrade ammo grant L368-393.
- `server/src/game/frames.ts` -- `weaponAmmo(ship)` import; derives wire ammo (sole spatial exit; must not change materially).
- `server/src/game/signals.ts` -- imports `type MineState` from weapons/index; mechanical path update only.
- `server/src/game/combat.ts` -- 5-LOC compat re-export; retarget to `./equipment/guns.js`.
- `shared/src/sim/stats.ts` -- `weaponMaxAmmo`/`weaponReloadMs` positional helpers stay untouched (client HUD uses them).
- Tests with weapons imports (mechanical updates): `combat.test.ts`, `weapons.test.ts`, `ammo.test.ts`, `ballistics.test.ts`, `torpedoSelfHit.test.ts`, `signals.test.ts`.
- Preservation gates: `server/src/__tests__/goldenFrames.test.ts` (byte-identity), `shared/src/__tests__/shipClasses.test.ts` (Cruiser identity), `upgrades.test.ts` (+1-round grant), `client/src/__tests__/hud.test.ts` (untouched).

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/sim/loadout.ts` -- NEW: `LoadoutSlot`, equipment id type (`'gun' | 'torpedo' | 'mine'` for now), `SLOT_COUNT = 4` + slot-role grammar, default-loadout builder used by all server init sites; barrel-export -- the shared slot spine every later loadout story fills.
- [ ] `server/src/game/equipment/` -- rename from `weapons/`; `index.ts` defines `Equipment` (`id`, `isWeapon`, `tick`, `activate(ctx) → ActivationResult`), `ActivationResult` with denial reasons, string-keyed frozen `EQUIPMENT` registry; port guns/torpedoes/mines to rows (`fire` → `activate` computing the result from existing outcomes); ammo.ts/ballistics.ts mechanical -- the one grammar for every fitted system.
- [ ] `server/src/game/world.ts` -- `ShipRecord.loadout`; `fireControl` ticks per-slot and dispatches the selected slot through NEW single sinking-activation gate passthrough; init sites + ammo-upgrade grant rewritten against slot state -- one-structure law + FR5 + the gate AC.
- [ ] `server/src/game/frames.ts` + `signals.ts` + `combat.ts` -- mechanical import/derivation updates; combat.ts keeps `export *` compat -- wire derivation stays byte-identical.
- [ ] Existing server tests -- mechanical import-path updates only (six files) -- assertions unweakened.
- [ ] `server/src/__tests__/equipment.test.ts` -- NEW: registry/interface conformance (every row has id/isWeapon/tick/activate; frozen), denial reasons per system incl. arc-miss-keeps-pool, empty-slot denial safety, deselected-reload FR5 tick test, gate-is-sole-dispatch-path check, loadout init/respawn parity with old `freshWeaponAmmo` values -- pins the new surface.

**Acceptance Criteria:**
- Given the refactored server, when the pre-refactor golden-frames fixture replays, then every frame's serialized bytes are identical (fixture file unchanged in git).
- Given any ship, when any weapon is reloading and a different slot is selected, then its reload still advances every tick (FR5 test).
- Given the selected slot's activation, when it fires or is denied, then the gate function is the only call path to `activate()` and denial returns a reason without changing internal effects.
- Given slot 3 empty (`equipmentId: null`), when the loadout ticks or activation is attempted against it, then nothing crashes and denial reason is empty-slot.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- Registry is string-keyed by equipment id (like `SIGNAL_REGISTRY`), not positional; selection maps `input.weapon` → slot index → slot's `equipmentId` → registry row. `WeaponId` stays the wire/selection type — do not rename shared types.
- `FireContext` survives as the activation context (imitated by signals.ts; keep the narrow-capabilities pattern). `isWeapon` is `true` for all three current systems — the flag exists for 1.6+ non-weapon specials.
- Slot `state` is intentionally exactly the `WeaponAmmo` shape today; future equipment may need richer state — keep the type open in loadout.ts (state interface with `n`/`reloadMsLeft` now, no speculative fields).
- Class→default-loadout mapping lives with the slot grammar in shared loadout.ts (gameplay-load-bearing; 1.6–1.9 will vary it per class), but today returns the universal `[gun, torpedo, mine, empty]` for every class.

## Verification

**Commands:**
- `npm test -w server` -- expected: all server tests green including new equipment suite; goldenFrames snapshot unchanged (git diff clean on `__snapshots__/`).
- `npm test -w shared` -- expected: green, including barrel + shipClasses identity.
- `npm run check` -- expected: lint (complexity ≤ 10), tsc all workspaces, all tests green.
