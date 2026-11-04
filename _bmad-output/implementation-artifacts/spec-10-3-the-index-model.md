---
title: 'Story 10.3: The Index Model'
type: 'feature'
created: '2026-11-04'
status: 'review'
baseline_revision: 'a2dd70b4'
final_revision: 'see the PR head (code + record on story-10-3-index-model-dev; PR to development)'
review_loop_iteration: 1
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context-amendments.md'
  - '{project-root}/_bmad-output/implementation-artifacts/10-3-the-index-model.md'
---

## Intent

**Problem (Eric's one-line scope):** replace the stat model under the game without changing how it plays: 1000 HP shown as a percent, seven indices folded once, six +20 ship cards, Eric's new damage table, no regen, ARMOR as mass, on today's three hulls and today's one deck gun, so 10.4 can swap hulls and turrets onto a finished floor.

**Approach (epic-10 amendment 8; the story file calls it "#7", PR #317 took 7 first):** every class is 1000 hp and every other stat an index around 100 (ARMOR, POWER, RELOAD, ENGINES, RUDDER, INTEL, RANGE), folded ONCE in `effectiveStats()` and derived into speed / turn rate / sweep RPM / cooldown / gun reach by `sim/indexStats.ts`. POWER replaces ARMOR PIERCING in the 9.9 gate; RELOAD is Eric's haste law; ENGINES is 30 u/s x index / 100; ramming mass is ARMOR with the ram dials divided by ten; regen, HULL POINTS and PASSIVE HEALING are gone; the client shows the hull as a whole-number ceiling percent. Built by `/orchestrate` (wave 0 Opus, wave 1 Fable, waves 2a / 2b Opus in parallel, wave 3 Sonnet; gate Fable x2 + Codex `gpt-5.6-sol`). Cycle 211, 0.19.4 -> 0.19.5, PROTOCOL_VERSION 94 -> 95.

## What changed

### wave 0 - behavior-free rename (Opus, 7e9e9c8d)
- Catalog (`shared/src/sim/catalog.ts`): ladders `armorPiercing / speed / turning / radarSweep` -> `power / engines / rudder / intel` (same seats, same steps), `reload` named; HULL POINTS and PASSIVE HEALING deleted (30 -> 28 lines, 147 -> 137 cards); heal-on-grant gone. `EffectiveStats.armorPiercing` -> `power`; `World.piercingOf` -> `powerOf`.
- Bot `UpgradeFavorite` union (`server/src/game/ai/profiles.ts`), `balanceProbe` universal list, client names / rows / glyphs / loadout / How-to-Play keys and every test follow. `effectiveStats(cls, [])` byte-identical before and after apart from the renamed key. goldenFrames re-recorded (two offer rows move with the line list).

### wave 1 - shared: the fold (Fable, e6c458ac)
- `constants.ts`: `CONFIG.index = { base 100, engines 30, rudder 0.4 }`; every envelope (3 classes, 3 drone sizes) carries `index { armor power reload engines rudder intel range }` and loses `maxSpeed` / `turnRate`; every class hp 1000, drones 135 / 180 / 225 with a 3-damage gun; `CONFIG.regen` deleted; `CONFIG.ram` `energyPerHp` 126.5625 and `grindPerUnit` 20/27 (head-on at 90 closing = 800 of 1000 each); storm 10-50 hp/s; Eric's damage table (torpedo 300 / +75, light 200 / +50, supercav 400, naval 200 / +25, captive 100 / +25, fouling 100 / +25, star 50, phosphor 50 + 20/s, HULL REPAIR 100 + 100, x3 placeholders).
- `sim/indexStats.ts` (new): `deriveIndexStats` (idempotent; baseStats + `rePinDerived` + `clampStats`) derives maxSpeed, turnRate, sweepRpm, cooldownScale; `scaleDeckGunRange` is the one-shot RANGE multiply on the four deck-gun rows. `stats.ts`, `boons.ts`, `effects.ts` (whitelist), `hull.ts`, `draw.ts`, `types.ts` follow; published `damageMultiplier` reads against an average attacker.
- `index.ts`: PV 94 -> 95 with a history note. shared: tsc clean, 1245 tests, lint 0.

### wave 2a - server (Opus, 277b4ec2)
- `world.ts`: out-of-combat regen DELETED (`regenDue`, `tickRegen` -> `tickHeal`; the HULL REPAIR pool and the healing-buoy term keep healing; `lastDamagedAt` kept, now write-only); mass = `stats.armor` in `contactBodyOf` / `damagePair` / `damageLand` (HUNKER adds none); `powerOf(byId)` reads POWER live, `CONFIG.index.base` for a coast / wreck / departed owner.
- Bots (`ai/plot.ts`, `posture.ts`, `profiles.ts`, `navCache.ts`): read the folded kinematics; `peerFactor` and the ram estimate read ARMOR.
- Harness (`server/scripts/batchsim/balanceProbe.ts`, `catalogReport.ts`, `overrides.ts`): `statsBlock` prints the seven indices plus speed / rpm / cdScale / gunRangeU / dmgMult / pierceMult; `--tune shipClasses.<cls>.index.<id>`; the `regen.` family gone; floor 1 on reload / engines / rudder / intel / range; hull figures in percent. `matchSmoke.mjs` / `weaponsSmoke.mjs` kill plans drop the regen term.
- Tests: `regen.test.ts` deleted (note in `damageGate.test.ts`), no-regen / missing-attacker / mass = ARMOR added, pins -> relations, goldenFrames re-recorded (hp 1000, dmg, repairHp, one mine-pop event order). server: tsc clean, 2830 tests, eslint 0.

### wave 2b - client (Opus, 284a4e9a)
- `util/hullPercent.ts` (new): the one percent law (`hp <= 0 ? 0 : max(1, ceil(100 hp / maxHp))`). `render/hpGlobe.ts`: `HULL 72 %` with a 10 px dim `%` glyph (`CLIENT_CONFIG.hudBar.type.hullPercent`); shielded reads hull + shield past 100 in `info`; `hullShownValue` / `hullMaxLabel` / `hullHeaderValue` deleted.
- `ui/boonCopy.ts`: card names ARMOR POWER RELOAD ENGINES RUDDER INTEL; ladders print the bare index; SHIP panel = the seven indices; HULL REPAIR `+10%` / `+10% / 5 S`, SHIELD `ABSORBS 30%`. `ui/classSelect.ts`: pips ENGINES / ARMOR / RUDDER on `{ base 100, step 20 }`. `ui/loadoutBlock.ts`: two rows of three. `equipmentIcons.ts` glyphs follow the ids.
- `sim/hullKinematics.ts` (new): memoises the zero-card fold's kinematics for the wake / effects / predictor seeds. Mass = ARMOR in the predictor, `contactBodies.ts`, `setOwnMass`. Feel knobs x3 (`shake` 45 / 165, `bleedThudMaxHp` 24). How-to-Play entry titles follow the ids; copy FROZEN for 10.14.
- Rendered candidate (five tabs from the real modules) approved by Eric as shown (amendment 8(o)). client: tsc clean, 4181 tests, lint 0.

### gate fix (4336caff)
- `scaleDeckGunRange` fails closed on a non-finite product: a hostile finite RANGE near `MAX_VALUE` passes the fold's positive-finite effect gate and the one-shot multiply alone overflowed every deck-gun reach to Infinity; the unscaled reach now stands. Regression test red first (`stats.test.ts`).

### merge and renumber
- 4806722d merged origin/development (PR #317, the 10.4 design sitting); d2add61b renumbered "amendment 7" to 8 in every code comment.

### wave 3 - records (Sonnet)
- Amendment 8; this spec; deferred-work (three new entries, three stamps); five DESIGN.md row stamps; `VERSION` and root `package.json` 0.19.5; both trackers; the story file's status, task boxes and Dev Agent Record.

## Scaffold arithmetic (today's classes on the index, until 10.4)

| class | hp | ARMOR | POWER | RELOAD | ENGINES (u/s) | RUDDER (rad/s) | INTEL (RPM) | RANGE |
|---|---|---|---|---|---|---|---|---|
| torpedoBoat (SPEEDBOAT) | 1000 | 100 | 100 | 100 | 150 (45) | 200 (0.8) | 100 (15) | 100 |
| battleship (DREADNOUGHT) | 1000 | 100 | 100 | 100 | 117 (35.1) | 100 (0.4) | 100 (15) | 100 |
| mineLayer (REPEATER) | 1000 | 100 | 100 | 100 | 133 (39.9) | 150 (0.6) | 100 (15) | 100 |
| small drone | 135 | 100 | 100 | 100 | 133 | 225 | 100 | 100 |
| medium drone | 180 | 100 | 100 | 100 | 117 | 188 | 100 | 100 |
| large drone | 225 | 100 | 100 | 100 | 100 | 150 | 100 | 100 |

ENGINES base 30 u/s (ruling 15); every other base is the battleship's today. Drone ENGINES / RUDDER are the nearest whole index to 40 / 35 / 30 u/s and 0.9 / 0.75 / 0.6 rad/s (the small drone is the 133 row; drift noted in code, R-B). The 35.1 and 39.9 u/s drifts are whole-number indices of today's 35 and 40.

**Cap consequence, for Eric's harness session (ruling 15; recorded, not softened):** at five cards ARMOR 200 (x0.5 against POWER 100), POWER 200 (x1.5 against ARMOR 100, the negative branch), RELOAD 200 (half cooldowns), INTEL 200 (30 RPM = `sweepRpmMax`), **ENGINES +100 = +30 u/s (battleship 65.1 u/s, speedboat 75; today's SPEED cap was +12.5 u/s) and RUDDER +100**. The ENGINES / RUDDER jump is the price of ruling 4's "+20 flat now"; the law stays linear and the ENGINES card step shrinks at 10.6 (Eric's number then).

## SCAFFOLD - the x3 placeholders (never rulings; 10.4 / 10.5 / 10.8 retire or table them)

CANNON 8 -> 24 per shell (steps +6 / +3 / +3 / +3 -> 39 at V), MACHINE GUN 5 -> 15, FLAK 16 -> 48 (flak steps +6, `contactDamage` 12, gun `contactDamage` 18), BROADSIDE 15 -> 45, SHIELD BLOCK 100 -> 300, PvE drone hulls 45 / 60 / 75 -> 135 / 180 / 225 with a 3-damage gun. Drones keep ARMOR 100 (R17). The new HULL REPAIR / SMOKE tier tracks and the SUPERCAV track are RECORDED in amendment 8(f) and built at 10.5 / 10.6.

## Review Triage Log

### 2026-11-04 - Gate (Fable Blind Hunter + Fable Edge Case Hunter + Codex `gpt-5.6-sol`, per `git diff a2dd70b4..HEAD`)

Verdicts: Blind Hunter FIX-FIRST (1), Edge Case Hunter BUILD-ON-IT, Codex FIX-FIRST (2). Agreement picture and the orchestrator's triage:

- **All three - the client predicts peer mass from the contact's class-base ARMOR while the server reads the folded ARMOR (the 84(j) seam, 2:1 at five ARMOR cards)** -> PRE-EXISTING in kind (it was maxHp vs class hp under HULL POINTS cards); the server wins, bounded by overlap depth, reconciled. Recorded (amendment 8 R-F; deferred-work entry), not fixed: a fix puts a contact's ARMOR on the wire. Eric's call, not proposed.
- **Codex alone (CONFIRMED) - the RANGE multiply overflows**: a hostile finite RANGE near `MAX_VALUE` passes the effect gate and the one-shot multiply sends every deck-gun reach to Infinity -> **FIXED 4336caff**, fail-closed on a non-finite product, regression test shown red first.
- **Blind Hunter alone - drones seeded ARMOR 100**: a head-on ram of a drone at 90 u/s closing now costs the captain 800 of 1000 (it was ~9 % of hull), and bots read drones as equal-mass peers -> Eric (R17): *"I dont care this entire system is changing."* Kept; scaffold, 10.8 retires drones.
- **Gate questions put to Eric (R18, R19):** a 10 hp mine now pops to one cannon (24) or MG (15) shell and a popped naval mine's blast chains a neighbor that used to survive -> *"I dont care this entire system is changing."* (mine hp stays 10); HULL REPAIR pays 20 hp/s so the last storm ring (50 hp/s) out-damages it, and the 225 hp large drone survives a base naval mine (200) -> *"Both OK as ruled."*
- **Edge Case Hunter notes (harness only, recorded):** RELOAD index 1 gives cooldownScale 100 (no ceiling, unreachable by the catalog); `--tune armor=0` on both hulls switches contact damage off (`pairIsPriceable` false); `FASTEST_HULL_SPEED` and `FIELD_MARGIN_U` are module-level and do not see `--tune shipClasses.*.index.engines` (bounded bot heuristics) - deferred-work entry.
- **Blind Hunter note (cosmetic):** the ceiling percent against the globe's band thresholds can print "25 %" in two bands at the edge; Eric approved the ceiling (ruling 13).
- **Traced clean by all three:** desync (both sides fold identically, product-first), idempotence, the whitelist, the gate default, the smokes, goldenFrames (no new wire field, the SIX exceptions six).

## Verification

| Check | Result |
|---|---|
| `npm run check` | EXIT 0 on 277b4ec2 (wave 2a head); the one-line gate fix 4336caff verified by shared tsc + `stats.test.ts` 109/109 + lint |
| shared / server / client / hook | 1216 -> 1246 (1245 at wave 1, +1 gate test) / 2846 -> 2830 (`regen.test.ts` deleted, new tests added) / 4180 -> 4181 / 266 |
| `matchSmoke` first-try | OK (wall 82.8 s; 3 heavy torpedoes of 450 sink 1000 hp, no regen) |
| `weaponsSmoke` first-try | OK (wall 187.5 s; torpedo 300/450, light 200/300, mine 200, captive 100, cannon 24, MG 15, flak 48 all landed) |
| goldenFrames | re-recorded twice with dated header notes (wave 0: offer rows; wave 2a: hp 1000, dmg amounts, repairHp, one mine-pop event order); no new wire field |
| Rendered candidate | approved by Eric 2026-11-04, "as shown" (amendment 8(o)) |

## Residual risks

- **Peer-mass seam:** the predictor's contact mass (class-base ARMOR) vs the server's folded ARMOR reaches 2:1 at five ARMOR cards; a snap on a shove, bounded by overlap depth.
- **Mine one-shell pop:** cannon 24 / MG 15 pop a 10 hp mine in one shell and the chain reaches a neighbor that used to survive; 10.4's secondaries re-rule it (R18).
- **Heal vs storm:** HULL REPAIR's 20 hp/s is out-damaged by the last ring (50 hp/s); ruled OK (R19).
- **Drone mass:** a head-on ram of a drone costs 800 of 1000; 10.8 retires drones (R17).
- **ENGINES / RUDDER cap jump:** +100 at five cards (battleship 65.1 u/s, speedboat 75) is for Eric's harness session; the ENGINES card step shrinks at 10.6.
- **Stale How-to-Play:** `client/src/how-to-play/copy.ts:92` still says "You slowly regenerate HP..." and no ARMOR / POWER entries exist; frozen for 10.14.
- **Whole-number scaffold drift:** battleship 35.1 u/s and mine-layer 39.9 u/s (indices 117 / 133) instead of 35 / 40.
- **Full UI / UX pass owed:** Eric wants a fresh in-game UI / UX pass in full; SHIELD BLOCK is going away (R16).

## Owed to Story 10.14

- How-to-Play: the regen sentence, the HULL REPAIR / HP sentences, ARMOR / POWER / index entries.
- GDD "Flat damage model" / "Ship classes" sentences and catalog-v3's remaining rows: dated supersession stamps.
