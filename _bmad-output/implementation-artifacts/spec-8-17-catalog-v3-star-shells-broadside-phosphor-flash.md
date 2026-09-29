---
title: 'Story 8.17: Catalog v3 — Star Shells, Broadside, Phosphor, Flash'
type: 'feature'
created: '2026-09-29'
status: 'in-progress'
baseline_revision: '247a9e7'
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

**Problem:** STAR SHELLS and BROADSIDE are the last two equipment lines with empty tiers II–V (Story 8.1's interim), and PHOSPHOR SHELLS / DAZZLE SHELLS are still one-copy add-on verbs bolted onto the star shell — the last two add-ons in the catalog. Eric (2026-09-29) wants all four on the tier system: star shells and broadside as tiered weapons, PHOSPHOR SHELLS as its own tiered damage weapon, and DAZZLE re-cut as a belt consumable called FLASH SHELLS. Only star shells reveal and extend firing reach.

**Approach:** Author the STAR SHELLS and BROADSIDE ladders (catalog-v3 R31 / R35 as ruled), give the flare whole-circle burst damage, build `phosphorShells` as a 360° equipment module whose shell bursts into a visible-to-all BURNING ZONE (a new world store + frame channel, no reveal), build `dazzleShells` (display name FLASH SHELLS) as a prime-and-click consumable whose one-time r150 u burst blinds every non-friendly hull inside it for 10 s to one eighth of its intel (radar) range, delete the star-shell `phosphor`/`dazzle` verbs and the `LitZoneView` `phos`/`daz` flags, bump `PROTOCOL_VERSION` 59 → 60 once, and renumber old Stories 8.17–8.21 to 8.18–8.22 (this story is the new 8.17). Every number below is Eric's ruling of 2026-09-29 (amendments 129–135) unless marked as an orchestrator reading.

## Boundaries & Constraints

**Always:**
- **Eric's 2026-09-29 rulings, verbatim intent (amendments 129–135):** (129) this story is the new 8.17; old 8.17 Smoke Screen → 8.18, 8.18 Wake Drafting → 8.19, 8.19 Bots → 8.20, 8.20 Results → 8.21, 8.21 How-to-Play → 8.22, in `epics.md`, both trackers and every cross-reference in Epic 8/9 story text (a pure renumber, no content change). (130) STAR SHELLS is a tiered weapon on the R31 ladder: tiers II–V each −5 % reload (derived from the row's tier like every equipment line), +2.5 s lit, ×1.1 lit radius (compounding), +0.5 flares (2 at III, 3 at V); AND the flare now deals **10 / 12 / 15 / 17 / 20** damage (tier I–V, whole numbers) to EVERY non-owner hull whose centre is inside the WHOLE lit circle at burst — `burstRadius` stays `= litRadius`, `damage` becomes the tier's number; amendment 39's "structurally damageless" is SUPERSEDED. (131) PHOSPHOR SHELLS is its OWN tiered 360° equipment line (id `phosphorShells` unchanged, kind `equipment`, cap 5, a Q/E/R slot): one shell to the click at the radar rung (660 u base, `rangeU = radarRange` post-fold like star shells), 500 u/s, 1 in the pool, 20 s reload (−5 %/tier derived); at burst it deals **20 / 22 / 25 / 27 / 30** damage to every non-owner hull inside the WHOLE zone, then spawns a BURNING ZONE of radius **100 u at I, ×1.1 per tier II–V** (110 / 121 / 133.1 / 146.41), lasting **8 / 8 / 9 / 9 / 10 s**, burning **5 / 6 / 7 / 8 / 10 hp/s** on every non-owner afloat hull whose centre is inside — a HAZARD ONLY: the zone is drawn for every observer who can see it (counterplay), reveals nothing, extends no gun's reach, and is not a lit zone. (132) DAZZLE SHELLS → **FLASH SHELLS** (display name; internal id `dazzleShells` stays), a belt consumable (cap 5, no reload, no tiers, `CONSUMABLE_IS_WEAPON` true — key primes, click fires) firing one 360° gun-pattern shell to the radar rung (660 u base) that bursts ONCE in **r150 u**: every non-friendly afloat hull whose centre is inside gets `dazzledUntil = now + 10 s`; while dazzled a hull's effective sight is **radarRange × 1/8** (`CONFIG.flashShells.sightFraction = 0.125` → 82.5 u at base, replacing the ×0.5-of-sight factor); NO lingering zone, no light, no reveal, no damage; a second flash on an already-dazzled hull sets the later of the two expiries (never stacks, never shortens). (133) BROADSIDE is a tiered weapon on the R35 ladder: tiers II–V each −5 % reload (derived), +1 spread rung (the shipped `turretMountSpreadDeg` / `traverseDeg` ladders, `spreadRung` 1 → 5), +0.5 turret (5 at III, 6 at V); damage stays 15 per shell at every tier; no separate damage / turret / spread cards exist. (134) The star-shell verbs `starShells.phosphor` / `starShells.dazzle`, the `LitZone.phosphor`/`.dazzle` fields, the `LitZoneView.phos`/`.daz` wire flags, `CONFIG.starShells.{incendiaryRadiusFactor, incendiaryDps, dazzleSightFactor}`, `DAZZLE_GRACE_MS` and the `addon` rows `dazzleShells`/`phosphorShells` are DELETED — no add-on line remains in the catalog (the `addon` kind and doctrine machinery stay in place, unused; ledgered for Eric). (135) Orchestrator readings Eric may veto (recorded in the amendments): (a) a star-shell burst that resolves ≥ 1 hull now emits `hc` like any damaging burst — this mints no new detection channel because the same lit circle reveals those hulls to the firer anyway ("lit from above", no LOS term); (b) a phosphor burst over fog emits `hc` for any hull inside its 100 u+ zone — accepted as the flak precedent (a 50 u blast already does this) and recorded; (c) phosphor's target mask is the gun's `hull | mine | decoy` (a damage weapon detonates armed mines by burst like every gun; star shells keep `hull | decoy` so lighting still never clears a minefield); (d) the flash shell carries the star shell's `hull | decoy` mask with `damage 0` / `contactDamage 0` and a server-internal `flash` tag beside `lit` — an interception en route flashes at the stop point exactly as a flare lights there; a flash burst resolves no victim, so it emits `sp`; (e) the burning zone's `dps`, radius and duration are STAMPED on the zone from the owner's effective stats at spawn (the `lit` tag precedent), so a later tier card never changes a live zone; (f) the burn zone rides its own frame channel `FrameMsg.burnZones?: BurnZoneView[]` (`{ id, x, y, r, until, by }`, omitted when empty) through a `burnZone` `SIGNAL_REGISTRY` pseudo-row with the LIT ZONE's visibility gate byte-for-byte (owner always; otherwise whoever's radar range reaches its centre) — the invariant suite iterates it, the exception count stays SIX; (g) DoT application reuses the existing `applyDamage(…, 'burn', ownerId)` seat, the per-(owner, victim) `dotBuckets` windows and `flushDot` unchanged — only the zone source changes; (h) bots get MINIMAL INTERIM rows (8.20 owns the table): `phosphorShells` fires like the star shell's old offensive flare at the nearest live contact inside sight; the `dazzleShells` belt tactic primes and fires at the nearest live contact in sight while engaged; the `broadside`/`starShells` tactics are unchanged and the verb-keyed offensive-flare branch and `phosphorStaleCapMs` go; (i) the client draws a burning zone in the existing phosphor treatment `render/litZones.ts` already has for `phos` zones, moved to a new `render/burnZones.ts`; a flash burst renders as the ordinary `burst` event (no new event, no ring); the victim keeps the DAZZLED tell; (j) card faces: STAR SHELLS tier rows print every authored step (amendment 85) with labels `DAMAGE`, `LIT`, `RADIUS`, `FLARES`; PHOSPHOR rows `DAMAGE`, `BURN` (hp/s), `RADIUS`, `LASTS`; BROADSIDE rows `TURRETS`, `SPREAD`; FLASH SHELLS consumable rows `RADIUS 150 u`, `BLINDS 10 s`, `SIGHT 1/8 intel`; a row whose displayed value does not change is skipped (amendment 87(b)); hover descriptions and the two new belt/slot glyphs are implementer DRAFTS in the existing style, ledgered (amendment 110 precedent).
- **Catalog authoring:** a per-tier step helper (`tieredWeaponSteps`) authors NON-uniform ladders as four explicit tier arrays; damage steps stay whole numbers (amendment 39): star `+2, +3, +2, +3`; phosphor damage `+2, +3, +2, +3`, dps `+1, +1, +1, +2`, duration `+0, +1, +0, +1` s (a zero step is simply omitted from that tier), radius `×1.1` each tier II–V. `maxAmmo`/`turrets` +0.5 floor through `EQUIPMENT_INT_FIELDS` as the torpedo tubes do. `LINE_IDS` keeps 26 ids in the same order; `dazzleShells` moves `LineId` → `ConsumableId` (`CONSUMABLE_IS_WEAPON.dazzleShells = true`, `consumableArc('dazzleShells')` = full 360°, reach `radarRange`); `phosphorShells` joins `EquipmentId` (`EQUIPMENT_IS_WEAPON` true, `arc: 'full'`); `EQUIPMENT` registry = 14 rows; `CONSUMABLES` registry = 6 rows; catalog stubs stay 2 (SMOKE SCREEN, DEPTH CHARGE).
- **Shared sim, one derivation:** a shared helper (`effectiveSight(stats, dazzled)` in `shared/src/sim`) returns `dazzled ? radarRange × CONFIG.flashShells.sightFraction : sightRange`; the server's `sightOf` and every client mirror (fog hole, radar dim, projectile cull, prediction) call it — never a per-side re-derivation.
- **Wire:** `PROTOCOL_VERSION` 59 → 60, one bump, one header entry (`LitZoneView` −`phos`/`daz`; `FrameMsg.burnZones`; `phosphorShells` an `EquipmentId`, `dazzleShells` a `ConsumableId`; CONFIG blocks `phosphorShells` / `flashShells` read by the client). Perception invariant: nothing outside sight ∪ this-tick paints ∪ owned lit zone ∪ the radar-gated zone circles reaches a client; six exceptions; the fuzz seeds burn zones and dazzled observers.
- **Damage gate untouched:** star and phosphor burst damage go through `resolveBurst` → `burstDamage` → `applyDamage` (cut, shield, tally as ruled in amendments 100–102, 118, 128); burn ticks through the `'burn'` seat.
- **Docs:** version 0.18.17 (cycle 152) in `VERSION` + root `package.json` (+ lock); `CHANGELOG.md`; ONE-LINE stamps in both trackers; amendments 129–135 appended to `epic-8-context-amendments.md` AND re-applied under `## Ratified Amendments` in `epic-8-context.md`; `epics.md` gains the Story 8.17 section and the renumber; `deferred-work.md` 8.17 section (drafts, the empty add-on kind, the `hc`-over-fog readings); `DESIGN.md`/`EXPERIENCE.md`: MINIMAL edits only where the dazzle glare zone / phosphor verb text becomes false; catalog-v3.md gets a dated `superseded_in_part` line for R31/R33/R34/R35; How-to-Play untouched (8.22).

**Block If:** any need for a number not listed above; any reading in which a burn zone, a flash or a lit zone reaches an observer outside the declared gates; a seventh perception exception; a per-side fork of the sight derivation; a proposal to keep the star-shell verbs "for later".

**Never:** SMOKE SCREEN or DEPTH CHARGE; a lingering glare zone for FLASH SHELLS; a reveal or reach extension from a phosphor zone; a damage/turret/spread card for the broadside; new `hc`/`sp` grammar; How-to-Play copy; editing `CLAUDE.md`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Star tier fold | 3 STAR SHELLS copies (tier III) | reload 20 → 18 s (×0.9), lit 15 s, r199.65 u, 2 flares, damage 15 | none |
| Star burst | tier I flare bursts; enemy A inside r165, enemy B at 170 u, owner inside | A −10 hp (`dmg` 10), B untouched, owner untouched, `hc` to firer, zone lit r165 for 10 s | none |
| Star burst empty | flare bursts over empty water | `sp`, zone lit, no `dmg` | none |
| Star + shield | enemy A shielded 100 | A shield 90, hull unchanged, `dmg` 0, `hc` | none |
| Phosphor burst | tier I shell bursts; enemies A (60 u) and B (95 u) inside r100, C at 105 u | A, B −20 hp, C untouched; burn zone r100 / 8 s / 5 hp/s spawned; `hc`; armed mine at 40 u detonates | none |
| Burn tick | A stays inside 2 s | A loses 10 hp over 2 s via the `'burn'` seat, one aggregated `dmg` per window; A leaving stops the burn and flushes | none |
| Burn zone tier | tier V phosphor | zone r146.41, 10 s, 10 hp/s, burst 30 | none |
| Burn zone expiry | `until` passed | zone removed, no further burn, `burnZones` omitted from frames | none |
| Burn zone reveal | enemy hull inside the firer's burn zone but outside the firer's sight | NOT a contact for the firer (no reveal); the zone circle itself is visible to any observer whose radar range reaches its centre | none |
| Flash burst | consumable primed, click at 400 u, hulls A (100 u from burst) and B (160 u) | A `dazzledUntil = now + 10 s`, B untouched, owner never dazzled, copy spent, `sp` (no victim resolved), no zone | none |
| Flash re-hit | A dazzled with 4 s left, second flash | A's expiry becomes `now + 10 s` | none |
| Dazzled sight | A base radar 660, sight 330, dazzled | `sightOf(A)` = 82.5 u; radar range unchanged; own fog hole 82.5 u; `OwnShip.dazzledUntil` present | none |
| Flash blocked | no copies / click during refit window | `no-ammo` denial / suspended as every consumable | denial event, nothing spent |
| Broadside tier fold | 3 copies (tier III) | reload 18 → 16.2 s, spreadRung 3 (mounts ±22.5°, traverse ±7.5°), 5 turrets, damage 15 | none |
| Broadside tier V | 5 copies | 14.4 s, rung 5 (±6° / ±14°), 6 turrets | none |
| Old add-on ids | a forged pick of `phosphorShells` as an add-on / `dazzleShells` as equipment | refused fail-closed (the kind is what the catalog says now) | silent no-op |

</intent-contract>

## Code Map

- `shared/src/constants.ts` -- `CONFIG.starShells` (+`damage: 10`, −the three doctrine fields), NEW `CONFIG.phosphorShells` `{ arc:'full', hits: HITS_HULL_MINE_DECOY, shellSpeed 500, maxAmmo 1, reloadMs 20000, damage 20, zoneRadius 100, zoneDurationMs 8000, dps 5, shellRadius 2 }`, NEW `CONFIG.flashShells` `{ arc:'full', hits: HITS_HULL_DECOY, shellSpeed 500, shellRadius 2, radius 150, durationMs 10000, sightFraction 0.125 }`; `CONFIG.bots` weight keys naming `starDazzle`/`starDuration`
- `shared/src/sim/catalog.ts` -- `tieredWeaponSteps` helper; `starShells`, `broadside`, `phosphorShells` ladders; `dazzleShells: consumable(...)`; `addon()` rows gone; header counts
- `shared/src/sim/loadout.ts` -- `EquipmentId` +`phosphorShells`; `ConsumableId` +`dazzleShells`; `EQUIPMENT_IS_WEAPON` / `CONSUMABLE_IS_WEAPON`
- `shared/src/sim/stats.ts` -- `EffectiveStarShells` (+`damage`, −verbs), NEW `EffectivePhosphorShells`, `shippedSkillshotRows` → tier-aware rows, post-fold `rangeU` re-pins for `phosphorShells`
- `shared/src/sim/effects.ts` -- `EQUIPMENT_STAT_FIELDS` (+`starShells.damage`, `phosphorShells.*`), `EQUIPMENT_INT_FIELDS` (`turrets`, pools), `EQUIPMENT_DOCTRINES` −`starShells`
- `shared/src/sim/arcs.ts` -- `consumableArc('dazzleShells')` full; `arcFor('phosphorShells')` full
- `shared/src/sim/sight.ts` -- NEW `effectiveSight(stats, dazzled)`; barrel export
- `shared/src/types.ts` -- `LitZoneView` −`phos`/`daz`; NEW `BurnZoneView`; `FrameMsg.burnZones?`; `ShellState.burn?`/`flash?` server-internal tags beside `lit`
- `shared/src/index.ts` -- PV 60 + header entry; exports
- `server/src/game/equipment/starShells.ts` -- damage from the row; `server/src/game/equipment/phosphorShells.ts` -- NEW row (flow of starShells.ts, `burn` tag); `server/src/game/equipment/consumables/dazzleShells.ts` -- NEW click-fired row (`flash` tag); `equipment/index.ts` + `consumables.ts` registries
- `server/src/game/world.ts` -- `LitZone` −verbs; NEW `BurnZone` store + `spawnBurnZone` + `expireBurnZones`; `resolveBurst`/`resolveShell` handle `burn`/`flash` tags; `applyZoneEffects`/`markZoneEffects` read `burnZones`; `applyFlash(at, radius, ownerId)`; STEP_ORDER row names; reset/redeploy clear `burnZones` at match start (mines precedent)
- `server/src/game/signals.ts` -- `sightOf` → `effectiveSight`; `burnZoneSignal` pseudo-row (lit-zone gate); `server/src/game/perception.ts` + `frames.ts` -- `burnZones` scan/channel; `server/src/__tests__/perception*.test.ts` -- invariant/oracle arms + fuzz seeding
- `server/src/game/ai/equipment.ts`, `ai/consumables.ts`, `ai/spending.ts` -- interim tactics, alias tables, total-registry pins
- `server/scripts/batchsim/*`, `server/scripts/rl/*` -- compile against the new rows (tsc'd separately)
- `client/src/render/litZones.ts` -- drop `phos`/`daz`; `client/src/render/burnZones.ts` -- NEW; `render/fog.ts`, `render/radar.ts`, `render/projectiles.ts`, `sim/prediction.ts`, `main.ts` -- dazzle via `effectiveSight`; `render/{equipmentIcons,equipmentInfo,aimPreview,weaponArc,firing,hotbar}.ts`, `ui/boonCopy.ts`, `audio/*` -- the new weapon + consumable + card rows
- Docs: `VERSION`, `package.json`, `package-lock.json`, `CHANGELOG.md`, `_bmad-output/planning-artifacts/epics.md`, `_bmad-output/gds-workflow-status.yaml`, `_bmad-output/implementation-artifacts/{sprint-status.yaml,epic-8-context.md,epic-8-context-amendments.md,deferred-work.md}`, `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/catalog-v3.md`, `ux-designs/…/DESIGN.md` + `EXPERIENCE.md`

## Tasks & Acceptance

**Execution:**
- [ ] Wave 1 `shared/` -- CONFIG blocks, catalog ladders + kind moves, stats/effects rows, arcs, `effectiveSight`, types (burn zone, lit flags gone, shell tags), PV 60, tests -- `npm run build -w shared && npm test -w shared`
- [ ] Wave 2 `server/src` -- star damage, phosphor row + burn-zone store/signal/channel, flash consumable + dazzle mark, `sightOf`, bots interim, perception invariants + fuzz, tests -- `npm test -w server`; `tsc` on `server/scripts/{batchsim,rl}`
- [ ] Wave 3 `client/` (parallel with 2) -- burn-zone renderer, dazzle mirrors via `effectiveSight`, phosphor + flash slot/belt/aim/glyph/copy, card rows, tests -- `npm test -w client`
- [ ] Wave 4 docs -- version 0.18.17, changelog, epics.md 8.17 section + renumber, both trackers, amendments 129–135 in both homes, deferred-work, catalog-v3 stamp, DESIGN/EXPERIENCE minimal -- `npm run check` exit 0
- [ ] Unit-test every row of the I/O matrix

**Acceptance Criteria:**
- Given a Battleship holding STAR SHELLS ×3, BROADSIDE ×5 and PHOSPHOR SHELLS ×1, when `effectiveStats` folds, then star = 18 s / 15 s lit / r199.65 / 2 flares / 15 dmg, broadside = 14.4 s / rung 5 / 6 turrets / 15 dmg, phosphor = 20 s / 20 dmg / r100 / 8 s / 5 hp/s, and the server and client folds are byte-identical.
- Given the perception fuzz (20 seeded worlds) with random burn zones, lit zones and dazzled observers, then nothing outside sight ∪ this-tick paints ∪ owned lit zone reaches any client as a contact, every zone circle received passes its own gate, no `LitZoneView` carries `phos`/`daz`, and the exception count is six.
- Given a flashed hull, when it renders its own frame, then its fog hole, radar dim mask and projectile cull all use 82.5 u (base) and revert at `dazzledUntil`.
- Given `npm run check`, then lint, tsc ×3 and every test pass; `grep -rn "dazzleSightFactor\|incendiaryDps\|incendiaryRadiusFactor\|DAZZLE_GRACE_MS\|\.phos\b\|\.daz\b" shared/src server/src client/src` returns nothing outside deletion-record comments; `PROTOCOL_VERSION` is 60; `EQUIPMENT` has 14 rows; `CONSUMABLES` has 6; the catalog has 2 stubs and 0 add-ons.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Why the burn zone is its own store, not a `LitZone` with a flag:** `ownZoneCovers` (reveal) and the flare-reach rule both iterate `world.litZones`; a burning zone must reach neither. A separate store makes "hazard only" true by construction rather than by a flag every reader must remember to check.
- **Why the flash sets a mark instead of spawning a zone:** Eric's ruling is a one-time burst; the existing `dazzledUntil` mark, its `OwnShip` mirror and the DAZZLED tell already carry the victim side, so nothing lingers on the water and no observer can watch a glare ring.
- **Why `effectiveSight` lives in shared:** three client mirrors of the server's shrunken sight (fog, radar dim, projectile cull) have desynced before (epic-4 amendments); one shared function is the only way the four stay equal.

## Verification

**Commands:**
- `npm run build -w shared && npm test -w shared` -- green after wave 1
- `npm test -w server`; `npm test -w client` -- green after waves 2–3
- `npx tsc -p server/scripts/rl --noEmit` and the batchsim tsconfig -- clean
- `npm run lint`; `npm run check` -- exit 0
