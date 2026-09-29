---
title: 'Story 8.16: Catalog v3 — Shield, Chaff, Decoy'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: 'cc86ac9'
final_revision: ''
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

**Problem:** Three of the five launch consumables are still `stub: true` (SHIELD BLOCK, CHAFF, DECOY BUOY), so the belt holds only HULL REPAIR and SUPERCAV TORPEDO and a capped captain sees a two-card offer (amendment 94). The `decoy` target kind is served by the legacy RADAR BUOY, which has been dark since 8.5 (amendment 22) and whose jamming fakes are not water-filtered (`deferred-work.md:1451`). `ShipRecord.shield` exists in the damage gate but nothing writes it.

**Approach:** Flip the three stubs and build each as a consumable row on the 8.7 mechanism: SHIELD BLOCK writes the existing shield seat (absorbed after the DAMAGE CUT, amendment 100); CHAFF puts a `FakeSource` on the ship whose fakes ride the generalized, water-filtered `game/fakes.ts` scatter through each observer's own `blipGate`; DECOY BUOY drops a 50 hp `DecoyState` into a `decoys` store that replaces the buoy store, paints on radar through the buoy's footprint path and is the `decoy` target. Delete the RADAR BUOY end to end. `PROTOCOL_VERSION` 58 → 59 once. Every number and every open question is ruled: catalog-v3 R36/R37/R39/R41 (Eric 2026-09-09), FR55/UX-DR46/UX-DR56 (Eric 2026-09-11), amendments 100–102, and Eric's eight rulings of 2026-09-29 recorded as amendments 116–123.

## Boundaries & Constraints

**Always:**
- **Eric's 2026-09-29 rulings (amendments 116–123), verbatim intent:** (116) the shielded HP number is `info` `#38BDF8`; (117) an absorbed hit plays the ORDINARY hit cue and the shield number falls — no new cue, no new asset; (118) the shield absorbs EVERY source, storm bites and phosphor burn included (the cut stays weapons-only); (119) the owner's own shells and bursts NEVER damage the owner's own decoy (no second friendly-fire exception); (120) an enemy torpedo that detonates on a decoy deals its damage to the decoy (a 50-damage fish kills a fresh one); (121) a shell or burst hit on a decoy fires the shooter's `hc` exactly as a hull hit does; (122) a decoy persists until destroyed — it does NOT sink with its owner (the dead-owner id tell is accepted: only sighted observers get an id and they already see the hue); (123) a decoy lays NO wake — the `:742` thread closes as accepted, no ribbon stamping.
- **SHIELD BLOCK** (`CONFIG.shieldBlock = { hp: 100, durationMs: 10000 }`): key-fires; `ship.shield = { hpLeft, until }` written through a new `ActivationContext.setShield`; a second shield REPLACES (fresh 100 / 10 s); activation never refuses while afloat; the existing `absorbShield` (after `cutDamage`, before the hull decrement) is the whole absorb path — do NOT re-order the gate; a fully absorbed hit has `dealt` 0 so `lastDamagedAt` does not move (amendment 47), the shooter's `hc` fires, the victim's `dmg` reads 0 (FR55). `OwnShip.shield?: { hp: number; until: number }` self-private, key ABSENT when null (the `damageCutUntil` conditional-spread rule); the HP globe prints `hullShownValue(hp + shield.hp)` with `value.style.fill = C.info` while `shield.hp > 0`, the max label unchanged, NUMBER ONLY — no globe ring, no hull ring; `railFraction` stays clamped.
- **CHAFF** (`CONFIG.chaff = { radius: 120, count: 10, durationMs: 15000 }`): key-fires; `ShipRecord.chaff: FakeSource | null` with `FakeSource { x, y, radius, count, until, seed, at }` fixed at the OWNER's position at activation (R39 "bursts at your own position"); a second chaff REPLACES (fresh seed, fresh 15 s); `game/fakes.ts` exports `scatterFakes(seed, epoch, cx, cy, radius, count, islands, mapRadius)` — `mulberry32((seed ^ imul(epoch+1, 0x9e3779b9)) >>> 0)`, per fake the same 4 draws as `scatterJamFakes` (r = R·√u, θ, heading, cls ∈ HULL_IDS) followed by REJECTION against `blockedWater` with at most 16 re-draws per fake (a fake that fails 16 times is dropped, so fewer than `count` fakes is legal near islands); `epoch = floor((now − at) / owner.stats.sweepPeriodMs)` (the owner's own sweep period — ships have no revolution counter); fakes emitted per observer through `blipGate(me, fake) ∧ ¬ownZoneCovers`, then `blipShape(ctx, fake, cls, heading)`; the OWNER never receives them; no `src` tag, no active readout, no on-water effect; the belt `×n` is the twin. The perception oracle's fourth `verifyBlip` arm recomputes fakes from `(seed, epoch, source)` with the same filter; completeness consumes `expectedFakeBlips`; the exception count stays SIX.
- **DECOY BUOY** (`CONFIG.decoyBuoy = { hp: 50, sizeU: 12 }`): key primes, click fires; `consumableArc('decoyBuoy')` = the mine sector (`CONFIG.mine.offset`, `placeHalfArcDeg`), reach `CONFIG.mine.placeRange`, `blockedWater` → `'blocked'` denial with NOTHING spent (one spend law), out-of-arc → `'out-of-arc'` exactly as `mineLine.activate`; `DecoyState { id, ownerId, x, y, hp, poly }` in `World.decoys` (id `d${seq}`), NO lifetime; `DecoyView { id, x, y, own, by, hp? }` — `by` = owner id for EVERY observer (the `MineView.by` precedent; the client's hue latch needs it), `hp` ONLY when `own` (the `MineView.c` idiom, key absent otherwise); visible to the owner always, to others when sighted or covered by their own lit zone (the `mineSignal` rule), to spectators always; `decoy` is a `SIGNAL_REGISTRY` pseudo-row and `signalFor` excludes it; `FrameMsg.decoys?` sent only when non-empty; `PerceptionView.decoys` replaces `buoys`; it PAINTS on radar as a 12 u degenerate-segment square through the buoy's footprint path (`decoyPaintBlip`, untagged, `blipGate ∧ ¬ownZoneCovers`); `Target` gains `ownerId?` and `earliestTarget`, `acquireNearest` and `burstVictims` skip a decoy whose `ownerId === shell.ownerId` (owner's fish pass through, owner's shells and bursts pass over — amendment 119); enemy homing acquires it like a hull (already true); `damageDecoy(id, amount, byId)` refuses `byId === ownerId`, decrements, removes at ≤ 0 and bumps `targetsGen`; torpedo contact and mine blast both route through it; renders in the OWNER's hue for all observers (`resolveHue(view.by)`), own decoys in the fog-immune chart layer, others in the world layer; the owner-only hp readout is an implementer DRAFT (reuse the buoy marker's masthead arc as `hp / CONFIG.decoyBuoy.hp`) ledgered for Eric's eye; the client belt pre-denial gains no new branch (placement denials are server-side like mines).
- **RADAR BUOY deleted end to end:** `radarBuoy.ts`, `BuoyState`, `BuoyView`, `FrameMsg.buoys`, `buoyGate`, `buoySignal`/`buoyRadarBlips`/`ownBuoyScopeBlips`/`buoyScopeFakeBlips`/`jamFakeBlips`, the `src` blip tag and `blipSrcOrder`, `EquipmentId 'radarBuoy'`, `EffectiveRadarBuoy` + its stat row and `EQUIPMENT_STAT_FIELDS.radarBuoy`, `CONFIG.radarBuoy` and every bot-profile weight naming the buoy, `tickBuoys` (STEP_ORDER row → `tickDecoys` is NOT needed: decoys have no tick — remove the row), `radarBuoyTactic`/`BUOY_SECTOR`/`buoyWant`, `render/buoys.ts` → `render/decoys.ts`, `render/radar.ts` own-buoy sensor/wedge/`src` pricing, `aimPreview` `buoyPreview`, `equipmentInfo` buoy copy, the `placeBuoy` tone → `placeDecoy`, and every test that fits or asserts the buoy (`radarBuoy.test.ts`, `radarBuoyRegression.test.ts`, `radarBuoyScope.test.ts`, `blipProvenance.test.ts`, `buoys.test.ts` → `decoys.test.ts`). `EQUIPMENT` holds 13 rows. Jamming has no other source, so `fitJamming`/`buoyJamming` test scaffolding goes with it.
- Catalog: `shieldBlock`, `chaff`, `decoyBuoy` → `consumable(id, false)`; `smokeScreen`, `depthCharge` stay stubs (2). `CONSUMABLE_IS_WEAPON` unchanged (decoy true, the other two false). `CONSUMABLES` registry = hullRepair, supercavTorpedo, shieldBlock, chaff, decoyBuoy. No `EffectiveStats` row for any consumable (the consumable law); numbers are CONFIG.
- Wire: `PROTOCOL_VERSION` 58 → 59, one bump, one header entry (`OwnShip.shield`, `FrameMsg.decoys`, `buoys` + `src` gone). Perception invariant: nothing outside sight ∪ this-tick paints ∪ owned lit zone reaches a client; six exceptions; fuzz seeds chaff sources and decoys on random ships.
- Bots (interim; 8.19 owns the table — the amendment 49/79/109 precedent): `shieldBlock` ability tactic fires on the DAMAGE CUT cues (engage posture or `torpedoInbound` within 150 u); `chaff` ability tactic fires on the disengage posture; `decoyBuoy` placement tactic uses `sectorPlacement` on the mine sector when `torpedoInbound`. `CONSUMABLE_APPETITE` stays total.
- Client copy: names exist; consumable card rows via `CONSUMABLE_ROWS` (shield `ABSORBS 100 hp`, `LASTS 10 s`; chaff `FAKES 10`, `RADIUS 120 u`, `LASTS 15 s`; decoy `HULL 50 hp`, `DROP rear arc`) — CONFIG-read, ≤ 5 rows; hover descriptions and the three belt glyphs are implementer DRAFTS in the existing line-glyph style, ledgered (amendment 110 precedent). How-to-Play untouched (8.21).
- Docs: version 0.18.16 (cycle 151) in `VERSION` + root `package.json` (+ lock); `CHANGELOG.md`; ONE-LINE stamps in both trackers; amendments 116–124 appended to `epic-8-context-amendments.md` AND re-applied under `## Ratified Amendments` in `epic-8-context.md`; `deferred-work.md` 8.16 section closing `:99, :742, :1426, :1436, :1441, :1446, :1451, :1874, :1879, :2051–2052, :2101, :2342` and ledgering the drafts; DESIGN.md/EXPERIENCE.md: retire the `shield-ring` token's globe/hull rings and the `[OPEN]`/`[ASSUMPTION]` markers UX-DR46/UX-DR56 carry for the items ruled here — MINIMAL edits, nothing else reworded.

**Block If:** any need for a number not listed above; any reading in which a chaff fake or a decoy view reaches an observer outside sight ∪ this-tick paint ∪ own lit zone; a seventh perception exception; a per-side fork of sim math; a request to keep any radar-buoy code "for later".

**Never:** SMOKE SCREEN or DEPTH CHARGE (8.17 / Eric); a shield ring on the globe or the hull; a chaff readout or on-water effect; a `src` tag on any blip; a decoy lifetime or owner-death despawn; a decoy wake; re-authoring the eight 8.12 lines; a `missile` kind; How-to-Play copy; editing `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Shield absorbs a cut hit | Battleship, cut up, shield 100, 55-hp mine | cut 27 → shield 73, hull unchanged, `dealt` 0, `dmg` amount 0, `hc` to shooter, `lastDamagedAt` unchanged | none |
| Shield vs storm and burn | shield 100, storm bite 0.2, burn tick 0.25 | both absorbed (99.55 left), hull unchanged | none |
| Shield overflow | shield 10, 15-hp shell | shield spent and nulled, hull −5, `dmg` 5 | none |
| Second shield | shield 40 / 3 s left, press again | shield 100 / fresh 10 s, one copy spent | none |
| Shield expiry | `until` passed, 15-hp shell | pass-through 15, shield nulled | none |
| Own-ship frame | shield up / null | `shield: {hp, until}` present / key absent; never in another client's frame | none |
| Chaff fakes | chaff fired, observer sweeping the source, fake on water | one `blip` per gated fake, shape of a random hull, no `src`, none to owner | none |
| Chaff near island | fake draw lands on land | re-drawn ≤ 16×, else dropped; oracle agrees byte-for-byte | none |
| Chaff epoch | owner's `sweepPeriodMs` elapsed | new scatter from `(seed, epoch+1)` | none |
| Decoy drop | primed, click in rear ±60° ≤ 150 u on water | `DecoyState` added, copy spent, `placeDecoy` tone | none |
| Decoy drop blocked | click on island / off disk / out of arc | `'blocked'` / `'out-of-arc'` denial, NOTHING spent | denial event, no throw |
| Enemy fish on decoy | heavy torpedo (50) hits 50-hp decoy | fish detonates, decoy removed, `targetsGen` bumped, no hull damage | none |
| Own fish on own decoy | owner's torpedo path crosses own decoy | passes through; homing never acquires it | none |
| Own shell on own decoy | owner's burst covers own decoy | no damage, no `hc` for that victim | none |
| Enemy shell on decoy | 15-hp cannon shell | decoy 35, shooter `hc`, no `dmg` (not a ship) | none |
| Decoy view | observer sighted / lit zone / neither | `{id,x,y,own:false,by}` / same / nothing; owner adds `hp` | none |
| Decoy radar paint | in observer's swept annulus, LOS | 12 u paint blip, untagged | none |
| Owner sinks | decoy afloat | decoy persists, `by` unchanged | none |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.shieldBlock`, `CONFIG.chaff`, `CONFIG.decoyBuoy`; DELETE `CONFIG.radarBuoy` and bot weights `radarBuoy`/`buoyGun`/`buoyDuration`/`acquireRadarBuoy`
- `shared/src/types.ts` -- `OwnShip.shield?`, `DecoyView`, `FrameMsg.decoys?`; DELETE `BuoyView`, `FrameMsg.buoys`, `ReturnBlipEvent.src`
- `shared/src/sim/catalog.ts` -- three stubs → live; header counts
- `shared/src/sim/loadout.ts` -- `EquipmentId` −`radarBuoy`; `EQUIPMENT_IS_WEAPON`
- `shared/src/sim/stats.ts` -- DELETE `EffectiveRadarBuoy` + row; `shared/src/sim/effects.ts` `EQUIPMENT_STAT_FIELDS` −radarBuoy
- `shared/src/sim/arcs.ts` -- `consumableArc('decoyBuoy')` sector; `isMineChassis` −radarBuoy
- `shared/src/sim/shell.ts` -- `Target.ownerId?`; `earliestTarget`/`acquireNearest`/`burstVictims` own-decoy skip
- `shared/src/index.ts` -- PV 59 + header; barrel exports (`DecoyView`, fakes helpers if shared)
- `server/src/game/fakes.ts` -- NEW `FakeSource`, `scatterFakes` (water-filtered), `fakeEpoch`
- `server/src/game/decoys.ts` -- NEW `DecoyState`, `decoyTarget`, `addDecoy`
- `server/src/game/equipment/consumables/{shieldBlock,chaff,decoyBuoy}.ts` -- NEW rows; `consumables.ts` registry; `index.ts` ctx `setShield`, `setChaff`, `dropDecoy`; DELETE `radarBuoy.ts` + `dropBuoy` + registry row
- `server/src/game/world.ts` -- `ShipRecord.chaff`; `decoys` store; `collectDecoys` over decoys with `ownerId`; `damageDecoy` replaces `hitBuoy`/`consumeBuoy`; DELETE buoy store/seq/`jamRng`/`tickBuoys`/`spawnBuoy`/`advanceBuoySweep`/`fireBuoyGun`/`nearestBuoyTarget`; resets null `chaff`
- `server/src/game/signals.ts` -- `decoy` pseudo-row (`visible`/`materialize` with own-only `hp`); `decoyPaintBlip`; `chaffFakeBlips`; DELETE buoy rows, `buoyGate`, `blipSrcOrder`
- `server/src/game/perception.ts` -- `decoyScan` → `PerceptionView.decoys`; chaff fakes in the fogged blip pass; DELETE `buoyScan`
- `server/src/game/frames.ts` -- `toOwnShip` shield spread; `decoys` attach
- `server/src/game/ai/equipment.ts`, `spending.ts`, `profiles.ts`, `tactics.ts`, `utility.ts` -- three interim tactics; DELETE buoy tactic/weights
- `server/src/__tests__/` -- `damageGate` (shield writer + decoy hp pins), `equipment` (13 rows, 5 consumables), `perception` (fourth arm, decoy pseudo-row, fuzz seeding, registry 22 keys: −buoy +decoy), `signals`, `hitTargets`, `torpedoSelfHit`, `botTactics`, `botPolicy`, `denials`/`colyseus018` PV 59, `goldenFrames`; NEW `shieldBlock.test.ts`, `chaff.test.ts`, `decoy.test.ts`; DELETE the two radarBuoy tests
- `server/scripts/batchsim/{catalogMetrics,botMetrics}.ts` + tests -- buoy rows out
- `client/src/render/hpGlobe.ts`, `hudBar.ts`, `main.ts` -- shield readout (`info`), `ownStatus` shield
- `client/src/render/decoys.ts` (from `buoys.ts`), `net/roomBindings.ts`, `stage.ts` -- decoys channel, owner hue, own hp arc draft
- `client/src/render/radar.ts` -- DELETE own-buoy sensor/wedges/`src` pricing
- `client/src/render/{equipmentIcons,equipmentInfo,weaponArc,aimPreview,firing}.ts`, `audio/tones.ts` -- three glyphs, decoy placed-item arc + preview, buoy copy out, `placeDecoy`
- `client/src/ui/boonCopy.ts` -- `CONSUMABLE_ROWS` ×3, hover drafts
- `client/src/__tests__/` -- `hpGlobe`, `cardStatRows`, `boonCopy`, `refitCardFit`, `refitTooltipFit`, `fitCheck`, `weaponArc`, `aimPreview`, `roomBindings`, `frameOrdering`, `tones`, `hotbar`, `ordnanceMasksAreServerOnly` PV 59; `decoys.test.ts` replaces `buoys.test.ts`; DELETE `radarBuoyScope`, `blipProvenance`
- `VERSION`, `package.json` (+lock) 0.18.16; `CHANGELOG.md`; both trackers; `deferred-work.md`; amendments 116–124 in both homes; DESIGN.md/EXPERIENCE.md minimal

## Tasks & Acceptance

**Execution:**
- [ ] Wave 1 `shared/` -- CONFIG blocks, catalog flips, types (`OwnShip.shield`, `DecoyView`, `FrameMsg.decoys`, buoy/src deletions), loadout/stats/effects/arcs buoy removal, `Target.ownerId` + own-decoy skips, PV 59, tests -- `npm run build -w shared && npm test -w shared`
- [ ] Wave 2 `server/src` -- fakes.ts, decoys.ts, three consumable rows + ctx capabilities, world store/damage/collector, signals decoy pseudo-row + chaff fakes + decoy paint, perception/frames, radar buoy deletion, bot interim tactics, tests incl. the fourth `verifyBlip` arm and fuzz seeding -- `npm test -w server`
- [ ] Wave 3 `client/` (parallel with 2) -- shield readout, decoys renderer + hue + hp-arc draft, radar buoy-scope deletion, glyphs, arc/preview, copy rows, tones, tests -- `npm test -w client`
- [ ] Wave 4 docs -- version 0.18.16, changelog, trackers, deferred-work closures + drafts, amendments in both homes, DESIGN/EXPERIENCE minimal, stale comments -- `npm run check` exit 0
- [ ] Unit-test every row of the I/O matrix

**Acceptance Criteria:**
- Given a captain who fires SHIELD BLOCK then takes a shell, a mine, a burn tick and a storm bite inside 10 s, when the gate runs, then every one is absorbed until 100 is spent, `hc` reached each shooter, `dmg` read 0 for absorbed hits, and only the owner's frame ever carried `shield`.
- Given 2000 seeded perception fuzz worlds with random chaff sources and decoys, then nothing outside sight ∪ this-tick paints ∪ own lit zone reaches any client, every untagged blip matches one of four arms (ship, decoy paint, chaff fake, —) with completeness by consumption, no blip carries `src`, no fake lies on land, and the exception count is six.
- Given a decoy dropped astern, when an enemy heavy torpedo runs into it, an owner's torpedo passes over it and an owner's flak burst covers it, then only the enemy fish detonates and removes it.
- Given `npm run check`, then lint, tsc ×3 and every test pass with zero references to `radarBuoy`, `BuoyView`, `buoyGate`, `scatterJamFakes` or `src:` blip tags outside comments recording the deletion; `PROTOCOL_VERSION` is 59; `EQUIPMENT` has 13 rows; the catalog has 2 stubs.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the chaff epoch is time over the owner's sweep period:** AR46 says "epoch-rescattered per sweep"; the buoy counted its own revolutions, but a ship keeps only `sweepAngle`/`prevSweepAngle`. `floor((now − at) / sweepPeriodMs)` is the same quantity, needs no new per-tick state, and the test oracle can recompute it from the frame time.
- **Why `Target.ownerId` instead of an owner check in the world:** the sweep/contact/acquire decisions run in `shared/src/sim/shell.ts` on both sides' identical math; the owner skip belongs beside the existing "skip the owner's hull" so an owner's fish and shells pass their own decoy by construction.
- **Why `DecoyView.by` for everyone:** Eric ruled the decoy renders in the owner's hue for all observers; the client's hue latch keys on `by` (mines, lit zones). `hp` stays owner-only per AR48.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server`; `npm test -w client` -- green after waves 2–3
- `npm run lint`; `npm run check` -- exit 0
- `grep -rn "radarBuoy\|BuoyView\|buoyGate\|scatterJamFakes" shared/src server/src client/src --include=*.ts | grep -v __tests__` -- zero hits outside deletion-record comments
- Headless: `HC_DEV_OPTIONS=1 PORT=<scratch> npm run dev -w server` + `WS_URL=ws://localhost:<scratch> node server/scripts/{queueSmoke,weaponsSmoke,openingSmoke}.mjs` -- pass; kill only the booted PID
