---
title: 'Story 1.4: Universal Standard Gun'
type: 'feature'
created: '2026-07-21'
status: 'in-progress'
baseline_revision: '226a4273aa83a29e3a5aca3e5ab5b480c69cba08'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** The gun is still a selectable weapon (`input.weapon` 0/1/2) with a 2-round broadside pool, ±60° port/starboard arcs, 480u range, a single-target first-contact hit model, and a hull-length dead ring (64u on a battleship, deferred here from 1.3) — none of which matches Eric's ratified weapon model.

**Approach:** Land Eric's 2026-07-21 rulings in full: the gun becomes the permanently-selected default weapon (no selector; torpedo/mine become interim prime-next-shot skillshots), fires 360° to anywhere in radar range, single shot on a 3s reload, with a new burst-at-clicked-point hit mechanic and per-weapon hit rules as an architectural seam. Wire contract changes → PROTOCOL_VERSION 4→5.

## Boundaries & Constraints

**Always:**
- **Eric rulings (2026-07-21, verbatim intent — all numbers below marked PROPOSED are design targets in CONFIG, tunable):**
  1. **Gun always selected.** No activatable slot chooses it. Other equipment is either a *skillshot* (prime: your next shot fires that instead, then the gun is the weapon again) or a plain activatable ability. Full model lands THIS story: `input.weapon` selector retired; torpedo/mine become the interim skillshots.
  2. **Gun reload: 3 seconds, single shot.** No ammo pool (implemented as a 1-round pool @ 3000ms — identical semantics, minimal churn to ammo machinery; HUD presents it as a pure cooldown).
  3. **Hit mechanic (per-weapon; this is the GUN's rule, and the code seam must make per-weapon hit rules easy to add):** the shell flies to the clicked xy (existing `aim`+`aimDist` wire encoding, clamped to effective range) and **bursts there in `burstRadius`** — every enemy hull in the radius takes full `damage`. If something intercepts the shell early, the interceptor takes smaller `contactDamage`, there is **no burst**, and the shell stops (bodyblocking is an intended interaction). **Proximity exception:** if the intercepted thing is already inside what would be the blast radius around the target xy, the shell bursts for full damage anyway (burst always centers on the target xy; no double-dipping — a burst victim takes burst damage, not contact+burst). Early island contact = shell stops, no damage, no burst — unless within the proximity exception, in which case it bursts (plain radius query, no LOS inside the small burst).
  4. **Range = radar range.** Base gun range is derived from `CONFIG.vision.radar` (650u) — single source, no duplicated 650. You can shoot anywhere in radar range.
  5. **Arc = 360°.** `CONFIG.gun.mounts` retired; gun is never out-of-arc. Torpedo bow arc and mine astern drop unchanged.
  6. **No dead ring.** Shells spawn at the hull silhouette edge along the aim bearing (polygon boundary + shellRadius), not `length/2 + clearance`. Owner immunity (1.3) already makes this safe.
- **PROPOSED numbers (flag for Eric in PR):** `burstRadius: 15`u, `damage: 25` (unchanged), `contactDamage: 10`. All < 70 min hull hp; extend `damageGuardrail.test.ts` to pin burst AND contact damage < min hp.
- **Prime UX (defaults Eric saw and did not challenge; denial-keeps-prime is an engineering call):** Digit2/3 prime torpedo/mine, same key again cancels, Digit1 explicitly reverts to gun, no timeout, gun reload ticks while primed (every slot's reload ticks every tick regardless — existing law). A click the client predicts as denied (reloading/out-of-arc) keeps the prime and pulses denied feedback; only a fireable click consumes the prime. CTRL+digit upgrade bindings untouched.
- **Wire:** `InputMsg.weapon: WeaponId` → `InputMsg.slot` (int 0..SLOT_COUNT-1, default 0, validated in `inputs.ts`; the click's slot IS the resolved prime — server keeps no priming state). `OwnShip.weapon` removed; `OwnShip.ammo` becomes slot-aligned (length SLOT_COUNT, null for empty slots). `PROTOCOL_VERSION` 4→5 (+ `barrel.test.ts` pin). `BallisticEvent` stays `{id,x,y,vx,vy,t}` — no target/range-derivable fields, ever.
- **New `burst` event** `{k:'burst', id, x, y}` (radius NOT on wire — CONFIG is shared): one signal-registry row (visible to shell owner or if point sighted, same pattern as boom); registry exhaustiveness guard + perception invariant tests extended. Early-intercept keeps the existing `boom` (spark-vs-splash client branch intact). Damage stays victim-private `dmg` events; multi-victim bursts emit one `dmg` per victim.
- **Interregnum upgrades:** `gunAmmo` id kept for wire stability but excluded from `rollOffer` candidates AND neutralized in `effectiveStats` (gun maxAmmo pinned to 1 regardless of counts — enforces single-shot). `gunReload` keeps multiplying 3000ms; `gunRange` keeps multiplying the 650 base (a stacked gun can briefly outrange radar — known-ugly interregnum artifact, dies in Epic 2). `offers.test.ts` category partition updated (guns category: gunRange+gunReload offerable).
- Shared-sim purity, seeded RNG only, complexity ≤ 10, `frames.ts` sole spatial chokepoint, contacts/events exclusively from `perception.observe()`.
- Golden-frames fixture regenerated deliberately in the same commit as the PV5 bump; all 10 `server/scripts/*.mjs` smokes updated (`weapon:` → `slot:`).

**Block If:**
- The burst mechanic cannot be expressed without adding range/target-derivable fields to any wire event.
- The rework forces changes to torpedo/mine combat behavior (arcs, damage, reload, caps) beyond selection plumbing.
- Perception changes beyond adding the burst registry row + its invariant coverage are needed (hull-aware perception stays deferred).

**Never:**
- No latency compensation / harness (1.5), no per-class loadouts (1.6–1.8), no hotbar or Q/E/R/F scheme (Epic 2), no hull-aware perception (own deferred story), no sinking-gate policy change (Epic 5).
- Do not strip or weaken upgrade spend; do not edit DESIGN.md/EXPERIENCE.md; no gameplay values into CLIENT_CONFIG.
- Do not keep dual code paths: the legacy `fireGuns`/selector path dies, not gets gated.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plain click, gun ready | slot 0, aim at 300u | Shell spawns at hull edge, flies to clicked xy, bursts; hulls within 15u take 25 | No error |
| Click during reload | slot 0, reloadMsLeft > 0 | No shot; click consumed; client denied pulse | Silent server-side |
| Bodyblock far from target | Enemy B crosses path 200u short of target | B takes contactDamage 10, no burst, shell stops (boom at contact) | No error |
| Bodyblock near target | Interceptor within 15u of target xy | Full burst at target xy: 25 to every hull in radius incl. interceptor | No error |
| Burst catches several | Two enemies within 15u of target | Each takes 25 via its own victim-private dmg event; one burst event | No error |
| Owner in own burst | Firer's hull inside burst radius | Zero damage (owner immunity) | No error |
| Aft shot | Aim astern | Fires (360°) — no out-of-arc denial for gun | No error |
| Click beyond radar range | aimDist 900 | Target clamped to effective range along bearing; bursts there | No error |
| Prime → fire | Digit2, then click (tube loaded, in bow arc) | Torpedo fires; prime reverts to gun | No error |
| Prime → denied click | Digit2, click out of bow arc | Denied pulse; prime KEPT; gun not fired | No error |
| Prime → cancel | Digit2, Digit2 (or Digit1) | Prime cleared, gun selected | No error |
| Malformed slot | slot 7 / 1.5 / NaN | Whole message dropped (existing sanitize law) | Silent drop |
| Stale client | Join with pv 4 | Rejected by protocol gate | Join error, as today |
| Old offer with gunAmmo | Spend gunAmmo (pre-rolled offer) | Count increments but effectiveStats pins gun maxAmmo 1 (no effect) | No error |

</intent-contract>

## Code Map

- `shared/src/constants.ts:130-148` -- CONFIG.gun rework: drop maxAmmo:2→1, mounts, shellRange; add burstRadius, contactDamage; range derived from vision.radar; comment rewrite.
- `shared/src/types.ts` -- InputMsg.slot replaces weapon (:66); OwnShip.weapon removed, ammo slot-aligned (:118-119); new BurstEvent + GameEvent union (:291-300); WeaponId/WEAPON retirement or demotion to equipment-internal.
- `shared/src/index.ts:13` -- PROTOCOL_VERSION 5.
- `shared/src/sim/shell.ts` -- ShellState gains target point + burst fields; stepShell outcome union gains burst variant (reach-target and proximity-exception cases); per-weapon hit-rule seam documented.
- `shared/src/sim/stats.ts:69-117` -- gun maxAmmo pinned 1 (gunAmmo neutralized); rangeU base = vision.radar; weaponMaxAmmo/weaponReloadMs re-keyed off slots/equipment ids.
- `shared/src/sim/loadout.ts` -- slot grammar unchanged; drop `input.weapon === 0` comments; helpers re-keyed by EquipmentId.
- `shared/src/sim/offers.ts` -- exclude gunAmmo from candidates; category partition intact.
- `server/src/game/inputs.ts:23-86` -- slot validation replaces isWeaponId; AIM_DIST_MAX accommodates radar-range aiming.
- `server/src/game/world.ts:396-424,654-687` -- fireControl routes `input.slot` through sinkingActivationGate; AMMO_UPGRADE_WEAPON map updated; burst resolution: radius query over hulls at target xy, owner excluded, one dmg per victim via hitShip.
- `server/src/game/equipment/ballistics.ts:32-77` -- hull-edge spawn (silhouette ray along bearing + shellRadius) replaces hullClearOffset for shells; shell carries target point.
- `server/src/game/equipment/guns.ts` -- 360° (arc check removed), shellRangeFor from new muzzle math + radar-derived range; legacy fireGuns path deleted.
- `server/src/game/equipment/torpedoes.ts / mines.ts / index.ts` -- slot-routed activation (guards re-keyed from WEAPON.* to slot/equipmentId); weaponAmmo → slot-aligned.
- `server/src/game/signals.ts:398-424` -- burst row + exhaustiveness.
- `server/src/game/frames.ts:21-60` -- OwnShip without weapon; slot-aligned ammo.
- `server/scripts/*.mjs` (10 files) -- weapon:→slot:.
- `client/src/input/keyboard.ts:34-259` -- WEAPON_KEYS→prime model (prime/cancel/revert; CTRL path intact).
- `client/src/sim/inputSampler.ts` -- slot on wire; prime-consumption on predicted-fireable click.
- `client/src/main.ts:189-222,697-728,810-815` -- ownStatus/renderFiring/simTick re-keyed to slot+prime; gun ready = cooldown.
- `client/src/render/hud.ts:88-510` -- chips: gun cooldown sweep (no segments), primed highlight replaces selected.
- `client/src/render/weaponArc.ts` -- gun always in arc; bearingGunMount retired.
- `client/src/render/firing.ts:42-194` -- broadside wedges dropped; reticle + range-clamp marker vs radar-derived range; burst-radius ring at reticle optional-if-trivial, else skip.
- `client/src/render/effects.ts:18-39` + `net/roomBindings.ts:270-319` -- new 'burst' effect kind wired on burst event; fireTone keyed by equipment.
- `client/src/ui/upgradeToast.ts:15-35` -- labels survive (ids kept); no dead-pick copy since gunAmmo never offered.
- Tests: shared `damageGuardrail` (+burst/contact pins), `shell` (burst/proximity/bodyblock/owner cases), `stats/upgrades` (maxAmmo pin, range base), `offers` (candidate exclusion), `barrel` (PV5); server `equipment/weapons/combat/upgrades` re-keyed, `signals`/`perception` (+burst row), `goldenFrames` regen, `drones.test` (slot 0), `inputs` (slot validation); client `keyboard` (prime model rewrite), `inputSampler` (slot), `hud`, `weaponArc`, `deniedFire`, `tones`.

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/` (constants, types, index, sim/shell, sim/stats, sim/loadout, sim/offers) -- new gun CONFIG + burst mechanic in stepShell + slot wire contract + PV5 + interregnum upgrade neutralization, with shell-mechanic unit tests covering the full I/O matrix -- the deterministic core both sides share.
- [ ] `server/src/game/` (inputs, world, equipment/*, signals, frames) + smokes -- slot-routed fire control, hull-edge spawn, burst resolution + registry row, slot-aligned frames -- authoritative side complete, invariants green.
- [ ] `client/src/` (input, sim sampler, main, render hud/weaponArc/firing/effects, net/roomBindings) -- prime-next-shot UX, cooldown gun chip, burst visual, denial feedback -- playable end-to-end.
- [ ] Test sweep -- rewrite/extend named suites, golden-frames regen with PV5 same commit, all smokes updated -- `npm run check` green.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `1-4-universal-standard-gun` status transition at completion.

**Acceptance Criteria:**
- Given any class, when it fires the gun, then behavior is byte-identical across classes (FR3) — no per-class gun stat anywhere.
- Given the burst mechanic, when shells resolve, then damage reaches clients only as victim-private dmg events and the burst/boom events carry no range- or target-derivable fields; perception invariant suites (registry-driven) stay green with the new row.
- Given the prime model, when a player primes, fires, cancels, or is denied, then every path gives explicit feedback (never silence) and the gun is the weapon again after any successful special shot.
- Given the retired selector, when any client or smoke sends the old `weapon` field, then the message fails validation and PV4 clients are rejected at join.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Per-weapon hit rules are the point, not an accident** (Eric: "all of this is per-weapon and each weapon has its own rules — whatever helps you with that later"). The seam: each equipment's activate() builds its projectile with its own hit-rule parameters carried on the projectile state (gun: burst fields; torpedo: contact-only, as today); stepShell resolves from the projectile's own fields, not from global CONFIG branching. The BB long-range cannon (1.7) will probably reuse the burst rule with different numbers.
- **Single-shot as 1-round pool**: keeps ammo/reload machinery, HUD math, and `WeaponAmmo` wire shape; "no pool" is presentational (gun chip renders a cooldown sweep, no segments).
- **Server stays stateless about priming**: the client resolves the prime at click time and the fire input carries the slot. Anti-cheat surface is unchanged — a hacked client could already fire any weapon it wants; validation (slot fitted, loaded, in-arc) is what matters and stays server-side.
- **Denial-keeps-prime** is a client-side prediction of server denial; a rare mismatch costs only cosmetics (prime state is UX, the wire slot per click is the truth).
- Range-ring UX beyond the existing clamp marker, burst-ring reticle polish, and any hotbar-like chrome are Epic 2 territory — keep client changes minimal.
- Eric directive for implementation: route model selection for implementation agents via `/orchestrate` (task-complexity-based), as in story 1.3.
- Interregnum artifacts knowingly accepted (die in Epic 2): gunRange-stacked guns outrange radar; gunAmmo id exists but is never offered and has no effect; slot-index==equipment coupling persists until 1.6.

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. new burst-mechanic suite, damageGuardrail contact/burst pins, offers exclusion, PV5 barrel pin.
- `npm test -w server` -- expected: green incl. burst registry row in signals/perception invariants, slot-routed equipment suites, deliberate golden-frames regen.
- `npm test -w client` -- expected: green incl. prime-model keyboard suite, slot sampler, cooldown HUD.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): fire 360° at radar-range blips, watch bursts; bodyblock with a drone; prime/cancel/fire torpedo and mine; confirm gun cooldown chip reads clean.
