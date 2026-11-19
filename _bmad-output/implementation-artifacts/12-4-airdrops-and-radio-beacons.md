# Story 12.4: Airdrops and Radio Beacons

Status: ready-for-dev

<!-- Created 2026-11-19 by gds-create-story from Eric's sitting (the `/gds-create-story 12-4` args + two AskUserQuestion rounds), recorded as epic-12 amendment 5. Build order: after 12.3 (epic-12 amendment 1(d)). -->

## Story

As a captain,
I want every airdrop to be XP, my stats to grow by a dice roll every level, a wreck to pay me stats for the levels its captain had, and charted supply drops of XP crates instead of radio beacons,
so that leveling is the one road to a stronger ship, sinking a veteran is worth it, and the map gives me a reason to move to a marked spot.

Eric, 2026-11-19, verbatim (the args): *"I want to turn all airdrops into experience pickups. Lets say they grant 10% experience. The icon should be a square with "+XP" inside it. Easy. | To get stats, instead of getting them from these airdrops, every time I level I want to gain 0, 1, 2, or 3 points per stat, randomly. Treat it like a dice roll, where the faces are 0, 0, 1, 1, 2, 3. (If there are no more upgrade cards in my deck, I should continue to gain this stat roll). When I gain a level, the increased stat's number in the HUD stat display should turn amber for a moment and then fade back to its normal color to indicate what has changed."*

His answers at the sitting (AskUserQuestion):
- Out of cards: *"Roll replaces it"* (the old +1 random stat is retired).
- Wreck: *"Wreck crate is a different concept altogether … A wreck is worth +1 point to a random stat for each level that ship had gained before being sunk. So if I sink someone at level 5, it provides +1 to a random stat five times."* Then *"Keep salvage icon; lvl 0 = none"*.
- Beacons: *"Beacons are being removed altogether. Instead, treat them as a supply drop of XP crates, say 10 of them in a bunch. Same spawn characteristics, and I want their locations marked on the map before they drop."* Spread: *"Inside the old 500 u circle"*. The mark: *"It disappears when the crates land, it should fade out over 10 sec or something."*
- Crate color: *"XP gauge color"*. Bots: *"Head for charted drops"*.

The full ruling, with the readings of record, is **epic-12 amendment 5** (`epic-12-context-amendments.md`). Never re-ask it.

## Scope

- **In:** XP crates; the level stat roll and the amber flash; wreck crates; radio beacons deleted, supply drops built on their placement, timing and chart; bots head for charted drops; How-to-Play draft; GDD stamp.
- **Out:** no change to the card offer draw, XP rates (`levelMs`, kill levels, assist split), the minute crate schedule, the storm, the HUD layout (12.3 owns it). No new sounds: the beacon-surfaced cue is reused (reading of record).

## Acceptance Criteria

### A. Every airdrop is an XP crate (amendment 5(a))

1. Taking any non-wreck crate (minute crates AND supply-drop crates) grants `CONFIG.drops.xpLevels` = **0.1** of a level through the one XP entry point `grantXp` (`server/src/game/world.ts`). That is 6,000 ms against the 60,000 ms level, exact in integer ms. It banks every level it crosses (and so rolls, AC 5) like any XP.
2. A crate has no stat any more. The crate kinds are `'xp' | 'wreck'`. The spawn-time stat draw (`rollKind`), the +bonusMin..+bonusMax amount and `drops.indices` / `bonusMin` / `bonusMax` / `wreckRolls` are deleted.
3. **The icon:** the crate's square (the pickup disc's inscribed square, as today) with **"+XP"** inside, drawn as linework (a stroked glyph in `drawEquipmentIcon`'s style, crisp at every zoom; not a Pixi `Text`), in the **XP gauge's color** (phosphor `0x00ff88` today, the XP track fill at `shipConsole.ts:560`; if 12.3's new XP bar wears another color, use that one token) with the existing soft glow. The 10 px chart icon (Story 11.8) shows the same mark. `CLIENT_CONFIG.drops.kindColors` shrinks to `xp` + `wreck`. **APPROVED on the bench** (epic-12 amendment 6(a)): port the bench's `XP` glyph paths (https://claude.ai/artifact/SWNR8gecZypZ4HArWiwPSJ v2) as an `'xp'` entry beside `WRECK_GLYPH` in `equipmentIcons.ts`.
4. Pickup feedback: an XP crate plays the existing `airdropChime` and shows **no toast** (reading of record: no in-game copy unasked). The `dp` event still reaches the collector only.

### B. The level stat roll (amendment 5(b), (c))

5. Every completed level (`ship.level += 1` inside `addXpMs`) rolls a die with faces `CONFIG.xp.statRoll.faces` = **[0, 0, 1, 1, 2, 3]** once for each stat in `CONFIG.xp.statRoll.indices` (ARMOR, POWER, ENGINES, RELOAD, INTEL; the existing `RANDOM_INDEX_STATS` array) and adds each face to `ship.indexBonus[stat]`. The stats then re-fold through `effectiveStats()` with the same settle a card gets (`refoldCards` + `settleRefold`).
6. The roll is a pure shared function (e.g. `rollLevelStats(rng, cfg)` in a new `shared/src/sim/levelRoll.ts`): exactly one `rng.next()` per stat, in list order. A junk face or a bad rng value counts 0, never NaN or a fraction.
7. The roll's randomness is **room-private and isolated**: its own sub-stream (e.g. `statRollSeed ^ imul(STAT_ROLL_K + k, 0x9e3779b9)`, k = a World-wide roll counter, seed minted from the pseudonym material like `dropSeed`). It NEVER draws from `ship.drawRng`, because that would shift every later offer.
8. **Independent of the offer:** a hull with cards left and a hull with none roll identically. **The exhausted conversion is retired** (5(c)): an empty draw banks nothing (`bankedLevels` → 0, no `pt`, no point). `convertBank`'s +1, `drawBonusIndex` and `CONFIG.offer.exhausted` are deleted. The bonus fold becomes one index point per `ib` count (it multiplied by `indexPoints` = 1).
9. Readings of record: the countdown's opening hand (`grantOpening`, `level` unchanged) does not roll; a SINKING or SUNK hull's levels roll nothing (R7's "once sinking, you're done", as `convertBank` refuses today). Bots roll exactly like humans (same sim).
10. `OwnShip.ib` stays the wire seat for the bonus (self-private, non-zero counts). Clients fold it for prediction as today.

### C. The amber flash (amendment 5(d))

11. When a stat's bonus (`you.ib[stat]`) **rises**, that stat's value in the HUD stat display turns **amber** (`CLIENT_CONFIG.colors.amber`), holds a moment, then fades back to its normal color. Only the stats that rose flash. A 0 face changes nothing and flashes nothing.
12. Readings of record: any `ib` rise flashes (a level roll or a wreck pickup). Card picks and the Shift window do not (they change the value but not `ib`). The first observation after joining or redeploy seeds the memory and never flashes. A hover preview's amber mark (R18) wins while it shows.
13. The hold and fade durations are `CLIENT_CONFIG` feel knobs: **hold 600 ms, then a 1,500 ms smoothstep blend** back to normal (APPROVED, amendment 6(b)). The color is a smooth blend amber → normal, not a step. Motion-off keeps the flash: it is information, not motion.
14. **Where:** if 12.3 has landed (it is built first), the flash lives on the 12.3 bar's 100-point index value. Otherwise it lives on `IndexRows` in `client/src/render/console/shipConsole.ts`. Either way the per-frame update must allocate nothing.

### D. Wreck crates (amendment 5(e))

15. A sinking participant leaves ONE wreck crate (kind `'wreck'`, the white salvage icon, unchanged look) worth **+1 to a random index stat once per completed level** the victim had (`ship.level` at the sink). Each +1 is an independent uniform pick over `CONFIG.xp.statRoll.indices` (reading of record). The picks are rolled at pickup on the existing pickup sub-stream.
16. **A victim at level 0 leaves no wreck.** The other spawn rules are unchanged: participants only, a scuttle only while in combat, never in respawn mode, never before the zone starts.
17. The `dp` event for a wreck carries its grants (the `[stat, n]` rolls, merged per stat or one per point, the dev's choice) and the existing stat toast + chime show them. An XP crate's `dp` carries none.
18. The level must be known when the crate is taken, after the victim may be gone: store the count on the crate (`DropState`, server-side only). It never rides the wire: `DropView` carries only `{id, x, y, c}`.

### E. Radio beacons removed; supply drops (amendment 5(f), (g))

19. **Everything beacon-only is deleted** (the full footprint is in Dev Notes): the XP pot and payment, hp / armor / damage, the `'beacon'` target kind and every weapon mask's `beacon` entry, the kill split caller, ram mass and bodies (server and client predictor), wounded-smoke emission, the bot farm / contest / standoff, the airdrop keep-out from beacon circles, `beaconXpMs` in the match record and telemetry, the batch-sim beacon metrics, the beacon water body and pulse, `matchOverride.beacons`.
20. **Supply drops reuse the beacon placement and timing exactly** (*"Same spawn characteristics"*). Per ring cycle, `counts` [7, 5, 3] spots are picked at the cycle's first tick by `pickBeaconSpot` (renamed), relative to the live ring: placement radius `ring.r − edgeMarginU`, hard min spacing `minSpacingFrac` × that radius, soft captain keep-out `keepOutU`, clear of land, on the per-cycle private stream. The spot is **charted** from then on and the crates **land** at `cycleStart + surfaceMs` (1:00). The CONFIG block becomes `CONFIG.supplyDrops` with only the placement and timing dials plus `crates: 10` and `scatterU: 500` (the old `rangeU`); the beacon-only dials go.
21. **At landing**, each charted spot drops `crates` = **10** ordinary XP crates (AC 1) at uniform random points within `scatterU` = **500 u** of the spot, clear of land, never overlapping (centers at least `2 × drops.radiusU` apart). Each crate is re-sampled up to `placeAttempts`, then skipped (logged, never thrown). The scatter draws on its own private stream keyed by (cycle, spot). The edge margin (500 u) keeps the scatter inside the ring.
22. Supply crates are ordinary crates from the moment they land: frame-delivered, seen by sight only (`crateKindSight`) or an own lit zone, a radar blip, taken by touch, eaten by the storm. They add no perception exception. A crate that lands outside the live ring (the ring can move between charting and landing) is eaten by the next `stormDrops` sweep, like any crate (no special case).
23. **The map mark** (5(g)): every spot is shown to **every player** on the chart layer from charting until it lands, then **fades out over `CLIENT_CONFIG` ≈ 10 s** from the landing moment and is gone. It rides the public schema seat the beacon chart used (`ArenaState` `beaconCycle` / `beaconCount` / `bcnN X/Y`, renamed). The landing time is derived (`cycleStart + surfaceMs`), so `bcnN SinkT` can go. **The look is APPROVED, style B** (amendment 6(c)): a dashed 500 u ring (72 dashes, 1.5 px, alpha 0.5) plus the 10 px +XP icon at its centre, both in the XP green, over a translucent green fill of the circle at 8 % alpha. At full strength from charting to landing; from landing, ring + icon + fill fade together linearly to nothing over 10 s. All of these are `CLIENT_CONFIG` knobs.
24. The beacon-surfaced edge (`client/src/audio/cueEdges.ts`) fires when a supply drop lands and plays the existing `'beacon'` cue (reading of record, for Eric's ear).

### F. Bots (amendment 5(h))

25. Bots see charted supply drops through the existing port widening (`BotWorldPort.beacons?()`, renamed, still fed from the public chart only). A bot may pick a charted drop and steer to it so it arrives around the landing, then takes the crates through the existing sighted-crate logic (`server/src/game/ai/drops.ts`). The beacon standoff / farm-in-range / contest-while-paying behavior is deleted (nothing pays any more).
26. Simplest mechanism (memory: don't overcomplicate). Reuse `pickBeacon`-style selection with the profile dial renamed (`contestsBeacon` → e.g. `seeksSupply`) and the `'farm'` posture repurposed or removed. Bots must stay functional: no bot test may lose coverage of drop pickup, and the bot suite stays green.

### G. Wire, records and docs

27. **`PROTOCOL_VERSION` bumps** (110 → next, the number taken at PR time). The changes: `DropView.c` becomes `'xp' | 'wreck'`; `CONFIG.drops`, `CONFIG.offer`, `CONFIG.xp` and the deleted `CONFIG.beacons` change what the client reads; the schema's beacon fields are renamed and `SinkT` is dropped; `TargetKind` loses `'beacon'`. One history note in `shared/src/index.ts`.
28. The perception exception count stays SIX. The perception suite proves that a supply crate is delivered exactly like a minute crate, and that no frame carries a charted spot (the chart is schema-only).
29. Records: How-to-Play `client/src/how-to-play/copy.ts` — replace the `[ BEACONS AND AIRDROPS ]` beacon paragraph and update the airdrop / wreck paragraphs with a short factual DRAFT that Eric rewrites (memory: copy is his). The GDD Economy section gets a minimal dated stamp of amendment 5 only. Add `spec-12-4-*.md` as the cycle record and ONE-LINE stamps in both trackers. VERSION and root `package.json` +1 patch. All numbers are taken at PR time.
30. `DESIGN.md` gains the crate icon, the flash and the supply-drop mark as approved on the bench, in the same PR.

## Tasks / Subtasks

- [ ] **T1 Shared: XP crates + the level roll** (AC 1–2, 5–8, 15, 27)
  - [ ] `CONFIG.drops`: drop `bonusMin` / `bonusMax` / `wreckRolls` / `indices`, add `xpLevels: 0.1`. `CONFIG.xp.statRoll { faces, indices: RANDOM_INDEX_STATS }`. Delete `CONFIG.offer.exhausted`.
  - [ ] `sim/drops.ts`: kinds `'xp' | 'wreck'`; delete `rollKind` / `rollDrop` / `rollAmount`; keep the count law, `dropMinuteAt`, `dropTouches`, `isDropKind` (now xp|wreck), `isDropRoll` (wreck grants). A wreck pickup roll function: `n` uniform stat picks.
  - [ ] New `sim/levelRoll.ts` (`rollDie`, `rollLevelStats`), exported from the barrel.
  - [ ] `sim/stats.ts`: the bonus fold reads `bonusCount` directly. `sim/draw.ts`: delete `drawBonusIndex`.
  - [ ] Unit tests: the die's slices, one draw per stat, fail-closed faces, distribution within tolerance, following the dials (never pinning Eric's numbers).
- [ ] **T2 Server: XP pickup, the roll, wrecks** (AC 1, 5–9, 15–18)
  - [ ] `collectDrop`: `'xp'` → `grantXp(ship, xpLevels)`; `'wreck'` → n picks onto `indexBonus` + refold/settle (the existing path).
  - [ ] `addXpMs`: after each `level += 1`, roll (afloat only) on the isolated stream, then refold/settle once per grant. Mind the RE-ENTRANCY note on `convertBank` (a roll can run inside damage resolution via kill credit).
  - [ ] `convertBank` → bank 0, nothing else (keep the "sinking drops the bank" guard).
  - [ ] `placeWreckDrop`: skip at level 0; store the level on the crate. `scatterBatch`: kind `'xp'`.
  - [ ] Server tests: crate = 0.1 level (bank crossing incl.), roll per level independent of the offer, exhausted hull rolls and banks nothing, sinking rolls nothing, opening hand doesn't roll, wreck count = victim level, level-0 no wreck, `drawRng` untouched by the roll (an offer sequence identical with and without rolls).
- [ ] **T3 Beacons out, supply drops in** (AC 19–24, 27–28)
  - [ ] Follow the Dev Notes footprint, section by section. Rename rather than rewrite the placement / chart / schema / client chart view. Delete the rest.
  - [ ] STEP_ORDER: `placeBeacons` → `placeSupplyDrops` (charting), plus a landing step (crates placed on the landing tick). Re-pin `stepOrder.test.ts` deliberately.
  - [ ] Port the `pickBeaconSpot` + per-cycle placement tests. Add scatter tests (count, radius, spacing, land, determinism). Delete the beacon-only test files.
  - [ ] Move `beaconFixture.ts`'s generic helpers (`DT`, `bareWorld`, `captain`, `moveTo`, `inp`, `run`, `xpMsOf`, `openCycle`) to a neutral fixture before deleting the beacon ones. `drops.test.ts`, `dropPerception.test.ts` and `botDrops.test.ts` import them.
- [ ] **T4 Bots** (AC 25–26): port rename, selection, arrival, pickup. Prune `botBeacons.test.ts` to the surviving behavior. `botPosture` / `botArcs` / `botTactics` / `bots.test.ts` stay green.
- [ ] **T5 Client** (AC 3–4, 11–14, 17, 23–24)
  - [ ] `render/drops.ts`: the +XP linework glyph, XP-gauge color, chart icon. `config.ts`: `kindColors` xp + wreck, flash knobs, mark fade knob.
  - [ ] `net/roomBindings.ts` `handleDropPickup`: chime always, toast only for wreck grants.
  - [ ] The flash (AC 14's location): remember `ib` per stat, stamp a rise time, blend amber → normal per frame without allocation. Unit-test the pure blend and the rise detector (seed / no flash on first read / only risen stats).
  - [ ] `render/beacons.ts` → supply-drop chart only (water body, pulse, buoy art gone); landing fade. `sim/beaconView.ts` → chart view (drop `BeaconBodies`). Clean up the `main.ts` wiring and the stage layers (`beaconWorld` goes; the chart layer stays).
- [ ] **T6 Harness, records, smokes**: delete the batch-sim beacon metrics. Update `soloSmoke.mjs`'s B1 assert to the supply-drop chart. Remove `beacons: false` from `fogSmoke.mjs` if its dev switch goes. Update `matchRecord` / `match.ts` telemetry.
- [ ] **T7 Match the approved bench** (AC 3, 13, 23, 30): the looks were APPROVED at create-story (amendment 6; bench https://claude.ai/artifact/SWNR8gecZypZ4HArWiwPSJ v2). Build them to the bench, then show Eric the built crate, flash and mark (staging or a page from the real render modules) before the PR. A deviation from the bench is a new candidate and needs his yes. DESIGN.md rows record the approved looks.
- [ ] **T8 Docs + records** (AC 29): How-to-Play draft, GDD stamp, `spec-12-4-*.md`, ONE-LINE tracker stamps, VERSION / package.json +1 patch, PV bump. Numbers at PR time after `git fetch`.
- [ ] **T9 Gate**: `npm run lint` explicitly, then `npm run check`. Run `matchSmoke` + `weaponsSmoke` (+ `soloSmoke`) on your own booted server with `HC_DEV_OPTIONS=1`, then kill the PID and its tsx child. Run `tickCost.mjs` old vs new in the PR body (crate counts change: up to 70 supply crates per cycle). Bound every run with a wall-clock kill.

## Dev Notes

### Current state of the files this story touches

**Airdrops (Story 10.9) — `shared/src/sim/drops.ts`, `server/src/game/world.ts`**
- `DropState {id, x, y, kind}`, kind = an `IndexId` or `'wreck'`. `rollKind` (spawn) draws the stat; `rollPickup` (pickup) draws the amount (`bonusMin..bonusMax`) or a wreck's `wreckRolls` stat + amount pairs.
- `scatterBatch(minute)` (~world.ts:8110): per-minute stream `dropSeed ^ imul(minute+1, …)`, ids `drp-<minute>-<n>`, `pickDropSpot` (~:8133) re-samples land and the beacon keep-out (`inBeaconKeepOut` ~:8151, deleted).
- `placeWreckDrop(ship, scuttle)` (~:8185), called from the sink path (~:3225). `collectDrops` → `dropTaker` → `collectDrop` (~:8235): today adds rolls to `indexBonus`, `refoldCards` + `settleRefold`, `dropsTaken += 1`, deletes, pushes `dp {k,id,t,g}`. It grants no XP today.
- `stormDrops` deletes crates outside the live ring.
- Wire: `DropView {id,x,y,c}` (`shared/src/types.ts`, key order load-bearing), `DropPickupEvent {k,id,t,g}`. Signal: `dropSignal` in `server/src/game/signals.ts` (~:860–890), sight-gated at `CONFIG.vision.crateKindSight`. Client ingest: `client/src/sim/dropView.ts` (`isDropKind` gate), `net/roomBindings.ts` `handleDropPickup` (~:1588, toast + chime). Render: `client/src/render/drops.ts` (`crateStyleFor`, `paintCrate`, `drawEquipmentIcon(glyphId)`, `WRECK_GLYPH` in `equipmentIcons.ts`). Colors: `CLIENT_CONFIG.drops.kindColors` (`client/src/config.ts` ~:1180–1210).

**XP and levels — `server/src/game/world.ts`**
- `ShipRecord.xpMs` (integer ms in [0, levelMs)), `level` (completed levels, mirrored to `OwnShip.lvl`), `bankedLevels`, `indexBonus` (all keys, folded only via `effectiveStats`, mirrored as `OwnShip.ib`).
- `grantXp(ship, levels)` (~:3571) → `addXpMs` (~:3580): `while xpMs >= levelMs { xpMs -= levelMs; level += 1; grantPoint(ship) }`. `grantPoint` banks and runs `materializeOffer`. An empty draw → `convertBank` (~:3756): +1 via `drawBonusIndex(ship.drawRng)` per banked level, sinking/sunk → bank 0. **RE-ENTRANCY:** kill credit → grantXp → … → re-fold can run inside damage resolution. No step may hold `ship.stats` / `ship.wake` across a call that can award a kill. The roll's re-fold inherits this.
- `grantOpening` (countdown, level-zero hand): banks a level without touching `level`. It does not roll.
- Streams: `dropSeed = priv ^ DROP_STREAM_K` (~:2319); `PICKUP_DROP_K` sub-streams; `drawRngFor(ordinal)` per ship (offer stream: never touch).

**Bonus fold — `shared/src/sim/stats.ts`** `bonusIndexPoints` = `bonusCount(bonus[id]) × CONFIG.offer.exhausted.indexPoints` (=1) → `bonusCount` alone. `IndexBonus` doc to update. **Draw — `shared/src/sim/draw.ts`** `drawBonusIndex` (~:437) deleted with its tests (`draw.test.ts` ~:808).

**HUD stat display — `client/src/render/console/shipConsole.ts`** `IndexRows` (~:250): Text per index; `paintValue` writes text + fill only on change (`shown` memo); fill phosphor, or amber under a hover-preview mark. `ShipConsoleView` (~:100) has no `ib` today: add it (or a per-stat bonus array) from `you.ib` in `main.ts` `shipConsoleView` (~:3512). The flash needs a per-frame repaint while active only. **12.3 replaces this console with the vertical bar** (epic-12 amendment 3(e): "the 100-point index value between the name and the tier mark"). If 12.3 has landed, put the flash there (AC 14).

**Radio beacons — the full footprint (inventory 2026-11-19)**
- *Reuse (rename to supply drops):*
  - `shared/src/sim/beacons.ts`: `beaconCycleAt`, `beaconCycleStartMs`, `beaconCountFor`, the charted phase of `beaconStateAt`, `BEACON_WIRE_SLOTS = 8` + its load-time throw.
  - `server/src/game/spawn.ts:223–309`: `pickBeaconSpot`, `BeaconSpotConfig`, `withinAny`, `beaconSpotHardOk`.
  - `server/src/game/beacons.ts` `BeaconField`: private seed (must NOT be the public map seed), `replace(cycle, …)` per-cycle stream, `wireCount`, the `chart` memo.
  - `world.ts` `placeBeacons` (~:8044), `beaconsEnabled`, `beaconChart`, `captainPositions`.
  - `ArenaState.ts:87–136` flat slot triples + `ArenaRoom.syncBeacons` (~:1471).
  - `client/src/sim/beaconView.ts` `beaconViewsFrom`.
  - `client/src/render/beacons.ts` chart layer (`drawBeaconRing`, the charted dashed look).
  - Bot port `botPort.ts` `beaconRowsOf` / `BotWorldPort.beacons?()`.
  - `cueEdges.ts` surfaced edge.
- *Delete:*
  - `BeaconRecord` hp / pot / damage / inRange / body.
  - `collectTargets`, `collectBodies`, `sink`, `payout`, `smoke`.
  - `world.ts` `tickBeacons`, `payBeaconShare`, `ShipRecord.beaconXpMs`, `damageBeacon` (incl. the pinned `beacon.hp -= dealt` door, `damageGate.test.ts:698–711`), `creditBeaconDamage`, `sinkBeacon` (keep `payKillPot`: `payKillValue` uses it), `burnBeacons`.
  - `MINE_BLAST_HITS`' beacon entry and the mine-blast / shell-outcome / burst / boom-scrub beacon branches.
  - The `hitTargets` beacon arm (keep the hull → mine → ordnance order: burst and homing tie-breaks depend on it).
  - `damageBeaconPair` / `ramBeacon` (`damagePair`'s non-ship branch becomes a plain return).
  - `'beacon'` in `TargetKind` (`shared/src/sim/shell.ts:275`) and the three `HITS_*_BEACON` masks in constants.ts (≈13 weapon rows).
  - Client `BeaconBodies` / `isBeaconBodyId` / `contactBodies` `fixed` use, `beaconWorld` layer (`stage.ts`), water body + pulse, `contactFxColor` beacon branch.
  - `matchOverride.beacons` (`roomOptions.ts:277–286`).
  - `match.ts` `beaconXpMsByClass` / `beaconXpMs`, `matchRecord.ts` `beaconXpMs`.
  - Batch-sim `runner.ts` / `report.ts` / `botMetrics.ts` / `botReport.ts` / `botReadouts.ts` beacon columns.
  - Bot `ai/beacons.ts` (farm / standoff), `tactics.ts` beacon branches, `posture.ts` clause 5 + `staysOnBeacon`, `navigate.ts` `avoidBeacons`, `profiles.ts` `contestsBeacon`, `CONFIG.bots.beaconStandoffFrac`.
- *Surprises:*
  - Acoustic torpedoes treat a target without `loud` as loudness 1, so they effectively preferred beacons. Removing the kind removes this; nothing else changes.
  - `beaconFixture.ts` holds generic test helpers used by non-beacon tests (move them first).
  - `navigator.sendBeacon` / "beaconing" in `analytics/*`, `net/liveness.ts` and their tests is unrelated and **stays**.
  - Today's airdrop keep-out already avoids charted beacon spots. After this story, crates from both sources may share water (fine).
- *Tests:*
  - Delete or rewrite `shared beacons.test.ts`, `server beacons.test.ts` (port the placement / `pickBeaconSpot` cases), `beaconDamage`, `botBeacons` (prune), `beaconRoom` (→ supply chart schema), `beaconPerception` (→ supply crates as ordinary crates), `client beacons.test.ts`, `beaconView.test.ts`.
  - Prune the beacon cases in `shell.test.ts`, `barrel.test.ts` masks, `flak`, `stepOrder`, `botArcs`, `botPosture`, `botDrops`, `botTactics`, `bots.test.ts` port keys, `dispersion`, `drops`, `matchRecord`, `devPose`, `rangeBands`, `nameplatesAboveTerrain` (layer order).

### Must preserve

- The six perception exceptions; supply crates and wrecks are ordinary crate rows. The chart is schema-only, public by Eric's ruling (it always was for beacons).
- `drawRng` (the offer stream) is never touched by the roll, the wreck picks or the scatter.
- Integer-ms XP: 0.1 × 60,000 = 6,000 exactly. Every level crossing banks and rolls.
- The minute crate schedule and the storm sweep.
- Bots: no `world.js` import; their world is the observe thunk + the port.
- Golden frames re-recorded with dated notes, never silently.

### Architecture compliance

- Sim in `shared` (pure, deterministic, zero I/O). Every number in `CONFIG` (`drops.xpLevels`, `xp.statRoll`, `supplyDrops.*`). Client feel knobs (flash hold / fade, mark fade, glyph proportions) in `CLIENT_CONFIG`.
- The roll and the wreck picks re-fold only through `effectiveStats()`.
- New STEP_ORDER rows are deliberate and pinned.
- ESLint complexity ≤ 10 is an error. `world.ts` and `main.ts` are huge: put supply-drop logic in its own server module (e.g. `game/supplyDrops.ts` from `beacons.ts`) and keep World calls thin.

### Testing (Eric's pyramid, functional style)

- **Unit:** the die and the level roll; the wreck pick count; the scatter (count, radius, spacing, land, determinism); the chart lifecycle (charted → landed); the flash blend + rise detector; the +XP glyph is drawn (structure, not pixels).
- **Integration:** World XP crate grant, rolls per level, exhausted / sinking / opening cases, wreck level count, supply landing places `crates` per spot; perception: supply crates delivered like minute crates; schema sync of the chart.
- **No intent tests:** never pin 0.1, the faces, 10 or 500 as literals; test that the mechanism follows CONFIG. No word-police on How-to-Play.
- Smokes e2e as in T9.

### Previous story intelligence (12.3, 10.8, 10.9, 11.7)

- 12.3 (ready-for-dev, built first) rewrites the HUD into one vertical bar. Check `git log` for its merge before T5 and place the flash accordingly.
- 10.9 airdrops: bot pickup is in `ai/drops.ts` on sighted crates only (`PerceptionView.drops`). The bot port is the only legal way for a bot to know a charted spot.
- 11.7 placement: the 0.5 spacing fraction was measured to never skip a cycle-0 spot in 400 cycles. Keep `pickBeaconSpot`'s numbers untouched.
- Full-match tick cost before merge (memory, PR #340 broke staging): 70 extra crates per cycle on the water need a `tickCost.mjs` old vs new.

### References

- Rulings: epic-12 amendment 5 (`_bmad-output/implementation-artifacts/epic-12-context-amendments.md`).
- Superseded: epic-10 amendments 13 (R5, R7 kept), 14 (radio beacons), 18 (airdrop rolls); epic-11 amendment 15 (beacon random placement: its placement law is kept for supply drops).
- Airdrops: `spec-10-9-*.md`; beacons: `spec-10-8-the-radio-beacons.md`, `spec-11-7-beacon-random-placement.md`; offer composition: `spec-10-7-offer-composition.md`.
- HUD: `12-3-the-in-game-ui-pass.md`, epic-12 amendments 3–4; DESIGN.md (`_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md`).
- GDD: `_bmad-output/planning-artifacts/gdds/gdd-Hullcracker.io-2026-07-16/gdd.md` (Economy and Resources).

### Project Context Rules (from `_bmad-output/project-context.md` + CLAUDE.md)

- Branch from `development`; PR to `development`; ONE PR at the end; commit and push continuously; never merge unasked.
- No PR opens while a rendered candidate waits on Eric's yes (T7).
- Amendment / cycle / version / PV numbers taken at PR time after `git fetch`; `epic-N-context-amendments.md` is append-only.
- `PROTOCOL_VERSION` bumps on the wire and client-read CONFIG changes.
- Perception chokepoint: every spatial thing leaving the server goes through `perception.observe()` via `signals.ts`. No seventh exception.
- Subagents never `git rm` (plain `rm`); mute every test browser; bound every test run; never edit CLAUDE.md.
- Fresh worktree: `npm install --include=dev && npm run build -w shared` before any gate run.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed: comprehensive developer guide created (sitting 2026-11-19, epic-12 amendment 5).

### File List
