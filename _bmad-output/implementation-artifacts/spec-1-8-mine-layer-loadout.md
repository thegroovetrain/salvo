---
title: 'Story 1.8: Mine Layer Loadout'
type: 'feature'
created: '2026-07-22'
status: 'in-progress'
baseline_revision: 'aee5cca'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: [multiple-goals, oversized]
---

<intent-contract>

## Intent

**Problem:** The Mine Layer still sails the interregnum universal fit (`[gun, torpedo, mine, empty]`) — its ratified trapper identity exists only on paper, mines are a click-fired single-victim proximity boom (no blast area, no interaction with gunfire, cap 3), and the signature-ability slot is OPEN. Both Eric-gates the GDD flags for 1.8 (mine mechanics + signature ability) were resolved by Eric in the 2026-07-22 invocation: Naval Mines rework + Decoy Buoy.

**Approach:** Fit the Mine Layer with `[gun, mine, decoyBuoy, empty]` (Eric ruling 2026-07-22: Q = Naval Mines, E = Decoy Buoy, R empty, F reserved). Mines become an ACTIVATEABLE (instant, non-aimed — boost input path): drop astern, arm after delay, enemy pass-over trips a BLAST that damages every non-owner hull in `blastRadius`; the owner's own gun bursts detonate own ARMED mines early (full blast); live cap 5, oldest silently evicted, no expiry. Trip radius grows a bit, blast radius exceeds it, mine graphic grows (Eric mid-run ruling). The Decoy Buoy is a stationary server entity dropped astern that radar-paints TO OTHERS exactly like the owner's ship (same blip gate + materialize, id = owner's ship id — wire-indistinguishable per FR10/counterIntel), one live per owner (new placement replaces the old), 30 s lifetime; shooting it produces no Hit Call (interaction is the sanctioned disambiguation). PROTOCOL_VERSION → 9. GDD open notes closed with the rulings.

## Boundaries & Constraints

**Always:**
- Eric's rulings verbatim: mines activateable not skillshot, drop behind ship, enemy pass-over → large-blast explosion, owner-gun-shootable early detonation with full blast, 5 placed max with oldest cleared, no expiry; decoy stationary, "shows up as you on radar for other players", one at a time (replace), 30 s; R empty, F reserved; ML fantasy = seeding minefields and drawing enemies in.
- Design targets (orchestrator-set, tunable, flagged for Eric's veto in Design Notes): `CONFIG.mine.triggerRadius` 25→32, NEW `blastRadius: 48`, `maxLive` 3→5; unchanged mine `damage: 45`, `armDelay: 3000`, `maxAmmo: 1`, `reloadMs: 8000`; NEW `CONFIG.decoyBuoy { durationMs: 30000, reloadMs: 20000, maxAmmo: 1 }`; client mine marker ring 7→10 u, dot 2.4→3.5 u.
- Blast rule: every non-owner hull (enemies AND drones) whose silhouette is within `blastRadius` of the mine takes full `damage` — owner EXCLUDED (gun/cannon/starShells AoE precedent; torpedoSelfHit owner-immunity suite stays green). No chain detonations: a mine blast never detonates other mines; only the OWNER's shell bursts do, and only ARMED mines (armDelay stays the anti-instant-bomb gate).
- Input paths: `EQUIPMENT_IS_WEAPON.mine → false` and `decoyBuoy: false` — both ride the existing `actSeq`/`actSlot` ability channel (boost precedent, no fireT compensation; 3 s arm delay dwarfs latency skew). No InputMsg growth. TB (`[gun, torpedo, speedBoost, empty]`), BB, and drone fits byte-identical; drones keep `[gun, torpedo, mine, empty]`.
- Decoy law (epics.md 1.8 AC / FR10): real World entity; radar paints reuse the genuine blip row's `materialize` through the pre-built `counterIntel` seam in signals.ts, gated by the SAME ship-blip predicate (sight < dist ≤ radar ∧ swept-this-tick ∧ LOS-clear) for temporal indistinguishability; emitted blip `id` = owner's ship id; wire-indistinguishability test proves a serialized decoy blip is field-for-field identical to a real ship blip modulo position; never blips to its owner; not a collision subject — shells/bursts pass through with no Hit Call, it never trips mines, storm ignores it; persists to natural expiry (litZone precedent, survives owner death).
- Decoy visibility tiers: owner always sees own buoy (new `decoys` channel, mine-pattern chart marker); enemies get the buoy view only when `pointSighted` or `ownZoneCovers` (truesight/lit zones reveal the lie); spectators see all.
- Every stat flows through `effectiveStats()`: mine keeps its three upgrade stacks (`mineReload`/`mineAmmo`/`maxMines` on the new base 5); `decoyBuoy` is a pure pass-through block (boost precedent, no upgrade touches it); triggerRadius/blastRadius/armDelay/damage stay raw CONFIG (not upgradeable).
- Registry discipline: `decoy` pseudo-row beside `mine`; blip row gains the `counterIntel` implementation; perception oracle independently extended (decoys channel + decoy-blip rule + zone parity); signals key-order guards; goldenFrames scenario + deliberate `-u` regen; PV9 changelog line — all in this PR.
- Sim purity (no `Math.random`/`Date.now`), complexity ≤ 10, `npm run check` green, one PR; commit+push continuously, PR only at the end (non-draft).
- GDD close-out is MINIMAL (change-signal scope only): ML loadout table OPEN cell → decoy buoy resolved 2026-07-22; the [NOTE FOR DESIGNER] and Open-design-note #1 closed; mines behavior law line updated (blast radius, owner-gun detonation, no expiry). Same-PR: sprint-status `1-8` → done, gds-workflow-status `next_expected` → create-story 1-10 + `last_updated`, epic-1-context.md 1.8 lines refreshed (and mtime newer than the GDD edits so the cache stays valid).

**Block If:**
- Any wire growth beyond `DecoyView`/`FrameMsg.decoys` (+ the CONFIG blocks) seems necessary, or a new GameEvent kind / fake CONTACT emission (decoy deceives via blips ONLY) seems needed.
- Owner-damaging mine blasts or chain detonations seem REQUIRED to satisfy an AC (they are ruled out above; if something forces them, stop).
- TB/BB/drone loadouts, hull kinematics, or gun/torpedo/cannon/starShells/speedBoost CONFIG values seem to need changing.
- Any guardrail must weaken: every single-hit damage number stays < min hull hp (70).

**Never:**
- No arc geometry (1.10), no Q/E/R/F rebinding (interregnum keys 2/3 activate the ML specials), no blip class-legibility work (Epic 4 — today's blips are anonymous dots and the decoy inherits that), no mine trigger/blast upgradeability, no fog changes (own mines/buoy are chart-layer, fog-immune already), no torpedo removal from shared systems (drones keep it), no literal "decoy destroyed/expired" enemy-facing messaging.
- No perception scan outside `frames.ts`/`observe()`; no priming/click path for mine or decoy (abilities never prime — the mine prime-preview marker is retired with the flip).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drop mine | ML, key 2, ammo loaded | mine spawns astern (hull-clear), arms at +3 s, ammo consumed, 8 s reload | none |
| Drop denied | dead / no charge / sinking gate | no state change; ability chip red pulse | existing denial reasons |
| Enemy trips armed mine | non-owner silhouette within 32 u | mine deletes; boom event; ALL non-owner hulls within 48 u take 45 | none |
| Two ships in blast | both non-owner, within 48 u | both take full 45; owner in radius takes 0 | none |
| Owner passes own mine | owner silhouette within 32 u | never trips (existing rule) | none |
| 6th mine placed | 5 live (base maxLive) | oldest silently deleted, no boom; 6th drops | none |
| Owner gun-bursts own armed mine | own shell burst covers mine center | mine detonates: full 45 blast at the MINE's position; other mines in that blast unaffected | none |
| Owner bursts own UNARMED mine | burst covers mine, now < armedAt | mine survives (armDelay preserved) | none |
| Enemy bursts owner's mine | enemy shell burst covers mine | nothing — only the owner's bursts detonate | none |
| Place decoy | ML, key 3, charge loaded | buoy spawns astern, stationary, expires at +30 s; 20 s reload | none |
| Second decoy placed | one live | first silently despawns, second spawns | none |
| Enemy sweep crosses decoy | sight < dist ≤ radar, LOS-clear, swept this tick | observer gets `{k:'blip', id: OWNER's ship id, x, y, t}` — field-for-field a ship blip | none |
| Decoy inside enemy sight | dist ≤ sight, LOS-clear | buoy view via `decoys` channel (the truth), no blip | none |
| Enemy shoots decoy | shell path / burst over buoy | shell flies through, no Hit Call, buoy persists (sanctioned disambiguation) | none |
| Owner dies, decoy live | ML sunk at t < until | buoy persists to natural expiry | none |
| TB/BB press keys 2/3 | non-ML hull | torpedo/boost and cannon/starShells exactly as today | none |
| pv-8 client joins | old PROTOCOL_VERSION | rejected at matchmake | existing `protocolVersionError` |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.mine`: triggerRadius 32, NEW `blastRadius: 48`, maxLive 5 (rest unchanged); NEW `CONFIG.decoyBuoy { durationMs: 30000, reloadMs: 20000, maxAmmo: 1 }` as peer block.
- `shared/src/types.ts` -- `DecoyView { id, x, y, until }` (owner/spectator/sighted view); `FrameMsg.decoys?` (sibling of `litZones`, omit-when-empty). No new GameEvent kind, no InputMsg change.
- `shared/src/index.ts` -- PROTOCOL_VERSION 9 + changelog line (ML fit, mine→ability semantics, FrameMsg.decoys, CONFIG.mine.blastRadius, CONFIG.decoyBuoy); barrel exports.
- `shared/src/sim/loadout.ts` -- `EquipmentId` += `'decoyBuoy'`; `EQUIPMENT_IS_WEAPON`: mine → **false**, decoyBuoy false; `specialsFor`: mineLayer → `['mine','decoyBuoy']` (drones keep `['torpedo','mine']`, TB/BB untouched); `equipmentMaxAmmo`/`equipmentReloadMs` gain decoy entries.
- `shared/src/sim/stats.ts` -- mine block: maxLive base 5 (upgrades still stack); NEW `EffectiveDecoy` pass-through `{ reloadMs, maxAmmo, durationMs }`.
- `server/src/game/equipment/mines.ts` -- activate() unchanged in shape (already non-aimed); trip resolution becomes blast: collect ALL non-owner hulls with silhouette within `blastRadius` (reuse `pointPolygonDistance`), full damage each; keep single boom event at the mine.
- `server/src/game/equipment/decoy.ts` -- NEW ability row (boost/mines hybrid): consume → drop astern via `hullClearOffset` pattern → `ctx.dropDecoy(x,y)`; denial = no-ammo.
- `server/src/game/equipment/index.ts` -- register decoy row.
- `server/src/game/world.ts` -- mine dispatch moves from `fireControl` to `activationControl` for free via the flag flip; `decoys: Map<string,{id,ownerId,x,y,until}>` + `decoySeq` + spawn (owner-eviction on spawn: delete existing own buoy) + `expireDecoys()` beside `expireLitZones()` + reset in `resetForMatchStart`; `resolveBurst` extension: owner's shell bursts detonate owner's ARMED mines whose center is within the burst radius (queue detonations, resolve as normal mine blasts at mine positions, no chaining).
- `server/src/game/perception.ts` -- `SignalContext.decoys`; `decoyScan` beside `mineScan`; `PerceptionView.decoys` (5th channel); counterIntel invocation: for each fogged non-owner observer, run the blip row's `counterIntel` over decoys inside the standard ship-blip gate.
- `server/src/game/signals.ts` -- NEW `decoy` pseudo-row (owner always / pointSighted / ownZoneCovers; spectator all; materialize `{id, x, y, until}` key-order-guarded); blip row implements `counterIntel(ctx, decoy)` returning the SAME materialize shape with `id` = owner's ship id.
- `server/src/game/frames.ts` -- thread `decoys` channel into fogged + spectator frames.
- `client/src/render/mines.ts` -- RING_R 7→10, DOT_R 2.4→3.5.
- `client/src/render/decoys.ts` -- NEW module (mines.ts pattern): own chart-layer buoy marker + sighted-enemy world-layer marker, reconcile diff pure fn, own-spawn audio hook.
- `client/src/render/weaponArc.ts` + `render/firing.ts` -- `fireArcKind('mine')` → `'none'` (abilities never prime); delete the mine astern prime-preview marker path; TB torpedo/gun behavior regression-pinned.
- `client/src/input/keyboard.ts` + `sim/inputSampler.ts` -- no structural change: `slotHoldsAbility` now answers true for ML slots 1/2, routing keys 2/3 through `activateAbility` (actSeq); verify ability denial predicts mine/decoy charge.
- `client/src/net/roomBindings.ts` + `state.ts` + `main.ts` -- `decoys.sync(f.decoys ?? [])` after litZones; wire the new render module + audio.
- `client/src/render/hud.ts` -- `EQUIPMENT_LABEL` += `decoyBuoy: 'DECOY'`; `chipUsesCooldownGrammar` becomes id-driven: cooldown for gun/cannon/starShells/speedBoost/decoyBuoy, SEGMENTED ammo grammar stays for torpedo AND mine (growable pools keep segments — hud doc law).
- `client/src/audio/tones.ts` -- decoy placement tone; keep FIRE_TONE typing compiling (mine tone still routes via the Mines reconcile hook).
- Tests: shared `loadout` (ML fit, flag flip, decoy ammo/reload), `stats` (maxLive base 5 + stacks, decoy pass-through), `damageGuardrail` (mine 45 < 70 incl. multi-victim blast; decoy deals nothing); server `weapons.test.ts` mines block (trip→blast multi-victim owner-excluded, cap 5 eviction, armed-only owner-only burst detonation, no chains), NEW `decoy.test.ts` (spawn/replace/expiry/death-survival, blip-gate parity incl. sweep timing, wire-indistinguishability field-for-field, no-Hit-Call, truesight view), `equipment.test.ts` (re-point the universal-fit exemplar hull mineLayer → a drone hull; decoy row conformance; mine now dispatches via activation gate), `perception.test.ts` (oracle: decoys channel + decoy-blip verifier + zone parity; completeness 15 rows), `signals.test.ts` (decoy key order + counterIntel), `goldenFrames` (ML scenario: mine blast, decoy lifecycle + third-party blip; deliberate regen); client `weaponArc` (mine→none, TB regression), `keyboard`/`inputSampler` (ML ability routing), `hud` (label + id-driven grammar), NEW `decoys.test.ts` (reconcile), `mines.test.ts` (sizes if pinned).
- Docs (same PR): `gdd.md` minimal close-out; `_bmad-output/implementation-artifacts/sprint-status.yaml` → `1-8-mine-layer-loadout: done`; `_bmad-output/gds-workflow-status.yaml` → next_expected create-story 1-10 + last_updated 2026-07-22; `epic-1-context.md` 1.8 lines refreshed last (mtime > gdd.md).

## Tasks & Acceptance

**Execution:**
- [ ] `shared/src/` (constants, types, index, sim/loadout, sim/stats) -- CONFIG deltas + decoyBuoy block, DecoyView + decoys channel, PV9, ML fit + flag flips, stats blocks -- the deterministic spine, unit-tested.
- [ ] `server/src/game/` (equipment/mines + decoy + index, world, perception, signals, frames) -- blast resolution, burst-detonation, decoy lifecycle + counterIntel blips + decoys channel, oracle/signals/goldenFrames extensions -- authoritative loadout complete against the full I/O matrix.
- [ ] `client/src/` (render/mines, render/decoys NEW, render/weaponArc, render/firing, input/keyboard, sim/inputSampler, net/roomBindings, state, main, render/hud, audio/tones) -- bigger mine markers, buoy markers, ability-routed ML keys, DECOY chip with cooldown grammar, id-driven chip grammar -- trapper feel end-to-end with TB/BB/drones byte-identical.
- [ ] Test sweep -- suites in Code Map + `npm run check` green (baseline 1179 = 241/562/376).
- [ ] Docs & status -- minimal GDD close-out, sprint-status, gds-workflow-status, epic-1-context refresh -- same PR.

**Acceptance Criteria:**
- Given an ML spawn, when the loadout builds, then it is `[gun, mine, decoyBuoy, empty]` while TB/BB/drones are byte-identical to 1.7, and keys 2/3 activate instantly through the ability channel (no priming, no click).
- Given an armed mine trip or an owner's burst over an armed mine, when the blast resolves, then every non-owner hull within `blastRadius` takes full damage, the owner takes none, no other mine detonates, and `damageGuardrail` pins every number < 70.
- Given a live decoy, when any fogged non-owner's sweep crosses it per the ship-blip gate, then that observer receives a blip whose serialized form is field-for-field identical to a real ship blip (id = owner's ship id) — proven by a wire-indistinguishability test; the owner and spectators see the buoy via `decoys`; sighted enemies see the buoy view; shells/bursts produce no Hit Call on it; it expires at 30 s or on replacement.
- Given a pv-8 client, when it joins, then matchmake rejects it; goldenFrames regenerate deliberately in this PR.
- Given `npm run check`, when run at the end, then lint + type-check + all tests pass across all three workspaces.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Eric rulings (2026-07-22 invocation + mid-run message):** slot map Q/E/R/F → mines/decoy/empty/reserved; mines activateable (not a skillshot), drop-behind, pass-over trip → large blast, owner-gun early detonation with full blast, 5-cap oldest-evicted, no expiry; decoy stationary radar-double, one live, 30 s; mine graphic bigger, detection larger, blast larger than detection. These CLOSE the two Eric-gates (GDD open note #1 + epics 1.8 AC clause 1).
- **Orchestrator rulings awaiting Eric's veto (design targets):** (1) blast is owner-EXCLUDED — "damage to anything within it" read against the universal owner-excluded AoE convention (gun burst, star shell) and the owner-immunity guardrail suite; flag if you wanted self-damage risk. (2) Gun-detonation = the owner's shell BURST covering an armed mine (click your own minefield), not swept-path collision — no new collision machinery, feels identical in play. (3) Unarmed mines are immune to bursts (armDelay keeps its anti-instant-bomb role). (4) No chain detonations. (5) Numbers: trigger 32 / blast 48 / maxLive 5 / decoy 30 s life, 20 s reload, drop astern (stern-weapon identity). (6) Decoy persists past owner death to expiry (litZone precedent). (7) In truesight, enemies SEE the buoy for what it is (real entity, mine-pattern visibility) — the lie is radar-only.
- **Why the flag flip is safe:** `EQUIPMENT_IS_WEAPON` is the mechanical aimed-click vs instant split, not the design notion of "weapon" — the epic's "at least one special is a weapon" is satisfied by mines dealing damage. The flip auto-routes mine through `activationControl`/`actSeq` (boost precedent) and drops fireT arming compensation (3000 ms arm delay dwarfs ≤150 ms skew). Chip grammar must NOT follow the flag: mine keeps segmented pools (mineAmmo upgrades grow it), so `chipUsesCooldownGrammar` goes id-driven.
- **counterIntel seam:** signals.ts declares `counterIntel?(ctx, subject)` with a comment earmarking it for this story; the blip row's implementation + a perception-side decoy scan is the designed landing. Blips carry `{k,id,x,y,t}` and the client never reads `id` — but a cheater could, so the decoy MUST emit the owner's real ship id ("shows up as YOU"). Two same-id blips at different positions is the intended deception. Blip class-legibility (GDD outline/speed/heading) is Epic 4; the decoy inherits whatever blips become.
- **Interregnum warts knowingly extended:** mine-category upgrades now benefit only ML + (uselessly) drones; TB/BB mine-category offers stay dead picks via the existing no-op guard. Dies with Epic 2.
- Eric directive: route subagent model selection via `/orchestrate` (as in 1.3–1.7).

## Verification

**Commands:**
- `npm test -w shared` -- expected: green incl. ML fit + flag flips, decoy pass-through, guardrail pins.
- `npm test -w server` -- expected: green incl. mine blast/burst-detonation matrix, decoy lifecycle + wire-indistinguishability, oracle 5-channel/15-row extensions, deliberate goldenFrames regen.
- `npm test -w client` -- expected: green incl. mine→none arc, ML ability routing, id-driven chip grammar, decoys reconcile.
- `npm run check` -- expected: lint (complexity ≤ 10) + tsc ×3 + all tests green.

**Manual checks (if no CLI):**
- With Eric's dev server running (never start it): pick ML — key 2 instantly lays a (bigger) mine astern; sail an enemy over an armed one → area blast hits everything nearby but you; shoot your own field → armed mines pop; key 3 drops a buoy that paints an enemy's radar as you for 30 s while you slip away; TB/BB play exactly as before.
