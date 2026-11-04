---
baseline_commit: a2dd70b4
---
# Story 10.3: The Index Model

Status: review

<!-- Created 2026-11-04 by gds-create-story on development @ a2dd70b4 (0.19.4, PV 94, the Epic 10 renumbering merge). Every line number below is a reading of the tree on that commit — re-grep before editing. Eric answered the spec-step questions by AskUserQuestion in this session BEFORE this file was written (four rounds of four, plus ruling 15 in chat after the first read-back); the answers are § Eric's rulings and become epic-10 amendment #7 at the dev step. Nothing in this story is a number the author filled in; every implementer reading is labelled as one and Eric may veto it on staging. -->

## Story

As a captain reading my ship,
I want every hull to show 0–100 % and every stat to be a plain number around 100,
so that I can read toughness, punch and speed on one ruler without ever doing arithmetic.

**The floor story of the beacons / battleships / index slice** (`sprint-change-proposal-2026-11-04.md`, epic-10 amendment 6(c); brainstorm 2026-11-03 #4, #40–#45, #67; forge premise 3). It is built FIRST in the re-cut: 10.3 → 10.4 → 10.5 → 10.6 → 10.7 → 10.8 → 10.9 → 10.10 → 10.11 → 10.12 → 10.13 → 10.14. Release posture ONE UNIT: this story is its own PR and cycle on `development` (cycle 211, 0.19.5, PV 94 → 95); production stays on 0.19.4 until the whole slice has had its staging pass.

**Standing locks restated (amendment 6(c), forge):** every ship has **1000 HP shown as a whole-number 0–100 %** — nobody ever sees a raw figure out of 1000, theirs or anyone's, no effective-HP / hits-to-sink readout; **every stat is an index around 100** — ARMOR, POWER (the attacker-side number), RELOAD, ENGINES, RUDDER (new — turn rate; ENGINES does not include it), INTEL (= radar sweep speed, 100 = 15 RPM, 200 = 30 RPM, linear), RANGE (IS an index, #67); **100 = the average ship = Bismarck** (#43), a real ship is a set of offsets; **equal main-gun DPS across hulls** (#41; the heavy slow hit = high POWER + low RELOAD, never more DPS) — the per-hull table is 10.4's; **toughness = ARMOR, never HP**; effective HP is the hidden truth; **HULL POINTS dies, passive healing dies** (regen AND the ladder; HULL REPAIR becomes the one heal at 10.5), **RELOAD becomes a multiplicative law**, **ramming mass = ARMOR**, the 9.5 energy law keeps its shape; the 9.9 gate nets victim ARMOR − attacker POWER so an average pair sits at today's base and a +20 card stays a 17 % step. Today's three classes are SCAFFOLDED onto the index until 10.4.

## Eric's rulings (2026-11-04, AskUserQuestion at the spec step — the amendment's text)

1. **The damage table is re-thought, not rescaled** — *"We need to rethink it all, so we'll go through everything and feel it out."* Each weapon was then ruled in turn (rulings 5–9 below); the deck guns, BROADSIDE, SHIELD BLOCK and the PvE drones, which 10.4 / 10.5 / 10.8 retire or table, get **×3 placeholders** (ruling 10) — *"It doesn't matter this is all getting changed."*
2. **Ramming keeps today's outcomes as a percent of hull** (recommended option): mass becomes the ARMOR index; `CONFIG.ram.energyPerHp` 1265.625 → **126.5625** (÷10), `grindPerUnit` 2/9 → **20/27**, `allowanceU` 5 and `landSoftness` 0.25 unchanged. A full-speed speedboat head-on still costs each hull ~80 % (240 of 300 today → ~800 of 1000); land strikes and grind keep their fractions. The harness re-tunes later (`--tune ram.*`). Rejected: keep the dials (a head-on becomes ~7 % of hull); new dials now.
3. **The scaffold's 100 is the battleship (DREADNOUGHT), and the 300 / 350 hull gap is DROPPED** (recommended option): `battleship` is 100 on every index EXCEPT ENGINES (re-ruled in ruling 15) — RUDDER 100 = 0.4 rad/s, INTEL 100 = 15 RPM, RANGE 100 = today's gun reach; `torpedoBoat` RUDDER 200, `mineLayer` RUDDER 150; ARMOR, POWER, RELOAD, RANGE 100 for all three. Accel / decel / reverse / steerage stay per-class kinematics. Rejected: the gap kept as ARMOR 86 on the two lighter hulls; the mean of the three as 100.
4. **The six ship ladders become the +20 flat index cards NOW, renamed** (recommended option): ARMOR (+20), **POWER** (was ARMOR PIERCING, +20), RELOAD (+20 index), **ENGINES** (was SPEED +2.5 u/s, now +20), **RUDDER** (was TURNING +0.05 rad/s, now +20), **INTEL** (was RADAR SWEEP +3 RPM — already exactly +20), each cap 5; **HULL POINTS and PASSIVE HEALING are DELETED** from the catalog. 10.6 then only re-cuts kinds and slots. Rejected: today's magnitudes expressed as index deltas until 10.6.
5. **Torpedoes:** LIGHT **200 → 400**, HEAVY **300 → 600**, SUPERCAVITATING **400 → 800** over their tiers — i.e. +50 / +75 / +100 per rung across the four steps of an equipment line (Tier I → V). Supersedes the 9.12 numbers (80 → 120, 90 → 135, 150).
6. **Mines:** NAVAL **200 → 300** (+25 a rung), CAPTIVE **100 → 200** (+25), FOULING **100 → 200** (+25 — the fouling mine's damage was FIXED at 10 with no step; it now has one). Mine body hp 10 and buoy hp 50 stand (they are not hulls).
7. **HULL REPAIR heals 100 + 100** (100 instant + 100 pooled over 5 s; was 50 + 50), **and HULL REPAIR and SMOKE get TIERED UPGRADES**: HULL REPAIR grows **100+100 → 200+200 at +20+20 per rung** (five rungs); **a SMOKE rung grows life, size AND cooldown** (step sizes Eric's at 10.6). Rejected: 150 + 150; 200 + 200 base.
8. **The new tier tracks are RECORDED now and BUILT at 10.5 / 10.6** (recommended option): this story sets the bases (HULL REPAIR 100 + 100, SUPERCAV 400) and the amendment carries the ladders as rulings; 10.5 makes HULL REPAIR / SMOKE cooldown abilities and 10.6 deals their tier-up cards and the SUPERCAV torpedo track. Nothing is built twice. Rejected: build the tracks in 10.3 on the stock-per-copy lines.
9. **Special shells:** STAR SHELLS **50 → 100** (steps +12 / +13 / +12 / +13 `[reading of the split]`), PHOSPHOR **50 burst + 20/s burn → 100 + 40/s** (burst +12 / +13 / +12 / +13, burn +5 ×4 `[reading of the split]`). Shells are light chip damage; the lighting and the burn zone are the point. Rejected: 100 → 200 / 100 + 30 → 200 + 60; ×3 placeholders.
10. **×3 placeholders across the board for what retires** (recommended option): CANNON 8 → **24** per shell (tier steps ×3: +6 / +3 / +3 / +3 → 39 at V `[reading]`), MACHINE GUN 5 → **15**, FLAK 16 → **48** (flak steps +2 → +6; `contactDamage` 4 → 12; gun `contactDamage` 6 → 18), BROADSIDE 15 → **45**, SHIELD BLOCK 100 → **300**, PvE drone hulls 45 / 60 / 75 → **135 / 180 / 225** with a **3**-damage gun. Recorded as scaffold, never a ruling. Rejected: drones unchanged.
11. **POWER works in the GATE ONLY** (recommended option for 10.3): POWER replaces ARMOR PIERCING one-for-one — E = victim ARMOR (+ HUNKER bonus) − attacker POWER, through the 9.9 two-branch curve with K = 100; per-hit damage is the weapon's number. A +20 POWER card = ~+17 % against an average hull, exactly today's +20 piercing. The per-hull equal-DPS tuning (POWER × RELOAD ≈ 10,000) is 10.4's table. Rejected: gate AND per-hit damage (×1.4 per card); per-hit damage only.
12. **Storm: 10 / 20 / 30 / 40 / 50 hp per second by ring** (1–5 %/s; was 1 / 2 / 3 / 4 / 5). 100 s to sink in the first ring, 20 s in the last. Rejected: 5 / 10 / 15 / 20 / 25; ×3.
13. **Percent is the CEILING — an afloat hull never reads 0 %** (recommended option): 7 hp shows 1 %, 995 shows 100 %; 0 % means sunk. Rejected: nearest; floor.
14. **RELOAD is the "standard ability haste" formula** — Eric verbatim: *"Final Cooldown = Base Cooldown / (1 + ((RELOAD − INDEX)/K), where INDEX and K are both 100."* (Algebraically `base × 100 / RELOAD`: 120 = ×0.833, 200 = half.) Applied to every row exactly as `cooldownScale` is today; the gun tier −5 % steps unchanged. **Radar sweep = 15 RPM × INTEL / 100; INTEL 200 = 30 RPM** (today's `sweepRpmMax`, reached at five cards) — confirmed. RUDDER and RANGE take the same shape (turn rate, reach × index / 100 on the battleship's base); ENGINES has its own base — ruling 15.
15. **ENGINES: top speed = 30 u/s × ENGINES / 100** — Eric 2026-11-04, later in chat, overriding the 35 u/s battleship base the author had read into ruling 3: *"Top speed = 30 u/s * (ENGINES / 100), lets set numbers based on that. While we are not working on the new ships in this story, even the Iowa is slower than the current Battleship in this game at its top speed, and that's the fastest ship that will be coming in to the game. 30 makes a more sensible baseline."* The scaffold keeps today's three top speeds on that base `[reading — Eric: "lets set numbers based on that"]`: `torpedoBoat` ENGINES **150** (45 u/s), `battleship` **117** (35.1 u/s), `mineLayer` **133** (39.9 u/s). A +20 card is +6 u/s. The brainstorm sketch's "100 Engines = 30 kn" is the same baseline. **The law is linear and stays linear** (Eric, same conversation, withdrawing a 1.5× idea the moment he raised it): *"+100 will be +100% more distance covered per minute. Speed upgrades will simply scale slower on the card, which we'll address later."* — so the ENGINES card's step will be SMALLER than +20 at 10.6 (Eric's number then); for 10.3 the +20 of ruling 4 stands as scaffold and the cap consequence below is recorded, not softened.

## Acceptance Criteria

1. **Given** `CONFIG.shipClasses` (three hulls at 300 / 350 / 300 hp), `effectiveStats()` as the one fold, the HULL POINTS and PASSIVE HEALING ladders, the regen tick and the 9.5 ramming law reading mass from `effectiveStats().maxHp` — **when** the index model lands — **then** every hull's `maxHp` is **1000** and every derived stat is an index (ARMOR, POWER, RELOAD, ENGINES, RUDDER, INTEL, RANGE) folded ONCE in `effectiveStats()` from (hull offsets + fitted cards) — the only place a stat is derived, both sides (FR41, NFR20). (Airdrops add to the same fold at 10.9.)
2. **Then** every weapon's damage is **Eric's ruled share of 1000** (rulings 5–10, 12): torpedoes 200 / 300 / 400, mines 200 / 100 / 100 with their rungs, star 50, phosphor 50 + 20/s, storm 10–50/s, HULL REPAIR 100 + 100, the ×3 placeholders for the retiring deck guns / BROADSIDE / SHIELD / drones; the main-gun law (equal DPS) is NOT a per-hull table yet — the three scaffold hulls share POWER 100 / RELOAD 100 and one gun; RELOAD is the haste law (ruling 14); INTEL sets the sweep RPM linearly from 15 at 100; RUDDER sets turn rate and ENGINES does not; RANGE scales the main-gun reach.
3. **Then** POWER replaces ARMOR PIERCING in the gate (ruling 11): E = victim ARMOR + HUNKER bonus − attacker POWER, K = 100, the two-branch curve unchanged; an average pair (100 vs 100) multiplies by exactly 1; HUNKER's +100 is still ×0.5 against POWER 100.
4. **Then** the HULL POINTS ladder, the PASSIVE HEALING ladder and the out-of-combat regen are REMOVED from the sim and the catalog deal (dated notes in `catalog.ts`, the `LINE_IDS` doc and the header count); `CONFIG.regen` is deleted; the HULL REPAIR pool (`CONFIG.hullRepair`) and the healing buoy's `missingPctPerS` term keep healing through the one tick; `lastDamagedAt` stays (the wounded-smoke / sting / bot reads).
5. **Then** the ramming law reads **ARMOR as mass** with Eric's calibration (ruling 2): `contactHitDamage` / `contactGrindRate` / `landHitDamage` and the separation split take `stats.armor` on the server, the client predictor's `setOwnMass` and `contactBodies` take the ARMOR base, the bot ram estimate too; the pinned outcome tests re-base to the same fractions of hull.
6. **Then** the four surviving ship ladders are renamed and all six are +20 index cards (ruling 4): line ids `armor`, `power`, `reload`, `engines`, `rudder`, `intel`; `hullPoints` / `passiveHealing` leave `LINE_IDS` (30 → 28) with dated notes; every mirror of the list (client names / rows / glyphs / loadout block / fit check, bot `UpgradeId` + profile favorites, the harness `universal` list, the How-to-Play ship-upgrade entries) follows; a stale id fails closed like any unknown id.
7. **Then** the HP globe, the SHIP tooltip, the refit card rows, the results LOADOUT, the class-select cards and the How-to-Play derived tables show **whole-number percent and indices only** — no raw hp anywhere on the client (ruling 13 for the percent); `OwnShip.hp` stays 0–1000 on the wire and the client formats it; the shielded readout prints hull + shield as a percent past 100 in `{colors.info}` (amendment 116's rule in percent `[reading]`); the HUD rows (globe readout, SHIP tooltip's seven index rows, class-card stat rows, refit card index rows) are a **RENDERED candidate shown to Eric before commit**.
8. **Then** today's three classes are expressed as index offsets as the SCAFFOLD of ruling 3 so the game plays until 10.4; bots sail unchanged through the fold (every bot read of `maxHp`, `hp` fractions, class hp and the ladder ids follows); the harness reports in percent and index (`balanceProbe` `statsBlock` prints the seven indices and the derived speed / RPM / cooldown / reach beside them).
9. **Then** `PROTOCOL_VERSION` 94 → **95** with a history note (the client reads the stat block, the catalog content changed, line ids renamed); `npm run check` green; matchSmoke and weaponsSmoke pass FIRST-TRY (their kill plans drop the regen term); the GDD "Flat damage model" / "Ship classes" sentences, catalog-v3 and the How-to-Play COPY are stamped at 10.14, not here; DESIGN.md rows this story changes (hp-globe readout, slot tooltip SHIP panel, class-card pips, refit-card rows, loadout-block ladders) carry a dated stamp in this PR `[reading — the 10.4 AC's "DESIGN.md is read first and the changed rows are stamped" applied here]`.

## Tasks / Subtasks

- [x] **Task 1 — shared: the index stats and the fold** (AC 1, 2, 3, 6)
  - [x] `CONFIG.shipClasses`: every `hp` → 1000 (keep the field — the fold seeds `maxHp` from it); add per-class index offsets `{ armor, power, reload, engines, rudder, intel, range }` (battleship 100 everywhere but ENGINES 117; torpedoBoat engines 150 / rudder 200; mineLayer engines 133 / rudder 150; `[reading]` whole-number indices — the battleship's top speed drifts 35 → 35.1 u/s and the mine-layer's 40 → 39.9; Eric may prefer exact fractions); add the reference bases the indices scale: `CONFIG.index = { base: 100, k: 100, engines: 30 (u/s — ruling 15), rudder: 0.4 (rad/s), intel: 15 (RPM) }` `[reading — names]`; `maxSpeed` / `turnRate` leave the per-class kinematics table (derived) while accel / decel / reverse / steerage stay.
  - [x] `EffectiveStats`: replace `armorPiercing` with `power`; add `reload`, `engines`, `rudder`, `intel`, `range` (indices); keep `armor` (now seeded at the class offset, not 0), `maxHp`, `sweepRpm`, `cooldownScale`, `kinematics` as DERIVED fields re-pinned in BOTH `rePinDerived` (`boons.ts:174-204`) and `clampStats` (`stats.ts:798-842`): `kinematics.maxSpeed = 30 × engines/100` (ruling 15), `kinematics.turnRate = index.rudder × rudder/100`, `sweepRpm = 15 × intel/100` (clamped to `sweepRpmMax`), `cooldownScale = 1 / (1 + (reload − 100)/100)` (ruling 14; floor the index at 1 so the law stays finite `[reading]`), main-battery `rangeU = base × range/100` for the gun / machineGun / flak / broadside rows `[reading: "the main-gun reach" = the deck-gun rows; star / phosphor / fouling / flash reach unchanged]`; delete `regen` from the type.
  - [x] `damageMultiplierFor` unchanged; `armorDamage` (`world.ts:6019-6025`) computes `E = victim.stats.armor + hunkerBonus − this.powerOf(byId)`; `piercingOf` → `powerOf` reading `stats.power`, default **100** for a missing attacker (the coast, a wreck, a departed owner — today's "reads piercing 0" becomes "reads the average POWER" so the storm-exempt / coast / wreck cases still net to E = victim ARMOR − 100 `[reading — Eric may veto: alternative is POWER 0, which would make a coast strike ×0.5 against ARMOR 100]`).
  - [x] Stat-path whitelist (`effects.ts:192-220`): add `power`, `reload`, `engines`, `rudder`, `intel`, `range`; remove `armorPiercing`, `regen.*`; keep `maxHp` writable `[reading — no card writes it after this story; the SHIELD buoy's pool is a separate field]`; `kinematics.maxSpeed` / `turnRate` / `sweepRpm` / `cooldownScale` leave the whitelist (derived, never authored) `[reading]`.
  - [x] Catalog (`catalog.ts`): delete `hullPoints` (seat 1) and `passiveHealing` (seat 8) with dated notes in place, the header count 30/… → 28/…, the `LINE_IDS` doc entry; rename `armorPiercing → power`, `speed → engines`, `turning → rudder`, `radarSweep → intel` (ids AND `LINE_IDS` seats; same seats, same kind, same cap — the `foulingMines` precedent); each is `ladder(id, 5, [statEffect(id, { add: 20 })])`; `healOnGrant` validation loses its only user (keep the flag's validator or delete it with a note `[reading]`).
  - [x] Weapon numbers in `CONFIG` + catalog steps (rulings 5–10, 12): `torpedo.damage` 90 → 300 with `torpedoTier('heavyTorpedo', 75, …)`; `lightTorpedo` 80 → 200, step 50; `supercavTorpedo` 150 → 400 (consumable, no step); `navalMines` 90 → 200, `navalMineTier(25)`; `captiveMines` 90 → 100, `captiveMineTier(25, …)`; `foulingMines` 10 → 100 with a new `statEffect('equipment.foulingMines.damage', { add: 25 })` per rung; `starShells` 20 → 50, steps 12/13/12/13; `phosphorShells` 10 → 50 burst steps 12/13/12/13, `dps` 5 → 20 steps +5 ×4; `zone.stormDps` [1,2,3,4,5] → [10,20,30,40,50]; `hullRepair` 50/50 → 100/100 (`regenMs` 5000 stays); placeholders: gun 8 → 24 (deckGun steps +6/+3/+3/+3, `contactDamage` 6 → 18), machineGun 5 → 15, flak 16 → 48 (`flakDamage` step +6, `contactDamage` 12), broadside 15 → 45, `shieldBlock.hp` 100 → 300, drones hp 135/180/225 gun damage 3. Update the doc comments that quote the old numbers.
  - [x] `CONFIG.ram`: `energyPerHp` 126.5625, `grindPerUnit` 20/27; rewrite the calibration prose (`constants.ts:2177-2225`) for mass = ARMOR index.
  - [x] `PROTOCOL_VERSION` 94 → 95 + the history line at the top of `shared/src/index.ts`.
  - [x] Tests (red first): `shipClasses.test.ts` relations → every hull 1000, ENGINES tb > ml > bb, RUDDER tb > ml > bb, battleship 100 on every index; `stats.test.ts` the derivations (speed = base × engines/100, RPM = 15 × intel/100, cooldown = base/(1 + (reload−100)/100), E = armor − power, mass law fractions); `catalog.test.ts` 28 lines, the six +20 ladders, the rungs of rulings 5–9 as RELATIONS to the base (never literals); `contact.test.ts` outcomes as fractions of 1000 at mass 100; `boons` / `barrel` / `draw` whitelist pins.
- [x] **Task 2 — server: the tick, the gate, the mass, the bots, the harness** (AC 3, 4, 5, 8)
  - [x] `world.ts`: delete `regenDue` / the regen branch of `healPctPerS` (`:5166-5185`); `tickRepairs` keeps the HULL REPAIR pool and the healing buoy term through `tickRegen` (rename it `tickHeal` `[reading]`); `baseStats` seeds no regen; remove the `regen.` tune surface (`batchsim/overrides.ts:132-145`).
  - [x] Mass: `damagePair` (`:4877-4904`), `landHitDamage` (`:4946`), the collision body `mass` (`:4814/4817`) read `stats.armor`; HUNKER's temporary +100 adds NO mass `[reading — amendment 88's "ARMOR adds no mass" inverted: the INDEX is the mass, the Shift bonus is not]`.
  - [x] Gate: `powerOf(byId)` per Task 1; `applyDamage` otherwise untouched (friendly fire, gate order, floors, `lastDamagedAt` stamp all stand).
  - [x] Bots (`ai/`): `UpgradeId` union + `favoriteUpgrades` renamed (`hullPoints` → drop, `passiveHealing` → drop, `armorPiercing` → `power`, `speed` → `engines`, `turning` → `rudder`, `radarSweep` → `intel`; the bulwark's `['hullPoints','passiveHealing','armor']` → `['armor']` + the 8-20 rule `[reading]`); `posture.ts:492-493` ram estimate reads the ARMOR base; `peerFactor` (`:295-296`) is 1 for every pair now — leave the code, it is still the right relation; `plot.ts:57` `TRACK_PERSIST_MS` from `CONFIG.index.intel` RPM (moot: INTEL's base stays CONFIG.vision.sweepRpm, R-A); `shift.ts` / `tactics.ts` class literals unchanged.
  - [x] Harness: `balanceProbe.ts:190-222` `statsBlock` prints `class | armor power reload engines rudder intel range | speed rpm cooldown gunRange | dmgMult pierceMult` (indices + derived), the `universal` list = the six ids; `--tune shipClasses.<cls>.<index>` works; `catalogReport` / `report` hp readouts become percent of 1000 where they print a figure.
  - [x] Smokes: `matchSmoke.mjs` / `weaponsSmoke.mjs` kill plans drop the regen term (`TARGET.regen` is gone); FISH_BLOW etc. still derive from the fold — both must pass FIRST-TRY before the PR.
  - [x] Tests (red first): `regen.test.ts` → deleted with a dated note in `damageGate.test.ts` (which keeps "tickRepairs stays UN-gated" for the pool); `contactDamage.test.ts` / `botPolicy.test.ts` outcomes as fractions; `damageGate` E = armor − power incl. the missing-attacker default; `goldenFrames` re-recorded ONCE with a header note (offer rows move with the line list — positions and hp change, no event or channel).
- [x] **Task 3 — client: percent and index everywhere** (AC 7, 8)
  - [x] `hpGlobe.ts`: `hullShownValue` → `hullPercent(hp, maxHp) = hp <= 0 ? 0 : max(1, ceil(100 × hp / maxHp))` (ruling 13); readout prints `HULL 72 %` `[reading — the glyph `%` and its type size are the rendered candidate's]`; `hullMaxLabel` / `hullHeaderValue` deleted; shielded readout = `ceil(100 × (hp + shield) / maxHp)` past 100 in `C.info`.
  - [x] `boonCopy.ts`: `LINE_NAMES` = `ARMOR · POWER · RELOAD · ENGINES · RUDDER · INTEL · RANGE` `[reading — RANGE has no card yet but is a SHIP row]`; `STAT_LINES` print bare indices (`ARMOR 100 → 120`); `SHIP_STAT_LINES` = the seven indices in amendment 6(c)'s order (MAX HULL and HEAL rows gone — 1000 is never printed); HULL REPAIR rows print `+100 HP` → percent `+10 %` / `+10 % / 5 S` `[reading]`; SHIELD BLOCK `ABSORBS 30 %` `[reading]`; buoy `HULL 50 HP` → the buoy is not a hull, keep `[reading]`; `UNPRINTED_PATHS` loses `regen.outOfCombatMs`.
  - [x] `classSelect.ts`: the three pip rows (SPEED / HULL / TURNING) → `ENGINES / ARMOR / RUDDER` `[reading]` on index anchors (`CLIENT_CONFIG.home.pip` re-based: `{ base: 100, step: 20 }` per row `[reading]` — all three hulls read ARMOR equal, which is the truth of the scaffold); the label column stays 88 px / 0.16 em (the 2026-08-21 width ruling); this row set is part of the rendered candidate.
  - [x] `loadoutBlock.ts`: the ladder line = the six ship ladders `ARMOR · POWER · RELOAD` over `ENGINES · RUDDER · INTEL` (3 + 3 `[reading — amendment 99's two rows of three return]`); `equipmentIcons.ts` glyphs renamed with the ids, `hullPoints` / `passiveHealing` glyphs deleted; `fitCheck` shipwide list.
  - [x] `weaponTables.ts` / How-to-Play: `shipUpgradeTable` prints indices; the `[ SHIP UPGRADES ]` entries re-key to the surviving ids (the `hullPoints` entry has no line — it goes; `AWAITING_COPY` covers the rest); the regen sentence (`copy.ts:92`) and the HULL REPAIR sentence are FROZEN COPY — 10.14's, not touched `[reading — the 9.6 amendment-96 precedent]`.
  - [x] Prediction / bodies: `setOwnMass(stats.armor)`, `contactBodies.ts:77` mass = the contact class's ARMOR base; `prediction.ts` kinematics read the folded `kinematics` (unchanged path).
  - [x] Feel knobs that were absolute hp: `shake.ts` `DMG_SUBTLE` 15 → 45, `DMG_HEAVY` 55 → 165; `contactFx.bleedThudMaxHp` 8 → 24; `roomBindings.ts` `BURN_AMOUNT_CAP` derives from the catalog (follows); `worstCaseScene.ts` reads `CONFIG.shipClasses[...].hp` (follows).
  - [x] **Rendered candidate** (the 10.1 / 10.2 precedent): one artifact page from the real modules (`hpGlobe` readout at 104 px, SHIP tooltip with the seven rows, a class card with the three index pip rows, a refit card `ARMOR 100 → 120`, the LOADOUT 3 + 3 line) — Eric's yes BEFORE the client commit.
  - [x] Tests (red first): `hpGlobe.test.ts` percent relation (ceil, 1 % floor afloat, 0 % sunk, shield past 100); `boonCopy` / `cardStatRows` / `weaponTables` / `classSelect` / `results` / `fitCheck` / `loadoutBlock` on the new ids and the index rows (structure, never copy); `boonStats.test.ts` `maxHp` grows-by-hullPoints case deleted.
- [x] **Task 4 — records** (AC 9)
  - [x] `epic-10-context-amendments.md` #7 = § Eric's rulings verbatim + implementer readings of record (the `[reading]` tags above, resolved); `spec-10-3-the-index-model.md` (the per-cycle record); `deferred-work.md` stamps: the regen-sentence entry (:2450) and the hp-band sting regen note (:941) MOOT (no regen), the 9.5 review-gate defers re-read for mass = ARMOR; both trackers ONE-LINE stamped; `VERSION` + root `package.json` 0.19.5; DESIGN.md dated stamps on the five rows of AC 9; the ×3 placeholders listed in the spec as scaffold.

## Dev Notes

### Scope, in one line

Replace the stat model under the game without changing how it plays: 1000 HP shown as a percent, seven indices folded once, six +20 ship cards, Eric's new damage table, no regen, ARMOR as mass — on today's three hulls and today's one deck gun, so 10.4 can swap hulls and turrets onto a finished floor.

### How the code differs from the story text (read first)

- **Class ids are `torpedoBoat` / `battleship` / `mineLayer`** (`constants.ts:140-182`); SPEEDBOAT / DREADNOUGHT / REPEATER are display names only (`client/src/ui/classNames.ts:15-17`). The AC's "three hulls at 300 / 350 / 300" is tb / bb / ml.
- **`CONFIG.upgrades` does not exist** (deleted in Story 2.8). Every ladder is authored in `shared/src/sim/catalog.ts:553-788` as `statEffect(path, { add | mult })` on a dotted `EffectiveStats` path; `validateCatalog` forbids `add` and `mult` on one path across lines.
- **No RANGE, INTEL or RUDDER line exists today.** The radar ladder is RADAR SWEEP (`sweepRpm +3`), the turn ladder is TURNING (`kinematics.turnRate +0.05`); gun reach is per-weapon `rangeU → rangeUAtV` tier steps (`catalog.ts:357-367`), no universal RANGE card writes it. RANGE is a SHIP stat with no card after this story (10.6 may deal one).
- **RELOAD is already one multiplicative scalar** (`cooldownScale`, folded additively −0.05 per card, then multiplied once into every row at `stats.ts:832-841`: `reloadMs = base × reloadTierScale(tier) × cd`). Ruling 14 changes the authored stat (a +20 index) and the derivation `cd = 1 / (1 + (reload − 100)/100)`; the multiply site is unchanged.
- **"9.5" / "9.9" are stories, not constants.** The ramming law is `shared/src/sim/contact.ts:258-298` + `CONFIG.ram` (`constants.ts:2177-2225`); the armor gate is `World.armorDamage` (`world.ts:6019-6025`) over `damageMultiplierFor` (`stats.ts:689-694`) with `CONFIG.armor.k` 100 (`:1874`).
- **`maxHp` never rides the wire** (`types.ts:430` `OwnShip.hp` only; contacts carry no hp — `types.ts:758`). The client derives `maxHp` from `effectiveStats(cls, cards)`. So "frames carry percent or 0–1000" is already true: keep `hp` 0–1000, format on the client.
- **The regen and the HULL REPAIR pool share one tick** (`world.ts:5143 tickRepairs` → `payRepair`, `healPctPerS`, `tickRegen`; the healing buoy adds its `missingPctPerS` term in `healPctPerS`). Remove ONLY the out-of-combat branch (`regenDue :5182-5185`); the buoy and the pool must keep healing.

### The fold is the whole story

`effectiveStats(cls, cards, catalog)` (`stats.ts:856-865`) = `baseStats(cls)` → `applyCardStats` (`boons.ts:213-229`, walks `LINE_IDS` order, `applyStatEffect` rejects a non-finite or ≤ 0 result) → `rePinDerived` → `clampStats`. The index model adds seven AUTHORED indices to `baseStats` (seeded from the class offsets) and makes `kinematics.maxSpeed`, `kinematics.turnRate`, `sweepRpm`, `cooldownScale` and the main-battery `rangeU` DERIVED, computed in both re-pin homes exactly as `damageMultiplier` and `sightRange` are today. Nothing outside the fold may compute speed from ENGINES or a cooldown from RELOAD — not the server tick, not `prediction.ts`, not the HUD, not a bot. `tickKinematics` (`world.ts:4630`) layers boost / slow / hooks over `stats.kinematics` — it reads the derived field and needs no change.

### The gate: one-for-one swap

`armorDamage`: `amount × damageMultiplierFor(victim.stats.armor + hunkerBonus − attackerPower)`; storm exempt, blows floored, burn / grind exact (amendments 87, 146–147 stand). Today `armor` seeds at 0 and `armorPiercing` at 0; after the story both seed at the class offset (100 / 100), so E is unchanged for every pair of today's hulls and HUNKER's +100 still halves. The default for a missing attacker is the `[reading]` in Task 1 — raise it with Eric if the coast-strike case looks wrong on staging.

### Mass = ARMOR

`contactHitDamage(mA, mB, vn, cfg)` = `floor(0.5 × (mA·mB/total) × vn² × (mB/total) / energyPerHp)`; grind = `grindPerUnit × (vt + vn) × mB/total`; land = `floor(0.5 × m × vn² / energyPerHp × landSoftness)`. With m = 100 and the ÷10 `energyPerHp`, the head-on, grind and land outcomes reproduce today's FRACTIONS of hull (ruling 2); between-class mass ratios collapse to 1 under the scaffold (all ARMOR 100) — intended, the design says mass is ARMOR. The client predictor (`prediction.ts:423 setOwnMass`, `main.ts:3162`) and `contactBodies.ts:77` must use the same mass or the push split desyncs. Amendment 84(j) stands: a contact's cards are private, so a contact's mass is its class ARMOR base.

### Where `hullPoints` / `passiveHealing` / the renamed ids are read today (counts at a2dd70b4)

- shared: `catalog.ts` (ids, `LINE_IDS` seats 1–8, header), `effects.ts` whitelist, `stats.ts` regen seed + `clampRegen`, `boons.ts` nothing id-specific.
- server: `ai/profiles.ts:95-102` (`UpgradeId`), `:263` + the raider / duelist / defensive favorites (amendments 97, 157); `world.ts:3685-3688` heal-on-grant (dies with the line); `batchsim/balanceProbe.ts:193` (throws on an unknown id); `batchsim/overrides.ts:132-145`.
- client: `boonCopy.ts:104-111, 350-373, 1238-1247`; `loadoutBlock.ts:102-125`; `equipmentIcons.ts:473, 529, 546, 555-562`; `how-to-play/copy.ts:163-171`; `fitCheck`; ~30 test files (list in the sweep: `roomBindings`, `radarWire`, `mulligan`, `goldenFrames` + snapshot, `botPolicy`, `matchRecord`, `weighting`, batchsim `poolReadouts` / `batchSim` / `gunFirstSpend`, client `boonStats` / `cardStatRows` / `boonCopy` / `fitCheck` / `howToPlay` / `weaponTables` / `results` / `hotbar` / `slotTooltip` / `refitFailOpen` / `lineGlyphs` / `score`).

### Surfaces that print a raw hp figure today (all go to percent or vanish)

- `hpGlobe.ts:87-118, 444-472` `HULL 212 /250` (+ shield past max).
- `boonCopy.ts` `MAX HULL` row (card face, SHIP tooltip `slotTooltip.ts:143-146`, card hover, How-to-Play `shipUpgradeTable` `weaponTables.ts:147-159`), `HEAL n %/S`, HULL REPAIR `INSTANT +n HP` / `OVER TIME +n HP / n S` (:984, :989), SHIELD `ABSORBS n HP` (:1024), buoy `HULL 50 HP` (:1038).
- `results.ts:96-99, 640-653` `DMG` column (hp dealt) — a tally of hp, not a hull readout; print it as before `[reading — it is not a hull figure; Eric may veto]`.
- Class-select pips are already numberless (`classSelect.ts:181-195`); the anchors (`config.ts:1236-1243`) are the only change.
- Enemy hulls never show hp (EXPERIENCE.md :237 "no enemy HP bars, ever"); the only on-water arc is the owner's own buoy (`decoys.ts:108-111`, out of `CONFIG.buoy.hp`) — unchanged.

### Scaffold arithmetic (rulings 3 and 15, for the tests' relations)

| class | hp | ARMOR | POWER | RELOAD | ENGINES (u/s) | RUDDER (rad/s) | INTEL (RPM) | RANGE |
|---|---|---|---|---|---|---|---|---|
| torpedoBoat | 1000 | 100 | 100 | 100 | 150 (45) | 200 (0.8) | 100 (15) | 100 |
| battleship | 1000 | 100 | 100 | 100 | 117 (35.1) | 100 (0.4) | 100 (15) | 100 |
| mineLayer | 1000 | 100 | 100 | 100 | 133 (39.9) | 150 (0.6) | 100 (15) | 100 |

ENGINES base is 30 u/s (ruling 15); every other index's base is the battleship's today.

Cap at five cards: ARMOR 200 (×0.5 vs POWER 100), POWER 200 (×1.5 vs ARMOR 100 — the negative branch), RELOAD 200 (half cooldowns), ENGINES +100 (= +30 u/s: battleship 65.1 u/s, speedboat 75 — the harness will say whether that is sane; today's SPEED cap was +12.5 u/s), RUDDER +100, INTEL 200 (30 RPM = `sweepRpmMax`). The ENGINES / RUDDER cap jump is the price of ruling 4's "+20 flat now" — record it in the spec for Eric's harness session, do not soften it.

### Testing standards (project-context Testing Rules, applied)

- Never pin 1000 / 100 / 20 / 126.5625 / 300 / 50 as literals in a test: read `CONFIG` and test the RELATION (speed = base × engines/100; cooldown × (1 + (reload−100)/100) = base; percent = ceil(100·hp/maxHp) with the afloat floor; E = armor − power; a card adds the catalog's step, whatever it is; a mine's Tier V damage = Tier I + 4 × step).
- No copy pins (`'ENGINES'`, `'HULL 72 %'`): row tests check structure (row count, which stat path each row formats via the module's own formatter).
- No coincidence pins (ARMOR 100 = POWER 100 is a scaffold fact, not a rule — amendment 213 / the coincidence-pin rule).
- Property / invariant tests: the perception invariants are untouched (nothing new rides the wire; the SIX exceptions stay six; `OwnShip.hp` is already self-private); `goldenFrames` re-recorded once with a header note.
- Red first: every new behavior gets its failing test before the code; every review-gate fix ships with a regression shown red first (10.1 / 10.2 precedent).
- Vitest 2.x shared/server, 4.x + jsdom client.

### Previous story intelligence

- **10.2 (amendments 4–5):** the rendered candidate was approved as-is before the client commit — do the same here, from the real modules (`hpGlobe`, `slotTooltip`, `classSelect`, `loadoutBlock`), the esbuild page recipe of 9.11. Effects that are per-tick (the buoy heal, the shield pool) live in the tick, NOT in `effectiveStats` — the healing buoy's `missingPctPerS` term stays in `healPctPerS`. `sightOf(ship, 0)` is the dazzled read — irrelevant here but do not touch the sight law.
- **10.1 (amendment 3):** `sanitizeKit` and the kit are generic over `ConsumableId`; the consumable lines (`hullRepair`, `shieldBlock`, `countermeasure`, `supercavTorpedo`, the buoys, `dazzleShells`, `foulingShell`, `depthCharge`) keep their ids and kinds — only their NUMBERS move here.
- **9.9 (amendments 156–161):** `armorPiercing` was built as a top-level stat floored ≥ 0 in `clampStats` with `World.piercingOf` reading the attacker LIVE at impact — POWER inherits the live read and the floor (now ≥ 1 `[reading]`); the negative branch is the single fraction `(K − 2E)/(K − E)` — keep it; the 9.9 rename landed as its own behavior-free commit (wave 0) — do the same for the six id renames + HULL POINTS / PASSIVE HEALING deletions BEFORE the behavior waves.
- **9.6 (amendments 90–101):** `regen` was seeded as a COPY of `CONFIG.regen` in `baseStats` and clamped in `clampRegen` — both go; `damageGate.test.ts` "tickRepairs stays UN-gated" guards the HULL REPAIR pool (keep); amendment 92's `lastDamagedAt` stamp stays (other readers).
- **9.5 (amendments 73–84):** the dials are the EXACT calibration (84a) — write `126.5625` and `20 / 27`, never the rounded prose; the hull pass runs before the land pass; bleed is a per-tick fraction through the one gate; the client's contact mass is the class base (84j).
- **9.14 / 9.16:** no px / hex / copy / ring pins; a red smoke is a regression.

### Git intelligence

Last code cycle: 10.2 whiteout (PR #312, 2026-11-03, cycle 210) — shared on Fable, server / client on Opus in parallel, rendered candidate approved first, Fable hunters ×2 + Codex at the gate. Patterns to copy: the behavior-free rename commit (9.9 wave 0, `aba14fe8`), the `goldenFrames` re-record with header note, `rePinDerived` + `clampStats` twin derivations (`damageMultiplier`, `sightRange`), the `--tune` whitelist rows in `batchsim/overrides.ts`.

### Project Context Rules (from `_bmad-output/project-context.md`)

- `shared` pure and deterministic: the fold is the only place an index becomes a speed / RPM / cooldown; no `Date.now()`; no `Math.random()`.
- Both sides run the same fold: `prediction.ts` reads the folded `kinematics` — never re-derive from ENGINES on the client.
- `effectiveStats()` is the ONLY legal path from (class + cards) to any derived stat — this story makes that literally true for speed, turn, sweep, cooldown and reach.
- `CONFIG` is the single source of truth: the index bases, K, the damage table and the ram dials live there; the percent glyph size is a `CLIENT_CONFIG` feel knob.
- `PROTOCOL_VERSION` 94 → 95 with a history note.
- Everything spatial leaves via `frames.ts` from `perception.observe()`; nothing here touches it; the SIX exceptions stay six.
- `world.ts` / `match.ts` zero Colyseus imports; `STEP_ORDER` unchanged (`tickRepairs` keeps its seat).
- Intent only via `inputs.ts` (unchanged).
- Bots never import `world.js`; a bot's hp reads stay fractions.
- Complexity ≤ 10 is an ERROR; ~500 LOC soft cap (`stats.ts` is already large — put the index derivations in a small `sim/index.ts` `[reading — file name]` and call it from both re-pin homes).
- Never pre-install a module; nothing new is needed.
- CLAUDE.md is frozen; rulings → `epic-10-context-amendments.md` #7.
- `/gds-dev-story` + `/orchestrate` per story (Eric's standing instruction); gate: Fable hunters ×2 + Codex `gpt-5.6-sol`.

### References

- Epic text: `_bmad-output/planning-artifacts/epics.md` § Story 10.3 (:2589-2606); `sprint-change-proposal-2026-11-04.md`; `epic-10-context-amendments.md` #6 (b)(3), (c), (f), (k).
- Design of record: `_bmad-output/brainstorming-session-2026-11-03.md` Thread 3 (:162-186) + #4, #64, #67; `_bmad-output/forge/beacons-battleships-index/forged-idea.md` premise 3 (:11), :30 (the ARMOR-card crack dissolved), :34 (paper-equal DPS).
- Rulings of record this story unwinds or re-bases: epic-9 amendments 28 (HULL POINTS +50), 73 / 84(a)(j) (ram dials, client mass), 86–88 (ARMOR ladder, HUNKER), 90–101 (PASSIVE HEALING, regen seed), 144–147 (K = 100, +20, the two-branch curve, every source), 156–161 (ARMOR PIERCING live read, surfaces, glyph), 209 (Speedboat 300 hp); epic-8 amendment 116 (shielded readout past max).
- Code: `shared/src/constants.ts` (:140-182 classes, :1874 armor, :2177-2225 ram, :2654-2714 hullRepair + regen, :2785 stormDps, weapon blocks :1234-2300); `shared/src/sim/stats.ts` (:299-327 type, :631-647 baseStats, :689-694 curve, :798-842 clampStats); `shared/src/sim/boons.ts` (:89-107, :174-204, :213-229); `shared/src/sim/catalog.ts` (:181-232 LINE_IDS, :553-788 CATALOG); `shared/src/sim/effects.ts` (:184-220); `shared/src/sim/contact.ts` (:227-298); `server/src/game/world.ts` (:4814-4946 mass, :5143-5220 tick, :5930-6039 gate); `server/scripts/batchsim/balanceProbe.ts` (:190-222); `client/src/render/hpGlobe.ts`; `client/src/ui/boonCopy.ts`; `client/src/ui/classSelect.ts` (:181-195); `client/src/config.ts` (:1236-1243).
- Design: `ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md` § Components — HP Globe (:303), Slot Tooltip (:301), Class Card (:316), Refit Card (:299), Loadout Block (:332); `EXPERIENCE.md` :87, :94, :138, :237.

## Dev Agent Record

### Agent Model Used

Orchestrator Claude Fable 5.1 (/gds-dev-story + /orchestrate); wave 0 Opus, wave 1 Fable, waves 2a/2b Opus, wave 3 Sonnet; gate Fable x2 + Codex gpt-5.6-sol

### Debug Log References

- `npm run check` EXIT 0 on 277b4ec2 (wave 2a head); the one-line gate fix 4336caff verified by shared tsc + `stats.test.ts` 109/109 + lint. Wave 0: shared 1216, server 2846, client 4180, hook 266, all green. Wave 1: shared tsc clean, 1245 tests, lint 0 errors (server/client red until wave 2). Wave 2a: server tsc clean, 2830 tests, eslint 0. Wave 2b: client tsc clean, 4181 tests, lint 0 errors. The gate test makes shared 1246.
- `matchSmoke` OK first-try (wall 82.8 s; plan: 3 heavy torpedoes of 450 sink 1000 hp, no regen). `weaponsSmoke` OK first-try (wall 187.5 s; torpedo 300/450, light 200/300, mine 200, captive 100, cannon 24, MG 15, flak 48 all landed).
- `goldenFrames` re-recorded twice with dated header notes: wave 0 (two offer rows move with the line list), wave 2a (hp 1000, dmg amounts, repairHp, one mine-pop event order). No new wire field; the SIX exceptions stay six.
- Gate red-first: the RANGE overflow regression test in `stats.test.ts` was shown red before 4336caff.

### Completion Notes List

- **Wave 0 (Opus, 7e9e9c8d):** behavior-free rename. Ladders `armorPiercing/speed/turning/radarSweep` become `power/engines/rudder/intel` (same seats, steps); HULL POINTS and PASSIVE HEALING deleted (30 -> 28 lines, 147 -> 137 cards), heal-on-grant gone; `piercingOf` -> `powerOf`; bots / harness / client / How-to-Play keys / tests follow; goldenFrames re-recorded.
- **Wave 1 (Fable, e6c458ac):** the shared fold. `CONFIG.index { base 100, engines 30, rudder 0.4 }`; every envelope carries `index` and loses `maxSpeed/turnRate`; every class hp 1000; `sim/indexStats.ts` derives speed, turn, sweep RPM and cooldownScale (haste law) idempotently in baseStats + rePinDerived + clampStats, plus the one-shot RANGE multiply on the four deck-gun rows; whitelist rewritten; six ladders +20; Eric's damage table; `CONFIG.regen` deleted; ram dials 126.5625 and 20/27; PV 94 -> 95.
- **Wave 2a (Opus, 277b4ec2):** server. Regen deleted (`tickRegen` -> `tickHeal`), mass = ARMOR in contact / damagePair / damageLand, `powerOf` live with `CONFIG.index.base` default, bots read the folded kinematics and the ARMOR ratio, harness `statsBlock` / `--tune shipClasses.<cls>.index.<id>`, regen tune family gone, smokes first-try, `regen.test.ts` deleted.
- **Wave 2b (Opus, 284a4e9a):** client. `util/hullPercent.ts` the one percent law (ceiling, afloat never 0), 10 px dim `%` glyph, SHIP panel of seven indices, bare-index card rows, class pips on `{ base 100, step 20 }`, loadout 3 + 3, `sim/hullKinematics.ts`, feel knobs x3. Rendered candidate approved by Eric as shown.
- **Dev-step rulings (amendment 8 o-r):** R16 candidate as shown, and a FULL in-game UI/UX pass is coming (SHIELD BLOCK going away); R17 drones KEEP ARMOR 100; R18 mine hp stays 10; R19 HULL REPAIR vs the last storm ring and the 225 hp drone vs a base naval mine both OK.
- **Readings of record (amendment 8 s, Eric may veto on staging):** R-A through R-K, notably: no `CONFIG.index.k` / `intel`; `maxSpeed/turnRate` derived in the fold; a missing attacker reads POWER 100; client contact mass = class-base ARMOR (84j); `publishedDamageMultiplier` reads against an average attacker; `lastDamagedAt` write-only.
- **Gate (Fable Blind Hunter, Fable Edge Case Hunter, Codex gpt-5.6-sol):** FIX-FIRST / BUILD-ON-IT / FIX-FIRST. All three flagged the client peer-mass seam (pre-existing in kind, recorded to deferred-work); Codex alone found the RANGE overflow (confirmed, FIXED 4336caff red-first); Blind Hunter alone the drone mass gap (Eric R17, kept). Full log in `spec-10-3-the-index-model.md`.
- **Amendment number:** this story's amendment is **#8**, not #7 as the pre-dev text says: PR #317 (the 10.4 design sitting) took 7 first; code comments renumbered in d2add61b.
- **Records (wave 3, Sonnet):** amendment 8, `spec-10-3-the-index-model.md`, three new and stamped `deferred-work.md` entries, five DESIGN.md row stamps, VERSION / package.json 0.19.5, both trackers.

### File List

**shared** (29)

- M `shared/src/__tests__/barrel.test.ts`
- M `shared/src/__tests__/boons.test.ts`
- M `shared/src/__tests__/boost.test.ts`
- M `shared/src/__tests__/catalog.test.ts`
- M `shared/src/__tests__/collision.test.ts`
- M `shared/src/__tests__/contact.test.ts`
- M `shared/src/__tests__/damageGuardrail.test.ts`
- M `shared/src/__tests__/draft.test.ts`
- M `shared/src/__tests__/draw.test.ts`
- M `shared/src/__tests__/effects.test.ts`
- M `shared/src/__tests__/hooks.test.ts`
- M `shared/src/__tests__/hullRepair.test.ts`
- M `shared/src/__tests__/ship.test.ts`
- M `shared/src/__tests__/shipClasses.test.ts`
- M `shared/src/__tests__/sight.test.ts`
- M `shared/src/__tests__/sinking.test.ts`
- M `shared/src/__tests__/slow.test.ts`
- M `shared/src/__tests__/stats.test.ts`
- M `shared/src/__tests__/wake.test.ts`
- M `shared/src/constants.ts`
- M `shared/src/index.ts`
- M `shared/src/sim/boons.ts`
- M `shared/src/sim/catalog.ts`
- M `shared/src/sim/draw.ts`
- M `shared/src/sim/effects.ts`
- M `shared/src/sim/hull.ts`
- A `shared/src/sim/indexStats.ts`
- M `shared/src/sim/stats.ts`
- M `shared/src/types.ts`

**server** (50)

- M `server/scripts/batchsim/__tests__/batchSim.test.ts`
- M `server/scripts/batchsim/__tests__/botHarness.test.ts`
- M `server/scripts/batchsim/__tests__/gunFirstSpend.test.ts`
- M `server/scripts/batchsim/__tests__/poolReadouts.test.ts`
- M `server/scripts/batchsim/__tests__/tuneFloor.test.ts`
- M `server/scripts/batchsim/__tests__/tunedRandomSpend.test.ts`
- M `server/scripts/batchsim/__tests__/upgradeEvidence.test.ts`
- M `server/scripts/batchsim/balanceProbe.ts`
- M `server/scripts/batchsim/catalogReport.ts`
- M `server/scripts/batchsim/overrides.ts`
- M `server/scripts/matchSmoke.mjs`
- M `server/scripts/weaponsSmoke.mjs`
- M `server/src/__tests__/__snapshots__/goldenFrames.test.ts.snap`
- M `server/src/__tests__/boons.test.ts`
- M `server/src/__tests__/boost.test.ts`
- M `server/src/__tests__/botPolicy.test.ts`
- M `server/src/__tests__/botPosture.test.ts`
- M `server/src/__tests__/botReviewFixes.test.ts`
- M `server/src/__tests__/botTactics.test.ts`
- M `server/src/__tests__/bots.test.ts`
- M `server/src/__tests__/buoyEffects.test.ts`
- M `server/src/__tests__/contactDamage.test.ts`
- M `server/src/__tests__/damageGate.test.ts`
- M `server/src/__tests__/droneDrops.test.ts`
- M `server/src/__tests__/drones.test.ts`
- M `server/src/__tests__/equipment.test.ts`
- M `server/src/__tests__/goldenFrames.test.ts`
- M `server/src/__tests__/matchRecord.test.ts`
- M `server/src/__tests__/mineBlastLanding.test.ts`
- M `server/src/__tests__/mineHp.test.ts`
- M `server/src/__tests__/mulligan.test.ts`
- M `server/src/__tests__/perception.test.ts`
- M `server/src/__tests__/radarWire.test.ts`
- D `server/src/__tests__/regen.test.ts`
- M `server/src/__tests__/roomOptions.test.ts`
- M `server/src/__tests__/shieldBlock.test.ts`
- M `server/src/__tests__/shift.test.ts`
- M `server/src/__tests__/torpedoSelfHit.test.ts`
- M `server/src/__tests__/upgrades.test.ts`
- M `server/src/__tests__/wakeStore.test.ts`
- M `server/src/__tests__/weapons.test.ts`
- M `server/src/__tests__/weighting.test.ts`
- M `server/src/__tests__/world.test.ts`
- M `server/src/game/ai/plot.ts`
- M `server/src/game/ai/posture.ts`
- M `server/src/game/ai/profiles.ts`
- M `server/src/game/equipment/consumables/hullRepair.ts`
- M `server/src/game/frames.ts`
- M `server/src/game/navCache.ts`
- M `server/src/game/world.ts`

**client** (48)

- M `client/src/__tests__/ambientWake.test.ts`
- M `client/src/__tests__/boonCopy.test.ts`
- M `client/src/__tests__/boonStats.test.ts`
- M `client/src/__tests__/cardStatRows.test.ts`
- M `client/src/__tests__/classSelect.test.ts`
- M `client/src/__tests__/contactBodies.test.ts`
- M `client/src/__tests__/fitCheck.test.ts`
- M `client/src/__tests__/frameOrdering.test.ts`
- M `client/src/__tests__/helmGlobe.test.ts`
- M `client/src/__tests__/hotbar.test.ts`
- M `client/src/__tests__/howToPlay.test.ts`
- M `client/src/__tests__/hpGlobe.test.ts`
- M `client/src/__tests__/keyboard.test.ts`
- M `client/src/__tests__/lineGlyphs.test.ts`
- M `client/src/__tests__/nameplatesAboveTerrain.test.ts`
- M `client/src/__tests__/prediction.test.ts`
- M `client/src/__tests__/refitCardFit.test.ts`
- M `client/src/__tests__/refitFailOpen.test.ts`
- M `client/src/__tests__/refitTooltipFit.test.ts`
- M `client/src/__tests__/results.test.ts`
- M `client/src/__tests__/roomBindings.test.ts`
- M `client/src/__tests__/score.test.ts`
- M `client/src/__tests__/shake.test.ts`
- M `client/src/__tests__/slotTooltip.test.ts`
- M `client/src/__tests__/smoke.test.ts`
- M `client/src/__tests__/tooltipFit.test.ts`
- M `client/src/__tests__/upgradeMenu.test.ts`
- M `client/src/__tests__/wake.test.ts`
- M `client/src/__tests__/weaponTables.test.ts`
- M `client/src/__tests__/xpStrip.test.ts`
- M `client/src/config.ts`
- M `client/src/how-to-play/copy.ts`
- M `client/src/main.ts`
- M `client/src/net/roomBindings.ts`
- M `client/src/render/effects.ts`
- M `client/src/render/equipmentIcons.ts`
- M `client/src/render/equipmentInfo.ts`
- M `client/src/render/hpGlobe.ts`
- M `client/src/render/shake.ts`
- M `client/src/render/wake.ts`
- M `client/src/sim/contactBodies.ts`
- A `client/src/sim/hullKinematics.ts`
- M `client/src/sim/prediction.ts`
- M `client/src/stage/worstCaseScene.ts`
- M `client/src/ui/boonCopy.ts`
- M `client/src/ui/classSelect.ts`
- M `client/src/ui/loadoutBlock.ts`
- A `client/src/util/hullPercent.ts`

**records / planning** (11)

- M `_bmad-output/gds-workflow-status.yaml`
- A `_bmad-output/implementation-artifacts/10-3-the-index-model.md`
- M `_bmad-output/implementation-artifacts/epic-10-context-amendments.md`
- M `_bmad-output/implementation-artifacts/sprint-status.yaml`
- A `_bmad-output/implementation-artifacts/spec-10-3-the-index-model.md`
- M `_bmad-output/implementation-artifacts/deferred-work.md`
- M `_bmad-output/planning-artifacts/ux-designs/ux-Hullcracker.io-2026-07-16/DESIGN.md`
- M `VERSION`
- M `package.json`

(`epic-10-context-amendments.md` also carries PR #317 amendment 7, and the two `planning-artifacts/research/` files arrived with the PR #317 merge, not this story.)

## Change Log

- 2026-11-04 — Story file created (c4ad7e64); ruling 15 applied (cc12e0ec, 1a6196f6).
- 2026-11-04 — Wave 0 behavior-free rename (7e9e9c8d, Opus).
- 2026-11-04 — Wave 1 shared index fold (e6c458ac, Fable).
- 2026-11-04 — Wave 2b client percent and index (284a4e9a, Opus); rendered candidate approved by Eric.
- 2026-11-04 — Wave 2a server tick / gate / mass / bots / harness (277b4ec2, Opus); smokes first-try.
- 2026-11-04 — Review gate: RANGE multiply fails closed (4336caff, Codex finding).
- 2026-11-04 — origin/development merged (4806722d); amendment 7 -> 8 renumber (d2add61b).
- 2026-11-04 — Wave 3 records (Sonnet): amendment 8, spec, deferred-work, DESIGN.md stamps, trackers, 0.19.5; status review.
